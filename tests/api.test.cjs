/* tests/api.test.cjs — kiểm thử kết nối Canvas: api/canvas.js (qua server.js), js/canvas-api.js (chạy trong Node
 * bằng fetch toàn cục) với một máy Canvas giả lập (OAuth, khoá học có Link phân trang, content_migrations,
 * máy nhận file kiểu inst-fs và kiểu S3, progress queued→running→completed, migration_issues, 403 giới hạn tốc độ).
 * Chạy: node tests/api.test.cjs */
'use strict';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GOC = path.resolve(__dirname, '..');
const handler = require('../api/canvas.js');
const may = require('../server.js');
const capi = require('../js/canvas-api.js');
const qti = require('../js/qti.js');
const I = handler._internal;

const BI_MAT = 'bi-mat-thu-nghiem-dai-hon-32-ky-tu!!';
const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }

/* ===================== tiện ích kiểm thử ===================== */

function nghe(sv) { return new Promise(ok => sv.listen(0, '127.0.0.1', () => ok('http://127.0.0.1:' + sv.address().port))); }
function dong(sv) { return new Promise(ok => { sv.close(() => ok()); if (sv.closeAllConnections) sv.closeAllConnections(); }); }

// Yêu cầu HTTP thô (không tự theo chuyển hướng, không chuẩn hoá đường dẫn)
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
        ok({ status: rs.statusCode, headers: rs.headers, body: b.toString('utf8'), buf: b, json });
      });
    });
    rq.on('error', loi);
    if (body) rq.write(body);
    rq.end();
  });
}

function layCookie(headers, ten) {
  const sc = [].concat(headers['set-cookie'] || []);
  const c = sc.find(x => x.startsWith(ten + '='));
  return c ? { raw: c, value: c.slice(ten.length + 1).split(';')[0] } : null;
}

// Hũ cookie nhỏ cho fetch của client (Node không tự giữ cookie)
function taoJar() {
  const jar = {};
  return {
    jar,
    header() { return Object.keys(jar).map(k => k + '=' + jar[k]).join('; '); },
    update(r) {
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      for (const c of sc) {
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
    if (ghi) ghi.push({ url: String(url), headers: h });
    const r = await fetch(url, Object.assign({}, init, { headers: h }));
    if (cung) jar.update(r);
    return r;
  };
}

function docMultipart(buf, ct) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct || '');
  assert.ok(m, 'thiếu boundary: ' + ct);
  const b = Buffer.from('--' + (m[1] || m[2]).trim());
  const parts = [];
  let pos = buf.indexOf(b);
  while (pos >= 0) {
    let st = pos + b.length;
    if (buf.slice(st, st + 2).toString() === '--') break;
    st += 2;
    const nx = buf.indexOf(b, st);
    if (nx < 0) break;
    const part = buf.slice(st, nx - 2);
    const he = part.indexOf('\r\n\r\n');
    const hd = part.slice(0, he).toString('utf8');
    const ten = /;\s*name="([^"]*)"/.exec(hd);
    const fn = /;\s*filename="([^"]*)"/.exec(hd);
    parts.push({ name: ten ? ten[1] : '', filename: fn ? fn[1] : null, headers: hd, body: part.slice(he + 4) });
    pos = nx;
  }
  return parts;
}

