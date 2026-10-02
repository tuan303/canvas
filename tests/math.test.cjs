/* tests/math.test.cjs — kiểm thử js/math.js: MathML → LaTeX, MathML → chữ Unicode (chạy: node tests/math.test.cjs) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const math = require('../js/math.js');
const latex = require('../js/latex.js');
const core = require('../js/core.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }
const M = s => '<math xmlns="http://www.w3.org/1998/Math/MathML">' + s + '</math>';
const L = s => math.mathmlToLatex(M(s));
const T = s => math.mathmlToText(M(s));

// 35 khối <math> thật của gói THPT_HSA2025_TOAN_SCORM: [MathML, LaTeX mong đợi, chữ mong đợi]
const HSA = [
  ["<math displaystyle=\"true\"><mi>R</mi><mrow><mo stretchy=\"false\">(</mo><mi>θ</mi><mo stretchy=\"false\">)</mo></mrow><mo>=</mo><mfrac><mrow><msup><msub><mi>v</mi><mn>0</mn></msub><mn>2</mn></msup><mo>·</mo><mo lspace=\"0\" rspace=\"0.12em\">sin</mo><mrow><mo stretchy=\"false\">(</mo><mn>2</mn><mi>θ</mi><mo stretchy=\"false\">)</mo></mrow></mrow><mrow><mi>g</mi></mrow></mfrac></math>","R(\\theta) = \\frac{v_{0}^{2} \\cdot \\sin(2\\theta)}{g}","R(θ) = (v₀²·sin(2θ))/g"],
  ["<math displaystyle=\"true\"><mi>N</mi><mrow><mo stretchy=\"false\">(</mo><mi>t</mi><mo stretchy=\"false\">)</mo></mrow><mo>=</mo><mfrac><mrow><mn>16398</mn><mo>·</mo><msup><mi>e</mi><mrow><mn>0,5</mn><mrow><mo stretchy=\"false\">(</mo><mi>t</mi><mo>−</mo><mn>9,19</mn><mo stretchy=\"false\">)</mo></mrow></mrow></msup></mrow><mrow><mn>0,12</mn><mo>+</mo><msup><mi>e</mi><mrow><mn>0,5</mn><mrow><mo stretchy=\"false\">(</mo><mi>t</mi><mo>−</mo><mn>9,19</mn><mo stretchy=\"false\">)</mo></mrow></mrow></msup></mrow></mfrac></math>","N(t) = \\frac{16398 \\cdot e^{0{,}5(t - 9{,}19)}}{0{,}12 + e^{0{,}5(t - 9{,}19)}}","N(t) = (16398·e^(0,5(t−9,19)))/(0,12 + e^(0,5(t−9,19)))"],
  ["<math displaystyle=\"true\"><msubsup><mrow><mo lspace=\"0\" rspace=\"0.12em\">log</mo></mrow><mrow><mn>2</mn></mrow><mrow><mn>2</mn></mrow></msubsup><mi>x</mi><mo>−</mo><mn>2</mn><mrow><mo stretchy=\"false\">(</mo><mi>m</mi><mo>+</mo><mn>2</mn><mo stretchy=\"false\">)</mo></mrow><msub><mrow><mo lspace=\"0\" rspace=\"0.12em\">log</mo></mrow><mrow><mn>2</mn></mrow></msub><mi>x</mi><mo>+</mo><msup><mi>m</mi><mn>2</mn></msup><mo>+</mo><mn>4</mn><mi>m</mi><mo>≤</mo><mn>0</mn></math>","\\log_{2}^{2}x - 2(m + 2)\\log_{2}x + m^{2} + 4m \\le 0","log₂² x − 2(m + 2)log₂ x + m² + 4m ≤ 0"],
  ["<math displaystyle=\"true\"><mi>y</mi><mo>=</mo><mfrac><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>−</mo><mn>2</mn><mi>x</mi><mo>+</mo><mn>3</mn></mrow><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></mfrac></math>","y = \\frac{x^{2} - 2x + 3}{x + 1}","y = (x² − 2x + 3)/(x + 1)"],
  ["<math displaystyle=\"true\"><mi>v</mi><mrow><mo stretchy=\"false\">(</mo><mi>t</mi><mo stretchy=\"false\">)</mo></mrow><mo>=</mo><mn>12</mn><mo>−</mo><mfrac><mrow><mn>4</mn><msup><mi>t</mi><mn>2</mn></msup></mrow><mrow><mn>3</mn></mrow></mfrac></math>","v(t) = 12 - \\frac{4t^{2}}{3}","v(t) = 12 − 4t²/3"],
  ["<math displaystyle=\"true\"><msubsup><mo>∫</mo><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></msubsup><mo>[</mo><mi>f</mi><mo>′</mo><mrow><mo stretchy=\"false\">(</mo><mi>x</mi><mo stretchy=\"false\">)</mo></mrow><mo>+</mo><mfrac><mrow><mi>x</mi><mo>−</mo><mn>4</mn></mrow><mrow><mi>x</mi></mrow></mfrac><mo>]</mo><mi>d</mi><mi>x</mi></math>","\\int_{1}^{2}[f'(x) + \\frac{x - 4}{x}]dx","∫₁² [f′(x) + (x − 4)/x]dx"],
  ["<math displaystyle=\"true\"><mi>y</mi><mo>=</mo><msqrt><mrow><mn>2</mn><mi>x</mi></mrow></msqrt></math>","y = \\sqrt{2x}","y = √(2x)"],
  ["<math displaystyle=\"true\"><mi>y</mi><mo>=</mo><mfrac><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow><mrow><mn>2</mn></mrow></mfrac></math>","y = \\frac{x^{2}}{2}","y = x²/2"],
  ["<math displaystyle=\"true\"><msqrt><mrow><mn>2</mn></mrow></msqrt><mo>·</mo><mi>a</mi></math>","\\sqrt{2} \\cdot a","√2·a"],
  ["<math displaystyle=\"true\"><msqrt><mrow><mn>3</mn></mrow></msqrt><mo>·</mo><mi>a</mi></math>","\\sqrt{3} \\cdot a","√3·a"],
  ["<math displaystyle=\"true\"><mi>a</mi></math>","a","a"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>3</mn><mi>a</mi></mrow><mrow><mn>2</mn></mrow></mfrac></math>","\\frac{3a}{2}","3a/2"],
  ["<math displaystyle=\"true\"><mi>BC</mi><mo>=</mo><mi>a</mi><msqrt><mrow><mn>3</mn></mrow></msqrt></math>","BC = a\\sqrt{3}","BC = a√3"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>3</mn><mi>a</mi></mrow><mrow><mn>4</mn></mrow></mfrac></math>","\\frac{3a}{4}","3a/4"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mi>a</mi></mrow><mrow><mn>2</mn></mrow></mfrac></math>","\\frac{a}{2}","a/2"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>3</mn><mi>a</mi></mrow><mrow><mn>2</mn></mrow></mfrac></math>","\\frac{3a}{2}","3a/2"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mi>a</mi></mrow><mrow><mn>4</mn></mrow></mfrac></math>","\\frac{a}{4}","a/4"],
  ["<math displaystyle=\"true\"><msubsup><mo>∫</mo><mrow><mfrac><mrow><mi>π</mi></mrow><mrow><mn>6</mn></mrow></mfrac></mrow><mrow><mfrac><mrow><mi>π</mi></mrow><mrow><mn>4</mn></mrow></mfrac></mrow></msubsup><msup><mrow><mo stretchy=\"false\">(</mo><mn>2</mn><mi>tanx</mi><mo>+</mo><mi>cotx</mi><mo stretchy=\"false\">)</mo></mrow><mn>2</mn></msup><mi>d</mi><mi>x</mi><mo>=</mo><mi>a</mi><mo>+</mo><mi>b</mi><msqrt><mrow><mn>3</mn></mrow></msqrt><mo>+</mo><mi>c</mi><mi>π</mi></math>","\\int_{\\frac{\\pi}{6}}^{\\frac{\\pi}{4}}(2\\tan x + \\cot x)^{2}dx = a + b\\sqrt{3} + c\\pi","∫_(π/6)^(π/4) (2tan x + cot x)²dx = a + b√3 + cπ"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mi>SI</mi></mrow><mrow><mi>ID</mi></mrow></mfrac></math>","\\frac{SI}{ID}","SI/ID"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>5</mn></mrow><mrow><mn>2</mn></mrow></mfrac></math>","\\frac{5}{2}","5/2"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>7</mn></mrow><mrow><mn>2</mn></mrow></mfrac></math>","\\frac{7}{2}","7/2"],
  ["<math displaystyle=\"true\"><mn>3</mn></math>","3","3"],
  ["<math displaystyle=\"true\"><mn>4</mn></math>","4","4"],
  ["<math displaystyle=\"true\"><mi>d</mi><mo>:</mo><mfrac><mrow><mi>x</mi><mo>−</mo><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac><mo>=</mo><mfrac><mrow><mi>y</mi></mrow><mrow><mn>1</mn></mrow></mfrac><mo>=</mo><mfrac><mrow><mi>z</mi><mo>−</mo><mn>2</mn></mrow><mrow><mn>2</mn></mrow></mfrac></math>","d : \\frac{x - 1}{2} = \\frac{y}{1} = \\frac{z - 2}{2}","d: (x − 1)/2 = y/1 = (z − 2)/2"],
  ["<math displaystyle=\"true\"><mi>d</mi><mo>:</mo><mrow><mo class=\"hemo\">{</mo><mtable columnalign=\"left\" rowspacing=\"3pt\"><mtr><mtd><mi>x</mi><mo>=</mo><mn>2</mn><mo>−</mo><mi>t</mi></mtd></mtr><mtr><mtd><mi>y</mi><mo>=</mo><mn>1</mn><mo>+</mo><mn>2</mn><mi>t</mi></mtd></mtr><mtr><mtd><mi>z</mi><mo>=</mo><mn>3</mn><mi>t</mi></mtd></mtr></mtable></mrow></math>","d : \\begin{cases} x = 2 - t \\\\ y = 1 + 2t \\\\ z = 3t \\end{cases}","d: {x = 2 − t; y = 1 + 2t; z = 3t}"],
  ["<math displaystyle=\"true\"><msub><mrow><mi>d</mi></mrow><mrow><mn>1</mn></mrow></msub><mo>:</mo><mfrac><mrow><mi>x</mi></mrow><mrow><mn>1</mn></mrow></mfrac><mo>=</mo><mfrac><mrow><mi>y</mi></mrow><mrow><mn>1</mn></mrow></mfrac><mo>=</mo><mfrac><mrow><mi>z</mi></mrow><mrow><mn>2</mn></mrow></mfrac><mo>;</mo><mspace width=\"10px\"/><msub><mrow><mi>d</mi></mrow><mrow><mn>2</mn></mrow></msub><mo>:</mo><mfrac><mrow><mi>x</mi><mo>−</mo><mn>2</mn></mrow><mrow><mn>3</mn></mrow></mfrac><mo>=</mo><mfrac><mrow><mi>y</mi></mrow><mrow><mn>2</mn></mrow></mfrac><mo>=</mo><mfrac><mrow><mi>z</mi></mrow><mrow><mn>1</mn></mrow></mfrac></math>","d_{1} : \\frac{x}{1} = \\frac{y}{1} = \\frac{z}{2}; \\enspace d_{2} : \\frac{x - 2}{3} = \\frac{y}{2} = \\frac{z}{1}","d₁: x/1 = y/1 = z/2; d₂: (x − 2)/3 = y/2 = z/1"],
  ["<math displaystyle=\"true\"><mi>d</mi><mo>:</mo><mfrac><mrow><mi>x</mi><mo>−</mo><mn>2</mn></mrow><mrow><mn>1</mn></mrow></mfrac><mo>=</mo><mfrac><mrow><mi>y</mi><mo>+</mo><mn>2</mn></mrow><mrow><mn>2</mn></mrow></mfrac><mo>=</mo><mfrac><mrow><mi>z</mi><mo>+</mo><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></math>","d : \\frac{x - 2}{1} = \\frac{y + 2}{2} = \\frac{z + 1}{2}","d: (x − 2)/1 = (y + 2)/2 = (z + 1)/2"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>19</mn></mrow><mrow><mn>3150</mn></mrow></mfrac></math>","\\frac{19}{3150}","19/3150"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>19</mn></mrow><mrow><mn>1050</mn></mrow></mfrac></math>","\\frac{19}{1050}","19/1050"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>32</mn></mrow><mrow><mn>165</mn></mrow></mfrac></math>","\\frac{32}{165}","32/165"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>32</mn></mrow><mrow><mn>55</mn></mrow></mfrac></math>","\\frac{32}{55}","32/55"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>1</mn></mrow><mrow><mn>5</mn></mrow></mfrac></math>","\\frac{1}{5}","⅕"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>1</mn></mrow><mrow><mn>4</mn></mrow></mfrac></math>","\\frac{1}{4}","¼"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>1</mn></mrow><mrow><mn>3</mn></mrow></mfrac></math>","\\frac{1}{3}","⅓"],
  ["<math displaystyle=\"true\"><mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></math>","\\frac{1}{2}","½"]
];

// LaTeX hợp lệ về cú pháp: ngoặc nhọn cân, \begin/\end khớp, \left/\right khớp
function kiemLatex(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; assert.ok(d >= 0, 'thừa } trong ' + s); }
  }
  assert.strictEqual(d, 0, 'ngoặc nhọn không cân: ' + s);
  const b = (s.match(/\\begin\{/g) || []).length, e = (s.match(/\\end\{/g) || []).length;
  assert.strictEqual(b, e, '\\begin/\\end lệch: ' + s);
  const l = (s.match(/\\left(?![a-z])/g) || []).length, r = (s.match(/\\right(?![a-z])/g) || []).length;
  assert.strictEqual(l, r, '\\left/\\right lệch: ' + s);
  assert.ok(!/undefined|null|NaN|\[object/.test(s), 'rác trong LaTeX: ' + s);
}

/* ---------------- Gói HSA Toán: 35 khối ---------------- */

