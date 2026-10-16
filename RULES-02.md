# Rules 02 — Thiết lập bộ thẻ và phân vai bí mật

## 1. File thay đổi

- `shared/roles.js` (mới): danh mục công khai, giới hạn, bộ mặc định và kiểm tra bộ thẻ dùng chung.
- `role-dealer.js` (mới): xáo trộn bằng crypto và lấy vai trò riêng theo UUID.
- `lobby.js`: cấu hình riêng từng phòng, phân quyền, kiểm tra bắt đầu, phân vai và tái kết nối.
- `src/RoleSettings.jsx`, `src/role-settings.css` (mới): popup thiết lập, CSS chỉ áp dụng trong popup.
- `src/main.jsx`: nút thiết lập, cảnh báo trong footer hiện có, xử lý sự kiện vai trò riêng và cập nhật panel bí mật.
- `tests/roles.test.mjs` (mới): kiểm thử Rules 02 qua Socket.IO thực.
- `tests/lobby.test.mjs`: giữ đủ 12 tình huống Rules 01; các lần kiểm tra start hợp lệ chuyển sang kiểm tra `canStart` để tiếp tục kiểm thử lobby trước khi phân vai. Trường `role` được bỏ khỏi public state. Start thực và hậu điều kiện được kiểm thử riêng trong bộ Rules 02.
- `tests/run-tests.mjs`: thêm bộ kiểm thử Rules 02.
- `RULES-02.md` (mới): báo cáo này. `dist/` được tạo lại bằng lệnh build.

Không sửa `src/style.css`, logo, công thức tọa độ ghế hoặc logic gameplay cũ. Không thêm dependency, database, bot, hosting, lượt đêm, lượt ngày, kỹ năng hay thắng/thua.

## 2. Vai trò và giới hạn

| ID | Vai trò | Phe | Tối đa |
|---|---|---|---:|
| werewolf | Ma Sói | wolves / Sói | 5 |
| villager | Dân Làng | village / Dân | 2 |
| seer | Tiên Tri | village / Dân | 1 |
| witch | Phù Thủy | village / Dân | 1 |
| guard | Bảo Vệ | village / Dân | 1 |
| hunter | Thợ Săn | village / Dân | 1 |
| cupid | Cupid | village / Dân | 1 |
| elder | Già Làng | village / Dân | 1 |
| idiot | Kẻ Ngốc | village / Dân | 1 |

Cupid thuộc phe Dân trong V1.0, không tạo phe thứ ba.

## 3. Chọn bộ thẻ

Mọi thành viên mở **Thiết lập vai trò** để xem. Chỉ Host trong phòng `waiting` được chỉnh và lưu. Popup hiển thị số người, tổng thẻ, phe và giới hạn; có nút tăng/giảm, đóng, khôi phục và lưu. Khôi phục đưa bộ mặc định vào bản nháp, Host bấm **Lưu cấu hình** để áp dụng. Người thường chỉ xem; sau khi bắt đầu mọi người chỉ xem cấu hình đã khóa. Dialog native hỗ trợ Escape, giữ focus trong popup, cuộn và kích thước điện thoại.

Bộ mặc định cho 6 người là 2 Sói, 2 Dân Làng, 1 Tiên Tri, 1 Phù Thủy. Từ 7 đến 11 người lần lượt thêm Bảo Vệ, Thợ Săn, Cupid, Già Làng, Kẻ Ngốc. Với 12 người thêm Sói thứ ba: đúng mẫu 12 lá yêu cầu. Dưới 6 người hiển thị bộ dự kiến 6 lá và chặn lưu/bắt đầu.

Khi chưa lưu tùy chỉnh, bộ mặc định tự khớp số người. Sau lần lưu của Host, thay đổi thành viên không ghi đè bộ thẻ. Nếu tổng lệch, footer và popup cảnh báo, server chặn bắt đầu cho đến khi Host sửa và lưu lại. Khi số người thay đổi trong lúc chỉnh popup, bản nháp đang sửa được giữ và kiểm tra lại theo số người mới.

Server kiểm tra lại đủ 10 điều kiện trước khi lưu, không tin quyền hay số ghế từ client. Payload cập nhật phải chứa đầy đủ 9 số nguyên không âm; từ chối ID lạ, trường thiếu, số thập phân, chuỗi, null, số vượt giới hạn, không có Sói, Sói chiếm từ một nửa số người, tổng sai hoặc số người ngoài 6–12. Lưu lỗi không làm thay đổi bộ đã lưu.

## 4. Socket events