function docThanReq(req) {
  return new Promise(ok => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
}

/* ===================== máy Canvas giả lập ===================== */

function taoCanvasGia() {
  const M = {
    base: '', redirectMong: '', tokens: new Set(['tok-ca-nhan']), revoked: [], refreshCount: 0, nTok: 1,
    rateLimitOnce: true, rateLimited: 0, log: [], migrations: {}, nextMig: 456, creates: [], uploads: [], confirmed: [],
    uploadMode: 'instfs'
  };
  const khoaHoc = {
    teacher: [{ id: 1, name: 'Toán 12A1', course_code: 'T12A1', workflow_state: 'available', term: { name: 'HK1 2026-2027' } },
      { id: 2, name: 'Đại số 10', course_code: 'DS10', workflow_state: 'unpublished', term: { name: 'HK1 2026-2027' } },
      { id: 3, name: 'Bồi dưỡng HSG', course_code: 'HSG', workflow_state: 'available' }],
    ta: [{ id: 3, name: 'Bồi dưỡng HSG', course_code: 'HSG', workflow_state: 'available' },
      { id: 4, name: 'Hình học 11', course_code: 'HH11', workflow_state: 'available' }],
    designer: []
  };
  function json(res, st, o, h) {
    res.writeHead(st, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'X-Rate-Limit-Remaining': '650.5', 'Set-Cookie': '_csrf_token=bi-mat-canvas; path=/' }, h || {}));
    res.end(JSON.stringify(o));
  }
  function trangThaiMig(mig) {
    if (!mig.received) return 'pre_processing';
    const seq = ['queued', 'running', 'running', 'completed'];
    const s = seq[Math.min(mig.step, seq.length - 1)];
    mig.step++;
    mig.last = s;
    return s;
  }
  const sv = http.createServer(async (req, res) => {
    const u = new URL(req.url, M.base);
    const p = u.pathname;
    const auth = String(req.headers.authorization || '');
    const tok = auth.replace(/^Bearer\s+/, '');
    M.log.push({ method: req.method, path: p, search: u.search, auth, cookie: req.headers.cookie || '', headers: req.headers, t: M.log.length });
    const body = await docThanReq(req);

    if (p === '/login/oauth2/token' && req.method === 'POST') {
      const f = new URLSearchParams(body.toString('utf8'));
      if (f.get('client_id') !== 'cid' || f.get('client_secret') !== 'csecret' || f.get('redirect_uri') !== M.redirectMong) return json(res, 401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'authorization_code' && f.get('code') === 'ma-ok') {
        M.tokens.add('tok-1');
        return json(res, 200, { access_token: 'tok-1', token_type: 'Bearer', user: { id: 42, name: 'Cô Lan' }, refresh_token: 'ref-1', expires_in: 3600 });
      }
      if (f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === 'ref-1') {
        M.refreshCount++;
        const t = 'tok-' + (++M.nTok);
        M.tokens.add(t);
        return json(res, 200, { access_token: t, token_type: 'Bearer', user: { id: 42, name: 'Cô Lan' }, expires_in: 3600 });
      }
      return json(res, 400, { error: 'invalid_grant' });
    }
    if (p === '/login/oauth2/token' && req.method === 'DELETE') {
      M.revoked.push(tok);
      M.tokens.delete(tok);
      return json(res, 200, {});
    }
    // máy nhận file kiểu inst-fs (không cần token Canvas)
    if (p === '/files' && req.method === 'POST') {
      const mid = String(u.searchParams.get('token') || '').replace('jwt-', '');
      const mig = M.migrations[mid];
      if (!mig) return json(res, 401, { error: 'bad token' });
      M.uploads.push({ mid, kind: 'instfs', parts: docMultipart(body, req.headers['content-type']), auth, cookie: req.headers.cookie || '', headers: req.headers });
      mig.received = true; mig.step = 0;
      return json(res, 201, { id: 99, upload_status: 'success' }, { 'Access-Control-Allow-Origin': req.headers.origin || '*' });
    }
    // máy nhận file kiểu S3: 303 → create_success
    if (p === '/s3/upload' && req.method === 'POST') {
      const mid = u.searchParams.get('mid');
      M.uploads.push({ mid, kind: 's3', parts: docMultipart(body, req.headers['content-type']), auth, cookie: req.headers.cookie || '', headers: req.headers });
      res.writeHead(303, { Location: M.base + '/api/v1/files/55/create_success?uuid=u-' + mid });
      return res.end();
    }
    if (/^\/api\/v1\/files\/55\/create_success$/.test(p)) {
      const mid = String(u.searchParams.get('uuid') || '').replace('u-', '');
      const mig = M.migrations[mid];
      if (!mig) return json(res, 400, {});
      M.confirmed.push({ mid, auth });
      mig.received = true; mig.step = 0;
      return json(res, 200, { id: 55, display_name: 'goi.zip' });
    }
    if (!p.startsWith('/api/v1/')) return json(res, 404, { errors: [{ message: 'not found' }] });
    if (!M.tokens.has(tok)) return json(res, 401, { errors: [{ message: 'Invalid access token.' }] }, { 'WWW-Authenticate': 'Bearer realm="canvas-lms"' });

    let m;
    if (p === '/api/v1/users/self') return json(res, 200, { id: '42', name: 'Cô Lan', short_name: 'Lan' });
    if (p === '/api/v1/courses') {
      if (M.rateLimitOnce) {
        M.rateLimitOnce = false; M.rateLimited++;
        res.writeHead(403, { 'Content-Type': 'text/plain', 'X-Rate-Limit-Remaining': '0.0' });
        return res.end('403 Forbidden (Rate Limit Exceeded)');
      }
      const vt = u.searchParams.get('enrollment_type');
      const arr = khoaHoc[vt] || [];
      const page = Number(u.searchParams.get('page') || 1);
      const ct = arr.slice((page - 1) * 2, page * 2);
      const h = {};
      if (page * 2 < arr.length) {
        const nx = new URL(M.base + '/api/v1/courses');
        u.searchParams.forEach((v, k) => { if (k !== 'page') nx.searchParams.append(k, v); });
        nx.searchParams.set('page', String(page + 1));
        h.Link = '<' + M.base + '/api/v1/courses?page=1&per_page=100>; rel="current",<' + nx.href + '>; rel="next", <' + M.base + '/api/v1/courses?page=9>; rel="last"';
      }
      return json(res, 200, ct, h);
    }
    if ((m = /^\/api\/v1\/courses\/(\d+)\/permissions$/.exec(p))) {
      const xin = u.searchParams.getAll('permissions[]');
      const kq = {};
      xin.forEach(k => { if (k !== 'manage_content' && k !== 'manage_files') kq[k] = true; });
      return json(res, 200, kq);
    }
    if (/^\/api\/v1\/courses\/\d+\/content_migrations\/migrators$/.test(p)) {
      return json(res, 200, [{ type: 'common_cartridge_importer', requires_file_upload: true }, { type: 'qti_converter', requires_file_upload: true }]);
    }
    if (p === '/api/v1/question_banks') {
      if (u.searchParams.get('context_type') !== 'Course' || u.searchParams.get('context_id') !== '1') return json(res, 400, { errors: [{ message: 'bad ctx' }] });
      return json(res, 200, [{ id: '7', title: 'Toán 12 – Chương 1', assessment_question_count: 30, workflow_state: 'active', updated_at: '2026-10-01T00:00:00Z' }]);
    }
    if ((m = /^\/api\/v1\/courses\/(\d+)\/content_migrations$/.exec(p)) && req.method === 'POST') {
      const j = JSON.parse(body.toString('utf8'));
      const id = String(M.nextMig++);
      M.creates.push({ id, course: m[1], body: j, ct: req.headers['content-type'], accept: req.headers.accept, t: M.log.length });
      const mig = M.migrations[id] = { id, course: m[1], received: false, step: 0, last: 'pre_processing', reads: 0 };
      const upload_url = M.uploadMode === 's3' ? M.base + '/s3/upload?mid=' + id : M.base + '/files?token=jwt-' + id;
      return json(res, 200, {
        id, workflow_state: 'pre_processing', migration_type: 'qti_converter',
        migration_issues_url: M.base + '/api/v1/courses/' + m[1] + '/content_migrations/' + id + '/migration_issues',
        pre_attachment: { file_param: 'file', progress: null, upload_url, upload_params: { filename: j.pre_attachment.name, content_type: j.pre_attachment.content_type, 'x-amz-signature': 'chu-ky' } },
        progress_url: M.base + '/api/v1/progress/' + (7000 + Number(id))
      });
    }
    if ((m = /^\/api\/v1\/courses\/(\d+)\/content_migrations\/(\d+)$/.exec(p))) {
      const mig = M.migrations[m[2]];
      if (!mig) return json(res, 404, { errors: [{ message: 'not found' }] });
      mig.reads++;
      return json(res, 200, { id: mig.id, workflow_state: trangThaiMig(mig), migration_type: 'qti_converter' });
    }
    if ((m = /^\/api\/v1\/progress\/(\d+)$/.exec(p))) {
      const mig = M.migrations[String(Number(m[1]) - 7000)];
      if (!mig) return json(res, 404, {});
      const map = { pre_processing: ['queued', 0], queued: ['queued', 0], running: ['running', mig.step >= 3 ? 80 : 40], completed: ['completed', 100] };
      const x = map[mig.last] || ['queued', 0];
      return json(res, 200, { id: m[1], workflow_state: x[0], completion: x[1], message: null });
    }
    if ((m = /^\/api\/v1\/courses\/(\d+)\/content_migrations\/(\d+)\/migration_issues$/.exec(p))) {
      const page = Number(u.searchParams.get('page') || 1);
      const all = [
        { id: 1, issue_type: 'warning', description: 'Câu 3: ảnh không tìm thấy', workflow_state: 'active', fix_issue_html_url: M.base + '/courses/1/question_banks/7#question_1_question_text' },
        { id: 2, issue_type: 'todo', description: 'Kiểm tra lại câu ghép nối', workflow_state: 'active', fix_issue_html_url: null }
      ];
      const h = page < 2 ? { link: '<' + M.base + p + '?page=2&per_page=100>; rel="next"' } : {};
      return json(res, 200, [all[page - 1]], h);
    }
    return json(res, 404, { errors: [{ message: 'The specified resource does not exist.' }] });
  });
  return { M, sv };
}

/* ===================== 1. mã hoá cookie, allowlist, cấu hình ===================== */

