// Keep spatial information: a PDF's drawing order is not its reading order.
export function layoutPage(items, viewport = null) {
  return items.filter(i => typeof i.str === 'string' && i.str.trim()).map(i => {
    const [a,b,c,d,e,f] = viewport?.transform || [1,0,0,-1,0,0];
    const [x,y] = [i.transform[4],i.transform[5]];
    return {text:i.str.normalize('NFKC').trim(),x:a*x+c*y+e,y:b*x+d*y+f,
      width:i.width,height:i.height || Math.hypot(i.transform[2],i.transform[3]) || 10};
  });
}

export function textRows(items) {
  const rows=[];
  for(const item of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)) {
    const last=rows.at(-1),tolerance=Math.max(.6,Math.min(item.height,last?.height||item.height)*.22);
    if(last && Math.abs(last.y-item.y)<=tolerance) last.items.push(item);
    else rows.push({y:item.y,height:item.height,items:[item]});
  }
  return rows.map(row=>{
    row.items.sort((a,b)=>a.x-b.x);
    let text='',previous=null;
    for(const item of row.items){
      // Add separators between cells, but preserve a word split into glyphs.
      const gap=previous?item.x-previous.x-previous.width:0;
      text+=(previous&&gap>Math.min(previous.height,item.height)*.12?' ':'')+item.text;
      previous=item;
    }
    return {...row,text};
  });
}

export const pageText=items=>textRows(items).map(r=>r.text).join('\n');
