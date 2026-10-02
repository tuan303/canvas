/* tests/qti.test.cjs — kiểm thử js/qti.js (chạy: node tests/qti.test.cjs) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');
const zip = require('../js/zip.js');
const qti = require('../js/qti.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

/* ---------------- module giả cho html.js / math.js (để kết quả ổn định) ---------------- */

const stubHtml = {
  toPlainText(h) {
    return String(h).replace(/<math\b[\s\S]*?<\/math>/g, m => m.replace(/<[^>]+>/g, ''))
      .replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
  }
};
const stubMath = {
  mathmlToLatex(m) {
    if (/FAIL/.test(m)) return null;
    const t = [...m.matchAll(/<m[ino]>([^<]*)<\/m[ino]>/g)].map(x => x[1]);
    if (/<mfrac/.test(m)) return '\\frac{' + t[0] + '}{' + t[1] + '}';
    return t.join('');
  }
};
function depGia() { qti._setDeps(null); qti._setDeps({ html: stubHtml, math: stubMath }); }
depGia();

/* ---------------- dữ liệu mẫu: một ngân hàng đủ mọi loại ---------------- */

const PNG1 = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG2 = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9, 9]);
const PNG3 = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 7, 7]);
const MATH_HALF = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
const MATH_FAIL = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>FAIL</mi></math>';
const STIM = '<p>Đọc đoạn sau: “Hà Nội là [b1] thủ đô”.</p>';

function cau(o) { return Object.assign({ meta: { level: '', topic: '', part: '', tags: [] }, issues: [], stimulus: '', feedback: '' }, o); }

function bankMau(title) {
  title = title || 'Toán 12 – Chương 1 & ôn tập';
  return {
    title,
    ident: core.bankIdent(title),
    source: { kind: 'docx', name: 'De.docx' },
    images: { 'img_001.png': PNG1, 'img_002.png': PNG2, 'unused.png': PNG3 },
    warnings: [],
    questions: [
      cau({ id: 'q01', no: '1', title: 'Câu 1 [NB] & "x"', type: 'mc', points: 0.25,
        stem: '<p>Hình:\u0001 <img src="images/img_001.png" alt="" style="max-width:100%;height:auto"> ]]&gt; chọn?</p>',
        choices: [{ id: 'A', html: MATH_HALF, correct: true }, { id: 'B', html: '0,5 & 1', correct: false },
          { id: 'C', html: '<strong>2</strong>', correct: false }, { id: 'D', html: '3', correct: false }],
        feedback: '<p>Lời giải: <img src="images/img_002.png" alt=""></p>' }),
      cau({ id: 'q02', no: '2', title: 'Câu 2', type: 'ma', points: 1, stem: '<p>Chọn các số chẵn</p>',
        choices: [{ id: 'A', html: '2', correct: true }, { id: 'B', html: '3' }, { id: 'C', html: '4', correct: true }, { id: 'D', html: '5' }] }),
      cau({ id: 'q03', no: '3', title: 'Câu 3', type: 'tf', points: 1, stem: '<p>Cho hàm số y = x².</p>', stimulus: '<p>Đoạn dẫn chung</p>',
        statements: [{ key: 'a', html: '<p>Hàm số chẵn</p>', value: true }, { key: 'b', html: 'Đồng biến trên ℝ', value: false },
          { key: 'c', html: 'Có cực tiểu', value: true }, { key: 'd', html: 'Có [s1] tiệm cận', value: false }],
        feedback: '<p>Giải thích ý a–d</p>' }),
      cau({ id: 'q04', no: '4', title: 'Câu 4', type: 'short', points: 0.5, stem: '<p>Tính</p>', answers: ['12,5', '−3'] }),
      cau({ id: 'q05', no: '5', title: 'Câu 5', type: 'num', points: 1, stem: '<p>8/3 ≈ ?</p>', numeric: { exact: 2.67, margin: 0.01 } }),
      cau({ id: 'q06', no: '6', title: 'Câu 6', type: 'num', points: 1, stem: '<p>3·4 = ?</p>', numeric: { exact: 12, margin: 0 } }),
      cau({ id: 'q07', no: '7', title: 'Câu 7', type: 'num', points: 1, stem: '<p>Số trong [1,5; 2]</p>', numeric: { min: 1.5, max: 2 } }),
      cau({ id: 'q08', no: '8', title: 'Câu 8', type: 'blanks', points: 1, stimulus: STIM,
        stem: '<p>Thủ đô của Việt Nam là [b1], của Pháp là [b2].</p>',
        blanks: [{ id: 'b1', accepts: ['Hà Nội', 'Ha Noi'] }, { id: 'b2', accepts: ['Paris'] }] }),
      cau({ id: 'q09', no: '9', title: 'Câu 9', type: 'dropdowns', points: 1, stem: '<p>2 là số [d1], 3 là số [d2].</p>',
        dropdowns: [{ id: 'd1', options: ['<b>chẵn</b>', 'lẻ'], correct: 0 }, { id: 'd2', options: ['chẵn', 'lẻ', 'nguyên tố &amp; lẻ'], correct: 1 }] }),
      cau({ id: 'q10', no: '10', title: 'Câu 10', type: 'matching', points: 1.5, stem: '<p>Ghép thủ đô với nước</p>',
        pairs: [{ left: 'Hà Nội', right: 'Việt Nam' }, { left: '<em>Paris</em>', right: 'Pháp' }, { left: 'Huế', right: 'Việt Nam' }],
        distractors: ['Lào', 'Pháp'] }),
      cau({ id: 'q11', no: '11', title: 'Câu 11', type: 'essay', points: 2, stem: '<p>Trình bày…</p>', feedback: '<p>Hướng dẫn chấm: 1đ mỗi ý</p>' }),
      cau({ id: 'q12', no: '12', title: 'Đọc hiểu', type: 'text', points: 0, stem: '<p>Đọc kỹ phần sau</p>', feedback: '<p>bỏ</p>' }),
      cau({ id: 'q13', no: '13', title: 'Câu 13', type: 'mc', points: 1, stem: '<p>Thiếu đáp án</p>',
        choices: [{ id: 'A', html: '1' }, { id: 'B', html: '2' }] }),
      cau({ id: 'q14', no: '14', title: 'Câu 14', type: 'mc', points: 1, stem: '<p><img src="images/khong_co.png"></p>',
        choices: [{ id: 'A', html: '1', correct: true }, { id: 'B', html: '2' }] }),
      cau({ id: 'q15', no: '15', title: 'Câu 15', type: 'mc', points: 1, stem: '<p><img src="data:image/png;base64,AAAA"></p>',
        choices: [{ id: 'A', html: '1', correct: true }, { id: 'B', html: '2' }] }),
      cau({ id: 'q16', no: '16', title: 'Câu 16', type: 'mc', points: 1, stem: '<p>Công thức lạ ' + MATH_FAIL + ' và ' + MATH_HALF + '</p>',
        choices: [{ id: 'A', html: 'x', correct: true }, { id: 'B', html: 'y' }] })
    ]
  };
}

/* ---------------- trợ giúp ---------------- */

