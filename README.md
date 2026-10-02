# Ngân hàng câu hỏi Canvas — Trường TH, THCS & THPT Ngôi Sao Hoàng Mai

Công cụ web giúp giáo viên đưa câu hỏi từ **file Word / Excel theo mẫu của trường**, **đề Word thông thường** (đánh số
câu, kèm file đáp án / hướng dẫn chấm riêng) và gói **SCORM** do skill `tao-de-scorm` tạo vào **Canvas** của trường
(<https://4015.instructure.com>) bằng **một lần import gói QTI 1.2 (.zip)**, thay cho việc gõ tay từng câu.

- Đọc đủ 10 loại câu: một đáp án, nhiều đáp án, Đúng/Sai nhiều ý (kiểu THPT 2025), trả lời ngắn, điền số,
  điền khuyết, chọn từ danh sách, ghép nối, tự luận, đoạn thông tin.
- Giữ công thức (Office Math trong Word, `$LaTeX$` trong Excel/Word → MathML), ảnh, bảng, đoạn dẫn, lời giải.
- **File đáp án riêng** (HDC / KEY / ĐÁP ÁN, kể cả bảng THPT 2025 Phần I/II/III): nạp cùng file đề → tự ghép theo tên
  file và điền đáp án cho câu còn thiếu; câu đã có đáp án khác thì giữ đáp án trong đề và cảnh báo.
- Kiểm tra từng câu trước khi xuất (thiếu đáp án, thiếu ảnh, công thức MathType cũ, ô Excel bị đổi thành ngày…) và
  chỉ rõ dòng/câu cần sửa.
- Xuất gói cho **Item Bank (New Quizzes)** — mặc định, vì trường dùng New Quizzes — hoặc **Question Bank (Classic)**.
- Tuỳ chọn: **gửi thẳng lên Canvas** qua API — vào Question Bank (Classic), hoặc để Canvas chuyển thành **một New Quiz**
  khi nhập (cần máy chủ trung gian trên Vercel và Developer Key do quản trị Canvas tạo).

HTML/JS thuần, **không build, không npm, không thư viện ngoài**. Mọi xử lý file chạy ngay trong trình duyệt
của giáo viên — đề thi không gửi đi đâu (trừ khi bấm "Gửi thẳng lên Canvas").

## Cập nhật 2026-10-02
- **Word**: đọc đề thông thường (câu đánh số trần, nhóm "Questions 1-6" / "từ câu 18 đến 22", tiêu đề mục, câu trong
  bảng, đáp án tô vàng / trong ngoặc), mẫu "upload câu hỏi" (`[OC-NB]`, `ANSWER: A=30…`, `[EM]`), và **file đáp án riêng**
  (HDC / KEY / Đáp án) tự ghép với file đề rồi điền đáp án còn thiếu.
- **Excel**: hiện ngày / phần trăm / phân số đúng như Excel; ô `1/2`, `8/3` bị Excel đổi thành ngày → **lỗi** nêu ô và
  cách sửa; cảnh báo text box / biểu đồ / dòng ẩn. Mẫu Excel: cột A…H và Đáp án định dạng Text, ảnh ví dụ đi theo ô;
  mẫu Word dự phòng font Arial.
- **Gói QTI**: phương án / vế trái / lời giải chỉ có chữ chứa `&` `<` `>` xuất `text/plain` (trước đây học sinh thấy
  nguyên `&lt;`); HTML còn mã nguy hiểm được làm sạch lại trước khi xuất; MathML lọc `style`, bỏ script trong MathML.
- **Soát câu**: câu có đề nằm hẳn trong đoạn dẫn (câu điền bài đọc) không còn báo "nội dung trống"; xuất với
  "Không chèn đoạn dẫn" thì cảnh báo câu đó.
- **Gửi thẳng lên Canvas**: thêm đích **Chuyển sang New Quizzes khi nhập** (`import_quizzes_next`); liên kết về trang
  Canvas của trường; tối thiểu **10 scope**.
- **Bảo mật máy chủ**: PKCE S256, cookie `__Host-`, đăng xuất chỉ POST, `op=upload` chỉ chuyển tiếp cho lần nhập thật
  của chính người dùng, chặn `as_user_id`/`access_token`/`_method`; `server.js` chặn tên ngắn 8.3 (`/ENV~1` từng đọc
  được `.env`) và kiểm Host; sandbox SCORM chặt hơn.
- **Quản trị cần làm lại**: Developer Key bật **Allow Include Parameters**, chọn đúng 10 scope (bảng dưới), đặt `APP_URL`.
- **Kiểm thử**: 19/19 file test; đầu-cuối 58 nguồn, 455 gói, 17 762 phép chấm, 0 lỗi; bộ mô phỏng Canvas (`CANVAS_SIM`)
  59 nguồn, 474 lượt import, 18 094 phép chấm, 0 sai khác chưa giải thích; bộ kiểm tra QTI thêm luật `html-escaped-text`.

## Cách dùng

### 1. Mở công cụ
| Cách | Làm gì | Có "Gửi thẳng lên Canvas"? |
|---|---|---|
| Mở trực tiếp | Nhấp đúp `index.html` (Chrome / Edge / Safari mới) | Không |
| Chạy trên máy | `node server.js` rồi mở <http://localhost:8787> (Node ≥ 18) | Có, nếu có file `.env` |
| Trên web | Deploy lên Vercel (xem dưới) | Có, nếu đặt biến môi trường |

### 2. Các bước trên giao diện
1. **Nạp đề**: kéo thả `.docx`, `.xlsx`, gói SCORM `.zip`, ảnh rời hoặc zip ảnh (cho Excel có cột `Ảnh`), và — nếu đề
   chưa có đáp án — **file đáp án / hướng dẫn chấm** `.docx` (tên thường có `HDC`, `KEY`, `Đáp án`).
   - File đáp án hiện thành một dòng riêng ("ĐA") với ô **Điền đáp án vào file đề**. Công cụ tự ghép khi tên file trùng
     sau khi bỏ chữ chỉ đáp án (`26.12.HH.KS.HDC.0301` ↔ `26.12.HH.KS.0301`, `X_KEY` ↔ `X`), khi tên gần giống, hoặc khi
     chỉ có một file đề nạp cùng lúc / trước đó. Không ghép được → giáo viên chọn file đề trong danh sách.
   - Đổi file đề / chọn "Không điền" / bỏ file đáp án → file đề cũ được đọc lại (giữ tên, điểm, câu bỏ chọn đã sửa).
   - File có tên kiểu đáp án nhưng bị đọc thành đề (vd hướng dẫn chấm chỉ có lời giải): nút **Đây là file đáp án**.
   Nút **Tải mẫu Word / Excel** và **Hướng dẫn** (`huong-dan.html`) ở ngay đầu trang.
2. **Soát câu hỏi**: xem từng câu như học sinh thấy, đáp án đúng tô xanh, sửa tên ngân hàng / điểm, bỏ chọn câu
   không muốn xuất. Câu có lỗi (đỏ) **không được xuất** — sửa file rồi nạp lại.
3. **Xuất**: chọn đích, cách xử lý câu Đúng/Sai, đoạn dẫn, công thức → **Tải gói QTI**, rồi import theo hướng dẫn
   hiện ngay dưới nút (có dòng "Canvas của trường: 4015.instructure.com" khi máy chủ đã cấu hình):
   - **Item Bank – New Quizzes** (mặc định): **mỗi ngân hàng một file `.zip`**. Trong khoá học: **Ngân Hàng Câu Hỏi
     (Item Banks)** ở thanh điều hướng → **+ Add Bank** → đặt tên → **Create Bank** → mở ngân hàng **vừa tạo, còn
     trống** → **⋮ (Options)** → **Import Content** → chọn file `.zip` → **Import**. Ngân hàng đã có câu không có mục
     nhập; Item Bank không ghi đè (cập nhật = nhập vào ngân hàng trống mới). Chia sẻ cho khoá học / đồng nghiệp khác
     bằng **⋮ → Share** thay vì nhập lại.
     *Lưu ý tiếng Việt:* Canvas gọi **cả hai** loại là "Ngân Hàng Câu Hỏi"; ngân hàng Classic hiện "(Bản cũ)".
   - **Question Bank – Classic**: một file `…_classic.zip` cho mọi ngân hàng.
     **Cài Đặt → Nhập Nội Dung Khóa Học → Tập tin .zip QTI** (Settings → Import Course Content → QTI .zip file),
     **không** đánh dấu "Convert content to New Quizzes". Nhập lại bản sửa: đánh dấu **"Overwrite assessment
     content with matching IDs"** để cập nhật đúng ngân hàng/câu cũ thay vì tạo ngân hàng trùng tên.
4. **Gửi thẳng lên Canvas** (chỉ hiện khi máy chủ bật): đăng nhập Canvas, chọn khoá học, chọn ngân hàng, chọn
   **Đưa vào đâu?**
   - **Question Bank – Classic**: gói objectbank, `settings.overwrite_quizzes = true` (ô "Ghi đè") → sửa đề gửi lại cập
     nhật đúng câu cũ.
   - **Chuyển sang New Quizzes khi nhập**: gói bố cục Item Bank (một bài kiểm tra chứa mọi câu) +
     `settings.import_quizzes_next = true` (boolean JSON) — đúng như ô "Chuyển đổi nội dung thành Các Câu Hỏi Kiểm Tra
     Mới" khi nhập tay. Canvas nhập rồi chuyển bài kiểm tra thành **một New Quiz cùng tên** (hành vi có trong mã nguồn
     Canvas; khoá học phải bật New Quizzes, nếu không Canvas giữ bài Classic). Mỗi lần gửi = một New Quiz mới. Nếu
     Canvas của trường bật chuyển ngân hàng sang New Quizzes, **có thể** có thêm Item Bank cùng tên — **cần thử lần
     đầu** (xem mục thí điểm).
   Xong sẽ có liên kết tới `https://4015.instructure.com/courses/<id>/quizzes` (New Quizzes) hoặc `…/question_banks`
   (Classic) và trang các lần nhập `…/content_migrations` (vấn đề của từng lần nhập).
   **Item Bank của New Quizzes không có API** — muốn chắc chắn có Item Bank thì tải gói ở bước 3 và nhập tay.

