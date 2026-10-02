/* tests/sim-chay.cjs — đưa gói QTI do js/qti.js xuất qua BỘ MÔ PHỎNG import Canvas (canvas-sim) rồi đối chiếu
 * từng trường với mô hình câu hỏi nguồn, và chấm điểm bằng bộ chấm mô phỏng của Canvas.
 *
 * canvas-sim (ngoài repo, bản quyền AGPL — KHÔNG chép vào đây) chạy QTIMigrationTool THẬT (Python) + bản port
 * importer/sanitizer/link migrator/bộ chấm của Canvas. Chỉ tham chiếu qua biến môi trường:
 *     CANVAS_SIM=<thư mục canvas-sim>   (có import.cjs, grade.cjs)
 * Không đặt / sai đường dẫn / bộ mô phỏng không chạy được → BỎ QUA (thoát 0) kèm lý do.
 *
 * Nguồn: 2 file mẫu trong mau/, mọi C:/Users/Administrator/Downloads/*SCORM*.zip, mọi fixture docx/xlsx trong
 * tests/fixtures/, một Excel tự dựng (chữ thuần có < & …) và một ngân hàng tự dựng có HTML "độc" (đi qua
 * html.cleanForCanvas như bộ đọc). Mỗi nguồn → qti.buildPackages với 8 tổ hợp itembank|classic × tfMode
 * dropdowns|split × math mathml|image (+1 tổ hợp không đoạn dẫn/không lời giải/không đánh số) → importZip.
 *
 * Đối chiếu: số câu mỗi ngân hàng, tên ngân hàng + mã, loại câu (không bị hạ loại), điểm, tên câu, nội dung
 * (chữ hiển thị + bộ thẻ HTML so với HTML đã xuất, sau khi Canvas bỏ lớp bọc), phương án/trọng số/match_id/
 * mã ô, biên điền số, lời giải, ảnh (đã nối, không link hỏng), sanitizer không xoá gì, độ dài; mỗi [ô] còn
 * đúng một lần sau khi Canvas bỏ lớp bọc và trang làm bài thay đủ ô; chấm: đáp án giáo viên trọn điểm, trả lời
 * sai thấp hơn.
 *
 * Dùng:  CANVAS_SIM=… node tests/sim-chay.cjs [-v] [--json] [--tuan-tu] [--luong=N] [--nhanh] [lọc tên nguồn…]
 *   -v        in từng nguồn       --json   in kết quả JSON     --tuan-tu  một tiến trình (mặc định song song)
 *   --nhanh   chỉ 2 tổ hợp (itembank/dropdowns/mathml + classic/split/image)
 * Mô-đun: const sim = require('./sim-chay.cjs'); await sim.chay({loc, nhanh, luong}) → {boQua?, lyDo?, tk, lech, daBiet}
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const GOC = path.resolve(__dirname, '..');
const THU_MUC_SCORM = 'C:/Users/Administrator/Downloads';
const DUNG = 'Đúng', SAI = 'Sai';
const LOCALE = 'vi';
const HOST = ['4015.instructure.com'];

// Nạp module dự án lười (worker nạp lại riêng)
let M = null;
function mod() {
  if (M) return M;
  M = {
    core: require('../js/core.js'), html: require('../js/html.js'), math: require('../js/math.js'),
    docx: require('../js/docx.js'), xlsx: require('../js/xlsx.js'), scorm: require('../js/scorm.js'),
    qti: require('../js/qti.js'), app: require('../js/app.js'), zip: require('../js/zip.js')
  };
  return M;
}

/* ===================== Tìm bộ mô phỏng ===================== */

// → { dir, importZip, gradeQuestion, variableId } | { lyDo }
function timSim(env) {
  const p = String((env || process.env).CANVAS_SIM || '').trim();
  if (!p) return { lyDo: 'chưa đặt biến môi trường CANVAS_SIM (thư mục canvas-sim có import.cjs, grade.cjs)' };
  const dir = path.resolve(p);
  for (const f of ['import.cjs', 'grade.cjs']) {
    if (!fs.existsSync(path.join(dir, f))) return { lyDo: 'CANVAS_SIM="' + p + '" không có ' + f };
  }
  try {
    const imp = require(path.join(dir, 'import.cjs')), gr = require(path.join(dir, 'grade.cjs'));
    if (typeof imp.importZip !== 'function' || typeof gr.gradeQuestion !== 'function') return { lyDo: 'CANVAS_SIM: import.cjs/grade.cjs thiếu importZip/gradeQuestion' };
    try { PARSE5 = require(path.join(dir, 'lib', 'html5.cjs')).parseFragment || null; } catch (e) { PARSE5 = null; } // tuỳ chọn
    return { dir, importZip: imp.importZip, gradeQuestion: gr.gradeQuestion, variableId: gr.variableId };
  } catch (e) {
    return { lyDo: 'không nạp được bộ mô phỏng ở ' + dir + ': ' + (e && e.message) };
  }
}

/* ===================== Nguồn ===================== */

function dsNguon() {
  const out = [];
  ['Mau-ngan-hang-cau-hoi.docx', 'Mau-ngan-hang-cau-hoi.xlsx'].forEach(f => out.push({ nhom: 'mau', ten: f, file: path.join(GOC, 'mau', f) }));
  try {
    fs.readdirSync(THU_MUC_SCORM).filter(f => /SCORM.*\.zip$/i.test(f)).sort()
      .forEach(f => out.push({ nhom: 'scorm', ten: f, file: path.join(THU_MUC_SCORM, f) }));
  } catch (e) { /* máy khác: không có thư mục Downloads */ }
  ['docx', 'xlsx'].forEach(d => {
    const td = path.join(GOC, 'tests', 'fixtures', d);
    fs.readdirSync(td).filter(f => new RegExp('\\.' + d + '$', 'i').test(f)).sort()
      .forEach(f => out.push({ nhom: 'fixture-' + d, ten: f, file: path.join(td, f) }));
  });
  out.push({ nhom: 'tu-dung', ten: 'dau-so-sanh.xlsx', tao: 'xlsx' });
  out.push({ nhom: 'tu-dung', ten: 'html-doc.model', tao: 'model' });
  return out;
}

// Excel tự dựng: chữ thuần có < > & và tiếng Việt ở mọi ô chữ thuần (cùng ý với e2e)
async function taoXlsx() {
  const { taoXlsx } = require('./fixtures/xlsx/tao-xlsx.cjs');
  const H = ['STT', 'Loại câu', 'Nội dung câu hỏi', 'A', 'B', 'C', 'D', 'Đáp án', 'Điểm', 'Lời giải', 'Ngân hàng'];
  const NH = 'Dấu so sánh & ký tự đặc biệt';
  const rows = [[1, H],
    [2, [1, 'TLN', 'So sánh a và b biết a nhỏ hơn b', null, null, null, null, 'a<b; a < b; b>a', 1, 'Vì a<b nên b>a', NH]],
    [3, [2, 'CHỌN', 'Chọn quan hệ đúng: [[*x<y|x>y|x = y]] và [[x ≤ 1|*Hà Nội & Huế|“trích”]]', null, null, null, null, null, 0.5, null, NH]],
    [4, [3, 'GHÉP', 'Ghép biểu thức với kết luận', '2 < 3 => đúng: 2<3', '5 > 7 => sai: 5>7', 'Nhiễu: không xác định; A & B', null, null, 1, null, NH]],
    [5, [4, 'TN', 'Chọn mệnh đề đúng với x < 0', 'x<0', 'x>0', 'x & y', '|x| < 0', 'A', 0.25, null, NH]],
    [6, [5, 'ĐIỀN', 'Điền: 1 [[<|nhỏ hơn]] 2 và Thủ đô là [[Hà Nội|Ha Noi]]', null, null, null, null, null, 2, null, NH]],
    [7, [6, 'ĐS', 'Xét các mệnh đề:', 'a<b<c thì a<c', 'x² < 0 với mọi x', '1 & 2 là số', '−1 < 0', 'ĐSĐĐ', 1, null, NH]],
    [8, [7, 'SỐ', 'Giá trị gần đúng của π (hai chữ số thập phân)?', null, null, null, null, '3,14 ± 0,01', 0.5, null, NH]],
    [9, [8, 'SỐ', 'Một nghiệm nằm trong khoảng nào?', null, null, null, null, '-2 .. -1,5', 0.5, null, NH]],
    [10, [9, 'NĐ', 'Chọn các bất đẳng thức đúng', '1<2', '3<2', '0 ≤ 0', '−5 > −4', 'A, C', 1, null, NH]],
    [11, [10, 'TL', 'Chứng minh a² + b² ≥ 2ab', null, null, null, null, null, 2, '(a − b)² ≥ 0', NH]],
  ];
  return taoXlsx({ sheets: [{ name: 'Câu hỏi', rows }] });
}

