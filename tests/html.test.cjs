/* tests/html.test.cjs — kiểm thử js/html.js: phân tích HTML chịu lỗi, làm sạch cho Canvas, chữ thuần (chạy: node tests/html.test.cjs) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = require('../js/html.js');
const core = require('../js/core.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }
const P = s => html.toHtml(html.parseHtml(s));
const C = (s, o) => html.cleanForCanvas(s, o);
const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Bộ kiểm tra độc lập: HTML sau làm sạch chỉ còn thứ Canvas giữ lại
const THE_OK = new Set(('a b blockquote br caption cite code col colgroup hr h1 h2 h3 h4 h5 h6 del ins font dd div dl dt em ' +
  'figure figcaption i img li ol p pre q small span strike strong sub sup abbr table tbody td tfoot th thead tr u ul ' +
  'address acronym bdo dfn kbd legend samp tt var big article aside details footer header nav section summary time ruby rt rp mark ' +
  'annotation annotation-xml maction maligngroup malignmark math menclose merror mfenced mfrac mglyph mi mlabeledtr mlongdiv ' +
  'mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mscarries mscarry msgroup msline msqrt msrow mstack ' +
  'mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none semantics').split(' '));
function kiemSach(out) {
  const cay = html.parseHtml(out);
  (function di(n, trongMath) {
    (n.children || []).forEach(c => {
      if (c.type !== 'el') return;
      assert.ok(THE_OK.has(c.name), 'thẻ không được phép <' + c.name + '> trong ' + out.slice(0, 200));
      assert.ok(c.name !== 'mspace', 'còn <mspace>');
      Object.keys(c.attrs).forEach(k => {
        assert.ok(!/^on/i.test(k), 'còn thuộc tính sự kiện ' + k);
        assert.ok(!['id', 'loading', 'contenteditable', 'width'].includes(k) || (k === 'width' && /^(img|td|th|table|col|colgroup)$/.test(c.name)), 'thuộc tính ' + k + ' trên <' + c.name + '>');
        if (trongMath || c.name === 'math') assert.ok(k !== 'class', 'class trong MathML');
      });
      if (c.name === 'img') assert.ok(/^(images\/[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)|https?:)/.test(c.attrs.src), 'src ảnh: ' + c.attrs.src);
      if (c.attrs.style) assert.ok(!/var\(|font-weight|letter-spacing|data:/i.test(c.attrs.style), 'style: ' + c.attrs.style);
      di(c, trongMath || c.name === 'math');
    });
  })(cay, false);
  assert.strictEqual(out, out.normalize('NFC'));
}

/* ---------------- parseHtml / toHtml ---------------- */

test('parseHtml: tự đóng p/li/td/tr/dt, thẻ rỗng, thuộc tính không ngoặc', () => {
  assert.strictEqual(P('<p>a<p>b<div>c</div>'), '<p>a</p><p>b</p><div>c</div>');
  assert.strictEqual(P('<ul><li>1<li>2</ul><dl><dt>x<dd>y<dt>z</dl>'), '<ul><li>1</li><li>2</li></ul><dl><dt>x</dt><dd>y</dd><dt>z</dt></dl>');
  assert.strictEqual(P('<table><tr><td>x<td>y<tr><th>z</table>'), '<table><tr><td>x</td><td>y</td></tr><tr><th>z</th></tr></table>');
  assert.strictEqual(P('<table><thead><tr><td>a<tbody><tr><td>b</table>'), '<table><thead><tr><td>a</td></tr></thead><tbody><tr><td>b</td></tr></tbody></table>');
  assert.strictEqual(P('a<br>b<BR/>c<img src=x.png alt=\'q "1"\' width=10>d<hr>'), 'a<br/>b<br/>c<img src="x.png" alt="q &quot;1&quot;" width="10"/>d<hr/>');
  assert.strictEqual(P('<IMG SRC="A.PNG" Alt>'), '<img src="A.PNG" alt=""/>');
  assert.strictEqual(P('<h1>a<h2>b</h2>'), '<h1>a</h1><h2>b</h2>');
});