### 3. Soạn đề theo mẫu
- `mau/Mau-ngan-hang-cau-hoi.docx`: phần hướng dẫn (trước dòng `NGÂN HÀNG:`) + ví dụ mọi loại câu.
  Quy ước chính: `NGÂN HÀNG: <tên>`, `Câu 1.`, phương án `A.`–`H.`, `Đáp án: B` (hoặc gạch chân / tô đỏ nhãn đúng),
  ý `a)`–`d)` cho câu Đúng/Sai, `[[Hà Nội]]` ô điền, `[[*đúng|sai]]` ô chọn, `trái => phải` ghép nối,
  `Lời giải:` … Chi tiết: `DESIGN.md §3`, trang `huong-dan.html`.
- **Đề Word không theo mẫu** cũng đọc được: câu đánh số `1.` / `12)` (không có chữ "Câu"), nhóm "Questions 1-6" /
  "từ câu 18 đến 22" / "1. Look and circle … (…/5 points)" thành đoạn dẫn chung, tiêu đề "I. Vocabulary", "Part 2",
  phương án và câu trong bảng, câu ví dụ "0." bị bỏ, đáp án tô vàng / trong ngoặc cuối dòng. Mẫu "upload câu hỏi"
  (`Câu 1 [OC-NB]:` … `ANSWER: A=30, B=-10`, ô `[[1]]`, câu chùm `[EM]`) cũng đọc trực tiếp.
