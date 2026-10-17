export const TIME_SETTINGS = Object.freeze([
 {id:'introduction',name:'Giới thiệu đầu trận',default:120,min:0,max:600},
 {id:'discussion',name:'Thảo luận ban ngày',default:180,min:30,max:900},
 {id:'execution',name:'Bỏ phiếu treo cổ',default:60,min:15,max:300},
 {id:'nightAction',name:'Mỗi lượt hành động ban đêm',default:30,min:10,max:180},
 {id:'result',name:'Hiển thị kết quả',default:10,min:3,max:60},
]);
export const defaultTimeConfig=()=>Object.fromEntries(TIME_SETTINGS.map(t=>[t.id,t.default]));
export function validateTimeConfig(config) {
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).length!==TIME_SETTINGS.length||Object.keys(config).some(k=>!TIME_SETTINGS.some(t=>t.id===k)))return 'Cấu hình thời gian không hợp lệ.';
 for(const t of TIME_SETTINGS)if(!Number.isSafeInteger(config[t.id])||config[t.id]<t.min||config[t.id]>t.max)return `${t.name}: cần số nguyên ${t.min}–${t.max} giây.`;
 return null;
}
export function timeDurations(config) {
 const error=validateTimeConfig(config);if(error)throw new Error(error);
 return {role_reveal:config.introduction*1000,day_discussion:config.discussion*1000,execution_vote:config.execution*1000,day_result:config.result*1000,day_start:config.result*1000,night_resolve:config.result*1000,
 ...Object.fromEntries(['wolf_dog','wild_child','cupid','guard','seer','werewolf','cursed_wolf','white_wolf','witch'].map(k=>[k,config.nightAction*1000]))};
}
