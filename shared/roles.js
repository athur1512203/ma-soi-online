// Public catalog only. Never put player assignments in this module.
export const ROLES = Object.freeze([
  { id: 'werewolf', name: 'Ma Sói', team: 'wolves', teamName: 'Sói', max: 5, icon: '♜', description: 'Ẩn mình giữa dân làng, thuộc phe Ma Sói.' },
  { id: 'villager', name: 'Dân Làng', team: 'village', teamName: 'Dân', max: 2, icon: '♟', description: 'Dùng suy luận và thảo luận để tìm ra Ma Sói.' },
  { id: 'seer', name: 'Tiên Tri', team: 'village', teamName: 'Dân', max: 1, icon: '◉', description: 'Người có khả năng nhìn thấu thân phận trong làng.' },
  { id: 'witch', name: 'Phù Thủy', team: 'village', teamName: 'Dân', max: 1, icon: '⚗', description: 'Nắm giữ những bình thuốc có thể xoay chuyển số phận.' },
  { id: 'guard', name: 'Bảo Vệ', team: 'village', teamName: 'Dân', max: 1, icon: '⛨', description: 'Người bảo vệ dân làng trước hiểm nguy.' },
  { id: 'hunter', name: 'Thợ Săn', team: 'village', teamName: 'Dân', max: 1, icon: '➶', description: 'Tay săn quả cảm của phe Dân.' },
  { id: 'cupid', name: 'Cupid', team: 'village', teamName: 'Dân', max: 1, icon: '♡', description: 'Người se duyên, thuộc phe Dân trong V1.0.' },
  { id: 'elder', name: 'Già Làng', team: 'village', teamName: 'Dân', max: 1, icon: '♙', description: 'Bậc trưởng lão giàu kinh nghiệm của ngôi làng.' },
  { id: 'idiot', name: 'Kẻ Ngốc', team: 'village', teamName: 'Dân', max: 1, icon: '☆', description: 'Một dân làng với thân phận đặc biệt.' },
  {id:'angel',name:'Thiên Thần',team:'independent',teamName:'Độc lập',max:1,icon:'♧',description:'Thắng riêng nếu bị treo cổ hợp lệ ngày đầu; sau ngày đầu trở thành Dân Làng.'},
  {id:'white_wolf',name:'Sói Trắng',team:'wolves',teamName:'Sói',max:1,icon:'♜',description:'Tham gia đàn Sói; đêm lẻ có thể loại một Sói khác. Thắng riêng khi phe Sói thắng và chỉ còn mình là Sói.'},
  {id:'cursed_wolf',name:'Sói Nguyền',team:'wolves',teamName:'Sói',max:1,icon:'☽',description:'Một lần biến mục tiêu bị đàn Sói cắn thành Sói, giữ kỹ năng gốc, nếu đòn cắn có hiệu lực.'},
  {id:'wolf_dog',name:'Chó Săn',team:'village',teamName:'Dân',max:1,icon:'♞',description:'Đêm đầu chọn theo phe Sói hoặc Dân. Không chọn mặc định theo Dân.'},
  {id:'wild_child',name:'Cậu Bé',team:'village',teamName:'Dân',max:1,icon:'♙',description:'Chọn cha nuôi đêm đầu. Khi cha nuôi chết, chuyển sang phe Sói.'},
].map(Object.freeze));

export function defaultRoleConfig(playerCount) {
  const count = Math.max(6, Math.min(12, playerCount));
  const config = Object.fromEntries(ROLES.map(role => [role.id, 0]));
  Object.assign(config, { werewolf: count === 12 ? 3 : 2, villager: 2, seer: 1, witch: 1 });
  for (const id of ['guard', 'hunter', 'cupid', 'elder', 'idiot'].slice(0, Math.min(5, count - 6))) config[id] = 1;
  return config;
}

export function validateRoleConfig(config, count) {
  if (count < 6 || count > 12) return 'Cần từ 6 đến 12 người để thiết lập bộ thẻ.';
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'Cấu hình bộ thẻ không hợp lệ.';
  if (Object.keys(config).some(id => !ROLES.some(role => role.id === id))) return 'Có ID vai trò không được hỗ trợ.';
  for (const role of ROLES) {
    const value = config[role.id] === undefined && ['angel','white_wolf','cursed_wolf','wolf_dog','wild_child'].includes(role.id) ? 0 : config[role.id];
    if (!Number.isSafeInteger(value) || value < 0) return `Số thẻ ${role.name} phải là số nguyên không âm.`;
    if (value > role.max) return `${role.name} chỉ được tối đa ${role.max} lá.`;
  }
  const wolves = ['werewolf','white_wolf','cursed_wolf'].reduce((n,id)=>n+(config[id]??0),0);
  if (wolves < 1) return 'Bộ thẻ phải có ít nhất 1 Ma Sói.';
  if (wolves * 2 >= count) return 'Số Ma Sói phải nhỏ hơn một nửa số người.';
  if (Object.values(config).reduce((sum, value) => sum + value, 0) !== count) return 'Tổng số thẻ phải bằng số người trong phòng.';
  return null;
}
