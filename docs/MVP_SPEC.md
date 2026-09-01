# LuLu Learn — AI-Native Corporate Training Platform

## Feature Requirements & Design Specification (MVP v1.0)

**Client:** LuLu Group International — HR
**Prepared:** September 2026
**Audience of this document:** the engineering agent (Claude Opus) that will build the MVP, and LuLu HR stakeholders reviewing scope.
**Status:** Ready to build. Sections marked `[DISCOVERY]` are questions for the client, not blockers — the MVP ships with the stated defaults.

---

## How to use this document (instructions to the builder)

1. This is the authoritative spec. Build in the milestone order of §14; each milestone has acceptance criteria.
2. Requirements are numbered (`FR-x.y`). Anything marked **MVP** is in scope for the first build. **Fast-follow** items must be *designed for* (schema, interfaces) but not built. **Deferred** items must not be built and must not leak complexity into the MVP.
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
| 3 | "AI native… chat regarding the content resources… use YouTube videos" | Chat-with-video with timestamp citations (§7.4). **Transcript acquisition is treated as the fragile core** and isolated behind a swappable provider interface | YouTube blocks cloud-server transcript fetching; the naive build works on a laptop and dies on first deploy. Also steering: LuLu should upload its own training videos to a LuLu-owned channel (unlisted + embeddable) — that converts the whole problem into a fully sanctioned API flow. |
| 4 | "Employers can ask doubt about company HR policy" | An **employee-facing** HR policy assistant (§7.7), strictly informational, citation-first, with human escalation | (Assuming "employers" meant "employees.") Keeping the assistant read-only/informational keeps it out of the high-risk regulatory tier that anything influencing employment decisions falls into, and is what makes HR sponsor it. |
| 5 | "Scope for proctored assessment" | A two-tier **integrity monitoring** design (§7.6): extension-free monitoring in MVP; webcam capture opt-in per assessment, **off by default** | UAE law is unusually strict: PDPL treats facial images as sensitive data, and Cybercrime Law Art. 44 criminalizes non-consensual image capture (AED 150k–500k fines). Web tech also cannot truly "lock down" a browser without extensions — honest framing is deterrence + human-reviewed flags, not prevention. |
| 6 | "UI reimagined… live and dynamic, latest design language" | A committed **editorial/humanist** design language with a written motion budget and streaming-native AI surfaces (§10–11) | "Latest design language" done wrong is a trend collage (dark neon + glass + bento). The AI-product canon (Claude, Perplexity, Sana) is warm, light-first, restrained — the right read for a 46-nationality workforce on shared and mobile devices. "Live and dynamic" is delivered through motion craft and streaming UX, not decoration. |

**One more steering point the brief didn't raise:** LuLu's workforce context decides success. Lulu Retail Holdings ≈ 53,000 employees from 46 nations across 267 stores in 6 GCC countries; ~85–90% deskless (assumption — flag to client); most have smartphones but **no corporate email and no desk**. The platform must therefore be mobile-first, employee-ID-authenticated, and multilingual (§8). A desktop-first, email-SSO design fails on day one.

`[DISCOVERY]` Confirm scope entity: LuLu Group International (private, ~65k staff, 22 countries) vs **Lulu Retail Holdings PLC** (listed, ~53k staff, 6 GCC countries). This spec defaults to the GCC retail workforce, UAE first.

---

## 3. Scope summary (MoSCoW)

### MVP (must)

- Employee-ID auth, 3 roles (Admin / Manager / Learner), org hierarchy + groups
- Courses (Course → Module → Lesson), typed lessons: **YouTube video, rich text, PDF, quiz**
- Learning paths (ordered course lists, complete-in-order flag)
- Auto-enrollment rules with re-evaluation semantics; relative due dates
- Compliance loop: due dates → reminder ladder → certificates with expiry → auto re-assignment
- Video ingestion pipeline (transcript → chunks → embeddings) + AI quiz drafts
- **In-player AI Tutor**: grounded chat with `[mm:ss]` citations that seek the player
- Assessment engine: 7 question types, banks, draw-N randomization, settings matrix, practice-vs-exam feedback policies, server-side timing
- AI grading of free-text with rubrics + confidence routing to human review queue
- Daily drill (spaced repetition) feed
- Integrity monitoring tier 1 (fullscreen, focus/visibility, paste-block, flag timeline + reviewer UI)
- Virtual HR Assistant: policy corpus console, citation-first RAG, guardrails, escalation tickets, KPI dashboard
- Manager dashboard, 6 core reports, CSV export, natural-language report queries
- Notifications (fixed catalog, email + in-app), gamification lite (points, badges, weekly streak)
- English UI shipped; i18n + full RTL architecture; AI surfaces answer in the user's language

### Fast-follow (design for, don't build)

- Webcam integrity tier (identity photo + periodic snapshots + consent flow) — schema and consent screens specced in §7.6
- WhatsApp delivery channel for HR assistant and nudges (the proven Gulf frontline channel)
- Arabic/Hindi/Malayalam/Urdu/Tagalog UI string packs; translated content variants
- AI role-play with rubric scoring (customer-service scenarios) — the chosen post-MVP differentiator
- LuLu-owned YouTube channel + official `captions.download` OAuth flow
- SCORM 1.2 playback; store-scoped leaderboards; ILT sessions; Elo-based adaptive difficulty

### Deferred (do not build)

- Skills ontology/inference engines; agent marketplaces; federated enterprise search
- AI video presenters / AI podcasts; e-commerce; multi-portal tenancy; approval workflows
- Custom RBAC role builders; custom notification rule builders; xAPI/cmi5/LRS
- Browser-extension lockdown, live human proctoring, face-matching/biometric verification, eye/gaze tracking (**never build gaze tracking** — EU DPAs advise against it and UAE PDPL risk is severe)
- Native mobile apps (the MVP is a responsive PWA)

---

## 4. Personas (grounded in workforce research)

1. **Farhan — Frontline associate** (cashier, Sharjah hypermarket). Indian expat, smartphone-only, English-as-second-language, 9-hour shifts. Uses the platform in the breakroom in 3–5 minute bursts. Cares about: finishing required training without friction, asking the HR bot about leave and gratuity in his own words.
2. **Meera — Fresh-food section worker** (bakery, Abu Dhabi). Lower digital literacy; safety-critical training (food hygiene). Needs video-first content, big tap targets, minimal reading.
3. **Joseph — Store department manager** (Dubai). Has a shared back-office desktop + personal phone. Assigns training, chases overdue completions, needs a glanceable team dashboard with nudge actions.
4. **Amina — HQ HR admin** (Abu Dhabi). Owns content, compliance reporting, and the HR policy corpus. Power user: command palette, natural-language report queries, quiz draft review queues.
5. **Saeed — Emirati management trainee.** National-talent development track (Emiratisation is a board-level KPI, 15.6% GCC nationals today). Uses learning paths; not an MVP-specific feature but paths must serve this narrative.

---

## 5. Feature baseline from the top platforms (what we adopt vs reject)

Distilled from Absorb, Docebo, TalentLMS, LearnUpon, and Cornerstone (vendor docs + G2/Capterra complaint mining):

