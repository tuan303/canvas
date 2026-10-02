/* api/canvas.js — hàm máy chủ Vercel (Node, CommonJS, không thư viện): OAuth2 với Canvas,
 * proxy API có allowlist, chuyển tiếp tải gói (dự phòng). Chọn thao tác bằng ?op=
 *   config | login | callback | logout (POST) | me | proxy (&path=/api/v1/...)
 *   | upload (POST &url=<upload_url>&course=<id>&migration=<id>)
 * Địa chỉ Canvas CHỈ lấy từ biến môi trường CANVAS_BASE_URL (chống SSRF). Không ghi log token.
 * Biến môi trường: CANVAS_BASE_URL, CANVAS_CLIENT_ID, CANVAS_CLIENT_SECRET, SESSION_SECRET, ALLOW_PERSONAL_TOKEN,
 *   APP_URL (địa chỉ công khai, dựng redirect_uri — nên đặt khi deploy), CANVAS_SCOPES (none = không gửi scope).
 * Đăng nhập luôn kèm PKCE S256 (Canvas có từ 2024; Canvas cũ hơn bỏ qua tham số này nên vẫn đăng nhập được). */
'use strict';
const crypto = require('crypto');

const COOKIE_PHIEN = 'nh_canvas';
const COOKIE_STATE = 'nh_canvas_st';
// Trên https cookie mang tiền tố __Host- (bắt buộc Secure, Path=/, không Domain) → tên miền con/anh em
// không "ném" cookie phiên/state giả vào được (chống đăng nhập nhầm tài khoản kẻ gian)
const TIEN_TO_HOST = '__Host-';
const TUOI_PHIEN = 12 * 3600;            // giây: phiên đăng nhập sống tối đa 12 giờ
const TUOI_STATE = 600;                  // giây: thời gian chờ người dùng bấm "Cho phép" trên Canvas
const GIOI_HAN_JSON = 256 * 1024;        // thân JSON gửi qua proxy
const GIOI_HAN_TAI = 4 * 1024 * 1024;    // thân multipart của op=upload (Vercel giới hạn 4,5 MB)
const GIOI_HAN_TRA = 4 * 1024 * 1024;    // phản hồi của Canvas chuyển lại cho trình duyệt (Vercel giới hạn 4,5 MB)
const HAN_GOI = 25000;                   // ms chờ Canvas trả lời
const LECH_GIO = 60 * 1000;              // làm mới token trước khi hết hạn 60 s
const LAM_MOI_TOI_DA = 2;                // số lần làm mới token trong MỘT yêu cầu (lần 2: yêu cầu song song đã làm mới trước)
const ACCEPT_CANVAS = 'application/json+canvas-string-ids, application/json';

// Phạm vi tối thiểu (rest-api.md §5b) — gửi MỘT tham số scope, ngăn bằng dấu cách.
// Chỉ xin đúng các endpoint công cụ dùng; Developer Key có thể bật nhiều scope hơn (xin tập con vẫn hợp lệ).
const SCOPES = [
  'url:GET|/api/v1/users/:id',
  'url:GET|/api/v1/courses',
  'url:GET|/api/v1/courses/:course_id/permissions',
  'url:GET|/api/v1/question_banks',
  'url:GET|/api/v1/courses/:course_id/content_migrations/migrators',
  'url:POST|/api/v1/courses/:course_id/content_migrations',
  'url:GET|/api/v1/courses/:course_id/content_migrations',
  'url:GET|/api/v1/courses/:course_id/content_migrations/:id',
  'url:GET|/api/v1/courses/:course_id/content_migrations/:content_migration_id/migration_issues',
  'url:GET|/api/v1/progress/:id'
];

// Allowlist proxy: [phương thức được phép, biểu thức đường dẫn (không gồm query)] — khớp SCOPES ở trên
const CHO_PHEP = [
  [['GET'], /^\/api\/v1\/users\/self$/],
  [['GET'], /^\/api\/v1\/courses$/],
  [['GET'], /^\/api\/v1\/courses\/\d{1,20}\/permissions$/],
  [['GET'], /^\/api\/v1\/courses\/\d{1,20}\/content_migrations\/migrators$/],
  [['GET', 'POST'], /^\/api\/v1\/courses\/\d{1,20}\/content_migrations$/],
  [['GET'], /^\/api\/v1\/courses\/\d{1,20}\/content_migrations\/\d{1,20}$/],
  [['GET'], /^\/api\/v1\/courses\/\d{1,20}\/content_migrations\/\d{1,20}\/migration_issues(\/\d{1,20})?$/],
  [['GET'], /^\/api\/v1\/question_banks$/],
  [['GET'], /^\/api\/v1\/progress\/\d{1,20}$/]
];
const RE_QUERY = /^[A-Za-z0-9_\-.~%=&+:,\[\]]*$/;
// Tham số Canvas đọc từ query/thân JSON làm đổi danh tính hay phương thức: as_user_id (giả danh — quản trị),
// access_token (token thứ hai), _method (đổi GET/POST thành DELETE/PUT) → không bao giờ chuyển tiếp
const RE_KHOA_CAM = /^(as_user_id|access_token|_method|api_key)$/i;
const RE_TOKEN = /^[A-Za-z0-9~._\-+/=]{8,512}$/;
const RE_STATE = /^[0-9a-f]{36}$/;
const RE_MA_OAUTH = /^[A-Za-z0-9._~\-]{1,512}$/;   // Canvas cấp SecureRandom.hex(64)
const RE_HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*|\[[0-9A-Fa-f:.]{2,45}\])(?::\d{1,5})?$/;
// Máy chủ nhận file của Canvas (ngoài chính máy Canvas): inst-fs của Instructure và bucket S3.
// KHÔNG mở cả *.instructure.com / *.amazonaws.com (Canvas trường khác, API Gateway, Lambda… của bất kỳ ai).
const RE_MAY_TAI = [
  /^[a-z0-9-]+(\.[a-z0-9-]+)*\.inscloudgate\.net$/,                         // inst-fs-<vùng>-prod.inscloudgate.net
  /^inst-fs[.-][a-z0-9.-]*\.instructure\.com$/,                              // inst-fs đời cũ
  /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\.s3([.-][a-z0-9-]+)?\.amazonaws\.com$/  // <bucket>.s3[.-<vùng>].amazonaws.com
];
// Tiêu đề của Canvas được chuyển lại (Content-Type xử lý riêng; Set-Cookie, Location… không bao giờ)
const HEADER_TRA_VE = ['link', 'x-rate-limit-remaining', 'x-request-cost', 'retry-after'];

