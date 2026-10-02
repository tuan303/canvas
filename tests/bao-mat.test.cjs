/* tests/bao-mat.test.cjs — kiểm thử bảo mật: api/canvas.js (SSRF, header, kích thước, op=upload, OAuth/PKCE/state,
 * cookie __Host- + AES-GCM, làm mới token song song, thu hồi khi đăng xuất, lỗi không lộ bí mật, đặc thù Vercel),
 * server.js (path traversal kể cả tên ngắn 8.3 của Windows, DNS rebinding, bind 127.0.0.1, MIME),
 * js/canvas-api.js (token chỉ ở sessionStorage, không vào URL, tải thẳng inst-fs không kèm token, xếp hàng yêu cầu),
 * js/scorm.js (iframe sandbox: nguồn/origin của thư, giới hạn kích thước; vm Node: lối thoát, hạn giờ),
 * html.cleanForCanvas (bộ mẫu XSS).
 * Canvas giả lập ở đây làm ĐÚNG như mã nguồn Canvas (oauth2_provider_controller.rb, pkce.rb, token.rb,
 * grant_types/refresh_token.rb, access_token.rb, application_controller#api_error_json, developer_key.rb
 * #redirect_domain_matches?): Redirect URI khớp nguyên văn, mã dùng một lần, PKCE S256, làm mới KHÔNG trả
 * refresh_token mới và thay access_token ngay, 401 thiếu scope KHÔNG có WWW-Authenticate.
 * Chạy: node tests/bao-mat.test.cjs */
'use strict';
const assert = require('assert');
const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const cp = require('child_process');

const GOC = path.resolve(__dirname, '..');
const handler = require('../api/canvas.js');
const may = require('../server.js');
const capi = require('../js/canvas-api.js');
const scorm = require('../js/scorm.js');
const html = require('../js/html.js');
const I = handler._internal;

const BI_MAT = 'bi-mat-phien-BAO-MAT-0123456789abcdef!!';
const BI_MAT_KHOA = 'csec-BI-MAT-khong-duoc-lo-ra-ngoai';
const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

/* ===================== tiện ích ===================== */

function nghe(sv) { return new Promise(ok => sv.listen(0, '127.0.0.1', () => ok('http://127.0.0.1:' + sv.address().port))); }
function dong(sv) { return new Promise(ok => { sv.close(() => ok()); if (sv.closeAllConnections) sv.closeAllConnections(); }); }

function raw(base, method, p, headers, body) {
  return new Promise((ok, loi) => {
    const u = new URL(base);
    const rq = http.request({ host: u.hostname, port: u.port, method, path: p, headers: headers || {} }, rs => {
      const c = [];
      rs.on('data', d => c.push(d));
      rs.on('end', () => {
        const b = Buffer.concat(c);
        let json = null;
        try { json = JSON.parse(b.toString('utf8')); } catch (e) { /* không phải JSON */ }
        ok({ status: rs.statusCode, headers: rs.headers, body: b.toString('utf8'), json });
      });
    });
    rq.on('error', e => (e.code === 'ECONNRESET' || e.code === 'EPIPE') ? ok({ status: 0, headers: {}, body: '', json: null, reset: true }) : loi(e));
    if (body) rq.write(body);
    rq.end();
  });
}

function layCookie(headers, ten) {
  const c = [].concat(headers['set-cookie'] || []).find(x => x.startsWith(ten + '='));
  return c ? { raw: c, value: c.slice(ten.length + 1).split(';')[0] } : null;
}

function taoJar() {
  const jar = {};
  return {
    jar,
    header() { return Object.keys(jar).map(k => k + '=' + jar[k]).join('; '); },
    update(r) {
      for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) {
        const kv = c.split(';')[0], i = kv.indexOf('=');
        const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
        if (/max-age=0\b/i.test(c) || !v) delete jar[k]; else jar[k] = v;
      }
    }
  };
}
function fetchVoiJar(jar, origin, ghi) {
  return async (url, init) => {
    init = init || {};
    const cung = String(url).startsWith(origin);
    const h = Object.assign({}, init.headers || {});
    if (cung && jar.header()) h.cookie = jar.header();
    if (ghi) ghi.push({ url: String(url), init: Object.assign({}, init, { headers: h }) });
    const r = await fetch(url, Object.assign({}, init, { headers: h }));
    if (cung) jar.update(r);
    return r;
  };
}

function docThanReq(req) { return new Promise(ok => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); }); }
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex64 = () => crypto.randomBytes(64).toString('hex');

// Đặt biến môi trường cho một khối kiểm thử rồi trả lại như cũ
async function voiEnv(bien, fn) {
  const cu = Object.assign({}, process.env);
  for (const k of ['CANVAS_BASE_URL', 'CANVAS_CLIENT_ID', 'CANVAS_CLIENT_SECRET', 'SESSION_SECRET', 'ALLOW_PERSONAL_TOKEN', 'APP_URL', 'CANVAS_SCOPES']) delete process.env[k];
  Object.assign(process.env, bien);
  try { return await fn(); } finally {
    for (const k of Object.keys(process.env)) if (!(k in cu)) delete process.env[k];
    Object.assign(process.env, cu);
  }
}

/* ===================== Canvas giả lập đúng hành vi mã nguồn ===================== */

// 13 scope README/rest-api.md §5b bảo quản trị bật trên Developer Key (máy chủ chỉ xin tập con)
const SCOPE_KHOA = [
  'url:GET|/api/v1/users/:id', 'url:GET|/api/v1/courses', 'url:GET|/api/v1/courses/:course_id/permissions',
  'url:GET|/api/v1/question_banks', 'url:GET|/api/v1/question_banks/:id', 'url:GET|/api/v1/question_banks/:id/questions',
  'url:GET|/api/v1/courses/:course_id/content_migrations/migrators', 'url:POST|/api/v1/courses/:course_id/content_migrations',
  'url:GET|/api/v1/courses/:course_id/content_migrations', 'url:GET|/api/v1/courses/:course_id/content_migrations/:id',
  'url:PUT|/api/v1/courses/:course_id/content_migrations/:id',
  'url:GET|/api/v1/courses/:course_id/content_migrations/:content_migration_id/migration_issues', 'url:GET|/api/v1/progress/:id'
];
function khopScope(scopes, method, p) {
  return scopes.some(s => {
    const m = /^url:([A-Z]+)\|(.+)$/.exec(s);
    if (!m || m[1] !== method) return false;
    // /users/:id phủ cả /users/self (Canvas so mẫu route)
    return new RegExp('^' + m[2].replace(/:[a-z_]+/g, '[^/]+') + '(\\.json)?$').test(p);
  });
}

function taoCanvas() {
  const M = {
    base: '', clientId: 'cid', secret: BI_MAT_KHOA, redirectUris: [], keyScopes: new Set(SCOPE_KHOA), requireScopes: true,
    codes: new Map(), tokens: new Map(), refreshes: new Map(), log: [], authReqs: [], tokenReqs: [],
    refreshCount: 0, revoked: [], pkceOk: 0, inFlight: 0, maxInFlight: 0, sauLamMoi: null,
    migrations: {}, nextMig: 900, uploads: []
  };
  function json(res, st, o, h) {
    res.writeHead(st, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, h || {}));
    res.end(typeof o === 'string' || Buffer.isBuffer(o) ? o : JSON.stringify(o));
  }
  function taoToken(scopes, user) {
    const rec = { access: 'tok-' + hex64().slice(0, 40), refresh: 'ref-' + hex64().slice(0, 40), scopes, user: user || { id: 42, name: 'Cô Lan' }, expiresAt: Date.now() + 3600e3 };
    M.tokens.set(rec.access, rec); M.refreshes.set(rec.refresh, rec);
    return rec;
  }
  M.taoToken = taoToken;
  // AccessToken#regenerate_access_token: token mới, token cũ chết ngay
  function taoLai(rec) {
    M.tokens.delete(rec.access);
    rec.access = 'tok-' + hex64().slice(0, 40);
    rec.expiresAt = Date.now() + 3600e3;
    M.tokens.set(rec.access, rec);
  }
  M.taoLai = taoLai;
  function xacThuc(req, res) {
    const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
    const rec = M.tokens.get(tok);
    if (!rec) { json(res, 401, { errors: [{ message: 'Invalid access token.' }] }, { 'WWW-Authenticate': 'Bearer realm="canvas-lms"' }); return null; }
    if (rec.expiresAt < Date.now()) { json(res, 401, { errors: [{ message: 'Expired access token.' }] }, { 'WWW-Authenticate': 'Bearer realm="canvas-lms"' }); return null; }
    return rec;
  }
  const sv = http.createServer(async (req, res) => {
    const u = new URL(req.url, M.base);
    const p = u.pathname;
    const body = await docThanReq(req);
    const muc = { method: req.method, path: p, search: u.search, headers: req.headers, body: body.toString('utf8') };
    M.log.push(muc);

    if (p === '/login/oauth2/auth' && req.method === 'GET') {
      const q = u.searchParams;
      M.authReqs.push({ url: req.url, scopeCount: q.getAll('scope').length });
      if (q.get('client_id') !== M.clientId) return json(res, 400, { error: 'invalid_client' });
      const ru = q.get('redirect_uri') || '';
      if (!M.redirectUris.includes(ru)) return json(res, 400, { error: 'invalid_request', error_description: 'redirect_uri does not match client settings' });
      const ve = o => { res.writeHead(302, { Location: ru + (ru.includes('?') ? '&' : '?') + new URLSearchParams(o).toString() }); res.end(); };
      const scopes = String(q.get('scope') || '').split(' ').filter(Boolean);
      if (M.requireScopes && (!scopes.length || scopes.some(s => !M.keyScopes.has(s)))) return ve({ error: 'invalid_scope', state: q.get('state') || '' });
      if (q.get('response_type') !== 'code') return ve({ error: 'unsupported_response_type', state: q.get('state') || '' });
      const code = hex64();
      const coPkce = !M.khongPkce && q.get('code_challenge') && q.get('code_challenge_method') === 'S256';
      M.codes.set(code, { scopes, challenge: coPkce ? q.get('code_challenge') : null });
      const o = { code };
      if (q.has('state')) o.state = q.get('state');
      return ve(o);
    }
    if (p === '/login/oauth2/token' && req.method === 'POST') {
      const f = new URLSearchParams(body.toString('utf8'));
      M.tokenReqs.push(Object.fromEntries(f));
      if (f.get('client_id') !== M.clientId || f.get('client_secret') !== M.secret) return json(res, 401, { error: 'invalid_client', error_description: 'unknown client' }, { 'WWW-Authenticate': 'Canvas OAuth 2.0' });
      if (f.get('grant_type') === 'authorization_code') {
        const code = f.get('code') || '';
        const cd = M.codes.get(code);
        if (f.has('code_verifier') && !M.khongPkce) {      // AuthorizationCodeWithPKCE: redis get + del
          const ch = cd ? cd.challenge : null;
          if (cd) cd.challenge = null;
          if (!ch || b64url(crypto.createHash('sha256').update(f.get('code_verifier')).digest()) !== ch) return json(res, 400, { error: 'invalid_grant' });
          M.pkceOk++;
        }
        if (!cd) return json(res, 400, { error: 'invalid_grant', error_description: 'authorization_code not found' });
        M.codes.delete(code);                               // Token.expire_code: mã chỉ dùng một lần
        const rec = taoToken(cd.scopes);
        return json(res, 200, { access_token: rec.access, token_type: 'Bearer', user: { id: 42, name: 'Cô Lan', global_id: '10000000000042', effective_locale: 'vi' }, refresh_token: rec.refresh, expires_in: 3600, canvas_region: 'ap-southeast-1' });
      }
      if (f.get('grant_type') === 'refresh_token') {
        const rec = M.refreshes.get(f.get('refresh_token') || '');
        if (!rec) return json(res, 400, { error: 'invalid_grant', error_description: 'refresh_token not found' });
        M.refreshCount++;
        taoLai(rec);
        const tra = { access_token: rec.access, token_type: 'Bearer', user: { id: 42, name: 'Cô Lan' }, expires_in: 3600 };   // KHÔNG có refresh_token
        if (M.sauLamMoi) { const f2 = M.sauLamMoi; M.sauLamMoi = null; f2(rec); }
        return json(res, 200, tra);
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }
    if (p === '/login/oauth2/token' && req.method === 'DELETE') {
      const rec = xacThuc(req, res);
      if (!rec) return;
      M.tokens.delete(rec.access); M.refreshes.delete(rec.refresh);   // xoá AccessToken: refresh_token cũng chết
      M.revoked.push(rec.access);
      return json(res, 200, {});
    }
    // máy nhận file (lưu trữ cục bộ của Canvas)
    if (p === '/files_api' && req.method === 'POST') {
      const mig = M.migrations[u.searchParams.get('mid')];
      M.uploads.push({ headers: req.headers, len: body.length, mid: u.searchParams.get('mid') });
      if (!mig) return json(res, 400, { error: 'bad mid' });
      mig.received = true;
      return json(res, 201, { id: 5, upload_status: 'success' });
    }
    if (!p.startsWith('/api/v1/')) return json(res, 404, { errors: [{ message: 'not found' }] });

    M.inFlight++; M.maxInFlight = Math.max(M.maxInFlight, M.inFlight);
    try {
      await new Promise(ok => setTimeout(ok, 5));      // để lộ yêu cầu chồng nhau (nếu có)
      const rec = xacThuc(req, res);
      if (!rec) return;
      if (rec.scopes && M.requireScopes && !khopScope(rec.scopes, req.method === 'HEAD' ? 'GET' : req.method, p)) {
        return json(res, 401, { errors: [{ message: 'Insufficient scopes on access token.' }] });   // KHÔNG có WWW-Authenticate
      }
      const tieuDeLa = { 'Set-Cookie': '_normandy_session=bi-mat-canvas; path=/; HttpOnly', 'X-Canvas-Meta': 'q=1;', 'Access-Control-Allow-Origin': '*', 'X-Rate-Limit-Remaining': '700.0', 'X-Request-Cost': '0.5', 'Strict-Transport-Security': 'max-age=1' };
      let m;
      if (p === '/api/v1/users/self') return json(res, 200, { id: '42', name: 'Cô Lan' }, Object.assign({ Link: '<' + M.base + '/api/v1/users/self>; rel="current"' }, tieuDeLa));
      if (p === '/api/v1/courses') return json(res, 200, [{ id: '1', name: 'Toán 12A1', course_code: 'T12', workflow_state: 'available' }]);
      if ((m = /^\/api\/v1\/courses\/(\d+)\/permissions$/.exec(p))) return json(res, 200, { manage_course_content_add: true, read_question_banks: true, manage_files_add: true });
      if (/^\/api\/v1\/courses\/\d+\/content_migrations\/migrators$/.test(p)) return json(res, 200, [{ type: 'qti_converter' }]);
      if (p === '/api/v1/question_banks') return json(res, 200, []);
      if ((m = /^\/api\/v1\/courses\/(\d+)\/content_migrations$/.exec(p)) && req.method === 'POST') {
        const id = String(M.nextMig++);
        M.migrations[id] = { id, course: m[1], received: false };
        return json(res, 200, { id, workflow_state: 'pre_processing', pre_attachment: { upload_url: M.base + '/files_api?mid=' + id, upload_params: { filename: 'goi.zip' }, file_param: 'file' } });
      }
      if ((m = /^\/api\/v1\/courses\/(\d+)\/content_migrations\/(\d+)$/.exec(p)) && req.method === 'GET') {
        const mig = M.migrations[m[2]];
        if (!mig || mig.course !== m[1]) return json(res, 404, { errors: [{ message: 'The specified resource does not exist.' }] });
        return json(res, 200, { id: mig.id, workflow_state: mig.received ? 'completed' : 'pre_processing' });
      }
      if (/^\/api\/v1\/courses\/\d+\/content_migrations\/\d+\/migration_issues$/.test(p)) return json(res, 200, []);
      if (p === '/api/v1/progress/666') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<script>alert(document.cookie)</script>'); }
      if (p === '/api/v1/progress/777') return json(res, 200, Buffer.alloc(4 * 1024 * 1024 + 100, 0x20));
      if ((m = /^\/api\/v1\/progress\/(\d+)$/.exec(p))) return json(res, 200, { id: m[1], workflow_state: 'completed', completion: 100 });
      return json(res, 404, { errors: [{ message: 'The specified resource does not exist.' }] });
    } finally { M.inFlight--; }
  });
  return { M, sv };
}