**Adopt (MVP):** three-role model with *manager scoping done right* (the load-bearing part — not role count); Course→Module→Lesson with typed blocks; ordered learning paths; profile-driven auto-enrollment that re-evaluates on profile change (Absorb's retrigger semantics are the reference); the full compliance loop (due dates → reminders → expiring certificates → auto re-assignment); manager dashboard of drill-down status tiles; a six-report core with real-time filters and CSV export; a fixed notification catalog; points/badges scoped gamification.

**Reject as enterprise bloat:** multi-portal tenancy, e-commerce, enrollment approval workflows/waitlists, rewards shops/coins/contests, e-signature & 21 CFR Part 11 ceremony, embedded LRS, custom role builders, custom notification builders. (Immutable timestamped completion records — the cheap part of compliance that matters — ARE in scope.)

**Beat them where they're weakest — reporting.** Documented complaints: Cornerstone's reports are stale and non-interactive; TalentLMS has fixed report conditions, unreportable fields, and path-blind custom reports. Our counter: every entity/field queryable in real time (the schema in §9 is designed for it), saved views, scheduled email delivery, CSV export, and natural-language queries (§7.9).

---

## 6. Roles & permissions (FR-1)

- **FR-1.1 (MVP)** Roles: `ADMIN` (global), `MANAGER` (scoped), `LEARNER`. A user has exactly one role; managers are also learners for their own assigned training (the UI exposes a workspace switcher).
- **FR-1.2 (MVP)** Manager scope = the set of users whose `store` (or explicit `manager_id`) matches. Managers can: view team status, assign published courses/paths, send nudges, view team reports. Managers cannot: edit content, see other teams, or see HR-assistant conversation contents (only aggregate metrics).
- **FR-1.3 (MVP)** Org model: one hierarchy `Country → Region → Store` **plus** flat `Groups` (job families: cashier, butcher, pharmacist…). Both are targetable by enrollment rules, report filters, and (fast-follow) leaderboard scope. Do not model org as a single flat "department" string.
- **FR-1.4 (MVP)** Auth: employee ID + password, with forced password set on first login (admin-generated invite code or CSV import). No email required for learners; email optional for managers/admins. Session: secure HTTP-only cookies. `[DISCOVERY]` HRIS integration for user provisioning — MVP uses CSV import + manual admin CRUD.
- **FR-1.5 (MVP)** User profile fields: employee ID, name, preferred language, country, region, store, group(s), job title, hire date, manager. Language preference is user-set — never inferred from nationality (PDPL sensitivity).

---

## 7. Functional requirements by module

### 7.1 Courses & content (FR-2)

- **FR-2.1 (MVP)** Structure: `Course → Module → Lesson`. Lesson types: `VIDEO` (YouTube), `TEXT` (rich text), `PDF` (uploaded document, in-app viewer), `QUIZ`. Modules and lessons are ordered; per-course optional **sequential lock** (later modules gated on earlier completion).
- **FR-2.2 (MVP)** Course metadata: title, description, cover image, estimated minutes, language, tags, objectives (used to steer AI quiz generation), status (`DRAFT / PUBLISHED / ARCHIVED`).
- **FR-2.3 (MVP)** Learning paths: ordered course lists with `complete_in_order` flag. Path enrollment fans out to course enrollments.
- **FR-2.4 (MVP)** Lesson completion rules: TEXT/PDF = explicit "Mark complete" after open; VIDEO = watched-coverage threshold (§7.4) AND, if the module has a quiz, quiz pass; QUIZ = pass per its settings.
- **FR-2.5 (MVP)** Authoring is a simple structured builder (form-based), *plus* the AI assist: from an ingested video or uploaded document, generate a draft lesson summary and draft quiz (§7.5.8). All AI output lands as **draft cards the author accepts or discards individually** (the Sana "Edit Mode" accept-gate pattern). Never auto-publish.
- **FR-2.6 (Fast-follow)** SCORM 1.2 runtime player (unlocks off-the-shelf compliance libraries). Schema note: keep `Lesson.type` extensible.

### 7.2 Enrollment, due dates & compliance loop (FR-3)

- **FR-3.1 (MVP)** Manual enrollment (admin: anyone; manager: their team) and **auto-enrollment rules**: `IF profile matches (country/region/store/group/job title/hire-date window) THEN enroll in (course|path) with due date (fixed date | N days from enrollment | N days from hire)`.
- **FR-3.2 (MVP — the classic bug, get it right)** Rule evaluation semantics: rules apply to **existing and future** users; re-evaluate a user on profile change (a transfer to a new store/role swaps required training); re-evaluate all on rule change. Re-evaluation must be idempotent — never duplicate an active enrollment, never delete completion history. A user leaving a rule's scope keeps completed records; incomplete rule-created enrollments are withdrawn (soft state `WITHDRAWN`).
- **FR-3.3 (MVP)** Per-enrollment compliance state machine: `NOT_STARTED / IN_PROGRESS / COMPLETED` × due status `ON_TRACK / DUE_SOON / OVERDUE`; certificate adds `EXPIRING / EXPIRED`. Precompute a denormalized `compliance_status` for cheap reporting.
- **FR-3.4 (MVP)** Reminder ladder (per course, defaults): 7 / 3 / 1 days before due, on due date, then weekly while overdue. Managers get a weekly digest of team overdue items — **batched, never per-event** (notification spam trains 50,000 employees to ignore the platform).
- **FR-3.5 (MVP)** Certificates: templated PDF on completion (learner name, course, completion date, expiry date, unique verification ID), optional validity period. **Expiry closes the loop**: expiring certificate → auto re-enrollment N days before expiry → reminder ladder. A certificate that can't expire and re-enroll makes annual compliance a manual admin job — this loop is the point.
- **FR-3.6 (MVP)** Completion records are immutable and timestamped (append-only table), exportable — the audit substance without the 21 CFR ceremony.

### 7.3 Learner home & discovery (FR-4)

- **FR-4.1 (MVP)** Learner home is a **"For You" feed, not a catalog** (the pattern of every AI-native leader; LinkedIn Learning reports +35% completion vs generic playlists): greeting → "Continue learning" resume card → "Due soon" rail (compliance first) → daily drill card (§7.5.9) → AI-recommended rail with a one-line *reason* per card ("Because you completed Food Safety Level 1") → ask-anything input (opens the assistant, §7.7/§7.4 scoped chat).
- **FR-4.2 (MVP)** Recommendations v1 are honest and simple: rule-based (due-soon > in-progress > new-in-path > popular-in-group) with the reason line stating the actual rule. No fake "AI personalization" theater; the ranking function is swappable later.
- **FR-4.3 (MVP)** Search: full-text across courses/lessons (Postgres FTS). Catalog demoted to a secondary "Browse" page with tag/language filters.

### 7.4 Video learning & chat-with-content (FR-5) — the AI-native core

**Pipeline (MVP):**

- **FR-5.1** Admin pastes a YouTube URL → backend validates via YouTube Data API `videos.list?part=status,contentDetails` (1 quota unit): must be public and `status.embeddable == true`; store duration. Reject non-embeddable/private videos at admin time with a clear message.
- **FR-5.2** Transcript acquisition runs in a **queued background job** behind a `TranscriptProvider` interface with two implementations: (a) **hosted API (default)** — Supadata or equivalent (≈ $2–6 per 1,000 transcripts; for an MVP corpus of ≤2,000 videos the total cost is under $50 — far cheaper than fighting YouTube's IP blocks); (b) `youtube-transcript-api` behind rotating **residential** proxies (Webshare-class) as the self-hosted alternative. **Never fetch transcripts directly from cloud-server IPs — YouTube blocks all cloud-provider ranges; the naive build works in dev and dies on first deploy.** Prefer manually-created caption tracks over auto-generated (`is_generated` flag). Videos with no captions are rejected at admin time in MVP (no Whisper-over-yt-dlp for third-party videos — downloading audio violates YouTube ToS).
- **FR-5.3** Processing: merge caption snippets into chunks of **300–600 tokens with ~50-token overlap**, breaking at utterance boundaries, carrying `{video_id, start_sec, end_sec}` on every chunk. Never flatten to plain text — retrofitting timestamps requires full re-ingestion. Embed and store per §9.2 (pgvector, hybrid search).
- **FR-5.4** At ingestion, generate a **draft quiz** from the transcript via structured output: `{question, options[4], correct_index, explanation, source_start_sec, difficulty}` per item; land in the admin review queue (§7.5.8). Carrying `source_start_sec` enables "review this part" deep links on wrong answers — a differentiator that costs nothing.
- **FR-5.5** Ingestion status surfaced to admins: `PENDING / FETCHING / CHUNKING / EMBEDDING / READY / FAILED(reason)` with retry. A weekly link-health job re-checks embeddability/liveness of all published videos (curated YouTube corpora rot) and flags dead ones.

**Player & progress (MVP):**

- **FR-5.6** YouTube IFrame Player API with `enablejsapi=1` and `origin` set. Handle player errors 101/150 (embedding disabled after publish) with a graceful fallback card. Player viewport ≥ 200×200. **Never overlay any UI on the player surface** (YouTube ToS) — chat, citations, and controls sit beside/below it.
- **FR-5.7** Watch progress: poll `getCurrentTime()` every 5s while state == `PLAYING` **and** `document.visibilityState == 'visible'`; send heartbeats recording watched-second buckets server-side; completion = **unique coverage ≥ 90%** of duration (defeats both seek-to-end and idle-tab inflation). Detect seeks via |Δt| > poll×rate. Document the honest limits in code comments: heartbeats are client-reported and spoofable by a determined user (acceptable for training compliance; the quiz is the real gate).
- **FR-5.8** Lesson layout (desktop): video left (~60%), Tutor panel right; mobile: video top, tabbed Transcript/Tutor below. A clickable transcript (chunk list with timestamps) doubles as navigation.

**AI Tutor (MVP):**

- **FR-5.9** The Tutor is **persistent in the lesson player** (not buried behind a nav item), Sana-pattern: proactive **suggested questions** derived from the current chunk(s) at the playhead; free-form chat; **persistent threads** per user+course.
- **FR-5.10** Retrieval strictly scoped to the current video by default, with a visible toggle "This lesson ▾ / Whole course". Hybrid retrieval per §9.2, top ~10 chunks.
- **FR-5.11** Answers stream token-by-token and must carry **timestamp citations**: the model returns a structured citations array (`[{start_sec, end_sec, quote}]`); the UI renders them as `[12:34]` chips that call `player.seekTo()`, with hover/tap preview of the cited transcript text so learners can verify before seeking. **A citation chip that doesn't deep-link is decoration — every chip must seek.** Answers ground only in retrieved transcript chunks; when retrieval is empty/weak the Tutor says it can't find this in the lesson and offers the course-wide toggle.
- **FR-5.12** The Tutor answers in the language the learner writes in (Claude handles Arabic/Hindi/Malayalam/Urdu/Tagalog natively), while grounding in the (typically English) transcript. UI strings around it follow the app locale.
- **FR-5.13** "Explain this differently / simpler" quick action (one tap, ESL-friendly), and "Quiz me on this section" — generates 3 ephemeral practice questions from the current chunk (not persisted, not graded).

**Steering note (repeat, because it changes the risk profile):** curated third-party YouTube content is fine for the MVP demo, but the strategic path is LuLu uploading proprietary training videos to a LuLu-owned channel as unlisted+embeddable. That converts transcript access into the officially supported `captions.download` OAuth flow (owner-only endpoint), removes ToS ambiguity, and removes the scraping dependency. Fast-follow.

### 7.5 Assessment engine (FR-6)

**Question toolkit (MVP):**

- **FR-6.1** Seven question types: MCQ single, MCQ multi, true/false, fill-in-blank, matching, ordering, scenario free-text (AI-graded). Plus a **Stimulus** wrapper: a shared passage/image with multiple attached questions (covers scenario-based corporate assessment cheaply).
- **FR-6.2** Question banks: tagged pools reusable across courses. Question lifecycle: `DRAFT → APPROVED → RETIRED` (AI-generated questions always enter as `DRAFT`). Support CSV import.
- **FR-6.3** Quiz composition: fixed question list **or** draw-N-random from bank sections. Per-attempt snapshot: an `Attempt` stores the exact served items/order/choices immutably (auditability + fair review).
- **FR-6.4** Settings matrix per quiz (Moodle-reference): attempts limit (1..N/unlimited) + cooldown between attempts; grading method (highest — default / latest / first / average); pass threshold %; shuffle questions and/or choices with lockable positions ("All of the above" stays last); one-question-at-a-time toggle; optional no-backtracking.
- **FR-6.5** Timing: server-authoritative. Timed quizzes autosave answers every ~10s; auto-submit at expiry with a configurable grace window. Never trust the client clock; survive network drops (retail-floor Wi-Fi) by resuming an open attempt.
- **FR-6.6** Feedback policy is **per-quiz, two modes**: `PRACTICE` = immediate per-question feedback with explanations; `EXAM` = score now, correct answers revealed only after the exam window closes. This is not a nicety: a shift-based workforce takes the same test hours apart — immediate answer reveal leaks the key across shifts.
- **FR-6.7** Results: learner sees score, pass/fail, per-question review per feedback policy; wrong answers on video-sourced questions show a "Review this part" link (`source_start_sec`).

**AI assessment (MVP):**

- **FR-6.8** AI quiz generation (from video transcripts §7.4, or from TEXT/PDF lesson content): generated with stem + distractors + explanation + objective tag together; **always lands as DRAFT for admin/SME review — never auto-published.** Hallucinated distractors in compliance training are the fastest way to destroy trust. Review UI: accept / edit / discard per question, bulk accept.
- **FR-6.9** AI grading of scenario free-text: the question stores a rubric (criteria + points + model answer). At submission the model returns per-criterion scores, a written rationale, and a confidence value (structured output). **Routing rule:** low confidence *or* borderline-vs-pass-threshold results go to a human review queue; the learner sees instant provisional feedback, and the grade is marked provisional until confirmed when it bears on pass/fail. (Research: LLM-human agreement degrades precisely on mid-range answers — the queue must trigger on borderline scores, not only low confidence.) Log model version + prompt version per grade for appeals.
- **FR-6.10 (Fast-follow)** Adaptive difficulty via Elo ratings (two float columns + one update rule — no IRT calibration study). Do not build classical IRT.

**Daily drill — spaced repetition (MVP):**

- **FR-6.11** A distinct surface from formal exams (the Axonify pattern proven on retail frontline workforces): a 3–5 minute daily session of 5–8 questions drawn from the learner's completed/active courses by a Leitner/SM-2-lite scheduler over per-user per-question mastery state `{interval, ease, last_seen, streak}`. Optional per-answer confidence rating; "confidently wrong" answers get top re-drill priority.
- **FR-6.12** The drill feeds the home screen card ("Today's 3-minute drill"), awards points, and counts toward the weekly streak (§7.10). It is never proctored and never punitive.

### 7.6 Integrity monitoring & "proctored" assessments (FR-7)

Branding note: the product term is **"integrity monitoring"**, not "proctoring" — pure-web technology deters and detects; it cannot prevent. Spec language claiming prevention would fail audits.

**Tier 1 — extension-free monitoring (MVP), per-assessment flag `integrity_mode`:**

- **FR-7.1** On start: require fullscreen (Fullscreen API); exiting pauses the attempt with a "return to fullscreen" gate and logs an event.
- **FR-7.2** During: log timestamped events — `visibilitychange`/window blur (tab/app switch), fullscreen exit, copy/paste/cut attempts (suppressed in exam DOM), context-menu attempts, devtools heuristics, answer timing. Append-only `integrity_events` table per attempt.
- **FR-7.3** Reviewer UI: per-attempt timeline of events with severity tiers (red = e.g. >60s continuous focus loss; orange = brief blur; grey = informational). **Flags gate human review — never verdicts.** No automatic failing, ever: OS notifications, IME language switching (an Arabic/Hindi keyboard user!) and accessibility tools all produce false positives. A reviewer (admin) marks the attempt `CLEARED` or `VOIDED(reason)`; voiding re-opens an attempt.
- **FR-7.4** Learner-facing transparency: before a monitored assessment starts, a plain-language screen states exactly what is recorded (focus events, fullscreen exits — no camera, no screen capture) and why. Consent to proceed is logged.

**Tier 2 — webcam monitoring (fast-follow; build the schema + consent flow design now, no capture code in MVP):**

- **FR-7.5** Off by default; enabled per high-stakes assessment only. Pre-exam identity photo + periodic snapshots (every 15–30s) via `getUserMedia`; client-side face-presence check (MediaPipe class) so video never leaves the device unless flagged.
- **FR-7.6** Legal guardrails (UAE — non-negotiable): explicit **in-flow, per-session consent** naming what is captured, why, retention period, and who reviews (a buried policy clause is not enough — Cybercrime Law Art. 44 risk); a documented necessity justification + DPIA before enabling (PDPL treats facial images as sensitive data; consent alone is a weak basis in employment); **retention measured in days** — auto-delete snapshots ≤30 days after result finalization, immediately if unflagged; human review before any consequence; an in-person invigilated alternative for those who decline. **Never build:** eye/gaze tracking, face-matching against ID, room scans.

### 7.7 Virtual HR Assistant (FR-8)

An employee-facing, strictly **informational** policy Q&A assistant. Reference products: Leena AI (~70% deflection claims, WhatsApp-first for frontline), Workday Policy Agent, MeBeBot.

**Corpus & console (MVP):**

- **FR-8.1** HR admin console: upload policy documents (PDF/DOCX/MD), each with metadata `{title, country, audience (all/managers), language, version, effective_date, superseded_date, policy_owner, review_due}`. Uploading a new version **atomically replaces** the old version's chunks (delete-and-replace, never append) — stale chunks out-ranking new ones is the classic production failure. Expired/superseded content is **hard-filtered at query time**, never merely down-ranked.
- **FR-8.2** Ingestion: structure-aware parsing preserving headings/tables; recursive heading-based chunking at ~512 tokens with parent-section retrieval (child chunk for precision, parent section for answer context). Policy text is exception-dense — chunking must not sever a rule from its "unless/except/subject to" clauses; keep clause+exceptions together (chunk boundaries at heading level, not mid-clause).
- **FR-8.3** Seed corpus shipped with the MVP (marked DEMO): a UAE employee-handbook set covering the questions Gulf retail workers actually ask — working hours & Ramadan hours, overtime rates (125%/150%), annual leave (30 days), sick leave (15/30/45 structure), maternity (45+15), probation & notice, gratuity (21/30-day formula), WPS salary timing. Content must carry "DEMO — replace with LuLu's reviewed policies" banners. `[DISCOVERY]` The real corpus and a named policy owner per document are a launch prerequisite; per-country packs (KSA/Qatar/Oman/Kuwait/Bahrain) are fast-follow — **gratuity/leave rules diverge materially by country; a single "GCC answer" is legally wrong somewhere** (e.g. Bahrain replaced expat gratuity with SIO contributions in 2024).

**Answering (MVP):**

- **FR-8.4** Citation-first: every answer carries numbered citations `{policy title, section, version, effective date}`; tapping opens the policy viewer scrolled to the section. Framing rule enforced in the system prompt and an output check: answers say "Per [policy X]…" and end with a standing line that only HR makes final determinations. No promissory language ("you will be approved") — regex+model output rail.
- **FR-8.5** Retrieval filters (hard, metadata-level): country = user's country; audience ⊆ user's role; effective_date ≤ today < superseded_date. Permission-aware retrieval from day one — naive vector search leaking manager-only content is a headline failure mode.
- **FR-8.6** Three-layer confidence handling: (1) retrieval-score threshold — below it, don't answer; (2) grounding check — the model must cite retrieved chunks, and answers with no valid citation are replaced by the abstention response; (3) prompted abstention ("If the provided policy excerpts don't answer this, say so"). Abstention response always offers escalation.
- **FR-8.7** Escalation: one tap ("Ask HR directly") or automatic on abstention/guardrail — creates an HR ticket carrying the conversation transcript + retrieved sources (HR doesn't start cold). MVP tickets live in-app (admin queue with status/assignment); `[DISCOVERY]` ServiceNow/HRMS integration later.
- **FR-8.8** Guardrails: denied topics — legal/visa/immigration advice, medical questions, **grievance & harassment (immediate, sympathetic human routing — the bot must never handle these)**, salary negotiation; PII redaction on logs (passport numbers, salaries, IDs); prompt-injection screening on inputs; conversations of *other* employees never retrievable.
- **FR-8.9** Multilingual: users ask in any language/script — including Romanized Hindi/Malayalam ("Hinglish/Manglish", the documented Gulf reality); corpus is canonical English (+ official Arabic where provided); cross-lingual retrieval via multilingual embeddings (§9.2); answers generated in the user's language. Each launch language gets its own eval pass before being advertised.
- **FR-8.10** Transparency: the assistant self-identifies as AI on first use per session (a limited-risk-tier transparency duty worth meeting globally).

**Measurement (MVP):**

- **FR-8.11** Append-only audit log per exchange: pseudonymized user, language, query, redacted-PII flag, retrieved chunk IDs + policy versions, answer, citations, confidence, guardrail hits, escalation outcome, thumbs feedback. Target: any answer reconstructable (model version, prompt version, KB snapshot). Retention ≥ 6 months.
- **FR-8.12** KPI dashboard: deflection (resolved-without-human — abandonment is NOT deflection), containment, escalation rate, CSAT (thumbs), re-contact rate (same user, same topic, ≤7 days — the honesty check), top unanswered questions (the content-gap feed that drives corpus fixes). Benchmarks to display against: 20–40% typical, 65–75% good.
- **FR-8.13** Cross-border note (PDPL): chat content goes to a US-hosted LLM API — the privacy notice must disclose it, and a DPA with the provider is a launch prerequisite. PII redaction (FR-8.8) runs *before* the API call, not only before logging.

### 7.8 Notifications (FR-9)

- **FR-9.1 (MVP)** Fixed catalog (no rules builder): enrolled; due in 7/3/1; due today; overdue (weekly repeat); certificate expiring 30/7; quiz graded (provisional→final); HR ticket updated; manager weekly team digest. Channels: in-app inbox + email (email optional per user since learners may lack one). Design the dispatcher channel-pluggable — WhatsApp is the fast-follow channel (Darwinbox reports >90% frontline adoption on WhatsApp-class delivery in this region).
- **FR-9.2 (MVP)** Per-user quiet hours and language; digest batching rules hard-coded sane (managers: one weekly digest, not N emails).

### 7.9 Manager dashboard, reporting & NL queries (FR-10)

- **FR-10.1 (MVP)** Manager dashboard: status tiles that double as drill-down filters — Overdue, Due soon, In progress, Completed, Expiring certificates, Inactive 30d — team list with per-learner drill-in, inline actions: assign, nudge (rate-limited), export.
- **FR-10.2 (MVP)** Admin reports (all real-time, filterable, saved views, CSV/XLSX export, schedulable email delivery): (1) course completion; (2) compliance matrix (user × required training — the audit export); (3) learner transcript; (4) certificate expiry 30/60/90; (5) engagement (active users, inactive list, time spent); (6) quiz results with per-question analysis (discrimination: % correct per question — surfaces bad questions). ILT attendance deferred with ILT.
- **FR-10.3 (MVP)** **Ask Reports** (the AI-native reporting differentiator): a natural-language box on the reports page. Implementation: the model receives the report-schema catalog and emits a **typed query plan** (validated filter/group/aggregate JSON against a whitelisted schema — never raw SQL from the model); results render as the standard table + a one-paragraph narrated summary + "Refine" chips. Read-only, scoped to the asker's role/scope. Every NL answer shows the structured query it ran (trust + debuggability).

### 7.10 Gamification lite (FR-11)

- **FR-11.1 (MVP)** Points: lesson complete +10, quiz pass +20 (first pass only), daily drill +5, course complete +50. Badges: first course, 5 courses, 7-day streak-equivalent, perfect quiz, drill 30-day. Displayed on profile + home.
- **FR-11.2 (MVP)** **Weekly-goal streak, not daily**: "learned on 3 of 5 workdays this week", with one free repair/freeze per month. No guilt notifications; celebrate milestones (a rare-event completion animation is justified). Never surface streaks to managers or tie to review — that flips motivation to resentment.
- **FR-11.3 (Fast-follow)** Store-scoped leaderboard (opt-in per store; a 53,000-person global leaderboard demotivates and a leaderboard culture in HR contexts is a known risk — ship behind a flag, default off).

---

## 8. Localization & accessibility (FR-12)

- **FR-12.1 (MVP)** i18n architecture from day one: all UI strings externalized (`next-intl` or equivalent); locale switcher; **full RTL support** (logical CSS properties everywhere — `ms-`/`me-`, no hard `left/right`), verified with the Arabic pseudo-locale even before Arabic strings ship. Shipping languages: English (complete). Fast-follow string packs: Arabic, Hindi, Urdu, Malayalam, Tagalog (mirrors the UAE MOHRE service-language set — the best proxy for the Gulf retail workforce mix).
- **FR-12.2 (MVP)** AI surfaces (Tutor, HR assistant) are language-agnostic now: respond in the user's language including Romanized scripts.
- **FR-12.3 (MVP)** Accessibility: WCAG 2.2 AA — contrast ≥ 4.5:1 body text (the §10 palette is chosen to pass), visible focus rings, full keyboard paths for every flow including quizzes, `prefers-reduced-motion` honored (§10.5), captions inherent (YouTube), font-size respects user zoom to 200%.
- **FR-12.4 (MVP)** Low-bandwidth: Android-first performance budget (§12.5); images lazy+compressed; the app is a PWA (installable, app-shell cached; offline content **viewing** is deferred, but the shell must not white-screen offline).

---

## 9. Data model & AI retrieval architecture

### 9.1 Core schema (Postgres; names indicative)

```
users(id, employee_id UNIQ, name, role, store_id, manager_id?, group_ids[], job_title,
      hire_date, preferred_language, email?, password_hash, created_at)
org_units(id, type country|region|store, parent_id, name)
groups(id, name)                      -- job families
courses(id, title, description, cover_url, status, language, est_minutes, tags[],
        objectives[], sequential_lock bool, created_by, published_at)
modules(id, course_id, title, sort)
lessons(id, module_id, type VIDEO|TEXT|PDF|QUIZ, title, sort, payload jsonb)
   -- VIDEO payload: {youtube_id, duration_sec, ingestion_status, transcript_lang}
paths(id, title, complete_in_order bool) / path_courses(path_id, course_id, sort)
enrollment_rules(id, criteria jsonb, target_type, target_id, due_rule jsonb, active)
enrollments(id, user_id, course_id, source manual|rule|path|recert, due_at,
            status, compliance_status, completed_at?, withdrawn_at?)
lesson_progress(user_id, lesson_id, status, watched_buckets bitmap/bytea, updated_at)
completion_records(id, user_id, course_id, completed_at, score?, immutable append-only)
certificates(id, user_id, course_id, issued_at, expires_at?, serial UNIQ, pdf_url)
question_banks(id, name, tags[])
questions(id, bank_id, type, status DRAFT|APPROVED|RETIRED, body jsonb, rubric jsonb?,
          source jsonb? {video_id,start_sec}, created_by human|ai, version)
quizzes(id, lesson_id, settings jsonb, sections jsonb [{fixed ids | bank_id+pick_n}])
attempts(id, quiz_id, user_id, started_at, submitted_at?, served_items jsonb SNAPSHOT,
         answers jsonb, score?, passed?, grading_state, integrity_mode, state)
grading_reviews(id, attempt_id, question_id, ai_scores jsonb, ai_confidence,
                state PENDING|CONFIRMED|ADJUSTED, reviewer_id?, final_scores jsonb)
integrity_events(id, attempt_id, ts, kind, detail jsonb, severity)  -- append-only
drill_state(user_id, question_id, interval_days, ease, due_at, streak, confidence_hist)
video_chunks(id, video_id, start_sec, end_sec, text, embedding vector(1024),
             tsv tsvector GENERATED)   -- HNSW (cosine) + GIN indexes
policy_docs(id, title, country, audience, language, version, effective_date,
            superseded_date?, owner, review_due, file_url, status)
policy_chunks(id, doc_id, section_path, parent_text, text, embedding vector(1024), tsv)
hr_conversations(id, user_pseudo_id, language, started_at) / hr_messages(...)
hr_audit_log(append-only per FR-8.11) / hr_tickets(id, conversation_id, state, assignee?)
points_ledger(user_id, ts, kind, amount) / badges(user_id, badge, awarded_at)
notifications(id, user_id, kind, payload, channels[], read_at?, sent_at)
```

Design rule behind the schema: **every field an admin can see is a field a report can filter** — this is how we beat TalentLMS's "unreportable fields" complaint. No entity without a queryable path.

### 9.2 Retrieval (shared by Tutor + HR assistant)

- **pgvector** with HNSW (cosine) — the production default (no IVFFlat tuning) — plus generated `tsvector` with GIN.
- **Hybrid search**: vector KNN and full-text run in parallel, merged with Reciprocal Rank Fusion (`score = Σ 1/(60+rank)`). Hybrid is non-optional here: exact terms (policy codes, SKU/brand names, Arabic-English mixed queries) fail pure semantic search.
- **Embeddings: Voyage AI `voyage-3.5`** (1024-d, multilingual, Anthropic's recommended embeddings partner) via `VOYAGE_API_KEY`; provider-abstracted (`EmbeddingProvider` interface) with `BGE-M3` (self-hosted, 1024-d) as the documented swap for data-residency needs. Embedding cost is negligible (a 10-min video ≈ 2k tokens).
- Scoping filters applied in SQL (video_id / course_id for the Tutor; country/audience/effective-date for HR) — **before** ranking, not after.

### 9.3 AI gateway (one module, all features)

All model calls go through a single server-side `ai/` module (provider SDK: `@anthropic-ai/sdk`), so caching, logging, PII redaction, and cost controls live in one place.

- **Model:** `claude-opus-5` for all reasoning surfaces (Tutor, HR assistant, grading, quiz generation, Ask Reports). Use `output_config.effort` as the cost/depth lever per route — e.g. `low` for suggested-question generation, default for chat, `high` for rubric grading — rather than mixing models. (Model choice is config: `AI_MODEL` env var.)
- **Thinking:** adaptive (`thinking: {type: "adaptive"}`) — on Opus 5 this is the default; do not set `budget_tokens` (removed; 400 error).
- **Streaming:** all chat surfaces stream (SSE from a route handler; `client.messages.stream`). Non-chat structured tasks (quiz gen, grading) use non-streaming calls with `max_tokens` ≈ 16000.
- **Structured outputs:** quiz generation, grading, citations, and Ask Reports query plans use `output_config: {format: ...}` / `messages.parse` with zod schemas — never regex-parse free text for these.
- **Prompt caching:** stable system prompts first, `cache_control: {type: "ephemeral"}` breakpoints after the static prefix (system prompt + retrieved-corpus preamble); volatile content (user question, per-request context) last. Verify `usage.cache_read_input_tokens > 0` in dev.
- **Refusals:** check `stop_reason === "refusal"` and render a neutral "can't help with that here" state (HR assistant routes to escalation).
- **Logging:** every call logs route, model, token usage, latency, prompt version. PII redaction runs before the API call on HR-assistant routes (FR-8.13).

Example (Tutor route, indicative):

```ts
const stream = client.messages.stream({
  model: process.env.AI_MODEL ?? "claude-opus-5",
  max_tokens: 2048,
  system: [{ type: "text", text: TUTOR_SYSTEM, cache_control: { type: "ephemeral" } }],
  messages: [...thread, { role: "user", content: withRetrievedChunks(question, chunks) }],
});
```

---

## 10. Design language ("Reimagined, live and dynamic" — made concrete)

### 10.1 Direction: committed editorial/humanist

2026 product design has split into two shipping languages: techno-futurist (dark-first, neon accent — Linear, Vercel, Raycast) and **editorial/humanist** (warm paper neutrals, serif accents, generous whitespace — Claude, Perplexity, Notion-adjacent, Sana). AI-forward learning products have converged on the second because it reads human and trustworthy. **This product commits to editorial/humanist, light-first.** A workforce LMS on shared/retail-floor and mobile devices needs light-first with strong contrast; dark mode ships as a complete token set + toggle, not the identity. Mixing both languages (dark hero + cream cards + neon chips) is the trend-collage failure — do not.

Restraint IS the design language (the Linear lesson): one accent, one type pairing, exactly three radii, four surface levels, a closed token vocabulary.

### 10.2 Color tokens (OKLCH, CSS variables, light + dark sets)

Tailwind v4 + shadcn/ui; all colors as OKLCH custom properties on `:root` and `.dark`.

```
--background:      oklch(0.985 0.004 85)   /* warm paper */
--surface:         oklch(1 0 0)            /* card */
--surface-2:       oklch(0.97 0.004 85)    /* inset / hover */
--border:          oklch(0.922 0.006 85)
--foreground:      oklch(0.185 0.01 85)    /* near-black warm */
--muted-foreground:oklch(0.45 0.012 85)
--primary:         oklch(0.52 0.13 155)    /* LuLu-adjacent deep green — accent as punctuation */
--primary-fg:      oklch(0.985 0 0)
--accent-warm:     oklch(0.72 0.15 60)     /* amber — streaks/celebration only */
--destructive:     oklch(0.55 0.19 25)
--success:         oklch(0.55 0.12 155)
--warning:         oklch(0.72 0.13 75)
--ai:              oklch(0.55 0.09 300)    /* muted violet — reserved EXCLUSIVELY for AI surfaces */
```

Rules: neutrals carry the UI; `--primary` appears only on primary actions, active states, progress; `--ai` marks every AI-generated element (tutor bubbles, citation chips, draft cards) so users always know what the machine wrote — an honesty affordance, not decoration. Dark set mirrors with lifted warm grays (`--background: oklch(0.16 0.008 85)` etc.); body text contrast ≥ 4.5:1 in both.

### 10.3 Typography

- **UI:** Inter Variable, `font-feature-settings: 'cv01', 'ss03', 'zero'`; body 16px/1.5; weights 400/500/600 only; headings tracking −1%.
- **Display/AI voice:** one serif — Source Serif 4 Variable — reserved for the AI tutor/assistant answer text and page-level display headings (the "serif renaissance" convention that makes AI feel human). Never mix serif into buttons/labels/tables.
- Arabic fast-follow: pair with IBM Plex Sans Arabic (UI) / Noto Naskh (reading); establish the font stack now.

### 10.4 Shape & space

- Radii — exactly three + pill: `8px` (controls), `12px` (cards), `20px` (sheets/modals), `9999px` (pills/chips).
- Spacing on a 4px base; ladder: 4/8/12/16/24/32/48/64.
- Four surface levels max (background → surface → surface-2 → overlay). Shadows minimal: `0 1px 2px oklch(0 0 0 / 0.06)` at rest, one elevated tier for overlays.
- Glass (`backdrop-filter: blur`) allowed **only** on transient overlays (sheet headers, command palette scrim) — never behind body text (Apple shipped a Liquid Glass legibility rollback within four months; learn from it).

### 10.5 Motion budget (the "live and dynamic" spine — written, enforced)

- Durations: press feedback 120ms; tooltips 150ms; dropdowns 200ms; sheets/modals 240–400ms. **Hard rule: <300ms for everyday UI. Never `ease-in`.**
- Easings: entries `cubic-bezier(0.23, 1, 0.32, 1)`; on-screen movement `cubic-bezier(0.77, 0, 0.175, 1)`; drawers `cubic-bezier(0.32, 0.72, 0, 1)`.
- Springs (Motion/Framer): `{type:'spring', duration:0.5, bounce:0.2}` — sheets and celebration moments only.
- Presses scale to `0.97`; entries from `scale(0.95) + opacity 0`; list/card rails stagger 40ms; animate only `transform` + `opacity`.
- Frequency framework: 100+×/day actions (nav, palette) get **no** animation; occasional (modals, toasts) standard; rare (course completion, badge, streak milestone) get the one delight moment — progress-ring fill + a single confetti-free celebratory sweep.
- `prefers-reduced-motion`: keep opacity/color fades, remove positional motion.

### 10.6 Streaming-AI surface conventions (baseline, not optional)

- Token streaming into the DOM with a 2px blinking cursor (500ms) that disappears on completion; Stop and Regenerate controls.
- Loading tiers: 0–300ms nothing; 300ms–1s subtle inline spinner; 1s+ **skeletons that match the real layout** (never generic boxes, never spinners for content areas); >10s progress + status text. Pre-first-token gap gets a shimmer skeleton in the answer slot.
- Multi-step AI work (ingestion, report queries) renders **collapsible status rows** (queued → running → done/error), the ChatGPT/Claude tool-disclosure convention.
- **Citation chips** (the Perplexity pattern, our trust centerpiece): inline chips at claim ends — `[12:34]` for video, `[Policy §3.2]` for HR — hover/tap preview of the exact source text, tap to deep-link (seek / open section). A chip that doesn't preview *and* deep-link is decoration; both are required.
- Generative-UI kit, fixed components only (production-safe pattern; no free-form UI generation): QuizCard, FlashcardCard, ProgressCard, RecommendationCard, CitationChip, EscalationCard. The model *selects* components via tool/structured output; React renders them.

### 10.7 Layout & navigation

- Learner (mobile-first): bottom tab bar — Home / Learn / Drill / Ask HR / Profile. Desktop: left rail, same five.
- Admin/Manager (desktop-first responsive): left nav + **⌘K command palette** (cmdk via shadcn Command): jump to course/learner/report, quick actions. Palette opens instantly — no animation (frequency rule). Learners get search-first UI, not the palette.
- Bento grids only where a summary mosaic is honest (admin overview, course landing stats) — never as the app shell; task flows stay linear.
- Progress rings (Apple Activity style, SVG stroke-dashoffset) for course and weekly-goal progress: card corners, profile header; ring fill animates only on completion events.

---

## 11. Screen-by-screen spec (build order within each milestone)

1. **Login** — employee ID + password; large inputs; language switcher; no marketing chrome.
2. **Learner Home ("For You")** — greeting with first name; Continue-learning resume card (cover, progress ring, "12 min left"); Due-soon rail (compliance chips: amber DUE SOON / red OVERDUE); Daily-drill card ("3 minutes — beat yesterday"); Recommended rail with reason lines; persistent bottom "Ask anything" input → routes to Tutor (if inside a course context) or HR assistant picker.
3. **Course page** — hero (cover, title, est. minutes, objectives as checklist), module accordion with per-lesson status icons, sticky Start/Continue CTA, certificate state if applicable.
4. **Video lesson player** — per FR-5.8: player (never overlaid), beneath/beside it the Tutor panel with suggested-question chips, thread history, streaming answers with `[mm:ss]` chips; Transcript tab (clickable chunks); "Explain simpler" and "Quiz me on this section" quick actions; completion state driven by coverage + quiz.
5. **Quiz runner** — one-question-at-a-time (when set): progress dots, server-synced timer pill, autosave indicator ("Saved ✓"), integrity banner when monitored (fullscreen gate), submit → result screen per feedback policy, wrong-answer "Review this part [4:12]" links.
6. **Daily drill** — full-screen card stack, one question per card, optional confidence toggle (Sure / Not sure), instant feedback, end-of-session summary (streak progress, points).
7. **Ask HR** — chat surface (serif answer text, `--ai` accents); first-run AI-disclosure note; citation chips to policy sections; persistent "Talk to a person" affordance; escalation composer prefilled with transcript consent note; history list.
8. **Profile** — progress rings (weekly goal, active path), badges, certificates (download PDF), language & quiet hours settings.
9. **Manager dashboard** — status tiles → filtered team table; learner drill-in (transcript, due items); Assign sheet (course/path + due date); Nudge action with rate limit ("Nudged 2 days ago").
10. **Admin: course builder** — outline editor (modules/lessons drag-sort); lesson editors per type; YouTube URL intake with validation + ingestion status rows; AI draft-cards review (accept/edit/discard per card — the accept-gate).
11. **Admin: question bank & review queues** — bank table with filters; AI-draft quiz review; grading review queue (attempt, AI scores + rationale + confidence, confirm/adjust).
12. **Admin: HR corpus console** — doc table (version, effective/superseded, review-due flags); upload wizard with metadata; unanswered-questions queue; KPI dashboard (deflection, CSAT, re-contact, top gaps).
13. **Admin: reports** — report tabs, live filter bar, saved views, export/schedule; **Ask Reports** NL box with structured-query disclosure row.
14. **Integrity review** — attempt timeline (severity-colored event stream on a time axis), decision actions with mandatory reason.

---

## 12. Technical architecture

- **12.1 Stack:** Next.js (App Router) + TypeScript, single repo; Tailwind v4 + shadcn/ui + Motion (Framer); Postgres 16 + pgvector; Drizzle ORM; BullMQ + Redis for background jobs (ingestion, notifications, link-health, recert sweep) — fallback to a DB-backed queue if Redis is unavailable in the target environment; S3-compatible object storage for PDFs/certificates; Auth: iron-session or NextAuth credentials-provider on employee ID.
- **12.2 AI:** `@anthropic-ai/sdk` per §9.3; Voyage embeddings; SSE streaming route handlers.
- **12.3 Env & degradation:** `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `YOUTUBE_API_KEY` (Data API validation), `TRANSCRIPT_PROVIDER` + key, `DATABASE_URL`, `REDIS_URL`, `S3_*`. Absent AI keys → AI surfaces render informative disabled states; absent transcript key → admin sees "ingestion needs configuration"; the LMS core works with zero external keys except YouTube embeds (which need none).
- **12.4 Security:** role checks server-side on every query (no client-trusted scoping); rate limits on AI routes (per-user + global budget); append-only tables enforced by revoked UPDATE/DELETE; audit trails per §7.6/§7.7; secrets never in client bundles; CSP that still permits the YouTube iframe.
- **12.5 Performance budget (Android mid-range, 3G-fast):** learner home LCP < 2.5s, route transitions < 300ms perceived (skeletons), JS budget for learner surface < 300KB gz initial; PWA installable with cached shell.
- **12.6 Testing:** unit tests for the compliance state machine, enrollment-rule re-evaluation (the classic-bug cases: profile change, rule change, no-dupe, history-preserved), quiz scoring per type, RRF merge, coverage computation; integration test for an end-to-end learner completion; the AI gateway mocked in tests with recorded fixtures.

---

## 13. Seed & demo data (ship with the MVP)

- Demo org: UAE → 2 regions → 4 stores; groups: Cashier, Fresh Food, Pharmacy, Team Leader; ~30 seeded users across roles (Farhan/Meera/Joseph/Amina/Saeed among them).
- 4 courses with real, embeddable, caption-bearing YouTube videos (verify at seed time): Customer Service Basics; Food Safety Essentials; Fire & Emergency; POS & Cash Handling (TEXT/PDF lessons + quizzes). 1 learning path: "New Associate Onboarding".
- Question banks per course (human-written seeds + AI drafts left in review state to demo the queue).
- DEMO UAE policy corpus per FR-8.3 with visible DEMO banners.
- One auto-enrollment rule ("all Cashiers → POS course, due 14 days from enrollment") and one expiring-certificate loop staged to demo recert.
- A seeded "Ask Reports" example set and an integrity-review attempt with staged events.

---

## 14. Build plan & acceptance criteria

**M0 — Foundation.** Repo scaffold, schema + migrations, auth, org/roles, seed pipeline, design tokens + app shell (tabs, nav, palette), i18n plumbing + RTL-safe layout primitives. *Accept:* login as each persona; navigate empty states; toggle dark mode; pseudo-RTL renders unbroken.

**M1 — LMS core loop.** Courses/modules/lessons (TEXT/PDF/QUIZ minimal), paths, enrollments (manual + rules with re-evaluation), due dates, compliance states, notifications catalog, certificates + recert loop, completion records. *Accept:* the classic-bug test suite green (rule retrigger, no dupes, history preserved); Farhan completes a course end-to-end; certificate PDF issues and an expiry re-enrolls him.

**M2 — Video + Tutor.** Ingestion pipeline (provider interface + status UI), chunking/embedding, player + coverage progress, Tutor with scoped hybrid retrieval, streaming, `[mm:ss]` citation chips that seek, suggested questions, threads. *Accept:* paste a URL → READY; chat answers cite and seek correctly; kill the transcript key → graceful admin-facing failure; coverage gate blocks completion at 50% watched.

**M3 — Assessment engine.** All 7 types + stimulus, banks, draw-N snapshots, settings matrix, server timing + autosave, feedback policies, AI quiz drafts + review queue, AI rubric grading + confidence routing + review queue, daily drill + scheduler, points/badges/weekly streak. *Accept:* exam mode leaks no answers before window close; timed attempt survives a refresh; a borderline free-text answer lands in the human queue; drill schedules re-drills for a "confidently wrong" answer.

**M4 — Virtual HR Assistant.** Corpus console + versioned ingestion, filtered hybrid retrieval, citation-first chat with guardrails + abstention + escalation tickets, audit log, KPI dashboard, seeded corpus. *Accept:* expired policy version never cited; out-of-country content never retrieved; "harassment" query routes straight to sympathetic human handoff; deflection dashboard renders from real seeded interactions; every answer's citations open the right section.

**M5 — Managers, reporting, integrity.** Manager dashboard + actions, 6 reports with saved/scheduled views + export, Ask Reports NL queries, integrity tier 1 (events, timeline, reviewer flow), admin polish (⌘K everywhere). *Accept:* NL query "who in Store 12 is overdue on Food Safety?" returns the filtered table + narration + disclosed structured query; a monitored attempt's tab-switches appear on the timeline; reviewer voids and the attempt reopens.

**M6 — Hardening & delight.** Performance budget met, a11y pass, reduced-motion pass, empty/error states everywhere, the one celebration moment, README + deployment docs, demo script.

---

## 15. Success metrics (instrument from day one)

Learner: weekly active / eligible; course completion rate (industry async baseline is single-digit-to-30%; AI-native vendors claim 75–94% — target ≥60% on assigned compliance, ≥40% on recommended); median time-to-complete assigned training; drill DAU and 4-week retention; streak retention.
AI: Tutor usage (% of video learners who ask ≥1 question), citation click-through, thumbs ratio; HR deflection / containment / re-contact / CSAT per FR-8.12; grading human-override rate (target <10% after tuning); AI-draft question acceptance rate.
Ops: overdue rate trend; certificate lapse rate; report/NL-query usage; training hours delivered (LuLu already measures 1.2M+ hours/year — the platform must reproduce this KPI to be credible to the client).

---

## 16. Open questions for LuLu HR `[DISCOVERY]`

1. Scope entity: Lulu Retail Holdings (GCC, ~53k) vs full LuLu Group (~65k, 22 countries)? (Spec defaults to Lulu Retail, UAE-first.)
2. HRIS/payroll system of record for user provisioning — none publicly documented; CSV import assumed for MVP.
3. Policy corpus: which documents exist today, in which languages, and who is the named owner per document? (Launch prerequisite for the HR assistant beyond demo mode.)
4. Video strategy: appetite for a LuLu-owned YouTube channel (unlisted uploads) vs curated third-party content? (Strongly recommended: owned channel.)
5. Proctoring appetite & legal review: which assessments genuinely need webcam monitoring? DPIA + counsel sign-off required before tier 2 is enabled.
6. Store-floor device policy: is breakroom BYOD confirmed? Any kiosk/tablet back-of-house availability?
7. Language priority order beyond English for UI packs (spec assumes Arabic → Hindi → Urdu → Malayalam → Tagalog).
8. Existing training content inventory (SCORM packages? videos? PDFs?) — decides how much SCORM playback matters as fast-follow.

---

## Appendix A — Key research sources

Market/AI-native: Josh Bersin 2026 corporate-learning research; Workday-Sana GA announcement (Jul 2026); Docebo AgentHub/Enterprise Knowledge; Absorb Aura/Create AI; Sana Tutor help docs (UX mechanics); Uplimit agents (VentureBeat).
Feature baseline: Absorb/Docebo/TalentLMS/LearnUpon help centers; G2/Capterra review mining (reporting complaints).
Assessment/proctoring: Moodle/Canvas quiz reference models; Axonify frontline microlearning; LLM-grading literature (rubric-conditioned grading, confidence deferral); Proctorio/Honorlock/Talview architectures; UAE PDPL (FDL 45/2021) & Cybercrime Law (FDL 34/2021) Art. 44; EU proctoring case law (Rb. Amsterdam 2020; Garante).
Video RAG: youtube-transcript-api docs; YouTube Data API & IFrame Player API references; YouTube Developer Policies; hosted transcript API pricing (Supadata et al.); pgvector hybrid-RRF patterns.
HR assistant: Leena AI, MeBeBot, Workday Illuminate, Visier Vee; confidence-aware RAG (Microsoft); Bedrock/NeMo guardrail patterns; deflection benchmark literature; MOHRE multilingual service set; UAE labour law (FDL 33/2021) summaries — **all legal content requires per-country counsel review before production use.**
Design: Linear/Geist token systems; Emil Kowalski motion canon; Perplexity citation pattern; shape-of-ai streaming patterns; Tailwind v4 OKLCH; Duolingo streak research + corporate-streak cautions.

*(Full URLs preserved in the research archive; representative links available on request.)*
