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

/* ======================= 8. đề không theo mẫu: chế độ đánh số "1." (đề tiếng Anh, tiểu học) ======================= */

const U = (t) => R(t, { u: true });
async function mauSo() {
  const body = [
    TBL([['TRƯỜNG MẪU', 'BÀI KIỂM TRA THỬ']]),
    P('I. Phonetics'),
    P(R('1. Which word has a different sound? CHOOSE the correct answer.', { b: true })),
    P('There is one example.', TAB, '(…………/2 points)'),
    P('0. A. b', U('oo'), 'k', TAB, 'B. l', U('oo'), 'k', TAB, 'C. f', U('oo'), 'd', TAB, 'D. c', U('oo'), 'k'),
    P('1. A. play', U('ed'), TAB, 'B. watch', U('ed'), TAB, 'C. cook', U('ed'), TAB, 'D. jump', U('ed')),
    P('2. A. ', U('th'), 'ink', TAB, 'B. ', U('th'), 'is', TAB, 'C. ', U('th'), 'ree', TAB, 'D. ', U('th'), 'ank'),
    P('II. Vocabulary and grammar'),
    P('2. Read and choose the correct word from the box.', TAB, '(…/2 points)'),
    TBL([['river', 'forest', 'desert']]),
    TBL([['0. A hot, dry place with sand.', '……………'], ['3. A large area full of trees.', '……………'], ['4. Water that flows to the sea.', '……………']]),
    P('B. GRAMMAR'),
    P('3. CHOOSE the best answer. (…/1 point)'),
    P('5. She ……… to school every day.'),
    P('A. go', TAB, 'B. goes', TAB, 'C. going', TAB, 'D. gone'),
    P('4. Find the mistakes. (…/1 point)'),
    P('6. He ', U('don’t'), ' like ', U('apples'), ' ', U('because'), ' they ', U('are'), ' sour.', TAB, '……'),
    P('          A', TAB, TAB, 'B', TAB, 'C', TAB, 'D'),
    P('III. Reading'),
    P('5. Read the text. CHOOSE the correct answer. (…/2 points)'),
    P('Tom lives near the sea. Every morning he (7) ……… to the beach and (8) ……… for shells.'),
    P('7. A. walk', TAB, 'B. walks', TAB, 'C. walking', TAB, 'D. walked'),
    P('8. A. look', TAB, 'B. looks', TAB, 'C. looking', TAB, 'D. looked'),
    P('6. Read and WRITE the correct LETTERS.'),
    TBL([['A. on', 'C. under'], ['B. in', 'D. small'], ['9.', 'The book is ___ the bag.'], ['10.', 'My bag is very ___.']]),
    P('7. Read. CIRCLE the correct answer.'),
    TBL([[[P('My pet'), P('Her name (11) ____ Kitty.'), TBL([['0.', 'A. small', 'B. smalls'], ['11.', 'A. are', 'B. is']])]]]),
    P('8. Look and read. CIRCLE YES or NO.'),
    TBL([['12. Kitty is a cat.', 'A. Yes', 'B. No'], ['13.', '', 'Where is the cat? (under)'], ['', '', 'Answer: ______________']]),
    P('The end -')
  ].join('');
  return docx.parseDocx(await taoDocx('so-tieng-anh.docx', body), { fileName: 'so-tieng-anh.docx' });
}

