# Canvas New Quizzes (Quizzes.Next) vs Classic Quizzes question banks: which import target to build for (research as of 2026-10-02)

## 0. Short answer

1. **Classic Quizzes still has no official end date.** Instructure's own list of upcoming removals ("Enforcements, Deprecations, and Breaking Changes", last updated 2026-09-15) has no Classic Quizzes entry. Instructure is still pushing schools toward New Quizzes. A school admin can already block creation of new Classic quizzes with a course-level setting.
2. **A QTI 1.2 zip can go directly into a New Quizzes Item Bank.** Path: Item Banks → open an *empty* bank → ⋮ → Import Content. It can also go into a *new, empty* New Quiz (Build → ⋮ → Import Content), or through Course Import with "Convert content to New Quizzes" ticked.
3. **New Quizzes has no item-bank API, and Instructure does not plan one.** The New Quizzes REST API (`/api/quiz/v1/...`) can create questions inside a quiz only. Item bank contents can be read but not created or edited. Instructure's official feature comparison (updated 2026-07-22) marks "Question/Item Bank API" for New Quizzes as ✖️, which its legend defines as "not planned or in consideration at this time".
4. **Recommendation: build one output format that serves both systems.** That format is a QTI 1.2 zip in the same layout Canvas itself produces when it exports a Classic quiz, with one zip per bank and every question placed directly in the quiz. Instructure's own guide imports exactly this kind of exported zip into an item bank, so the same file fits the Classic path, the New Quizzes item-bank path and the course-import conversion path. Use the API only as an optional "push into a New Quiz", and only through a server-side proxy, because Canvas sends no CORS headers.

---

## 1. Classic Quizzes sunset and New Quizzes enforcement, 2025–2026

| Date | What happened | Source |
|---|---|---|
| 2022-10-26 | Instructure dropped the June 2024 deadline: "Instructure is removing the deadline for migration to New Quizzes… has not set an end-of-life date for Classic Quizzes and will look to adoption to guide that decision." | https://www.instructure.com/press-release/instructure-announces-updated-strategy-rolling-out-new-quizzes |
| 2025-03-20 | Community Q&A: "there is currently no general deadline"; some schools set their own dates. | https://community.instructure.com/en/discussion/637668/classic-quiz-ending |
| 2026-03-10 | Instructure webinar for admins pitches New Quizzes as having "feature parity with Classic Quizzes—plus 25 exclusive new features". No sunset date given. | https://community.instructure.com/en/events/663837-the-strategic-move-to-new-quizzes-the-admin-s-roadmap-to-new-quizzes |
| 2026-07-22 | Official "Classic Quizzes vs New Quizzes Feature Comparison" updated (details in §3–4). | https://community.instructure.com/en/kb/articles/658474 |
| 2026-08-15 | The only New Quizzes item on the official removals list: "New Quizzes Native Canvas Integration is enforced" (New Quizzes no longer runs in an iframe). Originally 2026-07-01, moved to 2026-08-15. This is not a Classic Quizzes sunset. | https://community.instructure.com/en/discussion/254349/instructure-enforcements-deprecations-and-breaking-changes/p1 (change log entry "2026-05-19 Changed date"); https://community.instructure.com/en/discussion/665887/canvas-release-notes-2026-05-16 |
| 2026-09-15 | Latest update of the removals list. It contains **no Classic Quizzes deprecation or end-of-life entry**. | same link as above |

