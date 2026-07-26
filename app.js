
import {decodeJapaneseFile,parseTargetEntryCsv,parseTargetEntryText,parseTargetResultCsv,parseTrainingText,COURSE_TABLE} from "./parsers.js";
import {mergeSources,acceleration} from "./engine.js";
import {buildResearchPackage,featureDictionary,FEATURE_SCHEMA_VERSION,FEATURE_ENGINE_VERSION,MIN_RACES_FOR_ML} from "./feature-store.js";
import {loadLocalRaces,saveLocalRace,deleteLocalRace,loadWorkspace,saveWorkspace,clearWorkspace,loadSettings,saveSettings,importLocalBackup} from "./local-storage.js";
import {initCloud,cloudIsConfigured,signInGoogle,signOutCloud,currentCloudUser,saveCloudRace,saveGlobalResearchAnalysis,listCloudRaces,getCloudRace,deleteCloudRace,loadResearchDataset,parseConfigText,saveRuntimeConfig,clearRuntimeConfig,getEffectiveConfig,CLOUD_DATA_MODEL_VERSION} from "./cloud.js";
import {buildResearchAnalysis,formatPercent} from "./analysis-engine.js";
import {buildResearchDashboard,buildQualityDetails,filterProblematicHorses,problematicHorsesCsv,RESEARCH_RACE_TARGET} from "./research-dashboard.js";

const WAKU={1:"#f7f5f0",2:"#343434",3:"#d93b2b",4:"#1e5fc4",5:"#f2c230",6:"#2f8f3e",7:"#f0821e",8:"#f0a8c4"};
const labels={targetText:"TARGET出馬表TXT",training:"競馬ブック調教PDF",entryCsv:"TARGET出馬表CSV（任意）",resultCsv:"TARGET結果CSV（レース後）"};
const state={view:"import",sources:{targetText:null,training:null,entryCsv:null,resultCsv:null},merged:null,selected:null,sort:"number",error:"",busy:"",toast:"",settings:loadSettings(COURSE_TABLE),cloud:{configured:cloudIsConfigured(),status:"loading",user:null,error:""},cloudRaces:[],researchRaces:[],researchAnalysis:null,researchV34:null,researchFilters:{},researchQualityFilters:{issuesOnly:true},researchStatus:"idle",researchError:"",library:"cloud",search:""};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(v,d=1)=>v==null||Number.isNaN(v)?"-":Number(v).toFixed(d);
const sourceRequired={targetText:true,training:true,entryCsv:false,resultCsv:false};

async function extractPdfText(file){
  if(!window.pdfjsLib)throw new Error("PDF解析ライブラリを読み込めませんでした。");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc="./pdf.worker.min.js";
  const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer(),cMapUrl:"./cmaps/",cMapPacked:true}).promise;
  let text="";
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p),content=await page.getTextContent();let lastY=null,line="";
    for(const item of content.items){const y=item.transform[5];if(lastY!==null&&Math.abs(y-lastY)>2){text+=line.trim()+"\n";line="";}line+=item.str;lastY=y;}text+=line.trim()+"\n";
  }
  const normalized=text.normalize("NFKC");
  return {text:normalized,meta:{pdfPages:pdf.numPages,textLength:normalized.length,method:"pdfjs-text-extraction",extractedAt:new Date().toISOString()}};
}
function restore(){const w=loadWorkspace();if(w?.sources){state.sources=w.sources;rebuild();}}
function persist(){saveWorkspace({sources:state.sources});}
function attachResearch(race,previous=null){const research=buildResearchPackage(race,state.settings,previous);race.researchPackage=research;race.quality=research.quality;race.ocr=research.ocr;race.featureSchemaVersion=FEATURE_SCHEMA_VERSION;race.featureEngineVersion=FEATURE_ENGINE_VERSION;race.dataModelVersion=CLOUD_DATA_MODEL_VERSION;race.horses=research.horses.map(p=>({...p.raw.merged,raw:p.raw,features:p.features,featureMeta:p.featureMeta,quality:p.quality,ocr:p.ocr,logs:p.logs,versions:p.versions}));return race;}
function rebuild(){try{state.merged=attachResearch(mergeSources(state.sources,state.settings),state.merged?.researchPackage);state.error="";}catch(e){state.error=e.message;}}
function toast(m){state.toast=m;render();setTimeout(()=>{state.toast="";render();},1900);}
async function importFile(slot,file){
  state.busy=`${labels[slot]}を解析中`;state.error="";render();
  try{
    if(slot==="training"){const extracted=await extractPdfText(file);state.sources[slot]=parseTrainingText(extracted.text,file.name);state.sources[slot].pdfMeta=extracted.meta;}
    else{const text=await decodeJapaneseFile(file);state.sources[slot]=slot==="targetText"?parseTargetEntryText(text,file.name):slot==="entryCsv"?parseTargetEntryCsv(text,file.name):parseTargetResultCsv(text,file.name);}
    rebuild();persist();
  }catch(e){state.error=`${labels[slot]}: ${e.message}`;}
  state.busy="";render();
}
async function loadSample(){state.busy="有馬記念サンプルを読込中";render();try{state.merged=attachResearch(await fetch("./sample/arima-2025.json").then(r=>r.json()));state.view="research";state.error="";}catch(e){state.error=e.message;}state.busy="";render();}