/* ===================== Cấu hình ===================== */

function laMayCucBo(host) { return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'; }

function docCauHinh(env) {
  env = env || process.env;
  const ch = { base: null, host: null, oauth: false, personal: false, loi: null, loiOauth: null };
  const raw = String(env.CANVAS_BASE_URL || '').trim();
  if (!raw) { ch.loi = 'Máy chủ chưa cấu hình CANVAS_BASE_URL (địa chỉ Canvas của trường).'; return ch; }
  let u;
  try { u = new URL(raw); } catch (e) { u = null; }
  if (!u || !(u.protocol === 'https:' || (u.protocol === 'http:' && laMayCucBo(u.hostname))) || u.username || u.password) {
    ch.loi = 'CANVAS_BASE_URL không hợp lệ — cần dạng https://<trường>.instructure.com';
    return ch;
  }
  ch.base = u.origin;
  ch.host = u.hostname;
  ch.port = u.port;
  ch.clientId = String(env.CANVAS_CLIENT_ID || '').trim();
  ch.clientSecret = String(env.CANVAS_CLIENT_SECRET || '').trim();
  ch.secret = String(env.SESSION_SECRET || '');
  if (!ch.clientId || !ch.clientSecret) ch.loiOauth = 'Chưa cấu hình CANVAS_CLIENT_ID / CANVAS_CLIENT_SECRET (Developer Key).';
  else if (ch.secret.length < 16) ch.loiOauth = 'SESSION_SECRET phải dài ít nhất 16 ký tự (nên 32+ ký tự ngẫu nhiên).';
  // APP_URL: chỉ nhận gốc http(s) (có thể kèm đường dẫn con), không user:pass/query/#
  ch.appUrl = '';
  const app = String(env.APP_URL || '').trim();
  if (app) {
    let a;
    try { a = new URL(app); } catch (e) { a = null; }
    if (!a || !(a.protocol === 'https:' || (a.protocol === 'http:' && laMayCucBo(a.hostname))) || a.username || a.password || a.search || a.hash) {
      if (!ch.loiOauth) ch.loiOauth = 'APP_URL không hợp lệ — cần dạng https://<tên miền của web> (không có ?, #).';
    } else ch.appUrl = a.origin + a.pathname.replace(/\/+$/, '');
  }
  ch.oauth = !ch.loiOauth;
  ch.personal = /^(1|true|yes|on)$/i.test(String(env.ALLOW_PERSONAL_TOKEN || '').trim());
  ch.pkce = true;
  const sc = String(env.CANVAS_SCOPES || '').trim();
  ch.scopes = sc.toLowerCase() === 'none' ? [] : (sc ? sc.split(/\s+/) : SCOPES.slice());
  if (!ch.oauth && !ch.personal) ch.loi = ch.loiOauth || 'Chưa bật cách đăng nhập nào.';
  return ch;
}

/* ===================== Tiện ích HTTP ===================== */

// Mọi phản hồi của hàm: không lưu đệm, không đoán kiểu, không chạy được như trang (CSP sandbox), không lộ Referer
function tieuDeAnToan(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function guiJson(ctx, status, obj) {
  const res = ctx.res;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  tieuDeAnToan(res);
  datCookie(ctx);
  res.end(JSON.stringify(obj));
}

function chuyenHuong(ctx, url) {
  const res = ctx.res;
  res.statusCode = 302;
  res.setHeader('Location', url);
  tieuDeAnToan(res);
  datCookie(ctx);
  res.end();
}

function datCookie(ctx) {
  if (ctx.cookies.length && !ctx.res.headersSent) ctx.res.setHeader('Set-Cookie', ctx.cookies.slice());
}

function docCookie(req) {
  const kq = Object.create(null);   // cookie tên "__proto__"/"constructor" không đụng prototype
  String(req.headers.cookie || '').split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    if (!k || Object.prototype.hasOwnProperty.call(kq, k)) return;   // giữ cookie đầu tiên trùng tên
    let v = p.slice(i + 1).trim();
    if (v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1);
    try { kq[k] = decodeURIComponent(v); } catch (e) { kq[k] = v; }
  });
  return kq;
}

// x-forwarded-proto/-host: trên Vercel do nền tảng đặt (ghi đè giá trị client gửi); chạy cục bộ thì người gửi
// chỉ tự ảnh hưởng tới chính mình (redirect_uri sai → Canvas từ chối vì không khớp đúng Redirect URI của khoá)
function laHttps(req) {
  const xf = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return xf === 'https' || !!(req.socket && req.socket.encrypted);
}

// Tên cookie thật: __Host-<tên> trên https; tên trần khi chạy http cục bộ
function tenCookie(ctx, ten) { return (laHttps(ctx.req) ? TIEN_TO_HOST : '') + ten; }
function docCookieTen(ctx, ten) { return docCookie(ctx.req)[tenCookie(ctx, ten)]; }

