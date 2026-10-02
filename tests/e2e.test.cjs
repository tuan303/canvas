/* tests/e2e.test.cjs — kiểm thử đầu-cuối: file nguồn → bộ đọc (docx/xlsx/scorm) → lọc như giao diện (app.banksDeXuat)
 * → qti.buildPackages (itembank|classic × tfMode dropdowns|split × math mathml|image) → tests/kiem-qti.cjs.
 * Điều chứng minh chính: đáp án Canvas sẽ CHẤM ĐÚNG (mô phỏng importer + grade() của bộ kiểm tra độc lập)
 * trùng khớp đáp án giáo viên đã đánh dấu trong file nguồn, cho MỌI câu xuất được.
 * Nguồn: (a) 2 file mẫu trong mau/, (b) mọi C:/Users/Administrator/Downloads/*SCORM*.zip (nếu có),
 *        (c) fixture docx/xlsx trong tests/fixtures/. Chạy: node tests/e2e.test.cjs [-v] */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const GOC = path.resolve(__dirname, '..');
const core = require('../js/core.js');
const html = require('../js/html.js');
const docx = require('../js/docx.js');
const xlsx = require('../js/xlsx.js');
const scorm = require('../js/scorm.js');
const qti = require('../js/qti.js');
const app = require('../js/app.js');
const kiem = require('./kiem-qti.cjs');

const CHI_TIET = process.argv.includes('-v');
const THU_MUC_SCORM = 'C:/Users/Administrator/Downloads';

/* ---------------- danh sách nguồn ---------------- */
function dsNguon() {
  const out = [];
  const mau = path.join(GOC, 'mau');
  ['Mau-ngan-hang-cau-hoi.docx', 'Mau-ngan-hang-cau-hoi.xlsx'].forEach(f => out.push({ nhom: 'mau', file: path.join(mau, f), sach: true }));
  try {
    fs.readdirSync(THU_MUC_SCORM).filter(f => /SCORM.*\.zip$/i.test(f)).sort()
      .forEach(f => out.push({ nhom: 'scorm', file: path.join(THU_MUC_SCORM, f), sach: true }));
  } catch (e) { /* máy khác: không có thư mục Downloads */ }
  ['docx', 'xlsx'].forEach(d => {
    const td = path.join(GOC, 'tests', 'fixtures', d);
    fs.readdirSync(td).filter(f => new RegExp('\\.' + d + '$', 'i').test(f)).sort()
      .forEach(f => out.push({ nhom: 'fixture-' + d, file: path.join(td, f), sach: false }));
  });
  // Excel tự dựng trong bộ nhớ: chữ thuần có dấu so sánh / & / tiếng Việt ở mọi ô text thuần (đáp án, ô chọn, vế phải…)
  out.push({ nhom: 'tu-dung', file: 'dau-so-sanh.xlsx', sach: true, tao: taoXlsxDauSoSanh });
  return out;
}

async function taoXlsxDauSoSanh() {
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

async function docNguon(file, tao) {
  const u8 = tao ? await tao() : new Uint8Array(fs.readFileSync(file)), ten = path.basename(file);
  if (/\.docx$/i.test(ten)) return docx.parseDocx(u8, { fileName: ten });
  if (/\.xlsx$/i.test(ten)) return xlsx.parseXlsx(u8, { fileName: ten });
  return scorm.parseScorm(u8, { fileName: ten });
}

const TO_HOP = [];
['itembank', 'classic'].forEach(target => ['dropdowns', 'split'].forEach(tfMode => ['mathml', 'image'].forEach(math => TO_HOP.push({ target, tfMode, math }))));
// thêm: không chèn đoạn dẫn, không lời giải, tên câu = đầu nội dung
TO_HOP.push({ target: 'itembank', tfMode: 'dropdowns', math: 'mathml', stimulus: 'none', includeFeedback: false, numberInTitle: false });

/* ---------------- tiện ích so sánh ---------------- */
const coThe = s => /<\/?[A-Za-z][A-Za-z0-9:-]*(\s[^<>]*)?\/?>/.test(String(s));
const chuan = s => core.nfc(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim();
// chữ thuần như qti đưa vào ô text/plain (dropdown, ô điền, vế phải, trả lời ngắn)
const thuan = s => chuan(coThe(s) ? html.toPlainText(String(s)) : s);
// chữ hiển thị của một mảnh HTML theo cách bộ kiểm tra đọc (bỏ thẻ, giải thực thể)
const TT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(160) };
const boThe = h => chuan(String(h).replace(/<\/?[A-Za-z][^>]*>/g, ' ').replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (TT[e] != null ? TT[e] : m)));
const gan = (a, b) => Math.abs(a - b) < 1e-6;
const pad2 = n => (n < 10 ? '0' : '') + n;
const DUNG = 'Đúng', SAI = 'Sai';

