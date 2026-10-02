/* tests/mau.test.cjs — kiểm thử hai file mẫu do tools/tao-mau.cjs sinh (chạy: node tests/mau.test.cjs)
 * - CLI chạy được, kết quả ổn định, mau/ đã cập nhật
 * - .docx/.xlsx là gói OPC hợp lệ (content types, rels, XML đúng chuẩn, A4, kiểu, danh sách thả xuống…)
 * - js/docx.js, js/xlsx.js đọc ra ĐÚNG số câu/loại/đáp án/điểm, không lỗi, không cảnh báo
 * - js/qti.js đóng gói cả hai bố cục × hai cách Đúng/Sai → tests/kiem-qti.cjs không báo lỗi
 * - Windows: System.IO.Packaging (WindowsBase) mở được cả hai file (bỏ qua khi không có PowerShell) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const zlib = require('zlib');
const core = require('../js/core.js');
const zip = require('../js/zip.js');
const docx = require('../js/docx.js');
const xlsx = require('../js/xlsx.js');
const qti = require('../js/qti.js');
const kiem = require('./kiem-qti.cjs');
const mau = require('../tools/tao-mau.cjs');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }
const GOC = path.resolve(__dirname, '..');
const RA = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-mau-'));
const CT_OFF = 'application/vnd.openxmlformats-officedocument.';
const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

let _ban = null; // bản sinh trong bộ nhớ (dùng chung giữa các test)
async function ban() {
  if (!_ban) {
    const anh = mau.veDoThi();
    _ban = { anh, docx: await mau.taoDocx({ anh }), xlsx: await mau.taoXlsx({ anh }) };
    _ban.zDocx = await zip.readZip(_ban.docx);
    _ban.zXlsx = await zip.readZip(_ban.xlsx);
  }
  return _ban;
}
const chu = (u8) => core.utf8Decode(u8);
const xml = (files, p) => { assert.ok(files[p], 'thiếu ' + p); return core.parseXml(chu(files[p])); };
const thuocTinh = (n, k) => n && n.attrs ? n.attrs[k] : undefined;
const tatCa = (node, ten) => core.findAll(node, ten);

/* ======================= kiểm tra gói OPC chung ======================= */

// [Content_Types].xml phủ mọi phần; mọi rels trỏ tới phần có thật; mọi XML đúng chuẩn, không BOM, có khai báo
function kiemOpc(files, bat) {
  const ten = Object.keys(files);
  const ct = xml(files, '[Content_Types].xml');
  const macDinh = {}, rieng = {};
  tatCa(ct, 'Default').forEach((d) => { macDinh[thuocTinh(d, 'Extension').toLowerCase()] = thuocTinh(d, 'ContentType'); });
  tatCa(ct, 'Override').forEach((o) => { rieng[thuocTinh(o, 'PartName')] = thuocTinh(o, 'ContentType'); });
  Object.keys(rieng).forEach((pn) => assert.ok(files[pn.slice(1)], 'Override cho phần không tồn tại: ' + pn));
  ten.filter((p) => p !== '[Content_Types].xml').forEach((p) => {
    const duoi = (/\.([^./]+)$/.exec(p) || [])[1];
    assert.ok(rieng['/' + p] || (duoi && macDinh[duoi.toLowerCase()]), 'phần không có content type: ' + p);
  });
  assert.strictEqual(macDinh.rels, 'application/vnd.openxmlformats-package.relationships+xml');
  Object.keys(bat).forEach((pn) => assert.strictEqual(rieng[pn], bat[pn], 'content type của ' + pn));
  // rels
  ten.filter((p) => /\.rels$/.test(p)).forEach((p) => {
    // "_rels/.rels" thuộc gốc gói; "word/_rels/document.xml.rels" thuộc "word/document.xml"
    const m = /^(.*?)_rels\/([^/]*)\.rels$/.exec(p);
    assert.ok(m, 'rels sai chỗ: ' + p);
    const nguon = m[1] + m[2], thuMuc = m[1];
    if (m[2]) assert.ok(files[nguon], p + ': không có phần nguồn ' + nguon);
    const ids = {};
    tatCa(xml(files, p), 'Relationship').forEach((r) => {
      const id = thuocTinh(r, 'Id'), dich = thuocTinh(r, 'Target');
      assert.ok(!ids[id], 'Id trùng trong ' + p + ': ' + id);
      ids[id] = 1;
      if (thuocTinh(r, 'TargetMode') === 'External') return;
      const parts = (dich.charAt(0) === '/' ? dich.slice(1) : thuMuc + dich).split('/'), out = [];
      parts.forEach((x) => { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); });
      assert.ok(files[out.join('/')], p + ': ' + id + ' trỏ tới phần không có: ' + out.join('/'));
    });
  });
  // XML
  ten.filter((p) => /\.(xml|rels)$/.test(p)).forEach((p) => {
    const s = chu(files[p]);
    assert.notStrictEqual(s.charCodeAt(0), 0xFEFF, p + ' có BOM');
    assert.ok(/^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?>/.test(s), p + ' thiếu khai báo XML');
    const kq = kiem.kiemXml(s);
    assert.deepStrictEqual(kq.loi, [], p + ' không đúng chuẩn XML');
    assert.strictEqual(s, s.normalize('NFC'), p + ' chưa chuẩn hoá NFC');
  });
  return { macDinh, rieng };
}
function relsCua(files, p) {
  const out = {};
  tatCa(xml(files, p), 'Relationship').forEach((r) => { out[thuocTinh(r, 'Id')] = { type: thuocTinh(r, 'Type'), target: thuocTinh(r, 'Target') }; });
  return out;
}
function kiemCore(files) {
  const c = chu(files['docProps/core.xml']);
  assert.match(c, /<dcterms:created xsi:type="dcterms:W3CDTF">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/dcterms:created>/);
  assert.match(c, /<dc:creator>Trường Tiểu học, THCS &amp; THPT Ngôi Sao Hoàng Mai<\/dc:creator>/);
  const goc = relsCua(files, '_rels/.rels');
  const loai = Object.keys(goc).map((k) => goc[k].type).sort();
  assert.deepStrictEqual(loai, [RT + 'extended-properties', RT + 'officeDocument',
    'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties'].sort());
}