// Dựng máy Canvas giả + server.js thật, đặt biến môi trường, chạy fn({M, base, ...}), dọn dẹp
async function moiTruong(bien, fn) {
  const { M, sv: svC } = taoCanvas();
  M.base = await nghe(svC);
  const sv = may.createServer({ root: GOC });
  const base = await nghe(sv);
  M.redirectUris = [base + '/api/canvas?op=callback', base.replace('http:', 'https:') + '/api/canvas?op=callback'];
  try {
    return await voiEnv(Object.assign({ CANVAS_BASE_URL: M.base, CANVAS_CLIENT_ID: 'cid', CANVAS_CLIENT_SECRET: BI_MAT_KHOA, SESSION_SECRET: BI_MAT },
      typeof bien === 'function' ? bien(M, base) : bien), () => fn({ M, base }));
  } finally { await dong(sv); await dong(svC); }
}

// Đăng nhập OAuth đầy đủ qua HTTP: op=login → Canvas /login/oauth2/auth → op=callback
async function dangNhap(M, base, h) {
  h = h || {};
  const https = /https/.test(h['x-forwarded-proto'] || '');
  const tenSt = (https ? I.COOKIE_HOST_PREFIX : '') + I.COOKIE_STATE;
  const tenPh = (https ? I.COOKIE_HOST_PREFIX : '') + I.COOKIE_SESSION;
  const r1 = await raw(base, 'GET', '/api/canvas?op=login', h);
  assert.strictEqual(r1.status, 302, r1.body);
  const st = layCookie(r1.headers, tenSt);
  const loc = new URL(r1.headers.location);
  const r2 = await raw(M.base, 'GET', loc.pathname + loc.search);
  const cb = r2.headers.location ? new URL(r2.headers.location) : null;
  let r3 = null, phien = null;
  if (cb) {
    r3 = await raw(base, 'GET', cb.pathname + cb.search, Object.assign({}, h, { cookie: tenSt + '=' + (st && st.value) }));
    const c = layCookie(r3.headers, tenPh);
    phien = c && c.value ? c.value : null;
  }
  return { r1, r2, r3, loc, cb, st, phien, tenPh, tenSt };
}

/* ===================== 1. SSRF / allowlist ===================== */

test('SSRF: allowlist đường dẫn proxy chặn mã hoá, .., //, @, \\, CRLF, URL tuyệt đối, tham số giả danh', () => {
  const cam = (p, m) => { const r = I.checkProxyPath(p, m || 'GET'); assert.ok(r.loi, 'phải chặn: ' + JSON.stringify(p) + ' ' + (m || 'GET')); return r; };
  const ok = (p, m) => { const r = I.checkProxyPath(p, m || 'GET'); assert.ok(!r.loi, JSON.stringify(p) + ' → ' + r.loi); };
  const xau = [
    'https://evil.example/api/v1/courses', 'http:/evil.example/api/v1/courses', '//evil.example/api/v1/courses', '\\\\evil.example/api/v1/courses',
    '/api/v1//evil.example/x', '/api/v1/courses/../accounts/1/users', '/api/v1/courses/%2e%2e/accounts/1/users', '/api/v1/courses/%252e%252e/accounts',
    '/api/v1/courses%2F1%2Fpermissions', '/api/v1/courses/1%2fpermissions', '/api/v1/users/self%00', '/api/v1/users/self\u0000',
    '/api/v1/users/self\\..\\..\\accounts', '/api/v1/users/self@evil.example', '/api/v1/users/self#@evil', '/api/v1/users/self\r\nHost: evil.example',
    '/api/v1/users/self\nX: y', '/api/v1/users/self\t', '/api/v1/users/self ', '/api/v1/users/self;jsessionid=1', '/api/v1/users/self/',
    '/api/v1/users/self/..', '/api/v1/courses/１/permissions', '/api/v1/courses/1／permissions', '/api/v1/users/12', '/api/v1/accounts/1/users',
    '/api/v1/question_banks/7', '/api/v1/question_banks/7/questions', '/login/oauth2/token', '/api/v2/courses', 'api/v1/courses', ' /api/v1/courses',
    '/API/V1/COURSES', '/api/v1/courses/1/content_migrations/2/../../../../accounts/1/sis_imports',
    // tham số làm đổi danh tính / phương thức
    '/api/v1/courses?as_user_id=1', '/api/v1/courses?AS_USER_ID=1', '/api/v1/courses?as%5Fuser%5Fid=1', '/api/v1/courses?as_user_id[]=1',
    '/api/v1/courses?as_user_id%5B%5D=1', '/api/v1/courses?per_page=1&as_user_id=sis_user_id:x', '/api/v1/courses?access_token=khac',
    '/api/v1/courses?_method=DELETE', '/api/v1/courses?x=1&_method=delete', '/api/v1/courses?api_key=1',
    // ký tự lạ trong query
    '/api/v1/courses?x=<script>', '/api/v1/courses?x="', "/api/v1/courses?x='", '/api/v1/courses?x=a b', '/api/v1/courses?x=a\r\nb', '/api/v1/courses?x=%0d%0a#',
    '/api/v1/courses?' + 'a'.repeat(3000)
  ];
  for (const p of xau) cam(p);
  for (const p of ['', null, undefined, 42, {}]) cam(p);
  // phương thức: chỉ GET/POST đúng chỗ
  cam('/api/v1/courses/1/content_migrations/2', 'PUT');
  cam('/api/v1/courses/1/content_migrations/2', 'DELETE');
  cam('/api/v1/courses/1/content_migrations', 'PATCH');
  cam('/api/v1/courses', 'POST');
  cam('/api/v1/users/self', 'POST');
  // vẫn cho các đường dùng thật
  ok('/api/v1/users/self');
  ok('/api/v1/courses?enrollment_type=teacher&state%5B%5D=available&include%5B%5D=term&per_page=100');
  ok('/api/v1/courses/12/content_migrations', 'POST');
  ok('/api/v1/courses/12/content_migrations/456/migration_issues?per_page=100&page=2');
  ok('/api/v1/question_banks?context_type=Course&context_id=12&include_question_count=true&per_page=100');
  ok('/api/v1/progress/789');
  // tên tham số bị cấm (kể cả mã hoá, hoa/thường, hậu tố [])
  for (const k of ['as_user_id', 'AS_User_Id', 'as%5Fuser%5Fid', 'as_user_id[]', 'as_user_id%5B0%5D', 'access_token', '_method', '_METHOD', 'api_key']) assert.ok(I.isForbiddenParam(k), k);
  for (const k of ['per_page', 'page', 'include[]', 'state%5B%5D', 'context_id', 'user_id', 'method', 'token']) assert.ok(!I.isForbiddenParam(k), k);
});