function sourceCard(key,accept,desc,step){
  const d=state.sources[key],required=sourceRequired[key];
  return `<section class="source-card ${d?"loaded":""}"><div class="source-head"><div><span class="step">${step}</span><strong>${labels[key]}</strong><em class="${required?"required":"optional"}">${required?"必須":"任意"}</em></div><span class="status ${d?"ok":""}">${d?`${d.count}頭`:"未読込"}</span></div><p>${desc}</p>${d?`<div class="filename">${esc(d.filename)}</div>`:""}<label class="file-button">${d?"差し替える":"ファイルを選択"}<input type="file" data-file="${key}" accept="${accept}"></label></section>`;
}
function importView(){
  return `<div class="page-title"><span>PC DATA IMPORT</span><h2>PCで登録、iPhoneで閲覧</h2><p>TARGET出馬表TXTと調教PDFがレース前の必須データです。</p></div>
  <div class="source-grid">${sourceCard("targetText",".txt,text/plain","枠・馬番・馬名・ZI・血統・過去指数",1)}${sourceCard("training",".pdf,application/pdf","調教履歴・短評・急加速力",2)}${sourceCard("entryCsv",".csv,text/csv","当日オッズ・人気・馬体重の更新",3)}${sourceCard("resultCsv",".csv,text/csv","着順・確定オッズ・上がり3F",4)}</div>
  <div class="actions"><button data-action="sample">有馬記念サンプルを開く</button><button class="ghost danger" data-action="clear">読込データを消去</button></div>
  ${state.busy?`<div class="busy"><span class="spinner"></span>${esc(state.busy)}</div>`:""}${state.error?`<div class="error-box">${esc(state.error)}</div>`:""}${state.merged?mergePanel():""}`;
}
function mergePanel(){
  const m=state.merged,err=m.diagnostics.filter(x=>x.level==="error").length,warn=m.diagnostics.filter(x=>x.level==="warning").length;
  return `<section class="merge-panel"><div class="merge-title"><div><span>MERGE STATUS</span><h3>${esc(m.meta.raceName||m.raceId)}</h3><p>${esc(m.meta.date)} ${esc(m.meta.venue)} ${m.meta.raceNo||"-"}R</p></div><div class="merge-score">${m.counts.preRaceComplete}<small>/${m.counts.merged}</small></div></div>
  <div class="count-grid"><div><b>${m.counts.targetText}</b><span>出馬表TXT</span></div><div><b>${m.counts.training}</b><span>調教PDF</span></div><div><b>${m.counts.entryCsv}</b><span>任意CSV</span></div><div><b>${m.counts.resultCsv}</b><span>結果CSV</span></div></div>
  <div class="diag-summary"><span class="pill ${err?"bad":"good"}">エラー ${err}</span><span class="pill ${warn?"warn":"good"}">警告 ${warn}</span><span class="pill good">レース前結合 ${m.counts.preRaceComplete}頭</span></div>
  ${m.diagnostics.length?`<details><summary>照合結果</summary><ul class="diagnostics">${m.diagnostics.map(d=>`<li class="${d.level}">${d.number?d.number+"番 ":""}${esc(d.message)}</li>`).join("")}</ul></details>`:""}
  <div class="diag-summary"><span class="pill good">特徴量 ${m.horses?.[0]?.features?Object.keys(m.horses[0].features).length:0}項目/馬</span><span class="pill ${m.quality?.validationStatus==="ERROR"?"bad":m.quality?.validationStatus==="WARNING"?"warn":"good"}">品質 ${m.quality?.qualityScore??"-"}点</span><span class="pill good">OCR/解析 ${m.quality?.ocrConfidence!=null?Math.round(m.quality.ocrConfidence*100):"-"}%</span></div><div class="actions"><button class="primary" data-action="integrated">統合画面</button><button data-action="cloud-save" ${!state.cloud.user||m.counts.preRaceComplete===0?"disabled":""}>クラウド保存</button><button data-action="local-save" ${m.counts.preRaceComplete===0?"disabled":""}>端末保存</button><button data-action="csv-current">CSV</button><button data-action="json-current">JSON</button></div></section>`;
}
function waku(h){const dark=[1,5,8].includes(h.waku);return`<div class="waku" style="background:${WAKU[h.waku]||"#777"};color:${dark?"#17120d":"#fff"}">${h.number}</div>`;}
function dots(h){return Object.entries(h.sourceStatus||{}).map(([k,v])=>`<span title="${esc(labels[k])}" class="dot ${v?"on":""}"></span>`).join("");}
function horseCard(h){
  const b=h.basic||{},a=h.ability||{},t=h.trainingSummary||{},r=h.result||{},idx=(a.pastIndexes||[]).slice(0,8).map(x=>`<span class="index-chip ${x.surface==="D"?"dirt":""}">${x.value??"-"}${x.surface}</span>`).join("");
  return `<article class="horse-card" data-horse="${h.number}"><div class="horse-top">${waku(h)}<div class="horse-main"><div class="horse-name">${esc(h.name)}</div><div class="horse-meta">${esc(b.sex||r.sex)}${b.age??r.age??""} ${esc(b.jockey||r.jockey)} ${b.weight??r.weight??"-"}kg</div><div class="source-dots">${dots(h)}</div></div><div class="finish ${r.finish===1?"winner":""}"><b>${r.finish??"-"}</b><small>着</small></div></div>
  <div class="metric-row"><div><span>ZI</span><b>${a.zi??"-"}</b></div><div><span>急加速最高</span><b>${fmt(t.maxCurrent)}</b></div><div><span>最終1F</span><b>${fmt(t.latest1F)}</b></div><div><span>人気</span><b>${r.popularity??b.popularity??"-"}</b></div><div><span>単勝</span><b>${r.odds??b.odds??"-"}</b></div></div>${idx?`<div class="index-row">${idx}</div>`:""}<div class="horse-foot"><span>${esc(h.training?.shortComment||"")}</span><span>${r.time?`${esc(r.time)} / 上り${fmt(r.last3f)}`:"結果未取込"}</span></div></article>`;
}
function integratedView(){
  const m=state.merged;if(!m)return`<div class="empty"><h2>統合データがありません</h2><button data-view="import">取込へ</button></div>`;
  let hs=[...m.horses];if(state.sort==="zi")hs.sort((a,b)=>(b.ability?.zi??-999)-(a.ability?.zi??-999));else if(state.sort==="accel")hs.sort((a,b)=>(b.trainingSummary?.maxCurrent??-999)-(a.trainingSummary?.maxCurrent??-999));else if(state.sort==="finish")hs.sort((a,b)=>(a.result?.finish??999)-(b.result?.finish??999));else hs.sort((a,b)=>a.number-b.number);
  return `<div class="race-hero"><div><span>${esc(m.meta.date)} ${esc(m.meta.venue)} ${m.meta.raceNo||"-"}R</span><h2>${esc(m.meta.raceName||m.raceId)}</h2><p>${esc(m.meta.surface||"")}${m.meta.distance?m.meta.distance+"m":""}・${m.counts.resultMatched?"結果登録済":"レース前データ"}</p></div><div class="hero-stat"><b>${m.counts.preRaceComplete}</b><small>結合頭数</small></div></div>
  <div class="sort-bar"><button data-sort="number" class="${state.sort==="number"?"active":""}">馬番</button><button data-sort="zi" class="${state.sort==="zi"?"active":""}">ZI</button><button data-sort="accel" class="${state.sort==="accel"?"active":""}">急加速</button><button data-sort="finish" class="${state.sort==="finish"?"active":""}">着順</button></div><div class="horse-list">${hs.map(horseCard).join("")}</div>
  <div class="sticky-actions"><button class="primary" data-action="cloud-save" ${!state.cloud.user?"disabled":""}>クラウド保存</button><button data-action="local-save">端末保存</button><button data-action="csv-current">CSV</button><button data-action="json-current">JSON</button></div>`;
}
function sessionRow(s){if(s.overseas)return`<div class="session"><span>海外遠征</span></div>`;return`<div class="session"><div><b>${s.prev?"前走前 ":""}${esc(s.date)}</b><span>${esc(s.course)} ${esc(s.baba)} ${esc(s.style)}</span></div><div class="times">${(s.times||[]).map(v=>`<i>${fmt(v)}</i>`).join("")}</div>${s.note?`<p>${esc(s.note)}</p>`:""}</div>`;}
function detailView(){
  const h=state.merged?.horses.find(x=>x.number===state.selected);if(!h)return`<div class="empty">対象馬がありません。</div>`;
  const b=h.basic||{},a=h.ability||{},r=h.result||{},t=h.training||{},f=h.features||{},q=h.quality||{},o=h.ocr||{},l=h.logs||{};
  return `<button data-view="integrated" class="back">← 統合画面</button><div class="detail-title">${waku(h)}<div><h2>${esc(h.name)}</h2><p>${esc(b.sex)}${b.age??""} ${esc(b.jockey)} ${b.weight??"-"}kg</p></div></div>
  <section class="detail-card"><h3>特徴量エンジン v3.3.4</h3><dl><dt>特徴量数</dt><dd>${Object.keys(f).length}</dd><dt>品質スコア</dt><dd>${q.qualityScore??"-"} / 100（${esc(q.validationStatus||"-")}）</dd><dt>OCR/解析信頼度</dt><dd>${o.confidence!=null?Math.round(o.confidence*100)+"%":"-"}</dd><dt>方式</dt><dd>${esc(o.method||"-")}</dd><dt>計算時間</dt><dd>${l.calculationTimeMs??"-"} ms</dd><dt>Feature Version</dt><dd>${esc(l.featureVersion||FEATURE_SCHEMA_VERSION)}</dd></dl></section>
  <section class="detail-card"><h3>主要ルール特徴量</h3><dl><dt>能力代理指数</dt><dd>${fmt(f.speed_index_proxy,2)}</dd><dt>調教スコア</dt><dd>${fmt(f.training_score_rule,1)}</dd><dt>機動力</dt><dd>${fmt(f.agility_proxy,1)}</dd><dt>末脚力</dt><dd>${fmt(f.finish_power_proxy,1)}</dd><dt>持続力</dt><dd>${fmt(f.stamina_proxy,1)}</dd><dt>調整過程</dt><dd>${fmt(f.rotation_score,1)}</dd><dt>事前特徴量充足率</dt><dd>${f.pre_race_feature_completeness!=null?Math.round(f.pre_race_feature_completeness*100)+"%":"-"}</dd></dl><p class="hint">代理スコアは学習モデルではなく、再現可能なルール計算です。</p></section>
  <section class="detail-card"><h3>能力・基本情報</h3><dl><dt>ZI</dt><dd>${a.zi??"-"}</dd><dt>父</dt><dd>${esc(a.sire||"-")}</dd><dt>母父</dt><dd>${esc(a.broodmareSire||"-")}</dd><dt>厩舎</dt><dd>${esc(b.affiliation||"")} ${esc(b.trainer||"")}</dd><dt>馬体重</dt><dd>${b.bodyWeight??r.bodyWeight??"-"}kg</dd></dl></section>
  <section class="detail-card"><h3>調教履歴</h3>${(t.sessions||[]).map(sessionRow).join("")||'<p class="muted">調教データなし</p>'}</section>
  <section class="detail-card"><h3>品質指摘</h3>${q.issues?.length?`<ul class="diagnostics">${q.issues.map(i=>`<li class="${i.level}">${esc(i.message)} [${esc(i.code)}]</li>`).join("")}</ul>`:'<p class="muted">品質指摘なし</p>'}</section>
  <section class="detail-card"><h3>レース結果</h3><dl><dt>着順</dt><dd>${r.finish??"-"}着</dd><dt>人気</dt><dd>${r.popularity??"-"}人気</dd><dt>単勝</dt><dd>${r.odds??"-"}倍</dd><dt>タイム</dt><dd>${esc(r.time||"-")}</dd><dt>上り3F</dt><dd>${fmt(r.last3f)}</dd><dt>通過</dt><dd>${(r.corners||[]).join("-")||"-"}</dd><dt>PCI</dt><dd>${r.pci??"-"}</dd></dl></section>`;
}
function filteredLibrary(){
  const list=state.library==="cloud"?state.cloudRaces:Object.values(loadLocalRaces());const q=state.search.trim().toLowerCase();
  return list.filter(r=>!q||[r.raceId,r.meta?.raceName,r.meta?.venue,r.meta?.date].join(" ").toLowerCase().includes(q)).sort((a,b)=>(b.meta?.date||"").localeCompare(a.meta?.date||""));
}
function savedView(){
  const list=filteredLibrary();
  return `<div class="page-title"><span>RACE LIBRARY</span><h2>保存済みレース</h2></div><div class="library-toolbar"><button data-library="cloud" class="${state.library==="cloud"?"active":""}">クラウド</button><button data-library="local" class="${state.library==="local"?"active":""}">この端末</button><input id="search" value="${esc(state.search)}" placeholder="レース名・競馬場・日付を検索"><button data-action="refresh-cloud" ${!state.cloud.user?"disabled":""}>更新</button></div>
  ${state.library==="cloud"&&!state.cloud.user?`<div class="notice">クラウド一覧を見るにはGoogleログインしてください。</div>`:""}
  <div class="saved-list">${list.length?list.map(r=>`<article class="saved-card"><div><span>${esc(r.meta?.date)} ${esc(r.meta?.venue)} ${r.meta?.raceNo||"-"}R</span><h3>${esc(r.meta?.raceName||r.raceId)}</h3><p>${r.horses?.length||0}頭 / ${r.counts?.resultMatched?"結果登録済":"レース前"}</p></div><div class="saved-actions"><button data-open="${esc(r.raceId)}">開く</button><button data-race-csv="${esc(r.raceId)}">CSV</button><button data-race-json="${esc(r.raceId)}">JSON</button><button class="danger" data-delete="${esc(r.raceId)}">削除</button></div></article>`).join(""):`<div class="empty">該当する保存レースはありません。</div>`}</div>
  <div class="actions"><button data-action="backup-library">表示中一覧をJSON保存</button><button data-action="sync-local" ${!state.cloud.user?"disabled":""}>端末データをクラウドへ同期</button></div>`;
}
function configTemplate(){const c=getEffectiveConfig();return JSON.stringify(c,null,2);}
function settingsView(){
  const u=state.cloud.user;
  return `<div class="page-title"><span>CLOUD & CALCULATION</span><h2>設定</h2></div>
  <section class="settings-card"><h3>Firebaseクラウド同期</h3><div class="cloud-state ${u?"ok":state.cloud.configured?"warn":""}"><b>${u?"ログイン済み":state.cloud.configured?"Firebase設定済み・未ログイン":"Firebase未設定"}</b><span>${u?esc(u.email):state.cloud.error?esc(state.cloud.error):"未設定時は端末保存で動作します。"}</span></div>
  <div class="actions">${u?'<button data-action="signout">ログアウト</button>':'<button class="primary" data-action="signin" '+(!state.cloud.configured?'disabled':'')+'>Googleでログイン</button>'}</div>
  <label>Firebase設定（firebaseConfig）</label><textarea id="firebaseConfig" rows="9">${esc(configTemplate())}</textarea><div class="actions"><button data-action="save-config">この端末に設定して再読込</button><button class="danger ghost" data-action="clear-config">端末設定を消去</button></div><p class="hint">公開用ZIP内の firebase-config.js に設定すると、PCとiPhoneの両方へ一括反映できます。詳細は FIREBASE_SETUP.md を参照してください。</p></section>
  <section class="settings-card"><h3>JSONバックアップ復元</h3><label class="file-button">JSONを読み込む<input type="file" id="jsonRestore" accept=".json,application/json"></label></section>
  <section class="settings-card"><h3>調教コース設定</h3><div class="settings-head"><span>コース</span><span>補正</span><span>軸</span><span>消</span></div>${Object.entries(state.settings).map(([k,v])=>`<div class="setting-row"><b>${esc(k)}</b><input type="number" step=".1" data-setting="${esc(k)}" data-field="correction" value="${v.correction}"><input type="number" step=".1" data-setting="${esc(k)}" data-field="axisBorder" value="${v.axisBorder}"><input type="number" step=".1" data-setting="${esc(k)}" data-field="keshiBorder" value="${v.keshiBorder}"></div>`).join("")}<button data-action="reset-settings" class="ghost">初期値に戻す</button></section>`;
}

