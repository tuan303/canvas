/* tests/docx-word.test.cjs — kiểm bộ đọc Word trên các file DO WORD THẬT GHI RA (tests/fixtures/docx/word-*.docx)
 * Các fixture được dựng bằng Word qua COM (tests/fixtures/docx/tao-word.ps1), mô phỏng cấu trúc các đề thật của trường:
 * đề THPT 2025 + hướng dẫn chấm riêng, đề đọc IELTS bôi vàng đáp án, đề tiểu học dàn trong bảng + bảng Item | Key,
 * đề tiếng Anh đánh số "1.", mẫu upload câu hỏi [OC-NB] … ANSWER, mẫu NGÂN HÀNG với "Câu %1." do Word tự đánh số.
 * XML do Word ghi (công thức OMath sau BuildUp, numbering.xml, tô nền, bảng lồng, ảnh) là "sự thật"; không cần Word để chạy test.
 * Chạy: node tests/docx-word.test.cjs */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');
const zip = require('../js/zip.js');
const docx = require('../js/docx.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }
const THU_MUC = path.join(__dirname, 'fixtures', 'docx');
const MATH = '<math xmlns="http://www.w3.org/1998/Math/MathML">';
const doc = (ten) => new Uint8Array(fs.readFileSync(path.join(THU_MUC, ten)));
const doc1 = (ten, opts) => docx.parseDocx(doc(ten), Object.assign({ fileName: ten }, opts || {}));
const loi = (q, level) => q.issues.filter((i) => !level || i.level === level);
const dung = (q) => (q.choices || []).filter((c) => c.correct).map((c) => c.id);
const chu = (h) => String(h).replace(/<math[\s\S]*?<\/math>/g, '∑').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function khongLoi(q) { assert.deepStrictEqual(loi(q, 'error').map((i) => i.msg), [], q.title + ' còn lỗi'); }
function sachHet(q) { assert.deepStrictEqual(loi(q, 'error').concat(loi(q, 'warn')).map((i) => i.msg), [], q.title + ' còn lỗi/cảnh báo'); }
const chiThieuDapAn = (q) => loi(q, 'error').every((i) => /chưa xác định đáp án|chưa có đáp án|chưa xác định ý nào Đúng\/Sai|chưa xác định Đúng hay Sai/.test(i.msg));
async function apKey(de, da) {
  const key = await docx.parseAnswerKey(doc(da), { fileName: da });
  const kq = await doc1(de);
  const r = docx.applyAnswerKey(kq.banks, key);
  return { key, kq, r, qs: kq.banks[0].questions };
}

test('mọi fixture word-*.docx là file Word ghi (docProps/app.xml), không còn tên người soạn', async () => {
  const ten = fs.readdirSync(THU_MUC).filter((f) => /^word-.*\.docx$/.test(f)).sort();
  assert.deepStrictEqual(ten, ['word-danh-so.docx', 'word-ielts.docx', 'word-thpt-hdc.docx', 'word-thpt.docx', 'word-tieng-anh-key.docx', 'word-tieng-anh.docx',
    'word-tieu-hoc-key.docx', 'word-tieu-hoc.docx', 'word-upload.docx']);
  for (const t of ten) {
    const z = await zip.readZip(doc(t));
    assert.ok(/<Application>Microsoft Office Word<\/Application>/.test(core.utf8Decode(z['docProps/app.xml'])), t);
    assert.ok(/<dc:creator><\/dc:creator>/.test(core.utf8Decode(z['docProps/core.xml'])), t + ': còn tên tác giả');
    assert.ok(/w14:paraId=/.test(core.utf8Decode(z['word/document.xml'])), t + ': không phải XML do Word ghi');
  }
});

test('word-thpt: PHẦN I/II/III, phương án cách tab và trong danh sách Word tự đánh số, bảng số liệu, ảnh, công thức OMath (phân số, căn, chỉ số, tích phân, ℝ)', async () => {
  const z = await zip.readZip(doc('word-thpt.docx'));
  const x = core.utf8Decode(z['word/document.xml']);
  assert.ok((x.match(/<m:oMath>/g) || []).length >= 12 && /<m:nary>/.test(x) && /<w:numPr>/.test(x), 'Word phải ghi OMath + đánh số tự động');
  const kq = await doc1('word-thpt.docx');
  assert.ok(!kq.keyOnly);
  const b = kq.banks[0], qs = b.questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '1', '2', '1', '2', '3']);
  assert.deepStrictEqual(qs.map((q) => q.type), ['mc', 'mc', 'mc', 'mc', 'tf', 'tf', 'short', 'short', 'short']);
  assert.deepStrictEqual(qs.map((q) => q.title.replace(/^Câu \d+ /, '')), ['(Phần I)', '(Phần I)', '(Phần I)', '(Phần I)', '(Phần II)', '(Phần II)', '(Phần III)', '(Phần III)', '(Phần III)']);
  assert.ok(qs.every(chiThieuDapAn), 'đề không có đáp án: chỉ được báo thiếu đáp án');
  // công thức
  assert.strictEqual(qs[0].stem, '<p>Giá trị của biểu thức ' + MATH + '<mfrac><mrow><mn>2</mn><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mrow><mi>x</mi><mo>−</mo><mn>1</mn></mrow></mfrac></math> tại x = 2 là</p>');
  assert.deepStrictEqual(qs[0].choices.map((c) => c.html), ['5.', '3.', '1.', '7.']);
  assert.ok(qs[1].stem.indexOf('<msqrt><mi>x</mi><mo>+</mo><mn>3</mn></msqrt>') > 0, qs[1].stem);
  assert.strictEqual(qs[1].choices[3].html, MATH + '<mi>ℝ</mi></math>.');
  assert.ok(/<mo fence="true">\[<\/mo>/.test(qs[1].choices[0].html) && /∞/.test(qs[1].choices[0].html));
  assert.ok(/<msub><mi>u<\/mi><mi>n<\/mi><\/msub>/.test(qs[4].stem));
  assert.ok(/<msubsup><mo>∫<\/mo><mn>0<\/mn><mn>2<\/mn><\/msubsup>/.test(qs[6].stem), qs[6].stem);
  // bảng số liệu trong nội dung; ảnh PNG; phương án do Word tự đánh số
  assert.ok(/<table style="border-collapse:collapse">/.test(qs[2].stem) && /118/.test(qs[2].stem));
  assert.deepStrictEqual(qs[2].choices.map((c) => c.html), ['X.', 'Y.', 'Z.', 'X và Y.']);
  assert.ok(/<img src="images\/img_\d{3}\.png" alt="Hình binh-cau"/.test(qs[3].stem), qs[3].stem);
  assert.deepStrictEqual(qs[3].choices.map((c) => [c.id, c.html]), [['A', 'ống nghiệm.'], ['B', 'bình cầu.'], ['C', 'phễu.'], ['D', 'cốc thuỷ tinh.']]);
  assert.strictEqual(Object.keys(b.images).length, 1);
  assert.strictEqual(qs[5].statements.length, 4);
});

