/* tests/app.test.cjs — phần thuần của js/app.js (nhận dạng file, gộp lỗi, chuẩn bị ngân hàng xuất,
 * các bước nhập Canvas) + kiểm tra index.html / huong-dan.html / .claude/launch.json khớp với app.js.
 * Chạy: node tests/app.test.cjs */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GOC = path.resolve(__dirname, '..');
const app = require(path.join(GOC, 'js/app.js'));
const core = require(path.join(GOC, 'js/core.js'));
const zip = require(path.join(GOC, 'js/zip.js'));
const qti = require(path.join(GOC, 'js/qti.js'));
const docx = require(path.join(GOC, 'js/docx.js'));
const xlsx = require(path.join(GOC, 'js/xlsx.js'));
const kiem = require(path.join(GOC, 'tests/kiem-qti.cjs'));

const ds = [];
function test(ten, fn) { ds.push({ ten, fn }); }
const docTep = (p) => new Uint8Array(fs.readFileSync(path.join(GOC, p)));
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1F, 0x15, 0xC4, 0x89]);

/* ---------- định dạng số / điểm ---------- */

test('fmtSo: dấu phẩy thập phân, dấu trừ, làm tròn 4 chữ số', () => {
  assert.strictEqual(app.fmtSo(0.25), '0,25');
  assert.strictEqual(app.fmtSo(12), '12');
  assert.strictEqual(app.fmtSo(19500), '19500');
  assert.strictEqual(app.fmtSo(1 / 3), '0,3333');
  assert.strictEqual(app.fmtSo(-1.5), '\u22121,5');
  assert.strictEqual(app.fmtSo(NaN), 'NaN');
});

test('docDiem: nhận "0,25" "0.5" "1đ", từ chối chữ, số âm, quá lớn', () => {
  assert.strictEqual(app.docDiem('0,25'), 0.25);
  assert.strictEqual(app.docDiem('0.5'), 0.5);
  assert.strictEqual(app.docDiem('1đ'), 1);
  assert.strictEqual(app.docDiem(' 2 '), 2);
  assert.strictEqual(app.docDiem(0), 0);
  assert.strictEqual(app.docDiem('abc'), null);
  assert.strictEqual(app.docDiem(''), null);
  assert.strictEqual(app.docDiem('-1'), null);
  assert.strictEqual(app.docDiem('5000'), null);
});

/* ---------- nhận dạng file ---------- */

test('phanLoaiFile: theo nội dung, không theo đuôi', () => {
  assert.strictEqual(app.phanLoaiFile('a.png', PNG), 'image');
  assert.strictEqual(app.phanLoaiFile('anh.dat', PNG), 'image');                       // đuôi sai vẫn nhận
  assert.strictEqual(app.phanLoaiFile('a.jpg', new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0])), 'image');
  assert.strictEqual(app.phanLoaiFile('a.gif', new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), 'image');
  assert.strictEqual(app.phanLoaiFile('a.webp', new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'image-khac');
  assert.strictEqual(app.phanLoaiFile('a.bmp', new Uint8Array([0x42, 0x4D, 0, 0])), 'image-khac');
  assert.strictEqual(app.phanLoaiFile('de.doc', new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])), 'office-cu');
  assert.strictEqual(app.phanLoaiFile('de.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D])), 'pdf');
  assert.strictEqual(app.phanLoaiFile('de.docx', docTep('tests/fixtures/docx/co-ban.docx')), 'zip');
  assert.strictEqual(app.phanLoaiFile('x.txt', new Uint8Array([0x41, 0x42, 0x43])), 'unknown');
  assert.strictEqual(app.phanLoaiFile('rong', new Uint8Array(0)), 'unknown');
});

test('phanLoaiZip: docx / xlsx / scorm / qti / gói ảnh', async () => {
  const dx = await zip.readZip(docTep('tests/fixtures/docx/co-ban.docx'));
  assert.strictEqual(app.phanLoaiZip(Object.keys(dx)), 'docx');
  const xl = await zip.readZip(docTep('tests/fixtures/xlsx/mau-day-du.xlsx'));
  assert.strictEqual(app.phanLoaiZip(Object.keys(xl)), 'xlsx');
  assert.strictEqual(app.phanLoaiZip(['imsmanifest.xml', 'index.html', 'js/app.js']), 'scorm');
  assert.strictEqual(app.phanLoaiZip(['goi/imsmanifest.xml', 'goi/index.html']), 'scorm');
  assert.strictEqual(app.phanLoaiZip(['imsmanifest.xml', 'non_cc_assessments/nh_a.xml.qti']), 'qti');
  assert.strictEqual(app.phanLoaiZip(['imsmanifest.xml', 'q/assessment_meta.xml', 'q/q.xml']), 'qti');
  assert.strictEqual(app.phanLoaiZip(['__MACOSX/imsmanifest.xml', 'a.png']), 'goi');
  assert.strictEqual(app.phanLoaiZip(['anh/hinh1.png', 'hinh2.jpg']), 'goi');
  assert.strictEqual(app.phanLoaiZip([]), 'goi');
  // gói QTI do chính công cụ xuất → nhận ra là qti (không nhầm SCORM)
  const b = await qti.buildPackages([{ title: 'Thử', questions: [{ id: 'q01', no: '1', type: 'essay', points: 1, stem: '<p>Viết</p>' }], images: {} }], { target: 'itembank' });
  assert.strictEqual(app.phanLoaiZip(Object.keys(await zip.readZip(b[0].bytes))), 'qti');
  const c = await qti.buildPackages([{ title: 'Thử', questions: [{ id: 'q01', no: '1', type: 'essay', points: 1, stem: '<p>Viết</p>' }], images: {} }], { target: 'classic' });
  assert.strictEqual(app.phanLoaiZip(Object.keys(await zip.readZip(c[0].bytes))), 'qti');
});

