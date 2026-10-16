# Rules 04 — Kỹ năng ban đêm

## 1. File đã thêm hoặc sửa

- `night-abilities.js` (mới): dữ liệu kỹ năng riêng, kiểm tra mục tiêu, thuốc, phiếu Sói và tổng hợp kết quả.
- `game-engine.js`: gọi kỹ năng theo lượt hiện có, lưu kết quả riêng, xử lý bình minh và giữ lượt cho người mất kết nối đến hết timer.
- `lobby.js`: nhận yêu cầu kỹ năng, trả kết quả/lỗi riêng và phát thông báo bình minh công khai.
- `src/NightAction.jsx` (mới): form Cupid, Bảo Vệ, Tiên Tri, Sói và Phù Thủy.
- `src/GameFlow.jsx`, `src/game-flow.css`: màn hình đêm toàn màn hình, mục tiêu riêng, kết quả soi/người yêu và thông báo ngày.
- `src/main.jsx`: nối form với Socket.IO, khóa tương tác nền lúc đêm, đóng popup cũ và hiển thị trạng thái bị loại.
- `tests/night-abilities.test.mjs`, `tests/night-sockets.test.mjs` (mới): kiểm thử từng vai, tương tác và bảo mật qua Socket.IO.
- `tests/game-engine.test.mjs`, `tests/game-flow.test.mjs`: cập nhật fixture Cupid sang ghép đôi thật; cập nhật tình huống mất kết nối theo Rules 04.
- `tests/run-tests.mjs`: thêm hai bộ Rules 04, tiếp tục chạy Rules 01–03 và CORS.
- `RULES-04.md` (mới): báo cáo này.
- `rules-04-cupid.png`, `rules-04-witch.png`, `rules-04-dawn.png`: ảnh kiểm chứng từ trình duyệt thực; `dist/` được build lại.

Không sửa `src/style.css`, logo, kích thước bàn hoặc tọa độ 12 ghế. Màn hình tối phủ toàn màn hình theo trao đổi bổ sung của người dùng, được tạo bằng portal ra `document.body`; giao diện bên dưới vẫn giữ nguyên layout và kết nối. Ban ngày tắt lớp phủ và hiện lại bàn. CSS mới chỉ áp dụng cho phần engine/kỹ năng.

Không thay đổi chương trình Python, file transcript hoặc dữ liệu âm thanh từ nhiệm vụ trước. Không thêm dependency, database, bot, hosting hoặc voice chat.

## 2. Cấu trúc xử lý

Mỗi `room.engine` sở hữu một instance `createNightAbilities(room)`. Module kỹ năng giữ dữ liệu trong closure trên server, gắn UUID ổn định từ Rules 01–02, không dựa vào socket ID.

Dữ liệu cả trận: cặp đôi duy nhất và trạng thái đã thông báo, lượt dùng Cupid, lịch sử Bảo Vệ theo số đêm, hai bình của Phù Thủy, khả năng chống chịu còn lại của Già Làng, kết quả soi và kết quả hành động riêng.

Dữ liệu từng đêm: hành động đã xác nhận theo UUID, phiếu của từng Sói, mục tiêu Sói cuối cùng, mục tiêu bảo vệ, cứu, độc và cờ `resolved`. Đầu đêm tạo trạng thái mới; dữ liệu tài nguyên cả trận được giữ.

Game Engine tiếp tục dùng thứ tự, timestamp, timer và `phaseVersion` của Rules 03. `submitAbility` xác thực người gửi/lượt/deadline rồi gọi module kỹ năng. Không có nhánh bắt đầu trận hoặc engine song song. Handler bắt đầu và bộ thẻ của Rules 01–02 được giữ.

## 3. Socket events và payload

### Yêu cầu riêng

`game:ability:submit` luôn gồm `phaseVersion`, không nhận role, team, isHost hoặc playerId thay người gửi:

| Lượt được server xác định | Payload bổ sung |
|---|---|
| Cupid | `targetIds: [id1, id2]` |
| Bảo Vệ, Tiên Tri, Ma Sói | `targetId: id` |
| Phù Thủy | `save: boolean, poisonTargetId: id hoặc null` |

