import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("service worker cache version is bumped for the Phase 1 dashboard scope fix",()=>{
  const source=fs.readFileSync(new URL("./sw.js",import.meta.url),"utf8");
  assert.match(source,/const CACHE="gallopai-v3\.4\.1"/);
  assert.match(source,/"\.\/app\.js"/);
  assert.match(source,/self\.skipWaiting\(\)/);
  assert.match(source,/self\.clients\.claim\(\)/);
});
