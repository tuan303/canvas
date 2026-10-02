/* tests/kiem-qti.test.cjs — kiểm thử bộ kiểm tra QTI độc lập tests/kiem-qti.cjs (chạy: node tests/kiem-qti.test.cjs)
 * Gói mẫu viết tay theo reconciled.md §1–§2 (KHÔNG dùng js/qti.js); mỗi luật có một gói hỏng cố ý. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const kq = require('./kiem-qti.cjs');
let zip = null;
try { zip = require('../js/zip.js'); } catch (e) { /* zip.js chưa có thì bỏ qua ca zip */ }

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

/* ---------------- dựng gói mẫu (viết tay theo R§1–§2) ---------------- */
const BANK = 'nh_toan_12_ab12cd';
const TITLE = 'Toán 12 – Chương 1';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = s => esc(s).replace(/"/g, '&quot;');
const XML = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NS_QTI = 'xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd"';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function md(type, points, oaid) {
  return '<itemmetadata><qtimetadata>' +
    '<qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>' + type + '</fieldentry></qtimetadatafield>' +
    '<qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>' + points + '</fieldentry></qtimetadatafield>' +
    '<qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>' + (oaid || '') + '</fieldentry></qtimetadatafield>' +
    '</qtimetadata></itemmetadata>';
}
const stem = html => '<material><mattext texttype="text/html">' + esc('<div>' + html + '</div>') + '</mattext></material>';
const DECVAR = '<outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>';
const FB_COND = '<respcondition continue="Yes"><conditionvar><other/></conditionvar><displayfeedback feedbacktype="Response" linkrefid="general_fb"/></respcondition>';
const fbBlock = html => '<itemfeedback ident="general_fb"><flow_mat><material><mattext texttype="text/html">' + esc(html) + '</mattext></material></flow_mat></itemfeedback>';
const plain = (id, t) => '<response_label ident="' + id + '"><material><mattext texttype="text/plain">' + esc(t) + '</mattext></material></response_label>';
const htmlLb = (id, h) => '<response_label ident="' + id + '"><material><mattext texttype="text/html">' + esc(h) + '</mattext></material></response_label>';
const item = (n, title, body) => '<item ident="' + BANK + '_q' + String(n).padStart(2, '0') + '" title="' + escA(title) + '">' + body + '</item>';

const ITEMS = {
  mc: item(1, 'Câu 1 [NB]', md('multiple_choice_question', 1, '101,102,103,104') +
    '<presentation>' + stem('Giá trị của <math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math> + 0,5 là <img src="images/img_001.png" alt="" style="max-width:100%;height:auto">') +
    '<response_lid ident="response1" rcardinality="Single"><render_choice>' +
    plain(101, '0') + plain(102, '1') + htmlLb(103, '<strong>2</strong>') + plain(104, '1 & 2') +
    '</render_choice></response_lid></presentation>' +
    '<resprocessing>' + DECVAR + FB_COND +
    '<respcondition continue="No"><conditionvar><varequal respident="response1">102</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>' +
    '</resprocessing>' + fbBlock('<p>Vì ½ + 0,5 = 1.</p>')),
  tf: item(2, 'Câu 2', md('true_false_question', 1, '201,202') +
    '<presentation>' + stem('2 là số nguyên tố.') + '<response_lid ident="response1" rcardinality="Single"><render_choice>' +
    plain(201, 'True') + plain(202, 'False') + '</render_choice></response_lid></presentation>' +
    '<resprocessing>' + DECVAR + '<respcondition continue="No"><conditionvar><varequal respident="response1">201</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>'),
  ma: item(3, 'Câu 3', md('multiple_answers_question', 2, '301,302,303,304') +
    '<presentation>' + stem('Chọn các số chẵn.') + '<response_lid ident="response1" rcardinality="Multiple"><render_choice>' +
    plain(301, '2') + plain(302, '3') + plain(303, '4') + plain(304, '5') + '</render_choice></response_lid></presentation>' +
    '<resprocessing>' + DECVAR + '<respcondition continue="No"><conditionvar><and>' +
    '<varequal respident="response1">301</varequal><not><varequal respident="response1">302</varequal></not>' +
    '<varequal respident="response1">303</varequal><not><varequal respident="response1">304</varequal></not>' +
    '</and></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>'),
  short: item(4, 'Câu 4', md('short_answer_question', 1, '') +
    '<presentation>' + stem('Thủ đô của Việt Nam?') + '<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>' +
    '<resprocessing>' + DECVAR + '<respcondition continue="No"><conditionvar>' +
    '<varequal respident="response1">Hà Nội</varequal><varequal respident="response1">Ha Noi</varequal>' +
    '</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>'),
  num: item(5, 'Câu 5', md('numerical_question', 1, '') +
    '<presentation>' + stem('Tính 25/2.') + '<response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str></presentation>' +
    '<resprocessing>' + DECVAR +
    '<respcondition continue="No"><conditionvar><or><varequal respident="response1">12.5</varequal><and><vargte respident="response1">12.4</vargte><varlte respident="response1">12.6</varlte></and></or></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>' +
    '<respcondition continue="No"><conditionvar><vargte respident="response1">100</vargte><varlte respident="response1">200</varlte></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>' +
    '</resprocessing>'),
  fimb: item(6, 'Câu 6', md('fill_in_multiple_blanks_question', 2, '601,602,603') +
    '<presentation>' + stem('Thủ đô Việt Nam là [b1], của Pháp là [b2]. Đoạn [−10;10] giữ nguyên.') +
    '<response_lid ident="response_b1" rcardinality="Single"><material><mattext>b1</mattext></material><render_choice>' + plain(601, 'Hà Nội') + plain(602, 'Ha Noi') + '</render_choice></response_lid>' +
    '<response_lid ident="response_b2" rcardinality="Single"><material><mattext>b2</mattext></material><render_choice>' + plain(603, 'Paris') + '</render_choice></response_lid>' +
    '</presentation><resprocessing>' + DECVAR +
    '<respcondition><conditionvar><varequal respident="response_b1">601</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>' +
    '<respcondition><conditionvar><varequal respident="response_b2">603</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>' +
    '</resprocessing>'),
  dd: item(7, 'Câu 7', md('multiple_dropdowns_question', 1, '701,702,703,704') +
    '<presentation>' + stem('a) 2 &gt; 1 [s1]<br>b) 1 &gt; 2 [s2]') +
    '<response_lid ident="response_s1" rcardinality="Single"><material><mattext>s1</mattext></material><render_choice>' + plain(701, 'Đúng') + plain(702, 'Sai') + '</render_choice></response_lid>' +
    '<response_lid ident="response_s2" rcardinality="Single"><material><mattext>s2</mattext></material><render_choice>' + plain(703, 'Đúng') + plain(704, 'Sai') + '</render_choice></response_lid>' +
    '</presentation><resprocessing>' + DECVAR +
    '<respcondition><conditionvar><varequal respident="response_s1">701</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>' +
    '<respcondition><conditionvar><varequal respident="response_s2">704</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>' +
    '</resprocessing>'),
  match: item(8, 'Câu 8', md('matching_question', 2, '801,802') +
    '<presentation>' + stem('Ghép thủ đô với nước.') +
    ['801', '802'].map((l, k) => '<response_lid ident="response_' + l + '" rcardinality="Single"><material><mattext texttype="text/plain">' + ['Hà Nội', 'Paris'][k] + '</mattext></material><render_choice>' +
      plain(851, 'Việt Nam') + plain(852, 'Pháp') + plain(853, 'Lào') + '</render_choice></response_lid>').join('') +
    '</presentation><resprocessing>' + DECVAR +
    '<respcondition><conditionvar><varequal respident="response_801">851</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>' +
    '<respcondition><conditionvar><varequal respident="response_802">852</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>' +
    '</resprocessing>'),
  essay: item(9, 'Câu 9', md('essay_question', 3, '') +
    '<presentation>' + stem('Trình bày cách giải.') + '<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>' +
    '<resprocessing>' + DECVAR + FB_COND + '<respcondition continue="No"><conditionvar><other/></conditionvar></respcondition></resprocessing>' + fbBlock('<p>Hướng dẫn chấm…</p>')),
  text: item(10, 'Đoạn dẫn', md('text_only_question', 0, '') + '<presentation>' + stem('<p>Đọc đoạn sau…</p>') + '</presentation>')
};

function manifest(resources) {
  return XML + '<manifest identifier="' + BANK + '_manifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<metadata><schema>IMS Content</schema><schemaversion>1.1.3</schemaversion><imsmd:lom><imsmd:general><imsmd:title><imsmd:string>' + esc(TITLE) + '</imsmd:string></imsmd:title></imsmd:general></imsmd:lom></metadata>' +
    '<organizations/><resources>' + resources + '</resources></manifest>';
}
const resImg = '<resource identifier="img_1" type="webcontent" href="images/img_001.png"><file href="images/img_001.png"/></resource>';
const BANK_PATH = 'non_cc_assessments/' + BANK + '.xml.qti';
function bankFile(items, title) {
  return XML + '<questestinterop ' + NS_QTI + '><objectbank ident="' + BANK + '"><qtimetadata><qtimetadatafield><fieldlabel>bank_title</fieldlabel><fieldentry>' +
    esc(title == null ? TITLE : title) + '</fieldentry></qtimetadatafield></qtimetadata>' + items + '</objectbank></questestinterop>';
}
function classic(items) {
  const its = items || Object.values(ITEMS).join('');
  return {
    'imsmanifest.xml': manifest('<resource identifier="' + BANK + '" type="imsqti_xmlv1p2" href="' + BANK_PATH + '"><file href="' + BANK_PATH + '"/></resource>' + resImg),
    [BANK_PATH]: bankFile(its),
    'images/img_001.png': PNG
  };
}
const QUIZ = BANK + '_quiz';
function metaXml(o) {
  o = Object.assign({ ident: QUIZ, title: TITLE, points: 14, ref: QUIZ }, o || {});
  return XML + '<quiz identifier="' + o.ident + '" xmlns="http://canvas.instructure.com/xsd/cccv1p0"><title>' + esc(o.title) + '</title><description></description>' +
    '<shuffle_answers>false</shuffle_answers><scoring_policy>keep_highest</scoring_policy><quiz_type>assignment</quiz_type><points_possible>' + o.points + '</points_possible>' +
    '<allowed_attempts>1</allowed_attempts><available>false</available>' +
    '<assignment identifier="' + QUIZ + '_asg"><quiz_identifierref>' + o.ref + '</quiz_identifierref></assignment></quiz>';
}
function itembank(o) {
  o = o || {};
  const its = o.items || Object.values(ITEMS).join('');
  const resQuiz = '<resource identifier="' + (o.resId || QUIZ) + '" type="imsqti_xmlv1p2"><file href="' + QUIZ + '/' + QUIZ + '.xml"/>' +
    (o.noDep ? '' : '<dependency identifierref="' + QUIZ + '_meta"/>') + '</resource>';
  const resMeta = '<resource identifier="' + QUIZ + '_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="' + (o.metaHref || QUIZ + '/assessment_meta.xml') + '"><file href="' + (o.metaHref || QUIZ + '/assessment_meta.xml') + '"/></resource>';
  const files = {
    'imsmanifest.xml': manifest(resQuiz + resMeta + resImg),
    [QUIZ + '/' + QUIZ + '.xml']: XML + '<questestinterop ' + NS_QTI + '><assessment ident="' + QUIZ + '" title="' + escA(TITLE) + '"><qtimetadata><qtimetadatafield><fieldlabel>cc_maxattempts</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield></qtimetadata>' +
      '<section ident="root_section">' + its + '</section></assessment></questestinterop>',
    'images/img_001.png': PNG
  };
  files[o.metaHref || QUIZ + '/assessment_meta.xml'] = metaXml(o.meta);
  return files;
}

// thay một đoạn trong một file của gói (báo lỗi nếu không thấy — tránh ca thử "đạt" vì thay hụt)
function sua(files, file, tu, thanh) {
  const out = Object.assign({}, files);
  const s = out[file];
  assert.ok(typeof s === 'string' && s.includes(tu), 'không thấy "' + tu + '" trong ' + file);
  out[file] = s.split(tu).join(thanh);
  return out;
}
const suaBank = (tu, thanh) => sua(classic(), BANK_PATH, tu, thanh);
const motItem = (k, tu, thanh) => { const x = ITEMS[k]; assert.ok(x.includes(tu), 'không thấy "' + tu + '" trong item ' + k); return classic(x.split(tu).join(thanh)); };

function codes(r, level) { return (level === 'warn' ? r.warnings : level === 'error' ? r.errors : r.errors.concat(r.warnings)).map(e => e.code); }
function phaiCo(files, code, level, opts) {
  const r = kq.checkPackage(files, opts);
  const c = codes(r, level || 'error');
  assert.ok(c.includes(code), 'mong đợi ' + (level || 'error') + ' "' + code + '"\n' + kq.formatReport(r));
  return r;
}
function itemCua(r, n) { return r.banks.concat(r.quizzes).flatMap(b => b.items).find(i => i.ident === BANK + '_q' + String(n).padStart(2, '0')); }

/* ---------------- gói tốt ---------------- */

test('gói classic viết tay đủ 10 loại: 0 lỗi, 0 cảnh báo', () => {
  const r = kq.checkPackage(classic(), { layout: 'classic' });
  assert.deepStrictEqual(r.errors, [], kq.formatReport(r));
  assert.deepStrictEqual(r.warnings, [], kq.formatReport(r));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.layout, 'classic');
  assert.strictEqual(r.banks.length, 1);
  assert.strictEqual(r.banks[0].ident, BANK);
  assert.strictEqual(r.banks[0].title, TITLE);
  assert.strictEqual(r.banks[0].items.length, 10);
  assert.strictEqual(r.quiz, undefined);
});

