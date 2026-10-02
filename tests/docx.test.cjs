/* tests/docx.test.cjs — kiểm thử js/docx.js bằng các file .docx dựng bằng mã (chạy: node tests/docx.test.cjs)
 * Không có Word trên máy → bộ dựng .docx tối thiểu bên dưới (document.xml + rels + content types + numbering/styles + media).
 * Mỗi file dựng xong được ghi ra tests/fixtures/docx/ để mở thử bằng Word / nạp thử trên giao diện. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');
const zip = require('../js/zip.js');
const docx = require('../js/docx.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }
const THU_MUC_MAU = path.join(__dirname, 'fixtures', 'docx');
const NGAY = new Date(2026, 0, 1, 8, 0, 0);
const NBSP = String.fromCharCode(0xA0), SHY = String.fromCharCode(0xAD), ZWSP = String.fromCharCode(0x200B);
const MATHNS = '<math xmlns="http://www.w3.org/1998/Math/MathML">';

/* ======================= bộ dựng .docx ======================= */

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:v="urn:schemas-microsoft-com:vml"', 'xmlns:o="urn:schemas-microsoft-com:office:office"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
].join(' ');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rPr(p) {
  if (!p) return '';
  let s = '';
  if (p.style) s += '<w:rStyle w:val="' + p.style + '"/>';
  if (p.font) s += '<w:rFonts w:ascii="' + p.font + '" w:hAnsi="' + p.font + '"/>';
  if (p.b) s += '<w:b/>';
  if (p.i) s += '<w:i/>';
  if (p.strike) s += '<w:strike/>';
  if (p.vanish) s += '<w:vanish/>';
  if (p.color) s += '<w:color w:val="' + p.color + '"/>';
  if (p.u) s += '<w:u w:val="' + (p.u === true ? 'single' : p.u) + '"/>';
  if (p.hl) s += '<w:highlight w:val="' + p.hl + '"/>';
  if (p.shd) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + p.shd + '"/>';
  if (p.sup) s += '<w:vertAlign w:val="superscript"/>';
  if (p.sub) s += '<w:vertAlign w:val="subscript"/>';
  return s ? '<w:rPr>' + s + '</w:rPr>' : '';
}
const R = (t, p) => '<w:r>' + rPr(p) + '<w:t xml:space="preserve">' + x(t) + '</w:t></w:r>';
const TAB = '<w:r><w:tab/></w:r>';
const BR = '<w:r><w:br/></w:r>';
const noi = (parts) => parts.map((p) => (typeof p === 'string' && p[0] !== '<') ? R(p) : p).join('');
const P = (...parts) => '<w:p>' + noi(parts) + '</w:p>';
const PJ = (jc, ...parts) => '<w:p><w:pPr><w:jc w:val="' + jc + '"/></w:pPr>' + noi(parts) + '</w:p>';
const PN = (numId, ilvl, ...parts) => '<w:p><w:pPr><w:numPr><w:ilvl w:val="' + ilvl + '"/><w:numId w:val="' + numId + '"/></w:numPr></w:pPr>' + noi(parts) + '</w:p>';
const PNR = (numId, rpr, ...parts) => '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + numId + '"/></w:numPr>' + rPr(rpr) + '</w:pPr>' + noi(parts) + '</w:p>';
const PS = (style, ...parts) => '<w:p><w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' + noi(parts) + '</w:p>';
function oBang(c) {
  let pr = '';
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    pr = (c.span ? '<w:gridSpan w:val="' + c.span + '"/>' : '') + (c.vm ? '<w:vMerge' + (c.vm === 'restart' ? ' w:val="restart"' : '') + '/>' : '');
    c = c.c;
  }
  const dsP = c == null || c === '' ? ['<w:p/>'] : [].concat(c).map((y) => y.startsWith('<w:') ? y : P(y));
  return '<w:tc><w:tcPr>' + pr + '</w:tcPr>' + dsP.join('') + '</w:tc>';
}
const TBL = (rows) => '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr><w:tblGrid/>' +
  rows.map((r) => '<w:tr>' + r.map(oBang).join('') + '</w:tr>').join('') + '</w:tbl>';
const IMG = (rId, cx, cy, descr) => '<w:r><w:drawing><wp:inline distT="0" distB="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
  '<wp:docPr id="1" name="Picture 1"' + (descr ? ' descr="' + x(descr) + '"' : '') + '/><a:graphic>' +
  '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="' + rId + '"/>' +
  '<a:stretch><a:fillRect/></a:stretch></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
const OLE = (rIdImg, progId) => '<w:r><w:object w:dxaOrig="620" w:dyaOrig="320"><v:shape id="_x0000_i1025" type="#_x0000_t75" ' +
  'style="width:31.15pt;height:15.25pt" o:ole=""><v:imagedata r:id="' + rIdImg + '" o:title=""/></v:shape>' +
  '<o:OLEObject Type="Embed" ProgID="' + progId + '" ShapeID="_x0000_i1025" DrawAspect="Content" ObjectID="_1" r:id="rIdOle"/></w:object></w:r>';
const FLD = (lenh, kq) => '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">' + x(lenh) +
  '</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + R(kq) + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

// OMML
const MR = (t, sty) => '<m:r>' + (sty ? '<m:rPr><m:sty m:val="' + sty + '"/></m:rPr>' : '') + '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t>' + x(t) + '</m:t></m:r>';
const M = (...xs) => '<m:oMath>' + xs.join('') + '</m:oMath>';
const MPARA = (...xs) => '<m:oMathPara><m:oMath>' + xs.join('') + '</m:oMath></m:oMathPara>';
const MF = (a, b) => '<m:f><m:num>' + a + '</m:num><m:den>' + b + '</m:den></m:f>';
const MSQRT = (e) => '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + e + '</m:e></m:rad>';
const MINT = (a, b, e) => '<m:nary><m:naryPr><m:limLoc m:val="subSup"/></m:naryPr><m:sub>' + a + '</m:sub><m:sup>' + b + '</m:sup><m:e>' + e + '</m:e></m:nary>';
const MVEC = (e) => '<m:acc><m:accPr><m:chr m:val="&#x20D7;"/></m:accPr><m:e>' + e + '</m:e></m:acc>';
const MHE = (...rows) => '<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr>' + rows.map((r) => '<m:e>' + r + '</m:e>').join('') + '</m:eqArr></m:e></m:d>';

function NUMBERING(abs, nums) {
  return XML + '<w:numbering ' + NS + '>' +
    abs.map((a) => '<w:abstractNum w:abstractNumId="' + a.id + '"><w:multiLevelType w:val="hybridMultilevel"/>' +
      a.lvls.map((l, i) => '<w:lvl w:ilvl="' + (l.ilvl != null ? l.ilvl : i) + '"><w:start w:val="' + (l.start || 1) + '"/><w:numFmt w:val="' + l.fmt +
        '"/><w:lvlText w:val="' + x(l.text) + '"/>' + (l.suff ? '<w:suff w:val="' + l.suff + '"/>' : '') + '<w:lvlJc w:val="left"/>' +
        (l.rPr ? '<w:rPr>' + l.rPr + '</w:rPr>' : '') + '</w:lvl>').join('') + '</w:abstractNum>').join('') +
    nums.map((n) => '<w:num w:numId="' + n.id + '"><w:abstractNumId w:val="' + n.abs + '"/>' +
      (n.ov || []).map((o) => '<w:lvlOverride w:ilvl="' + (o.ilvl || 0) + '"><w:startOverride w:val="' + o.start + '"/></w:lvlOverride>').join('') +
      '</w:num>').join('') + '</w:numbering>';
}
function STYLES(extra) {
  return XML + '<w:styles ' + NS + '><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>' + (extra || '') + '</w:styles>';
}

// ảnh mẫu: PNG 1×1 thật, EMF/WMF chỉ cần phần đầu nhận dạng
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
const EMF = (() => { const b = new Uint8Array(108); b.set([1, 0, 0, 0], 0); b.set([0x20, 0x45, 0x4D, 0x46], 40); return b; })();
const WMF = (() => { const b = new Uint8Array(40); b.set([0xD7, 0xCD, 0xC6, 0x9A], 0); return b; })();

/*
 * taoDocx(tenFile, bodyXml, {numbering, styles, media: {rId: [tên trong word/media, Uint8Array]}})
 * → Uint8Array (.docx), đồng thời ghi ra tests/fixtures/docx/<tenFile>
 */