test('cookie phiên AES-256-GCM: vòng tròn, phát hiện sửa đổi, sai khoá, hết hạn', () => {
  const p = { access_token: 'tok-1', refresh_token: 'ref-1', expires_at: Date.now() + 3600e3, user: { id: '42', name: 'Cô Lan' }, exp: Date.now() + 3600e3 };
  const c = I.encryptSession(p, BI_MAT);
  assert.ok(/^v1\.[A-Za-z0-9_-]+$/.test(c), 'định dạng v1.<base64url>');
  assert.ok(!c.includes('tok-1') && !c.includes('ref-1'), 'không lộ token');
  assert.deepStrictEqual(I.decryptSession(c, BI_MAT), p);
  assert.notStrictEqual(I.encryptSession(p, BI_MAT), c, 'IV ngẫu nhiên');
  // sửa từng vị trí → đều bị từ chối
  const b = Buffer.from(c.slice(3).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  for (const i of [0, 5, 12, 20, 28, b.length - 1]) {
    const x = Buffer.from(b); x[i] ^= 1;
    const s = 'v1.' + x.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    assert.strictEqual(I.decryptSession(s, BI_MAT), null, 'sửa byte ' + i);
  }
  assert.strictEqual(I.decryptSession(c.slice(0, -2), BI_MAT), null, 'cắt ngắn');
  assert.strictEqual(I.decryptSession(c, BI_MAT + 'x'), null, 'sai khoá');
  assert.strictEqual(I.decryptSession('v2.' + c.slice(3), BI_MAT), null, 'sai phiên bản');
  assert.strictEqual(I.decryptSession(undefined, BI_MAT), null);
  assert.strictEqual(I.decryptSession('v1.%%%', BI_MAT), null);
  assert.strictEqual(I.decryptSession(c, BI_MAT, Date.now() + 7200e3), null, 'quá hạn phiên (exp)');
});

test('allowlist proxy: chỉ các đường dẫn Canvas cần thiết', () => {
  const ok = (p, m) => { const r = I.checkProxyPath(p, m || 'GET'); assert.ok(!r.loi, p + ' → ' + r.loi); return r; };
  const cam = (p, m, st) => { const r = I.checkProxyPath(p, m || 'GET'); assert.ok(r.loi, 'phải chặn ' + p); if (st) assert.strictEqual(r.status, st, p); };
  ok('/api/v1/users/self');
  assert.deepStrictEqual(ok('/api/v1/courses?enrollment_type=teacher&state%5B%5D=available&state[]=unpublished&per_page=100'),
    { pathname: '/api/v1/courses', query: 'enrollment_type=teacher&state%5B%5D=available&state[]=unpublished&per_page=100' });
  ok('/api/v1/courses/12/permissions?permissions%5B%5D=manage_course_content_add');
  ok('/api/v1/courses/12/content_migrations/migrators');
  ok('/api/v1/courses/12/content_migrations', 'POST');
  ok('/api/v1/courses/12/content_migrations');
  ok('/api/v1/courses/12/content_migrations/456');
  cam('/api/v1/courses/12/content_migrations/456', 'PUT', 405);   // không dùng → không mở
  ok('/api/v1/courses/12/content_migrations/456/migration_issues?per_page=100');
  ok('/api/v1/question_banks?context_type=Course&context_id=12&include_question_count=true');
  cam('/api/v1/question_banks/7/questions', 'GET', 403);   // nội dung câu hỏi: công cụ không cần đọc
  ok('/api/v1/progress/789');
  cam('/api/v1/accounts/1/users', 'GET', 403);
  cam('/api/v1/accounts/1/content_migrations', 'POST', 403);
  cam('https://evil.example/api/v1/courses', 'GET', 403);
  cam('http://127.0.0.1:9/api/v1/courses', 'GET', 403);
  cam('//evil.example/api/v1/courses', 'GET', 403);
  cam('/api/v1/courses/../accounts/1/users', 'GET', 403);
  cam('/api/v1/courses/%2e%2e/accounts', 'GET', 403);
  cam('/api/v1/courses%2F1%2Fpermissions', 'GET', 403);
  cam('/api/v1/courses/1/permissions\\..', 'GET', 403);
  cam('/api/v1/users/self@evil.example', 'GET', 403);
  cam('/api/v1/users/self#x', 'GET', 403);
  cam('/api/v1/users/self?x=a b', 'GET', 403);
  cam('/api/v1/users/self?x=<script>', 'GET', 403);
  cam('/api/v1/users/self\r\nHost: evil', 'GET', 403);
  cam('/api/v1/users/12', 'GET', 403);
  cam('/api/v1/courses/1', 'GET', 403);
  cam('/api/v1/courses/abc/permissions', 'GET', 403);
  cam('/login/oauth2/token', 'GET', 403);
  cam('/api/v1/courses', 'POST', 405);
  cam('/api/v1/courses/1/content_migrations/2', 'DELETE', 405);
  cam('/api/v1/progress/1', 'PUT', 405);
  cam('', 'GET', 400);
  cam(null, 'GET', 400);
  cam('/api/v1/courses?' + 'a'.repeat(3000), 'GET', 400);
});

test('địa chỉ tải lên: chỉ máy Canvas / inst-fs / S3', () => {
  const ch = I.readConfig({ CANVAS_BASE_URL: 'https://nshm.instructure.com/', CANVAS_CLIENT_ID: 'x', CANVAS_CLIENT_SECRET: 'y', SESSION_SECRET: BI_MAT });
  assert.strictEqual(ch.base, 'https://nshm.instructure.com');
  const co = u => assert.ok(I.isAllowedUploadUrl(u, ch), u);
  const khong = u => assert.ok(!I.isAllowedUploadUrl(u, ch), u);
  co('https://inst-fs-sin-prod.inscloudgate.net/files?token=abc');
  co('https://instructure-uploads-apse1.s3.ap-southeast-1.amazonaws.com/');
  co('https://nshm.instructure.com/files_api');
  khong('https://other.instructure.com/x');   // Canvas trường khác
  khong('https://abc.execute-api.ap-southeast-1.amazonaws.com/x');
  khong('http://inst-fs-sin-prod.inscloudgate.net/files');
  khong('https://inscloudgate.net/files');
  khong('https://evil-inscloudgate.net/files');
  khong('https://inst-fs.inscloudgate.net.evil.com/files');
  khong('https://user:pw@inst-fs.inscloudgate.net/files');
  khong('https://inst-fs.inscloudgate.net:8443/files');
  khong('http://nshm.instructure.com/files_api');
  khong('https://169.254.169.254/latest/meta-data');
  khong('file:///etc/passwd');
  khong('not a url');
  // Canvas cục bộ qua http chỉ cho chính máy đó
  const cb = I.readConfig({ CANVAS_BASE_URL: 'http://127.0.0.1:3000', ALLOW_PERSONAL_TOKEN: '1' });
  assert.ok(I.isAllowedUploadUrl('http://127.0.0.1:3000/files', cb));
  assert.ok(!I.isAllowedUploadUrl('http://127.0.0.1:3001/files', cb));
});

test('đọc cấu hình: thiếu/sai biến → lỗi tiếng Việt, scopes', () => {
  let ch = I.readConfig({});
  assert.strictEqual(ch.base, null); assert.ok(/CANVAS_BASE_URL/.test(ch.loi));
  ch = I.readConfig({ CANVAS_BASE_URL: 'http://canvas.truong.vn' });
  assert.strictEqual(ch.base, null, 'http ngoài máy cục bộ bị từ chối');
  ch = I.readConfig({ CANVAS_BASE_URL: 'javascript:alert(1)' });
  assert.strictEqual(ch.base, null);
  ch = I.readConfig({ CANVAS_BASE_URL: 'https://a.instructure.com', CANVAS_CLIENT_ID: '1', CANVAS_CLIENT_SECRET: '2', SESSION_SECRET: 'ngan' });
  assert.strictEqual(ch.oauth, false); assert.ok(/SESSION_SECRET/.test(ch.loiOauth));
  ch = I.readConfig({ CANVAS_BASE_URL: 'https://a.instructure.com/login/canvas', CANVAS_CLIENT_ID: '1', CANVAS_CLIENT_SECRET: '2', SESSION_SECRET: BI_MAT, ALLOW_PERSONAL_TOKEN: '1' });
  assert.strictEqual(ch.base, 'https://a.instructure.com'); assert.strictEqual(ch.oauth, true); assert.strictEqual(ch.personal, true);
  assert.deepStrictEqual(ch.scopes, I.SCOPES);
  assert.strictEqual(I.SCOPES.length, 10);
  assert.ok(!I.SCOPES.some(s => /^url:PUT/.test(s)), 'không xin PUT');
  assert.ok(I.SCOPES.includes('url:POST|/api/v1/courses/:course_id/content_migrations'));
  assert.deepStrictEqual(I.readConfig({ CANVAS_BASE_URL: 'https://a.instructure.com', CANVAS_SCOPES: 'none', ALLOW_PERSONAL_TOKEN: '1' }).scopes, []);
});

test('canvas-api: parseLink, toApiPath, mapState, isInstFs, nạp kiểu trình duyệt', () => {
  const l = capi.parseLink('<https://x.edu/api/v1/courses?page=1&per_page=10>; rel="current",<https://x.edu/api/v1/courses?page=2&per_page=10>; rel="next", <https://x.edu/api/v1/courses?page=5>; rel="last"');
  assert.strictEqual(l.next, 'https://x.edu/api/v1/courses?page=2&per_page=10');
  assert.strictEqual(l.last, 'https://x.edu/api/v1/courses?page=5');
  assert.deepStrictEqual(capi.parseLink(''), {});
  assert.strictEqual(capi.toApiPath('https://x.edu/api/v1/courses?page=2&state%5B%5D=a'), '/api/v1/courses?page=2&state%5B%5D=a');
  assert.strictEqual(capi.toApiPath('/api/v1/progress/1'), '/api/v1/progress/1');
  assert.deepStrictEqual(['pre_processing', 'created', 'queued', 'running', 'exporting', 'importing', 'completed', 'imported', 'failed', 'pre_process_error', 'la'].map(capi.mapState),
    ['pre_processing', 'pre_processing', 'queued', 'running', 'running', 'running', 'completed', 'completed', 'failed', 'failed', 'running']);
  assert.ok(capi.isInstFs('https://inst-fs-iad-prod.inscloudgate.net/files?token=a'));
  assert.ok(!capi.isInstFs('https://bucket.s3.amazonaws.com/'));
  assert.ok(!capi.isInstFs('https://inscloudgate.net.evil.com/'));
  for (const f of ['getConfig', 'loginUrl', 'logout', 'me', 'listCourses', 'listBanks', 'checkPermissions', 'importPackage', 'setPersonalToken', 'clearPersonalToken', 'create'])
    assert.strictEqual(typeof capi[f], 'function', f);
  assert.strictEqual(capi.loginUrl(), '/api/canvas?op=login');
  // nạp như script cổ điển trong trình duyệt: gắn self.NH.canvasApi, token cá nhân vào sessionStorage
  const vm = require('vm');
  const kho = {}; const ss = { getItem: k => (k in kho ? kho[k] : null), setItem: (k, v) => { kho[k] = String(v); }, removeItem: k => { delete kho[k]; } };
  const ctx = { self: { sessionStorage: ss }, URL, setTimeout, Promise };
  vm.runInNewContext(fs.readFileSync(path.join(GOC, 'js/canvas-api.js'), 'utf8'), ctx);
  const b = ctx.self.NH.canvasApi;
  assert.strictEqual(typeof b.importPackage, 'function');
  b.setPersonalToken('Bearer 1~abcdefgh');
  assert.strictEqual(kho['nh-canvas-token'], '1~abcdefgh');
  assert.strictEqual(b.hasPersonalToken(), true);
  b.clearPersonalToken();
  assert.ok(!('nh-canvas-token' in kho));
});

/* ===================== 2. server.js ===================== */

test('server.js: parseEnv', () => {
  const e = may.parseEnv('\uFEFF# chú thích\nA=1\nexport B = hai ba # chú thích\nC="x # y\\n\\"z\\""\nD=\'nguyên $văn #\'\n  E=  \nsai dòng\nF=a=b\n');
  assert.deepStrictEqual(e, { A: '1', B: 'hai ba', C: 'x # y\n"z"', D: 'nguyên $văn #', E: '', F: 'a=b' });
  const env = { A: 'giữ' };
  const tmp = path.join(os.tmpdir(), 'nh-env-' + process.pid);
  fs.writeFileSync(tmp, 'A=moi\nB=2\n');
  assert.strictEqual(may.loadEnv(tmp, env), 1);
  assert.deepStrictEqual(env, { A: 'giữ', B: '2' });
  fs.unlinkSync(tmp);
  assert.strictEqual(may.loadEnv(tmp + '-khong-co', env), 0);
});

test('server.js: file tĩnh, MIME, chặn path traversal và dotfile', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-tinh-'));
  const goc = path.join(tmp, 'web');
  fs.mkdirSync(path.join(goc, 'sub'), { recursive: true });
  fs.mkdirSync(path.join(goc, '.git'));
  fs.writeFileSync(path.join(goc, 'index.html'), '<!doctype html><title>Ngân hàng</title>');
  fs.writeFileSync(path.join(goc, 'a.css'), 'body{}');
  fs.writeFileSync(path.join(goc, 'sub', 'b.js'), 'var x=1;');
  fs.writeFileSync(path.join(goc, 'sub', 'mau.docx'), 'PK');
  fs.writeFileSync(path.join(goc, '.env'), 'SESSION_SECRET=bi-mat');
  fs.writeFileSync(path.join(goc, '.git', 'config'), '[core]');
  fs.writeFileSync(path.join(tmp, 'ngoai.txt'), 'BÍ MẬT NGOÀI');
  let gocHandler = 0;
  const sv = may.createServer({ root: goc, handler: (req, res) => { gocHandler++; res.end('api'); } });
  const base = await nghe(sv);
  try {
    let r = await raw(base, 'GET', '/');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers['content-type'], 'text/html; charset=utf-8'); assert.ok(r.body.includes('Ngân hàng'));
    r = await raw(base, 'GET', '/a.css'); assert.strictEqual(r.headers['content-type'], 'text/css; charset=utf-8');
    r = await raw(base, 'GET', '/sub/b.js?v=2'); assert.strictEqual(r.headers['content-type'], 'text/javascript; charset=utf-8'); assert.strictEqual(r.body, 'var x=1;');
    r = await raw(base, 'GET', '/sub/mau.docx'); assert.ok(/wordprocessingml/.test(r.headers['content-type']));
    r = await raw(base, 'GET', '/sub'); assert.strictEqual(r.status, 301); assert.strictEqual(r.headers.location, '/sub/');
    r = await raw(base, 'HEAD', '/a.css'); assert.strictEqual(r.status, 200); assert.strictEqual(r.body, ''); assert.strictEqual(r.headers['content-length'], '6');
    r = await raw(base, 'POST', '/a.css'); assert.strictEqual(r.status, 405);
    r = await raw(base, 'GET', '/khong-co.html'); assert.strictEqual(r.status, 404);
    for (const p of ['/../ngoai.txt', '/sub/../../ngoai.txt', '/%2e%2e/ngoai.txt', '/..%2fngoai.txt', '/sub%2f..%2f..%2fngoai.txt', '/..%5cngoai.txt',
      '/.env', '/sub/../.env', '/%2eenv', '/.git/config', '/a.css%00.html', '/C:/Windows/win.ini', '/a.css::$DATA', '/%E0%A4%A']) {
      r = await raw(base, 'GET', p);
      assert.ok(r.status === 403 || r.status === 404 || r.status === 400, p + ' → ' + r.status);
      assert.ok(!r.body.includes('BÍ MẬT') && !r.body.includes('bi-mat') && !r.body.includes('[core]'), 'lộ nội dung qua ' + p);
    }
    // /api/canvas → handler; mã nguồn api/ không phục vụ tĩnh
    r = await raw(base, 'GET', '/api/canvas?op=config'); assert.strictEqual(r.body, 'api');
    r = await raw(base, 'GET', '/api/canvas.js'); assert.strictEqual(r.status, 404);
    assert.strictEqual(gocHandler, 1);
  } finally { await dong(sv); fs.rmSync(tmp, { recursive: true, force: true }); }
});