function chamDu(item, resp, ten) {
  const g = kiem.grade(item, resp);
  assert.ok(g, ten + ': grade() trả null với ' + JSON.stringify(resp));
  assert.ok(gan(g.score, item.points), ten + ': trả lời đúng theo giáo viên ' + JSON.stringify(resp) + ' chỉ được ' + g.score + '/' + item.points + 'đ');
}
function chamThieu(item, resp, ten) {
  const g = kiem.grade(item, resp);
  assert.ok(g && g.score < item.points - 1e-9, ten + ': trả lời SAI ' + JSON.stringify(resp) + ' vẫn được trọn điểm');
}

/*
 * Đối chiếu một câu nguồn với (các) item mà bộ kiểm tra thấy trong gói. Trả số phép chấm đã mô phỏng.
 * q: câu nguồn; ids: item theo ident; tien: ident ngân hàng; NN: vị trí 1-based; opt: tổ hợp tuỳ chọn.
 */
function doiChieu(q, NN, tien, ids, opt) {
  const ident = tien + '_q' + pad2(NN), ten = '[' + opt.target + '/' + opt.tfMode + '/' + opt.math + '] ' + ident + ' (' + q.title + ', ' + q.type + ')';
  let soCham = 0;
  const lay = (id) => { const it = ids.get(id); assert.ok(it, ten + ': thiếu item "' + id + '" trong gói'); ids.delete(id); return it; };

  if (q.type === 'tf' && opt.tfMode === 'split') {
    let tong = 0;
    q.statements.forEach((s, i) => {
      const it = lay(ident + '_s' + (i + 1));
      assert.strictEqual(it.canvasType, 'multiple_choice_question', ten + ' ý ' + (i + 1));
      const dung = it.correct.choices.filter(c => c.correct).map(c => c.text);
      assert.deepStrictEqual(dung, [s.value ? DUNG : SAI], ten + ' ý ' + s.key + ': Canvas chấm đúng ' + JSON.stringify(dung));
      assert.deepStrictEqual(it.correct.choices.map(c => c.text), [DUNG, SAI], ten + ' ý ' + s.key + ': lựa chọn');
      const idDung = it.correct.choices.find(c => c.text === (s.value ? DUNG : SAI)).id;
      const idSai = it.correct.choices.find(c => c.text !== (s.value ? DUNG : SAI)).id;
      chamDu(it, idDung, ten); chamThieu(it, idSai, ten); soCham += 2;
      tong += it.points;
    });
    assert.ok(Math.abs(tong - q.points) < 1e-3, ten + ': tổng điểm các ý ' + tong + ' ≠ ' + q.points);
    return soCham;
  }

  const it = lay(ident);
  const diem = q.type === 'text' ? 0 : q.points;
  assert.ok(gan(it.points, diem), ten + ': điểm ' + it.points + ' ≠ ' + diem);

  switch (q.type) {
    case 'mc':
    case 'ma': {
      assert.strictEqual(it.canvasType, q.type === 'mc' ? 'multiple_choice_question' : 'multiple_answers_question', ten);
      const ch = it.correct.choices;
      assert.strictEqual(ch.length, q.choices.length, ten + ': số phương án');
      // thứ tự hiển thị giữ nguyên → vị trí đáp án đúng phải trùng
      const viTriNguon = q.choices.map((c, i) => c.correct === true ? i : -1).filter(i => i >= 0);
      const viTriCanvas = ch.map((c, i) => c.correct ? i : -1).filter(i => i >= 0);
      assert.deepStrictEqual(viTriCanvas, viTriNguon, ten + ': Canvas coi đúng vị trí ' + viTriCanvas + ', giáo viên đánh dấu ' + viTriNguon);
      // chữ phương án (khi so được: không ảnh, công thức còn là MathML)
      q.choices.forEach((c, i) => {
        if (/<img\b/i.test(c.html) || (opt.math === 'image' && /<math\b/i.test(c.html))) return;
        assert.strictEqual(ch[i].text, boThe(c.html), ten + ': chữ phương án ' + c.id);
      });
      const idDung = ch.filter(c => c.correct).map(c => c.id), idSai = ch.filter(c => !c.correct).map(c => c.id);
      if (q.type === 'mc') { chamDu(it, idDung[0], ten); idSai.forEach(x => chamThieu(it, x, ten)); soCham += 1 + idSai.length; }
      else {
        chamDu(it, idDung, ten); soCham++;
        if (idSai.length) { chamThieu(it, idDung.concat(idSai[0]), ten); soCham++; }
        if (idDung.length > 1) { chamThieu(it, idDung.slice(1), ten); soCham++; }
      }
      break;
    }
    case 'tf': { // dropdowns: mỗi ý một ô Đúng/Sai
      assert.strictEqual(it.canvasType, 'multiple_dropdowns_question', ten);
      const o = it.correct.blanks, khoa = Object.keys(o);
      assert.strictEqual(khoa.length, q.statements.length, ten + ': số ô = số ý');
      const resp = {};
      q.statements.forEach((s, i) => {
        const b = o[khoa[i]];
        assert.deepStrictEqual(b.options.map(x => x.text), [DUNG, SAI], ten + ' ý ' + s.key);
        const dung = b.options.find(x => x.id === b.correct);
        assert.strictEqual(dung && dung.text, s.value ? DUNG : SAI, ten + ' ý ' + s.key + ': Canvas chấm đúng "' + (dung && dung.text) + '"');
        resp[khoa[i]] = b.correct;
      });
      chamDu(it, resp, ten); soCham++;
      const sai = Object.assign({}, resp), b0 = o[khoa[0]];
      sai[khoa[0]] = b0.options.find(x => x.id !== b0.correct).id;
      chamThieu(it, sai, ten); soCham++;
      break;
    }
    case 'short': {
      assert.strictEqual(it.canvasType, 'short_answer_question', ten);
      const nguon = q.answers.map(thuan).filter(Boolean);
      assert.ok(nguon.length, ten + ': nguồn không có đáp án');
      nguon.forEach(a => { chamDu(it, a, ten); soCham++; });
      // biến thể thập phân tự sinh cũng được chấm đúng
      nguon.filter(a => /\d,\d/.test(a)).forEach(a => { chamDu(it, a.replace(/(\d),(?=\d)/g, '$1.'), ten); soCham++; });
      chamThieu(it, 'zz-khong-phai-dap-an-zz', ten); soCham++;
      // Canvas không chấp nhận gì ngoài biến thể của đáp án nguồn
      const bienThe = core.answerVariants(nguon).map(x => x.toLowerCase());
      it.correct.accepted.forEach(a => assert.ok(bienThe.includes(chuan(a).toLowerCase()), ten + ': Canvas chấp nhận "' + a + '" không có trong nguồn'));
      break;
    }
    case 'num': {
      assert.strictEqual(it.canvasType, 'numerical_question', ten);
      const n = q.numeric, so = x => String(+x.toFixed(10));
      if (n.exact !== undefined) {
        const m = n.margin || 0;
        chamDu(it, so(n.exact), ten); soCham++;
        if (m > 0) { chamDu(it, so(n.exact + m / 2), ten); chamDu(it, so(n.exact - m / 2), ten); soCham += 2; }
        chamThieu(it, so(n.exact + 2 * m + 1), ten); soCham++;
      } else {
        chamDu(it, so(n.min), ten); chamDu(it, so(n.max), ten); chamDu(it, so((n.min + n.max) / 2), ten);
        chamThieu(it, so(n.min - (n.max - n.min) - 1), ten); soCham += 4;
      }
      break;
    }
    case 'blanks': {
      assert.strictEqual(it.canvasType, 'fill_in_multiple_blanks_question', ten);
      const o = it.correct.blanks;
      assert.deepStrictEqual(Object.keys(o), q.blanks.map(b => b.id), ten + ': mã ô');
      const resp = {};
      q.blanks.forEach(b => {
        const acc = b.accepts.map(thuan).filter(Boolean);
        acc.forEach(a => assert.ok(o[b.id].some(x => chuan(x).toLowerCase() === a.toLowerCase()), ten + ' ô ' + b.id + ': thiếu đáp án "' + a + '"'));
        resp[b.id] = acc[0];
      });
      chamDu(it, resp, ten); soCham++;
      q.blanks.forEach(b => b.accepts.map(thuan).filter(Boolean).slice(1).forEach(a => { chamDu(it, Object.assign({}, resp, { [b.id]: a }), ten); soCham++; }));
      chamThieu(it, Object.assign({}, resp, { [q.blanks[0].id]: 'zz-sai-zz' }), ten); soCham++;
      break;
    }
    case 'dropdowns': {
      assert.strictEqual(it.canvasType, 'multiple_dropdowns_question', ten);
      const o = it.correct.blanks;
      assert.deepStrictEqual(Object.keys(o), q.dropdowns.map(b => b.id), ten + ': mã ô');
      const resp = {};
      q.dropdowns.forEach(b => {
        const op = b.options.map(thuan);
        assert.deepStrictEqual(o[b.id].options.map(x => chuan(x.text)), op, ten + ' ô ' + b.id + ': lựa chọn');
        const dung = o[b.id].options.find(x => x.id === o[b.id].correct);
        assert.strictEqual(dung && chuan(dung.text), op[b.correct], ten + ' ô ' + b.id + ': lựa chọn đúng');
        resp[b.id] = dung.id;
      });
      chamDu(it, resp, ten); soCham++;
      const b0 = q.dropdowns[0];
      chamThieu(it, Object.assign({}, resp, { [b0.id]: o[b0.id].options.find(x => x.id !== o[b0.id].correct).id }), ten); soCham++;
      break;
    }
    case 'matching': {
      assert.strictEqual(it.canvasType, 'matching_question', ten);
      const c = it.correct;
      assert.strictEqual(c.pairs.length, q.pairs.length, ten + ': số cặp');
      const resp = {};
      q.pairs.forEach((p, i) => {
        const phai = thuan(p.right);
        assert.strictEqual(chuan(c.pairs[i].right), phai, ten + ' cặp ' + (i + 1) + ': Canvas ghép "' + c.pairs[i].right + '"');
        if (!/<img\b/i.test(p.left) && !(opt.math === 'image' && /<math\b/i.test(p.left))) assert.strictEqual(chuan(c.pairs[i].left), boThe(p.left), ten + ' cặp ' + (i + 1) + ': vế trái');
        const r = c.rights.find(x => chuan(x.text) === phai);
        assert.ok(r, ten + ': không thấy vế phải "' + phai + '"');
        resp[c.pairs[i].leftId] = r.id;
      });
      // vế phải gây nhiễu = nhiễu nguồn (bỏ trùng với vế phải đúng)
      const dungPhai = q.pairs.map(p => thuan(p.right));
      const nhieu = [...new Set((q.distractors || []).map(thuan).filter(x => x && !dungPhai.includes(x)))].sort();
      assert.deepStrictEqual(c.distractors.map(chuan).sort(), nhieu, ten + ': vế phải gây nhiễu');
      chamDu(it, resp, ten); soCham++;
      const khac = c.rights.find(x => chuan(x.text) !== dungPhai[0]);
      if (khac) { chamThieu(it, Object.assign({}, resp, { [c.pairs[0].leftId]: khac.id }), ten); soCham++; }
      break;
    }
    case 'essay':
      assert.strictEqual(it.canvasType, 'essay_question', ten);
      assert.strictEqual(it.correct, null, ten);
      break;
    case 'text':
      assert.strictEqual(it.canvasType, 'text_only_question', ten);
      break;
    default:
      assert.fail(ten + ': loại lạ ' + q.type);
  }
  return soCham;
}

