# Năm vai trò mở rộng và cài đặt thời gian

Ngày cập nhật: 17/10/2026. Tài liệu này bổ sung Rules 02–06; giữ nguyên các luật và kỹ năng cũ ngoài những thay đổi được nêu ở đây.

## Vai trò và điều kiện thắng

Mỗi thẻ mới tối đa một lá; cấu hình mặc định cũ không tự thêm thẻ mới. Host chủ động chọn trong thiết lập phòng. Tổng số thẻ bằng số người; tổng Ma Sói, Sói Trắng và Sói Nguyền phải có ít nhất một và nhỏ hơn nửa số người. Chó Săn/Cậu Bé chỉ được tính là Sói sau khi thực sự chuyển phe.

- **Thiên Thần:** phe độc lập khi bắt đầu. Chỉ thắng riêng nếu là ứng viên bị loại bởi phán quyết TREO CỔ hợp lệ của ngày 1. Chết do Sói/độc/Thợ Săn/Cupid không kích hoạt. Ngày 1 tha, không có phiếu, hoặc hòa đề cử lần hai đều kết thúc cơ hội và chuyển vai thành Dân Làng. Nếu thắng riêng, người thắng là chính Thiên Thần; vẫn xử lý hết chuỗi chết và trăn trối trước khi công bố. Nếu đã bị nguyền, việc hết cơ hội Thiên Thần đổi vai thành Dân nhưng giữ phe Sói hiện tại.
- **Sói Trắng:** thuộc đàn Sói; đêm 1, 3, 5… có thêm lượt chọn một Sói khác còn sống, kể cả người đã chuyển sang phe Sói. Không chọn chính mình hoặc người phe khác. Đòn riêng là kỹ năng loại trực tiếp, không phải đòn cắn của đàn; không dùng Bảo Vệ/thuốc cứu/chống chịu Già Làng để chặn đòn riêng. Có thể bỏ qua; không có mục tiêu thì server bỏ lượt. Chỉ thắng riêng khi phe Sói đạt điều kiện thắng thông thường và Sói Trắng là Sói duy nhất còn sống. Nếu còn Sói khác khi phe Sói thắng, Sói Trắng thắng cùng phe. Chưa chốt kết quả giữa các lượt đêm.
- **Sói Nguyền:** có lượt riêng sau khi đóng phiếu đàn Sói, chỉ chọn đúng mục tiêu cắn cuối cùng. Chuyển phe thay cho cái chết do cắn nếu đòn cắn có hiệu lực. Bảo Vệ, thuốc cứu hoặc lượt miễn nhiễm Già Làng chặn đòn cắn thì không chuyển phe và không tiêu hao. Mục tiêu đã chết hoặc bị độc/đòn riêng Sói Trắng loại trong cùng đêm thì không chuyển và không tiêu hao. Mục tiêu chuyển thành Sói giữ vai/kỹ năng gốc, được đàn Sói nhận diện và tham gia từ lượt đàn tiếp theo. Chỉ một lần chuyển thành công; đã chốt hành động hợp lệ trong đêm thì không đổi lại. Các hành động đã chốt vẫn được tổng hợp đồng thời lúc bình minh, kể cả khi người thi triển cũng chết trong cùng đêm.
- **Chó Săn:** đầu đêm 1 chọn Sói hoặc Dân một lần. Chọn Sói được tham gia lượt đàn Sói ngay trong đêm đó. Chọn Dân, bỏ lượt hoặc hết giờ thì thành Dân Làng, không biết danh tính đàn Sói.
- **Cậu Bé:** đầu đêm 1 chọn một người khác còn sống làm cha nuôi. Bỏ lượt/hết giờ được server chọn ngẫu nhiên mục tiêu hợp lệ bằng crypto.randomInt. Cha nuôi chết do bất kỳ nguồn nào, kể cả chuỗi Cupid, thì chuyển phe Sói sau khi xử lý chuỗi chết, trước khi kiểm tra thắng. Chỉ chuyển một lần; cha nuôi rời phòng cũng không còn là mục tiêu sống trong trận.

Thứ tự đêm 1: Chó Săn → Cậu Bé → Cupid → báo người yêu → Bảo Vệ → Tiên Tri → đàn Sói → Sói Nguyền → Sói Trắng → Phù Thủy. Các đêm sau bỏ lượt một lần; đêm chẵn bỏ Sói Trắng. Mọi lượt không có người hành động/mục tiêu hợp lệ tự bỏ qua.

Kiểm tra thắng dùng **currentFaction**, sau tất cả chuyển phe/chuỗi chết/Thợ Săn/trăn trối. Thiên Thần thắng riêng được ưu tiên khi đã thỏa điều kiện. Kết quả chỉ chốt một lần. Màn hình kết quả giữ cả vai gốc, vai hiện tại và phe cuối cùng; mục tiêu riêng không được đưa vào kết quả công khai.

## Dữ liệu riêng

`room.roleAssignments` giữ nguyên vai được chia. `room.roleStates` là Map chỉ có trên server, gồm originalRole/currentRole/currentFaction/abilities/abilityUsage/winConditions/roleState. Rematch xóa runtime cũ trước khi chia lại.

Hành động đêm được ghi theo `(playerId, step)`, cho phép người bị nguyền dùng kỹ năng gốc và tham gia lượt đàn trong cùng đêm mà không ghi đè nhau. Tiên Tri kiểm tra phe hiện tại. Mục tiêu đàn Sói loại trừ toàn bộ người phe Sói hiện tại.