function chuoiCookie(ctx, ten, giaTri, tuoi) {
  return tenCookie(ctx, ten) + '=' + giaTri + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + tuoi + (laHttps(ctx.req) ? '; Secure' : '');
}

function goc(req, ch) {
  if (ch.appUrl) return ch.appUrl;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  if (!RE_HOST.test(host)) throw loiHttp(400, 'Tên miền của yêu cầu không hợp lệ — hãy đặt APP_URL.', 'chua_cau_hinh');
  return (laHttps(req) ? 'https' : 'http') + '://' + host;
}
function redirectUri(req, ch) { return goc(req, ch) + '/api/canvas?op=callback'; }

// Đọc thân yêu cầu (dùng req.body nếu Vercel đã đọc sẵn), giới hạn kích thước
function docThan(req, gioiHan) {
  let san;
  try { san = req.body; } catch (e) { return Promise.reject(loiHttp(400, 'Thân yêu cầu không hợp lệ.')); }
  if (san !== undefined && san !== null) {
    let b;
    if (Buffer.isBuffer(san)) b = san;
    else if (san instanceof Uint8Array) b = Buffer.from(san.buffer, san.byteOffset, san.byteLength);
    else if (typeof san === 'string') b = Buffer.from(san, 'utf8');
    else b = Buffer.from(JSON.stringify(san), 'utf8');
    return b.length > gioiHan ? Promise.reject(loiHttp(413, 'Dữ liệu gửi lên quá lớn.')) : Promise.resolve(b);
  }
  const cl = Number(req.headers['content-length']);
  if (cl > gioiHan) return Promise.reject(loiHttp(413, 'Dữ liệu gửi lên quá lớn.'));
  if (req.readableEnded) return Promise.resolve(Buffer.alloc(0));
  return new Promise(function (ok, loi) {
    const phan = [];
    let tong = 0, xong = false;
    req.on('data', function (c) {
      if (xong) return;
      tong += c.length;
      if (tong > gioiHan) { xong = true; loi(loiHttp(413, 'Dữ liệu gửi lên quá lớn.')); req.resume(); return; }
      phan.push(c);
    });
    req.on('end', function () { if (!xong) { xong = true; ok(Buffer.concat(phan)); } });
    req.on('error', function (e) { if (!xong) { xong = true; loi(e); } });
  });
}

function loiHttp(status, msg, code) { const e = new Error(msg); e.status = status; if (code) e.code = code; return e; }

function soSanhAnToan(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ===================== Mã hoá cookie phiên (AES-256-GCM) ===================== */

const boNhoKhoa = new Map();
function khoaTuBiMat(secret) {
  let k = boNhoKhoa.get(secret);
  if (!k) {
    // scrypt chậm có chủ đích → nhớ khoá theo bí mật để mỗi yêu cầu không phải tính lại
    k = crypto.scryptSync(String(secret), 'canvas-nganhang/phien/v1', 32);
    if (boNhoKhoa.size > 8) boNhoKhoa.clear();
    boNhoKhoa.set(secret, k);
  }
  return k;
}

function b64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function tuB64url(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

function encryptSession(obj, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', khoaTuBiMat(secret), iv);
  c.setAAD(Buffer.from(COOKIE_PHIEN));
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final()]);
  return 'v1.' + b64url(Buffer.concat([iv, c.getAuthTag(), ct]));
}

// Trả null nếu sai định dạng, sai khoá, bị sửa, hoặc đã quá hạn phiên
function decryptSession(val, secret, now) {
  if (typeof val !== 'string' || val.slice(0, 3) !== 'v1.' || !secret || !/^[A-Za-z0-9_-]+$/.test(val.slice(3))) return null;
  try {
    const b = tuB64url(val.slice(3));
    if (b.length < 12 + 16 + 2) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', khoaTuBiMat(secret), b.subarray(0, 12));
    d.setAAD(Buffer.from(COOKIE_PHIEN));
    d.setAuthTag(b.subarray(12, 28));
    const o = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
    if (!o || typeof o !== 'object' || typeof o.access_token !== 'string') return null;
    // phiên luôn có hạn tuyệt đối (exp) — thiếu exp = không hợp lệ, không bao giờ "sống mãi"
    if (typeof o.exp !== 'number' || !((now || Date.now()) <= o.exp)) return null;
    return o;
  } catch (e) { return null; }
}

/* ===================== PKCE (RFC 7636, S256 — Canvas hỗ trợ từ 2024: lib/canvas/oauth/pkce.rb) ===================== */

// code_verifier suy ra từ state bằng HMAC(SESSION_SECRET) → không cần lưu thêm; lộ state (URL, nhật ký) không lộ verifier.
// 43 ký tự base64url — đúng miền [A-Za-z0-9-._~]{43,128} của RFC 7636.
function pkceVerifier(state, secret) {
  return b64url(crypto.createHmac('sha256', String(secret)).update('canvas-nganhang/pkce/v1:' + state).digest());
}
// Canvas so: Base64.urlsafe_encode64(SHA256(verifier), padding: false) == code_challenge
function pkceChallenge(verifier) { return b64url(crypto.createHash('sha256').update(String(verifier)).digest()); }

/* ===================== Kiểm tra đường dẫn / địa chỉ tải ===================== */