/* ---------------- chạy ---------------- */
const tk = { nguon: 0, nganHang: 0, cau: 0, xuat: 0, loai: 0, theoLoai: {}, goi: 0, item: 0, cham: 0, toHop: 0 };
const theoNhom = {};
const hong = [];

async function motNguon(ng) {
  const ten = path.basename(ng.file);
  const r = await docNguon(ng.file, ng.tao);
  assert.ok(r && Array.isArray(r.banks), ten + ': bộ đọc không trả banks');
  const entries = r.banks.map((b, i) => app.taoMuc(ten + '#' + i, b));
  const banksX = app.banksDeXuat(entries);
  let cau = 0, xuat = 0;
  entries.forEach(e => e.bank.questions.forEach(q => {
    cau++;
    if (app.duocXuat(e, q)) { xuat++; tk.theoLoai[q.type] = (tk.theoLoai[q.type] || 0) + 1; }
  }));
  if (ng.sach) {
    const loi = [];
    entries.forEach(e => e.bank.questions.forEach(q => app.vdCua(e, q).filter(i => i.level === 'error').forEach(i => loi.push(i.msg))));
    assert.deepStrictEqual(loi, [], ten + ': nguồn sạch nhưng có câu bị lỗi');
    assert.ok(xuat > 0, ten + ': không có câu nào');
  }
  tk.nguon++; tk.nganHang += r.banks.length; tk.cau += cau; tk.xuat += xuat; tk.loai += cau - xuat;
  const n = theoNhom[ng.nhom] = theoNhom[ng.nhom] || { nguon: 0, cau: 0, xuat: 0, goi: 0, item: 0, cham: 0 };
  n.nguon++; n.cau += cau; n.xuat += xuat;
  if (!banksX.length) return;

  for (const opt of TO_HOP) {
    tk.toHop++;
    const pk = await qti.buildPackages(banksX, opt);
    const loiQti = app.locVanDeXuat(pk.issues).filter(i => i.level === 'error');
    assert.deepStrictEqual(loiQti.map(i => i.msg), [], ten + ' ' + JSON.stringify(opt) + ': qti báo lỗi với câu đã lọc');
    assert.strictEqual(pk.length, opt.target === 'classic' ? 1 : banksX.length, ten + ': số gói');
    // gom item theo ident ngân hàng, đối chiếu theo tiêu đề
    const raNH = [];
    for (const p of pk) {
      const k = await kiem.checkZip(p.bytes, { layout: opt.target });
      assert.ok(k.ok && !k.errors.length, ten + ' ' + JSON.stringify(opt) + ' ' + p.fileName + ':\n' + kiem.formatReport(k));
      assert.deepStrictEqual(k.warnings.map(w => w.code + ': ' + w.msg), [], ten + ' ' + JSON.stringify(opt) + ' ' + p.fileName + ': cảnh báo');
      tk.goi++; n.goi++;
      if (opt.target === 'classic') k.banks.forEach(b => raNH.push({ tien: b.ident, title: b.title, items: b.items }));
      else k.quizzes.forEach(q => raNH.push({ tien: q.ident.replace(/_quiz$/, ''), title: q.title, items: q.items }));
    }
    assert.strictEqual(raNH.length, banksX.length, ten + ': số ngân hàng trong gói');
    banksX.forEach((b, bi) => {
      const tieuDe = chuan(b.title);
      const cung = raNH.filter(x => chuan(x.title) === tieuDe);
      const nh = cung.length === 1 ? cung[0] : raNH[bi];
      assert.ok(nh, ten + ': không thấy ngân hàng "' + b.title + '"');
      const ids = new Map(nh.items.map(it => [it.ident, it]));
      b.questions.forEach((q, i) => {
        if (!q) return;
        const c = doiChieu(q, i + 1, nh.tien, ids, opt);
        tk.cham += c; n.cham += c;
      });
      // không có item thừa (câu bị loại / bỏ chọn không lọt vào gói)
      assert.deepStrictEqual([...ids.keys()], [], ten + ' "' + b.title + '": item thừa');
      tk.item += nh.items.length; n.item += nh.items.length;
    });
  }
  if (CHI_TIET) console.log('    ' + ten + ': ' + xuat + '/' + cau + ' câu xuất được');
}

