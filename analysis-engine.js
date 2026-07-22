import {featureDictionary,FEATURE_SCHEMA_VERSION,MIN_RACES_FOR_ML} from './feature-store.js';

const finite=v=>v!=null&&Number.isFinite(Number(v));
const values=a=>(a||[]).filter(finite).map(Number);
const mean=a=>{const x=values(a);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null;};
const variance=a=>{const x=values(a);if(x.length<2)return null;const m=mean(x);return x.reduce((s,v)=>s+(v-m)**2,0)/(x.length-1);};
const sd=a=>{const v=variance(a);return v==null?null:Math.sqrt(v);};
const quantile=(a,q)=>{const x=values(a).sort((m,n)=>m-n);if(!x.length)return null;const p=(x.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(p-lo);};
const pearson=(x,y)=>{if(x.length<5||x.length!==y.length)return null;const mx=mean(x),my=mean(y),sx=sd(x),sy=sd(y);if(!sx||!sy)return null;return x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/((x.length-1)*sx*sy);};
const round=(v,d=4)=>v==null?null:Math.round(v*10**d)/10**d;
const pct=v=>v==null?null:Math.round(v*1000)/10;

function rowsFromRaces(races){
 const rows=[];
 for(const race of races||[])for(const h of race.horses||[]){
  const f=h.features||h.feature?.values||{};
  rows.push({raceId:race.raceId,horseNo:h.number,name:h.name,ocr:h.ocr||null,quality:h.quality||null,finish:f.finish_position??h.result?.finish??null,win:f.win_flag??(h.result?.finish===1?1:0),place:f.place_flag??(h.result?.finish&&h.result.finish<=3?1:0),...f});
 }
 return rows;
}

function histogram(a,bins=8){
 const x=values(a);if(!x.length)return[];const lo=Math.min(...x),hi=Math.max(...x);if(lo===hi)return[{from:lo,to:hi,count:x.length}];
 const width=(hi-lo)/bins,out=Array.from({length:bins},(_,i)=>({from:lo+i*width,to:i===bins-1?hi:lo+(i+1)*width,count:0}));
 for(const v of x){const i=Math.min(bins-1,Math.floor((v-lo)/width));out[i].count++;}
 return out.map(b=>({...b,from:round(b.from),to:round(b.to)}));
}

export function buildFeatureStatistics(races){
 const rows=rowsFromRaces(races),dict=featureDictionary().filter(d=>d.availablePreRace),stats=[];
 for(const d of dict){
  const a=rows.map(r=>r[d.key]),x=values(a);
  stats.push({FeatureID:d.FeatureID,key:d.key,名称:d.名称,group:d.group,count:x.length,missingCount:rows.length-x.length,coverage:rows.length?x.length/rows.length:null,mean:mean(x),median:quantile(x,.5),variance:variance(x),sd:sd(x),min:x.length?Math.min(...x):null,max:x.length?Math.max(...x):null,q25:quantile(x,.25),q75:quantile(x,.75),distribution:histogram(x)});
 }
 return{version:'3.3.2',featureSchemaVersion:FEATURE_SCHEMA_VERSION,generatedAt:new Date().toISOString(),raceCount:new Set((races||[]).map(r=>r.raceId)).size,horseCount:rows.length,featureCount:dict.length,statistics:stats,topCoverage:[...stats].sort((a,b)=>(b.coverage||0)-(a.coverage||0)).slice(0,30),topVariance:[...stats].filter(x=>x.variance!=null).sort((a,b)=>b.variance-a.variance).slice(0,30)};
}

export function buildTrainingStatistics(races){
 const rows=rowsFromRaces(races),completed=rows.filter(r=>finite(r.finish)),dict=featureDictionary().filter(d=>d.availablePreRace),correlations=[];
 for(const d of dict){
  const pairs=completed.filter(r=>finite(r[d.key])&&finite(r.finish));if(pairs.length<5)continue;
  const x=pairs.map(r=>Number(r[d.key])),finish=pairs.map(r=>Number(r.finish)),place=pairs.map(r=>Number(r.place||0)),win=pairs.map(r=>Number(r.win||0));
  correlations.push({feature:d.key,名称:d.名称,group:d.group,n:pairs.length,finishCorrelation:pearson(x,finish),placeCorrelation:pearson(x,place),winCorrelation:pearson(x,win)});
 }
 correlations.sort((a,b)=>Math.abs(b.placeCorrelation||0)-Math.abs(a.placeCorrelation||0));
 const rankings=[];
 for(const d of dict){
  const x=completed.filter(r=>finite(r[d.key])&&finite(r.place));if(x.length<8)continue;
  const sorted=[...x].sort((a,b)=>Number(b[d.key])-Number(a[d.key])),topN=Math.max(2,Math.floor(sorted.length*.25)),top=sorted.slice(0,topN),rest=sorted.slice(topN),topPlace=mean(top.map(r=>Number(r.place))),restPlace=mean(rest.map(r=>Number(r.place)));
  rankings.push({feature:d.key,名称:d.名称,group:d.group,n:x.length,topN,topPlaceRate:topPlace,restPlaceRate:restPlace,lift:restPlace?topPlace/restPlace:null,difference:topPlace-restPlace});
 }
 rankings.sort((a,b)=>Math.abs(b.difference||0)-Math.abs(a.difference||0));
 const accel=completed.filter(r=>finite(r.accel_current_max)),bands=[
  {label:'0.5以上',filter:r=>r.accel_current_max>=.5},{label:'0.0〜0.4',filter:r=>r.accel_current_max>=0&&r.accel_current_max<.5},{label:'-0.5〜-0.1',filter:r=>r.accel_current_max>=-.5&&r.accel_current_max<0},{label:'-0.6以下',filter:r=>r.accel_current_max<-.5}
 ].map(b=>{const x=accel.filter(b.filter);return{label:b.label,n:x.length,winRate:x.length?mean(x.map(r=>r.win)):null,placeRate:x.length?mean(x.map(r=>r.place)):null,avgFinish:x.length?mean(x.map(r=>r.finish)):null};});
 const raceCount=new Set((races||[]).map(r=>r.raceId)).size;
 return{version:'3.3.2',featureSchemaVersion:FEATURE_SCHEMA_VERSION,generatedAt:new Date().toISOString(),raceCount,horseCount:rows.length,resultCount:completed.length,mode:raceCount<MIN_RACES_FOR_ML?'RULE_STATISTICS_ONLY':'STATISTICAL_REVIEW_REQUIRED',machineLearningEnabled:false,minRaceCountForML:MIN_RACES_FOR_ML,correlations:correlations.slice(0,50),featureRankings:rankings.slice(0,50),accelerationBands:bands,warnings:[...(completed.length<100?['結果登録馬が100頭未満のため、相関値は参考表示です。']:[]),...(raceCount<MIN_RACES_FOR_ML?[`${MIN_RACES_FOR_ML}レース到達までは機械学習を実行しません。`]:['50レース到達後も、時系列分割とデータ漏洩監査が完了するまで学習を開始しません。'])]};
}

export function buildOcrStatistics(races){
 const rows=rowsFromRaces(races),ocr=rows.map(r=>r.ocr).filter(Boolean),scores=ocr.map(x=>x.confidence),quality=rows.map(r=>r.quality?.qualityScore).filter(finite);
 const bands=[{label:'90%以上',lo:.9,hi:1.01},{label:'70〜89%',lo:.7,hi:.9},{label:'50〜69%',lo:.5,hi:.7},{label:'50%未満',lo:0,hi:.5}].map(b=>({label:b.label,count:scores.filter(v=>v>=b.lo&&v<b.hi).length}));
 return{version:'3.3.2',generatedAt:new Date().toISOString(),horseCount:rows.length,ocrRecordedCount:ocr.length,meanConfidence:mean(scores),medianConfidence:quantile(scores,.5),minConfidence:scores.length?Math.min(...scores):null,qualityScoreMean:mean(quality),bands,methodBreakdown:Object.entries(ocr.reduce((m,x)=>(m[x.method||'unknown']=(m[x.method||'unknown']||0)+1,m),{})).map(([method,count])=>({method,count}))};
}

export function buildQualityStatistics(races){
 const rows=rowsFromRaces(races),records=rows.map(r=>r.quality).filter(Boolean),scores=records.map(x=>x.qualityScore),scoreValues=values(scores),missing=records.map(x=>x.missingCount),warnings=records.map(x=>x.warningCount??(x.warning||[]).length),errors=records.map(x=>x.errorCount),types=records.map(x=>x.typeErrorCount),abnormal=records.map(x=>x.abnormalCount);
 const statuses=records.reduce((m,x)=>(m[x.validationStatus||'UNKNOWN']=(m[x.validationStatus||'UNKNOWN']||0)+1,m),{});
 return{version:'3.3.2',generatedAt:new Date().toISOString(),horseCount:rows.length,qualityRecordedCount:records.length,meanQualityScore:mean(scores),medianQualityScore:quantile(scores,.5),minQualityScore:scoreValues.length?Math.min(...scoreValues):null,totalMissing:values(missing).reduce((a,b)=>a+b,0),meanMissing:mean(missing),duplicateHorseCount:records.filter(x=>x.duplicateFlag).length,totalWarnings:values(warnings).reduce((a,b)=>a+b,0),totalErrors:values(errors).reduce((a,b)=>a+b,0),totalTypeErrors:values(types).reduce((a,b)=>a+b,0),totalAbnormal:values(abnormal).reduce((a,b)=>a+b,0),statusBreakdown:Object.entries(statuses).map(([status,count])=>({status,count}))};
}

export function buildResearchAnalysis(races){
 const training=buildTrainingStatistics(races),features=buildFeatureStatistics(races),ocr=buildOcrStatistics(races),quality=buildQualityStatistics(races),raceCount=training.raceCount;
 return{version:'3.3.2',generatedAt:new Date().toISOString(),raceCount,horseCount:features.horseCount,machineLearning:{enabled:false,minRaceCount:MIN_RACES_FOR_ML,status:raceCount<MIN_RACES_FOR_ML?'LOCKED_BY_RACE_COUNT':'LOCKED_PENDING_AUDIT'},training,features,ocr,quality};
}

export function formatPercent(v){return v==null?'-':`${pct(v)}%`;}
