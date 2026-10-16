# Rules 06 — Thắng thua, kết thúc trận và chơi lại

## 1. File đã thêm/sửa

- `game-result.js` (mới): quy tắc thắng/thua, mã phe và lý do kết thúc.
- `game-engine.js`: kiểm tra kết quả tại ranh giới xử lý hiệu ứng; đóng trận một lần, dừng timer, lưu kết quả và danh sách vai trò; thêm mã trận và version tăng xuyên các trận trong phòng.
- `lobby.js`: phát kết quả, đồng bộ reconnect, xác thực mã trận và rematch; giữ phòng/người chơi/ghế/Host khi reset.
- `night-abilities.js`: cho phép trường giao thức `gameId`; luật kỹ năng không thay đổi.
- `src/GameResult.jsx`, `src/game-result.css` (mới): overlay kết quả, danh sách vai trò, nút Host chơi lại và rời phòng.
- `src/main.jsx`: gắn overlay, khóa nền, gửi mã trận, xóa vai trò và dữ liệu riêng khi về lobby; bỏ qua snapshot trận cũ.
- `tests/game-result.test.mjs`, `tests/rematch.test.mjs` (mới): các điều kiện thắng, chuỗi hiệu ứng, bảo mật, reconnect và chơi lại.
- `tests/client-request.mjs` (mới): helper mã hóa yêu cầu theo mã trận như client thật.
- Các suite Socket.IO lobby/roles/game-flow/night-sockets/day-sockets: dùng helper giao thức; giữ các assertion gameplay. `tests/game-engine.test.mjs`: fixture chỉ có Dân dùng timer thật nay phải kết thúc Dân thắng, thay vì lặp mãi.
- `tests/run-tests.mjs`: chạy thêm hai suite Rules 06.
- `RULES-06.md`, `rules-06-result.png`: tài liệu và ảnh kiểm chứng component với fixture 12 người. `dist/` được build lại.

Không sửa `src/style.css`, logo, tọa độ/kích thước bàn hoặc 12 ghế; không thêm dependency. Source hiện dùng Node HTTP + Socket.IO, nên giữ kiến trúc này, không chuyển sang Express. Không thêm Bot Test vào sản phẩm, tài khoản, database, hosting, voice, vai mới hoặc Rules 07. Tài liệu Rules 01–05 giữ nguyên như lịch sử triển khai; phần bổ sung giao thức được mô tả dưới đây.

## 2. Logic thắng thua

Đếm **người hiện còn sống trong phòng trên server**, theo vai thật, không theo bộ thẻ ban đầu. Người đã bị loại hoặc đã rời phòng không được đếm; người tạm mất kết nối còn giữ ghế vẫn được đếm theo Rules 01.

| Sói sống | Dân sống | Kết quả |
|---|---|---|
| 0 | 0 | `DRAW` |
| 0 | ít nhất 1 | `VILLAGE_WIN` |
| ít nhất 1 và >= Dân sống | bất kỳ | `WEREWOLF_WIN` |
| ít nhất 1 và < Dân sống | bất kỳ | `CONTINUE` |

`teamForRole` ánh xạ vai `werewolf` sang phe kết quả `werewolf`, mọi vai còn lại sang `village`. Catalog và phân vai riêng cũ vẫn dùng tên nội bộ `wolves`; không đổi luật đêm hay API vai trò của Rules 02. Cupid và hai người yêu giữ phe gốc, không tạo phe thứ ba. Kẻ Ngốc sống sót vẫn được tính là một Dân sống. Già Làng còn chống chịu không bị tính là đã chết.

## 3. Thời điểm kiểm tra

Dùng điểm cuối hàm xử lý hậu quả `aftermath`, sau khi đã giải quyết liên kết Cupid, các lượt Thợ Săn và trăn trối của Rules 05:

- Đêm được tổng hợp và công bố bình minh như trước; sau `day_start`, giải quyết Thợ Săn nếu có, rồi kiểm tra **trước khi mở `day_discussion`**.
- Ban ngày giữ màn hình `day_result`, xử lý Thợ Săn và toàn bộ trăn trối, rồi kiểm tra **trước khi vào `next_night`**. Bao gồm cả kết quả Tha hoặc không có đề cử.
- Thợ Săn bắn, bỏ qua hoặc hết giờ đều tiếp tục cùng hàng đợi; không kiểm tra giữa lượt bắn hoặc giữa chuỗi tử vong. Nếu không còn mục tiêu sống, lượt bắn không khả dụng được bỏ qua.
- Không kiểm tra trong lúc chọn mục tiêu, đề cử, biện hộ hay phán quyết đang mở.

Ví dụ kiểm thử: Sói cuối cùng bị độc, Thợ Săn bị Sói cắn; chưa công bố Dân thắng. Thợ Săn bắn một người trong cặp Cupid và làm hai Dân cuối chết, kết quả cuối cùng là Hòa. Các lượt trăn trối ban ngày vẫn được giữ trước màn hình kết thúc.