test('phanLoaiZip: mọi gói SCORM thật trong Downloads (nếu có)', async () => {
  const thu = 'C:/Users/Administrator/Downloads';
  let ten = [];
  try { ten = fs.readdirSync(thu).filter(f => /SCORM.*\.zip$/i.test(f)); } catch (e) { /* không có */ }
  for (const f of ten) {
    const files = await zip.readZip(new Uint8Array(fs.readFileSync(path.join(thu, f))));
    assert.strictEqual(app.phanLoaiZip(Object.keys(files)), 'scorm', f);
  }
});

test('tachGoi: ảnh, file Word/Excel lồng, bỏ rác và định dạng lạ', () => {
  const dx = docTep('tests/fixtures/docx/co-ban.docx');
  const g = app.tachGoi({
    'anh/hinh 1.png': PNG, 'Hinh2.JPG': new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]), 'de/De.docx': dx,
    '__MACOSX/anh/._hinh 1.png': PNG, '.DS_Store': new Uint8Array([1, 2]), 'Thumbs.db': new Uint8Array([1]),
    'a.webp': new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), 'ghi-chu.txt': new Uint8Array([0x41]),
    'rong.png': new Uint8Array(0)
  });
  assert.deepStrictEqual(Object.keys(g.anh).sort(), ['Hinh2.JPG', 'anh/hinh 1.png']);
  assert.deepStrictEqual(g.con.map(x => x.name), ['De.docx']);
  assert.deepStrictEqual(g.boQua.map(x => x.path).sort(), ['a.webp', 'ghi-chu.txt']);
  assert.ok(/WEBP/.test(g.boQua.find(x => x.path === 'a.webp').lyDo));
});

/* ---------- lỗi / cảnh báo ---------- */

test('duoiMsg: bỏ tiền tố "Câu …:" / "Dòng N:"', () => {
  assert.strictEqual(app.duoiMsg('Câu 7 (Phần II): chưa xác định đáp án đúng'), 'chưa xác định đáp án đúng');
  assert.strictEqual(app.duoiMsg('Dòng 12: chưa xác định  đáp án đúng'), 'chưa xác định đáp án đúng');
  assert.strictEqual(app.duoiMsg('Câu 1–6: x'), 'x');
  assert.strictEqual(app.duoiMsg('Ngân hàng trống'), 'ngân hàng trống');
});

test('vanDeCau: gộp lỗi bộ đọc + validateQuestion, bỏ trùng theo nội dung', () => {
  const q = {
    id: 'q05', no: '5', title: 'Câu 5', type: 'mc', points: 1, stem: '<p>?</p>',
    choices: [{ id: 'A', html: '1', correct: false }, { id: 'B', html: '2', correct: false }],
    issues: [core.newIssue('error', 'Dòng 9: chưa xác định đáp án đúng', 'q05'), core.newIssue('info', 'Dòng 9: ghi chú')]
  };
  const v = app.vanDeCau(q, {});
  assert.strictEqual(v.filter(i => /chưa xác định đáp án đúng/.test(i.msg)).length, 1);
  assert.strictEqual(v[0].level, 'error');                                  // lỗi xếp trước
  assert.deepStrictEqual(app.demMuc(v), { error: 1, warn: 0, info: 1 });
  // điểm 0 → lỗi của validateQuestion
  const q2 = Object.assign({}, q, { points: 0, issues: [], choices: [{ id: 'A', html: '1', correct: true }, { id: 'B', html: '2' }] });
  assert.ok(app.vanDeCau(q2, {}).some(i => i.level === 'error' && /điểm/.test(i.msg)));
  assert.strictEqual(app.vanDeCau(null)[0].level, 'error');
});

