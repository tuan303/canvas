# How Canvas exports Classic Quizzes and question banks as QTI 1.2

I read the Canvas source directly instead of relying on documentation. I downloaded the exporter files from **instructure/canvas-lms at commit `1c9f0bb8013ed69c4f2efe11fd483025469b7e6c`** (master, 2026-04-30), the Python converter Canvas uses on import (**instructure/QTIMigrationTool at `aab28af7a05142140c6fd2f45ed67a4c925a7d1b`**), the XML library Canvas pins (**builder 3.3.0**), and the link resolver gem (**canvas_link_migrator 1.0.19**). The downloaded copies are in `C:\Users\ADMINI~1\AppData\Local\Temp\claude\C--Users-Administrator-Downloads-PM-chamthidua\dc508171-525f-4c6b-95a3-99cccd19d826\scratchpad\cc\`.

No Ruby was available on this machine, so the item XML in §3 was written by hand from the generator code. Three things confirm it:
- **Builder rules:** text escapes only `&`, `<`, `>`; attributes print in hash order; an element with no content prints as `<x .../>`; the indent is 2.
- **Canvas test expectations:** `spec/lib/cc/qti/qti_generator_spec.rb` contains exact expected XML for the bank header and a text-only item.
- **A real Canvas export:** the zip fixture `gems/plugins/qti_exporter/spec_canvas/fixtures/qti/canvas_qti.zip`.

The main sources, all at the commit above:
- [lib/cc/qti/qti_generator.rb](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb)
- [lib/cc/qti/qti_items.rb](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb)
- [lib/cc/qti/qti_manifest.rb](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_manifest.rb)
- [lib/cc/cc_helper.rb](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/cc_helper.rb)

---

## 0. Constants used throughout

From [cc_helper.rb L25–107](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/cc_helper.rb#L25-L107):

| Constant | Value |
|---|---|
| `QTI_EXTENSION` | `.xml.qti` |
| `ASSESSMENT_TYPE` (full course export) | `imsqti_xmlv1p2/imscc_xmlv1p1/assessment` |
| `QUESTION_BANK` | `imsqti_xmlv1p2/imscc_xmlv1p1/question-bank`. It is defined, but the QTI generator never uses it; banks are exported with the `LOR` type below. |
| `LOR` | `associatedcontent/imscc_xmlv1p1/learning-application-resource` |
| `WEBCONTENT` | `webcontent` |
| `QTI_ASSESSMENT_TYPE` (quiz-only export) | `imsqti_xmlv1p2` |
| `WEB_CONTENT_TOKEN` | `$IMS-CC-FILEBASE$` |
| `ASSESSMENT_CC_QTI` | `assessment_qti.xml` |
| `ASSESSMENT_NON_CC_FOLDER` | `non_cc_assessments` |
| `ASSESSMENT_META` | `assessment_meta.xml` |
| `WEB_RESOURCES_FOLDER` | `web_resources` |
| `CANVAS_NAMESPACE` | `http://canvas.instructure.com/xsd/cccv1p0` |