## 4. Game over

Public/private game snapshot có `gameId`, `phase:'game_over'`, `stepEndsAt:null`, và:

```javascript
result: {
  gameId,
  winner: 'VILLAGE_WIN', // WEREWOLF_WIN / DRAW
  reason: 'all_werewolves_eliminated', // werewolves_control_village / no_survivors
  endedAt, // thời gian server, milliseconds
  dayNumber, nightNumber,
  aliveWolves, aliveVillagers,
  players: [{id, name, seatIndex, role, team, alive}]
}
```

`room.status` thành `finished`. Kết quả được chốt đúng một lần. Engine hủy timer hiện tại, callback cũ bị chặn bằng version/phase và dispose khi reset. Sau game over không còn bỏ phiếu, kỹ năng, chat hoặc chuyển ngày/đêm. Không có socket để client đặt kết quả.

Trước kết thúc, `result:null` và không gửi danh sách vai trò. Kết quả chỉ có serializer liệt kê trường được phép, không chứa token, session, socket, mục tiêu kỹ năng hoặc kho dữ liệu nội bộ. Danh sách lưu người tham gia từ đầu trận; người đã rời phòng được ghi không còn sống trong trận. Reconnect nhận lại kết quả đã chốt qua snapshot, không tính lại và không phát thêm finish event.

## 5. Giao diện

Overlay riêng giữ phong cách tối hiện tại, không đổi nền/bàn/ghế/logo của giao diện chính. Hiển thị đúng ba tiêu đề và phụ đề đã chốt, số ngày/đêm, bảng người chơi theo số ghế, vai thật, phe và trạng thái. Danh sách cuộn khi dài, các nút vẫn hiển thị.

Chỉ Host có nút **Chơi lại** khả dụng; người khác thấy **Đang chờ Host tổ chức trận mới**. Mọi thành viên có **Rời phòng**. Mất kết nối khóa thao tác. Overlay là dialog có focus và giữ Tab bên trong; nền được đặt `inert`/`aria-hidden`, portal nằm ngoài nền đó.

Đã kiểm tra trực quan component thật với fixture 12 người cho Dân thắng, Sói thắng/người thường không được chơi lại, và Hòa. Ảnh `rules-06-result.png` là fixture giao diện; xử lý trận thật/reconnect/rematch được kiểm tra bằng Socket.IO trong suite riêng. Trang fixture và Vite kiểm tra tạm đã được dọn.

## 6. Rematch

Host gửi yêu cầu sau game over. Server xác thực Host hiện tại, thành viên, mã trận, phase/status và payload trước khi commit đồng bộ:

1. Dispose engine cũ, bỏ tham chiếu engine và Map phân vai.
2. Đặt `status:'waiting'`, tạo UUID `gameId` mới và tăng `gameVersion`.
3. Xóa chat trận, đặt tất cả người còn trong phòng sống và `ready:false`.
4. Giữ mã phòng, danh tính/token, Host và ghế; giữ bộ thẻ để Host có thể sửa theo Rules 02. Bộ mặc định vẫn tự khớp số người nếu trước đó chưa tùy chỉnh.
5. Đồng bộ lobby, xóa vai trò và dữ liệu riêng trên client. Không tự bắt đầu.
6. Khi đủ Ready/kết nối/bộ thẻ hợp lệ, handler start cũ phân lại bằng Fisher–Yates và tạo engine hoàn toàn mới.

Engine mới tạo mới toàn bộ thuốc, lịch bảo vệ, phiếu Sói, kết quả soi, cặp Cupid, chống chịu Già Làng, Kẻ Ngốc, Thợ Săn, đề cử/phán quyết, biện hộ, trăn trối/hàng đợi, timer, số ngày/đêm và kết quả. Một lần phân ngẫu nhiên mới không bắt buộc mỗi cá nhân phải nhận vai khác trận trước.

`phaseVersion` tiếp tục tăng trong cùng phòng để chống lặp kể cả ở cấp engine. `gameId` chặn yêu cầu mạng từ trận cũ dù client đoán được version. Hai yêu cầu rematch đồng thời cùng mã cũ chỉ có một yêu cầu thành công; mã mới và `waiting` ngăn reset lần hai.

## 7. Socket.IO và mã trận

| Event | Hướng / dữ liệu |
|---|---|
| `game:finished` | Server → thành viên đang kết nối; result đã chốt, phát một lần |
| `game:rematch-request` | Client → server `{gameId}`; chỉ Host sau game over |
| `game:rematch-started` | Server → thành viên `{roomCode,gameId,gameVersion,phase:'lobby'}` |
| `state`, `room:updated` | Giữ sự kiện cũ; thêm `gameId`, `gameVersion`; `game:null` khi về lobby |
| `game:state`, `game:state-request` | Giữ đồng bộ riêng, nay có result sau kết thúc |

