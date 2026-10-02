/* tests/omml.test.cjs — kiểm thử js/omml.js (chạy: node tests/omml.test.cjs) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../js/core.js');
const omml = require('../js/omml.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

const NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const MATH = '<math xmlns="http://www.w3.org/1998/Math/MathML">';
const FA = String.fromCharCode(0x2061); // function application (vô hình)
const NBSP = String.fromCharCode(0xA0);
// dựng nhanh OMML
const r = (t, sty) => '<m:r>' + (sty ? '<m:rPr><m:sty m:val="' + sty + '"/></m:rPr>' : '') + '<w:rPr><w:rFonts w:ascii="Cambria Math"/></w:rPr><m:t>' + t + '</m:t></m:r>';
const om = (x) => '<m:oMath ' + NS + '>' + x + '</m:oMath>';
const f = (a, b, type) => '<m:f>' + (type ? '<m:fPr><m:type m:val="' + type + '"/></m:fPr>' : '') + '<m:num>' + a + '</m:num><m:den>' + b + '</m:den></m:f>';
const mm = (x) => omml.toMathML(om(x));
const tt = (x) => omml.toText(om(x));
const bo = (s) => s.replace(MATH, '').replace(/<\/math>$/, '');

test('phân số: bar / noBar / lin / skw, chữ → mi/mn/mo', () => {
  assert.strictEqual(mm(f(r('1'), r('2'))), MATH + '<mfrac><mn>1</mn><mn>2</mn></mfrac></math>');
  assert.strictEqual(bo(mm(f(r('x+1'), r('2x'), 'noBar'))), '<mfrac linethickness="0"><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mrow><mn>2</mn><mi>x</mi></mrow></mfrac>');
  assert.strictEqual(bo(mm(f(r('a'), r('b'), 'lin'))), '<mrow><mi>a</mi><mo>/</mo><mi>b</mi></mrow>');
  assert.strictEqual(bo(mm(f(r('a'), r('b'), 'skw'))), '<mfrac bevelled="true"><mi>a</mi><mi>b</mi></mfrac>');
  assert.strictEqual(tt(f(r('8'), r('3'))), '8/3');
  assert.strictEqual(tt(f(r('x+1'), r('x-1'))), '(x+1)/(x\u22121)');
});

test('số thập phân, dấu trừ, phép so sánh, thoát XML', () => {
  assert.strictEqual(bo(mm(r('-2,5&lt;x'))), '<mo>\u2212</mo><mn>2,5</mn><mo>&lt;</mo><mi>x</mi>');
  assert.strictEqual(bo(mm(r('a&amp;b'))), '<mi>a</mi><mo>&amp;</mo><mi>b</mi>');
  assert.strictEqual(bo(mm(r('x ≤ 3.14'))), '<mi>x</mi><mo>≤</mo><mn>3.14</mn>');
  assert.strictEqual(bo(mm(r('∞'))), '<mi mathvariant="normal">∞</mi>');
  assert.strictEqual(bo(mm(r("f'(x)"))), '<mi>f</mi><mo>′</mo><mo>(</mo><mi>x</mi><mo>)</mo>');
});

test('căn bậc hai / bậc n', () => {
  const sqrt = '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + r('x+1') + '</m:e></m:rad>';
  assert.strictEqual(bo(mm(sqrt)), '<msqrt><mi>x</mi><mo>+</mo><mn>1</mn></msqrt>');
  assert.strictEqual(tt(sqrt), '√(x+1)');
  const can3 = '<m:rad><m:deg>' + r('3') + '</m:deg><m:e>' + r('x') + '</m:e></m:rad>';
  assert.strictEqual(bo(mm(can3)), '<mroot><mi>x</mi><mn>3</mn></mroot>');
  assert.strictEqual(tt(can3), '∛x');
  // không có degHide nhưng bậc rỗng → căn bậc hai
  assert.strictEqual(bo(mm('<m:rad><m:deg/><m:e>' + r('2') + '</m:e></m:rad>')), '<msqrt><mn>2</mn></msqrt>');
  assert.strictEqual(tt('<m:rad><m:deg/><m:e>' + r('2') + '</m:e></m:rad>'), '√2');
});

test('tích phân / tổng (m:nary): limLoc, ẩn cận, mặc định theo ký tự', () => {
  const tp = '<m:nary><m:naryPr><m:limLoc m:val="subSup"/></m:naryPr><m:sub>' + r('0') + '</m:sub><m:sup>' + r('1') + '</m:sup><m:e>' + r('x') + r('dx') + '</m:e></m:nary>';
  assert.strictEqual(bo(mm(tp)), '<mrow><msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup><mrow><mi>x</mi><mi>d</mi><mi>x</mi></mrow></mrow>');
  assert.strictEqual(tt(tp), '∫₀¹xdx');
  const tong = '<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>' + r('k=1') + '</m:sub><m:sup>' + r('n') + '</m:sup><m:e>' + r('k') + '</m:e></m:nary>';
  assert.strictEqual(bo(mm(tong)), '<mrow><munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><mi>k</mi></mrow>');
  const anCan = '<m:nary><m:naryPr><m:subHide m:val="1"/><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/><m:e>' + r('f') + '</m:e></m:nary>';
  assert.strictEqual(bo(mm(anCan)), '<mrow><mo>∫</mo><mi>f</mi></mrow>');
  const chiDuoi = '<m:nary><m:naryPr><m:chr m:val="∏"/><m:supHide/></m:naryPr><m:sub>' + r('i') + '</m:sub><m:sup/><m:e>' + r('a') + '</m:e></m:nary>';
  assert.strictEqual(bo(mm(chiDuoi)), '<mrow><munder><mo>∏</mo><mi>i</mi></munder><mi>a</mi></mrow>');
});

test('ngoặc m:d, hệ phương trình (m:d + m:eqArr), dấu ngăn', () => {
  assert.strictEqual(bo(mm('<m:d><m:e>' + r('x+1') + '</m:e></m:d>')), '<mrow><mo fence="true">(</mo><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mo fence="true">)</mo></mrow>');
  const he = '<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:e>' + r('x+y=3') + '</m:e><m:e>' + r('x-y=1') + '</m:e></m:eqArr></m:e></m:d>';
  assert.strictEqual(bo(mm(he)), '<mrow><mo fence="true">{</mo><mtable columnalign="left"><mtr><mtd><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo><mn>3</mn></mtd></mtr><mtr><mtd><mi>x</mi><mo>\u2212</mo><mi>y</mi><mo>=</mo><mn>1</mn></mtd></mtr></mtable></mrow>');
  assert.strictEqual(tt(he), '{x+y=3; x\u2212y=1');
  const tap = '<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/><m:sepChr m:val=";"/></m:dPr><m:e>' + r('1') + '</m:e><m:e>' + r('2') + '</m:e></m:d>';
  assert.strictEqual(bo(mm(tap)), '<mrow><mo fence="true">[</mo><mn>1</mn><mo separator="true">;</mo><mn>2</mn><mo fence="true">]</mo></mrow>');
  assert.strictEqual(tt(tap), '[1;2]');
});

test('vectơ (m:acc U+20D7), mũ, gạch trên/dưới, groupChr', () => {
  const vec = (x) => '<m:acc><m:accPr><m:chr m:val="&#x20D7;"/></m:accPr><m:e>' + r(x) + '</m:e></m:acc>';
  assert.strictEqual(bo(mm(vec('AB'))), '<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>→</mo></mover>');
  assert.strictEqual(bo(mm(vec('a'))), '<mover accent="true"><mi>a</mi><mo stretchy="false">→</mo></mover>');
  assert.strictEqual(tt(vec('AB')), 'AB' + String.fromCharCode(0x20D7));
  // m:acc không có chr → dấu mũ
  assert.strictEqual(bo(mm('<m:acc><m:e>' + r('x') + '</m:e></m:acc>')), '<mover accent="true"><mi>x</mi><mo stretchy="false">^</mo></mover>');
  assert.strictEqual(bo(mm('<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>' + r('AB') + '</m:e></m:bar>')), '<mover accent="true"><mrow><mi>A</mi><mi>B</mi></mrow><mo>¯</mo></mover>');
  assert.strictEqual(bo(mm('<m:bar><m:e>' + r('x') + '</m:e></m:bar>')), '<munder accentunder="true"><mi>x</mi><mo>_</mo></munder>');
  assert.strictEqual(bo(mm('<m:groupChr><m:e>' + r('a+b') + '</m:e></m:groupChr>')), '<munder><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mo>⏟</mo></munder>');
});

test('chỉ số trên/dưới, tiền chỉ số', () => {
  const sup = '<m:sSup><m:e>' + r('x') + '</m:e><m:sup>' + r('2') + '</m:sup></m:sSup>';
  assert.strictEqual(bo(mm(sup)), '<msup><mi>x</mi><mn>2</mn></msup>');
  assert.strictEqual(tt(sup), 'x²');
  assert.strictEqual(tt('<m:sSup><m:e>' + r('e') + '</m:e><m:sup>' + r('x+1') + '</m:sup></m:sSup>'), 'eˣ⁺¹');
  const sub = '<m:sSub><m:e>' + r('a') + '</m:e><m:sub>' + r('n+1') + '</m:sub></m:sSub>';
  assert.strictEqual(bo(mm(sub)), '<msub><mi>a</mi><mrow><mi>n</mi><mo>+</mo><mn>1</mn></mrow></msub>');
  assert.strictEqual(tt(sub), 'aₙ₊₁');
  assert.strictEqual(bo(mm('<m:sSubSup><m:e>' + r('x') + '</m:e><m:sub>' + r('1') + '</m:sub><m:sup>' + r('2') + '</m:sup></m:sSubSup>')), '<msubsup><mi>x</mi><mn>1</mn><mn>2</mn></msubsup>');
  assert.strictEqual(bo(mm('<m:sPre><m:sub>' + r('6') + '</m:sub><m:sup>' + r('12') + '</m:sup><m:e>' + r('C') + '</m:e></m:sPre>')), '<mmultiscripts><mi>C</mi><mprescripts/><mn>6</mn><mn>12</mn></mmultiscripts>');
  // chỉ số không đổi được sang ký tự Unicode → ^(…)
  assert.strictEqual(tt('<m:sSup><m:e>' + r('2') + '</m:e><m:sup>' + r('y') + '</m:sup></m:sSup>'), '2^y');
});

test('hàm (m:func), lim (m:limLow), kiểu chữ sty/scr/nor', () => {
  const sin = '<m:func><m:fName>' + r('sin', 'p') + '</m:fName><m:e>' + r('x') + '</m:e></m:func>';
  assert.strictEqual(bo(mm(sin)), '<mrow><mi>sin</mi><mo>' + FA + '</mo><mi>x</mi></mrow>');
  assert.strictEqual(tt(sin), 'sin x');
  const lim = '<m:func><m:fName><m:limLow><m:e>' + r('lim', 'p') + '</m:e><m:lim>' + r('x→0') + '</m:lim></m:limLow></m:fName><m:e>' + f(r('sinx'), r('x')) + '</m:e></m:func>';
  assert.strictEqual(bo(mm(lim)), '<mrow><munder><mi>lim</mi><mrow><mi>x</mi><mo>→</mo><mn>0</mn></mrow></munder><mo>' + FA + '</mo><mfrac><mrow><mi>s</mi><mi>i</mi><mi>n</mi><mi>x</mi></mrow><mi>x</mi></mfrac></mrow>');
  // chữ trong fName dù không đặt sty vẫn gộp thành một mi
  assert.strictEqual(bo(mm('<m:func><m:fName>' + r('log') + '</m:fName><m:e>' + r('x') + '</m:e></m:func>')), '<mrow><mi>log</mi><mo>' + FA + '</mo><mi>x</mi></mrow>');
  const R = '<m:r><m:rPr><m:scr m:val="double-struck"/><m:sty m:val="p"/></m:rPr><m:t>R</m:t></m:r>';
  // chữ kép → ký tự Unicode (Chrome bỏ qua mathvariant), như latex.js \mathbb
  assert.strictEqual(bo(mm(R)), '<mi>ℝ</mi>');
  const kep = t => '<m:r><m:rPr><m:scr m:val="double-struck"/></m:rPr><m:t>' + t + '</m:t></m:r>';
  assert.strictEqual(bo(mm(kep('N'))), '<mi>ℕ</mi>');
  assert.strictEqual(bo(mm(kep('A'))), '<mi>' + String.fromCodePoint(0x1D538) + '</mi>');
  assert.strictEqual(bo(mm(kep('1'))), '<mn>' + String.fromCodePoint(0x1D7D9) + '</mn>');
  assert.strictEqual(tt(R), 'ℝ');
  assert.strictEqual(bo(mm(r('x', 'p'))), '<mi mathvariant="normal">x</mi>');
  assert.strictEqual(bo(mm(r('v', 'b'))), '<mi mathvariant="bold">v</mi>');
  assert.strictEqual(bo(mm(r('2', 'b'))), '<mn mathvariant="bold">2</mn>');
  assert.strictEqual(bo(mm('<m:r><m:rPr><m:nor/></m:rPr><m:t> khi x lớn </m:t></m:r>')), '<mtext>' + NBSP + 'khi x lớn' + NBSP + '</mtext>');
  // chữ thường Word (w:r) nằm trong vùng công thức → mtext
  assert.strictEqual(bo(mm('<w:r><w:t>với</w:t></w:r>' + r('x'))), '<mtext>với</mtext><mi>x</mi>');
});

test('ma trận, box, borderBox, phantom, oMathPara (display block), nhiều dòng', () => {
  const mt = '<m:d><m:e><m:m><m:mr><m:e>' + r('1') + '</m:e><m:e>' + r('0') + '</m:e></m:mr><m:mr><m:e>' + r('0') + '</m:e><m:e>' + r('1') + '</m:e></m:mr></m:m></m:e></m:d>';
  assert.strictEqual(bo(mm(mt)), '<mrow><mo fence="true">(</mo><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>0</mn></mtd></mtr><mtr><mtd><mn>0</mn></mtd><mtd><mn>1</mn></mtd></mtr></mtable><mo fence="true">)</mo></mrow>');
  assert.strictEqual(bo(mm('<m:box><m:e>' + r('a') + '</m:e></m:box>')), '<mi>a</mi>');
  assert.strictEqual(bo(mm('<m:borderBox><m:e>' + r('a') + '</m:e></m:borderBox>')), '<menclose notation="box"><mi>a</mi></menclose>');
  assert.strictEqual(bo(mm('<m:phant><m:phantPr><m:show m:val="0"/></m:phantPr><m:e>' + r('a') + '</m:e></m:phant>')), '<mphantom><mi>a</mi></mphantom>');
  const para = '<m:oMathPara ' + NS + '><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath>' + r('x=1') + '</m:oMath></m:oMathPara>';
  assert.strictEqual(omml.toMathML(para), '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>x</mi><mo>=</mo><mn>1</mn></math>');
  const hai = '<m:oMathPara ' + NS + '><m:oMath>' + r('a') + '</m:oMath><m:oMath>' + r('b') + '</m:oMath></m:oMathPara>';
  assert.strictEqual(omml.toMathML(hai), '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mtable><mtr><mtd><mi>a</mi></mtd></mtr><mtr><mtd><mi>b</mi></mtd></mtr></mtable></math>');
  // nhận cả node đã phân tích; bỏ qua w:del, bookmark, ctrlPr
  const node = core.parseXml(om(r('a') + '<w:del><m:r><m:t>z</m:t></m:r></w:del><w:bookmarkStart w:id="0"/><m:ctrlPr><w:rPr/></m:ctrlPr>' + r('b')));
  assert.strictEqual(omml.toMathML(node), MATH + '<mi>a</mi><mi>b</mi></math>');
  assert.strictEqual(omml.toMathML(node, { display: true }), '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>a</mi><mi>b</mi></math>');
});

test('MathML sinh ra là XML hợp lệ, đối số luôn đúng 1 phần tử', () => {
  const phucTap = f(r('-b±') + '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:sSup><m:e>' + r('b') + '</m:e><m:sup>' + r('2') + '</m:sup></m:sSup>' + r('-4ac') + '</m:e></m:rad>', r('2a'));
  const out = mm(phucTap);
  const x = core.parseXml(out);
  assert.strictEqual(x.name, 'math');
  const kiem = (n) => {
    if (n.type !== 'el') return;
    const k = core.children(n).length;
    if (n.name === 'mfrac' || n.name === 'msup' || n.name === 'msub' || n.name === 'mroot' || n.name === 'munder' || n.name === 'mover') assert.strictEqual(k, 2, n.name + ' phải có 2 con');
    if (n.name === 'msubsup' || n.name === 'munderover') assert.strictEqual(k, 3, n.name + ' phải có 3 con');
    core.children(n).forEach(kiem);
  };
  kiem(x);
  assert.strictEqual(tt(phucTap), '(\u2212b±√(b²\u22124ac))/(2a)');
  // chữ rỗng → mrow rỗng giữ chỗ
  assert.strictEqual(bo(mm('<m:sSup><m:e/><m:sup>' + r('2') + '</m:sup></m:sSup>')), '<msup><mrow></mrow><mn>2</mn></msup>');
});

test('nạp kiểu trình duyệt (self.NH.omml)', () => {
  const vm = require('vm');
  const ctx = { self: {}, TextEncoder, TextDecoder };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/omml.js'), 'utf8'), ctx);
  assert.strictEqual(typeof ctx.self.NH.omml.toMathML, 'function');
  assert.strictEqual(ctx.self.NH.omml.toMathML(om(f(r('1'), r('2')))), mm(f(r('1'), r('2'))));
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 8).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (omml)');
  process.exitCode = hong ? 1 : 0;
})();
