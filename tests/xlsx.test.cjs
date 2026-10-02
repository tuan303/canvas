/* tests/xlsx.test.cjs — kiểm thử js/xlsx.js (chạy: node tests/xlsx.test.cjs)
 * File .xlsx kiểm thử được dựng bằng tests/fixtures/xlsx/tao-xlsx.cjs và ghi ra tests/fixtures/xlsx/*.xlsx để mở xem bằng Excel. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const core = require('../js/core.js');
const zip = require('../js/zip.js');
const xlsx = require('../js/xlsx.js');
const { taoXlsx, taoPng, taoJpgGia, taoEmfGia } = require('./fixtures/xlsx/tao-xlsx.cjs');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }
const THU_MUC = path.join(__dirname, 'fixtures', 'xlsx');

// latex.js giả: đủ để thấy chỗ nào được đổi sang MathML
const LATEX_GIA = { toMathML: (tex) => { if (tex === 'loi') throw new Error('cú pháp sai'); return '<math><mi>' + tex + '</mi></math>'; } };

function img(ten, w) { return '<img src="images/' + ten + '" alt="" style="max-width:100%;height:auto"' + (w ? ' width="' + w + '"' : '') + '>'; }
function I(level, msg, qid) { return qid ? { level, msg, qid } : { level, msg }; }
// câu đầy đủ với giá trị mặc định
function Q(o) {
  const { sheet, row, ...rest } = o;
  return Object.assign({ stimulus: '', feedback: '', meta: { level: '', topic: '', part: '', tags: [] }, issues: [] }, rest,
    { src: { sheet: sheet || 'Câu hỏi', row } });
}
function soSanh(thuc, mong) {
  try { assert.deepStrictEqual(thuc, mong); } catch (e) { e.message = mong.id + ' (dòng ' + mong.src.row + '): ' + e.message; throw e; }
}

/* ---------------- Dữ liệu mẫu chính ---------------- */
// Cột: A STT | B Loại câu | C Nội dung | D Ảnh | E Đáp án | F A | G B | H C | I D | J Ghi chú | K Điểm | L Lời giải | M Ngân hàng | N Mức độ | O Chủ đề
const COT = ['stt', 'loai', 'nd', 'anh', 'da', 'A', 'B', 'C', 'D', 'ghi', 'diem', 'lg', 'nh', 'md', 'cd'];
function dong(o) { return COT.map(k => (o[k] === undefined ? null : o[k])); }

const PNG_DO = taoPng(4, 3, [220, 20, 60]);
const PNG_XANH = taoPng(2, 2, [0, 160, 0]);
const PNG_LAM = taoPng(3, 3, [0, 0, 200]);
const PNG_LOGO = taoPng(5, 5, [0, 0, 0]);
const PNG_VANG = taoPng(2, 1, [240, 180, 0]);
const PNG_PHU = taoPng(1, 1, [9, 9, 9]);
const JPG = taoJpgGia();

function specChinh() {
  const huongDan = [];
  for (let r = 1; r <= 11; r++) huongDan.push([r, [r === 5 ? 'Nội dung câu hỏi' : 'Dòng hướng dẫn ' + r, r === 5 ? 'ghi đề bài vào đây' : null]]);
  huongDan.push([12, ['Nội dung câu hỏi', 'Loại câu', 'Đáp án']]); // quá 10 dòng đầu → không phải tiêu đề
  const rows = [
    [1, ['NGÂN HÀNG CÂU HỎI TOÁN 10']],
    [3, ['STT', 'Loại câu\n(chọn từ danh sách)', 'Nội dung câu hỏi', 'Ảnh', 'Đáp án', 'A', 'B', 'C', 'D', 'Ghi chú', 'Điểm', 'Lời giải', 'Ngân hàng', 'Mức độ', 'Chủ đề']],
    [4, dong({
      stt: 1, loai: 'TN – Một đáp án',
      nd: { rich: [{ t: 'Giá trị của ' }, { t: 'x', i: true }, { t: '2', sup: true }, { t: ' khi ' }, { t: 'x = 0,5', b: true }, { t: ' là:' }] },
      da: 'A', A: { n: 0.25 }, B: { rich: [{ t: '0,5', u: true }] }, C: { inline: 'C. 1' }, D: '2,5', ghi: 'ghi chú bỏ qua',
      diem: { n: 0.5 }, lg: { rich: [{ t: 'Thay ' }, { t: 'x', i: true }, { t: ' = 0,5:\n' }, { t: '$x^2 = 0,25$' }] },
      nh: 'Toán 10 – Chương 1', md: 'NB', cd: 'Hàm số'
    })],
    [5, dong({ stt: { blank: true }, nd: { blank: true }, A: { blank: true } })],
    [6, dong({ stt: 2, loai: 'NĐ – Nhiều đáp án', nd: 'Chọn các số nguyên tố:', A: '2', B: '4', C: '5', D: '9', da: 'A, C', diem: '1' })],
    [7, dong({
      stt: 3, loai: 'ĐS – Đúng/Sai', nd: 'Xét hàm số y = x²:', da: 'ĐSĐS', diem: '1đ',
      A: 'a) Đồ thị đi qua gốc toạ độ.', B: 'Hàm số đồng biến trên ℝ.', C: 'Hàm số có giá trị nhỏ nhất bằng 0.', D: 'Hàm số nghịch biến trên (0; +∞).'
    })],
    [8, dong({
      stt: 4, loai: 'Đúng/Sai', nd: 'Xét các phát biểu:', da: 'a-Đ,b-S,c-Đ,d-S',
      A: 'Sắt là kim loại.', B: 'Nước sôi ở 50 °C.', C: { rich: [{ t: 'H' }, { t: '2', sub: true }, { t: 'O là nước.' }] }, D: 'd) Muối ăn là NaOH.'
    })],
    [9, dong({ stt: 5, loai: 'TLN', nd: 'Tính $\\frac{8}{3}$ (làm tròn đến hàng phần trăm).', da: '8/3; 2,67' })],
    [10, dong({ stt: 6, loai: 'SỐ – Điền số', nd: 'Chiều dài (cm)?', da: '12,5 ± 0,1' })],
    [11, dong({ stt: 7, loai: 'SỐ', nd: 'Nghiệm nằm trong khoảng nào?', da: '1,5 .. 2', diem: { f: '0.5*2', v: '1' } })],
    [12, dong({ stt: 8, loai: 'so', nd: 'Một phần tư bằng bao nhiêu?', da: { n: 0.25 }, diem: '0,25' })],
    [13, dong({ stt: 9, loai: 'ĐIỀN – Điền khuyết', nd: { rich: [{ t: 'Thủ đô của ' }, { t: 'Việt Nam', b: true }, { t: ' là [[Hà ' }, { t: 'Nội|Ha Noi]], của Pháp là [[Paris]].' }] } })],
    [14, dong({ stt: 10, loai: 'CHỌN – Chọn từ danh sách', nd: '[[*Hà Nội|Huế|Đà Nẵng]] là thủ đô của Việt Nam.' })],
    [15, dong({ stt: 11, loai: 'GHÉP – Ghép nối', nd: 'Ghép thủ đô với quốc gia:', A: 'Hà Nội => Việt Nam', B: { rich: [{ t: 'Paris', b: true }, { t: ' -> Pháp' }] }, C: 'Tokyo → Nhật Bản', D: 'Lào' })],
    [16, dong({ stt: 12, loai: 'TL – Tự luận', nd: 'Chứng minh rằng tổng ba góc của tam giác bằng 180°.', lg: 'Ý 1: 0,5 điểm\nÝ 2: 0,5 điểm', diem: 2, md: 'Vận dụng cao' })],
    [17, dong({ loai: 'ĐOẠN – Đoạn dẫn', nd: 'Đọc đoạn văn sau và trả lời các câu 13–14:\nHà Nội là thủ đô của Việt Nam.', nh: 'Toán 10 – Chương 2' })],
    [18, dong({ stt: 13, nd: 'Thủ đô của Việt Nam là?', A: 'Hà Nội', B: 'Huế', da: 'a' })],
    [19, dong({ stt: 14, nd: 'Thành phố nào thuộc Việt Nam?', A: 'Hà Nội', B: 'Bangkok', C: 'Huế', da: 'AC', md: 'TH – Thông hiểu' })],
    [20, dong({ loai: 'ĐOẠN', nd: 'HẾT' })],
    [21, dong({ stt: 15, nd: 'Đúng hay sai?', A: 'p', B: 'q', C: 'r', D: 's', da: 'ĐSĐS' })],
    [22, dong({ stt: 16, nd: 'Thủ đô của Việt Nam?', da: 'Hà Nội', md: 'xyz' })],
    [23, dong({ stt: 17, nd: 'Nghiệm thuộc khoảng?', da: '1,5 .. 2' })],
    [24, dong({ stt: 18, nd: 'Trình bày cảm nghĩ.' })],
    [25, dong({ stt: 19, nd: 'Điền: [[x]]' })],
    [26, dong({ stt: 20, nd: '[[*a|b]] và [[c|*d]]' })],
    [27, dong({ stt: 21, nd: 'Ghép:', A: 'x => 1', B: 'y => 2' })],
    [28, dong({ stt: 13, loai: 'TN', nd: { f: '"Tính 1+1"', str: 'Tính 1+1' }, A: { f: '1+0', v: '1' }, B: { f: '1+1', v: '2' }, da: 'B', nh: 'toán 10 –  chương 1' })],
    [29, dong({ stt: 14, loai: 'TN – Một đáp án', nd: 'Câu gộp 1', A: 'a1', B: 'b1', da: 'A', diem: { n: 0.5 } })],
    [30, dong({ stt: 15, nd: 'Câu gộp 2', A: 'a2', B: 'b2', da: 'B', loai: { blank: true }, diem: { blank: true } })],
    [31, dong({ stt: 16, nd: 'Câu gộp 3', A: 'a3', B: 'b3', da: 'A' })],
    [32, dong({ stt: 17, loai: 'TN', nd: 'Hình nào là hình tròn?', A: 'Hình vuông', B: { blank: true }, da: 'B' })],
    [34, dong({ stt: 18, loai: 'TLN', nd: 'Quan sát hai hình.', anh: 'hinh 1.png; thu_muc/Hinh2.JPG', da: '2' })],
    [35, dong({ stt: 19, loai: 'TL', nd: 'Câu thiếu ảnh', anh: 'khong_co.png' })],
    [36, dong({ stt: 20, loai: 'TN', nd: 'Ảnh đặt trong ô', anh: { img: PNG_VANG }, A: 'x', B: 'y', da: 'A' })],
    [37, dong({ loai: 'TN', nd: 'Câu lỗi đáp án', A: 'x', B: 'y', da: 'E' })],
    [38, dong({ loai: 'XYZ', nd: 'Câu loại lạ', da: 'abc', diem: 'abc' })],
    [39, dong({ loai: 'TN', nd: 'Chọn TRUE', A: 'p', B: 'q', C: { e: '#N/A', f: 'VLOOKUP(1,A1:A2,2,0)' }, D: { bool: true }, da: 'D' })],
    [40, dong({ loai: 'TN', nd: { f: 'A1' }, A: '1', B: '2', da: 'A' })],
    [41, dong({ loai: 'TL', nd: 'A_x000D_\nB _x005F_x000D_' })],
    [42, dong({ stt: 42 })],
    [43, dong({ loai: 'TN' })],
    [44, dong({ loai: 'TL', nd: 'Giá $5 và $10, ký hiệu \\$; $a+b$ và $loi$' })],
    [45, dong({ loai: 'TL', nd: { rich: [{ t: 'Đậm ', b: true }, { t: 'liền', b: true }, { t: ' thường' }] } })]
  ];
  return {
    sheets: [
      { name: 'Hướng dẫn', rows: huongDan },
      {
        name: 'Câu hỏi', rows,
        merges: ['A1:O1', 'B29:B31', 'K29:K31'],
        images: [
          { row: 31, col: 3, data: PNG_DO, cx: 952500, media: 'm1' },          // cột Ảnh → nội dung
          { row: 31, col: 6, data: PNG_XANH, cx: 476250, kind: 'one' },        // cột B → phương án B
          { row: 31, col: 11, data: PNG_LAM, cx: 952500 },                     // cột Lời giải → lời giải
          { row: 32, col: 2, data: PNG_DO, cx: 476250, media: 'm1', alt: true }, // dòng 33 trống → câu dòng 32; trùng file m1
          { row: 0, col: 0, data: PNG_LOGO, cx: 95250 }                        // logo trên tiêu đề → bỏ qua
        ]
      }
    ]
  };
}

