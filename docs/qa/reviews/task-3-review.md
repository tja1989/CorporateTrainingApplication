# Task3 review — d7c366f..54feacc

Spec Compliance: Issues found. HR preview is not bound to confirmed payload, and assessment submission can race an earlier autosave. Remaining reviewed scope implemented: five lesson types, seven assessment inputs, six Practice types, assigned-path guards, independent video resume/coverage, synchronized completion/contents, discovery, profile, Inbox and policy citations.

Cannot verify: real AI/voice staging and physical iPhone remain UNVERIFIED as accepted; full engine/accessibility/performance and actual PDF rendering remain Task5. PDF oral ambiguity resolved by controller to preserve TEXT/VIDEO supported modes without adding PDF extraction.

Strengths: path-access.ts:9 scopes prerequisites correctly; lesson-progress.tsx:13 shares server-confirmed outlines without remount; question-input.tsx:30 native accessible inputs shared with Practice; client-state.ts:9 provisional vsfinal grades; additive/idempotent migration old-row preservation. Reviewer read final148unit/36browser/typecheck/buildlogs; no broad suite rerun.

## Important1 — Bind escalation confirmation to the previewed transcript

lib/hr/tickets.ts:31, lib/live/client/use-live-voice.ts:519, components/escalation-preview.tsx:11: the dialog displays one server snapshot, but confirmation passes no snapshot identity. Voice confirmation flushes additional turns, and ticket creation rereads the conversation. The live microphone/model can continue producing turns while the modal is open, so HR can receive content the learner never saw in the approved preview. Bind creation to an authorized server snapshot/version, or reject changed content and require a refreshed preview. Add a regression that appends a turn between preview and confirmation and verifies the exact stored ticket body.

## Important2 — Serialize assessment autosave and final submission

app/(learner)/quiz/[quizId]/runner.tsx:140,155: the effect-local saving flag prevents overlapping autosaves, but submit() does not await an already-running save. A delayed PATCH containing answer A can overwrite the submission PATCH containing newer answer B before grading. The existing server save replaces matching answers without revision checks. Inputs also remain editable during submission at runner.tsx:288, allowing further edits that the submitted snapshot excludes. Use one serialized save/submission pipeline and freeze answer controls while committing, or enforce revisions server-side. Add a delayed-autosave regression that proves the final grade and stored answers use the last acknowledged submission snapshot.

## Minor — Formatting

components/escalation-preview.tsx:10 compresses the complete asynchronous preview/confirmation flow into two very long lines. Similar compression appears in new learner pages. Conventional multiline formatting would make state transitions and future reviews materially easier.

Task quality: Needs fixes. No Critical findings. Two asynchronous races can violate consent or grade stale answers.

Focused checks: unchanged HR escalation handler and assessment PATCH/save contract; flushTurns whose body was absent from relevantdiffhunk; existing oral-content helper only to resolvePDFambiguity. No repository/index/HEAD/database mutations.
