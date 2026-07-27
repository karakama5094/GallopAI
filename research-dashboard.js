export const RESEARCH_RACE_TARGET=50;

const numeric=value=>value!==null&&value!==""&&Number.isFinite(Number(value));
const number=value=>numeric(value)?Number(value):0;
const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const percentage=(count,total)=>total?Math.round(count/total*1000)/10:0;
const timestamp=value=>{
  if(!value)return null;
  if(typeof value?.toDate==="function")return value.toDate().toISOString();
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date.toISOString();
};

function lastRecalculation(horse){
  const history=Array.isArray(horse.logs?.recalculateHistory)?horse.logs.recalculateHistory:[];
  return [
    horse.logs?.updatedAt,
    horse.logs?.calculatedAt,
    ...history.map(item=>item?.at)
  ].map(timestamp).filter(Boolean).sort().at(-1)||null;
}

function distribution(items,total){
  return items.map(item=>({...item,percentage:percentage(item.count,total)}));
}

function issueMessages(quality){
  return [...new Set([
    ...(Array.isArray(quality?.issues)?quality.issues.map(issue=>typeof issue==="string"?issue:issue?.message||issue?.code):[]),
    ...(Array.isArray(quality?.warning)?quality.warning:[])
  ].filter(Boolean).map(String))];
}

export function buildQualityDetails(races=[]){
  const rows=[];
  for(const race of races)for(const horse of race.horses||[]){
    const quality=horse.quality||{},ocr=horse.ocr||{},messages=issueMessages(quality);
    const warningCount=number(quality.warningCount??quality.warning?.length);
    const errorCount=number(quality.errorCount);
    const row={
      raceId:race.raceId||"",
      raceDate:race.meta?.date||race.date||"",
      raceName:race.meta?.raceName||race.raceName||race.raceId||"",
      horseNumber:horse.number??horse.raw?.merged?.number??horse.horseKey??"",
      horseName:horse.name||horse.raw?.merged?.name||"",
      qualityScore:numeric(quality.qualityScore)?Number(quality.qualityScore):null,
      ocrConfidence:numeric(ocr.confidence)?Number(ocr.confidence):null,
      validationStatus:String(quality.validationStatus||"UNREGISTERED").toUpperCase(),
      missingCount:number(quality.missingCount),
      warningCount,
      errorCount,
      typeErrorCount:number(quality.typeErrorCount),
      abnormalCount:number(quality.abnormalCount),
      duplicateFlag:quality.duplicateFlag===true,
      issueMessages:messages
    };
    row.hasIssues=row.missingCount+warningCount+errorCount+row.typeErrorCount+row.abnormalCount>0||row.duplicateFlag||messages.length>0||!["PASS","UNREGISTERED"].includes(row.validationStatus);
    rows.push(row);
  }
  const total=rows.length,qualityScores=rows.map(row=>row.qualityScore),ocrScores=rows.map(row=>row.ocrConfidence);
  const qualityDistribution=distribution([
    {label:"90–100",count:qualityScores.filter(score=>score!==null&&score>=90&&score<=100).length},
    {label:"80–89",count:qualityScores.filter(score=>score!==null&&score>=80&&score<90).length},
    {label:"70–79",count:qualityScores.filter(score=>score!==null&&score>=70&&score<80).length},
    {label:"70未満",count:qualityScores.filter(score=>score!==null&&score<70).length}
  ],total);
  const ocrDistribution=distribution([
    {label:"90–100%",count:ocrScores.filter(score=>score!==null&&score>=.9&&score<=1).length},
    {label:"80–89%",count:ocrScores.filter(score=>score!==null&&score>=.8&&score<.9).length},
    {label:"70–79%",count:ocrScores.filter(score=>score!==null&&score>=.7&&score<.8).length},
    {label:"70%未満",count:ocrScores.filter(score=>score!==null&&score<.7).length},
    {label:"未登録",count:ocrScores.filter(score=>score===null).length}
  ],total);
  return{
    qualityDistribution,
    ocrDistribution,
    issueTotals:{
      missingCount:rows.reduce((sum,row)=>sum+row.missingCount,0),
      warningCount:rows.reduce((sum,row)=>sum+row.warningCount,0),
      errorCount:rows.reduce((sum,row)=>sum+row.errorCount,0),
      typeErrorCount:rows.reduce((sum,row)=>sum+row.typeErrorCount,0),
      abnormalCount:rows.reduce((sum,row)=>sum+row.abnormalCount,0),
      duplicateFlagCount:rows.filter(row=>row.duplicateFlag).length
    },
    rows:sortProblematicHorses(rows)
  };
}

export function sortProblematicHorses(rows=[]){
  const errorRank=row=>row.errorCount>0||row.validationStatus==="ERROR"?1:0;
  return [...rows].sort((a,b)=>errorRank(b)-errorRank(a)||(a.qualityScore??Infinity)-(b.qualityScore??Infinity)||String(a.raceDate).localeCompare(String(b.raceDate))||Number(a.horseNumber)-Number(b.horseNumber));
}

export function filterProblematicHorses(rows=[],filters={}){
  return sortProblematicHorses(rows.filter(row=>
    (!filters.validationStatus||row.validationStatus===String(filters.validationStatus).toUpperCase())&&
    (!numeric(filters.minQualityScore)||row.qualityScore!==null&&row.qualityScore>=Number(filters.minQualityScore))&&
    (!numeric(filters.maxQualityScore)||row.qualityScore!==null&&row.qualityScore<=Number(filters.maxQualityScore))&&
    (!numeric(filters.maxOcrConfidence)||row.ocrConfidence!==null&&row.ocrConfidence<=Number(filters.maxOcrConfidence))&&
    (!filters.issuesOnly||row.hasIssues)
  ));
}

const csvCell=value=>{
  const text=String(value??"");
  return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
};

export function problematicHorsesCsv(rows=[]){
  const headers=["raceDate","raceName","horseNumber","horseName","qualityScore","ocrConfidence","validationStatus","missingCount","warningCount","errorCount","issueMessages"];
  const lines=rows.map(row=>[
    row.raceDate,row.raceName,row.horseNumber,row.horseName,row.qualityScore,
    row.ocrConfidence,row.validationStatus,row.missingCount,row.warningCount,row.errorCount,
    row.issueMessages.join(" | ")
  ].map(csvCell).join(","));
  return"\uFEFF"+[headers.join(","),...lines].join("\r\n");
}

const validDate=value=>{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value?null:value;
};
const weightedAverage=(sum,count)=>count?sum/count:null;

function raceTrendRow(race,index){
  const horses=race.horses||[],quality=horses.map(horse=>horse.quality?.qualityScore).filter(numeric).map(Number),ocr=horses.map(horse=>horse.ocr?.confidence).filter(numeric).map(Number);
  const date=validDate(race.meta?.date||race.date||"");
  return{
    raceId:race.raceId||`race-${index}`,
    raceDate:date,
    dateLabel:date||"日付不明",
    raceName:race.meta?.raceName||race.raceName||race.raceId||`Race ${index+1}`,
    horseCount:horses.length,
    averageQualityScore:average(quality),
    averageOcrConfidence:average(ocr),
    missingCount:horses.reduce((sum,horse)=>sum+number(horse.quality?.missingCount),0),
    warningCount:horses.reduce((sum,horse)=>sum+number(horse.quality?.warningCount??horse.quality?.warning?.length),0),
    errorCount:horses.reduce((sum,horse)=>sum+number(horse.quality?.errorCount),0),
    qualityValueCount:quality.length,
    qualityValueSum:quality.reduce((sum,value)=>sum+value,0),
    ocrValueCount:ocr.length,
    ocrValueSum:ocr.reduce((sum,value)=>sum+value,0)
  };
}

export function buildRaceTrends(races=[]){
  return races.map(raceTrendRow).sort((a,b)=>{
    if(a.raceDate&&b.raceDate)return a.raceDate.localeCompare(b.raceDate)||a.raceId.localeCompare(b.raceId);
    if(a.raceDate)return-1;
    if(b.raceDate)return 1;
    return a.raceId.localeCompare(b.raceId);
  });
}

export function buildMonthlyTrends(raceTrends=[]){
  const groups=new Map();
  for(const race of raceTrends){
    const month=race.raceDate?race.raceDate.slice(0,7):"undated";
    const group=groups.get(month)||{month,monthLabel:month==="undated"?"日付不明":month,raceCount:0,horseCount:0,qualityValueSum:0,qualityValueCount:0,ocrValueSum:0,ocrValueCount:0,missingCount:0,warningCount:0,errorCount:0};
    group.raceCount++;group.horseCount+=race.horseCount;group.qualityValueSum+=race.qualityValueSum;group.qualityValueCount+=race.qualityValueCount;group.ocrValueSum+=race.ocrValueSum;group.ocrValueCount+=race.ocrValueCount;group.missingCount+=race.missingCount;group.warningCount+=race.warningCount;group.errorCount+=race.errorCount;
    groups.set(month,group);
  }
  return [...groups.values()].sort((a,b)=>a.month==="undated"?1:b.month==="undated"?-1:a.month.localeCompare(b.month)).map(group=>({...group,averageQualityScore:weightedAverage(group.qualityValueSum,group.qualityValueCount),averageOcrConfidence:weightedAverage(group.ocrValueSum,group.ocrValueCount)}));
}

function periodMetrics(races,start,end){
  const selected=races.filter(race=>race.raceDate&&race.raceDate>=start&&race.raceDate<=end);
  const qualityValueSum=selected.reduce((sum,race)=>sum+race.qualityValueSum,0),qualityValueCount=selected.reduce((sum,race)=>sum+race.qualityValueCount,0),ocrValueSum=selected.reduce((sum,race)=>sum+race.ocrValueSum,0),ocrValueCount=selected.reduce((sum,race)=>sum+race.ocrValueCount,0);
  return{
    raceCount:selected.length,
    horseCount:selected.reduce((sum,race)=>sum+race.horseCount,0),
    averageQualityScore:weightedAverage(qualityValueSum,qualityValueCount),
    averageOcrConfidence:weightedAverage(ocrValueSum,ocrValueCount),
    missingCount:selected.reduce((sum,race)=>sum+race.missingCount,0),
    warningCount:selected.reduce((sum,race)=>sum+race.warningCount,0),
    errorCount:selected.reduce((sum,race)=>sum+race.errorCount,0)
  };
}

export function comparePeriods(raceTrends=[],periods={}){
  const currentStart=validDate(periods.currentStart),currentEnd=validDate(periods.currentEnd),comparisonStart=validDate(periods.comparisonStart),comparisonEnd=validDate(periods.comparisonEnd);
  if(!currentStart||!currentEnd||!comparisonStart||!comparisonEnd)return{valid:false,reason:"4つの期間日付を入力してください。"};
  if(currentStart>currentEnd||comparisonStart>comparisonEnd)return{valid:false,reason:"開始日は終了日以前にしてください。"};
  const current=periodMetrics(raceTrends,currentStart,currentEnd),comparison=periodMetrics(raceTrends,comparisonStart,comparisonEnd);
  const keys=["raceCount","horseCount","averageQualityScore","averageOcrConfidence","missingCount","warningCount","errorCount"];
  const differences=Object.fromEntries(keys.map(key=>{
    const a=current[key],b=comparison[key],absolute=a==null||b==null?null:a-b,percentageChange=absolute==null||b===0?null:absolute/b*100;
    return[key,{absolute,percentageChange}];
  }));
  return{valid:true,current,comparison,differences,periods:{currentStart,currentEnd,comparisonStart,comparisonEnd}};
}