async function taoDocx(ten, body, o) {
  o = o || {};
  const rels = [];
  const files = [];
  const media = o.media || {};
  Object.keys(media).forEach((rId) => {
    rels.push('<Relationship Id="' + rId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + media[rId][0] + '"/>');
    files.push({ path: 'word/media/' + media[rId][0], data: media[rId][1] });
  });
  if (o.numbering) rels.push('<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>');
  rels.push('<Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');
  const ct = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="wmf" ContentType="image/x-wmf"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    (o.numbering ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : '') +
    '</Types>';
  files.unshift(
    { path: '[Content_Types].xml', data: ct },
    { path: '_rels/.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { path: 'word/document.xml', data: XML + '<w:document ' + NS + '><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>' },
    { path: 'word/_rels/document.xml.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>' },
    { path: 'word/styles.xml', data: o.styles || STYLES() }
  );
  if (o.numbering) files.push({ path: 'word/numbering.xml', data: o.numbering });
  const u8 = await zip.writeZip(files, { date: NGAY });
  fs.mkdirSync(THU_MUC_MAU, { recursive: true });
  fs.writeFileSync(path.join(THU_MUC_MAU, ten), u8);
  return u8;
}

/* ---- tiện ích kiểm tra ---- */
const loi = (q, level) => q.issues.filter((i) => !level || i.level === level);
const coLoi = (q, re, level) => loi(q, level).some((i) => re.test(i.msg));
function dung(q) { return (q.choices || []).filter((c) => c.correct).map((c) => c.id); }
function khongLoi(q) {
  const e = loi(q, 'error').concat(loi(q, 'warn'));
  assert.deepStrictEqual(e.map((i) => i.msg), [], q.title + ' không được có lỗi/cảnh báo');
}
function moTa(kq) { // in gọn để soi khi hỏng
  return JSON.stringify(kq.banks.map((b) => ({ t: b.title, q: b.questions.map((q) => [q.id, q.no, q.type, q.stem, dung(q)]) })), null, 1);
}

/* ======================= 1. cơ bản: 2 ngân hàng, phần hướng dẫn, mc/ma ======================= */

async function mauCoBan() {
  const body = [
    P(R('HƯỚNG DẪN SOẠN ĐỀ', { b: true })),
    P('Mỗi câu bắt đầu bằng "Câu 1." — phần này nằm trước dòng NGÂN HÀNG nên bị bỏ qua.'),
    P('Câu 1. Đây là câu ví dụ trong phần hướng dẫn'),
    P('A. ví dụ'), P('B. ví dụ 2'),
    P('NGÂN HÀNG: Toán 12 – Chương 1'),
    P('ĐIỂM MẶC ĐỊNH: 0,5'),
    P('PHẦN I. TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN'),
    // câu 1: "Câu 1" bị cắt giữa chữ qua nhiều run; 4 phương án trên một dòng ngăn bằng tab; gạch chân chữ C
    P(R('Câ'), R('u 1', { b: true }), R('. Thủ đô của Việt '), R('Nam', { b: true }), R(' là')),
    P(R('A. Huế'), TAB, R('B. Đà Nẵng'), TAB, R('C', { u: true }), R('. Hà Nội'), TAB, R('D. Cần Thơ')),
    P('Lời giải: Hà Nội là thủ đô của Việt Nam.'),
    // câu 2: điểm + mức độ; phương án trong bảng 2×2; nhãn B tô đỏ
    P('Câu 2 (0,25 điểm) [TH]: Kết quả của 2 + 3 là'),
    TBL([[P('A. 6'), P(R('B.', { color: 'FF0000' }), R(' 5'))], [P('C. 7'), P('D. 8')]]),
    // câu 3: nhiều đáp án qua dòng "Đáp án:"
    P('Câu 3. Những số nào là số nguyên tố?'),
    P('A. 2'), P('B. 4'), P('C. 5'), P('D. 9'),
    P('Đáp án: A, C'),
    // câu 4: tô nền toàn bộ nội dung phương án B (nhãn không tô)
    P('CÂU 4. Số lớn nhất là'),
    P('A. 1'), P(R('B. '), R('100', { hl: 'yellow' })), P('C. 10'), P('D. 50'),
    // câu 5: gạch chân 2 phương án → tự nhận là nhiều đáp án; gạch chân không vào HTML
    P('Câu 5: Chọn các số chẵn'),
    P(R('A. 2', { u: true })), P('B. 3'), P(R('C', { u: true }), R('. '), R('4', { u: true })), P('D. 5'),
    // câu 6: dòng Đáp án mâu thuẫn với chữ đỏ → cảnh báo, dùng dòng Đáp án
    P('Câu 6. 1 + 1 = ?'),
    P('A. 1'), P(R('B. 3', { color: 'FF0000' })), P('C. 2'), P('D. 4'),
    P('Đáp án: C'),
    // câu 7: *A. đánh dấu đúng; nhãn dính chữ "A.12"; nhãn "B)", "C:"
    P('Câu 7. Chọn đáp án'),
    P('*A.12'), P('B)13'), P('C: 14'), P('D) 15'),
    // câu 8: chữ đỏ toàn bộ tài liệu (mọi phương án đỏ) → không dùng màu đỏ làm đáp án; gạch chân nhãn D mới là đáp án
    P('Câu 8. Toàn bộ chữ đỏ'),
    P(R('A. a', { color: 'FF0000' })), P(R('B. b', { color: 'FF0000' })), P(R('C. c', { color: 'FF0000' })), P(R('D', { color: 'FF0000', u: true }), R('. d', { color: 'FF0000' })),
    P('--- HẾT ---'),
    P('Trang 1'),
    P('NGÂN HÀNG: Tiếng Anh 10'),
    P('Câu 1. Choose the correct word'),
    P('A. go B. goes C. going D. gone'),
    P('Đáp án: b'),
    P('Câu 2. She ___ to school every day.'),
    P('A. walk'), P('B. walks')
  ].join('');
  return docx.parseDocx(await taoDocx('co-ban.docx', body), { fileName: 'co-ban.docx' });
}

test('cơ bản: bỏ phần hướng dẫn, 2 ngân hàng, điểm mặc định, PHẦN', async () => {
  const kq = await mauCoBan();
  assert.deepStrictEqual(kq.issues, []);
  assert.strictEqual(kq.banks.length, 2, moTa(kq));
  const [b1, b2] = kq.banks;
  assert.strictEqual(b1.title, 'Toán 12 – Chương 1');
  assert.strictEqual(b1.ident, core.bankIdent('Toán 12 – Chương 1'));
  assert.deepStrictEqual(b1.source, { kind: 'docx', name: 'co-ban.docx' });
  assert.strictEqual(b2.title, 'Tiếng Anh 10');
  assert.deepStrictEqual(b1.questions.map((q) => q.id), ['q01', 'q02', 'q03', 'q04', 'q05', 'q06', 'q07', 'q08'], moTa(kq));
  assert.deepStrictEqual(b1.questions.map((q) => q.no), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepStrictEqual(b1.questions.map((q) => q.type), ['mc', 'mc', 'ma', 'mc', 'ma', 'mc', 'mc', 'mc']);
  assert.deepStrictEqual(b1.questions.map((q) => q.points), [0.5, 0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  b1.questions.forEach((q) => assert.strictEqual(q.meta.part, 'PHẦN I. TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN'));
  assert.deepStrictEqual(b1.images, {});
  // "Trang 1" sau "--- HẾT ---" nằm ngoài câu hỏi
  assert.ok(b1.warnings.some((w) => w.level === 'info' && /Bỏ qua 1 đoạn.*Trang 1/.test(w.msg)), JSON.stringify(b1.warnings));
  // điểm mặc định giữ nguyên sang ngân hàng sau ("từ đây trở đi")
  assert.deepStrictEqual(b2.questions.map((q) => q.points), [0.5, 0.5]);
});

test('cơ bản: phương án cùng dòng (tab), gạch chân nhãn, lời giải, run cắt giữa chữ', async () => {
  const q = (await mauCoBan()).banks[0].questions[0];
  assert.strictEqual(q.title, 'Câu 1');
  assert.strictEqual(q.stem, '<p>Thủ đô của Việt <strong>Nam</strong> là</p>');
  assert.deepStrictEqual(q.choices, [
    { id: 'A', html: 'Huế', correct: false }, { id: 'B', html: 'Đà Nẵng', correct: false },
    { id: 'C', html: 'Hà Nội', correct: true }, { id: 'D', html: 'Cần Thơ', correct: false }
  ]);
  assert.strictEqual(q.feedback, '<p>Hà Nội là thủ đô của Việt Nam.</p>');
  assert.strictEqual(q.stimulus, '');
  assert.deepStrictEqual(q.meta, { level: '', topic: '', part: 'PHẦN I. TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN', tags: [] });
  assert.deepStrictEqual(q.issues, []);
  for (const k of ['statements', 'answers', 'numeric', 'blanks', 'dropdowns', 'pairs', 'distractors']) assert.ok(!(k in q), k);
});

test('cơ bản: bảng 2×2, nhãn đỏ, điểm + mức độ; Đáp án nhiều chữ; tô nền; gạch chân nhiều phương án', async () => {
  const qs = (await mauCoBan()).banks[0].questions;
  const q2 = qs[1];
  assert.strictEqual(q2.title, 'Câu 2 [TH]');
  assert.strictEqual(q2.meta.level, 'TH');
  assert.strictEqual(q2.stem, '<p>Kết quả của 2 + 3 là</p>');
  assert.deepStrictEqual(q2.choices.map((c) => [c.id, c.html, c.correct]), [['A', '6', false], ['B', '5', true], ['C', '7', false], ['D', '8', false]]);
  khongLoi(q2);
  assert.deepStrictEqual(dung(qs[2]), ['A', 'C']);
  khongLoi(qs[2]);
  assert.deepStrictEqual(dung(qs[3]), ['B']);
  assert.strictEqual(qs[3].choices[1].html, '100');
  assert.deepStrictEqual(dung(qs[4]), ['A', 'C']);
  assert.deepStrictEqual(qs[4].choices.map((c) => c.html), ['2', '3', '4', '5'], 'gạch chân đánh dấu đáp án không vào HTML');
});

test('cơ bản: Đáp án mâu thuẫn đánh dấu, *A., nhãn dính chữ, mọi phương án cùng màu đỏ', async () => {
  const qs = (await mauCoBan()).banks[0].questions;
  assert.deepStrictEqual(dung(qs[5]), ['C']);
  assert.ok(coLoi(qs[5], /Đáp án: C.*khác với phương án được đánh dấu \(B\)/, 'warn'), JSON.stringify(qs[5].issues));
  assert.deepStrictEqual(qs[6].choices.map((c) => [c.id, c.html, c.correct]), [['A', '12', true], ['B', '13', false], ['C', '14', false], ['D', '15', false]]);
  khongLoi(qs[6]);
  assert.deepStrictEqual(dung(qs[7]), ['D'], 'màu đỏ ở mọi phương án bị bỏ qua, gạch chân nhãn D là đáp án');
});

test('cơ bản: ngân hàng 2 — 4 phương án cách nhau 1 dấu cách, "Đáp án: b" chữ thường, câu thiếu đáp án báo lỗi', async () => {
  const qs = (await mauCoBan()).banks[1].questions;
  assert.deepStrictEqual(qs[0].choices.map((c) => [c.id, c.html, c.correct]), [['A', 'go', false], ['B', 'goes', true], ['C', 'going', false], ['D', 'gone', false]]);
  assert.strictEqual(qs[1].type, 'mc');
  assert.ok(coLoi(qs[1], /^Câu 2: chưa xác định đáp án đúng$/, 'error'), JSON.stringify(qs[1].issues));
  assert.strictEqual(qs[1].issues[0].qid, 'q02');
});

/* ======================= 2. đánh số tự động (numbering.xml) ======================= */

async function mauDanhSo() {
  const numbering = NUMBERING([
    { id: 0, lvls: [{ fmt: 'upperLetter', text: '%1.' }] },
    { id: 1, lvls: [{ fmt: 'lowerLetter', text: '%1)' }] },
    { id: 2, lvls: [{ fmt: 'decimal', text: 'Câu %1.', suff: 'space' }] },
    { id: 3, lvls: [{ fmt: 'upperLetter', text: '%1.' }] }
  ], [
    { id: 1, abs: 0 }, { id: 2, abs: 0, ov: [{ start: 1 }] }, { id: 3, abs: 1 }, { id: 4, abs: 2 }, { id: 6, abs: 3 }
  ]);
  const styles = STYLES('<w:style w:type="paragraph" w:styleId="CauHoi"><w:name w:val="Cau hoi"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr></w:pPr><w:rPr><w:b/></w:rPr></w:style>');
  const body = [
    P('NGÂN HÀNG: Đánh số tự động'),
    PN(4, 0, 'Thủ đô của Pháp là'),
    PN(1, 0, 'London'), PN(1, 0, 'Paris'), PN(1, 0, 'Rome'), PN(1, 0, 'Berlin'),
    P('Đáp án: B'),
    PN(4, 0, 'Phân số nào lớn nhất?'),
    PN(2, 0, M(MF(MR('1'), MR('2')))), PN(2, 0, M(MF(MR('1'), MR('3')))), PN(2, 0, M(MF(MR('1'), MR('4')))), PN(2, 0, M(MF(MR('1'), MR('5')))),
    P('Đáp án: A'),
    PN(4, 0, 'Cho các mệnh đề sau'),
    PN(3, 0, 'Mệnh đề 1'), PN(3, 0, 'Mệnh đề 2'), PN(3, 0, 'Mệnh đề 3'), PN(3, 0, 'Mệnh đề 4'),
    P('Đáp án: Đ, S, S, Đ'),
    PN(4, 0, 'Câu hỏi bốn'),
    PN(6, 0, 'w'), PNR(6, { color: 'FF0000' }, 'x'), PN(6, 0, 'y'), PN(6, 0, 'z'),
    PN(4, 0, 'Câu hỏi năm'),
    PN(6, 0, 'p'), PN(6, 0, 'q'), PN(6, 0, 'r'), PN(6, 0, 's'),
    P('Đáp án: G'),
    PS('CauHoi', 'Câu hỏi sáu (đánh số qua kiểu đoạn)'),
    P('A. một'), P(R('B', { hl: 'yellow' }), R('. hai'))
  ].join('');
  return docx.parseDocx(await taoDocx('danh-so.docx', body, { numbering, styles }), { fileName: 'danh-so.docx' });
}

test('đánh số tự động: "Câu %1." / "A." / "a)" dựng lại từ numbering.xml, startOverride, kiểu đoạn', async () => {
  const kq = await mauDanhSo();
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5', '6'], moTa(kq));
  assert.strictEqual(qs[0].stem, '<p>Thủ đô của Pháp là</p>');
  assert.deepStrictEqual(qs[0].choices.map((c) => [c.id, c.html, c.correct]), [['A', 'London', false], ['B', 'Paris', true], ['C', 'Rome', false], ['D', 'Berlin', false]]);
  khongLoi(qs[0]);
  // num 2 dùng chung abstractNum 0 nhưng có startOverride → bắt đầu lại từ A
  assert.deepStrictEqual(qs[1].choices.map((c) => c.id), ['A', 'B', 'C', 'D']);
  assert.strictEqual(qs[1].choices[0].html, MATHNS + '<mfrac><mn>1</mn><mn>2</mn></mfrac></math>');
  assert.deepStrictEqual(dung(qs[1]), ['A']);
  khongLoi(qs[1]);
  assert.strictEqual(qs[2].type, 'tf');
  assert.deepStrictEqual(qs[2].statements, [
    { key: 'a', html: 'Mệnh đề 1', value: true }, { key: 'b', html: 'Mệnh đề 2', value: false },
    { key: 'c', html: 'Mệnh đề 3', value: false }, { key: 'd', html: 'Mệnh đề 4', value: true }
  ]);
  khongLoi(qs[2]);
  // nhãn tự đánh số mang định dạng dấu đoạn (pPr/rPr đỏ) → B đúng
  assert.deepStrictEqual(dung(qs[3]), ['B']);
  assert.strictEqual(qs[3].choices[1].html, 'x');
});

test('đánh số tự động: danh sách chạy tiếp E–H được đánh lại A–D, "Đáp án: G" hiểu theo nhãn gốc', async () => {
  const qs = (await mauDanhSo()).banks[0].questions;
  assert.deepStrictEqual(qs[4].choices.map((c) => [c.id, c.html]), [['A', 'p'], ['B', 'q'], ['C', 'r'], ['D', 's']]);
  assert.deepStrictEqual(dung(qs[4]), ['C']);
  assert.ok(coLoi(qs[4], /E, F, G, H.*đánh lại thành A, B, C, D/, 'info'), JSON.stringify(qs[4].issues));
  assert.strictEqual(qs[5].stem, '<p><strong>Câu hỏi sáu (đánh số qua kiểu đoạn)</strong></p>');
  assert.deepStrictEqual(dung(qs[5]), ['B']);
});

/* ======================= 3. các loại câu, đoạn dẫn ======================= */

async function mauLoaiCau() {
  const body = [
    P('NGÂN HÀNG: Các loại câu'),
    P('PHẦN II. TRẮC NGHIỆM ĐÚNG SAI'),
    P('Câu 1. Cho hàm số y = x', R('2', { sup: true }), '.'),
    P("a) Hàm số có đạo hàm y' = 2x."), P('b) Hàm số đồng biến trên ℝ.'), P('c) Đồ thị đi qua gốc toạ độ.'), P('d) Giá trị nhỏ nhất bằng 0.'),
    P('Đáp án: a) Đúng b) Sai c) Đúng d) Đúng'),
    P('Câu 2. Xét các phát biểu'),
    P(R('a', { u: true }), R(') P1')), P('b) P2'), P('c) P3'), P(R('d', { u: true }), R(') P4')),
    P('Câu 3. Câu đúng sai chưa có đáp án'),
    P('a) x'), P('b) y'),
    P('PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN'),
    P('Câu 1. Tính 8 : 3 (làm tròn đến hàng phần trăm).'),
    P('Đáp án: 2,67 | 8/3'),
    P('Câu 2 [SỐ]. Số π gần đúng'),
    P('Đáp án: 3,14 ± 0,01'),
    P('Câu 3. Nghiệm thuộc khoảng nào'),
    P('Đáp án: 1,5 .. 2'),
    P('Câu 4 [SỐ]. Đáp án số viết sai'),
    P('Đáp án: abc'),
    P('ĐOẠN DẪN: Đọc đoạn văn sau và trả lời câu 5, 6.'),
    P(R('Hà Nội', { i: true }), R(' là thủ đô của Việt Nam.')),
    P('Câu 5. Đoạn văn nói về thành phố nào?'),
    P('Đáp án: Hà Nội'),
    P('Câu 6. Thành phố đó thuộc nước nào?'),
    P('Đáp án: Việt Nam'),
    P('HẾT ĐOẠN DẪN'),
    P('Câu 7. Câu không có đoạn dẫn'),
    P('Đáp án: 7'),
    P('PHẦN IV. TỰ LUẬN'),
    P('Câu 1 (2 điểm). Chứng minh tổng ba góc của tam giác bằng 180°.'),
    P('a) Vẽ hình.'), P('b) Chứng minh.'),
    P('Hướng dẫn chấm:'),
    P('Kẻ đường thẳng song song với một cạnh.'),
    P('Câu 2 [ĐIỀN]. Thủ đô của Việt Nam là ', R('[[Hà '), R('Nội|Ha Noi]]'), ', của Pháp là [[Paris]].'),
    P('Câu 3. Mặt Trời mọc ở hướng [[*Đông|Tây|Nam]] và lặn ở hướng [[Đông|*Tây]].'),
    P('Câu 4. Ghép thủ đô với quốc gia'),
    P('Hà Nội => Việt Nam'), P('Paris => Pháp'), P('Nhiễu: Lào; Thái Lan'),
    P('Câu 5 [GHÉP]. Ghép số với chữ'),
    P('1 → một'), P('2 -> hai'),
    P('Câu 6. Viết đoạn văn ngắn về gia đình.'),
    P('Câu 7. Câu tự luận có đáp án dài'),
    P('Đáp án: Học sinh trình bày được các ý: ý thứ nhất, ý thứ hai, ý thứ ba; lập luận chặt chẽ, diễn đạt mạch lạc.'),
    P('PHẦN V. CÂU TỰ NHẬN DIỆN'),
    P('Câu 1. Không có gì để chấm')
  ].join('');
  return docx.parseDocx(await taoDocx('loai-cau.docx', body), { fileName: 'loai-cau.docx' });
}

test('loại câu: Đúng/Sai — "Đáp án: a) Đúng b) Sai…", gạch chân nhãn ý, thiếu đáp án', async () => {
  const kq = await mauLoaiCau();
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.type), ['tf', 'tf', 'tf', 'short', 'num', 'num', 'num', 'short', 'short', 'short',
    'essay', 'blanks', 'dropdowns', 'matching', 'matching', 'essay', 'essay', 'essay'], moTa(kq));
  assert.strictEqual(qs[0].stem, '<p>Cho hàm số y = x<sup>2</sup>.</p>');
  assert.deepStrictEqual(qs[0].statements.map((s) => [s.key, s.html, s.value]), [
    ['a', "Hàm số có đạo hàm y' = 2x.", true], ['b', 'Hàm số đồng biến trên ℝ.', false], ['c', 'Đồ thị đi qua gốc toạ độ.', true], ['d', 'Giá trị nhỏ nhất bằng 0.', true]
  ]);
  khongLoi(qs[0]);
  assert.deepStrictEqual(qs[1].statements.map((s) => [s.key, s.html, s.value]), [['a', 'P1', true], ['b', 'P2', false], ['c', 'P3', false], ['d', 'P4', true]]);
  khongLoi(qs[1]);
  assert.ok(coLoi(qs[2], /chưa xác định ý nào Đúng\/Sai/, 'error'), JSON.stringify(qs[2].issues));
  assert.strictEqual(qs.length, 18);
  // tiêu đề có thêm phần khi số câu lặp lại giữa các PHẦN
  assert.strictEqual(qs[0].title, 'Câu 1 (Phần II)');
  assert.strictEqual(qs[3].title, 'Câu 1 (Phần III)');
});

test('loại câu: trả lời ngắn (biến thể), số (± và khoảng), số sai định dạng', async () => {
  const qs = (await mauLoaiCau()).banks[0].questions;
  assert.deepStrictEqual(qs[3].answers, ['2,67', '8/3', '2.67']);
  khongLoi(qs[3]);
  assert.deepStrictEqual(qs[4].numeric, { exact: 3.14, margin: 0.01 });
  assert.deepStrictEqual(qs[5].numeric, { min: 1.5, max: 2 });
  khongLoi(qs[5]);
  assert.ok(coLoi(qs[6], /đáp án số không đọc được: "abc"/, 'error'), JSON.stringify(qs[6].issues));
});

test('loại câu: ĐOẠN DẪN gắn cho 2 câu, HẾT ĐOẠN DẪN kết thúc', async () => {
  const qs = (await mauLoaiCau()).banks[0].questions;
  const stim = '<p>Đọc đoạn văn sau và trả lời câu 5, 6.</p><p><em>Hà Nội</em> là thủ đô của Việt Nam.</p>';
  assert.strictEqual(qs[7].stimulus, stim);
  assert.strictEqual(qs[8].stimulus, stim);
  assert.strictEqual(qs[7].stem, '<p>Đoạn văn nói về thành phố nào?</p>');
  assert.deepStrictEqual(qs[7].answers, ['Hà Nội']);
  assert.deepStrictEqual(qs[8].answers, ['Việt Nam']);
  assert.strictEqual(qs[9].stimulus, '');
  assert.deepStrictEqual(qs[9].answers, ['7']);
});

test('loại câu: tự luận (hướng dẫn chấm, ý a/b giữ trong nội dung), ô điền, ô chọn, ghép nối', async () => {
  const qs = (await mauLoaiCau()).banks[0].questions;
  const tl = qs[10];
  assert.strictEqual(tl.points, 2);
  assert.strictEqual(tl.stem, '<p>Chứng minh tổng ba góc của tam giác bằng 180°.</p><p>a) Vẽ hình.</p><p>b) Chứng minh.</p>');
  assert.strictEqual(tl.feedback, '<p>Kẻ đường thẳng song song với một cạnh.</p>');
  assert.deepStrictEqual(tl.issues, [], 'phần tự luận: không nhắc "chưa có đáp án"');
  const dien = qs[11];
  assert.strictEqual(dien.stem, '<p>Thủ đô của Việt Nam là [b1], của Pháp là [b2].</p>');
  assert.deepStrictEqual(dien.blanks, [{ id: 'b1', accepts: ['Hà Nội', 'Ha Noi'] }, { id: 'b2', accepts: ['Paris'] }]);
  khongLoi(dien);
  const chon = qs[12];
  assert.strictEqual(chon.stem, '<p>Mặt Trời mọc ở hướng [b1] và lặn ở hướng [b2].</p>');
  assert.deepStrictEqual(chon.dropdowns, [{ id: 'b1', options: ['Đông', 'Tây', 'Nam'], correct: 0 }, { id: 'b2', options: ['Đông', 'Tây'], correct: 1 }]);
  khongLoi(chon);
  const ghep = qs[13];
  assert.strictEqual(ghep.stem, '<p>Ghép thủ đô với quốc gia</p>');
  assert.deepStrictEqual(ghep.pairs, [{ left: 'Hà Nội', right: 'Việt Nam' }, { left: 'Paris', right: 'Pháp' }]);
  assert.deepStrictEqual(ghep.distractors, ['Lào', 'Thái Lan']);
  khongLoi(ghep);
  assert.deepStrictEqual(qs[14].pairs, [{ left: '1', right: 'một' }, { left: '2', right: 'hai' }]);
  assert.deepStrictEqual(qs[15].issues, []);
  assert.strictEqual(qs[16].feedback, '<p>Học sinh trình bày được các ý: ý thứ nhất, ý thứ hai, ý thứ ba; lập luận chặt chẽ, diễn đạt mạch lạc.</p>');
  // ngoài phần tự luận: không có gì → tự luận + nhắc info
  assert.ok(coLoi(qs[17], /chưa có đáp án → tự luận/, 'info'), JSON.stringify(qs[17].issues));
});

/* ======================= 4. bảng đáp án ======================= */

async function mauBangDapAn() {
  const pa = () => [P('A. a'), P('B. b'), P('C. c'), P('D. d')];
  const y = () => [P('a) ý 1'), P('b) ý 2'), P('c) ý 3'), P('d) ý 4')];
  const body = [
    P('NGÂN HÀNG: Bảng đáp án'),
    P('PHẦN I. TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN'),
    P('Câu 1. Một'), ...pa(), P('Câu 2. Hai'), ...pa(), P('Câu 3. Ba'), ...pa(), P('Câu 4. Bốn'), ...pa(),
    P('PHẦN II. TRẮC NGHIỆM ĐÚNG SAI'),
    P('Câu 1. Đúng sai một'), ...y(), P('Câu 2. Đúng sai hai'), ...y(),
    P('PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN'),
    P('Câu 1. Ngắn một'), P('Câu 2. Ngắn hai'),
    P('BẢNG ĐÁP ÁN'),
    P('PHẦN I'),
    TBL([['Câu', '1', '2'], ['Đ/A', 'B', 'C']]),
    P('3.A    4-D'),
    P('Phần II.'),
    TBL([[{ span: 2, c: 'Câu 1' }, { span: 2, c: 'Câu 2' }], ['a.', 'Đ', 'a.', 'S'], ['b.', 'S', 'b.', 'S'], ['c.', 'Đ', 'c.', 'Đ'], ['d.', 'S', 'd.', 'Đ']]),
    P('PHẦN III'),
    P('Câu 1.'),
    TBL([['1', '2', ',', '5']]),
    TBL([['Câu', 'Đáp án'], ['2', '-3']]),
    P('NGÂN HÀNG: Bảng đáp án 2'),
    P('PHẦN I. TRẮC NGHIỆM'),
    P('Câu 1. x'), ...pa(), P('Câu 2. y'), ...pa(),
    P('PHẦN II. TRẮC NGHIỆM'),
    P('Câu 1. z'), ...pa(), P('Câu 2. t'), ...pa(),
    P('BẢNG ĐÁP ÁN: 1.A 2.B 1.C 2D 9.A')
  ].join('');
  return docx.parseDocx(await taoDocx('bang-dap-an.docx', body), { fileName: 'bang-dap-an.docx' });
}

test('BẢNG ĐÁP ÁN: bảng ngang, cặp "3.A 4-D", bảng Đúng/Sai gộp ô, bảng một hàng ký tự, bảng dọc', async () => {
  const kq = await mauBangDapAn();
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.type), ['mc', 'mc', 'mc', 'mc', 'tf', 'tf', 'short', 'short'], moTa(kq));
  assert.deepStrictEqual(qs.slice(0, 4).map((q) => dung(q)[0]), ['B', 'C', 'A', 'D']);
  assert.deepStrictEqual(qs[4].statements.map((s) => s.value), [true, false, true, false]);
  assert.deepStrictEqual(qs[5].statements.map((s) => s.value), [false, false, true, true]);
  assert.deepStrictEqual(qs[6].answers, ['12,5', '12.5']);
  assert.deepStrictEqual(qs[7].answers, ['-3', String.fromCharCode(0x2212) + '3']);
  qs.forEach(khongLoi);
  assert.deepStrictEqual(kq.banks[0].warnings, []);
  assert.deepStrictEqual(qs.map((q) => q.title), ['Câu 1 (Phần I)', 'Câu 2 (Phần I)', 'Câu 3 (Phần I)', 'Câu 4 (Phần I)',
    'Câu 1 (Phần II)', 'Câu 2 (Phần II)', 'Câu 1 (Phần III)', 'Câu 2 (Phần III)']);
});