Phù Thủy gửi cả hai lựa chọn trong một giao dịch; `save:false, poisonTargetId:null` tương đương không dùng thuốc. Payload thừa trường hoặc sai kiểu bị từ chối.

- `game:ability:result`: chỉ gửi kết quả cho socket đã xác thực của người thực hiện. Ack thành công `{ok:true,result}`.
- `game:ability:error`: lỗi riêng và ack `{ok:false,error}`.
- `game:state`: tiếp tục là trạng thái riêng; thêm `ability`, `lover`, `seerResult`, `abilityResult`. Người không đến lượt không nhận form/targets của người khác.
- `game:state-request`: đồng bộ lại trạng thái riêng sau khi kết nối lại hoặc cần xác minh hành động đã nhận.
- `game:step-complete`: tái sử dụng làm **Bỏ qua lượt**, không còn giả lập dùng kỹ năng. Không nhận mục tiêu ở event này.

### Thông báo công khai

- `game:night:resolved` và `game:day:announcement`: hai tên sự kiện mang cùng kết quả an toàn tại lúc vào `day_start`: `{nightNumber, eliminated:[{id,name}], message}`. Không có nguyên nhân hoặc vai trò.
- `state`, `room:updated`, `game:phase-changed`, `game:step-changed`: chỉ chứa phase/timestamp và trạng thái công khai. Có thêm announcement từ bình minh, không chứa dữ liệu kỹ năng riêng.

Giữ nguyên `game:start`, `room:start-request`, các event cấu hình/lobby và `chat:public`. Chat chỉ mở cho người còn sống trong thảo luận ngày. Các event kỹ năng legacy như `night:target`, `seer:inspect`, `witch:act` tiếp tục bị chặn để chỉ có một đường xử lý được xác thực. Không cho client tự đổi phase.

## 4. Quy tắc từng vai

### Cupid

Chỉ đêm đầu, đúng hai người khác nhau, tồn tại và còn sống; có thể chọn chính mình. Chỉ lưu một cặp trong trận. Khi chuyển sang `lovers_notice`, hai người nhận danh tính đối phương qua `game:state` riêng; không kèm vai trò hoặc phe của đối phương. Cupid biết hai mục tiêu mình đã chọn, các thành viên khác không nhận danh tính cặp đôi.

Hết giờ hoặc bỏ qua thì không ghép đôi, bỏ qua bước thông báo người yêu và không cho Cupid hoạt động ở các đêm sau. Hai người giữ nguyên phe. Nếu một người bị loại trong tổng hợp đêm, người còn lại cũng bị loại, không phụ thuộc bảo vệ/cứu và chỉ cập nhật một lần.

### Bảo Vệ

Chọn một người còn sống, được tự bảo vệ. Không được chọn cùng mục tiêu ở hai đêm liên tiếp. Lịch sử lưu cả số đêm: nếu có một đêm bỏ qua/hết giờ không bảo vệ, có thể chọn lại mục tiêu của đêm trước khoảng trống đó. Chỉ ngăn đòn Sói; không ngăn độc hoặc liên kết người yêu. Mục tiêu không công khai.

### Tiên Tri

Chọn một người còn sống. Server chỉ trả `isWolf` và danh tính mục tiêu; không trả vai trò cụ thể. `werewolf` cho kết quả “Thuộc phe Ma Sói”, các vai khác “Không thuộc phe Ma Sói”. Không bổ sung hạn chế tự soi vì Rules 04 không cấm. Kết quả chỉ nằm trong phản hồi và state riêng của Tiên Tri, được giữ khi tái kết nối.

### Ma Sói

Mỗi Sói còn sống có một phiếu, không được chọn bản thân hoặc bất kỳ Sói nào. Trong lúc lượt còn mở có thể đổi sang mục tiêu khác; gửi lại cùng mục tiêu bị từ chối. Các Sói chỉ thấy danh tính đồng đội, trạng thái đã chọn/chưa chọn và mục tiêu của chính mình. Người ngoài phe không nhận phiếu hoặc đồng đội.

