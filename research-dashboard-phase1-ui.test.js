import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Phase 1 research dashboard renders only required summary controls",()=>{
  const source=fs.readFileSync(new URL("./app.js",import.meta.url),"utf8");
  const start=source.indexOf("function researchDashboardView(){");
  const end=source.indexOf("function csvEscape",start);
  const view=source.slice(start,end);

  assert.ok(start>=0&&end>start);
  assert.match(view,/Recalculate from Cloud/);
  assert.match(view,/機械学習は無効です/);
  assert.match(view,/残り \$\{dashboard\.remainingRaces\} レース/);
  assert.doesNotMatch(view,/分布|相関|分位点|trend-chart|qualityScore 分布|OCR confidence 分布/);
});
