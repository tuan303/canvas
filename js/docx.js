/* js/docx.js — đọc file Word (.docx) soạn theo mẫu → ngân hàng câu hỏi (DESIGN.md §3) */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.docx = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var laNode = typeof module === 'object' && module.exports && typeof require === 'function';
  var core = laNode ? require('./core.js') : root.NH.core;
  var zip = laNode ? require('./zip.js') : root.NH.zip;
  var omml = laNode ? require('./omml.js') : root.NH.omml;

  // latex.js / math.js là tuỳ chọn (có thể chưa nạp) → lấy lười, lỗi thì bỏ qua
  function layMoDun(ten) {
    try { if (laNode) return require('./' + ten + '.js'); } catch (e) { return null; }
    return (root && root.NH && root.NH[ten]) || null;
  }

  var OBJ = '\uFFFC'; // ký tự giữ chỗ cho công thức/ảnh trong chuỗi của một dòng
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ======================= tiện ích XML ======================= */

  function con(node, name) {
    if (!node || !node.children) return null;
    for (var i = 0; i < node.children.length; i++) { var c = node.children[i]; if (c.type === 'el' && c.name === name) return c; }
    return null;
  }
  // thuộc tính theo tên cục bộ (ưu tiên w:…)
  function av(node, local) {
    if (!node || !node.attrs) return undefined;
    var a = node.attrs;
    if (hasOwn(a, 'w:' + local)) return a['w:' + local];
    if (hasOwn(a, local)) return a[local];
    for (var k in a) if (hasOwn(a, k) && k.slice(k.indexOf(':') + 1) === local) return a[k];
    return undefined;
  }
  // thuộc tính bật/tắt kiểu w:b (không có val = bật)
  function bat(node) {
    if (!node) return undefined;
    var v = av(node, 'val');
    return v === undefined || !/^(0|false|off|none)$/i.test(v);
  }

  /* ======================= chữ ======================= */

  function chuanChu(s) {
    s = core.nfc(s);
    if (/[\u00A0\u00AD\u200B\uFEFF\u2011\u2028\u2029\u202F\r\n]/.test(s)) {
      s = s.replace(/[\u00AD\u200B\uFEFF]/g, '').replace(/\u2011/g, '-').replace(/[\u00A0\u2028\u2029\u202F\r\n]/g, ' ');
    }
    return s;
  }

  // gập chữ để so từ khoá: bỏ dấu, đ→d, chữ thường — GIỮ NGUYÊN ĐỘ DÀI (chỉ số khớp với chuỗi gốc)
  function gap(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i], d = c;
      if (c.charCodeAt(0) >= 0x80) {
        if (c === 'đ' || c === 'Đ') d = 'd';
        else { var n = c.normalize('NFD').replace(/[\u0300-\u036F]/g, ''); if (n.length === 1) d = n; }
      }
      var l = d.toLowerCase();
      out += l.length === 1 ? l : d;
    }
    return out;
  }

  function escText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return escText(s).replace(/"/g, '&quot;'); }
  function pad(n, k) { n = String(n); while (n.length < k) n = '0' + n; return n; }

  function laDo(hex) {
    if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return false;
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return r >= 0xB0 && g <= 0x60 && b <= 0x60;
  }

  // Bảng mã phông Symbol → Unicode (công thức gõ bằng phông Symbol / w:sym)
  var SYMBOL = (function () {
    var m = {}, a = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ', b = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ';
    for (var i = 0; i < 26; i++) { m[0x41 + i] = a[i]; m[0x61 + i] = b[i]; }
    var x = {
      0x22: '∀', 0x24: '∃', 0x27: '∋', 0x2A: '∗', 0x2D: '\u2212', 0x40: '≅', 0x5C: '∴', 0x5E: '⊥', 0x60: '‾', 0x7E: '∼',
      0xA1: 'ϒ', 0xA2: '′', 0xA3: '≤', 0xA4: '⁄', 0xA5: '∞', 0xA6: 'ƒ', 0xAB: '↔', 0xAC: '←', 0xAD: '↑', 0xAE: '→', 0xAF: '↓',
      0xB0: '°', 0xB1: '±', 0xB2: '″', 0xB3: '≥', 0xB4: '×', 0xB5: '∝', 0xB6: '∂', 0xB7: '•', 0xB8: '÷', 0xB9: '≠', 0xBA: '≡',
      0xBB: '≈', 0xBC: '…', 0xC0: 'ℵ', 0xC1: 'ℑ', 0xC2: 'ℜ', 0xC3: '℘', 0xC4: '⊗', 0xC5: '⊕', 0xC6: '∅', 0xC7: '∩', 0xC8: '∪',
      0xC9: '⊃', 0xCA: '⊇', 0xCB: '⊄', 0xCC: '⊂', 0xCD: '⊆', 0xCE: '∈', 0xCF: '∉', 0xD0: '∠', 0xD1: '∇', 0xD5: '∏', 0xD6: '√',
      0xD7: '⋅', 0xD8: '¬', 0xD9: '∧', 0xDA: '∨', 0xDB: '⇔', 0xDC: '⇐', 0xDD: '⇑', 0xDE: '⇒', 0xDF: '⇓', 0xE0: '◊', 0xE5: '∑',
      0xF2: '∫'
    };
    for (var k in x) m[k] = x[k];
    return m;
  })();
  function maSymbol(code) {
    if (code >= 0xF000) code -= 0xF000;
    if (hasOwn(SYMBOL, code)) return SYMBOL[code];
    if (code >= 0x20 && code < 0x7F) return String.fromCharCode(code);
    return '';
  }
  function chuSymbol(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      out += (c < 0x7F || (c >= 0xF000 && c <= 0xF0FF)) ? (maSymbol(c) || s[i]) : s[i];
    }
    return out;
  }

  /* ======================= gói .docx ======================= */

  function thuMucCua(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
  function noiDuong(base, target) {
    target = String(target || '').replace(/\\/g, '/');
    var parts = (target.charAt(0) === '/' ? target.slice(1) : base + target).split('/'), out = [];
    parts.forEach(function (p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return out.join('/');
  }
  function Goi(files) {
    this.files = files;
    this.thuong = {};
    for (var k in files) if (hasOwn(files, k)) this.thuong[k.toLowerCase()] = k;
  }
  Goi.prototype.lay = function (p) {
    if (!p) return null;
    if (hasOwn(this.files, p)) return this.files[p];
    var k = this.thuong[p.toLowerCase()];
    if (k) return this.files[k];
    try { var d = decodeURIComponent(p); if (d !== p) return this.lay(d); } catch (e) { /* bỏ qua */ }
    return null;
  };
  Goi.prototype.xml = function (p) { var u = this.lay(p); return u ? core.parseXml(core.utf8Decode(u)) : null; };
  Goi.prototype.rels = function (part) {
    var i = part.lastIndexOf('/');
    var x = this.xml(part.slice(0, i + 1) + '_rels/' + part.slice(i + 1) + '.rels');
    var out = {};
    if (!x) return out;
    core.findAll(x, function (n) { return n.name === 'Relationship' || /:Relationship$/.test(n.name); }).forEach(function (r) {
      var ngoai = /^external$/i.test(r.attrs.TargetMode || '');
      out[r.attrs.Id] = { type: r.attrs.Type || '', target: ngoai ? r.attrs.Target : noiDuong(thuMucCua(part), r.attrs.Target), ngoai: ngoai };
    });
    return out;
  };

  function nhanDangAnh(u8, duong) {
    var ext = (/\.([a-z0-9]+)$/i.exec(duong || '') || [])[1];
    ext = ext ? ext.toLowerCase() : '';
    if (!u8 || u8.length < 4) return 'rong';
    var b = u8;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
    if (b[0] === 0xD7 && b[1] === 0xCD && b[2] === 0xC6 && b[3] === 0x9A) return 'wmf';
    if ((b[0] === 1 || b[0] === 2) && b[1] === 0 && b[2] === 9 && b[3] === 0) return 'wmf';
    if (b[0] === 1 && b[1] === 0 && b[2] === 0 && b[3] === 0 && b.length > 44 && b[40] === 0x20 && b[41] === 0x45 && b[42] === 0x4D && b[43] === 0x46) return 'emf';
    if (b[0] === 0x42 && b[1] === 0x4D) return 'bmp';
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A) || (b[0] === 0x4D && b[1] === 0x4D && b[3] === 0x2A)) return 'tiff';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b.length > 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    if (b[0] === 0x1F && b[1] === 0x8B) return ext === 'wmz' ? 'wmf' : 'emf'; // emz/wmz nén gzip
    if (ext === 'emf' || ext === 'wmf' || ext === 'svg' || ext === 'wdp' || ext === 'jxr') return ext;
    var dau = core.utf8Decode(b.subarray(0, Math.min(400, b.length)));
    if (/<svg[\s>]/i.test(dau)) return 'svg';
    return 'khac';
  }

  /* ======================= styles.xml ======================= */

  function docRPr(rPr) {
    var f = {};
    if (!rPr || !rPr.children) return f;
    rPr.children.forEach(function (c) {
      if (c.type !== 'el') return;
      var v;
      switch (c.name) {
        case 'w:b': f.b = bat(c); break;
        case 'w:i': f.i = bat(c); break;
        case 'w:u': v = av(c, 'val'); f.u = !(v === 'none' || v === '0' || v === 'false'); break;
        case 'w:strike': case 'w:dstrike': f.strike = bat(c); break;
        case 'w:color': f.red = laDo(av(c, 'val')); break;
        case 'w:highlight': v = av(c, 'val'); f.hl = !!v && v !== 'none'; break;
        case 'w:shd': {
          var kieu = av(c, 'val') || '', fill = String((kieu === 'solid' ? av(c, 'color') : av(c, 'fill')) || '').toUpperCase();
          f.shd = kieu !== 'nil' && !!fill && fill !== 'AUTO' && fill !== 'FFFFFF';
          break;
        }
        case 'w:vertAlign': v = av(c, 'val'); f.sup = v === 'superscript'; f.sub = v === 'subscript'; break;
        case 'w:vanish': f.an = bat(c); break;
        case 'w:rFonts': v = av(c, 'ascii') || av(c, 'hAnsi'); if (v) f.sym = /^symbol$/i.test(v); break;
        case 'w:rStyle': f.rStyle = av(c, 'val'); break;
      }
    });
    return f;
  }
  function tron(a, b) {
    var o = {}, k;
    for (k in a) if (hasOwn(a, k) && a[k] !== undefined) o[k] = a[k];
    for (k in b) if (hasOwn(b, k) && b[k] !== undefined) o[k] = b[k];
    return o;
  }
  var KIEU_GIU = ['b', 'i', 'u', 'strike', 'red', 'hl', 'sup', 'sub'];
  function gonKieu(f) {
    var o = {};
    KIEU_GIU.forEach(function (k) { if (k === 'hl' ? (f.hl || f.shd) : f[k]) o[k] = true; });
    return o;
  }

  function Styles(x) {
    this.ds = {};
    this.macDinhP = null;
    var self = this;
    if (!x) return;
    core.findAll(x, 'w:style').forEach(function (s) {
      var id = av(s, 'styleId'), type = av(s, 'type') || 'paragraph';
      if (!id) return;
      var pPr = con(s, 'w:pPr'), numPr = con(pPr, 'w:numPr');
      self.ds[id] = {
        type: type, basedOn: av(con(s, 'w:basedOn'), 'val'), rPr: docRPr(con(s, 'w:rPr')),
        numId: numPr ? av(con(numPr, 'w:numId'), 'val') : undefined,
        ilvl: numPr ? av(con(numPr, 'w:ilvl'), 'val') : undefined
      };
      if (type === 'paragraph' && /^(1|true|on)$/i.test(av(s, 'default') || '')) self.macDinhP = id;
    });
    this._f = {};
  }
  Styles.prototype.fmt = function (id) {
    if (!id || !this.ds[id]) return {};
    if (this._f[id]) return this._f[id];
    var chuoi = [], cur = id, seen = {};
    while (cur && this.ds[cur] && !seen[cur]) { seen[cur] = 1; chuoi.unshift(this.ds[cur]); cur = this.ds[cur].basedOn; }
    var f = {};
    chuoi.forEach(function (s) { f = tron(f, s.rPr); });
    delete f.rStyle;
    return (this._f[id] = f);
  };
  Styles.prototype.numPr = function (id) {
    var cur = id, seen = {};
    while (cur && this.ds[cur] && !seen[cur]) {
      seen[cur] = 1;
      if (this.ds[cur].numId !== undefined) return { numId: this.ds[cur].numId, ilvl: this.ds[cur].ilvl, style: cur };
      cur = this.ds[cur].basedOn;
    }
    return null;
  };

  /* ======================= numbering.xml ======================= */

  function Numbering(x, styles) {
    this.abs = {}; this.nums = {}; this.styles = styles;
    this.dem = {}; this.daOv = {};
    var self = this;
    if (!x) return;
    function docLvl(l) {
      var o = { ilvl: +(av(l, 'ilvl') || 0) };
      var st = av(con(l, 'w:start'), 'val');
      o.start = st != null && st !== '' ? +st : 0;
      o.fmt = av(con(l, 'w:numFmt'), 'val') || 'decimal';
      var t = con(l, 'w:lvlText');
      o.text = t ? (av(t, 'val') || '') : '';
      o.suff = av(con(l, 'w:suff'), 'val') || 'tab';
      o.isLgl = !!con(l, 'w:isLgl');
      o.rPr = docRPr(con(l, 'w:rPr'));
      o.pStyle = av(con(l, 'w:pStyle'), 'val');
      return o;
    }
    core.findAll(x, 'w:abstractNum').forEach(function (a) {
      var id = av(a, 'abstractNumId'), lv = {};
      core.children(a, 'w:lvl').forEach(function (l) { var o = docLvl(l); lv[o.ilvl] = o; });
      self.abs[id] = { lv: lv, link: av(con(a, 'w:numStyleLink'), 'val') };
    });
    core.findAll(x, 'w:num').forEach(function (n) {
      var id = av(n, 'numId'), ov = {};
      core.children(n, 'w:lvlOverride').forEach(function (o) {
        var il = +(av(o, 'ilvl') || 0), so = con(o, 'w:startOverride'), lvl = con(o, 'w:lvl');
        ov[il] = { start: so ? +(av(so, 'val') || 0) : undefined, lvl: lvl ? docLvl(lvl) : undefined };
      });
      self.nums[id] = { abs: av(con(n, 'w:abstractNumId'), 'val'), ov: ov };
    });
  }
  function chuCai(n) {
    if (n <= 0) return '';
    var k = (n - 1) % 26, lap = Math.floor((n - 1) / 26) + 1, c = String.fromCharCode(97 + k), s = '';
    for (var i = 0; i < lap; i++) s += c;
    return s;
  }
  function laMa(n) {
    if (n <= 0 || n >= 4000) return String(n);
    var v = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1], r = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'], s = '';
    for (var i = 0; i < v.length; i++) while (n >= v[i]) { s += r[i]; n -= v[i]; }
    return s;
  }
  function dinhDangSo(n, fmt) {
    switch (fmt) {
      case 'upperLetter': return chuCai(n).toUpperCase();
      case 'lowerLetter': return chuCai(n);
      case 'upperRoman': return laMa(n);
      case 'lowerRoman': return laMa(n).toLowerCase();
      case 'decimalZero': return n < 10 ? '0' + n : String(n);
      case 'none': case 'bullet': return '';
      default: return String(n);
    }
  }
  Numbering.prototype.timAbs = function (numId) {
    var num = this.nums[numId];
    if (!num) return null;
    var absId = num.abs, ab = this.abs[absId], vong = 0;
    while (ab && ab.link && !Object.keys(ab.lv).length && vong++ < 5) { // numStyleLink → style → numId khác
      var np = this.styles.numPr(ab.link), n2 = np && this.nums[np.numId];
      if (!n2) break;
      absId = n2.abs; ab = this.abs[absId];
    }
    return ab ? { id: absId, ab: ab, num: num } : null;
  };
  // Nhãn tự đánh số của đoạn (numId, ilvl) — gọi theo đúng thứ tự tài liệu
  Numbering.prototype.nhan = function (numId, ilvl) {
    var t = this.timAbs(numId);
    if (!t) return null;
    ilvl = +ilvl || 0;
    var ov = t.num.ov[ilvl], ab = t.ab;
    var lvlCua = function (l) { var o = t.num.ov[l]; return (o && o.lvl) || ab.lv[l]; };
    var lvl = lvlCua(ilvl);
    if (!lvl) return null;
    var dem = this.dem[t.id] || (this.dem[t.id] = []);
    var khoa = numId + ':' + ilvl;
    if (ov && ov.start !== undefined && !this.daOv[khoa]) { dem[ilvl] = ov.start - 1; this.daOv[khoa] = 1; }
    if (dem[ilvl] == null) dem[ilvl] = (lvl.start || 0) - 1;
    dem[ilvl]++;
    for (var l = ilvl + 1; l < 9; l++) dem[l] = null;
    if (lvl.fmt === 'bullet') return { text: '•', suff: 'space', rPr: lvl.rPr, bullet: true };
    var text = lvl.text.replace(/%([1-9])/g, function (m, k) {
      var L = +k - 1, lv = lvlCua(L) || {};
      var v = dem[L] != null ? dem[L] : (lv.start || 1);
      return dinhDangSo(v, lvl.isLgl ? 'decimal' : (lv.fmt || 'decimal'));
    });
    return { text: text, suff: lvl.suff, rPr: lvl.rPr };
  };

  /* ======================= duyệt document.xml → khối ======================= */

  function Ctx(goi, docPath) {
    this.goi = goi;
    this.docPath = docPath;
    this.rels = goi.rels(docPath);
    var relLoai = function (rels, duoi) { for (var k in rels) if (hasOwn(rels, k) && new RegExp('/' + duoi + '$').test(rels[k].type)) return rels[k].target; return null; };
    this.styles = new Styles(goi.xml(relLoai(this.rels, 'styles') || 'word/styles.xml'));
    this.numbering = new Numbering(goi.xml(relLoai(this.rels, 'numbering') || 'word/numbering.xml'), this.styles);
    this.fld = [];
    this.soDoan = 0;
    this.tenAnhTheoMedia = {};
    this.anh = {};       // tên ASCII → Uint8Array
    this.demAnh = 0;
    this.canhBao = [];   // cấp tài liệu
  }
  Ctx.prototype.tenAnh = function (media, loai) {
    if (this.tenAnhTheoMedia[media]) return this.tenAnhTheoMedia[media];
    var ten = 'img_' + pad(++this.demAnh, 3) + '.' + loai;
    this.tenAnhTheoMedia[media] = ten;
    this.anh[ten] = this.goi.lay(media);
    return ten;
  };

  function duyetKhoi(node, ctx, out) {
    if (!node || !node.children) return out;
    node.children.forEach(function (c) {
      if (c.type !== 'el') return;
      switch (c.name) {
        case 'w:p': out.push(docDoan(c, ctx)); break;
        case 'w:tbl': out.push(docBang(c, ctx)); break;
        case 'w:sdt': duyetKhoi(con(c, 'w:sdtContent'), ctx, out); break;
        case 'w:customXml': case 'w:ins': case 'w:moveTo': case 'w:sdtContent': duyetKhoi(c, ctx, out); break;
        case 'mc:AlternateContent': {
          var ch = con(c, 'mc:Choice'), n0 = out.length;
          if (ch) duyetKhoi(ch, ctx, out);
          if (out.length === n0) duyetKhoi(con(c, 'mc:Fallback'), ctx, out);
          break;
        }
        case 'w:altChunk': ctx.canhBao.push(core.newIssue('warn', 'File Word có phần nội dung nhúng (altChunk) — phần này bị bỏ qua')); break;
      }
    });
    return out;
  }

  function docDoan(p, ctx) {
    var pPr = con(p, 'w:pPr'), pStyle = av(con(pPr, 'w:pStyle'), 'val') || ctx.styles.macDinhP;
    var fP = ctx.styles.fmt(pStyle);
    var toks = [], id = ++ctx.soDoan;
    // nhãn do Word tự đánh số
    var numPr = con(pPr, 'w:numPr'), numId, ilvl;
    if (numPr) { numId = av(con(numPr, 'w:numId'), 'val'); ilvl = av(con(numPr, 'w:ilvl'), 'val'); }
    if (numId === undefined || ilvl === undefined) {
      var sn = ctx.styles.numPr(pStyle);
      if (sn) {
        if (numId === undefined) numId = sn.numId;
        if (ilvl === undefined) {
          ilvl = sn.ilvl;
          if (ilvl === undefined) { // cấp gắn với style qua w:pStyle trong abstractNum
            var t = ctx.numbering.timAbs(numId);
            if (t) for (var l in t.ab.lv) if (t.ab.lv[l].pStyle === sn.style) ilvl = l;
          }
        }
      }
    }
    if (numId !== undefined && numId !== '0') {
      var nh = ctx.numbering.nhan(numId, ilvl || 0);
      if (nh && nh.text && !nh.bullet) { // dấu đầu dòng (bullet) bỏ — không có nghĩa khi nhận dạng
        var fNhan = tron(tron(fP, docRPr(con(pPr, 'w:rPr'))), nh.rPr);
        toks.push({ t: 'text', s: chuanChu(nh.text), f: gonKieu(fNhan), auto: true, bullet: !!nh.bullet });
        if (nh.suff === 'tab') toks.push({ t: 'tab', auto: true });
        else if (nh.suff === 'space') toks.push({ t: 'text', s: ' ', f: {}, auto: true });
      }
    }
    duyetDong(p, ctx, toks, fP);
    // trường (field) chưa đóng phần lệnh trong đoạn → bỏ để không nuốt đoạn sau
    while (ctx.fld.length && ctx.fld[ctx.fld.length - 1].pha === 'lenh') ctx.fld.pop();
    var jc = av(con(pPr, 'w:jc'), 'val') || '';
    return { k: 'p', toks: toks, id: id, jc: jc === 'center' ? 'center' : (jc === 'right' || jc === 'end') ? 'right' : '' };
  }

  function duyetDong(node, ctx, toks, fP) {
    if (!node || !node.children) return;
    for (var i = 0; i < node.children.length; i++) {
      var c = node.children[i];
      if (c.type !== 'el') continue;
      switch (c.name) {
        case 'w:r': docRun(c, ctx, toks, fP); break;
        case 'w:hyperlink': case 'w:smartTag': case 'w:customXml': case 'w:ins': case 'w:moveTo':
        case 'w:dir': case 'w:bdo': case 'w:sdtContent': case 'w:fldSimple':
          if (c.name === 'w:fldSimple' && /^\s*EQ\b/i.test(av(c, 'instr') || '')) { toks.push({ t: 'ole', loai: 'eq' }); break; }
          duyetDong(c, ctx, toks, fP); break;
        case 'w:sdt': duyetDong(con(c, 'w:sdtContent'), ctx, toks, fP); break;
        case 'm:oMath': case 'm:oMathPara': toks.push(tokCongThuc(c)); break;
        case 'mc:AlternateContent': {
          var ch = con(c, 'mc:Choice'), n0 = toks.length;
          if (ch) duyetDong(ch, ctx, toks, fP);
          if (toks.length === n0) duyetDong(con(c, 'mc:Fallback'), ctx, toks, fP);
          break;
        }
        // w:del, w:moveFrom, w:pPr, w:bookmark*, w:proofErr, w:permStart… → bỏ
      }
    }
  }

  function trongLenh(ctx) {
    for (var i = 0; i < ctx.fld.length; i++) if (ctx.fld[i].pha === 'lenh') return true;
    return false;
  }

  function themChu(toks, s, f) {
    if (!s) return;
    toks.push({ t: 'text', s: s, f: f });
  }

  function docRun(r, ctx, toks, fP) {
    var rPr = con(r, 'w:rPr'), fd = docRPr(rPr);
    var f = tron(tron(fP, fd.rStyle ? ctx.styles.fmt(fd.rStyle) : {}), fd);
    var kieu = gonKieu(f);
    var noiDung = function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.type !== 'el') continue;
        if (c.name === 'w:fldChar') {
          var loai = av(c, 'fldCharType');
          if (loai === 'begin') ctx.fld.push({ pha: 'lenh', lenh: '' });
          else if (loai === 'separate') { if (ctx.fld.length) ctx.fld[ctx.fld.length - 1].pha = 'kq'; }
          else if (loai === 'end') {
            var fl = ctx.fld.pop();
            if (fl && /^\s*EQ\b/i.test(fl.lenh) && !trongLenh(ctx)) toks.push({ t: 'ole', loai: 'eq' });
          }
          continue;
        }
        if (c.name === 'w:instrText') { if (ctx.fld.length) ctx.fld[ctx.fld.length - 1].lenh += core.xmlText(c); continue; }
        if (trongLenh(ctx) || f.an) continue;
        switch (c.name) {
          case 'w:t': {
            var s = chuanChu(core.xmlText(c));
            themChu(toks, f.sym ? chuSymbol(s) : s, kieu);
            break;
          }
          case 'w:tab': case 'w:ptab': toks.push({ t: 'tab' }); break;
          case 'w:br': case 'w:cr': if (av(c, 'type') !== 'column') toks.push({ t: 'br' }); break;
          case 'w:noBreakHyphen': themChu(toks, '-', kieu); break;
          case 'w:sym': themChu(toks, maSymbol(parseInt(av(c, 'char') || '0', 16)), kieu); break;
          case 'w:drawing': docDrawing(c, ctx, toks); break;
          case 'w:pict': docPict(c, ctx, toks); break;
          case 'w:object': docObject(c, ctx, toks); break;
          case 'm:oMath': case 'm:oMathPara': toks.push(tokCongThuc(c)); break;
          case 'mc:AlternateContent': {
            var ch = con(c, 'mc:Choice'), n0 = toks.length;
            if (ch) noiDung(ch.children);
            if (toks.length === n0) { var fb = con(c, 'mc:Fallback'); if (fb) noiDung(fb.children); }
            break;
          }
        }
      }
    };
    noiDung(r.children || []);
  }

  function tokCongThuc(node) {
    var mathml = '', text = '';
    try { mathml = omml.toMathML(node); text = omml.toText(node); } catch (e) { mathml = ''; }
    // định dạng (đỏ/gạch chân/tô nền) lấy theo w:rPr của các m:r, có trọng số theo độ dài chữ
    var n = 0, d = { u: 0, red: 0, hl: 0 };
    core.findAll(node, 'm:r').forEach(function (r) {
      var k = core.findAll(r, 'm:t').map(core.xmlText).join('').replace(/\s/g, '').length;
      if (!k) return;
      var f = gonKieu(docRPr(con(r, 'w:rPr')));
      n += k;
      if (f.u) d.u += k;
      if (f.red) d.red += k;
      if (f.hl) d.hl += k;
    });
    var f = {};
    if (n) ['u', 'red', 'hl'].forEach(function (k) { if (d[k] / n >= 0.8) f[k] = true; });
    if (!mathml) return { t: 'ole', loai: 'omml' };
    return { t: 'math', mathml: mathml, text: text, f: f, khoi: node.name === 'm:oMathPara' };
  }

  function tokAnh(ctx, rId, w, h, alt, ngoaiLe) {
    var rel = ctx.rels[rId];
    if (!rel) return { t: 'img', loi: 'thieu', rId: rId };
    if (rel.ngoai) return { t: 'img', loi: 'ngoai', rId: rId };
    var data = ctx.goi.lay(rel.target);
    if (!data) return { t: 'img', loi: 'thieu', rId: rId };
    var loai = nhanDangAnh(data, rel.target);
    var tk = { t: 'img', media: rel.target, loai: loai, w: w || 0, h: h || 0, alt: alt || '' };
    if (loai !== 'png' && loai !== 'jpg' && loai !== 'gif') tk.loi = loai;
    if (ngoaiLe) tk.progId = ngoaiLe;
    return tk;
  }

  function docDrawing(d, ctx, toks) {
    var ext = core.find(d, 'wp:extent');
    var w = ext ? Math.round(+(av(ext, 'cx') || 0) / 9525) : 0, h = ext ? Math.round(+(av(ext, 'cy') || 0) / 9525) : 0;
    var docPr = core.find(d, 'wp:docPr'), alt = docPr ? (av(docPr, 'descr') || '') : '';
    var gd = core.find(d, 'a:graphicData'), uri = gd ? (gd.attrs.uri || '') : '';
    var blips = core.findAll(d, 'a:blip');
    var laAnh = /\/picture$/.test(uri);
    blips.forEach(function (b, i) {
      var id = av(b, 'embed'), link = av(b, 'link');
      if (id || link) toks.push(tokAnh(ctx, id || link, blips.length === 1 ? w : 0, blips.length === 1 ? h : 0, i === 0 ? alt : ''));
    });
    if (!laAnh || !blips.length) {
      var coChu = !!core.find(d, 'w:txbxContent');
      if (!blips.length || coChu || /wordprocessingShape|wordprocessingGroup|chart|diagram|canvas/.test(uri)) {
        toks.push({ t: 'hinh', chu: coChu, loai: /chart/.test(uri) ? 'biểu đồ' : /diagram/.test(uri) ? 'SmartArt' : 'hình vẽ' });
      }
    }
  }

  function kichThuocVml(shape) {
    var st = shape ? (shape.attrs.style || '') : '';
    var px = function (k) {
      var m = new RegExp('(?:^|;)\\s*' + k + '\\s*:\\s*([\\d.]+)\\s*(pt|px|in|cm|mm)?', 'i').exec(st);
      if (!m) return 0;
      var v = +m[1], u = (m[2] || 'px').toLowerCase();
      return Math.round(u === 'pt' ? v * 4 / 3 : u === 'in' ? v * 96 : u === 'cm' ? v * 96 / 2.54 : u === 'mm' ? v * 96 / 25.4 : v);
    };
    return { w: px('width'), h: px('height') };
  }

  function docPict(p, ctx, toks) {
    var im = core.find(p, 'v:imagedata');
    if (im) {
      var shape = core.find(p, 'v:shape'), kt = kichThuocVml(shape);
      toks.push(tokAnh(ctx, av(im, 'id'), kt.w, kt.h, shape ? (shape.attrs.alt || '') : ''));
      return;
    }
    if (core.find(p, function (n) { return n.attrs && (n.attrs['o:hr'] === 't' || n.attrs['o:hr'] === 'true'); })) return; // đường kẻ ngang
    toks.push({ t: 'hinh', chu: !!core.find(p, 'w:txbxContent'), loai: 'hình vẽ' });
  }

  function docObject(o, ctx, toks) {
    var ole = core.find(o, 'o:OLEObject'), progId = ole ? (ole.attrs.ProgID || '') : '';
    if (/^Equation\.|MathType|^DSMT/i.test(progId)) { toks.push({ t: 'ole', loai: 'mathtype', progId: progId }); return; }
    var im = core.find(o, 'v:imagedata');
    if (im) {
      var shape = core.find(o, 'v:shape'), kt = kichThuocVml(shape);
      toks.push(tokAnh(ctx, av(im, 'id'), kt.w, kt.h, '', progId || 'OLE'));
      return;
    }
    var b = core.find(o, 'a:blip');
    if (b) { toks.push(tokAnh(ctx, av(b, 'embed'), 0, 0, '', progId || 'OLE')); return; }
    toks.push({ t: 'ole', loai: 'ole', progId: progId });
  }

  function docBang(tbl, ctx) {
    var rows = [];
    var hangCua = function (node, out) {
      core.children(node).forEach(function (c) {
        if (c.name === 'w:tr') out.push(c);
        else if (c.name === 'w:sdt') hangCua(con(c, 'w:sdtContent'), out);
        else if (c.name === 'w:customXml' || c.name === 'w:ins') hangCua(c, out);
      });
      return out;
    };
    var oCua = function (node, out) {
      core.children(node).forEach(function (c) {
        if (c.name === 'w:tc') out.push(c);
        else if (c.name === 'w:sdt') oCua(con(c, 'w:sdtContent'), out);
        else if (c.name === 'w:customXml' || c.name === 'w:ins') oCua(c, out);
      });
      return out;
    };
    hangCua(tbl, []).forEach(function (tr) {
      var trPr = con(tr, 'w:trPr'), cot = +(av(con(trPr, 'w:gridBefore'), 'val') || 0), cells = [];
      oCua(tr, []).forEach(function (tc) {
        var tcPr = con(tc, 'w:tcPr'), span = +(av(con(tcPr, 'w:gridSpan'), 'val') || 1) || 1;
        var vm = con(tcPr, 'w:vMerge'), vmv = vm ? (av(vm, 'val') === 'restart' ? 'restart' : 'continue') : '';
        cells.push({ blocks: duyetKhoi(tc, ctx, []), col: cot, span: span, vm: vmv, rowspan: 1 });
        cot += span;
      });
      rows.push(cells);
    });
    // gộp ô dọc → rowspan
    for (var r = 1; r < rows.length; r++) {
      rows[r].forEach(function (c) {
        if (c.vm !== 'continue') return;
        for (var k = r - 1; k >= 0; k--) {
          var tren = rows[k].filter(function (x) { return x.col === c.col; })[0];
          if (!tren) break;
          if (!tren.boQua) { tren.rowspan++; c.boQua = true; break; }
        }
      });
    }
    return { k: 'tbl', rows: rows, id: ++ctx.soDoan };
  }

  /* ======================= dòng (line) ======================= */

  function doDai(t) { return t.t === 'text' ? t.s.length : 1; }
  function chuoiCua(toks) {
    var s = '';
    for (var i = 0; i < toks.length; i++) { var t = toks[i]; s += t.t === 'text' ? t.s : t.t === 'tab' ? '\t' : OBJ; }
    return s;
  }
  function cat(toks, a, b) {
    var out = [], pos = 0;
    if (b == null) b = Infinity;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], len = doDai(t), x = Math.max(a, pos), y = Math.min(b, pos + len);
      if (x < y) {
        if (t.t === 'text') { if (x === pos && y === pos + len) out.push(t); else out.push({ t: 'text', s: t.s.slice(x - pos, y - pos), f: t.f, auto: t.auto }); }
        else out.push(t);
      }
      pos += len;
    }
    return out;
  }
  function taoDong(toks, para, jc) { return { k: 'line', toks: toks, str: chuoiCua(toks), para: para, jc: jc || '' }; }
  function catDong(line, a, b) { return taoDong(cat(line.toks, a, b), line.para, line.jc); }
  function kieuTai(line, idx) {
    var pos = 0;
    for (var i = 0; i < line.toks.length; i++) {
      var t = line.toks[i], len = doDai(t);
      if (idx < pos + len) return { f: t.f || {}, auto: !!t.auto };
      pos += len;
    }
    return { f: {}, auto: false };
  }
  function chuThuan(toks) { // chữ thuần (công thức → chữ Unicode)
    var s = '';
    toks.forEach(function (t) { s += t.t === 'text' ? t.s : t.t === 'tab' ? ' ' : t.t === 'math' ? (t.text || '') : ''; });
    return s;
  }
  function dongRong(line) {
    if (line.k !== 'line') return false;
    return !/[^\s\uFEFF]/.test(line.str);
  }
  function boTrangDau(line) { // bỏ khoảng trắng đầu dòng
    var m = /^\s*/.exec(line.str)[0].length;
    return m ? catDong(line, m) : line;
  }

  /* ---- LaTeX $…$ → MathML (nếu có latex.js) ---- */

  function texSangChu(tex) {
    return tex.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)').replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:left|right|displaystyle)/g, '').replace(/\\cdot/g, '·').replace(/\\times/g, '×').replace(/\\pm/g, '±')
      .replace(/\\le(q)?\b/g, '≤').replace(/\\ge(q)?\b/g, '≥').replace(/\\ne(q)?\b/g, '≠').replace(/\\pi\b/g, 'π').replace(/\\infty/g, '∞')
      .replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '').replace(/\(([^()+\-*/]*)\)/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function texSangMathML(tex, khoi, latex) {
    var r = '';
    try {
      if (typeof latex.toMathML === 'function') r = latex.toMathML(tex, { display: khoi });
      else if (typeof latex.replaceDollar === 'function') r = latex.replaceDollar((khoi ? '$$' : '$') + tex + (khoi ? '$$' : '$'));
    } catch (e) { r = ''; }
    r = String(r || '');
    var m = /<math[\s>][\s\S]*<\/math>/.exec(r);
    if (!m) return '';
    r = m[0];
    if (khoi && !/^<math[^>]*display=/.test(r)) r = r.replace(/^<math/, '<math display="block"');
    return r;
  }
  function thayLatex(toks, latex, math) {
    if (!latex) return toks;
    var s = chuoiCua(toks);
    if (s.indexOf('$') < 0) return toks;
    var out = [], i = 0, tu = 0;
    while (i < s.length) {
      var a = s.indexOf('$', i);
      if (a < 0) break;
      if (a > 0 && s[a - 1] === '\\') { i = a + 1; continue; }
      var khoi = s[a + 1] === '$', mo = khoi ? 2 : 1;
      var b = s.indexOf(khoi ? '$$' : '$', a + mo);
      while (b > 0 && s[b - 1] === '\\') b = s.indexOf(khoi ? '$$' : '$', b + 1);
      if (b < 0) break;
      var tex = s.slice(a + mo, b);
      var hopLe = tex.length > 0 && tex.indexOf(OBJ) < 0 && tex.indexOf('\t') < 0 &&
        (khoi || (!/^\s/.test(tex) && !/\s$/.test(tex) && !/[0-9]/.test(s[b + 1] || '')));
      if (!hopLe) { i = a + 1; continue; }
      var mathml = texSangMathML(tex.trim(), khoi, latex);
      if (!mathml) { i = b + mo; continue; }
      var text = '';
      try { if (math && typeof math.mathmlToText === 'function') text = math.mathmlToText(mathml); } catch (e) { text = ''; }
      out = out.concat(cat(toks, tu, a));
      out.push({ t: 'math', mathml: mathml, text: text || texSangChu(tex), f: kieuTai({ toks: toks }, a + mo).f, tex: tex, khoi: khoi });
      tu = b + mo; i = tu;
    }
    if (!tu) return toks;
    return out.concat(cat(toks, tu));
  }

  // Khối (đoạn/bảng) → đơn vị: mỗi đoạn tách tại w:br thành nhiều dòng; bảng giữ nguyên
  function taoDonVi(blocks, mt) {
    var out = [];
    blocks.forEach(function (b) {
      if (b.k === 'tbl') { out.push({ k: 'tbl', tbl: b, para: b.id }); return; }
      var cur = [];
      var day = function () { out.push(taoDong(thayLatex(cur, mt.latex, mt.math), b.id, b.jc)); cur = []; };
      b.toks.forEach(function (t) { if (t.t === 'br') day(); else cur.push(t); });
      day();
    });
    return out;
  }
  function donViCuaO(cell, mt) { return taoDonVi(cell.blocks, mt); }

  /* ======================= HTML ======================= */

  var TB_ANH = {
    emf: 'EMF', wmf: 'WMF', bmp: 'BMP', tiff: 'TIFF', webp: 'WebP', svg: 'SVG', wdp: 'HD Photo', jxr: 'JPEG XR', khac: 'không rõ', rong: 'rỗng'
  };
  var GOI_Y_MT = ' — trong Word chọn MathType → Convert Equations → Office Math (hoặc chụp lại thành ảnh PNG)';

  // Bộ dựng HTML cho một câu: ghi ảnh đã dùng vào dsAnh, báo lỗi ảnh/OLE qua baoLoi(level, msg)
  function TaoHtml(ctx, dsAnh, baoLoi) { this.ctx = ctx; this.dsAnh = dsAnh; this.baoLoi = baoLoi; }

  TaoHtml.prototype.toks = function (toks, o) {
    o = o || {};
    var self = this, out = '', nhom = null;
    // cắt khoảng trắng hai đầu
    var dau = 0, cuoi = toks.length;
    while (dau < cuoi && (toks[dau].t === 'tab' || (toks[dau].t === 'text' && !/\S/.test(toks[dau].s)))) dau++;
    while (cuoi > dau && (toks[cuoi - 1].t === 'tab' || (toks[cuoi - 1].t === 'text' && !/\S/.test(toks[cuoi - 1].s)))) cuoi--;
    var ds = toks.slice(dau, cuoi);
    if (ds.length && ds[0].t === 'text') ds[0] = { t: 'text', s: ds[0].s.replace(/^\s+/, ''), f: ds[0].f };
    if (ds.length && ds[ds.length - 1].t === 'text') ds[ds.length - 1] = { t: 'text', s: ds[ds.length - 1].s.replace(/\s+$/, ''), f: ds[ds.length - 1].f };

    var khoaKieu = function (f) {
      f = f || {};
      return (f.b ? 'b' : '') + (f.i ? 'i' : '') + (f.u && !o.boU ? 'u' : '') + (f.strike ? 's' : '') + (f.sup ? '^' : f.sub ? '_' : '');
    };
    var xa = function () {
      if (!nhom) return;
      var k = nhom.k, s = escText(nhom.s);
      if (k.indexOf('^') >= 0) s = '<sup>' + s + '</sup>';
      else if (k.indexOf('_') >= 0) s = '<sub>' + s + '</sub>';
      if (k.indexOf('s') >= 0) s = '<del>' + s + '</del>';
      if (k.indexOf('u') >= 0) s = '<u>' + s + '</u>';
      if (k.indexOf('i') >= 0) s = '<em>' + s + '</em>';
      if (k.indexOf('b') >= 0) s = '<strong>' + s + '</strong>';
      out += s; nhom = null;
    };
    ds.forEach(function (t) {
      if (t.t === 'text' || t.t === 'tab') {
        var s = t.t === 'tab' ? ' ' : t.s, k = t.t === 'tab' ? (nhom ? nhom.k.replace(/[u^_s]/g, '') : '') : khoaKieu(t.f);
        if (t.t === 'tab' && nhom) { nhom.s += ' '; return; }
        if (nhom && nhom.k === k) nhom.s += s;
        else { xa(); nhom = { k: k, s: s }; }
        return;
      }
      xa();
      out += self.doiTuong(t);
    });
    xa();
    return out;
  };

  TaoHtml.prototype.doiTuong = function (t) {
    if (t.t === 'math') return t.mathml;
    if (t.t === 'img') {
      if (t.loi) {
        if (t.loi === 'thieu') this.baoLoi('error', 'thiếu file ảnh trong gói Word (' + (t.rId || '?') + ')');
        else if (t.loi === 'ngoai') this.baoLoi('error', 'có ảnh liên kết ngoài (không nhúng trong file) — hãy chèn ảnh trực tiếp vào Word');
        else if (t.loi === 'emf' || t.loi === 'wmf') {
          if (t.progId && t.progId !== 'OLE' && !/^Equation\.|MathType|^DSMT/i.test(t.progId)) {
            this.baoLoi('error', 'có đối tượng ' + t.progId + ' (ảnh ' + TB_ANH[t.loi] + ') — Canvas không hiển thị được; hãy chụp/lưu đối tượng thành ảnh PNG rồi chèn lại');
          } else this.baoLoi('error', 'có ' + (t.progId && t.progId !== 'OLE' ? 'đối tượng ' + t.progId + ' (ảnh ' + TB_ANH[t.loi] + ')' : 'công thức MathType/ảnh ' + TB_ANH[t.loi]) + GOI_Y_MT);
        } else this.baoLoi('error', 'có ảnh định dạng ' + (TB_ANH[t.loi] || t.loi) + ' — Canvas không hiển thị được; hãy lưu ảnh thành PNG/JPG rồi chèn lại');
        return '';
      }
      var ten = this.ctx.tenAnh(t.media, t.loai);
      this.dsAnh[ten] = 1;
      if (t.progId) this.baoLoi('warn', 'có đối tượng nhúng ' + t.progId + ' — chỉ lấy được ảnh xem trước');
      return '<img src="images/' + ten + '" alt="' + escAttr(t.alt || '') + '" style="max-width:100%;height:auto"' + (t.w ? ' width="' + t.w + '"' : '') + '>';
    }
    if (t.t === 'ole') {
      if (t.loai === 'mathtype') this.baoLoi('error', 'có công thức MathType (' + t.progId + ')' + GOI_Y_MT);
      else if (t.loai === 'eq') this.baoLoi('error', 'có công thức dạng trường EQ (Word cũ) — hãy gõ lại bằng Chèn → Phương trình (Insert → Equation)');
      else if (t.loai === 'omml') this.baoLoi('error', 'có công thức Word không đọc được');
      else this.baoLoi('error', 'có đối tượng nhúng ' + (t.progId || 'OLE') + ' không chuyển được — hãy chụp thành ảnh PNG và chèn lại');
      return '';
    }
    if (t.t === 'hinh') {
      this.baoLoi('warn', 'có ' + t.loai + (t.chu ? '/hộp văn bản (text box)' : '') + ' của Word không chuyển được — nội dung đó bị bỏ; hãy chụp thành ảnh PNG và chèn lại');
      return '';
    }
    return '';
  };

  TaoHtml.prototype.bang = function (tbl, o) {
    var self = this, h = '<table style="border-collapse:collapse"><tbody>';
    tbl.rows.forEach(function (row) {
      h += '<tr>';
      row.forEach(function (c) {
        if (c.boQua) return;
        var donVi = taoDonVi(c.blocks, o.mt);
        h += '<td style="border:1px solid #999;padding:4px 8px"' + (c.span > 1 ? ' colspan="' + c.span + '"' : '') +
          (c.rowspan > 1 ? ' rowspan="' + c.rowspan + '"' : '') + '>' + self.noi(donVi, o) + '</td>';
      });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  };

  // các đơn vị → HTML nội tuyến (dòng ngăn bằng <br>) — cho phương án, ý, ô bảng
  TaoHtml.prototype.noi = function (units, o) {
    var self = this, parts = [];
    units.forEach(function (u) {
      if (u.k === 'tbl') { parts.push(self.bang(u.tbl, o)); return; }
      var h = self.toks(u.toks, o);
      if (h) parts.push(h);
    });
    var out = '';
    parts.forEach(function (p, i) { out += (i && !/^<table/.test(p) && !/<\/table>$/.test(parts[i - 1]) ? '<br>' : '') + p; });
    return out;
  };

  // các đơn vị → HTML khối: dòng cùng đoạn gộp vào một <p> (ngăn bằng <br>)
  TaoHtml.prototype.khoi = function (units, o) {
    var self = this, out = '', cur = null;
    var xa = function () {
      if (!cur) return;
      var h = cur.parts.filter(Boolean).join('<br>');
      if (h) out += '<p' + (cur.jc ? ' style="text-align:' + cur.jc + '"' : '') + '>' + h + '</p>';
      cur = null;
    };
    units.forEach(function (u) {
      if (u.k === 'tbl') { xa(); out += self.bang(u.tbl, o); return; }
      var h = self.toks(u.toks, o);
      if (cur && cur.para === u.para) { cur.parts.push(h); return; }
      xa();
      cur = { para: u.para, jc: u.jc, parts: [h] };
    });
    xa();
    return out;
  };

  /* ======================= nhận diện dòng ======================= */

  var RE_NGAN_HANG = /^[\s\uFFFC]*ngan\s*hang(?:\s+cau\s+hoi)?\s*[:：]\s*/;
  var RE_DIEM_MD = /^[\s\uFFFC]*diem\s+mac\s+dinh\s*[:：]?\s*/;
  var RE_DOAN_DAN = /^[\s\uFFFC]*doan\s+dan(?:\s+chung)?(?:\s*\d+)?\s*(?:[:：]\s*|$)/;
  var RE_HET_DOAN_DAN = /^[\s\uFFFC\-–—_*=]*het\s+doan\s+dan\b/;
  var RE_HET = /^[\s\-–—_*=.~]*(?:het|the\s+end)[\s\-–—_*=.~!]*$/;
  var RE_BANG_DA = /^[\s\uFFFC]*bang\s+dap\s+an\b(?:\s+(?:va|&)\s+huong\s+dan\s+cham)?\s*[:：.]?\s*/;
  var RE_DAP_AN = /^[\s\uFFFC]*(?:dap\s*an(?:\s+dung)?|d\.?\s?a\.?|d\/a|answers?)\s*[:：]\s*/;
  var RE_LOI_GIAI = /^[\s\uFFFC]*(?:(?:loi\s+giai|huong\s+dan\s+giai|giai\s+thich|giai)(?:\s+chi\s+tiet)?|huong\s+dan\s+cham|hd\s*giai|hd\s*cham|hdg|hdc)\s*(?:[:：.]\s*|$)/;
  var RE_NHIEU = /^[\s\uFFFC]*(?:nhieu|gay\s+nhieu|phuong\s+an\s+nhieu|distractors?)\s*[:：]\s*/;
  var RE_MUI_TEN_MANH = /=>|⇒|⟹/;
  var RE_MUI_TEN = /=>|⇒|⟹|->|→|⟶/;

  var MUC_DO = { nb: 'NB', 'nhan biet': 'NB', th: 'TH', 'thong hieu': 'TH', vd: 'VD', 'van dung': 'VD', vdc: 'VDC', 'van dung cao': 'VDC' };
  var THE_LOAI = {
    tn: 'mc', 'trac nghiem': 'mc', nd: 'ma', 'nhieu dap an': 'ma', ds: 'tf', 'dung sai': 'tf', 'dung/sai': 'tf', tln: 'short', 'tra loi ngan': 'short',
    so: 'num', 'dien so': 'num', dien: 'blanks', 'dien khuyet': 'blanks', chon: 'dropdowns', ghep: 'matching', 'ghep noi': 'matching',
    tl: 'essay', 'tu luan': 'essay'
  };

  function soLaMa(s) {
    var v = { i: 1, v: 5, x: 10, l: 50, c: 100 }, n = 0;
    s = s.toLowerCase();
    for (var i = 0; i < s.length; i++) { var a = v[s[i]], b = v[s[i + 1]] || 0; n += a < b ? -a : a; }
    return n;
  }

  function laCau(u, g) {
    var m = /^([\s\uFFFC]*)(cau(?:\s*hoi)?|question)\s*(\d{1,4})/.exec(g);
    if (!m) return null;
    var s = u.str, tu = s.substr(m[1].length, 3);
    if (m[2].charAt(0) === 'c' && !/^c[âÂaA]u$/i.test(tu)) return null; // "Cầu", "Cấu"… không phải "Câu"
    var p = m[0].length, sau = s.slice(p);
    if (/^\s*[-–—]\s*\d/.test(sau)) return null; // "Question 1 - 6" là tiêu đề nhóm
    var k = /^\s*([.:)\-–—])/.exec(sau), ngan = false;
    if (k) { p += k[0].length; ngan = true; }
    else if (!(/^\s*$/.test(sau) || /^\s*[(\[]/.test(sau) || /^\s+[\p{Lu}\d\uFFFC$"“'‘]/u.test(sau))) return null;
    return { no: String(parseInt(m[3], 10)), dau: m[1].length, cuoi: p, ngan: ngan };
  }

  function laPhan(u, g) {
    var m = /^([\s\uFFFC]*)phan\s+([ivxlc]+|\d{1,2})(?![\p{L}\d])/u.exec(g), co = true;
    if (!m) { m = /^([\s\uFFFC]*)phan\s+(?=\S)/.exec(g); co = false; if (!m) return null; }
    var s = u.str, tu = s.substr(m[1].length, 4);
    if (!/^ph[ầẦaA]n$/i.test(tu)) return null;
    var hoa = tu === tu.toUpperCase();
    var sau = s.slice(m[0].length);
    if (co) {
      if (!hoa && !/^\s*([.:\-–—)]|$)/.test(sau)) return null;
    } else {
      // "PHẦN TRẮC NGHIỆM" — chỉ nhận khi viết hoa toàn bộ phần chữ đầu dòng
      var dauDong = s.slice(m[1].length).replace(/\(.*$/, '');
      if (!hoa || dauDong !== dauDong.toUpperCase() || dauDong.length > 120) return null;
    }
    var so = co ? m[2] : '';
    var key = !so ? '' : /^\d+$/.test(so) ? String(+so) : String(soLaMa(so));
    return { key: key, so: so.toUpperCase(), ten: chuThuan(u.toks).replace(/\s+/g, ' ').trim(), loai: loaiPhan(g) };
  }
  function loaiPhan(g) {
    return /dung\s*[-–\/]?\s*sai/.test(g) ? 'tf' : /tra\s+loi\s+ngan/.test(g) ? 'short' : /tu\s+luan/.test(g) ? 'essay' :
      /nhieu\s+phuong\s+an|trac\s+nghiem/.test(g) ? 'mc' : '';
  }
  // Tiêu đề mục viết hoa không có chữ PHẦN: "I. TRẮC NGHIỆM (7 điểm)", "B. TỰ LUẬN", "TRẮC NGHIỆM KHÁCH QUAN"
  // (nếu không nhận, dòng này sẽ dính vào phương án cuối của câu trước)
  function laTieuDeMuc(u, g) {
    var m = /^([\s\uFFFC]*)(?:([ivx]{1,4}|[a-d]|\d{1,2})\s*[.\-–—:)]\s*)?(?=\S)/.exec(g);
    if (!m) return null;
    var than = u.str.slice(m[0].length).replace(/\(.*$/, '').trim();
    if (!than || than.length > 80 || than !== than.toUpperCase() || !/\p{Lu}.*\p{Lu}/u.test(than)) return null;
    if (!/^(trac\s+nghiem|tu\s+luan|dung\s*[-–\/]?\s*sai|tra\s+loi\s+ngan)/.test(gap(than))) return null;
    var so = m[2] && !/^[a-d]$/.test(m[2]) ? m[2] : '';
    return {
      key: !so ? '' : /^\d+$/.test(so) ? String(+so) : String(soLaMa(so)), so: so.toUpperCase(),
      ten: chuThuan(u.toks).replace(/\s+/g, ' ').trim(), loai: loaiPhan(g)
    };
  }
  function laPhanBatKy(u, g) { return laPhan(u, g) || laTieuDeMuc(u, g); }

  // nhãn phương án A–H ở đầu dòng: "A." "B)" "C:" "*D." "A<tab>"
  var RE_NHAN_PA = /^(\s*)(\*?)[ ]*([A-H])(?:[ ]*([.):])|[ ]*(?=\t))/;
  var RE_NHAN_Y = /^(\s*)(\*?)[ ]*([a-h])[ ]*([).])/;
  function nhanDau(line, re) {
    var m = re.exec(line.str);
    if (!m) return null;
    var viTriChu = m[1].length + m[2].length + line.str.slice(m[1].length + m[2].length).indexOf(m[3]);
    var cuoi = m[0].length;
    while (cuoi < line.str.length && /\s/.test(line.str[cuoi])) cuoi++;
    var kt = kieuTai(line, viTriChu);
    return { chu: m[3], sao: !!m[2], dau: m[1].length, viTriChu: viTriChu, cuoi: cuoi, f: kt.f, auto: kt.auto, manh: true };
  }
  function chuKe(c) { return String.fromCharCode(c.charCodeAt(0) + 1); }

  // tìm các nhãn kế tiếp trên cùng dòng ("A. 1   B. 2   C. 3   D. 4")
  function nhanCungDong(line, dau) {
    var s = line.str, ds = [dau], cur = dau;
    for (;;) {
      var L = chuKe(cur.chu);
      if (L > 'H') break;
      var re = new RegExp('(\\s+)(\\*?)[ ]*' + L + '(?:[ ]*([.):])|[ ]*(?=\\t))', 'g');
      re.lastIndex = cur.cuoi;
      var m, chon = null;
      while ((m = re.exec(s))) {
        var manh = m[1].indexOf('\t') >= 0 || m[1].length >= 2;
        var cand = { m: m, manh: manh };
        if (manh) { chon = cand; break; }
        if (!chon) chon = cand;
      }
      if (!chon) break;
      m = chon.m;
      var batDau = m.index + m[1].length, viTriChu = batDau + m[2].length + s.slice(batDau + m[2].length).indexOf(L);
      var cuoi = m.index + m[0].length;
      while (cuoi < s.length && /\s/.test(s[cuoi])) cuoi++;
      var kt = kieuTai(line, viTriChu);
      cur = { chu: L, sao: !!m[2], dau: batDau, viTriChu: viTriChu, cuoi: cuoi, f: kt.f, auto: false, manh: chon.manh };
      ds.push(cur);
    }
    if (ds.length > 1 && ds.some(function (x, i) { return i && !x.manh; })) {
      if (ds.length === 2) {
        var nd1 = s.slice(dau.cuoi, ds[1].dau).trim(), nd2 = s.slice(ds[1].cuoi);
        if (!(nd1.length <= 30 && /^[\p{Lu}\d\uFFFC$\-\u2212(]/u.test(nd2))) ds = [dau];
      }
    }
    return ds;
  }

  /* ======================= phân tích đáp án ======================= */

  function tachChuCai(s) { // "B" | "A, C" | "AC" | "A và C" | "Chọn B" | "B. Hà Nội" → ['B'] …
    var t = core.nfc(String(s || '')).trim();
    var g = gap(t), m = /^(?:chon|dap\s*an|phuong\s+an)\s*:?\s*/.exec(g);
    if (m) t = t.slice(m[0].length);
    var tk = t.split(/[\s,;&+\/]+/), out = [];
    for (var i = 0; i < tk.length; i++) {
      var x = tk[i];
      if (!x) continue;
      if (/^(và|va|and)$/i.test(x)) continue;
      var a = /^\*?([A-Ha-h])[.):]?$/.exec(x);
      if (a) { out.push(a[1].toUpperCase()); continue; }
      // mẫu upload: "A=30, B=30, C=40, D=-80" — trọng số > 0 là phương án đúng, ≤ 0 là sai
      var w = /^([A-H])=([-+]?\d+(?:[.,]\d+)?)%?$/.exec(x);
      if (w) { if (parseFloat(w[2].replace(',', '.')) > 0) out.push(w[1]); continue; }
      if (!out.length && /^[A-H]{2,8}[.]?$/.test(x)) { out = out.concat(x.replace('.', '').split('')); continue; }
      break;
    }
    if (!out.length) { var b = /^([A-H])[.)]\s/.exec(t); if (b) out.push(b[1]); }
    var seen = {};
    out = out.filter(function (c) { if (seen[c]) return false; seen[c] = 1; return true; });
    return out.length ? out : null;
  }

  // Đúng/Sai: "ĐSĐS" | "Đ, S, Đ, S" | "a-Đ, b-S" | "a) Đúng b) Sai" | T/F | True/False
  function docDungSai(s, keys) {
    var t = core.nfc(String(s || '')).toUpperCase();
    t = t.replace(/ĐÚNG|DUNG\b/g, 'Đ').replace(/SAI\b/g, 'S').replace(/TRUE/g, 'T').replace(/FALSE/g, 'F');
    var re = /([A-H])\s*[).:\-–=]\s*([ĐSTFD])(?![A-ZĐ])/g, m, theoKhoa = {}, coKhoa = 0;
    var hong = false; // khoá trùng/lạ (vd "D-S-D-S" với D = Đúng) → không phải dạng có khoá
    while ((m = re.exec(t))) {
      var kk = m[1].toLowerCase();
      if (hasOwn(theoKhoa, kk) || keys.indexOf(kk) < 0) hong = true;
      theoKhoa[kk] = /[ĐTD]/.test(m[2]); coKhoa++;
    }
    if (coKhoa && !hong) {
      var thieu = keys.filter(function (k) { return !hasOwn(theoKhoa, k); });
      return { map: theoKhoa, thieu: thieu };
    }
    var day = t.replace(/[\s,;.\-–\/|()]/g, '');
    if (!day || !/^[ĐSTFD]+$/.test(day)) return null;
    var map = {}, cs = Array.from(day);
    keys.forEach(function (k, i) { if (i < cs.length) map[k] = /[ĐTD]/.test(cs[i]); });
    return { map: map, thieu: keys.slice(cs.length), thua: cs.length > keys.length };
  }

  function docSo(s) {
    var t = String(s).trim().replace(/\u2212/g, '-').replace(/\s+/g, '');
    if (!/^[-+]?(\d+([.,]\d+)*|[.,]\d+)$/.test(t)) return null;
    var c = (t.match(/,/g) || []).length, d = (t.match(/\./g) || []).length;
    if (c && d) {
      if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
      else t = t.replace(/,/g, '');
    } else if (c) t = c > 1 ? t.replace(/,/g, '') : t.replace(',', '.');
    else if (d > 1) t = t.replace(/\./g, '');
    var v = parseFloat(t);
    return isFinite(v) ? v : null;
  }
  var RE_SAI_SO = /^(.+?)\s*(?:±|\+\/-|\+-)\s*(.+)$/;
  var RE_KHOANG = /^(.+?)\s*(?:\.\.\.?|…)\s*(.+)$/;
  function coKhoang(s) { return RE_SAI_SO.test(s) || RE_KHOANG.test(s); }
  function docDapAnSo(s) {
    var t = String(s).trim().replace(/\.$/, ''), m;
    if ((m = RE_SAI_SO.exec(t))) {
      var a = docSo(m[1]), b = docSo(m[2]);
      return a == null || b == null ? null : { exact: a, margin: Math.abs(b) };
    }
    if ((m = RE_KHOANG.exec(t))) {
      var x = docSo(m[1]), y = docSo(m[2]);
      return x == null || y == null ? null : { min: Math.min(x, y), max: Math.max(x, y) };
    }
    var v = docSo(t);
    return v == null ? null : { exact: v, margin: 0 };
  }
  // các cách viết ngăn bằng ";" hoặc "|" — không tách bên trong ngoặc: "(2; 1)" là một đáp án (toạ độ)
  function tachCachViet(s) {
    var out = [], cur = '', sau = 0;
    Array.from(String(s)).forEach(function (c) {
      if (c === '(' || c === '[' || c === '{') sau++;
      else if ((c === ')' || c === ']' || c === '}') && sau) sau--;
      if ((c === ';' || c === '|') && !sau) { out.push(cur); cur = ''; return; }
      cur += c;
    });
    out.push(cur);
    return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // cặp trong bảng đáp án dạng chữ: "1.A 2.B 3-C 4: D" / "Câu 1: A; Câu 2: 2,5"
  function tachCapKey(s) {
    var g = gap(s), re = /(^|[\s,;|])(?:cau\s*)?(\d{1,3})\s*(?:([.:\-–—)])(?![\d])|(?=[a-h](?:[^a-z0-9]|$)))/g, m, dau = [];
    while ((m = re.exec(g))) {
      dau.push({ no: String(+m[2]), tu: m.index + m[1].length, vao: m.index + m[0].length });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return dau.map(function (d, i) {
      var v = s.slice(d.vao, i + 1 < dau.length ? dau[i + 1].tu : s.length).trim().replace(/[,;|]+$/, '').trim();
      return { no: d.no, v: v };
    }).filter(function (x) { return x.v; });
  }

  var RE_TIEU_DE_DA = /(?:^|[^a-z])(?:dap\s*an|huong\s+dan\s+cham|answer\s+keys?|answers?\s+sheet)(?![a-z])/;
  var RE_SO_KEY_G = /\s+[-–]\s+(?=[\w.]*\d)[\w]+(?:\.[\w]+){2,}\s*$/; // "A - 4.0.TA.1.3": mã chỉ báo năng lực đi kèm đáp án

  /* ======================= phân tích mẫu ======================= */

  // Chế độ đọc: 'cau' = câu bắt đầu bằng "Câu N"/"Question N" (mẫu của trường, đề THPT);
  // 'so' = câu chỉ đánh số "1." "12)" "14<tab>" (đề tiếng Anh, IELTS, đề tiểu học trong bảng)
  function xetCheDo(units, mt) {
    var nCau = 0, nSo = 0;
    var duyet = function (ds, sau) {
      ds.forEach(function (u) {
        if (u.k === 'tbl') {
          if (sau > 3) return;
          u.tbl.rows.forEach(function (r) { r.forEach(function (c) { if (!c.boQua) duyet(donViCuaO(c, mt), sau + 1); }); });
          return;
        }
        if (u.k !== 'line' || dongRong(u)) return;
        var g = gap(u.str);
        if (laCau(u, g)) nCau++;
        else if (laSo(u)) nSo++;
      });
    };
    duyet(units, 0);
    return nCau >= 2 || (nCau >= 1 && nSo < 3) ? 'cau' : 'so';
  }

  // "12." "12)" "14<tab>" ở đầu dòng (không nhận số thập phân "1.5")
  function laSo(u) {
    var m = /^([\s\uFFFC]*)(\d{1,3})(?:[ ]*[.)](?!\d)|[ ]*(?=\t))/.exec(u.str);
    if (!m) return null;
    var p = m[0].length;
    while (p < u.str.length && /\s/.test(u.str[p])) p++;
    return { no: String(parseInt(m[2], 10)), dau: m[1].length, cuoi: p, ngan: true };
  }

  // Dòng chỉ dẫn mở một nhóm câu: có phạm vi câu ("Questions 1-6", "câu 18 đến câu 22", "from 18 to 22"),
  // hoặc (chế độ 'so') lời dặn kiểu "1. Look and CIRCLE … There is one example. (…/5 points)"
  var RE_PHAM_VI = /(?:^|[^a-z])(?:questions?|cau(?:\s*hoi)?|boxes|box|items?)\s+(?:(?:from|tu)\s+)?(?:cau\s+)?(\d{1,3})\s*(?:-|–|—|to|den|and|&)\s*(?:cau\s+)?(\d{1,3})(?!\d)/;
  var RE_PHAM_VI2 = /(?:questions?|cau(?:\s*hoi)?)\b[^.:]{0,40}?(?:from|tu)\s+(?:cau\s+)?(\d{1,3})\s*(?:to|den|-|–)\s*(?:cau\s+)?(\d{1,3})(?!\d)/;
  var RE_O_DIEM = /\(\s*[.…_\s]*\/\s*\d+(?:[.,]\d+)?\s*(?:points?|pts?|marks?|diem|d)\s*\)/;
  var RE_VI_DU = /there\s+(?:is|are)\s+(?:one|an|two|\d+)\s+examples?|co\s+(?:mot|1|hai|2)\s+(?:cau\s+)?vi\s+du/;
  var RE_DONG_TU_HOA = /(?:^|[^A-Za-z])(?:CHOOSE|CIRCLE|WRITE|READ|LOOK|LISTEN|MATCH|COMPLETE|REARRANGE|TICK|FILL|UNDERLINE|COLOU?R|DRAW|FIND|ORDER|CROSS|PUT|SORT)(?![A-Za-z])/;
  function phamVi(g) {
    var m = RE_PHAM_VI.exec(g) || RE_PHAM_VI2.exec(g);
    if (!m) return null;
    var tu = +m[1], den = +m[2];
    return den > tu && den - tu <= 80 ? { tu: tu, den: den } : null;
  }
  function laChiDan(u, g, so) {
    if (RE_DAP_AN.test(g) || RE_LOI_GIAI.test(g) || RE_NHIEU.test(g)) return null;
    if (nhanDau(u, RE_NHAN_PA) || nhanDau(u, RE_NHAN_Y)) return null;
    var pv = phamVi(g);
    if (pv) return pv;
    if (!so || u.str.replace(/\s+/g, ' ').trim().length > 400) return null;
    if (RE_O_DIEM.test(g) || RE_VI_DU.test(g) || RE_DONG_TU_HOA.test(u.str)) return {};
    return null;
  }

  // Tiêu đề mục chung (không có chữ PHẦN): "I. Vocabulary", "III. Reading", "B. GRAMMAR", "READING PASSAGE 2"
  function laTieuDeChung(u) {
    var s = u.str.replace(/\uFFFC/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s || s.length > 60) return null;
    var m = /^([IVX]{1,4}|[A-H])\s*[.)\-–:]\s*(.+)$/.exec(s), nhan = m ? m[1] : '', than = (m ? m[2] : s).replace(/[\s:.\-–—]+$/, '');
    var chu = than.replace(/[^\p{L}]/gu, '');
    if (chu.length < 4 || !/\p{L}{3}/u.test(than)) return null;
    var g = gap(s);
    if (RE_DAP_AN.test(g) || RE_LOI_GIAI.test(g) || RE_NHIEU.test(g)) return null;
    var hoa = than === than.toUpperCase() && /\p{Lu}/u.test(than);
    var pt = !nhan && /^(?:part|section)\s+(\d{1,2}|[IVX]{1,4}|[A-D])(?![\p{L}\d])/iu.exec(than); // "Part 2", "Section B: Reading"
    if (pt) return { key: /^\d+$/.test(pt[1]) ? String(+pt[1]) : /^[IVX]+$/i.test(pt[1]) ? String(soLaMa(pt[1])) : '', so: pt[1].toUpperCase(), ten: s, loai: loaiPhan(gap(s)), chung: true };
    if (hoa) {
      if (/\d/.test(than.replace(/\s\d{1,2}$/, ''))) return null; // "CH3COOH" là công thức, không phải tiêu đề
    } else if (!(/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(nhan) && /^\p{Lu}/u.test(than) && than.split(' ').length <= 6 && !/[?!;,]/.test(than))) return null;
    var so = /^[IVX]{1,4}$/.test(nhan) ? nhan : (/\s(\d{1,2})$/.exec(than) || [])[1] || '';
    return { key: !so ? '' : /^\d+$/.test(so) ? String(+so) : String(soLaMa(so)), so: so.toUpperCase(), ten: s, loai: loaiPhan(gap(s)), chung: true };
  }

  // Định dạng mẫu upload câu hỏi (mã loại trong ngoặc vuông + dòng ANSWER có trọng số):
  // "Câu 1 [OC-NB]:" một đáp án, [MC] nhiều đáp án, [TF] hai lựa chọn, [FB] điền khuyết [[1]], [SDL] chọn từ danh sách,
  // [ES] tự luận, [EM] câu chùm gồm các câu con "[TF]: …" "[OC]: …"
  var MA_UPLOAD = { tf: '', oc: 'mc', mc: 'ma', fb: 'blanks', sdl: 'dropdowns', es: 'essay', em: 'em' };
  var RE_CAU_CON = /^([\s\uFFFC]*)\[\s*(tf|oc|mc|fb|sdl|es)\s*\]\s*[:：.]?\s*/;
  var RE_DINH_O = /^[\s\uFFFC]*\[\[\s*(\d{1,3})\s*\]\]\s*(?:[=:]\s*-?\d+(?:[.,]\d+)?\s*%?)?\s*$/;
  // phần đầu mục đáp án trong đề: "ĐÁP ÁN", "HƯỚNG DẪN CHẤM", "ANSWER KEY" (viết hoa, đứng riêng một dòng)
  var RE_MUC_DA = /^[\s\uFFFC]*(?:dap\s+an(?:\s+(?:va|&)\s+huong\s+dan\s+cham)?|huong\s+dan\s+cham|answer\s+keys?|answers|keys?)\s*[:.]?\s*$/;

  // các nhãn A–H trong một dòng ở bất kỳ thứ tự nào ("A. there⇥C. next to⇥E. are") — danh sách lựa chọn chung của nhóm
  function tachNhanNhom(line) {
    var dau = nhanDau(line, RE_NHAN_PA);
    if (!dau) return null;
    var s = line.str, re = /(\t|[ ]{2,})(\*?)[ ]*([A-H])(?:[ ]*[.):]|[ ]*(?=\t))/g, ds = [dau], m;
    re.lastIndex = dau.cuoi;
    while ((m = re.exec(s))) {
      var batDau = m.index + m[1].length, cuoi = m.index + m[0].length;
      while (cuoi < s.length && /\s/.test(s[cuoi])) cuoi++;
      ds.push({ chu: m[3], sao: !!m[2], dau: batDau, cuoi: cuoi, f: kieuTai(line, batDau + m[2].length).f, auto: false });
    }
    var out = ds.map(function (n, i) {
      var den = i + 1 < ds.length ? ds[i + 1].dau : s.length;
      return { nhan: n.chu, goc: n.chu, sao: n.sao, auto: n.auto, fNhan: n.f, nhanToks: cat(line.toks, n.dau, n.cuoi), units: [catDong(line, n.cuoi, den)] };
    });
    if (out.some(function (o) { return chuThuan(o.units[0].toks).trim().length > 150; })) return null;
    return out;
  }
  function theoNhan(a, b) { return a.nhan < b.nhan ? -1 : a.nhan > b.nhan ? 1 : 0; }
  function paChu(nhan, chu) {
    return { nhan: nhan, goc: nhan, sao: false, auto: false, fNhan: {}, nhanToks: [{ t: 'text', s: nhan + '. ', f: {} }],
      units: [taoDong([{ t: 'text', s: chu, f: {} }], 0, '')], tuNhom: true };
  }
  function saoPA(o, tuNhom) {
    var c = {};
    for (var k in o) if (hasOwn(o, k)) c[k] = o[k];
    if (tuNhom) c.tuNhom = true;
    return c;
  }

  // vị trí phương án "A." nằm giữa dòng câu hỏi: "Câu hỏi⇥A. x⇥B. y" (cần có cả nhãn B phía sau)
  function viTriPATrongDong(line) {
    var s = line.str, m = /(\t|[ ]{2,})(\*?)[ ]*A[ ]*[.)]/.exec(s);
    if (!m || !/\S/.test(s.slice(0, m.index))) return -1;
    var sau = s.slice(m.index + m[0].length);
    return /(\t|[ ]{2,})\*?[ ]*B[ ]*[.)]/.test(sau) ? m.index + m[1].length : -1;
  }

  function phanTich(units, ctx, mt, tenFile, tuyChon) {
    tuyChon = tuyChon || {};
    var chiKey = !!tuyChon.chiDapAn;
    var banks = [], B = null, Q = null;
    var st = { diemMD: 1, phan: null, stim: null, stimThu: false, mode: '', keyPhan: '', keyCho: null, nhom: null, soCuoi: -1, em: null, keyDong: null };
    var coDongNH = units.some(function (u) { return u.k === 'line' && RE_NGAN_HANG.test(gap(u.str)); });
    var cheDo = xetCheDo(units, mt);

    function moBank(title) {
      dongCau(); dongHetNhom(); dongStim();
      // cùng tên với ngân hàng đã có → viết tiếp vào đó (tránh hai ngân hàng trùng ident)
      var cu = banks.filter(function (b) { return b.title === title; })[0];
      if (cu) {
        B = cu;
        B.warnings.push(core.newIssue('info', 'Dòng "NGÂN HÀNG: ' + title + '" xuất hiện lần nữa — các câu sau được gộp vào ngân hàng đã có'));
      } else {
        B = { title: title, cau: [], phan: [], key: [], warnings: [], le: [], cheDo: cheDo };
        banks.push(B);
      }
      st.phan = null; st.mode = chiKey ? 'key' : ''; st.keyPhan = ''; st.keyCho = null; st.soCuoi = -1; st.keyDong = null;
    }
    function dongCau() { if (Q) { B.cau.push(Q); Q = null; } }
    function dongStim() {
      if (st.stim && !st.stim.soCau && st.stim.units.some(function (u) { return !dongRong(u); })) {
        B.warnings.push(core.newIssue('warn', 'Có ĐOẠN DẪN không gắn với câu hỏi nào (cần có "Câu …" sau đoạn dẫn)'));
      }
      st.stim = null; st.stimThu = false;
    }
    if (!coDongNH || chiKey) moBank(tenFile);

    /* ---- nhóm câu (lời dặn + đoạn văn dùng chung cho các câu sau nó) ---- */
    function taoNhom(tu, den, cha) {
      return { tu: tu, den: den, cha: cha, units: [], rieng: [], pa: [], tap: null, chuCai: null, soCau: 0, daCo: {}, em: false, phan: st.phan };
    }
    function taoQ(no, nhom) {
      return {
        no: no, diem: null, diemMD: st.diemMD, muc: '', the: '', phan: st.phan, stim: null, nhom: nhom || null,
        items: [], opts: [], stmts: [], nhieu: [], dapAn: null, dapAnKhac: [], fb: [], fbMode: false, mo: null, keyVal: null, loi: []
      };
    }
    // nhóm có phạm vi câu mà không có câu đánh số nào nhưng có phương án ("Questions 21-22 · Choose TWO letters · A. … E. …")
    // → một câu nhiều đáp án gánh cả phạm vi
    function dongNhom(g) {
      if (g.dong) return;
      g.dong = true;
      if (g.tu == null || g.soCau || g.pa.length < 2 || !B) return;
      var q = taoQ(g.tu + '-' + g.den, g.cha);
      q.phan = g.phan;
      q.diem = (g.den - g.tu + 1) * st.diemMD;
      g.rieng.forEach(function (x) { q.items.push({ vai: 'stem', u: x }); });
      g.pa.slice().sort(theoNhan).forEach(function (o) { q.opts.push(saoPA(o)); q.items.push({ vai: 'opt', i: q.opts.length - 1 }); });
      B.cau.push(q);
    }
    function dongHetNhom() {
      for (var g = st.nhom; g; g = g.cha) dongNhom(g);
      st.nhom = null; st.em = null;
    }
    // trước khi mở câu số no: đóng các nhóm không chứa câu này (phạm vi khác, câu chùm [EM] cũ)
    function nhomChoCau(no) {
      var n = parseInt(no, 10);
      while (st.nhom) {
        var g = st.nhom;
        if (g.em || (g.tu != null && n !== 0 && !(n >= g.tu && n <= g.den))) { dongNhom(g); st.nhom = g.cha; continue; }
        break;
      }
      st.em = null;
    }
    function danhDauNhom(no) {
      for (var g = st.nhom; g; g = g.cha) { g.soCau++; g.daCo[no] = 1; }
      // câu cùng số đã sinh từ ô trống trong đoạn văn (đoạn văn cloze có "(18) ____") → bỏ, giữ câu thật
      for (var i = B.cau.length - 1; i >= 0; i--) if (B.cau[i].oTrong && B.cau[i].no === no) B.cau.splice(i, 1);
    }
    function moNhom(u, cd) {
      dongStim();
      var co = cd.tu != null, g = st.nhom;
      if (g && !g.soCau && !g.em && (!co || g.tu == null || (g.tu === cd.tu && g.den === cd.den))) {
        if (co && g.tu == null) { g.tu = cd.tu; g.den = cd.den; } // lời dặn tiếp theo của cùng nhóm
        g.units.push(u); g.rieng.push(u);
        return;
      }
      if (co) { while (g && !(g.tu != null && g.tu <= cd.tu && cd.den <= g.den)) { dongNhom(g); g = g.cha; } }
      else { while (g) { dongNhom(g); g = g.cha; } }
      st.nhom = taoNhom(co ? cd.tu : null, co ? cd.den : null, g);
      st.nhom.units.push(u); st.nhom.rieng.push(u);
      st.em = null; st.soCuoi = -1;
    }
    function themVaoNhom(g, u) {
      g.units.push(u);
      if (u.k !== 'line') { g.rieng.push(u); return; }
      var ds = tachNhanNhom(u);
      if (ds) { ds.forEach(function (o) { if (!g.pa.some(function (p) { return p.nhan === o.nhan; })) g.pa.push(o); }); return; }
      g.rieng.push(u);
      var s = chuThuan(u.toks).replace(/\s+/g, ' ').trim(), m;
      if ((m = /^(TRUE|FALSE|NOT GIVEN|YES|NO)(?![A-Za-z])/.exec(s)) && s.length > m[1].length + 3) {
        g.tap = g.tap || [];
        if (g.tap.indexOf(m[1]) < 0) g.tap.push(m[1]);
      }
      if ((m = /(?:^|[^A-Za-z])([A-H])\s*[-–—]\s*([A-H])(?![A-Za-z])/.exec(s)) && m[1] < m[2]) {
        g.chuCai = [];
        for (var c = m[1].charCodeAt(0); c <= m[2].charCodeAt(0); c++) g.chuCai.push(String.fromCharCode(c));
      } else if ((m = /(?:^|[^A-Za-z])((?:[A-H]\s*,\s*)+)(?:or|and|hoặc|và)\s+([A-H])(?![A-Za-z])/.exec(s))) {
        g.chuCai = (m[1].match(/[A-H]/g) || []).concat([m[2]]);
      }
    }
    function themKhongCau(u) {
      if (st.stim && st.stimThu) { st.stim.units.push(u); return; }
      if (st.nhom) { themVaoNhom(st.nhom, u); return; }
      B.le.push(u);
    }

    // ô trống đánh số trong lời văn của nhóm (IELTS: "… 23 electromagnetic radiation …" — đáp án tô màu ngay sau số,
    // hoặc "23 ………") → mỗi ô một câu trả lời ngắn
    function thuOTrong(u) {
      var g = st.nhom;
      while (g && g.tu == null) g = g.cha;
      if (!g) return false;
      var s = u.str, re = /(^|[\s(\[“"'‘:;,])(\(?)(\d{1,3})(\)?)(?=\s)/g, m, ds = [];
      while ((m = re.exec(s))) {
        var n = +m[3];
        if (n < g.tu || n > g.den || g.daCo[String(n)] || ds.some(function (d) { return d.n === n; })) continue;
        var batDau = m.index + m[1].length, p = m.index + m[0].length;
        while (p < s.length && /\s/.test(s[p])) p++;
        var b = p;
        while (b < s.length) {
          if (/\s/.test(s[b])) { b++; continue; }
          var f = kieuTai(u, b).f;
          if (f.hl || f.red || f.u) { b++; continue; }
          break;
        }
        var e = b;
        while (e > p && /\s/.test(s[e - 1])) e--;
        var dapAn = s.slice(p, e).replace(/\s+/g, ' ').trim(), cham = /^[._…]{3,}/.exec(s.slice(p));
        if (!dapAn && !cham) continue;
        ds.push({ n: n, tu: batDau, den: dapAn ? e : p + cham[0].length, dapAn: dapAn });
        re.lastIndex = dapAn ? e : p + cham[0].length;
      }
      if (!ds.length) return false;
      dongCau();
      var toks = [], tu = 0;
      ds.forEach(function (d) {
        toks = toks.concat(cat(u.toks, tu, d.tu));
        toks.push({ t: 'text', s: '(' + d.n + ') ______', f: { b: true } });
        tu = d.den;
      });
      var dong = taoDong(toks.concat(cat(u.toks, tu)), u.para, u.jc);
      themVaoNhom(st.nhom, dong);
      ds.forEach(function (d) {
        var q = taoQ(String(d.n), st.nhom);
        q.oTrong = true;
        q.items.push({ vai: 'stem', u: cauChua(dong, '(' + d.n + ') ______') });
        if (d.dapAn) q.dapAn = { s: d.dapAn, line: taoDong([{ t: 'text', s: d.dapAn, f: {} }], u.para, '') };
        for (var x = st.nhom; x; x = x.cha) { x.soCau++; x.daCo[q.no] = 1; }
        B.cau.push(q);
      });
      return true;
    }
    // câu (sentence) chứa ô trống — dòng dài thì chỉ lấy câu đó làm nội dung
    function cauChua(dong, moc) {
      var s = dong.str, i = s.indexOf(moc);
      if (s.length <= 200 || i < 0) return dong;
      var a = 0, b = s.length, re = /[.!?](?=\s+\S)/g, m;
      while ((m = re.exec(s))) { if (m.index < i) a = m.index + 1; else if (m.index >= i + moc.length) { b = m.index + 1; break; } }
      return boTrangDau(catDong(dong, a, b));
    }

    /* ---- câu hỏi ---- */
    function moCau(u, cau, con) {
      dongCau();
      if (!con) nhomChoCau(cau.no);
      Q = taoQ(cau.no, st.nhom);
      Q.stim = st.stim;
      Q.viDu = cau.no === '0'; // câu ví dụ (số 0) của đề tiếng Anh — không xuất
      if (st.stim) { st.stim.soCau++; st.stimThu = false; }
      if (!Q.viDu) { danhDauNhom(Q.no); if (/^\d+$/.test(cau.no)) st.soCuoi = +cau.no; }
      var s = u.str, p = cau.cuoi, ngan = cau.ngan;
      for (;;) { // điểm, mức độ, thẻ loại — thứ tự bất kỳ
        var w = /^\s*/.exec(s.slice(p))[0].length, sau = s.slice(p + w), m;
        if ((m = /^\(([^()]{1,30})\)/.exec(sau))) {
          var d = core.parsePoints(m[1]);
          if (d != null && d > 0) { Q.diem = d; p += w + m[0].length; continue; }
          var ma0 = gap(m[1]).trim().replace(/\s+/g, ' '); // "(NB)", "(TN)" viết trong ngoặc tròn
          if (hasOwn(MUC_DO, ma0)) { Q.muc = MUC_DO[ma0]; p += w + m[0].length; continue; }
          if (hasOwn(THE_LOAI, ma0)) { Q.the = THE_LOAI[ma0]; p += w + m[0].length; continue; }
          break;
        }
        if ((m = /^\[(?!\[)([^\[\]]{1,30})\]/.exec(sau))) {
          var ma = gap(m[1]).trim().replace(/\s+/g, ' ');
          if (hasOwn(MUC_DO, ma)) { Q.muc = MUC_DO[ma]; p += w + m[0].length; continue; }
          if (hasOwn(THE_LOAI, ma)) { Q.the = THE_LOAI[ma]; p += w + m[0].length; continue; }
          var up = /^(tf|oc|mc|fb|sdl|es|em)\s*(?:-\s*(nb|h|th|vd|vdc))?$/.exec(ma);
          if (up) {
            Q.upload = up[1]; Q.the = MA_UPLOAD[up[1]];
            if (up[2]) Q.muc = up[2] === 'h' ? 'TH' : up[2].toUpperCase();
            p += w + m[0].length; continue;
          }
          var d2 = core.parsePoints(m[1]);
          if (d2 != null && d2 > 0) { Q.diem = d2; p += w + m[0].length; continue; }
          break;
        }
        if (!ngan && (m = /^[.:\-–—]/.exec(sau))) { p += w + m[0].length; ngan = true; continue; }
        break;
      }
      var phan = cat(u.toks, 0, cau.dau).concat(cat(u.toks, p));
      var dong = taoDong(phan, u.para, u.jc);
      // "(1 điểm)" ở cuối dòng tiêu đề câu
      if (Q.diem == null) {
        var mm = /\(\s*(\d+(?:[.,]\d+)?)\s*(?:điểm|diem|đ)\s*\)\s*$/i.exec(dong.str);
        if (mm) { Q.diem = core.parsePoints(mm[1]); dong = catDong(dong, 0, mm.index); }
      }
      if (Q.the === 'em') { // câu chùm: nội dung chung thành đoạn dẫn của các câu con
        var g = taoNhom(null, null, st.nhom);
        g.em = true;
        if (!dongRong(dong)) g.units.push(boTrangDau(dong));
        st.nhom = g; st.em = { no: Q.no, dem: 0, muc: Q.muc };
        Q = null;
        return;
      }
      if (dongRong(dong)) return;
      var d0 = boTrangDau(dong), n0 = nhanDau(d0, RE_NHAN_PA), k;
      // phương án nằm ngay trên dòng số câu: "1. A. waited⇥B. needed⇥C. stopped" / "31. Câu hỏi⇥A. Yes⇥B. No"
      if (n0 && n0.chu === 'A' && !/:/.test(d0.str.slice(n0.viTriChu, n0.cuoi)) && nhanCungDong(d0, n0).length >= 2) { themPA(d0, n0); return; }
      if ((k = viTriPATrongDong(d0)) > 0) {
        Q.items.push({ vai: 'stem', u: catDong(d0, 0, k) });
        var d1 = catDong(d0, k), n1 = nhanDau(d1, RE_NHAN_PA);
        if (n1) { themPA(d1, n1); return; }
        Q.items.push({ vai: 'stem', u: d1 });
        return;
      }
      Q.items.push({ vai: 'stem', u: d0 });
    }
    function moCauCon(u, m) { // "[TF]: …" trong câu chùm [EM]
      var em = st.em;
      moCau(u, { no: em.no + '.' + (++em.dem), dau: m[1].length, cuoi: m[0].length, ngan: true }, true);
      Q.upload = m[2]; Q.the = MA_UPLOAD[m[2]];
      if (!Q.muc) Q.muc = em.muc;
      st.em = em;
    }

    function themTiep(u) { // dòng/bảng tiếp nối: thuộc phương án/ý đang mở, hoặc nội dung câu
      if (Q.mo) Q.mo.units.push(u);
      else Q.items.push({ vai: 'stem', u: u });
    }

    function ghiDapAn(line, cuoi) {
      var phan = catDong(line, cuoi), v = chuThuan(phan.toks).replace(/\s+/g, ' ').trim();
      if (Q.dinhMo) { Q.oDinh[Q.dinhMo].dapAn = v; return; }
      if (v && /^[._…\-–—\s]+$/.test(v)) { themTiep(line); return; } // "Answer: ________" là chỗ để học sinh viết
      var khongPA = !Q.opts.length && !Q.stmts.length;
      var tuLuan = Q.the === 'essay' || (!Q.the && Q.phan && Q.phan.loai === 'essay');
      if ((khongPA || tuLuan) && (!v || tuLuan || v.length > 80)) { Q.fbMode = true; if (!dongRong(phan)) Q.fb.push(boTrangDau(phan)); return; }
      if (Q.dapAn) { Q.dapAnKhac.push(v); return; }
      Q.dapAn = { s: v, line: boTrangDau(phan) };
    }

    function dsPA() { return Q.dinhMo ? Q.oDinh[Q.dinhMo].opts : Q.opts; }
    function themPA(line, dau) {
      var ds = nhanCungDong(line, dau), dich = dsPA();
      ds.forEach(function (n, i) {
        var den = i + 1 < ds.length ? ds[i + 1].dau : line.str.length;
        var o = {
          nhan: n.chu, goc: n.chu, sao: n.sao, auto: n.auto, fNhan: n.f,
          nhanToks: cat(line.toks, n.dau, n.cuoi), units: [catDong(line, n.cuoi, den)]
        };
        dich.push(o);
        if (!Q.dinhMo) Q.items.push({ vai: 'opt', i: Q.opts.length - 1 });
        Q.mo = o;
      });
    }
    function themY(line, n) {
      var o = { nhan: n.chu, goc: n.chu, sao: n.sao, auto: n.auto, fNhan: n.f, nhanToks: cat(line.toks, n.dau, n.cuoi), units: [catDong(line, n.cuoi)] };
      Q.stmts.push(o);
      Q.items.push({ vai: 'stmt', i: Q.stmts.length - 1 });
      Q.mo = o;
    }
    function nhanPA(n) {
      var ds = dsPA();
      if (!ds.length) return n.chu === 'A' || n.auto;
      var cuoi = ds[ds.length - 1];
      return n.chu === chuKe(cuoi.nhan) || (n.auto && cuoi.auto && n.chu > cuoi.nhan);
    }
    function nhanY(n) {
      if (Q.opts.length || Q.dinhMo) return false;
      if (!Q.stmts.length) return n.chu === 'a' || n.auto;
      var cuoi = Q.stmts[Q.stmts.length - 1];
      return n.chu === chuKe(cuoi.nhan) || (n.auto && cuoi.auto && n.chu > cuoi.nhan);
    }
    function nhanHopLe(u) { // dòng mở đầu bằng nhãn phương án/ý đúng thứ tự của câu đang mở
      if (!Q) return false;
      var n = nhanDau(u, RE_NHAN_PA);
      if (n && nhanPA(n)) return true;
      var y = nhanDau(u, RE_NHAN_Y);
      return !!(y && nhanY(y));
    }

    // "Tìm lỗi sai": câu có các đoạn gạch chân + dòng "A   B   C   D" ngay dưới → phương án là các đoạn gạch chân
    function thuLoiSai(u) {
      var chu = u.str.match(/[A-E]/g), dong = null;
      for (var i = Q.items.length - 1; i >= 0; i--) if (Q.items[i].vai === 'stem' && Q.items[i].u.k === 'line') { dong = Q.items[i].u; break; }
      if (!dong) return false;
      var doan = [], cur = null;
      dong.toks.forEach(function (t) {
        var u2 = t.t === 'text' && t.f && t.f.u && /\S/.test(t.s);
        if (u2) { if (!cur) { cur = []; doan.push(cur); } cur.push(t); }
        else if (!(t.t === 'text' && t.f && t.f.u)) cur = null;
      });
      if (doan.length !== chu.length) return false;
      doan.forEach(function (ts, i) {
        var sach = ts.map(function (t) { var f = {}; for (var k in t.f) if (hasOwn(t.f, k) && k !== 'u') f[k] = t.f[k]; return { t: 'text', s: t.s, f: f }; });
        Q.opts.push({ nhan: chu[i], goc: chu[i], sao: false, auto: false, fNhan: {}, nhanToks: [{ t: 'text', s: chu[i] + '. ', f: {} }], units: [boTrangDau(taoDong(sach, u.para, ''))], tuNhom: true });
        Q.items.push({ vai: 'opt', i: Q.opts.length - 1 });
      });
      Q.mo = null;
      return true;
    }

    function xuLyDong(u) {
      if (u.k === 'tbl') {
        if (Q.fbMode) { Q.fb.push(u); return; }
        if (thuBangPA(u)) return;
        themTiep(u);
        return;
      }
      if (dongRong(u)) return;
      var g = gap(u.str), m;
      if (Q.fbMode) {
        if ((m = RE_DAP_AN.exec(g)) && !Q.dapAn && (Q.opts.length || Q.stmts.length)) { ghiDapAn(u, m[0].length); return; }
        Q.fb.push(u);
        return;
      }
      if (Q.upload && (Q.the === 'blanks' || Q.the === 'dropdowns') && (m = RE_DINH_O.exec(u.str))) {
        Q.oDinh = Q.oDinh || {}; Q.dinhMo = m[1]; Q.oDinh[m[1]] = { opts: [], dapAn: null }; Q.mo = null;
        return;
      }
      if ((m = RE_LOI_GIAI.exec(g))) {
        Q.fbMode = true; Q.mo = null;
        var r = catDong(u, m[0].length);
        if (!dongRong(r)) Q.fb.push(boTrangDau(r));
        return;
      }
      if ((m = RE_DAP_AN.exec(g))) { ghiDapAn(u, m[0].length); return; }
      if (Q.opts.length || Q.stmts.length) {
        // "Chọn B." đứng riêng một dòng, hoặc "Đáp án B" / "Đáp án đúng là A, C" (không có dấu hai chấm)
        var gTrim = u.str.replace(/[\s.]+$/, '');
        if (/^[\s\uFFFC]*chon\s+(?:dap\s+an\s+|phuong\s+an\s+)?[a-h]\s*\.?\s*$/.test(g) && /[A-H]$/.test(gTrim)) { ghiDapAn(u, /^[\s\uFFFC]*/.exec(u.str)[0].length); return; }
        if ((m = /^[\s\uFFFC]*dap\s*an(?:\s+dung)?(?:\s+la)?\s+(?=\S)/.exec(g)) &&
            /^(?:[A-H](?:\s*(?:,|;|&|và|va)?\s*[A-H])*|[ĐđSsTF][ĐđSsTF\s,;\-]*)\.?$/.test(gTrim.slice(m[0].length).trim())) { ghiDapAn(u, m[0].length); return; }
      }
      if ((m = RE_NHIEU.exec(g))) {
        Q.nhieu = Q.nhieu.concat(tachCachViet(chuThuan(catDong(u, m[0].length).toks)));
        return;
      }
      if (RE_MUI_TEN_MANH.test(u.str) || (Q.the === 'matching' && RE_MUI_TEN.test(u.str))) {
        Q.items.push({ vai: 'pair', u: u, manh: true }); Q.mo = null; return;
      }
      if (!Q.opts.length && !Q.stmts.length && /^[\s\uFFFC]*A(?:\s+B)(?:\s+C)?(?:\s+D)?(?:\s+E)?\s*$/.test(u.str) && thuLoiSai(u)) return;
      var n = nhanDau(u, RE_NHAN_PA);
      if (n && nhanPA(n)) { themPA(u, n); return; }
      var y = nhanDau(u, RE_NHAN_Y);
      if (y && nhanY(y)) { themY(u, y); return; }
      if (RE_MUI_TEN.test(u.str) && !Q.opts.length && !Q.stmts.length) { Q.items.push({ vai: 'pair', u: u, manh: false }); Q.mo = null; return; }
      themTiep(u);
    }

    // bảng chứa phương án (mỗi ô một phương án có nhãn) → đưa từng ô qua xuLyDong theo thứ tự nhãn
    function thuBangPA(u) {
      var cells = [];
      u.tbl.rows.forEach(function (r) { r.forEach(function (c) { if (!c.boQua) cells.push(donViCuaO(c, mt)); }); });
      // ô chỉ có nhãn ("A.") + ô nội dung kế bên → gộp
      var gop = [];
      for (var i = 0; i < cells.length; i++) {
        var d = cells[i].filter(function (x) { return !dongRong(x); });
        var dau = d[0];
        if (dau && dau.k === 'line' && /^\s*\*?\s*[A-Ha-h]\s*[.):]?\s*$/.test(dau.str) && cells[i + 1]) {
          var sau = cells[i + 1].filter(function (x) { return !dongRong(x); });
          if (sau.length && sau[0].k === 'line' && !nhanDau(sau[0], RE_NHAN_PA) && !nhanDau(sau[0], RE_NHAN_Y)) {
            var noi = taoDong(dau.toks.concat([{ t: 'tab' }], sau[0].toks), dau.para, dau.jc);
            gop.push([noi].concat(sau.slice(1)));
            i++;
            continue;
          }
        }
        gop.push(d);
      }
      gop = gop.filter(function (d) { return d.length; });
      if (gop.length < 2) return false;
      var nhan = gop.map(function (d) {
        if (d[0].k !== 'line') return null;
        return nhanDau(d[0], RE_NHAN_PA) || nhanDau(d[0], RE_NHAN_Y);
      });
      if (nhan.some(function (n) { return !n; })) return false;
      var thuTu = gop.map(function (d, i) { return { d: d, n: nhan[i] }; });
      thuTu.sort(function (a, b) {
        var ha = a.n.chu === a.n.chu.toUpperCase(), hb = b.n.chu === b.n.chu.toUpperCase();
        return ha !== hb ? (ha ? -1 : 1) : (a.n.chu < b.n.chu ? -1 : a.n.chu > b.n.chu ? 1 : 0);
      });
      var dau0 = thuTu[0].n;
      var hop = dau0.chu === dau0.chu.toUpperCase() ? nhanPA(dau0) : nhanY(dau0);
      if (!hop) return false;
      thuTu.forEach(function (x) { x.d.forEach(function (dv) { xuLyDong(dv); }); });
      Q.mo = null;
      return true;
    }

    /* ---- bảng chứa câu hỏi (đề tiểu học/tiếng Anh dàn trong bảng) → các dòng ---- */
    function dauCauO(units0) { // dòng đầu (không rỗng) của ô có phải mở đầu câu hỏi
      var d = units0.filter(function (x) { return x.k === 'tbl' || !dongRong(x); })[0];
      if (!d || d.k !== 'line') return false;
      return cheDo === 'cau' ? !!laCau(d, gap(d.str)) : !!laSo(d);
    }
    function bangCoCau(tbl, sau) {
      if (sau > 4) return null;
      var coCau = false, coLong = false, soO = 0;
      tbl.rows.forEach(function (r) {
        var o = r.filter(function (c) { return !c.boQua; });
        soO += o.length;
        var dv0 = o.length ? donViCuaO(o[0], mt) : [];
        var o1 = o.filter(function (c) { return donViCuaO(c, mt).some(function (x) { return x.k === 'tbl' || !dongRong(x); }); })[0];
        if (o1 && dauCauO(donViCuaO(o1, mt))) coCau = true;
        else if (dv0.length && dauCauO(dv0)) coCau = true;
        o.forEach(function (c) { donViCuaO(c, mt).forEach(function (x) { if (x.k === 'tbl' && bangCoCau(x.tbl, sau + 1)) coLong = true; }); });
      });
      return coCau ? 'cau' : coLong ? 'boc' : null;
    }
    function traiBang(tbl) {
      var loai = bangCoCau(tbl, 0);
      if (!loai) return null;
      var out = [];
      tbl.rows.forEach(function (r) {
        var o = r.filter(function (c) { return !c.boQua; }).map(function (c) {
          return donViCuaO(c, mt).filter(function (x) { return x.k === 'tbl' || !dongRong(x); });
        }).filter(function (x) { return x.length; });
        if (loai === 'boc') { o.forEach(function (x) { out = out.concat(x); }); return; }
        // mỗi hàng → một dòng: dòng đầu của các ô nối bằng tab; dòng/bảng còn lại của ô xếp sau
        var dau = [], sau = [];
        o.forEach(function (x) {
          if (x[0].k === 'line') { dau.push(x[0]); sau = sau.concat(x.slice(1)); }
          else sau = sau.concat(x);
        });
        if (dau.length) {
          var toks = [];
          dau.forEach(function (d, i) { if (i) toks.push({ t: 'tab' }); toks = toks.concat(d.toks); });
          out.push(taoDong(toks, dau[0].para, dau[0].jc));
        }
        out = out.concat(sau);
      });
      return out;
    }

    /* ---- bảng đáp án ---- */
    function themKey(no, v) {
      var e = { phan: st.keyPhan, no: no, v: String(v).replace(RE_SO_KEY_G, '').trim(), bang: !!st.trongBang };
      B.key.push(e);
      return e;
    }
    function themKeyChu(s) {
      var ds = tachCapKey(s), e = null;
      ds.forEach(function (x) { e = themKey(x.no, x.v); });
      return { n: ds.length, cuoi: e };
    }
    function laSoCau(t) { var m = /^(?:c[âa]u\s*)?(\d{1,3})\s*[.:]?$/i.exec(t.trim()); return m ? String(+m[1]) : null; }
    var RE_TD_SO = /^(cau|cau hoi|stt|so cau|so thu tu|item|items|no|q|question|questions|number)\s*[.:]?$/;
    var RE_TD_DA = /^(d\/a|da|d\.a|dap an|dap an dung|ket qua|tra loi|answers?|keys?|correct answers?)\s*[.:]?$/;
    function docKeyBang(tbl) {
      st.trongBang = true;
      try { docKeyBang1(tbl); } finally { st.trongBang = false; }
    }
    function docKeyBang1(tbl) {
      st.keyDong = null;
      var rows = tbl.rows.map(function (r) {
        return r.filter(function (c) { return !c.boQua; }).map(function (c) {
          var dv = donViCuaO(c, mt);
          return { col: c.col, span: c.span, text: dv.map(function (x) { return x.k === 'line' ? chuThuan(x.toks) : ''; }).join(' ').replace(/\s+/g, ' ').trim() };
        });
      });
      rows.forEach(function (r) { r.forEach(function (c) { if (RE_TIEU_DE_DA.test(gap(c.text))) B.tieuDeDA = true; }); });
      if (st.keyCho != null && rows.length === 1) { // "Câu 1." + bảng một hàng các ký tự của đáp án
        themKey(st.keyCho, rows[0].map(function (c) { return c.text; }).join(''));
        st.keyCho = null;
        return;
      }
      st.keyCho = null;
      var map = null, vaiCot = null;
      var xa = function () {
        if (map) map.forEach(function (mp) { if (mp.v.length) themKey(mp.no, mp.v.join('; ')); });
        map = null;
      };
      rows.forEach(function (cells) {
        var ne = cells.filter(function (c) { return c.text; });
        if (!ne.length) return;
        // hàng tiêu đề "Item | Key | Item | Key" / "Câu | Đáp án | Câu | Đáp án" → cột số câu / cột đáp án theo cặp
        var vai = ne.map(function (c) { var t = gap(c.text).replace(/\s+/g, ' '); return RE_TD_SO.test(t) ? 'so' : RE_TD_DA.test(t) ? 'da' : ''; });
        if (ne.length >= 2 && vai.every(Boolean) && vai.indexOf('so') >= 0 && vai.indexOf('da') >= 0) {
          xa();
          vaiCot = []; B.tieuDeDA = true;
          ne.forEach(function (c, i) { if (vai[i] === 'so' && vai[i + 1] === 'da') vaiCot.push({ so: c, da: ne[i + 1] }); });
          return;
        }
        if (vaiCot) {
          var trongCot = function (o) { return cells.filter(function (c) { return c.text && c.col < o.col + o.span && c.col + c.span > o.col; }).map(function (c) { return c.text; }).join(' '); };
          var n = 0;
          vaiCot.forEach(function (vc) {
            var so = laSoCau(trongCot(vc.so)), v = trongCot(vc.da);
            if (so != null && v) { themKey(so, v); n++; }
          });
          if (n) return;
          vaiCot = null;
        }
        var g0 = gap(ne[0].text).replace(/\s+/g, ' ');
        var tdSo = RE_TD_SO.test(g0);
        var tdDA = RE_TD_DA.test(g0);
        if (tdDA) B.tieuDeDA = true;
        var conLai = (tdSo || tdDA) ? ne.slice(1) : ne;
        var so = conLai.map(function (c) { return laSoCau(c.text); });
        var toanSo = conLai.length > 0 && so.every(function (x) { return x != null; });
        var tang = toanSo && so.every(function (x, i) { return !i || +x > +so[i - 1]; });
        var chuaCoGiaTri = map && map.every(function (mp) { return !mp.v.length; });
        if (map && (chuaCoGiaTri || tdDA) && !tdSo) {
          map.forEach(function (mp) {
            var t = cells.filter(function (c) { return c.text && c.col < mp.c1 && c.col + c.span > mp.c0 && !(tdDA && c === ne[0]); })
              .map(function (c) { return c.text; }).join(' ');
            if (t) mp.v.push(t);
          });
          return;
        }
        if ((tdSo || tang) && toanSo) {
          xa();
          map = conLai.map(function (c, i) { return { no: so[i], c0: c.col, c1: c.col + c.span, v: [] }; });
          return;
        }
        if (map) {
          map.forEach(function (mp) {
            var t = cells.filter(function (c) { return c.text && c.col < mp.c1 && c.col + c.span > mp.c0; }).map(function (c) { return c.text; }).join(' ');
            if (t) mp.v.push(t);
          });
          return;
        }
        // hàng kiểu "1 | A | 2 | B"
        for (var i = 0; i < ne.length; i++) {
          var a = laSoCau(ne[i].text), b = ne[i + 1];
          if (a != null && b && laSoCau(b.text) == null) { themKey(a, b.text); i++; }
          else if (a == null) themKeyChu(ne[i].text);
        }
      });
      xa();
    }
    function xuLyKeyDong(u, g) {
      if (RE_TIEU_DE_DA.test(g) && u.str.length <= 80) B.tieuDeDA = true;
      var ph =laPhanBatKy(u, g) || (chiKey && laTieuDeChung(u));
      if (ph) {
        if (ph.key && (chiKey || B.phan.some(function (p) { return p.key === ph.key; }))) { st.keyPhan = ph.key; st.keyCho = null; st.keyDong = null; return true; }
        if (chiKey) { st.keyDong = null; return true; }
        st.mode = ''; return false;
      }
      if (RE_DOAN_DAN.test(g) || RE_HET_DOAN_DAN.test(g) || RE_DIEM_MD.test(g)) { if (chiKey) return true; st.mode = ''; return false; }
      if (RE_HET.test(g)) return true;
      if (chiKey && phamVi(g) && !laCau(u, g)) { st.keyDong = null; return true; } // "Câu 36 - 40:"
      var cau = laCau(u, g);
      if (cau) {
        var v = chuThuan(cat(u.toks, cau.cuoi)).replace(/\s+/g, ' ').trim();
        if (v.length <= 40 || chiKey) {
          if (v) { var e = themKey(cau.no, v); st.keyDong = v.length > 40 ? e : null; }
          else { st.keyCho = cau.no; st.keyDong = null; }
          return true;
        }
        st.mode = ''; return false;
      }
      st.keyCho = null;
      var chu = chuThuan(u.toks).replace(/\s+/g, ' ').trim();
      var kq = themKeyChu(chu);
      if (RE_TIEU_DE_DA.test(gap(chu)) && chu.length <= 80) B.tieuDeDA = true;
      if (kq.n) { st.keyDong = kq.n === 1 && kq.cuoi && kq.cuoi.v.length > 40 ? kq.cuoi : null; return true; }
      if (chiKey) {
        // dòng nối tiếp của đáp án dài (hướng dẫn chấm tự luận) — chỉ nối vào đáp án viết trên dòng ngay trước
        if (st.keyDong) st.keyDong.v += '\n' + chu;
        return true;
      }
      B.warnings.push(core.newIssue('info', 'Dòng trong BẢNG ĐÁP ÁN không đọc được: "' + rutGon(chu) + '"'));
      return true;
    }

    /* ---- vòng chính ---- */
    for (var ui = 0; ui < units.length; ui++) {
      var u = units[ui];
      if (u.k === 'tbl') {
        if (!B) continue;
        if (st.mode === 'key') { docKeyBang(u.tbl); continue; }
        var trai = traiBang(u.tbl);
        if (trai) { Array.prototype.splice.apply(units, [ui, 1].concat(trai)); ui--; continue; }
        if (Q) { xuLyDong(u); continue; }
        themKhongCau(u);
        continue;
      }
      if (dongRong(u)) continue;
      var g = gap(u.str), m;
      if ((m = RE_NGAN_HANG.exec(g)) && !chiKey) {
        var ten = chuThuan(cat(u.toks, m[0].length)).replace(/\s+/g, ' ').trim();
        moBank(ten || tenFile);
        if (!ten) B.warnings.push(core.newIssue('warn', 'Dòng "NGÂN HÀNG:" chưa có tên — dùng tên file "' + tenFile + '"'));
        continue;
      }
      if (!B) continue; // phần hướng dẫn trước dòng NGÂN HÀNG đầu tiên
      if (st.mode === 'key' && xuLyKeyDong(u, g)) continue;
      if ((m = RE_BANG_DA.exec(g)) || (RE_MUC_DA.test(g) && u.str === u.str.toUpperCase() && /\p{Lu}/u.test(u.str) && (!Q || Q.opts.length || Q.stmts.length))) {
        dongCau(); dongStim(); dongHetNhom();
        st.mode = 'key'; st.keyPhan = ''; st.keyCho = null; st.keyDong = null;
        var conLai = m ? chuThuan(cat(u.toks, m[0].length)).trim() : '';
        if (conLai) themKeyChu(conLai);
        continue;
      }
      if (RE_HET_DOAN_DAN.test(g)) { dongCau(); dongStim(); continue; }
      if ((m = RE_DOAN_DAN.exec(g))) {
        dongCau(); dongStim();
        st.stim = { units: [], soCau: 0 }; st.stimThu = true;
        var r = catDong(u, m[0].length);
        if (!dongRong(r)) st.stim.units.push(boTrangDau(r));
        continue;
      }
      var ph = laPhanBatKy(u, g);
      if (ph) { dongCau(); dongStim(); dongHetNhom(); st.phan = ph; B.phan.push(ph); st.soCuoi = -1; continue; }
      if ((m = RE_DIEM_MD.exec(g))) {
        dongCau();
        var vd = core.parsePoints(chuThuan(cat(u.toks, m[0].length)).trim());
        if (vd != null && vd > 0) st.diemMD = vd;
        else B.warnings.push(core.newIssue('warn', 'Không đọc được ĐIỂM MẶC ĐỊNH: "' + rutGon(u.str) + '" — giữ ' + st.diemMD));
        continue;
      }
      if (RE_HET.test(g)) { dongCau(); dongHetNhom(); continue; }
      if (st.em && (m = RE_CAU_CON.exec(g))) { moCauCon(u, m); continue; }
      var trongGiai = !!(Q && Q.fbMode);
      var cau = null, cd = null;
      if (cheDo === 'cau') {
        cau = laCau(u, g);
        if (!cau && !trongGiai) cd = laChiDan(u, g, false);
      } else {
        if (!trongGiai) cd = laChiDan(u, g, true);
        if (!cd) {
          cau = laSo(u);
          // số nhỏ hơn câu trước (không có tiêu đề/lời dặn xen giữa) là danh sách đánh số trong nội dung câu
          // (trừ "1." ngay sau một câu đã đủ phương án/ý: phần mới đánh số lại)
          if (cau && cau.no !== '0' && st.soCuoi >= 0 && +cau.no <= st.soCuoi && !(cau.no === '1' && (!Q || Q.opts.length >= 2 || Q.stmts.length >= 2))) cau = null;
        }
      }
      if (cd) { dongCau(); moNhom(u, cd); continue; }
      if (cau) { moCau(u, cau); continue; }
      var td = laTieuDeChung(u);
      if (td && !trongGiai && !nhanHopLe(u) && (cheDo === 'so' || (Q && (Q.opts.length || Q.stmts.length)))) {
        dongCau(); dongStim(); dongHetNhom(); st.phan = td; B.phan.push(td); st.soCuoi = -1;
        continue;
      }
      if (!Q && st.nhom && thuOTrong(u)) continue;
      if (!Q) { themKhongCau(u); continue; }
      xuLyDong(u);
    }
    dongCau(); dongHetNhom(); dongStim();
    return banks;
  }

  function rutGon(s, n) {
    s = String(s || '').replace(/\uFFFC/g, '').replace(/\s+/g, ' ').trim();
    n = n || 60;
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* ======================= dựng câu hỏi ======================= */

  function tiLeKieu(units) {
    var n = 0, d = { u: 0, red: 0, hl: 0 };
    units.forEach(function (un) {
      if (un.k !== 'line') return;
      un.toks.forEach(function (t) {
        var k = 0;
        if (t.t === 'text') k = t.s.replace(/\s/g, '').length;
        else if (t.t === 'math') k = Math.max(1, (t.text || '').replace(/\s/g, '').length);
        if (!k) return;
        n += k;
        var f = t.f || {};
        if (f.u) d.u += k;
        if (f.red) d.red += k;
        if (f.hl) d.hl += k;
      });
    });
    return { n: n, u: n ? d.u / n : 0, red: n ? d.red / n : 0, hl: n ? d.hl / n : 0 };
  }

  // đánh dấu đáp án bằng định dạng: nhãn (chữ cái) hoặc ≥ 80% chữ của phương án
  // nen: định dạng của phần nội dung câu (tf: mọi ý đều Đúng là hợp lệ → chỉ bỏ qua khi cả nội dung câu cũng mang định dạng đó)
  function danhDau(ds, nen) {
    ds.forEach(function (o) {
      var tl = tiLeKieu(o.units), f = o.fNhan || {};
      o.dd = {};
      ['u', 'red', 'hl'].forEach(function (k) { o.dd[k] = !!f[k] || (tl.n > 0 && tl[k] >= 0.8); });
      o.caU = tl.n > 0 && tl.u >= 0.8;
    });
    var boQua = {};
    if (ds.length >= 2) {
      ['u', 'red', 'hl'].forEach(function (k) {
        if (ds.every(function (o) { return o.dd[k]; }) && (!nen || (nen.n > 0 && nen[k] >= 0.8))) boQua[k] = true;
      });
    }
    ds.forEach(function (o) {
      o.danhDau = o.sao || ['u', 'red', 'hl'].some(function (k) { return o.dd[k] && !boQua[k]; });
      o.boU = o.caU && o.dd.u && !boQua.u;
      if (o.tuNhom) { o.danhDau = !!o.sao; o.boU = false; } // lựa chọn dựng từ danh sách chung của nhóm / đoạn gạch chân: không mang dấu đáp án
    });
    return boQua;
  }

  // "… [FALSE]" / "… [C]" cuối dòng, chữ trong ngoặc tô màu/gạch chân → đáp án (đề IELTS bôi vàng đáp án); bỏ khỏi nội dung
  function layDapAnNgoac(q) {
    for (var i = q.items.length - 1; i >= 0; i--) {
      var it = q.items[i];
      if (it.vai !== 'stem' || it.u.k !== 'line') continue;
      var s = it.u.str, re = /[\[(]([^\[\]()]{1,40})[\])]/g, m, chon = null;
      while ((m = re.exec(s))) chon = m;
      if (!chon || /[^\s.]/.test(s.slice(chon.index + chon[0].length))) continue;
      var a = chon.index + 1, b = a + chon[1].length, n = 0, d = 0;
      for (var k = a; k < b; k++) {
        if (/\s/.test(s[k])) continue;
        n++;
        var f = kieuTai(it.u, k).f;
        if (f.hl || f.red || f.u) d++;
      }
      if (!n || d / n < 0.8) continue;
      it.u = catDong(it.u, 0, chon.index);
      return chon[1].replace(/\s+/g, ' ').trim();
    }
    return null;
  }

  // câu không có phương án riêng trong nhóm có danh sách lựa chọn chung → câu trắc nghiệm dùng danh sách đó:
  // nhãn A–F của nhóm ("A⇥Plomin"), bộ TRUE/FALSE/NOT GIVEN, hoặc chữ cái đoạn văn "A–G" (khi đáp án là chữ cái)
  function ganPANhom(q) {
    var g = q.nhom;
    if (!g || q.oTrong || q.items.some(function (it) { return it.vai === 'pair' || (it.vai === 'stem' && it.u.k === 'line' && /\[\[[^\]]*\]\]/.test(it.u.str)); })) return;
    var v = q.dapAn ? q.dapAn.s : q.keyVal, chu = v != null ? tachChuCai(v) : null;
    var pa = g.pa.slice().sort(theoNhan);
    if (pa.length >= 2 && pa.length <= 8 && (v == null || (chu && chu.every(function (c) { return pa.some(function (p) { return p.nhan === c; }); })))) {
      q.opts = pa.map(function (o) { return saoPA(o, true); });
      return;
    }
    if (g.tap && g.tap.length >= 2) {
      var k = v != null ? g.tap.indexOf(String(v).replace(/\s+/g, ' ').trim().toUpperCase()) : -1;
      if (v == null || k >= 0) {
        q.opts = g.tap.map(function (w, i) { return paChu(String.fromCharCode(65 + i), w); });
        if (k >= 0) {
          var nhan = String.fromCharCode(65 + k);
          if (q.dapAn) q.dapAn = { s: nhan, line: q.dapAn.line }; else q.keyVal = nhan;
        }
        return;
      }
    }
    // chữ cái đoạn văn "A–G": câu chưa có đáp án cũng dùng (đáp án điền sau từ file đáp án)
    if (g.chuCai && (v == null || (chu && String(v).trim().length <= 3 && chu.every(function (c) { return g.chuCai.indexOf(c) >= 0; })))) {
      q.opts = g.chuCai.map(function (c) { return paChu(c, c); });
    }
  }

  function cungTap(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }); }

  function dungCau(q, idx, trungSo, ctx, dsAnh, mt) {
    var id = 'q' + pad(idx + 1, 2);
    var ten = 'Câu ' + q.no + (trungSo && q.phan && q.phan.so ? ' (Phần ' + q.phan.so + ')' : '');
    var issues = [], daBao = {};
    function bao(level, msg) {
      var full = ten + ': ' + msg;
      if (daBao[full]) return;
      daBao[full] = 1;
      issues.push(core.newIssue(level, full, id));
    }
    var H = new TaoHtml(ctx, dsAnh, bao);
    var o = { mt: mt };

    // nhãn do Word tự đánh số bắt đầu lệch (E, F, G, H…) → đánh lại A, B, C…
    [['opts', 'A'], ['stmts', 'a']].forEach(function (x) {
      var ds = q[x[0]];
      if (ds.length && ds.every(function (p) { return p.auto; }) && ds[0].nhan !== x[1]) {
        var cu = ds.map(function (p) { return p.nhan; }).join(', ');
        ds.forEach(function (p, i) { p.nhan = String.fromCharCode(x[1].charCodeAt(0) + i); });
        bao('info', 'nhãn do Word tự đánh số (' + cu + ') đã được đánh lại thành ' + ds.map(function (p) { return p.nhan; }).join(', '));
      }
    });

    if (!q.dapAn && !q.opts.length && !q.stmts.length) {
      var ngoac = layDapAnNgoac(q);
      if (ngoac) q.dapAn = { s: ngoac, line: taoDong([{ t: 'text', s: ngoac, f: {} }], 0, '') };
    }
    if (!q.the && !q.opts.length && q.stmts.length < 2) ganPANhom(q);

    var dapAn = q.dapAn ? q.dapAn.s : null;
    // nhãn sai kiểu chữ: câu [ĐS] mà ghi ý bằng "A. B. C. D." → thành ý a) b)…;
    // câu có "a. b. c. d." + "Đáp án: b" (không phải Đ/S) → thành phương án A. B.…
    var keys0 = q.stmts.map(function (s) { return s.nhan; });
    if (q.the === 'tf' && !q.stmts.length && q.opts.length) doiVai(q, 'opts', 'stmts');
    else if (!q.opts.length && q.stmts.length >= 2 && (q.the === 'mc' || q.the === 'ma' ||
      (!q.the && dapAn != null && !docDungSai(dapAn, keys0) && (tachChuCai(dapAn) || []).length &&
        tachChuCai(dapAn).every(function (c) { return keys0.indexOf(c.toLowerCase()) >= 0; })))) doiVai(q, 'stmts', 'opts');
    var opts = q.opts.length >= 2 ? q.opts : [];
    var pairsManh = q.items.filter(function (it) { return it.vai === 'pair' && it.manh; });
    var pairsYeu = q.items.filter(function (it) { return it.vai === 'pair' && !it.manh; });
    var coO = q.items.some(function (it) { return it.vai === 'stem' && it.u.k === 'line' && /\[\[[^\]]*\]\]/.test(it.u.str); });
    var keys = q.stmts.map(function (s) { return s.nhan; });

    var nenStem = tiLeKieu(q.items.filter(function (it) { return it.vai === 'stem'; }).map(function (it) { return it.u; }));
    var boQuaPA = danhDau(q.opts);
    danhDau(q.stmts, nenStem);
    var dsTuDong = dapAn != null ? docDungSai(dapAn, keys) : null;
    var dsKey = q.keyVal != null ? docDungSai(q.keyVal, keys) : null;
    var coTinDS = !!(dsTuDong || dsKey || q.stmts.some(function (s) { return s.danhDau; }));

    var loai = q.the, tuDong = !loai;
    if (!loai) {
      if (opts.length) loai = 'mcma';
      else if (q.stmts.length >= 2 && (coTinDS || (q.phan && q.phan.loai === 'tf'))) loai = 'tf';
      else if (coO) loai = 'blanks'; // có [[*…]] → đổi sang dropdowns ở dưới
      else if (pairsManh.length || (pairsYeu.length >= 2 && dapAn == null)) loai = 'matching';
      else if (dapAn != null || q.keyVal != null) loai = coKhoang(dapAn != null ? dapAn : q.keyVal) ? 'num' : 'short';
      else {
        loai = 'essay';
        if ((q.phan && q.phan.loai === 'short') || q.oTrong) loai = 'short'; // phần "trả lời ngắn" / ô trống đánh số mà thiếu đáp án → báo lỗi thiếu đáp án thay vì đổi thành tự luận
        else if (q.phan && q.phan.loai === 'essay') { /* phần tự luận: đúng ý định, không cần nhắc */ }
        else if (q.stmts.length >= 2) bao('warn', 'có các ý a), b)… nhưng chưa đánh dấu Đúng/Sai — tạm coi là tự luận; nếu là câu Đúng/Sai hãy thêm dòng "Đáp án: ĐSĐS" hoặc thẻ [ĐS]');
        else bao('info', 'chưa có đáp án → tự luận, giáo viên chấm tay');
      }
    }

    var Qo = {
      id: id, no: q.no, title: ten + (q.muc ? ' [' + q.muc + ']' : ''), type: loai,
      points: q.diem != null ? q.diem : q.diemMD, stimulus: '', stem: '',
      feedback: '', meta: { level: q.muc || '', topic: '', part: q.phan ? q.phan.ten : '', tags: [] }, issues: issues
    };

    /* --- mc / ma --- */
    if (loai === 'mcma' || loai === 'mc' || loai === 'ma') {
      var nhanCo = q.opts.map(function (p) { return p.nhan; });
      var anhXa = function (ds) { // chữ cái → nhãn (khớp nhãn hiện tại, rồi nhãn gốc Word)
        if (!ds) return null;
        return ds.map(function (c) {
          if (nhanCo.indexOf(c) >= 0) return c;
          var p = q.opts.filter(function (x) { return x.goc === c; })[0];
          return p ? p.nhan : c;
        });
      };
      var tuDong2 = dapAn != null ? anhXa(tachChuCai(dapAn)) : null;
      var tuDau = q.opts.filter(function (p) { return p.danhDau; }).map(function (p) { return p.nhan; });
      var tuKey = q.keyVal != null ? anhXa(tachChuCai(q.keyVal)) : null;
      var tuChon = null;
      if (dapAn != null && !tuDong2) bao('error', 'không đọc được dòng "Đáp án: ' + rutGon(dapAn, 30) + '" — ghi chữ cái của phương án đúng, ví dụ "Đáp án: B" hoặc "Đáp án: A, C"');
      var chon;
      if (tuDong2) {
        chon = tuDong2;
        if (tuDau.length && !cungTap(tuDau, tuDong2)) bao('warn', 'dòng "Đáp án: ' + tuDong2.join(', ') + '" khác với phương án được đánh dấu (' + tuDau.join(', ') + ') — dùng dòng Đáp án');
      } else if (tuDau.length) chon = tuDau;
      else if (tuKey) chon = tuKey;
      else {
        var fbChu = chuThuan([].concat.apply([], q.fb.filter(function (x) { return x.k === 'line'; }).map(function (x) { return x.toks.concat([{ t: 'text', s: ' ', f: {} }]); })));
        var gf = gap(fbChu), re = /(?:^|[^a-z])chon\s+(?:dap\s+an\s+|phuong\s+an\s+)?([a-h])(?![a-z0-9])/g, mc, cuoi = null;
        while ((mc = re.exec(gf))) { var ch = fbChu[mc.index + mc[0].length - 1]; if (/[A-H]/.test(ch)) cuoi = ch; }
        if (cuoi) { tuChon = anhXa([cuoi]); chon = tuChon; bao('info', 'lấy đáp án ' + cuoi + ' từ "Chọn ' + cuoi + '" trong lời giải'); }
      }
      if (tuKey && (tuDong2 || tuDau.length) && !cungTap(tuKey, chon)) bao('warn', 'bảng đáp án ghi ' + tuKey.join(', ') + ' nhưng trong câu là ' + chon.join(', ') + ' — giữ ' + chon.join(', '));
      chon = chon || [];
      chon.forEach(function (c) { if (nhanCo.indexOf(c) < 0) bao('error', 'đáp án "' + c + '" không có trong các phương án (' + nhanCo.join(', ') + ')'); });
      if (Object.keys(boQuaPA).length && tuDau.length === 0 && !q.opts.some(function (p) { return p.sao; }) && !tuDong2) {
        bao('warn', 'mọi phương án đều được ' + Object.keys(boQuaPA).map(function (k) { return k === 'u' ? 'gạch chân' : k === 'red' ? 'tô đỏ' : 'tô nền'; }).join('/') + ' nên không dùng để xác định đáp án');
      }
      if (loai === 'mcma') loai = chon.length >= 2 ? 'ma' : 'mc';
      Qo.type = loai;
      Qo.choices = q.opts.map(function (p) {
        return { id: p.nhan, html: H.noi(p.units, { mt: mt, boU: p.boU }), correct: chon.indexOf(p.nhan) >= 0 };
      });
    }

    /* --- tf --- */
    if (loai === 'tf') {
      var nguon = null;
      if (dsTuDong) nguon = dsTuDong;
      else if (dapAn != null) bao('error', 'không đọc được dòng "Đáp án: ' + rutGon(dapAn, 30) + '" — ghi dạng "ĐSĐS" hoặc "a) Đ, b) S, c) Đ, d) S"');
      var dau = q.stmts.some(function (s) { return s.danhDau; });
      var tuDau2 = {};
      q.stmts.forEach(function (s) { tuDau2[s.nhan] = s.danhDau; });
      var map = null;
      if (nguon) {
        map = nguon.map;
        if (dau && keys.some(function (k) { return hasOwn(map, k) && map[k] !== tuDau2[k]; })) bao('warn', 'dòng Đáp án khác với các ý được đánh dấu — dùng dòng Đáp án');
      } else if (dau) map = tuDau2;
      else if (dsKey) { map = dsKey.map; nguon = dsKey; }
      if (nguon && nguon.thieu && nguon.thieu.length) bao('error', 'đáp án Đúng/Sai thiếu ý ' + nguon.thieu.map(function (k) { return k + ')'; }).join(', '));
      if (nguon && nguon.thua) bao('warn', 'đáp án Đúng/Sai có nhiều giá trị hơn số ý (' + keys.length + ')');
      Qo.statements = q.stmts.map(function (s) {
        return { key: s.nhan, html: H.noi(s.units, { mt: mt, boU: s.boU }), value: map && hasOwn(map, s.nhan) ? !!map[s.nhan] : undefined };
      });
      if (!map) bao('error', 'chưa xác định ý nào Đúng/Sai — thêm dòng "Đáp án: ĐSĐS" hoặc gạch chân/tô đỏ nhãn các ý đúng');
    }

    /* --- short / num --- */
    if (loai === 'short' || loai === 'num') {
      var v = dapAn != null ? dapAn : q.keyVal;
      if (v == null || !String(v).trim()) { /* thiếu đáp án: validateQuestion báo */ }
      else if (loai === 'short') Qo.answers = core.answerVariants(tachCachViet(v));
      else {
        var nu = docDapAnSo(v);
        if (!nu) bao('error', 'đáp án số không đọc được: "' + rutGon(v, 30) + '" (ví dụ: 12,5 hoặc 12,5 ± 0,1 hoặc 1,5 .. 2)');
        else Qo.numeric = nu;
      }
      if (Qo.answers === undefined && loai === 'short') Qo.answers = [];
    }

    // phương án/ý kéo dài nhiều dòng bất thường → có thể đã nuốt tiêu đề/đoạn văn của câu sau
    if (Qo.choices || Qo.statements) {
      (Qo.choices ? q.opts : q.stmts).forEach(function (p) {
        var them = p.units.slice(1).filter(function (u) { return u.k === 'line'; }).map(function (u) { return chuThuan(u.toks); }).join(' ').trim();
        if (them.length > 120) {
          bao('warn', (Qo.choices ? 'phương án ' : 'ý ') + p.nhan + (Qo.choices ? '' : ')') + ' kéo dài thêm nhiều dòng ("' + rutGon(them, 40) +
            '") — nếu đó là tiêu đề/đoạn văn của câu sau, hãy đặt sau dòng "ĐOẠN DẪN:" hoặc tách khỏi phương án');
        }
      });
    }

    /* --- nội dung câu (stem) + gộp lại phần không dùng --- */
    var stemUnits = [];
    q.items.forEach(function (it) {
      if (it.vai === 'stem') stemUnits.push(it.u);
      else if (it.vai === 'opt') { if (!Qo.choices) stemUnits = stemUnits.concat(traLai(q.opts[it.i])); }
      else if (it.vai === 'stmt') { if (loai !== 'tf' || Qo.choices) stemUnits = stemUnits.concat(traLai(q.stmts[it.i])); }
      else if (it.vai === 'pair') { if (loai !== 'matching' || (pairsManh.length && !it.manh)) stemUnits.push(it.u); }
    });

    /* --- ô điền / ô chọn --- */
    if (loai === 'blanks' || loai === 'dropdowns') {
      var dsO = [], k = 0;
      stemUnits = stemUnits.map(function (un) {
        if (un.k !== 'line' || un.str.indexOf('[[') < 0) return un;
        var re = /\[\[([^\[\]]*)\]\]/g, mm, toks = [], tu = 0;
        while ((mm = re.exec(un.str))) {
          var nd = chuThuan(cat(un.toks, mm.index + 2, mm.index + mm[0].length - 2));
          // mẫu upload: "[[1]]" trỏ tới phần khai báo "[[1]] = 50" + các lựa chọn A) B)… + ANSWER
          var soO = q.upload && /^\s*\d{1,3}\s*$/.test(nd) ? nd.trim() : null;
          var bid = soO ? 'b' + soO : 'b' + (++k);
          var phan = nd.split('|').map(function (x) { return x.replace(/\s+/g, ' ').trim(); });
          dsO.push({ id: bid, phan: phan, soO: soO, dinh: soO && q.oDinh ? q.oDinh[soO] : null });
          toks = toks.concat(cat(un.toks, tu, mm.index));
          toks.push({ t: 'text', s: '[' + bid + ']', f: {} });
          tu = mm.index + mm[0].length;
        }
        return taoDong(toks.concat(cat(un.toks, tu)), un.para, un.jc);
      });
      var coSao2 = dsO.some(function (x) { return x.phan.some(function (p) { return /^\*/.test(p); }); });
      if (q.upload) dsO.forEach(function (x) { if (x.soO) docODinh(x, loai, bao); });
      if (loai === 'blanks' && coSao2) { loai = 'dropdowns'; Qo.type = loai; if (!tuDong) bao('warn', 'có ô [[*…]] (ô chọn) nên câu được chuyển thành dạng chọn từ danh sách'); }
      if (loai === 'blanks') {
        Qo.blanks = dsO.map(function (x) {
          var acc = x.chap ? x.chap : x.phan.filter(Boolean);
          if (!acc.length) bao('error', 'ô [' + x.id + '] để trống');
          return { id: x.id, accepts: core.answerVariants(acc) };
        });
      } else {
        Qo.dropdowns = dsO.map(function (x) {
          if (x.chon) return { id: x.id, options: x.chon.options, correct: x.chon.correct };
          var dung = [], opsList = [];
          x.phan.forEach(function (p, i) { if (/^\*/.test(p)) dung.push(i); opsList.push(p.replace(/^\*\s*/, '')); });
          if (!dung.length) bao('error', 'ô [' + x.id + '] chưa đánh dấu lựa chọn đúng (thêm * trước lựa chọn đúng, ví dụ [[*Hà Nội|Huế]])');
          if (dung.length > 1) bao('error', 'ô [' + x.id + '] có ' + dung.length + ' lựa chọn được đánh dấu * (chỉ được 1)');
          return { id: x.id, options: opsList, correct: dung.length === 1 ? dung[0] : -1 };
        });
      }
    }

    /* --- ghép nối --- */
    if (loai === 'matching') {
      var cap = (pairsManh.length ? pairsManh : q.items.filter(function (it) { return it.vai === 'pair'; })).map(function (it) {
        var s = it.u.str, m = RE_MUI_TEN_MANH.exec(s) || RE_MUI_TEN.exec(s);
        if (!m) return null;
        var phai = cat(it.u.toks, m.index + m[0].length);
        if (phai.some(function (t) { return t.t === 'img'; })) bao('error', 'vế phải "' + rutGon(chuThuan(phai), 30) + '" có ảnh — vế phải chỉ được là chữ');
        return { left: H.toks(cat(it.u.toks, 0, m.index), o), right: chuThuan(phai).replace(/\s+/g, ' ').trim() };
      }).filter(Boolean);
      Qo.pairs = cap;
      Qo.distractors = q.nhieu.slice();
    } else if (q.nhieu.length) bao('warn', 'dòng "Nhiễu:" chỉ dùng cho câu ghép nối — đã bỏ qua');

    Qo.stem = H.khoi(stemUnits, o);
    var dvDan = q.stim ? q.stim.units : chuoiNhom(q.nhom);
    if (dvDan.length) {
      // đoạn dẫn dùng chung: cảnh báo (hình vẽ bị bỏ…) chỉ báo ở câu đầu tiên dùng nó
      var nguonDan = q.stim || q.nhom;
      Qo.stimulus = (nguonDan.daBaoDan ? new TaoHtml(ctx, dsAnh, function () {}) : H).khoi(dvDan, o);
      nguonDan.daBaoDan = true;
    }

    /* --- lời giải --- */
    var fb = H.khoi(q.fb, o);
    if (loai === 'essay' && q.dapAn) fb = '<p>Đáp án: ' + H.toks(q.dapAn.line.toks, o) + '</p>' + fb;
    Qo.feedback = fb;
    if (q.dapAnKhac.length) bao('warn', 'có ' + (q.dapAnKhac.length + 1) + ' dòng "Đáp án:" — dùng dòng đầu tiên');

    // bỏ trường không dùng của loại
    ['choices', 'statements', 'answers', 'numeric', 'blanks', 'dropdowns', 'pairs', 'distractors'].forEach(function (k) {
      if (Qo[k] === undefined) delete Qo[k];
    });
    var daBaoDS = issues.some(function (y) { return /chưa xác định ý nào Đúng\/Sai/.test(y.msg); });
    core.validateQuestion(Qo).forEach(function (x) {
      if (daBaoDS && /chưa xác định Đúng hay Sai/.test(x.msg)) return; // đã có thông báo chung
      if (!issues.some(function (y) { return y.msg === x.msg; })) issues.push(x);
    });
    return Qo;
  }

  // đoạn dẫn của nhóm: lời dặn + đoạn văn của các nhóm lồng nhau (ngoài → trong)
  function chuoiNhom(g) {
    var ds = [], out = [];
    for (; g; g = g.cha) ds.unshift(g);
    ds.forEach(function (x) { out = out.concat(x.units); });
    return out;
  }
  function chuPA(o) { return o.units.filter(function (u) { return u.k === 'line'; }).map(function (u) { return chuThuan(u.toks); }).join(' ').replace(/\s+/g, ' ').trim(); }
  // ô [[n]] của mẫu upload: FB → các cách viết đúng (lựa chọn có trọng số dương), SDL → danh sách thả xuống + lựa chọn đúng
  function docODinh(x, loai, bao) {
    var d = x.dinh;
    if (!d || !d.opts.length) { bao('error', 'ô [[' + x.soO + ']] chưa có phần khai báo "[[' + x.soO + ']]" kèm các lựa chọn A) B)…'); x.chap = []; x.chon = { options: [], correct: -1 }; return; }
    var chu = d.opts.map(chuPA), nhan = d.opts.map(function (o) { return o.nhan; });
    var dung = d.dapAn != null ? (tachChuCai(d.dapAn) || []) : (chu.length === 1 ? [nhan[0]] : []);
    if (loai === 'blanks') {
      x.chap = core.answerVariants(dung.length ? dung.map(function (c) { return chu[nhan.indexOf(c)]; }).filter(function (t) { return t != null && t !== ''; }) : chu);
      if (!dung.length && chu.length > 1) bao('info', 'ô [[' + x.soO + ']] không có dòng ANSWER — chấp nhận mọi lựa chọn đã liệt kê');
    } else {
      var k = dung.length ? nhan.indexOf(dung[0]) : -1;
      if (k < 0) bao('error', 'ô [[' + x.soO + ']] chưa xác định lựa chọn đúng (dòng ANSWER)');
      x.chon = { options: chu, correct: k };
    }
  }

  function doiVai(q, tu, sang) { // chuyển phương án ↔ ý (đổi hoa/thường nhãn)
    var hoa = sang === 'opts';
    q[sang] = q[tu].map(function (p) {
      var o = {};
      for (var k in p) if (hasOwn(p, k)) o[k] = p[k];
      o.nhan = hoa ? p.nhan.toUpperCase() : p.nhan.toLowerCase();
      o.goc = hoa ? p.goc.toUpperCase() : p.goc.toLowerCase();
      return o;
    });
    q[tu] = [];
    var vaiTu = tu === 'opts' ? 'opt' : 'stmt', vaiSang = sang === 'opts' ? 'opt' : 'stmt';
    q.items.forEach(function (it) { if (it.vai === vaiTu) it.vai = vaiSang; });
  }

  function traLai(p) { // phương án/ý không dùng → trả về nội dung câu kèm nhãn
    var u0 = p.units[0];
    var dau = taoDong(p.nhanToks.concat(u0.k === 'line' ? u0.toks : []), u0.para, u0.jc);
    return [dau].concat(u0.k === 'line' ? p.units.slice(1) : p.units);
  }

  function apDungKey(B) {
    var dem = {};
    B.key.forEach(function (e) {
      var ung = B.cau.filter(function (q) { return q.no === e.no && (!e.phan || (q.phan && q.phan.key === e.phan)); });
      var khoa = e.phan + '|' + e.no, k = dem[khoa] || 0;
      dem[khoa] = k + 1;
      var q = ung[k];
      if (!q) { B.warnings.push(core.newIssue('warn', 'BẢNG ĐÁP ÁN có câu ' + e.no + (e.phan ? ' (phần ' + e.phan + ')' : '') + ' nhưng không tìm thấy câu tương ứng')); return; }
      if (q.keyVal == null) q.keyVal = e.v;
    });
  }

  /* ======================= file đáp án riêng (HDC / KEY / ĐÁP ÁN) ======================= */

  var RE_THIEU_DA = /chưa xác định đáp án đúng|chưa có đáp án|chưa xác định ý nào Đúng\/Sai|chưa xác định Đúng hay Sai|câu một đáp án nhưng có|giáo viên chấm tay/;

  // các mục đáp án (theo thứ tự trong file) → { answers: { khoáPhần: { số câu: đáp án } }, count, issues }
  // Phần ghi rõ ("Phần I/II/III") → khoá '1','2','3'; không ghi mà số câu lặp lại (đề nhiều phần đánh số lại) → tách
  // đoạn theo lần lặp và đặt khoá '1','2',…; còn lại khoá ''.
  function gomKey(raw, fileName) {
    var ds = [], coPhan = false, issues = [];
    raw.forEach(function (B) { B.key.forEach(function (e) { if (e.v) { ds.push(e); if (e.phan) coPhan = true; } }); });
    var doanCua = [];
    if (!coPhan) {
      var doan = 0, thay = {}, lap = false;
      ds.forEach(function (e, i) {
        if (thay[e.no]) { doan++; thay = {}; lap = true; }
        thay[e.no] = 1;
        doanCua[i] = doan;
      });
      if (!lap) doanCua = [];
    }
    var answers = {}, count = 0, demPhan = {}, tuBang = 0, giongKey = 0, chat = 0;
    ds.forEach(function (e, i) {
      var p = coPhan ? e.phan : (doanCua.length ? String(doanCua[i] + 1) : '');
      var m = answers[p] || (answers[p] = {});
      if (hasOwn(m, e.no)) {
        if (m[e.no] !== e.v) issues.push(core.newIssue('warn', 'File đáp án ghi câu ' + e.no + (p ? ' (phần ' + p + ')' : '') + ' hai lần khác nhau ("' + rutGon(m[e.no], 20) + '" và "' + rutGon(e.v, 20) + '") — dùng lần đầu'));
        return;
      }
      m[e.no] = e.v; count++;
      if (e.bang) tuBang++;
      if (laGiaTriKey(e.v)) giongKey++;
      if (laGiaTriKey(e.v, true)) chat++;
      demPhan[p] = (demPhan[p] || 0) + 1;
    });
    var moTa = Object.keys(demPhan).map(function (p) { return (p ? 'phần ' + p + ': ' : '') + demPhan[p] + ' câu'; }).join(', ');
    if (count) issues.unshift(core.newIssue('info', 'File "' + fileName + '" là file đáp án / hướng dẫn chấm: đọc được ' + count + ' đáp án (' + moTa + ') — nạp cùng file đề để tự điền đáp án cho các câu còn thiếu'));
    return { answers: answers, count: count, issues: issues, fileName: fileName, tuBang: tuBang, giongKey: giongKey, chat: chat,
      coTieuDe: raw.some(function (B) { return B.tieuDeDA; }) };
  }
  // giá trị trông như đáp án (chữ cái, Đ/S, số, từ ngắn) — để không nhầm đề ngắn chưa có đáp án ("Câu 1. Tính 2 + 2.") là file đáp án
  // chat: chỉ nhận chữ cái phương án, Đ/S từng ý, số, TRUE/FALSE/NOT GIVEN/YES/NO
  function laGiaTriKey(v, chat) {
    v = String(v).trim();
    if (/^\*?[A-H](?:\s*[,;&]?\s*[A-H])*\.?$/.test(v) || /^[-+−]?\d+(?:[.,]\d+)?$/.test(v) || /^(?:TRUE|FALSE|NOT GIVEN|YES|NO)$/i.test(v)) return true;
    if (/^(?:[a-h]\s*[).:\-]?\s*)?[ĐSTFđs](?:\s*[;,]?\s*(?:[a-h]\s*[).:\-]?\s*)?[ĐSTFđs])*$/.test(v)) return true;
    return !chat && v.length <= 25 && v.split(/\s+/).length <= 3 && !/[.?!:]$/.test(v);
  }

  function khoaPhanCua(q) {
    var p = q && q.meta && q.meta.part ? gap(String(q.meta.part)) : '';
    var m = /^\s*phan\s+([ivxlc]+|\d{1,2})(?![a-z\d])/.exec(p) || /^\s*([ivx]{1,4}|\d{1,2})\s*[.)\-–:]/.exec(p);
    return m ? (/^\d+$/.test(m[1]) ? String(+m[1]) : String(soLaMa(m[1]))) : '';
  }
  function timKey(ans, pk, no) {
    var ds = Object.keys(ans);
    var lay = function (p, n) { return ans[p] && hasOwn(ans[p], n) ? { v: ans[p][n], khoa: [p + '|' + n] } : null; };
    var tim1 = function (n) {
      if (pk && ans[pk]) return lay(pk, n);
      return lay('', n) || (ds.length === 1 ? lay(ds[0], n) : null);
    };
    var m = /^(\d+)\s*-\s*(\d+)$/.exec(no);
    if (m) { // câu gộp phạm vi "21-22" (chọn HAI chữ cái): nối đáp án của từng số
      var vs = [], khoa = [];
      for (var n = +m[1]; n <= +m[2]; n++) {
        var x = tim1(String(n));
        if (!x) return tim1(no);
        vs.push(x.v); khoa = khoa.concat(x.khoa);
      }
      return { v: vs.join(', '), khoa: khoa };
    }
    return tim1(no);
  }
  function chuHtml(h) {
    return String(h || '').replace(/<math[\s\S]*?<\/math>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }
  function soSanh(s) { return core.nfc(String(s)).toLowerCase().replace(/\s+/g, ' ').replace(/[.。]+$/, '').trim(); }

  // điền một đáp án vào câu (mô hình §1) — trả { kq: 'dien'|'trung'|'xung'|'lech'|'bo', msg?, level? }
  function dienDapAn(q, v) {
    v = String(v == null ? '' : v).replace(RE_SO_KEY_G, '').trim();
    if (!v) return { kq: 'bo' };
    var t = q.type;
    if (t === 'mc' || t === 'ma') {
      var ch = Array.isArray(q.choices) ? q.choices : [];
      var theoChu = ch.filter(function (c) { return c && soSanh(chuHtml(c.html)) === soSanh(v); });
      var ds = theoChu.length === 1 ? [theoChu[0].id] : tachChuCai(v);
      if (!ds || !ds.length) return { kq: 'lech', msg: 'file đáp án ghi "' + rutGon(v, 30) + '" — không khớp phương án nào' };
      var la = ds.filter(function (c) { return !ch.some(function (x) { return x && x.id === c; }); });
      if (la.length) return { kq: 'lech', msg: 'file đáp án ghi ' + la.join(', ') + ' nhưng câu chỉ có phương án ' + ch.map(function (c) { return c && c.id; }).join(', ') };
      var co = ch.filter(function (c) { return c && c.correct === true; }).map(function (c) { return c.id; });
      if (co.length) return cungTap(co, ds) ? { kq: 'trung' } : { kq: 'xung', msg: 'file đáp án ghi ' + ds.join(', ') + ' nhưng trong đề đánh dấu ' + co.join(', ') + ' — giữ ' + co.join(', ') };
      ch.forEach(function (c) { if (c) c.correct = ds.indexOf(c.id) >= 0; });
      if (ds.length >= 2) q.type = 'ma';
      return { kq: 'dien' };
    }
    if (t === 'tf') {
      var st = Array.isArray(q.statements) ? q.statements : [], keys = st.map(function (s) { return s.key; });
      var r = docDungSai(v, keys);
      if (!r) return { kq: 'lech', msg: 'file đáp án ghi "' + rutGon(v, 30) + '" — không đọc được Đúng/Sai' };
      if (st.length && st.every(function (s) { return typeof s.value === 'boolean'; })) {
        var khac = st.filter(function (s) { return hasOwn(r.map, s.key) && !!r.map[s.key] !== s.value; });
        return khac.length ? { kq: 'xung', msg: 'file đáp án khác các ý đã đánh dấu (' + khac.map(function (s) { return s.key + ')'; }).join(', ') + ') — giữ đánh dấu trong đề' } : { kq: 'trung' };
      }
      st.forEach(function (s) { if (hasOwn(r.map, s.key)) s.value = !!r.map[s.key]; });
      return { kq: 'dien' };
    }
    if (t === 'short') {
      var moi = core.answerVariants(tachCachViet(v));
      var cu = (Array.isArray(q.answers) ? q.answers : []).filter(function (a) { return String(a).trim(); });
      if (cu.length) {
        var giao = cu.some(function (a) { return moi.some(function (b) { return soSanh(a) === soSanh(b); }); });
        return giao ? { kq: 'trung' } : { kq: 'xung', msg: 'file đáp án ghi "' + rutGon(v, 30) + '" nhưng trong đề là "' + rutGon(cu[0], 30) + '" — giữ đáp án trong đề' };
      }
      q.answers = moi;
      return { kq: 'dien' };
    }
    if (t === 'num') {
      var nu = docDapAnSo(v);
      if (!nu) return { kq: 'lech', msg: 'file đáp án ghi "' + rutGon(v, 30) + '" — không phải số' };
      if (q.numeric && typeof q.numeric === 'object' && (q.numeric.exact !== undefined || q.numeric.min !== undefined)) {
        return JSON.stringify(q.numeric) === JSON.stringify(nu) ? { kq: 'trung' } : { kq: 'xung', msg: 'file đáp án ghi ' + v + ' khác đáp án trong đề — giữ đáp án trong đề' };
      }
      q.numeric = nu;
      return { kq: 'dien' };
    }
    if (t === 'essay') {
      var tu = v.split(/\s+/).filter(Boolean).length;
      if (v.length <= 40 && tu <= 4 && !/[.!?]$/.test(v) && v.indexOf('\n') < 0) { // đáp án ngắn → trả lời ngắn chấm tự động
        q.type = 'short';
        q.answers = core.answerVariants(tachCachViet(v));
        return { kq: 'dien' };
      }
      if (soSanh(chuHtml(q.feedback)).indexOf(soSanh(v.split('\n')[0])) >= 0) return { kq: 'trung' };
      q.feedback = '<p>Đáp án: ' + escText(v).replace(/\n/g, '<br>') + '</p>' + (q.feedback || '');
      return { kq: 'dien', level: 'info', msg: 'đáp án trong file đáp án được đưa vào lời giải (câu tự luận — giáo viên chấm tay)' };
    }
    return { kq: 'bo', level: 'info', msg: 'câu loại ' + t + ' không điền được từ file đáp án — giữ nguyên' };
  }
  function tenCauCua(q) { return String(q.title || ('Câu ' + q.no)).replace(/\s*\[[^\]]*\]\s*$/, ''); }
  function lamMoiLoi(q, them) {
    var giu = (Array.isArray(q.issues) ? q.issues : []).filter(function (i) { return !RE_THIEU_DA.test(i.msg); });
    if (them) giu.push(core.newIssue(them.level, tenCauCua(q) + ': ' + them.msg, q.id));
    core.validateQuestion(q).forEach(function (x) { if (!giu.some(function (y) { return y.msg === x.msg; })) giu.push(x); });
    q.issues = giu;
  }

  // Điền đáp án từ file đáp án vào các câu còn thiếu; câu đã có đáp án mà khác → cảnh báo, giữ đáp án trong đề.
  // banks: [Bank] (sửa trực tiếp), key: kết quả parseAnswerKey (hoặc { answers }). Trả thống kê + issues.
  function applyAnswerKey(banks, key) {
    var ans = key && key.answers ? key.answers : (key || {});
    var out = { matched: 0, filled: 0, same: 0, conflicts: 0, mismatched: 0, unused: [], issues: [] };
    var daDung = {};
    (Array.isArray(banks) ? banks : [banks]).forEach(function (b) {
      if (!b || !Array.isArray(b.questions)) return;
      b.questions.forEach(function (q) {
        if (!q || q.type === 'text') return;
        var tim = timKey(ans, khoaPhanCua(q), String(q.no));
        if (!tim) return;
        out.matched++;
        tim.khoa.forEach(function (k) { daDung[k] = 1; });
        var r = dienDapAn(q, tim.v);
        if (r.kq === 'dien') out.filled++;
        else if (r.kq === 'trung') out.same++;
        else if (r.kq === 'xung') out.conflicts++;
        else if (r.kq === 'lech') out.mismatched++;
        if (r.kq === 'trung' || (r.kq === 'bo' && !r.msg)) return;
        lamMoiLoi(q, r.msg ? { level: r.level || 'warn', msg: r.msg } : null);
      });
    });
    Object.keys(ans).forEach(function (p) {
      Object.keys(ans[p]).forEach(function (n) { if (!daDung[p + '|' + n]) out.unused.push((p ? p + '.' : '') + n); });
    });
    if (out.unused.length) {
      out.issues.push(core.newIssue('warn', 'File đáp án có ' + out.unused.length + ' câu không khớp câu nào trong đề (' + rutGon(out.unused.join(', '), 60) + ')'));
    }
    if (out.matched) out.issues.unshift(core.newIssue('info', 'Đã khớp ' + out.matched + ' câu với file đáp án: điền ' + out.filled + ', trùng ' + out.same + ', khác ' + out.conflicts + (out.mismatched ? ', không khớp phương án ' + out.mismatched : '')));
    return out;
  }

  // tên file bỏ các chữ chỉ đáp án (HDC, KEY, ĐÁP ÁN, Hướng dẫn chấm…) — để ghép file đáp án với file đề
  var TU_DA = [['hdc'], ['hd', 'cham'], ['huong', 'dan', 'cham'], ['dap', 'an'], ['dapan'], ['da'], ['key'], ['answer', 'key'], ['answers'], ['answer'], ['loi', 'giai']];
  function tachTen(name) {
    var t = gap(core.nfc(String(name || '').replace(/^.*[\\\/]/, '').replace(/\.(docx|docm|dotx|dotm)$/i, '')));
    return t.split(/[\s._\-()\[\]]+/).filter(Boolean);
  }
  function boTuDapAn(tk) {
    var out = [], co = false;
    for (var i = 0; i < tk.length;) {
      var khop = TU_DA.filter(function (w) { return w.every(function (x, j) { return tk[i + j] === x; }); }).sort(function (a, b) { return b.length - a.length; })[0];
      if (khop) { co = true; i += khop.length; continue; }
      out.push(tk[i]); i++;
    }
    return { tk: out, co: co };
  }
  function laTenDapAn(name) { return boTuDapAn(tachTen(name)).co; }
  function tenGocDapAn(name) { return boTuDapAn(tachTen(name)).tk.join('.'); }

  /* ======================= API ======================= */

  // mở gói .docx → các đơn vị (dòng/bảng); lỗi → { loi: [Issue] }
  async function moTaiLieu(u8, opts) {
    var fileName = opts.fileName || 'Ngan-hang.docx';
    var tenFile = String(fileName).replace(/^.*[\\\/]/, '').replace(/\.(docx|docm|dotx|dotm)$/i, '').trim() || 'Ngân hàng câu hỏi';
    if (u8 instanceof ArrayBuffer) u8 = new Uint8Array(u8);
    if (!u8 || !u8.length) return { loi: [core.newIssue('error', 'File "' + fileName + '" rỗng')] };
    if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) {
      return { loi: [core.newIssue('error', 'File "' + fileName + '" là định dạng Word cũ (.doc) hoặc đang đặt mật khẩu — hãy mở bằng Word, bỏ mật khẩu và Lưu thành (Save As) .docx')] };
    }
    var files;
    try { files = await zip.readZip(u8); } catch (e) {
      return { loi: [core.newIssue('error', 'Không đọc được file Word "' + fileName + '": ' + (e && e.message || e))] };
    }
    var goi = new Goi(files);
    var docPath = 'word/document.xml';
    var goc = goi.rels('');
    for (var k in goc) if (hasOwn(goc, k) && /\/officeDocument$/.test(goc[k].type) && goi.lay(goc[k].target)) docPath = goc[k].target;
    var docXml = goi.xml(docPath);
    if (!docXml) return { loi: [core.newIssue('error', 'File "' + fileName + '" không phải tài liệu Word hợp lệ (thiếu word/document.xml)')] };
    var body = core.find(docXml, 'w:body') || docXml;
    var mt = { latex: opts.latex !== undefined ? opts.latex : layMoDun('latex'), math: opts.math !== undefined ? opts.math : layMoDun('math') };
    var ctx = new Ctx(goi, docPath);
    var units = taoDonVi(duyetKhoi(body, ctx, []), mt);
    return { fileName: fileName, tenFile: tenFile, ctx: ctx, mt: mt, units: units };
  }

  // câu "thật" của đề (có phương án/ý, hoặc nội dung đủ dài) — để phân biệt file đề với file chỉ có đáp án
  function laCauThat(q) {
    return (q.choices && q.choices.length >= 2) || (q.statements && q.statements.length >= 2) || chuHtml(q.stem).replace(/\s+/g, ' ').trim().length >= 40;
  }

  function coDapAn(q) {
    switch (q.type) {
      case 'mc': case 'ma': return (q.choices || []).some(function (c) { return c && c.correct === true; });
      case 'tf': return (q.statements || []).length > 0 && q.statements.every(function (x) { return typeof x.value === 'boolean'; });
      case 'short': return (q.answers || []).length > 0;
      case 'num': return !!q.numeric;
      case 'essay': case 'text': return false;
      default: return true;
    }
  }

  async function parseDocx(u8, opts) {
    opts = opts || {};
    var d = await moTaiLieu(u8, opts);
    if (d.loi) return { banks: [], issues: d.loi };
    var fileName = d.fileName, ctx = d.ctx, mt = d.mt;
    var raw = phanTich(d.units.slice(), ctx, mt, d.tenFile);
    var issues = [].concat(ctx.canhBao);

    var banks = raw.map(function (B) {
      var viDu = B.cau.filter(function (q) { return q.viDu; }).length;
      B.cau = B.cau.filter(function (q) { return !q.viDu; });
      if (viDu) B.warnings.push(core.newIssue('info', 'Bỏ qua ' + viDu + ' câu ví dụ (đánh số 0)'));
      apDungKey(B);
      var dem = {};
      B.cau.forEach(function (q) { dem[q.no] = (dem[q.no] || 0) + 1; });
      var trung = Object.keys(dem).some(function (x) { return dem[x] > 1; });
      var dsAnh = {};
      var questions = B.cau.map(function (q, i) { return dungCau(q, i, trung, ctx, dsAnh, mt); });
      var images = {};
      Object.keys(dsAnh).sort().forEach(function (n) { images[n] = ctx.anh[n]; });
      var le = B.le.filter(function (u) { return u.k === 'tbl' || !dongRong(u); });
      if (le.length) {
        var vd = le.filter(function (u) { return u.k === 'line'; })[0];
        B.warnings.push(core.newIssue('info', 'Bỏ qua ' + le.length + ' đoạn nằm ngoài câu hỏi' + (vd ? ' (ví dụ: "' + rutGon(chuThuan(vd.toks)) + '")' : '')));
      }
      if (!questions.length) B.warnings.push(core.newIssue('warn', 'Ngân hàng "' + B.title + '" chưa có câu hỏi nào (mỗi câu bắt đầu bằng "Câu 1.", "Câu 2."…)'));
      var tuLuanTrong = questions.filter(function (q) { return q.type === 'essay' && !q.feedback; }).length;
      if (B.cheDo === 'so' && questions.length >= 5 && tuLuanTrong >= 0.8 * questions.length) {
        B.warnings.push(core.newIssue('warn', tuLuanTrong + '/' + questions.length + ' mục đánh số không có phương án hay đáp án nên thành câu tự luận — nếu file này không phải đề thi thì bỏ qua; nếu là đề, hãy đánh dấu đáp án hoặc nạp kèm file đáp án'));
      }
      return {
        title: B.title, ident: core.bankIdent(B.title), source: { kind: 'docx', name: fileName },
        questions: questions, images: images, warnings: B.warnings
      };
    });

    // file chỉ có đáp án (HDC / KEY / ĐÁP ÁN): trả khoá đáp án thay cho ngân hàng
    var nThat = 0, nPA = 0, nCau = 0, nCoDA = 0;
    banks.forEach(function (b) {
      b.questions.forEach(function (q) {
        nCau++;
        if (coDapAn(q)) nCoDA++;
        if (laCauThat(q)) nThat++;
        if ((q.choices && q.choices.length >= 2) || (q.statements && q.statements.length >= 2)) nPA++;
      });
    });
    var tenDA = laTenDapAn(fileName);
    if (nThat <= 5 || (tenDA && !nPA)) {
      var key = gomKey(phanTich(d.units.slice(), ctx, mt, d.tenFile, { chiDapAn: true }), fileName);
      if (key.count >= 3 && nCoDA * 3 <= key.count && (key.tuBang >= 3 || key.giongKey >= 0.6 * key.count) &&
          key.chat >= 0.3 * key.count && (tenDA || key.coTieuDe || key.chat >= 0.7 * key.count) && (nThat * 3 <= key.count || (tenDA && !nPA && key.count >= nCau))) {
        return { banks: [], issues: issues.concat(key.issues), keyOnly: true, key: key };
      }
    }
    if (opts.answerKey) {
      [].concat(opts.answerKey).forEach(function (k) { if (k) issues = issues.concat(applyAnswerKey(banks, k).issues); });
    }
    if (!banks.some(function (b) { return b.questions.length; })) {
      issues.push(core.newIssue('error', 'Không tìm thấy câu hỏi nào trong "' + fileName + '" — mỗi câu phải bắt đầu bằng "Câu 1.", "Câu 2."… và (nếu có) đặt sau dòng "NGÂN HÀNG: <tên>"'));
    }
    return { banks: banks, issues: issues };
  }

  // Đọc file đáp án riêng (HDC/KEY/ĐÁP ÁN): bảng số câu + chữ cái, "Câu 1: A", bảng THPT 2025 Phần I/II/III
  // (Đúng/Sai từng ý, ô số trả lời ngắn) → { answers: { khoáPhần|'': { số: đáp án } }, count, issues }
  async function parseAnswerKey(u8, opts) {
    opts = opts || {};
    var d = await moTaiLieu(u8, opts);
    if (d.loi) return { answers: {}, count: 0, issues: d.loi, fileName: opts.fileName || '' };
    var key = gomKey(phanTich(d.units.slice(), d.ctx, d.mt, d.tenFile, { chiDapAn: true }), d.fileName);
    if (!key.count) key.issues.push(core.newIssue('error', 'Không đọc được đáp án nào trong "' + d.fileName + '" (cần bảng số câu – đáp án, hoặc các dòng "Câu 1: A")'));
    return key;
  }

  return {
    parseDocx: parseDocx,
    parseAnswerKey: parseAnswerKey,
    applyAnswerKey: applyAnswerKey,
    isAnswerKeyName: laTenDapAn,
    answerKeyBaseName: tenGocDapAn,
    // để test
    _gap: gap, _tachChuCai: tachChuCai, _docDungSai: docDungSai, _docDapAnSo: docDapAnSo, _tachCapKey: tachCapKey,
    _nhanDangAnh: nhanDangAnh
  };
});
