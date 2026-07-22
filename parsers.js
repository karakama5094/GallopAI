const DATE_JP_RE = /(20\d{2})年(\d{1,2})月(\d{1,2})日/;

export function normalizeName(value = "") {
  return String(value).normalize("NFKC")
    .replace(/^[\s$＊*B]+/, "").replace(/[\s　]/g, "").trim();
}

export async function decodeJapaneseFile(file) {
  const buffer = await file.arrayBuffer();
  return decodeJapaneseBytes(new Uint8Array(buffer));
}
export function decodeJapaneseBytes(bytes) {
  for (const encoding of ["utf-8", "shift_jis"]) {
    try { return new TextDecoder(encoding,{fatal:true}).decode(bytes).replace(/^\uFEFF/,""); }
    catch (_) {}
  }
  return new TextDecoder("shift_jis").decode(bytes).replace(/^\uFEFF/,"");
}
export function parseCsv(text) {
  const rows=[]; let row=[],field="",quoted=false;
  const src=String(text).replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  for(let i=0;i<src.length;i++){
    const ch=src[i];
    if(quoted){
      if(ch==='"'&&src[i+1]==='"'){field+='"';i++;}
      else if(ch==='"') quoted=false; else field+=ch;
    }else if(ch==='"') quoted=true;
    else if(ch===','){row.push(field);field="";}
    else if(ch==='\n'){row.push(field);if(row.some(v=>v!==""))rows.push(row);row=[];field="";}
    else field+=ch;
  }
  row.push(field); if(row.some(v=>v!==""))rows.push(row); return rows;
}
function cleanNum(v){
  const s=String(v??"").replace(/[\s　,]/g,"");
  if(!s||s==="-")return null; const n=Number(s); return Number.isFinite(n)?n:null;
}

export function parseTargetEntryCsv(text, filename="") {
  const rows=parseCsv(text);
  if(!rows.length)throw new Error("出馬表CSVが空です。");
  if(rows[0].some(v=>v.includes("確定着順")))throw new Error("これは結果CSVです。結果CSV欄へ指定してください。");
  const data=rows.filter(r=>r.length>=25&&/^\d+$/.test((r[0]||"").trim())&&/^\d+$/.test((r[2]||"").trim()));
  if(!data.length)throw new Error("TARGET出馬表CSVの25列形式を認識できませんでした。");
  const horses=data.map(r=>({
    waku:cleanNum(r[0]),blinker:(r[1]||"").trim(),number:cleanNum(r[2]),name:(r[6]||"").trim(),
    sex:(r[8]||"").trim(),age:cleanNum(r[9]),jockeyChanged:(r[10]||"").trim()==="*",
    jockey:(r[11]||"").trim(),weight:cleanNum(r[12]),odds:cleanNum(r[14]),popularity:cleanNum(r[15]),
    bodyWeight:cleanNum(r[16]),bodyWeightDelta:cleanNum(r[17]),affiliation:(r[18]||"").trim(),
    trainer:(r[19]||"").trim(),foreignFlag:(r[20]||"").trim(),owner:(r[21]||"").trim(),
    breeder:(r[22]||"").trim(),color:(r[23]||"").trim(),birthday:(r[24]||"").trim()
  }));
  return {filename,horses,count:horses.length};
}

export function parseTargetResultCsv(text,filename=""){
  const rows=parseCsv(text); if(rows.length<2)throw new Error("結果CSVのデータ行がありません。");
  const header=rows[0].map(v=>v.trim()),idx=Object.fromEntries(header.map((h,i)=>[h,i]));
  if(!["確定着順","枠番","馬番","馬名"].every(k=>k in idx))throw new Error("TARGET結果CSVのヘッダーを認識できませんでした。");
  const get=(r,k)=>r[idx[k]]??"";
  const horses=rows.slice(1).filter(r=>get(r,"馬番")).map(r=>({
    finish:cleanNum(get(r,"確定着順")),abnormalCode:get(r,"異常コード").trim(),blinker:get(r,"ブリンカー").trim(),
    waku:cleanNum(get(r,"枠番")),number:cleanNum(get(r,"馬番")),name:get(r,"馬名").trim(),
    sex:get(r,"性別").trim(),age:cleanNum(get(r,"年齢")),weight:cleanNum(get(r,"斤量")),
    jockey:get(r,"騎手").trim(),time:get(r,"タイム").trim(),adjustedTime:cleanNum(get(r,"補正タイム")),
    margin:get(r,"着差").trim(),pci:cleanNum(get(r,"PCI")),
    corners:["通過1","通過2","通過3","通過4"].map(k=>cleanNum(get(r,k))).filter(v=>v!=null),
    ave3f:cleanNum(get(r,"Ave-3F")),last3f:cleanNum(get(r,"上り3F")),
    popularity:cleanNum(get(r,"人気")),odds:cleanNum(get(r,"単勝オッズ")),
    bodyWeight:cleanNum(get(r,"体重")),bodyWeightDelta:cleanNum(get(r,"増減")),
    affiliation:get(r,"所属").trim(),trainer:get(r,"調教師").trim(),prize:cleanNum(get(r,"賞金"))
  }));
  return {filename,horses,count:horses.length,columns:header};
}

