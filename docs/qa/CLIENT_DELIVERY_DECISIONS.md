# Client delivery decisions

These decisions preserve the approved role/approval and feedback contracts. Remaining checklist items remain requested delivery scope. Main integration does not authorize or establish hosted deployment, email delivery or HRMS synchronization.

## Rulings

- Task 1: Ruling: Update legacy current-user comparisons and shell/people role labels in this task — canonicalization otherwise bypasses existing manager scope checks and fails compilation — cost if wrong: small routing scaffolding may need adjustment in Task 4.

- Task 1: Ruling: No standalone real-JWT session fixture existed; added preservation tests for five roles, expiry, tampering and HR grant rotation — establishes the required boundary without changing existing signing behavior — cost if wrong: none beyond fixture maintenance.

- Task 3: Ruling: Run the end-to-end approval browser chain in Task 4 after its required role/editor UI exists — the plan assigns UI creation to Task 4 — cost if wrong: browser gaps remain open until that qualification runs.

- Task 3: Ruling: Secure question-bank review in Task 3 and serialize assessment/curriculum mutations with a short shared advisory lock before course locks — approved random question pools otherwise change outside course revision approval, including newly attached shared banks — cost if wrong: concurrent curriculum writes have lower throughput at MVP scale.

- Task 4: Ruling: Extend approval availability to automatic rule enrollment as well as manual rollout — otherwise a rule bypasses publication approval — cost if wrong: new rule assignments wait while a course is draft; existing assignments/history stay intact.

- Task 4: Ruling: Revoke signed sessions when a reset returns the database account to INVITED — makes credential resets effective for already-signed-in users — cost if wrong: reset users must reactivate before continuing.

- Task 4: Ruling: Assert rendered not-found plus absence of course content on unauthorized pages, and strict API denial/scope — Next.js streams late notFound with HTTP 200 — cost if wrong: page consumers cannot use HTTP status alone to detect these denials.

- Task 4: Ruling: Build fictional demo curriculum while draft, and stop adding demo lessons during populated-database startup — startup otherwise changes approved content without a revision or decision — cost if wrong: older demos missing supplemental lessons need explicit draft authoring rather than automatic additions.

- Task 5: Ruling: Perform the single final whole-branch review before main integration while Task 5 is in progress — Task 5 itself requires pre-merge review; a second review after marking it done would duplicate the same gate — cost if wrong: the final integration needs fresh combined-tree checks, which remain required.

- Final: Ruling: Feedback is reviewed in its separately approved implementation plan — phase-one users receive working roles and approval before feedback is added — cost if wrong: feedback remains absent until phase two is integrated.

- Final: Ruling: Provider behavior, physical-device qualification and live email transport remain explicitly unqualified — local provider-free evidence cannot establish external delivery or real-device quality — cost if wrong: those production experiences can still fail until separately verified.

- Final: Ruling: Main integration is authorized, but deployment/CI/provisioning remain release work — a merge does not apply database/schema changes or create hosted HR/Instructor identities — cost if wrong: hosted behavior remains older until a verified release.

- Task 3: Ruling: Custom report end-date means the inclusive “through” calendar date, converted to next local midnight — users choose dates rather than UTC instants; service still uses [start,end) — cost if wrong: external consumers expecting an exclusive calendar end must use the documented through-date semantics.

- Task 4: Ruling: Serialize feedback writes/moderation with account erasure, and run the full existing erasure flow transactionally — otherwise a racing submission can recreate private comments after scrubbing — cost if wrong: erasure holds a per-user transaction longer, while other users remain independent.

- Task 4: Ruling: Send separate course and instructor summaries, with dedupe keys including both interval (week/month) and feedback kind — the plan requests dedicated templates; this also prevents a week and month sharing a start date from colliding — cost if wrong: recipients receive two messages per period rather than a combined one.

- Task 4: Ruling: Allow each role to give feedback on its own completed learner training — the approved role design explicitly gives all five roles “Own learning”; canonical reporting/moderation permissions remain unchanged — cost if wrong: an Employee-only submission policy would need an additional role gate.

