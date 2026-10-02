# Ngân hàng câu hỏi Canvas — đặc tả thiết kế (hợp đồng giữa các module)

Công cụ web **tĩnh, không build** giúp giáo viên Trường TH, THCS & THPT Ngôi Sao Hoàng Mai
đưa câu hỏi từ **file Word / Excel theo mẫu** (và gói SCORM do skill `tao-de-scorm` tạo)
vào **Ngân hàng câu hỏi Canvas** bằng một lần import gói **QTI 1.2 .zip**, thay cho việc
nhập tay từng câu. Tuỳ chọn: gửi thẳng lên Canvas qua API (cần máy chủ trung gian).

Nghiên cứu gốc (có trích dẫn mã nguồn Canvas): `docs/nghien-cuu/*.md`.
**`docs/nghien-cuu/reconciled.md` là nguồn sự thật cho định dạng QTI** — mọi template
XML trong `js/qti.js` phải khớp từng chi tiết với nó.

## 0. Nguyên tắc chung

- Không npm, không bundler, không thư viện ngoài. Mở `index.html` bằng trình duyệt là chạy
  (kể cả `file://`). Deploy tĩnh trên Vercel; `api/` là hàm máy chủ Vercel (Node, CommonJS).
- Mọi file `js/*.js` là **script cổ điển dạng UMD** (không dùng `import`/`export` vì
  `file://` chặn ES module), chạy được cả trình duyệt lẫn Node (để test):

  ```js
  /* js/ten.js — mô tả ngắn */
  (function (root, factory) {
    var api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else { root.NH = root.NH || {}; root.NH.ten = api; }
  })(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';
    var core = (typeof require === 'function') ? require('./core.js') : root.NH.core;
    ...
    return { ... };
  });
  ```
  Thứ tự nạp trong `index.html`: core → zip → html → math → omml → latex → docx → xlsx → scorm → qti → canvas-api → app.
- Không dùng `DOMParser`, `document` hay API riêng của trình duyệt trong các module xử lý
  (chỉ `app.js` được dùng DOM). Phân tích XML/HTML bằng bộ phân tích tự viết trong `core.js`.
  Ngoại lệ có kiểm soát: `zip.js` dùng `CompressionStream`/`DecompressionStream` khi ở
  trình duyệt và `zlib` khi ở Node; `scorm.js` cần chạy mã JS trong gói (xem §6).
- Hàm xử lý file là `async` và nhận `Uint8Array`.
- Chú thích trong mã viết **tiếng Việt**, gọn, như các dự án khác của trường.
- Văn bản luôn chuẩn hoá **NFC**. Tiếng Việt giữ nguyên UTF-8 (không BOM).

## 1. Mô hình dữ liệu chung (do `js/core.js` định nghĩa và kiểm tra)

```js
Bank = {
  title: 'Toán 12 – Chương 1',      // tên ngân hàng hiện trong Canvas
  ident: 'nh_toan_12_chuong_1_a1b2c3', // ASCII ^[A-Za-z_][A-Za-z0-9_-]{0,63}$, ỔN ĐỊNH theo title
  source: { kind: 'docx'|'xlsx'|'scorm', name: 'De_kiem_tra.docx' },
  questions: [Question],
  images: { 'img_001.png': Uint8Array, ... },   // tên ASCII ^[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)$
  warnings: [Issue]                              // cảnh báo cấp ngân hàng
}

Question = {
  id: 'q07',                 // duy nhất trong bank, [a-z0-9_]
  no: '7',                   // số câu gốc (chuỗi) để hiện "Câu 7"
  title: 'Câu 7',            // tên câu trong Canvas (text thuần). Nếu có mức độ: 'Câu 7 [NB]'
  type: 'mc'|'ma'|'tf'|'short'|'num'|'blanks'|'dropdowns'|'matching'|'essay'|'text',
  points: 1,                 // số thực > 0 (text: 0)
  stimulus: '',              // HTML đoạn dẫn dùng chung (đã làm sạch) — qti.js quyết định chèn vào stem
  stem: '<p>…</p>',          // HTML nội dung câu (đã làm sạch, ảnh dạng src="images/<tên>")
  // theo loại:
  choices:   [{ id: 'A', html: '…', correct: true }],   // mc, ma (id = nhãn gốc A..H)
  statements:[{ key: 'a', html: '…', value: true }],    // tf (Đúng/Sai nhiều ý; value true = Đúng)
  answers:   ['12,5', '12.5'],                          // short: các cách viết được chấp nhận
  numeric:   { exact: 12.5, margin: 0 } | { min: 1, max: 2 }, // num
  blanks:    [{ id: 'b1', accepts: ['Hà Nội'] }],      // blanks: stem chứa đúng một lần "[b1]"
  dropdowns: [{ id: 'b1', options: ['Đúng','Sai'], correct: 0 }], // dropdowns: stem chứa "[b1]"
  pairs:     [{ left: 'Hà Nội', right: 'Việt Nam' }],  // matching (left: text/HTML ngắn, right: text thuần)
  distractors: ['Lào'],                                 // matching: vế phải gây nhiễu
  feedback: '<p>Lời giải…</p>',  // HTML lời giải / hướng dẫn chấm ('' nếu không có)
  meta: { level: 'NB'|'TH'|'VD'|'VDC'|'', topic: '', part: 'PHẦN I…', tags: [] },
  issues: [Issue]            // lỗi/cảnh báo của riêng câu
}

Issue = { level: 'error'|'warn'|'info', msg: 'Câu 7: chưa xác định đáp án đúng', qid?: 'q07' }
```