test('SSRF qua HTTP: yêu cầu bị chặn không bao giờ tới Canvas; op=me bỏ qua path; path lặp lấy cái đầu', () => moiTruong({ ALLOW_PERSONAL_TOKEN: '1' }, async ({ M, base }) => {
  const tk = M.taoToken(null).access;   // token cá nhân: không giới hạn scope
  const hdr = { 'x-nh-client': '1', 'x-canvas-token': tk };
  const goc = M.log.length;
  const xau = ['https://evil.example/api/v1/courses', '/api/v1/courses/%2e%2e/accounts/1/users', '/api/v1/accounts/1/users', '/api/v1/courses?as_user_id=1',
    '/api/v1/users/self\r\nHost: evil', '//127.0.0.1:1/api/v1/courses', '/api/v1/question_banks/7/questions'];
  for (const p of xau) {
    const r = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent(p), hdr);
    assert.ok(r.status === 403 || r.status === 400, p + ' → ' + r.status);
    assert.strictEqual(r.headers['content-type'], 'application/json; charset=utf-8');
  }
  // phương thức không cho phép
  for (const m of ['PUT', 'DELETE', 'PATCH', 'HEAD']) {
    const r = await raw(base, m, '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations/2'), hdr);
    assert.strictEqual(r.status, 405, m);
  }
  // as_user_id trong THÂN JSON (Canvas gộp thân vào params)
  let r = await raw(base, 'POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations'),
    Object.assign({ 'content-type': 'application/json' }, hdr), JSON.stringify({ migration_type: 'qti_converter', as_user_id: '1' }));
  assert.strictEqual(r.status, 403);
  r = await raw(base, 'POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations'),
    Object.assign({ 'content-type': 'application/json' }, hdr), JSON.stringify({ migration_type: 'qti_converter', _method: 'DELETE' }));
  assert.strictEqual(r.status, 403);
  assert.strictEqual(M.log.length, goc, 'Canvas không nhận yêu cầu nào: ' + JSON.stringify(M.log.slice(goc).map(x => x.path)));
  // op=me: luôn /users/self, không theo path
  r = await raw(base, 'GET', '/api/canvas?op=me&path=' + encodeURIComponent('/api/v1/accounts/1/users'), hdr);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(M.log[M.log.length - 1].path, '/api/v1/users/self');
  // path lặp: dùng giá trị đầu (đã kiểm), không phải giá trị sau
  r = await raw(base, 'GET', '/api/canvas?op=proxy&path=%2Fapi%2Fv1%2Fusers%2Fself&path=%2Fapi%2Fv1%2Faccounts%2F1%2Fusers', hdr);
  assert.strictEqual(r.status, 200);
  assert.ok(!M.log.some(x => /accounts/.test(x.path)));
  // CORS: không mở
  r = await raw(base, 'OPTIONS', '/api/canvas?op=proxy', { origin: 'https://evil.example', 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-nh-client' });
  assert.ok(r.status >= 400 && !r.headers['access-control-allow-origin'] && !r.headers['access-control-allow-headers']);
  // thiếu X-NH-Client (trang khác gọi bằng <img>/<form>) → 403 csrf, không tới Canvas
  const n = M.log.length;
  r = await raw(base, 'GET', '/api/canvas?op=me', { 'x-canvas-token': tk });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'csrf');
  r = await raw(base, 'POST', '/api/canvas?op=upload&course=1&migration=1&url=' + encodeURIComponent(M.base + '/files_api?mid=1'), { 'x-canvas-token': tk, 'content-type': 'multipart/form-data; boundary=b' }, '--b--');
  assert.strictEqual(r.status, 403);
  // có tiêu đề nhưng trình duyệt báo đến từ site khác / tên miền con cùng site → 403
  for (const sfs of ['cross-site', 'same-site']) {
    r = await raw(base, 'GET', '/api/canvas?op=me', Object.assign({ 'sec-fetch-site': sfs }, hdr));
    assert.strictEqual(r.status, 403, sfs); assert.strictEqual(r.json.code, 'csrf');
  }
  r = await raw(base, 'POST', '/api/canvas?op=logout', Object.assign({ 'sec-fetch-site': 'cross-site' }, hdr));
  assert.strictEqual(r.status, 403);
  assert.strictEqual(M.log.length, n);
  r = await raw(base, 'GET', '/api/canvas?op=me', Object.assign({ 'sec-fetch-site': 'same-origin' }, hdr));
  assert.strictEqual(r.status, 200);
}));

/* ===================== 2. Header chuyển tiếp / trả về ===================== */

test('Header: không chuyển cookie/Host/X-Forwarded/Authorization của trình duyệt; lọc header Canvas; ép Content-Type; CSP sandbox', () => moiTruong({}, async ({ M, base }) => {
  const dn = await dangNhap(M, base);
  assert.ok(dn.phien);
  const tokPhien = I.decryptSession(dn.phien, BI_MAT).access_token;
  const r = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/users/self'), {
    'x-nh-client': '1', cookie: dn.tenPh + '=' + dn.phien + '; khac=bi-mat-trinh-duyet; _normandy_session=gia',
    authorization: 'Bearer tok-cua-trinh-duyet', 'x-forwarded-for': '6.6.6.6', 'x-forwarded-host': 'evil.example', 'x-real-ip': '6.6.6.6',
    origin: 'http://127.0.0.1', referer: 'http://127.0.0.1/?bi-mat=1', 'x-canvas-token': 'tok-ca-nhan-khong-bat', 'user-agent': 'TrinhDuyet/1.0'
  });
  assert.strictEqual(r.status, 200, r.body);
  const den = M.log.filter(x => x.path === '/api/v1/users/self').pop().headers;
  assert.strictEqual(den.authorization, 'Bearer ' + tokPhien, 'chỉ token của phiên');
  for (const h of ['cookie', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'origin', 'referer', 'x-nh-client', 'x-canvas-token']) assert.ok(!(h in den), 'không chuyển ' + h);
  assert.strictEqual(den.host, new URL(M.base).host, 'Host là máy Canvas');
  assert.ok(!/TrinhDuyet/.test(den['user-agent'] || ''), 'không chuyển User-Agent');
  assert.ok(/canvas-string-ids/.test(den.accept));
  // phản hồi: chỉ header an toàn
  assert.ok(!r.headers['set-cookie'], 'không chuyển Set-Cookie của Canvas');
  for (const h of ['x-canvas-meta', 'access-control-allow-origin', 'strict-transport-security']) assert.ok(!(h in r.headers), 'lọc ' + h);
  assert.strictEqual(r.headers['x-rate-limit-remaining'], '700.0');
  assert.ok(/rel="current"/.test(r.headers.link));
  assert.strictEqual(r.headers['content-type'], 'application/json; charset=utf-8');
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  assert.ok(/default-src 'none'/.test(r.headers['content-security-policy']) && /sandbox/.test(r.headers['content-security-policy']));
  assert.strictEqual(r.headers['referrer-policy'], 'no-referrer');
  // Canvas trả text/html → chuyển thành chữ thuần (không bao giờ là trang HTML trên tên miền công cụ)
  const r2 = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/progress/666'), { 'x-nh-client': '1', cookie: dn.tenPh + '=' + dn.phien });
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(r2.headers['content-type'], 'text/plain; charset=utf-8');
  assert.ok(/sandbox/.test(r2.headers['content-security-policy']));
  // mọi phản hồi của hàm (JSON lỗi, chuyển hướng) đều có CSP sandbox + no-store
  for (const p of ['/api/canvas?op=config', '/api/canvas?op=login', '/api/canvas?op=khong-co']) {
    const x = await raw(base, 'GET', p);
    assert.ok(/sandbox/.test(x.headers['content-security-policy'] || ''), p);
    assert.strictEqual(x.headers['cache-control'], 'no-store', p);
  }
}));

/* ===================== 3. Kích thước ===================== */

test('Giới hạn kích thước: thân JSON > 256 KB, gói > 4 MB (có/không Content-Length), phản hồi Canvas > 4 MB', () => moiTruong({ ALLOW_PERSONAL_TOKEN: '1' }, async ({ M, base }) => {
  const tk = M.taoToken(null).access;
  const hdr = { 'x-nh-client': '1', 'x-canvas-token': tk };
  const to = JSON.stringify({ migration_type: 'qti_converter', x: 'a'.repeat(300 * 1024) });
  let r = await raw(base, 'POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations'),
    Object.assign({ 'content-type': 'application/json', 'content-length': Buffer.byteLength(to) }, hdr), to);
  assert.ok(r.status === 413 || r.reset, 'JSON lớn có Content-Length: ' + r.status);
  r = await raw(base, 'POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations'),
    Object.assign({ 'content-type': 'application/json' }, hdr), to);   // chunked, không Content-Length
  assert.ok(r.status === 413 || r.reset, 'JSON lớn chunked: ' + r.status);
  const mig = (await raw(base, 'POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations'),
    Object.assign({ 'content-type': 'application/json' }, hdr), '{"migration_type":"qti_converter"}')).json;
  const goi = Buffer.alloc(I.UPLOAD_MAX + 1, 65);
  const up = '/api/canvas?op=upload&course=1&migration=' + mig.id + '&url=' + encodeURIComponent(M.base + '/files_api?mid=' + mig.id);
  r = await raw(base, 'POST', up, Object.assign({ 'content-type': 'multipart/form-data; boundary=b', 'content-length': goi.length }, hdr), goi);
  assert.ok(r.status === 413 || r.reset, 'gói lớn có Content-Length: ' + r.status);
  r = await raw(base, 'POST', up, Object.assign({ 'content-type': 'multipart/form-data; boundary=b' }, hdr), goi);
  assert.ok(r.status === 413 || r.reset, 'gói lớn chunked: ' + r.status);
  assert.strictEqual(M.uploads.length, 0, 'không gói quá cỡ nào tới máy nhận file');
  r = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/progress/777'), hdr);
  assert.strictEqual(r.status, 502); assert.strictEqual(r.json.code, 'qua_lon');
}));

/* ===================== 4. op=upload không phải proxy mở ===================== */

test('op=upload: danh sách máy nhận file chặt (không *.amazonaws.com / *.instructure.com tuỳ ý)', () => {
  const ch = I.readConfig({ CANVAS_BASE_URL: 'https://4015.instructure.com', ALLOW_PERSONAL_TOKEN: '1' });
  const co = u => assert.ok(I.isAllowedUploadUrl(u, ch), 'phải cho: ' + u);
  const khong = u => assert.ok(!I.isAllowedUploadUrl(u, ch), 'phải chặn: ' + u);
  co('https://inst-fs-sin-prod.inscloudgate.net/files?token=abc');
  co('https://inst-fs-iad-prod.inscloudgate.net/files?token=abc');
  co('https://inst-fs-iad.instructure.com/files');
  co('https://4015.instructure.com/files_api');
  co('https://instructure-uploads-apse1.s3.ap-southeast-1.amazonaws.com/');
  co('https://my.bucket.s3.amazonaws.com/');
  co('https://bucket.s3-ap-southeast-1.amazonaws.com/');
  for (const u of [
    'https://other-school.instructure.com/files_api', 'https://evil.instructure.com.evil.example/', 'https://abc.execute-api.ap-southeast-1.amazonaws.com/prod',
    'https://abc.lambda-url.ap-southeast-1.on.aws/', 'https://sqs.ap-southeast-1.amazonaws.com/123/q', 'https://ec2-1-2-3-4.compute.amazonaws.com/',
    'https://amazonaws.com/', 'https://s3.amazonaws.com.evil.example/', 'https://inscloudgate.net/', 'https://inscloudgate.net.evil.example/',
    'https://inst-fs-sin-prod.inscloudgate.net.:443/files', 'http://inst-fs-sin-prod.inscloudgate.net/files', 'https://inst-fs-sin-prod.inscloudgate.net:8443/files',
    'https://u:p@inst-fs-sin-prod.inscloudgate.net/files', 'http://4015.instructure.com/files_api', 'https://4015.instructure.com:444/files_api',
    'https://169.254.169.254/latest/meta-data/', 'https://127.0.0.1/', 'https://[::1]/', 'file:///etc/passwd', 'gopher://x', 'javascript:alert(1)', '', 'không phải url'
  ]) khong(u);
});

test('op=upload: phải gắn với lần nhập ĐANG CHỜ của chính người dùng; token cá nhân giả không chuyển tiếp được gì', () => moiTruong({ ALLOW_PERSONAL_TOKEN: '1' }, async ({ M, base }) => {
  const tk = M.taoToken(null).access;
  const hdr = { 'x-nh-client': '1', 'x-canvas-token': tk, 'content-type': 'multipart/form-data; boundary=b' };
  const mp = '--b\r\nContent-Disposition: form-data; name="file"; filename="a.zip"\r\n\r\nPK\r\n--b--\r\n';
  const tao = async (khoa) => (await raw(base, 'POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/' + khoa + '/content_migrations'),
    { 'x-nh-client': '1', 'x-canvas-token': tk, 'content-type': 'application/json' }, '{"migration_type":"qti_converter"}')).json;
  const mig = await tao(1);
  const url = (mid, course, them) => '/api/canvas?op=upload' + (course != null ? '&course=' + course : '') + (mid != null ? '&migration=' + mid : '') +
    '&url=' + encodeURIComponent(M.base + '/files_api?mid=' + (them || mid));
  // token cá nhân "bất kỳ" đúng dạng: Canvas trả 401 khi kiểm lần nhập → không gửi gói đi đâu
  let r = await raw(base, 'POST', url(mig.id, 1), Object.assign({}, hdr, { 'x-canvas-token': 'tok-gia-mao-12345678' }), mp);
  assert.strictEqual(r.status, 401); assert.strictEqual(r.json.code, 'het_phien');
  // thiếu course/migration
  r = await raw(base, 'POST', url(null, null, mig.id), hdr, mp); assert.strictEqual(r.status, 400); assert.strictEqual(r.json.code, 'tham_so');
  r = await raw(base, 'POST', url('1%20OR%201', 1, mig.id), hdr, mp); assert.strictEqual(r.status, 400);
  // lần nhập của khoá học khác / không tồn tại
  r = await raw(base, 'POST', url(mig.id, 2), hdr, mp); assert.strictEqual(r.status, 403);
  r = await raw(base, 'POST', url('99999', 1), hdr, mp); assert.strictEqual(r.status, 403);
  assert.strictEqual(M.uploads.length, 0, 'chưa có gì được chuyển tiếp');
  // đúng: chuyển nguyên thân, KHÔNG kèm token/cookie/tiêu đề của trình duyệt
  r = await raw(base, 'POST', url(mig.id, 1), Object.assign({ cookie: 'nh_canvas=x; khac=y' }, hdr), mp);
  assert.strictEqual(r.status, 200, r.body);
  const u0 = M.uploads[0];
  assert.ok(!u0.headers.authorization && !u0.headers.cookie && !u0.headers['x-canvas-token'] && !u0.headers['x-nh-client']);
  assert.strictEqual(u0.headers['content-type'], 'multipart/form-data; boundary=b');
  // lần nhập đã nhận gói (không còn pre_processing) → 409, không chuyển lần nữa
  r = await raw(base, 'POST', url(mig.id, 1), hdr, mp);
  assert.strictEqual(r.status, 409); assert.strictEqual(r.json.code, 'trang_thai');
  assert.strictEqual(M.uploads.length, 1);
  // tiêu đề Content-Type giả (CRLF, kiểu khác) bị từ chối
  const mig2 = await tao(1);
  for (const ct of ['text/html', 'multipart/form-data', 'multipart/form-data; boundary="b', 'multipart/form-data; boundary=' + 'b'.repeat(71), 'application/octet-stream']) {
    r = await raw(base, 'POST', url(mig2.id, 1), Object.assign({}, hdr, { 'content-type': ct }), mp);
    assert.strictEqual(r.status, 415, ct);
  }
  // octet-stream + X-Upload-Content-Type sai dạng
  r = await raw(base, 'POST', url(mig2.id, 1), Object.assign({}, hdr, { 'content-type': 'application/octet-stream', 'x-upload-content-type': 'text/html' }), mp);
  assert.strictEqual(r.status, 415);
  assert.strictEqual(M.uploads.length, 1);
}));