**Identifiers** come from `create_key` ([L119–129](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/cc_helper.rb#L119-L129)): `"g"` (global) or `"i"` followed by an MD5 hex digest. Examples:
- question in a bank: `create_key("assessment_question_<id>")`
- question in a quiz: `create_key("quiz_question_<id>")`
- question group: `create_key("quizzes/quiz_group_<id>")`

Current exports use the `g` prefix: the export spec's `mig_id` helper uses `global: true` ([cc_exporter_spec.rb L80–82](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/spec/lib/cc/cc_exporter_spec.rb#L80-L82)). The 2014 fixture uses the `i` prefix.

**Answer ids** are plain integers taken from Canvas's stored answer data, for example `7611` and `465` in the fixtures.

---

## 1. Package layout and `imsmanifest.xml`

### 1a. Quiz-only export ("Export Course Content → Quiz", `ContentExport::QTI`)

`CC::Qti::QtiManifest#create_document` ([qti_manifest.rb L52–108](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_manifest.rb#L52-L108)) calls `QtiGenerator#generate_qti_only`, which uses `for_cc: false` ([qti_generator.rb L136–156](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L136-L156)). The zip is named `<course-slug>-quiz-export.zip` ([cc_exporter.rb L227–237](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/cc_exporter.rb#L227-L237)).

```
imsmanifest.xml
<quizId>/<quizId>.xml            ← <questestinterop><assessment> (Canvas flavour, for_cc: false)
<quizId>/assessment_meta.xml     ← <quiz> settings (Canvas namespace)
non_cc_assessments/<bankId>.xml.qti   ← ONLY if the New Quizzes bank-migration flag is on (see below)
web_resources/<folder>/<file>    ← course files referenced from question HTML
assessment_questions/<path>      ← files whose context is AssessmentQuestion (no web_resources/ prefix in this export!)
```

**Verbatim `imsmanifest.xml` from Canvas's own export fixture** (`canvas_qti.zip`, 2014):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="i435c4736d7ce2ae2e55d686dfa8e9ee7" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
    <imsmd:lom>
      <imsmd:general>
        <imsmd:title>
          <imsmd:string>QTI Quiz Export for course "plz"</imsmd:string>
        </imsmd:title>
      </imsmd:general>
      <imsmd:lifeCycle>
        <imsmd:contribute>
          <imsmd:date>
            <imsmd:dateTime>2014-05-15</imsmd:dateTime>
          </imsmd:date>
        </imsmd:contribute>
      </imsmd:lifeCycle>
      <imsmd:rights>
        <imsmd:copyrightAndOtherRestrictions>
          <imsmd:value>yes</imsmd:value>
        </imsmd:copyrightAndOtherRestrictions>
        <imsmd:description>
          <imsmd:string>Private (Copyrighted) - http://en.wikipedia.org/wiki/Copyright</imsmd:string>
        </imsmd:description>
      </imsmd:rights>
    </imsmd:lom>
  </metadata>
  <organizations/>
  <resources>
    <resource identifier="i618e88580f76f70a1ed28804f497df9c" type="imsqti_xmlv1p2">
      <file href="i618e88580f76f70a1ed28804f497df9c/i618e88580f76f70a1ed28804f497df9c.xml"/>
      <dependency identifierref="i8e789820b10d6c3285c04dc9e8c86289"/>
    </resource>
    <resource identifier="i8e789820b10d6c3285c04dc9e8c86289" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="i618e88580f76f70a1ed28804f497df9c/assessment_meta.xml">
      <file href="i618e88580f76f70a1ed28804f497df9c/assessment_meta.xml"/>
    </resource>
  </resources>
</manifest>
```

The current code produces the same structure:
- **Quiz resource** ([qti_generator.rb L118–133](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L118-L133)): identifier is the quiz id, `type` is `imsqti_xmlv1p2` here, it has one `<file>`, and it has a `<dependency identifierref>` pointing to `create_key(quiz, "canvas_")`.
- **Metadata resource**: type `LOR`, `href` set to the meta file, and one `<file>` for it.
- **Banks** ([L181–200](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L181-L200)). Attribute order is identifier, type, href:
  ```xml
  <resource identifier="gBANK…" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/gBANK….xml.qti">
    <file href="non_cc_assessments/gBANK….xml.qti"/>
  </resource>
  ```
- **Files** ([qti_manifest.rb L79–97](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_manifest.rb#L79-L97)):
  ```xml
  <resource identifier="<attachment export_id>" type="webcontent" href="web_resources/unfiled/first.png">
    <file href="web_resources/unfiled/first.png"/>
  </resource>
  ```
  The path comes from `att.full_display_path.sub("course files", "web_resources")`. For `AssessmentQuestion` files it is `"assessment_questions#{att.full_display_path}"`, and for `User` files it is `web_resources/<media folder>/<name>`.

**Important:** a quiz-only export includes banks **only** when `NewQuizzesFeaturesHelper.new_quizzes_bank_migrations_enabled?` is true ([qti_generator.rb L147, L155](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L147-L155)). Normally, questions pulled from a bank by a quiz group appear only as `sourcebank_ref` (see §2). Canvas's community answers say the same thing: exporting a quiz does not export its linked bank ([Canvas Community](https://community.canvaslms.com/t5/Canvas-Question-Forum/Exporting-Question-Banks/td-p/192299)).

### 1b. Full course export (`.imscc`, `ContentExport::COMMON_CARTRIDGE`)

The manifest root comes from [manifest.rb L50–81 and L123–142](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/manifest.rb#L50-L142): `identifier = create_key(course,"common_cartridge_")`, the CC 1.1 namespaces, and `<schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion>`.

`QtiGenerator#generate` ([L46–80](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L46-L80)) runs `generate_quiz(quiz, for_cc: true)` and then `generate_banks`. In this export every active course bank is always included (`quiz_bank_ids.concat(@course.assessment_question_banks.active)`, L161).

```
<quizId>/assessment_qti.xml              ← CC-profile QTI (only 5 supported types, see §3 note)
<quizId>/assessment_meta.xml
non_cc_assessments/<quizId>.xml.qti      ← full Canvas-flavour QTI of the quiz
non_cc_assessments/<bankId>.xml.qti      ← one <objectbank> per bank
web_resources/...                        ← course files; AQ files at web_resources/assessment_questions/...
course_settings/canvas_export.txt, ...   ← marks the package as a Canvas cartridge
```

The quiz resources in this export:

```xml
<resource identifier="gQUIZ" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment">
  <file href="gQUIZ/assessment_qti.xml"/>
  <dependency identifierref="gMETA"/>
</resource>
<resource identifier="gMETA" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="gQUIZ/assessment_meta.xml">
  <file href="gQUIZ/assessment_meta.xml"/>
  <file href="non_cc_assessments/gQUIZ.xml.qti"/>
</resource>
```

File resources are written by `add_file_to_manifest` ([web_resources.rb L33–123](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/web_resources.rb#L33-L123)). Files from `AssessmentQuestion` contexts go to `web_resources/assessment_questions…`, and `files_meta.xml` marks that folder as hidden.

Canvas recognises a "canvas_cartridge" only when the manifest has a resource with `href="course_settings/canvas_export.txt"` or the syllabus/course_settings pair ([package_identifier.rb L39–58](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/canvas/migration/package_identifier.rb#L39-L58)). A package is auto-detected as `:qti` when any resource `type` starts with `imsqti` or `ims_qti` (L83–85).

### `assessment_meta.xml`

Generated at [qti_generator.rb L211–270](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L211-L270). Verbatim from the fixture:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<quiz identifier="i618e88580f76f70a1ed28804f497df9c" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 http://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>Unnamed Quiz hi</title>
  <description>&lt;p&gt;Quiz Description&lt;/p&gt;</description>
  <shuffle_answers>false</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <quiz_type>assignment</quiz_type>
  <points_possible>0</points_possible>
  <lockdown_browser_monitor_data></lockdown_browser_monitor_data>
  <show_correct_answers>true</show_correct_answers>
  <anonymous_submissions>false</anonymous_submissions>
  <allowed_attempts>1</allowed_attempts>
  <one_question_at_a_time>false</one_question_at_a_time>
  <cant_go_back>false</cant_go_back>
  <available>true</available>
  <assignment identifier="i458d67cb62b4faf891cc85f9544be3e5"> … </assignment>
  <assignment_group_identifierref>ia41fe810dcba150ae0542e635365ef4f</assignment_group_identifierref>
</quiz>
```

The current code writes these elements in this order:
- always or conditionally: `title, description, lock_at?, unlock_at?, due_at?, shuffle_answers, scoring_policy, hide_results, quiz_type, points_possible`
- lockdown browser: `require_lockdown_browser…?, lockdown_browser_monitor_data`
- access and answers: `access_code?, ip_filter?, show_correct_answers?, show_correct_answers_at?, hide_correct_answers_at?, anonymous_submissions?, could_be_locked?`
- timing and attempts: `time_limit?, disable_timer_autosubmission?, allowed_attempts?, one_question_at_a_time, cant_go_back, available, one_time_results, show_correct_answers_last_attempt`
- visibility: `only_visible_to_overrides, module_locked`
- links: `assignment?, assignment_group_identifierref?, assignment_overrides`

The `xsi:schemaLocation` now uses `https://canvas.instructure.com/xsd/cccv1p0.xsd`.

---

## 2. `<objectbank>` versus `<questestinterop><assessment>`

### Question bank file: `non_cc_assessments/<bankId>.xml.qti`

From `generate_bank` ([qti_generator.rb L319–339](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L319-L339)). The header below is copied verbatim from the expected XML in [qti_generator_spec.rb L68–95](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/spec/lib/cc/qti/qti_generator_spec.rb#L68-L95):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <objectbank ident="somemigrationid">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>bank_title</fieldlabel>
        <fieldentry>Test Bank</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>bank_type</fieldlabel>
        <fieldentry>Course</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>bank_context_uuid</fieldlabel>
        <fieldentry>course_uuid</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>bank_state</fieldlabel>
        <fieldentry>active</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <!-- then one <item> per active assessment_question, via add_question(bank_node, aq.data) -->
  </objectbank>
</questestinterop>
```

- `bank_type` is written only when the New Quizzes bank-migration flag is on (L329).
- There is no `<section>`: the items are direct children of `<objectbank>`.
- Bank items never carry `assessment_question_identifierref`, because they are not quiz questions.

What the importer does with these fields (QTIMigrationTool `MDFieldMap`, [imsqtiv1.py L3241–3290](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py#L3241)):
- Only `bank_title` is mapped. `bank_type`, `bank_context_uuid`, `bank_state` and `passage` are logged as "Unmapped metadata field" (L3320) and dropped.
- Each `<item>` inside `<objectbank>` gets `question_bank` set to `bank_title` (or the ident if there is none) and `question_bank_iden` set to the objectbank `ident` ([L611–614](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py#L611-L614), [L650–685](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py#L650), [L1930](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py#L1930)).
- **`bank_title` must therefore come before the items**, because the bank name is set while parsing.
- On the Ruby side these become `question_bank_name` and `question_bank_id` ([assessment_item_converter.rb L173–179](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/assessment_item_converter.rb#L173-L179)), then `question_bank_migration_id` and the bank title ([assessment_question_bank_importer.rb L25–58](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/importers/assessment_question_bank_importer.rb#L25-L58)).
- If a bank with that migration id already exists, it is reused, and existing questions with the same item `ident` (migration_id) are updated in place ([assessment_question_importer.rb L47, L75–96](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/importers/assessment_question_importer.rb#L47)).
- Items that have no bank go to the bank chosen in the import UI, or to `AssessmentQuestionBank.default_imported_title` (L51–53).

### Quiz file: `<questestinterop><assessment>`

From `generate_assessment` ([L272–317](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L272-L317)) and `add_group` ([L372–409](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb#L372-L409)). This is the Canvas flavour (`for_cc: false`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <assessment ident="gQUIZ" title="Quiz title">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>qmd_timelimit</fieldlabel>
        <fieldentry>90</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>cc_maxattempts</fieldlabel>
        <fieldentry>1</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
      <item …/>                                   <!-- quiz questions (add_quiz_question) -->
      <section ident="gGROUP" title="Group name"> <!-- group linked to a bank -->
        <selection_ordering>
          <selection>
            <sourcebank_ref>gBANK</sourcebank_ref>
            <selection_number>2</selection_number>
            <selection_extension>
              <points_per_item>1.0</points_per_item>
            </selection_extension>
          </selection>
        </selection_ordering>
      </section>
      <section ident="gGROUP2" title="Group 2">   <!-- group with its own questions -->
        <selection_ordering>
          <selection>
            <selection_number>1</selection_number>
            <selection_extension>
              <points_per_item>1.0</points_per_item>
            </selection_extension>
          </selection>
        </selection_ordering>
        <item …/>
      </section>
    </section>
  </assessment>
</questestinterop>
```

- `qmd_timelimit` appears only when a time limit is set.
- `cc_maxattempts` is always present; unlimited attempts are written as `unlimited`.
- For a bank in another course or account, `sourcebank_ref` is the numeric bank id, plus `<sourcebank_export_id>`. `<sourcebank_context>course_123</sourcebank_context><sourcebank_is_external>true</sourcebank_is_external>` are written **inside** `<selection_extension>`; the `external_bank.xml` fixture confirms this.
- The CC-profile `assessment_qti.xml` adds the metadata fields `cc_profile=cc.exam.v0p1`, `qmd_assessmenttype=Examination` and `qmd_scoretype=Percentage`. It flattens groups into actual items.
- `itemref`/`linkrefid` is defined in `add_ref_or_question` but **is not called by the generator**, so quiz questions are always written out in full.

---

## 3. Item templates for each Classic question type

### 3.0 Rules that apply to every type

From `add_question` ([qti_items.rb L99–161](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L99-L161)):

- **Element order:** `item@ident,title` → `itemmetadata/qtimetadata` → `presentation` (`material` with question text, then the response block) → `resprocessing` → `itemfeedback*`.
- **Item `title`** is `question["name"].presence || question["question_name"]`.
- **Metadata fields, in this order:**
  1. `question_type`
  2. `points_possible` (Ruby `to_s` of the stored value, e.g. `1.0`)
  3. `original_answer_ids` (answer ids joined by commas; empty `<fieldentry></fieldentry>` when there are no answers)
  4. `passage` = `true` (text-only only)
  5. `assessment_question_identifierref` (quiz questions only)
- **Question text** is always wrapped as `"<div>#{question_text}</div>"` and emitted as `<mattext texttype="text/html">`.
- **`html_mat_text`** ([L560–567](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L560-L567)): if the answer has an `html` value, it emits `texttype="text/html"`; otherwise `texttype="text/plain"` with `answer["text"]`.
- **`<resprocessing>`** always starts with `<outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>`. It is omitted entirely for `text_only_question`.
- **The resprocessing sequence** ([L271–302](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L271-L302)):
  1. neutral feedback condition (only if there is neutral feedback)
  2. one `continue="Yes"` condition per answer that has feedback (skipped for matching and numerical)
  3. the type-specific scoring conditions
  4. the general-incorrect condition (not for matching, dropdowns or fill-in-multiple-blanks)

The templates below have no feedback; §3.11 shows feedback. The bank item ident `gAQ…` stands for `create_key("assessment_question_<id>")`. Answer idents are integers.

### 3.1 `multiple_choice_question`

Presentation code is at [L179–197](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L179-L197) and scoring at [L304–315](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L304-L315). The correct answer is the **first** answer with `weight > 0`.

```xml
<item ident="gAQ0000000000000000000000000000001" title="Câu 1">
  <itemmetadata>
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>question_type</fieldlabel>
        <fieldentry>multiple_choice_question</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>points_possible</fieldlabel>
        <fieldentry>1.0</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>original_answer_ids</fieldlabel>
        <fieldentry>1001,1002,1003,1004</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
  </itemmetadata>
  <presentation>
    <material>
      <mattext texttype="text/html">&lt;div&gt;&lt;p&gt;Giá trị của 2 + 3 là?&lt;/p&gt;&lt;/div&gt;</mattext>
    </material>
    <response_lid ident="response1" rcardinality="Single">
      <render_choice>
        <response_label ident="1001">
          <material>
            <mattext texttype="text/plain">5</mattext>
          </material>
        </response_label>
        <response_label ident="1002">
          <material>
            <mattext texttype="text/html">&lt;p&gt;6&lt;/p&gt;</mattext>
          </material>
        </response_label>
        <response_label ident="1003">
          <material>
            <mattext texttype="text/plain">7</mattext>
          </material>
        </response_label>
        <response_label ident="1004">
          <material>
            <mattext texttype="text/plain">8</mattext>
          </material>
        </response_label>
      </render_choice>
    </response_lid>
  </presentation>
  <resprocessing>
    <outcomes>
      <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
    </outcomes>
    <respcondition continue="No">
      <conditionvar>
        <varequal respident="response1">1001</varequal>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
  </resprocessing>
</item>
```

### 3.2 `true_false_question`

The structure is identical to multiple choice (same methods). Only `question_type` and the answers differ:

```xml
…<fieldentry>true_false_question</fieldentry>…
<fieldentry>2001,2002</fieldentry>…
    <response_lid ident="response1" rcardinality="Single">
      <render_choice>
        <response_label ident="2001">
          <material>
            <mattext texttype="text/plain">True</mattext>
          </material>
        </response_label>
        <response_label ident="2002">
          <material>
            <mattext texttype="text/plain">False</mattext>
          </material>
        </response_label>
      </render_choice>
    </response_lid>
…
    <respcondition continue="No">
      <conditionvar>
        <varequal respident="response1">2001</varequal>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
```

Canvas `true_false_question` has a single statement. A Vietnamese multi-statement "Đúng/Sai" (tf) question has no Classic equivalent. My suggestion, not something from the source: map each statement to its own `true_false_question`, or use `multiple_dropdowns_question` with one blank per statement.

### 3.3 `multiple_answers_question`

Scoring at [L317–336](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L317-L336). It is all-or-nothing in the XML, using `<and>` plus `<not>` for wrong options.

```xml
…<fieldentry>multiple_answers_question</fieldentry>…
    <response_lid ident="response1" rcardinality="Multiple">
      <render_choice>
        <response_label ident="3001"> … </response_label>
        <response_label ident="3002"> … </response_label>
        <response_label ident="3003"> … </response_label>
      </render_choice>
    </response_lid>
  </presentation>
  <resprocessing>
    <outcomes>
      <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
    </outcomes>
    <respcondition continue="No">
      <conditionvar>
        <and>
          <varequal respident="response1">3001</varequal>
          <not>
            <varequal respident="response1">3002</varequal>
          </not>
          <varequal respident="response1">3003</varequal>
        </and>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
  </resprocessing>
```

### 3.4 `short_answer_question` (Canvas UI name: "Fill in the blank")

Presentation at [L221–228](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L221-L228) and scoring at [L338–348](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L338-L348). All accepted texts go into **one** `conditionvar` as sibling `varequal` elements, with no `<or>` wrapper. Each value is the answer **text**, not its id.

```xml
…<fieldentry>short_answer_question</fieldentry>…
    <response_str ident="response1" rcardinality="Single">
      <render_fib>
        <response_label ident="answer1" rshuffle="No"/>
      </render_fib>
    </response_str>
  </presentation>
  <resprocessing>
    <outcomes>
      <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
    </outcomes>
    <respcondition continue="No">
      <conditionvar>
        <varequal respident="response1">Hà Nội</varequal>
        <varequal respident="response1">Ha Noi</varequal>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
  </resprocessing>
```

### 3.5 `fill_in_multiple_blanks_question`

Presentation at [L239–258](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L239-L258) and scoring at [L434–449](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L434-L449).

- The question text contains `[blank_id]` placeholders.
- There is one `response_lid ident="response_<blank_id>"` per blank. Its `material` holds the bare blank id, and the `<mattext>` has **no `texttype`**.
- Every acceptable answer is a `response_label`.
- Scoring has one condition per blank, with no `continue` attribute. It uses only the **first** answer with weight > 0 and adds `"%.2f" % (100.0/blanks)`.
- On import, `FillInTheBlank#process_canvas` treats every choice of a fill-in-multiple-blanks item as correct (weight 100), so the extra alternatives survive ([fill_in_the_blank.rb L68–96](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/fill_in_the_blank.rb#L68-L96)).

```xml
…<fieldentry>fill_in_multiple_blanks_question</fieldentry>…
<fieldentry>4001,4002,4003</fieldentry>…
  <presentation>
    <material>
      <mattext texttype="text/html">&lt;div&gt;&lt;p&gt;Thủ đô của Việt Nam là [cap1], của Pháp là [cap2].&lt;/p&gt;&lt;/div&gt;</mattext>
    </material>
    <response_lid ident="response_cap1">
      <material>
        <mattext>cap1</mattext>
      </material>
      <render_choice>
        <response_label ident="4001">
          <material>
            <mattext texttype="text/plain">Hà Nội</mattext>
          </material>
        </response_label>
        <response_label ident="4002">
          <material>
            <mattext texttype="text/plain">Ha Noi</mattext>
          </material>
        </response_label>
      </render_choice>
    </response_lid>
    <response_lid ident="response_cap2">
      <material>
        <mattext>cap2</mattext>
      </material>
      <render_choice>
        <response_label ident="4003">
          <material>
            <mattext texttype="text/plain">Paris</mattext>
          </material>
        </response_label>
      </render_choice>
    </response_lid>
  </presentation>
  <resprocessing>
    <outcomes>
      <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
    </outcomes>
    <respcondition>
      <conditionvar>
        <varequal respident="response_cap1">4001</varequal>
      </conditionvar>
      <setvar varname="SCORE" action="Add">50.00</setvar>
    </respcondition>
    <respcondition>
      <conditionvar>
        <varequal respident="response_cap2">4003</varequal>
      </conditionvar>
      <setvar varname="SCORE" action="Add">50.00</setvar>
    </respcondition>
  </resprocessing>
```

Note the attribute order: `setvar varname="SCORE" action="Add"` here, but `action="Set" varname="SCORE"` in the single-answer types.

### 3.6 `multiple_dropdowns_question`

The XML has exactly the same shape as §3.5. The differences:
- `question_type` is `multiple_dropdowns_question`.
- Wrong options are included as `response_label`s.
- `varequal` names the single correct option of each blank.
- On import, only options that appear in a SCORE `Add` condition get weight 100 ([fill_in_the_blank.rb L86–96](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/fill_in_the_blank.rb#L86-L96)).

### 3.7 `matching_question`

Presentation at [L199–219](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L199-L219) and scoring at [L407–432](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L407-L432).

- There is one `response_lid ident="response_<answer.id>"` per left-hand item. Its `material` holds the left text.
- `render_choice` lists **all** `question["matches"]`, including distractors, as `response_label ident="<match_id>"`. Their `<mattext>` has **no `texttype`**.
- Each condition adds `"%.2f" % (100.0/answers.count)`.

```xml
…<fieldentry>matching_question</fieldentry>…
<fieldentry>5001,5002</fieldentry>…
    <response_lid ident="response_5001">
      <material>
        <mattext texttype="text/plain">Hà Nội</mattext>
      </material>
      <render_choice>
        <response_label ident="9001">
          <material>
            <mattext>Việt Nam</mattext>
          </material>
        </response_label>
        <response_label ident="9002">
          <material>
            <mattext>Pháp</mattext>
          </material>
        </response_label>
        <response_label ident="9003">
          <material>
            <mattext>Đức</mattext>
          </material>
        </response_label>
      </render_choice>
    </response_lid>
    <response_lid ident="response_5002">
      <material>
        <mattext texttype="text/plain">Paris</mattext>
      </material>
      <render_choice>
        … same three response_label 9001/9002/9003 …
      </render_choice>
    </response_lid>
  </presentation>
  <resprocessing>
    <outcomes>
      <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
    </outcomes>
    <respcondition>
      <conditionvar>
        <varequal respident="response_5001">9001</varequal>
      </conditionvar>
      <setvar varname="SCORE" action="Add">50.00</setvar>
    </respcondition>
    <respcondition>
      <conditionvar>
        <varequal respident="response_5002">9002</varequal>
      </conditionvar>
      <setvar varname="SCORE" action="Add">50.00</setvar>
    </respcondition>
  </resprocessing>
```

When a left-hand item has feedback, an extra condition follows its scoring condition: `<respcondition><conditionvar><not><varequal respident="response_5001">9001</varequal></not></conditionvar><displayfeedback feedbacktype="Response" linkrefid="5001_fb"/></respcondition>`.

### 3.8 `numerical_question`

Presentation at [L260–267](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L260-L267) and scoring at [L350–401](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L350-L401). There is one `respcondition continue="No"` per answer. The answer fields (`exact`, `margin`, `start`, `end`, `approximate`, `precision`, and `numerical_answer_type` of `exact_answer`, `range_answer` or `precision_answer`) match the [Quiz Questions API](https://canvas.instructure.com/doc/api/quiz_questions.html).

```xml
…<fieldentry>numerical_question</fieldentry>…
    <response_str ident="response1" rcardinality="Single">
      <render_fib fibtype="Decimal">
        <response_label ident="answer1"/>
      </render_fib>
    </response_str>
  </presentation>
  <resprocessing>
    <outcomes>
      <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
    </outcomes>
    <!-- (a) exact_answer: exact=10.6652, margin=0.5 (the <and> block is omitted when margin is blank) -->
    <respcondition continue="No">
      <conditionvar>
        <or>
          <varequal respident="response1">10.6652</varequal>
          <and>
            <vargte respident="response1">10.1652</vargte>
            <varlte respident="response1">11.1652</varlte>
          </and>
        </or>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
    <!-- (b) range_answer: start=9, end=11 (no wrapper; values are the stored value's to_s) -->
    <respcondition continue="No">
      <conditionvar>
        <vargte respident="response1">9.0</vargte>
        <varlte respident="response1">11.0</varlte>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
    <!-- (c) precision_answer: approximate=13.4, precision=4 → ±5E-4 in significant digits -->
    <respcondition continue="No">
      <conditionvar>
        <or>
          <varequal respident="response1">13.4</varequal>
          <and>
            <vargt respident="response1">13.395</vargt>
            <varlte respident="response1">13.405</varlte>
          </and>
        </or>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
    </respcondition>
  </resprocessing>
```

- Exact values are `answer["exact"].to_f`, so `12` prints as `12.0`. The margin bounds come from a BigDecimal calculation, converted with `.to_f`.
- **Precision answers:** the exact number formatting (`13.4`, `13.395`) is my inference from Rails' BigDecimal `to_s` default ("F" format); I did not run it. The importer recognises a precision answer when it sees `vargt` plus `varlte` bounds that are symmetric around the value and end in "5" ([numeric_interaction.rb L58–96](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/numeric_interaction.rb#L58-L96)).
- **Answer feedback** goes inside the answer's own condition: `<displayfeedback feedbacktype="Response" linkrefid="<id>_fb"/>`, then the `correct_fb` reference.

### 3.9 `essay_question`

Presentation is the same `response_str` as short answer. Scoring is just an `<other/>` condition ([L403–405, L491–498](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L403-L498)).

```xml
…<fieldentry>essay_question</fieldentry>…
      <qtimetadatafield>
        <fieldlabel>original_answer_ids</fieldlabel>
        <fieldentry></fieldentry>
      </qtimetadatafield>
…
    <response_str ident="response1" rcardinality="Single">
      <render_fib>
        <response_label ident="answer1" rshuffle="No"/>
      </render_fib>
    </response_str>
  </presentation>
  <resprocessing>
    <outcomes>
      <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
    </outcomes>
    <respcondition continue="No">
      <conditionvar>
        <other/>
      </conditionvar>
    </respcondition>
  </resprocessing>
```

### 3.10 `text_only_question`

Verbatim from the expected output in [qti_generator_spec.rb L157–185](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/spec/lib/cc/qti/qti_generator_spec.rb#L157-L185):

```xml
<item ident="dummy_id" title="Text Only Question">
  <itemmetadata>
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>question_type</fieldlabel>
        <fieldentry>text_only_question</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>points_possible</fieldlabel>
        <fieldentry>5</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>original_answer_ids</fieldlabel>
        <fieldentry></fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>passage</fieldlabel>
        <fieldentry>true</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
  </itemmetadata>
  <presentation>
    <material>
      <mattext texttype="text/html">&lt;div&gt;Some text&lt;/div&gt;</mattext>
    </material>
  </presentation>
</item>
```

It has no `resprocessing` and no `itemfeedback` (L138). The `passage` field is ignored on import (see §2).

### 3.11 Feedback conventions

From [L153–158 and L470–516](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L470-L516). These are the `itemfeedback` idents:

| Ident | Filled from |
|---|---|
| `general_fb` | `neutral_comments` |
| `correct_fb` | `correct_comments` |
| `general_incorrect_fb` | `incorrect_comments` |
| `<answerId>_fb` | the answer's `comments` |

Each is written only if `X` or `X_html` is present; the `_html` variant becomes `text/html`. Here is a complete multiple-choice resprocessing with every kind of feedback:

```xml
  <resprocessing>
    <outcomes>
      <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
    </outcomes>
    <respcondition continue="Yes">
      <conditionvar>
        <other/>
      </conditionvar>
      <displayfeedback feedbacktype="Response" linkrefid="general_fb"/>
    </respcondition>
    <respcondition continue="Yes">
      <conditionvar>
        <varequal respident="response1">1002</varequal>
      </conditionvar>
      <displayfeedback feedbacktype="Response" linkrefid="1002_fb"/>
    </respcondition>
    <respcondition continue="No">
      <conditionvar>
        <varequal respident="response1">1001</varequal>
      </conditionvar>
      <setvar action="Set" varname="SCORE">100</setvar>
      <displayfeedback feedbacktype="Response" linkrefid="correct_fb"/>
    </respcondition>
    <respcondition continue="No">
      <conditionvar>
        <other/>
      </conditionvar>
      <displayfeedback feedbacktype="Response" linkrefid="general_incorrect_fb"/>
    </respcondition>
  </resprocessing>
  <itemfeedback ident="general_fb">
    <flow_mat>
      <material>
        <mattext texttype="text/html">&lt;p&gt;Lời giải: …&lt;/p&gt;</mattext>
      </material>
    </flow_mat>
  </itemfeedback>
  <itemfeedback ident="correct_fb"> … </itemfeedback>
  <itemfeedback ident="general_incorrect_fb"> … </itemfeedback>
  <itemfeedback ident="1002_fb"> … </itemfeedback>
```

- For short answer, the per-answer feedback condition uses `varequal` on the answer **text**.
- For fill-in-multiple-blanks and dropdowns, it uses `respident="response_<blank_id>"`.
- Those two types and matching never emit the `general_incorrect_fb` condition (`MULTI_ANSWER_TYPES`, L43–45).

### 3.12 Quiz questions and the CC flavour

- **Quiz question** (inside `<assessment>`): ident is `create_key("quiz_question_<id>")`, plus one extra field after `original_answer_ids`:
  ```xml
  <qtimetadatafield><fieldlabel>assessment_question_identifierref</fieldlabel><fieldentry>gAQ…</fieldentry></qtimetadatafield>
  ```
- **CC flavour** (`assessment_qti.xml`): `itemmetadata` contains only `cc_profile`, plus `qmd_computerscored=No` for essays. Only five types are written: `cc.multiple_choice.v0p1`, `cc.multiple_response.v0p1`, `cc.true_false.v0p1`, `cc.fib.v0p1` (for short answer) and `cc.essay.v0p1` ([L27–39, L70–75](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb#L27-L75)). **Do not generate this flavour; use the Canvas flavour.**

### 3.13 How Canvas re-reads answer ids

The importer only reuses ids in the Canvas flavour (`get_or_generate_answer_id`, [assessment_item_converter.rb L234–245](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/assessment_item_converter.rb#L234-L245)).
- It takes ids from `original_answer_ids` **in order**; if that field is missing, it takes them from the response ident with `response_` removed.
- Any id that is non-numeric or 0 is replaced with a random one.
- **Use integer answer idents, and list them in `original_answer_ids` in the same order as the `response_label`s.**
- **UNCONFIRMED:** whether a plain "QTI .zip" import runs with the `canvas` flavour. The flavour comes from `cm.migration_settings[:flavor]` ([qti_worker.rb](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/canvas/migration/worker/qti_worker.rb), [converter.rb L47](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/converter.rb#L47)), and I did not trace where that is set. The `.imscc` import path passes `Qti::Flavors::CANVAS` explicitly ([quiz_converter.rb](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/importer/canvas/quiz_converter.rb)).

---

## 4. Embedded files and images

**Export side.** `HtmlContentExporter#html_content` ([cc_helper.rb L208–343, L418–472](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/cc_helper.rb#L208-L472)) rewrites Canvas file URLs into `$IMS-CC-FILEBASE$/<folder path>/<URI-escaped display_name>` (L270–286).
- **Folder part:** course folder `course files/x` becomes `$IMS-CC-FILEBASE$/x`. AssessmentQuestion files go under `$IMS-CC-FILEBASE$/assessment_questions`; user files go under the media folder.
- **Path escaping:** each path segment is URI-escaped (space → `%20`), then the path is HTML-escaped.
- **Query string:** `/download` becomes `?canvas_download=1`, and the original query parameters become `canvas_qs_<k>=<v>` (`file_query_string`, L533–556).
- **Tracking:** referenced files are tracked in `referenced_files` and added to the zip and manifest as `webcontent` resources (§1).

Examples copied from the export tests ([cc_exporter_spec.rb L482–486, L544–546](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/spec/lib/cc/cc_exporter_spec.rb#L482-L546)):

```html
<div><p><img src="$IMS-CC-FILEBASE$/unfiled/first.png" loading="lazy"></p>
<p><img src="$IMS-CC-FILEBASE$/Uploaded%20Media/user.png" loading="lazy"></p></div>
<div><img src="$IMS-CC-FILEBASE$/assessment_questions/test%20my%20file?%20hai!&amp;.png?canvas_download=1" loading="lazy"></div>
```

In these examples the token path is relative to `web_resources/`; the files sit at `web_resources/unfiled/first.png`.

**Import side:**
- **Collecting files.** QTIMigrationTool walks **every** `.xml`, `.dat` and `.qti` file in the package recursively, with `imsmanifest.xml` first ([imsqtiv1.py L6332–6354](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py#L6332-L6354)). It copies each manifest `<file href>` that is not `.xml`, `.dat` or `.qti` into a `webcontent` resource ([L299–329](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py#L299-L329)).
- **Registering files.** `Qti.convert_files` turns each such href into an attachment, with `path_name = href.delete_prefix("web_resources/")` ([converter.rb L140–150](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/converter.rb#L140-L150), [qti.rb L113–125](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti.rb#L113-L125)). In a QTI .zip import the files land under `Quiz Files/<key>` ([converter.rb L73](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/converter.rb#L73), [migrator_helper.rb L32, L69](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/canvas/migration/migrator_helper.rb#L32-L79)).
- **Plain relative paths.** `Qti::HtmlHelper#sanitize_html!` rewrites relative paths such as `images/x.png` to `$CANVAS_OBJECT_REFERENCE$/attachments/<mig_id>` by exact or suffix match ([html_helper.rb L31–73, L108](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/html_helper.rb#L31-L110)). Its token-stripping regex `/\$[A-Z_]*\$/` (L63) does **not** match `$IMS-CC-FILEBASE$`, because of the hyphens.
- **`$IMS-CC-FILEBASE$` paths.** These are resolved later by `canvas_link_migrator` (gem 1.0.19, which canvas-lms `Gemfile.lock` pins; source read from the [published gem](https://rubygems.org/gems/canvas_link_migrator/versions/1.0.19)). `link_parser.rb` L252–260 turns `\$IMS(?:-|_)CC(?:-|_)FILEBASE\$/(.*)` into a `:file` link. `link_resolver.rb` L176–215 then matches the path against imported file paths, trying "a/b/c.png", then "b/c.png", then "c.png", case-insensitively as a fallback.
- **Sanitizer allowlist.** `CanvasSanitize` allows `img`, `sub`, `sup`, `table`, `math`, `mfrac` (and other MathML elements) and the `style` attribute ([canvas_sanitize.rb L87–152, L198](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb#L87-L198)).

---

## 5. How question HTML is escaped inside `mattext`

- **Entity-escaped, never CDATA.** `html_mat_text` calls `mat_node.mattext html, texttype: "text/html"`, and Builder escapes the HTML as text. `cdata!` is not called anywhere in `qti_items.rb` or `qti_generator.rb`. The spec proves the output: `<mattext texttype="text/html">&lt;div&gt;Some text&lt;/div&gt;</mattext>`.
- **Builder 3.3.0 rules** (pinned in canvas-lms [Gemfile.lock L445](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/Gemfile.lock#L445)): `XChar.encode` replaces only `&`, `<` and `>` in text. Attributes additionally escape `"` → `&quot;`, newline → `&#10;` and carriage return → `&#13;`. The apostrophe is not escaped. Because the encoding is `utf-8`, non-ASCII characters such as Vietnamese stay as raw UTF-8, not `&#NNNN;` ([xmlbase.rb L133–160](https://github.com/rails/builder/blob/v3.3.0/lib/builder/xmlbase.rb#L133-L160), [xchar.rb L69–73, L152–157](https://github.com/rails/builder/blob/v3.3.0/lib/builder/xchar.rb#L69-L157)). The `instruct!` call writes `<?xml version="1.0" encoding="UTF-8"?>`.
- **Double escaping.** An `&amp;` inside an HTML attribute becomes `&amp;amp;` in the XML.
- **HTML is normalised first.** It is re-serialised through `Nokogiri::HTML5.fragment(...).to_s`, so void elements have no slash (`<img …>`), and the rewriter adds `loading="lazy"`.
- **What the importer accepts.** It decodes entity-escaped or CDATA text. Raw child elements inside `mattext` are handled as `RawMaterial`, and the parser notes that "tags inside MatThing should have been escaped in CDATA sections" ([imsqtiv1.py L6400](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py#L6400)). So the safe choice is entity-escaping, as Canvas does.
- **Untyped `mattext`.** A `mattext` without `texttype` is treated by the importer as `text/html` ([imsqtiv1.py, `MatText.__init__` ~L4033](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py#L4015)).

---

## 6. What this means for our generator

These recommendations follow from the source; the type mapping for our SCORM types is my suggestion, not something Canvas defines.

**Package layout for a bank-only `.zip` imported with "QTI .zip file":**
- `imsmanifest.xml`
- `non_cc_assessments/<bankIdent>.xml.qti` holding `<objectbank ident>`, with `bank_title` before the items
- `web_resources/images/*.png`, each listed as a `webcontent` resource with a `<file href>`
- Question HTML using `$IMS-CC-FILEBASE$/images/x.png`

**Make the package recognisable as QTI.** Auto-detection requires at least one resource whose `type` starts with `imsqti`. Canvas's own bank resource uses the `LOR` type, so a bank-only package should also include a resource of type `imsqti_xmlv1p2` (or the unused `imsqti_xmlv1p2/imscc_xmlv1p1/question-bank`). **UNCONFIRMED:** whether package auto-detection is consulted at all when the teacher explicitly chooses "QTI .zip file".

**Keep idents stable.** Use deterministic `ident`s for both bank and items, for example `g` + MD5 of the exam and question number. Canvas then updates the same bank and the same questions on re-import instead of creating duplicates.

**Mapping our SCORM types:**

| Our type | Canvas Classic type |
|---|---|
| mcq | `multiple_choice_question` |
| multi | `multiple_answers_question` |
| short (numeric) | `numerical_question` |
| short (text) | `short_answer_question` |
| gap / flow / bank | `fill_in_multiple_blanks_question`, or `multiple_dropdowns_question` when it has a word bank |
| letters / select | `matching_question` or `multiple_dropdowns_question` |
| mistake | `multiple_choice_question` |
| tf (multi-statement) | no direct Classic equivalent; split into several `true_false_question` items, or use `multiple_dropdowns_question` with one blank per statement |

**Not verified:**
- **New Quizzes item banks** use a different generator (`new_quizzes_generator.rb`) and were not covered.
- **QTI .zip auto-detection:** whether it is consulted when the import type is chosen explicitly (see above).
- **QTI .zip flavour:** whether a plain QTI .zip import runs with the `canvas` flavour (§3.13).
- **Precision numbers:** the exact number formatting is inferred, not run (§3.8).