// Kiểm tra XML hợp lệ (well-formed) chặt chẽ: thẻ cân bằng, 1 gốc, thuộc tính có ngoặc, & chỉ là thực thể hợp lệ
function kiemXml(s, ten) {
  assert.strictEqual(typeof s, 'string', ten);
  assert.ok(s.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'), ten + ': thiếu khai báo XML');
  assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/.test(s), ten + ': có ký tự cấm');
  const RE_TT = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
  const st = [];
  let i = s.indexOf('?>') + 2, goc = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    const chu = s.slice(i, lt < 0 ? s.length : lt);
    assert.ok(!RE_TT.test(chu), ten + ': & lẻ trong văn bản: ' + chu.slice(0, 60));
    if (!st.length) assert.ok(!chu.trim(), ten + ': chữ nằm ngoài phần tử gốc');
    if (lt < 0) break;
    const gt = s.indexOf('>', lt);
    assert.ok(gt > 0, ten + ': thẻ không đóng');
    const the = s.slice(lt, gt + 1);
    const m = /^<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*="[^"<]*")*)\s*(\/?)>$/.exec(the);
    assert.ok(m, ten + ': thẻ sai cú pháp: ' + the.slice(0, 80));
    const tenAt = {};
    for (const a of m[3].matchAll(/([A-Za-z_][\w.:-]*)="([^"]*)"/g)) {
      assert.ok(!tenAt[a[1]], ten + ': trùng thuộc tính ' + a[1]);
      tenAt[a[1]] = 1;
      assert.ok(!RE_TT.test(a[2]), ten + ': & lẻ trong thuộc tính ' + a[1]);
    }
    if (m[1]) {
      assert.ok(!m[3] && !m[4], ten + ': thẻ đóng có thuộc tính');
      assert.strictEqual(st.pop(), m[2], ten + ': thẻ đóng lệch </' + m[2] + '>');
    } else if (m[4]) { if (!st.length) goc++; }
    else { if (!st.length) goc++; st.push(m[2]); }
    i = gt + 1;
  }
  assert.strictEqual(st.length, 0, ten + ': còn thẻ chưa đóng: ' + st.join(','));
  assert.strictEqual(goc, 1, ten + ': phải có đúng 1 phần tử gốc');
  const cay = core.parseXml(s);
  assert.notStrictEqual(cay.name, '#fragment', ten + ': parseXml không ra 1 gốc');
  return cay;
}
function tep(files, p) { const f = files.find(x => x.path === p); assert.ok(f, 'thiếu file ' + p); return f.data; }
function xmlFiles(files) { return files.filter(f => /\.(xml|qti)$/.test(f.path)); }
function meta(item) {
  const o = {};
  for (const f of core.findAll(core.find(item, 'itemmetadata'), 'qtimetadatafield')) {
    o[core.xmlText(core.find(f, 'fieldlabel'))] = core.xmlText(core.find(f, 'fieldentry'));
  }
  return o;
}
function stemCua(item) { return core.xmlText(core.find(core.find(item, 'presentation'), 'mattext')); }
function itemTheo(cay, duoi) {
  const it = core.findAll(cay, 'item').find(x => x.attrs.ident.endsWith(duoi));
  assert.ok(it, 'không thấy item ' + duoi);
  return it;
}
function tenCon(node) { return core.children(node).map(n => n.name); }
function mt(n) { return core.xmlText(core.find(n, 'mattext')); } // chữ của mattext đầu tiên (bỏ khoảng trắng thụt lề)
function nhanCua(lid) { return core.findAll(lid, 'response_label').map(l => ({ id: l.attrs.ident, text: mt(l), type: core.find(l, 'mattext').attrs.texttype })); }
function respConds(item) { return core.children(core.find(item, 'resprocessing'), 'respcondition'); }

/* ---------------- bố cục classic ---------------- */

test('classic: bố cục gói, manifest, objectbank, chỉ ảnh được dùng, XML hợp lệ', () => {
  const b = bankMau();
  const r = qti.prepare([b], { target: 'classic' });
  assert.strictEqual(r.packages.length, 1);
  const p = r.packages[0];
  assert.match(p.fileName, /^[A-Za-z0-9_-]+\.zip$/);
  assert.strictEqual(p.fileName, 'Toan_12_Chuong_1_on_tap_classic.zip');
  assert.deepStrictEqual(p.bankTitles, [b.title]);
  const paths = p.files.map(f => f.path);
  assert.deepStrictEqual(paths, ['imsmanifest.xml', 'non_cc_assessments/' + b.ident + '.xml.qti', 'images/img_001.png', 'images/img_002.png']);
  assert.strictEqual(tep(p.files, 'images/img_001.png'), PNG1);
  for (const f of xmlFiles(p.files)) kiemXml(f.data, f.path);

  // manifest
  const man = kiemXml(tep(p.files, 'imsmanifest.xml'), 'manifest');
  assert.strictEqual(man.name, 'manifest');
  assert.strictEqual(man.attrs.identifier, b.ident + '_manifest');
  assert.strictEqual(man.attrs.xmlns, 'http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1');
  assert.ok(!/QTIv2|imsqti_assessment_xmlv2|canvas_export/.test(tep(p.files, 'imsmanifest.xml')));
  assert.strictEqual(core.xmlText(core.find(man, 'schema')), 'IMS Content');
  assert.strictEqual(core.xmlText(core.find(man, 'schemaversion')), '1.1.3');
  assert.strictEqual(core.xmlText(core.find(man, 'imsmd:string')), b.title);
  assert.deepStrictEqual(tenCon(man), ['metadata', 'organizations', 'resources']);
  const res = core.findAll(man, 'resource');
  assert.deepStrictEqual(res.map(x => [x.attrs.identifier, x.attrs.type, x.attrs.href, core.find(x, 'file').attrs.href]), [
    [b.ident, 'imsqti_xmlv1p2', 'non_cc_assessments/' + b.ident + '.xml.qti', 'non_cc_assessments/' + b.ident + '.xml.qti'],
    ['img_1', 'webcontent', 'images/img_001.png', 'images/img_001.png'],
    ['img_2', 'webcontent', 'images/img_002.png', 'images/img_002.png']
  ]);
  assert.ok(tep(p.files, 'imsmanifest.xml').includes('<organizations/>'));

  // file ngân hàng
  const src = tep(p.files, 'non_cc_assessments/' + b.ident + '.xml.qti');
  const cay = kiemXml(src, 'bank');
  assert.strictEqual(cay.name, 'questestinterop');
  assert.strictEqual(cay.attrs.xmlns, 'http://www.imsglobal.org/xsd/ims_qtiasiv1p2');
  const ob = core.children(cay)[0];
  assert.strictEqual(ob.name, 'objectbank');
  assert.strictEqual(ob.attrs.ident, b.ident);
  const con = core.children(ob);
  assert.strictEqual(con[0].name, 'qtimetadata', 'bank_title phải đứng trước item đầu tiên');
  assert.strictEqual(core.xmlText(core.find(con[0], 'fieldlabel')), 'bank_title');
  assert.strictEqual(core.xmlText(core.find(con[0], 'fieldentry')), b.title);
  assert.ok(!/bank_type|bank_state|bank_context_uuid|<section|<assessment/.test(src));
  assert.ok(con.slice(1).every(x => x.name === 'item'));
  assert.strictEqual(con.length - 1, 13);
  assert.ok(src.includes('<fieldentry>' + 'Toán 12 – Chương 1 &amp; ôn tập' + '</fieldentry>'), 'tiếng Việt UTF-8 thô, & thoát');

  // mọi img src trong HTML (đã giải thoát) đều có trong manifest
  const hrefs = new Set(res.map(x => x.attrs.href));
  for (const mt of core.findAll(cay, 'mattext')) {
    for (const m of core.xmlText(mt).matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g)) {
      if (m[1].startsWith('/equation_images/')) continue;
      assert.ok(hrefs.has(m[1]), 'img không có trong manifest: ' + m[1]);
    }
  }
});

test('classic: đếm theo loại, câu lỗi bị bỏ và báo lỗi', () => {
  const r = qti.prepare([bankMau()], { target: 'classic' });
  const c = r.packages[0].counts;
  assert.deepStrictEqual(
    { mc: c.mc, ma: c.ma, tf: c.tf, short: c.short, num: c.num, blanks: c.blanks, dropdowns: c.dropdowns, matching: c.matching, essay: c.essay, text: c.text },
    { mc: 2, ma: 1, tf: 1, short: 1, num: 3, blanks: 1, dropdowns: 1, matching: 1, essay: 1, text: 1 });
  assert.strictEqual(c.total, 13);
  assert.strictEqual(c.items, 13);
  assert.strictEqual(c.skipped, 3);
  assert.strictEqual(c.points, 0.25 + 1 + 1 + 0.5 + 3 + 1 + 1 + 1.5 + 2 + 0 + 1);
  const loi = r.issues.filter(x => x.level === 'error');
  assert.deepStrictEqual([...new Set(loi.map(x => x.qid))].sort(), ['q13', 'q14', 'q15']);
  assert.ok(loi.some(x => x.qid === 'q13' && /đáp án đúng/.test(x.msg)));
  assert.ok(loi.some(x => x.qid === 'q14' && /khong_co\.png/.test(x.msg)));
  assert.ok(loi.some(x => x.qid === 'q15' && /data:/.test(x.msg)));
  assert.ok(loi.every(x => x.bank === bankMau().title));
  assert.deepStrictEqual(r.packages[0].issues, r.issues);
  const src = r.packages[0].files[1].data;
  for (const n of ['13', '14', '15']) assert.ok(!src.includes('_q' + n + '"'), 'câu ' + n + ' không được xuất');
  // thông báo một lần cho cả gói
  assert.strictEqual(r.issues.filter(x => /Đúng\/Sai nhiều ý/.test(x.msg)).length, 1);
  assert.strictEqual(r.issues.filter(x => /dấu chấm/.test(x.msg)).length, 1);
});

