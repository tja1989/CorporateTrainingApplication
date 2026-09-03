# LuLu Learn — AI-Native Corporate Training Platform

## Feature Requirements & Design Specification (MVP v1.4)

**Client:** LuLu Group International — HR
**Prepared:** September 2026
**Audience of this document:** the engineering agent (Claude Opus) that will build the MVP, and LuLu HR stakeholders reviewing scope.
**Status:** Ready to build. Sections marked `[DISCOVERY]` are questions for the client, not blockers — the MVP ships with the stated defaults.
**Revision:** v1.5 (Sep 2026) — the course outline: modules render as a collapsible accordion on the course page and as a course-contents navigator on every lesson page, with drawn per-type lesson icons, derived durations and lock states. FR-2.7 added, §11.4/§11.5 rewritten.
**Previous:** v1.4 (Sep 2026) — voice round 2: INTERVIEW lessons (admin-configured oral checks with pass/fail and optional completion gating), a course-aware assistant with learner context and non-blocking tool calls, and a demo script. FR-14.2/14.3 rewritten, FR-6.10a amended.
**Previous:** v1.3 — live voice on the Gemini Live API (§7.12, FR-14): an oral check after a lesson and a live mode for the HR assistant, both on one-use constrained ephemeral tokens with tool-only grounding, per-session consent, transcript-only retention and cost logging; the offline demo mode covers both without a key.
**Earlier:** v1.2 — design language tightened to six enforced rules: a 7-step spacing scale, the bento tile rule, three elevation levels with no glass, 4/8/12/pill radii, 150/250/400ms motion tokens with two easings, and one variable sans at weights 400/500 on a five-size scale. The serif "AI voice" is replaced by the AI surface (tint + label). Enforced by the closed Tailwind theme in `app/globals.css` and `tests/design-guardrails.test.ts`.
**Earlier:** v1.1 — revised after a three-lens adversarial review (buildability / HR-stakeholder & legal / design). All LuLu-specific figures are sourced or tagged `[ASSUMPTION]`.

---

## How to use this document (instructions to the builder)

1. This is the authoritative spec. Build in the milestone order of §14; each milestone has acceptance criteria.
2. Requirements are numbered (`FR-x.y`). Anything marked **MVP** is in scope for the first build. **Fast-follow** items must be *designed for* (schema, interfaces) but not built. **Deferred** items must not be built and must not leak complexity into the MVP. §3 also names **cut-first** items — build them last, drop them first if time presses; never cut a differentiator to save a cut-first item.
3. Where the spec pins a concrete value (model ID, motion timing, chunk size, status enum), use that value. Where it is silent, prefer the simplest implementation consistent with §10 (design language) and §12 (architecture).
4. Every AI feature must degrade gracefully when `ANTHROPIC_API_KEY` or other provider keys are absent (clear "AI unavailable" states, never crashes). Seed data (§13) must make the whole product demoable without any external account except a YouTube embed.

---

## 1. Vision

**One line:** A mobile-first, AI-native learning platform for LuLu's retail workforce where every piece of content can be *talked to*, every lesson is assessed, and every employee has a trustworthy HR assistant in their pocket.

**What "AI-native" means here (and what it does not).** The 2026 market leaders (Sana/Workday Learning, Docebo, Absorb Aura, Uplimit) converge on a definition: the platform is built around retrieval, generation, and agents from day one — *not* a chatbot bolted onto an LMS. Analyst consensus (Josh Bersin, 2026) calls the destination "dynamic enablement": content published in days not months, personalized delivery, and grounded AI assistance everywhere. Concretely, the 2026 **table stakes** this MVP must ship:

- Content-to-course generation with a human accept-gate (never auto-publish).
- A learner-facing AI tutor **grounded in the current course content, with citations** — in this MVP, citations deep-link to video timestamps.
- AI quiz generation from content, landing as drafts for review.
- AI assistance for admins (natural-language, read-only report queries).

And the chosen **differentiators** for LuLu (each maps to a weakness of incumbents or a LuLu-specific need):

1. **Reporting that answers questions.** The most-complained-about weakness of Cornerstone/TalentLMS/Docebo is stale, rigid reporting. Every entity in our schema is queryable in real time, and admins can ask reports questions in plain language.
2. **A citation-first Virtual HR Assistant** seeded with the questions Gulf retail workers actually ask (leave, gratuity, overtime, WPS timing), with hard escalation to human HR.
3. **Frontline-first UX**: employee-ID login (no corporate email), mobile-first, 3–5 minute learning units, Arabic RTL-ready.

**What the MVP is not:** a SCORM authoring tool, a skills-inference engine (a $55M-acquisition-sized problem — 365Talents), an agent marketplace (Docebo AgentHub class), or a video host. See §3 for the full defer list.

---

## 2. Steering notes — where this spec adjusts the original brief, and why

The original brief is sound. Six adjustments, each grounded in research, keep it world-class rather than conventional:

| # | Brief said | Spec does | Why |
|---|---|---|---|
| 1 | "Include features of the top training platform" | Includes the **MVP-essential baseline** of Absorb/Docebo/TalentLMS (§5) and explicitly *excludes* their enterprise bloat | Copying Cornerstone wholesale is the documented failure mode: buyers rate it powerful but "cumbersome with a steep learning curve." The winning comp is Absorb: "enterprise features with mid-market simplicity." |
| 2 | "Quizzes and standard testing toolkit" | Full assessment engine (§7.5) **plus** a daily-drill spaced-repetition feed | For a retail frontline workforce, the highest-value assessment surface is not the exam but the Axonify-style 3-minute daily drill (retailers report ~83% weekly engagement). Exams alone don't move retention. |
| 3 | "AI native… chat regarding the content resources… use YouTube videos" | Chat-with-video with timestamp citations (§7.4). **Transcript acquisition is treated as the fragile core**: MVP ships a fully lawful manual-upload path plus a vendor path for demos, isolated behind a swappable provider interface | YouTube blocks cloud-server transcript fetching, and both scraping workarounds (self-hosted proxies, hosted transcript vendors) sit outside YouTube's ToS — acceptable for an internal demo, not for production. The production path is LuLu uploading its own videos to a LuLu-owned channel (unlisted + embeddable), where the official `captions.download` OAuth flow is fully sanctioned. §7.4 encodes all three paths. |
| 4 | "Employers can ask doubt about company HR policy" | An **employee-facing** HR policy assistant (§7.7), strictly informational, citation-first, with human escalation | (Assuming "employers" meant "employees.") Keeping the assistant read-only/informational keeps it out of the high-risk regulatory tier that anything influencing employment decisions falls into, and is what makes HR sponsor it. |
| 5 | "Scope for proctored assessment" | A two-tier **integrity monitoring** design (§7.6): extension-free monitoring in MVP; webcam capture opt-in per assessment, **off by default**. This reframing needs client sign-off — see §16.5 | UAE law is unusually strict: PDPL treats facial images as sensitive data, and Cybercrime Law Art. 44 criminalizes non-consensual image capture (AED 150k–500k fines). Web tech also cannot truly "lock down" a browser without extensions — honest framing is deterrence + human-reviewed flags, not prevention. |
| 6 | "UI reimagined… live and dynamic, latest design language" | A committed **editorial/humanist** design language with a written motion budget and streaming-native AI surfaces (§10–11) | "Latest design language" done wrong is a trend collage (dark neon + glass + bento). The AI-product canon (Claude, Perplexity, Sana) is warm, light-first, restrained — the right read for a multinational workforce on shared and mobile devices. "Live and dynamic" is delivered through motion craft and streaming UX, not decoration. |

