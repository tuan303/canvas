# Ngân hàng câu hỏi Canvas — Trường TH, THCS & THPT Ngôi Sao Hoàng Mai

Công cụ web giúp giáo viên đưa câu hỏi từ **file Word / Excel theo mẫu của trường** (và gói **SCORM** do
skill `tao-de-scorm` tạo) vào **ngân hàng câu hỏi Canvas** bằng **một lần import gói QTI 1.2 (.zip)**,
thay cho việc gõ tay từng câu.

- Đọc đủ 10 loại câu: một đáp án, nhiều đáp án, Đúng/Sai nhiều ý (kiểu THPT 2025), trả lời ngắn, điền số,
  điền khuyết, chọn từ danh sách, ghép nối, tự luận, đoạn thông tin.
- Giữ công thức (Office Math trong Word, `$LaTeX$` trong Excel/Word → MathML), ảnh, bảng, đoạn dẫn, lời giải.
- Kiểm tra từng câu trước khi xuất (thiếu đáp án, thiếu ảnh, công thức MathType cũ…) và chỉ rõ dòng/câu cần sửa.
- Xuất gói cho **Item Bank (New Quizzes)** hoặc **Question Bank (Classic Quizzes)**.
- Tuỳ chọn: **gửi thẳng lên Canvas** qua API (cần máy chủ trung gian và cấu hình của quản trị Canvas).

HTML/JS thuần, **không build, không npm, không thư viện ngoài**. Mọi xử lý file chạy ngay trong trình duyệt
của giáo viên — đề thi không gửi đi đâu (trừ khi bấm "Gửi thẳng lên Canvas").

## Cách dùng

### 1. Mở công cụ
| Cách | Làm gì | Có "Gửi thẳng lên Canvas"? |
|---|---|---|
| Mở trực tiếp | Nhấp đúp `index.html` (Chrome / Edge / Safari mới) | Không |
| Chạy trên máy | `node server.js` rồi mở <http://localhost:8787> (Node ≥ 18) | Có, nếu có file `.env` |
| Trên web | Deploy lên Vercel (xem dưới) | Có, nếu đặt biến môi trường |

### 2. Ba bước trên giao diện
1. **Nạp đề**: kéo thả `.docx`, `.xlsx`, gói SCORM `.zip`, ảnh rời hoặc zip ảnh (cho Excel có cột `Ảnh`).
   Nút **Tải mẫu Word / Excel** và **Hướng dẫn** (`huong-dan.html`) ở ngay đầu trang.
2. **Soát câu hỏi**: xem từng câu như học sinh thấy, đáp án đúng tô xanh, sửa tên ngân hàng / điểm, bỏ chọn câu
   không muốn xuất. Câu có lỗi (đỏ) **không được xuất** — sửa file rồi nạp lại.
3. **Xuất**: chọn đích, cách xử lý câu Đúng/Sai, đoạn dẫn, công thức → **Tải gói QTI**, rồi import theo hướng dẫn
   hiện ngay dưới nút:
   - **Item Bank – New Quizzes** (khuyên dùng, mặc định): mỗi ngân hàng một file `.zip`.
     Canvas → khoá học → **Ngân Hàng Câu Hỏi (Item Banks)** → tạo ngân hàng → mở ngân hàng **còn trống** →
     ⋮ → **Import Content** → chọn file. Item Bank không ghi đè: muốn cập nhật thì nhập vào ngân hàng trống mới.
   - **Question Bank – Classic**: một file `…_classic.zip` cho mọi ngân hàng.
     **Cài Đặt → Nhập Nội Dung Khóa Học → Tập tin .zip QTI** (Settings → Import Course Content → QTI .zip file),
     **không** đánh dấu "Convert content to New Quizzes". Nhập lại bản sửa: đánh dấu **"Overwrite assessment
     content with matching IDs"** để cập nhật đúng ngân hàng/câu cũ thay vì tạo ngân hàng trùng tên.