test('HSA Toán: đủ 35 khối, đổi sang LaTeX không lỗi, đúng bản mẫu đã soát', () => {
  assert.strictEqual(HSA.length, 35);
  HSA.forEach(([mml, tex], i) => {
    const out = math.mathmlToLatex(mml);
    kiemLatex(out);
    assert.strictEqual(out, tex, 'khối ' + i);
  });
});

test('HSA Toán: chữ Unicode hợp lý (không còn thẻ, không rỗng), đúng bản mẫu', () => {
  HSA.forEach(([mml, , txt], i) => {
    const out = math.mathmlToText(mml);
    assert.ok(out && !/[<>]/.test(out.replace(/[<>]\s/g, '')), 'khối ' + i + ': ' + out);
    assert.strictEqual(out, txt, 'khối ' + i);
    assert.strictEqual(out, out.normalize('NFC'));
  });
});

test('HSA Toán: LaTeX → MathML (latex.js) → LaTeX là điểm bất động', () => {
  HSA.forEach(([mml], i) => {
    const t1 = math.mathmlToLatex(mml);
    const iss = [];
    const m2 = latex.toMathML(t1, { issues: iss });
    assert.deepStrictEqual(iss, [], 'khối ' + i + ' ' + t1);
    assert.strictEqual(math.mathmlToLatex(m2), t1, 'khối ' + i);
    // <mi>ID</mi> (một token) qua LaTeX thành I, D riêng → mẫu số có thể thêm ngoặc: so sánh bỏ ngoặc
    const bo = s => s.replace(/[()]/g, '');
    assert.strictEqual(bo(math.mathmlToText(m2)), bo(math.mathmlToText(mml)), 'chữ khối ' + i);
  });
});

