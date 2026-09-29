# xprtn browser qualification

**2026-09-29 update:** The local preview now includes the [Tutor formatting fix](TUTOR_FORMATTING_FIX.md), verified by 24 focused browser executions and an actual Codex in-app browser check. The complete matrices below apply to the earlier build identified here; they have not been rerun for the formatting change. The historical WebKit input incident remains separate and unresolved.

**The renewed local execution and coverage checks passed. Final acceptance remains open for the historical WebKit Tutor input failure. This is not a release approval.**

On 2026-09-28, two consecutive complete runs passed **741/741 each: 1,482 executions**, with zero retries, skips, flakes, unexpected results or global Playwright reporter errors. Each run includes 114 authored cases in 32 files across 10 projects. All 1,482 trace ZIPs passed CRC checks. No application or test change was made during recovery qualification.

## Candidate and recovery provenance

| Item | Identity |
|---|---|
| Application source | `0ae585fa7a29d0e33723f1d6b773983f3f0c9029` |
| Clean qualification checkout | `63ec2af04b6b888295826d3525c260e90a6afafe` |
| Preserved production build | `NGmjXLUbonvPoG_RYpIJW` |
| Pull request | [PR 18](https://github.com/tja1989/CorporateTrainingApplication/pull/18), draft; no merge or deployment |
| Runtime | Node 20.20.2; PostgreSQL 16/pgvector; local HTTPS |
| Browsers | Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6 |
| Final report changes | Documentation and generated coverage records only, after both runs |

The original local PostgreSQL cluster, baseline dump and several historical raw evidence directories were missing when recovery began. Code and retained review records survived. A **new fictional baseline** was created on `127.0.0.1:55437`: 42 tables, 30 users, four courses and 25 enrollments. This is renewed evidence, not restored historical data. The immutable dump is 85,261 bytes, SHA256 `640fca6f13c54a5a23e751d913085c83f0253e0cf1cef42a7d6bbac85607946f`.

Matrices 19 and 20 used distinct databases restored from that same dump; all 42 table counts/content hashes matched before each run, and runtime/runner targets agreed. The original build manifest is also missing. The preserved build ID agrees with retained records; the new 345-file compiled snapshot proves unchanged bytes during these runs, not restoration of the old build proof. All 351 tracked source files and 11 method files were checked before/after both runs. The seed script's regenerated demo PDF was restored to its exact committed bytes before the final freeze; service runs 1/2 are diagnostic only.

## Recorded results

| Check | Result | Evidence |
|---|---|---|
| Complete matrix 19 | 741/741, one attempt each | [verification](../../.artifacts/recovery-qualification-20260928/matrix-19/verification.json) |
| Complete matrix 20 | 741/741, one attempt each | [verification](../../.artifacts/recovery-qualification-20260928/matrix-20/verification.json) |
| Coverage reconciliation | 84 records, 22 families; 83 local portions passed, three external portions unverified (overlapping records) | [workflow cases](workflow-cases.json), [source coverage](coverage-inventory.json) |
| Source surfaces | 37 page routes, 23 APIs, 45 server actions mapped to evidence | [route summary](ROUTE_COVERAGE.md) |
| Units / typecheck | 181/181 across 27 files; typecheck passed | [units](../../.artifacts/recovery-qualification-20260928/units.log), [typecheck](../../.artifacts/recovery-qualification-20260928/typecheck.log) |
| Background services | Both clean-source runs passed all 12 required stages; 10 traces CRC checked | [service 3](../../.artifacts/recovery-qualification-20260928/service-3/results.json), [service 4](../../.artifacts/recovery-qualification-20260928/service-4/results.json) |
| Mobile laboratory performance | All 18 samples across six families passed | [results](../../.artifacts/recovery-qualification-20260928/performance/results.json) |
| Production dependency audit | Zero reported vulnerabilities on 2026-09-28 | [audit](../../.artifacts/recovery-qualification-20260928/production-audit.json) |
| Real public video | Three actual Chrome UI journeys; 29 artifact references revalidated on this build | [public video](../../.artifacts/handoff/public-video-xprtn-8/result.json) |
| Visual comparison | 64 pairs / 128 images and 138-entry ZIP checked | [gallery](../../.artifacts/handoff/xprtn-comparison-gallery-8/index.html) |
| Native zoom and certificates | Ten passing native cases; eight personally inspected images; six earned certificate downloads; one rendered PDF personally inspected | [independent artifact bindings](../../.artifacts/recovery-qualification-20260928/matrix19-evidence-review.md) |

The compatibility wrapper `markCompleteAction` remains explicitly source-reviewed and unbound to a visible UI control; it is not claimed as a separate browser action. Reconciliation describes executed cases, not disposition of historical incidents.

Both themes, keyboard, reduced motion, RTL, accessibility, responsive controls and contained report scrolling are included. Native Chromium zoom uses `chrome.tabs.setZoom(2)` with CSS zoom 1 and a 640×400 CSS viewport. The eight inspected captures are 1280×713 scoped viewport images, not full documents. The rendered multilingual certificate retains Arabic, Devanagari and Malayalam text with legible layout. These checks do not establish client visual approval or physical-device behavior.

Performance medians: Home 840 ms, catalog 844 ms, course 836 ms, lesson 560 ms, manager 804 ms and admin 840 ms LCP; all CLS 0; interaction upper bounds 16–40 ms. The configuration was 390×844, 4× CPU slowdown, 150 ms latency, 1.6 Mbps download / 750 Kbps upload and cold cache. The new artificial corpus held 10,467 users, 4,006 courses, 2,829 enrollments, 2,082 attempts and 1,042 tickets. It does not reproduce the lost historical data distribution. These are laboratory measurements, not field Core Web Vitals.

The existing public-video evidence verifies playback, seek-only behavior, pause/leave/resume and legitimate completion. Its illustrative transcript does not establish semantic accuracy against the public placeholder video. Deterministic citation tests cover allowed destinations separately.

## Acceptance items and limits

1. **Historical Tutor first-input failure — unresolved.** In matrix 8, WebKit returned from `fill()` but the field was empty and Send disabled; no question or POST occurred. The original raw trace is missing. Surviving reviews and renewed source analysis do not establish an application cause, repair or automation-only classification. Both fresh runs passed the original assertions. Passive observation verified all six 25/25/36-character input sequences per run; instrumentation can affect scheduling and does not prove the old cause. The [approved plan](../WELEARN_REWORK_PLAN.md#qualification-gates) separately prohibits unresolved primary-action failures. Final acceptance requires an evidence-backed disposition or an explicit user amendment; none is inferred here.
2. **Historical completion page errors — retained as failed/unclassified.** Matrix 12's completion and exactly-once persistence succeeded, but its unfiltered page-error assertion failed. It is not relabeled as a pass or evidence of data loss. New complete passes satisfy the consecutive-run requirement without explaining that historical error.
3. **Raw browser errors are distinct from report errors.** The passive Tutor streams retain 1 pageerror metadata event(s) in run 19 and 3 in run 20. Zero global reporter errors must not be read as zero browser errors. See [incident analysis](../../.artifacts/recovery-qualification-20260928/incident-review.md) and each observer verification.
4. **External checks remain UNVERIFIED by prior user agreement:** real AI staging, real voice staging, and physical iPhone Safari microphone/media. [External checklist](EXTERNAL_GATES.md). Client visual approval remains separate.
5. **Evidence-retention limit:** historical raw matrices 8/12/17 and other older service/performance assets are missing. Retained summaries keep their original findings and provenance. New runs have new identities; missing evidence was not reconstructed or silently treated as passing.

## Handoff

The [evidence index](evidence-index.json) records paths, sizes and hashes for the renewed results and supporting records. Raw artifacts remain local/ignored because they can include synthetic authentication material. The final bounded review is recorded in [recovery qualification review](reviews/recovery-qualification-review.md). The accepted implementation phases remain 70%; the 25% browser phase awaits the historical Tutor disposition, and the 5% acceptance/handoff phase is not claimed complete.

The restored [local preview](http://localhost:3300/home) passed actual learner sign-in and privacy-notice continuation; the [comparison gallery](http://localhost:3350/) is available. Its IAB screenshot is a preview capture only, excluded from visual qualification.

Use [LOCAL_TESTING.md](LOCAL_TESTING.md) for reproduction, environment recovery and preview. [Migration and rollback](../../migrations/README.md) preserve existing completion and attempt history; no production migration was performed. No production deployment, merge or live-provider qualification is included.
