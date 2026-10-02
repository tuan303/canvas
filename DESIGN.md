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

### 3.4 Đề Word không theo mẫu (đọc từ đề thật của trường, fixture tổng hợp cùng cấu trúc)
- **Hai chế độ đọc**: tài liệu có `Câu N` giữ cách đọc §3.2; tài liệu không có chữ "Câu" đọc theo **số trần**
  (`12.`, `12)`, `14<tab>`).
- **Nhóm hướng dẫn**: dòng "Questions 1-6" / "từ câu 18 đến 22" hoặc lệnh bài tập ("1. Look and CIRCLE … (…/5 points)")
  mở một nhóm; chữ và bài đọc của nhóm thành `stimulus` của các câu trong nhóm (nhóm lồng được).
- **Tiêu đề mục**: "I. Vocabulary", "B. GRAMMAR", "READING PASSAGE 2", "Part 2" là tiêu đề, không dính vào phương án trước.
- **Bảng**: bảng câu hỏi đọc theo hàng; bảng một ô bọc ngoài được bỏ bọc. Câu ví dụ "0." bị bỏ (cảnh báo info).
- **Đáp án đánh dấu** (đề IELTS tô vàng): chữ tô ngay sau số câu nội dòng, đáp án trong ngoặc cuối dòng (`[FALSE]`,
  `[C]`, `[v]`), nhãn phương án tô nền; danh sách lựa chọn dùng chung (A–F, TRUE/FALSE/NOT GIVEN, đoạn A–G) biến câu
  thành trắc nghiệm. "Answer: ____" là dòng viết, không phải đáp án.
- **Mẫu upload câu hỏi**: `Câu N [OC-NB]:` (một đáp án), `[MC]` (nhiều), `[TF]`, `[FB]`/`[SDL]` với ô `[[1]]` khai báo
  `[[1]] = 50` + lựa chọn A) B)…, `[ES]` tự luận, `[EM]` câu chùm gồm câu con `[TF]: …`; `ANSWER: A=30, B=-10` (trọng số
  > 0 = đúng). Chỉ nhận theo cú pháp (chưa xác định được nền tảng gốc).
- Lỗi đối tượng ChemWindow/OLE không còn gợi ý MathType; đoạn dẫn dùng chung chỉ báo cảnh báo một lần.

### 3.5 File đáp án riêng (HDC / KEY / ĐÁP ÁN)
| Hàm | Mô tả |
|---|---|
| `parseDocx(u8, {fileName, answerKey?})` | File **chỉ có đáp án** → `{banks: [], issues, keyOnly: true, key}` (không phải ngân hàng). `answerKey` (một hoặc mảng kết quả `parseAnswerKey`) → áp ngay khi đọc. |
| `parseAnswerKey(u8, {fileName}) → {answers, count, issues}` | `answers = { khoáPhần: { sốCâu: đápÁn } }` (khoá phần `'1'`/`'2'`/`'3'` theo "Phần I/II/III", hoặc `''`). Đọc bảng "Câu – Đáp án", dòng `Câu 1: A` / `36. sentence`, bảng THPT 2025 (Phần II Đ/S từng ý, Phần III ô chữ số → `12,5`), bỏ mã năng lực cuối (`A - 4.0.TA.1.3`). |
| `applyAnswerKey(banks, key) → {matched, filled, same, conflicts, mismatched, unused, issues}` | Sửa câu **tại chỗ**, chỉ điền câu còn thiếu; câu đã có đáp án khác → giữ đáp án trong đề + `warn`. Đáp án ngắn cho câu tự luận → `short`, dài → vào `feedback`. Kiểm tra lại câu (`validateQuestion`). Áp lại lần hai vô hại (đã có → "trùng"). |
| `isAnswerKeyName(name)`, `answerKeyBaseName(name)` | Tên file có chữ chỉ đáp án (HDC, KEY, ĐÁP ÁN, Hướng dẫn chấm, Lời giải…) / tên gốc bỏ các chữ đó (`26.12.HH.KS.HDC.0301` → `26.12.hh.ks.0301`) để ghép với file đề. |