test('vanDeAnh: thiếu ảnh, ảnh data:, tên có dấu cách/thực thể', () => {
  const q = { id: 'q01', no: '1', type: 'essay', points: 1,
    stem: '<p><img src="images/a.png"><img src="images/b%201.png"><img src=\'images/c.png\'></p>',
    feedback: '<img src="data:image/png;base64,AAAA">',
    choices: [{ id: 'A', html: '<img src=images/d&amp;e.png>' }] };
  const v = app.vanDeAnh(q, { 'a.png': PNG, 'b 1.png': PNG });
  const msg = v.map(i => i.msg).join('\n');
  assert.ok(/thiếu ảnh "c\.png"/.test(msg));
  assert.ok(/thiếu ảnh "d&e\.png"/.test(msg));
  assert.ok(/data:/.test(msg));
  assert.ok(!/"a\.png"|"b 1\.png"/.test(msg));
  assert.strictEqual(v.length, 3);
  assert.ok(v.every(i => i.level === 'error' && i.qid === 'q01'));
  assert.deepStrictEqual(app.anhTrongHtml('<IMG alt="x" SRC="images/z.gif">'), ['images/z.gif']);
});

/* ---------- chuẩn bị ngân hàng xuất: giữ vị trí câu ---------- */

function bankMau() {
  const qs = [1, 2, 3, 4].map(n => ({
    id: 'q0' + n, no: String(n), title: 'Câu ' + n, type: 'mc', points: 1, stem: '<p>Câu ' + n + '</p>',
    choices: [{ id: 'A', html: 'a', correct: true }, { id: 'B', html: 'b', correct: false }], issues: []
  }));
  qs[2].choices[0].correct = false;                // câu 3 lỗi: chưa có đáp án
  return { title: 'Ngân hàng mẫu', ident: core.bankIdent('Ngân hàng mẫu'), source: { kind: 'docx', name: 'x.docx' }, questions: qs, images: {}, warnings: [] };
}

test('tomTatMuc / duocXuat / banksDeXuat: câu lỗi và câu bỏ chọn → null tại đúng vị trí', () => {
  const e = app.taoMuc('k1', bankMau());
  e.boChon.q02 = true;
  const t = app.tomTatMuc(e);
  assert.strictEqual(t.tong, 4);
  assert.strictEqual(t.loi, 1);
  assert.strictEqual(t.chon, 2);
  assert.strictEqual(t.diem, 2);
  assert.strictEqual(t.theoLoai.mc, 4);
  const b = app.banksDeXuat([e]);
  assert.strictEqual(b.length, 1);
  assert.deepStrictEqual(b[0].questions.map(q => q && q.id), ['q01', null, null, 'q04']);
  assert.notStrictEqual(b[0], e.bank);                       // bản sao, không sửa ngân hàng gốc
  assert.strictEqual(e.bank.questions.length, 4);
  assert.strictEqual(b[0].ident, e.bank.ident);
  // bỏ cả ngân hàng / không còn câu nào → không xuất
  e.khongXuat = true;
  assert.strictEqual(app.banksDeXuat([e]).length, 0);
  e.khongXuat = false;
  e.boChon.q01 = e.boChon.q04 = true;
  assert.strictEqual(app.banksDeXuat([e]).length, 0);
});

test('vdCua được nhớ đệm; đổi điểm thì phải xoá đệm (app.js làm khi sửa điểm)', () => {
  const e = app.taoMuc('k', bankMau());
  const q = e.bank.questions[0];
  assert.strictEqual(app.coLoi(e, q), false);
  q.points = 0;
  assert.strictEqual(app.coLoi(e, q), false);                // vẫn kết quả cũ (đệm)
  delete e._vd[q.id];
  assert.strictEqual(app.coLoi(e, q), true);
});

test('Xuất qua qti với null: ident item giữ theo vị trí, lọc thông báo chỗ trống, cả hai bố cục', async () => {
  const e = app.taoMuc('k1', bankMau());
  e.boChon.q02 = true;
  for (const target of ['itembank', 'classic']) {
    const files = qti.buildFiles(app.banksDeXuat([e]), { target });
    const vd = app.locVanDeXuat(files.issues);
    // hợp đồng qti: null = câu bị loại, bỏ qua im lặng (không issue), đếm vào counts.excluded
    assert.ok(!files.issues.some(i => /dữ liệu câu hỏi không hợp lệ/.test(i.msg)), 'qti không báo lỗi cho chỗ trống null');
    assert.deepStrictEqual(vd, files.issues.filter(i => !(i && i.qid == null && /:\s*dữ liệu câu hỏi không hợp lệ$/.test(i.msg))), target);
    const pr = qti.prepare(app.banksDeXuat([e]), { target });
    assert.strictEqual(pr.packages[0].counts.excluded, 2, target + ': q02 bỏ chọn + q03 lỗi');
    assert.strictEqual(pr.packages[0].counts.skipped, 0, target);
    const xml = files.filter(f => /\.xml(\.qti)?$/.test(f.path) && !/manifest|meta/.test(f.path)).map(f => f.data).join('');
    const ident = e.bank.ident;
    assert.ok(xml.includes('ident="' + ident + '_q01"'), target);
    assert.ok(xml.includes('ident="' + ident + '_q04"'), target);       // không bị dồn thành _q02
    assert.ok(!xml.includes(ident + '_q02"') && !xml.includes(ident + '_q03"'), target);
    const goi = {};
    files.forEach(f => { goi[f.path] = f.data; });
    const r = kiem.checkPackage(goi, { layout: target });
    assert.ok(r.ok, target + ': ' + r.errors.map(x => x.code + ' ' + x.msg).join('; '));
  }
});

