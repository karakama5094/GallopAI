import {extractPdfDocument,parsePdfSource,validateSourceRace,canSaveRace} from './pdf-import.js';
import {parsePdfRaceMeta} from './keibabook-pdf.js';
import {pageText} from './pdf-layout.js';
import {mergeSources,makeRaceId} from './engine.js';

export const BULK_MAX_FILES=120;
export const BULK_MAX_SELECTION_BYTES=100*1024*1024;
export const BULK_SLOTS={targetText:'出走表',training:'調教',resultCsv:'結果'};

export function detectPdfSource(document,filename,preferred='auto'){
  if(preferred!=='auto'&&!BULK_SLOTS[preferred])throw Error('資料種別を確認してください。');
  const hint=/調教/.test(filename)?'training':/レース結果|結果/.test(filename)?'resultCsv':/能力表|出馬表|出走表/.test(filename)?'targetText':null;
  const slots=preferred!=='auto'?[preferred]:hint?[hint]:Object.keys(BULK_SLOTS);
  const parsed=[];
  for(const slot of slots){try{parsed.push({slot,source:parsePdfSource(document,slot,filename)});}catch(error){if(slots.length===1)throw error;}}
  if(parsed.length!==1)throw Error('資料種別を特定できません。出走表・調教・結果の専用欄から選び直してください。');
  const meta=parsed[0].source.meta;
  if(!meta?.date||!meta.venue||!Number.isInteger(meta.raceNo)||meta.raceNo<1||meta.raceNo>12)throw Error('日付・競馬場・レース番号を確認できません。');
  const date=new Date(meta.date+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==meta.date)throw Error('レース日付が不正です。');
  const pageIds=new Set((document.pages||[]).map(page=>parsePdfRaceMeta(pageText(page),filename)).filter(m=>m.date&&m.venue&&m.raceNo).map(makeRaceId));
  const headings=[...document.text.matchAll(/^\s*(\d{1,2})R[^\S\n]+([^\n]+)$/gm)].filter(m=>!/(?:^|\s)\d{1,2}R\b/.test(m[2]));
  if(pageIds.size>1||new Set(headings.map(m=>Number(m[1]))).size>1)throw Error('複数レースが含まれています。1ファイル1レースに分けてください。');
  return parsed[0];
}

export async function readBulkFiles(files,{preferred='auto',pdfjs,onProgress=()=>{},read=extractPdfDocument}={}){
  const list=Array.from(files),bytes=list.reduce((sum,f)=>sum+f.size,0);
  if(list.length>BULK_MAX_FILES)throw Error(`一度に選べるのは${BULK_MAX_FILES}ファイルまでです。`);
  if(bytes>BULK_MAX_SELECTION_BYTES)throw Error('一度の選択は合計100MB以下に分けてください。');
  const records=[];
  for(let i=0;i<list.length;i++){
    const file=list[i];onProgress({index:i+1,total:list.length,name:file.name});
    try{
      const document=await read(file,pdfjs,(page,pages)=>onProgress({index:i+1,total:list.length,name:file.name,page,pages}));
      records.push({name:file.name,...detectPdfSource(document,file.name,preferred)});
    }catch(error){records.push({name:file.name,error:error.message||String(error)});}
    // Release the PDF worker before reading the next file; yield for mobile UI updates.
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return records;
}

export function buildBulkRows(records,settings){
  const groups=new Map();
  for(const record of records){
    if(!record.source)continue;
    const meta=record.source.meta||{};
    if(!meta.date||!meta.venue||!Number.isInteger(meta.raceNo)||meta.raceNo<1||meta.raceNo>12)continue;
    const raceId=makeRaceId(meta);
    if(!groups.has(raceId))groups.set(raceId,{raceId,meta,records:[],sources:{targetText:null,training:null,resultCsv:null},issues:[]});
    const row=groups.get(raceId);row.records.push(record);
    if(row.sources[record.slot])row.issues.push(`${BULK_SLOTS[record.slot]}が複数あります。不要なファイルを外してください。`);
    else row.sources[record.slot]=record.source;
  }
  return [...groups.values()].map(row=>{
    for(const slot of ['targetText','training'])if(!row.sources[slot])row.issues.push(`${BULK_SLOTS[slot]}が不足しています。`);
    try{
      for(const [slot,source] of Object.entries(row.sources))if(source)validateSourceRace(row.sources,slot,source);
      row.race=mergeSources(row.sources,settings);
      row.issues.push(...row.race.diagnostics.filter(d=>d.level==='error').map(d=>d.message));
      row.ready=!row.issues.length&&canSaveRace(row.race);
    }catch(error){row.issues.push(error.message);row.ready=false;}
    return row;
  }).sort((a,b)=>a.raceId.localeCompare(b.raceId));
}

// listExisting is mandatory and read afresh before any writes. SaveEngine is injected unchanged.
export async function saveBulkRows(rows,{listExisting,prepare,save,isCurrent=()=>true,onResult=()=>{}}){
  const existing=new Set((await listExisting()).map(r=>r.raceId));
  const results=[];
  for(const row of rows){
    if(!isCurrent())throw Error('ログイン状態が変更されました。保存を中断しました。一覧を確認してください。');
    let result;
    if(!row.ready)result={raceId:row.raceId,status:'skipped',message:'不足・不一致があります。'};
    else if(existing.has(row.raceId))result={raceId:row.raceId,status:'duplicate',message:'保存済みのためスキップしました。'};
    else try{
      // Recheck per race to avoid overwriting a race saved since the initial list read.
      if((await listExisting()).some(r=>r.raceId===row.raceId))result={raceId:row.raceId,status:'duplicate',message:'保存済みのためスキップしました。'};
      else{
        const race=await prepare(row.race);
        if(!canSaveRace(race))throw Error('品質エラーまたは結合不足のため保存できません。');
        if(!isCurrent())throw Error('ログイン状態が変更されました。');
        await save(race);existing.add(row.raceId);
        result={raceId:row.raceId,status:'saved',message:'保存しました。'};
      }
    }catch(error){result={raceId:row.raceId,status:'error',message:error.message||String(error)};}
    results.push(result);onResult(result);
  }
  return results;
}