Khi tất cả Sói còn sống đã chọn hoặc bỏ qua, kết thúc sớm. Vì vậy Sói cuối cùng xác nhận có thể đóng lượt ngay. Khi hết giờ, chỉ đếm phiếu từ Sói vẫn hợp lệ và mục tiêu còn sống trong phòng. Nhiều phiếu nhất thắng; hòa hoặc không có phiếu hợp lệ thì không có mục tiêu. Phiếu đã xác nhận được giữ khi mất kết nối. Người tạm mất kết nối vẫn có thời gian quay lại trước deadline, không làm engine tự bỏ lượt ngay.

### Phù Thủy

Mỗi bình dùng một lần cả trận. Có thể dùng cả hai cùng đêm. Bình cứu chỉ cứu mục tiêu Sói và chỉ tự cứu ở đêm đầu; không có mục tiêu Sói thì không dùng cứu. Nếu mục tiêu đã có Bảo Vệ, vẫn được dùng cứu và vẫn tốn bình.

Bình độc chọn một người còn sống khác Phù Thủy, kể cả Sói, không bị Bảo Vệ hoặc khả năng Già Làng ngăn chặn. Validate toàn bộ lựa chọn trước khi tiêu hao bất kỳ bình nào; một mục tiêu độc sai làm cả yêu cầu bị từ chối, không mất bình cứu. Giao dịch đồng bộ và bản ghi hành động chặn tiêu hao trùng.

Hết giờ/bỏ qua khi chưa xác nhận không dùng thuốc. Không còn bình hoặc không có lựa chọn khả dụng thì bỏ qua lượt. Thông tin nạn nhân, thuốc và mục tiêu chỉ gửi riêng khi Phù Thủy có lượt.

### Già Làng

Có một lần chống chịu đòn Sói thành công. Đòn đầu không bị Bảo Vệ/cứu chặn sẽ tiêu hao chống chịu nhưng Già Làng sống; đòn tiếp theo có thể loại Già Làng. Nếu được bảo vệ/cứu thì không tiêu hao chống chịu. Thuốc độc và liên kết người yêu không dùng khả năng này.

Dân Làng không có kỹ năng đêm. Kẻ Ngốc và Thợ Săn chưa kích hoạt kỹ năng đặc biệt của họ.

## 5. Tổng hợp kết quả và xử lý xung đột

1. Khi đóng lượt Sói, server chốt mục tiêu từ các phiếu hợp lệ.
2. Khi kết thúc `night_resolve`, kiểm tra mục tiêu Sói còn hợp lệ.
3. Bảo Vệ và bình cứu chặn đòn Sói.
4. Nếu không bị chặn, Già Làng dùng chống chịu nếu còn; nếu không, thêm mục tiêu vào tập bị loại.
5. Thêm mục tiêu độc hợp lệ vào tập bị loại, bất kể bảo vệ/cứu/chống chịu.
6. Duyệt liên kết người yêu, thêm người còn lại vào cùng tập.
7. Cập nhật `alive:false` mỗi UUID đúng một lần.
8. Chuyển sang `day_start` và công bố danh tính bị loại. Không ai bị loại thì thông báo chính xác “Đêm qua là một đêm bình yên”.

Tập `Set` chống loại trùng khi một người chịu nhiều hiệu ứng. Cờ `night.resolved`, `phaseVersion` và dispose bảo vệ việc tổng hợp đúng một lần. Không đổi trạng thái sống/chết hoặc công bố nạn nhân trước bình minh. Không công bố nguyên nhân, vai trò, thuốc đã dùng hoặc người bảo vệ.

## 6. Bảo mật, timer và tái kết nối

Server xác định session, room và UUID trước khi xử lý; tra vai trong Map thật. Kiểm tra người chơi còn trong phòng, còn sống, đang kết nối, đúng bước và version, chưa quá deadline. Không tin role/team/host/target cuối cùng từ client. Sói có ngoại lệ đổi phiếu trong cùng lượt; các kỹ năng khác xác nhận một lần.

Chỉ serializer riêng trả mục tiêu, thuốc, cặp đôi và kết quả soi cho đúng chủ thể. Public serializer không có trường kỹ năng, kể cả khi Host yêu cầu đồng bộ. Kết quả soi chỉ nói phe, không có vai cụ thể của mục tiêu. Vai trò chỉ lưu trong RAM theo Rules 02; không ghi kỹ năng vào localStorage hoặc log công khai.