test('BẢNG ĐÁP ÁN: số câu lặp lại theo phần → ghép theo lần xuất hiện; câu không tồn tại → cảnh báo', async () => {
  const b = (await mauBangDapAn()).banks[1];
  assert.deepStrictEqual(b.questions.map((q) => dung(q)[0]), ['A', 'B', 'C', 'D']);
  assert.ok(b.warnings.some((w) => w.level === 'warn' && /BẢNG ĐÁP ÁN có câu 9/.test(w.msg)), JSON.stringify(b.warnings));
});

/* ======================= 5. ảnh, công thức, MathType ======================= */

async function mauAnhCongThuc(opts) {
  const body = [
    P('NGÂN HÀNG: Ảnh và công thức'),
    P('Câu 1. Quan sát hình'),
    PJ('center', IMG('rIdPng', 1905000, 952500, 'Hình tam giác')),
    P('A. 1'), P('B. 2'), P('Đáp án: A'),
    P('Câu 2. Tính ', M(MF(MR('1'), MR('2'))), ' + ', M(MSQRT(MR('4'))), ' và ', M(MINT(MR('0'), MR('1'), MR('x') + MR('dx')))),
    P('A. ', M(MVEC(MR('AB')))), P(R('B', { u: true }), R('. '), M(MF(MR('3'), MR('2')))),
    P('Câu 3. Giải hệ phương trình'),
    P(MPARA(MHE(MR('x+y=3'), MR('x-y=1')))),
    P('Đáp án: (2; 1)'),
    P('Câu 4. Hình EMF'),
    P(IMG('rIdEmf', 952500, 952500)),
    P('A. 1'), P('B. 2'), P('Đáp án: B'),
    P('Câu 5. Công thức MathType ', OLE('rIdWmf', 'Equation.DSMT4')),
    P('A. 1'), P('B. 2'), P('Đáp án: B'),
    P('Câu 6. Dùng lại ảnh ', IMG('rIdPng', 952500, 952500)),
    P('Đáp án: 6'),
    P('Câu 7. LaTeX: tính $\\frac{1}{2}$ + 1 (giá 5$ không phải công thức)'),
    P('Đáp án: 1,5'),
    P('Câu 8. Viết 2,(6) dưới dạng phân số'),
    P('Đáp án: $\\frac{8}{3}$')
  ].join('');
  const u8 = await taoDocx('anh-cong-thuc.docx', body, { media: { rIdPng: ['image1.png', PNG], rIdEmf: ['image2.emf', EMF], rIdWmf: ['image3.wmf', WMF] } });
  return docx.parseDocx(u8, Object.assign({ fileName: 'anh-cong-thuc.docx' }, opts));
}

