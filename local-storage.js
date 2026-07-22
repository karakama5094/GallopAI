const RACES="gallopai_v23_local_races",WORK="gallopai_v23_workspace",SETTINGS="gallopai_v23_settings";
const parse=(v,f)=>{try{return v?JSON.parse(v):f}catch{return f}};
export function loadLocalRaces(){return parse(localStorage.getItem(RACES),{});}
export function saveLocalRace(race){const all=loadLocalRaces();all[race.raceId]={...race,savedAt:new Date().toISOString(),storage:"local"};localStorage.setItem(RACES,JSON.stringify(all));return all[race.raceId];}
export function deleteLocalRace(id){const all=loadLocalRaces();delete all[id];localStorage.setItem(RACES,JSON.stringify(all));}
export function loadWorkspace(){return parse(localStorage.getItem(WORK),null);}
export function saveWorkspace(v){localStorage.setItem(WORK,JSON.stringify(v));}
export function clearWorkspace(){localStorage.removeItem(WORK);}
export function loadSettings(defaults){return{...defaults,...parse(localStorage.getItem(SETTINGS),{})};}
export function saveSettings(v){localStorage.setItem(SETTINGS,JSON.stringify(v));}
export function importLocalBackup(data){const races=data?.races||data;if(!races||typeof races!=="object")throw new Error("JSONバックアップ形式を認識できません。");const all=loadLocalRaces();for(const [id,r] of Object.entries(races))if(r?.raceId)all[id]={...r,storage:"local"};localStorage.setItem(RACES,JSON.stringify(all));return Object.keys(races).length;}
