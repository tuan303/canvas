/* tests/zip.test.cjs — kiểm thử js/zip.js (chạy: node tests/zip.test.cjs) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const cp = require('child_process');
const core = require('../js/core.js');
const zip = require('../js/zip.js');

const ds = [];
function test(ten, fn) { ds.push([ten, fn]); }
const DL = 'C:/Users/Administrator/Downloads';

/* ---------- tiện ích ---------- */

function ngauNhien(n, seed) {
  const u = new Uint8Array(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; u[i] = x & 255; }
  return u;
}
function giongNhau(a, b, msg) {
  assert.ok(a instanceof Uint8Array, msg + ': không phải Uint8Array');
  assert.strictEqual(a.length, b.length, msg + ': khác độ dài');
  assert.ok(Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length)), msg + ': khác nội dung');
}
// Đọc mục lục trung tâm "bằng tay" để soi cờ/phương thức/CRC (độc lập với readZip)
function soiMucLuc(z) {
  const b = Buffer.from(z.buffer, z.byteOffset, z.length);
  const e = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = b.readUInt16LE(e + 10), off = b.readUInt32LE(e + 16), out = [];
  let p = off;
  for (let i = 0; i < n; i++) {
    assert.strictEqual(b.readUInt32LE(p), 0x02014b50);
    const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
    const ent = {
      flags: b.readUInt16LE(p + 8), method: b.readUInt16LE(p + 10), time: b.readUInt16LE(p + 12), date: b.readUInt16LE(p + 14),
      crc: b.readUInt32LE(p + 16), csize: b.readUInt32LE(p + 20), usize: b.readUInt32LE(p + 24),
      name: b.toString('utf8', p + 46, p + 46 + nl), lho: b.readUInt32LE(p + 42), ext: b.readUInt32LE(p + 38)
    };
    const lh = ent.lho;
    assert.strictEqual(b.readUInt32LE(lh), 0x04034b50);
    ent.localFlags = b.readUInt16LE(lh + 6);
    ent.localMethod = b.readUInt16LE(lh + 8);
    ent.localCrc = b.readUInt32LE(lh + 14);
    const ds2 = lh + 30 + b.readUInt16LE(lh + 26) + b.readUInt16LE(lh + 28);
    ent.raw = b.subarray(ds2, ds2 + ent.csize);
    out.push(ent);
    p += 46 + nl + el + cl;
  }
  return out;
}

const NGAY = new Date(2026, 9, 2, 8, 30, 14);
function boMau() {
  return [
    { path: 'imsmanifest.xml', data: '<?xml version="1.0" encoding="UTF-8"?><manifest>' + '<resource href="Đề thi.xml"/>'.repeat(200) + '</manifest>' },
    { path: 'images/ảnh_đề_1.png', data: ngauNhien(20000, 7) },
    { path: 'Thư mục con/Đề kiểm tra – Toán 12.xml', data: 'Nội dung tiếng Việt: ạ ả ã ầ ẩ ẫ ậ ằ ẳ ẵ ặ đ Đ\n'.repeat(300) },
    { path: 'rỗng.txt', data: '' },
    { path: 'nhị-phân.bin', data: ngauNhien(100000, 99) },
    { path: 'lặp.txt', data: new Uint8Array(500000).fill(65) },
    { path: 'nho.txt', data: 'a' },
  ];
}
function duLieu(f) { return typeof f.data === 'string' ? Buffer.from(f.data, 'utf8') : f.data; }

/* ---------- ca kiểm thử ---------- */

test('ngày giờ DOS', () => {
  const t = zip._dosTime(NGAY);
  assert.strictEqual(t.time, (8 << 11) | (30 << 5) | 7);
  assert.strictEqual(t.date, (46 << 9) | (10 << 5) | 2);
  assert.deepStrictEqual(zip._dosTime(new Date(1970, 0, 1)), { time: 0, date: 33 });
  assert.strictEqual(zip._dosTime(new Date(2200, 0, 1)).date >> 9, 127);
  assert.deepStrictEqual(zip._dosTime(new Date('x')), { time: 0, date: 33 });
});