let _chinh = null;
async function chinh() {
  if (!_chinh) {
    const bytes = await taoXlsx(specChinh());
    fs.writeFileSync(path.join(THU_MUC, 'mau-day-du.xlsx'), bytes);
    _chinh = bytes;
  }
  return _chinh;
}
const EXTRA = { 'hinh 1.png': PNG_PHU, 'Anh/thu_muc/hinh2.jpg': JPG, 'khac.png': PNG_PHU };
async function docChinh(opts) {
  return xlsx.parseXlsx(await chinh(), Object.assign({ fileName: 'Toan10.xlsx', extraImages: EXTRA, latex: LATEX_GIA }, opts || {}));
}

/* ---------------- Kiểm thử ---------------- */

test('cấu trúc tổng: trang đầu có tiêu đề, 2 ngân hàng theo cột Ngân hàng, vấn đề cấp file', async () => {
  const kq = await docChinh();
  assert.deepStrictEqual(kq.banks.map(b => b.title), ['Toán 10 – Chương 1', 'Toán 10 – Chương 2']);
  assert.deepStrictEqual(kq.banks.map(b => b.ident), [core.bankIdent('Toán 10 – Chương 1'), core.bankIdent('Toán 10 – Chương 2')]);
  assert.deepStrictEqual(kq.banks[0].source, { kind: 'xlsx', name: 'Toan10.xlsx' });
  assert.deepStrictEqual(kq.banks.map(b => b.questions.length), [27, 9]);
  assert.deepStrictEqual(kq.banks[0].questions.map(q => q.src.row),
    [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 44, 45]);
  assert.deepStrictEqual(kq.banks[1].questions.map(q => q.src.row), [18, 19, 21, 22, 23, 24, 25, 26, 27]);
  assert.deepStrictEqual(kq.banks[0].questions.map(q => q.type), ['mc', 'ma', 'tf', 'tf', 'short', 'num', 'num', 'num', 'blanks',
    'dropdowns', 'matching', 'essay', 'mc', 'mc', 'mc', 'mc', 'mc', 'short', 'essay', 'mc', 'mc', 'short', 'mc', 'mc', 'essay', 'essay', 'essay']);
  assert.deepStrictEqual(kq.banks[1].questions.map(q => q.type), ['mc', 'ma', 'tf', 'short', 'num', 'essay', 'blanks', 'dropdowns', 'matching']);
  assert.deepStrictEqual(kq.banks[0].questions.map(q => q.id).slice(0, 3), ['q01', 'q02', 'q03']);
  assert.strictEqual(kq.banks[0].questions[26].id, 'q27');
  assert.deepStrictEqual(kq.issues, [
    I('info', 'Cột "Ghi chú" không thuộc mẫu — bỏ qua'),
    I('info', 'Ảnh ở dòng 1 nằm trên/tại dòng tiêu đề — bỏ qua')
  ]);
  assert.deepStrictEqual(kq.banks[0].warnings, []);
  assert.deepStrictEqual(kq.banks[1].warnings, []);
});

test('TN: rich text → HTML, số 0.25 lưu dạng số, bỏ nhãn "C.", điểm số, LaTeX trong lời giải, mức độ/chủ đề', async () => {
  const q = (await docChinh()).banks[0].questions[0];
  soSanh(q, Q({
    row: 4, id: 'q01', no: '1', title: 'Câu 1 [NB]', type: 'mc', points: 0.5,
    stem: '<p>Giá trị của <em>x</em><sup>2</sup> khi <strong>x = 0,5</strong> là:</p>',
    choices: [
      { id: 'A', html: '0.25', correct: true }, { id: 'B', html: '<u>0,5</u>', correct: false },
      { id: 'C', html: '1', correct: false }, { id: 'D', html: '2,5', correct: false }
    ],
    feedback: '<p>Thay <em>x</em> = 0,5:<br><math><mi>x^2 = 0,25</mi></math></p>',
    meta: { level: 'NB', topic: 'Hàm số', part: '', tags: [] }
  }));
});