test('ảnh PNG (đổi tên img_001.png, kích thước, căn giữa), dùng lại cùng tên; EMF/MathType → lỗi', async () => {
  const kq = await mauAnhCongThuc({ latex: null });
  const b = kq.banks[0], qs = b.questions;
  assert.deepStrictEqual(Object.keys(b.images), ['img_001.png']);
  assert.ok(Buffer.from(b.images['img_001.png']).equals(Buffer.from(PNG)));
  assert.strictEqual(qs[0].stem, '<p>Quan sát hình</p><p style="text-align:center"><img src="images/img_001.png" alt="Hình tam giác" style="max-width:100%;height:auto" width="200"></p>');
  khongLoi(qs[0]);
  assert.ok(coLoi(qs[3], /^Câu 4: có công thức MathType\/ảnh EMF — trong Word chọn MathType → Convert Equations → Office Math/, 'error'), JSON.stringify(qs[3].issues));
  assert.ok(coLoi(qs[4], /^Câu 5: có công thức MathType \(Equation\.DSMT4\)/, 'error'), JSON.stringify(qs[4].issues));
  assert.strictEqual(qs[5].stem, '<p>Dùng lại ảnh <img src="images/img_001.png" alt="" style="max-width:100%;height:auto" width="100"></p>');
});

