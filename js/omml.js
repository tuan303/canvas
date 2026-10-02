/* js/omml.js — chuyển công thức Office Math (OMML của Word) → MathML, và → chữ thuần Unicode */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.omml = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var laNode = typeof module === 'object' && module.exports && typeof require === 'function';
  var core = laNode ? require('./core.js') : root.NH.core;

  var NS = 'http://www.w3.org/1998/Math/MathML';
  var esc = function (s) { return core.escXml(s); };

  /* ---------- tiện ích cây ---------- */

  function con(node, name) { return node ? core.children(node, name)[0] || null : null; }
  function conTat(node, name) { return node ? core.children(node, name) : []; }
  // giá trị m:val (chấp nhận cả thuộc tính không tiền tố / tiền tố lạ)
  function val(node) {
    if (!node || !node.attrs) return undefined;
    var a = node.attrs;
    if (Object.prototype.hasOwnProperty.call(a, 'm:val')) return a['m:val'];
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k) && (k === 'val' || /:val$/.test(k))) return a[k];
    return undefined;
  }
  // thuộc tính bật/tắt: có phần tử mà không có val → bật
  function bat(node) {
    if (!node) return false;
    var v = val(node);
    return v === undefined || !/^(0|off|false)$/i.test(v);
  }
  function thuocTinhPr(node, prName, name) { return con(con(node, prName), name); }

  /* ---------- phân loại ký tự ---------- */

  var RE_CHU = /\p{L}/u, RE_DAU = /\p{M}/u, RE_SO = /[0-9]/, RE_TRANG = /[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]/;
  var RE_DINH_DANG = /\p{Cf}/u; // ký tự vô hình (U+2061…U+2064, ZWJ…)
  var KY_HIEU_MI = '∞∅∂∇ℏℓ℘ℵ△▵∆'; // ký hiệu viết bằng <mi>
  var DOI_MO = { '-': '\u2212', "'": '\u2032', '\u2019': '\u2032' };
  var TICH_PHAN = '∫∬∭∮∯∰∱∲∳⨌';
  var DAU_MU = { // dấu tổ hợp của m:acc → ký tự có độ rộng để đặt trong <mo>
    '\u0300': '`', '\u0301': '\u00B4', '\u0302': '^', '\u0303': '~', '\u0304': '\u00AF', '\u0305': '\u00AF',
    '\u0306': '\u02D8', '\u0307': '\u02D9', '\u0308': '\u00A8', '\u030C': '\u02C7', '\u030A': '\u02DA',
    '\u20D0': '\u21BC', '\u20D1': '\u21C0', '\u20D6': '\u2190', '\u20D7': '\u2192', '\u20E1': '\u2194', '\u20EC': '\u21C1', '\u20ED': '\u21BD'
  };
  var MU_SO = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '\u2212': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'o': 'ᵒ', '∘': '°', '°': '°' };
  var CHI_SO = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '\u2212': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'h': 'ₕ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'p': 'ₚ', 's': 'ₛ', 't': 'ₜ', 'i': 'ᵢ', 'j': 'ⱼ', 'r': 'ᵣ', 'u': 'ᵤ', 'v': 'ᵥ' };

  /* ---------- kiểu chữ (m:sty, m:scr) → mathvariant ---------- */

  function kieuChu(rPr) {
    var sty = val(con(rPr, 'm:sty')), scr = val(con(rPr, 'm:scr'));
    var dam = sty === 'b' || sty === 'bi', nghieng = sty === 'i' || sty === 'bi';
    if (scr === 'double-struck') return 'double-struck';
    if (scr === 'monospace') return 'monospace';
    if (scr === 'script') return dam ? 'bold-script' : 'script';
    if (scr === 'fraktur') return dam ? 'bold-fraktur' : 'fraktur';
    if (scr === 'sans-serif') {
      if (sty === 'b') return 'bold-sans-serif';
      if (sty === 'bi') return 'sans-serif-bold-italic';
      if (sty === 'p') return 'sans-serif';
      return 'sans-serif-italic';
    }
    if (sty === 'p') return 'normal';
    if (sty === 'b') return 'bold';
    if (sty === 'bi') return 'bold-italic';
    if (nghieng) return 'italic';
    return '';
  }

  // Chữ kép (ℝ, ℕ, 𝔸…) → ký tự Unicode: trình duyệt hiển thị MathML gốc (Chrome) bỏ qua mathvariant (giống latex.js)
  var KEP_DB = { C: 0x2102, H: 0x210D, N: 0x2115, P: 0x2119, Q: 0x211A, R: 0x211D, Z: 0x2124 };
  function chuKep(s) {
    return Array.from(s).map(function (c) {
      var k = c.charCodeAt(0);
      if (Object.prototype.hasOwnProperty.call(KEP_DB, c)) return String.fromCharCode(KEP_DB[c]);
      if (k >= 65 && k <= 90) return String.fromCodePoint(0x1D538 + k - 65);
      if (k >= 97 && k <= 122) return String.fromCodePoint(0x1D552 + k - 97);
      if (k >= 48 && k <= 57) return String.fromCodePoint(0x1D7D8 + k - 48);
      return c;
    }).join('');
  }

  // mi một ký tự mặc định nghiêng, nhiều ký tự mặc định đứng → chỉ ghi mathvariant khi khác mặc định
  function mi(s, mv) {
    if (mv === 'double-struck') { s = chuKep(s); mv = Array.from(s).length > 1 ? 'normal' : ''; }
    var mot = Array.from(s).filter(function (c) { return !RE_DAU.test(c); }).length <= 1;
    var at = mv && mv !== (mot ? 'italic' : 'normal') ? ' mathvariant="' + mv + '"' : '';
    return '<mi' + at + '>' + esc(s) + '</mi>';
  }
  function mn(s, mv) {
    if (mv === 'double-struck') { s = chuKep(s); mv = ''; }
    var at = (mv === 'bold' || mv === 'bold-italic' || mv === 'double-struck' || mv === 'monospace' || /sans/.test(mv || '')) ?
      ' mathvariant="' + (mv === 'bold-italic' ? 'bold' : mv) + '"' : '';
    return '<mn' + at + '>' + esc(s) + '</mn>';
  }
  function mo(s, at) { return '<mo' + (at || '') + '>' + esc(s) + '</mo>'; }
  function mtext(s) {
    // khoảng trắng đầu/cuối của mtext bị trình duyệt bỏ → đổi sang NBSP
    return '<mtext>' + esc(s.replace(/^ +| +$/g, function (m) { return m.replace(/ /g, '\u00A0'); })) + '</mtext>';
  }

  /* ---------- tách chữ của một m:r thành mi/mn/mo ---------- */

  function tachChu(text, mv, gopChu) {
    var out = [], cs = Array.from(text), i = 0, n = cs.length;
    while (i < n) {
      var c = cs[i];
      if (RE_TRANG.test(c) || RE_DINH_DANG.test(c)) { i++; continue; }
      if (RE_SO.test(c)) {
        var s = c; i++;
        for (;;) {
          if (i < n && RE_SO.test(cs[i])) { s += cs[i++]; continue; }
          if (i + 1 < n && (cs[i] === '.' || cs[i] === ',') && RE_SO.test(cs[i + 1])) { s += cs[i] + cs[i + 1]; i += 2; continue; }
          break;
        }
        out.push(mn(s, mv));
        continue;
      }
      if (RE_CHU.test(c)) {
        var w = c; i++;
        while (i < n && RE_DAU.test(cs[i])) w += cs[i++]; // dấu tổ hợp đi kèm chữ
        if (gopChu) {
          while (i < n && (RE_CHU.test(cs[i]) || RE_DAU.test(cs[i]))) w += cs[i++];
        }
        out.push(mi(w, mv));
        continue;
      }
      if (KY_HIEU_MI.indexOf(c) !== -1) { out.push(mi(c, mv === '' ? 'normal' : mv)); i++; continue; }
      i++;
      if (RE_DAU.test(c)) continue; // dấu tổ hợp lạc
      out.push(mo(DOI_MO[c] || c));
    }
    return out;
  }

  function chuCuaRun(r) {
    var s = '';
    (r.children || []).forEach(function (c) {
      if (c.type !== 'el') return;
      if (c.name === 'm:t' || c.name === 'w:t') s += core.xmlText(c);
      else if (c.name === 'w:tab') s += ' ';
      else if (c.name === 'w:noBreakHyphen') s += '-';
      else if (c.name === 'w:sym') {
        var ch = parseInt(c.attrs && (c.attrs['w:char'] || ''), 16);
        if (ch >= 0xF000) ch -= 0xF000;
        if (ch > 0) s += String.fromCodePoint(ch);
      }
    });
    return core.nfc(s);
  }

  /* ---------- chuyển đổi chính ---------- */

  // trả về mảng phần tử MathML (mỗi phần tử là một chuỗi một nút)
  function conv(node, ctx) {
    if (!node) return [];
    if (node.type === 'text') return [];
    var ten = node.name, f = DOI[ten];
    if (f) return f(node, ctx);
    if (/Pr$/.test(ten) || ten === 'm:ctrlPr' || ten === 'w:rPr' || ten === 'w:del' || ten === 'w:moveFrom' ||
        ten === 'w:bookmarkStart' || ten === 'w:bookmarkEnd' || ten === 'w:proofErr' || ten === 'w:commentRangeStart' ||
        ten === 'w:commentRangeEnd' || ten === 'w:permStart' || ten === 'w:permEnd') return [];
    if (ten === 'mc:AlternateContent') {
      var ch = con(node, 'mc:Choice'), r = ch ? day(ch, ctx) : [];
      if (!r.length) r = day(con(node, 'mc:Fallback'), ctx);
      return r;
    }
    if (ten === 'w:r') { // chữ thường (không phải toán) nằm trong vùng công thức
      var t = chuCuaRun(node);
      return t ? [mtext(t)] : [];
    }
    return day(node, ctx); // m:e, m:num, w:ins, w:smartTag, w:sdtContent, phần tử lạ…
  }

  function day(node, ctx) {
    var out = [];
    if (!node || !node.children) return out;
    for (var i = 0; i < node.children.length; i++) {
      var r = conv(node.children[i], ctx);
      for (var j = 0; j < r.length; j++) out.push(r[j]);
    }
    return out;
  }

  // đối số: đúng MỘT phần tử (bọc mrow khi cần)
  function doiSo(node, ctx) {
    var a = day(node, ctx);
    if (a.length === 1) return a[0];
    return '<mrow>' + a.join('') + '</mrow>';
  }
  function rong(node) { return !node || day(node, {}).length === 0; }

  var DOI = {
    'm:oMathPara': function (n, ctx) {
      var ms = conTat(n, 'm:oMath');
      if (ms.length <= 1) return day(ms[0] || n, ctx);
      return ['<mtable>' + ms.map(function (m) { return '<mtr><mtd>' + day(m, ctx).join('') + '</mtd></mtr>'; }).join('') + '</mtable>'];
    },
    'm:oMath': function (n, ctx) { return day(n, ctx); },
    'm:r': function (n, ctx) {
      var rPr = con(n, 'm:rPr'), t = chuCuaRun(n);
      if (!t) return [];
      if (rPr && (con(rPr, 'm:nor') && bat(con(rPr, 'm:nor')))) return [mtext(t)];
      var mv = kieuChu(rPr);
      var gop = !!(ctx && ctx.tenHam) || (mv === 'normal' && Array.from(t.replace(/[^\p{L}]/gu, '')).length > 1);
      return tachChu(t, mv, gop);
    },
    'm:f': function (n, ctx) {
      var loai = val(thuocTinhPr(n, 'm:fPr', 'm:type')) || 'bar';
      var tu = doiSo(con(n, 'm:num'), ctx), mau = doiSo(con(n, 'm:den'), ctx);
      if (loai === 'lin') return ['<mrow>' + tu + mo('/') + mau + '</mrow>'];
      if (loai === 'noBar') return ['<mfrac linethickness="0">' + tu + mau + '</mfrac>'];
      if (loai === 'skw') return ['<mfrac bevelled="true">' + tu + mau + '</mfrac>'];
      return ['<mfrac>' + tu + mau + '</mfrac>'];
    },
    'm:sSup': function (n, ctx) { return ['<msup>' + doiSo(con(n, 'm:e'), ctx) + doiSo(con(n, 'm:sup'), ctx) + '</msup>']; },
    'm:sSub': function (n, ctx) { return ['<msub>' + doiSo(con(n, 'm:e'), ctx) + doiSo(con(n, 'm:sub'), ctx) + '</msub>']; },
    'm:sSubSup': function (n, ctx) {
      return ['<msubsup>' + doiSo(con(n, 'm:e'), ctx) + doiSo(con(n, 'm:sub'), ctx) + doiSo(con(n, 'm:sup'), ctx) + '</msubsup>'];
    },
    'm:sPre': function (n, ctx) {
      return ['<mmultiscripts>' + doiSo(con(n, 'm:e'), ctx) + '<mprescripts/>' + doiSo(con(n, 'm:sub'), ctx) + doiSo(con(n, 'm:sup'), ctx) + '</mmultiscripts>'];
    },
    'm:rad': function (n, ctx) {
      var an = bat(thuocTinhPr(n, 'm:radPr', 'm:degHide')), bac = con(n, 'm:deg');
      if (an || rong(bac)) return ['<msqrt>' + day(con(n, 'm:e'), ctx).join('') + '</msqrt>'];
      return ['<mroot>' + doiSo(con(n, 'm:e'), ctx) + doiSo(bac, ctx) + '</mroot>'];
    },
    'm:nary': function (n, ctx) {
      var pr = con(n, 'm:naryPr'), chrEl = con(pr, 'm:chr');
      var chr = chrEl ? (val(chrEl) || '\u222B') : '\u222B';
      var loc = val(con(pr, 'm:limLoc')) || (TICH_PHAN.indexOf(chr) !== -1 ? 'subSup' : 'undOvr');
      var sub = con(n, 'm:sub'), sup = con(n, 'm:sup');
      var anDuoi = bat(con(pr, 'm:subHide')) || rong(sub), anTren = bat(con(pr, 'm:supHide')) || rong(sup);
      var op = mo(chr), tren = loc === 'undOvr', dau;
      if (anDuoi && anTren) dau = op;
      else if (anDuoi) dau = (tren ? '<mover>' : '<msup>') + op + doiSo(sup, ctx) + (tren ? '</mover>' : '</msup>');
      else if (anTren) dau = (tren ? '<munder>' : '<msub>') + op + doiSo(sub, ctx) + (tren ? '</munder>' : '</msub>');
      else dau = (tren ? '<munderover>' : '<msubsup>') + op + doiSo(sub, ctx) + doiSo(sup, ctx) + (tren ? '</munderover>' : '</msubsup>');
      return ['<mrow>' + dau + doiSo(con(n, 'm:e'), ctx) + '</mrow>'];
    },
    'm:d': function (n, ctx) {
      var pr = con(n, 'm:dPr');
      var bEl = con(pr, 'm:begChr'), eEl = con(pr, 'm:endChr'), sEl = con(pr, 'm:sepChr');
      var mo1 = bEl ? (val(bEl) || '') : '(', mo2 = eEl ? (val(eEl) || '') : ')', ngan = sEl ? (val(sEl) || '') : '|';
      var es = conTat(n, 'm:e'), giua = [];
      es.forEach(function (e, i) {
        if (i && ngan) giua.push(mo(ngan, ' separator="true"'));
        var a = day(e, ctx);
        giua.push(a.length === 1 ? a[0] : '<mrow>' + a.join('') + '</mrow>');
      });
      return ['<mrow>' + (mo1 ? mo(mo1, ' fence="true"') : '') + giua.join('') + (mo2 ? mo(mo2, ' fence="true"') : '') + '</mrow>'];
    },
    'm:func': function (n, ctx) {
      var ten = day(con(n, 'm:fName'), { tenHam: true });
      var ten1 = ten.length === 1 ? ten[0] : '<mrow>' + ten.join('') + '</mrow>';
      return ['<mrow>' + ten1 + mo('\u2061') + doiSo(con(n, 'm:e'), ctx) + '</mrow>'];
    },
    'm:fName': function (n) { return day(n, { tenHam: true }); },
    'm:limLow': function (n, ctx) { return ['<munder>' + doiSo(con(n, 'm:e'), ctx) + doiSo(con(n, 'm:lim'), {}) + '</munder>']; },
    'm:limUpp': function (n, ctx) { return ['<mover>' + doiSo(con(n, 'm:e'), ctx) + doiSo(con(n, 'm:lim'), {}) + '</mover>']; },
    'm:acc': function (n, ctx) {
      var chrEl = thuocTinhPr(n, 'm:accPr', 'm:chr');
      var chr = chrEl ? (val(chrEl) || '\u0302') : '\u0302';
      var dau = DAU_MU[chr] || chr;
      var e = con(n, 'm:e'), coSo = doiSo(e, ctx);
      var mot = docChu(e).replace(/\s/g, '').length <= 1;
      return ['<mover accent="true">' + coSo + mo(dau, mot ? ' stretchy="false"' : '') + '</mover>'];
    },
    'm:bar': function (n, ctx) {
      var pos = val(thuocTinhPr(n, 'm:barPr', 'm:pos')) || 'bot';
      var e = doiSo(con(n, 'm:e'), ctx);
      if (pos === 'top') return ['<mover accent="true">' + e + mo('\u00AF') + '</mover>'];
      return ['<munder accentunder="true">' + e + mo('_') + '</munder>'];
    },
    'm:groupChr': function (n, ctx) {
      var pr = con(n, 'm:groupChrPr'), chrEl = con(pr, 'm:chr');
      var chr = chrEl ? (val(chrEl) || '\u23DF') : '\u23DF';
      var pos = val(con(pr, 'm:pos')) || 'bot';
      var e = doiSo(con(n, 'm:e'), ctx);
      return [pos === 'top' ? '<mover>' + e + mo(chr) + '</mover>' : '<munder>' + e + mo(chr) + '</munder>'];
    },
    'm:eqArr': function (n, ctx) {
      return ['<mtable columnalign="left">' + conTat(n, 'm:e').map(function (e) {
        return '<mtr><mtd>' + day(e, ctx).join('') + '</mtd></mtr>';
      }).join('') + '</mtable>'];
    },
    'm:m': function (n, ctx) {
      return ['<mtable>' + conTat(n, 'm:mr').map(function (r) {
        return '<mtr>' + conTat(r, 'm:e').map(function (e) { return '<mtd>' + day(e, ctx).join('') + '</mtd>'; }).join('') + '</mtr>';
      }).join('') + '</mtable>'];
    },
    'm:box': function (n, ctx) { return day(con(n, 'm:e'), ctx); },
    'm:borderBox': function (n, ctx) { return ['<menclose notation="box">' + day(con(n, 'm:e'), ctx).join('') + '</menclose>']; },
    'm:phant': function (n, ctx) {
      var show = thuocTinhPr(n, 'm:phantPr', 'm:show');
      var a = day(con(n, 'm:e'), ctx);
      if (show && !bat(show)) return ['<mphantom>' + a.join('') + '</mphantom>'];
      return a;
    }
  };

  /*
   * toMathML(node | xmlString, opts) → '<math xmlns="…">…</math>'
   * node: m:oMath (inline) hoặc m:oMathPara (display="block"). opts.display ép kiểu hiển thị.
   */
  function toMathML(node, opts) {
    opts = opts || {};
    if (typeof node === 'string') node = core.parseXml(node);
    if (!node) return '';
    if (node.name === '#fragment' || (node.name !== 'm:oMath' && node.name !== 'm:oMathPara' && !/^m:/.test(node.name))) {
      node = core.find(node, ['m:oMathPara', 'm:oMath']) || node;
    }
    var khoi = opts.display != null ? !!opts.display : node.name === 'm:oMathPara';
    var a = conv(node, {});
    return '<math xmlns="' + NS + '"' + (khoi ? ' display="block"' : '') + '>' + a.join('') + '</math>';
  }

  /* ---------- chữ thuần (cho ô dropdown / vế phải ghép nối / đáp án ngắn) ---------- */

  function docChu(node) { // chữ thô của các m:t
    if (!node) return '';
    return core.findAll(node, function (x) { return x.name === 'm:t'; }).map(core.xmlText).join('');
  }

  // "đơn" = không cần ngoặc khi viết a/b: số, một chữ (kèm mũ/chỉ số/phẩy), hoặc đã nằm trong ngoặc
  function don(s) {
    return /^[\p{N}.,]+$/u.test(s) || /^\p{L}[′'°⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ₀₁₂₃₄₅₆₇₈₉]*$/u.test(s) || (/^\(.*\)$/.test(s) && kiemNgoac(s));
  }
  function kiemNgoac(s) { // (…) bao trọn cả chuỗi
    var d = 0;
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '(') d++;
      else if (s[i] === ')') { d--; if (d === 0 && i < s.length - 1) return false; }
    }
    return d === 0;
  }
  function boc(s) { return don(s) ? s : '(' + s + ')'; }
  function doiMu(s, bang, kyHieu) {
    var cs = Array.from(s), out = '';
    for (var i = 0; i < cs.length; i++) { if (!bang[cs[i]]) return kyHieu + boc(s); out += bang[cs[i]]; }
    return out;
  }

  function txt(node) {
    if (!node || node.type === 'text') return '';
    var n = node, ten = n.name;
    switch (ten) {
      case 'm:r': {
        var t = chuCuaRun(n), rPr = con(n, 'm:rPr');
        if (rPr && con(rPr, 'm:nor') && bat(con(rPr, 'm:nor'))) return t;
        if (rPr && kieuChu(rPr) === 'double-struck') t = chuKep(t);
        return t.replace(/-/g, '\u2212');
      }
      case 'w:r': return chuCuaRun(n);
      case 'm:f': {
        var loai = val(thuocTinhPr(n, 'm:fPr', 'm:type')) || 'bar';
        var a = txtCon(con(n, 'm:num')), b = txtCon(con(n, 'm:den'));
        if (loai === 'noBar') return '(' + a + ' ' + b + ')';
        return boc(a) + '/' + boc(b);
      }
      case 'm:sSup': return txtCon(con(n, 'm:e')) + doiMu(txtCon(con(n, 'm:sup')), MU_SO, '^');
      case 'm:sSub': return txtCon(con(n, 'm:e')) + doiMu(txtCon(con(n, 'm:sub')), CHI_SO, '_');
      case 'm:sSubSup':
        return txtCon(con(n, 'm:e')) + doiMu(txtCon(con(n, 'm:sub')), CHI_SO, '_') + doiMu(txtCon(con(n, 'm:sup')), MU_SO, '^');
      case 'm:sPre': return doiMu(txtCon(con(n, 'm:sub')), CHI_SO, '_') + doiMu(txtCon(con(n, 'm:sup')), MU_SO, '^') + txtCon(con(n, 'm:e'));
      case 'm:rad': {
        var e = txtCon(con(n, 'm:e')), bac = bat(thuocTinhPr(n, 'm:radPr', 'm:degHide')) ? '' : txtCon(con(n, 'm:deg'));
        var goc = bac === '3' ? '∛' : bac === '4' ? '∜' : (bac ? doiMu(bac, MU_SO, '') + '√' : '√');
        return goc + boc(e);
      }
      case 'm:nary': {
        var pr = con(n, 'm:naryPr'), chrEl = con(pr, 'm:chr');
        var chr = chrEl ? (val(chrEl) || '∫') : '∫';
        var sub = bat(con(pr, 'm:subHide')) ? '' : txtCon(con(n, 'm:sub'));
        var sup = bat(con(pr, 'm:supHide')) ? '' : txtCon(con(n, 'm:sup'));
        return chr + (sub ? doiMu(sub, CHI_SO, '_') : '') + (sup ? doiMu(sup, MU_SO, '^') : '') + txtCon(con(n, 'm:e'));
      }
      case 'm:d': {
        var dpr = con(n, 'm:dPr');
        var bEl = con(dpr, 'm:begChr'), eEl = con(dpr, 'm:endChr'), sEl = con(dpr, 'm:sepChr');
        var m1 = bEl ? (val(bEl) || '') : '(', m2 = eEl ? (val(eEl) || '') : ')', ng = sEl ? (val(sEl) || '') : '|';
        return m1 + conTat(n, 'm:e').map(txtCon).join(ng) + m2;
      }
      case 'm:func': {
        var tf = txtCon(con(n, 'm:fName')), ef = txtCon(con(n, 'm:e'));
        return tf + (/^[\p{L}\p{N}]/u.test(ef) ? ' ' : '') + ef;
      }
      case 'm:limLow': return txtCon(con(n, 'm:e')) + doiMu(txtCon(con(n, 'm:lim')), CHI_SO, '_');
      case 'm:limUpp': return txtCon(con(n, 'm:e')) + doiMu(txtCon(con(n, 'm:lim')), MU_SO, '^');
      case 'm:acc': {
        var ce = thuocTinhPr(n, 'm:accPr', 'm:chr');
        var c = ce ? (val(ce) || '\u0302') : '\u0302';
        var base = txtCon(con(n, 'm:e'));
        if (c === '\u2192') c = '\u20D7';
        return base + (/\p{M}/u.test(c) ? c : '');
      }
      case 'm:bar': return txtCon(con(n, 'm:e')) + ((val(thuocTinhPr(n, 'm:barPr', 'm:pos')) || 'bot') === 'top' ? '\u0305' : '');
      case 'm:eqArr': return conTat(n, 'm:e').map(txtCon).join('; ');
      case 'm:m': return '[' + conTat(n, 'm:mr').map(function (r) { return conTat(r, 'm:e').map(txtCon).join(', '); }).join('; ') + ']';
      case 'm:oMathPara': return conTat(n, 'm:oMath').map(txtCon).join('; ');
      case 'w:del': case 'w:moveFrom': return '';
      default:
        if (/Pr$/.test(ten) || ten === 'm:ctrlPr') return '';
        if (ten === 'mc:AlternateContent') {
          var ch = con(n, 'mc:Choice'), r = ch ? txtCon(ch) : '';
          return r || txtCon(con(n, 'mc:Fallback'));
        }
        return txtCon(n);
    }
  }
  function txtCon(node) {
    if (!node || !node.children) return '';
    var s = '';
    for (var i = 0; i < node.children.length; i++) s += txt(node.children[i]);
    return s;
  }

  // toText(node | xmlString) → chữ Unicode một dòng: x², √2, 8/3, (x+1)/(x\u22121)…
  function toText(node) {
    if (typeof node === 'string') node = core.parseXml(node);
    if (!node) return '';
    var s = (node.name === 'm:oMath' || node.name === 'm:oMathPara' || /^m:/.test(node.name)) ? txt(node) : txtCon(node);
    return core.nfc(s).replace(/[\u2061-\u2064\u200B]/g, '').replace(/\s+/g, ' ').trim();
  }

  return { toMathML: toMathML, toText: toText, NS: NS };
});