/* ===================== 5. OAuth đầu-cuối ===================== */

test('OAuth với Canvas giả lập đúng hành vi 4015.instructure.com: scope MỘT tham số, redirect_uri khớp nguyên văn, PKCE S256, mã dùng một lần', () => moiTruong({}, async ({ M, base }) => {
  const dn = await dangNhap(M, base);
  // --- yêu cầu /login/oauth2/auth ---
  const q = dn.loc.searchParams;
  assert.strictEqual(dn.loc.origin, M.base);
  assert.strictEqual(q.get('client_id'), 'cid');
  assert.strictEqual(q.get('response_type'), 'code');
  assert.strictEqual(q.get('redirect_uri'), base + '/api/canvas?op=callback');
  assert.strictEqual(M.authReqs[0].scopeCount, 1, 'scope gửi MỘT lần (nhiều lần thì Canvas chỉ lấy cái cuối)');
  assert.strictEqual(q.get('scope'), I.SCOPES.join(' '));
  assert.ok(/[?&]scope=url%3AGET%7C%2Fapi%2Fv1%2Fusers%2F%3Aid%20url%3AGET%7C/.test(dn.r1.headers.location), 'dấu cách là %20');
  assert.ok(I.SCOPES.every(s => M.keyScopes.has(s)), 'scope xin là tập con của scope trên khoá');
  assert.ok(/^[0-9a-f]{36}$/.test(q.get('state')));
  assert.strictEqual(q.get('code_challenge_method'), 'S256');
  assert.strictEqual(q.get('code_challenge'), I.pkceChallenge(I.pkceVerifier(q.get('state'), BI_MAT)));
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge')));
  assert.ok(!dn.r1.headers.location.includes(I.pkceVerifier(q.get('state'), BI_MAT)), 'verifier không bao giờ ra trình duyệt');
  // --- callback ---
  assert.strictEqual(dn.r3.status, 302); assert.strictEqual(dn.r3.headers.location, '/?canvas=ok');
  const tr = M.tokenReqs[0];
  assert.strictEqual(tr.grant_type, 'authorization_code');
  assert.strictEqual(tr.redirect_uri, base + '/api/canvas?op=callback');
  assert.strictEqual(tr.code_verifier, I.pkceVerifier(q.get('state'), BI_MAT));
  assert.ok(/^[A-Za-z0-9._~-]{43,128}$/.test(tr.code_verifier), 'verifier đúng RFC 7636');
  assert.strictEqual(M.pkceOk, 1, 'Canvas xác minh PKCE');
  const p = I.decryptSession(dn.phien, BI_MAT);
  assert.ok(p && /^tok-/.test(p.access_token) && /^ref-/.test(p.refresh_token));
  assert.deepStrictEqual(p.user, { id: '42', name: 'Cô Lan' });
  assert.ok(Math.abs(p.expires_at - (Date.now() + 3600e3)) < 60e3);
  assert.ok(/nh_canvas_st=;.*Max-Age=0/.test([].concat(dn.r3.headers['set-cookie']).join('\n')), 'state dùng một lần: xoá ngay');
  // --- phát lại callback (cùng mã, cùng state + cookie cũ): mã đã dùng → lỗi, không phiên mới ---
  const lai = await raw(base, 'GET', dn.cb.pathname + dn.cb.search, { cookie: dn.tenSt + '=' + dn.st.value });
  assert.strictEqual(lai.headers.location, '/?canvas=loi&ma=doi_ma');
  assert.ok(!layCookie(lai.headers, dn.tenPh) || !layCookie(lai.headers, dn.tenPh).value);
  // --- state: thiếu / sai dạng / khác cookie ---
  const st2 = (await raw(base, 'GET', '/api/canvas?op=login')).headers;
  const s2 = layCookie(st2, I.COOKIE_STATE).value;
  for (const [qs, ck] of [['&state=' + s2, ''], ['', s2], ['&state=' + s2.toUpperCase(), s2.toUpperCase()], ['&state=' + s2 + '0', s2 + '0'],
    ['&state=' + s2, s2.slice(0, -1) + (s2.slice(-1) === 'a' ? 'b' : 'a')], ['&state=' + encodeURIComponent(s2 + '\r\n'), s2]]) {
    const r = await raw(base, 'GET', '/api/canvas?op=callback&code=' + hex64() + qs, ck ? { cookie: I.COOKIE_STATE + '=' + ck } : {});
    assert.strictEqual(r.headers.location, '/?canvas=loi&ma=state', qs + ' / ' + ck);
  }
  const soTokenReq = M.tokenReqs.length;
  // error từ Canvas → không đổi mã
  let r = await raw(base, 'GET', '/api/canvas?op=callback&error=invalid_scope&state=' + s2, { cookie: I.COOKIE_STATE + '=' + s2 });
  assert.strictEqual(r.headers.location, '/?canvas=loi&ma=thieu_scope');
  // câu báo thật của 4015.instructure.com (2026-10-02): chỉ chuyển tiếp scope có trong danh sách của mình
  const moTa = 'A requested scope is invalid, unknown, malformed, or exceeds the scope granted by the resource owner. The following scopes were requested, but not granted: url:GET|/api/v1/courses, url:GET|/api/v1/courses/:course_id/content_migrations, url:GET|/api/v1/courses/:course_id/content_migrations/:id, and url:GET|/api/v1/courses/:course_id/content_migrations/:content_migration_id/migration_issues';
  r = await raw(base, 'GET', '/api/canvas?op=callback&error=invalid_scope&error_description=' + encodeURIComponent(moTa + ', <script>x</script>') + '&state=' + s2, { cookie: I.COOKIE_STATE + '=' + s2 });
  const loc = new URL(r.headers.location, 'http://x');
  assert.strictEqual(loc.searchParams.get('ma'), 'thieu_scope');
  assert.deepStrictEqual(loc.searchParams.get('thieu').split(' '), ['url:GET|/api/v1/courses', 'url:GET|/api/v1/courses/:course_id/content_migrations',
    'url:GET|/api/v1/courses/:course_id/content_migrations/:id', 'url:GET|/api/v1/courses/:course_id/content_migrations/:content_migration_id/migration_issues']);
  assert.deepStrictEqual(I.scopeThieu('… not granted: url:GET|/api/v1/progress/:id.', I.SCOPES), ['url:GET|/api/v1/progress/:id']);
  assert.deepStrictEqual(I.scopeThieu('không có danh sách', I.SCOPES), []);
  r = await raw(base, 'GET', '/api/canvas?op=callback&error=invalid_client&state=' + s2, { cookie: I.COOKIE_STATE + '=' + s2 });
  assert.strictEqual(r.headers.location, '/?canvas=loi&ma=key');
  r = await raw(base, 'GET', '/api/canvas?op=callback&error=access_denied&state=' + s2, { cookie: I.COOKIE_STATE + '=' + s2 });
  assert.strictEqual(r.headers.location, '/?canvas=loi&ma=tu_choi');
  // mã có ký tự lạ → không gửi tới Canvas
  r = await raw(base, 'GET', '/api/canvas?op=callback&code=' + encodeURIComponent('abc&grant_type=refresh_token') + '&state=' + s2, { cookie: I.COOKIE_STATE + '=' + s2 });
  assert.strictEqual(r.headers.location, '/?canvas=loi&ma=doi_ma');
  assert.strictEqual(M.tokenReqs.length, soTokenReq, 'không có yêu cầu đổi mã nào');
}));

test('OAuth: chống tiêm mã (code injection) nhờ PKCE; Canvas đời cũ không PKCE vẫn đăng nhập; Canvas từ chối scope ngoài khoá', () => moiTruong({}, async ({ M, base }) => {
  // nạn nhân bắt đầu đăng nhập, kẻ gian lấy được MÃ của nạn nhân (lộ qua nhật ký/lịch sử) và dùng trong luồng của mình
  const nn = await raw(base, 'GET', '/api/canvas?op=login');
  const locNn = new URL(nn.headers.location);
  const maNn = new URL((await raw(M.base, 'GET', locNn.pathname + locNn.search)).headers.location).searchParams.get('code');
  const kg = await raw(base, 'GET', '/api/canvas?op=login');
  const stKg = layCookie(kg.headers, I.COOKIE_STATE).value;
  const r = await raw(base, 'GET', '/api/canvas?op=callback&code=' + maNn + '&state=' + stKg, { cookie: I.COOKIE_STATE + '=' + stKg });
  assert.strictEqual(r.headers.location, '/?canvas=loi&ma=doi_ma', 'verifier của kẻ gian không khớp challenge của nạn nhân');
  assert.ok(!layCookie(r.headers, I.COOKIE_SESSION) || !layCookie(r.headers, I.COOKIE_SESSION).value, 'kẻ gian không có phiên');
  // Canvas đời cũ (trước PKCE): bỏ qua code_challenge và code_verifier → vẫn đăng nhập được
  M.khongPkce = true;
  const dn = await dangNhap(M, base);
  assert.ok(dn.loc.searchParams.has('code_challenge'));
  assert.ok('code_verifier' in M.tokenReqs[M.tokenReqs.length - 1]);
  assert.strictEqual(dn.r3.headers.location, '/?canvas=ok');
  M.khongPkce = false;
  // khoá thiếu một scope công cụ xin → Canvas chuyển về với error=invalid_scope → báo lỗi, không phiên
  M.keyScopes.delete('url:GET|/api/v1/progress/:id');
  const dn2 = await dangNhap(M, base);
  assert.strictEqual(dn2.cb.searchParams.get('error'), 'invalid_scope');
  const loc2 = new URL(dn2.r3.headers.location, 'http://x');
  assert.strictEqual(loc2.searchParams.get('ma'), 'thieu_scope');
  assert.ok(!loc2.searchParams.get('thieu') || loc2.searchParams.get('thieu') === 'url:GET|/api/v1/progress/:id', loc2.search);
  M.keyScopes.add('url:GET|/api/v1/progress/:id');
  // CANVAS_SCOPES=none khi khoá không bật Enforce Scopes
  M.requireScopes = false; process.env.CANVAS_SCOPES = 'none';
  const dn3 = await dangNhap(M, base);
  assert.ok(!dn3.loc.searchParams.has('scope'));
  assert.strictEqual(dn3.r3.headers.location, '/?canvas=ok');
}));

