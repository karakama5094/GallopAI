import test from "node:test";
import assert from "node:assert/strict";
import {buildCanonicalResearchModel,buildConsistencyDiagnostics,buildSchemaTypeAudit,buildVersionRecalculationAudit,buildProvenanceFreshnessAudit,createRenderGeneration,diagnosticsCsv,filterDiagnostics,filterProvenanceIssues,filterSchemaInventory,filterSchemaIssues,filterVersionAuditIssues,freshnessSummaryCsv,paginate,provenanceIssuesCsv,provenanceRaceCsv,requiredSourcesFromDictionary,schemaConformanceCsv,schemaInventoryCsv,schemaIssuesCsv,schemaRuntimeType,schemaStabilityCsv,schemaValuePreview,SCHEMA_AUDIT_MAX_DEPTH,SCHEMA_VALUE_PREVIEW_MAX_LENGTH,sourceCoverageCsv,stableSort,versionAuditIssuesCsv,versionDistributionCsv,versionMatrixCsv,recalculationAuditCsv,buildFeatureCoverage,buildFeatureStability,coverageClass,featureCoverageCsv,featureStabilityWarnings,filterFeatureCoverage,buildMonthlyTrends,buildQualityDetails,buildRaceTrends,buildResearchDashboard,comparePeriods,filterProblematicHorses,monthlyTrendsCsv,periodComparisonCsv,problematicHorsesCsv,raceTrendsCsv,sortProblematicHorses,buildMissingnessAudit,buildCoMissingness,buildMonthlyMissingness,missingnessClassification,filterMissingnessSummary,filterDependencyAudit,filterMissingnessIssues,missingnessSummaryCsv,missingnessPatternsCsv,coMissingnessCsv,dependencyAuditCsv,monthlyMissingnessCsv,missingnessIssuesCsv,MISSING_PATTERN_MAX_PATHS,MISSING_PATTERN_MAX_DISPLAY,CO_MISSINGNESS_MAX_FIELDS,MISSING_ISSUE_MESSAGE_MAX_LENGTH,buildCrossFieldConstraintAudit,buildMonthlyConstraintTrend,filterConstraintSummary,filterRaceConstraintSummary,filterConstraintIssues,constraintCatalogCsv,constraintSummaryCsv,raceConstraintSummaryCsv,monthlyConstraintTrendCsv,constraintIssuesCsv,constraintValuePreview,CROSS_FIELD_CONSTRAINT_CATALOG,CONSTRAINT_VALUE_PREVIEW_MAX_LENGTH,CONSTRAINT_ISSUE_MESSAGE_MAX_LENGTH} from "./research-dashboard.js";

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

