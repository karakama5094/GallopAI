import test from "node:test";
import assert from "node:assert/strict";
import {buildCanonicalResearchModel,buildConsistencyDiagnostics,createRenderGeneration,diagnosticsCsv,filterDiagnostics,paginate,stableSort,buildFeatureCoverage,buildFeatureStability,coverageClass,featureCoverageCsv,featureStabilityWarnings,filterFeatureCoverage,buildMonthlyTrends,buildQualityDetails,buildRaceTrends,buildResearchDashboard,comparePeriods,filterProblematicHorses,monthlyTrendsCsv,periodComparisonCsv,problematicHorsesCsv,raceTrendsCsv,sortProblematicHorses} from "./research-dashboard.js";

const horse=(overrides={})=>({
  features:{speed:10,finish_position:2},
  quality:{qualityScore:80,missingCount:2,warningCount:1,errorCount:0},
  ocr:{confidence:.8},
  logs:{featureVersion:"features-2",updatedAt:"2026-01-01T00:00:00.000Z",recalculateHistory:[]},
  versions:{horse:"horse-3",features:"features-2"},
  ...overrides
});

test("aggregates every Phase 1 metric from canonical Horse root sections",()=>{
  const dashboard=buildResearchDashboard([
    {raceId:"r1",dataModelVersion:"race-fallback",horses:[
      horse(),
      horse({
        features:{speed:12,power:4},
        quality:{qualityScore:100,missingCount:3,warningCount:0,errorCount:2},
        ocr:{confidence:1},
        logs:{featureVersion:"features-2",updatedAt:"2026-02-01T00:00:00.000Z"}
      })
    ]}
  ]);
  assert.deepEqual(dashboard,{
    raceCount:1,
    horseCount:2,
    resultRegisteredHorseCount:1,
    numericFeatureCount:3,
    averageQualityScore:90,
    averageOcrConfidence:.9,
    totalMissingCount:5,
    warningAndErrorCount:3,
    progressTo50:2,
    dataModelVersion:"horse-3",
    featureVersion:"features-2",
    lastRecalculationTime:"2026-02-01T00:00:00.000Z",
    showAiTrainingControls:false
  });
});

test("does not use summary-level quality or OCR fallbacks",()=>{
  const dashboard=buildResearchDashboard([{raceId:"r1",quality:{qualityScore:1},ocr:{confidence:.1},horses:[horse({quality:{},ocr:{}})]}]);
  assert.equal(dashboard.averageQualityScore,null);
  assert.equal(dashboard.averageOcrConfidence,null);
});

test("shows AI controls only at the 50-race threshold",()=>{
  const races=Array.from({length:50},(_,index)=>({raceId:`r${index}`,horses:[]}));
  assert.equal(buildResearchDashboard(races.slice(0,49)).showAiTrainingControls,false);
  assert.equal(buildResearchDashboard(races).showAiTrainingControls,true);
});

test("uses exact quality and OCR distribution boundaries and tracks missing OCR",()=>{
  const scores=[90,80,70,69],ocr=[.9,.8,.7,.69];
  const horses=scores.map((score,index)=>horse({quality:{qualityScore:score},ocr:{confidence:ocr[index]}}));
  horses.push(horse({quality:{},ocr:{}}));
  const details=buildQualityDetails([{raceId:"r1",horses}]);
  assert.deepEqual(details.qualityDistribution.map(({count})=>count),[1,1,1,1]);
  assert.deepEqual(details.ocrDistribution.map(({count})=>count),[1,1,1,1,1]);
  assert.deepEqual(details.ocrDistribution.map(({percentage})=>percentage),[20,20,20,20,20]);
});

test("totals every issue category",()=>{
  const details=buildQualityDetails([{raceId:"r1",horses:[horse({quality:{
    qualityScore:50,missingCount:2,warningCount:3,errorCount:4,typeErrorCount:5,
    abnormalCount:6,duplicateFlag:true,validationStatus:"ERROR",issues:[{message:"bad"}]
  }})]}]);
  assert.deepEqual(details.issueTotals,{missingCount:2,warningCount:3,errorCount:4,typeErrorCount:5,abnormalCount:6,duplicateFlagCount:1});
});

