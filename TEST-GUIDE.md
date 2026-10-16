# TEST-GUIDE — Chơi localhost với 11 Bot

## Khởi động trên Windows PowerShell

Mở terminal thứ nhất:

```powershell
cd "C:\Users\PC\OneDrive\Desktop\ma-soi-web"
npm install
npm run server:test
```

Mở terminal thứ hai:

```powershell
cd "C:\Users\PC\OneDrive\Desktop\ma-soi-web"
npm run dev
```

Mở **http://localhost:5173/** (hoặc cổng Vite in ra nếu 5173 đã bận). Backend mặc định **http://localhost:3001/**. Dùng hostname `localhost` hoặc `127.0.0.1`; công cụ không hiển thị trên hostname khác.

Nếu cổng backend đã bị một server cũ chiếm, dừng đúng terminal cũ bằng Ctrl+C, rồi chạy `server:test` lại. Không dùng nhầm backend chưa bật chế độ test. Có thể dùng cổng riêng:

```powershell
# Terminal backend
$env:PORT='3004'
npm run server:test
```

```powershell
# Terminal frontend
$env:VITE_SERVER_URL='http://127.0.0.1:3004'
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Khi đó mở **http://127.0.0.1:5175/**. Các biến môi trường PowerShell chỉ có hiệu lực trong terminal tương ứng. Nếu `NODE_ENV` đang là `production`, dùng một terminal development mới hoặc `Remove-Item Env:NODE_ENV` trước khi chạy server test.

## Chơi một ván

1. Điền tên, bấm **Tạo phòng** để trở thành Host.
2. Mở bảng nhỏ **DEV · Bot Test** góc phải dưới.
3. Chọn tốc độ và seed nếu muốn, rồi bấm **Thêm 11 Bot**. Chờ số Bot là **11/11** và nút **Bắt đầu trận** khả dụng.
4. Bot tự Ready. Host mở **Thiết lập vai trò** nếu cần; bộ mặc định 12 người đã hợp lệ và có đủ các vai.
5. Bấm **Bắt đầu trận**. Bạn nhận vai ngẫu nhiên bình thường; công cụ không chọn hoặc tiết lộ vai cho bạn.
6. Ban đêm tự thao tác khi có form kỹ năng của mình. Bot khác chỉ hành động khi server cho quyền. Ban ngày chat, đề cử, biện hộ hoặc phán quyết như Rules 05.
7. Khi đạt điều kiện thắng, overlay Rules 06 xuất hiện. Bấm **Chơi lại**: cùng phòng/ghế, phân vai cũ bị xóa; Bot tự Ready lại. Host vẫn phải tự bắt đầu trận mới.

Bot là chiến thuật đơn giản, không phải đối thủ AI thông minh: chọn ngẫu nhiên hợp lệ; các Sói dùng cùng quy tắc chọn mục tiêu hợp lệ; Tiên Tri chỉ dùng kết quả soi của chính mình. Bot không nhìn vai hay kỹ năng của người khác.

## Điều khiển

- **Thêm 11 Bot:** mở các Socket.IO client độc lập, mỗi Bot một UUID/session. Nếu phòng đã có người khác, chỉ thêm đến đủ 12 ghế. Chỉ dùng trước khi bắt đầu.
- **Xóa Bot:** từng Bot gửi `room:leave`, sau đó đóng kết nối. Không xóa người thật; nên dùng ở lobby hoặc sau trận.
- **Bot tự động:** tắt/bật việc gửi hành động. Không dừng đồng hồ server; hành động đã gửi không thể thu hồi.
- **Tốc độ kiểm thử:** 0.5× chậm gấp đôi, 1× mặc định test, 2× và 5× nhanh hơn. Chỉ chỉnh ở lobby, áp dụng trận tiếp theo trong phòng này; timer production và phòng khác không bị đổi.
- **Seed Bot:** đổi trước khi thêm Bot. Muốn đổi seed sau đó, xóa rồi thêm Bot lại.
- **Log sự kiện:** 100 dòng gần nhất gồm tên Bot, phase, tên event và OK/FAIL. Không ghi token, session, lựa chọn phiếu, cặp đôi hoặc kết quả soi.
- **Reset phòng test:** Bot rời phòng, Host rời và tạo phòng mới. Mã phòng sẽ đổi. Khác với **Chơi lại**, thao tác này dùng để bỏ ván thử hiện tại và làm lại từ đầu.

Bot chạy trong tab Host, không phải tiến trình nền. Đóng tab/F5 hoặc HMR khi sửa source sẽ ngắt các kết nối Bot; ghế có thể được giữ tối đa 30 giây theo Rules 01. Dùng **Reset phòng test**, hoặc chờ ghế hết hạn rồi thêm Bot lại. Mất mạng tạm thời không tải lại trang dùng cơ chế reconnect Socket.IO bình thường; kiểm thử tự động có kiểm tra Bot reconnect và giữ danh tính/kết quả.

## Timer test 1×

| Giai đoạn | Thời gian |
|---|---:|
| Nhận vai | 5 giây |
| Giới thiệu đêm / thông báo người yêu / tổng hợp đêm / giới thiệu ngày | 1 giây |
| Cupid, Bảo Vệ, Tiên Tri, Sói, Phù Thủy | 5 giây |
| Thảo luận | 10 giây |
| Đề cử mỗi lượt | 10 giây |
| Biện hộ | 5 giây |
| Phán quyết | 10 giây |
| Kết quả ngày / chuẩn bị đêm | 1 giây |
| Thợ Săn / trăn trối mỗi người | 5 giây |

Bot phản ứng sau khoảng 350 ms, nên lượt kỹ năng chỉ có Bot có thể kết thúc sớm theo engine cũ. Lượt có bạn vẫn chờ bạn hoặc hết giờ. Chọn **0.5×** nếu cần nhiều thời gian thao tác.

## Kiểm thử tự động

```powershell
npm test
npm run test:bots
npm run test:game
npm run build
```

- `npm test`: 12 suite hồi quy backend, Rules 01–06, CORS và 10 kiểm tra bảo mật/cấu hình công cụ development.
- `npm run test:bots`: server Node/Socket.IO thật trên cổng localhost ngẫu nhiên, 12 client độc lập, 8 seed; seed đầu chơi thêm một trận rematch, tổng mặc định 9 trận. Không cần mở frontend hoặc backend thủ công.
- `npm run test:game`: chạy `npm test`, sau đó `npm run test:bots`.
- `npm run build`: build production. Bundle production không chứa bảng hoặc mã điều khiển Bot.

Đổi số seed và chuỗi seed:

```powershell
$env:BOT_GAMES='20'
$env:BOT_SEED='loi-can-tai-hien'
npm run test:bots
```

Báo cáo **bot-test-report.json** được ghi lại sau mỗi lần chạy: số PASS/FAIL, số trận Dân/Sói/Hòa, số rematch/reconnect, phase đã đi qua, timeout/rò rỉ và log đã lọc. Trận không kết thúc trong 15 giây, vượt 30 đêm hoặc một phase không tiến triển trong 3 giây ở timer tự động sẽ FAIL, trả exit code khác 0 và lưu log/snapshot để điều tra. Đây là giới hạn riêng của harness nhanh, không áp dụng cho ván chơi tay.

Seed tái hiện bộ sinh ngẫu nhiên của **Bot**, không thay bộ xáo bài crypto của server. Do đó cùng seed có thể nhận bộ phân vai khác và diễn tiến khác; seed không bảo đảm phát lại chính xác toàn bộ ván. Báo cáo lưu vai **sau game over** cùng các event/mã trận để đối chiếu; không tự gán vai hoặc đọc Map server để ép ván lặp lại. Những tình huống hiếm như Hòa cuối trận, Kẻ Ngốc, Thợ Săn và chuỗi Cupid có kiểm thử xác định riêng trong bộ Rules 01–06.

## Bảo mật và production

`npm run server:test` bật `DEV_BOT_TEST=1` trong tiến trình development. Socket cấu hình timer chỉ được đăng ký khi cờ này bật và không phải production; yêu cầu phải từ Host, đúng mã trận, địa chỉ loopback và origin localhost. Chỉ chỉnh trước trận. Không có HTTP endpoint điều khiển Bot; các Bot dùng event game hiện có, chịu đầy đủ kiểm tra của server.

`npm run server` mặc định không bật công cụ test. `NODE_ENV=production` vô hiệu hóa công cụ ngay cả khi bật nhầm cờ. Frontend dùng `import.meta.env.DEV` và hostname localhost để loại hẳn import Bot khỏi bản build production. Không sửa luật hoặc timer production của Rules 01–06.
