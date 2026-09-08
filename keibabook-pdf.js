import {textRows,pageText} from './pdf-layout.js';

const VENUES='札幌|函館|福島|新潟|東京|中山|中京|京都|阪神|小倉|門別|盛岡|水沢|浦和|船橋|大井|川崎|金沢|笠松|名古屋|園田|姫路|高知|佐賀|帯広';
const SEX=/(牡|牝|せん|セン|セ)\s*(\d{1,2})/;
const compact=s=>String(s||'').normalize('NFKC').replace(/\s/g,'');
const horseName=s=>compact(s).replace(/^\((?:外|地|父|市)\)/g,'');
const join=items=>pageText(items).replace(/\n/g,' ').trim();
const inside=(items,left,right,top,bottom)=>items.filter(i=>i.x>=left&&i.x<right&&i.y>=top&&i.y<bottom);
const sexValue=s=>/せん|セン|セ/.test(s)?'セ':s;

export function parsePdfRaceMeta(text,filename='') {
  const n=String(text).normalize('NFKC'),fn=filename.normalize('NFKC');
  // Prefer the race date in the heading over the browser's print timestamp.
  const date=n.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/)||fn.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const venue=n.match(new RegExp(`\\d+回\\s*(${VENUES})\\s*\\d+日目`))||fn.match(new RegExp(`日\\s*(${VENUES})`));
  const race=[...n.matchAll(/^\s*(\d{1,2})R[^\S\n]+([^\n]+)$/gm)].find(m=>!/(?:^|\s)\d{1,2}R\b/.test(m[2])),fileRace=fn.match(/(\d{1,2})R(.*?)(?:競馬ブック|\.pdf|$)/i);
  const condition=n.match(/(\d{3,4})\s*m\s*\(?\s*(芝|ダート|ダ|障害|障)/)||n.match(/(芝|ダート|ダ|障害|障)\s*(\d{3,4})\s*m/);
  const firstIsDistance=condition&&/^\d/.test(condition[1]);
  const surface=condition?(firstIsDistance?condition[2]:condition[1]):'';
  return {date:date?`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`:'',venue:venue?.[1]||'',
    raceNo:race?Number(race[1]):fileRace?Number(fileRace[1]):null,
    raceName:(race?.[2]||fileRace?.[2]||'').replace(/[▲△◎○]+$/g,'').trim(),
    distance:condition?Number(firstIsDistance?condition[1]:condition[2]):null,
    surface:surface==='ダ'?'ダート':surface==='障'?'障害':surface};
}

function sourceResult(horses,document,filename,kind) {
  if(!horses.length)throw new Error(`${kind}の馬情報を読み取れませんでした。競馬ブックの該当ページをPDFで保存して添付してください。`);
  const numbers=new Set();
  for(const h of horses){
    if(!Number.isInteger(h.number)||h.number<1||h.number>30||!h.name)throw new Error(`${kind}の馬番・馬名が不完全です。全体を含むPDFを添付してください。`);
    if(numbers.has(h.number))throw new Error(`${kind}に馬番${h.number}が重複しています。1レース分のPDFを添付してください。`);
    numbers.add(h.number);
  }
  const meta=parsePdfRaceMeta(document.text,filename);
  if(!meta.date||!meta.venue||!meta.raceNo)throw new Error('レースの日付・競馬場・レース番号を確認できません。ページ上部のレース名を含めてPDF保存してください。');
  return {filename,meta,horses,count:horses.length,pdf:true,format:'keibabook-pdf',pdfMeta:document.meta};
}

