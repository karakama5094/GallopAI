import {acceleration,furlongTime,trainingSummary} from './engine.js';

export const FEATURE_SCHEMA_VERSION='3.3.4';
export const FEATURE_ENGINE_VERSION='3.3.4';
export const DATA_MODEL_VERSION='3.3.4';
export const MIN_RACES_FOR_ML=50;

const num=v=>v==null||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const flag=v=>v?1:0;
const finite=a=>(a||[]).filter(v=>v!=null&&Number.isFinite(Number(v))).map(Number);
const sum=a=>finite(a).reduce((s,v)=>s+v,0);
const mean=a=>{const x=finite(a);return x.length?sum(x)/x.length:null;};
const min=a=>{const x=finite(a);return x.length?Math.min(...x):null;};
const max=a=>{const x=finite(a);return x.length?Math.max(...x):null;};
const variance=a=>{const x=finite(a);if(x.length<2)return null;const m=mean(x);return x.reduce((s,v)=>s+(v-m)**2,0)/(x.length-1);};
const sd=a=>{const v=variance(a);return v==null?null:Math.sqrt(v);};
const sorted=a=>finite(a).sort((x,y)=>x-y);
const quantile=(a,q)=>{const x=sorted(a);if(!x.length)return null;const pos=(x.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(pos-lo);};
const median=a=>quantile(a,.5);
const range=a=>{const lo=min(a),hi=max(a);return lo==null||hi==null?null:hi-lo;};
const safeDiv=(a,b)=>a==null||b==null||Number(b)===0?null:Number(a)/Number(b);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const round=(v,d=4)=>v==null?null:Math.round(Number(v)*10**d)/10**d;
const count=(a,p)=>a.filter(p).length;
const linearSlope=a=>{const y=finite(a);if(y.length<2)return null;const n=y.length,mx=(n-1)/2,my=mean(y);let top=0,bot=0;for(let i=0;i<n;i++){top+=(i-mx)*(y[i]-my);bot+=(i-mx)**2;}return bot?top/bot:null;};
const recencyWeightedMean=a=>{const x=finite(a);if(!x.length)return null;let sw=0,sv=0;x.forEach((v,i)=>{const w=x.length-i;sv+=v*w;sw+=w;});return sv/sw;};
const toSeconds=v=>{const m=String(v||'').match(/(?:(\d+):)?(\d+)\.(\d+)/);return m?(Number(m[1]||0)*60+Number(m[2])+Number(`0.${m[3]}`)):null;};
const daysFromMonthDay=(raceDate,md)=>{if(!raceDate||!md)return null;const [y]=raceDate.split('-').map(Number),[m,d]=String(md).split('/').map(Number);if(!m||!d)return null;let dt=new Date(y,m-1,d),race=new Date(raceDate);if(dt>race)dt=new Date(y-1,m-1,d);return Math.round((race-dt)/86400000);};
const stableHash=value=>{const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};

function coreHorseSnapshot(h){const x=structuredClone(h||{});for(const k of ['features','featureMeta','quality','ocr','logs','versions','raw','researchPackage','calculationLog'])delete x[k];return x;}

function sessionContext(training,settings){
 const sessions=training?.sessions||[];
 const timed=sessions.filter(s=>s.times?.length),current=timed.filter(s=>!s.prev),previous=timed.filter(s=>s.prev);
 const accCurrent=current.map(s=>acceleration(s,settings)).filter(v=>v!=null),accAll=timed.map(s=>acceleration(s,settings)).filter(v=>v!=null);
 const laps=(list,f)=>list.map(s=>furlongTime(s,f)).filter(v=>v!=null);
 const latest=[...current].reverse().find(s=>s.times?.length)||[...timed].reverse().find(s=>s.times?.length)||{};
 const final=[...current].reverse().find(s=>s.final&&s.times?.length)||{};
 const recognizedCourse=timed.filter(s=>s.course).length;
 const plausible=timed.filter(s=>(s.times||[]).every(v=>v>=9&&v<=130)).length;
 return {sessions,timed,current,previous,accCurrent,accAll,latest,final,recognizedCourse,plausible,
   one:laps(current,1),two:laps(current,2),three:laps(current,3),four:laps(current,4),five:laps(current,5),six:laps(current,6),seven:laps(current,7)};
}

function score01(v,lo,hi,invert=false){if(v==null)return null;const x=clamp((Number(v)-lo)/(hi-lo),0,1);return invert?1-x:x;}
function combinedScore(parts){const x=parts.filter(p=>p.value!=null&&p.weight>0);if(!x.length)return null;return round(100*x.reduce((s,p)=>s+p.value*p.weight,0)/x.reduce((s,p)=>s+p.weight,0),2);}

export function buildHorseFeatures(race,h,settings){
 const b=h.basic||{},a=h.ability||{},t=h.training||{},r=h.result||{},ctx=sessionContext(t,settings),past=a.pastIndexes||[];
 const pv=past.map(x=>x.value),pt=past.filter(x=>x.surface==='T').map(x=>x.value),pd=past.filter(x=>x.surface==='D').map(x=>x.value),surfaceValues=race.meta?.surface==='芝'?pt:pd;
 const latest=ctx.latest,final=ctx.final,fieldSize=race.horses?.length||race.counts?.merged||null;
 const latest1=num(furlongTime(latest,1)),latest3=num(furlongTime(latest,3)),latest5=num(furlongTime(latest,5));
 const final1=num(furlongTime(final,1)),final3=num(furlongTime(final,3)),final5=num(furlongTime(final,5));
 const accLatest=latest?.times?.length?acceleration(latest,settings):null,accFinal=final?.times?.length?acceleration(final,settings):null;
 const resultTime=toSeconds(r.time);
 const f={
  race_year:num(race.meta?.date?.slice(0,4)),race_month:num(race.meta?.date?.slice(5,7)),race_day:num(race.meta?.date?.slice(8,10)),race_no:num(race.meta?.raceNo),race_distance:num(race.meta?.distance),field_size:num(fieldSize),surface_turf:flag(race.meta?.surface==='芝'),surface_dirt:flag(race.meta?.surface==='ダート'),distance_sprint:flag(race.meta?.distance&&race.meta.distance<=1400),distance_mile:flag(race.meta?.distance&&race.meta.distance>1400&&race.meta.distance<=1800),distance_middle:flag(race.meta?.distance&&race.meta.distance>1800&&race.meta.distance<=2400),distance_long:flag(race.meta?.distance&&race.meta.distance>2400),season_spring:flag([3,4,5].includes(num(race.meta?.date?.slice(5,7)))),season_summer:flag([6,7,8].includes(num(race.meta?.date?.slice(5,7)))),season_autumn:flag([9,10,11].includes(num(race.meta?.date?.slice(5,7)))),season_winter:flag([12,1,2].includes(num(race.meta?.date?.slice(5,7)))),month_sin:race.meta?.date?Math.sin(2*Math.PI*(Number(race.meta.date.slice(5,7))-1)/12):null,month_cos:race.meta?.date?Math.cos(2*Math.PI*(Number(race.meta.date.slice(5,7))-1)/12):null,
  horse_no:num(h.number),waku_no:num(h.waku),horse_no_ratio:safeDiv(h.number,fieldSize),waku_ratio:safeDiv(h.waku,8),inside_gate_flag:flag(h.number&&fieldSize&&h.number<=Math.ceil(fieldSize/3)),middle_gate_flag:flag(h.number&&fieldSize&&h.number>Math.ceil(fieldSize/3)&&h.number<=Math.ceil(fieldSize*2/3)),outside_gate_flag:flag(h.number&&fieldSize&&h.number>Math.ceil(fieldSize*2/3)),sex_male:flag(b.sex==='牡'),sex_female:flag(b.sex==='牝'),sex_gelding:flag(b.sex==='セ'),age:num(b.age),age_3_flag:flag(b.age===3),age_4_flag:flag(b.age===4),age_5plus_flag:flag(b.age>=5),carried_weight:num(b.weight??r.weight),body_weight:num(b.bodyWeight??r.bodyWeight),body_weight_delta:num(b.bodyWeightDelta??r.bodyWeightDelta),body_weight_change_rate:safeDiv(b.bodyWeightDelta??r.bodyWeightDelta,b.bodyWeight??r.bodyWeight),weight_per_age:safeDiv(b.weight??r.weight,b.age),pre_odds:num(b.odds),pre_popularity:num(b.popularity),odds_inverse:safeDiv(1,b.odds),popularity_inverse:safeDiv(1,b.popularity),jockey_changed:flag(b.jockeyChanged),blinker:flag(b.blinker),foreign_flag:flag(b.foreignFlag),zi:num(a.zi),
  past_idx_count:finite(pv).length,past_idx_missing_rate:past.length?1-finite(pv).length/past.length:null,past_idx_latest:num(pv[0]),past_idx_2:num(pv[1]),past_idx_3:num(pv[2]),past_idx_4:num(pv[3]),past_idx_5:num(pv[4]),past_idx_6:num(pv[5]),past_idx_7:num(pv[6]),past_idx_8:num(pv[7]),past_idx_mean:mean(pv),past_idx_median:median(pv),past_idx_max:max(pv),past_idx_min:min(pv),past_idx_range:range(pv),past_idx_sd:sd(pv),past_idx_variance:variance(pv),past_idx_q25:quantile(pv,.25),past_idx_q75:quantile(pv,.75),past_idx_iqr:quantile(pv,.75)!=null&&quantile(pv,.25)!=null?quantile(pv,.75)-quantile(pv,.25):null,past_idx_slope:linearSlope([...finite(pv)].reverse()),past_idx_recency_weighted:recencyWeightedMean(pv),past_idx_trend_2:pv[0]!=null&&pv[1]!=null?pv[0]-pv[1]:null,past_idx_trend_3:pv[0]!=null&&pv[2]!=null?pv[0]-pv[2]:null,past_idx_positive_trend_flag:flag(pv[0]!=null&&pv[2]!=null&&pv[0]>pv[2]),past_idx_turf_count:finite(pt).length,past_idx_turf_mean:mean(pt),past_idx_turf_max:max(pt),past_idx_dirt_count:finite(pd).length,past_idx_dirt_mean:mean(pd),past_idx_dirt_max:max(pd),past_idx_surface_match_count:finite(surfaceValues).length,past_idx_surface_match_mean:mean(surfaceValues),past_idx_surface_match_max:max(surfaceValues),past_idx_surface_advantage:mean(surfaceValues)!=null&&mean(pv)!=null?mean(surfaceValues)-mean(pv):null,index_consistency:mean(pv)!=null&&sd(pv)!=null?safeDiv(mean(pv),1+sd(pv)):null,
  workout_session_count:ctx.timed.length,workout_current_count:ctx.current.length,workout_prev_count:ctx.previous.length,workout_final_flag:flag(final.date),workout_overseas_flag:flag(ctx.sessions.some(x=>x.overseas)),workout_trend_up:flag(['↗','↑'].includes(t.trend)),workout_trend_down:flag(['↘','↓'].includes(t.trend)),workout_comment_present:flag(t.shortComment),workout_comment_length:String(t.shortComment||'').length,workout_note_count:count(ctx.sessions,x=>x.note),workout_course_recognized_rate:ctx.timed.length?ctx.recognizedCourse/ctx.timed.length:null,workout_time_plausible_rate:ctx.timed.length?ctx.plausible/ctx.timed.length:null,workout_slope_count:count(ctx.timed,x=>String(x.course||'').includes('坂')),workout_cw_count:count(ctx.timed,x=>String(x.course||'').includes('CW')),workout_w_count:count(ctx.timed,x=>String(x.course||'').includes('W')),workout_turf_count:count(ctx.timed,x=>String(x.course||'').includes('芝')),workout_dirt_count:count(ctx.timed,x=>String(x.course||'').includes('ダ')),workout_easy_count:count(ctx.current,x=>String(x.style||'').includes('馬なり')),workout_strong_count:count(ctx.current,x=>/強め|一杯/.test(String(x.style||''))),workout_good_baba_count:count(ctx.current,x=>x.baba==='良'),workout_heavy_baba_count:count(ctx.current,x=>['重','不'].includes(x.baba)),workout_time_token_count:ctx.timed.reduce((s,x)=>s+(x.times?.length||0),0),workout_current_time_token_count:ctx.current.reduce((s,x)=>s+(x.times?.length||0),0),workout_days_span:ctx.current.length>1?Math.abs((daysFromMonthDay(race.meta?.date,ctx.current[0].date)||0)-(daysFromMonthDay(race.meta?.date,ctx.current.at(-1).date)||0)):0,
  accel_current_max:max(ctx.accCurrent),accel_current_mean:mean(ctx.accCurrent),accel_current_median:median(ctx.accCurrent),accel_current_min:min(ctx.accCurrent),accel_current_range:range(ctx.accCurrent),accel_current_sd:sd(ctx.accCurrent),accel_current_variance:variance(ctx.accCurrent),accel_current_q25:quantile(ctx.accCurrent,.25),accel_current_q75:quantile(ctx.accCurrent,.75),accel_current_slope:linearSlope(ctx.accCurrent),accel_all_max:max(ctx.accAll),accel_all_mean:mean(ctx.accAll),accel_latest:num(accLatest),accel_final:num(accFinal),accel_latest_vs_mean:accLatest!=null&&mean(ctx.accCurrent)!=null?accLatest-mean(ctx.accCurrent):null,accel_final_vs_latest:accFinal!=null&&accLatest!=null?accFinal-accLatest:null,accel_positive_count:count(ctx.accCurrent,v=>v>0),accel_zero_plus_rate:ctx.accCurrent.length?count(ctx.accCurrent,v=>v>=0)/ctx.accCurrent.length:null,accel_consistency:mean(ctx.accCurrent)!=null&&sd(ctx.accCurrent)!=null?safeDiv(mean(ctx.accCurrent),1+sd(ctx.accCurrent)):null,
  latest_1f:latest1,latest_2f:num(furlongTime(latest,2)),latest_3f:latest3,latest_4f:num(furlongTime(latest,4)),latest_5f:latest5,latest_6f:num(furlongTime(latest,6)),latest_7f:num(furlongTime(latest,7)),latest_days_before:daysFromMonthDay(race.meta?.date,latest.date),latest_lane:num(latest.lane),latest_course_slope:flag(String(latest.course||'').includes('坂')),latest_course_cw:flag(String(latest.course||'').includes('CW')),latest_course_w:flag(String(latest.course||'').includes('W')),latest_baba_good:flag(latest.baba==='良'),latest_baba_heavy:flag(['重','不'].includes(latest.baba)),latest_style_easy:flag(String(latest.style||'').includes('馬なり')),latest_style_strong:flag(/強め|一杯/.test(String(latest.style||''))),latest_final_flag:flag(latest.final),latest_1f_vs_current_mean:latest1!=null&&mean(ctx.one)!=null?latest1-mean(ctx.one):null,latest_3f_vs_current_mean:latest3!=null&&mean(ctx.three)!=null?latest3-mean(ctx.three):null,latest_5f_vs_current_mean:latest5!=null&&mean(ctx.five)!=null?latest5-mean(ctx.five):null,latest_3f_per_f:safeDiv(latest3,3),latest_5f_per_f:safeDiv(latest5,5),latest_last1_share:safeDiv(latest1,latest3),
  final_1f:final1,final_3f:final3,final_5f:final5,final_days_before:daysFromMonthDay(race.meta?.date,final.date),final_lane:num(final.lane),final_style_easy:flag(String(final.style||'').includes('馬なり')),final_style_strong:flag(/強め|一杯/.test(String(final.style||''))),final_1f_vs_latest:final1!=null&&latest1!=null?final1-latest1:null,final_3f_vs_latest:final3!=null&&latest3!=null?final3-latest3:null,final_5f_vs_latest:final5!=null&&latest5!=null?final5-latest5:null,
  current_1f_mean:mean(ctx.one),current_1f_median:median(ctx.one),current_1f_best:min(ctx.one),current_1f_worst:max(ctx.one),current_1f_range:range(ctx.one),current_1f_sd:sd(ctx.one),current_1f_variance:variance(ctx.one),current_3f_mean:mean(ctx.three),current_3f_median:median(ctx.three),current_3f_best:min(ctx.three),current_3f_worst:max(ctx.three),current_3f_range:range(ctx.three),current_3f_sd:sd(ctx.three),current_3f_variance:variance(ctx.three),current_5f_mean:mean(ctx.five),current_5f_median:median(ctx.five),current_5f_best:min(ctx.five),current_5f_worst:max(ctx.five),current_5f_range:range(ctx.five),current_5f_sd:sd(ctx.five),current_5f_variance:variance(ctx.five),current_1f_improvement:ctx.one.length>=2?ctx.one[0]-ctx.one.at(-1):null,current_3f_improvement:ctx.three.length>=2?ctx.three[0]-ctx.three.at(-1):null,current_5f_improvement:ctx.five.length>=2?ctx.five[0]-ctx.five.at(-1):null,
  sire_present:flag(a.sire),dam_present:flag(a.dam),broodmare_sire_present:flag(a.broodmareSire),trainer_present:flag(b.trainer),jockey_present:flag(b.jockey),owner_present:flag(b.owner),breeder_present:flag(b.breeder),birthday_present:flag(b.birthday),pedigree_completeness:mean([flag(a.sire),flag(a.dam),flag(a.broodmareSire),flag(a.secondDam)]),
  result_available:flag(r.finish!=null),finish_position:num(r.finish),win_flag:flag(r.finish===1),place_flag:flag(r.finish!=null&&r.finish<=3),final_odds:num(r.odds),final_popularity:num(r.popularity),race_time_seconds:resultTime,last3f:num(r.last3f),pci:num(r.pci),ave3f:num(r.ave3f),corner1:num(r.corners?.[0]),corner2:num(r.corners?.[1]),corner3:num(r.corners?.[2]),corner4:num(r.corners?.[3]),corner_gain:r.corners?.length>1?num(r.corners[0])-num(r.corners.at(-1)):null,corner_position_mean:mean(r.corners||[]),corner_position_range:range(r.corners||[]),corner_loss_result:r.corners?.length>1?Math.max(0,num(r.corners.at(-1))-num(r.corners[0])):null,pace_index_result:num(r.pci),finish_power_result:r.last3f!=null?safeDiv(1,r.last3f):null,prize:num(r.prize),abnormal_flag:flag(r.abnormalCode),pre_result_odds_gap:b.odds!=null&&r.odds!=null?r.odds-b.odds:null,
  source_target_text:flag(h.sourceStatus?.targetText),source_training:flag(h.sourceStatus?.training),source_entry_csv:flag(h.sourceStatus?.entryCsv),source_result_csv:flag(h.sourceStatus?.resultCsv),source_count:Object.values(h.sourceStatus||{}).filter(Boolean).length,name_match_ok:1,raw_field_count:Object.values({b,a,t,r}).flatMap(x=>Object.keys(x||{})).length,feature_schema_major:3,feature_schema_minor:3
 };

 // Rule-based proxies. They are deterministic research features, not learned predictions.
 f.speed_index_proxy=round(mean([f.zi,f.past_idx_surface_match_mean,f.past_idx_recency_weighted]),3);
 f.training_score_rule=combinedScore([
   {value:score01(f.accel_current_max,-1.5,1.5),weight:.35},
   {value:score01(f.latest_1f,15,10,true),weight:.30},
   {value:score01(f.workout_current_count,0,5),weight:.15},
   {value:score01(f.workout_course_recognized_rate,0,1),weight:.10},
   {value:f.workout_trend_up?1:f.workout_trend_down?0:.5,weight:.10}
 ]);
 f.agility_proxy=combinedScore([{value:score01(f.accel_current_max,-1.5,1.5),weight:.6},{value:score01(f.accel_consistency,-1,1.5),weight:.4}]);
 f.finish_power_proxy=combinedScore([{value:score01(f.latest_1f,15,10,true),weight:.55},{value:score01(f.accel_latest,-1.5,1.5),weight:.45}]);
 f.stamina_proxy=combinedScore([{value:score01(f.current_5f_best,75,62,true),weight:.55},{value:score01(f.current_5f_sd,4,0,true),weight:.20},{value:score01(f.workout_current_count,0,5),weight:.25}]);
 f.rotation_score=combinedScore([{value:score01(f.latest_days_before,14,1,true),weight:.55},{value:score01(f.workout_current_count,0,5),weight:.30},{value:score01(f.workout_days_span,0,21),weight:.15}]);
 f.growth_rate_proxy=f.body_weight_change_rate;
 f.course_fit_surface_proxy=f.past_idx_surface_advantage;
 f.distance_fit_proxy=null; // requires historical race distances not present in current TARGET text format
 f.jockey_rating_history=null; // generated after enough historical races
 f.trainer_rating_history=null; // generated after enough historical races
 f.jockey_rating_available=0;
 f.trainer_rating_available=0;
 f.training_density=f.workout_current_count&&f.latest_days_before!=null?safeDiv(f.workout_current_count,Math.max(1,f.latest_days_before)):null;
 f.zi_x_accel=f.zi!=null&&f.accel_current_max!=null?f.zi*f.accel_current_max:null;
 f.zi_x_latest1f=f.zi!=null&&f.latest_1f!=null?safeDiv(f.zi,f.latest_1f):null;
 f.speed_training_composite=mean([f.speed_index_proxy,f.training_score_rule]);
 f.pre_race_feature_completeness=null; // filled after dictionary is available
 return f;
}

const RESULT_KEYS=new Set(['result_available','finish_position','win_flag','place_flag','final_odds','final_popularity','race_time_seconds','last3f','pci','ave3f','corner1','corner2','corner3','corner4','corner_gain','corner_position_mean','corner_position_range','corner_loss_result','pace_index_result','finish_power_result','prize','abnormal_flag','pre_result_odds_gap']);
const TOKEN_JA={race:'レース',year:'年',month:'月',day:'日',no:'番号',distance:'距離',field:'頭数',size:'数',surface:'馬場',turf:'芝',dirt:'ダート',sprint:'短距離',mile:'マイル',middle:'中距離',long:'長距離',season:'季節',spring:'春',summer:'夏',autumn:'秋',winter:'冬',horse:'馬',waku:'枠',ratio:'比率',inside:'内',outside:'外',gate:'枠順',sex:'性別',male:'牡',female:'牝',gelding:'せん',age:'年齢',carried:'負担',weight:'重量',body:'馬体',delta:'増減',change:'変化',rate:'率',odds:'単勝オッズ',popularity:'人気',inverse:'逆数',jockey:'騎手',changed:'変更',blinker:'ブリンカー',foreign:'外国産',zi:'ZI',past:'過去',idx:'指数',count:'件数',missing:'欠損',latest:'最新',mean:'平均',median:'中央値',max:'最大',min:'最小',range:'範囲',sd:'標準偏差',variance:'分散',q25:'第1四分位',q75:'第3四分位',iqr:'四分位範囲',slope:'傾向',recency:'直近',weighted:'加重',trend:'変化',positive:'上昇',flag:'フラグ',match:'一致',advantage:'優位差',consistency:'安定度',workout:'調教',session:'セッション',current:'当週',prev:'前走前',final:'最終追切',overseas:'海外',comment:'短評',length:'文字数',note:'注記',course:'コース',recognized:'認識',time:'タイム',plausible:'妥当',easy:'馬なり',strong:'強め',good:'良',heavy:'重不良',token:'数値',days:'日数',span:'期間',accel:'急加速力',all:'全期間',zero:'ゼロ',plus:'以上',f:'F',lane:'コース位置',cw:'CW',style:'追い方',best:'最良',worst:'最悪',improvement:'改善',sire:'父',dam:'母',broodmare:'母父',trainer:'調教師',owner:'馬主',breeder:'生産者',birthday:'生年月日',pedigree:'血統',completeness:'充足率',result:'結果',available:'有無',finish:'着順',win:'勝利',place:'複勝',pci:'PCI',ave3f:'平均3F',corner:'通過順',gain:'順位上昇',loss:'順位後退',pace:'ペース',power:'末脚力',prize:'賞金',abnormal:'異常',source:'ソース',target:'TARGET',text:'TXT',training:'調教',entry:'出馬表',csv:'CSV',raw:'元データ',schema:'スキーマ',major:'主',minor:'副',speed:'能力',index:'指数',proxy:'代理指標',score:'スコア',rule:'ルール',agility:'機動力',stamina:'持続力',rotation:'調整過程',growth:'成長',fit:'適性',history:'履歴',density:'密度',composite:'複合',feature:'特徴量'};
function japaneseName(key){return key.split('_').map(t=>TOKEN_JA[t]||t).join(' ');}
function groupOf(key){if(RESULT_KEYS.has(key)||key.endsWith('_result'))return'result';if(/^(workout|accel|latest|final|current|training|agility|finish_power_proxy|stamina|rotation)/.test(key))return'training';if(/^(past|zi|speed_index|index_consistency|course_fit|distance_fit|speed_training)/.test(key))return'ability';if(/^(source|name_match|raw_field|feature_schema|pre_race_feature)/.test(key))return'quality';if(/^(sire|dam|broodmare|pedigree)/.test(key))return'pedigree';if(/^(jockey|trainer)/.test(key))return'connections';return'basic';}
function unitOf(key){if(/rate|ratio|share|completeness/.test(key))return'ratio';if(/score|proxy/.test(key))return'point';if(/days|span/.test(key))return'day';if(/weight/.test(key)&&!/(weighted|weight_per_age)/.test(key))return'kg';if(/odds/.test(key))return'multiple';if(/distance/.test(key))return'm';if(/1f|2f|3f|4f|5f|6f|7f|time_seconds|ave3f|last3f/.test(key))return'sec';if(/accel/.test(key))return'sec-index';if(/variance/.test(key))return'unit²';return'';}
function formulaOf(key){
 const explicit={speed_index_proxy:'mean(ZI, surface-matched past index mean, recency-weighted past index)',training_score_rule:'weighted rule score: acceleration 35%, last1F 30%, session count 15%, course recognition 10%, trend 10%',agility_proxy:'weighted acceleration and consistency proxy',finish_power_proxy:'weighted last1F and latest acceleration proxy',stamina_proxy:'weighted 5F time, stability and workout count proxy',rotation_score:'weighted recency, workout count and workout span',course_fit_surface_proxy:'surface-matched past index mean - all past index mean',distance_fit_proxy:'null until historical distance data are available',jockey_rating_history:'null until historical jockey aggregation is available',trainer_rating_history:'null until historical trainer aggregation is available',pre_race_feature_completeness:'non-null pre-race features / all pre-race features'};
 if(explicit[key])return explicit[key];
 if(key.endsWith('_mean'))return`mean(${key.replace(/_mean$/,'')})`;
 if(key.endsWith('_median'))return`median(${key.replace(/_median$/,'')})`;
 if(key.endsWith('_variance'))return`sample variance(${key.replace(/_variance$/,'')})`;
 if(key.endsWith('_sd'))return`sample standard deviation(${key.replace(/_sd$/,'')})`;
 if(key.endsWith('_range'))return`max - min of ${key.replace(/_range$/,'')}`;
 if(key.endsWith('_rate')||key.endsWith('_ratio'))return`numerator / denominator for ${key}`;
 if(key.endsWith('_flag'))return`1 when condition is true, otherwise 0`;
 return`deterministic extraction or derivation: ${key}`;
}
function aiUse(group,key){if(group==='training')return['調教AI'];if(group==='ability')return['能力AI'];if(group==='pedigree')return['血統AI'];if(group==='connections')return['能力AI','回収率AI'];if(group==='result')return['検証','回収率AI'];if(group==='quality')return['品質管理'];return['能力AI','展開AI'];}
export function featureDictionary(){
 const sample=buildHorseFeatures({meta:{},horses:[]},{basic:{},ability:{pastIndexes:[]},training:{sessions:[]},result:{},sourceStatus:{}},{});
 const keys=Object.keys(sample),preCount=keys.filter(k=>!RESULT_KEYS.has(k)).length;
 return keys.map((key,i)=>({
  FeatureID:`F${String(i+1).padStart(3,'0')}`,key,名称:japaneseName(key),説明:`${japaneseName(key)}を表す再計算可能な特徴量。`,単位:unitOf(key),型:'number|null',計算式:formulaOf(key),利用AI:aiUse(groupOf(key),key),group:groupOf(key),availablePreRace:!RESULT_KEYS.has(key),sourceFields:sourceFieldsOf(key),missingPolicy:key.includes('rating_history')||key==='distance_fit_proxy'?'保留(null):必要履歴が未蓄積':'取得不能時はnull',leakageRisk:RESULT_KEYS.has(key)?'POST_RACE_ONLY':'PRE_RACE_OK',schemaVersion:FEATURE_SCHEMA_VERSION
 }));
}
function sourceFieldsOf(key){if(/^(workout|accel|latest|final|current|training|agility|finish_power_proxy|stamina|rotation)/.test(key))return['trainingPdf'];if(/^(past|zi|speed_index|index_consistency|course_fit|distance_fit|sire|dam|broodmare|pedigree)/.test(key))return['targetText'];if(RESULT_KEYS.has(key)||key.endsWith('_result'))return['resultCsv'];if(/body_weight|pre_odds|pre_popularity|owner|breeder|birthday/.test(key))return['entryCsv'];return['targetText','entryCsv'];}

function buildOcrRecord(race,h){
 const training=h.rawSources?.trainingPdf||h.training||null,sessions=training?.sessions||[],timed=sessions.filter(s=>s.times?.length),recognized=timed.filter(s=>s.course).length,plausible=timed.filter(s=>s.times.every(v=>v>=9&&v<=130)).length;
 const header=training?.name?1:0,nameMatch=training?.name&&h.name?flag(String(training.name).replace(/\s/g,'')===String(h.name).replace(/\s/g,'')):0;
 const sessionScore=Math.min(1,timed.length/2),courseScore=timed.length?recognized/timed.length:0,plausibleScore=timed.length?plausible/timed.length:0;
 const confidence=round(clamp(.25*header+.25*nameMatch+.25*sessionScore+.15*courseScore+.10*plausibleScore,0,1),3);
 return{confidence,qualityPercent:Math.round(confidence*100),method:'pdfjs-text-extraction',isTrueOcr:false,engineVersion:'pdf.js-bundled',parseVersion:'training-parser-3.3.2',pdfPages:race.sourceMeta?.training?.pdfPages??null,textLength:race.sourceMeta?.training?.textLength??null,horseHeaderDetected:!!training?.name,timedSessionCount:timed.length,recognizedCourseRate:round(courseScore,3),plausibleTimeRate:round(plausibleScore,3),warnings:[...(timed.length===0?['調教時計を検出できません']:[]),...(nameMatch===0?['馬名照合を確認してください']:[])]};
}

const CRITICAL_PRE=['horse_no','waku_no','age','carried_weight','zi','workout_session_count','latest_1f','accel_current_max','source_target_text','source_training'];
function buildHorseQuality(pkg,duplicateFlag=false){
 const issues=[],f=pkg.features,ocr=pkg.ocr;
 const missing=CRITICAL_PRE.filter(k=>f[k]==null||f[k]===0&&['source_target_text','source_training'].includes(k));
 if(missing.length)issues.push(...missing.map(k=>({level:k.startsWith('source_')?'error':'warning',code:'MISSING_CRITICAL_FEATURE',field:k,message:`重要特徴量 ${k} が欠損`})));
 if(duplicateFlag)issues.push({level:'error',code:'DUPLICATE_HORSE',message:'同一レース内で馬番が重複'});
 const typeErrors=Object.entries(f).filter(([,v])=>v!=null&&!Number.isFinite(Number(v))).map(([k])=>k);
 if(typeErrors.length)issues.push({level:'error',code:'FEATURE_TYPE_ERROR',fields:typeErrors,message:'数値特徴量に型エラー'});
 const abnormalities=[];
 if(f.body_weight!=null&&(f.body_weight<300||f.body_weight>700))abnormalities.push('body_weight');
 if(f.carried_weight!=null&&(f.carried_weight<45||f.carried_weight>65))abnormalities.push('carried_weight');
 if(f.age!=null&&(f.age<2||f.age>15))abnormalities.push('age');
 if(f.latest_1f!=null&&(f.latest_1f<9||f.latest_1f>20))abnormalities.push('latest_1f');
 if(abnormalities.length)issues.push({level:'warning',code:'ABNORMAL_RANGE',fields:abnormalities,message:'想定範囲外の数値'});
 if(ocr.confidence<.5)issues.push({level:'warning',code:'LOW_OCR_CONFIDENCE',message:'調教PDF解析信頼度が50%未満'});
 const errorCount=issues.filter(x=>x.level==='error').length,warningCount=issues.filter(x=>x.level==='warning').length;
 const penalty=Math.min(100,errorCount*30+warningCount*8+missing.length*3+typeErrors.length*20+abnormalities.length*5+(1-ocr.confidence)*15);
 return{qualityScore:Math.round(100-penalty),missingCount:missing.length,duplicateFlag,typeErrorCount:typeErrors.length,abnormalCount:abnormalities.length,warning:issues.filter(x=>x.level==='warning').map(x=>x.message),validationStatus:errorCount?'ERROR':warningCount?'WARNING':'PASS',errorCount,warningCount,issues,checkedAt:new Date().toISOString(),schemaVersion:FEATURE_SCHEMA_VERSION};
}

export function buildResearchPackage(race,settings,previousPackage=null){
 const started=globalThis.performance?.now?.()??Date.now(),builtAt=new Date().toISOString(),dictionary=featureDictionary();
 const counts=new Map();for(const h of race.horses||[])counts.set(h.number,(counts.get(h.number)||0)+1);
 const horses=(race.horses||[]).map(h=>{
  const horseStart=globalThis.performance?.now?.()??Date.now(),features=buildHorseFeatures(race,h,settings);
  const preDefs=dictionary.filter(d=>d.availablePreRace),preAvailable=preDefs.filter(d=>features[d.key]!=null).length;
  features.pre_race_feature_completeness=round(preDefs.length?preAvailable/preDefs.length:null,4);
  const existingRaw=h.raw||{};const raw={merged:coreHorseSnapshot(h),targetText:structuredClone(existingRaw.targetText??h.rawSources?.targetText??h.ability??null),trainingPdf:structuredClone(existingRaw.trainingPdf??h.rawSources?.trainingPdf??h.training??null),entryCsv:structuredClone(existingRaw.entryCsv??h.rawSources?.entryCsv??null),resultCsv:structuredClone(existingRaw.resultCsv??h.rawSources?.resultCsv??h.result??null),sourceFiles:structuredClone(race.sourceFiles||existingRaw.sourceFiles||{}),capturedAt:builtAt};
  const ocr=buildOcrRecord(race,h),base={horseKey:String(h.number).padStart(2,'0'),raw,features,ocr};
  const quality=buildHorseQuality(base,(counts.get(h.number)||0)>1),elapsed=round((globalThis.performance?.now?.()??Date.now())-horseStart,3),prev=(previousPackage?.horses||[]).find(x=>x.horseKey===base.horseKey);
  const logEvent={at:builtAt,event:'GENERATE_FEATURES',status:quality.validationStatus,featureVersion:FEATURE_SCHEMA_VERSION,engineVersion:FEATURE_ENGINE_VERSION,calculationTimeMs:elapsed,featureCount:Object.keys(features).length,rawHash:stableHash(raw)};
  return{...base,quality,logs:{featureVersion:FEATURE_SCHEMA_VERSION,createdAt:prev?.logs?.createdAt||builtAt,updatedAt:builtAt,engineVersion:FEATURE_ENGINE_VERSION,calculationTime:elapsed,calculationTimeMs:elapsed,recalculateHistory:[...(prev?.logs?.recalculateHistory||[]).slice(-9),logEvent],steps:['RAW_CAPTURE','FEATURE_GENERATION','TYPE_VALIDATION','RANGE_VALIDATION','OCR_QUALITY','READY_FOR_SAVE']},versions:{raw:'1.2.0',horse:'3.3.4',features:FEATURE_SCHEMA_VERSION,quality:'3.3.4',ocr:'3.3.4',logs:'3.3.4'},featureMeta:{schemaVersion:FEATURE_SCHEMA_VERSION,dictionaryVersion:FEATURE_SCHEMA_VERSION,generatedAt:builtAt,featureCount:Object.keys(features).length,preRaceFeatureCount:preDefs.length,preRaceAvailableCount:preAvailable,postRaceAvailableCount:dictionary.filter(d=>!d.availablePreRace&&features[d.key]!=null).length,rawHash:stableHash(raw)}};
 });
 const issues=horses.flatMap(p=>p.quality.issues.map(x=>({...x,horseNo:p.raw.merged.number}))),quality={schemaVersion:FEATURE_SCHEMA_VERSION,checkedAt:builtAt,horseCount:horses.length,completePreRace:horses.filter(p=>p.raw.merged.sourceStatus?.targetText&&p.raw.merged.sourceStatus?.training).length,missingCount:horses.reduce((s,p)=>s+p.quality.missingCount,0),duplicateCount:horses.filter(p=>p.quality.duplicateFlag).length,abnormalCount:horses.reduce((s,p)=>s+p.quality.abnormalCount,0),typeErrorCount:horses.reduce((s,p)=>s+p.quality.typeErrorCount,0),errorCount:horses.reduce((s,p)=>s+p.quality.errorCount,0),warningCount:horses.reduce((s,p)=>s+p.quality.warningCount,0),qualityScore:round(mean(horses.map(p=>p.quality.qualityScore)),1),ocrConfidence:round(mean(horses.map(p=>p.ocr.confidence)),3),validationStatus:horses.some(p=>p.quality.validationStatus==='ERROR')?'ERROR':horses.some(p=>p.quality.validationStatus==='WARNING')?'WARNING':'PASS',issues};
 const elapsed=round((globalThis.performance?.now?.()??Date.now())-started,3);
 return{race:{...structuredClone(race),dataModelVersion:DATA_MODEL_VERSION,researchVersion:'3.3',featureSchemaVersion:FEATURE_SCHEMA_VERSION,featureEngineVersion:FEATURE_ENGINE_VERSION},horses,quality,featureDictionary:dictionary,ocr:{confidence:quality.ocrConfidence,qualityPercent:Math.round((quality.ocrConfidence||0)*100),method:'aggregate-pdfjs-text-extraction',pdfPages:race.sourceMeta?.training?.pdfPages??null,horseCount:horses.length},logs:[{at:builtAt,event:'BUILD_RESEARCH_PACKAGE',engineVersion:FEATURE_ENGINE_VERSION,horseCount:horses.length,featureCountPerHorse:horses[0]?Object.keys(horses[0].features).length:0,calculationTimeMs:elapsed,status:quality.validationStatus}],machineLearning:{enabled:false,minRaceCount:MIN_RACES_FOR_ML,reason:'50レース到達までは統計検証のみ'}};
}