Mỗi engine tiếp tục có một timer. Mất kết nối không reset trận, không xóa phiếu hoặc hành động đã xác nhận. Lượt có người còn sống nhưng đang mất kết nối vẫn chạy đến deadline, để họ có cơ hội quay lại. Phòng trống bị dispose, timer cũ hoặc version cũ không thể làm thay đổi đêm mới. Reconnect nhận lại lựa chọn, kết quả riêng, timestamp và trạng thái đã hoàn thành; Sói vẫn có thể sửa phiếu nếu lượt chưa đóng.

## 7. Kết quả kiểm thử và build

- `npm test`: PASS toàn bộ Rules 01–04 và CORS.
- Cupid: chọn hợp lệ, tự chọn, trùng/không tồn tại/đã chết, chỉ đêm đầu, timeout không ghép, thông báo riêng và liên kết loại người.
- Bảo Vệ: tự bảo vệ, chặn đòn Sói, không lặp đêm liên tiếp, đêm bỏ qua phá chuỗi, không chặn độc/người yêu.
- Tiên Tri: soi Sói/Dân, không trả vai cụ thể, kết quả riêng và giữ khi reconnect.
- Sói: một/nhiều Sói, đổi phiếu, hòa, timeout chốt phiếu, không phiếu, không chọn đồng đội, loại phiếu từ người không còn hợp lệ, từ chối yêu cầu trễ.
- Phù Thủy: cứu, độc, hai bình đồng thời, tự cứu đêm đầu, từ chối tự cứu sau đêm đầu, không dùng lại bình, không tiêu hao một phần khi payload sai, gửi lặp đồng thời chỉ nhận một lần.
- Già Làng: chịu đòn đầu, bị loại khi hết chống chịu, bảo vệ/cứu không tiêu hao chống chịu, độc bỏ qua chống chịu.
- Engine: giải quyết một lần, không loại trùng, dây chuyền người yêu kể cả người được bảo vệ, private/public serialization, session giả, reconnect giữ phiếu/kết quả/cặp đôi, bình minh chỉ công bố ID/tên, hết đêm hợp lệ cho phòng 6–12 người.
- Giữ các kiểm thử Rules 03 về thứ tự, timer, quyền, phòng độc lập và dừng chờ xử lý ngày. Những fixture từng mô phỏng “hoàn thành chờ Cupid” đã đổi sang ghép đôi thật; disconnect được cập nhật theo yêu cầu giữ hành động đến hết timer của Rules 04.
- `npm run build`: PASS.
- Kiểm tra tám phiên trình duyệt thật trên server riêng: chỉnh bộ thẻ, phân vai, màn hình đen toàn màn hình, ghép đôi và thông báo riêng, bảo vệ, soi Sói, Sói chọn mục tiêu, Phù Thủy dùng hai bình, bình minh chỉ loại đúng mục tiêu độc và cập nhật bàn. Ảnh: `rules-04-cupid.png`, `rules-04-witch.png`, `rules-04-dawn.png`.

Các client Socket.IO và fixture chỉ dùng trong kiểm thử tự động; không thêm chức năng Bot Test vào sản phẩm. Các suite gameplay legacy trong `server.js` vẫn không được bật.

## 8. Điểm tích hợp Rules 05

Trận vẫn đi vào `day_discussion`, `day_end` rồi dừng tại `awaiting_day_resolution`. Không tự chạy đêm mới. Rules 05 cần xử lý bỏ phiếu/kết thúc ngày hợp lệ trước khi gọi hook server `resumeAfterDayResolution()`.

Khi bổ sung loại người ban ngày, cần tái sử dụng cơ chế UUID/Set và chuyển phần liên kết người yêu thành hàm dùng chung cho mọi nguồn loại người. Rules 04 hiện xử lý liên kết trong tổng hợp đêm; chưa có endpoint loại người ban ngày. Chưa triển khai lời trăn trối, Thợ Săn, kỹ năng ban ngày của Kẻ Ngốc, thắng/thua hoặc chơi lại.
