/* tests/chay-het.cjs — chạy mọi tests/*.test.cjs (mỗi file một tiến trình con), in ĐẠT/HỎNG + tổng kết.
 * Dùng: node tests/chay-het.cjs [-v] [lọc...]   (-v: in cả output của file đạt; lọc: chỉ chạy file có tên chứa chuỗi) */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const thuMuc = __dirname;                 // chạy được từ cwd bất kỳ
const goc = path.resolve(thuMuc, '..');
const args = process.argv.slice(2);
const chiTiet = args.includes('-v') || args.includes('--verbose');
const loc = args.filter(a => !a.startsWith('-'));

let ds = fs.readdirSync(thuMuc).filter(f => /\.test\.cjs$/.test(f)).sort();
if (loc.length) ds = ds.filter(f => loc.some(l => f.includes(l)));
if (!ds.length) { console.log('Không có file test nào' + (loc.length ? ' khớp "' + loc.join('", "') + '"' : '')); process.exit(1); }

const GIOI_HAN = 10 * 60 * 1000;
const kq = [];
const t0 = Date.now();
for (const f of ds) {
  const t = Date.now();
  const r = cp.spawnSync(process.execPath, [path.join(thuMuc, f)], {
    cwd: goc, encoding: 'utf8', timeout: GIOI_HAN, maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  const ms = Date.now() - t;
  const dat = r.status === 0 && !r.error && !r.signal;
  kq.push({ f, dat, ms });
  console.log((dat ? 'ĐẠT ' : 'HỎNG') + '  ' + f + '  (' + (ms / 1000).toFixed(1) + ' s)');
  const out = ((r.stdout || '') + (r.stderr || '')).replace(/\s+$/, '');
  if (!dat) {
    if (r.error) console.log('      lỗi chạy: ' + (r.error.code === 'ETIMEDOUT' ? 'quá ' + GIOI_HAN / 1000 + ' s' : r.error.message));
    else if (r.signal) console.log('      bị dừng bởi tín hiệu ' + r.signal);
    else console.log('      mã thoát ' + r.status);
  }
  if (out && (!dat || chiTiet)) console.log(out.split('\n').map(l => '      | ' + l).join('\n'));
}
const hong = kq.filter(x => !x.dat);
console.log('\n' + (hong.length ? 'HỎNG ' + hong.length + '/' + kq.length + ': ' + hong.map(x => x.f).join(', ')
  : 'ĐẠT tất cả ' + kq.length + ' file test') + ' — ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exitCode = hong.length ? 1 : 0;