(async () => {
  const ds = dsNguon();
  assert.ok(ds.filter(x => x.nhom === 'mau').every(x => fs.existsSync(x.file)), 'thiếu file mẫu trong mau/ — chạy node tools/tao-mau.cjs');
  for (const ng of ds) {
    try { await motNguon(ng); console.log('  ĐẠT  ' + ng.nhom + ': ' + path.basename(ng.file)); }
    catch (e) { hong.push(path.basename(ng.file)); console.log('  HỎNG ' + ng.nhom + ': ' + path.basename(ng.file) + '\n' + String(e && e.stack || e).split('\n').slice(0, 30).map(l => '       ' + l).join('\n')); }
  }
  console.log('\n  Theo nhóm nguồn:');
  Object.keys(theoNhom).forEach(k => { const n = theoNhom[k]; console.log('    ' + k + ': ' + n.nguon + ' file, ' + n.xuat + '/' + n.cau + ' câu xuất được, ' + n.goi + ' gói, ' + n.item + ' item, ' + n.cham + ' phép chấm'); });
  console.log('  Loại câu đã đối chiếu: ' + Object.keys(tk.theoLoai).map(k => k + ' ' + tk.theoLoai[k]).join(', '));
  console.log('  Tổng: ' + tk.nguon + ' nguồn, ' + tk.nganHang + ' ngân hàng, ' + tk.xuat + '/' + tk.cau + ' câu xuất (' + tk.loai + ' câu lỗi cố ý bị loại), ' +
    TO_HOP.length + ' tổ hợp tuỳ chọn, ' + tk.goi + ' gói zip, ' + tk.item + ' item, ' + tk.cham + ' phép chấm mô phỏng — 0 lỗi kiểm tra');
  if (hong.length) { console.log('HỎNG ' + hong.length + ' nguồn (e2e): ' + hong.join(', ')); process.exitCode = 1; }
  else console.log('ĐẠT tất cả ' + tk.nguon + ' nguồn (e2e)');
})().catch(e => { console.error(e); process.exitCode = 1; });