Giới hạn: hướng dẫn chấm chỉ có lời giải tự luận (không chữ cái / Đ/S / số) không tự nhận là file đáp án (giao diện
có nút "Đây là file đáp án" gọi `parseAnswerKey`); danh sách tiêu đề IELTS > 8 lựa chọn (i–x) thành trả lời ngắn;
text box vẫn bị bỏ (kèm cảnh báo).

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
  số thường `0.25` hiện bằng dấu chấm như chuỗi gốc (giáo viên máy tiếng Việt thấy `0,25` — quyết định sản phẩm còn mở).
- **Định dạng số** (`xl/styles.xml`, `numFmt`, hệ ngày 1904): ngày, giờ, phần trăm, phân số hiện như Excel hiển thị
  (`25%`, `1/2`), và ô phần trăm/ngày **không** đưa số gốc vào đáp án số.
- **Bẫy ngày của Excel**: gõ `1/2`, `8/3` ở ô định dạng chung thành ngày. Ngày **không có năm** ở cột nội dung,
  phương án, đáp án, điểm, lời giải → `error` nêu ô và cách sửa (định dạng ô Text hoặc gõ `'1/2`), câu không xuất.
  Ngày **có năm** → `warn` (ngày/tháng có thể đảo trên máy tiếng Anh).
- Đối tượng nổi không phải ảnh (text box, Equation, biểu đồ, hình vẽ) trên dòng câu hỏi, dòng **ẩn / bị lọc** →
  `warn` đúng dòng. Ảnh "Place in Cell" lấy alt từ ô mô tả của Excel, trừ khi đó là đường dẫn / tên file (Excel tự điền).

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

**Sai khác có chủ đích so với reconciled §2.0 (tìm ra bằng bộ mô phỏng Canvas, `tests/sim-chay.cjs`):**
- Phương án, vế trái ghép nối và **lời giải** là HTML nhưng thực chất **chỉ có chữ** (sau khi bỏ `p`/`div`/`span` không
  thuộc tính và `<br>` đầu/cuối) mà chứa `&`, `<`, `>` hoặc dấu cách cứng → xuất `texttype="text/plain"` với chữ đã giải
  thực thể. Lý do: Canvas lưu chuỗi đã thoát ("2 &amp;lt; 3") vào trường chữ thuần và trang làm bài in qua ERB escape →
  học sinh thấy nguyên `&lt;`. (FB_BLOCK của lời giải vì vậy có thể là `text/plain`, không luôn `text/html`.)
  `tests/kiem-qti.cjs` cảnh báo `html-escaped-text` khi gặp mảnh `text/html` dạng này (phương án, vế trái, phản hồi).
- Lựa chọn thả xuống, vế phải ghép nối, vế phải gây nhiễu: gộp xuống dòng và khoảng trắng kép.
- `math: 'image'`: `<math>` rỗng bị bỏ (không giữ kèm cảnh báo).
- **Lưới an toàn**: HTML lẽ ra đã làm sạch mà còn `script`, `on…=`, `javascript:`… → làm sạch lại bằng
  `html.cleanForCanvas`; không có `html.js` → câu đó **không xuất**. (Canvas chỉ bóc thẻ bọc ngoài cùng: `<center><script>`
  trong lời giải còn `<script>` sau khi import.)

### 5.3 Kiểm tra trước khi đóng gói (lỗi → không xuất câu đó, trả về trong `issues`)
- mc: đúng 1 phương án đúng, ≥ 2 phương án; ma: ≥ 1 đúng, ≥ 2 phương án.
- tf: ≥ 1 ý, mỗi ý có `value` boolean.
- short: ≥ 1 cách viết không rỗng. num: số hữu hạn.
- blanks/dropdowns: mỗi id xuất hiện **đúng một lần** dạng `[id]` trong stem; id `^[a-z][a-z0-9_]{0,15}$`;
  dropdown có ≥ 2 lựa chọn và đúng 1 đúng; lựa chọn/đáp án là text thuần (không HTML).