test('mc: metadata, texttype theo nội dung, Set 100, lời giải general_fb, thứ tự phần tử, thoát thực thể', () => {
  const b = bankMau();
  const p = qti.prepare([b], { target: 'classic' }).packages[0];
  const src = p.files[1].data;
  const cay = core.parseXml(src);
  const it = itemTheo(cay, '_q01');
  assert.strictEqual(it.attrs.ident, b.ident + '_q01');
  assert.strictEqual(it.attrs.title, 'Câu 1 [NB] & "x"');
  assert.ok(src.includes('<item ident="' + b.ident + '_q01" title="Câu 1 [NB] &amp; &quot;x&quot;">'));
  assert.deepStrictEqual(tenCon(it), ['itemmetadata', 'presentation', 'resprocessing', 'itemfeedback']);
  assert.deepStrictEqual(meta(it), { question_type: 'multiple_choice_question', points_possible: '0.25', original_answer_ids: '101,102,103,104' });
  assert.deepStrictEqual(core.findAll(core.find(it, 'qtimetadata'), 'fieldlabel').map(core.xmlText), ['question_type', 'points_possible', 'original_answer_ids']);
  // stem bọc <div>, ký tự cấm bị xoá, ]]> không gây hại
  const stem = stemCua(it);
  assert.strictEqual(stem, '<div><p>Hình: <img src="images/img_001.png" alt="" style="max-width:100%;height:auto"> ]]&gt; chọn?</p></div>');
  assert.ok(src.includes('<mattext texttype="text/html">&lt;div&gt;&lt;p&gt;Hình: &lt;img src="images/img_001.png"'));
  assert.ok(!src.includes('<![CDATA['));
  const pres = core.find(it, 'presentation');
  assert.deepStrictEqual(tenCon(pres), ['material', 'response_lid']);
  const lid = core.find(pres, 'response_lid');
  assert.deepStrictEqual(lid.attrs, { ident: 'response1', rcardinality: 'Single' });
  const nh = nhanCua(lid);
  assert.deepStrictEqual(nh.map(x => x.id), ['101', '102', '103', '104']);
  assert.deepStrictEqual(nh.map(x => x.type), ['text/html', 'text/plain', 'text/html', 'text/plain']);
  assert.strictEqual(nh[0].text, MATH_HALF);
  assert.strictEqual(nh[1].text, '0,5 & 1');
  assert.ok(src.includes('<mattext texttype="text/plain">0,5 &amp; 1</mattext>'));
  assert.ok(src.includes('&lt;math xmlns="http://www.w3.org/1998/Math/MathML"&gt;&lt;mfrac&gt;'));
  // resprocessing: outcomes → FB_COND → chấm
  const rp = core.find(it, 'resprocessing');
  assert.deepStrictEqual(tenCon(rp), ['outcomes', 'respcondition', 'respcondition']);
  assert.ok(src.includes('<decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>'));
  const [rc0, rc1] = respConds(it);
  assert.strictEqual(rc0.attrs.continue, 'Yes');
  assert.ok(core.find(rc0, 'other'));
  assert.deepStrictEqual(core.find(rc0, 'displayfeedback').attrs, { feedbacktype: 'Response', linkrefid: 'general_fb' });
  assert.strictEqual(rc1.attrs.continue, 'No');
  assert.strictEqual(core.xmlText(core.find(rc1, 'varequal')), '101');
  assert.strictEqual(core.find(rc1, 'varequal').attrs.respident, 'response1');
  assert.ok(src.includes('<setvar action="Set" varname="SCORE">100</setvar>'));
  const fb = core.find(it, 'itemfeedback');
  assert.strictEqual(fb.attrs.ident, 'general_fb');
  assert.deepStrictEqual(tenCon(fb), ['flow_mat']);
  assert.strictEqual(core.find(fb, 'mattext').attrs.texttype, 'text/html');
  assert.strictEqual(mt(fb), '<p>Lời giải: <img src="images/img_002.png" alt=""></p>');
});

test('ma: rcardinality Multiple, <and> + <not> theo thứ tự phương án', () => {
  const cay = core.parseXml(qti.prepare([bankMau()], { target: 'classic' }).packages[0].files[1].data);
  const it = itemTheo(cay, '_q02');
  assert.deepStrictEqual(meta(it), { question_type: 'multiple_answers_question', points_possible: '1', original_answer_ids: '201,202,203,204' });
  assert.strictEqual(core.find(it, 'response_lid').attrs.rcardinality, 'Multiple');
  const and = core.find(it, 'and');
  assert.deepStrictEqual(core.children(and).map(n => n.name === 'not' ? '!' + core.xmlText(core.find(n, 'varequal')) : core.xmlText(n)), ['201', '!202', '203', '!204']);
  const rc = respConds(it);
  assert.strictEqual(rc.length, 1);
  assert.strictEqual(rc[0].attrs.continue, 'No');
  assert.strictEqual(core.find(rc[0], 'setvar').attrs.action, 'Set');
  assert.ok(!core.find(it, 'itemfeedback'));
});

test('tf (dropdowns): một câu nhiều ô Đúng/Sai, mã ô không trùng chữ có sẵn, Add 25.00, khung đoạn dẫn', () => {
  const b = bankMau();
  const cay = core.parseXml(qti.prepare([b], { target: 'classic' }).packages[0].files[1].data);
  const it = itemTheo(cay, '_q03');
  const m = meta(it);
  assert.strictEqual(m.question_type, 'multiple_dropdowns_question');
  assert.strictEqual(m.points_possible, '1');
  assert.strictEqual(m.original_answer_ids, '301,302,303,304,305,306,307,308');
  const stem = stemCua(it);
  // ý d) có sẵn chuỗi "[s1]" → dùng tiền tố khác
  assert.ok(stem.includes('<p>a) Hàm số chẵn [y1]<br>b) Đồng biến trên ℝ [y2]<br>c) Có cực tiểu [y3]<br>d) Có [s1] tiệm cận [y4]</p>'), stem);
  assert.ok(stem.startsWith('<div><div style="border:1px solid #c5cbe0;border-left:4px solid #23328c;'), 'đoạn dẫn trong khung có viền');
  assert.ok(stem.includes('<p>Đoạn dẫn chung</p></div><p>Cho hàm số y = x².</p>'));
  const lids = core.findAll(it, 'response_lid');
  assert.deepStrictEqual(lids.map(l => l.attrs.ident), ['response_y1', 'response_y2', 'response_y3', 'response_y4']);
  assert.ok(lids.every(l => l.attrs.rcardinality === 'Single'));
  assert.deepStrictEqual(lids.map(l => mt(core.find(l, 'material'))), ['y1', 'y2', 'y3', 'y4']);
  assert.ok(lids.every(l => core.find(core.find(l, 'material'), 'mattext').attrs.texttype === undefined), 'nhãn ô không có texttype');
  assert.deepStrictEqual(nhanCua(lids[0]).map(x => [x.id, x.text, x.type]), [['301', 'Đúng', 'text/plain'], ['302', 'Sai', 'text/plain']]);
  const rc = respConds(it).slice(1); // bỏ FB_COND
  assert.deepStrictEqual(rc.map(r => [r.attrs.continue, core.find(r, 'varequal').attrs.respident, core.xmlText(core.find(r, 'varequal'))]),
    [[undefined, 'response_y1', '301'], [undefined, 'response_y2', '304'], [undefined, 'response_y3', '305'], [undefined, 'response_y4', '308']]);
  assert.ok(rc.every(r => core.find(r, 'setvar').attrs.action === 'Add' && core.xmlText(core.find(r, 'setvar')) === '25.00'));
  assert.ok(qti.prepare([b], { target: 'classic' }).packages[0].files[1].data.includes('<setvar varname="SCORE" action="Add">25.00</setvar>'));
});