test('NĐ "A, C"; ĐS "ĐSĐS" và "a-Đ,b-S,c-Đ,d-S" (bỏ nhãn a)/d), chỉ số dưới); ngân hàng kế thừa dòng trên', async () => {
  const qs = (await docChinh()).banks[0].questions;
  soSanh(qs[1], Q({
    row: 6, id: 'q02', no: '2', title: 'Câu 2', type: 'ma', points: 1, stem: '<p>Chọn các số nguyên tố:</p>',
    choices: [{ id: 'A', html: '2', correct: true }, { id: 'B', html: '4', correct: false }, { id: 'C', html: '5', correct: true }, { id: 'D', html: '9', correct: false }]
  }));
  soSanh(qs[2], Q({
    row: 7, id: 'q03', no: '3', title: 'Câu 3', type: 'tf', points: 1, stem: '<p>Xét hàm số y = x²:</p>',
    statements: [
      { key: 'a', html: 'Đồ thị đi qua gốc toạ độ.', value: true }, { key: 'b', html: 'Hàm số đồng biến trên ℝ.', value: false },
      { key: 'c', html: 'Hàm số có giá trị nhỏ nhất bằng 0.', value: true }, { key: 'd', html: 'Hàm số nghịch biến trên (0; +∞).', value: false }
    ]
  }));
  soSanh(qs[3], Q({
    row: 8, id: 'q04', no: '4', title: 'Câu 4', type: 'tf', points: 1, stem: '<p>Xét các phát biểu:</p>',
    statements: [
      { key: 'a', html: 'Sắt là kim loại.', value: true }, { key: 'b', html: 'Nước sôi ở 50 °C.', value: false },
      { key: 'c', html: 'H<sub>2</sub>O là nước.', value: true }, { key: 'd', html: 'Muối ăn là NaOH.', value: false }
    ]
  }));
});

test('TLN "8/3; 2,67" + LaTeX trong nội dung; SỐ "12,5 ± 0,1", "1,5 .. 2", ô số 0.25; điểm công thức và "0,25"', async () => {
  const qs = (await docChinh()).banks[0].questions;
  soSanh(qs[4], Q({
    row: 9, id: 'q05', no: '5', title: 'Câu 5', type: 'short', points: 1,
    stem: '<p>Tính <math><mi>\\frac{8}{3}</mi></math> (làm tròn đến hàng phần trăm).</p>',
    answers: ['8/3', '2,67', '2.67']
  }));
  soSanh(qs[5], Q({ row: 10, id: 'q06', no: '6', title: 'Câu 6', type: 'num', points: 1, stem: '<p>Chiều dài (cm)?</p>', numeric: { exact: 12.5, margin: 0.1 } }));
  soSanh(qs[6], Q({ row: 11, id: 'q07', no: '7', title: 'Câu 7', type: 'num', points: 1, stem: '<p>Nghiệm nằm trong khoảng nào?</p>', numeric: { min: 1.5, max: 2 } }));
  soSanh(qs[7], Q({ row: 12, id: 'q08', no: '8', title: 'Câu 8', type: 'num', points: 0.25, stem: '<p>Một phần tư bằng bao nhiêu?</p>', numeric: { exact: 0.25, margin: 0 } }));
});

test('ĐIỀN qua nhiều run, CHỌN dấu *, GHÉP (=>, ->, →, nhiễu), TL lời giải nhiều dòng', async () => {
  const qs = (await docChinh()).banks[0].questions;
  soSanh(qs[8], Q({
    row: 13, id: 'q09', no: '9', title: 'Câu 9', type: 'blanks', points: 1,
    stem: '<p>Thủ đô của <strong>Việt Nam</strong> là [b1], của Pháp là [b2].</p>',
    blanks: [{ id: 'b1', accepts: ['Hà Nội', 'Ha Noi'] }, { id: 'b2', accepts: ['Paris'] }]
  }));
  soSanh(qs[9], Q({
    row: 14, id: 'q10', no: '10', title: 'Câu 10', type: 'dropdowns', points: 1, stem: '<p>[b1] là thủ đô của Việt Nam.</p>',
    dropdowns: [{ id: 'b1', options: ['Hà Nội', 'Huế', 'Đà Nẵng'], correct: 0 }]
  }));
  soSanh(qs[10], Q({
    row: 15, id: 'q11', no: '11', title: 'Câu 11', type: 'matching', points: 1, stem: '<p>Ghép thủ đô với quốc gia:</p>',
    pairs: [{ left: 'Hà Nội', right: 'Việt Nam' }, { left: '<strong>Paris</strong>', right: 'Pháp' }, { left: 'Tokyo', right: 'Nhật Bản' }],
    distractors: ['Lào']
  }));
  soSanh(qs[11], Q({
    row: 16, id: 'q12', no: '12', title: 'Câu 12 [VDC]', type: 'essay', points: 2,
    stem: '<p>Chứng minh rằng tổng ba góc của tam giác bằng 180°.</p>', feedback: '<p>Ý 1: 0,5 điểm<br>Ý 2: 0,5 điểm</p>',
    meta: { level: 'VDC', topic: '', part: '', tags: [] }
  }));
});

test('ĐOẠN dẫn gắn cho các câu sau tới "HẾT"; tự nhận diện mọi loại khi trống Loại câu', async () => {
  const qs = (await docChinh()).banks[1].questions;
  const doan = '<p>Đọc đoạn văn sau và trả lời các câu 13–14:<br>Hà Nội là thủ đô của Việt Nam.</p>';
  soSanh(qs[0], Q({
    row: 18, id: 'q01', no: '13', title: 'Câu 13', type: 'mc', points: 1, stimulus: doan, stem: '<p>Thủ đô của Việt Nam là?</p>',
    choices: [{ id: 'A', html: 'Hà Nội', correct: true }, { id: 'B', html: 'Huế', correct: false }]
  }));
  soSanh(qs[1], Q({
    row: 19, id: 'q02', no: '14', title: 'Câu 14 [TH]', type: 'ma', points: 1, stimulus: doan, stem: '<p>Thành phố nào thuộc Việt Nam?</p>',
    choices: [{ id: 'A', html: 'Hà Nội', correct: true }, { id: 'B', html: 'Bangkok', correct: false }, { id: 'C', html: 'Huế', correct: true }],
    meta: { level: 'TH', topic: '', part: '', tags: [] }
  }));
  soSanh(qs[2], Q({
    row: 21, id: 'q03', no: '15', title: 'Câu 15', type: 'tf', points: 1, stem: '<p>Đúng hay sai?</p>',
    statements: [{ key: 'a', html: 'p', value: true }, { key: 'b', html: 'q', value: false }, { key: 'c', html: 'r', value: true }, { key: 'd', html: 's', value: false }]
  }));
  soSanh(qs[3], Q({
    row: 22, id: 'q04', no: '16', title: 'Câu 16', type: 'short', points: 1, stem: '<p>Thủ đô của Việt Nam?</p>', answers: ['Hà Nội'],
    issues: [I('warn', 'Dòng 22: mức độ "xyz" không nhận ra (dùng NB, TH, VD, VDC) — bỏ qua', 'q04')]
  }));
  soSanh(qs[4], Q({ row: 23, id: 'q05', no: '17', title: 'Câu 17', type: 'num', points: 1, stem: '<p>Nghiệm thuộc khoảng?</p>', numeric: { min: 1.5, max: 2 } }));
  soSanh(qs[5], Q({
    row: 24, id: 'q06', no: '18', title: 'Câu 18', type: 'essay', points: 1, stem: '<p>Trình bày cảm nghĩ.</p>',
    issues: [I('info', 'Dòng 24: chưa có đáp án → tự luận, giáo viên chấm tay', 'q06')]
  }));
  soSanh(qs[6], Q({ row: 25, id: 'q07', no: '19', title: 'Câu 19', type: 'blanks', points: 1, stem: '<p>Điền: [b1]</p>', blanks: [{ id: 'b1', accepts: ['x'] }] }));
  soSanh(qs[7], Q({
    row: 26, id: 'q08', no: '20', title: 'Câu 20', type: 'dropdowns', points: 1, stem: '<p>[b1] và [b2]</p>',
    dropdowns: [{ id: 'b1', options: ['a', 'b'], correct: 0 }, { id: 'b2', options: ['c', 'd'], correct: 1 }]
  }));
  soSanh(qs[8], Q({
    row: 27, id: 'q09', no: '21', title: 'Câu 21', type: 'matching', points: 1, stem: '<p>Ghép:</p>',
    pairs: [{ left: 'x', right: '1' }, { left: 'y', right: '2' }], distractors: []
  }));
});

test('công thức (dùng giá trị <v>), quay lại ngân hàng cũ (không phân biệt hoa thường/khoảng trắng), ô gộp Loại câu + Điểm', async () => {
  const qs = (await docChinh()).banks[0].questions;
  soSanh(qs[12], Q({
    row: 28, id: 'q13', no: '13', title: 'Câu 13', type: 'mc', points: 1, stem: '<p>Tính 1+1</p>',
    choices: [{ id: 'A', html: '1', correct: false }, { id: 'B', html: '2', correct: true }]
  }));
  [[13, 29, 'q14', '14', 'a1', 'b1', 'A'], [14, 30, 'q15', '15', 'a2', 'b2', 'B'], [15, 31, 'q16', '16', 'a3', 'b3', 'A']].forEach(([i, row, id, no, a, b, da]) => {
    soSanh(qs[i], Q({
      row, id, no, title: 'Câu ' + no, type: 'mc', points: 0.5, stem: '<p>Câu gộp ' + (row - 28) + '</p>',
      choices: [{ id: 'A', html: a, correct: da === 'A' }, { id: 'B', html: b, correct: da === 'B' }]
    }));
  });
});