test('đề đánh số "1." (không "Câu N"): lời dặn → đoạn dẫn, ví dụ 0 bỏ, phương án cùng dòng, tiêu đề La Mã/“B. GRAMMAR”, tìm lỗi sai, bảng câu hỏi, bảng lồng', async () => {
  const kq = await mauSo();
  assert.strictEqual(kq.banks.length, 1);
  const b = kq.banks[0], qs = b.questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'], moTa(kq));
  assert.deepStrictEqual(qs.map((q) => q.type), ['mc', 'mc', 'essay', 'essay', 'mc', 'mc', 'mc', 'mc', 'mc', 'mc', 'mc', 'mc', 'essay']);
  assert.ok(b.warnings.some((w) => /Bỏ qua 3 câu ví dụ/.test(w.msg)), JSON.stringify(b.warnings));
  assert.deepStrictEqual([...new Set(qs.map((q) => q.meta.part))], ['I. Phonetics', 'II. Vocabulary and grammar', 'B. GRAMMAR', 'III. Reading']);
  // lời dặn của bài là đoạn dẫn chung; gạch chân âm giữ trong phương án (không phải dấu đáp án)
  assert.ok(/Which word has a different sound/.test(qs[0].stimulus) && /There is one example/.test(qs[0].stimulus), qs[0].stimulus);
  assert.deepStrictEqual(qs[0].choices.map((c) => c.html), ['play<u>ed</u>', 'watch<u>ed</u>', 'cook<u>ed</u>', 'jump<u>ed</u>']);
  assert.deepStrictEqual(dung(qs[0]), []);
  assert.strictEqual(qs[0].stem, '');
  // bảng câu hỏi: dòng "3. … | ……" → câu viết (chưa có đáp án → tự luận), bảng từ là đoạn dẫn
  assert.strictEqual(qs[2].stem, '<p>A large area full of trees. ……………</p>');
  assert.ok(/<table/.test(qs[2].stimulus) && /forest/.test(qs[2].stimulus));
  assert.deepStrictEqual(qs[4].choices.map((c) => c.html), ['go', 'goes', 'going', 'gone']);
  // tìm lỗi sai: phương án = các đoạn gạch chân, nội dung giữ gạch chân
  assert.deepStrictEqual(qs[5].choices.map((c) => [c.id, c.html]), [['A', 'don’t'], ['B', 'apples'], ['C', 'because'], ['D', 'are']]);
  assert.ok(qs[5].stem.indexOf('<u>don’t</u>') >= 0, qs[5].stem);
  // đoạn văn điền từ: đoạn dẫn chứa đoạn văn, nội dung câu rỗng
  assert.ok(/Tom lives near the sea/.test(qs[6].stimulus) && /Tom lives/.test(qs[7].stimulus));
  // bảng từ A–D (nhãn không theo thứ tự) → phương án chung cho câu chỉ có chỗ trống
  assert.deepStrictEqual(qs[8].choices.map((c) => [c.id, c.html]), [['A', 'on'], ['B', 'in'], ['C', 'under'], ['D', 'small']]);
  assert.strictEqual(qs[8].stem, '<p>The book is ___ the bag.</p>');
  assert.deepStrictEqual(qs[9].choices.map((c) => c.id), ['A', 'B', 'C', 'D']);
  // bảng bọc chứa đoạn văn + bảng câu hỏi lồng
  assert.ok(/My pet/.test(qs[10].stimulus) && /Kitty/.test(qs[10].stimulus), qs[10].stimulus);
  assert.deepStrictEqual(qs[10].choices.map((c) => c.html), ['are', 'is']);
  assert.deepStrictEqual(qs[11].choices.map((c) => c.html), ['Yes', 'No']);
  assert.strictEqual(qs[11].stem, '<p>Kitty is a cat.</p>');
  // "Answer: ____" là chỗ học sinh viết, không phải đáp án
  assert.ok(/Answer: ______________/.test(qs[12].stem) && !qs[12].answers, qs[12].stem);
  qs.forEach((q) => assert.ok(!loi(q, 'error').some((i) => !/chưa xác định đáp án/.test(i.msg)), q.title + ': ' + JSON.stringify(q.issues)));
});

test('file đáp án "Item | Key" (mã năng lực kèm đáp án) → parseAnswerKey, parseDocx trả keyOnly; applyAnswerKey điền mc / chỗ trống → trả lời ngắn / YES', async () => {
  const body = [
    TBL([['TRƯỜNG MẪU', 'ĐÁP ÁN']]),
    P(''),
    TBL([['Item', 'Key', 'Item', 'Key'], ['1', 'A - 4.0.TA.1.3', '7', 'B'], ['2', 'B - 4.0.TA.1.1', '8', 'B - 4.0.TA.4.124'], ['3', 'Forest - 4.0.TA.2.36', '9', 'A'],
      ['4', 'River', '10', 'D'], ['5', 'B', '11', 'B'], ['6', 'A', '12', 'YES']]),
    P('Câu 13:'),
    P('Mỗi câu đúng: 1 điểm'),
    P('13. It is under the table.')
  ].join('');
  const u8 = await taoDocx('dap-an-item-key.docx', body);
  const key = await docx.parseAnswerKey(u8, { fileName: 'De_KEY.docx' });
  assert.strictEqual(key.count, 13);
  assert.deepStrictEqual(key.answers[''], { 1: 'A', 2: 'B', 3: 'Forest', 4: 'River', 5: 'B', 6: 'A', 7: 'B', 8: 'B', 9: 'A', 10: 'D', 11: 'B', 12: 'YES', 13: 'It is under the table.' });
  const chi = await docx.parseDocx(u8, { fileName: 'De_KEY.docx' });
  assert.strictEqual(chi.keyOnly, true);
  assert.deepStrictEqual(chi.banks, []);
  assert.ok(chi.issues.some((i) => i.level === 'info' && /file đáp án/.test(i.msg)) && !chi.issues.some((i) => i.level === 'error'));
  const kq = await mauSo();
  const r = docx.applyAnswerKey(kq.banks, key);
  assert.strictEqual(r.matched, 13);
  assert.strictEqual(r.filled, 13);
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.choices ? dung(q).join('') : q.type === 'short' ? q.answers[0] : q.type), ['A', 'B', 'Forest', 'River', 'B', 'A', 'B', 'B', 'A', 'D', 'B', 'A', 'essay']);
  assert.ok(/Đáp án: It is under the table\./.test(qs[12].feedback));
  qs.forEach((q) => assert.deepStrictEqual(loi(q, 'error').map((i) => i.msg), [], q.title));
  // parseDocx(…, {answerKey}) áp ngay khi đọc
  const kq2 = await docx.parseDocx(fs.readFileSync(path.join(THU_MUC_MAU, 'so-tieng-anh.docx')), { fileName: 'x.docx', answerKey: key });
  assert.ok(kq2.issues.some((i) => i.level === 'info' && /Đã khớp 13 câu với file đáp án: điền 13/.test(i.msg)), JSON.stringify(kq2.issues));
  kq2.banks[0].questions.forEach((q) => assert.deepStrictEqual(loi(q, 'error').map((i) => i.msg), [], q.title));
});