export function parseKeibabookEntry(document,filename='') {
  const horses=[];
  let columns=null;
  for(const items of document.pages){
    const label=items.find(i=>i.text==='父名'),trainerLabel=items.find(i=>i.text.includes('厩舎名'));
    if(label&&trainerLabel)columns={left:label.x-2,right:trainerLabel.x-1};
    if(!columns)continue;
    const {left,right}=columns;
    const rows=textRows(inside(items,left,right,-Infinity,Infinity));
    const heads=rows.filter(row=>SEX.test(row.text)&&row.items.some(i=>SEX.test(i.text)||/^(牡|牝|せん|セン|セ)$/.test(i.text)));
    for(let index=0;index<heads.length;index++){
      const head=heads[index],sex=SEX.exec(head.text);
      const sexItem=head.items.find(i=>SEX.test(i.text)||/^(牡|牝|せん|セン|セ)$/.test(i.text));
      if(!sexItem)continue;
      const next=heads[index+1];
      const typical=index?head.y-heads[index-1].y:next?next.y-head.y:head.height*6.2;
      const bottom=next?Math.min(next.y-head.height*.35,head.y+typical*1.15):head.y+typical-head.height*.35;
      const top=head.y-head.height*.35;
      const cell=textRows(inside(items,left,right,head.y+head.height*.4,bottom));
      if(!cell.length)continue;
      const name=horseName(cell[0].text);
      if(!/^[ァ-ヶーA-Za-z・]{2,35}$/.test(name))throw new Error('出走表の馬名が途中で切れています。能力表HTML全体をPDF保存してください。');
      const leftItems=inside(items,-Infinity,left,top,bottom);
      const pairs=textRows(leftItems).map(r=>r.items.filter(i=>/^\d{1,2}$/.test(i.text))).filter(is=>is.length>=2&&Number(is[0].text)<=8&&Number(is[1].text)<=30);
      const pair=pairs[0];
      if(!pair)throw new Error(`${name}の馬番を確認できません。枠番・馬番を含めてPDF保存してください。`);
      const weightItem=leftItems.filter(i=>i.x>pair[1].x&&/^\d{2}(?:\.\d)?$/.test(i.text)&&Number(i.text)>=45&&Number(i.text)<=70).sort((a,b)=>b.x-a.x)[0];
      const jockey=weightItem?inside(leftItems,weightItem.x+weightItem.width-.5,left,top,bottom).sort((a,b)=>a.y-b.y||a.x-b.x).map(i=>i.text).join('').replace(/[|｜]/g,'ー'):'';
      const trainer=items.find(i=>i.x>=right&&Math.abs(i.y-head.y)<head.height*.4&&/\((美|栗|地|外)\)/.test(i.text));
      const trainerMatch=trainer?.text.match(/^(.*?)\((美|栗|地|外)\)/);
      const pedigree=cell.slice(1).map(r=>r.items);
      // A large gap separates the dam/broodmare-sire from owner/breeder.
      const firstCell=row=>{
        if(!row?.length)return '';
        const out=[row[0]];
        for(let j=1;j<row.length;j++){
          if(row[j].x-row[j-1].x-row[j-1].width>row[j].height*.4)break;
          out.push(row[j]);
        }
        return join(out);
      };
      const rt=leftItems.find(i=>/^\d{2}\.\d$/.test(i.text)&&(!weightItem||i.x<weightItem.x));
      horses.push({waku:Number(pair[0].text),number:Number(pair[1].text),name,sex:sexValue(sex[1]),age:Number(sex[2]),
        weight:weightItem?Number(weightItem.text):null,jockey,trainer:trainerMatch?.[1]||'',affiliation:trainerMatch?.[2]||'',
        sire:join(head.items.filter(i=>i.x<sexItem.x)),dam:firstCell(pedigree[0]),broodmareSire:firstCell(pedigree[1]),
        color:head.text.slice(sex.index+sex[0].length).trim(),rt:rt?Number(rt.text):null,
        foreignFlag:/\(外\)/.test(cell[0].text),blinker:leftItems.some(i=>i.text==='B')?'B':'',source:'entry-pdf'});
    }
  }
  return sourceResult(horses,document,filename,'出走表PDF');
}

