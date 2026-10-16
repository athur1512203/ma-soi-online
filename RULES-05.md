# Rules 05 — Biện hộ và phán quyết

Tài liệu này thay thế điểm dừng `day_end → awaiting_day_resolution` của Rules 03. Rules 01–04 tiếp tục dùng lobby, phân vai riêng, lịch đêm và kỹ năng hiện có. Không triển khai Rules 06 hoặc điều kiện thắng/thua.

## Chu kỳ trên server

`day_discussion → nomination_vote → defense → execution_vote → day_result → triggered_abilities / last_words → next_night → night_start`.

- **Đề cử (30 giây/lượt):** mỗi người còn sống và còn quyền bỏ phiếu đề cử một người khác còn sống. Một phiếu duy nhất, không đổi. Người nhiều phiếu nhất là ứng viên. Hòa lần đầu mở lượt mới, chỉ chọn giữa những người hòa; người trong nhóm hòa vẫn không được tự chọn mình. Hòa lần hai hoặc không có phiếu hợp lệ chuyển `day_result`, không ai bị đề cử. Phiếu của người đã rời phòng hoặc không còn hợp lệ được bỏ khi đóng lượt.
- **Biện hộ (60 giây):** ứng viên vẫn sống; chỉ ứng viên được chat văn bản. Nút **Kết thúc biện hộ** chỉ dành cho ứng viên. Hết giờ tự chuyển phán quyết, kể cả khi ứng viên mất kết nối.
- **Phán quyết (30 giây):** người còn sống, còn quyền bỏ phiếu, ngoại trừ ứng viên, được chọn **Treo cổ** hoặc **Tha** một lần. Giữ đủ thời gian lượt; không đóng sớm theo số phiếu. Người không bỏ phiếu được bỏ qua. Chỉ treo cổ nếu `execute > (execute + pardon) / 2`. Hòa hoặc không có phiếu hợp lệ đều tha. Ví dụ: một phiếu treo cổ, không phiếu tha vẫn đạt đa số phiếu hợp lệ; một treo cổ và một tha thì tha.
- **Kết quả (5 giây):** server công bố tổng số phiếu, quyết định và danh sách bị loại; không công bố từng người chọn gì. Tha thì ứng viên tiếp tục sống. Treo cổ đi qua cùng cơ chế loại người và liên kết Cupid với đêm.
- **Kỹ năng sau khi chết (30 giây):** Thợ Săn được bắn một người còn sống hoặc bỏ qua. Chỉ chính Thợ Săn được hành động; hết giờ coi như bỏ qua. Bắn chỉ một lần trong trận, kể cả khi chuỗi Cupid tiếp tục gây chết.
- **Trăn trối (30 giây/người):** mỗi người bị loại trong xử lý ban ngày có một lượt chat riêng, có nút kết thúc sớm. Những người khác bị khóa chat. Thợ Săn và các chuỗi loại người được xử lý trước các lượt trăn trối; hết hàng đợi mới sang đêm.
- **Chuẩn bị đêm (3 giây):** tự chuyển đêm tiếp theo. Không có socket cho client tự kết thúc ngày hoặc quyết định kết quả.

Các thời gian nằm trong `game-config.js`, chỉ server/test có thể cấu hình. Mỗi engine có một timer có kiểm tra version; callback cũ không chuyển nhầm lượt.

## Vai trò liên quan

- **Kẻ Ngốc:** sống sót lần đầu bị treo cổ, vĩnh viễn mất quyền đề cử và bỏ phiếu phán quyết. Vẫn có thể chat, bị đề cử và bị loại bởi các nguyên nhân khác. Nếu bị treo cổ lần nữa thì bị loại. Hiệu ứng sống sót và mất quyền được thông báo, không gửi Map phân vai.
- **Thợ Săn:** theo phương án người dùng xác nhận, được bắn một lần khi bị loại, trừ khi trực tiếp trúng thuốc độc. Nếu bị Sói tấn công đồng thời trúng độc thì không bắn. Chết do liên kết Cupid vẫn kích hoạt, trừ khi bản thân trực tiếp trúng độc. Thợ Săn chết trong đêm được xử lý sau thông báo sáng và trước thảo luận; không có trăn trối cho nạn nhân đêm.
- **Cupid:** một người trong cặp bị loại làm người còn lại bị loại; không nhân đôi xử lý tử vong. Sống sót của Kẻ Ngốc không gây chết người yêu. Bảo vệ/cứu đêm không chặn cái chết do liên kết. Phạm vi phe giữ nguyên Rules 04.