/* ===================== 3. tích hợp: client → server.js → api/canvas.js → Canvas giả ===================== */

test('tích hợp đầy đủ với Canvas giả lập', async () => {
  const { M, sv: svCanvas } = taoCanvasGia();
  M.base = await nghe(svCanvas);
  const sv = may.createServer({ root: GOC });
  const base = await nghe(sv);
  M.redirectMong = base + '/api/canvas?op=callback';
  const envCu = Object.assign({}, process.env);
  Object.assign(process.env, { CANVAS_BASE_URL: M.base, CANVAS_CLIENT_ID: 'cid', CANVAS_CLIENT_SECRET: 'csecret', SESSION_SECRET: BI_MAT, ALLOW_PERSONAL_TOKEN: '1' });
  delete process.env.APP_URL; delete process.env.CANVAS_SCOPES;
  const ngu = [];
  const fakeSleep = ms => { ngu.push(ms); return new Promise(ok => setImmediate(ok)); };
  try {
    // --- file tĩnh của dự án qua server thật ---
    let r = await raw(base, 'GET', '/js/canvas-api.js');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers['content-type'], 'text/javascript; charset=utf-8');
    r = await raw(base, 'GET', '/DESIGN.md'); assert.strictEqual(r.headers['content-type'], 'text/markdown; charset=utf-8');

    // --- config ---
    r = await raw(base, 'GET', '/api/canvas?op=config');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json, { enabled: true, base: M.base, oauth: true, personalToken: true, loggedIn: false, user: null });
    assert.strictEqual(r.headers['cache-control'], 'no-store');
    assert.ok(!r.headers['access-control-allow-origin'], 'không mở CORS');

    // --- login: chuyển tới Canvas với state + scope một tham số ---
    r = await raw(base, 'GET', '/api/canvas?op=login');
    assert.strictEqual(r.status, 302);
    const loc = new URL(r.headers.location);
    assert.strictEqual(loc.origin + loc.pathname, M.base + '/login/oauth2/auth');
    assert.strictEqual(loc.searchParams.get('client_id'), 'cid');
    assert.strictEqual(loc.searchParams.get('response_type'), 'code');
    assert.strictEqual(loc.searchParams.get('redirect_uri'), M.redirectMong);
    assert.strictEqual(loc.searchParams.getAll('scope').length, 1);
    assert.strictEqual(loc.searchParams.get('scope'), I.SCOPES.join(' '));
    assert.ok(/[?&]scope=url%3AGET%7C%2Fapi%2Fv1%2Fusers%2F%3Aid%20url/.test(r.headers.location), 'dấu cách mã hoá %20');
    const state = loc.searchParams.get('state');
    assert.ok(/^[0-9a-f]{36}$/.test(state));
    const ck = layCookie(r.headers, I.COOKIE_STATE);
    assert.strictEqual(ck.value, state);
    assert.ok(/HttpOnly/.test(ck.raw) && /SameSite=Lax/.test(ck.raw) && /Path=\//.test(ck.raw) && !/Secure/.test(ck.raw), ck.raw);
    // sau proxy https → cookie Secure
    r = await raw(base, 'GET', '/api/canvas?op=login', { 'x-forwarded-proto': 'https' });
    // https → cookie __Host- (Secure, Path=/, không Domain); tên trần không được đặt
    assert.ok(/^__Host-nh_canvas_st=[0-9a-f]{36}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/.test(layCookie(r.headers, I.COOKIE_HOST_PREFIX + I.COOKIE_STATE).raw));
    assert.ok(!layCookie(r.headers, I.COOKIE_STATE));
    assert.ok(new URL(r.headers.location).searchParams.get('redirect_uri').startsWith('https://127.0.0.1:'));

    // --- callback: state sai / bị từ chối / đúng ---
    r = await raw(base, 'GET', '/api/canvas?op=callback&code=ma-ok&state=' + state, { cookie: I.COOKIE_STATE + '=khac' });
    assert.strictEqual(r.status, 302); assert.strictEqual(r.headers.location, '/?canvas=loi&ma=state');
    assert.ok(!layCookie(r.headers, I.COOKIE_SESSION) || !layCookie(r.headers, I.COOKIE_SESSION).value);
    r = await raw(base, 'GET', '/api/canvas?op=callback&code=ma-ok&state=' + state);
    assert.strictEqual(r.headers.location, '/?canvas=loi&ma=state', 'thiếu cookie state');
    r = await raw(base, 'GET', '/api/canvas?op=callback&error=access_denied&state=' + state, { cookie: I.COOKIE_STATE + '=' + state });
    assert.strictEqual(r.headers.location, '/?canvas=loi&ma=tu_choi');
    r = await raw(base, 'GET', '/api/canvas?op=callback&code=ma-sai&state=' + state, { cookie: I.COOKIE_STATE + '=' + state });
    assert.strictEqual(r.headers.location, '/?canvas=loi&ma=doi_ma');
    r = await raw(base, 'GET', '/api/canvas?op=callback&code=ma-ok&state=' + state, { cookie: I.COOKIE_STATE + '=' + state });
    assert.strictEqual(r.status, 302); assert.strictEqual(r.headers.location, '/?canvas=ok');
    const phien = layCookie(r.headers, I.COOKIE_SESSION);
    assert.ok(phien && /^v1\./.test(phien.value));
    assert.ok(/HttpOnly/.test(phien.raw) && /SameSite=Lax/.test(phien.raw) && /Max-Age=43\d\d\d/.test(phien.raw), phien.raw);
    assert.ok(/nh_canvas_st=;.*Max-Age=0/.test([].concat(r.headers['set-cookie']).join('\n')), 'xoá cookie state');
    const giai = I.decryptSession(phien.value, BI_MAT);
    assert.strictEqual(giai.access_token, 'tok-1'); assert.strictEqual(giai.refresh_token, 'ref-1');
    assert.deepStrictEqual(giai.user, { id: '42', name: 'Cô Lan' });
    assert.ok(giai.expires_at > Date.now() + 3500e3);

    // --- client với hũ cookie ---
    const jar = taoJar(); jar.jar[I.COOKIE_SESSION] = phien.value;
    const ghi = [];
    const c = capi.create({ apiBase: base + '/api/canvas', fetch: fetchVoiJar(jar, base, ghi), sleep: fakeSleep, storage: null });
    const cfg = await c.getConfig();
    assert.strictEqual(cfg.loggedIn, true); assert.deepStrictEqual(cfg.user, { id: '42', name: 'Cô Lan' });
    assert.deepStrictEqual(await c.me(), { id: '42', name: 'Cô Lan', short_name: 'Lan' });
    const lanMe = M.log.filter(x => x.path === '/api/v1/users/self').pop();
    assert.strictEqual(lanMe.auth, 'Bearer tok-1');
    assert.ok(/application\/json\+canvas-string-ids/.test(lanMe.headers.accept));
    assert.ok(!lanMe.cookie, 'không gửi cookie của trình duyệt sang Canvas');
    assert.ok(!lanMe.headers['x-canvas-token'] && !lanMe.headers['x-nh-client']);

    // --- khoá học: 403 giới hạn tốc độ một lần → chờ lùi; Link phân trang; gộp vai trò ---
    const truocNgu = ngu.length;
    const kh = await c.listCourses();
    assert.strictEqual(M.rateLimited, 1);
    assert.ok(ngu.length === truocNgu + 1 && ngu[truocNgu] >= 1000, 'chờ lùi sau 403: ' + ngu.slice(truocNgu));
    assert.deepStrictEqual(kh.map(k => k.id).sort(), ['1', '2', '3', '4']);
    assert.deepStrictEqual(kh.find(k => k.id === '3').roles, ['teacher', 'ta']);
    assert.strictEqual(kh.find(k => k.id === '1').term, 'HK1 2026-2027');
    const goiKH = M.log.filter(x => x.path === '/api/v1/courses');
    assert.ok(goiKH.some(x => /enrollment_type=teacher/.test(x.search) && /page=2/.test(x.search)), 'đi theo Link next');
    assert.ok(goiKH.some(x => /enrollment_type=designer/.test(x.search)) && goiKH.some(x => /enrollment_type=ta/.test(x.search)));
    assert.ok(goiKH.every(x => /per_page=100/.test(x.search)));
    assert.ok(goiKH.some(x => x.search.includes('state%5B%5D=available') || x.search.includes('state[]=available')));
    // tiêu đề Link + X-Rate-Limit-Remaining được chuyển qua, Set-Cookie của Canvas thì không
    r = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses?enrollment_type=teacher&per_page=100'), { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + phien.value });
    assert.strictEqual(r.status, 200);
    assert.ok(/rel="next"/.test(r.headers.link));
    assert.strictEqual(r.headers['x-rate-limit-remaining'], '650.5');
    assert.ok(!(r.headers['set-cookie'] || []).some(x => /_csrf_token/.test(x)), 'không chuyển cookie của Canvas');

    // --- token hết hạn trên Canvas → 401 → làm mới MỘT lần, cookie mới ---
    M.tokens.delete('tok-1');
    assert.strictEqual((await c.me()).id, '42');
    assert.strictEqual(M.refreshCount, 1);
    const p2 = I.decryptSession(jar.jar[I.COOKIE_SESSION], BI_MAT);
    assert.strictEqual(p2.access_token, 'tok-2'); assert.strictEqual(p2.refresh_token, 'ref-1');
    await c.me();
    assert.strictEqual(M.refreshCount, 1, 'không làm mới lại khi token mới còn tốt');
    assert.strictEqual(M.log.filter(x => x.path === '/api/v1/users/self').pop().auth, 'Bearer tok-2');
    // token sắp hết hạn → làm mới trước khi gọi
    const sapHet = Object.assign({}, p2, { expires_at: Date.now() + 10e3 });
    const jar2 = taoJar(); jar2.jar[I.COOKIE_SESSION] = I.encryptSession(sapHet, BI_MAT);
    const c2 = capi.create({ apiBase: base + '/api/canvas', fetch: fetchVoiJar(jar2, base), sleep: fakeSleep, storage: null });
    await c2.me();
    assert.strictEqual(M.refreshCount, 2);
    assert.strictEqual(I.decryptSession(jar2.jar[I.COOKIE_SESSION], BI_MAT).access_token, 'tok-3');

    // --- quyền + ngân hàng ---
    const q = await c.checkPermissions('1');
    assert.strictEqual(q.ok, true); assert.strictEqual(q.canImport, true); assert.strictEqual(q.qtiAvailable, true);
    assert.strictEqual(q.canReadProgress, true); assert.deepStrictEqual(q.missing, []);
    const nh = await c.listBanks('1');
    assert.deepStrictEqual(nh, [{ id: '7', title: 'Toán 12 – Chương 1', count: 30, updatedAt: '2026-10-01T00:00:00Z', state: 'active' }]);
    await assert.rejects(c.listBanks('1 OR 1=1'), /Mã khoá học không hợp lệ/);

    // --- import qua máy chủ trung gian (máy nhận file không phải inst-fs) ---
    const bytes = new Uint8Array(5000).map((_, i) => (i * 7 + 3) & 255);
    const tienTrinh = [];
    const kq = await c.importPackage('1', { bytes, fileName: 'Toán 12 – Chương 1.zip', bankName: 'Toán 12 – Chương 1', onProgress: e => tienTrinh.push(e) });
    assert.strictEqual(kq.ok, true); assert.strictEqual(kq.state, 'completed'); assert.strictEqual(kq.migrationId, '456');
    const tao = M.creates[0];
    assert.ok(/^application\/json/.test(tao.ct));
    assert.strictEqual(tao.body.migration_type, 'qti_converter');
    assert.strictEqual(tao.body.settings.overwrite_quizzes, true, 'boolean thật');
    assert.strictEqual(tao.body.settings.question_bank_name, 'Toán 12 – Chương 1');
    assert.deepStrictEqual(tao.body.pre_attachment, { name: 'Toán 12 – Chương 1.zip', size: 5000, content_type: 'application/zip' });
    const up = M.uploads[0];
    assert.strictEqual(up.kind, 'instfs');
    assert.deepStrictEqual(up.parts.map(x => x.name), ['filename', 'content_type', 'x-amz-signature', 'file'], 'upload_params trước, file cuối');
    assert.strictEqual(up.parts[0].body.toString('utf8'), 'Toán 12 – Chương 1.zip');
    assert.strictEqual(up.parts[3].filename, 'Toán 12 – Chương 1.zip');
    assert.ok(Buffer.from(bytes).equals(up.parts[3].body), 'nội dung gói nguyên vẹn');
    assert.ok(!up.auth && !up.cookie, 'không gửi token/cookie tới máy nhận file');
    const giaiDoan = tienTrinh.map(e => e.stage).filter((s, i, a) => s !== a[i - 1]);
    assert.deepStrictEqual(giaiDoan, ['create', 'upload', 'queued', 'running', 'issues', 'completed']);
    assert.ok(tienTrinh.every((e, i) => i === 0 || e.percent >= tienTrinh[i - 1].percent), 'phần trăm không giảm');
    assert.strictEqual(tienTrinh[tienTrinh.length - 1].percent, 100);
    assert.ok(tienTrinh.some(e => e.stage === 'running' && e.completion === 40));
    assert.ok(/Đang xếp hàng/.test(tienTrinh.find(e => e.stage === 'queued').message));
    assert.strictEqual(kq.issues.length, 2, 'đi theo Link của migration_issues');
    assert.deepStrictEqual(kq.issues[0], { id: '1', type: 'warning', description: 'Câu 3: ảnh không tìm thấy', state: 'active', fixUrl: M.base + '/courses/1/question_banks/7#question_1_question_text', errorMessage: null });
    assert.ok(M.log.some(x => x.path === '/api/v1/progress/7456'), 'đọc progress');

    // --- tải thẳng (inst-fs giả định) không qua máy chủ, không cookie/tiêu đề tự đặt ---
    const ghi2 = [];
    const cTrucTiep = capi.create({ apiBase: base + '/api/canvas', fetch: fetchVoiJar(jar, base, ghi2), sleep: fakeSleep, storage: null, isDirectUpload: () => true });
    const kq2 = await cTrucTiep.importPackage('1', { bytes, fileName: 'b.zip', overwrite: false });
    assert.strictEqual(kq2.ok, true);
    assert.ok(!('overwrite_quizzes' in M.creates[1].body.settings), 'overwrite:false → bỏ khoá, không gửi chuỗi "false"');
    const up2 = M.uploads[1];
    assert.ok(!up2.auth && !up2.cookie && !up2.headers['x-nh-client'] && !up2.headers['x-canvas-token']);
    const gTai = ghi2.find(x => x.url.startsWith(M.base + '/files'));
    assert.ok(gTai && !gTai.headers.cookie, 'gửi thẳng tới upload_url');
    assert.ok(!ghi2.some(x => /op=upload/.test(x.url)));

    // --- kiểu S3: 303 → máy chủ GET create_success để xác nhận ---
    M.uploadMode = 's3';
    const kq3 = await c.importPackage('1', { bytes, fileName: 'c.zip' });
    assert.strictEqual(kq3.ok, true);
    assert.strictEqual(M.uploads[2].kind, 's3');
    assert.strictEqual(M.confirmed.length, 1);
    assert.strictEqual(M.confirmed[0].mid, kq3.migrationId);
    assert.strictEqual(M.confirmed[0].auth, 'Bearer tok-2');
    M.uploadMode = 'instfs';

    // --- hai lần import cùng khoá học chạy tuần tự ---
    const tr0 = M.log.length;
    const [ka, kb] = await Promise.all([c.importPackage('2', { bytes, fileName: 'd.zip' }), c.importPackage('2', { bytes, fileName: 'e.zip' })]);
    assert.ok(ka.ok && kb.ok);
    const sau = M.log.slice(tr0);
    const taoB = sau.findIndex(x => x.method === 'POST' && x.path === '/api/v1/courses/2/content_migrations' && sau.indexOf(x) > 0 &&
      sau.slice(0, sau.indexOf(x)).some(y => y.method === 'POST' && y.path === '/api/v1/courses/2/content_migrations'));
    const xongA = sau.findIndex(x => x.path === '/api/v1/courses/2/content_migrations/' + ka.migrationId + '/migration_issues');
    assert.ok(taoB > xongA && xongA >= 0, 'lần 2 chỉ tạo sau khi lần 1 xong');

    // --- chuyển sang New Quizzes khi nhập: import_quizzes_next = true (boolean JSON), gói Item Bank có bài kiểm tra ---
    const nhNQ = { title: 'Toán 12 – NQ', questions: [{ id: 'q01', no: '1', type: 'essay', points: 1, stem: '<p>Viết</p>' }], images: {} };
    const goiIB = (await qti.buildPackages([nhNQ], { target: 'itembank' }))[0];
    const goiCL = (await qti.buildPackages([nhNQ], { target: 'classic' }))[0];
    assert.ok(capi.hasAssessment(goiIB.bytes) && !capi.hasAssessment(goiCL.bytes) && !capi.hasAssessment(bytes));
    const soTao = M.creates.length;
    const tienNQ = [];
    const kqNQ = await c.importPackage('1', { bytes: goiIB.bytes, fileName: goiIB.fileName, bankName: 'không gửi', importQuizzesNext: true, onProgress: e => tienNQ.push(e) });
    assert.strictEqual(kqNQ.ok, true); assert.strictEqual(kqNQ.importQuizzesNext, true);
    const taoNQ = M.creates[soTao];
    assert.deepStrictEqual(taoNQ.body.settings, { import_quizzes_next: true }, 'chỉ import_quizzes_next (boolean thật), không ngân hàng mặc định, không ghi đè');
    assert.strictEqual(taoNQ.body.migration_type, 'qti_converter');
    assert.ok(tienNQ.some(e => e.stage === 'running' && /New Quizzes/.test(e.message)));
    // xin ghi đè rõ ràng thì mới gửi
    await c.importPackage('1', { bytes: goiIB.bytes, fileName: goiIB.fileName, importQuizzesNext: true, overwrite: true });
    assert.deepStrictEqual(M.creates[soTao + 1].body.settings, { import_quizzes_next: true, overwrite_quizzes: true });
    // gói chỉ có ngân hàng (objectbank) → từ chối trước khi tạo lần nhập trên Canvas
    await assert.rejects(c.importPackage('1', { bytes: goiCL.bytes, fileName: goiCL.fileName, importQuizzesNext: true }), e => e.code === 'goi_sai' && /bài kiểm tra/.test(e.message));
    assert.strictEqual(M.creates.length, soTao + 2, 'không gửi yêu cầu nào cho gói sai');
    // Classic vẫn như cũ (importQuizzesNext không phải true → không có khoá này)
    await c.importPackage('1', { bytes: goiCL.bytes, fileName: goiCL.fileName, bankName: 'Toán 12 – NQ', importQuizzesNext: 'true' });
    assert.deepStrictEqual(M.creates[soTao + 2].body.settings, { question_bank_name: 'Toán 12 – NQ', overwrite_quizzes: true });

    // --- allowlist qua HTTP: Canvas giả không bao giờ nhận yêu cầu bị chặn ---
    const hdr = { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + jar.jar[I.COOKIE_SESSION] };
    await assert.rejects(c.request('GET', '/api/v1/accounts/1/users'), e => e.status === 403 && /danh sách được phép/.test(e.message));
    for (const pth of ['https://evil.example/api/v1/courses', '//evil.example/api/v1/courses', '/api/v1/courses/../accounts/1/users', '/api/v1/accounts/1/users']) {
      r = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent(pth), hdr);
      assert.strictEqual(r.status, 403, pth); assert.ok(typeof r.json.error === 'string');
    }
    r = await raw(base, 'DELETE', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations/456'), hdr);
    assert.strictEqual(r.status, 405);
    r = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/users/self'), { cookie: hdr.cookie });
    assert.strictEqual(r.status, 403, 'thiếu X-NH-Client'); assert.strictEqual(r.json.code, 'csrf');
    r = await raw(base, 'POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations'), Object.assign({ 'content-type': 'text/plain' }, hdr), '{}');
    assert.strictEqual(r.status, 415);
    r = await raw(base, 'POST', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/1/content_migrations'), Object.assign({ 'content-type': 'application/json' }, hdr), '{sai');
    assert.strictEqual(r.status, 400);
    r = await raw(base, 'OPTIONS', '/api/canvas?op=proxy', { origin: 'https://evil.example', 'access-control-request-method': 'POST' });
    assert.ok(r.status >= 400 && !r.headers['access-control-allow-origin']);
    r = await raw(base, 'GET', '/api/canvas?op=xoa_het');
    assert.strictEqual(r.status, 404); assert.ok(/Thao tác không hợp lệ/.test(r.json.error));
    assert.ok(!M.log.some(x => /accounts|evil/.test(x.path)), 'không có yêu cầu bị chặn nào tới Canvas');

    // --- op=upload: chặn địa chỉ lạ, yêu cầu đăng nhập, giới hạn 4 MB ---
    const mp = '--b\r\nContent-Disposition: form-data; name="file"; filename="a.zip"\r\n\r\nPK\r\n--b--\r\n';
    r = await raw(base, 'POST', '/api/canvas?op=upload&url=' + encodeURIComponent('https://evil.example/x'), Object.assign({ 'content-type': 'multipart/form-data; boundary=b' }, hdr), mp);
    assert.strictEqual(r.status, 403);
    r = await raw(base, 'POST', '/api/canvas?op=upload&url=' + encodeURIComponent(M.base + '/files?token=jwt-456'), { 'x-nh-client': '1', 'content-type': 'multipart/form-data; boundary=b' }, mp);
    assert.strictEqual(r.status, 401, 'không cho dùng như proxy mở');
    const to = Buffer.alloc(I.UPLOAD_MAX + 10, 65);
    r = await raw(base, 'POST', '/api/canvas?op=upload&course=1&migration=456&url=' + encodeURIComponent(M.base + '/files?token=jwt-456'), Object.assign({ 'content-type': 'multipart/form-data; boundary=b' }, hdr), to);
    assert.strictEqual(r.status, 413);
    await assert.rejects(c.importPackage('1', { bytes: new Uint8Array(4 * 1024 * 1024), fileName: 'to.zip' }), e => e.code === 'qua_lon' && /4 MB/.test(e.message));

    // --- cookie bị sửa → coi như chưa đăng nhập ---
    const hong = jar.jar[I.COOKIE_SESSION].slice(0, -3) + (jar.jar[I.COOKIE_SESSION].slice(-3) === 'AAA' ? 'BBB' : 'AAA');
    r = await raw(base, 'GET', '/api/canvas?op=me', { 'x-nh-client': '1', cookie: I.COOKIE_SESSION + '=' + hong });
    assert.strictEqual(r.status, 401); assert.strictEqual(r.json.code, 'chua_dang_nhap');
    r = await raw(base, 'GET', '/api/canvas?op=config', { cookie: I.COOKIE_SESSION + '=' + hong });
    assert.strictEqual(r.json.loggedIn, false);

    // --- token cá nhân (ALLOW_PERSONAL_TOKEN=1): chỉ giữ ở client, đăng xuất không thu hồi trên Canvas ---
    const kho = {};
    const ss = { getItem: k => (k in kho ? kho[k] : null), setItem: (k, v) => { kho[k] = String(v); }, removeItem: k => { delete kho[k]; } };
    const ghi3 = [];
    const cTk = capi.create({ apiBase: base + '/api/canvas', fetch: fetchVoiJar(taoJar(), base, ghi3), sleep: fakeSleep, storage: ss });
    assert.strictEqual(await cTk.me(), null, 'chưa có token → null');
    cTk.setPersonalToken('tok-ca-nhan');
    assert.strictEqual(kho['nh-canvas-token'], 'tok-ca-nhan');
    assert.strictEqual((await cTk.me()).id, '42');
    assert.strictEqual(M.log.filter(x => x.path === '/api/v1/users/self').pop().auth, 'Bearer tok-ca-nhan');
    assert.strictEqual(ghi3.filter(x => x.headers['X-Canvas-Token'] === 'tok-ca-nhan').length >= 1, true);
    const lo = await cTk.logout();
    assert.strictEqual(lo.personalTokenCleared, true);
    assert.ok(!('nh-canvas-token' in kho));
    assert.ok(!M.revoked.includes('tok-ca-nhan'), 'không thu hồi token cá nhân');
    process.env.ALLOW_PERSONAL_TOKEN = '0';
    cTk.setPersonalToken('tok-ca-nhan');
    assert.strictEqual(await cTk.me(), null, 'tắt chế độ token cá nhân → bỏ qua X-Canvas-Token');
    process.env.ALLOW_PERSONAL_TOKEN = '1';
    r = await raw(base, 'GET', '/api/canvas?op=me', { 'x-nh-client': '1', 'x-canvas-token': 'tok"<ngoac>;x' });
    assert.strictEqual(r.status, 400);

    // --- đăng xuất OAuth: thu hồi token phiên + xoá cookie ---
    const tokTruoc = I.decryptSession(jar.jar[I.COOKIE_SESSION], BI_MAT).access_token;
    const out = await c.logout();
    assert.strictEqual(out.ok, true);
    assert.ok(M.revoked.includes(tokTruoc));
    assert.ok(!jar.jar[I.COOKIE_SESSION], 'cookie phiên bị xoá');
    assert.strictEqual((await c.getConfig()).loggedIn, false);
    assert.strictEqual(await c.me(), null);

    // --- refresh_token bị thu hồi → 401 het_phien + xoá cookie ---
    const jar3 = taoJar(); jar3.jar[I.COOKIE_SESSION] = I.encryptSession(Object.assign({}, p2, { access_token: 'tok-chet', refresh_token: 'ref-chet' }), BI_MAT);
    const c3 = capi.create({ apiBase: base + '/api/canvas', fetch: fetchVoiJar(jar3, base), sleep: fakeSleep, storage: null });
    await assert.rejects(c3.listBanks('1'), e => e.status === 401 && e.code === 'het_phien' && /đăng nhập lại/.test(e.message));
    assert.ok(!jar3.jar[I.COOKIE_SESSION]);

    // --- chưa cấu hình → 4xx JSON tiếng Việt ---
    delete process.env.CANVAS_BASE_URL;
    r = await raw(base, 'GET', '/api/canvas?op=config');
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.enabled, false); assert.ok(/CANVAS_BASE_URL/.test(r.json.reason));
    r = await raw(base, 'GET', '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/users/self'), hdr);
    assert.strictEqual(r.status, 400); assert.ok(/chưa cấu hình CANVAS_BASE_URL/.test(r.json.error)); assert.strictEqual(r.json.code, 'chua_cau_hinh');
    r = await raw(base, 'GET', '/api/canvas?op=login');
    assert.strictEqual(r.status, 400);
    process.env.CANVAS_BASE_URL = M.base;
    delete process.env.CANVAS_CLIENT_SECRET;
    r = await raw(base, 'GET', '/api/canvas?op=login');
    assert.strictEqual(r.status, 400); assert.ok(/CANVAS_CLIENT_SECRET/.test(r.json.error));
    r = await raw(base, 'GET', '/api/canvas?op=config');
    assert.strictEqual(r.json.enabled, true); assert.strictEqual(r.json.oauth, false); assert.strictEqual(r.json.personalToken, true);
    process.env.ALLOW_PERSONAL_TOKEN = '0';
    r = await raw(base, 'GET', '/api/canvas?op=me', { 'x-nh-client': '1' });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.json.code, 'chua_cau_hinh');

    // --- Canvas không tới được → lỗi mạng (không lộ chi tiết) ---
    Object.assign(process.env, { CANVAS_BASE_URL: 'http://127.0.0.1:1', ALLOW_PERSONAL_TOKEN: '1' });
    r = await raw(base, 'GET', '/api/canvas?op=me', { 'x-nh-client': '1', 'x-canvas-token': 'tok-ca-nhan' });
    assert.strictEqual(r.status, 502); assert.strictEqual(r.json.code, 'mang');
    // client: không có máy chủ trung gian (file:// / deploy tĩnh) → enabled:false
    const cKhong = capi.create({ apiBase: 'http://127.0.0.1:1/api/canvas', storage: null });
    assert.strictEqual((await cKhong.getConfig()).enabled, false);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in envCu)) delete process.env[k];
    Object.assign(process.env, envCu);
    await dong(sv); await dong(svCanvas);
  }
});