async function mauIelts(highlight) {
  const H = (t) => highlight ? R(t, { hl: 'yellow' }) : R('………');
  const body = [
    P(R('READING PASSAGE 1', { b: true })),
    P('You should spend about 10 minutes on Questions 1-9, which are based on Reading Passage 1 below.'),
    P('Rooftop Gardens'),
    P('A. City planners now encourage rooftop gardens because they cool buildings and reduce storm water flowing into drains.'),
    P('B. A typical green roof holds a thin layer of soil and supports hardy plants such as sedum.'),
    P('Questions 1-2'),
    P('Complete the notes below. Choose NO MORE THAN TWO WORDS from the passage for each answer.'),
    P('Benefits: cool buildings and reduce 1 ', H('storm water')),
    P('2 ', H('Sedum'), ' is a typical plant.'),
    P('Questions 3-4'),
    P('Do the following statements agree with the information given in Reading Passage 1?'),
    P('TRUE', TAB, 'if the statement agrees with the information'),
    P('FALSE', TAB, 'if the statement contradicts the information'),
    P('NOT GIVEN', TAB, 'if there is no information on this'),
    P('3', TAB, 'Green roofs make buildings warmer.  ', highlight ? R('[FALSE]', { hl: 'yellow' }) : R('')),
    P('4', TAB, 'The first green roof was built by a school.  ', highlight ? R('[NOT GIVEN]', { hl: 'yellow' }) : R('')),
    P('Questions 5-6'),
    P('Choose TWO letters, A–E.'),
    P('Which TWO advantages are mentioned?'),
    P('A.  lower noise'), P(highlight ? R('B.  cooler buildings', { hl: 'yellow' }) : R('B.  cooler buildings')), P('C.  cheaper insurance'),
    P(highlight ? R('D.', { hl: 'yellow' }) : R('D.'), R('  less storm water')), P('E.  more birds'),
    P('Questions 7-9'),
    P('Reading Passage 1 has two paragraphs, A–B. Which paragraph contains the following information?'),
    P('7', TAB, 'a mention of soil  ', highlight ? R('[B]', { hl: 'yellow' }) : R('')),
    P('8. ', TAB, 'Why do planners like green roofs?'),
    P(highlight ? R('A', { hl: 'yellow' }) : R('A'), TAB, 'they cool buildings'), P('B', TAB, 'they are cheap'),
    P('9. ', TAB, 'What holds the plants?'),
    P('A', TAB, 'trays'), P(highlight ? R('B', { hl: 'yellow' }) : R('B'), TAB, 'a thin layer of soil'),
    P('— THE END —')
  ].join('');
  return docx.parseDocx(await taoDocx(highlight ? 'ielts-boi-vang.docx' : 'ielts-chua-dap-an.docx', body), { fileName: 'ielts.docx' });
}

