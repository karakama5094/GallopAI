import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Module} from 'node:module';
import {layoutPage,pageText} from './pdf-layout.js';
import {parsePdfRaceMeta,parseKeibabookEntry,parseKeibabookResult} from './keibabook-pdf.js';
import {extractPdfDocument,parsePdfSource,validateSourceRace,sourcesFromRace,canSaveRace} from './pdf-import.js';
import {mergeSources} from './engine.js';
import {buildResearchPackage} from './feature-store.js';

const meta={date:'2025-12-28',venue:'中山',raceNo:11,raceName:'テスト特別',distance:2500,surface:'芝'};
const heading='2025年12月28日 5回中山8日目\n11R テスト特別\n2500m (芝A・右内)';
const item=(text,x,y,width=12,height=12)=>({text,x,y,width,height});
const doc=pages=>({pages,text:heading+'\n'+pages.map(pageText).join('\n'),meta:{pdfPages:pages.length}});
function entryItems(number=1,name='テストホース',y=100){return [
  item('父名',140,20),item('厩舎名(所属)',310,20),item('テストサイアー',140,y,90),item('せん',265,y,20),item('7 芦',285,y,25),
  item(name,140,y+20,100,14),item('テストマザー',140,y+35,85),item('馬主',270,y+35,24),item('父父',140,y+50,24),item('牧場',270,y+50,24),item('テスト(栗)',310,y,60),
  item('1',34,y+25),item(String(number),53,y+25),item('62.5',72,y+10,24),item('58',103,y+25,14),item('騎',122,y+10),item('手',122,y+25),item('名',122,y+40)
];}

test('race heading excludes navigation links and print timestamp',()=>{
  assert.deepEqual(parsePdfRaceMeta('2026/07/11 19:46\n1R 2R 3R\n'+heading),meta);
  assert.equal(parsePdfRaceMeta('1R 2R\n2026年7月18日 2回小倉7日目\n1R 障害未勝利\n2860m (芝A・右)').raceNo,1);
});
test('spatial extraction joins split glyphs and separates columns',()=>{
  const items=[{str:'名',transform:[10,0,0,10,20,100],width:10,height:10},{str:'馬',transform:[10,0,0,10,10,100],width:10,height:10},{str:'58',transform:[10,0,0,10,60,100],width:10,height:10}];
  assert.equal(pageText(layoutPage(items)),'馬名 58');
});
test('ability HTML binds horse cells despite reversed drawing order and independent columns',()=>{
  const horse=parseKeibabookEntry(doc([[...entryItems()].reverse()])).horses[0];
  assert.deepEqual([horse.number,horse.name,horse.sire,horse.sex,horse.age,horse.weight,horse.jockey,horse.rt],[1,'テストホース','テストサイアー','セ',7,58,'騎手名',62.5]);
  assert.equal(horse.dam,'テストマザー');
  assert.equal(horse.broodmareSire,'父父');
});
test('ability parser handles separate pages and rejects duplicate pages or a missing number',()=>{
  const pages=[entryItems(),entryItems(2,'サンプルホース')];
  assert.equal(parseKeibabookEntry(doc(pages)).count,2);
  assert.throws(()=>parseKeibabookEntry(doc([pages[0],pages[0]])),/重複/);
  assert.throws(()=>parseKeibabookEntry(doc([pages[0].filter(i=>i.x!==53)])),/馬番/);
});
test('result fields use columns; absent weight delta stays unknown',()=>{
  const page=[item('1',12,125),item('4',34,125),item('テストホース',72,100,115),item('セン7',72,120,35),item('騎手名',118,120,36),item('58',170,120,16),item('栗',77,144),item('厩舎名',95,144,36),item('11',159,144),item('10',180,144),item('9',201,144),item('8',222,144),item('2.31.5',270,115,42),item('(34.6)',271,135,40),item('464',338,105,30),item('3.8',345,125,20),item('2人気',337,145,36)];
  const horse=parseKeibabookResult(doc([page])).horses[0];
  assert.deepEqual([horse.finish,horse.number,horse.odds,horse.last3f,horse.bodyWeightDelta],[1,4,3.8,34.6,null]);
  assert.deepEqual(horse.corners,[11,10,9,8]);
  assert.equal(horse.sex,'セ');
});
test('PDF-only source validation rejects another race and preserves previous sources',()=>{
  const sources={targetText:{meta,horses:[]}};
  assert.throws(()=>validateSourceRace(sources,'training',{meta:{...meta,raceNo:10}}),/別のレース/);
  assert.equal(sources.targetText.meta.raceNo,11);
});
test('saved sources can receive results after reopening without losing entry or training',()=>{
  const ability={number:1,name:'テストホース',age:4,sex:'牡',waku:1,weight:58,source:'entry-pdf'},training={number:1,name:'テストホース',sessions:[{date:'12/24',course:'栗坂',times:[54,39,25,12]}]};
  const sources={targetText:{meta,horses:[ability],count:1},training:{meta,horses:[training],count:1}};
  let race=mergeSources(sources);
  assert.equal(canSaveRace(race),true);
  const reopened=sourcesFromRace(race);
  reopened.resultCsv={meta,horses:[{number:1,name:'テストホース',finish:2}],count:1};
  race=mergeSources(reopened);
  assert.equal(race.horses[0].result.finish,2);
  assert.deepEqual(race.horses[0].training,training);
  for(let i=0;i<3;i++)race.researchPackage=buildResearchPackage(race);
  assert.equal(race.researchPackage.race.researchPackage,undefined);
  assert.equal(race.researchPackage.quality.issues.some(i=>i.field==='zi'),false);
  race.counts.preRaceComplete=0;
  assert.equal(canSaveRace(race),false);
});
test('unsupported files and oversized PDF fail before starting the worker',async()=>{
  await assert.rejects(extractPdfDocument({name:'entry.txt',size:2},{},()=>{}),/PDFファイル/);
  await assert.rejects(extractPdfDocument({name:'entry.pdf',size:41*1024*1024},{},()=>{}),/40MB/);
});
test('empty scanned PDF reports a clear error and releases the worker',async()=>{
  let destroyed=0;
  const task={promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[]}),getViewport:()=>({transform:[1,0,0,-1,0,100]}),cleanup(){}})}),destroy:async()=>{destroyed++;}};
  await assert.rejects(extractPdfDocument({name:'scan.pdf',arrayBuffer:async()=>new ArrayBuffer(1)},{GlobalWorkerOptions:{},getDocument:()=>task}),/文字を読み取れない/);
  assert.equal(destroyed,1);
});