// → { pathname, query } hoặc { loi, status }
function checkProxyPath(p, method) {
  if (typeof p !== 'string' || !p) return { status: 400, loi: 'Thiếu tham số path.' };
  if (p.length > 2048) return { status: 400, loi: 'Đường dẫn quá dài.' };
  if (p.slice(0, 8) !== '/api/v1/') return { status: 403, loi: 'Chỉ cho phép đường dẫn /api/v1/… của Canvas.' };
  if (/[\s\\#@]|[\x00-\x1f\x7f]/.test(p) || /\.\.|\/\//.test(p)) return { status: 403, loi: 'Đường dẫn không hợp lệ.' };
  const i = p.indexOf('?');
  const pathname = i < 0 ? p : p.slice(0, i);
  const query = i < 0 ? '' : p.slice(i + 1);
  if (/%/.test(pathname)) return { status: 403, loi: 'Đường dẫn không hợp lệ.' };
  if (!RE_QUERY.test(query)) return { status: 403, loi: 'Tham số truy vấn không hợp lệ.' };
  if (query && query.split('&').some(function (t) { return laKhoaCam(t.split('=')[0]); })) {
    return { status: 403, loi: 'Tham số truy vấn không được phép (giả danh / token / đổi phương thức).' };
  }
  const muc = CHO_PHEP.filter(function (m) { return m[1].test(pathname); });
  if (!muc.length) return { status: 403, loi: 'Đường dẫn không nằm trong danh sách được phép: ' + pathname };
  if (!muc.some(function (m) { return m[0].indexOf(method) >= 0; })) return { status: 405, loi: 'Phương thức ' + method + ' không được phép cho ' + pathname };
  return { pathname: pathname, query: query };
}

// Tên tham số (đã giải mã %, bỏ hậu tố [] / %5B…) thuộc danh sách cấm?
function laKhoaCam(k) {
  let s = String(k || '');
  try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { /* để nguyên */ }
  return RE_KHOA_CAM.test(s.replace(/\[.*$/, '').trim());
}

function isAllowedUploadUrl(s, ch) {
  let u;
  try { u = new URL(String(s)); } catch (e) { return false; }
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (h === ch.host) {
    // chính máy Canvas (lưu trữ cục bộ): cùng giao thức + cổng với CANVAS_BASE_URL
    return u.origin === ch.base;
  }
  if (u.protocol !== 'https:' || (u.port && u.port !== '443')) return false;
  return RE_MAY_TAI.some(function (re) { return re.test(h); });
}

/* ===================== Xác thực + gọi Canvas ===================== */

function layXacThuc(ctx) {
  const ch = ctx.ch;
  const tk = ctx.req.headers['x-canvas-token'];
  if (ch.personal && typeof tk === 'string' && tk.trim()) {
    const t = tk.trim().replace(/^Bearer\s+/i, '');
    if (!RE_TOKEN.test(t)) throw loiHttp(400, 'Token cá nhân không hợp lệ.', 'token_sai');
    return { kieu: 'canhan', token: t };
  }
  if (ch.oauth) {
    const p = decryptSession(docCookieTen(ctx, COOKIE_PHIEN), ch.secret);
    if (p) return { kieu: 'oauth', token: p.access_token, phien: p };
  }
  return null;
}

// 401 do token (sai / hết hạn / bị thu hồi) có WWW-Authenticate: Bearer…; 401 do token thiếu scope thì không
// (Canvas application_controller#api_error_json) → chỉ làm mới token với loại thứ nhất
function laLoiToken(r) { return r.status === 401 && !!r.headers.get('www-authenticate'); }
function loiThieuScope(method, url) {
  let p = '';
  try { p = new URL(url).pathname.replace(/\/\d+(?=\/|$)/g, '/:id'); } catch (e) { /* bỏ qua */ }
  return loiHttp(403, 'Developer Key của Canvas chưa cấp quyền (scope) cho thao tác ' + method + ' ' + p +
    ' — báo quản trị Canvas thêm scope này vào khoá (hoặc tắt Enforce Scopes).', 'thieu_scope');
}

function fetchCanvas(url, init) {
  init = Object.assign({ redirect: 'manual' }, init);
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout && !init.signal) init.signal = AbortSignal.timeout(HAN_GOI);
  return fetch(url, init);
}

async function doiToken(ctx, thamSo) {
  const ch = ctx.ch;
  const body = new URLSearchParams(Object.assign({
    client_id: ch.clientId, client_secret: ch.clientSecret, redirect_uri: redirectUri(ctx.req, ch)
  }, thamSo));
  const r = await fetchCanvas(ch.base + '/login/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: body.toString()
  });
  if (!r.ok) return null;
  let j = null;
  try { j = await r.json(); } catch (e) { return null; }
  return j && typeof j.access_token === 'string' && j.access_token ? j : null;
}

function luuPhien(ctx, p) {
  boCookieCu(ctx, COOKIE_PHIEN);
  ctx.cookies.push(chuoiCookie(ctx, COOKIE_PHIEN, encryptSession(p, ctx.ch.secret), p.exp ? Math.max(1, Math.floor((p.exp - Date.now()) / 1000)) : TUOI_PHIEN));
}
function xoaPhien(ctx) { boCookieCu(ctx, COOKIE_PHIEN); ctx.cookies.push(chuoiCookie(ctx, COOKIE_PHIEN, '', 0)); }
// Một phản hồi chỉ đặt mỗi cookie MỘT lần (làm mới rồi đăng xuất trong cùng yêu cầu → chỉ giữ lệnh xoá)
function boCookieCu(ctx, ten) {
  const dau = tenCookie(ctx, ten) + '=';
  ctx.cookies = ctx.cookies.filter(function (c) { return c.slice(0, dau.length) !== dau; });
}

// Làm mới access_token bằng refresh_token; cập nhật cookie. Thất bại → xoá phiên, trả null.
// Canvas (khoá bí mật) KHÔNG trả refresh_token mới khi làm mới — giữ cái cũ; nhưng access_token cũ bị thay ngay
// (AccessToken#regenerate_access_token) → yêu cầu song song đang cầm token cũ sẽ gặp 401 và được làm mới lần 2.
async function lamMoi(ctx) {
  const xt = ctx.xt;
  if (!xt || xt.kieu !== 'oauth' || !xt.phien.refresh_token || ctx.soLanLamMoi >= LAM_MOI_TOI_DA || ctx.hetPhien) return null;
  ctx.soLanLamMoi++;
  // lỗi mạng → ném ra (502, giữ phiên); Canvas từ chối refresh_token → xoá phiên
  const j = await doiToken(ctx, { grant_type: 'refresh_token', refresh_token: xt.phien.refresh_token });
  if (!j) { xoaPhien(ctx); ctx.hetPhien = true; return null; }
  const p = Object.assign({}, xt.phien, {
    access_token: j.access_token,
    refresh_token: j.refresh_token || xt.phien.refresh_token,
    expires_at: j.expires_in ? Date.now() + Number(j.expires_in) * 1000 : null
  });
  xt.phien = p; xt.token = p.access_token;
  luuPhien(ctx, p);
  return p;
}

function sapHetHan(xt) { return xt.kieu === 'oauth' && xt.phien.expires_at && Date.now() > xt.phien.expires_at - LECH_GIO; }

// Gọi Canvas với token của phiên; tự làm mới trước khi hết hạn, và khi gặp 401 do token thì làm mới rồi thử lại
// (tối đa LAM_MOI_TOI_DA lần làm mới cho cả yêu cầu). 401 do thiếu scope → 403 thieu_scope, không làm mới.
async function goiCoXacThuc(ctx, url, init) {
  const xt = ctx.xt;
  if (sapHetHan(xt)) await lamMoi(ctx);
  if (ctx.hetPhien) throw loiHttp(401, 'Phiên Canvas đã hết hạn — hãy đăng nhập lại.', 'het_phien');
  const lam = function () {
    const h = Object.assign({ 'Accept': ACCEPT_CANVAS }, init.headers || {}, { 'Authorization': 'Bearer ' + xt.token });
    return fetchCanvas(url, Object.assign({}, init, { headers: h }));
  };
  let r = await lam();
  while (laLoiToken(r) && xt.kieu === 'oauth' && xt.phien.refresh_token && ctx.soLanLamMoi < LAM_MOI_TOI_DA) {
    try { await r.arrayBuffer(); } catch (e) { /* bỏ thân cũ */ }
    if (await lamMoi(ctx)) r = await lam();
    else throw loiHttp(401, 'Phiên Canvas đã hết hạn — hãy đăng nhập lại.', 'het_phien');
  }
  if (r.status === 401 && !laLoiToken(r)) {
    try { await r.arrayBuffer(); } catch (e) { /* bỏ thân */ }
    throw loiThieuScope(init.method || 'GET', url);
  }
  return r;
}

async function traVe(ctx, r) {
  const res = ctx.res;
  const cl = Number(r.headers.get('content-length'));
  if (cl > GIOI_HAN_TRA) throw loiHttp(502, 'Phản hồi của Canvas quá lớn.', 'qua_lon');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > GIOI_HAN_TRA) throw loiHttp(502, 'Phản hồi của Canvas quá lớn.', 'qua_lon');
  if (r.status >= 300 && r.status < 400) {
    // Canvas chuyển hướng API (thường do sai tên miền/giao thức) → lỗi cấu hình, không cho trình duyệt đi theo
    throw loiHttp(400, 'Canvas chuyển hướng sang địa chỉ khác — kiểm tra CANVAS_BASE_URL (đúng địa chỉ dùng để đăng nhập).', 'chua_cau_hinh');
  }
  res.statusCode = r.status;
  HEADER_TRA_VE.forEach(function (h) { const v = r.headers.get(h); if (v) res.setHeader(h, v); });
  // Chỉ chuyển kiểu JSON của Canvas; mọi kiểu khác (trang HTML lỗi…) thành chữ thuần — không bao giờ text/html
  const ct = String(r.headers.get('content-type') || '');
  res.setHeader('Content-Type', /^application\/(?:[a-z0-9.+-]*\+)?json\s*(;|$)/i.test(ct) ? ct : 'text/plain; charset=utf-8');
  tieuDeAnToan(res);
  datCookie(ctx);
  res.end(buf);
}

