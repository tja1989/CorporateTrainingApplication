/**
 * Key-backed smoke test for the Gemini Live integration (spec FR-14).
 * Proves, without a microphone: model resolution, one-use constrained token
 * minting, a constrained Live connection, a text turn with output
 * transcription, a tool round-trip, and usage metadata.
 *
 *   GEMINI_API_KEY=… npx tsx scripts/live-smoke.ts
 */
import { GoogleGenAI, type LiveServerMessage } from "@google/genai";
import { loadEnv } from "@/lib/env";
import { mintLiveToken, resolveLiveModel } from "@/lib/live/gemini";
import { buildHrLiveConfig } from "@/lib/live/hr-voice";
import { KICKOFF_TEXT } from "@/lib/live/shared";

loadEnv();

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const { model, warning } = await resolveLiveModel();
  console.log("model:", model, warning ? `(${warning})` : "");
  const { token, expiresAt } = await mintLiveToken({ model, config: buildHrLiveConfig() });
  console.log("token:", token.slice(0, 24) + "…", "expires", expiresAt);

  const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
  let transcript = "";
  let toolCalls = 0;
  let audioBytes = 0;
  let askedAt = 0;
  let toolAt = 0;
  let firstAudioAfterAsk = 0;
  let usage: LiveServerMessage["usageMetadata"] | undefined;
  let done: () => void = () => {};
  const finished = new Promise<void>((r) => (done = r));
  const deadline = setTimeout(() => done(), 45_000);

  const session = await ai.live.connect({
    model,
    callbacks: {
      onopen: () => console.log("open"),
      onmessage: (m) => {
        if (m.toolCall?.functionCalls?.length) {
          for (const fc of m.toolCall.functionCalls) {
            toolCalls++;
            toolAt = Date.now();
            console.log("tool call:", fc.name, JSON.stringify(fc.args));
            session.sendToolResponse({
              functionResponses: [
                {
                  id: fc.id,
                  name: fc.name,
                  response: {
                    found: true,
                    excerpts: [{ index: 0, policy: "Leave & Time Off Policy", section: "Annual leave", text: "Colleagues accrue 30 calendar days of annual leave per year of service." }],
                    instruction: "Answer in one short sentence from this excerpt.",
                  },
                },
              ],
            });
          }
        }
        if (m.serverContent?.outputTranscription?.text) transcript += m.serverContent.outputTranscription.text;
        if (m.data) {
          audioBytes += Buffer.from(m.data, "base64").length;
          if (askedAt && toolAt && !firstAudioAfterAsk && Date.now() > toolAt) firstAudioAfterAsk = Date.now();
        }
        if (m.usageMetadata) usage = m.usageMetadata;
        if (m.serverContent?.turnComplete && toolCalls > 0 && transcript.length > 20) done();
      },
      onerror: (e) => console.log("error:", e.message),
      onclose: (e) => console.log("close:", e.code, e.reason),
    },
  });
  session.sendClientContent({ turns: KICKOFF_TEXT, turnComplete: true });
  await new Promise((r) => setTimeout(r, 4000));
  askedAt = Date.now();
  session.sendClientContent({ turns: "How many days of annual leave do I get?", turnComplete: true });
  await finished;
  if (toolAt) console.log(`timing: question → tool call ${toolAt - askedAt} ms; tool call → first answer audio ${firstAudioAfterAsk ? firstAudioAfterAsk - toolAt : "n/a"} ms`);
  clearTimeout(deadline);
  session.close();
  console.log("transcript:", transcript.trim());
  console.log("tool calls:", toolCalls, "| audio bytes:", audioBytes, "| usage:", JSON.stringify(usage ?? null));
  if (toolCalls === 0) throw new Error("The model never called search_hr_policy — check the prompt/tools in the token constraints");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