- `mau/Mau-ngan-hang-cau-hoi.xlsx`: mỗi dòng một câu, cột theo tên tiêu đề (`Loại câu`, `Nội dung câu hỏi`,
  `A`…`H`, `Đáp án`, `Điểm`, `Lời giải`, `Ngân hàng`, `Mức độ`…). Cột phương án và Đáp án đã định dạng **Text** để
  `1/2`, `8/3` không bị Excel đổi thành ngày. Chi tiết: `DESIGN.md §4`, sheet `Hướng dẫn`.

## Cấu trúc thư mục
```
index.html            giao diện (4 bước)                     huong-dan.html   hướng dẫn cho giáo viên
assets/               app.css (dùng chung 2 trang), icon.svg
js/core.js            XML, thoát ký tự, chuỗi tiếng Việt, mô hình câu hỏi, validateQuestion, CRC32
js/zip.js             đọc/ghi zip (CompressionStream trên trình duyệt, zlib trên Node)
js/html.js            làm sạch HTML theo allowlist Canvas, HTML → chữ thuần
js/math.js            MathML → LaTeX / chữ Unicode        js/latex.js  LaTeX → MathML, $…$ trong văn bản
js/omml.js            Office Math (Word) → MathML
js/docx.js            đọc Word (mẫu, đề đánh số, mẫu upload) + file đáp án riêng   js/xlsx.js  đọc Excel theo mẫu
js/scorm.js           đọc gói SCORM của tao-de-scorm (chạy mã gói trong iframe sandbox)
js/qti.js             xuất gói QTI 1.2 (itembank | classic)
js/canvas-api.js      gọi API Canvas qua máy chủ trung gian     js/app.js  điều khiển giao diện
api/canvas.js         hàm máy chủ Vercel: OAuth2 + PKCE, proxy có allowlist, chuyển tiếp tải gói
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
node tests/chay-het.cjs            # chạy mọi tests/*.test.cjs (≈ 45 s)
node tests/chay-het.cjs e2e -v     # lọc theo tên file, -v in cả output của file đạt
node tests/e2e.test.cjs -v         # đầu-cuối: nguồn → QTI → bộ kiểm tra, đối chiếu đáp án
node tests/kiem-qti.cjs goi.zip    # kiểm một gói QTI bất kỳ (--json, --layout=classic|itembank)
CANVAS_SIM=<thư mục bộ mô phỏng> node tests/sim-chay.cjs   # đối chiếu với bộ mô phỏng Canvas (≈ 66 s, 8 luồng)
```
- `tests/kiem-qti.cjs` là **bộ kiểm tra QTI độc lập** (không đọc `js/qti.js`): mô phỏng bước Python
  (QTIMigrationTool) và bước Ruby (importer Canvas) theo mã nguồn Canvas, suy ra đáp án Canvas sẽ coi là đúng
  và mô phỏng cách Canvas Classic chấm điểm (`grade()`).
