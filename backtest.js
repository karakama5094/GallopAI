import {workoutDateAudit} from './prediction-time.js';
import {predictRace,preRaceRows,PREDICTION_VERSION} from './prediction.js';
import {uniqueResults,resultOf,raceKey} from './aptitude.js';

export function wilson(hits,n){
  if(!n)return null;
  const z=1.959964,p=hits/n,d=1+z*z/n,m=(p+z*z/(2*n))/d,e=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [Math.max(0,m-e),Math.min(1,m+e)];
}
export async function backtestRaces(dataset,onProgress=()=>{}){
  const races=uniqueResults(dataset),rows=[],skipped=[];
  for(let i=0;i<races.length;i++){
    const r=races[i];
    onProgress(i+1,races.length);await new Promise(resolve=>setTimeout(resolve,0));
    try{
      if(!workoutDateAudit(r).eligible)throw new Error('調教日が未登録・不正、またはレース当日以降のため時系列検証から除外しました。');
      // Each race has its own historical cutoff, feature aggregates, fitting and validation.
      // No closing popularity is supplied to the mark selector.
      const p=predictRace(r,races.filter(x=>x.meta.date<r.meta.date));
      const byNumber=new Map(r.horses.map(h=>[h.number,resultOf(h).finish]));
      const marks=p.selections.map(s=>({...s,finish:s.number==null?null:byNumber.get(s.number)}));
      const baseline=preRaceRows(r).map(h=>({number:h.number,score:h.x.slice(0,4).reduce((sum,v,j)=>sum+v*[.55,.2,.2,.05][j],0)})).sort((a,b)=>b.score-a.score||a.number-b.number)[0];
      // Closing popularity is read only AFTER prediction, for a descriptive benchmark.
      const popularities=r.horses.map(h=>resultOf(h).popularity);
      const validPopularity=popularities.every(v=>Number.isInteger(v)&&v>=1&&v<=r.horses.length)&&new Set(popularities).size===r.horses.length;
      const favorite=validPopularity?r.horses.find(h=>resultOf(h).popularity===1):null;
      rows.push({favoriteNumber:favorite?.number??null,favoriteFinish:favorite?byNumber.get(favorite.number):null,race:raceKey(r),date:r.meta.date,name:r.meta.raceName||'',mode:p.mode,historyCount:p.historyCount,marks,baselineFinish:byNumber.get(baseline.number),baselineNumber:baseline.number});
    }catch(e){skipped.push({race:raceKey(r),reason:e.message});}
  }
  const marks=Object.fromEntries(['◎','○','▲','△','×','★'].map(mark=>{
    const selected=rows.map(r=>r.marks.find(m=>m.mark===mark)).filter(m=>m?.finish!=null),wins=selected.filter(m=>m.finish===1).length,top3=selected.filter(m=>m.finish<=3).length,n=selected.length;
    return [mark,{selected:n,wins,top3,winRate:n?wins/n:null,top3Rate:n?top3/n:null,winInterval95:wilson(wins,n)}];
  }));
  const summarize=finishes=>{
    const races=finishes.length,wins=finishes.filter(f=>f===1).length,top3=finishes.filter(f=>f<=3).length;
    return {races,wins,top3,winRate:races?wins/races:null,top3Rate:races?top3/races:null,winInterval95:wilson(wins,races)};
  };
  const paired=rows.filter(r=>r.favoriteNumber!==null);
  const favoriteComparison={source:'結果PDFの確定人気（予想入力には使用しない）',pairedRaces:paired.length,missingOrInvalidPopularity:rows.length-paired.length,
    model:summarize(paired.map(r=>r.marks.find(m=>m.mark==='◎').finish)),favorite:summarize(paired.map(r=>r.favoriteFinish)),
    caveat:'当時の事前人気は保存されていません。確定1番人気との事後比較であり、事前人気を使う運用の再現ではありません。'};
  const modes=Object.fromEntries(['provisional','learned'].map(mode=>{const group=rows.filter(r=>r.mode===mode);return [mode,{races:group.length,wins:group.filter(r=>r.marks.find(m=>m.mark==='◎').finish===1).length}];}));
  return {favoriteComparison,roi:{available:false,reason:'買い目・購入額・実払戻の記録がそろっていないため算出しません。'},version:PREDICTION_VERSION,createdAt:new Date().toISOString(),inputRecords:dataset.length,uniqueCompleteResults:races.length,excludedIncompleteOrDuplicate:dataset.length-races.length,evaluated:rows.length,skipped,rows,marks,modes,baseline:{races:rows.length,wins:rows.filter(r=>r.baselineFinish===1).length},limitations:['保存済みPDFの事後検証です。レース前に確定・記録した予想の成績ではありません。','結果不完全・未完走を含むレース・入力不足・調教日不明/当日以降は除外します。保存・除外による偏りがあります。','△・×は当時の人気が保存されていないため検証対象外です。確定人気を流用しません。','3着内率は複勝的中率ではありません。払戻・回収率は算出していません。','調教日は月日しかない場合に年を補います。PDFの公開・取得が発走前だったことまでは証明できません。',
    '95%区間は二項近似の目安です。レース間の独立性や一般的な精度を保証しません。']};
}