test('Đầu-cuối: docx mẫu → mục → bỏ chọn → buildPackages → kiem-qti đạt, đúng số câu', async () => {
  const r = await docx.parseDocx(docTep('tests/fixtures/docx/loai-cau.docx'), { fileName: 'loai-cau.docx' });
  assert.ok(r.banks.length >= 1);
  const ms = r.banks.map((b, i) => app.taoMuc('n1-' + i, b));
  const e = ms[0];
  const loi = e.bank.questions.filter(q => app.coLoi(e, q)).map(q => q.id);
  assert.ok(loi.length >= 1, 'mẫu loai-cau có câu lỗi');
  const boChon = e.bank.questions.find(q => !app.coLoi(e, q));
  e.boChon[boChon.id] = true;
  const t = app.tomTatMuc(e);
  const pk = await qti.buildPackages(app.banksDeXuat(ms), { target: 'itembank' });
  const vd = app.locVanDeXuat(pk.issues);
  assert.ok(!vd.some(i => i.level === 'error'), vd.filter(i => i.level === 'error').map(i => i.msg).join('; '));
  assert.strictEqual(pk[0].counts.total, t.chon);
  for (const p of pk) {
    const k = await kiem.checkZip(p.bytes);
    assert.ok(k.ok, p.fileName + ': ' + k.errors.map(x => x.msg).join('; '));
  }
});

test('Đầu-cuối: xlsx mẫu thiếu ảnh → có lỗi; thêm ảnh kèm → hết lỗi ảnh', async () => {
  const u8 = docTep('tests/fixtures/xlsx/mau-day-du.xlsx');
  const dem = (banks) => {
    let n = 0;
    banks.forEach((b, i) => { const e = app.taoMuc('x' + i, b); b.questions.forEach(q => { if (app.vdCua(e, q).some(x => /ảnh/.test(x.msg) && x.level === 'error')) n++; }); });
    return n;
  };
  const r1 = await xlsx.parseXlsx(u8, { fileName: 'mau-day-du.xlsx', extraImages: {} });
  const truoc = dem(r1.banks);
  assert.ok(truoc >= 1, 'mẫu có câu thiếu ảnh');
  const anh = { 'hinh 1.png': PNG, 'anh/Hinh2.jpg': PNG, 'khong_co.png': PNG };
  const r2 = await xlsx.parseXlsx(u8, { fileName: 'mau-day-du.xlsx', extraImages: anh });
  assert.ok(dem(r2.banks) < truoc);
});

/* ---------- file đáp án riêng (HDC / KEY) ---------- */

test('chonDeChoKey: tên gốc trùng, gần trùng, một đề duy nhất; mơ hồ → null', () => {
  const de = (...ten) => ten.map((name, i) => ({ id: 'n' + i, name }));
  const chon = (k, ds) => { const d = app.chonDeChoKey(k, ds, docx); return d ? d.name : null; };
  // trùng tên gốc (bỏ HDC / KEY / ĐÁP ÁN…)
  assert.strictEqual(chon('26.12.HH.KS.HDC.0301.docx', de('25.2.TA.ĐGNL1.01.docx', '26.12.HH.KS.0301.docx')), '26.12.HH.KS.0301.docx');
  assert.strictEqual(chon('K4_TN_ĐỀ THI THÁNG 1_KEY.docx', de('K4_TN_ĐỀ THI THÁNG 1.docx', 'K5_TN_ĐỀ THI THÁNG 1.docx')), 'K4_TN_ĐỀ THI THÁNG 1.docx');
  assert.strictEqual(chon('X_KEY.docx', de('Y.docx', 'X.docx')), 'X.docx');
  assert.strictEqual(chon('25.2.TA.ĐGNL1.01.HDC.docx', de('25.2.TA.ĐGNL1.01.docx', '26.12.HH.KS.0301.xlsx')), '25.2.TA.ĐGNL1.01.docx');
  // gần trùng (bỏ từ chung "đề", "chưa"…)
  assert.strictEqual(chon('hdc-thpt.docx', de('de-thpt-chua-dap-an.docx', 'word-tieu-hoc.docx')), 'de-thpt-chua-dap-an.docx');
  assert.strictEqual(chon('Đáp án Toán 10 HK1.docx', de('Đề kiểm tra Toán 10 HK1.docx', 'Đề kiểm tra Lý 10 HK1.docx')), 'Đề kiểm tra Toán 10 HK1.docx');
  // mơ hồ: hai đề giống nhau như nhau / chỉ trùng số → giáo viên tự chọn
  assert.strictEqual(chon('KEY Toán 10.docx', de('Toán 10 đề 1.docx', 'Toán 10 đề 2.docx')), null);
  assert.strictEqual(chon('KEY_1.docx', de('Toán 1.docx', 'Văn 1.docx')), null);
  assert.strictEqual(chon('Đáp án.docx', de('A.docx', 'B.docx')), null);
  // chỉ một file đề → dùng luôn dù tên khác
  assert.strictEqual(chon('Đáp án.docx', de('De giua ky.docx')), 'De giua ky.docx');
  // … trừ khi giao diện tắt bước này (file đề tên khác được nạp SAU file đáp án — có thể là đề khác)
  assert.strictEqual(app.chonDeChoKey('word-thpt-hdc.docx', de('word-tieu-hoc.docx'), docx, false), null);
  assert.strictEqual(app.chonDeChoKey('word-thpt-hdc.docx', de('word-thpt.docx'), docx, false).name, 'word-thpt.docx', 'trùng tên vẫn ghép');
  assert.strictEqual(app.chonDeChoKey('a.docx', [], docx), null);
  assert.strictEqual(app.chonDeChoKey('a.docx', de('a.docx'), null), null);
});