- `tests/e2e.test.cjs`: 2 file mẫu + mọi `C:/Users/Administrator/Downloads/*SCORM*.zip` (nếu có) + fixture
  Word/Excel + một Excel tự dựng → 9 tổ hợp tuỳ chọn xuất → 0 lỗi, 0 cảnh báo, và **đáp án Canvas chấm đúng
  trùng đáp án giáo viên đánh dấu** cho từng câu.
- `tests/canvas-sim.test.cjs` + `tests/sim-chay.cjs`: chạy gói qua bộ mô phỏng Canvas (import.cjs, grade.cjs, bộ phân
  tích HTML5) đặt ở thư mục ngoài repo, chỉ đọc qua biến `CANVAS_SIM`. Không đặt biến (hoặc sai đường dẫn) → phần
  mô phỏng in "BỎ QUA", các kiểm tra tĩnh vẫn chạy. Sai khác đã biết của Canvas ghi trong `DA_BIET` (cảnh báo
  `vargte/varlte`, `objectbank`, `<tbody>` tự thêm…).
- `tests/bao-mat.test.cjs`: Canvas giả lập theo mã nguồn (redirect_uri khớp nguyên văn, mã dùng một lần, PKCE, làm
  mới token, 401 thiếu scope), allowlist proxy, op=upload, server.js (tên 8.3 `~1`, Host), sandbox SCORM.
- `tests/api.test.cjs`: OAuth, proxy, import (Classic và **New Quizzes**: `import_quizzes_next` boolean, chặn gói
  không có bài kiểm tra), tải lên inst-fs / S3, giới hạn tốc độ.
- `tests/app.test.cjs`: phần thuần của `app.js` (ghép file đáp án ↔ file đề, điền đáp án rồi xuất qua bộ kiểm tra,
  lớp làm sạch HTML khi hiện, liên kết Canvas), các bước nhập Canvas, `index.html` khớp `app.js`.
- `tests/docx-word.test.cjs`: fixture do **Word thật** sinh (`tests/fixtures/docx/tao-word.ps1`).
- `tests/nap-trang.test.cjs`: `index.html` nạp đúng thứ tự, mọi file JS đúng cú pháp, module xử lý không chạm DOM.
- Không cần mạng, không cần thư viện. Một số test tự bỏ qua phần dùng file thật trong `Downloads`, PowerShell
  (`System.IO.Packaging`) hoặc bộ mô phỏng khi máy không có.

## Sinh lại file mẫu
```
node tools/tao-mau.cjs             # ghi mau/Mau-ngan-hang-cau-hoi.docx và .xlsx (nội dung cố định, ngày cố định)
node tools/tao-mau.cjs --out tmp   # ghi ra thư mục khác
```
Sửa nội dung mẫu trong `tools/tao-mau.cjs`, chạy lại, rồi `node tests/chay-het.cjs mau e2e` để chắc mẫu vẫn
đọc ra đúng số câu/đáp án.

