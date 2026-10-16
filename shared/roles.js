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
    const value = config[role.id];
    if (!Number.isSafeInteger(value) || value < 0) return `Số thẻ ${role.name} phải là số nguyên không âm.`;
    if (value > role.max) return `${role.name} chỉ được tối đa ${role.max} lá.`;
  }
  if (config.werewolf < 1) return 'Bộ thẻ phải có ít nhất 1 Ma Sói.';
  if (config.werewolf * 2 >= count) return 'Số Ma Sói phải nhỏ hơn một nửa số người.';
  if (Object.values(config).reduce((sum, value) => sum + value, 0) !== count) return 'Tổng số thẻ phải bằng số người trong phòng.';
  return null;
}
