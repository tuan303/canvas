/* tests/canvas-sim.test.cjs — gói QTI qua BỘ MÔ PHỎNG import Canvas (tests/sim-chay.cjs) + các ca hồi quy
 * cho những lỗi bộ mô phỏng đã tìm ra (chạy cả khi không có bộ mô phỏng).
 *
 * Phần mô phỏng cần biến môi trường CANVAS_SIM=<thư mục canvas-sim> (ngoài repo). Không đặt / không chạy được
 * → in "BỎ QUA" và vẫn ĐẠT. Có → mọi nguồn × 9 tổ hợp phải 0 lệch chưa giải thích.
 * Chạy: node tests/canvas-sim.test.cjs [-v]   (CANVAS_SIM=… để chạy cả phần mô phỏng) */
'use strict';
const assert = require('assert');
const core = require('../js/core.js');
const html = require('../js/html.js');
const qti = require('../js/qti.js');
const sim = require('./sim-chay.cjs');

const CHI_TIET = process.argv.includes('-v');
const NBSP = String.fromCharCode(160);
const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

function cau(o) { return Object.assign({ id: 'q1', no: '1', title: 'Câu 1', points: 1, stimulus: '', feedback: '', meta: { level: '', topic: '', part: '', tags: [] }, issues: [] }, o); }
function xuat(qs, opts) {
  const f = qti.buildFiles([{ title: 'Thử', questions: qs, images: {} }], Object.assign({ target: 'classic' }, opts || {}));
  const x = f.find(t => /\.xml\.qti$/.test(t.path));
  assert.ok(x, 'không có file ngân hàng; vấn đề: ' + JSON.stringify(f.issues));
  return core.parseXml(x.data);
}
function mattexts(goc, ten) { return core.findAll(goc, ten).map(n => core.find(n, 'mattext')).filter(Boolean); }
function sachHet(h) { // HTML sau khi làm sạch: không còn mã chạy được ở bất kỳ đâu
  assert.ok(!/<\s*(script|style|iframe|object|embed|svg|form|input|button|textarea|select|template|noscript)\b/i.test(h), 'còn thẻ nguy hiểm: ' + h);
  assert.ok(!/\son[a-z]+\s*=/i.test(h), 'còn thuộc tính sự kiện on*: ' + h);
  assert.ok(!/javascript:/i.test(h), 'còn javascript: ' + h);
  assert.ok(!/alert\(|bad\(|z\(\)/.test(h), 'mã trong <script> lọt thành chữ: ' + h);
}

/* ============ hồi quy: lỗi bộ mô phỏng tìm ra trong js/qti.js ============ */

test('qti: phương án / vế trái / lời giải "chỉ có chữ" có & < > dấu cách cứng → text/plain đã giải thực thể (Canvas detect_html lưu "&lt;" vào trường chữ)', () => {
  const goc = xuat([
    cau({ type: 'mc', stem: '<p>Chọn</p>', choices: [
      { id: 'A', html: '<p>x &lt; 0</p>', correct: true }, { id: 'B', html: 'a&nbsp;&amp;&nbsp;b' },
      { id: 'C', html: '<span>1 &gt; 0</span>' }, { id: 'D', html: '<strong>x &lt; 1</strong>' }, { id: 'E', html: '<p>chữ thường</p>' }, { id: 'F', html: 'a & b' }],
    feedback: '<p>Vì a &lt; b</p>' }),
    cau({ id: 'q2', no: '2', type: 'matching', stem: '<p>Ghép</p>', pairs: [{ left: '<span>a &amp; b</span>', right: 'và' }, { left: '<b>đậm</b>', right: 'đậm' }], distractors: [] }),
    cau({ id: 'q3', no: '3', type: 'essay', stem: '<p>Viết</p>', feedback: '<p>Hướng dẫn</p>' })
  ]);
  const items = core.findAll(goc, 'item');
  const lab = mattexts(items[0], 'response_label').map(m => [m.attrs.texttype, core.xmlText(m)]);
  assert.deepStrictEqual(lab, [['text/plain', 'x < 0'], ['text/plain', 'a & b'], ['text/plain', '1 > 0'],
    ['text/html', '<strong>x &lt; 1</strong>'], ['text/html', '<p>chữ thường</p>'], ['text/plain', 'a & b']]);
  const fb0 = mattexts(items[0], 'itemfeedback')[0];
  assert.deepStrictEqual([fb0.attrs.texttype, core.xmlText(fb0)], ['text/plain', 'Vì a < b']);
  const trai = core.findAll(items[1], 'response_lid').map(l => core.find(core.children(l, 'material')[0], 'mattext')).map(m => [m.attrs.texttype, core.xmlText(m)]);
  assert.deepStrictEqual(trai, [['text/plain', 'a & b'], ['text/html', '<b>đậm</b>']]);
  const fb2 = mattexts(items[2], 'itemfeedback')[0]; // không có ký tự bị escape → giữ text/html như cũ
  assert.deepStrictEqual([fb2.attrs.texttype, core.xmlText(fb2)], ['text/html', '<p>Hướng dẫn</p>']);
});

test('qti: ô một dòng (lựa chọn ô chọn, vế phải, nhiễu) gộp xuống dòng / khoảng trắng kép', () => {
  const goc = xuat([
    cau({ type: 'dropdowns', stem: '<p>Chọn [d1]</p>', dropdowns: [{ id: 'd1', options: ['một\ndòng', 'hai  ' + NBSP + 'dòng'], correct: 1 }] }),
    cau({ id: 'q2', no: '2', type: 'matching', stem: '<p>Ghép</p>', pairs: [{ left: 'x', right: 'bình\nphương' }, { left: 'y', right: 'lập  phương' }], distractors: ['căn\tbậc hai'] })
  ]);
  const items = core.findAll(goc, 'item');
  assert.deepStrictEqual(mattexts(items[0], 'response_label').map(m => core.xmlText(m)), ['một dòng', 'hai dòng']);
  assert.deepStrictEqual(mattexts(core.findAll(items[1], 'response_lid')[0], 'response_label').map(m => core.xmlText(m)).sort(),
    ['bình phương', 'căn bậc hai', 'lập phương']);
});

test('qti: math = image — công thức rỗng bị bỏ (không giữ MathML rỗng kèm cảnh báo)', () => {
  const f = qti.buildFiles([{ title: 'Thử', images: {}, questions: [cau({ type: 'essay',
    stem: '<p>A <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mtext>' + String.fromCharCode(0x2009) + '</mtext></mrow></math> B ' +
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math></p>' })] }], { target: 'classic', math: 'image' });
  const x = f.find(t => /\.xml\.qti$/.test(t.path)).data;
  assert.ok(!/&lt;math/.test(x), 'còn MathML: ' + x);
  assert.strictEqual(x.split('/equation_images/').length - 1, 1);
  assert.deepStrictEqual(f.issues.filter(i => i.level !== 'info').map(i => i.msg), []);
});

test('qti: lưới an toàn — HTML chưa làm sạch còn script/on*/javascript: → làm sạch lại; thiếu html.js → không xuất câu đó', () => {
  const qs = [cau({ type: 'mc', stem: '<center><script>alert(1)</script><p onclick="x()">Chọn</p></center>', stimulus: '<foo><style>p{}</style>Đoạn dẫn</foo>',
    choices: [{ id: 'A', html: '<b onmouseover="x()">1</b>', correct: true }, { id: 'B', html: '<a href="javascript:alert(2)">2</a>' }],
    feedback: '<center><script>bad()</script>Giải</center>' }),
  cau({ id: 'q2', no: '2', type: 'essay', stem: '<p>Câu sạch: thuộc tính &lt;b onclick&gt; chỉ là chữ</p>' })];
  const f = qti.buildFiles([{ title: 'Thử', questions: qs, images: {} }], { target: 'classic' });
  const x = f.find(t => /\.xml\.qti$/.test(t.path));
  const goc = core.parseXml(x.data);
  core.findAll(goc, 'mattext').forEach(m => sachHet(core.xmlText(m)));
  assert.ok(f.issues.some(i => i.level === 'info' && /làm sạch lại/.test(i.msg)), 'thiếu thông báo làm sạch lại');
  assert.strictEqual(core.findAll(goc, 'item').length, 2);
  qti._setDeps({ html: null });
  try {
    const f2 = qti.buildFiles([{ title: 'Thử', questions: qs, images: {} }], { target: 'classic' });
    assert.ok(f2.issues.some(i => i.level === 'error' && /chưa nạp html\.js/.test(i.msg)), JSON.stringify(f2.issues));
    const x2 = f2.find(t => /\.xml\.qti$/.test(t.path));
    assert.strictEqual(core.findAll(core.parseXml(x2.data), 'item').length, 1, 'câu chưa làm sạch vẫn được xuất');
  } finally { qti._setDeps(null); }
});

/* ============ hồi quy: html.cleanForCanvas không dựa vào Canvas để làm sạch ============ */

test('html: script/style/on* bị bỏ ở MỌI chỗ — trong thẻ lạ <center>/<foo> (lỗ hổng bỏ bọc cấp ngoài của Canvas), lồng nhau, trong MathML', () => {
  const vao = [
    '<center><script>alert(1)</script><style>p{}</style><p onclick="x()">a</p></center>',
    '<foo><bar><center><script>alert(2)</script>b</center></bar></foo>',
    '<center><center><div ONMOUSEOVER="x()"><script>alert(3)</script>c</div></center></center>',
    '<marquee><blink><form><script>alert(4)</script><input onfocus="x()"><button>d</button></form></blink></marquee>',
    '<math><mi onclick="x()" href="javascript:alert(5)">x</mi><mtext><script>alert(6)</script><b>t</b></mtext>' +
      '<semantics><script>bad()</script><mi>y</mi><annotation-xml encoding="text/html"><script>z()</script></annotation-xml></semantics></math>',
    '<math><mi><style>*{}</style>q</mi></math><svg><script>alert(7)</script></svg>',
    '<a href="javascript:alert(8)" onclick="x()">e</a><a href=" JaVaScRiPt:alert(9)">f</a><img src="javascript:alert(10)" onerror="x()">',
    '<template><script>alert(11)</script></template><noscript><img src=x onerror=alert(12)></noscript><iframe srcdoc="<script>alert(13)</script>"></iframe>'
  ];
  vao.forEach(v => {
    const r = html.cleanForCanvas(v);
    sachHet(r.html);
  });
  const r0 = html.cleanForCanvas(vao[0]).html;
  assert.strictEqual(r0, '<div style="text-align:center"><p>a</p></div>');
  assert.strictEqual(html.cleanForCanvas(vao[1]).html, '<div style="text-align:center">b</div>');
});

test('html: MathML — style lọc theo allowlist CSS Canvas, semantics lấy con MathML, token giữ chữ, công thức rỗng bị bỏ', () => {
  const m = html.cleanForCanvas('<math><mstyle mathcolor="red" style="font-weight:bold;opacity:.5;color:#c00;letter-spacing:2px"><mi>x</mi></mstyle></math>').html;
  assert.ok(/<mstyle mathcolor="red" style="color:#c00">/.test(m), m);
  assert.ok(!/font-weight|opacity|letter-spacing/.test(m), m);
  const s = html.cleanForCanvas('<math><semantics><script>bad()</script><mi>y</mi><annotation encoding="TeX">y</annotation></semantics></math>').html;
  assert.strictEqual(s, '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>y</mi></math>');
  const t = html.cleanForCanvas('<math><mi><mi>x</mi></mi><mo><b>+</b></mo><mn>1</mn></math>').html;
  assert.strictEqual(t, '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mn>1</mn></math>');
  assert.strictEqual(html.cleanForCanvas('a<math><mrow><mspace width="1em"/></mrow></math>b<math><annotation>x</annotation></math>').html, 'ab');
});

/* ============ phần bộ mô phỏng ============ */

test('bộ mô phỏng Canvas: mọi nguồn × 9 tổ hợp → import (QTIMigrationTool thật + importer/sanitizer/chấm) khớp mô hình nguồn', async () => {
  const kq = await sim.chay({});
  if (kq.boQua) { console.log('    BỎ QUA phần mô phỏng: ' + kq.lyDo); return; }
  const bc = sim.baoCao(kq, CHI_TIET);
  console.log(bc.split('\n').map(l => '    ' + l).join('\n'));
  assert.strictEqual(kq.tk.loiChay, 0, 'có nguồn chạy lỗi');
  assert.ok(kq.tk.item > 0 && kq.tk.cham > 0, 'không đối chiếu được câu nào');
  assert.strictEqual(kq.lech.length, 0, kq.lech.length + ' lệch chưa giải thích (xem báo cáo ở trên)');
});

(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ĐẠT  ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 12).join('\n       ')); }
  }
  console.log(hong ? hong + '/' + ds.length + ' HỎNG' : 'ĐẠT ' + ds.length + '/' + ds.length);
  process.exitCode = hong ? 1 : 0;
})();
