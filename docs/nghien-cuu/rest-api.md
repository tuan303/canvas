# Pushing a QTI zip into a Canvas question bank through the REST API

Research date: 2026-10-02. Source citations point to the public canvas-lms mirror at master `1c9f0bb` (last pushed 2026-04-30). Instructure-hosted Canvas may have changed since then. Where it matters, I checked the live behaviour with unauthenticated probes against `canvas.instructure.com` and inst-fs on 2026-10-02.

Permalink base used below: `GH = https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c`

## 0. Conclusions

1. **The import path is the Content Migrations API with `migration_type=qti_converter`.** It runs three steps: create the migration, upload the zip, then poll. Canvas has no REST endpoint that creates a question bank or adds questions straight into one (§2, §3). The bank is created as a side effect of the import, through `settings[question_bank_id]` or `settings[question_bank_name]`.
2. **The browser cannot call the Canvas REST API directly, so a server-side proxy is required.** This is confirmed by source and by a live probe. The zip bytes themselves can skip the proxy: the browser can POST straight to the inst-fs `upload_url`, which allows any origin (live probe). That keeps uploads clear of Vercel's 4.5 MB function body limit.
3. **Use OAuth2 with a school-created Developer Key for production.** Instructure's own docs say an app used by many people must use OAuth. A personal access token pasted into the tool is acceptable only for a single-teacher pilot.
4. **A new endpoint, `GET /api/v1/question_banks?context_type=Course&context_id=…`, lists a course's banks with a bearer token.** It was added in January 2026 and is live: it returns 401, not 404, on hosted Canvas.

---

## 1. Content Migrations API (`qti_converter`)

### 1.1 Routes
These exist for the `account`, `course`, `group` and `user` contexts (`GH/config/routes.rb#L1605-L1622`):
```
GET  /api/v1/courses/:course_id/content_migrations/migrators
POST /api/v1/courses/:course_id/content_migrations
GET  /api/v1/courses/:course_id/content_migrations
GET  /api/v1/courses/:course_id/content_migrations/:id
PUT  /api/v1/courses/:course_id/content_migrations/:id
GET  /api/v1/courses/:course_id/content_migrations/:id/selective_data
GET  /api/v1/courses/:course_id/content_migrations/:content_migration_id/migration_issues[/:id]
GET  /api/v1/progress/:id
```

The QTI plugin is registered as `:qti_converter` with these settings (`GH/gems/plugins/qti_exporter/lib/qti_exporter/engine.rb`):
- `worker: "QtiWorker"`
- `requires_file_upload: true`
- `valid_contexts: %w[Account Course]`
- `enabled: python_converter_found`

The tool should first call `GET …/content_migrations/migrators` and check that `type: "qti_converter"` is in the list (`GH/app/controllers/content_migrations_controller.rb`, `available_migrators`).

### 1.2 Create: parameters, verbatim from the `@argument` docs
Source: `GH/app/controllers/content_migrations_controller.rb#L249-L401`. Official docs: https://canvas.instructure.com/doc/api/content_migrations.html

| Param | Notes |
|---|---|
| `migration_type` (Required) | `qti_converter` |
| `pre_attachment[name]` | "Required if uploading a file." Any UTF-8 file name is allowed. |
| `pre_attachment[size]` | Size in bytes. Recommended because it triggers the quota check: the controller calls `api_attachment_preflight(..., check_quota: true)` (L662-664). If over quota, `pre_attachment` is `{"error":true,"message":"file size exceeds quota"}` and the migration becomes `failed`. |
| `pre_attachment[content_type]` | Use `application/zip`. If omitted, it is guessed from the extension. |
| `settings[file_url]` | "A URL to download the file from. Must not require authentication." `QtiWorker` supports it: `elsif settings[:file_url]` → `Canvas::Migration::Worker.download_attachment` (`GH/gems/plugins/qti_exporter/lib/canvas/migration/worker/qti_worker.rb`). |
| `settings[question_bank_id]` | "The existing question bank ID to import questions into if not specified in the content package." |
| `settings[question_bank_name]` | "...if both bank id and name are set, id will take precedence." |
| `settings[overwrite_quizzes]` | "Whether to overwrite quizzes with the same identifiers between content packages." This also controls whether questions are updated or duplicated (§1.4). |
| `settings[import_quizzes_next]` | **Not in the API docs.** The new import UI sends it (`data.settings.import_quizzes_next = importAsNewQuizzes`, `GH/ui/shared/content-migrations/react/CommonMigratorControls/CommonMigratorControls.tsx#L200`). The model reads it through `Canvas::Plugin.value_to_boolean(migration_settings[:import_quizzes_next])`, and it only takes effect if the course has the `quizzes_next` feature (`GH/app/models/content_migration.rb#L712-L720`). The UI disables the question-bank selector when it is on (`setIsQuestionBankDisabled(target.checked)`). |
| `selective_import` | Has no practical effect for QTI (§1.7). |

