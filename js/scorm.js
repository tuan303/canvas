/* js/scorm.js — đọc gói SCORM do bộ tạo đề NSHM sinh ra (7 biến thể) → ngân hàng câu hỏi (DESIGN §1, §6)
 * Port từ docs/nghien-cuu/extract2.cjs.txt. Mã dữ liệu trong gói được CHẠY bằng hàm do môi trường cấp
 * (opts.evalData): Node dùng vm, trình duyệt dùng iframe sandbox (makeIframeEvaluator) để mã trong gói
 * không chạm được tới token Canvas. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.scorm = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var laNode = typeof module === 'object' && module.exports && typeof require === 'function';
  var core = laNode ? require('./core.js') : root.NH.core;
  var zip = laNode ? require('./zip.js') : root.NH.zip;

  // html.js có thể nạp sau scorm.js → lấy lúc dùng
  function layModuleHtml() {
    if (root && root.NH && root.NH.html) return root.NH.html;
    if (laNode) { try { return require('./html.js'); } catch (e) { return null; } }
    return null;
  }

  var LET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  var TEN_BIEN = ['EXAM', 'LOCK', 'PARTS', '_KM', '_KX', 'EXAM_INFO', 'EXAM_LOCK', 'TFNG', 'PASSAGES', 'EXERCISES',
    'ATOM_INFO', 'TEACHER_PIN', 'QUESTIONS'];
  var THANG_DS_MAC_DINH = [0, 0.1, 0.25, 0.5, 1.0];

  /* ===================== tiện ích chuỗi ===================== */

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function giaiThucThe(s) {
    return String(s == null ? '' : s)
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { var c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m; })
      .replace(/&#(\d+);/g, function (m, d) { var c = parseInt(d, 10); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m; })
      .replace(/&nbsp;/g, '\u00a0').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  function boThe(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ' '); }
  // Văn bản thuần dự phòng (khi html.js chưa có toPlainText)
  function thuanDuPhong(html) {
    return core.nfc(giaiThucThe(boThe(html))).replace(/[\s\u00a0]+/g, ' ').trim();
  }
  function walkStrings(node, fn) {
    if (typeof node === 'string') { fn(node); return; }
    if (Array.isArray(node)) { node.forEach(function (x) { walkStrings(x, fn); }); return; }
    if (node && typeof node === 'object') Object.keys(node).forEach(function (k) { walkStrings(node[k], fn); });
  }

  /* ===================== giải mã đáp án _KX/_KM ===================== */

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function base64Bytes(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
    var out = new Uint8Array(Math.floor(s.length * 3 / 4)), o = 0, buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      buf = (buf << 6) | B64.indexOf(s[i]); bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 0xff; }
    }
    return out.subarray(0, o);
  }
  /** base64 → byte XOR _KM[i % len] XOR ((i*31)&0xff) → UTF-8 JSON (đúng hàm DA() của template). */
  function decryptKeys(kx, km) {
    var b = base64Bytes(kx), k = String(km);
    for (var i = 0; i < b.length; i++) b[i] ^= (k.charCodeAt(i % k.length) & 0xff) ^ ((i * 31) & 0xff);
    return JSON.parse(core.utf8Decode(b));
  }
  /** Thay mọi `ans` kiểu số bằng KEYS[số] (ở mọi độ sâu). */
  function decryptAns(node, KEYS, stat) {
    if (Array.isArray(node)) { node.forEach(function (x) { decryptAns(x, KEYS, stat); }); return; }
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function (key) {
      var v = node[key];
      if (key === 'ans' && typeof v === 'number') {
        if (v < 0 || v >= KEYS.length) stat.bad.push(v);
        node[key] = KEYS[v]; stat.used[v] = 1; stat.count++;
      } else decryptAns(v, KEYS, stat);
    });
  }

  /* ===================== cắt vùng dữ liệu trong index.html ===================== */

  function inlineScripts(html) {
    var out = [], re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, m;
    while ((m = re.exec(html))) {
      if (m[1] && /\bsrc\s*=/.test(m[1])) continue;
      out.push({ start: m.index, body: m[2] });
    }
    return out;
  }
  /** Vùng dữ liệu: giữa mốc "PHẦN 1/2" … "HẾT PHẦN SỬA. PHẦN 2/2" (template mới), nếu không thì
   *  từ đầu thẻ script chứa dữ liệu tới trước dòng "var SCORM =" (mọi biến thể đều có). */
  function dataRegion(html) {
    var scripts = inlineScripts(html);
    var sc = null;
    for (var i = 0; i < scripts.length; i++) {
      if (/\b(var|let|const)\s+(EXAM|EXAM_INFO|PARTS|PASSAGES|EXERCISES|QUESTIONS)\s*=/.test(scripts[i].body)) { sc = scripts[i]; break; }
    }
    if (!sc) throw new Error('Không tìm thấy thẻ <script> chứa dữ liệu đề (gói không do bộ tạo đề NSHM sinh ra?)');
    var body = sc.body, how;
    var iMark = body.indexOf('PHẦN 1/2');
    var iEnd = body.search(/HẾT PHẦN SỬA\.\s*PHẦN 2\/2/);
    if (iMark >= 0 && iEnd > iMark) {
      // mốc mở nằm trong comment "/* === PHẦN 1/2 … */": bắt đầu sau dấu */ đầu tiên
      var a = body.indexOf('*/', iMark) + 2;
      var b = body.lastIndexOf('/*', iEnd);
      body = body.slice(a, b); how = 'markers';
    } else {
      var m = /^[ \t]*var\s+SCORM\s*=/m.exec(body);
      if (!m) throw new Error("Không tìm thấy mốc 'var SCORM' để cắt vùng dữ liệu");
      body = body.slice(0, m.index); how = 'before-var-SCORM';
    }
    return { src: body, how: how, script: sc.body };
  }

  /** Bóc 1 hàm `function name(...){...}` (đếm ngoặc, bỏ qua chuỗi). */
  function sliceFunction(code, name) {
    var m = new RegExp('function\\s+' + name + '\\s*\\(').exec(code);
    if (!m) return null;
    var i = code.indexOf('{', m.index), depth = 0, q = null;
    for (var j = i; j < code.length; j++) {
      var c = code[j];
      if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return code.slice(m.index, j + 1); }
    }
    return null;
  }

  /* ===================== chạy mã dữ liệu ===================== */

  // Đuôi nối sau mã: trả về JSON các biến cần lấy (chạy được cả với let/const)
  function duoiTraVe(names) {
    names.forEach(function (n) { if (!/^[A-Za-z_$][\w$]*$/.test(n)) throw new Error('Tên biến không hợp lệ: ' + n); });
    return '\n;JSON.stringify({' + names.map(function (n) {
      return JSON.stringify(n) + ':(typeof ' + n + '==="undefined"?undefined:' + n + ')';
    }).join(',') + '})';
  }

  function nodeEvaluator(code, names) {
    var vm = require('vm');
    var ctx = vm.createContext({});
    var s = vm.runInContext(code + duoiTraVe(names), ctx, { timeout: 3000 });
    return Promise.resolve(JSON.parse(s));
  }

  /** Trình duyệt: chạy mã trong <iframe sandbox="allow-scripts"> (origin rỗng, CSP chặn mạng),
   *  trao đổi qua postMessage, có hạn giờ. Trả về hàm evalData(code, names) → Promise<object>. */
  function makeIframeEvaluator(doc, opt) {
    opt = opt || {};
    var hanGio = opt.timeout || 8000;
    var win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    var BOOT = '<!doctype html><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\'">' +
      '<script>' +
      'window.addEventListener("message",function(e){var m=e.data;if(!m||m.nh!=="scorm-eval")return;' +
      'var o={nh:"scorm-eval-kq",id:m.id};' +
      'try{o.json=(0,eval)(m.code+m.tail);o.ok=true;}catch(err){o.ok=false;o.error=String(err&&err.message||err);}' +
      'parent.postMessage(o,"*");});' +
      'parent.postMessage({nh:"scorm-eval-san-sang"},"*");' +
      '<\/script>';
    return function evalData(code, names) {
      return new Promise(function (resolve, reject) {
        var tail;
        try { tail = duoiTraVe(names); } catch (e) { reject(e); return; }
        var fr = doc.createElement('iframe');
        var id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2);
        var xong = false, hen = null;
        function don() {
          xong = true;
          if (hen) clearTimeout(hen);
          if (win) win.removeEventListener('message', nghe);
          if (fr.parentNode) fr.parentNode.removeChild(fr);
        }
        function nghe(e) {
          if (xong || e.source !== fr.contentWindow) return;
          var m = e.data;
          if (!m || typeof m !== 'object') return;
          if (m.nh === 'scorm-eval-san-sang') {
            fr.contentWindow.postMessage({ nh: 'scorm-eval', id: id, code: String(code), tail: tail }, '*');
          } else if (m.nh === 'scorm-eval-kq' && m.id === id) {
            don();
            if (!m.ok) { reject(new Error('Mã dữ liệu trong gói bị lỗi: ' + m.error)); return; }
            try { resolve(JSON.parse(m.json)); } catch (err) { reject(new Error('Dữ liệu trả về không phải JSON')); }
          }
        }
        if (win) win.addEventListener('message', nghe);
        fr.setAttribute('sandbox', 'allow-scripts');
        fr.setAttribute('aria-hidden', 'true');
        fr.style.display = 'none';
        fr.srcdoc = BOOT;
        hen = setTimeout(function () { if (!xong) { don(); reject(new Error('Quá thời gian chạy mã dữ liệu của gói (' + hanGio + ' ms)')); } }, hanGio);
        (doc.body || doc.documentElement).appendChild(fr);
      });
    };
  }

  function evaluatorMacDinh() {
    if (laNode && typeof process === 'object' && process.versions && process.versions.node) return nodeEvaluator;
    if (typeof document !== 'undefined' && document.createElement) return makeIframeEvaluator(document);
    throw new Error('Không có cách chạy mã dữ liệu của gói (thiếu opts.evalData)');
  }

  /* ===================== nhận diện + chuẩn hoá (port extract2) ===================== */

  function detect(g) {
    var P = Array.isArray(g.PARTS) ? g.PARTS : null;
    if (g.EXAM && P && P.some(function (p) { return p && p.groups; })) return g._KX ? 'tpl-enc' : 'tpl-plain';
    if (g.PASSAGES) return 'ielts-v0';
    if (g.EXERCISES) return 'k4-v0';
    if (g.QUESTIONS) return 'kid-math';
    if (g.EXAM_INFO && P && P.some(function (p) { return p && p.key && p.items; })) return 'thpt-v0';
    if (g.EXAM_INFO && P && P.some(function (p) { return p && (p.icon !== undefined || p.id !== undefined); })) return 'kid-adv';
    return 'unknown';
  }

  function examFromInfo(info, meta, extra) {
    var o = {
      title: meta.title || '', org: meta.org || '', subtitle: meta.subtitle || '', code: meta.code || '',
      minutes: info && info.minutes != null ? info.minutes : null,
      maxScore: info ? info.maxScore : null, passScore: info ? info.passScore : null,
      pickBest: null, showAnswers: !!(info && info.showAnswers), showBand: !!(info && info.showBand),
      scormScale: (info && info.scormScale) || null, statusMode: (info && info.statusMode) || null,
      tfLadder: THANG_DS_MAC_DINH.slice(), shuffle: null, note: '', rules: []
    };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  function normIelts(g, meta) {
    var EXAM = examFromInfo(g.EXAM_INFO, meta);
    var PARTS = g.PASSAGES.map(function (P) {
      return {
        label: 'READING PASSAGE ' + P.no, sub: P.title, note: 'Questions ' + P.range, points: '',
        passage: { head: 'READING PASSAGE ' + P.no, title: P.title, sub: P.sub || '', intro: P.intro || '', paras: clone(P.paras) },
        groups: P.groups.map(function (G) {
          var N = clone(G);
          if (N.type === 'choice') N.type = 'mcq'; // choice = mcq với opts {k,t}
          N.perItem = 1;
          return N;
        })
      };
    });
    return { EXAM: EXAM, PARTS: PARTS };
  }

  function normThpt(g, meta) {
    var I = g.EXAM_INFO;
    var code = (String(meta.title).match(/Mã đề\s*(\w+)/) || [])[1] || '';
    var EXAM = examFromInfo(I, meta, { code: code, tfLadder: I.ptII || THANG_DS_MAC_DINH.slice(), note: g.ATOM_INFO || '' });
    var PARTS = g.PARTS.map(function (P) {
      return {
        label: P.label, sub: P.sub, note: P.note || '', points: P.points || '', key: P.key,
        groups: [{
          head: '', type: P.type,
          perItem: P.type === 'mcq' ? I.ptI : P.type === 'short' ? I.ptIII : 1,
          items: clone(P.items)
        }]
      };
    });
    return { EXAM: EXAM, PARTS: PARTS, noteNeeded: !!g.ATOM_INFO };
  }

  function normK4(g, meta) {
    var EXAM = examFromInfo(g.EXAM_INFO, meta);
    var PARTS = [], cur = null;
    g.EXERCISES.forEach(function (ex) {
      if (ex.roman || !cur) { cur = { label: ex.roman || '', sub: '', note: '', points: '', groups: [] }; PARTS.push(cur); }
      var G = { head: ex.no + '. ' + esc(ex.instr), instr: ex.sub ? [esc(ex.sub)] : [], perItem: 1, points: ex.points, _origType: ex.type };
      if (ex.type === 'bank') {
        G.type = 'bank'; G.bank = ex.bank.slice();
        if (ex.example) G.example = { q: esc(ex.example.q), ans: ex.example.ans };
        G.items = ex.items.map(function (it) { return { n: it.n, q: esc(it.q), ans: [it.ans].concat(it.alt || []) }; });
      } else if (ex.type === 'mistake') {
        G.type = 'mistake';
        G.items = ex.items.map(function (it) {
          return { n: it.n, ans: it.ans, seg: it.seg.map(function (s) { return s.k ? { t: esc(s.t), k: s.k } : { t: esc(s.t) }; }) };
        });
      } else {
        // mcq | mcq3 | cloze → mcq (q/opts gốc là văn bản thường, bộ máy cũ esc() khi vẽ)
        G.type = 'mcq';
        if (ex.example) G.example = { q: esc(ex.example.q || ''), opts: ex.example.opts.map(esc), ans: ex.example.ans };
        G.items = ex.items.map(function (it) { return { n: it.n, q: it.q ? esc(it.q) : '', opts: it.opts.map(esc), ans: it.ans }; });
        if (ex.type === 'cloze') { G.pre = '<div class="passage">' + ex.text + '</div>'; G.giuThuTu = true; }
      }
      cur.groups.push(G);
    });
    return { EXAM: EXAM, PARTS: PARTS };
  }

  // Lời dẫn tiếng Việt thay cho lời dẫn "kéo thả" của bộ máy kid-adv
  var LOI_DAN_KID = {
    match: 'Chọn từ đúng cho mỗi câu mô tả. Có một từ thừa.',
    letterMatch: 'Chọn thẻ chữ hoặc cụm từ đúng cho mỗi chỗ trống. Có một đáp án thừa.',
    order: 'Sắp xếp các thẻ thành câu hoàn chỉnh rồi gõ lại cả câu.'
  };

  function normKidAdv(g, meta) {
    var EXAM = examFromInfo(g.EXAM_INFO, meta);
    var PARTS = g.PARTS.map(function (P) {
      var part = { label: 'Chặng ' + P.id + ': ' + P.title, sub: P.subtitle || '', note: '', points: '', icon: P.icon, groups: [] };
      var loiDan = LOI_DAN_KID[P.type] || P.subtitle || '';
      var G = { head: '', instr: loiDan ? [esc(loiDan)] : [], perItem: 1, _origType: P.type };
      if (P.type === 'imageChoice') {
        G.type = 'mcq'; G.pics = true; G.cols = 3;
        G.items = P.items.map(function (it) {
          return { n: it.n, q: '<b>' + esc(it.prompt) + '</b>', ans: it.ans,
            opts: it.opts.map(function (o) { return { k: o.k, t: '<img src="' + o.img + '" alt="' + o.k + '">' }; }) };
        });
      } else if (P.type === 'match') {
        G.type = 'bank'; G.bank = P.bank.map(function (b) { return b.v; });
        G.bankImg = P.bank.map(function (b) { return { w: b.v, img: b.img }; });
        G.exactMatch = true;
        G.items = P.items.map(function (it) { return { n: it.n, q: esc(it.prompt), ans: [it.ans] }; });
      } else if (P.type === 'letterMatch') {
        var ex = P.bank.filter(function (b) { return b.example; })[0];
        G.type = 'letters'; G.keys = P.bank.map(function (b) { return b.v; });
        G.people = P.bank.map(function (b) { return { k: b.v, t: esc(b.t) }; });
        G.exampleKey = ex ? ex.v : undefined;
        G.items = P.items.map(function (it) { return { n: it.n, q: esc(it.prompt), ans: it.ans }; });
      } else if (P.type === 'choice' || P.type === 'reading') {
        G.type = 'mcq';
        G.items = P.items.map(function (it) {
          return { n: it.n, q: esc(it.prompt), ans: it.ans, opts: it.opts.map(function (o) { return { k: o.k, t: esc(o.t) }; }) };
        });
      } else if (P.type === 'yesno') {
        G.type = 'mcq'; G.opts = [{ k: 'YES', t: 'Yes' }, { k: 'NO', t: 'No' }];
        G.items = P.items.map(function (it) { return { n: it.n, q: esc(it.prompt), ans: it.ans }; });
      } else if (P.type === 'order') {
        G.type = 'order'; G.perItem = 2; G.partial = '0,5 điểm cho mỗi thẻ đúng vị trí';
        G.items = P.items.map(function (it) {
          var t = function (id) { return (it.chunks.filter(function (c) { return c.id === id; })[0] || {}).t; };
          var cau = it.target.map(t).join(' ').replace(/\s+([,.!?])/g, '$1');
          return { n: it.n, q: esc(it.prompt) + ' <b>(' + esc(it.cue) + ')</b>', img: it.img, cue: it.cue,
            chunks: clone(it.chunks), target: it.target.slice(), ans: cau };
        });
      } else {
        G.type = 'UNKNOWN:' + P.type; G.items = clone(P.items) || [];
      }
      if (P.passage) {
        part.passage = { head: '', title: esc(P.readingTitle || ''), sub: '', intro: '',
          paras: [{ k: '', t: (P.image ? '<img src="' + P.image + '" alt="">' : '') + P.passage }] };
      }
      part.groups.push(G);
      return part;
    });
    return { EXAM: EXAM, PARTS: PARTS };
  }

  function normKidMath(g, meta, visuals) {
    var EXAM = examFromInfo(null, meta, { maxScore: g.QUESTIONS.length, minutes: 0 });
    var groups = g.QUESTIONS.map(function (q, i) {
      var vis = (visuals && visuals[i]) || '';
      if (q.type === 'choice') {
        var idx = q.options.indexOf(q.answer);
        return { head: '', type: 'mcq', perItem: 1, cols: 3, items: [{ n: q.n, q: esc(q.prompt), table: vis, visual: q.visual,
          opts: q.options.map(esc), ans: idx >= 0 ? LET[idx] : 'UNMATCHED:' + q.answer, ansText: q.answer }] };
      }
      return { head: '', type: 'short', perItem: 1, items: [{ n: q.n, q: esc(q.prompt), table: vis, visual: q.visual,
        ans: [q.answer], unit: q.unit || '', hint: q.unit ? 'Đơn vị: ' + q.unit : '' }] };
    });
    return { EXAM: EXAM, PARTS: [{ label: 'Phiếu bài tập', sub: '', note: '', points: '', groups: groups }] };
  }

  /* ===================== đọc gói ===================== */

  function laBangFile(x) {
    return x && typeof x === 'object' && !(x instanceof Uint8Array) && !(x instanceof ArrayBuffer) && !ArrayBuffer.isView(x);
  }
  function thuMuc(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
  function noiDuongDan(base, rel) {
    rel = String(rel).replace(/\\/g, '/').replace(/[?#].*$/, '');
    try { rel = decodeURIComponent(rel); } catch (e) { /* giữ nguyên */ }
    var p = rel.charAt(0) === '/' ? rel.slice(1) : base + rel;
    var out = [];
    p.split('/').forEach(function (s) {
      if (s === '' || s === '.') return;
      if (s === '..') out.pop(); else out.push(s);
    });
    return out.join('/');
  }
  function layFile(files, p) {
    if (files[p]) return files[p];
    var lp = p.toLowerCase();
    for (var k in files) if (Object.prototype.hasOwnProperty.call(files, k) && k.toLowerCase() === lp) return files[k];
    return null;
  }

  // Tìm trang chính: theo imsmanifest (resource href), dự phòng index.html nông nhất
  function timTrangChinh(files) {
    var ds = Object.keys(files);
    var mans = ds.filter(function (p) { return /(^|\/)imsmanifest\.xml$/i.test(p); })
      .sort(function (a, b) { return a.split('/').length - b.split('/').length; });
    var ung = [], manInfo = { titles: [], id: '' };
    if (mans.length) {
      var man = core.parseXml(core.utf8Decode(files[mans[0]]));
      manInfo.titles = core.findAll(man, 'title').map(function (t) { return core.nfc(core.xmlText(t)).trim(); }).filter(Boolean);
      manInfo.id = core.attr(man, 'identifier', '');
      var res = core.findAll(man, function (el) { return /(^|:)resource$/.test(el.name); });
      res.sort(function (a, b) {
        var sa = /sco/i.test(core.attr(a, 'adlcp:scormtype', core.attr(a, 'adlcp:scormType', ''))) ? 0 : 1;
        var sb = /sco/i.test(core.attr(b, 'adlcp:scormtype', core.attr(b, 'adlcp:scormType', ''))) ? 0 : 1;
        return sa - sb;
      });
      res.forEach(function (r) {
        var h = core.attr(r, 'href', '');
        if (h && /\.html?$/i.test(h.replace(/[?#].*$/, ''))) ung.push(noiDuongDan(thuMuc(mans[0]), h));
      });
    }
    ds.filter(function (p) { return /(^|\/)index\.html?$/i.test(p); })
      .sort(function (a, b) { return a.split('/').length - b.split('/').length; })
      .forEach(function (p) { ung.push(p); });
    ds.filter(function (p) { return /\.html?$/i.test(p); }).forEach(function (p) { ung.push(p); });
    var daXet = {};
    for (var i = 0; i < ung.length; i++) {
      var p = ung[i];
      if (daXet[p]) continue;
      daXet[p] = 1;
      var data = layFile(files, p);
      if (!data) continue;
      var html = core.utf8Decode(data);
      if (/\b(var|let|const)\s+(EXAM|EXAM_INFO|PARTS|PASSAGES|EXERCISES|QUESTIONS)\s*=/.test(html)) {
        return { path: p, html: html, manifest: manInfo };
      }
    }
    throw new Error('Không thấy trang đề (index.html có dữ liệu đề) trong gói');
  }

  /** Bóc dữ liệu đề từ gói (giống extract2): {variant, EXAM, PARTS, meta, files, baseDir, html, warnings, ...} */
  async function extract(input, opts) {
    opts = opts || {};
    var files = laBangFile(input) ? input : await zip.readZip(input);
    var trang = timTrangChinh(files);
    var html = trang.html, warnings = [];
    var meta = {};
    meta.htmlTitle = core.nfc(giaiThucThe(((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim())).replace(/\s+/g, ' ');
    meta.manifestTitles = trang.manifest.titles;
    meta.manifestId = trang.manifest.id;
    meta.title = meta.htmlTitle;
    meta.subtitle = meta.manifestTitles[1] || '';

    var reg = dataRegion(html);
    var code = reg.src, names = TEN_BIEN.slice();
    var fv = sliceFunction(reg.script, 'visualHTML');
    if (fv) {
      // Toán lớp 2: hình minh hoạ dựng bằng mã → chạy luôn visualHTML(q) cho từng câu
      code += '\n;' + fv + '\n;var __NH_VISUAL=(typeof QUESTIONS!=="undefined"&&QUESTIONS&&QUESTIONS.map)?' +
        'QUESTIONS.map(function(q){try{return String(visualHTML(q)||"");}catch(e){return "";}}):undefined;';
      names.push('__NH_VISUAL');
    }
    var evalData = opts.evalData || evaluatorMacDinh();
    var g;
    try { g = await evalData(code, names); }
    catch (e) { throw new Error('Không chạy được vùng dữ liệu của gói (' + reg.how + '): ' + (e && e.message || e)); }
    if (typeof g === 'string') g = JSON.parse(g);
    g = g || {};
    var visuals = g.__NH_VISUAL;
    delete g.__NH_VISUAL;
    Object.keys(g).forEach(function (k) { if (g[k] === undefined || g[k] === null) delete g[k]; });

    var variant = detect(g);
    var nKeys = 0;
    if (g._KX && g._KM) {
      var KEYS = decryptKeys(g._KX, g._KM);
      nKeys = KEYS.length;
      var st = { count: 0, used: {}, bad: [] };
      decryptAns(g.PARTS, KEYS, st);
      if (g.EXAM) decryptAns(g.EXAM, KEYS, st);
      if (st.bad.length) warnings.push('Chỉ mục đáp án ngoài bảng: ' + st.bad.join(','));
      var nDung = Object.keys(st.used).length;
      if (nDung !== KEYS.length) warnings.push('Bảng đáp án mã hoá có ' + KEYS.length + ' mục nhưng chỉ dùng ' + nDung);
    }

    var norm;
    if (variant === 'tpl-enc' || variant === 'tpl-plain') norm = { EXAM: clone(g.EXAM), PARTS: clone(g.PARTS) };
    else if (variant === 'ielts-v0') norm = normIelts(g, meta);
    else if (variant === 'thpt-v0') norm = normThpt(g, meta);
    else if (variant === 'k4-v0') norm = normK4(g, meta);
    else if (variant === 'kid-adv') norm = normKidAdv(g, meta);
    else if (variant === 'kid-math') {
      if (!fv) warnings.push('Không thấy function visualHTML — mất hình minh hoạ dựng bằng mã');
      norm = normKidMath(g, meta, visuals);
    } else throw new Error('Gói SCORM dạng chưa biết; biến tìm thấy: ' + (Object.keys(g).join(', ') || '(không có)'));

    return {
      variant: variant, dataRegion: reg.how, encrypted: !!nKeys, nKeys: nKeys,
      meta: meta, EXAM: norm.EXAM || {}, PARTS: norm.PARTS || [], noteNeeded: !!norm.noteNeeded,
      files: files, entry: trang.path, baseDir: thuMuc(trang.path), html: html, warnings: warnings
    };
  }

  /* ===================== CSS của gói → style nội tuyến ===================== */

  /** Trải phẳng các khối <style> (bỏ comment, bỏ luật trong @media/@supports — chỉ là co giãn màn hình). */
  function parseCss(html) {
    var css = [], re = /<style[^>]*>([\s\S]*?)<\/style>/gi, m;
    while ((m = re.exec(html))) css.push(m[1]);
    var src = css.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    var out = [], i = 0;
    while (i < src.length) {
      var ob = src.indexOf('{', i);
      if (ob < 0) break;
      var head = src.slice(i, ob).trim(), d = 0, j = ob;
      for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } }
      var body = src.slice(ob + 1, j);
      if (head.charAt(0) !== '@') out.push({ sel: head.replace(/\s+/g, ' '), body: body.replace(/\s+/g, ' ').trim() });
      i = j + 1;
    }
    return out;
  }
  // Tách khai báo "a:b;c:d" (không cắt trong ngoặc)
  function tachKhai(body) {
    var out = [], cur = '', d = 0;
    for (var i = 0; i <= body.length; i++) {
      var c = body[i];
      if (i === body.length || (c === ';' && d === 0)) {
        var k = cur.indexOf(':');
        if (k > 0) {
          var p = cur.slice(0, k).trim().toLowerCase(), v = cur.slice(k + 1).trim().replace(/\s*!important$/i, '');
          if (p && v) out.push([p, v]);
        }
        cur = '';
        continue;
      }
      if (c === '(') d++; else if (c === ')' && d > 0) d--;
      cur += c;
    }
    return out;
  }
  function rootVarsCua(rules) {
    var v = {};
    rules.forEach(function (r) {
      if (r.sel !== ':root') return;
      tachKhai(r.body).forEach(function (kv) { if (kv[0].indexOf('--') === 0) v[kv[0]] = kv[1]; });
    });
    return v;
  }
  function giaiVar(v, vars) {
    for (var k = 0; k < 6 && /var\(/.test(v); k++) {
      v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, function (m, n, fb) {
        return vars[n] != null ? vars[n] : (fb != null ? fb.trim() : m);
      });
    }
    return v;
  }
  // Thuộc tính chỉ có nghĩa với bộ máy SCORM / Canvas bỏ — không chép
  var BO_THUOC_TINH = /^(cursor|user-select|-webkit-|-moz-|-ms-|scroll-|box-shadow|transition|animation|transform|opacity|pointer-events|letter-spacing|text-transform|will-change|outline|filter|content|stroke|fill|resize|touch-action|text-underline-offset|backdrop-filter)/;

  function phanTichSelector(s) {
    if (/[:\[#*+~]/.test(s)) return null;
    var parts = s.trim().split(/\s*>\s*|\s+/), chain = [];
    for (var i = 0; i < parts.length; i++) {
      var m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)$/.exec(parts[i]);
      if (!m || (!m[1] && !m[2])) return null;
      chain.push({ tag: m[1] ? m[1].toLowerCase() : '', cls: m[2] ? m[2].slice(1).split('.') : [] });
    }
    return chain;
  }

  /** Chọn luật CSS cần inline cho nội dung đề: chỉ luật mà lớp ở vế cuối có trong nội dung.
   *  Vế tổ tiên là lớp của bộ máy (không có trong nội dung) → chỉ dùng khi lớp đó chưa có luật trực tiếp
   *  (vd ".box .dim" → ".dim"), để không kéo theo luật trạng thái (".q.cur", "body.exam-armed .q"). */
  function chonLuatCss(rules, lopNoiDung, vars) {
    var co = function (c) { return Object.prototype.hasOwnProperty.call(lopNoiDung, c); };
    var truc = [], giaTiep = [];
    rules.forEach(function (r, ri) {
      if (r.sel === ':root') return;
      var decls = tachKhai(r.body).filter(function (kv) { return !BO_THUOC_TINH.test(kv[0]); })
        .map(function (kv) { return [kv[0], giaiVar(kv[1], vars)]; });
      if (!decls.length) return;
      r.sel.split(',').forEach(function (s) {
        var chain = phanTichSelector(s);
        if (!chain) return;
        if (chain.slice(0, -1).some(function (c) { return (c.tag === 'body' || c.tag === 'html') && c.cls.length; })) return; // luật trạng thái bộ máy
        var cuoi = chain[chain.length - 1];
        if (!cuoi.cls.every(co)) return;
        var toTien = chain.slice(0, -1);
        var lopNgoai = toTien.some(function (c) { return !c.cls.length || !c.cls.every(co); });
        var giu = toTien.filter(function (c) { return c.cls.length && c.cls.every(co); });
        if (!cuoi.cls.length && !giu.length) return;               // luật thẻ trần của bộ máy
        var luat = { chain: giu.concat([cuoi]), decls: decls, thuTu: ri };
        if (lopNgoai && toTien.some(function (c) { return c.cls.length && !c.cls.every(co); })) giaTiep.push(luat);
        else truc.push(luat);
      });
    });
    var coLuatTruc = {};
    truc.forEach(function (l) { l.chain[l.chain.length - 1].cls.forEach(function (c) { coLuatTruc[c] = 1; }); });
    giaTiep.forEach(function (l) {
      var cl = l.chain[l.chain.length - 1].cls;
      if (cl.length && !cl.some(function (c) { return coLuatTruc[c]; })) truc.push(l);
    });
    truc.sort(function (a, b) { return a.thuTu - b.thuTu; });
    var lopBiet = {};
    truc.forEach(function (l) { l.chain.forEach(function (c) { c.cls.forEach(function (x) { lopBiet[x] = 1; }); }); });
    return { rules: truc, known: lopBiet };
  }

  function khopVe(ve, el) {
    if (ve.tag && ve.tag !== el.name) return false;
    for (var i = 0; i < ve.cls.length; i++) if (el.cls.indexOf(ve.cls[i]) < 0) return false;
    return true;
  }
  function khopChuoi(chain, el, stack) {
    if (!khopVe(chain[chain.length - 1], el)) return false;
    var k = chain.length - 2, i = stack.length - 1;
    while (k >= 0 && i >= 0) { if (khopVe(chain[k], stack[i])) k--; i--; }
    return k < 0;
  }

  var THE_RONG = /^(br|img|hr|input|meta|link|col|area|base|embed|source|track|wbr|param|mspace|mprescripts|none)$/;
  var THE_DAM = /^(b|strong|th|h[1-6])$/;

  // Phân tích thuộc tính của một thẻ mở (giữ nguyên văn để ghi lại)
  function docThuocTinh(s) {
    var out = [], re = /([^\s=\/>"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g, m;
    while ((m = re.exec(s))) {
      var v = m[2];
      var val = v == null ? '' : (v.charAt(0) === '"' || v.charAt(0) === "'") ? v.slice(1, -1) : v;
      out.push({ name: m[1].toLowerCase(), raw: m[0], value: giaiThucThe(val) });
    }
    return out;
  }

  /** Áp luật CSS + giải var(--x) vào thuộc tính style; bỏ lớp đã inline; font-weight đậm → <strong>. */
  function inlineCss(html, rules, vars, known) {
    html = String(html == null ? '' : html);
    if (!/<[a-zA-Z]/.test(html)) return html;
    rules = rules || []; vars = vars || {}; known = known || {};
    var out = [], stack = [], i = 0, n = html.length;
    function dongBoc(el) { if (el.boc) out.push('</strong>'); }
    while (i < n) {
      var lt = html.indexOf('<', i);
      if (lt < 0) { out.push(html.slice(i)); break; }
      if (lt > i) out.push(html.slice(i, lt));
      if (html.startsWith('<!--', lt)) {
        var ec = html.indexOf('-->', lt + 4); ec = ec < 0 ? n : ec + 3;
        out.push(html.slice(lt, ec)); i = ec; continue;
      }
      var c1 = html.charAt(lt + 1);
      if (c1 === '/') {
        var gt = html.indexOf('>', lt);
        if (gt < 0) { out.push(html.slice(lt)); break; }
        var ten = html.slice(lt + 2, gt).trim().toLowerCase();
        for (var k = stack.length - 1; k >= 0; k--) {
          if (stack[k].name === ten) {
            while (stack.length > k + 1) dongBoc(stack.pop());
            dongBoc(stack.pop());
            break;
          }
        }
        out.push(html.slice(lt, gt + 1)); i = gt + 1; continue;
      }
      if (!/[a-zA-Z]/.test(c1)) { out.push('<'); i = lt + 1; continue; }
      // thẻ mở: tìm '>' ngoài ngoặc kép
      var j = lt + 1, q = null;
      for (; j < n; j++) {
        var ch = html.charAt(j);
        if (q) { if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'") q = ch;
        else if (ch === '>') break;
      }
      if (j >= n) { out.push(html.slice(lt)); break; }
      var tag = html.slice(lt, j + 1);
      var mm = /^<([a-zA-Z][\w:-]*)([\s\S]*?)(\/?)>$/.exec(tag);
      var name = mm[1].toLowerCase(), attrs = docThuocTinh(mm[2]), tuDong = mm[3] === '/' || THE_RONG.test(name);
      var cls = [], style = null;
      attrs.forEach(function (a) {
        if (a.name === 'class') cls = a.value.split(/\s+/).filter(Boolean);
        else if (a.name === 'style') style = a.value;
      });
      var el = { name: name, cls: cls, boc: false };
      var props = {}, coLuat = false;
      rules.forEach(function (l) {
        if (!khopChuoi(l.chain, el, stack)) return;
        coLuat = true;
        l.decls.forEach(function (kv) { props[kv[0]] = kv[1]; });
      });
      var conLop = cls.filter(function (c) { return !known[c]; });
      var doiLop = conLop.length !== cls.length;
      if (coLuat || doiLop || (style && /var\(|font-weight/.test(style))) {
        if (style) tachKhai(style).forEach(function (kv) { delete props[kv[0]]; props[kv[0]] = kv[1]; });
        var fw = props['font-weight'];
        delete props['font-weight'];
        if (fw && /^(bold|bolder|[6-9]\d\d)$/.test(fw) && !THE_DAM.test(name) && !tuDong) el.boc = true;
        var st = [];
        Object.keys(props).forEach(function (p) {
          var v = giaiVar(props[p], vars);
          if (BO_THUOC_TINH.test(p) || /var\(/.test(v)) return;
          st.push(p + ':' + v);
        });
        var moi = '<' + mm[1];
        attrs.forEach(function (a) {
          if (a.name === 'style') return;
          if (a.name === 'class') { if (conLop.length) moi += ' class="' + conLop.join(' ') + '"'; return; }
          moi += ' ' + a.raw;
        });
        if (st.length) moi += ' style="' + st.join(';').replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
        moi += (mm[3] === '/' ? '/' : '') + '>';
        tag = moi;
      }
      out.push(tag);
      if (el.boc) out.push('<strong>');
      if (!tuDong) stack.push(el);
      i = j + 1;
    }
    while (stack.length) dongBoc(stack.pop());
    return out.join('');
  }

  /* ===================== ánh xạ sang mô hình ngân hàng ===================== */

  function tenAnhAscii(p) {
    var base = p.replace(/^.*\//, '').replace(/\.[^.]*$/, '');
    var s = core.slugAscii(base).slice(0, 60).replace(/_+$/, '');
    return s || 'anh';
  }

  // Đổi mọi <img src> trong HTML thành "images/<tên ASCII>" và chép ảnh vào ngân hàng
  function doiAnh(ctx, html, iss, kieuAnh) {
    html = String(html == null ? '' : html).replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)\2/gi, function (m, a, q, src) {
      if (/^(data:|https?:|\/\/)/i.test(src)) return m;
      var ten = layTenAnh(ctx, src, iss);
      return ten ? a + '"images/' + ten + '"' : m;
    });
    // ảnh chưa có kích thước (kích thước nằm trong CSS bộ máy) → giới hạn để không tràn khung Canvas
    return html.replace(/<img\b[^>]*>/gi, function (t) {
      if (/\sstyle\s*=|\swidth\s*=|\sheight\s*=/i.test(t)) return t;
      return t.replace(/^<img\b/i, '<img style="' + (kieuAnh || 'max-width:100%;height:auto') + '"');
    });
  }
  // SVG: Canvas bỏ → gỡ trước, để lại mô tả (aria-label) đánh dấu chỗ hình
  function boSvg(html) {
    return String(html).replace(/<svg\b([^>]*)>[\s\S]*?<\/svg>/gi, function (m, at) {
      var nhan = (/aria-label\s*=\s*"([^"]*)"/i.exec(at) || [])[1];
      return '<p><em>[Hình vẽ' + (nhan ? ': ' + nhan : '') + ']</em></p>';
    });
  }
  function layTenAnh(ctx, src, iss) {
    var p = noiDuongDan(ctx.baseDir, giaiThucThe(src));
    if (ctx.tenAnh[p]) return ctx.tenAnh[p];
    var data = layFile(ctx.files, p);
    if (!data) { iss.push(core.newIssue('error', 'thiếu ảnh "' + src + '" trong gói')); return null; }
    var ext = (/\.([a-z0-9]+)$/i.exec(p) || [])[1];
    ext = ext ? ext.toLowerCase() : '';
    if (!/^(png|jpe?g|gif)$/.test(ext)) {
      iss.push(core.newIssue('error', 'ảnh "' + src + '" định dạng .' + ext + ' — Canvas chỉ nhận PNG/JPG/GIF, hãy đổi sang PNG'));
      return null;
    }
    var goc = tenAnhAscii(p), ten = goc + '.' + ext, k = 2;
    while (ctx.images[ten] && ctx.anhTen[ten] !== p) ten = goc + '_' + (k++) + '.' + ext;
    ctx.images[ten] = data; ctx.anhTen[ten] = p; ctx.tenAnh[p] = ten;
    return ten;
  }

  // Làm sạch một mảnh HTML: ảnh → CSS nội tuyến → html.cleanForCanvas
  function lamSach(ctx, html, iss, kieuAnh) {
    html = core.nfc(html == null ? '' : html);
    if (!html.trim()) return '';
    if (/<svg\b/i.test(html)) html = boSvg(html);
    html = doiAnh(ctx, html, iss, kieuAnh);
    html = inlineCss(html, ctx.css.rules, ctx.css.vars, ctx.css.known);
    var r = ctx.html.cleanForCanvas(html, { images: ctx.images, imageMap: {}, cssMap: ctx.css.map, rootVars: ctx.css.vars });
    if (r && r.issues) r.issues.forEach(function (x) { iss.push(x); });
    return r && typeof r.html === 'string' ? r.html : String(r || '');
  }
  function thuan(ctx, html) {
    var s = ctx.html.toPlainText ? ctx.html.toPlainText(String(html == null ? '' : html)) : thuanDuPhong(html);
    return core.nfc(s).replace(/[\s\u00a0]+/g, ' ').trim();
  }

  // Bọc đoạn: có thẻ khối thì <div>, không thì <p>
  function boc(h) {
    h = String(h == null ? '' : h).trim();
    if (!h) return '';
    return /<(div|p|table|ul|ol|figure|blockquote|h[1-6]|section|pre|dl)\b/i.test(h) ? '<div>' + h + '</div>' : '<p>' + h + '</p>';
  }

  // Các cách viết đáp án ngắn được chấp nhận (mô phỏng norm()/loose() của bộ máy chấm SCORM)
  function shortVariants(list, opt) {
    opt = opt || {};
    if (list == null) list = [];
    if (!Array.isArray(list)) list = [list];
    var base = [];
    function them(s) { s = core.nfc(s).replace(/[\s\u00a0]+/g, ' ').trim(); if (s && base.indexOf(s) < 0) base.push(s); }
    list.forEach(function (a) {
      if (a == null) return;
      a = core.nfc(giaiThucThe(boThe(String(a)))).replace(/[\s\u00a0]+/g, ' ').trim();
      if (!a) return;
      them(a);
      if (/[‘’ʼ]/.test(a)) them(a.replace(/[‘’ʼ]/g, "'"));
      else if (/[A-Za-z]'[A-Za-z]/.test(a)) them(a.replace(/'/g, '’'));
      if (/[“”]/.test(a)) them(a.replace(/[“”]/g, '"'));
    });
    base.slice().forEach(function (a) { var b = a.replace(/\s*[.,;:!?]+$/, ''); if (b && b !== a) them(b); });
    if (opt.loose) {
      base.slice().forEach(function (a) {
        if (/[A-Za-z]-[A-Za-z]/.test(a)) { them(a.replace(/([A-Za-z])-(?=[A-Za-z])/g, '$1 ')); them(a.replace(/([A-Za-z])-(?=[A-Za-z])/g, '$1')); }
      });
      base.slice().forEach(function (a) {
        var m = /^(a|an|the)\s+([A-Za-z].*)$/i.exec(a);
        if (m && m[2].split(' ').length <= 3) them(m[2]);                  // chỉ cụm từ ngắn ("a door" → "door")
      });
    }
    return core.answerVariants(base);
  }

  var RE_KHOANG_SO = /^(câu|cau|question|questions|bài|bai)?\s*\d+\s*([–—-]\s*\d+)?\s*[.:]?$/i;
  // Bỏ câu nhắc ví dụ / ô điểm của đề giấy trong lời dẫn
  function locLoiDan(s) {
    return String(s == null ? '' : s)
      .replace(/(<i>|<em>)?\s*There\s+(is|are)\s+(one|an|two|\d+)\s+(example|examples|extra answer)s?\.?\s*(<\/i>|<\/em>)?/gi, ' ')
      .replace(/\(\s*…+\s*\/\s*\d+\s*points?\s*\)\.?/gi, ' ')
      .replace(/^\s*[—–-]\s*/, '')
      .replace(/\s{2,}/g, ' ').trim();
  }
  function loiDanNhom(G) {
    var h = String(G.head || '').trim(), out = [];
    if (h && !RE_KHOANG_SO.test(thuanDuPhong(h))) {
      h = h.replace(/^\s*\d+\s*[.)]\s*/, '');           // "1. Look and …" → "Look and …"
      h = locLoiDan(h);
      if (h) out.push('<p><strong>' + h + '</strong></p>');
    }
    (G.instr || []).forEach(function (s) { s = locLoiDan(s); if (thuanDuPhong(s)) out.push(boc(s)); });
    return out.join('');
  }

  function htmlDoanDan(R) {
    if (!R) return '';
    var h = '';
    if (R.head) h += '<p><strong>' + R.head + '</strong></p>';
    if (R.title) h += '<p style="text-align:center;font-size:1.15em"><strong>' + R.title + '</strong></p>';
    if (R.sub) h += '<p style="text-align:center"><em>' + R.sub + '</em></p>';
    (R.paras || []).forEach(function (p) {
      var t = String(p.t == null ? '' : p.t);
      h += p.k ? '<p><strong>' + p.k + '</strong>&nbsp;&nbsp;' + t + '</p>' : boc(t);
    });
    return h ? '<div style="border:1px solid #dfe4ee;border-left:4px solid #12264a;border-radius:8px;padding:12px 14px;margin:0 0 12px">' + h + '</div>' : '';
  }

  function htmlAnhCau(it) {
    if (!it.img) return '';
    var cls = String(it.imgClass || '');
    if (/ultra/.test(cls)) {
      return '<div style="overflow-x:auto;text-align:center"><img src="' + it.img + '" alt="" style="max-width:none;width:740px;height:auto"></div>';
    }
    var st = /tall/.test(cls) ? 'max-width:100%;max-height:300px;width:auto;height:auto' : 'max-width:100%;height:auto';
    return '<p style="text-align:center"><img src="' + it.img + '" alt="" style="' + st + '"></p>';
  }
  // Thân câu như bộ máy vẽ: q → table → img → q2 → hint
  function thanCau(it) {
    var h = boc(it.q);
    h += it.table || '';
    h += htmlAnhCau(it);
    h += boc(it.q2);
    if (it.hint) h += '<p><em>(' + it.hint + ')</em></p>';
    return h;
  }
  function coSo(text, n) { return new RegExp('(^|[^0-9])' + n + '(?![0-9])').test(text); }
  function chuanKhoa(s) { return core.nfc(giaiThucThe(boThe(s))).replace(/[‘’ʼ]/g, "'").replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase(); }

  function themIssue(q, level, msg) {
    if (q.issues.some(function (x) { return x.msg === msg; })) return;
    q.issues.push(core.newIssue(level, msg, q.id));
  }
  // Chuyển issue thô (không tiền tố) thành issue của câu
  function nhanIssue(q, raw) {
    raw.forEach(function (x) {
      var msg = String(x.msg || '');
      if (!/^Câu\b/.test(msg)) msg = q.title + ': ' + msg;
      if (q.issues.some(function (y) { return y.msg === msg && y.level === x.level; })) return;
      q.issues.push(core.newIssue(x.level || 'warn', msg, q.id));
    });
  }

  var ANH_PHUONG_AN = 'max-width:100%;max-height:130px;width:auto;height:auto';
  var RE_CAN_NGUYEN_TU_KHOI = /(khối lượng|phân tử khối|nguyên tử khối|\bgam\b|\bmg\b|\bkg\b|\btấn\b|\bmol\b|hiệu suất)/i;

  function tenNganHang(ex) {
    var E = ex.EXAM || {}, t = '';
    if (ex.variant === 'tpl-enc' || ex.variant === 'tpl-plain') {
      t = thuanDuPhong(E.title || '');
      var sub = thuanDuPhong(E.subtitle || '').replace(/\s*[|·]\s*\d+\s*(câu|câu hỏi|questions?)\s*$/i, '').trim();
      if (sub) t = t ? t + ' – ' + sub : sub;
    }
    if (!t) t = ex.meta.htmlTitle || ex.meta.manifestTitles[0] || thuanDuPhong(E.title || '');
    return core.nfc(t).replace(/\s+/g, ' ').trim() || 'Ngân hàng SCORM';
  }

  /** Dựng ngân hàng từ dữ liệu đã bóc. */
  function buildBank(ex, opts) {
    opts = opts || {};
    var modHtml = opts.html || layModuleHtml();
    if (!modHtml || typeof modHtml.cleanForCanvas !== 'function') throw new Error('Thiếu module làm sạch HTML (js/html.js)');
    var E = ex.EXAM || {};
    var title = tenNganHang(ex);
    var bank = {
      title: title, ident: core.bankIdent(title),
      source: { kind: 'scorm', name: opts.fileName || ex.meta.manifestId || 'scorm.zip' },
      questions: [], images: {}, warnings: []
    };
    // CSS của gói
    var lop = {};
    walkStrings({ EXAM: E, PARTS: ex.PARTS }, function (s) {
      var re = /\bclass\s*=\s*["']([^"']+)["']/g, m;
      while ((m = re.exec(s))) m[1].split(/\s+/).filter(Boolean).forEach(function (c) { lop[c] = 1; });
    });
    var luatGoc = parseCss(ex.html), vars = rootVarsCua(luatGoc);
    var chon = chonLuatCss(luatGoc, lop, vars);
    var cssMap = {};
    chon.rules.forEach(function (l) {
      if (l.chain.length !== 1 || l.chain[0].cls.length !== 1) return;
      var c = l.chain[0].cls[0];
      cssMap[c] = (cssMap[c] ? cssMap[c] + ';' : '') + l.decls.filter(function (kv) { return !BO_THUOC_TINH.test(kv[0]); })
        .map(function (kv) { return kv[0] + ':' + kv[1]; }).join(';');
    });
    var ctx = {
      files: ex.files, baseDir: ex.baseDir, images: bank.images, tenAnh: {}, anhTen: {}, html: modHtml,
      css: { rules: chon.rules, known: chon.known, vars: vars, map: cssMap }
    };
    ex.warnings.forEach(function (w) { bank.warnings.push(core.newIssue('warn', w)); });

    // số câu lặp giữa các phần (K12 đánh số lại từ 1) → thêm tiền tố phần vào mã/tên câu
    var soPhan = {}, lap = false;
    (ex.PARTS || []).forEach(function (P, pi) {
      (P.groups || []).forEach(function (G) {
        var ns = (G.items || []).map(function (it) { return it.n; }).concat(G.nums || []);
        ns.forEach(function (n) { if (soPhan[n] != null && soPhan[n] !== pi) lap = true; soPhan[n] = pi; });
      });
    });
    var daDung = {};

    var ghiChu = String(E.note || '').trim();
    var canGhiChu = ex.noteNeeded && ghiChu;
    var htmlGhiChu = canGhiChu ? '<p style="background:#f7f9fd;border:1px solid #dfe4ee;border-radius:6px;padding:6px 10px"><em>' + ghiChu + '</em></p>' : '';
    var thang = Array.isArray(E.tfLadder) && E.tfLadder.length ? E.tfLadder : THANG_DS_MAC_DINH;
    var heSoTf = Number(thang[thang.length - 1]) || 1;
    var coTf = false;

    function taoCau(P, pi, nums, type, points) {
      var no = nums.length > 1 ? (laLienTiep(nums) ? nums[0] + '–' + nums[nums.length - 1] : nums.join(', ')) : String(nums[0]);
      var id = 'q' + pad2(nums[0]) + (nums.length > 1 ? '_' + pad2(nums[nums.length - 1]) : '');
      if (lap) id = 'p' + (pi + 1) + '_' + id;
      id = id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      var goc = id, k = 2;
      while (daDung[id]) id = goc + '_' + (k++);
      daDung[id] = 1;
      var ten = 'Câu ' + no;
      if (lap && P.label) ten = thuanDuPhong(P.label) + ' – ' + ten;
      var phan = thuanDuPhong((P.label || '') + (P.sub ? '. ' + P.sub : ''));
      return {
        id: id, no: no, title: ten, type: type, points: Math.round(points * 10000) / 10000,
        stimulus: '', stem: '', feedback: '',
        meta: { level: '', topic: '', part: phan, tags: [] }, issues: []
      };
    }
    function laLienTiep(ns) { for (var i = 1; i < ns.length; i++) if (Number(ns[i]) !== Number(ns[i - 1]) + 1) return false; return true; }

    (ex.PARTS || []).forEach(function (P, pi) {
      var htmlDoan = P.passage ? htmlDoanDan(P.passage) : '';
      (P.groups || []).forEach(function (G) {
        var per = G.perItem != null ? Number(G.perItem) : 1;
        if (!(per > 0)) per = 1;
        var items = G.items || [];
        var loai = String(G.type || 'mcq');
        var loiDan = loiDanNhom(G);
        var nhomCau = /^(gap|flow|multi|letters|select|bank)$/.test(loai);
        // đoạn dẫn chung: ghi chú đề (khi cần) + bài đọc của phần + lời dẫn nhóm + khối pre
        var chuDan = thuanDuPhong(htmlDoan + (G.pre || ''));               // để dò số câu được nhắc tới
        function dungStimulus(coLoiDan, phanCau) {
          var iss = [];
          var h = (canGhiChu && RE_CAN_NGUYEN_TU_KHOI.test(phanCau) ? htmlGhiChu : '') + htmlDoan + (coLoiDan ? loiDan : '') + (G.pre || '');
          return { html: lamSach(ctx, h, iss), iss: iss };
        }
        function diemCau(it) { return it && it.pt != null ? Number(it.pt) : per; }
        function ketThuc(q, stim, iss) {
          if (stim) { q.stimulus = stim.html; nhanIssue(q, stim.iss); }
          nhanIssue(q, iss);
          bank.questions.push(q);
        }

        if (loai === 'mcq' || loai === 'mistake' || loai === 'tf' || loai === 'short' || loai === 'order') {
          items.forEach(function (it) {
            var iss = [];
            var qType = loai === 'mcq' || loai === 'mistake' ? 'mc' : loai === 'order' ? 'short' : loai;
            var pts = diemCau(it);
            if (loai === 'tf') { pts = pts * heSoTf; coTf = true; }
            var q = taoCau(P, pi, [it.n], qType, pts);
            var qRong = !thuanDuPhong(it.q) && !/<img\b/i.test(String(it.q || ''));
            var danVaoThan = qRong || loai === 'order';                    // lời dẫn là yêu cầu chính của câu
            var than = '';
            if (loai === 'mistake') {
              var cau = '';
              (it.seg || []).forEach(function (s) {
                cau += s.k ? '<u><strong>' + s.t + '</strong></u><sup style="color:#d21235">' + s.k + '</sup>' : s.t;
              });
              than = '<p style="line-height:2">' + cau + '</p>';
            } else than = thanCau(it);
            if (loai === 'order') {
              than += '<p>' + (it.chunks || []).map(function (c) {
                return '<span style="display:inline-block;border:1px solid #dce7ee;border-radius:8px;padding:2px 10px;margin:2px;background:#f7f9fd">' + esc(c.t) + '</span>';
              }).join(' ') + '</p>';
            }
            // số câu được nhắc trong bài đọc/khối dẫn mà thân câu chưa có → ghi "(n)" đầu câu
            var chuThan = thuanDuPhong(than);
            var danSo = chuDan && coSo(chuDan, it.n) && (qRong || !coSo(chuThan, it.n)) ? '<p><strong>(' + it.n + ')</strong></p>' : '';
            var stem = (danVaoThan ? loiDan : '') + danSo + than;
            if (!thuanDuPhong(stem) && !/<(img|math|table)\b/i.test(stem)) stem = '<p>Chọn đáp án đúng.</p>' + stem;
            q.stem = lamSach(ctx, stem, iss);

            if (qType === 'mc') {
              var opts = loai === 'mistake' ? (it.seg || []).filter(function (s) { return s.k; }).map(function (s) { return { k: s.k, t: s.t }; })
                : (it.opts || G.opts || []);
              var dung = -1;
              q.choices = opts.map(function (o, i) {
                var k = (o && typeof o === 'object') ? o.k : LET[i];
                if (k === it.ans) dung = i;
                return { id: LET[i] || String(i + 1), html: lamSach(ctx, (o && typeof o === 'object') ? o.t : o, iss, ANH_PHUONG_AN), correct: false };
              });
              if (dung < 0 && typeof it.ans === 'string' && LET.indexOf(it.ans) >= 0 && LET.indexOf(it.ans) < opts.length) dung = LET.indexOf(it.ans);
              if (dung >= 0) q.choices[dung].correct = true;
              else iss.push(core.newIssue('error', 'không khớp được đáp án "' + it.ans + '" với phương án nào'));
            } else if (qType === 'tf') {
              q.statements = (it.sub || []).map(function (s) {
                var v = String(s.ans == null ? '' : s.ans).trim().toUpperCase();
                var val = /^(Đ|ĐÚNG|D|T|TRUE|1)$/.test(v) ? true : /^(S|SAI|F|FALSE|0)$/.test(v) ? false : null;
                if (val === null) iss.push(core.newIssue('error', 'ý ' + s.k + ') có đáp án lạ "' + s.ans + '"'));
                return { key: s.k, html: lamSach(ctx, s.t, iss), value: val };
              });
            } else {
              var dsDa = loai === 'order' ? [it.ans] : (Array.isArray(it.ans) ? it.ans : [it.ans]);
              q.answers = shortVariants(dsDa, { loose: ex.variant !== 'thpt-v0' && ex.variant !== 'kid-math' });
              if (loai === 'order') {
                iss.push(core.newIssue('warn', 'câu sắp xếp thẻ chuyển thành câu trả lời ngắn: học sinh phải gõ lại đúng cả câu; ' +
                  'cách chấm 0,5 điểm cho mỗi thẻ đúng vị trí của đề gốc không làm được trên Canvas'));
              }
            }
            if (/<svg\b/i.test(String(it.table || ''))) {
              iss.push(core.newIssue('warn', 'hình vẽ SVG của câu bị bỏ (Canvas không giữ SVG) — câu hỏi cần hình này; ' +
                'hãy chụp hình thành ảnh PNG rồi chèn lại'));
            }
            var phanCau = thuanDuPhong([it.q, it.q2, it.table, (it.opts || []).map(function (o) { return o && o.t != null ? o.t : o; }).join(' '),
              (it.sub || []).map(function (s) { return s.t; }).join(' ')].join(' '));
            ketThuc(q, dungStimulus(!danVaoThan, phanCau), iss);
          });
          return;
        }

        if (!nhomCau) {
          var nsX = items.map(function (it) { return it.n; });
          var qx = taoCau(P, pi, nsX.length ? nsX : [bank.questions.length + 1], 'text', 0);
          qx.stem = lamSach(ctx, loiDan, []);
          themIssue(qx, 'error', qx.title + ': dạng câu "' + loai + '" của gói SCORM chưa hỗ trợ');
          bank.questions.push(qx);
          return;
        }

        // ---- các dạng cả nhóm thành MỘT câu Canvas ----
        var iss2 = [];
        var nums = loai === 'multi' ? (G.nums || []).slice() : items.map(function (it) { return it.n; });
        if (!nums.length) return;
        var tong = loai === 'multi' ? 0 : items.reduce(function (a, it) { return a + diemCau(it); }, 0);
        var qType2 = loai === 'multi' ? 'ma' : (loai === 'gap' || loai === 'flow') ? 'blanks' : loai === 'bank' ? 'dropdowns' : 'matching';
        if (loai === 'multi') {
          var dsDung = Array.isArray(G.ans) ? G.ans : [G.ans];
          tong = per * dsDung.length;
        }
        var q2 = taoCau(P, pi, nums, qType2, tong);
        var diemKhac = items.some(function (it) { return diemCau(it) !== diemCau(items[0]); });
        if (diemKhac) iss2.push(core.newIssue('warn', 'các ý trong nhóm có điểm khác nhau — Canvas chia đều điểm cho từng ô'));
        var stem2 = loiDan;

        if (loai === 'gap' || loai === 'flow') {
          var daThay = {};
          var thayO = function (s) {
            return String(s == null ? '' : s).replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, n) {
              daThay[n] = (daThay[n] || 0) + 1;
              return '<strong>(' + n + ')</strong>&nbsp;[b' + String(n).toLowerCase() + ']';
            });
          };
          if (loai === 'flow') {
            if (G.title) stem2 += '<p style="text-align:center"><strong>' + G.title + '</strong></p>';
            (G.steps || []).forEach(function (s) {
              if (s.arrow !== undefined) stem2 += '<p style="text-align:center;margin:2px 0">↓' + (s.arrow ? ' <em>' + s.arrow + '</em>' : '') + '</p>';
              else stem2 += '<div style="border:1px solid #dfe4ee;border-radius:8px;padding:8px 12px;margin:4px 0;background:#f7f9fd">' + thayO(s.html) + '</div>';
            });
          } else {
            (G.lines || []).forEach(function (L) { stem2 += '<p style="line-height:2">' + thayO(L) + '</p>'; });
          }
          q2.blanks = items.map(function (it) {
            var bid = 'b' + String(it.n).toLowerCase();
            if (!daThay[it.n]) iss2.push(core.newIssue('error', 'không thấy chỗ trống {{' + it.n + '}} trong nội dung nhóm'));
            return { id: bid, accepts: shortVariants(Array.isArray(it.ans) ? it.ans : [it.ans], { loose: true }) };
          });
        } else if (loai === 'multi') {
          var dsD = (Array.isArray(G.ans) ? G.ans : [G.ans]).map(String);
          q2.choices = (G.opts || []).map(function (o, i) {
            var k = (o && typeof o === 'object') ? o.k : LET[i];
            return { id: LET[i] || String(i + 1), html: lamSach(ctx, (o && typeof o === 'object') ? o.t : o, iss2, ANH_PHUONG_AN), correct: dsD.indexOf(String(k)) >= 0 };
          });
          var nDung = q2.choices.filter(function (c) { return c.correct; }).length;
          if (nDung !== dsD.length) iss2.push(core.newIssue('error', 'đáp án nhóm "' + dsD.join(', ') + '" không khớp phương án'));
          iss2.push(core.newIssue('info', 'câu chọn ' + dsD.length + ' đáp án: Canvas trừ điểm khi chọn thêm phương án sai (đề gốc không trừ)'));
        } else if (loai === 'bank') {
          // danh sách từ, bỏ từ chỉ dùng cho câu ví dụ
          var tuVd = [];
          if (G.example && G.example.ans != null) tuVd = (Array.isArray(G.example.ans) ? G.example.ans : [G.example.ans]).map(chuanKhoa);
          var daDungTu = {};
          items.forEach(function (it) { (Array.isArray(it.ans) ? it.ans : [it.ans]).forEach(function (a) { daDungTu[chuanKhoa(a)] = 1; }); });
          var luaChon = (G.bank || []).map(function (w) { return thuan(ctx, esc(w)); })
            .filter(function (w) { var k = chuanKhoa(w); return !(tuVd.indexOf(k) >= 0 && !daDungTu[k]); });
          var khoaLC = luaChon.map(chuanKhoa);
          var dongCau = '';
          q2.dropdowns = items.map(function (it) {
            var bid = 'b' + String(it.n).toLowerCase();
            var dsA = (Array.isArray(it.ans) ? it.ans : [it.ans]).map(chuanKhoa);
            var dung = -1;
            for (var a = 0; a < dsA.length && dung < 0; a++) dung = khoaLC.indexOf(dsA[a]);
            if (dung < 0) iss2.push(core.newIssue('error', 'câu ' + it.n + ': đáp án "' + (Array.isArray(it.ans) ? it.ans[0] : it.ans) + '" không có trong danh sách từ'));
            var cauHoi = String(it.q || '');
            if (/_{3,}|…{2,}|\.{4,}/.test(cauHoi)) cauHoi = cauHoi.replace(/_{3,}|…{2,}|\.{4,}/, '[' + bid + ']');
            else cauHoi = cauHoi + ' → [' + bid + ']';
            dongCau += '<p><strong>' + it.n + '.</strong> ' + cauHoi + '</p>' + (it.table || '') + htmlAnhCau(it);
            return { id: bid, options: luaChon.slice(), correct: dung };
          });
          stem2 += '<p><em>Từ cho sẵn:</em> ' + luaChon.map(esc).join(' · ') + '</p>' + dongCau;
        } else {
          // letters / select → ghép nối; vế phải "A. Tên" / "ix. Tiêu đề"
          var dsPhai = [];
          if (loai === 'select') dsPhai = (G.list || []).map(function (h) { return { k: String(h.k), t: h.k + '. ' + thuan(ctx, h.t) }; });
          else if (G.people && G.people.length) dsPhai = G.people.map(function (p) { return { k: String(p.k), t: p.k + '. ' + thuan(ctx, p.t) }; });
          else dsPhai = (G.keys || []).map(function (k) { return { k: String(k), t: String(k) }; });
          var khoaVd = {};
          if (G.exampleKey) khoaVd[G.exampleKey] = 1;
          if (G.example && G.example.ans != null && typeof G.example.ans !== 'object') khoaVd[G.example.ans] = 1;
          if (G.pre && G.people) {
            var reTag = /class\s*=\s*["'][^"']*\bextag\b[^"']*["'][^>]*>([\s\S]*?)<\//gi, mt;
            while ((mt = reTag.exec(G.pre))) {
              var tv = chuanKhoa(mt[1]);
              G.people.forEach(function (p) { if (chuanKhoa(p.t) === tv) khoaVd[p.k] = 1; });
            }
          }
          var daDungK = {};
          q2.pairs = items.map(function (it) {
            var r = dsPhai.filter(function (x) { return x.k === String(it.ans); })[0];
            if (!r) { iss2.push(core.newIssue('error', 'câu ' + it.n + ': đáp án "' + it.ans + '" không có trong danh sách')); r = { t: String(it.ans) }; }
            daDungK[String(it.ans)] = 1;
            var trai = lamSach(ctx, (it.q ? it.q : '') + (it.table || '') + htmlAnhCau(it), iss2);
            return { left: trai, right: r.t };
          });
          q2.distractors = dsPhai.filter(function (x) { return !daDungK[x.k] && !khoaVd[x.k]; }).map(function (x) { return x.t; });
        }
        q2.stem = lamSach(ctx, stem2, iss2);
        var phanNhom = thuanDuPhong(stem2);
        ketThuc(q2, dungStimulus(false, phanNhom), iss2);
      });
    });

    if (coTf) {
      bank.warnings.push(core.newIssue('warn', 'Câu Đúng/Sai: đề gốc chấm theo bậc thang ' + thang.join(' / ') +
        ' theo số ý đúng; Canvas chỉ chấm tuyến tính (mỗi ý đúng được điểm bằng nhau)'));
    }
    if (!bank.questions.length) bank.warnings.push(core.newIssue('error', 'Gói SCORM không có câu hỏi nào'));
    return bank;
  }

  /** parseScorm(u8, {fileName, evalData, html}) → Promise<{banks:[Bank], issues:[Issue]}> */
  async function parseScorm(u8, opts) {
    opts = opts || {};
    var ten = opts.fileName || 'gói SCORM';
    try {
      var ex = await extract(u8, opts);
      var bank = buildBank(ex, opts);
      bank.scorm = { variant: ex.variant, encrypted: ex.encrypted, entry: ex.entry };
      return { banks: [bank], issues: [] };
    } catch (e) {
      return { banks: [], issues: [core.newIssue('error', ten + ': ' + (e && e.message ? e.message : String(e)))] };
    }
  }

  return {
    parseScorm: parseScorm,
    makeIframeEvaluator: makeIframeEvaluator,
    extract: extract,
    buildBank: buildBank,
    // phục vụ kiểm thử
    _internal: {
      decryptKeys: decryptKeys, base64Bytes: base64Bytes, dataRegion: dataRegion, sliceFunction: sliceFunction,
      detect: detect, parseCss: parseCss, chonLuatCss: chonLuatCss, inlineCss: inlineCss, rootVarsCua: rootVarsCua,
      shortVariants: shortVariants, nodeEvaluator: nodeEvaluator, duoiTraVe: duoiTraVe, locLoiDan: locLoiDan
    }
  };
});