test('tf (split): tách N câu Đúng/Sai một đáp án, điểm chia đều, ident _s<k>', () => {
  const b = bankMau();
  const p = qti.prepare([b], { target: 'classic', tfMode: 'split' }).packages[0];
  const cay = core.parseXml(p.files[1].data);
  const its = core.findAll(cay, 'item').filter(x => /_q03_s\d$/.test(x.attrs.ident));
  assert.deepStrictEqual(its.map(x => x.attrs.ident), [1, 2, 3, 4].map(k => b.ident + '_q03_s' + k));
  assert.deepStrictEqual(its.map(x => x.attrs.title), ['Câu 3 – a)', 'Câu 3 – b)', 'Câu 3 – c)', 'Câu 3 – d)']);
  assert.ok(its.every(x => meta(x).question_type === 'multiple_choice_question' && meta(x).points_possible === '0.25'));
  const dung = [true, false, true, false];
  its.forEach((it, i) => {
    const nh = nhanCua(core.find(it, 'response_lid'));
    assert.deepStrictEqual(nh.map(x => x.text), ['Đúng', 'Sai']);
    assert.deepStrictEqual(nh.map(x => x.id), [String(301 + i * 2), String(302 + i * 2)]);
    assert.strictEqual(meta(it).original_answer_ids, nh.map(x => x.id).join(','));
    const rc = respConds(it).find(r => r.attrs.continue === 'No');
    assert.strictEqual(core.xmlText(core.find(rc, 'varequal')), dung[i] ? nh[0].id : nh[1].id);
    assert.ok(core.find(it, 'itemfeedback'), 'mỗi ý giữ lời giải');
  });
  assert.ok(stemCua(its[0]).includes('<p>Cho hàm số y = x².</p><p>a) Hàm số chẵn</p></div>'));
  assert.ok(stemCua(its[3]).includes('<p>d) Có [s1] tiệm cận</p>'));
  assert.strictEqual(p.counts.tf, 1);
  assert.strictEqual(p.counts.items, 16);
  assert.strictEqual(p.counts.total, 13);
  // 3 ý: điểm không chia hết → ý cuối bù phần dư
  const b3 = { title: 'TF3', images: {}, questions: [cau({ id: 'q1', no: '1', type: 'tf', points: 1, stem: '',
    statements: [{ key: 'a', html: 'x', value: true }, { key: 'b', html: 'y', value: true }, { key: 'c', html: 'z', value: false }] })] };
  const c3 = core.parseXml(qti.prepare([b3], { target: 'classic', tfMode: 'split' }).packages[0].files[1].data);
  assert.deepStrictEqual(core.findAll(c3, 'item').map(x => meta(x).points_possible), ['0.3333', '0.3333', '0.3334']);
});

test('short: biến thể đáp án, varequal anh em không <or>, response_str', () => {
  const cay = core.parseXml(qti.prepare([bankMau()], { target: 'classic' }).packages[0].files[1].data);
  const it = itemTheo(cay, '_q04');
  const rs = core.find(it, 'response_str');
  assert.deepStrictEqual(rs.attrs, { ident: 'response1', rcardinality: 'Single' });
  assert.deepStrictEqual(core.find(rs, 'response_label').attrs, { ident: 'answer1', rshuffle: 'No' });
  assert.ok(!core.find(rs, 'render_fib').attrs.fibtype);
  const rc = respConds(it)[0];
  const cv = core.find(rc, 'conditionvar');
  assert.ok(core.children(cv).every(n => n.name === 'varequal'));
  const vals = core.children(cv).map(core.xmlText);
  assert.deepStrictEqual(vals, ['12,5', '−3', '12.5', '-3']);
  assert.strictEqual(meta(it).original_answer_ids, '401,402,403,404');
  assert.ok(!core.find(it, 'or'));
});

test('num: chính xác ± sai số (<or><and>), chính xác không sai số (<or> chỉ varequal), khoảng (vargte/varlte)', () => {
  const src = qti.prepare([bankMau()], { target: 'classic' }).packages[0].files[1].data;
  const cay = core.parseXml(src);
  const a = itemTheo(cay, '_q05');
  assert.deepStrictEqual(meta(a), { question_type: 'numerical_question', points_possible: '1', original_answer_ids: '501' });
  assert.strictEqual(core.find(a, 'render_fib').attrs.fibtype, 'Decimal');
  assert.deepStrictEqual(core.find(core.find(a, 'response_str'), 'response_label').attrs, { ident: 'answer1' });
  const or = core.find(a, 'or');
  assert.deepStrictEqual(tenCon(or), ['varequal', 'and']);
  assert.strictEqual(core.xmlText(core.find(or, 'varequal')), '2.67');
  assert.deepStrictEqual(core.children(core.find(or, 'and')).map(n => [n.name, core.xmlText(n)]), [['vargte', '2.66'], ['varlte', '2.68']]);
  const b = itemTheo(cay, '_q06');
  assert.deepStrictEqual(tenCon(core.find(b, 'or')), ['varequal']);
  assert.strictEqual(core.xmlText(core.find(b, 'varequal')), '12');
  const c = itemTheo(cay, '_q07');
  assert.ok(!core.find(c, 'or'));
  const cv = core.find(respConds(c)[0], 'conditionvar');
  assert.deepStrictEqual(core.children(cv).map(n => [n.name, n.attrs.respident, core.xmlText(n)]), [['vargte', 'response1', '1.5'], ['varlte', 'response1', '2']]);
  assert.ok(!/<vargt /.test(src), 'không sinh precision answer');
});

test('blanks: response_<id>, nhãn ô không texttype, mọi cách viết là nhãn, Add 50.00, đoạn dẫn chứa [b1] bị vô hiệu hoá', () => {
  const r = qti.prepare([bankMau()], { target: 'classic' });
  const cay = core.parseXml(r.packages[0].files[1].data);
  const it = itemTheo(cay, '_q08');
  assert.strictEqual(meta(it).question_type, 'fill_in_multiple_blanks_question');
  const lids = core.findAll(it, 'response_lid');
  assert.deepStrictEqual(lids.map(l => l.attrs.ident), ['response_b1', 'response_b2']);
  assert.deepStrictEqual(nhanCua(lids[0]).map(x => [x.id, x.text, x.type]), [['801', 'Hà Nội', 'text/plain'], ['802', 'Ha Noi', 'text/plain']]);
  assert.deepStrictEqual(nhanCua(lids[1]).map(x => [x.id, x.text]), [['803', 'Paris']]);
  assert.strictEqual(meta(it).original_answer_ids, '801,802,803');
  const rc = respConds(it);
  assert.deepStrictEqual(rc.map(x => core.xmlText(core.find(x, 'varequal'))), ['801', '803']);
  assert.ok(rc.every(x => x.attrs.continue === undefined && core.xmlText(core.find(x, 'setvar')) === '50.00' && core.find(x, 'setvar').attrs.action === 'Add'));
  const stem = stemCua(it);
  assert.strictEqual(stem.split('[b1]').length - 1, 1, '[b1] chỉ còn 1 lần (trong câu)');
  assert.ok(stem.includes('[​b1]'));
  assert.ok(r.issues.some(x => x.qid === 'q08' && x.level === 'info' && /vô hiệu hoá/.test(x.msg)));
});

