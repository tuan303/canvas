/* js/zip.js — đọc/ghi file zip (stored + deflate), tên file UTF-8 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.zip = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var laNode = typeof module === 'object' && module.exports && typeof require === 'function';
  var core = laNode ? require('./core.js') : root.NH.core;

  // Node: dùng zlib; trình duyệt: CompressionStream/DecompressionStream; máy cũ: giải nén bằng JS
  var zlib = null;
  try {
    if (laNode && typeof process === 'object' && process.versions && process.versions.node) zlib = require('zlib');
  } catch (e) { zlib = null; }

  var dongCo = null; // ép động cơ khi test: 'zlib' | 'stream' | 'js'
  function chonDongCo() {
    if (dongCo) return dongCo;
    if (zlib) return 'zlib';
    if (typeof DecompressionStream === 'function') return 'stream';
    return 'js';
  }
  function setEngine(ten) {
    if (ten != null && ['zlib', 'stream', 'js'].indexOf(ten) === -1) throw new Error('Động cơ không hợp lệ: ' + ten);
    if (ten === 'zlib' && !zlib) throw new Error('Không có zlib');
    dongCo = ten || null;
    return chonDongCo();
  }

  /* ---------- tiện ích byte ---------- */

  function toU8(x) {
    if (x == null) return new Uint8Array(0);
    if (typeof x === 'string') return core.utf8Encode(x);
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if (Array.isArray(x)) return Uint8Array.from(x);
    throw new Error('Dữ liệu không phải Uint8Array/chuỗi');
  }
  // Buffer của Node → Uint8Array thường (không chép)
  function view(b) { return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); }

  function noi(parts, total) {
    if (total == null) { total = 0; for (var i = 0; i < parts.length; i++) total += parts[i].length; }
    var out = new Uint8Array(total), o = 0;
    for (var j = 0; j < parts.length; j++) { out.set(parts[j], o); o += parts[j].length; }
    return out;
  }

  async function quaStream(u8, ts) {
    var w = ts.writable.getWriter();
    w.write(u8).catch(function () {});
    w.close().catch(function () {});
    var r = ts.readable.getReader(), parts = [], total = 0;
    for (;;) {
      var x = await r.read();
      if (x.done) break;
      parts.push(x.value); total += x.value.length;
    }
    return noi(parts, total);
  }

  /* ---------- giải nén deflate bằng JS (dự phòng cho trình duyệt cũ) ---------- */

  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
    4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  // Bảng Huffman chuẩn tắc: số mã theo độ dài + ký hiệu xếp theo mã
  function taoBang(lens, off, num) {
    var counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(num), i;
    for (i = 0; i < num; i++) counts[lens[off + i]]++;
    counts[0] = 0;
    for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    for (i = 0; i < num; i++) if (lens[off + i]) syms[offs[lens[off + i]]++] = i;
    return { counts: counts, syms: syms };
  }
  var bangCoDinh = null;
  function bangTinh() {
    if (!bangCoDinh) {
      var l = new Uint8Array(288), d = new Uint8Array(30), i;
      for (i = 0; i < 144; i++) l[i] = 8;
      for (; i < 256; i++) l[i] = 9;
      for (; i < 280; i++) l[i] = 7;
      for (; i < 288; i++) l[i] = 8;
      for (i = 0; i < 30; i++) d[i] = 5;
      bangCoDinh = [taoBang(l, 0, 288), taoBang(d, 0, 30)];
    }
    return bangCoDinh;
  }

  function inflateJs(src, size) {
    var pos = 0, bb = 0, bc = 0, op = 0;
    var out = new Uint8Array(size > 0 ? size : Math.max(1024, src.length * 4));
    function hong(m) { return new Error('Dữ liệu nén bị hỏng: ' + m); }
    function can(n) {
      if (op + n > out.length) {
        var nb = new Uint8Array(Math.max(out.length * 2, op + n));
        nb.set(out.subarray(0, op)); out = nb;
      }
    }
    function bits(n) {
      while (bc < n) {
        if (pos >= src.length) throw hong('bị cụt');
        bb |= src[pos++] << bc; bc += 8;
      }
      var v = bb & ((1 << n) - 1);
      bb >>>= n; bc -= n;
      return v;
    }
    function giai(t) {
      var sum = 0, cur = 0, len = 0, counts = t.counts;
      do {
        if (bc === 0) { if (pos >= src.length) throw hong('bị cụt'); bb = src[pos++]; bc = 8; }
        cur = 2 * cur + (bb & 1); bb >>>= 1; bc--;
        if (++len > 15) throw hong('mã Huffman sai');
        sum += counts[len]; cur -= counts[len];
      } while (cur >= 0);
      return t.syms[sum + cur];
    }
    var cuoi;
    do {
      cuoi = bits(1);
      var kieu = bits(2);
      if (kieu === 0) { // khối không nén: về ranh giới byte
        bb = 0; bc = 0;
        if (pos + 4 > src.length) throw hong('bị cụt');
        var len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8);
        if ((len ^ 0xffff) !== nlen) throw hong('độ dài khối sai');
        pos += 4;
        if (pos + len > src.length) throw hong('bị cụt');
        can(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
      } else if (kieu === 1 || kieu === 2) {
        var lt, dt;
        if (kieu === 1) { var bt = bangTinh(); lt = bt[0]; dt = bt[1]; }
        else {
          var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4, i;
          var cl = new Uint8Array(19);
          for (i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
          var clt = taoBang(cl, 0, 19), tong = hlit + hdist, lens = new Uint8Array(tong);
          for (i = 0; i < tong;) {
            var sym = giai(clt);
            if (sym < 16) { lens[i++] = sym; continue; }
            var lap, gt = 0;
            if (sym === 16) { if (!i) throw hong('lặp không có giá trị trước'); gt = lens[i - 1]; lap = 3 + bits(2); }
            else if (sym === 17) lap = 3 + bits(3);
            else lap = 11 + bits(7);
            if (i + lap > tong) throw hong('độ dài mã vượt giới hạn');
            while (lap--) lens[i++] = gt;
          }
          lt = taoBang(lens, 0, hlit); dt = taoBang(lens, hlit, hdist);
        }
        for (;;) {
          var s = giai(lt);
          if (s < 256) { if (op >= out.length) can(1); out[op++] = s; continue; }
          if (s === 256) break;
          s -= 257;
          if (s >= 29) throw hong('mã độ dài sai');
          var l = LBASE[s] + bits(LEXT[s]);
          var ds = giai(dt);
          if (ds >= 30) throw hong('mã khoảng cách sai');
          var d = DBASE[ds] + bits(DEXT[ds]);
          if (d > op) throw hong('khoảng cách vượt dữ liệu');
          can(l);
          for (var k = 0; k < l; k++, op++) out[op] = out[op - d];
        }
      } else throw hong('kiểu khối không hợp lệ');
    } while (!cuoi);
    return op === out.length ? out : out.subarray(0, op);
  }

  /* ---------- nén / giải nén deflate thô ---------- */

  // Giải nén deflate thô → Promise<Uint8Array>. size: kích thước gốc (nếu biết)
  async function inflateRaw(u8, size) {
    u8 = toU8(u8);
    var e = chonDongCo(), loi = null;
    try {
      if (e === 'zlib') return view(zlib.inflateRawSync(u8));
      if (e === 'stream') {
        var ds = null;
        try { ds = new DecompressionStream('deflate-raw'); } catch (x) { ds = null; }
        if (ds) return await quaStream(u8, ds);
      }
    } catch (x) { loi = x; }
    // dự phòng (và thử lại khi zlib/stream từ chối, vd. có byte thừa sau khối cuối)
    try { return inflateJs(u8, size); } catch (x) { throw loi || x; }
  }

  // Nén deflate thô → Promise<Uint8Array|null> (null: môi trường không nén được → lưu nguyên)
  async function deflateRaw(u8) {
    u8 = toU8(u8);
    var e = chonDongCo();
    if (e === 'zlib') return view(zlib.deflateRawSync(u8));
    if (e === 'stream' && typeof CompressionStream === 'function') {
      var cs = null;
      try { cs = new CompressionStream('deflate-raw'); } catch (x) { cs = null; }
      if (cs) return quaStream(u8, cs);
      // Chrome cũ chỉ có 'deflate' (zlib): bỏ 2 byte đầu + 4 byte adler32 cuối
      try { cs = new CompressionStream('deflate'); } catch (x) { cs = null; }
      if (cs) { var z = await quaStream(u8, cs); return z.subarray(2, z.length - 4); }
    }
    return null;
  }

  /* ---------- ghi zip ---------- */

  var SIG_LOCAL = 0x04034b50, SIG_CEN = 0x02014b50, SIG_END = 0x06054b50;
  var CO_UTF8 = 0x0800;
  var DA_NEN = /\.(png|jpe?g|gif|webp|zip|docx|xlsx|pptx|mp3|mp4|m4a|ogg|webm|woff2?|gz|7z)$/i;

  function chuanHoaDuongDan(p) {
    p = String(p == null ? '' : p).replace(/\\/g, '/');
    while (/^(\.\/|\/)/.test(p)) p = p.replace(/^(\.\/|\/)/, '');
    return p;
  }

  // Ngày giờ DOS (giờ địa phương, giây chẵn, năm 1980–2107)
  function dosTime(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date(1980, 0, 1);
    var y = d.getFullYear();
    if (y < 1980) return { time: 0, date: (1 << 5) | 1 };
    if (y > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 };
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  /*
   * writeZip([{path, data, date?}], {compress:true, date?}) → Promise<Uint8Array>
   * Nén deflate khi có lợi, ngược lại lưu nguyên; luôn bật cờ UTF-8 cho tên file.
   */
  async function writeZip(files, opts) {
    opts = opts || {};
    var nen = opts.compress !== false;
    var ngay = opts.date instanceof Date ? opts.date : new Date();
    var parts = [], cen = [], offset = 0, daCo = {};
    files = files || [];
    if (files.length > 0xFFFF) throw new Error('Quá nhiều file trong zip (tối đa 65535)');
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var path = chuanHoaDuongDan(f.path);
      if (!path) throw new Error('Thiếu tên file trong zip (mục ' + (i + 1) + ')');
      if (daCo[path]) throw new Error('Trùng tên file trong zip: ' + path);
      daCo[path] = 1;
      var laThuMuc = path.charAt(path.length - 1) === '/';
      var data = laThuMuc ? new Uint8Array(0) : toU8(f.data);
      var crc = core.crc32(data), method = 0, body = data;
      if (nen && data.length > 0 && !laThuMuc && !DA_NEN.test(path)) {
        var z = await deflateRaw(data);
        if (z && z.length < data.length) { method = 8; body = z; }
      }
      var ten = core.utf8Encode(path);
      var dt = dosTime(f.date instanceof Date ? f.date : ngay);
      if (offset + 30 + ten.length + body.length > 0xFFFFFFFF) throw new Error('Gói zip quá lớn (> 4 GB)');

      var h = new Uint8Array(30 + ten.length), v = new DataView(h.buffer);
      v.setUint32(0, SIG_LOCAL, true);
      v.setUint16(4, 20, true);          // phiên bản cần để giải nén
      v.setUint16(6, CO_UTF8, true);
      v.setUint16(8, method, true);
      v.setUint16(10, dt.time, true);
      v.setUint16(12, dt.date, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, body.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, ten.length, true);
      v.setUint16(28, 0, true);
      h.set(ten, 30);

      var c = new Uint8Array(46 + ten.length), w = new DataView(c.buffer);
      w.setUint32(0, SIG_CEN, true);
      w.setUint16(4, 20, true);          // tạo bởi: MS-DOS, phiên bản 2.0
      w.setUint16(6, 20, true);
      w.setUint16(8, CO_UTF8, true);
      w.setUint16(10, method, true);
      w.setUint16(12, dt.time, true);
      w.setUint16(14, dt.date, true);
      w.setUint32(16, crc, true);
      w.setUint32(20, body.length, true);
      w.setUint32(24, data.length, true);
      w.setUint16(28, ten.length, true);
      // 30: extra, 32: comment, 34: đĩa, 36: thuộc tính trong = 0
      w.setUint32(38, laThuMuc ? 0x10 : 0, true); // thuộc tính ngoài: 0x10 = thư mục
      w.setUint32(42, offset, true);
      c.set(ten, 46);

      parts.push(h, body);
      cen.push(c);
      offset += h.length + body.length;
    }
    var cenSize = 0;
    for (var k = 0; k < cen.length; k++) { parts.push(cen[k]); cenSize += cen[k].length; }
    var e = new Uint8Array(22), ev = new DataView(e.buffer);
    ev.setUint32(0, SIG_END, true);
    ev.setUint16(8, cen.length, true);
    ev.setUint16(10, cen.length, true);
    ev.setUint32(12, cenSize, true);
    ev.setUint32(16, offset, true);
    parts.push(e);
    return noi(parts);
  }

  /* ---------- đọc zip ---------- */

  function latin1(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, u8.subarray(i, i + 4096));
    return s;
  }
  var _decChat = null;
  function utf8Chat(u8) { // ném lỗi nếu không phải UTF-8 hợp lệ
    if (!_decChat) _decChat = new TextDecoder('utf-8', { fatal: true });
    return _decChat.decode(u8);
  }
  function timExtra(extra, id) {
    var dv = new DataView(extra.buffer, extra.byteOffset, extra.byteLength), p = 0;
    while (p + 4 <= extra.length) {
      var hid = dv.getUint16(p, true), len = dv.getUint16(p + 2, true);
      if (hid === id) return extra.subarray(p + 4, Math.min(extra.length, p + 4 + len));
      p += 4 + len;
    }
    return null;
  }
  function u64(dv, p) { return dv.getUint32(p, true) + dv.getUint32(p + 4, true) * 4294967296; }

  function docTen(nameB, flags, extra) {
    if (flags & CO_UTF8) return core.utf8Decode(nameB);
    var up = timExtra(extra, 0x7075); // Info-ZIP Unicode Path
    if (up && up.length > 5 && up[0] === 1) {
      var dv = new DataView(up.buffer, up.byteOffset, up.byteLength);
      if (dv.getUint32(1, true) === core.crc32(nameB)) { try { return utf8Chat(up.subarray(5)); } catch (e) { /* bỏ qua */ } }
    }
    var ascii = true;
    for (var i = 0; i < nameB.length; i++) if (nameB[i] > 0x7f) { ascii = false; break; }
    if (ascii) return latin1(nameB);
    // nhiều công cụ (vd. macOS) ghi UTF-8 mà không bật cờ → thử UTF-8 chặt trước
    try { return utf8Chat(nameB); } catch (e) { return latin1(nameB); }
  }

  function timCuoi(u8, dv) {
    var min = Math.max(0, u8.length - 22 - 0xFFFF);
    for (var p = u8.length - 22; p >= min; p--) {
      if (u8[p] === 0x50 && u8[p + 1] === 0x4b && dv.getUint32(p, true) === SIG_END) return p;
    }
    return -1;
  }

  /*
   * readZip(u8) → Promise<{ [path]: Uint8Array }>
   * Bỏ thư mục và rác __MACOSX/; chuẩn hoá '\' → '/'; kiểm tra CRC.
   */
  async function readZip(input) {
    try { return await docZip(toU8(input)); }
    catch (e) { if (e instanceof RangeError) throw new Error('File zip bị hỏng hoặc bị cụt'); throw e; }
  }
  async function docZip(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var eocd = u8.length >= 22 ? timCuoi(u8, dv) : -1;
    if (eocd < 0) throw new Error('Không phải file zip hợp lệ (không tìm thấy mục lục cuối file)');
    var cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
    if (cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF || dv.getUint16(eocd + 10, true) === 0xFFFF) { // ZIP64
      var loc = eocd - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
        var z64 = u64(dv, loc + 8);
        if (z64 + 56 <= u8.length && dv.getUint32(z64, true) === 0x06064b50) {
          cdSize = u64(dv, z64 + 40); cdOff = u64(dv, z64 + 48);
        }
      }
    }
    // zip có dữ liệu chèn phía trước (vd. tự giải nén): dời theo vị trí thật của mục lục
    var lech = 0;
    if (cdOff + 4 > u8.length || dv.getUint32(cdOff, true) !== SIG_CEN) {
      var cdThat = eocd - cdSize;
      if (cdThat >= 0 && cdThat + 4 <= u8.length && dv.getUint32(cdThat, true) === SIG_CEN) lech = cdThat - cdOff;
      else if (cdSize === 0) return {};
      else throw new Error('Mục lục file zip bị hỏng');
    }
    var out = {}, p = cdOff + lech;
    while (p + 46 <= u8.length && dv.getUint32(p, true) === SIG_CEN) {
      var flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      var crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      var nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var nameB = u8.subarray(p + 46, p + 46 + nlen);
      var extra = u8.subarray(p + 46 + nlen, p + 46 + nlen + elen);
      p += 46 + nlen + elen + clen;
      if (usize === 0xFFFFFFFF || csize === 0xFFFFFFFF || lho === 0xFFFFFFFF) { // trường ZIP64 trong extra
        var x = timExtra(extra, 0x0001);
        if (x) {
          var xv = new DataView(x.buffer, x.byteOffset, x.byteLength), q = 0;
          if (usize === 0xFFFFFFFF && q + 8 <= x.length) { usize = u64(xv, q); q += 8; }
          if (csize === 0xFFFFFFFF && q + 8 <= x.length) { csize = u64(xv, q); q += 8; }
          if (lho === 0xFFFFFFFF && q + 8 <= x.length) { lho = u64(xv, q); q += 8; }
        }
      }
      var name = chuanHoaDuongDan(docTen(nameB, flags, extra));
      if (!name || name.charAt(name.length - 1) === '/') continue;   // thư mục
      if (/^__MACOSX\//.test(name) || name === '__proto__') continue;
      if (flags & 1) throw new Error('File "' + name + '" trong zip có đặt mật khẩu — hãy giải nén rồi nén lại không mật khẩu');
      var lp = lho + lech;
      if (lp < 0 || lp + 30 > u8.length || dv.getUint32(lp, true) !== SIG_LOCAL) throw new Error('File zip bị hỏng ở "' + name + '"');
      var ds = lp + 30 + dv.getUint16(lp + 26, true) + dv.getUint16(lp + 28, true);
      if (ds + csize > u8.length) throw new Error('File zip bị cụt ở "' + name + '"');
      var comp = u8.subarray(ds, ds + csize), data;
      if (method === 0) data = comp.slice();
      else if (method === 8) {
        try { data = await inflateRaw(comp, usize); }
        catch (e) { throw new Error('Không giải nén được "' + name + '": ' + (e && e.message || e)); }
      } else throw new Error('File "' + name + '" dùng kiểu nén ' + method + ' chưa hỗ trợ (chỉ đọc được stored/deflate)');
      if (data.length !== usize || core.crc32(data) !== crc) throw new Error('File "' + name + '" trong zip bị hỏng (sai CRC/kích thước)');
      out[name] = data;
    }
    return out;
  }

  return {
    readZip: readZip, writeZip: writeZip,
    inflateRaw: inflateRaw, deflateRaw: deflateRaw,
    setEngine: setEngine, _inflateJs: inflateJs, _dosTime: dosTime
  };
});
