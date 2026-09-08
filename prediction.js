import {trainingSummary} from './engine.js';

export const PREDICTION_VERSION='1.0.0';
export const MIN_TRAINING_RACES=50;
const fields=['RT','最終1F','急加速力','調教本数'];
const prior=[.55,.2,.2,.05];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const key=r=>`${r.meta?.date}|${r.meta?.venue}|${r.meta?.raceNo}`;
const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const entry=h=>h.ability||h.raw?.targetText||h.rawSources?.targetText;
const workout=h=>h.training||h.raw?.trainingPdf||h.rawSources?.trainingPdf;
const result=h=>h.result||h.raw?.resultCsv||h.rawSources?.resultCsv;
// Strict allowlist. Never read basic, features, trainingSummary or result-derived fallbacks.
export function preRaceRows(race){
  const rows=(race.horses||[]).map(h=>{
    const a=entry(h),t=workout(h),s=trainingSummary(t);
    const values=[a?.rt,s.latest1F==null?null:-s.latest1F,s.maxCurrent,s.currentCount];
    values[0]=finite(values[0])&&values[0]>0&&values[0]<150?values[0]:null;
    values[1]=finite(values[1])&&values[1]<-8&&values[1]>-25?values[1]:null;
    values[2]=finite(values[2])&&Math.abs(values[2])<10?values[2]:null;
    values[3]=finite(values[3])&&values[3]>0&&values[3]<100?values[3]:null;
    return {number:h.number,name:a?.name||h.name,values,complete:!!a&&!!t&&values.filter(finite).length>=2};
  });
  for(let j=0;j<fields.length;j++){
    const v=rows.map(r=>r.values[j]).filter(finite),mean=v.reduce((a,b)=>a+b,0)/(v.length||1);
    const sd=Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/(v.length||1));
    rows.forEach(r=>{(r.x||=[])[j]=finite(r.values[j])&&sd>1e-8?Math.max(-3,Math.min(3,(r.values[j]-mean)/sd)):0;});
  }
  return rows;
}
const dot=(x,w)=>x.reduce((s,v,i)=>s+v*w[i],0);
const softmax=s=>{const max=Math.max(...s),e=s.map(v=>Math.exp(v-max)),sum=e.reduce((a,b)=>a+b,0);return e.map(v=>v/sum);};
function fit(examples){
  const w=[0,0,0,0];
  for(let epoch=0;epoch<160;epoch++){
    const g=w.map(v=>.03*v);
    for(const e of examples){
      const p=softmax(e.rows.map(r=>dot(r.x,w)));
      e.rows.forEach((r,i)=>r.x.forEach((v,j)=>{g[j]+=(p[i]-(e.winners.includes(r.number)?1/e.winners.length:0))*v/examples.length;}));
    }
    w.forEach((v,j)=>{w[j]=v-.15*g[j];});
  }
  return w;
}
function measure(examples,w){
  let hits=0,loss=0;
  for(const e of examples){
    const p=softmax(e.rows.map(r=>dot(r.x,w))),top=p.indexOf(Math.max(...p));
    hits+=e.winners.includes(e.rows[top].number)?1:0;
    loss-=e.rows.reduce((s,r,i)=>s+(e.winners.includes(r.number)?Math.log(Math.max(p[i],1e-12))/e.winners.length:0),0);
  }
  return {races:examples.length,topHitRate:hits/examples.length,logLoss:loss/examples.length};
}
export function predictRace(target,history=[],popularity={}){
  if(!dateOK(target?.meta?.date)||!target.meta.venue||!target.meta.raceNo)throw new Error('予想対象の日付・競馬場・レース番号が必要です。');
  const rows=preRaceRows(target);
  if(rows.length<2||rows.some(r=>!r.complete)||new Set(rows.map(r=>r.number)).size!==rows.length)throw new Error('全頭の出走表PDF・調教PDFを読み込んでください。RTまたは調教時計などの評価項目が不足している馬は予想できません。');
  const seen=new Set(),examples=[];
  for(const r of history){
    if(!dateOK(r.meta?.date)||!r.meta.venue||!r.meta.raceNo||r.meta.date>=target.meta.date||key(r)===key(target)||seen.has(key(r)))continue;
    if(!target.meta.surface||r.meta.surface!==target.meta.surface)continue;
    const rr=preRaceRows(r),winners=(r.horses||[]).filter(h=>result(h)?.finish===1).map(h=>h.number);
    if(rr.length<2||rr.some(h=>!h.complete)||!winners.length||new Set(rr.map(h=>h.number)).size!==rr.length)continue;
    if(r.horses.some(h=>!Number.isInteger(result(h)?.finish)||result(h).finish<1||result(h).finish>rr.length))continue;
    seen.add(key(r));examples.push({id:key(r),date:r.meta.date,rows:rr,winners});
  }
  examples.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  let weights=prior,mode='provisional',validation=null,reason=`有効な過去レースが${examples.length}件です。50件以上で時系列検証します。`;
  if(examples.length>=MIN_TRAINING_RACES){
    const boundary=examples[Math.floor(examples.length*.8)].date;
    const train=examples.filter(e=>e.date<boundary),test=examples.filter(e=>e.date>=boundary);
    if(train.length>=30&&test.length>=10){
      const learned=fit(train),model=measure(test,learned),baseline=measure(test,prior);
      validation={trainRaces:train.length,testFrom:boundary,model,baseline};
      if(model.logLoss<baseline.logLoss&&model.topHitRate>=baseline.topHitRate){weights=fit(examples);mode='learned';reason='後半の未学習レースで暫定評価以上の成績を確認しました。ただし今後の的中を保証しません。';}
      else reason='時系列検証で暫定評価を上回る条件を満たさなかったため、学習モデルは採用していません。';
    }else reason='同日データを分けずに検証するための日付・件数が不足しています。';
  }
  const ranked=rows.map(r=>({...r,score:dot(r.x,weights),reasons:r.x.map((v,i)=>({name:fields[i],value:r.values[i],contribution:v*weights[i]})).filter(x=>finite(x.value)).sort((a,b)=>b.contribution-a.contribution)})).sort((a,b)=>b.score-a.score||a.number-b.number);
  const selections=[],used=new Set();
  const add=(mark,label,r,note)=>{if(r){used.add(r.number);selections.push({mark,label,number:r.number,name:r.name,note});}else selections.push({mark,label,number:null,name:'選定保留',note});};
  add('◎','本命',ranked[0],'総合評価1位');add('○','対抗',ranked[1],'総合評価2位');add('▲','単穴',ranked[2],'総合評価3位');
  const ranks=rows.map(r=>Number(popularity[r.number]));
  const popularityComplete=ranks.every(v=>Number.isInteger(v)&&v>=1&&v<=rows.length)&&new Set(ranks).size===rows.length;
  const remaining=()=>ranked.filter(r=>!used.has(r.number));
  const holes=()=>remaining().filter(r=>popularityComplete&&Number(popularity[r.number])>=Math.max(4,Math.ceil(rows.length/2)));
  add('△','複穴',holes()[0],popularityComplete?'人気下位群の総合評価上位。複勝確率ではありません。':'予想時点の全頭の人気を入力してください。');
  add('×','大穴',remaining().find(r=>popularityComplete&&Number(popularity[r.number])>=Math.max(7,Math.ceil(rows.length*.7))),popularityComplete?'人気下位約30%から選定。':'予想時点の全頭の人気を入力してください。');
  const surprise=remaining().filter(r=>r.x[1]>0&&r.x[2]>0).sort((a,b)=>(b.x[1]+b.x[2])-(a.x[1]+a.x[2]));
  add('★','激走馬',surprise[0],'今回の最終1Fと急加速力がともに出走馬平均より上。該当馬なしの場合は保留。');
  return {version:PREDICTION_VERSION,race:key(target),mode,reason,historyCount:examples.length,trainingRaceIds:examples.map(e=>e.id),validation,weights,ranked,selections,popularityComplete,createdAt:new Date().toISOString(),warning:'評価指数は勝率ではありません。暫定評価は手動設定の重みです。調教コース差・距離適性・騎手成績・血統適性は未モデル化。結果PDFの人気や確定オッズは使用しません。'};
}
