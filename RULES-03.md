# Rules 03 — Game Engine: chu kỳ ngày/đêm

## 1. File đã thêm hoặc sửa

- `game-config.js` (mới): cấu hình tập trung và kiểm tra thời gian.
- `game-engine.js` (mới): state machine độc lập theo từng phòng; không phụ thuộc socket hoặc kỹ năng.
- `lobby.js`: khởi tạo engine sau phân vai, đồng bộ public/private, xác thực xác nhận lượt, chat ngày và dọn timer.
- `src/GameFlow.jsx`, `src/game-flow.css` (mới): đồng hồ, trạng thái chờ, nút xác nhận lượt chờ và overlay đêm chỉ trong bàn.
- `src/main.jsx`: nhận trạng thái riêng, nối GameFlow vào bàn hiện có, nhãn phase và xử lý mất kết nối.
- `tests/fake-clock.mjs`, `tests/game-engine.test.mjs`, `tests/game-flow.test.mjs` (mới): đồng hồ kiểm thử, kiểm thử engine và Socket.IO.
- `tests/run-tests.mjs`: chạy thêm hai bộ Rules 03, tiếp tục chạy Rules 01, Rules 02 và CORS.
- `RULES-03.md` (mới): báo cáo này.
- `rules-03-night.png`, `rules-03-day.png`: ảnh kiểm chứng từ phiên trình duyệt thực. `dist/` được tạo lại khi build.

Không sửa CSS tổng thể (`src/style.css`), logo, kích thước bàn hoặc công thức tọa độ 12 ghế. Không thêm thư viện, bot, micro, WebRTC, LiveKit, database hay hosting. Không kích hoạt engine gameplay cũ trong `server.js`, vì phần đó dựa trên phòng toàn cục và chứa kỹ năng ngoài phạm vi.

## 2. Kiến trúc

Sau khi handler bắt đầu của Rules 02 kiểm tra điều kiện và phân vai, phòng `playing` nhận một `room.engine` từ `createGameEngine`. Engine sử dụng `room.roleAssignments` theo UUID và `room.players`; không dùng socket ID làm danh tính. Lobby chỉ xác thực socket và chuyển thao tác vào engine, đồng thời phát sự kiện đồng bộ.

Engine giữ phase, bước nội bộ, số ngày/đêm, `phaseVersion`, timestamp bắt đầu/kết thúc, tập UUID đã xác nhận và duy nhất một timer chuyển bước. Mỗi phòng có engine và timer riêng. Dữ liệu vẫn nằm trong RAM, mất khi server khởi động lại.

`publicState()` trả dữ liệu công khai. `privateState(player)` thêm quyền và tên lượt chỉ cho người đủ điều kiện. `complete(player, phaseVersion)` kiểm tra quyền, thời hạn và chống lặp. `participantsChanged()` đánh giá lại lượt sau khi thành viên rời/mất kết nối. `dispose()` hủy timer và ngăn callback cũ thay đổi trạng thái.

## 3. Phase và step

| Phase | Chức năng |
|---|---|
| `role_reveal` | Xem vai trò được Rules 02 phân; tự chuyển khi hết thời gian |
| `night_start` | Giới thiệu đêm, tăng `nightNumber` |
| `night_actions` | Chạy từng bước nội bộ theo thứ tự; chỉ xác nhận chờ, chưa dùng kỹ năng |
| `night_resolve` | Placeholder tổng hợp đêm; không tạo kết quả hoặc nạn nhân |
| `day_start` | Tăng `dayNumber` theo đêm đã kết thúc, tắt overlay |
| `day_discussion` | Mở chat văn bản cho thành viên còn sống và đang kết nối |
| `day_end` | Đóng chat, thông báo kết thúc thảo luận |
| `awaiting_day_resolution` | Dừng hoàn toàn, không timer chuyển phase và không tự sang đêm tiếp theo |

Bước nội bộ của `night_actions`: `cupid`, `lovers_notice`, `guard`, `seer`, `werewolf`, `witch`. Tên bước nội bộ không nằm trong snapshot công khai. Người không đến lượt chỉ nhận phase `night_actions` và timestamp.

## 4. Thứ tự ban đêm