test('dropdowns: mọi lựa chọn là chữ thuần (HTML → chữ qua html.toPlainText), một đáp án đúng mỗi ô, Add', () => {
  const r = qti.prepare([bankMau()], { target: 'classic' });
  const cay = core.parseXml(r.packages[0].files[1].data);
  const it = itemTheo(cay, '_q09');
  assert.strictEqual(meta(it).question_type, 'multiple_dropdowns_question');
  const lids = core.findAll(it, 'response_lid');
  assert.deepStrictEqual(nhanCua(lids[0]).map(x => [x.id, x.text, x.type]), [['901', 'chẵn', 'text/plain'], ['902', 'lẻ', 'text/plain']]);
  assert.deepStrictEqual(nhanCua(lids[1]).map(x => x.text), ['chẵn', 'lẻ', 'nguyên tố &amp; lẻ'], 'chữ thuần giữ nguyên (không phải HTML)');
  const rc = respConds(it);
  assert.deepStrictEqual(rc.map(x => [core.find(x, 'varequal').attrs.respident, core.xmlText(core.find(x, 'varequal'))]), [['response_d1', '901'], ['response_d2', '904']]);
  assert.ok(rc.every(x => core.find(x, 'setvar').attrs.action === 'Add'));
  assert.ok(r.issues.some(x => x.qid === 'q09' && x.level === 'info' && /chữ thuần/.test(x.msg)));
});

test('matching: vế phải (kể cả nhiễu) giống hệt ở mọi lid, ident vế phải NN*100+50+k, Add theo số vế trái', () => {
  const cay = core.parseXml(qti.prepare([bankMau()], { target: 'classic' }).packages[0].files[1].data);
  const it = itemTheo(cay, '_q10');
  assert.deepStrictEqual(meta(it), { question_type: 'matching_question', points_possible: '1.5', original_answer_ids: '1001,1002,1003' });
  const lids = core.findAll(it, 'response_lid');
  assert.deepStrictEqual(lids.map(l => l.attrs.ident), ['response_1001', 'response_1002', 'response_1003']);
  assert.ok(lids.every(l => l.attrs.rcardinality === 'Single'));
  // vế trái: chữ → text/plain, HTML → text/html
  assert.deepStrictEqual(lids.map(l => core.children(core.children(l, 'material')[0], 'mattext')[0].attrs.texttype), ['text/plain', 'text/html', 'text/plain']);
  const ds0 = nhanCua(core.find(lids[0], 'render_choice'));
  assert.deepStrictEqual(ds0.map(x => x.text), ['Lào', 'Pháp', 'Việt Nam'], 'không trùng, xếp chữ cái, có nhiễu');
  assert.deepStrictEqual(ds0.map(x => x.id), ['1051', '1052', '1053']);
  assert.ok(ds0.every(x => x.type === 'text/plain'));
  for (const l of lids) assert.deepStrictEqual(nhanCua(core.find(l, 'render_choice')), ds0);
  const rc = respConds(it);
  assert.deepStrictEqual(rc.map(x => [core.find(x, 'varequal').attrs.respident, core.xmlText(core.find(x, 'varequal')), core.xmlText(core.find(x, 'setvar'))]),
    [['response_1001', '1053', '33.33'], ['response_1002', '1052', '33.33'], ['response_1003', '1053', '33.33']]);
  assert.ok(rc.every(x => core.find(x, 'setvar').attrs.action === 'Add'));
});

test('essay & text: <other/>, original_answer_ids rỗng, text không resprocessing, điểm 0', () => {
  const src = qti.prepare([bankMau()], { target: 'classic' }).packages[0].files[1].data;
  const cay = core.parseXml(src);
  const e = itemTheo(cay, '_q11');
  assert.deepStrictEqual(meta(e), { question_type: 'essay_question', points_possible: '2', original_answer_ids: '' });
  assert.ok(src.includes('<fieldentry></fieldentry>'));
  assert.deepStrictEqual(tenCon(e), ['itemmetadata', 'presentation', 'resprocessing', 'itemfeedback']);
  const rc = respConds(e);
  assert.strictEqual(rc.length, 2);
  assert.strictEqual(rc[1].attrs.continue, 'No');
  assert.deepStrictEqual(tenCon(core.find(rc[1], 'conditionvar')), ['other']);
  assert.ok(!core.find(rc[1], 'setvar'));
  assert.strictEqual(mt(core.find(e, 'itemfeedback')), '<p>Hướng dẫn chấm: 1đ mỗi ý</p>');
  const t = itemTheo(cay, '_q12');
  assert.deepStrictEqual(meta(t), { question_type: 'text_only_question', points_possible: '0', original_answer_ids: '' });
  assert.deepStrictEqual(tenCon(t), ['itemmetadata', 'presentation']);
  assert.deepStrictEqual(tenCon(core.find(t, 'presentation')), ['material']);
  assert.strictEqual(t.attrs.title, 'Đọc hiểu');
});

test('ident: item = <bank>_qNN, đáp án là số nguyên duy nhất trong item, original_answer_ids khớp nhãn', () => {
  const b = bankMau();
  for (const tfMode of ['dropdowns', 'split']) {
    const cay = core.parseXml(qti.prepare([b], { target: 'classic', tfMode }).packages[0].files[1].data);
    const its = core.findAll(cay, 'item');
    const seen = new Set();
    for (const it of its) {
      assert.match(it.attrs.ident, new RegExp('^' + b.ident + '_q\\d{2,}(_s\\d+)?$'));
      assert.ok(!seen.has(it.attrs.ident)); seen.add(it.attrs.ident);
      const ids = core.findAll(it, 'response_label').map(l => l.attrs.ident).filter(x => x !== 'answer1');
      ids.forEach(x => assert.match(x, /^[1-9]\d*$/));
      const m = meta(it);
      if (m.question_type === 'matching_question') {
        const lids = core.findAll(it, 'response_lid');
        assert.strictEqual(m.original_answer_ids, lids.map(l => l.attrs.ident.replace('response_', '')).join(','));
        const phai = nhanCua(lids[0]).map(x => x.id);
        assert.strictEqual(new Set(phai).size, phai.length);
      } else if (!/short_answer|numerical|essay|text_only/.test(m.question_type)) {
        assert.strictEqual(new Set(ids).size, ids.length, 'trùng ident đáp án trong ' + it.attrs.ident);
        assert.strictEqual(m.original_answer_ids, ids.join(','));
      }
    }
  }
});

test('stimulus none: không chèn đoạn dẫn; includeFeedback false: không general_fb', () => {
  const p = qti.prepare([bankMau()], { target: 'classic', stimulus: 'none', includeFeedback: false }).packages[0];
  const src = p.files[1].data;
  const cay = core.parseXml(src);
  assert.ok(!stemCua(itemTheo(cay, '_q03')).includes('Đoạn dẫn chung'));
  assert.ok(!src.includes('border-left:4px'));
  assert.ok(!src.includes('general_fb'));
  assert.ok(!core.find(cay, 'itemfeedback'));
  // không có đoạn dẫn thì [b1] trong đoạn dẫn không còn là vấn đề
  assert.ok(stemCua(itemTheo(cay, '_q08')).split('[b1]').length === 2);
});

