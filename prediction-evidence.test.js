import test from 'node:test';import assert from 'node:assert/strict';
import {predictRace} from './prediction.js';
import {buildPredictionEvidence,leaderScoreGap,EVIDENCE_FIELDS} from './prediction-evidence.js';
import {predictionView} from './prediction-view.js';
function race(date='2026-07-01',offset=0){return {meta:{date,venue:'東京',raceNo:11,surface:'芝',distance:1600},horses:Array.from({length:8},(_,i)=>({number:i+1,name:'テスト'+i,ability:{name:'テスト'+i,rt:70+i,sire:'父'+i,jockey:'騎手'+i},training:{sessions:[{date:new Date(Date.parse(date)-86400000).toISOString().slice(0,10),course:'栗坂',times:[54,39,25,12+i*.05]}]},result:{number:i+1,name:'テスト'+i,finish:((i+offset)%8)+1,popularity:i+1}}))};}
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(freeze);}return o;};
const fingerprint=p=>JSON.stringify({ranked:p.ranked,selections:p.selections,weights:p.weights,mode:p.mode,reason:p.reason,historyCount:p.historyCount,trainingRaceIds:p.trainingRaceIds,validation:p.validation});
test('evidence shows all seven snapshot values, reasons and exact score contributions',()=>{
 const r=race(),p=predictRace(r),e=buildPredictionEvidence(r,p);
 for(const x of e){assert.equal(x.features.length,7);assert.deepEqual(x.features.map(f=>f.name),EVIDENCE_FIELDS);
 const row=p.ranked.find(h=>h.number===x.number);assert.ok(Math.abs(x.features.reduce((s,f)=>s+f.contribution,0)-row.score)<1e-10);
 assert.equal(x.availableCount,4);assert.equal(x.features[1].displayValue,-row.values[1]);assert.match(x.features[4].reason,/3件未満/);}
});
test('missing RT and unknown course are explained without inventing values or rejecting prediction',()=>{
 const r=race();r.horses[0].ability.rt=null;r.horses[1].training.sessions[0].course='';const p=predictRace(r),e=buildPredictionEvidence(r,p);
 const missing=e.find(x=>x.number===1);assert.equal(missing.features[0].value,null);assert.equal(missing.features[0].contribution,0);assert.match(missing.features[0].reason,/未登録/);
 const unknown=e.find(x=>x.number===2);assert.equal(unknown.features[2].available,false);assert.match(unknown.warnings.join(''),/コース不明/);assert.equal(unknown.features[1].available,true);
});
test('previous-only clock is labeled previous, with unavailable current count and acceleration',()=>{
 const r=race();r.horses[0].training.sessions[0].prev=true;const p=predictRace(r),e=buildPredictionEvidence(r,p).find(x=>x.number===1);
 assert.equal(e.latest.kind,'前回');assert.equal(e.availableCount,2);assert.match(e.features[1].source,/前回/);assert.equal(e.features[2].value,null);assert.equal(e.features[3].value,null);assert.match(e.warnings[0],/前回/);
});
test('latest clock and maximum acceleration show different contributing dates accurately',()=>{
 const r=race();r.horses[0].training.sessions=[{date:'6/20',course:'栗坂',times:[54,39,26,12]},{date:'6/25',course:'栗坂',times:[54,39,24,12]}];
 const p=predictRace(r),e=buildPredictionEvidence(r,p).find(x=>x.number===1);assert.equal(e.latest.date,'6/25');assert.match(e.features[2].source,/6\/20/);assert.deepEqual(e.currentDates,['6/20','6/25']);
});
test('availability is distinct from a zero contribution due to a single comparable value',()=>{
 const r=race(),p=predictRace(r);p.ranked.forEach(row=>{row.values[4]=null;row.x[4]=0;});p.ranked[0].values[4]=.1;
 const e=buildPredictionEvidence(r,p)[0];assert.equal(e.features[4].available,true);assert.equal(e.features[4].contribution,0);assert.match(e.features[4].zeroReason,/1頭/);assert.equal(e.availableCount,5);
});
test('unknown dates and reconstructed clocks are labeled without changing snapshot',()=>{
 const r=race();r.horses[0].training.sessions[0].date='';r.horses[0].training.sessions[0].times=[];r.horses[0].training.sessions[0].note='2回 54.0 39.0 25.0 12.0';
 const p=predictRace(r),e=buildPredictionEvidence(r,p).find(x=>x.number===1);assert.match(e.warnings.join(''),/日付が不明/);assert.match(e.warnings.join(''),/再構成/);
});
test('changed inputs suppress clock provenance and ask for recomputation',()=>{
 const r=race(),p=predictRace(r);r.horses[0].training.sessions[0].times=[54,39,25,13];
 const e=buildPredictionEvidence(r,p).find(x=>x.number===1);assert.equal(e.sourceMatches,false);assert.equal(e.latest,null);assert.match(e.warnings.join(''),/再作成/);
});
test('gap remains an unrounded index difference, including exact ties',()=>{
 const p=predictRace(race()),g=leaderScoreGap(p);assert.equal(g.value,p.ranked[0].score-p.ranked[1].score);
 p.ranked[1].score=p.ranked[0].score;assert.equal(leaderScoreGap(p).value,0);assert.match(predictionView(race(),p),/同点/);assert.equal(leaderScoreGap(null),null);
});
test('rendering is pure and does not change provisional decisions or future-information rejection',()=>{
 const r=race(),p=predictRace(r),before=fingerprint(p);freeze(r);freeze(p);buildPredictionEvidence(r,p);predictionView(r,p);assert.equal(fingerprint(p),before);assert.equal(fingerprint(predictRace(r)),before);
 const bad=structuredClone(r);bad.horses[0].training.sessions[0].date='2026-07-02';assert.throws(()=>predictRace(bad),/調教/);
});
test('rendering does not alter learned weights, validation or adoption conditions',()=>{
 const history=Array.from({length:60},(_,i)=>race(new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),1)),r=race(),p=predictRace(r,history);
 // Both learned and provisional adoption decisions must remain exactly reproducible.
 assert.ok(p.validation);assert.equal(p.mode,'learned');const before=fingerprint(p);freeze(r);freeze(p);predictionView(r,p);assert.equal(fingerprint(p),before);assert.equal(fingerprint(predictRace(r,history)),before);
});
test('view escapes external fields and labels index gaps without new probability claims',()=>{
 const r=race();r.horses[0].ability.name='<script>x</script>';r.horses[0].training.sessions[0].course='<img src=x onerror=x>';const p=predictRace(r),html=predictionView(r,p);
 assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/7項目/);assert.match(html,/勝率差や信頼度ではありません/);assert.match(html,/算出可能/);
});
