# Extractor spec for our SCORM packages (10 zips, 7 data formats)

All 10 packages extract cleanly. Every answer was checked against its own options, keys, lists or segments, and 0 failed. 9 of the 10 have distinct content: `NSHM_K2_TA_DGNL_T01_2025-2026_SCORM12_CAP_NHAT_PIN` differs from `NSHM_K2_TA_DGNL_T01_2025-2026_SCORM12` only at line 130 (`TEACHER_PIN`), and the images are byte-identical.

Two packages have problems of their own, before any Canvas conversion (details in §5):
- **K2_TIENGANH_DGNL_T01_MD01, Q36–40:** students cannot be marked right. The answer box allows 14 characters and the answers are 21–42 characters long.
- **NSHM_TOAN_LOP2, Q7:** the triangle figure needs the package's CSS. Without it the shape draws as a solid black block.

## Files written
- **Extractor:** `C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-Downloads-PM-chamthidua/dc508171-525f-4c6b-95a3-99cccd19d826/scratchpad/extract2.cjs`
  - `node extract2.cjs <dir|index.html|.zip> [out.json]`, or `node extract2.cjs --all <corpusDir>`.
  - It reads `.zip` files directly (tested: same output as reading the unzipped folder).
- **Analysis helpers (same scratchpad folder):** `analyse.cjs` (summary and field catalogue), `html-constructs.cjs` (catalogue of HTML inside question text), `css-rules.cjs` (looks up the CSS rules for a class).
- **Unzipped packages:** `.../scratchpad/corpus/<zipname>/`
- **Decoded JSON:** `.../scratchpad/corpus/<zipname>.json`, one per zip:
  - `K10_IELTS_READING_DGNL_T07_SCORM.json`
  - `K12_HOAHOC_DGNL_T07_MD0301_SCORM.json`
  - `K2_TIENGANH_DGNL_T01_MD01_SCORM.json`
  - `K4_TA_DE THI THANG 01_SCORM.json`
  - `NSHM_K2_TA_DGNL_T01_2025-2026_SCORM12.json`
  - `NSHM_K2_TA_DGNL_T01_2025-2026_SCORM12_CAP_NHAT_PIN.json`
  - `NSHM_TOAN_LOP2_PHIEU_BAI_CUOI_TUAN_SCORM12.json`
  - `THPT_HSA2025_TIENGANH_SCORM.json`
  - `THPT_HSA2025_TOAN_SCORM.json`
  - `THPT_HSA2025_VAN_SCORM.json`

**JSON schema:** `{source, variant, dataRegion, encrypted, nKeys, decryptedAnsFields, meta{htmlTitle, manifestTitles, manifestId}, EXAM, PARTS, images{referenced[{src,exists,usedAt}], missing, unreferenced}, grading, css{classes, tags, rootVars}, raw, warnings}`
- `EXAM`/`PARTS` are converted into the current template's structure, with every `ans` replaced by the real answer.
- `raw` keeps the package's original variables, with PINs replaced by `***`.

**How the extractor finds the data:**
- In the newer template it takes the text between the "PHẦN 1/2" comment and the comment containing "HẾT PHẦN SỬA. PHẦN 2/2".
  - K2 MD01 also has "HẾT PHẦN SỬA" at line 429, inside the opening comment, so cutting at the first occurrence would be wrong.
- Every other package is cut at `^var SCORM =`, which all formats have right after their data.
- The cut-out code runs in Node's `vm` sandbox. For Toán lớp 2, the separate `function visualHTML(q)` is also cut out and run, so each question's figure HTML is captured.