function canDangNhap(ctx) {
  if (!ctx.ch.oauth && !ctx.ch.personal) throw loiHttp(400, ctx.ch.loi, 'chua_cau_hinh');
  ctx.xt = layXacThuc(ctx);
  if (!ctx.xt) throw loiHttp(401, 'Chưa đăng nhập Canvas' + (ctx.ch.personal && !ctx.ch.oauth ? ' (dán token cá nhân).' : '.'), 'chua_dang_nhap');
}

function canTieuDeClient(ctx) {
  // Tiêu đề tự đặt buộc trình duyệt gửi preflight CORS (máy chủ không trả CORS) → chặn CSRF từ trang khác
  if (ctx.req.headers['x-nh-client'] !== '1') throw loiHttp(403, 'Thiếu tiêu đề X-NH-Client.', 'csrf');
  // Lớp thứ hai, không phụ thuộc CORS: trình duyệt hiện đại ghi rõ yêu cầu đến từ đâu (kể cả tên miền con cùng site)
  const sfs = String(ctx.req.headers['sec-fetch-site'] || '');
  if (sfs && sfs !== 'same-origin' && sfs !== 'none') throw loiHttp(403, 'Yêu cầu không đến từ trang của công cụ.', 'csrf');
}

/* ===================== Các thao tác ===================== */

function opConfig(ctx) {
  const ch = ctx.ch;
  const kq = { enabled: !!ch.base && (ch.oauth || ch.personal), base: ch.base, oauth: ch.oauth, personalToken: ch.personal, loggedIn: false, user: null };
  if (ch.oauth) {
    const p = decryptSession(docCookieTen(ctx, COOKIE_PHIEN), ch.secret);
    if (p) { kq.loggedIn = true; kq.user = p.user || null; }
  }
  if (!kq.enabled) kq.reason = ch.loi;
  else if (!ch.oauth && ch.loiOauth) kq.oauthReason = ch.loiOauth;
  return guiJson(ctx, 200, kq);
}