- Task 5: Ruling: Run full qualification sequentially — period digests enumerate current recipients, so concurrently creating another fixture's recipients can correctly send it a no-response digest before it submits, defeating that fixture's later expectation — cost if wrong: cross-engine qualification takes longer than parallel UI-only cases.

- Task 5: Ruling: Perform the single final independent review while Task 5 is in progress, before its required main integration — matches the same reviewed integration contract used for roles; a second review after task-done would duplicate it — cost if wrong: final combined-tree checks remain essential and will still run.

- Task 5: Ruling: Keep delivery department as the course department captured at assignment, as Task 1 explicitly prescribes; correct the disclosure to “the course’s Department Head” — this preserves historic training ownership after course/department reassignment and accurately states access — cost if wrong: an attendee-home-department policy would require a separately captured participant department and its own access decision.

- Task 5: Ruling: Use native document links for completed-cycle feedback and CSV downloads — Firefox trace showed HTTP 200 feedback requests while the client transition stayed on the course after renewal; native navigation also refreshes session/owner scope and correctly downloads attachments — cost if wrong: these transitions reload a document instead of staying in the client router.

- Final: Ruling: Reject instructor self-ratings while keeping all roles’ own learning/course feedback and evaluations of other instructors — ordinary quality averages should represent participant evaluations — cost if wrong: a client wishing to collect self-evaluation needs a separate, visibly distinguished instrument.

- Final: Ruling: Skip digest recipients whose access has changed after enumeration under the recipient’s user lock — stale enumeration is expected during erasure/role changes, not a failed notification delivery — cost if wrong: an operational report would need a separate skipped-recipient count.

- Final: Ruling: Production migration/deployment is not qualified by local preservation evidence — no hosted execution occurred in this phase — cost if wrong: hosted release requires its own backup, migration and runtime checks.

- Final: Ruling: Real SMTP delivery remains unqualified — current sender is a console/queued stub — cost if wrong: client email alerts will not arrive until a real transport and delivery checks are completed.

- Final: Ruling: Railway scheduling/missed runs remain open — documented schedules are proposals, not installed services — cost if wrong: period updates will not run automatically on the host.

- Final: Ruling: Provider answers/integrations remain unqualified — this branch’s checks intentionally have empty provider keys — cost if wrong: live AI/integration demonstrations can fail.

- Final: Ruling: Physical devices remain unqualified — emulation and desktop engines do not verify a real device — cost if wrong: hardware-specific media or input defects can remain.

- Final: Ruling: Course dates, scheduled availability, prerequisites and folders remain active delivery work — the client requested them, but this reviewed range covers feedback — cost if wrong: stopping after feedback would leave those requirements missing.

- Final: Ruling: Remaining notification composition/events and verified scheduling remain active delivery work — feedback digests only complete their own in-app contract — cost if wrong: broader employee/team alert requirements remain missing.

- Final: Ruling: Profile, future planning, dashboard and assessment mark-sheet work remains active delivery work — existing profile/history and generic reports do not satisfy the full checklist — cost if wrong: client profile/dashboard demonstrations remain incomplete.

- Final: Ruling: HRMS synchronization and leadership/video-quiz meaning remain active delivery items requiring client details — do not invent an HRMS or claim CSV import is synchronization — cost if wrong: a mismatched connector or workflow would expose/update the wrong employee data.

- Final: Ruling: Unrelated historical DSR retention choices are not newly qualified — this review assessed new feedback fields and changed transaction boundary — cost if wrong: broader data-rights acceptance needs a separate review.

- Final: Ruling: Future main integration still needs combined-tree checks — reviewer’s verdict covers the isolated range — cost if wrong: subsequent audit/main changes could introduce untested interactions.

## Deferred minors

- Final: minor (deferred): Feedback disclosure says “the course’s Department Head” rather than explicitly naming the historical delivery department; access still uses the immutable assignment snapshot.