test('đề IELTS bôi vàng: nhóm "Questions 1-2" lồng trong đoạn văn, ô trống đánh số, [FALSE] → TRUE/FALSE/NOT GIVEN, chọn HAI chữ cái → một câu 2 điểm, chữ cái đoạn A–B', async () => {
  const kq = await mauIelts(true);
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5-6', '7', '8', '9'], moTa(kq));
  assert.deepStrictEqual(qs.map((q) => q.type), ['short', 'short', 'mc', 'mc', 'ma', 'mc', 'mc', 'mc']);
  assert.deepStrictEqual(qs[0].answers, ['storm water']);
  assert.strictEqual(qs[0].stem, '<p>Benefits: cool buildings and reduce <strong>(1) ______</strong></p>');
  assert.deepStrictEqual(qs[1].answers, ['Sedum']);
  // đoạn dẫn = đoạn văn (nhóm ngoài) + lời dặn của nhóm câu (nhóm trong); câu 2 thấy cả dòng của câu 1 (đã che đáp án)
  assert.ok(/Rooftop Gardens/.test(qs[0].stimulus) && /Complete the notes/.test(qs[0].stimulus), qs[0].stimulus);
  assert.ok(/\(1\) ______/.test(qs[1].stimulus) && !/storm water<\/p>/.test(qs[1].stimulus.split('Complete')[1]), qs[1].stimulus);
  assert.deepStrictEqual(qs[2].choices.map((c) => [c.id, c.html, c.correct]), [['A', 'TRUE', false], ['B', 'FALSE', true], ['C', 'NOT GIVEN', false]]);
  assert.strictEqual(qs[2].stem, '<p>Green roofs make buildings warmer.</p>');
  assert.deepStrictEqual(dung(qs[3]), ['C']);
  assert.deepStrictEqual(dung(qs[4]), ['B', 'D']);
  assert.strictEqual(qs[4].points, 2);
  assert.strictEqual(qs[4].title, 'Câu 5-6');
  assert.ok(/Which TWO advantages/.test(qs[4].stem) && !/lower noise/.test(qs[4].stem), qs[4].stem);
  assert.deepStrictEqual(qs[5].choices.map((c) => c.html), ['A', 'B']);
  assert.deepStrictEqual(dung(qs[5]), ['B']);
  assert.deepStrictEqual(dung(qs[6]), ['A']);
  assert.deepStrictEqual(dung(qs[7]), ['B']);
  assert.ok(/Questions 7-9/.test(qs[7].stimulus) && !/Questions 3-4/.test(qs[7].stimulus));
  qs.forEach(khongLoi);
});

test('đề IELTS chưa có đáp án + file đáp án riêng: ô "1 ………" → trả lời ngắn chờ đáp án; câu 3-4 dùng bộ TRUE/FALSE/NOT GIVEN; khớp "5-6" với đáp án 5 và 6', async () => {
  const kq = await mauIelts(false);
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5-6', '7', '8', '9'], moTa(kq));
  assert.ok(coLoi(qs[0], /chưa có đáp án/, 'error'));
  assert.deepStrictEqual(qs[2].choices.map((c) => c.html), ['TRUE', 'FALSE', 'NOT GIVEN']);
  const key = await docx.parseAnswerKey(await taoDocx('ielts-dap-an.docx', P('1. storm water') + P('2. sedum') + P('3. FALSE 4. NOT GIVEN') + P('5. B 6. D') + P('7. B') + P('8. A 9. B')), { fileName: 'ielts-key.docx' });
  assert.strictEqual(key.count, 9);
  const r = docx.applyAnswerKey(kq.banks, key);
  assert.deepStrictEqual([r.matched, r.filled, r.conflicts, r.unused.length], [8, 8, 0, 0]);
  assert.deepStrictEqual(qs[0].answers, ['storm water']);
  assert.deepStrictEqual(dung(qs[2]), ['B']);
  assert.deepStrictEqual(dung(qs[4]), ['B', 'D']);
  assert.strictEqual(qs[4].type, 'ma');
  assert.deepStrictEqual(dung(qs[5]), ['B']);
  qs.forEach((q) => assert.deepStrictEqual(loi(q, 'error').map((i) => i.msg), [], q.title));
});

