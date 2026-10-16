# Sửa nút Tạo phòng — báo cáo

## Nguyên nhân xác nhận từ source

- Nút nằm trong `App` ở `src/main.jsx`, gửi `room:create`; tên event và handler backend vốn đúng. Server đã chặn một session ở nhiều phòng.
- Frontend cũ dùng `VITE_SERVER_URL || <hostname-frontend>:3001` ở cả production. Khi không đặt biến **lúc build**, frontend deploy riêng sẽ trỏ nhầm hostname/cổng. Chuỗi thừa khoảng trắng, namespace `/socket.io`, URL sai hoặc HTTP dưới trang HTTPS cũng chưa được kiểm tra rõ.
- Nút chưa có trạng thái đang tạo hoặc khóa đồng bộ chống nhấn liên tục. Ack chỉ có mã phòng; danh tính/Host/lobby phải lấy từ `session`/`state`. Timeout và lỗi kết nối trước đây chỉ có thông báo chung.

Không có URL frontend/backend đã deploy trong yêu cầu nên không khẳng định biến môi trường của website đang chạy bị thiếu. Đây là các lỗi/thiếu sót xác nhận trong source. Đã kiểm tra bản build production chạy cục bộ với biến URL thật của backend thử nghiệm.

## Sửa đổi

- `src/socket-config.js`: đọc và chuẩn hóa origin từ biến build, bỏ khoảng trắng và slash gốc; chỉ cho HTTP/HTTPS, không credentials/query/hash/path. Production thiếu biến báo rõ và không tự kết nối frontend:3001. Chặn mixed content. Development vẫn giữ fallback localhost:3001.
- `src/create-room-client.js`: một yêu cầu đang xử lý; ref/closure khóa ngay trước emit, không phụ thuộc thời điểm React render; payload đúng `{name}`. Kiểm tra tên, báo lỗi server/transport/timeout, không buffer gửi khi offline. Snapshot server là nguồn xác nhận thành viên/phòng; ack đến trước snapshot vẫn giữ khóa, ack đến trễ không ghi đè thành công đã nhận. Hủy timer/callback cũ khi disconnect/unmount; rời phòng cho phép tạo lại.
- `src/main.jsx`: nối controller vào session/state và nút Tạo phòng; pending/disabled và dòng trạng thái có aria-live. Chặn Join trong khi Create đang chờ. Thông báo kết nối gợi ý kiểm tra biến build/backend/CORS. Không sửa layout hoặc CSS.
- `tests/create-room-client.test.mjs`: config, validation, click lặp, ack/snapshot hai thứ tự, lỗi/timeout, disconnect/late ack/transport throw, rời/tạo lại.
- `tests/create-room-sockets.test.mjs`: Socket.IO thật với cấu hình production, 100 lần gọi liên tiếp chỉ một request/phòng, mã 6 ký tự, Host/ghế/lobby, rời/tạo lại và lỗi server khi client stale.
- `tests/run-tests.mjs`: đăng ký hai suite mới.
- `CREATE-ROOM-FIX.md`: báo cáo này; `create-room-production.png`: bằng chứng UI production thành công.

Không sửa backend, Socket.IO server, game engine, luật, logo, CSS hoặc hình học bàn/12 ghế. Không cài dependency mới.

## Kiểm thử thực tế

- `npm test`: PASS toàn bộ trong lần chạy cuối. Các suite mới đều qua ngay từ đầu.
- Hai lần hồi quy trước gặp lỗi không ổn định ở suite cũ: một ack timeout trong `game-flow`, một assertion rematch dùng `villagers[0]` như người không phải Host dù phân vai ngẫu nhiên có thể chọn chính Host. Không sửa các phần không liên quan để che lỗi; ghi nhận ở đây.
- `npm run build`: PASS cả khi có và khi thiếu `VITE_SERVER_URL`.
- Production browser preview: build với `VITE_SERVER_URL=http://127.0.0.1:3004`, backend `NODE_ENV=production`, frontend preview cổng 5175. Tạo được phòng J55GVV, người Production Host ở ghế 1/Host, lobby hiện mã và nút Host. Rời và tạo lại được phòng FF792W.
- Tên không hợp lệ báo rõ; sau sửa, console trang production không có error/warn. Kiểm tra thực tế bắt được lỗi context timer trong bản sửa đầu; đã thay timer wrapper và xác minh lại thành công, không để lỗi đó trong bản cuối.
- Production build không có `VITE_SERVER_URL`: báo rõ cần đặt biến rồi build/deploy lại, nút tạo phòng khóa, không kết nối nhầm. Console không có lỗi.
- Test 100-click và lỗi/timeout chạy tự động; không tuyên bố đã gây 100 click vật lý trên trình duyệt.

## Cấu hình khi deploy frontend

Ở dịch vụ **build frontend**, đặt `VITE_SERVER_URL` bằng origin backend HTTPS thật, ví dụ dạng `https://ten-backend.onrender.com` (thay bằng URL thật, không thêm `/socket.io`). Build và deploy lại frontend sau khi đổi biến; đặt biến chỉ ở backend hoặc chỉ sau build không cập nhật bundle Vite.

Backend đặt `CORS_ORIGINS` chứa origin frontend thật như tài liệu `RENDER-DEPLOY.md`. Không nhúng API key/secrets vào `VITE_SERVER_URL`. Chưa kiểm tra một Render service công khai cụ thể vì chưa được cung cấp URL.