test("version audit distributions, missing values, tie rule and matrix are deterministic",()=>{
 const model=buildCanonicalResearchModel([{raceId:"r",meta:{date:"2026-01-01"},horses:[
  horse({versions:{horse:"v2",features:"f2"}}),horse({versions:{horse:"v1",features:"f1"}}),horse({versions:{}})
 ]}]),audit=buildVersionRecalculationAudit(model);
 assert.equal(audit.dataModelDistribution.find(x=>x.version==="未登録").count,1);
 assert.equal(audit.dataModelDistribution.find(x=>x.mostCommon).version,"v1");
 assert.equal(audit.matrix.reduce((sum,x)=>sum+x.count,0),3);
 assert.ok(audit.issues.some(x=>x.type==="mixed-data-model-version"));
});
test("recalculation audit separates valid, missing and invalid timestamps",()=>{
 const audit=buildVersionRecalculationAudit(buildCanonicalResearchModel([{raceId:"r",meta:{date:"2026-02-01"},horses:[
  horse({logs:{updatedAt:"2026-01-01T00:00:00Z"}}),horse({logs:{updatedAt:"bad"}}),horse({logs:{}})
 ]}]));
 assert.deepEqual(audit.recalculationGroups.map(x=>x.month).sort(),["2026-01","invalid","missing"]);
 assert.ok(audit.issues.some(x=>x.type==="recalculation-before-race"));
 assert.ok(audit.issues.some(x=>x.type==="invalid-recalculation-time"));
});
test("version audit uses canonical Horse roots only and filters combined fields",()=>{
 const model=buildCanonicalResearchModel([{raceId:"r",versions:{horse:"fallback"},logs:{updatedAt:"2026-01-01"},horses:[horse({name:"Alpha",versions:{},logs:{}})]}]);
 const audit=buildVersionRecalculationAudit(model);
 assert.equal(audit.dataModelDistribution[0].version,"未登録");
 assert.equal(filterVersionAuditIssues(audit.issues,{severity:"error",type:"missing-data-model-version",raceId:"r",search:"alpha"}).length,1);
});
test("version audit sorting is stable and exports full escaped collections",()=>{
 const audit=buildVersionRecalculationAudit(buildCanonicalResearchModel([{raceId:"r,1",meta:{raceName:'A, "Race"'},horses:[horse({number:2,versions:{}}),horse({number:2,versions:{}})]}]));
 const filtered=filterVersionAuditIssues(audit.issues,{type:"missing-data-model-version"});
 assert.equal(filtered.length,2);assert.equal(paginate(filtered,1,25).rows.length,2);
 assert.match(versionAuditIssuesCsv(filtered),/"r,1"/);assert.match(versionDistributionCsv(audit.dataModelDistribution),/mostCommon/);
 assert.match(versionMatrixCsv(audit.matrix),/dataModelVersion/);assert.match(recalculationAuditCsv(audit),/oldestValid/);
});
test("provenance dynamically discovers sources and handles missing and empty raw",()=>{
 const model=buildCanonicalResearchModel([{raceId:"r",horses:[horse({raw:{targetText:{x:1},entryCsv:{}}}),horse({raw:{}}),horse({raw:undefined})]}]);
 const audit=buildProvenanceFreshnessAudit(model,[],new Date("2026-02-01T00:00:00Z"));
 assert.equal(audit.sourceCoverage.find(x=>x.sourceKey==="targetText").availableDataCount,1);
 assert.equal(audit.sourceCoverage.find(x=>x.sourceKey==="entryCsv").emptyObjectCount,1);
 assert.equal(audit.sourceCoverage.find(x=>x.sourceKey==="(raw missing)").horseCount,1);
 assert.ok(audit.issues.some(x=>x.type==="empty-raw-section"));assert.ok(audit.issues.some(x=>x.type==="missing-raw-section"));
});
test("required sources come only from dictionary metadata and support not configured",()=>{
 assert.deepEqual(requiredSourcesFromDictionary([{sourceFields:["targetText","entryCsv"]},{sourceFields:["targetText"]}]),["entryCsv","targetText"]);
 const model=buildCanonicalResearchModel([{raceId:"r",horses:[horse({raw:{targetText:{x:1}}})]}]);
 assert.equal(buildProvenanceFreshnessAudit(model,[],new Date()).requiredSourcesConfigured,false);
 const audit=buildProvenanceFreshnessAudit(model,[{sourceFields:["targetText","entryCsv"]}],new Date());
 assert.equal(audit.incompleteRequiredCount,1);assert.ok(audit.issues.some(x=>x.type==="missing-required-source"));
});
test("freshness uses one instant and exact boundaries",()=>{
 const now=new Date("2026-02-01T00:00:00Z"),day=86400000,at=ms=>new Date(now.getTime()-ms).toISOString();
 const logs=[at(day),at(7*day),at(30*day),at(30*day+1),new Date(now.getTime()+1).toISOString(),"bad",null].map(updatedAt=>updatedAt===null?{}:{updatedAt});
 const audit=buildProvenanceFreshnessAudit(buildCanonicalResearchModel([{raceId:"r",horses:logs.map(log=>horse({raw:{x:{a:1}},logs:log}))}]),[],now);
 assert.deepEqual(audit.rows.map(x=>x.freshnessCategory),["within-24-hours","1-7-days","8-30-days","over-30-days","future","invalid","missing"]);
 assert.equal(audit.calculationTime,now.toISOString());
});
test("provenance race ordering, combined filters, pagination and canonical roots",()=>{
 const races=[{raceId:"u",raw:{fallback:{}},logs:{updatedAt:"2026-01-01"},horses:[horse({name:"Alpha",raw:undefined,logs:{}})]},{raceId:"d",meta:{date:"2026-01-01"},horses:[horse({raw:{targetText:{x:1}},logs:{updatedAt:"bad"}})]}];
 const audit=buildProvenanceFreshnessAudit(buildCanonicalResearchModel(races),[{sourceFields:["targetText"]}],new Date("2026-02-01"));
 assert.deepEqual(audit.raceRows.map(x=>x.raceId),["d","u"]);
 const filtered=filterProvenanceIssues(audit.issues,{severity:"error",type:"missing-raw-section",freshnessCategory:"missing",raceId:"u",minimumSourceCoverage:0,search:"alpha"});
 assert.equal(filtered.length,1);assert.equal(paginate(filtered,1,25).total,1);
});
test("provenance CSV exports escape full filtered data with BOM",()=>{
 const audit=buildProvenanceFreshnessAudit(buildCanonicalResearchModel([{raceId:"r,1",meta:{raceName:'A, "Race"'},horses:[horse({raw:undefined,logs:{}})]}]),[],new Date());
 for(const csv of [sourceCoverageCsv(audit.sourceCoverage),freshnessSummaryCsv(audit.freshnessSummary),provenanceRaceCsv(audit.raceRows),provenanceIssuesCsv(audit.issues)])assert.equal(csv.charCodeAt(0),0xFEFF);
 assert.match(provenanceIssuesCsv(audit.issues),/"r,1"/);
});
test("schema section conformance covers missing, object, invalid and empty states",()=>{
 const audit=buildSchemaTypeAudit(buildCanonicalResearchModel([{raceId:"r",horses:[horse({raw:{}}),horse({raw:[]}),horse({raw:null}),horse({raw:undefined})]}]));
 const raw=audit.sectionConformance.find(x=>x.section==="raw");assert.deepEqual([raw.presentCount,raw.missingCount,raw.objectCount,raw.invalidTypeCount,raw.emptyObjectCount],[3,1,1,2,1]);
 assert.ok(audit.issues.some(x=>x.type==="missing-canonical-section"));assert.ok(audit.issues.some(x=>x.type==="invalid-canonical-section-type"));
});
test("schema path discovery excludes array indexes and enforces depth",()=>{
 let nested={leaf:1};for(let i=0;i<SCHEMA_AUDIT_MAX_DEPTH+2;i++)nested={x:nested};
 const audit=buildSchemaTypeAudit(buildCanonicalResearchModel([{raceId:"r",horses:[horse({raw:{items:[{secret:1}],nested}})]}]));
 assert.ok(audit.inventory.some(x=>x.fieldPath==="raw.items"));assert.ok(!audit.inventory.some(x=>x.fieldPath.includes(".0")));
 assert.ok(audit.issues.some(x=>x.type==="traversal-depth-exceeded"));
});
test("schema runtime types handle timestamps, date strings and non-finite numbers",()=>{
 assert.equal(schemaRuntimeType({toDate:()=>new Date()},"logs.at"),"timestamp-like");
 assert.equal(schemaRuntimeType("2026-01-01T00:00:00Z","logs.updatedAt"),"timestamp-like");
 assert.equal(schemaRuntimeType("2026-01-01","raw.date"),"string");
 assert.equal(schemaRuntimeType(Infinity,"features.x"),"non-finite number");
});
test("schema inventory counts null and empty values with deterministic type ties",()=>{
 const audit=buildSchemaTypeAudit(buildCanonicalResearchModel([{raceId:"r",horses:[horse({features:{x:1,e:"",a:[]}}),horse({features:{x:"1",e:null,a:{}}})]}]));
 const x=audit.inventory.find(r=>r.fieldPath==="features.x");assert.equal(x.dominantType,"finite number");assert.deepEqual(x.observedTypes,["finite number","string"]);
 assert.equal(audit.inventory.find(r=>r.fieldPath==="features.e").nullCount,1);assert.equal(audit.inventory.find(r=>r.fieldPath==="features.a").emptyArrayCount,1);
});
test("schema detects dictionary conflicts and cross-race drift chronologically",()=>{
 const model=buildCanonicalResearchModel([{raceId:"late",meta:{date:"2026-02-01"},horses:[horse({features:{x:"bad"}})]},{raceId:"early",meta:{date:"2026-01-01"},horses:[horse({features:{x:1}})]},{raceId:"u",horses:[horse({features:{x:2}})]}]);
 const audit=buildSchemaTypeAudit(model,[{key:"x",型:"number|null"}]);assert.ok(audit.issues.some(x=>x.type==="feature-dictionary-type-conflict"));assert.ok(audit.issues.some(x=>x.type==="cross-race-dominant-type-drift"));
 assert.deepEqual(audit.stability.filter(x=>x.fieldPath==="features.x").map(x=>x.raceId),["early","late","u"]);
});
test("schema previews, filters, pagination and CSV are bounded and escaped",()=>{
 const preview=schemaValuePreview('A, "'.padEnd(200,"x"));assert.ok(preview.length<=SCHEMA_VALUE_PREVIEW_MAX_LENGTH);
 const audit=buildSchemaTypeAudit(buildCanonicalResearchModel([{raceId:"r,1",horses:[horse({features:{x:"bad"}})]}]),[{key:"x",型:"number|null"}]);
 assert.equal(filterSchemaInventory(audit.inventory,{section:"features",fieldPath:"x",observedType:"string"}).length,1);
 const issues=filterSchemaIssues(audit.issues,{severity:"error",type:"feature-dictionary-type-conflict",section:"features",raceId:"r,1",search:"features.x"});assert.equal(paginate(issues,1,25).total,1);
 for(const csv of [schemaConformanceCsv(audit.sectionConformance),schemaInventoryCsv(audit.inventory),schemaStabilityCsv(audit.stability),schemaIssuesCsv(issues)])assert.equal(csv.charCodeAt(0),0xFEFF);
 assert.match(schemaIssuesCsv(issues),/"r,1"/);
});