Fixture do Office thật tạo (chỉ chạy trên máy có Word/Excel 365, Windows PowerShell; nên chạy nền / tiến trình riêng):
```
powershell -File tests/fixtures/xlsx/dien-mau-bang-office.ps1   # điền mẫu như giáo viên → office-giao-vien.xlsx/.docx, office-tu-lam.xlsx
powershell -File tests/fixtures/docx/tao-word.ps1               # 9 file word-*.docx (OMath, đánh số tự động, tô nền, bảng lồng, ảnh)
```
Hai script mở Office ẩn (`Visible=false`, `DisplayAlerts=0`), chỉ đóng tiến trình chính nó tạo (theo PID), xoá tên
tác giả/đường dẫn máy trong file. Không bao giờ chép đề thật của trường vào repo — fixture là đề tổng hợp có cùng cấu trúc.

## Deploy lên Vercel
- Repo GitHub `tuan303/canvas` → Vercel tự deploy. Dự án tĩnh: **không có build command**, Output = thư mục gốc.
  Vercel tự nhận `api/canvas.js` là hàm máy chủ.
- `.vercelignore` loại `tests/`, `docs/`, `tools/`, `server.js`, `.env*` khỏi bản deploy.
- Không bật tính năng gửi Canvas thì không cần biến môi trường nào (`/api/canvas?op=config` trả `enabled:false`,
  giao diện ẩn bước 4).
- **Cài đặt cho trường (4015.instructure.com):**
  1. Vercel → Project → Settings → Environment Variables (Production):
     `CANVAS_BASE_URL=https://4015.instructure.com`, `APP_URL=https://<tên miền chính của web>` (**nên đặt**: Canvas so
     Redirect URI *nguyên văn*, tên miền preview của Vercel sẽ bị từ chối), `CANVAS_CLIENT_ID`, `CANVAS_CLIENT_SECRET`,
     `SESSION_SECRET` (sinh mới), `ALLOW_PERSONAL_TOKEN=0`. Redeploy sau khi đổi biến.
  2. Quản trị Canvas tạo **Developer Key → API Key** (Admin → Developer Keys → + Developer Key → API Key):
     - **Redirect URIs**: `https://<tên miền chính của web>/api/canvas?op=callback` (đúng từng ký tự với `APP_URL`).
     - **Enforce Scopes: bật**, đánh dấu **Allow Include Parameters** (không có thì Canvas bỏ `include[]=term`, tên học
       kỳ của khoá học trống), và chọn **đúng 10 scope** công cụ xin (lấy từ `SCOPES` trong `api/canvas.js`):

       | Nhóm trong Canvas | Scope |
       |---|---|
       | Users | `GET /api/v1/users/:id` |
       | Courses | `GET /api/v1/courses` |
       | Courses | `GET /api/v1/courses/:course_id/permissions` |
       | Question Banks | `GET /api/v1/question_banks` |
       | Content Migrations | `GET /api/v1/courses/:course_id/content_migrations/migrators` |
       | Content Migrations | `POST /api/v1/courses/:course_id/content_migrations` |
       | Content Migrations | `GET /api/v1/courses/:course_id/content_migrations` |
       | Content Migrations | `GET /api/v1/courses/:course_id/content_migrations/:id` |
       | Content Migrations | `GET /api/v1/courses/:course_id/content_migrations/:content_migration_id/migration_issues` |
       | Progress | `GET /api/v1/progress/:id` |

       Khoá đã tạo theo danh sách 13 scope cũ (`docs/nghien-cuu/rest-api.md §5(b)`) vẫn dùng được (công cụ chỉ xin tập
       con); có thể bỏ 3 scope thừa: `PUT …/content_migrations/:id`, `GET /api/v1/question_banks/:id`,
       `GET /api/v1/question_banks/:id/questions`. Thiếu scope → công cụ báo 403 `thieu_scope` kèm tên thao tác.
     - Lưu, chuyển **State = ON**, gửi **Client ID** (số) và **Client Secret** cho người quản trị Vercel qua kênh bảo mật.
  3. Mở web → bước 4 → **Đăng nhập Canvas** bằng tài khoản giáo viên thử → chạy danh sách thí điểm dưới đây.