test('HSA Toán: các ví dụ tiêu biểu', () => {
  const tim = re => HSA.find(x => re.test(x[0]));
  assert.strictEqual(math.mathmlToLatex(tim(/hemo/)[0]), 'd : \\begin{cases} x = 2 - t \\\\ y = 1 + 2t \\\\ z = 3t \\end{cases}');
  assert.strictEqual(math.mathmlToText(tim(/hemo/)[0]), 'd: {x = 2 − t; y = 1 + 2t; z = 3t}');
  assert.strictEqual(math.mathmlToLatex(tim(/<mn>16398/)[0]), 'N(t) = \\frac{16398 \\cdot e^{0{,}5(t - 9{,}19)}}{0{,}12 + e^{0{,}5(t - 9{,}19)}}');
  assert.strictEqual(math.mathmlToText(tim(/msubsup><mrow><mo lspace/)[0]), 'log₂² x − 2(m + 2)log₂ x + m² + 4m ≤ 0');
  assert.ok(/\\enspace/.test(math.mathmlToLatex(tim(/mspace/)[0])));
});

test('mọi gói trong corpus cục bộ (nếu có): mọi <math> đổi được, LaTeX cân ngoặc', () => {
  const dir = path.join(process.env.TEMP || process.env.TMP || '', 'claude');
  const ung = [];
  (function tim(d, sau) {
    if (sau > 4 || !fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name === 'corpus') { fs.readdirSync(p).filter(x => x.endsWith('.json')).forEach(x => ung.push(path.join(p, x))); } else tim(p, sau + 1); }
    }
  })(dir, 0);
  if (!ung.length) { console.log('    BỎ QUA: không thấy thư mục corpus'); return; }
  let n = 0;
  for (const f of ung) {
    const s = fs.readFileSync(f, 'utf8');
    (s.match(/<math[\s\S]*?<\/math>/g) || []).forEach(x => {
      const mml = JSON.parse('"' + x + '"');
      kiemLatex(math.mathmlToLatex(mml));
      assert.ok(math.mathmlToText(mml).length > 0);
      n++;
    });
  }
  console.log('    ' + ung.length + ' tệp corpus, ' + n + ' khối <math>');
});