test("missingness classifications distinguish absent, empty, usable and non-finite values",()=>{
 assert.equal(missingnessClassification(undefined,false),"absent");
 assert.equal(missingnessClassification(null),"null");
 assert.equal(missingnessClassification(" \t"),"empty string");
 assert.equal(missingnessClassification([]),"empty array");
 assert.equal(missingnessClassification({}),"empty object");
 assert.equal(missingnessClassification(0),"usable");
 assert.equal(missingnessClassification(false),"usable");
 assert.equal(missingnessClassification([0]),"usable");
 assert.equal(missingnessClassification({x:0}),"usable");
 assert.equal(missingnessClassification(Infinity),"non-finite number");
 assert.equal(missingnessClassification({},true,false),"invalid canonical section");
});

test("field missingness separates absent and present empty values using canonical roots only",()=>{
 const races=[{raceId:"r",horses:[
   horse({features:{x:0},raw:{},quality:{},ocr:{},logs:{},versions:{}}),
   horse({features:{x:null},raw:{},quality:{},ocr:{},logs:{},versions:{}}),
   horse({features:{x:" "},raw:{},quality:{},ocr:{},logs:{},versions:{}}),
   horse({features:{},raw:{},quality:{},ocr:{},logs:{},versions:{}}),
   horse({features:[],raw:{},quality:{},ocr:{},logs:{},versions:{}})
 ]}];
 const model=buildCanonicalResearchModel(races),schema=buildSchemaTypeAudit(model),audit=buildMissingnessAudit(model,schema);
 const x=audit.summary.find(row=>row.fieldPath==="features.x");
 assert.deepEqual([x.presentCount,x.absentCount,x.nullCount,x.emptyStringCount,x.usableValueCount,x.invalidSectionCount],[4,1,1,1,1,1]);
 assert.equal(x.missingnessPercentage,80);
 assert.equal(audit.summary.find(row=>row.fieldPath==="features").invalidSectionCount,1);
});