test('mẫu upload câu hỏi "[OC-NB]" + ANSWER có trọng số: TF, OC, MC, FB [[1]] = 50, SDL, ES, câu chùm EM gồm câu con', async () => {
  const body = [
    P('Câu 1 [TF-NB]: Is the sky blue?'), P('A) Yes'), P('B) No'), P('ANSWER: A,B=-10'),
    P('Câu 2 [OC-H] : Thủ đô của Nhật Bản là'), P('A) Tokyo'), P('B)  Osaka'), P('C) Kyoto'), P('ANSWER: A, B=-10 ,C=-10'),
    P('Câu 3 [FB-VD] :'), P('Mặt trời mọc ở hướng [[1]],'), P('lặn ở hướng [[2]].'), P('[[1]] = 50'), P('A) đông'), P('B) tây'), P('ANSWER: A=100,B=-10'), P('[[2]]=50'), P('A) tây'),
    P('Câu 4 [SDL-VD]: Phương trình x', R('2', { sup: true }), ' − 4 = 0 có [[1]] nghiệm thực.'), P('[[1]]'), P('A) hai'), P('B) một'), P('C) không có'), P('ANSWER: A,B=-20'),
    P('Câu 5 [MC-VDC] : Chọn các số nguyên tố.'), P('A) 2'), P('B) 3'), P('C) 4'), P('D) 9'), P('ANSWER: A=50, B=50, C=-50,D=-50'),
    P('Câu 6 [ES-VDC]: Giải thích hai câu sau:'), P('a) Câu một.'), P('b) Câu hai.'), P('ANSWER: '), P('a, - Ý một.'), P('b, - Ý hai.'),
    P('Câu 7 [EM-NB]: Đọc thông tin sau và trả lời:'), P('Lan có 3 quả táo và 2 quả cam.'),
    P('[OC]: Lan có bao nhiêu quả táo?'), P('A) 2'), P('B) 3'), P('ANSWER: B'),
    P(' [FB]: Lan có tất cả [[3]] quả.'), P('[[3]] = 100'), P('A) 5'),
    P('[ES] : Em thích quả nào? Vì sao?'), P('ANSWER: '), P('Học sinh tự trả lời.'),
    P('Câu 8 [OC-TH]: Câu sau câu chùm'), P('A) x'), P('B) y'), P('ANSWER: B')
  ].join('');
  const kq = await docx.parseDocx(await taoDocx('upload-cau-hoi.docx', body), { fileName: 'upload.docx' });
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5', '6', '7.1', '7.2', '7.3', '8'], moTa(kq));
  assert.deepStrictEqual(qs.map((q) => q.type), ['mc', 'mc', 'blanks', 'dropdowns', 'ma', 'essay', 'mc', 'blanks', 'essay', 'mc']);
  assert.deepStrictEqual(qs.map((q) => q.meta.level), ['NB', 'TH', 'VD', 'VD', 'VDC', 'VDC', 'NB', 'NB', 'NB', 'TH']);
  assert.deepStrictEqual(dung(qs[0]), ['A']);
  assert.deepStrictEqual(dung(qs[1]), ['A']);
  assert.strictEqual(qs[1].choices[1].html, 'Osaka');
  assert.strictEqual(qs[2].stem, '<p>Mặt trời mọc ở hướng [b1],</p><p>lặn ở hướng [b2].</p>');
  assert.deepStrictEqual(qs[2].blanks, [{ id: 'b1', accepts: ['đông'] }, { id: 'b2', accepts: ['tây'] }]);
  assert.strictEqual(qs[3].stem, '<p>Phương trình x<sup>2</sup> − 4 = 0 có [b1] nghiệm thực.</p>');
  assert.deepStrictEqual(qs[3].dropdowns, [{ id: 'b1', options: ['hai', 'một', 'không có'], correct: 0 }]);
  assert.deepStrictEqual(dung(qs[4]), ['A', 'B']);
  assert.strictEqual(qs[5].stem, '<p>Giải thích hai câu sau:</p><p>a) Câu một.</p><p>b) Câu hai.</p>');
  assert.strictEqual(qs[5].feedback, '<p>a, - Ý một.</p><p>b, - Ý hai.</p>');
  // câu chùm: nội dung chung thành đoạn dẫn của các câu con, tên "Câu 7.1"…
  assert.strictEqual(qs[6].stimulus, '<p>Đọc thông tin sau và trả lời:</p><p>Lan có 3 quả táo và 2 quả cam.</p>');
  assert.strictEqual(qs[6].title, 'Câu 7.1 [NB]');
  assert.deepStrictEqual(dung(qs[6]), ['B']);
  assert.deepStrictEqual(qs[7].blanks, [{ id: 'b3', accepts: ['5'] }]);
  assert.strictEqual(qs[8].feedback, '<p>Học sinh tự trả lời.</p>');
  assert.strictEqual(qs[9].stimulus, '');
  qs.forEach(khongLoi);
});

test('đánh số lại theo phần ("Part 2", hoặc "1." ngay sau câu đã đủ phương án); danh sách "1. 2." trong nội dung câu không thành câu mới; đề ngắn chưa có đáp án không bị nhầm là file đáp án', async () => {
  const body = [
    P('Part 1'),
    P('1. Question one?'), P('A. x', TAB, 'B. y'),
    P('2. Read the statements:'), P('1. first statement'), P('2. second statement'), P('Which is true?'), P('A. 1', TAB, 'B. 2'),
    P('Part 2: Grammar'),
    P('1. Question three?'), P('A. x', TAB, 'B. y'),
    P('1. Question four?'), P('A. p', TAB, 'B. q')
  ].join('');
  const kq = await docx.parseDocx(await taoDocx('so-danh-lai.docx', body), { fileName: 'so-danh-lai.docx' });
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => [q.title, q.meta.part]), [['Câu 1 (Phần 1)', 'Part 1'], ['Câu 2 (Phần 1)', 'Part 1'], ['Câu 1 (Phần 2)', 'Part 2: Grammar'], ['Câu 1 (Phần 2)', 'Part 2: Grammar']], moTa(kq));
  assert.strictEqual(qs[1].stem, '<p>Read the statements:</p><p>1. first statement</p><p>2. second statement</p><p>Which is true?</p>');
  assert.deepStrictEqual(qs.map((q) => q.choices.length), [2, 2, 2, 2]);
  const ngan = await docx.parseDocx(await taoDocx('de-ngan.docx', P('Câu 1. Tính 2 + 2.') + P('Câu 2. Tính 3 + 3.') + P('Câu 3. Tính 4 + 4.') + P('Câu 4. Tính 5 + 5.')), { fileName: 'de-ngan.docx' });
  assert.ok(!ngan.keyOnly, 'đề ngắn bị nhầm là file đáp án');
  assert.deepStrictEqual(ngan.banks[0].questions.map((q) => q.type), ['essay', 'essay', 'essay', 'essay']);
  // tài liệu hướng dẫn đánh số bước, tên file có "DA" (dự án) — không phải file đáp án
  const hd = await docx.parseDocx(await taoDocx('tai-lieu-buoc.docx', P('1. Mở trang quản trị') + P('2. Chọn mục Người dùng') + P('3. Bấm nút Thêm mới') + P('4. Điền thông tin') + P('5. Lưu lại')), { fileName: 'Tai_lieu_DA_gui_IT.docx' });
  assert.ok(!hd.keyOnly);
  assert.ok(hd.banks[0].warnings.some((w) => /không có phương án hay đáp án/.test(w.msg)), JSON.stringify(hd.banks[0].warnings));
});