test('File đáp án → điền vào đề: hết lỗi thiếu đáp án, xuất qua kiem-qti đạt (fixture tổng hợp)', async () => {
  const cap = [['word-thpt.docx', 'word-thpt-hdc.docx'], ['word-tieng-anh.docx', 'word-tieng-anh-key.docx'],
    ['word-tieu-hoc.docx', 'word-tieu-hoc-key.docx'], ['de-thpt-chua-dap-an.docx', 'hdc-thpt.docx']];
  for (const [tenDe, tenKey] of cap) {
    if (!fs.existsSync(path.join(GOC, 'tests/fixtures/docx', tenDe)) || !fs.existsSync(path.join(GOC, 'tests/fixtures/docx', tenKey))) continue;
    const rd = await docx.parseDocx(docTep('tests/fixtures/docx/' + tenDe), { fileName: tenDe });
    const rk = await docx.parseDocx(docTep('tests/fixtures/docx/' + tenKey), { fileName: tenKey });
    assert.ok(!rd.keyOnly && rd.banks.length, tenDe);
    assert.ok(rk.keyOnly && rk.key && rk.key.count > 0 && !rk.banks.length, tenKey + ' phải là file chỉ có đáp án');
    // ghép theo tên giữa đề thật và một đề nhiễu
    const dsDe = [{ id: 'n1', name: 'de-khac-hoan-toan.docx' }, { id: 'n2', name: tenDe }];
    assert.strictEqual(app.chonDeChoKey(tenKey, dsDe, docx).id, 'n2', tenKey + ' → ' + tenDe);
    const mucs = rd.banks.map((b, i) => app.taoMuc('n2-' + i, b));
    const loiTruoc = mucs.reduce((s, e) => s + e.bank.questions.filter(q => app.coLoi(e, q)).length, 0);
    assert.ok(loiTruoc > 0, tenDe + ' chưa có đáp án → có câu lỗi');
    const r = app.apDapAnChoMuc(mucs, rk.key, docx);
    assert.ok(r.matched > 0 && r.filled > 0, tenKey + ': ' + JSON.stringify(r));
    mucs.forEach(e => assert.deepStrictEqual(e._vd, {}, 'đệm lỗi đã xoá để soát lại'));
    const loiSau = mucs.reduce((s, e) => s + e.bank.questions.filter(q => app.coLoi(e, q)).length, 0);
    assert.ok(loiSau < loiTruoc, tenDe + ': lỗi ' + loiTruoc + ' → ' + loiSau);
    // áp lần hai: không điền thêm (đã có đáp án → "trùng")
    const r2 = app.apDapAnChoMuc(mucs, rk.key, docx);
    assert.strictEqual(r2.filled, 0, 'áp lại không đổi gì');
    const pk = await qti.buildPackages(app.banksDeXuat(mucs), { target: 'itembank' });
    assert.ok(pk.length, tenDe);
    for (const p of pk) {
      const k = await kiem.checkZip(p.bytes);
      assert.ok(k.ok, p.fileName + ': ' + k.errors.map(x => x.msg).join('; '));
    }
  }
});

/* ---------- lớp bảo vệ khi hiện HTML ---------- */