test("missingness patterns are grouped and deterministically ordered with explicit limits",()=>{
 const horses=[];for(let i=0;i<MISSING_PATTERN_MAX_DISPLAY+2;i++)horses.push(horse({raw:{[`k${i}`]:i},features:{x:i},quality:{},ocr:{},logs:{},versions:{}}));
 const model=buildCanonicalResearchModel([{raceId:"r",horses}]),audit=buildMissingnessAudit(model,buildSchemaTypeAudit(model));
 assert.equal(audit.patterns.length,MISSING_PATTERN_MAX_DISPLAY);
 assert.equal(audit.patternsTruncated,true);
 assert.ok(audit.patterns.every(pattern=>pattern.missingPaths.length<=MISSING_PATTERN_MAX_PATHS));
 const sorted=[...audit.patterns].sort((a,b)=>b.horseCount-a.horseCount||b.missingPathCount-a.missingPathCount||a.patternKey.localeCompare(b.patternKey));
 assert.deepEqual(audit.patterns.map(x=>x.patternKey),sorted.map(x=>x.patternKey));
});

test("selected co-missingness counts combinations and enforces selection limits",()=>{
 const model=buildCanonicalResearchModel([{raceId:"r",horses:[
   horse({features:{a:1,b:1}}),horse({features:{a:null,b:1}}),horse({features:{a:1,b:null}}),horse({features:{a:null,b:null}})
 ]}]);
 assert.equal(buildCoMissingness(model,["features.a"]).valid,false);
 const co=buildCoMissingness(model,["features.a","features.b"]);
 assert.deepEqual(co.rows[0],{leftField:"features.a",rightField:"features.b",bothUsable:1,leftMissingOnly:1,rightMissingOnly:1,bothMissing:1,bothMissingPercentage:25});
 const limited=buildCoMissingness(model,Array.from({length:CO_MISSINGNESS_MAX_FIELDS+2},(_,i)=>`features.k${i}`));
 assert.equal(limited.fieldPaths.length,CO_MISSINGNESS_MAX_FIELDS);assert.equal(limited.selectionTruncated,true);
});

