# How Canvas imports a QTI 1.2 `.zip` (`qti_converter`) into question banks

## 0. Sources

- **canvas-lms**, pinned commit `1c9f0bb8013ed69c4f2efe11fd483025469b7e6c` (`master` HEAD on 2026‑10‑02). Base URL `C` = `https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/`
- **QTIMigrationTool** (Python), commit `aab28af7a05142140c6fd2f45ed67a4c925a7d1b`. Base URL `Q` = `https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/`
- **canvas_link_migrator** gem 1.0.20, read from the rubygems package: https://rubygems.org/gems/canvas_link_migrator/versions/1.0.20. Its GitHub repo returned 404.
- Local copies of every file cited are in `C:\Users\ADMINI~1\AppData\Local\Temp\claude\C--Users-Administrator-Downloads-PM-chamthidua\dc508171-525f-4c6b-95a3-99cccd19d826\scratchpad\qti\` (`src\`, `qmt\`, `clm\`, `plainzip\`).

## 1. The import pipeline

1. The plugin is registered as `:qti_converter`. It is enabled only if the Python tool is found, and it runs for both Account and Course contexts (`valid_contexts: %w[Account Course]`). Source: `C`gems/plugins/qti_exporter/lib/qti_exporter/engine.rb#L25-L44. If it is disabled, the worker raises "Can't export QTI without the python converter tool installed." (`C`…/lib/canvas/migration/worker/qti_worker.rb#L31).
2. `Qti::Converter#export` (`C`gems/plugins/qti_exporter/lib/qti/converter.rb#L50-L83):
   - It unzips the package.
   - If `imsmanifest.xml` declares a QTI 2.x namespace or `<schema>QTIv2.`, it treats the package as QTI 2 (`is_qti_2`, L85-L91). Otherwise it runs the Python tool.
   - **So a QTI 1.2 manifest must not declare any QTI 2 namespace.**