test('OAuth: redirect_uri theo APP_URL (khớp nguyên văn), Host/X-Forwarded-Host lạ không lọt vào redirect_uri', () => moiTruong((M, base) => ({ APP_URL: base + '/' }), async ({ M, base }) => {
  // APP_URL có "/" cuối vẫn ra đúng chuỗi đã khai báo
  let r = await raw(base, 'GET', '/api/canvas?op=login', { 'x-forwarded-host': 'evil.example' });
  assert.strictEqual(new URL(r.headers.location).searchParams.get('redirect_uri'), base + '/api/canvas?op=callback');
  // không APP_URL: tên miền lạ (đúng dạng) → redirect_uri lạ → Canvas (khớp nguyên văn) từ chối, không có mã
  delete process.env.APP_URL;
  r = await raw(base, 'GET', '/api/canvas?op=login', { 'x-forwarded-host': 'evil.example' });
  const loc = new URL(r.headers.location);
  assert.strictEqual(loc.searchParams.get('redirect_uri'), 'http://evil.example/api/canvas?op=callback');
  const c = await raw(M.base, 'GET', loc.pathname + loc.search);
  assert.strictEqual(c.status, 400, 'Canvas từ chối redirect_uri không khai báo');
  assert.ok(!c.headers.location);
  // tên miền sai dạng (tiêm đường dẫn/ký tự) → 400, không chuyển hướng
  for (const h of ['evil.example/x?', 'a b', 'evil.example"', 'evil.example\\@x', 'evil.example:99999x', '[::1', '-x.example']) {
    r = await raw(base, 'GET', '/api/canvas?op=login', { 'x-forwarded-host': h });
    assert.strictEqual(r.status, 400, h); assert.ok(!r.headers.location, h);
  }
  // APP_URL sai dạng → tắt OAuth với lý do rõ
  for (const a of ['https://web.example/?x=1', 'https://web.example/#a', 'javascript:alert(1)', 'http://web.example', 'https://u:p@web.example']) {
    const ch = I.readConfig({ CANVAS_BASE_URL: 'https://4015.instructure.com', CANVAS_CLIENT_ID: 'c', CANVAS_CLIENT_SECRET: 's', SESSION_SECRET: BI_MAT, APP_URL: a });
    assert.strictEqual(ch.oauth, false, a); assert.ok(/APP_URL/.test(ch.loiOauth), a);
  }
  const ch = I.readConfig({ CANVAS_BASE_URL: 'https://4015.instructure.com', CANVAS_CLIENT_ID: 'c', CANVAS_CLIENT_SECRET: 's', SESSION_SECRET: BI_MAT, APP_URL: 'https://nganhang.nshm.vn/' });
  assert.strictEqual(ch.appUrl, 'https://nganhang.nshm.vn'); assert.strictEqual(ch.oauth, true);
}));

test('Cookie __Host- trên https: Secure/Path=/ không Domain; cookie "ném" từ tên miền con (tên trần) bị bỏ qua', () => moiTruong({}, async ({ M, base }) => {
  const h = { 'x-forwarded-proto': 'https' };
  const dn = await dangNhap(M, base, h);
  assert.strictEqual(dn.r3.headers.location, '/?canvas=ok');
  const ck = layCookie(dn.r3.headers, '__Host-nh_canvas');
  assert.ok(/; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/.test(ck.raw) && !/Domain=/i.test(ck.raw), ck.raw);
  assert.ok(!layCookie(dn.r3.headers, 'nh_canvas'), 'không đặt tên trần trên https');
  // phiên đúng tên → đã đăng nhập; cùng giá trị nhưng tên trần (cookie ném từ *.nshm.vn) → không
  let r = await raw(base, 'GET', '/api/canvas?op=config', Object.assign({ cookie: '__Host-nh_canvas=' + dn.phien }, h));
  assert.strictEqual(r.json.loggedIn, true);
  r = await raw(base, 'GET', '/api/canvas?op=config', Object.assign({ cookie: 'nh_canvas=' + dn.phien }, h));
  assert.strictEqual(r.json.loggedIn, false);
  // state ném (tên trần) không qua được kiểm state trên https
  const lg = await raw(base, 'GET', '/api/canvas?op=login', h);
  const st = layCookie(lg.headers, '__Host-nh_canvas_st').value;
  r = await raw(base, 'GET', '/api/canvas?op=callback&code=' + hex64() + '&state=' + st, Object.assign({ cookie: 'nh_canvas_st=' + st }, h));
  assert.strictEqual(r.headers.location, '/?canvas=loi&ma=state');
  // http cục bộ: tên trần, không Secure
  const l2 = await raw(base, 'GET', '/api/canvas?op=login');
  assert.ok(/^nh_canvas_st=[0-9a-f]{36}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600$/.test(layCookie(l2.headers, 'nh_canvas_st').raw));
}));

/* ===================== 6. Làm mới token, scope, đăng xuất ===================== */

test('Làm mới: Canvas không trả refresh_token mới (giữ cũ); yêu cầu song song làm mới trước → 401 → làm mới lần 2 vẫn thành công', () => moiTruong({}, async ({ M, base }) => {
  const dn = await dangNhap(M, base);
  const p0 = I.decryptSession(dn.phien, BI_MAT);
  const rec = M.tokens.get(p0.access_token);
  // token sắp hết hạn → làm mới trước khi gọi; sau đó "một tab khác" làm mới tiếp (token vừa nhận chết ngay)
  rec.expiresAt = Date.now() + 5e3;
  const sapHet = I.encryptSession(Object.assign({}, p0, { expires_at: Date.now() + 5e3 }), BI_MAT);
  M.sauLamMoi = r => M.taoLai(r);
  const r = await raw(base, 'GET', '/api/canvas?op=me', { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + sapHet });
  assert.strictEqual(r.status, 200, r.body);
  assert.strictEqual(M.refreshCount, 2, 'làm mới trước + làm mới lần 2 sau 401');
  const ckMoi = [].concat(r.headers['set-cookie']).filter(c => c.startsWith(I.COOKIE_SESSION + '='));
  assert.strictEqual(ckMoi.length, 1, 'mỗi phản hồi đặt cookie phiên đúng MỘT lần');
  const p1 = I.decryptSession(layCookie(r.headers, I.COOKIE_SESSION).value, BI_MAT);
  assert.strictEqual(p1.refresh_token, p0.refresh_token, 'giữ refresh_token cũ (Canvas không trả cái mới)');
  assert.strictEqual(p1.access_token, rec.access, 'cookie mang token còn sống');
  assert.strictEqual(p1.exp, p0.exp, 'không kéo dài hạn tuyệt đối của phiên');
  // cookie cũ (token đã chết, expires_at còn xa) → 401 → làm mới → vẫn chạy (tự lành)
  const cu = I.encryptSession(Object.assign({}, p0, { expires_at: Date.now() + 3000e3 }), BI_MAT);
  const r2 = await raw(base, 'GET', '/api/canvas?op=me', { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + cu });
  assert.strictEqual(r2.status, 200);
  // refresh_token bị thu hồi → 401 het_phien + xoá cookie
  M.refreshes.delete(p0.refresh_token);
  M.taoLai(rec);
  const r3 = await raw(base, 'GET', '/api/canvas?op=me', { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + cu });
  assert.strictEqual(r3.status, 401); assert.strictEqual(r3.json.code, 'het_phien');
  assert.ok(/nh_canvas=;.*Max-Age=0/.test([].concat(r3.headers['set-cookie']).join('\n')));
}));

test('401 thiếu scope (không WWW-Authenticate) → 403 thieu_scope, KHÔNG làm mới token', () => moiTruong((M) => ({ CANVAS_SCOPES: I.SCOPES.filter(s => !/progress/.test(s)).join(' ') }), async ({ M, base }) => {
  const dn = await dangNhap(M, base);
  const truoc = M.refreshCount;
  const r = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/progress/5'), { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + dn.phien });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'thieu_scope');
  assert.ok(/scope/.test(r.json.error) && /\/api\/v1\/progress\/:id/.test(r.json.error), r.json.error);
  assert.strictEqual(M.refreshCount, truoc, 'không làm mới vô ích');
  assert.ok(!r.headers['set-cookie'] || ![].concat(r.headers['set-cookie']).some(c => /^nh_canvas=;/.test(c)), 'không xoá phiên');
}));

test('Đăng xuất: chỉ POST + X-NH-Client; thu hồi cả khi access_token đã hết hạn (làm mới rồi DELETE) → refresh_token chết', () => moiTruong({}, async ({ M, base }) => {
  const dn = await dangNhap(M, base);
  const p0 = I.decryptSession(dn.phien, BI_MAT);
  const ck = { cookie: I.COOKIE_SESSION + '=' + dn.phien };
  let r = await raw(base, 'GET', '/api/canvas?op=logout', ck);
  assert.strictEqual(r.status, 405);
  r = await raw(base, 'POST', '/api/canvas?op=logout', ck);
  assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'csrf');
  assert.strictEqual(M.revoked.length, 0, 'GET / thiếu tiêu đề không thu hồi gì');
  // access_token hết hạn (người dùng để máy > 1 giờ)
  M.tokens.get(p0.access_token).expiresAt = Date.now() - 1000;
  const cu = I.encryptSession(Object.assign({}, p0, { expires_at: Date.now() - 1000 }), BI_MAT);
  r = await raw(base, 'POST', '/api/canvas?op=logout', { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + cu });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.revoked, true);
  assert.strictEqual(M.revoked.length, 1);
  assert.ok(!M.refreshes.has(p0.refresh_token), 'refresh_token chết theo');
  const sc = [].concat(r.headers['set-cookie']).filter(c => c.startsWith(I.COOKIE_SESSION + '='));
  assert.deepStrictEqual(sc.length, 1); assert.ok(/^nh_canvas=;.*Max-Age=0/.test(sc[0]), 'chỉ còn lệnh xoá cookie: ' + sc[0]);
  // expires_at còn xa nhưng Canvas đã coi là hết hạn → DELETE 401 → làm mới → DELETE lại
  const dn2 = await dangNhap(M, base);
  const p2 = I.decryptSession(dn2.phien, BI_MAT);
  M.tokens.get(p2.access_token).expiresAt = Date.now() - 1;
  r = await raw(base, 'POST', '/api/canvas?op=logout', { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + dn2.phien });
  assert.strictEqual(r.json.revoked, true);
  assert.ok(!M.refreshes.has(p2.refresh_token));
  // phiên đã chết hẳn → vẫn xoá cookie, không lỗi
  r = await raw(base, 'POST', '/api/canvas?op=logout', { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + dn2.phien });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.revoked, false);
}));

/* ===================== 7. Mã hoá cookie ===================== */

