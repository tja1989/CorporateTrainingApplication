# welearn — voice demo script (10 minutes)

Live site: https://corporatetrainingapplication-production.up.railway.app · password for every demo account: `demo1234`

| Role | ID | Use it for |
|---|---|---|
| Learner | `AE10023` (Farhan) | oral check, assistant |
| Admin | `AE90001` (Amina) | review queue, interview lesson settings |
| Manager | `AE20001` (Joseph) | team page shows oral-check results |

Before you start: Chrome or Safari over HTTPS, allow the microphone when asked, iPhone ringer switch on, a quiet room. Speak in short sentences and pause when you are done. If the room is noisy, the suggested-prompt pills and "Type instead" use the very same live session.

## Flow A — the oral check (pass or fail)

1. Log in as `AE10023` → **Learn** → **Food Safety Essentials** (no sequential lock, so it opens immediately).
2. Open the last module, **Oral check** → lesson **Oral check: show what you learned** (🎙). Read the consent card aloud if the audience cares about privacy: microphone only while the page is open, audio never stored, transcript kept 12 months.
3. Tap **Start the oral check**. The interviewer greets Farhan by name, says it is an AI, and asks question 1 about handwashing or the cold chain.
4. Answer in one or two sentences each. Good answers: "Wash with soap for at least twenty seconds, before the shift and after breaks or handling waste." · "Chilled below five degrees, frozen below minus eighteen; five to sixty is the danger zone." · "Log the fridge temperatures at shift start and never leave a delivery on the dock."
5. After the third answer the interviewer thanks you and the **result card** appears: score, **Passed** or **Not passed** against the pass mark (67 %), per-question feedback. A pass completes the lesson; the course progress ring moves. A fail leaves the lesson open with **Retake**.
6. To show the fail path, retake and answer "I'm not sure" three times.
7. Switch to `AE90001` → **Review queues** → **Oral checks not passed**: transcript, evaluation, **Confirm fail** or **Overturn to pass** (overturning completes the lesson and notifies the learner).
8. Optional: `AE20001` → **My team** → Farhan → **Oral checks** shows the same results with the transcript.

## Flow B — talk to your assistant

1. As `AE10023`: **Ask HR** → **Talk to your assistant** → **Start talking**. The assistant greets Farhan by name.
2. Say: **"How many days of annual leave do I get?"** — it says "let me check", then answers from the Leave & Time Off policy; a policy chip appears.
3. Follow up: **"And what about sick leave?"** — the follow-up is answered from a fresh policy search (this is the latency path that was tuned: non-blocking search, faster end-of-turn detection).
4. Say: **"What training is due for me?"** — the answer comes from Farhan's real enrollments (status, due dates, progress).
5. Say: **"What does the cold chain lesson say?"** — the answer quotes the course lesson and the chip links to it.
6. Say: **"I want to talk to a person."** — the confirmation card appears; nothing is shared until you tap **Share and create ticket**.
7. **End conversation** → **Continue in text** shows the same transcript in the text chat.

## Flow C — configure an interview lesson (admin)

1. `AE90001` → **Courses** → any course → open **+ Add lesson** → type **Interview (voice oral check)**.
2. Set questions, pass mark, max minutes, **Ask about** (previous lesson / this module / whole course), a focus line, and whether passing is required. **Add lesson**.
3. Existing interview lessons show a summary line; expand **Oral check · …** to edit and **Save oral check**.

## What the audience is seeing

- The browser talks to Gemini Live directly with a **one-use token** that has the prompt and tools locked in; the API key never leaves the server.
- The assistant can only speak what its tools return: HR policy search (with the same guardrails as the text chat), the learner's course content, and their training status. Escalation always needs an on-screen confirmation.
- Oral checks are graded on a fixed rubric; fails go to a human queue and can be overturned. Nothing about pay or employment is decided by the model.
- Without a Gemini key the same screens run as a labeled **offline demo** (typed), using the same tools and an offline grader.