- Đêm đầu: Cupid → thông báo người yêu (bước hệ thống) → Bảo Vệ → Tiên Tri → Ma Sói → Phù Thủy → tổng hợp đêm.
- Từ đêm hai: Bảo Vệ → Tiên Tri → Ma Sói → Phù Thủy → tổng hợp đêm.
- Bỏ qua vai không có người còn sống, đang kết nối và mang vai đó. Các Sói cùng nằm trong một lượt, mỗi người xác nhận riêng; chỉ kết thúc sớm khi tất cả người hiện đủ điều kiện đã xác nhận.
- Nếu Cupid không có lượt hợp lệ, bỏ qua cả bước thông báo người yêu. Bước thông báo là placeholder theo timer, không có nút hoàn thành, không tạo quan hệ hoặc danh tính người yêu.
- Dân Làng, Thợ Săn, Già Làng và Kẻ Ngốc không có lượt đêm chủ động trong Rules 03.

Việc mất kết nối không reset trận. Nếu không còn người có quyền ở lượt đang chạy, engine chuyển bước; nếu còn người có quyền chưa xác nhận thì tiếp tục chờ họ hoặc timer. Người quay lại không làm phát lại bước đã đi qua.

## 5. Timer và đồng hồ

Thời gian mặc định tập trung tại `game-config.js`, đơn vị mili giây:

| Mốc | Thời gian |
|---|---:|
| Xem vai trò | 8 giây |
| Giới thiệu đêm | 5 giây |
| Cupid | 30 giây |
| Thông báo người yêu | 10 giây |
| Bảo Vệ | 30 giây |
| Tiên Tri | 30 giây |
| Ma Sói | 45 giây |
| Phù Thủy | 30 giây |
| Kết thúc đêm | 5 giây |
| Giới thiệu ngày | 5 giây |
| Thảo luận ngày | 180 giây |
| Kết thúc ngày | 1 giây |
| Chờ xử lý ngày | Không timer |

Đây là thiết lập của game web, không phải luật gốc. Kiểm thử có thể truyền `durations` vào `attachLobby` hoặc `createGameEngine`; không có event để client đổi thời gian.

Server đặt `stepStartedAt`, `stepEndsAt`, `serverNow` và tăng `phaseVersion` mỗi lần chuyển bước. Trước khi đặt timer mới, engine hủy timer cũ. Callback chỉ chạy nếu engine chưa bị dispose và version vẫn khớp. Mọi yêu cầu xác nhận phải có version hiện tại; yêu cầu hết hạn, lặp, khác vai hoặc từ người bị loại bị từ chối.

Client nhận timestamp và mốc nhận gói, dùng khoảng chênh thời gian từ đó để hiển thị countdown, có bù chênh đồng hồ server/client tại thời điểm nhận. Interval 250 ms chỉ vẽ lại đồng hồ; không tự chuyển phase hoặc quyết định hết lượt. Khi mất kết nối, nút xác nhận bị khóa. Tái kết nối lấy timestamp hiện tại từ server.

## 6. Socket.IO

| Event | Dữ liệu và quyền |
|---|---|
| `game:start`, `room:start-request` | Giữ một handler bắt đầu từ Rules 01–02; sau phân vai tạo engine và vào `role_reveal` |
| `game:phase-changed` | Public: mã phòng, phase, số ngày/đêm, version, timestamp, cờ placeholder/chờ xử lý ngày |
| `game:step-changed` | Public: cùng cấu trúc an toàn; không có tên vai, danh sách người hành động hoặc người đã xác nhận |
| `game:state` | Riêng từng socket: public state + `actionStep`, `canComplete`, `hasCompleted`, `canPublicChat` của chính người đó |
| `game:state-request` | Thành viên đã xác thực yêu cầu đồng bộ; trả ack `{ok:true,gameState}` và phát lại `game:state` riêng |
| `game:step-complete` | Payload duy nhất `{phaseVersion}`; hoàn thành lượt chờ, không chọn mục tiêu hoặc dùng kỹ năng |
| `game:error` | Thông báo lỗi riêng và ack `{ok:false,error}` cho thao tác engine không hợp lệ |
| `chat:public` | Giữ sự kiện chat hiện có; chỉ cho người còn sống, đang kết nối trong `day_discussion`, tối đa 240 ký tự, lưu tối đa 80 tin trong phòng |
| `state`, `room:updated`, `session`, `game:role-assigned`, `game:started` | Kế thừa Rules 01–02; snapshot công khai có thêm trạng thái engine an toàn, vai trò vẫn chỉ gửi riêng |

Chặn rõ các event gameplay cũ chưa triển khai: `phase:set`, `phase:resolve`, `night:finish`, `night:target`, `seer:inspect`, `witch:act`, `vote:cast`, `chat:wolf`. Kể cả Host cũng không được tự chuyển phase. Không đăng ký event gọi đêm kế tiếp.

## 7. Bảo mật và placeholder