test('word-thpt-hdc: file hướng dẫn chấm → keyOnly; bảng Phần I, bảng Đúng/Sai có ô gộp, "Câu 1." + ô số; áp vào word-thpt hết lỗi', async () => {
  const chi = await doc1('word-thpt-hdc.docx');
  assert.strictEqual(chi.keyOnly, true);
  assert.deepStrictEqual(chi.banks, []);
  assert.deepStrictEqual(chi.key.answers, {
    1: { 1: 'A', 2: 'A', 3: 'C', 4: 'B' },
    2: { 1: 'a) Đ; b) S; c) Đ; d) Đ', 2: 'a) Đ; b) S; c) S; d) Đ' },
    3: { 1: '4', 2: '7', 3: '13' }
  });
  const { r, qs } = await apKey('word-thpt.docx', 'word-thpt-hdc.docx');
  assert.deepStrictEqual([r.matched, r.filled, r.conflicts, r.unused.length], [9, 9, 0, 0]);
  assert.deepStrictEqual(qs.slice(0, 4).map((q) => dung(q).join('')), ['A', 'A', 'C', 'B']);
  assert.deepStrictEqual(qs[4].statements.map((s) => s.value), [true, false, true, true]);
  assert.deepStrictEqual(qs[5].statements.map((s) => s.value), [true, false, false, true]);
  assert.deepStrictEqual(qs.slice(6).map((q) => q.answers), [['4'], ['7'], ['13']]);
  qs.forEach(khongLoi);
});