**One more steering point the brief didn't raise:** LuLu's workforce context decides success. Lulu Retail Holdings reports ~53,000 employees from 46 nations across 267 stores in 6 GCC countries *(source: Lulu Retail Integrated Annual Report 2024 and FY2025 results coverage — verify against the client's current figures)*; the store workforce is overwhelmingly deskless `[ASSUMPTION: ~85–90%, retail-industry norm — confirm]`; most have smartphones but **no corporate email and no desk**. The platform must therefore be mobile-first, employee-ID-authenticated, and multilingual (§8). A desktop-first, email-SSO design fails on day one.

Two consequences the client must see plainly:

- **Reach:** until a phone-native channel ships (WhatsApp/SMS — fast-follow, §7.8), reminders reach learners only in-app; the *certified* MVP compliance-reach mechanism is therefore **manager-mediated escalation** (FR-3.4, FR-10.1): every overdue item lands in a manager digest with a mandatory nudge action. This is honest and workable for a store workforce with ever-present shift supervisors — but it is a design decision the client should endorse (§16.9).
- **Paid time:** required compliance training is working time under UAE labour law. The platform must not nudge mandatory training off the clock (FR-13.6). Streaks and drills are strictly optional and never count toward required-training status.
- **Legal envelope:** the MVP's legal analysis covers **UAE deployment only**. KSA and the other GCC states have materially different data-protection and labour rules; each country pack (fast-follow) requires its own counsel review and data-residency assessment before rollout (§7.11, §16).

`[DISCOVERY]` Confirm scope entity: LuLu Group International (private conglomerate, ~65k staff, ~22 countries — *source: public group profiles*) vs **Lulu Retail Holdings PLC** (ADX-listed, ~53k staff, 6 GCC countries). This spec defaults to the GCC retail workforce, UAE first.

---

## 3. Scope summary (MoSCoW)

### MVP (must)

- Employee-ID auth with activation codes, 3 roles (Admin / Manager / Learner), org hierarchy + groups
- Courses (Course → Module → Lesson), typed lessons: **YouTube video, rich text, PDF, quiz**
- Learning paths (ordered course lists, complete-in-order flag)
- Auto-enrollment rules with re-evaluation semantics; relative due dates
- Compliance loop: due dates → reminder ladder → certificates with expiry → auto re-assignment; manager-mediated escalation as the reach mechanism
- Video ingestion pipeline (transcript → chunks → embeddings) with a lawful manual-transcript path + AI quiz drafts
- **In-player AI Tutor**: grounded chat with validated `[mm:ss]` citations that seek the player
- Assessment engine: 7 question types, banks, draw-N randomization, settings matrix incl. exam windows and time-multiplier accommodations, practice-vs-exam feedback policies, server-side timing with offline resilience
- AI grading of free-text with rubrics + confidence routing; **AI can auto-finalize passes only — every AI fail is human-reviewed**
- Daily drill (spaced repetition) feed
- Integrity monitoring tier 1 (fullscreen where supported, focus/visibility, paste-block, flag timeline + reviewer UI, consent interstitial)
- Virtual HR Assistant: policy corpus console, citation-first RAG, guardrails, escalation tickets, KPI dashboard
- Manager dashboard, 6 core reports with live filters + CSV export, natural-language report queries
- Notifications (fixed catalog, in-app + email where present), gamification lite (points, badges, weekly streak)
- Platform-wide data protection controls (§7.11): privacy notice, retention schedule, PII minimization, AI cost/audit logging
- English UI shipped; i18n + full RTL/bidi architecture with per-script font stacks; Tutor answers in the user's language; HR assistant answers in evaluated languages (English at launch) with a hedged path for others

### Cut-first (build last, drop first under time pressure — never at the expense of a differentiator)

- Scheduled email delivery of reports; saved report views; XLSX export (CSV stays)
- PWA beyond manifest + cached app shell
- Badges beyond the first four; the celebration animation

### Fast-follow (design for, don't build)

- WhatsApp/SMS delivery channel (the proven Gulf frontline reach channel) — the notification dispatcher is channel-pluggable from day one
- Webcam integrity tier (identity photo + periodic snapshots + consent flow) — schema and consent screens specced in §7.6
- LuLu-owned YouTube channel + official `captions.download` OAuth flow — **launch prerequisite for production video content** (§7.4)
- Arabic/Hindi/Urdu/Malayalam/Tagalog UI string packs; translated content variants; per-language HR-assistant eval passes
- AI role-play with rubric scoring (customer-service scenarios) — the chosen post-MVP differentiator
- SCORM 1.2 playback; store-scoped leaderboards; ILT sessions; Elo-based adaptive difficulty; per-country policy packs (each gated on counsel review)

### Deferred (do not build)

- Skills ontology/inference engines; agent marketplaces; federated enterprise search
- AI video presenters / AI podcasts; e-commerce; multi-portal tenancy; approval workflows
- Custom RBAC role builders; custom notification rule builders; xAPI/cmi5/LRS
- Browser-extension lockdown, live human proctoring, face-matching/biometric verification, eye/gaze tracking (**never build gaze tracking** — EU DPAs advise against it and UAE PDPL risk is severe)
- Native mobile apps (the MVP is a responsive web app with PWA shell)

---

## 4. Personas

Personas are illustrative composites defined by **functional attributes only** (device, language comfort, shift pattern, role) — never by nationality, which in a 46-nation workforce must not be mapped to roles or abilities.

1. **Farhan — Frontline associate** (cashier). Smartphone-only, English-as-second-language, 9-hour shifts. Uses the platform during paid training windows and breaks, in 3–5 minute bursts. Cares about: finishing required training without friction, asking the HR assistant about leave and gratuity in his own words.
2. **Meera — Fresh-food section worker** (bakery). Lower digital literacy; safety-critical training (food hygiene). Needs video-first content, large tap targets, minimal reading.
3. **Joseph — Store department manager.** Shared back-office desktop + personal phone. Assigns training, chases overdue completions via the weekly digest, needs a glanceable team dashboard with nudge actions.
4. **Amina — HQ HR admin.** Owns content, compliance reporting, and the HR policy corpus. Power user: command palette, natural-language report queries, quiz draft review queues.
5. **Saeed — Management trainee** on the national-talent development track (Emiratisation is a board-level KPI for GCC retailers; Lulu Retail reports 15.6% GCC nationals — *source: IAR 2024*). Uses learning paths; paths must serve this program narrative.

---

## 5. Feature baseline from the top platforms (what we adopt vs reject)

Distilled from Absorb, Docebo, TalentLMS, LearnUpon, and Cornerstone (vendor docs + G2/Capterra complaint mining):

**Adopt (MVP):** three-role model with *manager scoping done right* (the load-bearing part — not role count); Course→Module→Lesson with typed blocks; ordered learning paths; profile-driven auto-enrollment that re-evaluates on profile change (Absorb's retrigger semantics are the reference); the full compliance loop (due dates → reminders → expiring certificates → auto re-assignment); manager dashboard of drill-down status tiles; a six-report core with real-time filters and CSV export; a fixed notification catalog; points/badges scoped gamification.

**Reject as enterprise bloat:** multi-portal tenancy, e-commerce, enrollment approval workflows/waitlists, rewards shops/coins/contests, e-signature & 21 CFR Part 11 ceremony, embedded LRS, custom role builders, custom notification builders. (Immutable timestamped completion records — the cheap part of compliance that matters — ARE in scope.)

**Beat them where they're weakest — reporting.** Documented complaints: Cornerstone's reports are stale and non-interactive; TalentLMS has fixed report conditions, unreportable fields, and path-blind custom reports. Our counter: every entity/field queryable in real time (the schema in §9 is designed for it), CSV export, and natural-language queries (§7.9).

---

## 6. Roles, permissions & auth (FR-1)

- **FR-1.1 (MVP)** Roles: `ADMIN` (global), `MANAGER` (scoped), `LEARNER`. A user has exactly one role; managers are also learners for their own assigned training (the UI exposes a workspace switcher, §11.9a).
- **FR-1.2 (MVP)** Manager scope is **explicit assignment only**: `team(M) = {u | u.manager_id = M.id}` (set at import/user-edit; no implicit store-based scoping — unambiguous and covers multi-store and floating managers). Managers can: view team status, assign published courses/paths, send nudges, view team reports. Managers cannot: edit content, see other teams, or see HR-assistant conversation contents (only aggregate metrics; escalated tickets are visible to **admins/HR**, not line managers — see FR-8.7a).
- **FR-1.3 (MVP)** Org model: one hierarchy `Country → Region → Store` **plus** flat `Groups` (job families: cashier, butcher, pharmacist…). Both are targetable by enrollment rules and report filters. Do not model org as a single flat "department" string. Stores carry a `timezone` (default `Asia/Dubai`).
- **FR-1.4 (MVP)** Auth (no email required):
  - Provisioning: admin CSV import (or manual CRUD) creates users in `password_state = INVITED` with a **one-time activation code** (stored hashed, 14-day expiry), distributed by the manager/HR on paper or verbally.
  - First login: employee ID + activation code → forced password set → `ACTIVE`.
  - Password reset: **manager- or admin-mediated** — verifier confirms identity, issues a new one-time code; the action is audit-logged. No self-service email reset for learners (they have none); admins/managers with verified emails may use email reset.
  - Brute-force protection: login throttling (10 attempts / 15 min per employee-ID and per IP), then temporary lockout with audit log. Employee IDs are enumerable — the throttle is the defense.
  - Sessions: secure HTTP-only cookies; **idle timeout** (default 15 min on desktop/shared contexts, 7 days refresh on personal mobile — flagged per login "This is a shared device" checkbox); one-tap **Switch user** on the login screen; re-auth prompt before opening HR-assistant history (§7.7).
  - MFA: TOTP **mandatory for ADMIN**, optional for MANAGER.
  - `[DISCOVERY]` HRIS integration for provisioning — MVP is CSV + manual.
- **FR-1.5 (MVP)** User profile fields: employee ID, name, preferred language, country, region, store, group(s), job title, hire date, manager. Language preference is user-set — never inferred from nationality (PDPL sensitivity).

---

## 7. Functional requirements by module

### 7.1 Courses & content (FR-2)

- **FR-2.1 (MVP)** Structure: `Course → Module → Lesson`. Lesson types: `VIDEO` (YouTube), `TEXT` (rich text), `PDF` (uploaded document, in-app viewer), `QUIZ`. Modules and lessons are ordered; per-course optional **sequential lock** (later modules gated on earlier completion).
- **FR-2.2 (MVP)** Course metadata: title, description, cover image, estimated minutes, language, tags, objectives (used to steer AI quiz generation), status (`DRAFT / PUBLISHED / ARCHIVED`), certificate settings (FR-3.5).
- **FR-2.3 (MVP)** Learning paths: ordered course lists with `complete_in_order` flag. Path enrollment fans out to course enrollments (each carrying `source=path, source_id=path.id`).
- **FR-2.4 (MVP)** Completion is strictly compositional — no cross-lesson coupling:
  - `VIDEO` completes at watched coverage ≥ 90% (§7.4).
  - `TEXT`/`PDF` complete on explicit "Mark complete" after open.
  - `QUIZ` completes on pass per its settings.
  - A **module** completes when all its lessons complete; a **course** completes when all modules complete. ("The quiz is the real gate" is preserved because the quiz is itself a lesson; use the sequential lock to force watch-before-quiz ordering.)
- **FR-2.5 (MVP)** Authoring is a simple structured builder (form-based), *plus* the AI assist: from an ingested video or uploaded document, generate a draft lesson summary and draft quiz (§7.5.8). All AI output lands as **draft cards the author accepts or discards individually** (the Sana "Edit Mode" accept-gate pattern). Never auto-publish.
- **FR-2.6 (Fast-follow)** SCORM 1.2 runtime player. Schema note: keep `Lesson.type` extensible.
- **FR-2.7 (MVP, v1.5)** **Course outline.** One decorated view of a course — structure, per-lesson completion, lock state, oral-check results and estimated minutes — assembled once (`buildCourseOutline`) and rendered on both the course page and every lesson page, so the two can never disagree.
  - Modules are collapsible (`<details>`, server-rendered, no client JS). Open by default: on the course page every module still to do, so finished sections fold away; on a lesson page only the module holding the current lesson. `?outline=all` opens everything.
  - Each lesson row carries a **drawn 16px icon for its type** (video, article, document, quiz, oral check). Completion and lock render *beside* the type, never over it, so a learner scanning what is left can still tell what each item is.
  - **Estimated minutes are derived, never invented:** video from its real duration, text from word count at 200 wpm, quiz from its time limit, oral check from its time box. A PDF has no stored length, so it contributes nothing and any roll-up containing one is marked `12 min+` rather than under-reporting.

### 7.2 Enrollment, due dates & compliance loop (FR-3)

- **FR-3.1 (MVP)** Manual enrollment (admin: anyone; manager: their team) and **auto-enrollment rules**: `IF profile matches (country/region/store/group/job title/hire-date window) THEN enroll in (course|path) with due date (fixed date | N days from enrollment | N days from hire)`. Hire-date-relative rules applied to long-tenured users must not produce past due dates: effective due = `max(hire_date + N, enrollment_date + 14 days)`.
- **FR-3.2 (MVP — the classic bug, get it right)** Rule evaluation semantics: rules apply to **existing and future** users; re-evaluate a user on profile change (a transfer to a new store/role swaps required training); re-evaluate all on rule change. Idempotency is enforceable because every enrollment records its provenance (`source ∈ {manual, rule, path, recert}` + `source_id`): never duplicate an active enrollment for the same course (partial unique index on `(user_id, course_id)` where status is active); never delete completion history. A user leaving a rule's scope keeps completed records; incomplete rule-created enrollments move to `WITHDRAWN`.
- **FR-3.3 (MVP)** Denormalized `enrollments.compliance_status` — closed enum, precedence top-down:
  `OVERDUE` (past due, incomplete) → `DUE_SOON` (due ≤ 7 days, aligned with the reminder ladder) → `ON_TRACK` (incomplete, not due soon) → `EXPIRED` (was completed; certificate lapsed and recert incomplete) → `COMPLETED_EXPIRING` (completed; certificate expires ≤ 30 days) → `COMPLETED` → `WITHDRAWN`.
  Recert creates a **new** enrollment (`source=recert, source_id=old enrollment`); the old one carries `COMPLETED_EXPIRING → EXPIRED`. Recompute on every relevant write plus a nightly sweep (store-local midnight). All date math in the store's timezone; due dates land end-of-day 23:59 local.
- **FR-3.4 (MVP)** Reminders & reach. Ladder per course (defaults): 7 / 3 / 1 days before due, on due date, then weekly while overdue — delivered in-app always, by email when the user has one. **Because most learners have neither email nor guaranteed app-opens, the certified reach mechanism is the manager loop:** every learner's overdue/due-soon items appear in the manager's weekly digest and dashboard tiles, and digests list learners *not reached directly* (no email, no app open in 7 days) so the manager nudges in person. The dispatcher is channel-pluggable; WhatsApp/SMS is the named fast-follow (§16.9).
- **FR-3.5 (MVP)** Certificates: per-course settings `certificate_enabled`, `certificate_validity_days?`, `recert_lead_days` (default 30). On completion: templated PDF (learner name, course, completion date, expiry date, unique verification ID). **Expiry closes the loop**: `recert_lead_days` before expiry → auto re-enrollment with due date = expiry date → reminder ladder. Certificate templates carry a fixed disclaimer: *"Internal training record — not an accredited or government certification."* (Regulatory certifications like food-handler cards come from accredited providers; see §16.10.)
- **FR-3.6 (MVP)** Completion records are immutable and timestamped (append-only table), exportable — the audit substance without the 21 CFR ceremony.

### 7.3 Learner home & discovery (FR-4)

- **FR-4.1 (MVP)** Learner home is a **"For You" feed, not a catalog** (the pattern of every AI-native leader; LinkedIn Learning reports +35% completion vs generic playlists): greeting → "Continue learning" resume card → "Due soon" rail (compliance first) → daily drill card (§7.5.9) → **"Recommended"** rail with a one-line *reason* per card ("Because you completed Food Safety Level 1"). No persistent ask-anything input on Home — the Ask HR tab and the in-lesson Tutor are the two chat entries (restraint; they were duplicative).
- **FR-4.2 (MVP)** Recommendations v1 are honest and simple: rule-based (due-soon > in-progress > new-in-path > popular-in-group) with the reason line stating the actual rule. **Rule-based recommendations never use the `--ai` color or AI labeling** (§10.2) — that marker is reserved for genuinely model-generated content. The ranking function is swappable later.
- **FR-4.3 (MVP)** Search: full-text across course titles/descriptions/tags and TEXT lesson content (generated tsvector columns; PDF content is out of search scope for MVP). The Learn tab (§11.3) carries enrolled courses, paths, and the Browse catalog with tag/language filters.
- **FR-4.4 (MVP)** Cold/empty states are first-class (§11.2): new user with no enrollments → assigned/path content leads; fully-caught-up user → celebrate the clear queue, pivot to Browse; drill card before any completed lesson → "unlocks after your first lesson."

### 7.4 Video learning & chat-with-content (FR-5) — the AI-native core

**Pipeline (MVP):**

- **FR-5.1** Admin pastes a YouTube URL → backend validates via YouTube Data API `videos.list?part=status,contentDetails` (1 quota unit): `status.embeddable == true` and `privacyStatus ∈ {public, unlisted}`; store duration. Reject non-embeddable/private videos at admin time with a clear message. (Unlisted is accepted because the strategic path is LuLu-owned unlisted uploads; note that the *scraping* transcript providers only work for public videos — unlisted requires manual upload or the owned-channel OAuth flow.)
- **FR-5.2** Transcript acquisition runs in a **queued background job** behind a `TranscriptProvider` interface with three implementations:
  1. **Manual upload (MVP, always available, fully lawful):** admin uploads an SRT/VTT/plain-text transcript at ingestion time. This is the bridge to LuLu-owned content and the only provider with zero ToS exposure.
  2. **Hosted API (MVP, demo use):** Supadata-class vendor (≈ $2–6 per 1,000 transcripts; an MVP corpus of ≤2,000 videos costs under $50). These vendors scrape YouTube — the ToS exposure is shifted, not eliminated. **Approved for internal demo/pilot content only**; flagged as such in the admin UI.
  3. **Self-hosted scraper (documented, not default):** `youtube-transcript-api` behind rotating **residential** proxies. Same ToS caveat. Included because vendors get cut off; never run it from cloud-datacenter IPs — YouTube blocks all cloud-provider ranges, so the naive build works in dev and dies on first deploy.
  For production content the sanctioned path is **LuLu-owned channel + official `captions.download` OAuth** (fast-follow, launch prerequisite — §16.4). Prefer manually-created caption tracks over auto-generated (`is_generated` flag). Videos with no captions and no uploaded transcript are rejected at admin time (no Whisper-over-yt-dlp for third-party videos — downloading audio violates YouTube ToS).
- **FR-5.3** Processing: merge caption snippets into chunks of **300–600 tokens with ~50-token overlap**, breaking at utterance boundaries, carrying `{video_id, start_sec, end_sec}` on every chunk. Never flatten to plain text — retrofitting timestamps requires full re-ingestion. Embed and store per §9.2 (pgvector, hybrid search).
- **FR-5.4** At ingestion, generate a **draft quiz** from the transcript via structured output: `{question, options[4], correct_index, explanation, source_start_sec, difficulty}` per item; land in the admin review queue (§7.5.8). Carrying `source_start_sec` enables "review this part" deep links on wrong answers.
- **FR-5.5** Videos are a first-class entity (§9.1) with ingestion status `PENDING / FETCHING / CHUNKING / EMBEDDING / READY / FAILED(reason)`, surfaced to admins with retry. A weekly link-health job re-checks embeddability/liveness of all published videos (curated YouTube corpora rot) and flags dead ones.

**Player & progress (MVP):**

- **FR-5.6** YouTube IFrame Player API with `enablejsapi=1` and `origin` set. Handle player errors 101/150 (embedding disabled after publish) with a graceful fallback card. Player viewport ≥ 200×200. **Never overlay any UI on the player surface** (YouTube ToS) — chat, citations, and controls sit beside/below it.
- **FR-5.7** Watch progress: poll `getCurrentTime()` every 5s while state == `PLAYING` **and** `document.visibilityState == 'visible'`; send heartbeats recording watched-second buckets server-side; completion = **unique coverage ≥ 90%** of duration (defeats both seek-to-end and idle-tab inflation). Detect seeks via |Δt| > poll×rate. Document the honest limits in code comments: heartbeats are client-reported and spoofable by a determined user (acceptable for training compliance; the quiz is the real gate).
- **FR-5.8** Lesson layout (desktop): video left (~60%), Tutor panel right; mobile: video top, tabbed Transcript/Tutor below. A clickable transcript (chunk list with timestamps) doubles as navigation.

**AI Tutor (MVP):**

- **FR-5.9** The Tutor is **persistent in the lesson player** (not buried behind a nav item), Sana-pattern: proactive **suggested questions** derived from the current chunk(s) at the playhead; free-form chat; **persistent threads** per user+course (`tutor_threads`/`tutor_messages`, §9.1 — real user identity; these are learning conversations, not pseudonymized HR content).
- **FR-5.10** Retrieval strictly scoped to the current video by default, with a visible toggle "This lesson ▾ / Whole course". Hybrid retrieval per §9.2, top ~10 chunks.
- **FR-5.11** Answers stream and carry **validated timestamp citations**. Wire protocol (pinned): `client.messages.stream` with `output_config.format` = zod schema `{answer_markdown: string, citations: [{start_sec: number, end_sec: number, quote: string}]}`; the client incrementally renders `answer_markdown` from partial-JSON deltas (blinking cursor while streaming); citation chips hydrate on completion. **Server-side citation validation (mirrors FR-8.6):** every citation must fall within a retrieved chunk's `[start_sec, end_sec]` range (±10s tolerance) — invalid citations are dropped; if *all* citations fail or none are returned for a factual answer, the answer is replaced with the abstention response ("I can't find this in the lesson…" + the course-wide toggle offer). A hallucinated chip that seeks to an unrelated moment is worse than no chip — the chip visually vouches for the claim.
- **FR-5.12** The Tutor answers in the language the learner writes in (including Romanized Hindi/Malayalam), grounding in the (typically English) transcript. Rendering: chat bubbles use `dir="auto"`; citation chips and policy references are wrapped in bidi-isolate spans so LTR `[12:34]` chips don't scramble RTL paragraphs; per-script font stacks per §10.3.
- **FR-5.13** "Explain this differently / simpler" quick action (one tap, ESL-friendly), and "Quiz me on this section" — generates 3 ephemeral practice questions from the current chunk (not persisted, not graded).

### 7.5 Assessment engine (FR-6)

**Question toolkit (MVP):**

- **FR-6.1** Seven question types: MCQ single, MCQ multi, true/false, fill-in-blank, matching, ordering, scenario free-text (AI-graded). Plus a **Stimulus** wrapper: a shared passage/image with multiple attached questions. All touch interactions have non-drag alternatives (FR-12.3): matching/ordering use tap-to-select-then-tap-to-place on mobile.
- **FR-6.2** Question banks: tagged pools reusable across courses, with optional `course_id` linkage (used by the drill, FR-6.11). Question lifecycle: `DRAFT → APPROVED → RETIRED` (AI-generated questions always enter as `DRAFT`). Support CSV import.
- **FR-6.3** Quiz composition: fixed question list **or** draw-N-random from bank sections. Per-attempt snapshot: an `Attempt` stores the exact served items/order/choices immutably (auditability + fair review).
- **FR-6.4** Settings matrix per quiz (Moodle-reference): attempts limit (1..N/unlimited) + cooldown between attempts; grading method (highest — default / latest / first / average); pass threshold %; shuffle questions and/or choices with lockable positions ("All of the above" stays last); one-question-at-a-time toggle; optional no-backtracking; optional **exam window** `available_from` / `available_until` (attempts cannot start outside the window; an attempt in progress at `available_until` is auto-submitted with the standard grace); optional **per-user time multiplier** accommodation (admin-set on the user, e.g. 1.5× / 2× — WCAG 2.2 SC 2.2.1).
- **FR-6.5** Timing: server-authoritative. Timed quizzes autosave answers every ~10s; auto-submit at expiry with a configurable grace window. Never trust the client clock. **Offline resilience (retail-floor Wi-Fi):** answers buffer locally with a visible "reconnecting…" banner; on reconnect the attempt resumes and buffered answers sync; connection-loss periods are recorded as **informational** (never orange/red) integrity events; admins may extend/void an attempt lost to a verified outage.
- **FR-6.6** Feedback policy is **per-quiz, two modes**: `PRACTICE` = immediate per-question feedback with explanations; `EXAM` = score now; correct answers are revealed only after `available_until` passes — or, when no window is set, only when the admin releases results (a per-quiz "release answers" action). A shift-based workforce takes the same test hours apart — immediate answer reveal leaks the key across shifts.
- **FR-6.7** Scoring semantics (pinned; unit-tested per §12.6): default 1 point per question, optional per-question `points`. MCQ single / true-false / fill-blank: all-or-nothing; fill-blank matches case-insensitively, trimmed, against an accepted-answers array. MCQ multi: all-or-nothing (partial credit is fast-follow). Matching / ordering: proportional (correct pairs or positions ÷ total). Free-text: rubric points normalized to the question's points. Quiz score = Σ earned ÷ Σ possible.
- **FR-6.8** Results: learner sees score, pass/fail, per-question review per feedback policy; wrong answers on video-sourced questions show a "Review this part" link (`source_start_sec`).

**AI assessment (MVP):**

- **FR-6.9** AI quiz generation (from video transcripts §7.4, or from TEXT/PDF lesson content): generated with stem + distractors + explanation + objective tag together; **always lands as DRAFT for admin/SME review — never auto-published.** Hallucinated distractors in compliance training are the fastest way to destroy trust. Review UI: accept / edit / discard per question, bulk accept.
- **FR-6.10a (v1.4)** The **oral check** (§7.12, FR-14.2) is a separate record with its own pass mark and its own human queue: a fail never auto-finalizes anything against the learner, an admin can confirm or **overturn** it, and the learner can retake. Whether passing is required to complete a lesson is the admin's per-lesson choice (`requirePass`, default on for INTERVIEW lessons). Post-lesson checks on video/text lessons stay non-gating.
- **FR-6.10** AI grading of scenario free-text: the question stores a rubric (criteria + points + model answer). At submission the model returns per-criterion scores, a written rationale, and a confidence value (structured output). Learners may answer in their own language; the model grades cross-lingually against the English rubric. **Routing rule (employment-safe):**
  - AI **pass** with confidence ≥ 0.7 and margin > 5 percentage points above threshold → auto-finalized.
  - **Every AI fail on an assessment that gates a required completion goes to the human review queue — regardless of confidence.** Only passes may auto-finalize. An AI-failed compliance assessment finalized without a human is an automated employment decision this platform must never make.
  - Low confidence (< 0.7) or borderline (within ±5 pp of threshold) → human queue in all cases.
  - The learner sees instant provisional feedback; grades are marked provisional until final. **Completion records and certificates are written only on FINAL grades**; a provisional pass shows "pending confirmation" and does not clear `OVERDUE`.
  - A visible **appeal path**: any finalized AI-graded result can be sent to human re-review by the learner, once per attempt.
  - Log model version + prompt version per grade. M3 includes a bias/consistency eval across languages and answer lengths (§14).
- **FR-6.11 (Fast-follow)** Adaptive difficulty via Elo ratings (two float columns + one update rule — no IRT calibration study). Do not build classical IRT.

**Daily drill — spaced repetition (MVP):**

- **FR-6.12** A distinct surface from formal exams (the Axonify pattern proven on retail frontline workforces): a 3–5 minute daily session of 5–8 questions, drawn from **APPROVED questions reachable via quizzes of the learner's enrolled courses** (union of fixed lists + bank sections; that is the defined eligibility query), scheduled by a Leitner/SM-2-lite scheduler over per-user per-question mastery state `{interval, ease, last_seen, streak}`. Optional per-answer confidence rating; "confidently wrong" answers get top re-drill priority.
- **FR-6.13** The drill feeds the home card, awards points, and counts toward the weekly streak (§7.10). It is never proctored, never punitive, **strictly optional, and never counts toward required-training status** (FR-13.6).

### 7.6 Integrity monitoring & "proctored" assessments (FR-7)

Branding note: the product term is **"integrity monitoring"**, not "proctoring" — pure-web technology deters and detects; it cannot prevent. Spec language claiming prevention would fail audits. The reframe from the brief's "proctored assessment" requires client sign-off (§16.5). For assessments that genuinely need supervision, the supported answer at any tier is an **in-person invigilated sitting** (an admin can mark an attempt "supervised by <name>").

**Tier 1 — extension-free monitoring (MVP), per-assessment flag `integrity_mode`:**

- **FR-7.1** On start (after the consent interstitial, FR-7.4): request fullscreen where the platform supports it (desktop browsers; Android Chrome). **iOS Safari does not support programmatic fullscreen** — on such platforms the runner records one informational event `fullscreen_unavailable(platform)` and monitoring proceeds with visibility/blur/focus signals only; the transparency screen states per-platform exactly what is monitored. Exiting fullscreen (where active) pauses the attempt with a "return to fullscreen" gate and logs an event.
- **FR-7.2** During: log timestamped events — `visibilitychange`/window blur (tab/app switch), fullscreen exit, copy/paste/cut attempts (suppressed in exam DOM), context-menu attempts, devtools heuristics, answer timing, connection loss (informational). Append-only `integrity_events` table per attempt.
- **FR-7.3** Reviewer UI: per-attempt timeline of events with severity tiers (red = e.g. >60s continuous focus loss; orange = brief blur; grey = informational). **Flags gate human review — never verdicts.** No automatic failing, ever: OS notifications, IME language switching (an Arabic/Hindi keyboard user!) and accessibility tools all produce false positives. Attempt states: `IN_PROGRESS / SUBMITTED / GRADED / CLEARED / VOIDED(reason)`. A voided attempt does **not** count toward the attempts limit and grants a fresh attempt (never resume — the learner saw the items).
- **FR-7.4** Consent interstitial before every monitored attempt (§11.6): plain language, per-platform truthful ("we record when you leave this screen; **no camera, no screen recording**"), why, who reviews; consent logged with timestamp.

**Tier 2 — webcam monitoring (fast-follow; build the schema + consent flow design now, no capture code in MVP):**

- **FR-7.5** Off by default; enabled per high-stakes assessment only. Pre-exam identity photo + periodic snapshots (every 15–30s) via `getUserMedia`; client-side face-presence check (MediaPipe class) so video never leaves the device unless flagged.
- **FR-7.6** Legal guardrails (UAE — non-negotiable): explicit **in-flow, per-session consent** naming what is captured, why, retention period, and who reviews (a buried policy clause is not enough — Cybercrime Law Art. 44 risk); a documented necessity justification + DPIA before enabling (PDPL treats facial images as sensitive data; consent alone is a weak basis in employment); **retention measured in days** — auto-delete snapshots ≤30 days after result finalization, immediately if unflagged; human review before any consequence; the in-person invigilated alternative for those who decline. **Never build:** eye/gaze tracking, face-matching against ID, room scans.

### 7.7 Virtual HR Assistant (FR-8)

An employee-facing, strictly **informational** policy Q&A assistant. Reference products: Leena AI (~70% deflection claims, WhatsApp-first for frontline), Workday Policy Agent, MeBeBot.

**Corpus & console (MVP):**

- **FR-8.1** HR admin console: upload policy documents (PDF/DOCX/MD), each with metadata `{title, country, audience (all/managers), language, version, effective_date, superseded_date, policy_owner, review_due}`. Uploading a new version inserts the new version's chunks and flags the old version's chunks `superseded` — **soft replacement, never physical deletion within the audit retention window** (hard-filtered at query time; preserved so FR-8.11's answer reconstructability holds). Stale chunks out-ranking new ones is the classic production failure; expired/superseded content must be hard-filtered, never merely down-ranked.
- **FR-8.2** Ingestion: structure-aware parsing preserving headings/tables; recursive heading-based chunking at ~512 tokens with parent-section retrieval (child chunk for precision, parent section for answer context). Policy text is exception-dense — chunking must not sever a rule from its "unless/except/subject to" clauses; chunk boundaries at heading level, not mid-clause.
- **FR-8.3** Seed corpus: a **fictional "Demo Retail Co." employee handbook** covering the topic shapes Gulf retail workers actually ask about (working hours & Ramadan hours, overtime, annual leave, sick leave, maternity, probation & notice, end-of-service gratuity, salary timing) — with plausible but **explicitly fictional** figures, never real statutory numbers an employee could rely on. The demo corpus is gated behind a `DEMO_MODE` environment flag and can never be served to non-seed accounts. **Production launch gate:** counsel-reviewed, LuLu-owned policy documents with a named owner per document (§16.3). Per-country packs are fast-follow — gratuity/leave rules diverge materially by GCC country; a single "GCC answer" is legally wrong somewhere.
- **FR-8.4** Citation-first: every answer carries numbered citations `{policy title, section, version, effective date}`; tapping opens the policy viewer (§11.7a) scrolled to the section. Framing rule enforced in the system prompt and an output check: answers say "Per [policy X]…" and end with a standing line that only HR makes final determinations. No promissory language ("you will be approved") — regex + model output rail.
- **FR-8.5** Retrieval filters (hard, metadata-level, applied in SQL before ranking): country = user's country; audience ⊆ user's role; effective_date ≤ today < superseded_date. Permission-aware retrieval from day one — naive vector search leaking manager-only content is a headline failure mode.
- **FR-8.6** Three-layer confidence handling: (1) retrieval-score threshold — below it, don't answer; (2) grounding check — answers with no valid citation are replaced by the abstention response; (3) prompted abstention ("If the provided policy excerpts don't answer this, say so"). Abstention always offers escalation.
- **FR-8.7** Escalation: one tap ("Ask HR directly") or automatic on abstention/guardrail — creates an HR ticket carrying the conversation transcript + retrieved sources (HR doesn't start cold). MVP tickets live in-app: an admin/HR queue with status and assignment (§11.12), and a learner-visible ticket thread with reply notifications. `[DISCOVERY]` ServiceNow/HRMS integration later.
- **FR-8.7a** Identity model (pinned): `hr_conversations` stores the **real** `user_id` (needed for history, tickets, and notifications). Escalated tickets carry real identity by design — the escalation composer's consent note says so before sending. **Line managers never see ticket contents or conversation history** — tickets are visible to ADMIN/HR only. Pseudonymization (`pseudo_id = HMAC(user_id, secret)`) applies to `hr_audit_log` and KPI aggregation.
- **FR-8.8** Guardrails: denied topics — legal/visa/immigration advice, medical questions, **grievance & harassment (immediate, sympathetic human routing — the bot must never handle these)**, salary negotiation; PII redaction **before the model API call** and before logging; prompt-injection screening on inputs; conversations of *other* employees never retrievable.
- **FR-8.9** Languages (reconciled with the eval gate): the assistant **actively answers** only in languages that have passed an eval (English at MVP launch; Arabic next). For any other input language it responds in that language with a short hedged template + the English-grounded citations + a one-tap escalation offer — never a full generated policy answer in an un-evaluated language. Romanized Hindi/Malayalam input is handled (detected and understood; response per the same rule). The Tutor (§7.4), being lower-stakes, stays fully language-open. Voice mode (FR-14.3) answers in English; it understands other languages and says so, in that language, with the escalation offer.
- **FR-8.10** Transparency: the assistant self-identifies as AI on first use per session. In voice mode (FR-14.3) the disclosure is fixed UI text on the screen — never something the model must remember to say.

**Measurement (MVP):**

- **FR-8.11** Append-only audit log per exchange: pseudonymized user, language, query, redacted-PII flag, retrieved chunk IDs + policy versions (chunks soft-retained per FR-8.1 so answers reconstruct), answer, citations, confidence, guardrail hits, escalation outcome, thumbs feedback. Retention: minimum 6 months, **maximum 12 months** then auto-purge (§7.11).
- **FR-8.12** KPI dashboard: deflection (resolved-without-human — abandonment is NOT deflection), containment, escalation rate, CSAT (thumbs), re-contact rate (same user, same topic, ≤7 days — the honesty check), top unanswered questions (the content-gap feed). Benchmarks displayed against: 20–40% typical, 65–75% good.
- **FR-8.13** Quality gate: launch (beyond demo) requires a **golden question set (≥100 real questions, sourced from HR's actual ticket/inquiry history)** with published accuracy and abstention-correctness thresholds signed off by HR — per language before that language is advertised (M4 acceptance).

### 7.8 Notifications (FR-9)

- **FR-9.1 (MVP)** Fixed catalog (no rules builder): enrolled; due in 7/3/1; due today; overdue (weekly repeat); certificate expiring 30/7; quiz graded (provisional→final); HR ticket updated; manager weekly team digest (including the *not-reached-directly* learner list, FR-3.4). Channels: in-app inbox (§11.9b) always; email when the user has one. Email transport: SMTP via `SMTP_URL` (nodemailer); absent → email channel disabled gracefully, in-app still delivers everything; dev uses a console/Mailpit transport. The dispatcher is channel-pluggable — WhatsApp/SMS is the fast-follow channel.
- **FR-9.2 (MVP)** Per-user quiet hours (default: outside the store's shift hours, stored on the user as `quiet_hours`); all scheduling in the store's timezone (default Asia/Dubai). Digest batching hard-coded sane: managers get one weekly digest, never N emails.

### 7.9 Manager dashboard, reporting & NL queries (FR-10)

- **FR-10.1 (MVP)** Manager dashboard: status tiles that double as drill-down filters — Overdue, Due soon, In progress, Completed, Expiring certificates, Inactive 30d — team list with per-learner drill-in, inline actions: assign, nudge (rate-limited: once per learner per 48h), export.
- **FR-10.2 (MVP)** Admin reports (all real-time, filterable, CSV export): (1) course completion; (2) compliance matrix (user × required training — the audit export); (3) learner transcript; (4) certificate expiry 30/60/90; (5) engagement (active users, inactive list, time spent); (6) quiz results with per-question analysis (% correct per question — surfaces bad questions). **Cut-first:** saved views, scheduled email delivery, XLSX (§3).
- **FR-10.3 (MVP)** **Ask Reports** (the AI-native reporting differentiator): a natural-language box on the reports page. Implementation: the model receives the report-schema catalog and emits a **typed query plan** (validated filter/group/aggregate JSON against a whitelisted schema — never raw SQL from the model); results render as the standard table + a one-paragraph narrated summary + "Refine" chips. Read-only, scoped to the asker's role/scope. Every NL answer shows the structured query it ran (trust + debuggability).

### 7.10 Gamification lite (FR-11)

- **FR-11.1 (MVP)** Points: lesson complete +10, quiz pass +20 (first pass only), daily drill +5, course complete +50. Badges (MVP set of four): first course, 5 courses, 4-week streak, perfect quiz. Displayed on profile + home.
- **FR-11.2 (MVP)** **Weekly-goal streak**: "learned on 3 distinct days this ISO week" (any days — "workdays" is undefinable for shift workers), with one free repair/freeze per calendar month (`streak_state` table). No guilt notifications; celebrate milestones. **Never surface streaks to managers or tie them to reviews or required-training status** — optional engagement only (FR-13.6).
- **FR-11.3 (Fast-follow)** Store-scoped leaderboard (opt-in per store, default off — competitive gamification in HR contexts is a culture risk).

### 7.11 Data protection & privacy — platform-wide (FR-13)

The HR assistant is not the only surface processing personal data: Tutor chats, free-text quiz answers, Ask Reports queries, watch heartbeats, integrity events, and drill mastery state are all employee personal data, some of it workplace monitoring, and AI routes transfer it cross-border. These controls are platform-wide, not HR-assistant-specific:

- **FR-13.1 (MVP)** **Employee privacy notice** shown at first login (and re-acknowledged on material change): what is collected (including watch/integrity monitoring), why, which processors receive it (LLM provider, embeddings provider — both US-hosted), retention periods, and how to exercise data-subject rights. Plain language, per-locale.
- **FR-13.2 (MVP)** **PII minimization on every AI route** (not just HR): redaction of identifiers (passport/Emirates ID patterns, phone numbers, salary figures) before any model or embeddings API call; user identity never sent to providers — only opaque IDs.
- **FR-13.3 (MVP)** **Retention schedule** (maximums, enforced by a nightly purge job):
  | Data | Retention |
  |---|---|
  | HR audit log | 12 months |
  | HR conversations (user-visible history) | 12 months |
  | Tutor threads | 12 months |
  | Integrity events | 6 months after attempt finalization |
  | Watch heartbeats (raw buckets) | 90 days (aggregate coverage % kept) |
  | AI call logs (token/cost telemetry, no content) | 24 months |
  | Oral-check transcripts + evaluations (`live_interviews`) | 12 months |
  | Voice audio (oral check, HR live mode) | **never stored** — streamed to the speech model while the screen is open, only the transcript is kept |
  | Completion records / certificates | employment + statutory period (no auto-purge) |
- **FR-13.4 (MVP)** **Data-subject rights**: an admin tool to export all data held on a user (JSON) and to erase/anonymize a departed user (completion records are retained but pseudonymized).
- **FR-13.5 (launch gates, not code)** DPAs with the LLM provider, the embeddings provider and the realtime speech provider (Google, Gemini Live — FR-14); a DPIA covering tier-1 monitoring (not just the webcam tier); UAE-only legal envelope until per-country reviews complete. Listed in §16.
- **FR-13.6 (MVP)** **Paid-time boundary**: required (compliance) training is working time. Default quiet hours suppress all nudges outside store shift hours; streaks/drills are optional and never affect required-training status; the spec's stance (client to endorse, §16.8) is that LuLu designates paid training windows.
- **FR-13.7 (MVP)** **AI cost telemetry**: every model call logs route, model, input/output tokens, latency, and estimated cost (`ai_call_log`); the admin dashboard rolls up cost-per-active-user and cost-per-route (ROI's cost side, §15).

### 7.12 Live voice — Gemini Live (FR-14) *(v1.3)*

Two spoken experiences on the Gemini Live API (bidirectional realtime audio). Both are optional; the typed paths stay first-class.

- **FR-14.1 (MVP)** **Architecture — ephemeral tokens, browser ↔ model direct.** The server mints a **one-use ephemeral token** per session with the model, system prompt, tools, modalities and transcription **locked in** (`liveConnectConstraints`); the browser opens the WebSocket to Google with that token. The API key never reaches the browser; the container never proxies audio. Start order is consent → microphone → token → connect, all from one user gesture (playback unlock). Tool calls (`search_hr_policy`, `escalate_to_hr`, `submit_evaluation`) round-trip through `/api/live/*` so retrieval, guardrails, storage and notifications stay server-side. Reconnects use session resumption with a fresh token; a hard time box ends interviews before the connection limit. Transcripts are persisted per finished turn; the session's token usage is logged to `ai_call_log` (routes `hr_live`, `oral_check`; client-summed and labeled estimated; audio and text priced separately).
- **FR-14.2 (MVP, v1.4)** **Oral checks: post-lesson and INTERVIEW lessons.** Two entry points share one engine. (a) After a VIDEO lesson (READY transcript) or TEXT lesson completes, the learner may take a check on that lesson (non-gating). (b) An admin adds an **INTERVIEW lesson** anywhere in a course and configures it: questions (1–6), pass mark (50–100 %), time box (3–9 min, scaled by the learner's accommodation), **scope** (the previous lesson / the module / the whole course), an optional focus line, and **require pass**. The interviewer greets the learner by name, asks one question at a time drawn only from the scoped content, probes once, never reveals scores aloud, and ends by calling `submit_evaluation` (0–3 per question, feedback, summary). Score ≥ pass mark → **PASS**, else **FAIL**; a pass (or any finish when pass is not required) completes the lesson through the normal completion chain. Fails list on the admin review page with transcript and evaluation — **Confirm fail** or **Overturn to pass** — and notify the manager; the learner can retake (latest attempt counts). If a session ends without a submitted evaluation, the stored transcript is graded by a fallback (text model with the same schema; offline grader without a key). Results show on the course page, the learner's profile and the manager's team-member page. Demo data seeds one INTERVIEW lesson per demo course on every DEMO_MODE boot (idempotent).
- **FR-14.3 (MVP, v1.4)** **Your assistant — live mode.** One spoken agent for HR policy **and** the learner's allocated courses. Tools: `search_hr_policy` (deterministic guardrails → PII redaction → hard-filtered hybrid retrieval → confidence floor → excerpts + citations + audit row), `search_course_content` (READY video transcripts + text lessons of the learner's enrolled courses only; citations deep-link to the lesson), `my_training_status` (deterministic: status, due dates, compliance, progress from the same queries as the home screen), `escalate_to_hr` (returns `needs_confirmation`; the on-screen consent dialog creates the ticket — FR-8.7a). The system prompt carries **learner context** (first name, job title, store, today's date, assigned courses with status/due/progress — never ids or email, FR-13.2) and a product context line. Latency: both searches are declared `NON_BLOCKING` and answered `WHEN_IDLE`, so the model says one filler phrase while retrieval runs and answers right behind it; end-of-turn detection is tuned (500 ms silence) for the assistant only; audit rows are written after the response; repeat query embeddings are cached. Grounding is prompt-enforced (the Live API has no tool-choice setting), so assistant turns with no preceding tool call are audited as `ungrounded`. Answers are in English (FR-8.9); the AI disclosure is fixed UI text (FR-8.10). Conversations live in `hr_conversations` (`mode = voice`) / `hr_messages`. Managers never see them (FR-1.2).
- **FR-14.4 (MVP)** **Consent, retention, visibility.** A per-session consent card (`consents.kind = voice`) states: microphone on only while the screen is open; audio streamed to Google's Gemini API and **never stored** by us; transcript kept 12 months (FR-13.3); who sees it (HR team only if shared / manager and admins for oral checks); typing is always available; iPhone ringer hint. The privacy notice names Google as a processor for voice features. DSR export/erase and the nightly purge cover `live_interviews`.
- **FR-14.5 (MVP)** **Cost.** Every session writes one `ai_call_log` row with modality-split token counts and an estimated cost from centralized Gemini Live prices; it rolls into the existing per-route panel (FR-13.7).
- **FR-14.6 (MVP)** **Offline demo mode.** Without `GEMINI_API_KEY` both screens run typed (with speech synthesis where the browser has it) against the same server tools — real retrieval and citations, the offline grader, real notifications — labeled "offline demo" on every AI surface. `/api/health` reports `voiceConfigured`.
- **FR-14.7 (Fast-follow)** Arabic voice answers after the FR-8.9 eval gate; speaker verification for the oral check; a "listen again" replay of the interviewer's question; manager-initiated oral checks.

---

## 8. Localization & accessibility (FR-12)

- **FR-12.1 (MVP)** i18n architecture from day one: all UI strings externalized (`next-intl` or equivalent); locale switcher; **full RTL support** (logical CSS properties everywhere — `ms-`/`me-`, no hard `left/right`), verified with an Arabic pseudo-locale in CI even before Arabic strings ship. Mixed-direction text (RTL paragraphs containing LTR chips/citations) uses `dir="auto"` + bidi-isolate spans (FR-5.12). Shipping languages: English (complete). Fast-follow string packs: Arabic, Hindi, Urdu, Malayalam, Tagalog (mirrors the UAE MOHRE service-language set — the best proxy for the Gulf retail workforce mix).
- **FR-12.2 (MVP)** AI language posture: Tutor fully language-open; HR assistant per FR-8.9 (evaluated languages only, hedged path otherwise).
- **FR-12.3 (MVP)** Accessibility: WCAG 2.2 AA — contrast ≥ 4.5:1 body text in both themes (§10.2 tokens are chosen to pass); visible focus rings; full keyboard paths for every flow including quizzes; **minimum 44×44px touch targets on learner surfaces**; **every drag interaction has a tap alternative** (tap-to-select-then-place for matching/ordering; up/down buttons in the course builder — SC 2.5.7); timed-assessment accommodations via the per-user time multiplier (FR-6.4 — SC 2.2.1); `prefers-reduced-motion` honored (§10.5); font-size respects user zoom to 200%; captions inherent (YouTube).
- **FR-12.4 (MVP)** Low-bandwidth: Android-first performance budget (§12.5); images lazy+compressed; PWA = installable manifest + cached app shell **only** (the shell must not white-screen offline; offline content viewing is deferred).

---

## 9. Data model & AI retrieval architecture

### 9.1 Core schema (Postgres; names indicative)

```
users(id, employee_id UNIQ, name, role, store_id, manager_id?, group_ids[], job_title,
      hire_date, preferred_language, email?, password_hash?, password_state INVITED|ACTIVE,
      invite_code_hash?, invite_expires_at?, time_multiplier float default 1.0,
      quiet_hours jsonb?, totp_secret?, created_at)
org_units(id, type country|region|store, parent_id, name, timezone default 'Asia/Dubai')
groups(id, name)                      -- job families
courses(id, title, description, cover_url, status, language, est_minutes, tags[],
        objectives[], sequential_lock bool, certificate_enabled bool,
        certificate_validity_days?, recert_lead_days int default 30,
        tsv tsvector GENERATED, created_by, published_at)
modules(id, course_id, title, sort)
lessons(id, module_id, type VIDEO|TEXT|PDF|QUIZ, title, sort, payload jsonb,
        search_text text?, tsv tsvector GENERATED)   -- VIDEO payload: {video_id}
videos(id, youtube_id UNIQ, duration_sec, transcript_lang, transcript_source
       manual|vendor|scraper|official, is_generated bool, ingestion_status,
       failure_reason?, last_health_check_at)
paths(id, title, complete_in_order bool) / path_courses(path_id, course_id, sort)
enrollment_rules(id, criteria jsonb, target_type, target_id, due_rule jsonb, active)
enrollments(id, user_id, course_id, source manual|rule|path|recert, source_id?,
            due_at, status, compliance_status, completed_at?, withdrawn_at?)
  -- partial UNIQUE (user_id, course_id) WHERE status active
lesson_progress(user_id, lesson_id, status, watched_buckets bytea, updated_at)
completion_records(id, user_id, course_id, completed_at, score?)  -- append-only
certificates(id, user_id, course_id, kind internal|external_tracked, issued_at,
             expires_at?, serial UNIQ, pdf_url?)
question_banks(id, name, course_id?, tags[])
questions(id, bank_id, type, status DRAFT|APPROVED|RETIRED, points int default 1,
          body jsonb, rubric jsonb?, source jsonb? {video_id,start_sec},
          created_by human|ai, version)
quizzes(id, lesson_id, settings jsonb {attempts, cooldown, grading_method, pass_pct,
        shuffle, one_at_a_time, no_backtrack, feedback_mode PRACTICE|EXAM,
        available_from?, available_until?, answers_released_at?, time_limit_sec?,
        integrity_mode}, sections jsonb [{fixed ids | bank_id+pick_n}])
attempts(id, quiz_id, user_id, started_at, submitted_at?, served_items jsonb SNAPSHOT,
         answers jsonb, score?, passed?, grading_state PROVISIONAL|FINAL,
         state IN_PROGRESS|SUBMITTED|GRADED|CLEARED|VOIDED, void_reason?)
grading_reviews(id, attempt_id, question_id, ai_scores jsonb, ai_confidence,
                reason ai_fail|low_conf|borderline|appeal, state PENDING|CONFIRMED|ADJUSTED,
                reviewer_id?, final_scores jsonb)
integrity_events(id, attempt_id, ts, kind, detail jsonb, severity red|orange|info)
drill_state(user_id, question_id, interval_days, ease, due_at, streak, confidence_hist)
streak_state(user_id, week_start, days_active int, freezes_used_month int,
             current_streak_weeks int)
video_chunks(id, video_id, start_sec, end_sec, text, embedding vector(1024),
             tsv tsvector GENERATED)   -- HNSW (cosine) + GIN indexes
policy_docs(id, title, country, audience, language, version, effective_date,
            superseded_date?, owner, review_due, file_url, status, is_demo bool)
policy_chunks(id, doc_id, section_path, parent_text, text, superseded bool,
              embedding vector(1024), tsv)
tutor_threads(id, user_id, course_id, lesson_id?, created_at)
tutor_messages(id, thread_id, role, content, citations jsonb, feedback?, created_at)
hr_conversations(id, user_id, language, started_at) / hr_messages(...)
hr_audit_log(pseudo_id, ...per FR-8.11)  -- append-only
hr_tickets(id, conversation_id, state, assignee?, created_at)
ai_call_log(id, ts, route, model, input_tokens, output_tokens, est_cost, latency_ms)
ui_events(id, user_id, ts, kind, payload jsonb)  -- citation clicks, tutor opens (§15)
points_ledger(user_id, ts, kind, amount) / badges(user_id, badge, awarded_at)
notifications(id, user_id, kind, payload, channels[], read_at?, sent_at)
consents(id, user_id, kind privacy_notice|integrity|escalation, version, ts)
```

Design rule behind the schema: **every field an admin can see is a field a report can filter** — this is how we beat TalentLMS's "unreportable fields" complaint. No entity without a queryable path.

### 9.2 Retrieval (shared by Tutor + HR assistant)

- **pgvector** with HNSW (cosine) — the production default (no IVFFlat tuning) — plus generated `tsvector` with GIN.
- **Hybrid search**: vector KNN and full-text run in parallel, merged with Reciprocal Rank Fusion (`score = Σ 1/(60+rank)`). Hybrid is non-optional here: exact terms (policy codes, SKU/brand names, Arabic-English mixed queries) fail pure semantic search.
- **Embeddings: Voyage AI `voyage-3.5`** (1024-d, multilingual) via `VOYAGE_API_KEY`; provider-abstracted (`EmbeddingProvider` interface) with `BGE-M3` (self-hosted, 1024-d) as the documented swap — that swap is also the **data-residency mitigation** for countries whose rules preclude US-hosted embedding calls (§7.11).
- Scoping filters applied in SQL (video_id / course_id for the Tutor; country/audience/effective-date/superseded for HR) — **before** ranking, not after.

### 9.3 AI gateway (one module, all features)

All model calls go through a single server-side `ai/` module (provider SDK: `@anthropic-ai/sdk`), so caching, logging, PII redaction, and cost controls live in one place.

- **Model:** `claude-opus-5` for all reasoning surfaces (Tutor, HR assistant, grading, quiz generation, Ask Reports). Use `output_config.effort` as the cost/depth lever per route — e.g. `low` for suggested-question generation, default for chat, `high` for rubric grading — rather than mixing models. (Model choice is config: `AI_MODEL` env var.)
- **Thinking:** adaptive (`thinking: {type: "adaptive"}`) — on Opus 5 this is the default; do not set `budget_tokens` (removed; 400 error).
- **Streaming + structure (pinned protocol, used by Tutor and HR assistant):** `client.messages.stream` with `output_config.format` set to the surface's zod schema (`{answer_markdown, citations[]}`); the client incrementally renders `answer_markdown` from partial-JSON deltas; citations validate server-side (FR-5.11 / FR-8.6) and hydrate as chips on completion. Non-chat structured tasks (quiz gen, grading, query plans) use non-streaming `messages.parse` with `max_tokens` ≈ 16000.
- **Prompt caching:** stable system prompts first, `cache_control: {type: "ephemeral"}` breakpoints after the static prefix; volatile content (user question, retrieved chunks) last. Verify `usage.cache_read_input_tokens > 0` in dev.
- **Refusals:** check `stop_reason === "refusal"` and render a neutral "can't help with that here" state (HR assistant routes to escalation).
- **Telemetry:** every call writes `ai_call_log` (route, model, tokens, est. cost, latency, prompt version). PII redaction (FR-13.2) runs before the API call on **all** routes carrying user free text.

---

## 10. Design language ("Reimagined, live and dynamic" — made concrete)

### 10.1 Direction: committed editorial/humanist

2026 product design has split into two shipping languages: techno-futurist (dark-first, neon accent — Linear, Vercel, Raycast) and **editorial/humanist** (warm paper neutrals, serif accents, generous whitespace — Claude, Perplexity, Notion-adjacent, Sana). AI-forward learning products have converged on the second because it reads human and trustworthy. **This product commits to editorial/humanist, light-first.** A workforce LMS on shared/retail-floor and mobile devices needs light-first with strong contrast; dark mode ships as the complete token set below + toggle, not the identity. Mixing both languages (dark hero + cream cards + neon chips) is the trend-collage failure — do not.

Restraint IS the design language (the Linear lesson): one accent, **one type family at two weights**, exactly three radii + pill, **three elevation levels**, a closed token vocabulary — closed literally: the Tailwind theme declares only these values, so an off-system class emits no CSS and the guardrail test names it.

### 10.2 Color tokens (OKLCH, CSS variables — complete light AND dark sets)

Tailwind v4 + shadcn/ui; all colors as OKLCH custom properties. Semantic colors always ship as a pair (`--x` surface/accent + `--x-fg` text-safe). **Status chips render as tinted background + dark text** (never light-hue text on paper).

```
:root {
  --background:       oklch(0.985 0.004 85);  /* warm paper */
  --surface:          oklch(1 0 0);
  --surface-2:        oklch(0.97 0.004 85);
  --border:           oklch(0.922 0.006 85);
  --foreground:       oklch(0.185 0.01 85);
  --muted-foreground: oklch(0.45 0.012 85);
  --primary:          oklch(0.52 0.13 155);   /* deep green — accent as punctuation */
  --primary-fg:       oklch(0.985 0 0);
  --success:          oklch(0.55 0.12 155);  --success-fg:     oklch(0.32 0.09 155);
  --success-tint:     oklch(0.95 0.03 155);
  --warning:          oklch(0.72 0.13 75);   --warning-fg:     oklch(0.42 0.11 75);
  --warning-tint:     oklch(0.96 0.045 85);
  --destructive:      oklch(0.55 0.19 25);   --destructive-fg: oklch(0.985 0 0);
  --destructive-text: oklch(0.44 0.17 25);   --destructive-tint: oklch(0.96 0.025 25);
  --ai:               oklch(0.55 0.09 300);  --ai-fg:          oklch(0.36 0.08 300);
  --ai-tint:          oklch(0.965 0.02 300);
}
.dark {
  --background:       oklch(0.16 0.008 85);
  --surface:          oklch(0.205 0.008 85);
  --surface-2:        oklch(0.245 0.009 85);
  --border:           oklch(0.31 0.01 85);
  --foreground:       oklch(0.93 0.006 85);
  --muted-foreground: oklch(0.68 0.01 85);
  --primary:          oklch(0.68 0.13 155);  --primary-fg:     oklch(0.16 0.03 155);
  --success:          oklch(0.68 0.12 155);  --success-fg:     oklch(0.85 0.08 155);
  --success-tint:     oklch(0.26 0.035 155);
  --warning:          oklch(0.78 0.13 80);   --warning-fg:     oklch(0.87 0.1 80);
  --warning-tint:     oklch(0.27 0.04 80);
  --destructive:      oklch(0.66 0.18 25);   --destructive-fg: oklch(0.16 0.02 25);
  --destructive-text: oklch(0.78 0.14 25);   --destructive-tint: oklch(0.27 0.035 25);
  --ai:               oklch(0.72 0.1 300);   --ai-fg:          oklch(0.86 0.07 300);
  --ai-tint:          oklch(0.27 0.035 300);
}
```

Rules: neutrals carry the UI; `--primary` appears only on primary actions, active states, progress. `--ai` is reserved **exclusively for genuinely model-generated content** (tutor/assistant bubbles, citation chips, AI draft cards) — an honesty affordance; rule-based recommendations and any non-model UI never use it (FR-4.2). Celebration moments use `--primary` + the motion treatment — there is no separate celebration hue (one fewer color, one clearer meaning). AI-generated text renders on the **AI surface** (`--ai-tint` background + a small `✳ AI` label in `--ai-fg`, `<AiSurface>`): the surface, not a typeface, is the honesty affordance. Verify ≥ 4.5:1 for body text and chip text in both themes (the `-fg`/`-text` variants above are chosen to pass; validate in CI with an automated contrast check).

### 10.3 Typography (v1.2)

- **One variable sans-serif for everything:** Inter Variable (`wght` + `opsz` axes), `font-feature-settings: 'cv01', 'ss03', 'zero'`; body 16px/1.5.
- **Two weights only — 400 and 500.** No 600/700 anywhere, including headings, `<strong>`, table headers and SVG text (heavy headings are the fastest way to look dated). The theme declares only `font-normal`/`font-medium`; `font-semibold`/`font-bold` emit nothing.
- **Five sizes, nothing larger exists in the theme:** `xs` 12/16 · `sm` 14/20 · `base` 16/24 · `lg` 20/28 · `xl` 24/32 (page titles, −1% tracking).
- **No serif.** Model-generated text is distinguished by the AI surface (§10.2), never by a typeface.
- **Per-script stack:** `"Inter", "IBM Plex Sans Arabic", "Noto Sans Devanagari", "Noto Sans Malayalam", system-ui, sans-serif`; non-Latin subsets load on demand (unicode-range) to protect the performance budget.

### 10.4 Shape, space & depth (v1.2)

- **Radii as a scale:** `4px` controls (buttons, menu rows, focus ring), `8px` inputs (fields, selects, selectable option rows), `12px` cards (tiles, dialogs, toasts), pill (`9999px`) for chips and tags. Tokens `--radius-control / --radius-input / --radius-card`; nothing else exists.
- **Spacing is a scale, not "some padding":** exactly seven steps — 4/8/12/16/24/32/48px (`--spacing-1/2/3/4/6/8/12`). The theme declares no other steps, so `p-5` or `gap-1.5` emit no CSS.
- **Depth — exactly three elevation levels, hairline borders:** L0 page (`--background`); L1 card (`--surface` + 1px `--border`, **no shadow**); L2 overlay (command palette, dialog, toast: `--surface` + hairline + the single `--shadow-overlay`). `--surface-2` is an inset well / hover tint, not a level.
- **No frosted glass anywhere.** Overlays sit on a flat `--color-scrim`; translucency and `backdrop-filter` are forbidden (glass already reads as 2023, and blur behind text costs legibility).

### 10.5 Motion budget (the "live and dynamic" spine — written, enforced)

- **Three duration tokens, used everywhere (v1.2):** `--duration-fast` 150ms (press, hover, colour, tab indicator), `--duration-base` 250ms (page/list entry, dialogs, toasts, tab slide), `--duration-slow` 400ms (progress-ring fill, counters, celebration). Looping indicators derive from the slow token (shimmer ×3, cursor ×2.5). Mirrored in `lib/motion.ts`; the guardrail test asserts parity. Consistency of timing is what makes the interface feel like one product.
- **Two easings only:** `--ease-out cubic-bezier(0.23, 1, 0.32, 1)` for entries and exits; `--ease-in-out cubic-bezier(0.77, 0, 0.175, 1)` for on-screen movement. Never `ease-in`.
- **Live components (the "dynamic" layer):** animated counters on tiles (`<AnimatedNumber>`), ring fill on mount (`<ProgressRing>`), sliding tab indicator (`<Tabs>`/`<LinkTabs>`), 40ms staggered rails capped at 8 items (`<Stagger>`), L2 toasts for server-action outcomes (`<ToastProvider>` + `setFlash`), layout-matching skeleton boundaries (`loading.tsx`) after 300ms.
- Presses scale to `0.97`; entries from `scale(0.95) + opacity 0`; animate only `transform` + `opacity`, vertical offsets only (RTL-neutral).
- Frequency framework: 100+×/day actions (nav, palette) get **no** animation; occasional (modals, toasts) standard; rare (course completion, badge, streak milestone) get the one delight moment — progress-ring fill + a single celebratory sweep.
- `prefers-reduced-motion`: keep opacity/color fades, remove positional motion.

### 10.6 Streaming-AI surface conventions (baseline, not optional)

- Token streaming into the DOM with a 2px blinking cursor (500ms) that disappears on completion; Stop and Regenerate controls.
- Loading tiers: 0–300ms nothing; 300ms–1s subtle inline spinner; 1s+ **skeletons that match the real layout** (never generic boxes, never spinners for content areas); >10s progress + status text. Pre-first-token gap gets a shimmer skeleton in the answer slot.
- Multi-step AI work (ingestion, report queries) renders **collapsible status rows** (queued → running → done/error), the ChatGPT/Claude tool-disclosure convention.
- **Citation chips** (the Perplexity pattern, our trust centerpiece): inline chips at claim ends — `[12:34]` for video, `[Policy §3.2]` for HR — hover/tap preview of the exact source text, tap to deep-link (seek / open section). A chip that doesn't preview *and* deep-link is decoration; both are required — and every chip is server-validated before render (FR-5.11/FR-8.6).
- Generative-UI kit, fixed components only (production-safe pattern; no free-form UI generation): QuizCard, FlashcardCard, ProgressCard, RecommendationCard, CitationChip, EscalationCard. The model *selects* components via structured output; React renders them.

### 10.7 Layout & navigation

- Learner (mobile-first): bottom tab bar — Home / Learn / Drill / Ask HR / Profile (each specced in §11). Desktop: left rail, same five.
- Admin/Manager (desktop-first responsive): left nav + **⌘K command palette** (cmdk via shadcn Command): jump to course/learner/report, quick actions. Palette opens instantly — no animation (frequency rule). Learners get search-first UI, not the palette. Managers switch between the manager shell and their own learner workspace via the switcher (§11.9a).
- **The bento rule (v1.2):** a tile earns its place only if it answers **one question at a glance** and links to where the answer lives; a tile that would need a scrollbar becomes a page. No internal vertical scroll regions anywhere — chat threads, transcripts and lists flow in the page with sticky composers/toolbars; data tables may scroll horizontally. Bento only where a summary mosaic is honest: the learner Home at-a-glance band, the admin overview, team status tiles, course-landing stats — never as the app shell; task flows stay linear.
- Progress rings (Apple Activity style, SVG stroke-dashoffset) for course and weekly-goal progress: card corners, profile header; ring fill animates only on completion events.

---

## 11. Screen-by-screen spec (build order within each milestone)

1. **Login & onboarding** — employee ID + password; "This is a shared device" checkbox (short session); one-tap Switch user; activation flow: ID + one-time code → password set screen → privacy notice acknowledgement (FR-13.1) → home. Language switcher on login.
2. **Learner Home ("For You")** — greeting; Continue-learning resume card (cover, progress ring, "12 min left"); Due-soon rail (compliance chips: `--warning-tint` DUE SOON / `--destructive-tint` OVERDUE, dark text); Daily-drill card (locked state before first completed lesson: "unlocks after your first lesson"); Recommended rail with reason lines. Caught-up state: celebrate the clear queue ("You're all caught up 🎉— explore the catalog") and pivot to Browse. No persistent chat input (FR-4.1).
3. **Learn tab** — two sections: *My learning* (enrolled courses + active paths, path detail view showing ordered courses with lock states per `complete_in_order`) and *Browse* (catalog with tag/language filters + search results). Search field at top; results group courses/lessons.
4. **Course page** (v1.5) — hero (cover, title, est. minutes, objectives as checklist); a progress ring with "3 of 5 lessons · 7 min left" beside the Start/Continue CTA; certificate download when earned; then **Course contents**: the module accordion per FR-2.7, each section summarising as `title · 3/5 · 12 min` with a Done chip, each lesson row showing its type icon, title, minutes, completion or lock, and the oral-check chip. An Expand all / Collapse finished pill appears once a section has folded itself away.
5. **Lesson viewers** — VIDEO per §7.4/FR-5.8 (player, Tutor panel with suggested-question chips, streaming answers with validated `[mm:ss]` chips, Transcript tab, "Explain simpler" / "Quiz me" quick actions). TEXT: article layout (65ch measure), sticky "Mark complete". PDF: in-app viewer with page nav + "Mark complete". All three carry prev/next lesson navigation, and a locked next lesson is named and marked rather than linked, so the footer never lands the learner on the gate screen. Every lesson type also carries the **course-contents navigator** (FR-2.7): a persistent 14rem rail from `xl` up, and the same outline behind one "Course contents · Lesson 4 of 12" disclosure below that. Lesson routes take the wider container so the rail never squeezes the video player's tutor column.
6. **Quiz runner** — pre-flight screen (attempts left, time limit ×user multiplier, pass mark, feedback mode); **integrity consent interstitial** when monitored (what's recorded, what's not — "no camera", why, consent CTA; per-platform truthful) → fullscreen gate where supported; one-question-at-a-time (when set) with progress dots; server-synced timer pill; autosave indicator ("Saved ✓"); **connection-lost banner** with local buffering and auto-resume; submit → result screen per feedback policy; wrong-answer "Review this part [4:12]" links; provisional-grade state ("pending confirmation") and appeal action on finalized AI grades.
7. **Daily drill** — full-screen card stack, one question per card, optional confidence toggle (Sure / Not sure), instant feedback, end-of-session summary (streak progress, points).
8. **Ask HR** — chat surface (answers on the AI surface, `--ai` accents); first-run AI-disclosure; citation chips → **Policy viewer (8a)**: document view scrolled to the cited section, with version + effective date banner; persistent "Talk to a person" affordance; escalation composer (consent note: "your name and this conversation will be shared with HR") → **learner ticket thread (8b)** with status and HR replies (notification on update); re-auth prompt before opening history on shared devices; history list.
9. **Profile & shell surfaces** — (9) Profile: progress rings, badges, certificates (PDF download), language & quiet-hours settings, privacy notice link. (9a) **Workspace switcher**: managers/admins toggle between admin/manager shell and their own learner view (persistent chip in the header). (9b) **Notification inbox**: bell icon in header (learner: on Home; admin/manager: in top bar), list with read states, deep links.
10. **Manager dashboard** — status tiles → filtered team table; "not reached directly" list from the weekly digest surfaced as a tile; learner drill-in (transcript, due items); Assign sheet (course/path + due date); Nudge action with rate limit ("Nudged 2 days ago").
11. **Admin: course builder** — outline editor (modules/lessons drag-sort **with up/down buttons**); lesson editors per type; YouTube URL intake with validation + ingestion status rows + transcript-source picker (manual upload / vendor); AI draft-cards review (accept/edit/discard per card — the accept-gate).
12. **Admin: people & rules** — users table + CSV import wizard (dry-run preview, error report); user detail (role, manager, groups, time multiplier, reset-code issuance); groups CRUD; enrollment-rules builder (criteria form + affected-user preview + due-rule) ; paths builder.
13. **Admin: question bank & review queues** — bank table with filters; AI-draft quiz review; grading review queue (attempt, AI scores + rationale + confidence, reason chip `AI fail / low confidence / borderline / appeal`, confirm/adjust).
14. **Admin: HR corpus console & tickets** — doc table (version, effective/superseded, review-due flags, demo badge); upload wizard with metadata; unanswered-questions queue; **ticket queue** (state, assignee, SLA age) + ticket detail with transcript and reply box; KPI dashboard (deflection, CSAT, re-contact, top gaps, per FR-8.12).
15. **Admin: reports** — report tabs, live filter bar, CSV export; **Ask Reports** NL box with structured-query disclosure row; AI cost panel (cost-per-active-user, per-route, from `ai_call_log`).
16. **Integrity review** — attempt timeline (severity-colored event stream on a time axis, informational events grey), decision actions with mandatory reason; voided attempts grant a fresh slot automatically.
17. **Oral check** (`/lesson/[id]` for INTERVIEW lessons, `/lesson/[id]/interview` after video/text lessons, v1.4: pass/fail, pass mark shown, Retake) — last result (if any) → consent card (what is captured, kept, seen; Test speaker) → live screen: voice orb (listening swell / speaking breathe), captions flowing in the page (learner plain, interviewer on the AI surface), sticky control bar (mute, type instead, elapsed, model chip, End early with confirm) → result: animated score, PASS / needs-review chip, per-question feedback on the AI surface, Back to course / Retake. Entry points: the lesson-complete card under the player, the course page chip, the profile list.
18. **Your assistant — live mode** (`/ask-hr/live`, v1.4: learner context, suggested prompts, demo tips, lesson chips) — fixed AI disclosure line → consent card → orb + captions with citation chips as policies are searched → "Talk to a person" (and the model's own escalation offer) open the same confirm dialog → ended state links "Continue in text". Entry points: the card on Ask HR and the 🎙 pill in the chat header.
19. **Admin: interview lesson settings** (course builder, v1.4) — "Add lesson → Interview (voice oral check)" with questions, pass mark, time box, scope, focus, require-pass; existing interview lessons carry an inline editor.

---

## 12. Technical architecture

- **12.1 Stack:** Next.js (App Router) + TypeScript, single repo; Tailwind v4 + shadcn/ui + Motion (Framer); Postgres 16 + pgvector; Drizzle ORM; **background jobs via a Postgres-backed queue (`FOR UPDATE SKIP LOCKED` worker loop) — the only queue in the MVP** (BullMQ/Redis is a documented swap behind the same `JobQueue` interface, not a second implementation); S3-compatible object storage for PDFs/certificates; auth per FR-1.4 (iron-session-style cookie sessions).
- **12.2 AI:** `@anthropic-ai/sdk` per §9.3; Voyage embeddings; SSE streaming route handlers.
- **12.3 Env & degradation:** `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `YOUTUBE_API_KEY` (Data API validation), `TRANSCRIPT_PROVIDER` + key (manual upload always works without one), `SMTP_URL` (absent → email channel off, in-app delivers), `DATABASE_URL`, `S3_*`, `DEMO_MODE`, `AI_MODEL`. Absent AI keys → AI surfaces render informative disabled states; the LMS core works with zero external keys except YouTube embeds (which need none).
- **12.4 Security:** role checks server-side on every query (no client-trusted scoping); login throttling + lockout per FR-1.4; TOTP for admins; idle timeouts + switch-user on shared devices; rate limits on AI routes (per-user and global daily token budgets, enforced via `ai_call_log`); append-only tables enforced by revoked UPDATE/DELETE; audit trails per §7.6/§7.7/§7.11; secrets never in client bundles; CSP that still permits the YouTube iframe.
- **12.5 Performance budget (Android mid-range, 3G-fast):** learner home LCP < 2.5s, route transitions < 300ms perceived (skeletons), JS budget for learner surface < 300KB gz initial; non-Latin font subsets load on demand.
- **12.6 Testing:** unit tests for the compliance state machine (FR-3.3 enum + precedence), enrollment-rule re-evaluation (profile change, rule change, no-dupe, history-preserved, hire-date guard), quiz scoring per type (FR-6.7 table), grading routing (AI-fail-always-human), citation validation (FR-5.11), RRF merge, coverage computation, retention purge job; integration test for an end-to-end learner completion; the AI gateway mocked with recorded fixtures; CI contrast check on §10.2 tokens; pseudo-RTL render check.

---

## 13. Seed & demo data (ship with the MVP; all behind `DEMO_MODE`)

- Demo org: UAE → 2 regions → 4 stores; groups: Cashier, Fresh Food, Pharmacy, Team Leader; ~30 seeded users across roles (the §4 personas among them).
- 4 courses with real, embeddable, caption-bearing YouTube videos (verify at seed time): Customer Service Basics; Food Safety Essentials; Fire & Emergency; POS & Cash Handling (TEXT/PDF lessons + quizzes). 1 learning path: "New Associate Onboarding". Food Safety certificate carries the "internal training record" disclaimer prominently (FR-3.5).
- Question banks per course (human-written seeds + AI drafts left in review state to demo the queue).
- The fictional **Demo Retail Co.** policy handbook per FR-8.3 (never real statutory figures).
- One auto-enrollment rule ("all Cashiers → POS course, due 14 days from enrollment") and one expiring-certificate loop staged to demo recert.
- A seeded Ask Reports example set; an integrity-review attempt with staged events (including an informational connection-loss and a `fullscreen_unavailable` event); a seeded HR ticket thread.

---

## 14. Build plan & acceptance criteria

**M0 — Foundation.** Repo scaffold, schema + migrations, auth (activation, reset, throttling, TOTP for admin, idle timeout/switch-user), org/roles, seed pipeline, design tokens (both themes) + app shell (tabs, nav, palette, workspace switcher, notification inbox shell), i18n plumbing + RTL-safe primitives, privacy-notice acknowledgement. *Accept:* login as each persona incl. activation flow and manager-issued reset; lockout triggers after 10 bad attempts; dark mode complete (no unstyled surface); pseudo-RTL renders unbroken; CI contrast check passes.

**M1 — LMS core loop.** Courses/modules/lessons (TEXT/PDF/QUIZ minimal), lesson viewers, paths, enrollments (manual + rules with re-evaluation), due dates, compliance states, notification catalog + email transport + inbox, certificates + recert loop, completion records, Learn tab. *Accept:* the classic-bug suite green (rule retrigger, no dupes, history preserved, hire-date guard); Farhan completes a course end-to-end; certificate PDF issues with disclaimer and an expiry re-enrolls him with due = expiry; an email-less learner's overdue item appears in their manager's digest and dashboard "not reached" tile (the certified reach path).

**M2 — Video + Tutor.** Videos entity + ingestion pipeline (manual-upload provider first, vendor second, status UI), chunking/embedding, player + coverage progress, Tutor with scoped hybrid retrieval, pinned streaming protocol, validated `[mm:ss]` chips that seek, suggested questions, threads, link-health job. *Accept:* SRT upload → READY with zero external transcript keys; paste-URL vendor path works and is labeled demo-only; a citation outside retrieved chunks is dropped and an all-invalid answer abstains; chips seek correctly; an Arabic question gets an Arabic answer with working chips (bidi-isolated); coverage gate blocks completion at 50% watched; kill the transcript key → graceful admin-facing failure.

**M3 — Assessment engine.** All 7 types + stimulus (tap alternatives on mobile), banks, draw-N snapshots, settings matrix incl. exam windows + time multiplier, server timing + autosave + offline resume, feedback policies, AI quiz drafts + review queue, AI rubric grading + routing (fail→human always) + appeal, daily drill + scheduler, points/badges/weekly streak. *Accept:* EXAM mode reveals answers only after `available_until` (or release action); a timed attempt survives a refresh and a 60s network drop with informational-only events; an AI-graded FAIL always lands in the human queue and a confident clear pass auto-finalizes; a provisional pass does not clear OVERDUE or issue a certificate; grading consistency eval across English + one non-English language shows no material scoring gap (publish the numbers); drill re-drills a "confidently wrong" answer sooner.

**M4 — Virtual HR Assistant.** Corpus console + versioned soft-replacement ingestion, filtered hybrid retrieval, citation-first chat with guardrails + abstention + escalation tickets (admin queue + learner thread), audit log + retention jobs, KPI dashboard, demo corpus. *Accept:* superseded version never cited but old answers still reconstruct; out-of-country/audience content never retrieved; "harassment" query routes straight to sympathetic human handoff; a Malayalam question gets the hedged path (not a full generated answer); golden-set eval (≥100 questions) runs with published accuracy + abstention-correctness numbers and a sign-off gate; deflection dashboard renders from seeded interactions; every citation opens the right section.

**M5 — Managers, reporting, integrity.** Manager dashboard + actions, 6 reports with live filters + CSV, Ask Reports NL queries, AI cost panel, integrity tier 1 (consent interstitial, events, timeline, reviewer flow, iOS fallback), admin polish (⌘K everywhere). *Accept:* NL query "who in Store 12 is overdue on Food Safety?" returns the filtered table + narration + disclosed structured query, scoped to the asker; a monitored attempt on a desktop logs fullscreen events while an iOS run logs `fullscreen_unavailable` and proceeds; reviewer voids → fresh attempt slot; cost panel shows per-route spend from `ai_call_log`.

**M6 — Hardening & delight.** Performance budget met, a11y pass (44px targets, drag alternatives, focus paths), reduced-motion pass, empty/error/cold states everywhere, retention purge job verified, DSR export/erase tool, the one celebration moment, README + deployment docs, demo script. Cut-first items only if time remains. *Accept:* Lighthouse a11y ≥ 95 on learner surfaces; purge job deletes a synthetic aged heartbeat/integrity row; DSR export returns a complete user JSON.

---

## 15. Success metrics & ROI instrumentation

**Baseline first (HR fills once, pre-launch — ROI has no "before" otherwise):** current completion rate for assigned training, current annual training-hours figure and how it's computed, current HR inquiry volume + channel mix (walk-ups/calls/email), admin hours/month spent on reporting. `[DISCOVERY]` — the platform stores these as the comparison anchor.

**Learner:** weekly active / eligible; assigned-training completion rate (target ≥60%; industry async baseline is single-digit-to-30%, AI-native vendors claim 75–94%); median time-to-complete; drill DAU and 4-week retention; streak retention.
**AI:** Tutor usage (% of video learners asking ≥1 question), citation click-through (`ui_events`), thumbs ratio; HR deflection / containment / re-contact / CSAT per FR-8.12; grading human-override rate (target <10% after tuning); AI-draft question acceptance rate; golden-set accuracy per language (published per M4).
**Cost (the ROI denominator):** cost-per-active-user and per-route from `ai_call_log`, on the admin dashboard — reviewed monthly against the deflection-side savings.
**Ops:** overdue rate trend; certificate lapse rate; report + NL-query usage; **training hours delivered** — defined as Σ watched seconds + timed assessment/drill time (so the KPI is computable and comparable to the client's current figure, whatever that turns out to be — see baseline).

---

## 16. Open questions for LuLu HR `[DISCOVERY]`

1. Scope entity: Lulu Retail Holdings (GCC, ~53k — *IAR 2024*) vs full LuLu Group (~65k, ~22 countries)? Spec defaults to Lulu Retail, UAE-first, **UAE-only legal envelope** until per-country reviews complete.
2. HRIS/payroll system of record for user provisioning — none publicly documented; CSV import assumed for MVP.
3. Policy corpus: which documents exist, in which languages, with a named owner per document? **Launch gate for the HR assistant beyond demo mode**, together with the DPAs and DPIA (FR-13.5).
4. Video strategy: approve the LuLu-owned YouTube channel (unlisted + embeddable uploads) as the production path; scraped/vendor transcripts remain demo-only. Which existing training videos exist to migrate?
5. **Proctoring sign-off:** confirm the reframe — MVP ships deterrence-and-review integrity monitoring (no camera), webcam tier is a legally-gated fast-follow, and supervised sittings cover truly high-stakes needs. If webcam-in-MVP is a hard requirement, counsel review + DPIA move up and timeline shifts.
6. Store-floor device policy: is breakroom BYOD confirmed? Kiosk/tablet availability back-of-house? Shared-device ratio (drives session-timeout defaults)?
7. Language priority order beyond English for UI packs and HR-assistant evals (spec assumes Arabic → Hindi → Urdu → Malayalam → Tagalog, mirroring MOHRE's service languages).
8. **Paid training time:** endorse the stance that required training happens in paid time (FR-13.6) and whether manager-scheduled training windows should be a fast-follow feature.
9. **Reach channel:** approve manager-mediated escalation as the MVP compliance-reach mechanism, and pick the fast-follow direct channel (WhatsApp Business API vs SMS — HR already holds phone numbers).
10. Regulatory certifications: which accredited certifications (food-handler/EFST-class, fire warden, first aid) must the platform *track* (external certificates with expiry — supported via `certificates.kind = external_tracked`) vs deliver?
11. Current-state baseline metrics per §15 (completion rate, training hours + computation method, HR inquiry volume, admin reporting hours).
12. Existing content inventory (SCORM packages? videos? PDFs?) — decides how much SCORM playback matters as fast-follow.

---

## Appendix A — Key research sources

Market/AI-native: Josh Bersin 2026 corporate-learning research; Workday–Sana GA announcement (Jul 2026); Docebo AgentHub/Enterprise Knowledge; Absorb Aura/Create AI; Sana Tutor help docs (UX mechanics); Uplimit agents (VentureBeat).
Feature baseline: Absorb/Docebo/TalentLMS/LearnUpon help centers; G2/Capterra review mining (reporting complaints).
Assessment/proctoring: Moodle/Canvas quiz reference models; Axonify frontline microlearning; LLM-grading literature (rubric-conditioned grading, confidence deferral, mid-range disagreement); Proctorio/Honorlock/Talview architectures; UAE PDPL (FDL 45/2021) & Cybercrime Law (FDL 34/2021) Art. 44; EU proctoring case law (Rb. Amsterdam 2020; Garante).
Video RAG: youtube-transcript-api docs; YouTube Data API & IFrame Player API references; YouTube Developer Policies; hosted transcript API pricing; pgvector hybrid-RRF patterns.
HR assistant: Leena AI, MeBeBot, Workday Illuminate, Visier Vee; confidence-aware RAG (Microsoft); Bedrock/NeMo guardrail patterns; deflection benchmark literature; MOHRE multilingual service set; UAE labour law (FDL 33/2021) summaries — **all legal and statutory content requires per-country counsel review before any production use; the demo corpus is fictional by design (FR-8.3).**
LuLu figures: Lulu Retail Holdings Integrated Annual Report 2024; FY2025 results press coverage; public group profiles — re-verify with the client.
Design: Linear/Geist token systems; Emil Kowalski motion canon; Perplexity citation pattern; shape-of-ai streaming patterns; Tailwind v4 OKLCH; Duolingo streak research + corporate-streak cautions.

*(Full URLs preserved in the research archive; representative links available on request.)*