test('math image: MathML → img.equation_image (mã hoá URL 2 lần), không chuyển được → giữ MathML + cảnh báo', () => {
  const r = qti.prepare([bankMau()], { target: 'classic', math: 'image' });
  const cay = core.parseXml(r.packages[0].files[1].data);
  const tex = '\\frac{1}{2}';
  const img = '<img class="equation_image" title="' + tex + '" src="/equation_images/' + encodeURIComponent(encodeURIComponent(tex)) +
    '?scale=1" alt="LaTeX: ' + tex + '" data-equation-content="' + tex + '">';
  assert.strictEqual(img.includes('%255Cfrac%257B1%257D%257B2%257D'), true);
  const q1 = itemTheo(cay, '_q01');
  const nh = nhanCua(core.find(q1, 'response_lid'));
  assert.strictEqual(nh[0].text, img);
  assert.strictEqual(nh[0].type, 'text/html');
  const q16 = itemTheo(cay, '_q16');
  const stem = stemCua(q16);
  assert.ok(stem.includes(MATH_FAIL), 'công thức lỗi giữ nguyên MathML');
  assert.ok(stem.includes(img), 'công thức chuyển được thành ảnh');
  assert.ok(r.issues.some(x => x.qid === 'q16' && x.level === 'warn' && /không chuyển được/.test(x.msg)));
  assert.ok(!r.issues.some(x => x.qid === 'q01' && x.level === 'warn'));
  // lệnh LaTeX có ký tự HTML đặc biệt được thoát trong thuộc tính
  qti._setDeps({ math: { mathmlToLatex: () => 'a<b & "c"' } });
  try {
    const one = { title: 'M', images: {}, questions: [cau({ id: 'q1', no: '1', type: 'essay', points: 1, stem: '<p>' + MATH_HALF + '</p>' })] };
    const s = stemCua(core.findAll(core.parseXml(qti.prepare([one], { target: 'classic', math: 'image' }).packages[0].files[1].data), 'item')[0]);
    assert.ok(s.includes('title="a&lt;b &amp; &quot;c&quot;"'), s);
    assert.ok(s.includes('src="/equation_images/' + encodeURIComponent(encodeURIComponent('a<b & "c"')) + '?scale=1"'));
    // thiếu module math.js → giữ MathML + cảnh báo
    qti._setDeps({ math: null });
    const r2 = qti.prepare([one], { target: 'classic', math: 'image' });
    assert.ok(r2.packages[0].files[1].data.includes('&lt;math'));
    assert.ok(r2.issues.some(x => x.level === 'warn' && /math\.js/.test(x.msg)));
  } finally { depGia(); }
  // chế độ mathml: không đụng tới công thức
  const r3 = qti.prepare([bankMau()], { target: 'classic', math: 'mathml' });
  assert.ok(!r3.packages[0].files[1].data.includes('equation_image'));
});

test('ô chữ thuần khi thiếu html.js: bỏ thẻ đơn giản được, công thức/ảnh → lỗi và bỏ câu', () => {
  qti._setDeps({ html: null });
  try {
    const b = { title: 'Thiếu html', images: { 'a.png': PNG1 }, questions: [
      cau({ id: 'q1', no: '1', type: 'dropdowns', points: 1, stem: '<p>[x1]</p>', dropdowns: [{ id: 'x1', options: ['<b>Đúng</b> &amp; đủ', 'Sai'], correct: 0 }] }),
      cau({ id: 'q2', no: '2', type: 'dropdowns', points: 1, stem: '<p>[x1]</p>', dropdowns: [{ id: 'x1', options: [MATH_HALF, 'Sai'], correct: 0 }] }),
      cau({ id: 'q3', no: '3', type: 'matching', points: 1, stem: '', pairs: [{ left: 'a', right: '<img src="images/a.png">' }, { left: 'b', right: 'c' }] }),
      cau({ id: 'q4', no: '4', type: 'short', points: 1, stem: '<p>?</p>', answers: ['<i>Hà Nội</i>'] })
    ] };
    const r = qti.prepare([b], { target: 'classic' });
    const cay = core.parseXml(r.packages[0].files[1].data);
    assert.deepStrictEqual(core.findAll(cay, 'item').map(x => x.attrs.ident.slice(-3)), ['q01', 'q04']);
    assert.deepStrictEqual(nhanCua(core.find(itemTheo(cay, '_q01'), 'response_lid')).map(x => x.text), ['Đúng & đủ', 'Sai']);
    assert.deepStrictEqual(core.children(core.find(itemTheo(cay, '_q04'), 'conditionvar')).map(core.xmlText), ['Hà Nội']);
    assert.ok(r.issues.some(x => x.qid === 'q2' && x.level === 'error' && /HTML/.test(x.msg)));
    assert.ok(r.issues.some(x => x.qid === 'q3' && x.level === 'error'));
    assert.strictEqual(r.packages[0].counts.skipped, 2);
  } finally { depGia(); }
});

test('numberInTitle false: tên câu = đoạn đầu nội dung (+ mức độ); thoát ký tự cấm XML', () => {
  const b = { title: 'T', images: {}, questions: [
    cau({ id: 'q1', no: '1', title: 'Câu 1 [TH]', type: 'essay', points: 1, meta: { level: 'TH' },
      stem: '<p>Phân tích <strong>nhân vật</strong> chính\u0007 trong đoạn trích sau đây và nêu cảm nhận của em về số phận con người thời ấy</p>' }),
    cau({ id: 'q2', no: '2', title: 'Câu 2', type: 'essay', points: 1, stem: '<p><img src="https://example.com/a.png"></p>' })
  ] };
  const r = qti.prepare([b], { target: 'classic', numberInTitle: false });
  const src = r.packages[0].files[1].data;
  kiemXml(src, 'bank');
  const its = core.findAll(core.parseXml(src), 'item');
  assert.match(its[0].attrs.title, /^Phân tích nhân vật chính trong đoạn trích .*… \[TH\]$/);
  assert.ok(its[0].attrs.title.length <= 90);
  assert.strictEqual(its[1].attrs.title, 'Câu 2', 'không có chữ → dùng tên gốc');
  assert.ok(!src.includes('\u0007'));
  assert.ok(r.issues.some(x => x.qid === 'q2' && x.level === 'warn' && /Internet/.test(x.msg)), 'ảnh http → cảnh báo, vẫn xuất');
  const r2 = qti.prepare([b], { target: 'classic' });
  assert.strictEqual(core.findAll(core.parseXml(r2.packages[0].files[1].data), 'item')[0].attrs.title, 'Câu 1 [TH]');
});

test('độ dài stem > 15 000 ký tự → cảnh báo, gợi ý không chèn đoạn dẫn', () => {
  const dai = '<p>' + 'x'.repeat(9000) + '</p>';
  const b = { title: 'Dài', images: {}, questions: [cau({ id: 'q1', no: '1', type: 'essay', points: 1, stem: dai, stimulus: dai })] };
  const r = qti.prepare([b], { target: 'classic' });
  const w = r.issues.filter(x => x.qid === 'q1' && x.level === 'warn' && /ký tự/.test(x.msg));
  assert.strictEqual(w.length, 1);
  assert.match(w[0].msg, /không chèn đoạn dẫn/);
  assert.strictEqual(r.packages[0].counts.total, 1, 'chỉ cảnh báo, vẫn xuất');
  assert.ok(!qti.prepare([b], { target: 'classic', stimulus: 'none' }).issues.some(x => /ký tự/.test(x.msg)));
});

/* ---------------- bố cục itembank ---------------- */