test('gói itembank (assessment + assessment_meta.xml): 0 lỗi, 0 cảnh báo', () => {
  const r = kq.checkPackage(itembank(), { layout: 'itembank' });
  assert.deepStrictEqual(r.errors, [], kq.formatReport(r));
  assert.deepStrictEqual(r.warnings, [], kq.formatReport(r));
  assert.strictEqual(r.layout, 'itembank');
  assert.strictEqual(r.quiz.ident, QUIZ);
  assert.strictEqual(r.quiz.metaPath, QUIZ + '/assessment_meta.xml');
  assert.strictEqual(r.quiz.meta.points_possible, '14');
  assert.strictEqual(r.quiz.items.length, 10);
});

test('mô phỏng importer: đáp án đúng theo cách Canvas đọc', () => {
  const r = kq.checkPackage(classic());
  const it = n => itemCua(r, n);
  assert.deepStrictEqual(it(1).correct.correct, ['102']);
  assert.strictEqual(it(1).canvasType, 'multiple_choice_question');
  assert.strictEqual(it(1).correct.choices[2].text, '2');            // phương án HTML → chữ
  assert.strictEqual(it(1).correct.choices[3].text, '1 & 2');
  assert.deepStrictEqual(it(1).images, ['images/img_001.png']);
  assert.strictEqual(it(1).points, 1);
  assert.strictEqual(it(2).canvasType, 'true_false_question');
  assert.deepStrictEqual(it(2).correct.correct, ['201']);
  assert.deepStrictEqual(it(3).correct.correct, ['301', '303']);
  assert.deepStrictEqual(it(4).correct.accepted, ['Hà Nội', 'Ha Noi']);
  assert.deepStrictEqual(it(5).correct.answers, [{ type: 'exact', exact: 12.5, margin: 0.1 }, { type: 'range', start: 100, end: 200 }]);
  assert.deepStrictEqual(it(6).correct.blanks, { b1: ['Hà Nội', 'Ha Noi'], b2: ['Paris'] });
  assert.deepStrictEqual(it(7).correct.blanks.s1.correct, '701');
  assert.deepStrictEqual(it(7).correct.blanks.s2, { options: [{ id: '703', text: 'Đúng' }, { id: '704', text: 'Sai' }], correct: '704' });
  assert.deepStrictEqual(it(8).correct.pairs.map(p => [p.left, p.right]), [['Hà Nội', 'Việt Nam'], ['Paris', 'Pháp']]);
  assert.deepStrictEqual(it(8).correct.distractors, ['Lào']);
  assert.strictEqual(it(9).correct, null);
  assert.strictEqual(it(10).canvasType, 'text_only_question');
  assert.strictEqual(it(10).points, 0);
  assert.ok(/102: 1/.test(it(1).summary), it(1).summary);
});