test('vòng tròn ghi/đọc: tên tiếng Việt, nhị phân, file rỗng; cờ UTF-8, CRC, phương thức', async () => {
  const files = boMau();
  const z = await zip.writeZip(files, { date: NGAY });
  assert.ok(z instanceof Uint8Array);
  const r = await zip.readZip(z);
  assert.deepStrictEqual(Object.keys(r), files.map(f => f.path));
  for (const f of files) giongNhau(r[f.path], duLieu(f), f.path);
  const ml = soiMucLuc(z);
  const theo = Object.fromEntries(ml.map(e => [e.name, e]));
  for (const e of ml) {
    assert.ok(e.flags & 0x800, e.name + ': thiếu cờ UTF-8 (trung tâm)');
    assert.ok(e.localFlags & 0x800, e.name + ': thiếu cờ UTF-8 (cục bộ)');
    assert.strictEqual(e.flags & 8, 0, 'không dùng data descriptor');
    assert.strictEqual(e.localMethod, e.method);
    assert.strictEqual(e.localCrc, e.crc);
    assert.strictEqual(e.time, zip._dosTime(NGAY).time);
    assert.strictEqual(e.date, zip._dosTime(NGAY).date);
    const goc = duLieu(files.find(f => f.path === e.name));
    if (zlib.crc32) assert.strictEqual(e.crc, zlib.crc32(goc), e.name + ': CRC (đối chiếu zlib.crc32)');
    assert.strictEqual(e.usize, goc.length);
    // giải dữ liệu thô bằng zlib độc lập
    const raw = e.method === 8 ? zlib.inflateRawSync(e.raw) : e.raw;
    assert.ok(Buffer.from(raw).equals(Buffer.from(goc)), e.name + ': dữ liệu thô');
  }
  assert.strictEqual(theo['imsmanifest.xml'].method, 8, 'text nén deflate');
  assert.strictEqual(theo['lặp.txt'].method, 8);
  assert.ok(theo['lặp.txt'].csize < 5000);
  assert.strictEqual(theo['images/ảnh_đề_1.png'].method, 0, '.png lưu nguyên');
  assert.strictEqual(theo['nhị-phân.bin'].method, 0, 'không nén được → lưu nguyên');
  assert.strictEqual(theo['rỗng.txt'].method, 0);
  assert.strictEqual(theo['rỗng.txt'].usize, 0);
  assert.strictEqual(theo['nho.txt'].method, 0, 'nén không có lợi → lưu nguyên');
  // compress:false → tất cả lưu nguyên
  const z2 = await zip.writeZip(files, { compress: false, date: NGAY });
  assert.ok(soiMucLuc(z2).every(e => e.method === 0));
  const r2 = await zip.readZip(z2);
  for (const f of files) giongNhau(r2[f.path], duLieu(f), 'stored ' + f.path);
  // ghi lại → cùng byte (tất định khi cố định ngày)
  giongNhau(await zip.writeZip(files, { date: NGAY }), z, 'tất định');
});

test('đường dẫn: \\ → /, bỏ / và ./ đầu, thư mục, trùng tên, ArrayBuffer/mảng/Buffer', async () => {
  const z = await zip.writeZip([
    { path: 'a\\b\\c.txt', data: 'x' }, { path: '/d.txt', data: new Uint8Array([1]).buffer },
    { path: './e.txt', data: [1, 2, 3] }, { path: 'thu-muc/', data: null }, { path: 'f.bin', data: Buffer.from('buf') },
    { path: 'g.txt', data: new Uint16Array([0x4141]) },
  ]);
  const ml = soiMucLuc(z);
  assert.deepStrictEqual(ml.map(e => e.name), ['a/b/c.txt', 'd.txt', 'e.txt', 'thu-muc/', 'f.bin', 'g.txt']);
  assert.strictEqual(ml[3].ext, 0x10, 'thuộc tính thư mục');
  const r = await zip.readZip(z);
  assert.deepStrictEqual(Object.keys(r), ['a/b/c.txt', 'd.txt', 'e.txt', 'f.bin', 'g.txt'], 'bỏ thư mục khi đọc');
  assert.deepStrictEqual([...r['e.txt']], [1, 2, 3]);
  assert.strictEqual(Buffer.from(r['f.bin']).toString(), 'buf');
  assert.strictEqual(Buffer.from(r['g.txt']).toString(), 'AA');
  assert.strictEqual(Object.getPrototypeOf(r['f.bin']), Uint8Array.prototype, 'trả Uint8Array thường, không phải Buffer');
  await assert.rejects(zip.writeZip([{ path: 'x.txt', data: '1' }, { path: 'x.txt', data: '2' }]), /Trùng tên/);
  await assert.rejects(zip.writeZip([{ path: '', data: '1' }]), /Thiếu tên/);
  await assert.rejects(zip.writeZip([{ path: 'a', data: {} }]), /không phải Uint8Array/);
  const rong = await zip.writeZip([]);
  assert.strictEqual(rong.length, 22);
  assert.deepStrictEqual(await zip.readZip(rong), {});
});

