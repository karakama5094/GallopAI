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
