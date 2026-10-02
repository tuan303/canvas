/* tests/fixtures/xlsx/tao-xlsx.cjs — dựng file .xlsx tối thiểu (hợp lệ) để kiểm thử js/xlsx.js, chỉ dùng js/zip.js
 *
 * taoXlsx({ sheets: [{ name, hidden, rows: [[soDong, [o, o, …]]], merges: ['A1:C1'], images: [neo], prefix: 'x', noRefs }],
 *           noSharedStrings }) → Promise<Uint8Array>
 * Ô (o): null = không có ô | 'chuỗi' (chuỗi dùng chung) | số | {s} | {rich:[{t,b,i,u,strike,sup,sub}]} | {inline} | {inlineRich}
 *        {n} | {bool} | {e} | {f, v} (công thức số) | {f, str} (công thức chuỗi) | {f} (chưa tính) | {blank:true}
 *        {img: Uint8Array} (ảnh "Place in cell" — richData) | {wps: Uint8Array} (ảnh WPS =DISPIMG) | {xml: '<c …/>'} (thô)
 * Neo ảnh nổi: { row, col (từ 0), data, descr (văn bản thay thế), kind: 'two'|'one', cx, alt: true (bọc mc:AlternateContent Choice+Fallback), media: tên dùng chung }
 */