- matching: ≥ 2 cặp; vế phải text thuần, không ảnh.
- Mọi `<img src>` trỏ tới file có trong `images`; không còn `data:` URI.
- Độ dài stem (sau khi chèn đoạn dẫn) ≤ 15 000 ký tự, nếu không → `warn` và gợi ý `stimulus:'none'`.
- Stem trống: `core.validateQuestion` chỉ cảnh báo khi **cả đoạn dẫn** cũng trống (câu điền bài đọc / ngữ âm có đề nằm
  hẳn trong đoạn dẫn là hợp lệ); xuất với `stimulus:'none'` mà câu như vậy → qti `warn` "chỉ nằm trong đoạn dẫn" (vẫn xuất).
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
- MathML: `style` qua **cùng allowlist CSS** với HTML (Canvas xoá `font-weight`, `opacity`…); `script`/`style`/thẻ nhúng
  trong MathML bị bỏ **cả nội dung** (không thành chữ hiện ra); `<semantics>` lấy con MathML thật đầu tiên; thẻ token
  giữ chữ của thẻ lồng; `<math>` rỗng bị bỏ. Thẻ lạ bọc ngoài (`<center>`, `<foo>`) không che được script/style/`on*`.
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
  `config` (trả `{enabled, base, oauth, personalToken, loggedIn, user}`), `login` / `callback` / `logout` (OAuth2
  Developer Key; token lưu trong cookie httpOnly mã hoá AES-256-GCM bằng `SESSION_SECRET`, tự
  refresh khi hết hạn), `proxy` (`&path=/api/v1/...` — **chỉ** tới `CANVAS_BASE_URL`, đường dẫn
  khớp allowlist: users/self, courses (list, permissions, content_migrations + migrators + issues),
  question_banks, progress), `upload` (dự phòng khi upload_url không phải inst-fs, ≤ 4 MB).
  Biến môi trường: `CANVAS_BASE_URL`, `CANVAS_CLIENT_ID`, `CANVAS_CLIENT_SECRET`, `SESSION_SECRET`,
  `ALLOW_PERSONAL_TOKEN` (=1 cho chạy thử bằng token cá nhân gửi qua header `X-Canvas-Token`), `APP_URL` (**nên đặt**
  trên Vercel: Canvas so Redirect URI nguyên văn, tên miền preview sẽ bị từ chối), `CANVAS_SCOPES`,
  `CANVAS_QUAN_TRI` (=1: thêm 3 scope + 3 đường dẫn `GET accounts`, `GET accounts/:id/courses`, `GET courses/:id` để
  tài khoản quản trị tìm khoá không ghi danh; `config` trả `adminSearch`). Khoá không ghi danh còn chọn được bằng
  **dán link khoá học** (`canvasApi.parseCourseRef`) — không cần scope mới, quyền nhập do `checkPermissions` quyết định.
  Lỗi đăng nhập `invalid_scope` → `?canvas=loi&ma=thieu_scope&thieu=<scope của mình bị thiếu>` để giao diện nêu rõ.
  Lỗi cấu hình trả 4xx (không 5xx). Không ghi log token.
- **Phạm vi (scope)**: xin đúng **10** scope (`SCOPES` trong `api/canvas.js`): `GET users/:id`, `GET courses`,
  `GET courses/:course_id/permissions`, `GET question_banks`, `GET …/content_migrations/migrators`,
  `POST/GET …/content_migrations`, `GET …/content_migrations/:id`, `GET …/migration_issues`, `GET progress/:id`.
  Khoá cấu hình 13 scope cũ (rest-api.md §5b) vẫn chạy. Developer Key cần **Allow Include Parameters** (Enforce
  Scopes bỏ `include[]=term` nếu không bật). 401 không kèm `WWW-Authenticate` = thiếu scope → 403 `thieu_scope`
  (không làm mới token vô ích).