test('grade(): mô phỏng chấm Canvas Classic (R§2.11)', () => {
  const r = kq.checkPackage(classic());
  const it = n => itemCua(r, n);
  assert.strictEqual(kq.grade(it(1), '102').score, 1);
  assert.strictEqual(kq.grade(it(1), '101').score, 0);
  assert.strictEqual(kq.grade(it(3), ['301', '303']).score, 2);
  assert.strictEqual(kq.grade(it(3), ['301']).score, 1);
  assert.strictEqual(kq.grade(it(3), ['301', '302']).score, 0);      // đúng 1 − sai 1
  assert.strictEqual(kq.grade(it(3), ['301', '302', '303']).score, 1);
  assert.strictEqual(kq.grade(it(4), '  hà nội ').score, 1);         // strip + downcase
  assert.strictEqual(kq.grade(it(4), 'Hà  Nội').score, 0);           // khoảng trắng bên trong vẫn tính
  assert.strictEqual(kq.grade(it(5), '12.55').score, 1);
  assert.strictEqual(kq.grade(it(5), '12,55').score, 0);             // locale vi: "," là phân cách nghìn → 1255
  assert.strictEqual(kq.grade(it(5), '12,5').score, 1);              // → 125, rơi vào khoảng [100; 200]
  assert.strictEqual(kq.grade(it(5), '150').score, 1);
  assert.strictEqual(kq.grade(it(6), { b1: 'ha noi', b2: 'x' }).score, 1);
  assert.strictEqual(kq.grade(it(7), { s1: '701', s2: '704' }).score, 1);
  assert.strictEqual(kq.grade(it(7), { s1: '701', s2: '703' }).score, 0.5);
  assert.strictEqual(kq.grade(it(8), { response_801: '851', response_802: '853' }).score, 1);
  assert.strictEqual(kq.grade(it(9), 'bài làm'), null);
});

test('checkZip + CLI: zip đọc bằng js/zip.js, mã thoát 0/1', async () => {
  if (!zip) return console.log('       (bỏ qua: chưa có js/zip.js)');
  const toFiles = f => Object.keys(f).map(p => ({ path: p, data: f[p] }));
  const u8 = await zip.writeZip(toFiles(classic()), { compress: true });
  const r = await kq.checkZip(u8);
  assert.strictEqual(r.ok, true, kq.formatReport(r));
  assert.strictEqual(r.banks[0].items.length, 10);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiemqti-'));
  try {
    const tot = path.join(tmp, 'tot.zip'), hong = path.join(tmp, 'hong.zip');
    fs.writeFileSync(tot, u8);
    fs.writeFileSync(hong, await zip.writeZip(toFiles(suaBank('action="Set" varname="SCORE">100</setvar></respcondition></resprocessing><itemfeedback', 'action="Set" varname="SCORE">0</setvar></respcondition></resprocessing><itemfeedback')), {}));
    const a = cp.spawnSync(process.execPath, [path.join(__dirname, 'kiem-qti.cjs'), tot], { encoding: 'utf8' });
    assert.strictEqual(a.status, 0, a.stdout + a.stderr);
    assert.ok(/ĐẠT/.test(a.stdout));
    const b = cp.spawnSync(process.execPath, [path.join(__dirname, 'kiem-qti.cjs'), hong, '--json'], { encoding: 'utf8' });
    assert.strictEqual(b.status, 1, b.stdout + b.stderr);
    assert.ok(JSON.parse(b.stdout).errors.some(e => e.code === 'no-correct'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('nạp kiểu trình duyệt (vm, không có require) → self.NH.kiemQti', () => {
  const vm = require('vm');
  const core = require('../js/core.js');
  const ctx = { self: { NH: { core: core, zip: zip } }, TextEncoder, TextDecoder };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'kiem-qti.cjs'), 'utf8'), ctx);
  const api = ctx.self.NH.kiemQti;
  assert.strictEqual(typeof api.checkPackage, 'function');
  const r = api.checkPackage(classic());
  assert.strictEqual(r.errors.length, 0, api.formatReport(r));
});

test('không có js/core.js → dùng cây XML của chính bộ kiểm tra, kết quả như nhau', () => {
  const vm = require('vm');
  const ctx = { self: { NH: {} }, TextEncoder, TextDecoder };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'kiem-qti.cjs'), 'utf8'), ctx);
  const api = ctx.self.NH.kiemQti;
  for (const f of [classic(), itembank()]) {
    const a = api.checkPackage(f), b = kq.checkPackage(f);
    assert.strictEqual(a.errors.length + a.warnings.length, 0, api.formatReport(a));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(a.banks.concat(a.quizzes))), JSON.parse(JSON.stringify(b.banks.concat(b.quizzes))));
  }
  const hong = api.checkPackage(motItem('dd', 'action="Add"', 'action="Set"'));
  assert.ok(hong.errors.some(e => e.code === 'dd-set'), api.formatReport(hong));
});

test('bền: 400 đột biến ngẫu nhiên (xoá/chèn ký tự) không bao giờ làm bộ kiểm tra ném lỗi', () => {
  let hat = 12345;
  const ngau = n => { hat = (hat * 1103515245 + 12345) % 2147483648; return hat % n; };
  const goc = classic(), chuoi = goc[BANK_PATH], kyTu = '<>&"\'/=;[]\u0001 ab';
  let coLoi = 0;
  for (let k = 0; k < 400; k++) {
    let s = chuoi;
    for (let m = 0, n = 1 + ngau(4); m < n; m++) {
      const i = ngau(s.length);
      s = ngau(2) ? s.slice(0, i) + s.slice(i + 1 + ngau(20)) : s.slice(0, i) + kyTu[ngau(kyTu.length)] + s.slice(i);
    }
    const f = Object.assign({}, goc, { [BANK_PATH]: s });
    let r;
    try { r = kq.checkPackage(f); } catch (e) { assert.fail('ném lỗi ở đột biến ' + k + ': ' + (e && e.stack)); }
    assert.ok(Array.isArray(r.errors) && Array.isArray(r.warnings) && Array.isArray(r.banks));
    if (r.errors.length) coLoi++;
    kq.formatReport(r);
  }
  assert.ok(coLoi > 300, 'đa số đột biến phải bị bắt: ' + coLoi);
});

test('hiệu năng: 600 câu đủ loại kiểm tra dưới 5 giây', () => {
  const nhieu = [];
  for (let k = 0; k < 60; k++) Object.keys(ITEMS).forEach((t, j) => nhieu.push(ITEMS[t].split(BANK + '_q' + String(j + 1).padStart(2, '0')).join(BANK + '_n' + k + '_' + j)));
  const t0 = Date.now();
  const r = kq.checkPackage(classic(nhieu.join('')));
  const ms = Date.now() - t0;
  assert.strictEqual(r.banks[0].items.length, 600);
  assert.deepStrictEqual(r.errors, [], kq.formatReport(r).slice(0, 2000));
  assert.ok(ms < 5000, 'chậm: ' + ms + ' ms');
});

