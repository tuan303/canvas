/* tests/scorm.test.cjs — kiểm thử js/scorm.js (chạy: node tests/scorm.test.cjs)
 * - đơn vị: giải mã _KX, cắt vùng dữ liệu, chạy mã (vm + iframe giả), CSS → style nội tuyến, biến thể đáp án
 * - gói tự dựng (tpl-plain / tpl-enc) đủ các dạng + lỗi
 * - MỌI gói C:/Users/Administrator/Downloads/*SCORM*.zip: số câu, đáp án khớp JSON corpus (nếu có), không lỗi */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const core = require('../js/core.js');
const zip = require('../js/zip.js');
const scorm = require('../js/scorm.js');
const I = scorm._internal;

const DL = 'C:/Users/Administrator/Downloads';
const CORPUS = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-Downloads-PM-chamthidua/dc508171-525f-4c6b-95a3-99cccd19d826/scratchpad/corpus';

// html.js thật nếu đã có, nếu chưa: bản giả tối thiểu (đúng chữ ký DESIGN §7)
let HTML = null;
try { HTML = require('../js/html.js'); } catch (e) { HTML = null; }
const HTML_GIA = {
  cleanForCanvas(h, o) {
    const issues = [], used = [];
    h = String(h)
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, () => { issues.push({ level: 'warn', msg: 'bỏ SVG' }); return ''; })
      .replace(/<\/?(input|button|label)\b[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
    h.replace(/<img\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi, (m, s) => {
      const ten = s.replace(/^images\//, '');
      if (!/^images\//.test(s) || !o.images[ten]) issues.push({ level: 'error', msg: 'ảnh không có trong gói: ' + s });
      else used.push(ten);
    });
    return { html: h, issues, usedImages: used };
  },
  toPlainText(h) {
    return String(h).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }
};
const HTML_DUNG = HTML && typeof HTML.cleanForCanvas === 'function' ? HTML : HTML_GIA;

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

/* ---------- tiện ích ---------- */

// Mã hoá ngược với decryptKeys (XOR đối xứng) — để dựng gói tpl-enc giả
function maHoa(keys, km) {
  const b = Buffer.from(JSON.stringify(keys), 'utf8');
  for (let i = 0; i < b.length; i++) b[i] ^= (km.charCodeAt(i % km.length) & 0xff) ^ ((i * 31) & 0xff);
  return b.toString('base64');
}
async function goiZip(files) {
  return zip.writeZip(Object.keys(files).map(p => ({ path: p, data: files[p] })));
}
const PNG1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const MANIFEST = '<?xml version="1.0"?><manifest identifier="M1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><organizations><organization><title>Đề thử</title><item><title>Đề thử</title></item></organization></organizations><resources><resource identifier="R" type="webcontent" adlcp:scormtype="sco" href="index.html"/></resources></manifest>';

function moiHtml(q) {
  const out = [q.stem, q.stimulus];
  (q.choices || []).forEach(c => out.push(c.html));
  (q.statements || []).forEach(s => out.push(s.html));
  (q.pairs || []).forEach(p => out.push(p.left));
  return out.filter(s => s != null);
}
function thuan(h) { return HTML_GIA.toPlainText(h); }

// Bất biến chung của một ngân hàng: ảnh, CSS đã inline, validateQuestion, mã câu duy nhất
function kiemNganHang(bank, ten, choPhepLoi) {
  assert.ok(bank.title && bank.ident && /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(bank.ident), ten + ': tên/ident ngân hàng');
  assert.strictEqual(bank.source.kind, 'scorm');
  const ids = {}, dungAnh = {};
  Object.keys(bank.images).forEach(n => {
    assert.ok(/^[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)$/.test(n), ten + ': tên ảnh không ASCII hợp lệ ' + n);
    assert.ok(bank.images[n] instanceof Uint8Array && bank.images[n].length > 0, ten + ': ảnh rỗng ' + n);
  });
  bank.questions.forEach(q => {
    assert.ok(!ids[q.id], ten + ': trùng mã câu ' + q.id);
    ids[q.id] = 1;
    assert.ok(typeof q.no === 'string' && q.no, ten + ': thiếu no');
    assert.ok(q.title.indexOf(q.no) >= 0, ten + ': title phải giữ số câu gốc ' + q.title);
    const v = core.validateQuestion(q).concat(q.issues || []).filter(x => x.level === 'error');
    if (!choPhepLoi) assert.deepStrictEqual(v.map(x => x.msg), [], ten + ' ' + q.id + ': có lỗi');
    moiHtml(q).forEach(h => {
      assert.strictEqual(h, h.normalize('NFC'), ten + ' ' + q.id + ': chưa NFC');
      assert.ok(!/var\(--/.test(h), ten + ' ' + q.id + ': còn var(--)');
      assert.ok(!/<svg\b/i.test(h), ten + ' ' + q.id + ': còn SVG');
      assert.ok(!/class\s*=\s*"[^"]*\b(mini|scrollx|picstrip|passage|extag|blank-no|visual|hemo)\b/.test(h), ten + ' ' + q.id + ': còn class đã inline');
      h.replace(/<img\b[^>]*?\bsrc\s*=\s*"([^"]*)"/gi, (m, s) => {
        const n = s.replace(/^images\//, '');
        assert.ok(/^images\//.test(s) && bank.images[n], ten + ' ' + q.id + ': ảnh không có trong ngân hàng ' + s);
        dungAnh[n] = 1;
      });
    });
    if (q.type === 'blanks' || q.type === 'dropdowns') {
      (q.blanks || q.dropdowns).forEach(b => assert.ok(q.stem.split('[' + b.id + ']').length === 2, ten + ' ' + q.id + ': [' + b.id + '] phải có đúng 1 lần'));
    }
  });
  Object.keys(bank.images).forEach(n => assert.ok(dungAnh[n], ten + ': ảnh thừa không ai dùng ' + n));
}

/* ---------- đơn vị ---------- */

test('base64Bytes khớp Buffer (mọi độ dài)', () => {
  for (let n = 0; n < 70; n++) {
    const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 37 + n) & 255;
    assert.deepStrictEqual(Buffer.from(I.base64Bytes(b.toString('base64'))), b);
  }
});

test('decryptKeys giải đúng bảng do template mã hoá (UTF-8, mảng lồng)', () => {
  const keys = [['8/3', '2,67'], 'B', ['Hà Nội', 'Ha Noi'], ['B', 'D'], 'NOT GIVEN'];
  const km = 'nshm.HSA-TOAN.50';
  assert.deepStrictEqual(I.decryptKeys(maHoa(keys, km), km), keys);
  assert.throws(() => I.decryptKeys(maHoa(keys, km), 'sai.khoa'));
});

test('dataRegion: mốc PHẦN 1/2 … HẾT PHẦN SỬA (bỏ mốc giả trong comment đầu) và mốc var SCORM', () => {
  const tpl = '<script>/* hướng dẫn: … HẾT PHẦN SỬA sớm */\n/* === ►►►►►  PHẦN 1/2 — DỮ LIỆU */\nvar EXAM={a:1};\nvar PARTS=[];\n' +
    '/* ►►►►►  HẾT PHẦN SỬA. PHẦN 2/2 BÊN DƯỚI */\nvar SCORM=1;</script>';
  const r = I.dataRegion(tpl);
  assert.strictEqual(r.how, 'markers');
  assert.ok(/var EXAM=\{a:1\};\s*var PARTS=\[\];\s*$/.test(r.src), r.src);
  const cu = '<script src="x.js"></script><script>\n  var QUESTIONS=[1];\n  var SCORM=(function(){})();</script>';
  const r2 = I.dataRegion(cu);
  assert.strictEqual(r2.how, 'before-var-SCORM');
  assert.strictEqual(r2.src.trim(), 'var QUESTIONS=[1];');
  assert.throws(() => I.dataRegion('<script>var x=1</script>'), /Không tìm thấy/);
  assert.throws(() => I.dataRegion('<script>var EXAM=1;</script>'), /var SCORM/);
});

test('sliceFunction bỏ qua ngoặc trong chuỗi', () => {
  const code = 'var a=1; function visualHTML(q){ if(q) return "}{"; return \'{\'+`}`; } var b=2;';
  const f = I.sliceFunction(code, 'visualHTML');
  assert.ok(f.startsWith('function visualHTML(q){') && f.endsWith('}'));
  assert.strictEqual(vm.runInNewContext(f + ';visualHTML(1)'), '}{');
  assert.strictEqual(I.sliceFunction(code, 'khongCo'), null);
});

test('nodeEvaluator: lấy var/let/const, thiếu biến → undefined, lỗi mã → reject', async () => {
  const g = await I.nodeEvaluator('var A=[1,{x:"é"}]; let B=2; const C=`t`;', ['A', 'B', 'C', 'D']);
  assert.deepStrictEqual(g, { A: [1, { x: 'é' }], B: 2, C: 't' });
  await assert.rejects(() => Promise.resolve().then(() => I.nodeEvaluator('var A=;', ['A'])));
  assert.throws(() => I.duoiTraVe(['a-b']), /không hợp lệ/);
});

// DOM giả: iframe chạy srcdoc trong vm, postMessage qua lại bất đồng bộ
function domGia(opts) {
  opts = opts || {};
  const ngheCha = [];
  const winCha = {
    addEventListener(t, f) { if (t === 'message') ngheCha.push(f); },
    removeEventListener(t, f) { const i = ngheCha.indexOf(f); if (i >= 0) ngheCha.splice(i, 1); }
  };
  const body = {
    con: [],
    appendChild(el) { this.con.push(el); el.parentNode = this; el._gan(); },
    removeChild(el) { this.con.splice(this.con.indexOf(el), 1); el.parentNode = null; }
  };
  const doc = { defaultView: winCha, body, createElement() { return taoIframe(); } };
  function taoIframe() {
    const ngheCon = [];
    const winCon = { postMessage(msg) { setTimeout(() => ngheCon.forEach(f => f({ data: JSON.parse(JSON.stringify(msg)), source: winCha })), 0); } };
    const el = {
      attrs: {}, style: {}, parentNode: null, contentWindow: winCon,
      setAttribute(k, v) { this.attrs[k] = v; },
      _gan() {
        if (opts.imLang) return; // iframe không trả lời → thử hạn giờ
        const m = /<script>([\s\S]*)<\/script>/.exec(this.srcdoc);
        const sb = {
          window: { addEventListener(t, f) { if (t === 'message') ngheCon.push(f); } },
          parent: { postMessage(msg) { setTimeout(() => ngheCha.slice().forEach(f => f({ data: JSON.parse(JSON.stringify(msg)), source: winCon })), 0); } }
        };
        vm.createContext(sb);
        vm.runInContext(m[1], sb);
      }
    };
    return el;
  }
  return { doc, body, ngheCha };
}

test('makeIframeEvaluator: sandbox chỉ allow-scripts, CSP chặn mạng, trả dữ liệu, dọn iframe', async () => {
  const d = domGia();
  const ev = scorm.makeIframeEvaluator(d.doc);
  const p = ev('var EXAM={title:"Đề"}; let PARTS=[{groups:[]}];', ['EXAM', 'PARTS', 'QUESTIONS']);
  const fr = d.body.con[0];
  assert.strictEqual(fr.attrs.sandbox, 'allow-scripts');
  assert.ok(/Content-Security-Policy/.test(fr.srcdoc) && /default-src 'none'/.test(fr.srcdoc));
  assert.deepStrictEqual(await p, { EXAM: { title: 'Đề' }, PARTS: [{ groups: [] }] });
  assert.strictEqual(d.body.con.length, 0, 'iframe phải được gỡ');
  assert.strictEqual(d.ngheCha.length, 0, 'phải gỡ bộ nghe message');
  await assert.rejects(ev('throw new Error("hỏng")', ['A']), /hỏng/);
  const d2 = domGia({ imLang: true });
  await assert.rejects(scorm.makeIframeEvaluator(d2.doc, { timeout: 30 })('var A=1', ['A']), /Quá thời gian/);
  assert.strictEqual(d2.body.con.length, 0);
});

test('CSS: luật con cháu (table.mini th), var(), bỏ luật trạng thái, ".box .dim" → ".dim", đậm → <strong>', () => {
  const html = '<style>:root{--muted:#63708a;--line:#ddd}\n.scrollx{overflow-x:auto}\ntable.mini{border-collapse:collapse}\n' +
    'table.mini th,table.mini td{border:1px solid var(--line);padding:4px}\ntable.mini th{background:#eee;font-weight:700}\n' +
    '.q{padding:11px 0;cursor:pointer}\n.q.cur{background:red}\n.q:first-child{border:0}\n.q.ex{background:#f7f9fd}\nbody.exam-armed .q{color:red}\n' +
    '.box .dim{color:var(--muted);font-size:14px}\n.extag{font-weight:700;color:#fff}\n.opts .opt img{max-height:130px}\n' +
    '@media (max-width:600px){.scrollx{overflow:hidden}}\nsub{font-size:.7em}</style>';
  const rules = I.parseCss(html);
  const vars = I.rootVarsCua(rules);
  assert.strictEqual(vars['--muted'], '#63708a');
  const lop = { scrollx: 1, mini: 1, q: 1, ex: 1, dim: 1, extag: 1 };
  const c = I.chonLuatCss(rules, lop, vars);
  const ra = I.inlineCss('<div class="scrollx"><table class="mini"><tr><th>A</th><td style="padding:9px">B</td></tr></table></div>' +
    '<div class="q ex" style="color:var(--muted)">x <span class="extag">ví dụ</span></div><span class="dim">d</span><img src="a.png"><sub>2</sub>',
  c.rules, vars, c.known);
  assert.strictEqual(ra,
    '<div style="overflow-x:auto"><table style="border-collapse:collapse"><tr><th style="border:1px solid #ddd;padding:4px;background:#eee">A</th>' +
    '<td style="border:1px solid #ddd;padding:9px">B</td></tr></table></div>' +
    '<div style="padding:11px 0;background:#f7f9fd;color:#63708a">x <span style="color:#fff"><strong>ví dụ</strong></span></div>' +
    '<span style="color:#63708a;font-size:14px">d</span><img src="a.png"><sub>2</sub>');
  // lớp lạ giữ nguyên, thẻ đóng lệch không làm hỏng
  assert.strictEqual(I.inlineCss('<p class="doan">a<b>b</p>', c.rules, vars, c.known), '<p class="doan">a<b>b</p>');
  assert.strictEqual(I.inlineCss('a < b', c.rules, vars, c.known), 'a < b');
});

test('shortVariants: nháy cong/thẳng, dấu câu cuối, thập phân, gạch nối, mạo từ (chỉ cụm ngắn)', () => {
  const v = I.shortVariants(['It’s in front of the box.'], { loose: true });
  ['It’s in front of the box.', "It's in front of the box.", 'It’s in front of the box', "It's in front of the box"].forEach(x => assert.ok(v.includes(x), x));
  assert.ok(!v.some(x => /^in front/.test(x)));
  assert.deepStrictEqual(I.shortVariants(['12,5']), ['12,5', '12.5']);
  const m = I.shortVariants(['micro-arrays'], { loose: true });
  ['micro-arrays', 'micro arrays', 'microarrays'].forEach(x => assert.ok(m.includes(x), x));
  assert.ok(I.shortVariants(['a door'], { loose: true }).includes('door'));
  assert.ok(!I.shortVariants(['The dog is in front of the box.'], { loose: true }).some(x => /^dog/.test(x)));
  assert.ok(!I.shortVariants(['a door']).includes('door'), 'chỉ bỏ mạo từ khi loose');
});

test('locLoiDan bỏ câu nhắc ví dụ / ô điểm', () => {
  assert.strictEqual(I.locLoiDan('Nhìn hình. <i>There is one example.</i>'), 'Nhìn hình.');
  assert.strictEqual(I.locLoiDan('(…… / 5 points)'), '');
  assert.strictEqual(I.locLoiDan('<i>There is one example.</i> — Mỗi câu <b>2 điểm</b>. (…… / 10 points)'), 'Mỗi câu <b>2 điểm</b>.');
});

/* ---------- gói tự dựng ---------- */

const HTML_PLAIN = `<!doctype html><html><head><title>Đề thử &amp; nghiệm</title>
<style>:root{--red:#d21235}.scrollx{overflow-x:auto}table.mini td{border:1px solid #999}.q.cur{background:red}</style></head><body>
<script>
var EXAM = {title:"ĐỀ THỬ", subtitle:"MÔN X | 9 CÂU", code:"T", tfLadder:[0,0.25,0.5,1]};
var LOCK = {enabled:false, pin:"1234"};
var PARTS = [{label:"PHẦN 1", sub:"Trắc nghiệm", groups:[
  {head:"Câu 1 – 2", instr:["Chọn đáp án đúng."], type:"mcq", perItem:0.5, items:[
    {n:1,q:"Hai cộng hai?",opts:["3","4"],ans:"B"},
    {n:2,q:"Ảnh <img src='images/Ảnh 1.png'> <span style='color:var(--red)'>đỏ</span>",table:"<div class='scrollx'><table class='mini'><tr><td>1</td></tr></table></div>",opts:[{k:"A",t:"x"},{k:"B",t:"y"}],ans:"A"}]},
  {head:"", type:"gap", instr:["Điền từ."], lines:["A {{3}} B {{4}}"], items:[{n:3,ans:["x-ray"]},{n:4,ans:["y","z"]}]},
  {type:"tf", items:[{n:5,q:"Q",sub:[{k:"a",t:"s1",ans:"Đ"},{k:"b",t:"s2",ans:"S"}]}]},
  {type:"select", list:[{k:"i",t:"H1"},{k:"ii",t:"H2"},{k:"iii",t:"H3"},{k:"iv",t:"H4"}], example:{label:"P A",ans:"iii"}, items:[{n:6,q:"P B",ans:"i"},{n:7,q:"P C",ans:"ii"}]},
  {type:"multi", pick:2, nums:[8,9], ans:["A","C"], opts:[{k:"A",t:"a"},{k:"B",t:"b"},{k:"C",t:"c"}]},
  {type:"mistake", items:[{n:10, ans:"B", seg:[{t:"He "},{t:"go",k:"A"},{t:" to "},{t:"schools",k:"B"}]}]},
  {type:"bank", bank:["mèo","chó","gà"], example:{q:"vd", ans:"gà"}, items:[{n:11,q:"Con kêu meo ____ .",ans:["mèo"]},{n:12,q:"Con sủa",ans:["Chó"]}]},
  {type:"letters", keys:["A","B","C"], people:[{k:"A",t:"An"},{k:"B",t:"Bình"},{k:"C",t:"Chi"}], items:[{n:13,q:"Ai?",ans:"B"},{n:14,q:"Ai nữa?",ans:"B"}]},
  {type:"short", items:[{n:15,q:"Số?",ans:["1,5"],hint:"dùng dấu phẩy"}]},
  {type:"weird", items:[{n:16}]},
  {type:"short", items:[{n:17,q:"<img src='images/x.webp'> <img src='images/khong-co.png'>",ans:["1"]}]}
]}];
var SCORM = (function(){ return {}; })();
</script></body></html>`;

test('gói tpl-plain tự dựng: đủ dạng, ảnh ASCII, CSS inline, lỗi đúng chỗ', async () => {
  const u8 = await goiZip({ 'imsmanifest.xml': MANIFEST, 'index.html': HTML_PLAIN, 'images/Ảnh 1.png': PNG1, 'images/x.webp': PNG1, 'images/thua.png': PNG1 });
  const r = await scorm.parseScorm(u8, { fileName: 'thu.zip', html: HTML_DUNG });
  assert.deepStrictEqual(r.issues, []);
  const b = r.banks[0];
  assert.strictEqual(b.title, 'ĐỀ THỬ – MÔN X');
  assert.strictEqual(b.ident, core.bankIdent('ĐỀ THỬ – MÔN X'));
  assert.deepStrictEqual(b.source, { kind: 'scorm', name: 'thu.zip' });
  const Q = {}; b.questions.forEach(q => { Q[q.id] = q; });
  assert.deepStrictEqual(b.questions.map(q => q.id), ['q01', 'q02', 'q03_04', 'q05', 'q06_07', 'q08_09', 'q10', 'q11_12', 'q13_14', 'q15', 'q16', 'q17']);
  // mc + lời dẫn nhóm vào stimulus, tiêu đề dạng khoảng số bị bỏ
  assert.strictEqual(Q.q01.points, 0.5);
  assert.strictEqual(Q.q01.choices.findIndex(c => c.correct), 1);
  assert.strictEqual(Q.q01.stimulus, '<p>Chọn đáp án đúng.</p>');
  assert.ok(!/Câu 1 – 2/.test(Q.q01.stimulus + Q.q01.stem));
  assert.deepStrictEqual(Object.keys(b.images), ['anh_1.png']);
  assert.ok(Q.q02.stem.includes('src="images/anh_1.png"'));
  assert.ok(Q.q02.stem.includes('<span style="color:#d21235">đỏ</span>'));
  assert.ok(/<div style="overflow-x:auto"><table\b[^>]*>(<tbody>)?<tr><td style="[^"]*border:1px solid #999[^"]*">1<\/td>/.test(Q.q02.stem), Q.q02.stem);
  assert.ok(!/class=/.test(Q.q02.stem), 'lớp đã inline phải bỏ');
  // gap → blanks
  assert.strictEqual(Q.q03_04.type, 'blanks');
  assert.strictEqual(Q.q03_04.no, '3–4');
  assert.ok(Q.q03_04.stem.includes('[b3]') && Q.q03_04.stem.includes('[b4]') && Q.q03_04.stem.includes('Điền từ.'));
  assert.ok(Q.q03_04.blanks[0].accepts.includes('x ray') && Q.q03_04.blanks[0].accepts.includes('xray'));
  assert.deepStrictEqual(Q.q03_04.blanks[1].accepts, ['y', 'z']);
  assert.strictEqual(Q.q03_04.points, 2);
  // tf: điểm = perItem × bậc cao nhất, cảnh báo bậc thang ở cấp ngân hàng
  assert.deepStrictEqual(Q.q05.statements.map(s => s.value), [true, false]);
  assert.ok(b.warnings.some(w => w.level === 'warn' && /bậc thang/.test(w.msg)));
  // select → matching: bỏ tiêu đề chỉ dùng cho ví dụ khỏi vế nhiễu
  assert.deepStrictEqual(Q.q06_07.pairs.map(p => p.right), ['i. H1', 'ii. H2']);
  assert.deepStrictEqual(Q.q06_07.distractors, ['iv. H4']);
  // multi → ma, điểm = số đáp án đúng
  assert.strictEqual(Q.q08_09.type, 'ma');
  assert.strictEqual(Q.q08_09.points, 2);
  assert.deepStrictEqual(Q.q08_09.choices.map(c => c.correct), [true, false, true]);
  // mistake → mc, phương án = đoạn gạch chân
  assert.deepStrictEqual(Q.q10.choices.map(c => c.html), ['go', 'schools']);
  assert.ok(Q.q10.choices[1].correct && /<u><strong>go<\/strong><\/u><sup[^>]*>A<\/sup>/.test(Q.q10.stem));
  // bank → dropdowns: bỏ từ chỉ dùng cho ví dụ, so khớp không phân biệt hoa thường
  assert.deepStrictEqual(Q.q11_12.dropdowns.map(d => [d.options, d.correct]), [[['mèo', 'chó'], 0], [['mèo', 'chó'], 1]]);
  assert.ok(Q.q11_12.stem.includes('Con kêu meo [b11] .') && Q.q11_12.stem.includes('Con sủa → [b12]'));
  // letters → matching "A. Tên", hai câu cùng một đáp án
  assert.deepStrictEqual(Q.q13_14.pairs.map(p => p.right), ['B. Bình', 'B. Bình']);
  assert.deepStrictEqual(Q.q13_14.distractors, ['A. An', 'C. Chi']);
  // short + gợi ý
  assert.deepStrictEqual(Q.q15.answers, ['1,5', '1.5']);
  assert.ok(Q.q15.stem.includes('<p><em>(dùng dấu phẩy)</em></p>'));
  // dạng lạ / ảnh hỏng → lỗi của riêng câu đó
  assert.ok(Q.q16.issues.some(x => x.level === 'error' && /chưa hỗ trợ/.test(x.msg)));
  assert.ok(Q.q17.issues.some(x => x.level === 'error' && /\.webp/.test(x.msg)));
  assert.ok(Q.q17.issues.some(x => x.level === 'error' && /thiếu ảnh/.test(x.msg)));
  b.questions.filter(q => q.id !== 'q16' && q.id !== 'q17').forEach(q => {
    assert.deepStrictEqual(core.validateQuestion(q).concat(q.issues).filter(x => x.level === 'error'), [], q.id);
  });
});

test('gói tpl-enc tự dựng: giải mã _KX, nhóm có đoạn dẫn, số câu lặp giữa các phần', async () => {
  const keys = ['C', ['8/3', '2,67'], ['B', 'C']];
  const km = 'nshm.THU.50';
  const html = '<html><head><title>x</title></head><body><script>\n/* === ►►►►►  PHẦN 1/2 — DỮ LIỆU ĐỀ THI */\n' +
    'var EXAM = {title:"ĐỀ MÃ HOÁ", subtitle:"", code:"THU", note:"Nguồn đề"};\nvar LOCK = {enabled:true};\n' +
    'var _KM = "' + km + '";\nvar _KX = "' + maHoa(keys, km) + '";\n' +
    'var PARTS = [{label:"PHẦN I", groups:[{head:"Câu 1 – 1", type:"mcq", pre:"<p>Đoạn dẫn (1) ____</p>", items:[{n:1,q:"",opts:["a","b","c"],ans:0}]}]},' +
    '{label:"PHẦN II", groups:[{type:"short", items:[{n:1,q:"Tính",ans:1}]},{type:"multi",nums:[2,3],ans:2,opts:["x","y","z"]}]}];\n' +
    '/* ►►►►►  HẾT PHẦN SỬA. PHẦN 2/2 */\nvar SCORM=(function(){})();\n</script></body></html>';
  const u8 = await goiZip({ 'goc/imsmanifest.xml': MANIFEST, 'goc/index.html': html });
  const r = await scorm.parseScorm(u8, { html: HTML_DUNG });
  assert.deepStrictEqual(r.issues, []);
  const b = r.banks[0];
  assert.deepStrictEqual(b.scorm, { variant: 'tpl-enc', encrypted: true, entry: 'goc/index.html' });
  assert.deepStrictEqual(b.questions.map(q => [q.id, q.title]), [['p1_q01', 'PHẦN I – Câu 1'], ['p2_q01', 'PHẦN II – Câu 1'], ['p2_q02_03', 'PHẦN II – Câu 2–3']]);
  const [q1, q2, q3] = b.questions;
  assert.strictEqual(q1.choices.findIndex(c => c.correct), 2);
  assert.ok(q1.stimulus.includes('Đoạn dẫn (1)') && !q1.stimulus.includes('Nguồn đề'), 'ghi chú nguồn đề không cần cho câu');
  assert.ok(/<p><strong>\(1\)<\/strong><\/p>/.test(q1.stem), 'câu trống q → ghi số chỗ trống: ' + q1.stem);
  assert.deepStrictEqual(q2.answers, ['8/3', '2,67', '2.67']);
  assert.deepStrictEqual(q3.choices.map(c => c.correct), [false, true, true]);
});

test('lỗi cấp gói: không phải zip / zip không có đề → issues, không ném', async () => {
  const r1 = await scorm.parseScorm(new Uint8Array([1, 2, 3]), { fileName: 'hong.zip', html: HTML_DUNG });
  assert.strictEqual(r1.banks.length, 0);
  assert.ok(r1.issues[0].level === 'error' && /^hong\.zip: /.test(r1.issues[0].msg));
  const r2 = await scorm.parseScorm(await goiZip({ 'index.html': '<html>không có đề</html>' }), { fileName: 'rong.zip', html: HTML_DUNG });
  assert.ok(r2.banks.length === 0 && /Không thấy trang đề/.test(r2.issues[0].msg));
  const r3 = await scorm.parseScorm(await goiZip({ 'index.html': '<script>var EXAM=1;var PARTS=2;\nvar SCORM=1</script>' }), { html: HTML_DUNG });
  assert.ok(r3.banks.length === 0 && /chưa biết/.test(r3.issues[0].msg));
  // evalData do môi trường cấp được dùng thay vm
  let goi = 0;
  const r4 = await scorm.parseScorm(await goiZip({ 'index.html': HTML_PLAIN }), {
    html: HTML_DUNG, evalData: (c, n) => { goi++; return I.nodeEvaluator(c, n); }
  });
  assert.strictEqual(goi, 1);
  assert.strictEqual(r4.banks.length, 1);
});

/* ---------- 10 gói thật ---------- */

const LET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
// Kỳ vọng dựng ĐỘC LẬP từ JSON corpus (extract2): thứ tự câu, loại, đáp án
function kyVong(J) {
  const out = [];
  J.PARTS.forEach(P => (P.groups || []).forEach(G => {
    const items = G.items || [];
    const t = G.type;
    if (t === 'mcq') items.forEach(it => {
      const opts = it.opts || G.opts;
      let k = opts.findIndex((o, i) => (o && typeof o === 'object' ? o.k : LET[i]) === it.ans);
      if (k < 0) k = LET.indexOf(it.ans);
      out.push({ no: String(it.n), type: 'mc', check: q => { assert.strictEqual(q.choices.length, opts.length); assert.strictEqual(q.choices.findIndex(c => c.correct), k); } });
    });
    else if (t === 'mistake') items.forEach(it => {
      const segs = it.seg.filter(s => s.k);
      out.push({ no: String(it.n), type: 'mc', check: q => {
        assert.deepStrictEqual(q.choices.map(c => thuan(c.html)), segs.map(s => thuan(s.t)));
        assert.strictEqual(q.choices.findIndex(c => c.correct), segs.findIndex(s => s.k === it.ans));
      } });
    });
    else if (t === 'tf') items.forEach(it => out.push({ no: String(it.n), type: 'tf', check: q => assert.deepStrictEqual(q.statements.map(s => s.value), it.sub.map(s => s.ans === 'Đ')) }));
    else if (t === 'short' || t === 'order') items.forEach(it => out.push({ no: String(it.n), type: 'short', check: q => {
      [].concat(it.ans).forEach(a => assert.ok(q.answers.includes(a.normalize('NFC').replace(/\s+/g, ' ').trim()), 'thiếu đáp án "' + a + '"'));
    } }));
    else if (t === 'multi') out.push({ no: G.nums[0] + '–' + G.nums[G.nums.length - 1], type: 'ma', check: q => {
      assert.deepStrictEqual(q.choices.map((c, i) => c.correct ? (G.opts[i].k || LET[i]) : null).filter(Boolean).sort(), [].concat(G.ans).sort());
      assert.strictEqual(q.points, G.perItem * [].concat(G.ans).length);
    } });
    else if (t === 'gap' || t === 'flow') out.push({ no: items[0].n + '–' + items[items.length - 1].n, type: 'blanks', check: q => {
      items.forEach(it => {
        const bl = q.blanks.find(b => b.id === 'b' + it.n);
        assert.ok(bl, 'thiếu ô b' + it.n);
        it.ans.forEach(a => assert.ok(bl.accepts.includes(a), 'ô b' + it.n + ' thiếu "' + a + '"'));
      });
    } });
    else if (t === 'bank') out.push({ no: items[0].n + '–' + items[items.length - 1].n, type: 'dropdowns', check: q => {
      items.forEach((it, i) => {
        const d = q.dropdowns[i];
        assert.strictEqual(d.id, 'b' + it.n);
        assert.ok([].concat(it.ans).map(a => a.toLowerCase()).includes(d.options[d.correct].toLowerCase()), 'ô ' + it.n);
        d.options.forEach(o => assert.ok(G.bank.includes(o), 'lựa chọn lạ ' + o));
      });
    } });
    else if (t === 'letters' || t === 'select') out.push({ no: items[0].n + '–' + items[items.length - 1].n, type: 'matching', check: q => {
      assert.strictEqual(q.pairs.length, items.length);
      items.forEach((it, i) => {
        const r = q.pairs[i].right;
        assert.ok(r === it.ans || r.startsWith(it.ans + '. '), 'cặp ' + it.n + ': ' + r);
        assert.strictEqual(thuan(q.pairs[i].left), thuan(it.q));
      });
      q.distractors.forEach(d => assert.ok(!items.some(it => d === it.ans || d.startsWith(it.ans + '. ')), 'nhiễu trùng đáp án ' + d));
    } });
    else throw new Error('corpus có dạng lạ ' + t);
  }));
  return out;
}

// Dự phòng khi không có corpus: số câu + tổng điểm
const BIET = {
  K10_IELTS_READING_DGNL_T07_SCORM: [14, 40], K12_HOAHOC_DGNL_T07_MD0301_SCORM: [28, 10], K2_TIENGANH_DGNL_T01_MD01_SCORM: [32, 45],
  'K4_TA_DE THI THANG 01_SCORM': [26, 30], 'NSHM_K2_TA_DGNL_T01_2025-2026_SCORM12': [32, 45], 'NSHM_K2_TA_DGNL_T01_2025-2026_SCORM12_CAP_NHAT_PIN': [32, 45],
  NSHM_TOAN_LOP2_PHIEU_BAI_CUOI_TUAN_SCORM12: [10, 10], THPT_HSA2025_TIENGANH_SCORM: [50, 50], THPT_HSA2025_TOAN_SCORM: [50, 50], THPT_HSA2025_VAN_SCORM: [50, 50]
};

const zips = fs.existsSync(DL) ? fs.readdirSync(DL).filter(f => /SCORM.*\.zip$/i.test(f)).sort() : [];
zips.forEach(f => {
  test('gói thật: ' + f, async () => {
    const ten = f.replace(/\.zip$/i, '');
    const r = await scorm.parseScorm(new Uint8Array(fs.readFileSync(path.join(DL, f))), { fileName: f, html: HTML_DUNG });
    assert.deepStrictEqual(r.issues, [], ten + ': lỗi cấp gói');
    assert.strictEqual(r.banks.length, 1);
    const b = r.banks[0];
    kiemNganHang(b, ten, false);
    const tong = Math.round(b.questions.reduce((a, q) => a + q.points, 0) * 1000) / 1000;
    b.warnings.forEach(w => assert.notStrictEqual(w.level, 'error', ten + ': ' + w.msg));
    const fj = path.join(CORPUS, ten + '.json');
    if (fs.existsSync(fj)) {
      const J = JSON.parse(fs.readFileSync(fj, 'utf8'));
      assert.strictEqual(b.scorm.variant, J.variant);
      const kv = kyVong(J);
      assert.deepStrictEqual(b.questions.map(q => q.no + ':' + q.type), kv.map(k => k.no + ':' + k.type), ten + ': danh sách câu');
      kv.forEach((k, i) => {
        try { k.check(b.questions[i]); } catch (e) { e.message = ten + ' ' + b.questions[i].id + ': ' + e.message; throw e; }
      });
      assert.strictEqual(tong, J.EXAM.maxScore, ten + ': tổng điểm');
    } else {
      console.log('    (không có corpus ' + ten + '.json — chỉ so số câu/điểm)');
    }
    if (BIET[ten]) assert.deepStrictEqual([b.questions.length, tong], BIET[ten], ten + ': số câu / tổng điểm');
    // giải mã HSA kiểm độc lập với corpus (bảng KEYS trong local-corpus.md)
    if (ten === 'THPT_HSA2025_TOAN_SCORM') {
      const Q = {}; b.questions.forEach(q => { Q[q.no] = q; });
      assert.ok(Q['1'].answers.includes('25'));
      assert.strictEqual(Q['2'].choices.find(c => c.correct).id, 'B');
      assert.ok(Q['3'].answers.includes('5575'));
      assert.strictEqual(Q['5'].choices.find(c => c.correct).id, 'C');
      assert.ok(['8/3', '2,67', '2.67', '2,666', '2,6667'].every(a => Q['9'].answers.includes(a)));
      assert.ok(/<math\b/.test(Q['32'].stem) && /font-size:2\.9em/.test(Q['32'].stem), 'MathML + mo.hemo inline');
    }
    if (ten === 'K12_HOAHOC_DGNL_T07_MD0301_SCORM') {
      const can = b.questions.filter(q => /nguyên tử khối/.test(q.stimulus)).map(q => q.id);
      ['p3_q02', 'p3_q06', 'p2_q01', 'p2_q02', 'p2_q03'].forEach(id => assert.ok(can.includes(id), 'thiếu bảng nguyên tử khối ở ' + id));
      assert.ok(!can.includes('p1_q02'));
      assert.ok(b.questions.find(q => q.id === 'p1_q11').stem.includes('border:1px solid #b9c4d8'), 'bảng mini phải có viền nội tuyến');
    }
    if (ten === 'K2_TIENGANH_DGNL_T01_MD01_SCORM') {
      const q36 = b.questions.find(q => q.no === '36');
      assert.ok(q36.answers.includes("It's in front of the box") && q36.points === 2);
      assert.deepStrictEqual(b.questions.find(q => q.no === '11–15').distractors, ['G. is'], 'F là ví dụ → không làm nhiễu');
      assert.deepStrictEqual(b.questions.find(q => q.no === '6–10').dropdowns[0].options, ['play soccer', 'ride a bike', 'a tub', 'a bookcase', 'a door']);
    }
    if (ten === 'NSHM_TOAN_LOP2_PHIEU_BAI_CUOI_TUAN_SCORM12') {
      const q7 = b.questions.find(q => q.no === '7');
      assert.ok(q7.issues.some(x => x.level === 'warn' && /SVG/.test(x.msg)));
      assert.ok(/\[Hình vẽ: /.test(q7.stem));
    }
    if (/^NSHM_K2_TA/.test(ten)) {
      assert.ok(b.questions.filter(q => q.type === 'short').every(q => q.issues.some(x => x.level === 'warn' && /sắp xếp/.test(x.msg))));
      assert.deepStrictEqual(b.questions.find(q => q.no === '11–15').distractors, ['G. is']);
    }
  });
});

/* ---------- chạy ---------- */
(async () => {
  let hong = 0;
  if (!HTML) console.log('  (chưa có js/html.js — dùng bản giả cleanForCanvas/toPlainText)');
  if (!zips.length) console.log('  (không thấy gói *SCORM*.zip trong ' + DL + ')');
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ĐẠT  ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 6).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong + '/' : 'ĐẠT ') + ds.length + ' kiểm thử scorm');
  process.exitCode = hong ? 1 : 0;
})();
