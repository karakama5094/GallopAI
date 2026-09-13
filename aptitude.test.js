import test from 'node:test';
import assert from 'node:assert/strict';
import {aptitudeFactors,completeResult} from './aptitude.js';
import {preRaceRows,predictRace} from './prediction.js';
import {backtestRaces,wilson} from './backtest.js';
function race(date,distance=1600){return {meta:{date,distance,venue:'東京',raceNo:1,surface:'芝'},horses:Array.from({length:8},(_,i)=>({number:i+1,name:`馬${i}`,ability:{name:`馬${i}`,sire:`父${i}`,jockey:`騎手${i}`,rt:70-i},training:{sessions:[{course:'栗坂',times:[54,39,25,12+i*.1]}]},result:{name:`馬${i}`,number:i+1,finish:i+1}}))};}
test('pedigree jockey and distance use only strictly earlier same-surface results',()=>{
 const target=race('2026-03-01'),past=[race('2026-01-01'),race('2026-01-02'),race('2026-01-03')];
 const f=aptitudeFactors(target,[...past,race('2026-03-01'),race('2026-04-01')]).get(1);
 for(const s of Object.values(f)){assert.equal(s.starts,3);assert.equal(s.top3,3);assert.ok(s.value>0);}
 const changed=race('2026-01-04');changed.meta.surface='ダート';assert.deepEqual(aptitudeFactors(target,[...past,changed]).get(1),f);
});
test('missing or sparse history never fabricates aptitude',()=>{
 const target=race('2026-03-01');target.horses[0].ability.sire='';
 const f=aptitudeFactors(target,[race('2026-01-01')]).get(1);
 assert.equal(f.pedigree.value,null);assert.equal(f.distance.value,null);assert.equal(f.jockey.starts,1);assert.equal(f.jockey.value,null);
});
test('distance requires same horse and sire and 200m window; jockey abbreviations are not guessed',()=>{
 const target=race('2026-03-01'),past=race('2026-01-01',2000);assert.equal(aptitudeFactors(target,[past]).get(1).distance.starts,0);
 past.meta.distance=1800;assert.equal(aptitudeFactors(target,[past]).get(1).distance.starts,1);
 past.horses[0].ability.sire='別父';past.horses[0].ability.jockey='略称';const f=aptitudeFactors(target,[past]).get(1);assert.equal(f.distance.starts,0);assert.equal(f.jockey.starts,0);
});
test('target outcome cannot leak into aptitude and historical examples cannot see later results',()=>{
 const target=race('2026-03-01'),past=[race('2026-01-01'),race('2026-01-02'),race('2026-01-03')],changed=structuredClone(target);
 changed.horses.forEach(h=>h.result.finish=9-h.number);
 assert.deepEqual(preRaceRows(target,[...past,target]),preRaceRows(changed,[...past,changed]));
 assert.deepEqual(preRaceRows(past[1],past),preRaceRows(past[1],[past[0]]));
 assert.equal(predictRace(target,past).weights.length,7);
});
test('result number mismatch is rejected',()=>{const r=race('2026-01-01');r.horses[0].result.number=2;assert.equal(completeResult(r),false);});
test('walk-forward report measures real labels, does not use closing popularity, excludes duplicates',async()=>{
 const rs=[race('2026-01-01'),race('2026-01-02'),race('2026-01-03')];
 const b=await backtestRaces([...rs,rs[0]]);assert.equal(b.evaluated,3);assert.equal(b.excludedIncompleteOrDuplicate,1);
 assert.deepEqual(b.rows.map(r=>r.historyCount),[0,1,2]);assert.equal(b.marks['◎'].selected,3);assert.equal(b.marks['△'].selected,0);assert.equal(b.modes.learned.races,0);
 const cutoff=await backtestRaces(rs.slice(0,2));assert.deepEqual(cutoff.rows,b.rows.slice(0,2));
});
test('empty report and zero-hit uncertainty are honest',async()=>{
 const b=await backtestRaces([]);assert.equal(b.marks['◎'].winRate,null);assert.equal(wilson(0,0),null);assert.ok(wilson(0,1)[1]>.79);
});
