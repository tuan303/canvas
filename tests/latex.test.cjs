/* tests/latex.test.cjs — kiểm thử js/latex.js: LaTeX → MathML, thay $…$ trong văn bản (chạy: node tests/latex.test.cjs) */
'use strict';
const assert = require('assert');
const latex = require('../js/latex.js');
const math = require('../js/math.js');
const core = require('../js/core.js');
const html = require('../js/html.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }
const NS = '<math xmlns="http://www.w3.org/1998/Math/MathML">';
const X = (tex, o) => latex.toMathML(tex, o);
const body = (tex, o) => X(tex, o).replace(/^<math[^>]*>|<\/math>$/g, '');

// 35 công thức THPT thường gặp
const CT = String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
\Delta = b^2 - 4ac
y = ax^2 + bx + c
\sqrt[3]{x + 1}
\int_{0}^{1} (2x + 1)\,dx = 2
\int_a^b f(x)\,dx = F(b) - F(a)
\lim_{x \to +\infty} \frac{2x + 1}{x - 3} = 2
\lim_{x \to 0} \frac{\sin x}{x} = 1
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
\vec{u} = (1; -2; 3)
\overrightarrow{AB} + \overrightarrow{BC} = \overrightarrow{AC}
\begin{cases} x + y = 3 \\ 2x - y = 0 \end{cases}
\left[\begin{array}{l} x = 1 \\ x = 2 \end{array}\right.
\sin^2 x + \cos^2 x = 1
\log_a b = \frac{\ln b}{\ln a}
\log_{2}(x - 1) \le 3
f'(x) = 3x^2 - 6x
x \in \mathbb{R} \setminus \{1\}
D = (-\infty; 2] \cup [5; +\infty)
\forall x \in \mathbb{N}, \exists y \ne x
\widehat{ABC} = 60^\circ
S = \pi r^2
V = \frac{1}{3} B h
C_n^k = \frac{n!}{k!(n-k)!}
P(A \cap B) = P(A) \cdot P(B)
\left| x - 2 \right| < 3
a_{n+1} = a_n + d
e^{i\pi} + 1 = 0
\tan \alpha = \dfrac{\sin \alpha}{\cos \alpha}
\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}
y = 0{,}5x + 1{,}25
AB \perp CD,\ AB \parallel EF
x^{2} \geq 0 \Rightarrow \sqrt{x^2} = |x|
\text{Vậy } x = 2
\overline{z} = a - bi`.split('\n');

// dạng chuẩn để so LaTeX gốc với LaTeX sinh lại
function chuan(s) {
  return s.replace(/\\(leq|geq|neq)(?![A-Za-z])/g, (m, a) => '\\' + a.slice(0, 2))
    .replace(/\\vec(?![A-Za-z])/g, '\\overrightarrow').replace(/\\bar(?![A-Za-z])/g, '\\overline')
    .replace(/\s+/g, '').replace(/([_^])\{([^{}\\])\}/g, '$1$2').replace(/([_^])\{(\\[A-Za-z]+)\}/g, '$1$2');
}
function hopLeXml(m) {
  const n = core.parseXml(m);
  assert.strictEqual(n.name, 'math', 'không phải một phần tử <math>: ' + m);
  assert.strictEqual(core.toXml(n), m.replace(/&#x([0-9A-F]+);/g, (x, h) => String.fromCodePoint(parseInt(h, 16))).replace(/<(\w+)([^>]*)><\/\1>/g, '<$1$2/>'));
}

/* ---------------- Vòng tròn LaTeX → MathML → LaTeX ---------------- */

test('35 công thức THPT: không cảnh báo, MathML hợp lệ XML, vòng tròn là điểm bất động, giữ nguyên nghĩa', () => {
  assert.ok(CT.length >= 30);
  CT.forEach((t, i) => {
    const iss = [];
    const m1 = X(t, { issues: iss });
    assert.deepStrictEqual(iss, [], 'công thức ' + i + ': ' + t);
    hopLeXml(m1);
    const t2 = math.mathmlToLatex(m1);
    const m2 = X(t2);
    assert.strictEqual(m2, m1, 'MathML khác sau vòng tròn — ' + i + ': ' + t + ' → ' + t2);
    assert.strictEqual(math.mathmlToLatex(m2), t2, 'LaTeX không ổn định — ' + i);
    assert.strictEqual(chuan(t2), chuan(t), 'LaTeX sinh lại khác nghĩa — ' + i + ': ' + t2);
  });
});

test('chữ Unicode của vài công thức (qua math.mathmlToText)', () => {
  const T = t => math.mathmlToText(X(t));
  assert.strictEqual(T(CT[0]), 'x = (−b ± √(b² − 4ac))/(2a)');
  assert.strictEqual(T(CT[6]), 'lim_(x→+∞) (2x + 1)/(x − 3) = 2');
  assert.strictEqual(T(CT[9]), 'u\u20d7 = (1; −2; 3)');
  assert.strictEqual(T(CT[11]), '{x + y = 3; 2x − y = 0}');
  assert.strictEqual(T(CT[17]), 'x ∈ ℝ ∖ {1}');
  assert.strictEqual(T(CT[20]), '∠ABC = 60°');
  assert.strictEqual(T(CT[30]), 'y = 0,5x + 1,25');
});

/* ---------------- Cấu trúc MathML ---------------- */

test('phân số, căn, mũ/chỉ số, toán tử lớn', () => {
  assert.strictEqual(X('\\frac{a}{b}'), NS + '<mfrac><mi>a</mi><mi>b</mi></mfrac></math>');
  assert.strictEqual(body('\\frac12'), '<mfrac><mn>1</mn><mn>2</mn></mfrac>');
  assert.strictEqual(body('\\dfrac{a}{b}'), '<mstyle displaystyle="true"><mfrac><mi>a</mi><mi>b</mi></mfrac></mstyle>');
  assert.strictEqual(body('\\sqrt{x}'), '<msqrt><mi>x</mi></msqrt>');
  assert.strictEqual(body('\\sqrt{x+1}'), '<msqrt><mi>x</mi><mo>+</mo><mn>1</mn></msqrt>');
  assert.strictEqual(body('\\sqrt[3]{x}'), '<mroot><mi>x</mi><mn>3</mn></mroot>');
  assert.strictEqual(body('x^2_3'), '<msubsup><mi>x</mi><mn>3</mn><mn>2</mn></msubsup>');
  assert.strictEqual(body('x^12'), '<msup><mi>x</mi><mn>1</mn></msup><mn>2</mn>'); // như TeX: chỉ một ký tự
  assert.strictEqual(body('x^{12}'), '<msup><mi>x</mi><mn>12</mn></msup>');
  assert.strictEqual(body("f''"), '<msup><mi>f</mi><mo>″</mo></msup>');
  assert.strictEqual(body('\\sum_{i=1}^n'), '<munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover>');
  assert.strictEqual(body('\\lim_{x\\to 0}'), '<munder><mo>lim</mo><mrow><mi>x</mi><mo>→</mo><mn>0</mn></mrow></munder>');
  assert.strictEqual(body('\\int_0^1'), '<msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup>');
  assert.strictEqual(body('\\int\\limits_0^1'), '<munderover><mo>∫</mo><mn>0</mn><mn>1</mn></munderover>');
  assert.strictEqual(body('\\sum\\nolimits_{k}'), '<msub><mo>∑</mo><mi>k</mi></msub>');
  assert.strictEqual(body('\\binom{n}{k}'), '<mrow><mo>(</mo><mfrac linethickness="0"><mi>n</mi><mi>k</mi></mfrac><mo>)</mo></mrow>');
  assert.strictEqual(body('{}^{14}_{6}C'), '<msubsup><mrow/><mn>6</mn><mn>14</mn></msubsup><mi>C</mi>');
});

test('ký hiệu: Hy Lạp, quan hệ, phép toán, hàm, tập số, chữ, khoảng trắng', () => {
  assert.strictEqual(body('\\alpha\\Delta'), '<mi>α</mi><mi mathvariant="normal">Δ</mi>');
  assert.strictEqual(body('a\\le b\\ge c\\ne d\\pm e\\cdot f\\times g\\div h'),
    '<mi>a</mi><mo>≤</mo><mi>b</mi><mo>≥</mo><mi>c</mi><mo>≠</mo><mi>d</mi><mo>±</mo><mi>e</mi><mo>⋅</mo><mi>f</mi><mo>×</mo><mi>g</mi><mo>÷</mo><mi>h</mi>');
  assert.strictEqual(body('x\\to\\infty'), '<mi>x</mi><mo>→</mo><mi>∞</mi>');
  assert.strictEqual(body('\\forall x\\in A\\exists'), '<mo>∀</mo><mi>x</mi><mo>∈</mo><mi>A</mi><mo>∃</mo>');
  assert.strictEqual(body('a-b'), '<mi>a</mi><mo>−</mo><mi>b</mi>');
  assert.strictEqual(body('a<b'), '<mi>a</mi><mo>&lt;</mo><mi>b</mi>');
  assert.strictEqual(body('\\sin x'), '<mi>sin</mi><mi>x</mi>');
  assert.strictEqual(body('\\tg x'), '<mi>tg</mi><mi>x</mi>');
  assert.strictEqual(body('\\operatorname{sgn} x'), '<mi>sgn</mi><mi>x</mi>');
  assert.strictEqual(body('\\mathbb{R}\\mathbb{N}\\mathbb{Z}\\mathbb{Q}'), '<mi>ℝ</mi><mi>ℕ</mi><mi>ℤ</mi><mi>ℚ</mi>');
  assert.strictEqual(body('\\mathbb{K}'), '<mi>\u{1D542}</mi>');
  assert.strictEqual(body('\\mathbf{v}'), '<mi mathvariant="bold">v</mi>');
  assert.strictEqual(body('\\mathrm{d}x'), '<mi mathvariant="normal">d</mi><mi>x</mi>');
  assert.strictEqual(body('\\text{ và }'), '<mtext>&#xA0;và&#xA0;</mtext>');
  assert.strictEqual(body('\\text{a\\{b\\}}'), '<mtext>a{b}</mtext>');
  assert.strictEqual(body('a\\,b\\;c\\quad d'), '<mi>a</mi><mtext>&#x2009;</mtext><mi>b</mi><mtext>&#x2004;</mtext><mi>c</mi><mtext>&#x2003;</mtext><mi>d</mi>');
  assert.strictEqual(body('a\\!b'), '<mi>a</mi><mi>b</mi>');
  assert.strictEqual(body('0,5+1.25+0{,}75'), '<mn>0,5</mn><mo>+</mo><mn>1.25</mn><mo>+</mo><mn>0,75</mn>');
  assert.strictEqual(body('A(1;2)'), '<mi>A</mi><mo stretchy="false">(</mo><mn>1</mn><mo>;</mo><mn>2</mn><mo stretchy="false">)</mo>');
  assert.strictEqual(body('60^\\circ'), '<msup><mn>60</mn><mo>∘</mo></msup>');
  assert.strictEqual(body('\\not\\in'), '<mo>∉</mo>');
  assert.strictEqual(body('\\not='), '<mo>≠</mo>');
  assert.strictEqual(body('50\\%'), '<mn>50</mn><mo>%</mo>');
  assert.strictEqual(body('θ ≤ π'), '<mi>θ</mi><mo>≤</mo><mi>π</mi>'); // gõ thẳng Unicode
  assert.strictEqual(body('\\{1;2\\}'), '<mo stretchy="false">{</mo><mn>1</mn><mo>;</mo><mn>2</mn><mo stretchy="false">}</mo>');
});

test('dấu: vectơ, gạch trên, mũ, cung, overset/underset, xrightarrow', () => {
  assert.strictEqual(body('\\vec{u}'), '<mover accent="true"><mi>u</mi><mo>→</mo></mover>');
  assert.strictEqual(body('\\overrightarrow{AB}'), '<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>→</mo></mover>');
  assert.strictEqual(body('\\overline{AB}'), '<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>¯</mo></mover>');
  assert.strictEqual(body('\\widehat{ABC}'), '<mover accent="true"><mrow><mi>A</mi><mi>B</mi><mi>C</mi></mrow><mo>^</mo></mover>');
  assert.strictEqual(body('\\underline{x}'), '<munder accentunder="true"><mi>x</mi><mo>_</mo></munder>');
  assert.strictEqual(body('\\overset{\\frown}{AB}'), '<mover><mrow><mi>A</mi><mi>B</mi></mrow><mo>⌢</mo></mover>');
  assert.strictEqual(math.mathmlToLatex(X('\\overset{\\frown}{AB}')), '\\overset{\\frown}{AB}');
  assert.strictEqual(body('\\underset{x}{\\max}'), '<munder><mo>max</mo><mi>x</mi></munder>');
  assert.strictEqual(body('\\xrightarrow{t^\\circ}'), '<mover><mo>→</mo><msup><mi>t</mi><mo>∘</mo></msup></mover>');
});

test('môi trường: cases, array, matrix các loại, aligned; \\left \\right', () => {
  assert.strictEqual(body('\\begin{cases}x=1\\\\y=2\\end{cases}'),
    '<mrow><mo>{</mo><mtable columnalign="left left"><mtr><mtd><mi>x</mi><mo>=</mo><mn>1</mn></mtd></mtr><mtr><mtd><mi>y</mi><mo>=</mo><mn>2</mn></mtd></mtr></mtable></mrow>');
  // \\ thừa ở cuối không tạo hàng rỗng
  assert.strictEqual(body('\\begin{cases}a\\\\b\\\\\\end{cases}'), body('\\begin{cases}a\\\\b\\end{cases}'));
  assert.strictEqual(body('\\begin{array}{lc}a&b\\end{array}'), '<mtable columnalign="left center"><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr></mtable>');
  assert.strictEqual(body('\\begin{bmatrix}1\\end{bmatrix}'), '<mrow><mo>[</mo><mtable><mtr><mtd><mn>1</mn></mtd></mtr></mtable><mo>]</mo></mrow>');
  assert.strictEqual(body('\\begin{vmatrix}1\\end{vmatrix}'), '<mrow><mo>|</mo><mtable><mtr><mtd><mn>1</mn></mtd></mtr></mtable><mo>|</mo></mrow>');
  assert.strictEqual(body('\\begin{aligned}a&=b\\\\&=c\\end{aligned}'),
    '<mtable columnalign="right left"><mtr><mtd><mi>a</mi></mtd><mtd><mo>=</mo><mi>b</mi></mtd></mtr><mtr><mtd/><mtd><mo>=</mo><mi>c</mi></mtd></mtr></mtable>');
  assert.strictEqual(body('\\left(\\frac{a}{b}\\right)'), '<mrow><mo>(</mo><mfrac><mi>a</mi><mi>b</mi></mfrac><mo>)</mo></mrow>');
  assert.strictEqual(body('\\left.\\frac{a}{b}\\right|_{x=0}'), '<msub><mrow><mo></mo><mfrac><mi>a</mi><mi>b</mi></mfrac><mo>|</mo></mrow><mrow><mi>x</mi><mo>=</mo><mn>0</mn></mrow></msub>');
  assert.strictEqual(body('\\left\\{x\\right\\}'), '<mrow><mo>{</mo><mi>x</mi><mo>}</mo></mrow>');
  assert.strictEqual(body('\\big( x \\big)'), '<mo stretchy="false">(</mo><mi>x</mi><mo stretchy="false">)</mo>');
  // vòng tròn tuyển (hoặc) kiểu Việt Nam
  assert.strictEqual(math.mathmlToLatex(X('\\left[\\begin{array}{l}x=1\\\\x=2\\end{array}\\right.')), '\\left[\\begin{array}{l} x = 1 \\\\ x = 2 \\end{array}\\right.');
});

test('tuỳ chọn display / displaystyle', () => {
  assert.strictEqual(X('x', { display: true }), '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>x</mi></math>');
  assert.strictEqual(X('x', { displaystyle: true }), '<math xmlns="http://www.w3.org/1998/Math/MathML" displaystyle="true"><mi>x</mi></math>');
  assert.strictEqual(X(''), NS + '</math>');
  assert.strictEqual(body('\\displaystyle\\frac{a}{b}'), '<mstyle displaystyle="true"><mfrac><mi>a</mi><mi>b</mi></mfrac></mstyle>');
});

test('chịu lỗi: lệnh lạ, thiếu/thừa ngoặc, \\left không \\right, \\end lạc — có cảnh báo, không ném lỗi', () => {
  let iss = [];
  assert.strictEqual(body('\\foo x', { issues: iss }), '<merror><mtext>\\foo</mtext></merror><mi>x</mi>');
  assert.strictEqual(iss.length, 1);
  assert.strictEqual(iss[0].level, 'warn');
  assert.ok(/\\foo/.test(iss[0].msg));
  iss = [];
  assert.strictEqual(body('\\frac{a}{b', { issues: iss }), '<mfrac><mi>a</mi><mi>b</mi></mfrac>');
  assert.ok(iss.some(x => /Thiếu dấu \}/.test(x.msg)));
  iss = [];
  assert.strictEqual(body('a}b', { issues: iss }), '<mi>a</mi><mi>b</mi>');
  assert.ok(iss.some(x => /Thừa dấu \}/.test(x.msg)));
  iss = [];
  assert.strictEqual(body('\\left( x', { issues: iss }), '<mrow><mo>(</mo><mi>x</mi><mo></mo></mrow>');
  assert.ok(iss.some(x => /\\right/.test(x.msg)));
  iss = [];
  body('x \\end{cases} \\right)', { issues: iss });
  assert.strictEqual(iss.length, 2);
  iss = [];
  body('\\begin{cases} x', { issues: iss });
  assert.ok(iss.some(x => /\\end/.test(x.msg)));
  assert.doesNotThrow(() => X('x^'));
  assert.doesNotThrow(() => X('\\sqrt'));
  assert.doesNotThrow(() => X('\\'));
  // không truyền issues: vẫn chạy
  assert.ok(X('\\unknown').includes('merror'));
});

test('ngẫu nhiên: 2000 chuỗi rác không ném lỗi, luôn ra một <math> hợp lệ XML', () => {
  const kho = ['\\frac', '\\sqrt', '{', '}', '^', '_', '\\left(', '\\right)', '\\begin{cases}', '\\end{cases}', '&', '\\\\', 'x', '2', '+', '\\alpha', '\\vec', '\\text{a}', '[', ']', '$', '%', '#', '~', "'", '\\', '\\left.', '\\right|', '\\lim', '\\int', '\\mathbb', '<', '&amp;', 'ạ'];
  let seed = 42;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 2000; i++) {
    let s = '';
    const k = 1 + rnd(12);
    for (let j = 0; j < k; j++) s += kho[rnd(kho.length)];
    const m = X(s, { issues: [] });
    const n = core.parseXml(m);
    assert.strictEqual(n.name, 'math', s);
    assert.ok(typeof math.mathmlToLatex(m) === 'string');
  }
});

/* ---------------- replaceDollar ---------------- */

const R = (s, o) => latex.replaceDollar(s, o);
const mm = (tex, disp) => latex.toMathML(tex, { display: disp });

test('replaceDollar: chữ thuần — $…$, \\(…\\), $$…$$, \\[…\\], \\$ và phần còn lại được thoát', () => {
  assert.strictEqual(R('Cho $x^2$ và \\(y\\).'), 'Cho ' + mm('x^2') + ' và ' + mm('y') + '.');
  assert.strictEqual(R('Tính $$\\int_0^1 x\\,dx$$.'), 'Tính ' + mm('\\int_0^1 x\\,dx', true) + '.');
  assert.strictEqual(R('\\[x=1\\]'), mm('x=1', true));
  assert.strictEqual(R('Giá \\$5 và $a<b$'), 'Giá $5 và ' + mm('a<b'));
  assert.strictEqual(R('a < b & c', { html: false }), 'a &lt; b &amp; c');
  assert.strictEqual(R('x < y'), 'x &lt; y');
  assert.strictEqual(R('không có công thức'), 'không có công thức');
});

test('replaceDollar: quy ước pandoc — tiền tệ và $ lẻ giữ nguyên', () => {
  assert.strictEqual(R('Giá 5$ và 10$'), 'Giá 5$ và 10$');
  assert.strictEqual(R('Từ $5 tới $10'), 'Từ $5 tới $10');
  assert.strictEqual(R('$ x $'), '$ x $');
  assert.strictEqual(R('một $ lẻ'), 'một $ lẻ');
  assert.strictEqual(R('$x$5'), '$x$5');
  assert.strictEqual(R('$\\$$'), mm('\\$'));
  assert.strictEqual(R('\\(a\\) và \\(b'), mm('a') + ' và \\(b');
});

test('replaceDollar: HTML — chỉ xét phần chữ, công thức được qua thẻ định dạng, không qua thẻ khối', () => {
  assert.strictEqual(R('<p>Cho $x &lt; <em>y</em>$ và <b>đậm</b></p>'), '<p>Cho ' + mm('x < y') + ' và <b>đậm</b></p>');
  // thẻ mở trong công thức, thẻ đóng ngoài: mở lại sau công thức để HTML vẫn cân
  assert.strictEqual(R('<p>Cho $x <em>y$ z</em> w</p>'), '<p>Cho ' + mm('x y') + '<em> z</em> w</p>');
  assert.strictEqual(R('<p><em>a $b</em> c$ d</p>'), '<p><em>a </em>' + mm('b c') + ' d</p>');
  assert.strictEqual(R('<p>$a</p><p>b$</p>'), '<p>$a</p><p>b$</p>');
  assert.strictEqual(R('<math><mi>$</mi></math> và $y$'), '<math><mi>$</mi></math> và ' + mm('y'));
  assert.strictEqual(R('<p>a &amp; b</p>'), '<p>a &amp; b</p>');
  assert.strictEqual(R('x &lt; $y$', { html: true }), 'x &lt; ' + mm('y'));
  assert.strictEqual(R('<span title="$a$">$b$</span>'), '<span title="$a$">' + mm('b') + '</span>');
  // kết quả luôn phân tích lại được, số thẻ cân
  const out = R('<p>Một <b>$x^2$</b> hai $\\frac{1}{2}$ ba <i>$a$ và $b$</i></p>');
  const cay = html.parseHtml(out);
  assert.strictEqual(html.toHtml(cay).replace(/<(br|img)([^>]*)\/>/g, '<$1$2>'), out.replace(/&#x([0-9A-F]+);/g, (x, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#x/g, '&#x'));
  assert.strictEqual((out.match(/<math/g) || []).length, 4);
});

test('replaceDollar: cảnh báo LaTeX được gom vào opts.issues', () => {
  const iss = [];
  R('Cho $\\khonghotro x$', { issues: iss });
  assert.strictEqual(iss.length, 1);
  assert.ok(/khonghotro/.test(iss[0].msg));
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