test('Vercel: dùng req.body đã đọc sẵn (Buffer/đối tượng JSON)', async () => {
  const { M, sv: svCanvas } = taoCanvasGia();
  M.base = await nghe(svCanvas);
  const envCu = Object.assign({}, process.env);
  Object.assign(process.env, { CANVAS_BASE_URL: M.base, ALLOW_PERSONAL_TOKEN: '1' });
  try {
    // giả lập req/res của Vercel: luồng đã bị đọc hết, body đã phân tích thành đối tượng
    const { Readable } = require('stream');
    const goi = async (body, url, them) => {
      const req = Readable.from([]);
      await new Promise(ok => { req.on('end', ok); req.resume(); });
      Object.assign(req, { method: 'POST', url: url || '/api/canvas?op=proxy&path=' + encodeURIComponent('/api/v1/courses/9/content_migrations'),
        headers: Object.assign({ 'x-nh-client': '1', 'x-canvas-token': 'tok-ca-nhan', 'content-type': 'application/json' }, them || {}), body });
      const out = { headers: {}, status: 0, body: '' };
      const res = { statusCode: 200, headersSent: false, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, end(b) { out.status = this.statusCode; out.body = b ? b.toString() : ''; } };
      await handler(req, res);
      return out;
    };
    let o = await goi({ migration_type: 'qti_converter', pre_attachment: { name: 'a.zip', size: 1, content_type: 'application/zip' }, settings: { overwrite_quizzes: true } });
    assert.strictEqual(o.status, 200, o.body);
    assert.strictEqual(M.creates[0].body.settings.overwrite_quizzes, true);
    o = await goi(Buffer.from(JSON.stringify({ migration_type: 'qti_converter', pre_attachment: { name: 'b.zip', size: 1, content_type: 'application/zip' }, settings: {} })));
    assert.strictEqual(o.status, 200);
    assert.strictEqual(M.creates[1].body.pre_attachment.name, 'b.zip');
    // op=upload: Vercel chỉ giữ req.body (Buffer) cho application/octet-stream → multipart dựng sẵn + X-Upload-Content-Type
    const mp = Buffer.from('--ranh\r\nContent-Disposition: form-data; name="filename"\r\n\r\nb.zip\r\n' +
      '--ranh\r\nContent-Disposition: form-data; name="file"; filename="b.zip"\r\nContent-Type: application/zip\r\n\r\nPK\u0003\u0004\r\n--ranh--\r\n', 'latin1');
    o = await goi(mp, '/api/canvas?op=upload&course=9&migration=456&url=' + encodeURIComponent(M.base + '/files?token=jwt-456'),
      { 'content-type': 'application/octet-stream', 'x-upload-content-type': 'multipart/form-data; boundary=ranh' });
    assert.strictEqual(o.status, 200, o.body);
    assert.deepStrictEqual(JSON.parse(o.body), { ok: true, status: 201, confirmed: false, file: { id: 99, upload_status: 'success' } });
    assert.deepStrictEqual(M.uploads[0].parts.map(p => p.name), ['filename', 'file']);
    assert.strictEqual(M.uploads[0].parts[1].body.toString('latin1'), 'PK\u0003\u0004');
    assert.strictEqual(M.uploads[0].headers['content-type'], 'multipart/form-data; boundary=ranh');
    o = await goi(mp, '/api/canvas?op=upload&course=9&migration=456&url=' + encodeURIComponent(M.base + '/files?token=jwt-456'),
      { 'content-type': 'application/octet-stream', 'x-upload-content-type': 'text/html' });
    assert.strictEqual(o.status, 415);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in envCu)) delete process.env[k];
    Object.assign(process.env, envCu);
    await dong(svCanvas);
  }
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 8).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (api)');
  process.exitCode = hong ? 1 : 0;
})();