test('mọi động cơ (zlib / stream / js) ghi và đọc chéo được', async () => {
  const files = boMau();
  const goc = await zip.writeZip(files, { date: NGAY }); // zlib
  for (const e of ['stream', 'js']) {
    assert.strictEqual(zip.setEngine(e), e);
    try {
      const r = await zip.readZip(goc);
      for (const f of files) giongNhau(r[f.path], duLieu(f), e + ' đọc ' + f.path);
      const z = await zip.writeZip(files, { date: NGAY });
      const ml = soiMucLuc(z);
      if (e === 'stream') assert.ok(ml.some(x => x.method === 8), 'stream phải nén được');
      else assert.ok(ml.every(x => x.method === 0), 'js: không có bộ nén → lưu nguyên');
      zip.setEngine(null);
      const r2 = await zip.readZip(z);
      for (const f of files) giongNhau(r2[f.path], duLieu(f), 'zlib đọc gói của ' + e + ' ' + f.path);
    } finally { zip.setEngine(null); }
  }
  assert.throws(() => zip.setEngine('xyz'), /không hợp lệ/);
});

test('giải nén deflate bằng JS khớp zlib (mọi mức, chiến lược, khối stored/cố định/động)', async () => {
  const mau = [
    new Uint8Array(0), new Uint8Array([7]), ngauNhien(70000, 3), new Uint8Array(300000).fill(0),
    Buffer.from('Câu 1. Cho hàm số y = f(x). '.repeat(5000)),
    Buffer.from(fs.readFileSync(__filename)),
    (() => { const u = ngauNhien(200000, 11); for (let i = 0; i < u.length; i++) u[i] = u[i] % 7 + 97; return u; })(),
  ];
  const S = zlib.constants;
  const cauHinh = [{ level: 0 }, { level: 1 }, { level: 6 }, { level: 9 }, { strategy: S.Z_FIXED }, { strategy: S.Z_HUFFMAN_ONLY },
    { strategy: S.Z_RLE }, { level: 9, memLevel: 1, windowBits: 9 }];
  let n = 0;
  for (const m of mau) for (const c of cauHinh) {
    const z = zlib.deflateRawSync(m, c);
    giongNhau(zip._inflateJs(new Uint8Array(z), m.length), new Uint8Array(m), 'kích thước biết trước ' + JSON.stringify(c));
    giongNhau(zip._inflateJs(new Uint8Array(z), 0), new Uint8Array(m), 'kích thước chưa biết ' + JSON.stringify(c));
    n++;
  }
  // dữ liệu hỏng → ném lỗi, không treo
  const z = zlib.deflateRawSync(Buffer.from('xin chào '.repeat(1000)));
  assert.throws(() => zip._inflateJs(z.subarray(0, z.length >> 1), 0), /hỏng/);
  assert.throws(() => zip._inflateJs(new Uint8Array([0xff, 0xff, 0xff]), 0), /hỏng/);
  // API công khai
  const raw = await zip.deflateRaw('abc'.repeat(100));
  assert.strictEqual(Buffer.from(await zip.inflateRaw(raw)).toString(), 'abc'.repeat(100));
  assert.ok(n >= 50);
});