test('công thức Office Math: phân số, căn, tích phân, vectơ, hệ phương trình (oMathPara)', async () => {
  const qs = (await mauAnhCongThuc({ latex: null })).banks[0].questions;
  assert.strictEqual(qs[1].stem, '<p>Tính ' + MATHNS + '<mfrac><mn>1</mn><mn>2</mn></mfrac></math> + ' + MATHNS + '<msqrt><mn>4</mn></msqrt></math> và ' +
    MATHNS + '<mrow><msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup><mrow><mi>x</mi><mi>d</mi><mi>x</mi></mrow></mrow></math></p>');
  assert.strictEqual(qs[1].choices[0].html, MATHNS + '<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>→</mo></mover></math>');
  assert.deepStrictEqual(dung(qs[1]), ['B']);
  assert.strictEqual(qs[2].type, 'short');
  assert.ok(qs[2].stem.includes('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mo fence="true">{</mo><mtable columnalign="left">'), qs[2].stem);
  assert.deepStrictEqual(qs[2].answers, ['(2; 1)']);
});

test('LaTeX $…$ → MathML qua latex.toMathML (có latex.js) / giữ nguyên khi không có', async () => {
  const stub = { toMathML: (tex) => MATHNS + '<mtext>' + tex + '</mtext></math>' };
  const qs = (await mauAnhCongThuc({ latex: stub })).banks[0].questions;
  assert.strictEqual(qs[6].stem, '<p>LaTeX: tính ' + MATHNS + '<mtext>\\frac{1}{2}</mtext></math> + 1 (giá 5$ không phải công thức)</p>');
  const qs2 = (await mauAnhCongThuc({ latex: null })).banks[0].questions;
  assert.strictEqual(qs2[6].stem, '<p>LaTeX: tính $\\frac{1}{2}$ + 1 (giá 5$ không phải công thức)</p>');
  // chỉ có replaceDollar
  const stub2 = { replaceDollar: (s) => s.replace(/^\$(.*)\$$/, MATHNS + '<mi>$1</mi></math>') };
  const qs3 = (await mauAnhCongThuc({ latex: stub2 })).banks[0].questions;
  assert.ok(qs3[6].stem.includes(MATHNS + '<mi>\\frac{1}{2}</mi></math>'), qs3[6].stem);
});