/* ---- đề THPT + hướng dẫn chấm riêng ---- */
function deThpt(dapAnCau2) {
  return [
    P('PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu 2.'),
    P('Câu 1. Hỏi một'), P('A. a', TAB, 'B. b', TAB, 'C. c', TAB, 'D. d'),
    P('Câu 2. Hỏi hai'), P('A. a'), P('B. b'), P('C. c'), P('D. d'), dapAnCau2 ? P('Đáp án: ' + dapAnCau2) : '',
    P('PHẦN II. Câu trắc nghiệm đúng sai.'),
    P('Câu 1. Cho dãy số.'), P('a) ý a'), P('b) ý b'), P('c) ý c'), P('d) ý d'),
    P('PHẦN III. Câu trắc nghiệm yêu cầu trả lời ngắn.'),
    P('Câu 1. Tính tổng.'), P('Câu 2. Tính tích.'),
    P('--- HẾT ---')
  ].join('');
}
const HDC = [
  TBL([['HƯỚNG DẪN CHẤM', 'ĐỀ THỬ']]),
  P('Phần I. Câu trắc nghiệm nhiều phương án lựa chọn.'),
  TBL([['Câu', '1', '2'], ['Đ/A', 'D', 'A']]),
  P('Phần II. Câu trắc nghiệm đúng – sai.'),
  TBL([[{ span: 2, c: 'Câu 1' }], ['a)', 'Đ'], ['b)', 'S'], ['c)', 'S'], ['d)', 'Đ']]),
  P('Phần III. Câu trắc nghiệm yêu cầu trả lời ngắn.'),
  P('Câu 1.'), TBL([['1', '2', ',', '5']]),
  P('Câu 2.'), TBL([['3', '2', '', '']]),
  P('--- HẾT ---')
].join('');

test('hướng dẫn chấm THPT 2025 riêng: bảng Phần I, bảng Đúng/Sai gộp ô, "Câu 1." + ô số Phần III → khoá theo phần; áp vào đề, giữ đáp án trong đề khi khác (cảnh báo)', async () => {
  const u8 = await taoDocx('hdc-thpt.docx', HDC);
  const chi = await docx.parseDocx(u8, { fileName: '26.12.HH.KS.HDC.0301.docx' });
  assert.strictEqual(chi.keyOnly, true);
  assert.deepStrictEqual(chi.key.answers, { 1: { 1: 'D', 2: 'A' }, 2: { 1: 'a) Đ; b) S; c) S; d) Đ' }, 3: { 1: '12,5', 2: '32' } });
  const kq = await docx.parseDocx(await taoDocx('de-thpt.docx', deThpt('B')), { fileName: '26.12.HH.KS.0301.docx' });
  const qs = kq.banks[0].questions;
  assert.ok(coLoi(qs[0], /chưa xác định đáp án/, 'error') && coLoi(qs[2], /Đúng\/Sai/, 'error') && coLoi(qs[3], /chưa có đáp án/, 'error'));
  const r = docx.applyAnswerKey(kq.banks, chi.key);
  assert.deepStrictEqual([r.matched, r.filled, r.conflicts], [5, 4, 1]);
  assert.deepStrictEqual(dung(qs[0]), ['D']);
  assert.deepStrictEqual(dung(qs[1]), ['B']); // trong đề ghi B → giữ, cảnh báo
  assert.ok(coLoi(qs[1], /file đáp án ghi A nhưng trong đề đánh dấu B — giữ B/, 'warn'), JSON.stringify(qs[1].issues));
  assert.deepStrictEqual(qs[2].statements.map((s) => s.value), [true, false, false, true]);
  assert.deepStrictEqual(qs[3].answers, ['12,5', '12.5']);
  assert.deepStrictEqual(qs[4].answers, ['32']);
  [0, 2, 3, 4].forEach((i) => assert.deepStrictEqual(loi(qs[i], 'error').map((x) => x.msg), [], qs[i].title));
  // tên file để ghép đề ↔ đáp án
  assert.strictEqual(docx.isAnswerKeyName('26.12.HH.KS.HDC.0301.docx'), true);
  assert.strictEqual(docx.isAnswerKeyName('26.12.HH.KS.0301.docx'), false);
  assert.strictEqual(docx.answerKeyBaseName('26.12.HH.KS.HDC.0301.docx'), docx.answerKeyBaseName('26.12.HH.KS.0301.docx'));
  assert.strictEqual(docx.answerKeyBaseName('K4_ĐỀ THI THÁNG 1_KEY.docx'), docx.answerKeyBaseName('K4_ĐỀ THI THÁNG 1.docx'));
  assert.strictEqual(docx.answerKeyBaseName('De 15p - Dap an.docx'), docx.answerKeyBaseName('De 15p.docx'));
});

