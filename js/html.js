/* js/html.js — bộ phân tích HTML chịu lỗi + làm sạch HTML theo allowlist của Canvas (canvas_sanitize.rb) */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.html = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var core = (typeof require === 'function') ? require('./core.js') : root.NH.core;
  // math.js nạp sau html.js trong index.html → lấy lười lúc gọi
  var _math = null;
  function M() {
    if (!_math) _math = (typeof require === 'function') ? require('./math.js') : (root.NH && root.NH.math);
    return _math;
  }
  function tapHop(s) { var o = {}; s.split(/\s+/).forEach(function (k) { if (k) o[k] = 1; }); return o; }
  var coKhoa = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ===================== Thực thể HTML ===================== */
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  ('nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para ' +
    'middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave ' +
    'Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc ' +
    'Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc ' +
    'iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml')
    .split(' ').forEach(function (n, k) { ENT[n] = String.fromCharCode(160 + k); });
  'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho'.split(' ')
    .forEach(function (n, k) { ENT[n] = String.fromCharCode(913 + k); });
  'Sigma Tau Upsilon Phi Chi Psi Omega'.split(' ').forEach(function (n, k) { ENT[n] = String.fromCharCode(931 + k); });
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega'
    .split(' ').forEach(function (n, k) { ENT[n] = String.fromCharCode(945 + k); });
  [ // [tên, mã]
    ['thetasym', 977], ['upsih', 978], ['piv', 982], ['OElig', 338], ['oelig', 339], ['Scaron', 352], ['scaron', 353],
    ['Yuml', 376], ['fnof', 402], ['circ', 710], ['tilde', 732], ['ensp', 8194], ['emsp', 8195], ['thinsp', 8201],
    ['hairsp', 8202], ['zwnj', 8204], ['zwj', 8205], ['lrm', 8206], ['rlm', 8207], ['ndash', 8211], ['mdash', 8212],
    ['lsquo', 8216], ['rsquo', 8217], ['sbquo', 8218], ['ldquo', 8220], ['rdquo', 8221], ['bdquo', 8222],
    ['dagger', 8224], ['Dagger', 8225], ['bull', 8226], ['hellip', 8230], ['permil', 8240], ['prime', 8242],
    ['Prime', 8243], ['lsaquo', 8249], ['rsaquo', 8250], ['oline', 8254], ['frasl', 8260], ['euro', 8364],
    ['image', 8465], ['weierp', 8472], ['real', 8476], ['trade', 8482], ['alefsym', 8501], ['larr', 8592],
    ['uarr', 8593], ['rarr', 8594], ['darr', 8595], ['harr', 8596], ['crarr', 8629], ['lArr', 8656], ['uArr', 8657],
    ['rArr', 8658], ['dArr', 8659], ['hArr', 8660], ['forall', 8704], ['part', 8706], ['exist', 8707], ['empty', 8709],
    ['nabla', 8711], ['isin', 8712], ['notin', 8713], ['ni', 8715], ['prod', 8719], ['sum', 8721], ['minus', 8722],
    ['lowast', 8727], ['radic', 8730], ['prop', 8733], ['infin', 8734], ['ang', 8736], ['and', 8743], ['or', 8744],
    ['cap', 8745], ['cup', 8746], ['int', 8747], ['there4', 8756], ['sim', 8764], ['cong', 8773], ['asymp', 8776],
    ['ne', 8800], ['equiv', 8801], ['le', 8804], ['ge', 8805], ['sub', 8834], ['sup', 8835], ['nsub', 8836],
    ['sube', 8838], ['supe', 8839], ['oplus', 8853], ['otimes', 8855], ['perp', 8869], ['sdot', 8901], ['lceil', 8968],
    ['rceil', 8969], ['lfloor', 8970], ['rfloor', 8971], ['lang', 10216], ['rang', 10217], ['loz', 9674],
    ['spades', 9824], ['clubs', 9827], ['hearts', 9829], ['diams', 9830],
    // HTML5 hay gặp trong MathML / Word
    ['InvisibleTimes', 8290], ['it', 8290], ['ApplyFunction', 8289], ['af', 8289], ['InvisibleComma', 8291],
    ['ic', 8291], ['ThinSpace', 8201], ['MediumSpace', 8287], ['NoBreak', 8288], ['ZeroWidthSpace', 8203],
    ['NegativeThinSpace', 8203], ['leq', 8804], ['geq', 8805], ['neq', 8800], ['pm', 177], ['mp', 8723],
    ['div', 247], ['centerdot', 183], ['CenterDot', 183], ['rightarrow', 8594], ['RightArrow', 8594],
    ['leftarrow', 8592], ['LeftArrow', 8592], ['Rightarrow', 8658], ['Leftrightarrow', 8660], ['dollar', 36],
    ['percnt', 37], ['lpar', 40], ['rpar', 41], ['lsqb', 91], ['rsqb', 93], ['lcub', 123], ['rcub', 125],
    ['lbrace', 123], ['rbrace', 125], ['verbar', 124], ['vert', 124], ['Verbar', 8214], ['colon', 58], ['semi', 59],
    ['comma', 44], ['period', 46], ['excl', 33], ['quest', 63], ['num', 35], ['ast', 42], ['plus', 43],
    ['equals', 61], ['sol', 47], ['bsol', 92], ['Hat', 94], ['lowbar', 95], ['grave', 96], ['OverBar', 8254],
    ['UnderBar', 95], ['angle', 8736], ['parallel', 8741], ['emptyset', 8709], ['varnothing', 8709],
    ['setminus', 8726], ['subseteq', 8838], ['supseteq', 8839], ['subset', 8834], ['supset', 8835], ['approx', 8776],
    ['langle', 10216], ['rangle', 10217], ['ell', 8467], ['infty', 8734], ['Copf', 8450], ['Nopf', 8469],
    ['Qopf', 8474], ['Ropf', 8477], ['Zopf', 8484], ['reals', 8477], ['integers', 8484], ['naturals', 8469],
    ['rationals', 8474], ['complexes', 8450], ['dot', 729], ['DoubleDot', 168], ['compfn', 8728], ['cir', 9675],
    ['square', 9633], ['Delta', 916], ['triangle', 9653], ['xrarr', 10230], ['map', 8614], ['iff', 10234],
    ['nbsp', 160]
  ].forEach(function (p) { ENT[p[0]] = String.fromCharCode(p[1]); });
  // &#128;–&#159; theo Windows-1252 (HTML5)
  var CP1252 = { 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352,
    139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732,
    153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376 };
  var CU_KHONG_CHAM_PHAY = { amp: 1, lt: 1, gt: 1, quot: 1, nbsp: 1, copy: 1, reg: 1 };
  var RE_TT = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*)(;?)/g;
  function decodeEntities(s) {
    s = String(s == null ? '' : s);
    if (s.indexOf('&') === -1) return s;
    return s.replace(RE_TT, function (m, e, cham) {
      if (e.charCodeAt(0) === 35) {
        var cp = (e.charCodeAt(1) | 32) === 120 ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        if (CP1252[cp]) cp = CP1252[cp];
        if (!(cp >= 1 && cp <= 0x10FFFF) || (cp >= 0xD800 && cp <= 0xDFFF)) return '\ufffd';
        return String.fromCodePoint(cp);
      }
      if (coKhoa(ENT, e) && (cham || CU_KHONG_CHAM_PHAY[e])) return ENT[e];
      return m;
    });
  }

  /* ===================== Phân tích HTML ===================== */
  var RONG = tapHop('area base br col embed hr img input link meta param source track wbr keygen');
  var THO = tapHop('script style textarea title xmp noscript template');
  var MATHML = tapHop('math annotation annotation-xml maction maligngroup malignmark menclose merror mfenced mfrac mglyph mi ' +
    'mlabeledtr mlongdiv mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mscarries mscarry msgroup ' +
    'msline mspace msqrt msrow mstack mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none semantics');
  var DONG_P = tapHop('address article aside blockquote details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 ' +
    'header hr main nav ol p pre section table ul li dd dt');
  var THOAT_NGOAI = tapHop('b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img li ' +
    'listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var');
  var DIEM_TICH_HOP = tapHop('mi mo mn ms mtext annotation-xml foreignobject desc title');
  var BIEN_BANG = tapHop('td th table caption');

  function tenThe(raw) {
    var n = raw.toLowerCase();
    var i = n.indexOf(':');
    if (i > 0 && MATHML[n.slice(i + 1)]) return n.slice(i + 1); // m:mi, mml:math → mi, math
    return n;
  }

  /*
   * Bộ phân tích HTML chịu lỗi → cây {type:'el', name, attrs, children} / {type:'text', text}
   * (cùng dạng với core.parseXml). Tên thẻ/thuộc tính viết thường; giải thực thể; thẻ rỗng; thuộc tính không ngoặc;
   * tự đóng <p>/<li>/<td>/<tr>…; MathML/SVG là nội dung "ngoại lai" (tôn trọng "/>"). Luôn trả về #fragment.
   */
  function parseHtml(str) {
    var s = (str instanceof Uint8Array) ? core.utf8Decode(str) : String(str == null ? '' : str);
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    if (s.indexOf('\r') !== -1) s = s.replace(/\r\n?/g, '\n');
    var n = s.length, i = 0;
    var goc = { type: 'el', name: '#fragment', attrs: {}, children: [] };
    var st = [goc];
    function hienTai() { return st[st.length - 1]; }
    function ngoaiLai() { // đang trong math/svg?
      for (var k = st.length - 1; k > 0; k--) { var t = st[k].name; if (t === 'math' || t === 'svg') return true; if (t === 'foreignobject') return false; }
      return false;
    }
    function themChu(t) {
      if (!t) return;
      var ch = hienTai().children, cuoi = ch[ch.length - 1];
      if (cuoi && cuoi.type === 'text') cuoi.text += t; else ch.push({ type: 'text', text: t });
    }
    // đóng thẻ mở gần nhất trong tập `ten`, không vượt qua các thẻ trong `chan`
    function dongNeuMo(ten, chan) {
      for (var k = st.length - 1; k > 0; k--) {
        var t = st[k].name;
        if (ten[t]) { st.length = k; return true; }
        if (chan[t]) return false;
      }
      return false;
    }
    var CHAN_P = tapHop('td th table caption button math svg li dd dt');
    function tuDong(name) {
      if (DONG_P[name]) dongNeuMo({ p: 1 }, CHAN_P);
      if (name === 'li') dongNeuMo({ li: 1 }, tapHop('ul ol table td th'));
      else if (name === 'dt' || name === 'dd') dongNeuMo({ dt: 1, dd: 1 }, tapHop('dl table td th'));
      else if (name === 'tr') dongNeuMo({ tr: 1 }, tapHop('table tbody thead tfoot'));
      else if (name === 'td' || name === 'th') dongNeuMo({ td: 1, th: 1 }, tapHop('tr table'));
      else if (name === 'thead' || name === 'tbody' || name === 'tfoot') {
        dongNeuMo({ tr: 1 }, tapHop('table thead tbody tfoot'));
        dongNeuMo({ thead: 1, tbody: 1, tfoot: 1 }, tapHop('table'));
      }
      else if (name === 'option') dongNeuMo({ option: 1 }, tapHop('select datalist'));
      else if (/^h[1-6]$/.test(name) && /^h[1-6]$/.test(hienTai().name)) st.pop();
    }

    while (i < n) {
      var lt = s.indexOf('<', i);
      if (lt === -1) { themChu(decodeEntities(s.slice(i))); break; }
      if (lt > i) themChu(decodeEntities(s.slice(i, lt)));
      var c = s.charAt(lt + 1);
      if (s.startsWith('<!--', lt)) {
        var e1 = s.indexOf('-->', lt + 4);
        i = e1 === -1 ? n : e1 + 3;
      } else if (s.startsWith('<![CDATA[', lt)) {
        var e2 = s.indexOf(']]>', lt + 9);
        var noi = s.slice(lt + 9, e2 === -1 ? n : e2);
        if (ngoaiLai()) themChu(noi);
        i = e2 === -1 ? n : e2 + 3;
      } else if (c === '!' || c === '?') {
        var e3 = s.indexOf('>', lt + 2);
        i = e3 === -1 ? n : e3 + 1;
      } else if (c === '/') {
        var e4 = s.indexOf('>', lt + 2);
        if (e4 === -1) { i = n; break; }
        var m = /^[A-Za-z][^\s/>]*/.exec(s.slice(lt + 2, e4));
        i = e4 + 1;
        if (!m) continue;
        var ten = tenThe(m[0]);
        if (ten === 'br' && !ngoaiLai()) { hienTai().children.push({ type: 'el', name: 'br', attrs: {}, children: [] }); continue; }
        for (var k = st.length - 1; k > 0; k--) {
          var tk = st[k].name;
          if (tk === ten) { st.length = k; break; }
          if (BIEN_BANG[tk] && !BIEN_BANG[ten]) break;           // </div> lạc không phá bảng
          if ((tk === 'math' || tk === 'svg') && ten !== tk) break; // không thoát MathML bằng thẻ đóng lạ
        }
      } else if (/[A-Za-z]/.test(c)) {
        // thẻ mở
        var p = lt + 1;
        while (p < n && !/[\s/>]/.test(s.charAt(p))) p++;
        var name = tenThe(s.slice(lt + 1, p));
        var attrs = {}, tuDongThe = false;
        while (p < n) {
          var a = s.charAt(p);
          if (/\s/.test(a)) { p++; continue; }
          if (a === '>') { p++; break; }
          if (a === '/') { if (s.charAt(p + 1) === '>') { tuDongThe = true; p += 2; break; } p++; continue; }
          var an = p;
          while (p < n && !/[\s=>]/.test(s.charAt(p)) && !(s.charAt(p) === '/' && s.charAt(p + 1) === '>')) p++;
          var aten = s.slice(an, p).toLowerCase();
          while (p < n && /\s/.test(s.charAt(p))) p++;
          var val = '';
          if (s.charAt(p) === '=') {
            p++;
            while (p < n && /\s/.test(s.charAt(p))) p++;
            var q = s.charAt(p);
            if (q === '"' || q === "'") {
              var e5 = s.indexOf(q, p + 1);
              if (e5 === -1) e5 = n;
              val = s.slice(p + 1, e5); p = e5 + 1;
            } else {
              var vs = p;
              while (p < n && !/[\s>]/.test(s.charAt(p))) p++;
              val = s.slice(vs, p);
            }
            val = decodeEntities(val);
          }
          if (aten && aten !== '__proto__' && !coKhoa(attrs, aten)) attrs[aten] = val;
        }
        if (p > n) p = n;
        i = p;
        var nl = ngoaiLai();
        if (nl && THOAT_NGOAI[name] && !DIEM_TICH_HOP[hienTai().name]) { // thẻ HTML trong MathML lỗi → thoát ra
          while (st.length > 1 && ngoaiLai()) st.pop();
          nl = false;
        }
        if (!nl) tuDong(name);
        var el = { type: 'el', name: name, attrs: attrs, children: [] };
        hienTai().children.push(el);
        if (tuDongThe || (!nl && RONG[name])) continue;
        if (!nl && THO[name]) {
          var re = new RegExp('</' + name + '\\s*>', 'i');
          var mm = re.exec(s.slice(i));
          var het = mm ? i + mm.index : n;
          var noiDung = s.slice(i, het);
          if (noiDung) el.children.push({ type: 'text', text: (name === 'textarea' || name === 'title') ? decodeEntities(noiDung) : noiDung });
          i = mm ? het + mm[0].length : n;
          continue;
        }
        st.push(el);
      } else {
        themChu('<');
        i = lt + 1;
      }
    }
    return goc;
  }

  /* ===================== Ghi HTML ===================== */
  // ký tự vô hình/khoảng trắng đặc biệt → tham chiếu số để dễ đọc và không bị trình soạn thảo nuốt
  var RE_VO_HINH = /[\u00a0\u00ad\u2000-\u200f\u2028-\u202f\u205f-\u2064\ufeff]/g;
  function soHex(c) { return '&#x' + c.charCodeAt(0).toString(16).toUpperCase() + ';'; }
  function escText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(RE_VO_HINH, soHex);
  }
  function escAttrHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(RE_VO_HINH, soHex);
  }
  function toHtml(node) {
    var out = [];
    (function ghi(nd, ngoai) {
      if (!nd) return;
      if (Array.isArray(nd)) { nd.forEach(function (x) { ghi(x, ngoai); }); return; }
      if (nd.type === 'text') { out.push(escText(nd.text)); return; }
      if (nd.type !== 'el') return;
      var kids = nd.children || [];
      if (nd.name === '#fragment' || nd.name === '#document') { kids.forEach(function (x) { ghi(x, ngoai); }); return; }
      var nl = ngoai || nd.name === 'math' || nd.name === 'svg';
      var h = '<' + nd.name, at = nd.attrs || {};
      for (var k in at) if (coKhoa(at, k)) h += ' ' + k + '="' + escAttrHtml(at[k]) + '"';
      if (!nl && RONG[nd.name]) { out.push(h + '/>'); return; }
      if (nl && !kids.length) { out.push(h + '/>'); return; }
      out.push(h + '>');
      if (!nl && (nd.name === 'script' || nd.name === 'style')) kids.forEach(function (x) { out.push(x.type === 'text' ? x.text : ''); });
      else kids.forEach(function (x) { ghi(x, nl); });
      out.push('</' + nd.name + '>');
    })(node, false);
    return out.join('');
  }

  /* ===================== Allowlist Canvas (canvas_sanitize.rb) ===================== */
  // Thẻ HTML được giữ (bỏ iframe/object/embed/video/audio/source/track/map/area/picture: gói không mang theo được)
  var THE_HTML = tapHop('a b blockquote br caption cite code col colgroup hr h1 h2 h3 h4 h5 h6 del ins font dd div dl dt em ' +
    'figure figcaption i img li ol p pre q small span strike strong sub sup abbr table tbody td tfoot th thead tr u ul ' +
    'address acronym bdo dfn kbd legend samp tt var big article aside details footer header nav section summary time ' +
    'ruby rt rp mark');
  var TT_CHUNG = tapHop('style class id title role lang dir aria-labelledby aria-atomic aria-busy aria-controls ' +
    'aria-describedby aria-disabled aria-dropeffect aria-flowto aria-grabbed aria-haspopup aria-hidden aria-invalid ' +
    'aria-label aria-live aria-owns aria-relevant aria-autocomplete aria-checked aria-description aria-expanded ' +
    'aria-level aria-multiline aria-multiselectable aria-orientation aria-pressed aria-readonly aria-required ' +
    'aria-selected aria-sort aria-valuemax aria-valuemin aria-valuenow aria-valuetext');
  var TT_THE = {
    a: tapHop('href target'), blockquote: tapHop('cite'), col: tapHop('span width'), colgroup: tapHop('span width'),
    img: tapHop('align alt height src width'), ol: tapHop('start type'), q: tapHop('cite'),
    table: tapHop('summary width border cellpadding cellspacing center frame rules'), tr: tapHop('align valign dir'),
    td: tapHop('abbr axis colspan rowspan width align valign dir'), th: tapHop('abbr axis colspan rowspan width align valign dir scope'),
    ul: tapHop('type'), font: tapHop('face color size')
  };
  // data-* giữ lại (Canvas cho mọi data-*, nhưng data-* của gói SCORM có thể lộ đáp án → chỉ giữ của Canvas)
  var DATA_GIU = tapHop('data-equation-content data-ignore-a11y-check data-mathml');
  // MathML: thuộc tính theo thẻ (đã bỏ href/xref — không cần và phải kiểm giao thức)
  var MCHUNG = 'mathcolor mathbackground intent arg ';
  var TT_MATH = {
    math: tapHop('display maxwidth overflow alttext intent arg mathcolor mathbackground scriptlevel displaystyle ' +
      'scriptsizemultiplier scriptminsize mathvariant mathsize width height valign xmlns columnalign rowalign rowspacing columnspacing'),
    annotation: tapHop('encoding'), 'annotation-xml': tapHop('encoding'),
    maction: tapHop(MCHUNG + 'actiontype selection'), maligngroup: tapHop(MCHUNG + 'groupalign'), malignmark: tapHop(MCHUNG + 'edge'),
    menclose: tapHop(MCHUNG + 'notation'), merror: tapHop(MCHUNG), mfenced: tapHop(MCHUNG + 'open close separators'),
    mfrac: tapHop(MCHUNG + 'linethickness numalign denomalign bevelled'), mglyph: tapHop(MCHUNG + 'alt width height valign'),
    mi: tapHop(MCHUNG + 'mathvariant mathsize'), mlabeledtr: tapHop(MCHUNG),
    mlongdiv: tapHop(MCHUNG + 'longdivstyle align stackalign charalign charspacing'),
    mmultiscripts: tapHop(MCHUNG + 'subscriptshift superscriptshift'), mn: tapHop(MCHUNG + 'mathvariant mathsize'),
    mo: tapHop(MCHUNG + 'mathvariant mathsize form fence separator lspace rspace stretchy symmetric maxsize minsize largeop ' +
      'movablelimits accent linebreak lineleading linebreakstyle linebreakmultchar indentalign indentshift indenttarget'),
    mover: tapHop(MCHUNG + 'accent align'), mpadded: tapHop(MCHUNG + 'height depth width lspace voffset'),
    mphantom: tapHop(MCHUNG), mprescripts: tapHop(MCHUNG), mroot: tapHop(MCHUNG), mrow: tapHop(MCHUNG),
    ms: tapHop(MCHUNG + 'mathvariant mathsize lquote rquote'), mscarries: tapHop(MCHUNG + 'position location crossout scriptsizemultiplier'),
    mscarry: tapHop(MCHUNG + 'location crossout'), msgroup: tapHop(MCHUNG + 'position shift'),
    msline: tapHop(MCHUNG + 'position length leftoverhang rightoverhang mslinethickness'), mspace: tapHop(MCHUNG + 'mathvariant mathsize'),
    msqrt: tapHop(MCHUNG), msrow: tapHop(MCHUNG + 'position'), mstack: tapHop(MCHUNG + 'align stackalign charalign charspacing'),
    mstyle: tapHop(MCHUNG + 'scriptlevel displaystyle scriptsizemultiplier scriptminsize mathvariant mathsize width height ' +
      'valign form fence separator lspace rspace stretchy symmetric maxsize minsize largeop movablelimits accent linethickness ' +
      'numalign denomalign bevelled open close separators notation accentunder align rowalign columnalign rowspacing columnspacing'),
    msub: tapHop(MCHUNG + 'subscriptshift'), msubsup: tapHop(MCHUNG + 'subscriptshift superscriptshift'),
    msup: tapHop(MCHUNG + 'superscriptshift'),
    mtable: tapHop(MCHUNG + 'align rowalign columnalign groupalign alignmentscope columnwidth width rowspacing columnspacing ' +
      'rowlines columnlines frame framespacing equalrows equalcolumns displaystyle side minlabelspacing'),
    mtd: tapHop(MCHUNG + 'rowspan columnspan rowalign columnalign groupalign'),
    mtext: tapHop(MCHUNG + 'mathvariant mathsize width height depth linebreak'),
    mtr: tapHop(MCHUNG + 'rowalign columnalign groupalign'), munder: tapHop(MCHUNG + 'accentunder align'),
    munderover: tapHop(MCHUNG + 'accent accentunder align'), none: tapHop(MCHUNG), semantics: tapHop('encoding')
  };
  var TOKEN_MATH = tapHop('mi mn mo ms mtext annotation');
  // Bỏ hẳn (cả nội dung) khi gặp trong MathML
  var BO_HAN = tapHop('script style svg template noscript iframe object embed video audio source track input button ' +
    'select textarea option datalist canvas head title meta link base frame frameset applet param');
  // Thuộc tính CSS Canvas giữ lại (canvas_sanitize.rb#L668-L750)
  var CSS_OK = (function () {
    var o = tapHop('align-content align-items align-self background border border-radius clear clip color column-gap cursor ' +
      'direction display flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float font gap grid height ' +
      'justify-content justify-items justify-self left line-height list-style margin max-height max-width min-height min-width ' +
      'order overflow overflow-x overflow-y padding position place-content place-items place-self right row-gap text-align ' +
      'table-layout text-decoration text-indent top user-select vertical-align visibility white-space width z-index zoom');
    'area auto-columns auto-flow auto-rows column gap row template'.split(' ').forEach(function (x) { o['grid-' + x] = 1; });
    'areas columns rows'.split(' ').forEach(function (x) { o['grid-template-' + x] = 1; });
    'end gap start'.split(' ').forEach(function (x) { o['grid-column-' + x] = 1; o['grid-row-' + x] = 1; });
    'attachment color image position repeat'.split(' ').forEach(function (x) { o['background-' + x] = 1; });
    o['background-position-x'] = o['background-position-y'] = 1;
    'bottom collapse color left right spacing style top width'.split(' ').forEach(function (x) { o['border-' + x] = 1; });
    'bottom left right top'.split(' ').forEach(function (x) { 'color style width'.split(' ').forEach(function (y) { o['border-' + x + '-' + y] = 1; }); });
    'family size stretch style variant width'.split(' ').forEach(function (x) { o['font-' + x] = 1; });
    'image position type'.split(' ').forEach(function (x) { o['list-style-' + x] = 1; });
    'bottom left right top offset'.split(' ').forEach(function (x) { o['margin-' + x] = 1; });
    'bottom left right top'.split(' ').forEach(function (x) { o['padding-' + x] = 1; });
    return o;
  })();
  var THE_DAM = tapHop('b strong th h1 h2 h3 h4 h5 h6');
  var KHOI_BANG = tapHop('table thead tbody tfoot tr colgroup ul ol dl');

  /* ===================== CSS: phân tích + so khớp bộ chọn ===================== */
  function parseCss(text) {
    var src = String(text || '').replace(/\/\*[\s\S]*?\*\//g, ''), out = [], i = 0;
    while (i < src.length) {
      var ob = src.indexOf('{', i);
      if (ob < 0) break;
      var dau = src.slice(i, ob).trim(), d = 0, j = ob;
      for (; j < src.length; j++) { var c = src.charAt(j); if (c === '{') d++; else if (c === '}') { d--; if (d === 0) break; } }
      var than = src.slice(ob + 1, j);
      if (dau && dau.charAt(0) !== '@') out.push({ sel: dau.replace(/\s+/g, ' '), body: than.replace(/\s+/g, ' ').trim() });
      i = j + 1;
    }
    return out;
  }
  function tachKhaiBao(body) { // 'a:b; c:url(x;y)' → [[a,b],[c,…]]
    var out = [], cur = '', d = 0, q = '';
    function day() {
      var k = cur.indexOf(':');
      if (k > 0) {
        var p = cur.slice(0, k).trim().toLowerCase(), v = cur.slice(k + 1).trim();
        if (p && v) out.push([p, v]);
      }
      cur = '';
    }
    body = String(body || '');
    for (var i = 0; i < body.length; i++) {
      var c = body.charAt(i);
      if (q) { if (c === q) q = ''; cur += c; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === '(') d++; else if (c === ')') d = Math.max(0, d - 1);
      if (c === ';' && !d) { day(); continue; }
      cur += c;
    }
    day();
    return out;
  }
  // bộ chọn đơn giản: tag, .lop, #id, nối bằng khoảng trắng / '>' ; giả lớp, [thuộc tính], +, ~ → bỏ luật
  function phanTichBoChon(sel) {
    var phan = sel.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/), comps = [], combs = [], spec = 0;
    for (var i = 0; i < phan.length; i++) {
      var p = phan[i];
      if (p === '>') { if (!comps.length || combs.length !== comps.length - 1) return null; combs.push('>'); continue; }
      var m = /^(\*|[A-Za-z][A-Za-z0-9-]*)?((?:[.#][A-Za-z_][\w-]*)*)$/.exec(p);
      if (!m || !p) return null;
      if (comps.length && combs.length < comps.length) combs.push(' ');
      var tag = m[1] && m[1] !== '*' ? m[1].toLowerCase() : null, lop = [], id = null;
      (m[2].match(/[.#][A-Za-z_][\w-]*/g) || []).forEach(function (x) { if (x.charAt(0) === '.') lop.push(x.slice(1)); else id = x.slice(1); });
      spec += (id ? 100 : 0) + lop.length * 10 + (tag ? 1 : 0);
      comps.push({ tag: tag, lop: lop, id: id });
    }
    return comps.length ? { comps: comps, combs: combs, spec: spec } : null;
  }
  function khopComp(c, e) {
    if (c.tag && c.tag !== e.name) return false;
    if (c.id && c.id !== e.id) return false;
    for (var i = 0; i < c.lop.length; i++) if (e.lop.indexOf(c.lop[i]) === -1) return false;
    return true;
  }
  function khopBoChon(bc, chuoi) { // chuoi: tổ tiên… + chính phần tử (mô tả {name, lop, id})
    function m(ci, pos) {
      if (pos < 0 || !khopComp(bc.comps[ci], chuoi[pos])) return false;
      if (ci === 0) return true;
      if (bc.combs[ci - 1] === '>') return m(ci - 1, pos - 1);
      for (var p = pos - 1; p >= 0; p--) if (m(ci - 1, p)) return true;
      return false;
    }
    return m(bc.comps.length - 1, chuoi.length - 1);
  }
  // cssMap: { lop: 'khai báo' } | { lop: ['sel { … }', '[@media …] sel { … }'] } (dạng css.classes của bộ trích SCORM)
  //         | chuỗi CSS | mảng luật
  function bienDichCss(cssMap) {
    var luat = [], biet = {}, daCo = {}, thuTu = 0;
    function them(sel, body) {
      var key = sel + '{' + body + '}';
      if (daCo[key]) return; daCo[key] = 1;
      var kb = tachKhaiBao(body);
      sel.split(',').forEach(function (s1) {
        var bc = phanTichBoChon(s1);
        if (bc) { luat.push({ bc: bc, kb: kb, thuTu: thuTu++ }); bc.comps.forEach(function (c) { c.lop.forEach(function (l) { biet[l] = 1; }); }); }
      });
    }
    function themChuoi(txt) {
      txt = String(txt || '').trim();
      if (!txt || /^\[@/.test(txt) || txt.charAt(0) === '@') return; // luật trong @media: bỏ
      parseCss(txt).forEach(function (r) { them(r.sel, r.body); });
    }
    if (!cssMap) return { luat: luat, biet: biet };
    if (typeof cssMap === 'string') themChuoi(cssMap);
    else if (Array.isArray(cssMap)) cssMap.forEach(themChuoi);
    else Object.keys(cssMap).forEach(function (lop) {
      biet[lop] = 1;
      var v = cssMap[lop];
      if (typeof v === 'string') { if (v.indexOf('{') !== -1) themChuoi(v); else them('.' + lop, v); }
      else if (Array.isArray(v)) v.forEach(themChuoi);
    });
    return { luat: luat, biet: biet };
  }

  /* ===================== Làm sạch cho Canvas ===================== */
  function b64decode(s) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    s = String(s).replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    var out = new Uint8Array(Math.floor(s.length * 3 / 4)), o = 0, buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = A.indexOf(s.charAt(i));
      if (v < 0) continue;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 0xff; }
    }
    return out.subarray(0, o);
  }
  function fnvBytes(u8) {
    var h = 0x811c9dc5;
    for (var i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function giongBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function loaiAnh(u8, mime) {
    if (u8.length > 3 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'png';
    if (u8.length > 2 && u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpg';
    if (u8.length > 2 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'gif';
    if (/png/.test(mime)) return 'png';
    if (/jpe?g/.test(mime)) return 'jpg';
    if (/gif/.test(mime)) return 'gif';
    return null;
  }
  var RE_TEN_ANH = /^[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)$/;
  function doDaiPx(v) {
    var m = /^\s*(-?[0-9.]+)\s*(px|em|rem|pt|ex)?\s*$/.exec(String(v || ''));
    if (!m) return NaN;
    var x = parseFloat(m[1]), u = m[2] || 'px';
    return u === 'em' || u === 'rem' ? x * 16 : u === 'pt' ? x * 4 / 3 : u === 'ex' ? x * 8 : x;
  }
  function laDam(v) { v = String(v).trim().toLowerCase(); return v === 'bold' || v === 'bolder' || (/^[0-9]+$/.test(v) && +v >= 600); }

  /*
   * cleanForCanvas(html, {images, imageMap, cssMap, rootVars, keepIds}) → {html, issues, usedImages, images}
   *  - images:   { 'ten.png': Uint8Array } — ảnh của ngân hàng; ảnh data: URI được tách vào đây (tạo mới nếu không truyền)
   *  - imageMap: { 'duong/dan/goc.png': 'ten_ascii.png' } — đổi src gốc → images/<tên>
   *  - cssMap:   lớp CSS → style trực tiếp (xem bienDichCss); rootVars: { '--navy': '#23328C' }
   */
  function cleanForCanvas(html, opts) {
    opts = opts || {};
    var issues = [], daBao = {};
    function bao(level, msg) { if (daBao[msg]) return; daBao[msg] = 1; issues.push(core.newIssue(level, msg)); }
    var coImages = !!opts.images;
    var images = opts.images || {};
    var imageMap = opts.imageMap || {};
    var css = bienDichCss(opts.cssMap);
    var rootVars = {};
    Object.keys(opts.rootVars || {}).forEach(function (k) { rootVars[k.indexOf('--') === 0 ? k : '--' + k] = String(opts.rootVars[k]).trim(); });
    var used = [], daDung = {};
    function dung(ten) { if (!daDung[ten]) { daDung[ten] = 1; used.push(ten); } }

    // bảng tra imageMap không phân biệt hoa thường + theo tên file cuối
    var mapThuong = {}, mapTen = {};
    Object.keys(imageMap).forEach(function (k) {
      var kk = chuanDuongDan(k).toLowerCase();
      mapThuong[kk] = imageMap[k];
      var b = kk.split('/').pop();
      mapTen[b] = mapTen[b] === undefined ? imageMap[k] : null; // null = trùng tên, không dùng được
    });
    function chuanDuongDan(p) {
      var x = String(p || '').trim().replace(/\\/g, '/').replace(/[?#].*$/, '');
      try { x = decodeURIComponent(x); } catch (e) { /* giữ nguyên */ }
      return x.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
    }
    function tenTuMap(v) { return String(v).replace(/^\.?\/?images\//, ''); }

    function giaiBien(v) { // var(--x[, dự phòng]) → giá trị; null nếu thiếu
      var loi = false;
      for (var lan = 0; lan < 6 && /var\(/i.test(v); lan++) {
        v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/gi, function (m, ten, duPhong) {
          if (coKhoa(rootVars, ten)) return rootVars[ten];
          if (duPhong != null && duPhong.trim()) return duPhong.trim();
          bao('warn', 'Không có giá trị cho biến CSS ' + ten + ' — đã bỏ thuộc tính dùng nó');
          loi = true; return '';
        });
      }
      return loi || /var\(/i.test(v) ? null : v;
    }

    // style cuối: luật theo lớp (độ ưu tiên, thứ tự) rồi style trực tiếp
    function tinhStyle(chuoi, styleTT) {
      var kq = {}, thuTu = [];
      function dat(p, v) { if (!coKhoa(kq, p)) thuTu.push(p); kq[p] = v; }
      var khop = css.luat.filter(function (l) { return khopBoChon(l.bc, chuoi); });
      khop.sort(function (a, b) { return a.bc.spec - b.bc.spec || a.thuTu - b.thuTu; });
      khop.forEach(function (l) { l.kb.forEach(function (d) { dat(d[0], d[1]); }); });
      tachKhaiBao(styleTT || '').forEach(function (d) { dat(d[0], d[1]); });
      var dam = null, out = [];
      thuTu.forEach(function (p) {
        var v = String(kq[p]).replace(/\s*!important\s*$/i, '').trim();
        if (p === 'font-weight') { dam = laDam(v); return; }
        if (!CSS_OK[p]) return;
        if (/expression\s*\(|javascript:|behavior/i.test(v)) return;
        v = giaiBien(v);
        if (v == null || v === '') return;
        if (/url\(/i.test(v) && !/url\(\s*['"]?https?:/i.test(v)) { bao('warn', 'Đã bỏ ảnh nền CSS (url) — Canvas không giữ'); return; }
        out.push([p, v]);
      });
      return { kb: out, dam: dam };
    }
    function styleChuoi(kb) { return kb.map(function (d) { return d[0] + ':' + d[1]; }).join(';'); }
    function layKb(kb, p) { for (var i = kb.length - 1; i >= 0; i--) if (kb[i][0] === p) return kb[i][1]; return null; }

    function xuLyAnh(at) {
      var src = at.src == null ? '' : String(at.src).trim();
      if (!src) { bao('error', 'Có ảnh không có đường dẫn (src) — đã bỏ'); return null; }
      var ten = null;
      if (/^data:/i.test(src)) {
        var m = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/i.exec(src);
        if (!m) { bao('error', 'Ảnh nhúng (data:) bị hỏng — đã bỏ'); return null; }
        var mime = m[1].toLowerCase(), u8;
        if (/;base64/i.test(m[2])) u8 = b64decode(m[3]);
        else { try { u8 = core.utf8Encode(decodeURIComponent(m[3])); } catch (e) { u8 = core.utf8Encode(m[3]); } }
        var duoi = loaiAnh(u8, mime);
        if (!duoi) { bao('error', 'Ảnh nhúng dạng ' + (mime || 'không rõ') + ' không dùng được trên Canvas — hãy đổi sang PNG/JPG/GIF'); return null; }
        var goc = 'img_' + fnvBytes(u8), so = 1;
        ten = goc + '.' + duoi;
        while (images[ten] && !giongBytes(images[ten], u8)) ten = goc + '_' + (++so) + '.' + duoi;
        images[ten] = u8;
      } else {
        var p = chuanDuongDan(src), pl = p.toLowerCase();
        var v = coKhoa(imageMap, src) ? imageMap[src] : coKhoa(imageMap, p) ? imageMap[p] : coKhoa(mapThuong, pl) ? mapThuong[pl] : undefined;
        if (v === undefined && mapTen[pl.split('/').pop()]) v = mapTen[pl.split('/').pop()];
        if (v != null) ten = tenTuMap(v);
        // đã ở dạng images/<tên>: tin luôn khi người gọi không đưa images (vd. docx.js đã đổi tên)
        else if (/^images\/[^/]+$/.test(p) && (!coImages || images[p.slice(7)])) ten = p.slice(7);
        else if (/^https?:\/\//i.test(src)) {
          bao('warn', 'Ảnh lấy từ Internet (' + src.slice(0, 80) + ') không nằm trong gói — có thể không hiện trên Canvas');
          return src;
        } else if (/^[a-z][a-z0-9+.-]*:/i.test(src)) { bao('error', 'Đường dẫn ảnh không hợp lệ: ' + src.slice(0, 80)); return null; }
        else { bao('error', 'Không tìm thấy ảnh "' + src.slice(0, 120) + '"'); return src; }
      }
      if (!RE_TEN_ANH.test(ten)) bao('warn', 'Tên ảnh "' + ten + '" nên là chữ thường ASCII dạng ten_anh.png');
      if (coImages && !images[ten]) bao('error', 'Thiếu tệp ảnh ' + ten);
      dung(ten);
      return 'images/' + ten;
    }

    function locThuocTinhHtml(name, attrs, kb) {
      var out = {}, rieng = TT_THE[name] || {};
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (k === 'style' || k === 'class') return; // xử lý riêng
        if (k === 'id' && !opts.keepIds) return;
        if (/^on/.test(k) || k === 'loading' || k === 'contenteditable') return;
        var ok = TT_CHUNG[k] || rieng[k] || DATA_GIU[k];
        if (!ok) return;
        if ((k === 'href' || k === 'cite') && !/^(https?:|mailto:|tel:|ftp:|#|[^:]*$)/i.test(String(v).trim())) return;
        out[k] = v;
      });
      return out;
    }
    function locThuocTinhMath(name, attrs) {
      var out = {}, rieng = TT_MATH[name] || {};
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class' || k === 'id' || /^on/.test(k)) return;
        if (k === 'style') { // cùng bộ lọc CSS với thẻ HTML (Canvas xoá font-weight, opacity…; var() phải giải)
          var sty = styleChuoi(tinhStyle([], attrs[k]).kb);
          if (sty) out.style = sty;
          return;
        }
        if (rieng[k] || k === 'title' || k === 'dir' || k === 'lang' || (/^aria-/.test(k) && TT_CHUNG[k])) out[k] = attrs[k];
      });
      return out;
    }

    function moTa(el) {
      var lop = String((el.attrs && el.attrs['class']) || '').split(/\s+/).filter(Boolean);
      return { name: el.name, lop: lop, id: el.attrs && el.attrs.id };
    }

    // ----- MathML -----
    function lamMath(nodes, cha) {
      var out = [];
      nodes.forEach(function (x) {
        if (x.type === 'text') {
          if (TOKEN_MATH[cha]) {
            var t = x.text.replace(/[ \t\n\r\f]+/g, ' ');
            if (t) out.push({ type: 'text', text: t });
          } else if (/\S/.test(x.text)) out.push({ type: 'el', name: 'mtext', attrs: {}, children: [{ type: 'text', text: x.text.trim() }] });
          return;
        }
        if (x.type !== 'el') return;
        var name = x.name;
        if (name === 'mspace') {
          var w = /mathspace$/.test(String(x.attrs.width || '').trim()) ? 4 : doDaiPx(x.attrs.width); // thinmathspace… → một khoảng mảnh
          if (!(w > 0)) return;
          var soKhoang = Math.max(1, Math.min(4, Math.round(w / 5)));
          out.push({ type: 'el', name: 'mtext', attrs: {}, children: [{ type: 'text', text: new Array(soKhoang + 1).join('\u2009') }] });
          return;
        }
        if (name === 'semantics' && !opts.keepAnnotations) {
          // phần trình bày = con MathML đầu tiên không phải chú thích (bỏ qua <script>… lạc vào)
          var tb = x.children.filter(function (c) { return c.type === 'el' && MATHML[c.name] && c.name !== 'annotation' && c.name !== 'annotation-xml'; })[0];
          if (tb) out.push.apply(out, lamMath([tb], cha));
          return;
        }
        if ((name === 'annotation' || name === 'annotation-xml') && !opts.keepAnnotations) return;
        if (name === 'math') { out.push.apply(out, lamMath(x.children, cha)); return; } // math lồng nhau
        // mã / khối nhúng lọt vào MathML (kể cả trong mtext, annotation-xml): bỏ cả nội dung, không biến thành chữ
        if (BO_HAN[name]) { if (name === 'script') bao('warn', 'Đã bỏ mã <script>'); return; }
        if (!MATHML[name]) { // thẻ lạ trong MathML: giữ chữ bên trong
          if (TOKEN_MATH[cha]) out.push({ type: 'text', text: core.xmlText(x) });
          else out.push.apply(out, lamMath(x.children, cha));
          return;
        }
        var con = lamMath(x.children, name);
        if (TOKEN_MATH[name]) { // cắt khoảng trắng hai đầu của token
          // token chỉ chứa chữ: thẻ con (MathML lỗi kiểu <mi><mi>x</mi></mi>) → lấy chữ của nó, không làm mất chữ
          var txt = con.map(function (c) { return c.type === 'text' ? c.text : core.xmlText(c); }).join('').replace(/^ +| +$/g, '');
          con = txt ? [{ type: 'text', text: txt }] : [];
        }
        out.push({ type: 'el', name: name, attrs: locThuocTinhMath(name, x.attrs), children: con });
      });
      return out;
    }
    function lamTheMath(el) {
      var at = locThuocTinhMath('math', el.attrs);
      if (!at.xmlns) { var a2 = { xmlns: 'http://www.w3.org/1998/Math/MathML' }; Object.keys(at).forEach(function (k) { a2[k] = at[k]; }); at = a2; }
      else at.xmlns = 'http://www.w3.org/1998/Math/MathML';
      var con = lamMath(el.children, 'math');
      var m = { type: 'el', name: 'math', attrs: at, children: con };
      // công thức rỗng (chỉ còn khung / khoảng trắng sau khi làm sạch): bỏ — không hiện gì, không đổi được sang ảnh
      if (!core.xmlText(m).replace(/[\s\u200B-\u200D\u2060]/g, '')) return null;
      return m;
    }

    // ----- HTML -----
    function demCot(table) {
      var max = 0;
      core.findAll(table, 'tr').forEach(function (tr) {
        var n = 0;
        tr.children.forEach(function (c) { if (c.type === 'el' && (c.name === 'td' || c.name === 'th')) n += Math.max(1, parseInt(c.attrs.colspan, 10) || 1); });
        if (n > max) max = n;
      });
      return max;
    }
    function lamCon(nodes, ctx) {
      var out = [];
      nodes.forEach(function (x) { out.push.apply(out, lamNut(x, ctx)); });
      // bỏ text toàn khoảng trắng trong khung bảng/danh sách
      if (KHOI_BANG[ctx.cha]) out = out.filter(function (x) { return !(x.type === 'text' && !/\S/.test(x.text)); });
      return out;
    }
    function lamNut(x, ctx) {
      if (x.type === 'text') {
        var t = ctx.pre ? x.text : x.text.replace(/[ \t\n\r\f]+/g, ' ');
        return t ? [{ type: 'text', text: t }] : [];
      }
      if (x.type !== 'el') return [];
      var name = x.name;
      if (name === 'math') { var mm = lamTheMath(x); return mm ? [mm] : []; }
      if (name === 'script') { bao('warn', 'Đã bỏ mã <script>'); return []; }
      if (name === 'style') { bao('info', 'Đã bỏ khối <style> — định dạng của các lớp đã biết được chuyển thành style trực tiếp'); return []; }
      if (name === 'svg') { bao('warn', 'Hình vẽ SVG không đưa được lên Canvas — đã bỏ; hãy chụp lại thành ảnh PNG'); return []; }
      if (name === 'input' || name === 'button' || name === 'select' || name === 'textarea') { bao('warn', 'Đã bỏ ô nhập/nút bấm (' + name + ') của bài làm tương tác'); return []; }
      if (/^(noscript|template|head|title|meta|link|base|option|datalist|canvas)$/.test(name)) return [];
      if (/^(iframe|object|embed|video|audio|source|track|map|area|param|frame|frameset|applet)$/.test(name)) {
        bao('warn', 'Đã bỏ nội dung nhúng <' + name + '> (video/âm thanh/iframe) — gói câu hỏi chỉ mang theo được ảnh');
        return [];
      }
      var mt = moTa(x);
      var ctxCon = { anc: ctx.anc.concat([mt]), pre: ctx.pre || name === 'pre', cuon: ctx.cuon, cha: name };
      if (name === 'label') { bao('info', 'Đã bỏ thẻ <label> (giữ chữ bên trong)'); return lamCon(x.children, ctxCon); }
      if (name === 'center') { name = 'div'; x = { type: 'el', name: 'div', attrs: Object.assign({}, x.attrs, { style: 'text-align:center;' + (x.attrs.style || '') }), children: x.children }; }
      if (name === 's' || name === 'strike') name = 'del';
      if (!THE_HTML[name]) return lamCon(x.children, ctxCon); // thẻ không được phép: bỏ thẻ, giữ nội dung

      var st = tinhStyle(ctx.anc.concat([mt]), x.attrs.style);
      var kb = st.kb;
      var at = locThuocTinhHtml(name, x.attrs);
      // lớp: bỏ lớp đã chuyển thành style (đã biết trong cssMap), giữ lớp lạ
      var lopGiu = mt.lop.filter(function (l) { return !css.biet[l]; });
      if (lopGiu.length) at['class'] = lopGiu.join(' ');

      if (name === 'img') {
        var src = xuLyAnh(x.attrs);
        if (src == null) return [];
        at.src = src;
        if (at.alt == null) at.alt = '';
        if (!layKb(kb, 'max-width')) kb.push(['max-width', '100%']);
        if (!layKb(kb, 'height')) kb.push(['height', 'auto']);
      }
      if (name === 'a' && !at.href) { // neo không có href: bỏ thẻ
        return lamCon(x.children, ctxCon);
      }
      if (name === 'table' && !layKb(kb, 'border-collapse')) kb.unshift(['border-collapse', 'collapse']);
      var ox = layKb(kb, 'overflow-x') || layKb(kb, 'overflow');
      if (ox && /auto|scroll/.test(ox)) ctxCon.cuon = true;

      var con = lamCon(x.children, ctxCon);
      if (st.dam === true && !THE_DAM[name] && name !== 'img' && name !== 'br' && name !== 'hr' && con.length) {
        if (/^(table|thead|tbody|tfoot|tr|ul|ol|dl)$/.test(name)) { /* không bọc khung bảng/danh sách */ }
        else con = [{ type: 'el', name: 'strong', attrs: {}, children: con }];
      }
      var sty = styleChuoi(kb);
      // ghép thuộc tính theo thứ tự đẹp: src/alt trước style
      var at2 = {};
      Object.keys(at).forEach(function (k) { at2[k] = at[k]; });
      if (sty) at2.style = sty;
      if (name === 'font' && !Object.keys(at2).length) return con; // <font> trống thuộc tính: bỏ (span thì giữ — có thể là ô flex/grid)
      var el = { type: 'el', name: name, attrs: at2, children: con };
      if (name === 'table' && !ctx.cuon) {
        var rong = Math.max(doDaiPx(layKb(kb, 'min-width')) || 0, doDaiPx(layKb(kb, 'width')) || 0, parseInt(at.width, 10) || 0);
        if (rong >= 500 || demCot(el) >= 6) return [{ type: 'el', name: 'div', attrs: { style: 'overflow-x:auto' }, children: [el] }];
      }
      return [el];
    }

    var cay = parseHtml(html);
    var ketQua = lamCon(cay.children, { anc: [], pre: false, cuon: false, cha: '#fragment' });
    var out = core.nfc(toHtml(ketQua)).trim();
    return { html: out, issues: issues, usedImages: used, images: images };
  }

  /* ===================== Chữ thuần ===================== */
  var KHOI = tapHop('p div li tr h1 h2 h3 h4 h5 h6 table blockquote pre dt dd figure figcaption section article aside ' +
    'header footer nav ul ol dl caption details summary address hr');
  // toPlainText(html, {lines}) — bỏ thẻ, MathML → chữ Unicode; mặc định gộp thành một dòng
  function toPlainText(html, opts) {
    opts = opts || {};
    var cay = (html && typeof html === 'object') ? html : parseHtml(html);
    var out = [];
    function chuCua(nodes) { var o2 = []; var luu = out; out = o2; nodes.forEach(di); out = luu; return o2.join(''); }
    function di(x) {
      if (x.type === 'text') { out.push(x.text); return; }
      if (x.type !== 'el') return;
      var n = x.name;
      if (n === 'math') { out.push(M().mathmlToText(x)); return; }
      if (/^(script|style|svg|head|title|template|noscript|input|button|select|textarea)$/.test(n)) return;
      if (n === 'br') { out.push('\n'); return; }
      if (n === 'img') { if (x.attrs.alt) out.push(x.attrs.alt); return; }
      if (n === 'sup') {
        var su = chuCua(x.children).replace(/\s+/g, ' ').trim();
        out.push(su === 'o' ? '°' : M().supText(su)); // 30<sup>o</sup>C → 30°C
        return;
      }
      if (n === 'sub') { out.push(M().subText(chuCua(x.children).replace(/\s+/g, ' '))); return; }
      if (n === 'td' || n === 'th') { out.push(' '); x.children.forEach(di); out.push(' '); return; }
      var khoi = KHOI[n];
      if (khoi) out.push('\n');
      x.children.forEach(di);
      if (khoi) out.push('\n');
    }
    (cay.children || [cay]).forEach(di);
    var s = out.join('');
    if (opts.lines) {
      s = s.split('\n').map(function (l) { return l.replace(/[ \t\f\u00a0]+/g, ' ').trim(); }).filter(function (l, i, a) { return l || (i > 0 && a[i - 1]); }).join('\n').trim();
    } else s = s.replace(/[\s\u00a0]+/g, ' ').trim();
    return core.nfc(s);
  }

  return {
    parseHtml: parseHtml,
    toHtml: toHtml,
    decodeEntities: decodeEntities,
    cleanForCanvas: cleanForCanvas,
    toPlainText: toPlainText,
    parseCss: parseCss,
    ENTITIES: ENT
  };
});