### 3. Soạn đề theo mẫu
- `mau/Mau-ngan-hang-cau-hoi.docx`: phần hướng dẫn (trước dòng `NGÂN HÀNG:`) + ví dụ mọi loại câu.
  Quy ước chính: `NGÂN HÀNG: <tên>`, `Câu 1.`, phương án `A.`–`H.`, `Đáp án: B` (hoặc gạch chân / tô đỏ nhãn đúng),
  ý `a)`–`d)` cho câu Đúng/Sai, `[[Hà Nội]]` ô điền, `[[*đúng|sai]]` ô chọn, `trái => phải` ghép nối,
  `Lời giải:` … Chi tiết: `DESIGN.md §3`, trang `huong-dan.html`.
- `mau/Mau-ngan-hang-cau-hoi.xlsx`: mỗi dòng một câu, cột theo tên tiêu đề (`Loại câu`, `Nội dung câu hỏi`,
  `A`…`H`, `Đáp án`, `Điểm`, `Lời giải`, `Ngân hàng`, `Mức độ`…). Chi tiết: `DESIGN.md §4`, sheet `Hướng dẫn`.

## Cấu trúc thư mục
```
index.html            giao diện (3 bước + gửi Canvas)        huong-dan.html   hướng dẫn cho giáo viên
assets/               app.css (dùng chung 2 trang), icon.svg
js/core.js            XML, thoát ký tự, chuỗi tiếng Việt, mô hình câu hỏi, validateQuestion, CRC32
js/zip.js             đọc/ghi zip (CompressionStream trên trình duyệt, zlib trên Node)
js/html.js            làm sạch HTML theo allowlist Canvas, HTML → chữ thuần
js/math.js            MathML → LaTeX / chữ Unicode        js/latex.js  LaTeX → MathML, $…$ trong văn bản
js/omml.js            Office Math (Word) → MathML
js/docx.js            đọc Word theo mẫu                    js/xlsx.js   đọc Excel theo mẫu
js/scorm.js           đọc gói SCORM của tao-de-scorm (chạy mã gói trong iframe sandbox)
js/qti.js             xuất gói QTI 1.2 (itembank | classic)
js/canvas-api.js      gọi API Canvas qua máy chủ trung gian     js/app.js  điều khiển giao diện
api/canvas.js         hàm máy chủ Vercel: OAuth2, proxy có allowlist, chuyển tiếp tải gói
server.js             máy chủ chạy thử cục bộ (file tĩnh + /api/canvas), đọc .env
mau/                  2 file mẫu cho giáo viên (sinh bằng tools/tao-mau.cjs)
tools/tao-mau.cjs     sinh lại file mẫu
tests/                kiểm thử Node (không deploy)         docs/nghien-cuu/  nghiên cứu định dạng Canvas (không deploy)
DESIGN.md             đặc tả / hợp đồng giữa các module
```
Thứ tự nạp script trong `index.html`: core → zip → html → math → omml → latex → docx → xlsx → scorm → qti →
canvas-api → app (script cổ điển dạng UMD để chạy được cả `file://` lẫn Node).

## Kiểm thử
```
node tests/chay-het.cjs            # chạy mọi tests/*.test.cjs (≈ 40 s)
node tests/chay-het.cjs e2e -v     # lọc theo tên file, -v in cả output của file đạt
node tests/e2e.test.cjs -v         # đầu-cuối: nguồn → QTI → bộ kiểm tra, đối chiếu đáp án
node tests/kiem-qti.cjs goi.zip    # kiểm một gói QTI bất kỳ (--json, --layout=classic|itembank)
```
- `tests/kiem-qti.cjs` là **bộ kiểm tra QTI độc lập** (không đọc `js/qti.js`): mô phỏng bước Python
  (QTIMigrationTool) và bước Ruby (importer Canvas) theo mã nguồn Canvas, suy ra đáp án Canvas sẽ coi là đúng
  và mô phỏng cách Canvas Classic chấm điểm (`grade()`).
