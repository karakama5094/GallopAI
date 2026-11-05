// Dates constrain event time, not the date on which the original PDF was published.
const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const workout=h=>h.training||h.raw?.trainingPdf||h.rawSources?.trainingPdf;
export function workoutDateAudit(race){
  const issues=[];let unknown=0,inferredYear=0,timed=0;
  for(const horse of race.horses||[])for(const session of workout(horse)?.sessions||[]){
    if(!session.times?.length)continue;timed++;
    const value=String(session.date||'').trim();
    if(!value){unknown++;continue;}
    let date=value;
    if(/^\d{1,2}\/\d{1,2}$/.test(value)){
      const [month,day]=value.split('/').map(Number);let year=Number(race.meta?.date?.slice(0,4));
      // A December workout on a January race card refers to the preceding year.
      if(race.meta?.date?.slice(5,7)==='01'&&month===12)year--;inferredYear++;
      date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
    if(!valid(date))issues.push({number:horse.number,date:value,reason:'invalid'});
    else if(date>=race.meta?.date)issues.push({number:horse.number,date:value,reason:'not-before-race'});
  }
  return {timed,unknown,inferredYear,issues,eligible:timed>0&&unknown===0&&issues.length===0};
}