test('file đáp án không ghi phần nhưng số câu lặp lại → tách phần theo lần lặp; "Câu 1: A" từng dòng; file không có đáp án nào → lỗi', async () => {
  const key = await docx.parseAnswerKey(await taoDocx('dap-an-lap.docx', P('Câu 1: D') + P('Câu 2: A') + P('Câu 1: ĐSSĐ') + P('Câu 1: 12,5') + P('Câu 2: 32')), { fileName: 'da.docx' });
  assert.deepStrictEqual(key.answers, { 1: { 1: 'D', 2: 'A' }, 2: { 1: 'ĐSSĐ' }, 3: { 1: '12,5', 2: '32' } });
  const kq = await docx.parseDocx(await taoDocx('de-thpt-chua-dap-an.docx', deThpt('')), { fileName: 'de.docx' });
  const r = docx.applyAnswerKey(kq.banks, key);
  assert.deepStrictEqual([r.matched, r.filled], [5, 5]);
  assert.deepStrictEqual(kq.banks[0].questions[2].statements.map((s) => s.value), [true, false, false, true]);
  const rong = await docx.parseAnswerKey(await taoDocx('dap-an-rong.docx', P('Không có gì.')), { fileName: 'rong.docx' });
  assert.strictEqual(rong.count, 0);
  assert.ok(rong.issues.some((i) => i.level === 'error'));
});

test('chế độ "Câu N": dòng "… questions from 3 to 4" mở đoạn dẫn chung (không dính vào phương án câu trước); tiêu đề viết hoa sau phương án tách khỏi phương án', async () => {
  const body = [
    P('Câu 1. Hỏi một'), P('A. a'), P('B. b'), P('Đáp án: A'),
    P('Câu 2. Hỏi hai'), P('A. a'), P('B. b'), P('Đáp án: B'),
    P('Read the following passage and mark the letter A, B, C, or D to indicate the correct answer to each of the questions from 3 to 4.'),
    P('Tom lives near the sea. He walks to the beach every day.'),
    P('Câu 3. Where does Tom live?'), P('A. near the sea'), P('B. in a city'), P('Đáp án: A'),
    P('Câu 4. How does he go to the beach?'), P('A. by bus'), P('B. on foot'), P('Đáp án: B'),
    P('WRITING SECTION'),
    P('Câu 5. Hỏi năm'), P('A. a'), P('B. b'), P('Đáp án: A')
  ].join('');
  const kq = await docx.parseDocx(await taoDocx('cau-pham-vi.docx', body), { fileName: 'cau-pham-vi.docx' });
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5']);
  assert.deepStrictEqual(qs[1].choices.map((c) => c.html), ['a', 'b']);
  assert.strictEqual(qs[1].stimulus, '');
  assert.ok(/Tom lives near the sea/.test(qs[2].stimulus) && /from 3 to 4/.test(qs[3].stimulus));
  assert.strictEqual(qs[4].stimulus, '');
  assert.strictEqual(qs[4].meta.part, 'WRITING SECTION');
  assert.deepStrictEqual(qs[3].choices.map((c) => c.html), ['by bus', 'on foot']);
  qs.forEach(khongLoi);
});