`game:state.assignment` chỉ gửi cho chính socket của người chơi; dùng để cập nhật card khi chuyển vai/phe. Public state không chứa runtime, mục tiêu cha nuôi, tài nguyên, phiếu hay vai bí mật. API session/role-assigned cũ vẫn trả role/team cơ bản. Chỉ sau game over mới công bố vai gốc/hiện tại và phe cuối.

## Cài đặt thời gian (giây)

| Trường | Mặc định | Giới hạn | Ánh xạ |
|---|---:|---:|---|
| introduction | 120 | 0–600 | role_reveal; 0 chuyển ngay bằng timer server |
| discussion | 180 | 30–900 | day_discussion |
| execution | 60 | 15–300 | execution_vote; không đổi thời gian đề cử/biện hộ |
| nightAction | 30 | 10–180 | Mỗi lượt kỹ năng cũ/mới, gồm lượt đàn Sói |
| result | 10 | 3–60 | Thông báo bình minh, tổng hợp đêm, kết quả ban ngày |

Kết quả trận cuối cùng vẫn ở màn hình kết thúc đến khi Host chơi lại hoặc người chơi rời phòng, không tự xóa phòng sau 10 giây. Lượt thông báo người yêu, trăn trối, Thợ Săn và chuyển cảnh giữ thời gian cũ.

`time:config:update` nhận `{config,gameId}`. Chỉ Host trong lobby được lưu; server kiểm tra số nguyên, giới hạn, trường lạ và mã trận khi rematch. Cấu hình lưu trong RAM của phòng, đồng bộ cùng snapshot và giữ lại qua rematch. Host có nút khôi phục mặc định rồi lưu. Người khác xem dạng khóa. Bắt đầu trận khóa chỉnh sửa.

Một engine chỉ có một timer đang hoạt động. Đồng bộ stepStartedAt/stepEndsAt/serverNow/phaseVersion như trước; reconnect không khởi tạo timer mới. Game over, xóa phòng và dispose hủy timer. Production không bật test bot/timer tăng tốc. Các test có thể tiêm fake clock hoặc durations riêng để kiểm tra nhanh mà không đổi cấu hình production.

## Kiểm thử và giới hạn

- `tests/extended-roles.test.mjs`: thắng Thiên Thần, hết cơ hội khi không đề cử/tha, chết bởi kỹ năng không thắng; Chó Săn chọn/default và quyền đàn; Cậu Bé chuyển phe bởi nhiều nguồn chết/Cupid và fallback; Sói Trắng đêm lẻ/tự chọn/thắng riêng/thắng phe; lời nguyền một lần, giữ kỹ năng, bảo vệ/cứu/miễn nhiễm/độc/mục tiêu chết; kiểm tra thắng sau chuyển phe và giới hạn bộ Sói.
- `tests/time-settings.test.mjs`: nhiều Socket.IO client thật; Host-only/bounds/sync/khóa sau start; 0 giây giới thiệu; deadline hành động/thảo luận; reconnect giữ ID/deadline/thời gian còn lại; một timer, callback cũ vô hiệu, dọn timer khi xóa phòng; thông tin riêng chỉ đúng người nhận.
- Toàn bộ suite cũ tiếp tục kiểm tra create/join, reconnect, Rules 01–07 và production không bật bot.
- Fixture cũ được bổ sung số thẻ mới bằng 0; kiểm tra bảo mật cũ tách assignment riêng của chính người chơi khỏi dữ liệu public. Không bỏ kiểm tra bí mật public.
- Đã xác định và sửa hai lỗi ngẫu nhiên trong fixture cũ: game-flow có thể chia Dân cho Host, reconnect Dân nhưng tiếp tục gửi qua socket Host đã disconnect; rematch giả định Dân đầu tiên luôn không phải Host. Test nay giữ socket Host mới sau reconnect và chọn đúng người không phải Host để thử quyền bị từ chối. Không đổi gameplay hoặc tăng timeout để che lỗi.

Không thêm dependency/database/asset sinh mới. Dùng icon placeholder trong catalog hiện có. Bàn tròn, tọa độ 12 ghế, logo, chat và animation giữ nguyên. Phòng/cấu hình vẫn mất khi process Render restart.

## File thêm/sửa

Thêm: role-state.js; shared/time-settings.js; src/TimeSettings.jsx; tests/extended-roles.test.mjs; tests/time-settings.test.mjs; ROLES-AND-TIMERS.md.

Sửa: shared/roles.js; role-dealer.js; night-abilities.js; game-engine.js; game-result.js; game-config.js; lobby.js; server.js (health revision/capabilities để xác minh deploy); dev/test-config.js (chỉ cập nhật thời gian các lượt mới trong chế độ dev hiện có); src/main.jsx; src/RoleSettings.jsx; src/role-settings.css; src/NightAction.jsx; src/GameFlow.jsx; src/GameResult.jsx; tests/roles.test.mjs; tests/game-engine.test.mjs; tests/game-flow.test.mjs; tests/game-result.test.mjs; tests/rematch.test.mjs; tests/run-tests.mjs.

Health backend công khai trả revision từ RENDER_GIT_COMMIT và các feature extended-roles/room-time-config; không chứa secrets. Chỉ xác nhận deploy backend khi endpoint trả đúng commit mới. Vercel có thể xác minh status commit và hash bundle đang phục vụ. Không thay đổi env production trong nhiệm vụ này.
