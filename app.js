import {decodeJapaneseFile,parseTargetEntryCsv,parseTargetEntryText,parseTargetResultCsv,parseTrainingText,COURSE_TABLE} from "./parsers.js";
import {mergeSources,acceleration} from "./engine.js";
import {buildResearchPackage,featureDictionary,FEATURE_SCHEMA_VERSION,FEATURE_ENGINE_VERSION,MIN_RACES_FOR_ML} from "./feature-store.js";
import {loadLocalRaces,saveLocalRace,deleteLocalRace,loadWorkspace,saveWorkspace,clearWorkspace,loadSettings,saveSettings,importLocalBackup} from "./local-storage.js";
import {initCloud,cloudIsConfigured,signInGoogle,signOutCloud,currentCloudUser,saveCloudRace,saveGlobalResearchAnalysis,listCloudRaces,getCloudRace,deleteCloudRace,loadResearchDataset,migrateLegacyToV334,parseConfigText,saveRuntimeConfig,clearRuntimeConfig,getEffectiveConfig,CLOUD_DATA_MODEL_VERSION} from "./cloud.js";
import {buildResearchAnalysis,formatPercent} from "./analysis-engine.js";

const WAKU={1:"#f7f5f0",2:"#343434",3:"#d93b2b",4:"#1e5fc4",5:"#f2c230",6:"#2f8f3e",7:"#f0821e",8:"#f0a8c4"};
const labels={targetText:"TARGET出馬表TXT",training:"競馬ブック調教PDF",entryCsv:"TARGET出馬表CSV（任意）",resultCsv:"TARGET結果CSV（レース後）"};
const state={view:"import",sources:{targetText:null,training:null,entryCsv:null,resultCsv:null},merged:null,selected:null,sort:"number",error:"",busy:"",toast:"",settings:loadSettings(COURSE_TABLE),cloud:{configured:cloudIsConfigured(),status:"loading",user:null,error:""},cloudRaces:[],researchRaces:[],researchAnalysis:null,researchV34:null,researchFilters:{},library:"cloud",search:""};
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
  <div class="actions"><button data-action="backup-library">表示中一覧をJSON保存</button><button data-action="migrate" ${!state.cloud.user?"disabled":""}>端末データをクラウドへ同期</button></div>`;
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

function researchView(){const races=state.researchRaces?.length?state.researchRaces:Object.values(loadLocalRaces()),a=state.researchV34||buildResearchAnalysis(races,state.researchFilters||{}),q=a.quality||{},stats=(a.basicStatistics||[]).slice(0,25),corr=(a.correlations||[]).slice(0,25),quant=(a.quantiles||[]).filter(x=>x.quantile===5).slice(0,15),val=(x,d=3)=>x==null?"-":Number(x).toFixed(d),pct=x=>x==null?"-":`${Number(x).toFixed(1)}%`;return `<div class="page-title"><span>RESEARCH LAB 3.4</span><h2>競馬AI研究所・分析基盤</h2><p>50レースまでは統計分析のみ。結果データは目的変数と検証に限定します。</p></div><div class="lab-kpis"><div><b>${a.raceCount}</b><span>蓄積レース</span></div><div><b>${a.horseCount}</b><span>蓄積馬</span></div><div><b>${a.resultCount}</b><span>結果登録馬</span></div><div><b>${a.featureCount}</b><span>数値特徴量</span></div><div><b>${val(q.avgQualityScore,1)}</b><span>平均品質</span></div><div><b>${q.avgOcrConfidence==null?"-":Math.round(q.avgOcrConfidence*100)+"%"}</b><span>OCR平均</span></div><div><b>${q.missingTotal||0}</b><span>欠損総数</span></div><div><b>${q.warningCount||0}</b><span>警告・エラー</span></div><div><b>${a.progressTo50}%</b><span>50R到達率</span></div><div><b>${esc(a.dataModelVersion)}</b><span>Data Model</span></div><div><b>${esc(a.featureVersion)}</b><span>Feature</span></div><div><b>${a.generatedAt?new Date(a.generatedAt).toLocaleString("ja-JP"):"-"}</b><span>最終再集計</span></div></div><div class="notice"><b>統計期間：${a.raceCount}/50レース</b><br>${a.mlLocked?`残り ${50-a.raceCount} レース。機械学習は表示・実行しません。`:"50レース到達後も時系列検証完了までは学習しません。"}</div><section class="settings-card"><h3>フィルター</h3><div class="filter-grid">${filterSelect("venue","競馬場",races.map(r=>r.meta?.venue||r.venue))}${filterSelect("surface","芝／ダート",races.map(r=>r.meta?.surface||r.surface))}<label>距離<input data-filter="distance" type="number" value="${esc(state.researchFilters?.distance||"")}"></label>${filterSelect("distanceBand","距離区分",["短距離","マイル","中距離","長距離"])}${filterSelect("trackCondition","馬場状態",races.map(r=>r.meta?.trackCondition||r.trackCondition))}${filterSelect("raceClass","クラス",races.map(r=>r.meta?.class||r.raceClass))}<label>年齢<input data-filter="age" type="number" value="${esc(state.researchFilters?.age||"")}"></label>${filterSelect("sex","性別",["牡","牝","セ","雄","雌"])}${filterSelect("popularityBand","人気帯",["1-3番人気","4-6番人気","7-9番人気","10番人気以下"])}<label>調教コース<input data-filter="trainingCourse" value="${esc(state.researchFilters?.trainingCourse||"")}"></label><label>開始日<input data-filter="fromDate" type="date" value="${esc(state.researchFilters?.fromDate||"")}"></label><label>終了日<input data-filter="toDate" type="date" value="${esc(state.researchFilters?.toDate||"")}"></label></div><div class="actions"><button data-action="apply-research-filters">フィルター再計算</button><button data-action="clear-research-filters">条件クリア</button></div></section><div class="actions"><button class="primary" data-action="refresh-v34" ${!state.cloud.user?"disabled":""}>クラウド全件を再集計</button><button data-action="stats-csv">基本統計CSV</button><button data-action="stats-json">分析JSON</button></div>${(a.warnings||[]).map(w=>`<div class="notice">${esc(w)}</div>`).join("")}<section class="settings-card"><h3>特徴量基本統計</h3><div class="stat-table seven"><div class="head"><span>特徴量</span><span>件数</span><span>欠損率</span><span>平均</span><span>中央値</span><span>分散</span><span>充足率</span></div>${stats.map(x=>`<div><span>${esc(x.name)}</span><span>${x.count}</span><span>${pct(x.missingRate)}</span><span>${val(x.mean)}</span><span>${val(x.median)}</span><span>${val(x.variance)}</span><span>${pct(x.fillRate)}</span></div>`).join("")}</div></section><section class="settings-card"><h3>相関ランキング</h3><div class="stat-table seven"><div class="head"><span>特徴量</span><span>目的</span><span>n</span><span>Pearson</span><span>Spearman</span><span>欠損率</span><span>注意</span></div>${corr.length?corr.map(x=>`<div><span>${esc(x.name)}</span><span>${esc(x.target)}</span><span>${x.sampleSize}</span><span>${val(x.pearson)}</span><span>${val(x.spearman)}</span><span>${pct(x.missingRate)}</span><span>${esc(x.caution||"")}</span></div>`).join(""):'<div><span>サンプル不足</span><span>-</span><span>-</span><span>-</span><span>-</span><span>-</span><span>30頭以上必要</span></div>'}</div></section><section class="settings-card"><h3>上位20%分位点分析</h3><div class="stat-table eight"><div class="head"><span>特徴量</span><span>件数</span><span>勝率</span><span>複勝率</span><span>平均着順</span><span>人気</span><span>単勝ROI</span><span>複勝ROI</span></div>${quant.map(x=>`<div><span>${esc(x.name)}</span><span>${x.count}</span><span>${pct(x.winRate)}</span><span>${pct(x.placeRate)}</span><span>${val(x.avgFinish,2)}</span><span>${val(x.avgPopularity,2)}</span><span>${x.winRoi==null?"計算不可":val(x.winRoi,1)}</span><span>${x.placeRoi==null?"計算不可":val(x.placeRoi,1)}</span></div>`).join("")}</div></section><section class="settings-card"><h3>急加速力帯別成績</h3><div class="stat-table eight"><div class="head"><span>帯</span><span>件数</span><span>勝率</span><span>複勝率</span><span>平均着順</span><span>平均人気</span><span>単勝ROI</span><span>複勝ROI</span></div>${(a.training?.accelerationBands||[]).map(x=>`<div><span>${x.label}</span><span>${x.count}</span><span>${pct(x.winRate)}</span><span>${pct(x.placeRate)}</span><span>${val(x.avgFinish,2)}</span><span>${val(x.avgPopularity,2)}</span><span>${x.winRoi==null?"計算不可":val(x.winRoi,1)}</span><span>${x.placeRoi==null?"計算不可":val(x.placeRoi,1)}</span></div>`).join("")}</div></section><section class="settings-card"><h3>品質・OCR</h3><div class="count-grid"><div><b>${val(q.avgQualityScore,1)}</b><span>平均品質</span></div><div><b>${q.avgOcrConfidence==null?"-":Math.round(q.avgOcrConfidence*100)+"%"}</b><span>OCR平均</span></div><div><b>${q.typeErrorCount||0}</b><span>型エラー</span></div><div><b>${q.abnormalCount||0}</b><span>異常値</span></div><div><b>${q.duplicateCount||0}</b><span>重複</span></div><div><b>${q.lowOcrRows?.length||0}</b><span>OCR80%未満</span></div></div></section>`}
function filterSelect(key,label,values){const u=[...new Set((values||[]).filter(Boolean))].sort();return `<label>${label}<select data-filter="${key}"><option value="">すべて</option>${u.map(v=>`<option value="${esc(v)}" ${state.researchFilters?.[key]===v?"selected":""}>${esc(v)}</option>`).join("")}</select></label>`}
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
async function refreshResearch(saveGlobal=false){
 if(!currentCloudUser()){state.researchRaces=[];state.researchAnalysis=buildResearchAnalysis(Object.values(loadLocalRaces()));return;}
 state.busy="クラウド全件の特徴量統計を再計算中";render();
 state.researchRaces=await loadResearchDataset();state.researchAnalysis=buildResearchAnalysis(state.researchRaces);
 if(saveGlobal)await saveGlobalResearchAnalysis(state.researchAnalysis,featureDictionary());
 state.busy="";render();
}
async function openRace(id){let r=state.library==="cloud"?await getCloudRace(id):loadLocalRaces()[id];if(r){state.merged=attachResearch(r,r.researchPackage);state.view="integrated";render();}}
async function removeRace(id){if(!confirm("このレースを削除しますか？"))return;if(state.library==="cloud"){await deleteCloudRace(id);await refreshCloud();}else deleteLocalRace(id);render();}
function header(){
  const u=state.cloud.user,status=u?`☁ ${esc(u.email)}`:state.cloud.configured?"☁ 未ログイン":"端末モード";
  return `<header><div class="brand"><div class="logo">G</div><div><b>GallopAI</b><span>Version 3.4</span></div></div><div class="auth"><span>${status}</span>${u?'<button data-action="signout">ログアウト</button>':state.cloud.configured?'<button data-action="signin">Googleログイン</button>':""}</div><nav>${[["import","取込"],["integrated","統合"],["research","研究所"],["saved","保存"],["settings","設定"]].map(([v,l])=>`<button data-view="${v}" class="${state.view===v||state.view==="detail"&&v==="integrated"?"active":""}">${l}</button>`).join("")}</nav></header>`;
}
function render(){
  const content=state.view==="import"?importView():state.view==="integrated"?integratedView():state.view==="detail"?detailView():state.view==="research"?researchView():state.view==="saved"?savedView():settingsView();
  document.getElementById("app").innerHTML=`${header()}<main>${content}</main>${state.toast?`<div class="toast">${esc(state.toast)}</div>`:""}<footer>GallopAI v3.4｜機械学習は禁止。50レースまでは統計検証のみ。</footer>`;bind();
}
function bind(){
  document.querySelectorAll("[data-view]").forEach(e=>e.onclick=async()=>{state.view=e.dataset.view;render();if(state.view==="research"&&state.cloud.user&&!state.researchRaces.length)await refreshResearch();});
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
      if(a==="migrate-v334"){state.busy="Horseをv3.3.4正式構造へ移行中";render();const result=await migrateLegacyToV334();await refreshCloud();await refreshResearch(true);toast(`移行 ${result.migrated}件／対象外 ${result.skipped}件／失敗 ${result.failed}件`);}
      if(a==="analysis-json"){const analysis=state.researchAnalysis||buildResearchAnalysis(state.researchRaces||[]);download(JSON.stringify(analysis,null,2),`GallopAI_v3.3.4_research_statistics.json`,"application/json");}
      if(a==="refresh-v34"){state.busy="クラウド全件を再集計中";render();try{state.researchRaces=await loadResearchDataset();state.researchV34=buildResearchAnalysis(state.researchRaces,state.researchFilters||{});await saveResearchAnalysis(state.researchV34);toast(`再集計完了：${state.researchV34.raceCount}レース／${state.researchV34.horseCount}頭`)}catch(e){toast(`再集計エラー: ${e.message}`)}state.busy="";render()}if(a==="apply-research-filters"){const f={};document.querySelectorAll("[data-filter]").forEach(el=>{if(el.value)f[el.dataset.filter]=el.value});state.researchFilters=f;state.researchV34=buildResearchAnalysis(state.researchRaces?.length?state.researchRaces:Object.values(loadLocalRaces()),f);render()}if(a==="clear-research-filters"){state.researchFilters={};state.researchV34=buildResearchAnalysis(state.researchRaces?.length?state.researchRaces:Object.values(loadLocalRaces()),{});render()}if(a==="stats-json"){const x=state.researchV34||buildResearchAnalysis(state.researchRaces||[],state.researchFilters||{});download(JSON.stringify(x,null,2),"GallopAI_v3.4_analysis.json","application/json")}if(a==="stats-csv"){const x=state.researchV34||buildResearchAnalysis(state.researchRaces||[],state.researchFilters||{}),rows=x.basicStatistics||[],h=["featureId","name","group","count","missingCount","missingRate","mean","median","min","max","variance","standardDeviation","q1","q3","outlierCount","fillRate","availablePreRace"];download([h.join(","),...rows.map(r=>h.map(k=>csvEscape(r[k])).join(","))].join("\n"),"GallopAI_v3.4_basic_statistics.csv","text/csv;charset=utf-8")}if(a==="feature-csv"){const rows=featureDictionary(),q=v=>`"${String(v??"").replace(/"/g,'""')}"`;download("\uFEFF"+[["FeatureID","key","名称","説明","単位","型","計算式","利用AI","group","availablePreRace","sourceFields","missingPolicy","leakageRisk"],...rows.map(x=>[x.FeatureID,x.key,x.名称,x.説明,x.単位,x.型,x.計算式,(x.利用AI||[]).join("|"),x.group,x.availablePreRace,(x.sourceFields||[]).join("|"),x.missingPolicy,x.leakageRisk])].map(r=>r.map(q).join(",")).join("\r\n"),"GallopAI_v3.3.4_feature_dictionary.csv","text/csv;charset=utf-8");}
      if(a==="feature-json")download(JSON.stringify({version:FEATURE_SCHEMA_VERSION,count:featureDictionary().length,features:featureDictionary()},null,2),"feature_dictionary.json","application/json");
      if(a==="research-json"&&state.merged)download(JSON.stringify(state.merged.researchPackage||buildResearchPackage(state.merged,state.settings),null,2),`${safeName(state.merged)}_research.json`,"application/json");
      if(a==="signin")await signInGoogle();
      if(a==="signout")await signOutCloud();
      if(a==="refresh-cloud"){state.busy="クラウド一覧を更新中";render();await refreshCloud();state.busy="";render();}
      if(a==="backup-library"){const races=state.library==="cloud"?Object.fromEntries(state.cloudRaces.map(r=>[r.raceId,r])):loadLocalRaces();download(JSON.stringify({version:"3.3.4",exportedAt:new Date().toISOString(),races},null,2),`GallopAI_${state.library}_backup.json`,"application/json");}
      if(a==="migrate"){const races=Object.values(loadLocalRaces());for(const r of races){const full=attachResearch(r,r.researchPackage);await saveCloudRace(full,buildResearchAnalysis([full]));}await refreshCloud();await refreshResearch(true);toast(`${races.length}件をクラウドへ同期しました`);}
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
