/* server.js — máy chủ chạy thử cục bộ, không thư viện: phục vụ file tĩnh của dự án
 * + gắn cùng handler api/canvas.js tại /api/canvas (giống Vercel). Đọc biến môi trường từ .env nếu có.
 * Chạy: node server.js   (cổng 8787, đổi bằng PORT; HOST mặc định 127.0.0.1) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const GOC = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.qti': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.wasm': 'application/wasm',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

/* ---------- .env ---------- */

// Parser nhỏ: KEY=VALUE, bỏ dòng trống/#, hỗ trợ "export ", '...' (nguyên văn), "..." (\n \t \" \\), # chú thích sau giá trị trần
function parseEnv(text) {
  const kq = {};
  String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach(function (dong) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(dong);
    if (!m) return;
    let v = m[2];
    if (v[0] === '"') {
      const j = timDongNgoac(v);
      v = j < 0 ? v.slice(1) : v.slice(1, j);
      v = v.replace(/\\([nrt"\\])/g, function (_, c) { return c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c; });
    } else if (v[0] === "'") {
      const j = v.indexOf("'", 1);
      v = j < 0 ? v.slice(1) : v.slice(1, j);
    } else {
      v = v.replace(/\s+#.*$/, '').trim();
    }
    kq[m[1]] = v;
  });
  return kq;
}
function timDongNgoac(v) {
  for (let i = 1; i < v.length; i++) {
    if (v[i] === '\\') { i++; continue; }
    if (v[i] === '"') return i;
  }
  return -1;
}

// Nạp .env vào env (không ghi đè biến đã có). Trả về số biến đã nạp.
function loadEnv(file, env) {
  env = env || process.env;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return 0; }
  const o = parseEnv(text);
  let n = 0;
  Object.keys(o).forEach(function (k) { if (env[k] === undefined) { env[k] = o[k]; n++; } });
  return n;
}

/* ---------- file tĩnh ---------- */

function guiLoi(res, status, msg) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(msg);
}

// Trả về đường dẫn tuyệt đối an toàn trong thư mục gốc, hoặc null nếu bị từ chối
function duongDanAnToan(goc, rawUrl) {
  const raw = String(rawUrl || '/').split('?')[0].split('#')[0];
  let p;
  try { p = decodeURIComponent(raw); } catch (e) { return null; }
  if (p[0] !== '/' || /[\x00-\x1f\\:*?"<>|]/.test(p)) return null;   // \ và : (ổ đĩa, ADS) trên Windows
  const doan = p.split('/');
  // không cho .. và mọi thứ bắt đầu bằng dấu chấm (.env, .git, .vercel…)
  if (doan.some(function (d) { return d === '..' || d[0] === '.'; })) return null;
  const full = path.resolve(goc, '.' + p);
  const rel = path.relative(goc, full);
  if (rel && (rel.split(path.sep)[0] === '..' || path.isAbsolute(rel))) return null;
  return full;
}

function phucVuTinh(goc, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return guiLoi(res, 405, 'Phương thức không được phép'); }
  const raw = String(req.url || '/').split('?')[0];
  // mã nguồn hàm máy chủ không phục vụ như file tĩnh (giống Vercel)
  if (/^\/api(\/|$)/i.test(raw)) return guiLoi(res, 404, 'Không tìm thấy');
  let full = duongDanAnToan(goc, raw);
  if (!full) return guiLoi(res, 403, 'Đường dẫn bị từ chối');
  fs.stat(full, function (err, st) {
    if (!err && st.isDirectory()) {
      if (!/\/$/.test(raw)) { res.statusCode = 301; res.setHeader('Location', raw + '/'); return res.end(); }
      full = path.join(full, 'index.html');
      return fs.stat(full, function (e2, st2) { guiFile(goc, full, e2 ? null : st2, req, res); });
    }
    guiFile(goc, full, err ? null : st, req, res);
  });
}

function guiFile(goc, full, st, req, res) {
  if (!st || !st.isFile()) return guiLoi(res, 404, 'Không tìm thấy');
  // chặn liên kết tượng trưng trỏ ra ngoài thư mục gốc
  fs.realpath(full, function (e, thuc) {
    let gocThuc = goc;
    try { gocThuc = fs.realpathSync(goc); } catch (x) { /* giữ goc */ }
    const rel = e ? '..' : path.relative(gocThuc, thuc);
    if (!rel || rel.split(path.sep)[0] === '..' || path.isAbsolute(rel)) return guiLoi(res, 403, 'Đường dẫn bị từ chối');
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', st.size);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') return res.end();
    const s = fs.createReadStream(full);
    s.on('error', function () { res.destroy(); });
    s.pipe(res);
  });
}

/* ---------- máy chủ ---------- */

function createServer(opts) {
  opts = opts || {};
  const goc = path.resolve(opts.root || GOC);
  const handler = opts.handler || require('./api/canvas.js');
  const ghiLog = opts.log === undefined ? false : opts.log;
  return http.createServer(function (req, res) {
    const raw = String(req.url || '/');
    const pathname = raw.split('?')[0];
    if (ghiLog) {
      // chỉ ghi op, không ghi query (callback có mã OAuth)
      res.on('finish', function () {
        const op = /^\/api\/canvas\/?$/.test(pathname) ? '?op=' + (/[?&]op=([a-z_]+)/.exec(raw) || [])[1] : '';
        console.log(req.method + ' ' + pathname + op + ' → ' + res.statusCode);
      });
    }
    if (/^\/api\/canvas\/?$/.test(pathname)) {
      Promise.resolve().then(function () { return handler(req, res); }).catch(function () {
        if (!res.headersSent) guiLoi(res, 500, 'Lỗi máy chủ'); else res.end();
      });
      return;
    }
    try { phucVuTinh(goc, req, res); } catch (e) { if (!res.headersSent) guiLoi(res, 500, 'Lỗi máy chủ'); }
  });
}

if (require.main === module) {
  const n = loadEnv(path.join(GOC, '.env'));
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '127.0.0.1';
  createServer({ log: true }).listen(port, host, function () {
    console.log('Ngân hàng câu hỏi Canvas — http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + port + '/');
    console.log(n ? 'Đã nạp ' + n + ' biến từ .env' : 'Không có .env (kết nối Canvas tắt — xem .env.example)');
  });
}

module.exports = { createServer: createServer, parseEnv: parseEnv, loadEnv: loadEnv, MIME: MIME, safePath: duongDanAnToan };