test('tiện ích: pyIdent/pyItemIdent giống Python', () => {
  assert.strictEqual(kq.pyIdent('701'), 'RESPONSE_701');
  assert.strictEqual(kq.pyIdent('response_b1'), 'response_b1');
  assert.strictEqual(kq.pyIdent('a.b:c'), 'a_b_c');
  assert.strictEqual(kq.pyIdent('x y'), 'x-y');
  assert.strictEqual(kq.pyItemIdent('câu1'), 'c_u1');
  assert.strictEqual(kq.pyItemIdent('1abc'), 'ID_1abc');
  assert.strictEqual(kq.pyItemIdent('a:b'), 'a-b');
});

/* ---------------- gói / manifest ---------------- */

test('manifest-missing / manifest-not-root', () => {
  const f = classic(); delete f['imsmanifest.xml'];
  phaiCo(f, 'manifest-missing');
  const g = classic(); g['goi/imsmanifest.xml'] = g['imsmanifest.xml']; delete g['imsmanifest.xml'];
  phaiCo(g, 'manifest-not-root');
});

test('manifest-qti2: namespace QTI 2 hoặc <schema>QTIv2', () => {
  phaiCo(sua(classic(), 'imsmanifest.xml', 'xmlns:lom=', 'xmlns:q2="http://www.imsglobal.org/xsd/imsqti_v2p1" xmlns:lom='), 'manifest-qti2');
  phaiCo(sua(classic(), 'imsmanifest.xml', '<schema>IMS Content</schema>', '<schema>QTIv2.1 Package</schema>'), 'manifest-qti2');
});

test('file-missing / file-case / href-chars / file-location / dependency-missing / resource-dup-id', () => {
  const a = classic(); delete a['images/img_001.png'];
  phaiCo(a, 'file-missing');
  const b = classic(); b['images/IMG_001.png'] = b['images/img_001.png']; delete b['images/img_001.png'];
  phaiCo(b, 'file-case');
  phaiCo(sua(classic(), 'imsmanifest.xml', '<file href="images/img_001.png"/>', '<file href="images/ảnh 1.png"/>'), 'href-chars');
  phaiCo(sua(classic(), 'imsmanifest.xml', '<organizations/>', '<organizations><file href="images/img_001.png"/></organizations>'), 'file-location');
  phaiCo(sua(classic(), 'imsmanifest.xml', '<file href="images/img_001.png"/></resource>', '<file href="images/img_001.png"/><dependency identifierref="khong_co"/></resource>'), 'dependency-missing');
  phaiCo(sua(classic(), 'imsmanifest.xml', 'identifier="img_1"', 'identifier="' + BANK + '"'), 'resource-dup-id');
});

test('ảnh: zip-unlisted, image-unused, image-name (cảnh báo)', () => {
  const a = classic(); a['images/thua.png'] = PNG;
  phaiCo(a, 'zip-unlisted', 'warn');
  phaiCo(motItem('mc', esc(' <img src="images/img_001.png" alt="" style="max-width:100%;height:auto">'), ''), 'image-unused', 'warn');
  const c = sua(classic(), 'imsmanifest.xml', 'images/img_001.png', 'images/Anh_So1.PNG');
  c['images/Anh_So1.PNG'] = PNG;
  const r = phaiCo(sua(c, BANK_PATH, 'images/img_001.png', 'images/Anh_So1.PNG'), 'image-name', 'warn');
  assert.strictEqual(r.errors.length, 0, kq.formatReport(r));
});

/* ---------------- XML ---------------- */

test('xml-malformed: thẻ lệch, & trần, < lẻ, thuộc tính không ngoặc', () => {
  phaiCo(suaBank('</objectbank>', '</objectbanks></objectbank>'), 'xml-malformed');
  phaiCo(suaBank('<fieldentry>' + esc(TITLE), '<fieldentry>A & B ' + esc(TITLE)), 'xml-malformed');
  phaiCo(suaBank('<fieldentry>' + esc(TITLE), '<fieldentry>1 < 2 ' + esc(TITLE)), 'xml-malformed');
  phaiCo(suaBank('rcardinality="Multiple"', 'rcardinality=Multiple'), 'xml-malformed');
});

test('xml-illegal-char (thô và qua &#x1;), xml-undefined-entity, xml-bad-utf8, xml-encoding, xml-bom', () => {
  phaiCo(suaBank('Chọn các số chẵn.', 'Chọn các số\u0001 chẵn.'), 'xml-illegal-char');
  phaiCo(suaBank('<fieldentry>' + esc(TITLE), '<fieldentry>&#x1;' + esc(TITLE)), 'xml-illegal-char');
  phaiCo(suaBank('<fieldentry>' + esc(TITLE), '<fieldentry>&nbsp;' + esc(TITLE)), 'xml-undefined-entity');
  const f = classic();
  const u8 = Buffer.from(f[BANK_PATH], 'utf8');
  f[BANK_PATH] = Buffer.concat([u8.subarray(0, u8.length - 30), Buffer.from([0xC3, 0x28]), u8.subarray(u8.length - 30)]);
  phaiCo(f, 'xml-bad-utf8');
  phaiCo(suaBank('encoding="UTF-8"', 'encoding="windows-1258"'), 'xml-encoding');
  const g = classic(); g[BANK_PATH] = '\uFEFF' + g[BANK_PATH];
  phaiCo(g, 'xml-bom', 'warn');
});

/* ---------------- objectbank ---------------- */

test('objectbank-parent: objectbank không là con trực tiếp của questestinterop', () => {
  const f = sua(sua(classic(), BANK_PATH, '<objectbank ident="' + BANK + '">', '<section ident="s"><objectbank ident="' + BANK + '">'), BANK_PATH, '</objectbank>', '</objectbank></section>');
  phaiCo(f, 'objectbank-parent');
});

test('bank_title: thiếu (cảnh báo), đứng sau item đầu tiên (lỗi); trường bank_type thừa (cảnh báo)', () => {
  const tieuDe = '<qtimetadata><qtimetadatafield><fieldlabel>bank_title</fieldlabel><fieldentry>' + esc(TITLE) + '</fieldentry></qtimetadatafield></qtimetadata>';
  phaiCo(suaBank(tieuDe, ''), 'bank-title-missing', 'warn');
  const sau = sua(suaBank(tieuDe, ''), BANK_PATH, '</objectbank>', tieuDe + '</objectbank>');
  phaiCo(sau, 'bank-title-after-item');
  phaiCo(suaBank('</qtimetadatafield></qtimetadata>', '</qtimetadatafield><qtimetadatafield><fieldlabel>bank_type</fieldlabel><fieldentry>Course</fieldentry></qtimetadatafield></qtimetadata>'), 'bank-extra-fields', 'warn');
});

test('objectbank-ident sai mẫu; objectbank-multi; objectbank-section', () => {
  phaiCo(sua(classic(), BANK_PATH, 'objectbank ident="' + BANK + '"', 'objectbank ident="ngân hàng"'), 'objectbank-ident');
  phaiCo(sua(classic(), BANK_PATH, '</objectbank></questestinterop>', '</objectbank><objectbank ident="b2">' + ITEMS.text.replace(BANK + '_q10', 'b2_q01') + '</objectbank></questestinterop>'), 'objectbank-multi');
  phaiCo(sua(classic(), BANK_PATH, ITEMS.text, '<section ident="s1">' + ITEMS.text + '</section>'), 'objectbank-section');
});

