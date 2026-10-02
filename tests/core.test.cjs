/* tests/core.test.cjs — kiểm thử js/core.js (chạy: node tests/core.test.cjs) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');
const zip = require('../js/zip.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

/* ---------------- parseXml ---------------- */

test('parseXml: namespace, thuộc tính 2 kiểu ngoặc, thực thể, CDATA, comment, PI, doctype, thẻ tự đóng', () => {
  const src = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<!DOCTYPE w:document [ <!ENTITY x "y>z"> <!-- ] > --> ]>\n<!-- chú thích <a> -->' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" a=\'1 "q"\' b="2 &amp; 3 \'s\'">' +
    '<w:body><w:p><w:r><w:t xml:space="preserve">  Xin chào &#x1EA1;&#7841; &lt;&gt;&quot;&apos;&amp; </w:t></w:r>' +
    '<w:r><w:t><![CDATA[a<b>&amp;]]></w:t></w:r><w:br/><w:tab /></w:p><?pi bỏ qua?><!---->' +
    '<w:sectPr w:rsidR="00AB"/></w:body></w:document>\n';
  const x = core.parseXml(src);
  assert.strictEqual(x.type, 'el');
  assert.strictEqual(x.name, 'w:document');
  assert.strictEqual(x.attrs.a, '1 "q"');
  assert.strictEqual(x.attrs.b, "2 & 3 's'");
  assert.strictEqual(x.attrs['xmlns:w'], 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
  const ts = core.findAll(x, 'w:t');
  assert.strictEqual(ts.length, 2);
  assert.strictEqual(ts[0].attrs['xml:space'], 'preserve');
  assert.strictEqual(core.xmlText(ts[0]), '  Xin chào ạạ <>"\'& ');
  assert.strictEqual(core.xmlText(ts[1]), 'a<b>&amp;');
  const p = core.find(x, 'w:p');
  assert.deepStrictEqual(core.children(p).map(n => n.name), ['w:r', 'w:r', 'w:br', 'w:tab']);
  assert.deepStrictEqual(core.children(p, 'w:r').length, 2);
  assert.deepStrictEqual(core.find(p, 'w:br').children, []);
  // không còn comment/PI trong cây
  const body = core.find(x, 'w:body');
  assert.deepStrictEqual(body.children.map(n => n.name), ['w:p', 'w:sectPr']);
  assert.strictEqual(core.attr(core.find(x, 'w:sectPr'), 'w:rsidR'), '00AB');
  assert.strictEqual(core.attr(body, 'khong-co', 'mac-dinh'), 'mac-dinh');
});

test('find/findAll: chỉ hậu duệ, đúng thứ tự tài liệu, hỗ trợ hàm lọc / mảng tên / *', () => {
  const x = core.parseXml('<a><b id="1"><c id="2"/><b id="3"/></b><c id="4"><b id="5"/></c></a>');
  assert.strictEqual(core.find(x, 'a'), null, 'không tính chính node');
  assert.deepStrictEqual(core.findAll(x, 'b').map(n => n.attrs.id), ['1', '3', '5']);
  assert.deepStrictEqual(core.findAll(x, '*').map(n => n.attrs.id), ['1', '2', '3', '4', '5']);
  assert.deepStrictEqual(core.findAll(x, ['c', 'b']).map(n => n.attrs.id), ['1', '2', '3', '4', '5']);
  assert.strictEqual(core.find(x, n => n.attrs.id === '4').name, 'c');
  assert.strictEqual(core.find(x, 'zz'), null);
  assert.deepStrictEqual(core.findAll(null, 'b'), []);
  assert.deepStrictEqual(core.children(x, 'c').map(n => n.attrs.id), ['4']);
});

test('parseXml: giữ nút khoảng trắng', () => {
  const x = core.parseXml('<a> <b/>\n\t<c> x </c><d>\n</d></a>');
  assert.deepStrictEqual(x.children.map(n => n.type === 'text' ? JSON.stringify(n.text) : n.name),
    ['" "', 'b', '"\\n\\t"', 'c', 'd']);
  assert.strictEqual(core.xmlText(core.find(x, 'c')), ' x ');
  assert.strictEqual(core.xmlText(core.find(x, 'd')), '\n');
});

test('parseXml: thực thể số / lạ / sai', () => {
  const x = core.parseXml('<a t="&#10;x&#9;" u="a\n\tb">&#128512;&#x1F600;&nbsp;&foo;&#xD800;&#0;&#xZZ;&amp &#x110000;</a>');
  assert.strictEqual(core.xmlText(x), '\u{1F600}\u{1F600}&nbsp;&foo;&#xD800;&#0;&#xZZ;&amp &#x110000;');
  assert.strictEqual(x.attrs.t, '\nx\t', 'tham chiếu ký tự trong thuộc tính được giữ');
  assert.strictEqual(x.attrs.u, 'a  b', 'tab/xuống dòng thật trong thuộc tính → dấu cách');
});