test("sorts errors first and then lowest qualityScore",()=>{
  const rows=[
    {horseName:"low",errorCount:0,qualityScore:20,raceDate:"",horseNumber:1},
    {horseName:"error-high",errorCount:2,qualityScore:90,raceDate:"",horseNumber:2},
    {horseName:"error-low",errorCount:2,qualityScore:40,raceDate:"",horseNumber:3}
  ];
  assert.deepEqual(sortProblematicHorses(rows).map(row=>row.horseName),["error-low","error-high","low"]);
});

test("filters status, quality range, OCR ceiling, and issues",()=>{
  const rows=[
    {validationStatus:"ERROR",qualityScore:60,ocrConfidence:.5,hasIssues:true,errorCount:1,raceDate:"",horseNumber:1},
    {validationStatus:"ERROR",qualityScore:80,ocrConfidence:.9,hasIssues:false,errorCount:0,raceDate:"",horseNumber:2},
    {validationStatus:"WARNING",qualityScore:70,ocrConfidence:.6,hasIssues:true,errorCount:0,raceDate:"",horseNumber:3}
  ];
  const filtered=filterProblematicHorses(rows,{validationStatus:"ERROR",minQualityScore:50,maxQualityScore:70,maxOcrConfidence:.7,issuesOnly:true});
  assert.deepEqual(filtered.map(row=>row.horseNumber),[1]);
});

test("quality details ignore race summary quality and OCR",()=>{
  const details=buildQualityDetails([{raceId:"r1",quality:{qualityScore:10},ocr:{confidence:.1},horses:[horse({quality:{},ocr:{}})]}]);
  assert.equal(details.qualityDistribution.reduce((sum,item)=>sum+item.count,0),0);
  assert.equal(details.ocrDistribution.at(-1).count,1);
});

test("CSV escapes commas, quotes, and newlines",()=>{
  const csv=problematicHorsesCsv([{
    raceDate:"2026-01-01",raceName:'A, "Race"',horseNumber:1,horseName:"Line\nBreak",
    qualityScore:50,ocrConfidence:.5,validationStatus:"ERROR",missingCount:1,warningCount:2,errorCount:3,
    issueMessages:['quoted "issue"']
  }]);
  assert.match(csv,/"A, ""Race"""/);
  assert.match(csv,/"Line\nBreak"/);
  assert.match(csv,/"quoted ""issue"""/);
});

test("sorts race trends chronologically and places undated races last",()=>{
  const trends=buildRaceTrends([
    {raceId:"late",meta:{date:"2026-02-01"},horses:[]},
    {raceId:"missing",meta:{},horses:[]},
    {raceId:"early",meta:{date:"2026-01-01"},horses:[]}
  ]);
  assert.deepEqual(trends.map(row=>row.raceId),["early","late","missing"]);
  assert.equal(trends.at(-1).dateLabel,"日付不明");
});

test("groups months and uses horse-weighted averages",()=>{
  const trends=buildRaceTrends([
    {raceId:"one",meta:{date:"2026-01-01"},horses:[horse({quality:{qualityScore:100},ocr:{confidence:1}})]},
    {raceId:"three",meta:{date:"2026-01-02"},horses:Array.from({length:3},()=>horse({quality:{qualityScore:0},ocr:{confidence:0}}))},
    {raceId:"undated",horses:[horse({quality:{qualityScore:50},ocr:{confidence:.5}})]}
  ]);
  const monthly=buildMonthlyTrends(trends);
  assert.equal(monthly[0].month,"2026-01");
  assert.equal(monthly[0].averageQualityScore,25);
  assert.equal(monthly[0].averageOcrConfidence,.25);
  assert.equal(monthly.at(-1).month,"undated");
});