test('itembank: mỗi ngân hàng một zip, manifest + dependency, assessment_meta, item trực tiếp trong root_section', () => {
  const b1 = bankMau();
  const b2 = bankMau('Ngữ văn 10');
  b2.questions = b2.questions.slice(1, 3);
  const r = qti.prepare([b1, b2], {});
  assert.deepStrictEqual(r.packages.map(p => p.fileName), ['Toan_12_Chuong_1_on_tap.zip', 'Ngu_van_10.zip']);
  const [p1, p2] = r.packages;
  assert.deepStrictEqual(p2.bankTitles, ['Ngữ văn 10']);
  const qi = b1.ident + '_quiz';
  assert.deepStrictEqual(p1.files.map(f => f.path), ['imsmanifest.xml', qi + '/' + qi + '.xml', qi + '/assessment_meta.xml', 'images/img_001.png', 'images/img_002.png']);
  for (const p of r.packages) for (const f of xmlFiles(p.files)) kiemXml(f.data, p.fileName + ':' + f.path);
  // manifest như Canvas xuất bài kiểm tra Classic
  const man = core.parseXml(tep(p1.files, 'imsmanifest.xml'));
  const res = core.findAll(man, 'resource');
  assert.deepStrictEqual(res[0].attrs, { identifier: qi, type: 'imsqti_xmlv1p2' });
  assert.deepStrictEqual(core.children(res[0]).map(n => [n.name, n.attrs.href || n.attrs.identifierref]), [['file', qi + '/' + qi + '.xml'], ['dependency', qi + '_meta']]);
  assert.deepStrictEqual(res[1].attrs, { identifier: qi + '_meta', type: 'associatedcontent/imscc_xmlv1p1/learning-application-resource', href: qi + '/assessment_meta.xml' });
  assert.deepStrictEqual(res.slice(2).map(x => x.attrs.href), ['images/img_001.png', 'images/img_002.png']);
  assert.ok(!tep(p1.files, 'imsmanifest.xml').includes('non_cc_assessments'));
  // bài kiểm tra
  const quiz = core.parseXml(tep(p1.files, qi + '/' + qi + '.xml'));
  const as = core.find(quiz, 'assessment');
  assert.deepStrictEqual(as.attrs, { ident: qi, title: b1.title });
  assert.deepStrictEqual(tenCon(as), ['qtimetadata', 'section']);
  assert.strictEqual(core.xmlText(core.find(core.find(as, 'qtimetadata'), 'fieldlabel')), 'cc_maxattempts');
  const sec = core.find(as, 'section');
  assert.strictEqual(sec.attrs.ident, 'root_section');
  assert.ok(core.children(sec).every(n => n.name === 'item'), 'mọi item nằm trực tiếp trong root_section');
  assert.strictEqual(core.children(sec).length, 13);
  assert.ok(!/sourcebank_ref|selection_ordering|objectbank|assessment_question_identifierref/.test(tep(p1.files, qi + '/' + qi + '.xml')));
  // item giống hệt bố cục classic
  const cls = core.parseXml(qti.prepare([b1], { target: 'classic' }).packages[0].files[1].data);
  const gon = n => core.toXml(n).replace(/>\s+</g, '><');
  assert.deepStrictEqual(core.findAll(sec, 'item').map(gon), core.findAll(cls, 'item').map(gon));
  // assessment_meta.xml
  const metaSrc = tep(p1.files, qi + '/assessment_meta.xml');
  const mt = core.parseXml(metaSrc);
  assert.strictEqual(mt.name, 'quiz');
  assert.strictEqual(mt.attrs.identifier, qi);
  assert.strictEqual(mt.attrs.xmlns, 'http://canvas.instructure.com/xsd/cccv1p0');
  const v = n => core.xmlText(core.find(mt, n));
  assert.strictEqual(v('title'), b1.title);
  assert.strictEqual(v('shuffle_answers'), 'false');
  assert.strictEqual(v('quiz_type'), 'assignment');
  assert.strictEqual(v('points_possible'), String(p1.counts.points));
  assert.strictEqual(v('allowed_attempts'), '1');
  assert.strictEqual(v('available'), 'false');
  const thuTu = tenCon(mt);
  assert.ok(thuTu.indexOf('title') < thuTu.indexOf('shuffle_answers') && thuTu.indexOf('quiz_type') < thuTu.indexOf('points_possible') &&
    thuTu.indexOf('allowed_attempts') < thuTu.indexOf('available'), 'thứ tự theo qti_generator.rb');
  // gói 2: không có ảnh nào
  assert.deepStrictEqual(p2.files.filter(f => f.path.startsWith('images/')), []);
  assert.strictEqual(p2.counts.total, 2);
});

test('itembank: ngân hàng rỗng/toàn lỗi không tạo gói; trùng tên file được đánh số', () => {
  const rong = { title: 'Rỗng', images: {}, questions: [] };
  const loi = { title: 'Lỗi', images: {}, questions: [cau({ id: 'q1', no: '1', type: 'mc', points: 1, stem: 'x', choices: [] })] };
  const a = { title: 'Toán 10', images: {}, questions: [cau({ id: 'q1', no: '1', type: 'essay', points: 1, stem: '<p>a</p>' })] };
  const b = { title: 'Toán  10', ident: 'nh_khac', images: {}, questions: [cau({ id: 'q1', no: '1', type: 'essay', points: 1, stem: '<p>b</p>' })] };
  const r = qti.prepare([rong, loi, a, b], { target: 'itembank' });
  assert.deepStrictEqual(r.packages.map(p => p.fileName), ['Toan_10.zip', 'Toan_10_2.zip']);
  assert.ok(r.issues.some(x => x.level === 'warn' && /Rỗng/.test(x.msg)));
  assert.ok(r.issues.some(x => x.level === 'error' && /không câu nào/.test(x.msg)));
});

test('tf: ý có thẻ khối (nhiều đoạn, bảng) → mỗi ý một <div> (không lồng <p> trong <p>); ý đơn giữ "a) … [s1]<br>b) …"', () => {
  const q = cau({ id: 'q01', no: '1', type: 'tf', points: 1, stem: '<p>Xét</p>', statements: [
    { key: 'a', html: '<p>Một</p><p>Hai</p>', value: true }, { key: 'b', html: '<table><tr><td>x</td></tr></table>', value: false }, { key: 'c', html: '<p>đơn</p>', value: true }] });
  const stemCua = tfMode => {
    const f = qti.buildFiles([{ title: 'T', images: {}, questions: [q] }], { target: 'classic', tfMode });
    return core.findAll(core.parseXml(f[1].data), 'item').map(it => core.xmlText(core.find(it, 'mattext')));
  };
  assert.deepStrictEqual(stemCua('dropdowns'), ['<div><p>Xét</p><div>a) <p>Một</p><p>Hai</p> [s1]</div><div>b) <table><tr><td>x</td></tr></table> [s2]</div><p>c) đơn [s3]</p></div>']);
  assert.deepStrictEqual(stemCua('split'), ['<div><p>Xét</p><div>a) <p>Một</p><p>Hai</p></div></div>',
    '<div><p>Xét</p><div>b) <table><tr><td>x</td></tr></table></div></div>', '<div><p>Xét</p><p>c) đơn</p></div>']);
  q.statements = [{ key: 'a', html: '<p>x</p>', value: true }, { key: 'b', html: 'y', value: false }];
  assert.deepStrictEqual(stemCua('dropdowns'), ['<div><p>Xét</p><p>a) x [s1]<br>b) y [s2]</p></div>']);
});

test('null trong questions = câu bị bên gọi loại: bỏ qua im lặng, giữ vị trí ident, đếm counts.excluded', () => {
  const es = n => cau({ id: 'q' + n, no: String(n), type: 'essay', points: 1, stem: '<p>' + n + '</p>' });
  for (const target of ['itembank', 'classic']) {
    const r = qti.prepare([{ title: 'Có chỗ trống', images: {}, questions: [es(1), null, undefined, es(4)] }], { target });
    assert.deepStrictEqual(r.issues.filter(x => x.level !== 'info'), [], target);
    const c = r.packages[0].counts;
    assert.deepStrictEqual([c.total, c.excluded, c.skipped, c.items], [2, 2, 0, 2], target);
    const xml = r.packages[0].files.filter(f => /\.xml(\.qti)?$/.test(f.path) && !/manifest|meta/.test(f.path)).map(f => f.data).join('');
    const id = core.bankIdent('Có chỗ trống');
    assert.ok(xml.includes('ident="' + id + '_q01"') && xml.includes('ident="' + id + '_q04"') && !xml.includes(id + '_q02'), target);
    // toàn null → không tạo gói, chỉ cảnh báo (không phải lỗi)
    const r2 = qti.prepare([{ title: 'Trống hết', images: {}, questions: [null, null] }], { target });
    assert.strictEqual(r2.packages.length, 0, target);
    assert.ok(r2.issues.some(x => x.level === 'warn' && /không có câu nào được chọn/.test(x.msg)) && !r2.issues.some(x => x.level === 'error'), target);
  }
});

