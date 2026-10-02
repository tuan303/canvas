/* tests/nap-trang.test.cjs — index.html nạp được không lỗi (không cần trình duyệt):
 * 1) mọi <script src> có thật, đúng thứ tự DESIGN §0; 2) cú pháp mọi file JS (node --check);
 * 3) nạp các script theo thứ tự trong vm kiểu trình duyệt (không module/require): module xử lý KHÔNG chạm
 *    document/window/storage/navigator/location lúc nạp — chỉ canvas-api.js và app.js được phép;
 * 4) mọi NH.<module> có mặt với đúng hàm công khai. Chạy: node tests/nap-trang.test.cjs */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const GOC = path.resolve(__dirname, '..');
const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

const THU_TU = ['core', 'zip', 'html', 'math', 'omml', 'latex', 'docx', 'xlsx', 'scorm', 'qti', 'canvas-api', 'app'];
const RE_LS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']'); // U+2028/2029 thô làm hỏng regex/chuỗi JS cũ
const DUOC_DOM = ['js/canvas-api.js', 'js/app.js'];   // DESIGN §0: chỉ giao diện được dùng DOM

function scriptCua(trang) {
  const s = fs.readFileSync(path.join(GOC, trang), 'utf8');
  return [...s.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>/gi)].map(m => m[1]);
}

test('index.html: mọi <script src> tồn tại, cục bộ, đúng thứ tự core → … → app', () => {
  const src = scriptCua('index.html');
  assert.deepStrictEqual(src, THU_TU.map(t => 'js/' + t + '.js'));
  src.forEach(s => assert.ok(fs.existsSync(path.join(GOC, s)), 'thiếu ' + s));
  // tài nguyên cục bộ khác được tham chiếu
  const html = fs.readFileSync(path.join(GOC, 'index.html'), 'utf8');
  [...html.matchAll(/\b(?:href|src)\s*=\s*"((?:assets|mau|js)\/[^"#?]+)"/g)].forEach(m => assert.ok(fs.existsSync(path.join(GOC, m[1])), 'index.html trỏ tới file không có: ' + m[1]));
  ['huong-dan.html'].forEach(f => assert.ok(fs.existsSync(path.join(GOC, f)), f));
});

test('cú pháp: node --check mọi file .js/.cjs (js/, api/, server.js, tests/, tools/)', () => {
  const tep = [];
  ['js', 'api', 'tests', 'tools', 'tests/fixtures/xlsx'].forEach(d => {
    const td = path.join(GOC, d);
    if (fs.existsSync(td)) fs.readdirSync(td).filter(f => /\.(c?js)$/.test(f)).forEach(f => tep.push(path.join(td, f)));
  });
  tep.push(path.join(GOC, 'server.js'));
  assert.ok(tep.length >= 25, 'quá ít file: ' + tep.length);
  const loi = [];
  tep.forEach(f => {
    const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) loi.push(path.relative(GOC, f) + ': ' + (r.stderr || '').split('\n').slice(0, 4).join(' | '));
  });
  assert.deepStrictEqual(loi, []);
  // script cổ điển (không import/export ở cấp cao nhất) — file:// chặn ES module
  fs.readdirSync(path.join(GOC, 'js')).filter(f => /\.js$/.test(f)).forEach(f => {
    const s = fs.readFileSync(path.join(GOC, 'js', f), 'utf8');
    assert.ok(!/^\s*(import|export)\s/m.test(s), 'js/' + f + ' dùng import/export');
    assert.ok(!RE_LS.test(s), 'js/' + f + ' có ký tự U+2028/U+2029 thô');
  });
});

// Ngữ cảnh "trình duyệt" tối giản: DOM/storage là bẫy ghi lại script nào chạm vào lúc nạp
function taoNguCanh() {
  const cham = [];
  let dangNap = '';
  const nghe = [];
  const docGia = {
    readyState: 'loading',
    addEventListener: (t, f) => nghe.push(t),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
    documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } }, body: null
  };
  const g = {
    console, TextEncoder, TextDecoder, setTimeout, clearTimeout, Promise, URL, Uint8Array, ArrayBuffer,
    fetch: () => Promise.reject(new Error('không có mạng trong test')),
    addEventListener: () => {}, removeEventListener: () => {}
  };
  const bay = { document: docGia, window: null, localStorage: {}, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { userAgent: 'test' }, location: { href: 'http://localhost/', search: '', hash: '', pathname: '/', origin: 'http://localhost' } };
  Object.keys(bay).forEach(k => Object.defineProperty(g, k, {
    configurable: true, enumerable: true,
    get() { cham.push(dangNap + ': ' + k); return k === 'window' ? g : bay[k]; }
  }));
  g.self = g;
  const ctx = vm.createContext(g);
  return {
    ctx, g, cham, nghe,
    nap(rel) { dangNap = rel; vm.runInContext(fs.readFileSync(path.join(GOC, rel), 'utf8'), ctx, { filename: rel }); dangNap = ''; }
  };
}