// Ngân hàng tự dựng: HTML "độc" (thẻ lạ bọc script/style, on*, CSS ngoài allowlist, MathML có thuộc tính/
// style lạ, xuống dòng trong ô chữ thuần, [ô] trong đoạn dẫn…) — đi qua html.cleanForCanvas như bộ đọc làm.
function taoModel() {
  const { core, html } = mod();
  const anh = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1F, 0x15, 0xC4, 0x89, 0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]);
  const images = { 'hinh_1.png': anh };
  const sach = h => html.cleanForCanvas(h, { images }).html;
  const M1 = '<math><mstyle mathcolor="red" style="font-weight:bold;opacity:.5" onclick="x()"><mi href="javascript:alert(1)">x</mi>' +
    '<mspace width="0.3em"/><mo>≤</mo><mn>2</mn></mstyle><semantics><mi>y</mi><annotation encoding="TeX">y</annotation></semantics></math>';
  const qs = [
    { type: 'mc', stem: '<center><script>alert(1)</script><style>p{color:red}</style><p onclick="x()" style="font-weight:bold;letter-spacing:2px;color:#c00">Thẻ <b>lạ</b> bọc mã</p></center>' +
      '<foo><script>alert(2)</script>chữ trong thẻ lạ</foo><p>Ảnh: <img src="images/hinh_1.png" onerror="x()" loading="lazy" style="opacity:.3"></p><p>' + M1 + '</p>',
      choices: [{ id: 'A', html: 'Một\ndòng mới', correct: false }, { id: 'B', html: '<span style="font-weight:700">đậm</span> ' + M1, correct: true },
        { id: 'C', html: 'a<b', correct: false }, { id: 'D', html: '<center>giữa</center>', correct: false }],
      feedback: '<center><script>bad()</script>Lời giải <u>gạch</u></center>' },
    { type: 'blanks', stimulus: '<p>Đoạn dẫn nhắc tới [b1] và [x]</p>', stem: '<p>Điền: [b1]<br>dòng hai [b2]</p>',
      blanks: [{ id: 'b1', accepts: ['Hà Nội', 'Ha Noi'] }, { id: 'b2', accepts: ['2,5'] }] },
    { type: 'dropdowns', stem: '<div><p>Chọn [d1]</p></div>', dropdowns: [{ id: 'd1', options: ['một\ndòng', 'hai  dòng'], correct: 1 }] },
    { type: 'matching', stem: 'Ghép', pairs: [{ left: '<b>x</b><sup>2</sup>', right: 'bình\nphương' }, { left: 'căn', right: '√x' }], distractors: ['lập\nphương', '√x'] },
    { type: 'tf', stem: '<p>Xét:</p>', statements: [{ key: 'a', html: '<p>Ý một</p><p>đoạn hai</p>', value: true }, { key: 'b', html: 'Ý <i>hai</i>', value: false }] },
    { type: 'short', stem: '<p>Kết quả?</p>', answers: ['1/2', '0,5'] },
    { type: 'num', stem: 'Số?', numeric: { exact: 2.5, margin: 0.05 } },
    { type: 'essay', stem: '<table><tr><td onmouseover="x()">ô</td></tr></table>', feedback: '<p>Hướng dẫn</p>' },
    { type: 'ma', stem: 'Chọn', choices: [{ id: 'A', html: '1', correct: true }, { id: 'B', html: '2', correct: false }, { id: 'C', html: '3', correct: true }] },
    // HTML chỉ có chữ + thực thể (Canvas detect_html lưu chuỗi đã escape vào trường chữ) ở phương án, vế trái, lời giải
    { type: 'mc', stem: '<p>So sánh</p>', choices: [{ id: 'A', html: '<p>x &lt; 0</p>', correct: true }, { id: 'B', html: 'a&nbsp;&amp;&nbsp;b', correct: false },
      { id: 'C', html: 'a<br>b', correct: false }, { id: 'D', html: '<span>“trích” &gt; 1</span>', correct: false },
      { id: 'E', html: '<p><br>x &lt; 1<br></p>', correct: false }], feedback: '<p>Vì a &lt; b &amp; b &lt; c</p>' },
    { type: 'matching', stem: '<p>Ghép</p>', pairs: [{ left: '<span>a &amp; b</span>', right: 'và' }, { left: '<p>1 &lt; 2</p>', right: 'nhỏ hơn' }], distractors: [] },
    { type: 'dropdowns', stem: '<p>Ô chọn có ký tự đặc biệt [c1]</p>', dropdowns: [{ id: 'c1', options: ['a & b', 'x < y', '"trích" > 1', '  cách   xa  '], correct: 1 }] },
    { type: 'text', stem: '<p>Mục chỉ có chữ (text_only) — <em>đọc</em> rồi làm các câu sau.</p>', points: 0 },
    // dài gần giới hạn (16 384 ký tự Canvas, ảnh tính 49 ký tự sau khi đổi link): qti cảnh báo, Canvas vẫn giữ
    { type: 'essay', stem: '<p>' + 'Văn bản dài. '.repeat(1180) + '</p><p><img src="images/hinh_1.png" alt="hình"></p>' }
  ].map((q, i) => {
    const o = Object.assign({ id: 'q' + (i + 1), no: String(i + 1), title: 'Câu ' + (i + 1), points: 1, stimulus: '', feedback: '', meta: { level: '', topic: '', part: '', tags: [] }, issues: [] }, q);
    o.stem = sach(o.stem); o.stimulus = o.stimulus ? sach(o.stimulus) : ''; o.feedback = o.feedback ? sach(o.feedback) : '';
    if (o.choices) o.choices = o.choices.map(c => Object.assign({}, c, { html: core.looksLikeHtml(c.html) ? sach(c.html) : c.html }));
    if (o.statements) o.statements = o.statements.map(s => Object.assign({}, s, { html: sach(s.html) }));
    if (o.pairs) o.pairs = o.pairs.map(p => Object.assign({}, p, { left: core.looksLikeHtml(p.left) ? sach(p.left) : p.left }));
    return o;
  });
  const title = 'HTML độc <script> & "nháy"';
  // ngân hàng KHÔNG qua cleanForCanvas (dữ liệu lẽ ra đã sạch mà không sạch): lưới an toàn của qti phải làm sạch lại
  const tho = [
    { type: 'mc', stem: '<center><script>alert(1)</script><p onclick="x()">Chọn</p></center>', stimulus: '<foo><style>p{}</style>Đoạn dẫn</foo>',
      choices: [{ id: 'A', html: '<b onmouseover="x()">1</b>', correct: true }, { id: 'B', html: '<a href="javascript:alert(2)">2</a>', correct: false }],
      feedback: '<center><script>bad()</script>Giải <u>gạch</u></center>' },
    { type: 'essay', stem: '<marquee><form><input onfocus="x()"><p>Viết <iframe src="https://example.com"></iframe>bài</p></form></marquee>' }
  ].map((q, i) => Object.assign({ id: 't' + (i + 1), no: String(i + 1), title: 'Thô ' + (i + 1), points: 1, stimulus: '', feedback: '', meta: { level: '', topic: '', part: '', tags: [] }, issues: [] }, q));
  const t3 = 'Chưa làm sạch';
  return { banks: [{ title, ident: core.bankIdent(title), source: { kind: 'docx', name: 'html-doc' }, questions: qs, images, warnings: [] }, taoAllowlist(sach, images),
    { title: t3, ident: core.bankIdent(t3), source: { kind: 'docx', name: 'html-tho' }, questions: tho, images: {}, warnings: [] }], issues: [] };
}