test('đọc tên không có cờ UTF-8: UTF-8 thô (macOS), latin1/CP437, Info-ZIP 0x7075; dấu \\; __MACOSX', async () => {
  const z = await zip.writeZip([
    { path: 'Đề/ảnh 1.png', data: 'a' }, { path: 'ok.txt', data: 'b' }, { path: 'x/y.txt', data: 'c' },
    { path: '__MACOSX/._ảnh.png', data: 'rác' }, { path: 'f\u{E9}.txt', data: 'd' },
  ], { compress: false });
  const b = Buffer.from(z);
  const ml = soiMucLuc(z);
  // tắt cờ UTF-8 ở mọi header
  for (const e of ml) {
    b.writeUInt16LE(e.flags & ~0x800, b.lastIndexOf(Buffer.from(e.name, 'utf8'), undefined) - 46 + 8);
    b.writeUInt16LE(e.localFlags & ~0x800, e.lho + 6);
  }
  // "x/y.txt" → "x\y.txt" ở cả 2 header
  for (let i = b.indexOf('x/y.txt'); i !== -1; i = b.indexOf('x/y.txt', i + 1)) b[i + 1] = 0x5c;
  // "fé.txt" (UTF-8 C3 A9) → byte latin1 đơn E9 + đệm '_' để giữ độ dài
  const fe = Buffer.from('f\u{E9}.txt', 'utf8');
  for (let i = b.indexOf(fe); i !== -1; i = b.indexOf(fe, i + 1)) { b[i + 1] = 0xE9; b[i + 2] = 0x5f; }
  const r = await zip.readZip(new Uint8Array(b));
  // UTF-8 thô → giải UTF-8; byte E9 đơn lẻ → latin1 "é"; '\' → '/'; __MACOSX bị bỏ
  assert.deepStrictEqual(Object.keys(r), ['Đề/ảnh 1.png', 'ok.txt', 'x/y.txt', 'f\u{E9}_.txt']);
  assert.strictEqual(Buffer.from(r['f\u{E9}_.txt']).toString(), 'd');
  assert.ok(soiMucLuc(new Uint8Array(b)).every(e => !(e.flags & 0x800)));
});

test('Info-ZIP Unicode Path (0x7075) được ưu tiên khi tên gốc không phải UTF-8', async () => {
  // dựng tay 1 mục stored: tên gốc CP437 "?.txt", extra 0x7075 chứa "Đề.txt"
  const data = Buffer.from('nội dung');
  const goc = Buffer.from('?.txt', 'latin1');
  const uni = Buffer.from('Đề.txt', 'utf8');
  const ex = Buffer.alloc(4 + 5 + uni.length);
  ex.writeUInt16LE(0x7075, 0); ex.writeUInt16LE(5 + uni.length, 2); ex[4] = 1;
  ex.writeUInt32LE(core.crc32(goc), 5); uni.copy(ex, 9);
  const crc = core.crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(10, 4); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(goc.length, 26);
  const local = Buffer.concat([lh, goc, data]);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(10, 6);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(goc.length, 28); ch.writeUInt16LE(ex.length, 30);
  const cen = Buffer.concat([ch, goc, ex]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cen.length, 12); end.writeUInt32LE(local.length, 16);
  const r = await zip.readZip(new Uint8Array(Buffer.concat([local, cen, end])));
  assert.deepStrictEqual(Object.keys(r), ['Đề.txt']);
  assert.strictEqual(Buffer.from(r['Đề.txt']).toString(), 'nội dung');
});