test("period comparison includes both date boundaries and calculates differences",()=>{
  const trends=buildRaceTrends([
    {raceId:"a",meta:{date:"2026-01-01"},horses:[horse({quality:{qualityScore:50}})]},
    {raceId:"b",meta:{date:"2026-01-31"},horses:[horse({quality:{qualityScore:100}})]},
    {raceId:"c",meta:{date:"2025-01-01"},horses:[horse({quality:{qualityScore:50}})]}
  ]);
  const result=comparePeriods(trends,{currentStart:"2026-01-01",currentEnd:"2026-01-31",comparisonStart:"2025-01-01",comparisonEnd:"2025-01-01"});
  assert.equal(result.valid,true);
  assert.equal(result.current.raceCount,2);
  assert.equal(result.current.averageQualityScore,75);
  assert.equal(result.differences.averageQualityScore.absolute,25);
  assert.equal(result.differences.averageQualityScore.percentageChange,50);
});

test("detects missing and reversed periods",()=>{
  assert.equal(comparePeriods([],{}).valid,false);
  assert.equal(comparePeriods([],{currentStart:"2026-02-01",currentEnd:"2026-01-01",comparisonStart:"2025-01-01",comparisonEnd:"2025-01-31"}).valid,false);
});

test("marks percentage change not calculable for zero or missing baselines",()=>{
  const trends=buildRaceTrends([{raceId:"current",meta:{date:"2026-01-01"},horses:[horse({quality:{qualityScore:80}})]}]);
  const result=comparePeriods(trends,{currentStart:"2026-01-01",currentEnd:"2026-01-01",comparisonStart:"2025-01-01",comparisonEnd:"2025-01-31"});
  assert.equal(result.differences.raceCount.absolute,1);
  assert.equal(result.differences.raceCount.percentageChange,null);
  assert.equal(result.differences.averageQualityScore.absolute,null);
});

test("trend quality and OCR use canonical Horse roots only",()=>{
  const trends=buildRaceTrends([{raceId:"r",meta:{date:"2026-01-01"},quality:{qualityScore:1},ocr:{confidence:.1},horses:[horse({quality:{qualityScore:90},ocr:{confidence:.9}})]}]);
  assert.equal(trends[0].averageQualityScore,90);
  assert.equal(trends[0].averageOcrConfidence,.9);
});

test("trend CSV exports escape labels and comparison data",()=>{
  const trends=buildRaceTrends([{raceId:"r",meta:{date:"2026-01-01",raceName:'A, "Race"'},horses:[]}]);
  assert.match(raceTrendsCsv(trends),/"A, ""Race"""/);
  assert.match(monthlyTrendsCsv(buildMonthlyTrends(trends)),/2026-01/);
  const comparison=comparePeriods(trends,{currentStart:"2026-01-01",currentEnd:"2026-01-01",comparisonStart:"2026-01-01",comparisonEnd:"2026-01-01"});
  assert.match(periodComparisonCsv(comparison),/absoluteDifference/);
});

test("feature coverage handles numeric, nonnumeric, missing, zero, and population SD",()=>{
 const rows=buildFeatureCoverage([{horses:[horse({features:{x:0}}),horse({features:{x:2,y:"bad"}}),horse({features:{}})]}],[{key:"x",名称:"X",group:"g",availablePreRace:true,leakageRisk:"PRE"}]);
 assert.equal(rows[0].numericCount,2);assert.equal(rows[0].missingCount,1);assert.equal(rows[0].zeroValueCount,1);assert.equal(rows[0].mean,1);assert.equal(rows[0].standardDeviation,1);
});
test("coverage boundaries and combined filters",()=>{
 assert.deepEqual([95,80,50,49.9].map(coverageClass),["excellent","good","warning","critical"]);
 const rows=[{key:"abc",name:"Alpha",group:"g",coverageClass:"good",availablePreRace:true,leakageRisk:"LOW",coveragePercentage:85}];
 assert.equal(filterFeatureCoverage(rows,{group:"g",coverageClass:"good",availablePreRace:"true",leakageRisk:"LOW",minimumCoverage:80,search:"alp"}).length,1);
});
test("monthly stability ordering, undated, changes and warnings",()=>{
 const races=[{meta:{date:"2026-01-01"},horses:Array.from({length:3},()=>horse({features:{x:10}}))},{meta:{date:"2026-02-01"},horses:[horse({features:{}}),horse({features:{}}),horse({features:{}})]},{horses:Array.from({length:3},()=>horse({features:{x:20}}))}];
 const rows=buildFeatureStability(races,"x"),warnings=featureStabilityWarnings(rows);
 assert.deepEqual(rows.map(r=>r.month),["2026-01","2026-02","undated"]);assert.equal(rows[1].meanDifference,null);
 assert.ok(warnings.some(w=>w.type==="newly-missing"));assert.ok(warnings.some(w=>w.type==="newly-restored"));assert.ok(warnings.some(w=>w.type==="zero-variance"));assert.ok(warnings.some(w=>w.type==="insufficient-sample"));
});
test("feature audit uses canonical roots and escapes CSV",()=>{
 const rows=buildFeatureCoverage([{features:{x:999},horses:[horse({features:{x:1}})]}],[{key:"x",名称:'X, "name"'}]);
 assert.equal(rows[0].mean,1);assert.match(featureCoverageCsv(rows),/"X, ""name"""/);
});