test('word-ielts: ô trống đánh số + đáp án tô vàng, [FALSE]/[NOT GIVEN] → bộ TRUE/FALSE/NOT GIVEN, "Questions 6-7" chọn HAI chữ cái → 1 câu 2 điểm, nhãn tô vàng', async () => {
  const kq = await doc1('word-ielts.docx');
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5', '6-7', '8', '9', '10', '11']);
  assert.deepStrictEqual(qs.map((q) => q.type), ['short', 'short', 'short', 'mc', 'mc', 'ma', 'mc', 'mc', 'short', 'short']);
  assert.deepStrictEqual([0, 1, 2, 8, 9].map((i) => qs[i].answers[0]), ['storm water', 'sedum', 'trays', 'hardy', 'Researchers']);
  assert.strictEqual(qs[0].stem, '<p>Benefits: cool buildings and reduce <strong>(1) ______</strong></p>');
  assert.deepStrictEqual(qs[3].choices.map((c) => c.html), ['TRUE', 'FALSE', 'NOT GIVEN']);
  assert.deepStrictEqual([dung(qs[3]), dung(qs[4])], [['B'], ['C']]);
  assert.strictEqual(qs[3].stem, '<p>Green roofs make buildings warmer in summer.</p>');
  assert.deepStrictEqual(dung(qs[5]), ['B', 'D']);
  assert.strictEqual(qs[5].points, 2);
  assert.deepStrictEqual(qs[5].choices.map((c) => c.html), ['lower noise', 'cooler buildings', 'cheaper insurance', 'less storm water', 'more birds']);
  assert.deepStrictEqual([dung(qs[6]), dung(qs[7])], [['C'], ['B']]);
  // đoạn văn của "READING PASSAGE 1" + lời dặn của từng nhóm câu là đoạn dẫn
  qs.forEach((q) => assert.ok(/Rooftop Gardens/.test(q.stimulus) && /City planners/.test(q.stimulus), q.title));
  assert.ok(/TRUE/.test(qs[3].stimulus) && !/TRUE/.test(qs[0].stimulus));
  assert.strictEqual(qs[0].meta.part, 'READING PASSAGE 1');
  qs.forEach(sachHet);
});

