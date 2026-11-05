import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildResearchDashboard,recalculateResearchDashboard} from './research-dashboard.js';
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
function harness(){
 const user={uid:'a'},races=[{raceId:'r1',horses:[]}];
 const c={state:{cloud:{user},researchStatus:'idle',researchRaces:[],researchDashboardSummary:null},user,races,
  currentCloudUser:()=>c.user,loadLocalRaces:()=>({}),render:()=>{},esc:v=>String(v??'').replaceAll('<','&lt;'),
  buildResearchDashboard,recalculateResearchDashboard,buildResearchAnalysis:()=>({}),RESEARCH_RACE_TARGET:50,RESEARCH_DASHBOARD_VERSION:'1.0.0',
  loadResearchDataset:async()=>c.races,saveResearchDashboardSummary:async()=>{c.saved=(c.saved||0)+1;}};
 vm.createContext(c);
 for(const [start,end] of [['function phase1Kpis(d){','function legacyResearchDashboardView'],['function researchDashboardView(){','function csvEscape'],['async function refreshResearchDashboard(){','async function refreshResearch(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),c);
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