test("feature dependencies come only from dictionary sourceFields and emit every dependency issue",()=>{
 const races=[{raceId:"r",horses:[
   horse({raw:{entryCsv:{x:1}},features:{a:1,b:null,c:1},quality:{},ocr:{},logs:{},versions:{}}),
   horse({raw:{targetText:{x:1},entryCsv:{x:1}},features:{a:null,b:1,c:1},quality:{},ocr:{},logs:{},versions:{}})
 ]}];
 const dictionary=[{key:"a",名称:"A",group:"g",sourceFields:["targetText"]},{key:"b",group:"g",sourceFields:["entryCsv"]},{key:"c",group:"g",sourceFields:["unknown"]},{key:"d",group:"g"}];
 const model=buildCanonicalResearchModel(races),audit=buildMissingnessAudit(model,buildSchemaTypeAudit(model,dictionary),dictionary),a=audit.dependencies.find(x=>x.featureKey==="a");
 assert.equal(a.usableFeatureDespiteMissingExpectedSourceCount,1);assert.equal(a.missingFeatureDespiteAllExpectedSourcesPresentCount,1);
 assert.ok(audit.issues.some(x=>x.type==="usable-feature-with-missing-source"));
 assert.ok(audit.issues.some(x=>x.type==="missing-feature-with-complete-sources"));
 assert.ok(audit.issues.some(x=>x.type==="undiscovered-expected-source"&&x.severity==="error"));
 assert.ok(audit.issues.some(x=>x.type==="feature-dependency-not-configured"));
 assert.equal(audit.dependencies.find(x=>x.featureKey==="d").dependencyCoveragePercentage,null);
});

test("monthly missingness is chronological, includes boundaries and puts undated last",()=>{
 const model=buildCanonicalResearchModel([
   {raceId:"late",meta:{date:"2026-02-01"},horses:[horse({features:{x:null}})]},
   {raceId:"early",meta:{date:"2026-01-31"},horses:[horse({features:{x:1}}),horse({features:{x:null}})]},
   {raceId:"u",horses:[horse({features:{x:null}})]}
 ]);
 const rows=buildMonthlyMissingness(model,"features.x");
 assert.deepEqual(rows.map(x=>x.month),["2026-01","2026-02","undated"]);
 assert.deepEqual(rows.map(x=>x.missingnessPercentage),[50,100,100]);
 assert.deepEqual(rows.map(x=>x.percentagePointDifference),[null,50,null]);
});

test("Phase 9 ignores race summaries and reads Horse canonical roots only",()=>{
 const race={raceId:"r",raw:{fallback:{value:1}},features:{fallback:1},quality:{fallback:1},ocr:{fallback:1},logs:{fallback:1},versions:{fallback:1},horses:[horse({raw:{},features:{},quality:{},ocr:{},logs:{},versions:{}})]};
 const model=buildCanonicalResearchModel([race]),audit=buildMissingnessAudit(model,buildSchemaTypeAudit(model));
 assert.ok(!audit.fieldPaths.some(path=>path.endsWith(".fallback")));
 assert.equal(audit.summary.find(row=>row.fieldPath==="features").emptyObjectCount,1);
});

test("missingness filters paginate before export and CSV remains BOM escaped and bounded",()=>{
 const model=buildCanonicalResearchModel([{raceId:"r,1",meta:{raceName:'A, "Race"'},horses:[horse({name:"Alpha",raw:{entryCsv:{value:1}},features:{x:null},quality:{},ocr:{},logs:{},versions:{}})]}]);
 const audit=buildMissingnessAudit(model,buildSchemaTypeAudit(model),[{key:"x",group:"g",sourceFields:["entryCsv"]}]);
 const summary=filterMissingnessSummary(audit.summary,{section:"features",fieldPath:"x",minimumMissingness:100,maximumUsable:0,issuesOnly:true,search:"features.x"});
 assert.equal(summary.length,1);assert.equal(paginate(summary,1,25).total,1);
 assert.equal(filterDependencyAudit(audit.dependencies,{featureGroup:"g",featureKey:"x",issuesOnly:true,search:"x"}).length,1);
 const issues=filterMissingnessIssues(audit.issues,{severity:"warning",section:"features",fieldPath:"x",raceId:"r,1",classification:"null",search:"alpha"});
 assert.ok(issues.length>=1);assert.ok(issues.every(x=>x.message.length<=MISSING_ISSUE_MESSAGE_MAX_LENGTH));
 const exports=[missingnessSummaryCsv(summary),missingnessPatternsCsv(audit.patterns),coMissingnessCsv(buildCoMissingness(model,["features.x","raw.entryCsv"]).rows),dependencyAuditCsv(audit.dependencies),monthlyMissingnessCsv(buildMonthlyMissingness(model,"features.x")),missingnessIssuesCsv(issues)];
 for(const csv of exports)assert.equal(csv.charCodeAt(0),0xFEFF);
 assert.match(missingnessIssuesCsv(issues),/"r,1"/);
});

