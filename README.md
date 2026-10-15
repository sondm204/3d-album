# Album kỷ niệm 3D

Trang hiển thị một cuốn album trên nền xanh trầm. Form chỉ xuất hiện khi bấm ảnh hoặc khung thêm kỷ niệm; không có thanh điều khiển bên ngoài album.

## Chạy

```bash
pnpm install
pnpm dev
```

Mở http://localhost:3000. Dùng `pnpm build` và `pnpm start` cho bản production.

## Thao tác trực tiếp

- Cuộn chuột trên cuốn album để phóng to hoặc thu nhỏ.
- Kéo phần giữa trang hoặc gáy để xoay cả cuốn album.
- Kéo mép hoặc góc ngoài bên phải sang trái để lật tiếp; kéo bên trái sang phải để lật lại.
- Trang bám theo chuyển động kéo. Thả trước giữa chừng sẽ trả trang về; kéo qua giữa hoặc vuốt nhanh sẽ lật tiếp. Kéo ngược trước khi thả sẽ hủy lật.
- Nhấp mép ngoài cũng lật một trang.
- Bấm khung nét đứt cuối album để mở form thêm ảnh, tiêu đề, lời nhắn và ngày. Album luôn chừa một ô thêm mới, kể cả khi số ảnh chẵn.
- Bấm phần giữa ảnh để mở form xem/sửa/xóa. Kéo ảnh vẫn xoay album; mép ngoài dành cho lật trang. Hover nâng nhẹ khung ảnh và hiện gợi ý chỉnh sửa.
- Ở trang đầu, kéo mép trái sang phải để gập album; kéo mép phải của bìa sang trái để mở lại trang đầu.
- Ở trang cuối, kéo mép phải sang trái để gập album; kéo mép trái của bìa sang phải để mở lại trang cuối.
- Thả sớm hoặc nhấn Esc để hủy gập/mở bìa. Cả hai thao tác cũng hoạt động trong album chỉ có một cặp trang.
- Chạm kéo để thao tác trên điện thoại; hai ngón tay để thu/phóng.
- Nhấp đúp phần giữa album để đặt lại góc nhìn.
- Hỗ trợ bàn phím khi album được focus: ← / → để lật, + / − để thu/phóng, Home để đặt lại, Esc để hủy lật.
- Enter mở ảnh trái, Shift + Enter mở ảnh phải. Trong form, Tab chuyển trường và Esc đóng form khi không đang lưu.

## Hiển thị và dữ liệu

Mỗi trang có ảnh, lời nhắn và ngày. Giấy có hai mặt, độ dày, lưới 48 × 16, độ cong theo vị trí kéo và bóng đổ động. Chuyển động khi thả sử dụng lò xo giảm chấn; thiết lập giảm chuyển động của hệ điều hành được áp dụng khi tự hoàn tất trang.

Album tải dữ liệu thực qua `GET /api/memories`. Route dùng `lib/supabase-memories.ts` ở phía server để đọc Supabase; trình duyệt nhận ảnh, lời nhắn và ngày qua `lib/memories.ts`. Không dùng dữ liệu mẫu hoặc localStorage làm nguồn thay thế. Trạng thái đang tải, trống và lỗi được in ngay trên trang album.

Cấu hình trong `.env.local` (không commit file này):

- `SUPABASE_URL`: URL dự án Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: khóa chỉ dùng phía server, không đặt tiền tố `NEXT_PUBLIC_`.
- `SUPABASE_MEMORIES_TABLE`: tên bảng, mặc định `memories`.
- `SUPABASE_STORAGE_BUCKET`: bucket ảnh public, mặc định `memories`.

Bảng dùng các cột `id`, `title`, `note`, `date`, `image_path`, `created_at`. `image_path` là đường dẫn tương đối trong bucket. Kỷ niệm được xếp tăng dần theo `date`, `created_at`, rồi `id`; mỗi kỷ niệm chiếm một trang. API trả mảng `{ id, title, note, date, image, createdAt }` và không cache để lần tải trang sau nhận dữ liệu mới. Ảnh Storage được tải với CORS để hiển thị trong texture WebGL.