## Biến môi trường
Đặt trong Vercel → Project → Settings → Environment Variables, hoặc chép `.env.example` thành `.env` khi chạy
`node server.js`. **Không đưa `.env` lên git.**

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `CANVAS_BASE_URL` | Có (để bật) | Địa chỉ Canvas của trường, đúng dạng đăng nhập: `https://4015.instructure.com`. Trống = tắt gửi Canvas. |
| `CANVAS_CLIENT_ID` | Có (OAuth) | Client ID của Developer Key (API Key) |
| `CANVAS_CLIENT_SECRET` | Có (OAuth) | Client Secret của Developer Key |
| `SESSION_SECRET` | Có | Chuỗi ngẫu nhiên ≥ 32 ký tự, mã hoá cookie phiên (AES-256-GCM) và suy ra mã PKCE. Tạo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ALLOW_PERSONAL_TOKEN` | Không | `1` = cho dán token cá nhân (chỉ chạy thử một giáo viên) |
| `APP_URL` | **Nên đặt** | Địa chỉ công khai của web (`https://…`, không `?`/`#`) — dựng `redirect_uri`; phải khớp Redirect URI của Developer Key |
| `CANVAS_SCOPES` | Không | Ghi đè danh sách scope; `none` = không gửi scope (Developer Key không bật Enforce Scopes) |
| `PORT`, `HOST` | Không | Chỉ cho `server.js` (mặc định 8787, 127.0.0.1; `server.js` chỉ nhận Host `localhost`/`127.x`/`[::1]`) |

Redirect URI cần khai báo trong Developer Key: `https://<địa chỉ web>/api/canvas?op=callback`
(chạy cục bộ: `http://localhost:8787/api/canvas?op=callback`).

Ghi chú bảo mật của máy chủ trung gian (chi tiết `DESIGN.md §9`): đăng nhập luôn kèm **PKCE S256**; trên https cookie
mang tiền tố `__Host-`; đăng xuất chỉ nhận **POST** (kèm `X-NH-Client`) và thu hồi token trên Canvas; `op=upload` chỉ
chuyển tiếp khi kèm `course` + `migration` của một lần nhập thật đang chờ gói; yêu cầu từ trang khác
(`Sec-Fetch-Site`) bị chặn 403. Nên thêm luật **Vercel Firewall rate-limit** cho `/api/canvas` và giới hạn chi phí.

## Việc cần nhà trường cung cấp để bật kết nối Canvas
- [x] **Địa chỉ Canvas**: `https://4015.instructure.com` (locale vi, vùng ap-southeast-1). Nếu có, thêm địa chỉ
      **beta** (`4015.beta.instructure.com`) để chạy thử — New Quizzes chạy trên beta, không chạy trên `*.test`.
- [x] Trường dùng **New Quizzes** và tạo được **Developer Key**.
- [ ] **Developer Key (API Key)** theo mục "Cài đặt cho trường" ở trên (Redirect URI, Enforce Scopes + 10 scope,
      Allow Include Parameters, State = ON). Gửi **Client ID** và **Client Secret** qua kênh bảo mật.
- [ ] **Tên miền chạy công cụ** (Vercel, bắt buộc https) để khai báo Redirect URI và đặt `APP_URL`.
- [ ] **SESSION_SECRET** sinh mới cho môi trường thật, chỉ người quản trị Vercel giữ.
- [ ] Xác nhận **vai trò giáo viên** còn quyền: Course Content – add, Course Files – add, Question banks – view and link.
- [ ] Trang nhập của khoá học hiện ô nào: "**Convert content to New Quizzes**" (đã bật chuyển ngân hàng) hay
      "Import existing quizzes as New Quizzes" (chỉ chuyển bài kiểm tra) — quyết định có Item Bank khi gửi thẳng hay không.
- [ ] Trường có chặn tạo **Classic Quiz** không (ảnh hưởng tới đích Question Bank – Classic).
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
- Word: công thức **MathType / Equation 3.0 / ChemWindow / trường EQ**, ảnh **EMF/WMF/BMP/TIFF/WebP**, nội dung trong
  **text box / SmartArt / biểu đồ**, chữ font cũ VNI/TCVN3 → báo lỗi hoặc mất; cần chuyển sang Office Math / PNG.
  Hướng dẫn chấm chỉ có lời giải tự luận không tự nhận ra là file đáp án (dùng nút "Đây là file đáp án");
  danh sách tiêu đề IELTS > 8 lựa chọn (i–x) thành trả lời ngắn.