test('ảnh nổi: neo theo dòng (0-based → dòng sheet), theo cột (nội dung / phương án / lời giải), dòng trống bên dưới, trùng file, mc:Fallback', async () => {
  const kq = await docChinh();
  const b = kq.banks[0], q = b.questions[16];
  soSanh(q, Q({
    row: 32, id: 'q17', no: '17', title: 'Câu 17', type: 'mc', points: 1,
    stem: '<p>Hình nào là hình tròn?</p><p>' + img('img_001.png', 100) + '</p><p>' + img('img_001.png', 50) + '</p>',
    choices: [{ id: 'A', html: 'Hình vuông', correct: false }, { id: 'B', html: img('img_002.png', 50), correct: true }],
    feedback: '<p>' + img('img_003.png', 100) + '</p>'
  }));
  assert.deepStrictEqual(Object.keys(b.images), ['img_001.png', 'img_002.png', 'img_003.png', 'img_004.png', 'img_005.jpg', 'img_006.png']);
  assert.deepStrictEqual(b.images['img_001.png'], PNG_DO);
  assert.deepStrictEqual(b.images['img_002.png'], PNG_XANH);
  assert.deepStrictEqual(b.images['img_003.png'], PNG_LAM);
  assert.deepStrictEqual(kq.banks[1].images, {});
  Object.keys(b.images).forEach(t => assert.match(t, /^[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)$/));
});

test('ảnh nổi: "Văn bản thay thế" (xdr:cNvPr descr) → alt, có thoát ký tự', async () => {
  const bytes = await taoXlsx({ sheets: [{ name: 'S', rows: [[1, ['Loại câu', 'Nội dung câu hỏi']], [2, ['TL', 'Mô tả hình']], [3, ['TL', 'Hình không mô tả']]],
    images: [{ row: 1, col: 1, data: PNG_PHU, descr: 'Đồ thị "y = x²" & trục  Ox' }, { row: 2, col: 1, data: PNG_DO }] }] });
  const kq = await xlsx.parseXlsx(bytes, { fileName: 'alt.xlsx' });
  const [a, b] = kq.banks[0].questions;
  assert.match(a.stem, /<img src="images\/img_001\.png" alt="Đồ thị &quot;y = x²&quot; &amp; trục Ox"/);
  assert.match(b.stem, /<img src="images\/img_002\.png" alt=""/);
});

test('ảnh theo tên ở cột Ảnh (extraImages: không phân biệt hoa thường, theo tên file trong thư mục), thiếu ảnh → lỗi, ảnh "Place in cell"', async () => {
  const kq = await docChinh();
  const b = kq.banks[0], qs = b.questions;
  soSanh(qs[17], Q({
    row: 34, id: 'q18', no: '18', title: 'Câu 18', type: 'short', points: 1,
    stem: '<p>Quan sát hai hình.</p><p>' + img('img_004.png') + '</p><p>' + img('img_005.jpg') + '</p>', answers: ['2']
  }));
  assert.deepStrictEqual(b.images['img_004.png'], PNG_PHU);
  assert.deepStrictEqual(b.images['img_005.jpg'], JPG);
  soSanh(qs[18], Q({
    row: 35, id: 'q19', no: '19', title: 'Câu 19', type: 'essay', points: 1, stem: '<p>Câu thiếu ảnh</p>',
    issues: [I('error', 'Dòng 35: không tìm thấy ảnh "khong_co.png" — hãy kéo thả ảnh này (hoặc thư mục/zip chứa nó) cùng file Excel', 'q19')]
  }));
  soSanh(qs[19], Q({
    row: 36, id: 'q20', no: '20', title: 'Câu 20', type: 'mc', points: 1, stem: '<p>Ảnh đặt trong ô</p><p>' + img('img_006.png') + '</p>',
    choices: [{ id: 'A', html: 'x', correct: true }, { id: 'B', html: 'y', correct: false }]
  }));
  assert.deepStrictEqual(b.images['img_006.png'], PNG_VANG);
});

test('lỗi có số dòng: đáp án trỏ cột không có, loại câu lạ + điểm sai, ô lỗi #N/A + ô TRUE, công thức chưa tính, _x000D_, $ tiền tệ, công thức LaTeX lỗi', async () => {
  const qs = (await docChinh()).banks[0].questions;
  soSanh(qs[20], Q({
    row: 37, id: 'q21', no: '21', title: 'Câu 21', type: 'mc', points: 1, stem: '<p>Câu lỗi đáp án</p>',
    choices: [{ id: 'A', html: 'x', correct: false }, { id: 'B', html: 'y', correct: false }],
    issues: [I('error', 'Dòng 37: đáp án là E nhưng không có cột phương án E', 'q21')]
  }));
  soSanh(qs[21], Q({
    row: 38, id: 'q22', no: '22', title: 'Câu 22', type: 'short', points: 1, stem: '<p>Câu loại lạ</p>', answers: ['abc'],
    issues: [
      I('error', 'Dòng 38: điểm "abc" không hợp lệ (ví dụ: 1 hoặc 0,25)', 'q22'),
      I('error', 'Dòng 38: loại câu "XYZ" không hợp lệ (dùng TN, NĐ, ĐS, TLN, SỐ, ĐIỀN, CHỌN, GHÉP, TL, ĐOẠN)', 'q22')
    ]
  }));
  soSanh(qs[22], Q({
    row: 39, id: 'q23', no: '23', title: 'Câu 23', type: 'mc', points: 1, stem: '<p>Chọn TRUE</p>',
    choices: [{ id: 'A', html: 'p', correct: false }, { id: 'B', html: 'q', correct: false }, { id: 'D', html: 'TRUE', correct: true }],
    issues: [
      I('warn', 'Dòng 39: ô H39 có lỗi "#N/A" — coi như ô trống', 'q23'),
      I('warn', 'Dòng 39: bỏ trống phương án C nằm giữa các phương án khác', 'q23')
    ]
  }));
  soSanh(qs[23], Q({
    row: 40, id: 'q24', no: '24', title: 'Câu 24', type: 'mc', points: 1, stem: '',
    choices: [{ id: 'A', html: '1', correct: true }, { id: 'B', html: '2', correct: false }],
    issues: [
      I('warn', 'Dòng 40: ô C40 là công thức chưa có giá trị đã tính — mở file bằng Excel rồi lưu lại', 'q24'),
      I('warn', 'Dòng 40: nội dung câu hỏi đang trống', 'q24')
    ]
  }));
  soSanh(qs[24], Q({ row: 41, id: 'q25', no: '25', title: 'Câu 25', type: 'essay', points: 1, stem: '<p>A<br>B _x000D_</p>' }));
  soSanh(qs[25], Q({
    row: 44, id: 'q26', no: '26', title: 'Câu 26', type: 'essay', points: 1,
    stem: '<p>Giá $5 và $10, ký hiệu $; <math><mi>a+b</mi></math> và $loi$</p>',
    issues: [I('warn', 'Dòng 44: công thức "$loi$" lỗi: cú pháp sai', 'q26')]
  }));
  soSanh(qs[26], Q({ row: 45, id: 'q27', no: '27', title: 'Câu 27', type: 'essay', points: 1, stem: '<p><strong>Đậm liền</strong> thường</p>' }));
});

test('mọi câu đã qua core.validateQuestion: chỉ các câu cố ý sai mới có lỗi', async () => {
  const kq = await docChinh();
  const loi = [];
  kq.banks.forEach(b => b.questions.forEach(q => q.issues.filter(i => i.level === 'error').forEach(i => loi.push(b.questions.indexOf(q) + ':' + q.src.row))));
  assert.deepStrictEqual(loi, ['18:35', '20:37', '21:38', '21:38']);
  // bất biến của core không có lỗi mới ngoài các câu đó
  kq.banks.forEach(b => b.questions.forEach(q => {
    if ([35, 37, 38].indexOf(q.src.row) === -1) assert.deepStrictEqual(core.validateQuestion(q).filter(i => i.level === 'error'), [], 'dòng ' + q.src.row);
  }));
});

