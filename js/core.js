/* js/core.js — tiện ích dùng chung: XML, thoát ký tự, chuỗi tiếng Việt, mô hình câu hỏi, CRC32 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.core = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /* ===================== Chuỗi cơ bản ===================== */

  function nfc(s) { return String(s == null ? '' : s).normalize('NFC'); }

  // Ký tự cấm trong XML 1.0 + nửa cặp surrogate lẻ (cờ u: cặp hợp lệ được coi là 1 ký tự nên không khớp)
  var RE_XML_CAM = /[\x00-\x08\x0B\x0C\x0E-\x1F\u{FFFE}\u{FFFF}\u{D800}-\u{DFFF}]/gu;
  var RE_XML_CAM1 = /[\x00-\x08\x0B\x0C\x0E-\x1F\u{FFFE}\u{FFFF}\u{D800}-\u{DFFF}]/u; // không cờ g để test() không giữ lastIndex
  function boKyTuCam(s) { return RE_XML_CAM1.test(s) ? s.replace(RE_XML_CAM, '') : s; }

  function escXml(s) {
    s = boKyTuCam(String(s == null ? '' : s));
    if (!/[&<>\r]/.test(s)) return s;
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
  }

  function escAttr(s) {
    s = boKyTuCam(String(s == null ? '' : s));
    if (!/[&<>"\t\n\r]/.test(s)) return s;
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function slugAscii(s) {
    return nfc(s).normalize('NFD').replace(/[\u{0300}-\u{036f}]/gu, '')
      .replace(/[đĐ]/g, 'd').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  var _enc = null, _dec = null;
  function utf8Encode(s) {
    if (!_enc) _enc = new TextEncoder();
    return _enc.encode(String(s == null ? '' : s));
  }
  function utf8Decode(u8) {
    if (!_dec) _dec = new TextDecoder('utf-8'); // tự bỏ BOM, byte hỏng → U+FFFD
    if (u8 instanceof ArrayBuffer) u8 = new Uint8Array(u8);
    return _dec.decode(u8);
  }

  // FNV-1a 32 bit trên byte UTF-8 của chuỗi NFC
  function fnv1a32(s) {
    var b = utf8Encode(nfc(s)), h = 0x811c9dc5;
    for (var i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  // 6 hex: gập XOR 32 → 24 bit (cách FNV khuyên dùng khi cần ít bit hơn)
  function hash6(s) {
    var h = fnv1a32(s), v = ((h >>> 24) ^ (h & 0xffffff)) >>> 0;
    return ('000000' + v.toString(16)).slice(-6);
  }

  function bankIdent(title) {
    var t = nfc(title).trim().replace(/\s+/g, ' ');
    var slug = slugAscii(t).slice(0, 40).replace(/_+$/, '');
    return ['nh', slug, hash6(t)].filter(Boolean).join('_');
  }

  /* ===================== Đáp án / điểm ===================== */

  function lamSachDapAn(s) {
    return nfc(s).replace(/\s+/g, ' ').trim();
  }

  // Biến thể đáp án ngắn: thập phân phẩy↔chấm, dấu trừ U+2212↔'-'
  var TRU = '\u{2212}'; // dấu trừ toán học
  function answerVariants(list) {
    if (list == null) return [];
    if (!Array.isArray(list)) list = [list];
    var out = [], seen = {};
    function them(s) {
      if (!s) return;
      var k = s.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(seen, k)) return;
      seen[k] = 1; out.push(s);
    }
    var goc = list.map(lamSachDapAn).filter(Boolean);
    goc.forEach(them); // thứ tự gốc trước
    goc.forEach(function (s) {
      var base = [s];
      if (/\d,\d/.test(s)) base.push(s.replace(/(\d),(?=\d)/g, '$1.'));
      else if (/\d\.\d/.test(s)) base.push(s.replace(/(\d)\.(?=\d)/g, '$1,'));
      base.forEach(function (b) {
        them(b);
        if (b.indexOf(TRU) !== -1) them(b.split(TRU).join('-'));
        else if (b.indexOf('-') !== -1) them(b.split('-').join(TRU));
      });
    });
    return out;
  }

  // '0,25' | '0.25' | '1đ' | '(0,5 điểm)' | 2 → số ≥ 0; sai → null
  function parsePoints(s) {
    if (typeof s === 'number') return (isFinite(s) && s >= 0) ? s : null;
    if (s == null) return null;
    var t = nfc(s).toLowerCase().replace(/\s+/g, ' ').trim()
      .replace(/^[(\[]\s*/, '').replace(/\s*[)\]]$/, '').trim();
    var m = /^(\d+(?:[.,]\d+)?|[.,]\d+)\s*(?:đ|đ\.|điểm|diem|d|pts?|points?|p)?$/.exec(t);
    if (!m) return null;
    var v = parseFloat(m[1].replace(',', '.'));
    return isFinite(v) && v >= 0 ? v : null;
  }

  /* ===================== Issue + kiểm tra câu hỏi ===================== */

  function newIssue(level, msg, qid) {
    var o = { level: level, msg: msg };
    if (qid != null) o.qid = qid;
    return o;
  }

  var LOAI = ['mc', 'ma', 'tf', 'short', 'num', 'blanks', 'dropdowns', 'matching', 'essay', 'text'];
  var RE_BLANK_ID = /^[a-z][a-z0-9_]{0,15}$/;
  var GIOI_HAN_STEM = 15000;

  // Có thẻ HTML thật (<b>, </p>, <br/>, <img src=…>, <!--). "a<b", "x < y", "a<b và b>c" là chữ thuần, KHÔNG phải thẻ
  var RE_THE_HTML = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s*\/?>|\s+[A-Za-z_:][-A-Za-z0-9_:.]*\s*=)|<!--/;
  function coTheHtml(s) { return RE_THE_HTML.test(String(s)); }
  function soLanXuatHien(hay, kim) {
    var n = 0, i = 0;
    if (!kim) return 0;
    while ((i = hay.indexOf(kim, i)) !== -1) { n++; i += kim.length; }
    return n;
  }
  function rong(s) {
    // HTML rỗng: không chữ, không ảnh, không công thức
    var t = String(s == null ? '' : s);
    if (/<(img|math|table|iframe|video|audio|object)\b/i.test(t)) return false;
    return t.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/[\s\u{200B}]+/gu, '') === '';
  }

  function validateQuestion(q) {
    var out = [];
    if (!q || typeof q !== 'object') return [newIssue('error', 'Câu hỏi không hợp lệ')];
    var ten = 'Câu ' + (q.no != null && q.no !== '' ? q.no : (q.title || q.id || '?'));
    var qid = q.id;
    function err(m) { out.push(newIssue('error', ten + ': ' + m, qid)); }
    function warn(m) { out.push(newIssue('warn', ten + ': ' + m, qid)); }

    if (!q.id || !/^[a-z0-9_]+$/.test(q.id)) err('mã câu (id) không hợp lệ: "' + q.id + '"');
    if (LOAI.indexOf(q.type) === -1) { err('loại câu không hỗ trợ: "' + q.type + '"'); return out; }

    // điểm
    if (q.type === 'text') {
      if (q.points != null && !(typeof q.points === 'number' && isFinite(q.points) && q.points >= 0)) err('điểm không hợp lệ');
    } else if (!(typeof q.points === 'number' && isFinite(q.points) && q.points > 0)) {
      err('điểm phải là số lớn hơn 0 (đang là "' + q.points + '")');
    }

    var stem = String(q.stem == null ? '' : q.stem);
    var stim = String(q.stimulus == null ? '' : q.stimulus);
    // Câu điền bài đọc / ngữ âm: cả đề nằm trong đoạn dẫn (stem trống) là hợp lệ khi đoạn dẫn được chèn vào câu;
    // trường hợp xuất với stimulus:'none' do qti.js cảnh báo riêng
    if (rong(stem) && rong(stim) && q.type !== 'text' && !(q.type === 'tf' && Array.isArray(q.statements) && q.statements.length)) {
      warn('nội dung câu hỏi đang trống');
    }
    if (rong(stem) && rong(stim) && q.type === 'text') warn('nội dung đang trống');

    // độ dài (Canvas thay câu > 16 384 ký tự bằng thông báo lỗi)
    if (stem.length > GIOI_HAN_STEM) {
      warn('nội dung dài ' + stem.length + ' ký tự (> ' + GIOI_HAN_STEM + ') — Canvas có thể cắt bỏ; hãy rút gọn hoặc tách câu');
    } else if (stem.length + stim.length > GIOI_HAN_STEM) {
      warn('nội dung kèm đoạn dẫn dài ' + (stem.length + stim.length) + ' ký tự (> ' + GIOI_HAN_STEM +
        ') — chọn "không chèn đoạn dẫn" (stimulus: none) hoặc rút gọn đoạn dẫn');
    }

    var t = q.type;
    if (t === 'mc' || t === 'ma') {
      var ch = Array.isArray(q.choices) ? q.choices : [];
      if (ch.length < 2) err('cần ít nhất 2 phương án (đang có ' + ch.length + ')');
      var dung = ch.filter(function (c) { return c && c.correct === true; }).length;
      if (t === 'mc' && dung === 0) err('chưa xác định đáp án đúng');
      else if (t === 'mc' && dung > 1) err('câu một đáp án nhưng có ' + dung + ' phương án được đánh dấu đúng');
      if (t === 'ma' && dung === 0) err('chưa xác định đáp án đúng (cần ít nhất 1 phương án đúng)');
      var ids = {};
      ch.forEach(function (c, i) {
        if (!c) { err('phương án thứ ' + (i + 1) + ' bị thiếu'); return; }
        var nhan = c.id != null ? c.id : String(i + 1);
        if (ids[nhan]) err('trùng nhãn phương án "' + nhan + '"');
        ids[nhan] = 1;
        if (rong(c.html)) warn('phương án ' + nhan + ' đang trống');
      });
    } else if (t === 'tf') {
      var st = Array.isArray(q.statements) ? q.statements : [];
      if (st.length < 1) err('câu Đúng/Sai chưa có ý nào');
      var keys = {};
      st.forEach(function (s, i) {
        if (!s) { err('ý thứ ' + (i + 1) + ' bị thiếu'); return; }
        var k = s.key != null ? s.key : String(i + 1);
        if (typeof s.value !== 'boolean') err('ý ' + k + ') chưa xác định Đúng hay Sai');
        if (keys[k]) err('trùng ý "' + k + ')"');
        keys[k] = 1;
        if (rong(s.html)) warn('ý ' + k + ') đang trống');
      });
    } else if (t === 'short') {
      var ans = (Array.isArray(q.answers) ? q.answers : []).filter(function (a) { return a != null && String(a).trim() !== ''; });
      if (!ans.length) err('chưa có đáp án (câu trả lời ngắn cần ít nhất 1 cách viết đúng)');
      ans.forEach(function (a) { if (coTheHtml(a)) err('đáp án "' + a + '" chứa thẻ HTML — chỉ dùng chữ thuần'); });
    } else if (t === 'num') {
      var nu = q.numeric;
      var huuHan = function (x) { return typeof x === 'number' && isFinite(x); };
      if (!nu || typeof nu !== 'object') err('chưa có đáp án số');
      else if (nu.exact !== undefined) {
        if (!huuHan(nu.exact)) err('đáp án số không hợp lệ: "' + nu.exact + '"');
        if (nu.margin != null && !(huuHan(nu.margin) && nu.margin >= 0)) err('sai số cho phép không hợp lệ: "' + nu.margin + '"');
      } else if (nu.min !== undefined || nu.max !== undefined) {
        if (!huuHan(nu.min) || !huuHan(nu.max)) err('khoảng đáp án không hợp lệ');
        else if (nu.min > nu.max) err('khoảng đáp án ngược (' + nu.min + ' > ' + nu.max + ')');
      } else err('chưa có đáp án số');
    } else if (t === 'blanks' || t === 'dropdowns') {
      var arr = t === 'blanks' ? q.blanks : q.dropdowns;
      arr = Array.isArray(arr) ? arr : [];
      var ten2 = t === 'blanks' ? 'ô điền' : 'ô chọn';
      if (!arr.length) err('chưa có ' + ten2 + ' nào');
      var bid = {};
      arr.forEach(function (b, i) {
        if (!b) { err(ten2 + ' thứ ' + (i + 1) + ' bị thiếu'); return; }
        var id = String(b.id == null ? '' : b.id);
        if (!RE_BLANK_ID.test(id)) { err('mã ' + ten2 + ' "' + id + '" không hợp lệ (chữ thường, số, _; bắt đầu bằng chữ; ≤ 16 ký tự)'); return; }
        if (bid[id]) err('trùng mã ' + ten2 + ' "' + id + '"');
        bid[id] = 1;
        var n = soLanXuatHien(stem, '[' + id + ']');
        if (n === 0) err('nội dung câu thiếu chỗ đặt [' + id + ']');
        else if (n > 1) err('[' + id + '] xuất hiện ' + n + ' lần trong nội dung (chỉ được 1 lần)');
        if (stim.indexOf('[' + id + ']') !== -1) warn('đoạn dẫn có chuỗi [' + id + '] trùng mã ' + ten2 + ' — khi chèn đoạn dẫn Canvas sẽ đặt ô sai chỗ');
        if (t === 'blanks') {
          var acc = (Array.isArray(b.accepts) ? b.accepts : []).filter(function (a) { return a != null && String(a).trim() !== ''; });
          if (!acc.length) err('ô [' + id + '] chưa có đáp án');
          acc.forEach(function (a) { if (coTheHtml(a)) err('đáp án "' + a + '" của ô [' + id + '] chứa HTML — chỉ dùng chữ thuần'); });
        } else {
          var op = Array.isArray(b.options) ? b.options : [];
          if (op.length < 2) err('ô [' + id + '] cần ít nhất 2 lựa chọn');
          if (!(typeof b.correct === 'number' && b.correct === Math.floor(b.correct) && b.correct >= 0 && b.correct < op.length)) {
            err('ô [' + id + '] chưa xác định lựa chọn đúng');
          }
          var seen = {};
          op.forEach(function (o) {
            var s = String(o == null ? '' : o);
            if (s.trim() === '') err('ô [' + id + '] có lựa chọn trống');
            else if (coTheHtml(s)) err('lựa chọn "' + s + '" của ô [' + id + '] chứa HTML — chỉ dùng chữ thuần');
            var k = s.trim().toLowerCase();
            if (k && seen[k]) warn('ô [' + id + '] có lựa chọn trùng nhau "' + s + '"');
            seen[k] = 1;
          });
        }
      });
    } else if (t === 'matching') {
      var pr = Array.isArray(q.pairs) ? q.pairs : [];
      if (pr.length < 2) err('câu ghép nối cần ít nhất 2 cặp (đang có ' + pr.length + ')');
      pr.forEach(function (p, i) {
        if (!p) { err('cặp thứ ' + (i + 1) + ' bị thiếu'); return; }
        if (rong(p.left)) err('cặp thứ ' + (i + 1) + ' thiếu vế trái');
        var r = String(p.right == null ? '' : p.right);
        if (r.trim() === '') err('cặp thứ ' + (i + 1) + ' thiếu vế phải');
        else if (coTheHtml(r)) err('vế phải "' + r + '" chứa HTML/ảnh — vế phải chỉ được là chữ thuần');
      });
      (Array.isArray(q.distractors) ? q.distractors : []).forEach(function (d) {
        var s = String(d == null ? '' : d);
        if (s.trim() === '') warn('có vế phải gây nhiễu trống');
        else if (coTheHtml(s)) err('vế phải gây nhiễu "' + s + '" chứa HTML/ảnh — chỉ dùng chữ thuần');
      });
    }
    return out;
  }

  /* ===================== CRC32 ===================== */

  var CRC_TABLE = null;
  function crc32(u8, crc) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Int32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[n] = c;
      }
    }
    var x = (crc == null ? 0 : crc) ^ -1;
    for (var i = 0, len = u8.length; i < len; i++) x = CRC_TABLE[(x ^ u8[i]) & 0xff] ^ (x >>> 8);
    return (x ^ -1) >>> 0;
  }

  /* ===================== XML ===================== */

  var THUC_THE = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  var RE_THUC_THE = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z_][A-Za-z0-9._-]*);/g;
  function giaiThucThe(s) {
    if (s.indexOf('&') === -1) return s;
    return s.replace(RE_THUC_THE, function (m, e) {
      if (e.charCodeAt(0) === 35) { // '#'
        var cp = (e.charCodeAt(1) | 32) === 120 ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        if (!(cp >= 1 && cp <= 0x10FFFF) || (cp >= 0xD800 && cp <= 0xDFFF)) return m; // mã sai: giữ nguyên chữ
        return String.fromCodePoint(cp);
      }
      return Object.prototype.hasOwnProperty.call(THUC_THE, e) ? THUC_THE[e] : m; // thực thể lạ: giữ nguyên
    });
  }

  function laKhoangTrang(c) { return c === 32 || c === 9 || c === 10 || c === 13; }

  /*
   * Bộ phân tích XML một lượt (dùng indexOf, không regex lồng nhau).
   * Trả về phần tử gốc; nếu tài liệu không có đúng 1 phần tử gốc → bọc trong {name:'#fragment'}.
   * Chịu lỗi: thẻ đóng lệch, thiếu thẻ đóng, thuộc tính không ngoặc/không giá trị, '<' lẻ.
   */
  function parseXml(str) {
    var s = (str instanceof Uint8Array || str instanceof ArrayBuffer) ? utf8Decode(str) : String(str == null ? '' : str);
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    if (s.indexOf('\r') !== -1) s = s.replace(/\r\n?/g, '\n'); // chuẩn hoá xuống dòng như XML 1.0
    var n = s.length;
    var doc = { type: 'el', name: '#fragment', attrs: {}, children: [] };
    var stack = [doc], cur = doc;
    var i = 0;

    function themText(t) {
      if (!t) return;
      var ch = cur.children, last = ch[ch.length - 1];
      if (last && last.type === 'text') last.text += t; // gộp text liền kề (kể cả CDATA)
      else ch.push({ type: 'text', text: t });
    }

    while (i < n) {
      var lt = s.indexOf('<', i);
      if (lt === -1) lt = n;
      if (lt > i) themText(giaiThucThe(s.slice(i, lt)));
      if (lt >= n) break;
      var c = s.charCodeAt(lt + 1);

      if (c === 47) { // '</'
        var gt = s.indexOf('>', lt + 2);
        if (gt === -1) { themText(s.slice(lt)); break; }
        var ten = s.slice(lt + 2, gt).trim();
        // tìm thẻ mở gần nhất cùng tên; không có thì bỏ qua thẻ đóng lạc
        for (var k = stack.length - 1; k > 0; k--) {
          if (stack[k].name === ten) { stack.length = k; cur = stack[k - 1]; break; }
        }
        i = gt + 1;
      } else if (c === 33) { // '<!'
        if (s.startsWith('<!--', lt)) {
          var e1 = s.indexOf('-->', lt + 4);
          i = e1 === -1 ? n : e1 + 3;
        } else if (s.startsWith('<![CDATA[', lt)) {
          var e2 = s.indexOf(']]>', lt + 9);
          if (e2 === -1) { themText(s.slice(lt + 9)); i = n; } else { themText(s.slice(lt + 9, e2)); i = e2 + 3; }
        } else { // DOCTYPE / khai báo khác: bỏ qua, tính cả phần [...] bên trong
          var j = lt + 2, sau = 0, q = 0;
          for (; j < n; j++) {
            var cj = s.charCodeAt(j);
            if (q) { if (cj === q) q = 0; }
            else if (cj === 34 || cj === 39) q = cj;
            else if (cj === 60 && s.startsWith('<!--', j)) { var ec = s.indexOf('-->', j + 4); j = ec === -1 ? n : ec + 2; }
            else if (cj === 91) sau++;
            else if (cj === 93) { if (sau) sau--; }
            else if (cj === 62 && !sau) break;
          }
          i = j + 1;
        }
      } else if (c === 63) { // '<?' PI / khai báo xml
        var e3 = s.indexOf('?>', lt + 2);
        i = e3 === -1 ? n : e3 + 2;
      } else {
        // thẻ mở
        var p = lt + 1;
        while (p < n) {
          var cp = s.charCodeAt(p);
          if (laKhoangTrang(cp) || cp === 62 || cp === 47) break;
          p++;
        }
        var name = s.slice(lt + 1, p);
        if (!name || !/^[A-Za-z_:\x80-\u{10FFFF}]/u.test(name)) { themText('<'); i = lt + 1; continue; } // '<' lẻ trong văn bản
        var attrs = {}, tuDong = false, xong = false;
        while (p < n) {
          var a = s.charCodeAt(p);
          if (laKhoangTrang(a)) { p++; continue; }
          if (a === 62) { p++; xong = true; break; }
          if (a === 47) {
            if (s.charCodeAt(p + 1) === 62) { tuDong = true; p += 2; xong = true; break; }
            p++; continue;
          }
          // tên thuộc tính
          var an = p;
          while (p < n) {
            var b = s.charCodeAt(p);
            if (laKhoangTrang(b) || b === 61 || b === 62 || b === 47) break;
            p++;
          }
          var aten = s.slice(an, p);
          while (p < n && laKhoangTrang(s.charCodeAt(p))) p++;
          var val = '';
          if (s.charCodeAt(p) === 61) { // '='
            p++;
            while (p < n && laKhoangTrang(s.charCodeAt(p))) p++;
            var qc = s.charCodeAt(p);
            if (qc === 34 || qc === 39) {
              var e4 = s.indexOf(qc === 34 ? '"' : "'", p + 1);
              if (e4 === -1) e4 = n;
              val = s.slice(p + 1, e4);
              p = e4 + 1;
            } else {
              var vs = p;
              while (p < n) {
                var d = s.charCodeAt(p);
                if (laKhoangTrang(d) || d === 62) break;
                if (d === 47 && s.charCodeAt(p + 1) === 62) break;
                p++;
              }
              val = s.slice(vs, p);
            }
            // chuẩn hoá giá trị thuộc tính: tab/xuống dòng thật → dấu cách (ký tự tham chiếu giữ nguyên)
            if (/[\t\n]/.test(val)) val = val.replace(/[\t\n]/g, ' ');
            val = giaiThucThe(val);
          }
          if (aten && aten !== '__proto__') attrs[aten] = val;
        }
        var el = { type: 'el', name: name, attrs: attrs, children: [] };
        cur.children.push(el);
        if (!tuDong && xong) { stack.push(el); cur = el; }
        i = p;
      }
    }
    // chỉ có 1 phần tử gốc (bỏ qua khoảng trắng quanh nó) → trả về phần tử đó
    var els = 0, goc = null, chuKhac = false;
    for (var z = 0; z < doc.children.length; z++) {
      var ch = doc.children[z];
      if (ch.type === 'el') { els++; goc = ch; }
      else if (/\S/.test(ch.text)) chuKhac = true;
    }
    return (els === 1 && !chuKhac) ? goc : doc;
  }

  // Ghi cây về chuỗi XML (vòng tròn với parseXml). opts.decl: thêm khai báo <?xml?>
  function toXml(node, opts) {
    var out = [];
    if (opts && opts.decl) out.push('<?xml version="1.0" encoding="UTF-8"?>');
    (function ghi(nd) {
      if (!nd) return;
      if (nd.type === 'text') { out.push(escXml(nd.text)); return; }
      if (Array.isArray(nd)) { nd.forEach(ghi); return; }
      var kids = nd.children || [];
      if (nd.name === '#fragment' || nd.name === '#document') { kids.forEach(ghi); return; }
      var h = '<' + nd.name, at = nd.attrs || {};
      for (var k in at) if (Object.prototype.hasOwnProperty.call(at, k)) h += ' ' + k + '="' + escAttr(at[k]) + '"';
      if (!kids.length) { out.push(h + '/>'); return; }
      out.push(h + '>');
      for (var i = 0; i < kids.length; i++) ghi(kids[i]);
      out.push('</' + nd.name + '>');
    })(node);
    return out.join('');
  }

  function xmlText(node) {
    if (!node) return '';
    if (node.type === 'text') return node.text;
    var out = [], st = [node];
    while (st.length) {
      var x = st.pop();
      if (x.type === 'text') { out.push(x.text); continue; }
      var ch = x.children;
      if (ch) for (var i = ch.length - 1; i >= 0; i--) st.push(ch[i]);
    }
    return out.join('');
  }

  function khop(name) {
    if (typeof name === 'function') return name;
    if (name == null || name === '*') return function () { return true; };
    if (Array.isArray(name)) return function (el) { return name.indexOf(el.name) !== -1; };
    return function (el) { return el.name === name; };
  }

  // Duyệt hậu duệ (KHÔNG tính chính node) theo thứ tự tài liệu
  function findAll(node, name) {
    var f = khop(name), out = [];
    if (!node || !node.children) return out;
    var st = [];
    for (var i = node.children.length - 1; i >= 0; i--) st.push(node.children[i]);
    while (st.length) {
      var x = st.pop();
      if (x.type !== 'el') continue;
      if (f(x)) out.push(x);
      var ch = x.children;
      for (var j = ch.length - 1; j >= 0; j--) st.push(ch[j]);
    }
    return out;
  }

  function find(node, name) {
    var f = khop(name);
    if (!node || !node.children) return null;
    var st = [];
    for (var i = node.children.length - 1; i >= 0; i--) st.push(node.children[i]);
    while (st.length) {
      var x = st.pop();
      if (x.type !== 'el') continue;
      if (f(x)) return x;
      var ch = x.children;
      for (var j = ch.length - 1; j >= 0; j--) st.push(ch[j]);
    }
    return null;
  }

  // Con trực tiếp là phần tử (lọc theo tên nếu có)
  function children(node, name) {
    if (!node || !node.children) return [];
    var f = khop(name);
    return node.children.filter(function (x) { return x.type === 'el' && f(x); });
  }

  function attr(node, name, def) {
    return (node && node.attrs && Object.prototype.hasOwnProperty.call(node.attrs, name)) ? node.attrs[name] : def;
  }

  return {
    parseXml: parseXml, toXml: toXml, xmlText: xmlText,
    find: find, findAll: findAll, children: children, attr: attr,
    escXml: escXml, escAttr: escAttr, escHtml: escHtml, nfc: nfc,
    slugAscii: slugAscii, hash6: hash6, bankIdent: bankIdent,
    answerVariants: answerVariants, parsePoints: parsePoints,
    newIssue: newIssue, validateQuestion: validateQuestion, looksLikeHtml: coTheHtml,
    utf8Encode: utf8Encode, utf8Decode: utf8Decode, crc32: crc32,
    QUESTION_TYPES: LOAI.slice(), STEM_LIMIT: GIOI_HAN_STEM
  };
});
