import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("service worker includes the PDF and prediction release",()=>{
  const source=fs.readFileSync(new URL("./sw.js",import.meta.url),"utf8");
  assert.match(source,/const CACHE="gallopai-v3\.7\.0"/);
  for(const name of ['aptitude.js','backtest.js','backtest-view.js'])assert.ok(source.includes('./'+name));
  assert.ok(source.includes('./prediction.js'));
  assert.ok(source.includes('./prediction-view.js'));
  assert.match(source,/"\.\/app\.js"/);
  assert.match(source,/self\.skipWaiting\(\)/);
  assert.match(source,/self\.clients\.claim\(\)/);
});
