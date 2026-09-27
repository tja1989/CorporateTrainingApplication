# External qualification gates

**Status: UNVERIFIED.** The user confirmed that approved staging access is unavailable and instructed us to retain this status for real AI/voice services and physical iPhone testing. This document is a later execution checklist, not evidence of a pass. It does not waive the local browser gates in [QUALIFICATION.md](QUALIFICATION.md).

Use an approved environment with synthetic accounts, reviewed test content and configured services. Record the application commit, build ID, environment URL, service/model configuration names, date, browser version and actual device. Do not put keys, session cookies or private employee conversations in the report. A configured health flag alone does not qualify an integration.

## Real AI services

Exercise each configured AI surface through its actual UI, without replacing provider responses:

| Journey | Required result |
|---|---|
| Learner opens a video, asks a grounded Tutor question and follows a citation | The answer streams, cites accessible source content, and opens the correct lesson/timestamp. Check the answer against an accurate reviewed transcript; the illustrative public WHO transcript is insufficient for semantic qualification. |
| Learner asks HR a supported question, an unsupported question and a sensitive question | Supported claims match the applicable policy version and user scope. Unsupported answers acknowledge missing evidence. Escalation previews the actual conversation, requires consent and creates the correct ticket; an administrator can reply and the learner sees that reply. |
| Administrator ingests content, requests question drafts, reviews and accepts or discards them | Real service output is reviewable in every supported question format. Nothing publishes before the human action; accepted/discarded outcomes persist. Failed ingestion or generation preserves the working content and allows recovery. |
| Manager and administrator use Ask Reports | The displayed interpretation and result agree with the chosen filters and persisted data. Manager results remain limited to their assigned team, including empty teams. |
| Learner submits a response that requires AI grading, then a human reviews it | Provisional results stay provisional until the required decision. Confirmation, adjustment, appeal and resulting completion/certificate behavior agree across learner and reviewer screens. |

For each applicable surface, also exercise an approved provider-unavailable, timeout or interrupted-network condition. The UI must retain recoverable input, explain failure and retry without duplicate side effects or fabricated success. Record whether the failure came from a controlled fault or the real provider. Existing local fault tests do not prove real-provider behavior.

## Real voice services

Run both HR voice and an oral assessment. Start from the consent UI, verify the real connection, speak and hear a response, inspect captions and follow an applicable citation. Exercise typing fallback, interruption, temporary connection loss, reconnect and explicit ending. Verify that a reconnect retains the intended session and that ending stops its connection and microphone tracks.

Complete the HR escalation handoff and the oral pass/fail/retake/human-review handoff through the UI. Verify stored transcripts, ownership, final/provisional outcomes and the same course-completion rules used by the local suite. On a shared-device login, verify that old HR history requires password verification while a new current-login conversation remains usable. A mocked WebSocket or injected provider-configuration flag cannot pass this gate.

## Physical iPhone Safari

Use an actual supported iPhone and record its model and iOS/Safari version. Desktop Chrome or WebKit at a mobile viewport does not qualify this gate.

1. Sign in and complete a real embedded-video flow: normal playback, pause, leave/reopen, resume, seek near the end and then legitimate watched-coverage completion. Seeking alone must not complete the lesson. Confirm course state after reload.
2. Use real HR voice and an oral check. Verify the permission prompt, grant and denied-permission recovery, typing fallback, audio output, interruption, reconnection and ending. If the tester cancels while permission is pending, a late grant must not start an unwanted session or leave the microphone active.
3. Check portrait and landscape layouts, the on-screen keyboard, safe areas, drawers/dialogs and focused controls. Complete a representative learner form without an obscured submit action or horizontal page overflow.
4. Background and return to the active flow, then reload or follow Back where supported. Verify honest session expiry/recovery, retained permitted state and shared-device HR reauthentication. Record platform limitations separately from product defects.

## Pass criteria and evidence

For every journey record the role, prerequisites, ordered UI actions, expected and actual result, persistence/cross-role verification, and screenshots or a trace/recording. Include errors and recovery, not only the successful endpoint. Screenshots of a ready player or connection badge alone are insufficient.

Mark a gate **PASSED** only after every applicable journey above succeeds on the recorded build and environment, with no unresolved defect that prevents or materially misrepresents its outcome. A failed case remains **FAILED** until a named repair and rerun supersede it. Missing access, credentials, device or evidence leaves the relevant gate **UNVERIFIED**; partial work does not count as a pass. Retain historical failures and explicitly identify any later build changes requiring affected journeys to be repeated.

Client visual approval and production deployment are separate decisions; neither is implied by passing these technical gates.