function researchView(){const races=state.researchRaces?.length?state.researchRaces:Object.values(loadLocalRaces()),a=state.researchV34||buildResearchAnalysis(races,state.researchFilters||{}),q=a.quality||{},stats=(a.basicStatistics||[]).slice(0,25),corr=(a.correlations||[]).slice(0,25),quant=(a.quantiles||[]).filter(x=>x.quantile===5).slice(0,15),val=(x,d=3)=>x==null?"-":Number(x).toFixed(d),pct=x=>x==null?"-":`${Number(x).toFixed(1)}%`;return `<div class="page-title"><span>RESEARCH LAB 3.4</span><h2>競馬AI研究所・分析基盤</h2><p>50レースまでは統計分析のみ。結果データは目的変数と検証に限定します。</p></div><div class="lab-kpis"><div><b>${a.raceCount}</b><span>蓄積レース</span></div><div><b>${a.horseCount}</b><span>蓄積馬</span></div><div><b>${a.resultCount}</b><span>結果登録馬</span></div><div><b>${a.featureCount}</b><span>数値特徴量<…1495 tokens truncated…ers?.[key]===v?"selected":""}>${esc(v)}</option>`).join("")}</select></label>`}
function researchDashboardView(){
  const title='<div class="page-title"><span>RESEARCH DASHBOARD PHASE 2</span><h2>研究ダッシュボード</h2><p>Horse ルートの canonical schema から品質とOCRを分析します。</p></div>';
  if(state.researchStatus==="loading")return`${title}<div class="busy" role="status"><span class="spinner"></span>研究データを読み込んでいます…</div>`;
  if(state.researchStatus==="error")return`${title}<div class="error-box" role="alert"><b>研究データを読み込めませんでした。</b><br>${esc(state.researchError)}</div><button data-action="refresh-research-dashboard">再試行</button>`;
  const races=state.researchRaces?.length?state.researchRaces:Object.values(loadLocalRaces());
  if(!races.length)return`${title}<div class="empty"><h3>研究データがありません</h3><p>レースを保存すると、ここに集計結果が表示されます。</p>${state.cloud.user?'<button data-action="refresh-research-dashboard">再読み込み</button>':""}</div>`;
  const d=buildResearchDashboard(races),details=buildQualityDetails(races),filtered=filterProblematicHorses(details.rows,state.researchQualityFilters),value=(x,digits=1)=>x==null?"-":Number(x).toFixed(digits);
  const distribution=items=>`<div class="distribution-grid">${items.map(item=>`<div><b>${esc(item.label)}</b><span>${item.count}頭（${item.percentage.toFixed(1)}%）</span><i style="width:${item.percentage}%"></i></div>`).join("")}</div>`;
  const q=details.issueTotals,f=state.researchQualityFilters;
  return`${title}<div class="lab-kpis">
    <div><b>${d.raceCount}</b><span>総レース数</span></div>
    <div><b>${d.horseCount}</b><span>総馬数</span></div>
    <div><b>${d.resultRegisteredHorseCount}</b><span>結果登録馬数</span></div>
    <div><b>${d.numericFeatureCount}</b><span>数値特徴量数</span></div>
    <div><b>${value(d.averageQualityScore)}</b><span>平均 qualityScore</span></div>
    <div><b>${d.averageOcrConfidence==null?"-":Math.round(d.averageOcrConfidence*100)+"%"}</b><span>平均 OCR confidence</span></div>
    <div><b>${d.totalMissingCount}</b><span>missingCount 合計</span></div>
    <div><b>${d.warningAndErrorCount}</b><span>警告・エラー数</span></div>
    <div><b>${d.progressTo50}%</b><span>50レース進捗</span></div>
    <div><b>${esc(d.dataModelVersion)}</b><span>dataModelVersion</span></div>
    <div><b>${esc(d.featureVersion)}</b><span>featureVersion</span></div>
    <div><b>${d.lastRecalculationTime?new Date(d.lastRecalculationTime).toLocaleString("ja-JP"):"-"}</b><span>最終再計算時刻</span></div>
  </div><div class="research-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${RESEARCH_RACE_TARGET}" aria-valuenow="${d.raceCount}"><span style="width:${d.progressTo50}%"></span></div>
  <div class="notice"><b>${d.raceCount}/${RESEARCH_RACE_TARGET} レース</b><br>${d.showAiTrainingControls?"AI 学習の実装は Phase 1 の対象外です。":`残り ${RESEARCH_RACE_TARGET-d.raceCount} レース。AI 学習コントロールは非表示です。`}</div>
  <div class="actions"><button data-action="refresh-research-dashboard" ${!state.cloud.user?"disabled":""}>クラウドから再読み込み</button></div>
  <section class="settings-card"><h3>qualityScore 分布</h3>${distribution(details.qualityDistribution)}</section>
  <section class="settings-card"><h3>OCR confidence 分布</h3>${distribution(details.ocrDistribution)}</section>
  <section class="settings-card"><h3>品質Issueサマリー</h3><div class="count-grid">
    <div><b>${q.missingCount}</b><span>missingCount</span></div><div><b>${q.warningCount}</b><span>warningCount</span></div>
    <div><b>${q.errorCount}</b><span>errorCount</span></div><div><b>${q.typeErrorCount}</b><span>typeErrorCount</span></div>
    <div><b>${q.abnormalCount}</b><span>abnormalCount</span></div><div><b>${q.duplicateFlagCount}</b><span>duplicateFlag</span></div>
  </div></section>
  <section class="settings-card"><h3>問題馬フィルター</h3><div class="quality-filters">
    <label>validationStatus<select id="qualityStatus"><option value="">すべて</option>${["PASS","WARNING","ERROR","UNREGISTERED"].map(status=>`<option value="${status}" ${f.validationStatus===status?"selected":""}>${status}</option>`).join("")}</select></label>
    <label>最小 qualityScore<input id="qualityMin" type="number" min="0" max="100" value="${esc(f.minQualityScore??"")}"></label>
    <label>最大 qualityScore<input id="qualityMax" type="number" min="0" max="100" value="${esc(f.maxQualityScore??"")}"></label>
    <label>最大 OCR confidence<input id="ocrMax" type="number" min="0" max="1" step=".01" value="${esc(f.maxOcrConfidence??"")}"></label>
    <label class="check"><input id="issuesOnly" type="checkbox" ${f.issuesOnly?"checked":""}> Issuesのみ</label>
  </div><div class="actions"><button data-action="apply-quality-filters">適用</button><button data-action="clear-quality-filters">クリア</button><button data-action="quality-csv" ${filtered.length?"":"disabled"}>表示中CSV</button></div></section>
  <section class="settings-card"><h3>問題馬一覧（${filtered.length}頭）</h3>
    ${filtered.length?`<div class="quality-table"><table><thead><tr><th>日付</th><th>レース</th><th>馬番</th><th>馬名</th><th>品質</th><th>OCR</th><th>Status</th><th>欠損</th><th>警告</th><th>Error</th><th>Issue</th></tr></thead><tbody>${filtered.map(row=>`<tr><td>${esc(row.raceDate||"-")}</td><td>${esc(row.raceName||row.raceId)}</td><td>${esc(row.horseNumber)}</td><td>${esc(row.horseName||"-")}</td><td>${row.qualityScore??"-"}</td><td>${row.ocrConfidence==null?"-":Math.round(row.ocrConfidence*100)+"%"}</td><td>${esc(row.validationStatus)}</td><td>${row.missingCount}</td><td>${row.warningCount}</td><td>${row.errorCount}</td><td>${esc(row.issueMessages.join(" / ")||"-")}</td></tr>`).join("")}</tbody></table></div>`:'<div class="empty"><h3>条件に一致する問題馬がありません</h3><p>フィルター条件を変更してください。</p></div>'}
  </section>
  ${d.showAiTrainingControls?'<section class="settings-card ai-training-controls"><h3>AI 学習</h3><p class="muted">Phase 1 では学習機能を実装していません。</p></section>':""}`;
}
function csvEscape(v){const s=String(v??"");return/[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function raceCsv(r){
  const head=["レースID","日付","競馬場","R","レース名","枠","馬番","馬名","性","年齢","騎手","斤量","ZI","過去指数","父","母父","急加速最高","最終1F","最終3F","調教短評","着順","人気","単勝","走破タイム","上り3F","PCI","通過","馬体重","増減"];
  const rows=r.horses.map(h=>{const b=h.basic||{},a=h.ability||{},t=h.trainingSummary||{},x=h.result||{};return[r.raceId,r.meta.date,r.meta.venue,r.meta.raceNo,r.meta.raceName,h.waku,h.number,h.name,b.sex||x.sex,b.age||x.age,b.jockey||x.jockey,b.weight||x.weight,a.zi,(a.pastIndexes||[]).map(i=>`${i.value??"-"}${i.surface}`).join("|"),a.sire,a.broodmareSire,t.maxCurrent,t.latest1F,t.latest3F,h.training?.shortComment,x.finish,x.popularity,x.odds,x.time,x.last3f,x.pci,(x.corners||[]).join("-"),x.bodyWeight??b.bodyWeight,x.bodyWeightDelta??b.bodyWeightDelta]});
  return"\uFEFF"+[head,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n");
}
function download(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function safeName(r){return`${r.meta?.date||""}_${r.meta?.raceName||r.raceId}`.replace(/[\\/:*?"<>|]/g,"_");}
function exportCsv(r){download(raceCsv(r),`${safeName(r)}_GallopAI.csv`,"text/csv;charset=utf-8");}
function exportJson(r){download(JSON.stringify(r,null,2),`${safeName(r)}_GallopAI.json`,"application/json");}
async function cloudSave(){if(!state.merged)return;try{state.busy="特徴量・品質・OCR・ログを生成して保存中";render();state.merged=attachResearch(state.merged,state.merged.researchPackage);if(state.merged.quality?.validationStatus==="ERROR")throw new Error("品質エラーがあるため保存できません。研究所の品質指摘を確認してください。");const singleAnalysis=buildResearchAnalysis([state.merged]);await saveCloudRace(state.merged,singleAnalysis);await refreshCloud();await refreshResearch(true);toast("v3.3.4正式構造でクラウド保存・統計更新しました");}catch(e){state.error=e.message;}state.busy="";render();}
async function refreshCloud(){if(!currentCloudUser()){state.cloudRaces=[];return;}state.cloudRaces=await listCloudRaces();}
async function refreshResearchDashboard(saveGlobal=false){
 if(!currentCloudUser()){state.researchRaces=[];state.researchAnalysis=buildResearchAnalysis(Object.values(loadLocalRaces()));return;}
 state.busy="クラウド全件の特徴量統計を再計算中";render();
 state.researchRaces=await loadResearchDataset();state.researchAnalysis=buildResearchAnalysis(state.researchRaces);
 if(saveGlobal)await saveGlobalResearchAnalysis(state.researchAnalysis,featureDictionary());
 state.busy="";render();
}
async function refreshResearch(saveGlobal=false){
 if(!currentCloudUser()){state.researchRaces=[];state.researchStatus="ready";state.researchError="";render();return;}
 state.researchStatus="loading";state.researchError="";render();
 try{
  state.researchRaces=await loadResearchDataset();
  state.researchAnalysis=buildResearchAnalysis(state.researchRaces);
  if(saveGlobal)await saveGlobalResearchAnalysis(state.researchAnalysis,featureDictionary());
  state.researchStatus="ready";
 }catch(error){
  state.researchStatus="error";state.researchError=error.message||String(error);
 }finally{render();}
}
async function openRace(id){let r=state.library==="cloud"?await getCloudRace(id):loadLocalRaces()[id];if(r){state.merged=attachResearch(r,r.researchPackage);state.view="integrated";render();}}
async function removeRace(id){if(!confirm("このレースを削除しますか？"))return;if(state.library==="cloud"){await deleteCloudRace(id);await refreshCloud();}else deleteLocalRace(id);render();}
function header(){
  const u=state.cloud.user,status=u?`☁ ${esc(u.email)}`:state.cloud.configured?"☁ 未ログイン":"端末モード";
  return `<header><div class="brand"><div class="logo">G</div><div><b>GallopAI</b><span>Version 3.4</span></div></div><div class="auth"><span>${status}</span>${u?'<button data-action="signout">ログアウト</button>':state.cloud.configured?'<button data-action="signin">Googleログイン</button>':""}</div><nav>${[["import","取込"],["integrated","統合"],["research","研究所"],["saved","保存"],["settings","設定"]].map(([v,l])=>`<button data-view="${v}" class="${state.view===v||state.view==="detail"&&v==="integrated"?"active":""}">${l}</button>`).join("")}</nav></header>`;
}
function render(){
  const content=state.view==="import"?importView():state.view==="integrated"?integratedView():state.view==="detail"?detailView():state.view==="research"?researchDashboardView():state.view==="saved"?savedView():settingsView();
  document.getElementById("app").innerHTML=`${header()}<main>${content}</main>${state.toast?`<div class="toast">${esc(state.toast)}</div>`:""}<footer>GallopAI v3.4｜機械学習は禁止。50レースまでは統計検証のみ。</footer>`;bind();
}
function bind(){
  document.querySelectorAll("[data-view]").forEach(e=>e.onclick=async()=>{state.view=e.dataset.view;render();if(state.view==="research"&&state.cloud.user&&!state.researchRaces.length)await refreshResearchDashboard();});
  document.querySelectorAll("[data-file]").forEach(e=>e.onchange=()=>e.files?.[0]&&importFile(e.dataset.file,e.files[0]));
  document.querySelectorAll("[data-sort]").forEach(e=>e.onclick=()=>{state.sort=e.dataset.sort;render();});
  document.querySelectorAll("[data-horse]").forEach(e=>e.onclick=()=>{state.selected=Number(e.dataset.horse);state.view="detail";render();});
  document.querySelectorAll("[data-library]").forEach(e=>e.onclick=()=>{state.library=e.dataset.library;render();});
  document.querySelectorAll("[data-open]").forEach(e=>e.onclick=()=>openRace(e.dataset.open));
  document.querySelectorAll("[data-delete]").forEach(e=>e.onclick=()=>removeRace(e.dataset.delete));
  document.querySelectorAll("[data-race-csv]").forEach(e=>e.onclick=async()=>{const r=state.library==="cloud"?await getCloudRace(e.dataset.raceCsv):loadLocalRaces()[e.dataset.raceCsv];if(r)exportCsv(r);});
  document.querySelectorAll("[data-race-json]").forEach(e=>e.onclick=async()=>{const r=state.library==="cloud"?await getCloudRace(e.dataset.raceJson):loadLocalRaces()[e.dataset.raceJson];if(r)exportJson(r);});
  document.querySelectorAll("[data-setting]").forEach(e=>e.onchange=()=>{state.settings[e.dataset.setting][e.dataset.field]=Number(e.value);saveSettings(state.settings);rebuild();persist();render();});
  const search=document.getElementById("search");if(search)search.oninput=()=>{state.search=search.value;render();};
  const restore=document.getElementById("jsonRestore");if(restore)restore.onchange=async()=>{try{const data=JSON.parse(await restore.files[0].text());const n=importLocalBackup(data);toast(`${n}件を端末へ復元しました`);}catch(e){state.error=e.message;render();}};
  document.querySelectorAll("[data-action]").forEach(e=>e.onclick=async()=>{
    const a=e.dataset.action;
    try{
      if(a==="sample")await loadSample();
      if(a==="clear"&&confirm("現在の読込データを消去しますか？")){state.sources={targetText:null,training:null,entryCsv:null,resultCsv:null};state.merged=null;clearWorkspace();render();}
      if(a==="integrated"){state.view="integrated";render();}
      if(a==="local-save"&&state.merged){state.merged=attachResearch(state.merged,state.merged.researchPackage);const existed=!!loadLocalRaces()[state.merged.raceId];saveLocalRace(state.merged);toast(existed?"端末の既存レースを更新しました":"端末へ保存しました");}
      if(a==="cloud-save")await cloudSave();
      if(a==="csv-current"&&state.merged)exportCsv(state.merged);
      if(a==="json-current"&&state.merged)exportJson(state.merged);
      if(a==="refresh-research")await refreshResearch(true);
      if(a==="refresh-research-dashboard")await refreshResearchDashboard(false);
      if(a==="apply-quality-filters"){
        state.researchQualityFilters={
          validationStatus:document.getElementById("qualityStatus")?.value||"",
          minQualityScore:document.getElementById("qualityMin")?.value||"",
          maxQualityScore:document.getElementById("qualityMax")?.value||"",
          maxOcrConfidence:document.getElementById("ocrMax")?.value||"",
          issuesOnly:!!document.getElementById("issuesOnly")?.checked
        };render();
      }
      if(a==="clear-quality-filters"){state.researchQualityFilters={issuesOnly:false};render();}
      if(a==="quality-csv"){
        const races=state.researchRaces?.length?state.researchRaces:Object.values(loadLocalRaces());
        const rows=filterProblematicHorses(buildQualityDetails(races).rows,state.researchQualityFilters);
        download(problematicHorsesCsv(rows),"GallopAI_problematic_horses.csv","text/csv;charset=utf-8");
      }
      if(a==="analysis-json"){const analysis=state.researchAnalysis||buildResearchAnalysis(state.researchRaces||[]);download(JSON.stringify(analysis,null,2),`GallopAI_v3.3.4_research_statistics.json`,"application/json");}
      if(a==="refresh-v34"){state.busy="クラウド全件を再集計中";render();try{state.researchRaces=await loadResearchDataset();state.researchV34=buildResearchAnalysis(state.researchRaces,state.researchFilters||{});await saveResearchAnalysis(state.researchV34);toast(`再集計完了：${state.researchV34.raceCount}レース／${state.researchV34.horseCount}頭`)}catch(e){toast(`再集計エラー: ${e.message}`)}state.busy="";render()}if(a==="apply-research-filters"){const f={};document.querySelectorAll("[data-filter]").forEach(el=>{if(el.value)f[el.dataset.filter]=el.value});state.researchFilters=f;state.researchV34=buildResearchAnalysis(state.researchRaces?.length?state.researchRaces:Object.values(loadLocalRaces()),f);render()}if(a==="clear-research-filters"){state.researchFilters={};state.researchV34=buildResearchAnalysis(state.researchRaces?.length?state.researchRaces:Object.values(loadLocalRaces()),{});render()}if(a==="stats-json"){const x=state.researchV34||buildResearchAnalysis(state.researchRaces||[],state.researchFilters||{});download(JSON.stringify(x,null,2),"GallopAI_v3.4_analysis.json","application/json")}if(a==="stats-csv"){const x=state.researchV34||buildResearchAnalysis(state.researchRaces||[],state.researchFilters||{}),rows=x.basicStatistics||[],h=["featureId","name","group","count","missingCount","missingRate","mean","median","min","max","variance","standardDeviation","q1","q3","outlierCount","fillRate","availablePreRace"];download([h.join(","),...rows.map(r=>h.map(k=>csvEscape(r[k])).join(","))].join("\n"),"GallopAI_v3.4_basic_statistics.csv","text/csv;charset=utf-8")}if(a==="feature-csv"){const rows=featureDictionary(),q=v=>`"${String(v??"").replace(/"/g,'""')}"`;download("\uFEFF"+[["FeatureID","key","名称","説明","単位","型","計算式","利用AI","group","availablePreRace","sourceFields","missingPolicy","leakageRisk"],...rows.map(x=>[x.FeatureID,x.key,x.名称,x.説明,x.単位,x.型,x.計算式,(x.利用AI||[]).join("|"),x.group,x.availablePreRace,(x.sourceFields||[]).join("|"),x.missingPolicy,x.leakageRisk])].map(r=>r.map(q).join(",")).join("\r\n"),"GallopAI_v3.3.4_feature_dictionary.csv","text/csv;charset=utf-8");}
      if(a==="feature-json")download(JSON.stringify({version:FEATURE_SCHEMA_VERSION,count:featureDictionary().length,features:featureDictionary()},null,2),"feature_dictionary.json","application/json");
      if(a==="research-json"&&state.merged)download(JSON.stringify(state.merged.researchPackage||buildResearchPackage(state.merged,state.settings),null,2),`${safeName(state.merged)}_research.json`,"application/json");
      if(a==="signin")await signInGoogle();
      if(a==="signout")await signOutCloud();
      if(a==="refresh-cloud"){state.busy="クラウド一覧を更新中";render();await refreshCloud();state.busy="";render();}
      if(a==="backup-library"){const races=state.library==="cloud"?Object.fromEntries(state.cloudRaces.map(r=>[r.raceId,r])):loadLocalRaces();download(JSON.stringify({version:"3.3.4",exportedAt:new Date().toISOString(),races},null,2),`GallopAI_${state.library}_backup.json`,"application/json");}
      if(a==="sync-local"){const races=Object.values(loadLocalRaces());for(const r of races){const full=attachResearch(r,r.researchPackage);await saveCloudRace(full,buildResearchAnalysis([full]));}await refreshCloud();await refreshResearch(true);toast(`${races.length}件をクラウドへ同期しました`);}
      if(a==="save-config"){const cfg=parseConfigText(document.getElementById("firebaseConfig").value);saveRuntimeConfig(cfg);location.reload();}
      if(a==="clear-config"){clearRuntimeConfig();location.reload();}
      if(a==="reset-settings"&&confirm("調教設定を初期化しますか？")){state.settings=structuredClone(COURSE_TABLE);saveSettings(state.settings);rebuild();render();}
    }catch(err){state.error=err.message;state.busy="";render();}
  });
}
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
document.addEventListener("DOMContentLoaded",async()=>{
  restore();render();
  await initCloud(async info=>{state.cloud={configured:info.configured,status:info.status,user:info.user||null,error:info.error||""};if(info.user){try{await refreshCloud();}catch(e){state.cloud.error=e.message;}}render();});
});