test('word-tieu-hoc: câu trong bảng, ví dụ "0." bỏ, ảnh làm phương án, bảng từ A–E dùng chung, bảng lồng có đoạn văn, YES/NO; + word-tieu-hoc-key (Item | Key, mã năng lực, câu viết)', async () => {
  const kq = await doc1('word-tieu-hoc.docx');
  const b = kq.banks[0], qs = b.questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  assert.ok(b.warnings.some((w) => /Bỏ qua 4 câu ví dụ/.test(w.msg)), JSON.stringify(b.warnings));
  assert.deepStrictEqual([...new Set(qs.map((q) => q.meta.part))], ['I. Vocabulary', 'II. Reading', 'III. Writing']);
  assert.strictEqual(qs[0].stem, '<p>/c/</p>');
  assert.ok(qs[0].choices.every((c) => /^<img src="images\/img_\d{3}\.png" alt="Hình (bed|cake|bus)"/.test(c.html)), JSON.stringify(qs[0].choices));
  assert.ok(/Look and CIRCLE/.test(qs[0].stimulus));
  assert.deepStrictEqual(qs[2].choices.map((c) => [c.id, c.html]), [['A', 'on'], ['B', 'in'], ['C', 'under'], ['D', 'small'], ['E', 'big']]);
  assert.strictEqual(qs[2].stem, '<p>The book is ______ the bag.</p>');
  assert.ok(/My pet/.test(qs[4].stimulus) && /Kitty/.test(qs[4].stimulus) && qs[4].stem === '', qs[4].stimulus);
  assert.deepStrictEqual(qs[5].choices.map((c) => c.html), ['eat', 'eats', 'eating']);
  assert.deepStrictEqual(qs[6].choices.map((c) => c.html), ['Yes', 'No']);
  assert.deepStrictEqual([qs[8].type, /Answer: _+/.test(qs[8].stem), /<img /.test(qs[8].stem)], ['essay', true, true]);
  assert.ok(qs.every(chiThieuDapAn));
  const chi = await doc1('word-tieu-hoc-key.docx');
  assert.strictEqual(chi.keyOnly, true);
  assert.deepStrictEqual(chi.key.answers[''], { 1: 'B', 2: 'A', 3: 'B', 4: 'E', 5: 'B', 6: 'C', 7: 'YES', 8: 'NO', 9: 'It’s under the table.', 10: 'She likes fish.' });
  const k = await apKey('word-tieu-hoc.docx', 'word-tieu-hoc-key.docx');
  assert.deepStrictEqual([k.r.matched, k.r.filled, k.r.conflicts], [10, 10, 0]);
  assert.deepStrictEqual(k.qs.slice(0, 8).map((q) => dung(q).join('')), ['B', 'A', 'B', 'E', 'B', 'C', 'A', 'B']);
  assert.ok(/<p>Đáp án: It’s under the table\.<\/p>/.test(k.qs[8].feedback) && k.qs[8].type === 'essay');
  k.qs.forEach(khongLoi);
});

test('word-tieng-anh: "1. A. … B. …" cùng dòng, gạch chân âm giữ lại, "B. GRAMMAR", lời dặn Word tự đánh số "3.", tìm lỗi sai, đoạn văn điền từ; + word-tieng-anh-key', async () => {
  const kq = await doc1('word-tieng-anh.docx');
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepStrictEqual(qs.map((q) => q.type), ['mc', 'mc', 'essay', 'essay', 'mc', 'mc', 'mc', 'mc']);
  assert.deepStrictEqual(qs[0].choices.map((c) => c.html), ['play<u>ed</u>', 'watch<u>ed</u>', 'cook<u>ed</u>', 'jump<u>ed</u>']);
  assert.deepStrictEqual(qs[1].choices.map((c) => c.html), ['<u>th</u>ink', '<u>th</u>is', '<u>th</u>ree', '<u>th</u>ank']);
  assert.ok(/Which word has a different sound/.test(qs[0].stimulus) && /There is one example/.test(qs[0].stimulus));
  assert.ok(/<table/.test(qs[2].stimulus) && /forest/.test(qs[2].stimulus));
  assert.strictEqual(qs[4].meta.part, 'B. GRAMMAR');
  assert.ok(/3\.\s*CHOOSE the best answer/.test(chu(qs[4].stimulus)), qs[4].stimulus); // số "3." do Word tự đánh
  assert.strictEqual(qs[4].stem, '<p>She ……………… to school every day.</p>');
  assert.deepStrictEqual(qs[5].choices.map((c) => [c.id, c.html]), [['A', 'don’t'], ['B', 'apples'], ['C', 'because'], ['D', 'are']]);
  assert.ok(/Tom lives near the sea/.test(qs[6].stimulus) && qs[6].stem === '');
  const k = await apKey('word-tieng-anh.docx', 'word-tieng-anh-key.docx');
  assert.deepStrictEqual([k.r.matched, k.r.filled], [8, 8]);
  assert.deepStrictEqual(k.qs.map((q) => q.choices ? dung(q).join('') : q.answers[0]), ['A', 'B', 'Forest', 'River', 'B', 'A', 'B', 'B']);
  k.qs.forEach(khongLoi);
});

