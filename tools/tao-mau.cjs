/* tools/tao-mau.cjs — sinh hai file mẫu cho giáo viên (DESIGN.md §11)
 *   mau/Mau-ngan-hang-cau-hoi.docx : phần hướng dẫn (trước dòng NGÂN HÀNG đầu tiên) + 2 ngân hàng ví dụ đủ mọi loại câu,
 *                                    công thức Office Math thật, ảnh PNG, bảng, đoạn dẫn, bảng đáp án
 *   mau/Mau-ngan-hang-cau-hoi.xlsx : trang "Câu hỏi" (tiêu đề cố định, danh sách thả xuống, dòng ví dụ, ảnh nổi) + trang "Hướng dẫn"
 * Chạy: node tools/tao-mau.cjs [--out <thư mục>]      (mặc định ghi vào mau/)
 * Không thư viện ngoài: js/zip.js + zlib của Node (nén ảnh PNG). Ngày giờ cố định → nội dung giống hệt mỗi lần chạy.
 * Khi require(): xuất taoDocx(), taoXlsx(), veDoThi()… để tests/mau.test.cjs dùng.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const core = require('../js/core.js');
const zip = require('../js/zip.js');

/* ======================= hằng số ======================= */

const L = String.raw;                                    // chuỗi LaTeX: giữ nguyên dấu \
const NL = String.fromCharCode(10), TAB = String.fromCharCode(9);
const NGAY = new Date(2026, 9, 1, 8, 0, 0);              // ngày ghi trong zip (giờ địa phương)
const NGAY_ISO = '2026-10-01T08:00:00Z';
const TRUONG = 'Trường Tiểu học, THCS & THPT Ngôi Sao Hoàng Mai';
const TRUONG_HOA = 'TRƯỜNG TIỂU HỌC, THCS & THPT NGÔI SAO HOÀNG MAI';
const CONG_CU = 'Ngân hàng câu hỏi Canvas';
const NAVY = '23328C', DO = 'D21235', VANG = 'FFAD00', XAM = '5B6475', CHU = '1F2937', XANH = '1E7B34';
const NEN_NAVY = 'EEF1FA', NEN_VANG = 'FFF6DD', VIEN = 'B8BFD0';
const FONT = 'Be Vietnam Pro', FONT_DE = 'Times New Roman', FONT_TOAN = 'Cambria Math';
const BANK_TOAN = 'Mẫu – Toán 12 (ví dụ)';
const BANK_ANH = 'Mẫu – Tiếng Anh (ví dụ)';
const TEN_DOCX = 'Mau-ngan-hang-cau-hoi.docx';
const TEN_XLSX = 'Mau-ngan-hang-cau-hoi.xlsx';
const KHO_A4 = { w: 11906, h: 16838, le: 1134 };         // A4 dọc, lề 2 cm (twip)
const RONG_CHU = KHO_A4.w - 2 * KHO_A4.le;               // 9638 twip vùng chữ

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + NL;
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_X = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const RT_CORE = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
const CT_OFF = 'application/vnd.openxmlformats-officedocument.';

// thoát XML (cả văn bản lẫn thuộc tính) sau khi chuẩn hoá NFC
function x(s) { return core.escAttr(core.nfc(s)); }

/* ======================= ảnh PNG (vẽ bằng mã) ======================= */

function khoiPng(loai, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(loai, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(core.crc32(new Uint8Array(td.buffer, td.byteOffset, td.length)) >>> 0);
  return Buffer.concat([len, td, crc]);
}
// RGB 8 bit, không xen kẽ; dpi ghi vào pHYs (ảnh vẽ gấp đôi → 192 dpi để hiện đúng cỡ)
function maHoaPng(w, h, rgb, dpi) {
  const dong = w * 3 + 1, raw = Buffer.alloc(dong * h);
  for (let y = 0; y < h; y++) {
    raw[y * dong] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * dong + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const phys = Buffer.alloc(9), ppm = Math.round((dpi || 96) / 0.0254);
  phys.writeUInt32BE(ppm, 0); phys.writeUInt32BE(ppm, 4); phys[8] = 1;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    khoiPng('IHDR', ihdr), khoiPng('pHYs', phys), khoiPng('IDAT', zlib.deflateSync(raw, { level: 9 })), khoiPng('IEND', Buffer.alloc(0))]);
  return new Uint8Array(png.buffer, png.byteOffset, png.length);
}

// phông chữ điểm ảnh 5×7 cho nhãn trục
const PHONG = {
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  'x': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  'y': ['.....', '.....', '#...#', '#...#', '.####', '....#', '.###.'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.']
};

class Tranh {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Uint8Array(w * h * 3).fill(255); }
  tron(px, py, mau, a) { // pha màu theo độ phủ a
    if (px < 0 || py < 0 || px >= this.w || py >= this.h || !(a > 0)) return;
    if (a > 1) a = 1;
    const i = (py * this.w + px) * 3;
    for (let k = 0; k < 3; k++) this.p[i + k] = Math.round(this.p[i + k] * (1 - a) + mau[k] * a);
  }
  // nét gấp khúc khử răng cưa: độ phủ lấy max trên cả nét rồi mới pha (chỗ nối không bị đậm)
  net(diem, rong, mau) {
    const r = rong / 2 + 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    diem.forEach(([a, b]) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); });
    const bx0 = Math.max(0, Math.floor(x0 - r)), by0 = Math.max(0, Math.floor(y0 - r));
    const bx1 = Math.min(this.w - 1, Math.ceil(x1 + r)), by1 = Math.min(this.h - 1, Math.ceil(y1 + r));
    const bw = bx1 - bx0 + 1, phu = new Float32Array(bw * (by1 - by0 + 1));
    for (let s = 0; s + 1 < diem.length; s++) {
      const [ax, ay] = diem[s], [cx, cy] = diem[s + 1], dx = cx - ax, dy = cy - ay, l2 = dx * dx + dy * dy;
      const sx0 = Math.max(bx0, Math.floor(Math.min(ax, cx) - r)), sx1 = Math.min(bx1, Math.ceil(Math.max(ax, cx) + r));
      const sy0 = Math.max(by0, Math.floor(Math.min(ay, cy) - r)), sy1 = Math.min(by1, Math.ceil(Math.max(ay, cy) + r));
      for (let py = sy0; py <= sy1; py++) {
        for (let px = sx0; px <= sx1; px++) {
          const qx = px + 0.5, qy = py + 0.5;
          let t = l2 ? ((qx - ax) * dx + (qy - ay) * dy) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + t * dx - qx, ey = ay + t * dy - qy;
          const a = Math.min(1, Math.max(0, rong / 2 + 0.5 - Math.sqrt(ex * ex + ey * ey)));
          const j = (py - by0) * bw + (px - bx0);
          if (a > phu[j]) phu[j] = a;
        }
      }
    }
    for (let j = 0; j < phu.length; j++) if (phu[j] > 0) this.tron(bx0 + (j % bw), by0 + Math.floor(j / bw), mau, phu[j]);
  }
  netDut(a, b, rong, mau, dai, ho) { // đoạn nét đứt
    const L0 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t < L0; t += dai + ho) {
      const t2 = Math.min(L0, t + dai), f = (u) => [a[0] + (b[0] - a[0]) * u / L0, a[1] + (b[1] - a[1]) * u / L0];
      this.net([f(t), f(t2)], rong, mau);
    }
  }
  tamGiac(p1, p2, p3, mau) { // tô tam giác, lấy mẫu 4×4 mỗi điểm ảnh
    const x0 = Math.floor(Math.min(p1[0], p2[0], p3[0])), x1 = Math.ceil(Math.max(p1[0], p2[0], p3[0]));
    const y0 = Math.floor(Math.min(p1[1], p2[1], p3[1])), y1 = Math.ceil(Math.max(p1[1], p2[1], p3[1]));
    const canh = (a, b, px, py) => (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        let n = 0;
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const sx = px + (i + 0.5) / 4, sy = py + (j + 0.5) / 4;
            const d1 = canh(p1, p2, sx, sy), d2 = canh(p2, p3, sx, sy), d3 = canh(p3, p1, sx, sy);
            if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) n++;
          }
        }
        this.tron(px, py, mau, n / 16);
      }
    }
  }
  cham(cx, cy, r, mau) {
    for (let py = Math.floor(cy - r - 1); py <= Math.ceil(cy + r + 1); py++) {
      for (let px = Math.floor(cx - r - 1); px <= Math.ceil(cx + r + 1); px++) {
        this.tron(px, py, mau, Math.min(1, Math.max(0, r + 0.5 - Math.hypot(px + 0.5 - cx, py + 0.5 - cy))));
      }
    }
  }
  chu(s, x0, y0, co, mau) { // chữ điểm ảnh, mỗi chấm là ô vuông co×co
    let xx = x0;
    for (const c of s) {
      const g = PHONG[c];
      if (!g) { xx += 3 * co; continue; }
      g.forEach((dong, j) => {
        for (let i = 0; i < dong.length; i++) {
          if (dong[i] !== '#') continue;
          for (let a = 0; a < co; a++) for (let b = 0; b < co; b++) this.tron(xx + i * co + a, y0 + j * co + b, mau, 1);
        }
      });
      xx += (g[0].length + 1) * co;
    }
  }
}

// Đồ thị y = x³ − 3x (hình kiểu đề thi): trục, đường cong, đường gióng nét đứt, nhãn. 600×450 điểm ảnh.
function veDoThi() {
  const W = 600, H = 450, O = [300, 235], u = 70;
  const t = new Tranh(W, H);
  const P = (a, b) => [O[0] + a * u, O[1] - b * u];
  const den = [34, 40, 51], xam = [138, 147, 166], navy = [0x23, 0x32, 0x8C], doTruong = [0xD2, 0x12, 0x35];
  // đường gióng
  [[[-1, 0], [-1, 2], [0, 2]], [[1, 0], [1, -2], [0, -2]]].forEach((g) => {
    t.netDut(P(...g[0]), P(...g[1]), 2, xam, 8, 6);
    t.netDut(P(...g[1]), P(...g[2]), 2, xam, 8, 6);
  });
  // trục toạ độ + mũi tên
  t.net([[18, O[1]], [570, O[1]]], 2.5, den);
  t.tamGiac([586, O[1]], [568, O[1] - 8], [568, O[1] + 8], den);
  t.net([[O[0], 440], [O[0], 30]], 2.5, den);
  t.tamGiac([O[0], 13], [O[0] - 8, 31], [O[0] + 8, 31], den);
  // vạch chia
  [-1, 1].forEach((a) => t.net([[O[0] + a * u, O[1] - 5], [O[0] + a * u, O[1] + 5]], 2, den));
  [-2, 2].forEach((b) => t.net([[O[0] - 5, O[1] - b * u], [O[0] + 5, O[1] - b * u]], 2, den));
  // đường cong
  const cong = [];
  for (let i = 0; i <= 400; i++) { const a = -2.05 + 4.1 * i / 400; cong.push(P(a, a * a * a - 3 * a)); }
  t.net(cong, 4.5, navy);
  t.cham(...P(-1, 2), 5, doTruong);
  t.cham(...P(1, -2), 5, doTruong);
  // nhãn
  t.chu('x', 566, O[1] + 12, 3, den);
  t.chu('y', O[0] + 14, 8, 3, den);
  t.chu('O', O[0] - 22, O[1] + 9, 3, den);
  t.chu('-1', O[0] - u - 16, O[1] + 12, 3, den);
  t.chu('1', O[0] + u - 7, O[1] - 32, 3, den);
  t.chu('2', O[0] - 26, O[1] - 2 * u - 10, 3, den);
  t.chu('-2', O[0] - 40, O[1] + 2 * u - 10, 3, den);
  return maHoaPng(W, H, t.p, 192);
}

/* ======================= Word: khối dựng XML ======================= */

const raw = (s) => ({ xml: s });                         // đoạn XML dựng sẵn (khác chuỗi chữ thường)
const isRaw = (v) => v && typeof v === 'object' && typeof v.xml === 'string';

