/* js/qti.js — xuất gói QTI 1.2 cho Canvas: Question Bank (Classic) hoặc Item Bank (New Quizzes)
 * Mọi template XML khớp docs/nghien-cuu/reconciled.md §1–§4 (thứ tự phần tử, ident, Set/Add, <or> số, texttype…). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.qti = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var laNode = typeof module === 'object' && module.exports && typeof require === 'function';
  var core = laNode ? require('./core.js') : root.NH.core;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ===================== Module phụ thuộc tuỳ chọn (html, math, zip) ===================== */

  var _ghiDe = {}; // test tiêm module giả: _setDeps({html, math, zip}); null = coi như thiếu
  var _daNap = {};
  function layModule(ten) {
    if (has(_ghiDe, ten)) return _ghiDe[ten];
    if (has(_daNap, ten)) return _daNap[ten];
    var m = null;
    try { if (laNode) m = require('./' + ten + '.js'); } catch (e) { m = null; }
    if (!m) {
      var g = (typeof globalThis !== 'undefined' && globalThis.NH) || (root && root.NH);
      if (g && g[ten]) m = g[ten];
    }
    if (m || laNode) _daNap[ten] = m; // trình duyệt: chỉ nhớ khi đã có (script có thể nạp sau)
    return m;
  }
  function _setDeps(d) {
    if (!d) { _ghiDe = {}; _daNap = {}; return; }
    for (var k in d) if (has(d, k)) { if (d[k] === undefined) delete _ghiDe[k]; else _ghiDe[k] = d[k]; }
  }

  /* ===================== Hằng ===================== */

  var LOAI = ['mc', 'ma', 'tf', 'short', 'num', 'blanks', 'dropdowns', 'matching', 'essay', 'text'];
  var RE_IDENT = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
  var RE_TEN_ANH = /^[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)$/;
  var GIOI_HAN_STEM = core.STEM_LIMIT || 15000;
  var DUNG = 'Đúng', SAI = 'Sai';

  var NS_QTI = {
    xmlns: 'http://www.imsglobal.org/xsd/ims_qtiasiv1p2',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd'
  };
  var NS_MANIFEST = {
    xmlns: 'http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1',
    'xmlns:lom': 'http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource',
    'xmlns:imsmd': 'http://www.imsglobal.org/xsd/imsmd_v1p2',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd ' +
      'http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd ' +
      'http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd'
  };
  var NS_CCC = {
    xmlns: 'http://canvas.instructure.com/xsd/cccv1p0',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'xsi:schemaLocation': 'http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd'
  };
  var LOR = 'associatedcontent/imscc_xmlv1p1/learning-application-resource';

  // Khung đoạn dẫn (chỉ thuộc tính CSS có trong allowlist Canvas: border*, background-color, padding, margin)
  var STYLE_DOAN_DAN = 'border:1px solid #c5cbe0;border-left:4px solid #23328c;border-radius:6px;' +
    'background-color:#f6f8fc;padding:10px 14px;margin:0 0 12px 0';

  /* ===================== Bộ dựng XML nhỏ (thụt lề 2, giữ thứ tự thuộc tính) ===================== */

  function E(n, a, k) { return { n: n, a: a || null, k: k || null }; }            // phần tử có con
  function T(n, a, t) { return { n: n, a: a || null, t: t == null ? '' : String(t) }; } // phần tử chỉ chứa chữ

  function ghiNode(node, out, thut) {
    var mo = '<' + node.n;
    if (node.a) for (var k in node.a) if (has(node.a, k) && node.a[k] != null) mo += ' ' + k + '="' + core.escAttr(core.nfc(node.a[k])) + '"';
    if (node.t !== undefined) { out.push(thut + mo + '>' + core.escXml(core.nfc(node.t)) + '</' + node.n + '>'); return; }
    if (!node.k || !node.k.length) { out.push(thut + mo + '/>'); return; }
    out.push(thut + mo + '>');
    for (var i = 0; i < node.k.length; i++) ghiNode(node.k[i], out, thut + '  ');
    out.push(thut + '</' + node.n + '>');
  }
  function taiLieu(goc) {
    var out = ['<?xml version="1.0" encoding="UTF-8"?>'];
    ghiNode(goc, out, '');
    return out.join('\n') + '\n';
  }
  function gop(a, b) { var o = {}, k; for (k in a) if (has(a, k)) o[k] = a[k]; for (k in b) if (has(b, k)) o[k] = b[k]; return o; }

  /* ===================== Tiện ích chuỗi / số ===================== */

  function nfc(s) { return core.nfc(s); }
  // Số → chuỗi thập phân dấu chấm, không ký hiệu mũ
  function fmtSo(x) {
    x = Number(x);
    if (!isFinite(x)) return '0';
    if (Object.is(x, -0)) x = 0;
    var s = String(x);
    if (/e/i.test(s)) s = x.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function soLe(x) { var s = fmtSo(x), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  function lam4(x) { return Math.round(x * 10000) / 10000; }
  function pct(n) { return (100 / n).toFixed(2); } // "%.2f" % (100/n)
  function pad2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }

  // Có thẻ HTML thật (cùng luật core.looksLikeHtml: "a<b", "x < y" là chữ thuần) / thực thể → phải coi là HTML
  var RE_THE = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s*\/?>|\s+[A-Za-z_:][-A-Za-z0-9_:.]*\s*=)|<!--/;
  function coThe(s) { return core.looksLikeHtml ? core.looksLikeHtml(s) : RE_THE.test(String(s)); }
  function coMarkup(s) { s = String(s); return coThe(s) || /&(#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.test(s); }
  function rongHtml(s) {
    var t = String(s == null ? '' : s);
    if (/<(img|math|table|iframe|video|audio|object)\b/i.test(t)) return false;
    return t.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/[\s\u{200B}]+/gu, '') === '';
  }
  var TT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0' };
  function giaiThucThe(s) {
    return String(s).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        var cp = /^#[xX]/.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return (cp > 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) ? String.fromCodePoint(cp) : m;
      }
      return has(TT, e) ? TT[e] : m;
    });
  }
  // Ý Đúng/Sai có thẻ khối thì không bọc trong <p> được (HTML tự đóng <p> → nhãn a) tách khỏi nội dung)
  var RE_KHOI = /<(p|div|table|ul|ol|h[1-6]|blockquote|pre|figure|hr)\b/i;
  function laKhoi(h) { return RE_KHOI.test(String(h)); }
  function dongY(h) { return laKhoi(h) ? '<div>' + h + '</div>' : '<p>' + h + '</p>'; }
  // Bỏ một lớp <p>…</p> bọc ngoài (để ý Đúng/Sai nằm cùng dòng với nhãn a))
  function boBocP(h) {
    h = String(h == null ? '' : h).trim();
    var m = /^<p\b[^>]*>([\s\S]*)<\/p>$/i.exec(h);
    return (m && !/<\/?p\b/i.test(m[1])) ? m[1].trim() : h;
  }
  // Chuỗi ASCII an toàn cho tên file (giữ hoa thường)
  function tenAscii(s, macDinh) {
    var t = nfc(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60).replace(/_+$/, '');
    return t || macDinh || 'ngan_hang';
  }

  /* ===================== Ô chữ thuần (dropdown, ô điền, vế phải ghép nối, trả lời ngắn) ===================== */

  // Trả về chữ thuần; nếu không chuyển được (ảnh / công thức khi thiếu html.js) → giữ nguyên để bước kiểm tra báo lỗi
  function chuThuan(s, dem) {
    if (s == null) return s;
    var goc = nfc(String(s));
    if (!coThe(goc)) return goc;
    if (/<img\b/i.test(goc)) return goc;
    var h = layModule('html'), t = null;
    if (h && typeof h.toPlainText === 'function') {
      try { t = h.toPlainText(goc); } catch (e) { t = null; }
    }
    if (t == null) {
      if (/<math\b/i.test(goc)) return goc;
      t = giaiThucThe(goc.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''));
    }
    t = nfc(String(t)).replace(/\s+/g, ' ').trim();
    if (coThe(t)) return goc;
    if (dem) dem.n++;
    return t;
  }

  /* ===================== Ảnh ===================== */

  var RE_IMG = /<img\b[^>]*>/gi;
  function layThuocTinh(the, ten) {
    var m = new RegExp('\\s' + ten + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(the);
    if (!m) return null;
    return giaiThucThe(m[1] != null ? m[1] : (m[2] != null ? m[2] : m[3]));
  }
  function laEquationImage(the, src) {
    return /^\/equation_images\//.test(src) && /\bequation_image\b/.test(layThuocTinh(the, 'class') || '');
  }
  // không dùng instanceof (mảng có thể đến từ realm khác: iframe, vm)
  function laAB(x) { return Object.prototype.toString.call(x) === '[object ArrayBuffer]'; }
  function laBytes(x) { return !!x && (laAB(x) || (ArrayBuffer.isView(x) && typeof x.byteLength === 'number')); }
  function bytesCua(x) {
    if (laAB(x)) return new Uint8Array(x);
    if (x && x.BYTES_PER_ELEMENT === 1 && typeof x.subarray === 'function') return x;
    return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  }
  function bangNhau(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Kiểm tra mọi <img> trong các mảnh HTML → [{level, msg}]
  function kiemTraAnh(manh, images) {
    var out = [], daBao = {};
    function bao(level, msg) { if (!daBao[msg]) { daBao[msg] = 1; out.push({ level: level, msg: msg }); } }
    manh.forEach(function (h) {
      if (h == null) return;
      var tags = String(h).match(RE_IMG) || [];
      tags.forEach(function (the) {
        var src = layThuocTinh(the, 'src');
        if (src == null || !src.trim()) { bao('error', 'có ảnh thiếu đường dẫn (src)'); return; }
        src = src.trim();
        if (/^data:/i.test(src)) { bao('error', 'có ảnh nhúng dạng data: URI — Canvas sẽ xoá; cần tách thành file ảnh'); return; }
        if (laEquationImage(the, src)) return;
        if (/^https?:\/\//i.test(src)) { bao('warn', 'ảnh lấy từ Internet (' + src.slice(0, 80) + ') — học sinh cần mạng và trang đó phải còn'); return; }
        var m = /^images\/(.+)$/.exec(src);
        if (!m) { bao('error', 'ảnh "' + src + '" không nằm trong gói (đường dẫn phải là images/<tên>)'); return; }
        var ten = m[1];
        if (!images || !has(images, ten)) { bao('error', 'thiếu file ảnh "' + ten + '"'); return; }
        if (!RE_TEN_ANH.test(ten)) { bao('error', 'tên ảnh "' + ten + '" không hợp lệ (chỉ a-z, 0-9, _ -, đuôi png/jpg/gif)'); return; }
        if (!laBytes(images[ten])) bao('error', 'dữ liệu ảnh "' + ten + '" bị hỏng');
      });
    });
    return out;
  }

  // Kho ảnh của một gói: tên trong zip → bytes; tự đổi tên khi hai ngân hàng trùng tên mà khác nội dung
  function taoKhoAnh() { return { tep: {}, ds: [] }; }
  function dungAnh(ctx, ten) {
    if (has(ctx.mapAnh, ten)) return ctx.mapAnh[ten];
    var bytes = bytesCua(ctx.images[ten]), kho = ctx.khoAnh, cuoi = ten, n = 1;
    while (has(kho.tep, cuoi) && !bangNhau(kho.tep[cuoi], bytes)) {
      n++;
      cuoi = ten.replace(/(\.[a-z]+)$/, '_' + n + '$1');
    }
    if (!has(kho.tep, cuoi)) { kho.tep[cuoi] = bytes; kho.ds.push(cuoi); }
    ctx.mapAnh[ten] = cuoi;
    return cuoi;
  }
  // Ghi lại src="images/<tên>" theo tên cuối trong zip (đồng thời đăng ký ảnh vào gói)
  function doiTenAnh(html, ctx) {
    if (!html || String(html).indexOf('<img') === -1) return html;
    return String(html).replace(RE_IMG, function (the) {
      return the.replace(/(\ssrc\s*=\s*)(["'])images\/([^"']+)\2/i, function (m, a, q, ten) {
        if (!has(ctx.images, ten)) return m;
        return a + q + 'images/' + dungAnh(ctx, ten) + q;
      });
    });
  }

  /* ===================== Công thức → ảnh equation_image (opts.math = 'image') ===================== */

  function congThucThanhAnh(html, dem) {
    if (!html || !/<math\b/i.test(html)) return html;
    var m = layModule('math');
    return String(html).replace(/<math\b[^>]*>[\s\S]*?<\/math\s*>/gi, function (mm) {
      var tex = null;
      try { if (m && typeof m.mathmlToLatex === 'function') tex = m.mathmlToLatex(mm); } catch (e) { tex = null; }
      if (typeof tex !== 'string' || !tex.trim()) { dem.loi++; return mm; }
      tex = nfc(tex).trim();
      var url;
      try { url = encodeURIComponent(encodeURIComponent(tex)); } catch (e2) { dem.loi++; return mm; }
      var a = core.escHtml(tex);
      dem.ok++;
      // reconciled §4 — front-end Canvas giải mã đường dẫn 2 lần
      return '<img class="equation_image" title="' + a + '" src="/equation_images/' + url +
        '?scale=1" alt="LaTeX: ' + a + '" data-equation-content="' + a + '">';
    });
  }

  /* ===================== Mảnh XML dùng chung cho item ===================== */

  function truongMeta(nhan, gt) { return E('qtimetadatafield', null, [T('fieldlabel', null, nhan), T('fieldentry', null, gt)]); }
  function matHtml(h) { return E('material', null, [T('mattext', { texttype: 'text/html' }, h)]); }
  function matText(s) { return E('material', null, [T('mattext', { texttype: 'text/plain' }, s)]); }
  function matTuChon(h) { return coMarkup(h) ? matHtml(h) : matText(h); } // html_mat_text của Canvas
  function nhanLa(id, mat) { return E('response_label', { ident: String(id) }, [mat]); }
  function outcomes() { return E('outcomes', null, [E('decvar', { maxvalue: '100', minvalue: '0', varname: 'SCORE', vartype: 'Decimal' })]); }
  function fbCond() {
    return E('respcondition', { 'continue': 'Yes' }, [E('conditionvar', null, [E('other')]),
      E('displayfeedback', { feedbacktype: 'Response', linkrefid: 'general_fb' })]);
  }
  function fbBlock(h) { return E('itemfeedback', { ident: 'general_fb' }, [E('flow_mat', null, [matHtml(h)])]); }
  function setDiem() { return T('setvar', { action: 'Set', varname: 'SCORE' }, '100'); }
  function addDiem(p) { return T('setvar', { varname: 'SCORE', action: 'Add' }, p); }
  function veq(resp, v) { return T('varequal', { respident: resp }, String(v)); }

  // item@ident,title → itemmetadata → presentation (stem trước) → resprocessing → itemfeedback
  function dungItem(sp) {
    var kids = [
      E('itemmetadata', null, [E('qtimetadata', null, [
        truongMeta('question_type', sp.loai),
        truongMeta('points_possible', fmtSo(sp.diem)),
        truongMeta('original_answer_ids', (sp.ids || []).join(','))
      ])]),
      E('presentation', null, [matHtml('<div>' + sp.stem + '</div>')].concat(sp.tuongTac || []))
    ];
    if (sp.cham) {
      var fb = sp.fb && !rongHtml(sp.fb) ? sp.fb : '';
      kids.push(E('resprocessing', null, [outcomes()].concat(fb ? [fbCond()] : [], sp.cham)));
      if (fb) kids.push(fbBlock(fb));
    }
    return E('item', { ident: sp.ident, title: sp.title }, kids);
  }

  /* ===================== Dựng từng loại (reconciled §2.1–§2.10) ===================== */

  // mc / tf-tách: §2.1
  function itemMc(sp, choices, base) {
    var ids = choices.map(function (c, i) { return base + i + 1; });
    var dung = -1;
    choices.forEach(function (c, i) { if (c.correct === true && dung < 0) dung = i; });
    sp.loai = 'multiple_choice_question';
    sp.ids = ids;
    sp.tuongTac = [E('response_lid', { ident: 'response1', rcardinality: 'Single' }, [E('render_choice', null,
      choices.map(function (c, i) { return nhanLa(ids[i], matTuChon(c.html)); }))])];
    sp.cham = [E('respcondition', { 'continue': 'No' }, [E('conditionvar', null, [veq('response1', ids[dung])]), setDiem()])];
    return dungItem(sp);
  }

  // ma: §2.3 — <and> + <not>
  function itemMa(sp, choices, base) {
    var ids = choices.map(function (c, i) { return base + i + 1; });
    sp.loai = 'multiple_answers_question';
    sp.ids = ids;
    sp.tuongTac = [E('response_lid', { ident: 'response1', rcardinality: 'Multiple' }, [E('render_choice', null,
      choices.map(function (c, i) { return nhanLa(ids[i], matTuChon(c.html)); }))])];
    sp.cham = [E('respcondition', { 'continue': 'No' }, [E('conditionvar', null, [E('and', null,
      choices.map(function (c, i) { return c.correct === true ? veq('response1', ids[i]) : E('not', null, [veq('response1', ids[i])]); }))]),
      setDiem()])];
    return dungItem(sp);
  }

  // short: §2.4 — mỗi cách viết một varequal anh em, không <or>
  function itemShort(sp, answers, base) {
    sp.loai = 'short_answer_question';
    sp.ids = answers.map(function (a, i) { return base + i + 1; });
    sp.tuongTac = [E('response_str', { ident: 'response1', rcardinality: 'Single' }, [E('render_fib', null,
      [E('response_label', { ident: 'answer1', rshuffle: 'No' })])])];
    sp.cham = [E('respcondition', { 'continue': 'No' }, [E('conditionvar', null,
      answers.map(function (a) { return veq('response1', a); })), setDiem()])];
    return dungItem(sp);
  }

  // num: §2.8 — luôn có <or> với đáp án đúng; khoảng dùng vargte/varlte
  function itemNum(sp, nu, base) {
    sp.loai = 'numerical_question';
    sp.ids = [base + 1];
    sp.tuongTac = [E('response_str', { ident: 'response1', rcardinality: 'Single' }, [E('render_fib', { fibtype: 'Decimal' },
      [E('response_label', { ident: 'answer1' })])])];
    var cv;
    if (nu.exact !== undefined) {
      var margin = (typeof nu.margin === 'number' && nu.margin > 0) ? nu.margin : 0;
      var or = [veq('response1', fmtSo(nu.exact))];
      if (margin > 0) {
        var d = Math.max(soLe(nu.exact), soLe(margin));
        or.push(E('and', null, [
          T('vargte', { respident: 'response1' }, fmtSo(parseFloat((nu.exact - margin).toFixed(d)))),
          T('varlte', { respident: 'response1' }, fmtSo(parseFloat((nu.exact + margin).toFixed(d))))
        ]));
      }
      cv = [E('or', null, or)];
    } else {
      cv = [T('vargte', { respident: 'response1' }, fmtSo(nu.min)), T('varlte', { respident: 'response1' }, fmtSo(nu.max))];
    }
    sp.cham = [E('respcondition', { 'continue': 'No' }, [E('conditionvar', null, cv), setDiem()])];
    return dungItem(sp);
  }

  // blanks §2.5 / dropdowns §2.6 — mỗi ô một response_lid "response_<id>", chấm bằng Add
  function itemO(sp, loai, oList, base) {
    // oList: [{id, options:[text], correct: idx}] (blanks: correct = 0, mọi lựa chọn là đáp án đúng)
    var k = 0, ids = [], lids = [], cham = [], p = pct(oList.length);
    oList.forEach(function (o) {
      var lab = o.options.map(function (t) { k++; ids.push(base + k); return { id: base + k, t: t }; });
      lids.push(E('response_lid', { ident: 'response_' + o.id, rcardinality: 'Single' }, [
        E('material', null, [T('mattext', null, o.id)]),
        E('render_choice', null, lab.map(function (l) { return nhanLa(l.id, matText(l.t)); }))
      ]));
      cham.push(E('respcondition', null, [E('conditionvar', null, [veq('response_' + o.id, lab[o.correct].id)]), addDiem(p)]));
    });
    sp.loai = loai;
    sp.ids = ids;
    sp.tuongTac = lids;
    sp.cham = cham;
    return dungItem(sp);
  }

  // matching §2.7 — danh sách vế phải (kể cả nhiễu) giống hệt nhau ở mọi lid; ident vế phải có dãy số riêng
  function itemMatching(sp, pairs, distractors, NN) {
    var phai = [], viTri = {};
    function themPhai(t) { if (!has(viTri, t)) { viTri[t] = phai.length; phai.push(t); } }
    pairs.forEach(function (p) { themPhai(p.right); });
    distractors.forEach(themPhai);
    // xếp vế phải theo bảng chữ cái để thứ tự không lộ đáp án
    var xep = phai.slice().sort(function (a, b) { return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0); });
    var lon = pairs.length > 49 || xep.length > 49;
    var base = lon ? NN * 10000 : NN * 100, lech = lon ? 5000 : 50;
    var idPhai = {};
    xep.forEach(function (t, i) { idPhai[t] = base + lech + i + 1; });
    var leftIds = pairs.map(function (p, i) { return base + i + 1; });
    var p = pct(pairs.length);
    sp.loai = 'matching_question';
    sp.ids = leftIds;
    sp.tuongTac = pairs.map(function (pr, i) {
      return E('response_lid', { ident: 'response_' + leftIds[i], rcardinality: 'Single' }, [
        matTuChon(pr.left),
        E('render_choice', null, xep.map(function (t) { return nhanLa(idPhai[t], matText(t)); }))
      ]);
    });
    sp.cham = pairs.map(function (pr, i) {
      return E('respcondition', null, [E('conditionvar', null, [veq('response_' + leftIds[i], idPhai[pr.right])]), addDiem(p)]);
    });
    return dungItem(sp);
  }

  // essay §2.9
  function itemEssay(sp) {
    sp.loai = 'essay_question';
    sp.ids = [];
    sp.tuongTac = [E('response_str', { ident: 'response1', rcardinality: 'Single' }, [E('render_fib', null,
      [E('response_label', { ident: 'answer1', rshuffle: 'No' })])])];
    sp.cham = [E('respcondition', { 'continue': 'No' }, [E('conditionvar', null, [E('other')])])];
    return dungItem(sp);
  }

  // text §2.10 — không resprocessing, điểm 0
  function itemText(sp) {
    sp.loai = 'text_only_question';
    sp.ids = [];
    sp.diem = 0;
    sp.tuongTac = [];
    sp.cham = null;
    return dungItem(sp);
  }

  /* ===================== Chuẩn bị một câu ===================== */

  function tieuDe(q, idx, opts) {
    var goc = nfc(q.title != null && String(q.title).trim() !== '' ? q.title
      : 'Câu ' + (q.no != null && q.no !== '' ? q.no : (idx + 1))).replace(/\s+/g, ' ').trim();
    if (opts.numberInTitle) return goc.slice(0, 200);
    // không đánh số: trích đầu nội dung câu (+ mức độ nếu có)
    var trich = chuThuan(String(q.stem || '').replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, ' '), null);
    trich = coThe(trich) ? '' : String(trich || '').replace(/\s+/g, ' ').trim();
    if (!trich) return goc.slice(0, 200);
    if (trich.length > 80) trich = trich.slice(0, 79).replace(/\s+\S*$/, '') + '…';
    var lv = q.meta && q.meta.level ? ' [' + q.meta.level + ']' : '';
    return (trich + lv).slice(0, 200);
  }

  function nhanY(s, i) {
    var k = s && s.key != null && String(s.key).trim() !== '' ? String(s.key).trim() : String.fromCharCode(97 + (i % 26));
    return k.replace(/\)$/, '');
  }

  // Bản sao câu với các ô chữ thuần đã chuyển, đoạn dẫn/lời giải theo opts
  function saoCau(q, opts, dem) {
    var c = {}, k;
    for (k in q) if (has(q, k)) c[k] = q[k];
    c.stimulus = opts.stimulus === 'each' ? (q.stimulus || '') : '';
    c.feedback = (opts.includeFeedback && q.type !== 'text') ? (q.feedback || '') : '';
    if (q.type === 'short' && Array.isArray(q.answers)) c.answers = q.answers.map(function (a) { return chuThuan(a, dem); });
    if (q.type === 'blanks' && Array.isArray(q.blanks)) {
      c.blanks = q.blanks.map(function (b) {
        if (!b) return b;
        var o = gop(b, {});
        if (Array.isArray(b.accepts)) o.accepts = b.accepts.map(function (a) { return chuThuan(a, dem); });
        return o;
      });
    }
    if (q.type === 'dropdowns' && Array.isArray(q.dropdowns)) {
      c.dropdowns = q.dropdowns.map(function (b) {
        if (!b) return b;
        var o = gop(b, {});
        if (Array.isArray(b.options)) o.options = b.options.map(function (a) { return chuThuan(a, dem); });
        return o;
      });
    }
    if (q.type === 'matching') {
      if (Array.isArray(q.pairs)) c.pairs = q.pairs.map(function (p) { return p ? gop(p, { right: chuThuan(p.right, dem) }) : p; });
      if (Array.isArray(q.distractors)) c.distractors = q.distractors.map(function (d) { return chuThuan(d, dem); });
    }
    return c;
  }

  function manhHtml(c) {
    var m = [c.stem, c.stimulus, c.feedback];
    (Array.isArray(c.choices) ? c.choices : []).forEach(function (x) { if (x) m.push(x.html); });
    (Array.isArray(c.statements) ? c.statements : []).forEach(function (x) { if (x) m.push(x.html); });
    (Array.isArray(c.pairs) ? c.pairs : []).forEach(function (x) { if (x) m.push(x.left); });
    return m;
  }

  // → { skip, issues, items:[node], diem, soItem }
  function chuanBiCau(q, idx, ctx) {
    var opts = ctx.opts, out = { skip: false, issues: [], items: [], diem: 0 };
    var ten = 'Câu ' + (q && q.no != null && q.no !== '' ? q.no : (idx + 1));
    function iss(level, msg) { out.issues.push(vanDe(level, ten + ': ' + msg, q && q.id, ctx.bankTitle)); }
    if (!q || typeof q !== 'object') { out.skip = true; iss('error', 'dữ liệu câu hỏi không hợp lệ'); return out; }

    // 1. ô chữ thuần
    var dem = { n: 0 };
    var c = saoCau(q, opts, dem);
    if (dem.n) iss('info', 'đã chuyển ' + dem.n + ' lựa chọn/đáp án có định dạng sang chữ thuần (Canvas chỉ hiện chữ thuần ở ô chọn, ô điền, vế phải ghép nối)');

    // 2. kiểm tra (§5.3): lỗi của core + ảnh
    core.validateQuestion(c).forEach(function (e) {
      if (e.level === 'error') out.issues.push(vanDe('error', e.msg, e.qid != null ? e.qid : q.id, ctx.bankTitle));
    });
    kiemTraAnh(manhHtml(c), ctx.images).forEach(function (e) { iss(e.level, e.msg); });
    if (out.issues.some(function (e) { return e.level === 'error'; })) { out.skip = true; return out; }

    // 3. dựng
    var NN = idx + 1, base = NN * 100, ident = ctx.bankIdent + '_q' + pad2(NN);
    var title = tieuDe(c, idx, opts);
    var demCT = { ok: 0, loi: 0 };
    function cuoi(h) {
      h = h == null ? '' : nfc(String(h));
      if (opts.math === 'image') h = congThucThanhAnh(h, demCT);
      return doiTenAnh(h, ctx);
    }
    var stim = (c.stimulus && !rongHtml(c.stimulus)) ? c.stimulus : '';
    // lời giải dựng sau stem + phương án (để thứ tự ảnh trong gói theo thứ tự xuất hiện)
    var fbDaDung = null;
    function layFb() {
      if (fbDaDung === null) fbDaDung = (c.type !== 'text' && c.feedback && !rongHtml(c.feedback)) ? cuoi(c.feedback) : '';
      return fbDaDung;
    }
    var daBaoDai = false;
    function stemDu(noi) {
      var h = (stim ? '<div style="' + STYLE_DOAN_DAN + '">' + stim + '</div>' : '') + (noi || '');
      h = cuoi(h);
      var dai = h.length + 11; // + <div></div>
      if (dai > GIOI_HAN_STEM && !daBaoDai) {
        daBaoDai = true;
        iss('warn', 'nội dung dài ' + dai + ' ký tự (> ' + GIOI_HAN_STEM + ') — Canvas thay câu quá 16 384 ký tự bằng thông báo lỗi; ' +
          (stim ? 'hãy chọn "không chèn đoạn dẫn" hoặc rút gọn' : 'hãy rút gọn hoặc tách câu'));
      }
      return h;
    }
    function sp(extra) { return gop({ ident: ident, title: title, diem: c.points, fb: layFb() }, extra || {}); }
    var t = c.type, diem = t === 'text' ? 0 : c.points;

    if (t === 'mc' || t === 'ma') {
      var stemMc = stemDu(c.stem);
      var ch = c.choices.map(function (x) { return { html: cuoi(x.html), correct: x.correct === true }; });
      out.items.push((t === 'mc' ? itemMc : itemMa)(sp({ stem: stemMc }), ch, base));
    } else if (t === 'tf') {
      var st = c.statements;
      if (opts.tfMode === 'split') {
        var n = st.length, moi = lam4(c.points / n);
        st.forEach(function (s, i) {
          var d = i === n - 1 ? lam4(c.points - moi * (n - 1)) : moi;
          var y = nhanY(s, i);
          out.items.push(itemMc(sp({
            ident: ident + '_s' + (i + 1),
            title: (title + ' – ' + y + ')').slice(0, 200),
            diem: d,
            stem: stemDu((c.stem || '') + dongY(y + ') ' + boBocP(s.html)))
          }), [{ html: DUNG, correct: s.value === true }, { html: SAI, correct: s.value === false }], base + i * 2));
        });
      } else {
        // một câu nhiều ô chọn Đúng/Sai: stem "a) … [s1]<br>b) … [s2]…"
        var nen = String(c.stem || '') + ' ' + stim + ' ' + st.map(function (s) { return s.html; }).join(' ');
        var pfx = ['s', 'y', 'ds', 'tf', 'yds'].filter(function (p) {
          return st.every(function (s, i) { return nen.indexOf('[' + p + (i + 1) + ']') === -1; });
        })[0] || 'yds';
        var dong = st.map(function (s, i) { return nhanY(s, i) + ') ' + boBocP(s.html) + ' [' + pfx + (i + 1) + ']'; });
        var dd = st.map(function (s, i) { return { id: pfx + (i + 1), options: [DUNG, SAI], correct: s.value === true ? 0 : 1 }; });
        // ý có khối (đoạn, bảng, danh sách) không lồng được trong <p> → mỗi ý một <div>
        var coKhoi = dong.some(laKhoi);
        out.items.push(itemO(sp({ stem: stemDu((c.stem || '') + (coKhoi ? dong.map(dongY).join('') : '<p>' + dong.join('<br>') + '</p>')) }),
          'multiple_dropdowns_question', dd, base));
      }
      ctx.coTf = true;
    } else if (t === 'short') {
      var ans = core.answerVariants(c.answers.filter(function (a) { return a != null && String(a).trim() !== ''; }));
      out.items.push(itemShort(sp({ stem: stemDu(c.stem) }), ans, base));
    } else if (t === 'num') {
      out.items.push(itemNum(sp({ stem: stemDu(c.stem) }), c.numeric, base));
      var nu = c.numeric;
      [nu.exact, nu.margin, nu.min, nu.max].forEach(function (x) { if (typeof x === 'number' && x !== Math.floor(x)) ctx.coSoThapPhan = true; });
    } else if (t === 'blanks' || t === 'dropdowns') {
      var arr = t === 'blanks' ? c.blanks : c.dropdowns;
      // đoạn dẫn chứa "[id]" sẽ bị Canvas thay ô vào đó → chèn ký tự rộng 0 để vô hiệu hoá
      if (stim) {
        var vo = 0;
        arr.forEach(function (b) {
          var kim = '[' + b.id + ']';
          if (stim.indexOf(kim) !== -1) { stim = stim.split(kim).join('[\u200B' + b.id + ']'); vo++; }
        });
        if (vo) iss('info', 'đoạn dẫn có chuỗi trùng mã ô ([…]) — đã vô hiệu hoá để Canvas đặt ô đúng chỗ trong câu');
      }
      var oList = arr.map(function (b) {
        if (t === 'blanks') {
          return { id: b.id, options: core.answerVariants(b.accepts.filter(function (a) { return a != null && String(a).trim() !== ''; })), correct: 0 };
        }
        return { id: b.id, options: b.options.map(function (o) { return nfc(String(o)).trim(); }), correct: b.correct };
      });
      out.items.push(itemO(sp({ stem: stemDu(c.stem) }),
        t === 'blanks' ? 'fill_in_multiple_blanks_question' : 'multiple_dropdowns_question', oList, base));
    } else if (t === 'matching') {
      var stemMt = stemDu(c.stem);
      var pairs = c.pairs.map(function (p) { return { left: cuoi(p.left), right: nfc(String(p.right)).trim() }; });
      var nhieu = (Array.isArray(c.distractors) ? c.distractors : [])
        .map(function (d) { return nfc(String(d == null ? '' : d)).trim(); }).filter(Boolean);
      out.items.push(itemMatching(sp({ stem: stemMt }), pairs, nhieu, NN));
    } else if (t === 'essay') {
      out.items.push(itemEssay(sp({ stem: stemDu(c.stem) })));
    } else if (t === 'text') {
      if (opts.includeFeedback && q.feedback && !rongHtml(q.feedback)) iss('info', 'mục chỉ có chữ (text) không có lời giải trong Canvas — đã bỏ lời giải');
      out.items.push(itemText(sp({ stem: stemDu(c.stem), diem: 0, fb: '' })));
    }

    if (demCT.loi) {
      iss('warn', (layModule('math') ? demCT.loi + ' công thức không chuyển được sang ảnh' : 'chưa nạp module công thức (math.js)') +
        ' — giữ nguyên MathML');
    }
    out.diem = diem;
    return out;
  }

  /* ===================== Ngân hàng / gói ===================== */

  function vanDe(level, msg, qid, bank) {
    var o = core.newIssue(level, msg, qid);
    if (bank != null) o.bank = bank;
    return o;
  }
  function demMoi() {
    var d = {};
    LOAI.forEach(function (t) { d[t] = 0; });
    d.total = 0; d.items = 0; d.skipped = 0; d.excluded = 0; d.points = 0;
    return d;
  }
  function congDem(a, b) {
    for (var k in b) if (has(b, k)) a[k] = (a[k] || 0) + b[k];
    a.points = lam4(a.points);
  }

  function normalizeOptions(o) {
    o = o || {};
    return {
      target: o.target === 'classic' ? 'classic' : 'itembank',
      tfMode: o.tfMode === 'split' ? 'split' : 'dropdowns',
      stimulus: o.stimulus === 'none' ? 'none' : 'each',
      math: o.math === 'image' ? 'image' : 'mathml',
      includeFeedback: o.includeFeedback !== false,
      numberInTitle: o.numberInTitle !== false
    };
  }

  // Chuẩn hoá danh sách ngân hàng: tiêu đề, ident hợp lệ + không trùng
  function chuanHoaBanks(banks, issues) {
    var daCo = {};
    return banks.map(function (b, i) {
      b = b || {};
      var title = nfc(b.title == null ? '' : b.title).replace(/\s+/g, ' ').trim();
      if (!title) {
        title = 'Ngân hàng câu hỏi' + (banks.length > 1 ? ' ' + (i + 1) : '');
        issues.push(vanDe('warn', 'Ngân hàng thứ ' + (i + 1) + ' chưa có tên — đặt tạm "' + title + '"', undefined, title));
      }
      if (title.length > 255) issues.push(vanDe('warn', 'Tên ngân hàng dài hơn 255 ký tự — Canvas sẽ cắt bớt', undefined, title));
      var ident = b.ident != null ? String(b.ident) : '';
      if (!RE_IDENT.test(ident)) {
        if (ident) issues.push(vanDe('info', 'Ngân hàng "' + title + '": mã "' + ident + '" không hợp lệ — dùng mã tạo từ tên', undefined, title));
        ident = core.bankIdent(title);
        if (!RE_IDENT.test(ident)) ident = 'nh_' + core.hash6(title);
      }
      if (has(daCo, ident)) {
        var n = 2;
        while (has(daCo, ident.slice(0, 58) + '_' + n)) n++;
        var moi = ident.slice(0, 58) + '_' + n;
        issues.push(vanDe('warn', 'Ngân hàng "' + title + '" trùng mã với ngân hàng khác — đổi thành "' + moi +
          '" (import đè sẽ không khớp ngân hàng cũ)', undefined, title));
        ident = moi;
      }
      daCo[ident] = 1;
      return { bank: b, title: title, ident: ident, idx: i, images: (b.images && typeof b.images === 'object') ? b.images : {} };
    });
  }

  // Dựng mọi câu của một ngân hàng → { items, counts, issues, coTf, coSoThapPhan }
  function xuLyBank(nb, opts, khoAnh) {
    var ctx = {
      opts: opts, bankIdent: nb.ident, bankTitle: nb.title, images: nb.images,
      khoAnh: khoAnh, mapAnh: {}, coTf: false, coSoThapPhan: false
    };
    var items = [], issues = [], dem = demMoi();
    var qs = Array.isArray(nb.bank.questions) ? nb.bank.questions : [];
    qs.forEach(function (q, i) {
      // null/undefined = câu bên gọi loại ra (lỗi / bỏ chọn) nhưng GIỮ vị trí để ident các câu sau không dồn
      // (ident = vị trí; "Ghi đè" cần khớp đúng câu cũ) → bỏ qua im lặng
      if (q == null) { dem.excluded++; return; }
      var r = chuanBiCau(q, i, ctx);
      issues.push.apply(issues, r.issues);
      if (r.skip) { dem.skipped++; return; }
      items.push.apply(items, r.items);
      if (has(dem, q.type)) dem[q.type]++;
      dem.total++;
      dem.items += r.items.length;
      dem.points = lam4(dem.points + (Number(r.diem) || 0));
    });
    if (!qs.length) issues.push(vanDe('warn', 'Ngân hàng "' + nb.title + '" không có câu hỏi nào', undefined, nb.title));
    else if (!items.length && dem.skipped) issues.push(vanDe('error', 'Ngân hàng "' + nb.title + '": không câu nào xuất được (mọi câu đều có lỗi)', undefined, nb.title));
    else if (!items.length) issues.push(vanDe('warn', 'Ngân hàng "' + nb.title + '": không có câu nào được chọn để xuất', undefined, nb.title));
    return { items: items, counts: dem, issues: issues, coTf: ctx.coTf, coSoThapPhan: ctx.coSoThapPhan };
  }

  function thongBaoGoi(pkg, coTf, coSo) {
    if (coTf) pkg.issues.push(vanDe('info', 'Câu Đúng/Sai nhiều ý: Canvas chấm tuyến tính (mỗi ý đúng = điểm câu ÷ số ý); ' +
      'thang 0,1 / 0,25 / 0,5 / 1 điểm của Bộ GD&ĐT không làm được trên Canvas'));
    if (coSo) pkg.issues.push(vanDe('info', 'Câu điền số có đáp án thập phân: học sinh phải gõ dấu chấm (vd 12.5) — Canvas hiểu "12,5" là 125'));
  }

  function resourceAnh(kho) {
    return kho.ds.map(function (ten, i) {
      var p = 'images/' + ten;
      return E('resource', { identifier: 'img_' + (i + 1), type: 'webcontent', href: p }, [E('file', { href: p })]);
    });
  }
  function tepAnh(kho) { return kho.ds.map(function (ten) { return { path: 'images/' + ten, data: kho.tep[ten] }; }); }

  function manifestXml(ident, title, resources) {
    return taiLieu(E('manifest', gop({ identifier: ident + '_manifest' }, NS_MANIFEST), [
      E('metadata', null, [
        T('schema', null, 'IMS Content'),
        T('schemaversion', null, '1.1.3'),
        E('imsmd:lom', null, [E('imsmd:general', null, [E('imsmd:title', null, [T('imsmd:string', null, title)])])])
      ]),
      E('organizations'),
      E('resources', null, resources)
    ]));
  }

  // §1.3 — <objectbank> trực tiếp dưới <questestinterop>, bank_title trước item đầu tiên
  function bankXml(ident, title, items) {
    return taiLieu(E('questestinterop', NS_QTI, [E('objectbank', { ident: ident }, [
      E('qtimetadata', null, [truongMeta('bank_title', title)])
    ].concat(items))]));
  }

  // Bố cục bài kiểm tra Canvas: mọi item nằm thẳng trong root_section
  function quizXml(quizIdent, title, items) {
    return taiLieu(E('questestinterop', NS_QTI, [E('assessment', { ident: quizIdent, title: title }, [
      E('qtimetadata', null, [truongMeta('cc_maxattempts', '1')]),
      E('section', { ident: 'root_section' }, items)
    ])]));
  }

  // assessment_meta.xml (thứ tự phần tử theo qti_generator.rb của Canvas)
  function metaXml(quizIdent, title, diem) {
    return taiLieu(E('quiz', gop({ identifier: quizIdent }, NS_CCC), [
      T('title', null, title),
      T('description', null, ''),
      T('shuffle_answers', null, 'false'),
      T('scoring_policy', null, 'keep_highest'),
      T('quiz_type', null, 'assignment'),
      T('points_possible', null, fmtSo(diem)),
      T('lockdown_browser_monitor_data', null, ''),
      T('show_correct_answers', null, 'true'),
      T('anonymous_submissions', null, 'false'),
      T('could_be_locked', null, 'false'),
      T('allowed_attempts', null, '1'),
      T('one_question_at_a_time', null, 'false'),
      T('cant_go_back', null, 'false'),
      T('available', null, 'false'),
      T('one_time_results', null, 'false'),
      T('show_correct_answers_last_attempt', null, 'false'),
      T('only_visible_to_overrides', null, 'false'),
      T('module_locked', null, 'false')
    ]));
  }

  function tenDuyNhat(ten, daDung) {
    var goc = ten.replace(/\.zip$/i, ''), t = ten, n = 2;
    while (has(daDung, t.toLowerCase())) { t = goc + '_' + n + '.zip'; n++; }
    daDung[t.toLowerCase()] = 1;
    return t;
  }

  /*
   * prepare(banks, opts) → { packages: [{fileName, files:[{path,data}], bankTitles, counts, issues}], issues }
   * classic: một gói cho mọi ngân hàng; itembank: mỗi ngân hàng một gói. Ngân hàng không còn câu nào → không tạo.
   */
  function prepare(banks, opts) {
    opts = normalizeOptions(opts);
    banks = Array.isArray(banks) ? banks : (banks ? [banks] : []);
    var tatCa = [], packages = [], daDung = {};
    var ds = chuanHoaBanks(banks, tatCa);

    if (opts.target === 'classic') {
      var kho = taoKhoAnh(), pkg = { issues: [], counts: demMoi(), bankTitles: [] };
      var tepBank = [], resBank = [], identCo = [], coTf = false, coSo = false;
      ds.forEach(function (nb) {
        var r = xuLyBank(nb, opts, kho);
        pkg.issues.push.apply(pkg.issues, r.issues);
        congDem(pkg.counts, r.counts);
        if (!r.items.length) return;
        coTf = coTf || r.coTf; coSo = coSo || r.coSoThapPhan;
        var p = 'non_cc_assessments/' + nb.ident + '.xml.qti';
        tepBank.push({ path: p, data: bankXml(nb.ident, nb.title, r.items) });
        resBank.push(E('resource', { identifier: nb.ident, type: 'imsqti_xmlv1p2', href: p }, [E('file', { href: p })]));
        pkg.bankTitles.push(nb.title);
        identCo.push(nb.ident);
      });
      thongBaoGoi(pkg, coTf, coSo);
      if (tepBank.length) {
        var mot = pkg.bankTitles.length === 1;
        var pkgIdent = mot ? identCo[0] : 'nh_goi_' + core.hash6(identCo.join('|'));
        var tieuDeGoi = mot ? pkg.bankTitles[0] : pkg.bankTitles.join(' + ');
        pkg.files = [{ path: 'imsmanifest.xml', data: manifestXml(pkgIdent, tieuDeGoi, resBank.concat(resourceAnh(kho))) }]
          .concat(tepBank, tepAnh(kho));
        pkg.fileName = tenDuyNhat((mot ? tenAscii(pkg.bankTitles[0]) : 'Ngan_hang_cau_hoi_' + pkg.bankTitles.length) + '_classic.zip', daDung);
        packages.push({ fileName: pkg.fileName, files: pkg.files, bankTitles: pkg.bankTitles, counts: pkg.counts, issues: pkg.issues });
      }
      tatCa.push.apply(tatCa, pkg.issues);
    } else {
      ds.forEach(function (nb) {
        var kho = taoKhoAnh();
        var r = xuLyBank(nb, opts, kho);
        var pkg = { issues: r.issues, counts: r.counts, bankTitles: [nb.title] };
        thongBaoGoi(pkg, r.coTf, r.coSoThapPhan);
        tatCa.push.apply(tatCa, pkg.issues);
        if (!r.items.length) return;
        var quizIdent = nb.ident + '_quiz', metaId = quizIdent + '_meta';
        var pQuiz = quizIdent + '/' + quizIdent + '.xml', pMeta = quizIdent + '/assessment_meta.xml';
        var res = [
          E('resource', { identifier: quizIdent, type: 'imsqti_xmlv1p2' }, [E('file', { href: pQuiz }), E('dependency', { identifierref: metaId })]),
          E('resource', { identifier: metaId, type: LOR, href: pMeta }, [E('file', { href: pMeta })])
        ].concat(resourceAnh(kho));
        packages.push({
          fileName: tenDuyNhat(tenAscii(nb.title) + '.zip', daDung),
          files: [
            { path: 'imsmanifest.xml', data: manifestXml(nb.ident, nb.title, res) },
            { path: pQuiz, data: quizXml(quizIdent, nb.title, r.items) },
            { path: pMeta, data: metaXml(quizIdent, nb.title, r.counts.points) }
          ].concat(tepAnh(kho)),
          bankTitles: pkg.bankTitles, counts: pkg.counts, issues: pkg.issues
        });
      });
    }
    return { packages: packages, issues: tatCa };
  }

  // buildFiles(banks, opts) → [{path, data}] (không nén; itembank nhiều ngân hàng: mỗi mục có thêm .pkg = tên zip)
  function buildFiles(banks, opts) {
    var r = prepare(banks, opts), out = [];
    r.packages.forEach(function (p) { p.files.forEach(function (f) { out.push({ path: f.path, data: f.data, pkg: p.fileName }); }); });
    out.issues = r.issues;
    return out;
  }

  // buildPackages(banks, opts) → Promise<[{fileName, bytes, bankTitles, counts, issues}]> (mảng có thêm .issues = mọi vấn đề)
  async function buildPackages(banks, opts) {
    var zip = layModule('zip');
    if (!zip || typeof zip.writeZip !== 'function') throw new Error('Chưa nạp module zip.js');
    var r = prepare(banks, opts), out = [];
    for (var i = 0; i < r.packages.length; i++) {
      var p = r.packages[i];
      var bytes = await zip.writeZip(p.files.map(function (f) { return { path: f.path, data: f.data }; }), { compress: true });
      out.push({ fileName: p.fileName, bytes: bytes, bankTitles: p.bankTitles, counts: p.counts, issues: p.issues });
    }
    out.issues = r.issues;
    return out;
  }

  return {
    buildPackages: buildPackages,
    buildFiles: buildFiles,
    prepare: prepare,
    normalizeOptions: normalizeOptions,
    _setDeps: _setDeps
  };
});