3. The Python command line (`C`gems/plugins/qti_exporter/lib/qti.rb#L127-L133) is `migrate.py --ucvars --nogui --overwrite --cpout=<tmp> <pkgdir>`. `--ucvars` only upper-cases outcome variable names such as SCORE (`Q`lib/imsqtiv1.py, `SetAttribute_varname`).
4. The Python tool processes **every `*.xml`, `*.dat` and `*.qti` file in the directory tree**, `imsmanifest.xml` first (`Q`lib/imsqtiv1.py#L6332-L6355). It writes QTI 2.1 items plus a 2.1 manifest, with Canvas extensions as `<instructureMetadata><instructureField name=… value=…/>`.
5. Ruby then reads the 2.1 output:
   - `Qti.convert_questions` handles resources of type `imsqti_item_xmlv2p*`.
   - `Qti.convert_assessments` handles `imsqti_assessment_xmlv2p1`.
   - `Qti.convert_files` handles every manifest `<file>` that is not itself a resource href (`C`…/lib/qti.rb#L56-L125).
6. The import step (`Importers::AssessmentQuestionImporter`, `QuizImporter`, `AssessmentQuestionBankImporter`) creates banks, questions and quizzes. The worker defaults to `migration_ids_to_import = { copy: { everything: true } }` (qti_worker.rb#L64).

**Every Canvas `.imscc` course import runs the same Python tool on `non_cc_assessments/*.xml.qti`** (`C`lib/cc/importer/canvas/quiz_converter.rb#L25-L45). The best-tested input shape is therefore Canvas's own QTI export format (`C`lib/cc/qti/qti_items.rb, `C`lib/cc/qti/qti_generator.rb).

## 2. Question 1: banks vs. quizzes, bank naming, several banks

### `<objectbank>` creates only a bank, with no quiz
- The Python tool accepts `<objectbank>` only directly under `<questestinterop>`. It prints "objectbank not supported, looking inside for items" (`Q`lib/imsqtiv1.py#L650-L680).
  - The bank id is the objectbank `ident` (`SetAttribute_ident` sets `self.question_bank = id`).
  - The bank name comes from a `qtimetadatafield` with `fieldlabel` `bank_title`. `MDFieldMap` maps `'bank_title':BankTitle` (L3265), and `BankTitle.CloseObject` sets `container.question_bank_name` (L2969-L2981).
  - `GetBankName()` falls back to the ident when there is no `bank_title` (L673-L677).
- Each `<item>` whose parent has `question_bank` calls `SetQuestionBank(parent.GetBankName(), parent.GetBankId())` (L1929-L1930). That emits instructureFields `question_bank` and `question_bank_iden` (L611-L614).
- Ruby (`C`gems/plugins/qti_exporter/lib/qti/assessment_item_converter.rb#L171-L181) maps these as follows:

  | instructureField | becomes |
  |---|---|
  | `question_bank` | `question_bank_name` |
  | `question_bank_iden` | `question_bank_id` |
  | `points_possible` / `max_score` | `points_possible` |

- `AssessmentQuestionBankImporter.preprocess_migration_data` copies `question_bank_id` into `question_bank_migration_id` and builds `{title: question_bank_name, migration_id: …}` (`C`app/models/importers/assessment_question_bank_importer.rb#L25-L58).
- `AssessmentQuestionImporter.process_migration` looks up `bank_map[bank_mig_id]` (existing banks indexed by `migration_id`). If none is found, it creates a bank with `bank_hash["title"]`. If one is found, it **reuses it and updates its title** (`C`app/models/importers/assessment_question_importer.rb#L72-L112).
- Since objectbank produces no `imsqti_assessment` resource, no quiz is created.
- Confirmed by a spec that runs the real Python tool on a Canvas fixture: `bank_title` "Test Bank" gives `question_bank_name: "Test Bank"` and `question_bank_id: "i35b5…"` (`C`gems/plugins/qti_exporter/spec_canvas/lib/qti/canvas_questions_spec.rb#L126-L150; fixture `…/spec_canvas/fixtures/canvas/multiple_choice_html.xml`).

### A plain `<assessment>` creates a quiz plus a bank named after the quiz
- `QuizImporter.preprocess_migration_data` handles every assessment question with no bank id or bank migration id (`C`app/models/importers/quiz_importer.rb#L62-L70):
  - `question_bank_name ||= <assessment title>`
  - `question_bank_migration_id = create_key("#{assessment_ident}_#{name}_question_bank")`
  - `is_quiz_question_bank = true`
- Specs confirm the bank is titled after the quiz:
  - `qti_1_2_zip_spec.rb#L56-L61`: bank title is "Quiz".
  - `spec/models/content_migration_spec.rb#L503-L533`: title is "Unnamed Quiz".
- To get only the bank from an `<assessment>`, use a selective import with `{copy: {all_quizzes: false, all_assessment_question_banks: true}}`. The spec "is able to import directly into an assessment question bank" shows 0 quizzes and 1 bank (`C`gems/plugins/qti_exporter/spec_canvas/qti_exporter_spec.rb, near the end).

### The "Default Question bank" setting
- The UI (`C`ui/features/content_migrations/react/components/migrator_forms/question_bank_selector.tsx) sends `settings[question_bank_id]`, or `question_bank_name` when "Create new question bank…" is chosen.
- The API docs describe both settings as applying only to questions whose bank is not given in the package, with the id taking precedence over the name (https://canvas.instructure.com/doc/api/content_migrations.html).
- In code (`assessment_question_importer.rb#L51-L56, L75, L92`), the setting only sets `default_title`, and that title is used only for questions with no bank of their own (no `<objectbank>` and no enclosing `<assessment>`).
  - Spec: `question_bank_name` "Import Unfiled Questions Into Me" becomes the bank title for unfiled questions (`spec/models/content_migration_spec.rb#L468-L501`).
- **UNCONFIRMED (code reading suggests a pitfall):** unfiled questions get `question_bank_migration_id = create_key("__question_bank")` from QuizImporter.preprocess (quiz_importer.rb#L63-L69). The selected existing bank is registered under `create_key(default_title, "assessment_question_bank")`, a different key. Picking an *existing* bank may therefore create a new bank with the same title. Verify on a sandbox course. Recommendation: always ship an explicit `<objectbank>`.
- With "Import existing quizzes as New Quizzes" checked, the bank selector is disabled. The guide says no default question bank can be selected with that option (https://community.instructure.com/t5/Instructor-Guide/How-do-I-import-quizzes-from-QTI-packages/ta-p/1046).

### Several banks in one zip
- **Yes.** Every XML/QTI file is processed (`ProcessFiles`), so one file per `<objectbank>` gives one bank each. This is exactly how Canvas exports banks: `non_cc_assessments/<bank_mig_id>.xml.qti`, `generate_bank` (`C`lib/cc/qti/qti_generator.rb#L181-L188, L319-L339).
- UNCONFIRMED:
  - Several `<objectbank>` elements inside one `<questestinterop>`. The DTD allows one; the Python parser only checks the parent element.
  - `<section>` elements inside an objectbank. Code suggests one bank per section titled `section.title` with id `section.ident` (`Q`lib/imsqtiv1.py#L1462-L1468, L1508-L1517). Untested.
- Quizzes can draw randomly from banks with `<section><selection_ordering><selection><sourcebank_ref>BANK_IDENT</sourcebank_ref><selection_number>N</selection_number><selection_extension><points_per_item>…` (`C`…/qti/assessment_test_converter.rb#L177-L199; fixture `spec_canvas/fixtures/canvas/external_bank.xml`).

### Re-importing (the "Overwrite assessment content with matching IDs" checkbox)
- The checkbox sends `settings.overwrite_quizzes` (`C`ui/shared/content-migrations/react/CommonMigratorControls/CommonMigratorControls.tsx#L201).
- When that flag is not set, ids that already exist in the course get an `<content_migration_id>_` prefix (`C`app/models/importers/content_importer_helper.rb#L22-L41; `content_migration.rb#L528-L533`).
  - So re-importing the same package creates new duplicate banks (spec "does not re-use the question_bank without overwrite_quizzes" gives 2 banks).
- With overwrite on, the same objectbank `ident` reuses the bank, and questions with the same item `ident` are updated (spec "re-uses the question_bank…": 1 bank).
- **The tool must emit stable, unique ASCII idents for banks and items.**

### Account-level banks
`qti_converter` also runs in Account context. Spec `content_migration_spec.rb#L467-L533` imports into `account.assessment_question_banks`, using `POST /api/v1/accounts/:id/content_migrations`.

### Strategic caveat: New Quizzes
- Question banks belong to Classic Quizzes.
- Instructure's guide (https://community.instructure.com/en/kb/articles/660995-what-options-can-i-set-in-a-quiz) notes that when the "Disable Classic Quiz Creation" feature option is on, new Classic Quizzes cannot be created, but existing ones can still be edited, imported and migrated.
- New Quizzes item banks have their own QTI import (QTI 1.x/2.x, bank titled after the file): https://community.instructure.com/en/kb/articles/661079-how-do-i-import-questions-from-a-qti-package-into-an-item-bank-in-new-quizzes
- Check which engine the school uses. Behaviour of an objectbank-only zip with "Convert content to New Quizzes" checked is UNCONFIRMED.

## 3. Question 2: type detection and per-type recipes

### How the type is detected
1. The Python tool maps item `qtimetadatafield` labels `question_type`, `qmd_itemtype`, `itemtype`, `question type` and `questiontype` to `QMDItemType`, which calls `SetQuestionType()`. That emits instructureField `question_type` (`Q`lib/imsqtiv1.py#L2882-L2901, L3241-L3290). `points_possible` goes the same way (L2924-L2934).
2. Ruby `create_instructure_question` reads from the manifest node: `interactionType`, then `bb_question_type`, then `question_type` (`assessment_item_converter.rb#L299-L341`). Special cases:
   - `matching_question` → interaction `choiceinteraction` with custom type `canvas_matching`
   - `/fillInMultiple|fill_in_multiple_blanks_question/` → `fill_in_multiple_blanks_question`
   - `multiple_dropdowns_question` → `multiple_dropdowns_question`
3. Inside the item, `parse_instructure_metadata` sets `@question[:question_type]` directly when the value is in `AssessmentQuestion::ALL_QUESTION_TYPES` (L219-L230). That list is in `C`app/models/assessment_question.rb#L40-L52: `multiple_answers, fill_in_multiple_blanks, matching, missing_word, multiple_choice, numerical, text_only, short_answer, multiple_dropdowns, calculated, essay, true_false, file_upload` (each with the `_question` suffix).
4. Only when no interaction type is known does `QuestionTypeEducatedGuesser` apply its heuristics: more than one `choiceInteraction` means matching, and so on (`…/qti/question_type_educated_guesser.rb`). **Always emit `question_type` and `points_possible`.**

### Recipes per Canvas type (mirror `C`lib/cc/qti/qti_items.rb)

| Canvas type | QTI 1.2 shape | Importer behaviour and pitfalls |
|---|---|---|
| `multiple_choice_question` | `response_lid ident="response1" rcardinality="Single"`, one `response_label` per option; correct option: `respcondition continue="No"` + `varequal respident="response1">ID` + `setvar action="Set" varname="SCORE">100` | Answer HTML (MathML, img) is kept as `answer[:html]`; `answer[:text]` is the stripped text (`choice_interaction.rb#L118-L131`). If no correct option is found you get the warning "The importer couldn't determine the correct answers for this question." (L102). |
| `true_false_question` | as MC | Kept only if exactly 2 answers whose text matches /true/ and /false/; otherwise silently becomes MC (`choice_interaction.rb#L53-L70`). **Use MC with "Đúng"/"Sai".** |
| `multiple_answers_question` | `rcardinality="Multiple"`; `<and>` of `varequal` for correct options and `<not><varequal>` for wrong ones | Correct options are read from `responseIf > and > member`. |
| `short_answer_question` | `response_str ident="response1"` + `render_fib`; several `varequal respident="response1">text` in one `conditionvar` | Each `stringMatch` becomes an accepted answer. **No answers means it silently becomes an essay** (`extended_text_interaction.rb#L26-L34`). Grading strips and lowercases both sides, so it is always case-insensitive whatever QTI `case` says, and does **no Unicode normalisation** (`C`app/models/quizzes/quiz_question/short_answer_question.rb#L36-L48). |
| `fill_in_multiple_blanks_question` | Question text contains `[b1]`; per blank `response_lid ident="response_b1"` whose `response_label` items are the accepted strings | `process_canvas`: `blank_id = responseIdentifier` with `^response_` stripped; every option gets weight 100 (`fill_in_the_blank.rb#L81-L94`). Option text is plain `choice.text`. Blank names: use `[A-Za-z0-9_-]` only. Python turns `.` and `:` into `_` (`Q`lib/imsqtiv1.py#L164-L172), which then fails to match `[x.1]` in the text. Grading is per blank, strip and lowercase (`fill_in_multiple_blanks_question.rb`). |
| `multiple_dropdowns_question` | Same as FIMB, but options are the dropdown choices; only the correct option gets a `respcondition` with **`setvar action="Add"`** | The correct option is detected only if the condition has `setOutcomeValue[identifier=SCORE] sum` (`fill_in_the_blank.rb#L98-L106`). **`action="Set"` leaves no correct answer.** Dropdown labels are plain text, so MathML is lost. |
| `matching_question` | Per left item `response_lid ident="response_<n>"` + `material` (left HTML) + `render_choice` with right options having **numeric idents**; `varequal respident="response_<n>">rightId` + `setvar action="Add"` | Right side keeps text only (`match[:text] = sc.text.strip`, `associate_interaction.rb#L112-L124`). `match_id` = first integer in the ident (L117-L118), so non-unique digits collide. Correct match also needs `sum` (L147). Images on both sides trigger a warning (L85). |
| `numerical_question` | `response_str` + `render_fib fibtype="Decimal"`; `<or><varequal>X</varequal><and><vargte>X-m</vargte><varlte>X+m</varlte></and></or>`, or a bare `vargte`/`varlte` pair for a range | Parsed by `numeric_interaction.rb#L55-L112`. **Locale pitfall:** student input passes through `i18n_decimal`, which removes `number.format.delimiter` and then maps the separator to "." (`numerical_question.rb#L31-L43`). Canvas `vi.yml` has separator "." and delimiter "," (`C`config/locales/vi.yml#L21217-L21221). **"0,5" is read as 5.** Client-side normalisation is UNCONFIRMED. |
| `essay_question` | `response_str`, `respcondition` with `<other/>` | Graded manually. |
| `text_only_question` | metadata only | Not parsed. |

- **Feedback (`itemfeedback ident`):**
  - `general_fb` → `neutral_comments(_html)`, a good place for "hướng dẫn giải"
  - `correct_fb` → `correct_comments`
  - `general_incorrect_fb` → `incorrect_comments`
  - `<answerid>_fb` → per-answer comments
  - Source: `assessment_item_converter.rb#L261-L282`. Mirror Canvas and include an `<other/>` + `displayfeedback linkrefid="general_fb"` respcondition. Whether unreferenced feedback is also emitted is UNCONFIRMED.
- **Partial credit:** `allow_partial_credit` defaults to true (`C`app/models/quizzes/quiz_question/question_data.rb#L65`). Dropdown, FIMB and matching scores are linear per part. The THPT non-linear Đúng/Sai scale (0.1 / 0.25 / 0.5 / 1) cannot be reproduced natively (inference).

### Suggested mapping of the source question types
| Source type | Canvas type |
|---|---|
| mcq | `multiple_choice_question` |
| multi | `multiple_answers_question` |
| tf (4 statements) | `multiple_dropdowns_question` with `[a]` `[b]` `[c]` `[d]` → Đúng/Sai, or 4 separate MC questions |
| short | `short_answer_question` listing both comma and dot variants (avoid `numerical` because of the locale bug) |
| gap / flow | FIMB if typed, or dropdowns if a choice list exists |
| bank (word bank) | dropdowns with the word bank as each blank's options |
| letters / select | `matching_question` (right side plain text) or dropdowns |
| mistake | MC whose options are the underlined segments as HTML |

## 4. Question 3: files and images

- **A file must be listed in `imsmanifest.xml`** as `<file href="images/x.png"/>` in some resource. The Python `Manifest/Resource/File` classes add every non-`.xml/.dat/.qti` href as a `webcontent` file and copy it, keeping the relative path (`Q`lib/imsqtiv1.py#L299-L384).
  - HTML inside `mattext` is not scanned by the Python tool. Only `<matimage uri>` is added automatically, and that path gets flattened to the base filename (L2193-L2220).
- Ruby `convert_files` turns each such href into `file_map[md5(href)] = {path_name: href minus "web_resources/"}` (`converter.rb#L140-L151`, after `CGI.unescape`, `qti.rb#L113-L125`). Only `file_map` paths are extracted (`course_content_importer.rb#L24-L72`).
- Destination folder: **`Quiz Files/<zip-name-before-first-dot>_<migration_id>/<path>`**, and the folder is **hidden** (`MigratorHelper::QUIZ_FILE_DIRECTORY = "Quiz Files"`, `unique_quiz_dir`, `C`lib/canvas/migration/migrator_helper.rb#L32, L69-L80; `converter.rb#L46, L73`; spec `qti_1_2_zip_spec.rb#L69-L82, L106-L109`).
- **Link rewriting happens in three passes:**
  1. `Qti::HtmlHelper#sanitize_html!`, for attributes `rel href src data value`, applies `CGI.unescape`. It strips `$TOKEN$` matching `/\$[A-Z_]*\$/`; this regex contains no hyphen, so `$IMS-CC-FILEBASE$` is not stripped here. It then matches the path exactly or by **`end_with?` on the shortest key**, and rewrites to `$CANVAS_OBJECT_REFERENCE$/attachments/<mig_id>` (`C`gems/plugins/qti_exporter/lib/qti/html_helper.rb#L38-L71, L108-L110).
  2. Anything left goes through canvas_link_migrator. `parse_url` handles `$IMS-CC-FILEBASE$` / `$IMS_CC_FILEBASE$`, and plain relative URLs become `unresolved(:file)`. Resolution looks up `attachment_path_id_lookup` exactly, then case-insensitively, then trying "a/b/c" → "b/c" → "c" (gem `link_parser.rb` `REFERENCE_KEYWORDS`, `parse_url`; `link_resolver.rb#find_file_in_context`, `resolve_relative_file_url_with_qs`).
  3. Missing files become `/courses/:id/file_contents/course%20files/<path>` plus the warning "Missing links found in imported content".
  4. `AssessmentQuestion#translate_links` clones each course file into the question as `/assessment_questions/<aq>/files/<id>/download?verifier=…` (`C`app/models/assessment_question.rb#L103-L190).
- **Relative `src="images/x.png"` works.** The spec fixture `plain_qti.zip` uses `src="org0/images/image.png"` and `$IMS_CC_FILE_BASE$org1/...`, and asserts `files/<id>/download` links (`qti_1_2_zip_spec.rb#L84-L104`).
- **`data:` URIs are removed.** `img src` protocols are `["http","https",:relative]` (`canvas_sanitize.rb#L49, L662`), and the QTI sanitizer runs before the link migrator.
- Avoid in filenames:
  - `+` and spaces: `CGI.unescape` turns `+` into a space.
  - non-ASCII characters: Python `EncodePathSegment` replaces characters >255 with "?" ("should really UTF-8 this but we'll cheat for now", `Q`lib/xmlutils.py#L73-L85).
  - duplicate base names: the `end_with?` match is ambiguous.

## 5. Question 4: HTML sanitisation of question text

- **Where it happens:**
  - Python wraps `mattext texttype="text/html"` content as escaped text in `<div class="html">` (`Q`lib/imsqtiv1.py#L3581-L3589).
  - Ruby parses `node.text` with `Nokogiri::HTML5.fragment` and runs `Sanitize.clean_node!(child, CanvasSanitize::SANITIZE)` (`assessment_item_converter.rb#L128-L137`; `html_helper.rb#L27-L36`).
  - Answers go through the same path when they are `div[class=html]` (`choice_interaction.rb#L126`).
  - Feedback goes through `detect_html`.
  - Afterwards `prep_for_import` runs `migration.convert_html(..., remove_outer_nodes_if_one_child: true)` on `question_text`, `*_comments_html`, `answers[].html/comments_html/left_html` (`assessment_question_importer.rb#L185-L231`).
- **Whitelist:** `C`gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb#L57-L753.
- **Preserved HTML elements:** `a b blockquote br caption cite code col hr h1-h6 del ins iframe font colgroup dd div dl dt em figure figcaption i img li ol p pre q small source span strike strong sub sup abbr table tbody td tfoot th thead tr u ul object embed param video track audio address acronym map area bdo dfn kbd legend samp tt var big article aside details footer header nav section summary time picture ruby rt rp mark`.
  - Not on the list, so dropped: `svg`, `style`, `script`, `input`, `button`, `label`, `center`, `s`.
- **Preserved MathML elements:** `annotation annotation-xml maction maligngroup malignmark math menclose merror mfenced mfrac mglyph mi mlabeledtr mlongdiv mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mscarries mscarry msgroup msline mspace msqrt msrow mstack mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none semantics` (L142-L187).
  - Spec "allows valid MathML" round-trips `<math xmlns=…><mrow><mi>…` (`C`gems/canvas_sanitize/spec/canvas_sanitize/canvas_sanitize_spec.rb#L150-L160). Unknown attributes are stripped.
- **MathML attributes, by element:**
  - `math` (L294-L390): `display xmlns displaystyle mathvariant mathsize width height …`, plus `stretchy lspace rspace columnalign rowspacing` and more.
  - `mo` (L427-L457): `form fence separator lspace rspace stretchy symmetric maxsize minsize largeop movablelimits accent linebreak …`
  - `mfrac`: `linethickness numalign denomalign bevelled`
  - `mi`, `mn`: `mathvariant mathsize`
  - `mtable`: `align rowalign columnalign … rowspacing columnspacing … displaystyle`
  - `mtd`: `rowspan columnspan rowalign columnalign groupalign`
  - `msup`, `msub`, `msubsup`: the shift attributes
  - `mspace` (L498): only `href xref mathcolor mathbackground intent arg mathvariant mathsize`. **`width` is not allowed.**
- **Global attributes on every element:** `style class id title role lang dir`, `data-*`, and many `aria-*`.
  - `table`: `summary width border cellpadding cellspacing center frame rules`
  - `td` / `th`: `colspan rowspan width align valign` (+`scope` on `th`)
  - `img`: `align alt height src usemap width longdesc`
- **CSS properties allowed in `style`** (L674-L749):
  - Single properties: `align-content align-items align-self background border border-radius clear clip color column-gap cursor direction display flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float font gap grid height justify-content justify-items justify-self left line-height list-style margin max-height max-width min-height min-width order overflow overflow-x overflow-y padding position place-content place-items place-self right row-gap text-align table-layout text-decoration text-indent top user-select vertical-align visibility white-space width z-index zoom`
  - Generated families: `grid-*` (various), `background-{attachment,color,image,position,repeat,position-x,position-y}`, `border-{bottom,collapse,color,left,right,spacing,style,top,width}`, `border-{side}-{color,style,width}`, `font-{family,size,stretch,style,variant,width}`, `list-style-{image,position,type}`, `margin-*`, `padding-*`
  - **Not allowed:** `font-weight`, `opacity`, `letter-spacing`, `text-transform`, `transform`, `box-shadow`, and top-level `bottom`.
- **What this means for the current SCORM content** (`index.html` checked):
  - Fine as is: `<math displaystyle="true">`, `<mo stretchy="false">`, `<mo lspace rspace>`, `<mtable columnalign rowspacing>`.
  - `<mspace width="10px"/>` loses its width.
  - `font-weight:700/800` is stripped; use `<b>`/`<strong>`.
  - `class="mini|scrollx|q…"` is kept but has no stylesheet in Canvas; inline the styles (`border`, `padding`, `overflow-x:auto`).
  - `var(--muted)` must be resolved to literal colours. Whether Sanitize keeps `var()` at all is UNCONFIRMED.
- **Rendering:** Canvas detects `<math>` and loads MathJax 2.7.7 `TeX-MML-AM_SVG` from cdnjs (`C`packages/canvas-rce/src/enhance-user-content/mathml.js#L51-L74, L159-L181).

## 6. Question 5: encoding and size limits

- **Encoding:**
  - Python parses with `etree.XMLParser(recover=True, resolve_entities=False)` and honours the XML declaration (`Q`lib/imsqtiv1.py#L6302, L6361-L6380). It writes UTF-8 via `codecs.open(...,"utf8")` (`Q`lib/imscp.py#L110, L270-L282).
  - Canvas strips invalid UTF-8 bytes silently (`Utf8Cleaner.recursively_strip_invalid_utf8!`, `content_migration.rb#L750`).
  - No Vietnamese-specific bug was found in the source. The same path handles every Canvas course import, so it is exercised in production (inference).
  - Recommendations:
    - Use UTF-8, put HTML in CDATA, and split any `]]>` inside it.
    - Avoid named HTML entities (`&nbsp;`) outside CDATA, because entities are not resolved.
    - Keep **idents ASCII-only**. Item idents: chars outside `[A-Za-z0-9_.:-]` become `_` and a leading non-letter gets an `ID_` prefix (`Q`lib/imscp.py#L161-L171), so `câu1` and `cáu1` collide. Response idents: `.` and `:` become `_` (`Q`lib/imsqtiv1.py#L164-L172).
    - Normalise answer keys to NFC, since short-answer and FIMB comparison is bytewise after `downcase`. Optionally also list the NFD variant.
  - Zip entry names are read as UTF-8, falling back to cp437 (`C`gems/canvas_unzip/lib/canvas_unzip.rb#L192, L243-L247).
- **Size limits:**
  - `question_text` longer than **16.kilobytes (16,384 characters)** after `convert_html` is replaced with "The imported question text for this question was too long." plus a warning (`assessment_question_importer.rb#L201-L205`). Verbose MathML can hit this; minify it.
  - Bank title is cut to `maximum_string_length` (255) with a warning (L87-L90).
  - Unzip limits: min(100 × zip size, 50 GB) and 100,000 files (`canvas_unzip.rb#L57-L62`).
  - Course storage quota applies (`quota_context` = context).
  - Maximum upload size of the zip on the school's instance: UNCONFIRMED.

## 7. Question 6: failure modes and migration messages

- **Python exits non-zero** → the migration fails with "Couldn't convert QTI 1.2 to 2.1, see error log: …qti_conversion_error.log" (`converter.rb#L93-L110`).
- **Silent losses (Python still exits 0):**
  - A `QTIException` from a structure check, e.g. an element under the wrong parent (`CheckLocation`, `Q`lib/imsqtiv1.py#L289-L292), is caught per file in `ProcessFiles` (L6352). **The whole file or bank is skipped and Canvas shows no error.**
  - Malformed XML is "recovered" by lxml, so content may be truncated.
  - Unknown elements become `Unsupported` and their subtree is skipped.
- **Ruby-side errors:**
  - `add_error` "Error processing question QTI data: …" or "Error processing assessment QTI data: …" (`converter.rb#L112-L138`).
  - Per question: `qti_error` "There was an error exporting an assessment question - …", with `question_type` set to "Error" (`assessment_item_converter.rb#L160-L165`).
  - Unknown interaction gives "No question type used when trying to parse a qti question".
  - These become migration warnings with a `fix_issue_html_url` pointing at the bank question (`assessment_question_importer.rb#L143-L181`).
- **Other messages:**
  - "The importer couldn't determine the correct answers for this question."
  - "Imported matching question contains images on both sides, which is unsupported"
  - "The question text … was too long."
  - "The title of the following question bank was truncated"
  - "Instructure doesn't support QTI importing from this source." (assessment with no `testPart`)
  - "File %{file} could not be found"
  - "Missing links found in imported content - …" (`content_migration.rb#L1230-L1235`)
  - "Import Error: Quiz Question - "<name>"" (`add_import_warning`)
  - Unzip warnings: "file name too long", "unsafe file link", …
- **Wrong results with no message:**
  - True/false demoted to MC.
  - Short answer with no answers becomes an essay.
  - Dropdown or matching with `action="Set"` ends up with no correct answer.
  - Blank names containing `.` or `:` no longer match.
  - Re-import without overwrite creates duplicate banks.

## 8. Minimal Canvas-shaped skeleton

Model the files on Canvas's own export: `C`gems/plugins/qti_exporter/spec_canvas/fixtures/canvas/*.xml and `lib/cc/qti/qti_items.rb`.

- `imsmanifest.xml`:
  - IMS CP 1.1 with no QTI 2 namespace.
  - `<resource identifier="r_bank1" type="imsqti_xmlv1p2" href="bank1.xml"><file href="bank1.xml"/></resource>`
  - `<resource identifier="r_img" type="webcontent"><file href="images/c01.png"/>…</resource>`
- `bank1.xml`:
  - `<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><objectbank ident="nshm_toan_hsa2025_d1">`
  - `<qtimetadata><qtimetadatafield><fieldlabel>bank_title</fieldlabel><fieldentry>Toán – HSA 2025 – Đề 1</fieldentry></qtimetadatafield></qtimetadata>`
  - Each `<item ident="q01" title="Câu 1">` carries `itemmetadata/qtimetadata` with `question_type` and `points_possible`, plus `presentation/material/mattext texttype="text/html"` holding `<![CDATA[<div>…<math>…</math><img src="images/c01.png" alt=""></div>]]>`, the type-specific `response_lid`/`response_str`, `resprocessing` with `<decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>` as in the table above, and `itemfeedback ident="general_fb"`.
- Import via Course Settings → Import Course Content → QTI .zip file with "Overwrite assessment content with matching IDs" checked for updates. The API equivalent is `migration_type=qti_converter`, `settings[overwrite_quizzes]=true`.

## 9. Not confirmed — test these on a sandbox course

1. Whether selecting an existing bank in "Default Question bank" puts unfiled questions into that bank, or creates a new bank with the same title.
2. Several `<objectbank>` elements in one file, and sections inside an objectbank.
3. Whether `itemfeedback` that no `displayfeedback` references still becomes `modalFeedback`.
4. Whether Sanitize keeps CSS `var()`.
5. Client-side decimal handling in the Classic numerical input for the Vietnamese locale.
6. The zip upload size limit on the school's instance.
7. Behaviour with "Convert content to New Quizzes" checked, and whether the school has disabled Classic Quiz creation.