function rPr(o) {
  o = o || {};
  let s = '';
  if (o.font) s += '<w:rFonts w:ascii="' + o.font + '" w:hAnsi="' + o.font + '" w:cs="' + o.font + '"/>';
  if (o.b) s += '<w:b/><w:bCs/>';
  if (o.i) s += '<w:i/><w:iCs/>';
  if (o.color) s += '<w:color w:val="' + o.color + '"/>';
  if (o.spacing) s += '<w:spacing w:val="' + o.spacing + '"/>';
  if (o.sz) s += '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>';
  if (o.hl) s += '<w:highlight w:val="' + o.hl + '"/>';
  if (o.u) s += '<w:u w:val="single"/>';
  if (o.sup) s += '<w:vertAlign w:val="superscript"/>';
  return s ? '<w:rPr>' + s + '</w:rPr>' : '';
}
// một run chữ; ký tự Tab trong chuỗi → <w:tab/>
function r(text, o) {
  let inner = '';
  core.nfc(text).split(TAB).forEach((s, i) => {
    if (i) inner += '<w:tab/>';
    if (s) inner += '<w:t xml:space="preserve">' + x(s) + '</w:t>';
  });
  return raw('<w:r>' + rPr(o) + inner + '</w:r>');
}
const T = raw('<w:r><w:tab/></w:r>');
const B = (s, mau) => r(s, { b: true, color: mau });   // chữ đậm (màu tuỳ chọn)
function noiDung(nd) { return [].concat(nd == null ? [] : nd).map((c) => isRaw(c) ? c.xml : r(String(c)).xml).join(''); }

function p(nd, o) {
  o = o || {};
  let pr = '';
  if (o.style) pr += '<w:pStyle w:val="' + o.style + '"/>';
  if (o.keepNext) pr += '<w:keepNext/>';
  if (o.pageBreakBefore) pr += '<w:pageBreakBefore/>';
  if (o.numId) pr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + o.numId + '"/></w:numPr>';
  if (o.pBdr) pr += '<w:pBdr>' + o.pBdr + '</w:pBdr>';
  if (o.shd) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shd + '"/>';
  if (o.sp) pr += '<w:spacing' + Object.keys(o.sp).map((k) => ' w:' + k + '="' + o.sp[k] + '"').join('') + '/>';
  if (o.ind) pr += '<w:ind' + Object.keys(o.ind).map((k) => ' w:' + k + '="' + o.ind[k] + '"').join('') + '/>';
  if (o.jc) pr += '<w:jc w:val="' + o.jc + '"/>';
  return raw('<w:p>' + (pr ? '<w:pPr>' + pr + '</w:pPr>' : '') + noiDung(nd) + '</w:p>');
}
const vien = (canh, sz, mau, space) => canh.map((k) => '<w:' + k + ' w:val="single" w:sz="' + sz + '" w:space="' + (space || 0) + '" w:color="' + mau + '"/>').join('');

/* ---- công thức Office Math (OMML) ---- */
const mr = (t) => '<m:r><w:rPr><w:rFonts w:ascii="' + FONT_TOAN + '" w:hAnsi="' + FONT_TOAN + '"/></w:rPr><m:t>' + x(t) + '</m:t></m:r>';
const mj = (...a) => a.flat().map((s) => s.startsWith('<m:') ? s : mr(s)).join('');   // chuỗi thường → m:r
const M = (...a) => raw('<m:oMath>' + mj(...a) + '</m:oMath>');
const MKhoi = (...a) => raw('<m:oMathPara><m:oMath>' + mj(...a) + '</m:oMath></m:oMathPara>');
const mf = (tu, mau) => '<m:f><m:num>' + mj(tu) + '</m:num><m:den>' + mj(mau) + '</m:den></m:f>';
const msup = (e, s) => '<m:sSup><m:e>' + mj(e) + '</m:e><m:sup>' + mj(s) + '</m:sup></m:sSup>';
const mcan = (e) => '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + mj(e) + '</m:e></m:rad>';
const mtp = (duoi, tren, e) => '<m:nary><m:naryPr><m:limLoc m:val="subSup"/></m:naryPr><m:sub>' + mj(duoi) + '</m:sub><m:sup>' +
  mj(tren) + '</m:sup><m:e>' + mj(e) + '</m:e></m:nary>';                                   // ∫ (ký tự mặc định của m:nary)
const mhe = (...dong) => '<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr>' +
  dong.map((d) => '<m:e>' + mj(d) + '</m:e>').join('') + '</m:eqArr></m:e></m:d>';
const mvec = (e) => '<m:acc><m:accPr><m:chr m:val="&#x20D7;"/></m:accPr><m:e>' + mj(e) + '</m:e></m:acc>';
const mabs = (e) => '<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr><m:e>' + mj(e) + '</m:e></m:d>';