Server tra UUID, vai trò trong Map hiện tại, `alive`, kết nối, version và deadline trước khi nhận xác nhận. Client không thể giả `isHost`, `role`, người hành động hoặc gửi mục tiêu qua `game:step-complete`; payload thừa trường bị từ chối.

Snapshot công khai không chứa role ID cá nhân, phe cá nhân, token, tên lượt bí mật, tập người hành động hoặc tập đã xác nhận. Chỉ người sở hữu vai đang có lượt hợp lệ thấy tên lượt và nút xác nhận; người khác tiếp tục thấy thông báo chờ. Không bổ sung chat Sói, thông tin đồng đội, quan hệ người yêu, nạn nhân, kết quả soi hoặc hiệu ứng thuốc.

Giao diện ghi rõ kỹ năng và bỏ phiếu chưa triển khai. Nút hoàn thành chỉ có nghĩa **xác nhận chờ**. Kết thúc đêm không công bố người chết hoặc kết quả giả. Hết thảo luận sẽ dừng chờ xử lý ngày, không chạy lặp vô hạn.

## 8. Tái kết nối và dọn dẹp

Token và timeout giữ ghế tiếp tục theo Rules 01. Session hợp lệ nhận lại vai trò theo Rules 02 và private game state hiện tại. Không tạo engine mới, không đổi deadline, không xáo vai hoặc xóa xác nhận đã lưu trong lượt hiện tại. Token giả/trùng đang hoạt động tiếp tục bị từ chối.

Phòng bị xóa khi thành viên cuối rời hoặc hết hạn; lúc đó engine bị dispose. Khi đóng HTTP server hoặc gọi `lobby.close()`, mọi timer giữ ghế và timer engine được hủy. Callback đã được đưa vào hàng chờ cũng không thể thay đổi engine đã dispose hoặc version mới.

## 9. Kết quả kiểm thử và build

- `npm test`: PASS toàn bộ Rules 01, Rules 02, engine Rules 03, tích hợp Socket.IO Rules 03 và CORS.
- Kiểm thử engine: khởi tạo đúng, thứ tự đầy đủ đêm đầu, đêm hai bỏ Cupid, bước hệ thống người yêu, vai vắng/chết/mất kết nối, nhiều Sói, xác nhận sớm, sai vai, người bị loại, xác nhận lặp/cũ/hết hạn, timer tự chuyển, callback cũ, dispose và dừng sau thảo luận.
- Kiểm thử Socket.IO: khởi tạo sau phân vai thật, dữ liệu riêng/công khai, hai phòng độc lập, tái kết nối giữ phase/deadline/vai, không thêm timer, chặn client đổi phase và dùng kỹ năng, chat chỉ trong ngày, cách ly chat, không có dữ liệu kỹ năng/nạn nhân giả, dọn engine khi phòng trống.
- Có kiểm thử cả đồng hồ giả để kiểm tra chính xác thứ tự/deadline và timer Node.js thực để xác minh tự chuyển và dừng.
- `npm run build`: PASS.
- Kiểm tra thực bằng sáu phiên trình duyệt trên server riêng: phân vai, countdown, overlay đêm, Dân Làng chỉ thấy chờ, Tiên Tri/Sói/Phù Thủy xác nhận đúng lượt, cần cả hai Sói xác nhận, chuyển sang ngày, chat đồng bộ tới phiên khác. Ảnh kiểm chứng: `rules-03-night.png`, `rules-03-day.png`.

## 10. Điểm tích hợp Rules 04 và Rules 05

Rules 04 sẽ xử lý kỹ năng trong các bước nội bộ và tổng hợp kết quả tại `night_resolve`, tiếp tục xác thực UUID, vai, version và deadline hiện tại. `alive` đã có trong dữ liệu player để kiểm tra quyền; Rules 03 không có đường gọi nào loại người. Thông báo người yêu cần nhận dữ liệu quan hệ thật khi kỹ năng Cupid được bổ sung.

Rules 05 cần bổ sung kết thúc ngày hợp lệ. Hook `resumeAfterDayResolution()` chỉ dành cho code server tương lai, chỉ nhận khi engine đang `awaiting_day_resolution`; không có event client gọi hook này và Rules 03 không tự gọi. Kiểm thử gọi trực tiếp hook để kiểm tra thứ tự đêm hai, không mô phỏng phiếu hoặc kết quả kỹ năng trong sản phẩm.

Chưa triển khai Rules 04, bỏ phiếu, loại người, thắng/thua hoặc bất kỳ kỹ năng nào.