function opLogin(ctx) {
  const ch = ctx.ch;
  if (!ch.base) throw loiHttp(400, ch.loi, 'chua_cau_hinh');
  if (!ch.oauth) throw loiHttp(400, ch.loiOauth, 'chua_cau_hinh');
  const redirect = redirectUri(ctx.req, ch);   // Canvas so KHỚP NGUYÊN VĂN với Redirect URIs của Developer Key
  const state = crypto.randomBytes(18).toString('hex');
  ctx.cookies.push(chuoiCookie(ctx, COOKIE_STATE, state, TUOI_STATE));
  let q = 'client_id=' + encodeURIComponent(ch.clientId) +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(redirect) +
    '&state=' + state;
  if (ch.scopes.length) q += '&scope=' + encodeURIComponent(ch.scopes.join(' '));
  if (ch.pkce) q += '&code_challenge=' + pkceChallenge(pkceVerifier(state, ch.secret)) + '&code_challenge_method=S256';
  return chuyenHuong(ctx, ch.base + '/login/oauth2/auth?' + q);
}

// "…were requested, but not granted: url:GET|/a, url:GET|/b, and url:GET|/c" → các scope (khớp nguyên văn)
function scopeThieu(moTa, ds) {
  const m = /not granted:\s*([\s\S]*)$/i.exec(String(moTa || '').slice(0, 4000));
  if (!m) return [];
  const co = new Set(m[1].replace(/\.\s*$/, '').split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(s => s.trim()));
  return ds.filter(s => co.has(s));
}

async function opCallback(ctx, u) {
  const ch = ctx.ch;
  if (!ch.base) throw loiHttp(400, ch.loi, 'chua_cau_hinh');
  if (!ch.oauth) throw loiHttp(400, ch.loiOauth, 'chua_cau_hinh');
  const ve = ch.appUrl ? ch.appUrl + '/' : '/';
  const stateCookie = docCookieTen(ctx, COOKIE_STATE);
  // state chỉ dùng MỘT lần: xoá ngay cả khi lỗi
  ctx.cookies.push(chuoiCookie(ctx, COOKIE_STATE, '', 0));
  const err = u.searchParams.get('error');
  if (err) {
    if (err === 'access_denied') return chuyenHuong(ctx, ve + '?canvas=loi&ma=tu_choi');
    if (err === 'invalid_client' || err === 'unauthorized_client') return chuyenHuong(ctx, ve + '?canvas=loi&ma=key');
    if (err === 'invalid_scope') {
      // Canvas liệt kê scope chưa cấp trong error_description; chỉ chuyển tiếp scope có trong danh sách
      // của chính mình (không phản chiếu chữ tuỳ ý từ URL ra giao diện)
      const thieu = scopeThieu(u.searchParams.get('error_description'), ch.scopes);
      return chuyenHuong(ctx, ve + '?canvas=loi&ma=thieu_scope' + (thieu.length ? '&thieu=' + encodeURIComponent(thieu.join(' ')) : ''));
    }
    return chuyenHuong(ctx, ve + '?canvas=loi&ma=canvas');
  }
  const state = u.searchParams.get('state') || '';
  if (!RE_STATE.test(state) || !RE_STATE.test(stateCookie || '') || !soSanhAnToan(state, stateCookie)) return chuyenHuong(ctx, ve + '?canvas=loi&ma=state');
  const code = u.searchParams.get('code');
  if (!code) return chuyenHuong(ctx, ve + '?canvas=loi&ma=thieu_ma');
  if (!RE_MA_OAUTH.test(code)) return chuyenHuong(ctx, ve + '?canvas=loi&ma=doi_ma');
  const tham = { grant_type: 'authorization_code', code: code };
  if (ch.pkce) tham.code_verifier = pkceVerifier(state, ch.secret);
  let j = null;
  try { j = await doiToken(ctx, tham); } catch (e) { j = null; }
  if (!j) return chuyenHuong(ctx, ve + '?canvas=loi&ma=doi_ma');
  const now = Date.now();
  const p = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || null,
    expires_at: j.expires_in ? now + Number(j.expires_in) * 1000 : null,
    user: j.user ? { id: String(j.user.id), name: String(j.user.name || '') } : null,
    iat: now,
    exp: now + TUOI_PHIEN * 1000
  };
  luuPhien(ctx, p);
  return chuyenHuong(ctx, ve + '?canvas=ok');
}

// Chỉ POST + X-NH-Client (trang khác không bấm đăng xuất hộ được). Chỉ thu hồi token OAuth của phiên;
// KHÔNG bao giờ xoá token cá nhân của giáo viên.
async function opLogout(ctx) {
  const ch = ctx.ch;
  if (ctx.req.method !== 'POST') throw loiHttp(405, 'Chỉ nhận POST.');
  canTieuDeClient(ctx);
  let thuHoi = false;
  if (ch.oauth) {
    const p = decryptSession(docCookieTen(ctx, COOKIE_PHIEN), ch.secret);
    if (p) {
      ctx.xt = { kieu: 'oauth', token: p.access_token, phien: p };
      try { thuHoi = await thuHoiToken(ctx); } catch (e) { /* lỗi mạng: cookie vẫn bị xoá */ }
    }
    xoaPhien(ctx);
  }
  return guiJson(ctx, 200, { ok: true, revoked: thuHoi });
}

