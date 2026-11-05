import test from 'node:test';import assert from 'node:assert/strict';
import {parseWorkoutClocks,parseTrainingText} from './parsers.js';
import {predictionWorkout} from './prediction-time.js';
test('training parser accepts repeated-workout clock lines including two rounds',()=>{
 for(const prefix of ['','1回 ','2回 ','3回 ','7F ']){
  const r=parseTrainingText('1 1 テストホース\n助手 7/1 栗坂 良\n'+prefix+'55.6 39.5 25.1 12.2');
  assert.deepEqual(r.horses[0].sessions[0].times,[55.6,39.5,25.1,12.2]);
 }
});
test('legacy note recovery is narrow and preserves already parsed clocks',()=>{
 for(const note of ['馬なり 55.6 39.5 25.1 12.2','2回 1.0 0.8','2回 50.1','2回 90.1 80.1 70.1 60.1 50.1 40.1 30.1 20.1 10.1'])assert.equal(parseWorkoutClocks(note,true),null);
 assert.deepEqual(parseWorkoutClocks('2回 55.6 39.5 25.1 12.2 [7] 馬名',true),{times:[55.6,39.5,25.1,12.2],lane:7});
 const h={raw:{trainingPdf:{sessions:[{times:[54,39,25,12],note:'2回 55.6 39.5 25.1 12.2'}]}}};
 assert.deepEqual(predictionWorkout(h).sessions[0].times,[54,39,25,12]);assert.equal(predictionWorkout(h).sessions[0].recoveredFromNote,undefined);
});
