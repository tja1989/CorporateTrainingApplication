### Spec Compliance

- ❌ Issues found: renewal isolation remains vulnerable to concurrent video heartbeats; completion transactions can exhaust the database pool; manual qualification evidence can be marked passed without validation.
- ⚠️ Final local qualification remains unverified. Pending gates are listed below; external AI/voice staging and physical iPhone checks retain the user-approved **UNVERIFIED** status.

### Strengths

- Completed-sign-in API guards now match page requirements, including admin MFA setup and privacy acknowledgment: `lib/auth/guard.ts:18`.
- Tutor destinations are resolved against accessible course content; legacy suggestions remain supported and ambiguous historical citations stay readable without guessed links: `lib/ai/tutor-sources.ts:9`, `app/api/tutor/suggest/route.ts:16`, `tests/tutor-sources.test.ts:7`.
- Renewal tests exercise actual assessment submissions, human decisions and oral sessions while checking immutable history and renewed allowances: `e2e/renewal-qualification.e2e.ts:8`.
- Module ordering validates admin/course scope, serializes updates and preserves identifiers; browser assertions check learner order and earned history: `app/(workspace)/admin/courses/actions.ts:213`, `e2e/author-order.e2e.ts:6`.
- Added browser coverage verifies persisted results, CSV contents, recovery and cross-role outcomes. Provider/platform substitutions are explicitly distinguished from live qualification: `e2e/reports-qualification.e2e.ts:23`, `e2e/review-chain.e2e.ts:7`, `e2e/voice-faults.e2e.ts:7`.

### Critical Issues

- None identified.

### Important Issues

1. **Completion can deadlock the entire connection pool.**
   `lib/lms/completion.ts:74`, `lib/lms/completion.ts:149`, `lib/lms/completion.ts:158`; pool limit: `lib/db/client.ts:24`.
   `markLessonComplete` now holds a transaction while `completeCourse` awaits `awardPoints`, `awardBadge` and `notify`, which query through the global pool. Ten concurrent completion transactions—or one completing transaction and nine callers waiting for its advisory lock—can occupy every connection and wait indefinitely for another pooled query. These side effects also commit independently before completion commits. Pass the transaction through database side effects, or perform explicitly designed effects after commit. Add a deterministic pool-saturation regression and rollback/notification assertions.

2. **A heartbeat crossing renewal creation can restore the previous cycle’s watched coverage.**
   `lib/lms/rules.ts:169`, `lib/lms/completion.ts:67`; affected caller: `app/api/progress/route.ts:20`.
   Renewal resets progress under the learner/course lock, but the heartbeat reads and overwrites `watchedBuckets` outside that lock. A heartbeat can read old completed coverage, wait behind the reset, then overwrite the fresh progress with those old buckets. Its next heartbeat can call completion without an evidence boundary and earn renewed credit almost immediately. Serialize the heartbeat read/merge/write and completion with renewal using the same lock and connection. Test a deliberately interleaved heartbeat/reset and verify that old coverage cannot return.

3. **The reconciler accepts failed or unrelated manual evidence as a pass.**
   `scripts/qa-reconcile.py:49`, `scripts/qa-reconcile.py:63`, `scripts/qa-reconcile.py:65`.
   `--manual-video` is checked only for file existence. The script then marks every manual-backed case passed without reading status, covered steps or source provenance. A failed result or unrelated file therefore qualifies playback, seeking and threshold completion. Validate structured manual evidence per case, including passed status and exact commit or explicit source-equivalence attestation. The new final video result covers completion; earlier playback/seek evidence must retain its separate scope. Add small reconciliation tests rejecting failed, incomplete and mismatched evidence.

### Minor Issues

- None raised beyond the blocking findings.

### Named Checks and Evidence

- **Renewal/shared-state check:** inspected completion callers, `/api/progress`, course-outline assembly and existing lesson actions. Assessment/interview callers supply start-time evidence; the heartbeat does not. The progress handler required a focused read because its diff hunk stopped before the relevant body.
- **Transaction dependency check:** inspected the fixed pool configuration and notification implementation. The notification body required a focused read beyond its truncated diff context.
- **Tutor access check:** `lib/lms/lesson-access.ts:10` folds path restrictions into `self.locked`, so the new Tutor helper preserves path locking.
- **PDF API compatibility check:** the sole application caller awaits the changed asynchronous certificate API: `app/api/certificates/[certId]/route.ts:19`.
- **Saved evidence inspected:** 177 unit tests across26 files, typecheck and build-6 success; no warning/error matches in those logs. Production audit reports zero vulnerabilities. Saved module-order and corpus-quality results show9/9 and8/8 passes without retries. Historical failed runs remain separately identifiable.
- **Affected public-video evidence inspected:** `.artifacts/handoff/manual-video-final/result.json:1` records real playback completion on819e046, persisted course progress and no premature certificate. It does not exercise the concurrent-renewal finding.

### Cannot Verify

- Final clean-source build attestation and **two complete587-execution runs**, without retries, after resolving source findings.
- Two final isolated service passes and all six performance families with three samples, budgets and dataset counts.
- Final inventory reconciliation, full visual inspection, earned multilingual PDF rendering, both demo-PDF visual checks, comparison gallery, exact-commit preview/PR and handoff.
- Native200% browser zoom and complete manual focus/obscuration checks. `e2e/quality-qualification.e2e.ts:34` uses CSS zoom; its focus assertion at line40 checks dimensions/style, not whether another element covers the control.
- Real AI/voice staging and physical iPhone microphone/media: explicitly **UNVERIFIED** under the accepted limitation.

### Assessment

**Task quality: Needs fixes.**

The added qualification covers substantial real behavior, but the concurrency defects can hang completion or incorrectly credit a renewal. The evidence reconciler also needs to reject unsupported pass claims before final phase acceptance.