test('urlNguyHiem / thuocTinhNguyHiem: javascript: ẩn ký tự, data: lạ, on*, id/name, srcset…', () => {
  ['javascript:alert(1)', 'java\tscript:alert(1)', '\x01javascript:x', ' JaVaScRiPt:x', 'java\nscript:x', 'vbscript:x',
    'data:text/html,<script>', 'data:image/svg+xml;base64,PHN2Zz4=', 'd\u0000ata:text/html,x'].forEach(v => assert.ok(app.urlNguyHiem(v), JSON.stringify(v)));
  ['https://a.b/c.png', 'images/a.png', 'data:image/png;base64,iVBOR', 'data:image/jpeg;base64,/9j/', '#x', 'mailto:a@b.c', ''].forEach(v => assert.ok(!app.urlNguyHiem(v), v));
  const bo = (n, v) => app.thuocTinhNguyHiem(n, v);
  assert.ok(bo('onclick', 'x') && bo('ONerror', 'x') && bo('id', 'vung-thong-bao') && bo('name', 'x') && bo('srcset', 'a.png 1x') &&
    bo('srcdoc', '<p>') && bo('form', 'f') && bo('formaction', 'x') && bo('ping', 'https://x'));
  assert.ok(bo('href', 'java\tscript:alert(1)') && bo('xlink:href', 'javascript:x') && bo('src', 'data:text/html,x'));
  assert.ok(bo('style', 'width:expression(alert(1))') && bo('style', 'background:url( "javascript:x")'));
  assert.ok(!bo('href', 'https://canvas.vn') && !bo('src', 'images/a.png') && !bo('style', 'color:red') && !bo('class', 'x') && !bo('alt', 'Hình 1'));
  ['script', 'svg', 'animate', 'set', 'foreignobject', 'use', 'iframe', 'base', 'form'].forEach(t => assert.ok(app.THE_CAM[t], t));
  assert.ok(!app.THE_CAM.math && !app.THE_CAM.img && !app.THE_CAM.table, 'giữ MathML, ảnh, bảng');
});

test('hostCanvas / linkCanvas: địa chỉ Canvas của trường, trang khoá học', () => {
  assert.deepStrictEqual(app.hostCanvas('https://4015.instructure.com'), { origin: 'https://4015.instructure.com', host: '4015.instructure.com' });
  assert.deepStrictEqual(app.hostCanvas('https://4015.instructure.com/'), { origin: 'https://4015.instructure.com', host: '4015.instructure.com' });
  assert.strictEqual(app.hostCanvas(null), null);
  assert.strictEqual(app.hostCanvas('javascript:alert(1)'), null);
  assert.strictEqual(app.linkCanvas('https://4015.instructure.com', '123', 'quizzes'), 'https://4015.instructure.com/courses/123/quizzes');
  assert.strictEqual(app.linkCanvas('https://4015.instructure.com/', '123', 'content_migrations'), 'https://4015.instructure.com/courses/123/content_migrations');
  assert.strictEqual(app.linkCanvas('https://4015.instructure.com', '123', 'question_banks'), 'https://4015.instructure.com/courses/123/question_banks');
  assert.strictEqual(app.linkCanvas('https://4015.instructure.com', '1/../x', 'quizzes'), '');
  assert.strictEqual(app.linkCanvas('https://4015.instructure.com', '1', 'users'), '');
  assert.strictEqual(app.linkCanvas('', '1', 'quizzes'), '');
});

/* ---------- các bước nhập Canvas ---------- */

test('cacBuocNhap: Item Bank (ngân hàng trống, Import Content) và Classic (Ghi đè…, QTI .zip)', () => {
  const a = app.cacBuocNhap('itembank');
  const ta = a.buoc.concat(a.ghiChu).join(' ');
  assert.ok(/Item Bank/.test(a.tieuDe));
  assert.ok(/phải còn trống/.test(ta));
  assert.ok(/Import Content/.test(ta));
  assert.ok(/Ngân Hàng Câu Hỏi/.test(ta) && /cả hai/.test(ta));
  // đúng trình tự Item Banks → Add Bank → mở ngân hàng TRỐNG → ⋮ Options → Import Content → Import; một zip một ngân hàng; Share
  const thuTu = ['Item Banks', 'Add Bank', 'Create Bank', 'phải còn trống', 'Options', 'Import Content', 'Import</span>'].map(s => a.buoc.join(' ').indexOf(s));
  assert.ok(thuTu.every((x, i) => x >= 0 && (i === 0 || x > thuTu[i - 1])), 'trình tự các bước: ' + thuTu);
  assert.ok(/Một file \.zip = một ngân hàng/.test(ta) && /Share/.test(ta) && /Bản cũ/.test(ta));
  const c = app.cacBuocNhap('classic');
  const tc = c.buoc.concat(c.ghiChu).join(' ');
  assert.ok(/Classic/.test(c.tieuDe));
  assert.ok(/Ghi đè nội dung đánh giá với ID trùng khớp/.test(tc));
  assert.ok(/Tập tin \.zip QTI/.test(tc));
  assert.ok(/Nhập Nội Dung Khóa Học/.test(tc));
  assert.ok(/Bản cũ/.test(tc));
  assert.ok(/Không<\/b> đánh dấu/.test(tc));
  // HTML tĩnh hợp lệ: thẻ mở/đóng cân bằng
  [a, c].forEach(x => x.buoc.concat(x.ghiChu).forEach(s => {
    const mo = (s.match(/<(span|b)\b/g) || []).length, dong = (s.match(/<\/(span|b)>/g) || []).length;
    assert.strictEqual(mo, dong, s);
  }));
  assert.ok(app.LOI_DANG_NHAP.state && app.LOI_DANG_NHAP.tu_choi && app.LOI_DANG_NHAP.doi_ma);
  const m = app.loiDangNhap('thieu_scope', 'url:GET|/api/v1/courses url:GET|/api/v1/courses/:course_id/content_migrations/:id <b>x</b>');
  assert.ok(/chưa bật 2 scope/.test(m) && m.includes('GET /api/v1/courses · GET /api/v1/courses/:course_id/content_migrations/:id') && !m.includes('<b>'), m);
  assert.strictEqual(app.loiDangNhap('thieu_scope', ''), app.LOI_DANG_NHAP.thieu_scope);
  assert.strictEqual(app.loiDangNhap('key'), app.LOI_DANG_NHAP.key);
});