test('LaTeX với js/latex.js + js/math.js thật (nếu đã có): công thức trong nội dung và trong dòng Đáp án', async () => {
  if (!fs.existsSync(path.join(__dirname, '../js/latex.js')) || !fs.existsSync(path.join(__dirname, '../js/math.js'))) { console.log('       (bỏ qua: chưa có latex.js/math.js)'); return; }
  const qs = (await mauAnhCongThuc({})).banks[0].questions;
  assert.strictEqual(qs[6].stem, '<p>LaTeX: tính ' + MATHNS + '<mfrac><mn>1</mn><mn>2</mn></mfrac></math> + 1 (giá 5$ không phải công thức)</p>');
  assert.deepStrictEqual(qs[7].answers, ['8/3']);
});

test('hình vẽ/hộp văn bản (mc:AlternateContent) → cảnh báo một lần; ảnh VML; trường EQ → lỗi; bảng gộp ô trong nội dung', async () => {
  const shape = '<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wp:extent cx="952500" cy="952500"/><wp:docPr id="5" name="Text Box 5"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:txbx><w:txbxContent>' +
    P('chữ trong hộp') + '</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>' +
    '<mc:Fallback><w:pict><v:rect><v:textbox><w:txbxContent>' + P('chữ trong hộp') + '</w:txbxContent></v:textbox></v:rect></w:pict></mc:Fallback></mc:AlternateContent></w:r>';
  const vml = '<w:r><w:pict><v:shape id="s1" style="width:75pt;height:30pt"><v:imagedata r:id="rIdPng" o:title=""/></v:shape></w:pict></w:r>';
  const body = [
    P('NGÂN HÀNG: Hình vẽ'),
    P('Câu 1. Có hộp văn bản ', shape, ' ở đây'), P('Đáp án: 1'),
    P('Câu 2. Ảnh kiểu cũ ', vml), P('Đáp án: 2'),
    P('Câu 3. Phân số kiểu trường ', FLD(' EQ \\f(1,2) ', '')), P('Đáp án: 3'),
    P('Câu 4. Bảng có ô gộp'),
    TBL([[{ span: 2, c: 'Tiêu đề' }, { vm: 'restart', c: 'Gộp dọc' }], ['x', 'y', { vm: 'continue', c: '' }]]),
    P('Đáp án: 4')
  ].join('');
  const kq = await docx.parseDocx(await taoDocx('hinh-ve.docx', body, { media: { rIdPng: ['image1.png', PNG] } }), { fileName: 'hinh-ve.docx' });
  const qs = kq.banks[0].questions;
  assert.strictEqual(qs[0].stem, '<p>Có hộp văn bản  ở đây</p>');
  assert.deepStrictEqual(loi(qs[0]).map((i) => i.level + ' ' + i.msg), ['warn Câu 1: có hình vẽ/hộp văn bản (text box) của Word không chuyển được — nội dung đó bị bỏ; hãy chụp thành ảnh PNG và chèn lại']);
  assert.strictEqual(qs[1].stem, '<p>Ảnh kiểu cũ <img src="images/img_001.png" alt="" style="max-width:100%;height:auto" width="100"></p>');
  khongLoi(qs[1]);
  assert.ok(coLoi(qs[2], /trường EQ/, 'error'), JSON.stringify(qs[2].issues));
  assert.strictEqual(qs[3].stem, '<p>Bảng có ô gộp</p><table style="border-collapse:collapse"><tbody>' +
    '<tr><td style="border:1px solid #999;padding:4px 8px" colspan="2">Tiêu đề</td><td style="border:1px solid #999;padding:4px 8px" rowspan="2">Gộp dọc</td></tr>' +
    '<tr><td style="border:1px solid #999;padding:4px 8px">x</td><td style="border:1px solid #999;padding:4px 8px">y</td></tr></tbody></table>');
});

/* ======================= 6. lỗi vặt của Word ======================= */

async function mauLoiVat() {
  const body = [
    P('NGÂN HÀNG: Lỗi vặt Word'),
    P(R('Câu1:'), R(' Th'), R('ủ '), '<w:proofErr w:type="spellStart"/>', R('đô'), '<w:proofErr w:type="spellEnd"/>',
      '<w:bookmarkStart w:id="0" w:name="_GoBack"/>', R(' nước'), '<w:bookmarkEnd w:id="0"/>', R(' Pháp')),
    P('<w:hyperlink r:id="rIdLink" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>A.Paris</w:t></w:r></w:hyperlink>'),
    P('<w:smartTag w:uri="urn:x" w:element="place"><w:r><w:t>B.</w:t></w:r><w:r><w:t xml:space="preserve"> Lyon</w:t></w:r></w:smartTag>'),
    P('<w:sdt><w:sdtPr><w:alias w:val="x"/></w:sdtPr><w:sdtContent><w:r><w:t>C. Nice</w:t></w:r></w:sdtContent></w:sdt>'),
    P(R('D. Mar'), R(SHY + 'seil' + ZWSP + 'le')),
    P(R('Đáp'), R(NBSP + 'án:'), R(' A')),
    P('CÂU 2. Hai cộng hai'),
    P('A. 3'),
    P('<w:ins w:id="1" w:author="x"><w:r><w:t>B. 4</w:t></w:r></w:ins>', '<w:del w:id="2" w:author="x"><w:r><w:delText>xóa</w:delText></w:r></w:del>'),
    P(R('C. 5'), R(' chữ ẩn', { vanish: true })),
    P('D. 6'),
    P('Đáp án: B'),
    P('Câu 3 . Số thứ tự: ', FLD(' SEQ Hinh \\* ARABIC ', '7')),
    P('A. ', '<w:r><w:sym w:font="Symbol" w:char="F061"/></w:r>'),
    P('B. ', R('b', { font: 'Symbol' })),
    P('Đáp án: A'),
    P('Câu 4. Cho thông tin:'),
    P('Cầu 1 có chiều dài 100 m.'),
    P('A. đúng'), P('B. sai'), P('ĐA: A'),
    P('Question 5. What is 2 + 2?'), P('A. 3'), P('B. 4'), P('Answer: B'),
    P('Câu 6 – Câu có gạch ngang'), P('A. x'), P('B. y'), P('Đáp án: A'),
    P(R('Câu 7. Nội dung có'), BR, R('xuống dòng'), BR, R('A. một'), BR, R('B. hai')),
    P('Đáp án: B')
  ].join('');
  return docx.parseDocx(await taoDocx('loi-vat.docx', body), { fileName: 'loi-vat.docx' });
}

test('lỗi vặt Word: proofErr, bookmark, hyperlink, smartTag, sdt, soft hyphen, NBSP, "Câu1:", "A.Paris"', async () => {
  const kq = await mauLoiVat();
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5', '6', '7'], moTa(kq));
  assert.strictEqual(qs[0].stem, '<p>Thủ đô nước Pháp</p>');
  assert.deepStrictEqual(qs[0].choices.map((c) => [c.id, c.html, c.correct]), [['A', 'Paris', true], ['B', 'Lyon', false], ['C', 'Nice', false], ['D', 'Marseille', false]]);
  qs.forEach(khongLoi);
});