- **Bảo mật** (đã có test `tests/bao-mat.test.cjs`): PKCE S256 luôn bật (verifier suy từ state bằng HMAC
  `SESSION_SECRET`); state/code kiểm định dạng; cookie `__Host-` trên https; host dựng `redirect_uri` được kiểm;
  phiên không có hạn bị từ chối; tối đa 2 lần làm mới token mỗi yêu cầu; **đăng xuất chỉ POST + `X-NH-Client`**, làm mới
  trước khi thu hồi nếu token hết hạn; proxy chặn `as_user_id`/`access_token`/`_method`/`api_key` ở query và thân JSON;
  phản hồi không phải JSON → `text/plain`; mọi phản hồi có CSP `sandbox` + `Referrer-Policy: no-referrer`; phản hồi > 4 MB
  → 502; `Sec-Fetch-Site` khác nguồn → 403. **`op=upload` phải kèm `&course=&migration=`**: máy chủ hỏi Canvas (bằng
  token của chính người dùng) lần nhập đó có thật và đang `pre_processing` rồi mới chuyển tiếp; chỉ tới inst-fs
  (`*.inscloudgate.net`, `inst-fs*.instructure.com`), bucket S3, hoặc chính máy Canvas.
- Chưa thử trên 4015.instructure.com thật: PKCE, cookie `__Host-`, kiểm `Sec-Fetch-Site`. Không có rate limit trong
  hàm (mỗi instance Vercel một bộ nhớ, cả trường chung một IP) → khuyên luật Vercel Firewall cho `/api/canvas`.
- `server.js`: chạy cục bộ `node server.js` (cổng 8787) — phục vụ file tĩnh + cùng handler
  `api/canvas.js` tại `/api/canvas` (đọc biến môi trường từ `.env` nếu có, tự viết parser).
- `js/canvas-api.js` (trình duyệt): `getConfig()`, `me()`, `listCourses()`, `listBanks(courseId)`,
  `importPackage(courseId, {bytes, fileName, bankName, overwrite:true, importQuizzesNext:false, onProgress, signal})` = tạo
  content_migration `qti_converter` (JSON body, khoá boolean thật — chuỗi `"false"` bị Ruby coi là true) →
  POST multipart thẳng tới `pre_attachment.upload_url` (inst-fs cho phép CORS, `credentials:'omit'`, không Referer; nếu
  không phải inst-fs thì qua `op=upload` kèm `course` + `migration`) với mọi `upload_params` rồi `file` cuối → theo dõi
  `progress_url`/migration (xử lý cả `queued`) → lấy `migration_issues`. Xử lý 403/429 giới hạn
  tốc độ bằng chờ lùi. Chỉ chạy tuần tự từng gói một khoá học; **mọi yêu cầu tới `/api/canvas` chạy lần lượt** (kể cả
  đăng xuất) để hai lần làm mới token song song không để lại token chết trong cookie.
- **Hai đích của `importPackage`:**

  | | Classic (mặc định) | `importQuizzesNext: true` |
  |---|---|---|
  | Gói | `classic` (objectbank, chỉ ngân hàng) | `itembank` (một `<assessment>` chứa mọi câu) — thiếu `assessment_meta.xml` → `CanvasError` `goi_sai`, không gửi gì |
  | `settings` | `question_bank_name` (+`question_bank_id`), `overwrite_quizzes: true` trừ khi `overwrite:false` | `import_quizzes_next: true`; không gửi ngân hàng mặc định (Canvas khoá ô này khi chọn New Quizzes); `overwrite_quizzes` chỉ khi `overwrite === true` |
  | Kết quả trên Canvas | Ngân hàng Classic (Bản cũ) tên = tên ngân hàng; gửi lại ghi đè đúng câu | Canvas nhập như Classic rồi chuyển **bài kiểm tra** thành **New Quiz cùng tên** (`QuizzesNext::Importers::CourseContentImporter`, cần khoá học bật `quizzes_next`; không bật → bài Classic). Mỗi lần gửi một New Quiz mới. Có cờ chuyển ngân hàng (`new_quizzes_bank_migrations`) thì **có thể** thêm Item Bank — **CHƯA XÁC NHẬN** |

  Kết quả trả thêm `importQuizzesNext`. `hasAssessment(u8)` / `zipEntryNames(u8)` đọc thư mục trung tâm của zip.