// DELETE /login/oauth2/token cần access_token CÒN DÙNG ĐƯỢC (hết hạn → Canvas trả 401 và không xoá gì,
// refresh_token vẫn sống) → làm mới trước nếu cần, rồi xoá; xoá AccessToken = refresh_token cũng chết.
async function thuHoiToken(ctx) {
  const xt = ctx.xt;
  if (sapHetHan(xt)) await lamMoi(ctx);
  if (ctx.hetPhien) return false;            // refresh_token đã bị thu hồi: không còn gì để xoá
  const xoa = function () {
    return fetchCanvas(ctx.ch.base + '/login/oauth2/token', {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + xt.token, 'Accept': 'application/json' }
    });
  };
  let r = await xoa();
  if (laLoiToken(r) && xt.phien.refresh_token) {
    await r.arrayBuffer();
    if (!(await lamMoi(ctx))) return false;
    r = await xoa();
  }
  await r.arrayBuffer();
  return r.ok;
}

async function opProxy(ctx, u, duongDanCoDinh) {
  const ch = ctx.ch;
  if (!ch.base) throw loiHttp(400, ch.loi, 'chua_cau_hinh');
  canTieuDeClient(ctx);
  const method = String(ctx.req.method || 'GET').toUpperCase();
  if (['GET', 'POST', 'PUT'].indexOf(method) < 0) throw loiHttp(405, 'Phương thức không được phép.');
  const kt = checkProxyPath(duongDanCoDinh || u.searchParams.get('path'), method);
  if (kt.loi) throw loiHttp(kt.status, kt.loi, 'khong_cho_phep');
  canDangNhap(ctx);
  const url = new URL(kt.pathname + (kt.query ? '?' + kt.query : ''), ch.base);
  if (url.origin !== ch.base || url.pathname !== kt.pathname) throw loiHttp(403, 'Đường dẫn không hợp lệ.', 'khong_cho_phep');
  const init = { method: method, headers: {} };
  if (method !== 'GET') {
    const ct = String(ctx.req.headers['content-type'] || '').toLowerCase();
    if (ct.indexOf('application/json') !== 0) throw loiHttp(415, 'Chỉ nhận thân JSON (Content-Type: application/json).');
    const buf = await docThan(ctx.req, GIOI_HAN_JSON);
    const s = buf.toString('utf8') || '{}';
    let o;
    try { o = JSON.parse(s); } catch (e) { throw loiHttp(400, 'Thân JSON không hợp lệ.'); }
    // Canvas gộp thân JSON vào params → as_user_id/access_token/_method trong thân cũng có hiệu lực
    if (o && typeof o === 'object' && Object.keys(o).some(laKhoaCam)) {
      throw loiHttp(403, 'Thân yêu cầu có tham số không được phép (giả danh / token / đổi phương thức).', 'khong_cho_phep');
    }
    init.headers['Content-Type'] = 'application/json';
    init.body = s;
  }
  const r = await goiCoXacThuc(ctx, url.href, init);
  return traVe(ctx, r);
}

// Lần nhập (content_migration) phải tồn tại, người dùng xem được và đang chờ gói (pre_processing):
// buộc op=upload gắn với một lần nhập thật của chính người đó — kể cả ở chế độ token cá nhân (token bất kỳ
// có dạng hợp lệ đều qua được canDangNhap, Canvas mới là nơi xác minh).
async function kiemLanNhapCho(ctx, khoaHoc, lanNhap) {
  const url = ctx.ch.base + '/api/v1/courses/' + khoaHoc + '/content_migrations/' + lanNhap;
  const r = await goiCoXacThuc(ctx, url, { method: 'GET', headers: {} });
  const t = await r.text();
  if (r.status === 401) throw loiHttp(401, ctx.xt.kieu === 'canhan' ? 'Token cá nhân không dùng được (sai hoặc đã hết hạn).' : 'Phiên Canvas đã hết hạn — hãy đăng nhập lại.', 'het_phien');
  if (r.status === 403 || r.status === 404) throw loiHttp(403, 'Không tìm thấy lần nhập này trên Canvas hoặc bạn không có quyền.', 'khong_cho_phep');
  if (!r.ok) throw loiHttp(502, 'Canvas không trả lời đúng khi kiểm tra lần nhập (mã ' + r.status + ').', 'mang');
  let m = null;
  try { m = JSON.parse(t); } catch (e) { m = null; }
  if (!m || String(m.id) !== String(lanNhap) || m.workflow_state !== 'pre_processing') {
    throw loiHttp(409, 'Lần nhập này không còn chờ gói tải lên — hãy gửi lại từ đầu.', 'trang_thai');
  }
}