/* ---------------- Cấu trúc ---------------- */

test('phân số, căn, căn bậc n, mũ, chỉ số, mũ+chỉ số', () => {
  assert.strictEqual(L('<mfrac><mn>1</mn><mn>2</mn></mfrac>'), '\\frac{1}{2}');
  assert.strictEqual(T('<mfrac><mn>1</mn><mn>2</mn></mfrac>'), '½');
  assert.strictEqual(T('<mfrac><mn>19</mn><mn>3150</mn></mfrac>'), '19/3150');
  assert.strictEqual(T('<mfrac><mrow><mo>−</mo><mi>b</mi></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac>'), '−b/(2a)');
  assert.strictEqual(L('<mfrac linethickness="0"><mi>n</mi><mi>k</mi></mfrac>'), '\\genfrac{}{}{0pt}{}{n}{k}');
  assert.strictEqual(L('<msqrt><mn>2</mn><mi>x</mi></msqrt>'), '\\sqrt{2x}');
  assert.strictEqual(T('<msqrt><mn>2</mn><mi>x</mi></msqrt>'), '√(2x)');
  assert.strictEqual(T('<msqrt><mn>3</mn></msqrt>'), '√3');
  assert.strictEqual(L('<mroot><mi>x</mi><mn>3</mn></mroot>'), '\\sqrt[3]{x}');
  assert.strictEqual(T('<mroot><mi>x</mi><mn>3</mn></mroot>'), '∛x');
  assert.strictEqual(T('<mroot><mi>x</mi><mn>5</mn></mroot>'), '⁵√x');
  assert.strictEqual(L('<msup><mi>x</mi><mn>2</mn></msup>'), 'x^{2}');
  assert.strictEqual(T('<msup><mi>x</mi><mrow><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msup>'), 'xⁿ⁺¹');
  assert.strictEqual(T('<msup><mi>e</mi><mrow><mi>i</mi><mi>π</mi></mrow></msup>'), 'e^(iπ)');
  assert.strictEqual(L('<msub><mi>a</mi><mrow><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msub>'), 'a_{n + 1}');
  assert.strictEqual(T('<msub><mi>a</mi><mrow><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msub>'), 'aₙ₊₁');
  assert.strictEqual(L('<msubsup><mi>C</mi><mi>n</mi><mi>k</mi></msubsup>'), 'C_{n}^{k}');
  // (x+1)^2 : cơ sở có ngoặc không bọc thêm {}
  assert.strictEqual(L('<msup><mrow><mo stretchy="false">(</mo><mi>x</mi><mo>+</mo><mn>1</mn><mo stretchy="false">)</mo></mrow><mn>2</mn></msup>'), '(x + 1)^{2}');
  assert.strictEqual(T('<msup><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mn>2</mn></msup>'), '(x + 1)²');
  assert.strictEqual(L('<msup><mfrac><mi>a</mi><mi>b</mi></mfrac><mn>2</mn></msup>'), '{\\frac{a}{b}}^{2}');
  // phẩy (đạo hàm), độ
  assert.strictEqual(L('<msup><mi>f</mi><mo>′</mo></msup><mo stretchy="false">(</mo><mi>x</mi><mo stretchy="false">)</mo>'), "f'(x)");
  assert.strictEqual(T('<msup><mi>f</mi><mo>″</mo></msup>'), 'f″');
  assert.strictEqual(L('<msup><mn>60</mn><mo>∘</mo></msup>'), '60^{\\circ}');
  assert.strictEqual(T('<msup><mn>60</mn><mo>∘</mo></msup>'), '60°');
});