- Item Bank của New Quizzes **không có API** → giao diện ghi rõ: muốn chắc chắn có Item Bank thì tải gói rồi import tay.

## 10. Giao diện (`index.html` + `js/app.js` + `huong-dan.html`)
Tiếng Việt, màu trường (navy `#23328C`, đỏ `#D21235`, vàng `#FFAD00`), font Be Vietnam Pro
(Google Fonts, có font hệ thống dự phòng), chạy tốt trên máy tính và iPad.
1. **Nạp đề**: vùng kéo thả nhận `.docx`, `.xlsx`, `.zip` (SCORM hoặc zip ảnh), ảnh rời, file đáp án `.docx`;
   nút **Tải mẫu Word**, **Tải mẫu Excel**, **Hướng dẫn**.
   **File đáp án** (`parseDocx` trả `keyOnly`): một dòng riêng (biểu tượng "ĐA", số đáp án) với ô chọn **Điền đáp án vào
   file đề**. Ghép tự động (`app.chonDeChoKey(tenKey, dsDe, docx, choMotDe)`): (1) `answerKeyBaseName` trùng hẳn và duy
   nhất; (2) từ khoá tên (bỏ từ chung "đề/thi/kiểm/tra/chưa…") chung ≥ 80 % tập nhỏ hơn, có từ chứa chữ cái, hơn hẳn đề
   khác; (3) chỉ có một file đề **và** file đề đó nạp cùng lần hoặc trước file đáp án (`ng.lo`) — file đề tên khác nạp
   *sau* có thể là đề khác nên không tự ghép. Ứng viên chưa đọc xong → chờ. Áp bằng `app.apDapAnChoMuc` (=
   `docx.applyAnswerKey` + xoá bộ nhớ đệm lỗi của mục) → bước 2 soát lại; kết quả "khớp M — điền F, trùng S, khác C" hiện
   trên cả hai dòng file, cảnh báo "khác đề" ở từng câu. **Đổi đích / "Không điền" / bỏ file đáp án → đọc lại file đề cũ
   từ byte gốc** (giữ tên, điểm, câu bỏ chọn đã sửa) rồi áp lại các file đáp án còn trỏ vào nó. File tên kiểu đáp án
   (không phải "…chưa/không có đáp án…") mà đọc ra đề → nút **Đây là file đáp án** (`parseAnswerKey`). Mọi thao tác này
   xếp chung hàng đợi với việc nạp file.
2. **Soát câu hỏi**: tóm tắt (số câu theo loại, tổng điểm, số lỗi/cảnh báo); sửa tên ngân hàng;
   từng câu hiển thị như học sinh thấy (MathML, ảnh qua object URL), đáp án đúng tô xanh,
   các cách viết được chấp nhận, điểm (sửa được), lời giải, lỗi/cảnh báo; lọc "chỉ câu có lỗi";
   bỏ chọn câu không muốn xuất.
3. **Xuất**: chọn đích (Item Bank – New Quizzes **mặc định** / Question Bank – Classic), cách xử lý Đúng/Sai,
   đoạn dẫn, công thức → **Tải gói QTI**; hiện hướng dẫn import đúng đích đã chọn (nhãn menu
   Canvas tiếng Việt + tiếng Anh). Item Bank: Item Banks ở điều hướng khoá học → + Add Bank → Create Bank → mở ngân
   hàng **vừa tạo, còn trống** → ⋮ (Options) → Import Content → chọn zip → Import; một zip một ngân hàng; chia sẻ bằng
   ⋮ → Share; lưu ý cả hai hệ đều tên "Ngân Hàng Câu Hỏi" (Classic thêm "(Bản cũ)"). Khi `op=config` có `base`, đầu
   hướng dẫn có dòng **"Canvas của trường: 4015.instructure.com"** (liên kết).
