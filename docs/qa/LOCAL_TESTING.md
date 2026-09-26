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
