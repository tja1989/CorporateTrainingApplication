# LuLu Learn — AI-Native Corporate Training Platform (MVP)

A mobile-first learning platform for a retail workforce where every piece of content can be **talked to**, every lesson is assessed, and every employee has a citation-grounded **HR assistant** in their pocket.

Built to the spec in [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md) (feature requirements, AI architecture, design language, data model, milestones M0–M6 — all implemented).

## What's inside

- **LMS core** — courses → modules → typed lessons (YouTube video, text, PDF, quiz), learning paths with in-order locking, auto-enrollment rules with idempotent re-evaluation, the full compliance loop (relative due dates → reminder ladder → certificate PDFs → expiry-driven re-certification), immutable completion records.
- **Chat-with-video Tutor** — transcript ingestion (lawful manual SRT/VTT path by default) → timestamped chunks → hybrid pgvector+FTS retrieval (RRF) → streamed answers whose `[mm:ss]` citation chips are **server-validated** and seek the player. Watch progress = unique watched-second coverage (90% gate).
- **Assessment engine** — 7 question types + stimulus, question banks with draw-N snapshots, exam windows, cooldowns, per-user time-multiplier accommodations, server-authoritative timing with offline buffering, PRACTICE vs EXAM feedback policies (answers sealed until window close), tier-1 integrity monitoring (consent-first, flags gate *human* review, iOS fallback), AI-drafted questions that **never publish without approval**, and employment-safe AI rubric grading — every AI *fail* is human-reviewed; only confident clear passes auto-finalize; learners can appeal.
- **Daily drill** — SM-2-lite spaced repetition with confidence ratings ("confidently wrong" re-drills first). Optional, never counts toward required training.
- **Virtual HR assistant** — citation-first RAG over versioned policy docs (superseded versions are hard-filtered but soft-retained for audit reconstructability), country/audience permission filters, deterministic guardrails (grievance → sympathetic human routing; legal/visa/medical denials; injection screening; no-promises output rail), escalation tickets with consented transcripts, pseudonymized audit log, deflection/CSAT/content-gap KPIs.
- **Managers & reporting** — team dashboard with drill-down tiles and not-reached-directly surfacing, assign/nudge, six live reports with CSV export, and **Ask Reports**: natural-language questions compiled to typed, whitelist-validated query plans (never model-written SQL) with the executed plan disclosed.
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

Background jobs: `npm run worker` (queue) and `npm run sweep` (nightly compliance/reminders/recert/purge — run it from cron in production). Tests: `npm test` (66 tests over the state machines, scoring, routing, retrieval, HR guardrails, and the design-system guardrails — closed spacing/weight/radius vocabulary plus WCAG contrast on every colour token in both themes).

## AI configuration & honest degradation

| Env var | Powers | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` (+`AI_MODEL`, default `claude-opus-5`) | Tutor, HR assistant, AI grading, quiz generation, Ask Reports planning | Deterministic **offline demo mode**: extractive grounded answers labeled "offline demo", keyword report planner, overlap-heuristic grading at 0.5 confidence (routes to human review) |
| `VOYAGE_API_KEY` | `voyage-3.5` embeddings (1024-d, multilingual) | Hashed-bag-of-words lexical embeddings — hybrid retrieval still works, FTS carries double weight |
| `YOUTUBE_API_KEY` | Embed/privacy validation at ingest + weekly link health | Validation skipped; player errors handled gracefully at view time |
| `SUPADATA_API_KEY` | Vendor transcript fetch (**demo-only**; scraping shifts ToS risk, it doesn't remove it) | Manual SRT/VTT upload — the lawful default; production path is a company-owned channel + official captions API |
| `SMTP_URL` | Email channel (`console` logs in dev) | In-app inbox still delivers everything; manager digests remain the certified reach path |

Every AI surface degrades to a clear labeled state — nothing crashes without keys.

## Deploy to Railway (~3 minutes)

The repo is self-deploying: `railway.json` pins the Dockerfile build, and the start command runs `scripts/deploy-init.ts` (enables pgvector → pushes the schema → applies indexes → seeds demo data once when `DEMO_MODE=true` and the DB is empty) before `next start`.

1. **railway.com → New Project → Deploy from GitHub repo** → `tja1989/CorporateTrainingApplication` (pick the branch you want under the service's Settings → Source; merge PR #1 to deploy from `main`).
2. **+ Create → Database → PostgreSQL.** If the app's first deploy later fails with a pgvector message, replace it with Railway's **pgvector** template — the error tells you.
3. On the **app service → Variables**, add:
   ```
   DATABASE_URL   = ${{Postgres.DATABASE_URL}}
   SESSION_SECRET = <any long random string, e.g. `openssl rand -hex 32`>
   DEMO_MODE      = true
   ```
   Later, to switch the AI surfaces from offline demo mode to live models, add `ANTHROPIC_API_KEY` (and optionally `VOYAGE_API_KEY`, `AI_MODEL`, `YOUTUBE_API_KEY`) — no redeploy of code needed, just a service restart.
4. **Settings → Networking → Generate Domain.** First boot takes a couple of minutes (schema + seed); the healthcheck is `/login`. Sign in with the demo credentials above.

For scheduled maintenance, add a Railway cron service on the same repo with the command `npm run sweep` (daily) — it runs reminders, recertification, compliance recompute, and the retention purge.

## Architecture

Next.js 15 (App Router, TS) · Tailwind v4 with the spec's OKLCH token system as a *closed* theme (light+dark; 7-step spacing, 4/8/12/pill radii, three elevation levels, 150/250/400ms motion tokens, Inter Variable at 400/500 — off-system classes emit no CSS and `tests/design-guardrails.test.ts` names them) · Drizzle ORM on Postgres 16 + pgvector (HNSW + GIN, hybrid RRF retrieval) · Postgres-backed job queue (`FOR UPDATE SKIP LOCKED`) · `@anthropic-ai/sdk` behind a single gateway (telemetry, PII redaction, streaming structured outputs) · dependency-free PDF writer for certificates · cookie sessions (HMAC JWT) with shared-device short TTL and TOTP for admins.

Key directories: `lib/` (domain logic — compliance, rules, quiz engine, grading, drill, retrieval, HR assistant, guardrails, reports, sweep, DSR) · `app/(learner)` `app/(workspace)` (UI) · `app/api` (streaming + heartbeat + report routes) · `scripts/` (seed, worker, sweep) · `tests/` (vitest) · `docs/MVP_SPEC.md` (the contract).

## Production checklist (from the spec — not yet done here)

Real policy corpus with named owners + counsel review (the seeded handbook is **fictional**), DPAs with AI providers + DPIA (spec §7.11/FR-13.5), client sign-off items in spec §16 (proctoring reframe, reach channel, paid-time stance), LuLu-owned YouTube channel + official captions flow, per-language HR-assistant eval gates beyond English, WhatsApp/SMS channel, real SMTP transport.