test('giới hạn, tổng, tích phân, munder/mover/munderover', () => {
  const lim = '<munder><mo>lim</mo><mrow><mi>x</mi><mo>→</mo><mo>+</mo><mi mathvariant="normal">∞</mi></mrow></munder><mfrac><mn>1</mn><mi>x</mi></mfrac>';
  assert.strictEqual(L(lim), '\\lim_{x \\to +\\infty}\\frac{1}{x}');
  assert.strictEqual(T(lim), 'lim_(x→+∞) 1/x');
  const sum = '<munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msup><mi>k</mi><mn>2</mn></msup>';
  assert.strictEqual(L(sum), '\\sum_{k = 1}^{n}k^{2}');
  assert.strictEqual(T(sum), '∑ₖ₌₁ⁿ k²');
  const tp = '<msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup><mi>f</mi><mo stretchy="false">(</mo><mi>x</mi><mo stretchy="false">)</mo><mi>d</mi><mi>x</mi>';
  assert.strictEqual(L(tp), '\\int_{0}^{1}f(x)dx');
  assert.strictEqual(T(tp), '∫₀¹ f(x)dx');
  assert.strictEqual(L('<munderover><mo>∫</mo><mi>a</mi><mi>b</mi></munderover>'), '\\int_{a}^{b}');
  assert.strictEqual(L('<munder><mi>max</mi><mrow><mo stretchy="false">[</mo><mn>0</mn><mo>;</mo><mn>1</mn><mo stretchy="false">]</mo></mrow></munder><mi>f</mi>'), '\\max_{[0; 1]}f');
  assert.strictEqual(L('<mover><mo>=</mo><mtext>đn</mtext></mover>'), '\\overset{\\text{đn}}{=}');
  assert.strictEqual(L('<munder><mi>x</mi><mo>_</mo></munder>'), '\\underline{x}');
  assert.strictEqual(L('<mover><mo>→</mo><mi>t</mi></mover>'), '\\xrightarrow{t}');
});