function parseRaceMeta(text){
  const n=text.normalize("NFKC"),date=n.match(DATE_JP_RE);
  const first=n.split(/\r?\n/)[0]||"",venue=first.match(/\d+回([^\d\s]+)\d+日目/);
  const race=n.match(/^\s*(\d{1,2})R\s+(第[^\n]+)$/mi);
  const cond=n.match(/(芝|ダート|ダ)\s*(\d{3,4})m/);
  return {
    date:date?`${date[1]}-${String(date[2]).padStart(2,"0")}-${String(date[3]).padStart(2,"0")}`:"",
    venue:venue?venue[1]:"",raceNo:race?Number(race[1]):null,raceName:race?race[2].trim():"",
    surface:cond?(cond[1]==="芝"?"芝":"ダート"):"",distance:cond?Number(cond[2]):null
  };
}
export function parseTargetEntryText(text,filename=""){
  const n=text.normalize("NFKC"),lines=n.split(/\r?\n/),meta=parseRaceMeta(n);
  const basics={},pedigrees={},zis={}; let inPedigree=false;
  const basic=/^\s*(B?)(\d)\s+(\d{1,2})\$?\s*([ァ-ヶー・]{2,20})\s+(牡|牝|セ)(\d+)\s+\*?([^\s]+)\s+(\d+(?:\.\d+)?)\s+\((美|栗|地)\)([^\s<]+)/;
  const width=ch=>/[\u0000-\u00ff\uff61-\uff9f]/.test(ch)?1:2;
  const slice=(line,from,to=Infinity)=>{let pos=0,out="";for(const ch of line){const w=width(ch),next=pos+w;if(next>from&&pos<to)out+=ch;pos=next;if(pos>=to)break;}return out.trim();};
  for(const raw of lines){
    const line=raw.replace(/\s+$/,""); let m=basic.exec(line);
    if(m)basics[Number(m[3])]={waku:Number(m[2]),number:Number(m[3]),name:m[4],sex:m[5],age:Number(m[6]),jockey:m[7].replace(/^\*/,""),weight:Number(m[8]),affiliation:`(${m[9]})`,trainer:m[10],blinker:m[1]?"B":""};
    if(/^馬\s+父\s+母\s+母の父\s+母の母/.test(line)){inPedigree=true;continue;}
    if(/^\s*\d{1,2}\s+ZI\[/.test(line))inPedigree=false;
    m=line.match(/^\s*(\d{1,2})\s+ZI\[\s*(\d+)\]\s+(.+)$/);
    if(m){zis[Number(m[1])]={zi:Number(m[2]),pastIndexes:[...m[3].matchAll(/(---|\d+)([TD])/g)].map(x=>({value:x[1]==="---"?null:Number(x[1]),surface:x[2]}))};continue;}
    if(inPedigree&&(m=line.match(/^\s*(\d{1,2})\s+/)))pedigrees[Number(m[1])]={sire:slice(line,3,22),dam:slice(line,22,41),broodmareSire:slice(line,41,60),secondDam:slice(line,60)};
  }
  const nums=new Set([...Object.keys(basics),...Object.keys(pedigrees),...Object.keys(zis)].map(Number));
  const horses=[...nums].sort((a,b)=>a-b).map(number=>({number,...(basics[number]||{}),...(pedigrees[number]||{}),...(zis[number]||{zi:null,pastIndexes:[]})}));
  if(!horses.length)throw new Error("TARGET出馬表TXTを認識できませんでした。");
  return {filename,meta,horses,count:horses.length};
}

export const COURSE_TABLE={
 "旧美坂":{correction:.5,axisFurlong:4,axisBorder:54.7,keshiBorder:13.0},"新美坂":{correction:.6,axisFurlong:4,axisBorder:55.0,keshiBorder:13.1},
 "栗坂":{correction:.5,axisFurlong:4,axisBorder:54.3,keshiBorder:12.7},"美浦W":{correction:-.6,axisFurlong:5,axisBorder:68.5,keshiBorder:12.1},
 "栗CW":{correction:-.6,axisFurlong:5,axisBorder:68.2,keshiBorder:11.9},"函館W":{correction:.3,axisFurlong:5,axisBorder:69.7,keshiBorder:13.1},
 "美浦芝":{correction:0,axisFurlong:5,axisBorder:67.1,keshiBorder:12.1},"栗芝":{correction:.3,axisFurlong:5,axisBorder:66.1,keshiBorder:12.1},
 "函館芝":{correction:0,axisFurlong:5,axisBorder:66.9,keshiBorder:12.1},"札幌芝":{correction:.5,axisFurlong:5,axisBorder:66.8,keshiBorder:12.3},
 "小倉芝":{correction:-1,axisFurlong:5,axisBorder:70.3,keshiBorder:12.2},"美南P":{correction:-.2,axisFurlong:5,axisBorder:68.1,keshiBorder:12.4},
 "栗P":{correction:-.2,axisFurlong:5,axisBorder:66.5,keshiBorder:12.0},"美南B":{correction:-.7,axisFurlong:5,axisBorder:69.2,keshiBorder:12.5},
 "栗B":{correction:-.7,axisFurlong:5,axisBorder:68.0,keshiBorder:12.0},"美南D":{correction:.6,axisFurlong:5,axisBorder:68.3,keshiBorder:13.0},
 "美北B":{correction:1.1,axisFurlong:5,axisBorder:69.8,keshiBorder:13.8},"美北C":{correction:.5,axisFurlong:5,axisBorder:68.9,keshiBorder:13.1},
 "函館ダ":{correction:-.2,axisFurlong:5,axisBorder:69.7,keshiBorder:12.7},"札幌ダ":{correction:-.2,axisFurlong:5,axisBorder:69.5,keshiBorder:12.7},
 "小倉ダ":{correction:-.5,axisFurlong:5,axisBorder:70.4,keshiBorder:12.7},"新潟ダ":{correction:-.4,axisFurlong:5,axisBorder:70.2,keshiBorder:12.6}
};
const ALIAS={"美W":"美浦W","美浦W":"美浦W","美坂":"新美坂","栗CW":"栗CW","函館W":"函館W","美南P":"美南P","栗P":"栗P","美南B":"美南B","栗B":"栗B","美南D":"美南D","美北B":"美北B","美北C":"美北C"};
const COURSES=[...new Set([...Object.keys(COURSE_TABLE),...Object.keys(ALIAS)])].sort((a,b)=>b.length-a.length);
const STYLES=["馬なり余力","馬なり伸る","一杯に追う","強めに追う","強め余力","稍一杯追う","末一杯追う","末強めに追う","末強め追う","G前仕掛け","G前一杯追","直一杯追う","直強め余力","直強め追う","強め仕掛け"];
function trainingMeta(text){
  const n=text.normalize("NFKC"),date=n.match(DATE_JP_RE),venue=n.match(/\d+回(札幌|函館|福島|新潟|東京|中山|中京|京都|阪神|小倉)\d+日目/),race=n.match(/^\s*(\d{1,2})R\s+(第[^\n]+)$/mi);
  return {date:date?`${date[1]}-${String(date[2]).padStart(2,"0")}-${String(date[3]).padStart(2,"0")}`:"",venue:venue?venue[1]:"",raceNo:race?Number(race[1]):null,raceName:race?race[2].replace(/[▲△◎○]+$/g,"").trim():""};
}
function parseSessions(lines){
  const sessions=[];let current=null;
  for(const line of lines){
    if(line==="攻め解説"){current=null;continue;}
    if(line.includes("海外遠征")){sessions.push({overseas:true,times:[]});current=null;continue;}
    if(/\d{1,2}\/\d{1,2}/.test(line)||/^[()\s]*前回/.test(line)){
      const d=(line.match(/(\d{1,2}\/\d{1,2})/)||[])[1]||"";
      current={date:d,course:COURSES.find(c=>line.includes(c))||"",style:STYLES.find(s=>line.includes(s))||"",baba:["良","稍","重","不"].find(x=>line.includes(x))||"",prev:/^[()\s]*前回/.test(line),final:line.includes("▶"),times:[],lane:null,note:""};
      sessions.push(current);continue;
    }
    const timeLine=/^(?:(?:1回|7F|\d+F)\s+)?(?:\d+\.\d\s+){1,7}\d+\.\d(?:\s*\[\d+\])?$/.test(line);
    if(current&&timeLine){current.times=(line.match(/\d+\.\d/g)||[]).map(Number);const lm=line.match(/\[(\d+)\]/);current.lane=lm?Number(lm[1]):null;continue;}
    if(current)current.note+=(current.note?" ":"")+line;
  }
  return sessions.filter(s=>s.overseas||s.date||s.times.length);
}
export function parseTrainingText(text,filename=""){
  const n=text.normalize("NFKC"),cut=n.indexOf("中央競馬Topへ"),body=cut>=0?n.slice(0,cut):n;
  const lines=body.replace(/\t/g," ").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const header=/^(\d{1,2})\s+(\d{1,2})\s+([ァ-ヶー・]{2,18})(?:\s+(.+?))?\s*(→|↗|↘|↑|↓)?$/;
  const heads=[];lines.forEach((line,i)=>{const m=line.match(header);if(m&&Number(m[1])>=1&&Number(m[1])<=8&&Number(m[2])>=1&&Number(m[2])<=30)heads.push({i,m});});
  const horses=heads.map((h,idx)=>{const end=idx+1<heads.length?heads[idx+1].i:lines.length,m=h.m;return{waku:Number(m[1]),number:Number(m[2]),name:m[3],shortComment:(m[4]||"").trim(),trend:m[5]||"→",sessions:parseSessions(lines.slice(h.i+1,end))};});
  if(!horses.length)throw new Error("調教PDFから馬ヘッダーを検出できませんでした。");
  return {filename,meta:trainingMeta(n),horses,count:horses.length};
}