test('Cookie phiên AES-256-GCM: mọi byte bị sửa đều hỏng, đổi SESSION_SECRET = phiên cũ vô hiệu, AAD gắn tên cookie, bắt buộc exp', () => {
  const p = { access_token: 'tok-AAA', refresh_token: 'ref-BBB', expires_at: Date.now() + 3600e3, user: { id: '1', name: 'A' }, iat: Date.now(), exp: Date.now() + 3600e3 };
  const c = I.encryptSession(p, BI_MAT);
  assert.ok(!/tok-AAA|ref-BBB/.test(c) && !/tok-AAA|ref-BBB/.test(Buffer.from(c.slice(3), 'base64').toString('latin1')));
  const b = Buffer.from(c.slice(3).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  for (let i = 0; i < b.length; i++) {
    for (const bit of [1, 0x80]) {
      const x = Buffer.from(b); x[i] ^= bit;
      assert.strictEqual(I.decryptSession('v1.' + b64url(x), BI_MAT), null, 'byte ' + i);
    }
  }
  // xoay khoá: bí mật mới không đọc được phiên cũ (người dùng đăng nhập lại)
  assert.strictEqual(I.decryptSession(c, BI_MAT + '-moi'), null);
  assert.deepStrictEqual(I.decryptSession(c, BI_MAT), p);
  // khoá dẫn xuất scrypt(secret, muối cố định) + AAD = tên cookie: bản mã với AAD khác (ví dụ cookie state) bị từ chối
  const khoa = crypto.scryptSync(BI_MAT, 'canvas-nganhang/phien/v1', 32);
  const ma = (obj, aad) => {
    const iv = crypto.randomBytes(12), ci = crypto.createCipheriv('aes-256-gcm', khoa, iv);
    if (aad) ci.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([ci.update(Buffer.from(JSON.stringify(obj))), ci.final()]);
    return 'v1.' + b64url(Buffer.concat([iv, ci.getAuthTag(), ct]));
  };
  assert.deepStrictEqual(I.decryptSession(ma(p, 'nh_canvas'), BI_MAT), p, 'KDF đúng như tài liệu');
  assert.strictEqual(I.decryptSession(ma(p, 'nh_canvas_st'), BI_MAT), null, 'AAD khác');
  assert.strictEqual(I.decryptSession(ma(p, null), BI_MAT), null, 'không AAD');
  // nội dung hợp lệ về mật mã nhưng sai cấu trúc
  assert.strictEqual(I.decryptSession(ma(Object.assign({}, p, { exp: undefined }), 'nh_canvas'), BI_MAT), null, 'thiếu exp → không sống mãi');
  assert.strictEqual(I.decryptSession(ma(Object.assign({}, p, { exp: String(p.exp) }), 'nh_canvas'), BI_MAT), null, 'exp phải là số');
  assert.strictEqual(I.decryptSession(ma(Object.assign({}, p, { exp: Date.now() - 1 }), 'nh_canvas'), BI_MAT), null, 'quá hạn');
  assert.strictEqual(I.decryptSession(ma(Object.assign({}, p, { access_token: 5 }), 'nh_canvas'), BI_MAT), null);
  assert.strictEqual(I.decryptSession(ma([1, 2], 'nh_canvas'), BI_MAT), null);
  assert.strictEqual(I.decryptSession(ma('chuoi', 'nh_canvas'), BI_MAT), null);
  // IV không lặp
  const ivs = new Set();
  for (let i = 0; i < 500; i++) ivs.add(I.encryptSession(p, BI_MAT).slice(3, 19));
  assert.strictEqual(ivs.size, 500);
  // rác / quá dài / thiếu bí mật
  for (const v of [undefined, null, '', 'v1.', 'v1.' + 'A'.repeat(20), 'v1.' + 'A'.repeat(100000), 'v1.a.b', 'v1.' + c.slice(3) + '=', ' ' + c]) assert.strictEqual(I.decryptSession(v, BI_MAT), null, String(v).slice(0, 20));
  assert.strictEqual(I.decryptSession(c, ''), null);
  // PKCE verifier: tất định theo (state, bí mật), khác bí mật → khác
  const st = crypto.randomBytes(18).toString('hex');
  assert.strictEqual(I.pkceVerifier(st, BI_MAT), I.pkceVerifier(st, BI_MAT));
  assert.notStrictEqual(I.pkceVerifier(st, BI_MAT), I.pkceVerifier(st, BI_MAT + 'x'));
  assert.notStrictEqual(I.pkceVerifier(st, BI_MAT), I.pkceVerifier(st.replace(/.$/, '0'), BI_MAT));
  // mã nguồn: so state bằng crypto.timingSafeEqual
  const nguon = fs.readFileSync(path.join(GOC, 'api/canvas.js'), 'utf8');
  assert.ok(/timingSafeEqual/.test(nguon) && /soSanhAnToan\(state, stateCookie\)/.test(nguon));
});

/* ===================== 8. Lỗi không lộ bí mật ===================== */

test('Mọi phản hồi lỗi không chứa client_secret, SESSION_SECRET, token, verifier', () => moiTruong({ ALLOW_PERSONAL_TOKEN: '1' }, async ({ M, base }) => {
  const dn = await dangNhap(M, base);
  const p = I.decryptSession(dn.phien, BI_MAT);
  const tkCaNhan = M.taoToken(null).access;
  const bi = [BI_MAT_KHOA, BI_MAT, p.access_token, p.refresh_token, tkCaNhan, I.pkceVerifier(dn.loc.searchParams.get('state'), BI_MAT)];
  const phanHoi = [];
  const goi = async (m, u, h, b) => { const r = await raw(base, m, u, h, b); phanHoi.push(r); return r; };
  const ck = I.COOKIE_SESSION + '=' + dn.phien;
  await goi('GET', '/api/canvas?op=config', { cookie: ck });
  await goi('GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/accounts/1'), { 'x-nh-client': '1', cookie: ck });
  await goi('GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations/424242'), { 'x-nh-client': '1', cookie: ck });
  await goi('GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/progress/777'), { 'x-nh-client': '1', cookie: ck });
  await goi('POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations'), { 'x-nh-client': '1', cookie: ck, 'content-type': 'application/json' }, '{sai');
  await goi('GET', '/api/canvas?op=me', { 'x-nh-client': '1', 'x-canvas-token': tkCaNhan + '"' });
  await goi('GET', '/api/canvas?op=me', { 'x-nh-client': '1', 'x-canvas-token': 'tok-gia-12345678' });
  await goi('POST', '/api/canvas?op=upload&course=1&migration=1&url=' + encodeURIComponent('https://evil.example/'), { 'x-nh-client': '1', cookie: ck, 'content-type': 'multipart/form-data; boundary=b' }, '--b--');
  await goi('GET', '/api/canvas?op=callback&code=' + hex64() + '&state=' + 'a'.repeat(36), { cookie: I.COOKIE_STATE + '=' + 'a'.repeat(36) });
  // client_secret sai → Canvas từ chối đổi mã
  M.secret = 'khac';
  const lg = await raw(base, 'GET', '/api/canvas?op=login'); const st = layCookie(lg.headers, I.COOKIE_STATE).value;
  await goi('GET', '/api/canvas?op=callback&code=' + hex64() + '&state=' + st, { cookie: I.COOKIE_STATE + '=' + st });
  M.secret = BI_MAT_KHOA;
  // token hết hạn + refresh bị Canvas từ chối
  M.refreshes.clear(); M.tokens.clear();
  await goi('GET', '/api/canvas?op=me', { 'x-nh-client': '1', cookie: ck });
  // Canvas không tới được
  process.env.CANVAS_BASE_URL = 'http://127.0.0.1:1';
  await goi('GET', '/api/canvas?op=me', { 'x-nh-client': '1', cookie: ck });
  await goi('GET', '/api/canvas?op=login');
  // cấu hình thiếu/sai
  process.env.SESSION_SECRET = 'ngan';
  await goi('GET', '/api/canvas?op=config');
  await goi('GET', '/api/canvas?op=login');
  delete process.env.CANVAS_BASE_URL;
  await goi('GET', '/api/canvas?op=config');
  await goi('GET', '/api/canvas?op=proxy&path=%2Fapi%2Fv1%2Fusers%2Fself', { 'x-nh-client': '1' });
  assert.ok(phanHoi.length >= 15);
  for (const r of phanHoi) {
    const text = r.body + '\n' + JSON.stringify(r.headers);
    for (const s of bi) assert.ok(!text.includes(s), 'lộ "' + s.slice(0, 12) + '…" trong ' + r.status + ' ' + r.body.slice(0, 120));
    assert.ok(!/at [A-Za-z.]+ \(|node:internal|\.js:\d+/.test(r.body), 'lộ stack: ' + r.body.slice(0, 200));
    if (r.status >= 500) assert.ok(r.status === 502, 'lỗi máy chủ chỉ là 502 có thông điệp chung: ' + r.status);
  }
}));

/* ===================== 9. Đặc thù Vercel ===================== */

test('Vercel: req.body đã phân tích (đối tượng/chuỗi/getter ném), x-forwarded-proto → __Host-', async () => {
  const { M, sv: svC } = taoCanvas();
  M.base = await nghe(svC);
  try {
    await voiEnv({ CANVAS_BASE_URL: M.base, ALLOW_PERSONAL_TOKEN: '1', CANVAS_CLIENT_ID: 'cid', CANVAS_CLIENT_SECRET: BI_MAT_KHOA, SESSION_SECRET: BI_MAT, APP_URL: 'https://nganhang.nshm.vn' }, async () => {
      const tk = M.taoToken(null).access;
      const { Readable } = require('stream');
      const goi = async (o) => {
        const req = Readable.from([]);
        await new Promise(ok => { req.on('end', ok); req.resume(); });
        Object.assign(req, { method: o.method || 'POST', url: o.url, headers: Object.assign({ 'x-nh-client': '1', 'x-canvas-token': tk, 'content-type': 'application/json', host: 'nganhang.nshm.vn', 'x-forwarded-proto': 'https' }, o.headers || {}) });
        if (o.getterNem) Object.defineProperty(req, 'body', { get() { throw new Error('Invalid JSON'); } });
        else if ('body' in o) req.body = o.body;
        const out = { headers: {}, status: 0, body: '' };
        const res = { statusCode: 200, headersSent: false, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, end(b) { out.status = this.statusCode; out.body = b ? b.toString() : ''; } };
        await handler(req, res);
        return out;
      };
      const uMig = '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations');
      let o = await goi({ url: uMig, body: { migration_type: 'qti_converter', as_user_id: '7' } });
      assert.strictEqual(o.status, 403, 'as_user_id trong req.body đã phân tích');
      o = await goi({ url: uMig, body: { migration_type: 'qti_converter', access_token: 'x' } });
      assert.strictEqual(o.status, 403);
      o = await goi({ url: uMig, body: '{sai' });
      assert.strictEqual(o.status, 400);
      o = await goi({ url: uMig, getterNem: true });
      assert.strictEqual(o.status, 400);
      o = await goi({ url: uMig, body: { migration_type: 'qti_converter', settings: { question_bank_name: 'A' } } });
      assert.strictEqual(o.status, 200, o.body);
      assert.strictEqual(JSON.parse(M.log[M.log.length - 1].body).settings.question_bank_name, 'A');
      // login sau proxy https: cookie __Host- + Secure, redirect_uri theo APP_URL
      o = await goi({ method: 'GET', url: '/api/canvas?op=login', headers: { 'x-forwarded-host': 'evil.example' } });
      assert.strictEqual(o.status, 302);
      const sc = [].concat(o.headers['set-cookie']);
      assert.ok(sc.length === 1 && /^__Host-nh_canvas_st=[0-9a-f]{36}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/.test(sc[0]), sc[0]);
      assert.strictEqual(new URL(o.headers.location).searchParams.get('redirect_uri'), 'https://nganhang.nshm.vn/api/canvas?op=callback');
    });
  } finally { await dong(svC); }
});

/* ===================== 10. server.js ===================== */

test('server.js: tên ngắn 8.3 (ENV~1, GIT~1), dấu chấm cuối, ADS, hoa/thường không lộ .env/.git/api', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-bm-'));
  fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><title>x</title>');
  fs.writeFileSync(path.join(tmp, '.env'), 'SESSION_SECRET=BI-MAT-ENV');
  fs.writeFileSync(path.join(tmp, '.env.local'), 'CANVAS_CLIENT_SECRET=BI-MAT-ENV2');
  fs.mkdirSync(path.join(tmp, '.git')); fs.writeFileSync(path.join(tmp, '.git', 'config'), '[remote] BI-MAT-GIT');
  fs.mkdirSync(path.join(tmp, 'api')); fs.writeFileSync(path.join(tmp, 'api', 'canvas.js'), 'NGUON-API-BI-MAT');
  fs.mkdirSync(path.join(tmp, 'js')); fs.writeFileSync(path.join(tmp, 'js', 'a.js'), 'var a;');
  const sv = may.createServer({ root: tmp, handler: (q, s) => s.end('api') });
  const base = await nghe(sv);
  try {
    const ds8 = [];
    for (let i = 1; i <= 4; i++) ds8.push('/ENV~' + i, '/env~' + i, '/GIT~' + i + '/config', '/ENVLOC~' + i, '/ENV~' + i + '.LOC');
    for (const p of ds8.concat(['/.env', '/%2eenv', '/.ENV', '/.env.', '/.env%20', '/.env::$DATA', '/.git/config', '/.GIT/CONFIG', '/api/canvas.js', '/API/CANVAS.JS',
      '/api./canvas.js', '/api%20/canvas.js', '/Api/canvas.js', '/js/../.env', '/js/..%2f.env', '/js%2f..%2f.env', '/js\\..\\.env', '/index.html.', '/index.html%20',
      '/index.html::$DATA', '/js/a.js::$DATA', '/C:/Windows/win.ini', '/js/'])) {
      const r = await raw(base, 'GET', p);
      assert.ok([400, 403, 404].includes(r.status), p + ' → ' + r.status);
      assert.ok(!/BI-MAT|NGUON-API/.test(r.body), 'lộ qua ' + p);
    }
    let r = await raw(base, 'GET', '/js/a.js');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
    r = await raw(base, 'GET', '/js/');   // thư mục không có index.html: 404, không liệt kê
    assert.strictEqual(r.status, 404); assert.ok(!/a\.js/.test(r.body));
    // kiểm trên đường dẫn thật (sau realpath.native)
    for (const x of ['.env', 'sub' + path.sep + '.git' + path.sep + 'config', 'api' + path.sep + 'canvas.js', 'API' + path.sep + 'x.js', '..' + path.sep + 'x', '', path.resolve('/x')]) assert.ok(!may.isServable(x), JSON.stringify(x));
    for (const x of ['index.html', 'js' + path.sep + 'app.js', 'mau' + path.sep + 'Mau.docx', 'apix' + path.sep + 'a.js']) assert.ok(may.isServable(x), x);
  } finally { await dong(sv); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (e) { /* Windows còn giữ tệp: bỏ qua */ } }
});

