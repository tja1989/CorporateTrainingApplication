# Independent whole-branch review

Reviewer: `/root/final_review`, Astra, extra-high reasoning.

Immutable comparison: `dd8bd11cac4df8ede1ef566431ad72285842a82d` → `0b6dbe1d4c45c75672a98ba61f58ca94062969ef`.

Diff: `final-candidate-dd8bd11..0b6dbe1.diff`, 1,223,096 bytes, SHA-256 `c8535495eaf7b46a30d91c961b89cf38eab0f370cfb70741ae5c1518734884ea`.

**Verdict: changes required.** No phase acceptance or final qualification is granted. The controller accepted all five Important findings for one repair wave. This record summarizes the review delivered in the chat; subsequent fixes do not change this historical verdict.

## Strengths

The shared shells, navigation, forms, course outline and lesson workspace coherently implement the approved design. Server-side lesson access, scoped reporting and MFA/privacy guards improve authorization boundaries. Completion and renewal share transaction and locking boundaries, preserve history and avoid awarding completion from provisional grades. Browser tests exercise persisted outcomes, cross-role handoffs and recovery; provider substitutions and physical-device limits are disclosed. Qualification tooling checks complete matrices and matching build provenance.

## Findings

No Critical issue was identified.

1. **Important — fresh assessment retry retains the previous question index.** `app/(learner)/quiz/[quizId]/runner.tsx:80` replaces attempt and answer state without resetting navigation. After finishing a multi-question, one-at-a-time assessment, retry can open at the old last question; no-backtracking then prevents access to earlier questions. Reset per-attempt state and cover same-page retry.
2. **Important — refreshing bypasses no-backtracking.** The React-only index resets to zero although the start endpoint restores the same attempt, answers and deadline. Persist and enforce forward navigation on the server, including skipped questions, ordered saves and offline retry. This baseline-origin defect violates the retained assessment settings/refresh contract. The additive migration and history preservation require follow-up review.
3. **Important — cleared integrity decisions appear pending.** `lib/quiz/client-state.ts:10` treats only `GRADED` as final, but human clearance sets `CLEARED` while retaining finality, score and pass/fail. Recognize finalized cleared results without relaxing provisional, submitted or voided handling. Cover cleared pass and fail.
4. **Important — overlapping rules abort CSV import and hide activation codes.** `lib/lms/rules.ts:85` reuses an unchanged enrollment snapshot; a second matching course or overlapping path rule violates the active-enrollment unique index. The exception escapes `app/(workspace)/admin/people/actions.ts:55` after account persistence and before usable activation codes are returned. Centrally deduplicate enrollment and retain per-row outcomes. Verify import, exactly one active enrollment and real account activation in the browser.
5. **Important — shared-device HR disclosure does not reauthenticate.** `app/(learner)/ask-hr/chat.tsx:138` only changes local visibility, while `app/api/hr/route.ts:61` returns history under the existing session. Require server-verified, session-bound recent credentials and direct-access guards. Cover wrong/correct credentials, expiry, logout and a new session. The explicit retained MVP requirement makes this baseline-origin gap in scope.
6. **Minor — older unread notifications become unreachable.** `components/inbox-list.tsx:10` derives unread count and Mark all visibility from only the newest 50 records, unlike the shell's full unread count. Count independently and provide bounded access to older items.
7. **Minor — README describes a dependency-free certificate writer.** Update this stale description to reflect PDFKit.

## Named checks outside the diff

The reviewer examined enrollment reevaluation and its unique index; quiz start/resume, window, allowance, answer-save and finalization contracts; integrity clear/void actions; assignment and recommendation semantics; authentication/workspace/team guards; video/manual/quiz/oral completion call sites; and HR history enforcement.

## Evidence limits and pending decisions

The review used the frozen diff and bounded supporting source reads. It did not edit files, rerun tests, rebuild, or manipulate runtime/database state. Controller-reported units, validators, build/typecheck, isolated services, performance, public-video and PDF checks were not independently rerun by this reviewer.

Tutor citation obstruction, admin course-grid overflow, oversized screenshots and the pending microphone cleanup diagnostic still required qualification repairs. The complete final browser matrix was not green and a second complete run remained outstanding.

Voiding an already passing sitting currently preserves completion/certificates. The failed-sitting void test does not qualify that branch. The actual consequence needs an explicit policy disposition and browser proof; the reviewer did not invent certificate revocation or history deletion.

PDF oral checks retain the accepted existing TEXT/VIDEO scope. The public WHO transcript is illustrative and does not establish semantic fidelity. Real AI/voice staging and physical iPhone behavior remain UNVERIFIED. Rendered binaries, final preview, PR and handoff documents require their own evidence.

One bounded follow-up should examine the complete repair diff, navigation migration, HR reauthentication boundary and final qualification evidence before approval.