test('parseHtml: thực thể (tên, số, Windows-1252, không chấm phẩy), comment, doctype, script thô, CDATA', () => {
  assert.strictEqual(P('&nbsp;&amp;&lt;&gt;&quot;&copy;&eacute;&Delta;&le;&minus;&#x1EA1;&#7841;&#150;&#0;&bogus;&amp x'),
    '&#xA0;&amp;&lt;&gt;"©éΔ≤−ạạ–\ufffd&amp;bogus;&amp; x');
  assert.strictEqual(html.decodeEntities('&InvisibleTimes;&ApplyFunction;&ThinSpace;'), '\u2062\u2061\u2009');
  assert.strictEqual(P('<!DOCTYPE html><!-- chú thích <b> --><?xml x?>a'), 'a');
  assert.strictEqual(P('<script>if (a<b && c>d) x("</p>")</script>z'), '<script>if (a<b && c>d) x("</p>")</script>z');
  assert.strictEqual(P('<p><![CDATA[x]]>y</p>'), '<p>y</p>');
  assert.strictEqual(P('<math><mi><![CDATA[x<y]]></mi></math>'), '<math><mi>x&lt;y</mi></math>');
  assert.strictEqual(P('a < b và 3<4'), 'a &lt; b và 3&lt;4');
});

test('parseHtml: thẻ đóng lạc, MathML (tự đóng, tiền tố m:, thoát khi thiếu </math>)', () => {
  assert.strictEqual(P('<div>a</span>b</div>c</p>'), '<div>ab</div>c');
  assert.strictEqual(P('<table><tr><td><div>x</td></tr></table>y'), '<table><tr><td><div>x</div></td></tr></table>y');
  assert.strictEqual(P('<math><mspace width="1em"/><mi>x</mi></math>'), '<math><mspace width="1em"/><mi>x</mi></math>');
  assert.strictEqual(P('<m:math><m:mi>x</m:mi></m:math>'), '<math><mi>x</mi></math>');
  assert.strictEqual(P('<math><mi>x</mi><p>chữ</p>'), '<math><mi>x</mi></math><p>chữ</p>');
  assert.strictEqual(P('<math><mtext><b>đậm</b></mtext></math>'), '<math><mtext><b>đậm</b></mtext></math>');
  const n = html.parseHtml('<p class=a>x</p>');
  assert.strictEqual(n.name, '#fragment');
  assert.deepStrictEqual(n.children[0], { type: 'el', name: 'p', attrs: { class: 'a' }, children: [{ type: 'text', text: 'x' }] });
});

/* ---------------- cleanForCanvas: allowlist ---------------- */

test('cleanForCanvas: bỏ thuộc tính ngoài allowlist (on*, id, loading, contenteditable, data-* của gói) và thẻ lạ', () => {
  const r = C('<p onclick="x()" id="p1" data-ans="B" data-equation-content="x+1" contenteditable="true" title="t" lang="vi">A</p>' +
    '<img src="images/a.png" loading="lazy" onerror="x" usemap="#m"><o:p></o:p><custom-el>giữ chữ</custom-el><a href="javascript:alert(1)">x</a><a href="https://a.vn" target="_blank" name="n">y</a><a name="neo">z</a>');
  assert.strictEqual(r.html, '<p data-equation-content="x+1" title="t" lang="vi">A</p><img src="images/a.png" alt="" style="max-width:100%;height:auto"/>giữ chữx<a href="https://a.vn" target="_blank">y</a>z');
  kiemSach(r.html);
  assert.deepStrictEqual(r.usedImages, ['a.png']);
  assert.strictEqual(C('<p id="x">a</p>', { keepIds: true }).html, '<p id="x">a</p>');
});

test('cleanForCanvas: bỏ script/style/svg/input/button (kèm cảnh báo), label giữ chữ, s/strike → del, center → div', () => {
  const r = C('<p>a<script>alert(1)</script><style>p{}</style><svg><rect/></svg><input value="1"><button>Nộp bài</button><select><option>x</option></select>' +
    '<label>Nhãn</label> <s>sai</s> <strike>cũ</strike></p><center>giữa</center><iframe src="https://youtube.com"></iframe>');
  assert.strictEqual(r.html, '<p>aNhãn <del>sai</del> <del>cũ</del></p><div style="text-align:center">giữa</div>');
  const msg = r.issues.map(x => x.level + ':' + x.msg).join('\n');
  assert.ok(/warn:.*script/.test(msg));
  assert.ok(/info:.*style/.test(msg));
  assert.ok(/warn:.*SVG/.test(msg));
  assert.ok(/warn:.*input/.test(msg) && /warn:.*button/.test(msg));
  assert.ok(/info:.*label/.test(msg));
  assert.ok(/warn:.*iframe/.test(msg));
  // mỗi loại cảnh báo chỉ một lần
  assert.strictEqual(C('<svg></svg><svg></svg>').issues.length, 1);
  kiemSach(r.html);
});

