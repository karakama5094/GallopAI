import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildResearchDashboard,recalculateResearchDashboard} from './research-dashboard.js';
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
function harness(){
 const user={uid:'a'},races=[{raceId:'r1',horses:[]}];
 const c={state:{cloud:{user},researchStatus:'idle',researchRaces:[],researchDashboardSummary:null},user,races,
  listCloudRaces:async()=>c.races,saveGlobalResearchAnalysis:async()=>{c.globalSaved=(c.globalSaved||0)+1;},featureDictionary:()=>[],
  currentCloudUser:()=>c.user,loadLocalRaces:()=>({}),render:()=>{},esc:v=>String(v??'').replaceAll('<','&lt;'),
  buildResearchDashboard,recalculateResearchDashboard,buildResearchAnalysis:()=>({}),RESEARCH_RACE_TARGET:50,RESEARCH_DASHBOARD_VERSION:'1.0.0',
  loadResearchDataset:async()=>c.races,saveResearchDashboardSummary:async()=>{c.saved=(c.saved||0)+1;}};
 vm.createContext(c);
 for(const [start,end] of [['function phase1Kpis(d){','function legacyResearchDashboardView'],['function researchDashboardView(){','function csvEscape'],['// Invalidate pending research responses','async function openRace(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),c);
 return c;
}
test('renders loading, separate KPI counts, empty data and escaped retry error',async()=>{
 const c=harness();assert.match(c.researchDashboardView(),/role="status"/);
 await c.refreshResearchDashboard();const view=c.researchDashboardView();
 for(const label of ['総保存レース数','総保存馬数','結果登録馬数','数値特徴量数','Warning 馬数','Error 馬数','dataModelVersion','featureVersion','最終再計算時刻'])assert.ok(view.includes(label));
 assert.match(view,/クラウド全件を再集計/);assert.doesNotMatch(view,/学習と時系列検証を実行できます/);
 c.state.researchRaces=[];c.state.researchDashboardSummary=null;assert.match(c.researchDashboardView(),/研究データがありません/);
 c.state.researchStatus='error';c.state.researchError='<error>';assert.match(c.researchDashboardView(),/role="alert"/);assert.match(c.researchDashboardView(),/&lt;error>/);assert.match(c.researchDashboardView(),/再試行/);
});
test('deduplicates recalculation and permits retry after load failure',async()=>{
 const c=harness();let release;c.loadResearchDataset=()=>new Promise(resolve=>{release=resolve;});
 const pending=c.refreshResearchDashboard();await c.refreshResearchDashboard();assert.equal(c.saved,undefined);
 release(c.races);await pending;assert.equal(c.saved,1);assert.equal(c.state.researchStatus,'ready');assert.ok(c.state.researchDashboardSummary.lastRecalculationTime);
 c.loadResearchDataset=async()=>{throw Error('offline');};await c.refreshResearchDashboard();assert.equal(c.state.researchStatus,'error');assert.equal(c.saved,1);
 c.loadResearchDataset=async()=>[];await c.refreshResearchDashboard();assert.equal(c.state.researchStatus,'ready');assert.equal(c.state.researchDashboardSummary.raceCount,0);
});
test('does not save or publish a result after account changes',async()=>{
 const c=harness();let release;c.loadResearchDataset=()=>new Promise(resolve=>{release=resolve;});const pending=c.refreshResearchDashboard();
 c.user={uid:'b'};c.state.researchStatus='idle';release(c.races);await pending;
 assert.equal(c.saved,undefined);assert.equal(c.state.researchDashboardSummary,null);assert.equal(c.state.researchStatus,'idle');
});
test('local view ignores a stale cloud summary and disables cloud action',()=>{
 const c=harness();c.state.cloud.user=null;c.state.researchStatus='ready';c.state.researchDashboardSummary=buildResearchDashboard(c.races);
 assert.match(c.researchDashboardView(),/研究データがありません/);assert.match(c.researchDashboardView(),/disabled/);
});
test('counts explicit positive warningCount without requiring issue arrays',()=>{
 const d=buildResearchDashboard([{raceId:'r',horses:[{quality:{warningCount:2}}]}]);assert.equal(d.warningCount,1);
});

test('startup read failure shows an actionable error and dashboard retry succeeds',async()=>{
 const c=harness();c.state.view='research';c.listCloudRaces=async()=>{throw Error('permission-denied');};
 await c.handleCloudState({configured:true,status:'signed-in',user:c.user});
 assert.equal(c.state.researchStatus,'error');assert.match(c.researchDashboardView(),/再試行/);assert.match(c.researchDashboardView(),/permission-denied/);
 await c.refreshResearchDashboard();assert.equal(c.state.researchStatus,'ready');assert.equal(c.saved,1);
});
test('normal research reload drops the old summary and refreshes counts',async()=>{
 const c=harness();await c.refreshResearchDashboard();c.races=[...c.races,{raceId:'r2',horses:[]}];
 await c.refreshResearch(true);assert.equal(c.state.researchDashboardSummary,null);assert.equal(c.state.researchRaces.length,2);assert.match(c.researchDashboardView(),/2<\/b><span>総保存レース数/);assert.equal(c.globalSaved,1);
});
test('normal research reload cannot publish or save data after logout',async()=>{
 const c=harness();let release;c.loadResearchDataset=()=>new Promise(resolve=>{release=resolve;});const pending=c.refreshResearch(true);
 c.user=null;await c.handleCloudState({user:null,status:'signed-out'});release(c.races);await pending;
 assert.equal(c.globalSaved,undefined);assert.equal(c.state.researchRaces.length,0);assert.equal(c.state.researchStatus,'idle');
});
test('a logout and login of the same User object invalidates older results',async()=>{
 const c=harness();const original=c.user;let release;c.loadResearchDataset=()=>new Promise(resolve=>{release=resolve;});const pending=c.refreshResearchDashboard();
 c.user=null;await c.handleCloudState({user:null});c.user=original;await c.handleCloudState({user:original});release(c.races);await pending;
 assert.equal(c.saved,undefined);assert.equal(c.state.researchDashboardSummary,null);assert.equal(c.state.researchStatus,'idle');
});
test('summary write failure preserves the previous timestamp and allows retry',async()=>{
 const c=harness();await c.refreshResearchDashboard();const previous=c.state.researchDashboardSummary;
 c.saveResearchDashboardSummary=async()=>{throw Error('write denied');};await c.refreshResearchDashboard();
 assert.equal(c.state.researchStatus,'error');assert.equal(c.state.researchDashboardSummary,previous);assert.match(c.researchDashboardView(),/再試行/);
 c.saveResearchDashboardSummary=async()=>{};await c.refreshResearchDashboard();assert.equal(c.state.researchStatus,'ready');assert.notEqual(c.state.researchDashboardSummary,previous);
});
test('late startup read failure cannot overwrite a newer signed-out session',async()=>{
 const c=harness();let fail;c.listCloudRaces=()=>new Promise((resolve,reject)=>{fail=reject;});const pending=c.handleCloudState({user:c.user});
 c.user=null;await c.handleCloudState({user:null});fail(Error('old session'));await pending;
 assert.equal(c.state.researchStatus,'idle');assert.equal(c.state.cloud.error,'');assert.equal(c.state.cloud.user,null);
});
test('a newer normal reload supersedes an older dashboard recalculation',async()=>{
 const c=harness();let release;c.loadResearchDataset=()=>new Promise(resolve=>{release=resolve;});const pending=c.refreshResearchDashboard();
 c.loadResearchDataset=async()=>[{raceId:'new',horses:[]}];await c.refreshResearch();release(c.races);await pending;
 assert.equal(c.saved,undefined);assert.equal(c.state.researchRaces[0].raceId,'new');assert.equal(c.state.researchDashboardSummary,null);assert.equal(c.state.researchStatus,'ready');
});
test('a late successful startup list cannot restore a previous account race list',async()=>{
 const c=harness();let release;c.listCloudRaces=()=>new Promise(resolve=>{release=resolve;});const pending=c.handleCloudState({user:c.user});
 c.user=null;await c.handleCloudState({user:null});release(c.races);await pending;
 assert.equal(c.state.cloudRaces.length,0);assert.equal(c.state.researchRaces.length,0);assert.equal(c.state.cloud.user,null);
});