- `tests/e2e.test.cjs`: 2 file mẫu + mọi `C:/Users/Administrator/Downloads/*SCORM*.zip` (nếu có) + fixture
  Word/Excel + một Excel tự dựng → 9 tổ hợp tuỳ chọn xuất → 0 lỗi, 0 cảnh báo, và **đáp án Canvas chấm đúng
  trùng đáp án giáo viên đánh dấu** cho từng câu.
- `tests/nap-trang.test.cjs`: `index.html` nạp đúng thứ tự, mọi file JS đúng cú pháp, module xử lý không chạm DOM.
- Không cần mạng, không cần thư viện. Một số test tự bỏ qua phần dùng file thật trong `Downloads` hoặc
  PowerShell (`System.IO.Packaging`) khi máy không có.

## Sinh lại file mẫu
```
node tools/tao-mau.cjs             # ghi mau/Mau-ngan-hang-cau-hoi.docx và .xlsx (nội dung cố định, ngày cố định)
node tools/tao-mau.cjs --out tmp   # ghi ra thư mục khác
```
Sửa nội dung mẫu trong `tools/tao-mau.cjs`, chạy lại, rồi `node tests/chay-het.cjs mau e2e` để chắc mẫu vẫn
đọc ra đúng số câu/đáp án.

## Deploy lên Vercel
- Dự án tĩnh: **không có build command**, Output = thư mục gốc. Vercel tự nhận `api/canvas.js` là hàm máy chủ.
- `.vercelignore` loại `tests/`, `docs/`, `tools/`, `server.js`, `.env*` khỏi bản deploy.
- Không bật tính năng gửi Canvas thì không cần biến môi trường nào (`/api/canvas?op=config` trả `enabled:false`,
  giao diện ẩn bước 4).

## Biến môi trường (kết nối Canvas)
Đặt trong Vercel → Project → Settings → Environment Variables, hoặc chép `.env.example` thành `.env` khi chạy
`node server.js`. **Không đưa `.env` lên git.**

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `CANVAS_BASE_URL` | Có (để bật) | Địa chỉ Canvas của trường, đúng dạng đăng nhập, ví dụ `https://<truong>.instructure.com`. Trống = tắt gửi Canvas. |
| `CANVAS_CLIENT_ID` | Có (OAuth) | Client ID của Developer Key (API Key) |
| `CANVAS_CLIENT_SECRET` | Có (OAuth) | Client Secret của Developer Key |
| `SESSION_SECRET` | Có | Chuỗi ngẫu nhiên ≥ 32 ký tự, mã hoá cookie phiên (AES-256-GCM). Tạo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ALLOW_PERSONAL_TOKEN` | Không | `1` = cho dán token cá nhân (chỉ chạy thử một giáo viên) |
| `APP_URL` | Không | Địa chỉ công khai của web nếu khác tên miền nhận yêu cầu (dựng `redirect_uri`) |
| `CANVAS_SCOPES` | Không | Ghi đè danh sách scope; `none` = không gửi scope (Developer Key không bật Enforce Scopes) |
| `PORT`, `HOST` | Không | Chỉ cho `server.js` (mặc định 8787, 127.0.0.1) |

Redirect URI cần khai báo trong Developer Key: `https://<địa chỉ web>/api/canvas?op=callback`
(chạy cục bộ: `http://localhost:8787/api/canvas?op=callback`).

## Việc cần nhà trường cung cấp để bật kết nối Canvas
- [ ] **Địa chỉ Canvas** đúng dạng đăng nhập (`https://<truong>.instructure.com` hoặc tên miền riêng); nếu có,
      thêm địa chỉ **beta** (`…beta.instructure.com`) để chạy thử.
- [ ] **Developer Key (API Key)** do quản trị Canvas tạo ở tài khoản gốc (Admin → Developer Keys → + API Key):
      Redirect URI như trên; **Enforce Scopes** bật với danh sách scope trong `docs/nghien-cuu/rest-api.md §5(b)`
      (đã có sẵn trong `api/canvas.js`); **State = ON**. Gửi **Client ID** và **Client Secret** qua kênh bảo mật.