test('qti-location: phần tử sai cha → Python bỏ cả file', () => {
  phaiCo(motItem('mc', '<respcondition continue="No"><conditionvar><varequal', '<conditionvar><other/></conditionvar><respcondition continue="No"><conditionvar><varequal'), 'qti-location');
});

test('qti-unsupported-element: phần tử Python không biết (cảnh báo)', () => {
  phaiCo(motItem('mc', '<render_choice>', '<render_choice><response_na/>'), 'qti-unsupported-element', 'warn');
});

/* ---------------- item chung ---------------- */

test('item-ident: ký tự lạ / trùng sau chuẩn hoá Python', () => {
  phaiCo(motItem('mc', BANK + '_q01', BANK + '_câu1'), 'item-ident');
  phaiCo(classic(ITEMS.mc + ITEMS.mc.replace('title="Câu 1 [NB]"', 'title="Câu 1b"')), 'item-ident-dup');
  phaiCo(classic(ITEMS.tf.replace(BANK + '_q02', BANK + '_qá') + ITEMS.ma.replace(BANK + '_q03', BANK + '_qé')), 'item-ident-dup');
});

test('qtype-missing / qtype-unsupported (viết hoa, loại lạ, calculated)', () => {
  phaiCo(motItem('mc', '<qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_choice_question</fieldentry></qtimetadatafield>', ''), 'qtype-missing');
  phaiCo(motItem('mc', '>multiple_choice_question<', '>Multiple_Choice_Question<'), 'qtype-unsupported');
  phaiCo(motItem('essay', '>essay_question<', '>calculated_question<'), 'qtype-unsupported');
});

test('points: dấu phẩy (lỗi), 0 (lỗi), thiếu (cảnh báo)', () => {
  const r = phaiCo(motItem('mc', '<fieldentry>1</fieldentry>', '<fieldentry>0,5</fieldentry>'), 'points-nan');
  assert.strictEqual(itemCua(r, 1).points, 0);   // Ruby "0,5".to_f = 0
  phaiCo(motItem('mc', '<fieldentry>1</fieldentry>', '<fieldentry>0</fieldentry>'), 'points-zero');
  phaiCo(motItem('mc', '<qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield>', ''), 'points-missing', 'warn');
});

test('mattext: con thô (raw child), texttype lạ, không texttype (cảnh báo), text/plain chứa thẻ', () => {
  phaiCo(motItem('tf', esc('<div>2 là số nguyên tố.</div>'), '<div>2 là số nguyên tố.</div>'), 'mattext-raw-child');
  phaiCo(motItem('tf', '<mattext texttype="text/html">' + esc('<div>2'), '<mattext texttype="text/rtf">' + esc('<div>2')), 'mattext-texttype');
  phaiCo(motItem('tf', '<mattext texttype="text/html">' + esc('<div>2'), '<mattext>' + esc('<div>2')), 'mattext-no-texttype', 'warn');
  phaiCo(motItem('tf', '<mattext texttype="text/html">' + esc('<div>2'), '<mattext texttype="text/plain">' + esc('<div>2')), 'plain-has-markup');
  phaiCo(motItem('mc', plain(104, '1 & 2'), '<response_label ident="104"><material><mattext texttype="text/plain">' + esc('<b>1</b>') + '</mattext></material></response_label>'), 'plain-has-markup');
});

test('stem-length: > 16384 ký tự sau khi bỏ thoát XML (lỗi), > 15000 (cảnh báo); stem-missing', () => {
  const dai = esc('<p>' + 'á'.repeat(16400) + '</p>');
  phaiCo(motItem('essay', 'Trình bày cách giải.', dai), 'stem-length');
  phaiCo(motItem('essay', 'Trình bày cách giải.', esc('<p>' + 'x'.repeat(15500) + '</p>')), 'stem-length', 'warn');
  // 4500 lần "&amp;lt;" = 36000 ký tự trong file, 18000 sau khi giải XML (vẫn là thực thể HTML &lt;) → lỗi theo độ dài HTML
  phaiCo(motItem('essay', 'Trình bày cách giải.', '&amp;lt;'.repeat(4500)), 'stem-length');
  // 4000 lần "&lt;" = 16000 ký tự trong file nhưng chỉ 4000 sau khi giải → không lỗi
  const r = kq.checkPackage(motItem('essay', 'Trình bày cách giải.', '1 ' + '&lt;'.repeat(4000)));
  assert.ok(!codes(r).includes('stem-length'), kq.formatReport(r));
  phaiCo(motItem('essay', stem('Trình bày cách giải.'), ''), 'stem-missing');
});

test('ảnh: src không khớp KHÍT manifest, ngoài ASCII, data: URI, giao thức lạ, ảnh ngoài (cảnh báo)', () => {
  phaiCo(motItem('mc', 'src="images/img_001.png"', 'src="img_001.png"'), 'img-src-not-in-manifest');
  phaiCo(motItem('mc', 'src="images/img_001.png"', 'src="./images/img_001.png"'), 'img-src-not-in-manifest');
  phaiCo(motItem('mc', 'src="images/img_001.png"', 'src="images/ảnh.png"'), 'img-src-nonascii');
  phaiCo(motItem('mc', 'src="images/img_001.png"', 'src="data:image/png;base64,iVBORw0KGgo="'), 'html-data-uri');
  phaiCo(motItem('mc', 'src="images/img_001.png"', 'src="javascript:alert(1)"'), 'img-src-scheme');
  phaiCo(motItem('mc', 'src="images/img_001.png"', 'src="https://example.com/a.png"'), 'img-src-external', 'warn');
});

test('ảnh công thức Canvas (R§4): img.equation_image /equation_images/… không phải file trong gói; thiếu class / mã hoá sai', () => {
  const tex = '\\frac{1}{2}';
  const anh = (cls, src, dec) => esc('<img' + (cls ? ' class="' + cls + '"' : '') + ' title="' + tex + '" src="' + src + '" alt="LaTeX: ' + tex + '" data-equation-content="' + (dec || tex) + '">');
  const tu = esc('<img src="images/img_001.png" alt="" style="max-width:100%;height:auto">');
  const tot = '/equation_images/' + encodeURIComponent(encodeURIComponent(tex)) + '?scale=1';
  const r = kq.checkPackage(motItem('mc', tu, anh('equation_image', tot)));
  assert.deepStrictEqual(r.errors.map(e => e.code), [], kq.formatReport(r));
  phaiCo(motItem('mc', tu, anh('', tot)), 'equation-image-class');
  phaiCo(motItem('mc', tu, anh('equation_image', '/equation_images/%E0%A4%A?scale=1')), 'equation-image-encoding');
  phaiCo(motItem('mc', tu, anh('equation_image', '/equation_images/' + encodeURIComponent(tex) + '?scale=1', 'x')), 'equation-image-encoding', 'warn');
});

test('MathML: phần tử ngoài allowlist, thuộc tính lạ, mspace width (lỗi); HTML breakout trong math', () => {
  const m = (tu, thanh) => motItem('mc', esc(tu), esc(thanh));
  phaiCo(m('<mfrac><mn>1</mn><mn>2</mn></mfrac>', '<mfrac><mn>1</mn><mn>2</mn></mfrac><mlabel>x</mlabel>'), 'mathml-element');
  phaiCo(m('<mfrac>', '<mfrac foo="1">'), 'mathml-attr');
  phaiCo(m('<mn>1</mn><mn>2</mn>', '<mn>1</mn><mspace width="0.2em"/><mn>2</mn>'), 'mathml-mspace-width');
  phaiCo(m('<mn>1</mn><mn>2</mn>', '<mn>1</mn><b>2</b>'), 'mathml-element');
  // HTML trong <mtext> là hợp lệ (điểm tích hợp); thuộc tính MathML hợp lệ không bị báo
  const r = kq.checkPackage(m('<mfrac><mn>1</mn><mn>2</mn></mfrac>', '<mstyle displaystyle="true"><mfrac linethickness="1"><mn>1</mn><mtext><span>2</span></mtext></mfrac><mo stretchy="false" lspace="0">)</mo></mstyle>'));
  assert.deepStrictEqual(r.errors, [], kq.formatReport(r));
  assert.ok(!codes(r).includes('mathml-element'), kq.formatReport(r));
});