test("Phase 9 audit handles 1000 races and 20000 Horses within performance budget",()=>{
 const races=Array.from({length:1000},(_,raceIndex)=>({raceId:`r${raceIndex}`,meta:{date:`2026-${String(raceIndex%12+1).padStart(2,"0")}-01`},horses:Array.from({length:20},(_,horseIndex)=>({
   number:horseIndex+1,name:`h${horseIndex}`,raw:{entryCsv:{value:horseIndex}},features:{x:horseIndex},quality:{qualityScore:80},ocr:{confidence:.9},logs:{updatedAt:"2026-01-01T00:00:00Z"},versions:{horse:"1"}
 }))}));
 const started=performance.now(),model=buildCanonicalResearchModel(races),schema=buildSchemaTypeAudit(model),audit=buildMissingnessAudit(model,schema,[{key:"x",group:"g",sourceFields:["entryCsv"]}]),elapsed=performance.now()-started;
 assert.equal(audit.summary.find(x=>x.fieldPath==="features.x").usableValueCount,20000);
 assert.ok(elapsed<4000,`Phase 9 audit took ${elapsed.toFixed(1)}ms`);
});

const constraintAuditFor=(races,dictionary=[])=>{
 const model=buildCanonicalResearchModel(races),schema=buildSchemaTypeAudit(model,dictionary),missing=buildMissingnessAudit(model,schema,dictionary);
 return buildCrossFieldConstraintAudit(model,schema,missing,dictionary);
};
const evaluations=(audit,id)=>audit.evaluations.filter(row=>row.constraintId===id);

test("Phase 10 constraint catalog is complete, unique and deterministic",()=>{
 const ids=CROSS_FIELD_CONSTRAINT_CATALOG.map(item=>item.id);
 assert.equal(ids.length,22);assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(ids,[...ids].sort());
 assert.ok(CROSS_FIELD_CONSTRAINT_CATALOG.every(item=>item.displayName&&item.description&&item.severity&&item.sections.length&&item.fieldPaths.length&&item.applicabilityRule));
});

test("quality, OCR and count constraints enforce exact boundaries and integer types",()=>{
 const audit=constraintAuditFor([{raceId:"r",horses:[
   horse({quality:{qualityScore:0,missingCount:0,warningCount:1,errorCount:2,typeErrorCount:3,abnormalCount:4},ocr:{confidence:0}}),
   horse({quality:{qualityScore:100,missingCount:-1,warningCount:1.5,errorCount:Infinity,typeErrorCount:"1",abnormalCount:0},ocr:{confidence:1}}),
   horse({quality:{qualityScore:100.1},ocr:{confidence:1.01}}),
   horse({quality:{qualityScore:"80"},ocr:{confidence:"0.8"}})
 ]}]);
 assert.deepEqual(evaluations(audit,"C01").map(x=>x.status),["pass","pass","failure","failure"]);
 assert.deepEqual(evaluations(audit,"C02").map(x=>x.status),["pass","pass","failure","failure"]);
 for(const id of ["C03","C04","C05","C06"])assert.ok(evaluations(audit,id).some(x=>x.issueType==="invalid-count-type"));
 assert.equal(evaluations(audit,"C07")[1].status,"pass");
});

test("count-to-array constraints distinguish missing, invalid and mismatch states",()=>{
 const audit=constraintAuditFor([{raceId:"r",horses:[
   horse({quality:{}}),
   horse({quality:{warning:[]}}),
   horse({quality:{warningCount:0}}),
   horse({quality:{warningCount:0,warning:"bad"}}),
   horse({quality:{warningCount:2,warning:["one"]}}),
   horse({quality:{warningCount:1,warning:["one"]}})
 ]}]);
 const rows=evaluations(audit,"C08");
 assert.deepEqual(rows.map(x=>[x.status,x.issueType]),[
   ["not-applicable","count-and-array-missing"],["not-applicable","count-missing"],["not-applicable","array-missing"],
   ["failure","invalid-array-type"],["failure","count-mismatch"],["pass",""]
 ]);
});

