/* js/latex.js — LaTeX (giáo viên gõ $…$ trong Word/Excel) → MathML; thay các đoạn $…$, \(…\) trong văn bản */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.latex = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var core = (typeof require === 'function') ? require('./core.js') : root.NH.core;
  var math = (typeof require === 'function') ? require('./math.js') : root.NH.math;
  var _html = null;
  function H() {
    if (_html === null) {
      try { _html = (typeof require === 'function') ? require('./html.js') : ((root.NH && root.NH.html) || false); }
      catch (e) { _html = false; }
    }
    return _html;
  }

  /* ===================== Bảng lệnh ===================== */
  var SYM = {};   // lệnh → [ký tự, loại]
  math.SYMBOLS.forEach(function (r) { SYM[r[0]] = [r[1], r[2]]; });
  var FUNC = {}, LIMLIKE = {}, EXTRA = {}, LARGE_LIM = {};
  math.FUNCS.forEach(function (f) { FUNC[f] = 1; });
  math.LIMLIKE.forEach(function (f) { LIMLIKE[f] = 1; });
  math.FUNC_EXTRA.forEach(function (f) { EXTRA[f] = 1; });
  math.LARGE_LIMITS.forEach(function (c) { LARGE_LIM[c] = 1; });
  var DS = math.DOUBLE_STRUCK;

  var KHOANG = { ',': '\u2009', 'thinspace': '\u2009', ':': '\u205f', '>': '\u205f', 'medspace': '\u205f', ';': '\u2004',
    'thickspace': '\u2004', ' ': '\u00a0', 'enspace': '\u2002', 'quad': '\u2003', 'qquad': '\u2003\u2003' };
  var BO_QUA = { '!': 1, 'negthinspace': 1, 'negmedspace': 1, 'negthickspace': 1, 'nonumber': 1, 'notag': 1, 'hline': 1,
    'limits': 1, 'nolimits': 1, 'displaystyle': 1, 'textstyle': 1, 'scriptstyle': 1, 'scriptscriptstyle': 1, 'left': 1,
    'right': 1, 'middle': 1, 'relax': 1, 'protect': 1, 'mathstrut': 1, 'strut': 1, 'allowbreak': 1, 'newline': 1 };
  var DAU = { // accent: [ký tự trên, thẻ]
    vec: ['→', 'mover'], overrightarrow: ['→', 'mover'], overleftarrow: ['←', 'mover'], bar: ['¯', 'mover'],
    overline: ['¯', 'mover'], hat: ['^', 'mover'], widehat: ['^', 'mover'], tilde: ['~', 'mover'], widetilde: ['~', 'mover'],
    dot: ['˙', 'mover'], ddot: ['¨', 'mover'], check: ['ˇ', 'mover'], breve: ['˘', 'mover'], acute: ['´', 'mover'],
    grave: ['`', 'mover'], mathring: ['˚', 'mover'], overparen: ['⏜', 'mover'], overarc: ['⏜', 'mover'],
    wideparen: ['⏜', 'mover'], arc: ['⏜', 'mover'], overbrace: ['⏞', 'mover'],
    underline: ['_', 'munder'], underbrace: ['⏟', 'munder'], underrightarrow: ['→', 'munder'], underleftarrow: ['←', 'munder']
  };
  var KIEU = { mathbf: 'bold', mathit: 'italic', mathcal: 'script', mathscr: 'script', mathfrak: 'fraktur',
    mathsf: 'sans-serif', mathtt: 'monospace', boldsymbol: 'bold-italic', bm: 'bold-italic', mathrm: 'normal', mathup: 'normal' };
  var CHU = { text: '', textrm: '', textnormal: '', mbox: '', hbox: '', textup: '', textit: 'italic', textbf: 'bold',
    textsf: 'sans-serif', texttt: 'monospace', emph: 'italic' };
  var PHU_DINH = { '=': '≠', '∈': '∉', '⊂': '⊄', '⊆': '⊈', '⊃': '⊅', '⊇': '⊉', '≡': '≢', '∼': '≁', '<': '≮', '>': '≯',
    '≤': '≰', '≥': '≱', '∃': '∄', '∥': '∦', '≅': '≇', '≈': '≉', '∣': '∤' };
  var NGOAC_MO_TRON = { '(': 1, '[': 1, '|': 1 };

  /* ===================== Nút MathML ===================== */
  function el(n, a, c) { return { n: n, a: a || null, c: c || [] }; }
  function tok(n, t, a) { return { n: n, a: a || null, t: t }; }
  function hang(kids) { return kids.length === 1 ? kids[0] : el('mrow', null, kids); }
  var RE_KHOANG = /[\u00a0\u2000-\u200f\u205f-\u2064]/g;
  function escT(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(RE_KHOANG, function (c) { return '&#x' + c.charCodeAt(0).toString(16).toUpperCase() + ';'; });
  }
  function ser(x) {
    var a = '';
    if (x.a) Object.keys(x.a).forEach(function (k) { a += ' ' + k + '="' + core.escAttr(x.a[k]) + '"'; });
    if (x.t !== undefined) return '<' + x.n + a + '>' + escT(x.t) + '</' + x.n + '>';
    if (!x.c.length) return '<' + x.n + a + '/>';
    return '<' + x.n + a + '>' + x.c.map(ser).join('') + '</' + x.n + '>';
  }
  function moNgoac(c) { return c === '' ? tok('mo', '') : tok('mo', c); }
  function datKieu(nut, kieu) { // \mathbf{…}: gắn mathvariant cho mọi mi/mn bên trong
    if (nut.t !== undefined) {
      if (nut.n === 'mi' || nut.n === 'mn' || nut.n === 'mtext') {
        if (kieu === 'italic' && nut.n === 'mi' && Array.from(nut.t).length === 1) return nut;
        nut.a = Object.assign({}, nut.a || {}, { mathvariant: kieu });
      }
      return nut;
    }
    nut.c.forEach(function (c) { datKieu(c, kieu); });
    return nut;
  }
  function chuKep(s) { // \mathbb{R} → ℝ ; chữ khác → khối U+1D538
    return Array.from(s).map(function (c) {
      if (DS[c]) return DS[c];
      var cp = c.charCodeAt(0);
      if (cp >= 65 && cp <= 90) return String.fromCodePoint(0x1D538 + cp - 65);
      if (cp >= 97 && cp <= 122) return String.fromCodePoint(0x1D552 + cp - 97);
      if (cp >= 48 && cp <= 57) return String.fromCodePoint(0x1D7D8 + cp - 48);
      return c;
    }).join('');
  }
  function laGioiHan(nut) {
    if (!nut || nut.t === undefined) return false;
    if (nut.n === 'mo' && (LARGE_LIM[nut.t] || LIMLIKE[nut.t])) return true;
    return false;
  }

  /* ===================== Bộ phân tích LaTeX ===================== */
  function Parser(src, bao) { this.s = src; this.i = 0; this.n = src.length; this.bao = bao; }
  var P = Parser.prototype;
  P.ws = function () {
    while (this.i < this.n) { var c = this.s.charAt(this.i); if (c === ' ' || c === '\t' || c === '\n' || c === '\r') this.i++; else break; }
  };
  P.tenLenh = function () { // đọc tên lệnh tại '\' (không tiến)
    var m = /^\\([A-Za-z]+|[^A-Za-z])/.exec(this.s.slice(this.i, this.i + 40));
    return m ? m[1] : '';
  };
  P.docLenh = function () {
    var t = this.tenLenh();
    this.i += 1 + t.length;
    if (/^[A-Za-z]/.test(t)) { /* bỏ một khoảng trắng sau lệnh chữ */ }
    return t;
  };
  P.docNgoacTho = function () { // {…} → chuỗi thô (cân ngoặc)
    this.ws();
    if (this.s.charAt(this.i) !== '{') {
      if (this.i >= this.n) return '';
      var c = this.s.charAt(this.i);
      if (c === '\\') return '\\' + this.docLenh();
      this.i += c.length; return c;
    }
    var d = 0, bd = this.i;
    for (; this.i < this.n; this.i++) {
      var ch = this.s.charAt(this.i);
      if (ch === '\\') { this.i++; continue; }
      if (ch === '{') d++;
      else if (ch === '}') { d--; if (d === 0) { this.i++; return this.s.slice(bd + 1, this.i - 1); } }
    }
    this.bao('Thiếu dấu } trong công thức');
    return this.s.slice(bd + 1);
  };
  P.docTuyChon = function () { // [..] tuỳ chọn (thô)
    this.ws();
    if (this.s.charAt(this.i) !== '[') return null;
    var e = this.s.indexOf(']', this.i);
    if (e < 0) return null;
    var r = this.s.slice(this.i + 1, e); this.i = e + 1; return r;
  };
  P.docNgoacDon = function () { // ký hiệu sau \left, \right, \big
    this.ws();
    var c = this.s.charAt(this.i);
    if (c === '\\') {
      var t = this.docLenh();
      if (t === '{' || t === 'lbrace') return '{';
      if (t === '}' || t === 'rbrace') return '}';
      if (t === '|' || t === 'Vert' || t === 'lVert' || t === 'rVert') return '‖';
      if (t === 'vert' || t === 'lvert' || t === 'rvert') return '|';
      if (SYM[t]) return SYM[t][0];
      this.bao('Dấu ngoặc không hỗ trợ: \\' + t); return '';
    }
    if (!c) return '';
    this.i++;
    return c === '.' ? '' : c;
  };

  // Hàng: các nguyên tố tới khi gặp điểm dừng (}, &, \\, \end, \right, ])
  P.hang = function (dung) {
    var kids = [];
    dung = dung || {};
    for (;;) {
      this.ws();
      if (this.i >= this.n) break;
      var c = this.s.charAt(this.i);
      if (c === '}') { if (dung.ngoac) break; this.bao('Thừa dấu } trong công thức'); this.i++; continue; }
      if (c === ']' && dung.vuong) break;
      if (c === '&') { if (dung.bang) break; this.i++; continue; }
      if (c === '\\') {
        var t = this.tenLenh();
        if (t === '\\' || t === 'cr' || t === 'newline') { if (dung.bang) break; this.i += 1 + t.length; this.docTuyChon(); continue; }
        if (t === 'end') { if (dung.bang) break; this.i += 4; this.bao('Thừa \\end{' + this.docNgoacTho() + '}'); continue; }
        if (t === 'right') { if (dung.phai) break; this.i += 6; this.docNgoacDon(); this.bao('Thừa \\right'); continue; }
        if (t === 'displaystyle' || t === 'textstyle' || t === 'scriptstyle') {
          this.i += 1 + t.length;
          var sau = this.hang(dung);
          kids.push(el('mstyle', { displaystyle: t === 'displaystyle' ? 'true' : 'false' }, sau));
          break;
        }
        if (t === 'color') {
          this.i += 6;
          var mau = this.docNgoacTho().trim();
          var sau2 = this.hang(dung);
          kids.push(el('mstyle', { mathcolor: mau }, sau2));
          break;
        }
      }
      var a = this.coChiSo();
      if (a == null) continue;
      if (Array.isArray(a)) kids.push.apply(kids, a); else kids.push(a);
    }
    return kids;
  };
  // nguyên tố + mũ/chỉ số/dấu phẩy (')
  P.coChiSo = function () {
    var goc = this.nguyenTo();
    if (goc == null) return null;
    if (Array.isArray(goc)) { if (!goc.length) return null; if (goc.length > 1) return goc; goc = goc[0]; }
    var sub = null, sup = null, gioiHan = null;
    for (;;) {
      this.ws();
      var c = this.s.charAt(this.i);
      if (c === '^' || c === '_') {
        this.i++;
        var arg = this.doiSo();
        if (c === '^') { if (sup) this.bao('Hai lần ^ liên tiếp'); sup = sup ? hang([sup, arg]) : arg; }
        else { if (sub) this.bao('Hai lần _ liên tiếp'); sub = sub || arg; }
        continue;
      }
      if (c === "'") {
        var k = 0;
        while (this.s.charAt(this.i) === "'") { k++; this.i++; }
        var p = tok('mo', k === 1 ? '′' : k === 2 ? '″' : k === 3 ? '‴' : '⁗');
        sup = sup ? hang([p, sup]) : p;
        continue;
      }
      if (c === '\\') {
        var t = this.tenLenh();
        if (t === 'limits' || t === 'nolimits') { this.i += 1 + t.length; gioiHan = t === 'limits'; continue; }
      }
      break;
    }
    if (!sub && !sup) return goc;
    var duoiTren = gioiHan === null ? laGioiHan(goc) : gioiHan;
    if (duoiTren) {
      if (sub && sup) return el('munderover', null, [goc, sub, sup]);
      return sub ? el('munder', null, [goc, sub]) : el('mover', null, [goc, sup]);
    }
    if (sub && sup) return el('msubsup', null, [goc, sub, sup]);
    return sub ? el('msub', null, [goc, sub]) : el('msup', null, [goc, sup]);
  };
  // đối số: {nhóm} | \lệnh | một ký tự
  P.doiSo = function () {
    this.ws();
    if (this.i >= this.n) { this.bao('Thiếu đối số ở cuối công thức'); return el('mrow'); }
    var c = this.s.charAt(this.i);
    if (c === '{' || c === '\\') {
      var r = this.nguyenTo();
      if (Array.isArray(r)) return hang(r.length ? r : [el('mrow')]);
      return r == null ? el('mrow') : r;
    }
    if (/[0-9]/.test(c)) { this.i++; return tok('mn', c); }
    return this.nguyenTo() || el('mrow');
  };
  P.nhom = function () { // tại '{'
    this.i++;
    var kids = this.hang({ ngoac: true });
    if (this.s.charAt(this.i) === '}') this.i++; else this.bao('Thiếu dấu } trong công thức');
    return kids.length === 1 ? kids[0] : el('mrow', null, kids);
  };
  P.nguyenTo = function () {
    this.ws();
    if (this.i >= this.n) return null;
    var s = this.s, c = s.charAt(this.i);
    if (c === '{') return this.nhom();
    if (c === '^' || c === '_') return el('mrow');
    var so = /^(?:[0-9]+(?:(?:\{,\}|[.,])[0-9]+)*|\.[0-9]+)/.exec(s.slice(this.i, this.i + 80));
    if (so) { this.i += so[0].length; return tok('mn', so[0].replace(/\{,\}/g, ',')); }
    if (/[A-Za-z]/.test(c)) { this.i++; return tok('mi', c); }
    if (c === '\\') return this.lenh();
    this.i++;
    switch (c) {
      case '+': return tok('mo', '+');
      case '-': return tok('mo', '−');
      case '*': return tok('mo', '∗');
      case '=': case '<': case '>': case ',': case ';': case ':': case '!': case '?': case '/': case '.': case '@':
        return tok('mo', c);
      case '(': case ')': case '[': case ']': case '|':
        return tok('mo', c, { stretchy: 'false' });
      case '~': return tok('mtext', '\u00a0');
      case "'": return tok('mo', '′');
      case '$': return null;
      case '#': return tok('mi', '#');
      case '"': return tok('mo', '"');
    }
    // ký tự Unicode (có thể là cặp surrogate)
    this.i--;
    var cp = s.codePointAt(this.i), ch = String.fromCodePoint(cp);
    this.i += ch.length;
    if (/\p{L}/u.test(ch)) return tok('mi', ch, /[Α-Ω]/.test(ch) ? { mathvariant: 'normal' } : null);
    if (/\p{N}/u.test(ch)) return tok('mn', ch);
    if (/\s/.test(ch)) return null;
    var kind = null;
    math.SYMBOLS.some(function (r) { if (r[1] === ch) { kind = r[2]; return true; } return false; });
    if (kind === 'mi') return tok('mi', ch);
    if (kind === 'open' || kind === 'close') return tok('mo', ch, { stretchy: 'false' });
    return tok('mo', ch);
  };

  P.lenh = function () {
    var t = this.docLenh();
    var s;
    if (KHOANG[t] !== undefined) return tok('mtext', KHOANG[t]);
    if (BO_QUA[t]) {
      if (t === 'left') return this.traiPhai();
      if (t === 'middle') { var d0 = this.docNgoacDon(); return tok('mo', d0); }
      if (t === 'right') { this.docNgoacDon(); this.bao('Thừa \\right'); }
      return null;
    }
    switch (t) {
      case '{': return tok('mo', '{', { stretchy: 'false' });
      case '}': return tok('mo', '}', { stretchy: 'false' });
      case '|': return tok('mo', '‖', { stretchy: 'false' });
      case '%': case '&': return tok('mo', t);
      case '$': case '#': case '_': return tok('mi', t);
      case '\\': return null;
      case 'frac': case 'dfrac': case 'tfrac': case 'cfrac': {
        var f = el('mfrac', null, [this.doiSo(), this.doiSo()]);
        if (t === 'dfrac' || t === 'cfrac') return el('mstyle', { displaystyle: 'true' }, [f]);
        if (t === 'tfrac') return el('mstyle', { displaystyle: 'false' }, [f]);
        return f;
      }
      case 'binom': case 'dbinom': case 'tbinom': {
        var fb = el('mfrac', { linethickness: '0' }, [this.doiSo(), this.doiSo()]);
        return el('mrow', null, [tok('mo', '('), fb, tok('mo', ')')]);
      }
      case 'genfrac': {
        var l = this.docNgoacTho().trim(), r = this.docNgoacTho().trim(), day = this.docNgoacTho().trim();
        this.docNgoacTho();
        var fg = el('mfrac', /^0(\.0*)?[a-z]*$/.test(day) ? { linethickness: '0' } : null, [this.doiSo(), this.doiSo()]);
        if (!l && !r) return fg;
        return el('mrow', null, [tok('mo', l.replace(/^\\/, '')), fg, tok('mo', r.replace(/^\\/, ''))]);
      }
      case 'sqrt': {
        this.ws();
        if (this.s.charAt(this.i) === '[') {
          this.i++;
          var bac = this.hang({ vuong: true });
          if (this.s.charAt(this.i) === ']') this.i++;
          return el('mroot', null, [this.doiSo(), hang(bac.length ? bac : [el('mrow')])]);
        }
        var co = this.doiSo();
        return el('msqrt', null, co.n === 'mrow' && co.t === undefined ? co.c : [co]);
      }
      case 'begin': return this.moiTruong(this.docNgoacTho().trim());
      case 'end': this.bao('Thừa \\end{' + this.docNgoacTho() + '}'); return null;
      case 'operatorname': case 'operatornamewithlimits': {
        var ten = this.docNgoacTho().replace(/\s+/g, '');
        if (FUNC[ten] || EXTRA[ten]) return LIMLIKE[ten] ? tok('mo', ten) : tok('mi', ten);
        return tok('mi', ten, Array.from(ten).length > 1 ? { mathvariant: 'normal' } : { mathvariant: 'normal' });
      }
      case 'mathbb': case 'Bbb': case 'mathds': return tok('mi', chuKep(this.docNgoacTho().replace(/\s+/g, '')));
      case 'not': {
        this.ws();
        var sau = this.nguyenTo();
        if (sau && sau.t !== undefined) {
          if (PHU_DINH[sau.t]) return tok('mo', PHU_DINH[sau.t]);
          return tok('mo', sau.t + '\u0338');
        }
        return tok('mo', '⧸');
      }
      case 'boxed': case 'fbox': return el('menclose', { notation: 'box' }, [this.doiSo()]);
      case 'cancel': return el('menclose', { notation: 'updiagonalstrike' }, [this.doiSo()]);
      case 'bcancel': return el('menclose', { notation: 'downdiagonalstrike' }, [this.doiSo()]);
      case 'xcancel': return el('menclose', { notation: 'updiagonalstrike downdiagonalstrike' }, [this.doiSo()]);
      case 'phantom': case 'hphantom': case 'vphantom': return el('mphantom', null, [this.doiSo()]);
      case 'pmod': {
        var m = this.doiSo();
        return [tok('mo', '(', { stretchy: 'false' }), tok('mo', 'mod'), m, tok('mo', ')', { stretchy: 'false' })];
      }
      case 'bmod': case 'mod': return tok('mo', 'mod');
      case 'textcolor': { var mau = this.docNgoacTho().trim(); return el('mstyle', { mathcolor: mau }, [this.doiSo()]); }
      case 'colorbox': this.docNgoacTho(); return this.doiSo();
      case 'overset': case 'stackrel': { var tren = this.doiSo(), coSo = this.doiSo(); return el('mover', null, [coSo, tren]); }
      case 'underset': { var duoi = this.doiSo(), coSo2 = this.doiSo(); return el('munder', null, [coSo2, duoi]); }
      case 'xrightarrow': case 'xleftarrow': {
        var duoiX = this.docTuyChon();
        var trenX = this.doiSo();
        var mui = tok('mo', t === 'xrightarrow' ? '→' : '←');
        if (duoiX != null) return el('munderover', null, [mui, new Parser(duoiX, this.bao).toanBo(), trenX]);
        return el('mover', null, [mui, trenX]);
      }
      case 'frown': return tok('mo', '⌢');
      case 'tag': case 'label': this.docNgoacTho(); return null;
      case 'cline': this.docNgoacTho(); return null;
      case 'circ': return tok('mo', '∘');
      case 'degree': return tok('mo', '°');
      case 'lbrack': return tok('mo', '[', { stretchy: 'false' });
      case 'rbrack': return tok('mo', ']', { stretchy: 'false' });
      case 'big': case 'Big': case 'bigg': case 'Bigg': case 'bigl': case 'bigr': case 'bigm': case 'Bigl': case 'Bigr':
      case 'Bigm': case 'biggl': case 'biggr': case 'Biggl': case 'Biggr': {
        var d = this.docNgoacDon();
        return d ? tok('mo', d, { stretchy: 'false' }) : null;
      }
    }
    if (DAU[t]) {
      var dd = DAU[t], arg = this.doiSo();
      if (dd[1] === 'munder') return el('munder', { accentunder: 'true' }, [arg, tok('mo', dd[0])]);
      return el('mover', { accent: 'true' }, [arg, tok('mo', dd[0])]);
    }
    if (KIEU[t]) {
      var a = this.doiSo();
      if (KIEU[t] === 'normal' && a.n === 'mrow' && a.t === undefined && a.c.every(function (x) { return x.n === 'mi' && x.t !== undefined; })) {
        return tok('mi', a.c.map(function (x) { return x.t; }).join(''), { mathvariant: 'normal' }); // \mathrm{abc}
      }
      return datKieu(a, KIEU[t]);
    }
    if (CHU[t] !== undefined) {
      var raw = this.docNgoacTho().replace(/\\([{}$%&#_ ])/g, '$1').replace(/\\textbackslash(\{\})?/g, '\\');
      raw = raw.replace(/^ +/, function (m) { return m.replace(/ /g, '\u00a0'); }).replace(/ +$/, function (m) { return m.replace(/ /g, '\u00a0'); });
      return tok('mtext', raw, CHU[t] ? { mathvariant: CHU[t] } : null);
    }
    if (FUNC[t]) return LIMLIKE[t] ? tok('mo', t) : tok('mi', t);
    if (EXTRA[t]) return tok('mi', t); // \tg, \cotg… (kiểu Việt Nam)
    if (SYM[t]) {
      s = SYM[t];
      if (s[1] === 'mi') return tok('mi', s[0], /[Α-Ω]/.test(s[0]) ? { mathvariant: 'normal' } : null);
      if (s[1] === 'open' || s[1] === 'close') return tok('mo', s[0], { stretchy: 'false' });
      return tok('mo', s[0]);
    }
    this.bao('Lệnh LaTeX chưa hỗ trợ: \\' + t);
    return el('merror', null, [tok('mtext', '\\' + t)]);
  };
  P.traiPhai = function () { // sau \left
    var mo = this.docNgoacDon();
    var kids = this.hang({ phai: true });
    var dong = '';
    if (this.tenLenh() === 'right' && this.s.charAt(this.i) === '\\') { this.i += 6; dong = this.docNgoacDon(); }
    else this.bao('Thiếu \\right sau \\left');
    return el('mrow', null, [moNgoac(mo)].concat(kids, [moNgoac(dong)]));
  };
  P.bang = function () { // các hàng tới \end{…}
    var hangs = [], o = [];
    for (;;) {
      var kids = this.hang({ bang: true });
      o.push(el('mtd', null, kids));
      this.ws();
      if (this.i >= this.n) { this.bao('Thiếu \\end{…}'); break; }
      var c = this.s.charAt(this.i);
      if (c === '&') { this.i++; continue; }
      var t = this.tenLenh();
      if (t === '\\' || t === 'cr' || t === 'newline') { this.i += 1 + t.length; this.docTuyChon(); hangs.push(o); o = []; continue; }
      if (t === 'end') { this.i += 4; this.docNgoacTho(); break; }
      if (c === '}') { this.bao('Thừa dấu } trong bảng'); this.i++; continue; }
      break;
    }
    if (o.length && !(o.length === 1 && !o[0].c.length && hangs.length)) hangs.push(o);
    return hangs.map(function (r) { return el('mtr', null, r); });
  };
  P.moiTruong = function (env) {
    var ten = env.replace(/\*$/, '');
    var spec = null;
    if (ten === 'array' || ten === 'alignat' || ten === 'subarray') spec = this.docNgoacTho();
    var rows = this.bang();
    function bang(ca) { return el('mtable', ca ? { columnalign: ca } : null, rows); }
    switch (ten) {
      case 'cases': case 'dcases': return el('mrow', null, [tok('mo', '{'), bang('left left')]);
      case 'rcases': return el('mrow', null, [bang('left left'), tok('mo', '}')]);
      case 'matrix': case 'smallmatrix': return bang(null);
      case 'pmatrix': return el('mrow', null, [tok('mo', '('), bang(null), tok('mo', ')')]);
      case 'bmatrix': return el('mrow', null, [tok('mo', '['), bang(null), tok('mo', ']')]);
      case 'Bmatrix': return el('mrow', null, [tok('mo', '{'), bang(null), tok('mo', '}')]);
      case 'vmatrix': return el('mrow', null, [tok('mo', '|'), bang(null), tok('mo', '|')]);
      case 'Vmatrix': return el('mrow', null, [tok('mo', '‖'), bang(null), tok('mo', '‖')]);
      case 'array': case 'subarray': {
        var cot = String(spec || '').replace(/[^lcr]/g, '').split('').map(function (x) { return x === 'l' ? 'left' : x === 'r' ? 'right' : 'center'; });
        return bang(cot.length && cot.some(function (x) { return x !== 'center'; }) ? cot.join(' ') : null);
      }
      case 'aligned': case 'align': case 'split': case 'alignat': case 'eqnarray': case 'alignedat': return bang('right left');
      case 'gathered': case 'gather': return bang(null);
    }
    this.bao('Môi trường LaTeX chưa hỗ trợ: ' + env);
    return bang(null);
  };
  P.toanBo = function () {
    var kids = this.hang({});
    return hang(kids.length ? kids : [el('mrow')]);
  };

  // tex → '<math xmlns=…>…</math>' ; opts: {display, displaystyle, issues: [] (nhận cảnh báo)}
  function toMathML(tex, opts) {
    opts = opts || {};
    var issues = opts.issues;
    var daBao = {};
    function bao(msg) {
      if (!issues || daBao[msg]) return;
      daBao[msg] = 1;
      issues.push(core.newIssue('warn', msg + ' — "' + String(tex).slice(0, 60) + '"'));
    }
    var src = core.nfc(String(tex == null ? '' : tex));
    var p = new Parser(src, bao);
    var kids = p.hang({});
    var at = ' xmlns="http://www.w3.org/1998/Math/MathML"' + (opts.display ? ' display="block"' : '') + (opts.displaystyle ? ' displaystyle="true"' : '');
    return '<math' + at + '>' + kids.map(ser).join('') + '</math>';
  }

  /* ===================== $…$ trong văn bản ===================== */
  var THE_TRONG_CONG_THUC = { b: 1, strong: 1, i: 1, em: 1, u: 1, span: 1, font: 1, sub: 1, sup: 1, small: 1, big: 1 };
  var PUA = '\ue000';
  function escMin(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function giaiTT(s) {
    var h = H();
    if (h) return h.decodeEntities(s);
    return s.replace(/&nbsp;/g, '\u00a0').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(+d); }).replace(/&amp;/g, '&');
  }

  /*
   * replaceDollar(textOrHtml, {html, issues, displaystyle}) → HTML
   *  $…$ và \(…\) → <math> (dòng); $$…$$ và \[…\] → <math display="block">. \$ → dấu $ thường.
   *  opts.html: true = đầu vào là HTML (chỉ xét phần chữ, công thức có thể chứa thẻ định dạng b/i/span…);
   *             false = chữ thuần (phần còn lại được thoát & < >); bỏ trống = tự đoán.
   */
  function replaceDollar(input, opts) {
    opts = opts || {};
    var s = String(input == null ? '' : input);
    var laHtml = opts.html != null ? !!opts.html : /<\/?[A-Za-z][^>]*>|&(#[0-9]+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.test(s);
    if (s.indexOf('$') === -1 && s.indexOf('\\(') === -1 && s.indexOf('\\[') === -1) return laHtml ? s : escMin(s);
    if (laHtml && s.indexOf(PUA) !== -1) return s; // không xử lý văn bản có sẵn ký tự riêng

    // HTML: thay mỗi thẻ (và nguyên khối <math>, <script>, <style>, <code>, <pre>) bằng một ký tự giữ chỗ
    var the = [], phang = s;
    if (laHtml) {
      phang = s.replace(/<(math|script|style|code|pre)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/gi, function (m, khoi) {
        var ten = khoi ? '#khoi' : (/^<\/?([A-Za-z][A-Za-z0-9:-]*)/.exec(m) || [, ''])[1].toLowerCase();
        the.push({ raw: m, ten: ten, dong: /^<\//.test(m), tuDong: /\/>$/.test(m) || ten === 'br' || ten === 'img' });
        return PUA;
      });
    }
    var out = [], i = 0, n = phang.length, chiSoThe = 0;
    function dauThe(k) { // số thẻ đứng trước vị trí k trong `phang`
      var d = 0; for (var j = 0; j < k; j++) if (phang.charAt(j) === PUA) d++; return d;
    }
    function chu(t) { // phần không phải công thức
      if (!laHtml) { out.push(escMin(t)); return; }
      out.push(t.replace(/\ue000/g, function () { return the[chiSoThe++].raw; }));
    }
    function congThuc(noi, hienThi, batDau, ketThuc) {
      // noi: nội dung giữa hai dấu (trong `phang`); ketThuc: chỉ số ngay sau dấu đóng
      var dsThe = [];
      var k0 = dauThe(batDau);
      var dem = 0;
      for (var j = 0; j < noi.length; j++) if (noi.charAt(j) === PUA) { dsThe.push(the[k0 + dem]); dem++; }
      for (var q = 0; q < dsThe.length; q++) if (!THE_TRONG_CONG_THUC[dsThe[q].ten] || dsThe[q].ten === '#khoi') return false;
      var tex = noi.replace(/\ue000/g, '');
      if (laHtml) tex = giaiTT(tex);
      if (!tex.trim()) return false;
      // thẻ mở/đóng không cân trong công thức: đóng trước, mở lại sau
      var truoc = [], sau = [], ngan = [];
      dsThe.forEach(function (x) {
        if (x.tuDong) return;
        if (!x.dong) ngan.push(x);
        else {
          var vt = -1;
          for (var z = ngan.length - 1; z >= 0; z--) if (ngan[z].ten === x.ten) { vt = z; break; }
          if (vt >= 0) ngan.splice(vt, 1); else truoc.push(x.raw);
        }
      });
      ngan.forEach(function (x) { sau.push(x.raw); });
      // dồn phần chữ trước công thức
      out.push(truoc.join(''));
      out.push(toMathML(tex, { display: hienThi, displaystyle: opts.displaystyle, issues: opts.issues }));
      out.push(sau.join(''));
      chiSoThe = k0 + dem;
      return true;
    }
    var bd = 0; // đầu đoạn chữ chưa ghi
    function xaChu(den) { if (den > bd) chu(phang.slice(bd, den)); }
    while (i < n) {
      var c = phang.charAt(i);
      if (c === '\\') {
        var d = phang.charAt(i + 1);
        if (d === '$') { xaChu(i); out.push('$'); i += 2; bd = i; continue; }
        if (d === '(' || d === '[') {
          var dong = d === '(' ? '\\)' : '\\]';
          var e = phang.indexOf(dong, i + 2);
          if (e > 0) {
            xaChu(i);
            if (congThuc(phang.slice(i + 2, e), d === '[', i + 2, e + 2)) { i = e + 2; bd = i; continue; }
            bd = i; // không hợp lệ: giữ nguyên
          }
        }
        i += 2; continue;
      }
      if (c === '$') {
        var kep = phang.charAt(i + 1) === '$';
        var dau = i + (kep ? 2 : 1), j = dau, het = -1;
        for (; j < n; j++) {
          var cj = phang.charAt(j);
          if (cj === '\\') { j++; continue; }
          if (cj === '$') {
            if (kep) { if (phang.charAt(j + 1) === '$') { het = j; break; } continue; }
            het = j; break;
          }
        }
        // quy ước pandoc cho $…$: sau $ mở và trước $ đóng không là khoảng trắng, sau $ đóng không là chữ số (5$ và 10$ = tiền)
        var hopLe = het > dau && (kep || (!/\s/.test(phang.charAt(dau)) && !/\s/.test(phang.charAt(het - 1)) && !/[0-9]/.test(phang.charAt(het + 1))));
        if (hopLe) {
          xaChu(i);
          if (congThuc(phang.slice(dau, het), kep, dau, het + (kep ? 2 : 1))) { i = het + (kep ? 2 : 1); bd = i; continue; }
          bd = i;
        }
        i += kep ? 2 : 1; continue;
      }
      i++;
    }
    xaChu(n);
    return out.join('');
  }

  return { toMathML: toMathML, replaceDollar: replaceDollar };
});
