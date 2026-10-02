# Canvas Classic Quizzes question-bank import (QTI 1.2): final templates, reconciled from reports A, B and C

I checked every disagreement and every UNCONFIRMED point against the pinned sources on 2026-10-02.

Citation prefixes (each one expands to a full URL):
- `C:` = https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/
- `Q:` = https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/
- `CLM:` = canvas_link_migrator 1.0.19, the version pinned in `C:Gemfile.lock#L452` (https://rubygems.org/gems/canvas_link_migrator/versions/1.0.19). Its parse logic is identical in 1.0.20.

Local copies of everything cited are under `C:\Users\ADMINI~1\AppData\Local\Temp\claude\C--Users-Administrator-Downloads-PM-chamthidua\dc508171-525f-4c6b-95a3-99cccd19d826\scratchpad\`, in the folders `cc\`, `qti\`, `canvas\` and `recon\`.

## 0. Three source facts that settle most of the disagreements

**1. A "QTI .zip file" import runs with no flavor.**
- `Qti::Converter` takes `@flavor = settings[:flavor]` (`C:gems/plugins/qti_exporter/lib/qti/converter.rb#L47`).
- Only two callers set a flavor: the .imscc cartridge importer, which passes `Qti::Flavors::CANVAS` (`C:lib/cc/importer/canvas/quiz_converter.rb#L64`, `#L77`), and the Respondus endpoint. A GitHub code search of `app/`, `ui/` and `lib/canvas/migration` finds no other setter.
- Consequences:
  - `original_answer_ids` are ignored and answer ids are random (`C:gems/plugins/qti_exporter/lib/qti/assessment_item_converter.rb#L234-L245`).
  - Answer HTML is detected by a heuristic, not by flavor (`C:gems/plugins/qti_exporter/lib/qti/html_helper.rb#L114-L132`).
  - Nothing type-specific depends on the flavor. For example, fill-in-multiple-blanks and dropdowns choose `process_canvas` from `custom_type` (`C:.../qti/fill_in_the_blank.rb#L32-L45`).
- The best evidence: Canvas's own spec "gets html properties" runs the real Python converter on an `<objectbank>` fixture with no flavor. It gets back `question_bank_name: "Test Bank"`, `question_bank_id`, HTML answers and all three feedback kinds (`C:gems/plugins/qti_exporter/spec_canvas/lib/qti/canvas_questions_spec.rb#L125-L151`; fixture `C:gems/plugins/qti_exporter/spec_canvas/fixtures/canvas/multiple_choice_html.xml`).

**2. Canvas never runs the QTI response processing.**
- The importer only mines it to find which options are correct: `get_response_weight` (`C:.../qti/choice_interaction.rb#L251-L286`), `setOutcomeValue[identifier=SCORE] sum` (`C:.../qti/fill_in_the_blank.rb#L99-L107` and `C:.../qti/associate_interaction.rb#L147`).
- Grading at quiz time uses Canvas's own per-type classes (§2.11).
- So the SCORE numbers in the XML are only markers, but their form matters:
  - single-answer types need `Set` with 100;
  - dropdowns and matching need `Add`, which becomes `sum`.

**3. The Python step treats `mattext` HTML as an opaque string.**
- `texttype="text/html"` text is appended as raw characters (`Q:lib/imsqtiv1.py#L4087-L4089`) and written back escaped inside `<div class="html">` (`Q:lib/imsqtiv1.py#L3581-L3610`).
- `text/plain` becomes `<div class="text">` (`Q:lib/imsqtiv1.py#L4077-L4086`).
- A `mattext` with **no** `texttype` is treated as **text/html** (`Q:lib/imsqtiv1.py#L4033-L4034`), even though the DTD default is text/plain.
- Raw child tags inside `mattext` take the `RawMaterial` path (`Q:lib/imsqtiv1.py#L6399-L6401`). Never emit them.

---

## 1. Package layout

### 1.1 Default: a bank-only zip (`<objectbank>`)

**Why this is the default:**
- **It creates a named bank and no quiz.**
  - The Python tool creates an assessment resource only from `<assessment>` (`Q:lib/imsqtiv1.py#L1337`).
  - Ruby builds quizzes only from `imsqti_assessment_xmlv2p1` and `imsqti_test_xmlv2p1` resources (`C:gems/plugins/qti_exporter/lib/qti.rb#L72-L88`).
- **The bank name comes from `bank_title` and the bank id from the objectbank `ident`.** The chain:
  - `Q:lib/imsqtiv1.py#L650-L677`, `#L1929-L1930` and `#L2969-L2981`;
  - `C:.../qti/assessment_item_converter.rb#L171-L181`;
  - `C:app/models/importers/assessment_question_bank_importer.rb#L25-L59`;
  - `C:app/models/importers/assessment_question_importer.rb#L72-L112`.
- **This is the same path Canvas uses for its own exports.** `.imscc` exports put banks in `non_cc_assessments/<bank>.xml.qti` (`C:lib/cc/qti/qti_generator.rb#L319-L339`).
- **The alternatives are worse:**
  - Questions with no bank go to the "Default Question bank" chosen in the import form. In code, choosing an *existing* bank there registers it under `create_key(default_title,"assessment_question_bank")`. Unfiled questions, however, get the key `create_key("__question_bank")` (`C:app/models/importers/quiz_importer.rb#L63-L69` against `C:app/models/importers/assessment_question_importer.rb#L53-L56`, `#L75`). The likely result is a new bank with the same title.
  - Inline `<assessment>` items create a quiz plus a bank named after the quiz.

```
NSHM_HSA2025_TOAN_bank.zip     ASCII name, no "." before .zip
├── imsmanifest.xml            must be at the zip root
├── non_cc_assessments/
│   └── nshm_hsa2025_toan.xml.qti   one <objectbank> per file; one file per bank
└── images/
    └── c01.png …              ASCII names, each listed in the manifest
```

- Several banks in one zip work: one file per bank. Every `.xml`, `.dat` and `.qti` file is parsed, with the manifest first (`Q:lib/imsqtiv1.py#L6332-L6355`).
- Do not put several `<objectbank>` elements in one file or `<section>` inside an objectbank. The DTD allows only one and neither case is tested.
- The zip name matters. Images land in `Quiz Files/<zip name up to the first ".">_<migration id>/` (`C:lib/canvas/migration/migrator_helper.rb#L69-L80`).

### 1.2 `imsmanifest.xml` (exact; the same file serves both layouts)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{{PKG_IDENT}}_manifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
    <imsmd:lom>
      <imsmd:general>
        <imsmd:title><imsmd:string>{{PACKAGE_TITLE}}</imsmd:string></imsmd:title>
      </imsmd:general>
    </imsmd:lom>
  </metadata>
  <organizations/>
  <resources>
    <!-- one per bank file -->
    <resource identifier="{{BANK_IDENT}}" type="imsqti_xmlv1p2" href="non_cc_assessments/{{BANK_IDENT}}.xml.qti">
      <file href="non_cc_assessments/{{BANK_IDENT}}.xml.qti"/>
    </resource>
    <!-- optional quiz (1.4) -->
    <resource identifier="{{QUIZ_IDENT}}" type="imsqti_xmlv1p2" href="{{QUIZ_IDENT}}/{{QUIZ_IDENT}}.xml">
      <file href="{{QUIZ_IDENT}}/{{QUIZ_IDENT}}.xml"/>
    </resource>
    <!-- one per image; every <img src> must equal one of these hrefs -->
    <resource identifier="img_{{K}}" type="webcontent" href="images/{{FILE}}">
      <file href="images/{{FILE}}"/>
    </resource>
  </resources>
</manifest>
```

What each part of the manifest actually does:
- **Resource `type` values are inert for this import.**
  - The Python tool reads only `<file href>`. Every href that does not end in `.xml`, `.dat` or `.qti` becomes a `webcontent` file (`Q:lib/imsqtiv1.py#L299-L385`).
  - `QtiWorker` never calls `PackageIdentifier` (`C:gems/plugins/qti_exporter/lib/canvas/migration/worker/qti_worker.rb#L23-L76`).
  - `imsqti_xmlv1p2` is still the safest value: it makes the package auto-detectable as `:qti` (`C:lib/canvas/migration/package_identifier.rb#L83-L85`).
- **No QTI 2 namespace, and no `<schema>QTIv2.x</schema>`.** Either one switches the import to the QTI 2 path (`C:.../qti/converter.rb#L85-L91`).
- **Do not add `course_settings/canvas_export.txt`.**
- **The manifest is required for images.** Without it, image files are never registered (§3).

### 1.3 Bank file `non_cc_assessments/{{BANK_IDENT}}.xml.qti` (exact)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <objectbank ident="{{BANK_IDENT}}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>bank_title</fieldlabel>
        <fieldentry>{{BANK_TITLE}}</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    {{ITEMS}}
  </objectbank>
</questestinterop>
```

- **`<objectbank>` must be a direct child of `<questestinterop>`.** Otherwise the Python tool raises `QTIException`, the whole file is skipped and Canvas shows no error (`Q:lib/imsqtiv1.py#L660`, `#L6350-L6353`).
- **`bank_title` must come before the first `<item>`.** Each item copies the bank name when it starts (`Q:lib/imsqtiv1.py#L1929-L1930`).
- **The title is cut at 255 characters, with a warning** (`C:app/models/importers/assessment_question_importer.rb#L87-L90`).
- **Leave out `bank_type`, `bank_state` and `bank_context_uuid`.** They are not in the importer's field map (`Q:lib/imsqtiv1.py#L3241-L3270`).

### 1.4 Optional: quiz plus bank

Use the same zip and add a quiz file at `{{QUIZ_IDENT}}/{{QUIZ_IDENT}}.xml`. The quiz has one group per bank and draws all N questions from it with `sourcebank_ref`. That gives a quiz without a second, quiz-named copy of the bank.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <assessment ident="{{QUIZ_IDENT}}" title="{{QUIZ_TITLE}}">
    <qtimetadata>
      <qtimetadatafield><fieldlabel>cc_maxattempts</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
      <section ident="{{QUIZ_IDENT}}_g1" title="{{GROUP_TITLE}}">
        <selection_ordering>
          <selection>
            <sourcebank_ref>{{BANK_IDENT}}</sourcebank_ref>
            <selection_number>{{N_ITEMS_IN_BANK}}</selection_number>
            <selection_extension>
              <points_per_item>{{POINTS}}</points_per_item>
            </selection_extension>
          </selection>
        </selection_ordering>
      </section>
    </section>
  </assessment>
</questestinterop>
```

- Canvas parses this into a question group with `question_bank_migration_id`, `pick_count` and `question_points` (`C:.../qti/assessment_test_converter.rb#L170-L200`). The group is linked to the bank by `migration_id` (`C:app/models/importers/quiz_group_importer.rb#L62`).
- The spec "converts links to external banks" runs this structure through the real converter (`C:.../canvas_questions_spec.rb#L153-L172`).
- Limits:
  - points are the same for every item in a group;
  - question order is random;
  - set time limit and attempts in the Canvas UI after import. The unit handling of `qmd_timelimit` is UNCONFIRMED.
- `assessment_meta.xml` is optional. If you include it, its identifiers must match.

### 1.5 How to import

**In the Canvas UI:**
1. Go to Course → Settings → Import Course Content.
2. Choose "QTI .zip file".
3. Leave "Default Question bank" alone. It applies only to questions that have no bank.
4. When re-importing an updated package, check "Overwrite assessment content with matching IDs". The checkbox sends `settings.overwrite_quizzes` (`C:ui/shared/content-migrations/react/CommonMigratorControls/CommonMigratorControls.tsx#L201`).
5. Leave "Import existing quizzes as New Quizzes" unchecked. It disables the bank selector (`C:ui/features/content_migrations/react/components/migrator_forms/qti_zip.tsx#L58-L71`), and its behaviour with objectbanks is UNCONFIRMED.

**Re-import rules:**
- Without overwrite, existing ids get the migration id as a prefix, so you get a duplicate bank (`C:app/models/importers/content_importer_helper.rb#L23-L42`; `C:app/models/content_migration.rb#L503-L533`).
- With overwrite, the same bank and the same items are updated in place.
- Matching is course-wide by item `ident` (`C:app/models/importers/assessment_question_importer.rb#L41-L49`, `#L151-L157`). An item ident reused in another bank would be **moved** into it, so item idents must contain the bank id.

**Via the API** (needed only for a future push-to-Canvas button):
- `POST /api/v1/courses/:id/content_migrations` with `migration_type=qti_converter`, `pre_attachment[name]=…` and `settings[overwrite_quizzes]=true`, then upload the file and poll the progress endpoint (https://canvas.instructure.com/doc/api/content_migrations.html).
- The user will need to supply the Canvas base URL, the course id and an access token that they generate themselves. The tool must not enter credentials on their behalf.

---

## 2. Item templates

### 2.0 Rules that apply to every type

**Placeholders and escaping:**
- `{{X}}` is inserted XML-escaped: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`. Inside attributes, also `"` → `&quot;`.
- `{{STEM}}`, `{{OPT_HTML}}` and `{{SOLUTION}}` are cleaned HTML strings (§5). Wrap `{{STEM}}` as `<div>…</div>` and then XML-escape it. Use entity escaping, not CDATA (§6, D1).
- Keep Vietnamese as raw UTF-8. Write no BOM, and start with the `<?xml version="1.0" encoding="UTF-8"?>` declaration.
- Strip characters that are illegal in XML: U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+FFFE and U+FFFF. The parser is lxml with `recover=True` (`Q:lib/imsqtiv1.py#L6302`) and silently truncates at these.

**Element order:** `item@ident,title` → `itemmetadata/qtimetadata` (`question_type`, `points_possible`, `original_answer_ids`) → `presentation` (stem `material` first) → `resprocessing` → `itemfeedback*`. This is Canvas's exporter order (`C:lib/cc/qti/qti_items.rb#L99-L161`).

**Identifiers:**

| What | Rule | Example |
|---|---|---|
| Bank `ident` | `^[A-Za-z_][A-Za-z0-9_-]{0,63}$`; stable; unique per course | `nshm_hsa2025_toan` |
| Item `ident` | `<BANK_IDENT>_q<NN>[_s<k>]`. The tool turns non-NMTOKEN characters into `_`, adds an `ID_` prefix when the first character is not a letter (`Q:lib/imscp.py#L161-L172`) and turns `:` into `-` (`Q:lib/imsqtiv1.py#L1976-L1981`). | `nshm_hsa2025_toan_q07` |
| Answer `ident` | Positive integers, unique within the item (`NN*100+k`). Ids are random on QTI .zip imports anyway, but integers keep the package valid if it is ever imported as Canvas flavour. | `701`…`704` |
| Matching right-side `ident` | Integers whose **digit run** is unique (`NN*100+50+k`). `match_id` is the first `\d+` in the ident (`C:.../qti/associate_interaction.rb#L117-L121`). Never use prefixes that contain digits, such as `q7_m1`. | `751`, `752` |
| Blank id | `^[a-z][a-z0-9_]{0,15}$`, unique, and appearing **exactly once** as `[id]` in the stem. Canvas substitutes it with `Regexp.new("\\[#{variable}\\]")` and `text.sub`, so it is unescaped and replaces only the first match (`C:app/models/quizzes/quiz_question_builder.rb#L146-L189`). The Python tool turns `.` and `:` into `_` (`Q:lib/imsqtiv1.py#L164-L172`). | `b1`, `b2` |
| `title` | Plain text; becomes the question name in the bank (`C:.../qti/assessment_item_converter.rb#L89`) | `Câu 07` |

**`points_possible`:** a decimal number written with `.`. Missing means 1 (`C:.../qti/assessment_item_converter.rb#L167`, `#L182-L187`).

**Optional feedback** (use `general_fb` for "Lời giải / hướng dẫn giải"; it becomes `neutral_comments_html` per `C:.../qti/assessment_item_converter.rb#L261-L282`):
- `FB_COND` goes first inside `<resprocessing>`, right after `<outcomes>`:
  ```xml
  <respcondition continue="Yes"><conditionvar><other/></conditionvar><displayfeedback feedbacktype="Response" linkrefid="general_fb"/></respcondition>
  ```
- `FB_BLOCK` goes after `</resprocessing>`:
  ```xml
  <itemfeedback ident="general_fb"><flow_mat><material><mattext texttype="text/html">{{SOLUTION}}</mattext></material></flow_mat></itemfeedback>
  ```
- An `itemfeedback` is imported even when nothing references it (`ItemFeedback.CloseObject`, `Q:lib/imsqtiv1.py#L5102-L5103`). Keep `FB_COND` anyway to match Canvas's own output.
- Other ids follow the same pattern: `correct_fb` → correct comments, `general_incorrect_fb` → incorrect comments, `<answerId>_fb` → per-answer comments.

**Option `texttype`:**
- **MC and MA options:** `text/plain` when the option has no markup, otherwise `text/html`. This is Canvas's `html_mat_text` (`C:lib/cc/qti/qti_items.rb#L560-L567`).
- **Blank, dropdown and matching right-side options:** always `text/plain` with plain text, because these are stored as text only (`C:.../qti/fill_in_the_blank.rb#L92`, `C:.../qti/associate_interaction.rb#L122`). Dropdowns are rendered as `CGI.escapeHTML(answer_text)` inside `<option>` (`C:app/models/quizzes/quiz_question_builder.rb#L170-L175`).

**`rcardinality="Single"` on every single-select `response_lid`**, including blank, dropdown and matching lids. Canvas omits it there; it is the QTI default and harmless, and it helps New Quizzes (report C, P14).

**Amendment (2026-10-02, found with the Canvas simulator `tests/sim-chay.cjs`; implemented in `js/qti.js`, see DESIGN §5.2):**
- **Text-only HTML goes out as `text/plain`.** When an MC/MA option, a matching left side or the `general_fb` solution is
  HTML that, after stripping leading/trailing whitespace and `<br>` and unwrapping attribute-less `<p>`/`<div>`/`<span>`
  layers, is a single text node containing `&`, `<`, `>` or a non-breaking space, Canvas's `detect_html`
  (`html_helper.rb#L114-L132`, `remove_extraneous_nodes`) treats it as plain text but stores the *escaped* HTML string
  (`2 &lt; 3`) in the text field (`text` / `left` / `neutral_comments`); the take-quiz page prints that field through
  ERB escaping, so students see a literal `&lt;`. Such fragments are written as `texttype="text/plain"` with entities
  decoded. FB_BLOCK above can therefore be `text/plain`, not always `text/html`. `tests/kiem-qti.cjs` warns
  (`html-escaped-text`) on any `text/html` fragment of this shape.
- **Safety net.** Canvas only unwraps the outermost unknown tag, so `<center><script>…` inside a solution keeps its
  `<script>` after import. Any HTML that still contains `script`, `on…=`, `javascript:` and similar is cleaned again with
  `html.cleanForCanvas`; without `html.js` the question is not exported.
- Dropdown options, matching right sides and distractors have newlines and double spaces collapsed; with
  `math: 'image'`, an empty `<math>` is dropped.

### 2.1 `multiple_choice_question`

```xml
<item ident="{{ITEM_IDENT}}" title="{{TITLE}}">
  <itemmetadata>
    <qtimetadata>
      <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_choice_question</fieldentry></qtimetadatafield>
      <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>{{POINTS}}</fieldentry></qtimetadatafield>
      <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>{{A1}},{{A2}},{{A3}},{{A4}}</fieldentry></qtimetadatafield>
    </qtimetadata>
  </itemmetadata>
  <presentation>
    <material><mattext texttype="text/html">{{STEM}}</mattext></material>
    <response_lid ident="response1" rcardinality="Single">
      <render_choice>
        <response_label ident="{{A1}}"><material><mattext texttype="text/plain">{{OPT1_TEXT}}</mattext></material></response_label>
        <response_label ident="{{A2}}"><material><mattext texttype="text/html">{{OPT2_HTML}}</mattext></material></response_label>
        <!-- … one response_label per option, in display order … -->
      </render_choice>
    </response_lid>
  </presentation>
  <resprocessing>
    <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
    <!-- FB_COND (optional) -->
    <respcondition continue="No">
      <conditionvar><varequal respident="response1">{{A_CORRECT}}</varequal></conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
  </resprocessing>
  <!-- FB_BLOCK (optional) -->
</item>
```

Exactly one correct option. If none is marked, the question is imported with the warning "couldn't determine the correct answers" (`C:.../qti/choice_interaction.rb#L101-L104`).

### 2.2 `true_false_question` (English labels only)

- Same as 2.1, with `question_type` = `true_false_question`, exactly two options with the texts `True` and `False`, and `original_answer_ids` = `{{T}},{{F}}`.
- Canvas keeps the type only when there are exactly two answers matching `/true/i` and `/false/i`. Anything else is silently changed to `multiple_choice_question` (`C:.../qti/choice_interaction.rb#L53-L71`).
- **For a Vietnamese single statement, use 2.1 with the options `Đúng` and `Sai`.**

### 2.3 `multiple_answers_question`

```xml
<item ident="{{ITEM_IDENT}}" title="{{TITLE}}">
  <itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_answers_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>{{POINTS}}</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>{{A1}},{{A2}},{{A3}},{{A4}}</fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation>
    <material><mattext texttype="text/html">{{STEM}}</mattext></material>
    <response_lid ident="response1" rcardinality="Multiple">
      <render_choice>
        <response_label ident="{{A1}}"><material><mattext texttype="text/plain">{{OPT1}}</mattext></material></response_label>
        <!-- … -->
      </render_choice>
    </response_lid>
  </presentation>
  <resprocessing>
    <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
    <!-- FB_COND (optional) -->
    <respcondition continue="No">
      <conditionvar>
        <and>
          <!-- in option order: correct → bare varequal; wrong → wrapped in <not> -->
          <varequal respident="response1">{{A1}}</varequal>
          <not><varequal respident="response1">{{A2}}</varequal></not>
          <varequal respident="response1">{{A3}}</varequal>
          <not><varequal respident="response1">{{A4}}</varequal></not>
        </and>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
  </resprocessing>
  <!-- FB_BLOCK -->
</item>
```

The correct options are read from `responseIf and > member` (`C:.../qti/choice_interaction.rb#L199-L209`). At least one option must be correct.

### 2.4 `short_answer_question` ("Fill in the blank", one blank)

```xml
<item ident="{{ITEM_IDENT}}" title="{{TITLE}}">
  <itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>short_answer_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>{{POINTS}}</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>{{S1}},{{S2}},{{S3}}</fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation>
    <material><mattext texttype="text/html">{{STEM}}</mattext></material>
    <response_str ident="response1" rcardinality="Single">
      <render_fib><response_label ident="answer1" rshuffle="No"/></render_fib>
    </response_str>
  </presentation>
  <resprocessing>
    <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
    <!-- FB_COND (optional) -->
    <respcondition continue="No">
      <conditionvar>
        <!-- one sibling varequal per accepted string; no <or> wrapper (Canvas exporter qti_items.rb#L338-L348) -->
        <varequal respident="response1">{{ACCEPT_1}}</varequal>
        <varequal respident="response1">{{ACCEPT_2}}</varequal>
        <varequal respident="response1">{{ACCEPT_3}}</varequal>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
  </resprocessing>
  <!-- FB_BLOCK -->
</item>
```

- **At least one non-empty accepted string is required.** With none, the question silently becomes an essay (`C:.../qti/extended_text_interaction.rb#L26-L39`).
- **How Canvas compares answers:** `CGI.escapeHTML(x).strip.downcase` on both sides (`C:app/models/quizzes/quiz_question/short_answer_question.rb#L36-L47`). That means:
  - case-insensitive;
  - no Unicode normalisation;
  - spaces inside the answer count.
- **So the generator should add variants automatically:**
  - comma and dot decimals (`2,67` and `2.67`);
  - `−` (U+2212) and `-`;
  - optionally an NFD copy of answers with Vietnamese diacritics.
- Keep the source KEYS variants such as `8/3`.

### 2.5 `fill_in_multiple_blanks_question`

```xml
<item ident="{{ITEM_IDENT}}" title="{{TITLE}}">
  <itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>fill_in_multiple_blanks_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>{{POINTS}}</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>{{B1_1}},{{B1_2}},{{B2_1}}</fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation>
    <material><mattext texttype="text/html">{{STEM_CONTAINING_[b1]_AND_[b2]}}</mattext></material>
    <response_lid ident="response_b1" rcardinality="Single">
      <material><mattext>b1</mattext></material>
      <render_choice>
        <!-- every label = an ACCEPTED spelling (all become weight 100) -->
        <response_label ident="{{B1_1}}"><material><mattext texttype="text/plain">{{B1_ACCEPT_1}}</mattext></material></response_label>
        <response_label ident="{{B1_2}}"><material><mattext texttype="text/plain">{{B1_ACCEPT_2}}</mattext></material></response_label>
      </render_choice>
    </response_lid>
    <response_lid ident="response_b2" rcardinality="Single">
      <material><mattext>b2</mattext></material>
      <render_choice>
        <response_label ident="{{B2_1}}"><material><mattext texttype="text/plain">{{B2_ACCEPT_1}}</mattext></material></response_label>
      </render_choice>
    </response_lid>
  </presentation>
  <resprocessing>
    <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
    <!-- FB_COND (optional) -->
    <respcondition>
      <conditionvar><varequal respident="response_b1">{{B1_1}}</varequal></conditionvar>
      <setvar varname="SCORE" action="Add">{{PCT}}</setvar>
    </respcondition>
    <respcondition>
      <conditionvar><varequal respident="response_b2">{{B2_1}}</varequal></conditionvar>
      <setvar varname="SCORE" action="Add">{{PCT}}</setvar>
    </respcondition>
  </resprocessing>
  <!-- FB_BLOCK -->
</item>
```

- `{{PCT}}` = `"%.2f" % (100/number of blanks)`.
- **No distractors are possible.** Every label gets weight 100 (`C:.../qti/fill_in_the_blank.rb#L81-L96`).
- The blank id is the `response_lid` ident with the `response_` prefix removed.
- The `<mattext>b1</mattext>` prompt is ignored as question text (`C:.../qti/assessment_item_converter.rb#L110-L127`).

### 2.6 `multiple_dropdowns_question`

The shape is identical to 2.5, with three differences:
- `question_type` = `multiple_dropdowns_question`.
- Each `response_lid` lists **all** options for that blank, wrong ones included, as plain text.
- Exactly one `respcondition` per blank names the correct option, with `<setvar varname="SCORE" action="Add">{{PCT}}</setvar>`.

```xml
    <response_lid ident="response_b1" rcardinality="Single">
      <material><mattext>b1</mattext></material>
      <render_choice>
        <response_label ident="{{B1_1}}"><material><mattext texttype="text/plain">Đúng</mattext></material></response_label>
        <response_label ident="{{B1_2}}"><material><mattext texttype="text/plain">Sai</mattext></material></response_label>
      </render_choice>
    </response_lid>
    …
    <respcondition>
      <conditionvar><varequal respident="response_b1">{{B1_CORRECT}}</varequal></conditionvar>
      <setvar varname="SCORE" action="Add">{{PCT}}</setvar>
    </respcondition>
```

- `Add` is mandatory. With `Set`, the question imports with no correct answer and no error (`C:.../qti/fill_in_the_blank.rb#L99-L107`).
- **Default for the THPT multi-statement Đúng/Sai (tf) type:**
  - stem: `a) … [b1]<br>b) … [b2]<br>c) … [b3]<br>d) … [b4]`;
  - options per blank: `Đúng` and `Sai`.

### 2.7 `matching_question`

```xml
<item ident="{{ITEM_IDENT}}" title="{{TITLE}}">
  <itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>matching_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>{{POINTS}}</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>{{L1}},{{L2}},{{L3}}</fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation>
    <material><mattext texttype="text/html">{{STEM}}</mattext></material>
    <response_lid ident="response_{{L1}}" rcardinality="Single">
      <material><mattext texttype="text/plain">{{LEFT1}}</mattext></material>  <!-- or text/html -->
      <render_choice>
        <!-- ALL right options incl. distractors, same list and order in EVERY lid -->
        <response_label ident="{{R1}}"><material><mattext texttype="text/plain">{{RIGHT1}}</mattext></material></response_label>
        <response_label ident="{{R2}}"><material><mattext texttype="text/plain">{{RIGHT2}}</mattext></material></response_label>
        <response_label ident="{{R3}}"><material><mattext texttype="text/plain">{{RIGHT3_DISTRACTOR}}</mattext></material></response_label>
      </render_choice>
    </response_lid>
    <!-- … one response_lid per left item … -->
  </presentation>
  <resprocessing>
    <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
    <!-- FB_COND (optional) -->
    <respcondition>
      <conditionvar><varequal respident="response_{{L1}}">{{R_FOR_L1}}</varequal></conditionvar>
      <setvar varname="SCORE" action="Add">{{PCT_LEFT}}</setvar>
    </respcondition>
    <!-- … one per left item … -->
  </resprocessing>
  <!-- FB_BLOCK -->
</item>
```

- The right-side list is read **only from the first** `choiceInteraction` (`C:.../qti/associate_interaction.rb#L112-L124`).
- A match is recorded only when its condition becomes `sum`, which `Add` produces (`C:.../qti/associate_interaction.rb#L137-L150`).
- Several left items may share one right option. Grading also accepts identical right-side text (`C:app/models/quizzes/quiz_question/matching_question.rb#L29-L34`).
- Images on the right side, or on both sides, trigger warnings (`C:.../qti/associate_interaction.rb#L81-L105`). Avoid them.

### 2.8 `numerical_question`

Use this only for plain decimal answers, and tell students to type a dot (§6, D9).

```xml
<item ident="{{ITEM_IDENT}}" title="{{TITLE}}">
  <itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>numerical_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>{{POINTS}}</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry>{{N1}},{{N2}}</fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation>
    <material><mattext texttype="text/html">{{STEM}}</mattext></material>
    <response_str ident="response1" rcardinality="Single">
      <render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib>
    </response_str>
  </presentation>
  <resprocessing>
    <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
    <!-- exact (± margin). ALWAYS keep the <or> even with no margin; drop only the inner <and> -->
    <respcondition continue="No">
      <conditionvar>
        <or>
          <varequal respident="response1">{{EXACT}}</varequal>
          <and>
            <vargte respident="response1">{{EXACT_MINUS_MARGIN}}</vargte>
            <varlte respident="response1">{{EXACT_PLUS_MARGIN}}</varlte>
          </and>
        </or>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
    <!-- range answer (alternative or additional row) -->
    <respcondition continue="No">
      <conditionvar>
        <vargte respident="response1">{{MIN}}</vargte>
        <varlte respident="response1">{{MAX}}</varlte>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
  </resprocessing>
</item>
```

- An exact answer without `<or>` is dropped, because the importer looks for `or` and then `and` (`C:.../qti/numeric_interaction.rb#L55-L113`). Canvas itself always writes the `<or>` (`C:lib/cc/qti/qti_items.rb#L350-L363`).
- The margin is read back as the `varlte` value minus the exact value, so keep the bounds symmetric.
- Do **not** generate precision answers. They are detected through `vargt` bounds ending in 5 (`C:.../qti/numeric_interaction.rb#L69-L87`). Using `vargte` keeps exact answers from being misread as precision answers.

### 2.9 `essay_question`

```xml
<item ident="{{ITEM_IDENT}}" title="{{TITLE}}">
  <itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>essay_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>{{POINTS}}</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry></fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation>
    <material><mattext texttype="text/html">{{STEM}}</mattext></material>
    <response_str ident="response1" rcardinality="Single">
      <render_fib><response_label ident="answer1" rshuffle="No"/></render_fib>
    </response_str>
  </presentation>
  <resprocessing>
    <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
    <!-- FB_COND (optional: grading guide as neutral comments) -->
    <respcondition continue="No"><conditionvar><other/></conditionvar></respcondition>
  </resprocessing>
  <!-- FB_BLOCK -->
</item>
```

### 2.10 `text_only_question`

```xml
<item ident="{{ITEM_IDENT}}" title="{{TITLE}}">
  <itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>text_only_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>0</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>original_answer_ids</fieldlabel><fieldentry></fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation>
    <material><mattext texttype="text/html">{{STEM}}</mattext></material>
  </presentation>
</item>
```

- No `resprocessing`. Canvas also writes a `passage` field, but the importer ignores it, so leave it out.
- In banks this type is of little use: random draws separate a passage from its questions. Put shared passages into each question's stem instead.

### 2.11 How Canvas Classic scores each type

Partial credit is on by default. The QTI import has no field to turn it off (`C:app/models/quizzes/quiz_question/question_data.rb#L65`, `#L121-L125`). Scores are `correct_parts / total_parts × points`, minus a dock for wrong selections (`C:app/models/quizzes/quiz_question/user_answer.rb#L38-L52`; `C:app/models/quizzes/quiz_question/base.rb#L113-L131`).

| Type | Credit |
|---|---|
| MC / TF / short answer / numerical | All or nothing. Short answer and numerical: any accepted row counts. |
| Multiple answers | `pts × (correct options ticked − wrong options ticked) / number of correct options`, never below 0 (`C:app/models/quizzes/quiz_question/multiple_answers_question.rb#L22-L58`). |
| Fill in multiple blanks | `pts × blanks right / number of blanks`. Each blank is compared with `strip.downcase` against any of its accepted strings (`C:app/models/quizzes/quiz_question/fill_in_multiple_blanks_question.rb#L22-L71`). |
| Dropdowns | `pts × blanks right / number of blanks`, compared by id (`C:app/models/quizzes/quiz_question/multiple_dropdowns_question.rb#L21-L24`). |
| Matching | `pts × left items right / number of left items`, with no dock (`C:app/models/quizzes/quiz_question/matching_question.rb#L22-L46`). |
| Essay | Graded by the teacher. |
| Text only | Not scored. |

The non-linear THPT Đúng/Sai scale (0.1 / 0.25 / 0.5 / 1) **cannot** be reproduced. Canvas only scores linearly.

### 2.12 Mapping our SCORM types

This mapping is design inference, not something Canvas defines.

| SCORM type | Canvas type |
|---|---|
| `mcq` | 2.1. HTML options (MathML, img) are fine. |
| `multi` | 2.3 |
| `tf` with one statement | 2.1 with `Đúng` / `Sai` |
| `tf` with several statements | 2.6, one blank per statement. Alternative: N separate 2.1 items `_s1…_sN`. |
| `short` | **2.4** with every KEYS variant plus automatic comma/dot and minus twins. Use 2.8 only when a tolerance is needed. |
| `gap` / `flow` (typed) | 2.5 |
| `bank` (word bank) | 2.6, each blank listing the bank words |
| `letters` / `select` | 2.7, or 2.6 when the choices sit inline |
| `mistake` | 2.1. The stem shows the underlined, labelled segments (`<u>`); the options are the labels or the segments. |

Note that Classic quizzes with "Shuffle answers" on will reorder options like "Cả A và B".

---

## 3. Images

**What to write:**
- **Zip:** put files at `images/<name>`.
- **Manifest:** one `webcontent` resource per file (§1.2).
- **HTML:** `<img src="images/<name>" alt="…" style="max-width:100%;height:auto">`. The `src` must equal the manifest `href` **exactly**.
- **File names:** `^[a-z0-9][a-z0-9_-]{0,80}\.(png|jpe?g|gif)$`, unique in the zip. Why:
  - the Python tool cannot encode non-ASCII path characters; characters above U+00FF become `?` (`Q:lib/xmlutils.py#L73-L87`);
  - `CGI.unescape` turns `+` into a space (`C:.../qti.rb#L122`);
  - matching falls back to path suffixes, so duplicate base names are ambiguous (`C:.../qti/html_helper.rb#L108-L110`).

**How Canvas resolves them:**
1. The Python tool registers every manifest `<file href>` that is not `.xml`, `.dat` or `.qti`. It does **not** scan HTML inside `mattext` (`Q:lib/imsqtiv1.py#L299-L385`).
2. Ruby `convert_files` maps each href to `path_name` = href without `web_resources/` (`C:.../qti/converter.rb#L140-L157`; `C:.../qti.rb#L113-L125`).
3. `Qti::HtmlHelper#sanitize_html!` resolves `src` by an exact match, then the shortest key that ends with the path. It rewrites the link to `$CANVAS_OBJECT_REFERENCE$/attachments/<mig_id>` (`C:.../qti/html_helper.rb#L38-L71`, `#L108-L110`).

**Where the files end up:**
- In the hidden course folder `Quiz Files/<zip name up to the first ".">_<content migration id>/images/<name>` (`C:.../qti/converter.rb#L46`, `#L73`; `C:lib/canvas/migration/migrator_helper.rb#L32`, `#L69-L80`).
- Each referenced file is then cloned into the question context as `/assessment_questions/<aq>/files/<id>/download?verifier=…` (`C:app/models/assessment_question.rb#L130-L186`).
- Every import creates a new folder.

**Other reference forms:**
- `$IMS-CC-FILEBASE$/images/x.png` and text2qti's `%24IMS-CC-FILEBASE%24/images/x.png` also work, but by a different route.
  - The HtmlHelper token regex `/\$[A-Z_]*\$/` does not match the hyphenated token (`C:.../qti/html_helper.rb#L63`).
  - Later, canvas_link_migrator decodes `%24` (`CLM:lib/canvas_link_migrator/link_parser.rb#L133-L143`), parses the token (`#L252-L260`) and resolves the path by exact, case-insensitive or suffix match (`CLM:lib/canvas_link_migrator/link_resolver.rb#L176-L215`).
  - Do not use them; the relative path is simpler.
- **`data:` URIs are removed.** The sanitizer allows only `http`, `https` and relative paths in `img src` (`C:gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb#L49`, `#L662`), and it runs before the link migrator. Extract them to files.
- **No images in blank, dropdown or matching right-side options.** Those are plain text.

---

## 4. Math

**MathML survives the import.**
- The escaped HTML string passes through the Python tool untouched (§0, fact 3).
- The Ruby sanitizer allows the MathML elements (`C:.../canvas_sanitize.rb#L142-L187`). Per-element attributes are also allowlisted; `math` allows `display`, `displaystyle`, `alttext` and `xmlns` (`C:.../canvas_sanitize.rb#L294-L390`).
- Canvas's spec "allows valid MathML" covers this (`C:gems/canvas_sanitize/spec/canvas_sanitize/canvas_sanitize_spec.rb#L150-L160`).
- `mspace@width` is **not** allowed (`C:.../canvas_sanitize.rb#L498`). Replace `<mspace width=…/>` with `<mtext>` containing a thin space (U+2009).

**MathML renders.**
- Question text is output inside `.user_content` (`C:app/views/quizzes/quizzes/_display_question.html.erb#L165`, `#L178`, `#L221`).
- `isMathInElement` returns true for any visible `<math>`, **whether or not** the feature flag is on (`C:packages/canvas-rce/src/enhance-user-content/mathml.js#L181-L191`). It then loads MathJax 2.7.7 `TeX-MML-AM_SVG` (`#L51-L74`).
- Current browsers also render MathML natively.

**Watch the length.** Question text longer than 16,384 characters after conversion is replaced with "The imported question text for this question was too long." (`C:app/models/importers/assessment_question_importer.rb#L201-L205`). MathML is verbose. The tool should warn at about 15,000 characters, and may drop `<semantics>`/`<annotation>` to save space.

**Plain-text slots** (dropdowns, blanks, matching right side): use Unicode math such as x², √, ≤, −, ½ and π.

**Fallback, only if a sandbox test shows MathML failing:**
```html
<img class="equation_image" title="{{LATEX}}" src="/equation_images/{{encodeURIComponent(encodeURIComponent(LATEX))}}?scale=1" alt="LaTeX: {{LATEX}}" data-equation-content="{{LATEX}}">
```
- The link migrator leaves `img.equation_image` alone (`CLM:lib/canvas_link_migrator/link_parser.rb#L276-L279`). The `class` attribute is required for that.
- The front end decodes the path twice (`C:packages/canvas-rce/src/enhance-user-content/mathml.js#L279-L290`). text2qti uses the same template and notes "Double url escaping is required" (https://github.com/gpoore/text2qti/blob/80dac052bec7953e5790567cf5a500644886d5b8/text2qti/markdown.py#L240-L262).
- Do not use `\( \)` or `$$` delimiters. They are processed only when `new_math_equation_handling` is on (`C:packages/canvas-rce/src/enhance-user-content/mathml.js#L164-L178`).

---

## 5. HTML: what survives sanitisation, and rules for our cleaner

The sanitizer allowlist is `C:gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb#L57-L750`.

**Kept:**
- **Elements:** `a b blockquote br caption cite code col colgroup dd del div dl dt em figure figcaption font h1-h6 hr i img ins li ol p pre q small span strike strong sub sup table tbody td tfoot th thead tr u ul abbr section article aside details summary mark ruby rt rp`, plus the MathML elements.
- **Global attributes:** `style class id title role lang dir data-* aria-*` (`#L198`).
- **`img`:** `align alt height src usemap width longdesc`.
- **`table`:** `summary width border cellpadding cellspacing center frame rules`.
- **`td`:** `colspan rowspan width align valign` and others.

**Dropped:**
- **Elements:** `svg style script input button label s` and any other element not on the list.
- **CSS:** only the listed properties survive (`#L668-L750`). These do **not**: `font-weight`, `opacity`, `letter-spacing`, `text-transform`, `transform`, `box-shadow`, `bottom`, `transition`.

**Cleaner rules:**
1. **Inline the SCORM class styles.** `class` attributes are kept, but Canvas has no stylesheet for them. Write `border`, `padding`, `text-align`, `color`, `background-color`, `overflow-x:auto` and similar as inline `style`.
2. **Formatting tags:**
   - bold: `font-weight` → `<strong>`;
   - italic: `<em>`;
   - underline: `<u>` (allowed, `#L108`);
   - strikethrough: `<s>` → `<del>`.
3. **Resolve `var(--x)` to literal values.** Whether the sanitizer keeps `var()` is UNCONFIRMED.
4. **Tables:** `<table style="border-collapse:collapse">` and cells with `style="border:1px solid #999;padding:4px 8px"`. Wrap wide tables in `<div style="overflow-x:auto">`.
5. **Remove** the SCORM interactive bits (`input`, `button`, `label`), event handlers, `loading` attributes and `data:` URIs (extract them per §3).
6. **Treat HTML as an opaque string, then XML-escape it.** HTML entities such as `&lt;` and `&nbsp;` stay valid. Normalise text to NFC.
7. **Wrap the stem in a bare `<div>`.** Canvas strips a single attribute-less outer container (`CLM:lib/canvas_link_migrator/link_parser.rb#L56`, `#L120-L127`).
8. **SCORM `hint` text:** append as `<p><em>(…)</em></p>`.
9. **Brackets in blank and dropdown stems:**
   - every `[id]` must appear exactly once (§2.0);
   - literal brackets such as `[−10;10]` are fine as long as the content is not a blank id;
   - Canvas's display code scans `\[[A-Za-z0-9_\-.]+\]` (`C:app/views/quizzes/quizzes/_display_question.html.erb#L327`).
10. **Validate before zipping:**
    - every `<img src>` is in the manifest;
    - every short answer has at least one accepted string;
    - every MC item has exactly one correct option;
    - every dropdown blank has exactly one correct option;
    - every matching left item has a right option;
    - stem length is 15,000 characters or less.

---

## 6. Resolved disagreements

| # | Point | A / B / C said | Resolution and evidence |
|---|---|---|---|
| D1 | How HTML goes into `mattext` | A and C (text2qti): entity-escape. B and R/exams: CDATA. | Both parse to the same string (lxml, `Q:lib/imsqtiv1.py#L6302`; opaque text, `#L4087-L4089`). **Use entity escaping**, which is Canvas's own export (`C:spec/lib/cc/qti/qti_generator_spec.rb`) and has no `]]>` edge case. Raw tags are never allowed. |
| D2 | `mattext` with no `texttype` | A: becomes text/html. DTD: text/plain. | **text/html** (`Q:lib/imsqtiv1.py#L4033-L4034`). Always set `texttype` on content. |
| D3 | `true_false_question` | A gave the template with no caveat. B and C: it gets demoted. | **Demoted to MC unless the labels match True and False** (`C:.../qti/choice_interaction.rb#L53-L71`). Vietnamese → MC Đúng/Sai. |
| D4 | QTI .zip flavor | A: UNCONFIRMED. | **No flavor** (§0, fact 1). Answer ids are random, which is harmless. Still emit integers and `original_answer_ids`. |
| D5 | Manifest resource `type` and auto-detection | A: needs `imsqti*`. B: `imsqti_xmlv1p2`. Canvas: LOR for banks. | Inert for QTI .zip (`Q:lib/imsqtiv1.py#L299-L385`; `QtiWorker` does not use `PackageIdentifier`). Use `imsqti_xmlv1p2`. |
| D6 | Does an objectbank-only zip create a quiz? | B: no. C: UNCONFIRMED; qtiConverter says a quiz is made. | **No quiz** (`Q:lib/imsqtiv1.py#L1337`; `C:.../qti.rb#L72-L88`; spec `canvas_questions_spec.rb#L125-L151`). qtiConverter makes a quiz because it emits `<assessment>`. |
| D7 | Image reference form | A: `$IMS-CC-FILEBASE$` with `web_resources/`. B: relative. C: why the token works was UNCONFIRMED. | Both work (§3). The token is resolved by CLM. **Use the relative `images/x.png`.** |
| D8 | Where images land | A: `Quiz Files/<key>`. B: `…/<zip>_<mig>/`, hidden. | B is right (`C:lib/canvas/migration/migrator_helper.rb#L69-L80`), and files are then cloned into the question (`C:app/models/assessment_question.rb#L130-L186`). |
| D9 | `short` → numerical (A) or short answer (B) | — | **Short answer.** In Canvas `vi.yml` the decimal separator is "." and the delimiter "," (`C:config/locales/vi.yml#L21206-L21222`). The server strips the delimiter (`C:app/models/quizzes/quiz_question/numerical_question.rb#L31-L51`), and the client re-parses and rewrites the field (`C:ui/shared/i18n/numberHelper.ts#L25-L48`, `C:ui/features/take_quiz/jquery/index.js#L736-L744`). So "0,5" becomes 5. The KEYS also contain fractions such as `8/3`. |
| D10 | Multi-statement tf | A: split into items or dropdowns. B and C: dropdowns or MC. | **Dropdowns, one blank per statement**, with linear partial credit. Alternative: N split MC items. The THPT scale is impossible. |
| D11 | Right-side `texttype` in matching | Canvas writes none. | Same result either way (`sc.text.strip`). Use `text/plain`. |
| D12 | `rcardinality` on blank, dropdown and matching lids | Canvas omits it. C: New Quizzes needs it. | Add `Single`; it is the QTI default and harmless. |
| D13 | `itemfeedback` that nothing references | B: UNCONFIRMED. | Still imported (`Q:lib/imsqtiv1.py#L5102-L5103`). |
| D14 | Fill-in-multiple-blanks distractors | All three agree there are none. | Confirmed (`C:.../qti/fill_in_the_blank.rb#L89`). |
| D15 | `points_possible` "1" or "1.0" | — | No difference (`to_f`). |
| D16 | `assessment_question_identifierref` | text2qti puts it on quiz items. | Omit it in bank items, as Canvas's bank export does. Not needed with the `sourcebank_ref` quiz. |
| D17 | Short-answer case sensitivity | B: always case-insensitive. | Confirmed, including the HTML-escaped comparison (`C:app/models/quizzes/quiz_question/short_answer_question.rb#L36-L47`). |
| D18 | Precision-answer number formatting | A: inferred. | Avoided: we do not generate precision answers. |
| D19 | MathML in banks | R/exams warns about problems. | Code path supported (§4). The R/exams warning concerns copying quiz questions into banks, which does not apply here. |
| D20 | "A Classic QTI import always creates a quiz" (C, P13) | — | True only for `<assessment>`. |
| D21 | The CSS allowlist | B's claim. | Confirmed: `font-weight` and the others listed are absent (`C:.../canvas_sanitize.rb#L668-L750`). |
| D22 | Picking an existing bank as "Default Question bank" | B: may create a duplicate. | The code path supports B's reading (`C:app/models/importers/quiz_importer.rb#L63-L69` and `C:app/models/importers/assessment_question_importer.rb#L53-L56`, `#L75`). Avoided by always using an objectbank. |

## 7. Still UNCONFIRMED, with the safest choice for each

| Point | Safest choice |
|---|---|
| Practical end-to-end run of an objectbank-only zip on the school's Canvas. The code path and spec support it, but nobody has run it there. | Import a 10-question pilot covering every type into a sandbox course, then check the Migration Issues list and the question bank. I could not run QTIMigrationTool offline: Python is not installed on this machine. |
| MathML rendering on the Classic take-quiz page of this instance. The code path supports it. | Include it in the pilot. If it fails, use the `equation_image` fallback (§4). |
| Behaviour with "Import existing quizzes as New Quizzes" checked, and whether the instance has disabled Classic Quiz creation. | Leave the box unchecked and check the instance's feature settings. Question banks belong to Classic Quizzes. |
| Whether the sanitizer keeps CSS `var()`. | Resolve to literal values. |
| Whether deleting the `Quiz Files/...` folder breaks questions after the files are cloned. | Do not delete it. |
| Unit handling of `qmd_timelimit` in the optional quiz. | Leave it out and set the time limit in the Canvas UI. |
| Maximum zip upload size on the instance. | Keep packages small and compress the images. |
| Several `<objectbank>` elements in one file, or `<section>` inside an objectbank. | Do not do it: one bank per file. |
| Students typing NFD Vietnamese in short or blank answers. | Optionally add NFD copies of accepted answers. |