test("version constraints distinguish matching, conflicting, one-sided and invalid values",()=>{
 const audit=constraintAuditFor([{raceId:"r",horses:[
   horse({versions:{features:"1"},logs:{featureVersion:"1"}}),
   horse({versions:{features:"1"},logs:{featureVersion:"2"}}),
   horse({versions:{features:"1"},logs:{}}),
   horse({versions:{features:1},logs:{featureVersion:"1"}})
 ]}]);
 assert.deepEqual(evaluations(audit,"C15").map(x=>x.status),["pass","failure","not-applicable","not-applicable"]);
 assert.equal(evaluations(audit,"C14")[2].issueType,"one-sided-version");
 assert.equal(evaluations(audit,"C13")[3].issueType,"invalid-version-type");
});

test("recalculation timestamp constraints detect invalid values and later history entries",()=>{
 const audit=constraintAuditFor([{raceId:"r",horses:[
   horse({logs:{updatedAt:"2026-01-02T00:00:00Z",recalculateHistory:[{at:"2026-01-01T00:00:00Z"}]}}),
   horse({logs:{updatedAt:"2026-01-02T00:00:00Z",recalculateHistory:[{at:"2026-01-03T00:00:00Z"}]}}),
   horse({logs:{updatedAt:"bad",recalculateHistory:[]}}),
   horse({logs:{updatedAt:"2026-01-02T00:00:00Z",recalculateHistory:{at:"2026-01-01T00:00:00Z"}}})
 ]}]);
 assert.deepEqual(evaluations(audit,"C17").map(x=>x.status),["pass","failure","not-applicable","not-applicable"]);
 assert.equal(evaluations(audit,"C16")[2].issueType,"invalid-timestamp");
 assert.equal(evaluations(audit,"C16")[3].issueType,"invalid-history-type");
});

test("OCR and quality relationship summary is descriptive only",()=>{
 const audit=constraintAuditFor([{raceId:"r",horses:[
   horse({quality:{qualityScore:90},ocr:{confidence:.9}}),horse({quality:{qualityScore:80},ocr:{}}),horse({quality:{},ocr:{confidence:.8}}),horse({quality:{},ocr:{}})
 ]}]);
 assert.deepEqual(audit.registrationSummary.distribution.map(x=>[x.label,x.count]),[["both-registered",1],["quality-only",1],["ocr-only",1],["neither-registered",1]]);
 assert.equal(audit.registrationSummary.validBothCount,1);assert.equal(audit.registrationSummary.averageQualityScore,90);assert.equal(audit.registrationSummary.averageOcrConfidence,.9);
});

test("feature dictionary constraints use only configured metadata and explicit PRE_RACE state",()=>{
 const dictionary=[
   {key:"x",型:"number|null",minimum:0,maximum:1,availablePreRace:true,leakageRisk:"POST_RACE_ONLY",sourceFields:["unknown"]},
   {key:"result",型:"number|null",availablePreRace:false,leakageRisk:"POST_RACE_ONLY",sourceFields:["resultCsv"]}
 ];
 const audit=constraintAuditFor([{raceId:"r",horses:[horse({raw:{snapshotPhase:"PRE_RACE",resultCsv:{ok:1}},features:{x:"bad",result:1},quality:{},ocr:{},logs:{},versions:{}})]}],dictionary);
 assert.equal(evaluations(audit,"C18")[0].issueType,"dictionary-numeric-type-conflict");
 assert.equal(evaluations(audit,"C20")[0].issueType,"feature-metadata-conflict");
 assert.equal(evaluations(audit,"C21")[0].issueType,"post-race-feature-in-pre-race-snapshot");
 assert.equal(evaluations(audit,"C22")[0].issueType,"undiscovered-expected-source");
 const rangeAudit=constraintAuditFor([{raceId:"r",horses:[horse({raw:{known:{}},features:{x:2},quality:{},ocr:{},logs:{},versions:{}})]}],[{key:"x",型:"number|null",minimum:0,maximum:1,sourceFields:["known"]}]);
 assert.equal(evaluations(rangeAudit,"C19")[0].issueType,"dictionary-range-conflict");
 const notConfigured=constraintAuditFor([{raceId:"r",horses:[horse({features:{},raw:{},quality:{},ocr:{},logs:{},versions:{}})]}],[]);
 for(const id of ["C18","C19","C20","C22"])assert.equal(evaluations(notConfigured,id)[0].status,"not-applicable");
});

test("race and constraint summaries are chronological and use applicable denominators",()=>{
 const audit=constraintAuditFor([
   {raceId:"u",horses:[horse({quality:{qualityScore:200},ocr:{}})]},
   {raceId:"late",meta:{date:"2026-02-01"},horses:[horse({quality:{qualityScore:80},ocr:{}})]},
   {raceId:"early",meta:{date:"2026-01-01"},horses:[horse({quality:{},ocr:{}})]}
 ]);
 assert.deepEqual(audit.raceSummary.map(x=>x.raceId),["early","late","u"]);
 const quality=audit.constraintSummary.find(x=>x.constraintId==="C01");
 assert.deepEqual([quality.applicableHorseCount,quality.passedCount,quality.failedCount,quality.notApplicableCount,quality.conformancePercentage],[2,1,1,1,50]);
});

