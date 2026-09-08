import {layoutPage,pageText} from './pdf-layout.js';
import {parseKeibabookEntry,parseKeibabookResult,parsePdfRaceMeta} from './keibabook-pdf.js';
import {parseTrainingText} from './parsers.js';

export async function extractPdfDocument(file,pdfjs,onProgress=()=>{}){
  if(!pdfjs)throw new Error('PDF読み取り機能を準備できませんでした。オンラインで画面を再読み込みしてください。');
  if(!/\.pdf$/i.test(file.name||'')&&file.type!=='application/pdf')throw new Error('PDFファイルを選択してください。');
  if(file.size>40*1024*1024)throw new Error('PDFは40MB以下にしてください。1レースずつ保存すると小さくできます。');
  pdfjs.GlobalWorkerOptions.workerSrc='./pdf.worker.min.js';
  const task=pdfjs.getDocument({data:await file.arrayBuffer(),cMapUrl:'./cmaps/',cMapPacked:true,isEvalSupported:false});
  let pdf;
  try{
    pdf=await task.promise;
    if(pdf.numPages>100)throw new Error('ページ数が多すぎます。1レース分のPDFを選択してください。');
    const pages=[];
    for(let p=1;p<=pdf.numPages;p++){
      onProgress(p,pdf.numPages);
      const page=await pdf.getPage(p),content=await page.getTextContent();
      pages.push(layoutPage(content.items,page.getViewport({scale:1})));
      page.cleanup();
    }
    const text=pages.map(pageText).join('\n');
    if(text.replace(/\s/g,'').length<30)throw new Error('文字を読み取れないPDFです。画像・スキャンではなく、競馬ブックのページをSafariの「共有」→「プリント」からPDF保存してください。');
    return {pages,text,meta:{pdfPages:pdf.numPages,textLength:text.length,method:'pdfjs-spatial-text',parseVersion:'3.5.0',extractedAt:new Date().toISOString()}};
  }catch(e){
    if(e.name==='PasswordException')throw new Error('パスワード付きPDFには対応していません。保護を解除して添付してください。');
    if(e.name==='InvalidPDFException')throw new Error('PDFが壊れているか、ダウンロードが完了していません。「ファイル」アプリで開けることを確認してください。');
    throw e;
  }finally{await task.destroy();}
}

export function parsePdfSource(document,slot,filename){
  if(slot==='targetText')return parseKeibabookEntry(document,filename);
  if(slot==='resultCsv')return parseKeibabookResult(document,filename);
  if(slot!=='training')throw new Error('この取込欄には対応していません。');
  const source=parseTrainingText(document.text,filename);
  source.meta=parsePdfRaceMeta(document.text,filename);
  if(!source.meta.date||!source.meta.venue||!source.meta.raceNo)throw new Error('調教PDFのレース情報が不足しています。レース名を含むPDFを添付してください。');
  if(new Set(source.horses.map(h=>h.number)).size!==source.count)throw new Error('馬番が重複しています。1レース分の調教PDFを添付してください。');
  return {...source,pdf:true,format:'keibabook-pdf',pdfMeta:document.meta};
}

export async function importPdf(file,slot,pdfjs,onProgress){
  return parsePdfSource(await extractPdfDocument(file,pdfjs,onProgress),slot,file.name);
}

export function validateSourceRace(sources,slot,source){
  for(const [key,other] of Object.entries(sources)){
    if(key===slot||!other?.meta)continue;
    if(['date','venue','raceNo'].some(k=>source.meta[k]&&other.meta[k]&&String(source.meta[k])!==String(other.meta[k])))
      throw new Error('別のレースのPDFです。日付・競馬場・レース番号を合わせてください。新しいレースは「新しいレース」から登録できます。');
  }
  const entry=slot==='targetText'?source:sources.targetText;
  if(entry?.horses?.length){
    const expected=new Set(entry.horses.map(h=>h.number));
    for(const key of ['training','resultCsv']){
      const other=key===slot?source:sources[key];
      if(!other?.horses?.length)continue;
      if(other.horses.length!==expected.size||other.horses.some(h=>!expected.has(h.number)))
        throw new Error(`出走表の${expected.size}頭と${key==='training'?'調教':'結果'}PDFの馬番が一致しません。全頭が含まれる同じレースのPDFを選択してください。`);
    }
  }
}

// Reconstruct original parsed sources when adding a result to a saved race.
export function sourcesFromRace(race){
  const sources={targetText:null,training:null,entryCsv:null,resultCsv:null};
  for(const [slot,rawKey,field] of [['targetText','targetText','ability'],['training','trainingPdf','training'],['resultCsv','resultCsv','result']]){
    const horses=(race.horses||[]).map(h=>h.raw?.[rawKey]||h.rawSources?.[rawKey]||h[field]).filter(Boolean);
    if(horses.length)sources[slot]={horses,count:horses.length,meta:race.meta,filename:race.sourceFiles?.[slot]||'保存済みのPDFデータ',pdf:true,pdfMeta:race.sourceMeta?.[slot]||null};
  }
  return sources;
}

export function canSaveRace(race){
  return !!(race?.meta?.date&&race.meta.venue&&race.meta.raceNo&&race.horses?.length
    &&race.counts.preRaceComplete===race.horses.length
    &&!race.diagnostics?.some(d=>d.level==='error')&&race.quality?.validationStatus!=='ERROR');
}