test('HTML/CSS: thẻ bị cấm (lỗi), thẻ lạ & thuộc tính bị xoá (cảnh báo), on* (lỗi), CSS ngoài allowlist (cảnh báo)', () => {
  const t = h => motItem('tf', 'số nguyên tố.', esc('số ' + h + ' tố.'));
  phaiCo(t('<script>x()</script>nguyên'), 'html-element');
  phaiCo(t('<s>nguyên</s>'), 'html-element');
  phaiCo(t('<center>nguyên</center>'), 'html-element', 'warn');
  phaiCo(t('<span onclick="x()">nguyên</span>'), 'html-attr-event');
  phaiCo(t('<img src="images/img_001.png" loading="lazy">'), 'html-attr', 'warn');
  phaiCo(t('<span style="font-weight:700;color:red">nguyên</span>'), 'css-property', 'warn');
  phaiCo(t('<span style="color:var(--do)">nguyên</span>'), 'css-var', 'warn');
  phaiCo(t('<span style="background:url(data:image/png;base64,AAAA)">x</span>'), 'html-data-uri');
  // CSS/thuộc tính trong allowlist → không cảnh báo (gói chỉ có câu tf nên ảnh mẫu thừa: bỏ qua image-unused)
  const r = kq.checkPackage(t('<span style="color:#c00;border-top-width:1px;overflow-x:auto" data-x="1" aria-label="a">nguyên</span>'));
  assert.deepStrictEqual(r.warnings.filter(w => w.code !== 'image-unused'), [], kq.formatReport(r));
  assert.deepStrictEqual(r.errors, [], kq.formatReport(r));
});

test('respident-unknown, label-ident ("." và ":"), label-dup, setvar-action (cả file bị bỏ)', () => {
  phaiCo(motItem('mc', '<varequal respident="response1">102', '<varequal respident="response9">102'), 'respident-unknown');
  const r = phaiCo(classic(ITEMS.mc.split('ident="102"').join('ident="1.02"').split('>102<').join('>1.02<')), 'label-ident');
  assert.deepStrictEqual(itemCua(r, 1).correct.correct, []);   // nhãn → "1_02", varequal giữ "1.02" → không khớp
  phaiCo(motItem('mc', plain(104, '1 & 2'), plain(103, '1 & 2')), 'label-dup');
  phaiCo(motItem('mc', 'action="Set"', 'action="Replace"'), 'setvar-action');
});

test('lỗi gõ (từ thử đột biến): rcardinality sai giá trị, thuộc tính lạ, displayfeedback thiếu linkrefid, nhãn metadata lạ, giá trị setvar, xmlns', () => {
  const r = phaiCo(motItem('mc', 'rcardinality="Single"', 'rcardinality="Single\'"'), 'rcardinality-value');
  assert.deepStrictEqual(itemCua(r, 1).correct.correct, ['102']);   // Python chuyển sang phép member nhưng Canvas vẫn đọc được
  phaiCo(motItem('mc', 'rcardinality="Single"', 'rcaardinality="Single"'), 'qti-attr-unknown', 'warn');
  phaiCo(motItem('mc', 'linkrefid="general_fb"', 'linbkrefid="general_fb"'), 'feedback-ref');
  phaiCo(motItem('mc', '<fieldlabel>original_answer_ids</fieldlabel>', '<fieldlabel>original_answ[er_ids</fieldlabel>'), 'meta-unknown', 'warn');
  phaiCo(motItem('fimb', '>50.00</setvar></respcondition></resprocessing>', '>50/.00</setvar></respcondition></resprocessing>'), 'setvar-value', 'warn');
  phaiCo(motItem('mc', esc('xmlns="http://www.w3.org/1998/Math/MathML"'), esc('xmlns="http://www.w3.org/1998[/Math/MathML"')), 'math-xmlns', 'warn');
  phaiCo(sua(classic(), BANK_PATH, 'xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"', 'xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2]"'), 'qti-ns', 'warn');
});

test('item-order: resprocessing trước presentation', () => {
  const x = ITEMS.tf, pres = x.slice(x.indexOf('<presentation>'), x.indexOf('</presentation>') + 15), rp = x.slice(x.indexOf('<resprocessing>'), x.indexOf('</resprocessing>') + 16);
  phaiCo(classic(x.replace(pres, '\u0000').replace(rp, pres).replace('\u0000', rp)), 'item-order');
});

test('itemfeedback: ident lạ / không ứng phương án / displayfeedback trỏ tới feedback không có', () => {
  phaiCo(motItem('mc', '<itemfeedback ident="general_fb">', '<itemfeedback ident="loi_giai">'), 'feedback-id', 'warn');
  phaiCo(motItem('mc', '<itemfeedback ident="general_fb">', '<itemfeedback ident="999_fb">'), 'feedback-id', 'warn');
  phaiCo(motItem('mc', 'linkrefid="general_fb"', 'linkrefid="khong_co"'), 'feedback-ref', 'warn');
  const r = kq.checkPackage(motItem('mc', '<itemfeedback ident="general_fb">', '<itemfeedback ident="102_fb">'));
  assert.ok(!codes(r).includes('feedback-id'), kq.formatReport(r));
});

test('html-escaped-text: text/html chỉ có chữ chứa & < > / dấu cách cứng (phương án, vế trái, lời giải) → cảnh báo', () => {
  // phương án <p>1 &amp; 2</p>: Canvas lưu "1 &amp; 2" vào trường chữ → học sinh thấy "&amp;"
  phaiCo(motItem('mc', 'texttype="text/plain">1 &amp; 2<', 'texttype="text/html">&lt;p&gt;1 &amp;amp; 2&lt;/p&gt;<'), 'html-escaped-text', 'warn');
  // lời giải <p>2 &lt; 3</p> (bọc <div><p>, có <br> cuối)
  phaiCo(motItem('mc', 'Vì ½ + 0,5 = 1.', '&lt;div&gt;&lt;p&gt;2 &amp;lt; 3&lt;br&gt;&lt;/p&gt;&lt;/div&gt;'), 'html-escaped-text', 'warn');
  phaiCo(motItem('mc', 'Vì ½ + 0,5 = 1.', 'a&amp;nbsp;b'), 'html-escaped-text', 'warn');
  // vế trái ghép nối
  phaiCo(motItem('match', '<mattext texttype="text/plain">Hà Nội</mattext>', '<mattext texttype="text/html">&lt;span&gt;Hà Nội &amp;gt; Huế&lt;/span&gt;</mattext>'), 'html-escaped-text', 'warn');
  // có thẻ thật (strong, span có thuộc tính) hoặc chữ không có & < > → không báo; text/plain → không báo
  for (const [k, tu, thanh] of [
    ['mc', 'texttype="text/plain">1 &amp; 2<', 'texttype="text/html">&lt;strong&gt;1 &amp;amp; 2&lt;/strong&gt;<'],
    ['mc', 'texttype="text/plain">1 &amp; 2<', 'texttype="text/html">&lt;span style="color:red"&gt;1 &amp;amp; 2&lt;/span&gt;<'],
    ['mc', 'Vì ½ + 0,5 = 1.', 'Chỉ có chữ thường'],
    ['mc', 'texttype="text/plain">1 &amp; 2<', 'texttype="text/plain">1 &amp; 2<']
  ]) {
    const r = kq.checkPackage(motItem(k, tu, thanh));
    assert.ok(!codes(r).includes('html-escaped-text'), thanh + '\n' + kq.formatReport(r));
  }
});