// Mỗi thẻ (HTML Canvas cho phép + thẻ cấm + MathML) với thuộc tính độc, bọc trong thẻ lạ <center>/<foo>, có
// <script>/<style> bên trong → html.cleanForCanvas → nội dung câu tự luận + lời giải. Canvas (sanitizer thật) phải
// KHÔNG còn gì để xoá: HTML ta xuất không được dựa vào Canvas làm sạch (kể cả lỗ hổng bỏ bọc ở cấp ngoài cùng).
function taoAllowlist(sach, images) {
  const { core } = mod();
  const DOC = ' onclick="x()" ONMOUSEOVER="x()" style="color:#c00;font-weight:bold;opacity:.5;letter-spacing:2px;background:url(javascript:alert(1));behavior:url(x.htc)"' +
    ' id="i1" class="lop" title="tiêu đề" data-x="1" data-ans="A" contenteditable="true" loading="lazy" tabindex="1" formaction="javascript:x()" xlink:href="javascript:x()"';
  const HTML = ('a abbr address article aside b bdo big blockquote caption cite code col colgroup dd del details dfn div dl dt em figcaption figure ' +
    'font footer h1 h2 h3 h4 h5 h6 header i ins kbd legend li mark nav ol p pre q rp rt ruby samp section small span strike strong sub ' +
    'summary sup table tbody td tfoot th thead time tr tt u ul var center foo marquee blink form label button input select option textarea ' +
    'iframe object embed video audio source picture map area svg noscript template xmp s dir menu').split(' ');
  const MATH = ('mi mn mo ms mtext mspace mrow mfrac msqrt mroot mstyle merror mpadded mphantom mfenced menclose msub msup msubsup munder ' +
    'mover munderover mmultiscripts mtable mtr mtd maction semantics annotation annotation-xml foo').split(' ');
  const frag = [];
  HTML.forEach(t => {
    const them = t === 'a' ? ' href="javascript:alert(1)" target="_blank"' : t === 'td' || t === 'th' ? ' colspan="1" onfocus="x()"' : t === 'ol' ? ' start="2" type="a"' : '';
    frag.push('<center><' + t + DOC + them + '><script>alert("' + t + '")</script><style>*{display:none}</style>chữ ' + t + '</' + t + '></center>' +
      '<' + t + DOC + '>ngoài <b>bọc</b></' + t + '>');
  });
  frag.push('<a href="https://example.com/x?a=1&amp;b=2" onclick="x()">liên kết</a> <a href=" JaVaScRiPt:alert(1)">js</a> <a href="java&#x0A;script:alert(1)">js2</a>');
  frag.push('<img src="images/hinh_1.png"' + DOC + ' alt="hình" width="20" usemap="#m"><br' + DOC + '><hr' + DOC + '>');
  MATH.forEach(t => {
    frag.push('<math display="block" onclick="x()" href="javascript:x()" style="font-weight:bold;color:red"><mrow><' + t + DOC +
      ' mathvariant="bold" mathcolor="red" href="javascript:alert(1)" width="2em" linebreak="newline"><script>alert(1)</script><mi>x</mi><mtext><b>chữ</b><script>y()</script>' +
      '<style>*{}</style></mtext></' + t + '></mrow><annotation-xml encoding="text/html"><script>z()</script></annotation-xml></math>');
  });
  const qs = [];
  for (let i = 0; i < frag.length; i += 6) {
    const stem = sach(frag.slice(i, i + 6).join('<p>—</p>'));
    qs.push({ id: 'a' + i, no: String(qs.length + 1), title: 'Allowlist ' + (qs.length + 1), type: 'essay', points: 1, stimulus: '', stem,
      feedback: sach('<center><script>alert(1)</script>' + frag[i] + '</center>'), meta: { level: '', topic: '', part: '', tags: [] }, issues: [] });
  }
  const title = 'Allowlist Canvas';
  return { title, ident: core.bankIdent(title), source: { kind: 'docx', name: 'allowlist' }, questions: qs, images, warnings: [] };
}

async function docNguon(ng) {
  const { docx, xlsx, scorm } = mod();
  if (ng.tao === 'model') return taoModel();
  const u8 = ng.tao === 'xlsx' ? await taoXlsx() : new Uint8Array(fs.readFileSync(ng.file));
  if (/\.docx$/i.test(ng.ten)) return docx.parseDocx(u8, { fileName: ng.ten });
  if (/\.xlsx$/i.test(ng.ten)) return xlsx.parseXlsx(u8, { fileName: ng.ten });
  return scorm.parseScorm(u8, { fileName: ng.ten });
}

function toHop(nhanh) {
  const out = [];
  ['itembank', 'classic'].forEach(target => ['dropdowns', 'split'].forEach(tfMode => ['mathml', 'image'].forEach(math => out.push({ target, tfMode, math }))));
  out.push({ target: 'itembank', tfMode: 'dropdowns', math: 'mathml', stimulus: 'none', includeFeedback: false, numberInTitle: false });
  if (nhanh) return [out[0], out[7]];
  return out;
}
function tenToHop(o) {
  return o.target + '/' + o.tfMode + '/' + o.math + (o.stimulus === 'none' ? '/khong-doan-dan' : '') + (o.includeFeedback === false ? '/khong-loi-giai' : '') +
    (o.numberInTitle === false ? '/khong-so' : '');
}

/* ===================== Hành vi Canvas đã ghi nhận (không phải lỗi của gói) ===================== */
// Mỗi mục: { ma: mã lệch, re: khớp msg, vi: giải thích } — lệch khớp mục nào thì tính "đã biết", không làm test hỏng.
const DA_BIET = [
  { ma: 'python', re: /^Warning: objectbank not supported, looking inside for items$/,
    vi: 'QTIMigrationTool luôn in cảnh báo này với <objectbank> (bố cục ngân hàng Canvas tự xuất, reconciled §1.1) — vẫn đọc đủ item, gắn đúng ngân hàng' },
  { ma: 'python', re: /^Warning: var(gte|lte) not supported on String in QTI v2, re-run with --forcefibfloat/,
    vi: 'Điền số có sai số/khoảng: QTIMigrationTool cảnh báo (response_str + fibtype Decimal, đúng mẫu Canvas tự xuất) nhưng importer vẫn đọc đúng biên — đã đối chiếu biên và chấm' },
  { ma: 'html5', re: /^[^:]+: tbody: 0→\d+$/,
    vi: 'Bảng <table><tr> không có <tbody>: HTML5 (Nokogiri của Canvas, cả trình duyệt) tự thêm <tbody> khi đọc — cùng một bảng, không đổi hiển thị' },
  { ma: 'html5', re: /^[^:]+: (?:(?:caption|col|colgroup|tbody|thead|tfoot|tr|td|th): \d+→\d+(?:, |$))+$/,
    vi: 'Thẻ khung bảng lạc ngoài <table> (chỉ có trong gói thử allowlist): HTML5 bỏ thẻ, giữ chữ — cleanForCanvas giữ nguyên thẻ (html.test.cjs đang chốt), không ảnh hưởng an toàn' }
];

/* ===================== Tiện ích so sánh ===================== */

const nfc = s => String(s == null ? '' : s).normalize('NFC');
const gon = s => nfc(s).replace(/\u200B/g, '').replace(/\s+/g, ' ').trim(); // bỏ ký tự rộng 0 mà qti chèn vào "[id]" trong đoạn dẫn
const khongTrang = s => nfc(s).replace(/[\s\u200B]+/g, '');
const gan = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
const pad2 = n => (n < 10 ? '0' : '') + n;
const CT = ' \u27E6CT\u27E7 '; // dấu chỗ công thức (so chữ khi math = image)