test('ZIP64 (mục lục và kích thước trong extra 0x0001)', async () => {
  const items = [{ n: 'a.txt', d: Buffer.from('xin chào') }, { n: 'b/ĐỀ.bin', d: Buffer.from(ngauNhien(3000, 5)) }];
  const locals = [], cens = [];
  let off = 0;
  for (const it of items) {
    const name = Buffer.from(it.n, 'utf8'), crc = core.crc32(it.d);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(45, 4); lh.writeUInt16LE(0x800, 6);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(0xFFFFFFFF, 18); lh.writeUInt32LE(0xFFFFFFFF, 22);
    lh.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([lh, name, it.d]);
    const ex = Buffer.alloc(4 + 24); ex.writeUInt16LE(1, 0); ex.writeUInt16LE(24, 2);
    ex.writeBigUInt64LE(BigInt(it.d.length), 4); ex.writeBigUInt64LE(BigInt(it.d.length), 12); ex.writeBigUInt64LE(BigInt(off), 20);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(45, 4); ch.writeUInt16LE(45, 6); ch.writeUInt16LE(0x800, 8);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(0xFFFFFFFF, 20); ch.writeUInt32LE(0xFFFFFFFF, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(ex.length, 30); ch.writeUInt32LE(0xFFFFFFFF, 42);
    locals.push(local); cens.push(Buffer.concat([ch, name, ex]));
    off += local.length;
  }
  const cen = Buffer.concat(cens);
  const z64 = Buffer.alloc(56); z64.writeUInt32LE(0x06064b50, 0); z64.writeBigUInt64LE(44n, 4); z64.writeUInt16LE(45, 12); z64.writeUInt16LE(45, 14);
  z64.writeBigUInt64LE(BigInt(items.length), 24); z64.writeBigUInt64LE(BigInt(items.length), 32);
  z64.writeBigUInt64LE(BigInt(cen.length), 40); z64.writeBigUInt64LE(BigInt(off), 48);
  const loc = Buffer.alloc(20); loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(off + cen.length), 8); loc.writeUInt32LE(1, 16);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0xFFFF, 8); end.writeUInt16LE(0xFFFF, 10);
  end.writeUInt32LE(0xFFFFFFFF, 12); end.writeUInt32LE(0xFFFFFFFF, 16);
  const r = await zip.readZip(new Uint8Array(Buffer.concat([...locals, cen, z64, loc, end])));
  assert.deepStrictEqual(Object.keys(r), ['a.txt', 'b/ĐỀ.bin']);
  for (const it of items) giongNhau(r[it.n], new Uint8Array(it.d), it.n);
});

