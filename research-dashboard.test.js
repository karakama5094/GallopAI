
import test from "node:test";
import assert from "node:assert/strict";
import {buildQualityDetails,buildResearchDashboard,filterProblematicHorses,problematicHorsesCsv,sortProblematicHorses} from "./research-dashboard.js";

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