Quy tắc: câu có `issues` mức `error` **không được xuất** (giao diện báo đỏ, giáo viên sửa file
rồi nạp lại, hoặc sửa nhanh ngay trên giao diện nếu được hỗ trợ). Trường không dùng của loại
nào thì để `undefined`.

### `js/core.js` phải cung cấp

| Hàm | Mô tả |
|---|---|
| `parseXml(str) → Node` | Bộ phân tích XML nhỏ, chịu lỗi nhẹ: `{type:'el', name:'w:p', attrs:{…}, children:[…]}` / `{type:'text', text}`; giải thực thể (`&amp;` `&#x1EA1;` …), CDATA, bỏ comment/PI/doctype. Giữ tiền tố namespace trong `name`. |
| `xmlText(node)` | Nối toàn bộ text con. |
| `find(node, name)`, `findAll(node, name)`, `children(node, name)` | Duyệt cây (tên đầy đủ có tiền tố). |
| `escXml(s)`, `escAttr(s)` | Thoát XML (`&` `<` `>`; thuộc tính thêm `"`), đồng thời **xoá ký tự cấm trong XML 1.0** (U+0000–0008, 000B, 000C, 000E–001F, FFFE, FFFF). |
| `escHtml(s)` | Thoát HTML cho văn bản thuần. |
| `nfc(s)` | `String(s).normalize('NFC')`. |
| `slugAscii(s)` | Bỏ dấu tiếng Việt (NFD + xoá dấu, đ→d), chữ thường, ký tự khác `[a-z0-9]` → `_`, gộp `_`. |
| `hash6(s)` | 6 ký tự hex ổn định (FNV-1a 32 bit). |
| `bankIdent(title)` | `'nh_' + slugAscii(title).slice(0,40) + '_' + hash6(title)` — ổn định để import đè (overwrite) đúng ngân hàng cũ. |
| `answerVariants(list)` | Sinh biến thể đáp án ngắn: trim, NFC, gộp khoảng trắng; số thập phân `2,67`↔`2.67`; `−`(U+2212)↔`-`; bỏ trùng không phân biệt hoa thường; giữ thứ tự gốc trước. |
| `parsePoints(s)` | `'0,25'`/`'0.25'`/`'1đ'`/`'(0,5 điểm)'` → số; sai → `null`. |
| `newIssue(level,msg,qid)` | |
| `validateQuestion(q) → Issue[]` | Kiểm tra bất biến theo loại (xem §5.3). |
| `looksLikeHtml(s) → bool` | Chuỗi có **thẻ HTML thật** (`<b>`, `</p>`, `<br/>`, `<img src=…>`, `<!--`). `a<b`, `x < y`, `a<b và b>c` là chữ thuần (giáo viên Toán hay gõ) — dùng chung cho `validateQuestion`, `qti.js` và `tests/kiem-qti.cjs` khi xét ô chữ thuần. |
| `utf8Encode(s)`, `utf8Decode(u8)` | `TextEncoder/TextDecoder` (Node ≥ 18 có sẵn). |
| `crc32(u8)` | Dùng cho zip. |

## 2. `js/zip.js`