function rong(h) {
  const t = String(h == null ? '' : h);
  if (/<(img|math|table|iframe|video|audio|object)\b/i.test(t)) return false;
  return t.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/[\s\u200B]+/g, '') === '';
}
// Chữ hiển thị của mảnh HTML; anh=true: <math> (nguồn) và img.equation_image (Canvas) đều thành dấu CT
function chuHien(h, anh) {
  if (h == null) return '';
  const { html } = mod();
  const cay = html.parseHtml(String(h));
  if (anh) {
    (function thay(n) {
      (n.children || []).forEach((x, i) => {
        if (x.type !== 'el') return;
        if (x.name === 'math' || laAnhCT(x)) n.children[i] = { type: 'text', text: CT };
        else thay(x);
      });
    })(cay);
  }
  return gon(html.toPlainText(cay));
}
// phân tích HTML (bộ phân tích dự án, chịu dấu > trong giá trị thuộc tính) → mọi phần tử tên `ten`
function timThe(h, ten) {
  const out = [];
  (function di(n) { (n.children || []).forEach(x => { if (x.type === 'el') { if (x.name === ten) out.push(x); di(x); } }); })(mod().html.parseHtml(String(h == null ? '' : h)));
  return out;
}
const laAnhCT = x => x.name === 'img' && /(^|\s)equation_image(\s|$)/.test(String(x.attrs && x.attrs['class'] || ''));
const coChu = m => gon(mod().core.xmlText(m)).replace(/[\u200C\u200D\u2060]/g, '') !== ''; // như html.js/qti.js: công thức không chữ bị bỏ
// Ô nguồn mà qti chọn text/html hay text/plain theo html_mat_text (có thẻ thật hoặc thực thể → HTML)
const coMarkup = s => mod().core.looksLikeHtml(s) || /&(#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.test(String(s));
const chuNguon = (h, anh) => (coMarkup(h) ? chuHien(h, anh) : gon(h));
// Trường Canvas: *_html / html là HTML; text / left / *_comments là CHỮ THUẦN (trang làm bài in qua ERB escape)
const chuCanvas = (htmlTruong, chuTruong, anh) => (htmlTruong != null && String(htmlTruong) !== '' ? chuHien(htmlTruong, anh) : gon(chuTruong));
// bộ đếm thẻ (tên → số lần) của một mảnh HTML, sau khi bỏ lớp bọc đơn kiểu Canvas (div/p/body không thuộc tính)
// Bộ phân tích HTML5 của canvas-sim (cây Canvas/Nokogiri dựng khi đọc lại HTML) — nạp ở timSim nếu có
let PARSE5 = null;
function demThe(h, boBoc) {
  const { html } = mod();
  const s = String(h == null ? '' : h);
  let goc = html.parseHtml(s);
  const bo = [];
  if (boBoc) {
    for (;;) {
      const k = goc.children || [];
      if (k.length !== 1) break;
      const c = k[0];
      if (!(c.type === 'el' && /^(div|p|body)$/.test(c.name) && !Object.keys(c.attrs || {}).length && (c.children || []).length)) break;
      bo.push(c.name);
      goc = c;
    }
  }
  const d = {};
  if (PARSE5) {
    PARSE5(s, 'body', { maxTreeDepth: 10000 }).search('*').forEach(n => { d[n.name] = (d[n.name] || 0) + 1; });
    bo.forEach(n => { d[n]--; });
  } else {
    (function di(n) { (n.children || []).forEach(x => { if (x.type === 'el') { d[x.name] = (d[x.name] || 0) + 1; di(x); } }); })(goc);
  }
  return d;
}
// HTML ta xuất có bị HTML5 dựng lại khác đi không (tự thêm <tbody>, bỏ thẻ khung bảng lạc…) — chỉ để ghi nhận
function chuanHoaHtml5(h) {
  if (!PARSE5) return '';
  const { html } = mod();
  const d = {};
  (function di(n) { (n.children || []).forEach(x => { if (x.type === 'el') { d[x.name] = (d[x.name] || 0) + 1; di(x); } }); })(html.parseHtml(String(h == null ? '' : h)));
  return khacThe(d, demThe(h, false));
}
function khacThe(a, b) { // → mô tả khác biệt hoặc ''
  const k = [...new Set(Object.keys(a).concat(Object.keys(b)))].sort();
  return k.filter(x => (a[x] || 0) !== (b[x] || 0)).map(x => x + ': ' + (a[x] || 0) + '→' + (b[x] || 0)).join(', ');
}

// Đọc HTML các ô của item trong XML đã xuất (để so bộ thẻ: Canvas có xoá/nhân đôi thẻ nào không)
function docItemXml(files) {
  const { core } = mod();
  const out = new Map();
  Object.keys(files).filter(p => /\.(xml|qti)$/i.test(p) && !/imsmanifest|assessment_meta/i.test(p)).forEach(p => {
    const goc = core.parseXml(core.utf8Decode(files[p]));
    core.findAll(goc, 'item').forEach(it => {
      const pres = core.find(it, 'presentation');
      const mats = pres ? core.children(pres, 'material') : [];
      const stem = mats.length ? core.xmlText(core.find(mats[0], 'mattext')) : '';
      const lab = pres ? core.findAll(pres, 'response_label').map(l => {
        const mt = core.find(l, 'mattext');
        return { id: l.attrs.ident, type: mt ? (mt.attrs.texttype || 'text/html') : null, text: mt ? core.xmlText(mt) : '' };
      }) : [];
      const lids = pres ? core.findAll(pres, 'response_lid').map(l => {
        const m = core.children(l, 'material')[0], mt = m && core.find(m, 'mattext');
        return { id: l.attrs.ident, prompt: mt ? core.xmlText(mt) : '', type: mt ? (mt.attrs.texttype || 'text/html') : null };
      }) : [];
      const fbEl = core.findAll(it, 'itemfeedback')[0];
      const fb = fbEl ? core.xmlText(core.find(fbEl, 'mattext')) : '';
      out.set(it.attrs.ident, { title: it.attrs.title, stem, lab, lids, fb });
    });
  });
  return out;
}

/* ===================== Kỳ vọng từ mô hình nguồn ===================== */

const LOAI_CANVAS = {
  mc: 'multiple_choice_question', ma: 'multiple_answers_question', short: 'short_answer_question', num: 'numerical_question',
  blanks: 'fill_in_multiple_blanks_question', dropdowns: 'multiple_dropdowns_question', matching: 'matching_question',
  essay: 'essay_question', text: 'text_only_question'
};
const lam4 = x => Math.round(x * 10000) / 10000;
function nhanY(s, i) {
  const k = s && s.key != null && String(s.key).trim() !== '' ? String(s.key).trim() : String.fromCharCode(97 + (i % 26));
  return k.replace(/\)$/, '');
}
function tenGoc(q, NN) {
  return nfc(q.title != null && String(q.title).trim() !== '' ? q.title : 'Câu ' + (q.no != null && q.no !== '' ? q.no : NN)).replace(/\s+/g, ' ').trim();
}
// chữ thuần như qti đưa vào ô text/plain
function thuan(s) {
  const { core, html } = mod();
  s = nfc(s);
  return gon(core.looksLikeHtml(s) ? html.toPlainText(s) : s);
}
function tienToTf(q, stim) {
  const nen = String(q.stem || '') + ' ' + stim + ' ' + q.statements.map(s => s.html).join(' ');
  return ['s', 'y', 'ds', 'tf', 'yds'].filter(p => q.statements.every((s, i) => nen.indexOf('[' + p + (i + 1) + ']') === -1))[0] || 'yds';
}

/* ===================== Đối chiếu một câu ===================== */