test('vectơ (U+20D7 và U+2192), gạch trên, mũ, cung', () => {
  for (const mui of ['\u20d7', '→']) {
    assert.strictEqual(L('<mover accent="true"><mi>u</mi><mo>' + mui + '</mo></mover>'), '\\vec{u}');
    assert.strictEqual(L('<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>' + mui + '</mo></mover>'), '\\overrightarrow{AB}');
    assert.strictEqual(L('<mover><mi>AB</mi><mo stretchy="false">' + mui + '</mo></mover>'), '\\overrightarrow{AB}');
    assert.strictEqual(T('<mover accent="true"><mi>u</mi><mo>' + mui + '</mo></mover>'), 'u\u20d7');
    assert.strictEqual(T('<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>' + mui + '</mo></mover>'), 'AB\u20d7');
  }
  assert.strictEqual(L('<mover accent="true"><mi>z</mi><mo>¯</mo></mover>'), '\\bar{z}');
  assert.strictEqual(L('<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>‾</mo></mover>'), '\\overline{AB}');
  assert.strictEqual(T('<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>¯</mo></mover>'), 'A\u0305B\u0305');
  assert.strictEqual(L('<mover accent="true"><mrow><mi>A</mi><mi>B</mi><mi>C</mi></mrow><mo>^</mo></mover>'), '\\widehat{ABC}');
  assert.strictEqual(T('<mover accent="true"><mrow><mi>A</mi><mi>B</mi><mi>C</mi></mrow><mo>^</mo></mover>'), '∠ABC');
  assert.strictEqual(L('<mover><mrow><mi>A</mi><mi>B</mi></mrow><mo>⌢</mo></mover>'), '\\overset{\\frown}{AB}');
  assert.strictEqual(T('<mover><mrow><mi>A</mi><mi>B</mi></mrow><mo>⏜</mo></mover>'), '⌒AB');
});

test('bảng: hệ { → cases, tuyển [ → array, ma trận, mfenced, mlabeledtr', () => {
  const he = '<mrow><mo>{</mo><mtable columnalign="left"><mtr><mtd><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo><mn>3</mn></mtd></mtr><mtr><mtd><mi>x</mi><mo>−</mo><mi>y</mi><mo>=</mo><mn>1</mn></mtd></mtr></mtable></mrow>';
  assert.strictEqual(L(he), '\\begin{cases} x + y = 3 \\\\ x - y = 1 \\end{cases}');
  assert.strictEqual(T(he), '{x + y = 3; x − y = 1}');
  // { ngay trong hàng của math, có mo đóng rỗng
  assert.strictEqual(L('<mo>{</mo><mtable><mtr><mtd><mi>a</mi></mtd></mtr></mtable><mo></mo>'), '\\begin{cases} a \\end{cases}');
  const tuyen = '<mrow><mo>[</mo><mtable columnalign="left"><mtr><mtd><mi>x</mi><mo>=</mo><mn>1</mn></mtd></mtr><mtr><mtd><mi>x</mi><mo>=</mo><mn>2</mn></mtd></mtr></mtable></mrow>';
  assert.strictEqual(L(tuyen), '\\left[\\begin{array}{l} x = 1 \\\\ x = 2 \\end{array}\\right.');
  assert.strictEqual(T(tuyen), '[x = 1; x = 2]');
  const mt = '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>';
  assert.strictEqual(L('<mrow><mo>(</mo>' + mt + '<mo>)</mo></mrow>'), '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}');
  assert.strictEqual(L('<mrow><mo>|</mo>' + mt + '<mo>|</mo></mrow>'), '\\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix}');
  assert.strictEqual(L(mt), '\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}');
  assert.strictEqual(T('<mrow><mo>(</mo>' + mt + '<mo>)</mo></mrow>'), '(1, 2; 3, 4)');
  assert.strictEqual(L('<mfenced open="{" close=""><mtable><mtr><mtd><mi>a</mi></mtd></mtr></mtable></mfenced>'), '\\begin{cases} a \\end{cases}');
  assert.strictEqual(L('<mfenced><mi>a</mi><mi>b</mi></mfenced>'), '\\left( a, b \\right)');
  assert.strictEqual(T('<mfenced><mi>a</mi><mi>b</mi></mfenced>'), '(a, b)');
  assert.strictEqual(L('<mtable><mlabeledtr><mtd><mtext>(1)</mtext></mtd><mtd><mi>x</mi></mtd></mlabeledtr></mtable>'), '\\begin{matrix} x \\end{matrix}');
  assert.strictEqual(L('<mtable columnalign="right left"><mtr><mtd><mi>a</mi></mtd><mtd><mo>=</mo><mi>b</mi></mtd></mtr></mtable>'), '\\begin{aligned} a & = b \\end{aligned}');
});