Form sử dụng `saveMemory`, `updateMemory`, `deleteMemory` trong `lib/memories.ts`. Contract API: `POST /api/memories` nhận multipart (`id`, `title`, `note`, `date`, `image`); `PUT /api/memories/[id]` nhận JSON (`title`, `note`, `date`) hoặc multipart có thêm `image`; `DELETE /api/memories/[id]` trả 204. Sửa có thể giữ ảnh gốc, cắt lại ảnh hiện tại hoặc thay ảnh mới. Ảnh mới được upload với đường dẫn riêng; sau khi cập nhật bản ghi thành công mới dọn ảnh cũ. Xóa cần xác nhận trong form. Ảnh tải lên nhận JPG, PNG, WebP tối đa 10 MB; tiêu đề 120 ký tự và note 1200 ký tự. Note dài rút gọn trên giấy và đọc đầy đủ trong form.

Theo lựa chọn của chủ album, các API tạo/sửa/xóa cho phép truy cập không cần đăng nhập. Khóa service-role vẫn chỉ được dùng phía server. Kiểm thử CRUD dùng store giả lập, không thêm/sửa/xóa dữ liệu Supabase thật.

Nếu WebGL không khả dụng, website hiển thị một album ảnh 2D có thể kéo lật và cuộn để thu/phóng.

## Mã nguồn

Giao diện form dùng shadcn/ui (Radix, preset Nova). Các component dùng chung nằm trong `components/ui`; cấu hình registry nằm ở `components.json`. `memory-form.tsx` sử dụng Dialog, AlertDialog, Input, Textarea, Label, Button và Alert; Tailwind v4 được biên dịch qua `postcss.config.mjs`. Không còn dùng CSS Module riêng cho form.

Tên kỷ niệm và lời nhắn dùng Noto Sans tự lưu trữ với bộ ký tự tiếng Việt. Canvas vẽ lại khi font tải xong và chuẩn hóa Unicode NFC trước khi hiển thị. `loadMemories` tự sắp xếp tăng dần theo ngày, sau đó thời gian tạo và ID khi trùng ngày.

Khi thêm ảnh, `react-easy-crop` cho kéo và phóng to trong khung tỷ lệ 628:516. Lưu kỷ niệm sẽ xuất riêng vùng cắt thành JPEG, tối đa 1256 × 1032 px, rồi tải lên Supabase. Trong form sửa có thể chọn ảnh khác hoặc bấm Cắt lại ảnh hiện tại. Giữ ảnh cũ sẽ hủy thay đổi ảnh và chỉ lưu thông tin.

- `album-scene.tsx`: mô hình, vật liệu giấy, ánh sáng và vòng lặp chuyển động.
- `album-interaction.ts`: bắt chuột/cảm ứng, chiếu tọa độ vào album, phân biệt xoay với lật trang.
- `page-geometry.ts`: hình học giấy hai mặt, biến dạng, ánh xạ con trỏ và chuyển động thả trang.
- `page-texture.ts`: bố cục ảnh, lời nhắn và ngày trên giấy.

Các file trên nằm trong `app/components`.

## Kiểm tra

Với Node.js 22.18 trở lên:

```bash
node --experimental-strip-types --test tests/memory-api.test.mjs tests/memories.test.mjs tests/page-geometry.test.mjs tests/album-interaction.test.mjs tests/photo-crop.test.mjs tests/supabase-update.test.mjs
pnpm build
```

41 kiểm tra tự động xác minh dữ liệu trả về, CRUD không cần đăng nhập với store giả lập, lỗi validation, trang thêm mới, bấm/hover ảnh, tải lỗi, dữ liệu trống, hủy request, hình học, chiều ảnh, chuyển động thả, tọa độ khi album đã xoay, giới hạn trang, chuột, hủy kéo, pinch, gập từ hai đầu album và mở lại đúng trang. Đây là kiểm tra logic và sự kiện, chưa thay thế kiểm tra trực quan WebGL trên trình duyệt.
