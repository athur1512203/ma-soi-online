# Dark Forest Gothic — báo cáo thay đổi giao diện

## File đã thêm/sửa

CSS:
- `src/theme.css` (mới): bảng màu bắt buộc, RGB dùng cho độ trong suốt, màu nhận diện phép thuật và transition 180ms.
- `src/forest-theme.css` (mới): trang trí theme, hover/focus/secondary/danger, viền người phát biểu và màu nhận diện vai/kỹ năng.
- `src/style.css`: nền, header, bàn, ghế, panel, chat, lobby và controls dùng token; không sửa các khai báo hình học bàn/ghế hoặc media query kích thước cũ.
- `src/role-settings.css`: modal, dòng bộ thẻ, cảnh báo, nút và backdrop dùng token.
- `src/game-flow.css`: overlay đêm, timer, các lượt ngày/đêm, private notes và controls dùng token.
- `src/game-result.css`: kết quả và bảng vai trò dùng token.
- `src/dev-bots.css`: đồng bộ công cụ development với theme.

JSX (chỉ dữ liệu trình bày/class/style hook, không sửa handler game):
- `src/main.jsx`: import theme; thêm hook vai trò, tin nhắn hệ thống, nút phụ/nguy hiểm và viền ghế người đang biện hộ/trăn trối. Không sửa công thức tọa độ ghế, Socket.IO hoặc validation.
- `src/NightAction.jsx`: hook loại kỹ năng và nút bỏ qua secondary.
- `src/GameFlow.jsx`: hook danger cho Treo cổ.
- `src/GameResult.jsx`: hook phe thắng và nút rời phòng danger.
- `src/RoleSettings.jsx`: hook secondary cho Khôi phục mặc định.
- `src/DevBots.jsx`: hook màu các nút xóa/reset.

`dist/` được tạo lại bằng build. Không cài thư viện mới.

## Màu và thành phần

Dùng nền #08130E, nền phụ #0D1E15, panel #12291D, primary #1E4930, hover #397A50, border #345540, gold #C3A66C, chữ #E8EDE5/#A4B5A8 và danger #A63D40. Gradient chỉ nhẹ giữa các màu rừng. Bàn có viền rêu và vòng vàng đồng mờ; ghế hover ánh rêu, ghế đang biện hộ/trăn trối viền vàng. Nền đêm xanh đen, kỹ năng Sói giữ đỏ, nhận diện mặt trăng/phép thuật giữ màu riêng.

Chat người chơi và thông báo được phân biệt bằng khung/nền: message hệ thống có hook `system:true` hoặc `type:'system'`; thông báo phase/loại người hiện có vẫn ở vị trí gameplay và được tô vàng. Không tạo hoặc sửa dữ liệu chat server. Input, scrollbar, modal, danh sách kết quả và dev panel đều dùng token.

Nút primary xanh, secondary trong suốt viền vàng, danger đỏ trầm; hover/focus/transition 180ms. Riêng chữ nút hover dùng trắng để đạt tương phản trên #397A50, chữ bình thường vẫn là #E8EDE5. Giữ animation wake/sleep hiện có, không thêm animation nặng.

## Giữ nguyên

- Hình tròn, kích thước bàn ở các breakpoint, 12 ghế và tọa độ `50 + 43*cos/sin(angle)`.
- File SVG logo và nội dung vai trò/kỹ năng.
- Backend, Socket.IO, engine, luật, timer, dữ liệu, validation, gửi/nhận chat và hành vi nút.
- Đã đối chiếu SHA256 của `lobby.js`, `server.js`, `game-engine.js`, `night-abilities.js`, `game-config.js` và logo: không đổi.

## Kiểm thử thực tế

- `npm test`: PASS toàn bộ suite hồi quy hiện tại, gồm Rules 01–06, bảo mật Bot Test và CORS.
- `npm run build`: PASS, 63 modules; không cảnh báo/lỗi CSS từ Vite.
- Kiểm tra tất cả tham chiếu CSS variables có token: PASS.
- Kiểm tra các chuỗi kích thước bàn và công thức ghế giữ nguyên: PASS.
- Trình duyệt desktop: tạo phòng, mở modal, tăng vai/khôi phục, lưu bộ thẻ, bắt đầu, nhìn thấy vai thật của mình và chat/phase hoạt động với 11 Bot. Ván kết thúc sau 5 ngày/5 đêm; overlay kết quả đúng theme. Chơi lại và Rời phòng hoạt động.
- Console trang kiểm thử: không có error/warn.
- Mobile viewport 390×844: modal rộng 366px, không tràn ngang bên trong. Reset viewport sau kiểm tra.
- Tương phản cặp màu chính: text/panel 12.99:1; muted/panel 7.17:1; gold/panel 6.61:1; text/primary 8.62:1; chữ trắng/hover 5.16:1; text/danger 5.26:1. Các cặp này vượt 4.5:1. Không tuyên bố đã audit WCAG toàn ứng dụng hoặc các trạng thái disabled.
- Ảnh thực tế: `forest-lobby.png`, `forest-modal.png`, `forest-result.png`. Đã dọn các tiến trình/các tab kiểm thử do agent mở, không đụng tiến trình có sẵn.

## Vấn đề còn tồn tại

Frontend cũ đặt `body{min-width:1100px}` và grid nhiều cột. Bàn trên điện thoại vẫn cần cuộn ngang; đây là giới hạn có sẵn, giữ nguyên để không đổi kích thước/tọa độ bàn trong nhiệm vụ này. Modal và các breakpoint sẵn có tiếp tục giữ hoạt động; chưa chuyển toàn ứng dụng thành bố cục mobile mới.

Font Cinzel/Inter vẫn tải từ Google Fonts như trước; khi mạng chặn, font fallback vẫn dùng được. Không phát hiện lỗi gameplay hoặc console mới trong phạm vi kiểm tra.