test('không có latex.js → giữ nguyên $…$ dạng chữ, báo info một lần', async () => {
  const kq = await docChinh({ latex: null });
  const qs = kq.banks[0].questions;
  assert.strictEqual(qs[4].stem, '<p>Tính $\\frac{8}{3}$ (làm tròn đến hàng phần trăm).</p>');
  assert.strictEqual(qs[0].feedback, '<p>Thay <em>x</em> = 0,5:<br>$x^2 = 0,25$</p>');
  assert.deepStrictEqual(qs[4].issues, []);
  assert.deepStrictEqual(kq.issues.filter(i => /latex/.test(i.msg)),
    [I('info', 'Chưa nạp bộ chuyển công thức (latex.js) — công thức $…$ được giữ nguyên dạng chữ')]);
});

test('latex.replaceDollar (khi không có toMathML), $$…$$ → display="block", \\(…\\) và \\[…\\]', async () => {
  const lx = {
    replaceDollar: (s, o) => {
      assert.deepStrictEqual(Object.keys(o), ['html', 'issues']);
      assert.strictEqual(o.html, false);
      return s.replace(/^\$(.*)\$$/, (m, x) => '<math><mn>' + x.replace(/</g, '&lt;') + '</mn></math>');
    }
  };
  const r = xlsx._veHtml([{ text: 'a $1<2$ b' }], { latex: true, lx });
  assert.strictEqual(r.html, 'a <math><mn>1&lt;2</mn></math> b');
  const r2 = xlsx._veHtml([{ text: '$$x$$' }], { latex: true, lx: LATEX_GIA });
  assert.strictEqual(r2.html, '<math display="block"><mi>x</mi></math>');
  const r3 = xlsx._veHtml([{ text: '$ x$ và $x $ và 5$' }], { latex: true, lx: LATEX_GIA });
  assert.strictEqual(r3.html, '$ x$ và $x $ và 5$');
  const r4 = xlsx._veHtml([{ text: 'a \\(x\\) b \\[y\\] c \\( d' }], { latex: true, lx: LATEX_GIA });
  assert.strictEqual(r4.html, 'a <math><mi>x</mi></math> b <math display="block"><mi>y</mi></math> c \\( d');
});

