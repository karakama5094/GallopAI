import test from 'node:test';import assert from 'node:assert/strict';
import {buildLibraryBackup} from './library-backup.js';
const race={raceId:'r',meta:{date:'2026-07-01'},horses:[{number:1,raw:{targetText:{rt:80},trainingPdf:{sessions:[]},resultCsv:{finish:1}}}]};
test('export loads full Horse documents, retains canonical raw, and does not mutate summaries',async()=>{
 const summaries=[{raceId:'r',horseCount:1}];const before=JSON.stringify(summaries),progress=[];
 const b=await buildLibraryBackup(summaries,{loadRace:async id=>{assert.equal(id,'r');return structuredClone(race);},onProgress:(i,n)=>progress.push([i,n])});
 assert.equal(b.races.r.horses[0].raw.resultCsv.finish,1);assert.equal(JSON.stringify(summaries),before);assert.deepEqual(progress,[[1,1]]);
});
test('missing or failed reads do not produce partial or summary-only backups',async()=>{
 await assert.rejects(buildLibraryBackup([{raceId:'r'}],{loadRace:async()=>({raceId:'r'})}),/馬データ/);
 await assert.rejects(buildLibraryBackup([{raceId:'r'},{raceId:'missing'}],{loadRace:async id=>id==='r'?race:null}),/馬データ/);
 await assert.rejects(buildLibraryBackup([{raceId:'r'}],{loadRace:async()=>{throw Error('offline');}}),/offline/);
});
test('authentication change during read aborts export',async()=>{
 let current=true;await assert.rejects(buildLibraryBackup([{raceId:'r'}],{loadRace:async()=>{current=false;return race;},isCurrent:()=>current}),/ログイン状態/);
});
test('local export uses displayed selection and clones rather than mutates records',async()=>{
 const b=await buildLibraryBackup([race]);assert.deepEqual(Object.keys(b.races),['r']);b.races.r.horses[0].number=99;assert.equal(race.horses[0].number,1);
});