test('server.js: chống DNS rebinding (Host lạ → 403 cả file tĩnh lẫn /api/canvas); bind mặc định 127.0.0.1', async () => {
  let goiApi = 0;
  const sv = may.createServer({ root: GOC, handler: (q, s) => { goiApi++; s.end('api'); } });
  const base = await nghe(sv);
  const port = new URL(base).port;
  try {
    for (const h of ['evil.example', 'evil.example:' + port, '127.0.0.1.nip.io:' + port, 'localhost.evil.example', '192.168.1.5:' + port, '0.0.0.0:' + port, '[::ffff:7f00:1]:' + port]) {
      for (const p of ['/index.html', '/api/canvas?op=config']) {
        const r = await raw(base, 'GET', p, { host: h });
        assert.strictEqual(r.status, 403, h + ' ' + p);
      }
    }
    // HTTP/1.0 không có Host → 403
    const khongHost = await new Promise((ok, loi) => {
      const s = net.connect(Number(port), '127.0.0.1', () => s.write('GET /index.html HTTP/1.0\r\n\r\n'));
      let b = ''; s.on('data', d => { b += d; }); s.on('end', () => ok(b)); s.on('error', loi);
    });
    assert.ok(/^HTTP\/1\.[01] 403/.test(khongHost), khongHost.slice(0, 40));
    assert.strictEqual(goiApi, 0);
    for (const h of ['localhost:' + port, '127.0.0.1:' + port, 'LOCALHOST:' + port, '[::1]:' + port, 'nganhang.localhost:' + port, '127.0.0.1']) {
      const r = await raw(base, 'GET', '/index.html', { host: h });
      assert.strictEqual(r.status, 200, h);
    }
    assert.ok(may.isLocalHost('localhost') && !may.isLocalHost('localhost.') && !may.isLocalHost('evil.localhost.com'));
  } finally { await dong(sv); }
  // chạy thật: node server.js, PORT=0, không đặt HOST → chỉ nghe 127.0.0.1
  const env = Object.assign({}, process.env, { PORT: '0' });
  delete env.HOST;
  const con = cp.spawn(process.execPath, [path.join(GOC, 'server.js')], { cwd: GOC, env, windowsHide: true });
  try {
    const dong1 = await new Promise((ok, loi) => {
      let buf = '', loiRa = '';
      const t = setTimeout(() => loi(new Error('server.js không khởi động: ' + buf + loiRa)), 15000);
      con.stdout.on('data', d => { buf += d; const m = /http:\/\/([^/]+)\//.exec(buf); if (m) { clearTimeout(t); ok(m[1]); } });
      con.stderr.on('data', d => { loiRa += d; });
      con.on('exit', c => { clearTimeout(t); loi(new Error('server.js thoát ' + c + ': ' + buf + loiRa)); });
    });
    assert.ok(/^127\.0\.0\.1:\d+$/.test(dong1), 'mặc định 127.0.0.1: ' + dong1);
    const pt = Number(dong1.split(':')[1]);
    await new Promise((ok, loi) => { const s = net.connect(pt, '127.0.0.1', () => { s.end(); ok(); }); s.on('error', loi); });
    // địa chỉ LAN của máy (nếu có) không kết nối được
    const lan = Object.values(os.networkInterfaces()).flat().find(x => x && x.family === 'IPv4' && !x.internal);
    if (lan) {
      const tc = await new Promise(ok => { const s = net.connect(pt, lan.address, () => { s.end(); ok(true); }); s.on('error', () => ok(false)); setTimeout(() => { s.destroy(); ok(false); }, 1500); });
      assert.strictEqual(tc, false, 'không nghe trên ' + lan.address);
    }
  } finally { con.kill(); }
});

/* ===================== 11. js/canvas-api.js ===================== */

test('canvas-api: token cá nhân chỉ ở sessionStorage (không localStorage), không vào URL, không gửi tới máy nhận file', async () => {
  // nạp như script trình duyệt
  const kho = {}, khoLau = {};
  const ss = { getItem: k => (k in kho ? kho[k] : null), setItem: (k, v) => { kho[k] = String(v); }, removeItem: k => { delete kho[k]; } };
  const ls = { getItem: k => (k in khoLau ? khoLau[k] : null), setItem: (k, v) => { khoLau[k] = String(v); }, removeItem: k => { delete khoLau[k]; } };
  const ctx = { self: { sessionStorage: ss, localStorage: ls }, URL, setTimeout, Promise };
  vm.runInNewContext(fs.readFileSync(path.join(GOC, 'js/canvas-api.js'), 'utf8'), ctx);
  const b = ctx.self.NH.canvasApi;
  b.setPersonalToken('Bearer 1~TOKENBIMAT');
  assert.strictEqual(kho['nh-canvas-token'], '1~TOKENBIMAT');
  assert.deepStrictEqual(khoLau, {}, 'không bao giờ ghi localStorage');
  b.clearPersonalToken();
  assert.ok(!('nh-canvas-token' in kho));
  // nguồn: không dùng localStorage, không nối token vào URL
  const nguon = fs.readFileSync(path.join(GOC, 'js/canvas-api.js'), 'utf8');
  assert.ok(!/localStorage/.test(nguon));
  assert.ok(!/console\.(log|info|warn|error|debug)/.test(nguon), 'không ghi log');
  // isInstFs chặt: https, cổng mặc định, đúng tên miền
  for (const u of ['https://inst-fs-sin-prod.inscloudgate.net/files?token=a', 'https://inst-fs-iad.instructure.com/x']) assert.ok(capi.isInstFs(u), u);
  for (const u of ['http://inst-fs-sin-prod.inscloudgate.net/files', 'https://inst-fs-sin-prod.inscloudgate.net:8443/f', 'https://u:p@inst-fs-sin-prod.inscloudgate.net/f',
    'https://inscloudgate.net.evil.example/', 'https://evil.example/inscloudgate.net', 'https://4015.instructure.com/files', 'https://bucket.s3.amazonaws.com/', 'javascript:1', '']) assert.ok(!capi.isInstFs(u), u);

  // import đầy đủ ở chế độ token cá nhân: ghi lại mọi fetch
  const ghi = [];
  const TOK = '1~TOKENBIMAT';
  const UP = 'https://inst-fs-sin-prod.inscloudgate.net/files?token=jwt-1';
  let trangThai = 'pre_processing';
  const f = async (url, init) => {
    ghi.push({ url: String(url), init });
    const tl = (st, o, h) => new Response(JSON.stringify(o), { status: st, headers: Object.assign({ 'content-type': 'application/json' }, h || {}) });
    if (String(url) === UP) { trangThai = 'completed'; return tl(201, { id: 1 }); }
    const u = new URL(url, 'http://web.local');
    const p = u.searchParams.get('path') || '';
    if (/content_migrations$/.test(p)) return tl(200, { id: '9', workflow_state: 'pre_processing', pre_attachment: { upload_url: UP, upload_params: { filename: 'a.zip' } } });
    if (/content_migrations\/9$/.test(p)) return tl(200, { id: '9', workflow_state: trangThai });
    if (/migration_issues/.test(p)) return tl(200, []);
    return tl(404, { error: 'x' });
  };
  const c = capi.create({ apiBase: '/api/canvas', fetch: f, storage: ss, sleep: () => Promise.resolve() });
  c.setPersonalToken(TOK);
  const kq = await c.importPackage('1', { bytes: new Uint8Array([80, 75, 3, 4]), fileName: 'a.zip' });
  assert.strictEqual(kq.ok, true);
  assert.ok(ghi.every(x => !x.url.includes(TOK) && !decodeURIComponent(x.url).includes(TOK)), 'token không bao giờ trong URL');
  const den = ghi.filter(x => x.url.startsWith('/api/canvas'));
  assert.ok(den.length >= 3 && den.every(x => x.init.headers['X-Canvas-Token'] === TOK && x.init.credentials === 'same-origin'));
  const tai = ghi.filter(x => x.url === UP);
  assert.strictEqual(tai.length, 1);
  const ti = tai[0].init;
  assert.strictEqual(ti.credentials, 'omit', 'không cookie');
  assert.strictEqual(ti.referrerPolicy, 'no-referrer');
  assert.ok(!ti.headers, 'không tiêu đề nào (không token, không X-NH-Client → không preflight)');
  // upload_url lạ (không phải inst-fs) → KHÔNG POST thẳng; đi qua op=upload kèm course + migration để máy chủ kiểm
  ghi.length = 0; trangThai = 'pre_processing';
  const f2 = async (url, init) => {
    ghi.push({ url: String(url), init });
    const tl = (st, o) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
    const u = new URL(url, 'http://web.local');
    if (u.searchParams.get('op') === 'upload') return tl(403, { error: 'Địa chỉ tải lên không thuộc máy chủ của Canvas.', code: 'khong_cho_phep' });
    const p = u.searchParams.get('path') || '';
    if (/content_migrations$/.test(p)) return tl(200, { id: '10', workflow_state: 'pre_processing', pre_attachment: { upload_url: 'http://inst-fs-sin-prod.inscloudgate.net/files?token=x', upload_params: {} } });
    return tl(404, {});
  };
  const c2 = capi.create({ apiBase: '/api/canvas', fetch: f2, storage: null, sleep: () => Promise.resolve() });
  await assert.rejects(c2.importPackage('1', { bytes: new Uint8Array([80, 75]), fileName: 'b.zip' }), e => e.status === 403 && !String(e.message).includes(TOK));
  assert.ok(!ghi.some(x => /^https?:\/\/inst-fs/.test(x.url)), 'không gửi gói qua http');
  const up = ghi.find(x => /op=upload/.test(x.url));
  assert.ok(/[?&]course=1&migration=10&url=http%3A%2F%2Finst-fs/.test(up.url), up.url);
});

test('canvas-api: yêu cầu tới máy chủ trung gian chạy LẦN LƯỢT (không làm mới token song song); đăng xuất xếp sau', () => moiTruong({}, async ({ M, base }) => {
  const dn = await dangNhap(M, base);
  const p0 = I.decryptSession(dn.phien, BI_MAT);
  M.tokens.get(p0.access_token).expiresAt = Date.now() + 5e3;
  const jar = taoJar(); jar.jar[I.COOKIE_SESSION] = I.encryptSession(Object.assign({}, p0, { expires_at: Date.now() + 5e3 }), BI_MAT);
  const c = capi.create({ apiBase: base + '/api/canvas', fetch: fetchVoiJar(jar, base), storage: null, sleep: () => Promise.resolve() });
  const truoc = M.refreshCount;
  M.maxInFlight = 0;
  const [me, banks, quyen] = await Promise.all([c.me(), c.listBanks('1'), c.checkPermissions('1'), c.listCourses()]);
  assert.strictEqual(me.id, '42'); assert.deepStrictEqual(banks, []); assert.strictEqual(quyen.ok, true);
  assert.strictEqual(M.maxInFlight, 1, 'Canvas không bao giờ nhận hai yêu cầu chồng nhau');
  assert.strictEqual(M.refreshCount - truoc, 1, 'chỉ MỘT lần làm mới cho cả loạt yêu cầu');
  // đăng xuất gọi cùng lúc với một yêu cầu: chạy sau nó và thu hồi đúng token hiện hành
  const [, out] = await Promise.all([c.me(), c.logout()]);
  assert.strictEqual(out.ok, true);
  const cuoi = M.log.filter(x => x.path === '/login/oauth2/token' && x.method === 'DELETE').pop();
  const meCuoi = M.log.filter(x => x.path === '/api/v1/users/self').pop();
  assert.ok(M.log.indexOf(cuoi) > M.log.indexOf(meCuoi));
  assert.strictEqual(M.revoked.length, 1);
  assert.strictEqual(M.tokens.size, 0, 'không còn token sống');
}));

/* ===================== 12. js/scorm.js ===================== */

function domTay() {
  const nghe = [];
  const win = { addEventListener(t, f) { if (t === 'message') nghe.push(f); }, removeEventListener(t, f) { const i = nghe.indexOf(f); if (i >= 0) nghe.splice(i, 1); } };
  const den = [];
  const contentWindow = { postMessage(msg, o) { den.push({ msg, o }); } };
  const body = { con: [], appendChild(el) { this.con.push(el); el.parentNode = this; }, removeChild(el) { this.con.splice(this.con.indexOf(el), 1); el.parentNode = null; } };
  const doc = { defaultView: win, body, createElement() { return { attrs: {}, style: {}, parentNode: null, contentWindow, setAttribute(k, v) { this.attrs[k] = v; } }; } };
  return { doc, body, den, contentWindow, nghe, phat: ev => nghe.slice().forEach(f => f(ev)) };
}
const choChut = () => new Promise(ok => setTimeout(ok, 20));

test('scorm iframe: sandbox chỉ allow-scripts; chỉ nhận thư có source = iframe VÀ origin "null"; gửi mã một lần; giới hạn kích thước', async () => {
  const d = domTay();
  const ev = scorm.makeIframeEvaluator(d.doc, { timeout: 2000 });
  let xong = null;
  const p = ev('var A={x:1}', ['A']).then(v => { xong = { v }; }, e => { xong = { e }; });
  const fr = d.body.con[0];
  assert.strictEqual(fr.attrs.sandbox, 'allow-scripts', 'không allow-same-origin / allow-top-navigation / allow-popups / allow-forms');
  assert.ok(/default-src 'none'/.test(fr.srcdoc) && /e\.source!==parent/.test(fr.srcdoc));
  assert.strictEqual(fr.attrs.referrerpolicy, 'no-referrer');
  const khac = { postMessage() { } };
  // trang khác (tab mở bằng window.open, iframe khác) giả "sẵn sàng" → không nhận được mã
  d.phat({ source: khac, origin: 'null', data: { nh: 'scorm-eval-san-sang' } });
  d.phat({ source: d.contentWindow, origin: 'http://127.0.0.1:8787', data: { nh: 'scorm-eval-san-sang' } });
  d.phat({ source: d.contentWindow, origin: 'https://evil.example', data: { nh: 'scorm-eval-san-sang' } });
  assert.strictEqual(d.den.length, 0);
  d.phat({ source: d.contentWindow, origin: 'null', data: { nh: 'scorm-eval-san-sang' } });
  d.phat({ source: d.contentWindow, origin: 'null', data: { nh: 'scorm-eval-san-sang' } });
  assert.strictEqual(d.den.length, 1, 'gửi mã đúng một lần');
  const { id, code } = d.den[0].msg;
  assert.strictEqual(code, 'var A={x:1}');
  // kết quả giả từ nguồn khác / origin khác (dù đúng id) bị bỏ qua
  d.phat({ source: khac, origin: 'null', data: { nh: 'scorm-eval-kq', id, ok: true, json: '{"A":{"x":"gia"}}' } });
  d.phat({ source: d.contentWindow, origin: 'https://evil.example', data: { nh: 'scorm-eval-kq', id, ok: true, json: '{"A":{"x":"gia"}}' } });
  d.phat({ source: d.contentWindow, origin: 'null', data: { nh: 'scorm-eval-kq', id: id + 'x', ok: true, json: '{"A":{"x":"gia"}}' } });
  await choChut();
  assert.strictEqual(xong, null, 'chưa nhận kết quả giả');
  d.phat({ source: d.contentWindow, origin: 'null', data: { nh: 'scorm-eval-kq', id, ok: true, json: '{"A":{"x":1}}' } });
  await p;
  assert.deepStrictEqual(xong, { v: { A: { x: 1 } } });
  assert.strictEqual(d.body.con.length, 0); assert.strictEqual(d.nghe.length, 0);
  // kết quả không phải chuỗi / quá lớn / mã quá lớn
  const thu = async (json) => {
    const d2 = domTay();
    const pr = scorm.makeIframeEvaluator(d2.doc, { timeout: 2000 })('var A=1', ['A']);
    d2.phat({ source: d2.contentWindow, origin: 'null', data: { nh: 'scorm-eval-san-sang' } });
    d2.phat({ source: d2.contentWindow, origin: 'null', data: { nh: 'scorm-eval-kq', id: d2.den[0].msg.id, ok: true, json } });
    return pr;
  };
  await assert.rejects(thu({ A: 1 }), /không phải JSON/);
  await assert.rejects(thu('x'.repeat(48 * 1024 * 1024 + 1)), /quá lớn/);
  const d3 = domTay();
  await assert.rejects(scorm.makeIframeEvaluator(d3.doc)('/*' + 'x'.repeat(16 * 1024 * 1024) + '*/', ['A']), /quá lớn/);
  assert.strictEqual(d3.body.con.length, 0, 'không tạo iframe cho mã quá lớn');
  // hạn giờ: iframe im lặng → reject + gỡ iframe
  const d4 = domTay();
  await assert.rejects(scorm.makeIframeEvaluator(d4.doc, { timeout: 30 })('var A=1', ['A']), /Quá thời gian/);
  assert.strictEqual(d4.body.con.length, 0); assert.strictEqual(d4.nghe.length, 0);
});

test('scorm Node vm: không thoát ra process, vòng lặp đồng bộ/Promise bị hạn giờ, kết quả độc không chạy ngoài hạn giờ', async () => {
  const ne = scorm._internal.nodeEvaluator;
  await assert.rejects(() => Promise.resolve().then(() => ne('var A=this.constructor.constructor("return process")().pid;', ['A'])), /process is not defined|not a function|Cannot read/);
  await assert.rejects(() => Promise.resolve().then(() => ne('var A=(function(){return typeof require+typeof process+typeof globalThis.process})();if(A!=="undefinedundefinedundefined")throw new Error("lộ "+A);', ['A'])).then(() => { throw new Error('ok'); }), /^Error: ok$/);
  let t = Date.now();
  await assert.rejects(() => Promise.resolve().then(() => ne('for(;;){}', ['A'])), /timed out/);
  assert.ok(Date.now() - t < 10000);
  t = Date.now();
  await assert.rejects(() => Promise.resolve().then(() => ne('Promise.resolve().then(function(){for(;;){}}); var A=1;', ['A'])), /timed out/);
  assert.ok(Date.now() - t < 10000, 'vòng lặp trong microtask cũng bị cắt');
  // JSON bị ghi đè trả đối tượng có toString độc → bị từ chối, toString không bao giờ chạy ngoài vm
  await assert.rejects(() => Promise.resolve().then(() => ne('JSON={stringify:function(){return {toString:function(){throw new Error("DOC-CHAY-NGOAI")}}}};var A=1;', ['A'])),
    e => /không phải JSON/.test(e.message) && !/DOC-CHAY-NGOAI/.test(e.message));
  await assert.rejects(() => Promise.resolve().then(() => ne('/*' + 'x'.repeat(16 * 1024 * 1024) + '*/', ['A'])), /quá lớn/);
  assert.deepStrictEqual(await ne('var A=[1,"é"]; const B={c:2};', ['A', 'B']), { A: [1, 'é'], B: { c: 2 } });
});

test('Trang chính không eval: không eval / new Function / setTimeout(chuỗi) trong js/*.js (trừ mã khởi động của iframe sandbox)', () => {
  for (const f of fs.readdirSync(path.join(GOC, 'js')).filter(x => /\.js$/.test(x))) {
    let s = fs.readFileSync(path.join(GOC, 'js', f), 'utf8');
    if (f === 'scorm.js') {
      const a = s.indexOf('var BOOT = '), b = s.indexOf("'<\\/script>';", a);
      assert.ok(a > 0 && b > a, 'tìm thấy BOOT');
      s = s.slice(0, a) + s.slice(b);
    }
    s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!/\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(\s*['"]|set(Timeout|Interval)\s*\(\s*['"`]/.test(s), f + ' có eval/Function');
  }
});

/* ===================== 13. XSS: html.cleanForCanvas ===================== */

test('XSS: cleanForCanvas không để lọt script, on*, javascript:, svg/animate, iframe, style, base/meta/form', () => {
  const mau = [
    '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<IMG SRC=x OnErRoR=alert(1)>', '<img src="x" onerror  =  "alert(1)">',
    '<a href="javascript:alert(1)">x</a>', '<a href="JaVaScRiPt:alert(1)">x</a>', '<a href="java&#9;script:alert(1)">x</a>', '<a href="java\tscript:alert(1)">x</a>',
    '<a href="&#106;&#97;vascript:alert(1)">x</a>', '<a href="javascript&colon;alert(1)">x</a>', '<a href="&#x6A;avascript&#x3A;alert(1)">x</a>', '<a href="\u0001javascript:alert(1)">x</a>',
    '<a href=" javascript:alert(1)">x</a>', '<a href="vbscript:msgbox(1)">x</a>', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    '<svg onload=alert(1)>', '<svg><script>alert(1)</script></svg>', '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>', '<svg><set attributeName="href" to="javascript:alert(1)"/></svg>',
    '<math><maction actiontype="statusline" xlink:href="javascript:alert(1)">x</maction></math>', '<math href="javascript:alert(1)"><mi>x</mi></math>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>', '<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math>',
    '<iframe src="javascript:alert(1)"></iframe>', '<iframe srcdoc="<script>alert(1)</script>"></iframe>', '<object data="x.swf"></object>', '<embed src="x">',
    '<base href="https://evil.example/">', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">', '<link rel=stylesheet href="https://evil.example/x.css">',
    '<form action="https://evil.example"><button formaction="javascript:alert(1)">x</button></form>', '<input autofocus onfocus=alert(1)>',
    '<details open ontoggle=alert(1)>', '<body onload=alert(1)>', '<style>*{background:url(javascript:alert(1))}</style>',
    '<div style="background:url(javascript:alert(1))">x</div>', '<div style="width:expression(alert(1))">x</div>', '<p style="behavior:url(x.htc)">x</p>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">', '<p title="&quot;><img src=x onerror=alert(1)>">x</p>', '<!--<img src=x onerror=alert(1)>-->',
    '<![CDATA[<img src=x onerror=alert(1)>]]>', '<template><img src=x onerror=alert(1)></template>', '<img src="x" srcset="javascript:alert(1)">',
    '<a href="x" target="_top" ping="https://evil.example">x</a>', '<p id="vung-thong-bao" name="NH">x</p>', '<xmp><img src=x onerror=alert(1)></xmp>',
    '<table background="javascript:alert(1)"><tr><td>x</td></tr></table>', '<video><source onerror=alert(1)></video>', '<marquee onstart=alert(1)>x</marquee>'
  ];
  const giaiThucThe = s => s.replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&colon;/gi, ':').replace(/&tab;/gi, '\t').replace(/&newline;/gi, '\n').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const THE_CAM = /^(script|style|iframe|frame|frameset|object|embed|svg|animate|set|animatemotion|animatetransform|foreignobject|base|meta|link|form|button|input|template|noscript|xmp|body|html|video|audio|source|marquee|use)$/i;
  for (const m of mau) {
    const out = html.cleanForCanvas(m, { images: {}, imageMap: {} }).html;
    const theRe = /<\s*([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
    let t;
    while ((t = theRe.exec(out))) {
      assert.ok(!THE_CAM.test(t[1]), m + ' → còn thẻ <' + t[1] + '>: ' + out);
      const atRe = /\s+([^\s=>\/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
      let a;
      while ((a = atRe.exec(t[2]))) {
        const ten = a[1].toLowerCase(), gt = giaiThucThe(String(a[2] || '').replace(/^["']|["']$/g, '')).replace(/[\x00-\x20]/g, '').toLowerCase();
        assert.ok(!/^on/.test(ten), m + ' → còn thuộc tính ' + ten);
        assert.ok(!/^(srcdoc|formaction|xlink:href|ping|srcset|background|action|name)$/.test(ten), m + ' → còn thuộc tính ' + ten + ': ' + out);
        assert.ok(!/^(javascript|vbscript|data:text|data:image\/svg)/.test(gt), m + ' → giá trị nguy hiểm ' + ten + '=' + gt);
        if (ten === 'style') assert.ok(!/expression\(|javascript:|behavior|url\(/.test(gt), m + ' → style nguy hiểm: ' + gt);
      }
    }
    // chữ đã thoát (&lt;img …&gt;) là an toàn; thẻ thật thì đã kiểm từng thuộc tính ở trên
    assert.ok(!/<\s*script/i.test(out), m + ' → ' + out);
  }
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 8).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (bảo mật)');
  process.exitCode = hong ? 1 : 0;
})();