## Socket và bảo mật

Các yêu cầu trả ack `{ok:true}` hoặc `{ok:false,error}`:

| Event | Payload |
|---|---|
| `game:nominate` | `{phaseVersion, targetId}` |
| `game:defense:end` | `{phaseVersion}` |
| `game:execution:vote` | `{phaseVersion, choice:'EXECUTE' hoặc 'PARDON'}` |
| `game:hunter:shoot` | `{phaseVersion, targetId}`; `null` để bỏ qua |
| `game:last-words:end` | `{phaseVersion}` |
| `chat:public` trong biện hộ/trăn trối | `{phaseVersion, text}` |

Chat thảo luận tiếp tục nhận chuỗi văn bản để tương thích Rules 03–04. Chat biện hộ/trăn trối bắt buộc version để chặn tin nhắn đến trễ. Server xác thực session, thành viên phòng, kết nối, phase, version, thời hạn, vai/quyền và mục tiêu. Payload trường lạ, phiếu trùng, tự đề cử, ứng viên tự phán quyết và phiếu quá hạn bị từ chối.

`game:state` riêng cung cấp quyền và trạng thái **đã bỏ phiếu** của chính người nhận; không chứa lựa chọn phiếu hoặc danh sách phiếu người khác. Snapshot công khai chỉ có ứng viên, vòng đề cử, nhóm hòa, người đang trăn trối/kỹ năng và kết quả sau đóng lượt. Phiếu lưu Map trong engine theo UUID; tái kết nối giữ ứng viên, deadline, phaseVersion, phiếu đã gửi và quyền, không cho bỏ lại. Mất kết nối không dừng timer hoặc đặt lại trận. Dữ liệu vẫn ở RAM và mất khi khởi động lại server như Rules 01–04.

## Giao diện và phạm vi thay đổi

Giữ bàn tròn, 12 ghế, tọa độ, logo và `src/style.css`. Bổ sung trong panel giữa bàn: chọn người đề cử, tên ứng viên nổi bật, đồng hồ, nút kết thúc biện hộ, Treo cổ/Tha, điều khiển Thợ Săn và kết thúc trăn trối. Chat chung tự khóa theo quyền từ server. CSS mới giới hạn vào panel gameplay. Không thêm micro hoặc voice chat.

Các file chính: `game-engine.js`, `night-abilities.js`, `game-config.js`, `lobby.js`, `src/GameFlow.jsx`, `src/main.jsx`, `src/game-flow.css`.

## Kiểm thử

Chạy `npm test` và `npm run build` tại thư mục dự án.

- `tests/day-rules.test.mjs`: đề cử, hòa lần đầu và giải hòa, hòa lần hai, tự đề cử, biện hộ độc quyền/kết thúc sớm/hết giờ khi offline, không loại sớm, đa số, hòa/không đủ đa số/không phiếu, bỏ qua, phiếu trùng/quá hạn/lượt cũ, người chết, Kẻ Ngốc, Thợ Săn, Cupid và hàng đợi trăn trối.
- `tests/day-sockets.test.mjs`: Socket.IO thực, chat độc quyền và version, cấm ứng viên phán quyết, không tiết lộ phiếu, từ chối phiếu trùng, tái kết nối giữ biện hộ và phán quyết/deadline/phiếu đã gửi.
- Tiếp tục toàn bộ suite lobby, phân vai, engine, kỹ năng đêm và CORS của Rules 01–04. Những assertion về điểm dừng cũ cuối ngày được thay bằng đề cử và chuyển đêm tự động; kiểm tra dọn timer vẫn giữ.

Kiểm thử dùng server cục bộ riêng, clock giả có kiểm tra deadline, cùng kiểm tra timer thật trong suite engine; không thêm bot vào sản phẩm.
