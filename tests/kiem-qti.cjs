/* tests/kiem-qti.cjs — bộ kiểm tra gói QTI 1.2 ĐỘC LẬP: mô phỏng những gì importer Canvas đòi hỏi
 * (bước Python QTIMigrationTool → QTI 2.1, rồi bước Ruby qti_exporter → câu hỏi Canvas).
 * Cố ý KHÔNG đọc js/qti.js — chỉ dựa trên docs/nghien-cuu/reconciled.md và mã nguồn Canvas.
 *
 * Trích dẫn giống reconciled.md §0:
 *   Q: = instructure/QTIMigrationTool @aab28af  (lib/imsqtiv1.py, lib/imscp.py, lib/xmlutils.py)
 *   C: = instructure/canvas-lms @1c9f0bb       (gems/plugins/qti_exporter/lib/qti/*.rb, gems/canvas_sanitize, app/models/…)
 *   R§ = docs/nghien-cuu/reconciled.md,  D§ = DESIGN.md
 *
 * API:  checkPackage(files, opts?) → { ok, layout, errors, warnings, banks, quiz?, quizzes, stats }
 *       checkZip(u8, opts?) → Promise<cùng kết quả>        (dùng js/zip.js readZip)
 *       grade(item, response) → { score, correctParts, totalParts } | null   (mô phỏng chấm Classic, R§2.11)
 *       formatReport(result) → chuỗi báo cáo
 * CLI:  node tests/kiem-qti.cjs <goi.zip | thư-mục> [--json]   (mã thoát 1 khi có lỗi)
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NH = root.NH || {}; root.NH.kiemQti = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function napModule(ten) {
    if (typeof require === 'function') { try { return require('../js/' + ten + '.js'); } catch (e) { return null; } }
    return (root && root.NH && root.NH[ten]) || null;
  }
  var core = napModule('core');
  var zipMod = napModule('zip');

  /* ===================== hằng số trích từ mã nguồn ===================== */

  // Loại câu Canvas mà bộ kiểm tra hỗ trợ (C:app/models/assessment_question.rb#L40-L52 — trừ calculated/missing_word/file_upload)
  var LOAI_HO_TRO = ['multiple_choice_question', 'true_false_question', 'multiple_answers_question',
    'short_answer_question', 'fill_in_multiple_blanks_question', 'multiple_dropdowns_question',
    'matching_question', 'numerical_question', 'essay_question', 'text_only_question'];
  var LOAI_CANVAS_KHAC = ['calculated_question', 'missing_word_question', 'file_upload_question'];

  // Không gian tên QTI 2 trong manifest → Canvas chuyển sang nhánh QTI 2 (C:…/qti/converter.rb#L31-L36, #L85-L91)
  var NS_QTI2 = ['http://www.imsglobal.org/xsd/imsqti_v2p0', 'http://www.imsglobal.org/xsd/imsqti_v2p1',
    'http://www.imsglobal.org/xsd/qti/qtiv2p0', 'http://www.imsglobal.org/xsd/qti/qtiv2p1'];

  // Phần tử QTI 1.2 mà Python xử lý (Q:imsqtiv1.py#L6093-L6280, QTIASI_ELEMENTS); tên khác → Unsupported, bỏ cả cây con
  var PY_HO_TRO = tapHop('assess_procextension and answer answer_scale answer_tolerance assessment assessmentmetadata ' +
    'bbmd_asi_object_id bbmd_assessmenttype bbmd_questiontype cc_maxattempts cc_weighting conditionvar calculated ' +
    'decimalplaces decvar displayfeedback duration fieldentry fieldlabel file flow flow_label flow_mat formula formulas ' +
    'grade_item hint hintmaterial interpretvar item itemcontrol itemfeedback itemmetadata itemproc_extension itemref ' +
    'manifest mat_extension mat_formattedtext matapplication mataudio matbreak matemtext material material_table matimage ' +
    'mattext max maxvalue min minvalue not objectbank objectives objects_condition objects_parameter or order other outcomes ' +
    'outcomes_metadata outcomes_processing partial_credit_points_percent partial_credit_tolerance points_per_item presentation ' +
    'qmd_absolutescore_max qmd_itemtype qmd_levelofdifficulty qmd_maximumscore qmd_status qmd_timelimit qmd_toolvendor ' +
    'qmd_topic qticomment qtimetadata qtimetadatafield qti_metadatafield questestinterop render_choice render_fib ' +
    'render_hotspot render_slider resources resource respcond_extension precision tolerance respcondition response_grp ' +
    'response_label response_lid response_num response_str response_xy resprocessing rubric section selection ' +
    'selection_number selection_extension selection_metadata selection_ordering setvar solution solutionmaterial ' +
    'sourcebank_ref sourcebank_context sourcebank_is_external unanswered unit_case_sensitive unit_points_percent ' +
    'unit_required unit_value varequal vargt vargte variable varinside varlt varlte var vars var_set var_sets varsubset ' +
    'varsubstring vocabulary');

  // CheckLocation(…, do_assert=True): cha sai → QTIException → CẢ FILE bị bỏ, Canvas không báo (Q:imsqtiv1.py#L289-L292, #L6350-L6353)
  var RESP = ['response_lid', 'response_xy', 'response_str', 'response_num', 'response_grp'];
  var RENDER = ['render_choice', 'render_hotspot', 'render_slider', 'render_fib'];
  var FLOW = ['flow', 'flow_mat'];                           // FlowMat là lớp con của FlowV1
  var CHA_DK = ['respcondition', 'conditionvar', 'and', 'or', 'not'];
  var VI_TRI = {
    objectbank: ['questestinterop'],                                           // #L660
    section: ['assessment', 'section', 'objectbank', 'questestinterop'],      // #L1462
    itemmetadata: ['item'],                                                    // #L2309
    qtimetadata: ['itemmetadata', 'objectbank', 'assessment', 'section'],      // #L2321
    fieldlabel: ['qtimetadatafield', 'qti_metadatafield'],                     // #L3332
    fieldentry: ['qtimetadatafield', 'qti_metadatafield'],                     // #L3351
    duration: ['item', 'assessment', 'section'],                               // #L3372
    itemcontrol: ['item'],                                                     // #L3397
    presentation: ['item'],                                                    // #L3417
    rubric: ['item', 'assessment', 'section'],                                 // #L3460
    objectives: ['item', 'assessment', 'section'],                             // #L3505
    flow: ['flow', 'flow_mat', 'presentation'],                                // #L3553
    flow_mat: ['flow_mat', 'itemfeedback', 'response_label', 'rubric', 'objectives', 'solutionmaterial', 'hintmaterial'], // #L3629
    material: ['presentation'].concat(FLOW, ['response_label'], RESP, RENDER,
      ['itemfeedback', 'rubric', 'objectives', 'interpretvar', 'solutionmaterial', 'hintmaterial']),                     // #L3655
    mattext: ['material'], matemtext: ['material'], matimage: ['material'], mataudio: ['material'],
    matapplication: ['material'],                                             // MatThing #L3727
    response_lid: ['presentation'].concat(FLOW), response_str: ['presentation'].concat(FLOW),
    response_num: ['presentation'].concat(FLOW), response_xy: ['presentation'].concat(FLOW),
    response_grp: ['presentation'].concat(FLOW),                               // #L4301
    render_choice: RESP, render_fib: RESP, render_hotspot: RESP, render_slider: RESP, // #L4495
    response_label: ['flow_label'].concat(RENDER),                             // #L4938
    flow_label: ['flow_label'].concat(RENDER),                                 // #L5048
    itemfeedback: ['item'],                                                    // #L5083
    solution: ['itemfeedback'], hintmaterial: ['hint'], solutionmaterial: ['solution'],
    resprocessing: ['item'],                                                   // #L5232
    outcomes: ['outcomes_processing', 'resprocessing'],                        // #L5281
    decvar: ['outcomes'],                                                      // #L5315
    respcondition: ['resprocessing'],                                          // #L5419
    setvar: ['respcondition'],                                                 // #L5497
    displayfeedback: ['respcondition'],                                        // #L5551
    conditionvar: ['respcondition'],                                           // #L5581
    and: CHA_DK, or: CHA_DK, not: CHA_DK, other: CHA_DK, unanswered: CHA_DK,   // #L5612-L5712
    varequal: CHA_DK, varlt: CHA_DK, varlte: CHA_DK, vargt: CHA_DK, vargte: CHA_DK,
    varsubset: CHA_DK, varinside: CHA_DK, varsubstring: CHA_DK,
    selection_ordering: ['section', 'assessment'],                             // #L1540
    selection: ['selection_ordering'], selection_number: ['selection'],        // #L1600-L1626
    sourcebank_ref: ['selection'], selection_extension: ['selection'],         // #L1646-L1665
    points_per_item: ['selection_extension'], order: ['selection_ordering'],
    itemref: ['section']
  };

  // Thuộc tính Python đọc (các hàm SetAttribute_* kể cả lớp cha); thuộc tính khác bị bỏ qua kèm
  // "Unknown or unsupported attribute" (Q:imsqtiv1.py#L127-L140) — thường là lỗi gõ
  var THUOC_TINH_QTI = {
    objectbank: 'ident', assessment: 'ident title xml:lang', section: 'ident title visible', item: 'ident label maxattempts title xml:lang',
    qtimetadatafield: 'xml:lang', presentation: 'height label width x0 xml:lang y0', flow: 'class', flow_mat: 'class',
    material: 'label xml:lang', mattext: 'charset entityref height label texttype uri width x0 xml:lang xml:space y0',
    response_lid: 'ident rcardinality respident rtiming', response_str: 'ident rcardinality respident rtiming',
    response_num: 'ident numtype rcardinality respident rtiming', render_choice: 'maxnumber minnumber shuffle',
    render_fib: 'charset columns encoding fibtype maxchars maxnumber minnumber prompt rows',
    response_label: 'ident labelrefid match_group match_max rarea rrange rshuffle', itemfeedback: 'ident title view',
    resprocessing: 'scoremodel', decvar: 'cutvalue defaultval maxvalue members minvalue varname vartype',
    respcondition: 'continue title', setvar: 'action varname', displayfeedback: 'feedbacktype linkrefid',
    varequal: 'case index respident', vargte: 'index respident', varlte: 'index respident', vargt: 'index respident',
    varlt: 'index respident', unanswered: 'respident', selection_ordering: 'sequence_type', selection: 'sequence_type',
    itemmetadata: '', qtimetadata: '', fieldlabel: '', fieldentry: '', outcomes: '', conditionvar: '', and: '', or: '', not: '', other: ''
  };
  Object.keys(THUOC_TINH_QTI).forEach(function (k) { THUOC_TINH_QTI[k] = tapHop(THUOC_TINH_QTI[k]); });
  // Nhãn metadata Python hiểu (MDFieldMap, Q:imsqtiv1.py#L3241-L3290); nhãn khác: "Unmapped metadata field"
  var NHAN_META = tapHop('maximumscore marks name syllabusarea author creator owner itemtype status layoutstatus timelimit ' +
    'cc_maxattempts cc_profile cc_weighting weighting points_possible question_type bank_title original_answer_ids ' +
    'assessment_question_identifierref wct_results_showfeedback wct_results_showtotalscore wct_attempt_attemptsallowed ' +
    'wct_results_scoring wct_fib_questiontext wct_questiontype wct_questioncategory wct_calc_questiontext assessmenttype ' +
    'respondusapi_qpoints respondusapi_qtype questiontype');
  NHAN_META['item type'] = NHAN_META['question type'] = true;

  // Allowlist của bộ làm sạch HTML (C:gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb#L57-L750)
  var HTML_PT = tapHop('a b blockquote br caption cite code col hr h1 h2 h3 h4 h5 h6 del ins iframe font colgroup dd div dl dt ' +
    'em figure figcaption i img li ol p pre q small source span strike strong sub sup abbr table tbody td tfoot th thead tr ' +
    'u ul object embed param video track audio address acronym map area bdo dfn kbd legend samp tt var big article aside ' +
    'details footer header nav section summary time picture ruby rt rp mark');
  var MATH_PT = tapHop('annotation annotation-xml maction maligngroup malignmark math menclose merror mfenced mfrac mglyph ' +
    'mi mlabeledtr mlongdiv mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mscarries mscarry msgroup ' +
    'msline mspace msqrt msrow mstack mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none semantics');
  // phần tử mà bộ làm sạch của ta PHẢI bỏ (D§7) → lỗi; phần tử ngoài allowlist khác → cảnh báo
  var HTML_CAM = tapHop('script style svg input button label s form textarea select option link meta base frame frameset');
  var THUOC_TINH_CHUNG = tapHop('style class id title role lang dir aria-labelledby aria-atomic aria-busy aria-controls ' +
    'aria-describedby aria-disabled aria-dropeffect aria-flowto aria-grabbed aria-haspopup aria-hidden aria-invalid ' +
    'aria-label aria-live aria-owns aria-relevant aria-autocomplete aria-checked aria-description aria-expanded aria-level ' +
    'aria-multiline aria-multiselectable aria-orientation aria-pressed aria-readonly aria-required aria-selected aria-sort ' +
    'aria-valuemax aria-valuemin aria-valuenow aria-valuetext'); // + data-* (#L198)
  var M0 = 'href xref mathcolor mathbackground intent arg ';
  var MSTYLE = M0 + 'scriptlevel displaystyle scriptsizemultiplier scriptminsize infixlinebreakstyle decimalpoint mathvariant ' +
    'mathsize width height valign form fence separator lspace rspace stretchy symmetric maxsize minsize largeop movablelimits ' +
    'accent linebreak lineleading linebreakstyle linebreakmultchar indentalign indentshift indenttarget indentalignfirst ' +
    'indentshiftfirst indentalignlast indentshiftlast depth lquote rquote linethickness numalign denomalign bevelled voffset ' +
    'open close separators notation subscriptshift superscriptshift accentunder align rowalign columnalign groupalign ' +
    'alignmentscope columnwidth rowspacing columnspacing rowlines columnlines frame framespacing equalrows equalcolumns side ' +
    'minlabelspacing rowspan columnspan edge stackalign charalign charspacing longdivstyle position shift location crossout ' +
    'length leftoverhang rightoverhang mslinethickness selection';
  var THUOC_TINH = {
    a: 'href target name', area: 'alt coords href shape target', blockquote: 'cite', col: 'span width', colgroup: 'span width',
    img: 'align alt height src usemap width longdesc',
    iframe: 'src width height name align frameborder scrolling allow sandbox loading allowfullscreen webkitallowfullscreen mozallowfullscreen',
    ol: 'start type', q: 'cite', table: 'summary width border cellpadding cellspacing center frame rules', tr: 'align valign dir',
    td: 'abbr axis colspan rowspan width align valign dir', th: 'abbr axis colspan rowspan width align valign dir scope',
    ul: 'type', param: 'name value', object: 'width height style data type classid codebase',
    source: 'media width height sizes src srcset type',
    embed: 'name src type allowfullscreen pluginspage wmode allowscriptaccess width height',
    video: 'name src allowfullscreen allow muted poster width height controls playsinline',
    track: 'default kind label src srclang',
    audio: 'name src allowfullscreen allow muted poster width height controls playsinline',
    font: 'face color size', map: 'name',
    annotation: 'href xref intent arg definitionURL encoding cd name src',
    'annotation-xml': 'href xref intent arg definitionURL encoding cd name src',
    maction: M0 + 'actiontype selection', maligngroup: M0 + 'groupalign', malignmark: M0 + 'edge',
    math: MSTYLE + ' display maxwidth overflow altimg altimg-width altimg-height altimg-valign alttext cdgroup xmlns',
    menclose: M0 + 'notation', merror: M0, mfenced: M0 + 'open close separators',
    mfrac: M0 + 'linethickness numalign denomalign bevelled', mglyph: M0 + 'src alt width height valign',
    mi: M0 + 'mathvariant mathsize', mlabeledtr: M0,
    mlongdiv: M0 + 'longdivstyle align stackalign charalign charspacing',
    mmultiscripts: M0 + 'subscriptshift superscriptshift', mn: M0 + 'mathvariant mathsize',
    mo: M0 + 'mathvariant mathsize form fence separator lspace rspace stretchy symmetric maxsize minsize largeop ' +
      'movablelimits accent linebreak lineleading linebreakstyle linebreakmultchar indentalign indentshift indenttarget ' +
      'indentalignfirst indentshiftfirst indentalignlast indentshiftlast',
    mover: M0 + 'accent align', mpadded: M0 + 'height depth width lspace voffset', mphantom: M0, mprescripts: M0,
    mroot: M0, mrow: M0, ms: M0 + 'mathvariant mathsize lquote rquote',
    mscarries: M0 + 'position location crossout scriptsizemultiplier', mscarry: M0 + 'location crossout',
    msgroup: M0 + 'position shift', msline: M0 + 'position length leftoverhang rightoverhang mslinethickness',
    mspace: M0 + 'mathvariant mathsize',   // KHÔNG có width (#L498)
    msqrt: M0, msrow: M0 + 'position', mstack: M0 + 'align stackalign charalign charspacing', mstyle: MSTYLE,
    msub: M0 + 'subscriptshift', msubsup: M0 + 'subscriptshift superscriptshift', msup: M0 + 'superscriptshift',
    mtable: M0 + 'align rowalign columnalign groupalign alignmentscope columnwidth width rowspacing columnspacing rowlines ' +
      'columnlines frame framespacing equalrows equalcolumns displaystyle side minlabelspacing',
    mtd: M0 + 'rowspan columnspan rowalign columnalign groupalign',
    mtext: M0 + 'mathvariant mathsize width height depth linebreak',
    mtr: M0 + 'rowalign columnalign groupalign', munder: M0 + 'accentunder align',
    munderover: M0 + 'accent accentunder align', none: M0, semantics: 'href xref intent arg definitionURL encoding'
  };
  Object.keys(THUOC_TINH).forEach(function (k) { THUOC_TINH[k] = tapHop(THUOC_TINH[k].toLowerCase()); });

  // CSS được giữ (canvas_sanitize.rb#L668-L750); thuộc tính khác bị xoá (font-weight, opacity, transform…)
  var CSS_OK = (function () {
    var s = ('align-content align-items align-self background border border-radius clear clip color column-gap cursor direction ' +
      'display flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float font gap grid height ' +
      'justify-content justify-items justify-self left line-height list-style margin max-height max-width min-height ' +
      'min-width order overflow overflow-x overflow-y padding position place-content place-items place-self right row-gap ' +
      'text-align table-layout text-decoration text-indent top user-select vertical-align visibility white-space width ' +
      'z-index zoom').split(' ');
    function ghep(tien, ds) { ds.split(' ').forEach(function (x) { s.push(tien + x); }); }
    ghep('grid-', 'area auto-columns auto-flow auto-rows column gap row template');
    ghep('grid-template-', 'areas columns rows'); ghep('grid-column-', 'end gap start'); ghep('grid-row-', 'end gap start');
    ghep('background-', 'attachment color image position repeat'); ghep('background-position-', 'x y');
    ghep('border-', 'bottom collapse color left right spacing style top width');
    'bottom left right top'.split(' ').forEach(function (b) { ghep('border-' + b + '-', 'color style width'); });
    ghep('font-', 'family size stretch style variant width'); ghep('list-style-', 'image position type');
    ghep('margin-', 'bottom left right top offset'); ghep('padding-', 'bottom left right top');
    return tapHop(s.join(' '));
  })();

  var GIOI_HAN_STEM = 16384;  // C:app/models/importers/assessment_question_importer.rb#L201-L205 (16.kilobytes)
  var NGUONG_STEM = 15000;    // R§4, D§5.3: cảnh báo sớm
  var RE_TEN_ANH = /^images\/[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)$/;   // R§3
  var RE_BANK_ID = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;                        // R§2.0
  var RE_HREF_AN_TOAN = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

  /* ===================== tiện ích ===================== */

  function tapHop(s) { var o = Object.create(null); s.split(/\s+/).forEach(function (x) { if (x) o[x] = true; }); return o; }
  function co(set, k) { return Object.prototype.hasOwnProperty.call(set, k) && !!set[k]; }
  function ln(name) { var i = name.lastIndexOf(':'); return (i >= 0 ? name.slice(i + 1) : name); } // tên cục bộ (Python bỏ namespace)
  function laEl(n) { return n && n.type === 'el'; }
  function con(el, ten) {
    if (!el || !el.children) return [];
    return el.children.filter(function (n) { return laEl(n) && (ten == null || ln(n.name) === ten || (Array.isArray(ten) && ten.indexOf(ln(n.name)) >= 0)); });
  }
  function hauDue(el, ten, out) {
    out = out || [];
    if (!el || !el.children) return out;
    for (var i = 0; i < el.children.length; i++) {
      var n = el.children[i];
      if (!laEl(n)) continue;
      if (ten == null || ln(n.name) === ten || (Array.isArray(ten) && ten.indexOf(ln(n.name)) >= 0)) out.push(n);
      hauDue(n, ten, out);
    }
    return out;
  }
  function dau(el, ten) { return hauDue(el, ten)[0] || null; }
  function chu(n) {
    if (!n) return '';
    if (n.type === 'text') return n.text;
    var s = '';
    for (var i = 0; i < (n.children || []).length; i++) s += chu(n.children[i]);
    return s;
  }
  function tt(el, k) { return el && el.attrs && Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : undefined; }
  function soDiemMa(s) { return Array.from(String(s)).length; }   // Ruby String#length đếm ký tự, không đếm UTF-16
  function rutGon(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); n = n || 60; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function bytes(v) {
    if (v instanceof Uint8Array) return v;
    if (typeof v === 'string') return new TextEncoder().encode(v);
    if (v && v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength);
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    return new Uint8Array(0);
  }
  var giaiMaChat = (function () { try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }); } catch (e) { return null; } })();   // giữ BOM để còn báo

  // Python CheckNMTOKEN + ReadIdentifier (Q:imsqtiv1.py#L162-L194; NMTOKEN_CHARS ở Q:lib/xmlutils.py#L33-L34)
  function pyNmtoken(tok, tienTo) {
    tok = String(tok).trim();
    var out = '';
    for (var c of tok) {
      var ch = c;
      if (!/[A-Za-z0-9_.:-]/.test(c) && c.codePointAt(0) < 128) ch = '-';
      if (!out && !/[A-Za-z_]/.test(ch)) out = tienTo;
      out += ch;
    }
    return out;
  }
  function pyIdent(v, tienTo) { return pyNmtoken(v, tienTo || 'RESPONSE_').replace(/:/g, '_').replace(/\./g, '_'); }
  // Ident item sau Python: ':'→'-' (Q:imsqtiv1.py#L1976-L1981) rồi CPResource.FixIdentifier (Q:lib/imscp.py#L161-L172)
  function pyItemIdent(v) {
    v = String(v).split(':').join('-');
    var out = '';
    for (var c of v) {
      var ch = /[A-Za-z0-9_.:-]/.test(c) ? c : '_';
      if (!out && !/[A-Za-z_]/.test(ch)) out = 'ID_';
      out += ch;
    }
    return out;
  }
  function rubyToF(s) { var m = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?/.exec(String(s)); return m ? parseFloat(m[0]) : 0; }
  function rubyToI(s) { var m = /^\s*[-+]?\d+/.exec(String(s)); return m ? parseInt(m[0], 10) : 0; }
  var RE_SO = /^[-+]?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/;

  // Thực thể HTML hay gặp — chỉ để hiển thị tóm tắt
  var TT_HTML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', minus: '\u2212', times: '\u00D7', divide: '\u00F7', le: '\u2264', ge: '\u2265', ne: '\u2260', hellip: '\u2026', ndash: '\u2013', mdash: '\u2014' };
  function giaiTTHtml(s) {
    return String(s).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, function (m, e) {
      if (e[0] === '#') { var cp = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(cp); } catch (x) { return m; } }
      return Object.prototype.hasOwnProperty.call(TT_HTML, e) ? TT_HTML[e] : m;
    });
  }
  function chuThuan(html) { return giaiTTHtml(String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?[A-Za-z][^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
  // Ruby HtmlHelper#clear_html (C:…/qti/html_helper.rb#L74-L80) — dùng cho luật true/false
  function rubyClearHtml(s) {
    return String(s).replace(/<\/?[^>\n]*>/g, '').replace(/&#\d+;/g, function (m) { try { return String.fromCodePoint(parseInt(m.slice(2), 10)); } catch (e) { return ''; } })
      .replace(/&\w+;/g, '');
  }
  // Thẻ HTML thật trong ô text thuần = lỗi của bộ sinh. "a<b", "x < y" là chữ hợp lệ: Canvas hiện ô text thuần bằng
  // CGI.escapeHTML (quiz_question_builder.rb#L170-L175) và so đáp án ngắn sau escapeHTML hai phía (short_answer_question.rb#L36-L47)
  var RE_CO_THE = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s*\/?>|\s+[A-Za-z_:][-A-Za-z0-9_:.]*\s*=)|<!--/;

  /* ===================== kiểm tra XML nghiêm ngặt ===================== */
  // lxml chạy với recover=True (Q:imsqtiv1.py#L6302): XML hỏng bị "sửa" im lặng → mất nội dung. Mọi lỗi cú pháp = lỗi.

  var RE_KY_TU_CAM = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  function kyTuHopLe(cp) {
    return cp === 9 || cp === 10 || cp === 13 || (cp >= 0x20 && cp <= 0xD7FF) || (cp >= 0xE000 && cp <= 0xFFFD) || (cp >= 0x10000 && cp <= 0x10FFFF);
  }
  function soDong(s, i) { var n = 1; for (var k = 0; k < i && k < s.length; k++) if (s.charCodeAt(k) === 10) n++; return n; }

  // Trả { loi: [{code,msg}], canhBao: [...], cay, cdata: số đoạn CDATA }
  function kiemXml(s) {
    var loi = [], canhBao = [], cdata = 0;
    function L(code, msg, i) { if (loi.length < 20) loi.push({ code: code, msg: msg + (i != null ? ' (dòng ' + soDong(s, i) + ')' : '') }); }
    if (s.charCodeAt(0) === 0xFEFF) { canhBao.push({ code: 'xml-bom', msg: 'File có BOM UTF-8 (R§2.0: không ghi BOM)' }); s = s.slice(1); }
    var mKt = RE_KY_TU_CAM.exec(s);
    if (mKt) { var vt = mKt.index + (mKt[1] ? mKt[1].length : 0); L('xml-illegal-char', 'Ký tự cấm trong XML 1.0 U+' + s.charCodeAt(vt).toString(16).toUpperCase().padStart(4, '0') + ' — lxml recover cắt nội dung (Q:imsqtiv1.py#L6302)', vt); }
    if (!/^<\?xml\s/.test(s)) canhBao.push({ code: 'xml-no-decl', msg: 'Thiếu khai báo <?xml version="1.0" encoding="UTF-8"?> ở đầu file (R§2.0)' });
    var doc = { type: 'el', name: '#doc', attrs: {}, children: [] }, ngan = [doc], goc = 0;
    var n = s.length, i = 0;
    function themChu(t) {
      var cur = ngan[ngan.length - 1];
      if (ngan.length === 1) { if (/\S/.test(t)) L('xml-malformed', 'Có chữ nằm ngoài phần tử gốc', i); return; }
      var ch = cur.children, last = ch[ch.length - 1];
      if (last && last.type === 'text') last.text += t; else ch.push({ type: 'text', text: t });
    }
    function giaiChu(t, viTri) {
      return t.replace(/&([^;\s&<]*);?/g, function (m, e) {
        if (m[m.length - 1] !== ';') { L('xml-malformed', 'Ký tự & không thuộc thực thể (phải viết &amp;)', viTri); return m; }
        if (e === 'amp') return '&'; if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
        var mm = /^#x([0-9a-fA-F]+)$/.exec(e) || /^#([0-9]+)$/.exec(e);
        if (mm) {
          var cp = parseInt(mm[1], e[1] === 'x' ? 16 : 10);
          if (!kyTuHopLe(cp)) { L('xml-illegal-char', 'Tham chiếu ký tự cấm &' + e + '; (Q:imsqtiv1.py#L6302)', viTri); return ''; }
          return String.fromCodePoint(cp);
        }
        L('xml-undefined-entity', 'Thực thể &' + e + '; không được định nghĩa trong XML (lxml bỏ đi) — thực thể HTML phải được thoát thành &amp;' + e + ';', viTri);
        return '';
      });
    }
    var RE_TEN = /^[A-Za-z_:\u00C0-\uFFFF][-A-Za-z0-9_:.\u00B7\u00C0-\uFFFF]*/;
    while (i < n) {
      var lt = s.indexOf('<', i);
      if (lt === -1) lt = n;
      if (lt > i) {
        var doan = s.slice(i, lt);
        if (doan.indexOf(']]>') >= 0) L('xml-malformed', 'Chuỗi "]]>" trong văn bản', i);
        themChu(giaiChu(doan, i));
      }
      if (lt >= n) break;
      i = lt;
      if (s.startsWith('<!--', i)) {
        var e1 = s.indexOf('-->', i + 4);
        if (e1 < 0) { L('xml-malformed', 'Chú thích <!-- không đóng', i); break; }
        i = e1 + 3; continue;
      }
      if (s.startsWith('<![CDATA[', i)) {
        var e2 = s.indexOf(']]>', i + 9);
        if (e2 < 0) { L('xml-malformed', 'CDATA không đóng', i); break; }
        if (ngan.length === 1) L('xml-malformed', 'CDATA ngoài phần tử gốc', i);
        else { cdata++; themChu(s.slice(i + 9, e2)); }
        i = e2 + 3; continue;
      }
      if (s.startsWith('<?', i)) {
        var e3 = s.indexOf('?>', i + 2);
        if (e3 < 0) { L('xml-malformed', 'Chỉ thị <? không đóng', i); break; }
        var pi = s.slice(i + 2, e3);
        if (/^xml\s/.test(pi)) {
          if (i !== 0) L('xml-malformed', 'Khai báo <?xml?> không nằm ở đầu file', i);
          var enc = /encoding\s*=\s*["']([^"']+)["']/.exec(pi);
          if (enc && !/^utf-?8$/i.test(enc[1])) L('xml-encoding', 'encoding="' + enc[1] + '" — phải là UTF-8', i);
        }
        i = e3 + 2; continue;
      }
      if (s.startsWith('<!', i)) { // DOCTYPE
        var j = i + 2, sau = 0;
        for (; j < n; j++) { var cj = s[j]; if (cj === '[') sau++; else if (cj === ']') sau--; else if (cj === '>' && sau <= 0) break; }
        if (ngan.length > 1 || goc) L('xml-malformed', 'Khai báo <! đặt sai chỗ', i);
        i = j + 1; continue;
      }
      if (s[i + 1] === '/') {
        var gt = s.indexOf('>', i + 2);
        if (gt < 0) { L('xml-malformed', 'Thẻ đóng không có ">"', i); break; }
        var ten = s.slice(i + 2, gt).trim();
        var cur = ngan[ngan.length - 1];
        if (ngan.length === 1) L('xml-malformed', 'Thẻ đóng </' + ten + '> thừa', i);
        else if (cur.name !== ten) {
          L('xml-malformed', 'Thẻ đóng </' + ten + '> không khớp <' + cur.name + '>', i);
          for (var k = ngan.length - 1; k > 0; k--) if (ngan[k].name === ten) { ngan.length = k; break; }
        } else ngan.pop();
        i = gt + 1; continue;
      }
      // thẻ mở
      var mTen = RE_TEN.exec(s.slice(i + 1, i + 200));
      if (!mTen) { L('xml-malformed', 'Ký tự "<" lẻ (phải viết &lt;)', i); themChu('<'); i++; continue; }
      var p = i + 1 + mTen[0].length, attrs = {}, tuDong = false, xong = false;
      while (p < n) {
        var c = s[p];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { p++; continue; }
        if (c === '>') { p++; xong = true; break; }
        if (c === '/' && s[p + 1] === '>') { p += 2; tuDong = true; xong = true; break; }
        var mA = RE_TEN.exec(s.slice(p, p + 200));
        if (!mA) { L('xml-malformed', 'Thuộc tính hỏng trong <' + mTen[0] + '>', p); p++; continue; }
        var an = mA[0]; p += an.length;
        while (/\s/.test(s[p] || '')) p++;
        if (s[p] !== '=') { L('xml-malformed', 'Thuộc tính ' + an + ' thiếu giá trị', p); continue; }
        p++;
        while (/\s/.test(s[p] || '')) p++;
        var q = s[p];
        if (q !== '"' && q !== "'") { L('xml-malformed', 'Giá trị thuộc tính ' + an + ' không có ngoặc kép', p); var e5 = p; while (e5 < n && !/[\s>]/.test(s[e5])) e5++; p = e5; continue; }
        var e4 = s.indexOf(q, p + 1);
        if (e4 < 0) { L('xml-malformed', 'Giá trị thuộc tính ' + an + ' không đóng ngoặc', p); p = n; break; }
        var raw = s.slice(p + 1, e4);
        if (raw.indexOf('<') >= 0) L('xml-malformed', 'Ký tự "<" trong giá trị thuộc tính ' + an, p);
        if (Object.prototype.hasOwnProperty.call(attrs, an)) L('xml-malformed', 'Thuộc tính ' + an + ' bị lặp', p);
        attrs[an] = giaiChu(raw.replace(/[\t\n\r]/g, ' '), p);
        p = e4 + 1;
      }
      if (!xong) { L('xml-malformed', 'Thẻ <' + mTen[0] + '> không đóng ">"', i); break; }
      var el = { type: 'el', name: mTen[0], attrs: attrs, children: [] };
      if (ngan.length === 1) { if (goc) L('xml-malformed', 'Có nhiều hơn một phần tử gốc', i); goc++; }
      ngan[ngan.length - 1].children.push(el);
      if (!tuDong) ngan.push(el);
      i = p;
    }
    if (ngan.length > 1) L('xml-malformed', 'Thiếu thẻ đóng cho <' + ngan.slice(1).map(function (x) { return x.name; }).join('>, <') + '>');
    if (!goc) L('xml-malformed', 'Không có phần tử gốc');
    var cay = con(doc)[0] || null;
    return { loi: loi, canhBao: canhBao, cay: cay, cdata: cdata };
  }

  /* ===================== kiểm tra HTML trong mattext ===================== */

  var RONG_HTML = tapHop('br hr img col area embed param source track wbr input meta link base');
  var DIEM_TICH_HOP = tapHop('mtext mi mo mn ms annotation-xml');   // điểm HTML được phép trong MathML (HTML5)

  // Ảnh công thức Canvas (R§4): <img class="equation_image" src="/equation_images/<LaTeX mã hoá 2 lần>?scale=1">.
  // canvas_link_migrator bỏ qua img.equation_image (CLM link_parser.rb#L276-L279); HtmlHelper#find_best_path_match
  // không có file nào đuôi "/equation_images/…" nên giữ nguyên src → KHÔNG phải file trong gói.
  function kiemImg(t, out, B) {
    var src = String(t.src).trim();
    if (!/^\/equation_images\//.test(src)) { out.imgs.push(t.src); return; }
    if (!/(^|\s)equation_image(\s|$)/.test(t['class'] || '')) {
      B('error', 'equation-image-class', '<img src="/equation_images/…"> thiếu class="equation_image" — link migrator coi là đường dẫn file (R§4)');
      return;
    }
    var duong = src.slice('/equation_images/'.length).replace(/\?.*$/, ''), tex = null;
    try { tex = decodeURIComponent(decodeURIComponent(duong)); } catch (e) { tex = null; }
    if (tex == null || !tex.trim()) { B('error', 'equation-image-encoding', 'src ảnh công thức không giải mã được 2 lần (R§4: encodeURIComponent 2 lần)'); return; }
    if (t['data-equation-content'] != null && t['data-equation-content'] !== tex) {
      B('warn', 'equation-image-encoding', 'LaTeX trong src (giải mã 2 lần) khác data-equation-content — front-end Canvas giải mã đường dẫn 2 lần (R§4)');
    }
    out.eqImgs.push(tex);
  }

  // Trả { imgs: [src], eqImgs: [latex], loi: [{code,msg,level}], plain, coThe }
  function kiemHtml(html) {
    var out = { imgs: [], eqImgs: [], ds: [], plain: chuThuan(html), coThe: RE_CO_THE.test(html) };
    function B(level, code, msg) { out.ds.push({ level: level, code: code, msg: msg }); }
    var ngan = [];   // tên phần tử đang mở
    var re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!(?!--)[^>]*>|<\/\s*([A-Za-z][A-Za-z0-9:-]*)\s*>|<([A-Za-z][A-Za-z0-9:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
    var m, cssLa = {}, attrLa = {};
    while ((m = re.exec(html))) {
      if (m[1]) { // thẻ đóng
        var tenD = m[1].toLowerCase(), k = ngan.lastIndexOf(tenD);
        if (k >= 0) ngan.length = k;
        continue;
      }
      if (!m[2]) continue;
      var ten = m[2].toLowerCase(), trongMath = ngan.indexOf('math') >= 0 || ten === 'math';
      var cha = ngan[ngan.length - 1] || '';
      var laMath = false;
      if (trongMath) {
        if (co(MATH_PT, ten)) laMath = true;
        else if (!(co(HTML_PT, ten) && co(DIEM_TICH_HOP, cha))) B('error', 'mathml-element', co(HTML_PT, ten)
          ? 'Thẻ HTML <' + ten + '> nằm trong MathML (ngoài mtext/mi/mo/mn/ms) → trình phân tích HTML5 thoát khỏi <math>, công thức vỡ'
          : 'Phần tử MathML <' + ten + '> không có trong allowlist Canvas → bị xoá (canvas_sanitize.rb#L142-L187)');
      } else if (co(MATH_PT, ten)) {
        B('error', 'mathml-element', 'Phần tử MathML <' + ten + '> nằm ngoài <math>');
      } else if (!co(HTML_PT, ten)) {
        if (co(HTML_CAM, ten)) B('error', 'html-element', 'Phần tử <' + ten + '> phải được bộ làm sạch bỏ đi (D§7) — Canvas xoá nó');
        else B('warn', 'html-element', 'Phần tử <' + ten + '> không có trong allowlist Canvas → bị xoá (canvas_sanitize.rb#L57-L190)');
      }
      // thuộc tính
      var ra = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g, a;
      var dsTT = m[3] || '', ttImg = {};
      while ((a = ra.exec(dsTT))) {
        var an = a[1].toLowerCase(), av = giaiTTHtml(a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : '');
        if (/^\s*data:/i.test(av) || (an === 'style' && /url\(\s*['"]?\s*data:/i.test(av))) B('error', 'html-data-uri', 'URI data: trong ' + an + ' của <' + ten + '> — Canvas chỉ giữ http/https/tương đối (canvas_sanitize.rb#L49, #L662)');
        if (/^on/.test(an)) { B('error', 'html-attr-event', 'Thuộc tính sự kiện ' + an + ' trên <' + ten + '> (D§7: phải bỏ)'); continue; }
        var duoc = co(THUOC_TINH_CHUNG, an) || /^data-/.test(an) || (THUOC_TINH[ten] && co(THUOC_TINH[ten], an));
        if (!duoc) {
          if (laMath && ten === 'mspace' && an === 'width') B('error', 'mathml-mspace-width', '<mspace width> không được Canvas giữ (canvas_sanitize.rb#L498) — đổi thành <mtext>&#x2009;</mtext> (R§4)');
          else if (laMath) B('error', 'mathml-attr', 'Thuộc tính ' + an + ' của <' + ten + '> không có trong allowlist MathML (canvas_sanitize.rb#L294-L590)');
          else if (!attrLa[ten + '@' + an]) { attrLa[ten + '@' + an] = 1; B('warn', 'html-attr', 'Thuộc tính ' + an + ' của <' + ten + '> bị Canvas xoá'); }
        }
        if (an === 'style') {
          av.split(';').forEach(function (kv) {
            var i2 = kv.indexOf(':'); if (i2 < 0) return;
            var p = kv.slice(0, i2).trim().toLowerCase(), v = kv.slice(i2 + 1);
            if (!p) return;
            if (!co(CSS_OK, p) && !cssLa[p]) { cssLa[p] = 1; B('warn', 'css-property', 'CSS "' + p + '" không có trong allowlist → bị xoá (canvas_sanitize.rb#L668-L750)'); }
            if (/var\(\s*--/.test(v) && !cssLa['var()']) { cssLa['var()'] = 1; B('warn', 'css-var', 'CSS dùng var(--…) — chưa chắc Canvas giữ (R§7), nên thay bằng giá trị cụ thể'); }
          });
        }
        if (ten === 'img') ttImg[an] = av;
        if (ten === 'math' && an === 'xmlns' && av !== 'http://www.w3.org/1998/Math/MathML') B('warn', 'math-xmlns', '<math xmlns="' + av + '"> — phải là http://www.w3.org/1998/Math/MathML');
      }
      if (ten === 'img' && !/(^|\s)src\s*=/i.test(dsTT)) B('error', 'img-src-missing', '<img> không có src');
      if (ten === 'img' && ttImg.src != null) kiemImg(ttImg, out, B);
      if (!m[4] && !co(RONG_HTML, ten)) ngan.push(ten);
    }
    return out;
  }

  /* ===================== mô hình item sau bước Python ===================== */

  // Đọc mattext: { texttype (null = không ghi), text, rawChild, uri }
  function docMattext(mt) {
    return {
      el: mt,
      texttype: tt(mt, 'texttype') != null ? tt(mt, 'texttype') : null,
      text: chu(mt),
      rawChild: con(mt).length > 0,
      uri: tt(mt, 'uri')
    };
  }
  function laHtml(m) { return m.texttype == null || m.texttype === 'text/html'; } // Q:imsqtiv1.py#L4033-L4034

  function phanTichItem(itemEl) {
    var it = { el: itemEl, meta: {}, metaDup: [], metaLa: [], stem: [], responses: [], respByPy: {}, conds: [], feedbacks: [], decvars: [], order: [] };
    con(itemEl).forEach(function (c) { it.order.push(ln(c.name)); });
    // metadata: fieldlabel viết thường, bỏ tiền tố qmd_ (Q:imsqtiv1.py#L3303-L3315, MDFieldMap #L3241-L3290)
    hauDue(itemEl, ['itemmetadata']).forEach(function (im) {
      hauDue(im, ['qtimetadatafield', 'qti_metadatafield']).forEach(function (f) {
        var nhan = chu(dau(f, 'fieldlabel')).trim().toLowerCase();
        if (nhan.slice(0, 4) === 'qmd_') nhan = nhan.slice(4);
        var gt = chu(dau(f, 'fieldentry')).trim();
        var khoa = { 'question_type': 'qtype', itemtype: 'qtype', 'item type': 'qtype', 'question type': 'qtype', questiontype: 'qtype',
          points_possible: 'points', weighting: 'points', cc_weighting: 'points', original_answer_ids: 'oaid' }[nhan] || nhan;
        if (!co(NHAN_META, nhan)) it.metaLa.push(nhan);
        if (it.meta[khoa] != null) it.metaDup.push(khoa);
        it.meta[khoa] = gt;
      });
      hauDue(im, 'qmd_itemtype').forEach(function (x) { it.meta.qtype = chu(x).trim(); });
    });
    var pres = con(itemEl, 'presentation')[0];
    it.presentation = pres || null;
    function duyet(el) {   // đi theo thứ tự tài liệu trong presentation / flow
      con(el).forEach(function (c) {
        var t = ln(c.name);
        if (t === 'material') con(c, ['mattext', 'matemtext']).forEach(function (mt) { it.stem.push(docMattext(mt)); });
        else if (t === 'flow') duyet(c);
        else if (RESP.indexOf(t) >= 0) it.responses.push(docResponse(c));
      });
    }
    if (pres) duyet(pres);
    it.responses.forEach(function (r) { if (r.py && !it.respByPy[r.py]) it.respByPy[r.py] = r; });
    // outcomes: decvar mặc định vartype Integer (Q:imsqtiv1.py#L5300-L5335); chưa khai báo → float (#L2179-L2190)
    it.outcomes = {};
    var rps = con(itemEl, 'resprocessing');
    it.rpCount = rps.length;
    rps.forEach(function (rp) {
      hauDue(rp, 'decvar').forEach(function (d) {
        var vt = String(tt(d, 'vartype') || 'Integer').toLowerCase();
        var bt = vt === 'decimal' || vt === 'scientific' ? 'float' : (vt === 'integer' || vt === 'string' || vt === 'boolean') ? vt : 'identifier';
        var id = pyIdent(tt(d, 'varname') || 'SCORE', 'OUTCOME_').toUpperCase();
        it.decvars.push({ id: id, bt: bt, el: d });
        it.outcomes[id] = bt;
      });
      con(rp, 'respcondition').forEach(function (rc) { it.conds.push(docRespcondition(rc, it)); });
    });
    con(itemEl, 'itemfeedback').forEach(function (fb) {
      var mts = hauDue(fb, ['mattext', 'matemtext']).map(docMattext);
      it.feedbacks.push({ el: fb, ident: tt(fb, 'ident'), mattexts: mts });
    });
    return it;
  }

  function docResponse(el) {
    var tag = ln(el.name);
    var r = { el: el, tag: tag, identRaw: tt(el, 'ident'), card: String(tt(el, 'rcardinality') || 'single').toLowerCase(),
      hasCard: tt(el, 'rcardinality') != null, prompt: [], render: null, labels: [], fibMaterial: false };
    r.py = r.identRaw != null ? pyIdent(r.identRaw.replace(/_(?:ans|str)$/i, '')) : 'no_id';   // D2L_IDENTIFIER_REPLACER #L120
    r.bt = tag === 'response_lid' ? 'identifier' : tag === 'response_str' ? 'string' : tag === 'response_grp' ? 'pair' : tag === 'response_xy' ? 'point' : 'integer';
    if (tag === 'response_num' && /^(decimal|scientific)$/i.test(tt(el, 'numtype') || '')) r.bt = 'float';
    con(el).forEach(function (c) {
      var t = ln(c.name);
      if (t === 'material' && !r.render) con(c, ['mattext', 'matemtext']).forEach(function (mt) { r.prompt.push(docMattext(mt)); });
      else if (RENDER.indexOf(t) >= 0 && !r.render) {
        r.render = { tag: t, el: c, fibtype: tt(c, 'fibtype') };
        if (t === 'render_fib' && con(c, 'material').length && hauDue(c, 'response_label').length) r.fibMaterial = true;
        hauDue(c, 'response_label').forEach(function (lb) {
          var mts = hauDue(lb, ['mattext', 'matemtext']).map(docMattext);
          var pcdata = lb.children.filter(function (x) { return x.type === 'text'; }).map(function (x) { return x.text; }).join('').trim();
          var raw = mts.map(function (x) { return x.text; }).join('') || pcdata;
          var html = mts.some(laHtml);
          // text Ruby: div.text → choice.text.strip; div.html → clear_html(...).strip.gsub(/\s+/,' ') (choice_interaction.rb#L122-L126)
          var textRuby = html ? rubyClearHtml(raw).trim().replace(/\s+/g, ' ') : raw.trim();
          r.labels.push({ el: lb, identRaw: tt(lb, 'ident'), py: tt(lb, 'ident') != null ? pyIdent(String(tt(lb, 'ident')).replace(/_(?:ans|str)$/i, '')) : null,
            mattexts: mts, raw: raw, isHtml: html, textRuby: textRuby, textStrip: raw.trim(), plain: html ? chuThuan(raw) : raw.trim() });
        });
      }
    });
    return r;
  }

  // respcondition → { cont, expr (cây QTI 2 do Python dựng), rules (setvar), fb (displayfeedback) }
  function docRespcondition(rc, it) {
    var cv = con(rc, 'conditionvar')[0];
    var cont = String(tt(rc, 'continue') || 'No').toLowerCase() === 'yes';   // ReadYesNo, mặc định No (#L5420-L5426)
    var exprs = cv ? con(cv).map(function (x) { return bieuThuc(x, it); }) : [];
    var expr = exprs.length > 1 ? { op: 'and', kids: exprs, ngam: true } : exprs.length ? exprs[0] : { op: 'null' };
    var rules = con(rc, 'setvar').map(function (sv) {
      var id = pyIdent(tt(sv, 'varname') || 'SCORE', 'OUTCOME_').toUpperCase();   // --ucvars (C:…/qti.rb#L127-L133)
      var act = String(tt(sv, 'action') || 'Set').toLowerCase();
      var op = { set: 'set', add: 'sum', subtract: 'subtract', multiply: 'product', divide: 'divide' }[act] || 'loi';
      return { id: id, act: act, op: op, value: chu(sv), bt: it.outcomes[id] || 'float', el: sv };
    });
    var fb = con(rc, 'displayfeedback').map(function (d) { return tt(d, 'linkrefid'); });
    return { el: rc, cv: cv, cont: cont, expr: expr, rules: rules, fb: fb };
  }

  // Dựng biểu thức QTI 2 như Python (Q:imsqtiv1.py#L5572-L5900)
  function bieuThuc(el, it) {
    var t = ln(el.name), kids;
    if (t === 'and' || t === 'or') return { op: t, kids: con(el).map(function (x) { return bieuThuc(x, it); }), el: el };
    if (t === 'not') {
      kids = con(el).map(function (x) { return bieuThuc(x, it); });
      if (!kids.length) return { op: 'null', el: el };
      return { op: 'not', kids: [kids.length > 1 ? { op: 'and', kids: kids } : kids[0]], el: el };
    }
    if (t === 'other') return { op: 'baseValue', vtype: 'boolean', value: 'true', el: el };
    if (t === 'unanswered') return { op: 'isNull', el: el };
    if (/^var(equal|lt|lte|gt|gte)$/.test(t)) {
      var rid = tt(el, 'respident');
      var py = rid != null ? pyIdent(String(rid).replace(/_(?:ans|str)$/i, '')) : null;
      var r = py != null ? it.respByPy[py] : null;
      var raw = chu(el);
      if (!r) return { op: 'null', undeclared: true, respident: rid, tag: t, raw: raw, el: el };
      var v = r.bt === 'identifier' ? pyNmtoken(raw, 'RESPONSE_') : raw;    // MakeSingleValue #L5775-L5786
      var base = { varId: r.py, value: v, raw: raw, vtype: r.bt, tag: t, resp: r, el: el };
      if (t === 'varequal') {
        if (r.card === 'single') {
          if (r.bt === 'identifier' || r.bt === 'pair' || r.bt === 'integer') base.op = 'match';
          else if (r.bt === 'string') base.op = 'stringMatch';
          else if (r.bt === 'float') base.op = 'equal';
          else base.op = 'null';
        } else base.op = (r.bt === 'identifier' || r.bt === 'pair' || r.bt === 'string' || r.bt === 'float') ? 'member' : 'null';
        return base;
      }
      if (r.card !== 'single') { base.op = 'null'; return base; }
      if (r.bt === 'integer' || r.bt === 'float') base.op = { varlt: 'lt', varlte: 'lte', vargt: 'gt', vargte: 'gte' }[t];
      else if (r.bt === 'string') { base.op = 'customOperator'; base.cls = t; }
      else base.op = 'null';
      return base;
    }
    return { op: 'khac', tag: t, el: el };
  }

  // Dựng cây responseCondition như ResProcessing.AddRespCondition (Q:imsqtiv1.py#L5240-L5268)
  function dungRP(it) {
    var goc = { kids: [] }, diem = goc, che = true;
    it.conds.forEach(function (c, idx) {
      var nut = { expr: c.expr, rules: c.rules, src: c, idx: idx };
      if (c.cont) {
        if (!che) { if (!diem.els) diem.els = { kids: [] }; diem = diem.els; }
        nut.kind = 'if';
        diem.kids.push({ ifs: [nut], els: null });
      } else if (che) {
        nut.kind = 'if';
        var cnd = { ifs: [nut], els: null };
        diem.kids.push(cnd); diem = cnd;
      } else { nut.kind = 'elseif'; diem.ifs.push(nut); }
      che = c.cont;
    });
    return goc;
  }
  function ifsCua(cnd) { var out = cnd.ifs.slice(); if (cnd.els) cnd.els.kids.forEach(function (k) { out = out.concat(ifsCua(k)); }); return out; }
  function moiCond(goc) { var out = []; (function di(h) { h.kids.forEach(function (c) { out.push(c); if (c.els) di(c.els); }); })(goc); return out; }
  function moiIf(goc) { var out = []; goc.kids.forEach(function (c) { out = out.concat(ifsCua(c)); }); return out; }
  function duyetExpr(e, f) { if (!e) return; f(e); (e.kids || []).forEach(function (k) { duyetExpr(k, f); }); }
  function dauOp(e, pred) { var kq = null; duyetExpr(e, function (x) { if (!kq && pred(x)) kq = x; }); return kq; }

  // get_response_weight (C:…/qti/choice_interaction.rb#L251-L286): 100 nếu SCORE được đặt/cộng một số > 0
  function trongSo(rules) {
    var r = rules.filter(function (x) { return x.id === 'SCORE' && x.op === 'sum'; })[0] ||
      rules.filter(function (x) { return x.id === 'SCORE' && x.op === 'set'; })[0] ||
      rules.filter(function (x) { return x.id.indexOf('SCORE') === 0 && x.op !== 'loi'; })[0] ||
      rules.filter(function (x) { return /SCORE$/.test(x.id) && x.op !== 'loi'; })[0];
    if (!r) return 0;
    if (r.bt === 'float') return (/score\.max/i.test(r.value) || rubyToF(r.value) > 0) ? 100 : 0;
    if (r.bt === 'integer') return rubyToI(r.value) > 0 ? 100 : 0;
    if (r.bt === 'boolean') return /^true$/i.test(r.value) ? 100 : 0;
    return 0;
  }
  function luatCua(nodes) { var out = []; nodes.forEach(function (n) { out = out.concat(n.rules); }); return out; }
  function coSum(rules) { return rules.some(function (x) { return x.id === 'SCORE' && x.op === 'sum'; }); }

  /* ===================== bộ kiểm tra ===================== */

  function taoNguCanh(files) {
    var ctx = { files: {}, errors: [], warnings: [], xml: {}, itemIdents: {}, usedImages: {}, manifestFiles: {}, banks: [], quizzes: [], qtiFiles: [] };
    ctx.add = function (level, code, msg, noi) {
      var o = { level: level, code: code, msg: msg };
      if (noi) { if (noi.file) o.file = noi.file; if (noi.item) o.item = noi.item; }
      (level === 'error' ? ctx.errors : ctx.warnings).push(o);
    };
    Object.keys(files || {}).forEach(function (k) {
      var p = String(k).replace(/\\/g, '/').replace(/^\.\//, '');
      if (!p || p[p.length - 1] === '/') return;
      ctx.files[p] = bytes(files[k]);
    });
    return ctx;
  }

  // Giải mã + kiểm tra XML một file (cache)
  function docXml(ctx, path) {
    if (ctx.xml[path]) return ctx.xml[path];
    var u8 = ctx.files[path], s, kq = { path: path, cay: null };
    try { s = giaiMaChat ? giaiMaChat.decode(u8) : new TextDecoder('utf-8', { ignoreBOM: true }).decode(u8); }
    catch (e) { ctx.add('error', 'xml-bad-utf8', 'File không phải UTF-8 hợp lệ — Canvas xoá byte hỏng', { file: path }); s = new TextDecoder('utf-8', { ignoreBOM: true }).decode(u8); }
    var lint = kiemXml(s);
    lint.loi.forEach(function (x) { ctx.add('error', x.code, x.msg, { file: path }); });
    lint.canhBao.forEach(function (x) { ctx.add('warn', x.code, x.msg, { file: path }); });
    kq.cdata = lint.cdata;
    kq.loiCuPhap = lint.loi.length > 0;
    // cây: dùng core.parseXml nếu có (D§1), không thì cây của bộ kiểm tra
    var cay = null;
    if (core && typeof core.parseXml === 'function') {
      try { cay = core.parseXml(s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s); if (cay && cay.name === '#fragment') cay = con(cay)[0] || null; } catch (e) { cay = null; }
    }
    kq.cay = cay || lint.cay;
    ctx.xml[path] = kq;
    return kq;
  }

  function checkPackage(files, opts) {
    opts = opts || {};
    var ctx = taoNguCanh(files);
    var paths = Object.keys(ctx.files);

    // 1) manifest ở gốc zip (R§1.1; C:…/qti/converter.rb#L52-L58 đọc @package_root/imsmanifest.xml)
    var man = null;
    if (ctx.files['imsmanifest.xml']) man = 'imsmanifest.xml';
    else {
      var khac = paths.filter(function (p) { return /(^|\/)imsmanifest\.xml$/i.test(p); });
      ctx.add('error', khac.length ? 'manifest-not-root' : 'manifest-missing',
        khac.length ? 'imsmanifest.xml không nằm ở gốc zip (thấy: ' + khac.join(', ') + ') — Canvas không thấy manifest, ảnh không được đăng ký (R§1.2)'
          : 'Thiếu imsmanifest.xml ở gốc zip (R§1.1)');
    }
    // 2) mọi file .xml/.dat/.qti đều được Python đọc (Q:imsqtiv1.py#L6332-L6355)
    var xmlPaths = paths.filter(function (p) { return /\.(xml|dat|qti)$/i.test(p); });
    xmlPaths.forEach(function (p) { docXml(ctx, p); });
    if (ctx.files['course_settings/canvas_export.txt']) ctx.add('warn', 'canvas-export-txt', 'Có course_settings/canvas_export.txt — gói bị nhận là Canvas cartridge (R§1.2: đừng thêm)');

    // 3) manifest
    var manInfo = { resources: [], byId: {}, fileHrefs: {}, qtiHrefs: {} };
    if (man) kiemManifest(ctx, man, manInfo);
    ctx.manInfo = manInfo;

    // 4) file QTI
    xmlPaths.forEach(function (p) {
      if (p === man || /(^|\/)assessment_meta\.xml$/i.test(p)) return;
      var x = ctx.xml[p];
      if (!x.cay) return;
      var goc = ln(x.cay.name);
      if (goc !== 'questestinterop') {
        if (manInfo.qtiHrefs[p]) ctx.add('error', 'qti-root', 'File QTI có gốc <' + x.cay.name + '>, phải là <questestinterop>', { file: p });
        else ctx.add('warn', 'xml-extra', 'File XML lạ (gốc <' + x.cay.name + '>) — Python vẫn đọc nó', { file: p });
        return;
      }
      if (man && !manInfo.qtiHrefs[p]) ctx.add('warn', 'qti-unlisted', 'File QTI không có <file href> trong manifest — Python vẫn đọc (Q:imsqtiv1.py#L6332) nhưng nên khai báo', { file: p });
      ctx.qtiFiles.push(p);
      kiemFileQti(ctx, p, x);
    });

    // 5) assessment_meta.xml mồ côi
    xmlPaths.filter(function (p) { return /(^|\/)assessment_meta\.xml$/i.test(p); }).forEach(function (p) {
      if (!ctx.quizzes.some(function (q) { return q.metaPath === p; })) ctx.add('warn', 'quiz-meta-orphan', 'assessment_meta.xml không gắn với bài kiểm tra nào (thiếu <dependency> từ resource của assessment)', { file: p });
    });

    // 6) ảnh/file không phải XML
    var anhManifest = Object.keys(manInfo.fileHrefs).filter(function (h) { return !/\.(xml|dat|qti)$/i.test(h); });
    var tenGoc = {};
    anhManifest.forEach(function (h) {
      if (!RE_TEN_ANH.test(h)) ctx.add('warn', 'image-name', 'Tên file "' + h + '" không theo mẫu images/[a-z0-9][a-z0-9_-]*.(png|jpg|gif) (R§3)');
      var b = h.split('/').pop().toLowerCase();
      if (tenGoc[b] && tenGoc[b] !== h) ctx.add('warn', 'image-dup-basename', 'Hai file trùng tên cuối "' + b + '" (' + tenGoc[b] + ', ' + h + ') — Canvas so khớp theo đuôi đường dẫn nên mơ hồ (C:…/qti/html_helper.rb#L108-L110)');
      tenGoc[b] = h;
      if (!ctx.usedImages[h]) ctx.add('warn', 'image-unused', 'File "' + h + '" có trong manifest nhưng không câu nào dùng');
    });
    paths.forEach(function (p) {
      if (/\.(xml|dat|qti)$/i.test(p) || !man || manInfo.fileHrefs[p]) return;
      ctx.add('warn', 'zip-unlisted', 'File "' + p + '" có trong zip nhưng không có trong manifest → Canvas không nhập (Q:imsqtiv1.py#L299-L385)');
    });

    // 7) bố cục
    var coBank = ctx.banks.length > 0, coQuiz = ctx.quizzes.length > 0;
    var layout = coBank && coQuiz ? 'mixed' : coBank ? 'classic' : coQuiz ? 'itembank' : 'empty';
    if (layout === 'empty') ctx.add('error', 'no-content', 'Gói không có <objectbank> hay <assessment> nào chứa câu hỏi');
    if (opts.layout === 'classic' && layout !== 'classic') ctx.add('error', 'layout', 'Mong đợi bố cục classic (chỉ objectbank, D§5.1) nhưng gói là "' + layout + '"');
    if (opts.layout === 'itembank') {
      if (layout !== 'itembank') ctx.add('error', 'layout', 'Mong đợi bố cục itembank (một assessment, D§5.1) nhưng gói là "' + layout + '"');
      else if (ctx.quizzes.length !== 1) ctx.add('error', 'layout', 'Bố cục itembank phải có đúng 1 assessment (có ' + ctx.quizzes.length + ')');
      ctx.quizzes.forEach(function (q) {
        if (!q.metaPath) ctx.add('error', 'quiz-meta-missing', 'Bố cục itembank cần assessment_meta.xml + <dependency> (D§5.1)', { file: q.file });
        if (q.groups.length) ctx.add('error', 'quiz-groups', 'Bố cục itembank không được có nhóm/sourcebank_ref (D§5.1)', { file: q.file });
      });
    }

    var soCau = 0, soLoi = ctx.errors.length;
    ctx.banks.forEach(function (b) { soCau += b.items.length; });
    ctx.quizzes.forEach(function (q) { soCau += q.items.length; });
    var kq = {
      ok: soLoi === 0, layout: layout, errors: ctx.errors, warnings: ctx.warnings,
      banks: ctx.banks.map(congKhai), quizzes: ctx.quizzes.map(congKhai),
      stats: { items: soCau, errors: soLoi, warnings: ctx.warnings.length, files: paths.length }
    };
    if (kq.quizzes.length) kq.quiz = kq.quizzes[0];
    return kq;
  }
  function congKhai(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k[0] !== '_') c[k] = o[k]; }); return c; }

  /* ---------- manifest ---------- */
  function kiemManifest(ctx, man, info) {
    var x = ctx.xml[man], noi = { file: man };
    if (!x || !x.cay) { ctx.add('error', 'manifest-parse', 'Không đọc được imsmanifest.xml', noi); return; }
    var goc = x.cay;
    if (ln(goc.name) !== 'manifest') ctx.add('error', 'manifest-root', 'Gốc imsmanifest.xml là <' + goc.name + '>, phải là <manifest>', noi);
    // không gian tên QTI 2 / <schema>QTIv2 → nhánh QTI 2 (C:…/qti/converter.rb#L85-L91)
    [goc].concat(hauDue(goc)).forEach(function (el) {
      Object.keys(el.attrs || {}).forEach(function (a) {
        if (/^xmlns(:|$)/.test(a) && NS_QTI2.some(function (ns) { return String(el.attrs[a]).indexOf(ns) === 0; }))
          ctx.add('error', 'manifest-qti2', 'Manifest khai báo namespace QTI 2 (' + el.attrs[a] + ') → Canvas bỏ qua bước chuyển QTI 1.2', noi);
      });
    });
    hauDue(goc, 'metadata').forEach(function (md) {
      hauDue(md, 'schema').forEach(function (sc) {
        if (/QTIv2\./i.test(chu(sc))) ctx.add('error', 'manifest-qti2', '<schema>' + chu(sc).trim() + '</schema> → Canvas coi là QTI 2 (C:…/qti/converter.rb#L89-L90)', noi);
      });
    });
    var resources = hauDue(goc, 'resource');
    resources.forEach(function (r) {
      var id = tt(r, 'identifier');
      var res = { el: r, id: id, type: tt(r, 'type') || '', href: tt(r, 'href'), files: [], deps: [] };
      if (!id) ctx.add('error', 'resource-no-id', '<resource> thiếu identifier', noi);
      else if (info.byId[id]) ctx.add('error', 'resource-dup-id', 'identifier "' + id + '" bị lặp trong manifest', noi);
      else info.byId[id] = res;
      con(r, 'file').forEach(function (f) { if (tt(f, 'href') != null) res.files.push(tt(f, 'href')); });
      con(r, 'dependency').forEach(function (d) { res.deps.push(tt(d, 'identifierref')); });
      if (!res.files.length) ctx.add('warn', 'resource-no-file', 'resource "' + id + '" không có <file>', noi);
      if (res.href != null && res.files.indexOf(res.href) < 0) ctx.add('warn', 'resource-href-not-file', 'resource "' + id + '" có href="' + res.href + '" nhưng không có <file> trùng', noi);
      info.resources.push(res);
    });
    // <file> phải nằm ngay trong <resource> mới được đăng ký (Q:imsqtiv1.py#L374-L385)
    hauDue(goc, 'file').forEach(function (f) {
      var cha = timCha(goc, f);
      if (!cha || ln(cha.name) !== 'resource') ctx.add('error', 'file-location', '<file href="' + tt(f, 'href') + '"> không nằm trực tiếp trong <resource> → Python không đăng ký', noi);
    });
    info.resources.forEach(function (res) {
      res.deps.forEach(function (d) { if (!d || !info.byId[d]) ctx.add('error', 'dependency-missing', 'resource "' + res.id + '" phụ thuộc identifierref="' + d + '" không tồn tại', noi); });
      res.files.forEach(function (h) {
        info.fileHrefs[h] = res;
        if (/\.(xml|dat|qti)$/i.test(h)) info.qtiHrefs[h] = res;
        if (!RE_HREF_AN_TOAN.test(h) || /(^|\/)\.\.?(\/|$)/.test(h)) {
          ctx.add('error', 'href-chars', 'href "' + h + '" có ký tự không an toàn (khoảng trắng/+/%/ký tự ngoài ASCII/đường dẫn tuyệt đối) — Python đổi ký tự > U+00FF thành "?" (Q:lib/xmlutils.py#L73-L87), CGI.unescape đổi "+" thành dấu cách (C:…/qti.rb#L122)', noi);
        }
        if (!ctx.files[h]) {
          var gan = Object.keys(ctx.files).filter(function (p) { return p.toLowerCase() === String(h).toLowerCase(); })[0];
          if (gan) ctx.add('error', 'file-case', '<file href="' + h + '"> chỉ khớp "' + gan + '" khi bỏ qua hoa/thường — máy chủ phân biệt hoa thường', noi);
          else ctx.add('error', 'file-missing', '<file href="' + h + '"> không có trong zip', noi);
        }
      });
    });
  }
  function timCha(goc, dich) {
    var kq = null;
    (function di(el) { (el.children || []).forEach(function (c) { if (kq || !laEl(c)) return; if (c === dich) kq = el; else di(c); }); })(goc);
    return kq;
  }

  /* ---------- file QTI ---------- */
  function kiemViTri(ctx, el, chaTen, noi, dem) {
    // giả lập CheckLocation; phần tử ngoài bảng Python → Unsupported, bỏ qua cả cây con (#L6400-L6410)
    con(el).forEach(function (c) {
      var t = ln(c.name);
      if (t === 'mattext' || t === 'matemtext') { if (VI_TRI[t] && VI_TRI[t].indexOf(ln(el.name)) < 0) ctx.add('error', 'qti-location', '<' + t + '> nằm trong <' + el.name + '> (Q:imsqtiv1.py#L3727)', noi); return; }
      if (!co(PY_HO_TRO, t) && c.name.indexOf('webct:') !== 0) {
        if (!dem[t]) { dem[t] = 1; ctx.add('warn', 'qti-unsupported-element', 'Phần tử <' + c.name + '> không được Python hỗ trợ → bỏ qua cả nhánh con (Q:imsqtiv1.py#L6400-L6410)', noi); }
        return;
      }
      var ds = VI_TRI[t];
      if (ds && ds.indexOf(ln(el.name)) < 0) ctx.add('error', t === 'objectbank' ? 'objectbank-parent' : 'qti-location', '<' + t + '> nằm trong <' + el.name + '> — Python ném QTIException, CẢ FILE bị bỏ, Canvas không báo lỗi (Q:imsqtiv1.py#L289-L292, #L6350-L6353' + (t === 'objectbank' ? ', #L660' : '') + ')', noi);
      var dsTT = THUOC_TINH_QTI[t];
      if (dsTT) Object.keys(c.attrs || {}).forEach(function (a) {
        if (a === 'xmlns' || a.indexOf(':') >= 0 && a !== 'xml:lang' && a !== 'xml:space') return;   // Python bỏ qua namespace
        if (!co(dsTT, a) && !dem[t + '@' + a]) { dem[t + '@' + a] = 1; ctx.add('warn', 'qti-attr-unknown', 'Thuộc tính ' + a + ' của <' + t + '> không được Python đọc → bị bỏ qua (gõ nhầm?) (Q:imsqtiv1.py#L127-L140)', noi); }
      });
      kiemViTri(ctx, c, t, noi, dem);
    });
  }

  function kiemFileQti(ctx, p, x) {
    var goc = x.cay, noi = { file: p };
    kiemViTri(ctx, goc, 'questestinterop', noi, {});
    if (x.cdata) ctx.add('warn', 'cdata', 'Dùng CDATA (' + x.cdata + ' đoạn) — R§6 D1: nên thoát thực thể', noi);
    Object.keys(goc.attrs).forEach(function (a) {
      if (/^xmlns(:|$)/.test(a) && NS_QTI2.some(function (ns) { return String(goc.attrs[a]).indexOf(ns) === 0; })) ctx.add('warn', 'qti-ns', 'File QTI 1.2 khai báo namespace QTI 2', noi);
    });
    if (goc.attrs.xmlns != null && goc.attrs.xmlns !== 'http://www.imsglobal.org/xsd/ims_qtiasiv1p2') ctx.add('warn', 'qti-ns', 'xmlns của <questestinterop> = "' + goc.attrs.xmlns + '" — R§1.3 dùng http://www.imsglobal.org/xsd/ims_qtiasiv1p2', noi);
    var cs = con(goc);
    var ob = cs.filter(function (c) { return ln(c.name) === 'objectbank'; });
    var as = cs.filter(function (c) { return ln(c.name) === 'assessment'; });
    var le = cs.filter(function (c) { return ['item', 'section'].indexOf(ln(c.name)) >= 0; });
    // objectbank không phải con trực tiếp: lỗi vị trí đã báo ở kiemViTri
    if (ob.length + as.length + (le.length ? 1 : 0) > 1) ctx.add('error', 'qti-root-mixed', '<questestinterop> phải chứa đúng MỘT trong: objectbank | assessment | (section|item)+ (DTD; R§1.1: mỗi file một bank)', noi);
    if (ob.length > 1) ctx.add('error', 'objectbank-multi', 'Nhiều <objectbank> trong một file (R§1.1: mỗi file một bank)', noi);
    ob.forEach(function (b) { kiemBank(ctx, p, b); });
    as.forEach(function (a) { kiemQuiz(ctx, p, a); });
    if (le.length) {
      ctx.add('warn', 'item-unfiled', 'Câu hỏi/section nằm trực tiếp trong <questestinterop> → vào "ngân hàng mặc định" của form import (R§1.1)', noi);
      var giaBank = { ident: null, title: null, file: p, items: [] };
      le.forEach(function (c) { (ln(c.name) === 'item' ? [c] : hauDue(c, 'item')).forEach(function (itEl) { giaBank.items.push(kiemItem(ctx, itEl, { file: p, bank: null })); }); });
      ctx.banks.push(giaBank);
    }
  }

  function kiemBank(ctx, p, b) {
    var noi = { file: p };
    var ident = tt(b, 'ident');
    if (ident == null || ident === '') ctx.add('error', 'objectbank-ident', '<objectbank> thiếu ident → câu hỏi không có ngân hàng (Q:imsqtiv1.py#L664-L668, #L1929)', noi);
    else if (!RE_BANK_ID.test(ident)) ctx.add('error', 'objectbank-ident', 'ident ngân hàng "' + ident + '" không khớp ^[A-Za-z_][A-Za-z0-9_-]{0,63}$ (R§2.0)', noi);
    if (ident && ctx.banks.some(function (x) { return x.ident === ident; })) ctx.add('error', 'bank-dup-ident', 'Hai objectbank cùng ident "' + ident + '" → gộp vào một ngân hàng', noi);
    if (ident && p !== 'non_cc_assessments/' + ident + '.xml.qti') ctx.add('warn', 'bank-path', 'File ngân hàng nên là non_cc_assessments/' + ident + '.xml.qti (R§1.1)', noi);
    var res = ctx.manInfo.qtiHrefs[p];
    if (res && res.type !== 'imsqti_xmlv1p2') ctx.add('warn', 'resource-type', 'resource của ngân hàng có type="' + res.type + '" — nên là imsqti_xmlv1p2 (R§1.2, R§6 D5)', noi);
    // bank_title: phải đứng trước <item> đầu tiên (Q:imsqtiv1.py#L1929-L1930, BankTitle #L2969-L2981)
    var title = null, viTriTitle = -1, viTriItem = -1, dem = 0;
    con(b).forEach(function (c, i) {
      var t = ln(c.name);
      if (t === 'item' && viTriItem < 0) viTriItem = i;
      if (t === 'section') ctx.add('error', 'objectbank-section', '<section> trong <objectbank> — chưa được kiểm chứng, R§1.1 cấm', noi);
      if (t === 'qtimetadata') {
        hauDue(c, ['qtimetadatafield', 'qti_metadatafield']).forEach(function (f) {
          var nhan = chu(dau(f, 'fieldlabel')).trim().toLowerCase();
          if (nhan === 'bank_title') { title = chu(dau(f, 'fieldentry')).trim(); viTriTitle = i; dem++; }
          else if (/^bank_(type|state|context_uuid)$/.test(nhan)) ctx.add('warn', 'bank-extra-fields', 'Trường ' + nhan + ' không được importer dùng (R§1.3: bỏ đi)', noi);
        });
      }
    });
    if (title == null || title === '') ctx.add('warn', 'bank-title-missing', 'Thiếu bank_title → ngân hàng mang tên "' + ident + '" (Q:imsqtiv1.py#L673-L677)', noi);
    else if (viTriItem >= 0 && viTriTitle > viTriItem) ctx.add('error', 'bank-title-after-item', 'bank_title nằm sau <item> đầu tiên → các câu trước đó vào ngân hàng tên "' + ident + '" (Q:imsqtiv1.py#L1929-L1930)', noi);
    if (title && soDiemMa(title) > 255) ctx.add('warn', 'bank-title-long', 'Tên ngân hàng dài ' + soDiemMa(title) + ' > 255 ký tự → bị cắt (C:app/models/importers/assessment_question_importer.rb#L87-L90)', noi);
    if (dem > 1) ctx.add('warn', 'bank-title-dup', 'Có ' + dem + ' trường bank_title', noi);
    var bank = { ident: ident || null, title: title || ident || null, file: p, items: [] };
    con(b, 'item').forEach(function (itEl) { bank.items.push(kiemItem(ctx, itEl, { file: p, bank: ident })); });
    if (!bank.items.length) ctx.add('error', 'bank-empty', 'Ngân hàng "' + (title || ident) + '" không có câu hỏi', noi);
    ctx.banks.push(bank);
  }

  /* ---------- assessment (bố cục itembank / quiz) ---------- */
  function kiemQuiz(ctx, p, a) {
    var noi = { file: p }, ident = tt(a, 'ident'), title = tt(a, 'title');
    var q = { ident: ident || null, title: title || null, file: p, items: [], groups: [], meta: null, metaPath: null };
    if (!ident) ctx.add('error', 'quiz-ident', '<assessment> thiếu ident', noi);
    var thuMuc = p.indexOf('/') >= 0 ? p.slice(0, p.lastIndexOf('/')) : '';
    if (ident && p !== ident + '/' + ident + '.xml') ctx.add('warn', 'quiz-layout', 'File assessment nên là ' + ident + '/' + ident + '.xml (export-format §1a, D§5.1)', noi);
    var secs = con(a, 'section');
    if (!secs.length) ctx.add('error', 'quiz-empty', '<assessment> không có <section>', noi);
    secs.forEach(function (s, i) {
      if (i === 0 && tt(s, 'ident') !== 'root_section') ctx.add('warn', 'quiz-root-section', 'section đầu nên có ident="root_section" (R§1.4)', noi);
      (function duyetSec(sec, sau) {
        con(sec).forEach(function (c) {
          var t = ln(c.name);
          if (t === 'item') q.items.push(kiemItem(ctx, c, { file: p, bank: ident && /_quiz$/.test(ident) ? ident.replace(/_quiz$/, '') : null, quiz: ident }));
          else if (t === 'section') {
            var g = { ident: tt(c, 'ident'), title: tt(c, 'title'), sourcebank: null, pick: null, pointsPerItem: null, items: 0 };
            var sel = dau(c, 'selection');
            if (sel) {
              g.sourcebank = dau(sel, 'sourcebank_ref') ? chu(dau(sel, 'sourcebank_ref')).trim() : null;
              g.pick = dau(sel, 'selection_number') ? rubyToI(chu(dau(sel, 'selection_number'))) : null;
              g.pointsPerItem = dau(sel, 'points_per_item') ? rubyToF(chu(dau(sel, 'points_per_item'))) : null;
            }
            q.groups.push(g);
            var truoc = q.items.length;
            duyetSec(c, sau + 1);
            g.items = q.items.length - truoc;
          }
        });
      })(s, 0);
    });
    if (!q.items.length && !q.groups.length) ctx.add('error', 'quiz-empty', 'Bài kiểm tra "' + (title || ident) + '" không có câu hỏi', noi);
    // dependency → assessment_meta.xml (export-format §1a; text2qti P16: identifier phải khớp)
    var res = ctx.manInfo.resources.filter(function (r) { return r.files.indexOf(p) >= 0; })[0];
    var metaGanDo = (thuMuc ? thuMuc + '/' : '') + 'assessment_meta.xml';
    if (res) {
      if (ident && res.id !== ident) ctx.add('error', 'quiz-resource-id', 'resource chứa assessment có identifier="' + res.id + '" ≠ ident assessment "' + ident + '" — Canvas không ghép được assessment_meta.xml', noi);
      if (res.type !== 'imsqti_xmlv1p2') ctx.add('warn', 'resource-type', 'resource của assessment có type="' + res.type + '" — nên là imsqti_xmlv1p2', noi);
      var metaRes = res.deps.map(function (d) { return ctx.manInfo.byId[d]; }).filter(Boolean)
        .filter(function (r) { return r.files.some(function (h) { return /(^|\/)assessment_meta\.xml$/.test(h); }) || /(^|\/)assessment_meta\.xml$/.test(r.href || ''); })[0];
      if (!metaRes) {
        if (ctx.files[metaGanDo]) ctx.add('error', 'quiz-meta-dep', 'Có ' + metaGanDo + ' nhưng resource của assessment không có <dependency> tới nó', noi);
        else ctx.add('warn', 'quiz-meta-dep', 'Không có assessment_meta.xml (không bắt buộc với Classic, nhưng bố cục itembank cần — D§5.1)', noi);
      } else {
        var mp = metaRes.href || metaRes.files[0];
        if (metaRes.type !== 'associatedcontent/imscc_xmlv1p1/learning-application-resource') ctx.add('warn', 'quiz-meta-type', 'resource meta có type="' + metaRes.type + '" (Canvas: associatedcontent/imscc_xmlv1p1/learning-application-resource)', noi);
        if (mp !== metaGanDo) ctx.add('error', 'quiz-meta-href', 'assessment_meta.xml phải nằm cạnh file assessment: ' + metaGanDo + ' (đang là ' + mp + ')', noi);
        if (metaRes.files.indexOf(mp) < 0) ctx.add('warn', 'resource-href-not-file', 'resource meta không có <file href="' + mp + '">', noi);
        if (ctx.files[mp]) { q.metaPath = mp; kiemMeta(ctx, mp, q); }
      }
    } else ctx.add('error', 'quiz-resource-missing', 'Không có <resource> nào trong manifest chứa ' + p, noi);
    ctx.quizzes.push(q);
  }

  function kiemMeta(ctx, mp, q) {
    var x = docXml(ctx, mp), noi = { file: mp };
    if (!x.cay) return;
    var m = x.cay;
    if (ln(m.name) !== 'quiz') { ctx.add('error', 'quiz-meta-root', 'Gốc assessment_meta.xml là <' + m.name + '>, phải là <quiz>', noi); return; }
    if (tt(m, 'identifier') !== q.ident) ctx.add('error', 'quiz-meta-ident', '<quiz identifier="' + tt(m, 'identifier') + '"> ≠ ident assessment "' + q.ident + '" (text2qti P16)', noi);
    function f(ten) { var e = con(m, ten)[0]; return e ? chu(e).trim() : null; }
    var meta = { title: f('title'), shuffle_answers: f('shuffle_answers'), quiz_type: f('quiz_type'), points_possible: f('points_possible'),
      allowed_attempts: f('allowed_attempts'), available: f('available') };
    q.meta = meta;
    if (meta.title == null) ctx.add('error', 'quiz-meta-title', 'assessment_meta.xml thiếu <title>', noi);
    else if (q.title != null && meta.title !== q.title) ctx.add('warn', 'quiz-meta-title', '<title> meta "' + meta.title + '" ≠ title assessment "' + q.title + '"', noi);
    var tong = q.items.reduce(function (s, it) { return s + (it.points || 0); }, 0);
    if (meta.points_possible != null && Math.abs(rubyToF(meta.points_possible) - tong) > 1e-6) ctx.add('warn', 'quiz-meta-points', 'points_possible meta = ' + meta.points_possible + ' ≠ tổng điểm câu ' + +tong.toFixed(6), noi);
    var mongDoi = { shuffle_answers: 'false', quiz_type: 'assignment', allowed_attempts: '1', available: 'false' };   // D§5.1
    Object.keys(mongDoi).forEach(function (k) { if (meta[k] != null && meta[k] !== mongDoi[k]) ctx.add('warn', 'quiz-meta-field', '<' + k + '>' + meta[k] + ' — D§5.1 dùng ' + mongDoi[k], noi); });
    var asg = con(m, 'assignment')[0];
    if (asg) {
      var qr = con(asg, 'quiz_identifierref')[0];
      if (qr && chu(qr).trim() !== q.ident) ctx.add('error', 'quiz-meta-assignment', '<assignment><quiz_identifierref> = "' + chu(qr).trim() + '" ≠ "' + q.ident + '"', noi);
    }
  }

  /* ---------- một câu hỏi ---------- */
  function kiemItem(ctx, itEl, env) {
    var identRaw = tt(itEl, 'ident');
    var noi = { file: env.file, item: identRaw || '?' };
    function E(code, msg) { ctx.add('error', code, msg, noi); }
    function W(code, msg) { ctx.add('warn', code, msg, noi); }
    var it = phanTichItem(itEl);
    var tom = { ident: identRaw || null, title: tt(itEl, 'title') != null ? tt(itEl, 'title') : null, type: null, canvasType: null, points: null,
      stemChars: 0, images: [], correct: null, summary: '' };

    // ident: ASCII, ổn định, duy nhất toàn gói (R§2.0; C:…/assessment_question_importer.rb#L41-L49)
    if (!identRaw) E('item-ident', '<item> thiếu ident');
    else {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(identRaw)) E('item-ident', 'ident "' + identRaw + '" ngoài [A-Za-z0-9_-] hoặc không bắt đầu bằng chữ — Python đổi thành "' + pyItemIdent(identRaw) + '" (Q:lib/imscp.py#L161-L172)');
      var eff = pyItemIdent(identRaw);
      if (ctx.itemIdents[eff]) E('item-ident-dup', 'ident "' + identRaw + '" trùng với câu khác (sau chuẩn hoá: "' + eff + '") — import đè sẽ ghi đè/chuyển câu (R§1.5)');
      ctx.itemIdents[eff] = true;
      if (env.bank && identRaw.indexOf(env.bank) !== 0) W('item-ident-bank', 'ident câu không bắt đầu bằng ident ngân hàng "' + env.bank + '" (R§1.5: ident câu phải chứa ident ngân hàng)');
    }
    if (tom.title == null || tom.title === '') W('item-title', 'Thiếu title (tên câu trong ngân hàng, C:…/assessment_item_converter.rb#L89)');

    // thứ tự con của item: resprocessing trước presentation → respident chưa khai báo (Q:imsqtiv1.py#L4350, #L5765)
    var iP = it.order.indexOf('presentation'), iR = it.order.indexOf('resprocessing'), iM = it.order.indexOf('itemmetadata'), iF = it.order.indexOf('itemfeedback');
    if (iP >= 0 && iR >= 0 && iR < iP) E('item-order', '<resprocessing> đứng trước <presentation> → mọi varequal tham chiếu response chưa khai báo (Q:imsqtiv1.py#L5765-L5770)');
    if ((iM >= 0 && iP >= 0 && iM > iP) || (iF >= 0 && iR >= 0 && iF < iR)) W('item-order', 'Thứ tự con của <item> khác Canvas: itemmetadata → presentation → resprocessing → itemfeedback (R§2.0)');
    if (it.metaDup.length) W('meta-dup', 'Trường metadata lặp: ' + it.metaDup.join(', '));
    if (it.metaLa.length) W('meta-unknown', 'Nhãn metadata Python không biết (bị bỏ, "Unmapped metadata field"): ' + it.metaLa.join(', ') + ' (Q:imsqtiv1.py#L3241-L3320)');

    // question_type (Q:imsqtiv1.py#L2882-L2901 → C:…/assessment_item_converter.rb#L219-L230)
    var qt = it.meta.qtype;
    if (qt == null || qt === '') E('qtype-missing', 'Thiếu trường question_type — Canvas phải đoán loại (import-pipeline §3)');
    else if (LOAI_HO_TRO.indexOf(qt) < 0) {
      if (LOAI_CANVAS_KHAC.indexOf(qt) >= 0) E('qtype-unsupported', 'question_type "' + qt + '" là loại Canvas nhưng không thuộc hợp đồng D§5.2');
      else E('qtype-unsupported', 'question_type "' + qt + '" không phải loại Canvas (phải viết thường, đúng tên, C:app/models/assessment_question.rb#L40-L52)');
    }
    tom.type = qt || null;

    // điểm: số thập phân dấu chấm; thiếu = 1 (C:…/assessment_item_converter.rb#L167, #L182-L187)
    var pt = it.meta.points;
    if (pt == null) { W('points-missing', 'Thiếu points_possible → Canvas đặt 1'); tom.points = 1; }
    else if (!/^\d+(\.\d+)?$/.test(pt)) { E('points-nan', 'points_possible "' + pt + '" không phải số thập phân dấu chấm (Ruby to_f("' + pt + '") = ' + rubyToF(pt) + ')'); tom.points = Math.max(rubyToF(pt), 0); }
    else tom.points = parseFloat(pt);
    if (qt === 'text_only_question') { if (tom.points !== 0 && pt != null) W('text-only-points', 'text_only_question nên có points_possible 0 (R§2.10)'); }
    else if (pt != null && tom.points <= 0) E('points-zero', 'Điểm phải > 0 (D§5.3)');

    // mattext: con thô, texttype (Q:imsqtiv1.py#L4015-L4110, #L6399-L6401)
    hauDue(itEl, ['mattext', 'matemtext']).forEach(function (mt) {
      if (con(mt).length) E('mattext-raw-child', '<' + mt.name + '> chứa thẻ XML thô <' + con(mt)[0].name + '> — Python đi nhánh RawMaterial/span, MathML bị phá (R§0 fact 3)');
      var ttp = tt(mt, 'texttype');
      if (ttp != null && ttp !== 'text/plain' && ttp !== 'text/html') E('mattext-texttype', 'texttype="' + ttp + '" không được hỗ trợ (chỉ text/plain, text/html — Q:imsqtiv1.py#L4096-L4100)');
      if (tt(mt, 'uri') != null) W('mattext-uri', '<mattext uri> bị chuyển thành <object> — không dùng');
    });
    hauDue(itEl, 'matimage').forEach(function () { W('matimage', '<matimage> — Python làm phẳng đường dẫn (Q:imsqtiv1.py#L2193-L2220); dùng <img> trong HTML (R§3)'); });

    // stem
    var stemHtml = it.stem.map(function (m) { return m.text; }).join('');
    if (!it.stem.length || !stemHtml.trim()) E('stem-missing', 'Thiếu nội dung câu hỏi (presentation/material/mattext)');
    it.stem.forEach(function (m) {
      if (m.texttype == null) W('mattext-no-texttype', 'mattext của đề không ghi texttype → Python coi là text/html (Q:imsqtiv1.py#L4033-L4034); R§6 D2: luôn ghi rõ');
      else if (m.texttype === 'text/plain') {
        if (RE_CO_THE.test(m.text)) E('plain-has-markup', 'Đề text/plain nhưng chứa thẻ HTML → hiện nguyên chữ thẻ');
        else W('stem-texttype', 'Đề dùng text/plain — R§2.1 luôn dùng text/html');
      }
    });
    var stemDai = soDiemMa(stemHtml);
    tom.stemChars = stemDai;
    if (stemDai > GIOI_HAN_STEM) E('stem-length', 'Đề dài ' + stemDai + ' ký tự > 16384 → Canvas thay bằng "The imported question text for this question was too long." (C:…/assessment_question_importer.rb#L201-L205)');
    else if (stemDai > NGUONG_STEM) W('stem-length', 'Đề dài ' + stemDai + ' ký tự > 15000 (D§5.3) — gần giới hạn 16384');
    if (it.stem.length && it.stem.some(laHtml) && stemHtml.trim() && !/^\s*<div>[\s\S]*<\/div>\s*$/.test(stemHtml)) W('stem-div', 'Đề nên bọc trong <div>…</div> trần (R§5 quy tắc 7)');

    // mọi HTML trong item: ảnh, allowlist, MathML, CSS
    function kiemMotHtml(m, vaiTro) {
      if (!laHtml(m)) return;
      var h = kiemHtml(m.text);
      var gom = {};
      h.ds.forEach(function (x) { var k = x.code + '|' + x.msg; if (gom[k]) return; gom[k] = 1; ctx.add(x.level, x.code, vaiTro + ': ' + x.msg, noi); });
      h.imgs.forEach(function (src) { kiemAnh(ctx, src, noi, tom); });
    }
    it.stem.forEach(function (m) { kiemMotHtml(m, 'Đề'); });
    it.responses.forEach(function (r) {
      r.prompt.forEach(function (m) { kiemMotHtml(m, 'Vế trái/nhãn ô'); });
      r.labels.forEach(function (l) { l.mattexts.forEach(function (m) { kiemMotHtml(m, 'Phương án ' + l.identRaw); }); });
    });
    it.feedbacks.forEach(function (f) { f.mattexts.forEach(function (m) { kiemMotHtml(m, 'Phản hồi ' + f.ident); }); });

    // response: ident, trùng lặp, nhãn
    var thayResp = {};
    it.responses.forEach(function (r) {
      if (r.identRaw == null) E('response-ident', '<' + r.tag + '> thiếu ident');
      else if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(r.identRaw)) E('response-ident', 'ident response "' + r.identRaw + '" có ký tự bị Python đổi (→ "' + r.py + '", Q:imsqtiv1.py#L162-L172)');
      if (thayResp[r.py]) E('response-dup', 'Hai response cùng ident "' + r.identRaw + '"');
      thayResp[r.py] = true;
      if (!r.render) E('response-render', '<' + r.tag + ' ident="' + r.identRaw + '"> không có render_*');
      if (r.hasCard && !/^(single|multiple|ordered)$/.test(r.card)) E('rcardinality-value', 'rcardinality="' + tt(r.el, 'rcardinality') + '" không hợp lệ (Single | Multiple | Ordered) — Python đổi cách so khớp đáp án (Q:imsqtiv1.py#L4310, #L5800-L5830)');
      if (r.tag === 'response_lid' && !r.hasCard) W('rcardinality-missing', 'response_lid "' + r.identRaw + '" thiếu rcardinality (R§2.0: luôn ghi Single/Multiple — New Quizzes cần)');
      var thayNhan = {};
      r.labels.forEach(function (l) {
        if (l.identRaw == null) E('label-ident', 'response_label thiếu ident (Python bỏ qua nhãn, Q:imsqtiv1.py#L4990)');
        else if (!/^[A-Za-z0-9_-]+$/.test(l.identRaw)) E('label-ident', 'ident phương án "' + l.identRaw + '" có ký tự ngoài [A-Za-z0-9_-] — "." và ":" bị đổi ở nhãn nhưng không ở varequal (Q:imsqtiv1.py#L162-L172 vs #L5782) → mất đáp án');
        else if (r.tag === 'response_lid' && !/^[1-9]\d*$/.test(l.identRaw)) W('label-ident-int', 'ident phương án "' + l.identRaw + '" không phải số nguyên dương (R§2.0)');
        if (l.py && thayNhan[l.py]) E('label-dup', 'ident phương án "' + l.identRaw + '" lặp trong response "' + r.identRaw + '"');
        if (l.py) thayNhan[l.py] = true;
      });
    });
    var nhanToanItem = {};
    it.responses.forEach(function (r) { r.labels.forEach(function (l) { if (!l.py) return; (nhanToanItem[l.py] = nhanToanItem[l.py] || []).push(r.identRaw); }); });

    // var* tham chiếu response chưa khai báo → Null (Q:imsqtiv1.py#L5765-L5770)
    it.conds.forEach(function (c) {
      duyetExpr(c.expr, function (x) {
        if (x.undeclared) E('respident-unknown', '<' + x.tag + ' respident="' + x.respident + '"> không trỏ tới response nào → Python thay bằng Null, điều kiện vô dụng');
        if (x.op === 'khac') W('cond-operator', 'Toán tử <' + x.tag + '> không được importer Canvas đọc');
      });
      c.rules.forEach(function (r) {
        if (r.op === 'loi') E('setvar-action', 'setvar action="' + r.act + '" không hợp lệ → Python ném QTIException, CẢ FILE bị bỏ (Q:imsqtiv1.py#L5533)');
        if (r.id !== 'SCORE') W('setvar-varname', 'setvar varname="' + tt(r.el, 'varname') + '" — R§2 dùng SCORE; Canvas ' +
          (/^SCORE|SCORE$/.test(r.id) ? 'chỉ đọc được qua bộ chọn dự phòng [identifier^=SCORE]/[$=SCORE]' : 'không đọc biến này') + ' (choice_interaction.rb#L254-L258)');
        if (r.op !== 'loi' && !RE_SO.test(String(r.value).trim())) W('setvar-value', 'Giá trị setvar "' + r.value + '" không phải số dấu chấm (Ruby to_f = ' + rubyToF(r.value) + ')');
      });
      con(c.el, 'displayfeedback').forEach(function (d) {
        if (!tt(d, 'linkrefid')) E('feedback-ref', '<displayfeedback> thiếu linkrefid → Python dựng giá trị định danh rỗng (Q:imsqtiv1.py#L5555-L5567)');
      });
    });
    if (it.rpCount > 1) W('resprocessing-multi', 'Nhiều <resprocessing> — Python gộp làm một (Q:imsqtiv1.py#L2142-L2145)');
    if (it.rpCount && !it.decvars.some(function (d) { return d.id === 'SCORE'; })) W('decvar-missing', 'Thiếu <decvar varname="SCORE" vartype="Decimal"> (R§2.1)');
    it.decvars.forEach(function (d) { if (d.id === 'SCORE' && d.bt !== 'float') W('decvar-type', 'decvar SCORE vartype nên là Decimal (Integer làm "0.5".to_i = 0)'); });

    // itemfeedback (C:…/assessment_item_converter.rb#L261-L282)
    var fbIds = {};
    it.feedbacks.forEach(function (f) {
      if (!f.ident) { E('feedback-id', '<itemfeedback> thiếu ident'); return; }
      if (fbIds[f.ident]) W('feedback-dup', 'itemfeedback "' + f.ident + '" lặp');
      fbIds[f.ident] = true;
      var id = f.ident, py = pyIdent(id, 'FEEDBACK_');
      if (id === 'general_fb' || id === 'correct_fb' || id === 'general_incorrect_fb') return;
      var mm = /^(\d+)_fb$/.exec(id);
      if (mm) {
        if (!nhanToanItem[mm[1]] && !nhanToanItem['RESPONSE_' + mm[1]]) W('feedback-id', 'itemfeedback "' + id + '" không ứng với phương án nào');
        return;
      }
      W('feedback-id', 'itemfeedback ident="' + id + '" (→ "' + py + '") không thuộc general_fb/correct_fb/general_incorrect_fb/<số>_fb → Canvas ' +
        (/wrong|incorrect|_IC$/i.test(py) ? 'coi là phản hồi sai' : /correct|_C$/i.test(py) ? 'coi là phản hồi đúng' : /general_|_all/i.test(py) ? 'coi là phản hồi chung' : 'bỏ qua'));
    });
    it.conds.forEach(function (c) { c.fb.forEach(function (l) { if (l && !fbIds[l]) W('feedback-ref', 'displayfeedback linkrefid="' + l + '" không có itemfeedback tương ứng'); }); });

    // theo loại
    var rp = dungRP(it);
    var loai = LOAI_HO_TRO.indexOf(qt) >= 0 ? qt : null;
    tom.canvasType = loai;
    var ham = {
      multiple_choice_question: kiemChon, true_false_question: kiemChon, multiple_answers_question: kiemChon,
      short_answer_question: kiemNgan, numerical_question: kiemSo, essay_question: kiemTuLuan,
      fill_in_multiple_blanks_question: kiemO, multiple_dropdowns_question: kiemO,
      matching_question: kiemGhep, text_only_question: kiemVanBan
    }[loai];
    if (ham) ham(it, rp, tom, E, W, stemHtml);

    // original_answer_ids (chỉ dùng với flavor Canvas — R§0 fact 1); lệch → cảnh báo
    if (it.meta.oaid != null && it.meta.oaid !== '' && ['multiple_choice_question', 'true_false_question', 'multiple_answers_question'].indexOf(loai) >= 0) {
      var ids = it.meta.oaid.split(',').map(function (s) { return s.trim(); });
      var nhan = (it.responses[0] ? it.responses[0].labels : []).map(function (l) { return l.identRaw; });
      if (ids.join(',') !== nhan.join(',')) W('original-answer-ids', 'original_answer_ids "' + it.meta.oaid + '" ≠ thứ tự phương án "' + nhan.join(',') + '"');
    }
    return tom;
  }

  function kiemAnh(ctx, src, noi, tom) {
    tom.images.push(src);
    if (/^\s*data:/i.test(src)) return;   // đã báo html-data-uri
    if (/^https?:\/\//i.test(src)) { ctx.add('warn', 'img-src-external', 'Ảnh ngoài "' + rutGon(src) + '" — không nằm trong gói', noi); return; }
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(src) || /^\/\//.test(src)) { ctx.add('error', 'img-src-scheme', 'src ảnh "' + rutGon(src) + '" dùng giao thức bị Canvas xoá (chỉ http/https/tương đối)', noi); return; }
    if (/[^\x21-\x7e]/.test(src)) ctx.add('error', 'img-src-nonascii', 'src ảnh "' + src + '" có ký tự ngoài ASCII/khoảng trắng (Q:lib/xmlutils.py#L73-L87)', noi);
    if (/\$[A-Z_-]*\$/.test(src) || /%24/i.test(src)) ctx.add('warn', 'img-src-token', 'src dùng token $IMS-CC-FILEBASE$ — R§3: dùng đường dẫn tương đối images/…', noi);
    var mi = ctx.manInfo || { fileHrefs: {} };
    if (mi.fileHrefs[src]) { ctx.usedImages[src] = true; return; }
    var hauTo = Object.keys(mi.fileHrefs).filter(function (h) { return h.length > src.length ? h.slice(-src.length - 1) === '/' + src : false; });
    ctx.add('error', 'img-src-not-in-manifest', 'src ảnh "' + rutGon(src, 80) + '" không trùng KHÍT một <file href> trong manifest (R§3)' + (hauTo.length ? ' — chỉ khớp đuôi: ' + hauTo.join(', ') : ''), noi);
    hauTo.forEach(function (h) { ctx.usedImages[h] = true; });
  }

  function kiemTextThuan(l, E, W, ten) {
    // ô text thuần: dropdown, đáp án điền, vế phải ghép nối (C:…/fill_in_the_blank.rb#L92, associate_interaction.rb#L122)
    if (RE_CO_THE.test(l.raw)) E('plain-has-markup', ten + ' "' + rutGon(l.raw) + '" chứa thẻ HTML/ảnh — ô này chỉ là text thuần (R§2.0, R§3)');
    else if (/&[A-Za-z]+;|&#\d+;|&#x[0-9a-f]+;/i.test(l.raw)) W('plain-entity', ten + ' "' + rutGon(l.raw) + '" chứa thực thể HTML — sẽ hiện nguyên chữ');
    if (l.mattexts.some(function (m) { return m.texttype !== 'text/plain'; })) W('plain-texttype', ten + ' nên có texttype="text/plain" (R§2.0)');
  }

  function soLanXuatHien(hay, kim) { var n = 0, i = 0; while ((i = hay.indexOf(kim, i)) >= 0) { n++; i += kim.length; } return n; }
  function soDong100(v) { return RE_SO.test(String(v).trim()) && parseFloat(v) === 100; }

  // Điều kiện "chấm điểm": respcondition có setvar SCORE
  function dkChamDiem(it) { return it.conds.filter(function (c) { return c.rules.some(function (r) { return r.id === 'SCORE'; }); }); }

  /* --- MC / TF / MA: Qti::ChoiceInteraction (C:…/qti/choice_interaction.rb) --- */
  function kiemChon(it, rp, tom, E, W) {
    var qt = tom.type;
    var rs = it.responses;
    if (rs.length !== 1 || rs[0].tag !== 'response_lid' || !rs[0].render || rs[0].render.tag !== 'render_choice') {
      E('choice-structure', qt + ' cần đúng một <response_lid> + <render_choice> (có ' + rs.length + ' response: ' + rs.map(function (r) { return r.tag; }).join(', ') + ')');
      if (!rs.length || rs[0].tag !== 'response_lid') return;
    }
    var r = rs[0];
    if (r.card === 'ordered') { E('choice-ordered', 'rcardinality="Ordered" → Python tạo orderInteraction'); return; }
    if (qt === 'multiple_answers_question' && r.card !== 'multiple') E('ma-rcardinality', 'multiple_answers cần rcardinality="Multiple" — với Single, Canvas chỉ đánh dấu đúng varequal ĐẦU TIÊN (choice_interaction.rb#L199-L237)');
    if (qt !== 'multiple_answers_question' && r.card === 'multiple') W('mc-rcardinality', qt + ' nên dùng rcardinality="Single"');
    if (/^TF/.test(r.py)) W('mc-tf-ident', 'ident response bắt đầu bằng "TF" → Canvas ép thành true_false_question (choice_interaction.rb#L193-L198)');
    if (r.labels.length < 2) E('choice-few-options', 'Cần ≥ 2 phương án (D§5.3), có ' + r.labels.length);
    r.labels.forEach(function (l) {
      if (!l.raw.trim() && !/<img/i.test(l.raw)) W('choice-empty', 'Phương án ' + l.identRaw + ' rỗng → Canvas ghi "No answer text provided."');
      l.mattexts.forEach(function (m) { if (m.texttype === 'text/plain' && RE_CO_THE.test(m.text)) E('plain-has-markup', 'Phương án ' + l.identRaw + ' là text/plain nhưng chứa thẻ HTML → hiện nguyên chữ thẻ (dùng text/html, R§2.0)'); });
      if (!l.mattexts.length && l.raw) W('label-pcdata', 'Phương án ' + l.identRaw + ' viết chữ trực tiếp trong response_label (không qua material/mattext)');
    });

    // --- mô phỏng Ruby: process_response_conditions ---
    var answers = r.labels.filter(function (l) { return l.py; }).map(function (l) {
      return { id: l.identRaw, py: l.py, text: l.textRuby === '' ? (/true|false/i.test(l.py) ? rubyClearHtml(l.py) : 'No answer text provided.') : l.textRuby, plain: l.plain, html: l.isHtml, weight: 0 };
    });
    var bang = {}; answers.forEach(function (a) { bang[a.py] = a; });   // khoá sau trùng ghi đè khoá trước
    function timTheoText(mid) { return answers.filter(function (a) { return a.text.toLowerCase() === String(mid).toLowerCase(); })[0]; }
    var crash = null, epTF = false;
    moiCond(rp).forEach(function (cnd) {
      var ifs = ifsCua(cnd), exprs = ifs.map(function (n) { return n.expr; });
      function trongCond(pred) { for (var i = 0; i < exprs.length; i++) { var x = dauOp(exprs[i], pred); if (x) return x; } return null; }
      var mR = trongCond(function (x) { return x.op === 'match' && (x.varId === 'RESP_MC' || x.varId === 'response'); });
      var mM = !mR && trongCond(function (x) { return x.op === 'member' && x.varId === 'RESP_MC'; });
      var mT = !mR && !mM && trongCond(function (x) { return x.op === 'match' && /^TF/.test(x.varId); });
      var coAndMember = !mR && !mM && !mT && ifs.some(function (n) { return n.kind === 'if' && dauOp(n.expr, function (x) { return x.op === 'and' && (x.kids || []).some(function (k) { return k.op === 'member'; }); }); });
      if (mR || mM || mT) {
        var x1 = mR ? trongCond(function (x) { return x.op === 'match' && x.vtype === 'identifier'; }) : mM ? trongCond(function (x) { return x.op === 'member' && x.vtype === 'identifier'; }) : trongCond(function (x) { return x.op === 'match' && x.vtype === 'identifier'; });
        var a1 = x1 && (bang[mR ? String(x1.value).trim() : x1.value] || (mR ? timTheoText(String(x1.value).trim()) : null));
        if (!a1) { crash = crash || 'điều kiện tham chiếu phương án không tồn tại'; return; }
        a1.weight = trongSo(luatCua(ifs));
        if (mT) epTF = true;
      } else if (coAndMember) {
        ifs.filter(function (n) { return n.kind === 'if' && n.expr.op === 'and'; }).forEach(function (n) {
          n.expr.kids.filter(function (k) { return k.op === 'member'; }).forEach(function (k) {
            var a = bang[String(k.value).trim()];
            if (a) a.weight = 100;
          });
        });
      } else {
        ifs.forEach(function (n) {
          var x = dauOp(n.expr, function (y) { return y.op === 'match' && y.vtype === 'identifier'; }) || dauOp(n.expr, function (y) { return y.op === 'member' && y.vtype === 'identifier'; });
          if (!x) return;
          var mid = String(x.value).trim();
          var a = bang[mid] || answers.filter(function (z) { return z.text.toLowerCase() === mid.toLowerCase(); })[0];
          if (a) a.weight = trongSo(n.rules);
        });
      }
    });
    if (crash) E('import-crash', 'Ruby sẽ lỗi khi đọc câu này (' + crash + ') → câu thành "Error"');
    var dung = answers.filter(function (a) { return a.weight > 0; });
    var canvasType = epTF ? 'true_false_question' : qt;
    if (!dung.length) E('no-correct', 'Canvas không xác định được đáp án đúng: "The importer couldn\'t determine the correct answers for this question." (choice_interaction.rb#L101-L104)');
    // luật true/false (choice_interaction.rb#L53-L71)
    if (canvasType === 'true_false_question') {
      var t = answers.length === 2 && answers.filter(function (a) { return /true/i.test(a.text); })[0];
      var f = t && answers.filter(function (a) { return a !== t && /false/i.test(a.text); })[0];
      if (!(t && f)) { W('tf-demoted', 'true_false_question không có đúng 2 phương án "True"/"False" → Canvas đổi thành multiple_choice_question (R§2.2; dùng MC Đúng/Sai)'); canvasType = 'multiple_choice_question'; }
    }
    tom.canvasType = canvasType;

    // --- hợp đồng R§2.1 / R§2.3 ---
    var cham = dkChamDiem(it);
    if (qt === 'multiple_answers_question') {
      if (cham.length !== 1) E('ma-score-cond', 'multiple_answers cần đúng một respcondition chấm điểm, có ' + cham.length + ' (R§2.3)');
      var c0 = cham[0];
      if (c0) {
        var ks = c0.cv ? con(c0.cv) : [];
        var andEl = ks.length === 1 && ln(ks[0].name) === 'and' ? ks[0] : null;
        if (!andEl) E('ma-and', 'conditionvar phải chứa đúng một <and> (R§2.3) — nếu không Canvas không thấy "responseIf > and > member"');
        else {
          var phu = {}, dungHD = [], hong = false;
          con(andEl).forEach(function (k) {
            var tk = ln(k.name), ve = null, phuDinh = false;
            if (tk === 'varequal') ve = k;
            else if (tk === 'not' && con(k).length === 1 && ln(con(k)[0].name) === 'varequal') { ve = con(k)[0]; phuDinh = true; }
            if (!ve) { hong = true; return; }
            var v = chu(ve).trim();
            phu[v] = (phu[v] || 0) + 1;
            if (!phuDinh) dungHD.push(v);
          });
          if (hong) E('ma-and-cover', '<and> chỉ được chứa <varequal> (đúng) và <not><varequal/></not> (sai)');
          var thieu = r.labels.filter(function (l) { return !phu[l.identRaw]; }).map(function (l) { return l.identRaw; });
          var lap = Object.keys(phu).filter(function (k) { return phu[k] > 1; });
          var la = Object.keys(phu).filter(function (k) { return !r.labels.some(function (l) { return l.identRaw === k; }); });
          if (thieu.length || lap.length || la.length) E('ma-and-cover', '<and>/<not> phải phủ MỖI phương án đúng một lần' + (thieu.length ? '; thiếu: ' + thieu.join(',') : '') + (lap.length ? '; lặp: ' + lap.join(',') : '') + (la.length ? '; lạ: ' + la.join(',') : ''));
          if (!dungHD.length) E('ma-no-correct', 'multiple_answers cần ≥ 1 phương án đúng (D§5.3)');
          else if (dungHD.length === r.labels.length) W('ma-all-correct', 'Mọi phương án đều đúng (R/exams: cần ít nhất một phương án sai)');
          var mp = dung.map(function (a) { return a.id; }).sort().join(','), hd = dungHD.slice().sort().join(',');
          if (dung.length && mp !== hd) E('ma-sim-mismatch', 'Canvas hiểu đáp án đúng là {' + mp + '} nhưng <and> ghi {' + hd + '}');
        }
        kiemSet100(c0, W);
      }
    } else {
      if (cham.length !== 1) E('mc-score-cond', qt + ' cần đúng một respcondition có setvar SCORE, có ' + cham.length + ' (R§2.1)');
      cham.forEach(function (c) {
        var ks = c.cv ? con(c.cv) : [];
        var ve = ks.length === 1 && ln(ks[0].name) === 'varequal' ? ks[0] : null;
        if (!ve) E('mc-varequal', 'Điều kiện chấm điểm phải là đúng một <varequal> (R§2.1)');
        else {
          if (tt(ve, 'respident') !== r.identRaw) E('respident-mismatch', 'varequal respident="' + tt(ve, 'respident') + '" ≠ ident response "' + r.identRaw + '"');
          if (!r.labels.some(function (l) { return l.identRaw === chu(ve).trim(); })) E('mc-varequal', 'varequal "' + chu(ve).trim() + '" không trỏ tới phương án nào');
        }
        kiemSet100(c, E);
      });
      if (dung.length > 1) E('mc-correct-count', qt + ' có ' + dung.length + ' phương án được coi là đúng (' + dung.map(function (a) { return a.id; }).join(',') + ') — hợp đồng: đúng 1 (D§5.3)');
    }
    tom.correct = { choices: answers.map(function (a) { return { id: a.id, text: a.plain, correct: a.weight > 0 }; }), correct: dung.map(function (a) { return a.id; }) };
    tom.summary = dung.length ? dung.map(function (a) { return a.id + ': ' + rutGon(a.plain, 40); }).join(' | ') : '(không có đáp án đúng)';
    if (canvasType !== qt) tom.summary += '  [Canvas: ' + canvasType + ']';
  }

  function kiemSet100(c, F) {   // F = E (lỗi) hoặc W (cảnh báo) tuỳ loại câu
    var s = c.rules.filter(function (r) { return r.id === 'SCORE'; });
    if (s.length !== 1 || s[0].act !== 'set' || !soDong100(s[0].value))
      F('score-set100', 'Điều kiện chấm điểm phải là <setvar action="Set" varname="SCORE">100</setvar> (R§0 fact 2)' + (s[0] ? ' — đang là action="' + s[0].act + '" giá trị "' + s[0].value + '"' : ''));
  }

  function respStrFib(it, tom, E, ten) {
    var rs = it.responses;
    if (rs.length !== 1 || rs[0].tag !== 'response_str' || !rs[0].render || rs[0].render.tag !== 'render_fib') {
      E(ten + '-structure', tom.type + ' cần đúng một <response_str> + <render_fib> (R§2.4/2.8/2.9); có: ' + (rs.map(function (r) { return r.tag + '/' + (r.render ? r.render.tag : '-'); }).join(', ') || 'không có'));
      return null;
    }
    if (rs[0].fibMaterial) E('fib-material', '<render_fib> vừa có response_label vừa có material → Python tạo textEntryInteraction, Canvas đọc nhầm loại (Q:imsqtiv1.py#L4846-L4851)');
    return rs[0];
  }

  /* --- short answer: Qti::ExtendedTextInteraction (C:…/qti/extended_text_interaction.rb) --- */
  function kiemNgan(it, rp, tom, E, W) {
    var r = respStrFib(it, tom, E, 'short');
    if (!r) return;
    if (r.render.fibtype && !/^string$/i.test(r.render.fibtype)) W('short-fibtype', 'render_fib fibtype="' + r.render.fibtype + '" trong response_str → Python ép về String');
    // mọi stringMatch/match trong mọi responseCondition → đáp án (trùng chữ thì gộp, rỗng thì bỏ)
    var accepted = [];
    moiCond(rp).forEach(function (cnd) {
      ifsCua(cnd).forEach(function (n) {
        duyetExpr(n.expr, function (x) {
          if (x.op !== 'stringMatch' && x.op !== 'match') return;
          var t = x.value;
          if (t === '' || accepted.indexOf(t) >= 0) return;
          accepted.push(t);
        });
      });
    });
    var dungDuoc = accepted.filter(function (t) { return t.trim() !== ''; });
    if (!dungDuoc.length) { E('short-no-answer', 'short_answer không có đáp án không rỗng → Canvas lặng lẽ đổi thành essay_question (extended_text_interaction.rb#L26-L39)'); tom.canvasType = 'essay_question'; }
    accepted.filter(function (t) { return t.trim() === ''; }).forEach(function () { E('short-empty-answer', 'Có varequal chỉ gồm khoảng trắng — không bao giờ khớp'); });
    // hợp đồng R§2.4
    var cham = dkChamDiem(it);
    if (!cham.length) E('short-score-cond', 'Thiếu respcondition chấm điểm (R§2.4)');
    cham.forEach(function (c) {
      var ks = c.cv ? con(c.cv) : [];
      if (!ks.length || ks.some(function (k) { return ln(k.name) !== 'varequal'; })) W('short-shape', 'conditionvar nên chỉ gồm các <varequal> anh em (không bọc <or>) như Canvas (R§2.4)');
      ks.forEach(function (k) { if (ln(k.name) === 'varequal' && tt(k, 'respident') !== r.identRaw) E('respident-mismatch', 'varequal respident="' + tt(k, 'respident') + '" ≠ "' + r.identRaw + '"'); });
      kiemSet100(c, W);
    });
    // biến thể dấu thập phân (R§2.4, D9)
    dungDuoc.forEach(function (t) {
      var s = t.trim();
      if (/^[-−]?\d+,\d+$/.test(s) && dungDuoc.map(function (x) { return x.trim(); }).indexOf(s.replace(',', '.')) < 0) W('short-decimal-twin', 'Đáp án "' + s + '" thiếu biến thể dấu chấm "' + s.replace(',', '.') + '" (R§2.4)');
    });
    var thuong = {};
    dungDuoc.forEach(function (t) { var k = canvasSoSanh(t); if (thuong[k]) W('short-dup', 'Đáp án "' + t + '" trùng (Canvas so sánh không phân biệt hoa thường)'); thuong[k] = 1; });
    tom.correct = { accepted: dungDuoc };
    tom.summary = dungDuoc.map(function (t) { return '"' + t + '"'; }).join(' | ') || '(không có — thành tự luận)';
  }
  function escHtmlRuby(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function canvasSoSanh(s) { return escHtmlRuby(String(s).trim().toLowerCase()); }   // short_answer_question.rb#L36-L47

  /* --- numerical: Qti::NumericInteraction (C:…/qti/numeric_interaction.rb#L55-L113) --- */
  function kiemSo(it, rp, tom, E, W) {
    var rs = it.responses;
    if (rs.length === 1 && rs[0].tag === 'response_num') E('num-response-num', 'numerical dùng <response_num> → Python tạo phép so sánh số thực, Canvas chỉ đọc được một đáp án; phải dùng <response_str> (R§2.8)');
    var r = respStrFib(it, tom, E, 'num');
    if (!r) return;
    var answers = [];
    moiIf(rp).forEach(function (n) {
      var orN = dauOp(n.expr, function (x) { return x.op === 'or'; });
      if (orN) {
        var ex = dauOp(orN, function (x) { return x.op === 'stringMatch'; });
        if (!ex) return;
        var a = { type: 'exact', exact: rubyToF(ex.value), exactRaw: ex.value, margin: 0 };
        var andN = dauOp(orN, function (x) { return x.op === 'and'; });
        if (dauOp(orN, function (x) { return x.op === 'customOperator' && x.cls === 'vargt'; })) W('num-vargt', 'Dùng <vargt> — Canvas có thể hiểu là đáp án "precision" (numeric_interaction.rb#L69-L87); dùng vargte');
        var up = andN && dauOp(andN, function (x) { return x.op === 'customOperator' && x.cls === 'varlte'; });
        var lo = andN && dauOp(andN, function (x) { return x.op === 'customOperator' && x.cls === 'vargte'; });
        if (up) { a.margin = +(rubyToF(up.value) - a.exact).toFixed(12); }
        if (andN && (!up || !lo)) E('num-range-half', 'Trong <or>, <and> phải có đủ <vargte> và <varlte>');
        if (up && lo && Math.abs((a.exact - rubyToF(lo.value)) - a.margin) > 1e-9) W('num-margin-asym', 'Sai số không đối xứng — Canvas chỉ đọc cận trên (varlte − exact)');
        answers.push(a);
      } else {
        var andM = dauOp(n.expr, function (x) { return x.op === 'and'; });
        if (!andM) return;
        var lo2 = dauOp(andM, function (x) { return x.op === 'customOperator' && x.cls === 'vargte'; });
        var up2 = dauOp(andM, function (x) { return x.op === 'customOperator' && x.cls === 'varlte'; });
        if (lo2 || up2) answers.push({ type: 'range', start: lo2 ? rubyToF(lo2.value) : null, end: up2 ? rubyToF(up2.value) : null });
      }
    });
    // hợp đồng R§2.8
    var cham = dkChamDiem(it);
    cham.forEach(function (c) {
      var ks = c.cv ? con(c.cv) : [];
      var ten = ks.map(function (k) { return ln(k.name); });
      if (ten.length === 1 && ten[0] === 'or') {
        var trong = con(ks[0]), tTrong = trong.map(function (k) { return ln(k.name); });
        if (tTrong[0] !== 'varequal' || tTrong.length > 2 || (tTrong.length === 2 && tTrong[1] !== 'and')) E('num-shape', '<or> phải là <varequal> [+ <and><vargte/><varlte/></and>] (R§2.8)');
        if (tTrong.length === 2 && tTrong[1] === 'and') {
          var tA = con(trong[1]).map(function (k) { return ln(k.name); }).sort().join(',');
          if (tA !== 'vargte,varlte') E('num-range-half', '<and> trong <or> phải đúng là <vargte> + <varlte>');
        }
      } else if (ten.indexOf('varequal') >= 0) {
        E('num-exact-no-or', 'Đáp án chính xác không bọc <or> → Canvas bỏ đáp án này (numeric_interaction.rb#L55-L113; R§2.8)');
      } else if (ten.indexOf('vargte') >= 0 || ten.indexOf('varlte') >= 0) {
        if (ten.slice().sort().join(',') !== 'vargte,varlte') E('num-range-half', 'Khoảng phải có đúng một <vargte> và một <varlte> (thiếu cận → Canvas lỗi khi chấm)');
      } else E('num-shape', 'Điều kiện chấm điểm numerical không đúng khuôn (R§2.8)');
      hauDue(c.cv || { children: [] }, ['varequal', 'vargte', 'varlte', 'vargt', 'varlt']).forEach(function (v) {
        if (!RE_SO.test(chu(v).trim())) E('num-value', 'Giá trị "' + chu(v) + '" không phải số dấu chấm (Ruby to_f = ' + rubyToF(chu(v)) + ')');
        if (tt(v, 'respident') !== r.identRaw) E('respident-mismatch', 'respident="' + tt(v, 'respident') + '" ≠ "' + r.identRaw + '"');
        if (ln(v.name) === 'vargt' || ln(v.name) === 'varlt') W('num-vargt', 'Dùng <' + ln(v.name) + '> — R§2.8 chỉ dùng vargte/varlte');
      });
      kiemSet100(c, W);
    });
    answers.forEach(function (a) { if (a.type === 'range' && (a.start == null || a.end == null)) E('num-range-half', 'Đáp án khoảng thiếu cận ' + (a.start == null ? 'dưới' : 'trên') + ' → Canvas lỗi BigDecimal khi chấm'); });
    if (!answers.length) E('num-no-answer', 'Canvas không đọc được đáp án nào cho numerical_question');
    tom.correct = { answers: answers.map(function (a) { return a.type === 'exact' ? { type: 'exact', exact: a.exact, margin: a.margin } : { type: 'range', start: a.start, end: a.end }; }) };
    tom.summary = answers.map(function (a) { return a.type === 'exact' ? a.exact + (a.margin ? ' ± ' + a.margin : '') : '[' + a.start + '; ' + a.end + ']'; }).join(' | ') || '(không có)';
  }

  function kiemTuLuan(it, rp, tom, E, W) {
    var r = respStrFib(it, tom, E, 'essay');
    if (!r) return;
    var co1 = false;
    it.conds.forEach(function (c) { duyetExpr(c.expr, function (x) { if (x.op === 'stringMatch' || x.op === 'match') co1 = true; }); });
    if (co1) W('essay-has-answers', 'essay_question có varequal — Canvas vẫn giữ là tự luận nhưng ghi thêm đáp án');
    tom.correct = null; tom.summary = '(tự luận — giáo viên chấm)';
  }

  function kiemVanBan(it, rp, tom, E, W) {
    if (it.responses.length) W('text-has-response', 'text_only_question không nên có response_*');
    if (it.rpCount) W('text-has-resprocessing', 'text_only_question không có <resprocessing> (R§2.10)');
    tom.correct = null; tom.summary = '(chỉ văn bản)';
  }

  /* --- FIMB / dropdowns: Qti::FillInTheBlank#process_canvas (C:…/qti/fill_in_the_blank.rb#L81-L107) --- */
  function kiemO(it, rp, tom, E, W, stemHtml) {
    var dd = tom.type === 'multiple_dropdowns_question';
    var rs = it.responses;
    if (!rs.length) { E('blank-structure', tom.type + ' cần ≥ 1 <response_lid>'); return; }
    if (rs.some(function (r) { return r.tag !== 'response_lid' || !r.render || r.render.tag !== 'render_choice'; }))
      E('blank-structure', tom.type + ': mọi response phải là <response_lid> + <render_choice>' + (rs.some(function (r) { return r.tag === 'response_str'; }) ? ' — có response_str → Canvas đi nhánh D2L (fill_in_the_blank.rb#L41-L42)' : ''));
    var blanks = [], theoId = {};
    rs.forEach(function (r) {
      if (r.tag !== 'response_lid') return;
      var m = /^response_(.+)$/.exec(r.py);   // gsub(/^response_/) — phân biệt hoa thường
      var bid = m ? m[1] : r.py;
      if (!m) E('blank-lid-ident', 'ident "' + r.identRaw + '" phải là response_<id> (chữ thường) để Canvas tách ra id ô (fill_in_the_blank.rb#L84-L86)');
      else if (!/^[a-z][a-z0-9_]{0,15}$/.test(bid)) W('blank-id', 'id ô "' + bid + '" không khớp ^[a-z][a-z0-9_]{0,15}$ (R§2.0)');
      if (theoId[bid]) E('blank-dup', 'id ô "' + bid + '" lặp');
      var b = { id: bid, r: r, labels: r.labels };
      theoId[bid] = b; blanks.push(b);
      var n = soLanXuatHien(stemHtml, '[' + bid + ']');
      if (n !== 1) E('blank-count', '"[' + bid + ']" xuất hiện ' + n + ' lần trong đề — phải đúng 1 lần (Canvas chỉ thay lần đầu, C:app/models/quizzes/quiz_question_builder.rb#L146-L189)');
      if (r.card !== 'single') W('blank-rcardinality', 'response_lid "' + r.identRaw + '" nên là rcardinality="Single"');
      if (!r.labels.length) E(dd ? 'dd-few-options' : 'fimb-no-accept', 'Ô "' + bid + '" không có phương án/đáp án nào');
      if (dd && r.labels.length === 1) E('dd-few-options', 'Ô chọn "' + bid + '" cần ≥ 2 lựa chọn (D§5.3)');
      var txt = {};
      r.labels.forEach(function (l) {
        kiemTextThuan(l, E, W, (dd ? 'Lựa chọn' : 'Đáp án') + ' ô ' + bid);
        if (!l.textStrip) E(dd ? 'dd-empty-option' : 'fimb-empty-accept', (dd ? 'Lựa chọn' : 'Đáp án') + ' rỗng ở ô "' + bid + '"' + (dd ? '' : ' — ô bỏ trống sẽ được chấm ĐÚNG'));
        var k = l.textStrip.toLowerCase();
        if (txt[k]) W('blank-dup-text', 'Ô "' + bid + '" có hai ' + (dd ? 'lựa chọn' : 'đáp án') + ' trùng chữ "' + l.textStrip + '"');
        txt[k] = 1;
      });
    });
    // ident phương án phải duy nhất TOÀN câu: answer_hash chỉ khoá theo identifier (fill_in_the_blank.rb#L95, #L103-L105)
    var dem = {};
    rs.forEach(function (r) { r.labels.forEach(function (l) { if (l.py) dem[l.py] = (dem[l.py] || 0) + 1; }); });
    Object.keys(dem).forEach(function (k) {
      if (dem[k] < 2) return;
      if (dd) E('label-dup', 'ident phương án "' + k + '" dùng ở nhiều ô — Canvas gộp theo ident nên đáp án đúng bị gán nhầm ô');
      else W('label-dup', 'ident phương án "' + k + '" dùng ở nhiều ô — Canvas FIMB không hỏng nhưng R§2.0 yêu cầu duy nhất trong câu');
    });

    // mô phỏng Ruby
    var answers = [];
    blanks.forEach(function (b) { b.labels.forEach(function (l) { answers.push({ blank: b.id, id: l.identRaw, py: l.py, text: l.textStrip, weight: dd ? 0 : 100 }); }); });
    var bang = {}; answers.forEach(function (a) { bang[a.py] = a; });
    if (dd) {
      moiIf(rp).forEach(function (n) {
        if (!coSum(n.rules)) return;
        var x = dauOp(n.expr, function (y) { return y.op === 'match' && y.vtype === 'identifier'; });
        if (!x) { E('import-crash', 'Điều kiện có setvar Add nhưng không có varequal → Ruby lỗi nil.text, câu thành "Error" (fill_in_the_blank.rb#L101-L104)'); return; }
        var a = bang[x.value];
        if (a) a.weight = 100;
      });
    }
    // hợp đồng: mỗi ô một respcondition varequal respident=response_<id> + setvar Add (R§2.5, R§2.6)
    var addTheoO = {}, setTheoO = {};
    it.conds.forEach(function (c) {
      var ves = c.cv ? hauDue(c.cv, 'varequal') : [];
      var add = c.rules.filter(function (x) { return x.id === 'SCORE' && x.op === 'sum'; });
      var set = c.rules.filter(function (x) { return x.id === 'SCORE' && x.op !== 'sum'; });
      ves.forEach(function (v) {
        var rid = tt(v, 'respident'), b = blanks.filter(function (z) { return z.r.identRaw === rid; })[0];
        if (!b) return;
        if (set.length && !setTheoO[b.id]) {
          setTheoO[b.id] = 1;
          E(dd ? 'dd-set' : 'fimb-add', 'Ô "' + b.id + '": setvar action="' + set[0].act + '" — phải là Add' + (dd ? ', với Set Canvas không thấy đáp án đúng (fill_in_the_blank.rb#L99-L107)' : ' (R§2.5)'));
        }
        if (add.length) {
          addTheoO[b.id] = (addTheoO[b.id] || 0) + 1;
          if (!b.labels.some(function (l) { return l.identRaw === chu(v).trim(); })) W('blank-varequal', 'Ô "' + b.id + '": varequal "' + chu(v).trim() + '" không phải phương án của ô này');
        }
      });
    });
    blanks.forEach(function (b) {
      if (!addTheoO[b.id]) {
        if (!setTheoO[b.id]) E(dd ? 'dd-add' : 'fimb-add', 'Ô "' + b.id + '" thiếu respcondition varequal respident="' + b.r.identRaw + '" + <setvar action="Add" varname="SCORE"> (R§2.' + (dd ? '6' : '5') + ')');
      } else if (addTheoO[b.id] > 1) (dd ? E : W)(dd ? 'dd-correct-count' : 'fimb-add-multi', 'Ô "' + b.id + '" có ' + addTheoO[b.id] + ' điều kiện Add');
    });
    // kết quả
    var out = {};
    blanks.forEach(function (b) {
      var cua = answers.filter(function (a) { return a.blank === b.id; });
      if (dd) {
        var dung = cua.filter(function (a) { return a.weight === 100; });
        if (dung.length !== 1 && cua.length) E('dd-correct-count', 'Ô chọn "' + b.id + '": Canvas thấy ' + dung.length + ' lựa chọn đúng — phải đúng 1 (D§5.3)');
        out[b.id] = { options: cua.map(function (a) { return { id: a.id, text: a.text }; }), correct: dung.length ? dung[0].id : null };
      } else out[b.id] = cua.map(function (a) { return a.text; });
    });
    tom.correct = { blanks: out };
    tom.summary = blanks.map(function (b) {
      if (dd) { var o = out[b.id], c = o.options.filter(function (x) { return x.id === o.correct; })[0]; return b.id + '=' + (c ? '"' + c.text + '"' : '?'); }
      return b.id + '=' + out[b.id].map(function (t) { return '"' + t + '"'; }).join('/');
    }).join('; ');
  }

  /* --- matching: Qti::AssociateInteraction canvas_matching (C:…/qti/associate_interaction.rb#L112-L150) --- */
  function kiemGhep(it, rp, tom, E, W) {
    var rs = it.responses;
    if (!rs.length || rs.some(function (r) { return r.tag !== 'response_lid' || !r.render || r.render.tag !== 'render_choice'; })) {
      E('match-structure', 'matching_question: mọi response phải là <response_lid> + <render_choice> (R§2.7)');
      if (!rs.length) return;
    }
    if (rs.length < 2) E('match-few', 'Ghép nối cần ≥ 2 cặp (D§5.3), có ' + rs.length);
    var dau0 = rs[0];
    // vế phải chỉ đọc từ lid ĐẦU TIÊN
    var matches = dau0.labels.map(function (l) {
      var m = /(\d+)/.exec(l.py || '');
      return { id: l.identRaw, py: l.py, matchId: m ? parseInt(m[1], 10) : null, text: l.textStrip, plain: l.plain };
    });
    var demSo = {};
    matches.forEach(function (m) {
      if (m.matchId == null) W('match-no-digit', 'ident vế phải "' + m.id + '" không có chữ số → Canvas gán id ngẫu nhiên (R§2.0: dùng số nguyên)');
      else { if (demSo[m.matchId]) E('match-digit-run', 'Dãy số đầu tiên trong ident vế phải "' + m.id + '" (' + m.matchId + ') trùng với "' + demSo[m.matchId] + '" → hai vế phải bị coi là một (associate_interaction.rb#L117-L121)'); demSo[m.matchId] = m.id; }
    });
    var chuKy = function (r) { return r.labels.map(function (l) { return l.identRaw + '\u0001' + l.raw; }).join('\u0002'); };
    rs.forEach(function (r, i) {
      if (i > 0 && chuKy(r) !== chuKy(dau0)) E('match-right-list', 'response "' + r.identRaw + '" có danh sách vế phải khác response đầu — Canvas chỉ đọc danh sách ở lid đầu tiên (R§2.7)');
      if (!r.prompt.length || !r.prompt.map(function (m) { return m.text; }).join('').trim()) E('match-left-missing', 'response "' + r.identRaw + '" thiếu vế trái (material trước render_choice)');
      if (r.card !== 'single') W('blank-rcardinality', 'response_lid "' + r.identRaw + '" nên là rcardinality="Single"');
    });
    dau0.labels.forEach(function (l) { kiemTextThuan(l, E, W, 'Vế phải ' + l.identRaw); if (!l.textStrip) E('match-empty-right', 'Vế phải ' + l.identRaw + ' rỗng'); });
    // mô phỏng get_canvas_answers
    var matchMap = {}; matches.forEach(function (m) { if (m.py) matchMap[m.py] = m; });
    var ansMap = {}, answers = rs.map(function (r) {
      var leftRaw = r.prompt.map(function (m) { return m.text; }).join('');
      var a = { leftId: r.identRaw, py: r.py, left: r.prompt.some(laHtml) ? chuThuan(leftRaw) : leftRaw.trim(), matchId: null, right: null, rightId: null };
      ansMap[r.py] = a;
      return a;
    });
    moiIf(rp).forEach(function (n) {
      var mm = dauOp(n.expr, function (y) { return y.op === 'match'; });
      if (!mm) return;
      var a = ansMap[mm.varId];
      if (!a) return;
      if (coSum(n.rules) && mm.vtype === 'identifier' && matchMap[mm.value]) { a.matchId = matchMap[mm.value].matchId; a.rightPy = mm.value; }
    });
    answers.forEach(function (a) {
      var m = a.matchId != null ? matches.filter(function (x) { return x.matchId === a.matchId; })[0] : null;
      if (m) { a.right = m.plain; a.rightId = m.id; }
    });
    // hợp đồng: mỗi vế trái một varequal + Add
    rs.forEach(function (r) {
      var cs = it.conds.filter(function (c) { return c.cv && hauDue(c.cv, 'varequal').some(function (v) { return tt(v, 'respident') === r.identRaw; }) && c.rules.some(function (x) { return x.id === 'SCORE'; }); });
      if (cs.some(function (c) { return c.rules.some(function (x) { return x.id === 'SCORE' && x.op !== 'sum'; }); })) E('match-add', 'Vế trái "' + r.identRaw + '": setvar phải là action="Add" (Set → Canvas không ghi nhận cặp, associate_interaction.rb#L146-L148)');
    });
    answers.forEach(function (a) { if (a.matchId == null) E('match-left-unmatched', 'Vế trái "' + a.leftId + '" không có vế phải đúng theo cách Canvas đọc (cần varequal tới ident vế phải + setvar Add)'); });
    var dungIds = {}; answers.forEach(function (a) { if (a.rightId) dungIds[a.rightId] = 1; });
    var nhieu = matches.filter(function (m) { return !dungIds[m.id]; }).map(function (m) { return m.plain; });
    tom.correct = { pairs: answers.map(function (a) { return { leftId: a.leftId, left: a.left, rightId: a.rightId, right: a.right }; }),
      rights: matches.map(function (m) { return { id: m.id, text: m.plain, matchId: m.matchId }; }), distractors: nhieu };
    tom.summary = answers.map(function (a) { return rutGon(a.left, 25) + ' → ' + (a.right != null ? rutGon(a.right, 25) : '?'); }).join('; ') + (nhieu.length ? '  (nhiễu: ' + nhieu.join(', ') + ')' : '');
  }

  /* ===================== mô phỏng chấm điểm Canvas Classic (R§2.11) ===================== */
  // item: phần tử của banks[].items; response theo loại:
  //   mc/tf: id phương án | ma: [id…] | short/num: chuỗi | fimb: {idÔ: chuỗi} | dropdowns: {idÔ: idLựaChọn}
  //   matching: {identVếTrái: identVếPhải}. Trả null với essay/text_only (chấm tay) hoặc khi không trả lời.
  function grade(item, response) {
    var t = item && item.canvasType, c = item && item.correct, pts = item && item.points != null ? item.points : 1;
    if (!c || response == null) return null;
    function kq(dung, tong, sai) {
      var s = tong ? dung / tong * pts : 0;
      if (sai) { s -= sai / tong * pts; if (s < 0) s = 0; }
      return { score: +s.toFixed(10), correctParts: dung, totalParts: tong, incorrectParts: sai || 0 };
    }
    if (t === 'multiple_choice_question' || t === 'true_false_question') return kq(c.correct.indexOf(String(response)) >= 0 ? 1 : 0, 1);
    if (t === 'multiple_answers_question') {   // multiple_answers_question.rb#L22-L58: đúng − sai, chia số đáp án đúng
      var chon = (Array.isArray(response) ? response : [response]).map(String);
      if (!chon.length) return null;
      var d = 0, s2 = 0;
      c.choices.forEach(function (o) { if (chon.indexOf(o.id) >= 0) { if (o.correct) d++; else s2++; } });
      return kq(d, Math.max(c.correct.length, 1), s2);
    }
    if (t === 'short_answer_question') {
      var u = canvasSoSanh(response);
      return kq(c.accepted.some(function (a) { return a.trim() !== '' && canvasSoSanh(a) === u; }) ? 1 : 0, 1);
    }
    if (t === 'numerical_question') {   // numerical_question.rb: bỏ dấu phân cách nghìn rồi đổi dấu thập phân (locale vi: "," là phân cách nghìn!)
      if (String(response).trim() === '') return kq(0, 1);
      var raw = String(response).replace(/,/g, '');
      var x = RE_SO.test(raw.trim()) ? parseFloat(raw) : 0;
      var ok = c.answers.some(function (a) {
        if (a.type === 'exact') return x >= a.exact - Math.abs(a.margin || 0) - 1e-12 && x <= a.exact + Math.abs(a.margin || 0) + 1e-12;
        var lo = Math.min(a.start, a.end), hi = Math.max(a.start, a.end);
        return x >= lo - 1e-12 && x <= hi + 1e-12;
      });
      return kq(ok ? 1 : 0, 1);
    }
    if (t === 'fill_in_multiple_blanks_question' || t === 'multiple_dropdowns_question') {
      var ids = Object.keys(c.blanks), d2 = 0, coTraLoi = false;
      ids.forEach(function (b) {
        var v = response[b];
        if (v != null && String(v).trim() !== '') coTraLoi = true;
        if (t === 'multiple_dropdowns_question') { if (v != null && String(v) === String(c.blanks[b].correct)) d2++; }
        else if (c.blanks[b].some(function (a) { return a.trim().toLowerCase() === String(v == null ? '' : v).trim().toLowerCase(); })) d2++;
      });
      if (!coTraLoi) return null;
      return kq(d2, ids.length);
    }
    if (t === 'matching_question') {   // matching_question.rb#L22-L46: đúng nếu cùng match_id hoặc cùng chữ vế phải
      var d3 = 0, coTL = false;
      c.pairs.forEach(function (p) {
        var chonId = response[p.leftId];
        if (chonId == null || chonId === '') return;
        coTL = true;
        var r = c.rights.filter(function (x) { return x.id === String(chonId); })[0];
        if (!r) return;
        var ghep = c.pairs.filter(function (q) { return q.rightId != null && c.rights.some(function (x) { return x.id === q.rightId && x.matchId === r.matchId; }); })[0];
        if (ghep === p || (ghep && ghep.right != null && ghep.right === p.right)) d3++;
      });
      if (!coTL) return null;
      return kq(d3, c.pairs.length);
    }
    return null;
  }

  /* ===================== báo cáo ===================== */
  function formatReport(kq) {
    var dong = [];
    dong.push('Bố cục: ' + kq.layout + ' — ' + kq.stats.items + ' câu, ' + kq.errors.length + ' lỗi, ' + kq.warnings.length + ' cảnh báo');
    function inItems(items) {
      items.forEach(function (it) {
        var loai = it.type || '?';
        if (it.canvasType && it.canvasType !== it.type) loai += ' → ' + it.canvasType;
        dong.push('    ' + (it.ident || '?') + '  [' + loai + ', ' + it.points + 'đ]  ' + (it.title || '') + '\n        đúng: ' + it.summary);
      });
    }
    kq.banks.forEach(function (b) { dong.push('  Ngân hàng "' + b.title + '" (ident ' + b.ident + ', ' + b.file + ') — ' + b.items.length + ' câu'); inItems(b.items); });
    kq.quizzes.forEach(function (q) {
      dong.push('  Bài kiểm tra "' + q.title + '" (ident ' + q.ident + ', ' + q.file + ') — ' + q.items.length + ' câu' + (q.metaPath ? ', meta ' + q.metaPath : '') + (q.groups.length ? ', ' + q.groups.length + ' nhóm' : ''));
      inItems(q.items);
    });
    function inLoi(ds, nhan) {
      if (!ds.length) return;
      dong.push(nhan + ' (' + ds.length + '):');
      ds.forEach(function (e) { dong.push('  [' + e.code + '] ' + (e.file ? e.file + (e.item ? ' #' + e.item : '') + ': ' : '') + e.msg); });
    }
    inLoi(kq.errors, 'LỖI');
    inLoi(kq.warnings, 'Cảnh báo');
    dong.push(kq.ok ? 'KẾT LUẬN: ĐẠT (không có lỗi)' : 'KẾT LUẬN: HỎNG (' + kq.errors.length + ' lỗi)');
    return dong.join('\n');
  }

  async function checkZip(u8, opts) {
    if (!zipMod || typeof zipMod.readZip !== 'function') throw new Error('Thiếu js/zip.js (readZip)');
    var files = await zipMod.readZip(u8);
    return checkPackage(files, opts);
  }

  return {
    checkPackage: checkPackage, checkZip: checkZip, grade: grade, formatReport: formatReport,
    // tiện ích để test / đối chiếu
    pyIdent: pyIdent, pyItemIdent: pyItemIdent, kiemXml: kiemXml, kiemHtml: kiemHtml,
    SUPPORTED_TYPES: LOAI_HO_TRO.slice()
  };
});

/* ===================== CLI ===================== */
if (typeof module === 'object' && module.exports && typeof require === 'function' && require.main === module) {
  (async function () {
    var fs = require('fs'), path = require('path');
    var args = process.argv.slice(2), json = args.indexOf('--json') >= 0;
    var layout = (args.filter(function (a) { return /^--layout=/.test(a); })[0] || '').split('=')[1];
    var f = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
    if (!f) { console.log('Dùng: node tests/kiem-qti.cjs <goi.zip | thư-mục> [--json] [--layout=classic|itembank]'); process.exit(2); }
    var api = module.exports, kq;
    try {
      if (fs.statSync(f).isDirectory()) {
        var files = {};
        (function di(d, tien) {
          fs.readdirSync(d).forEach(function (t) {
            var p = path.join(d, t);
            if (fs.statSync(p).isDirectory()) di(p, tien + t + '/'); else files[tien + t] = new Uint8Array(fs.readFileSync(p));
          });
        })(f, '');
        kq = api.checkPackage(files, { layout: layout });
      } else kq = await api.checkZip(new Uint8Array(fs.readFileSync(f)), { layout: layout });
    } catch (e) { console.error('Không đọc được "' + f + '": ' + (e && e.message || e)); process.exit(2); }
    console.log(json ? JSON.stringify(kq, null, 2) : api.formatReport(kq));
    process.exitCode = kq.ok ? 0 : 1;
  })();
}