test('parseXml: chuẩn hoá xuống dòng CRLF/CR, BOM, đầu vào Uint8Array', () => {
  const x = core.parseXml('<a>1\r\n2\r3</a>');
  assert.strictEqual(core.xmlText(x), '1\n2\n3');
  const u8 = new Uint8Array([0xEF, 0xBB, 0xBF, ...Buffer.from('<r>Đề thi</r>')]);
  const y = core.parseXml(u8);
  assert.strictEqual(y.name, 'r');
  assert.strictEqual(core.xmlText(y), 'Đề thi');
  assert.strictEqual(core.parseXml('\u{FEFF}<r/>').name, 'r');
});

test('parseXml: chịu lỗi nhẹ', () => {
  // thẻ đóng lệch: đóng luôn các thẻ con chưa đóng
  let x = core.parseXml('<a><b><c>x</a>');
  assert.strictEqual(x.name, 'a');
  assert.strictEqual(core.xmlText(core.find(x, 'c')), 'x');
  // thẻ đóng lạc bị bỏ qua
  x = core.parseXml('<a>1</z>2</a>');
  assert.strictEqual(core.xmlText(x), '12');
  // '<' lẻ trong văn bản
  x = core.parseXml('<a>1 < 2 <= 3 <3</a>');
  assert.strictEqual(core.xmlText(x), '1 < 2 <= 3 <3');
  // thiếu thẻ đóng ở cuối
  x = core.parseXml('<a><b>chữ');
  assert.strictEqual(core.xmlText(core.find(x, 'b')), 'chữ');
  // thuộc tính không ngoặc / không giá trị / có '>' trong ngoặc
  x = core.parseXml('<a x=1 y z="2" w=\'>\' v=3/>');
  assert.deepStrictEqual(x.attrs, { x: '1', y: '', z: '2', w: '>', v: '3' });
  assert.deepStrictEqual(x.children, []);
  // nhiều gốc / chỉ có chữ → #fragment
  x = core.parseXml('<a/><b/>');
  assert.strictEqual(x.name, '#fragment');
  assert.deepStrictEqual(x.children.map(n => n.name), ['a', 'b']);
  x = core.parseXml('chỉ có chữ &amp; thôi');
  assert.strictEqual(x.name, '#fragment');
  assert.strictEqual(core.xmlText(x), 'chỉ có chữ & thôi');
  assert.strictEqual(core.parseXml('').name, '#fragment');
  // comment / CDATA chưa đóng
  x = core.parseXml('<a>1<!-- mãi không đóng');
  assert.strictEqual(core.xmlText(x), '1');
  x = core.parseXml('<a><![CDATA[x<y');
  assert.strictEqual(core.xmlText(x), 'x<y');
  // __proto__ không làm hỏng đối tượng thuộc tính
  x = core.parseXml('<a __proto__="x" b="1"/>');
  assert.strictEqual(x.attrs.b, '1');
  assert.strictEqual(Object.getPrototypeOf(x.attrs), Object.prototype);
});

/* ---------------- toXml + vòng tròn ---------------- */

function boKhoangTrangGoc(n) { return n; }

test('toXml: thoát ký tự và vòng tròn parse → toXml → parse', () => {
  const src = '<?xml version="1.0"?><m:oMath xmlns:m="urn:m" t="a&amp;b &lt;c&gt; &quot;d&quot; &#10;e&#9;f&#13;">' +
    '<m:r><m:t>x &lt; 2 &amp;&amp; y &gt; 3 ]]&gt; &#13;</m:t></m:r><m:r/><empty></empty>' +
    '<s xml:space="preserve">  \n  </s><![CDATA[<b>đậm</b>]]></m:oMath>';
  const a = core.parseXml(src);
  const s1 = core.toXml(a);
  const b = core.parseXml(s1);
  assert.deepStrictEqual(b, a);
  assert.strictEqual(core.toXml(b), s1, 'ổn định sau 2 vòng');
  assert.strictEqual(a.attrs.t, 'a&b <c> "d" \ne\tf\r');
  assert.ok(s1.includes('&#10;e&#9;f&#13;'), 'thuộc tính giữ xuống dòng/tab dạng tham chiếu');
  assert.ok(s1.includes('<m:r/>') && s1.includes('<empty/>'));
  assert.ok(s1.includes('&lt;b&gt;đậm&lt;/b&gt;'), 'CDATA thành text đã thoát');
  assert.ok(core.toXml(a, { decl: true }).startsWith('<?xml version="1.0" encoding="UTF-8"?><m:oMath'));
  // #fragment: chỉ ghi các con
  assert.strictEqual(core.toXml(core.parseXml('<a/>x<b>y</b>')), '<a/>x<b>y</b>');
  assert.strictEqual(core.toXml({ type: 'text', text: '1<2' }), '1&lt;2');
  void boKhoangTrangGoc;
});

