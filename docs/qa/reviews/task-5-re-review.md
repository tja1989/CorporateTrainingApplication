# Task 5 repair round 1 — independent scoped re-review

Verdict: **Approved** for `819e046..a4f0479`. All three original Important findings and agreed focus corrections are addressed. Final Task 5 qualification remains pending.

## Original findings

1. **Completion pool exhaustion and rollback leakage — ADDRESSED.** `lib/lms/completion.ts:64`, `:162`; `lib/notify.ts:51`, `:69`. Completion, awards, activity and in-app notifications share the transaction connection. Email runs only after successful commit. Saved evidence reproduces the original ten-client deadlock and rollback leakage; the repair records exactly one completion/certificate/notification, 60 points, no rollback residue or premature email. Recovery produces one post-commit email.
2. **Heartbeat/renewal race, including stale short-video receipts — ADDRESSED.** `app/api/progress/route.ts:12`, `:23`, `:25`, `:40`. Authorization, bucket updates, completion and returned outline use the same locked connection. Receipt time rejects pre-renewal requests. Evidence shows empty reset coverage, one fresh bucket still incomplete and the original certificate retained. A four-second stale receipt returns 409 without renewed credit; fresh playback completes normally.
3. **Unvalidated manual evidence becoming PASSED — ADDRESSED.** `scripts/qa-reconcile.py:59`; `scripts/qa_manual_evidence.py:15`, `:25`, `:44`. Requires overall/per-case success, matching source/build, browser/viewport, three video IDs, steps/results and existing nonempty contained artifacts. Eight validator tests pass. The service-stage guard rejects receipt-only evidence as incomplete (`scripts/qa-reconcile.py:44`).

## Agreed focus corrections

- **Empty and active Tutor scope obstruction — ADDRESSED.** `app/(learner)/lesson/[lessonId]/video-client.tsx:355`, `:415`. Empty composer stays in normal flow; active sticky composer is constrained below scope. Explicit initial-hit and keyboard-focus regressions cover both (`e2e/quality-qualification.e2e.ts:70`, `:87`).
- **Native-zoom focus obstruction and desktop RTL/CSS-zoom overflow — ADDRESSED.** `app/globals.css:173`, `:213`; `e2e/quality-qualification.e2e.ts:44`. Mobile scrolling reserves navigation space; header wraps. Six final changed-state traversals pass across native zoom, 360px and desktop, both themes.
- **Native zoom/capture method — VERIFIED for scoped evidence.** `e2e/native-zoom-test.ts:57`, `:68`; `e2e/support.ts:66`. Metadata records 1280×800→640×400 CSS pixels, DPR1→2, CSSzoom1. Inspected trace contains737 frame snapshots and UI actions. Direct-CDP images agree with unobscured Tutor/HR geometry. Earlier distorted captures remain diagnostic only.

## New breakage

No Critical, Important or Minor issues raised in the repair diff. No out-of-scope observations.

## Evidence inspected

Saved red/green pool, rollback, heartbeat and receipt evidence, including all four complete isolated-service regressions;14 affected browser passes;16 native/narrow passes;8 native capture passes;6 final Tutor/header passes, with no retries/skips/unexpected results.177 units,8 validators, typecheck and build3 passed. Focused evidence honestly identifies dirty-source fingerprints rather than claiming final clean qualification. No suite/build/runtime reruns performed by reviewer.

## Remaining qualification

Exact clean-build verification, complete public-video manifest, six-family performance, two consecutive595-execution matrices with isolated services, earned-PDF inspection, reconciliation, gallery and preview remain pending. Real AI/voice staging and physical iPhone media/microphone remain UNVERIFIED.

This archive preserves the reviewer's verdict, evidence and file references from the final collaboration response; prose spacing was normalized by the controller.
