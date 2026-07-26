Exit code: 0
Wall time: 1.1 seconds
Output:
import test from "node:test";
import assert from "node:assert/strict";
import {buildResearchDashboard} from "./research-dashboard.js";

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