'use strict';
const zlib = require('zlib');
const core = require('../../../js/core.js');
const zip = require('../../../js/zip.js');

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function cotChu(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

/* PNG thật (w×h, một màu) — để mọi file ảnh khác nhau theo màu */
function taoPng(w, h, rgb) {
  const dong = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { dong[1 + x * 3] = rgb[0]; dong[2 + x * 3] = rgb[1]; dong[3 + x * 3] = rgb[2]; }
  const raw = Buffer.concat(Array.from({ length: h }, () => dong));
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(core.crc32(new Uint8Array(td)));
    return Buffer.concat([len, td, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return new Uint8Array(png);
}
// JPEG giả (chỉ đủ phần đầu để nhận dạng) và EMF giả
function taoJpgGia() { return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xFF, 0xD9]); }
function taoEmfGia() { const u = new Uint8Array(88); u[0] = 1; u[40] = 0x20; u[41] = 0x45; u[42] = 0x4D; u[43] = 0x46; return u; }

function runXml(r, p) {
  const pr = [];
  if (r.b) pr.push('<' + p + 'b/>');
  if (r.i) pr.push('<' + p + 'i/>');
  if (r.strike) pr.push('<' + p + 'strike/>');
  if (r.u) pr.push('<' + p + 'u' + (r.u === true ? '' : ' val="' + r.u + '"') + '/>');
  if (r.sup) pr.push('<' + p + 'vertAlign val="superscript"/>');
  if (r.sub) pr.push('<' + p + 'vertAlign val="subscript"/>');
  pr.push('<' + p + 'sz val="11"/><' + p + 'rFont val="Calibri"/>');
  return '<' + p + 'r><' + p + 'rPr>' + pr.join('') + '</' + p + 'rPr><' + p + 't xml:space="preserve">' + esc(r.t) + '</' + p + 't></' + p + 'r>';
}

async function taoXlsx(spec) {
  const files = [];
  const them = (path, data) => files.push({ path, data });
  const sst = [], sstIdx = {};
  let sstCount = 0;
  function ssId(xmlBody) { sstCount++; if (sstIdx[xmlBody] == null) { sstIdx[xmlBody] = sst.length; sst.push(xmlBody); } return sstIdx[xmlBody]; }
  const media = [];   // {name, data}
  const mediaTen = {};
  function themMedia(data, ten) {
    if (ten && mediaTen[ten]) return mediaTen[ten];
    const ext = data[0] === 0x89 ? 'png' : data[0] === 0xFF ? 'jpeg' : 'emf';
    const name = 'image' + (media.length + 1) + '.' + ext;
    media.push({ name, data });
    if (ten) mediaTen[ten] = name;
    return name;
  }
  const inCell = [];  // tên media cho ảnh trong ô (theo thứ tự vm)
  const wps = [];     // {id, media}

  const sheetsOut = [];
  (spec.sheets || []).forEach((sh, si) => {
    const p = sh.prefix ? sh.prefix + ':' : '';
    const rowsXml = [];
    const ds = (sh.rows || []).slice().sort((a, b) => a[0] - b[0]);
    let rTruoc = 0;
    ds.forEach(([r, cells]) => {
      if (sh.noRefs) while (rTruoc + 1 < r) { rowsXml.push('<' + p + 'row/>'); rTruoc++; }
      rTruoc = r;
      const cx = [];
      (cells || []).forEach((o, c) => {
        if (o == null) { if (sh.noRefs) cx.push('<' + p + 'c/>'); return; }
        const ref = sh.noRefs ? '' : ' r="' + cotChu(c) + r + '"';
        if (typeof o === 'string') o = spec.noSharedStrings ? { inline: o } : { s: o };
        else if (typeof o === 'number') o = { n: o };
        if (o.xml) { cx.push(o.xml); return; }
        if (o.blank) { cx.push('<' + p + 'c' + ref + ' s="0"/>'); return; }
        if (o.s != null) { cx.push('<' + p + 'c' + ref + ' t="s"><' + p + 'v>' + ssId('<' + p + 't xml:space="preserve">' + esc(o.s) + '</' + p + 't>') + '</' + p + 'v></' + p + 'c>'); return; }
        if (o.rich) { cx.push('<' + p + 'c' + ref + ' t="s"><' + p + 'v>' + ssId(o.rich.map(x => runXml(x, p)).join('')) + '</' + p + 'v></' + p + 'c>'); return; }
        if (o.inline != null) { cx.push('<' + p + 'c' + ref + ' t="inlineStr"><' + p + 'is><' + p + 't xml:space="preserve">' + esc(o.inline) + '</' + p + 't></' + p + 'is></' + p + 'c>'); return; }
        if (o.inlineRich) { cx.push('<' + p + 'c' + ref + ' t="inlineStr"><' + p + 'is>' + o.inlineRich.map(x => runXml(x, p)).join('') + '</' + p + 'is></' + p + 'c>'); return; }
        if (o.bool != null) { cx.push('<' + p + 'c' + ref + ' t="b"><' + p + 'v>' + (o.bool ? 1 : 0) + '</' + p + 'v></' + p + 'c>'); return; }
        if (o.e) { cx.push('<' + p + 'c' + ref + ' t="e">' + (o.f ? '<' + p + 'f>' + esc(o.f) + '</' + p + 'f>' : '') + '<' + p + 'v>' + esc(o.e) + '</' + p + 'v></' + p + 'c>'); return; }
        if (o.img) {
          inCell.push(themMedia(o.img));
          cx.push('<' + p + 'c' + ref + ' t="e" vm="' + inCell.length + '"><' + p + 'v>#VALUE!</' + p + 'v></' + p + 'c>');
          return;
        }
        if (o.wps) {
          const id = 'ID_' + (wps.length + 1) + 'A1B2C3D4E5F6';
          wps.push({ id, media: themMedia(o.wps) });
          cx.push('<' + p + 'c' + ref + ' t="str"><' + p + 'f>_xlfn.DISPIMG("' + id + '",1)</' + p + 'f><' + p + 'v>=DISPIMG("' + id + '",1)</' + p + 'v></' + p + 'c>');
          return;
        }
        if (o.f != null && o.str != null) { cx.push('<' + p + 'c' + ref + ' t="str"><' + p + 'f>' + esc(o.f) + '</' + p + 'f><' + p + 'v>' + esc(o.str) + '</' + p + 'v></' + p + 'c>'); return; }
        if (o.f != null) { cx.push('<' + p + 'c' + ref + '><' + p + 'f>' + esc(o.f) + '</' + p + 'f>' + (o.v != null ? '<' + p + 'v>' + esc(o.v) + '</' + p + 'v>' : '') + '</' + p + 'c>'); return; }
        if (o.n != null) { cx.push('<' + p + 'c' + ref + '><' + p + 'v>' + (o.raw != null ? o.raw : String(o.n)) + '</' + p + 'v></' + p + 'c>'); return; }
        throw new Error('Ô không rõ kiểu: ' + JSON.stringify(o));
      });
      rowsXml.push('<' + p + 'row' + (sh.noRefs ? '' : ' r="' + r + '"') + '>' + cx.join('') + '</' + p + 'row>');
    });
    const n = si + 1;
    let tail = '';
    if (sh.merges && sh.merges.length) tail += '<' + p + 'mergeCells count="' + sh.merges.length + '">' + sh.merges.map(m => '<' + p + 'mergeCell ref="' + m + '"/>').join('') + '</' + p + 'mergeCells>';
    const sheetRels = [];
    if (sh.images && sh.images.length) {
      tail += '<' + p + 'drawing r:id="rId1"/>';
      sheetRels.push('<Relationship Id="rId1" Type="' + RT + 'drawing" Target="../drawings/drawing' + n + '.xml"/>');
      const drRels = [], anchors = [];
      sh.images.forEach((im, k) => {
        const rid = 'rId' + (k + 1);
        drRels.push('<Relationship Id="' + rid + '" Type="' + RT + 'image" Target="../media/' + themMedia(im.data, im.media) + '"/>');
        const cxv = im.cx || 952500;
        const pic = '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + (k + 2) + '" name="Picture ' + (k + 1) + '"' + (im.descr != null ? ' descr="' + esc(im.descr) + '"' : '') + '/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
          '<xdr:blipFill><a:blip xmlns:r="' + NS_R + '" r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
          '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cxv + '" cy="' + cxv + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>';
        const body = im.alt ? '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" Requires="a14">' + pic + '</mc:Choice><mc:Fallback>' + pic + '</mc:Fallback></mc:AlternateContent>' : pic;
        const from = '<xdr:from><xdr:col>' + im.col + '</xdr:col><xdr:colOff>19050</xdr:colOff><xdr:row>' + im.row + '</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>';
        if (im.kind === 'one') anchors.push('<xdr:oneCellAnchor>' + from + '<xdr:ext cx="' + cxv + '" cy="' + cxv + '"/>' + body + '<xdr:clientData/></xdr:oneCellAnchor>');
        else anchors.push('<xdr:twoCellAnchor editAs="oneCell">' + from + '<xdr:to><xdr:col>' + (im.col + 1) + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + (im.row + 1) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' + body + '<xdr:clientData/></xdr:twoCellAnchor>');
      });
      them('xl/drawings/drawing' + n + '.xml', DECL + '<xdr:wsDr xmlns:xdr="' + XDR + '" xmlns:a="' + NS_A + '">' + anchors.join('') + '</xdr:wsDr>');
      them('xl/drawings/_rels/drawing' + n + '.xml.rels', DECL + '<Relationships xmlns="' + NS_PR + '">' + drRels.join('') + '</Relationships>');
    }
    them('xl/worksheets/sheet' + n + '.xml', DECL + '<' + p + 'worksheet xmlns' + (p ? ':' + sh.prefix : '') + '="' + NS_MAIN + '" xmlns:r="' + NS_R + '"><' + p + 'sheetData>' + rowsXml.join('') + '</' + p + 'sheetData>' + tail + '</' + p + 'worksheet>');
    if (sheetRels.length) them('xl/worksheets/_rels/sheet' + n + '.xml.rels', DECL + '<Relationships xmlns="' + NS_PR + '">' + sheetRels.join('') + '</Relationships>');
    sheetsOut.push({ n, name: sh.name || 'Sheet' + n, hidden: sh.hidden });
  });

  // workbook + rels + content types
  const wbRels = [], ct = [];
  sheetsOut.forEach(s => {
    wbRels.push('<Relationship Id="rId' + s.n + '" Type="' + RT + 'worksheet" Target="worksheets/sheet' + s.n + '.xml"/>');
    ct.push('<Override PartName="/xl/worksheets/sheet' + s.n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
  });
  let k = sheetsOut.length;
  wbRels.push('<Relationship Id="rId' + (++k) + '" Type="' + RT + 'styles" Target="styles.xml"/>');
  ct.push('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>');
  them('xl/styles.xml', DECL + '<styleSheet xmlns="' + NS_MAIN + '"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
  if (sst.length) {
    wbRels.push('<Relationship Id="rId' + (++k) + '" Type="' + RT + 'sharedStrings" Target="sharedStrings.xml"/>');
    ct.push('<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>');
    them('xl/sharedStrings.xml', DECL + '<sst xmlns="' + NS_MAIN + '" count="' + sstCount + '" uniqueCount="' + sst.length + '">' +
      sst.map(x => '<si>' + x + '<phoneticPr fontId="0" type="noConversion"/></si>').join('') + '</sst>');
  }
  if (inCell.length) {
    // metadataType XLDAPR đứng trước để kiểm tra chỉ số t (1-based) trỏ đúng XLRICHVALUE
    wbRels.push('<Relationship Id="rId' + (++k) + '" Type="' + RT + 'sheetMetadata" Target="metadata.xml"/>');
    wbRels.push('<Relationship Id="rId' + (++k) + '" Type="http://schemas.microsoft.com/office/2017/06/relationships/rdRichValue" Target="richData/rdrichvalue.xml"/>');
    wbRels.push('<Relationship Id="rId' + (++k) + '" Type="http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueStructure" Target="richData/rdrichvaluestructure.xml"/>');
    wbRels.push('<Relationship Id="rId' + (++k) + '" Type="http://schemas.microsoft.com/office/2022/10/relationships/richValueRel" Target="richData/richValueRel.xml"/>');
    ct.push('<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/>');
    ct.push('<Override PartName="/xl/richData/rdrichvalue.xml" ContentType="application/vnd.ms-excel.rdrichvalue+xml"/>');
    ct.push('<Override PartName="/xl/richData/rdrichvaluestructure.xml" ContentType="application/vnd.ms-excel.rdrichvaluestructure+xml"/>');
    ct.push('<Override PartName="/xl/richData/richValueRel.xml" ContentType="application/vnd.ms-excel.richvaluerel+xml"/>');
    const XLRD = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';
    them('xl/metadata.xml', DECL + '<metadata xmlns="' + NS_MAIN + '" xmlns:xlrd="' + XLRD + '" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">' +
      '<metadataTypes count="2"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/>' +
      '<metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes>' +
      '<futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>' +
      '<futureMetadata name="XLRICHVALUE" count="' + inCell.length + '">' + inCell.map((_, i) => '<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="' + i + '"/></ext></extLst></bk>').join('') + '</futureMetadata>' +
      '<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata>' +
      '<valueMetadata count="' + inCell.length + '">' + inCell.map((_, i) => '<bk><rc t="2" v="' + i + '"/></bk>').join('') + '</valueMetadata></metadata>');
    them('xl/richData/rdrichvalue.xml', DECL + '<rvData xmlns="' + XLRD + '" count="' + inCell.length + '">' + inCell.map((_, i) => '<rv s="0"><v>' + i + '</v><v>5</v></rv>').join('') + '</rvData>');
    them('xl/richData/rdrichvaluestructure.xml', DECL + '<rvStructures xmlns="' + XLRD + '" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>');
    them('xl/richData/richValueRel.xml', DECL + '<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="' + NS_R + '">' + inCell.map((_, i) => '<rel r:id="rId' + (i + 1) + '"/>').join('') + '</richValueRels>');
    them('xl/richData/_rels/richValueRel.xml.rels', DECL + '<Relationships xmlns="' + NS_PR + '">' + inCell.map((m, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + RT + 'image" Target="../media/' + m + '"/>').join('') + '</Relationships>');
  }
  if (wps.length) {
    // WPS: xl/cellimages.xml + xl/_rels/cellimages.xml.rels
    them('xl/cellimages.xml', DECL + '<etc:cellImages xmlns:xdr="' + XDR + '" xmlns:r="' + NS_R + '" xmlns:a="' + NS_A + '" xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData">' +
      wps.map((w, i) => '<etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + (i + 2) + '" name="' + w.id + '" descr=""/><xdr:cNvPicPr/></xdr:nvPicPr>' +
        '<xdr:blipFill><a:blip r:embed="rId' + (i + 1) + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
        '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic></etc:cellImage>').join('') +
      '</etc:cellImages>');
    them('xl/_rels/cellimages.xml.rels', DECL + '<Relationships xmlns="' + NS_PR + '">' + wps.map((w, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + RT + 'image" Target="media/' + w.media + '"/>').join('') + '</Relationships>');
    wbRels.push('<Relationship Id="rId' + (++k) + '" Type="http://www.wps.cn/officeDocument/2020/cellImage" Target="cellimages.xml"/>');
    ct.push('<Override PartName="/xl/cellimages.xml" ContentType="application/vnd.wps-officedocument.cellimage+xml"/>');
  }
  media.forEach(m => them('xl/media/' + m.name, m.data));
  if (media.some(m => /\.emf$/.test(m.name))) ct.unshift('<Default Extension="emf" ContentType="image/x-emf"/>');

  them('xl/workbook.xml', DECL + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '"><bookViews><workbookView/></bookViews><sheets>' +
    sheetsOut.map(s => '<sheet name="' + esc(s.name) + '" sheetId="' + s.n + '"' + (s.hidden ? ' state="hidden"' : '') + ' r:id="rId' + s.n + '"/>').join('') + '</sheets></workbook>');
  them('xl/_rels/workbook.xml.rels', DECL + '<Relationships xmlns="' + NS_PR + '">' + wbRels.join('') + '</Relationships>');
  them('_rels/.rels', DECL + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="' + RT + 'officeDocument" Target="xl/workbook.xml"/></Relationships>');
  them('[Content_Types].xml', DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    (spec.sheets || []).map((sh, i) => sh.images && sh.images.length ? '<Override PartName="/xl/drawings/drawing' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '').join('') +
    ct.join('') + '</Types>');
  // [Content_Types].xml đứng đầu gói như Excel
  files.sort((a, b) => (a.path === '[Content_Types].xml' ? -1 : b.path === '[Content_Types].xml' ? 1 : 0));
  return zip.writeZip(files, { date: new Date(2026, 0, 1) });
}

module.exports = { taoXlsx, taoPng, taoJpgGia, taoEmfGia };
