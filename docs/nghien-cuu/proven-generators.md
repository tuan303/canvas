# Canvas QTI 1.2: field-tested generators, verbatim templates and import pitfalls

Researched 2026-10-02. All sources were cloned or fetched at the commits below, and line numbers refer to those commits. Anything I could not confirm is marked UNCONFIRMED.

## 0. Bottom line for the tool design

1. **Use the Canvas dialect of QTI 1.2, not QTI 2.1.**
   - Canvas runs QTI 1.2 through QTIMigrationTool to convert it to 2.1, then parses that ([converter.rb L50-90](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/converter.rb)).
   - Plain QTI 2.1 `textEntryInteraction` is imported as Essay ([canvas-lms#2605](https://github.com/instructure/canvas-lms/issues/2605), 2026-03-17).
2. **Copy the item shapes from proven sources:**
   - text2qti for MC, TF, multiple answers, short answer, numerical, essay, file upload and text-only.
   - Canvas's own exporter (`lib/cc/qti/qti_items.rb`) for multiple dropdowns, fill in multiple blanks and matching. Those question types are also shipped by backyardbiomech/qtiConverter, R/exams and moodle2cc.
3. **XML-escape all HTML inside `<mattext>`** (entities or CDATA). Never put raw child tags in it.
4. **Never use `data:` image URIs.** Package each image file, list it as a `webcontent` resource and reference it by a package path.
5. **Options in dropdowns, blanks and the right side of matching are plain text.** Math there must be Unicode text, not MathML.
6. **For a bank without a quiz:**
   - Canvas's own format is an `<objectbank>` with `bank_title` inside a Canvas cartridge.
   - Respondus's endpoint imports a QTI zip with "banks only" selected.
   - A plain QTI .zip import always creates a quiz as well.

## 1. Sources and how much field evidence each has

| Source | Commit read | Field evidence |
|---|---|---|
| gpoore/text2qti (242 stars) | [80dac05](https://github.com/gpoore/text2qti/tree/80dac052bec7953e5790567cf5a500644886d5b8) (2026-08-20) | Templates are reverse-engineered from Canvas exports ([issue #5](https://github.com/gpoore/text2qti/issues/5): "basing most of my work on reverse-engineering the Canvas QTI exports"). Many users report success, e.g. [#46](https://github.com/gpoore/text2qti/issues/46). Covers MC, TF, multiple answers, short answer, numerical, essay, upload and text-only. **No dropdowns, blanks or matching** (#17, #53, #54 still open). |
| substance9/text2qti fork | [6a46272](https://github.com/substance9/text2qti/tree/6a462722212dea36e3fb2b3dbd45198f16968732) | Adds fill in multiple blanks and multiple dropdowns. Referenced by gpoore in [#17](https://github.com/gpoore/text2qti/issues/17). No import reports found (UNCONFIRMED). |
| text2qti PR #76 (Holmgren825) | [016fbf5](https://github.com/Holmgren825/text2qti/tree/016fbf5fd2d998ee633b4da9409380f9f8c845fb) | Adds matching and ordering. Author claims ["Both questions work as an old and a new quiz"](https://github.com/gpoore/text2qti/issues/76). See pitfall P10 for a likely ID bug. |
| backyardbiomech/qtiConverter (15 stars) | [9659aab](https://github.com/backyardbiomech/qtiConverter/tree/9659aab19469ea7bcb36cb0fc4c8f1c995ff315f) (2026-05-13) | Actively used by its author for Classic banks and New Quizzes item banks. Supports dropdowns, blanks, matching, images and LaTeX. |
| R/exams `exams2canvas` (CRAN 2.4-4) | [cran/exams 4efb245](https://github.com/cran/exams/tree/4efb245ef03a251fdfd3836c8ec3e53c6927cdb0) | Mature, with many user-reported fixes in NEWS.md. Covers num, schoice, mchoice, string and cloze-as-dropdowns. |
| instructure/moodle2cc (Instructure's own) | [ebdc4d4](https://github.com/instructure/moodle2cc/tree/ebdc4d4d2b57959b50799353870642a21f995d90) | Produces a Canvas cartridge (.imscc) with `objectbank` question banks, matching, blanks and dropdowns. |
| Canvas exporter / importer | [canvas-lms 1c9f0bb](https://github.com/instructure/canvas-lms/tree/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c) | Ground truth: the exporter's output is what the importer re-imports. |
| instructure/QTIMigrationTool | [aab28af](https://github.com/instructure/QTIMigrationTool/tree/aab28af7a05142140c6fd2f45ed67a4c925a7d1b) | The 1.2 → 2.1 converter Canvas runs on QTI zips. |
| vosslab/qti-package-maker | [f7a06b5](https://github.com/vosslab/qti-package-maker/tree/f7a06b55e293490acdb129b74598ea7a00186940) | README: live Canvas image rendering is "unverified because the public Free for Teacher sandbox was discontinued". Treat as low evidence. |
| SchildCode/quizXL | [repo](https://github.com/SchildCode/quizXL) | Excel macro that exports all 9 auto-graded Classic types. Logic is VBA inside the .xlsm, so templates were not extracted. |
| Respondus 4.0 → Canvas | [urn_RespondusAPIServant.rb](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/respondus_soap_endpoint/lib/respondus_soap_endpoint/urn_RespondusAPIServant.rb) | Canvas has a dedicated SOAP endpoint that can import into banks only. ExamSoft was not researched. |

## 2. Verbatim templates: text2qti

### 2.1 Zip layout

[qti.py L52-60](https://github.com/gpoore/text2qti/blob/80dac052bec7953e5790567cf5a500644886d5b8/text2qti/qti.py):

```python
    def write(self, bytes_stream: BinaryIO):
        with zipfile.ZipFile(bytes_stream, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('imsmanifest.xml', self.imsmanifest_xml)
            zf.writestr(zipfile.ZipInfo('non_cc_assessments/'), b'')
            zf.writestr(f'{self.assessment_identifier}/assessment_meta.xml', self.assessment_meta)
            zf.writestr(f'{self.assessment_identifier}/{self.assessment_identifier}.xml', self.assessment)
            for image in self.quiz.images.values():
                zf.writestr(image.qti_zip_path, image.data)
```

Identifiers are built as `f'{id_base}_manifest_{quiz.id}'`, `_assessment_`, `_dependency_`, `_assignment_`, `_assignment-group_`, with `id_base = 'text2qti'` (qti.py L26-31).

### 2.2 imsmanifest.xml

[xml_imsmanifest.py](https://github.com/gpoore/text2qti/blob/80dac052bec7953e5790567cf5a500644886d5b8/text2qti/xml_imsmanifest.py):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{manifest_identifier}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
    <imsmd:lom>
      <imsmd:general>
        <imsmd:title>
          <imsmd:string>QTI assessment generated by text2qti</imsmd:string>
        </imsmd:title>
      </imsmd:general>
      <imsmd:lifeCycle>
        <imsmd:contribute>
          <imsmd:date>
            <imsmd:dateTime>{date}</imsmd:dateTime>
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
    <resource identifier="{assessment_identifier}" type="imsqti_xmlv1p2">
      <file href="{assessment_identifier}/{assessment_identifier}.xml"/>
      <dependency identifierref="{dependency_identifier}"/>
    </resource>
    <resource identifier="{dependency_identifier}" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="{assessment_identifier}/assessment_meta.xml">
      <file href="{assessment_identifier}/assessment_meta.xml"/>
    </resource>
    <!-- one per image: -->
    <resource identifier="text2qti_image_{ident}" type="webcontent" href="{path}">
      <file href="{path}"/>
    </resource>
  </resources>
</manifest>
```

`schemaversion 1.1.3` refers to the content-packaging spec, not the QTI version ([#50](https://github.com/gpoore/text2qti/issues/50)). R/exams' [canvas_manifest.xml](https://github.com/cran/exams/blob/4efb245ef03a251fdfd3836c8ec3e53c6927cdb0/inst/xml/canvas_manifest.xml) is the same header.

### 2.3 assessment_meta.xml

[xml_assessment_meta.py](https://github.com/gpoore/text2qti/blob/80dac052bec7953e5790567cf5a500644886d5b8/text2qti/xml_assessment_meta.py). R/exams' `canvas_meta.xml` is nearly identical.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<quiz identifier="{assessment_identifier}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>{title}</title>
  <description>{description}</description>
  <shuffle_answers>{shuffle_answers}</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <hide_results>{hide_results}</hide_results>
  <quiz_type>assignment</quiz_type>
  <points_possible>{points_possible:.1f}</points_possible>
  <require_lockdown_browser>false</require_lockdown_browser>
  <require_lockdown_browser_for_results>false</require_lockdown_browser_for_results>
  <require_lockdown_browser_monitor>false</require_lockdown_browser_monitor>
  <lockdown_browser_monitor_data/>
  <show_correct_answers>{show_correct_answers}</show_correct_answers>
  <anonymous_submissions>false</anonymous_submissions>
  <could_be_locked>false</could_be_locked>
  <allowed_attempts>1</allowed_attempts>
  <one_question_at_a_time>{one_question_at_a_time}</one_question_at_a_time>
  <cant_go_back>{cant_go_back}</cant_go_back>
  <available>false</available>
  <one_time_results>false</one_time_results>
  <show_correct_answers_last_attempt>false</show_correct_answers_last_attempt>
  <only_visible_to_overrides>false</only_visible_to_overrides>
  <module_locked>false</module_locked>
  <assignment identifier="{assignment_identifier}">
    <title>{title}</title>
    <due_at/>
    <lock_at/>
    <unlock_at/>
    <module_locked>false</module_locked>
    <workflow_state>unpublished</workflow_state>
    <assignment_overrides>
    </assignment_overrides>
    <quiz_identifierref>{assessment_identifier}</quiz_identifierref>
    <allowed_extensions></allowed_extensions>
    <has_group_category>false</has_group_category>
    <points_possible>{points_possible:.1f}</points_possible>
    <grading_type>points</grading_type>
    <all_day>false</all_day>
    <submission_types>online_quiz</submission_types>
    <position>1</position>
    <turnitin_enabled>false</turnitin_enabled>
    <vericite_enabled>false</vericite_enabled>
    <peer_review_count>0</peer_review_count>
    <peer_reviews>false</peer_reviews>
    <automatic_peer_reviews>false</automatic_peer_reviews>
    <anonymous_peer_reviews>false</anonymous_peer_reviews>
    <grade_group_students_individually>false</grade_group_students_individually>
    <freeze_on_copy>false</freeze_on_copy>
    <omit_from_final_grade>false</omit_from_final_grade>
    <intra_group_peer_reviews>false</intra_group_peer_reviews>
    <only_visible_to_overrides>false</only_visible_to_overrides>
    <post_to_sis>false</post_to_sis>
    <moderated_grading>false</moderated_grading>
    <grader_count>0</grader_count>
    <grader_comments_visible_to_graders>true</grader_comments_visible_to_graders>
    <anonymous_grading>false</anonymous_grading>
    <graders_anonymous_to_graders>false</graders_anonymous_to_graders>
    <grader_names_visible_to_final_grader>true</grader_names_visible_to_final_grader>
    <anonymous_instructor_annotations>false</anonymous_instructor_annotations>
    <post_policy>
      <post_manually>false</post_manually>
    </post_policy>
  </assignment>
  <assignment_group_identifierref>{assignment_group_identifier}</assignment_group_identifierref>
  <assignment_overrides>
  </assignment_overrides>
</quiz>
```

### 2.4 Assessment wrapper, group and text-only item

[xml_assessment.py L14-77](https://github.com/gpoore/text2qti/blob/80dac052bec7953e5790567cf5a500644886d5b8/text2qti/xml_assessment.py):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
  <assessment ident="{assessment_identifier}" title="{title}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>cc_maxattempts</fieldlabel>
        <fieldentry>1</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
...
    </section>
  </assessment>
</questestinterop>
```

Group (a question group that picks N questions):

```xml
    <section ident="{ident}" title="{group_title}">
      <selection_ordering>
        <selection>
          <selection_number>{pick}</selection_number>
          <selection_extension>
            <points_per_item>{points_per_item}</points_per_item>
          </selection_extension>
        </selection>
      </selection_ordering>
```

Text-only item:

```xml
      <item ident="{ident}" title="{text_title_xml}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>text_only_question</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>0</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>original_answer_ids</fieldlabel>
              <fieldentry></fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>assessment_question_identifierref</fieldlabel>
              <fieldentry>{assessment_question_identifierref}</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">{text_html_xml}</mattext>
          </material>
        </presentation>
      </item>
```

### 2.5 Item metadata

Shared by all scored types (L88-111). For essay and upload, `{original_answer_ids}` is left empty.

```xml
      <item ident="{question_identifier}" title="{question_title}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>question_type</fieldlabel>
              <fieldentry>{question_type}</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>points_possible</fieldlabel>
              <fieldentry>{points_possible}</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>original_answer_ids</fieldlabel>
              <fieldentry>{original_answer_ids}</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>assessment_question_identifierref</fieldlabel>
              <fieldentry>{assessment_question_identifierref}</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
```

`question_type` values used: `true_false_question`, `multiple_choice_question`, `short_answer_question`, `multiple_answers_question`, `numerical_question`, `essay_question`, `file_upload_question`.

### 2.6 Presentation blocks

L115-184. Multiple answers is the same as MC with `Single` replaced by `Multiple`.

MC / TF:

```xml
        <presentation>
          <material>
            <mattext texttype="text/html">{question_html_xml}</mattext>
          </material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
              <response_label ident="{ident}">
                <material>
                  <mattext texttype="text/html">{choice_html_xml}</mattext>
                </material>
              </response_label>
            </render_choice>
          </response_lid>
        </presentation>
```

Short answer and essay (identical XML; essay differs only by `question_type`):

```xml
        <presentation>
          <material>
            <mattext texttype="text/html">{question_html_xml}</mattext>
          </material>
          <response_str ident="response1" rcardinality="Single">
            <render_fib>
              <response_label ident="answer1" rshuffle="No"/>
            </render_fib>
          </response_str>
        </presentation>
```

File upload:

```xml
        <presentation>
          <material>
            <mattext texttype="text/html">{question_html_xml}</mattext>
          </material>
        </presentation>
```

Numerical:

```xml
        <presentation>
          <material>
            <mattext texttype="text/html">{question_html_xml}</mattext>
          </material>
          <response_str ident="response1" rcardinality="Single">
            <render_fib fibtype="Decimal">
              <response_label ident="answer1"/>
            </render_fib>
          </response_str>
        </presentation>
```

### 2.7 Response processing

L187-384.

Opening block:

```xml
        <resprocessing>
          <outcomes>
            <decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>
          </outcomes>
```

MC / TF correct answer:

```xml
          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">{ident}</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
```

Short answer: one `varequal` per accepted string, all inside one `conditionvar`:

```xml
          <respcondition continue="No">
            <conditionvar>
              <varequal respident="response1">{answer_xml}</varequal>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
```

Multiple answers: correct choices in plain `varequal`, wrong choices in `<not>`:

```xml
          <respcondition continue="No">
            <conditionvar>
              <and>
                <varequal respident="response1">{ident}</varequal>
                <not>
                  <varequal respident="response1">{ident}</varequal>
                </not>
              </and>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
```

Numerical, range form:

```xml
          <respcondition continue="No">
            <conditionvar>
              <vargte respident="response1">{num_min}</vargte>
              <varlte respident="response1">{num_max}</varlte>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
```

Numerical, exact-with-margin form:

```xml
          <respcondition continue="No">
            <conditionvar>
              <or>
                <varequal respident="response1">{num_exact}</varequal>
                <and>
                  <vargte respident="response1">{num_min}</vargte>
                  <varlte respident="response1">{num_max}</varlte>
                </and>
              </or>
            </conditionvar>
            <setvar action="Set" varname="SCORE">100</setvar>
          </respcondition>
```

Essay:

```xml
          <respcondition continue="No">
            <conditionvar>
              <other/>
            </conditionvar>
          </respcondition>
        </resprocessing>
```

General feedback (`general_fb`):

```xml
          <respcondition continue="Yes">
            <conditionvar>
              <other/>
            </conditionvar>
            <displayfeedback feedbacktype="Response" linkrefid="general_fb"/>
          </respcondition>
...
        <itemfeedback ident="general_fb">
          <flow_mat>
            <material>
              <mattext texttype="text/html">{feedback}</mattext>
            </material>
          </flow_mat>
        </itemfeedback>
```

Other feedback idents follow the same pattern: `correct_fb`, `general_incorrect_fb`, and `{choice_ident}_fb`.

### 2.8 Images, math and escaping in text2qti

[markdown.py](https://github.com/gpoore/text2qti/blob/80dac052bec7953e5790567cf5a500644886d5b8/text2qti/markdown.py)

Image paths (L68-78):

```python
    @property
    def src_path(self):
        return f'%24IMS-CC-FILEBASE%24/images/{urllib.parse.quote(self.name)}'
    @property
    def qti_zip_path(self):
        return f'images/{self.name}'
    @property
    def qti_xml_path(self):
        return f'images/{urllib.parse.quote(self.name)}'
```

- Image names are de-duplicated by content hash (BLAKE2b).
- Only paths that do not start with `http://` or `https://` are packaged.

LaTeX as a Canvas equation image (L240-262; "Double url escaping is required"):

```python
CANVAS_EQUATION_TEMPLATE = '<img class="equation_image" title="{latex_xml_escaped}" src="{latex_render_url}/{latex_url_escaped}?scale=1" alt="LaTeX: {latex_xml_escaped}" data-equation-content="{latex_xml_escaped}" data-ignore-a11y-check="" >'
```

- Default `latex_render_url` is `/equation_images/` (CHANGELOG v0.7.0).
- Optional MathML instead: `['pandoc', '-f', 'markdown', '-t', 'html', '--mathml']`, with the outer `<p>` stripped (L265-299).

Escaping (L525-532): HTML is entity-escaped for the four characters `& < > ` (quotes left alone), via `xml_escape(html, squotes=False, dquotes=False)`. Titles are plain text and escaped the same way.

## 3. Multiple dropdowns (`multiple_dropdowns_question`)

### 3.1 Canvas's own exporter (ground truth)

[qti_items.rb L239-258 and L434-449](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb) (Ruby builder, verbatim):

```ruby
      def multiple_dropdowns_response_lid(node, question)
        groups = question["answers"].group_by { |a| a[:blank_id] }
        groups.each_pair do |id, answers|
          node.response_lid(ident: "response_#{id}") do |lid_node|
            lid_node.material do |mat_node|
              mat_node.mattext id
            end
            lid_node.render_choice do |rc_node|
              answers.each do |answer|
                rc_node.response_label(ident: answer["id"]) do |r_node|
                  r_node.material do |mat_node|
                    html_mat_text(mat_node, answer["html"], answer["text"])
...
      def multiple_dropdowns_resprocessing(node, question)
        groups = question["answers"].group_by { |a| a[:blank_id] }
        correct_points = 100.0 / groups.length
        correct_points = "%.2f" % correct_points
        groups.each_pair do |id, answers|
          next unless (answer = answers.find { |a| a["weight"].to_i > 0 })
          node.respcondition do |r_node|
            r_node.conditionvar do |c_node|
              c_node.varequal(answer["id"], respident: "response_#{id}")
            end
            r_node.setvar(correct_points, varname: "SCORE", action: "Add")
```

- The question text contains `[blank_id]` literally. Canvas itself converts its own "missing word" type to `... [drop1] ...` (L230-237).
- Fill in multiple blanks uses the same presentation (L172-173) and the same resprocessing (L291-292).

### 3.2 backyardbiomech/qtiConverter `parseMD`

[qtiConverterApp.py L569-668](https://github.com/backyardbiomech/qtiConverter/blob/9659aab19469ea7bcb36cb0fc4c8f1c995ff315f/qtiConverterApp.py). Input format: `Here is the first [drop1] ...` / `*drop1: correct` / `drop1: wrong`.

```xml
<response_lid ident="{}">          <!-- 'response_' + dropName -->
                                                <material>
                                                  <mattext>{}</mattext>   <!-- dropName -->
                                                </material>
                                                <render_choice>
<response_label ident="{}">        <!-- 'resp' + line number -->
                                                    <material>
                                                      <mattext texttype="text/html">{}</mattext>
                                                    </material>
                                                  </response_label>
</render_choice>
                                      </response_lid>
...
<respcondition>
                                            <conditionvar>
                                              <varequal respident="{}">{}</varequal>   <!-- 'response_'+dropName, correct respID -->
                                            </conditionvar>
                                            <setvar varname="SCORE" action="Add">{}</setvar>   <!-- 100/len(drops) -->
                                          </respcondition>
```

The `<!-- -->` comments are mine; the rest is the verbatim string.

### 3.3 R/exams cloze rendered as dropdowns

[exams2qti12.R L637-642, L652-653, L761-763](https://github.com/cran/exams/blob/4efb245ef03a251fdfd3836c8ec3e53c6927cdb0/R/exams2qti12.R):

```r
        if(canvas & (type[i] == "schoice")) {
          if(any(grepl(asub <- paste0("##ANSWER", i, "##"), xml))) {
            xml <- gsub(asub, paste0("[", ids[[i]]$response, "]"), xml, fixed = TRUE)
            multiple_dropdowns <- TRUE
...
          ## Canvas cannot render HTML in dropdown menus
          if(multiple_dropdowns) questionlist[[i]][j] <- pandoc(questionlist[[i]][j], from = "html", to = "plain")
...
      canvas_type <- if(multiple_dropdowns) {
        "multiple_dropdowns_question"
```

- Each correct answer gets its own `<respcondition>` with `<setvar varname="SCORE" action="Add">` (L1000-1009).
- Mixed cloze is rejected: `stop("only cloze questions with schoice elements are supported for Canvas")` (L764).

moodle2cc's [multiple_dropdowns_question_writer.rb](https://github.com/instructure/moodle2cc/blob/ebdc4d4d2b57959b50799353870642a21f995d90/lib/moodle2cc/canvas_cc/multiple_dropdowns_question_writer.rb) emits the same `response_lid ident="response_#{id}"` shape but no scoring ("answerless questionnaire question").

## 4. Fill in multiple blanks (`fill_in_multiple_blanks_question`)

### 4.1 substance9 fork

[xml_assessment.py L139-165, L267-283](https://github.com/substance9/text2qti/blob/6a462722212dea36e3fb2b3dbd45198f16968732/text2qti/xml_assessment.py). The same templates are used for dropdowns.

```xml
        <presentation>
          <material>
            <mattext texttype="text/html">{question_html_xml}</mattext>
          </material>
{reference_words}
        </presentation>

          <response_lid ident="response_{ref_word}">
            <material>
              <mattext>{ref_word}</mattext>
            </material>
            <render_choice>
{choices}
            </render_choice>
          </response_lid>

              <response_label ident="{ident}">
                <material>
                  <mattext texttype="text/html">{choice_html_xml}</mattext>
                </material>
              </response_label>

          <respcondition>
            <conditionvar>
              <varequal respident="response_{ref_word}">{ident}</varequal>
            </conditionvar>
            <setvar varname="SCORE" action="Add">{score}</setvar>
          </respcondition>
```

`score = '%.2f' % (100/num_reference_words)`.

### 4.2 qtiConverter `parseMB`

L669-746. Input format: `[blank1]` in the stem, then `blank1: ans a, ans b`.

```xml
<response_lid ident="{}">            <!-- blank name, no "response_" prefix -->
                                        <material>
                                            <mattext>{}</mattext>
                                        </material>
                                        <render_choice>
<response_label ident="{}">          <!-- 'resp'+i, restarts per blank -->
                                                <material>
                                                    <mattext texttype="text/html">{}</mattext>
                                                </material>
                                            </response_label>
...
<respcondition>
                                        <conditionvar>
                                            <varequal respident="{}">{}</varequal>   <!-- blank, 'resp0' -->
                                        </conditionvar>
                                        <setvar varname="SCORE" action="Add">{}</setvar>
                                    </respcondition>
```

moodle2cc ([multiple_blanks_question_writer.rb](https://github.com/instructure/moodle2cc/blob/ebdc4d4d2b57959b50799353870642a21f995d90/lib/moodle2cc/canvas_cc/multiple_blanks_question_writer.rb)) uses `response_lid ident=resp_ident rcardinality="Single"`, labels with `texttype 'text/html'`, and per-answer `setvar ... action 'Set'`.

## 5. Matching (`matching_question`)

### 5.1 Canvas exporter

[qti_items.rb L199-219, L407-432](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_items.rb):

```ruby
        question["answers"].each do |answer|
          node.response_lid(ident: "response_#{answer["id"]}") do |lid_node|
            lid_node.material do |mat_node|
              html_mat_text(mat_node, answer["html"], answer["text"])
            end
            lid_node.render_choice do |rc_node|
              next unless question["matches"]
              question["matches"].each do |match|
                rc_node.response_label(ident: match["match_id"]) do |r_node|
                  r_node.material do |mat_node|
                    mat_node.mattext match["text"]
...
        correct_points = 100.0 / question["answers"].count
        correct_points = "%.2f" % correct_points
        question["answers"].each do |answer|
          node.respcondition do |r_node|
            r_node.conditionvar do |c_node|
              c_node.varequal(answer["match_id"], respident: "response_#{answer["id"]}")
            end
            r_node.setvar(correct_points, varname: "SCORE", action: "Add")
```

Every left-side `response_lid` lists **all** right-side options, distractors included. Canvas's `match_id` values are integers.

### 5.2 qtiConverter `parseMT`

L461-568. Input format: `[right2]left1: text` / `right1: text`.

```xml
<response_lid ident="{}">                  <!-- leftID e.g. left1 -->
                <material>
                  <mattext texttype="text/html">{}</mattext>
                </material>
                <render_choice>
<response_label ident="{}">                <!-- rightID e.g. right2 -->
                        <material>
                          <mattext>{}</mattext>
                        </material>
                      </response_label>
</render_choice>
                                        </response_lid>
...
<respcondition>
                    <conditionvar>
                      <varequal respident="{}">{}</varequal>
                    </conditionvar>
                    <setvar varname="SCORE" action="Add">{}</setvar>
                  </respcondition>
```

Also: text2qti PR #76 has templates `ITEM_PRESENTATION_MATCHING_CHOICE` (`<response_lid ident="response_{ident}">`) and `ITEM_RESPROCESSING_MATCHING` (`<setvar action="Add" varname="SCORE">{score}</setvar>`) — [pr76 xml_assessment.py L276-300, L552-558](https://github.com/Holmgren825/text2qti/blob/016fbf5fd2d998ee633b4da9409380f9f8c845fb/text2qti/xml_assessment.py). moodle2cc: [matching_question_writer.rb](https://github.com/instructure/moodle2cc/blob/ebdc4d4d2b57959b50799353870642a21f995d90/lib/moodle2cc/canvas_cc/matching_question_writer.rb).

## 6. Question-bank-only file (`objectbank`)

### 6.1 Canvas exporter

[qti_generator.rb L181-200, L319-338](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/cc/qti/qti_generator.rb):

```ruby
        rel_path = File.join(ASSESSMENT_NON_CC_FOLDER, bank_mig_id + QTI_EXTENSION)
...
        @resources_node.resource(identifier: bank_mig_id, type: LOR, href: rel_path) do |res|
          res.file(href: rel_path)
...
        doc.questestinterop("xmlns" => "http://www.imsglobal.org/xsd/ims_qtiasiv1p2",
                            "xmlns:xsi" => "http://www.w3.org/2001/XMLSchema-instance",
                            "xsi:schemaLocation" => "http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd") do |qti_node|
          qti_node.objectbank(ident: migration_id) do |bank_node|
            bank_node.qtimetadata do |meta_node|
              meta_field(meta_node, "bank_title", bank.title)
...
            bank.assessment_questions.active.each do |aq|
              add_question(bank_node, aq.data.with_indifferent_access)
```

### 6.2 moodle2cc

The same structure: [question_bank_writer.rb](https://github.com/instructure/moodle2cc/blob/ebdc4d4d2b57959b50799353870642a21f995d90/lib/moodle2cc/canvas_cc/question_bank_writer.rb) plus [models/question_bank.rb](https://github.com/instructure/moodle2cc/blob/ebdc4d4d2b57959b50799353870642a21f995d90/lib/moodle2cc/canvas_cc/models/question_bank.rb):

- `href = "non_cc_assessments/#{identifier}.xml.qti"`
- type `associatedcontent/imscc_xmlv1p1/learning-application-resource`
- packaged as a `.imscc` with `course_settings/canvas_export.txt` (cartridge_creator.rb, canvas_export_writer.rb).

### 6.3 Importer side for QTI zips

QTIMigrationTool accepts `<objectbank>`:

- It prints `'Warning: objectbank not supported, looking inside for items'` but records the `ident` ([imsqtiv1.py L650-677](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imsqtiv1.py)).
- It reads `bank_title` into `question_bank_name` (L2969-2981).
- It tags each item with `question_bank` / `question_bank_iden` (L611-614, L1929-1930).
- Canvas then groups questions by that name ([assessment_question_bank_importer.rb](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/importers/assessment_question_bank_importer.rb)).

Whether a **QTI .zip** containing only an `objectbank` creates the bank with no quiz is UNCONFIRMED; no tool tested it.

## 7. Pitfalls, with evidence

**P1. Failures are often silent.**
- text2qti README: "When Canvas encounters an invalid quiz file, it tends to fail silently; instead of reporting an error in the quiz file, it just never creates a quiz based on the invalid file." ([README](https://github.com/gpoore/text2qti/blob/80dac052bec7953e5790567cf5a500644886d5b8/README.md))
- R/exams also notes some tags are "necessary for Canvas to recognize the answer alternatives".

**P2. HTML inside `<mattext>` must be escaped (entities or CDATA).**
- Raw child tags go through QTIMigrationTool's `RawMaterial` (L4113, "Special class to catch tags not escaped in CDATA sections").
- Unknown tags are turned into spans: `'Warning: unsupported embedded formatting instruction replaced by <span class="%s">'` (L3849). Raw MathML would be destroyed this way.
- Field evidence: qtiConverter commit [1dcc149](https://github.com/backyardbiomech/qtiConverter/commit/1dcc149e95535b81b98780ff124f333fbc78ab50), "listed images working on import" (2025-12-04), replaced raw `<p><img src=...></p>` with `&lt;img src="$IMS-CC-FILEBASE$/Uploaded Media/{img}"/&gt;`.
- Proven generators: text2qti entity-escapes; R/exams uses `<![CDATA[...]]>`.

**P3. Base64 images are removed.**
- The Canvas sanitizer allows only `DEFAULT_PROTOCOLS = ["http", "https", :relative]` for `img src` ([canvas_sanitize.rb L49, L662](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb)).
- text2qti [PR #56](https://github.com/gpoore/text2qti/issues/56): "Canvas LMS does not appear to provide any support whatsoever for base64 images".
- R/exams Rd: "Supplementary files (images, data, ...) must be embedded without Base 64 encoding. Thus, base64 = FALSE is hard-coded".

**P4. Images must be packaged, listed and referenced by path.**
- Two field-tested forms:
  - text2qti: `src="%24IMS-CC-FILEBASE%24/images/<urlquoted>"`, file at `images/<name>`, plus a `webcontent` resource.
  - R/exams: relative `data/supplements_i_j/<file>`, plus a `webcontent` resource (exams2qti12.R L466-472).
- How the importer resolves them:
  - It strips tokens matching `/\$[A-Z_]*\$/` and matches the path, or failing that a path suffix, against the package files ([html_helper.rb L63-66, L109](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/html_helper.rb)).
  - The hyphenated `$IMS-CC-FILEBASE$` does not match that regex. Why text2qti's form still works is UNCONFIRMED; it is probably handled by later link conversion.
- qtiConverter references `$IMS-CC-FILEBASE$/Uploaded Media/<img>` while storing files at the zip root. It is unclear why (it may be for New Quizzes), so UNCONFIRMED.
- qti-package-maker could not verify image rendering on live Canvas ([MEDIA_LMS_PROBES.md](https://github.com/vosslab/qti-package-maker/blob/f7a06b55e293490acdb129b74598ea7a00186940/docs/MEDIA_LMS_PROBES.md), status BLOCKED).
- Recommendation (my inference, not tested): use ASCII-only image file names.

**P5. Math has three options, with these tradeoffs:**
- **(a) MathML, escaped inside the HTML.** The Canvas sanitizer allows MathML elements (`math`, `mfrac`, `semantics`, `annotation`, ... at L142-186). text2qti `--pandoc-mathml` was used successfully on Canvas ([#43](https://github.com/gpoore/text2qti/issues/43), JeffFessler 2021-09-06). However, R/exams warns MathML "works as well, albeit possibly with problems when imported from a quiz to the item bank". R/exams 2.4-2 changed its default to `pandoc-mathjax` because "employing MathJax in the Canvas quiz might facilitate importing the quiz into a Canvas question bank" ([NEWS.md](https://github.com/cran/exams/blob/4efb245ef03a251fdfd3836c8ec3e53c6927cdb0/NEWS.md)).
- **(b) MathJax delimiters `\(...\)` or `$$...$$`.** Canvas only detects these when the feature `new_math_equation_handling` is on ([mathml.js L165-178](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/packages/canvas-rce/src/enhance-user-content/mathml.js)). Whether that flag is on for a given school instance is UNCONFIRMED.
- **(c) `img.equation_image` with double-URL-encoded LaTeX after `/equation_images/`.** The Canvas front end turns these into MathJax (`catchEquationImages`, L290-308). If rendering fails, alt text such as "LaTeX: p" shows instead ([#43](https://github.com/gpoore/text2qti/issues/43)).

**P6. Dropdown options, blank answers and matching right-side options are plain text.**
- Importer code: `answer[:text] = choice.text.strip` ([fill_in_the_blank.rb L91](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/fill_in_the_blank.rb)) and `match[:text] = sc.text.strip` ([associate_interaction.rb L122](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/associate_interaction.rb)).
- R/exams 2.4-1: "no HTML rendering is available in the Canvas dropdown selections ... formatting (especially for mathematical notation) will be lost".
- Therefore use Unicode text (x², √2, ≤, ½) in options.

**P7. Dropdown and matching scoring must use `<setvar action="Add">`.**
- For dropdowns, the importer marks an option correct only if its condition contains `setOutcomeValue[identifier=SCORE] sum`, which is what `action="Add"` becomes after conversion (fill_in_the_blank.rb L97-105). Matching checks the same thing (associate_interaction.rb L146).
- Every proven generator (Canvas exporter, qtiConverter, R/exams, substance9) uses `Add`.

**P8. Blank and dropdown placeholders must line up with the `response_lid` ident.**
- The stem must contain `[x]`, and the `response_lid` ident must be `response_x` or `x`. The importer does `blank_id.gsub!(/^response_/, "")` (fill_in_the_blank.rb L84-86).

**P9. Fill in multiple blanks cannot have distractors.**
- Every `response_label` becomes a correct answer: `answer[:weight] = (@type == "multiple_dropdowns_question") ? 0 : 100` (L89).
- List each accepted spelling or number format as its own label.

**P10. Matching right-side identifiers need a unique digit run.**
- The importer takes `match_id` from the first digit run: `match[:match_id] = if sc["identifier"] =~ /(\d+)/ ... $1.to_i` (associate_interaction.rb L117).
- PR #76's IDs all start with `text2qti_choice_`, so every one yields "2" and they collide. This is inferred from source, UNCONFIRMED in practice.
- Safe forms: numeric IDs as in Canvas, `choice_001` (qti-package-maker), `right1` (qtiConverter).
- Right-side options are read only from the first `choiceInteraction`, so every left item must list the full option set.

**P11. Vietnamese True/False becomes multiple choice.**
- `true_false_question` survives only with exactly 2 answers matching `/true/i` and `/false/i`; otherwise `@question[:question_type] = "multiple_choice_question"` ([choice_interaction.rb L53-70](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/choice_interaction.rb)).
- Emit "Đúng/Sai" directly as `multiple_choice_question`.
- No native multi-statement TF exists. The candidates are dropdowns per statement (shows as matching after migration to New Quizzes) or matching with Đúng/Sai on the right. This mapping is design inference.

**P12. Identifiers.**
- QTIMigrationTool replaces characters outside NMTOKEN with `_` and prefixes `ID_` if the first character is not a valid start character ([imscp.py L162-172](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/lib/imscp.py)). It replaces colons with hyphens (imsqtiv1.py L1977-1979).
- text2qti hashes only the stem, so two questions with the same stem raise "Duplicate question" ([#38](https://github.com/gpoore/text2qti/issues/38)). Vietnamese stems such as "Chọn đáp án đúng" will collide. Use exam code plus question number instead.
- Answer IDs come from `original_answer_ids` in order; non-numeric ones are replaced by random numbers ([assessment_item_converter.rb L234-245](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/plugins/qti_exporter/lib/qti/assessment_item_converter.rb)). This is harmless.
- The "Overwrite assessment content with matching IDs" option relies on stable IDs ([Canvas guide](https://community.instructure.com/t5/Instructor-Guide/How-do-I-import-quizzes-from-QTI-packages/ta-p/1046), modified 2026-08-20).

**P13. Classic QTI import always creates a quiz, and bank names behave as follows:**
- qtiConverter: "With the classic quizzes Canvas import process will also make an actual quiz containing all of the questions in the bank."
- Re-importing creates banks with the same name ([docs/importing.md](https://github.com/backyardbiomech/qtiConverter/blob/9659aab19469ea7bcb36cb0fc4c8f1c995ff315f/docs/importing.md)).
- The bank defaults to the quiz name (community reply by kroeninm in [thread 639509](https://community.canvaslms.com/t5/New-Quizzes-Discussion/Import-QTI-file-to-new-Item-Bank-doesn-t-work/td-p/639509)). Canvas's fallback title is "Imported Questions" (`default_imported_title`, assessment_question_bank.rb L67-68).
- gpoore's workaround is to import, pick a bank, then delete the quiz ([#40](https://github.com/gpoore/text2qti/issues/40), [#5](https://github.com/gpoore/text2qti/issues/5)).
- Bank-only import exists in Canvas code: the Respondus endpoint sets `migration.migration_ids_to_import = { copy: { all_quizzes: false, all_assessment_question_banks: true } }` (urn_RespondusAPIServant.rb L586-589).
- The REST API documents `settings[question_bank_id]`, `settings[question_bank_name]` and `selective_import` ([content_migrations_controller.rb L311-317, L367-376](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/content_migrations_controller.rb)). Using selective import to do bank-only via REST for `qti_converter` is UNCONFIRMED.

**P14. New Quizzes item-bank import is fragile:**
- `rcardinality="Single"` or `"Multiple"` is mandatory on `response_lid` ([JoshuaStomel, 2024-07-01](https://community.instructure.com/en/discussion/607765/new-quizzes-qti-import-not-working-try-this)). text2qti and Canvas emit it; Canvas's matching and dropdown exporter does not set it (effect UNCONFIRMED).
- Import Content works only on an empty bank, and the new bank takes the QTI file's title ([guide 966](https://community.instructure.com/t5/Instructor-Guide/How-do-I-import-questions-from-a-QTI-package-into-an-item-bank/ta-p/966), modified 2026-09-11; [thread 599316](https://community.canvaslms.com/t5/New-Quizzes-Discussion/New-Item-banks-and-MULTIPLE-QTI-packages/m-p/599316)).
- Importing a Canvas classic export into an item bank fails with "Error: there was a problem uploading your file" (2025-04-09, still reported June 2026, [thread 639509](https://community.canvaslms.com/t5/New-Quizzes-Discussion/Import-QTI-file-to-new-Item-Bank-doesn-t-work/td-p/639509)).
- With "Convert to New Quizzes" you cannot choose a default question bank, and "multiple dropdown questions display as matching questions" (guide 1046).
- Text regions do not appear in New Quizzes ([#72](https://github.com/gpoore/text2qti/issues/72)).
- Imports with question groups reported success but failed (Dec 2021) ([#46](https://github.com/gpoore/text2qti/issues/46)). The same comments note only one Import Content is allowed per quiz.

**P15. Use QTI 1.2, not 2.1.**
- [canvas-lms#2605](https://github.com/instructure/canvas-lms/issues/2605): "TextEntryInteraction Is Incorrectly Treated as Essay ... breaks numeric input questions".

**P16. `assessment_meta.xml` is optional, but if present its identifiers must match.**
- Canvas reads the manifest only to "bring in canvas metadata if available" (converter.rb L67-71).
- qtiConverter omits the file and its manifest has no dependency.
- A wrong `assignment_identifier`/`assessment_identifier` pairing makes Canvas ignore the description, titles and options ([#18](https://github.com/gpoore/text2qti/issues/18), [#19](https://github.com/gpoore/text2qti/issues/19); fixed in text2qti v0.5.0).

**P17. Scoring and display quirks:**
- Canvas multiple answers always gives partial credit. The XML must still look all-or-nothing (`<and>` with `<not>`) for the answers to be recognized (R/exams Rd technical note).
- Each multiple-answers item needs at least one correct and one wrong choice (R/exams NEWS 2.4-0).
- `points_possible` defaults to 1 if missing (assessment_item_converter.rb L167).
- The item `title` becomes the question name (L89). Instructors see it in the editor and bank; students see "Question N" (text2qti README).

**P18. Testing environment.**
- Instructure's Free-for-Teacher closes (community banner: "Access closes for good at 11:59 p.m. MT on October 6"). Test in a sandbox course on the school's own Canvas.
- Packages can be validated offline with QTIMigrationTool: `./migrate.py --ucvars --nogui --overwrite --cpout=out/ in/` (Python 3 + lxml, [example_run.sh](https://github.com/instructure/QTIMigrationTool/blob/aab28af7a05142140c6fd2f45ed67a4c925a7d1b/example_run.sh)). This is the command Canvas runs ([QTIMigrationTool#3](https://github.com/instructure/QTIMigrationTool/issues/3)).

## 8. UNCONFIRMED (not tested by anyone I found)

- Whether a QTI .zip containing only an `<objectbank>` creates a bank without a quiz.
- Why `$IMS-CC-FILEBASE$` image references resolve despite the importer's `[A-Z_]` regex.
- Whether the "QTI file title" used for a New Quizzes bank name is the zip file name or `assessment@title`.
- Whether escaped MathML renders after Classic → New Quizzes migration on the school's instance.
- Whether Vietnamese or other non-ASCII image file names inside the zip import correctly.
- Whether REST selective import can import into banks only (no quiz) for `migration_type=qti_converter`.

## Local working copies

All under `C:\Users\ADMINI~1\AppData\Local\Temp\claude\C--Users-Administrator-Downloads-PM-chamthidua\dc508171-525f-4c6b-95a3-99cccd19d826\scratchpad\`:

- `text2qti\`, `substance9-text2qti\`, `moodle2cc\`, `exams\`, `QTIMigrationTool\`, `qti-package-maker\`
- `repos\backyardbiomech_qtiConverter\`
- `canvas\` (selected canvas-lms files)
- `pr76_xml_assessment.py`, `canvas_sanitize.rb`, `mathml.js`, `respondus.rb`, `cmc.rb`