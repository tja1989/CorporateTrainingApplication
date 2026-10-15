# Course planning independent review

Reviewed range: `fdaa3df..8c037b0`. One fresh code reviewer (GPT-6 Astra, xhigh) and one fresh Impeccable finish reviewer (GPT-6.1 Sol, high). Both final reports received before the correction pass. Reviewers made no source edits. The code reviewer independently ran all 297 unit tests successfully. No second review or detector is planned.

## Code findings

No Critical findings. Verdict: **with fixes**, before main integration.

1. **Important: human grading can save a partial decision before planning rejects credit.** `finalizeReview` and `overturnInterview` persist reviewed/final states and rewards before the new completion guard can fail, removing the normal pending-review retry. Put decisions/results/rewards/credit in one short serialized transaction. Also stage free-text review writes from `submitAttempt` until its final planning gate succeeds, so an author race does not leave reviews for a rejected submission.
2. **Important: target-only assignment can leave an unassigned prerequisite permanently locked.** A learner can complete every lesson of a published prerequisite without an enrollment, but `completeCourse` then records no immutable completion. The initial browser test masked this by calling `enrollUser` directly for the prerequisite. Provide a supported ordinary learner completion/enrollment path, and test target-only assignment without that fixture shortcut.
3. **Important: explicit prerequisites can conflict with ordered paths.** A requires B, while an ordered A→B path requires A first; the explicit graph alone is acyclic. Validate effective dependency order when saving/assigning, including an indirect cross-system cycle and actionable errors.
4. **Important: deferred automatic rules have no time-based retry.** A deadline relative to enrollment may initially precede opening and later become valid. Rule/person mutations reevaluate, but the daily sweep only retries renewals. Add retry through the sweep or a persisted pending mechanism; prove time changes eligibility without editing the rule/person, whole-path atomicity and unchanged duplicates.
5. **Important: path and blocked-lesson navigation advertise unavailable learning.** Planning-blocked courses still become Current/Available/Continue path, and the blocked lesson can link to itself as the next available lesson. Select/label path steps using planning, route a course-wide gate to course availability, and test ordered future-first and mixed unordered paths.

Minor, deferred: cards format opening dates in Dubai but omit the timezone in their visible label. Course detail provides it. The reviewer recommends a timezone label beside cards or once in the catalog context.

The reviewer confirmed serialized graph edits, fresh final-credit checks, provider latency outside transactions, immutable prerequisite history, masked unavailable titles, atomic deadline validation, and well-separated folder normalization/filtering.

## Visual findings

Persistence passes: PRODUCT.md and DESIGN.md match the retained Operate world. Ceiling reached for this additive expansion; no new comp/card applies.

1. **Material: mobile availability explanation is below the first viewport.** Put `CoursePlanningGate` immediately below the title, ahead of schedule/enrollment metadata.
2. **Material: undated metadata falsely says Available now.** Use No start date set; prerequisites or a learning path may still block access.

Preserve white/blue hierarchy, native prerequisite links, Dubai dates, non-closing end target, enrollment history and folder breadcrumbs.

## Behaviors the code reviewer declined to judge

- Live providers, real SMTP and installed production schedules: excluded from this phase; application gate placement and the existing sweep were reviewed.
- Standalone empty folders and bulk folder renaming: excluded by design.
- Wider notification composition, HRMS, profile/dashboard/marksheet work: subsequent client scope.
- Independent pre-existing simultaneous submission/scoring races: unchanged mechanisms; new planning-related transaction failures were assessed.
- Direct SQL hard deletion of prerequisite courses: no supported application deletion path found; cascade was not treated as an ordinary workflow.
- A separate historical quiz/oral-results viewer while current learning is gated: the binding historical-access requirement names completion records, certificates and own feedback.

The executor must rule on these boundaries and record the single correction pass and its RED→GREEN evidence before claiming completion.

## Single correction pass

All five Important findings and both material visual findings were accepted. Real DB regressions demonstrate blocked review snapshots remain unchanged, successful retry awards credit/certificates, rejected racing submissions leave no review rows, voluntarily completed prerequisites produce immutable evidence without HR enrollment fixtures, and direct/indirect/combined-path conflicts reject without partial data. A separate preserved local clone runs the actual daily sweep before/after relative-deadline eligibility and proves a repeat preserves every assignment byte. The ordinary learner journey now assigns the target only, follows/completes its prerequisite, then completes the target and reads earlier feedback/certificate evidence.

The UI corrections each had a failing browser regression before editing. Corrected source: 297/297 units, type check and production build; 36/36 four-profile planning browser cases and nine affected desktop regressions. No second detector or review. Main integration/preview results are recorded in the qualification document when complete.

The card-timezone minor remains deferred. All declined-to-judge boundaries are carried to the delivery decision register and remain disclosed; none becomes a claim of broader product completion.