test('lỗi vặt Word: sửa đổi theo dõi (ins/del), chữ ẩn, trường SEQ, w:sym/phông Symbol, "Cầu" ≠ "Câu", Question, gạch ngang, xuống dòng', async () => {
  const qs = (await mauLoiVat()).banks[0].questions;
  assert.deepStrictEqual(qs[1].choices.map((c) => c.html), ['3', '4', '5', '6']);
  assert.deepStrictEqual(dung(qs[1]), ['B']);
  assert.strictEqual(qs[2].stem, '<p>Số thứ tự: 7</p>');
  assert.deepStrictEqual(qs[2].choices.map((c) => c.html), ['α', 'β']);
  assert.strictEqual(qs[3].stem, '<p>Cho thông tin:</p><p>Cầu 1 có chiều dài 100 m.</p>');
  assert.deepStrictEqual(dung(qs[3]), ['A']);
  assert.strictEqual(qs[4].stem, '<p>What is 2 + 2?</p>');
  assert.deepStrictEqual(dung(qs[4]), ['B']);
  assert.strictEqual(qs[5].stem, '<p>Câu có gạch ngang</p>');
  assert.strictEqual(qs[6].stem, '<p>Nội dung có<br>xuống dòng</p>');
  assert.deepStrictEqual(qs[6].choices.map((c) => [c.id, c.html, c.correct]), [['A', 'một', false], ['B', 'hai', true]]);
});

/* ======================= 6b. tiêu đề mục không có chữ PHẦN, "Chọn B", "Đáp án đúng là A" ======================= */

async function mauTieuDeMuc() {
  const body = [
    P('NGÂN HÀNG: Tiêu đề mục'),
    P('I. TRẮC NGHIỆM (7 điểm)'),
    P('Câu 1 (NB). Hỏi một'), P('A. a'), P('B. b'), P('C. c'), P('D. d'), P('Chọn B.'),
    P('Câu 2. Hỏi hai'), P('A. a'), P('B. b'), P('Đáp án đúng là A'),
    P('Câu 3. Hỏi ba'), P('A. a'), P('B. b'),
    P('Read the passage below and answer the questions that follow. The passage is about the history of the city and its people over many centuries.'),
    P('Đáp án: A'),
    P('B. TỰ LUẬN (3 điểm)'),
    P('Câu 1. Viết đoạn văn.'),
    P('PHẦN III. TRẢ LỜI NGẮN'),
    P('Câu 1. Chưa ghi đáp án'),
    '<w:sdt><w:sdtPr/><w:sdtContent>' + P('Câu 2. Câu nằm trong content control cấp đoạn') + P('Đáp án: 5') + '</w:sdtContent></w:sdt>'
  ].join('');
  return docx.parseDocx(await taoDocx('tieu-de-muc.docx', body), { fileName: 'tieu-de-muc.docx' });
}

test('tiêu đề mục "I. TRẮC NGHIỆM"/"B. TỰ LUẬN", (NB) trong ngoặc tròn, dòng "Chọn B.", "Đáp án đúng là A", phương án nuốt đoạn văn', async () => {
  const kq = await mauTieuDeMuc();
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.type), ['mc', 'mc', 'mc', 'essay', 'short', 'short'], moTa(kq));
  assert.strictEqual(qs[0].meta.part, 'I. TRẮC NGHIỆM (7 điểm)');
  assert.strictEqual(qs[0].meta.level, 'NB');
  assert.strictEqual(qs[0].stem, '<p>Hỏi một</p>');
  assert.deepStrictEqual(dung(qs[0]), ['B']);
  assert.deepStrictEqual(qs[0].choices.map((c) => c.html), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(dung(qs[1]), ['A']);
  assert.deepStrictEqual(qs[1].choices.map((c) => c.html), ['a', 'b']);
  assert.deepStrictEqual(dung(qs[2]), ['A']);
  assert.ok(coLoi(qs[2], /phương án B kéo dài thêm nhiều dòng/, 'warn'), JSON.stringify(qs[2].issues));
  assert.strictEqual(qs[3].meta.part, 'B. TỰ LUẬN (3 điểm)');
  assert.strictEqual(qs[3].stem, '<p>Viết đoạn văn.</p>');
  assert.deepStrictEqual(qs[3].issues, []);
  // phần "trả lời ngắn" thiếu đáp án → vẫn là short, báo lỗi
  assert.ok(coLoi(qs[4], /chưa có đáp án/, 'error'), JSON.stringify(qs[4].issues));
  assert.deepStrictEqual(qs[5].answers, ['5']);
});

test('ý a) b) c) trong nội dung câu trắc nghiệm; [ĐS] ghi nhãn A–D; phương án chữ thường a. b. c. + "Đáp án: b"', async () => {
  const body = [
    P('NGÂN HÀNG: Nhãn lẫn lộn'),
    P('Câu 1. Cho các mệnh đề:'), P('a) 2 là số nguyên tố.'), P('b) 4 là số nguyên tố.'), P('c) 9 là số chính phương.'),
    P('Số mệnh đề đúng là'), P('A. 0'), P('B. 1'), P(R('C', { u: true }), R('. 2')), P('D. 3'),
    P('Câu 2 [ĐS]. Nhãn viết hoa'), P(R('A', { color: 'FF0000' }), R('. ý một')), P('B. ý hai'), P(R('C', { color: 'FF0000' }), R('. ý ba')),
    P('Câu 3. Choose the odd one out.'), P('a. cat'), P('b. dog'), P('c. table'), P('HD giải: table không phải con vật'), P('Đáp án: c')
  ].join('');
  const kq = await docx.parseDocx(await taoDocx('nhan-lan-lon.docx', body), { fileName: 'nhan-lan-lon.docx' });
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.type), ['mc', 'tf', 'mc'], moTa(kq));
  assert.strictEqual(qs[0].stem, '<p>Cho các mệnh đề:</p><p>a) 2 là số nguyên tố.</p><p>b) 4 là số nguyên tố.</p><p>c) 9 là số chính phương.</p><p>Số mệnh đề đúng là</p>');
  assert.deepStrictEqual(dung(qs[0]), ['C']);
  khongLoi(qs[0]);
  assert.deepStrictEqual(qs[1].statements, [{ key: 'a', html: 'ý một', value: true }, { key: 'b', html: 'ý hai', value: false }, { key: 'c', html: 'ý ba', value: true }]);
  assert.deepStrictEqual(qs[2].choices.map((c) => [c.id, c.html, c.correct]), [['A', 'cat', false], ['B', 'dog', false], ['C', 'table', true]]);
  assert.strictEqual(qs[2].feedback, '<p>table không phải con vật</p>');
  qs.forEach(khongLoi);
});

test('NGÂN HÀNG trùng tên xuất hiện lại → gộp vào ngân hàng đã có (không tạo hai ngân hàng trùng ident)', async () => {
  const body = [
    P('NGÂN HÀNG: Lý 10'), P('Câu 1. a?'), P('Đáp án: 1'),
    P('NGÂN HÀNG: Hoá 10'), P('Câu 1. b?'), P('Đáp án: 2'),
    P('NGÂN HÀNG: Lý 10'), P('Câu 2. c?'), P('Đáp án: 3')
  ].join('');
  const kq = await docx.parseDocx(await taoDocx('trung-ten.docx', body), { fileName: 'trung-ten.docx' });
  assert.deepStrictEqual(kq.banks.map((b) => [b.title, b.questions.map((q) => q.id + ':' + q.answers[0])]), [['Lý 10', ['q01:1', 'q02:3']], ['Hoá 10', ['q01:2']]]);
  assert.ok(kq.banks[0].warnings.some((w) => /xuất hiện lần nữa/.test(w.msg)));
});

/* ======================= 7. đầu vào hỏng, không có NGÂN HÀNG, hàm phụ ======================= */

test('không có dòng NGÂN HÀNG → tên ngân hàng = tên file; không có câu nào → lỗi', async () => {
  const kq = await docx.parseDocx(await taoDocx('khong-ngan-hang.docx', P('Câu 1. Hỏi?') + P('Đáp án: 42')), { fileName: 'C:\\De\\De_kiem_tra 15p.docx' });
  assert.strictEqual(kq.banks.length, 1);
  assert.strictEqual(kq.banks[0].title, 'De_kiem_tra 15p');
  assert.deepStrictEqual(kq.banks[0].questions[0].answers, ['42']);
  assert.deepStrictEqual(kq.issues, []);
  const rong = await docx.parseDocx(await taoDocx('rong.docx', P('Chỉ có chữ, không có câu hỏi.')), { fileName: 'rong.docx' });
  assert.ok(rong.issues.some((i) => i.level === 'error' && /Không tìm thấy câu hỏi nào/.test(i.msg)));
});