/* ---------------- hiệu năng ---------------- */

function taoDocumentXml(soDoan) {
  const parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="r"><w:body>'];
  for (let i = 0; i < soDoan; i++) {
    parts.push('<w:p w:rsidR="00A1B2C3" w:rsidRDefault="00D4E5F6"><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="60" w:after="60"/></w:pPr>');
    parts.push('<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="FF0000"/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">Câu ' + i + '. </w:t></w:r>');
    parts.push('<w:r><w:t xml:space="preserve">Cho hàm số y = f(x) có đạo hàm &amp; liên tục trên ℝ &lt;đoạn [a; b]&gt; — tính giá trị </w:t></w:r>');
    if (i % 5 === 0) parts.push('<m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>' + i + '</m:t></m:r></m:den></m:f></m:oMath>');
    parts.push('<w:r><w:tab/><w:t>A. ' + i + '</w:t></w:r><!-- c --><w:bookmarkStart w:id="' + i + '" w:name="_GoBack"/><w:bookmarkEnd w:id="' + i + '"/></w:p>');
  }
  parts.push('<w:sectPr/></w:body></w:document>');
  return parts.join('');
}

test('parseXml: document.xml ~2 MB đủ nhanh', () => {
  const s = taoDocumentXml(3500);
  const bytes = Buffer.byteLength(s);
  assert.ok(bytes > 2e6, 'kích thước ' + bytes);
  core.parseXml(taoDocumentXml(50)); // làm nóng
  const t0 = process.hrtime.bigint();
  const x = core.parseXml(s);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(core.findAll(x, 'w:p').length, 3500);
  assert.strictEqual(core.findAll(x, 'm:oMath').length, 700);
  const t1 = process.hrtime.bigint();
  const lai = core.parseXml(core.toXml(x));
  const ms2 = Number(process.hrtime.bigint() - t1) / 1e6;
  assert.deepStrictEqual(lai, x);
  console.log('    ' + (bytes / 1048576).toFixed(2) + ' MB: parse ' + ms.toFixed(0) + ' ms; toXml+parse ' + ms2.toFixed(0) + ' ms');
  assert.ok(ms < 2000, 'quá chậm: ' + ms + ' ms');
  // lồng sâu không tràn ngăn xếp khi parse/duyệt
  const sau = '<a>'.repeat(20000) + 'x' + '</a>'.repeat(20000);
  const y = core.parseXml(sau);
  assert.strictEqual(core.xmlText(y), 'x');
  assert.strictEqual(core.findAll(y, 'a').length, 19999);
});

test('parseXml: document.xml thật trong Downloads (nếu có) — vòng tròn không mất dữ liệu', async () => {
  const dir = 'C:/Users/Administrator/Downloads';
  let list = [];
  try { list = fs.readdirSync(dir).filter(f => /\.docx$/i.test(f) && !f.startsWith('~$')); } catch (e) { /* không có */ }
  if (!list.length) { console.log('    BỎ QUA: không có .docx'); return; }
  list.sort();
  let n = 0, kb = 0, ms = 0;
  for (const f of list.slice(0, 40)) {
    let files;
    try { files = await zip.readZip(fs.readFileSync(path.join(dir, f))); } catch (e) { continue; }
    const xml = files['word/document.xml'];
    if (!xml) continue;
    const s = core.utf8Decode(xml);
    const t0 = Date.now();
    const x = core.parseXml(s);
    ms += Date.now() - t0;
    assert.strictEqual(x.name, 'w:document', f);
    const ps = core.findAll(x, 'w:p');
    assert.ok(ps.length > 0, f + ': không có đoạn');
    const lai = core.parseXml(core.toXml(x));
    assert.deepStrictEqual(lai, x, f + ': vòng tròn khác');
    // chữ trong w:t khớp với cách đếm thô
    const tho = (s.match(/<w:t[ >]/g) || []).length;
    assert.strictEqual(core.findAll(x, 'w:t').length, tho, f + ': số w:t');
    n++; kb += xml.length / 1024;
  }
  console.log('    ' + n + ' file .docx thật, ' + kb.toFixed(0) + ' KB XML, parse tổng ' + ms + ' ms');
  assert.ok(n > 0);
});