// The user's PDFs stay outside the repository. Opt in to the real-file check.
test('real Keibabook Arima PDFs: all 16 entries, workouts and results agree',{skip:!process.env.GALLOPAI_PDF_FIXTURE_DIR},async()=>{
  const root=path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/,'$1');
  function bundle(name){const file=path.join(root,name),m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(root);m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;}
  globalThis.pdfjsWorker=bundle('pdf.worker.min.js');
  const pdfjs=bundle('pdf.min.js'),dir=process.env.GALLOPAI_PDF_FIXTURE_DIR;
  const suffix='  2025年12月28日中山11R第７０回　有馬記念(ＧＩ)  競馬ブック.pdf';
  const files=[['targetText',path.join(dir,'出馬表','能力表HTML'+suffix)],['training',path.join(dir,'調教'+suffix)],['resultCsv',path.join(dir,'レース結果','レース結果'+suffix)]];
  const sources={};
  for(const [slot,file]of files){const bytes=fs.readFileSync(file),document=await extractPdfDocument({name:path.basename(file),size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer},pdfjs);sources[slot]=parsePdfSource(document,slot,path.basename(file));assert.equal(sources[slot].count,16);assert.equal(sources[slot].meta.raceNo,11);assert.equal(sources[slot].meta.venue,'中山');assert.equal(sources[slot].meta.date,'2025-12-28');}
  const race=mergeSources(sources),research=buildResearchPackage(race);
  assert.equal(race.counts.preRaceComplete,16);assert.equal(race.counts.resultMatched,16);assert.deepEqual(race.diagnostics,[]);
  assert.equal(research.quality.errorCount,0);assert.equal(research.quality.warningCount,0);
  assert.deepEqual(race.horses.map(h=>h.result.finish),[8,14,7,1,4,13,5,10,3,2,16,9,11,15,12,6]);
  assert.deepEqual(race.horses.map(h=>h.basic.weight),[56,58,58,56,56,58,58,58,58,58,58,58,58,58,58,58]);
  assert.deepEqual(race.horses.map(h=>h.trainingSummary.latest1F),[12.9,12.3,11.8,12.5,11.2,11.3,12.2,12.8,13.5,12,11.8,11.3,13.3,12.3,12.7,11.8]);
  assert.equal(race.horses[3].result.last3f,34.6);assert.equal(race.horses[9].result.odds,111.5);
});