- Excel: không đọc định dạng ô (tô màu/đậm) để đánh dấu đáp án; một câu phải nằm trên một dòng. Ô gõ `1/2` ở định
  dạng chung bị Excel đổi thành ngày → công cụ báo **lỗi** (định dạng ô Text hoặc gõ `'1/2`); số thường hiện dấu chấm
  (`0.25`).
- SCORM: câu sắp xếp câu (kid-adv) thành trả lời ngắn; hình vẽ SVG bị bỏ (báo cảnh báo).
- Nội dung câu (kể cả đoạn dẫn chèn vào) > 15 000 ký tự → cảnh báo (Canvas thay câu > 16 384 ký tự bằng thông báo lỗi).
- Gửi thẳng lên Canvas: vào **Question Bank (Classic)** hoặc **chuyển thành New Quiz**; Item Bank chỉ qua nhập tay
  (hoặc có thể qua chuyển đổi ngân hàng của Canvas — chưa xác nhận). Gói > 4 MB đi đường tải trực tiếp lên inst-fs.
- Trên Safari iPad, gói SCORM có vòng lặp vô hạn có thể làm treo trang trước khi hết giờ chờ (iframe cùng tiến trình).

## Cần xác nhận khi thí điểm trên Canvas thật (chưa chạy được ở máy phát triển)
Bộ kiểm tra và bộ mô phỏng làm theo mã nguồn Canvas, **chưa** import thật. Nên dùng một khoá học sandbox
(tốt nhất trên `4015.beta.instructure.com`), nhập một gói 10–15 câu đủ loại (ví dụ xuất từ 2 file mẫu) và đánh dấu:

**Nhập tay vào New Quizzes (đường chính của trường)**
- [ ] Gói `itembank` nhập vào **Item Bank trống** (Item Banks → Add Bank → ⋮ → Import Content): đủ số câu, đúng loại.
- [ ] **MathML** hiện trong New Quizzes (đề, phương án, lời giải) — nếu không: xuất lại với **Công thức → ảnh** và
      ghi lại kết quả.
- [ ] Câu **Chọn từ danh sách** (multiple dropdowns) và **Đúng/Sai nhiều ý** (dropdown) sang New Quizzes thành loại gì
      (tài liệu Instructure nói có thể hiện như Fill in the Blank) và chấm đúng không.
- [ ] Câu **Điền khuyết nhiều ô** (fill in multiple blanks) giữ đủ ô và các cách viết; chấm điểm từng ô.
- [ ] Ảnh hiện (kể cả khi chia sẻ ngân hàng sang khoá học khác); bảng, gạch chân, chỉ số trên/dưới.
- [ ] Gói `itembank` nhập vào **một New Quiz mới** (Build → ⋮ → Import Content): tên bài = tên file.

**Gửi thẳng (API)**
- [ ] Đăng nhập OAuth với **PKCE**, cookie `__Host-` trên https, chặn `Sec-Fetch-Site` khác nguồn không ảnh hưởng
      giáo viên; danh sách khoá học có tên học kỳ (Allow Include Parameters).
- [ ] **Question Bank – Classic**: tạo đúng ngân hàng (không tạo bài kiểm tra), Migration Issues trống, ảnh hiện;
      gửi lại với "Ghi đè" cập nhật đúng câu cũ, không tạo ngân hàng trùng.
- [ ] **Chuyển sang New Quizzes** (`import_quizzes_next`): có **New Quiz** cùng tên trong Câu Hỏi Kiểm Tra; ghi lại
      **có tạo Item Bank hay không** (phụ thuộc cờ chuyển ngân hàng của trường), và ngân hàng Classic phụ (Bản cũ) cùng
      tên có bị để lại không; bài Classic gốc đã bị thay.
- [ ] Gói > 4 MB (tải thẳng inst-fs — trình duyệt có đọc được phản hồi 201 không), `create_success` khi Enforce Scopes bật.
- [ ] Đọc được Migration Issues; liên kết "Sửa trên Canvas" mở đúng trang.

**Classic (nếu trường còn dùng)**
- [ ] MathML trên trang làm bài Classic (MathJax 2.7), khoảng trắng nhỏ trong công thức.
- [ ] Nhập tay gói `classic` với "Convert content to New Quizzes" bật thì ra gì (gói chỉ có ngân hàng).