test('token: mo/mi/mn/mtext/mspace, Hy Lạp, toán tử thường gặp, hàm', () => {
  assert.strictEqual(L('<mi>α</mi><mo>+</mo><mi>β</mi><mo>=</mo><mi>π</mi>'), '\\alpha + \\beta = \\pi');
  assert.strictEqual(L('<mi>Δ</mi><mi>θ</mi><mi>φ</mi><mi>ϕ</mi><mi>ε</mi><mi>ω</mi><mi>Ω</mi>'), '\\Delta\\theta\\varphi\\phi\\varepsilon\\omega\\Omega');
  const ops = '<mi>a</mi><mo>−</mo><mi>b</mi><mo>×</mo><mi>c</mi><mo>÷</mo><mi>d</mi><mo>≤</mo><mi>e</mi><mo>≥</mo><mi>f</mi><mo>≠</mo><mi>g</mi><mo>±</mo><mi>∞</mi><mo>→</mo><mi>x</mi><mo>∈</mo><mi>ℝ</mi>';
  assert.strictEqual(L(ops), 'a - b \\times c \\div d \\le e \\ge f \\ne g \\pm \\infty \\to x \\in \\mathbb{R}');
  assert.strictEqual(T(ops), 'a − b × c ÷ d ≤ e ≥ f ≠ g ± ∞ → x ∈ ℝ');
  assert.strictEqual(L('<mo>∀</mo><mi>x</mi><mo>,</mo><mo>∃</mo><mi>y</mi><mo>:</mo><mi>x</mi><mo>·</mo><mi>y</mi><mo>⋅</mo><mi>z</mi>'), '\\forall x, \\exists y : x \\cdot y \\cdot z');
  assert.strictEqual(T('<mo>∀</mo><mi>x</mi><mo>,</mo><mo>∃</mo><mi>y</mi><mo>:</mo><mi>x</mi><mo>·</mo><mi>y</mi><mo>⋅</mo><mi>z</mi>'), '∀x, ∃y: x·y·z');
  // dấu trừ một ngôi không có khoảng
  assert.strictEqual(L('<mo>−</mo><mi>x</mi><mo>+</mo><mo>(</mo><mo>−</mo><mn>2</mn><mo>)</mo>'), '-x + (-2)');
  assert.strictEqual(T('<mo>−</mo><mi>x</mi><mo>=</mo><mo>−</mo><mn>2</mn>'), '−x = −2');
  // hàm: mo/mi sin, tách "tanx", hàm Việt Nam tg/cotg
  assert.strictEqual(L('<mo lspace="0" rspace="0.12em">sin</mo><mi>x</mi>'), '\\sin x');
  assert.strictEqual(L('<mi>tanx</mi><mo>+</mo><mi>cotgx</mi>'), '\\tan x + \\operatorname{cotg} x');
  assert.strictEqual(T('<mi>tanx</mi><mo>+</mo><mi>cos</mi><mo>\u2061</mo><mi>x</mi>'), 'tan x + cos x');
  assert.strictEqual(L('<mi>sgn</mi><mi>x</mi>'), '\\operatorname{sgn}x');
  // mn thập phân phẩy, mtext, mspace
  assert.strictEqual(L('<mn>0,25</mn>'), '0{,}25');
  assert.strictEqual(L('<mtext>với mọi </mtext><mi>x</mi>'), '\\text{với mọi }x');
  assert.strictEqual(L('<mi>a</mi><mspace width="1em"/><mi>b</mi>'), 'a\\quad b');
  assert.strictEqual(L('<mi>a</mi><mspace width="0.167em"/><mi>b</mi>'), 'a\\,b');
  assert.strictEqual(L('<mi>a</mi><mtext>\u2009</mtext><mi>b</mi>'), 'a\\,b');
  assert.strictEqual(T('<mi>a</mi><mspace width="1em"/><mi>b</mi>'), 'a b');
  // mathvariant
  assert.strictEqual(L('<mi mathvariant="double-struck">N</mi>'), '\\mathbb{N}');
  assert.strictEqual(T('<mi mathvariant="double-struck">Z</mi>'), 'ℤ');
  assert.strictEqual(L('<mi mathvariant="bold">v</mi>'), '\\mathbf{v}');
  assert.strictEqual(L('<mi mathvariant="normal">d</mi><mi>x</mi>'), '\\mathrm{d}x');
  assert.strictEqual(L('<mi>\u{1D53D}</mi>'), '\\mathbb{F}');
  // ký tự đặc biệt LaTeX được thoát
  assert.strictEqual(L('<mn>50</mn><mo>%</mo>'), '50\\%');
  assert.strictEqual(L('<mo stretchy="false">{</mo><mn>1</mn><mo stretchy="false">}</mo>'), '\\{1\\}');
  assert.strictEqual(L('<mo>{</mo><mn>1</mn><mo>}</mo>'), '\\left\\{ 1 \\right\\}'); // ngoặc co giãn ở hai đầu hàng
  // phần tử lạ, menclose, mphantom, semantics/annotation, ms, mglyph, mmultiscripts
  assert.strictEqual(L('<menclose notation="box"><mi>x</mi></menclose>'), '\\boxed{x}');
  assert.strictEqual(L('<semantics><mi>x</mi><annotation encoding="TeX">x</annotation></semantics>'), 'x');
  assert.strictEqual(L('<mmultiscripts><mi>C</mi><none/><none/><mprescripts/><mn>6</mn><mn>14</mn></mmultiscripts>'), '{}_{6}^{14}C');
  assert.strictEqual(T('<mmultiscripts><mi>C</mi><none/><none/><mprescripts/><mn>6</mn><mn>14</mn></mmultiscripts>'), '₆¹⁴C');
  assert.strictEqual(L('<mstyle displaystyle="true"><mfrac><mi>a</mi><mi>b</mi></mfrac></mstyle>'), '\\dfrac{a}{b}');
  assert.strictEqual(L('<mrow><mo>(</mo><mfrac><mi>a</mi><mi>b</mi></mfrac><mo>)</mo></mrow>'), '\\left( \\frac{a}{b} \\right)');
  assert.strictEqual(L('<mrow><mo>|</mo><mi>x</mi><mo>|</mo></mrow>'), '\\left| x \\right|');
});