/* ---------------- theo loại ---------------- */

test('MC: không có Set 100 → no-correct (mô phỏng get_response_weight)', () => {
  const r = phaiCo(motItem('mc', 'action="Set" varname="SCORE">100', 'action="Set" varname="SCORE">0'), 'no-correct');
  assert.deepStrictEqual(itemCua(r, 1).correct.correct, []);
  phaiCo(motItem('mc', 'action="Set" varname="SCORE">100', 'action="Set" varname="SCORE">0'), 'score-set100');
});

test('MC: Add 100 vẫn được Canvas coi là đúng nhưng sai hợp đồng Set 100', () => {
  const r = phaiCo(motItem('mc', 'action="Set" varname="SCORE">100', 'action="Add" varname="SCORE">100'), 'score-set100');
  assert.deepStrictEqual(itemCua(r, 1).correct.correct, ['102']);
});

test('MC: decvar Integer + Set 0.5 → "0.5".to_i = 0 → không có đáp án', () => {
  const r = phaiCo(classic(ITEMS.mc.replace('vartype="Decimal"', 'vartype="Integer"').replace('varname="SCORE">100<', 'varname="SCORE">0.5<')), 'no-correct');
  assert.ok(codes(r, 'warn').includes('decvar-type'));
});

test('MC: varequal trỏ tới phương án không tồn tại; hai điều kiện chấm → 2 đáp án; <2 phương án', () => {
  phaiCo(motItem('mc', '<varequal respident="response1">102</varequal>', '<varequal respident="response1">109</varequal>'), 'mc-varequal');
  const hai = '<respcondition continue="No"><conditionvar><varequal respident="response1">102</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>';
  const r = phaiCo(motItem('mc', hai, hai + hai.replace('>102<', '>103<')), 'mc-correct-count');
  assert.ok(codes(r).includes('mc-score-cond'));
  phaiCo(classic(ITEMS.tf.replace(plain(202, 'False'), '').replace('>true_false_question<', '>multiple_choice_question<')), 'choice-few-options');
});

test('MC: điều kiện phản hồi theo phương án đặt SAU điều kiện chấm điểm làm mất trọng số (mô phỏng thứ tự Ruby)', () => {
  const fbSau = '<respcondition continue="Yes"><conditionvar><varequal respident="response1">102</varequal></conditionvar><displayfeedback feedbacktype="Response" linkrefid="102_fb"/></respcondition>';
  const r = phaiCo(motItem('mc', '</respcondition></resprocessing>', '</respcondition>' + fbSau + '</resprocessing>'), 'no-correct');
  assert.deepStrictEqual(itemCua(r, 1).correct.correct, []);
  // đặt TRƯỚC (như Canvas xuất) thì vẫn đúng
  const r2 = kq.checkPackage(motItem('mc', FB_COND, FB_COND + fbSau));
  assert.deepStrictEqual(itemCua(r2, 1).correct.correct, ['102'], kq.formatReport(r2));
});

test('true_false: nhãn Đúng/Sai → Canvas hạ xuống multiple_choice (cảnh báo tf-demoted)', () => {
  const r = phaiCo(classic(ITEMS.tf.replace(plain(201, 'True'), plain(201, 'Đúng')).replace(plain(202, 'False'), plain(202, 'Sai'))), 'tf-demoted', 'warn');
  assert.strictEqual(itemCua(r, 2).canvasType, 'multiple_choice_question');
  assert.strictEqual(itemCua(r, 2).type, 'true_false_question');
});

test('MA: rcardinality Single → Canvas chỉ thấy varequal đầu (ma-rcardinality + ma-sim-mismatch)', () => {
  const r = phaiCo(motItem('ma', 'rcardinality="Multiple"', 'rcardinality="Single"'), 'ma-rcardinality');
  assert.deepStrictEqual(itemCua(r, 3).correct.correct, ['301']);
  assert.ok(codes(r).includes('ma-sim-mismatch'), kq.formatReport(r));
});

test('MA: <and> thiếu phương án / không có đáp án đúng / không bọc <and>', () => {
  phaiCo(motItem('ma', '<not><varequal respident="response1">304</varequal></not>', ''), 'ma-and-cover');
  phaiCo(classic(ITEMS.ma.replace('<varequal respident="response1">301</varequal><not>', '<not><varequal respident="response1">301</varequal></not><not>').replace('<varequal respident="response1">303</varequal><not>', '<not><varequal respident="response1">303</varequal></not><not>')), 'ma-no-correct');
  const r = phaiCo(motItem('ma', '<conditionvar><and>', '<conditionvar><other/><and>'), 'ma-and');
  assert.deepStrictEqual(itemCua(r, 3).correct.correct, []);   // and lồng trong and ngầm → Canvas không thấy
});

test('short: không có đáp án → thành essay; đáp án toàn khoảng trắng; thiếu biến thể dấu chấm (cảnh báo)', () => {
  const r = phaiCo(motItem('short', '<varequal respident="response1">Hà Nội</varequal><varequal respident="response1">Ha Noi</varequal>', '<varequal respident="response1"></varequal>'), 'short-no-answer');
  assert.strictEqual(itemCua(r, 4).canvasType, 'essay_question');
  phaiCo(motItem('short', '>Ha Noi<', '>   <'), 'short-empty-answer');
  phaiCo(motItem('short', '>Ha Noi<', '>2,67<'), 'short-decimal-twin', 'warn');
  phaiCo(motItem('short', '<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str>',
    '<response_lid ident="response1" rcardinality="Single"><render_choice><response_label ident="1"/></render_choice></response_lid>'), 'short-structure');
});

test('numerical: varequal không bọc <or> bị Canvas bỏ; khoảng thiếu cận; giá trị dấu phẩy; response_num', () => {
  const r = phaiCo(motItem('num', '<or><varequal respident="response1">12.5</varequal><and><vargte respident="response1">12.4</vargte><varlte respident="response1">12.6</varlte></and></or>', '<varequal respident="response1">12.5</varequal>'), 'num-exact-no-or');
  assert.deepStrictEqual(itemCua(r, 5).correct.answers, [{ type: 'range', start: 100, end: 200 }]);
  phaiCo(motItem('num', '<varlte respident="response1">200</varlte>', ''), 'num-range-half');
  phaiCo(motItem('num', '>12.5<', '>12,5<'), 'num-value');
  phaiCo(classic(ITEMS.num.replace('<response_str ident="response1" rcardinality="Single">', '<response_num ident="response1" rcardinality="Single" numtype="Decimal">').replace('</response_str>', '</response_num>')), 'num-response-num');
  const k = phaiCo(motItem('num', '<vargte respident="response1">12.4</vargte>', '<vargte respident="response1">12.3</vargte>'), 'num-margin-asym', 'warn');
  assert.strictEqual(itemCua(k, 5).correct.answers[0].margin, 0.1);   // Canvas chỉ đọc cận trên
});