test('nạp theo thứ tự index.html trong vm kiểu trình duyệt: module xử lý không chạm DOM lúc nạp', () => {
  const n = taoNguCanh();
  scriptCua('index.html').forEach(s => n.nap(s));
  const sai = n.cham.filter(c => !DUOC_DOM.some(d => c.startsWith(d + ':')));
  assert.deepStrictEqual(sai, [], 'module xử lý chạm DOM/storage lúc nạp');
  assert.ok(n.nghe.includes('DOMContentLoaded'), 'app.js phải chờ DOMContentLoaded khi trang đang nạp');
  const NH = n.g.NH;
  assert.ok(NH, 'không có self.NH');
  THU_TU.forEach(t => assert.ok(NH[t === 'canvas-api' ? 'canvasApi' : t], 'thiếu NH.' + t));
});

test('API công khai giữa các module (chữ ký DESIGN) có mặt sau khi nạp kiểu trình duyệt', () => {
  const n = taoNguCanh();
  scriptCua('index.html').forEach(s => n.nap(s));
  const NH = n.g.NH;
  const can = {
    core: ['parseXml', 'xmlText', 'find', 'findAll', 'children', 'escXml', 'escAttr', 'escHtml', 'nfc', 'slugAscii', 'hash6', 'bankIdent',
      'answerVariants', 'parsePoints', 'newIssue', 'validateQuestion', 'looksLikeHtml', 'utf8Encode', 'utf8Decode', 'crc32'],
    zip: ['readZip', 'writeZip'],
    html: ['cleanForCanvas', 'toPlainText'],
    math: ['mathmlToLatex', 'mathmlToText'],
    omml: ['toMathML', 'toText'],
    latex: ['toMathML', 'replaceDollar'],
    docx: ['parseDocx'], xlsx: ['parseXlsx'], scorm: ['parseScorm', 'makeIframeEvaluator'],
    qti: ['buildPackages', 'buildFiles', 'prepare', 'normalizeOptions'],
    canvasApi: ['getConfig', 'me', 'listCourses', 'listBanks', 'checkPermissions', 'importPackage', 'loginUrl', 'logout'],
    app: ['banksDeXuat', 'taoMuc', 'vanDeCau', 'locVanDeXuat', 'napFiles', 'state']
  };
  Object.keys(can).forEach(m => can[m].forEach(f => assert.strictEqual(typeof NH[m][f], 'function', 'NH.' + m + '.' + f)));
});

test('deploy: .vercelignore loại tests/docs/tools/.env*, .gitignore loại .env; README có đủ mục', () => {
  const vi = fs.readFileSync(path.join(GOC, '.vercelignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  ['/tests/', '/docs/', '/tools/', '.env*'].forEach(k => assert.ok(vi.includes(k), '.vercelignore thiếu ' + k));
  ['js', 'api', 'mau', 'assets'].forEach(d => assert.ok(!vi.some(k => k.replace(/^\/|\/$/g, '') === d), '.vercelignore không được loại ' + d));
  const gi = fs.readFileSync(path.join(GOC, '.gitignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  ['.env', 'node_modules/'].forEach(k => assert.ok(gi.includes(k), '.gitignore thiếu ' + k));
  const rd = fs.readFileSync(path.join(GOC, 'README.md'), 'utf8');
  ['## Cách dùng', '## Cấu trúc thư mục', '## Kiểm thử', '## Sinh lại file mẫu', '## Biến môi trường', '## Giới hạn',
    '## Việc cần nhà trường cung cấp để bật kết nối Canvas'].forEach(m => assert.ok(rd.includes(m), 'README thiếu "' + m + '"'));
  // mọi biến môi trường api/canvas.js đọc đều có trong README và .env.example
  const api = fs.readFileSync(path.join(GOC, 'api', 'canvas.js'), 'utf8'), vd = fs.readFileSync(path.join(GOC, '.env.example'), 'utf8');
  const bien = [...new Set([...api.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map(m => m[1]))];
  assert.ok(bien.includes('CANVAS_BASE_URL') && bien.includes('SESSION_SECRET'), 'không đọc được danh sách biến: ' + bien);
  bien.forEach(b => { assert.ok(rd.includes('`' + b + '`'), 'README thiếu biến ' + b); assert.ok(vd.includes(b + '='), '.env.example thiếu ' + b); });
});

test('huong-dan.html: script nội tuyến đúng cú pháp, không nạp script ngoài', () => {
  const s = fs.readFileSync(path.join(GOC, 'huong-dan.html'), 'utf8');
  const noi = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  noi.forEach((code, i) => assert.doesNotThrow(() => new vm.Script(code, { filename: 'huong-dan.html#script' + i })));
  scriptCua('huong-dan.html').forEach(src => assert.ok(!/^https?:/i.test(src) && fs.existsSync(path.join(GOC, src)), src));
});

(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (nap-trang)');
  process.exitCode = hong ? 1 : 0;
})();
