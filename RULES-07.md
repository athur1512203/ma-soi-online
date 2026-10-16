# Rules 07 — Full Game Test: 1 người + 11 Bot

## Đã triển khai

Đã xác minh backend thật là Node HTTP + Socket.IO (`server.js` đăng ký `attachLobby`). Không tạo backend giả, không viết lại engine. Đã đọc hệ thống phòng/session/reconnect/Host, phân vai, các lượt đêm, đề cử/biện hộ/phán quyết, Thợ Săn/Cupid/Kẻ Ngốc/Già Làng, game over/rematch và tài liệu Rules 01–06 trước khi tích hợp.

Ưu tiên chơi tay: Host mở localhost, tạo phòng, mở **DEV · Bot Test** rồi **Thêm 11 Bot**. Mỗi Bot có một kết nối Socket.IO độc lập và token riêng trong closure, join cùng phòng bằng event bình thường, tự Ready, hành động theo quyền riêng và tự Ready lại sau rematch. Host vẫn nhận vai ngẫu nhiên, tự thao tác và tự bấm bắt đầu/chơi lại.

Bảng điều khiển có thêm/xóa Bot, số kết nối, bật/tắt tự động, tốc độ, seed, log và Reset phòng test. Reset cho các Bot rời, Host rời rồi tạo phòng mới; rematch vẫn giữ phòng/ghế theo Rules 06. Không sửa bàn, 12 ghế, logo hoặc CSS tổng thể. CSS công cụ chỉ áp dụng `.dev-bot-*`.

## Kiến trúc và file

- `dev/bot-client.js`: cùng một Bot client dùng cho trình duyệt và harness Node; chiến thuật chỉ đọc public state và private state **của chính kết nối đó**. Không import lobby, engine hoặc Map phân vai. Kết quả soi của chính Bot được dùng để đề cử; không chia sẻ cho Bot khác. Sói thống nhất dựa trên cùng danh sách mục tiêu hợp lệ, tên và số đêm, không tổng hợp private state.
- `dev/test-config.js`: preset timer riêng và kiểm tra loopback/origin localhost.
- `dev/start-server.mjs`: entry development bật `DEV_BOT_TEST=1`, từ chối chạy trong production.
- `lobby.js`: thêm cấu hình timer riêng từng phòng ở lobby, chỉ Host localhost trên server test; dùng preset khi tạo engine. Không thay đổi handler kỹ năng, kiểm phiếu hoặc thắng/thua.
- `server.js`: bật capability test khi có cờ development; mặc định không bật.
- `src/DevBots.jsx`, `src/dev-bots.css`: panel development; quản lý các kết nối Bot thuộc tab Host, dọn Bot khi rời phòng.
- `src/main.jsx`: lazy import panel chỉ khi `import.meta.env.DEV`, hostname localhost và server báo capability; chỉ Host được hiển thị. Thêm luồng reset qua leave/create hiện có.
- `tests/bots.test.mjs`: 12 Bot, nhiều seed, giới hạn thời gian/đêm, quét privacy, reconnect/rematch và báo cáo.
- `tests/bot-security.test.mjs`: 10 kiểm tra quyền/cấu hình development, cách ly timer và production.
- `tests/run-tests.mjs`, `package.json`: scripts `server:test`, `test:bots`, `test:game`; bổ sung suite bảo mật vào hồi quy.
- `TEST-GUIDE.md`: lệnh PowerShell, cách chơi, tốc độ, log và giới hạn seed.
- `bot-test-report.json`: kết quả lượt tự động gần nhất; ảnh `rules-07-lobby.png`, `rules-07-finished.png` là phiên chơi trình duyệt thật.

## Quyền và privacy

Không có HTTP endpoint điều khiển Bot. Bot gửi các event Rules 01–06 với `gameId`/`phaseVersion` thật, chịu đầy đủ kiểm tra server; không tự gán vai, bỏ qua quyền hoặc đặt kết quả. Mỗi Bot chỉ biết mục tiêu hợp lệ và thông tin riêng server gửi cho chính nó. Token/session không ra log hoặc public observer. Bộ phân vai sau game over trong báo cáo là dữ liệu đã được công khai, không được dùng để điều khiển chiến thuật.

Socket `dev:test:configure` chỉ được đăng ký khi backend được bật cờ test và không phải production. Chỉ Host hiện tại, đúng mã trận, địa chỉ loopback và origin localhost có quyền; payload chỉ nhận speed; không đổi timer giữa trận. Preset không ảnh hưởng phòng khác hoặc `GAME_DURATIONS`. Frontend production được build mà không có module/panel Bot; backend production không đăng ký socket cấu hình dù bật nhầm cờ.

## Chiến thuật và tốc độ