test('deflate có byte thừa sau khối cuối vẫn đọc được (mọi động cơ)', async () => {
  const data = Buffer.from('Đề kiểm tra '.repeat(400));
  const raw = Buffer.concat([zlib.deflateRawSync(data), Buffer.from([0, 0, 0, 0, 0x55])]);
  const name = Buffer.from('a.txt'), crc = core.crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(raw.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  const local = Buffer.concat([lh, name, raw]);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(raw.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
  const cen = Buffer.concat([ch, name]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cen.length, 12); end.writeUInt32LE(local.length, 16);
  const z = new Uint8Array(Buffer.concat([local, cen, end]));
  for (const e of [null, 'stream', 'js']) {
    zip.setEngine(e);
    try { giongNhau((await zip.readZip(z))['a.txt'], new Uint8Array(data), 'động cơ ' + e); }
    finally { zip.setEngine(null); }
  }
});

test('zip có dữ liệu chèn phía trước và có chú thích cuối file', async () => {
  const z = await zip.writeZip(boMau(), { date: NGAY });
  const b = Buffer.from(z);
  // thêm chú thích 100 byte vào EOCD
  const cm = Buffer.alloc(100, 0x41);
  const withComment = Buffer.concat([b.subarray(0, b.length - 2), Buffer.from([100, 0]), cm]);
  const r1 = await zip.readZip(new Uint8Array(withComment));
  assert.strictEqual(Object.keys(r1).length, 7);
  const r2 = await zip.readZip(new Uint8Array(Buffer.concat([Buffer.alloc(1234, 0x4d), withComment])));
  for (const f of boMau()) giongNhau(r2[f.path], duLieu(f), 'chèn trước ' + f.path);
});

test('lỗi rõ ràng: không phải zip, CRC sai, cụt, mật khẩu, kiểu nén lạ, deflate hỏng', async () => {
  await assert.rejects(zip.readZip(new Uint8Array(10)), /Không phải file zip/);
  await assert.rejects(zip.readZip(Buffer.from('PK\x03\x04 đây là văn bản dài hơn hai mươi hai byte')), /Không phải file zip/);
  const z = await zip.writeZip([{ path: 'a.txt', data: 'x'.repeat(1000) }, { path: 'b.txt', data: 'hello' }], { date: NGAY });
  const ml = soiMucLuc(z);
  // sửa 1 byte dữ liệu của b.txt (stored) → sai CRC
  let b = Buffer.from(z); b[ml[1].lho + 30 + 5] ^= 1;
  await assert.rejects(zip.readZip(new Uint8Array(b)), /b\.txt.*CRC/);
  // cụt: cắt giữa dữ liệu nhưng giữ mục lục → báo cụt / hỏng
  b = Buffer.from(z);
  const cdStart = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), b.length);
  const firstCd = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const cut = Buffer.concat([b.subarray(0, 40), b.subarray(firstCd)]);
  await assert.rejects(zip.readZip(new Uint8Array(cut)), /hỏng|cụt/);
  void cdStart;
  // mật khẩu
  b = Buffer.from(z); b.writeUInt16LE(ml[0].flags | 1, firstCd + 8);
  await assert.rejects(zip.readZip(new Uint8Array(b)), /mật khẩu/);
  // kiểu nén 12 (bzip2)
  b = Buffer.from(z); b.writeUInt16LE(12, firstCd + 10);
  await assert.rejects(zip.readZip(new Uint8Array(b)), /kiểu nén 12/);
  // dữ liệu deflate hỏng (mọi động cơ)
  for (const e of [null, 'stream', 'js']) {
    zip.setEngine(e);
    try {
      b = Buffer.from(z); b.fill(0xff, ml[0].lho + 30 + 5, ml[0].lho + 30 + 5 + Math.min(10, ml[0].csize - 1));
      await assert.rejects(zip.readZip(new Uint8Array(b)), /a\.txt/, 'động cơ ' + e);
    } finally { zip.setEngine(null); }
  }
});

test('fuzz: zip bị sửa ngẫu nhiên → hoặc đọc được, hoặc ném Error (không treo, không RangeError)', async () => {
  const z = await zip.writeZip(boMau().slice(0, 4).concat([{ path: 'x.xml', data: '<a>'.repeat(3000) }]), { date: NGAY });
  const rnd = ngauNhien(4000, 1234);
  let k = 0, docDuoc = 0;
  for (const e of [null, 'stream', 'js']) {
    zip.setEngine(e);
    try {
      for (let i = 0; i < 120; i++) {
        const b = new Uint8Array(z);
        const so = 1 + (rnd[k++ % rnd.length] % 4);
        for (let j = 0; j < so; j++) {
          const pos = ((rnd[k++ % rnd.length] << 8) | rnd[k++ % rnd.length]) * 7 % b.length;
          b[pos] ^= 1 << (rnd[k++ % rnd.length] % 8);
        }
        try { await zip.readZip(b); docDuoc++; }
        catch (err) {
          assert.ok(err instanceof Error && !(err instanceof RangeError), 'lỗi lạ: ' + err);
          assert.ok(typeof err.message === 'string' && err.message.length > 0);
        }
      }
    } finally { zip.setEngine(null); }
  }
  assert.ok(docDuoc >= 0);
});

