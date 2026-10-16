# Rules 01 — Lobby

Đã triển khai tạo/tham gia/rời phòng, 12 ghế cố định, chuyển Host, Ready và session tái kết nối. Không thay đổi CSS, logo hay tọa độ ghế.

## File thay đổi

- `lobby.js`: quản lý lobby và xác thực các thao tác trên server.
- `server.js`: đăng ký lobby; giữ nguyên logic gameplay cũ trong hàm chưa kích hoạt.
- `src/main.jsx`: kết nối tạo/join/leave/Ready/start với giao diện hiện có; hiển thị đúng `seatIndex`, Host và tình trạng kết nối.
- `tests/lobby.test.mjs`: kiểm thử Socket.IO với server riêng.
- `tests/run-tests.mjs`: chạy kiểm thử lobby và CORS. Các bài kiểm thử gameplay cũ vẫn được giữ, chờ tích hợp engine.
- `RULES-01.md`: tài liệu triển khai. `dist/` được tạo lại bằng Vite build.

## Socket events

Yêu cầu có acknowledgement: `room:create` (`{name}`), `room:join` (`{name,roomCode}`), `room:leave`, `room:ready` (`{ready:boolean}`), `room:start-request`. Giữ `game:start` làm alias kiểm tra điều kiện bắt đầu.

Kết quả: `{ok:true,...}` hoặc `{ok:false,error}`. Start hợp lệ trả `eligible:true` và thông báo chờ Rules 02; phòng vẫn `waiting`, vai trò vẫn `null`.

Server phát `room:updated` và giữ `state` để tương thích frontend; `room:error` chứa lỗi cụ thể. `session` chỉ gửi token và trạng thái riêng cho chính socket sở hữu session. Dùng sự kiện `disconnect` của Socket.IO để giữ ghế tạm thời.

## Quản lý dữ liệu

Map phòng và Map session nằm trong RAM, mất khi server khởi động lại. Mã phòng gồm 6 ký tự chữ/số, kiểm tra duy nhất. Danh tính người chơi dùng UUID và token ngẫu nhiên 256 bit, độc lập với socket ID. Host được xác định bằng `hostId`, chuyển cho người còn lại tham gia sớm nhất. Ghế mới luôn là chỉ số trống nhỏ nhất.

Snapshot công khai chỉ chứa dữ liệu cho phép; không chứa token, socket hay timer. Server bỏ qua `isHost`, `seatIndex` và danh tính người khác trong payload. Người đang trong phòng không thể tạo/join thêm phòng. Token đang có kết nối hoạt động không thể được dùng bởi socket thứ hai. Client lưu token trong `sessionStorage` riêng từng tab.

Timeout giữ ghế mặc định 30 giây, cấu hình bằng biến môi trường `LOBBY_RECONNECT_MS` (số mili giây dương). Timer được hủy khi tái kết nối hoặc rời phòng. Khi hết hạn, người chơi bị xóa, chuyển Host nếu cần và xóa phòng trống. Host chỉ đủ điều kiện khi có 6–12 người, tất cả người thường Ready, phòng `waiting` và tất cả đang kết nối.

## Kết quả kiểm thử

`npm test`: PASS đủ 12 tình huống yêu cầu, thêm validation payload, cách ly phòng, bảo mật token, từ chối session hoạt động trùng và hết hạn tái kết nối. Kiểm thử CORS PASS.

`npm run build`: PASS.

## Điểm tích hợp Rules 02

Chưa phân vai, chưa chuyển trạng thái `playing`, chưa chạy gameplay. Engine tương lai cần nhận phòng đủ điều kiện từ `room:start-request`, tái kiểm tra điều kiện và sử dụng dữ liệu theo từng phòng. Logic gameplay cũ dựa trên một phòng toàn cục nên được giữ nhưng chưa đăng ký socket handlers trong chế độ Rules 01. Các bài kiểm thử gameplay cũ cần được nối lại sau khi engine hỗ trợ nhiều phòng.