| Event | Hướng / payload | Mục đích |
|---|---|---|
| `roles:config:get` | Client → server, không cần payload | Thành viên lấy cấu hình phòng hiện tại qua ack |
| `roles:config:update` | Client → server, `{config: {werewolf, villager, seer, witch, guard, hunter, cupid, elder, idiot}}` | Host lưu cấu hình |
| `roles:config:updated` | Server → thành viên phòng | `roleConfig`, `playerCount`, `roleConfigCustomized`, `roleConfigError` |
| `roles:config:error` | Server → người yêu cầu | Thông báo lỗi cụ thể, đồng thời trả ack `{ok:false,error}` |
| `room:start-request`, `game:start` | Client → server | Hai tên gọi chung một handler xác thực và phân vai; không có hai luồng bắt đầu |
| `game:role-assigned` | Server → đúng socket của người chơi | Chỉ `{role: roleId, team: 'wolves' hoặc 'village'}` |
| `game:started` | Server → thành viên phòng | Chỉ `{roomCode,status:'playing',phase:'role_reveal'}` |
| `state`, `room:updated` | Giữ sự kiện Rules 01 | Snapshot công khai, cấu hình và điều kiện bắt đầu, không chứa vai trò cá nhân |
| `session` | Giữ sự kiện riêng Rules 01 | Token và vai trò của chính chủ session khi tái kết nối |

Các yêu cầu có ack thành công `{ok:true,...}` hoặc thất bại `{ok:false,error}`. Các event lobby khác tiếp tục hoạt động theo Rules 01; Ready và tham gia mới bị khóa sau khi bắt đầu.

## 5. Phân vai trên server

Một handler chung kiểm tra Host hiện tại, `waiting`, chưa có kết quả phân vai, 6–12 người, Ready, kết nối và bộ thẻ hợp lệ. Server tạo deck đúng số lượng, xáo trộn Fisher–Yates dùng `node:crypto.randomInt`, gán mỗi UUID đúng một lá và lưu Map `room.roleAssignments` trong RAM. Toàn bộ kiểm tra và commit chạy đồng bộ, vì vậy yêu cầu bắt đầu lặp không thể xen giữa để phân lại.

Phòng chuyển sang `playing`, phase công khai `role_reveal`. Vai trò riêng được gửi tới từng socket, snapshot và `game:started` không mang thông tin bí mật. Panel trái hiển thị tên, phe, biểu tượng và mô tả của vai trò đã nhận. Không có nút kỹ năng hoặc chuyển sang đêm.

## 6. Bảo vệ và tái kết nối

Map phân vai chỉ tồn tại trên server, gắn UUID ổn định thay vì socket ID. Không gửi Map hoặc vai trò của người khác cho Host. Catalog trong bundle client chỉ chứa mô tả công khai, không có kết quả phân vai. Public player serializer chỉ liệt kê trường được phép; các event công khai không chứa `role`, `team`, token hoặc phân vai.

Token ngẫu nhiên 256 bit và thời gian giữ ghế tiếp tục dùng Rules 01. Session giả, hết hạn hoặc đang được socket khác dùng không nhận vai trò. Tái kết nối hợp lệ lấy lại vai trò từ Map và gửi riêng, không xáo trộn lại. Client giữ vai trò trong React state, không ghi vào localStorage/sessionStorage; sessionStorage chỉ giữ token như Rules 01. Vai trò được xóa khỏi giao diện khi rời phòng hoặc session hết hạn. Không ghi kết quả phân vai vào log.

## 7. Kiểm thử

- `npm test`: PASS bộ 12 tình huống lobby Rules 01, bộ Rules 02 và CORS.
- Rules 02 kiểm tra quyền Host; đồng bộ mọi thành viên; tất cả dạng cấu hình sai; không sửa bộ đã lưu khi lỗi; kiểm tra lại bộ thẻ ngay lúc start; thay đổi số người; từ chối start khi thiếu Ready/mất kết nối; phân đúng số lượng và mỗi người đúng một vai; kiểm tra sâu mọi public event không có trường bí mật; Host chỉ nhận vai của mình; start lặp đồng thời qua cả hai tên event; khóa cấu hình/join/Ready sau start; session giả/trùng; tái kết nối giữ nguyên phân vai; cách ly phòng; chuyển quyền Host; phòng 6, 7, 8, 9, 10, 11 và 12 người.
- `npm run build`: PASS.
- Kiểm tra trình duyệt: tạo phòng, mở popup đủ 9 vai, tăng/giảm, khôi phục mặc định, nút lưu bị khóa khi thiếu người; kiểm tra bố cục desktop và viewport 390 × 844. CSS toàn trang và tọa độ ghế giữ nguyên.

Các suite gameplay cũ vẫn được giữ nhưng chưa bật, do engine cũ chỉ hỗ trợ một phòng toàn cục và nằm ngoài Rules 02.

## 8. Điểm tích hợp Rules 03

Rules 03 cần dùng `room.roleAssignments` và UUID để xác định quyền hành động, tiếp tục serializer công khai/riêng hiện tại và chuyển từ `role_reveal` sang phase của engine theo luật mới. Không dùng deck theo chỉ số ghế của gameplay cũ. Rules 02 chưa triển khai vòng đêm, kỹ năng, chat gameplay, bỏ phiếu hoặc thắng/thua. Dữ liệu vẫn trong RAM, mất khi server khởi động lại.