function rowsCsv(headers,rows){
  return"\uFEFF"+[headers,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
}

export function raceTrendsCsv(rows=[]){
  return rowsCsv(["raceDate","raceName","raceId","horseCount","averageQualityScore","averageOcrConfidence","missingCount","warningCount","errorCount"],rows.map(row=>[row.dateLabel,row.raceName,row.raceId,row.horseCount,row.averageQualityScore,row.averageOcrConfidence,row.missingCount,row.warningCount,row.errorCount]));
}

export function monthlyTrendsCsv(rows=[]){
  return rowsCsv(["month","raceCount","horseCount","averageQualityScore","averageOcrConfidence","missingCount","warningCount","errorCount"],rows.map(row=>[row.monthLabel,row.raceCount,row.horseCount,row.averageQualityScore,row.averageOcrConfidence,row.missingCount,row.warningCount,row.errorCount]));
}

export function periodComparisonCsv(comparison){
  if(!comparison?.valid)return rowsCsv(["status","reason"],[["invalid",comparison?.reason||"not calculable"]]);
  const labels={raceCount:"raceCount",horseCount:"horseCount",averageQualityScore:"averageQualityScore",averageOcrConfidence:"averageOcrConfidence",missingCount:"missingCount",warningCount:"warningCount",errorCount:"errorCount"};
  return rowsCsv(["metric","current","comparison","absoluteDifference","percentageChange"],Object.keys(labels).map(key=>[labels[key],comparison.current[key],comparison.comparison[key],comparison.differences[key].absolute,comparison.differences[key].percentageChange]));
}

export const FEATURE_STABILITY_MIN_SAMPLE=3;
const popSd=values=>{if(!values.length)return null;const m=average(values);return Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/values.length);};
export const coverageClass=p=>p>=95?"excellent":p>=80?"good":p>=50?"warning":"critical";
export function buildFeatureCoverage(races=[],dictionary=[]){
 const horses=races.flatMap(r=>r.horses||[]),total=horses.length;
 return dictionary.map(d=>{const vals=horses.map(h=>h.features?.[d.key]).filter(numeric).map(Number),coverage=percentage(vals.length,total);return{key:d.key,name:d.名称||d.name||d.key,group:d.group||"other",numericCount:vals.length,missingCount:total-vals.length,coveragePercentage:coverage,coverageClass:coverageClass(coverage),zeroValueCount:vals.filter(v=>v===0).length,min:vals.length?Math.min(...vals):null,max:vals.length?Math.max(...vals):null,mean:average(vals),standardDeviation:popSd(vals),availablePreRace:!!d.availablePreRace,leakageRisk:d.leakageRisk||""};});
}
export function filterFeatureCoverage(rows=[],f={}){const q=String(f.search||"").toLowerCase();return rows.filter(r=>(!f.group||r.group===f.group)&&(!f.coverageClass||r.coverageClass===f.coverageClass)&&(f.availablePreRace===""||f.availablePreRace==null||r.availablePreRace===(String(f.availablePreRace)==="true"))&&(!f.leakageRisk||r.leakageRisk===f.leakageRisk)&&(!numeric(f.minimumCoverage)||r.coveragePercentage>=Number(f.minimumCoverage))&&(!q||`${r.key} ${r.name}`.toLowerCase().includes(q)));};
export function coverageClassSummary(rows=[]){return["excellent","good","warning","critical"].map(label=>{const count=rows.filter(r=>r.coverageClass===label).length;return{label,count,percentage:percentage(count,rows.length)};});}
export function buildFeatureStability(races=[],key){
 const months=new Map();for(const r of races){const date=validDate(r.meta?.date||r.date||""),month=date?date.slice(0,7):"undated",g=months.get(month)||{month,monthLabel:month==="undated"?"日付不明":month,totalCount:0,values:[]};for(const h of r.horses||[]){g.totalCount++;const v=h.features?.[key];if(numeric(v))g.values.push(Number(v));}months.set(month,g);}
 const rows=[...months.values()].sort((a,b)=>a.month==="undated"?1:b.month==="undated"?-1:a.month.localeCompare(b.month)).map(g=>({month:g.month,monthLabel:g.monthLabel,totalCount:g.totalCount,numericCount:g.values.length,coveragePercentage:percentage(g.values.length,g.totalCount),mean:average(g.values),standardDeviation:popSd(g.values),min:g.values.length?Math.min(...g.values):null,max:g.values.length?Math.max(...g.values):null}));
 return rows.map((r,i)=>{const p=rows[i-1],difference=!p||r.mean==null||p.mean==null?null:r.mean-p.mean,percentageChange=difference==null||p.mean===0?null:difference/p.mean*100;return{...r,meanDifference:difference,meanPercentageChange:percentageChange};});
}
export function featureStabilityWarnings(rows=[]){
 const out=[];for(let i=0;i<rows.length;i++){const r=rows[i],p=rows[i-1];if(r.numericCount<FEATURE_STABILITY_MIN_SAMPLE)out.push({month:r.monthLabel,type:"insufficient-sample",message:`有効値${r.numericCount}件（最小${FEATURE_STABILITY_MIN_SAMPLE}件）`});if(r.numericCount&&r.standardDeviation===0)out.push({month:r.monthLabel,type:"zero-variance",message:"分散が0"});if(p){if(p.coveragePercentage-r.coveragePercentage>=20)out.push({month:r.monthLabel,type:"coverage-decrease",message:"coverageが20ポイント以上低下"});if(r.meanPercentageChange!=null&&Math.abs(r.meanPercentageChange)>=30)out.push({month:r.monthLabel,type:"mean-change",message:"平均が30%以上変化"});if(p.numericCount>0&&r.numericCount===0)out.push({month:r.monthLabel,type:"newly-missing",message:"新たに全件欠損"});if(p.numericCount===0&&r.numericCount>0)out.push({month:r.monthLabel,type:"newly-restored",message:"欠損状態から復旧"});}}return out;
}
export function featureCoverageCsv(rows=[]){return rowsCsv(["key","name","group","numericCount","missingCount","coveragePercentage","coverageClass","zeroValueCount","min","max","mean","standardDeviation","availablePreRace","leakageRisk"],rows.map(r=>[r.key,r.name,r.group,r.numericCount,r.missingCount,r.coveragePercentage,r.coverageClass,r.zeroValueCount,r.min,r.max,r.mean,r.standardDeviation,r.availablePreRace,r.leakageRisk]));}
export function featureStabilityCsv(rows=[]){return rowsCsv(["month","numericCount","coveragePercentage","mean","standardDeviation","min","max","meanDifference","meanPercentageChange"],rows.map(r=>[r.monthLabel,r.numericCount,r.coveragePercentage,r.mean,r.standardDeviation,r.min,r.max,r.meanDifference,r.meanPercentageChange]));}
export function featureWarningsCsv(rows=[]){return rowsCsv(["month","type","message"],rows.map(r=>[r.month,r.type,r.message]));}