/* ---- ảnh nằm cùng dòng chữ ---- */
let soHinh = 0;
function hinh(rId, wPx, hPx, ten, moTa) {
  const id = ++soHinh, cx = wPx * 9525, cy = hPx * 9525;
  return raw('<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="' + id + '" name="' + x(ten) + '" descr="' + x(moTa) + '"/>' +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="' + NS_A + '" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="' + NS_A + '"><a:graphicData uri="' + NS_PIC + '"><pic:pic xmlns:pic="' + NS_PIC + '">' +
    '<pic:nvPicPr><pic:cNvPr id="0" name="' + x(ten) + '" descr="' + x(moTa) + '"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' + rId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>');
}

/* ---- bảng ---- */
// hang: [[ô…]…]; ô: chuỗi | {xml} | mảng đoạn | {nd, fill, span, jc, style}
function bang(hang, o) {
  o = o || {};
  const rong = o.rong, tong = rong.reduce((a, b) => a + b, 0), mauVien = o.vien || VIEN;
  let s = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="' + tong + '" w:type="dxa"/>' +
    (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') +
    '<w:tblBorders>' + vien(['top', 'left', 'bottom', 'right', 'insideH', 'insideV'], o.sz || 4, mauVien) + '</w:tblBorders>' +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="' + (o.dem || 45) + '" w:type="dxa"/><w:left w:w="' + (o.leTrai != null ? o.leTrai : 100) + '" w:type="dxa"/>' +
    '<w:bottom w:w="' + (o.dem || 45) + '" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>' +
    '<w:tblGrid>' + rong.map((w) => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';
  hang.forEach((h, ih) => {
    const tieuDe = o.tieuDe && ih === 0;
    s += '<w:tr><w:trPr><w:cantSplit/>' + (tieuDe ? '<w:tblHeader/>' : '') + '</w:trPr>';
    let cot = 0;
    h.forEach((c) => {
      const oc = (c && typeof c === 'object' && !Array.isArray(c) && !isRaw(c)) ? c : { nd: c };
      const span = oc.span || 1, w = rong.slice(cot, cot + span).reduce((a, b) => a + b, 0);
      cot += span;
      const fill = oc.fill || (tieuDe ? NAVY : (o.soLe && ih % 2 === 0 ? 'F6F7FB' : null));
      const pr = '<w:tcW w:w="' + w + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
        (fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' : '') + '<w:vAlign w:val="' + (o.vAlign || 'top') + '"/>';
      // nd đã là các đoạn <w:p> → dùng thẳng; còn lại (chuỗi, run, mảng run) → bọc thành một đoạn
      const laDoan = (d) => isRaw(d) && d.xml.startsWith('<w:p>');
      const dsDoan = Array.isArray(oc.nd) && oc.nd.length && oc.nd.every(laDoan) ? oc.nd : [oc.nd == null ? '' : oc.nd];
      const xmlDoan = dsDoan.map((d) => laDoan(d) ? d.xml
        : p(tieuDe ? [B(String(d), 'FFFFFF')] : d, { style: oc.style || o.style || 'TrongBang', jc: oc.jc || o.cjc }).xml).join('');
      s +='<w:tc><w:tcPr>' + pr + '</w:tcPr>' + xmlDoan + '</w:tc>';
    });
    s += '</w:tr>';
  });
  return raw(s + '</w:tbl>');
}

/* ======================= Word: nội dung ======================= */

// mẫu câu hỏi
const dauCau = (so, the, nd) => p([B('Câu ' + so + '.', NAVY), ' '].concat(...the.map((t) => [B(t, XAM), ' ']), nd), { keepNext: true });
const dapAn = (s) => p([B('Đáp án: ', XANH), s]);
const loiGiai = (nd, nhan) => p([B((nhan || 'Lời giải') + ': ', NAVY)].concat(nd));
const nhanPA = (L0, kieu) => r(L0, kieu === 'do' ? { b: true, u: true, color: DO } : kieu === 'nen' ? { b: true, hl: 'yellow' } : { b: true });
const paDong = (L0, nd, kieu) => p([nhanPA(L0, kieu), '. '].concat(nd));
// nhiều phương án trên một dòng, ngăn bằng Tab: [[nhãn, nội dung, kiểu?]…]
const paMotDong = (ds) => p([].concat(...ds.map(([L0, nd, kieu], i) => (i ? [T] : []).concat([nhanPA(L0, kieu), '. '], nd))), { style: 'PhuongAn' });
const yDong = (k, nd) => p([B(k + ')'), ' '].concat(nd));

function phanHuongDan() {
  const HD = 'HuongDan';
  const h1 = (s) => p(s, { style: 'Heading1' });
  const doanHD = (nd) => p(nd, { style: HD });
  const cham = (nd) => p(nd, { style: HD, numId: 1 });
  const buoc = (n, tieuDe, nd) => p([B('Bước ' + n + '.', NAVY), T, B(tieuDe), ' '].concat(nd), { style: 'Buoc' });
  const ma = (s) => r(s, { b: true, color: NAVY });                     // từ khoá trong bảng
  const de = (s, o) => r(s, Object.assign({ font: FONT_DE, sz: 21 }, o || {})); // chữ ví dụ (phông đề thi)
  const o3 = (a, b, c) => [{ nd: [p([].concat(a), { style: 'BangHD' })] }, b, { nd: [p([].concat(c), { style: 'BangHD' })] }];

  const out = [];
  out.push(p([r(TRUONG_HOA, { b: true, color: 'FFFFFF', sz: 18, spacing: 10 })],
    { style: HD, shd: NAVY, pBdr: vien(['top', 'left', 'bottom', 'right'], 4, NAVY, 4), sp: { before: 0, after: 0 } }));
  out.push(p('MẪU SOẠN NGÂN HÀNG CÂU HỎI CANVAS', { style: 'Title' }));
  out.push(p('Soạn câu hỏi trong Word theo mẫu này, nạp vào công cụ ' + CONG_CU + ' để nhận gói QTI, rồi nhập cả ngân hàng vào Canvas ' +
    'trong một lần — không phải gõ lại từng câu.', { style: 'Subtitle' }));
  out.push(p([B('Lưu ý: ', NAVY), 'phần hướng dẫn này nằm trước dòng ', B('NGÂN HÀNG:'), ' đầu tiên nên công cụ tự bỏ qua — có thể giữ nguyên hoặc xoá. ' +
    'Từ trang sau là hai ngân hàng ví dụ (Toán 12 và Tiếng Anh) có đủ mọi loại câu; thầy cô xoá các câu ví dụ rồi soạn câu hỏi của mình theo đúng cách trình bày đó.'],
  { style: 'GhiChu' }));

  out.push(h1('1. Bốn bước sử dụng'));
  out.push(buoc(1, 'Soạn câu hỏi', ['dưới một dòng ', ma('NGÂN HÀNG: <tên ngân hàng>'), '. Mỗi câu bắt đầu bằng “Câu 1.”, “Câu 2.”…; phương án “A.”, “B.”, “C.”, “D.” ' +
    'đặt ở đầu dòng; đáp án ghi ở dòng “Đáp án: …”. Một tệp có thể chứa nhiều ngân hàng.']));
  out.push(buoc(2, 'Nạp tệp', ['vào công cụ ' + CONG_CU + ': kéo thả tệp .docx vào trang (có thể nạp cùng lúc tệp Excel theo mẫu hoặc gói SCORM).']));
  out.push(buoc(3, 'Soát lại', ['từng câu như học sinh sẽ thấy: đáp án đúng được tô xanh, câu có lỗi được báo đỏ và không được xuất. Sửa trong Word rồi nạp lại.']));
  out.push(buoc(4, 'Nhập vào Canvas', ['bằng nút Tải gói QTI, rồi làm theo hướng dẫn hiện trên công cụ — New Quizzes: Item Banks → ⋮ → Import Content; ' +
    'Classic Quizzes: Settings → Import Course Content → QTI .zip file.']));

  out.push(h1('2. Các dòng đánh dấu'));
  out.push(doanHD('Từ khoá không phân biệt chữ hoa, chữ thường; viết có dấu hay không dấu đều được (NGÂN HÀNG = Ngân hàng = NGAN HANG). ' +
    'Số câu, nhãn phương án và các dòng đánh dấu phải nằm ở đầu dòng.'));
  const tdBang1 = ['Cách ghi', 'Ý nghĩa', 'Ví dụ'];
  out.push(bang([tdBang1,
    o3(ma('NGÂN HÀNG: <tên>'), 'Bắt đầu một ngân hàng câu hỏi (tên hiện trên Canvas). Một tệp có thể có nhiều ngân hàng; không có dòng này thì tên ngân hàng là tên tệp.',
      de('NGÂN HÀNG: Toán 12 – Chương 1')),
    o3(ma('ĐIỂM MẶC ĐỊNH: <số>'), 'Điểm của mỗi câu từ dòng này trở đi (không ghi thì mỗi câu 1 điểm).', de('ĐIỂM MẶC ĐỊNH: 0,25')),
    o3(ma('PHẦN I. …  /  PHẦN 2. …'), 'Tiêu đề phần. Tên phần có “đúng sai”, “trả lời ngắn” hoặc “tự luận” thì các câu trong phần mặc định thuộc loại đó.',
      de('PHẦN II. Câu trắc nghiệm đúng sai')),
    o3(ma('ĐOẠN DẪN: …  …  HẾT ĐOẠN DẪN'), 'Đoạn văn, bảng số liệu hoặc hình dùng chung; được chèn vào đầu mỗi câu nằm giữa hai dòng này.',
      de('ĐOẠN DẪN: Đọc đoạn văn sau…')),
    o3(ma('Câu 7.  Câu 7:  Question 7.'), 'Bắt đầu câu hỏi số 7. Ngay sau số câu có thể ghi điểm, mức độ, thẻ loại câu theo thứ tự bất kỳ.',
      de('Câu 7. (0,5 điểm) [TH] [ĐS] …')),
    o3(ma('(0,5 điểm)  (1đ)'), 'Điểm riêng của câu, thay cho điểm mặc định.', de('Câu 3. (1 điểm) …')),
    o3(ma('[NB]  [TH]  [VD]  [VDC]'), 'Mức độ nhận thức — hiện trong tên câu trên Canvas, ví dụ “Câu 7 [TH]”.', de('Câu 2. [VD] …')),
    o3(ma('[TN] [NĐ] [ĐS] [TLN] [SỐ] [ĐIỀN] [CHỌN] [GHÉP] [TL]'), 'Thẻ loại câu (xem mục 3). Không ghi thẻ thì công cụ tự nhận loại theo nội dung.',
      de('Câu 4. [NĐ] …')),
    o3(ma('A.  B.  C.  D.  (đến H.)'), 'Phương án, đặt ở đầu dòng. Có thể để nhiều phương án trên một dòng, cách nhau bằng phím Tab, hoặc đặt trong bảng (mỗi ô một phương án).',
      [de('A. 2 ⇥ B. 3 ⇥ C. 4 ⇥ D. 5'), r('  (⇥ là phím Tab)', { sz: 16, color: XAM })]),
    o3(ma('*A.'), 'Dấu * trước nhãn đánh dấu phương án đúng.', de('*C. Hà Nội')),
    o3(ma('a)  b)  c)  d)'), 'Các ý của câu Đúng/Sai, mỗi ý một dòng.', de('a) Hàm số đồng biến trên ℝ.')),
    o3(ma('Đáp án: …  (ĐA:  Answer:)'), 'Đáp án đúng — được ưu tiên cao nhất. Cách ghi theo từng loại câu ở mục 3.', de('Đáp án: B')),
    o3(ma('Gạch chân / chữ đỏ / tô nền'), 'Đánh dấu nhãn phương án đúng khi không có dòng “Đáp án:”. Câu Đúng/Sai: ý có nhãn được đánh dấu là Đúng, các ý còn lại là Sai.',
      [de('B', { b: true, u: true, color: DO }), de('. 2     '), de('C', { b: true, hl: 'yellow' }), de('. 3')]),
    o3(ma('[[…]]'), 'Ô điền khuyết trong nội dung câu; nhiều cách viết đúng ngăn bằng dấu |.', de('Thủ đô của Việt Nam là [[Hà Nội|Ha Noi]].')),
    o3(ma('[[*…|…|…]]'), 'Ô chọn trong danh sách thả xuống; dấu * đánh dấu lựa chọn đúng.', de('She [[*has|have]] two cats.')),
    o3(ma('trái => phải'), 'Một cặp ghép nối mỗi dòng (dùng được cả ->, →). Dòng “Nhiễu: x; y” thêm vế phải gây nhiễu.', de('Hà Nội => Việt Nam')),
    o3(ma('Lời giải:  Hướng dẫn giải:  Giải thích:  HDG:  Hướng dẫn chấm:'), 'Từ dòng này đến hết câu là lời giải / hướng dẫn chấm (giữ nguyên công thức, ảnh, bảng).',
      de('Lời giải: Ta có …')),
    o3(ma('BẢNG ĐÁP ÁN'), 'Bảng đáp án cuối ngân hàng, dạng chữ “1.A 2.C 3.B” hoặc bảng Word (hàng số câu, hàng đáp án) — điền đáp án cho các câu chưa có.',
      de('1.A  2.C  3.B  4.D')),
    o3(ma('HẾT  /  --- HẾT ---'), 'Dòng kết thúc đề, được bỏ qua.', de('--- HẾT ---')),
    o3(ma('$…$'), 'Công thức gõ nhanh bằng LaTeX (xem mục 4).', de(L`$\frac{1}{2}$,  $\sqrt{x+1}$`))
  ], { rong: [2700, 4300, 2638], tieuDe: true, soLe: true, style: 'BangHD', vien: VIEN }));

  out.push(h1('3. Loại câu hỏi và cách ghi đáp án'));
  out.push(doanHD(['Ghi thẻ loại ngay sau số câu để chọn loại, ví dụ “Câu 5. [ĐS]”. Không ghi thẻ thì công cụ tự nhận loại: có các ý a) b)… → Đúng/Sai; ' +
    'có phương án A. B.… → một hoặc nhiều đáp án; có ô [[…]] → điền khuyết (có dấu * → chọn từ danh sách); có dòng trái => phải → ghép nối; ' +
    'chỉ có dòng Đáp án → trả lời ngắn (có ± hoặc .. → điền số); không có đáp án → tự luận.']));
  const o4 = (a, b, c, d) => [{ nd: [p([ma(a)], { style: 'BangHD', jc: 'center' })] }, b, c, { nd: [p([].concat(d), { style: 'BangHD' })] }];
  out.push(bang([['Thẻ', 'Loại câu trên Canvas', 'Cách soạn', 'Cách ghi đáp án'],
    o4('[TN]', 'Một đáp án (Multiple Choice)', 'Phương án A. … H., đúng một phương án đúng', de('Đáp án: B')),
    o4('[NĐ]', 'Nhiều đáp án (Multiple Answers)', 'Phương án A. … H., từ hai phương án đúng trở lên', de('Đáp án: A, C')),
    o4('[ĐS]', 'Đúng/Sai nhiều ý — dạng đề thi THPT từ 2025 (Multiple Dropdowns, hoặc tách thành các câu Đúng/Sai)', 'Các ý a) b) c) d), mỗi ý một dòng',
      [de('Đáp án: ĐSĐS'), r('  hoặc  ', { sz: 16, color: XAM }), de('a) Đ, b) S, c) Đ, d) S')]),
    o4('[TLN]', 'Trả lời ngắn (Short Answer)', 'Không có phương án; các cách viết đúng ngăn bằng dấu ;', de('Đáp án: 8/3; 2,67')),
    o4('[SỐ]', 'Điền số (Numerical)', 'Không có phương án; đáp án là một số, có thể kèm sai số hoặc một khoảng',
      [de('Đáp án: 12,5'), r('  hoặc  ', { sz: 16, color: XAM }), de('12,5 ± 0,1'), r('  hoặc  ', { sz: 16, color: XAM }), de('1,5 .. 2')]),
    o4('[ĐIỀN]', 'Điền khuyết nhiều ô (Fill in Multiple Blanks)', 'Ô [[đáp án]] ngay trong nội dung câu', de('[[Hà Nội|Ha Noi]]')),
    o4('[CHỌN]', 'Chọn từ danh sách (Multiple Dropdowns)', 'Ô [[lựa chọn|*đúng|lựa chọn]] ngay trong nội dung câu', de('[[go|*went|gone]]')),
    o4('[GHÉP]', 'Ghép nối (Matching)', 'Mỗi dòng một cặp trái => phải; dòng “Nhiễu:” (tuỳ chọn) thêm vế phải thừa', de('Nhiễu: Lào; Thái Lan')),
    o4('[TL]', 'Tự luận (Essay) — giáo viên chấm tay', 'Không có đáp án tự động', de('Hướng dẫn chấm: …'))
  ], { rong: [950, 2900, 3150, 2638], tieuDe: true, soLe: true, style: 'BangHD', vien: VIEN }));

  out.push(h1('4. Công thức toán'));
  out.push(cham([B('Dùng Equation của Word: '), 'Insert → Equation (Chèn → Phương trình) hoặc phím tắt Alt + =. Phân số, căn, tích phân, hệ phương trình, vectơ… ' +
    'được chuyển nguyên vẹn sang Canvas, học sinh phóng to vẫn nét.']));
  out.push(cham([B('Không dùng MathType / Equation 3.0: '), 'công cụ sẽ báo lỗi. Cách chuyển: thẻ MathType → Convert Equations… → chọn chuyển sang ' +
    'Office Math (Word 2007 trở lên) → Convert. Không có MathType thì chụp công thức thành ảnh PNG rồi chèn lại.']));
  out.push(cham([B('Gõ nhanh LaTeX '), 'giữa hai dấu $, ví dụ ', de(L`$\frac{1}{2}$`), ', ', de(L`$\sqrt{x+1}$`), ', ', de(L`$x^2$`), ', ', de(L`$\vec{a}$`), ', ',
    de(L`$\int_0^1 f(x)\,dx$`), ' — công cụ tự chuyển thành công thức.']));
  out.push(cham([B('Số thập phân '), 'viết bằng dấu phẩy như thường lệ (2,5). Riêng câu điền số [SỐ], khi làm bài trên Canvas học sinh gõ dấu chấm (2.5).']));

  out.push(h1('5. Hình ảnh và bảng'));
  out.push(cham([B('Chèn ảnh PNG/JPG trực tiếp '), '(Insert → Pictures), để kiểu In Line with Text (cùng dòng với chữ). Ảnh có thể nằm trong nội dung câu, phương án hoặc lời giải.']));
  out.push(cham([B('Ghi mô tả ảnh '), '(chuột phải vào ảnh → View Alt Text): công cụ đưa mô tả lên Canvas cho học sinh dùng trình đọc màn hình.']));
  out.push(cham([B('Không dùng '), 'Shapes, Text Box, SmartArt, biểu đồ của Word hay ảnh EMF/WMF — Canvas không hiển thị được. Hãy chụp thành ảnh PNG rồi chèn.']));
  out.push(cham([B('Bảng Word '), 'dùng được trong nội dung câu và đoạn dẫn. Bảng mà mỗi ô là một phương án (bắt đầu bằng A. B. …) được hiểu là các phương án.']));

  out.push(h1('6. Mẹo để nạp không lỗi'));
  out.push(cham(['Ưu tiên dòng ', B('Đáp án:'), ' — rõ ràng nhất, không phụ thuộc định dạng. Chỉ gạch chân / tô đỏ / tô nền khi không có dòng Đáp án.']));
  out.push(cham('Phương án sai để chữ thường; không tô màu cả trang hay cả câu hỏi.'));
  out.push(cham('Câu Đúng/Sai được Canvas chấm theo từng ý (mỗi ý đúng = điểm câu ÷ số ý); thang 0,1 – 0,25 – 0,5 – 1 điểm của Bộ GD&ĐT không áp dụng được.'));
  out.push(cham('Trong một ngân hàng không nên lặp lại số câu; nếu đề đánh số lại từ đầu ở mỗi phần, công cụ ghi thêm tên phần vào tên câu.'));
  return out;
}

function nganHangToan() {
  const out = [];
  out.push(p([r('NGÂN HÀNG: '), r(BANK_TOAN)], { style: 'NganHang', pageBreakBefore: true }));
  out.push(p([B('ĐIỂM MẶC ĐỊNH: ', NAVY), '0,25']));
  out.push(p('PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn', { style: 'Phan' }));

  // Câu 1 — phân số, phương án trên một dòng, dòng Đáp án
  out.push(dauCau(1, ['[NB]'], ['Tập xác định của hàm số ', M('y=', mf('x+1', 'x−2')), ' là']));
  out.push(paMotDong([['A', [M('ℝ∖{2}')]], ['B', [M('ℝ∖{−1}')]], ['C', [M('ℝ')]], ['D', [M('(2;+∞)')]]]));
  out.push(dapAn('A'));
  out.push(loiGiai(['Hàm số xác định khi ', M('x−2≠0⇔x≠2'), '.']));

  // Câu 2 — tích phân có cận, phương án trong bảng 2×2, đánh dấu bằng gạch chân + chữ đỏ ở nhãn
  out.push(dauCau(2, ['[TH]'], ['Tích phân ', M(mtp('1', '2', '(2x−1)dx')), ' bằng']));
  const oPA = (L0, nd, kieu) => ({ nd: [p([nhanPA(L0, kieu), '. '].concat(nd), { style: 'TrongBang' })] });
  out.push(bang([[oPA('A', ['1']), oPA('B', ['2'], 'do')], [oPA('C', [M(mf('3', '2'))]), oPA('D', [M(mf('5', '2'))])]],
    { rong: [4819, 4819], vien: 'FFFFFF', dem: 30, leTrai: 0 }));
  out.push(loiGiai(['Ta có ', M(mtp('1', '2', '(2x−1)dx'), '=(', msup('2', '2'), '−2)−(', msup('1', '2'), '−1)=2'), '.']));

  // Câu 3 — ảnh PNG; đáp án lấy từ BẢNG ĐÁP ÁN cuối ngân hàng
  out.push(dauCau(3, ['[TH]'], ['Cho hàm số ', M('y=f(x)'), ' có đồ thị như hình vẽ bên.']));
  out.push(p([hinh('rIdHinh1', 300, 225, 'Đồ thị hàm số',
    'Đồ thị hàm số y = f(x) trên hệ trục Oxy: đi lên đến điểm (−1; 2), đi xuống đến điểm (1; −2) rồi đi lên.')], { jc: 'center', keepNext: true }));
  out.push(p('Hàm số đã cho đồng biến trên khoảng nào dưới đây?'));
  out.push(paDong('A', [M('(−1;1)'), '.']));
  out.push(paDong('B', [M('(−1;2)'), '.']));
  out.push(paDong('C', [M('(1;+∞)'), '.']));
  out.push(paDong('D', [M('(−2;2)'), '.']));
  out.push(loiGiai(['Trên khoảng ', M('(1;+∞)'), ' đồ thị đi lên từ trái sang phải nên hàm số đồng biến.']));

  // Câu 4 — hệ phương trình, căn bậc hai, nhiều đáp án
  out.push(dauCau(4, ['[VD]', '[NĐ]'], ['Cho hệ phương trình ', M(mhe('x+y=3', 'x−y=1')), '. Những khẳng định nào sau đây là đúng?']));
  out.push(paDong('A', ['Hệ có nghiệm duy nhất ', M('(x;y)=(2;1)'), '.']));
  out.push(paDong('B', [M('xy=2'), '.']));
  out.push(paDong('C', [M('x=', mcan('2')), '.']));
  out.push(paDong('D', [M(msup('x', '2'), '+', msup('y', '2'), '=5'), '.']));
  out.push(dapAn('A, B, D'));
  out.push(loiGiai(['Cộng vế theo vế hai phương trình được ', M('2x=4'), ' nên ', M('x=2'), ', ', M('y=1'), '. Khi đó ', M('xy=2'), ' và ',
    M(msup('x', '2'), '+', msup('y', '2'), '=5'), '.']));

  // Câu 5 — bảng trong nội dung câu, đáp án đánh dấu bằng tô nền nhãn
  out.push(dauCau(5, ['[TH]'], ['Cho hàm số ', M('y=f(x)'), ' có bảng xét dấu của đạo hàm ', M('f′(x)'), ' như sau:']));
  const c = (nd) => ({ nd: [p(nd, { style: 'TrongBang', jc: 'center' })] });
  // ô bảng chỉ có một công thức thì Word lưu lại thành công thức khối → dùng chữ thường (nghiêng) cho bảng xét dấu
  const ng = (s) => r(s, { i: true });
  out.push(bang([
    [c([ng('x')]), c('−∞'), c(''), c('−1'), c(''), c('2'), c(''), c('+∞')],
    [c([ng('f′(x)')]), c(''), c('+'), c('0'), c('−'), c('0'), c('+'), c('')]
  ], { rong: [1300, 900, 900, 900, 900, 900, 900, 900], jc: 'center' }));
  out.push(p(['Hàm số ', M('y=f(x)'), ' đạt cực tiểu tại điểm']));
  out.push(paMotDong([['A', [M('x=−1')]], ['B', [M('x=0')]], ['C', [M('x=−2')]], ['D', [M('x=2')], 'nen']]));
  out.push(loiGiai(['Đạo hàm ', M('f′(x)'), ' đổi dấu từ âm sang dương khi đi qua ', M('x=2'), ' nên hàm số đạt cực tiểu tại ', M('x=2'), '.']));

  // Đoạn dẫn dùng chung cho Câu 6, Câu 7 (có bảng số liệu); đáp án ở BẢNG ĐÁP ÁN
  const dd = { style: 'DoanDan' };
  out.push(p([B('ĐOẠN DẪN: ', NAVY), 'Thời gian tự học mỗi ngày của học sinh lớp 12A1 được thống kê trong bảng sau:'], Object.assign({ keepNext: true }, dd)));
  out.push(bang([
    [c([B('Thời gian (giờ)')]), c('[0; 2)'), c('[2; 4)'), c('[4; 6)'), c('[6; 8)')],
    [c([B('Số học sinh')]), c('5'), c('12'), c('15'), c('8')]
  ], { rong: [2200, 1300, 1300, 1300, 1300], jc: 'center' }));
  out.push(p('Dựa vào bảng trên, trả lời Câu 6 và Câu 7.', dd));
  out.push(dauCau(6, ['[NB]'], ['Cỡ mẫu của mẫu số liệu ghép nhóm trên là']));
  out.push(paMotDong([['A', ['4.']], ['B', ['35.']], ['C', ['40.']], ['D', ['45.']]]));
  out.push(dauCau(7, ['[TH]'], ['Nhóm chứa mốt của mẫu số liệu trên là']));
  out.push(paMotDong([['A', ['[0; 2).']], ['B', ['[2; 4).']], ['C', ['[4; 6).']], ['D', ['[6; 8).']]]));
  out.push(p([B('HẾT ĐOẠN DẪN', NAVY)], dd));

  // Câu 8 — Đúng/Sai kiểu THPT 2025, vectơ
  out.push(p('PHẦN II. Câu trắc nghiệm đúng sai', { style: 'Phan' }));
  out.push(dauCau(8, ['(1 điểm)', '[TH]'], ['Trong không gian ', M('Oxyz'), ', cho hai vectơ ', M(mvec('a'), '=(1;2;−2)'), ' và ', M(mvec('b'), '=(2;−1;0)'),
    '. Mỗi khẳng định sau đúng hay sai?']));
  out.push(yDong('a', [M(mabs(mvec('a')), '=3'), '.']));
  out.push(yDong('b', [M(mvec('a'), '⋅', mvec('b'), '=0'), '.']));
  out.push(yDong('c', [M(mvec('a'), '+', mvec('b'), '=(3;1;2)'), '.']));
  out.push(yDong('d', ['Vectơ ', M(mvec('a')), ' cùng phương với vectơ ', M(mvec('c'), '=(−2;−4;4)'), '.']));
  out.push(dapAn('a) Đ, b) Đ, c) S, d) Đ'));
  out.push(loiGiai([M(mabs(mvec('a')), '=', mcan('1+4+4'), '=3'), '; ', M(mvec('a'), '⋅', mvec('b'), '=2−2+0=0'), '; ',
    M(mvec('a'), '+', mvec('b'), '=(3;1;−2)'), '; ', M(mvec('c'), '=−2', mvec('a')), '.']));

  // Câu 9, 10 — trả lời ngắn (nhiều cách viết) và điền số (sai số, LaTeX gõ nhanh)
  out.push(p('PHẦN III. Câu trắc nghiệm trả lời ngắn', { style: 'Phan' }));
  out.push(dauCau(9, ['(0,5 điểm)', '[VD]'], ['Tính diện tích ', M('S'), ' của hình phẳng giới hạn bởi đồ thị hàm số ', M('y=', msup('x', '2')),
    ', trục hoành và hai đường thẳng ', M('x=0'), ', ', M('x=2'), ' (viết kết quả dưới dạng phân số tối giản hoặc số thập phân làm tròn đến hàng phần trăm).']));
  out.push(dapAn('8/3; 2,67'));
  out.push(loiGiai([M('S=', mtp('0', '2', [msup('x', '2'), 'dx']), '=', mf('8', '3'), '≈2,67'), '.']));
  out.push(dauCau(10, ['(0,5 điểm)', '[VD]', '[SỐ]'], ['Một quả bóng được ném thẳng đứng lên trên. Độ cao của bóng sau ', '$t$', ' giây là ',
    L`$h(t)=-4,9t^2+19,6t$`, ' (mét). Độ cao lớn nhất mà quả bóng đạt được là bao nhiêu mét?']));
  out.push(dapAn('19,6 ± 0,05'));
  out.push(loiGiai([L`$h'(t)=-9,8t+19,6=0\Leftrightarrow t=2$`, ', khi đó ', L`$h(2)=19,6$`, ' (m).']));

  // Câu 11 — tự luận, hướng dẫn chấm có công thức hiển thị riêng dòng
  out.push(p('PHẦN IV. Câu tự luận', { style: 'Phan' }));
  out.push(dauCau(11, ['(1 điểm)', '[VDC]', '[TL]'], ['Giải hệ phương trình ', M(mhe([msup('x', '2'), '+', msup('y', '2'), '=5'], 'x+y=3')), '.']));
  out.push(p([B('Hướng dẫn chấm:', NAVY)]));
  out.push(p(['– Từ ', M('x+y=3'), ' suy ra ', M('y=3−x'), '. (0,25 điểm)']));
  out.push(p('– Thế vào phương trình thứ nhất, ta được (0,25 điểm):'));
  out.push(p([MKhoi(msup('x', '2'), '+', msup('(3−x)', '2'), '=5⇔', msup('x', '2'), '−3x+2=0')]));
  out.push(p(['– Giải được ', M('x=1'), ' hoặc ', M('x=2'), '. (0,25 điểm)']));
  out.push(p(['– Kết luận: hệ có hai nghiệm ', M('(1;2)'), ' và ', M('(2;1)'), '. (0,25 điểm)']));

  // Bảng đáp án cuối ngân hàng (điền đáp án cho Câu 3, 6, 7; các câu khác trùng khớp)
  out.push(p([B('BẢNG ĐÁP ÁN', NAVY)], { style: 'Phan' }));
  const k = (s, dam) => ({ nd: [p(dam ? [B(s)] : s, { style: 'TrongBang', jc: 'center' })], fill: dam ? NEN_NAVY : null });
  out.push(bang([
    [k('Câu', 1), k('1', 1), k('2', 1), k('3', 1), k('4', 1), k('5', 1), k('6', 1), k('7', 1)],
    [k('Đáp án', 1), k('A'), k('B'), k('C'), k('A, B, D'), k('D'), k('C'), k('C')]
  ], { rong: [1450, 1100, 1100, 1100, 1450, 1100, 1100, 1100], jc: 'center' }));
  out.push(p('--- HẾT ---', { jc: 'center', sp: { before: 240 } }));
  return out;
}

function nganHangAnh() {
  const out = [];
  out.push(p([r('NGÂN HÀNG: '), r(BANK_ANH)], { style: 'NganHang', pageBreakBefore: true }));
  out.push(p([B('ĐIỂM MẶC ĐỊNH: ', NAVY), '0,5']));

  // Câu 1 — điền khuyết nhiều ô
  out.push(dauCau(1, ['[TH]', '[ĐIỀN]'], ['Complete the sentences with the correct form of the verbs in brackets.']));
  out.push(p('1. She [[has lived]] in Hà Nội since 2015. (live)'));
  out.push(p('2. The letter [[was written]] by my grandfather in 1975. (write)'));
  out.push(loiGiai(['(1) thì hiện tại hoàn thành với “since”; (2) câu bị động ở thì quá khứ đơn.'], 'Giải thích'));

  // Câu 2 — chọn từ danh sách thả xuống
  out.push(dauCau(2, ['[TH]', '[CHỌN]'], ['Choose the correct options to complete the passage.']));
  out.push(p('Last summer, my family [[go|*went|have gone]] to Đà Nẵng. We [[stay|have stayed|*stayed]] in a small hotel near the beach.'));

  // Câu 3 — ghép nối + vế phải gây nhiễu
  out.push(dauCau(3, ['(1 điểm)', '[NB]', '[GHÉP]'], ['Match each word with its meaning.']));
  out.push(p('generous => willing to give money, help or time freely'));
  out.push(p('reliable => able to be trusted or depended on'));
  out.push(p('ambitious => having a strong wish to be successful'));
  out.push(p([B('Nhiễu: '), 'easily annoyed; feeling nervous with other people']));

  // Câu 4 — tìm lỗi sai (phần gạch chân), một đáp án
  out.push(dauCau(4, ['[TH]', '[TN]'], ['Choose the underlined part that needs correction in the following sentence.']));
  const nhanLoi = (s) => r(s, { b: true, sz: 20, color: NAVY });
  out.push(p(['Each of the ', r('students', { u: true }), ' ', nhanLoi('(A)'), ' ', r('have', { u: true }), ' ', nhanLoi('(B)'), ' ',
    r('to submit', { u: true }), ' ', nhanLoi('(C)'), ' the essay ', r('before', { u: true }), ' ', nhanLoi('(D)'), ' Friday.']));
  out.push(paMotDong([['A', ['students']], ['B', ['have']], ['C', ['to submit']], ['D', ['before']]]));
  out.push(dapAn('B'));
  out.push(loiGiai(['“Each of + danh từ số nhiều” đi với động từ số ít: sửa have → has.'], 'Giải thích'));

  // Câu 5 — trả lời ngắn, chấp nhận hai từ
  out.push(dauCau(5, ['[NB]', '[TLN]'], ['Write ONE word that matches the definition: “a person who writes books, stories or articles”.']));
  out.push(dapAn('writer; author'));
  return out;
}

/* ---- các phần XML khác của .docx ---- */

function stylesXml() {
  const f = (ten) => '<w:rFonts w:ascii="' + ten + '" w:eastAsia="' + ten + '" w:hAnsi="' + ten + '" w:cs="' + ten + '"/>';
  const sz = (n) => '<w:sz w:val="' + n + '"/><w:szCs w:val="' + n + '"/>';
  const st = (type, id, name, inner, extra) => '<w:style w:type="' + type + '"' + (extra || '') + ' w:styleId="' + id + '"><w:name w:val="' + x(name) + '"/>' + inner + '</w:style>';
  const tabs = (ds) => '<w:tabs>' + ds.map(([kieu, pos]) => '<w:tab w:val="' + kieu + '" w:pos="' + pos + '"/>').join('') + '</w:tabs>';
  const q = RONG_CHU / 4;
  return DECL + '<w:styles xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' + f(FONT_DE) + sz(26) + '<w:lang w:val="vi-VN" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    st('paragraph', 'Normal', 'Normal', '<w:qFormat/>', ' w:default="1"') +
    st('character', 'DefaultParagraphFont', 'Default Paragraph Font', '<w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/>', ' w:default="1"') +
    st('table', 'TableNormal', 'Normal Table', '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>', ' w:default="1"') +
    st('numbering', 'NoList', 'No List', '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>', ' w:default="1"') +
    st('table', 'TableGrid', 'Table Grid', '<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
      '<w:tblPr><w:tblBorders>' + vien(['top', 'left', 'bottom', 'right', 'insideH', 'insideV'], 4, 'auto') + '</w:tblBorders></w:tblPr>') +
    st('paragraph', 'Title', 'Title', '<w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:uiPriority w:val="10"/><w:qFormat/>' +
      '<w:pPr><w:spacing w:before="360" w:after="80" w:line="240" w:lineRule="auto"/><w:contextualSpacing/></w:pPr>' +
      '<w:rPr>' + f(FONT) + '<w:b/><w:bCs/><w:color w:val="' + NAVY + '"/><w:kern w:val="28"/>' + sz(44) + '</w:rPr>') +
    st('paragraph', 'Subtitle', 'Subtitle', '<w:basedOn w:val="Normal"/><w:next w:val="HuongDan"/><w:uiPriority w:val="11"/><w:qFormat/>' +
      '<w:pPr><w:pBdr>' + vien(['bottom'], 12, DO, 8) + '</w:pBdr><w:spacing w:after="240" w:line="264" w:lineRule="auto"/></w:pPr>' +
      '<w:rPr>' + f(FONT) + '<w:color w:val="' + XAM + '"/>' + sz(21) + '</w:rPr>') +
    st('paragraph', 'Heading1', 'heading 1', '<w:basedOn w:val="Normal"/><w:next w:val="HuongDan"/><w:uiPriority w:val="9"/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="320" w:after="120" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr>' +
      '<w:rPr>' + f(FONT) + '<w:b/><w:bCs/><w:color w:val="' + NAVY + '"/>' + sz(27) + '</w:rPr>') +
    st('paragraph', 'Heading2', 'heading 2', '<w:basedOn w:val="Normal"/><w:next w:val="HuongDan"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="80" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr>' +
      '<w:rPr>' + f(FONT) + '<w:b/><w:bCs/><w:color w:val="' + NAVY + '"/>' + sz(23) + '</w:rPr>') +
    st('paragraph', 'HuongDan', 'Hướng dẫn', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="20"/><w:qFormat/>' +
      '<w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr><w:rPr>' + f(FONT) + '<w:color w:val="' + CHU + '"/>' + sz(20) + '</w:rPr>') +
    st('paragraph', 'GhiChu', 'Ghi chú', '<w:basedOn w:val="HuongDan"/><w:uiPriority w:val="21"/><w:qFormat/>' +
      '<w:pPr><w:pBdr>' + vien(['left'], 24, NAVY, 8) + '</w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="' + NEN_NAVY + '"/>' +
      '<w:spacing w:before="120" w:after="200"/><w:ind w:left="227" w:right="113"/></w:pPr>') +
    st('paragraph', 'Buoc', 'Bước', '<w:basedOn w:val="HuongDan"/><w:uiPriority w:val="22"/><w:qFormat/><w:pPr><w:ind w:left="1021" w:hanging="1021"/></w:pPr>') +
    st('paragraph', 'BangHD', 'Bảng hướng dẫn', '<w:basedOn w:val="HuongDan"/><w:uiPriority w:val="23"/>' +
      '<w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr><w:rPr>' + sz(18) + '</w:rPr>') +
    st('paragraph', 'NganHang', 'Ngân hàng', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="24"/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:pBdr>' + vien(['bottom'], 12, NAVY, 4) + '</w:pBdr><w:spacing w:before="0" w:after="200"/></w:pPr>' +
      '<w:rPr>' + f(FONT) + '<w:b/><w:bCs/><w:color w:val="' + NAVY + '"/>' + sz(30) + '</w:rPr>') +
    st('paragraph', 'Phan', 'Phần', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="25"/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/></w:pPr><w:rPr>' + f(FONT) + '<w:b/><w:bCs/><w:color w:val="' + NAVY + '"/>' + sz(23) + '</w:rPr>') +
    st('paragraph', 'DoanDan', 'Đoạn dẫn', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="26"/><w:qFormat/>' +
      '<w:pPr><w:pBdr>' + vien(['left'], 18, VANG, 8) + '</w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="' + NEN_VANG + '"/><w:ind w:left="170"/></w:pPr>') +
    st('paragraph', 'PhuongAn', 'Phương án một dòng', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="27"/><w:qFormat/>' +
      '<w:pPr>' + tabs([['left', q], ['left', 2 * q], ['left', 3 * q]]) + '</w:pPr>') +
    st('paragraph', 'TrongBang', 'Trong bảng', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="28"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>') +
    st('paragraph', 'Footer', 'footer', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>' +
      '<w:pPr>' + tabs([['right', RONG_CHU]]) + '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>' + f(FONT) + '<w:color w:val="' + XAM + '"/>' + sz(16) + '</w:rPr>') +
    '</w:styles>';
}

function numberingXml() {
  return DECL + '<w:numbering xmlns:w="' + NS_W + '">' +
    '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' +
    '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>' +
    '<w:pPr><w:ind w:left="397" w:hanging="284"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="' + DO + '"/></w:rPr></w:lvl>' +
    '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
}

function settingsXml() {
  return DECL + '<w:settings xmlns:w="' + NS_W + '" xmlns:m="' + NS_M + '"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/>' +
    '<w:characterSpacingControl w:val="doNotCompress"/>' +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    '<m:mathPr><m:mathFont m:val="' + FONT_TOAN + '"/><m:brkBin m:val="before"/><m:brkBinSub m:val="--"/><m:smallFrac m:val="0"/><m:dispDef/>' +
    '<m:lMargin m:val="0"/><m:rMargin m:val="0"/><m:defJc m:val="centerGroup"/><m:wrapIndent m:val="1440"/><m:intLim m:val="subSup"/><m:naryLim m:val="undOvr"/></m:mathPr>' +
    '<w:themeFontLang w:val="vi-VN"/><w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/></w:settings>';
}

function fontTableXml() {
  const font = (ten, inner) => '<w:font w:name="' + ten + '">' + inner + '</w:font>';
  return DECL + '<w:fonts xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '">' +
    font(FONT_DE, '<w:panose1 w:val="02020603050405020304"/><w:charset w:val="00"/><w:family w:val="roman"/><w:pitch w:val="variable"/>') +
    font(FONT, '<w:altName w:val="' + FONT_DE + '"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/>') +
    font(FONT_TOAN, '<w:panose1 w:val="02040503050406030204"/><w:charset w:val="00"/><w:family w:val="roman"/><w:pitch w:val="variable"/>') +
    font('Arial', '<w:panose1 w:val="020B0604020202020204"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/>') +
    '</w:fonts>';
}

function footerXml() {
  const truong = (lenh) => '<w:fldSimple w:instr=" ' + lenh + ' "><w:r><w:t>1</w:t></w:r></w:fldSimple>';
  return DECL + '<w:ftr xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:pBdr>' + vien(['top'], 4, NAVY, 4) + '</w:pBdr></w:pPr>' +
    r(TRUONG + ' · Mẫu soạn ngân hàng câu hỏi Canvas').xml + T.xml + r('Trang ').xml + truong('PAGE') + r('/').xml + truong('NUMPAGES') + '</w:p></w:ftr>';
}

function coreXml(tieuDe, chuDe, moTa) {
  return DECL + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + x(tieuDe) + '</dc:title><dc:subject>' + x(chuDe) + '</dc:subject>' +
    '<dc:creator>' + x(TRUONG) + '</dc:creator><cp:keywords>Canvas; QTI; ngân hàng câu hỏi; mẫu</cp:keywords><dc:description>' + x(moTa) + '</dc:description>' +
    '<cp:lastModifiedBy>' + x(TRUONG) + '</cp:lastModifiedBy><cp:revision>1</cp:revision>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + NGAY_ISO + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + NGAY_ISO + '</dcterms:modified>' +
    '</cp:coreProperties>';
}
function appXml() {
  return DECL + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>' + x(CONG_CU + ' – tools/tao-mau.cjs') + '</Application>' +
    '<DocSecurity>0</DocSecurity><Company>' + x(TRUONG) + '</Company><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>';
}
function relsXml(ds) { // ds: [[Id, Type, Target]]
  return DECL + '<Relationships xmlns="' + NS_PR + '">' + ds.map(([id, type, target]) =>
    '<Relationship Id="' + id + '" Type="' + type + '" Target="' + x(target) + '"/>').join('') + '</Relationships>';
}
function contentTypesXml(macDinh, rieng) { // macDinh: [[đuôi, kiểu]], rieng: [[/phần, kiểu]]
  return DECL + '<Types xmlns="' + NS_CT + '">' +
    macDinh.map(([e, t]) => '<Default Extension="' + e + '" ContentType="' + t + '"/>').join('') +
    rieng.map(([pn, t]) => '<Override PartName="' + pn + '" ContentType="' + t + '"/>').join('') + '</Types>';
}

/* ======================= tạo .docx ======================= */

async function taoDocx(opts) {
  opts = opts || {};
  soHinh = 0;
  const anh = opts.anh || veDoThi();
  const body = [].concat(phanHuongDan(), nganHangToan(), nganHangAnh()).map((b) => b.xml).join('');
  const sect = '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="' + KHO_A4.w + '" w:h="' + KHO_A4.h + '"/>' +
    '<w:pgMar w:top="' + KHO_A4.le + '" w:right="' + KHO_A4.le + '" w:bottom="' + KHO_A4.le + '" w:left="' + KHO_A4.le + '" w:header="567" w:footer="567" w:gutter="0"/>' +
    '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>';
  const doc = DECL + '<w:document xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '" xmlns:m="' + NS_M + '" xmlns:wp="' + NS_WP + '" ' +
    'xmlns:a="' + NS_A + '" xmlns:pic="' + NS_PIC + '"><w:body>' + body + sect + '</w:body></w:document>';
  const files = [
    { path: '[Content_Types].xml', data: contentTypesXml(
      [['rels', 'application/vnd.openxmlformats-package.relationships+xml'], ['xml', 'application/xml'], ['png', 'image/png']],
      [['/word/document.xml', CT_OFF + 'wordprocessingml.document.main+xml'],
        ['/word/styles.xml', CT_OFF + 'wordprocessingml.styles+xml'],
        ['/word/settings.xml', CT_OFF + 'wordprocessingml.settings+xml'],
        ['/word/fontTable.xml', CT_OFF + 'wordprocessingml.fontTable+xml'],
        ['/word/numbering.xml', CT_OFF + 'wordprocessingml.numbering+xml'],
        ['/word/footer1.xml', CT_OFF + 'wordprocessingml.footer+xml'],
        ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
        ['/docProps/app.xml', CT_OFF + 'extended-properties+xml']]) },
    { path: '_rels/.rels', data: relsXml([['rId1', RT + 'officeDocument', 'word/document.xml'], ['rId2', RT_CORE, 'docProps/core.xml'],
      ['rId3', RT + 'extended-properties', 'docProps/app.xml']]) },
    { path: 'docProps/core.xml', data: coreXml('Mẫu soạn ngân hàng câu hỏi Canvas (Word)', 'Ngân hàng câu hỏi Canvas',
      'Mẫu Word cho công cụ ' + CONG_CU + ': phần hướng dẫn và hai ngân hàng ví dụ đủ mọi loại câu.') },
    { path: 'docProps/app.xml', data: appXml() },
    { path: 'word/document.xml', data: doc },
    { path: 'word/_rels/document.xml.rels', data: relsXml([['rIdStyles', RT + 'styles', 'styles.xml'], ['rIdSettings', RT + 'settings', 'settings.xml'],
      ['rIdFonts', RT + 'fontTable', 'fontTable.xml'], ['rIdNumbering', RT + 'numbering', 'numbering.xml'],
      ['rIdFooter1', RT + 'footer', 'footer1.xml'], ['rIdHinh1', RT + 'image', 'media/image1.png']]) },
    { path: 'word/styles.xml', data: stylesXml() },
    { path: 'word/settings.xml', data: settingsXml() },
    { path: 'word/fontTable.xml', data: fontTableXml() },
    { path: 'word/numbering.xml', data: numberingXml() },
    { path: 'word/footer1.xml', data: footerXml() },
    { path: 'word/media/image1.png', data: anh }
  ];
  return zip.writeZip(files, { compress: true, date: NGAY });
}

/* ======================= Excel ======================= */

// cột của trang "Câu hỏi": [tiêu đề, độ rộng, kiểu ô (căn giữa?)]
const COT = [
  ['STT', 6, 'giua'], ['Loại câu', 21, 'giua'], ['Nội dung câu hỏi', 58], ['Ảnh', 27],
  ['A', 22], ['B', 22], ['C', 22], ['D', 22], ['E', 13], ['F', 13], ['G', 13], ['H', 13],
  ['Đáp án', 15, 'giua'], ['Điểm', 7, 'giua'], ['Lời giải', 44], ['Ngân hàng', 23], ['Mức độ', 9, 'giua'], ['Chủ đề', 18]
];
const LOAI_CAU = ['TN – Một đáp án', 'NĐ – Nhiều đáp án', 'ĐS – Đúng/Sai', 'TLN – Trả lời ngắn', 'SỐ – Điền số', 'ĐIỀN – Điền khuyết',
  'CHỌN – Chọn từ danh sách', 'GHÉP – Ghép nối', 'TL – Tự luận', 'ĐOẠN – Đoạn dẫn'];
const MUC_DO = ['NB', 'TH', 'VD', 'VDC'];
const [TN, ND, DS, TLN, SO, DIEN, CHON, GHEP, TLU, DOAN] = LOAI_CAU;
const ANH_X = { row: 3, col: 3, w: 192, h: 144 };          // ảnh nổi neo ở ô D3 (dòng của câu có đồ thị)

// dòng ví dụ: {STT, Loại, ND, A…H, DA, Diem, LG, NH, Muc, ChuDe}; ND có thể là mảng run [{t, u}]
function dongViDu() {
  const tn = BANK_TOAN, an = BANK_ANH;
  return [
    { STT: 1, Loai: TN, ND: L`Tập xác định của hàm số $y=\dfrac{x+1}{x-2}$ là`, A: L`$\mathbb{R}\setminus\{2\}$`, B: L`$\mathbb{R}\setminus\{-1\}$`,
      C: L`$\mathbb{R}$`, D: L`$(2;+\infty)$`, DA: 'A', Diem: 0.25, LG: L`Hàm số xác định khi $x-2\ne 0\Leftrightarrow x\ne 2$.`, NH: tn, Muc: 'NB', ChuDe: 'Hàm số' },
    { STT: 2, Loai: TN, ND: L`Cho hàm số $y=f(x)$ có đồ thị như hình bên. Hàm số đã cho đồng biến trên khoảng nào dưới đây?`,
      A: L`$(-1;1)$`, B: L`$(-1;2)$`, C: L`$(1;+\infty)$`, D: L`$(-2;2)$`, DA: 'C', Diem: 0.25,
      LG: L`Trên khoảng $(1;+\infty)$ đồ thị đi lên từ trái sang phải nên hàm số đồng biến.`, NH: tn, Muc: 'TH', ChuDe: 'Hàm số', anh: true },
    { STT: 3, Loai: ND, ND: L`Cho hệ phương trình $\begin{cases} x+y=3\\ x-y=1 \end{cases}$. Những khẳng định nào sau đây là đúng?`,
      A: L`Hệ có nghiệm duy nhất $(x;y)=(2;1)$`, B: L`$xy=2$`, C: L`$x=\sqrt{2}$`, D: L`$x^2+y^2=5$`, DA: 'A, B, D', Diem: 0.25,
      LG: L`Cộng vế theo vế hai phương trình được $2x=4$ nên $x=2$, $y=1$.`, NH: tn, Muc: 'VD', ChuDe: 'Hệ phương trình' },
    { Loai: DOAN, ND: ['Thời gian tự học mỗi ngày của học sinh lớp 12A1 được thống kê như sau:', 'Thời gian (giờ):  [0; 2)  –  [2; 4)  –  [4; 6)  –  [6; 8)',
      'Số học sinh:          5      –    12     –    15     –    8', 'Dựa vào số liệu trên, trả lời câu 4 và câu 5.'].join(NL), NH: tn },
    { STT: 4, Loai: TN, ND: 'Cỡ mẫu của mẫu số liệu ghép nhóm trên là', A: '4', B: '35', C: '40', D: '45', DA: 'C', Diem: 0.25, NH: tn, Muc: 'NB', ChuDe: 'Thống kê' },
    { STT: 5, Loai: TN, ND: 'Nhóm chứa mốt của mẫu số liệu trên là', A: '[0; 2)', B: '[2; 4)', C: '[4; 6)', D: '[6; 8)', DA: 'C', Diem: 0.25,
      LG: 'Nhóm [4; 6) có tần số lớn nhất (15).', NH: tn, Muc: 'TH', ChuDe: 'Thống kê' },
    { Loai: DOAN, ND: 'HẾT', NH: tn },
    { STT: 6, Loai: DS, ND: L`Trong không gian $Oxyz$, cho hai vectơ $\vec{a}=(1;2;-2)$ và $\vec{b}=(2;-1;0)$. Mỗi khẳng định sau đúng hay sai?`,
      A: L`$|\vec{a}|=3$`, B: L`$\vec{a}\cdot\vec{b}=0$`, C: L`$\vec{a}+\vec{b}=(3;1;2)$`, D: L`$\vec{a}$ cùng phương với $\vec{c}=(-2;-4;4)$`,
      DA: 'ĐĐSĐ', Diem: 1, LG: L`$|\vec{a}|=\sqrt{1+4+4}=3$; $\vec{a}\cdot\vec{b}=2-2+0=0$; $\vec{a}+\vec{b}=(3;1;-2)$; $\vec{c}=-2\vec{a}$.`,
      NH: tn, Muc: 'TH', ChuDe: 'Vectơ trong không gian' },
    { STT: 7, Loai: TLN, ND: L`Tính diện tích hình phẳng giới hạn bởi đồ thị hàm số $y=x^2$, trục hoành và hai đường thẳng $x=0$, $x=2$ (viết dạng phân số tối giản hoặc số thập phân làm tròn đến hàng phần trăm).`,
      DA: '8/3; 2,67', Diem: 0.5, LG: L`$S=\displaystyle\int_0^2 x^2\,dx=\dfrac{8}{3}\approx 2,67$.`, NH: tn, Muc: 'VD', ChuDe: 'Tích phân' },
    { STT: 8, Loai: SO, ND: L`Một quả bóng được ném thẳng đứng lên trên, độ cao của bóng sau $t$ giây là $h(t)=-4,9t^2+19,6t$ (mét). Độ cao lớn nhất của quả bóng là bao nhiêu mét?`,
      DA: '19,6 ± 0,05', Diem: 0.5, LG: L`$h'(t)=-9,8t+19,6=0\Leftrightarrow t=2$; $h(2)=19,6$ (m).`, NH: tn, Muc: 'VD', ChuDe: 'Ứng dụng đạo hàm' },
    { STT: 9, Loai: SO, ND: L`Nhập một giá trị của $x$ thoả mãn bất phương trình $x^2-3x+2\le 0$.`, DA: '1 .. 2', Diem: 0.5,
      LG: L`$x^2-3x+2\le 0\Leftrightarrow 1\le x\le 2$ — mọi số thuộc đoạn $[1;2]$ đều đúng.`, NH: tn, Muc: 'TH', ChuDe: 'Bất phương trình' },
    { STT: 10, Loai: TLU, ND: L`Giải hệ phương trình $\begin{cases} x^2+y^2=5\\ x+y=3 \end{cases}$.`, DA: L`Hệ có hai nghiệm $(1;2)$ và $(2;1)$.`, Diem: 1,
      LG: [L`Từ $x+y=3$ suy ra $y=3-x$. Thế vào phương trình đầu: $x^2+(3-x)^2=5\Leftrightarrow x^2-3x+2=0\Leftrightarrow x=1$ hoặc $x=2$.`,
        L`Vậy hệ có hai nghiệm $(1;2)$ và $(2;1)$.`].join(NL), NH: tn, Muc: 'VDC', ChuDe: 'Hệ phương trình' },
    { STT: 1, Loai: DIEN, ND: ['Complete the sentences with the correct form of the verbs in brackets.', '1. She [[has lived]] in Hà Nội since 2015. (live)',
      '2. The letter [[was written]] by my grandfather in 1975. (write)'].join(NL), Diem: 0.5,
      LG: '(1) thì hiện tại hoàn thành với “since”; (2) câu bị động ở thì quá khứ đơn.', NH: an, Muc: 'TH', ChuDe: 'Grammar' },
    { STT: 2, Loai: CHON, ND: ['Choose the correct options to complete the passage.',
      'Last summer, my family [[go|*went|have gone]] to Đà Nẵng. We [[stay|have stayed|*stayed]] in a small hotel near the beach.'].join(NL),
    Diem: 0.5, NH: an, Muc: 'TH', ChuDe: 'Grammar' },
    { STT: 3, Loai: GHEP, ND: 'Match each word with its meaning.', A: 'generous => willing to give money, help or time freely',
      B: 'reliable => able to be trusted or depended on', C: 'ambitious => having a strong wish to be successful',
      D: 'Nhiễu: easily annoyed; feeling nervous with other people', Diem: 1, NH: an, Muc: 'NB', ChuDe: 'Vocabulary' },
    { STT: 4, Loai: TN, ND: [{ t: 'Choose the underlined part that needs correction in the following sentence.' + NL + 'Each of the ' }, { t: 'students', u: true },
      { t: ' (A) ' }, { t: 'have', u: true }, { t: ' (B) ' }, { t: 'to submit', u: true }, { t: ' (C) the essay ' }, { t: 'before', u: true }, { t: ' (D) Friday.' }],
    A: 'students', B: 'have', C: 'to submit', D: 'before', DA: 'B', Diem: 0.5, LG: '“Each of + danh từ số nhiều” đi với động từ số ít: sửa have → has.',
    NH: an, Muc: 'TH', ChuDe: 'Grammar' },
    { STT: 5, Loai: TLN, ND: 'Write ONE word that matches the definition: “a person who writes books, stories or articles”.', DA: 'writer; author',
      Diem: 0.5, NH: an, Muc: 'NB', ChuDe: 'Vocabulary' }
  ];
}

function cotChu(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
function chuCua(v) { return v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.map((x0) => x0.t).join('') : String(v); }
// ước lượng chiều cao dòng (pt) theo số dòng chữ khi xuống dòng trong ô rộng `rong` ký tự
function soDongChu(s, rong) {
  const cpl = Math.max(4, Math.floor(rong * 1.1));
  return chuCua(s).split(NL).reduce((n, d) => n + Math.max(1, Math.ceil(d.length / cpl)), 0);
}

// kiểu ô (cellXfs) — xem stylesXlsx()
const XF = { MAC_DINH: 0, TIEU_DE: 1, CHU: 2, GIUA: 3, DOAN: 4, DOAN_GIUA: 5, TEN: 6, PHU: 7, MUC: 8, NHAN: 9, VAN: 10, NHAN_BANG: 11, GHI_CHU: 12 };

function stylesXlsx() {
  const font = (o) => '<font>' + (o.b ? '<b/>' : '') + (o.i ? '<i/>' : '') + '<sz val="' + (o.sz || 11) + '"/><color rgb="FF' + (o.c || CHU) + '"/>' +
    '<name val="Calibri"/><family val="2"/></font>';
  const fonts = [font({}), font({ b: 1, c: 'FFFFFF' }), font({ b: 1, sz: 16, c: 'FFFFFF' }), font({ i: 1, c: NAVY }), font({ b: 1, sz: 12, c: DO }),
    font({ b: 1, c: NAVY }), font({ sz: 10, c: XAM })];
  const fill = (m) => '<fill><patternFill patternType="solid"><fgColor rgb="FF' + m + '"/><bgColor indexed="64"/></patternFill></fill>';
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', fill(NAVY), fill(NEN_VANG), fill(NEN_NAVY)];
  const canh = (k, kieu, m) => '<' + k + ' style="' + kieu + '"><color rgb="FF' + m + '"/></' + k + '>';
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border>' + ['left', 'right', 'top', 'bottom'].map((k) => canh(k, 'thin', 'D5DAE5')).join('') + '<diagonal/></border>',
    '<border><left/><right/><top/>' + canh('bottom', 'medium', DO) + '<diagonal/></border>'];
  const xf = (font0, fill0, border, al) => '<xf numFmtId="0" fontId="' + font0 + '" fillId="' + fill0 + '" borderId="' + border + '" xfId="0"' +
    (font0 ? ' applyFont="1"' : '') + (fill0 ? ' applyFill="1"' : '') + (border ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1"><alignment ' + al + '/></xf>' : '/>');
  const tren = 'vertical="top" wrapText="1"', giua = 'horizontal="center" vertical="top" wrapText="1"';
  const xfs = [];
  xfs[XF.MAC_DINH] = xf(0, 0, 0);
  xfs[XF.TIEU_DE] = xf(1, 2, 1, 'horizontal="center" vertical="center" wrapText="1"');
  xfs[XF.CHU] = xf(0, 0, 1, tren);
  xfs[XF.GIUA] = xf(0, 0, 1, giua);
  xfs[XF.DOAN] = xf(0, 3, 1, tren);
  xfs[XF.DOAN_GIUA] = xf(0, 3, 1, giua);
  xfs[XF.TEN] = xf(2, 2, 0, 'vertical="center" indent="1"');
  xfs[XF.PHU] = xf(3, 0, 0, 'vertical="center" wrapText="1"');
  xfs[XF.MUC] = xf(4, 0, 2, 'vertical="bottom"');
  xfs[XF.NHAN] = xf(5, 0, 0, tren);
  xfs[XF.VAN] = xf(0, 0, 0, tren);
  xfs[XF.NHAN_BANG] = xf(5, 4, 1, tren);
  xfs[XF.GHI_CHU] = xf(6, 0, 0, tren);
  return DECL + '<styleSheet xmlns="' + NS_X + '"><fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
    '<fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/>' +
    '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
}

function BangChuoi() { // chuỗi dùng chung (sharedStrings)
  const ds = [], chiSo = new Map();
  return {
    so(v) {
      const k = typeof v === 'string' ? 's' + v : 'r' + JSON.stringify(v);
      if (!chiSo.has(k)) { chiSo.set(k, ds.length); ds.push(v); }
      return chiSo.get(k);
    },
    xml() {
      const si = (v) => typeof v === 'string' ? '<si><t xml:space="preserve">' + x(v) + '</t></si>'
        : '<si>' + v.map((run) => '<r><rPr>' + (run.b ? '<b/>' : '') + (run.u ? '<u/>' : '') + '<sz val="11"/><color rgb="FF' + CHU + '"/>' +
          '<rFont val="Calibri"/><family val="2"/></rPr><t xml:space="preserve">' + x(run.t) + '</t></r>').join('') + '</si>';
      return DECL + '<sst xmlns="' + NS_X + '" count="' + ds.length + '" uniqueCount="' + ds.length + '">' + ds.map(si).join('') + '</sst>';
    }
  };
}
function oXml(ref, v, s, bc) {
  if (v == null || v === '') return '<c r="' + ref + '" s="' + s + '"/>';
  if (typeof v === 'number') return '<c r="' + ref + '" s="' + s + '"><v>' + v + '</v></c>';
  return '<c r="' + ref + '" s="' + s + '" t="s"><v>' + bc.so(typeof v === 'string' ? core.nfc(v) : v) + '</v></c>';
}
function dongXml(r0, o) { // o: {ht, custom, cells: xml}
  return '<row r="' + r0 + '"' + (o.spans ? ' spans="' + o.spans + '"' : '') + (o.ht ? ' ht="' + o.ht + '"' + (o.custom ? ' customHeight="1"' : '') : '') + '>' + o.cells + '</row>';
}
function dataValidation(sqref, o) {
  const a = (k, v) => v == null ? '' : ' ' + k + '="' + x(v) + '"';
  return '<dataValidation' + a('type', o.list ? 'list' : null) + (o.list ? ' errorStyle="warning"' : '') + ' allowBlank="1" showInputMessage="1"' +
    (o.list ? ' showErrorMessage="1"' : '') + a('errorTitle', o.errorTitle) + a('error', o.error) + a('promptTitle', o.promptTitle) + a('prompt', o.prompt) +
    ' sqref="' + sqref + '">' + (o.list ? '<formula1>' + x('"' + o.list.join(',') + '"') + '</formula1>' : '') + '</dataValidation>';
}

function sheetCauHoi(bc) {
  const rows = [], cuoi = cotChu(COT.length - 1), N = COT.length;
  rows.push(dongXml(1, { spans: '1:' + N, ht: 33, custom: true, cells: COT.map(([td], c) => oXml(cotChu(c) + '1', td, XF.TIEU_DE, bc)).join('') }));
  const khoa = ['STT', 'Loai', 'ND', 'Anh', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'DA', 'Diem', 'LG', 'NH', 'Muc', 'ChuDe'];
  dongViDu().forEach((d, i) => {
    const r0 = i + 2, doan = d.Loai === DOAN;
    let cao = 1;
    const cells = khoa.map((k, c) => {
      const v = d[k], giua = COT[c][2] === 'giua';
      if (v != null && typeof v !== 'number') cao = Math.max(cao, soDongChu(v, COT[c][1]));
      return oXml(cotChu(c) + r0, v, doan ? (giua ? XF.DOAN_GIUA : XF.DOAN) : (giua ? XF.GIUA : XF.CHU), bc);
    }).join('');
    let ht = Math.max(20, cao * 15 + 5);
    if (d.anh) ht = Math.max(ht, Math.ceil((ANH_X.h + 12) * 0.75));
    if (d.anh && r0 !== ANH_X.row) throw new Error('Ảnh nổi phải neo ở dòng ' + r0);
    rows.push(dongXml(r0, { spans: '1:' + N, ht: ht, custom: !!d.anh, cells: cells }));
  });
  const dv = [
    dataValidation('B2:B1000', { list: LOAI_CAU, errorTitle: 'Loại câu', error: 'Nên chọn loại câu trong danh sách (hoặc gõ mã ngắn: TN, NĐ, ĐS, TLN, SỐ, ĐIỀN, CHỌN, GHÉP, TL, ĐOẠN). Để trống: công cụ tự nhận loại.',
      promptTitle: 'Loại câu', prompt: 'Chọn trong danh sách. Để trống thì công cụ tự nhận loại theo nội dung và cột Đáp án.' }),
    dataValidation('Q2:Q1000', { list: MUC_DO, errorTitle: 'Mức độ', error: 'Mức độ là NB, TH, VD hoặc VDC.', promptTitle: 'Mức độ',
      prompt: 'NB – Nhận biết, TH – Thông hiểu, VD – Vận dụng, VDC – Vận dụng cao.' }),
    dataValidation('C2:C1000', { promptTitle: 'Nội dung câu hỏi', prompt: L`Xuống dòng: Alt + Enter. Công thức: $x^2$, $\frac{1}{2}$. Ô điền: [[đáp án]]. Ô chọn: [[sai|*đúng|sai]].` }),
    dataValidation('E2:L1000', { promptTitle: 'Phương án / ý / cặp ghép', prompt: 'TN, NĐ: phương án. ĐS: các ý a, b, c, d. GHÉP: trái => phải (ô không có => hoặc ghi Nhiễu: x; y là vế phải gây nhiễu).' }),
    dataValidation('M2:M1000', { promptTitle: 'Đáp án', prompt: 'TN: B · NĐ: A, C · ĐS: ĐSĐS · TLN: 8/3; 2,67 · SỐ: 12,5 hoặc 12,5 ± 0,1 hoặc 1,5 .. 2 · ĐIỀN, CHỌN, GHÉP: để trống.' })
  ];
  return DECL + '<worksheet xmlns="' + NS_X + '" xmlns:r="' + NS_R + '"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="A1:' + cuoi + (rows.length) + '"/>' +
    '<sheetViews><sheetView tabSelected="1" zoomScale="100" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="C2" sqref="C2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
    '<cols>' + COT.map(([, w], c) => '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    '<dataValidations count="' + dv.length + '">' + dv.join('') + '</dataValidations>' +
    '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '<headerFooter><oddFooter>' + x('&L&8Trường Ngôi Sao Hoàng Mai – Mẫu ngân hàng câu hỏi Canvas&R&8Trang &P/&N') + '</oddFooter></headerFooter>' +
    '<ignoredErrors><ignoredError sqref="A1:R1000" numberStoredAsText="1"/></ignoredErrors>' +
    '<drawing r:id="rId1"/></worksheet>';
}

function sheetHuongDan(bc) {
  const RONG = [24, 62, 36, 13];
  const rows = [], gop = [];
  let r0 = 0;
  const them = (cells, o) => { r0++; rows.push(Object.assign({ r: r0, cells: cells }, o || {})); return r0; };
  const tron = (ref) => gop.push(ref);
  // Excel tự co dòng không có customHeight nhưng bỏ qua chữ xuống dòng trong ô gộp → dòng có ô gộp phải cố định chiều cao
  const dongGop = (v, xf, ht) => { const r1 = them([[v, xf], ['', xf], ['', xf], ['', xf]], { ht, custom: true }); tron('A' + r1 + ':D' + r1); };
  const muc = (s) => { them([]); dongGop(s, XF.MUC, 22); };
  const noi = (nhan, v, xfNhan) => { // nhãn ở cột A, nội dung gộp B:D
    const r1 = them([[nhan, xfNhan || XF.NHAN], [v, XF.VAN], ['', XF.VAN], ['', XF.VAN]],
      { ht: Math.max(18, soDongChu(v, RONG[1] + RONG[2] + RONG[3]) * 15 + 4), custom: true });
    tron('B' + r1 + ':D' + r1);
  };
  const bang4 = (tieuDe, ds) => {
    them(tieuDe.map((t) => [t, XF.TIEU_DE]), { ht: 22 });
    ds.forEach((d) => {
      const cao = Math.max(...d.map((v, c) => soDongChu(v, RONG[c])));
      them(d.map((v, c) => [v, c === 0 ? XF.NHAN_BANG : c === 3 ? XF.GIUA : XF.CHU]), { ht: Math.max(18, cao * 15 + 4) });
    });
  };

  dongGop('MẪU NHẬP NGÂN HÀNG CÂU HỎI CANVAS', XF.TEN, 34);
  dongGop(TRUONG + ' · dùng với công cụ ' + CONG_CU, XF.PHU, 20);
  noi('Cách điền', 'Mỗi dòng ở trang «Câu hỏi» là một câu hỏi. Các dòng ví dụ (dòng nền vàng là đoạn dẫn) cho thấy cách ghi mọi loại câu — ' +
    'xoá chúng trước khi soạn. Giữ nguyên dòng tiêu đề (có thể đổi thứ tự cột hoặc thêm cột riêng, cột lạ được bỏ qua).');

  muc('1. CÁCH DÙNG');
  noi('Bước 1', 'Mỗi dòng một câu: chọn Loại câu trong danh sách (hoặc để trống để công cụ tự nhận loại), ghi Nội dung, các phương án, Đáp án, Điểm.');
  noi('Bước 2', 'Ghi tên ngân hàng ở cột Ngân hàng (để trống = giữ ngân hàng của dòng trên). Nhiều tên khác nhau → nhiều ngân hàng.');
  noi('Bước 3', 'Lưu tệp, mở công cụ ' + CONG_CU + ', kéo thả tệp Excel vào (kèm các ảnh ghi ở cột Ảnh nếu có). Soát lại từng câu: câu báo đỏ không được xuất.');
  noi('Bước 4', 'Bấm Tải gói QTI rồi nhập vào Canvas — New Quizzes: Item Banks → ⋮ → Import Content; Classic Quizzes: Settings → Import Course Content → QTI .zip file.');

  muc('2. CÁC CỘT CỦA TRANG «CÂU HỎI»');
  bang4(['Cột', 'Ý nghĩa', 'Ví dụ', 'Bắt buộc'], [
    ['STT', 'Số thứ tự câu, hiện trong tên câu trên Canvas (“Câu 3”). Để trống thì tự đánh số.', '3', 'Không'],
    ['Loại câu', 'Chọn trong danh sách (bấm mũi tên ở ô). Để trống thì công cụ tự nhận loại. Xem bảng 3.', TN, 'Không'],
    ['Nội dung câu hỏi', 'Nội dung câu. Xuống dòng trong ô: Alt + Enter. In đậm, nghiêng, gạch chân, chỉ số trên/dưới được giữ nguyên. Công thức gõ LaTeX giữa hai dấu $.',
      L`Giải phương trình $x^2-5x+6=0$`, 'Có'],
    ['Ảnh', 'Tên tệp ảnh (nhiều ảnh ngăn bằng ;) — khi nạp, kéo thả kèm các ảnh đó. Hoặc dán ảnh thẳng lên trang tính, đặt trên đúng dòng câu hỏi (như câu 2 ví dụ).',
      'hinh-cau-3.png', 'Không'],
    ['A … H', 'TN, NĐ: các phương án. ĐS: các ý a, b, c, d (cột A–D). GHÉP: mỗi ô một cặp “trái => phải”. Có thể đánh dấu * trước phương án đúng thay cho cột Đáp án.',
      '*Hà Nội', 'Tuỳ loại'],
    ['Đáp án', 'Cách ghi theo từng loại câu ở bảng 3.', 'B', 'Tuỳ loại'],
    ['Điểm', 'Điểm của câu (để trống: 1 điểm). Dùng dấu phẩy hoặc dấu chấm.', '0,25', 'Không'],
    ['Lời giải', 'Lời giải hoặc hướng dẫn chấm (giữ công thức). Ảnh dán ở cột này được đưa vào lời giải.', 'Ta có …', 'Không'],
    ['Ngân hàng', 'Tên ngân hàng câu hỏi trên Canvas. Để trống thì giữ ngân hàng của dòng trên; không có tên nào thì lấy tên tệp.', 'Toán 12 – Chương 1', 'Nên có'],
    ['Mức độ', 'NB, TH, VD, VDC — hiện trong tên câu trên Canvas (“Câu 3 [TH]”).', 'TH', 'Không'],
    ['Chủ đề', 'Chủ đề / bài học, giúp thầy cô sắp xếp câu hỏi.', 'Hàm số', 'Không']
  ]);

  muc('3. LOẠI CÂU VÀ CÁCH GHI ĐÁP ÁN');
  bang4(['Loại câu', 'Cách soạn (cột Nội dung và A–H)', 'Cột Đáp án', 'Trên Canvas'], [
    [TN, 'Phương án ở các cột A–H, đúng một phương án đúng.', 'Một chữ cái: B', 'Multiple Choice'],
    [ND, 'Phương án ở các cột A–H, từ hai phương án đúng trở lên.', 'Các chữ cái: A, C', 'Multiple Answers'],
    [DS, 'Các ý a, b, c, d ở cột A–D (dạng đề THPT từ 2025).', 'ĐSĐS  hoặc  a-Đ, b-S, c-Đ, d-S', 'Multiple Dropdowns'],
    [TLN, 'Không dùng cột A–H.', 'Các cách viết đúng ngăn bằng dấu ; ví dụ 8/3; 2,67', 'Short Answer'],
    [SO, 'Không dùng cột A–H.', '12,5  hoặc  12,5 ± 0,1  hoặc  khoảng 1,5 .. 2', 'Numerical'],
    [DIEN, 'Ô [[đáp án]] trong nội dung; nhiều cách viết: [[8/3|2,67]].', 'Để trống', 'Fill In Multiple Blanks'],
    [CHON, 'Ô [[sai|*đúng|sai]] trong nội dung, dấu * trước lựa chọn đúng.', 'Để trống', 'Multiple Dropdowns'],
    [GHEP, 'Mỗi ô A–H một cặp “trái => phải”. Ô không có => (hoặc ghi “Nhiễu: x; y”) là vế phải gây nhiễu.', 'Để trống', 'Matching'],
    [TLU, 'Ghi hướng dẫn chấm ở cột Lời giải.', 'Đáp án tóm tắt (tuỳ chọn)', 'Essay (chấm tay)'],
    [DOAN, 'Nội dung là đoạn văn / số liệu dùng chung cho các dòng bên dưới, đến dòng ĐOẠN kế tiếp; dòng ĐOẠN ghi “HẾT” để kết thúc.', '—', 'Chèn vào đầu mỗi câu']
  ]);

  muc('4. LƯU Ý');
  noi('Công thức', L`Gõ LaTeX giữa hai dấu $, ví dụ $\frac{1}{2}$, $\sqrt{x+1}$, $x^2$, $\vec{a}$, $\int_0^1 f(x)\,dx$, $\begin{cases} x+y=3\\ x-y=1 \end{cases}$ — công cụ tự chuyển thành công thức trên Canvas.`);
  noi('Số thập phân', 'Viết bằng dấu phẩy như thường lệ (2,5). Riêng câu SỐ, khi làm bài trên Canvas học sinh gõ dấu chấm (2.5).');
  noi('Ảnh', 'Dùng ảnh PNG hoặc JPG. Không dùng ảnh EMF, WMF, SVG — Canvas không hiển thị được.');
  noi('Ô gộp', 'Ô gộp ở các cột Loại câu, Điểm, Ngân hàng, Mức độ, Chủ đề được hiểu cho mọi dòng trong vùng gộp.');
  noi('Đúng/Sai', 'Canvas chấm câu Đúng/Sai theo từng ý (mỗi ý đúng = điểm câu ÷ số ý); thang 0,1 – 0,25 – 0,5 – 1 điểm của Bộ GD&ĐT không áp dụng được.');

  const xmlRows = rows.map((d) => dongXml(d.r, { ht: d.ht, custom: !!d.custom,
    cells: d.cells.map(([v, s], c) => oXml(cotChu(c) + d.r, v, s, bc)).join('') }));
  return DECL + '<worksheet xmlns="' + NS_X + '" xmlns:r="' + NS_R + '"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:D' + r0 + '"/>' +
    '<sheetViews><sheetView showGridLines="0" zoomScale="100" workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/><cols>' + RONG.map((w, c) => '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' +
    '<sheetData>' + xmlRows.join('') + '</sheetData>' +
    '<mergeCells count="' + gop.length + '">' + gop.map((g) => '<mergeCell ref="' + g + '"/>').join('') + '</mergeCells>' +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
}

function drawingXml() {
  const emu = (px) => px * 9525, cx = emu(ANH_X.w), cy = emu(ANH_X.h);
  return DECL + '<xdr:wsDr xmlns:xdr="' + NS_XDR + '" xmlns:a="' + NS_A + '"><xdr:oneCellAnchor>' +
    '<xdr:from><xdr:col>' + ANH_X.col + '</xdr:col><xdr:colOff>' + emu(6) + '</xdr:colOff><xdr:row>' + (ANH_X.row - 1) + '</xdr:row><xdr:rowOff>' + emu(6) + '</xdr:rowOff></xdr:from>' +
    '<xdr:ext cx="' + cx + '" cy="' + cy + '"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Hình 1" descr="' +
    x('Đồ thị hàm số y = f(x): đi lên đến điểm (−1; 2), đi xuống đến điểm (1; −2) rồi đi lên.') + '"/>' +
    '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
    '<xdr:blipFill><a:blip xmlns:r="' + NS_R + '" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
    '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
    '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
}

async function taoXlsx(opts) {
  opts = opts || {};
  const anh = opts.anh || veDoThi();
  const bc = BangChuoi();
  const s1 = sheetCauHoi(bc), s2 = sheetHuongDan(bc);
  const wb = DECL + '<workbook xmlns="' + NS_X + '" xmlns:r="' + NS_R + '"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15600" activeTab="0"/></bookViews>' +
    '<sheets><sheet name="Câu hỏi" sheetId="1" r:id="rId1"/><sheet name="Hướng dẫn" sheetId="2" r:id="rId2"/></sheets>' +
    '<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">' + x("'Câu hỏi'!$1:$1") + '</definedName></definedNames>' +
    '<calcPr calcId="191029"/></workbook>';
  const files = [
    { path: '[Content_Types].xml', data: contentTypesXml(
      [['rels', 'application/vnd.openxmlformats-package.relationships+xml'], ['xml', 'application/xml'], ['png', 'image/png']],
      [['/xl/workbook.xml', CT_OFF + 'spreadsheetml.sheet.main+xml'],
        ['/xl/worksheets/sheet1.xml', CT_OFF + 'spreadsheetml.worksheet+xml'],
        ['/xl/worksheets/sheet2.xml', CT_OFF + 'spreadsheetml.worksheet+xml'],
        ['/xl/styles.xml', CT_OFF + 'spreadsheetml.styles+xml'],
        ['/xl/sharedStrings.xml', CT_OFF + 'spreadsheetml.sharedStrings+xml'],
        ['/xl/drawings/drawing1.xml', CT_OFF + 'drawing+xml'],
        ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
        ['/docProps/app.xml', CT_OFF + 'extended-properties+xml']]) },
    { path: '_rels/.rels', data: relsXml([['rId1', RT + 'officeDocument', 'xl/workbook.xml'], ['rId2', RT_CORE, 'docProps/core.xml'],
      ['rId3', RT + 'extended-properties', 'docProps/app.xml']]) },
    { path: 'docProps/core.xml', data: coreXml('Mẫu nhập ngân hàng câu hỏi Canvas (Excel)', 'Ngân hàng câu hỏi Canvas',
      'Mẫu Excel cho công cụ ' + CONG_CU + ': trang Câu hỏi (dòng ví dụ mọi loại câu) và trang Hướng dẫn.') },
    { path: 'docProps/app.xml', data: appXml() },
    { path: 'xl/workbook.xml', data: wb },
    { path: 'xl/_rels/workbook.xml.rels', data: relsXml([['rId1', RT + 'worksheet', 'worksheets/sheet1.xml'], ['rId2', RT + 'worksheet', 'worksheets/sheet2.xml'],
      ['rId3', RT + 'styles', 'styles.xml'], ['rId4', RT + 'sharedStrings', 'sharedStrings.xml']]) },
    { path: 'xl/worksheets/sheet1.xml', data: s1 },
    { path: 'xl/worksheets/_rels/sheet1.xml.rels', data: relsXml([['rId1', RT + 'drawing', '../drawings/drawing1.xml']]) },
    { path: 'xl/worksheets/sheet2.xml', data: s2 },
    { path: 'xl/styles.xml', data: stylesXlsx() },
    { path: 'xl/sharedStrings.xml', data: bc.xml() },
    { path: 'xl/drawings/drawing1.xml', data: drawingXml() },
    { path: 'xl/drawings/_rels/drawing1.xml.rels', data: relsXml([['rId1', RT + 'image', '../media/image1.png']]) },
    { path: 'xl/media/image1.png', data: anh }
  ];
  return zip.writeZip(files, { compress: true, date: NGAY });
}

/* ======================= chạy từ dòng lệnh ======================= */

async function chay(thuMuc) {
  thuMuc = thuMuc || path.join(__dirname, '..', 'mau');
  fs.mkdirSync(thuMuc, { recursive: true });
  const anh = veDoThi();
  const docx = await taoDocx({ anh }), xlsx = await taoXlsx({ anh });
  const pDocx = path.join(thuMuc, TEN_DOCX), pXlsx = path.join(thuMuc, TEN_XLSX);
  fs.writeFileSync(pDocx, docx);
  fs.writeFileSync(pXlsx, xlsx);
  return { docx: pDocx, xlsx: pXlsx, kichThuoc: { docx: docx.length, xlsx: xlsx.length } };
}

module.exports = {
  taoDocx, taoXlsx, veDoThi, maHoaPng, chay,
  BANK_TOAN, BANK_ANH, TEN_DOCX, TEN_XLSX, LOAI_CAU, MUC_DO, COT, ANH_X, NGAY
};

if (require.main === module) {
  const i = process.argv.indexOf('--out');
  const ra = i > 0 ? path.resolve(process.argv[i + 1] || '.') : null;
  chay(ra).then((kq) => {
    console.log('Đã tạo ' + kq.docx + ' (' + kq.kichThuoc.docx + ' byte)');
    console.log('Đã tạo ' + kq.xlsx + ' (' + kq.kichThuoc.xlsx + ' byte)');
  }).catch((e) => { console.error(e && e.stack || e); process.exitCode = 1; });
}
