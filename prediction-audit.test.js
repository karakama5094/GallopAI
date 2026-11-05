import test from 'node:test';
import assert from 'node:assert/strict';
import {predictRace,preRaceRows} from './prediction.js';
import {backtestRaces} from './backtest.js';
import {completeResult} from './aptitude.js';
import {workoutDateAudit} from './prediction-time.js';
import {backtestView} from './backtest-view.js';
function race(date='2026-07-01'){
 const workoutDate=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
 return {meta:{date,venue:'小倉',raceNo:11,surface:'芝',distance:2000},horses:Array.from({length:8},(_,i)=>({number:i+1,name:'馬'+i,ability:{name:'馬'+i,rt:80-i,sire:'父'+i,jockey:'騎手'+i},training:{sessions:[{date:workoutDate,course:'栗坂',times:[54+i,39+i,25+i,12+i*.1]}]},result:{number:i+1,name:'馬'+i,finish:i+1,popularity:8-i,odds:8-i}}))};
}
test('changing target results, payout and closing popularity cannot change ranking or mark selection',()=>{
 const a=race(),b=structuredClone(a);b.payouts={win:999999};
 b.horses.forEach(h=>{h.result={number:h.number,finish:9-h.number,popularity:h.number,odds:999};h.features={finish_position:1,win:1};h.basic={rt:999,popularity:1};h.rawSources={resultCsv:h.result};});
 const p=predictRace(a),q=predictRace(b);assert.deepEqual(p.ranked,q.ranked);assert.deepEqual(p.selections,q.selections);
});
test('future workouts and same-day workouts are blocked, including historical fitting examples',()=>{
 for(const date of ['2026-07-01','2026-07-02','7/2','2026-02-31']){const r=race();r.horses[0].training.sessions[0].date=date;assert.throws(()=>predictRace(r),/調教/);}
 const past=race('2026-06-01');past.horses[0].training.sessions[0].date='2026-06-02';assert.equal(predictRace(race(),[past]).historyCount,0);
});
test('year rollover is explicit and unknown dates are excluded from backtest',async()=>{
 const r=race('2026-01-02');r.horses.forEach(h=>h.training.sessions[0].date='12/31');assert.equal(workoutDateAudit(r).eligible,true);assert.equal(workoutDateAudit(r).inferredYear,8);
 r.horses[0].training.sessions[0].date='';assert.match(predictRace(r).warning,/日付不明/);
 const report=await backtestRaces([r]);assert.equal(report.evaluated,0);assert.match(report.skipped[0].reason,/調教日/);
});
test('walk-forward outputs at an earlier date are unchanged by same-day or later labels',async()=>{
 const early=race('2026-06-01'),later=race('2026-07-01'),future=race('2026-08-01');
 const original=await backtestRaces([early,later]);future.horses.forEach(h=>h.result.finish=9-h.number);
 const extended=await backtestRaces([future,later,early]);assert.deepEqual(extended.rows.slice(0,2),original.rows);
 const same=structuredClone(later);same.meta.raceNo=10;same.horses.forEach(h=>h.result.finish=9-h.number);
 assert.deepEqual(preRaceRows(later,[early,same,future]),preRaceRows(later,[early]));
});
test('favorite benchmark uses closing popularity only after prediction, on identical paired races',async()=>{
 const r=race(),p=predictRace(r),report=await backtestRaces([r]);
 assert.equal(report.rows[0].marks[0].number,p.selections[0].number);assert.equal(report.favoriteComparison.pairedRaces,1);
 assert.equal(report.favoriteComparison.favorite.wins,0);assert.equal(report.favoriteComparison.model.wins,1);
 r.horses.forEach(h=>h.result.popularity=h.number);const changed=await backtestRaces([r]);
 assert.deepEqual(changed.rows[0].marks,report.rows[0].marks);assert.equal(changed.favoriteComparison.favorite.wins,1);
 assert.equal(changed.roi.available,false);assert.match(changed.favoriteComparison.caveat,/事後比較/);
});
test('missing or invalid popularity is not fabricated and not paired with model statistics',async()=>{
 const a=race('2026-06-01'),b=race();a.horses[0].result.popularity=null;
 const report=await backtestRaces([a,b]);assert.equal(report.evaluated,2);assert.equal(report.favoriteComparison.pairedRaces,1);assert.equal(report.favoriteComparison.model.races,report.favoriteComparison.favorite.races);
 assert.equal(report.favoriteComparison.missingOrInvalidPopularity,1);assert.match(backtestView(report),/回収率：未算出/);
});
test('canonical root sections are supported and remain unchanged by evaluation',async()=>{
 const r=race();r.horses.forEach(h=>{h.raw={targetText:h.ability,trainingPdf:h.training,resultCsv:h.result};delete h.ability;delete h.training;delete h.result;});
 const before=JSON.stringify(r),report=await backtestRaces([r]);assert.equal(report.evaluated,1);assert.equal(JSON.stringify(r),before);
});
test('inconsistent finish ranks and malformed rows are excluded but valid dead heats remain valid',()=>{
 const r=race();r.horses[1].result.finish=1;assert.equal(completeResult(r),true);
 r.horses[2].result.finish=2;assert.equal(completeResult(r),false);
 assert.equal(completeResult(null),false);assert.equal(completeResult({...r,horses:[null]}),false);
});

test('malformed records do not abort the whole dataset report',async()=>{
 const report=await backtestRaces([null,{horses:[null]},race()]);assert.equal(report.evaluated,1);assert.equal(report.excludedIncompleteOrDuplicate,2);
});

test('legacy repeated-workout clocks are recovered from explicit note prefixes without mutation',()=>{
 const r=race(),s=r.horses[0].training.sessions[0];s.times=[];s.note='2回 55.6 39.5 25.1 12.2 サンプルホースと併せる';
 const before=JSON.stringify(r),p=predictRace(r);assert.equal(p.workoutDateAudit.recoveredClocks,1);assert.match(p.warning,/再構成/);
 assert.equal(JSON.stringify(r),before);assert.equal(p.ranked.find(h=>h.number===1).values[1],-12.2);
});
test('unused previous-workout date is not mistaken for a future prediction input',()=>{
 const r=race();const before=predictRace(r).ranked;
 r.horses[0].training.sessions.unshift({date:'10/9',prev:true,course:'栗坂',times:[53,38,24,11]});
 assert.equal(workoutDateAudit(r).eligible,true);assert.deepEqual(predictRace(r).ranked,before);
 // With no current clocks, the last previous clock is actually consumed and must be audited.
 r.horses[0].training.sessions=r.horses[0].training.sessions.slice(0,1);
 assert.equal(workoutDateAudit(r).eligible,false);assert.throws(()=>predictRace(r),/調教/);
});