function doiChieuCau(ctx, q, NN, nh, lech) {
  const { core } = mod();
  const { opt, sim, xml } = ctx;
  const anh = opt.math === 'image';
  const ident = nh.tien + '_q' + pad2(NN);
  const stim = opt.stimulus !== 'none' && q.stimulus && !rong(q.stimulus) ? q.stimulus : '';
  const fbNguon = opt.includeFeedback !== false && q.type !== 'text' && q.feedback && !rong(q.feedback) ? q.feedback : '';
  let soCham = 0;
  function L(ma, id, msg) { lech.push({ ma, item: id, msg }); }
  function lay(id) {
    const aq = nh.cau.get(id);
    if (!aq) { L('so-cau', id, 'Canvas không có câu "' + id + '" (' + q.type + ')'); return null; }
    nh.cau.delete(id);
    return aq;
  }
  function cham(aq, resp, du, moTa) {
    const qd = Object.assign({}, aq.question_data, { id: aq.id });
    let g;
    try { g = sim.gradeQuestion(qd, resp, { locale: LOCALE }); } catch (e) { L('cham', aq.migration_id, moTa + ': bộ chấm lỗi ' + e.message); return; }
    soCham++;
    const p = Number(qd.points_possible);
    if (du && !gan(g.score, p)) L('cham', aq.migration_id, 'đáp án giáo viên ' + moTa + ' chỉ được ' + g.score + '/' + p);
    if (!du && !(g.score < p - 1e-9)) L('cham', aq.migration_id, 'trả lời sai ' + moTa + ' vẫn được ' + g.score + '/' + p);
  }
  // các kiểm tra chung cho một item Canvas
  function chung(aq, kv) {
    const qd = aq.question_data, id = aq.migration_id, x = xml.get(id);
    if (qd.question_type !== kv.loai) L('loai-cau', id, 'loại ' + kv.loai + ' → Canvas lưu ' + qd.question_type + (qd.qti_error ? ' (' + qd.qti_error + ')' : ''));
    if (!gan(qd.points_possible, kv.diem)) L('diem', id, 'điểm ' + kv.diem + ' → ' + qd.points_possible);
    if (kv.ten != null && aq.name !== kv.ten) L('ten-cau', id, 'tên "' + kv.ten + '" → "' + aq.name + '"');
    if (x && aq.name !== nfc(x.title)) L('ten-cau', id, 'tên trong gói "' + x.title + '" → "' + aq.name + '"');
    if (!aq.name || !String(aq.name).trim()) L('ten-cau', id, 'tên câu rỗng');
    // nội dung: chữ hiển thị
    const kvChu = gon(kv.stem.map(h => chuHien(h, anh)).join(' ')), caChu = chuHien(qd.question_text, anh);
    if (khongTrang(kvChu) !== khongTrang(caChu)) L('chu', id, 'nội dung khác:\n        nguồn : ' + kvChu.slice(0, 400) + '\n        Canvas: ' + caChu.slice(0, 400));
    else if (kvChu !== caChu) L('khoang-trang', id, 'khoảng trắng khác:\n        nguồn : ' + kvChu.slice(0, 300) + '\n        Canvas: ' + caChu.slice(0, 300));
    // bộ thẻ so với HTML đã xuất
    if (x) {
      const a = demThe(x.stem, false), b = demThe(qd.question_text, false), a2 = demThe(x.stem, true);
      if (khacThe(a, b) && khacThe(a2, b)) L('the-html', id, 'question_text: ' + khacThe(a2, b));
      const h5 = chuanHoaHtml5(x.stem);
      if (h5) L('html5', id, 'question_text: ' + h5);
    }
    // công thức ảnh: đếm + giải mã 2 lần
    // (công thức rỗng — không chữ nào — bị bỏ khi làm sạch/đổi ảnh: không tính)
    const soMath = timThe(kv.stem.join(' '), 'math').filter(coChu).length;
    const soEq = timThe(qd.question_text, 'img').filter(laAnhCT).length;
    const conMath = timThe(qd.question_text, 'math').length;
    if (anh && soMath !== soEq) L('cong-thuc', id, soMath + ' công thức → ' + soEq + ' ảnh công thức (+ ' + conMath + ' MathML giữ lại)');
    if (!anh && soMath !== conMath) L('cong-thuc', id, soMath + ' công thức → ' + conMath + ' <math> trong nội dung');
    kiemAnh(id, 'question_text', qd.question_text, kv.stem.join(' '));
    // độ dài
    const dai = Array.from(String(qd.question_text || '')).length;
    if (dai > 16384) L('do-dai', id, 'question_text ' + dai + ' ký tự > 16384');
    // lời giải
    const fbCa = qd.neutral_comments_html || qd.neutral_comments || '';
    if (kv.fb) {
      if (!String(fbCa).trim()) L('loi-giai', id, 'mất lời giải');
      else {
        const k1 = chuNguon(kv.fb, anh), k2 = chuCanvas(qd.neutral_comments_html, qd.neutral_comments, anh);
        if (khongTrang(k1) !== khongTrang(k2)) L('loi-giai', id, 'lời giải khác:\n        nguồn : ' + k1.slice(0, 300) + '\n        Canvas: ' + k2.slice(0, 300));
        if (x && x.fb && qd.neutral_comments_html) {
          const a = demThe(x.fb, false), b = demThe(qd.neutral_comments_html, false), a2 = demThe(x.fb, true);
          if (khacThe(a, b) && khacThe(a2, b)) L('the-html', id, 'neutral_comments_html: ' + khacThe(a2, b));
          const h5 = chuanHoaHtml5(x.fb);
          if (h5) L('html5', id, 'neutral_comments_html: ' + h5);
        }
        kiemAnh(id, 'neutral_comments_html', qd.neutral_comments_html || '', kv.fb);
      }
    } else if (String(fbCa).trim()) L('loi-giai', id, 'có lời giải không mong đợi');
    // lint của bộ mô phỏng: sanitizer xoá, link hỏng, hạ loại, ô thiếu/trùng…
    (aq.lint || []).forEach(m => L(/^sanitizer:/.test(m) ? 'sanitizer' : /link|src|placeholder|missing file/i.test(m) ? 'anh' : 'lint', id, m));
    // hiển thị trên trang làm bài
    const pv = ctx.preview.get(id);
    if (!pv) L('hien-thi', id, 'không có bản xem trước');
    else if (pv.error) L('hien-thi', id, 'trang làm bài lỗi: ' + pv.error);
    else if (pv.render_warnings && pv.render_warnings.length) L('hien-thi', id, 'cảnh báo hiển thị: ' + JSON.stringify(pv.render_warnings));
  }
  function kiemAnh(id, truong, hCa, hNguon) {
    const imgs = timThe(hCa, 'img');
    const thuong = imgs.filter(x => !laAnhCT(x));
    const nguon = timThe(hNguon, 'img').filter(x => !laAnhCT(x));
    if (thuong.length !== nguon.length) L('anh', id, truong + ': ' + nguon.length + ' ảnh → ' + thuong.length);
    thuong.forEach(x => {
      const src = x.attrs.src;
      if (src == null || !/^\/assessment_questions\/\d+\/files\/\d+\/download\?verifier=/.test(src)) L('anh', id, truong + ': ảnh chưa nối được tệp Canvas: src=' + JSON.stringify(src));
    });
    imgs.filter(laAnhCT).forEach(x => {
      const src = String(x.attrs.src || ''), dc = x.attrs['data-equation-content'];
      const m = /^\/equation_images\/([^?]*)(\?scale=1)?$/.exec(src);
      let tex = null;
      try { tex = m ? decodeURIComponent(decodeURIComponent(m[1])) : null; } catch (e) { tex = null; }
      if (!m || tex == null || tex !== dc || x.attrs.alt !== 'LaTeX: ' + dc) L('cong-thuc', id, truong + ': ảnh công thức hỏng src=' + JSON.stringify(src).slice(0, 160) + ' data-equation-content=' + JSON.stringify(dc));
    });
  }
  function kiemO(aq, ids) { // [ô] đúng một lần sau khi bỏ lớp bọc; trang làm bài thay đủ ô
    const qd = aq.question_data, id = aq.migration_id;
    const pv = ctx.preview.get(id);
    ids.forEach(b => {
      const n = String(qd.question_text || '').split('[' + b + ']').length - 1;
      if (n !== 1) L('o-trong', id, '[' + b + '] xuất hiện ' + n + ' lần trong question_text');
      if (pv && pv.question_text) {
        const v = sim.variableId(b);
        const nIn = pv.question_text.split('_' + v + "'").length - 1;
        if (nIn !== 1) L('o-trong', id, 'trang làm bài có ' + nIn + ' ô cho [' + b + ']');
        if (pv.question_text.indexOf('[' + b + ']') !== -1) L('o-trong', id, 'trang làm bài còn chữ [' + b + ']');
      }
    });
  }
  // nhóm đáp án theo blank_id, giữ thứ tự
  function theoO(qd) {
    const o = new Map();
    (qd.answers || []).forEach(a => { if (!o.has(a.blank_id)) o.set(a.blank_id, []); o.get(a.blank_id).push(a); });
    return o;
  }
  const tenKv = opt.numberInTitle === false ? null : tenGoc(q, NN);
  const diem = q.type === 'text' ? 0 : q.points;
  const kvChung = { ten: tenKv && tenKv.slice(0, 200), diem, fb: fbNguon };

  if (q.type === 'tf' && opt.tfMode === 'split') {
    const n = q.statements.length, moi = lam4(q.points / n);
    let tong = 0;
    q.statements.forEach((s, i) => {
      const y = nhanY(s, i);
      const aq = lay(ident + '_s' + (i + 1));
      if (!aq) return;
      const d = i === n - 1 ? lam4(q.points - moi * (n - 1)) : moi;
      tong += aq.question_data.points_possible;
      chung(aq, Object.assign({}, kvChung, { loai: 'multiple_choice_question', diem: d, ten: tenKv && (tenKv + ' – ' + y + ')').slice(0, 200), stem: [stim, q.stem, y + ') ' + s.html] }));
      const ans = aq.question_data.answers || [];
      const txt = ans.map(a => a.text);
      if (JSON.stringify(txt) !== JSON.stringify([DUNG, SAI])) L('dap-an', aq.migration_id, 'lựa chọn ' + JSON.stringify(txt));
      const dung = ans.filter(a => a.weight === 100).map(a => a.text);
      if (JSON.stringify(dung) !== JSON.stringify([s.value ? DUNG : SAI])) L('dap-an', aq.migration_id, 'Canvas coi đúng ' + JSON.stringify(dung) + ', nguồn ' + (s.value ? DUNG : SAI));
      const aD = ans.find(a => a.text === (s.value ? DUNG : SAI)), aS = ans.find(a => a.text === (s.value ? SAI : DUNG));
      if (aD) cham(aq, { answer_id: aD.id }, true, '"' + aD.text + '"');
      if (aS) cham(aq, { answer_id: aS.id }, false, '"' + aS.text + '"');
    });
    if (Math.abs(tong - q.points) > 1e-3) L('diem', ident, 'tổng điểm các ý ' + tong + ' ≠ ' + q.points);
    return soCham;
  }

  const aq = lay(ident);
  if (!aq) return soCham;
  const qd = aq.question_data;

  switch (q.type) {
    case 'mc': case 'ma': {
      chung(aq, Object.assign({}, kvChung, { loai: LOAI_CANVAS[q.type], stem: [stim, q.stem] }));
      const ans = qd.answers || [], x = xml.get(ident);
      if (ans.length !== q.choices.length) { L('dap-an', ident, 'số phương án ' + q.choices.length + ' → ' + ans.length); break; }
      const vtNguon = q.choices.map((c, i) => c.correct === true ? i : -1).filter(i => i >= 0);
      const vtCa = ans.map((a, i) => a.weight > 0 ? i : -1).filter(i => i >= 0);
      if (JSON.stringify(vtNguon) !== JSON.stringify(vtCa)) L('dap-an', ident, 'phương án đúng: nguồn ' + vtNguon + ', Canvas ' + vtCa);
      ans.forEach((a, i) => {
        if (a.weight !== 0 && a.weight !== 100) L('dap-an', ident, 'trọng số lạ ' + a.weight);
        const c = q.choices[i];
        const k1 = chuNguon(c.html, anh), k2 = chuCanvas(a.html, a.text, anh);
        if (khongTrang(k1) !== khongTrang(k2)) L('dap-an', ident, 'chữ phương án ' + c.id + ': "' + k1.slice(0, 120) + '" → "' + k2.slice(0, 120) + '"');
        else if (k1 !== k2) L('khoang-trang', ident, 'phương án ' + c.id + ': "' + k1.slice(0, 120) + '" → "' + k2.slice(0, 120) + '"');
        const lab = x && x.lab[i];
        if (lab && lab.type === 'text/html' && a.html != null) {
          const e1 = demThe(lab.text, false), e2 = demThe(a.html, false), e3 = demThe(lab.text, true);
          if (khacThe(e1, e2) && khacThe(e3, e2)) L('the-html', ident, 'phương án ' + c.id + ': ' + khacThe(e3, e2));
          const h5 = chuanHoaHtml5(lab.text);
          if (h5) L('html5', ident, 'phương án ' + c.id + ': ' + h5);
        }
        if (/<img\b/i.test(c.html)) kiemAnh(ident, 'phương án ' + c.id, a.html, c.html);
      });
      const idD = vtNguon.map(i => ans[i].id), idS = ans.filter((a, i) => vtNguon.indexOf(i) === -1).map(a => a.id);
      if (q.type === 'mc') { if (idD.length) cham(aq, { answer_id: idD[0] }, true, 'phương án ' + q.choices[vtNguon[0]].id); idS.forEach(z => cham(aq, { answer_id: z }, false, 'phương án sai')); }
      else {
        cham(aq, { answer_ids: idD }, true, 'các phương án đúng');
        if (idS.length) cham(aq, { answer_ids: idD.concat(idS[0]) }, false, 'đúng + một sai');
        if (idD.length > 1) cham(aq, { answer_ids: idD.slice(1) }, false, 'thiếu một đúng');
      }
      break;
    }
    case 'tf': { // một câu nhiều ô Đúng/Sai
      const pfx = tienToTf(q, stim);
      const dong = q.statements.map((s, i) => nhanY(s, i) + ') ' + s.html + ' [' + pfx + (i + 1) + ']');
      chung(aq, Object.assign({}, kvChung, { loai: 'multiple_dropdowns_question', stem: [stim, q.stem].concat(dong) }));
      const o = theoO(qd), ids = q.statements.map((s, i) => pfx + (i + 1));
      if (JSON.stringify([...o.keys()]) !== JSON.stringify(ids)) L('dap-an', ident, 'mã ô ' + JSON.stringify(ids) + ' → ' + JSON.stringify([...o.keys()]));
      kiemO(aq, ids);
      const resp = {}, sai = {};
      q.statements.forEach((s, i) => {
        const ds = o.get(ids[i]) || [];
        if (JSON.stringify(ds.map(a => a.text)) !== JSON.stringify([DUNG, SAI])) L('dap-an', ident, 'ô ' + ids[i] + ': ' + JSON.stringify(ds.map(a => a.text)));
        const d = ds.filter(a => a.weight === 100);
        if (d.length !== 1 || d[0].text !== (s.value ? DUNG : SAI)) L('dap-an', ident, 'ô ' + ids[i] + ': Canvas coi đúng ' + JSON.stringify(d.map(a => a.text)));
        if (d[0]) resp[ids[i]] = d[0].id;
        const s0 = ds.find(a => a.weight !== 100);
        sai[ids[i]] = i === 0 && s0 ? s0.id : resp[ids[i]];
      });
      cham(aq, { blanks: resp }, true, 'mọi ý');
      cham(aq, { blanks: sai }, false, 'sai ý đầu');
      break;
    }
    case 'short': {
      chung(aq, Object.assign({}, kvChung, { loai: 'short_answer_question', stem: [stim, q.stem] }));
      const nguon = q.answers.map(thuan).filter(Boolean);
      const kv = core.answerVariants(nguon);
      const ca = (qd.answers || []).map(a => a.text);
      if (JSON.stringify(ca) !== JSON.stringify(kv)) L('dap-an', ident, 'cách viết ' + JSON.stringify(kv) + ' → ' + JSON.stringify(ca));
      if ((qd.answers || []).some(a => a.weight !== 100)) L('dap-an', ident, 'có cách viết trọng số ≠ 100');
      nguon.forEach(a => cham(aq, { text: a }, true, '"' + a + '"'));
      nguon.filter(a => /\d,\d/.test(a)).forEach(a => cham(aq, { text: a.replace(/(\d),(?=\d)/g, '$1.') }, true, '"' + a + '" dấu chấm'));
      cham(aq, { text: 'zz-khong-phai-dap-an-zz' }, false, '"zz"');
      break;
    }
    case 'num': {
      chung(aq, Object.assign({}, kvChung, { loai: 'numerical_question', stem: [stim, q.stem] }));
      const n = q.numeric, ans = qd.answers || [], so = x => String(+x.toFixed(10));
      if (ans.length !== 1) L('so', ident, ans.length + ' đáp án số');
      const a = ans[0] || {};
      if (n.exact !== undefined) {
        const m = n.margin || 0;
        if (a.numerical_answer_type !== 'exact_answer' || !gan(a.exact, n.exact) || !gan(a.margin || 0, m)) L('so', ident, 'đúng ' + n.exact + ' ± ' + m + ' → ' + JSON.stringify(a));
        cham(aq, { text: so(n.exact) }, true, so(n.exact));
        if (m > 0) { cham(aq, { text: so(n.exact + m / 2) }, true, so(n.exact + m / 2)); cham(aq, { text: so(n.exact - m / 2) }, true, so(n.exact - m / 2)); }
        cham(aq, { text: so(n.exact + 2 * m + 1) }, false, so(n.exact + 2 * m + 1));
      } else {
        if (a.numerical_answer_type !== 'range_answer' || !gan(a.start, n.min) || !gan(a.end, n.max)) L('so', ident, 'khoảng ' + n.min + '..' + n.max + ' → ' + JSON.stringify(a));
        [n.min, n.max, (n.min + n.max) / 2].forEach(v => cham(aq, { text: so(v) }, true, so(v)));
        cham(aq, { text: so(n.min - (n.max - n.min) - 1) }, false, so(n.min - (n.max - n.min) - 1));
      }
      break;
    }
    case 'blanks': case 'dropdowns': {
      const ds = q.type === 'blanks' ? q.blanks : q.dropdowns;
      chung(aq, Object.assign({}, kvChung, { loai: LOAI_CANVAS[q.type], stem: [stim, q.stem] }));
      const o = theoO(qd), ids = ds.map(b => b.id);
      if (JSON.stringify([...o.keys()]) !== JSON.stringify(ids)) L('dap-an', ident, 'mã ô ' + JSON.stringify(ids) + ' → ' + JSON.stringify([...o.keys()]));
      kiemO(aq, ids);
      const resp = {};
      ds.forEach(b => {
        const ca = o.get(b.id) || [];
        if (q.type === 'blanks') {
          const kv = core.answerVariants(b.accepts.map(thuan).filter(Boolean));
          if (JSON.stringify(ca.map(a => a.text)) !== JSON.stringify(kv)) L('dap-an', ident, 'ô ' + b.id + ': ' + JSON.stringify(kv) + ' → ' + JSON.stringify(ca.map(a => a.text)));
          if (ca.some(a => a.weight !== 100)) L('dap-an', ident, 'ô ' + b.id + ': có đáp án trọng số ≠ 100');
          resp[b.id] = kv[0];
        } else {
          const kv = b.options.map(thuan);
          if (JSON.stringify(ca.map(a => a.text)) !== JSON.stringify(kv)) L('dap-an', ident, 'ô ' + b.id + ': ' + JSON.stringify(kv) + ' → ' + JSON.stringify(ca.map(a => a.text)));
          const d = ca.filter(a => a.weight === 100);
          if (d.length !== 1 || ca.indexOf(d[0]) !== b.correct) L('dap-an', ident, 'ô ' + b.id + ': lựa chọn đúng ' + b.correct + ' → ' + d.map(a => ca.indexOf(a)));
          if (d[0]) resp[b.id] = d[0].id;
        }
      });
      cham(aq, { blanks: resp }, true, 'mọi ô');
      if (q.type === 'blanks') {
        ds.forEach(b => core.answerVariants(b.accepts.map(thuan).filter(Boolean)).slice(1).forEach(a => cham(aq, { blanks: Object.assign({}, resp, { [b.id]: a }) }, true, b.id + '="' + a + '"')));
        cham(aq, { blanks: Object.assign({}, resp, { [ids[0]]: 'zz-sai-zz' }) }, false, ids[0] + '="zz"');
      } else {
        const ca = o.get(ids[0]) || [], s0 = ca.find(a => a.weight !== 100);
        if (s0) cham(aq, { blanks: Object.assign({}, resp, { [ids[0]]: s0.id }) }, false, ids[0] + ' sai');
      }
      break;
    }
    case 'matching': {
      chung(aq, Object.assign({}, kvChung, { loai: 'matching_question', stem: [stim, q.stem] }));
      const ans = qd.answers || [], matches = qd.matches || [];
      if (ans.length !== q.pairs.length) { L('dap-an', ident, 'số cặp ' + q.pairs.length + ' → ' + ans.length); break; }
      const phaiDung = q.pairs.map(p => thuan(p.right));
      const tapPhai = [...new Set(phaiDung.concat((q.distractors || []).map(thuan).filter(Boolean)))].sort();
      const caPhai = matches.map(m => gon(m.text)).sort();
      if (JSON.stringify(caPhai) !== JSON.stringify(tapPhai)) L('dap-an', ident, 'vế phải ' + JSON.stringify(tapPhai) + ' → ' + JSON.stringify(caPhai));
      const resp = {};
      q.pairs.forEach((p, i) => {
        const a = ans[i];
        const k1 = chuNguon(p.left, anh), k2 = chuCanvas(a.left_html || a.html, a.left != null ? a.left : a.text, anh);
        if (khongTrang(k1) !== khongTrang(k2)) L('dap-an', ident, 'vế trái ' + (i + 1) + ': "' + k1 + '" → "' + k2 + '"');
        const m = matches.find(z => String(z.match_id) === String(a.match_id));
        if (!m || gon(m.text) !== phaiDung[i]) L('dap-an', ident, 'cặp ' + (i + 1) + ': ghép "' + phaiDung[i] + '" → "' + (m ? m.text : 'không có') + '"');
        if (gon(a.right) !== phaiDung[i]) L('dap-an', ident, 'cặp ' + (i + 1) + ': right "' + a.right + '"');
        resp[a.id] = a.match_id;
      });
      cham(aq, { matches: resp }, true, 'mọi cặp');
      const khac = matches.find(z => gon(z.text) !== phaiDung[0]);
      if (khac) cham(aq, { matches: Object.assign({}, resp, { [ans[0].id]: khac.match_id }) }, false, 'cặp 1 sai');
      break;
    }
    case 'essay':
      chung(aq, Object.assign({}, kvChung, { loai: 'essay_question', stem: [stim, q.stem] }));
      if ((qd.answers || []).length) L('dap-an', ident, 'tự luận có ' + qd.answers.length + ' đáp án');
      break;
    case 'text':
      chung(aq, Object.assign({}, kvChung, { loai: 'text_only_question', diem: 0, stem: [stim, q.stem] }));
      break;
    default:
      L('loai-cau', ident, 'loại nguồn lạ ' + q.type);
  }
  return soCham;
}