**How decryption works** (the template's `DA()`, template `index.html:575-586`):
- Each byte of `base64(_KX)` is XOR'd with `_KM.charCodeAt(i % len)` and with `((i*31)&0xff)`, then decoded as UTF-8 JSON to get `KEYS`.
- Any `ans` that is a number becomes `KEYS[ans]`. The extractor does this at any depth: question, true/false statement, multi-answer group, example.
- `_KM` follows the pattern `"nshm." + EXAM.code + ".50"`, e.g. `nshm.HSA-TOAN.50`. In the ANH package the code in the key is `HSA-ANH`.
- In all 3 HSA packages the indices run 0..49 in question order (checked).
- Example `KEYS` from TOÁN: `[["25"],"B",["5575"],["5"],"C","B",["4"],"B",["8/3","2,67","2.67","2,666","2,6667"],"A",…]`

## The 7 data formats found
| Format | Packages | Variables in the data block | Notes |
|---|---|---|---|
| `tpl-enc` | HSA TOÁN/VĂN/TIẾNG ANH | `EXAM, LOCK, _KM, _KX, PARTS` | `PARTS` is one line of JSON (23–37 KB). Engine is the same as the current template (diff only in the `<head>`). |
| `tpl-plain` | K2_TIENGANH MD01 | `EXAM, LOCK, PARTS` | Older template: no shuffling, no `DA()`, answers in plain text. |
| `ielts-v0` | K10 IELTS | `EXAM_INFO, EXAM_LOCK, TFNG, PASSAGES[{no,range,title,sub,intro,paras,groups}]` | Type `choice` means single-answer multiple choice. Uses template literals. No title variable; the title comes from `<title>`. |
| `thpt-v0` | K12 Hoá | `EXAM_INFO{…,ptI,ptII,ptIII}, EXAM_LOCK, PARTS[{key,label,short,sub,note,points,type,items}], ATOM_INFO` | Type is set per part and there are no groups. Points come from `ptI`/`ptII`/`ptIII`. |
| `k4-v0` | K4 TA | `EXAM_INFO, EXAM_LOCK, EXERCISES[{roman,no,type,points,instr,sub,example,bank,text,items}]` | Types: `mcq`, `mcq3`, `bank`, `mistake`, `cloze`. Question text is **plain text** (the engine escapes it), except `cloze.text`, which is HTML. Extra accepted answers are in `alt[]`. |
| `kid-adv` | NSHM_K2_TA (2 copies) | `EXAM_INFO, TEACHER_PIN, PARTS[{id,icon,short,title,subtitle,type,…}]` | Types: `imageChoice`, `match`, `letterMatch`, `choice`, `reading`, `yesno`, `order`. Prompt text is plain. |
| `kid-math` | NSHM_TOAN_LOP2 | `QUESTIONS[{n,type:choice\|input,prompt,options,answer,unit,visual}]` | `answer` is the option's **text**, not a letter. The figure is built by code from `visualHTML(q)`. |

## 1. Per package
| Package (format) | Title | Questions by type (original → converted) | Scoring | Shuffle | Encrypted |
|---|---|---|---|---|---|
| K10 IELTS (`ielts-v0`) | IELTS Reading — Đánh giá năng lực tháng 07; 60 min | 40: flow 6, choice→mcq 7 (true/false/not given 7–10, A–D 11–13), letters 12 (14–20, 33–37), multi 2 (21–22, one group), gap 7 (23–26, 38–40), select 6 (27–32); 3 passages | 1 point each, max 40, pass 20, `showBand:true` | none (engine has none) | no |
| K12 Hoá (`thpt-v0`) | Hóa học 12 … (Mã đề 0301); 50 min | 28: mcq 18, tf 4 (4 statements each), short 6 | `ptI`=0.25, `ptIII`=0.25, `ptII` ladder `[0,0.1,0.25,0.5,1]`; max 10, pass 5 | none | no |
| K2 TA MD01 (`tpl-plain`) | BÀI KIỂM TRA ĐGNL ĐẦU VÀO THÁNG 1; code "01"; 40 min | 40: mcq 25 (5 with image options `pics`, 10 grammar, 5 cloze on the passage, 5 Yes/No), bank 5, letters 5, short 5 | `perItem` 1, short `perItem:2`; max 45, pass 22.5 | none | no |
| K4 TA (`k4-v0`) | Tiếng Anh 4.0 — Đề thi tháng 01; 40 min | 30: mcq 13 + mcq3 5 + cloze 5 (→ mcq 23), bank 5, mistake 2 | 1 point each (`points` = number of questions in the exercise), max 30, pass 15 | none | no |
| NSHM K2 TA ×2 (`kid-adv`) | English Adventure - Tiếng Anh lớp 2; 40 min | 40: imageChoice 5, match 5 (→bank), letterMatch 5 (→letters), choice 10, reading 5, yesno 5 (→mcq), order 5 | 1 point; `order` 2 points = 0.5 × chunks in the right position; max 45, pass 22.5 | none | no |
| NSHM Toán L2 (`kid-math`) | Phiếu bài tập cuối tuần - Toán lớp 2; no timer | 10: choice 6 (→mcq), input 4 (→short) | 1 point each, max 10, no pass score | none | no |
| HSA TIẾNG ANH (`tpl-enc`) | ĐỀ THAM KHẢO ĐGNL HSA 2025 / TIẾNG ANH; 60 min | 50 mcq (601–650), 11 groups | `perItem` 1, max 50, pass 25, `pickBest:null`, `tfLadder` default (unused) | `{cauHoi,phuongAn,nhom}` all true; `giuThuTu` on the cloze group | yes (50 keys) |
| HSA TOÁN (`tpl-enc`) | … TOÁN HỌC VÀ XỬ LÍ SỐ LIỆU; 75 min | 50: mcq 37, short 13, in 21 groups (mostly unheaded runs of one type) | `perItem` 1, max 50, pass 25 | all true | yes (50) |
| HSA VĂN (`tpl-enc`) | … NGÔN NGỮ · VĂN HỌC; 60 min | 50 mcq (51–100), 9 groups | `perItem` 1, max 50, pass 25 | all true | yes (50) |

- No per-question `pt` override is used anywhere.
- No `giuPhuongAn` or `giuViTri` is used, and every `pickBest` is null. The engine supports all of them (template `index.html:621-649, 699-724`).
- Recomputed maximum score equals `maxScore` in all 10.

## 2. Every field used (EXAM / PART / GROUP / ITEM)
These are the template's own field names. Fields that exist only in the older formats are shown as old name → converted name.

**EXAM**
- `title` "ĐỀ THAM KHẢO ĐÁNH GIÁ NĂNG LỰC HSA 2025"
- `org` "TRƯỜNG TIỂU HỌC, THCS & THPT NGÔI SAO HOÀNG MAI"
- `subtitle` "TOÁN HỌC VÀ XỬ LÍ SỐ LIỆU | 50 CÂU"
- `code` "HSA-TOAN"
- `minutes` 75
- `maxScore` 50
- `passScore` 22.5
- `pickBest` null
- `pickBestNote` ""
- `showAnswers` false
- `showBand` false
- `scormScale` "percent"
- `statusMode` "completed"
- `tfLadder` [0,0.1,0.25,0.5,1]
- `shuffle` {cauHoi,phuongAn,nhom}
- `note` "Nguồn đề: <b>Đề thi tham khảo HSA 2025</b> — …"
- `rules` [html strings]
- `LOCK` {enabled, pin, pinHash, blockShortcuts, graceMs, warnLimit}
- Older formats: `EXAM_INFO.ptI/ptII/ptIII` (K12), `ATOM_INFO` → `EXAM.note` "Cho nguyên tử khối …", `TEACHER_PIN`.

**PART**
- `label` "PHẦN I", `sub` "Trắc nghiệm nhiều phương án lựa chọn", `note` "Thí sinh trả lời từ câu 1 đến câu 18…", `points` "4,5 điểm"
- `passage` {head "READING PASSAGE 1", title "…", sub "…", intro "You should spend about 20 minutes…", paras [{k:"A", t:"An ingenious invention…"}]}
- Older formats: `key` "I", `short` "Phần I", part-level `type` (K12); `id`, `icon` "🔤", `title`, `subtitle`, `readingTitle` "…", `image` "images/dog.jpg", `passage` (HTML string) (kid-adv); `roman` "I. PHONETICS", `no` (K4).

**GROUP**
- `head` "Câu 48 – 50"
- `instr` ["Dựa vào thông tin cung cấp dưới đây để trả lời các câu hỏi từ 48 đến 50."]
- `type`, `perItem` 0.25
- `pre` `<p style="margin:0 0 14px">…`
- `one` true, `cols` 3, `pics` true, `giuThuTu` true
- `opts` shared by all questions: strings ["Yes","No"] or {k,t} `TFNG [{k:"TRUE",t:"TRUE"},…]`
- `example`:
  - mcq: {q:"<b>0.</b> … ________ …", opts:["do","doesn’t","don’t"], ans:"B"}
  - bank: {q, ans:"…"}
  - select: {label:"Paragraph A", ans:"ix"}
- flow: `title` "…"; `steps` [{html:"<b>Step one:</b> … {{1}} …"}, {arrow:"…"}]
- gap: `lines` ["… {{23}} …"]
- bank: `bank` ["…","…",…]
- letters: `keys` ["A",…,"G"]; `people` [{k:"A",t:"<tên>"}]
- select: `listTitle` "List of Headings"; `list` [{k:"i",t:"<tiêu đề>"}]
- multi: `pick` 2, `nums` [21,22], group-level `ans` ["…","…"], `opts` [{k:"A",t:"…"}…]
- Added by the conversion: `points` (K4); `bankImg`/`exactMatch`/`exampleKey` (kid-adv); `partial` (order); `_origType`.

**ITEM**
- `n` 601, `q`
- `opts` as strings (`C<sub>2</sub>H<sub>4</sub>.`) or {k,t}
- `ans`: letter "B"; text "NOT GIVEN"/"ix"; string array ["8/3","2,67","2.67","2,666","2,6667"]
- `img` "images/c10.png", `imgClass` "tall" | "wide" | "wide ultra"
- `table` `<div class="scrollx"><table class="mini" style="min-width:430px">…`
- `q2` "Khẳng định nào sau đây về số cực trị…"
- `hint` "nhập phân số dạng a/b, hoặc số thập phân"
- `one` true
- `sub` [{k:"a", ans:"Đ", t:"<phát biểu a>…"}]
- `seg` [{t:"You "},{t:"must",k:"A"},…]
- Older formats: `alt` ["…"] (K4); `prompt`, `opts[{k,img}]`, `cue` "…", `img`, `target` ["a","b","c","d"], `chunks` [{id:"c",t:"…"}] (kid-adv order); `options`, `answer` "60", `unit` "viên bi", `visual` "triangle" (kid-math; converted to `table` = figure HTML plus `ansText`).

## 3. HTML inside question text (counts across the 9 distinct packages)
**Tags**
- `i` 343, `b` 170, `sub` 107 (K12, TOÁN), `sup` 51, `div` 77, `br` 66, `span` 40, `td` 46, `th` 25, `tr` 13, `table` 6, `p` 24, `img` 42 (K2MD01, kid-adv), `u` 14 (HSA ANH, VĂN), `figure`/`figcaption` 6, `em`, `small`.
- SVG `svg`/`rect`/`line` (kid-math).

**MathML (HSA TOÁN only)**
- 35 `<math displaystyle="true">` blocks: 15 in question text, 20 inside answer options, in questions 1, 5, 7, 15, 17, 20, 23, 24, 26, 27, 28, 31, 32, 34, 35, 39, 44.
- Elements: `mrow` 102, `mn` 93, `mo` 81, `mi` 78, `mfrac` 36, `msup` 8, `msqrt` 5, `msub` 4, `msubsup` 3 (integrals with limits, `log`), `mtable`/`mtr`/`mtd` (systems of equations), `mspace`.
- Attributes: `mo stretchy="false"` 18, `mo lspace="0" rspace="0.12em"` (the `log` operator), `mtable columnalign="left" rowspacing="3pt"`, `mspace width="10px"`, `mo class="hemo"`.
- No `<semantics>`/LaTeX annotation is included.
- Example (Q32): `<mo class="hemo">{</mo><mtable columnalign="left" rowspacing="3pt"><mtr><mtd><mi>x</mi><mo>=</mo><mn>2</mn>…`

**Classes and the CSS they need inlined** (copied from each package's own `<style>`)
- `doan` (22×, HSA VĂN/ANH): already fully styled inline, e.g. `background:#fafbfe;border-left:4px solid #FFAD00;border-radius:0 10px 10px 0;padding:12px 16px;margin:0 0 14px;line-height:1.8`. The class is only used for the highlight feature, so nothing to inline.
- `scrollx`: `{ overflow-x:auto }`
- `table.mini`:
  - `{ border-collapse:collapse;margin:10px 0;width:100%;font-size:14px }`
  - `th,td { border:1px solid #b9c4d8;padding:6px 9px;text-align:center }`
  - `th { background:#eef2f9;font-weight:700 }`
- `math mo.hemo`: `{ font-size:2.9em;line-height:0 }`. Also `math { font-size:1.05em;max-width:100% }` and `sub,sup { font-size:.72em;line-height:0 }`.
- `dim` (K10 flow): `.box .dim { color:var(--muted);font-size:14px }`
- `passage` (K4 cloze): `{ background:#f7f9fc;border:1px solid var(--line);border-left:4px solid var(--navy);border-radius:8px;padding:12px 14px;margin:10px 0 14px;text-align:justify }` and `.passage b { color:var(--navy) }`
- `picstrip` (K2MD01): grid `repeat(auto-fit,minmax(110px,1fr))`, `border:1px dashed #a9b6cc;background:#f7f9fd;padding:12px;border-radius:10px`; `img { max-height:96px }`; `figcaption { font-size:14px;font-weight:700;color:var(--navy) }`
- `q ex` and `extag` (K2MD01, inside `pre`):
  - `.q.ex { background:#f7f9fd;border-radius:8px;padding:10px 12px;border:1px dashed var(--line) }`
  - `.extag { font-size:12px;font-weight:700;color:#fff;background:var(--muted);border-radius:10px;padding:1px 8px;margin-left:6px }`
- `blank-no` (kid-adv passage): `{ display:inline-grid;place-items:center;min-width:38px;padding:1px 7px;border-radius:8px;background:var(--yellow);color:var(--navy);font-weight:900 }`
- kid-math figure classes:
  - `visual`: `{ border-radius:18px;background:#f5fafc;border:1px solid #e1edf3;padding:17px;text-align:center }`
  - Plus `big-number`, `blocks`, `tens`, `ones`, `tenbar`, `one`, `marbles`, `mathline`, `train`, `sequence`, `focus`, `family`, `sticks`; all listed in that package's `css.classes`.
  - `.triangle-svg line,.triangle-svg rect { stroke:#28485e;stroke-width:4;fill:none }` is **essential** (see §5).

**`var()` used inside inline styles** (must be replaced with the actual value)
- `var(--muted)` in K12: `#63708a`
- `var(--red)` in K2MD01: `#d21235`
- HSA's `:root` palette: `--navy:#23328C`, `--red:#D21235`, `--muted:#5f6b8c`, `--line:#dde3f1`, `--gold:#FFAD00`
- Every package's values are in `css.rootVars`.

**Inline style properties used:** margin, border-radius, background, padding, line-height, color, font-style, border-left, text-align, font-size, display, margin-top, border, min-width (tables 430–640px), max-height, width.

**Images**
- Only `images/…` relative paths. 13 in TOÁN, 6 in K12, 31 in K2MD01, 27 in kid-adv.
- Where they appear:
  - `item.img` + `imgClass`
  - `<img>` inside answer options (image-only choices)
  - `pre` (picture strip)
  - passage `paras[].t` (with inline `max-height:150px`)
  - kid-adv `bank[].img` and the `order` question's `img`
- No missing files. `logo.png`/`seal.png` are never referenced by questions.
- Size on screen comes from engine CSS that is not in the data:
  - `.qimg.tall { max-height:300px;width:auto }`
  - `.qimg.wide { max-width:min(100%,760px) }`
  - `.opts.pics .opt img { max-height:130px }`

**Placeholders and markers**
- `{{n}}` (9, K10 flow/gap lines; one line holds `{{38}}{{39}}{{40}}`)
- `____` (58)
- `(n) ________` inside a `pre`/passage (HSA ANH 631–635, K2MD01 26–30, K4 21–25)
- `<u>______</u>` (VĂN 56–60)
- `<u>word</u>` (ANH 611–614: the underlined word is the subject of the question)
- `……/ n points` text in `instr`

**Unicode and entities**
- `u⃗` uses U+20D7, a combining arrow for vectors (6×, TOÁN options).
- `&lt;` (TOÁN Q1), `&nbsp;`.
- Curly quotes and ’ in VĂN and in English answers.
- Emoji in kid-math figures and kid-adv icons.

## 4. Shared stimulus a question needs to make sense on its own
- **Group `pre`:**
  - HSA TOÁN 48–50 (exponential population model)
  - VĂN 66–70, 71–75, 86–90, 91–95, 96–100 (`doan` excerpts, 1.2–1.8 KB each)
  - ANH 631–635 (cloze; the questions themselves have `q:""`), 636–640, 641–645 (passages up to 2.5 KB)
  - K2MD01: picture strip for bank 6–10; example blocks for letters 11–15 and short 36–40
  - K4 21–25 (`cloze.text`)
- **Group `instr` is the actual question** when `q` is empty or only a marker:
  - VĂN 51–55 ("Chọn một từ … KHÔNG cùng nhóm")
  - VĂN 56–60, 61–65 (the "SAI" phrase task is ordinary multiple choice with phrase options, not `mistake`)
  - ANH section headings ("Synonyms: … CLOSEST meaning to the underlined word")
  - K4 1–5 (phonetics: options only)
- **Text inside a single question:** VĂN 76–85 and ANH 619–622 carry their own `doan` text.
- **Part `passage`:**
  - K10: 3 passages of paragraphs A–G; letters 14–20 and the select headings refer to paragraph letters.
  - K2MD01: one passage holds **two** texts. the first goes with 26–30, the second with 31–35.
  - kid-adv: reading/yesno passage with `blank-no` numbers.
- **Group-level elements the question cannot stand without:** the K10 flow chart steps and arrows, gap lines, select `list` (10 headings), letters `people` list, multi `opts`, bank word lists (kid-adv words also have images).
- **Exam-level:** K12 `EXAM.note` atomic masses, needed for calculation questions (short 2 and 6; true/false 1d, 2d, 3d). HSA `EXAM.note` is only the source credit.
- **Within one question:** `q` → `table` → `img` → `q2` order matters ("Cho bảng sau…" / "Phát biểu đúng là"). Kid-math `visual` figures are needed for Q7 (count the triangles) and Q8 (number sequence).

## 5. Edge cases for conversion
1. **Several accepted answers / matching rules.** The engine's `norm`/`loose`/`textOk` (template `index.html:1448-1460`): case-insensitive; ‘’ʼ treated as '; spaces collapsed; trailing `.,;:!?` dropped; `-` and spaces removed; `.` treated as `,`; a leading a/an/the ignored. Each older format differs:
   - K12 `normShort` removes **all** spaces and treats `.` as `,`.
   - K4 `bankOk` uses `ans` plus `alt[]` and ignores articles.
   - kid-adv and kid-math compare **exactly**.
   - Canvas will not apply these rules, so the converter must list the variants explicitly (curly vs straight apostrophe in K2 36–40 and kid-adv; proper-noun capitals; hyphen/space/joined spellings of one term).
2. **Comma decimals and fractions:** `["12,5","12.5"]`, `["7,35","7.35"]`, and TOÁN 9/23/27 `["8/3","2,67","2.67","2,666","2,6667"]`, `["4/3",…]`, `["31/12",…]`. A fraction answer cannot go into a purely numeric question type, and truncated decimals (2,666 but not 2,7) need either a tolerance or exact strings. The hint "dùng dấu phẩy" tells students to type commas.
3. **True/false ladder** (K12 only): 4 statements, 0/0.1/0.25/0.5/1 for 0–4 correct (`EXAM_INFO.ptII`). This is not linear partial credit.
4. **multi:** one group, `nums:[21,22]`, `pick:2`, answer at group level `["B","D"]`. 1 point per correct letter, no penalty for wrong picks, and choosing more than `pick` drops the oldest choice. It is one question that counts as 2 question numbers; when encrypted the group `ans` is a single index into `KEYS`.
5. **Examples that are not scored:**
   - mcq examples: K2MD01 ×3, K4 ×2
   - bank examples: K2MD01 "go to bed", K4 "LED lights"; both words are **also in the word bank**
   - select example "Paragraph A → ix" (ix is in the list and used by no question)
   - kid-adv `letterMatch` bank item `{v:"F",t:"eating",example:true}` (F stays in `keys`); K2MD01 F is the example and its `pre` notes an extra answer
6. **letters:**
   - K10 14–20 has no names list (answers are paragraph letters A–G, "may use any letter more than once").
   - K10 33–37 has `people` A–F (researcher names).
   - K2MD01 / kid-adv `people` is a word list A–G with one distractor.
7. **select:** 10 headings (i–x) for 6 questions plus an example; heading keys are roman numerals.
8. **mistake** (K4 19–20): 4 `seg` pieces with keys A–D in sentence order. The underlined text is the option text and is drawn as underline plus a red superscript letter.
9. **order** (kid-adv 36–40): no template equivalent. 4 chunks shuffled, `target` order, 2 points with 0.5 per correctly placed chunk; the sentence is rebuilt as `join(" ")` with the space before punctuation removed.
10. **Numbering:** K12 restarts at 1 in each part (Phần I 1–18, II 1–4, III 1–6). HSA uses exam numbering (51–100, 601–650), and passages refer to "(631)", so if Canvas renumbers, the question text must carry the original number.
11. **Shuffling:** HSA shuffles groups, questions and options per student. The cloze group has `giuThuTu` (the extractor sets the same flag on K4's cloze). Stored answers are the **original** letters.
12. **Image-only options:** K2MD01 and kid-adv imageChoice options are just an `<img>` (A/B/C). 20 TOÁN options are MathML, so options must be HTML, not plain text.
13. **Plain-text formats:** K4 and kid-adv/kid-math `prompt`/`opts`/`seg` are plain text that the engine escapes. The extractor's converted output escapes them already (only K4 `cloze.text` and kid-adv `passage` are raw HTML).
14. **Bugs in the source packages:**
    - K2MD01 short answers: `maxlength="14"` (its `index.html:790`) but answers are 21–42 characters, so Q36–40 can never be marked right.
    - Kid-math triangle SVG has no stroke/fill attributes, so without the package CSS the `<rect>` renders black; inline `stroke`/`fill:none` attributes are needed.
15. **Engine layout carried by flags rather than markup:** `one`, `cols`, `pics`, `imgClass` (`wide ultra` = very wide image scrolled sideways on phones), and `hint`, which is shown next to the input and describes format only.

**Out of scope here:** how Canvas treats MathML, `<u>`, `<svg>`, inline styles and `var()` was not checked in this local analysis (UNCONFIRMED). It needs the web-sourced check.