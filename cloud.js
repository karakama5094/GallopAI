import {firebaseConfig as bundledConfig} from './firebase-config.js';

const SDK='12.16.0',CONFIG_KEY='gallopai_v23_firebase_config';
export const CLOUD_DATA_MODEL_VERSION='3.4.0';
let mods=null,app=null,auth=null,db=null,user=null;
const required=['apiKey','authDomain','projectId','appId'];
const valid=c=>c&&required.every(k=>String(c[k]||'').trim());
const clean=v=>JSON.parse(JSON.stringify(v));
function canonicalHorseDocument(raw,features,quality,ocr,logs,versions){
 return clean({
  raw:raw||{},
  features:features||{},
  quality:quality||{},
  ocr:ocr||{},
  logs:logs||{},
  versions:versions||{}
 });
}
const safeId=s=>String(s).replace(/[^A-Za-z0-9_-]/g,'_');

export function getEffectiveConfig(){try{const local=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');if(valid(local))return local;}catch{}return bundledConfig;}
export function cloudIsConfigured(){return valid(getEffectiveConfig());}
export function saveRuntimeConfig(config){if(!valid(config))throw new Error('apiKey、authDomain、projectId、appIdは必須です。');localStorage.setItem(CONFIG_KEY,JSON.stringify(config));}
export function clearRuntimeConfig(){localStorage.removeItem(CONFIG_KEY);}
export function parseConfigText(text){let s=String(text||'').trim(),a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<a)throw new Error('Firebase設定オブジェクトを認識できません。');s=s.slice(a,b+1).replace(/\/\/.*$/gm,'').replace(/([,{]\s*)([A-Za-z_$][\w$]*)\s*:/g,'$1"$2":').replace(/'/g,'"').replace(/,\s*}/g,'}');try{return JSON.parse(s)}catch{throw new Error('設定を解析できません。');}}

export async function initCloud(callback){
 if(!cloudIsConfigured()){callback?.({configured:false,user:null,status:'local'});return;}
 try{
  const [am,au,fm]=await Promise.all([import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)]);
  mods={...am,...au,...fm};app=mods.getApps().length?mods.getApp():mods.initializeApp(getEffectiveConfig());auth=mods.getAuth(app);db=mods.getFirestore(app);await mods.setPersistence(auth,mods.browserLocalPersistence);
  try{await mods.getRedirectResult(auth);}catch(e){console.warn(e);}
  mods.onAuthStateChanged(auth,u=>{user=u;callback?.({configured:true,user,status:u?'signed-in':'signed-out'});});
 }catch(e){callback?.({configured:true,user:null,status:'error',error:e.message});}
}
export function currentCloudUser(){return user;}
export async function signInGoogle(){if(!auth)throw new Error('Firebaseが未設定です。');const p=new mods.GoogleAuthProvider();try{return await mods.signInWithPopup(auth,p);}catch(e){if(['auth/popup-blocked','auth/popup-closed-by-user','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e.code)){await mods.signInWithRedirect(auth,p);return null;}throw e;}}
export async function signOutCloud(){if(auth)await mods.signOut(auth);}
function ensure(){if(!db||!user)throw new Error('Googleログインが必要です。');}

function pathSet(raceId,horseKey=null,logId='current'){
 const root=['users',user.uid,'races',raceId];
 return{
  race:mods.doc(db,...root),
  horse:horseKey?mods.doc(db,...root,'horses',horseKey):null,
  raw:horseKey?mods.doc(db,...root,'horses',horseKey,'raw','current'):null,
  feature:horseKey?mods.doc(db,...root,'horses',horseKey,'features','current'):null,
  quality:horseKey?mods.doc(db,...root,'horses',horseKey,'quality','current'):null,
  ocr:horseKey?mods.doc(db,...root,'horses',horseKey,'ocr','current'):null,
  logCurrent:horseKey?mods.doc(db,...root,'horses',horseKey,'logs','current'):null,
  logEvent:horseKey?mods.doc(db,...root,'horses',horseKey,'logs',logId):null,
  analysisQuality:mods.doc(db,...root,'analyses','quality'),
  analysisTraining:mods.doc(db,...root,'analyses','training-statistics'),
  analysisFeatures:mods.doc(db,...root,'analyses','feature-statistics'),
  analysisOcr:mods.doc(db,...root,'analyses','ocr-statistics'),
  analysisLog:mods.doc(db,...root,'analyses','calculation-log'),
  dictionary:mods.doc(db,...root,'metadata','feature-dictionary'),
  schema:mods.doc(db,...root,'metadata','schema')
 };
}
const globalPaths=()=>({
 training:mods.doc(db,'users',user.uid,'research','training-statistics'),
 features:mods.doc(db,'users',user.uid,'research','feature-statistics'),
 ocr:mods.doc(db,'users',user.uid,'research','ocr-statistics'),
 quality:mods.doc(db,'users',user.uid,'research','quality-statistics'),
 status:mods.doc(db,'users',user.uid,'research','status'),
 dictionary:mods.doc(db,'users',user.uid,'metadata','feature-dictionary'),
 schema:mods.doc(db,'users',user.uid,'metadata','schema')
});

export async function saveCloudRace(race,analysis=null){
 ensure();const research=race.researchPackage||null,base=research?.race||race;
 if(!base?.raceId)throw new Error('レースIDがありません。');
 if(research?.quality?.validationStatus==='ERROR')throw new Error('品質エラーがあるため保存を中止しました。品質チェックを確認してください。');
 const now=new Date().toISOString(),eventId=`event_${safeId(now)}_${Math.random().toString(36).slice(2,8)}`,p=pathSet(base.raceId,null,eventId),batch=mods.writeBatch(db);
 const summary=clean({...base,ownerUid:user.uid,entityType:'Race',dataModelVersion:CLOUD_DATA_MODEL_VERSION,storage:'cloud',savedAt:now});
 delete summary.horses;delete summary.researchPackage;
 summary.horseCount=research?.horses?.length||base.horses?.length||0;summary.quality=research?.quality||base.quality||null;summary.ocr=research?.ocr||null;summary.featureSchemaVersion=research?.race?.featureSchemaVersion||base.featureSchemaVersion||null;summary.featureEngineVersion=research?.race?.featureEngineVersion||base.featureEngineVersion||null;summary.serverUpdatedAt=mods.serverTimestamp();
 batch.set(p.race,summary,{merge:true});
 const packs=research?.horses||(base.horses||[]).map(h=>({horseKey:String(h.number).padStart(2,'0'),raw:h.raw||{merged:h,targetText:h.ability||null,trainingPdf:h.training||null,entryCsv:null,resultCsv:h.result||null},features:h.features||{},quality:h.quality||{},ocr:h.ocr||{},logs:h.logs||{},versions:h.versions||{},featureMeta:h.featureMeta||{}}));
 for(const hp of packs){
  const pp=pathSet(base.raceId,hp.horseKey,eventId),merged=hp.raw?.merged||{};
  const normalizedLogs=clean({
   createdAt:hp.logs?.createdAt||now,
   updatedAt:now,
   featureVersion:hp.logs?.featureVersion||summary.featureSchemaVersion||'3.3.4',
   engineVersion:hp.logs?.engineVersion||summary.featureEngineVersion||'3.3.4',
   calculationTime:hp.logs?.calculationTime??hp.logs?.calculationTimeMs??null,
   calculationTimeMs:hp.logs?.calculationTimeMs??hp.logs?.calculationTime??null,
   recalculateHistory:hp.logs?.recalculateHistory||[],
   steps:hp.logs?.steps||[],
   latestEventId:eventId
  });
  // SaveEngine v3.3.4: the Horse root document contains exactly six canonical blocks.
  const versions=clean({
   ...(hp.versions||{}),
   horse:'3.3.4',
   raw:hp.versions?.raw||'1.2.0',
   features:hp.versions?.features||summary.featureSchemaVersion||'3.3.4',
   quality:hp.versions?.quality||'3.3.4',
   ocr:hp.versions?.ocr||'3.3.4',
   logs:'3.3.4'
  });
  const horseDocument=canonicalHorseDocument(
   hp.raw,
   hp.features,
   hp.quality,
   hp.ocr,
   normalizedLogs,
   versions
  );
  batch.set(pp.horse,horseDocument);
  // Compatibility mirrors. The Horse document is the canonical formal structure in v3.3.2.
  batch.set(pp.raw,clean({entityType:'Raw',raceId:base.raceId,horseKey:hp.horseKey,immutableParsedSources:hp.raw,capturedAt:hp.raw?.capturedAt||now,rawHash:hp.featureMeta?.rawHash||normalizedLogs.recalculateHistory?.at(-1)?.rawHash||null}),{merge:true});
  batch.set(pp.feature,clean({entityType:'Feature',raceId:base.raceId,horseKey:hp.horseKey,schemaVersion:summary.featureSchemaVersion||'3.3.4',engineVersion:summary.featureEngineVersion||'3.3.4',values:hp.features,meta:hp.featureMeta||{},updatedAt:now}),{merge:true});
  batch.set(pp.quality,clean({entityType:'Quality',raceId:base.raceId,horseKey:hp.horseKey,...hp.quality,updatedAt:now}),{merge:true});
  batch.set(pp.ocr,clean({entityType:'OCR',raceId:base.raceId,horseKey:hp.horseKey,...hp.ocr,updatedAt:now}),{merge:true});
  batch.set(pp.logCurrent,clean({entityType:'Log',raceId:base.raceId,horseKey:hp.horseKey,...normalizedLogs,updatedAt:now}),{merge:true});
  batch.set(pp.logEvent,clean({entityType:'LogEvent',raceId:base.raceId,horseKey:hp.horseKey,eventId,at:now,featureVersion:normalizedLogs.featureVersion,engineVersion:normalizedLogs.engineVersion,calculationTime:normalizedLogs.calculationTime,calculationTimeMs:normalizedLogs.calculationTimeMs,status:hp.quality?.validationStatus||'UNKNOWN',featureCount:Object.keys(hp.features||{}).length}),{merge:false});
 }
 if(research){
  batch.set(p.analysisQuality,clean({entityType:'Analysis',analysisType:'quality',...research.quality,updatedAt:now}),{merge:true});
  batch.set(p.analysisOcr,clean({entityType:'Analysis',analysisType:'ocr-statistics',...research.ocr,updatedAt:now}),{merge:true});
  batch.set(p.analysisLog,clean({entityType:'Analysis',analysisType:'calculation-log',items:research.logs||[],updatedAt:now}),{merge:true});
  batch.set(p.dictionary,clean({version:summary.featureSchemaVersion,items:research.featureDictionary,updatedAt:now}),{merge:true});
  batch.set(p.schema,clean({dataModelVersion:CLOUD_DATA_MODEL_VERSION,featureSchemaVersion:summary.featureSchemaVersion,featureEngineVersion:summary.featureEngineVersion,horseStructure:['raw','features','quality','ocr','logs','versions'],compatibilityMirrors:['raw/current','features/current','quality/current','ocr/current','logs/current','logs/event_*'],updatedAt:now}),{merge:true});
 }
 if(analysis){
  if(analysis.training)batch.set(p.analysisTraining,clean({entityType:'Analysis',analysisType:'training-statistics',...analysis.training,updatedAt:now}),{merge:true});
  if(analysis.features)batch.set(p.analysisFeatures,clean({entityType:'Analysis',analysisType:'feature-statistics',...analysis.features,updatedAt:now}),{merge:true});
 }
 await batch.commit();return summary;
}

export async function saveGlobalResearchAnalysis(analysis,dictionary){
 ensure();const p=globalPaths(),now=new Date().toISOString(),batch=mods.writeBatch(db);
 batch.set(p.training,clean({...analysis.training,entityType:'Analysis',analysisType:'training-statistics',updatedAt:now}),{merge:true});
 batch.set(p.features,clean({...analysis.features,entityType:'Analysis',analysisType:'feature-statistics',updatedAt:now}),{merge:true});
 batch.set(p.ocr,clean({...analysis.ocr,entityType:'Analysis',analysisType:'ocr-statistics',updatedAt:now}),{merge:true});
 batch.set(p.quality,clean({...analysis.quality,entityType:'Analysis',analysisType:'quality-statistics',updatedAt:now}),{merge:true});
 batch.set(p.status,clean({version:analysis.version,raceCount:analysis.raceCount,horseCount:analysis.horseCount,machineLearning:analysis.machineLearning,updatedAt:now}),{merge:true});
 batch.set(p.dictionary,clean({version:dictionary?.[0]?.schemaVersion||'3.3.4',items:dictionary||[],updatedAt:now}),{merge:true});
 batch.set(p.schema,clean({dataModelVersion:CLOUD_DATA_MODEL_VERSION,updatedAt:now}),{merge:true});
 await batch.commit();
}

export async function listCloudRaces(){ensure();const snap=await mods.getDocs(mods.collection(db,'users',user.uid,'races'));return snap.docs.map(d=>{const x=d.data();delete x.serverUpdatedAt;return x;}).sort((a,b)=>(b.meta?.date||'').localeCompare(a.meta?.date||''));}
async function readHorses(id){
 const hs=await mods.getDocs(mods.collection(db,'users',user.uid,'races',id,'horses')),out=[];
 for(const d of hs.docs){
  const root=d.data();
  const raw=root.raw||{};
  out.push({...raw.merged,features:root.features||{},quality:root.quality||{},ocr:root.ocr||{},logs:root.logs||{},versions:root.versions||{},raw});
 }
 return out.sort((a,b)=>Number(a.number)-Number(b.number));
}
export async function getCloudRace(id){ensure();const snap=await mods.getDoc(pathSet(id).race);if(!snap.exists())return null;const x=snap.data();delete x.serverUpdatedAt;x.horses=await readHorses(id);x.counts=x.counts||{};x.counts.merged=x.horses.length;x.counts.preRaceComplete=x.horses.filter(h=>h.sourceStatus?.targetText&&h.sourceStatus?.training).length;x.counts.resultMatched=x.horses.filter(h=>h.result?.finish!=null).length;return x;}
export async function loadResearchDataset(){ensure();const summaries=await listCloudRaces(),races=[];for(const s of summaries){const full=await getCloudRace(s.raceId);if(full)races.push(full);}return races;}

async function deleteCollection(pathSegments){const snap=await mods.getDocs(mods.collection(db,...pathSegments));for(const d of snap.docs)await mods.deleteDoc(d.ref);}
export async function saveResearchAnalysis(analysis){
 ensure();const base=["users",user.uid,"research"],common={analysisVersion:analysis.analysisVersion,featureVersion:analysis.featureVersion,dataModelVersion:analysis.dataModelVersion,filters:analysis.filters||{},raceCount:analysis.raceCount,horseCount:analysis.horseCount,generatedAt:analysis.generatedAt,calculationTime:analysis.calculationTime,warnings:analysis.warnings||[]},batch=mods.writeBatch(db);
 batch.set(mods.doc(db,...base,"statistics","current"),clean({...common,items:analysis.basicStatistics}),{merge:true});
 batch.set(mods.doc(db,...base,"correlations","current"),clean({...common,items:analysis.correlations}),{merge:true});
 batch.set(mods.doc(db,...base,"quantiles","current"),clean({...common,items:analysis.quantiles,training:analysis.training}),{merge:true});
 batch.set(mods.doc(db,...base,"quality","current"),clean({...common,...analysis.quality}),{merge:true});
 const analysisId=String(analysis.generatedAt||new Date().toISOString()).replace(/[:.]/g,"-");batch.set(mods.doc(db,...base,"logs",analysisId),clean({...common,status:"success"}),{merge:true});await batch.commit();return analysisId;
}
export async function deleteCloudRace(id){
 ensure();const hs=await mods.getDocs(mods.collection(db,'users',user.uid,'races',id,'horses'));
 for(const h of hs.docs){for(const c of ['raw','features','quality','ocr','logs'])await deleteCollection(['users',user.uid,'races',id,'horses',h.id,c]);await mods.deleteDoc(h.ref);}
 for(const c of ['analyses','metadata'])await deleteCollection(['users',user.uid,'races',id,c]);await mods.deleteDoc(pathSet(id).race);
}
