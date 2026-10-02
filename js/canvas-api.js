/* js/canvas-api.js — gọi Canvas qua máy chủ trung gian /api/canvas (Canvas không mở CORS):
 * cấu hình, đăng nhập/đăng xuất, khoá học, ngân hàng câu hỏi, kiểm tra quyền, import gói QTI
 * (content_migration qti_converter → tải gói lên → theo dõi tiến trình → lấy vấn đề). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.canvasApi = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var KHOA_TOKEN = 'nh-canvas-token';                 // sessionStorage: token cá nhân (chế độ chạy thử)
  var TAI_QUA_MAY_CHU = 4 * 1024 * 1024 - 64 * 1024;  // gói tối đa gửi qua op=upload (chừa phần đầu multipart)
  var THU_LAI_TOI_DA = 6;                              // số lần chờ lùi khi Canvas giới hạn tốc độ
  var CHO_NHAN_GOI = 3 * 60 * 1000;                    // pre_processing quá lâu → coi như tải lên hỏng

  /* ===================== Lỗi ===================== */

  function CanvasError(msg, status, extra) {
    var e = new Error(msg);
    e.name = 'CanvasError';
    e.status = status || 0;
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k];
    return e;
  }

  function docJson(t) { if (!t) return null; try { return JSON.parse(t); } catch (e) { return null; } }

  function thongDiepCanvas(data) {
    if (!data || typeof data !== 'object') return '';
    if (typeof data.error === 'string') return data.error;                       // lỗi của máy chủ trung gian
    if (Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) return data.errors[0].message;
    if (data.errors && typeof data.errors === 'object') {
      for (var k in data.errors) { var v = data.errors[k]; if (Array.isArray(v) && v[0]) return k + ': ' + (v[0].message || v[0]); }
    }
    if (typeof data.message === 'string') return data.message;
    return '';
  }

  function loiTuPhanHoi(status, data, txt) {
    var goc = thongDiepCanvas(data);
    var cuaMayChu = data && typeof data.error === 'string';
    var msg;
    if (cuaMayChu) msg = data.error;
    else if (status === 401) msg = 'Chưa đăng nhập Canvas hoặc phiên đã hết hạn — hãy đăng nhập lại.';
    else if (status === 403) msg = 'Tài khoản Canvas không có quyền thực hiện thao tác này.';
    else if (status === 404) msg = 'Không tìm thấy trên Canvas (khoá học/ngân hàng không tồn tại hoặc bạn không có quyền).';
    else if (status === 429) msg = 'Canvas đang giới hạn tốc độ — hãy thử lại sau ít phút.';
    else if (status >= 500) msg = 'Canvas hoặc máy chủ trung gian đang lỗi (mã ' + status + ') — hãy thử lại sau.';
    else msg = 'Canvas từ chối yêu cầu (mã ' + status + ').';
    if (goc && !cuaMayChu) msg += ' [Canvas: ' + goc + ']';
    return CanvasError(msg, status, { code: (data && data.code) || '', body: data != null ? data : (txt || '').slice(0, 500) });
  }

  /* ===================== Tiện ích ===================== */

  // Lấy URL rel="next" trong tiêu đề Link (tên tiêu đề không phân biệt hoa thường — Headers lo phần đó)
  function parseLink(h) {
    var kq = {};
    if (!h) return kq;
    var re = /<([^>]*)>\s*((?:;\s*[^;,]+)*)/g, m;
    while ((m = re.exec(h))) {
      var rel = /;\s*rel\s*=\s*"?([^";,]+)"?/i.exec(m[2]);
      if (rel) rel[1].trim().split(/\s+/).forEach(function (r) { kq[r.toLowerCase()] = m[1]; });
    }
    return kq;
  }

  // URL tuyệt đối của Canvas (Link, progress_url…) → đường dẫn /api/v1/… cho proxy (máy chủ tự gắn CANVAS_BASE_URL)
  function toApiPath(u) {
    if (!u) return '';
    var s = String(u);
    if (/^https?:\/\//i.test(s)) { var x = new URL(s); s = x.pathname + x.search; }
    return s;
  }

  // inst-fs (Canvas do Instructure lưu trữ) mở CORS cho mọi nguồn → trình duyệt tải thẳng được
  function isInstFs(u) {
    try {
      var h = new URL(String(u)).hostname.toLowerCase();
      return /(^|\.)inscloudgate\.net$/.test(h) || /^inst-fs[.-][a-z0-9.-]*\.instructure\.com$/.test(h);
    } catch (e) { return false; }
  }

  // Trạng thái migration (API hoặc nội bộ) → một trong 5 giai đoạn
  function mapState(s) {
    switch (String(s || '')) {
      case 'pre_processing': case 'created': case 'pre_processed': return 'pre_processing';
      case 'queued': return 'queued';
      case 'completed': case 'imported': return 'completed';
      case 'failed': case 'pre_process_error': return 'failed';
      default: return 'running';   // running, exporting, importing, exported, waiting_for_select…
    }
  }

  function chuanKhoaHoc(c, vaiTro) {
    return {
      id: String(c.id), name: c.name || '', code: c.course_code || '',
      term: c.term && c.term.name ? c.term.name : '', state: c.workflow_state || '', roles: vaiTro ? [vaiTro] : []
    };
  }

  function chuanVanDe(i) {
    return {
      id: String(i.id), type: i.issue_type || '', description: i.description || '', state: i.workflow_state || '',
      fixUrl: i.fix_issue_html_url || null, errorMessage: i.error_message || null
    };
  }

  function laSoId(x) { return /^\d{1,20}$/.test(String(x)); }

  /* ===================== Phiên bản có cấu hình ===================== */

  function create(opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || '/api/canvas';
    var goiFetch = opts.fetch || function (u, i) { return fetch(u, i); };
    var ngu = opts.sleep || function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    var bayGio = opts.now || function () { return Date.now(); };
    var laTaiThang = opts.isDirectUpload || isInstFs;
    var kho = opts.storage !== undefined ? opts.storage : khoMacDinh();
    var boNho = { token: '' };
    var hangDoi = {};   // mỗi khoá học chỉ một lần import tại một thời điểm

    function khoMacDinh() {
      try { var s = root && root.sessionStorage; if (s) { s.getItem(KHOA_TOKEN); return s; } } catch (e) { /* bị chặn */ }
      return null;
    }

    function docToken() {
      try { if (kho) return kho.getItem(KHOA_TOKEN) || ''; } catch (e) { /* bỏ qua */ }
      return boNho.token;
    }
    function setPersonalToken(t) {
      t = String(t || '').trim().replace(/^Bearer\s+/i, '');
      boNho.token = t;
      try { if (kho) { if (t) kho.setItem(KHOA_TOKEN, t); else kho.removeItem(KHOA_TOKEN); } } catch (e) { /* chỉ giữ trong bộ nhớ */ }
    }
    function clearPersonalToken() { setPersonalToken(''); }
    function hasPersonalToken() { return !!docToken(); }

    function urlOp(op, them) { return apiBase + (apiBase.indexOf('?') >= 0 ? '&' : '?') + 'op=' + op + (them || ''); }
    function tieuDe(json) {
      var h = { 'X-NH-Client': '1', 'Accept': 'application/json' };
      var t = docToken();
      if (t) h['X-Canvas-Token'] = t;
      if (json) h['Content-Type'] = 'application/json';
      return h;
    }

    function laGioiHan(r, txt) {
      if (r.status === 429) return true;
      if (r.status !== 403) return false;
      if (/rate limit exceeded/i.test(txt || '')) return true;
      var con = r.headers && r.headers.get('x-rate-limit-remaining');
      return con != null && con !== '' && Number(con) <= 0;
    }
    function thoiGianCho(r, lan) {
      var ra = Number(r.headers && r.headers.get('retry-after'));
      if (ra > 0) return Math.min(60000, ra * 1000);
      return Math.min(20000, 1000 * Math.pow(2, lan)) + Math.floor(Math.random() * 250);
    }

    // Gửi một yêu cầu tới máy chủ trung gian; tự chờ lùi khi Canvas trả 403/429 giới hạn tốc độ
    async function goi(url, init, kiemHuy) {
      for (var lan = 0; ; lan++) {
        if (kiemHuy) kiemHuy();
        var r;
        try { r = await goiFetch(url, init); }
        catch (e) { throw CanvasError('Không kết nối được máy chủ trung gian (' + (e && e.message || e) + ').', 0, { code: 'mang' }); }
        var txt = await r.text();
        if (laGioiHan(r, txt) && lan < THU_LAI_TOI_DA) { await ngu(thoiGianCho(r, lan)); continue; }
        var data = docJson(txt);
        if (!r.ok) throw loiTuPhanHoi(r.status, data, txt);
        return { status: r.status, data: data, headers: r.headers, text: txt };
      }
    }

    function proxy(method, path, body, kiemHuy) {
      var init = { method: method, headers: tieuDe(body !== undefined), credentials: 'same-origin' };
      if (body !== undefined) init.body = JSON.stringify(body);
      return goi(urlOp('proxy', '&path=' + encodeURIComponent(toApiPath(path))), init, kiemHuy);
    }

    // GET theo trang: đi theo Link rel="next" tới hết
    async function layHet(path, kiemHuy) {
      var tat = [], p = path, dem = 0;
      while (p) {
        if (++dem > 200) throw CanvasError('Quá nhiều trang dữ liệu từ Canvas.', 0, { code: 'qua_trang' });
        var r = await proxy('GET', p, undefined, kiemHuy);
        if (Array.isArray(r.data)) tat = tat.concat(r.data);
        else if (r.data != null && dem === 1) return r.data;
        p = toApiPath(parseLink(r.headers && r.headers.get('link')).next || '');
      }
      return tat;
    }

    /* ---------- cấu hình / phiên ---------- */

    async function getConfig() {
      try {
        var r = await goiFetch(urlOp('config'), { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
        var d = docJson(await r.text());
        if (!r.ok || !d || typeof d !== 'object') return { enabled: false, reason: 'Máy chủ trung gian không trả lời (mã ' + r.status + ').' };
        d.personalTokenSet = hasPersonalToken();
        return d;
      } catch (e) {
        // mở bằng file:// hoặc deploy tĩnh không có hàm máy chủ
        return { enabled: false, reason: 'Không có máy chủ trung gian /api/canvas.' };
      }
    }

    function loginUrl() { return urlOp('login'); }

    async function logout() {
      var coToken = hasPersonalToken();
      clearPersonalToken();     // token cá nhân chỉ xoá khỏi trình duyệt, không thu hồi trên Canvas
      try {
        var r = await goiFetch(urlOp('logout'), { method: 'POST', headers: { 'X-NH-Client': '1', 'Accept': 'application/json' }, credentials: 'same-origin' });
        await r.text();
        return { ok: r.ok, personalTokenCleared: coToken };
      } catch (e) { return { ok: false, personalTokenCleared: coToken }; }
    }

    // Người dùng hiện tại; null nếu chưa đăng nhập
    async function me() {
      try {
        var r = await goi(urlOp('me'), { method: 'GET', headers: tieuDe(false), credentials: 'same-origin' });
        return r.data;
      } catch (e) {
        if (e.status === 401) return null;
        throw e;
      }
    }

    /* ---------- khoá học, ngân hàng, quyền ---------- */

    // Khoá học mà người dùng là giáo viên / thiết kế / trợ giảng (gộp, bỏ trùng)
    async function listCourses() {
      var theoId = {}, ds = [];
      var vaiTro = ['teacher', 'designer', 'ta'];
      for (var i = 0; i < vaiTro.length; i++) {
        var arr = await layHet('/api/v1/courses?enrollment_type=' + vaiTro[i] +
          '&state%5B%5D=available&state%5B%5D=unpublished&include%5B%5D=term&per_page=100');
        (Array.isArray(arr) ? arr : []).forEach(function (c) {
          if (!c || c.id == null || c.access_restricted_by_date) return;
          var id = String(c.id);
          if (theoId[id]) { if (theoId[id].roles.indexOf(vaiTro[i]) < 0) theoId[id].roles.push(vaiTro[i]); return; }
          theoId[id] = chuanKhoaHoc(c, vaiTro[i]);
          ds.push(theoId[id]);
        });
      }
      ds.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
      return ds;
    }

    // Ngân hàng câu hỏi (Classic) của khoá học — API question_banks (Canvas từ 01/2026)
    async function listBanks(courseId) {
      if (!laSoId(courseId)) throw CanvasError('Mã khoá học không hợp lệ.', 0, { code: 'tham_so' });
      var arr;
      try {
        arr = await layHet('/api/v1/question_banks?context_type=Course&context_id=' + courseId + '&include_question_count=true&per_page=100');
      } catch (e) {
        if (e.status === 404 && !e.code) throw CanvasError('Canvas của trường chưa có API liệt kê ngân hàng câu hỏi.', 404, { code: 'khong_ho_tro' });
        throw e;
      }
      return (Array.isArray(arr) ? arr : []).filter(function (b) { return b && b.workflow_state !== 'deleted'; }).map(function (b) {
        return {
          id: String(b.id), title: b.title || '', count: b.assessment_question_count != null ? Number(b.assessment_question_count) : null,
          updatedAt: b.updated_at || null, state: b.workflow_state || ''
        };
      });
    }

    // Quyền cần cho import + có bộ chuyển QTI hay không
    async function checkPermissions(courseId) {
      if (!laSoId(courseId)) throw CanvasError('Mã khoá học không hợp lệ.', 0, { code: 'tham_so' });
      var ten = ['manage_course_content_add', 'manage_content', 'read_question_banks', 'manage_files_add', 'manage_files'];
      var q = ten.map(function (t) { return 'permissions%5B%5D=' + t; }).join('&');
      var p = (await proxy('GET', '/api/v1/courses/' + courseId + '/permissions?' + q)).data || {};
      var qti = null;
      try {
        var mg = await layHet('/api/v1/courses/' + courseId + '/content_migrations/migrators?per_page=100');
        qti = Array.isArray(mg) ? mg.some(function (m) { return m && m.type === 'qti_converter'; }) : null;
      } catch (e) { if (e.status !== 401 && e.status !== 403 && e.status !== 404) throw e; }
      var kq = {
        canImport: !!(p.manage_course_content_add || p.manage_content),
        canListBanks: p.read_question_banks !== false,          // khoá có thể không trả quyền này → coi là có
        canReadProgress: !!(p.manage_files_add || p.manage_files),
        qtiAvailable: qti,
        permissions: p,
        missing: []
      };
      if (!kq.canImport) kq.missing.push('Nội dung khoá học – thêm (Course Content – add)');
      if (!kq.canListBanks) kq.missing.push('Ngân hàng câu hỏi – xem và liên kết (Question banks – view and link)');
      if (qti === false) kq.missing.push('Canvas chưa bật bộ nhập QTI (qti_converter)');
      kq.ok = kq.canImport && qti !== false;
      return kq;
    }

    /* ---------- import gói QTI ---------- */

    function importPackage(courseId, o) {
      var k = String(courseId);
      var truoc = hangDoi[k] || Promise.resolve();
      var lan = truoc.catch(function () { /* lần trước lỗi không chặn lần sau */ }).then(function () { return nhapGoi(courseId, o || {}); });
      hangDoi[k] = lan.then(function () { }, function () { });
      return lan;
    }

    async function nhapGoi(courseId, o) {
      if (!laSoId(courseId)) throw CanvasError('Mã khoá học không hợp lệ.', 0, { code: 'tham_so' });
      var bytes = o.bytes instanceof Uint8Array ? o.bytes : (o.bytes instanceof ArrayBuffer ? new Uint8Array(o.bytes) : null);
      if (!bytes || !bytes.length) throw CanvasError('Thiếu nội dung gói QTI (.zip).', 0, { code: 'tham_so' });
      var fileName = String(o.fileName || 'goi-qti.zip');
      var ctype = o.contentType || 'application/zip';
      var onProgress = typeof o.onProgress === 'function' ? o.onProgress : function () { };
      var signal = o.signal;
      var hanChot = bayGio() + (o.timeoutMs || 30 * 60 * 1000);
      var kiemHuy = function () { if (signal && signal.aborted) throw CanvasError('Đã huỷ gửi lên Canvas.', 0, { code: 'huy' }); };
      var bao = function (stage, percent, message, them) {
        var e = { stage: stage, percent: Math.max(0, Math.min(100, Math.round(percent))), message: message };
        if (them) for (var kk in them) e[kk] = them[kk];
        try { onProgress(e); } catch (x) { /* lỗi giao diện không làm hỏng import */ }
      };
      var goc = '/api/v1/courses/' + courseId + '/content_migrations';

      // 1) tạo migration (JSON, overwrite_quizzes là boolean thật — chuỗi "false" bị Ruby coi là true)
      bao('create', 2, 'Đang tạo yêu cầu nhập trên Canvas…');
      var settings = {};
      if (o.bankName) settings.question_bank_name = String(o.bankName);
      if (o.bankId != null && laSoId(o.bankId)) settings.question_bank_id = String(o.bankId);
      if (o.overwrite !== false) settings.overwrite_quizzes = true;
      var m = (await proxy('POST', goc, {
        migration_type: 'qti_converter',
        pre_attachment: { name: fileName, size: bytes.length, content_type: ctype },
        settings: settings
      }, kiemHuy)).data;
      if (!m || m.id == null) throw CanvasError('Canvas không trả về mã lần nhập.', 0, { code: 'phan_hoi' });
      var mid = String(m.id);
      var duongMig = goc + '/' + mid;
      var pa = m.pre_attachment;
      if (!pa || pa.error || !pa.upload_url) {
        var ly = pa && pa.message ? String(pa.message) : '';
        throw CanvasError(/quota/i.test(ly) ? 'Gói vượt dung lượng tệp còn lại của khoá học trên Canvas.'
          : 'Canvas không cấp địa chỉ tải gói lên' + (ly ? ' (' + ly + ')' : '') + '.', 0, { code: 'tai_len', migrationId: mid });
      }

      // 2) tải gói lên
      bao('upload', 5, 'Đang tải gói lên Canvas…', { migrationId: mid });
      await taiGoiLen(pa, bytes, fileName, ctype, duongMig, kiemHuy);
      bao('upload', 15, 'Đã tải gói lên — chờ Canvas xử lý…', { migrationId: mid });

      // 3) theo dõi: migration là nguồn sự thật; progress (nếu đọc được) cho % hoàn thành
      var duongTienTrinh = m.progress_url ? toApiPath(m.progress_url) : '';
      if (duongTienTrinh && !/^\/api\/v1\/progress\/\d+$/.test(duongTienTrinh)) duongTienTrinh = '';
      var cho = o.pollMs || 1000, batDau = bayGio(), giaiDoan = '', tt = null, pr = null;
      for (;;) {
        kiemHuy();
        m = (await proxy('GET', duongMig, undefined, kiemHuy)).data || m;
        giaiDoan = mapState(m.workflow_state);
        pr = null;
        if (duongTienTrinh && giaiDoan !== 'completed' && giaiDoan !== 'failed') {
          try { pr = (await proxy('GET', duongTienTrinh, undefined, kiemHuy)).data; }
          catch (e) { if (e.status === 401 || e.status === 403 || e.status === 404) duongTienTrinh = ''; else throw e; }
        }
        tt = pr;
        var pct = pr && pr.completion != null ? Number(pr.completion) : null;
        if (giaiDoan === 'pre_processing') bao('pre_processing', 15, 'Canvas đang nhận gói…', { migrationId: mid });
        else if (giaiDoan === 'queued') bao('queued', 15, 'Đang xếp hàng — khoá học đang có một lần nhập khác, Canvas sẽ tự chạy tiếp…', { migrationId: mid });
        else if (giaiDoan === 'running') bao('running', 20 + (pct != null ? pct * 0.75 : 0), 'Canvas đang nhập câu hỏi…' + (pct != null ? ' (' + Math.round(pct) + '%)' : ''), { migrationId: mid, completion: pct });
        if (giaiDoan === 'completed' || giaiDoan === 'failed') break;
        if (giaiDoan === 'pre_processing' && bayGio() - batDau > CHO_NHAN_GOI) {
          throw CanvasError('Canvas chưa nhận được gói sau 3 phút — lần tải lên có thể đã lỗi. Hãy thử lại hoặc tải gói và import tay.', 0, { code: 'qua_gio', migrationId: mid });
        }
        if (bayGio() > hanChot) throw CanvasError('Quá thời gian chờ Canvas nhập xong. Xem lại trong Canvas: Cài đặt khoá học → Nhập nội dung khoá học.', 0, { code: 'qua_gio', migrationId: mid });
        await ngu(cho);
        cho = Math.min(o.pollMaxMs || 3000, Math.round(cho * 1.5));
      }

      // 4) vấn đề sau import
      bao('issues', 97, 'Đang lấy danh sách vấn đề…', { migrationId: mid });
      var issues = [];
      try {
        var ds = await layHet(duongMig + '/migration_issues?per_page=100', kiemHuy);
        issues = (Array.isArray(ds) ? ds : []).map(chuanVanDe);
      } catch (e) { if (e.code === 'huy') throw e; issues = []; }
      var ok = giaiDoan === 'completed';
      var nLoi = issues.filter(function (i) { return i.type === 'error'; }).length;
      bao(giaiDoan, 100, ok ? 'Đã nhập xong vào Canvas' + (issues.length ? ' — ' + issues.length + ' vấn đề cần xem.' : '.')
        : 'Canvas báo nhập thất bại' + (nLoi ? ' (' + nLoi + ' lỗi).' : '.'), { migrationId: mid });
      return { ok: ok, state: giaiDoan, migrationId: mid, migration: m, progress: tt, issues: issues };
    }

    function taoForm(pa, bytes, fileName, ctype) {
      var fd = new FormData();
      var p = pa.upload_params || {};
      Object.keys(p).forEach(function (k) { fd.append(k, p[k] == null ? '' : String(p[k])); });   // giữ nguyên, đúng thứ tự
      fd.append(pa.file_param || 'file', new Blob([bytes], { type: ctype }), fileName);              // file luôn cuối
      return fd;
    }

    // Dựng thân multipart thủ công (biết trước boundary) — upload_params đúng thứ tự, file cuối
    function taoMultipart(pa, bytes, fileName, ctype) {
      var ranh = '----NHCanvas' + Math.random().toString(16).slice(2) + Date.now().toString(16);
      var enc = new TextEncoder();
      var esc = function (s) { return String(s).replace(/"/g, '%22').replace(/\r/g, '%0D').replace(/\n/g, '%0A'); };
      var p = pa.upload_params || {}, phan = [];
      Object.keys(p).forEach(function (k) {
        phan.push(enc.encode('--' + ranh + '\r\nContent-Disposition: form-data; name="' + esc(k) + '"\r\n\r\n' + (p[k] == null ? '' : String(p[k])) + '\r\n'));
      });
      phan.push(enc.encode('--' + ranh + '\r\nContent-Disposition: form-data; name="' + esc(pa.file_param || 'file') + '"; filename="' + esc(fileName) +
        '"\r\nContent-Type: ' + ctype + '\r\n\r\n'));
      phan.push(bytes);
      phan.push(enc.encode('\r\n--' + ranh + '--\r\n'));
      var n = 0, i;
      for (i = 0; i < phan.length; i++) n += phan[i].length;
      var out = new Uint8Array(n), o = 0;
      for (i = 0; i < phan.length; i++) { out.set(phan[i], o); o += phan[i].length; }
      return { body: out, contentType: 'multipart/form-data; boundary=' + ranh };
    }

    async function taiQuaMayChu(pa, bytes, fileName, ctype, kiemHuy) {
      if (bytes.length > TAI_QUA_MAY_CHU) {
        throw CanvasError('Gói lớn hơn 4 MB và Canvas của trường không dùng inst-fs nên không gửi qua máy chủ trung gian được — hãy tải gói về rồi import tay.', 413, { code: 'qua_lon' });
      }
      var mp = taoMultipart(pa, bytes, fileName, ctype);
      var h = { 'X-NH-Client': '1', 'Accept': 'application/json', 'Content-Type': 'application/octet-stream', 'X-Upload-Content-Type': mp.contentType };
      var t = docToken();
      if (t) h['X-Canvas-Token'] = t;
      var r = await goi(urlOp('upload', '&url=' + encodeURIComponent(pa.upload_url)),
        { method: 'POST', headers: h, body: mp.body, credentials: 'same-origin' }, kiemHuy);
      return r.data;
    }

    async function taiGoiLen(pa, bytes, fileName, ctype, duongMig, kiemHuy) {
      if (!laTaiThang(pa.upload_url)) return taiQuaMayChu(pa, bytes, fileName, ctype, kiemHuy);
      kiemHuy();
      var r;
      try {
        // POST thẳng tới inst-fs: không gửi cookie/token, không tiêu đề tự đặt (tránh preflight)
        r = await goiFetch(pa.upload_url, { method: 'POST', body: taoForm(pa, bytes, fileName, ctype), credentials: 'omit', redirect: 'follow' });
      } catch (e) {
        // Có thể inst-fs đã nhận nhưng trình duyệt không đọc được phản hồi → hỏi Canvas trước khi thử đường khác
        await ngu(1500);
        var m = (await proxy('GET', duongMig, undefined, kiemHuy)).data || {};
        if (mapState(m.workflow_state) !== 'pre_processing') return { ok: true, via: 'direct-opaque' };
        return taiQuaMayChu(pa, bytes, fileName, ctype, kiemHuy);
      }
      var txt = '';
      try { txt = await r.text(); } catch (e) { txt = ''; }
      if (r.ok || r.type === 'opaque' || r.type === 'opaqueredirect') return { ok: true, via: 'direct', status: r.status };
      var d = docJson(txt);
      throw CanvasError('Máy lưu trữ của Canvas từ chối gói (mã ' + r.status + ')' + (thongDiepCanvas(d) ? ': ' + thongDiepCanvas(d) : '') + '.', r.status, { code: 'tai_len' });
    }

    return {
      getConfig: getConfig, loginUrl: loginUrl, logout: logout, me: me,
      listCourses: listCourses, listBanks: listBanks, checkPermissions: checkPermissions, importPackage: importPackage,
      setPersonalToken: setPersonalToken, clearPersonalToken: clearPersonalToken, hasPersonalToken: hasPersonalToken,
      request: function (method, path, body) { return proxy(method, path, body); }
    };
  }

  var macDinh = create();
  var api = {
    create: create, parseLink: parseLink, toApiPath: toApiPath, isInstFs: isInstFs, mapState: mapState,
    CanvasError: CanvasError, UPLOAD_PROXY_MAX: TAI_QUA_MAY_CHU
  };
  for (var k in macDinh) api[k] = macDinh[k];
  return api;
});