- `readZip(u8) → Promise<{ [path]: Uint8Array }>` — hỗ trợ stored(0) và deflate(8),
  tên file UTF-8 (cờ bit 11) hoặc CP437 (đọc như latin1). Bỏ thư mục. Chuẩn hoá `\` → `/`.
- `writeZip(files: [{path, data: Uint8Array|string}], {compress:true}) → Promise<Uint8Array>` —
  deflate (raw) khi nén có lợi, ngược lại stored; đặt cờ UTF-8; ngày giờ DOS hợp lệ.
- Trình duyệt: `CompressionStream('deflate-raw')` / `DecompressionStream('deflate-raw')`.
  Node: `require('zlib').deflateRawSync / inflateRawSync`.

## 3. Mẫu Word (`js/docx.js` + `js/omml.js`)

`parseDocx(u8, {fileName}) → Promise<{ banks: [Bank], issues: [Issue] }>`

### 3.1 Đọc .docx
- `word/document.xml`, `word/_rels/document.xml.rels`, `word/media/*`, `word/numbering.xml`
  (để biết đoạn có đánh số tự động kiểu `A.`/`a)`/`Câu 1.` — Word tự đánh số thì chữ không
  nằm trong văn bản; phải dựng lại nhãn từ `w:numPr` + `numbering.xml` (`lvlText`, `numFmt`
  upperLetter/lowerLetter/decimal, đếm theo `numId`/`ilvl`)).
- Mỗi `w:p` → một đoạn gồm các **token**: `{t:'text', s, b, i, u, red, hl, sup, sub}`,
  `{t:'tab'}`, `{t:'br'}`, `{t:'math', mathml}`, `{t:'img', name, w, h}`, `{t:'ole', progId}`.
  - Gạch chân: `w:u` có `w:val` khác `none`. Đỏ: `w:color` gần đỏ (R ≥ 0xB0, G ≤ 0x60, B ≤ 0x60).
    Tô nền: `w:highlight` (khác `none`) hoặc `w:shd w:fill` khác `auto`/`FFFFFF`.
  - `w:vertAlign` superscript/subscript → `sup`/`sub`.
  - Ảnh: `w:drawing … a:blip r:embed` → rels → `word/media/…`; đổi tên ASCII `img_001.png`…;
    kích thước từ `wp:extent cx/cy` (EMU/9525 = px). Ảnh **EMF/WMF** (thường là công thức
    MathType hoặc hình vẽ cũ) trình duyệt không hiển thị được → token `ole`/`img` kèm
    cảnh báo `error` cho câu chứa nó: "Câu 5 có công thức MathType/ảnh WMF — trong Word
    chọn MathType → Convert Equations → Office Math (hoặc chụp lại thành ảnh PNG)".
  - `w:object`/`o:OLEObject ProgID="Equation.DSMT4|Equation.3"` → token `ole` (như trên).
  - `m:oMath` / `m:oMathPara` → `omml.toMathML(node)` → token `math`.
  - Bảng `w:tbl` → khối riêng: `{kind:'table', rows:[[cell paragraphs…]]}`.
- Dựng HTML từ token: `<strong>`, `<em>`, `<u>`, `<sup>`, `<sub>`, `<br>`, tab → khoảng trắng,
  ảnh `<img src="images/img_001.png" alt="" style="max-width:100%;height:auto" width=…>`,
  bảng `<table style="border-collapse:collapse">` + ô `style="border:1px solid #999;padding:4px 8px"`.
  **Màu đỏ/gạch chân dùng để đánh dấu đáp án thì KHÔNG đưa vào HTML phương án.**
- Văn bản có `$…$` (LaTeX) → `latex.toMathML()` (cho giáo viên gõ công thức nhanh).

### 3.2 Quy ước mẫu Word (giáo viên soạn theo)
Mọi từ khoá không phân biệt hoa thường, chấp nhận có/không dấu tiếng Việt.

| Dòng / đánh dấu | Ý nghĩa |
|---|---|
| `NGÂN HÀNG: <tên>` | Bắt đầu một ngân hàng mới (một file có thể có nhiều). **Mọi nội dung trước dòng `NGÂN HÀNG:` đầu tiên bị bỏ qua** (chỗ để phần hướng dẫn trong file mẫu). Không có dòng nào → tên ngân hàng = tên file. |
| `ĐIỂM MẶC ĐỊNH: 0,25` | Điểm mỗi câu từ đây trở đi (mặc định 1). |
| `PHẦN I…` / `PHẦN 2…` (đoạn bắt đầu bằng PHẦN + số La Mã/số) | Tiêu đề phần — ghi vào `meta.part`, không thuộc câu nào. Nếu tiêu đề chứa "đúng sai" → loại mặc định `tf`; "trả lời ngắn" → `short`; "tự luận" → `essay`; "nhiều phương án"/"trắc nghiệm" → `mc`. |
| `ĐOẠN DẪN:` … `HẾT ĐOẠN DẪN` | Đoạn dẫn dùng chung, gắn vào `stimulus` của mọi câu nằm giữa `ĐOẠN DẪN:` và `HẾT ĐOẠN DẪN` (hoặc tới `ĐOẠN DẪN:`/`NGÂN HÀNG:`/`PHẦN` kế tiếp). Phần chữ sau dấu `:` trên cùng dòng thuộc đoạn dẫn. |
| `Câu 7.` / `Câu 7:` / `Câu 7 –` / `Question 7.` ở đầu đoạn | Bắt đầu câu hỏi số 7. Ngay sau có thể có `(0,5 điểm)`/`(1đ)`, mức độ `[NB]`/`[TH]`/`[VD]`/`[VDC]`, và **thẻ loại** (xem dưới), theo thứ tự bất kỳ. |
| Thẻ loại `[TN]` `[NĐ]` `[ĐS]` `[TLN]` `[SỐ]` `[ĐIỀN]` `[CHỌN]` `[GHÉP]` `[TL]` | Ép loại câu: mc, ma, tf, short, num, blanks, dropdowns, matching, essay. Không có thẻ → tự nhận diện (§3.3). |
| `A.` `B)` `C:` … `H.` ở đầu đoạn (kể cả nhãn do Word tự đánh số) | Phương án. Nhiều phương án trên **một dòng** ngăn bằng tab/khoảng trắng (`A. 1  B. 2  C. 3  D. 4`) được tách (chỉ tách tại nhãn kế tiếp đúng thứ tự A→B→C…, và chỉ khi đoạn bắt đầu bằng nhãn). Phương án nằm trong **bảng** (mỗi ô một phương án bắt đầu bằng nhãn) cũng nhận. `*A.` = đánh dấu đúng. |
| `a)` `b)` `c)` `d)` ở đầu đoạn | Ý của câu Đúng/Sai (`tf`). |
| `Đáp án: B` / `ĐA: B` / `Answer: B` | Đáp án tường minh — **ưu tiên cao nhất**. mc: một chữ; ma: `A, C` hoặc `AC`; tf: `ĐSĐS` / `a-Đ, b-S, c-Đ, d-S` / `a) Đúng b) Sai…` (chấp nhận Đ/S, Đúng/Sai, T/F, True/False); short: các cách viết ngăn bằng `;` hoặc `|` (`8/3; 2,67`); num: `12,5` hoặc `12,5 ± 0,1` hoặc `1,5 .. 2` (khoảng). |
| Gạch chân / chữ đỏ / tô nền **nhãn** phương án (hoặc ≥ 80% chữ của phương án) | Đáp án đúng khi không có dòng `Đáp án:`. tf: ý có nhãn được đánh dấu = Đúng, còn lại = Sai (chỉ áp dụng khi ít nhất một ý được đánh dấu). Có dòng `Đáp án:` mà mâu thuẫn với đánh dấu → cảnh báo `warn`, dùng dòng `Đáp án:`. |
| `[[Hà Nội]]`, `[[8/3\|2,67]]` trong nội dung câu | Ô điền (blanks): các cách viết đúng ngăn bằng `\|`. |
| `[[*Hà Nội\|Huế\|Đà Nẵng]]` | Ô chọn thả xuống (dropdowns): `*` đánh dấu lựa chọn đúng. Một câu đã có ô chọn thì mọi ô phải là ô chọn. |
| `trái => phải` (hoặc `->`, `→`) mỗi dòng | Cặp ghép nối (matching). Dòng `Nhiễu: x; y` = vế phải gây nhiễu. |
| `Lời giải:` / `Hướng dẫn giải:` / `Giải thích:` / `HDG:` / `Hướng dẫn chấm:` | Từ đây tới hết câu là `feedback` (HTML, giữ công thức/ảnh). |
| `BẢNG ĐÁP ÁN` (đoạn hoặc ngay trước một bảng) | Bảng đáp án cuối ngân hàng: các cặp `1.A 2.B 3-C 4: D` hoặc bảng Word hàng số / hàng chữ (ghép theo cột) → điền đáp án cho câu chưa có. |
| `HẾT` / `--- HẾT ---` | Bỏ qua. |

### 3.3 Tự nhận diện loại khi không có thẻ
1. Có ý `a)…d)` (≥ 2 ý) và không có phương án `A.` → `tf`.
2. Có phương án: đúng 1 đáp án → `mc`; ≥ 2 → `ma`. Phương án chỉ gồm "Đúng"/"Sai" → `mc`.
3. Có `[[…]]`: có `*` → `dropdowns`, không → `blanks`.
4. Có dòng `=>` → `matching`.
5. Không phương án, có `Đáp án:` → `short` (hoặc `num` khi có `±`/`..`).
6. Không gì cả → `essay` (cảnh báo `info`: "chưa có đáp án → tự luận, giáo viên chấm tay").
Loại mặc định của PHẦN (nếu có) chỉ dùng để phân xử khi mơ hồ.

## 4. Mẫu Excel (`js/xlsx.js`)

`parseXlsx(u8, {fileName, extraImages: {name: Uint8Array}}) → Promise<{banks, issues}>`

- Đọc sheet đầu tiên có ô tiêu đề `Nội dung câu hỏi` (tìm dòng tiêu đề trong 10 dòng đầu,
  khớp cột theo **tên tiêu đề**, không theo vị trí, không phân biệt hoa thường/dấu).
- Cột: `STT` | `Loại câu` | `Nội dung câu hỏi` | `Ảnh` | `A` `B` `C` `D` `E` `F` `G` `H` |
  `Đáp án` | `Điểm` | `Lời giải` | `Ngân hàng` | `Mức độ` | `Chủ đề`.
- `Loại câu` (danh sách thả xuống trong mẫu; nhận cả mã ngắn): `TN – Một đáp án`,
  `NĐ – Nhiều đáp án`, `ĐS – Đúng/Sai`, `TLN – Trả lời ngắn`, `SỐ – Điền số`,
  `ĐIỀN – Điền khuyết`, `CHỌN – Chọn từ danh sách`, `GHÉP – Ghép nối`, `TL – Tự luận`,
  `ĐOẠN – Đoạn dẫn`. Để trống → tự nhận diện như §3.3.
- Ý nghĩa cột theo loại: TN/NĐ: A–H là phương án; ĐS: A–D là các ý a–d, `Đáp án` = `ĐSĐS`;
  TLN: `Đáp án` = các cách viết ngăn `;`; SỐ: `12,5` / `12,5 ± 0,1` / `1,5 .. 2`;
  ĐIỀN/CHỌN: cú pháp `[[…]]` trong nội dung; GHÉP: mỗi ô A–H là `trái => phải`, ô không có
  `=>` là vế phải gây nhiễu; TL: `Lời giải` = hướng dẫn chấm.
- Dòng `ĐOẠN`: `Nội dung` là đoạn dẫn, gắn vào các dòng sau cho tới dòng `ĐOẠN` kế tiếp
  (dòng `ĐOẠN` có nội dung `HẾT` thì kết thúc).
- `Ngân hàng`: tên ngân hàng của dòng; trống → giữ ngân hàng của dòng trước; trống từ đầu →
  tên file. Nhiều tên → nhiều ngân hàng.
- Văn bản ô: rich text (`<r><rPr><b/><i/><u/><vertAlign/>`) → HTML; xuống dòng trong ô → `<br>`;
  `$…$` → MathML qua `latex.js`.
- Ảnh: (1) cột `Ảnh` ghi tên file (nhiều tên ngăn `;`) → lấy từ `extraImages` (giáo viên kéo thả
  ảnh/thư mục/zip ảnh kèm theo); (2) **ảnh dán nổi trên trang tính** (`xl/drawings/drawingN.xml`,
  neo `xdr:from/xdr:row`) gán cho câu ở dòng đó, "Văn bản thay thế" (`xdr:cNvPr descr`) → `alt`; (3) ảnh "Place in cell" (`xl/richData`) nếu đọc được.
  Ảnh đặt sau nội dung câu. Thiếu ảnh → `error`.
- Ô gộp, ô công thức (`<f>` dùng giá trị `<v>`), ô kiểu `s`/`inlineStr`/`str`/`n`/`b` đều phải đọc đúng;
  số dạng `0.25` → hiển thị theo chuỗi gốc khi có thể (`numFmt` không cần).

## 5. Xuất QTI (`js/qti.js`)

`buildPackages(banks, opts) → Promise<[{ fileName, bytes: Uint8Array, bankTitles: [..], counts, issues }]>`
(mảng có thêm `.issues` = mọi vấn đề, kể cả của ngân hàng không tạo được gói)
`buildFiles(banks, opts) → [{path, data, pkg}]` (không nén, để test; `pkg` = tên zip; mảng có `.issues`).
`prepare(banks, opts) → { packages: [{fileName, files, bankTitles, counts, issues}], issues }`, `normalizeOptions(opts)`.
`counts = {mc, ma, tf, short, num, blanks, dropdowns, matching, essay, text, total, items, skipped, excluded, points}`
(`items` = số item QTI — tf tách tính N; `skipped` = câu lỗi bị bỏ; `excluded` = chỗ `null`).

**Câu bị loại giữ vị trí:** ident item = vị trí trong `bank.questions` (cần ổn định để "Ghi đè" khớp câu cũ),
nên bên gọi (giao diện) KHÔNG xoá câu lỗi/bỏ chọn mà thay bằng `null`: qti bỏ qua im lặng (không issue),
đếm vào `counts.excluded`. Ngân hàng toàn `null` → không tạo gói, chỉ `warn`.

```js
opts = {
  target: 'itembank' | 'classic',   // mặc định 'itembank'
  tfMode: 'dropdowns' | 'split',     // tf → 1 câu nhiều ô chọn Đúng/Sai, hoặc tách N câu Đúng/Sai
  stimulus: 'each' | 'none',         // chèn đoạn dẫn vào đầu từng câu
  math: 'mathml' | 'image',          // 'image' = <img class="equation_image"> từ LaTeX (math.mathmlToLatex)
  includeFeedback: true,
  numberInTitle: true
}
```

### 5.1 Hai bố cục
- **`classic`** (chỉ tạo Question Bank của Classic Quizzes, KHÔNG tạo bài kiểm tra): MỘT zip
  cho mọi ngân hàng: `imsmanifest.xml` + `non_cc_assessments/<bankIdent>.xml.qti` (mỗi ngân hàng
  một file `<objectbank>`) + `images/*`. Đúng `reconciled.md §1.1–1.3`.
- **`itembank`** (khuyên dùng — mặc định; nhập vào **Item Bank của New Quizzes** qua
  Item Banks → ⋮ → Import Content, hoặc vào New Quiz, hoặc Classic): **mỗi ngân hàng một zip**,
  bố cục giống hệt Canvas xuất một bài kiểm tra Classic: `imsmanifest.xml` (resource
  `imsqti_xmlv1p2` + dependency tới `assessment_meta.xml` kiểu
  `associatedcontent/imscc_xmlv1p1/learning-application-resource`, như fixture trong
  `export-format.md §1a`) + `<quizIdent>/<quizIdent>.xml` (`<assessment>` có
  `<section ident="root_section">` chứa **mọi item trực tiếp**, không group, không
  sourcebank_ref) + `<quizIdent>/assessment_meta.xml` (title = tên ngân hàng,
  `shuffle_answers` false, `quiz_type` assignment, `points_possible` = tổng điểm,
  `allowed_attempts` 1, `available` false) + `images/*`. Tên zip = tên ngân hàng dạng ASCII
  (New Quizzes lấy tên file làm tiêu đề).
  `quizIdent = bankIdent + '_quiz'`.
- Ident item: `<bankIdent>_q<NN>` (+ `_s<k>` khi tách tf). Ident phương án: số nguyên
  `NN*100+k`; vế phải ghép nối `NN*100+50+k` (dãy số duy nhất — xem reconciled §2.0).

### 5.2 Ánh xạ loại → Canvas (reconciled §2)
| Loại | Canvas | Ghi chú |
|---|---|---|
| mc | multiple_choice_question (§2.1) | phương án HTML → `texttype="text/html"`, text thuần → `text/plain` |
| ma | multiple_answers_question (§2.3) | `<and>` + `<not>` |
| tf | `dropdowns`: multiple_dropdowns_question, stem `<p>a) … [s1]<br>b) … [s2]…</p>` (ý có thẻ khối — nhiều đoạn, bảng, danh sách — thì mỗi ý một `<div>` để không lồng `<p>`), mỗi ô `Đúng`/`Sai` · `split`: N câu multiple_choice Đúng/Sai, điểm chia đều | thang 0,1/0,25/0,5/1 của Bộ **không** làm được trên Canvas → cảnh báo info một lần |
| short | short_answer_question (§2.4) | `answers` đã qua `answerVariants` |
| num | numerical_question (§2.8) | luôn có `<or>`; khoảng dùng `vargte`/`varlte` |
| blanks | fill_in_multiple_blanks_question (§2.5) | `Add` + PCT |
| dropdowns | multiple_dropdowns_question (§2.6) | `Add` bắt buộc |
| matching | matching_question (§2.7) | danh sách vế phải giống nhau ở mọi lid |
| essay | essay_question (§2.9) | |
| text | text_only_question (§2.10) | points 0 |

`feedback` → `general_fb` (FB_COND + FB_BLOCK). Thứ tự phần tử và escape đúng reconciled §2.0
(entity-escape, không CDATA; bọc stem trong `<div>`).

### 5.3 Kiểm tra trước khi đóng gói (lỗi → không xuất câu đó, trả về trong `issues`)
- mc: đúng 1 phương án đúng, ≥ 2 phương án; ma: ≥ 1 đúng, ≥ 2 phương án.
- tf: ≥ 1 ý, mỗi ý có `value` boolean.
- short: ≥ 1 cách viết không rỗng. num: số hữu hạn.
- blanks/dropdowns: mỗi id xuất hiện **đúng một lần** dạng `[id]` trong stem; id `^[a-z][a-z0-9_]{0,15}$`;
  dropdown có ≥ 2 lựa chọn và đúng 1 đúng; lựa chọn/đáp án là text thuần (không HTML).
- matching: ≥ 2 cặp; vế phải text thuần, không ảnh.
- Mọi `<img src>` trỏ tới file có trong `images`; không còn `data:` URI.
- Độ dài stem (sau khi chèn đoạn dẫn) ≤ 15 000 ký tự, nếu không → `warn` và gợi ý `stimulus:'none'`.
- Điểm > 0 (trừ text).

## 6. Gói SCORM (`js/scorm.js`)

`parseScorm(u8, {fileName}) → Promise<{banks, issues}>` — port `docs/nghien-cuu` extractor
(`extract2.cjs`, 7 định dạng: tpl-enc, tpl-plain, ielts-v0, thpt-v0, k4-v0, kid-adv, kid-math;
giải mã `_KX` bằng `_KM`). Đánh giá đoạn mã dữ liệu bằng hàm do môi trường cung cấp:
`opts.evalData(code, varNames) → Promise<object>` — Node test dùng `vm`; trình duyệt dùng
**iframe sandbox** (`sandbox="allow-scripts"`, không `allow-same-origin`, `srcdoc` + `postMessage`)
để mã trong gói không chạm được tới token Canvas. Sau đó chuyển sang mô hình §1:
mcq→mc; multi→ma (điểm = số đáp án đúng); tf→tf; short→short; gap/flow→blanks (cả nhóm một câu);
bank→dropdowns (danh sách từ); letters/select→matching (vế phải = "A. Tên"/"ix. Tiêu đề");
mistake→mc (stem gạch chân các đoạn có nhãn). Đoạn dẫn: `passage`/`pre`/`instr`/`EXAM.note`
cần cho câu → `stimulus`. Ví dụ (`example`) không xuất. Class CSS của gói → inline style
(bảng `mini`, `scrollx`, `hemo`, `var(--x)`) qua `html.cleanForCanvas`.

## 7. Làm sạch HTML (`js/html.js`)

`cleanForCanvas(html, {images, imageMap, cssMap, rootVars}) → {html, issues, usedImages}`:
bộ phân tích HTML chịu lỗi tự viết (thẻ rỗng, thuộc tính không ngoặc, thực thể, MathML).
- Giữ thẻ trong allowlist Canvas (reconciled §5) + MathML; bỏ `script style svg input button label`
  (svg → cảnh báo); `<s>` → `<del>`; class đã biết → style inline; `var(--x)` → giá trị.
- `<mspace width>` → `<mtext>&#x2009;</mtext>`; bỏ thuộc tính không có trong allowlist MathML.
- `img src`: ánh xạ đường dẫn gốc → `images/<tên ASCII>`; `data:` URI → tách thành file.
- Thuộc tính `on*`, `loading`, `contenteditable` bị bỏ.
`toPlainText(html)` cho các ô text thuần (dropdown, vế phải ghép nối): bỏ thẻ, MathML → chữ Unicode
(`x²`, `√`, `½`…) bằng `math.mathmlToText`.

## 8. Công thức (`js/math.js`, `js/omml.js`, `js/latex.js`)
- `omml.toMathML(ommlNode)`: m:oMath/m:oMathPara, m:r, m:f (bar/noBar/lin), m:sSup, m:sSub,
  m:sSubSup, m:sPre, m:rad (deg/degHide), m:nary (∫∑∏, limLoc, subHide/supHide), m:d (begChr/endChr/
  sepChr), m:func, m:limLow, m:limUpp, m:acc (vectơ U+20D7, mũ), m:bar, m:groupChr, m:eqArr→mtable,
  m:m→mtable, m:box, m:borderBox, m:sty/scr, m:nor. Chữ → mi/mn/mo đúng chuẩn; chữ kép (`m:scr` double-struck) → ký tự Unicode ℝ ℕ 𝔸… (Chrome bỏ qua `mathvariant`), như `latex.js`.
  Kết quả `<math xmlns="http://www.w3.org/1998/Math/MathML">…</math>` (inline) hoặc
  `display="block"` cho m:oMathPara.
- `latex.toMathML(tex)`: \frac \dfrac \sqrt[n]{} ^ _ \int \sum \prod \lim \vec \overline \left \right
  \begin{cases} \begin{matrix}/pmatrix, chữ Hy Lạp, \le \ge \ne \pm \cdot \times \infty \to \in
  \mathbb{R}, \text{}, \log \ln \sin \cos \tan.
- `math.mathmlToLatex(mathml)` (cho `opts.math='image'`) và `math.mathmlToText(mathml)`.

## 9. Kết nối Canvas qua API (`api/canvas.js`, `js/canvas-api.js`, `server.js`)

Canvas không cho trình duyệt gọi API từ tên miền khác (không CORS) → cần máy chủ trung gian.
Theo `docs/nghien-cuu/rest-api.md`.
- `api/canvas.js` (Vercel, CommonJS `module.exports = async (req,res)=>…`), chọn thao tác bằng `?op=`:
  `config` (trả `{enabled, base, oauth, personalToken}`), `login` / `callback` / `logout` (OAuth2
  Developer Key; token lưu trong cookie httpOnly mã hoá AES-256-GCM bằng `SESSION_SECRET`, tự
  refresh khi hết hạn), `proxy` (`&path=/api/v1/...` — **chỉ** tới `CANVAS_BASE_URL`, đường dẫn
  khớp allowlist: users/self, courses (list, permissions, content_migrations + migrators + issues),
  question_banks, progress), `upload` (dự phòng khi upload_url không phải inst-fs, ≤ 4 MB).
  Biến môi trường: `CANVAS_BASE_URL`, `CANVAS_CLIENT_ID`, `CANVAS_CLIENT_SECRET`, `SESSION_SECRET`,
  `ALLOW_PERSONAL_TOKEN` (=1 cho chạy thử bằng token cá nhân gửi qua header `X-Canvas-Token`).
  Lỗi cấu hình trả 4xx (không 5xx). Không ghi log token.
- `server.js`: chạy cục bộ `node server.js` (cổng 8787) — phục vụ file tĩnh + cùng handler
  `api/canvas.js` tại `/api/canvas` (đọc biến môi trường từ `.env` nếu có, tự viết parser).
- `js/canvas-api.js` (trình duyệt): `getConfig()`, `me()`, `listCourses()`, `listBanks(courseId)`,
  `importPackage(courseId, {bytes, fileName, bankName, overwrite:true, onProgress})` = tạo
  content_migration `qti_converter` (JSON body, `settings.overwrite_quizzes` = true boolean) →
  POST multipart thẳng tới `pre_attachment.upload_url` (inst-fs cho phép CORS; nếu không phải
  inst-fs thì qua `op=upload`) với mọi `upload_params` rồi `file` cuối → theo dõi
  `progress_url`/migration (xử lý cả `queued`) → lấy `migration_issues`. Xử lý 403/429 giới hạn
  tốc độ bằng chờ lùi. Chỉ chạy tuần tự từng gói một khoá học.
- API chỉ đưa được vào **Question Bank (Classic)** (gói `classic`). Item Bank của New Quizzes
  **không có API** → giao diện ghi rõ: dùng nút tải gói rồi import tay (4 bước).

## 10. Giao diện (`index.html` + `js/app.js` + `huong-dan.html`)
Tiếng Việt, màu trường (navy `#23328C`, đỏ `#D21235`, vàng `#FFAD00`), font Be Vietnam Pro
(Google Fonts, có font hệ thống dự phòng), chạy tốt trên máy tính và iPad.
1. **Nạp đề**: vùng kéo thả nhận `.docx`, `.xlsx`, `.zip` (SCORM hoặc zip ảnh), ảnh rời;
   nút **Tải mẫu Word**, **Tải mẫu Excel**, **Hướng dẫn**.
2. **Soát câu hỏi**: tóm tắt (số câu theo loại, tổng điểm, số lỗi/cảnh báo); sửa tên ngân hàng;
   từng câu hiển thị như học sinh thấy (MathML, ảnh qua object URL), đáp án đúng tô xanh,
   các cách viết được chấp nhận, điểm (sửa được), lời giải, lỗi/cảnh báo; lọc "chỉ câu có lỗi";
   bỏ chọn câu không muốn xuất.
3. **Xuất**: chọn đích (Item Bank – New Quizzes / Question Bank – Classic), cách xử lý Đúng/Sai,
   đoạn dẫn, công thức → **Tải gói QTI**; hiện hướng dẫn import đúng đích đã chọn (nhãn menu
   Canvas tiếng Việt + tiếng Anh).
4. **Gửi thẳng lên Canvas** (chỉ hiện khi `/api/canvas?op=config` trả `enabled`): đăng nhập Canvas
   (OAuth) hoặc dán token cá nhân (chế độ thử), chọn khoá học, xem ngân hàng hiện có, gửi,
   thanh tiến trình, danh sách vấn đề sau import.

## 11. Mẫu (`tools/tao-mau.cjs` → `mau/`)
Sinh bằng Node, không thư viện (dùng `js/zip.js`):
- `mau/Mau-ngan-hang-cau-hoi.docx`: phần hướng dẫn (trước dòng `NGÂN HÀNG:`) + ví dụ đủ mọi loại,
  có công thức Office Math thật (phân số, căn, tích phân, hệ), một ảnh PNG, bảng, đoạn dẫn,
  bảng đáp án cuối.
- `mau/Mau-ngan-hang-cau-hoi.xlsx`: sheet `Câu hỏi` (tiêu đề cố định, cột rộng hợp lý, danh sách
  thả xuống cho `Loại câu` và `Mức độ`, dòng ví dụ mọi loại) + sheet `Hướng dẫn`.

## 12. Kiểm thử (`tests/chay-het.cjs`, chỉ Node, không thư viện)
- Đơn vị: core (parseXml, answerVariants, bankIdent), zip (vòng tròn ghi/đọc), omml, latex, math,
  html.cleanForCanvas.
- Mẫu Word/Excel → số câu/loại/đáp án đúng như mong đợi.
- Mọi gói SCORM trong `C:/Users/Administrator/Downloads/*SCORM*.zip` (nếu có) → QTI cả hai bố cục.
- **Bộ kiểm tra QTI độc lập** (`tests/kiem-qti.cjs`) mô phỏng quy tắc importer Canvas
  (reconciled §0–§5): XML hợp lệ; manifest ↔ file; mọi img có trong manifest; mỗi item đúng
  khuôn của loại (Set/Add, `<or>` numeric, `[id]` đúng một lần, lid matching cùng danh sách…).
  Ảnh công thức `img.equation_image` với `src="/equation_images/<LaTeX mã hoá URL 2 lần>"` (R§4) không
  phải file trong gói: bộ kiểm tra chỉ đòi có `class="equation_image"` và giải mã được 2 lần.
- **Đầu-cuối** (`tests/e2e.test.cjs`): 2 mẫu + mọi gói SCORM + fixture docx/xlsx + một Excel tự dựng
  (chữ thuần có `<`, `&`) → lọc như giao diện (`app.banksDeXuat`) → `qti.buildPackages` với 8 tổ hợp
  (itembank|classic × tfMode × math) → `kiem-qti` 0 lỗi, 0 cảnh báo; **đối chiếu đáp án** Canvas sẽ chấm
  đúng (mô phỏng importer + `grade()`) với đáp án giáo viên đánh dấu, cho từng câu, kèm phép chấm sai.
- **Nạp trang** (`tests/nap-trang.test.cjs`): `<script>` của `index.html` đúng thứ tự, `node --check` mọi
  file JS, nạp trong vm kiểu trình duyệt — chỉ `canvas-api.js`/`app.js` được chạm DOM lúc nạp.
