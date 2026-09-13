const finite=v=>typeof v==='number'&&Number.isFinite(v);
export const raceKey=r=>`${r.meta?.date}|${r.meta?.venue}|${r.meta?.raceNo}`;
export const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export const entryOf=h=>h.ability||h.raw?.targetText||h.rawSources?.targetText;
export const resultOf=h=>h.result||h.raw?.resultCsv||h.rawSources?.resultCsv;
const norm=s=>String(s||'').normalize('NFKC').replace(/\s/g,'');
export function completeResult(r){
  const hs=r.horses||[];
  return validDate(r.meta?.date)&&!!r.meta.venue&&Number.isInteger(r.meta.raceNo)&&hs.length>=2
    &&new Set(hs.map(h=>h.number)).size===hs.length&&hs.every(h=>Number.isInteger(h.number)&&h.number>0&&entryOf(h))
    &&hs.every(h=>Number.isInteger(resultOf(h)?.finish)&&resultOf(h).finish>=1&&resultOf(h).finish<=hs.length)
    &&hs.every(h=>(resultOf(h).number==null||resultOf(h).number===h.number)&&(!resultOf(h).name||norm(resultOf(h).name)===norm(entryOf(h).name)))
    &&hs.some(h=>resultOf(h).finish===1);
}
export function uniqueResults(history){
  const seen=new Set();return history.filter(r=>{const k=raceKey(r);if(!completeResult(r)||seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.meta.date.localeCompare(b.meta.date)||raceKey(a).localeCompare(raceKey(b)));
}
// Point-in-time aggregates, rebuilt at each historical prediction date.
export function aptitudeFactors(target,history){
  const past=uniqueResults(history).filter(r=>r.meta.date<target.meta.date&&r.meta.surface&&r.meta.surface===target.meta.surface);
  const samples=past.flatMap(r=>r.horses.map(h=>({a:entryOf(h),distance:r.meta.distance,hit:resultOf(h).finish<=3?1:0,base:Math.min(3,r.horses.length)/r.horses.length})));
  const stat=(items,known)=>{
    const starts=items.length,top3=items.reduce((s,r)=>s+r.hit,0),base=starts?items.reduce((s,r)=>s+r.base,0)/starts:null;
    // Three starts minimum; five neutral pseudo-observations shrink small samples.
    return {starts,top3,rate:starts?top3/starts:null,value:known&&starts>=3?(top3+5*base)/(starts+5)-base:null,status:!known?'識別情報不足':starts<3?'過去実績3件未満':'評価対象'};
  };
  const validDistance=finite(target.meta.distance)&&target.meta.distance>0;
  const near=s=>validDistance&&finite(s.distance)&&Math.abs(s.distance-target.meta.distance)<=200;
  return new Map((target.horses||[]).map(h=>{
    const a=entryOf(h)||{},sire=norm(a.sire),jockey=norm(a.jockey),name=norm(a.name);
    return [h.number,{
      pedigree:stat(samples.filter(s=>sire&&norm(s.a.sire)===sire&&near(s)),!!sire&&validDistance),
      jockey:stat(samples.filter(s=>jockey&&norm(s.a.jockey)===jockey),!!jockey),
      distance:stat(samples.filter(s=>name&&sire&&norm(s.a.name)===name&&norm(s.a.sire)===sire&&near(s)),!!name&&!!sire&&validDistance)
    }];
  }));
}