/* ======================= CLI, ổn định, mau/ ======================= */

test('tools/tao-mau.cjs chạy bằng dòng lệnh (--out) và ghi đủ hai file', async () => {
  const r = cp.spawnSync(process.execPath, [path.join(GOC, 'tools', 'tao-mau.cjs'), '--out', RA], { encoding: 'utf8', timeout: 60000, windowsHide: true });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /Mau-ngan-hang-cau-hoi\.docx/);
  assert.match(r.stdout, /Mau-ngan-hang-cau-hoi\.xlsx/);
  const b = await ban();
  for (const [ten, goc] of [[mau.TEN_DOCX, b.zDocx], [mau.TEN_XLSX, b.zXlsx]]) {
    const u8 = fs.readFileSync(path.join(RA, ten));
    assert.ok(u8.length > 10000, ten + ' quá nhỏ');
    const z = await zip.readZip(u8);
    assert.deepStrictEqual(Object.keys(z).sort(), Object.keys(goc).sort(), ten);
    Object.keys(goc).forEach((k) => assert.ok(Buffer.from(z[k]).equals(Buffer.from(goc[k])), ten + ': ' + k + ' khác bản trong bộ nhớ'));
  }
});

test('kết quả ổn định: sinh hai lần ra cùng byte; [Content_Types].xml đứng đầu gói', async () => {
  const b = await ban();
  const d2 = await mau.taoDocx(), x2 = await mau.taoXlsx();
  assert.ok(Buffer.from(d2).equals(Buffer.from(b.docx)), 'docx khác giữa hai lần sinh');
  assert.ok(Buffer.from(x2).equals(Buffer.from(b.xlsx)), 'xlsx khác giữa hai lần sinh');
  assert.strictEqual(Object.keys(b.zDocx)[0], '[Content_Types].xml');
  assert.strictEqual(Object.keys(b.zXlsx)[0], '[Content_Types].xml');
});

test('mau/ đã cập nhật (cùng nội dung với bản vừa sinh — nếu hỏng: chạy node tools/tao-mau.cjs)', async () => {
  const b = await ban();
  for (const [ten, goc] of [[mau.TEN_DOCX, b.zDocx], [mau.TEN_XLSX, b.zXlsx]]) {
    const p = path.join(GOC, 'mau', ten);
    assert.ok(fs.existsSync(p), 'chưa có ' + p);
    const z = await zip.readZip(fs.readFileSync(p));
    assert.deepStrictEqual(Object.keys(z).sort(), Object.keys(goc).sort(), ten);
    Object.keys(goc).forEach((k) => assert.ok(Buffer.from(z[k]).equals(Buffer.from(goc[k])), 'mau/' + ten + ': ' + k + ' đã cũ'));
  }
});

test('ảnh PNG vẽ bằng mã: chữ ký, IHDR 600×450 RGB, CRC từng khối, dữ liệu giải nén đủ, có nét màu navy', async () => {
  const png = Buffer.from((await ban()).anh);
  assert.ok(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])));
  let p = 8, idat = [], ihdr = null;
  const loai = [];
  while (p < png.length) {
    const len = png.readUInt32BE(p), type = png.toString('latin1', p + 4, p + 8), data = png.subarray(p + 8, p + 8 + len);
    assert.strictEqual(png.readUInt32BE(p + 8 + len), core.crc32(new Uint8Array(png.subarray(p + 4, p + 8 + len))) >>> 0, 'CRC khối ' + type);
    loai.push(type);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  assert.deepStrictEqual(loai, ['IHDR', 'pHYs', 'IDAT', 'IEND']);
  assert.strictEqual(ihdr.readUInt32BE(0), 600);
  assert.strictEqual(ihdr.readUInt32BE(4), 450);
  assert.deepStrictEqual([ihdr[8], ihdr[9]], [8, 2]);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert.strictEqual(raw.length, (600 * 3 + 1) * 450);
  let navy = 0;
  for (let y = 0; y < 450; y++) for (let x = 0; x < 600; x++) {
    const i = y * 1801 + 1 + x * 3;
    if (raw[i] === 0x23 && raw[i + 1] === 0x32 && raw[i + 2] === 0x8C) navy++;
  }
  assert.ok(navy > 1000, 'đường cong navy quá ít điểm ảnh: ' + navy);
});

/* ======================= .docx ======================= */

