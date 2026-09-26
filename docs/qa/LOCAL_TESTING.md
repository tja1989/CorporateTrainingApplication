# Local browser qualification

All commands run in the managed checkout, never against the deployed application.

## Environment

- Node20+, PostgreSQL16+pgvector, a database named `welearn_*` onlocalhost/127.0.0.1.
- `.env`: DATABASE_URL, SESSION_SECRET, DATABASE_SSL=false, DEMO_MODE=true. No production secrets are needed for deterministic tests.
- Current development cluster: `.artifacts/postgres16`, port55436, database/userwelearn_dev. This cluster is disposable test data.
- Start the existing cluster if stopped: `/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D .artifacts/postgres16 -l .artifacts/postgres16.log -o '-p55436 -h127.0.0.1' start`.
- `npm ci` then `npx playwright install chromium firefox webkit`.
- On a fresh isolated database only, `npx tsx scripts/deploy-init.ts` initializes schema/demo content. Never point this at a production DB: demo seed is destructive.
- `npm run build` then `npm run start -- -p3100`. Tests use that production server; they do not silently start a dev server or reset data.
- In another terminal, `npm run qa:https` creates an ignored, local self-signed certificate with OpenSSL and serves `https://localhost:3443`. The proxy binds only to loopback and forwards to port3100. Browser tests default to this URL and accept that local certificate. Keep the production `Secure` session cookie: WebKit rejects it on plain HTTP even on localhost. Do not use a global TLS verification override.

## Commands

- `npm test`, `npm run typecheck`, `npm run build`.
- `npm run test:e2e -- --project=chromium-desktop` for one project during implementation.
- `npm run test:e2e` for the complete configured browser matrix. Repeat the complete suite twice without retries for final acceptance.
- `npx tsx scripts/qa-baseline.ts` captures representative existing demo journeys; `QA_OUT=.artifacts/after/screens` chooses a separate after directory. This is visual evidence only.

Browser helpers create uniquely named QA accounts in the isolated DB. Known MFA belongs only to newly created QA admins; existing users' MFA is never reset. Database fixture writes only establish prerequisites. The operation under qualification must be performed through the UI and then verified by visible result plus persistence.

`test-results/` contains per-test traces, failure screenshots/video, an environment record, andJSON results; `playwright-report/` contains the browsable report. These and `.artifacts/` are ignored to avoid shipping credentials/transcripts/screens in Git. Record artifact locations and exact commit in the final qualification report. A dirty source tree is disclosed in environment metadata and cannot serve as final exact-commit evidence.

## Coverage meaning

The workflow matrix is the required scope. A browser screenshot or passing unit test does not mark a workflow passed. Record actual UI steps, role, browser/viewport, final persisted outcome and evidence. A mocked provider can establish fault handling, but cannot qualify real YouTube/AI/voice. Desktop WebKit/mobile emulation cannot qualify actual iOS microphone/media behavior.

Baseline captured at main dd8bd11 (runtime build), before code rework. `scripts/qa-baseline.ts` waits for visible content and finishes animations; its reduced-motion setting is included in the evidence method. Baseline unit117 tests/typecheck/build passed. The baseline forms failed the browser accessible-label contract, which the shared design phase must repair.

Expanded before capture: `QA_SCOPE=expanded` adds path, quiz, oral, practice, policy, ticket, inbox, review and integrity families to `scripts/qa-baseline.ts`. The dedicated baseline runtime is built from original dd8bd11 at `/Users/USER/claude_tj/CorporateTrainingApplication`, serves loopback port3200, and uses separate `welearn_baseline` seeded data. Its ignored environment file is `.artifacts/baseline/preview.env` in the managed checkout. Runtime metadata and64 screenshots live in `.artifacts/baseline/expanded-screens/`. Never confuse this original preview with the new application on3100/3443.

## Production performance

`scripts/qa-performance.ts` signs in through the UI using the local synthetic demo accounts, then measures Home, catalog, course, video lesson, manager and admin pages three times each. The admin must already have completed test MFA setup; its existing seed is read locally without logging. Each sample uses a fresh390×844 touch context, cold browser cache,4×CPU slowdown and150ms network latency with1.6Mbps download/750Kbps upload. A5-second observation window samples LCP and layout shifts; CLS uses the largest1-second-gap/5-second session. The visible representative action is verified, then Event Timing is collected. If a supported action generates no entry at the16ms observer threshold, report an upper bound of16ms, not a fabricated zero.

After committing, building and starting that exact production source, run `QA_BUILD_COMMIT=<recorded 40-character build commit> QA_BUILD_DIRTY=0 npx tsx scripts/qa-performance.ts`. Use `QA_BUILD_DIRTY=1` for interim working-tree diagnostics; those cannot qualify the final exact-commit gate. Output includes all samples, medians, budgets, runtime configuration, screenshots and traces under `.artifacts/performance/`. `QA_OUT` selects another output directory. `QA_FAMILIES=home,lesson` can target a repaired area, but final qualification requires all six families. Budgets are median LCP≤2500ms, CLS≤0.1 and representative interaction upper bound≤200ms. Missing measurements fail qualification. These instrumented local lab samples are not field Core Web Vitals or physical-device evidence.

Regenerate the source entry-point inventory before final coverage reconciliation:

```sh
npx tsx scripts/qa-inventory.ts .artifacts/source-inventory.json
```

This enumerates page routes, HTTP handlers and server actions (including inline actions in shared components) with source lines and Git metadata. It does **not** mark any item tested or replace the visible-control/workflow-branch audit. Reconcile it with `coverage-inventory.json` and `workflow-cases.json`; inspect runtime guards rather than treating directory-based role labels as authorization proof.