async function opUpload(ctx, u) {
  const ch = ctx.ch;
  if (!ch.base) throw loiHttp(400, ch.loi, 'chua_cau_hinh');
  canTieuDeClient(ctx);
  if (ctx.req.method !== 'POST') throw loiHttp(405, 'Chỉ nhận POST.');
  const dich = u.searchParams.get('url') || '';
  if (!isAllowedUploadUrl(dich, ch)) throw loiHttp(403, 'Địa chỉ tải lên không thuộc máy chủ của Canvas.', 'khong_cho_phep');
  canDangNhap(ctx);   // không cho dùng máy chủ như proxy mở
  const khoaHoc = u.searchParams.get('course') || '', lanNhap = u.searchParams.get('migration') || '';
  if (!/^\d{1,20}$/.test(khoaHoc) || !/^\d{1,20}$/.test(lanNhap)) throw loiHttp(400, 'Thiếu mã khoá học / lần nhập (course, migration).', 'tham_so');
  // Client gửi multipart dựng sẵn dưới dạng application/octet-stream (Vercel chỉ giữ req.body cho kiểu này),
  // Content-Type thật (có boundary) nằm trong X-Upload-Content-Type. Nhận cả multipart trực tiếp (server.js).
  let ct = String(ctx.req.headers['content-type'] || '');
  if (/^application\/octet-stream\b/i.test(ct)) ct = String(ctx.req.headers['x-upload-content-type'] || '');
  if (!/^multipart\/form-data;\s*boundary=("?)[A-Za-z0-9'()+_,\-./:=? ]{1,70}\1$/i.test(ct)) throw loiHttp(415, 'Cần thân multipart/form-data.');
  const buf = await docThan(ctx.req, GIOI_HAN_TAI);
  await kiemLanNhapCho(ctx, khoaHoc, lanNhap);
  // Gửi nguyên thân multipart (upload_params đã ký + file cuối) tới máy lưu trữ; KHÔNG kèm token Canvas
  const r = await fetchCanvas(dich, { method: 'POST', headers: { 'Content-Type': ct }, body: buf });
  const kq = { ok: false, status: r.status, confirmed: false };
  if (r.status >= 300 && r.status < 400) {
    await r.arrayBuffer();
    // S3/lưu trữ cục bộ: phải GET Location (create_success) để Canvas ghi nhận file
    const loc = r.headers.get('location');
    let lu = null;
    try { lu = loc ? new URL(loc, dich) : null; } catch (e) { lu = null; }
    if (!lu || lu.origin !== ch.base || !/^\/api\/v1\/files\/\d{1,20}\/create_success$/.test(lu.pathname) || !RE_QUERY.test(lu.search.slice(1))) {
      throw loiHttp(400, 'Máy lưu trữ chuyển hướng tới địa chỉ lạ — không xác nhận được tệp.', 'xac_nhan');
    }
    const xt = ctx.xt;
    if (sapHetHan(xt)) await lamMoi(ctx);
    let r2 = await fetchCanvas(lu.href, { method: 'GET', headers: { 'Accept': ACCEPT_CANVAS, 'Authorization': 'Bearer ' + ctx.xt.token } });
    if (r2.status === 401) {
      // khoá bật Enforce Scopes có thể chặn endpoint này; create_success tự xác thực bằng id + uuid
      await r2.arrayBuffer();
      r2 = await fetchCanvas(lu.href, { method: 'GET', headers: { 'Accept': ACCEPT_CANVAS } });
    }
    const t2 = await r2.text();
    if (!r2.ok) throw loiHttp(r2.status >= 500 ? 502 : 400, 'Canvas không xác nhận được tệp đã tải (mã ' + r2.status + ').', 'xac_nhan');
    kq.ok = true; kq.confirmed = true;
    try { kq.file = JSON.parse(t2); } catch (e) { kq.file = null; }
    return guiJson(ctx, 200, kq);
  }
  const t = await r.text();
  if (!r.ok) {
    return guiJson(ctx, r.status >= 500 ? 502 : (r.status >= 400 ? r.status : 400), {
      error: 'Máy lưu trữ của Canvas từ chối gói (mã ' + r.status + ').', code: 'tai_len', detail: t.slice(0, 300)
    });
  }
  kq.ok = true;
  try { kq.file = t ? JSON.parse(t) : null; } catch (e) { kq.file = null; }
  return guiJson(ctx, 200, kq);
}

/* ===================== Điểm vào ===================== */

async function handler(req, res) {
  const ctx = { req: req, res: res, ch: null, cookies: [], xt: null, soLanLamMoi: 0, hetPhien: false };
  try {
    const u = new URL(req.url || '/', 'http://may-chu.local');
    const op = u.searchParams.get('op') || '';
    ctx.ch = docCauHinh(process.env);
    if (req.method === 'OPTIONS') throw loiHttp(405, 'Không hỗ trợ CORS.');
    switch (op) {
      case 'config': return opConfig(ctx);
      case 'login': return opLogin(ctx);
      case 'callback': return await opCallback(ctx, u);
      case 'logout': return await opLogout(ctx);
      case 'me': return await opProxy(ctx, u, '/api/v1/users/self');
      case 'proxy': return await opProxy(ctx, u);
      case 'upload': return await opUpload(ctx, u);
      default: throw loiHttp(404, 'Thao tác không hợp lệ: op=' + op.replace(/[^a-z_]/gi, '').slice(0, 20), 'op_sai');
    }
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (x) { /* đã đóng */ } return; }
    if (e && e.status) return guiJson(ctx, e.status, { error: e.message, code: e.code || undefined });
    // lỗi mạng tới Canvas (không lộ chi tiết nội bộ, không ghi token)
    const mang = e && (e.name === 'TimeoutError' || e.name === 'AbortError' || e.name === 'TypeError' || /fetch|ECONN|ENOTFOUND/i.test(String(e.message)));
    return guiJson(ctx, 502, {
      error: mang ? 'Không kết nối được tới Canvas — kiểm tra CANVAS_BASE_URL hoặc thử lại sau.' : 'Lỗi máy chủ trung gian.',
      code: mang ? 'mang' : 'loi'
    });
  }
}

module.exports = handler;
// Phục vụ kiểm thử (không phải API công khai)
module.exports._internal = {
  encryptSession: encryptSession, decryptSession: decryptSession, checkProxyPath: checkProxyPath,
  isAllowedUploadUrl: isAllowedUploadUrl, readConfig: docCauHinh, parseCookies: docCookie,
  pkceVerifier: pkceVerifier, pkceChallenge: pkceChallenge, isForbiddenParam: laKhoaCam,
  SCOPES: SCOPES, scopeThieu: scopeThieu, COOKIE_SESSION: COOKIE_PHIEN, COOKIE_STATE: COOKIE_STATE, COOKIE_HOST_PREFIX: TIEN_TO_HOST,
  UPLOAD_MAX: GIOI_HAN_TAI
};