test("monthly constraint trend uses percentage points and leaves undated difference empty",()=>{
 const audit=constraintAuditFor([
   {raceId:"jan",meta:{date:"2026-01-31"},horses:[horse({quality:{qualityScore:80}}),horse({quality:{qualityScore:200}})]},
   {raceId:"feb",meta:{date:"2026-02-01"},horses:[horse({quality:{qualityScore:80}})]},
   {raceId:"u",horses:[horse({quality:{qualityScore:200}})]}
 ]);
 const rows=buildMonthlyConstraintTrend(audit,"C01");
 assert.deepEqual(rows.map(x=>x.month),["2026-01","2026-02","undated"]);
 assert.deepEqual(rows.map(x=>x.conformancePercentage),[50,100,0]);
 assert.deepEqual(rows.map(x=>x.percentagePointDifference),[null,50,null]);
});

test("constraint previews, combined filters, pagination and CSV are bounded and escaped",()=>{
 const audit=constraintAuditFor([{raceId:"r,1",meta:{raceName:'A, "Race"'},horses:[horse({name:"Alpha",quality:{qualityScore:'bad, "value"'.padEnd(300,"x")},ocr:{}})]}]);
 const preview=constraintValuePreview('bad, "value"'.padEnd(300,"x"));assert.ok(preview.length<=CONSTRAINT_VALUE_PREVIEW_MAX_LENGTH);
 const issues=filterConstraintIssues(audit.issues,{severity:"error",constraintId:"C01",issueType:"invalid-numeric-type",section:"quality",fieldPath:"qualityScore",raceId:"r,1",search:"alpha"});
 assert.equal(issues.length,1);assert.ok(issues[0].message.length<=CONSTRAINT_ISSUE_MESSAGE_MAX_LENGTH);assert.equal(paginate(issues,1,25).total,1);
 assert.equal(filterConstraintSummary(audit.constraintSummary,{severity:"error",constraintId:"C01",section:"quality",fieldPath:"qualityScore",applicableOnly:true,failuresOnly:true,search:"quality"}).length,1);
 assert.equal(filterRaceConstraintSummary(audit.raceSummary,{raceId:"r,1",minimumRaceConformance:0,maximumRaceConformance:100,applicableOnly:true,failuresOnly:true}).length,1);
 const csvs=[constraintCatalogCsv(),constraintSummaryCsv(audit.constraintSummary),raceConstraintSummaryCsv(audit.raceSummary),monthlyConstraintTrendCsv(buildMonthlyConstraintTrend(audit,"C01")),constraintIssuesCsv(issues)];
 for(const csv of csvs)assert.equal(csv.charCodeAt(0),0xFEFF);assert.match(constraintIssuesCsv(issues),/"r,1"/);
});

test("Phase 10 reads canonical Horse roots only and handles 20000 Horses within budget",()=>{
 const dictionary=[{key:"x",型:"number|null",minimum:0,maximum:100,availablePreRace:true,leakageRisk:"PRE_RACE_OK",sourceFields:["entryCsv"]}];
 const races=Array.from({length:1000},(_,raceIndex)=>({raceId:`r${raceIndex}`,meta:{date:"2026-01-01"},quality:{qualityScore:999},ocr:{confidence:9},horses:Array.from({length:20},(_,horseIndex)=>horse({
   number:horseIndex+1,raw:{entryCsv:{value:1}},features:{x:horseIndex},quality:{qualityScore:80,missingCount:0,warningCount:0,errorCount:0,typeErrorCount:0,abnormalCount:0,warning:[]},ocr:{confidence:.9},
   logs:{featureVersion:"1",updatedAt:"2026-01-01T00:00:00Z",recalculateHistory:[]},versions:{features:"1"}
 }))}));
 const started=performance.now(),model=buildCanonicalResearchModel(races),schema=buildSchemaTypeAudit(model,dictionary),missing=buildMissingnessAudit(model,schema,dictionary),audit=buildCrossFieldConstraintAudit(model,schema,missing,dictionary),elapsed=performance.now()-started;
 assert.equal(audit.registrationSummary.distribution.find(x=>x.label==="both-registered").count,20000);
 assert.equal(audit.constraintSummary.find(x=>x.constraintId==="C01").failedCount,0);
 assert.ok(elapsed<4000,`Phase 10 audit took ${elapsed.toFixed(1)}ms`);
});
