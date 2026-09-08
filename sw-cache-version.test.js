import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("service worker includes the PDF-only release",()=>{
  const source=fs.readFileSync(new URL("./sw.js",import.meta.url),"utf8");
  assert.match(source,/const CACHE="gallopai-v3\.5\.0"/);
  assert.match(source,/"\.\/app\.js"/);
  assert.match(source,/self\.skipWaiting\(\)/);
  assert.match(source,/self\.clients\.claim\(\)/);
});