export function parseKeibabookResult(document,filename='') {
  const horses=[];
  for(const items of document.pages){
    const anchors=items.filter(i=>/^(牡|牝|せん|セン|セ)\s*\d{1,2}$/.test(i.text)).sort((a,b)=>a.y-b.y);
    for(const anchor of anchors){
      const size=anchor.height,sex=SEX.exec(anchor.text);
      const top=anchor.y-size*2,bottom=anchor.y+size*2.8;
      const row=inside(items,-Infinity,Infinity,top,bottom);
      const numbers=row.filter(i=>i.x<anchor.x&&/^(\d{1,2}|中止|取消|除外|失格)$/.test(i.text)).sort((a,b)=>a.x-b.x);
      if(numbers.length!==2)continue;
      const nameItems=inside(row,anchor.x-1,Infinity,top,anchor.y-size*.5);
      const nameRow=textRows(nameItems).find(r=>r.items.some(i=>Math.abs(i.x-anchor.x)<size*.5));
      const name=horseName(nameRow?.items.filter(i=>/^[ァ-ヶーA-Za-z・()外地]+$/.test(i.text)).map(i=>i.text).join(''));
      if(!name)continue;
      const detail=inside(row,anchor.x,Infinity,anchor.y-size*.2,anchor.y+size*.2).sort((a,b)=>a.x-b.x);
      const weightIndex=detail.findIndex((i,j)=>j>0&&/^\d{2}(?:\.\d)?$/.test(i.text)&&Number(i.text)>=45&&Number(i.text)<=70);
      if(weightIndex<0)continue;
      const timeItem=row.find(i=>/^\d{1,2}[.:]\d{2}\.\d$/.test(i.text));
      const last=row.find(i=>/^\(\d{2}\.\d\)$/.test(i.text));
      const body=row.find(i=>/^\d{3}(?:\([+-]?\d+\))?$/.test(i.text));
      const bodyMatch=body?.text.match(/^(\d{3})(?:\(([+-]?\d+)\))?$/);
      const pop=row.find(i=>/^\d{1,2}人気$/.test(i.text));
      const odds=row.find(i=>/^\d+\.\d$/.test(i.text)&&body&&Math.abs((i.x+i.width/2)-(body.x+body.width/2))<size*2);
      const stableRow=textRows(inside(row,anchor.x-1,timeItem?.x||Infinity,anchor.y+size*.6,bottom))[0];
      const stable=stableRow?.text.match(/^(美|栗|地|外)\s*(\S+?)\s+(.*)$/);
      const corners=stableRow?.items.filter(i=>/^\d{1,2}$/.test(i.text)).map(i=>Number(i.text))||[];
      const margin=last?row.find(i=>i.y>last.y+size*.5&&Math.abs(i.x-last.x)<size*2&&/^(?:[\d /]+|クビ|ハナ|アタマ|大差|同着)$/.test(i.text)):null;
      const finish=/^\d+$/.test(numbers[0].text)?Number(numbers[0].text):null;
      horses.push({number:Number(numbers[1].text),name,finish,abnormalCode:finish===null?numbers[0].text:'',
        sex:sexValue(sex[1]),age:Number(sex[2]),weight:Number(detail[weightIndex].text),jockey:detail.slice(1,weightIndex).map(i=>i.text).join(''),
        time:timeItem?.text||'',last3f:last?Number(last.text.slice(1,-1)):null,margin:margin?.text||'',
        bodyWeight:bodyMatch?Number(bodyMatch[1]):null,bodyWeightDelta:bodyMatch?.[2]!==undefined?Number(bodyMatch[2]):null,
        popularity:pop?parseInt(pop.text,10):null,odds:odds?Number(odds.text):null,corners,
        affiliation:stable?.[1]||'',trainer:stable?.[2]||'',source:'result-pdf'});
    }
  }
  return sourceResult(horses,document,filename,'レース結果PDF');
}