// File đề thật của trường trong Downloads (chỉ đọc, không chép vào repo) — bỏ qua khi máy không có.
// Số liệu mong đợi = những gì người đọc thấy khi mở bằng Word (đối chiếu bằng Word COM khi viết test).
const DL = 'C:/Users/Administrator/Downloads';
function timThat(ten) { // tên file trong Downloads có thể lưu dạng Unicode tổ hợp (NFD)
  try { const f = fs.readdirSync(DL).find((x) => x.normalize('NFC') === ten.normalize('NFC')); return f ? path.join(DL, f) : null; } catch (e) { return null; }
}
const THAT = [
  // [đề, file đáp án, số câu, loại câu sau khi áp đáp án, số câu còn lỗi (MathType/OLE), kiểm thêm]
  ['26.12.HH.KS.0301.docx', '26.12.HH.KS.HDC.0301.docx', 28, { mc: 18, tf: 4, short: 6 }, 3, (qs) => {
    assert.ok(qs.some((q) => coLoi(q, /MathType \(Equation\.DSMT4\)/, 'error')));
    assert.ok(qs.some((q) => coLoi(q, /ChemWindow.*chụp\/lưu đối tượng thành ảnh PNG/, 'error')));
    assert.deepStrictEqual(qs.slice(0, 18).map((q) => q.choices ? q.choices.length : 0), new Array(18).fill(4));
    assert.ok(qs.slice(18, 22).every((q) => q.statements && q.statements.length === 4 && q.statements.every((s) => typeof s.value === 'boolean')));
    assert.ok(qs.slice(22).every((q) => q.type === 'short' && q.answers.length));
  }],
  ['25.2.TA.ĐGNL1.01.docx', '25.2.TA.ĐGNL1.01.HDC.docx', 40, { mc: 30, short: 5, essay: 5 }, 0, (qs, b) => {
    assert.ok(b.warnings.some((w) => /Bỏ qua 7 câu ví dụ/.test(w.msg)));
    assert.ok(qs.slice(10, 15).every((q) => q.choices.length === 7)); // bảng từ A–G dùng chung
    assert.ok(qs.slice(25, 30).every((q) => /My new pet/.test(q.stimulus))); // đoạn văn trong bảng lồng
  }],
  ['26.10.IE.ĐG.7.Đ_ĐÁP_ÁN_BÔI_VÀNG.docx', null, 39, { short: 19, mc: 19, ma: 1 }, 0, (qs) => {
    assert.deepStrictEqual(qs.map((q) => q.no).slice(19, 22), ['20', '21-22', '23']);
    assert.ok(qs.every((q) => q.stimulus.length > 3000)); // đoạn văn đọc kèm mọi câu
    assert.deepStrictEqual(qs[6].choices.map((c) => c.html), ['TRUE', 'FALSE', 'NOT GIVEN']);
  }],
  ['K4_TN_ĐỀ THI THÁNG 1_2025.2026.docx', 'K4_TN_ĐỀ THI THÁNG 1_2025.2026_KEY.docx', 30, { mc: 25, short: 5 }, 0, (qs) => {
    assert.deepStrictEqual(qs.slice(18, 20).map((q) => q.choices.length), [4, 4]); // tìm lỗi sai
  }],
  ['file-mau-upload-cau-hoi.docx', null, 12, { mc: 4, blanks: 2, dropdowns: 2, essay: 2, ma: 2 }, 0, (qs) => {
    assert.deepStrictEqual(qs.slice(6).map((q) => q.no), ['7.1', '7.2', '7.3', '7.4', '7.5', '7.6']);
  }]
];

test('file Word thật trong Downloads (nếu có): số câu/loại/đáp án như khi mở bằng Word; file đáp án riêng điền đủ; MathType/OLE vẫn báo lỗi', async () => {
  let n = 0;
  for (const [de, da, soCau, loai, soLoi, them] of THAT) {
    const pDe = timThat(de);
    if (!pDe) continue;
    n++;
    let key = null;
    if (da) {
      const pDa = timThat(da);
      if (!pDa) continue;
      const u8Da = new Uint8Array(fs.readFileSync(pDa));
      const chi = await docx.parseDocx(u8Da, { fileName: da });
      assert.strictEqual(chi.keyOnly, true, da + ' phải được nhận là file đáp án');
      key = await docx.parseAnswerKey(u8Da, { fileName: da });
      assert.strictEqual(key.count, soCau, da + ': số đáp án');
    }
    const kq = await docx.parseDocx(new Uint8Array(fs.readFileSync(pDe)), { fileName: de });
    assert.ok(!kq.keyOnly, de);
    const b = kq.banks[0], qs = b.questions;
    if (key) {
      const r = docx.applyAnswerKey(kq.banks, key);
      assert.deepStrictEqual([r.matched, r.filled, r.conflicts, r.unused.length], [soCau, soCau, 0, 0], de + ': áp đáp án');
    }
    assert.strictEqual(qs.length, soCau, de + ': số câu');
    const dem = {};
    qs.forEach((q) => { dem[q.type] = (dem[q.type] || 0) + 1; });
    assert.deepStrictEqual(dem, loai, de + ': loại câu');
    const conLoi = qs.filter((q) => loi(q, 'error').length);
    assert.strictEqual(conLoi.length, soLoi, de + ': câu còn lỗi ' + JSON.stringify(conLoi.map((q) => q.title + ': ' + loi(q, 'error').map((i) => i.msg).join(' | '))));
    them(qs, b);
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