4. **Gửi thẳng lên Canvas** (chỉ hiện khi `/api/canvas?op=config` trả `enabled`): đăng nhập Canvas
   (OAuth) hoặc dán token cá nhân (chế độ thử), chọn khoá học, xem ngân hàng Classic hiện có, chọn **Đưa vào đâu?**
   (**Question Bank – Classic** — ô "Ghi đè" — hoặc **Chuyển sang New Quizzes khi nhập** — nhãn "cần thử lần đầu" cho
   phần Item Bank, ghi chú "mỗi lần gửi tạo một New Quiz mới"; lựa chọn nhớ trong `localStorage` `nh-canvas-dich`),
   gửi, thanh tiến trình, danh sách vấn đề sau import. Xong: liên kết `…/courses/<id>/quizzes` (New Quizzes) hoặc
   `…/question_banks` (Classic) và `…/courses/<id>/content_migrations` (các lần nhập + vấn đề), dựng từ `config.base`
   (`app.linkCanvas`). Liên kết "Sửa trên Canvas" của từng vấn đề chỉ hiện khi trỏ về đúng `base`.

**Hiện nội dung câu hỏi** (lớp bảo vệ thứ hai sau `html.cleanForCanvas`/bộ đọc file): `<template>` → bỏ thẻ
`app.THE_CAM` (script, style, iframe, object, embed, link, meta, base, form, svg, animate, set, animateMotion,
animateTransform, foreignObject, use…) cùng nội dung; bỏ thuộc tính `app.thuocTinhNguyHiem`: `on*`, `id`/`name` (không cho
nội dung câu chiếm id của giao diện như `vung-thong-bao`), `form`, `srcdoc`, `srcset`, `ping`, `formaction`, URL chạy mã
(`javascript:`/`vbscript:`/`data:` trừ ảnh PNG/JPG/GIF — so sau khi bỏ ký tự điều khiển/khoảng trắng, chặn
`java<TAB>script:`), `style` có `expression()`/`url(javascript:)`. `index.html` có CSP meta tối thiểu
`object-src 'none'; base-uri 'none'` (không giới hạn script: iframe `srcdoc` của bộ đọc SCORM kế thừa CSP của trang,
và trang phải chạy được bằng `file://`). CSP đầy đủ nên đặt bằng header trên Vercel (`vercel.json`, chưa có).

## 11. Mẫu (`tools/tao-mau.cjs` → `mau/`)
Sinh bằng Node, không thư viện (dùng `js/zip.js`):
- `mau/Mau-ngan-hang-cau-hoi.docx`: phần hướng dẫn (trước dòng `NGÂN HÀNG:`) + ví dụ đủ mọi loại,
  có công thức Office Math thật (phân số, căn, tích phân, hệ), một ảnh PNG, bảng, đoạn dẫn,
  bảng đáp án cuối.
- `mau/Mau-ngan-hang-cau-hoi.xlsx`: sheet `Câu hỏi` (tiêu đề cố định, cột rộng hợp lý, danh sách
  thả xuống cho `Loại câu` và `Mức độ`, dòng ví dụ mọi loại) + sheet `Hướng dẫn`.
- Đã mở bằng Word/Excel 365 thật (không phải sửa chữa file). Cột **A…H và Đáp án định dạng Text** (cả các dòng trống
  giáo viên thêm sau) để `1/2` không thành ngày; `Nội dung` và `Lời giải` để định dạng chung (ô Text > 255 ký tự hiện
  `####`). Dòng mới tự xuống dòng. **Ảnh ví dụ di chuyển và co giãn theo ô** (xoá dòng ví dụ là xoá luôn ảnh — Excel 365
  đã xác nhận), cột Ảnh rộng đủ một ảnh, mục 4 của sheet Hướng dẫn sang trang in mới.