test('đầu vào hỏng: .doc cũ, file rỗng, không phải zip, zip không có document.xml', async () => {
  const doc = new Uint8Array(512); doc.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
  let kq = await docx.parseDocx(doc, { fileName: 'cu.doc' });
  assert.strictEqual(kq.banks.length, 0);
  assert.ok(/Word cũ \(\.doc\)/.test(kq.issues[0].msg));
  kq = await docx.parseDocx(new Uint8Array(0), { fileName: 'x.docx' });
  assert.ok(/rỗng/.test(kq.issues[0].msg));
  kq = await docx.parseDocx(core.utf8Encode('xin chào'), { fileName: 'x.docx' });
  assert.strictEqual(kq.issues[0].level, 'error');
  const z = await zip.writeZip([{ path: 'a.txt', data: 'x' }]);
  kq = await docx.parseDocx(z, { fileName: 'x.docx' });
  assert.ok(/thiếu word\/document\.xml/.test(kq.issues[0].msg));
});

test('hàm phụ: đọc chữ cái đáp án, Đúng/Sai, số, cặp bảng đáp án', () => {
  assert.deepStrictEqual(docx._tachChuCai('B'), ['B']);
  assert.deepStrictEqual(docx._tachChuCai('A, C'), ['A', 'C']);
  assert.deepStrictEqual(docx._tachChuCai('AC'), ['A', 'C']);
  assert.deepStrictEqual(docx._tachChuCai('A và D'), ['A', 'D']);
  assert.deepStrictEqual(docx._tachChuCai('Chọn B.'), ['B']);
  assert.deepStrictEqual(docx._tachChuCai('B. Hà Nội'), ['B']);
  assert.strictEqual(docx._tachChuCai('Hà Nội'), null);
  const k = ['a', 'b', 'c', 'd'];
  assert.deepStrictEqual(docx._docDungSai('ĐSĐS', k).map, { a: true, b: false, c: true, d: false });
  assert.deepStrictEqual(docx._docDungSai('a-Đ, b-S, c-Đ, d-S', k).map, { a: true, b: false, c: true, d: false });
  assert.deepStrictEqual(docx._docDungSai('T F F T', k).map, { a: true, b: false, c: false, d: true });
  assert.deepStrictEqual(docx._docDungSai('D-S-D-S', k).map, { a: true, b: false, c: true, d: false }, 'D = Đúng khi gõ thiếu dấu');
  assert.deepStrictEqual(docx._docDungSai('a) Đ b) S', k).thieu, ['c', 'd']);
  assert.strictEqual(docx._docDungSai('xyz', k), null);
  assert.deepStrictEqual(docx._docDapAnSo('12,5'), { exact: 12.5, margin: 0 });
  assert.deepStrictEqual(docx._docDapAnSo('\u22122,5 ± 0,1'), { exact: -2.5, margin: 0.1 });
  assert.deepStrictEqual(docx._docDapAnSo('2 .. 1,5'), { min: 1.5, max: 2 });
  assert.deepStrictEqual(docx._docDapAnSo('1.234,5'), { exact: 1234.5, margin: 0 });
  assert.strictEqual(docx._docDapAnSo('x'), null);
  assert.deepStrictEqual(docx._tachCapKey('1.A 2.B 3-C 4: D'), [{ no: '1', v: 'A' }, { no: '2', v: 'B' }, { no: '3', v: 'C' }, { no: '4', v: 'D' }]);
  assert.deepStrictEqual(docx._tachCapKey('Câu 1: 2,5; Câu 2: -3'), [{ no: '1', v: '2,5' }, { no: '2', v: '-3' }]);
  assert.deepStrictEqual(docx._tachCapKey('1. 2.5 2. ĐSĐS'), [{ no: '1', v: '2.5' }, { no: '2', v: 'ĐSĐS' }]);
  assert.deepStrictEqual(docx._tachCapKey('1A 2B'), [{ no: '1', v: 'A' }, { no: '2', v: 'B' }]);
  assert.strictEqual(docx._nhanDangAnh(PNG, 'a.png'), 'png');
  assert.strictEqual(docx._nhanDangAnh(EMF, 'a.bin'), 'emf');
  assert.strictEqual(docx._nhanDangAnh(WMF, 'a.bin'), 'wmf');
});

test('mô hình Bank/Question đúng DESIGN §1 cho mọi file mẫu; core.validateQuestion khớp issues', async () => {
  for (const kq of [await mauCoBan(), await mauDanhSo(), await mauLoaiCau(), await mauBangDapAn(), await mauAnhCongThuc({ latex: null }), await mauLoiVat()]) {
    for (const b of kq.banks) {
      assert.ok(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(b.ident), b.ident);
      Object.keys(b.images).forEach((n) => assert.ok(/^[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)$/.test(n), n));
      const ids = {};
      b.questions.forEach((q) => {
        assert.ok(/^[a-z0-9_]+$/.test(q.id) && !ids[q.id], q.id); ids[q.id] = 1;
        assert.strictEqual(typeof q.title, 'string');
        assert.ok(core.QUESTION_TYPES.includes(q.type), q.type);
        assert.ok(typeof q.points === 'number' && q.points > 0);
        assert.strictEqual(typeof q.stem, 'string');
        assert.strictEqual(typeof q.stimulus, 'string');
        assert.strictEqual(typeof q.feedback, 'string');
        assert.deepStrictEqual(Object.keys(q.meta).sort(), ['level', 'part', 'tags', 'topic']);
        // ảnh trong HTML đều có trong images
        (q.stem + q.stimulus + q.feedback + (q.choices || []).map((c) => c.html).join('')).replace(/src="images\/([^"]+)"/g, (m, n) => { assert.ok(b.images[n], n); return m; });
        // mọi lỗi của validateQuestion đều đã có trong issues
        core.validateQuestion(q).filter((i) => i.level === 'error').forEach((i) => {
          assert.ok(q.issues.some((j) => j.msg === i.msg) || /chưa xác định Đúng hay Sai/.test(i.msg), i.msg);
        });
        // HTML không mang màu/tô nền (đánh dấu đáp án)
        assert.ok(!/color|background|<mark/.test((q.choices || []).map((c) => c.html).join('')));
      });
    }
  }
});

test('nạp kiểu trình duyệt (self.NH.docx) — đủ phụ thuộc core/zip/omml', () => {
  const vm = require('vm');
  const ctx = { self: {}, TextEncoder, TextDecoder };
  for (const f of ['core', 'zip', 'omml', 'docx']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/' + f + '.js'), 'utf8'), ctx);
  assert.strictEqual(typeof ctx.self.NH.docx.parseDocx, 'function');
  // chạy thật trong môi trường không có require/zlib (giải nén bằng JS) — như trình duyệt cũ
  const U8 = vm.runInNewContext('Uint8Array', ctx);
  const goc = fs.readFileSync(path.join(THU_MUC_MAU, 'co-ban.docx'));
  return ctx.self.NH.docx.parseDocx(new U8(goc), { fileName: 'co-ban.docx' }).then((kq) => {
    assert.strictEqual(kq.banks.length, 2);
    assert.strictEqual(kq.banks[0].questions[0].choices[2].correct, true);
    assert.strictEqual(kq.banks[0].questions[0].stem, '<p>Thủ đô của Việt <strong>Nam</strong> là</p>');
  });
});

test('file Word thật trong Downloads (nếu có): không ném lỗi, nhận MathType/WMF là lỗi', async () => {
  const DL = 'C:/Users/Administrator/Downloads';
  const ten = ['26.12.HH.KS.0301.docx', '25.2.TA.ĐGNL1.01.docx', '26.10.IE.ĐG.7.Đ_ĐÁP_ÁN_BÔI_VÀNG.docx', 'file-mau-upload-cau-hoi.docx'];
  let n = 0;
  for (const t of ten) {
    const p = path.join(DL, t);
    if (!fs.existsSync(p)) continue;
    n++;
    const kq = await docx.parseDocx(new Uint8Array(fs.readFileSync(p)), { fileName: t });
    assert.ok(Array.isArray(kq.banks) && Array.isArray(kq.issues));
    if (t.startsWith('26.12.HH')) {
      const qs = kq.banks[0].questions;
      assert.ok(qs.length >= 25, 'đề Hoá có 28 câu, đọc được ' + qs.length);
      assert.ok(qs.some((q) => coLoi(q, /MathType \(Equation\.DSMT4\)/, 'error')));
      assert.ok(qs.some((q) => coLoi(q, /ChemWindow/, 'error')));
      assert.deepStrictEqual(qs.slice(0, 18).map((q) => q.choices ? q.choices.length : 0), new Array(18).fill(4));
      assert.ok(qs.slice(18, 22).every((q) => q.statements && q.statements.length === 4));
    }
  }
  console.log('       (đã thử ' + n + ' file Word thật)');
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 14).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (docx)');
  process.exitCode = hong ? 1 : 0;
})();