test('cleanForCanvas: MathML — thêm xmlns, bỏ class/thuộc tính lạ, mspace → mtext khoảng mảnh, bỏ annotation, bỏ khoảng trắng thừa', () => {
  const r = C('<math displaystyle="true" data-x="1"><mi class="a" mathvariant="normal" foo="1">x</mi> <mo class="hemo" stretchy="false" lspace="0">{</mo>' +
    '<mspace width="10px"/><mspace width="0"/><mspace/><mtable columnalign="left" rowspacing="3pt"><mtr><mtd><mi> y </mi></mtd></mtr></mtable>' +
    '<semantics><mi>z</mi><annotation encoding="TeX">z</annotation></semantics><span>t</span></math>');
  assert.strictEqual(r.html, '<math xmlns="http://www.w3.org/1998/Math/MathML" displaystyle="true"><mi mathvariant="normal">x</mi><mo stretchy="false" lspace="0">{</mo>' +
    '<mtext>&#x2009;&#x2009;</mtext><mtable columnalign="left" rowspacing="3pt"><mtr><mtd><mi>y</mi></mtd></mtr></mtable><mi>z</mi></math><span>t</span>'); // <span> thoát khỏi MathML như HTML5 (Nokogiri)
  // span lạ trong MathML ngoài token: giữ chữ → bọc mtext
  assert.ok(C('<math><mrow>abc</mrow></math>').html.includes('<mtext>abc</mtext>'));
  assert.ok(C('<math><semantics><mi>z</mi><annotation>z</annotation></semantics></math>', { keepAnnotations: true }).html.includes('<annotation>'));
  assert.strictEqual(C('<math><mi>a</mi><mspace width="thickmathspace"/><mspace width="-0.2em"/><mi>b</mi></math>').html,
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mtext>&#x2009;</mtext><mi>b</mi></math>');
  assert.strictEqual(C('<math xmlns="sai"><mi>x</mi></math>').html,'<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>');
  kiemSach(r.html);
});

/* ---------------- cleanForCanvas: CSS ---------------- */

test('cleanForCanvas: lớp → style trực tiếp (dạng chuỗi), var(--x), lọc thuộc tính CSS, font-weight → <strong>', () => {
  const r = C('<div class="hop la" style="color:var(--do);letter-spacing:2px;opacity:.5;font-size:15px !important">x</div><span class="dam">y</span>',
    { cssMap: { hop: 'border:1px solid var(--line);padding:4px;box-shadow:0 0 1px #000', dam: 'font-weight:700;color:var(--khong, #123)' }, rootVars: { '--line': '#ddd', do: '#D21235' } });
  assert.strictEqual(r.html, '<div class="la" style="border:1px solid #ddd;padding:4px;color:#D21235;font-size:15px">x</div><span style="color:#123"><strong>y</strong></span>');
  // biến không có giá trị → bỏ khai báo + cảnh báo
  const r2 = C('<p style="color:var(--mat);margin:0">a</p>');
  assert.strictEqual(r2.html, '<p style="margin:0">a</p>');
  assert.ok(r2.issues.some(x => x.level === 'warn' && /--mat/.test(x.msg)));
  // font-weight:normal trên th / thẻ đậm sẵn: không bọc thêm
  assert.strictEqual(C('<b style="font-weight:bold">a</b><th>b</th>').html, '<b>a</b><th>b</th>');
  // url(data:) bị bỏ
  const r3 = C('<div style="background:url(data:image/png;base64,AAA);color:red">a</div>');
  assert.strictEqual(r3.html, '<div style="color:red">a</div>');
  kiemSach(r.html);
});

test('cleanForCanvas: cssMap dạng css.classes của bộ trích SCORM (bộ chọn con cháu, độ ưu tiên, @media, giả lớp)', () => {
  const cssMap = {
    mini: ['table.mini { border-collapse:collapse;margin:10px 0;width:100%;font-size:14px }',
      'table.mini th,table.mini td { border:1px solid #b9c4d8;padding:6px 9px;text-align:center }',
      'table.mini th { background:#eef2f9;font-weight:700 }', '.datatable table.mini { background:#fff }'],
    scrollx: ['.scrollx { overflow-x:auto }'],
    q: ['.q { padding:11px 0;border-top:1px dashed var(--line) }', '.q:first-child { border-top:0 }', '.q.ex { padding:10px 12px }',
      '[@media (max-width:600px)] .q { padding:0 }'],
    hemo: ['math mo.hemo { font-size:2.9em;line-height:0 }'],
    doan: []
  };
  const r = C('<div class="scrollx"><table class="mini" style="min-width:620px"><tr><th>A</th><td style="text-align:left">1</td></tr></table></div>' +
    '<div class="q ex">v</div><div class="q">w</div><p class="doan">đoạn</p><math><mo class="hemo">{</mo></math>', { cssMap, rootVars: { '--line': '#dde3f1' } });
  assert.strictEqual(r.html,
    '<div style="overflow-x:auto"><table style="border-collapse:collapse;margin:10px 0;width:100%;font-size:14px;min-width:620px">' +
    '<tr><th style="border:1px solid #b9c4d8;padding:6px 9px;text-align:center;background:#eef2f9">A</th>' +
    '<td style="border:1px solid #b9c4d8;padding:6px 9px;text-align:left">1</td></tr></table></div>' +
    '<div style="padding:10px 12px;border-top:1px dashed #dde3f1">v</div><div style="padding:11px 0;border-top:1px dashed #dde3f1">w</div>' +
    '<p>đoạn</p><math xmlns="http://www.w3.org/1998/Math/MathML"><mo>{</mo></math>');
  kiemSach(r.html);
  // cssMap dạng chuỗi CSS
  assert.strictEqual(C('<ul class="x"><li>a</li></ul>', { cssMap: '.x li { color: red } @media print { .x li { color: blue } }' }).html,
    '<ul><li style="color:red">a</li></ul>'); // lớp có trong CSS đã chuyển thành style → bỏ
});

test('cleanForCanvas: bảng — border-collapse, bảng rộng (≥ 6 cột hoặc ≥ 500px) bọc cuộn ngang, không bọc hai lần', () => {
  assert.strictEqual(C('<table><tr><td>1</td></tr></table>').html, '<table style="border-collapse:collapse"><tr><td>1</td></tr></table>');
  const sau = '<table><tr>' + '<td>x</td>'.repeat(6) + '</tr></table>';
  assert.ok(C(sau).html.startsWith('<div style="overflow-x:auto"><table'));
  assert.ok(C('<table width="640"><tr><td>x</td></tr></table>').html.startsWith('<div style="overflow-x:auto">'));
  assert.ok(C('<table style="min-width:40em"><tr><td>x</td></tr></table>').html.startsWith('<div style="overflow-x:auto">'));
  assert.strictEqual((C('<div style="overflow-x:auto">' + sau + '</div>').html.match(/overflow-x/g) || []).length, 1);
  // khoảng trắng giữa các ô bị bỏ, trong <pre> được giữ
  assert.strictEqual(C('<table>\n <tr>\n  <td> a  b </td>\n </tr>\n</table>').html, '<table style="border-collapse:collapse"><tr><td> a b </td></tr></table>');
  assert.strictEqual(C('<pre>a\n  b</pre>').html, '<pre>a\n  b</pre>');
});

/* ---------------- cleanForCanvas: ảnh ---------------- */

test('cleanForCanvas: ảnh — imageMap (khớp đúng, hoa/thường, ./, mã hoá URL, theo tên file), images/ có sẵn, thiếu ảnh, ảnh Internet', () => {
  const images = { 'hinh_1.png': new Uint8Array([1]), 'c01.png': new Uint8Array([2]) };
  const imageMap = { 'Hình 1.PNG': 'hinh_1.png', 'media/sub/Anh2.jpg': 'images/anh_2.jpg' };
  const r = C('<img src="Hình 1.PNG"><img src="./h%C3%ACnh%201.png"><img src="other/dir/Anh2.jpg?v=1" alt="b"><img src="images/c01.png" width="100">',
    { images: Object.assign({ 'anh_2.jpg': new Uint8Array([3]) }, images), imageMap });
  assert.deepStrictEqual(r.usedImages, ['hinh_1.png', 'anh_2.jpg', 'c01.png']);
  assert.strictEqual((r.html.match(/src="images\/hinh_1\.png"/g) || []).length, 2);
  assert.ok(r.html.includes('<img src="images/anh_2.jpg" alt="b" style="max-width:100%;height:auto"/>'));
  assert.ok(r.html.includes('<img src="images/c01.png" width="100" alt="" style="max-width:100%;height:auto"/>'));
  assert.deepStrictEqual(r.issues, []);
  kiemSach(r.html);
  // thiếu ảnh → lỗi
  const r2 = C('<img src="khong_co.png">', { images: {} });
  assert.ok(r2.issues.some(x => x.level === 'error' && /khong_co\.png/.test(x.msg)));
  const r3 = C('<img src="images/thieu.png">', { images: { 'a.png': new Uint8Array(1) } });
  assert.ok(r3.issues.some(x => x.level === 'error' && /thieu\.png/.test(x.msg)));
  // không truyền images: tin images/<tên> đã có (docx.js đã đổi tên)
  assert.deepStrictEqual(C('<img src="images/img_001.png">').issues, []);
  // ảnh Internet: giữ, cảnh báo; javascript: → bỏ
  const r4 = C('<img src="https://x.vn/a.png"><img src="javascript:x">');
  assert.strictEqual(r4.html, '<img src="https://x.vn/a.png" alt="" style="max-width:100%;height:auto"/>');
  assert.ok(r4.issues.some(x => x.level === 'warn') && r4.issues.some(x => x.level === 'error'));
  // không src → bỏ + lỗi
  assert.ok(C('<img alt="x">').issues.some(x => x.level === 'error'));
});

test('cleanForCanvas: ảnh data: URI được tách thành tệp (theo nội dung thật), trùng thì dùng lại, định dạng lạ báo lỗi', () => {
  const images = {};
  const r = C('<p><img src="data:image/png;base64,' + PNG1 + '" alt="a"><img src="data:image/jpeg;base64,' + PNG1 + '"></p>', { images });
  const ten = Object.keys(images);
  assert.strictEqual(ten.length, 1);
  assert.ok(/^img_[0-9a-f]{8}\.png$/.test(ten[0]), ten[0]);
  assert.strictEqual(images[ten[0]][0], 0x89);
  assert.strictEqual(images[ten[0]][1], 0x50);
  assert.deepStrictEqual(r.usedImages, ten);
  assert.ok(!/data:/.test(r.html));
  assert.strictEqual((r.html.match(new RegExp('src="images/' + ten[0] + '"', 'g')) || []).length, 2);
  kiemSach(r.html);
  // không truyền images → trả về images mới
  const r2 = C('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">');
  assert.deepStrictEqual(Object.keys(r2.images).map(x => /\.gif$/.test(x)), [true]);
  // webp / svg nhúng → lỗi, bỏ ảnh
  const r3 = C('<img src="data:image/webp;base64,UklGRh4AAABXRUJQVlA4">x');
  assert.strictEqual(r3.html, 'x');
  assert.ok(r3.issues.some(x => x.level === 'error' && /webp/.test(x.msg)));
});

test('cleanForCanvas: chuẩn hoá NFC, gộp khoảng trắng, giữ tiếng Việt và ký hiệu', () => {
  const nfd = 'Tiếng Việt'.normalize('NFD');
  const r = C('<p>' + nfd + '  có\n\n  dấu  — ∫ π ≤ u\u20d7</p>');
  assert.strictEqual(r.html, '<p>Tiếng Việt có dấu — ∫ π ≤ u\u20d7</p>');
  assert.strictEqual(C('').html, '');
  assert.strictEqual(C(null).html, '');
  assert.strictEqual(C('chữ thường & <3').html, 'chữ thường &amp; &lt;3');
});

/* ---------------- toPlainText ---------------- */

test('toPlainText: bỏ thẻ, MathML → chữ Unicode, mũ/chỉ số, xuống dòng, ảnh → alt', () => {
  const T = s => html.toPlainText(s);
  assert.strictEqual(T('<p>Hà <b>Nội</b></p><p>Huế</p>'), 'Hà Nội Huế');
  assert.strictEqual(T('x<sup>2</sup> + H<sub>2</sub>O, 30<sup>o</sup>C, 10<sup>-3</sup>, e<sup>0,5t</sup>'), 'x² + H₂O, 30°C, 10⁻³, e^(0,5t)');
  assert.strictEqual(T('<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math> và <math><msqrt><mn>3</mn></msqrt></math>'), '½ và √3');
  assert.strictEqual(T('<math displaystyle="true"><mi>y</mi><mo>=</mo><mfrac><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>−</mo><mn>1</mn></mrow><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></mfrac></math>'), 'y = (x² − 1)/(x + 1)');
  assert.strictEqual(T('a&nbsp;b &amp; c &lt; d'), 'a b & c < d');
  assert.strictEqual(T('<img src="x.png" alt="Hình A"> <img src="y.png">'), 'Hình A');
  assert.strictEqual(T('<script>x()</script><style>p{}</style>chữ'), 'chữ');
  assert.strictEqual(html.toPlainText('a<br>b<p>c</p>d', { lines: true }),'a\nb\nc\nd');
  assert.strictEqual(T('a<br>b<p>c</p>d'), 'a b c d');
  assert.strictEqual(T(''), '');
  assert.strictEqual(T('Tie\u0302\u0301ng'), 'Tiếng');
  // nhận cả cây đã phân tích
  assert.strictEqual(html.toPlainText(html.parseHtml('<i>x</i>')), 'x');
});

/* ---------------- Corpus thật (nếu có) ---------------- */

test('corpus SCORM cục bộ (nếu có): mọi mảnh HTML làm sạch được, chỉ còn thẻ/thuộc tính Canvas giữ', () => {
  const dir = path.join(process.env.TEMP || process.env.TMP || '', 'claude');
  const ung = [];
  (function tim(d, sau) {
    if (sau > 4 || !fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name === 'corpus') fs.readdirSync(p).filter(x => x.endsWith('.json')).forEach(x => ung.push(path.join(p, x))); else tim(p, sau + 1); }
    }
  })(dir, 0);
  if (!ung.length) { console.log('    BỎ QUA: không thấy thư mục corpus'); return; }
  let n = 0, coMath = 0, coBang = 0;
  for (const f of ung) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const imageMap = {};
    ((j.images && j.images.referenced) || []).forEach(r => { imageMap[r.src] = path.basename(r.src).toLowerCase().replace(/[^a-z0-9_.-]/g, '_'); });
    const strs = [];
    (function w(x) { if (typeof x === 'string') { if (/<[a-z]/i.test(x)) strs.push(x); } else if (x && typeof x === 'object') for (const k in x) w(x[k]); })([j.EXAM, j.PARTS]);
    for (const s of strs) {
      const r = C(s, { cssMap: j.css && j.css.classes, rootVars: j.css && j.css.rootVars, imageMap });
      kiemSach(r.html);
      assert.ok(!r.issues.some(x => x.level === 'error'), path.basename(f) + ': ' + JSON.stringify(r.issues));
      const t = html.toPlainText(s);
      assert.ok(!/<[a-z\/]/i.test(t), 'còn thẻ trong chữ thuần: ' + t);
      if (/<math/.test(s)) coMath++;
      if (/<table/.test(s)) coBang++;
      n++;
    }
  }
  console.log('    ' + ung.length + ' tệp, ' + n + ' mảnh HTML (' + coMath + ' có công thức, ' + coBang + ' có bảng)');
});

(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ĐẠT  ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 8).join('\n       ')); }
  }
  console.log(hong ? hong + '/' + ds.length + ' HỎNG' : 'ĐẠT ' + ds.length + '/' + ds.length);
  process.exitCode = hong ? 1 : 0;
})();