test('word-upload: mẫu upload [TF/OC/FB/SDL/MC/ES/EM-mức độ] + ANSWER có trọng số, [[1]] = 50, câu chùm', async () => {
  const kq = await doc1('word-upload.docx');
  const qs = kq.banks[0].questions;
  assert.deepStrictEqual(qs.map((q) => q.no), ['1', '2', '3', '4', '5', '6', '7.1', '7.2', '7.3']);
  assert.deepStrictEqual(qs.map((q) => q.type), ['mc', 'mc', 'blanks', 'dropdowns', 'ma', 'essay', 'mc', 'blanks', 'essay']);
  assert.deepStrictEqual(qs.map((q) => q.meta.level), ['NB', 'TH', 'TH', 'VD', 'VD', 'VDC', 'NB', 'NB', 'NB']);
  assert.deepStrictEqual([dung(qs[0]), dung(qs[1]), dung(qs[4]), dung(qs[6])], [['A'], ['A'], ['A', 'B'], ['B']]);
  assert.strictEqual(qs[2].stem, '<p>Mặt trời mọc ở hướng [b1],</p><p>lặn ở hướng [b2].</p>');
  assert.deepStrictEqual(qs[2].blanks, [{ id: 'b1', accepts: ['đông'] }, { id: 'b2', accepts: ['tây'] }]);
  assert.ok(qs[3].stem.indexOf(MATH) > 0 && /\[b1\]<\/p>$/.test(qs[3].stem), qs[3].stem);
  assert.deepStrictEqual(qs[3].dropdowns, [{ id: 'b1', options: ['hai', 'một', 'không có'], correct: 0 }]);
  assert.strictEqual(qs[5].feedback, '<p>- Mở rộng hiểu biết.</p><p>- Rèn khả năng tập trung.</p>');
  assert.strictEqual(qs[6].stimulus, '<p>Đọc thông tin sau và trả lời các câu hỏi:</p><p>Lan có 3 quả táo và 2 quả cam.</p>');
  assert.deepStrictEqual(qs[7].blanks, [{ id: 'b3', accepts: ['5'] }]);
  qs.forEach(sachHet);
});

test('word-danh-so: "Câu %1." gắn với kiểu đoạn + phương án Word tự đánh số (khởi động lại mỗi câu), chữ đỏ / tô nền / dòng Đáp án, công thức trong phương án', async () => {
  const z = await zip.readZip(doc('word-danh-so.docx'));
  const n = core.utf8Decode(z['word/numbering.xml']), st = core.utf8Decode(z['word/styles.xml']);
  assert.ok(/w:lvlText w:val="Câu %1\."/.test(n) && /w:pStyle w:val="CauHoi"/.test(n) && /w:styleId="CauHoi"/.test(st), 'số câu phải đi theo kiểu đoạn');
  const kq = await doc1('word-danh-so.docx');
  const b = kq.banks[0], qs = b.questions;
  assert.strictEqual(b.title, 'Thử Word tự đánh số');
  assert.deepStrictEqual(qs.map((q) => [q.no, q.type, q.stem.replace(/<math[\s\S]*<\/math>/, '∑')]), [
    ['1', 'mc', '<p>Thủ đô của Pháp là</p>'], ['2', 'mc', '<p>Giá trị của ∑ là</p>'], ['3', 'mc', '<p>Đẳng thức nào luôn đúng?</p>'], ['4', 'tf', '<p>Xét tính đúng sai của các mệnh đề sau:</p>']]);
  assert.deepStrictEqual(qs.slice(0, 3).map((q) => q.choices.map((c) => c.id).join('')), ['ABCD', 'ABCD', 'ABC']);
  assert.deepStrictEqual(qs.slice(0, 3).map(dung), [['A'], ['B'], ['A']]);
  assert.strictEqual(qs[0].choices[0].html, 'Paris'); // chữ đỏ đánh dấu đáp án không vào HTML
  assert.ok(qs[2].choices.every((c) => c.html.indexOf(MATH) === 0));
  assert.deepStrictEqual(qs[3].statements.map((s) => [s.key, s.value]), [['a', true], ['b', false], ['c', true]]);
  qs.forEach(sachHet);
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 14).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (docx-word)');
  process.exitCode = hong ? 1 : 0;
})();