Cupid chọn hai người khác nhau; Bảo Vệ chọn trong targets hợp lệ nên tuân thủ lịch sử; Tiên Tri nhận kết quả riêng; Sói cùng chọn một mục tiêu hợp lệ; Phù Thủy chỉ dùng các bình/quyền hiện có; Thợ Săn chỉ bắn khi có quyền. Ban ngày Bot chat ngắn, đề cử, biện hộ, phán quyết và trăn trối. Các vai không có kỹ năng không gửi hành động giả.

Preset 1×: giới thiệu 1s, kỹ năng 5s, thảo luận 10s, đề cử 10s, biện hộ 5s, phán quyết 10s, trăn trối 5s. Có các tốc độ 0.5×/1×/2×/5×. Host chỉnh ở lobby và vẫn tự thao tác các lượt của mình. Tắt tự động không dừng timer server hoặc hoàn tác yêu cầu đã gửi.

## Kiểm chứng trình duyệt

Đã tạo phòng 65WEKJ, thêm đủ 11 Bot và chờ tự Ready. Host được phân ngẫu nhiên Kẻ Ngốc, tự gửi phiếu Tha và Treo cổ. Bot tự chạy các kỹ năng, chat/thảo luận, hòa đề cử/bỏ lại, biện hộ/phán quyết và xử lý loại người. Ván kết thúc sau **5 ngày, 5 đêm**, **phe Sói thắng**. Ảnh kết thúc là dữ liệu ván thật, không phải fixture.

Đã bấm Chơi lại: giữ mã 65WEKJ, 12 người sống, thẻ cũ bị xóa, 11 Bot giữ kết nối và tự Ready; Host có thể bắt đầu lại. Đã kiểm tra đổi 0.5×, tắt/bật tự động, Reset tạo phòng mới chỉ còn Host, rồi dọn phòng và server/frontend kiểm thử riêng. Không tác động tiến trình localhost sẵn có của người dùng.

## Phạm vi và giới hạn

Không sửa luật Rules 01–06, không thêm tài khoản/database/voice/AI API/hosting. Không phát hiện lỗi gameplay cần sửa trong các lượt đã chạy. Có sửa lỗi harness ban đầu chờ snapshot đủ 12 ghế trước start và gắn log đúng mã trận khi thống kê rematch.

Seed điều khiển RNG chiến thuật Bot, **không** điều khiển xáo bài crypto của server. Cùng seed không đảm bảo tái hiện nguyên ván với cùng vai; báo cáo lưu seed, các sự kiện theo mã trận và vai sau game over để chẩn đoán. Không thêm đường ép vai để làm replay. Xem `TEST-GUIDE.md` để hiểu giới hạn này và cách đổi seed.

Các Bot chơi tay sống trong tab Host: đóng/F5/HMR làm ngắt kết nối và ghế được giữ theo Rules 01; không biến chúng thành Bot nền. Reconnect Socket.IO không tải lại trang và reconnect trong harness đã được kiểm chứng. Những trường hợp hiếm không xảy ra trong một đợt ngẫu nhiên vẫn có test xác định Rules 05–06: hòa cuối trận, hòa đề cử lần hai, Kẻ Ngốc, Già Làng, Thợ Săn và Cupid.

## Kết quả chạy cuối

- `npm run test:game`: **PASS**; gồm toàn bộ 12 suite hồi quy/backend (10 kiểm tra cấu hình/bảo mật development nằm trong suite riêng) và bộ Bot đầu-cuối.
- `npm run test:bots`: **22 checkpoint PASS / 0 FAIL**; **9 trận hoàn thành** từ 8 seed, có một trận rematch bổ sung.
- Phe Dân thắng: **3**; phe Sói thắng: **6**; Hòa: **0** trong đợt ngẫu nhiên này. Test điều kiện Hòa xác định của Rules 06 vẫn PASS.
- Reconnect: **2** lượt PASS; rematch: **1** lượt PASS trong harness, ngoài rematch đã kiểm tra bằng trình duyệt.
- Treo phase/timer: **0**; rò rỉ snapshot công khai phát hiện: **0**. Kiểm tra báo cáo không chứa trường token/session: PASS.
- Coverage quan sát: day_discussion, day_result, day_start, defense, execution_vote, idiot_survival, last_words, next_night, night:cupid, night:guard, night:seer, night:werewolf, night:witch, night_actions, night_resolve, night_start, nomination_runoff, nomination_vote, role_reveal, triggered_abilities.
- `npm run build`: **PASS**. Kiểm tra bundle production không chứa panel/mã Bot: PASS.

Giới hạn harness: mỗi trận tối đa 15s, 30 đêm; phase không tiến triển quá 3s sẽ FAIL và xuất log/snapshot. Số checkpoint chỉ là các mốc tổng hợp mà harness đếm, không phải số assertion của toàn dự án. Kết quả chi tiết tại `bot-test-report.json`; hướng dẫn chạy Windows tại `TEST-GUIDE.md`.
