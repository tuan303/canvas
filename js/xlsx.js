/* js/xlsx.js — đọc ngân hàng câu hỏi từ file Excel (.xlsx) theo mẫu (DESIGN §4) */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.xlsx = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var laNode = typeof module === 'object' && module.exports && typeof require === 'function';
  var core = laNode ? require('./core.js') : root.NH.core;
  var HOP = Object.prototype.hasOwnProperty;

  function layZip() { return laNode ? require('./zip.js') : root.NH.zip; }

  // latex.js là tuỳ chọn: thiếu thì giữ nguyên $…$ dạng chữ. opts.latex (kể cả null) ghi đè — để test.
  function layLatex(opts) {
    if (opts && HOP.call(opts, 'latex')) return opts.latex || null;
    var m = null;
    if (laNode) { try { m = require('./latex.js'); } catch (e) { m = null; } }
    if (!m && root && root.NH && root.NH.latex) m = root.NH.latex;
    return m || null;
  }

  /* ===================== XML theo tên cục bộ (bỏ tiền tố x:, xdr:, a:…) ===================== */

  function ln(n) { var i = n.lastIndexOf(':'); return i < 0 ? n : n.slice(i + 1); }
  function theoTen(t) { return function (el) { return ln(el.name) === t; }; }
  function con(node, t) { return core.children(node, theoTen(t)); }
  function con1(node, t) { var a = con(node, t); return a.length ? a[0] : null; }
  function tim(node, t) { return core.find(node, theoTen(t)); }
  function timHet(node, t) { return core.findAll(node, theoTen(t)); }
  function tt(node, t) { // thuộc tính theo tên cục bộ (r:id → 'id')
    if (!node || !node.attrs) return null;
    if (HOP.call(node.attrs, t)) return node.attrs[t];
    for (var k in node.attrs) {
      if (HOP.call(node.attrs, k) && k.indexOf('xmlns') !== 0 && ln(k) === t) return node.attrs[k];
    }
    return null;
  }

  /* ===================== Gói zip + quan hệ (rels) ===================== */

  function taoKho(files) {
    var thuong = {};
    Object.keys(files).forEach(function (k) { thuong[k.toLowerCase()] = k; });
    function lay(p) {
      if (!p) return null;
      p = String(p).replace(/^\/+/, '');
      if (HOP.call(files, p)) return files[p];
      var k = thuong[p.toLowerCase()];
      return k ? files[k] : null;
    }
    return { lay: lay, xml: function (p) { var b = lay(p); return b ? core.parseXml(b) : null; } };
  }

  function thuMuc(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
  function giaiDuongDan(phan, dich) {
    dich = String(dich).replace(/\\/g, '/');
    var s = dich.charAt(0) === '/' ? dich.slice(1) : thuMuc(phan) + dich;
    var out = [];
    s.split('/').forEach(function (x) { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); });
    return out.join('/');
  }
  // rels của một phần: { rId: {target, type, external} }
  function docRels(kho, phan) {
    var d = thuMuc(phan);
    var x = kho.xml(d + '_rels/' + phan.slice(d.length) + '.rels'), out = {};
    if (!x) return out;
    timHet(x, 'Relationship').forEach(function (r) {
      var id = tt(r, 'Id'), dich = tt(r, 'Target') || '';
      if (!id) return;
      var ngoai = /^external$/i.test(tt(r, 'TargetMode') || '');
      out[id] = { target: ngoai ? null : giaiDuongDan(phan, dich), type: tt(r, 'Type') || '', external: ngoai, raw: dich };
    });
    return out;
  }
  function relTheoLoai(rels, duoi) {
    for (var k in rels) if (HOP.call(rels, k) && rels[k].target && rels[k].type.slice(-duoi.length) === duoi) return rels[k].target;
    return null;
  }
  function relTheoTen(rels, ten) {
    for (var k in rels) {
      if (HOP.call(rels, k) && rels[k].target && rels[k].target.toLowerCase().slice(-ten.length) === ten.toLowerCase()) return rels[k].target;
    }
    return null;
  }

  /* ===================== Chuỗi ô ===================== */

  // _xHHHH_ (ST_Xstring) → ký tự; _x005F_ là '_' thật
  function giaiX(s) {
    return s.indexOf('_x') === -1 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  function chuanChu(s) { return core.nfc(giaiX(String(s == null ? '' : s)).replace(/\r\n?/g, '\n')); }

  function bat(el) { if (!el) return false; var v = tt(el, 'val'); return v == null || !/^(0|false|off|none)$/i.test(v); }

  // <si>/<is>: <t> hoặc các run <r><rPr/><t/></r>; bỏ phiên âm <rPh>
  function docChuoi(si) {
    var out = [];
    (si.children || []).forEach(function (k) {
      if (k.type !== 'el') return;
      var n = ln(k.name);
      if (n === 't') out.push({ text: chuanChu(core.xmlText(k)) });
      else if (n === 'r') {
        var tEl = con1(k, 't');
        if (!tEl) return;
        var run = { text: chuanChu(core.xmlText(tEl)) }, pr = con1(k, 'rPr');
        if (pr) {
          if (bat(con1(pr, 'b'))) run.b = true;
          if (bat(con1(pr, 'i'))) run.i = true;
          if (bat(con1(pr, 'u'))) run.u = true;
          if (bat(con1(pr, 'strike'))) run.s = true;
          var va = con1(pr, 'vertAlign'), v = va ? tt(va, 'val') : '';
          if (v === 'superscript') run.sup = true;
          else if (v === 'subscript') run.sub = true;
        }
        out.push(run);
      }
    });
    return out;
  }

  // số trong <v>: giữ chuỗi gốc khi gọn, khử nhiễu dấu phẩy động (0.30000000000000004 → 0.3)
  function soSangChu(v) {
    var s = String(v).trim();
    if (/^-?\d+(\.\d+)?$/.test(s) && s.replace(/[-.]/g, '').replace(/^0+/, '').length <= 15) return s;
    var n = Number(s);
    if (!isFinite(n)) return s;
    return String(parseFloat(n.toPrecision(15)));
  }

  function cotSo(chu) { var n = 0; chu = chu.toUpperCase(); for (var i = 0; i < chu.length; i++) n = n * 26 + chu.charCodeAt(i) - 64; return n - 1; }
  function cotChu(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
  function docRef(ref) {
    var m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(ref || '').trim());
    return m ? { c: cotSo(m[1]), r: parseInt(m[2], 10) } : null;
  }

  /* ===================== Ảnh trong ô (Excel "Place in cell" + WPS DISPIMG) ===================== */

  // Excel 365: ô <c vm="n"> → metadata.xml valueMetadata → futureMetadata XLRICHVALUE → rdrichvalue.xml
  // → khoá _rvRel:LocalImageIdentifier → richValueRel.xml → rels → xl/media/…
  function taoRichImg(kho, wbPath, wbRels) {
    var d = thuMuc(wbPath);
    var mdPath = relTheoLoai(wbRels, '/sheetMetadata') || d + 'metadata.xml';
    var md = kho.xml(mdPath);
    if (!md) return null;
    var tenLoai = timHet(md, 'metadataType').map(function (x) { return tt(x, 'name'); });
    var tuongLai = [];
    timHet(md, 'futureMetadata').forEach(function (fm) {
      if (tt(fm, 'name') !== 'XLRICHVALUE') return;
      con(fm, 'bk').forEach(function (bk) { var rvb = tim(bk, 'rvb'); tuongLai.push(rvb ? parseInt(tt(rvb, 'i'), 10) : -1); });
    });
    var giaTri = [];
    var vmEl = tim(md, 'valueMetadata');
    if (vmEl) con(vmEl, 'bk').forEach(function (bk) { var rc = con1(bk, 'rc'); giaTri.push(rc ? { t: parseInt(tt(rc, 't'), 10), v: parseInt(tt(rc, 'v'), 10) } : null); });

    var rvPath = relTheoTen(wbRels, 'rdrichvalue.xml') || d + 'richData/rdrichvalue.xml';
    var rsPath = relTheoTen(wbRels, 'rdrichvaluestructure.xml') || d + 'richData/rdrichvaluestructure.xml';
    var relPath = relTheoTen(wbRels, 'richValueRel.xml') || d + 'richData/richValueRel.xml';
    var rvX = kho.xml(rvPath);
    if (!rvX) return null;
    var rvs = timHet(rvX, 'rv').map(function (rv) {
      return { s: parseInt(tt(rv, 's'), 10) || 0, v: con(rv, 'v').map(function (x) { return core.xmlText(x).trim(); }) };
    });
    var rsX = kho.xml(rsPath);
    var cauTruc = rsX ? timHet(rsX, 's').map(function (s) { return { t: tt(s, 't'), k: con(s, 'k').map(function (k) { return tt(k, 'n'); }) }; }) : [];
    var relX = kho.xml(relPath), relIds = relX ? timHet(relX, 'rel').map(function (r) { return tt(r, 'id'); }) : [];
    var rels = docRels(kho, relPath);

    return function (vm) {
      var g = giaTri[vm - 1];
      if (!g || tenLoai[g.t - 1] !== 'XLRICHVALUE') return null;
      var rv = rvs[tuongLai[g.v]];
      if (!rv) return null;
      var ct = cauTruc[rv.s], vt = 0;
      if (ct) {
        vt = ct.k.indexOf('_rvRel:LocalImageIdentifier');
        if (vt < 0) return null; // giá trị đặc biệt khác (cổ phiếu, địa lý…) không phải ảnh
      }
      var rid = relIds[parseInt(rv.v[vt], 10)], rel = rid && rels[rid];
      return rel && rel.target ? { path: rel.target, nguon: 'ảnh đặt trong ô' } : null;
    };
  }

  // WPS: ô có công thức =DISPIMG("ID_…",1), ảnh khai báo trong xl/cellimages.xml
  function taoWpsImg(kho, wbPath) {
    var p = thuMuc(wbPath) + 'cellimages.xml', x = kho.xml(p);
    if (!x) return null;
    var rels = docRels(kho, p), bang = {};
    timHet(x, 'pic').forEach(function (pic) {
      var nv = tim(pic, 'cNvPr'), blip = tim(pic, 'blip');
      if (!nv || !blip) return;
      var rel = rels[tt(blip, 'embed')];
      if (!rel || !rel.target) return;
      var o = { path: rel.target, nguon: 'ảnh đặt trong ô (WPS)' }, ext = tim(pic, 'ext'), cx = ext ? parseInt(tt(ext, 'cx'), 10) : 0;
      if (cx > 0) o.width = Math.round(cx / 9525);
      [tt(nv, 'name'), tt(nv, 'descr')].forEach(function (k) { if (k && !bang[k]) bang[k] = o; });
    });
    return function (id) { return bang[id] || null; };
  }

  /* ===================== Đọc trang tính ===================== */

  function docO(cEl, ctx) {
    var t = tt(cEl, 't') || 'n';
    var vEl = con1(cEl, 'v'), fEl = con1(cEl, 'f');
    var v = vEl ? core.xmlText(vEl) : null, f = fEl ? core.xmlText(fEl) : '';
    var o = { kind: t, runs: [], text: '', num: null, pics: [], loi: null, chuaTinh: false, anhLoi: false };
    var vm = tt(cEl, 'vm');
    if (vm != null) {
      var p = ctx.richImg ? ctx.richImg(parseInt(vm, 10)) : null;
      if (p) { o.pics.push(p); return o; }
    }
    // WPS: =DISPIMG("ID_…",1); file WPS đã lưu lại bằng Excel thì ô thành t="e" vm=… (#NAME?) nhưng vẫn giữ <f>
    var md = /DISPIMG\(\s*"([^"]+)"/i.exec(f + '\n' + (v || ''));
    if (md) {
      var w = ctx.wpsImg ? ctx.wpsImg(md[1]) : null;
      if (w) o.pics.push(w); else o.anhLoi = true;
      return o;
    }
    if (vm != null && t === 'e') { o.anhLoi = true; return o; }
    if (t === 's') {
      var i = parseInt(v, 10);
      if (i >= 0 && i < ctx.ss.length) o.runs = ctx.ss[i];
      else if (v != null) o.loi = 'chuỗi dùng chung #' + v + ' không tồn tại';
    } else if (t === 'inlineStr') {
      var is = con1(cEl, 'is');
      o.runs = is ? docChuoi(is) : [];
    } else if (t === 'str' || t === 'd') {
      if (v != null) o.runs = [{ text: chuanChu(v) }];
    } else if (t === 'b') {
      if (v != null) o.runs = [{ text: v.trim() === '1' ? 'TRUE' : 'FALSE' }];
    } else if (t === 'e') {
      o.loi = (v || '').trim() || '#ERROR';
    } else if (v != null && v.trim() !== '') {
      o.num = Number(v);
      o.runs = [{ text: soSangChu(v) }];
    }
    if (fEl && v == null && t !== 'inlineStr') o.chuaTinh = true;
    o.text = o.runs.map(function (r) { return r.text; }).join('');
    return o;
  }

  function docTrangTinh(x, ctx) {
    var rows = {}, so = [], rTruoc = 0;
    var sd = tim(x, 'sheetData');
    con(sd, 'row').forEach(function (rowEl) {
      var r = parseInt(tt(rowEl, 'r'), 10);
      if (!(r > 0)) r = rTruoc + 1;
      rTruoc = r;
      if (!rows[r]) { rows[r] = {}; so.push(r); }
      var hang = rows[r], cTruoc = -1;
      con(rowEl, 'c').forEach(function (cEl) {
        var ref = docRef(tt(cEl, 'r'));
        var c = ref ? ref.c : cTruoc + 1;
        cTruoc = c;
        var o = docO(cEl, ctx);
        o.ref = cotChu(c) + r;
        hang[c] = o;
      });
    });
    so.sort(function (a, b) { return a - b; });
    var gop = [];
    timHet(x, 'mergeCell').forEach(function (m) {
      var p = String(tt(m, 'ref') || '').split(':'), a = docRef(p[0]), b = docRef(p[1] || p[0]);
      if (a && b) gop.push({ r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) });
    });
    var dr = con1(x, 'drawing');
    return { rows: rows, so: so, gop: gop, drawingRid: dr ? tt(dr, 'id') : null };
  }

  // Ảnh nổi: xl/drawings/drawingN.xml, neo xdr:from (hàng/cột tính từ 0)
  function docAnhNoi(kho, drawPath) {
    var x = kho.xml(drawPath), out = [];
    if (!x) return out;
    var rels = docRels(kho, drawPath);
    (x.children || []).forEach(function (neo) {
      if (neo.type !== 'el') return;
      var loai = ln(neo.name);
      if (loai !== 'twoCellAnchor' && loai !== 'oneCellAnchor' && loai !== 'absoluteAnchor') return;
      var tu = con1(neo, 'from');
      var hang = tu ? parseInt(core.xmlText(con1(tu, 'row') || {}), 10) : NaN;
      var cot = tu ? parseInt(core.xmlText(con1(tu, 'col') || {}), 10) : NaN;
      var extNeo = con1(neo, 'ext');
      layPic(neo).forEach(function (pic) {
        var blip = tim(pic, 'blip');
        if (!blip) return;
        var o = { row: isFinite(hang) ? hang + 1 : null, col: isFinite(cot) ? cot : null, nguon: 'ảnh nổi' };
        var nv = tim(pic, 'cNvPr'), moTa = nv ? tt(nv, 'descr') : null;   // "Văn bản thay thế" của ảnh → alt
        if (moTa && core.nfc(moTa).trim()) o.alt = core.nfc(moTa).replace(/\s+/g, ' ').trim().slice(0, 300);
        var rid = tt(blip, 'embed'), rel = rid ? rels[rid] : null;
        if (rel && rel.target) o.path = rel.target;
        else { var lk = tt(blip, 'link'); o.thieu = (lk && rels[lk] && rels[lk].raw) || rid || 'không rõ'; }
        var xf = tim(pic, 'xfrm'), ext = xf ? con1(xf, 'ext') : null;
        var cx = parseInt(tt(ext || extNeo, 'cx'), 10);
        if (cx > 0) o.width = Math.round(cx / 9525);
        out.push(o);
      });
    });
    return out;
  }
  // các xdr:pic trong một neo (kể cả trong nhóm), bỏ nhánh mc:Fallback để không đếm trùng
  function layPic(node) {
    var out = [];
    (function duyet(n) {
      (n.children || []).forEach(function (k) {
        if (k.type !== 'el') return;
        var t = ln(k.name);
        if (t === 'Fallback') return;
        if (t === 'pic') { out.push(k); return; }
        duyet(k);
      });
    })(node);
    return out;
  }

  /* ===================== Tiêu đề cột ===================== */

  function chuanTieuDe(s) {
    s = core.nfc(s).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[*:]+/g, ' ');
    return core.slugAscii(s).replace(/_/g, ' ');
  }

  var BIET_DANH = {
    stt: ['stt', 'tt', 'so tt', 'so thu tu', 'cau', 'cau so', 'so cau', 'no'],
    loai: ['loai cau', 'loai', 'loai cau hoi', 'dang cau', 'dang cau hoi', 'kieu cau', 'type', 'question type'],
    noiDung: ['noi dung cau hoi', 'noi dung', 'cau hoi', 'de bai', 'noi dung cau', 'question', 'question text'],
    anh: ['anh', 'hinh', 'hinh anh', 'anh minh hoa', 'ten anh', 'tep anh', 'image', 'images', 'picture'],
    dapAn: ['dap an', 'dap an dung', 'answer', 'correct answer', 'key'],
    diem: ['diem', 'so diem', 'diem so', 'points', 'point', 'score'],
    loiGiai: ['loi giai', 'loi giai chi tiet', 'huong dan giai', 'giai thich', 'hdg', 'huong dan cham', 'dap an chi tiet', 'feedback', 'explanation', 'solution'],
    nganHang: ['ngan hang', 'ngan hang cau hoi', 'ten ngan hang', 'bank', 'question bank'],
    mucDo: ['muc do', 'muc do nhan thuc', 'muc do nhan biet', 'level', 'do kho'],
    chuDe: ['chu de', 'chuong', 'bai hoc', 'don vi kien thuc', 'noi dung kien thuc', 'topic'],
    phan: ['phan', 'part']
  };
  var TRA_COT = {};
  Object.keys(BIET_DANH).forEach(function (k) { BIET_DANH[k].forEach(function (b) { TRA_COT[b] = k; }); });
  var CHU = 'ABCDEFGH';

  function khopCot(s) {
    var k = chuanTieuDe(s);
    if (!k) return null;
    if (/^da$/.test(k)) return 'dapAn';
    var m = /^(?:phuong an|pa|lua chon|y|option|choice|dap an)?\s*([a-h])$/.exec(k);
    if (m) return m[1].toUpperCase();
    return HOP.call(TRA_COT, k) ? TRA_COT[k] : null;
  }

  /* ===================== Loại câu, mức độ ===================== */

  var LOAI = {
    'tn': 'mc', 'mot dap an': 'mc', 'trac nghiem': 'mc', 'trac nghiem mot dap an': 'mc', 'mc': 'mc', 'multiple choice': 'mc',
    'nd': 'ma', 'nhieu dap an': 'ma', 'trac nghiem nhieu dap an': 'ma', 'ma': 'ma', 'multiple answers': 'ma',
    'ds': 'tf', 'dung sai': 'tf', 'tf': 'tf', 'true false': 'tf',
    'tln': 'short', 'tra loi ngan': 'short', 'short': 'short', 'short answer': 'short',
    'so': 'num', 'dien so': 'num', 'num': 'num', 'numeric': 'num', 'numerical': 'num',
    'dien': 'blanks', 'dien khuyet': 'blanks', 'dien tu': 'blanks', 'blanks': 'blanks', 'fill in blanks': 'blanks',
    'chon': 'dropdowns', 'chon tu danh sach': 'dropdowns', 'dropdown': 'dropdowns', 'dropdowns': 'dropdowns',
    'ghep': 'matching', 'ghep noi': 'matching', 'matching': 'matching',
    'tl': 'essay', 'tu luan': 'essay', 'essay': 'essay',
    'doan': 'doan', 'doan dan': 'doan', 'passage': 'doan'
  };
  var MUC = {
    'nb': 'NB', 'nhan biet': 'NB', 'biet': 'NB', '1': 'NB', 'muc 1': 'NB',
    'th': 'TH', 'thong hieu': 'TH', 'hieu': 'TH', '2': 'TH', 'muc 2': 'TH',
    'vd': 'VD', 'van dung': 'VD', 'van dung thap': 'VD', '3': 'VD', 'muc 3': 'VD',
    'vdc': 'VDC', 'van dung cao': 'VDC', '4': 'VDC', 'muc 4': 'VDC'
  };
  // 'TN – Một đáp án' | 'TN' | 'Một đáp án' → mã; không nhận ra → undefined
  function traMa(bang, raw) {
    var s = core.nfc(raw).trim();
    if (!s) return null;
    var k = chuanTieuDe(s);
    if (HOP.call(bang, k)) return bang[k];
    var phan = s.split(/\s+[-–—]\s+|\s*[–—:]\s*/);
    for (var i = 0; i < phan.length; i++) { var p = chuanTieuDe(phan[i]); if (p && HOP.call(bang, p)) return bang[p]; }
    var dau = k.split(' ')[0];
    if (HOP.call(bang, dau)) return bang[dau];
    return undefined;
  }

  /* ===================== Đáp án ===================== */

  // 'B' | 'A, C' | 'AC' | 'A và C' → ['A','C']; không phải nhãn → null
  function docNhan(s) {
    var u = core.nfc(s).toUpperCase().trim();
    u = u.replace(/^(?:ĐÁP ÁN|DAP AN|ANSWER|PHƯƠNG ÁN)\s*[:.\-]?\s*|^ĐA\s*[:.\-]\s*/, '');
    u = u.replace(/(^|\s)(?:VÀ|VA|AND|HOẶC|HOAC)(?=\s|$)/g, '$1');
    var t = u.replace(/[\s,;\/&+.|()\-]+/g, '');
    if (!/^[A-H]+$/.test(t)) return null;
    var out = [];
    t.split('').forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); });
    return out;
  }

  var TOKEN_DS = [['ĐÚNG', true], ['DUNG', true], ['SAI', false], ['TRUE', true], ['FALSE', false],
    ['Đ', true], ['D', true], ['S', false], ['T', true], ['F', false]];
  var RE_DS_KHOA = /([A-H])\s*[).:=\-]?\s*(ĐÚNG|DUNG|SAI|TRUE|FALSE|Đ|D|S|T|F)(?!\p{L})/gu;
  function giaTriDS(w) { for (var i = 0; i < TOKEN_DS.length; i++) if (TOKEN_DS[i][0] === w) return TOKEN_DS[i][1]; return undefined; }

  // Đúng/Sai: {khoa:[[k,v]…]} ('a-Đ, b-S', 'a) Đúng b) Sai') và/hoặc {viTri:[v…]} ('ĐSĐS', 'Đúng; Sai')
  function docDS(s) {
    var u = core.nfc(s).toUpperCase().trim(), out = {};
    if (!u) return null;
    var cap = [], m;
    RE_DS_KHOA.lastIndex = 0;
    while ((m = RE_DS_KHOA.exec(u))) cap.push([m[1].toLowerCase(), giaTriDS(m[2])]);
    if (cap.length && /^[\s,;.|\/]*$/.test(u.replace(RE_DS_KHOA, ''))) out.khoa = cap;
    var t = u.replace(/[\s,;.\-\/|()+:]+/g, ''), vals = [], i = 0;
    while (i < t.length) {
      var ok = false;
      for (var j = 0; j < TOKEN_DS.length; j++) {
        if (t.startsWith(TOKEN_DS[j][0], i)) { vals.push(TOKEN_DS[j][1]); i += TOKEN_DS[j][0].length; ok = true; break; }
      }
      if (!ok) { vals = null; break; }
    }
    if (vals && vals.length) out.viTri = vals;
    return out.khoa || out.viTri ? out : null;
  }
  // áp vào danh sách ý → {map} | {loi}
  function apDS(s, keys) {
    var d = docDS(s);
    if (!d) return { loi: 'đáp án Đúng/Sai "' + s + '" không đọc được (ví dụ: ĐSĐS hoặc a-Đ, b-S, c-Đ, d-S)' };
    if (d.khoa) {
      var map = {}, ok = true;
      d.khoa.forEach(function (kv) { if (keys.indexOf(kv[0]) === -1 || HOP.call(map, kv[0])) ok = false; map[kv[0]] = kv[1]; });
      if (ok && keys.every(function (k) { return HOP.call(map, k); })) return { map: map };
    }
    if (d.viTri && d.viTri.length === keys.length) {
      var m2 = {};
      keys.forEach(function (k, i) { m2[k] = d.viTri[i]; });
      return { map: m2 };
    }
    if (d.khoa && !d.viTri) {
      var thieu = keys.filter(function (k) { return !d.khoa.some(function (kv) { return kv[0] === k; }); });
      var la = d.khoa.filter(function (kv) { return keys.indexOf(kv[0]) === -1; }).map(function (kv) { return kv[0]; });
      return { loi: 'đáp án Đúng/Sai "' + s + '"' + (la.length ? ' có ý ' + la.join(', ') + ') không có trong câu' : '') +
        (thieu.length ? ' thiếu ý ' + thieu.join(', ') + ')' : '') };
    }
    var n = d.viTri ? d.viTri.length : d.khoa.length;
    return { loi: 'đáp án Đúng/Sai "' + s + '" có ' + n + ' giá trị nhưng câu có ' + keys.length + ' ý' };
  }

  function docSo(s) {
    var t = core.nfc(s).replace(/−/g, '-').replace(/\s+/g, '');
    if (!/^[-+]?(\d+([.,]\d+)?|[.,]\d+)(e[-+]?\d+)?$/i.test(t)) return null;
    var v = parseFloat(t.replace(',', '.'));
    return isFinite(v) ? v : null;
  }
  // '12,5' | '12,5 ± 0,1' | '1,5 .. 2' → numeric; sai → null
  function docDapAnSo(s, so) {
    if (typeof so === 'number' && isFinite(so)) return { exact: so, margin: 0 };
    s = core.nfc(s).trim();
    if (!s) return null;
    var p = s.split(/\s*(?:±|\+\s*\/\s*-|\+\s*-)\s*/);
    if (p.length === 2) {
      var e = docSo(p[0]), d = docSo(p[1]);
      return e != null && d != null && d >= 0 ? { exact: e, margin: d } : null;
    }
    p = s.split(/\s*(?:\.\.\.?|…)\s*/);
    if (p.length === 2) {
      var a = docSo(p[0]), b = docSo(p[1]);
      return a != null && b != null ? { min: a, max: b } : null;
    }
    var x = docSo(s);
    return x != null ? { exact: x, margin: 0 } : null;
  }
  function coDangSo(s) { return /±|\+\s*\/?\s*-|\.\.|…/.test(s) && docDapAnSo(s) != null; }

  /* ===================== Runs → HTML ===================== */

  function catRuns(runs, x, y) {
    var out = [], pos = 0;
    runs.forEach(function (r) {
      var s = pos, e = pos + r.text.length;
      pos = e;
      var a = Math.max(s, x), b = Math.min(e, y);
      if (a < b) { var c = {}; for (var k in r) if (HOP.call(r, k)) c[k] = r[k]; c.text = r.text.slice(a - s, b - s); out.push(c); }
    });
    return out;
  }
  function noiRuns(runs) { return runs.map(function (r) { return r.text; }).join(''); }
  function khoaDinhDang(r) { return (r.b ? 'b' : '') + (r.i ? 'i' : '') + (r.u ? 'u' : '') + (r.s ? 's' : '') + (r.sup ? '^' : '') + (r.sub ? '_' : ''); }
  function boc(f, t) {
    var h = core.escXml(t);
    if (!f || !/\S/.test(t)) return h;
    if (f.indexOf('_') !== -1) h = '<sub>' + h + '</sub>';
    if (f.indexOf('^') !== -1) h = '<sup>' + h + '</sup>';
    if (f.indexOf('s') !== -1) h = '<del>' + h + '</del>';
    if (f.indexOf('u') !== -1) h = '<u>' + h + '</u>';
    if (f.indexOf('i') !== -1) h = '<em>' + h + '</em>';
    if (f.indexOf('b') !== -1) h = '<strong>' + h + '</strong>';
    return h;
  }

  // $…$ theo quy tắc pandoc (như latex.replaceDollar): sau $ mở không là khoảng trắng; $ đóng (dấu $ kế tiếp)
  // có chữ ngay trước, không có chữ số ngay sau; thêm $$…$$, \(…\), \[…\]; \$ = dấu $ thật
  function timCongThuc(full, a, b, spans) {
    var hop = spans.slice(), i = a;
    function trongSpan(k) { for (var z = 0; z < hop.length; z++) if (k >= hop[z].s && k < hop[z].e) return hop[z]; return null; }
    function chanSau(k) { var m = b; hop.forEach(function (sp) { if (sp.s >= k && sp.s < m) m = sp.s; }); return m; }
    while (i < b) {
      var sp = trongSpan(i);
      if (sp) { i = sp.e; continue; }
      var ch = full.charAt(i), sau = full.charAt(i + 1);
      if (ch === '\\' && sau === '$') { spans.push({ s: i, e: i + 2, kind: 'lit' }); i += 2; continue; }
      if (ch === '\\' && (sau === '(' || sau === '[')) { // \(…\) dòng, \[…\] khối — như latex.replaceDollar
        var kt = full.indexOf(sau === '(' ? '\\)' : '\\]', i + 2);
        if (kt > 0 && kt + 2 <= chanSau(i) && /\S/.test(full.slice(i + 2, kt))) {
          spans.push({ s: i, e: kt + 2, kind: 'math', tex: full.slice(i + 2, kt), display: sau === '[' });
          i = kt + 2; continue;
        }
        i += 2; continue;
      }
      if (ch !== '$') { i++; continue; }
      var hien = full.charAt(i + 1) === '$', mo = hien ? 2 : 1, j = i + mo, gioiHan = chanSau(i), dong = -1;
      if (j >= gioiHan || /\s/.test(full.charAt(j))) { i += mo; continue; }
      // $ đóng = dấu $ chưa thoát ĐẦU TIÊN; không hợp lệ thì $ mở chỉ là chữ thường
      while (j < gioiHan) {
        var c = full.charAt(j);
        if (c === '\\') { j += 2; continue; }
        if (!hien && c === '\n') break;
        if (c === '$') {
          if (hien) { if (full.charAt(j + 1) === '$' && j + 2 <= gioiHan) dong = j; }
          else if (!/\s/.test(full.charAt(j - 1)) && !/[0-9]/.test(full.charAt(j + 1))) dong = j;
          break;
        }
        j++;
      }
      if (dong < 0) { i += mo; continue; }
      spans.push({ s: i, e: dong + mo, kind: 'math', tex: full.slice(i + mo, dong), display: hien });
      i = dong + mo;
    }
  }

  // latex.toMathML(tex, {display, issues}) (dự phòng: replaceDollar(chữ thuần, {html:false, issues}))
  function sangMathML(tex, hien, lx) {
    if (!lx) return { html: null };
    var ds = [];
    try {
      var h;
      if (typeof lx.toMathML === 'function') h = lx.toMathML(tex, { display: hien, issues: ds });
      else if (typeof lx.replaceDollar === 'function') h = lx.replaceDollar((hien ? '$$' : '$') + tex + (hien ? '$$' : '$'), { html: false, issues: ds });
      else return { html: null };
      h = String(h == null ? '' : h);
      if (!h) return { html: null, loi: 'không chuyển được' };
      if (hien && /^<math\b/.test(h) && !/^<math\b[^>]*\sdisplay=/.test(h)) h = h.replace(/^<math\b/, '<math display="block"');
      return { html: h, canh: ds.map(function (x) { return x && x.msg ? x.msg : String(x); }) };
    } catch (e) {
      return { html: null, loi: (e && e.message) || String(e) };
    }
  }

  // runs → {html, plain, boxes:[{id, raw}], loi:[msg]}. o.boxes: tách [[…]] thành [b1]…; o.latex: $…$ → MathML
  function veHtml(runs, o) {
    o = o || {};
    var full = '', moc = [];
    runs.forEach(function (r) { moc.push(full.length); full += r.text; });
    var a = 0, b = full.length;
    while (a < b && /\s/.test(full.charAt(a))) a++;
    while (b > a && /\s/.test(full.charAt(b - 1))) b--;
    var spans = [];
    if (o.boxes) {
      var re = /\[\[([\s\S]*?)\]\]/g, m;
      while ((m = re.exec(full))) if (m.index >= a && re.lastIndex <= b) spans.push({ s: m.index, e: re.lastIndex, kind: 'box', body: m[1] });
    }
    if (o.latex) timCongThuc(full, a, b, spans);
    spans.sort(function (x, y) { return x.s - y.s; });
    var pieces = [], boxes = [], loi = [];
    function day(x, y) {
      for (var k = 0; k < runs.length; k++) {
        var s = Math.max(x, moc[k]), e = Math.min(y, moc[k] + runs[k].text.length);
        if (s >= e) continue;
        var f = khoaDinhDang(runs[k]);
        full.slice(s, e).replace(/\t/g, ' ').split('\n').forEach(function (p, j) {
          if (j) pieces.push({ raw: '<br>' });
          if (p) pieces.push({ f: f, t: p });
        });
      }
    }
    var pos = a;
    spans.forEach(function (sp) {
      day(pos, sp.s);
      if (sp.kind === 'box') {
        var id = 'b' + (boxes.length + 1);
        boxes.push({ id: id, raw: sp.body });
        pieces.push({ raw: '[' + id + ']' });
      } else if (sp.kind === 'lit') {
        pieces.push({ f: '', t: '$' });
      } else {
        var r = sangMathML(sp.tex, sp.display, o.lx);
        if (r.html) { pieces.push({ raw: r.html }); (r.canh || []).forEach(function (m) { loi.push(m); }); }
        else {
          pieces.push({ f: '', t: full.slice(sp.s, sp.e) });
          if (r.loi) loi.push('công thức "' + full.slice(sp.s, sp.e) + '" lỗi: ' + r.loi);
          else if (!o.lx) loi.push('__thieu_latex__');
        }
      }
      pos = sp.e;
    });
    day(pos, b);
    // ghép mảnh cùng định dạng
    var out = '', fHien = null, dem = '';
    function xa() { if (dem) out += boc(fHien, dem); dem = ''; }
    pieces.forEach(function (p) {
      if (p.raw != null) { xa(); fHien = null; out += p.raw; return; }
      if (p.f !== fHien) { xa(); fHien = p.f; }
      dem += p.t;
    });
    xa();
    return { html: out, plain: full.slice(a, b), boxes: boxes, loi: loi };
  }

  /* ===================== Ảnh ===================== */

  function kieuAnh(u) {
    if (!u || u.length < 4) return '?';
    if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47) return 'png';
    if (u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return 'jpg';
    if (u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x38) return 'gif';
    if (u[0] === 0x42 && u[1] === 0x4D) return 'BMP';
    if ((u[0] === 0x49 && u[1] === 0x49 && u[2] === 0x2A) || (u[0] === 0x4D && u[1] === 0x4D && u[3] === 0x2A)) return 'TIFF';
    if (u.length > 12 && u[0] === 0x52 && u[1] === 0x49 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return 'WEBP';
    if (u.length > 44 && u[0] === 0x01 && u[40] === 0x20 && u[41] === 0x45 && u[42] === 0x4D && u[43] === 0x46) return 'EMF';
    if ((u[0] === 0xD7 && u[1] === 0xCD && u[2] === 0xC6 && u[3] === 0x9A) || (u[0] === 0x01 && u[1] === 0x00 && u[2] === 0x09 && u[3] === 0x00)) return 'WMF';
    var dau = String.fromCharCode.apply(null, u.subarray(0, Math.min(256, u.length)));
    if (/<svg\b/i.test(dau)) return 'SVG';
    return '?';
  }
  function toU8(x) { // Buffer của Node → Uint8Array thường (không chép)
    if (x instanceof Uint8Array) return x.constructor === Uint8Array ? x : new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (x && ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    return null;
  }
  function chuanTenAnh(s) { return core.nfc(String(s)).replace(/\\/g, '/').trim().toLowerCase(); }
  function tenGoc(s) { return String(s).replace(/\\/g, '/').replace(/^.*\//, ''); }
  function boDuoi(s) { return s.replace(/\.[a-z0-9]{2,5}$/i, ''); }

  // tra ảnh kèm theo (extraImages) theo tên: đúng khoá → không phân biệt hoa thường → tên file → tên không đuôi
  function taoTraAnh(extra) {
    var ds = [];
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (k) {
        var u = toU8(extra[k]);
        if (u) ds.push({ key: k, data: u, full: chuanTenAnh(k), base: chuanTenAnh(tenGoc(k)) });
      });
    }
    return function (ten) {
      var n = chuanTenAnh(ten), b = chuanTenAnh(tenGoc(ten)), i;
      if (!n) return null;
      for (i = 0; i < ds.length; i++) if (ds[i].key === String(ten).trim()) return ds[i];
      for (i = 0; i < ds.length; i++) if (ds[i].full === n) return ds[i];
      for (i = 0; i < ds.length; i++) if (ds[i].base === b) return ds[i];
      if (!/\.[a-z0-9]{2,5}$/i.test(b)) for (i = 0; i < ds.length; i++) if (boDuoi(ds[i].base) === b) return ds[i];
      return null;
    };
  }

  function theAnh(ten, w, alt) {
    return '<img src="images/' + ten + '" alt="' + core.escHtml(alt || '') + '" style="max-width:100%;height:auto"' + (w ? ' width="' + w + '"' : '') + '>';
  }

  /* ===================== Hàm chính ===================== */

  async function parseXlsx(u8, opts) {
    opts = opts || {};
    var tenFile = String(opts.fileName || '');
    var issues = [];
    function hong(m) { issues.push(core.newIssue('error', m)); return { banks: [], issues: issues }; }
    var goi = '"' + (tenFile || 'Excel') + '"';

    u8 = toU8(u8);
    if (!u8 || !u8.length) return hong('File ' + goi + ' rỗng hoặc không đọc được');
    if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) {
      return hong('File ' + goi + ' không phải định dạng .xlsx (có thể là file .xls đời cũ hoặc file Excel đặt mật khẩu). ' +
        'Hãy mở bằng Excel, bỏ mật khẩu nếu có, rồi Lưu thành "Excel Workbook (*.xlsx)".');
    }
    var files;
    try { files = await layZip().readZip(u8); } catch (e) {
      return hong('Không đọc được file ' + goi + ' — không phải file .xlsx hợp lệ (' + ((e && e.message) || e) + ')');
    }
    var kho = taoKho(files);
    var wbPath = relTheoLoai(docRels(kho, ''), '/officeDocument') || 'xl/workbook.xml';
    var wb = kho.xml(wbPath);
    if (!wb && kho.lay('xl/workbook.xml')) { wbPath = 'xl/workbook.xml'; wb = kho.xml(wbPath); }
    if (!wb) {
      if (kho.lay('xl/workbook.bin') || /\.bin$/i.test(wbPath)) return hong('File ' + goi + ' là dạng Excel nhị phân (.xlsb) — hãy Lưu thành "Excel Workbook (*.xlsx)".');
      return hong('File ' + goi + ' không phải bảng tính Excel (.xlsx)');
    }
    var wbRels = docRels(kho, wbPath);
    var ssX = kho.xml(relTheoLoai(wbRels, '/sharedStrings') || thuMuc(wbPath) + 'sharedStrings.xml');
    var ctx = {
      ss: ssX ? con(ssX, 'si').map(docChuoi) : [],
      richImg: taoRichImg(kho, wbPath, wbRels),
      wpsImg: taoWpsImg(kho, wbPath)
    };

    // trang tính đầu tiên có dòng tiêu đề "Nội dung câu hỏi" (trang hiện trước, trang ẩn sau)
    var sheets = con(con1(wb, 'sheets'), 'sheet');
    sheets = sheets.filter(function (s) { return !tt(s, 'state') || tt(s, 'state') === 'visible'; })
      .concat(sheets.filter(function (s) { return tt(s, 'state') && tt(s, 'state') !== 'visible'; }));
    var tt0 = null;
    for (var si = 0; si < sheets.length && !tt0; si++) {
      var rel = wbRels[tt(sheets[si], 'id')];
      if (!rel || !rel.target) continue;
      var sx = kho.xml(rel.target);
      if (!sx || !tim(sx, 'sheetData')) continue;
      var sh = docTrangTinh(sx, ctx);
      var td = timTieuDe(sh);
      if (td) { tt0 = { sheet: sh, td: td, name: core.nfc(tt(sheets[si], 'name') || ''), path: rel.target }; }
    }
    if (!tt0) {
      return hong('Không tìm thấy dòng tiêu đề có ô "Nội dung câu hỏi" trong 10 dòng đầu của trang tính nào trong ' + goi +
        '. Hãy dùng file mẫu Excel và giữ nguyên dòng tiêu đề.');
    }

    var sheet = tt0.sheet, cot = tt0.td.cot, batDau = tt0.td.batDau, hangTD = tt0.td.hang;
    tt0.td.la.forEach(function (t) { issues.push(core.newIssue('info', 'Cột "' + t + '" không thuộc mẫu — bỏ qua')); });

    // ảnh nổi
    var anhNoi = [];
    if (sheet.drawingRid) {
      var sRels = docRels(kho, tt0.path), dr = sRels[sheet.drawingRid];
      if (dr && dr.target) anhNoi = docAnhNoi(kho, dr.target);
    }

    var lx = layLatex(opts);
    var traAnh = taoTraAnh(opts.extraImages);
    var colChon = CHU.split('').filter(function (L) { return cot[L] != null; });
    var cotThuocTinh = ['loai', 'diem', 'nganHang', 'mucDo', 'chuDe', 'phan'];

    function o(r, c, lan) {
      if (c == null) return null;
      var hang = sheet.rows[r], x = hang ? hang[c] : null;
      if (lan && (!x || !coChu(x))) {
        for (var i = 0; i < sheet.gop.length; i++) {
          var g = sheet.gop[i];
          if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2 && (r !== g.r1 || c !== g.c1)) {
            var h0 = sheet.rows[g.r1];
            return h0 ? h0[g.c1] || null : null;
          }
        }
      }
      return x || null;
    }
    function coChu(x) { return !!x && /\S/.test(x.text); }
    function chu(x) { return x ? x.text.trim() : ''; }

    // ---- đọc từng dòng dữ liệu ----
    var recs = [], nganHangHienTai = null, picTheoDong = [];
    sheet.so.forEach(function (r) {
      if (r < batDau) return;
      var rec = { r: r, chon: {}, pics: [], canhBao: [] };
      Object.keys(cot).forEach(function (k) {
        var x = o(r, cot[k], cotThuocTinh.indexOf(k) !== -1);
        if (!x) return;
        if (x.chuaTinh) rec.canhBao.push('ô ' + x.ref + ' là công thức chưa có giá trị đã tính — mở file bằng Excel rồi lưu lại');
        if (x.loi && !x.anhLoi) rec.canhBao.push('ô ' + x.ref + ' có lỗi "' + x.loi + '" — coi như ô trống');
        if (x.anhLoi) rec.canhBao.push('ô ' + x.ref + ' có ảnh/giá trị đặc biệt không đọc được — hãy chèn ảnh nổi hoặc ghi tên ảnh ở cột Ảnh');
        if (/^[A-H]$/.test(k)) rec.chon[k] = x; else rec[k] = x;
      });
      // ảnh đặt trong ô (mọi cột)
      var hang = sheet.rows[r] || {};
      Object.keys(hang).forEach(function (c) { hang[c].pics.forEach(function (p) { picTheoDong.push(merge(p, { row: r, col: +c })); }); });

      var nh = chu(rec.nganHang);
      if (nh) nganHangHienTai = nh;
      var loaiRaw = chu(rec.loai), loai = traMa(LOAI, loaiRaw);
      var coNoiDung = coChu(rec.noiDung) || colChon.some(function (L) { return coChu(rec.chon[L]); }) ||
        coChu(rec.dapAn) || coChu(rec.loiGiai) || coChu(rec.anh) || loai === 'doan';
      if (!coNoiDung && loaiRaw) {
        // dòng chỉ có loại câu + ảnh (câu hỏi toàn bằng hình)
        coNoiDung = Object.keys(hang).some(function (c) { return hang[c].pics.length; }) ||
          anhNoi.some(function (p) { return p.row === r; });
      }
      if (!coNoiDung) return;
      rec.loaiRaw = loaiRaw;
      rec.loaiMa = loai;
      rec.nganHangTen = nganHangHienTai;
      recs.push(rec);
    });

    // ---- gán ảnh (nổi + trong ô) cho dòng dữ liệu gần nhất phía trên ----
    anhNoi.concat(picTheoDong).forEach(function (p) {
      if (p.row == null) { issues.push(core.newIssue('warn', 'Có ảnh nổi không neo theo ô (absoluteAnchor) — bỏ qua; hãy đặt ảnh vào đúng dòng câu hỏi')); return; }
      if (p.row <= hangTD) {
        issues.push(core.newIssue('info', 'Ảnh ở dòng ' + p.row + ' nằm trên/tại dòng tiêu đề — bỏ qua'));
        return;
      }
      var dich = null;
      for (var i = 0; i < recs.length; i++) { if (recs[i].r <= p.row) dich = recs[i]; else break; }
      if (!dich) dich = recs[0];
      if (dich) dich.pics.push(p);
    });

    // ---- dựng ngân hàng + câu hỏi ----
    var macDinh = tenFile.replace(/^.*[\\/]/, '').replace(/\.(xlsx|xlsm|xltx|xltm|xls)$/i, '').trim() || 'Ngân hàng câu hỏi';
    var banks = [], theoKhoa = {}, anhCuaBank = new Map(), daBaoLatex = false;
    var bankHT = null, doan = '';

    function layBank(ten) {
      var t = core.nfc(ten || macDinh).replace(/\s+/g, ' ').trim(), k = t.toLowerCase();
      if (!theoKhoa[k]) {
        var b = { title: t, ident: core.bankIdent(t), source: { kind: 'xlsx', name: tenFile }, questions: [], images: {}, warnings: [] };
        theoKhoa[k] = b;
        banks.push(b);
        anhCuaBank.set(b, { theoKhoa: {}, n: 0 });
      }
      return theoKhoa[k];
    }

    // đăng ký ảnh vào ngân hàng → {ten, w} | {loi}
    function dangKyAnh(bank, p) {
      var kho2 = anhCuaBank.get(bank), khoa, data, tenHien;
      if (p.extra) { khoa = 'extra:' + p.extra.key; data = p.extra.data; tenHien = p.extra.key; }
      else { khoa = 'zip:' + p.path; data = kho.lay(p.path); tenHien = tenGoc(p.path); }
      if (HOP.call(kho2.theoKhoa, khoa)) return { ten: kho2.theoKhoa[khoa], w: p.width };
      if (!data) return { loi: (p.nguon || 'ảnh') + ' "' + tenHien + '" bị thiếu trong file' };
      var k = kieuAnh(data);
      if (k === '?' || k !== k.toLowerCase()) {
        return { loi: (p.nguon || 'ảnh') + ' "' + tenHien + '"' + (k === '?' ? ' không phải ảnh PNG/JPG/GIF' : ' định dạng ' + k) +
          ' — Canvas không hiển thị được; hãy chuyển thành PNG hoặc JPG' };
      }
      kho2.n++;
      var ten = 'img_' + ('00' + kho2.n).slice(-3) + '.' + k;
      kho2.theoKhoa[khoa] = ten;
      bank.images[ten] = data;
      return { ten: ten, w: p.width };
    }

    function vh(runs, o2) { return veHtml(runs, merge({ latex: true, lx: lx }, o2 || {})); }
    function baoLatex(ds, them) {
      ds.forEach(function (m) {
        if (m === '__thieu_latex__') {
          if (!daBaoLatex) { daBaoLatex = true; issues.push(core.newIssue('info', 'Chưa nạp bộ chuyển công thức (latex.js) — công thức $…$ được giữ nguyên dạng chữ')); }
        } else them(m);
      });
    }

    recs.forEach(function (rec) {
      var bank = layBank(rec.nganHangTen);
      if (bank !== bankHT) { bankHT = bank; doan = ''; }

      if (rec.loaiMa === 'doan') {
        var nd = rec.noiDung ? vh(rec.noiDung.runs) : { html: '', plain: '', loi: [] };
        var canh = function (m, lv) { bank.warnings.push(core.newIssue(lv || 'warn', 'Dòng ' + rec.r + ' (đoạn dẫn): ' + m)); };
        rec.canhBao.forEach(function (m) { canh(m); });
        baoLatex(nd.loi, function (m) { canh(m); });
        var imgs = layAnhDong(rec, bank, function (m) { canh(m, 'error'); }).map(function (a) { return a.html; });
        if (/^-*\s*(het|het doan|het doan dan|ket thuc|ket thuc doan dan|end)\s*-*$/.test(chuanTieuDe(nd.plain).trim()) || (!nd.plain && !imgs.length)) doan = '';
        else doan = (nd.html ? '<p>' + nd.html + '</p>' : '') + imgs.map(function (h) { return '<p>' + h + '</p>'; }).join('');
        return;
      }
      bank.questions.push(dungCau(rec, bank, doan));
    });

    // ảnh của một dòng → [{html, col}], báo lỗi qua bao()
    function layAnhDong(rec, bank, bao) {
      var ds = [];
      if (rec.anh && coChu(rec.anh)) {
        rec.anh.text.split(/[;\n]+/).forEach(function (t) {
          t = t.trim();
          if (!t) return;
          var e = traAnh(t);
          if (!e) { bao('không tìm thấy ảnh "' + t + '" — hãy kéo thả ảnh này (hoặc thư mục/zip chứa nó) cùng file Excel'); return; }
          ds.push({ extra: e, col: cot.anh, nguon: 'ảnh' });
        });
      }
      rec.pics.forEach(function (p) {
        if (!p.path) { bao((p.nguon || 'ảnh') + ' liên kết ngoài "' + p.thieu + '" không có trong file — hãy chèn ảnh trực tiếp'); return; }
        ds.push(p);
      });
      var out = [];
      ds.forEach(function (p) {
        var r = dangKyAnh(bank, p);
        if (r.loi) bao(r.loi); else out.push({ html: theAnh(r.ten, r.w, p.alt), col: p.col });
      });
      return out;
    }

    function dungCau(rec, bank, stimulus) {
      var seq = bank.questions.length + 1;
      var id = 'q' + (seq < 10 ? '0' + seq : String(seq));
      var no = chu(rec.stt).replace(/^(câu|cau|question)\s*/i, '').replace(/[.:)]+$/, '').trim() || String(seq);
      var own = [], daBaoDapAn = false;
      function bao(lv, m) { own.push(core.newIssue(lv, 'Dòng ' + rec.r + ': ' + m, id)); }
      function loiDA(m) { daBaoDapAn = true; bao('error', m); }
      rec.canhBao.forEach(function (m) { bao('warn', m); });

      // mức độ, chủ đề, điểm
      var mucRaw = chu(rec.mucDo), muc = mucRaw ? traMa(MUC, mucRaw) : '';
      if (muc === undefined) { bao('warn', 'mức độ "' + mucRaw + '" không nhận ra (dùng NB, TH, VD, VDC) — bỏ qua'); muc = ''; }
      var diemRaw = chu(rec.diem), points = 1;
      if (diemRaw) {
        var pv = core.parsePoints(diemRaw);
        if (pv == null) bao('error', 'điểm "' + diemRaw + '" không hợp lệ (ví dụ: 1 hoặc 0,25)');
        else points = pv;
      }

      // loại câu
      var type = rec.loaiMa;
      if (type === undefined) { bao('error', 'loại câu "' + rec.loaiRaw + '" không hợp lệ (dùng TN, NĐ, ĐS, TLN, SỐ, ĐIỀN, CHỌN, GHÉP, TL, ĐOẠN)'); type = null; }
      var dapAn = chu(rec.dapAn);
      var ndRuns = rec.noiDung ? rec.noiDung.runs : [];
      var ndPlain = noiRuns(ndRuns);
      var chonCo = colChon.filter(function (L) { return coChu(rec.chon[L]); });
      var tuDong = !type;
      if (tuDong) type = doanLoai();

      function doanLoai() {
        var hop = ndPlain.match(/\[\[[\s\S]*?\]\]/g);
        if (hop) return hop.some(function (h) { return h.slice(2, -2).split('|').some(function (x) { return /^\s*\*/.test(x); }); }) ? 'dropdowns' : 'blanks';
        if (chonCo.length) {
          // đáp án dạng nhãn thắng (phương án toán học có thể chứa "x → 0"); ghép nối cần ≥ 2 ô có mũi tên
          var nhan = dapAn ? docNhan(dapAn) : null;
          if (nhan) return nhan.length >= 2 ? 'ma' : 'mc';
          if (dapAn && docDS(dapAn)) return 'tf';
          if (chonCo.filter(function (L) { return timMuiTen(rec.chon[L].text); }).length >= 2) return 'matching';
          return chonCo.filter(function (L) { return /^\s*\*/.test(rec.chon[L].text); }).length >= 2 ? 'ma' : 'mc';
        }
        if (dapAn) return coDangSo(dapAn) ? 'num' : 'short';
        return 'essay';
      }

      // ảnh: theo cột neo — cột phương án → phương án/ý/vế trái; cột Lời giải → lời giải; còn lại → nội dung
      var anhTheoCot = layAnhDong(rec, bank, function (m) { bao('error', m); });
      var coChonCot = type === 'mc' || type === 'ma' || type === 'tf' || type === 'matching';
      var anhStem = [], anhFb = [], anhChon = {};
      anhTheoCot.forEach(function (a) {
        var L = null;
        colChon.forEach(function (x) { if (cot[x] === a.col) L = x; });
        if (L && coChonCot) (anhChon[L] = anhChon[L] || []).push(a.html);
        else if (a.col != null && a.col === cot.loiGiai) anhFb.push(a.html);
        else anhStem.push(a.html);
      });

      var nd = vh(ndRuns, { boxes: type === 'blanks' || type === 'dropdowns' });
      baoLatex(nd.loi, function (m) { bao('warn', m); });
      var stem = (nd.html ? '<p>' + nd.html + '</p>' : '') + anhStem.map(function (h) { return '<p>' + h + '</p>'; }).join('');

      var lg = rec.loiGiai ? vh(rec.loiGiai.runs) : { html: '', loi: [] };
      baoLatex(lg.loi, function (m) { bao('warn', m); });
      var feedback = (lg.html ? '<p>' + lg.html + '</p>' : '') + anhFb.map(function (h) { return '<p>' + h + '</p>'; }).join('');

      var q = {
        id: id, no: no, title: 'Câu ' + no + (muc ? ' [' + muc + ']' : ''), type: type, points: points,
        stimulus: stimulus || '', stem: stem
      };

      // ô phương án → {L, runs (đã bỏ nhãn/dấu *), sao}
      function oChon(L) {
        var x = rec.chon[L], runs = x ? x.runs : [], full = noiRuns(runs), sao = false, m;
        m = /^\s*\*\s*/.exec(full);
        if (m) { sao = true; runs = catRuns(runs, m[0].length, full.length); full = noiRuns(runs); }
        m = /^\s*\(?([A-Ha-h])\s*[.):]\s*/.exec(full);
        if (m && m[1].toUpperCase() === L) { runs = catRuns(runs, m[0].length, full.length); full = noiRuns(runs); }
        m = /^\s*\*\s*/.exec(full);
        if (m && !sao) { sao = true; runs = catRuns(runs, m[0].length, full.length); }
        return { L: L, runs: runs, sao: sao };
      }
      function htmlChon(runs, L) {
        var r = vh(runs);
        baoLatex(r.loi, function (m) { bao('warn', m); });
        return [r.html].concat(anhChon[L] || []).filter(Boolean).join('<br>');
      }
      var dsChon = colChon.filter(function (L) { return coChu(rec.chon[L]) || anhChon[L]; });
      function baoLo() {
        if (!dsChon.length) return;
        var cuoi = colChon.indexOf(dsChon[dsChon.length - 1]);
        var lo = colChon.slice(0, cuoi + 1).filter(function (L) { return dsChon.indexOf(L) === -1; });
        if (lo.length) bao('warn', 'bỏ trống phương án ' + lo.join(', ') + ' nằm giữa các phương án khác');
      }
      function boQuaChon(ten) { if (chonCo.length) bao('warn', 'các ô phương án ' + chonCo.join(', ') + ' bị bỏ qua với câu ' + ten); }

      if (type === 'mc' || type === 'ma') {
        baoLo();
        var cs = dsChon.map(oChon);
        var dung = null;
        if (dapAn) {
          var nhan = docNhan(dapAn);
          if (!nhan) { // so với nội dung phương án
            var k = core.nfc(dapAn).replace(/\s+/g, ' ').trim().toLowerCase();
            var trung = cs.filter(function (c) { return noiRuns(c.runs).replace(/\s+/g, ' ').trim().toLowerCase() === k; });
            if (trung.length === 1) nhan = [trung[0].L];
          }
          if (!nhan) loiDA('đáp án "' + dapAn + '" không hợp lệ — ghi nhãn phương án (ví dụ: B hoặc A, C)');
          else {
            var thieu = nhan.filter(function (L) { return dsChon.indexOf(L) === -1; });
            if (thieu.length) loiDA('đáp án là ' + thieu.join(', ') + ' nhưng ' + thieu.map(function (L) { return colChon.indexOf(L) === -1 ? 'không có cột phương án ' + L : 'ô phương án ' + L + ' đang trống'; }).join(', '));
            dung = nhan;
            var saoL = cs.filter(function (c) { return c.sao; }).map(function (c) { return c.L; });
            if (saoL.length && saoL.join() !== nhan.slice().sort().join()) bao('warn', 'đánh dấu * (' + saoL.join(', ') + ') khác cột Đáp án (' + nhan.join(', ') + ') — dùng cột Đáp án');
          }
        } else {
          dung = cs.filter(function (c) { return c.sao; }).map(function (c) { return c.L; });
        }
        q.choices = cs.map(function (c) { return { id: c.L, html: htmlChon(c.runs, c.L), correct: !!dung && dung.indexOf(c.L) !== -1 }; });
      } else if (type === 'tf') {
        baoLo();
        var keys = dsChon.map(function (L) { return L.toLowerCase(); });
        var map = null;
        if (dapAn) {
          var kq = apDS(dapAn, keys);
          if (kq.loi) loiDA(kq.loi); else map = kq.map;
        } else if (keys.length) loiDA('chưa có đáp án Đúng/Sai ở cột Đáp án (ví dụ: ĐSĐS)');
        q.statements = dsChon.map(function (L) {
          var c = oChon(L), k = L.toLowerCase(), s = { key: k, html: htmlChon(c.runs, L), value: undefined };
          if (map) s.value = map[k];
          return s;
        });
      } else if (type === 'short') {
        boQuaChon('trả lời ngắn');
        q.answers = core.answerVariants(dapAn.split(/[;|]/).map(function (s) { return s.trim(); }).filter(Boolean));
      } else if (type === 'num') {
        boQuaChon('điền số');
        var nu = dapAn ? docDapAnSo(dapAn, rec.dapAn && rec.dapAn.kind === 'n' ? rec.dapAn.num : null) : null;
        if (!dapAn) loiDA('chưa có đáp án số ở cột Đáp án (ví dụ: 12,5 hoặc 12,5 ± 0,1 hoặc 1,5 .. 2)');
        else if (!nu) loiDA('đáp án số "' + dapAn + '" không hợp lệ (ví dụ: 12,5 hoặc 12,5 ± 0,1 hoặc 1,5 .. 2)');
        if (nu) q.numeric = nu;
      } else if (type === 'blanks' || type === 'dropdowns') {
        boQuaChon(type === 'blanks' ? 'điền khuyết' : 'chọn từ danh sách');
        if (!nd.boxes.length) loiDA('chưa có ô [[…]] trong nội dung câu hỏi' + (type === 'blanks' ? ' (ví dụ: Thủ đô là [[Hà Nội]])' : ' (ví dụ: [[*Hà Nội|Huế|Đà Nẵng]])'));
        var arr = nd.boxes.map(function (bx) {
          var ops = bx.raw.split('|').map(function (s) { return s.trim(); });
          var sao = [];
          ops.forEach(function (s, i) { if (/^\*/.test(s)) sao.push(i); });
          if (type === 'blanks') {
            if (sao.length) loiDA('ô [[' + bx.raw + ']] có dấu * (ô chọn) trong câu điền khuyết — bỏ dấu * hoặc đổi loại câu thành CHỌN');
            return { id: bx.id, accepts: core.answerVariants(ops.filter(Boolean)) };
          }
          var ops2 = ops.map(function (s) { return s.replace(/^\*\s*/, ''); });
          if (!sao.length) loiDA('ô [[' + bx.raw + ']] chưa đánh dấu lựa chọn đúng bằng dấu * (ví dụ: [[*Hà Nội|Huế]]) — câu đã có ô chọn thì mọi ô đều phải là ô chọn');
          else if (sao.length > 1) loiDA('ô [[' + bx.raw + ']] có ' + sao.length + ' lựa chọn đánh dấu * (chỉ được 1)');
          var d = { id: bx.id, options: ops2, correct: sao.length === 1 ? sao[0] : undefined };
          if (d.correct === undefined) delete d.correct;
          return d;
        });
        if (type === 'blanks') q.blanks = arr; else q.dropdowns = arr;
      } else if (type === 'matching') {
        var pairs = [], nhieu = [];
        dsChon.forEach(function (L) {
          var x = rec.chon[L], runs = x ? x.runs : [], full = noiRuns(runs);
          var m = timMuiTen(full);
          if (!m) {
            if (anhChon[L]) bao('warn', 'ảnh ở ô ' + L + ' bị bỏ qua — vế phải gây nhiễu chỉ được là chữ');
            var t = full.replace(/\s+/g, ' ').trim(), mn = /^nhi[eễ]u\s*:\s*/i.exec(core.nfc(t));
            if (mn) core.nfc(t).slice(mn[0].length).split(';').forEach(function (s) { s = s.trim(); if (s) nhieu.push(s); });
            else if (t) nhieu.push(t);
            return;
          }
          var trai = htmlChon(catRuns(runs, 0, m.index), L);
          var phai = full.slice(m.end).replace(/\s+/g, ' ').trim();
          pairs.push({ left: trai, right: phai });
        });
        if (dapAn) bao('info', 'cột Đáp án được bỏ qua với câu ghép nối (cặp đúng ghi ngay trong ô: trái => phải)');
        q.pairs = pairs;
        q.distractors = nhieu;
      } else if (type === 'essay') {
        boQuaChon('tự luận');
        if (tuDong) bao('info', 'chưa có đáp án → tự luận, giáo viên chấm tay');
        if (dapAn) {
          var da = vh(rec.dapAn.runs);
          baoLatex(da.loi, function (m) { bao('warn', m); });
          feedback = '<p>' + da.html + '</p>' + feedback;
        }
      }
      q.feedback = feedback;
      q.meta = { level: muc || '', topic: chu(rec.chuDe), part: chu(rec.phan), tags: [] };
      q.src = { sheet: tt0.name, row: rec.r };

      // kiểm tra bất biến (core) — đổi tiền tố "Câu N:" thành "Dòng R:"
      var kiem = core.validateQuestion(q).filter(function (x) {
        return !(daBaoDapAn && /chưa xác định|chưa có đáp án|chưa có ô (điền|chọn) nào/.test(x.msg));
      }).map(function (x) {
        return core.newIssue(x.level, 'Dòng ' + rec.r + ': ' + x.msg.replace(/^Câu [^:]*:\s*/, ''), id);
      });
      q.issues = own.concat(kiem);
      return q;
    }

    var tong = 0;
    banks = banks.filter(function (b) {
      if (!b.questions.length) {
        issues.push(core.newIssue('warn', 'Ngân hàng "' + b.title + '" không có câu hỏi nào — bỏ qua'));
        return false;
      }
      tong += b.questions.length;
      return true;
    });
    if (!tong) issues.push(core.newIssue('error', 'Không có câu hỏi nào dưới dòng tiêu đề (dòng ' + hangTD + ') của trang tính "' + tt0.name + '"'));
    return { banks: banks, issues: issues };
  }

  // mũi tên ghép nối theo thứ tự ưu tiên "=>", "⇒", "->", "→" ("→" hay là kí hiệu toán: "x → 0")
  // → {index, end} bao cả khoảng trắng hai bên
  var MUI_TEN = ['=>', '⇒', '->', '→'];
  function timMuiTen(s) {
    for (var i = 0; i < MUI_TEN.length; i++) {
      var k = s.indexOf(MUI_TEN[i]);
      if (k === -1) continue;
      var a = k, b = k + MUI_TEN[i].length;
      while (a > 0 && /\s/.test(s.charAt(a - 1))) a--;
      while (b < s.length && /\s/.test(s.charAt(b))) b++;
      return { index: a, end: b };
    }
    return null;
  }

  function merge(a, b) { var o = {}, k; for (k in a) if (HOP.call(a, k)) o[k] = a[k]; for (k in b) if (HOP.call(b, k)) o[k] = b[k]; return o; }

  // dòng tiêu đề: trong 10 dòng đầu (hoặc 10 dòng có dữ liệu đầu tiên) có ô "Nội dung câu hỏi"
  function timTieuDe(sh) {
    var dem = 0;
    for (var i = 0; i < sh.so.length; i++) {
      var r = sh.so[i], hang = sh.rows[r];
      var coDL = Object.keys(hang).some(function (c) { return /\S/.test(hang[c].text); });
      if (coDL) dem++;
      if (r > 10 && dem > 10) break;
      var cot = {}, la = [], thay = false, soCot = 0;
      Object.keys(hang).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) {
        var t = hang[c].text.trim();
        if (!t) return;
        var k = khopCot(t);
        if (k === 'noiDung') thay = true;
        if (k && cot[k] == null) { cot[k] = c; soCot++; }
        else if (!k) la.push(t.replace(/\s+/g, ' '));
      });
      // cần thêm ít nhất một cột mẫu khác (tránh nhầm bảng giải thích cột ở trang Hướng dẫn)
      if (!thay || soCot < 2) continue;
      var batDau = r + 1;
      // tiêu đề 2 tầng: dòng dưới chứa A, B, C… (ô "Phương án" gộp ở trên)
      var duoi = sh.rows[r + 1];
      if (duoi) {
        var them = {}, n = 0, khac = false;
        Object.keys(duoi).forEach(function (c) {
          var t = duoi[c].text.trim();
          if (!t) return;
          var k = khopCot(t);
          if (k && /^[A-H]$/.test(k) && cot[k] == null) { them[k] = +c; n++; } else khac = true;
        });
        if (n >= 2 && !khac) {
          Object.keys(them).forEach(function (k) { cot[k] = them[k]; });
          la = la.filter(function (t) { return !/^(phuong an|cac phuong an|lua chon|y|cac y|options?|choices?)$/.test(chuanTieuDe(t)); });
          batDau = r + 2;
        }
      }
      return { hang: r, cot: cot, batDau: batDau, la: la };
    }
    return null;
  }

  return {
    parseXlsx: parseXlsx,
    // nội bộ — để kiểm thử
    _docDS: docDS, _apDS: apDS, _docNhan: docNhan, _docDapAnSo: docDapAnSo, _khopCot: khopCot,
    _traLoai: function (s) { return traMa(LOAI, s); }, _traMuc: function (s) { return traMa(MUC, s); },
    _veHtml: veHtml, _giaiX: giaiX, _soSangChu: soSangChu, _kieuAnh: kieuAnh
  };
});
