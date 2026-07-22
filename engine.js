import {COURSE_TABLE,normalizeName} from "./parsers.js";
const ALIAS={"美W":"美浦W","美浦W":"美浦W","美坂":"新美坂","栗CW":"栗CW","函館W":"函館W","美南P":"美南P","栗P":"栗P","美南B":"美南B","栗B":"栗B","美南D":"美南D","美北B":"美北B","美北C":"美北C"};
const canon=c=>ALIAS[c]||c,isSlope=c=>!!c&&c.includes("坂");
function fidx(n,target,skip){let p;if(!skip)p=target;else if(target===1)p=1;else if(target===2)return null;else p=target-1;const i=n-p;return i>=0&&i<n?i:null;}
export function furlongTime(s,target){if(!s?.times?.length)return null;const i=fidx(s.times.length,target,!isSlope(s.course));return i==null?null:s.times[i];}
export function acceleration(s,settings=COURSE_TABLE){const t1=furlongTime(s,1),cfg=settings[canon(s?.course)];if(t1==null||!cfg)return null;let v;if(isSlope(s.course)){const t2=furlongTime(s,2);if(t2==null)return null;v=(t2-t1)-t1+cfg.correction;}else{const t3=furlongTime(s,3);if(t3==null)return null;v=(t3-t1)/2-t1+cfg.correction;}return Math.round(v*10)/10;}
export function trainingSummary(training,settings=COURSE_TABLE){
  if(!training)return{count:0,currentCount:0,maxCurrent:null,maxAll:null,latest1F:null,latest3F:null,final:null};
  const timed=(training.sessions||[]).filter(s=>s.times?.length),current=timed.filter(s=>!s.prev);
  const vals=timed.map(s=>acceleration(s,settings)).filter(v=>v!=null),cur=current.map(s=>acceleration(s,settings)).filter(v=>v!=null);
  const latest=[...current].reverse().find(s=>s.times?.length)||[...timed].reverse().find(s=>s.times?.length)||null;
  return{count:timed.length,currentCount:current.length,maxCurrent:cur.length?Math.max(...cur):null,maxAll:vals.length?Math.max(...vals):null,latest1F:latest?furlongTime(latest,1):null,latest3F:latest?furlongTime(latest,3):null,final:[...current].reverse().find(s=>s.final)||null};
}
function pickMeta(s){const metas=[s.targetText?.meta,s.training?.meta].filter(Boolean),out={date:"",venue:"",raceNo:null,raceName:"",surface:"",distance:null};for(const m of metas)for(const k of Object.keys(out))if(!out[k]&&m[k])out[k]=m[k];return out;}
export function makeRaceId(m){return`${m.date||"unknown-date"}_${m.venue||"unknown-venue"}_${m.raceNo?String(m.raceNo).padStart(2,"0")+"R":"unknown-race"}`;}
export function mergeSources(sources,settings=COURSE_TABLE){
  const meta=pickMeta(sources),maps={};
  for(const key of ["targetText","training","entryCsv","resultCsv"])maps[key]=new Map((sources[key]?.horses||[]).map(h=>[Number(h.number),h]));
  const numbers=new Set();Object.values(maps).forEach(mp=>mp.forEach((_,n)=>numbers.add(n)));
  const diagnostics=[];
  const horses=[...numbers].sort((a,b)=>a-b).map(number=>{
    const ability=maps.targetText.get(number)||null,training=maps.training.get(number)||null,entry=maps.entryCsv.get(number)||null,result=maps.resultCsv.get(number)||null;
    const candidates=[ability?.name,training?.name,entry?.name,result?.name].filter(Boolean),names=[...new Set(candidates.map(normalizeName))];
    if(names.length>1)diagnostics.push({level:"error",number,message:`馬名不一致: ${candidates.join(" / ")}`});
    if(!ability)diagnostics.push({level:"warning",number,message:"TARGET出馬表TXTが未結合"});
    if(!training)diagnostics.push({level:"warning",number,message:"調教PDFが未結合"});
    if(sources.entryCsv&&!entry)diagnostics.push({level:"warning",number,message:"任意の出馬表CSVが未結合"});
    if(sources.resultCsv&&!result)diagnostics.push({level:"warning",number,message:"結果CSVが未結合"});
    const basic={...(ability||{}),...(entry||{})};
    return{number,waku:basic.waku??result?.waku??training?.waku??null,name:basic.name||training?.name||result?.name||`馬番${number}`,basic,ability,training,trainingSummary:trainingSummary(training,settings),result,rawSources:{targetText:ability?structuredClone(ability):null,trainingPdf:training?structuredClone(training):null,entryCsv:entry?structuredClone(entry):null,resultCsv:result?structuredClone(result):null},sourceStatus:{targetText:!!ability,training:!!training,entryCsv:!!entry,resultCsv:!!result}};
  });
  const counts={targetText:sources.targetText?.count||0,training:sources.training?.count||0,entryCsv:sources.entryCsv?.count||0,resultCsv:sources.resultCsv?.count||0,merged:horses.length,preRaceComplete:horses.filter(h=>h.sourceStatus.targetText&&h.sourceStatus.training).length,entryMatched:horses.filter(h=>h.sourceStatus.entryCsv).length,resultMatched:horses.filter(h=>h.sourceStatus.resultCsv).length};
  if(!meta.date||!meta.venue||!meta.raceNo)diagnostics.push({level:"warning",number:null,message:"日付・競馬場・レース番号の一部を取得できませんでした。"});
  return{version:"3.3",raceId:makeRaceId(meta),meta,horses,counts,diagnostics,sourceFiles:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,v?.filename||""])),sourceMeta:{training:sources.training?.pdfMeta||null},createdAt:new Date().toISOString()};
}