test("shared canonical model and diagnostics cover all consistency rules",()=>{
 const complete=horse(),bad={number:1,raw:{},features:{},quality:{qualityScore:101},ocr:{confidence:2},logs:{},versions:{horse:"v2",features:"f2",quality:"q2",ocr:"o2",logs:"l2"}};
 const model=buildCanonicalResearchModel([{raceId:"dup",meta:{date:"bad"},horses:[complete,{...bad,number:1},{...bad,number:1}]},{raceId:"dup",meta:{date:"2026-01-01"},horses:[horse({versions:{horse:"v3"}})]}]);
 assert.equal(model.horses.length,4);const types=buildConsistencyDiagnostics(model).map(x=>x.type);
 for(const t of ["duplicate-race-id","duplicate-horse-number","invalid-race-date","invalid-quality-score","invalid-ocr-confidence","version-inconsistency"])assert.ok(types.includes(t));
 const missing=buildConsistencyDiagnostics(buildCanonicalResearchModel([{raceId:"x",meta:{date:"2026-01-01"},horses:[{number:1}]}])).map(x=>x.type);
 for(const s of ["raw","features","quality","ocr","logs","versions"])assert.ok(missing.includes(`missing-section-${s}`));
});
test("stable sorting, pagination, filtering and CSV use all rows",()=>{
 const rows=[{id:"a",v:1},{id:"b",v:1},{id:"c",v:0}];assert.deepEqual(stableSort(rows,(a,b)=>a.v-b.v).map(x=>x.id),["c","a","b"]);
 assert.deepEqual(paginate(Array.from({length:101},(_,i)=>i),3,50),{rows:[100],page:3,pageSize:50,total:101,totalPages:3,start:101,end:101});
 const d=[{severity:"error",type:"x",raceId:"R,1",horseNumber:1,message:'bad "x"'},{severity:"warning",type:"y",raceId:"R2",horseNumber:2,message:"ok"}];
 assert.equal(filterDiagnostics(d,{severity:"error",raceId:"r,1"}).length,1);assert.match(diagnosticsCsv(d),/"R,1"/);
});
test("progressive render generations cancel stale work",()=>{const g=createRenderGeneration(),a=g.next(),b=g.next();assert.equal(g.isCurrent(a),false);assert.equal(g.isCurrent(b),true);g.cancel();assert.equal(g.isCurrent(b),false);});
test("1000 races and 20000 Horses build within 2 seconds",()=>{
 const h=horse(),races=Array.from({length:1000},(_,i)=>({raceId:`r${i}`,meta:{date:"2026-01-01"},horses:Array.from({length:20},(_,n)=>({...h,number:n+1}))}));
 const start=performance.now(),model=buildCanonicalResearchModel(races),elapsed=performance.now()-start;assert.equal(model.horses.length,20000);assert.ok(elapsed<2000,`elapsed ${elapsed}ms`);
});
