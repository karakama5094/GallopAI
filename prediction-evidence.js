import {predictionWorkout} from './prediction-time.js';
import {trainingSummary,acceleration} from './engine.js';

export const EVIDENCE_FIELDS=['RT','最終1F','急加速力','調教本数','血統（父産駒）','騎手実績','距離実績'];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const entry=h=>h?.ability||h?.raw?.targetText||h?.rawSources?.targetText;
const factorKeys=['pedigree','jockey','distance'];
const dates=sessions=>[...new Set(sessions.map(s=>s.date||'日付不明'))];
const sessionText=s=>`${s.date||'日付不明'} / ${s.course||'コース不明'}`;

export function leaderScoreGap(prediction){
  const [first,second]=prediction?.ranked||[];
  return finite(first?.score)&&finite(second?.score)?{first:first.number,second:second.number,value:first.score-second.score}:null;
}

// Presentation only: values, weights and order come from the existing prediction snapshot.
// Never call predictRace, rebuild history, fill missing features or alter any input here.
export function buildPredictionEvidence(race,prediction){
  const ranked=prediction?.ranked||[];
  return ranked.map(row=>{
    const horse=(race?.horses||[]).find(h=>h.number===row.number);
    const a=entry(horse),workout=horse?predictionWorkout(horse):null,summary=trainingSummary(workout);
    const timed=(workout?.sessions||[]).filter(s=>s.times?.length),current=timed.filter(s=>!s.prev);
    const latest=current.at(-1)||timed.at(-1),fallback=!!latest&&!current.length;
    const used=current.length?current:timed.slice(-1);
    const warnings=[];
    if(fallback)warnings.push('今回の時計がなく、前回の最終1Fを使用しています。');
    if(used.some(s=>!s.course))warnings.push('コース不明の調教があります。コースを推定せず、算出可能な項目だけ使用しています。');
    if(used.some(s=>!s.date))warnings.push('使用する調教時計の日付が不明です。');
    if(used.some(s=>s.recoveredFromNote))warnings.push('備考に残る明示的な時計列から再構成した値を使用しています。');
    const visibleValues=row.values||[];
    const expected=[a?.rt,summary.latest1F==null?null:-summary.latest1F,summary.maxCurrent,summary.currentCount];
    const sourceMatches=!!horse&&visibleValues.slice(0,4).every((v,j)=>!finite(v)||(finite(expected[j])&&Math.abs(v-expected[j])<1e-9));
    if(!sourceMatches)warnings.push('入力と予想作成時の値が一致しません。調教日などの根拠は確認できないため、予想を再作成してください。');
    const features=EVIDENCE_FIELDS.map((name,j)=>{
      const value=finite(visibleValues[j])?visibleValues[j]:null;
      const contribution=finite(row.x?.[j])&&finite(prediction?.weights?.[j])?row.x[j]*prediction.weights[j]:null;
      let reason='',source='';
      if(j===0){
        source='出走表のRT';
        if(value===null)reason=a?.rt==null?'RTが未登録です。':!finite(a.rt)?'RTが数値として登録されていません。':'RTが現行の採用範囲外です。';
      }else if(j===1){
        source=sourceMatches&&latest?`${fallback?'前回':'今回'} ${sessionText(latest)}`:'使用時計の根拠を確認できません';
        if(value===null)reason=!latest?'使える調教時計がありません。':'最終1Fが現行の採用範囲外です。';
      }else if(j===2){
        const best=finite(summary.maxCurrent)?current.filter(s=>acceleration(s)===summary.maxCurrent):[];
        source=sourceMatches&&best.length?`今回の最大値：${best.map(sessionText).join('、')}`:'今回の調教';
        if(value===null)reason=!current.length?'今回の時計がありません。':!finite(summary.maxCurrent)?'コース不明・非対応、または必要な区間時計が不足しています。':'急加速力が現行の採用範囲外です。';
      }else if(j===3){
        source=sourceMatches?`今回の時計あり：${dates(current).join('、')||'なし'}`:'使用時計の根拠を確認できません';
        if(value===null)reason=!current.length?'今回の時計がありません。':'調教本数が現行の採用範囲外です。';
      }else{
        const f=row.aptitude?.[factorKeys[j-4]];
        source=f?`${j===5?'同馬場':j===4?'同馬場・距離±200m':'同馬場・同じ馬・距離±200m'} / 対象日より前の実績：${f.starts}出走中${f.top3}回が3着以内`:'過去実績を確認できません';
        if(value===null)reason=f?.status==='識別情報不足'?'識別情報または距離情報が不足しています。':f?.status==='過去実績3件未満'?'過去実績が3件未満で算出できません。':'過去実績が不足しています。';
      }
      let zeroReason='';
      if(value!==null&&row.x?.[j]===0){
        const valid=ranked.map(r=>r.values?.[j]).filter(finite);
        if(valid.length<2)zeroReason='比較できる有効値が1頭分のみのため寄与0。';
        else{const mean=valid.reduce((s,v)=>s+v,0)/valid.length,sd=Math.sqrt(valid.reduce((s,v)=>s+(v-mean)**2,0)/valid.length);
          zeroReason=sd<=1e-8?'有効値に比較できる差がないため寄与0。':'レース平均相当のため寄与0。';}
      }
      return {name,available:value!==null,value,displayValue:j===1&&value!==null?-value:value,unit:j===1?'秒':j===3?'本':'',contribution,reason,source,zeroReason};
    });
    return {number:row.number,availableCount:features.filter(f=>f.available).length,features,warnings,sourceMatches,
      latest:sourceMatches&&latest?{date:latest.date||null,course:latest.course||null,kind:fallback?'前回':'今回',recovered:!!latest.recoveredFromNote}:null,
      currentDates:sourceMatches?dates(current):[],fallback};
  });
}
