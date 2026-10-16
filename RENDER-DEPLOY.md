# Deploy backend Ma Sói Online lên Render

## Cấu hình Web Service

- Repository: https://github.com/athur1512203/ma-soi-online
- Branch: `main`
- Runtime: Node
- Root Directory: để trống (gốc repository, nơi có `package.json` và `server.js`).
- Build Command: `npm ci --omit=dev`
- Start Command: `npm run server`
- Health Check Path: `/`

`package.json` có `server: node server.js`; không có `start` script nên không dùng `npm start`. Backend là Node HTTP + Socket.IO, không phải Express và không cần biên dịch. Lệnh build trên chỉ cài dependencies runtime theo lockfile. `npm run build` là build **frontend Vite**, không cần chạy trong service chỉ phục vụ backend này.

`server.js` đã đọc `process.env.PORT`, fallback 3001 khi chạy local. Đã sửa listener để bind rõ `0.0.0.0`, không chỉ localhost. Render tự cấp `PORT` (mặc định 10000), không cần đặt tay hoặc dùng PORT frontend. Backend không tự phục vụ thư mục `dist`; URL service `/` trả JSON kiểm tra sức khỏe.

## Environment Variables

| Biến | Giá trị / yêu cầu |
|---|---|
| `NODE_ENV` | Đặt `production` để bảo đảm chạy chế độ production. |
| `CORS_ORIGINS` | Đặt origin HTTPS **thật của frontend**. Ví dụ minh họa `https://frontend.example`; thay bằng domain đã deploy, không nhập nguyên ví dụ. Nhiều origin cách nhau dấu phẩy. Không thêm đường dẫn hoặc dấu `/` cuối. Cần thiết để frontend khác domain kết nối được. |
| `DEV_BOT_TEST` | Đặt `0` hoặc không khai báo; tuyệt đối không dùng entry `server:test` trên Render. `NODE_ENV=production` vẫn khóa công cụ kể cả nếu biến này bị đặt nhầm `1`. |
| `PORT` | Render tự cấp; không bắt buộc khai báo thủ công. |
| `LOBBY_RECONNECT_MS` | Tùy chọn; số mili giây dương. Không đặt thì giữ mặc định 30000ms. Không cần thay cho deployment. |

Không có API key, database URL hoặc secrets bắt buộc cho backend hiện tại. Render inject biến trực tiếp, backend không cần dotenv hoặc upload `.env`.

Ở **dịch vụ build frontend riêng**, cấu hình `VITE_SERVER_URL=https://<backend-thật>.onrender.com` trước khi build frontend. Đây không phải biến bắt buộc của backend và nhiệm vụ này không sửa frontend.

## Bot Test và timer production

Đã kiểm tra cả hai lớp: `server.js` chỉ bật `devTest` nếu cờ test bật và môi trường không phải production; `attachLobby` cũng kiểm tra `NODE_ENV`. Chỉ chế độ development mới đăng ký `dev:test:configure`. Khi production, phòng không nhận preset timer test; giữ thời gian gốc từ `game-config.js`. Không sửa engine, gameplay hoặc giao diện.

## Lưu ý vận hành của source hiện tại

Phòng, session, vai trò và timer nằm trong RAM của một tiến trình. Dùng một instance/một tiến trình backend; deployment/restart sẽ mất phòng và trận đang chạy. Chưa có kho trạng thái dùng chung để scale nhiều instance. Đây là đặc tính hiện có, không được thay đổi trong lần chuẩn bị deploy này.

## Kiểm thử

- `node tests/deployment.test.mjs`: PASS. Chạy child backend với PORT riêng, `NODE_ENV=production`, cố tình `DEV_BOT_TEST=1`; xác nhận bind `0.0.0.0:PORT`, HTTP health JSON, CORS origin cấu hình, từ chối origin lạ, Socket.IO polling/WebSocket, không đăng ký event test, capability test=false và timer nhận vai vẫn là mặc định production.
- `npm test`: PASS sau chạy lại. Lần đầu suite Socket.IO `game-flow` có một ack timeout; không sửa gameplay/test timeout để che lỗi. Lần chạy lại toàn bộ đã qua, smoke test production riêng cũng qua.
- `npm run build`: PASS frontend Vite, không thay source UI.

Các file thay đổi: `server.js` (chỉ listener/log bind), `tests/deployment.test.mjs` (mới), `tests/run-tests.mjs` (đăng ký test), `RENDER-DEPLOY.md` (tài liệu này).

Chỉ chuẩn bị source/cấu hình và push GitHub; chưa tạo hoặc deploy dịch vụ Render.

## Tài liệu đối chiếu

- https://render.com/docs/web-services#port-binding
- https://render.com/docs/environment-variables
