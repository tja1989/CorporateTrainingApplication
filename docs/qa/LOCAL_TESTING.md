# Local browser qualification

Run these commands in the managed checkout against the isolated local environment. They must never target production or staging.

## Environment and production runtime

- Use Node 20+, PostgreSQL 16 with pgvector, and a database named `welearn_*` on localhost or 127.0.0.1.
- Configure ignored `.env` values for DATABASE_URL, SESSION_SECRET, DATABASE_SSL=false and DEMO_MODE=true. Deterministic tests need no production secrets.
- The existing development cluster is `.artifacts/postgres16`, port 55436, database `welearn_dev`. Preserve accumulated test records and failure evidence; do not reseed it.
- If stopped, start that cluster with `/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D .artifacts/postgres16 -l .artifacts/postgres16.log -o '-p55436 -h127.0.0.1' start`.
- Install dependencies with `npm ci`, then browser binaries with `npx playwright install chromium firefox webkit`.
- On a **fresh isolated database only**, `npx tsx scripts/deploy-init.ts` initializes schema/demo content. Demo seeding is destructive and is not part of a qualification run. Apply additive migrations to existing data as described in [migrations/README.md](../../migrations/README.md).
- Build with `npm run build`, then serve with `npm run start -- -H 127.0.0.1 -p 3100`. Tests use this production build; they do not start a development server or reset data.
- In another terminal, `npm run qa:https` creates an ignored local self-signed certificate and serves https://localhost:3443, forwarding only to loopback port 3100. Chromium uses the exact public-key pin for this certificate in disposable QA profiles, with `ignoreHTTPSErrors:false`. The QA-only `npm run test:e2e` launcher starts its Node child with `NODE_EXTRA_CA_CERTS` pointing to the same certificate, so `route.fetch()` and API requests retain strict certificate and hostname validation. Node reads this variable at startup; setting it later is insufficient. Non-loopback URLs, missing/invalid certificates and `NODE_TLS_REJECT_UNAUTHORIZED=0` fail closed. Firefox/WebKit retain their guarded local-context exception. No OS or personal-browser trust changes. Keep production Secure cookies: WebKit rejects them on plain HTTP even on localhost. Do not disable TLS verification globally.

Stop every process sharing `.next` before rebuilding, including any separate preview or service runtime. The clean preview uses `welearn_preview`; it is not the development dataset used for qualification or performance.

## Browser matrix and evidence

Run units and type checking with `npm test` and `npm run typecheck`. For a focused project, use `npm run test:e2e -- --project=chromium-desktop`.

The complete configured matrix currently contains 673 executions across ten projects. It uses **two workers, fullyParallel false and zero retries**. Mutating fixtures have unique IDs, browser contexts and artifact paths; the two-worker isolation audit is retained with Task 5 evidence. Do not overlap performance measurements with the matrix, service checks or manual browser activity.

After freezing the source, record the actual build commit and use distinct output folders:

```sh
unset NO_COLOR FORCE_COLOR
export PYTHONDONTWRITEBYTECODE=1
QA_BUILD_COMMIT=<clean-build-commit> QA_BUILD_DIRTY=0 QA_OUT=.artifacts/final-run-1 npm run test:e2e
QA_BUILD_COMMIT=<clean-build-commit> QA_BUILD_DIRTY=0 QA_OUT=.artifacts/final-run-2 npm run test:e2e
```

Both complete runs must pass consecutively on the same clean source and production build. Keep tracked files unchanged during both runs; write final documentation afterward and identify that documentation-only delta. An interim dirty source tree must use QA_BUILD_DIRTY=1 and cannot qualify the final gate.

Each output folder contains results.json, environment.json, an html report and test-results with traces, screenshots and retained failure videos. Browser versions, runtime build ID, source commit, local database, viewport/project identity, Chromium pin and Node extra-CA path are recorded. Raw artifacts remain ignored because they can contain synthetic credentials and private test transcripts. Publish a compact evidence index with paths/hashes, not the raw authentication material.

Helpers create unique QA accounts and prerequisites. Known MFA belongs only to newly created QA admins; existing MFA is not reset. Operations under qualification run through the actual UI and are verified through visible results plus persistence. API-only compatibility endpoints and background jobs are labeled separately rather than assigned invented UI controls.

## Accessibility, themes and capture methods

Chromium covers 360, 390, 768, 1280 and 1440 pixel widths. Quality traversals exercise light/dark themes, reduced motion, keyboard focus, target size, overflow, axe and RTL. Those ordinary traversals additionally use an explicitly labeled CSS zoom 200% simulation.

