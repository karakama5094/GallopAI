// Read-only, all-or-nothing export: listCloudRaces contains summaries, not Horse data.
export async function buildLibraryBackup(list,{loadRace,isCurrent=()=>true,onProgress=()=>{}}={}){
  const races={};
  for(let i=0;i<list.length;i++){
    if(!isCurrent())throw Error('ログイン状態が変更されました。出力を中断しました。');
    const summary=list[i];
    const race=loadRace?await loadRace(summary.raceId):structuredClone(summary);
    if(!isCurrent())throw Error('ログイン状態が変更されました。出力を中断しました。');
    if(!race||race.raceId!==summary.raceId||!Array.isArray(race.horses))throw Error(`${summary.raceId} の馬データを取得できません。概要だけのバックアップは出力しません。`);
    races[race.raceId]=race;onProgress(i+1,list.length);
  }
  if(!isCurrent())throw Error('ログイン状態が変更されました。');
  return {version:'3.3.4',exportedAt:new Date().toISOString(),races};
}