test('docx: gói OPC hợp lệ (content types, rels, XML), A4 lề 2 cm, kiểu chữ, phông dự phòng, công thức Office Math thật', async () => {
  const f = (await ban()).zDocx;
  kiemOpc(f, {
    '/word/document.xml': CT_OFF + 'wordprocessingml.document.main+xml', '/word/styles.xml': CT_OFF + 'wordprocessingml.styles+xml',
    '/word/settings.xml': CT_OFF + 'wordprocessingml.settings+xml', '/word/fontTable.xml': CT_OFF + 'wordprocessingml.fontTable+xml',
    '/word/numbering.xml': CT_OFF + 'wordprocessingml.numbering+xml', '/word/footer1.xml': CT_OFF + 'wordprocessingml.footer+xml',
    '/docProps/core.xml': 'application/vnd.openxmlformats-package.core-properties+xml', '/docProps/app.xml': CT_OFF + 'extended-properties+xml'
  });
  kiemCore(f);
  assert.strictEqual(relsCua(f, '_rels/.rels').rId1.target, 'word/document.xml');
  const rels = relsCua(f, 'word/_rels/document.xml.rels');
  const theoLoai = {};
  Object.keys(rels).forEach((k) => { theoLoai[rels[k].type.replace(RT, '')] = rels[k].target; });
  assert.deepStrictEqual(theoLoai, { styles: 'styles.xml', settings: 'settings.xml', fontTable: 'fontTable.xml', numbering: 'numbering.xml', footer: 'footer1.xml', image: 'media/image1.png' });

  const sDoc = chu(f['word/document.xml']), doc = core.parseXml(sDoc);
  // mọi r:id / r:embed đều có trong rels; wp:docPr id duy nhất
  (sDoc.match(/r:(?:id|embed)="[^"]+"/g) || []).forEach((m) => assert.ok(rels[m.split('"')[1]], 'không có rel ' + m));
  const docPr = tatCa(doc, 'wp:docPr').map((n) => thuocTinh(n, 'id'));
  assert.ok(docPr.length >= 1 && new Set(docPr).size === docPr.length, 'wp:docPr id trùng');
  const sect = core.children(core.find(doc, 'w:body') || doc, 'w:sectPr');
  assert.strictEqual(sect.length, 1, 'w:sectPr phải là phần tử cuối của w:body');
  const pgSz = core.find(sect[0], 'w:pgSz'), pgMar = core.find(sect[0], 'w:pgMar');
  assert.deepStrictEqual([thuocTinh(pgSz, 'w:w'), thuocTinh(pgSz, 'w:h')], ['11906', '16838']);
  ['w:top', 'w:right', 'w:bottom', 'w:left'].forEach((k) => assert.strictEqual(thuocTinh(pgMar, k), '1134', k));
  assert.strictEqual(thuocTinh(core.find(sect[0], 'w:footerReference'), 'r:id'), 'rIdFooter1');
  // công thức Office Math thật
  ['m:f', 'm:rad', 'm:nary', 'm:eqArr', 'm:acc', 'm:sSup', 'm:oMathPara'].forEach((t) => assert.ok(tatCa(doc, t).length, 'thiếu ' + t));
  assert.ok(tatCa(doc, 'm:oMath').length >= 40);
  assert.ok(tatCa(doc, 'm:chr').some((n) => thuocTinh(n, 'm:val') === String.fromCharCode(0x20D7)), 'thiếu vectơ (m:chr U+20D7)');
  // kiểu
  const st = core.parseXml(chu(f['word/styles.xml']));
  const id = tatCa(st, 'w:style').map((s) => thuocTinh(s, 'w:styleId'));
  ['Normal', 'Title', 'Subtitle', 'Heading1', 'Heading2', 'TableGrid', 'HuongDan', 'NganHang', 'Phan', 'DoanDan', 'PhuongAn', 'TrongBang', 'Footer']
    .forEach((k) => assert.ok(id.includes(k), 'thiếu kiểu ' + k));
  assert.strictEqual(new Set(id).size, id.length, 'styleId trùng');
  const font = (sid) => thuocTinh(core.find(tatCa(st, 'w:style').find((s) => thuocTinh(s, 'w:styleId') === sid), 'w:rFonts'), 'w:ascii');
  assert.strictEqual(font('Title'), 'Be Vietnam Pro');
  assert.strictEqual(font('Heading1'), 'Be Vietnam Pro');
  assert.strictEqual(thuocTinh(core.find(core.find(st, 'w:docDefaults'), 'w:rFonts'), 'w:ascii'), 'Times New Roman');
  const ft = core.parseXml(chu(f['word/fontTable.xml']));
  const bvp = tatCa(ft, 'w:font').find((n) => thuocTinh(n, 'w:name') === 'Be Vietnam Pro');
  assert.strictEqual(thuocTinh(core.find(bvp, 'w:altName'), 'w:val'), 'Times New Roman');
  // không có kiểu đoạn nào tô đỏ / gạch chân / tô nền chữ (sẽ bị hiểu nhầm là đánh dấu đáp án)
  tatCa(st, 'w:style').filter((s) => !/^(Subtitle|Heading)/.test(thuocTinh(s, 'w:styleId'))).forEach((s) => {
    const rp = core.find(s, 'w:rPr');
    if (!rp) return;
    assert.ok(!core.find(rp, 'w:u') && !core.find(rp, 'w:highlight') && !core.find(rp, 'w:shd'), 'kiểu ' + thuocTinh(s, 'w:styleId') + ' có gạch chân/tô nền');
    const c = thuocTinh(core.find(rp, 'w:color'), 'w:val') || '';
    assert.ok(!/^(D2|[B-F][0-9A-F])[0-6][0-9A-F][0-6][0-9A-F]$/i.test(c), 'kiểu ' + thuocTinh(s, 'w:styleId') + ' màu đỏ ' + c);
  });
});

test('docx: phần hướng dẫn nằm trước dòng NGÂN HÀNG đầu tiên và có bảng đủ mọi dòng đánh dấu §3.2, mọi thẻ loại, mẹo công thức/ảnh/nhập', async () => {
  const doc = core.parseXml(chu((await ban()).zDocx['word/document.xml']));
  const body = core.find(doc, 'w:body');
  const khoi = core.children(body).filter((n) => n.name === 'w:p' || n.name === 'w:tbl');
  const chuCua = (n) => tatCa(n, 'w:t').map(core.xmlText).join('');
  const dauNH = khoi.findIndex((n) => n.name === 'w:p' && /^NGÂN HÀNG:/.test(chuCua(n)));
  assert.ok(dauNH > 10, 'không thấy dòng NGÂN HÀNG đầu tiên');
  const nh = khoi.filter((n) => n.name === 'w:p' && /^NGÂN HÀNG:/.test(chuCua(n))).map(chuCua);
  assert.deepStrictEqual(nh, ['NGÂN HÀNG: ' + mau.BANK_TOAN, 'NGÂN HÀNG: ' + mau.BANK_ANH]);
  const truoc = khoi.slice(0, dauNH);
  const bangHD = truoc.filter((n) => n.name === 'w:tbl').map(chuCua).join(' ¦ ');
  const vanHD = truoc.map(chuCua).join(' ¦ ');
  ['NGÂN HÀNG: <tên>', 'ĐIỂM MẶC ĐỊNH:', 'PHẦN I.', 'ĐOẠN DẪN:', 'HẾT ĐOẠN DẪN', 'Câu 7.', 'Question 7.', '(0,5 điểm)', '(1đ)', '[NB]', '[TH]', '[VD]', '[VDC]',
    '[TN]', '[NĐ]', '[ĐS]', '[TLN]', '[SỐ]', '[ĐIỀN]', '[CHỌN]', '[GHÉP]', '[TL]', 'A.  B.  C.  D.', '*A.', 'a)  b)  c)  d)', 'Đáp án:', 'ĐA:', 'Answer:',
    'Gạch chân / chữ đỏ / tô nền', '[[…]]', '[[*…|…|…]]', 'trái => phải', 'Nhiễu: x; y', 'Lời giải:', 'Hướng dẫn giải:', 'Giải thích:', 'HDG:', 'Hướng dẫn chấm:',
    'BẢNG ĐÁP ÁN', '--- HẾT ---', '$…$', 'ĐSĐS', '12,5 ± 0,1', '1,5 .. 2', '8/3; 2,67']
    .forEach((k) => assert.ok(bangHD.includes(k), 'bảng hướng dẫn thiếu "' + k + '"'));
  ['TRƯỜNG TIỂU HỌC, THCS & THPT NGÔI SAO HOÀNG MAI', 'Alt + =', 'MathType', 'Convert Equations', 'Office Math', 'In Line with Text', 'Alt Text',
    'EMF/WMF', 'Import Content', 'Import Course Content', 'QTI .zip'].forEach((k) => assert.ok(vanHD.includes(k), 'phần hướng dẫn thiếu "' + k + '"'));
  // không đoạn nào trong phần hướng dẫn bắt đầu bằng từ khoá làm công cụ hiểu nhầm
  truoc.filter((n) => n.name === 'w:p').forEach((n) => assert.ok(!/^\s*(NGÂN HÀNG|Ngân hàng)( câu hỏi)?\s*:/.test(chuCua(n)), chuCua(n)));
});

// ---- kỳ vọng nội dung hai ngân hàng (cùng cho Word và Excel, trừ chỗ ghi riêng) ----
const ANH_KV = [
  { id: 'q01', title: 'Câu 1 [TH]', type: 'blanks', points: 0.5, blanks: [{ id: 'b1', accepts: core.answerVariants(['has lived']) }, { id: 'b2', accepts: core.answerVariants(['was written']) }] },
  { id: 'q02', title: 'Câu 2 [TH]', type: 'dropdowns', points: 0.5, dropdowns: [{ id: 'b1', options: ['go', 'went', 'have gone'], correct: 1 }, { id: 'b2', options: ['stay', 'have stayed', 'stayed'], correct: 2 }] },
  { id: 'q03', title: 'Câu 3 [NB]', type: 'matching', points: 1, pairs: [
    { left: 'generous', right: 'willing to give money, help or time freely' }, { left: 'reliable', right: 'able to be trusted or depended on' },
    { left: 'ambitious', right: 'having a strong wish to be successful' }], distractors: ['easily annoyed', 'feeling nervous with other people'] },
  { id: 'q04', title: 'Câu 4 [TH]', type: 'mc', points: 0.5, dung: ['B'], soPA: 4 },
  { id: 'q05', title: 'Câu 5 [NB]', type: 'short', points: 0.5, answers: ['writer', 'author'] }
];
const KV_DOCX = [
  { id: 'q01', title: 'Câu 1 [NB]', type: 'mc', points: 0.25, dung: ['A'], soPA: 4, fb: true },
  { id: 'q02', title: 'Câu 2 [TH]', type: 'mc', points: 0.25, dung: ['B'], soPA: 4, fb: true },
  { id: 'q03', title: 'Câu 3 [TH]', type: 'mc', points: 0.25, dung: ['C'], soPA: 4, fb: true },
  { id: 'q04', title: 'Câu 4 [VD]', type: 'ma', points: 0.25, dung: ['A', 'B', 'D'], soPA: 4, fb: true },
  { id: 'q05', title: 'Câu 5 [TH]', type: 'mc', points: 0.25, dung: ['D'], soPA: 4, fb: true },
  { id: 'q06', title: 'Câu 6 [NB]', type: 'mc', points: 0.25, dung: ['C'], soPA: 4, doan: true },
  { id: 'q07', title: 'Câu 7 [TH]', type: 'mc', points: 0.25, dung: ['C'], soPA: 4, doan: true },
  { id: 'q08', title: 'Câu 8 [TH]', type: 'tf', points: 1, ds: { a: true, b: true, c: false, d: true }, fb: true },
  { id: 'q09', title: 'Câu 9 [VD]', type: 'short', points: 0.5, answers: core.answerVariants(['8/3', '2,67']), fb: true },
  { id: 'q10', title: 'Câu 10 [VD]', type: 'num', points: 0.5, numeric: { exact: 19.6, margin: 0.05 }, fb: true },
  { id: 'q11', title: 'Câu 11 [VDC]', type: 'essay', points: 1, fb: true }
];
const KV_XLSX = [
  { id: 'q01', title: 'Câu 1 [NB]', type: 'mc', points: 0.25, dung: ['A'], soPA: 4, fb: true },
  { id: 'q02', title: 'Câu 2 [TH]', type: 'mc', points: 0.25, dung: ['C'], soPA: 4, fb: true },
  { id: 'q03', title: 'Câu 3 [VD]', type: 'ma', points: 0.25, dung: ['A', 'B', 'D'], soPA: 4, fb: true },
  { id: 'q04', title: 'Câu 4 [NB]', type: 'mc', points: 0.25, dung: ['C'], soPA: 4, doan: true },
  { id: 'q05', title: 'Câu 5 [TH]', type: 'mc', points: 0.25, dung: ['C'], soPA: 4, doan: true, fb: true },
  { id: 'q06', title: 'Câu 6 [TH]', type: 'tf', points: 1, ds: { a: true, b: true, c: false, d: true }, fb: true },
  { id: 'q07', title: 'Câu 7 [VD]', type: 'short', points: 0.5, answers: core.answerVariants(['8/3', '2,67']), fb: true },
  { id: 'q08', title: 'Câu 8 [VD]', type: 'num', points: 0.5, numeric: { exact: 19.6, margin: 0.05 }, fb: true },
  { id: 'q09', title: 'Câu 9 [TH]', type: 'num', points: 0.5, numeric: { min: 1, max: 2 }, fb: true },
  { id: 'q10', title: 'Câu 10 [VDC]', type: 'essay', points: 1, fb: true }
];

function soKyVong(banks, kv, nguon) {
  assert.deepStrictEqual(banks.map((b) => b.title), [mau.BANK_TOAN, mau.BANK_ANH], nguon + ': tên ngân hàng');
  banks.forEach((b, i) => {
    assert.strictEqual(b.ident, core.bankIdent(b.title));
    assert.strictEqual(b.source.kind, nguon);
    assert.deepStrictEqual(b.warnings, [], nguon + ' ' + b.title + ': cảnh báo cấp ngân hàng');
    const mong = i === 0 ? kv : ANH_KV;
    assert.strictEqual(b.questions.length, mong.length, nguon + ' ' + b.title + ': số câu');
    b.questions.forEach((q, j) => {
      const m = mong[j], ten = nguon + ' ' + b.title + ' ' + m.id;
      assert.deepStrictEqual(q.issues, [], ten + ': có lỗi/cảnh báo');
      assert.deepStrictEqual(core.validateQuestion(q), [], ten + ': validateQuestion');
      assert.deepStrictEqual([q.id, q.title, q.type, q.points], [m.id, m.title, m.type, m.points], ten);
      assert.strictEqual(q.meta.level, /\[(\w+)\]$/.exec(m.title)[1], ten + ': mức độ');
      if (m.dung) {
        assert.strictEqual(q.choices.length, m.soPA, ten + ': số phương án');
        assert.deepStrictEqual(q.choices.filter((c) => c.correct).map((c) => c.id), m.dung, ten + ': đáp án');
        assert.deepStrictEqual(q.choices.map((c) => c.id), ['A', 'B', 'C', 'D'].slice(0, m.soPA));
        q.choices.forEach((c) => assert.ok(c.html.trim(), ten + ': phương án rỗng'));
      }
      if (m.ds) assert.deepStrictEqual(Object.fromEntries(q.statements.map((s) => [s.key, s.value])), m.ds, ten);
      ['answers', 'numeric', 'blanks', 'dropdowns', 'pairs', 'distractors'].forEach((k) => { if (m[k] !== undefined) assert.deepStrictEqual(q[k], m[k], ten + ': ' + k); });
      if (m.fb) assert.ok(q.feedback.length > 20, ten + ': thiếu lời giải');
      assert.strictEqual(!!q.stimulus, !!m.doan, ten + ': đoạn dẫn');
      assert.ok(!/\$/.test(q.stem), ten + ': còn $…$ chưa đổi thành công thức');
    });
  });
  const q = banks[1].questions;
  assert.match(q[3].stem, /<u>students<\/u>.*<u>have<\/u>.*<u>to submit<\/u>.*<u>before<\/u>/, nguon + ': câu tìm lỗi sai phải giữ gạch chân');
  assert.match(q[0].stem, /\[b1\].*\[b2\]/);
  assert.match(q[1].stem, /\[b1\].*\[b2\]/);
}

test('docx → parseDocx: đúng 11 + 5 câu, đúng loại/đáp án/điểm/mức độ; công thức, ảnh, bảng, đoạn dẫn, bảng đáp án; không lỗi, không cảnh báo', async () => {
  const b = await ban();
  const kq = await docx.parseDocx(b.docx, { fileName: mau.TEN_DOCX });
  assert.deepStrictEqual(kq.issues, []);
  soKyVong(kq.banks, KV_DOCX, 'docx');
  const t = kq.banks[0].questions, a = kq.banks[0];
  assert.deepStrictEqual(Object.keys(a.images), ['img_001.png']);
  assert.ok(Buffer.from(a.images['img_001.png']).equals(Buffer.from(b.anh)), 'ảnh trong ngân hàng khác ảnh PNG đã nhúng');
  assert.deepStrictEqual(Object.keys(kq.banks[1].images), []);
  assert.match(t[0].stem, /<mfrac>/);                                         // phân số
  assert.ok(t[0].choices.every((c) => /^<math /.test(c.html)), 'phương án Câu 1 là công thức');
  assert.match(t[1].stem, /<msubsup><mo>∫<\/mo><mn>1<\/mn><mn>2<\/mn><\/msubsup>/); // tích phân có cận
  assert.match(t[1].choices[2].html, /<mfrac><mn>3<\/mn><mn>2<\/mn><\/mfrac>/);     // phương án trong bảng 2×2
  assert.match(t[2].stem, /<img src="images\/img_001\.png" alt="Đồ thị hàm số[^"]*" style="max-width:100%;height:auto" width="300">/);
  assert.match(t[3].stem, /<mo fence="true">\{<\/mo><mtable/);                  // hệ phương trình
  assert.match(t[3].choices[2].html, /<msqrt><mn>2<\/mn><\/msqrt>/);            // căn
  assert.match(t[4].stem, /<table [^>]*>.*f′\(x\).*<\/table><p>Hàm số/);       // bảng trong nội dung câu
  assert.strictEqual(t[5].stimulus, t[6].stimulus);
  assert.match(t[5].stimulus, /^<p>Thời gian tự học.*<table .*Số học sinh.*<\/table><p>Dựa vào bảng trên/);
  assert.match(t[7].stem, /<mover accent="true"><mi>a<\/mi><mo stretchy="false">→<\/mo><\/mover>/); // vectơ
  assert.strictEqual(t[7].statements.length, 4);
  assert.match(t[9].stem, /<mn>4,9<\/mn><msup><mi>t<\/mi><mn>2<\/mn><\/msup>/); // LaTeX $…$ gõ trong Word
  assert.match(t[10].feedback, /<math [^>]*display="block"/);                  // công thức khối trong hướng dẫn chấm
  assert.deepStrictEqual(t.map((q) => q.meta.part.replace(/\..*/, '')), ['PHẦN I', 'PHẦN I', 'PHẦN I', 'PHẦN I', 'PHẦN I', 'PHẦN I', 'PHẦN I', 'PHẦN II', 'PHẦN III', 'PHẦN III', 'PHẦN IV']);
});

/* ======================= .xlsx ======================= */

test('xlsx: gói OPC hợp lệ; trang "Câu hỏi" có tiêu đề cố định, cột rộng, xuống dòng, danh sách thả xuống, ảnh nổi; trang "Hướng dẫn"', async () => {
  const f = (await ban()).zXlsx;
  kiemOpc(f, {
    '/xl/workbook.xml': CT_OFF + 'spreadsheetml.sheet.main+xml', '/xl/worksheets/sheet1.xml': CT_OFF + 'spreadsheetml.worksheet+xml',
    '/xl/worksheets/sheet2.xml': CT_OFF + 'spreadsheetml.worksheet+xml', '/xl/styles.xml': CT_OFF + 'spreadsheetml.styles+xml',
    '/xl/sharedStrings.xml': CT_OFF + 'spreadsheetml.sharedStrings+xml', '/xl/drawings/drawing1.xml': CT_OFF + 'drawing+xml',
    '/docProps/core.xml': 'application/vnd.openxmlformats-package.core-properties+xml', '/docProps/app.xml': CT_OFF + 'extended-properties+xml'
  });
  kiemCore(f);
  const wb = xml(f, 'xl/workbook.xml');
  assert.deepStrictEqual(tatCa(wb, 'sheet').map((s) => thuocTinh(s, 'name')), ['Câu hỏi', 'Hướng dẫn']);
  assert.strictEqual(core.xmlText(core.find(wb, 'definedName')), "'Câu hỏi'!$1:$1");
  // styles: đếm khớp, mọi s="…" trong giới hạn
  const st = xml(f, 'xl/styles.xml');
  ['fonts', 'fills', 'borders', 'cellXfs', 'cellStyleXfs'].forEach((k) => {
    const n = core.find(st, k);
    assert.strictEqual(+thuocTinh(n, 'count'), core.children(n).filter((c) => c.type === 'el').length, 'count của ' + k);
  });
  const soXf = +thuocTinh(core.find(st, 'cellXfs'), 'count');
  const sst = xml(f, 'xl/sharedStrings.xml'), soChuoi = tatCa(sst, 'si').length;
  assert.strictEqual(+thuocTinh(sst, 'uniqueCount'), soChuoi);
  const chuoi = tatCa(sst, 'si').map((si) => tatCa(si, 't').map(core.xmlText).join(''));
  ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].forEach((p) => tatCa(xml(f, p), 'c').forEach((c) => {
    assert.ok(+thuocTinh(c, 's') < soXf, p + ' ' + thuocTinh(c, 'r') + ': s vượt cellXfs');
    if (thuocTinh(c, 't') === 's') assert.ok(+core.xmlText(core.find(c, 'v')) < soChuoi, p + ' ' + thuocTinh(c, 'r'));
  }));
  // trang Câu hỏi
  const s1 = xml(f, 'xl/worksheets/sheet1.xml');
  const pane = core.find(s1, 'pane');
  assert.deepStrictEqual([thuocTinh(pane, 'ySplit'), thuocTinh(pane, 'topLeftCell'), thuocTinh(pane, 'state')], ['1', 'A2', 'frozen']);
  const cols = tatCa(s1, 'col');
  assert.strictEqual(cols.length, mau.COT.length);
  cols.forEach((c, i) => assert.strictEqual(+thuocTinh(c, 'width'), mau.COT[i][1]));
  const dong1 = tatCa(s1, 'row')[0];
  assert.deepStrictEqual(core.children(dong1, 'c').map((c) => chuoi[+core.xmlText(core.find(c, 'v'))]), mau.COT.map((c) => c[0]));
  const dv = tatCa(s1, 'dataValidation');
  const ds1 = (sq) => dv.find((d) => thuocTinh(d, 'sqref') === sq);
  assert.strictEqual(thuocTinh(ds1('B2:B1000'), 'type'), 'list');
  assert.strictEqual(core.xmlText(core.find(ds1('B2:B1000'), 'formula1')), '"' + mau.LOAI_CAU.join(',') + '"');
  assert.ok(core.xmlText(core.find(ds1('B2:B1000'), 'formula1')).length <= 257, 'danh sách Loại câu vượt 255 ký tự');
  assert.strictEqual(core.xmlText(core.find(ds1('Q2:Q1000'), 'formula1')), '"NB,TH,VD,VDC"');
  dv.forEach((d) => {
    assert.ok((thuocTinh(d, 'promptTitle') || '').length <= 32 && (thuocTinh(d, 'prompt') || '').length <= 255, 'lời nhắc quá dài: ' + thuocTinh(d, 'sqref'));
    assert.ok((thuocTinh(d, 'error') || '').length <= 255);
  });
  assert.ok(tatCa(xml(f, 'xl/styles.xml'), 'alignment').some((a) => thuocTinh(a, 'wrapText') === '1'));
  // ảnh nổi neo ở dòng câu có đồ thị
  const dr = xml(f, 'xl/drawings/drawing1.xml');
  assert.strictEqual(core.xmlText(core.find(core.find(dr, 'xdr:from'), 'xdr:row')), String(mau.ANH_X.row - 1));
  assert.strictEqual(core.xmlText(core.find(core.find(dr, 'xdr:from'), 'xdr:col')), String(mau.ANH_X.col));
  assert.strictEqual(relsCua(f, 'xl/worksheets/_rels/sheet1.xml.rels').rId1.target, '../drawings/drawing1.xml');
  assert.ok(Buffer.from(f['xl/media/image1.png']).equals(Buffer.from((await ban()).anh)));
  // trang Hướng dẫn: giải thích từng cột và từng loại câu
  const s2 = xml(f, 'xl/worksheets/sheet2.xml');
  const chu2 = tatCa(s2, 'c').filter((c) => thuocTinh(c, 't') === 's').map((c) => chuoi[+core.xmlText(core.find(c, 'v'))]);
  mau.COT.map((c) => c[0]).filter((c) => !/^[A-H]$/.test(c)).concat(['A … H']).forEach((c) => assert.ok(chu2.includes(c), 'Hướng dẫn thiếu cột ' + c));
  mau.LOAI_CAU.forEach((l) => assert.ok(chu2.includes(l), 'Hướng dẫn thiếu loại ' + l));
  assert.ok(tatCa(s2, 'mergeCell').length >= 10);
});

test('xlsx → parseXlsx: đúng 10 + 5 câu, đúng loại/đáp án/điểm/mức độ; LaTeX → MathML, ảnh nổi, đoạn dẫn; không lỗi, không cảnh báo', async () => {
  const b = await ban();
  const kq = await xlsx.parseXlsx(b.xlsx, { fileName: mau.TEN_XLSX });
  assert.deepStrictEqual(kq.issues, []);
  soKyVong(kq.banks, KV_XLSX, 'xlsx');
  const t = kq.banks[0].questions;
  assert.deepStrictEqual(Object.keys(kq.banks[0].images), ['img_001.png']);
  assert.ok(Buffer.from(kq.banks[0].images['img_001.png']).equals(Buffer.from(b.anh)));
  // "Văn bản thay thế" của ảnh nổi (xdr:cNvPr descr) → alt
  assert.match(t[1].stem, /<img src="images\/img_001\.png" alt="Đồ thị hàm số[^"]*" style="max-width:100%;height:auto" width="192">/);
  assert.match(t[0].stem, /<mfrac>/);
  assert.match(t[2].stem, /<mtable/);
  assert.match(t[5].choices ? '' : t[5].statements[0].html, /<mover accent="true">/);
  assert.strictEqual(t[3].stimulus, t[4].stimulus);
  assert.match(t[3].stimulus, /Thời gian tự học.*<br>.*Số học sinh/);
  assert.deepStrictEqual(t.map((q) => q.src.row), [2, 3, 4, 6, 7, 9, 10, 11, 12, 13]);
  assert.deepStrictEqual(kq.banks[1].questions.map((q) => q.src.row), [14, 15, 16, 17, 18]);
});

/* ======================= QTI + bộ kiểm tra độc lập ======================= */

test('QTI: cả hai mẫu → buildPackages (itembank, classic) × (dropdowns, split) → tests/kiem-qti.cjs không báo lỗi', async () => {
  const b = await ban();
  const nguon = {
    docx: (await docx.parseDocx(b.docx, { fileName: mau.TEN_DOCX })).banks,
    xlsx: (await xlsx.parseXlsx(b.xlsx, { fileName: mau.TEN_XLSX })).banks
  };
  const soItem = { docx: [11, 5], xlsx: [10, 5] };
  let soGoi = 0, canhBao = 0;
  for (const ten of Object.keys(nguon)) {
    for (const target of ['itembank', 'classic']) {
      for (const tfMode of ['dropdowns', 'split']) {
        const nhan = ten + ' ' + target + ' ' + tfMode;
        const goi = await qti.buildPackages(nguon[ten], { target, tfMode });
        assert.deepStrictEqual(goi.issues.filter((i) => i.level !== 'info'), [], nhan + ': qti báo lỗi/cảnh báo');
        assert.strictEqual(goi.length, target === 'classic' ? 1 : 2, nhan + ': số gói');
        const them = tfMode === 'split' ? 3 : 0;   // câu Đúng/Sai 4 ý → 4 câu
        const kvItem = target === 'classic' ? [soItem[ten][0] + them + soItem[ten][1]] : [soItem[ten][0] + them, soItem[ten][1]];
        assert.deepStrictEqual(goi.map((g) => g.counts.items), kvItem, nhan + ': số item');
        assert.deepStrictEqual(goi.map((g) => g.counts.points), target === 'classic' ? [7.75] : [4.75, 3], nhan + ': tổng điểm');
        assert.deepStrictEqual(goi.map((g) => g.counts.skipped), goi.map(() => 0), nhan + ': có câu bị bỏ');
        for (const g of goi) {
          const r = await kiem.checkZip(g.bytes, { layout: target });
          soGoi++;
          canhBao += r.warnings.length;
          assert.deepStrictEqual(r.errors.map((e) => e.code + ': ' + e.msg), [], nhan + ' ' + g.fileName);
          assert.ok(r.ok, nhan + ' ' + g.fileName);
          assert.strictEqual(r.layout, target, nhan);
        }
        if (target === 'classic') {
          const r = await kiem.checkZip(goi[0].bytes, { layout: 'classic' });
          assert.deepStrictEqual(r.banks.map((x) => x.title), [mau.BANK_TOAN, mau.BANK_ANH], nhan);
        }
      }
    }
  }
  assert.strictEqual(soGoi, 12);
  if (canhBao) console.log('    (kiem-qti: ' + canhBao + ' cảnh báo không chặn)');
});

/* ======================= Windows: System.IO.Packaging ======================= */

test('OPC thật: System.IO.Packaging (WindowsBase) mở được cả hai file, mọi quan hệ trỏ tới phần có thật', async () => {
  if (process.platform !== 'win32') { console.log('    BỎ QUA: không phải Windows'); return; }
  const tep = [path.join(RA, mau.TEN_DOCX), path.join(RA, mau.TEN_XLSX)];
  if (!tep.every((p) => fs.existsSync(p))) { const b = await ban(); fs.writeFileSync(tep[0], b.docx); fs.writeFileSync(tep[1], b.xlsx); }
  const ps1 = path.join(RA, 'kiem-opc.ps1');
  fs.writeFileSync(ps1, [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName WindowsBase',
    'foreach ($f in $args) {',
    '  $pkg = [System.IO.Packaging.Package]::Open($f, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read)',
    '  try {',
    '    $n = 0; $nr = 0',
    '    foreach ($part in $pkg.GetParts()) {',
    '      $n++; $s = $part.GetStream(); $s.Dispose(); [void]$part.ContentType',
    "      if ($part.Uri.ToString() -notmatch '[.]rels$') {",
    '        foreach ($rel in $part.GetRelationships()) {',
    "          $nr++; if ($rel.TargetMode -eq 'Internal') { $t = [System.IO.Packaging.PackUriHelper]::ResolvePartUri($part.Uri, $rel.TargetUri); if (-not $pkg.PartExists($t)) { throw ('missing ' + $t) } }",
    '        }',
    '      }',
    '    }',
    "    foreach ($rel in $pkg.GetRelationships()) { $nr++; $t = [System.IO.Packaging.PackUriHelper]::ResolvePartUri([uri]'/', $rel.TargetUri); if (-not $pkg.PartExists($t)) { throw ('missing ' + $t) } }",
    '    $c = $pkg.PackageProperties.Created',
    "    'OK|' + [System.IO.Path]::GetFileName($f) + '|' + $n + '|' + $nr + '|' + $c.Year",
    '  } finally { $pkg.Close() }',
    '}'
  ].join('\r\n'));
  const r = cp.spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1].concat(tep),
    { encoding: 'utf8', timeout: 90000, windowsHide: true });
  if (r.error && r.error.code === 'ENOENT') { console.log('    BỎ QUA: không có powershell'); return; }
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  const dong = r.stdout.trim().split(/\r?\n/).filter((l) => l.startsWith('OK|'));
  assert.deepStrictEqual(dong.map((l) => l.split('|')[1]), [mau.TEN_DOCX, mau.TEN_XLSX], r.stdout);
  dong.forEach((l) => { const [, , n, nr, nam] = l.split('|'); assert.ok(+n >= 10 && +nr >= 8 && nam === '2026', l); });
});

/* ---------------- Chạy ---------------- */

(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  đạt  ' + ten); } catch (e) { hong++; console.log('  HỎNG ' + ten + '\n' + String(e && e.stack || e).split('\n').map((l) => '        ' + l).join('\n')); }
  }
  try { fs.rmSync(RA, { recursive: true, force: true }); } catch (e) { /* bỏ qua */ }
  console.log(hong ? hong + '/' + ds.length + ' test hỏng' : 'Đạt ' + ds.length + '/' + ds.length + ' test mẫu');
  process.exitCode = hong ? 1 : 0;
})();