/* ---------------- thoát ký tự ---------------- */

test('escXml/escAttr: thoát & < > " và xoá ký tự cấm XML 1.0', () => {
  const cam = '\x00\x01\x08\x0B\x0C\x0E\x1F\u{FFFE}\u{FFFF}';
  assert.strictEqual(core.escXml('a' + cam + 'b'), 'ab');
  assert.strictEqual(core.escXml('<p class="x">Tom & "Jerry"</p>'), '&lt;p class="x"&gt;Tom &amp; "Jerry"&lt;/p&gt;');
  assert.strictEqual(core.escAttr('<p class="x">&\'</p>'), '&lt;p class=&quot;x&quot;&gt;&amp;\'&lt;/p&gt;');
  assert.strictEqual(core.escXml('tab\tdòng\nmới'), 'tab\tdòng\nmới', 'tab/LF hợp lệ trong text');
  assert.strictEqual(core.escAttr('a\tb\nc'), 'a&#9;b&#10;c');
  // emoji (cặp surrogate) giữ nguyên, surrogate lẻ bị xoá
  const lone = String.fromCharCode(0xD800) + 'x' + String.fromCharCode(0xDC00, 0xDC00) + String.fromCharCode(0xD83D);
  assert.strictEqual(core.escXml('\u{1F600}' + lone), '\u{1F600}x');
  assert.strictEqual(core.escXml(null), '');
  assert.strictEqual(core.escXml(12.5), '12.5');
  assert.strictEqual(core.escXml('Tiếng Việt ổn'), 'Tiếng Việt ổn');
  // nhiều lần gọi liên tiếp (regex có cờ g không giữ trạng thái sai)
  for (let i = 0; i < 3; i++) assert.strictEqual(core.escAttr('x\x01y'), 'xy');
});