/* ===================== Một nguồn ===================== */

async function motNguon(ng, sim, opts) {
  const { app, qti, zip } = mod();
  const kq = { ten: ng.ten, nhom: ng.nhom, cau: 0, xuat: 0, goi: 0, nganHang: 0, item: 0, cham: 0, toHop: 0, theoLoai: {}, lech: [], loiChay: null, ms: 0 };
  const t0 = Date.now();
  const r = await docNguon(ng);
  const entries = r.banks.map((b, i) => app.taoMuc(ng.ten + '#' + i, b));
  const banksX = app.banksDeXuat(entries);
  entries.forEach(e => e.bank.questions.forEach(q => { kq.cau++; if (app.duocXuat(e, q)) { kq.xuat++; kq.theoLoai[q.type] = (kq.theoLoai[q.type] || 0) + 1; } }));
  if (!banksX.length) { kq.ms = Date.now() - t0; return kq; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-chay-'));
  try {
    for (const opt of toHop(opts.nhanh)) {
      kq.toHop++;
      const th = tenToHop(opt);
      const pk = await qti.buildPackages(banksX, opt);
      const loiQti = app.locVanDeXuat(pk.issues).filter(i => i.level === 'error');
      loiQti.forEach(i => kq.lech.push({ toHop: th, goi: '', ma: 'qti-loi', item: '', msg: i.msg }));
      for (const p of pk) {
        kq.goi++;
        const zp = path.join(tmp, kq.goi + '_' + p.fileName);
        fs.writeFileSync(zp, p.bytes);
        const lech = [];
        try {
          const res = sim.importZip(zp, { locale: LOCALE, seed: 1, context_hosts: HOST });
          const files = await zip.readZip(p.bytes);
          kq.cham += doiChieuGoi(res, files, p, banksX, opt, sim, lech, kq);
        } catch (e) {
          lech.push({ ma: 'loi-chay', item: '', msg: String(e && e.stack || e).split('\n').slice(0, 6).join('\n') });
        }
        lech.forEach(l => { l.toHop = th; l.goi = p.fileName; kq.lech.push(l); });
        try { fs.unlinkSync(zp); } catch (e) { /* bỏ qua */ }
      }
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* bỏ qua */ }
  }
  kq.ms = Date.now() - t0;
  return kq;
}

function doiChieuGoi(res, files, p, banksX, opt, sim, lech, kq) {
  const { core } = mod();
  const xml = docItemXml(files);
  const preview = new Map((res.preview || []).map(v => [v.migration_id, v]));
  let soCham = 0;
  (res.imported.warnings || []).forEach(w => lech.push({ ma: 'canh-bao-import', item: '', msg: String(w) }));
  if (res.unzip && res.unzip.warnings && res.unzip.warnings.length) lech.push({ ma: 'canh-bao-import', item: '', msg: 'giải nén: ' + JSON.stringify(res.unzip.warnings) });
  const py = String(res.python && res.python.output || '');
  py.split(/\r?\n/).filter(l => /warn|error|exception|traceback|bad nmtoken/i.test(l)).forEach(l => lech.push({ ma: 'python', item: '', msg: l.trim() }));

  // ngân hàng nguồn của gói này
  const nguon = opt.target === 'classic' ? banksX : banksX.filter(b => gon(b.title) === gon(p.bankTitles[0]));
  if (opt.target !== 'classic' && nguon.length !== 1) { lech.push({ ma: 'ten-nh', item: '', msg: 'không xác định được ngân hàng nguồn của gói ' + p.fileName }); return 0; }
  const caBanks = res.imported.banks;
  if (caBanks.length !== nguon.length) lech.push({ ma: 'so-nh', item: '', msg: 'số ngân hàng ' + nguon.length + ' → ' + caBanks.length + ' (' + caBanks.map(b => b.title).join(' | ') + ')' });
  const daDung = new Set();
  nguon.forEach((b, bi) => {
    const title = gon(b.title).slice(0, 255);
    const ca = caBanks.filter(x => x.title === title && !daDung.has(x));
    let nh = ca[0] || null;
    if (!nh) { lech.push({ ma: 'ten-nh', item: '', msg: 'không thấy ngân hàng "' + title + '" (Canvas: ' + caBanks.map(x => '"' + x.title + '"').join(', ') + ')' }); nh = caBanks[bi]; if (!nh) return; }
    daDung.add(nh);
    let tien;
    const RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
    const kvIdent = RE.test(String(b.ident || '')) ? b.ident : core.bankIdent(title);
    if (opt.target === 'classic') {
      tien = nh.migration_id;
      if (nh.migration_id !== kvIdent) lech.push({ ma: 'ten-nh', item: '', msg: 'mã ngân hàng "' + kvIdent + '" → "' + nh.migration_id + '"' });
    } else {
      const qz = res.imported.quizzes;
      if (qz.length !== 1) lech.push({ ma: 'so-nh', item: '', msg: qz.length + ' bài kiểm tra (cần 1)' });
      const z = qz[0];
      tien = kvIdent;
      if (z) {
        if (z.title !== title) lech.push({ ma: 'ten-nh', item: '', msg: 'tên bài "' + title + '" → "' + z.title + '"' });
        if (z.migration_id !== kvIdent + '_quiz') lech.push({ ma: 'ten-nh', item: '', msg: 'mã bài "' + kvIdent + '_quiz" → "' + z.migration_id + '"' });
        if ((z.groups || []).length) lech.push({ ma: 'so-cau', item: '', msg: 'bài kiểm tra có ' + z.groups.length + ' nhóm câu (cần 0)' });
        const soQ = (z.questions || []).length;
        if (soQ !== nh.questions.length) lech.push({ ma: 'so-cau', item: '', msg: 'bài kiểm tra ' + soQ + ' câu, ngân hàng ' + nh.questions.length + ' câu' });
      }
    }
    // số câu kỳ vọng
    let kvSo = 0;
    b.questions.forEach(q => { if (q) kvSo += (q.type === 'tf' && opt.tfMode === 'split') ? q.statements.length : 1; });
    if (nh.questions.length !== kvSo) lech.push({ ma: 'so-cau', item: '', msg: 'ngân hàng "' + title + '": ' + kvSo + ' câu → ' + nh.questions.length });
    kq.nganHang++; kq.item += nh.questions.length;
    nh.questions.forEach(aq => {
      if (aq.question_data.question_bank_name != null && aq.question_data.question_bank_name !== nh.title) lech.push({ ma: 'ten-nh', item: aq.migration_id, msg: 'question_bank_name "' + aq.question_data.question_bank_name + '"' });
    });
    const ngan = { tien, cau: new Map(nh.questions.map(aq => [aq.migration_id, aq])) };
    const ctx = { opt, sim, xml, preview };
    b.questions.forEach((q, i) => { if (q) soCham += doiChieuCau(ctx, q, i + 1, ngan, lech); });
    ngan.cau.forEach((aq, id) => lech.push({ ma: 'so-cau', item: id, msg: 'câu thừa trong Canvas' }));
  });
  return soCham;
}

/* ===================== Chạy toàn bộ (song song bằng tiến trình con) ===================== */

function phanLoai(lech) {
  const loi = [], daBiet = [];
  lech.forEach(l => {
    const k = DA_BIET.find(d => d.ma === l.ma && d.re.test(l.msg));
    if (k) daBiet.push(Object.assign({ vi: k.vi }, l)); else loi.push(l);
  });
  return { loi, daBiet };
}

function chayWorker(idx, opts) {
  return new Promise((resolve) => {
    const args = ['--worker', String(idx)].concat(opts.nhanh ? ['--nhanh'] : []);
    const c = cp.fork(__filename, args, { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: process.env, windowsHide: true });
    let out = '', kq = null;
    c.stdout.on('data', d => { out += d; });
    c.stderr.on('data', d => { out += d; });
    c.on('message', m => { kq = m; });
    c.on('exit', (code) => {
      if (!kq) kq = { loiChay: 'tiến trình con thoát mã ' + code + '\n' + out.slice(-3000), lech: [] };
      resolve(kq);
    });
  });
}

async function chay(opts) {
  opts = opts || {};
  const sim = timSim(opts.env);
  if (sim.lyDo) return { boQua: true, lyDo: sim.lyDo };
  // thử bộ mô phỏng bằng một gói nhỏ: lỗi môi trường (thiếu Python…) → bỏ qua có lý do
  try {
    const { qti } = mod();
    const pk = await qti.buildPackages([{ title: 'Thử', questions: [{ id: 'q1', no: '1', title: 'Câu 1', type: 'mc', points: 1, stem: '<p>1+1?</p>', choices: [{ id: 'A', html: '2', correct: true }, { id: 'B', html: '3', correct: false }], feedback: '', meta: {}, issues: [] }], images: {} }], { target: 'classic' });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-thu-'));
    const zp = path.join(tmp, pk[0].fileName);
    fs.writeFileSync(zp, pk[0].bytes);
    try {
      const r = sim.importZip(zp, { locale: LOCALE, seed: 1 });
      if (!r.imported.banks.length || r.imported.banks[0].questions.length !== 1) throw new Error('gói thử không ra 1 câu');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  } catch (e) {
    return { boQua: true, lyDo: 'bộ mô phỏng ở ' + sim.dir + ' không chạy được: ' + String(e && e.message || e).split('\n')[0] };
  }
  let ds = dsNguon();
  if (opts.loc && opts.loc.length) ds = ds.filter(n => opts.loc.some(l => n.ten.toLowerCase().includes(l.toLowerCase())));
  const ketQua = new Array(ds.length);
  const t0 = Date.now();
  if (opts.tuanTu) {
    for (let i = 0; i < ds.length; i++) {
      try { ketQua[i] = await motNguon(ds[i], sim, opts); } catch (e) { ketQua[i] = { ten: ds[i].ten, nhom: ds[i].nhom, loiChay: String(e && e.stack || e), lech: [] }; }
      if (opts.moiNguon) opts.moiNguon(ketQua[i]);
    }
  } else {
    const luong = Math.max(1, Math.min(opts.luong || Math.max(1, os.cpus().length - 2), 8, ds.length));
    let k = 0;
    await Promise.all(Array.from({ length: luong }, async () => {
      while (k < ds.length) {
        const i = k++;
        const r = await chayWorker(dsNguon().findIndex(n => n.ten === ds[i].ten && n.nhom === ds[i].nhom), opts);
        r.ten = r.ten || ds[i].ten; r.nhom = r.nhom || ds[i].nhom;
        ketQua[i] = r;
        if (opts.moiNguon) opts.moiNguon(r);
      }
    }));
  }
  const tk = { nguon: ds.length, cau: 0, xuat: 0, goi: 0, nganHang: 0, item: 0, cham: 0, toHop: toHop(opts.nhanh).length, theoLoai: {}, loiChay: 0, giay: 0 };
  let lech = [];
  ketQua.forEach(r => {
    ['cau', 'xuat', 'goi', 'nganHang', 'item', 'cham'].forEach(k => { tk[k] += r[k] || 0; });
    Object.keys(r.theoLoai || {}).forEach(k => { tk.theoLoai[k] = (tk.theoLoai[k] || 0) + r.theoLoai[k]; });
    if (r.loiChay) { tk.loiChay++; lech.push({ nguon: r.ten, ma: 'loi-chay', item: '', toHop: '', goi: '', msg: r.loiChay }); }
    (r.lech || []).forEach(l => lech.push(Object.assign({ nguon: r.ten }, l)));
  });
  tk.giay = Math.round((Date.now() - t0) / 100) / 10;
  const pl = phanLoai(lech);
  return { boQua: false, sim: sim.dir, tk, lech: pl.loi, daBiet: pl.daBiet, ketQua };
}

/* ===================== Báo cáo ===================== */

function baoCao(kq, chiTiet) {
  if (kq.boQua) return 'BỎ QUA bộ mô phỏng Canvas: ' + kq.lyDo;
  const tk = kq.tk, out = [];
  out.push('Bộ mô phỏng: ' + kq.sim);
  if (chiTiet) kq.ketQua.forEach(r => {
    const n = kq.lech.filter(l => l.nguon === r.ten).length, nb = kq.daBiet.filter(l => l.nguon === r.ten).length;
    out.push('  ' + (n ? 'LỆCH' : 'ĐẠT ') + ' ' + r.nhom + ': ' + r.ten + ' — ' + (r.xuat || 0) + '/' + (r.cau || 0) + ' câu, ' + (r.goi || 0) + ' gói, ' +
      (r.item || 0) + ' câu Canvas, ' + (r.cham || 0) + ' phép chấm' + (n ? ', ' + n + ' lệch' : '') + (nb ? ', ' + nb + ' đã ghi nhận' : '') +
      (r.ms ? ' (' + (r.ms / 1000).toFixed(1) + ' s)' : ''));
  });
  out.push('Tổng: ' + tk.nguon + ' nguồn, ' + tk.xuat + '/' + tk.cau + ' câu xuất, ' + tk.toHop + ' tổ hợp, ' + tk.goi + ' gói import, ' + tk.nganHang + ' lượt ngân hàng, ' +
    tk.item + ' câu Canvas đã đối chiếu, ' + tk.cham + ' phép chấm — ' + tk.giay + ' s');
  out.push('Loại câu nguồn: ' + Object.keys(tk.theoLoai).sort().map(k => k + ' ' + tk.theoLoai[k]).join(', '));
  const nhom = {};
  kq.lech.forEach(l => { nhom[l.ma] = (nhom[l.ma] || 0) + 1; });
  out.push('Lệch chưa giải thích: ' + kq.lech.length + (kq.lech.length ? ' (' + Object.keys(nhom).map(k => k + ' ' + nhom[k]).join(', ') + ')' : ''));
  if (kq.daBiet.length) {
    const nb = {};
    kq.daBiet.forEach(l => { nb[l.vi] = (nb[l.vi] || 0) + 1; });
    out.push('Hành vi Canvas đã ghi nhận: ' + kq.daBiet.length);
    Object.keys(nb).forEach(k => out.push('  ' + nb[k] + ' × ' + k));
  }
  // in tối đa 3 mẫu mỗi (mã, thông điệp rút gọn)
  const daIn = {};
  kq.lech.forEach(l => {
    const khoa = l.ma + '|' + String(l.msg).split('\n')[0].replace(/\d+/g, '#').slice(0, 90);
    daIn[khoa] = (daIn[khoa] || 0) + 1;
    if (daIn[khoa] <= (chiTiet ? 5 : 2)) out.push('  [' + l.ma + '] ' + l.nguon + ' · ' + l.toHop + ' · ' + (l.goi || '') + ' · ' + (l.item || '') + '\n      ' + l.msg);
  });
  const an = Object.keys(daIn).reduce((s, k) => s + Math.max(0, daIn[k] - (chiTiet ? 5 : 2)), 0);
  if (an) out.push('  … và ' + an + ' lệch cùng dạng khác');
  return out.join('\n');
}

module.exports = { chay, baoCao, timSim, dsNguon, toHop, motNguon, taoModel, DA_BIET };

/* ===================== CLI / worker ===================== */

if (require.main === module) {
  const args = process.argv.slice(2);
  const wi = args.indexOf('--worker');
  if (wi !== -1) {
    const idx = Number(args[wi + 1]);
    const sim = timSim();
    (async () => {
      const ng = dsNguon()[idx];
      let r;
      try { r = await motNguon(ng, sim, { nhanh: args.includes('--nhanh') }); } catch (e) { r = { ten: ng && ng.ten, nhom: ng && ng.nhom, loiChay: String(e && e.stack || e), lech: [] }; }
      process.send(r, () => process.exit(0));
    })();
  } else {
    const chiTiet = args.includes('-v');
    const lu = args.find(a => /^--luong=\d+$/.test(a));
    const opts = {
      loc: args.filter(a => !a.startsWith('-')), nhanh: args.includes('--nhanh'), tuanTu: args.includes('--tuan-tu'),
      luong: lu ? Number(lu.split('=')[1]) : 0,
      moiNguon: chiTiet && !args.includes('--json') ? r => console.log('  … ' + r.ten + ': ' + ((r.lech || []).length) + ' lệch' + (r.loiChay ? ' (LỖI CHẠY)' : '')) : null
    };
    chay(opts).then(kq => {
      if (args.includes('--json')) process.stdout.write(JSON.stringify(kq.boQua ? kq : { sim: kq.sim, tk: kq.tk, lech: kq.lech, daBiet: kq.daBiet }, null, 2) + '\n');
      else console.log(baoCao(kq, chiTiet));
      process.exitCode = kq.boQua ? 0 : (kq.lech.length ? 1 : 0);
    }).catch(e => { console.error(e); process.exitCode = 1; });
  }
}