test('zip thật THPT_HSA2025_TOAN_SCORM.zip (và các gói SCORM khác nếu có)', async () => {
  const f = path.join(DL, 'THPT_HSA2025_TOAN_SCORM.zip');
  if (!fs.existsSync(f)) { console.log('    BỎ QUA: không có ' + f); return; }
  const r = await zip.readZip(fs.readFileSync(f));
  assert.ok(r['imsmanifest.xml'] && r['index.html'], 'thiếu manifest/index');
  const man = core.parseXml(core.utf8Decode(r['imsmanifest.xml']));
  assert.strictEqual(man.name, 'manifest');
  assert.ok(core.findAll(man, 'resource').length >= 1);
  const html = core.utf8Decode(r['index.html']);
  assert.ok(/<html|<!doctype/i.test(html), 'index.html');
  assert.ok(!html.includes('\u{FFFD}'), 'index.html giải UTF-8 sạch');
  console.log('    ' + Object.keys(r).length + ' file; index.html ' + (html.length / 1024).toFixed(0) + ' KB');
  // đối chiếu danh sách với .NET (nếu có PowerShell)
  const ds2 = dotnetListing(f);
  if (ds2) {
    const ta = Object.keys(r).map(k => k + ':' + r[k].length).sort();
    const nt = ds2.filter(e => !e.n.endsWith('/')).map(e => e.n.replace(/\\/g, '/') + ':' + e.len).sort();
    assert.deepStrictEqual(ta, nt, 'khác danh sách .NET');
  }
  // mọi gói *SCORM*.zip trong Downloads: đọc được, có manifest
  let n = 0;
  for (const g of fs.readdirSync(DL).filter(x => /SCORM.*\.zip$/i.test(x))) {
    const rr = await zip.readZip(fs.readFileSync(path.join(DL, g)));
    assert.ok(rr['imsmanifest.xml'], g + ': thiếu imsmanifest.xml');
    assert.strictEqual(core.parseXml(rr['imsmanifest.xml']).name, 'manifest', g);
    n++;
  }
  console.log('    ' + n + ' gói SCORM trong Downloads đọc được');
});

/* ---------- tương thích Windows ---------- */

function ps(script) {
  const r = cp.spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { encoding: 'utf8', timeout: 180000, windowsHide: true });
  if (r.error) return { ok: false, err: String(r.error) };
  return { ok: r.status === 0, err: (r.stderr || '') + (r.stdout || ''), out: r.stdout };
}
let coPS = null;
function coPowerShell() {
  if (coPS === null) coPS = process.platform === 'win32' && ps('exit 0').ok;
  return coPS;
}
function psStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function dotnetListing(zipPath) {
  if (!coPowerShell()) return null;
  const out = path.join(os.tmpdir(), 'nh-zip-list-' + process.pid + '.json');
  const r = ps(`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[System.IO.Compression.ZipFile]::OpenRead(${psStr(zipPath)})
$l=@(); foreach($e in $z.Entries){ $l += [pscustomobject]@{ n=$e.FullName; len=$e.Length; clen=$e.CompressedLength } }
$z.Dispose()
[System.IO.File]::WriteAllText(${psStr(out)}, (ConvertTo-Json -InputObject $l -Compress), (New-Object System.Text.UTF8Encoding $false))`);
  assert.ok(r.ok, '.NET đọc zip lỗi: ' + r.err);
  const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.unlinkSync(out);
  return Array.isArray(j) ? j : [j];
}