Không cần thêm event `game:result`: result đã có trong snapshot và `game:finished`. Client gửi `game:finished` hoặc `game:result` bị từ chối, không thể tự công bố chiến thắng.

Tất cả yêu cầu gameplay phải có `gameId` hiện tại, ngoài `phaseVersion` và payload vốn có. `chat:public` ở mọi lượt nay gửi `{gameId,phaseVersion,text}`; nội dung/quyền/thời hạn không đổi. Sau rematch, các yêu cầu Ready/start/cấu hình/rời phòng cũng bắt buộc mã hiện tại để chặn gói cũ làm ảnh hưởng lobby mới. Client chính thức tự gắn mã này. Game snapshot từ mã khác bị client bỏ qua; đổi mã hoặc về lobby xóa state riêng cũ. Getter chỉ đọc không làm thay đổi trận.

## 8. Kết quả kiểm thử và build

- `npm test`: **PASS** toàn bộ Rules 01–06 và CORS.
- `npm run build`: **PASS** production Vite build.
- 9 trường hợp số lượng yêu cầu đã kiểm tra ở cả hàm thắng và engine; test dùng thêm Sói ban đầu đã chết để chứng minh không dựa trên bộ thẻ ban đầu.
- Kiểm tra chuỗi Thợ Săn/Cupid đổi kết quả, timeout Thợ Săn, trăn trối còn chờ, Kẻ Ngốc sống sót, chống chịu Già Làng và Tha sau khi Sói rời trận.
- Kiểm tra không lộ vai trước kết thúc, công khai vai sau kết thúc, kết quả ổn định, không timer/chuyển phase/hành động sau kết thúc và phát `game:finished` đúng một lần.
- Socket.IO thực kiểm tra reconnect nhận kết quả; người ngoài/người thường/rematch sớm bị từ chối; rematch lặp chỉ nhận một; giữ phòng/Host/ghế, reset Ready/sống/chat/phân vai và toàn bộ dữ liệu engine mới; phân lại đúng bộ thẻ; Cupid và thuốc được dùng lại; gói và callback trận cũ không tác động trận mới.
- Các test và client mô phỏng chỉ nằm trong thư mục `tests`, không thêm bot hay nút test vào sản phẩm.

## 9. Tình huống đặc biệt

- Không còn Sói và không còn Dân → Hòa, ưu tiên trước Dân thắng.
- Sói ngang Dân → Sói thắng ngay tại điểm kiểm tra hợp lệ, không cần giết hết Dân.
- Người yêu khác phe không thay đổi cách đếm hoặc tạo chiến thắng riêng.
- Thợ Săn chưa hành động không làm kết thúc sớm; bắn/timeout đều đưa về cùng đường kiểm tra.
- Không bỏ qua trăn trối của Rules 05 dù kết quả có vẻ đã rõ.
- Kẻ Ngốc sống và mất quyền bỏ phiếu vẫn là Dân sống; Già Làng chịu đòn đầu vẫn là Dân sống.
- Reconnect hoặc Host chuyển theo Rules 01 không tính lại kết quả đã chốt. Phòng trống vẫn bị dọn như cũ.
- Chỉ lưu RAM như các Rules trước; khởi động lại server làm mất phòng/trận.

## 10. Hướng dẫn test trận hoàn chỉnh

1. Chạy `npm run server` và `npm run dev` ở hai terminal; mở URL Vite.
2. Tạo phòng rồi dùng 6–12 tab có session riêng tham gia cùng mã. Người thường bấm Sẵn sàng, Host chỉnh bộ thẻ nếu cần và bắt đầu.
3. Kiểm tra mỗi tab chỉ thấy vai của mình. Thực hiện các lượt đêm theo Rules 04; đến ngày, đề cử, biện hộ và phán quyết theo Rules 05. Không thao tác thì server chạy theo deadline.
4. Để Dân thắng: loại hết Sói, vẫn giữ một Dân. Để Sói thắng: đạt số Sói sống >= Dân sống. Kiểm tra chuỗi Thợ Săn/Cupid được hoàn tất trước kết quả. Trường hợp cả hai phe cùng hết được kiểm tra nhanh bằng suite tự động.
5. Kiểm tra overlay, vai thật/phe/trạng thái, số ngày/đêm; tải lại một tab để kiểm tra kết quả giữ nguyên. Thử thao tác gameplay phải bị từ chối.
6. Người thường không bấm Chơi lại được. Host bấm Chơi lại: mã phòng và ghế giữ nguyên, mọi người sống/chưa Ready, vai cũ biến mất. Bật Ready lại, sửa bộ thẻ nếu cần và bắt đầu trận mới.
7. Chạy `npm test` để kiểm chứng cả các chuỗi hiếm và gói trễ mà thao tác tay khó tái hiện.