test('escHtml', () => {
  assert.strictEqual(core.escHtml('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.strictEqual(core.escHtml(undefined), '');
});

/* ---------------- chuỗi tiếng Việt / định danh ---------------- */

test('nfc / slugAscii', () => {
  assert.strictEqual(core.nfc('a\u{300}'), '\u{E0}');
  assert.strictEqual(core.nfc(null), '');
  assert.strictEqual(core.slugAscii('Toán 12 – Chương 1'), 'toan_12_chuong_1');
  assert.strictEqual(core.slugAscii('ĐẠI SỐ & Giải tích!!'), 'dai_so_giai_tich');
  assert.strictEqual(core.slugAscii('Đề kiểm tra'.normalize('NFD')), 'de_kiem_tra');
  assert.strictEqual(core.slugAscii('  __Ồ__ '), 'o');
  assert.strictEqual(core.slugAscii('Tiếng Anh – IELTS (Reading)'), 'tieng_anh_ielts_reading');
  assert.strictEqual(core.slugAscii(''), '');
});

test('hash6: FNV-1a 32 bit gập XOR về 24 bit', () => {
  assert.strictEqual(core.hash6('a'), '0c29c8');   // FNV-1a("a") = e40c292c
  assert.strictEqual(core.hash6(''), '1c9d44');    // 811c9dc5
  assert.strictEqual(core.hash6('Đề thi'), core.hash6('Đề thi'.normalize('NFD')), 'chuẩn hoá NFC trước khi băm');
  assert.notStrictEqual(core.hash6('Toán 12'), core.hash6('Toán 11'));
  assert.match(core.hash6('Văn bản bất kỳ'), /^[0-9a-f]{6}$/);
});

test('bankIdent: ASCII, ổn định, ≤ 64 ký tự', () => {
  const re = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
  const t = 'Toán 12 – Chương 1';
  assert.strictEqual(core.bankIdent(t), 'nh_toan_12_chuong_1_' + core.hash6(t));
  assert.strictEqual(core.bankIdent('  Toán   12 – Chương 1 '), core.bankIdent(t), 'bỏ khoảng trắng thừa');
  assert.strictEqual(core.bankIdent(t.normalize('NFD')), core.bankIdent(t), 'NFD = NFC');
  assert.notStrictEqual(core.bankIdent('Toán 12 – Chương 2'), core.bankIdent(t));
  const dai = 'Ngân hàng câu hỏi ôn tập kiểm tra cuối học kỳ một môn Toán lớp mười hai năm học 2026';
  const id = core.bankIdent(dai);
  assert.match(id, re); assert.ok(id.length <= 64);
  assert.ok(!id.includes('__'), id);
  assert.match(core.bankIdent('!!!'), /^nh_[0-9a-f]{6}$/);
  assert.match(core.bankIdent(''), re);
  assert.match(core.bankIdent('日本語'), re);
});

/* ---------------- đáp án / điểm ---------------- */

test('answerVariants', () => {
  assert.deepStrictEqual(core.answerVariants(['2,67']), ['2,67', '2.67']);
  assert.deepStrictEqual(core.answerVariants(['  8/3 ', '2,67']), ['8/3', '2,67', '2.67']);
  assert.deepStrictEqual(core.answerVariants(['2.5', '2,5']), ['2.5', '2,5'], 'không trùng');
  assert.deepStrictEqual(core.answerVariants(['\u{2212}5']), ['\u{2212}5', '-5']);
  assert.deepStrictEqual(core.answerVariants(['-0,5']), ['-0,5', '\u{2212}0,5', '-0.5', '\u{2212}0.5']);
  assert.deepStrictEqual(core.answerVariants(['Hà Nội', 'hà  nội', 'HÀ NỘI']), ['Hà Nội'], 'trùng không phân biệt hoa thường');
  assert.deepStrictEqual(core.answerVariants(['Ha\u{300}  No\u{323}\u{302}i\u{A0}']), ['H\u{E0} N\u{1ED9}i'], 'NFC + gộp khoảng trắng');
  assert.deepStrictEqual(core.answerVariants(['', '  ', null]), []);
  assert.deepStrictEqual(core.answerVariants('3,14'), ['3,14', '3.14']);
  assert.deepStrictEqual(core.answerVariants([12.5]), ['12.5', '12,5']);
  assert.deepStrictEqual(core.answerVariants(['x = 1,5; y = 2']), ['x = 1,5; y = 2', 'x = 1.5; y = 2']);
  assert.deepStrictEqual(core.answerVariants(null), []);
});

test('parsePoints', () => {
  const ok = { '0,25': 0.25, '0.25': 0.25, '1đ': 1, '1 đ': 1, '(0,5 điểm)': 0.5, '( 0.5 Điểm )': 0.5, '[1,5đ]': 1.5,
    '2': 2, '2 điểm': 2, '1 diem': 1, '0,5đ.': 0.5, ',5': 0.5, '1 pt': 1, '2 points': 2, '0': 0 };
  for (const [k, v] of Object.entries(ok)) assert.strictEqual(core.parsePoints(k), v, k);
  assert.strictEqual(core.parsePoints('(0,5 \u{111}i\u{1EC3}m)'.normalize('NFD')), 0.5);
  for (const k of ['', 'abc', '-1', '1/2', '1,2,3', '0.5 điểm/câu', 'đ', null, undefined, NaN, -2, Infinity])
    assert.strictEqual(core.parsePoints(k), null, String(k));
  assert.strictEqual(core.parsePoints(0.75), 0.75);
});

/* ---------------- Issue + validateQuestion ---------------- */

function cau(type, extra) {
  return Object.assign({ id: 'q07', no: '7', title: 'Câu 7', type, points: 1, stimulus: '', stem: '<p>Nội dung</p>',
    feedback: '', meta: { level: '', topic: '', part: '', tags: [] }, issues: [] }, extra);
}
function loi(q) { return core.validateQuestion(q).filter(i => i.level === 'error').map(i => i.msg); }
function canh(q) { return core.validateQuestion(q).filter(i => i.level === 'warn').map(i => i.msg); }

test('newIssue', () => {
  assert.deepStrictEqual(core.newIssue('error', 'x', 'q1'), { level: 'error', msg: 'x', qid: 'q1' });
  assert.deepStrictEqual(core.newIssue('info', 'y'), { level: 'info', msg: 'y' });
});

test('validateQuestion: câu hợp lệ mọi loại → không lỗi', () => {
  const hop = [
    cau('mc', { choices: [{ id: 'A', html: '1', correct: false }, { id: 'B', html: '<b>2</b>', correct: true }] }),
    cau('ma', { choices: [{ id: 'A', html: '1', correct: true }, { id: 'B', html: '2', correct: true }, { id: 'C', html: '3', correct: false }] }),
    cau('tf', { statements: [{ key: 'a', html: 'x', value: true }, { key: 'b', html: 'y', value: false }] }),
    cau('short', { answers: ['8/3', '2,67'] }),
    cau('num', { numeric: { exact: 12.5, margin: 0 } }),
    cau('num', { numeric: { exact: -3 } }),
    cau('num', { numeric: { min: 1, max: 2 } }),
    cau('blanks', { stem: '<p>Thủ đô là [b1], sông [b2]. Đoạn [−10;10] vẫn được.</p>', blanks: [{ id: 'b1', accepts: ['Hà Nội'] }, { id: 'b2', accepts: ['Hồng', 'Hong'] }] }),
    cau('dropdowns', { stem: 'a) x [s1]<br>b) y [s2]', dropdowns: [{ id: 's1', options: ['Đúng', 'Sai'], correct: 0 }, { id: 's2', options: ['Đúng', 'Sai'], correct: 1 }] }),
    cau('matching', { pairs: [{ left: 'Hà Nội', right: 'Việt Nam' }, { left: '<b>Viêng Chăn</b>', right: 'Lào' }], distractors: ['Thái Lan'] }),
    cau('essay', {}),
    cau('text', { points: 0 }),
  ];
  for (const q of hop) assert.deepStrictEqual(core.validateQuestion(q), [], q.type + ': ' + JSON.stringify(core.validateQuestion(q)));
});

test('validateQuestion: lỗi chung (id, loại, điểm, độ dài)', () => {
  assert.ok(loi(cau('essay', { id: 'Q 7' }))[0].startsWith('Câu 7: mã câu'));
  assert.deepStrictEqual(loi(cau('xyz', {})), ['Câu 7: loại câu không hỗ trợ: "xyz"']);
  for (const p of [0, -1, NaN, '1', undefined, Infinity]) assert.strictEqual(loi(cau('essay', { points: p })).length, 1, 'điểm ' + p);
  assert.deepStrictEqual(loi(cau('text', { points: 0 })), []);
  const is = core.validateQuestion(cau('essay', { points: 0 }));
  assert.strictEqual(is[0].qid, 'q07');
  assert.strictEqual(is[0].level, 'error');
  assert.ok(is[0].msg.startsWith('Câu 7: '));
  // không có số câu → dùng title/id
  assert.ok(core.validateQuestion(cau('essay', { no: '', points: 0 }))[0].msg.startsWith('Câu Câu 7'));
  // độ dài
  const dai = '<p>' + 'x'.repeat(15001) + '</p>';
  assert.strictEqual(canh(cau('essay', { stem: dai })).length, 1);
  assert.match(canh(cau('essay', { stem: '<p>ngắn</p>', stimulus: 'y'.repeat(15000) }))[0], /stimulus: none/);
  assert.deepStrictEqual(canh(cau('essay', { stem: '' })), ['Câu 7: nội dung câu hỏi đang trống']);
  assert.deepStrictEqual(canh(cau('essay', { stem: '<p>&nbsp;</p>' })), ['Câu 7: nội dung câu hỏi đang trống']);
  assert.deepStrictEqual(canh(cau('essay', { stem: '<p><img src="images/a.png"></p>' })), []);
  assert.deepStrictEqual(loi(null), ['Câu hỏi không hợp lệ']);
});

test('validateQuestion: mc / ma', () => {
  assert.deepStrictEqual(loi(cau('mc', { choices: [{ id: 'A', html: '1', correct: true }] })), ['Câu 7: cần ít nhất 2 phương án (đang có 1)']);
  assert.deepStrictEqual(loi(cau('mc', { choices: [{ id: 'A', html: '1' }, { id: 'B', html: '2' }] })), ['Câu 7: chưa xác định đáp án đúng']);
  assert.match(loi(cau('mc', { choices: [{ id: 'A', html: '1', correct: true }, { id: 'B', html: '2', correct: true }] }))[0], /có 2 phương án/);
  assert.match(loi(cau('ma', { choices: [{ id: 'A', html: '1' }, { id: 'B', html: '2' }] }))[0], /chưa xác định đáp án đúng/);
  assert.match(loi(cau('mc', { choices: [{ id: 'A', html: '1', correct: true }, { id: 'A', html: '2' }] }))[0], /trùng nhãn/);
  assert.match(loi(cau('mc', {}))[0], /ít nhất 2 phương án/);
  assert.deepStrictEqual(canh(cau('mc', { choices: [{ id: 'A', html: '', correct: true }, { id: 'B', html: '2' }] })), ['Câu 7: phương án A đang trống']);
});

test('validateQuestion: tf / short / num', () => {
  assert.match(loi(cau('tf', { statements: [] }))[0], /chưa có ý nào/);
  assert.deepStrictEqual(loi(cau('tf', { statements: [{ key: 'a', html: 'x', value: true }, { key: 'b', html: 'y' }] })), ['Câu 7: ý b) chưa xác định Đúng hay Sai']);
  assert.match(loi(cau('tf', { statements: [{ key: 'a', html: 'x', value: 'Đ' }] }))[0], /ý a\)/);
  assert.match(loi(cau('short', { answers: ['', '  '] }))[0], /chưa có đáp án/);
  assert.match(loi(cau('short', {}))[0], /chưa có đáp án/);
  assert.match(loi(cau('short', { answers: ['<b>x</b>'] }))[0], /HTML/);
  assert.deepStrictEqual(loi(cau('short', { answers: ['x < 2', 'a<3'] })), [], 'dấu < trong đáp án không phải thẻ');
  assert.match(loi(cau('num', { numeric: { exact: NaN } }))[0], /không hợp lệ/);
  assert.match(loi(cau('num', { numeric: { exact: '12,5' } }))[0], /không hợp lệ/);
  assert.match(loi(cau('num', { numeric: { exact: 1, margin: -1 } }))[0], /sai số/);
  assert.match(loi(cau('num', { numeric: { min: 3, max: 2 } }))[0], /ngược/);
  assert.match(loi(cau('num', { numeric: { min: 1 } }))[0], /khoảng/);
  assert.match(loi(cau('num', {}))[0], /chưa có đáp án số/);
  assert.match(loi(cau('num', { numeric: {} }))[0], /chưa có đáp án số/);
});

test('validateQuestion: blanks / dropdowns', () => {
  const b = (stem, blanks) => loi(cau('blanks', { stem, blanks }));
  assert.deepStrictEqual(b('[b1]', [{ id: 'b1', accepts: ['x'] }]), []);
  assert.match(b('không có', [{ id: 'b1', accepts: ['x'] }])[0], /thiếu chỗ đặt \[b1\]/);
  assert.match(b('[b1] và [b1]', [{ id: 'b1', accepts: ['x'] }])[0], /xuất hiện 2 lần/);
  assert.match(b('[B1]', [{ id: 'B1', accepts: ['x'] }])[0], /không hợp lệ/);
  assert.match(b('[1b]', [{ id: '1b', accepts: ['x'] }])[0], /không hợp lệ/);
  assert.match(b('[' + 'a'.repeat(17) + ']', [{ id: 'a'.repeat(17), accepts: ['x'] }])[0], /không hợp lệ/);
  assert.match(b('[b1][b1]', [{ id: 'b1', accepts: ['x'] }, { id: 'b1', accepts: ['y'] }]).join('|'), /trùng mã/);
  assert.match(b('[b1]', [{ id: 'b1', accepts: [' '] }])[0], /chưa có đáp án/);
  assert.match(b('[b1]', [{ id: 'b1', accepts: ['<i>x</i>'] }])[0], /HTML/);
  assert.match(b('x', [])[0], /chưa có ô điền/);
  assert.match(canh(cau('blanks', { stem: '[b1]', stimulus: 'xem [b1]', blanks: [{ id: 'b1', accepts: ['x'] }] }))[0], /đoạn dẫn/);
  const d = (dd) => loi(cau('dropdowns', { stem: '[s1]', dropdowns: dd }));
  assert.match(d([{ id: 's1', options: ['Đúng'], correct: 0 }])[0], /ít nhất 2 lựa chọn/);
  assert.match(d([{ id: 's1', options: ['Đúng', 'Sai'] }])[0], /chưa xác định lựa chọn đúng/);
  assert.match(d([{ id: 's1', options: ['Đúng', 'Sai'], correct: 2 }])[0], /chưa xác định lựa chọn đúng/);
  assert.match(d([{ id: 's1', options: ['Đúng', 'Sai'], correct: 0.5 }])[0], /chưa xác định lựa chọn đúng/);
  assert.match(d([{ id: 's1', options: ['<b>Đúng</b>', 'Sai'], correct: 0 }])[0], /HTML/);
  assert.match(d([{ id: 's1', options: ['', 'Sai'], correct: 1 }])[0], /lựa chọn trống/);
  assert.match(canh(cau('dropdowns', { stem: '[s1]', dropdowns: [{ id: 's1', options: ['A', 'a'], correct: 0 }] }))[0], /trùng nhau/);
});

test('validateQuestion: matching', () => {
  const m = (pairs, distractors) => loi(cau('matching', { pairs, distractors }));
  assert.match(m([{ left: 'a', right: 'b' }])[0], /ít nhất 2 cặp/);
  assert.match(m([{ left: 'a', right: 'b' }, { left: '', right: 'c' }])[0], /thiếu vế trái/);
  assert.match(m([{ left: 'a', right: 'b' }, { left: 'x', right: ' ' }])[0], /thiếu vế phải/);
  assert.match(m([{ left: 'a', right: 'b' }, { left: 'x', right: '<img src="images/a.png">' }])[0], /chữ thuần/);
  assert.match(m([{ left: 'a', right: 'b' }, { left: 'x', right: 'b' }], ['<b>y</b>'])[0], /gây nhiễu/);
  assert.deepStrictEqual(m([{ left: 'a', right: 'b' }, { left: 'x', right: 'b' }]), [], 'nhiều vế trái chung một vế phải là hợp lệ');
  assert.deepStrictEqual(m([{ left: '<img src="images/a.png">', right: 'b' }, { left: 'x', right: 'c' }]), [], 'ảnh ở vế trái được');
});

test('looksLikeHtml: thẻ thật là HTML; dấu so sánh trong chữ thuần ("a<b", "x < y") thì không', () => {
  ['<b>x</b>', 'x<sup>2</sup>', '<br>', '<br/>', '<img src="images/a.png">', '<math xmlns="http://www.w3.org/1998/Math/MathML">',
    '</p>', '<!-- c -->', '<span style="color:red">x</span>', '<td colspan=2>'].forEach(s => assert.strictEqual(core.looksLikeHtml(s), true, s));
  ['a<b', 'a < b', 'x<y và y>z', 'a<b và b>c', '2<3', 'x <= y', '-1 < x < 1', 'A<-B'].forEach(s => assert.strictEqual(core.looksLikeHtml(s), false, s));
  // đáp án/lựa chọn/vế phải là chữ thuần có dấu < không bị coi là HTML (giáo viên Toán hay gõ)
  assert.deepStrictEqual(loi(cau('short', { answers: ['a<b', 'a < b'] })), []);
  assert.deepStrictEqual(loi(cau('blanks', { stem: '[b1]', blanks: [{ id: 'b1', accepts: ['x<y'] }] })), []);
  assert.deepStrictEqual(loi(cau('dropdowns', { stem: '[b1]', dropdowns: [{ id: 'b1', options: ['x<y', 'x>y'], correct: 0 }] })), []);
  assert.deepStrictEqual(loi(cau('matching', { pairs: [{ left: 'a', right: 'a<b' }, { left: 'c', right: 'c>d' }], distractors: ['x < y'] })), []);
  assert.match(loi(cau('short', { answers: ['x<sup>2</sup>'] }))[0], /HTML/);
});

/* ---------------- UTF-8 / CRC32 ---------------- */

test('utf8Encode / utf8Decode / crc32', () => {
  const s = 'Đề thi Toán – 𝑥² ✓ \u{1F600}';
  const u = core.utf8Encode(s);
  assert.ok(u instanceof Uint8Array);
  assert.deepStrictEqual(Buffer.from(u), Buffer.from(s, 'utf8'));
  assert.strictEqual(core.utf8Decode(u), s);
  assert.strictEqual(core.utf8Decode(u.buffer.slice(u.byteOffset, u.byteOffset + u.length)), s, 'nhận ArrayBuffer');
  assert.strictEqual(core.utf8Decode(new Uint8Array([0xEF, 0xBB, 0xBF, 0x61])), 'a', 'bỏ BOM');
  assert.strictEqual(core.crc32(core.utf8Encode('123456789')), 0xCBF43926);
  assert.strictEqual(core.crc32(new Uint8Array(0)), 0);
  const big = new Uint8Array(100000).map((_, i) => (i * 31 + 7) & 255);
  const zlib = require('zlib');
  if (zlib.crc32) assert.strictEqual(core.crc32(big), zlib.crc32(big));
  assert.strictEqual(core.crc32(big.subarray(5000), core.crc32(big.subarray(0, 5000))), core.crc32(big), 'tính nối tiếp');
});

test('API khớp DESIGN.md §1', () => {
  for (const f of ['parseXml', 'xmlText', 'find', 'findAll', 'children', 'escXml', 'escAttr', 'escHtml', 'nfc', 'slugAscii',
    'hash6', 'bankIdent', 'answerVariants', 'parsePoints', 'newIssue', 'validateQuestion', 'utf8Encode', 'utf8Decode', 'crc32', 'toXml'])
    assert.strictEqual(typeof core[f], 'function', f);
  // nạp kiểu trình duyệt (không có module/require) → gắn vào self.NH.core
  const vm = require('vm');
  const ctx = { self: {}, TextEncoder, TextDecoder };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8'), ctx);
  assert.strictEqual(typeof ctx.self.NH.core.parseXml, 'function');
  assert.strictEqual(ctx.self.NH.core.bankIdent('Toán 12 – Chương 1'), core.bankIdent('Toán 12 – Chương 1'));
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 6).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (core)');
  process.exitCode = hong ? 1 : 0;
})();