test('đầu vào: thực thể HTML, tiền tố mml:, mảnh không có <math>, nút đã phân tích, chuỗi rỗng', () => {
  assert.strictEqual(math.mathmlToLatex('<math><mi>a</mi><mo>&InvisibleTimes;</mo><mi>b</mi><mo>&minus;</mo><mn>1</mn><mo>&le;</mo><mi>&pi;</mi></math>'), 'ab - 1 \\le \\pi');
  assert.strictEqual(math.mathmlToText('<math><mi>a</mi><mo>&#x2062;</mo><mi>b</mi><mo>&lt;</mo><mn>3</mn>&nbsp;</math>'), 'ab < 3');
  assert.strictEqual(math.mathmlToLatex('<mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:msup><mml:mi>x</mml:mi><mml:mn>2</mml:mn></mml:msup></mml:math>'), 'x^{2}');
  assert.strictEqual(math.mathmlToLatex('<mfrac><mi>a</mi><mi>b</mi></mfrac>'), '\\frac{a}{b}');
  assert.strictEqual(math.mathmlToText('<p>Cho <math><msqrt><mn>2</mn></msqrt></math> nhé</p>'), '√2');
  assert.strictEqual(math.mathmlToLatex(core.parseXml(M('<mi>y</mi>'))), 'y');
  assert.strictEqual(math.mathmlToLatex(''), '');
  assert.strictEqual(math.mathmlToText(null), '');
  // MathML hỏng không làm sập
  assert.doesNotThrow(() => math.mathmlToLatex('<math><mfrac><mi>a</mi></math>'));
  assert.doesNotThrow(() => math.mathmlToText('<math><msup></msup><mroot/><munderover><mo>∑</mo></munderover></math>'));
  assert.strictEqual(math.mathmlToLatex('<math><mfrac><mi>a</mi></mfrac></math>'), '\\frac{a}{}');
});

test('supText / subText', () => {
  assert.strictEqual(math.supText('2'), '²');
  assert.strictEqual(math.supText('-3'), '⁻³');
  assert.strictEqual(math.supText('n+1'), 'ⁿ⁺¹');
  assert.strictEqual(math.supText('0,5'), '^(0,5)');
  assert.strictEqual(math.supText('π'), '^π');
  assert.strictEqual(math.subText('12'), '₁₂');
  assert.strictEqual(math.subText('Q'), '_Q');
  assert.strictEqual(math.subText(''), '');
});

test('đầu ra hợp lệ: LaTeX cân ngoặc với mọi tổ hợp lồng nhau ngẫu nhiên', () => {
  const the = ['mi', 'mn', 'mo'], cha = ['mrow', 'mfrac', 'msqrt', 'mroot', 'msup', 'msub', 'msubsup', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mfenced', 'mstyle'];
  const chu = ['x', '2', '+', '−', '(', ')', '{', '∑', '→', 'lim', '′', '¯', '^', '∘', ''];
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  function sinh(d) {
    if (d > 4 || rnd(3) === 0) { const t = the[rnd(3)]; return '<' + t + '>' + chu[rnd(chu.length)] + '</' + t + '>'; }
    const c = cha[rnd(cha.length)], k = rnd(4);
    let s = '';
    for (let i = 0; i < k; i++) s += sinh(d + 1);
    return '<' + c + '>' + s + '</' + c + '>';
  }
  for (let i = 0; i < 400; i++) {
    const m = M(sinh(0));
    const t = math.mathmlToLatex(m);
    kiemLatex(t);
    assert.ok(typeof math.mathmlToText(m) === 'string');
  }
});

(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ĐẠT  ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 6).join('\n       ')); }
  }
  console.log(hong ? hong + '/' + ds.length + ' HỎNG' : 'ĐẠT ' + ds.length + '/' + ds.length);
  process.exitCode = hong ? 1 : 0;
})();