The `chromium-native-zoom` project uses an isolated temporary Chromium profile and a small test extension calling `chrome.tabs.setZoom(2)` in automatic mode. Its 1280×800 browser viewport becomes a 640×400 CSS viewport, with doubled device pixel ratio and CSS zoom remaining 1. This is real Chromium page zoom. It does not establish physical iPhone behavior or personal-browser preferences.

On this macOS host, WebKit keyboard traversal uses Option+Tab (Playwright Alt+Tab) to include links. The visible skip-link focus and Enter-to-main assertions remain required.

Ordinary full-page screenshots start at scroll zero to avoid sticky-header capture offsets. Focused viewport images retain the actual scroll state. Native zoom uses direct CDP viewport capture because Playwright's native-zoom clip calculation can shift scrolled content. Documents above 16 million physical pixels or 16384 pixels in height receive an explicitly labeled viewport capture with dimensions and reason metadata. All DOM traces, overflow, axe, target and focus assertions remain; this is a capture limit, not a pass waiver.

## Background services and performance

Run `QA_BUILD_COMMIT=<clean-build-commit> QA_BUILD_DIRTY=0 QA_OUT=.artifacts/final-service-1 npx tsx scripts/qa-service.ts`, then repeat into final-service-2. Each run creates a new schema-only local database, starts the same production build on port 3160, performs background operations and verifies their consequences through real UI/persistence. Preserve those databases and traces. The script stops its runtime in finally. Focused rule/concurrency modes are diagnostic subsets and cannot qualify the complete service gate.

Performance uses `scripts/qa-performance.ts` for three samples in each of six families: Home, catalog, course, video lesson, manager and admin. It creates a fresh learner with one enrollment and no progress so the representative course control is reachable; manager/admin use the seeded dashboard accounts. The report includes both overall development dataset sizes and the fresh learner's enrollment/course/path/progress counts. It never substitutes the smaller preview database.

Each sample uses a fresh 390×844 touch context, cold browser cache, 4× CPU slowdown, 150ms latency, 1.6Mbps download and 750Kbps upload. A five-second observation window measures LCP and layout shifts; CLS uses the largest one-second-gap/five-second session. A real representative action is verified, then Event Timing is collected. If no entry reaches the 16ms observer threshold, report an upper bound of 16ms rather than zero.

Run `QA_BUILD_COMMIT=<clean-build-commit> QA_BUILD_DIRTY=0 QA_OUT=.artifacts/final-performance npx tsx scripts/qa-performance.ts` with exclusive browser/runtime load. Final qualification requires all 18 samples. Budgets are median LCP ≤2500ms, CLS ≤0.1 and representative interaction upper bound ≤200ms. Missing measurements fail the gate. These are local lab measurements, not field Core Web Vitals or physical-device results.

## Coverage reconciliation and accepted limits

Regenerate the authored matrix and source inventory from the frozen checkout:

```sh
npm run --silent test:e2e -- --list --reporter=json > .artifacts/task-5-planned-matrix.json
npx tsx scripts/qa-inventory.ts .artifacts/task-5-source-inventory.json
```

Use `PYTHONDONTWRITEBYTECODE=1 python3 scripts/qa-reconcile.py` when reconciling evidence so Python cache files cannot make the checkout dirty. Source enumeration never marks an item passed. `case-evidence-map.json` maps requirements to exact assertions; `scripts/qa-reconcile.py` requires two actual complete no-retry browser passes, both complete service runs, all performance families and an exact-build validated controller public-video manifest before writing the final workflow/coverage results. It rejects dirty or changed checkout/runtime provenance, missing cases, failed results and incomplete manual evidence.

Real public YouTube playback has separate controller evidence, including seek-only behavior, pause/leave/resume, normal completion and persisted course state. Deterministic media fixtures do not substitute for that journey. Live AI/voice services and physical iPhone microphone/media remain **UNVERIFIED**, as explicitly accepted by the user; their later execution checklist is [EXTERNAL_GATES.md](EXTERNAL_GATES.md).

## Visual comparison provenance

The original baseline is application main `dd8bd11`. Its local runtime on port 3200 uses separate `welearn_baseline` data; baseline 117 units, typecheck and build passed, while its forms failed accessible-label browser checks. `scripts/qa-baseline.ts` captures representative journeys with reduced motion. `QA_SCOPE=expanded` adds path, quiz, oral, practice, policy, ticket, inbox, review and integrity families. The original expanded baseline has 64 screenshots in `.artifacts/baseline/expanded-screens/`.

After images must identify their own exact application source/build and preview dataset. A before/after gallery is visual evidence, not a replacement for workflow execution or the separate client visual approval gate.