Every `settings[*]` key is copied into `migration_settings` unchanged (`update_migration_settings`, `content_migration.rb#L147`). The API also accepts JSON bodies with `Content-Type: application/json` (https://canvas.instructure.com/doc/api/index.html).

### 1.3 How the target bank is chosen
Source: `GH/app/models/importers/assessment_question_importer.rb#L41-L110` and `assessment_question_bank_importer.rb`.

1. **The package's own bank wins.** This is item metadata `question_bank` / `question_bank_iden` (`qti/assessment_item_converter.rb#L173-L177`). In QTI 1.2, items inside `<objectbank ident="X">` get `question_bank_iden = X` and the bank name (`QTIMigrationTool lib/imsqtiv1.py#L610-L677`, https://github.com/instructure/QTIMigrationTool).
2. **Otherwise `settings[question_bank_id]`.** It is looked up with `migration.context.assessment_question_banks.where(id: …)`, so it must be a bank in the same course. Account banks do not work here.
3. **Otherwise `settings[question_bank_name]`.** The bank `migration_id` is `CC::CCHelper.create_key(title, "assessment_question_bank")`, which is `"i" + MD5("assessment_question_bank" + title)` (`GH/lib/cc/cc_helper.rb#L119-L129`).
   - An existing bank is reused only if its `migration_id` matches, meaning an earlier import created it.
   - A bank created in the UI has a nil `migration_id`, so the same name produces a second bank with the same title.
4. **Otherwise** the bank is called `"Imported Questions"` (`AssessmentQuestionBank.default_imported_title`).

### 1.4 Re-import behaviour and a string-boolean gotcha
- `set_default_settings` sets `overwrite_quizzes = false` for `qti_converter` unless the key is present (`content_migration.rb#L496-L509`). `check_quiz_id_prepender` then sets `id_prepender = migration.id` (L528-533).
- **With `overwrite_quizzes` false:**
  - Every question or bank `migration_id` that already exists in the course is prefixed `"<migrationId>_"` (`GH/app/models/importers/content_importer_helper.rb`).
  - Re-importing therefore creates duplicate questions and a duplicate bank with the same title.
- **With `overwrite_quizzes` true:**
  - No prefix is added.
  - Questions are matched across the whole course by `migration_id`, which is the item ident.
  - Matched questions are updated in place and moved into the target bank: `update_all(... assessment_question_bank_id: bank.id)` (`assessment_question_importer.rb#L150-L157`).
- **Gotcha (inferred from reading the source):** `add_assessment_id_prepend` tests the raw value with `!migration.migration_settings[:overwrite_quizzes]`. A form-encoded `"false"` is a non-empty string and is truthy in Ruby, so it behaves like true. Either send a JSON boolean or leave the key out.

### 1.5 Upload flow and confirm step
Docs: `GH/doc/api/file_uploads.md` (https://canvas.instructure.com/doc/api/file.file_uploads.html).

**Step 1: create the migration.**
```
POST https://<canvas>/api/v1/courses/123/content_migrations
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json+canvas-string-ids
{"migration_type":"qti_converter",
 "pre_attachment":{"name":"toan_hsa2025_bank.zip","size":834512,"content_type":"application/zip"},
 "settings":{"question_bank_name":"HSA2025 – Toán","overwrite_quizzes":true}}
```

Response shape, built from `GH/lib/api/v1/content_migration.rb` and `GH/lib/inst_fs.rb#L122-L171`. This is not a captured response.
```json
{"id":"456","user_id":"78","workflow_state":"pre_processing","started_at":null,"finished_at":null,
 "migration_type":"qti_converter","created_at":"…",
 "migration_issues_url":"https://<canvas>/api/v1/courses/123/content_migrations/456/migration_issues",
 "migration_issues_count":0,
 "pre_attachment":{"file_param":"file","progress":null,
   "upload_url":"https://inst-fs-<region>-prod.inscloudgate.net/files?token=<JWT>",
   "upload_params":{"filename":"toan_hsa2025_bank.zip","content_type":"application/zip"}},
 "progress_url":"https://<canvas>/api/v1/progress/789","migration_type_title":"QTI"}
```

**Step 2: upload the bytes.** POST multipart/form-data to `upload_url`.
- Include every `upload_params` field unchanged, then put `file` last.
- Do not send the Canvas token.
- Treat `upload_params` as opaque and signed.
- inst-fs also needs the filename on the file part, e.g. `FormData.append('file', blob, name)`.
  - Community thread: https://community.canvaslms.com/t5/Developers-Group/Error-500-when-uploading-a-file-via-API/m-p/184834
- The inst-fs upload JWT expires after `LONG_JWT_EXPIRATION = 10.minutes` (`GH/lib/inst_fs.rb#L21`, `upload_jwt`).
- If the S3 path is used instead, its signature is valid for 30 minutes (per the docs).

**Step 3: confirm.**
- **inst-fs (Instructure-hosted Canvas):** inst-fs answers `201 Created` and calls Canvas `POST /api/v1/files/capture` server-to-server. `api_capture` then calls `@context.file_upload_success_callback(@attachment)`, which sets `pre_processed` and calls `queue_migration` (`GH/app/controllers/files_controller.rb`, `api_capture`; `content_migration.rb#L377-L388`). No confirm call is needed.
- **S3 or local storage (self-hosted):** the response is a 3xx. GET the `Location` (`/api/v1/files/:id/create_success?uuid=…`) with the Bearer token. That triggers the same callback (`files_controller.rb`, `api_create_success`).
- **Timeout:** if the upload never arrives, the migration fails after `UPLOAD_TIMEOUT = 1.hour` in `pre_processing` (`content_migration.rb#L1237-L1241`).

**Alternative: `settings[file_url]`.** There is no `pre_attachment` and no upload step; the job is queued immediately. The URL must be publicly fetchable without auth, for example a temporary unguessable Vercel Blob URL that you delete after the import completes.

### 1.6 Polling
- **Migration states.** `GET /api/v1/courses/:cid/content_migrations/:id` returns these mapped API states (`GH/lib/api/v1/content_migration.rb#L32-L45`):

  | Internal state | API state |
  |---|---|
  | `created` | `pre_processing` |
  | `pre_process_error` | `failed` |
  | `exporting`, `importing`, `exported` | `running` |
  | `imported` | `completed` |

  **The raw state `queued` is not mapped and not in the documented enum.** The tool must handle it.
- **One migration per course at a time.** `blocked_by_current_migration?` puts a new migration into `queued` while another migration in the same course is active. It is started when the running one finishes. After more than 5 retries it fails with "Blocked by running migration" (`content_migration.rb#L460-L480`, `L1403-L1406`). The tool should send imports to a given course one at a time.
- **Progress object.** `GET /api/v1/progress/:id` returns `workflow_state` (`queued|running|completed|failed`), `completion` (0–100) and `message` (`GH/app/controllers/progress_controller.rb`).
  - Reading it needs ContentMigration `:read`, which requires one of the Course Files add/edit/delete permissions (`content_migration.rb#L78-L82`).
  - If the user lacks file permissions, fall back to polling the migration itself.
- **Issues.** `GET …/migration_issues` returns `{id, description, workflow_state: active|resolved, issue_type: todo|warning|error, fix_issue_html_url, error_message*, error_report_html_url*, created_at, updated_at}`. The starred fields appear only for admins (`GH/app/controllers/migration_issues_controller.rb`). For a question warning, `fix_issue_html_url` looks like `/courses/:id/question_banks/:bank_id#question_<aqid>_question_text`.
- **Polling advice:** use one request at a time, every 2–3 seconds.

### 1.7 Selective import does not help for QTI
`QtiWorker` always merges `{copy:{everything:true}}` and calls `cm.import_content_without_send_later` right after conversion. It never checks `import_immediately?`. `CCWorker` does check it (`GH/lib/cc/importer/cc_worker.rb#L76`). So for `qti_converter`, `selective_import=true` does not pause in `waiting_for_select`.

If the package contains an `<assessment>`, a Classic quiz is created as well. To get a bank-only import, the package should contain only an `<objectbank>` or bare items. This is a strong inference from `Qti.convert_assessments` and QTIMigrationTool, but **UNCONFIRMED** until we run a test import.

### 1.8 Account-level banks (optional path)
- **How:** `POST /api/v1/accounts/:account_id/content_migrations` with `qti_converter`, which is valid because `valid_contexts` includes `Account`.
- **What it imports:** `Importers::AccountContentImporter` imports only `AssessmentQuestionImporter` and `LearningOutcomeImporter`, so it never creates a quiz (`GH/app/models/importers/account_content_importer.rb`).
- **Who can run it:** it needs `manage_course_content_add` on the account, which means an account admin.
- **Images:** whether embedded images resolve correctly in account banks is **UNCONFIRMED**.

### 1.9 Content limits
- **Question text size:** text over 16 KB is replaced by "The imported question text for this question was too long." and a warning is logged (`assessment_question_importer.rb#L201-L205`). MathML is verbose, so the tool should measure each question and warn before export.
- **Job expiry:** queued jobs expire after `content_migration_job_expiration_hours` (default 48).
- **Quota:** the upload counts against the course file quota.

---

## 2. Listing existing question banks

**Documented endpoint (new):** `GET /api/v1/question_banks?context_type=Course&context_id=<id>[&include_question_count=true]`
- Also available: `GET /api/v1/question_banks/:id` and `GET /api/v1/question_banks/:id/questions`.
- Routes: `GH/config/routes.rb#L2504-L2508`. Controller: `GH/app/controllers/assessment_question_banks_controller.rb#L252`. Docs: https://canvas.instructure.com/doc/api/assessment_question_banks.html
- Added in commit `e569b9e` "Add question banks API endpoints" (2026-01): https://github.com/instructure/canvas-lms/commit/e569b9ea38d36337a7b274b61d381da758d96c15
- **Live check (2026-10-02):** `GET https://canvas.instructure.com/api/v1/question_banks?context_type=Course&context_id=1` returned `401 {"status":"unauthenticated"…}`. An unknown `/api/v1/` path returns 404, so the route exists.
- Requires `:read_question_banks` on the context.
- Fields: `id, context_id, context_type, title, workflow_state, created_at, updated_at, context_code` and optionally `assessment_question_count`. The `migration_id` is not exposed.
- The docs say "paginated", **but `index` renders every active bank without `Api.paginate`.**
- Scopes: `url:GET|/api/v1/question_banks`, `url:GET|/api/v1/question_banks/:id`, `url:GET|/api/v1/question_banks/:id/questions`.

**Legacy route `/courses/:id/question_banks.json` is not usable with a token.** It does render JSON (`QuestionBanksController#index`, `format.json`). But `load_pseudonym_from_access_token` returns early unless `api_request?`, and that is true only when the path matches `%r{\A/api/}` (`GH/lib/authentication_methods.rb#L144-L148`, `GH/app/controllers/application_controller.rb#L2356`). A bearer token on this path is ignored.

**There is no API to create, rename or delete a bank.** Those actions exist only on non-API routes.

---

## 3. Quiz Questions API (Classic): cannot target a bank

- `POST /api/v1/courses/:course_id/quizzes/:quiz_id/questions` only creates questions inside a quiz (`GH/app/controllers/quizzes/quiz_questions_controller.rb#L264-L322`).
- The `existing_questions` + `assessment_question_bank_id` parameters only copy from a bank into a quiz.
- **Side effect:** `QuizQuestion#create_assessment_question` builds an `AssessmentQuestion` with `initial_context = course`. That puts the question into the course's "Unfiled Questions" bank (`AssessmentQuestionBank.unfiled_for_context`; `GH/app/models/quizzes/quiz_question.rb#L203`, `GH/app/models/assessment_question.rb#L100`).
  - Moving questions between banks (`move_questions`) is a non-API route.
  - Each field is capped at 16 KB (`RawFields max_size 16.kilobytes`).
  - Images must already be Canvas file URLs.
- **New Quizzes:** the documented API is per-quiz items only (`/api/quiz/v1/courses/:course_id/quizzes/:assignment_id/items`). No item-bank endpoint is documented: https://canvas.instructure.com/doc/api/new_quiz_items.html
- **Verdict:** this route is not viable for building banks.

---

## 4. CORS: a server-side proxy is required

**Source evidence:**
- canvas-lms has no CORS middleware: no rack-cors in `Gemfile.d`, and no `Access-Control-*` headers in `ApplicationController`.
- Only `FilesController` sets them:
  - `before_action :open_cors, only: %i[api_create api_create_success api_create_success_cors show_thumbnail]`
  - `open_limited_cors` for `show`
  - Source: `GH/app/controllers/files_controller.rb#L177-L180`, `L1812-L1824`

**Live probes from origin `https://example.vercel.app`, 2026-10-02:**

| Request | Result |
|---|---|
| `OPTIONS https://canvas.instructure.com/api/v1/courses/1/content_migrations` | `404`, no ACAO, so the preflight fails |
| `GET /api/v1/users/self` | `401`, no ACAO |
| `OPTIONS /api/v1/files/1/create_success` | `200`, `access-control-allow-origin: https://example.vercel.app` |
| `OPTIONS https://inst-fs-{iad,sin,syd}-prod.inscloudgate.net/files?token=x` | `204`, origin reflected, `Allow-Methods GET,HEAD,PUT,PATCH,POST,DELETE`, `Allow-Headers content-type`, `Allow-Credentials true` |
| `POST` multipart to inst-fs with an invalid token | `401`, origin reflected |

**Community evidence:** https://community.instructure.com/t5/Canvas-Developers-Group/Javascript-API-Development-CORS-issue/td-p/571686 (2023). The browser reported "No 'Access-Control-Allow-Origin' header is present…", and the accepted answer was to write a CORS proxy.

**Recommended architecture (Vercel):**
- **Serverless functions (proxy):**
  - `/api/canvas/login` and `/api/canvas/callback` handle OAuth; the `client_secret` stays server-side.
  - `/api/canvas/*` is an allowlisted proxy to a fixed `CANVAS_BASE_URL` taken from an env var, never a user-supplied host, to avoid SSRF.
  - Tokens are stored encrypted in an httpOnly cookie.
- **Browser:** the browser sends the zip directly to `pre_attachment.upload_url` when it is on inst-fs. This avoids Vercel's 4.5 MB function body limit (https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE).
  - If the 201 response cannot be read, it does not matter: the capture callback queues the migration anyway. Poll through the proxy.
- **Fallback when `upload_url` is not inst-fs** (self-hosted, S3 or local storage): stream the upload through the proxy (≤ 4.5 MB on Vercel), or use `settings[file_url]` with a temporary public Blob.
- **Not recommended:** custom JavaScript injected through the Theme Editor runs on the Canvas origin and can use session cookies plus `X-CSRF-Token`. It is admin-only and affects the whole institution.

---

## 5. Authentication

**(a) Personal access token**
- **Where:** Account → Settings → Approved Integrations → "+ New Access Token", with Purpose and Expires fields (https://community.canvaslms.com/docs/DOC-16041).
- **Policy:** "asking any other user to manually generate a token and enter it into your application is a violation of Canvas' API Policy. Applications in use by multiple users MUST use OAuth" (`GH/doc/api/oauth.md` "Manual Token Generation").
- **Admins can block it.** There is a feature option "Admin Manage Access Tokens", an account setting "Limit personal access token creation to admins", and a permission "Users – Manage Access Tokens". From the 2024-09-21 release notes:
  - https://community.canvaslms.com/t5/Canvas-Releases/Canvas-Release-Notes-2024-09-21/ta-p/612521
  - In source: `add_setting :limit_personal_access_tokens` and `:restrict_personal_access_tokens_from_students` (`GH/app/models/account.rb#L430-L431`), enforced in the `AccessToken` policy (`GH/app/models/access_token.rb#L85-L108`).
- **Expiry cap:** Ohio State IT reports (Aug 2026) that Instructure now requires token expiry of at most 90 days and has expired all existing tokens (https://it.osu.edu/news/2026/08/11/carmencanvas-personal-access-tokens). **UNCONFIRMED in source.**

**(b) Developer Key (API Key) with OAuth2**
- **What the admin creates:** Admin → [root account] → Developer Keys → "+ Developer Key" → "API Key" (https://community.canvaslms.com/docs/DOC-4675). Fields:
  - Key Name, Owner Email
  - Redirect URIs, e.g. `https://<app>.vercel.app/api/canvas/callback`. The domain must match, or be a subdomain of, the stored redirect URI.
  - "Enforce Scopes" ON, with the scopes below selected.
  - Save, then switch **State to ON**; the default is OFF (https://community.canvaslms.com/t5/Admin-Guide/How-do-I-enable-scoping-for-a-developer-API-key-in-an-account/ta-p/181).
  - Hand over the Client ID (the key ID) and the Client Secret ("Show Key").
- **Flow** (`GH/doc/api/oauth_endpoints.md`):
  - `GET /login/oauth2/auth?client_id=…&response_type=code&redirect_uri=…&state=…&scope=<space-separated>`. Pass `scope` once, with values space-separated; repeating the parameter keeps only the last value.
  - `POST /login/oauth2/token` with `grant_type=authorization_code, client_id, client_secret, redirect_uri, code` returns `{access_token, token_type:"Bearer", user:{id,name}, refresh_token, expires_in:3600}`.
  - Refresh with `grant_type=refresh_token`; no new refresh token is returned.
  - Log out with `DELETE /login/oauth2/token`.
- **`client_credentials`:** the docs allow "only IMS defined scopes". The source has a `service_user_client_credentials` flow (`GH/app/models/developer_key.rb#L484-L490`), but nothing documented lets a school admin configure it. **UNCONFIRMED; do not rely on it.**
- **Minimum scopes** (exact strings, taken from the live docs pages):
  ```
  url:GET|/api/v1/users/:id
  url:GET|/api/v1/courses
  url:GET|/api/v1/courses/:course_id/permissions
  url:GET|/api/v1/question_banks
  url:GET|/api/v1/question_banks/:id
  url:GET|/api/v1/question_banks/:id/questions
  url:GET|/api/v1/courses/:course_id/content_migrations/migrators
  url:POST|/api/v1/courses/:course_id/content_migrations
  url:GET|/api/v1/courses/:course_id/content_migrations
  url:GET|/api/v1/courses/:course_id/content_migrations/:id
  url:PUT|/api/v1/courses/:course_id/content_migrations/:id
  url:GET|/api/v1/courses/:course_id/content_migrations/:content_migration_id/migration_issues
  url:GET|/api/v1/progress/:id
  ```
  - Optional, for account banks: the same set with `accounts/:account_id/…`.
  - The confirm GET on the S3 path (`/api/v1/files/:id/create_success`) has no documented scope, so it may fail under enforced scopes. **UNCONFIRMED; not needed for inst-fs.**

**(c) Permissions the teacher needs.** Scopes restrict which endpoints a token can call; they never add permissions. The user's own role still applies.

| Action | Required permission |
|---|---|
| Create a migration | `manage_course_content_add` ("Course Content – add") |
| Update a migration | `manage_course_content_edit` |
| Show, list, migrators, issues | any of the three Course Content permissions |
| Progress | any Course Files add/edit/delete permission |
| List banks | `read_question_banks` ("Question banks – view and link") |

- All of these default to true for Teacher, TA, Designer and AccountAdmin (`GH/config/initializers/permissions_registry.rb#L969-L999`, `#L1059-L1068`, `#L1706-L1713`).
- Pre-check with `GET /api/v1/courses/:id/permissions?permissions[]=manage_course_content_add&permissions[]=read_question_banks&permissions[]=manage_files_add`.

---

## 6. Throttling and pagination

**Throttling:**
- Every request returns `X-Request-Cost`; `X-Rate-Limit-Remaining` appears when throttling applies (`GH/doc/api/throttling.md`).
- It is a leaky bucket with defaults `maximum: 800, hwm: 600, outflow: 10, up_front_cost: 50` (`GH/app/middleware/request_throttle.rb#L365-L368`). Live, unauthenticated: `x-rate-limit-remaining: 700.0`.
- **The throttled response defaults to 403**, not the 429 the docs mention: `status_code = 403; 429 if Setting "request_throttle.send_429_response"`, with body `"403 Forbidden (Rate Limit Exceeded)"` (L298-304). Handle both codes with backoff.
- Each OAuth token has its own quota, so keep requests sequential.

**Pagination:**
- Default page size is 10. `per_page` has an "unspecified limit"; 100 is common but undocumented (`GH/doc/api/pagination.md`).
- Follow the `Link` header (`rel` = current, next, prev, first, last), treat the links as opaque, and parse the header name case-insensitively.

**Listing courses:**
```
GET /api/v1/courses?enrollment_type=teacher&state[]=available&state[]=unpublished&include[]=term&per_page=100
```
- `enrollment_type` is one of teacher, student, ta, observer, designer, and is ignored if `enrollment_role` is given.
- By default, `state[]` returns anything except deleted for non-students (`courses_controller.rb`, "List your courses").
- Add `enrollment_type=designer` or `ta` if needed.
- Send `Accept: application/json+canvas-string-ids` to get string IDs.

---

## 7. What the school's Canvas admin or teacher must provide

1. **Canvas base URL** in the exact form people log in with, e.g. `https://<school>.instructure.com` or a custom domain.
   - Optionally the test environment `https://<school>.test.instructure.com`, refreshed monthly, or beta `…beta.instructure.com`, refreshed weekly, for trial runs (https://community.canvaslms.com/docs/DOC-14786-what-is-the-canvas-beta-environment).
   - Developer keys belong to the root account.
2. **Production:** a Developer Key (API Key) as described in §5(b):
   - Redirect URI = our Vercel callback.
   - Enforce Scopes ON with the scope list above.
   - State ON.
   - Client ID, plus the Client Secret sent over a secure channel.
3. **Pilot only:** one teacher's personal access token with an expiry date. Also confirm whether "Limit personal access token creation to admins" is turned on.
4. **Course IDs** are not needed up front, because the tool lists the teacher's courses. The ID is the number in `/courses/<id>`; `sis_course_id:<SIS>` also works (`GH/doc/api/object_ids.md`).
5. **Account ID**, only for account-level banks: the number in `/accounts/<id>`, or `self` for the root account.
6. **Quiz engine:** is New Quizzes (`quizzes_next`, "New Quizzes by default") turned on? Classic question banks only matter for Classic Quizzes. New Quizzes item banks have no documented API.
7. **Role confirmation:** the teacher role keeps Course Content – add, Course Files – add, and Question banks – view and link.
8. **A sandbox course and a test teacher account** for end-to-end validation.

---

## 8. UNCONFIRMED items

- The 90-day maximum for personal access tokens. Only the OSU report says so; the public source mirror stops at 2026-04-30.
- Whether inst-fs returns ACAO on the success (201) response. I only probed the preflight and the 401.
- Whether an `<objectbank>`-only QTI package creates no quiz. Inferred from source; needs a test import.
- Whether images resolve correctly in account-level QTI imports.
- The `per_page` maximum.
- Whether the `create_success` confirm call works with enforced scopes. This only matters on non-inst-fs installs.
- Whether hosted Canvas still matches the public mirror after April 2026. The live probes confirm the `question_banks` route and the CORS behaviour.
- New Quizzes item-bank import automation. No public API is documented.

Scratch copies of the downloaded source files are in `C:\Users\ADMINI~1\AppData\Local\Temp\claude\C--Users-Administrator-Downloads-PM-chamthidua\dc508171-525f-4c6b-95a3-99cccd19d826\scratchpad\canvas\`.