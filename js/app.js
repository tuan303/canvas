/* js/app.js — giao diện giáo viên (DESIGN §10): nạp đề → soát câu hỏi → xuất gói QTI → (tuỳ chọn) gửi thẳng lên Canvas.
 * Phần "thuần" (phân loại file, gộp lỗi, chuẩn bị ngân hàng để xuất, các bước nhập Canvas) không dùng DOM
 * và được xuất ra để test bằng Node; phần giao diện chỉ chạy khi có `document`. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.app = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var laNode = typeof module === 'object' && module.exports && typeof require === 'function';
  var core = laNode ? require('./core.js') : root.NH.core;

  /* ===================== Phần thuần (test được bằng Node) ===================== */

  var LOAI_TEN = {
    mc: 'Một đáp án', ma: 'Nhiều đáp án', tf: 'Đúng/Sai', short: 'Trả lời ngắn', num: 'Điền số',
    blanks: 'Điền khuyết', dropdowns: 'Chọn từ danh sách', matching: 'Ghép nối', essay: 'Tự luận', text: 'Đoạn thông tin'
  };
  var LOAI_CANVAS = {
    mc: 'Multiple Choice', ma: 'Multiple Answers', tf: 'Multiple Dropdowns (Đúng/Sai)', short: 'Fill In the Blank',
    num: 'Numerical Answer', blanks: 'Fill In Multiple Blanks', dropdowns: 'Multiple Dropdowns', matching: 'Matching',
    essay: 'Essay Question', text: 'Text (no question)'
  };
  var MUC_TEN = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
  var NGUON_TEN = {
    docx: 'Word', xlsx: 'Excel', scorm: 'SCORM', image: 'Ảnh', images: 'Zip ảnh', goi: 'Zip', qti: 'Gói QTI',
    'office-cu': 'Office cũ', pdf: 'PDF', 'image-khac': 'Ảnh', unknown: 'Không rõ', zip: 'Zip'
  };
  var DUOI_ANH = /\.(png|jpe?g|gif)$/i;
  var RAC_ZIP = /(^|\/)(__MACOSX\/|\.[^/]*$)|(^|\/)(thumbs\.db|desktop\.ini)$/i;

  // Số kiểu Việt Nam: 0.25 → "0,25" (làm tròn 4 chữ số, không phân tách nghìn)
  function fmtSo(x) {
    if (typeof x !== 'number' || !isFinite(x)) return String(x);
    var s = String(Math.round(x * 10000) / 10000);
    if (/e/i.test(s)) s = x.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('-', '−').replace('.', ',');
  }

  // Điểm giáo viên gõ: "0,25" / "0.5" / "1đ" → số ≥ 0 (≤ 1000); sai → null
  function docDiem(s) {
    var v;
    if (typeof s === 'number') v = s;
    else {
      var t = String(s == null ? '' : s).trim();
      if (!t) return null;
      v = core.parsePoints(t);
    }
    if (v == null || typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1000) return null;
    return Math.round(v * 10000) / 10000;
  }

  /* ---------- nhận dạng file theo nội dung ---------- */

  function kieuAnh(u8) {
    if (!u8 || u8.length < 4) return '';
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'png';
    if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpg';
    if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return 'gif';
    if (u8.length >= 12 && u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
      u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'webp';
    if (u8[0] === 0x42 && u8[1] === 0x4D) return 'bmp';
    if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2A) || (u8[0] === 0x4D && u8[1] === 0x4D && u8[3] === 0x2A)) return 'tiff';
    return '';
  }
  function laZip(u8) { return !!u8 && u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B && (u8[2] === 3 || u8[2] === 5) && (u8[3] === 4 || u8[3] === 6); }
  function laOle(u8) { return !!u8 && u8.length >= 8 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0 && u8[4] === 0xA1 && u8[5] === 0xB1; }
  function laPdf(u8) { return !!u8 && u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46; }

  // File rời (chưa mở zip): 'zip' | 'image' | 'image-khac' | 'office-cu' | 'pdf' | 'unknown'
  function phanLoaiFile(name, u8) {
    if (laZip(u8)) return 'zip';
    var a = kieuAnh(u8);
    if (a) return (a === 'png' || a === 'jpg' || a === 'gif') ? 'image' : 'image-khac';
    if (laOle(u8)) return 'office-cu';
    if (laPdf(u8)) return 'pdf';
    return 'unknown';
  }

  // Zip theo danh sách đường dẫn bên trong: 'docx' | 'xlsx' | 'scorm' | 'qti' | 'goi' (zip ảnh / gói nhiều file)
  function phanLoaiZip(paths) {
    var ds = (paths || []).map(function (p) { return String(p).replace(/\\/g, '/'); });
    var co = {};
    ds.forEach(function (p) { co[p.toLowerCase()] = 1; });
    if (co['word/document.xml']) return 'docx';
    if (co['xl/workbook.xml']) return 'xlsx';
    var coManifest = ds.some(function (p) { return /(^|\/)imsmanifest\.xml$/i.test(p) && !RAC_ZIP.test(p); });
    if (coManifest) {
      var coHtml = ds.some(function (p) { return /\.html?$/i.test(p) && !RAC_ZIP.test(p); });
      var coQti = ds.some(function (p) { return /\.xml\.qti$|(^|\/)assessment_meta\.xml$/i.test(p); });
      return coHtml && !coQti ? 'scorm' : 'qti';
    }
    return 'goi';
  }

  // Tách zip "gói": ảnh → anh, .docx/.xlsx/.zip lồng bên trong → con, còn lại → boQua
  function tachGoi(files) {
    var kq = { anh: {}, con: [], boQua: [] };
    Object.keys(files || {}).forEach(function (p) {
      var u8 = files[p];
      if (RAC_ZIP.test(p) || !u8 || !u8.length) return;
      var ten = p.replace(/^.*\//, '');
      var a = kieuAnh(u8);
      if (a === 'png' || a === 'jpg' || a === 'gif') kq.anh[p] = u8;
      else if (/\.(docx|xlsx|zip)$/i.test(ten) && laZip(u8)) kq.con.push({ name: ten, bytes: u8 });
      else if (a) kq.boQua.push({ path: p, lyDo: 'ảnh ' + a.toUpperCase() + ' chưa hỗ trợ (chỉ PNG, JPG, GIF)' });
      else kq.boQua.push({ path: p, lyDo: 'không phải ảnh / Word / Excel' });
    });
    return kq;
  }

  /* ---------- lỗi / cảnh báo của câu ---------- */

  // Phần nội dung sau tiền tố "Câu 7 (Phần II): " / "Dòng 12: " → để bỏ trùng giữa bộ đọc file và core.validateQuestion
  function duoiMsg(m) {
    return String(m == null ? '' : m).replace(/^\s*(?:Câu|Dòng|Question|Item)\b[^:]{0,60}:\s*/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function cacHtmlCua(q) {
    var m = [q.stem, q.stimulus, q.feedback];
    (Array.isArray(q.choices) ? q.choices : []).forEach(function (c) { if (c) m.push(c.html); });
    (Array.isArray(q.statements) ? q.statements : []).forEach(function (s) { if (s) m.push(s.html); });
    (Array.isArray(q.pairs) ? q.pairs : []).forEach(function (p) { if (p) m.push(p.left); });
    return m.filter(function (x) { return typeof x === 'string' && x; });
  }

  function anhTrongHtml(html) {
    var kq = [], re = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, m;
    while ((m = re.exec(String(html || '')))) kq.push(m[1] != null ? m[1] : (m[2] != null ? m[2] : m[3]));
    return kq;
  }

  function giaiMaTen(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function giaiThucThe(s) { return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }

  // Ảnh tham chiếu mà ngân hàng không có, ảnh data: chưa tách
  function vanDeAnh(q, images) {
    var out = [], thay = {};
    var ten = 'Câu ' + (q.no != null && q.no !== '' ? q.no : (q.title || q.id || '?'));
    cacHtmlCua(q).forEach(function (h) {
      anhTrongHtml(h).forEach(function (src) {
        src = giaiThucThe(src).trim();
        var m = /^images\/(.+)$/.exec(src), k;
        if (/^data:/i.test(src)) {
          k = 'data:';
          if (!thay[k]) out.push(core.newIssue('error', ten + ': có ảnh nhúng dạng data: chưa tách thành file — Canvas sẽ bỏ ảnh này', q.id));
        } else if (m) {
          var n = giaiMaTen(m[1]);
          k = 'img:' + n;
          if (!thay[k] && !(images && Object.prototype.hasOwnProperty.call(images, n))) {
            out.push(core.newIssue('error', ten + ': thiếu ảnh "' + n + '" — chèn lại ảnh vào file (hoặc kéo thả ảnh/zip ảnh kèm file Excel)', q.id));
          }
        }
        if (k) thay[k] = 1;
      });
    });
    return out;
  }

  // Gộp lỗi của bộ đọc file + core.validateQuestion + kiểm tra ảnh, bỏ trùng
  function vanDeCau(q, images) {
    var ds = [], thay = {};
    function them(i) {
      if (!i || !i.msg) return;
      var k = (i.level || 'info') + '|' + duoiMsg(i.msg);
      if (thay[k]) return;
      thay[k] = 1;
      ds.push(i);
    }
    if (!q || typeof q !== 'object') return [core.newIssue('error', 'Câu hỏi không hợp lệ')];
    (Array.isArray(q.issues) ? q.issues : []).forEach(them);
    core.validateQuestion(q).forEach(them);
    vanDeAnh(q, images).forEach(them);
    var thuTu = { error: 0, warn: 1, info: 2 };
    ds.sort(function (a, b) { return (thuTu[a.level] || 0) - (thuTu[b.level] || 0); });
    return ds;
  }

  function demMuc(issues) {
    var d = { error: 0, warn: 0, info: 0 };
    (issues || []).forEach(function (i) { if (d[i.level] != null) d[i.level]++; });
    return d;
  }

  /* ---------- mục ngân hàng trong giao diện ---------- */

  // entry = { key, bank, boChon: {qid:true}, khongXuat: bool, _vd: {qid: Issue[]} }
  function taoMuc(key, bank) { return { key: key, bank: bank, boChon: {}, khongXuat: false, _vd: {} }; }

  function vdCua(entry, q) {
    var k = q && q.id != null ? q.id : '';
    if (!entry._vd) entry._vd = {};
    if (!entry._vd[k]) entry._vd[k] = vanDeCau(q, entry.bank.images);
    return entry._vd[k];
  }
  function coLoi(entry, q) { return vdCua(entry, q).some(function (i) { return i.level === 'error'; }); }
  function duocXuat(entry, q) { return !!q && !coLoi(entry, q) && !entry.boChon[q.id]; }

  function tomTatMuc(entry) {
    var qs = Array.isArray(entry.bank.questions) ? entry.bank.questions : [];
    var t = { tong: qs.length, theoLoai: {}, loi: 0, canhBao: 0, chon: 0, diem: 0, xuatDuoc: 0 };
    qs.forEach(function (q) {
      if (!q) return;
      t.theoLoai[q.type] = (t.theoLoai[q.type] || 0) + 1;
      var d = demMuc(vdCua(entry, q));
      if (d.error) t.loi++; else t.xuatDuoc++;
      if (d.warn) t.canhBao++;
      if (duocXuat(entry, q)) { t.chon++; t.diem += (typeof q.points === 'number' && isFinite(q.points) ? q.points : 0); }
    });
    t.diem = Math.round(t.diem * 10000) / 10000;
    return t;
  }

  /*
   * Ngân hàng đưa vào qti.buildPackages: GIỮ NGUYÊN vị trí câu (ident item = vị trí trong ngân hàng, cần ổn định
   * để "Ghi đè" khớp đúng câu cũ) — câu không xuất được thay bằng null (qti bỏ qua, ta lọc thông báo của nó).
   */
  function banksDeXuat(entries) {
    var out = [];
    (entries || []).forEach(function (e) {
      if (!e || e.khongXuat || !e.bank) return;
      var qs = (Array.isArray(e.bank.questions) ? e.bank.questions : []).map(function (q) { return duocXuat(e, q) ? q : null; });
      if (!qs.some(Boolean)) return;
      var b = {};
      for (var k in e.bank) if (Object.prototype.hasOwnProperty.call(e.bank, k)) b[k] = e.bank[k];
      b.questions = qs;
      out.push(b);
    });
    return out;
  }

  // Bỏ thông báo "dữ liệu câu hỏi không hợp lệ" mà qti sinh cho các chỗ trống null ở trên
  function locVanDeXuat(issues) {
    var kq = (issues || []).filter(function (i) { return !(i && i.qid == null && /:\s*dữ liệu câu hỏi không hợp lệ$/.test(String(i.msg || ''))); });
    return kq;
  }

  /* ---------- file đáp án riêng (HDC / KEY / ĐÁP ÁN) ↔ file đề ---------- */

  // Từ quá chung trong tên file đề, không dùng để so khớp ("Đề thi", "Kiểm tra", "chưa đáp án"…)
  var TU_CHUNG = { de: 1, thi: 1, kiem: 1, tra: 1, bai: 1, chua: 1, cau: 1, hoi: 1, file: 1, ban: 1, va: 1 };
  function tuKhoaTen(goc) {
    var kq = [];
    String(goc || '').split(/[.\s_\-]+/).forEach(function (t) { if (t && !TU_CHUNG[t] && kq.indexOf(t) < 0) kq.push(t); });
    return kq;
  }

  /*
   * Chọn file đề cho một file đáp án theo tên: dsDe = [{id, name, …}] (file đề đã/đang đọc), dx = module docx
   * (answerKeyBaseName bỏ các chữ HDC/KEY/ĐÁP ÁN/Hướng dẫn chấm…).
   *  1) tên gốc trùng hẳn ('26.12.HH.KS.HDC.0301' ↔ '26.12.HH.KS.0301', 'X_KEY' ↔ 'X') — chỉ nhận khi duy nhất;
   *  2) không thì so từ khoá (bỏ từ chung): phần chung / tập nhỏ hơn ≥ 0,8, có từ chứa chữ cái, hơn hẳn các đề khác;
   *  3) không thì nếu chỉ có đúng một file đề (và choMotDe khác false) → file đó. Mơ hồ → null (giáo viên tự chọn).
   *  Giao diện chỉ cho bước 3 khi file đề nạp cùng lần hoặc trước file đáp án — file đề tên khác nạp SAU có thể là đề khác.
   */
  function chonDeChoKey(tenKey, dsDe, dx, choMotDe) {
    if (!dx || typeof dx.answerKeyBaseName !== 'function' || !Array.isArray(dsDe) || !dsDe.length) return null;
    var goc = dx.answerKeyBaseName(tenKey);
    var trung = dsDe.filter(function (d) { return goc && dx.answerKeyBaseName(d.name) === goc; });
    if (trung.length) return trung.length === 1 ? trung[0] : null;
    var a = tuKhoaTen(goc), tot = null, diemTot = 0, hoa = false;
    dsDe.forEach(function (d) {
      var b = tuKhoaTen(dx.answerKeyBaseName(d.name));
      if (!a.length || !b.length) return;
      var chung = a.filter(function (t) { return b.indexOf(t) >= 0; });
      if (!chung.some(function (t) { return t.length >= 2 && /[a-z]/.test(t); })) return;
      var diem = chung.length / Math.min(a.length, b.length);
      if (diem > diemTot) { tot = d; diemTot = diem; hoa = false; } else if (diem === diemTot) hoa = true;
    });
    if (tot && diemTot >= 0.8 && !hoa) return tot;
    return dsDe.length === 1 && choMotDe !== false ? dsDe[0] : null;
  }

  // Áp file đáp án (kết quả parseAnswerKey / parseDocx keyOnly) vào các mục ngân hàng của một file đề: câu được sửa
  // tại chỗ (docx.applyAnswerKey tự kiểm tra lại câu), xoá bộ nhớ đệm lỗi của mục để bước 2 soát lại.
  function apDapAnChoMuc(mucs, key, dx) {
    var ds = (mucs || []).filter(function (e) { return e && e.bank; });
    var r = dx.applyAnswerKey(ds.map(function (e) { return e.bank; }), key);
    ds.forEach(function (e) { e._vd = {}; });
    return r;
  }

  /* ---------- lớp bảo vệ thứ hai khi hiện HTML câu hỏi (DOM do app.js dựng) ---------- */

  // Thẻ bị bỏ cả nội dung: chạy mã / nhúng / đổi trang / SVG hoạt hoạ (animate/set đổi được href thành javascript:)
  var THE_CAM = {
    script: 1, style: 1, iframe: 1, frame: 1, frameset: 1, object: 1, embed: 1, link: 1, meta: 1, base: 1, form: 1, noscript: 1,
    template: 1, applet: 1, svg: 1, animate: 1, set: 1, animatemotion: 1, animatetransform: 1, foreignobject: 1, use: 1
  };
  var THUOC_TINH_URL = { href: 1, src: 1, action: 1, formaction: 1, 'xlink:href': 1, background: 1, poster: 1 };
  // URL chạy mã: trình duyệt bỏ ký tự điều khiển/khoảng trắng trong scheme ("java\tscript:", "\x01javascript:")
  function urlNguyHiem(v) {
    var s = String(v == null ? '' : v).replace(/[\x00-\x20\x7f]/g, '').toLowerCase();
    return /^(javascript|vbscript|data):/.test(s) && !/^data:image\/(png|jpe?g|gif);/.test(s);
  }
  // Thuộc tính phải bỏ: on*, id/name (chiếm id của giao diện, vd "vung-thong-bao"), form/srcdoc/srcset/ping/formaction,
  // URL chạy mã, style có expression()/url(javascript:)
  function thuocTinhNguyHiem(ten, giaTri) {
    var n = String(ten || '').toLowerCase();
    if (n.slice(0, 2) === 'on' || /^(id|name|form|srcdoc|srcset|ping|formaction)$/.test(n)) return true;
    if (THUOC_TINH_URL[n] && urlNguyHiem(giaTri)) return true;
    return n === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*(javascript|vbscript)/i.test(String(giaTri));
  }

  /* ---------- các bước nhập vào Canvas (nhãn giao diện Canvas tiếng Việt + tiếng Anh) ---------- */

  function ui(vi, en) { return '<span class="ui">' + vi + '</span>' + (en ? ' <span class="en">(' + en + ')</span>' : ''); }

  function cacBuocNhap(target) {
    if (target === 'classic') {
      return {
        tieuDe: 'Nhập vào Question Bank – Classic Quizzes',
        buoc: [
          'Trong khoá học, mở ' + ui('Cài Đặt', 'Settings') + ' → ' + ui('Nhập Nội Dung Khóa Học', 'Import Course Content') + '.',
          'Ở ' + ui('Loại Nội Dung', 'Content Type') + ' chọn ' + ui('Tập tin .zip QTI', 'QTI .zip file') + ', rồi chọn file <b>…_classic.zip</b> vừa tải (để nguyên, không giải nén).',
          '<b>Không</b> đánh dấu ô ' + ui('Chuyển đổi nội dung thành Các Câu Hỏi Kiểm Tra Mới', 'Convert content to New Quizzes') + ' (có Canvas ghi là "Nhập câu hỏi kiểm tra hiện có dưới dạng Các Câu Hỏi Kiểm Tra Mới").',
          'Mục ' + ui('Ngân hàng Câu Hỏi mặc định', 'Default question bank') + ': để nguyên — gói đã ghi sẵn tên từng ngân hàng.',
          '<b>Khi nhập lại gói đã sửa:</b> đánh dấu ' + ui('Ghi đè nội dung đánh giá với ID trùng khớp', 'Overwrite assessment content with matching IDs') + '. Không đánh dấu thì Canvas tạo thêm một ngân hàng trùng tên.',
          'Bấm ' + ui('Nhập', 'Import') + ', chờ dòng trạng thái của lần nhập ở cuối trang báo hoàn tất; bấm vào dòng đó để xem các vấn đề (nếu có).',
          'Kiểm tra: ' + ui('Câu Hỏi Kiểm Tra', 'Quizzes') + ' → nút ' + ui('⋮') + ' → ' + ui('Quản Lý Ngân Hàng Câu Hỏi', 'Manage Question Banks') + '.'
        ],
        ghiChu: [
          'Tiếng Việt của Canvas gọi <b>cả hai</b> loại là "Ngân Hàng Câu Hỏi": ngân hàng của Classic Quizzes hiện là "Ngân Hàng Câu Hỏi (Bản cũ)", còn Item Bank của New Quizzes cũng tên "Ngân Hàng Câu Hỏi". Gói này là cho Classic.',
          'Dùng ngân hàng: trong bài kiểm tra Classic → ' + ui('Câu hỏi', 'Questions') + ' → ' + ui('+ Nhóm Câu Hỏi Mới', 'New Question Group') + ' → liên kết ngân hàng để rút ngẫu nhiên N câu, hoặc ' + ui('Tìm Câu Hỏi', 'Find Questions') + ' để chọn từng câu.',
          'Canvas chấm câu Đúng/Sai nhiều ý tuyến tính (mỗi ý đúng = điểm câu ÷ số ý); thang 0,1 / 0,25 / 0,5 / 1 của Bộ không làm được.'
        ]
      };
    }
    return {
      tieuDe: 'Nhập vào Item Bank – New Quizzes',
      buoc: [
        'Trong khoá học, bấm ' + ui('Ngân Hàng Câu Hỏi', 'Item Banks') + ' ở thanh điều hướng bên trái của khoá học. Đừng mở Item Banks từ bên trong một bài kiểm tra — ở đó không có mục nhập.',
        'Bấm ' + ui('+ Add Bank', 'thêm ngân hàng') + ', đặt tên giống tên ngân hàng ở bước 2, rồi bấm ' + ui('Create Bank') + '.',
        'Mở ngân hàng <b>vừa tạo</b>. <b>Ngân hàng phải còn trống</b> — ngân hàng đã có câu hỏi sẽ không có mục nhập.',
        'Bấm nút ' + ui('⋮', 'Options') + ' ở góc trên ngân hàng → ' + ui('Import Content', 'nhập nội dung') + '.',
        'Chọn (hoặc kéo thả) <b>file .zip của đúng ngân hàng này</b> — mỗi ngân hàng một file, để nguyên không giải nén — rồi bấm ' + ui('Import') + '. Chờ thanh trạng thái chạy xong.',
        'Kiểm tra số câu, công thức và ảnh. Dùng trong bài kiểm tra: New Quiz → ' + ui('Build') + ' → biểu tượng Item Banks → thêm toàn bộ hoặc rút ngẫu nhiên N câu.'
      ],
      ghiChu: [
        'Tiếng Việt của Canvas gọi <b>cả hai</b> loại là "Ngân Hàng Câu Hỏi": ngân hàng của Classic Quizzes hiện là "Ngân Hàng Câu Hỏi (Bản cũ)", còn Item Bank của New Quizzes chỉ là "Ngân Hàng Câu Hỏi" (một vài chỗ ghi "Ngân Hàng Mục"). Gói này dành cho Item Bank; các nút bên trong New Quizzes hiện bằng tiếng Anh như trên.',
        '<b>Một file .zip = một ngân hàng.</b> Item Bank không ghi đè khi nhập lại: muốn cập nhật sau khi sửa đề, tạo một ngân hàng trống mới (hoặc xoá hết câu cũ) rồi nhập lại.',
        'Dùng chung: trong ngân hàng bấm ' + ui('⋮') + ' → ' + ui('Share') + ' để chia sẻ cho đồng nghiệp hoặc cho khoá học khác (ngân hàng được chia sẻ hiện ở bộ lọc ' + ui('Shared with Me') + ' / ' + ui('Shared with Courses') + '), không phải nhập lại ở từng khoá học.',
        'Cách khác: nhập thẳng vào một New Quiz <b>mới, còn trống</b>: ' + ui('Câu Hỏi Kiểm Tra', 'Quizzes') + ' → ' + ui('+ Thêm Câu Hỏi Kiểm Tra', 'Add Quiz') + ' → New Quizzes → ' + ui('Xây Dựng', 'Build') + ' → ' + ui('⋮') + ' → ' + ui('Import Content') + '. Bài kiểm tra lấy tên file làm tiêu đề.',
        'Lần đầu dùng: nhập thử một gói nhỏ để chắc chắn công thức (MathML), ảnh, câu "Chọn từ danh sách" và "Điền khuyết" hiển thị đúng trên New Quizzes của trường; nếu công thức không hiện, xuất lại với tuỳ chọn "Ảnh công thức của Canvas".'
      ]
    };
  }

  // Địa chỉ Canvas của trường từ cấu hình máy chủ (op=config → base) → { origin, host } hoặc null
  function hostCanvas(base) {
    if (typeof base !== 'string' || !/^https?:\/\//i.test(base)) return null;
    try { var u = new URL(base); return { origin: u.origin, host: u.host }; } catch (e) { return null; }
  }
  // Trang của khoá học trên Canvas: 'quizzes' (danh sách bài kiểm tra, gồm New Quiz), 'question_banks' (ngân hàng Classic),
  // 'content_migrations' (trang Nhập Nội Dung Khóa Học — các lần nhập và vấn đề của từng lần)
  function linkCanvas(base, courseId, trang) {
    var h = hostCanvas(base);
    if (!h || !/^\d{1,20}$/.test(String(courseId)) || !/^(quizzes|question_banks|content_migrations)$/.test(trang)) return '';
    return h.origin + '/courses/' + courseId + '/' + trang;
  }

  var LOI_DANG_NHAP = {
    state: 'Phiên đăng nhập không khớp (có thể do mở nhiều tab) — hãy đăng nhập lại.',
    tu_choi: 'Thầy cô đã từ chối cấp quyền cho ứng dụng trên Canvas.',
    thieu_ma: 'Canvas không trả về mã đăng nhập — hãy thử lại.',
    doi_ma: 'Không đổi được mã đăng nhập lấy quyền truy cập — báo quản trị kiểm tra Developer Key.',
    key: 'Canvas không nhận Developer Key (sai Client ID hoặc key đang tắt) — báo quản trị kiểm tra.',
    thieu_scope: 'Developer Key trên Canvas chưa bật đủ quyền (scope) — báo quản trị Canvas tích thêm trong Developer Keys.',
    canvas: 'Canvas báo lỗi khi đăng nhập — hãy thử lại sau.'
  };

  // Thông báo lỗi đăng nhập; thiếu scope thì nêu đúng scope (dạng "GET /api/v1/…") để quản trị tích thêm
  function loiDangNhap(ma, thieu) {
    var msg = LOI_DANG_NHAP[ma] || 'Đăng nhập Canvas không thành công.';
    if (ma !== 'thieu_scope' || !thieu) return msg;
    var ds = String(thieu).split(/\s+/).filter(function (s) { return /^url:(GET|POST|PUT|DELETE)\|\/api\/v1\/[A-Za-z0-9_:\/]+$/.test(s); })
      .map(function (s) { return s.slice(4).replace('|', ' '); });
    return ds.length ? 'Developer Key trên Canvas chưa bật ' + ds.length + ' scope — báo quản trị Canvas tích thêm: ' + ds.join(' · ') : msg;
  }

  var thuan = {
    LOAI_TEN: LOAI_TEN, LOAI_CANVAS: LOAI_CANVAS, MUC_TEN: MUC_TEN, NGUON_TEN: NGUON_TEN, LOI_DANG_NHAP: LOI_DANG_NHAP, loiDangNhap: loiDangNhap,
    fmtSo: fmtSo, docDiem: docDiem, kieuAnh: kieuAnh, laZip: laZip, phanLoaiFile: phanLoaiFile, phanLoaiZip: phanLoaiZip,
    tachGoi: tachGoi, duoiMsg: duoiMsg, anhTrongHtml: anhTrongHtml, vanDeAnh: vanDeAnh, vanDeCau: vanDeCau, demMuc: demMuc,
    taoMuc: taoMuc, vdCua: vdCua, coLoi: coLoi, duocXuat: duocXuat, tomTatMuc: tomTatMuc,
    banksDeXuat: banksDeXuat, locVanDeXuat: locVanDeXuat, cacBuocNhap: cacBuocNhap,
    chonDeChoKey: chonDeChoKey, apDapAnChoMuc: apDapAnChoMuc, urlNguyHiem: urlNguyHiem, thuocTinhNguyHiem: thuocTinhNguyHiem,
    THE_CAM: THE_CAM, linkCanvas: linkCanvas, hostCanvas: hostCanvas
  };

  if (laNode || typeof document === 'undefined') return thuan;

  /* ===================== Giao diện (trình duyệt) ===================== */

  var NH = root.NH || {};
  var doc = document;
  var $ = function (id) { return doc.getElementById(id); };

  var IC = {
    loi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    okTron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14l-3-3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    tai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    goi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7.6L12 12.5l8.7-4.9M12 22V12.5"/></svg>',
    ngoai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></svg>',
    anh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    canvas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>'
  };
  var IC_MUC = { error: 'loi', warn: 'warn', info: 'info' };
  var TEN_MUC = { error: 'Lỗi', warn: 'Cảnh báo', info: 'Ghi chú' };

  // h('div', {class:'x', text:'…'}, con…) — dựng phần tử, văn bản luôn qua textContent
  function h(tag, a) {
    var el = doc.createElement(tag);
    if (a) {
      for (var k in a) {
        if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
        var v = a[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;            // CHỈ dùng cho chuỗi tĩnh của ứng dụng
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (var i = 2; i < arguments.length; i++) them(el, arguments[i]);
    return el;
  }
  function them(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { them(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : doc.createTextNode(String(c)));
  }
  function icon(ten, cls) { return h('span', { class: 'icon' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', html: IC[ten] || '' }); }
  function rong(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function coKichThuoc(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return fmtSo(Math.round(n / 102.4) / 10) + ' KB';
    return fmtSo(Math.round(n / 104857.6) / 10) + ' MB';
  }

  /* ---------- trạng thái ---------- */

  var KHOA_TUY_CHON = 'nh-qti-tuy-chon';
  var KHOA_DICH_GUI = 'nh-canvas-dich';
  var S = {
    nguon: [],          // {id, name, size, kind, bytes, trangThai:'cho'|'dang'|'xong'|'loi', issues, soAnh, boQua}
    muc: [],            // mục ngân hàng (taoMuc) + .nguonId, .viTri, .anhUrl
    anhKem: {},         // ảnh kèm file Excel: đường dẫn → Uint8Array
    dangChon: null,     // key ngân hàng đang xem
    loc: 'all',
    opts: docTuyChon(),
    daXuat: false,
    thayDoi: false,
    demNguon: 0,
    demLo: 0,
    hangDoi: Promise.resolve(),
    cv: { cfg: null, user: null, khoaHoc: [], dangGui: false, ctrl: null, dich: docDichGui() }
  };

  // Đích gửi thẳng: 'classic' (Question Bank – Classic, mặc định) | 'newquiz' (chuyển sang New Quizzes khi nhập)
  function docDichGui() {
    try { return root.localStorage.getItem(KHOA_DICH_GUI) === 'newquiz' ? 'newquiz' : 'classic'; } catch (e) { return 'classic'; }
  }
  function luuDichGui() { try { root.localStorage.setItem(KHOA_DICH_GUI, S.cv.dich); } catch (e) { /* bỏ qua */ } }

  function docTuyChon() {
    var md = { target: 'itembank', tfMode: 'dropdowns', stimulus: 'each', math: 'mathml', includeFeedback: true };
    try {
      var o = JSON.parse(root.localStorage.getItem(KHOA_TUY_CHON) || '{}');
      if (o && typeof o === 'object') {
        if (o.target === 'classic' || o.target === 'itembank') md.target = o.target;
        if (o.tfMode === 'split' || o.tfMode === 'dropdowns') md.tfMode = o.tfMode;
        if (o.stimulus === 'none' || o.stimulus === 'each') md.stimulus = o.stimulus;
        if (o.math === 'image' || o.math === 'mathml') md.math = o.math;
        if (typeof o.includeFeedback === 'boolean') md.includeFeedback = o.includeFeedback;
      }
    } catch (e) { /* không có localStorage → dùng mặc định */ }
    return md;
  }
  function luuTuyChon() { try { root.localStorage.setItem(KHOA_TUY_CHON, JSON.stringify(S.opts)); } catch (e) { /* bỏ qua */ } }

  function mucTheoKey(k) { for (var i = 0; i < S.muc.length; i++) if (S.muc[i].key === k) return S.muc[i]; return null; }
  function mucDangChon() { return mucTheoKey(S.dangChon) || S.muc[0] || null; }

  /* ---------- thông báo nổi ---------- */

  function thongBao(msg, kieu) {
    var vung = $('vung-thong-bao');
    // cùng nội dung đang hiện → chỉ gia hạn; tối đa 3 thông báo cùng lúc
    var cu = Array.prototype.filter.call(vung.children, function (x) { return x.getAttribute('data-msg') === msg; })[0];
    if (cu) vung.removeChild(cu);
    while (vung.children.length >= 3) vung.removeChild(vung.firstElementChild);
    var el = h('div', { class: 'toast' + (kieu === 'loi' ? ' t-loi' : kieu === 'ok' ? ' t-ok' : ''), 'data-msg': msg },
      icon(kieu === 'loi' ? 'loi' : kieu === 'ok' ? 'okTron' : 'info'), h('span', { text: msg }));
    vung.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, kieu === 'loi' ? (msg.length > 140 ? 30000 : 9000) : 5000);
  }

  /* ---------- làm sạch HTML trước khi hiện (nội dung đã qua bộ đọc; đây là lớp bảo vệ thứ hai) ---------- */

  function lamSach(goc) {
    var ds = goc.querySelectorAll('*');
    for (var i = 0; i < ds.length; i++) {
      var el = ds[i], ten = String(el.localName || '').toLowerCase();
      if (THE_CAM[ten]) { if (el.parentNode) el.parentNode.removeChild(el); continue; }
      for (var j = el.attributes.length - 1; j >= 0; j--) {
        var at = el.attributes[j];
        if (thuocTinhNguyHiem(at.name, at.value)) el.removeAttribute(at.name);
      }
      if (ten === 'a') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
    }
  }

  function urlAnh(entry, ten) {
    if (!entry.anhUrl) entry.anhUrl = {};
    if (entry.anhUrl[ten]) return entry.anhUrl[ten];
    var u8 = entry.bank.images && entry.bank.images[ten];
    if (!u8) return '';
    var k = kieuAnh(u8);
    var url = URL.createObjectURL(new Blob([u8], { type: k === 'jpg' ? 'image/jpeg' : 'image/' + (k || 'png') }));
    entry.anhUrl[ten] = url;
    return url;
  }
  function giaiPhongAnh(entry) {
    if (!entry || !entry.anhUrl) return;
    Object.keys(entry.anhUrl).forEach(function (k) { try { URL.revokeObjectURL(entry.anhUrl[k]); } catch (e) { /* bỏ qua */ } });
    entry.anhUrl = {};
  }

  // HTML câu hỏi → DocumentFragment an toàn, ảnh images/<tên> → object URL
  function noiDung(entry, html) {
    var t = doc.createElement('template');
    t.innerHTML = String(html == null ? '' : html);
    lamSach(t.content);
    var imgs = t.content.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i], src = (img.getAttribute('src') || '').trim(), m = /^images\/(.+)$/.exec(src);
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      if (m) {
        var ten = giaiMaTen(m[1]), u = urlAnh(entry, ten);
        if (u) { img.setAttribute('src', u); continue; }
        img.parentNode.replaceChild(h('span', { class: 'img-missing' }, icon('anh'), 'Thiếu ảnh: ' + ten), img);
      } else if (/^https?:\/\//i.test(src)) {
        img.setAttribute('referrerpolicy', 'no-referrer');
      } else if (!/^data:image\//i.test(src)) {
        img.parentNode.replaceChild(h('span', { class: 'img-missing' }, icon('anh'), 'Ảnh không đọc được' + (src ? ': ' + src.slice(0, 60) : '')), img);
      }
    }
    return doc.importNode(t.content, true);
  }

  // Thay [b1] trong nội dung bằng ô điền / ô chọn hiện đáp án
  function thayO(frag, q) {
    var map = {};
    (Array.isArray(q.blanks) ? q.blanks : []).forEach(function (b) { if (b && b.id) map[b.id] = { b: b }; });
    (Array.isArray(q.dropdowns) ? q.dropdowns : []).forEach(function (d) { if (d && d.id) map[d.id] = { d: d }; });
    if (!Object.keys(map).length) return;
    var walker = doc.createTreeWalker(frag, 4 /* SHOW_TEXT */), nodes = [], n;
    while ((n = walker.nextNode())) if (/\[[a-z][a-z0-9_]{0,15}\]/.test(n.nodeValue)) nodes.push(n);
    nodes.forEach(function (tn) {
      var s = tn.nodeValue, re = /\[([a-z][a-z0-9_]{0,15})\]/g, m, cuoi = 0, f = doc.createDocumentFragment(), doi = false;
      while ((m = re.exec(s))) {
        var o = map[m[1]];
        if (!o) continue;
        doi = true;
        if (m.index > cuoi) f.appendChild(doc.createTextNode(s.slice(cuoi, m.index)));
        f.appendChild(o.b ? chipDien(o.b) : chipChon(o.d));
        cuoi = m.index + m[0].length;
      }
      if (!doi) return;
      if (cuoi < s.length) f.appendChild(doc.createTextNode(s.slice(cuoi)));
      tn.parentNode.replaceChild(f, tn);
    });
  }
  function chipDien(b) {
    var acc = (Array.isArray(b.accepts) ? b.accepts : []).filter(function (x) { return x != null && String(x).trim() !== ''; });
    var bien = acc.length ? core.answerVariants(acc) : [];
    var el = h('span', { class: 'blank-chip', title: 'Ô điền ' + b.id + ' — chấp nhận: ' + (bien.join(' | ') || '(chưa có)') },
      h('span', { class: 'bid', 'aria-hidden': 'true', text: b.id }), h('span', { class: 'sr-only', text: 'Ô điền, đáp án: ' }));
    if (!acc.length) them(el, h('span', { text: '(chưa có đáp án)' }));
    acc.forEach(function (a, i) {
      if (i) them(el, h('span', { class: 'sep', 'aria-hidden': 'true', text: '|' }), h('span', { class: 'sr-only', text: ' hoặc ' }));
      them(el, h('span', { text: String(a) }));
    });
    return el;
  }
  function chipChon(d) {
    var ops = Array.isArray(d.options) ? d.options : [];
    var el = h('span', { class: 'dd-chip', title: 'Ô chọn ' + d.id + ' — đáp án đúng: ' + (ops[d.correct] != null ? ops[d.correct] : '?') },
      h('span', { class: 'bid', 'aria-hidden': 'true', text: d.id }), h('span', { class: 'caret', 'aria-hidden': 'true', text: '▾' }),
      h('span', { class: 'sr-only', text: 'Ô chọn, các lựa chọn: ' }));
    ops.forEach(function (o, i) {
      if (i) them(el, h('span', { class: 'sep', 'aria-hidden': 'true', text: '/' }));
      them(el, i === d.correct ? h('span', { class: 'ok' }, String(o), h('span', { class: 'sr-only', text: ' (đúng)' })) : h('span', { text: String(o) }));
    });
    return el;
  }

  /* ---------- vẽ một câu ---------- */

  function dsVanDe(issues) {
    if (!issues.length) return null;
    return h('ul', { class: 'issues' }, issues.map(function (i) {
      return h('li', { class: 'i-' + (i.level || 'info') }, icon(IC_MUC[i.level] || 'info'),
        h('span', null, h('span', { class: 'sr-only', text: (TEN_MUC[i.level] || '') + ': ' }), String(i.msg)));
    }));
  }

  function theCau(entry, q, idx, stimTruoc) {
    var vd = vdCua(entry, q), d = demMuc(vd), loi = d.error > 0;
    var chon = duocXuat(entry, q);
    var idBase = 'c-' + entry.key + '-' + idx;
    var card = h('article', {
      class: 'q-card ' + (loi ? 'is-loi' : d.warn ? 'is-warn' : 'is-ok') + (chon ? '' : ' is-off'),
      'data-idx': idx, 'data-loi': loi ? '1' : '0', 'data-warn': d.warn ? '1' : '0', 'aria-labelledby': idBase + '-t'
    });

    // đầu thẻ
    var cb = h('input', { type: 'checkbox', id: idBase + '-x', 'data-act': 'chon', checked: chon, disabled: loi,
      'aria-describedby': loi ? idBase + '-f' : null });
    var tenCau = q.title || ('Câu ' + (q.no || idx + 1));
    var badges = h('span', { class: 'q-badges' },
      h('span', { class: 'badge b-type', title: 'Trên Canvas: ' + (LOAI_CANVAS[q.type] || q.type), text: LOAI_TEN[q.type] || q.type || '?' }),
      q.meta && q.meta.level ? h('span', { class: 'badge b-level', title: MUC_TEN[q.meta.level] || '', text: q.meta.level }) : null,
      q.meta && q.meta.topic ? h('span', { class: 'badge', text: q.meta.topic }) : null,
      q.src && q.src.row ? h('span', { class: 'badge', title: 'Vị trí trong file Excel', text: 'Dòng ' + q.src.row + (q.src.sheet ? ' · ' + q.src.sheet : '') }) : null);
    var laText = q.type === 'text';
    var pts = h('input', { class: 'input', type: 'text', inputmode: 'decimal', id: idBase + '-d', 'data-act': 'diem',
      value: laText ? '0' : fmtSo(typeof q.points === 'number' ? q.points : NaN), disabled: laText, autocomplete: 'off',
      'aria-label': 'Điểm của ' + tenCau });
    var head = h('div', { class: 'q-head' },
      h('label', { class: 'q-include', for: idBase + '-x' }, cb, h('span', { class: 'sr-only', text: 'Xuất ' + tenCau })),
      h('span', { class: 'q-title', id: idBase + '-t', text: tenCau }),
      badges,
      h('span', { class: 'spacer' }),
      loi ? h('span', { class: 'q-flag', id: idBase + '-f' }, icon('loi'), 'Có lỗi — không xuất') : null,
      h('span', { class: 'q-pts' }, h('label', { for: idBase + '-d', text: 'Điểm' }), pts));
    card.appendChild(head);

    var body = h('div', { class: 'q-body' });
    if (q.meta && q.meta.part) body.appendChild(h('p', { class: 'q-part', text: q.meta.part }));

    // đoạn dẫn: mở ở câu đầu của một nhóm, đóng ở các câu sau (giống câu trước)
    if (q.stimulus && String(q.stimulus).trim()) {
      var giong = stimTruoc === q.stimulus;
      var dai = String(q.stimulus).replace(/<[^>]*>/g, '').length > 700;     // đoạn dài (bài đọc) → đóng sẵn
      body.appendChild(h('details', { class: 'fold stim', open: giong || dai ? null : true },
        h('summary', null, 'Đoạn dẫn', giong ? h('span', { class: 'summary-note', text: ' — giống câu trước' })
          : dai ? h('span', { class: 'summary-note', text: ' — bấm để xem' }) : null),
        h('div', { class: 'fold-body q-content' }, noiDung(entry, q.stimulus))));
    }

    var stem = h('div', { class: 'q-content' });
    var fr = noiDung(entry, q.stem);
    if (q.type === 'blanks' || q.type === 'dropdowns') thayO(fr, q);
    stem.appendChild(fr);
    body.appendChild(stem);
    body.appendChild(phanDapAn(entry, q));

    if (q.feedback && String(q.feedback).trim()) {
      body.appendChild(h('details', { class: 'fold fb' },
        h('summary', null, q.type === 'essay' ? 'Hướng dẫn chấm' : 'Lời giải'),
        h('div', { class: 'fold-body q-content' }, noiDung(entry, q.feedback))));
    }
    var dsvd = dsVanDe(vd);
    if (dsvd) body.appendChild(dsvd);
    card.appendChild(body);
    return card;
  }

  function phanDapAn(entry, q) {
    var f = doc.createDocumentFragment(), t = q.type;
    if (t === 'mc' || t === 'ma') {
      var ch = Array.isArray(q.choices) ? q.choices : [];
      if (t === 'ma') f.appendChild(h('p', { class: 'ans-title', text: 'Chọn nhiều đáp án' }));
      f.appendChild(h('ol', { class: 'choices', 'aria-label': 'Các phương án' }, ch.map(function (c, i) {
        if (!c) return null;
        var dung = c.correct === true;
        return h('li', { class: 'choice' + (dung ? ' is-correct' : '') + (t === 'ma' ? ' multi' : '') },
          h('span', { class: 'choice-label', 'aria-hidden': 'true', text: c.id != null ? c.id : String.fromCharCode(65 + i) }),
          h('div', { class: 'choice-body q-content' }, h('span', { class: 'sr-only', text: 'Phương án ' + (c.id || i + 1) + ': ' }), noiDung(entry, c.html)),
          dung ? h('span', { class: 'choice-mark' }, icon('ok'), 'Đáp án đúng') : null);
      })));
    } else if (t === 'tf') {
      var st = Array.isArray(q.statements) ? q.statements : [];
      f.appendChild(h('ul', { class: 'tf-list', 'aria-label': 'Các ý Đúng/Sai' }, st.map(function (s) {
        if (!s) return null;
        var v = s.value;
        return h('li', { class: 'tf-item' + (v === true ? ' v-dung' : '') },
          h('span', { class: 'tf-key', text: (s.key != null ? s.key : '?') + ')' }),
          h('div', { class: 'q-content' }, noiDung(entry, s.html)),
          v === true ? h('span', { class: 'badge b-dung', text: 'Đúng' }) : v === false ? h('span', { class: 'badge b-sai', text: 'Sai' })
            : h('span', { class: 'badge b-chua', text: 'Chưa rõ' }));
      })));
    } else if (t === 'short') {
      var goc = (Array.isArray(q.answers) ? q.answers : []).filter(function (a) { return a != null && String(a).trim() !== ''; });
      var bien = goc.length ? core.answerVariants(goc) : [];
      var thuong = {};
      goc.forEach(function (a) { thuong[core.nfc(String(a)).replace(/\s+/g, ' ').trim().toLowerCase()] = 1; });
      f.appendChild(h('p', { class: 'ans-title', text: 'Cách viết được chấp nhận' }));
      f.appendChild(h('div', { class: 'accept' }, bien.length ? bien.map(function (a) {
        var tu = !thuong[String(a).replace(/\s+/g, ' ').trim().toLowerCase()];
        return h('span', { class: 'acc' + (tu ? ' auto' : ''), title: tu ? 'Tự thêm (dấu phẩy/chấm thập phân, dấu trừ…)' : null, text: a });
      }) : h('span', { class: 'muted', text: '(chưa có đáp án)' })));
      if (bien.length > goc.length) f.appendChild(h('p', { class: 'hint', style: 'margin-top:6px', text: 'Khung nét đứt: cách viết tự thêm. Canvas không phân biệt chữ hoa/thường.' }));
    } else if (t === 'num') {
      var nu = q.numeric || {};
      var noi;
      if (nu.exact !== undefined) {
        var m = typeof nu.margin === 'number' && nu.margin > 0 ? nu.margin : 0;
        noi = [h('span', { text: '= ' + fmtSo(nu.exact) + (m ? ' ± ' + fmtSo(m) : '') }),
          m ? h('span', { class: 'muted', text: '(chấp nhận từ ' + fmtSo(nu.exact - m) + ' đến ' + fmtSo(nu.exact + m) + ')' }) : h('span', { class: 'muted', text: '(đúng chính xác)' })];
      } else if (nu.min !== undefined || nu.max !== undefined) {
        noi = [h('span', { text: 'Từ ' + fmtSo(nu.min) + ' đến ' + fmtSo(nu.max) })];
      } else noi = [h('span', { text: '(chưa có đáp án)' })];
      f.appendChild(h('p', { class: 'ans-title', text: 'Đáp án số' }));
      f.appendChild(h('div', { class: 'num-ans' }, noi));
      f.appendChild(h('p', { class: 'hint', style: 'margin-top:6px', text: 'Học sinh gõ số thập phân bằng dấu chấm (vd 12.5) — Canvas hiểu "12,5" là 125.' }));
    } else if (t === 'blanks' || t === 'dropdowns') {
      f.appendChild(h('p', { class: 'hint', style: 'margin-top:8px', text: t === 'blanks'
        ? 'Khung xanh trong câu là ô điền, ghi các cách viết được chấp nhận (Canvas không phân biệt hoa/thường).'
        : 'Khung trong câu là ô chọn; lựa chọn đúng được gạch chân màu xanh.' }));
    } else if (t === 'matching') {
      var pairs = Array.isArray(q.pairs) ? q.pairs : [];
      f.appendChild(h('table', { class: 'match-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Vế trái' }), h('th', { scope: 'col' }, h('span', { class: 'sr-only', text: 'ghép với' })), h('th', { scope: 'col', text: 'Vế phải đúng' }))),
        h('tbody', null, pairs.map(function (p) {
          if (!p) return null;
          return h('tr', null, h('td', { class: 'q-content' }, noiDung(entry, p.left)), h('td', { class: 'arrow', 'aria-hidden': 'true', text: '→' }), h('td', { class: 'right', text: p.right == null ? '' : String(p.right) }));
        }))));
      var nh = Array.isArray(q.distractors) ? q.distractors.filter(function (x) { return x != null && String(x).trim(); }) : [];
      if (nh.length) {
        f.appendChild(h('p', { class: 'ans-title', text: 'Vế phải gây nhiễu' }));
        f.appendChild(h('div', { class: 'accept' }, nh.map(function (x) { return h('span', { class: 'acc auto', text: String(x) }); })));
      }
    } else if (t === 'essay') {
      f.appendChild(h('div', { class: 'manual' }, icon('info'), 'Tự luận — học sinh viết câu trả lời, giáo viên chấm tay trên Canvas.'));
    } else if (t === 'text') {
      f.appendChild(h('div', { class: 'manual' }, icon('info'), 'Đoạn thông tin — không tính điểm, học sinh không cần trả lời.'));
    }
    return f;
  }

  /* ---------- vẽ danh sách file ---------- */

  function veFile() {
    var box = rong($('ds-file'));
    S.nguon.forEach(function (ng) {
      if (ng.laKey) { box.appendChild(dongKey(ng)); return; }
      var mucs = S.muc.filter(function (e) { return e.nguonId === ng.id; });
      var soCau = mucs.reduce(function (s, e) { return s + (e.bank.questions || []).length; }, 0);
      var kc = { docx: 'k-docx', xlsx: 'k-xlsx', scorm: 'k-scorm', image: 'k-img', images: 'k-img', goi: 'k-img' }[ng.kind] || 'k-unknown';
      var nhan = { docx: 'W', xlsx: 'X', scorm: 'S', image: 'Ảnh', images: 'Ảnh', goi: 'Zip' }[ng.kind] || '?';
      var meta = h('div', { class: 'file-meta' }, h('span', { text: (NGUON_TEN[ng.kind] || 'Đang nhận dạng') + ' · ' + coKichThuoc(ng.size) }));
      if (ng.trangThai === 'dang' || ng.trangThai === 'cho') meta.appendChild(h('span', null, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Đang đọc…'));
      else if (ng.trangThai === 'loi') meta.appendChild(h('span', { class: 'status-loi', text: 'Không đọc được' }));
      else if (ng.kind === 'image' || ng.kind === 'images' || ng.kind === 'goi') {
        var co = S.muc.some(function (e) { return e.bank.source && e.bank.source.kind === 'xlsx'; });
        meta.appendChild(h('span', { class: 'status-ok', text: (ng.soAnh || 0) + ' ảnh' + (ng.soCon ? ' · ' + ng.soCon + ' file bên trong' : '') }));
        if (ng.soAnh) meta.appendChild(h('span', { text: co ? 'dùng cho file Excel' : 'sẽ dùng cho file Excel nạp sau' }));
      } else {
        meta.appendChild(h('span', { class: 'status-ok', text: mucs.length + ' ngân hàng · ' + soCau + ' câu' }));
      }
      var row = h('div', { class: 'file-row' },
        h('span', { class: 'file-ic ' + kc, 'aria-hidden': 'true', text: nhan }),
        h('div', null, h('div', { class: 'file-name', text: ng.name }), meta),
        h('div', { class: 'file-act' }, h('button', { type: 'button', class: 'btn btn-sm btn-danger-ghost', 'data-bo-nguon': ng.id,
          'aria-label': 'Bỏ file ' + ng.name, disabled: ng.trangThai === 'dang' || ng.trangThai === 'cho' }, icon('x'), 'Bỏ')));
      // file đề có tên kiểu "…HDC…/…KEY…/Đáp án…" (không phải "…chưa đáp án…") nhưng đọc ra câu hỏi → cho giáo viên
      // chuyển thành file đáp án (vd hướng dẫn chấm chỉ có lời giải tự luận, bộ đọc không tự nhận ra)
      if (ng.kind === 'docx' && ng.trangThai === 'xong' && ng.bytes && NH.docx && NH.docx.isAnswerKeyName && NH.docx.isAnswerKeyName(ng.name) &&
          !/(chua|khong)[\s._-]*(co[\s._-]*)?dap[\s._-]*an/.test(core.slugAscii(ng.name).replace(/_/g, ' '))) {
        row.lastChild.appendChild(h('button', { type: 'button', class: 'btn btn-sm btn-outline', 'data-lam-key': ng.id,
          title: 'Đọc file này như file đáp án / hướng dẫn chấm rồi điền vào file đề' }, 'Đây là file đáp án'));
      }
      var vd = (ng.issues || []).slice();
      (ng.tuKey || []).forEach(function (k) { vd.push(core.newIssue('info', 'Đáp án từ "' + k.ten + '": ' + tomTatKey(k.r))); });
      (ng.boQua || []).slice(0, 8).forEach(function (b) { vd.push(core.newIssue('info', 'Bỏ qua ' + b.path + ': ' + b.lyDo)); });
      if ((ng.boQua || []).length > 8) vd.push(core.newIssue('info', '… và ' + (ng.boQua.length - 8) + ' file khác bị bỏ qua'));
      var ds = dsVanDe(vd);
      if (ds) row.appendChild(ds);
      box.appendChild(row);
    });
  }

  function tomTatKey(r) {
    if (!r) return '';
    var t = 'khớp ' + r.matched + ' câu — điền ' + r.filled + ', trùng ' + r.same + ', khác đề ' + r.conflicts;
    if (r.mismatched) t += ', không khớp phương án ' + r.mismatched;
    return t;
  }

  // File đề có thể nhận đáp án: Word/Excel/SCORM đã đọc xong, không phải file đáp án
  function dsDeChoKey(caDangDoc) {
    return S.nguon.filter(function (n) {
      return !n.laKey && /^(docx|xlsx|scorm)$/.test(n.kind) && (caDangDoc ? n.trangThai !== 'loi' : n.trangThai === 'xong');
    });
  }

  // Dòng của file đáp án: số đáp án đọc được, chọn file đề để điền, kết quả điền
  function dongKey(ng) {
    var dang = ng.trangThai === 'dang' || ng.trangThai === 'cho';
    var meta = h('div', { class: 'file-meta' }, h('span', { text: 'File đáp án · ' + coKichThuoc(ng.size) }));
    if (dang) meta.appendChild(h('span', null, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Đang điền đáp án…'));
    else meta.appendChild(h('span', { class: 'status-ok', text: ((ng.key && ng.key.count) || 0) + ' đáp án' }));
    var row = h('div', { class: 'file-row is-key' },
      h('span', { class: 'file-ic k-key', 'aria-hidden': 'true', text: 'ĐA' }),
      h('div', null, h('div', { class: 'file-name', text: ng.name }), meta),
      h('div', { class: 'file-act' }, h('button', { type: 'button', class: 'btn btn-sm btn-danger-ghost', 'data-bo-nguon': ng.id,
        'aria-label': 'Bỏ file ' + ng.name, disabled: dang }, icon('x'), 'Bỏ')));
    var de = dsDeChoKey(false), idSel = 'key-dich-' + ng.id;
    var sel = h('select', { class: 'select', id: idSel, 'data-key-dich': ng.id, disabled: dang || !de.length },
      h('option', { value: '', text: de.length ? '— Không điền vào đề nào —' : 'Chưa có file đề — hãy nạp file đề' }),
      de.map(function (d) { return h('option', { value: d.id, text: d.name }); }));
    sel.value = ng.dich && de.some(function (d) { return d.id === ng.dich; }) ? ng.dich : '';
    row.appendChild(h('div', { class: 'key-pick' }, h('label', { for: idSel, text: 'Điền đáp án vào file đề' }), sel));
    var vd = (ng.issues || []).slice();
    if (ng.ketQua) {
      vd.unshift(core.newIssue(ng.ketQua.r.matched ? 'info' : 'warn', 'Đã áp vào "' + ng.ketQua.deTen + '": ' + tomTatKey(ng.ketQua.r) +
        (ng.ketQua.r.conflicts ? ' — câu khác đề giữ đáp án trong đề, có cảnh báo ở bước 2' : '')));
      vd = vd.concat((ng.ketQua.r.issues || []).filter(function (i) { return i.level !== 'info'; }));
    } else if (!dang && de.length && !ng.dich) {
      vd.unshift(core.newIssue('warn', ng.dich === '' ? 'Chưa điền vào file đề nào.' : 'Chưa tự ghép được với file đề (tên file khác nhau) — chọn file đề ở ô trên.'));
    }
    var ds = dsVanDe(vd);
    if (ds) row.appendChild(ds);
    return row;
  }

  /* ---------- vẽ bước 2 ---------- */

  function veSoat() {
    var co = S.muc.length > 0;
    $('soat-trong').hidden = co;
    $('soat-noi-dung').hidden = !co;
    if (!co) { rong($('ds-cau')); return; }
    var e = mucDangChon();
    S.dangChon = e.key;
    veTab();
    veNganHang(e);
  }

  function veTab() {
    var box = rong($('the-ngan-hang'));
    box.hidden = S.muc.length < 2;
    S.muc.forEach(function (e) {
      var t = tomTatMuc(e), sel = e.key === S.dangChon, src = e.bank.source || {};
      var trung = trungTen(e);
      box.appendChild(h('button', {
        type: 'button', role: 'tab', class: 'bank-tab', id: 'tab-' + e.key, 'data-key': e.key,
        'aria-selected': sel ? 'true' : 'false', 'aria-controls': 'khung-ngan-hang', tabindex: sel ? '0' : '-1',
        title: e.bank.title + ' — ' + (NGUON_TEN[src.kind] || '') + ' ' + (src.name || '')
      }, t.loi ? h('span', { class: 'dot-loi', title: t.loi + ' câu lỗi' }, h('span', { class: 'sr-only', text: t.loi + ' câu lỗi' })) : null,
      h('span', { class: 't', text: e.bank.title || '(chưa có tên)' }),
      trung ? h('span', { class: 'badge', text: NGUON_TEN[src.kind] || '?' }) : null,
      h('span', { class: 'cnt', text: String(t.tong) })));
    });
    // cuộn ngang để thẻ đang chọn luôn nhìn thấy (không cuộn cả trang)
    var tabChon = $('tab-' + S.dangChon);
    if (tabChon && box.scrollWidth > box.clientWidth) {
      var l = tabChon.offsetLeft, r = l + tabChon.offsetWidth;
      if (l < box.scrollLeft || r > box.scrollLeft + box.clientWidth) box.scrollLeft = Math.max(0, l - 24);
    }
    var khung = $('khung-ngan-hang');
    khung.setAttribute('role', S.muc.length > 1 ? 'tabpanel' : 'region');
    khung.setAttribute('aria-labelledby', S.muc.length > 1 ? 'tab-' + S.dangChon : 'h-soat');
  }

  function veNganHang(e) {
    var o = $('ten-ngan-hang');
    if (doc.activeElement !== o) o.value = e.bank.title || '';
    var src = e.bank.source || {};
    var nguon = rong($('nguon-ngan-hang'));
    nguon.appendChild(h('span', { text: 'Nguồn: ' + (NGUON_TEN[src.kind] || src.kind || '?') + ' · ' + (src.name || '') }));
    nguon.appendChild(h('span', { title: 'Mã ngân hàng — giữ nguyên tên thì nhập lại sẽ ghi đè đúng ngân hàng cũ', text: 'Mã: ' + e.bank.ident }));
    if (e.bank.scorm && e.bank.scorm.variant) nguon.appendChild(h('span', { text: 'Mẫu SCORM: ' + e.bank.scorm.variant }));
    veTomTat(e);
    var cb = rong($('canh-bao-ngan-hang'));
    veTrungTen(e);
    var w = Array.isArray(e.bank.warnings) ? e.bank.warnings : [];
    if (w.length) cb.appendChild(h('div', { class: 'notice n-warn' }, icon('warn'), h('div', null, h('b', { text: 'Ghi chú của ngân hàng' }), dsVanDe(w))));
    // các câu
    var list = rong($('ds-cau'));
    var qs = Array.isArray(e.bank.questions) ? e.bank.questions : [];
    var frag = doc.createDocumentFragment(), stim = null;
    qs.forEach(function (q, i) {
      if (!q) return;
      frag.appendChild(theCau(e, q, i, stim));
      stim = q.stimulus && String(q.stimulus).trim() ? q.stimulus : null;
    });
    list.appendChild(frag);
    apLoc();
  }

  // Hai ngân hàng cùng tên → cùng mã: trên Canvas dễ lẫn / ghi đè nhau
  function trungTen(e) {
    var t = String(e.bank.title || '').trim().toLowerCase();
    return S.muc.some(function (x) { return x !== e && String(x.bank.title || '').trim().toLowerCase() === t; });
  }
  function veTrungTen(e) {
    var cu = $('trung-ten');
    if (cu) cu.remove();
    if (!trungTen(e)) return;
    $('canh-bao-ngan-hang').insertBefore(h('div', { class: 'notice n-warn', id: 'trung-ten' }, icon('warn'),
      h('div', { text: 'Có ngân hàng khác cùng tên "' + e.bank.title + '". Hãy đổi tên một trong hai ở ô "Tên ngân hàng trên Canvas" để không bị lẫn (và không ghi đè nhau khi nhập lại).' })),
    $('canh-bao-ngan-hang').firstChild);
  }

  function veTomTat(e) {
    var t = tomTatMuc(e);
    var box = rong($('tom-tat'));
    box.appendChild(h('span', { class: 'chip' }, h('b', { text: String(t.tong) }), ' câu'));
    Object.keys(LOAI_TEN).forEach(function (k) {
      if (t.theoLoai[k]) box.appendChild(h('span', { class: 'chip', title: 'Trên Canvas: ' + LOAI_CANVAS[k] }, LOAI_TEN[k] + ': ', h('b', { text: String(t.theoLoai[k]) })));
    });
    box.appendChild(h('span', { class: 'chip c-gold' }, 'Tổng điểm: ', h('b', { text: fmtSo(t.diem) })));
    box.appendChild(h('span', { class: 'chip c-ok' }, 'Sẽ xuất: ', h('b', { text: t.chon + '/' + t.tong })));
    if (t.loi) box.appendChild(h('span', { class: 'chip c-loi' }, icon('loi'), 'Lỗi: ', h('b', { text: String(t.loi) }), ' câu'));
    if (t.canhBao) box.appendChild(h('span', { class: 'chip c-warn' }, icon('warn'), 'Cảnh báo: ', h('b', { text: String(t.canhBao) }), ' câu'));
    $('loc-n-all').textContent = '(' + t.tong + ')';
    $('loc-n-loi').textContent = '(' + t.loi + ')';
    $('loc-n-warn').textContent = '(' + t.canhBao + ')';
    // tab
    var tab = $('tab-' + e.key);
    if (tab) { var c = tab.querySelector('.cnt'); if (c) c.textContent = String(t.tong); }
  }

  function apLoc() {
    var cards = $('ds-cau').children, hien = 0;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], ok = S.loc === 'all' || (S.loc === 'loi' && c.getAttribute('data-loi') === '1') || (S.loc === 'warn' && c.getAttribute('data-warn') === '1');
      c.hidden = !ok;
      if (ok) hien++;
    }
    $('loc-trong').hidden = hien > 0 || !cards.length;
  }

  // cập nhật thẻ một câu sau khi đổi điểm / chọn (không vẽ lại cả danh sách để giữ vị trí con trỏ)
  function capNhatThe(e, idx) {
    var card = $('ds-cau').querySelector('.q-card[data-idx="' + idx + '"]');
    var q = e.bank.questions[idx];
    if (!card || !q) return;
    var moi = theCau(e, q, idx, idx > 0 && e.bank.questions[idx - 1] ? (e.bank.questions[idx - 1].stimulus || null) : null);
    // giữ trạng thái mở/đóng các khối thu gọn
    var cu = card.querySelectorAll('details'), mo = moi.querySelectorAll('details');
    for (var i = 0; i < cu.length && i < mo.length; i++) mo[i].open = cu[i].open;
    moi.hidden = card.hidden;
    card.parentNode.replaceChild(moi, card);
  }

  /* ---------- bước 3 ---------- */

  function veXuat() {
    var co = S.muc.length > 0;
    $('xuat-trong').hidden = co;
    $('form-xuat').hidden = !co;
    var f = $('form-xuat');
    ['target', 'tfMode', 'math', 'stimulus'].forEach(function (n) {
      var r = f.querySelectorAll('input[name="' + n + '"]');
      for (var i = 0; i < r.length; i++) {
        r[i].checked = r[i].value === S.opts[n];
        r[i].closest('.opt').classList.toggle('is-checked', r[i].checked);
      }
    });
    f.querySelector('input[name="includeFeedback"]').checked = S.opts.includeFeedback !== false;
    var box = rong($('chon-ngan-hang'));
    var tongCau = 0, tongDiem = 0, soNH = 0;
    S.muc.forEach(function (e) {
      var t = tomTatMuc(e), id = 'xnh-' + e.key, rongNH = t.chon === 0;
      if (!e.khongXuat && !rongNH) { tongCau += t.chon; tongDiem += t.diem; soNH++; }
      box.appendChild(h('label', { class: 'bank-pick-row', for: id },
        h('input', { type: 'checkbox', id: id, 'data-xuat-key': e.key, checked: !e.khongXuat && !rongNH, disabled: rongNH }),
        h('span', { class: 't', text: e.bank.title || '(chưa có tên)' }),
        h('span', { class: 'm', text: rongNH ? 'không có câu nào xuất được' : t.chon + ' câu · ' + fmtSo(t.diem) + ' điểm' })));
    });
    $('nhom-chon-ngan-hang').hidden = S.muc.length < 2;
    var goi = S.opts.target === 'classic' ? (soNH ? '1 file .zip' : '') : (soNH + ' file .zip');
    $('xuat-tom-tat').textContent = soNH ? (soNH + ' ngân hàng · ' + tongCau + ' câu · ' + fmtSo(Math.round(tongDiem * 10000) / 10000) + ' điểm → ' + goi) : 'Chưa có câu nào để xuất.';
    $('nut-xuat').disabled = !soNH;
    veCachNhap();
  }

  function veCachNhap() {
    var b = cacBuocNhap(S.opts.target);
    var box = rong($('cach-nhap'));
    box.appendChild(h('div', { class: 'howto' },
      h('div', { class: 'howto-head' }, icon('info'), h('h3', { text: 'Cách nhập: ' + b.tieuDe })),
      h('div', { class: 'howto-body' },
        goiYCanvasTruong(),
        h('ol', { class: 'steps-list' }, b.buoc.map(function (s) { return h('li', { html: s }); })),
        b.ghiChu.map(function (g) { return h('div', { class: 'notice n-info', style: 'margin:12px 0 0' }, icon('info'), h('div', { html: g })); }),
        h('p', { class: 'nho', style: 'margin:12px 0 0' }, h('a', { href: 'huong-dan.html#nhap-canvas', target: '_blank', rel: 'noopener', text: 'Xem hướng dẫn chi tiết và cách xử lý sự cố' })))));
  }

  // "Canvas của trường: 4015.instructure.com" — chỉ khi máy chủ trung gian có cấu hình CANVAS_BASE_URL
  function goiYCanvasTruong() {
    var hc = hostCanvas(S.cv.cfg && S.cv.cfg.base);
    if (!hc) return null;
    return h('p', { class: 'cv-host' }, icon('canvas'), 'Canvas của trường: ',
      h('a', { href: hc.origin, target: '_blank', rel: 'noopener noreferrer', text: hc.host }));
  }

  function taiVe(bytes, ten) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    var a = h('a', { href: url, download: ten, style: 'display:none' });
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 60000);
  }

  async function xuat(ev) {
    if (ev) ev.preventDefault();
    var qti = NH.qti;
    var banks = banksDeXuat(S.muc);
    var kq = rong($('ket-qua-xuat'));
    if (!banks.length) { thongBao('Chưa có câu nào để xuất — kiểm tra lại dấu chọn ở bước 2.', 'loi'); return; }
    var nut = $('nut-xuat');
    nut.disabled = true;
    var nhanCu = nut.innerHTML;
    nut.innerHTML = '<span class="spinner" aria-hidden="true"></span> Đang tạo gói…';
    try {
      var pk = await qti.buildPackages(banks, S.opts);
      var vd = locVanDeXuat(pk.issues || []);
      S.ketQua = { goi: pk, issues: vd, target: S.opts.target };
      S.daXuat = true;
      S.thayDoi = false;
      if (!pk.length) {
        kq.appendChild(h('div', { class: 'notice n-loi' }, icon('loi'), h('div', null, h('b', { text: 'Không tạo được gói nào.' }), dsVanDe(vd))));
        return;
      }
      veKetQua(pk, vd);
      if (pk.length === 1) taiVe(pk[0].bytes, pk[0].fileName);
      capNhatBuoc();
      thongBao(pk.length === 1 ? 'Đã tạo và tải về ' + pk[0].fileName : 'Đã tạo ' + pk.length + ' gói — bấm tải từng gói bên dưới.', 'ok');
    } catch (e) {
      kq.appendChild(h('div', { class: 'notice n-loi' }, icon('loi'), h('div', { text: 'Lỗi khi tạo gói: ' + (e && e.message || e) })));
    } finally {
      nut.disabled = false;
      nut.innerHTML = nhanCu;
    }
  }

  function veKetQua(pk, vd) {
    var kq = rong($('ket-qua-xuat'));
    var d = demMuc(vd);
    kq.appendChild(h('div', { class: 'notice n-ok' }, icon('okTron'), h('div', null,
      h('b', { text: pk.length === 1 ? 'Đã tạo gói QTI — trình duyệt đang tải về.' : 'Đã tạo ' + pk.length + ' gói QTI (mỗi ngân hàng một file).' }),
      pk.length > 1 ? h('p', { text: 'Bấm "Tải về" ở từng gói. Trình duyệt có thể hỏi cho phép tải nhiều file.' }) : null)));
    kq.appendChild(h('ul', { class: 'pkg-list' }, pk.map(function (p, i) {
      var c = p.counts || {};
      var vdGoi = locVanDeXuat(p.issues || []);
      return h('li', { class: 'pkg' },
        h('span', { class: 'zip-ic', 'aria-hidden': 'true', html: IC.goi }),
        h('div', null, h('div', { class: 'n', text: p.fileName }),
          h('div', { class: 'm', text: (p.bankTitles || []).join(' + ') + ' — ' + (c.total || 0) + ' câu' +
            (c.items && c.items !== c.total ? ' (' + c.items + ' mục trên Canvas)' : '') + ' · ' + fmtSo(c.points || 0) + ' điểm · ' + coKichThuoc(p.bytes.length) })),
        h('button', { type: 'button', class: 'btn btn-outline btn-sm', 'data-tai': i, 'aria-label': 'Tải về ' + p.fileName }, icon('tai'), 'Tải về'),
        vdGoi.length ? h('details', { class: 'fold pkg-vd', open: demMuc(vdGoi).error || demMuc(vdGoi).warn ? true : null },
          h('summary', null, tomTatVd(vdGoi)), h('div', { class: 'fold-body' }, dsVanDe(vdGoi))) : null);
    })));
    if (pk.length > 1) kq.appendChild(h('p', null, h('button', { type: 'button', class: 'btn btn-outline', 'data-tai': 'het' }, icon('tai'), 'Tải tất cả (' + pk.length + ' file)')));
    // thông báo của ngân hàng không tạo được gói (mọi câu lỗi / rỗng)
    var trongGoi = [];
    pk.forEach(function (p) { trongGoi = trongGoi.concat(p.issues || []); });
    var khac = vd.filter(function (i) { return trongGoi.indexOf(i) < 0; });
    if (khac.length) {
      kq.appendChild(h('details', { class: 'fold', open: true },
        h('summary', null, 'Ngân hàng không tạo được gói: ' + tomTatVd(khac)),
        h('div', { class: 'fold-body' }, dsVanDe(khac))));
    }
    if (d.error) kq.appendChild(h('p', { class: 'hint', text: 'Câu có lỗi khi tạo gói đã bị bỏ qua — sửa trong file rồi nạp lại nếu cần.' }));
  }

  function tomTatVd(vd) {
    var d = demMuc(vd), tom = [];
    if (d.error) tom.push(d.error + ' lỗi (câu bị bỏ qua)');
    if (d.warn) tom.push(d.warn + ' cảnh báo');
    if (d.info) tom.push(d.info + ' ghi chú');
    return tom.join(', ');
  }

  /* ---------- thanh hành động + các bước ---------- */

  function capNhatBuoc() {
    var co = S.muc.length > 0, tongChon = 0, tong = 0, loi = 0, diem = 0;
    S.muc.forEach(function (e) { var t = tomTatMuc(e); tong += t.tong; loi += t.loi; if (!e.khongXuat) { tongChon += t.chon; diem += t.diem; } });
    var nav = $('buoc-nav');
    var a = function (b) { return nav.querySelector('a[data-buoc="' + b + '"]'); };
    a('nap').classList.toggle('is-done', co);
    a('soat').classList.toggle('is-off', !co);
    a('soat').classList.toggle('is-done', co && S.daXuat);
    a('xuat').classList.toggle('is-off', !co);
    a('xuat').classList.toggle('is-done', S.daXuat);
    a('canvas').classList.toggle('is-off', !co);
    var bar = $('thanh-hanh-dong');
    bar.hidden = !co;
    if (co) {
      var tx = rong($('ab-text'));
      tx.appendChild(h('span', null, 'Sẽ xuất ', h('b', { text: tongChon + '/' + tong }), ' câu'));
      tx.appendChild(h('span', { class: 'ab-hide-sm' }, h('b', { text: fmtSo(Math.round(diem * 10000) / 10000) }), ' điểm'));
      if (loi) tx.appendChild(h('span', { class: 'ab-loi', text: loi + ' câu lỗi' }));
    }
  }

  // Ẩn thanh dưới khi đang xem bước 3/4 (đã ở chỗ nút xuất); đánh dấu bước đang xem
  function theoDoiCuon() {
    if (!('IntersectionObserver' in root)) return;
    var dangThay = {};
    var io = new IntersectionObserver(function (ds) {
      ds.forEach(function (x) { dangThay[x.target.id] = x.isIntersecting; });
      var hien = ['buoc-nap', 'buoc-soat', 'buoc-xuat', 'buoc-canvas'].filter(function (id) { return dangThay[id]; });
      var nav = $('buoc-nav');
      var map = { 'buoc-nap': 'nap', 'buoc-soat': 'soat', 'buoc-xuat': 'xuat', 'buoc-canvas': 'canvas' };
      var hienTai = hien.length ? map[hien[0]] : null;
      var as = nav.querySelectorAll('a[data-buoc]');
      for (var i = 0; i < as.length; i++) {
        var la = as[i].getAttribute('data-buoc') === hienTai;
        as[i].classList.toggle('is-current', la);
        if (la) as[i].setAttribute('aria-current', 'step'); else as[i].removeAttribute('aria-current');
      }
      $('thanh-hanh-dong').classList.toggle('is-an', !!(dangThay['buoc-xuat'] || dangThay['buoc-canvas']));
    }, { rootMargin: '-45% 0px -45% 0px' });
    ['buoc-nap', 'buoc-soat', 'buoc-xuat', 'buoc-canvas'].forEach(function (id) { if ($(id)) io.observe($(id)); });
  }

  function veLai() { veFile(); veSoat(); veXuat(); capNhatBuoc(); veCanvasNganHang(); }
  function veNhe() {     // sau khi đổi điểm / chọn: không vẽ lại danh sách câu
    var e = mucDangChon();
    if (e) { veTomTat(e); veTab(); }
    veXuat(); capNhatBuoc(); veCanvasNganHang();
    S.thayDoi = true;
  }

  /* ---------- nạp file ---------- */

  function docFile(f) {
    if (f.arrayBuffer) return f.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (ok, loi) {
      var r = new FileReader();
      r.onload = function () { ok(new Uint8Array(r.result)); };
      r.onerror = function () { loi(r.error); };
      r.readAsArrayBuffer(f);
    });
  }

  // lo = số thứ tự lần nạp (mỗi lần thả/chọn file một số; file trong zip cùng lần với zip)
  function taoNguon(name, bytes) {
    return { id: 'n' + (++S.demNguon), name: name, size: bytes ? bytes.length : 0, bytes: bytes, kind: '', trangThai: 'cho', issues: [], lo: S.demLo };
  }

  // Nạp một loạt file (mỗi phần tử {name, bytes}); xếp hàng để hai lần thả file không chen nhau
  function napFiles(ds) {
    S.hangDoi = S.hangDoi.then(function () { return napLoat(ds); }).catch(function (e) {
      thongBao('Lỗi khi nạp file: ' + (e && e.message || e), 'loi');
    });
    return S.hangDoi;
  }

  async function napLoat(ds) {
    S.demLo++;
    var moi = ds.map(function (f) { var ng = taoNguon(f.name, f.bytes); S.nguon.push(ng); return ng; });
    veFile();
    var coAnhMoi = false, soMucTruoc = S.muc.length, i;
    // 1) nhận dạng (ảnh trước, để file Excel trong cùng lần thả dùng được)
    for (i = 0; i < moi.length; i++) {
      var ng = moi[i];
      try { await nhanDang(ng, moi); } catch (e) { ng.kind = ng.kind || 'unknown'; ng.trangThai = 'loi'; ng.issues = [core.newIssue('error', 'Không mở được file: ' + (e && e.message || e))]; }
      if (ng.soAnh) coAnhMoi = true;
    }
    veFile();
    // 2) đọc đề
    for (i = 0; i < moi.length; i++) {
      if (/^(docx|xlsx|scorm)$/.test(moi[i].kind) && moi[i].trangThai !== 'loi') await phanTich(moi[i]);
    }
    // 3) ảnh mới → đọc lại các file Excel nạp trước đó
    if (coAnhMoi) {
      var cu = S.nguon.filter(function (n) { return n.kind === 'xlsx' && moi.indexOf(n) < 0 && n.trangThai === 'xong'; });
      for (i = 0; i < cu.length; i++) await phanTich(cu[i]);
      if (cu.length) thongBao('Đã đọc lại ' + cu.length + ' file Excel với ảnh vừa thêm.', 'ok');
    }
    // file chỉ nhận dạng (ảnh, lỗi) → xong
    moi.forEach(function (n) { if (n.trangThai === 'cho' || n.trangThai === 'dang') n.trangThai = n.kind === 'unknown' ? 'loi' : 'xong'; if (!/^(docx|xlsx|scorm)$/.test(n.kind)) n.bytes = null; });
    // mở ngân hàng đầu tiên vừa nạp (ngân hàng của file đọc lại vẫn giữ vị trí cũ)
    var dau = S.muc.filter(function (e) { return moi.some(function (n) { return n.id === e.nguonId; }); })[0];
    if (dau) S.dangChon = dau.key;
    else if (!mucTheoKey(S.dangChon)) S.dangChon = S.muc[0] ? S.muc[0].key : null;
    veLai();
    var tongMoi = S.muc.length - soMucTruoc;
    if (tongMoi > 0) {
      S.thayDoi = true;
      thongBao('Đã đọc ' + tongMoi + ' ngân hàng câu hỏi — xem và soát ở bước 2.', 'ok');
      if (soMucTruoc === 0) setTimeout(function () { $('buoc-soat').scrollIntoView({ block: 'start' }); }, 60);
    }
  }

  async function nhanDang(ng, hang) {
    ng.trangThai = 'dang';
    var k = phanLoaiFile(ng.name, ng.bytes);
    if (k === 'zip') {
      var files = await NH.zip.readZip(ng.bytes);
      k = phanLoaiZip(Object.keys(files));
      if (k === 'goi') {
        var g = tachGoi(files);
        var n = 0;
        Object.keys(g.anh).forEach(function (p) { S.anhKem[p] = g.anh[p]; n++; });
        ng.soAnh = n;
        ng.boQua = g.boQua;
        ng.soCon = g.con.length;
        g.con.forEach(function (c) { var con = taoNguon(c.name, c.bytes); S.nguon.push(con); hang.push(con); });
        k = n && !g.con.length ? 'images' : 'goi';
        if (!n && !g.con.length) {
          ng.trangThai = 'loi';
          ng.issues = [core.newIssue('error', 'Zip không chứa file Word/Excel/SCORM hay ảnh PNG/JPG/GIF nào.')];
        }
      } else if (k === 'qti') {
        ng.trangThai = 'loi';
        ng.issues = [core.newIssue('error', 'Đây là gói QTI (đã xuất sẵn) — nhập thẳng vào Canvas, không cần nạp ở đây.')];
      }
    } else if (k === 'image') {
      S.anhKem[ng.name] = ng.bytes;
      ng.soAnh = 1;
    } else if (k === 'image-khac') {
      ng.trangThai = 'loi';
      ng.issues = [core.newIssue('error', 'Định dạng ảnh ' + kieuAnh(ng.bytes).toUpperCase() + ' chưa hỗ trợ — lưu lại thành PNG hoặc JPG.')];
    } else if (k === 'office-cu') {
      ng.trangThai = 'loi';
      ng.issues = [core.newIssue('error', 'File Word/Excel đời cũ (.doc/.xls) hoặc có đặt mật khẩu — mở bằng Word/Excel, bỏ mật khẩu và "Lưu thành" .docx/.xlsx rồi nạp lại.')];
    } else if (k === 'pdf') {
      ng.trangThai = 'loi';
      ng.issues = [core.newIssue('error', 'Chưa đọc được PDF — hãy dùng file Word gốc của đề (soạn theo mẫu).')];
    } else {
      ng.trangThai = 'loi';
      ng.issues = [core.newIssue('error', 'Không nhận ra loại file — chỉ nhận Word .docx, Excel .xlsx, gói SCORM .zip và ảnh PNG/JPG/GIF.')];
    }
    ng.kind = k;
  }

  async function phanTich(ng) {
    ng.trangThai = 'dang';
    veFile();
    var r;
    try {
      var ten = ng.name.replace(/^.*\//, '');     // thả cả thư mục: bỏ đường dẫn, giữ tên file
      if (ng.kind === 'docx') r = await NH.docx.parseDocx(ng.bytes, { fileName: ten });
      else if (ng.kind === 'xlsx') r = await NH.xlsx.parseXlsx(ng.bytes, { fileName: ten, extraImages: S.anhKem });
      else r = await NH.scorm.parseScorm(ng.bytes, { fileName: ten, evalData: NH.scorm.makeIframeEvaluator(doc) });
    } catch (e) {
      r = { banks: [], issues: [core.newIssue('error', 'Không đọc được file: ' + (e && e.message || e))] };
    }
    ng.issues = Array.isArray(r.issues) ? r.issues : [];
    if (r.keyOnly && r.key) {
      // file chỉ có đáp án (HDC / KEY / ĐÁP ÁN): không có ngân hàng — dùng để điền đáp án cho file đề cùng tên
      ganNganHang(ng, []);
      if (!ng.laKey) { ng.laKey = true; ng.dich = undefined; }
      ng.key = r.key;
      ng.ketQua = null;
      ng.trangThai = 'xong';
      boKeyKhoiDe(ng.id);
      ghepDapAn();
      return;
    }
    ng.laKey = false;
    ganNganHang(ng, Array.isArray(r.banks) ? r.banks : []);
    ng.trangThai = (r.banks || []).length ? 'xong' : 'loi';
    if (ng.trangThai === 'loi' && !ng.issues.some(function (i) { return i.level === 'error'; })) {
      ng.issues.push(core.newIssue('error', 'Không tìm thấy câu hỏi nào trong file.'));
    }
    // đọc lại (thêm ảnh, đổi file đáp án…) → áp lại các file đáp án đã gán cho file đề này
    ng.tuKey = [];
    if (ng.trangThai === 'xong') S.nguon.forEach(function (k) { if (k.laKey && k.key && k.dich === ng.id) apKey(k, ng); });
    ghepDapAn();
  }

  function nguonTheoId(id) { for (var i = 0; i < S.nguon.length; i++) if (S.nguon[i].id === id) return S.nguon[i]; return null; }

  // Áp một file đáp án vào mọi ngân hàng của một file đề; ghi kết quả lên cả hai dòng file
  function apKey(k, de) {
    var mucs = S.muc.filter(function (e) { return e.nguonId === de.id; });
    var r;
    try { r = apDapAnChoMuc(mucs, k.key, NH.docx); } catch (e) {
      r = { matched: 0, filled: 0, same: 0, conflicts: 0, mismatched: 0, unused: [], issues: [core.newIssue('error', 'Không điền được đáp án: ' + (e && e.message || e))] };
    }
    k.ketQua = { deId: de.id, deTen: de.name, r: r };
    de.tuKey = (de.tuKey || []).filter(function (x) { return x.id !== k.id; }).concat([{ id: k.id, ten: k.name, r: r }]);
    S.thayDoi = true;
    if (r.filled) thongBao('Đã điền ' + r.filled + ' đáp án từ "' + k.name + '" vào "' + de.name + '".', 'ok');
    return r;
  }

  // Ghép tự động các file đáp án chưa có đích (tên gốc trùng / gần trùng / chỉ có một file đề).
  // Đề ứng viên tính cả file còn đang chờ đọc; ứng viên chưa đọc xong → đợi lần gọi sau (cuối mỗi lần đọc file).
  function ghepDapAn() {
    if (!NH.docx || typeof NH.docx.applyAnswerKey !== 'function') return;
    S.nguon.forEach(function (k) {
      if (!k.laKey || !k.key || k.dich !== undefined || k.trangThai !== 'xong') return;
      var ds = dsDeChoKey(true);
      // "chỉ có một file đề" chỉ áp khi đề đó nạp cùng lần hoặc trước file đáp án
      var de = chonDeChoKey(k.name, ds, NH.docx, ds.length === 1 && (ds[0].lo || 0) <= (k.lo || 0));
      if (!de || de.trangThai !== 'xong') return;
      k.dich = de.id;
      apKey(k, de);
    });
  }

  // File đề bị bỏ / đổi thành file đáp án → các file đáp án đang trỏ vào nó trở về "chưa có đích"
  function boKeyKhoiDe(deId) {
    S.nguon.forEach(function (k) { if (k.laKey && k.dich === deId) { k.dich = undefined; k.ketQua = null; } });
  }

  // Giáo viên chọn lại file đề cho một file đáp án: đọc lại đề cũ (bỏ đáp án đã điền, giữ tên/điểm/câu bỏ chọn đã sửa),
  // rồi điền vào đề mới
  function doiDichKey(kId, moi) {
    return xepHang(async function () {
      var k = nguonTheoId(kId);
      if (!k || !k.laKey || k.dich === moi) { veFile(); return; }   // vẽ lại để mở khoá ô chọn
      var cu = k.dich ? nguonTheoId(k.dich) : null;
      k.dich = moi;
      k.ketQua = null;
      if (cu) await phanTich(cu);
      var de = moi ? nguonTheoId(moi) : null;
      if (de && de.trangThai === 'xong' && !de.laKey) apKey(k, de);
      veLai();
    });
  }

  // File Word không tự nhận ra là file đáp án (vd hướng dẫn chấm chỉ có lời giải) → đọc lại như file đáp án
  function lamKey(id) {
    return xepHang(async function () {
      var ng = nguonTheoId(id);
      if (!ng || !ng.bytes || ng.laKey) { veFile(); return; }
      var key;
      try { key = await NH.docx.parseAnswerKey(ng.bytes, { fileName: ng.name.replace(/^.*\//, '') }); } catch (e) { key = null; }
      if (!key || !key.count) {
        thongBao('Không đọc được đáp án nào trong "' + ng.name + '" — cần bảng số câu – đáp án hoặc các dòng "Câu 1: A".', 'loi');
        veFile();
        return;
      }
      S.muc.filter(function (e) { return e.nguonId === id; }).forEach(giaiPhongAnh);
      S.muc = S.muc.filter(function (e) { return e.nguonId !== id; });
      ng.laKey = true; ng.key = key; ng.dich = undefined; ng.ketQua = null; ng.tuKey = [];
      ng.issues = Array.isArray(key.issues) ? key.issues : [];
      boKeyKhoiDe(id);
      if (!mucTheoKey(S.dangChon)) S.dangChon = S.muc[0] ? S.muc[0].key : null;
      ghepDapAn();
      veLai();
    });
  }

  function xepHang(fn) {
    S.hangDoi = S.hangDoi.then(fn).catch(function (e) { thongBao('Lỗi: ' + (e && e.message || e), 'loi'); });
    return S.hangDoi;
  }

  // Thay các ngân hàng của một nguồn (đọc lại) — giữ tên đã sửa, điểm đã sửa và câu đã bỏ chọn
  function ganNganHang(ng, banks) {
    var cu = {}, viTri = -1;
    S.muc = S.muc.filter(function (e, i) {
      if (e.nguonId !== ng.id) return true;
      cu[e.viTri] = e;
      if (viTri < 0) viTri = i;
      giaiPhongAnh(e);
      return false;
    });
    if (viTri < 0) viTri = S.muc.length;
    var moi = banks.map(function (b, i) {
      if (!b.images || typeof b.images !== 'object') b.images = {};
      if (!Array.isArray(b.questions)) b.questions = [];
      var e = taoMuc(ng.id + '-' + i, b);
      e.nguonId = ng.id;
      e.viTri = i;
      var c = cu[i];
      if (c) {
        if (c.tenSua) { b.title = c.tenSua; b.ident = core.bankIdent(c.tenSua); e.tenSua = c.tenSua; }
        e.boChon = c.boChon || {};
        e.khongXuat = c.khongXuat;
        e.diemSua = c.diemSua || {};
        b.questions.forEach(function (q) { if (q && Object.prototype.hasOwnProperty.call(e.diemSua, q.id)) q.points = e.diemSua[q.id]; });
      } else e.diemSua = {};
      return e;
    });
    Array.prototype.splice.apply(S.muc, [viTri, 0].concat(moi));
  }

  function boNguon(id) {
    return xepHang(async function () {
      var ng = nguonTheoId(id);
      if (!ng) return;
      S.muc = S.muc.filter(function (e) { if (e.nguonId === id) { giaiPhongAnh(e); return false; } return true; });
      S.nguon = S.nguon.filter(function (n) { return n.id !== id; });
      if (ng.kind === 'image' && S.anhKem[ng.name]) delete S.anhKem[ng.name];
      if (!mucTheoKey(S.dangChon)) S.dangChon = S.muc[0] ? S.muc[0].key : null;
      S.ketQua = null;
      rong($('ket-qua-xuat'));
      if (ng.laKey) {
        // bỏ file đáp án → đọc lại file đề đã được điền để trả về đúng như file đề
        var de = ng.dich ? nguonTheoId(ng.dich) : null;
        if (de) { veLai(); await phanTich(de); }
      } else {
        boKeyKhoiDe(id);
        ghepDapAn();
      }
      veLai();
    });
  }

  function boMuc(key) {
    var e = mucTheoKey(key);
    if (!e) return;
    giaiPhongAnh(e);
    var i = S.muc.indexOf(e);
    S.muc.splice(i, 1);
    // nguồn đọc đề không còn ngân hàng nào → bỏ luôn nguồn (file đáp án đang trỏ vào nó chờ ghép lại)
    if (!S.muc.some(function (x) { return x.nguonId === e.nguonId; })) {
      S.nguon = S.nguon.filter(function (n) { return n.id !== e.nguonId; });
      boKeyKhoiDe(e.nguonId);
    }
    S.dangChon = S.muc[Math.min(i, S.muc.length - 1)] ? S.muc[Math.min(i, S.muc.length - 1)].key : null;
    veLai();
  }

  /* ---------- sự kiện bước 1 ---------- */

  function ganNap() {
    var dz = $('dropzone'), input = $('o-file');
    $('nut-chon-file').addEventListener('click', function (ev) { ev.stopPropagation(); input.click(); });
    dz.addEventListener('click', function (ev) { if (ev.target.closest('button,a,input')) return; input.click(); });
    input.addEventListener('change', function () {
      var fs = Array.prototype.slice.call(input.files || []);
      input.value = '';
      nhanFile(fs);
    });
    var dem = 0;
    function coFile(ev) { var t = ev.dataTransfer && ev.dataTransfer.types; return t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
    doc.addEventListener('dragenter', function (ev) { if (!coFile(ev)) return; ev.preventDefault(); dem++; dz.classList.add('is-over'); });
    doc.addEventListener('dragleave', function (ev) { if (!coFile(ev)) return; dem = Math.max(0, dem - 1); if (!dem) dz.classList.remove('is-over'); });
    doc.addEventListener('dragover', function (ev) { if (!coFile(ev)) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; });
    doc.addEventListener('drop', function (ev) {
      if (!coFile(ev)) return;
      ev.preventDefault();
      dem = 0;
      dz.classList.remove('is-over');
      layFileTha(ev.dataTransfer).then(nhanFile);
    });
    $('ds-file').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-bo-nguon]');
      if (b) { boNguon(b.getAttribute('data-bo-nguon')); return; }
      var k = ev.target.closest('[data-lam-key]');
      if (k) { k.disabled = true; lamKey(k.getAttribute('data-lam-key')); }
    });
    $('ds-file').addEventListener('change', function (ev) {
      var s = ev.target.closest('[data-key-dich]');
      if (s) { s.disabled = true; doiDichKey(s.getAttribute('data-key-dich'), s.value); }
    });
  }

  // Lấy file từ thao tác thả, kể cả thư mục (thả cả thư mục ảnh)
  function layFileTha(dt) {
    var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
    var entries = items.map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }).filter(Boolean);
    if (!entries.length || !entries.some(function (e) { return e.isDirectory; })) return Promise.resolve(Array.prototype.slice.call(dt.files || []));
    var kq = [];
    function duyet(en, duong) {
      if (kq.length > 2000) return Promise.resolve();
      if (en.isFile) return new Promise(function (ok) { en.file(function (f) { kq.push({ file: f, path: duong + f.name }); ok(); }, function () { ok(); }); });
      if (!en.isDirectory) return Promise.resolve();
      var r = en.createReader();
      return new Promise(function (ok) {
        var tat = [];
        (function doc1() {
          r.readEntries(function (ds) {
            if (!ds.length) { Promise.all(tat).then(ok); return; }
            ds.forEach(function (d) { tat.push(duyet(d, duong + en.name + '/')); });
            doc1();
          }, function () { Promise.all(tat).then(ok); });
        })();
      });
    }
    return Promise.all(entries.map(function (e) { return duyet(e, ''); })).then(function () {
      return kq.map(function (x) { try { Object.defineProperty(x.file, 'nhDuong', { value: x.path }); } catch (e) { /* bỏ qua */ } return x.file; });
    });
  }

  function nhanFile(fs) {
    fs = (fs || []).filter(function (f) { return f && f.size > 0 && !/^\.|^(thumbs\.db|desktop\.ini)$/i.test(f.name); });
    if (!fs.length) return;
    Promise.all(fs.map(function (f) {
      return docFile(f).then(function (u8) { return { name: f.nhDuong || f.name, bytes: u8 }; }, function () { return null; });
    })).then(function (ds) {
      ds = ds.filter(Boolean);
      if (ds.length < fs.length) thongBao('Có ' + (fs.length - ds.length) + ' file không đọc được.', 'loi');
      if (ds.length) napFiles(ds);
    });
  }

  /* ---------- sự kiện bước 2 ---------- */

  function ganSoat() {
    var tabs = $('the-ngan-hang');
    tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('[role="tab"]');
      if (!b || b.getAttribute('data-key') === S.dangChon) return;
      chonTab(b.getAttribute('data-key'), false);
    });
    tabs.addEventListener('keydown', function (ev) {
      var ds = Array.prototype.slice.call(tabs.querySelectorAll('[role="tab"]'));
      var i = ds.indexOf(doc.activeElement);
      if (i < 0) return;
      var j = ev.key === 'ArrowRight' ? (i + 1) % ds.length : ev.key === 'ArrowLeft' ? (i - 1 + ds.length) % ds.length
        : ev.key === 'Home' ? 0 : ev.key === 'End' ? ds.length - 1 : -1;
      if (j < 0) return;
      ev.preventDefault();
      chonTab(ds[j].getAttribute('data-key'), true);
    });

    var o = $('ten-ngan-hang');
    o.addEventListener('input', function () {
      var e = mucDangChon();
      if (!e) return;
      var t = core.nfc(o.value).replace(/\s+/g, ' ').trim();
      o.setAttribute('aria-invalid', t ? 'false' : 'true');
      if (!t) return;
      doiTen(e, t);
    });
    o.addEventListener('change', function () { var e = mucDangChon(); if (e) { o.value = e.bank.title; o.removeAttribute('aria-invalid'); veNganHangNguon(e); } });
    $('nut-bo-ngan-hang').addEventListener('click', function () {
      var e = mucDangChon();
      if (e && root.confirm('Bỏ ngân hàng "' + e.bank.title + '" khỏi danh sách xuất?')) boMuc(e.key);
    });

    $('loc').addEventListener('change', function (ev) { if (ev.target.name === 'loc') { S.loc = ev.target.value; apLoc(); } });
    $('nut-chon-het').addEventListener('click', function () { chonHet(true); });
    $('nut-bo-het').addEventListener('click', function () { chonHet(false); });
    $('nut-dat-diem').addEventListener('click', datDiemHet);
    $('diem-hang-loat').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); datDiemHet(); } });

    var list = $('ds-cau');
    list.addEventListener('change', function (ev) {
      var t = ev.target, card = t.closest('.q-card');
      if (!card) return;
      var e = mucDangChon(), idx = Number(card.getAttribute('data-idx')), q = e && e.bank.questions[idx];
      if (!q) return;
      if (t.getAttribute('data-act') === 'chon') {
        if (t.checked) delete e.boChon[q.id]; else e.boChon[q.id] = true;
        card.classList.toggle('is-off', !t.checked);
        veNhe();
      } else if (t.getAttribute('data-act') === 'diem') {
        var v = docDiem(t.value);
        if (v == null || (v === 0 && q.type !== 'text')) {
          thongBao(tenCau(q) + ': điểm phải là số lớn hơn 0 (vd 1 hoặc 0,25).', 'loi');
          t.value = fmtSo(q.points);
          t.removeAttribute('aria-invalid');
          return;
        }
        datDiem(e, q, v);
        t.value = fmtSo(v);
        var coLoiTruoc = card.getAttribute('data-loi') === '1';
        if (coLoiTruoc !== coLoi(e, q)) capNhatThe(e, idx);
        veNhe();
      }
    });
    list.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.getAttribute('data-act') !== 'diem') return;
      var v = docDiem(t.value);
      t.setAttribute('aria-invalid', v == null || v === 0 ? 'true' : 'false');
    });
  }

  function tenCau(q) { return q.title || ('Câu ' + (q.no || '?')); }

  function datDiem(e, q, v) {
    q.points = v;
    if (!e.diemSua) e.diemSua = {};
    e.diemSua[q.id] = v;
    if (e._vd) delete e._vd[q.id];
  }

  function doiTen(e, t) {
    e.bank.title = t;
    e.bank.ident = core.bankIdent(t);
    e.tenSua = t;
    veTab();
    if (e.key === S.dangChon) veTrungTen(e);
    veXuat();
    veCanvasNganHang();
    S.thayDoi = true;
  }
  function veNganHangNguon(e) {
    var nguon = $('nguon-ngan-hang');
    var sp = nguon.children[1];
    if (sp) sp.textContent = 'Mã: ' + e.bank.ident;
  }

  function chonTab(key, focus) {
    S.dangChon = key;
    veSoat();
    if (focus) { var t = $('tab-' + key); if (t) t.focus(); }
  }

  function chonHet(chon) {
    var e = mucDangChon();
    if (!e) return;
    e.boChon = {};
    if (!chon) e.bank.questions.forEach(function (q) { if (q) e.boChon[q.id] = true; });
    var cards = $('ds-cau').querySelectorAll('.q-card');
    for (var i = 0; i < cards.length; i++) {
      var cb = cards[i].querySelector('input[data-act="chon"]');
      if (cb && !cb.disabled) { cb.checked = chon; cards[i].classList.toggle('is-off', !chon); }
    }
    veNhe();
  }

  function datDiemHet() {
    var e = mucDangChon(), o = $('diem-hang-loat');
    if (!e) return;
    var v = docDiem(o.value);
    if (v == null || v === 0) { o.setAttribute('aria-invalid', 'true'); thongBao('Điểm phải là số lớn hơn 0 (vd 0,25).', 'loi'); o.focus(); return; }
    o.removeAttribute('aria-invalid');
    var n = 0;
    e.bank.questions.forEach(function (q) { if (q && q.type !== 'text') { datDiem(e, q, v); n++; } });
    veNganHang(e);
    veNhe();
    thongBao('Đã đặt ' + fmtSo(v) + ' điểm cho ' + n + ' câu của "' + e.bank.title + '".', 'ok');
  }

  /* ---------- sự kiện bước 3 ---------- */

  function ganXuat() {
    var f = $('form-xuat');
    f.addEventListener('submit', xuat);
    f.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.name && Object.prototype.hasOwnProperty.call(S.opts, t.name)) {
        S.opts[t.name] = t.type === 'checkbox' ? t.checked : t.value;
        luuTuyChon();
        if (S.ketQua) { rong($('ket-qua-xuat')).appendChild(h('div', { class: 'notice n-gold' }, icon('info'), h('div', { text: 'Đã đổi tuỳ chọn — bấm "Tải gói QTI" để tạo lại gói.' }))); S.ketQua = null; }
        veXuat();
      } else if (t.hasAttribute('data-xuat-key')) {
        var e = mucTheoKey(t.getAttribute('data-xuat-key'));
        if (e) { e.khongXuat = !t.checked; veXuat(); capNhatBuoc(); }
      }
    });
    $('ket-qua-xuat').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tai]');
      if (!b || !S.ketQua) return;
      var v = b.getAttribute('data-tai'), g = S.ketQua.goi;
      if (v === 'het') g.forEach(function (p, i) { setTimeout(function () { taiVe(p.bytes, p.fileName); }, i * 700); });
      else if (g[Number(v)]) taiVe(g[Number(v)].bytes, g[Number(v)].fileName);
    });
  }

  /* ===================== Bước 4: gửi thẳng lên Canvas ===================== */

  function cvApi() { return NH.canvasApi; }

  async function khoiDongCanvas() {
    var cv = cvApi();
    if (!cv || root.location.protocol === 'file:') return;
    root.addEventListener('message', function (ev) {
      if (ev.origin !== root.location.origin || !ev.data || ev.data.nh !== 'canvas-dang-nhap') return;
      if (ev.data.ok) thongBao('Đã đăng nhập Canvas.', 'ok');
      else thongBao(loiDangNhap(ev.data.ma, ev.data.thieu), 'loi');
      capNhatCanvas();
    });
    $('cv-dang-nhap').addEventListener('click', dangNhap);
    $('cv-dung-token').addEventListener('click', dungToken);
    $('cv-token').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); dungToken(); } });
    $('cv-dang-xuat').addEventListener('click', async function () {
      var r = await cv.logout();
      thongBao(r.personalTokenCleared ? 'Đã xoá token khỏi trình duyệt.' : 'Đã đăng xuất Canvas.', 'ok');
      capNhatCanvas();
    });
    $('cv-khoa-hoc').addEventListener('change', chonKhoaHoc);
    $('cv-chon-ngan-hang').addEventListener('change', function () {
      var e = mucTheoKey($('cv-chon-ngan-hang').value);
      $('cv-ten-ngan-hang').value = e ? e.bank.title : '';
      kiemNutGui();
    });
    $('cv-ten-ngan-hang').addEventListener('input', function () {
      var e = mucTheoKey($('cv-chon-ngan-hang').value), t = core.nfc($('cv-ten-ngan-hang').value).replace(/\s+/g, ' ').trim();
      if (!e || !t) return;
      doiTen(e, t);
      if (e.key === S.dangChon && doc.activeElement !== $('ten-ngan-hang')) { $('ten-ngan-hang').value = t; veNganHangNguon(e); }
    });
    $('cv-gui').addEventListener('click', guiCanvas);
    $('cv-huy').addEventListener('click', function () { if (S.cv.ctrl) S.cv.ctrl.abort(); });
    $('cv-nhom-dich').addEventListener('change', function (ev) {
      if (ev.target.name !== 'cv-dich' || S.cv.dangGui) return;
      S.cv.dich = ev.target.value === 'newquiz' ? 'newquiz' : 'classic';
      luuDichGui();
      veDichGui();
    });
    veDichGui();
    await capNhatCanvas();
  }

  // Hai cách gửi: Classic (ghi đè được) / chuyển sang New Quizzes (mỗi lần gửi tạo một New Quiz mới)
  function veDichGui() {
    var nq = S.cv.dich === 'newquiz';
    var r = $('cv-nhom-dich').querySelectorAll('input[name="cv-dich"]');
    for (var i = 0; i < r.length; i++) {
      r[i].checked = r[i].value === S.cv.dich;
      r[i].closest('.opt').classList.toggle('is-checked', r[i].checked);
    }
    $('cv-hop-ghi-de').hidden = nq;
    $('cv-ghi-chu-nq').hidden = !nq;
    $('cv-gui').textContent = nq ? 'Gửi và chuyển sang New Quizzes' : 'Gửi vào Question Bank';
  }

  async function capNhatCanvas() {
    var cv = cvApi();
    var cfg;
    try { cfg = await cv.getConfig(); } catch (e) { cfg = { enabled: false }; }
    S.cv.cfg = cfg;
    var bat = !!(cfg && cfg.enabled);
    $('buoc-canvas').hidden = !bat;
    $('buoc-nav-canvas').hidden = !bat;
    // địa chỉ Canvas của trường (kể cả khi chưa bật đăng nhập) → gợi ý ở bước 3 và bước 4
    var truong = rong($('cv-truong')), g = goiYCanvasTruong();
    truong.hidden = !g;
    if (g) while (g.firstChild) truong.appendChild(g.firstChild);
    if (!$('form-xuat').hidden) veCachNhap();
    if (!bat) return;
    var user = null;
    if (cfg.loggedIn) {
      user = cfg.user;
      if (!user || !user.name) { try { user = await cv.me(); } catch (e) { user = cfg.user || { name: 'Đã đăng nhập' }; } }
    } else if (cfg.personalToken && cv.hasPersonalToken()) {
      try { user = await cv.me(); } catch (e) { user = null; }
      if (!user) { cv.clearPersonalToken(); thongBao('Token không dùng được (sai hoặc đã hết hạn) — đã xoá.', 'loi'); }
    }
    S.cv.user = user;
    $('cv-base').textContent = cfg.base || 'Canvas';
    $('cv-chua-dang-nhap').hidden = !!user;
    $('cv-da-dang-nhap').hidden = !user;
    $('cv-dang-nhap').hidden = !cfg.oauth;
    $('cv-hop-token').hidden = !cfg.personalToken;
    $('cv-ly-do').textContent = !cfg.oauth && cfg.oauthReason ? cfg.oauthReason : '';
    if (user) {
      var ten = user.name || user.short_name || user.login_id || 'Đã đăng nhập';
      $('cv-ten').textContent = ten;
      $('cv-avatar').textContent = String(ten).trim().split(/\s+/).pop().charAt(0).toUpperCase();
      $('cv-mo-ta').textContent = (cfg.loggedIn ? 'Đăng nhập bằng tài khoản Canvas' : 'Đang dùng token cá nhân (chạy thử)') + ' · ' + (cfg.base || '');
      await taiKhoaHoc();
    }
    veCanvasNganHang();
  }

  function dangNhap() {
    var cv = cvApi(), url = cv.loginUrl();
    var w = null;
    try { w = root.open(url, 'nh-canvas-dang-nhap', 'popup,width=560,height=720'); } catch (e) { w = null; }
    if (w) { thongBao('Đăng nhập trong cửa sổ vừa mở; xong sẽ tự quay lại đây.', 'info'); return; }
    if (S.muc.length && !root.confirm('Trình duyệt chặn cửa sổ đăng nhập. Chuyển trang này sang Canvas để đăng nhập? Các câu đã nạp sẽ phải nạp lại.')) return;
    S.thayDoi = false;
    root.location.href = url;
  }

  async function dungToken() {
    var cv = cvApi(), o = $('cv-token'), t = o.value.trim();
    if (!t) { o.setAttribute('aria-invalid', 'true'); o.focus(); return; }
    o.removeAttribute('aria-invalid');
    cv.setPersonalToken(t);
    o.value = '';
    await capNhatCanvas();
    if (S.cv.user) thongBao('Đã kết nối bằng token cá nhân.', 'ok');
  }

  async function taiKhoaHoc() {
    var sel = $('cv-khoa-hoc'), cv = cvApi();
    var cu = sel.value;
    rong(sel).appendChild(h('option', { value: '', text: 'Đang tải danh sách khoá học…' }));
    sel.disabled = true;
    try {
      var ds = await cv.listCourses();
      S.cv.khoaHoc = ds;
      rong(sel).appendChild(h('option', { value: '', text: ds.length ? '— Chọn khoá học —' : 'Không có khoá học nào bạn là giáo viên' }));
      ds.forEach(function (c) {
        sel.appendChild(h('option', { value: c.id, text: c.name + (c.code && c.code !== c.name ? ' (' + c.code + ')' : '') + (c.term ? ' · ' + c.term : '') }));
      });
      if (cu && ds.some(function (c) { return c.id === cu; })) sel.value = cu;
    } catch (e) {
      rong(sel).appendChild(h('option', { value: '', text: 'Không tải được khoá học' }));
      thongBao(e && e.message || 'Không tải được khoá học.', 'loi');
      if (e && e.status === 401) { capNhatCanvas(); return; }
    } finally { sel.disabled = false; }
    if (sel.value) chonKhoaHoc();
  }

  async function chonKhoaHoc() {
    var id = $('cv-khoa-hoc').value, cv = cvApi();
    var quyen = rong($('cv-quyen')), nh = rong($('cv-ngan-hang-cu'));
    S.cv.quyenOk = false;
    kiemNutGui();
    if (!id) return;
    quyen.appendChild(h('p', { class: 'muted nho' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Đang kiểm tra quyền…'));
    try {
      var p = await cv.checkPermissions(id);
      rong(quyen);
      S.cv.quyenOk = !!p.ok;
      if (!p.ok) quyen.appendChild(h('div', { class: 'notice n-loi' }, icon('loi'), h('div', null, h('b', { text: 'Không nhập được vào khoá học này.' }),
        h('ul', null, (p.missing || []).map(function (m) { return h('li', { text: m }); })))));
      else quyen.appendChild(h('div', { class: 'notice n-ok' }, icon('okTron'), h('div', { text: 'Có quyền nhập nội dung vào khoá học.' })));
    } catch (e) {
      rong(quyen).appendChild(h('div', { class: 'notice n-loi' }, icon('loi'), h('div', { text: e && e.message || 'Không kiểm tra được quyền.' })));
    }
    kiemNutGui();
    await taiNganHangCanvas(id);
  }

  async function taiNganHangCanvas(id) {
    var nh = rong($('cv-ngan-hang-cu')), cv = cvApi();
    nh.appendChild(h('p', { class: 'field-label', text: 'Ngân hàng câu hỏi (Classic) đang có trong khoá học' }));
    var cho = h('p', { class: 'muted nho' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Đang tải…');
    nh.appendChild(cho);
    try {
      var ds = await cv.listBanks(id);
      cho.remove();
      if (!ds.length) { nh.appendChild(h('p', { class: 'muted nho', text: 'Chưa có ngân hàng nào.' })); return; }
      nh.appendChild(h('ul', { class: 'cv-banks' }, ds.map(function (b) {
        return h('li', null, h('span', { text: b.title || '(không tên)' }), h('span', { class: 'muted', text: b.count != null ? b.count + ' câu' : '' }));
      })));
    } catch (e) {
      cho.remove();
      nh.appendChild(h('p', { class: 'muted nho', text: e && e.message || 'Không tải được danh sách ngân hàng.' }));
    }
  }

  function veCanvasNganHang() {
    var sel = $('cv-chon-ngan-hang');
    if (!sel || $('buoc-canvas').hidden) return;
    var cu = sel.value;
    rong(sel);
    S.muc.forEach(function (e) {
      var t = tomTatMuc(e);
      sel.appendChild(h('option', { value: e.key, disabled: t.chon === 0, text: (e.bank.title || '(chưa có tên)') + ' — ' + t.chon + ' câu' }));
    });
    if (!S.muc.length) sel.appendChild(h('option', { value: '', text: 'Chưa nạp đề (bước 1)' }));
    if (cu && mucTheoKey(cu)) sel.value = cu;
    else if (S.muc.length) sel.value = (mucDangChon() || S.muc[0]).key;
    var e = mucTheoKey(sel.value);
    if (doc.activeElement !== $('cv-ten-ngan-hang')) $('cv-ten-ngan-hang').value = e ? e.bank.title : '';
    kiemNutGui();
  }

  function kiemNutGui() {
    var e = mucTheoKey($('cv-chon-ngan-hang').value);
    var ok = !!(e && tomTatMuc(e).chon > 0 && $('cv-khoa-hoc').value && S.cv.quyenOk !== false && !S.cv.dangGui);
    $('cv-gui').disabled = !ok;
  }

  async function guiCanvas() {
    var cv = cvApi(), qti = NH.qti;
    var e = mucTheoKey($('cv-chon-ngan-hang').value), courseId = $('cv-khoa-hoc').value;
    if (!e || !courseId) return;
    var banks = banksDeXuat([e]);
    var kq = rong($('cv-ket-qua'));
    if (!banks.length) { thongBao('Ngân hàng này chưa có câu nào xuất được.', 'loi'); return; }
    var khoa = S.cv.khoaHoc.filter(function (c) { return c.id === courseId; })[0];
    var nq = S.cv.dich === 'newquiz';
    S.cv.dangGui = true;
    S.cv.ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    $('cv-gui').disabled = true;
    $('cv-huy').hidden = !S.cv.ctrl;
    var radio = $('cv-nhom-dich').querySelectorAll('input');
    for (var ri = 0; ri < radio.length; ri++) radio[ri].disabled = true;
    var thanh = $('cv-thanh');
    thanh.className = 'progress';
    $('cv-tien-trinh').hidden = false;
    function tienTrinh(p) {
      thanh.firstElementChild.style.width = p.percent + '%';
      thanh.setAttribute('aria-valuenow', String(p.percent));
      $('cv-tt-msg').textContent = p.message || '';
      $('cv-tt-pct').textContent = p.percent + '%';
    }
    tienTrinh({ percent: 1, message: nq ? 'Đang tạo gói QTI (bài kiểm tra để chuyển sang New Quizzes)…' : 'Đang tạo gói QTI (Classic)…' });
    try {
      var opts = {};
      for (var k in S.opts) opts[k] = S.opts[k];
      // New Quizzes: gói bố cục Item Bank (một bài kiểm tra chứa mọi câu) — Canvas nhập rồi chuyển bài đó thành New Quiz.
      // Classic: gói objectbank (chỉ tạo ngân hàng, ghi đè được).
      opts.target = nq ? 'itembank' : 'classic';
      var pk = await qti.buildPackages(banks, opts);
      if (!pk.length) throw new Error('Không tạo được gói (mọi câu đều có lỗi).');
      var p = pk[0];
      var r = await cv.importPackage(courseId, {
        bytes: p.bytes, fileName: p.fileName, bankName: nq ? undefined : e.bank.title,
        overwrite: nq ? false : $('cv-ghi-de').checked, importQuizzesNext: nq,
        onProgress: tienTrinh, signal: S.cv.ctrl ? S.cv.ctrl.signal : undefined
      });
      thanh.classList.add(r.ok ? 'is-ok' : 'is-loi');
      var base = S.cv.cfg && S.cv.cfg.base, lk = [];
      var uChinh = linkCanvas(base, courseId, nq ? 'quizzes' : 'question_banks'), uNhap = linkCanvas(base, courseId, 'content_migrations');
      if (uChinh) lk.push(h('a', { href: uChinh, target: '_blank', rel: 'noopener noreferrer' }, nq ? 'Mở Câu Hỏi Kiểm Tra (Quizzes) của khoá học ' : 'Mở Quản Lý Ngân Hàng Câu Hỏi trên Canvas ', icon('ngoai')));
      if (uNhap) lk.push(h('a', { href: uNhap, target: '_blank', rel: 'noopener noreferrer' }, 'Xem lần nhập và các vấn đề (Nhập Nội Dung Khóa Học) ', icon('ngoai')));
      var soCau = (p.counts && p.counts.total) || 0, tenKH = khoa ? khoa.name : 'khoá học';
      kq.appendChild(h('div', { class: 'notice ' + (r.ok ? 'n-ok' : 'n-loi') }, icon(r.ok ? 'okTron' : 'loi'), h('div', null,
        h('b', { text: !r.ok ? 'Canvas báo nhập không thành công.' : nq
          ? 'Đã gửi "' + e.bank.title + '" (' + soCau + ' câu) vào ' + tenKH + ' — Canvas chuyển thành một New Quiz cùng tên.'
          : 'Đã nhập "' + e.bank.title + '" (' + soCau + ' câu) vào ' + tenKH + '.' }),
        r.ok && nq ? h('p', { style: 'margin:4px 0 0', text: 'New Quiz có thể cần thêm vài phút mới hiện trong danh sách Câu Hỏi Kiểm Tra. ' +
          'Xem thêm mục Ngân Hàng Câu Hỏi (Item Banks) của khoá học: nếu Canvas của trường bật chuyển ngân hàng sang New Quizzes thì có thể có Item Bank cùng tên (cần thử lần đầu). ' +
          'Nếu khoá học chưa bật New Quizzes, Canvas giữ bài kiểm tra Classic.' }) : null,
        lk.map(function (a) { return h('p', { style: 'margin:4px 0 0' }, a); }))));
      var vdXuat = locVanDeXuat(pk.issues || []).filter(function (i) { return i.level !== 'info'; });
      if (vdXuat.length) kq.appendChild(h('details', { class: 'fold' }, h('summary', null, 'Thông báo khi tạo gói (' + vdXuat.length + ')'), h('div', { class: 'fold-body' }, dsVanDe(vdXuat))));
      if (r.issues && r.issues.length) {
        var goc = hostCanvas(base);
        kq.appendChild(h('details', { class: 'fold', open: true }, h('summary', null, 'Canvas báo ' + r.issues.length + ' vấn đề sau khi nhập'),
          h('div', { class: 'fold-body' }, h('ul', { class: 'issues' }, r.issues.map(function (i) {
            var lv = i.type === 'error' ? 'error' : i.type === 'warning' ? 'warn' : 'info';
            // chỉ mở liên kết "sửa" trỏ về đúng Canvas của trường
            var fix = goc && typeof i.fixUrl === 'string' && i.fixUrl.indexOf(goc.origin + '/') === 0
              ? h('a', { href: i.fixUrl, target: '_blank', rel: 'noopener noreferrer', text: ' Sửa trên Canvas' }) : null;
            return h('li', { class: 'i-' + lv }, icon(IC_MUC[lv]), h('span', null, String(i.description || i.errorMessage || 'Vấn đề không rõ'), fix));
          })))));
      }
      thongBao(r.ok ? (nq ? 'Đã gửi lên Canvas — đang chuyển sang New Quizzes.' : 'Đã gửi lên Canvas.') : 'Nhập vào Canvas không thành công.', r.ok ? 'ok' : 'loi');
      taiNganHangCanvas(courseId);
    } catch (err) {
      thanh.classList.add('is-loi');
      kq.appendChild(h('div', { class: 'notice n-loi' }, icon('loi'), h('div', null,
        h('b', { text: err && err.code === 'huy' ? 'Đã huỷ gửi.' : 'Không gửi được lên Canvas.' }),
        h('p', { style: 'margin:4px 0 0', text: err && err.message || String(err) }),
        err && err.code !== 'huy' ? h('p', { class: 'nho', style: 'margin:4px 0 0', text: nq
          ? 'Có thể tải gói ở bước 3 (Item Bank – New Quizzes) rồi nhập tay vào Item Bank hoặc một New Quiz mới.'
          : 'Có thể tải gói ở bước 3 (chọn Question Bank – Classic) rồi nhập tay.' }) : null)));
      if (err && (err.status === 401 || err.code === 'het_phien' || err.code === 'chua_dang_nhap')) capNhatCanvas();
    } finally {
      S.cv.dangGui = false;
      S.cv.ctrl = null;
      $('cv-huy').hidden = true;
      for (var rj = 0; rj < radio.length; rj++) radio[rj].disabled = false;
      kiemNutGui();
    }
  }

  // Quay về sau đăng nhập OAuth (?canvas=ok|loi&ma=…): cửa sổ phụ báo cho trang gốc rồi tự đóng
  function xuLyThamSoCanvas() {
    var p;
    try { p = new URLSearchParams(root.location.search); } catch (e) { return false; }
    var c = p.get('canvas');
    if (!c) return false;
    var ma = p.get('ma') || '';
    try {
      if (root.opener && root.opener !== root && root.opener.location.origin === root.location.origin) {
        root.opener.postMessage({ nh: 'canvas-dang-nhap', ok: c === 'ok', ma: ma, thieu: p.get('thieu') || '' }, root.location.origin);
        root.close();
        return true;
      }
    } catch (e) { /* khác nguồn → xử lý tại chỗ */ }
    try { root.history.replaceState(null, '', root.location.pathname + root.location.hash); } catch (e) { /* bỏ qua */ }
    setTimeout(function () {
      if (c === 'ok') thongBao('Đã đăng nhập Canvas.', 'ok');
      else thongBao(loiDangNhap(ma, p.get('thieu')), 'loi');
      var s = $('buoc-canvas');
      if (s && !s.hidden) s.scrollIntoView({ block: 'start' });
    }, 400);
    return false;
  }

  /* ===================== Khởi động ===================== */

  function kiemModule() {
    var thieu = ['core', 'zip', 'html', 'math', 'latex', 'omml', 'docx', 'xlsx', 'scorm', 'qti'].filter(function (m) { return !NH[m]; });
    if (thieu.length) thongBao('Thiếu module: ' + thieu.join(', ') + ' — tải lại trang (Ctrl+F5).', 'loi');
    return !thieu.length;
  }

  // Chạy qua http: kiểm tra file mẫu có trên máy chủ chưa (thiếu → tắt nút, tránh tải về trang lỗi 404)
  function kiemMau() {
    if (!/^https?:$/.test(root.location.protocol) || typeof fetch !== 'function') return;
    ['mau-word', 'mau-excel'].forEach(function (id) {
      var a = $(id);
      if (!a) return;
      fetch(a.getAttribute('href'), { method: 'HEAD', cache: 'no-store' }).then(function (r) {
        if (r.ok) return;
        a.removeAttribute('href');
        a.setAttribute('aria-disabled', 'true');
        a.setAttribute('title', 'File mẫu chưa có trên máy chủ (thư mục mau/)');
        a.appendChild(h('span', { class: 'sr-only', text: ' — chưa có file mẫu' }));
        if (!$('mau-thieu')) a.parentNode.insertBefore(h('p', { id: 'mau-thieu', class: 'hint', text: 'File mẫu chưa có trên máy chủ — liên hệ bộ phận CNTT, hoặc xem cách soạn trong trang Hướng dẫn.' }), a);
      }).catch(function () { /* mạng lỗi → giữ liên kết */ });
    });
  }

  function khoiDong() {
    if (xuLyThamSoCanvas()) return;
    kiemModule();
    kiemMau();
    ganNap();
    ganSoat();
    ganXuat();
    veLai();
    theoDoiCuon();
    root.addEventListener('beforeunload', function (ev) {
      if (S.muc.length && S.thayDoi) { ev.preventDefault(); ev.returnValue = ''; }
    });
    khoiDongCanvas().catch(function () { /* không có máy chủ → ẩn bước 4 */ });
  }

  // Móc dùng khi phát triển/kiểm thử trong trình duyệt (không có nút trên giao diện)
  root.NH_DEV_LOAD = function (url, ten) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' khi tải ' + url);
      return r.arrayBuffer();
    }).then(function (b) {
      return napFiles([{ name: ten || decodeURIComponent(String(url).split('?')[0].split('/').pop() || 'file'), bytes: new Uint8Array(b) }]);
    });
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', khoiDong);
  else khoiDong();

  var api = {};
  for (var k in thuan) api[k] = thuan[k];
  api.state = function () { return S; };
  api.napFiles = napFiles;
  api._dev = { capNhatCanvas: capNhatCanvas };   // kiểm thử giao diện bước 4 với canvasApi giả
  return api;
});
