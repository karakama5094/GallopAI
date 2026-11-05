import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {detectPdfSource,readBulkFiles,buildBulkRows,saveBulkRows,BULK_MAX_FILES,BULK_SLOTS} from './bulk-import.js';
import {buildResearchPackage} from './feature-store.js';
const meta={date:'2026-07-26',venue:'中京',raceNo:7,raceName:'東海ステークス'};
const horse={number:1,name:'テストホース',age:4,sex:'牡',weight:58,waku:1};
const rec=(slot,overrides={})=>({name:slot+'.pdf',slot,source:{meta,horses:[{...horse}],count:1},...overrides});
const complete=()=>[rec('targetText'),rec('training')];
const heading='2026年7月26日 2回中京2日目\n7R 東海ステークス\n1400m (ダート・左)\n';
const trainingDoc={pages:[],text:heading+'1 1 テストホース\n',meta:{}};

test('groups shuffled sources across selections and races by date, venue and number',()=>{
 const other={...meta,raceNo:8};const records=[rec('training'),rec('resultCsv'),rec('targetText'),rec('targetText',{source:{meta:other,horses:[horse],count:1}})];
 const rows=buildBulkRows(records);assert.equal(rows.length,2);assert.equal(rows[0].ready,true);assert.equal(rows[0].race.counts.resultMatched,1);assert.equal(rows[1].ready,false);
});
test('does not require results but blocks duplicate slots, missing training and name/number mismatches',()=>{
 assert.equal(buildBulkRows(complete())[0].ready,true);
 assert.equal(buildBulkRows([...complete(),rec('training')])[0].ready,false);
 assert.equal(buildBulkRows([rec('targetText')])[0].ready,false);
 for(const horses of [[{...horse,name:'チガウウマ'}],[{...horse,number:2}]])assert.equal(buildBulkRows([rec('targetText'),rec('training',{source:{meta,horses,count:1}})])[0].ready,false);
});
test('identifies training by filename or explicitly selected folder and validates metadata',()=>{
 assert.equal(detectPdfSource(trainingDoc,'調教.pdf').slot,'training');
 assert.equal(detectPdfSource(trainingDoc,'unknown.pdf','training').slot,'training');
 assert.throws(()=>detectPdfSource({...trainingDoc,text:trainingDoc.text.replace('7月26日','2月31日')},'調教.pdf'),/日付/);
 assert.throws(()=>detectPdfSource({...trainingDoc,text:heading+'8R 別レース\n1 1 テストホース'},'調教.pdf'),/複数レース/);
 assert.throws(()=>detectPdfSource(trainingDoc,'unknown.pdf','invalid'),/種別/);
});
test('sequential reads release each file before the next and preserve per-file failures',async()=>{
 let active=0,max=0;const names=[];
 const results=await readBulkFiles([{name:'bad.pdf',size:1},{name:'調教.pdf',size:1}],{read:async f=>{active++;max=Math.max(max,active);await Promise.resolve();active--;if(f.name==='bad.pdf')throw Error('壊れたPDF');return trainingDoc;},onProgress:p=>names.push(p.name)});
 assert.equal(max,1);assert.match(results[0].error,/壊れた/);assert.equal(results[1].slot,'training');assert.ok(names.includes('調教.pdf'));
});
test('rejects selection limits before reading',async()=>{
 let reads=0;const read=async()=>{reads++;};
 await assert.rejects(readBulkFiles(Array.from({length:121},()=>({size:1})),{read}),/120/);
 await assert.rejects(readBulkFiles([{size:101*1024*1024}],{read}),/100MB/);assert.equal(reads,0);
});
test('never saves already existing races, including those discovered by the per-race recheck',async()=>{
 const rows=buildBulkRows(complete());let saves=0;
 const args={prepare:r=>r,save:async()=>saves++};
 assert.equal((await saveBulkRows(rows,{...args,listExisting:async()=>[{raceId:rows[0].raceId}]}))[0].status,'duplicate');
 let count=0;assert.equal((await saveBulkRows(rows,{...args,listExisting:async()=>++count===1?[]:[{raceId:rows[0].raceId}]}))[0].status,'duplicate');assert.equal(saves,0);
});
test('list failure causes zero writes and quality failure stays per race',async()=>{
 const rows=buildBulkRows(complete());let saved=0;
 const args={save:async()=>saved++,prepare:r=>r};
 await assert.rejects(saveBulkRows(rows,{...args,listExisting:async()=>{throw Error('offline');}}),/offline/);assert.equal(saved,0);
 const result=await saveBulkRows(rows,{...args,listExisting:async()=>[],prepare:r=>({...r,quality:{validationStatus:'ERROR'}})});assert.equal(result[0].status,'error');assert.equal(saved,0);
});
test('continues after one save fails and retry skips earlier successful writes',async()=>{
 const rows=[...buildBulkRows(complete()),...buildBulkRows(complete().map(r=>({...r,source:{...r.source,meta:{...meta,raceNo:8}}})))];
 const stored=[];let fail=true;
 const args={listExisting:async()=>stored,prepare:r=>r,save:async r=>{if(r.meta.raceNo===8&&fail)throw Error('write failed');stored.push(r);}};
 const first=await saveBulkRows(rows,args);assert.deepEqual(first.map(r=>r.status),['saved','error']);
 fail=false;assert.deepEqual((await saveBulkRows(rows,args)).map(r=>r.status),['duplicate','saved']);assert.equal(stored.length,2);
});
test('account change during preparation stops writes',async()=>{
 let current=true,saved=0;
 const result=await saveBulkRows(buildBulkRows(complete()),{listExisting:async()=>[],prepare:r=>{current=false;return r;},save:async()=>saved++,isCurrent:()=>current});
 assert.equal(saved,0);assert.equal(result[0].status,'error');
});
test('saving invokes the existing research package with exactly six canonical horse sections',async()=>{
 let saved;
 await saveBulkRows(buildBulkRows(complete()),{listExisting:async()=>[],prepare:r=>{const research=buildResearchPackage(r);return {...r,researchPackage:research,quality:research.quality};},save:async r=>{saved=r;}});
 assert.ok(saved,'valid pre-race source should be saved through the existing package');
 const pack=buildResearchPackage(buildBulkRows(complete())[0].race);
 for(const section of ['raw','features','quality','ocr','logs','versions'])assert.ok(Object.hasOwn(pack.horses[0],section));
 assert.ok(saved.researchPackage);
 assert.deepEqual(saved.researchPackage.horses[0].raw.merged.name,'テストホース');
});
test('mobile UI escapes filenames and issue messages, supports multiple additions without automatic save',()=>{
 const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const start=source.indexOf('const bulkState='),end=source.indexOf('async function importBulkSelection',start);
 const context={BULK_MAX_FILES,BULK_SLOTS,buildBulkRows,loadLocalRaces:()=>({}),state:{settings:undefined,cloud:{user:null}},esc:v=>String(v).replaceAll('<','&lt;')};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 vm.runInContext("bulkState.records=[{id:1,name:'<script>.pdf',error:'<bad>'}]",context);
 const view=context.bulkImportView();assert.match(view,/multiple accept=/);assert.match(view,/&lt;script>/);assert.doesNotMatch(view,/<script>/);assert.match(view,/不足|フォルダー/);assert.match(view,/bulk-save-cloud.*disabled/);
});
