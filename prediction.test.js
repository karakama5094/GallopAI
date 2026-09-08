import test from 'node:test';
import assert from 'node:assert/strict';
import {predictRace,preRaceRows} from './prediction.js';
import {predictionView} from './prediction-view.js';
function race(date='2026-09-01',offset=0){return {meta:{date,venue:'中山',raceNo:11,surface:'芝'},horses:Array.from({length:10},(_,i)=>({number:i+1,name:`馬${i+1}`,ability:{name:`馬${i+1}`,rt:60+i},training:{sessions:[{course:'栗坂',times:[54+i*.3,39+i*.2,25+i*.1,12+i*.05]}]},result:{finish:((i+offset)%10)+1,popularity:i+1,odds:i+1}}))};}
const day=i=>new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);
test('insufficient history is explicitly provisional and unavailable hole selections stay empty',()=>{
 const p=predictRace(race());assert.equal(p.mode,'provisional');assert.equal(p.historyCount,0);
 assert.equal(p.selections.find(s=>s.mark==='×').number,null);assert.equal(p.selections.length,6);
 const chosen=p.selections.filter(s=>s.number!=null).map(s=>s.number);assert.equal(new Set(chosen).size,chosen.length);
});
test('changing target results, basic and calculated features cannot affect predictions',()=>{
 const a=race(),b=structuredClone(a);b.horses.forEach(h=>{h.result={finish:100-h.number,popularity:11-h.number};h.basic={rt:1000};h.features={finish:1};h.trainingSummary={latest1F:1};});
 assert.deepEqual(preRaceRows(a),preRaceRows(b));assert.deepEqual(predictRace(a).ranked,predictRace(b).ranked);
});
test('past race filtering excludes same day, future, wrong surface, duplicates and invalid results',()=>{
 const a=race('2026-08-01'),wrong=race('2026-08-02');wrong.meta.surface='ダート';
 const invalid=race('2026-08-03');invalid.horses[0].result=null;
 const p=predictRace(race(),[a,a,race('2026-09-01'),race('2026-10-01'),wrong,invalid,race('bad')]);assert.equal(p.historyCount,1);
});
test('history without meaningful date is rejected safely',()=>assert.throws(()=>predictRace(race('2026-99-99')),/日付/));
test('training is performed only on earlier dates and validation dates stay grouped',()=>{
 const history=Array.from({length:60},(_,i)=>race(day(i),1));
 // Here highest RT (#10) is always the winner, teaching a known synthetic relationship.
 const p=predictRace(race(),history);
 assert.equal(p.mode,'learned');assert.equal(p.validation.trainRaces,48);assert.equal(p.validation.model.races,12);
 assert.equal(p.ranked[0].number,10);assert.equal(p.historyCount,60);
 assert.ok(p.validation.model.logLoss<p.validation.baseline.logLoss);
 assert.deepEqual(p.weights,predictRace(race(),history.reverse()).weights);
});
test('50 copies from one date do not bypass race-count or temporal validation',()=>{
 const p=predictRace(race(),Array.from({length:60},()=>race(day(1))));assert.equal(p.historyCount,1);assert.equal(p.mode,'provisional');
});
test('missing entry or training prevents ranking',()=>{const r=race();r.horses[0].ability=null;assert.throws(()=>predictRace(r),/全頭/);});
test('hole selections require complete unique user popularity, not result popularity',()=>{
 const r=race(),bad=predictRace(r,[],{1:1,2:1});assert.equal(bad.popularityComplete,false);
 const p=predictRace(r,[],Object.fromEntries(r.horses.map(h=>[h.number,h.number])));assert.equal(p.popularityComplete,true);
 for(const s of p.selections.filter(s=>s.number!=null&&['△','×'].includes(s.mark)))assert.ok(s.number>=5);
});
test('canonical cloud raw sections work without merged aliases',()=>{const r=race(),c=structuredClone(r);c.horses.forEach(h=>{h.raw={targetText:h.ability,trainingPdf:h.training,resultCsv:h.result};delete h.ability;delete h.training;delete h.result;});assert.deepEqual(preRaceRows(c),preRaceRows(r));});
test('prediction view escapes external names and explains provisional status',()=>{const r=race();r.horses[0].ability.name='<script>x</script>';const html=predictionView(r,predictRace(r));assert.ok(!html.includes('<script>'));assert.match(html,/暫定評価/);assert.match(html,/予想を作成/);});