test('tương thích Windows: .NET ZipFile + Expand-Archive đọc gói của ta; ta đọc gói Compress-Archive', async () => {
  if (!coPowerShell()) { console.log('    BỎ QUA: không có PowerShell'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-zip-'));
  try {
    const files = boMau();
    const z = await zip.writeZip(files, { date: NGAY });
    const zp = path.join(tmp, 'goi.zip');
    fs.writeFileSync(zp, z);
    // 1) .NET ZipFile liệt kê đúng tên Unicode, kích thước
    const list = dotnetListing(zp);
    assert.deepStrictEqual(list.map(e => e.n), files.map(f => f.path));
    assert.deepStrictEqual(list.map(e => e.len), files.map(f => duLieu(f).length));
    // 2) Expand-Archive giải nén → so từng byte
    const ra = path.join(tmp, 'ra');
    const r = ps(`$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${psStr(zp)} -DestinationPath ${psStr(ra)} -Force`);
    assert.ok(r.ok, 'Expand-Archive lỗi: ' + r.err);
    for (const f of files) {
      const p = path.join(ra, ...f.path.split('/'));
      assert.ok(fs.existsSync(p), 'Expand-Archive thiếu ' + f.path);
      giongNhau(new Uint8Array(fs.readFileSync(p)), duLieu(f), 'Expand-Archive ' + f.path);
    }
    // 3) Compress-Archive (PowerShell 5.1 có thể ghi '\') → readZip đọc lại đúng
    const zp2 = path.join(tmp, 'tu-ps.zip');
    const r2 = ps(`$ErrorActionPreference='Stop'; Compress-Archive -Path (Join-Path ${psStr(ra)} '*') -DestinationPath ${psStr(zp2)} -Force`);
    assert.ok(r2.ok, 'Compress-Archive lỗi: ' + r2.err);
    const back = await zip.readZip(fs.readFileSync(zp2));
    for (const f of files) giongNhau(back[f.path], duLieu(f), 'Compress-Archive ' + f.path);
    assert.deepStrictEqual(Object.keys(back).sort(), files.map(f => f.path).sort());
    // 4) bsdtar của Windows (libarchive, có kiểm tra CRC) giải nén không lỗi
    const tarExe = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
    if (fs.existsSync(tarExe)) {
      const td = path.join(tmp, 'tar'); fs.mkdirSync(td);
      const t = cp.spawnSync(tarExe, ['-xf', zp, '-C', td], { encoding: 'utf8', windowsHide: true });
      assert.strictEqual(t.status, 0, 'tar.exe lỗi: ' + t.stderr);
      giongNhau(new Uint8Array(fs.readFileSync(path.join(td, 'imsmanifest.xml'))), duLieu(files[0]), 'tar imsmanifest.xml');
      giongNhau(new Uint8Array(fs.readFileSync(path.join(td, 'lặp.txt'))), duLieu(files[5]), 'tar lặp.txt');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('nạp kiểu trình duyệt (không module/require) → dùng CompressionStream/DecompressionStream', async () => {
  if (typeof DecompressionStream !== 'function') { console.log('    BỎ QUA: Node không có DecompressionStream'); return; }
  const cu = globalThis.NH;
  try {
    delete globalThis.NH;
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8'));
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/zip.js'), 'utf8'));
    const bz = globalThis.NH.zip;
    assert.ok(bz && typeof bz.readZip === 'function');
    assert.strictEqual(bz.setEngine(null), 'stream', 'không có zlib → stream');
    const files = boMau();
    const z = await bz.writeZip(files, { date: NGAY });
    assert.ok(soiMucLuc(z).some(e => e.method === 8));
    const r = await zip.readZip(z);     // bản Node đọc gói bản trình duyệt
    for (const f of files) giongNhau(r[f.path], duLieu(f), 'browser→node ' + f.path);
    const r2 = await bz.readZip(await zip.writeZip(files, { date: NGAY }));
    for (const f of files) giongNhau(r2[f.path], duLieu(f), 'node→browser ' + f.path);
  } finally {
    if (cu) globalThis.NH = cu; else delete globalThis.NH;
  }
});

test('hiệu năng: 300 file + đọc lại', async () => {
  const files = [];
  for (let i = 0; i < 300; i++) files.push({ path: 'images/img_' + String(i).padStart(3, '0') + '.png', data: ngauNhien(2000 + i, i + 1) });
  for (let i = 0; i < 100; i++) files.push({ path: 'q/' + i + '.xml', data: '<item ident="q' + i + '">' + 'Nội dung '.repeat(200) + '</item>' });
  const t0 = Date.now();
  const z = await zip.writeZip(files);
  const r = await zip.readZip(z);
  const ms = Date.now() - t0;
  assert.strictEqual(Object.keys(r).length, 400);
  for (const f of files) giongNhau(r[f.path], duLieu(f), f.path);
  console.log('    400 file ' + (z.length / 1024).toFixed(0) + ' KB: ' + ms + ' ms');
});

/* ---------------- chạy ---------------- */
(async () => {
  let hong = 0;
  for (const [ten, fn] of ds) {
    try { await fn(); console.log('  ok   ' + ten); }
    catch (e) { hong++; console.log('  HỎNG ' + ten + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 8).join('\n       ')); }
  }
  console.log((hong ? 'HỎNG ' + hong : 'ĐẠT tất cả') + ' / ' + ds.length + ' ca (zip)');
  process.exitCode = hong ? 1 : 0;
})();