export const DEFAULT_PAGE_SIZE=50,PAGE_SIZE_OPTIONS=[25,50,100],CANONICAL_SECTIONS=["raw","features","quality","ocr","logs","versions"];
export function buildCanonicalResearchModel(races=[],now=()=>typeof performance!=="undefined"?performance.now():Date.now()){
 const start=now(),raceRows=[],horseRows=[];for(let ri=0;ri<races.length;ri++){const race=races[ri],raceId=String(race.raceId||""),date=validDate(race.meta?.date||race.date||"");const rr={race,raceId,date,raceIndex:ri,horseStart:horseRows.length,horseCount:(race.horses||[]).length};raceRows.push(rr);for(let hi=0;hi<(race.horses||[]).length;hi++){const horse=race.horses[hi],number=horse.number??horse.raw?.merged?.number??horse.horseKey??"";horseRows.push({race,raceId,date,raceIndex:ri,horse,horseIndex:hi,number,name:horse.name||horse.raw?.merged?.name||"",features:horse.features,quality:horse.quality,ocr:horse.ocr,logs:horse.logs,versions:horse.versions,raw:horse.raw,sectionPresence:Object.fromEntries(CANONICAL_SECTIONS.map(k=>[k,horse[k]!=null]))});}}return{races:raceRows,horses:horseRows,calculationDurationMs:now()-start};
}
const diagnostic=(severity,type,raceId,horseNumber,message)=>({severity,type,raceId,horseNumber,message});
export function buildConsistencyDiagnostics(model){
 const out=[],raceIds=new Map(),versionSets={horse:new Set(),features:new Set(),quality:new Set(),ocr:new Set(),logs:new Set()};
 for(const r of model.races){if(!r.raceId)out.push(diagnostic("error","missing-race-id","",null,"raceIdがありません"));else{if(raceIds.has(r.raceId))out.push(diagnostic("error","duplicate-race-id",r.raceId,null,"raceIdが重複しています"));raceIds.set(r.raceId,true);}if(!r.date)out.push(diagnostic("warning","invalid-race-date",r.raceId,null,"レース日付が未登録または不正です"));}
 for(const r of model.races){const seen=new Set();for(const h of model.horses.slice(r.horseStart,r.horseStart+r.horseCount)){const key=String(h.number);if(seen.has(key))out.push(diagnostic("error","duplicate-horse-number",h.raceId,h.number,"同一レース内で馬番が重複しています"));seen.add(key);for(const s of CANONICAL_SECTIONS)if(!h.sectionPresence[s])out.push(diagnostic("error",`missing-section-${s}`,h.raceId,h.number,`${s}セクションがありません`));const q=h.quality?.qualityScore,o=h.ocr?.confidence;if(numeric(q)&&(Number(q)<0||Number(q)>100))out.push(diagnostic("error","invalid-quality-score",h.raceId,h.number,"qualityScoreが0–100の範囲外です"));if(numeric(o)&&(Number(o)<0||Number(o)>1))out.push(diagnostic("error","invalid-ocr-confidence",h.raceId,h.number,"OCR confidenceが0–1の範囲外です"));for(const k of Object.keys(versionSets)){const v=k==="horse"?h.versions?.horse:h.versions?.[k];if(v)versionSets[k].add(String(v));}}}
 for(const [k,set] of Object.entries(versionSets))if(set.size>1)out.push(diagnostic("warning","version-inconsistency","",null,`${k} versionが統一されていません: ${[...set].sort().join(", ")}`));
 const rank={error:0,warning:1,info:2};return stableSort(out,(a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||a.raceId.localeCompare(b.raceId)||String(a.horseNumber??"").localeCompare(String(b.horseNumber??""))||a.type.localeCompare(b.type));
}
export function stableSort(rows=[],compare=(a,b)=>0){return rows.map((value,index)=>({value,index})).sort((a,b)=>compare(a.value,b.value)||a.index-b.index).map(x=>x.value);}
export function paginate(rows=[],page=1,pageSize=DEFAULT_PAGE_SIZE){const size=PAGE_SIZE_OPTIONS.includes(Number(pageSize))?Number(pageSize):DEFAULT_PAGE_SIZE,total=rows.length,pages=Math.max(1,Math.ceil(total/size)),current=Math.min(pages,Math.max(1,Number(page)||1)),start=(current-1)*size,end=Math.min(total,start+size);return{rows:rows.slice(start,end),page:current,pageSize:size,total,totalPages:pages,start:total?start+1:0,end};}
export function filterDiagnostics(rows=[],f={}){const q=String(f.raceId||"").toLowerCase();return rows.filter(r=>(!f.severity||r.severity===f.severity)&&(!f.type||r.type===f.type)&&(!q||r.raceId.toLowerCase().includes(q)));}
export function diagnosticsCsv(rows=[]){return rowsCsv(["severity","type","raceId","horseNumber","message"],rows.map(r=>[r.severity,r.type,r.raceId,r.horseNumber,r.message]));}
export function createRenderGeneration(){let generation=0;return{next:()=>++generation,isCurrent:value=>value===generation,cancel:()=>++generation};}

export const UNREGISTERED_VERSION="未登録",INVALID_RECALCULATION_MONTH="invalid",MISSING_RECALCULATION_MONTH="missing";
const versionValue=value=>value==null||String(value).trim()===""?UNREGISTERED_VERSION:String(value);
const canonicalVersions=row=>({
  dataModelVersion:versionValue(row.versions?.dataModelVersion??row.versions?.horse),
  featureVersion:versionValue(row.versions?.featureVersion??row.versions?.features)
});
export function parseAuditTimestamp(value){
  if(value==null||value==="")return{kind:"missing",iso:null};
  try{
    const date=typeof value?.toDate==="function"?value.toDate():value instanceof Date?value:new Date(value);
    return Number.isNaN(date.getTime())?{kind:"invalid",iso:null}:{kind:"valid",iso:date.toISOString()};
  }catch{return{kind:"invalid",iso:null};}
}
export function canonicalRecalculation(row){
  const history=Array.isArray(row.logs?.recalculateHistory)?row.logs.recalculateHistory:[];
  const candidates=[row.logs?.updatedAt,row.logs?.calculatedAt,...history.map(item=>item?.at)];
  const parsed=candidates.map(parseAuditTimestamp),valid=parsed.filter(x=>x.kind==="valid").map(x=>x.iso).sort();
  if(valid.length)return{kind:"valid",iso:valid.at(-1),month:valid.at(-1).slice(0,7)};
  if(parsed.some(x=>x.kind==="invalid"))return{kind:"invalid",iso:null,month:INVALID_RECALCULATION_MONTH};
  return{kind:"missing",iso:null,month:MISSING_RECALCULATION_MONTH};
}
function mode(values){
  const counts=new Map();for(const value of values)counts.set(value,(counts.get(value)||0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]??null;
}
function versionDistribution(values){
  const total=values.length,counts=new Map();for(const value of values)counts.set(value,(counts.get(value)||0)+1);
  const mostCommon=mode(values);
  return [...counts].map(([version,count])=>({version,count,percentage:percentage(count,total),mostCommon:version===mostCommon}))
    .sort((a,b)=>b.count-a.count||a.version.localeCompare(b.version));
}
export function buildVersionRecalculationAudit(model){
  const rows=model.horses.map((row,index)=>{
    const versions=canonicalVersions(row),recalculation=canonicalRecalculation(row);
    return{...row,...versions,recalculationKind:recalculation.kind,recalculationTime:recalculation.iso,recalculationMonth:recalculation.month,originalIndex:index,
      raceName:row.race?.meta?.raceName||row.race?.raceName||row.raceId,horseName:row.name};
  });
  const dataModelDistribution=versionDistribution(rows.map(row=>row.dataModelVersion));
  const featureDistribution=versionDistribution(rows.map(row=>row.featureVersion));
  const commonCombination=mode(rows.map(row=>`${row.dataModelVersion}\u0000${row.featureVersion}`));
  const issues=[];
  const add=(row,severity,type,message)=>issues.push({...row,severity,type,message});
  for(const race of model.races){
    const raceRows=rows.slice(race.horseStart,race.horseStart+race.horseCount);
    const dataModels=new Set(raceRows.map(row=>row.dataModelVersion).filter(x=>x!==UNREGISTERED_VERSION));
    const features=new Set(raceRows.map(row=>row.featureVersion).filter(x=>x!==UNREGISTERED_VERSION));
    const times=new Set(raceRows.map(row=>row.recalculationTime).filter(Boolean));
    if(dataModels.size>1)for(const row of raceRows)add(row,"error","mixed-data-model-version","同一レース内でdataModelVersionが複数あります");
    if(features.size>1)for(const row of raceRows)add(row,"error","mixed-feature-version","同一レース内でfeatureVersionが複数あります");
    if(times.size>1)for(const row of raceRows)add(row,"warning","mixed-recalculation-time","同一レース内で最終再計算時刻が混在しています");
  }
  for(const row of rows){
    if(row.dataModelVersion===UNREGISTERED_VERSION)add(row,"error","missing-data-model-version","dataModelVersionが未登録です");
    if(row.featureVersion===UNREGISTERED_VERSION)add(row,"error","missing-feature-version","featureVersionが未登録です");
    if(commonCombination&&`${row.dataModelVersion}\u0000${row.featureVersion}`!==commonCombination)add(row,"warning","uncommon-version-combination","データセットの最多バージョン組合せと異なります");
    if(row.recalculationKind==="missing")add(row,"warning","missing-recalculation-time","最終再計算時刻が未登録です");
    if(row.recalculationKind==="invalid")add(row,"error","invalid-recalculation-time","最終再計算時刻が不正です");
    if(row.date&&row.recalculationTime&&row.recalculationTime<`${row.date}T00:00:00.000Z`)add(row,"warning","recalculation-before-race","最終再計算時刻がレース日より前です");
  }
  const recalculationGroups=versionDistribution(rows.map(row=>row.recalculationMonth)).map(item=>({...item,month:item.version}));
  const validTimes=rows.map(row=>row.recalculationTime).filter(Boolean).sort();
  const combinations=new Map();for(const row of rows){const key=`${row.dataModelVersion}\u0000${row.featureVersion}`;combinations.set(key,(combinations.get(key)||0)+1);}
  const matrix=[...combinations].map(([key,count])=>{const [dataModelVersion,featureVersion]=key.split("\u0000");return{dataModelVersion,featureVersion,count,percentage:percentage(count,rows.length)};});
  return{rows,dataModelDistribution,featureDistribution,commonCombination:commonCombination?.split("\u0000")||null,recalculationGroups,
    oldestRecalculationTime:validTimes[0]||null,newestRecalculationTime:validTimes.at(-1)||null,
    matrix,issues:sortVersionAuditIssues(issues)};
}
export function sortVersionAuditIssues(rows=[]){
  const rank={error:0,warning:1,info:2};
  return stableSort(rows,(a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||
    (a.date&&b.date?a.date.localeCompare(b.date):a.date?-1:b.date?1:0)||a.raceId.localeCompare(b.raceId)||
    String(a.number??"").localeCompare(String(b.number??""),undefined,{numeric:true}));
}
export function filterVersionAuditIssues(rows=[],f={}){
  const search=String(f.search||"").toLowerCase();
  return sortVersionAuditIssues(rows.filter(row=>
    (!f.severity||row.severity===f.severity)&&(!f.type||row.type===f.type)&&
    (!f.dataModelVersion||row.dataModelVersion===f.dataModelVersion)&&(!f.featureVersion||row.featureVersion===f.featureVersion)&&
    (!f.recalculationMonth||row.recalculationMonth===f.recalculationMonth)&&(!f.raceId||row.raceId===f.raceId)&&
    (!search||`${row.raceName} ${row.horseName} ${row.message}`.toLowerCase().includes(search))
  ));
}
export function versionDistributionCsv(rows=[]){return rowsCsv(["version","count","percentage","mostCommon"],rows.map(r=>[r.version,r.count,r.percentage,r.mostCommon]));}
export function versionMatrixCsv(rows=[]){return rowsCsv(["dataModelVersion","featureVersion","count","percentage"],rows.map(r=>[r.dataModelVersion,r.featureVersion,r.count,r.percentage]));}
export function recalculationAuditCsv(audit){return rowsCsv(["month","count","percentage","oldestValid","newestValid"],audit.recalculationGroups.map(r=>[r.month,r.count,r.percentage,audit.oldestRecalculationTime,audit.newestRecalculationTime]));}
export function versionAuditIssuesCsv(rows=[]){return rowsCsv(["severity","type","raceDate","raceName","raceId","horseNumber","horseName","dataModelVersion","featureVersion","lastRecalculationTime","message"],rows.map(r=>[r.severity,r.type,r.date||"日付不明",r.raceName,r.raceId,r.number,r.horseName,r.dataModelVersion,r.featureVersion,r.recalculationTime,r.message]));}

export const FRESHNESS_CATEGORIES=["within-24-hours","1-7-days","8-30-days","over-30-days","future","missing","invalid"];
const hasData=value=>value!=null&&(typeof value!=="object"?String(value)!=="":Array.isArray(value)?value.length>0:Object.keys(value).length>0);
export function requiredSourcesFromDictionary(dictionary=[]){
  return [...new Set(dictionary.flatMap(item=>Array.isArray(item?.sourceFields)?item.sourceFields:[]).filter(Boolean).map(String))].sort();
}
function freshness(recalculation,nowMs){
  if(recalculation.kind==="missing")return"missing";if(recalculation.kind==="invalid")return"invalid";
  const age=nowMs-new Date(recalculation.iso).getTime(),day=86400000;
  if(age<0)return"future";if(age<=day)return"within-24-hours";if(age<=7*day)return"1-7-days";if(age<=30*day)return"8-30-days";return"over-30-days";
}
export function buildProvenanceFreshnessAudit(model,dictionary=[],now=new Date()){
  const calculationTime=parseAuditTimestamp(now);if(calculationTime.kind!=="valid")throw new Error("Audit calculation time must be valid.");
  const calculationTimeMs=new Date(calculationTime.iso).getTime(),requiredSources=requiredSourcesFromDictionary(dictionary),sourceKeys=new Set();
  for(const row of model.horses)if(row.sectionPresence.raw&&row.raw&&typeof row.raw==="object")for(const key of Object.keys(row.raw))sourceKeys.add(key);
  const rows=model.horses.map((row,index)=>{
    const rawPresent=row.sectionPresence.raw&&row.raw&&typeof row.raw==="object",presentSources=rawPresent?Object.keys(row.raw).filter(key=>hasData(row.raw[key])).sort():[];
    const emptySources=rawPresent?Object.keys(row.raw).filter(key=>!hasData(row.raw[key])).sort():[],missingRequiredSources=requiredSources.filter(key=>!presentSources.includes(key));
    const recalculation=canonicalRecalculation(row),freshnessCategory=freshness(recalculation,calculationTimeMs),sourceCoveragePercentage=sourceKeys.size?percentage(presentSources.filter(key=>sourceKeys.has(key)).length,sourceKeys.size):0;
    return{...row,originalIndex:index,raceName:row.race?.meta?.raceName||row.race?.raceName||row.raceId,horseName:row.name,rawPresent,presentSources,emptySources,missingRequiredSources,
      sourceCoveragePercentage,freshnessCategory,recalculationTime:recalculation.iso,recalculationKind:recalculation.kind};
  });
  const sourceCoverage=[...sourceKeys].map(sourceKey=>{const values=rows.filter(row=>row.rawPresent&&Object.prototype.hasOwnProperty.call(row.raw,sourceKey));const availableDataCount=values.filter(row=>hasData(row.raw[sourceKey])).length;return{sourceKey,horseCount:values.length,coveragePercentage:percentage(values.length,rows.length),emptyObjectCount:values.length-availableDataCount,availableDataCount};})
    .sort((a,b)=>b.coveragePercentage-a.coveragePercentage||a.sourceKey.localeCompare(b.sourceKey));
  const missingRawCount=rows.filter(row=>!row.rawPresent).length;
  sourceCoverage.push({sourceKey:"(raw missing)",horseCount:missingRawCount,coveragePercentage:percentage(missingRawCount,rows.length),emptyObjectCount:0,availableDataCount:0});
  const freshnessSummary=FRESHNESS_CATEGORIES.map(category=>{const count=rows.filter(row=>row.freshnessCategory===category).length;return{category,count,percentage:percentage(count,rows.length)};});
  const issues=[];const add=(row,severity,type,message,sourceKey="")=>issues.push({...row,severity,type,message,sourceKey});
  for(const row of rows){
    if(!row.rawPresent)add(row,"error","missing-raw-section","rawセクションがありません");
    else if(!Object.keys(row.raw).length)add(row,"warning","empty-raw-section","rawセクションが空です");
    for(const sourceKey of row.emptySources)add(row,"warning","empty-source-object",`${sourceKey}が空です`,sourceKey);
    for(const sourceKey of row.missingRequiredSources)add(row,"error","missing-required-source",`必須ソース${sourceKey}がありません`,sourceKey);
    if(row.freshnessCategory==="over-30-days")add(row,"warning","stale-recalculation","最終再計算から30日を超えています");
    if(row.freshnessCategory==="future")add(row,"warning","future-recalculation-timestamp","最終再計算時刻が監査時刻より未来です");
    if(row.freshnessCategory==="missing")add(row,"warning","missing-recalculation-timestamp","最終再計算時刻が未登録です");
    if(row.freshnessCategory==="invalid")add(row,"error","invalid-recalculation-timestamp","最終再計算時刻が不正です");
  }
  const raceRows=model.races.map(race=>{
    const horses=rows.slice(race.horseStart,race.horseStart+race.horseCount);
    return{raceId:race.raceId,raceDate:race.date,raceName:race.race?.meta?.raceName||race.race?.raceName||race.raceId,horseCount:horses.length,
      averageSourceCoverage:average(horses.map(row=>row.sourceCoveragePercentage)),missingRawCount:horses.filter(row=>!row.rawPresent).length,
      missingRequiredCount:horses.filter(row=>row.missingRequiredSources.length).length,freshCount:horses.filter(row=>["within-24-hours","1-7-days"].includes(row.freshnessCategory)).length,
      staleCount:horses.filter(row=>row.freshnessCategory==="over-30-days").length,futureCount:horses.filter(row=>row.freshnessCategory==="future").length,
      missingTimestampCount:horses.filter(row=>row.freshnessCategory==="missing").length,invalidTimestampCount:horses.filter(row=>row.freshnessCategory==="invalid").length};
  }).sort((a,b)=>a.raceDate&&b.raceDate?a.raceDate.localeCompare(b.raceDate)||a.raceId.localeCompare(b.raceId):a.raceDate?-1:b.raceDate?1:a.raceId.localeCompare(b.raceId));
  const completeRequiredCount=requiredSources.length?rows.filter(row=>!row.missingRequiredSources.length).length:0;
  return{calculationTime:calculationTime.iso,requiredSources,requiredSourcesConfigured:requiredSources.length>0,completeRequiredCount,
    incompleteRequiredCount:requiredSources.length?rows.length-completeRequiredCount:0,requiredSourceCoveragePercentage:requiredSources.length?percentage(completeRequiredCount,rows.length):null,
    sourceCoverage,freshnessSummary,raceRows,rows,issues:sortProvenanceIssues(issues)};
}
export function sortProvenanceIssues(rows=[]){const rank={error:0,warning:1};return stableSort(rows,(a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||(a.date&&b.date?a.date.localeCompare(b.date):a.date?-1:b.date?1:0)||a.raceId.localeCompare(b.raceId)||String(a.number??"").localeCompare(String(b.number??""),undefined,{numeric:true})||a.type.localeCompare(b.type));}
export function filterProvenanceIssues(rows=[],f={}){
  const search=String(f.search||"").toLowerCase();
  return sortProvenanceIssues(rows.filter(row=>(!f.severity||row.severity===f.severity)&&(!f.type||row.type===f.type)&&(!f.sourceKey||row.sourceKey===f.sourceKey||row.presentSources.includes(f.sourceKey))&&
    (!f.freshnessCategory||row.freshnessCategory===f.freshnessCategory)&&(!f.raceId||row.raceId===f.raceId)&&(!numeric(f.minimumSourceCoverage)||row.sourceCoveragePercentage>=Number(f.minimumSourceCoverage))&&
    (!search||`${row.raceName} ${row.horseName} ${row.sourceKey} ${row.message}`.toLowerCase().includes(search))));
}
export function sourceCoverageCsv(rows=[]){return rowsCsv(["sourceKey","horseCount","coveragePercentage","emptyObjectCount","availableDataCount"],rows.map(r=>[r.sourceKey,r.horseCount,r.coveragePercentage,r.emptyObjectCount,r.availableDataCount]));}
export function freshnessSummaryCsv(rows=[]){return rowsCsv(["category","count","percentage"],rows.map(r=>[r.category,r.count,r.percentage]));}
export function provenanceRaceCsv(rows=[]){return rowsCsv(["raceDate","raceName","raceId","horseCount","averageSourceCoverage","missingRawCount","missingRequiredCount","freshCount","staleCount","futureCount","missingTimestampCount","invalidTimestampCount"],rows.map(r=>[r.raceDate||"日付不明",r.raceName,r.raceId,r.horseCount,r.averageSourceCoverage,r.missingRawCount,r.missingRequiredCount,r.freshCount,r.staleCount,r.futureCount,r.missingTimestampCount,r.invalidTimestampCount]));}
export function provenanceIssuesCsv(rows=[]){return rowsCsv(["severity","type","raceDate","raceName","raceId","horseNumber","horseName","presentSources","missingRequiredSources","freshnessCategory","lastRecalculationTime","message"],rows.map(r=>[r.severity,r.type,r.date||"日付不明",r.raceName,r.raceId,r.number,r.horseName,r.presentSources.join(" | "),r.missingRequiredSources.join(" | "),r.freshnessCategory,r.recalculationTime,r.message]));}

export const SCHEMA_AUDIT_MAX_DEPTH=6,SCHEMA_VALUE_PREVIEW_MAX_LENGTH=80;
const timestampDesignatedPath=path=>/(^|\.)(at|date|time|timestamp|updatedAt|createdAt|calculatedAt|extractedAt)$/i.test(path);
export function schemaRuntimeType(value,path=""){
  if(value===null)return"null";
  if(typeof value?.toDate==="function")return"timestamp-like";
  if(value instanceof Date)return timestampDesignatedPath(path)&&!Number.isNaN(value.getTime())?"timestamp-like":"object";
  if(typeof value==="string"){
    if(timestampDesignatedPath(path)&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&parseAuditTimestamp(value).kind==="valid")return"timestamp-like";
    return"string";
  }
  if(typeof value==="number")return Number.isFinite(value)?"finite number":"non-finite number";
  if(typeof value==="boolean")return"boolean";
  if(Array.isArray(value))return"array";
  return typeof value==="object"?"object":typeof value;
}
export function schemaValuePreview(value,maxLength=SCHEMA_VALUE_PREVIEW_MAX_LENGTH){
  let text;try{text=typeof value==="string"?value:Array.isArray(value)?`Array(${value.length})`:value&&typeof value==="object"?`Object(${Object.keys(value).length})`:String(value);}catch{text="[unavailable]";}
  return text.length>maxLength?`${text.slice(0,maxLength-1)}…`:text;
}
const dominantType=counts=>[...counts].filter(([type])=>type!=="null").sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]||[null,0];
const expectedFeatureType=item=>String(item?.型||item?.type||"").includes("number")?"finite number":String(item?.型||item?.type||"").includes("boolean")?"boolean":String(item?.型||item?.type||"").includes("string")?"string":"";
export function buildSchemaTypeAudit(model,dictionary=[]){
  const total=model.horses.length,observations=new Map(),depthIssues=[],dictionaryMap=new Map(dictionary.map(item=>[`features.${item.key}`,expectedFeatureType(item)]));
  const sectionConformance=CANONICAL_SECTIONS.map(section=>{
    const values=model.horses.map(row=>row[section]),presentCount=values.filter(value=>value!==undefined).length,objectCount=values.filter(value=>value!==null&&typeof value==="object"&&!Array.isArray(value)).length;
    const invalidTypeCount=values.filter(value=>value!==undefined&&(value===null||typeof value!=="object"||Array.isArray(value))).length,emptyObjectCount=values.filter(value=>value&&typeof value==="object"&&!Array.isArray(value)&&!Object.keys(value).length).length;
    return{section,presentCount,missingCount:total-presentCount,objectCount,invalidTypeCount,emptyObjectCount,conformancePercentage:percentage(objectCount,total)};
  });
  const addObservation=(row,section,path,value)=>{
    const entry=observations.get(path)||{section,fieldPath:path,items:[],horses:new Set(),races:new Map()};
    const type=schemaRuntimeType(value,path),item={row,value,type,preview:schemaValuePreview(value)};entry.items.push(item);entry.horses.add(row.originalIndex??`${row.raceIndex}:${row.horseIndex}`);
    const race=entry.races.get(row.raceId)||{raceId:row.raceId,raceDate:row.date,raceName:row.race?.meta?.raceName||row.race?.raceName||row.raceId,items:[]};race.items.push(item);entry.races.set(row.raceId,race);observations.set(path,entry);
  };
  const walk=(row,section,value,path,depth)=>{
    addObservation(row,section,path,value);
    if(!value||typeof value!=="object"||Array.isArray(value)||typeof value?.toDate==="function"||value instanceof Date)return;
    const keys=Object.keys(value);if(depth>=SCHEMA_AUDIT_MAX_DEPTH&&keys.length){depthIssues.push({row,section,fieldPath:path,value});return;}
    for(const key of keys)walk(row,section,value[key],`${path}.${key}`,depth+1);
  };
  model.horses.forEach((row,index)=>{row.originalIndex=index;for(const section of CANONICAL_SECTIONS)if(row[section]!==undefined)walk(row,section,row[section],section,0);});
  const inventory=[...observations.values()].map(entry=>{
    const counts=new Map();for(const item of entry.items)counts.set(item.type,(counts.get(item.type)||0)+1);const [dominant,dominantCount]=dominantType(counts);
    return{section:entry.section,fieldPath:entry.fieldPath,observedHorseCount:entry.horses.size,coveragePercentage:percentage(entry.horses.size,total),observedTypes:[...counts.keys()].sort(),
      dominantType:dominant,dominantTypeCount:dominantCount,dominantTypePercentage:percentage(dominantCount,entry.items.filter(item=>item.type!=="null").length),
      nullCount:counts.get("null")||0,emptyStringCount:entry.items.filter(item=>item.value==="").length,emptyArrayCount:entry.items.filter(item=>Array.isArray(item.value)&&!item.value.length).length,
      emptyObjectCount:entry.items.filter(item=>item.value&&typeof item.value==="object"&&!Array.isArray(item.value)&&typeof item.value?.toDate!=="function"&&!Object.keys(item.value).length).length,
      typeCounts:Object.fromEntries(counts),expectedType:dictionaryMap.get(entry.fieldPath)||"",_entry:entry};
  }).sort((a,b)=>a.section.localeCompare(b.section)||a.fieldPath.localeCompare(b.fieldPath));
  const stability=[];for(const field of inventory)for(const race of field._entry.races.values()){const counts=new Map();for(const item of race.items)if(item.type!=="null")counts.set(item.type,(counts.get(item.type)||0)+1);const [dominant,count]=dominantType(counts);stability.push({fieldPath:field.fieldPath,section:field.section,...race,observedTypes:[...counts.keys()].sort(),dominantType:dominant,dominantTypeCount:count,observationCount:race.items.length});}
  stability.sort((a,b)=>a.fieldPath.localeCompare(b.fieldPath)||(a.raceDate&&b.raceDate?a.raceDate.localeCompare(b.raceDate):a.raceDate?-1:b.raceDate?1:a.raceId.localeCompare(b.raceId)));
  const issues=[],add=(row,severity,type,section,fieldPath,observedType,expectedType,value,message)=>issues.push({severity,type,section,fieldPath,raceDate:row.date,raceName:row.race?.meta?.raceName||row.race?.raceName||row.raceId,raceId:row.raceId,horseNumber:row.number,horseName:row.name,observedType,expectedType,valuePreview:schemaValuePreview(value),message,originalIndex:row.originalIndex});
  for(const row of model.horses)for(const section of CANONICAL_SECTIONS){const value=row[section];if(value===undefined)add(row,"error","missing-canonical-section",section,section,"missing","object",value,`${section}セクションがありません`);else if(value===null||typeof value!=="object"||Array.isArray(value))add(row,"error","invalid-canonical-section-type",section,section,schemaRuntimeType(value,section),"object",value,`${section}のルート型がobjectではありません`);}
  for(const item of depthIssues)add(item.row,"warning","traversal-depth-exceeded",item.section,item.fieldPath,"object","",item.value,`最大走査深度${SCHEMA_AUDIT_MAX_DEPTH}を超える内容があります`);
  for(const field of inventory){
    const nonNull=field.observedTypes.filter(type=>type!=="null");if(nonNull.length>1){const first=field._entry.items.find(item=>item.type!=="null");add(first.row,"warning","mixed-runtime-types",field.section,field.fieldPath,nonNull.join(" | "),field.expectedType,first.value,"複数の非null runtime typeが観測されました");}
    for(const item of field._entry.items){if(item.type==="non-finite number")add(item.row,"error","non-finite-number",field.section,field.fieldPath,item.type,field.expectedType,item.value,"非有限数が観測されました");if(field.expectedType&&item.type!=="null"&&item.type!==field.expectedType)add(item.row,"error","feature-dictionary-type-conflict",field.section,field.fieldPath,item.type,field.expectedType,item.value,"feature dictionaryの型と一致しません");}
    const raceRows=stability.filter(row=>row.fieldPath===field.fieldPath&&row.dominantType),types=[...new Set(raceRows.map(row=>row.dominantType))];if(types.length>1){const sample=field._entry.items[0];add(sample.row,"warning","cross-race-dominant-type-drift",field.section,field.fieldPath,types.join(" | "),field.expectedType,sample.value,"レース間でdominant typeが変化しています");}
  }
  return{sectionConformance,inventory:inventory.map(({_entry,...item})=>item),stability,issues:sortSchemaIssues(issues)};
}
export function sortSchemaIssues(rows=[]){const rank={error:0,warning:1};return stableSort(rows,(a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||(a.raceDate&&b.raceDate?a.raceDate.localeCompare(b.raceDate):a.raceDate?-1:b.raceDate?1:0)||a.raceId.localeCompare(b.raceId)||String(a.horseNumber??"").localeCompare(String(b.horseNumber??""),undefined,{numeric:true})||a.fieldPath.localeCompare(b.fieldPath)||a.type.localeCompare(b.type));}
export function filterSchemaInventory(rows=[],f={}){const q=String(f.search||"").toLowerCase();return rows.filter(row=>(!f.section||row.section===f.section)&&(!f.fieldPath||row.fieldPath.includes(f.fieldPath))&&(!f.observedType||row.observedTypes.includes(f.observedType))&&(!f.expectedType||row.expectedType===f.expectedType)&&(!f.mixedTypesOnly||row.observedTypes.filter(x=>x!=="null").length>1)&&(!q||row.fieldPath.toLowerCase().includes(q))); }
export function filterSchemaIssues(rows=[],f={}){const q=String(f.search||"").toLowerCase();return sortSchemaIssues(rows.filter(row=>(!f.severity||row.severity===f.severity)&&(!f.type||row.type===f.type)&&(!f.section||row.section===f.section)&&(!f.fieldPath||row.fieldPath.includes(f.fieldPath))&&(!f.observedType||row.observedType.includes(f.observedType))&&(!f.expectedType||row.expectedType===f.expectedType)&&(!f.raceId||row.raceId===f.raceId)&&(!f.mixedTypesOnly||row.type==="mixed-runtime-types")&&(!q||`${row.fieldPath} ${row.raceName} ${row.horseName} ${row.message}`.toLowerCase().includes(q))));}
export function schemaConformanceCsv(rows=[]){return rowsCsv(["section","presentCount","missingCount","objectCount","invalidTypeCount","emptyObjectCount","conformancePercentage"],rows.map(r=>[r.section,r.presentCount,r.missingCount,r.objectCount,r.invalidTypeCount,r.emptyObjectCount,r.conformancePercentage]));}
export function schemaInventoryCsv(rows=[]){return rowsCsv(["section","fieldPath","observedHorseCount","coveragePercentage","observedTypes","dominantType","dominantTypeCount","dominantTypePercentage","nullCount","emptyStringCount","emptyArrayCount","emptyObjectCount","expectedType"],rows.map(r=>[r.section,r.fieldPath,r.observedHorseCount,r.coveragePercentage,r.observedTypes.join(" | "),r.dominantType,r.dominantTypeCount,r.dominantTypePercentage,r.nullCount,r.emptyStringCount,r.emptyArrayCount,r.emptyObjectCount,r.expectedType]));}
export function schemaStabilityCsv(rows=[]){return rowsCsv(["section","fieldPath","raceDate","raceName","raceId","observedTypes","dominantType","dominantTypeCount","observationCount"],rows.map(r=>[r.section,r.fieldPath,r.raceDate||"日付不明",r.raceName,r.raceId,r.observedTypes.join(" | "),r.dominantType,r.dominantTypeCount,r.observationCount]));}
export function schemaIssuesCsv(rows=[]){return rowsCsv(["severity","type","section","fieldPath","raceDate","raceName","raceId","horseNumber","horseName","observedType","expectedType","valuePreview","message"],rows.map(r=>[r.severity,r.type,r.section,r.fieldPath,r.raceDate||"日付不明",r.raceName,r.raceId,r.horseNumber,r.horseName,r.observedType,r.expectedType,r.valuePreview,r.message]));}

export const MISSING_PATTERN_MAX_PATHS=20,MISSING_PATTERN_MAX_DISPLAY=50,CO_MISSINGNESS_MAX_FIELDS=6,MISSING_ISSUE_MESSAGE_MAX_LENGTH=160;
const isPlainAuditObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value)&&typeof value?.toDate!=="function"&&!(value instanceof Date);
export function missingnessClassification(value,present=true,sectionValid=true){
  if(!sectionValid)return"invalid canonical section";
  if(!present||value===undefined)return"absent";
  if(value===null)return"null";
  if(typeof value==="number"&&!Number.isFinite(value))return"non-finite number";
  if(typeof value==="string"&&!value.trim())return"empty string";
  if(Array.isArray(value)&&!value.length)return"empty array";
  if(isPlainAuditObject(value)&&!Object.keys(value).length)return"empty object";
  return"usable";
}
const boundedMissingMessage=(value,max=MISSING_ISSUE_MESSAGE_MAX_LENGTH)=>{
  const text=String(value??"");return text.length>max?`${text.slice(0,max-1)}…`:text;
};
function missingPathStateKeys(row,keys){
  const [section,...nested]=keys,root=row[section];
  if(root===undefined)return{classification:"absent",present:false,value:undefined,sectionValid:true};
  const sectionValid=isPlainAuditObject(root);
  if(!sectionValid)return{classification:"invalid canonical section",present:true,value:root,sectionValid:false};
  let value=root;
  for(const key of nested){
    if(!isPlainAuditObject(value)||!Object.prototype.hasOwnProperty.call(value,key))return{classification:"absent",present:false,value:undefined,sectionValid:true};
    value=value[key];
  }
  return{classification:missingnessClassification(value,true,true),present:true,value,sectionValid:true};
}
function missingPathState(row,path){return missingPathStateKeys(row,String(path).split("."));}
const usableState=state=>state.classification==="usable";
const missingnessRaceName=row=>row.race?.meta?.raceName||row.race?.raceName||row.raceId;
const missingIssue=(row,type,section,fieldPath,classification,message,severity="warning",extra={})=>({
  severity,type,section,fieldPath,featureKey:extra.featureKey||"",featureGroup:extra.featureGroup||"",raceDate:row.date,raceName:missingnessRaceName(row),raceId:row.raceId,
  horseNumber:row.number,horseName:row.name,classification,expectedSources:extra.expectedSources||[],missingExpectedSources:extra.missingExpectedSources||[],
  message:boundedMissingMessage(message),originalIndex:row.originalIndex??`${row.raceIndex}:${row.horseIndex}`
});
function sortMissingIssues(rows=[]){
  const rank={error:0,warning:1};
  return stableSort(rows,(a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||(a.raceDate&&b.raceDate?a.raceDate.localeCompare(b.raceDate):a.raceDate?-1:b.raceDate?1:0)||
    String(a.raceId).localeCompare(String(b.raceId))||String(a.horseNumber??"").localeCompare(String(b.horseNumber??""),undefined,{numeric:true})||
    String(a.fieldPath||a.featureKey).localeCompare(String(b.fieldPath||b.featureKey))||a.type.localeCompare(b.type));
}
function dependencySourcePath(source){
  const path=String(source||"");if(CANONICAL_SECTIONS.some(section=>path===section||path.startsWith(`${section}.`)))return path;
  return `raw.${path}`;
}
export function buildMissingnessAudit(model,schemaAudit,dictionary=[]){
  const total=model.horses.length,paths=[...new Set([...CANONICAL_SECTIONS,...(schemaAudit?.inventory||[]).map(item=>item.fieldPath)])].sort(),issues=[],missingByHorse=Array.from({length:total},()=>[]),usableByPath=new Map(),pathKeys=new Map(paths.map(path=>[path,path.split(".")]));
  const summaries=paths.map(fieldPath=>{
    const section=fieldPath.split(".")[0],counts={"absent":0,"null":0,"empty string":0,"empty array":0,"empty object":0,"usable":0,"invalid canonical section":0,"non-finite number":0};
    const usable=new Uint8Array(total),keys=pathKeys.get(fieldPath);
    for(let index=0;index<total;index++){
      const row=model.horses[index],state=missingPathStateKeys(row,keys);counts[state.classification]=(counts[state.classification]||0)+1;
      if(usableState(state))usable[index]=1;else{missingByHorse[index].push(fieldPath);issues.push(missingIssue(row,"missing-or-unusable-field",section,fieldPath,state.classification,`${fieldPath}: ${state.classification}`));}
    }
    usableByPath.set(fieldPath,usable);
    const presentCount=total-counts.absent,usableValueCount=counts.usable,missingCount=total-usableValueCount;
    return{section,fieldPath,totalHorseCount:total,presentCount,missingCount,absentCount:counts.absent,nullCount:counts.null,emptyStringCount:counts["empty string"],emptyArrayCount:counts["empty array"],
      emptyObjectCount:counts["empty object"],nonFiniteNumberCount:counts["non-finite number"],invalidSectionCount:counts["invalid canonical section"],usableValueCount,
      missingnessPercentage:percentage(missingCount,total),usableValuePercentage:percentage(usableValueCount,total)};
  });
  const patternMap=new Map();
  for(let index=0;index<total;index++){
    const row=model.horses[index],missing=missingByHorse[index],key=missing.join("\u001f");
    let pattern=patternMap.get(key);if(!pattern){pattern={key,horseCount:0,missingPathCount:missing.length,missingPaths:missing.slice(0,MISSING_PATTERN_MAX_PATHS),pathsTruncated:missing.length>MISSING_PATTERN_MAX_PATHS,races:new Set()};patternMap.set(key,pattern);}
    pattern.horseCount++;pattern.races.add(row.raceId);
  }
  const allPatterns=[...patternMap.values()].sort((a,b)=>b.horseCount-a.horseCount||b.missingPathCount-a.missingPathCount||a.key.localeCompare(b.key));
  const patterns=allPatterns.slice(0,MISSING_PATTERN_MAX_DISPLAY).map((item,index)=>({patternId:`P${String(index+1).padStart(3,"0")}`,horseCount:item.horseCount,percentage:percentage(item.horseCount,total),
    missingPathCount:item.missingPathCount,missingPaths:item.missingPaths,missingPathPreview:item.missingPaths.join(" | "),pathsTruncated:item.pathsTruncated,affectedRaceCount:item.races.size,patternKey:item.key}));
  const discovered=new Set(paths),dependencies=dictionary.map(item=>{
    const featureKey=String(item.key||""),expectedSources=Array.isArray(item.sourceFields)?item.sourceFields.map(String).filter(Boolean):[],sourcePaths=expectedSources.map(dependencySourcePath);
    let usableFeatureCount=0,allExpectedSourcesPresentCount=0,usableFeatureDespiteMissingExpectedSourceCount=0,missingFeatureDespiteAllExpectedSourcesPresentCount=0,featureAndSourceCompleteCount=0;
    const metadataMissing=!expectedSources.length,undiscovered=sourcePaths.filter(path=>!discovered.has(path)&&!paths.some(item=>item.startsWith(`${path}.`)));
    const featurePath=`features.${featureKey}`,featureUsableVector=usableByPath.get(featurePath)||new Uint8Array(total),sourceUsableVectors=sourcePaths.map(path=>usableByPath.get(path)||new Uint8Array(total));
    for(let index=0;index<total;index++){
      const row=model.horses[index],featureUsable=featureUsableVector[index]===1,allSources=sourcePaths.length>0&&sourceUsableVectors.every(vector=>vector[index]===1);
      if(featureUsable)usableFeatureCount++;if(allSources)allExpectedSourcesPresentCount++;
      if(featureUsable&&sourcePaths.length&&!allSources){usableFeatureDespiteMissingExpectedSourceCount++;const missing=sourcePaths.filter((_,i)=>sourceUsableVectors[i][index]!==1),featureState=missingPathStateKeys(row,featurePath.split("."));issues.push(missingIssue(row,"usable-feature-with-missing-source","features",featureKey,featureState.classification,`${featureKey} は使用可能ですが期待sourceが欠損しています`,"warning",{featureKey,featureGroup:item.group||"",expectedSources,missingExpectedSources:missing}));}
      if(!featureUsable&&allSources){missingFeatureDespiteAllExpectedSourcesPresentCount++;const featureState=missingPathStateKeys(row,featurePath.split("."));issues.push(missingIssue(row,"missing-feature-with-complete-sources","features",featureKey,featureState.classification,`${featureKey} は全期待sourceが使用可能ですが欠損しています`,"warning",{featureKey,featureGroup:item.group||"",expectedSources}));}
      if(featureUsable&&allSources)featureAndSourceCompleteCount++;
    }
    if(metadataMissing)issues.push({severity:"warning",type:"feature-dependency-not-configured",section:"features",fieldPath:featureKey,featureKey,featureGroup:item.group||"",raceDate:"",raceName:"",raceId:"",horseNumber:"",horseName:"",classification:"not configured",expectedSources:[],missingExpectedSources:[],message:boundedMissingMessage(`${featureKey}: sourceFields が設定されていません`),originalIndex:`metadata:${featureKey}`});
    for(const path of undiscovered)issues.push({severity:"error",type:"undiscovered-expected-source",section:path.split(".")[0],fieldPath:path,featureKey,featureGroup:item.group||"",raceDate:"",raceName:"",raceId:"",horseNumber:"",horseName:"",classification:"absent",expectedSources,missingExpectedSources:[path],message:boundedMissingMessage(`${featureKey} の期待source ${path} はフィールド在庫にありません`),originalIndex:`metadata:${featureKey}:${path}`});
    return{featureKey,displayName:item.名称||item.name||featureKey,featureGroup:item.group||"",expectedSources,dependencyConfigured:!metadataMissing,horseCount:total,usableFeatureCount,allExpectedSourcesPresentCount,
      usableFeatureDespiteMissingExpectedSourceCount,missingFeatureDespiteAllExpectedSourcesPresentCount,featureAndSourceCompleteCount,dependencyCoveragePercentage:metadataMissing?null:percentage(featureAndSourceCompleteCount,total),undiscoveredExpectedSources:undiscovered};
  }).sort((a,b)=>a.featureGroup.localeCompare(b.featureGroup)||a.featureKey.localeCompare(b.featureKey));
  return{summary:summaries,patterns,patternCount:allPatterns.length,patternsTruncated:allPatterns.length>MISSING_PATTERN_MAX_DISPLAY,dependencies,issues:sortMissingIssues(issues),fieldPaths:paths};
}
export function buildCoMissingness(model,fieldPaths=[]){
  const unique=[...new Set(fieldPaths.map(String).filter(Boolean))],paths=unique.slice(0,CO_MISSINGNESS_MAX_FIELDS),selectionTruncated=unique.length>CO_MISSINGNESS_MAX_FIELDS;
  if(paths.length<2)return{valid:false,reason:"2つ以上のフィールドを選択してください",fieldPaths:paths,selectionTruncated,rows:[]};
  const rows=[];for(let left=0;left<paths.length;left++)for(let right=left+1;right<paths.length;right++){
    let bothUsable=0,leftMissingOnly=0,rightMissingOnly=0,bothMissing=0;
    for(const row of model.horses){const l=usableState(missingPathState(row,paths[left])),r=usableState(missingPathState(row,paths[right]));if(l&&r)bothUsable++;else if(!l&&r)leftMissingOnly++;else if(l&&!r)rightMissingOnly++;else bothMissing++;}
    rows.push({leftField:paths[left],rightField:paths[right],bothUsable,leftMissingOnly,rightMissingOnly,bothMissing,bothMissingPercentage:percentage(bothMissing,model.horses.length)});
  }
  return{valid:true,reason:"",fieldPaths:paths,selectionTruncated,rows};
}
export function buildMonthlyMissingness(model,fieldPath){
  if(!fieldPath)return[];
  const groups=new Map();for(const row of model.horses){const month=row.date?row.date.slice(0,7):"undated",state=missingPathState(row,fieldPath),group=groups.get(month)||{month,monthLabel:month==="undated"?"日付不明":month,horseCount:0,presentCount:0,usableCount:0,missingUnusableCount:0,missingnessPercentage:0,percentagePointDifference:null};group.horseCount++;if(state.present)group.presentCount++;if(usableState(state))group.usableCount++;else group.missingUnusableCount++;groups.set(month,group);}
  const rows=[...groups.values()].sort((a,b)=>a.month==="undated"?1:b.month==="undated"?-1:a.month.localeCompare(b.month));let previous=null;for(const row of rows){row.missingnessPercentage=percentage(row.missingUnusableCount,row.horseCount);if(row.month==="undated"){row.percentagePointDifference=null;continue;}row.percentagePointDifference=previous===null?null:Math.round((row.missingnessPercentage-previous)*10)/10;previous=row.missingnessPercentage;}return rows;
}
export function filterMissingnessSummary(rows=[],f={}){
  const q=String(f.search||"").toLowerCase();return rows.filter(row=>(!f.section||row.section===f.section)&&(!f.fieldPath||row.fieldPath.includes(f.fieldPath))&&(!numeric(f.minimumMissingness)||row.missingnessPercentage>=Number(f.minimumMissingness))&&(!numeric(f.maximumUsable)||row.usableValuePercentage<=Number(f.maximumUsable))&&(!f.issuesOnly||row.missingCount>0)&&(!q||row.fieldPath.toLowerCase().includes(q)));
}
export function filterDependencyAudit(rows=[],f={}){
  const q=String(f.search||"").toLowerCase();return rows.filter(row=>(!f.featureGroup||row.featureGroup===f.featureGroup)&&(!f.featureKey||row.featureKey.includes(f.featureKey))&&(!f.issuesOnly||!row.dependencyConfigured||row.usableFeatureDespiteMissingExpectedSourceCount||row.missingFeatureDespiteAllExpectedSourcesPresentCount||row.undiscoveredExpectedSources.length)&&(!q||`${row.featureKey} ${row.displayName}`.toLowerCase().includes(q)));
}
export function filterMissingnessIssues(rows=[],f={}){
  const q=String(f.search||"").toLowerCase();return sortMissingIssues(rows.filter(row=>(!f.severity||row.severity===f.severity)&&(!f.type||row.type===f.type)&&(!f.section||row.section===f.section)&&(!f.fieldPath||String(row.fieldPath).includes(f.fieldPath))&&(!f.featureGroup||row.featureGroup===f.featureGroup)&&(!f.featureKey||row.featureKey===f.featureKey)&&(!f.classification||row.classification===f.classification)&&(!f.raceId||row.raceId===f.raceId)&&(!f.issuesOnly||true)&&(!q||`${row.fieldPath} ${row.featureKey} ${row.raceName} ${row.horseName} ${row.message}`.toLowerCase().includes(q))));
}
export function missingnessSummaryCsv(rows=[]){return rowsCsv(["section","fieldPath","totalHorseCount","presentCount","missingCount","absentCount","nullCount","emptyStringCount","emptyArrayCount","emptyObjectCount","nonFiniteNumberCount","invalidSectionCount","usableValueCount","missingnessPercentage","usableValuePercentage"],rows.map(r=>[r.section,r.fieldPath,r.totalHorseCount,r.presentCount,r.missingCount,r.absentCount,r.nullCount,r.emptyStringCount,r.emptyArrayCount,r.emptyObjectCount,r.nonFiniteNumberCount,r.invalidSectionCount,r.usableValueCount,r.missingnessPercentage,r.usableValuePercentage]));}
export function missingnessPatternsCsv(rows=[]){return rowsCsv(["patternId","horseCount","percentage","missingPathCount","missingPathPreview","pathsTruncated","affectedRaceCount"],rows.map(r=>[r.patternId,r.horseCount,r.percentage,r.missingPathCount,boundedMissingMessage(r.missingPathPreview),r.pathsTruncated,r.affectedRaceCount]));}
export function coMissingnessCsv(rows=[]){return rowsCsv(["leftField","rightField","bothUsable","leftMissingOnly","rightMissingOnly","bothMissing","bothMissingPercentage"],rows.map(r=>[r.leftField,r.rightField,r.bothUsable,r.leftMissingOnly,r.rightMissingOnly,r.bothMissing,r.bothMissingPercentage]));}
export function dependencyAuditCsv(rows=[]){return rowsCsv(["featureKey","displayName","featureGroup","expectedSources","dependencyConfigured","horseCount","usableFeatureCount","allExpectedSourcesPresentCount","usableFeatureDespiteMissingExpectedSourceCount","missingFeatureDespiteAllExpectedSourcesPresentCount","featureAndSourceCompleteCount","dependencyCoveragePercentage","undiscoveredExpectedSources"],rows.map(r=>[r.featureKey,r.displayName,r.featureGroup,r.expectedSources.join(" | "),r.dependencyConfigured,r.horseCount,r.usableFeatureCount,r.allExpectedSourcesPresentCount,r.usableFeatureDespiteMissingExpectedSourceCount,r.missingFeatureDespiteAllExpectedSourcesPresentCount,r.featureAndSourceCompleteCount,r.dependencyCoveragePercentage,r.undiscoveredExpectedSources.join(" | ")]));}
export function monthlyMissingnessCsv(rows=[]){return rowsCsv(["month","horseCount","presentCount","usableCount","missingUnusableCount","missingnessPercentage","percentagePointDifference"],rows.map(r=>[r.monthLabel,r.horseCount,r.presentCount,r.usableCount,r.missingUnusableCount,r.missingnessPercentage,r.percentagePointDifference]));}
export function missingnessIssuesCsv(rows=[]){return rowsCsv(["severity","type","section","fieldPath","featureKey","raceDate","raceName","raceId","horseNumber","horseName","classification","expectedSources","missingExpectedSources","message"],rows.map(r=>[r.severity,r.type,r.section,r.fieldPath,r.featureKey,r.raceDate||"日付不明",r.raceName,r.raceId,r.horseNumber,r.horseName,r.classification,r.expectedSources.join(" | "),r.missingExpectedSources.join(" | "),boundedMissingMessage(r.message)]));}

export const CONSTRAINT_VALUE_PREVIEW_MAX_LENGTH=120,CONSTRAINT_ISSUE_MESSAGE_MAX_LENGTH=180;
const constraint=(id,displayName,description,severity,sections,fieldPaths,applicabilityRule)=>Object.freeze({id,displayName,description,severity,sections:Object.freeze(sections),fieldPaths:Object.freeze(fieldPaths),applicabilityRule});
export const CROSS_FIELD_CONSTRAINT_CATALOG=Object.freeze([
  constraint("C01","qualityScore range","quality.qualityScore must be a finite number from 0 through 100.","error",["quality"],["quality.qualityScore"],"Applicable when quality.qualityScore is present."),
  constraint("C02","OCR confidence range","ocr.confidence must be a finite number from 0 through 1.","error",["ocr"],["ocr.confidence"],"Applicable when ocr.confidence is present."),
  constraint("C03","missingCount integer","quality.missingCount must be a finite non-negative integer.","error",["quality"],["quality.missingCount"],"Applicable when quality.missingCount is present."),
  constraint("C04","warningCount integer","quality.warningCount must be a finite non-negative integer.","error",["quality"],["quality.warningCount"],"Applicable when quality.warningCount is present."),
  constraint("C05","errorCount integer","quality.errorCount must be a finite non-negative integer.","error",["quality"],["quality.errorCount"],"Applicable when quality.errorCount is present."),
  constraint("C06","typeErrorCount integer","quality.typeErrorCount must be a finite non-negative integer.","error",["quality"],["quality.typeErrorCount"],"Applicable when quality.typeErrorCount is present."),
  constraint("C07","abnormalCount integer","quality.abnormalCount must be a finite non-negative integer.","error",["quality"],["quality.abnormalCount"],"Applicable when quality.abnormalCount is present."),
  constraint("C08","warning count/array","quality.warningCount must equal quality.warning.length when both exist.","warning",["quality"],["quality.warningCount","quality.warning"],"Both fields are required for comparison; one-sided absence is not applicable."),
  constraint("C09","error count/array","quality.errorCount must equal quality.errors.length when both exist.","warning",["quality"],["quality.errorCount","quality.errors"],"Both fields are required for comparison; one-sided absence is not applicable."),
  constraint("C10","missing count/array","quality.missingCount must equal quality.missing.length when both exist.","warning",["quality"],["quality.missingCount","quality.missing"],"Both fields are required for comparison; one-sided absence is not applicable."),
  constraint("C11","type-error count/array","quality.typeErrorCount must equal quality.typeErrors.length when both exist.","warning",["quality"],["quality.typeErrorCount","quality.typeErrors"],"Both fields are required for comparison; one-sided absence is not applicable."),
  constraint("C12","abnormal count/array","quality.abnormalCount must equal quality.abnormalities.length when both exist.","warning",["quality"],["quality.abnormalCount","quality.abnormalities"],"Both fields are required for comparison; one-sided absence is not applicable."),
  constraint("C13","version value types","Canonical versions and corresponding logs version values must be non-empty strings.","error",["versions","logs"],["versions.*","logs.*Version"],"Applicable when any configured version pair value is present."),
  constraint("C14","version pair presence","Corresponding versions and logs version values should be present on both sides.","warning",["versions","logs"],["versions.*","logs.*Version"],"Applicable when either side of a configured version pair is present."),
  constraint("C15","version pair match","Corresponding canonical version values must match exactly.","warning",["versions","logs"],["versions.*","logs.*Version"],"Applicable when both values exist and have valid types."),
  constraint("C16","recalculation timestamp types","Canonical recalculation and history timestamps must be valid timestamp-like values.","error",["logs"],["logs.updatedAt","logs.calculatedAt","logs.recalculateHistory"],"Applicable when any designated recalculation timestamp is present."),
  constraint("C17","recalculation history order","No valid recalculateHistory.at value may be later than the canonical updatedAt/calculatedAt value.","warning",["logs"],["logs.updatedAt","logs.calculatedAt","logs.recalculateHistory[].at"],"Applicable when a canonical timestamp and at least one valid history timestamp exist."),
  constraint("C18","dictionary numeric type","Values declared numeric by feature dictionary metadata must be finite numbers when populated.","error",["features"],["features.*"],"Applicable when at least one declared numeric feature is populated."),
  constraint("C19","dictionary declared range","Feature values must remain within explicit dictionary minimum and maximum metadata.","error",["features"],["features.*"],"Applicable only when explicit finite minimum and maximum metadata exist and the feature is populated."),
  constraint("C20","dictionary pre-race metadata","availablePreRace=true must not conflict with leakageRisk=POST_RACE_ONLY.","warning",["features"],["features.*"],"Applicable when both dictionary metadata fields are configured."),
  constraint("C21","pre-race post-race population","POST_RACE_ONLY features must not be populated in an explicitly PRE_RACE snapshot.","warning",["raw","logs","features"],["raw.snapshotPhase","raw.meta.snapshotPhase","logs.snapshotPhase","features.*"],"Applicable only when an exact canonical snapshotPhase value is PRE_RACE."),
  constraint("C22","dictionary source discovery","Every configured sourceFields entry must resolve to a Phase 8/9 discovered canonical path.","error",["raw","features"],["raw.*","features.*"],"Applicable when feature dictionary sourceFields metadata is configured.")
]);
const CONSTRAINT_BY_ID=new Map(CROSS_FIELD_CONSTRAINT_CATALOG.map(item=>[item.id,item]));
const VERSION_PAIRS=Object.freeze([
  ["versions.features","logs.featureVersion"],["versions.quality","logs.qualityVersion"],["versions.ocr","logs.ocrVersion"],
  ["versions.raw","logs.rawVersion"],["versions.logs","logs.logsVersion"],["versions.horse","logs.horseVersion"]
]);
export function constraintValuePreview(value,maxLength=CONSTRAINT_VALUE_PREVIEW_MAX_LENGTH){
  let text;try{
    if(typeof value==="string")text=value;
    else if(Array.isArray(value))text=`Array(${value.length})`;
    else if(value&&typeof value==="object")text=typeof value?.toDate==="function"?"Timestamp-like":value instanceof Date?value.toISOString():`Object(${Object.keys(value).length})`;
    else text=String(value);
  }catch{text="[unavailable]";}
  return text.length>maxLength?`${text.slice(0,maxLength-1)}…`:text;
}
const boundedConstraintMessage=value=>{const text=String(value??"");return text.length>CONSTRAINT_ISSUE_MESSAGE_MAX_LENGTH?`${text.slice(0,CONSTRAINT_ISSUE_MESSAGE_MAX_LENGTH-1)}…`:text;};
function constraintPathState(row,path){
  const keys=String(path).split("."),section=keys.shift();let value=row[section];
  if(value===undefined)return{present:false,value:undefined};
  for(const key of keys){if(value===null||typeof value!=="object"||Array.isArray(value)||!Object.prototype.hasOwnProperty.call(value,key))return{present:false,value:undefined};value=value[key];}
  return{present:value!==undefined,value};
}
const constraintObserved=(items=[])=>constraintValuePreview(items.map(([path,value])=>`${path}=${constraintValuePreview(value)}`).join(" | "));
const exactFiniteNumber=value=>typeof value==="number"&&Number.isFinite(value);
const nonNegativeInteger=value=>exactFiniteNumber(value)&&Number.isInteger(value)&&value>=0;
const versionString=value=>typeof value==="string"&&value.length>0&&value.trim().length>0;
function featureRangeMetadata(item){
  const minimum=item?.minimum??item?.min??item?.minimumValue??item?.validation?.minimum??item?.validation?.min??(Array.isArray(item?.range)?item.range[0]:item?.range?.minimum??item?.range?.min);
  const maximum=item?.maximum??item?.max??item?.maximumValue??item?.validation?.maximum??item?.validation?.max??(Array.isArray(item?.range)?item.range[1]:item?.range?.maximum??item?.range?.max);
  return exactFiniteNumber(minimum)&&exactFiniteNumber(maximum)?{minimum,maximum}:null;
}
const dictionaryNumeric=item=>String(item?.型??item?.type??"").includes("number");
const dictionarySourcePath=source=>CANONICAL_SECTIONS.some(section=>String(source)===section||String(source).startsWith(`${section}.`))?String(source):`raw.${String(source)}`;
function snapshotPhase(row){
  for(const path of ["raw.snapshotPhase","raw.meta.snapshotPhase","logs.snapshotPhase"]){const state=constraintPathState(row,path);if(state.present)return{path,value:state.value};}
  return{path:"",value:undefined};
}
function constraintEvaluation(row,catalog,status,issueType="",observedValues="",expectedConstraint=catalog.description,message="",severity=catalog.severity){
  return{constraintId:catalog.id,displayName:catalog.displayName,severity,status,issueType,sections:[...catalog.sections],fieldPaths:[...catalog.fieldPaths],
    raceDate:row.date,raceName:row.race?.meta?.raceName||row.race?.raceName||row.raceId,raceId:row.raceId,horseNumber:row.number,horseName:row.name,
    observedValues:constraintValuePreview(observedValues),expectedConstraint:constraintValuePreview(expectedConstraint),message:boundedConstraintMessage(message),originalIndex:row.originalIndex??`${row.raceIndex}:${row.horseIndex}`};
}
const pass=(row,catalog,observed="",expected=catalog.description)=>constraintEvaluation(row,catalog,"pass","",observed,expected,"");
const notApplicable=(row,catalog,reason)=>constraintEvaluation(row,catalog,"not-applicable",reason,"",catalog.description,reason);
const failure=(row,catalog,type,observed,message,severity=catalog.severity)=>constraintEvaluation(row,catalog,"failure",type,observed,catalog.description,message,severity);
function evaluateRange(row,catalog,path,minimum,maximum){
  const state=constraintPathState(row,path);if(!state.present||state.value===null)return notApplicable(row,catalog,"value-missing");
  const observed=constraintObserved([[path,state.value]]);
  if(!exactFiniteNumber(state.value))return failure(row,catalog,"invalid-numeric-type",observed,`${path} is not a finite number`);
  return state.value>=minimum&&state.value<=maximum?pass(row,catalog,observed):failure(row,catalog,"out-of-range",observed,`${path} is outside ${minimum}–${maximum}`);
}
function evaluateCount(row,catalog,path){
  const state=constraintPathState(row,path);if(!state.present||state.value===null)return notApplicable(row,catalog,"count-missing");
  const observed=constraintObserved([[path,state.value]]);
  return nonNegativeInteger(state.value)?pass(row,catalog,observed):failure(row,catalog,"invalid-count-type",observed,`${path} must be a finite non-negative integer`);
}
function evaluateCountArray(row,catalog,countPath,arrayPath){
  const count=constraintPathState(row,countPath),array=constraintPathState(row,arrayPath);
  if(!count.present&&!array.present)return notApplicable(row,catalog,"count-and-array-missing");
  if(!count.present)return notApplicable(row,catalog,"count-missing");
  if(!array.present)return notApplicable(row,catalog,"array-missing");
  const observed=constraintObserved([[countPath,count.value],[arrayPath,array.value]]);
  if(!nonNegativeInteger(count.value))return failure(row,catalog,"invalid-count-type",observed,`${countPath} is invalid`);
  if(!Array.isArray(array.value))return failure(row,catalog,"invalid-array-type",observed,`${arrayPath} is not an array`);
  return count.value===array.value.length?pass(row,catalog,observed):failure(row,catalog,"count-mismatch",observed,`${countPath} does not equal ${arrayPath}.length`);
}
function evaluateConstraint(row,catalog,context){
  if(catalog.id==="C01")return evaluateRange(row,catalog,"quality.qualityScore",0,100);
  if(catalog.id==="C02")return evaluateRange(row,catalog,"ocr.confidence",0,1);
  const countPaths={C03:"quality.missingCount",C04:"quality.warningCount",C05:"quality.errorCount",C06:"quality.typeErrorCount",C07:"quality.abnormalCount"};
  if(countPaths[catalog.id])return evaluateCount(row,catalog,countPaths[catalog.id]);
  const countArrays={C08:["quality.warningCount","quality.warning"],C09:["quality.errorCount","quality.errors"],C10:["quality.missingCount","quality.missing"],C11:["quality.typeErrorCount","quality.typeErrors"],C12:["quality.abnormalCount","quality.abnormalities"]};
  if(countArrays[catalog.id])return evaluateCountArray(row,catalog,...countArrays[catalog.id]);
  if(catalog.id==="C13"){
    const present=VERSION_PAIRS.flatMap(pair=>pair.map(path=>[path,constraintPathState(row,path)])).filter(([,state])=>state.present);if(!present.length)return notApplicable(row,catalog,"version-values-missing");
    const invalid=present.filter(([,state])=>!versionString(state.value));const observed=constraintObserved(present.map(([path,state])=>[path,state.value]));
    return invalid.length?failure(row,catalog,"invalid-version-type",observed,`Invalid version paths: ${invalid.map(([path])=>path).join(", ")}`):pass(row,catalog,observed);
  }
  if(catalog.id==="C14"){
    const pairs=VERSION_PAIRS.map(([leftPath,rightPath])=>({leftPath,rightPath,left:constraintPathState(row,leftPath),right:constraintPathState(row,rightPath)})).filter(pair=>pair.left.present||pair.right.present);
    if(!pairs.length)return notApplicable(row,catalog,"version-pairs-missing");
    const oneSided=pairs.filter(pair=>pair.left.present!==pair.right.present),observed=constraintObserved(pairs.flatMap(pair=>[[pair.leftPath,pair.left.value],[pair.rightPath,pair.right.value]]));
    return oneSided.length?failure(row,catalog,"one-sided-version",observed,`One-sided version pairs: ${oneSided.map(pair=>`${pair.leftPath}/${pair.rightPath}`).join(", ")}`):pass(row,catalog,observed);
  }
  if(catalog.id==="C15"){
    const pairs=VERSION_PAIRS.map(([leftPath,rightPath])=>({leftPath,rightPath,left:constraintPathState(row,leftPath),right:constraintPathState(row,rightPath)})).filter(pair=>pair.left.present&&pair.right.present&&versionString(pair.left.value)&&versionString(pair.right.value));
    if(!pairs.length)return notApplicable(row,catalog,"valid-version-pair-missing");
    const conflicts=pairs.filter(pair=>pair.left.value!==pair.right.value),observed=constraintObserved(pairs.flatMap(pair=>[[pair.leftPath,pair.left.value],[pair.rightPath,pair.right.value]]));
    return conflicts.length?failure(row,catalog,"conflicting-version",observed,`Conflicting version pairs: ${conflicts.map(pair=>`${pair.leftPath}/${pair.rightPath}`).join(", ")}`):pass(row,catalog,observed);
  }
  if(catalog.id==="C16"||catalog.id==="C17"){
    const canonicalPaths=["logs.updatedAt","logs.calculatedAt"],canonical=canonicalPaths.map(path=>[path,constraintPathState(row,path)]).filter(([,state])=>state.present);
    const historyState=constraintPathState(row,"logs.recalculateHistory"),history=historyState.present&&Array.isArray(historyState.value)?historyState.value:[];
    const historyItems=history.map((item,index)=>[`logs.recalculateHistory[${index}].at`,item?.at]).filter(([,value])=>value!==undefined);
    if(catalog.id==="C16"){
      const timestampItems=[...canonical.map(([path,state])=>[path,state.value]),...historyItems];if(!timestampItems.length)return notApplicable(row,catalog,"timestamps-missing");
      if(historyState.present&&!Array.isArray(historyState.value))return failure(row,catalog,"invalid-history-type",constraintObserved([["logs.recalculateHistory",historyState.value]]),"logs.recalculateHistory is not an array");
      const invalid=timestampItems.filter(([,value])=>parseAuditTimestamp(value).kind!=="valid"),observed=constraintObserved(timestampItems);
      return invalid.length?failure(row,catalog,"invalid-timestamp",observed,`Invalid timestamp paths: ${invalid.map(([path])=>path).join(", ")}`):pass(row,catalog,observed);
    }
    const canonicalValid=canonical.map(([path,state])=>[path,parseAuditTimestamp(state.value)]).filter(([,parsed])=>parsed.kind==="valid"),historyValid=historyItems.map(([path,value])=>[path,parseAuditTimestamp(value)]).filter(([,parsed])=>parsed.kind==="valid");
    if(!canonicalValid.length||!historyValid.length)return notApplicable(row,catalog,"comparable-timestamps-missing");
    const canonicalLatest=canonicalValid.map(([,parsed])=>parsed.iso).sort().at(-1),later=historyValid.filter(([,parsed])=>parsed.iso>canonicalLatest),observed=constraintObserved([...canonical.map(([path,state])=>[path,state.value]),...historyItems]);
    return later.length?failure(row,catalog,"history-later-than-canonical",observed,`History entries later than canonical timestamp: ${later.map(([path])=>path).join(", ")}`):pass(row,catalog,observed);
  }
  if(catalog.id==="C18"){
    const populated=context.numericDefinitions.map(item=>[item,typeof row.features==="object"&&row.features!==null?row.features[item.key]:undefined]).filter(([,value])=>value!==undefined&&value!==null);
    if(!populated.length)return notApplicable(row,catalog,context.numericDefinitions.length?"numeric-features-missing":"metadata-not-configured");
    const invalid=populated.filter(([,value])=>!exactFiniteNumber(value)),observed=constraintObserved(populated.map(([item,value])=>[`features.${item.key}`,value]));
    return invalid.length?failure(row,catalog,"dictionary-numeric-type-conflict",observed,`Non-numeric declared features: ${invalid.map(([item])=>item.key).join(", ")}`):pass(row,catalog,observed);
  }
  if(catalog.id==="C19"){
    const populated=context.rangedDefinitions.map(({item,range})=>({item,range,value:typeof row.features==="object"&&row.features!==null?row.features[item.key]:undefined})).filter(entry=>entry.value!==undefined&&entry.value!==null&&exactFiniteNumber(entry.value));
    if(!context.rangedDefinitions.length)return notApplicable(row,catalog,"metadata-not-configured");if(!populated.length)return notApplicable(row,catalog,"ranged-features-missing");
    const invalid=populated.filter(entry=>entry.value<entry.range.minimum||entry.value>entry.range.maximum),observed=constraintObserved(populated.map(entry=>[`features.${entry.item.key}`,entry.value]));
    return invalid.length?failure(row,catalog,"dictionary-range-conflict",observed,`Out-of-range features: ${invalid.map(entry=>entry.item.key).join(", ")}`):pass(row,catalog,observed);
  }
  if(catalog.id==="C20"){
    if(!context.metadataConfigured.length)return notApplicable(row,catalog,"metadata-not-configured");
    const conflicts=context.metadataConfigured.filter(item=>item.availablePreRace===true&&item.leakageRisk==="POST_RACE_ONLY"),observed=constraintObserved(conflicts.map(item=>[`features.${item.key}`,`${item.availablePreRace}/${item.leakageRisk}`]));
    return conflicts.length?failure(row,catalog,"feature-metadata-conflict",observed,`Conflicting dictionary entries: ${conflicts.map(item=>item.key).join(", ")}`):pass(row,catalog,`configured=${context.metadataConfigured.length}`);
  }
  if(catalog.id==="C21"){
    const phase=snapshotPhase(row);if(phase.value!=="PRE_RACE")return notApplicable(row,catalog,phase.path?"snapshot-not-pre-race":"snapshot-metadata-missing");
    const populated=context.postRaceDefinitions.filter(item=>typeof row.features==="object"&&row.features!==null&&missingnessClassification(row.features[item.key],Object.prototype.hasOwnProperty.call(row.features,item.key))==="usable");
    const observed=constraintObserved([[phase.path,phase.value],...populated.map(item=>[`features.${item.key}`,row.features[item.key]])]);
    return populated.length?failure(row,catalog,"post-race-feature-in-pre-race-snapshot",observed,`POST_RACE_ONLY features populated: ${populated.map(item=>item.key).join(", ")}`):pass(row,catalog,observed);
  }
  if(catalog.id==="C22"){
    if(!context.sourceDefinitions.length)return notApplicable(row,catalog,"metadata-not-configured");
    const observed=constraintObserved(context.undiscoveredSources.map(path=>[path,"undiscovered"]));
    return context.undiscoveredSources.length?failure(row,catalog,"undiscovered-expected-source",observed,`Undiscovered source paths: ${context.undiscoveredSources.join(", ")}`):pass(row,catalog,`configured=${context.sourceDefinitions.length}`);
  }
  return notApplicable(row,catalog,"constraint-not-configured");
}
function sortConstraintIssues(rows=[]){
  const rank={error:0,warning:1};
  return stableSort(rows,(a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||a.constraintId.localeCompare(b.constraintId)||(a.raceDate&&b.raceDate?a.raceDate.localeCompare(b.raceDate):a.raceDate?-1:b.raceDate?1:0)||
    String(a.raceId).localeCompare(String(b.raceId))||String(a.horseNumber??"").localeCompare(String(b.horseNumber??""),undefined,{numeric:true})||String(a.originalIndex).localeCompare(String(b.originalIndex),undefined,{numeric:true}));
}
export function buildCrossFieldConstraintAudit(model,schemaAudit,missingAudit,dictionary=[]){
  const discoveredPaths=new Set([...(missingAudit?.fieldPaths||[]),...(schemaAudit?.inventory||[]).map(item=>item.fieldPath)]),numericDefinitions=dictionary.filter(dictionaryNumeric),
    rangedDefinitions=dictionary.map(item=>({item,range:featureRangeMetadata(item)})).filter(entry=>entry.range),metadataConfigured=dictionary.filter(item=>typeof item.availablePreRace==="boolean"&&typeof item.leakageRisk==="string"&&item.leakageRisk),
    postRaceDefinitions=dictionary.filter(item=>item.leakageRisk==="POST_RACE_ONLY"),sourceDefinitions=dictionary.filter(item=>Array.isArray(item.sourceFields)&&item.sourceFields.length),
    sourcePaths=[...new Set(sourceDefinitions.flatMap(item=>item.sourceFields.map(dictionarySourcePath)))].sort(),undiscoveredSources=sourcePaths.filter(path=>!discoveredPaths.has(path)&&![...discoveredPaths].some(item=>item.startsWith(`${path}.`))),
    context={numericDefinitions,rangedDefinitions,metadataConfigured,postRaceDefinitions,sourceDefinitions,undiscoveredSources},evaluations=[];
  model.horses.forEach((row,index)=>{row.originalIndex=index;for(const item of CROSS_FIELD_CONSTRAINT_CATALOG)evaluations.push(evaluateConstraint(row,item,context));});
  const issues=sortConstraintIssues(evaluations.filter(item=>item.status==="failure"));
  const evaluationsByConstraint=new Map(CROSS_FIELD_CONSTRAINT_CATALOG.map(item=>[item.id,[]])),evaluationsByRace=new Map(model.races.map(race=>[race.raceId,[]]));
  for(const item of evaluations){evaluationsByConstraint.get(item.constraintId).push(item);evaluationsByRace.get(item.raceId)?.push(item);}
  const constraintSummary=CROSS_FIELD_CONSTRAINT_CATALOG.map(item=>{
    const rows=evaluationsByConstraint.get(item.id),applicable=rows.filter(row=>row.status!=="not-applicable"),failed=applicable.filter(row=>row.status==="failure"),affected=[...new Map(failed.map(row=>[row.raceId,row])).values()],
      dated=affected.filter(row=>row.raceDate).sort((a,b)=>b.raceDate.localeCompare(a.raceDate)||a.raceId.localeCompare(b.raceId)),recent=dated[0]||affected.sort((a,b)=>a.raceId.localeCompare(b.raceId)).at(-1)||null;
    return{constraintId:item.id,displayName:item.displayName,severity:item.severity,sections:[...item.sections],fieldPaths:[...item.fieldPaths],applicableHorseCount:applicable.length,passedCount:applicable.length-failed.length,failedCount:failed.length,
      notApplicableCount:rows.length-applicable.length,conformancePercentage:applicable.length?percentage(applicable.length-failed.length,applicable.length):null,affectedRaceCount:affected.length,mostRecentAffectedRace:recent?recent.raceName:"",mostRecentAffectedRaceId:recent?recent.raceId:"",mostRecentAffectedRaceDate:recent?recent.raceDate:""};
  });
  const raceSummary=model.races.map(race=>{
    const rows=evaluationsByRace.get(race.raceId),applicable=rows.filter(row=>row.status!=="not-applicable"),failed=applicable.filter(row=>row.status==="failure");
    return{raceDate:race.date,raceName:race.race?.meta?.raceName||race.race?.raceName||race.raceId,raceId:race.raceId,horseCount:race.horseCount,applicableConstraintCount:applicable.length,passedCount:applicable.length-failed.length,
      warningCount:failed.filter(row=>row.severity==="warning").length,errorCount:failed.filter(row=>row.severity==="error").length,notApplicableCount:rows.length-applicable.length,conformancePercentage:applicable.length?percentage(applicable.length-failed.length,applicable.length):null};
  }).sort((a,b)=>a.raceDate&&b.raceDate?a.raceDate.localeCompare(b.raceDate):a.raceDate?-1:b.raceDate?1:a.raceId.localeCompare(b.raceId));
  const registrationLabels=["both-registered","quality-only","ocr-only","neither-registered"],registrationRows=model.horses.map(row=>{
    const quality=constraintPathState(row,"quality.qualityScore"),ocr=constraintPathState(row,"ocr.confidence"),qualityRegistered=exactFiniteNumber(quality.value),ocrRegistered=exactFiniteNumber(ocr.value);
    return{label:qualityRegistered&&ocrRegistered?"both-registered":qualityRegistered?"quality-only":ocrRegistered?"ocr-only":"neither-registered",quality:quality.value,ocr:ocr.value};
  }),validBoth=registrationRows.filter(row=>row.label==="both-registered"&&row.quality>=0&&row.quality<=100&&row.ocr>=0&&row.ocr<=1),
    registrationSummary={distribution:registrationLabels.map(label=>{const count=registrationRows.filter(row=>row.label===label).length;return{label,count,percentage:percentage(count,registrationRows.length)};}),validBothCount:validBoth.length,
      averageQualityScore:average(validBoth.map(row=>row.quality)),averageOcrConfidence:average(validBoth.map(row=>row.ocr))};
  return{catalog:CROSS_FIELD_CONSTRAINT_CATALOG,evaluations,constraintSummary,raceSummary,issues,registrationSummary};
}
export function buildMonthlyConstraintTrend(audit,constraintId){
  const rows=(audit?.evaluations||[]).filter(row=>row.constraintId===constraintId),groups=new Map();for(const row of rows){const month=row.raceDate?row.raceDate.slice(0,7):"undated",group=groups.get(month)||{month,monthLabel:month==="undated"?"日付不明":month,applicableHorseCount:0,passedCount:0,failedCount:0,notApplicableCount:0,conformancePercentage:null,percentagePointDifference:null};if(row.status==="not-applicable")group.notApplicableCount++;else{group.applicableHorseCount++;if(row.status==="pass")group.passedCount++;else group.failedCount++;}groups.set(month,group);}
  const result=[...groups.values()].sort((a,b)=>a.month==="undated"?1:b.month==="undated"?-1:a.month.localeCompare(b.month));let previous=null;for(const row of result){row.conformancePercentage=row.applicableHorseCount?percentage(row.passedCount,row.applicableHorseCount):null;if(row.month==="undated"||row.conformancePercentage===null){row.percentagePointDifference=null;continue;}row.percentagePointDifference=previous===null?null:Math.round((row.conformancePercentage-previous)*10)/10;previous=row.conformancePercentage;}return result;
}
export function filterConstraintSummary(rows=[],f={}){
  const q=String(f.search||"").toLowerCase();return rows.filter(row=>(!f.severity||row.severity===f.severity)&&(!f.constraintId||row.constraintId===f.constraintId)&&(!f.section||row.sections.includes(f.section))&&(!f.fieldPath||row.fieldPaths.some(path=>path.includes(f.fieldPath)))&&(!f.applicableOnly||row.applicableHorseCount>0)&&(!f.failuresOnly||row.failedCount>0)&&(!q||`${row.constraintId} ${row.displayName} ${row.fieldPaths.join(" ")}`.toLowerCase().includes(q)));
}
export function filterRaceConstraintSummary(rows=[],f={}){
  return rows.filter(row=>(!f.raceId||row.raceId===f.raceId)&&(!numeric(f.minimumRaceConformance)||row.conformancePercentage!==null&&row.conformancePercentage>=Number(f.minimumRaceConformance))&&(!numeric(f.maximumRaceConformance)||row.conformancePercentage!==null&&row.conformancePercentage<=Number(f.maximumRaceConformance))&&(!f.applicableOnly||row.applicableConstraintCount>0)&&(!f.failuresOnly||row.warningCount+row.errorCount>0));
}
export function filterConstraintIssues(rows=[],f={}){
  const q=String(f.search||"").toLowerCase();return sortConstraintIssues(rows.filter(row=>(!f.severity||row.severity===f.severity)&&(!f.constraintId||row.constraintId===f.constraintId)&&(!f.issueType||row.issueType===f.issueType)&&(!f.section||row.sections.includes(f.section))&&(!f.fieldPath||row.fieldPaths.some(path=>path.includes(f.fieldPath)))&&(!f.raceId||row.raceId===f.raceId)&&(!q||`${row.constraintId} ${row.fieldPaths.join(" ")} ${row.raceName} ${row.horseName} ${row.message}`.toLowerCase().includes(q))));
}
export function constraintCatalogCsv(rows=CROSS_FIELD_CONSTRAINT_CATALOG){return rowsCsv(["constraintId","displayName","description","severity","sections","fieldPaths","applicabilityRule"],rows.map(r=>[r.id,r.displayName,r.description,r.severity,r.sections.join(" | "),r.fieldPaths.join(" | "),r.applicabilityRule]));}
export function constraintSummaryCsv(rows=[]){return rowsCsv(["constraintId","displayName","severity","applicableHorseCount","passedCount","failedCount","notApplicableCount","conformancePercentage","affectedRaceCount","mostRecentAffectedRace","mostRecentAffectedRaceId","mostRecentAffectedRaceDate"],rows.map(r=>[r.constraintId,r.displayName,r.severity,r.applicableHorseCount,r.passedCount,r.failedCount,r.notApplicableCount,r.conformancePercentage,r.affectedRaceCount,r.mostRecentAffectedRace,r.mostRecentAffectedRaceId,r.mostRecentAffectedRaceDate]));}
export function raceConstraintSummaryCsv(rows=[]){return rowsCsv(["raceDate","raceName","raceId","horseCount","applicableConstraintCount","passedCount","warningCount","errorCount","notApplicableCount","conformancePercentage"],rows.map(r=>[r.raceDate||"日付不明",r.raceName,r.raceId,r.horseCount,r.applicableConstraintCount,r.passedCount,r.warningCount,r.errorCount,r.notApplicableCount,r.conformancePercentage]));}
export function monthlyConstraintTrendCsv(rows=[]){return rowsCsv(["month","applicableHorseCount","passedCount","failedCount","notApplicableCount","conformancePercentage","percentagePointDifference"],rows.map(r=>[r.monthLabel,r.applicableHorseCount,r.passedCount,r.failedCount,r.notApplicableCount,r.conformancePercentage,r.percentagePointDifference]));}
export function constraintIssuesCsv(rows=[]){return rowsCsv(["severity","constraintId","issueType","sections","fieldPaths","raceDate","raceName","raceId","horseNumber","horseName","observedValues","expectedConstraint","message"],rows.map(r=>[r.severity,r.constraintId,r.issueType,r.sections.join(" | "),r.fieldPaths.join(" | "),r.raceDate||"日付不明",r.raceName,r.raceId,r.horseNumber,r.horseName,constraintValuePreview(r.observedValues),constraintValuePreview(r.expectedConstraint),boundedConstraintMessage(r.message)]));}

export function buildResearchDashboard(races=[]){
  const horses=races.flatMap(race=>(race.horses||[]).map(horse=>({race,horse})));
  const qualityScores=horses.map(({horse})=>horse.quality?.qualityScore).filter(numeric).map(Number);
  const ocrConfidences=horses.map(({horse})=>horse.ocr?.confidence).filter(numeric).map(Number);
  const numericFeatures=new Set();
  const versions={dataModel:[],feature:[]};
  const recalculations=[];

  for(const {race,horse} of horses){
    for(const [key,value] of Object.entries(horse.features||{}))if(numeric(value))numericFeatures.add(key);
    versions.dataModel.push(horse.versions?.horse,race.dataModelVersion);
    versions.feature.push(horse.logs?.featureVersion,horse.versions?.features,race.featureSchemaVersion,race.featureVersion);
    const recalculatedAt=lastRecalculation(horse);
    if(recalculatedAt)recalculations.push(recalculatedAt);
  }

  const raceIds=new Set(races.map((race,index)=>race.raceId||`race-${index}`));
  const raceCount=raceIds.size;
  return{
    raceCount,
    horseCount:horses.length,
    resultRegisteredHorseCount:horses.filter(({horse})=>numeric(horse.features?.finish_position??horse.raw?.resultCsv?.finish??horse.raw?.result?.finish??horse.result?.finish)).length,
    numericFeatureCount:numericFeatures.size,
    averageQualityScore:average(qualityScores),
    averageOcrConfidence:average(ocrConfidences),
    totalMissingCount:horses.reduce((sum,{horse})=>sum+number(horse.quality?.missingCount),0),
    warningAndErrorCount:horses.reduce((sum,{horse})=>sum+number(horse.quality?.warningCount??horse.quality?.warning?.length)+number(horse.quality?.errorCount),0),
    progressTo50:Math.min(100,Math.round(raceCount/RESEARCH_RACE_TARGET*100)),
    dataModelVersion:versions.dataModel.find(Boolean)||"-",
    featureVersion:versions.feature.find(Boolean)||"-",
    lastRecalculationTime:recalculations.sort().at(-1)||null,
    showAiTrainingControls:raceCount>=RESEARCH_RACE_TARGET
  };
}