/* ---------- index.html / huong-dan.html / launch.json ---------- */

const html = fs.readFileSync(path.join(GOC, 'index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(GOC, 'js/app.js'), 'utf8');

test('index.html: thứ tự script đúng DESIGN §0, mọi file tồn tại, script cổ điển', () => {
  const src = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
  assert.ok(src.every(a => !/type\s*=\s*["']?module/i.test(a)), 'không dùng ES module (file:// chặn)');
  const ds2 = src.map(a => (/src="([^"]+)"/.exec(a) || [])[1]).filter(Boolean);
  assert.deepStrictEqual(ds2, ['core', 'zip', 'html', 'math', 'omml', 'latex', 'docx', 'xlsx', 'scorm', 'qti', 'canvas-api', 'app'].map(n => 'js/' + n + '.js'));
  ds2.forEach(p => assert.ok(fs.existsSync(path.join(GOC, p)), p));
  assert.ok(fs.existsSync(path.join(GOC, 'assets/app.css')));
  assert.ok(fs.existsSync(path.join(GOC, 'assets/logo.svg')), 'logo trường');
  assert.ok(/<html lang="vi">/.test(html));
  assert.ok(/name="viewport"/.test(html));
  assert.ok(/Be\+Vietnam\+Pro/.test(html));
  assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'không có on*="…" trong HTML');
  assert.ok(/href="mau\/Mau-ngan-hang-cau-hoi\.docx"/.test(html) && /href="mau\/Mau-ngan-hang-cau-hoi\.xlsx"/.test(html));
  assert.ok(/href="huong-dan\.html"/.test(html));
});

test('index.html: mọi id mà app.js dùng đều có; label for trỏ đúng; id không trùng', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const dem = {};
  [...html.matchAll(/\sid="([^"]+)"/g)].forEach(m => { dem[m[1]] = (dem[m[1]] || 0) + 1; });
  Object.keys(dem).forEach(k => assert.strictEqual(dem[k], 1, 'id trùng: ' + k));
  const dung = new Set([...appSrc.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map(m => m[1]));
  const tuTao = new Set([...appSrc.matchAll(/\bid: '([a-z0-9-]+)'/g)].map(m => m[1]));     // phần tử app.js tự tạo
  assert.ok(tuTao.has('trung-ten') && tuTao.has('mau-thieu'));
  const thieu = [...dung].filter(i => !ids.has(i) && !tuTao.has(i));
  assert.deepStrictEqual(thieu, [], 'thiếu id trong index.html');
  [...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].forEach(m => assert.ok(ids.has(m[1]), 'label for="' + m[1] + '"'));
  // ô nhập hiển thị có nhãn (label for, aria-label, hoặc nằm trong <label>)
  [...html.matchAll(/<(input|select)\b([^>]*)>/g)].forEach(m => {
    const a = m[2];
    if (/type="(hidden|radio|checkbox)"/.test(a) || /aria-hidden="true"/.test(a)) return;
    const id = (/\sid="([^"]+)"/.exec(a) || [])[1];
    assert.ok(/aria-label=/.test(a) || (id && new RegExp('for="' + id + '"').test(html)), 'ô nhập chưa có nhãn: ' + a);
  });
});

test('index.html: radio tuỳ chọn xuất khớp normalizeOptions của qti', () => {
  const md = qti.normalizeOptions({});
  ['target', 'tfMode', 'math', 'stimulus'].forEach(n => {
    const vals = [...html.matchAll(new RegExp('name="' + n + '" value="([^"]+)"', 'g'))].map(m => m[1]).sort();
    assert.ok(vals.length === 2, n);
    assert.ok(vals.includes(md[n]), n + ' có giá trị mặc định ' + md[n]);
  });
  assert.strictEqual(md.target, 'itembank');
  assert.ok(/name="includeFeedback"/.test(html));
});

test('index.html bước 4: chọn Classic / New Quizzes, ghi đè chỉ cho Classic, gợi ý Canvas của trường, CSP tối thiểu', () => {
  const vals = [...html.matchAll(/name="cv-dich" value="([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(vals, ['classic', 'newquiz']);
  assert.ok(/Chuyển sang New Quizzes khi nhập/.test(html) && /cần thử lần đầu/.test(html));
  assert.ok(/id="cv-hop-ghi-de"[^>]*><input type="checkbox" id="cv-ghi-de"/.test(html), 'ô Ghi đè nằm trong cv-hop-ghi-de');
  assert.ok(/id="cv-truong"/.test(html) && /id="cv-ghi-chu-nq"/.test(html));
  assert.ok(/<meta http-equiv="Content-Security-Policy" content="object-src 'none'; base-uri 'none'">/.test(html));
  // app.js gửi đúng tham số cho hai đích
  assert.ok(/importQuizzesNext: nq/.test(appSrc) && /opts\.target = nq \? 'itembank' : 'classic'/.test(appSrc));
});

test('huong-dan.html: tồn tại, liên kết # nội bộ đều có đích, có các phần bắt buộc', () => {
  const p = path.join(GOC, 'huong-dan.html');
  assert.ok(fs.existsSync(p));
  const hd = fs.readFileSync(p, 'utf8');
  const ids = new Set([...hd.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  [...hd.matchAll(/href="#([^"]+)"/g)].forEach(m => assert.ok(ids.has(m[1]), 'thiếu id ' + m[1]));
  assert.ok(ids.has('nhap-canvas'), 'app.js liên kết tới #nhap-canvas');
  ['NGÂN HÀNG:', 'Đáp án:', 'ĐOẠN DẪN:', 'Lời giải:', 'BẢNG ĐÁP ÁN', '[[', 'Nội dung câu hỏi', 'Ghi đè nội dung đánh giá với ID trùng khớp',
    'Import Content', 'MathType', 'Bản cũ', 'Tập tin .zip QTI'].forEach(s => assert.ok(hd.includes(s), 'thiếu: ' + s));
  assert.ok(/<html lang="vi">/.test(hd) && /assets\/app\.css/.test(hd));
});

test('.claude/launch.json: cấu hình canvas-nganhang chạy node server.js cổng 8787', () => {
  const j = JSON.parse(fs.readFileSync(path.join(GOC, '.claude/launch.json'), 'utf8'));
  const c = j.configurations.find(x => x.name === 'canvas-nganhang');
  assert.ok(c);
  assert.strictEqual(c.runtimeExecutable, 'node');
  assert.deepStrictEqual(c.runtimeArgs, ['server.js']);
  assert.strictEqual(c.port, 8787);
});

test('Nạp kiểu trình duyệt (vm, không có module/require): mọi script theo thứ tự, NH.app có đủ hàm', () => {
  const ctx = { console, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Promise, setTimeout, clearTimeout, URL };
  ctx.self = ctx;
  vm.createContext(ctx);
  ['core', 'zip', 'html', 'math', 'omml', 'latex', 'docx', 'xlsx', 'scorm', 'qti', 'canvas-api', 'app'].forEach(n => {
    vm.runInContext(fs.readFileSync(path.join(GOC, 'js', n + '.js'), 'utf8'), ctx, { filename: n + '.js' });
  });
  assert.ok(ctx.NH.app && typeof ctx.NH.app.banksDeXuat === 'function');
  assert.strictEqual(ctx.NH.app.fmtSo(2.5), '2,5');
  assert.strictEqual(ctx.NH.app.phanLoaiZip(['word/document.xml']), 'docx');
});

test('Mã nguồn: không có ký tự U+2028/U+2029/điều khiển lạ trong các file giao diện', () => {
  const xau = new RegExp('[' + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(0xFEFF) + ']');
  ['js/app.js', 'index.html', 'huong-dan.html', 'assets/app.css'].forEach(f => {
    assert.ok(!xau.test(fs.readFileSync(path.join(GOC, f), 'utf8')), f);
  });
});

/* ---------- chạy ---------- */
(async () => {
  let dat = 0, hong = 0;
  for (const t of ds) {
    try { await t.fn(); dat++; console.log('  ĐẠT  ' + t.ten); }
    catch (e) { hong++; console.log('  HỎNG ' + t.ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log('\napp: ' + dat + '/' + ds.length + ' đạt');
  process.exitCode = hong ? 1 : 0;
})();