test('nhiều ngân hàng (classic): một zip, mỗi ngân hàng một file; ảnh trùng tên khác nội dung được đổi tên; trùng ident được sửa', () => {
  const b1 = { title: 'A', images: { 'img_001.png': PNG1 }, questions: [cau({ id: 'q1', no: '1', type: 'essay', points: 1, stem: '<p><img src="images/img_001.png"></p>' })] };
  const b2 = { title: 'B', images: { 'img_001.png': PNG2, 'img_002.png': PNG1 }, questions: [
    cau({ id: 'q1', no: '1', type: 'essay', points: 1, stem: '<p><img src="images/img_001.png"><img src=\'images/img_002.png\'></p>' })] };
  const b3 = { title: 'C', ident: core.bankIdent('A'), images: { 'img_001.png': PNG1 }, questions: [
    cau({ id: 'q1', no: '1', type: 'essay', points: 1, stem: '<p><img src="images/img_001.png"></p>' })] };
  const r = qti.prepare([b1, b2, b3], { target: 'classic' });
  assert.strictEqual(r.packages.length, 1);
  const p = r.packages[0];
  assert.strictEqual(p.fileName, 'Ngan_hang_cau_hoi_3_classic.zip');
  const id3 = core.bankIdent('A').slice(0, 58) + '_2';
  assert.deepStrictEqual(p.files.map(f => f.path), ['imsmanifest.xml',
    'non_cc_assessments/' + core.bankIdent('A') + '.xml.qti', 'non_cc_assessments/' + core.bankIdent('B') + '.xml.qti',
    'non_cc_assessments/' + id3 + '.xml.qti', 'images/img_001.png', 'images/img_001_2.png', 'images/img_002.png']);
  assert.strictEqual(tep(p.files, 'images/img_001_2.png'), PNG2);
  assert.ok(r.issues.some(x => x.level === 'warn' && /trùng mã/.test(x.msg)));
  for (const f of xmlFiles(p.files)) kiemXml(f.data, f.path);
  const s2 = core.xmlText(core.find(core.parseXml(p.files[2].data), 'mattext'));
  assert.strictEqual(s2, '<div><p><img src="images/img_001_2.png"><img src=\'images/img_002.png\'></p></div>');
  const s3 = core.xmlText(core.find(core.parseXml(p.files[3].data), 'mattext'));
  assert.strictEqual(s3, '<div><p><img src="images/img_001.png"></p></div>', 'cùng nội dung → dùng chung file');
  const man = core.parseXml(tep(p.files, 'imsmanifest.xml'));
  assert.ok(man.attrs.identifier.startsWith('nh_goi_'));
  assert.strictEqual(core.findAll(man, 'resource').filter(x => x.attrs.type === 'imsqti_xmlv1p2').length, 3);
  assert.strictEqual(core.findAll(man, 'resource').filter(x => x.attrs.type === 'webcontent').length, 3);
  assert.strictEqual(core.xmlText(core.find(man, 'imsmd:string')), 'A + B + C');
  assert.strictEqual(p.counts.total, 3);
});

/* ---------------- buildFiles / buildPackages ---------------- */

test('buildFiles: danh sách phẳng có .pkg và .issues', () => {
  const b2 = bankMau('Sử 11');
  const f = qti.buildFiles([bankMau(), b2]);
  assert.ok(Array.isArray(f.issues));
  assert.deepStrictEqual([...new Set(f.map(x => x.pkg))], ['Toan_12_Chuong_1_on_tap.zip', 'Su_11.zip']);
  assert.strictEqual(f.filter(x => x.path === 'imsmanifest.xml').length, 2);
  const c = qti.buildFiles([bankMau()], { target: 'classic' });
  assert.deepStrictEqual(c.map(x => x.path)[0], 'imsmanifest.xml');
});

test('buildPackages: nén zip đọc lại được, đúng nội dung, tên file ASCII', async () => {
  const opts = { target: 'itembank', tfMode: 'split', math: 'image' };
  const pk = await qti.buildPackages([bankMau(), bankMau('Địa lý 9')], opts);
  assert.strictEqual(pk.length, 2);
  assert.ok(Array.isArray(pk.issues));
  const pr = qti.prepare([bankMau(), bankMau('Địa lý 9')], opts);
  for (let i = 0; i < pk.length; i++) {
    const p = pk[i];
    assert.match(p.fileName, /^[A-Za-z0-9_-]+\.zip$/);
    assert.ok(p.bytes instanceof Uint8Array && p.bytes.length > 100);
    assert.strictEqual(p.counts.total, 13);
    assert.ok(Array.isArray(p.issues));
    const z = await zip.readZip(p.bytes);
    assert.deepStrictEqual(Object.keys(z).sort(), pr.packages[i].files.map(f => f.path).sort());
    for (const f of pr.packages[i].files) {
      const got = z[f.path];
      if (typeof f.data === 'string') {
        assert.strictEqual(core.utf8Decode(got), f.data);
        assert.ok(!(got[0] === 0xEF && got[1] === 0xBB && got[2] === 0xBF), 'không BOM');
        kiemXml(core.utf8Decode(got), f.path);
      } else assert.deepStrictEqual(Array.from(got), Array.from(f.data));
    }
  }
  assert.deepStrictEqual(pk.map(p => p.fileName), ['Toan_12_Chuong_1_on_tap.zip', 'Dia_ly_9.zip']);
  const cl = await qti.buildPackages([bankMau()], { target: 'classic' });
  assert.strictEqual(cl.length, 1);
  assert.strictEqual(cl[0].fileName, 'Toan_12_Chuong_1_on_tap_classic.zip');
  // đầu vào rỗng
  const rong = await qti.buildPackages([], {});
  assert.deepStrictEqual(Array.from(rong), []);
});

test('mọi tổ hợp tuỳ chọn → XML hợp lệ, không còn câu lỗi', () => {
  for (const target of ['classic', 'itembank'])
    for (const tfMode of ['dropdowns', 'split'])
      for (const stimulus of ['each', 'none'])
        for (const math of ['mathml', 'image'])
          for (const includeFeedback of [true, false]) {
            const r = qti.prepare([bankMau(), bankMau('Lý 11')], { target, tfMode, stimulus, math, includeFeedback, numberInTitle: math === 'image' });
            assert.ok(r.packages.length >= 1);
            for (const p of r.packages) {
              assert.match(p.fileName, /^[A-Za-z0-9_-]+\.zip$/);
              for (const f of xmlFiles(p.files)) kiemXml(f.data, [target, tfMode, stimulus, math, includeFeedback, f.path].join('/'));
              assert.strictEqual(p.counts.skipped, target === 'classic' ? 6 : 3);
            }
          }
});

test('normalizeOptions: mặc định theo DESIGN §5', () => {
  assert.deepStrictEqual(qti.normalizeOptions(), { target: 'itembank', tfMode: 'dropdowns', stimulus: 'each', math: 'mathml', includeFeedback: true, numberInTitle: true });
  assert.deepStrictEqual(qti.normalizeOptions({ target: 'classic', tfMode: 'split', stimulus: 'none', math: 'image', includeFeedback: false, numberInTitle: false }),
    { target: 'classic', tfMode: 'split', stimulus: 'none', math: 'image', includeFeedback: false, numberInTitle: false });
  assert.strictEqual(qti.normalizeOptions({ target: 'xyz' }).target, 'itembank');
});

test('nạp kiểu trình duyệt (UMD, không require) → self.NH.qti cho kết quả như Node', () => {
  const vm = require('vm');
  const ctx = { self: {}, TextEncoder, TextDecoder };
  for (const f of ['core.js', 'zip.js', 'qti.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), ctx);
  ctx.self.NH.html = stubHtml;
  ctx.self.NH.math = stubMath;
  const q = ctx.self.NH.qti;
  assert.strictEqual(typeof q.buildPackages, 'function');
  const a = q.prepare([bankMau()], { target: 'classic', math: 'image' });
  const b = qti.prepare([bankMau()], { target: 'classic', math: 'image' });
  assert.deepStrictEqual(Array.from(a.packages[0].files, f => f.path), b.packages[0].files.map(f => f.path));
  assert.strictEqual(a.packages[0].files[1].data, b.packages[0].files[1].data);
});

test('module thật html.js / math.js (nếu đã có) → vẫn ra XML hợp lệ', () => {
  const coHtml = fs.existsSync(path.join(__dirname, '../js/html.js'));
  const coMath = fs.existsSync(path.join(__dirname, '../js/math.js'));
  if (!coHtml && !coMath) { console.log('       (chưa có html.js/math.js — bỏ qua)'); return; }
  qti._setDeps(null);
  try {
    for (const math of ['mathml', 'image']) {
      const r = qti.prepare([bankMau()], { target: 'classic', math });
      for (const f of xmlFiles(r.packages[0].files)) kiemXml(f.data, 'that/' + math + '/' + f.path);
      assert.ok(r.packages[0].counts.total >= 12);
    }
  } finally { depGia(); }
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 8).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (qti)');
  process.exitCode = hong ? 1 : 0;
})();
