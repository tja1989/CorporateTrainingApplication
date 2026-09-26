# welearn — AI-Native Corporate Training Platform (MVP)

A mobile-first learning platform for a retail workforce where every piece of content can be **talked to**, every lesson is assessed, and every employee has a citation-grounded **HR assistant** in their pocket.

Built to the spec in [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md) (feature requirements, AI architecture, design language, data model, milestones M0–M6 — all implemented). Presenting it? Follow [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

## What's inside

- **LMS core** — courses → modules → typed lessons (YouTube video, text, PDF, quiz, voice oral check) presented as a **collapsible course outline** — sections fold away as you finish them, each row drawn with its own type icon, derived length and lock state, and the same outline follows you into every lesson as a contents rail — learning paths with in-order locking, auto-enrollment rules with idempotent re-evaluation, the full compliance loop (relative due dates → reminder ladder → certificate PDFs → expiry-driven re-certification), immutable completion records.
- **Chat-with-video Tutor** — transcript ingestion (lawful manual SRT/VTT path by default) → timestamped chunks → hybrid pgvector+FTS retrieval (RRF) → streamed answers whose `[mm:ss]` citation chips are **server-validated** and seek the player. Watch progress = unique watched-second coverage (90% gate).
- **Assessment engine** — 7 question types + stimulus, question banks with draw-N snapshots, exam windows, cooldowns, per-user time-multiplier accommodations, server-authoritative timing with offline buffering, PRACTICE vs EXAM feedback policies (answers sealed until window close), tier-1 integrity monitoring (consent-first, flags gate *human* review, iOS fallback), AI-drafted questions that **never publish without approval**, and employment-safe AI rubric grading — every AI *fail* is human-reviewed; only confident clear passes auto-finalize; learners can appeal.
- **Daily drill** — SM-2-lite spaced repetition with confidence ratings ("confidently wrong" re-drills first). Optional, never counts toward required training.
- **Virtual HR assistant** — citation-first RAG over versioned policy docs (superseded versions are hard-filtered but soft-retained for audit reconstructability), country/audience permission filters, deterministic guardrails (grievance → sympathetic human routing; legal/visa/medical denials; injection screening; no-promises output rail), escalation tickets with consented transcripts, pseudonymized audit log, deflection/CSAT/content-gap KPIs.
- **Managers & reporting** — team dashboard with drill-down tiles and not-reached-directly surfacing, assign/nudge, six live reports with CSV export, and **Ask Reports**: natural-language questions compiled to typed, whitelist-validated query plans (never model-written SQL) with the executed plan disclosed.
- **Live voice (Gemini Live)** — realtime voice on the Gemini Live API via one-use **ephemeral tokens** (the browser talks to Google directly; the key never leaves the server; prompt and tools are locked into the token). **Interview lessons**: admins add an oral check to any course and configure questions, pass mark, time box, scope and whether passing is required; the AI interviewer asks, listens and awards **pass or fail** on a fixed rubric — a pass completes the lesson, fails go to a human queue that can overturn. **Your assistant**: a spoken agent that answers HR policy questions, questions about the learner's own courses, and "what's due for me", speaking only what its server-side tools return, with citations and confirmed escalation. Consent per session, transcript stored, audio never.
- **Platform-wide data protection** — privacy notice consent at first login, PII redaction before every AI call, retention maximums enforced by a purge job, DSR export/erasure tooling, AI cost telemetry (cost per active user / per route).

## Quick start

```bash
# 1. Postgres 16 with pgvector, e.g.:
#    CREATE USER lulu WITH PASSWORD 'lulu' CREATEDB;
#    CREATE DATABASE lulu_learn OWNER lulu;
#    CREATE EXTENSION vector;   (in lulu_learn)
cp .env.example .env           # set DATABASE_URL + SESSION_SECRET
npm install
npm run db:push                # create schema
psql "$DATABASE_URL" -f scripts/db-extras.sql   # ANN + FTS indexes, partial-unique constraint
npm run seed                   # demo org, users, courses, videos, quizzes, HR corpus
npm run dev                    # http://localhost:3000
```

**Demo credentials** (password `demo1234`, printed again by `npm run seed`):

| Role | Employee ID | Notes |
|---|---|---|
| Admin | `AE90001` | Amina — TOTP setup forced on first login |
| Manager | `AE20001` | Joseph — team dashboard, digests, reset codes |
| Learner | `AE10023` | Farhan — onboarding path, no email (manager-mediated reach) |
| Learner | `AE10024` | Meera — Food Safety due soon; staged AI-graded answer in the review queue |
| Learner | `AE10026` | Priya — certificate expiring → recert loop staged |

Background jobs: `npm run worker` (queue) and `npm run sweep` (nightly compliance/reminders/recert/purge — run it from cron in production). Tests: `npm test` (117 tests over the state machines, scoring, routing, retrieval, Live model resolution, the nav rail's layout invariants, HR guardrails, and the design-system guardrails — closed spacing/weight/radius vocabulary, no typed glyph icons, plus WCAG contrast on every colour token in both themes).

## AI configuration & honest degradation

| Env var | Powers | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` (+`AI_MODEL`, default `claude-opus-5`) | Tutor, HR assistant, AI grading, quiz generation, Ask Reports planning | Deterministic **offline demo mode**: extractive grounded answers labeled "offline demo", keyword report planner, overlap-heuristic grading at 0.5 confidence (routes to human review) |
| `VOYAGE_API_KEY` | `voyage-3.5` embeddings (1024-d, multilingual) | Hashed-bag-of-words lexical embeddings — hybrid retrieval still works, FTS carries double weight |
| `YOUTUBE_API_KEY` | Embed/privacy validation at ingest + weekly link health | Validation skipped; player errors handled gracefully at view time |
| `SUPADATA_API_KEY` | Vendor transcript fetch (**demo-only**; scraping shifts ToS risk, it doesn't remove it) | Manual SRT/VTT upload — the lawful default; production path is a company-owned channel + official captions API |
| `SMTP_URL` | Email channel (`console` logs in dev) | In-app inbox still delivers everything; manager digests remain the certified reach path |
| `GEMINI_API_KEY` (+`GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE`, `GEMINI_LIVE_LANGUAGE`) | **Voice**: the oral check after a lesson and the HR assistant's live mode, on the Gemini Live API through one-use ephemeral tokens | Both screens run as a **typed offline demo** with the same policy tools and the same offline grader — labeled, nothing crashes |

`GEMINI_LIVE_LANGUAGE` (default `en-US`) pins the language a spoken session is conducted in — it becomes the Live API's transcription hint. Left to auto-detect, accented English is regularly transcribed into another language mid-answer. `GEMINI_LIVE_MODEL` pins a model; unset, the newest model the key exposes that can actually *speak* is chosen at runtime — streaming over `bidiGenerateContent` is not enough on its own, since the transcription family (`…-transcribe-live`) does that too and then refuses a session that asks for audio out.

Every AI surface degrades to a clear labeled state — nothing crashes without keys.

## Deploy to Railway (~3 minutes)

The repo is self-deploying: `railway.json` pins the Dockerfile build, and the start command runs `scripts/deploy-init.ts` (enables pgvector → pushes the schema → applies indexes → seeds demo data once when `DEMO_MODE=true` and the DB is empty) before `next start`.

1. **railway.com → New Project → Deploy from GitHub repo** → `tja1989/CorporateTrainingApplication`. Production tracks **`main`** (service → Settings → Source → *Branch connected to production*), auto-deploys on push, and with *Wait for CI* on it deploys only after the `CI` workflow is green — so a merge to `main` is the deploy, and a red build never reaches the demo. `/api/health` reports `commit`, so you can always tell which build answered.
2. **+ Create → Database → PostgreSQL.** If the app's first deploy later fails with a pgvector message, replace it with Railway's **pgvector** template — the error tells you.
3. On the **app service → Variables**, add:
   ```
   DATABASE_URL   = ${{Postgres.DATABASE_URL}}
   SESSION_SECRET = <any long random string, e.g. `openssl rand -hex 32`>
   DEMO_MODE      = true
   ```
   Later, to switch the AI surfaces from offline demo mode to live models, add `ANTHROPIC_API_KEY` (and optionally `VOYAGE_API_KEY`, `AI_MODEL`, `YOUTUBE_API_KEY`) — no redeploy of code needed, just a service restart. For **voice** (oral check + HR live mode) add `GEMINI_API_KEY` from Google AI Studio; `/api/health` shows `voiceConfigured: true` once it is picked up, and `voiceModel` — the model a session would actually open against, so a key that resolves to something unusable is visible there rather than only when someone starts talking.
4. **Settings → Networking → Generate Domain.** First boot takes a couple of minutes (schema + seed); the healthcheck is `/login`. Sign in with the demo credentials above.

For scheduled maintenance, add a Railway cron service on the same repo with the command `npm run sweep` (daily) — it runs reminders, recertification, compliance recompute, and the retention purge.

## Architecture

Next.js 15 (App Router, TS) · Tailwind v4 with the welearn semantic token system (white/blue light theme and a complete dark theme, system UI sans, 16px body, 24–32px page headings, 8px controls and 12px cards, 44px targets, 150–250ms feedback motion). Learner header/search with mobile tabs; manager/admin labeled sidebar with a mobile drawer; focused lesson workspace. `DESIGN.md` is the visual authority and `tests/design-guardrails.test.ts` verifies contrast and token coverage · Drizzle ORM on Postgres 16 + pgvector (HNSW + GIN, hybrid RRF retrieval) · Postgres-backed job queue (`FOR UPDATE SKIP LOCKED`) · `@anthropic-ai/sdk` behind a single gateway (telemetry, PII redaction, streaming structured outputs) · `@google/genai` for Gemini Live — server mints constrained ephemeral tokens, the browser streams 16 kHz PCM over the SDK's WebSocket, tool calls (policy search, escalation, evaluation) round-trip through `/api/live/*` · dependency-free PDF writer for certificates · cookie sessions (HMAC JWT) with shared-device short TTL and TOTP for admins.

Key directories: `lib/` (domain logic — compliance, rules, quiz engine, grading, drill, retrieval, HR assistant, guardrails, reports, sweep, DSR) · `app/(learner)` `app/(workspace)` (UI) · `app/api` (streaming + heartbeat + report routes) · `scripts/` (seed, worker, sweep) · `tests/` (vitest) · `docs/MVP_SPEC.md` (the contract).

## Production checklist (from the spec — not yet done here)

Real policy corpus with named owners + counsel review (the seeded handbook is **fictional**), DPAs with AI providers + DPIA (spec §7.11/FR-13.5), client sign-off items in spec §16 (proctoring reframe, reach channel, paid-time stance), LuLu-owned YouTube channel + official captions flow, per-language HR-assistant eval gates beyond English, WhatsApp/SMS channel, real SMTP transport.