test('FIMB: [id] 0 lần / 2 lần; lid không có tiền tố response_; thiếu Add; đáp án rỗng; response_str', () => {
  phaiCo(motItem('fimb', 'là [b1], của', 'là …, của'), 'blank-count');
  phaiCo(motItem('fimb', 'là [b1], của', 'là [b1] [b1], của'), 'blank-count');
  phaiCo(motItem('fimb', '&lt;div&gt;Thủ', '&lt;div title="[b1]"&gt;Thủ'), 'blank-count');   // Canvas thay chuỗi trong HTML thô, kể cả thuộc tính
  phaiCo(classic(ITEMS.fimb.split('response_b2').join('Response_b2')), 'blank-lid-ident');
  phaiCo(motItem('fimb', '<respcondition><conditionvar><varequal respident="response_b2">603</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>', ''), 'fimb-add');
  phaiCo(motItem('fimb', plain(603, 'Paris'), plain(603, '')), 'fimb-empty-accept');
  phaiCo(motItem('fimb', plain(603, 'Paris'), plain(603, '<i>Paris</i>')), 'plain-has-markup');
  phaiCo(motItem('fimb', '<response_lid ident="response_b2" rcardinality="Single"><material><mattext>b2</mattext></material><render_choice>' + plain(603, 'Paris') + '</render_choice></response_lid>',
    '<response_str ident="response_b2" rcardinality="Single"><render_fib><response_label ident="603"/></render_fib></response_str>'), 'blank-structure');
  // ident phương án trùng giữa hai ô: FIMB không hỏng (mọi nhãn trọng số 100) → chỉ cảnh báo
  const r = phaiCo(classic(ITEMS.fimb.replace(plain(603, 'Paris'), plain(601, 'Paris')).replace('response_b2">603<', 'response_b2">601<')), 'label-dup', 'warn');
  assert.ok(!codes(r, 'error').includes('label-dup'), kq.formatReport(r));
  assert.deepStrictEqual(itemCua(r, 6).correct.blanks.b2, ['Paris']);
});

test('dropdowns: Set thay vì Add → không có đáp án đúng; ident phương án dùng chung giữa các ô; 2 đáp án đúng', () => {
  const r = phaiCo(classic(ITEMS.dd.split('action="Add"').join('action="Set"')), 'dd-set');
  assert.strictEqual(itemCua(r, 7).correct.blanks.s1.correct, null);
  assert.ok(codes(r).includes('dd-correct-count'));
  assert.ok(!codes(r).includes('dd-add'), 'một lỗi Set không được báo thêm dd-add');
  assert.strictEqual(codes(r).filter(c => c === 'dd-set').length, 2);   // mỗi ô một lần
  const chung = classic(ITEMS.dd.replace(plain(703, 'Đúng'), plain(701, 'Đúng')).replace(plain(704, 'Sai'), plain(702, 'Sai')).replace('>704</varequal>', '>702</varequal>'));
  const r2 = phaiCo(chung, 'label-dup');
  assert.strictEqual(itemCua(r2, 7).correct.blanks.s1.correct, null);   // Canvas gán nhầm sang ô s2
  const hai = '<respcondition><conditionvar><varequal respident="response_s1">701</varequal></conditionvar><setvar varname="SCORE" action="Add">50.00</setvar></respcondition>';
  phaiCo(motItem('dd', hai, hai + hai.replace('>701<', '>702<')), 'dd-correct-count');
  phaiCo(motItem('dd', plain(702, 'Sai'), ''), 'dd-few-options');
  phaiCo(motItem('dd', '<setvar varname="SCORE" action="Add">50.00</setvar></respcondition><respcondition><conditionvar><varequal respident="response_s2">704</varequal>', '<setvar varname="SCORE" action="Add">50.00</setvar></respcondition><respcondition><conditionvar><other/>'), 'import-crash');
});

test('matching: danh sách vế phải khác nhau; dãy số trùng; Set thay vì Add; thiếu vế trái; vế phải có ảnh', () => {
  const x = ITEMS.match, i2 = x.indexOf('<response_lid ident="response_802"');
  phaiCo(classic(x.slice(0, i2) + x.slice(i2).replace(plain(853, 'Lào'), '')), 'match-right-list');
  phaiCo(classic(x.split('ident="851"').join('ident="q8_m1"').split('ident="852"').join('ident="q8_m2"').split('ident="853"').join('ident="q8_m3"').split('>851<').join('>q8_m1<').split('>852<').join('>q8_m2<')), 'match-digit-run');
  const r = phaiCo(classic(x.split('action="Add"').join('action="Set"')), 'match-add');
  assert.ok(codes(r).includes('match-left-unmatched'));
  assert.strictEqual(itemCua(r, 8).correct.pairs[0].right, null);
  phaiCo(motItem('match', '<material><mattext texttype="text/plain">Paris</mattext></material>', ''), 'match-left-missing');
  phaiCo(classic(x.split(plain(853, 'Lào')).join(plain(853, '<img src="images/img_001.png">'))), 'plain-has-markup');
  phaiCo(classic(x.slice(0, i2) + '</presentation><resprocessing>' + DECVAR + '<respcondition><conditionvar><varequal respident="response_801">851</varequal></conditionvar><setvar varname="SCORE" action="Add">100</setvar></respcondition></resprocessing></item>'), 'match-few');
});

test('essay / text_only: cấu trúc', () => {
  phaiCo(motItem('essay', '<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str>', ''), 'essay-structure');
  phaiCo(motItem('essay', '<conditionvar><other/></conditionvar></respcondition></resprocessing>', '<conditionvar><varequal respident="response1">x</varequal></conditionvar></respcondition></resprocessing>'), 'essay-has-answers', 'warn');
  phaiCo(motItem('text', '<fieldentry>0</fieldentry>', '<fieldentry>1</fieldentry>'), 'text-only-points', 'warn');
  phaiCo(motItem('text', '</presentation>', '</presentation><resprocessing>' + DECVAR + '</resprocessing>'), 'text-has-resprocessing', 'warn');
});

test('fib-material: render_fib có cả material lẫn response_label → textEntryInteraction', () => {
  phaiCo(motItem('short', '<render_fib><response_label', '<render_fib><material><mattext texttype="text/plain">=</mattext></material><response_label'), 'fib-material');
});

/* ---------------- bố cục itembank ---------------- */

test('itembank: thiếu dependency tới assessment_meta.xml', () => {
  phaiCo(itembank({ noDep: true }), 'quiz-meta-dep');
  phaiCo(itembank({ noDep: true }), 'quiz-meta-orphan', 'warn');
  phaiCo(itembank({ noDep: true }), 'quiz-meta-missing', 'error', { layout: 'itembank' });
});

test('itembank: identifier không khớp (resource, quiz identifier, quiz_identifierref), meta sai chỗ', () => {
  phaiCo(itembank({ resId: 'khac' }), 'quiz-resource-id');
  phaiCo(itembank({ meta: { ident: 'khac' } }), 'quiz-meta-ident');
  phaiCo(itembank({ meta: { ref: 'khac' } }), 'quiz-meta-assignment');
  phaiCo(itembank({ metaHref: 'meta/assessment_meta.xml' }), 'quiz-meta-href');
  phaiCo(itembank({ meta: { points: 13 } }), 'quiz-meta-points', 'warn');
  phaiCo(itembank({ meta: { title: 'Khác' } }), 'quiz-meta-title', 'warn');
});

test('itembank: nhóm/sourcebank_ref bị cấm khi --layout=itembank; root_section; layout sai', () => {
  const nhom = '<section ident="g1" title="Nhóm"><selection_ordering><selection><sourcebank_ref>' + BANK + '</sourcebank_ref><selection_number>2</selection_number><selection_extension><points_per_item>1</points_per_item></selection_extension></selection></selection_ordering></section>';
  phaiCo(sua(itembank(), QUIZ + '/' + QUIZ + '.xml', '</section></assessment>', nhom + '</section></assessment>'), 'quiz-groups', 'error', { layout: 'itembank' });
  phaiCo(sua(itembank(), QUIZ + '/' + QUIZ + '.xml', 'ident="root_section"', 'ident="s0"'), 'quiz-root-section', 'warn');
  phaiCo(classic(), 'layout', 'error', { layout: 'itembank' });
  phaiCo(itembank(), 'layout', 'error', { layout: 'classic' });
});

test('mixed: objectbank + assessment cùng file → qti-root-mixed', () => {
  phaiCo(sua(classic(), BANK_PATH, '</objectbank>', '</objectbank><assessment ident="q" title="q"><section ident="root_section"/></assessment>'), 'qti-root-mixed');
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 14).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (kiem-qti)');
  process.exitCode = hong ? 1 : 0;
})();