- Word: font Be Vietnam Pro dự phòng **Arial** (máy không cài Be Vietnam Pro).
- Lời hướng dẫn viết cho giáo viên chưa từng dùng công cụ: tên menu Canvas tiếng Việt, mở ngân hàng **trống**, lưu
  .docx/.xlsx, đánh số tự động của Word dùng được, không đánh dấu phương án sai, số thập phân dùng dấu chấm (hoặc
  dùng TLN để nhận cả `2,5` và `2.5`), bẫy ngày, Place in Cell, cách xoá dòng ví dụ, không gộp ô nội dung.
- Fixture do Office thật tạo: `tests/fixtures/xlsx/dien-mau-bang-office.ps1` (office-giao-vien.xlsx/.docx,
  office-tu-lam.xlsx) và `tests/fixtures/docx/tao-word.ps1` (word-*.docx). Chạy nền / tiến trình riêng; Office ẩn,
  `DisplayAlerts=0`, đối số `SaveAs2`/`Quit` truyền theo tham chiếu (`[ref]`), chỉ dừng tiến trình chính script tạo (PID).

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
  (chữ thuần có `<`, `&`) → lọc như giao diện (`app.banksDeXuat`) → `qti.buildPackages` với 9 tổ hợp
  (itembank|classic × tfMode × math, thêm một tổ hợp không chèn đoạn dẫn / không lời giải / tên câu theo nội dung)
  → `kiem-qti` 0 lỗi, 0 cảnh báo; **đối chiếu đáp án** Canvas sẽ chấm
  đúng (mô phỏng importer + `grade()`) với đáp án giáo viên đánh dấu, cho từng câu, kèm phép chấm sai.
- **Nạp trang** (`tests/nap-trang.test.cjs`): `<script>` của `index.html` đúng thứ tự, `node --check` mọi
  file JS, nạp trong vm kiểu trình duyệt — chỉ `canvas-api.js`/`app.js` được chạm DOM lúc nạp.
- **Bộ mô phỏng Canvas** (`tests/sim-chay.cjs`, `tests/canvas-sim.test.cjs`): import.cjs + grade.cjs + bộ phân tích
  HTML5 của bộ mô phỏng nằm **ngoài repo**, chỉ đọc qua biến `CANVAS_SIM=<thư mục>`; không có → in "BỎ QUA" (các kiểm
  tra tĩnh vẫn chạy). Đối chiếu từng trường sau import (kể cả mỗi `[blank]` đúng một lần, trang làm bài có đúng một ô
  mỗi chỗ trống) + chấm thử đáp án giáo viên / đáp án sai. Sai khác là hành vi Canvas thật ghi trong `DA_BIET`.
- **Bảo mật** (`tests/bao-mat.test.cjs`): Canvas giả lập theo mã nguồn (redirect_uri nguyên văn, mã dùng một lần, PKCE,
  làm mới không trả refresh_token mới, 401 thiếu scope), proxy, op=upload, server.js (tên 8.3, Host), sandbox SCORM.
- **Word thật** (`tests/docx-word.test.cjs`): fixture do Word sinh (OMath, đánh số "Câu %1." theo kiểu đoạn, tô nền,
  bảng gộp/lồng, ảnh PNG). `tests/docx.test.cjs` kiểm cả đề thật trong `Downloads` khi có (bỏ qua khi không).
- **Giao diện** (`tests/app.test.cjs`): ghép file đáp án ↔ file đề theo tên, điền đáp án vào fixture tổng hợp
  (THPT + HDC, tiếng Anh + KEY, tiểu học + KEY) rồi xuất qua `kiem-qti` đạt; `thuocTinhNguyHiem`/`urlNguyHiem`;
  `linkCanvas`; thứ tự các bước Item Bank; bước 4 có hai đích và gửi đúng `importQuizzesNext`.
  `tests/api.test.cjs`: `import_quizzes_next: true` (boolean JSON, không kèm ngân hàng mặc định), gói objectbank bị từ
  chối (`goi_sai`) trước khi gửi yêu cầu nào.