**Settings an admin can use to force the switch.** These come from Canvas source code (https://github.com/instructure/canvas-lms/blob/master/config/feature_flags/quizzes_release_flags.yml). Vietnamese labels are from `config/locales/vi.yml` in the same repository.

| Setting key | English label | Level | Vietnamese label |
|---|---|---|---|
| `new_quizzes_by_default` | "Disable Classic Quiz Creation… Removes the ability to create classic quizzes" | Course | not looked up |
| `new_quizzes_migration` | "New Quizzes migration during course import/copy" | Root account | "Di chuyển Câu Hỏi Kiểm Tra Mới trong lúc nhập/sao chép khóa học" |
| `migrate_to_new_quizzes_by_default` | "New Quizzes migration enabled by default" | Root account | not looked up |
| `require_migration_to_new_quizzes` | "New Quizzes migration required" | Root account | not looked up |

A district plan posted on the Community (not official) shows how schools use these settings: block Classic creation during school year 2026-27, then full New Quizzes from summer 2027. https://community.instructure.com/en/discussion/666026/our-phased-transition-to-canvas-new-quizzes-deprecation-of-classic-quizzes

**Conclusion.** For a school in 2026, Classic question banks still work, but nothing new is being built for them, and an admin can switch off Classic creation at any time. New Quizzes item banks are the long-term target.

---

## 2. Importing into Item Banks and New Quizzes

### 2a. QTI zip directly into an item bank: supported

Official guide: https://community.instructure.com/en/kb/articles/661079-how-do-i-import-questions-from-a-qti-package-into-an-item-bank-in-new-quizzes (page metadata updated 2026-09-25).

Steps from the guide:
1. In Course Navigation, open **Item Banks**.
2. Click **Add Bank**, enter a name, tick Share if wanted, then **Create Bank**.
3. Open the new bank, click the **Options (⋮)** icon, then **Import Content**.
4. Drag the file in or click Browse, then **Import**. A status bar shows progress.

Notes stated in the guide:
- "New Quizzes only supports imports from QTI 1.2 and 2.x versions. However, some QTI 1.2 and 2.x 3rd party packages include software-specific item types which may not be supported."
- **"If there are questions in your item bank, you will not be able to select the Import Content option."** You can only import into an empty bank, so plan **one zip per bank**.
- "You can only import questions if you access item banks from the Manage Item Banks page in the Options menu. If you click the Item Banks button [inside a quiz's Build page], you will not be able to import questions."

Instructure's own workaround for moving a Classic question bank into an item bank uses a zip exported from a **Classic quiz**: build a practice quiz, pull in the bank's questions with Find Questions, export it, then import that zip into an empty item bank. This is the strongest evidence that a Canvas-format QTI 1.2 zip containing a quiz imports cleanly into an item bank. https://community.instructure.com/en/kb/articles/661078-how-do-i-move-a-classic-quizzes-question-bank-into-a-new-quizzes-item-bank

**UNCONFIRMED:** whether a zip that contains only a question-bank file (`<objectbank>`, no quiz) imports into an item bank through this screen. The New Quizzes import code is not public.
- Indirect evidence that New Quizzes can read the bank-only format: Canvas sends bank-only files in the same `non_cc_assessments/*.xml.qti` layout when it converts courses to New Quizzes (`generate_banks`, `meta_field … "bank_type"` in https://github.com/instructure/canvas-lms/blob/master/lib/cc/qti/qti_generator.rb).
- New Quizzes' own Common Cartridge export also writes bank-only resources (`bank_resources` in https://github.com/instructure/canvas-lms/blob/master/lib/cc/qti/new_quizzes_generator.rb).
- This needs a test on a real Canvas course.

### 2b. QTI zip into a New Quiz (Build → Import Content): supported, new quizzes only

Official guide: https://community.instructure.com/en/kb/articles/661050-how-do-i-import-a-quiz-from-a-qti-package-in-new-quizzes

- "You can only use QTI packages to create a new quiz. You cannot modify an existing quiz using a QTI import."
- "**Question groups linked to question banks are not included in QTI imports.**" Questions must sit directly in the quiz, not in a group that points at a bank.
- The new quiz takes the zip's file name as its title.

### 2c. Settings → Import Course Content → QTI .zip with the New Quizzes checkbox ticked

Official guide: https://community.instructure.com/en/kb/articles/660996-how-do-i-import-quizzes-from-qti-packages

What the Canvas source code shows:
- With `settings[import_quizzes_next]` set, Canvas first imports the content as Classic. Then, for **each imported quiz**, it converts the quiz's assignment to New Quizzes and destroys the Classic quiz (`migration_lti!`, `Quizzes::Quiz.find(quiz.id)&.destroy`). https://github.com/instructure/canvas-lms/blob/master/app/models/quizzes_next/importers/course_content_importer.rb
- To hand content to the New Quizzes service, Canvas re-exports it as QTI. When `new_quizzes_bank_migrations` is on, that export includes all the course's question banks (`"all_#{AssessmentQuestionBank.table_name}"` in https://github.com/instructure/canvas-lms/blob/master/app/models/content_export.rb).
- The checkbox wording tells you which mode a given Canvas runs in (https://github.com/instructure/canvas-lms/blob/master/ui/shared/content-migrations/react/CommonMigratorControls/CommonMigratorControls.tsx and `.../jst/ImportQuizzesNextView.handlebars`):
  - If `NEW_QUIZZES_UNATTACHED_BANK_MIGRATIONS` is on, the label is **"Convert content to New Quizzes"**. Its help text says: *"Existing question banks and classic quizzes will be imported as Item Banks and New Quizzes."* In Vietnamese: "Chuyển đổi nội dung thành Các Câu Hỏi Kiểm Tra Mới".
  - Otherwise the label is **"Import existing quizzes as New Quizzes"**. In Vietnamese: "Nhập câu hỏi kiểm tra hiện có dưới dạng Các Câu Hỏi Kiểm Tra Mới".
- Ticking the box disables the "Default question bank" picker. Its message: "This option is not compatible with New Quizzes" (Vietnamese: "Tùy chọn này không tương thích với Kiểm Tra Mới"). https://github.com/instructure/canvas-lms/blob/master/ui/features/content_migrations/react/components/migrator_forms/qti_zip.tsx
- Release history: release notes 2025-01-18 announced "Question Bank Migration on Course Copy" (renaming the checkbox to "Convert content to New Quizzes"), then marked it "Delayed TBD" on 2025-01-21. https://community.instructure.com/en/discussion/626856/canvas-release-notes-2025-01-18
- Current status: the 2026 guide uses the "Convert content to New Quizzes" label and says "All Question Banks converted to Item Banks appear on the Item Banks page of the new course under the This Course filter." This suggests the feature is now live. **I inferred this from the guide; I did not find a release-note date.** A teacher can check by looking at which checkbox label appears on their Canvas.
- **UNCONFIRMED:** whether a QTI zip containing only a question bank (no quiz) becomes an item bank through this path. Canvas only queues imported *quizzes* for conversion, and the bank handling happens inside the closed New Quizzes service.

### 2d. "Migrate to New Quizzes" and what happens to Classic question banks

- Official guide (https://community.instructure.com/en/kb/articles/661049-how-do-i-migrate-a-canvas-quiz-to-new-quizzes):
  - "question banks linked via a question group in Classic Quizzes will migrate to New Quizzes" when the migration setting is on.
  - "Question groups with manually created questions migrate as item banks."
  - "Multiple Dropdown questions display as Fill in the Blank."
- Product blog (2023-09-18, https://community.instructure.com/en/discussion/580551/new-quizzes-migration-question-banks-to-item-banks):
  - A bank must be **linked** through a question group to migrate. Questions added with "Find Questions" are copies and stay plain questions.
  - Converted banks are named `[QUESTION BANK NAME]`. Inline groups become `[QUIZ NAME] - [GROUP TITLE] - [NUMBER]`.
  - Converted banks are owned by a user and shared with the course.
  - Known issue: on a selective copy, banks are lost if they are not ticked under "Select Content".

### 2e. Other import/export facts

- No CSV import exists for quizzes or item banks; Canvas only accepts QTI (community answer, 2025-09): https://community.instructure.com/en/t5/New-Quizzes-Discussion/Import-a-csv-file-as-a-new-quiz/m-p/654762
- The official guide list has no "export an item bank" guide. A whole New Quiz can be exported to QTI. Known issue opened 2025-08 (only the title is public; per search snippets, "importing that QTI into an Item Bank results in no questions"): https://community.instructure.com/en/discussion/654233
- What item banks support today: Duplicate, Share, filters ("This Course", "Shared with Me", "Institution Banks", "Shared with Courses"), tags, and adding all or a random N questions to a quiz. https://community.instructure.com/en/kb/articles/661075-how-do-i-manage-item-banks-in-new-quizzes
- There is no bulk "add these quiz questions to a bank" action. Questions are added one at a time (Item Banking → Add to Bank), and the idea request for bulk add is still open: https://community.canvaslms.com/t5/Canvas-Ideas/New-Quizzes-New-Quiz-Tool-Bulk-Add-Questions-to-an-Item-Bank/idc-p/456355

---

## 3. Question-type mapping into New Quizzes, and what is lost

| Classic / QTI `question_type` | New Quizzes type (API `interaction_type_slug`) | Notes and sources |
|---|---|---|
| `multiple_choice_question` | `choice` | Per-answer feedback is supported. |
| `true_false_question` | `true-false` | |
| `multiple_answers_question` | `multi-answer` | Scoring `AllOrNothing` or `PartialScore`. Per-answer feedback added 2026-04-08 (summary page with links to the deploy notes: https://help.canvas.yale.edu/a/2039983-canvas-updates-for-fall-2026). |
| `short_answer_question` | Fill in the Blank | **UNCONFIRMED** whether import produces the current `rich-fill-blank` or the deprecated `fill-blank`. |
| `fill_in_multiple_blanks_question` | Fill in the Blank (several blanks) | Comparison shows ✔️*, meaning an alternative process. |
| `multiple_dropdowns_question` | Fill in the Blank with dropdown blanks | **Instructure's guides contradict each other.** The migration guide (661049) says "display as Fill in the Blank questions"; the QTI-import guide (660996) says "display as matching questions". A 2023 user report says dropdown answers got corrupted when the migrated question was edited: https://community.instructure.com/en/discussion/572234 |
| `matching_question` | `matching` | Scoring `DeepEquals` or `PartialDeep`. |
| `numerical_question` | `numeric` | Answer types `exactResponse`, `marginOfError`, `withinARange`, `preciseResponse`. |
| `calculated_question` | `formula` | |
| `essay_question` | `essay` | |
| `file_upload_question` | `file-upload` | |
| `text_only_question` | Stimulus / standalone text | 660996: "migrate to New Quizzes as Stimulus questions". 661049: "standalone text or prompts". |
| Question group with inline questions | Item bank | Only during migration or course conversion. |
| Question group linked to a bank | — | Dropped on a direct QTI import into a quiz (661050). |

**Losses and risks:**
- **Partial credit for Fill in the Blank:** Classic has ✔️; the New Quizzes cell is blank in the 2026-07-22 comparison. Matching, Multiple Answer and Categorization do give partial credit in New Quizzes (Categorization since the 2026-04-22 deploy). https://community.instructure.com/en/kb/articles/658474
- **No native scoring for the Vietnamese THPT true/false item.** The THPT scale (1/2/3/4 correct statements → 0.1/0.25/0.5/1 point) exists in neither system; Canvas only does linear partial credit. Options:
  - Classic: `multiple_dropdowns` or `matching`.
  - New Quizzes: matching (statements → "Đúng"/"Sai", `PartialDeep`), or categorization.
  - **UNCONFIRMED:** whether New Quizzes matching allows several statements to map to the same answer. The `scoring_data` structure suggests it does.
- **Decimal comma (relevant to Vietnamese numeric answers):** admins can set the decimal and thousands separators for New Quizzes. Related bugs were fixed on 2025-06-25 and 2025-10-28; a scientific-notation bug is still open (search snippets for https://community.canvaslms.com/t5/Known-Issues/New-Quiz-formula-and-numeric-questions-do-not-allow-decimal/ta-p/643764 and https://community.canvaslms.com/t5/Known-Issues/UX-New-Quizzes-Settings-decimal-separator-behaviour-is-not/ta-p/657885).
- **MathML:**
  - Classic: Canvas's HTML cleaner explicitly allows MathML tags (`"math"`, `"mfrac"`, …). https://github.com/instructure/canvas-lms/blob/master/gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb
  - New Quizzes: deploy notes 2025-06-18 say "instructors can use MathML code by switching the Rich Content Editor to HTML **for the question stem**". https://community.instructure.com/en/discussion/646799/canvas-deploy-notes-2025-06-18
  - **UNCONFIRMED:** whether MathML survives a QTI import into New Quizzes, and whether it works in answer choices. Test it, and keep a fallback (Canvas equation images or LaTeX).
- **Images:**
  - The same Canvas cleaner only allows `img src` of `http`, `https` or relative paths (`DEFAULT_PROTOCOLS = ["http", "https", :relative]`). So **base64 `data:` images are stripped in Classic**; ship images as files inside the zip.
  - **UNCONFIRMED** how New Quizzes treats `data:` images.
  - Image problems after QTI import into item banks have been reported before (QTI 2.1, 2022): https://community.canvaslms.com/t5/ratings/ratingdetailpage/message-uid/547264/rating-system/forum_topic_metoo
  - For banks shared across courses, Instructure's 2023 blog (580551) says images under course files can break, while one college's guidance says to keep them in Course Files. They conflict, so test this.
- **Testing environment:** New Quizzes is ✖️ on `*.test.instructure.com` and ✔️ on `*.beta.instructure.com` (feature comparison).

---

## 4. New Quizzes public API

Docs: https://developerdocs.instructure.com/services/canvas/resources/new_quizzes and https://developerdocs.instructure.com/services/canvas/resources/new_quiz_items

**Quizzes:**
- `GET /api/quiz/v1/courses/:course_id/quizzes`
- `GET`, `PATCH` and `DELETE …/quizzes/:assignment_id`
- `POST …/quizzes` with fields such as `quiz[title]`, `quiz[assignment_group_id]`, `quiz[points_possible]`, `quiz[due_at]`, `quiz[instructions]`, `quiz[quiz_settings][…]`. The quiz's id is its **assignment id**.

**Questions inside a quiz:**
- `GET`/`POST …/quizzes/:assignment_id/items`
- `GET`/`PATCH`/`DELETE …/items/:item_id`
- `GET …/items/media_upload_url`, which returns an upload URL for hot-spot images only.

**Create request fields:**
- Top level: `item[position]`, `item[points_possible]`, and `item[entry_type]` (**allowed value: `Item` only**).
- Inside `item[entry]`: `[title]`, `[item_body]` (required), `[calculator_type]` (`none`/`basic`/`scientific`), `[feedback][neutral|correct|incorrect]`, `[interaction_type_slug]` (required), `[interaction_data]` (required), `[properties]`, `[scoring_data]` (required), `[answer_feedback]` (choice questions only), `[scoring_algorithm]` (required).
- JSON body with `Content-Type: application/json` is shown in the docs.
- Choice, answer and blank IDs must be generated as UUID v4.

**JSON shapes, quoted from the docs:**
```js
// choice — scoring_algorithm "Equivalence" (or "VaryPointsByAnswer")
"interaction_data": {"choices":[{"id":"<uuid>","position":1,"item_body":"<p>…</p>"}]},
"properties": {"shuffleRules":{"choices":{"toLock":[],"shuffled":true}},"varyPointsByAnswer":false},
"scoring_data": {"value":"<uuid of correct choice>"}

// true-false — "Equivalence"
"interaction_data": {"true_choice":"True","false_choice":"False"}, "scoring_data": {"value": true}

// multi-answer — "AllOrNothing" | "PartialScore"
"interaction_data": {"choices":[{"id":"<uuid>","position":1,"item_body":"<p>q</p>"}]},
"properties": {"shuffle_rules":{"choices":{"to_lock":[0,2],"shuffled":true}}},
"scoring_data": {"value":["<uuid>","<uuid>"]}

// matching — "DeepEquals" | "PartialDeep"
"interaction_data": {"answers":["bb","cc","ff"],"questions":[{"id":"10586","item_body":"a"}]},
"scoring_data": {"value":{"10586":"aa"},
  "edit_data":{"matches":[{"answer_body":"aa","question_id":"10586","question_body":"a"}],"distractors":["ff"]}}

// rich-fill-blank — "MultipleMethods"; each blank's answer_type is "openEntry" | "dropdown" | "wordbank"
"interaction_data": {"blanks":[{"id":"<uuid>","answer_type":"openEntry"},
   {"id":"<uuid>","answer_type":"dropdown","choices":[{"id":"<uuid>","position":1,"item_body":"pink"}]}],
   "word_bank_choices":[…],"reuse_word_bank_choices":true},
"scoring_data": {"value":[{"id":"<blank uuid>","scoring_data":{"value":"Roses","blank_text":"Roses",
   "ignore_case":true,"edit_distance":1},"scoring_algorithm":"TextCloseEnough"}, …],
   "working_item_body":"<p>`Roses` are `red`</p>"}
// per-blank algorithms: TextCloseEnough, TextContainsAnswer, TextInChoices, Equivalence (dropdown: value = choice uuid),
// TextEquivalence (wordbank: value + choice_id), TextRegex

// numeric — "Numeric"
"interaction_data": {}, "scoring_data": {"value":[{"id":"1","type":"exactResponse","value":"200"},
  {"id":"<uuid>","type":"marginOfError","value":"200","margin":"3","margin_type":"percent"},
  {"id":"<uuid>","type":"withinARange","start":"190","end":"210"},
  {"id":"<uuid>","type":"preciseResponse","value":"200.0001","precision":"4","precision_type":"decimals"}]}

// essay — "None"
"interaction_data": {"rce":true,"essay":null,"word_count":true,"file_upload":false,"spell_check":true,
  "word_limit_max":"1000","word_limit_min":"0","word_limit_enabled":true}, "scoring_data": {"value":"<grading notes>"}
```

Two gaps in the docs:
- The docs are inconsistent: the full choice example uses `itemBody`, while the per-type section uses `item_body`.
- **UNCONFIRMED:** how blanks are marked inside `item_body` for rich-fill-blank. Only `working_item_body` with backticks is documented. Create one such question by hand and `GET` it to copy the exact format.

**Item bank API: none.**
- Docs: "BankItem… BankEntry… can only be retrieved with the API. They must be created and updated via the UI." The only bank-related fields are `entry_type` ∈ {`Item`, `Stimulus`, `BankEntry`, `Bank`}, `bank_id`, and `properties.sample_num`.
- The 2026-07-22 comparison marks "Question/Item Bank API" as ✖️ for New Quizzes.
- Canvas source has hidden, in-development settings for an "Assessment Management Service" (`ams_root_account_integration`, `ams_course_integration`), which mounts on the course `item_banks` route. Its API is unknown and should not be relied on. https://github.com/instructure/canvas-lms/blob/master/config/feature_flags/ams_release_flags.yml and https://github.com/instructure/canvas-lms/blob/master/app/controllers/item_banks_controller.rb
- Classic bank API is read-only: `GET /api/v1/question_banks`, `GET /api/v1/question_banks/:id` and `GET /api/v1/question_banks/:id/questions`. https://developerdocs.instructure.com/services/canvas/resources/assessment_question_banks
- One Classic workaround exists: questions created with the Classic Quiz Questions API are also stored in the course's "Unfiled Questions" bank (`AssessmentQuestionBank.unfiled_for_context` in https://github.com/instructure/canvas-lms/blob/master/app/models/assessment_question.rb).

**Authentication:**
- The same Canvas token works: `Authorization: Bearer <token>`.
- `/api/quiz/v1` routes are part of the token permission scopes (the pattern `api/(v1|sis|quiz/v1)` in https://github.com/instructure/canvas-lms/blob/master/lib/token_scopes.rb).
- Policy: generating a personal token by hand is for testing only. "asking any other user to manually generate a token and enter it into your application is a violation of Canvas' API Policy. Applications in use by multiple users MUST use OAuth." A multi-teacher tool therefore needs an admin-created Developer Key and OAuth2. https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth
- Rate limiting: HTTP `429` with an `X-Rate-Limit-Remaining` header; sending one request at a time is safe. https://developerdocs.instructure.com/services/canvas/basics/file.throttling

**CORS: not supported.** I tested this today against `canvas.instructure.com`:
- `OPTIONS /api/v1/courses` with an `Origin` header returned **404 with no `Access-Control-Allow-Origin`**.
- `GET` returned 401 with no CORS headers.
- `OPTIONS /api/quiz/v1/courses/1/quizzes` returned 404 with no CORS headers.

The Community has the same report: https://community.instructure.com/en/discussion/571686/javascript-api-development-cors-issue. A browser-only tool cannot call the API. It needs a server-side proxy (for example a Vercel function) or a local Node script.

---

## 5. Recommendation and teacher-facing steps

**Target format.** The tool should produce a **Canvas-format QTI 1.2 zip**:
- The layout Canvas itself exports: `imsmanifest.xml`, `<id>/assessment_qti.xml`, `<id>/assessment_meta.xml`, `non_cc_assessments/<id>.xml.qti`, plus images as files inside the zip.
- **One zip per bank**: one quiz containing all questions inline. No groups pointing at banks, and no `data:` images.
- Name each zip after the bank, because New Quizzes uses the file name as the title.

Why this format:
- It is exactly what Canvas generates when it migrates content to New Quizzes, so it is the format the New Quizzes importer handles best.
- It works in all four paths below.

**A. New Quizzes Item Bank (recommended long-term).** Course navigation **Item Banks** (Vietnamese: "Ngân Hàng Câu Hỏi") → **Add Bank** → enter name, tick Share → **Create Bank** → open the bank → **⋮ → Import Content** → choose the zip → **Import**. To use it: Quiz → Build → Item Banks → add all or a random N questions.
- **UNCONFIRMED:** the Vietnamese labels inside the New Quizzes app ("Add Bank", "Import Content"). That app is not open source, so English labels are given here.

**B. New Quiz directly.** Quizzes ("Các Câu Hỏi Kiểm Tra") → **Add Quiz** ("Thêm Câu Hỏi Kiểm Tra") → New Quizzes → Save → **Build** ("Xây Dựng") → **⋮ → Import Content**. This only works on an empty, new quiz.

**C. Classic question bank.**
1. **Cài Đặt** (Settings) → **Nhập Nội Dung Khóa Học** (Import Course Content).
2. **Chọn Loại Nội Dung** (Select content type) = **Tập tin .zip QTI** (QTI .zip file) → choose the file.
3. **Do not** tick "Chuyển đổi nội dung thành Các Câu Hỏi Kiểm Tra Mới" (Convert content to New Quizzes).
4. **Ngân hàng Câu Hỏi mặc định** (Default question bank) → "-- Tạo ngân hàng câu hỏi mới --" (create new question bank).
5. Optionally tick "Ghi đè nội dung đánh giá với ID trùng khớp" (overwrite assessment content with matching IDs).
6. **Thêm vào Hàng Chờ Nhập** (Add to Import Queue) / Import.
7. Check the result under Quizzes ⋮ → **Quản Lý Ngân Hàng Câu Hỏi** (Manage Question Banks).

Bank naming: inline quiz questions go into a bank named after the quiz (`aq["question_bank_name"] ||= assmnt_title` in https://github.com/instructure/canvas-lms/blob/master/app/models/importers/quiz_importer.rb). How this interacts with the chosen default bank is not settled here; leave it to the Classic-side research.

**D. Convert during import.** Same as C, but **tick** "Chuyển đổi nội dung thành Các Câu Hỏi Kiểm Tra Mới". The help text in Vietnamese reads: "Các ngân hàng câu hỏi … sẽ được nhập thành Ngân Hàng Mục và Câu Hỏi Kiểm Tra Mới" (question banks will be imported as item banks and New Quizzes). The Classic quiz is replaced by a New Quiz.

**Vietnamese UI pitfall.** The Canvas Vietnamese translation calls **both** systems "Ngân Hàng Câu Hỏi":
- New Quizzes item banks: `item_banks: "Ngân Hàng Câu Hỏi"`.
- Classic question banks: shown as `"Ngân Hàng Câu Hỏi (Bản cũ)"` ("old version") in the page breadcrumb.
- One help text uses "Ngân Hàng Mục" for item banks.

Source: https://github.com/instructure/canvas-lms/blob/master/config/locales/vi.yml. Teacher instructions must say which one is meant.

**API mode (optional).** Use it only to push questions straight into a New Quiz:
- Requires an admin-created Developer Key, OAuth2, and a server-side proxy.
- It cannot fill item banks.

**Information to get from the school before building (checklist):**
1. The Canvas domain.
2. Whether New Quizzes is enabled.
3. Which checkbox label appears on the import page: "Convert content…" or "Import existing quizzes…".
4. Whether Classic quiz creation has been disabled.
5. Whether the admin can create a Developer Key.
6. Whether a sandbox course on `*.beta.instructure.com` is available (New Quizzes does not work on the test environment).
7. A test run of one zip containing MathML, images and every question type, through paths A, B and C, to settle the UNCONFIRMED items above.