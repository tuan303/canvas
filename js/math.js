/* js/math.js — MathML → LaTeX (ảnh công thức Canvas khi opts.math='image') và MathML → chữ Unicode (ô text thuần) */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.math = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var core = (typeof require === 'function') ? require('./core.js') : root.NH.core;

  // html.js (bộ phân tích chịu lỗi, giải đủ thực thể HTML) — nạp lười vì html.js cũng gọi ngược math.js
  var _html = null;
  function H() {
    if (_html === null) {
      try { _html = (typeof require === 'function') ? require('./html.js') : ((root.NH && root.NH.html) || false); }
      catch (e) { _html = false; }
    }
    return _html;
  }

  /* ===================== Bảng ký hiệu (dùng chung với latex.js) ===================== */
  // [lệnh LaTeX, ký tự, loại] — loại: mi (định danh), rel (quan hệ), bin (hai ngôi), op (toán tử lớn),
  // open/close (ngoặc), punct, ord (mo thường). Lệnh đứng trước được ưu tiên khi đổi ngược ký tự → lệnh.
  var SYM = [
    ['alpha', 'α', 'mi'], ['beta', 'β', 'mi'], ['gamma', 'γ', 'mi'], ['delta', 'δ', 'mi'],
    ['epsilon', 'ϵ', 'mi'], ['varepsilon', 'ε', 'mi'], ['zeta', 'ζ', 'mi'], ['eta', 'η', 'mi'],
    ['theta', 'θ', 'mi'], ['vartheta', 'ϑ', 'mi'], ['iota', 'ι', 'mi'], ['kappa', 'κ', 'mi'],
    ['lambda', 'λ', 'mi'], ['mu', 'μ', 'mi'], ['nu', 'ν', 'mi'], ['xi', 'ξ', 'mi'], ['pi', 'π', 'mi'],
    ['varpi', 'ϖ', 'mi'], ['rho', 'ρ', 'mi'], ['varrho', 'ϱ', 'mi'], ['sigma', 'σ', 'mi'],
    ['varsigma', 'ς', 'mi'], ['tau', 'τ', 'mi'], ['upsilon', 'υ', 'mi'], ['phi', 'ϕ', 'mi'],
    ['varphi', 'φ', 'mi'], ['chi', 'χ', 'mi'], ['psi', 'ψ', 'mi'], ['omega', 'ω', 'mi'],
    ['Gamma', 'Γ', 'mi'], ['Delta', 'Δ', 'mi'], ['Theta', 'Θ', 'mi'], ['Lambda', 'Λ', 'mi'],
    ['Xi', 'Ξ', 'mi'], ['Pi', 'Π', 'mi'], ['Sigma', 'Σ', 'mi'], ['Upsilon', 'Υ', 'mi'],
    ['Phi', 'Φ', 'mi'], ['Psi', 'Ψ', 'mi'], ['Omega', 'Ω', 'mi'],
    ['infty', '∞', 'mi'], ['emptyset', '∅', 'mi'], ['varnothing', '∅', 'mi'], ['partial', '∂', 'mi'],
    ['nabla', '∇', 'mi'], ['ell', 'ℓ', 'mi'], ['hbar', 'ℏ', 'mi'], ['aleph', 'ℵ', 'mi'],
    ['Re', 'ℜ', 'mi'], ['Im', 'ℑ', 'mi'], ['wp', '℘', 'mi'], ['angle', '∠', 'mi'],
    ['triangle', '△', 'mi'], ['square', '□', 'mi'], ['Box', '□', 'mi'], ['top', '⊤', 'mi'],
    ['backslash', '\\', 'ord'], ['prime', '′', 'ord'], ['degree', '°', 'ord'],
    ['le', '≤', 'rel'], ['leq', '≤', 'rel'], ['ge', '≥', 'rel'], ['geq', '≥', 'rel'],
    ['leqslant', '⩽', 'rel'], ['geqslant', '⩾', 'rel'], ['ne', '≠', 'rel'], ['neq', '≠', 'rel'],
    ['approx', '≈', 'rel'], ['equiv', '≡', 'rel'], ['sim', '∼', 'rel'], ['backsim', '∽', 'rel'],
    ['simeq', '≃', 'rel'], ['cong', '≅', 'rel'], ['propto', '∝', 'rel'], ['in', '∈', 'rel'],
    ['notin', '∉', 'rel'], ['ni', '∋', 'rel'], ['subset', '⊂', 'rel'], ['subseteq', '⊆', 'rel'],
    ['supset', '⊃', 'rel'], ['supseteq', '⊇', 'rel'], ['nsubseteq', '⊈', 'rel'], ['perp', '⊥', 'rel'],
    ['bot', '⊥', 'mi'], ['parallel', '∥', 'rel'], ['nparallel', '∦', 'rel'], ['mid', '∣', 'rel'],
    ['to', '→', 'rel'], ['rightarrow', '→', 'rel'], ['leftarrow', '←', 'rel'], ['gets', '←', 'rel'],
    ['leftrightarrow', '↔', 'rel'], ['Rightarrow', '⇒', 'rel'], ['Leftarrow', '⇐', 'rel'],
    ['Leftrightarrow', '⇔', 'rel'], ['implies', '⟹', 'rel'], ['Longrightarrow', '⟹', 'rel'],
    ['impliedby', '⟸', 'rel'], ['iff', '⟺', 'rel'], ['Longleftrightarrow', '⟺', 'rel'],
    ['longrightarrow', '⟶', 'rel'], ['longleftarrow', '⟵', 'rel'], ['mapsto', '↦', 'rel'],
    ['uparrow', '↑', 'rel'], ['downarrow', '↓', 'rel'], ['nearrow', '↗', 'rel'], ['searrow', '↘', 'rel'],
    ['ll', '≪', 'rel'], ['gg', '≫', 'rel'], ['prec', '≺', 'rel'], ['succ', '≻', 'rel'],
    ['vdash', '⊢', 'rel'], ['models', '⊨', 'rel'],
    ['pm', '±', 'bin'], ['mp', '∓', 'bin'], ['times', '×', 'bin'], ['div', '÷', 'bin'],
    ['cdot', '⋅', 'bin'], ['ast', '∗', 'bin'], ['star', '⋆', 'bin'], ['circ', '∘', 'bin'],
    ['bullet', '∙', 'bin'], ['cup', '∪', 'bin'], ['cap', '∩', 'bin'], ['setminus', '∖', 'bin'],
    ['wedge', '∧', 'bin'], ['land', '∧', 'bin'], ['vee', '∨', 'bin'], ['lor', '∨', 'bin'],
    ['oplus', '⊕', 'bin'], ['ominus', '⊖', 'bin'], ['otimes', '⊗', 'bin'], ['odot', '⊙', 'bin'],
    ['forall', '∀', 'ord'], ['exists', '∃', 'ord'], ['nexists', '∄', 'ord'], ['neg', '¬', 'ord'],
    ['lnot', '¬', 'ord'], ['therefore', '∴', 'ord'], ['because', '∵', 'ord'], ['ldots', '…', 'ord'],
    ['dots', '…', 'ord'], ['cdots', '⋯', 'ord'], ['vdots', '⋮', 'ord'], ['ddots', '⋱', 'ord'],
    ['sum', '∑', 'op'], ['prod', '∏', 'op'], ['coprod', '∐', 'op'], ['int', '∫', 'op'],
    ['iint', '∬', 'op'], ['iiint', '∭', 'op'], ['oint', '∮', 'op'], ['bigcup', '⋃', 'op'],
    ['bigcap', '⋂', 'op'], ['bigoplus', '⨁', 'op'], ['bigotimes', '⨂', 'op'],
    ['langle', '⟨', 'open'], ['rangle', '⟩', 'close'], ['lfloor', '⌊', 'open'], ['rfloor', '⌋', 'close'],
    ['lceil', '⌈', 'open'], ['rceil', '⌉', 'close'], ['lbrace', '{', 'open'], ['rbrace', '}', 'close'],
    ['lvert', '|', 'open'], ['rvert', '|', 'close'], ['lVert', '‖', 'open'], ['rVert', '‖', 'close'],
    ['vert', '|', 'ord'], ['Vert', '‖', 'ord']
  ];
  // Hàm chuẩn (\sin → chữ đứng); LIMLIKE: chỉ số đặt dưới/trên (munder) như \lim
  var FUNCS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh',
    'tanh', 'coth', 'log', 'ln', 'lg', 'exp', 'det', 'gcd', 'deg', 'dim', 'ker', 'arg', 'hom', 'Pr',
    'max', 'min', 'sup', 'inf', 'lim', 'liminf', 'limsup'];
  var LIMLIKE = { lim: 1, liminf: 1, limsup: 1, max: 1, min: 1, sup: 1, inf: 1, det: 1, gcd: 1, Pr: 1 };
  // tên hàm hay gặp ở Việt Nam nhưng không có lệnh LaTeX chuẩn → \operatorname{}
  var FUNC_EXTRA = ['tg', 'cotg', 'arccot', 'arctg', 'arccotg', 'sgn', 'lcm', 'sign'];
  // toán tử lớn đặt chỉ số dưới/trên (munderover) theo mặc định; ∫ thì dùng msubsup
  var LARGE_LIMITS = { '∑': 1, '∏': 1, '∐': 1, '⋃': 1, '⋂': 1, '⨁': 1, '⨂': 1 };

  var FUNC_SET = {}, EXTRA_SET = {};
  FUNCS.forEach(function (f) { FUNC_SET[f] = 1; });
  FUNC_EXTRA.forEach(function (f) { EXTRA_SET[f] = 1; });
  // tên hàm dài trước để tách 'tanx' → tan + x, 'cotgx' → cotg + x
  var TEN_HAM = FUNCS.concat(FUNC_EXTRA).sort(function (a, b) { return b.length - a.length; });

  // ký tự → [LaTeX, loại]
  var CHAR = {};
  SYM.forEach(function (r) { if (!CHAR[r[1]]) CHAR[r[1]] = ['\\' + r[0], r[2]]; });
  var CHAR_THEM = {
    '+': ['+', 'bin'], '-': ['-', 'bin'], '−': ['-', 'bin'], '‐': ['-', 'bin'], '–': ['-', 'bin'],
    '=': ['=', 'rel'], '<': ['<', 'rel'], '>': ['>', 'rel'], ':': [':', 'rel'], '∶': [':', 'rel'],
    ',': [',', 'punct'], ';': [';', 'punct'], '(': ['(', 'open'], ')': [')', 'close'],
    '[': ['[', 'open'], ']': [']', 'close'], '{': ['\\{', 'open'], '}': ['\\}', 'close'],
    '|': ['|', 'ord'], '‖': ['\\|', 'ord'], '!': ['!', 'ord'], '/': ['/', 'ord'], '⁄': ['/', 'ord'],
    '%': ['\\%', 'ord'], '#': ['\\#', 'ord'], '&': ['\\&', 'ord'], '$': ['\\$', 'ord'], '_': ['\\_', 'ord'],
    '~': ['\\sim', 'rel'], '·': ['\\cdot', 'bin'], '•': ['\\bullet', 'bin'], '*': ['*', 'bin'],
    '∆': ['\\Delta', 'mi'], '′': ["'", 'ord'], '″': ["''", 'ord'], '‴': ["'''", 'ord'], "'": ["'", 'ord'],
    '°': ['^{\\circ}', 'ord'], '.': ['.', 'ord'], '?': ['?', 'ord'], '^': ['\\text{^}', 'ord'],
    '〈': ['\\langle', 'open'], '〉': ['\\rangle', 'close'], '⇐': ['\\Leftarrow', 'rel'],
    '\u2061': ['', 'none'], '\u2062': ['', 'none'], '\u2063': ['', 'none'], '\u2064': ['', 'none'],
    '\u200b': ['', 'none']
  };
  Object.keys(CHAR_THEM).forEach(function (k) { CHAR[k] = CHAR_THEM[k]; }); // bảng bổ sung được ưu tiên

  var MO_MO = { '(': 1, '[': 1, '{': 1, '|': 1, '‖': 1, '⟨': 1, '⌊': 1, '⌈': 1, '〈': 1 };
  var MO_DONG = { ')': 1, ']': 1, '}': 1, '|': 1, '‖': 1, '⟩': 1, '⌋': 1, '⌉': 1, '〉': 1 };

  // chữ kép (\mathbb)
  var DS = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' };
  var DS_REV = {};
  Object.keys(DS).forEach(function (k) { DS_REV[DS[k]] = k; });

  // Khối chữ toán học U+1D400… → { ch, variant }
  var KHOI_CHU = [
    [0x1D400, 'bold'], [0x1D434, 'italic'], [0x1D468, 'bold-italic'], [0x1D49C, 'script'],
    [0x1D4D0, 'bold-script'], [0x1D504, 'fraktur'], [0x1D538, 'double-struck'], [0x1D56C, 'bold-fraktur'],
    [0x1D5A0, 'sans-serif'], [0x1D5D4, 'bold-sans-serif'], [0x1D608, 'sans-serif-italic'],
    [0x1D63C, 'sans-serif-bold-italic'], [0x1D670, 'monospace']
  ];
  var KHOI_SO = [[0x1D7CE, 'bold'], [0x1D7D8, 'double-struck'], [0x1D7E2, 'sans-serif'], [0x1D7EC, 'bold-sans-serif'], [0x1D7F6, 'monospace']];
  function giaiChuToan(cp) {
    if (cp < 0x1D400 || cp > 0x1D7FF) return null;
    if (cp >= 0x1D7CE) {
      for (var j = KHOI_SO.length - 1; j >= 0; j--) if (cp >= KHOI_SO[j][0]) return { ch: String(cp - KHOI_SO[j][0]), variant: KHOI_SO[j][1] };
      return null;
    }
    for (var i = KHOI_CHU.length - 1; i >= 0; i--) {
      var o = cp - KHOI_CHU[i][0];
      if (o >= 0 && o < 52) return { ch: String.fromCharCode(o < 26 ? 65 + o : 97 + o - 26), variant: KHOI_CHU[i][1] };
    }
    return null;
  }
  // chữ thường/đậm… → lệnh LaTeX bọc
  var LENH_KIEU = {
    'normal': '\\mathrm', 'bold': '\\mathbf', 'double-struck': '\\mathbb', 'script': '\\mathcal',
    'bold-script': '\\mathcal', 'fraktur': '\\mathfrak', 'bold-fraktur': '\\mathfrak', 'bold-italic': '\\boldsymbol',
    'sans-serif': '\\mathsf', 'bold-sans-serif': '\\mathsf', 'sans-serif-italic': '\\mathsf',
    'sans-serif-bold-italic': '\\mathsf', 'monospace': '\\mathtt'
  };

  /* ===================== Mũ / chỉ số Unicode ===================== */
  var SUP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'a': 'ᵃ', 'b': 'ᵇ',
    'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ',
    'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ',
    'z': 'ᶻ', 'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴷ',
    'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'T': 'ᵀ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ',
    'α': 'ᵅ', 'β': 'ᵝ', 'γ': 'ᵞ', 'δ': 'ᵟ', 'θ': 'ᶿ', 'φ': 'ᵠ', 'χ': 'ᵡ', '∘': '°', '°': '°'
  };
  var SUB = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ',
    'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ',
    'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ', 'β': 'ᵦ', 'γ': 'ᵧ', 'ρ': 'ᵨ', 'φ': 'ᵩ', 'χ': 'ᵪ'
  };
  var DA_SUP = {}, DA_SUB = {};
  Object.keys(SUP).forEach(function (k) { DA_SUP[SUP[k]] = 1; });
  Object.keys(SUB).forEach(function (k) { DA_SUB[SUB[k]] = 1; });
  function doiBang(s, bang, da) {
    var out = '', cs = Array.from(s);
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c === ' ') continue;
      if (da[c]) { out += c; continue; }
      if (!bang[c]) return null;
      out += bang[c];
    }
    return out || null;
  }
  function boc(s) { return Array.from(s).length === 1 || laBocNgoac(s) ? s : '(' + s + ')'; }
  // Mũ dạng chữ: 'x2'→ ... ; không đổi được thì dùng ^(...)
  function supText(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    var m = doiBang(s, SUP, DA_SUP);
    return m != null ? m : '^' + boc(s);
  }
  function subText(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    var m = doiBang(s, SUB, DA_SUB);
    return m != null ? m : '_' + boc(s);
  }
  // s có dạng (…) với ngoặc đầu đóng đúng ở ký tự cuối
  function laBocNgoac(s) {
    if (s.charAt(0) !== '(' || s.charAt(s.length - 1) !== ')') return false;
    var d = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '(') d++;
      else if (c === ')') { d--; if (d === 0 && i < s.length - 1) return false; }
    }
    return d === 0;
  }

  /* ===================== Đọc cây MathML ===================== */
  function ten(n) {
    var s = (n && n.name) || '';
    var i = s.lastIndexOf(':');
    return (i >= 0 ? s.slice(i + 1) : s).toLowerCase();
  }
  function laEl(n) { return !!n && n.type === 'el'; }
  function conEl(n) { return (n.children || []).filter(laEl); }
  function thuocTinh(n, k) { var a = n && n.attrs; return a && Object.prototype.hasOwnProperty.call(a, k) ? String(a[k]) : ''; }
  // chữ của nút token: gộp khoảng trắng ASCII, cắt hai đầu (không đụng tới khoảng trắng Unicode)
  function chuToken(n) { return core.xmlText(n).replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, ''); }

  function docGoc(x) {
    var nut;
    if (x && typeof x === 'object') nut = x;
    else {
      var s = String(x == null ? '' : x), h = H();
      nut = h ? h.parseHtml(s) : core.parseXml(s);
    }
    if (ten(nut) === 'math') return nut;
    var m = core.find(nut, function (e) { return ten(e) === 'math'; });
    return m || nut; // mảnh MathML không có <math>: coi như một hàng
  }

  // tách 'tanx' → ['tan', 'x']
  function tachHam(t) {
    for (var i = 0; i < TEN_HAM.length; i++) {
      var f = TEN_HAM[i];
      if (t.length > f.length && t.slice(0, f.length) === f) {
        var con = t.slice(f.length);
        if (/^[A-Za-z0-9α-ωΑ-Ω]{1,3}$/.test(con)) return [f, con];
      }
    }
    return null;
  }

  // Bố cục mẫu "ngoặc mở + mtable (+ ngoặc đóng)" trong một hàng → { open, close, bang, buoc }
  function timBangCoNgoac(kids, i) {
    var n = kids[i];
    if (ten(n) !== 'mo' || i + 1 >= kids.length || ten(kids[i + 1]) !== 'mtable') return null;
    var o = chuToken(n);
    if (!MO_MO[o]) return null;
    var c = '', buoc = 1;
    if (i + 2 < kids.length && ten(kids[i + 2]) === 'mo') {
      var ct = chuToken(kids[i + 2]);
      if (MO_DONG[ct] || ct === '') { c = ct; buoc = 2; }
    }
    return { open: o, close: c, bang: kids[i + 1], buoc: buoc };
  }
  // mfenced chỉ chứa một mtable
  function bangTrongMfenced(n) {
    var k = conEl(n);
    if (k.length === 1 && ten(k[0]) === 'mtable') {
      var o = n.attrs && n.attrs.open != null ? n.attrs.open : '(';
      var c = n.attrs && n.attrs.close != null ? n.attrs.close : ')';
      return { open: o, close: c, bang: k[0] };
    }
    return null;
  }
  function hangCuaBang(bang) {
    return conEl(bang).filter(function (r) { var t = ten(r); return t === 'mtr' || t === 'mlabeledtr'; }).map(function (r) {
      var o = conEl(r).filter(function (c) { return ten(c) === 'mtd'; });
      if (ten(r) === 'mlabeledtr') o = o.slice(1); // bỏ nhãn phương trình
      return o;
    });
  }

  /* ===================== MathML → LaTeX ===================== */
  function chuLatex(ch) {
    var e = CHAR[ch];
    if (e) return e[0];
    if (DS_REV[ch]) return '\\mathbb{' + DS_REV[ch] + '}';
    var ma = giaiChuToan(ch.codePointAt(0));
    if (ma) return ma.variant === 'italic' ? ma.ch : (LENH_KIEU[ma.variant] || '') + '{' + ma.ch + '}';
    if (ch === '\u00a0') return '\\ ';
    return ch;
  }
  function chuoiLatex(t) {
    var out = '';
    Array.from(t).forEach(function (c) { out = noiLatex(out, '', chuLatex(c)); });
    return out;
  }
  function noiLatex(a, sep, b) {
    if (!sep && /\\[A-Za-z]+$/.test(a) && /^[A-Za-z]/.test(b)) sep = ' ';
    return a + sep + b;
  }
  function loaiChu(ch) { var e = CHAR[ch]; return e ? e[1] : 'ord'; }

  function miLatex(n) {
    var t = chuToken(n);
    if (!t) return null;
    var v = thuocTinh(n, 'mathvariant');
    var cs = Array.from(t);
    if (cs.length === 1) {
      if (v && v !== 'italic' && /^[A-Za-z0-9]$/.test(t)) return { s: (LENH_KIEU[v] || '') + '{' + t + '}', k: 'ord' };
      return { s: chuLatex(t), k: 'ord' };
    }
    if (FUNC_SET[t]) return { s: '\\' + t, k: LIMLIKE[t] ? 'lim' : 'func' };
    if (EXTRA_SET[t]) return { s: '\\operatorname{' + t + '}', k: 'func' };
    var th = tachHam(t);
    if (th) return { s: (FUNC_SET[th[0]] ? '\\' + th[0] : '\\operatorname{' + th[0] + '}') + ' ' + chuoiLatex(th[1]), k: 'ord' };
    if (v && v !== 'italic' && LENH_KIEU[v] && /^[A-Za-z0-9 ]+$/.test(t)) return { s: LENH_KIEU[v] + '{' + t + '}', k: 'ord' };
    return { s: chuoiLatex(t), k: 'ord' };
  }
  function moLatex(n) {
    var t = chuToken(n);
    var keo = thuocTinh(n, 'stretchy') !== 'false';
    if (t === '') return { s: '', k: 'none', mo: '', keo: keo };
    var cs = Array.from(t);
    if (cs.length > 1) {
      if (FUNC_SET[t]) return { s: '\\' + t, k: LIMLIKE[t] ? 'lim' : 'func' };
      if (t === 'mod') return { s: '\\bmod', k: 'bin' };
      if (EXTRA_SET[t] || /^[A-Za-z]+$/.test(t)) return { s: '\\operatorname{' + t + '}', k: 'func' };
      return { s: chuoiLatex(t), k: 'ord' };
    }
    var k = loaiChu(t);
    if (k === 'mi') k = 'ord';
    return { s: chuLatex(t), k: k, mo: t, keo: keo };
  }
  function mnLatex(n) {
    var t = chuToken(n);
    if (!t) return null;
    // dấu phẩy thập phân kiểu Việt Nam: 0,5 → 0{,}5 (không bị thêm khoảng sau dấu phẩy)
    var s = '';
    Array.from(t).forEach(function (c) { s = noiLatex(s, '', /[0-9.,]/.test(c) ? c : chuLatex(c)); });
    return { s: s.replace(/([0-9]),(?=[0-9])/g, '$1{,}'), k: 'ord' };
  }
  var KHOANG_LATEX = { '\u2009': '\\,', '\u200a': '\\,', '\u2006': '\\,', '\u205f': '\\:', '\u2005': '\\:', '\u2004': '\\;', '\u2002': '\\enspace', '\u2003': '\\quad', '\u00a0': '\\ ', ' ': '\\ ' };
  function mtextLatex(n) {
    var raw = core.xmlText(n).replace(/[\t\n\r\f]+/g, ' ');
    if (!raw) return null;
    if (/^[\s\u200b]+$/.test(raw)) {
      var out = '';
      var cs = Array.from(raw);
      for (var i = 0; i < cs.length; i++) {
        if (cs[i] === '\u2003' && cs[i + 1] === '\u2003') { out = noiLatex(out, '', '\\qquad'); i++; continue; }
        var l = KHOANG_LATEX[cs[i]];
        if (l) out = noiLatex(out, '', l);
      }
      return out ? { s: out, k: 'text' } : null;
    }
    var t = raw.replace(/\u00a0/g, ' ').replace(/[{}]/g, function (c) { return '\\' + c; });
    var v = thuocTinh(n, 'mathvariant');
    var lenh = v === 'bold' ? '\\textbf' : v === 'italic' ? '\\textit' : '\\text';
    return { s: lenh + '{' + t + '}', k: 'text' };
  }
  function doDaiEm(w) {
    var m = /^\s*(-?[0-9.]+)\s*(em|ex|px|pt|mu)?\s*$/.exec(String(w || ''));
    if (m) {
      var v = parseFloat(m[1]), u = m[2] || 'em';
      return u === 'px' ? v / 16 : u === 'pt' ? v / 10 : u === 'ex' ? v / 2 : u === 'mu' ? v / 18 : v;
    }
    var ten2 = { veryverythinmathspace: 1 / 18, verythinmathspace: 2 / 18, thinmathspace: 3 / 18, mediummathspace: 4 / 18, thickmathspace: 5 / 18, verythickmathspace: 6 / 18, veryverythickmathspace: 7 / 18 };
    return ten2[String(w || '').trim()] || 0;
  }
  function mspaceLatex(n) {
    if (thuocTinh(n, 'linebreak') === 'newline') return { s: '\\\\', k: 'text' };
    var em = doDaiEm(thuocTinh(n, 'width'));
    if (em <= 0) return null;
    var s = em < 0.2 ? '\\,' : em < 0.4 ? '\\;' : em < 0.8 ? '\\enspace' : em < 1.5 ? '\\quad' : '\\qquad';
    return { s: s, k: 'text' };
  }

  // cơ sở của mũ/chỉ số: bọc {} khi không phải một đơn vị
  function coSoLatex(n) {
    var a = L(n);
    if (!a || a.s === '') return { s: '{}', k: 'ord' };
    var s = a.s, t = ten(n);
    var don = /^(\\[A-Za-z]+|\\.|[^\\{}\s])$/.test(s) ||
      ((t === 'mn') && /^[0-9]+$/.test(s)) ||
      /^\\(math[a-z]+|vec|bar|hat|tilde|dot|ddot|overline|overrightarrow|widehat|operatorname)\{[^{}]*\}$/.test(s) ||
      ((t === 'mrow' || t === 'mfenced') && (laBocNgoac(s) || /^\\left[\s\S]*\\right\S+$/.test(s) && demLeft(s))) ||
      (a.k === 'func' || a.k === 'lim');
    return { s: don ? s : '{' + s + '}', k: a.k };
  }
  function demLeft(s) { // \left…\right bao toàn bộ chuỗi
    var d = 0, re = /\\(left|right)(?![A-Za-z])/g, m, cuoi = -1;
    while ((m = re.exec(s))) {
      if (m[1] === 'left') d++; else { d--; if (d === 0) { cuoi = m.index; if (s.indexOf('\\left', m.index) !== -1) return false; } }
    }
    return d === 0 && cuoi >= 0;
  }
  function laPhay(n) { var t = ten(n); if (t !== 'mo' && t !== 'mi') return ''; var c = chuToken(n); return (c === '′' || c === '″' || c === '‴' || c === "'") ? c : ''; }
  var PHAY_LATEX = { '′': "'", "'": "'", '″': "''", '‴': "'''" };
  function laDo(n) { var t = ten(n); if (t !== 'mo' && t !== 'mi') return false; var c = chuToken(n); return c === '∘' || c === '°'; }
  function chiSo(base, sub, sup) {
    var b = coSoLatex(base);
    var k = (b.k === 'func' || b.k === 'lim' || b.k === 'op') ? b.k : 'ord';
    var s = b.s;
    if (sub) s += '_{' + Ls(sub) + '}';
    if (sup) {
      var p = laPhay(sup);
      if (p && !sub) s += PHAY_LATEX[p];
      else if (laDo(sup)) s += '^{\\circ}';
      else s += '^{' + Ls(sup) + '}';
    }
    return { s: s, k: k, chiSo: true };
  }
  function laToanTuGioiHan(n) {
    var t = ten(n);
    if (t === 'mrow' && conEl(n).length === 1) return laToanTuGioiHan(conEl(n)[0]);
    if (t !== 'mo' && t !== 'mi') return false;
    var c = chuToken(n);
    return !!(LIMLIKE[c] || LARGE_LIMITS[c] || loaiChu(c) === 'op');
  }

  // dấu mũ trên (mover) → [lệnh 1 ký tự, lệnh nhiều ký tự]
  var DAU_TREN = {
    '→': ['\\vec', '\\overrightarrow'], '\u20d7': ['\\vec', '\\overrightarrow'], '⟶': ['\\vec', '\\overrightarrow'],
    '←': ['\\overleftarrow', '\\overleftarrow'], '\u20d6': ['\\overleftarrow', '\\overleftarrow'],
    '¯': ['\\bar', '\\overline'], '‾': ['\\bar', '\\overline'], '\u0305': ['\\bar', '\\overline'], '―': ['\\bar', '\\overline'], '_': ['\\bar', '\\overline'],
    '^': ['\\hat', '\\widehat'], 'ˆ': ['\\hat', '\\widehat'], '\u0302': ['\\hat', '\\widehat'],
    '~': ['\\tilde', '\\widetilde'], '˜': ['\\tilde', '\\widetilde'], '\u0303': ['\\tilde', '\\widetilde'],
    '˙': ['\\dot', '\\dot'], '\u0307': ['\\dot', '\\dot'], '¨': ['\\ddot', '\\ddot'], '\u0308': ['\\ddot', '\\ddot'],
    'ˇ': ['\\check', '\\check'], '˘': ['\\breve', '\\breve'], '´': ['\\acute', '\\acute'], '`': ['\\grave', '\\grave'],
    '˚': ['\\mathring', '\\mathring'], '⏞': ['\\overbrace', '\\overbrace']
  };
  var DAU_CUNG = { '⌢': 1, '⏜': 1, '⁀': 1 };
  var DAU_DUOI = { '_': '\\underline', '\u0332': '\\underline', '‾': '\\underline', '¯': '\\underline', '⏟': '\\underbrace', '→': '\\underrightarrow', '←': '\\underleftarrow' };
  function motKyTu(n) {
    var t = ten(n);
    if (t === 'mrow' && conEl(n).length === 1) return motKyTu(conEl(n)[0]);
    return (t === 'mi' || t === 'mn' || t === 'mo') && Array.from(chuToken(n)).length === 1;
  }
  function chuDau(n) { var t = ten(n); if (t === 'mrow' && conEl(n).length === 1) return chuDau(conEl(n)[0]); return (t === 'mo' || t === 'mi' || t === 'mtext') ? chuToken(n) : null; }

  function moverLatex(base, over) {
    var o = chuDau(over);
    if (laToanTuGioiHan(base)) return chiSo(base, null, over);
    if (o != null && DAU_TREN[o]) { var d = DAU_TREN[o]; return { s: (motKyTu(base) ? d[0] : d[1]) + '{' + Ls(base) + '}', k: 'ord' }; }
    if (o != null && DAU_CUNG[o]) return { s: '\\overset{\\frown}{' + Ls(base) + '}', k: 'ord' };
    var b = chuDau(base);
    if (b === '→' || b === '⟶') return { s: '\\xrightarrow{' + Ls(over) + '}', k: 'rel' };
    if (b === '←') return { s: '\\xleftarrow{' + Ls(over) + '}', k: 'rel' };
    var kb = L(base);
    return { s: '\\overset{' + Ls(over) + '}{' + (kb ? kb.s : '') + '}', k: kb && kb.k === 'rel' ? 'rel' : 'ord' };
  }
  function munderLatex(base, under) {
    var u = chuDau(under);
    if (laToanTuGioiHan(base)) return chiSo(base, under, null);
    if (u != null && DAU_DUOI[u]) return { s: DAU_DUOI[u] + '{' + Ls(base) + '}', k: 'ord' };
    var kb = L(base);
    return { s: '\\underset{' + Ls(under) + '}{' + (kb ? kb.s : '') + '}', k: kb && kb.k === 'rel' ? 'rel' : 'ord' };
  }

  function bangLatex(bang, open, close) {
    var hang = hangCuaBang(bang).map(function (r) { return r.map(function (c) { return hangLatex(c.children || []); }); });
    var soCot = hang.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
    var than = hang.map(function (r) { return r.join(' & '); }).join(' \\\\ ');
    var ca = (thuocTinh(bang, 'columnalign') || '').trim().split(/\s+/).filter(Boolean);
    function spec() {
      var o = '';
      for (var i = 0; i < soCot; i++) { var a = ca[Math.min(i, ca.length - 1)] || 'center'; o += a.charAt(0) === 'l' ? 'l' : a.charAt(0) === 'r' ? 'r' : 'c'; }
      return o;
    }
    if (open === '{' && !close) return '\\begin{cases} ' + than + ' \\end{cases}';
    if (!open && !close) {
      if (ca.join(' ') === 'right left') return '\\begin{aligned} ' + than + ' \\end{aligned}';
      if (ca.length && ca.some(function (a) { return a !== 'center'; })) return '\\begin{array}{' + spec() + '} ' + than + ' \\end{array}';
      return '\\begin{matrix} ' + than + ' \\end{matrix}';
    }
    var env = { '()': 'pmatrix', '[]': 'bmatrix', '{}': 'Bmatrix', '||': 'vmatrix', '‖‖': 'Vmatrix' }[open + close];
    if (env) return '\\begin{' + env + '} ' + than + ' \\end{' + env + '}';
    var l = function (c) { return c ? (CHAR[c] ? CHAR[c][0] : c) : '.'; };
    return '\\left' + l(open) + '\\begin{array}{' + spec() + '} ' + than + ' \\end{array}\\right' + l(close);
  }

  function noiNguyenTuLatex(atoms) {
    var out = '', truoc = null;
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      if (!a || a.k === 'none') continue;
      var k = a.k;
      if (k === 'bin' && (truoc === null || truoc === 'bin' || truoc === 'rel' || truoc === 'open' || truoc === 'punct' || truoc === 'op')) k = 'ord';
      var sep = '';
      if (truoc !== null && (k === 'rel' || k === 'bin' || truoc === 'rel' || truoc === 'bin' || truoc === 'punct')) sep = ' ';
      out = noiLatex(out, sep, a.s);
      truoc = k;
    }
    return out;
  }
  function hangLatex(kids) {
    kids = kids.filter(laEl);
    var atoms = [];
    for (var i = 0; i < kids.length; i++) {
      var b = timBangCoNgoac(kids, i);
      if (b) { atoms.push({ s: bangLatex(b.bang, b.open, b.close), k: 'ord' }); i += b.buoc; continue; }
      var a = L(kids[i]);
      if (a) atoms.push(a);
    }
    // mrow bắt đầu bằng ngoặc co giãn và kết thúc bằng ngoặc đóng → \left … \right
    var dau = atoms[0], cuoi = atoms[atoms.length - 1];
    if (atoms.length >= 3 && dau.mo !== undefined && cuoi.mo !== undefined && dau.keo && cuoi.keo &&
        (MO_MO[dau.mo] || dau.mo === '') && (MO_DONG[cuoi.mo] || cuoi.mo === '') && (dau.mo || cuoi.mo)) {
      var giua = noiNguyenTuLatex(atoms.slice(1, -1));
      return '\\left' + (dau.mo ? dau.s : '.') + ' ' + giua + ' \\right' + (cuoi.mo ? cuoi.s : '.');
    }
    return noiNguyenTuLatex(atoms);
  }
  function Ls(n) { var a = L(n); return a ? a.s : ''; }

  function L(n) {
    if (!n) return null;
    if (n.type === 'text') { var tt = n.text.replace(/\s+/g, ' ').trim(); return tt ? { s: chuoiLatex(tt), k: 'ord' } : null; }
    if (!laEl(n)) return null;
    var t = ten(n), k = conEl(n);
    switch (t) {
      case 'mi': return miLatex(n);
      case 'mn': return mnLatex(n);
      case 'mo': return moLatex(n);
      case 'mtext': return mtextLatex(n);
      case 'ms': return { s: '\\text{"' + chuToken(n) + '"}', k: 'ord' };
      case 'mspace': return mspaceLatex(n);
      case 'mglyph': return { s: chuoiLatex(thuocTinh(n, 'alt')), k: 'ord' };
      case 'none': case 'mprescripts': case 'annotation': case 'annotation-xml': return null;
      case 'mfrac': {
        var a = Ls(k[0]), b = Ls(k[1]);
        var lt = thuocTinh(n, 'linethickness');
        if (/^0(\.0*)?([a-z]+|%)?$/.test(lt.trim())) return { s: '\\genfrac{}{}{0pt}{}{' + a + '}{' + b + '}', k: 'ord' };
        if (thuocTinh(n, 'bevelled') === 'true') return { s: '{' + a + '}/{' + b + '}', k: 'ord' };
        return { s: '\\frac{' + a + '}{' + b + '}', k: 'ord' };
      }
      case 'msqrt': return { s: '\\sqrt{' + hangLatex(n.children || []) + '}', k: 'ord' };
      case 'mroot': return { s: '\\sqrt[' + Ls(k[1]) + ']{' + Ls(k[0]) + '}', k: 'ord' };
      case 'msup':
        if (k[0] && ten(k[0]) === 'msub' && conEl(k[0]).length >= 2) { // (v_0)^2 → v_{0}^{2}
          var kk = conEl(k[0]);
          return chiSo(kk[0], kk[1], k[1]);
        }
        return chiSo(k[0], null, k[1]);
      case 'msub': return chiSo(k[0], k[1], null);
      case 'msubsup': return chiSo(k[0], k[1], k[2]);
      case 'munder': return munderLatex(k[0], k[1]);
      case 'mover': return moverLatex(k[0], k[1]);
      case 'munderover':
        if (laToanTuGioiHan(k[0])) return chiSo(k[0], k[1], k[2]);
        return { s: '\\overset{' + Ls(k[2]) + '}{' + munderLatex(k[0], k[1]).s + '}', k: 'ord' };
      case 'mmultiscripts': {
        var base = k[0], tr = '', sau = '', truocDau = false, ds = k.slice(1);
        for (var i = 0; i < ds.length; i++) {
          if (ten(ds[i]) === 'mprescripts') { truocDau = true; continue; }
          var sb = ds[i], sp = ds[i + 1]; i++;
          var p = (sb && ten(sb) !== 'none' ? '_{' + Ls(sb) + '}' : '') + (sp && ten(sp) !== 'none' ? '^{' + Ls(sp) + '}' : '');
          if (truocDau) tr += p; else sau += p;
        }
        return { s: (tr ? '{}' + tr : '') + coSoLatex(base).s + sau, k: 'ord' };
      }
      case 'mtable': return { s: bangLatex(n, '', ''), k: 'ord' };
      case 'mfenced': {
        var bf = bangTrongMfenced(n);
        if (bf) return { s: bangLatex(bf.bang, bf.open, bf.close), k: 'ord' };
        var o = n.attrs && n.attrs.open != null ? n.attrs.open : '(';
        var c = n.attrs && n.attrs.close != null ? n.attrs.close : ')';
        var seps = (n.attrs && n.attrs.separators != null ? n.attrs.separators : ',').replace(/\s+/g, '');
        var parts = k.map(Ls), s = '';
        for (var j = 0; j < parts.length; j++) {
          if (j > 0) s += (seps ? (seps.charAt(Math.min(j - 1, seps.length - 1))) + ' ' : ' ');
          s += parts[j];
        }
        var lc = function (x) { return x ? (CHAR[x] ? CHAR[x][0] : x) : '.'; };
        return { s: '\\left' + lc(o) + ' ' + s + ' \\right' + lc(c), k: 'ord' };
      }
      case 'menclose': {
        var nt = thuocTinh(n, 'notation') || 'longdiv';
        var noi = hangLatex(n.children || []);
        if (/box/.test(nt)) return { s: '\\boxed{' + noi + '}', k: 'ord' };
        if (/strike/.test(nt)) return { s: '\\cancel{' + noi + '}', k: 'ord' };
        if (/radical/.test(nt)) return { s: '\\sqrt{' + noi + '}', k: 'ord' };
        return { s: noi, k: 'ord' };
      }
      case 'mphantom': return { s: '\\phantom{' + hangLatex(n.children || []) + '}', k: 'ord' };
      case 'mstyle': {
        var ds2 = thuocTinh(n, 'displaystyle'), mau = thuocTinh(n, 'mathcolor');
        if (k.length === 1 && ten(k[0]) === 'mfrac' && !mau && (ds2 === 'true' || ds2 === 'false')) {
          var f = L(k[0]);
          if (/^\\frac\{/.test(f.s)) return { s: (ds2 === 'true' ? '\\dfrac' : '\\tfrac') + f.s.slice(5), k: 'ord' };
          return f;
        }
        var inner = hangLatex(n.children || []);
        if (!inner) return null;
        if (ds2 === 'true') inner = '{\\displaystyle ' + inner + '}';
        if (mau) inner = '\\color{' + mau + '}{' + inner + '}';
        return { s: inner, k: 'ord' };
      }
      case 'semantics': {
        var trinhBay = k.filter(function (x) { var tx = ten(x); return tx !== 'annotation' && tx !== 'annotation-xml'; })[0];
        return trinhBay ? L(trinhBay) : null;
      }
      case 'maction': return k[0] ? L(k[0]) : null;
      default: { // math, mrow, mpadded, merror và thẻ lạ: một hàng
        var r = hangLatex(n.children || []);
        if (!r) return null;
        // mrow chỉ một con: giữ loại của con (để \sin trong <mrow> vẫn là hàm)
        if (k.length === 1 && t !== 'math' && !timBangCoNgoac(k, 0)) { var a1 = L(k[0]); if (a1) return { s: r, k: a1.k, mo: a1.mo, keo: a1.keo }; }
        return { s: r, k: 'ord' };
      }
    }
  }

  function mathmlToLatex(mathml) {
    var goc = docGoc(mathml);
    if (!goc) return '';
    var s = ten(goc) === 'math' || ten(goc) === '#fragment' ? hangLatex(goc.children || []) : Ls(goc);
    return s.replace(/[ ]{2,}/g, ' ').trim();
  }

  /* ===================== MathML → chữ Unicode ===================== */
  var VULGAR = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
  var CHU_MO = { '⋅': '·', '\u2061': '', '\u2062': '', '\u2063': '', '\u2064': '', '\u200b': '' };
  function laDon(s) { // biểu thức "một khối": không cần ngoặc khi làm tử/mẫu/cơ số
    return /^[\p{L}\p{N}\p{M}′″°.,!]+$/u.test(s) || laBocNgoac(s) || /^√[\p{L}\p{N}\p{M}.,]+$/u.test(s) || /^√\(.*\)$/.test(s) && laBocNgoac(s.slice(1));
  }
  function goi(s) { return laDon(s) || (/^[−-]/.test(s) && laDon(s.slice(1))) ? s : '(' + s + ')'; }
  // dưới dấu căn: chỉ bỏ ngoặc khi là một số hoặc một ký hiệu (√2, √x; còn √(2x))
  function laToken(n) { // một mi/mn duy nhất (kể cả bọc trong mrow): 'ID', '12'
    var t = ten(n);
    if (t === 'mrow' && conEl(n).length === 1) return laToken(conEl(n)[0]);
    return (t === 'mi' || t === 'mn') && !/\s/.test(chuToken(n));
  }
  function laMotKhoi(s) { return /^[\p{N}.,]+$/u.test(s) || /^\p{L}\p{M}*$/u.test(s) || laBocNgoac(s); }
  function chuVariant(t, v) {
    if (v === 'double-struck') return Array.from(t).map(function (c) { return DS[c] || c; }).join('');
    return t;
  }
  function noiNguyenTuChu(atoms, gon) {
    var out = '', truoc = null, aTruoc = null;
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      if (!a || a.k === 'none' || a.s === '') continue;
      var k = a.k;
      if (k === 'bin' && (truoc === null || truoc === 'bin' || truoc === 'rel' || truoc === 'open' || truoc === 'punct' || truoc === 'op')) k = 'ord';
      var sep = '';
      if (truoc !== null) {
        if (!gon && (k === 'rel' || k === 'bin' || truoc === 'rel' || truoc === 'bin')) sep = ' ';
        else if (!gon && truoc === 'punct') sep = ' ';
        else if ((truoc === 'func' || truoc === 'lim') && /^[\p{L}\p{N}√∞]/u.test(a.s)) sep = ' ';
        else if (!gon && (truoc === 'op' || truoc === 'lim') && aTruoc.chiSo && k !== 'close' && k !== 'punct') sep = ' ';
      }
      out += sep + a.s;
      truoc = k; aTruoc = a;
    }
    return out;
  }
  function hangChu(kids, gon) {
    kids = kids.filter(laEl);
    var atoms = [];
    for (var i = 0; i < kids.length; i++) {
      var b = timBangCoNgoac(kids, i);
      if (b) { atoms.push({ s: bangChu(b.bang, b.open, b.close), k: 'ord' }); i += b.buoc; continue; }
      var a = T(kids[i], gon);
      if (a) atoms.push(a);
    }
    return noiNguyenTuChu(atoms, gon);
  }
  function bangChu(bang, open, close) {
    var hang = hangCuaBang(bang).map(function (r) { return r.map(function (c) { return hangChu(c.children || [], false); }).join(', '); });
    var than = hang.join('; ');
    if (open === '{' && !close) close = '}';
    else if (open === '[' && !close) close = ']';
    return (open || '') + than + (close || '');
  }
  function Ts(n, gon) { var a = T(n, gon); return a ? a.s : ''; }
  function chiSoChu(base, sub, sup, gon) {
    var b = T(base, gon);
    var bs = b ? b.s : '';
    var k = b && (b.k === 'func' || b.k === 'lim' || b.k === 'op') ? b.k : 'ord';
    if (k === 'ord' && bs && Array.from(bs).length > 1 && !laDon(bs)) bs = '(' + bs + ')';
    var s = bs;
    if (sub) s += subText(Ts(sub, true));
    if (sup) {
      var p = laPhay(sup);
      if (p) s += (p === "'" ? '′' : p);
      else if (laDo(sup)) s += '°';
      else s += supText(Ts(sup, true));
    }
    return { s: s, k: k, chiSo: true };
  }
  function moverChu(base, over, gon) {
    var o = chuDau(over);
    if (laToanTuGioiHan(base)) return chiSoChu(base, null, over, gon);
    var b = Ts(base, gon);
    if (o != null && DAU_TREN[o]) {
      var lenh = DAU_TREN[o][0];
      var nhieu = Array.from(b).length > 1;
      if (lenh === '\\vec' || lenh === '\\overleftarrow') return { s: b + (lenh === '\\vec' ? '\u20d7' : '\u20d6'), k: 'ord' };
      if (lenh === '\\bar') return { s: Array.from(b).map(function (c) { return c + '\u0305'; }).join(''), k: 'ord' };
      if (lenh === '\\hat') return { s: nhieu ? '∠' + b : b + '\u0302', k: 'ord' };
      if (lenh === '\\tilde') return { s: b + '\u0303', k: 'ord' };
      if (lenh === '\\dot') return { s: b + '\u0307', k: 'ord' };
      if (lenh === '\\ddot') return { s: b + '\u0308', k: 'ord' };
      return { s: b, k: 'ord' };
    }
    if (o != null && DAU_CUNG[o]) return { s: '⌒' + b, k: 'ord' };
    var kb = T(base, gon);
    return { s: (laDon(b) ? b : '(' + b + ')') + supText(Ts(over, true)), k: kb && kb.k === 'rel' ? 'rel' : 'ord' };
  }
  function munderChu(base, under, gon) {
    var u = chuDau(under);
    if (laToanTuGioiHan(base)) return chiSoChu(base, under, null, gon);
    var b = Ts(base, gon);
    if (u != null && DAU_DUOI[u] === '\\underline') return { s: Array.from(b).map(function (c) { return c + '\u0332'; }).join(''), k: 'ord' };
    if (u != null && DAU_DUOI[u]) return { s: b, k: 'ord' };
    var kb = T(base, gon);
    return { s: (laDon(b) ? b : '(' + b + ')') + subText(Ts(under, true)), k: kb && kb.k === 'rel' ? 'rel' : 'ord' };
  }
  function T(n, gon) {
    if (!n) return null;
    if (n.type === 'text') { var tt = n.text.replace(/\s+/g, ' ').trim(); return tt ? { s: tt, k: 'ord' } : null; }
    if (!laEl(n)) return null;
    var t = ten(n), k = conEl(n);
    switch (t) {
      case 'mi': {
        var x = chuToken(n);
        if (!x) return null;
        if (FUNC_SET[x] || EXTRA_SET[x]) return { s: x, k: LIMLIKE[x] ? 'lim' : 'func' };
        var th = tachHam(x);
        if (th) return { s: th[0] + ' ' + th[1], k: 'ord' };
        return { s: chuVariant(x, thuocTinh(n, 'mathvariant')), k: 'ord' };
      }
      case 'mn': { var y = chuToken(n); return y ? { s: y, k: 'ord' } : null; }
      case 'mo': {
        var z = chuToken(n);
        if (z === '') return { s: '', k: 'none' };
        if (Array.from(z).length > 1) return { s: z, k: (FUNC_SET[z] || EXTRA_SET[z] || /^[A-Za-z]+$/.test(z)) ? (LIMLIKE[z] ? 'lim' : 'func') : 'ord' };
        var kk = loaiChu(z);
        if (kk === 'mi') kk = 'ord';
        if (z === ':' || z === '∶') kk = 'punct';
        if (z === '·' || z === '⋅' || z === '∘' || z === '∙') kk = 'ord'; // nhân/hợp: viết liền
        if (CHU_MO[z] !== undefined) return CHU_MO[z] ? { s: CHU_MO[z], k: kk } : { s: '', k: 'none' };
        return { s: z, k: kk };
      }
      case 'mtext': case 'ms': {
        var w = core.xmlText(n).replace(/[\t\n\r\f]+/g, ' ');
        if (!w) return null;
        if (/^\s+$/.test(w)) return { s: ' ', k: 'text' };
        return { s: t === 'ms' ? '"' + w.trim() + '"' : w, k: 'text' };
      }
      case 'mspace': return doDaiEm(thuocTinh(n, 'width')) > 0 || thuocTinh(n, 'linebreak') ? { s: ' ', k: 'text' } : null;
      case 'mglyph': return { s: thuocTinh(n, 'alt'), k: 'ord' };
      case 'none': case 'mprescripts': case 'annotation': case 'annotation-xml': case 'mphantom': return null;
      case 'mfrac': {
        var a = Ts(k[0], gon).trim(), b = Ts(k[1], gon).trim();
        if (/^\d+$/.test(a) && /^\d+$/.test(b) && VULGAR[a + '/' + b]) return { s: VULGAR[a + '/' + b], k: 'ord' };
        // mẫu nhiều ký hiệu luôn có ngoặc: (−b ± √Δ)/(2a)
        return { s: goi(a) + '/' + (laMotKhoi(b) || laToken(k[1]) ? b : '(' + b + ')'), k: 'ord' };
      }
      case 'msqrt': { var r = hangChu(n.children || [], gon); return { s: '√' + (laMotKhoi(r) ? r : '(' + r + ')'), k: 'ord' }; }
      case 'mroot': {
        var co = Ts(k[0], gon), bac = Ts(k[1], true);
        var dau = bac === '3' ? '∛' : bac === '4' ? '∜' : (doiBang(bac, SUP, DA_SUP) || ('(' + bac + ')')) + '√';
        return { s: dau + (laMotKhoi(co) ? co : '(' + co + ')'), k: 'ord' };
      }
      case 'msup':
        if (k[0] && ten(k[0]) === 'msub' && conEl(k[0]).length >= 2) { var kk2 = conEl(k[0]); return chiSoChu(kk2[0], kk2[1], k[1], gon); }
        return chiSoChu(k[0], null, k[1], gon);
      case 'msub': return chiSoChu(k[0], k[1], null, gon);
      case 'msubsup': return chiSoChu(k[0], k[1], k[2], gon);
      case 'munder': return munderChu(k[0], k[1], gon);
      case 'mover': return moverChu(k[0], k[1], gon);
      case 'munderover':
        if (laToanTuGioiHan(k[0])) return chiSoChu(k[0], k[1], k[2], gon);
        return { s: munderChu(k[0], k[1], gon).s + supText(Ts(k[2], true)), k: 'ord' };
      case 'mmultiscripts': {
        var tr = '', sau = '', truocDau = false, ds = k.slice(1);
        for (var i = 0; i < ds.length; i++) {
          if (ten(ds[i]) === 'mprescripts') { truocDau = true; continue; }
          var sb = ds[i], sp = ds[i + 1]; i++;
          var p = (sb && ten(sb) !== 'none' ? subText(Ts(sb, true)) : '') + (sp && ten(sp) !== 'none' ? supText(Ts(sp, true)) : '');
          if (truocDau) tr += p; else sau += p;
        }
        return { s: tr + Ts(k[0], gon) + sau, k: 'ord' };
      }
      case 'mtable': return { s: bangChu(n, '', ''), k: 'ord' };
      case 'mfenced': {
        var bf = bangTrongMfenced(n);
        if (bf) return { s: bangChu(bf.bang, bf.open, bf.close), k: 'ord' };
        var o = n.attrs && n.attrs.open != null ? n.attrs.open : '(';
        var c = n.attrs && n.attrs.close != null ? n.attrs.close : ')';
        var seps = (n.attrs && n.attrs.separators != null ? n.attrs.separators : ',').replace(/\s+/g, '');
        var s = '';
        k.forEach(function (x, j) { if (j > 0) s += (seps ? seps.charAt(Math.min(j - 1, seps.length - 1)) : '') + ' '; s += Ts(x, gon); });
        return { s: o + s + c, k: 'ord' };
      }
      case 'semantics': {
        var tb = k.filter(function (x) { var tx = ten(x); return tx !== 'annotation' && tx !== 'annotation-xml'; })[0];
        return tb ? T(tb, gon) : null;
      }
      case 'maction': return k[0] ? T(k[0], gon) : null;
      default: {
        var rr = hangChu(n.children || [], gon);
        if (!rr) return null;
        if (k.length === 1 && t !== 'math' && !timBangCoNgoac(k, 0)) { var a1 = T(k[0], gon); if (a1) return { s: rr, k: a1.k, chiSo: a1.chiSo }; }
        return { s: rr, k: 'ord' };
      }
    }
  }

  function mathmlToText(mathml) {
    var goc = docGoc(mathml);
    if (!goc) return '';
    var s = ten(goc) === 'math' || ten(goc) === '#fragment' ? hangChu(goc.children || [], false) : Ts(goc, false);
    return core.nfc(s.replace(/[ ]{2,}/g, ' ').trim());
  }

  return {
    mathmlToLatex: mathmlToLatex,
    mathmlToText: mathmlToText,
    supText: supText,
    subText: subText,
    // bảng dùng chung cho latex.js
    SYMBOLS: SYM,
    FUNCS: FUNCS.slice(),
    FUNC_EXTRA: FUNC_EXTRA.slice(),
    LIMLIKE: Object.keys(LIMLIKE),
    LARGE_LIMITS: Object.keys(LARGE_LIMITS),
    DOUBLE_STRUCK: DS
  };
});