- [ ] **Tên miền chạy công cụ** (Vercel hoặc máy chủ trường, bắt buộc https) để khai báo Redirect URI.
- [ ] **SESSION_SECRET** sinh mới cho môi trường thật, chỉ người quản trị Vercel giữ.
- [ ] Xác nhận **vai trò giáo viên** còn quyền: Course Content – add, Course Files – add, Question banks – view and link.
- [ ] Xác nhận **New Quizzes** có bật mặc định không, và trường có chặn tạo **Classic Quiz** không
      (API chỉ đưa được vào Question Bank Classic; Item Bank New Quizzes không có API → luôn tải gói và import tay).
- [ ] **Một khoá học sandbox + một tài khoản giáo viên thử** để chạy thí điểm (xem mục dưới).
- [ ] (Chỉ khi chạy thử bằng token cá nhân) cho biết có bật "Limit personal access token creation to admins" không.

## Giới hạn đã biết
- **Câu Đúng/Sai THPT**: thang 0,1 / 0,25 / 0,5 / 1 của Bộ GD&ĐT không làm được trên Canvas — Canvas chấm tuyến tính
  (mỗi ý đúng = điểm câu ÷ số ý). Công cụ có hai cách: một câu nhiều ô chọn Đúng/Sai, hoặc tách N câu.
- **Điền số**: Canvas tiếng Việt hiểu `12,5` là 125 → học sinh phải gõ dấu chấm (`12.5`). Đáp án có phân số /
  dấu phẩy nên dùng loại **trả lời ngắn** (công cụ tự thêm biến thể `2,67`/`2.67`, `−`/`-`).
- Trả lời ngắn / điền khuyết so khớp **nguyên văn** (không phân biệt hoa thường, không chuẩn hoá Unicode): học sinh
  gõ tiếng Việt dạng tổ hợp (Unikey "Unicode tổ hợp") có thể bị chấm sai.
- Ô chọn, ô điền, vế phải ghép nối chỉ là **chữ thuần** (công thức đổi thành chữ Unicode như x², √, ½; không ảnh).
- Word: công thức **MathType / Equation 3.0 / trường EQ**, ảnh **EMF/WMF/BMP/TIFF/WebP**, nội dung trong
  **text box / SmartArt / biểu đồ**, chữ font cũ VNI/TCVN3 → báo lỗi hoặc mất; cần chuyển sang Office Math / PNG.
- Excel: không đọc định dạng ô (tô màu/đậm) để đánh dấu đáp án; một câu phải nằm trên một dòng.
- SCORM: câu sắp xếp câu (kid-adv) thành trả lời ngắn; hình vẽ SVG bị bỏ (báo cảnh báo).
- Nội dung câu (kể cả đoạn dẫn chèn vào) > 15 000 ký tự → cảnh báo (Canvas thay câu > 16 384 ký tự bằng thông báo lỗi).
- Gửi thẳng lên Canvas chỉ vào **Question Bank (Classic)**; gói > 4 MB đi đường tải trực tiếp lên inst-fs.

## Cần xác nhận khi thí điểm trên Canvas thật (chưa chạy được ở máy phát triển)
Bộ kiểm tra mô phỏng theo mã nguồn Canvas, **chưa** import thật. Nên import một gói 10–15 câu đủ loại
(ví dụ xuất từ 2 file mẫu) vào khoá học sandbox và kiểm:
1. Gói `classic` tạo đúng **ngân hàng** (không tạo bài kiểm tra), Migration Issues trống, ảnh hiện.
2. Gói `itembank` import vào **Item Bank** của New Quizzes: đủ câu, đúng loại (đặc biệt multiple dropdowns,
   fill in multiple blanks), MathML có hiện không — nếu không, xuất lại với **Công thức → ảnh**.
3. MathML hiển thị trên trang làm bài Classic (MathJax 2.7), khoảng trắng nhỏ trong công thức.
4. "Ghi đè" khi nhập lại cập nhật đúng câu cũ, không tạo ngân hàng trùng.
5. Kết nối API: OAuth, liệt kê khoá học/ngân hàng, gửi gói (cả gói > 4 MB), đọc Migration Issues.