test('latex.js thật (tự nạp khi không truyền opts.latex): MathML chuẩn + cảnh báo lệnh chưa hỗ trợ kèm số dòng', async () => {
  let latex;
  try { latex = require('../js/latex.js'); } catch (e) { console.log('    BỎ QUA: chưa có js/latex.js'); return; }
  const bytes = await taoXlsx({ sheets: [{ name: 'S', rows: [[1, ['Loại câu', 'Nội dung câu hỏi']], [2, ['TL', 'Tính $\\frac{1}{2}$ và $\\khonglenh x$']]] }] });
  const kq = await xlsx.parseXlsx(bytes, { fileName: 't.xlsx' });
  const canh = [];
  const m2 = latex.toMathML('\\khonglenh x', { display: false, issues: canh });
  assert.ok(canh.length >= 1, 'latex.js phải báo lệnh lạ');
  const q = kq.banks[0].questions[0];
  assert.strictEqual(q.stem, '<p>Tính ' + latex.toMathML('\\frac{1}{2}', { display: false }) + ' và ' + m2 + '</p>');
  assert.match(q.stem, /^<p>Tính <math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"><mfrac>/);
  assert.deepStrictEqual(q.issues, canh.map(i => I('warn', 'Dòng 2: ' + i.msg, 'q01')));
  assert.deepStrictEqual(kq.issues, []);
});

/* ---------------- File thứ hai: tiền tố x:, không có r=, không sharedStrings, tiêu đề 2 tầng, E–H, WPS ---------------- */

function specPhu() {
  // A STT | B Loại câu | C Nội dung | D..I Phương án A–F (tiêu đề 2 tầng) | J Đáp án | K Ảnh
  const r = (o) => ['stt', 'loai', 'nd', 'A', 'B', 'C', 'D', 'E', 'F', 'da', 'anh'].map(k => (o[k] === undefined ? null : o[k]));
  return {
    noSharedStrings: true,
    sheets: [{
      name: 'Đề', prefix: 'x', noRefs: true,
      merges: ['D1:I1', 'A1:A2', 'B1:B2', 'C1:C2', 'J1:J2', 'K1:K2'],
      rows: [
        [1, ['STT', 'Loại câu', 'Nội dung câu hỏi', 'Phương án', null, null, null, null, null, 'Đáp án', 'Ảnh']],
        [2, [null, null, null, 'A', 'B', 'C', 'D', 'E', 'F']],
        [3, r({ stt: 1, loai: 'TN', nd: 'Sáu phương án', A: '1', B: '2', C: '3', D: '4', E: '5', F: '6', da: 'F' })],
        [4, r({ stt: 2, loai: 'nđ', nd: 'Hai đáp án', A: '1', B: '2', C: '3', D: '4', E: '5', da: 'B và E' })],
        [5, r({ stt: 3, loai: 'ĐS', nd: 'Năm ý', A: 'p1', B: 'p2', C: 'p3', D: 'p4', E: 'p5', da: 'a) Đúng b) Sai c) Đúng d) Sai e) Đúng' })],
        [6, r({ stt: 4, loai: 'TL', nd: 'Ảnh WPS', anh: { wps: PNG_LAM } })],
        [7, r({ stt: 5, loai: 'TN', nd: 'Đánh dấu sao', A: '*Đúng', B: 'Sai' })],
        [8, r({ stt: 6, loai: 'ĐS', nd: 'Thiếu ý', A: 'p1', B: 'p2', C: 'p3', D: 'p4', da: 'ĐSĐ' })],
        [9, r({ stt: 7, loai: 'CHỌN', nd: '[[a|b]] và [[*c|d]]' })],
        [10, r({ stt: 8, loai: 'TN', nd: 'Ảnh EMF', A: 'x', B: 'y', da: 'A', anh: 'hinh.emf' })],
        [11, r({ stt: 9, loai: 'TN', nd: 'Hai đáp án cho câu một đáp án', A: 'x', B: 'y', da: 'A,B' })],
        [12, r({ stt: 10, loai: 'SỐ', nd: 'Số sai', da: '12 ± 5%' })],
        [13, r({ stt: 11, loai: 'ĐIỀN', nd: 'Không có ô' })]
      ]
    }]
  };
}

test('file phụ: tiền tố x:, không r=, chuỗi nội tuyến, tiêu đề 2 tầng (Phương án gộp + A–F), tên ngân hàng = tên file', async () => {
  const bytes = await taoXlsx(specPhu());
  fs.writeFileSync(path.join(THU_MUC, 'tien-to-x-2-tang.xlsx'), bytes);
  const files = await zip.readZip(bytes);
  assert.ok(!files['xl/sharedStrings.xml'], 'không có sharedStrings');
  const kq = await xlsx.parseXlsx(bytes, { fileName: 'C:\\De thi\\De_on_tap.xlsx', extraImages: { 'hinh.emf': taoEmfGia() }, latex: null });
  assert.deepStrictEqual(kq.issues, []);
  assert.strictEqual(kq.banks.length, 1);
  const b = kq.banks[0];
  assert.strictEqual(b.title, 'De_on_tap');
  const qs = b.questions;
  assert.deepStrictEqual(qs.map(q => q.src), qs.map((q, i) => ({ sheet: 'Đề', row: i + 3 })));
  soSanh(qs[0], Q({
    sheet: 'Đề', row: 3, id: 'q01', no: '1', title: 'Câu 1', type: 'mc', points: 1, stem: '<p>Sáu phương án</p>',
    choices: ['1', '2', '3', '4', '5', '6'].map((t, i) => ({ id: 'ABCDEF'[i], html: t, correct: i === 5 }))
  }));
  assert.deepStrictEqual(qs[1].choices.filter(c => c.correct).map(c => c.id), ['B', 'E']);
  assert.strictEqual(qs[1].type, 'ma');
  assert.deepStrictEqual(qs[2].statements.map(s => [s.key, s.value]), [['a', true], ['b', false], ['c', true], ['d', false], ['e', true]]);
  soSanh(qs[3], Q({ sheet: 'Đề', row: 6, id: 'q04', no: '4', title: 'Câu 4', type: 'essay', points: 1, stem: '<p>Ảnh WPS</p><p>' + img('img_001.png', 200) + '</p>' }));
  assert.deepStrictEqual(b.images['img_001.png'], PNG_LAM);
  soSanh(qs[4], Q({
    sheet: 'Đề', row: 7, id: 'q05', no: '5', title: 'Câu 5', type: 'mc', points: 1, stem: '<p>Đánh dấu sao</p>',
    choices: [{ id: 'A', html: 'Đúng', correct: true }, { id: 'B', html: 'Sai', correct: false }]
  }));
  assert.deepStrictEqual(qs[5].issues, [I('error', 'Dòng 8: đáp án Đúng/Sai "ĐSĐ" có 3 giá trị nhưng câu có 4 ý', 'q06')]);
  assert.deepStrictEqual(qs[5].statements.map(s => s.value), [undefined, undefined, undefined, undefined]);
  assert.deepStrictEqual(qs[6].dropdowns, [{ id: 'b1', options: ['a', 'b'] }, { id: 'b2', options: ['c', 'd'], correct: 0 }]);
  assert.deepStrictEqual(qs[6].issues, [I('error', 'Dòng 9: ô [[a|b]] chưa đánh dấu lựa chọn đúng bằng dấu * (ví dụ: [[*Hà Nội|Huế]]) — câu đã có ô chọn thì mọi ô đều phải là ô chọn', 'q07')]);
  assert.deepStrictEqual(qs[7].issues, [I('error', 'Dòng 10: ảnh "hinh.emf" định dạng EMF — Canvas không hiển thị được; hãy chuyển thành PNG hoặc JPG', 'q08')]);
  assert.strictEqual(qs[7].stem, '<p>Ảnh EMF</p>');
  assert.deepStrictEqual(qs[8].issues, [I('error', 'Dòng 11: câu một đáp án nhưng có 2 phương án được đánh dấu đúng', 'q09')]);
  assert.deepStrictEqual(qs[9].issues, [I('error', 'Dòng 12: đáp án số "12 ± 5%" không hợp lệ (ví dụ: 12,5 hoặc 12,5 ± 0,1 hoặc 1,5 .. 2)', 'q10')]);
  assert.strictEqual(qs[9].numeric, undefined);
  assert.deepStrictEqual(qs[10].issues, [I('error', 'Dòng 13: chưa có ô [[…]] trong nội dung câu hỏi (ví dụ: Thủ đô là [[Hà Nội]])', 'q11')]);
  assert.deepStrictEqual(qs[10].blanks, []);
});

test('ĐOẠN: ảnh thiếu → cảnh báo cấp ngân hàng; đổi ngân hàng thì bỏ đoạn dẫn; đoạn dẫn chỉ có ảnh nổi; "--- HẾT ---"; tên ảnh không đuôi', async () => {
  const bytes = await taoXlsx({
    sheets: [{
      name: 'Đoạn',
      rows: [
        [1, ['Loại câu', 'Nội dung câu hỏi', 'Đáp án', 'Ảnh', 'Ngân hàng', 'Nội dung kiến thức']],
        [2, ['ĐOẠN', 'Đoạn 1', null, 'thieu.png', 'NH X']],
        [3, [null, 'Câu 1', 'x', null, null, 'Đọc hiểu']],
        [4, [null, 'Câu 2', 'y', null, 'NH Y']],
        [5, ['ĐOẠN']],
        [6, [null, 'Câu 3', 'z', 'hinh 1']],
        [7, ['ĐOẠN', '--- HẾT ---']],
        [8, [null, 'Câu 4', 'w']]
      ],
      images: [{ row: 4, col: 1, data: PNG_LAM, cx: 190500 }]
    }]
  });
  fs.writeFileSync(path.join(THU_MUC, 'doan-dan.xlsx'), bytes);
  const kq = await xlsx.parseXlsx(bytes, { fileName: 'd.xlsx', extraImages: EXTRA, latex: null });
  assert.deepStrictEqual(kq.issues, []);
  const [x, y] = kq.banks;
  assert.deepStrictEqual(kq.banks.map(b => b.title), ['NH X', 'NH Y']);
  assert.deepStrictEqual(x.warnings, [I('error', 'Dòng 2 (đoạn dẫn): không tìm thấy ảnh "thieu.png" — hãy kéo thả ảnh này (hoặc thư mục/zip chứa nó) cùng file Excel')]);
  soSanh(x.questions[0], Q({
    sheet: 'Đoạn', row: 3, id: 'q01', no: '1', title: 'Câu 1', type: 'short', points: 1, stimulus: '<p>Đoạn 1</p>', stem: '<p>Câu 1</p>', answers: ['x'],
    meta: { level: '', topic: 'Đọc hiểu', part: '', tags: [] }
  }));
  const anhDoan = '<p>' + img('img_001.png', 20) + '</p>';
  assert.deepStrictEqual(y.questions.map(q => [q.no, q.stimulus, q.stem]), [
    ['1', '', '<p>Câu 2</p>'],
    ['2', anhDoan, '<p>Câu 3</p><p>' + img('img_002.png') + '</p>'],
    ['3', '', '<p>Câu 4</p>']
  ]);
  assert.deepStrictEqual(y.images, { 'img_001.png': PNG_LAM, 'img_002.png': PNG_PHU });
  assert.deepStrictEqual(x.images, {});
});

test('nạp kiểu trình duyệt (script cổ điển, không require, NH.latex) cho kết quả giống hệt Node', async () => {
  if (typeof DecompressionStream !== 'function') { console.log('    BỎ QUA: Node không có DecompressionStream'); return; }
  const cu = globalThis.NH;
  try {
    delete globalThis.NH;
    for (const f of ['core', 'zip', 'xlsx']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/' + f + '.js'), 'utf8'), { filename: f + '.js' });
    assert.strictEqual(globalThis.NH.zip.setEngine(null), 'stream');
    globalThis.NH.latex = LATEX_GIA;
    const a = await globalThis.NH.xlsx.parseXlsx(await chinh(), { fileName: 'Toan10.xlsx', extraImages: EXTRA });
    const b = await docChinh();
    assert.deepStrictEqual(a, b);
  } finally {
    if (cu) globalThis.NH = cu; else delete globalThis.NH;
  }
});

/* ---------------- File do Excel 365 thật ghi (tests/fixtures/xlsx/excel365-*.xlsx, tạo bằng luu-lai-bang-excel.ps1) ---------------- */

test('Excel 365 lưu lại mau-day-du.xlsx (sharedStrings, drawing, richData do Excel ghi) → kết quả y hệt; ô =A1 nay có giá trị', async () => {
  const goc = await docChinh();
  const ex = await xlsx.parseXlsx(fs.readFileSync(path.join(THU_MUC, 'excel365-mau-day-du.xlsx')), { fileName: 'Toan10.xlsx', extraImages: EXTRA, latex: LATEX_GIA });
  const q = goc.banks[0].questions[23];
  assert.strictEqual(q.src.row, 40);
  // khác biệt duy nhất: Excel đã tính công thức =A1 ở ô C40
  q.stem = '<p>NGÂN HÀNG CÂU HỎI TOÁN 10</p>';
  q.issues = [];
  assert.deepStrictEqual(ex, goc);
});

test('file WPS (=DISPIMG) đã được Excel 365 lưu lại: ô thành t="e" vm (#NAME?) nhưng vẫn lấy được ảnh từ cellimages.xml', async () => {
  const opts = { fileName: 'De_on_tap.xlsx', extraImages: { 'hinh.emf': taoEmfGia() }, latex: null };
  const goc = await xlsx.parseXlsx(await taoXlsx(specPhu()), opts);
  const ex = await xlsx.parseXlsx(fs.readFileSync(path.join(THU_MUC, 'excel365-wps-luu-lai.xlsx')), opts);
  assert.deepStrictEqual(ex, goc);
  assert.strictEqual(ex.banks[0].questions[3].stem, '<p>Ảnh WPS</p><p>' + img('img_001.png', 200) + '</p>');
});

test('file do Excel 365 tự tạo (COM): rich text theo vị trí ký tự, Alt+Enter, =1/3, TRUE, ô gộp, ảnh AddPicture', async () => {
  const kq = await xlsx.parseXlsx(fs.readFileSync(path.join(THU_MUC, 'excel365-tu-tao.xlsx')), { fileName: 'tu-tao.xlsx', latex: null });
  assert.deepStrictEqual(kq.issues, []);
  assert.deepStrictEqual(kq.banks.map(b => [b.title, b.questions.length]), [['Toán 11', 5]]);
  const qs = kq.banks[0].questions;
  soSanh(qs[0], Q({
    row: 3, id: 'q01', no: '1', title: 'Câu 1', type: 'mc', points: 0.5,
    stem: '<p>Giá trị của <em>x</em><sup>2</sup> là<br><strong>bao </strong>nhiêu?</p>',
    choices: [{ id: 'A', html: '0.25', correct: true }, { id: 'B', html: '0,5', correct: false },
      { id: 'C', html: '0.333333333333333', correct: false }, { id: 'D', html: 'TRUE', correct: false }]
  }));
  assert.deepStrictEqual(qs.slice(1, 3).map(q => [q.type, q.statements.map(s => s.key + ':' + s.html + ':' + s.value).join(' ')]),
    [['tf', 'a:p:true b:q:false'], ['tf', 'a:r:false b:s:true']]);
  assert.strictEqual(qs[3].stem, '<p>Mô tả hình.</p><p>' + img('img_001.png', 40) + '</p>');
  assert.strictEqual(xlsx._kieuAnh(kq.banks[0].images['img_001.png']), 'png');
  assert.strictEqual(kq.banks[0].images['img_001.png'].constructor, Uint8Array, 'Buffer → Uint8Array thường');
  assert.deepStrictEqual(qs[4].choices.map(c => c.correct), [false, true]);
});

test('mũi tên trong phương án toán học không biến câu TN thành ghép nối; GHÉP ưu tiên "=>"; ô "Nhiễu: x; y"', async () => {
  const bytes = await taoXlsx({
    sheets: [{
      name: 'S', rows: [
        [1, ['Loại câu', 'Nội dung câu hỏi', 'A', 'B', 'C', 'Đáp án']],
        [2, [null, 'Giới hạn nào bằng 0?', 'x → 0', 'x → +∞', 'x → 1', 'B']],
        [3, [null, 'Chọn đúng', 'x → 0', 'y', null, 'đ']],
        [4, ['GHÉP', 'Ghép giới hạn', 'lim x → 0 => 1', 'lim x → 1 -> 2', 'Nhiễu: 3; 4']]
      ]
    }]
  });
  const qs = (await xlsx.parseXlsx(bytes, { fileName: 'g.xlsx', latex: null })).banks[0].questions;
  assert.deepStrictEqual(qs[0].type, 'mc');
  assert.deepStrictEqual(qs[0].choices.map(c => [c.html, c.correct]), [['x → 0', false], ['x → +∞', true], ['x → 1', false]]);
  assert.deepStrictEqual(qs[0].issues, []);
  // "đ" không phải nhãn A–H → hiểu là Đúng/Sai một ý? Không: 2 ô ⇒ lệch số ý → lỗi rõ ràng
  assert.strictEqual(qs[1].type, 'tf');
  assert.deepStrictEqual(qs[1].issues.map(i => i.msg), ['Dòng 3: đáp án Đúng/Sai "đ" có 1 giá trị nhưng câu có 2 ý']);
  assert.deepStrictEqual(qs[2].pairs, [{ left: 'lim x → 0', right: '1' }, { left: 'lim x → 1', right: '2' }]);
  assert.deepStrictEqual(qs[2].distractors, ['3', '4']);
  assert.deepStrictEqual(qs[2].issues, []);
});

test('tích hợp: xlsx → qti.buildPackages (2 bố cục × 2 cách Đúng/Sai) → tests/kiem-qti.cjs không báo lỗi', async () => {
  let qti, kiem;
  try { qti = require('../js/qti.js'); kiem = require('./kiem-qti.cjs'); } catch (e) { console.log('    BỎ QUA: chưa có qti.js / kiem-qti.cjs'); return; }
  const tep = ['mau-day-du.xlsx', 'excel365-tu-tao.xlsx', 'doan-dan.xlsx', 'tien-to-x-2-tang.xlsx'];
  for (const f of tep) {
    const kq = await xlsx.parseXlsx(fs.readFileSync(path.join(THU_MUC, f)), { fileName: f, extraImages: EXTRA });
    kq.banks.forEach(b => { b.questions = b.questions.filter(q => !q.issues.some(i => i.level === 'error')); }); // như giao diện: bỏ câu lỗi
    const soCau = kq.banks.reduce((s, b) => s + b.questions.length, 0);
    for (const target of ['itembank', 'classic']) {
      for (const tfMode of ['dropdowns', 'split']) {
        const goi = await qti.buildPackages(kq.banks, { target, tfMode });
        assert.deepStrictEqual((goi.issues || []).filter(i => i.level === 'error'), [], f + ' ' + target + ' ' + tfMode);
        for (const p of goi) {
          const r = await kiem.checkZip(p.bytes);
          assert.ok(r.ok, f + ' ' + target + ' ' + tfMode + ' ' + p.fileName + ': ' + JSON.stringify(r.errors.slice(0, 3)));
        }
      }
    }
    assert.ok(soCau > 0, f);
  }
});

/* ---------------- Lỗi cấp file ---------------- */

test('lỗi cấp file: không phải zip, .xls/OLE, zip không có workbook, không có dòng tiêu đề, chỉ có tiêu đề', async () => {
  let kq = await xlsx.parseXlsx(new Uint8Array([1, 2, 3, 4, 5]), { fileName: 'a.xlsx' });
  assert.strictEqual(kq.banks.length, 0);
  assert.strictEqual(kq.issues.length, 1);
  assert.strictEqual(kq.issues[0].level, 'error');
  assert.match(kq.issues[0].msg, /^Không đọc được file "a\.xlsx" — không phải file \.xlsx hợp lệ/);

  kq = await xlsx.parseXlsx(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), { fileName: 'cu.xls' });
  assert.match(kq.issues[0].msg, /^File "cu\.xls" không phải định dạng \.xlsx \(có thể là file \.xls đời cũ/);

  kq = await xlsx.parseXlsx(await zip.writeZip([{ path: 'a.txt', data: 'x' }]), { fileName: 'b.xlsx' });
  assert.deepStrictEqual(kq.issues, [I('error', 'File "b.xlsx" không phải bảng tính Excel (.xlsx)')]);

  kq = await xlsx.parseXlsx(await taoXlsx({ sheets: [{ name: 'S', rows: [[1, ['Câu hỏi', 'Trả lời']], [2, ['x', 'y']]] }] }), { fileName: 'c.xlsx' });
  assert.deepStrictEqual(kq.banks, []);
  assert.match(kq.issues[0].msg, /^Không tìm thấy dòng tiêu đề có ô "Nội dung câu hỏi" trong 10 dòng đầu/);

  kq = await xlsx.parseXlsx(await taoXlsx({ sheets: [{ name: 'S', rows: [[2, ['STT', 'Nội dung câu hỏi', 'Đáp án']], [3, [{ n: 1 }]], [4, [{ n: 2 }]]] }] }), { fileName: 'd.xlsx' });
  assert.deepStrictEqual(kq, { banks: [], issues: [I('error', 'Không có câu hỏi nào dưới dòng tiêu đề (dòng 2) của trang tính "S"')] });
});

test('trang ẩn chỉ được dùng khi không trang hiện nào có tiêu đề; ArrayBuffer đầu vào', async () => {
  const bytes = await taoXlsx({
    sheets: [
      { name: 'Ẩn', hidden: true, rows: [[1, ['Nội dung câu hỏi', 'Đáp án']], [2, ['Câu ẩn', 'x']]] },
      { name: 'Hiện', rows: [[1, ['Nội dung câu hỏi', 'Đáp án']], [2, ['Câu hiện', 'y']]] }
    ]
  });
  const kq = await xlsx.parseXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { fileName: 'z.xlsx' });
  assert.deepStrictEqual(kq.banks[0].questions.map(q => [q.src.sheet, q.stem, q.answers]), [['Hiện', '<p>Câu hiện</p>', ['y']]]);
});

/* ---------------- Hàm nhỏ ---------------- */

test('docDS / apDS: các cách ghi đáp án Đúng/Sai', () => {
  const k = ['a', 'b', 'c', 'd'];
  const m = (s) => xlsx._apDS(s, k).map;
  const DSDS = { a: true, b: false, c: true, d: false };
  ['ĐSĐS', 'Đ S Đ S', 'đsđs', 'DSDS', 'TFTF', 'Đúng; Sai; Đúng; Sai', 'True, False, True, False', 'a-Đ,b-S,c-Đ,d-S',
    'a) Đúng b) Sai c) Đúng d) Sai', 'A: Đ; B: S; C: Đ; D: S', 'aĐ bS cĐ dS', 'd-S, c-Đ, b-S, a-Đ'].forEach(s => assert.deepStrictEqual(m(s), DSDS, s));
  assert.deepStrictEqual(xlsx._apDS('ĐSĐ', k), { loi: 'đáp án Đúng/Sai "ĐSĐ" có 3 giá trị nhưng câu có 4 ý' });
  assert.deepStrictEqual(xlsx._apDS('a-Đ, b-S, c-Đ', k), { loi: 'đáp án Đúng/Sai "a-Đ, b-S, c-Đ" thiếu ý d)' });
  assert.deepStrictEqual(xlsx._apDS('a-Đ, b-S, c-Đ, e-S', k), { loi: 'đáp án Đúng/Sai "a-Đ, b-S, c-Đ, e-S" có ý e) không có trong câu thiếu ý d)' });
  assert.deepStrictEqual(xlsx._apDS('xyz', k), { loi: 'đáp án Đúng/Sai "xyz" không đọc được (ví dụ: ĐSĐS hoặc a-Đ, b-S, c-Đ, d-S)' });
  assert.deepStrictEqual(xlsx._apDS('DS', ['a', 'b']).map, { a: true, b: false }); // không nhầm thành khoá d
  assert.strictEqual(xlsx._docDS('A, C'), null);
  assert.strictEqual(xlsx._docDS(''), null);
});

test('docNhan: nhãn phương án', () => {
  const n = xlsx._docNhan;
  assert.deepStrictEqual(n('B'), ['B']);
  assert.deepStrictEqual(n('A, C'), ['A', 'C']);
  assert.deepStrictEqual(n('AC'), ['A', 'C']);
  assert.deepStrictEqual(n('a;c'), ['A', 'C']);
  assert.deepStrictEqual(n('B và E'), ['B', 'E']);
  assert.deepStrictEqual(n('Đáp án: D'), ['D']);
  assert.deepStrictEqual(n('ĐA: b'), ['B']);
  assert.deepStrictEqual(n('DA'), ['D', 'A']); // không ăn mất như tiền tố "ĐA"
  assert.deepStrictEqual(n('A, A, C'), ['A', 'C']);
  assert.strictEqual(n('ĐSĐS'), null);
  assert.strictEqual(n('I'), null);
  assert.strictEqual(n('12'), null);
});

test('docDapAnSo', () => {
  const f = xlsx._docDapAnSo;
  assert.deepStrictEqual(f('12,5'), { exact: 12.5, margin: 0 });
  assert.deepStrictEqual(f('12.5'), { exact: 12.5, margin: 0 });
  assert.deepStrictEqual(f('12,5 ± 0,1'), { exact: 12.5, margin: 0.1 });
  assert.deepStrictEqual(f('12,5+-0,1'), { exact: 12.5, margin: 0.1 });
  assert.deepStrictEqual(f('12,5 +/- 0,1'), { exact: 12.5, margin: 0.1 });
  assert.deepStrictEqual(f('1,5 .. 2'), { min: 1.5, max: 2 });
  assert.deepStrictEqual(f('1,5...2'), { min: 1.5, max: 2 });
  assert.deepStrictEqual(f('−3 … −1'), { min: -3, max: -1 });
  assert.deepStrictEqual(f('-0,5'), { exact: -0.5, margin: 0 });
  assert.deepStrictEqual(f('1 000'), { exact: 1000, margin: 0 });
  assert.deepStrictEqual(f('2e3'), { exact: 2000, margin: 0 });
  assert.deepStrictEqual(f('x', 0.25), { exact: 0.25, margin: 0 });
  assert.strictEqual(f('12 ± -1'), null);
  assert.strictEqual(f('8/3'), null);
  assert.strictEqual(f('abc'), null);
  assert.strictEqual(f(''), null);
});

test('khopCot / loại câu / mức độ: không phân biệt hoa thường, có/không dấu, chú thích trong ngoặc', () => {
  const k = xlsx._khopCot;
  assert.strictEqual(k('Nội dung câu hỏi'), 'noiDung');
  assert.strictEqual(k('NOI DUNG CAU HOI (*)'), 'noiDung');
  assert.strictEqual(k('Loại câu\n(chọn từ danh sách)'), 'loai');
  assert.strictEqual(k('Đáp án'), 'dapAn');
  assert.strictEqual(k('ĐA'), 'dapAn');
  assert.strictEqual(k('Phương án A'), 'A');
  assert.strictEqual(k('h'), 'H');
  assert.strictEqual(k('Ý c'), 'C');
  assert.strictEqual(k('Lời giải'), 'loiGiai');
  assert.strictEqual(k('Hướng dẫn chấm'), 'loiGiai');
  assert.strictEqual(k('Ngân hàng'), 'nganHang');
  assert.strictEqual(k('Mức độ'), 'mucDo');
  assert.strictEqual(k('Chủ đề'), 'chuDe');
  assert.strictEqual(k('Ảnh'), 'anh');
  assert.strictEqual(k('Điểm'), 'diem');
  assert.strictEqual(k('STT'), 'stt');
  assert.strictEqual(k('Ghi chú'), null);
  assert.strictEqual(k('I'), null);
  const L = xlsx._traLoai;
  const bang = { 'TN – Một đáp án': 'mc', 'NĐ - Nhiều đáp án': 'ma', 'ĐS – Đúng/Sai': 'tf', 'TLN – Trả lời ngắn': 'short', 'SỐ – Điền số': 'num',
    'ĐIỀN – Điền khuyết': 'blanks', 'CHỌN – Chọn từ danh sách': 'dropdowns', 'GHÉP – Ghép nối': 'matching', 'TL – Tự luận': 'essay', 'ĐOẠN – Đoạn dẫn': 'doan',
    'tn': 'mc', 'nd': 'ma', 'ds': 'tf', 'tln': 'short', 'so': 'num', 'dien': 'blanks', 'chon': 'dropdowns', 'ghep': 'matching', 'tl': 'essay', 'doan': 'doan',
    'Nhiều đáp án': 'ma', 'Tự luận': 'essay', 'TN-Một đáp án': 'mc', '': null };
  Object.keys(bang).forEach(s => assert.strictEqual(L(s), bang[s], s));
  assert.strictEqual(L('XYZ'), undefined);
  const M = xlsx._traMuc;
  assert.deepStrictEqual(['NB', 'nhận biết', 'TH – Thông hiểu', 'vd', 'Vận dụng cao', '4', 'abc'].map(M), ['NB', 'NB', 'TH', 'VD', 'VDC', 'VDC', undefined]);
});

test('veHtml: định dạng lồng, gộp run, xuống dòng, cắt khoảng trắng đầu/cuối, thoát HTML, ký tự cấm XML', () => {
  const v = (runs, o) => xlsx._veHtml(runs, o).html;
  assert.strictEqual(v([{ text: '  a<b & c  ' }]), 'a&lt;b &amp; c');
  assert.strictEqual(v([{ text: 'x', b: true, i: true, u: true }, { text: '2', sup: true }, { text: 'y', s: true }]), '<strong><em><u>x</u></em></strong><sup>2</sup><del>y</del>');
  assert.strictEqual(v([{ text: ' ', b: true }, { text: 'a' }, { text: '\n', b: true }, { text: 'b\tc' }]), 'a<br>b c');
  assert.strictEqual(v([{ text: 'a\u0001b' }]), 'ab');
  const r = xlsx._veHtml([{ text: 'A [[x|y]] B [[*p|q]]' }], { boxes: true });
  assert.strictEqual(r.html, 'A [b1] B [b2]');
  assert.deepStrictEqual(r.boxes, [{ id: 'b1', raw: 'x|y' }, { id: 'b2', raw: '*p|q' }]);
  // $ trong [[…]] không bị coi là công thức
  assert.strictEqual(xlsx._veHtml([{ text: '[[$5]] $x$' }], { boxes: true, latex: true, lx: LATEX_GIA }).html, '[b1] <math><mi>x</mi></math>');
});

test('giaiX, soSangChu, kieuAnh', () => {
  assert.strictEqual(xlsx._giaiX('a_x000D_b_x005F_x0041_c_x0041_'), 'a\rb_x0041_cA');
  assert.strictEqual(xlsx._soSangChu('0.25'), '0.25');
  assert.strictEqual(xlsx._soSangChu('0.30000000000000004'), '0.3');
  assert.strictEqual(xlsx._soSangChu('1E-3'), '0.001');
  assert.strictEqual(xlsx._soSangChu('12'), '12');
  assert.strictEqual(xlsx._soSangChu('2.6666666666666665'), '2.66666666666667');
  assert.strictEqual(xlsx._kieuAnh(PNG_DO), 'png');
  assert.strictEqual(xlsx._kieuAnh(JPG), 'jpg');
  assert.strictEqual(xlsx._kieuAnh(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), 'gif');
  assert.strictEqual(xlsx._kieuAnh(taoEmfGia()), 'EMF');
  assert.strictEqual(xlsx._kieuAnh(new Uint8Array([0xD7, 0xCD, 0xC6, 0x9A, 0, 0])), 'WMF');
  assert.strictEqual(xlsx._kieuAnh(core.utf8Encode('<?xml version="1.0"?><svg xmlns="x"/>')), 'SVG');
});

/* ---------------- Chạy ---------------- */

(async () => {
  fs.mkdirSync(THU_MUC, { recursive: true });
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  đạt  ' + ten); } catch (e) { hong++; console.log('  HỎNG ' + ten + '\n' + String(e && e.stack || e).split('\n').map(l => '        ' + l).join('\n')); }
  }
  console.log(hong ? hong + '/' + ds.length + ' test hỏng' : 'Đạt ' + ds.length + '/' + ds.length + ' test xlsx');
  process.exitCode = hong ? 1 : 0;
})();
