import { describe, expect, it } from "vitest";
import { LIVE_MODEL_CANDIDATES, estimateLiveCost, parseDuration, pickLiveModel } from "@/lib/live/gemini";
import { EvaluationSchema, buildInterviewConfig, interviewContentFor, maxMinutesFor, mockEvaluate, mockQuestions, pairTranscript, scoreEvaluation } from "@/lib/live/interview";
import { HR_TOOLS, buildHrLiveConfig } from "@/lib/live/hr-voice";
import { base64ToBytes, bytesToBase64, downsample, floatTo16BitPCM, pcm16ToFloat32 } from "@/lib/live/client/audio";

describe("live model resolution (spec FR-14.1)", () => {
  it("prefers an explicit override even when the list disagrees", () => {
    expect(pickLiveModel(["models/gemini-live-2.5-flash-preview"], "gemini-2.0-flash-live-001")).toMatchObject({ model: "gemini-2.0-flash-live-001" });
    expect(pickLiveModel(["models/gemini-live-2.5-flash-preview"], "gemini-2.0-flash-live-001").warning).toMatch(/not in this key/);
    expect(pickLiveModel(["models/gemini-2.0-flash-live-001"], "models/gemini-2.0-flash-live-001").warning).toBeUndefined();
  });
  it("walks the candidate list in order", () => {
    expect(pickLiveModel(["models/gemini-live-2.5-flash-preview", "models/gemini-2.5-flash-native-audio-latest"]).model).toBe(LIVE_MODEL_CANDIDATES[0]);
    expect(pickLiveModel(["models/gemini-2.0-flash-live-001"]).model).toBe("gemini-2.0-flash-live-001");
  });
  it("falls back to the default when the list is empty and to null when nothing fits", () => {
    expect(pickLiveModel([]).model).toBe(LIVE_MODEL_CANDIDATES[0]);
    expect(pickLiveModel(["models/gemini-2.5-flash"]).model).toBeNull();
  });
  it("parses protobuf durations and prices audio separately from text", () => {
    expect(parseDuration("10s")).toBe(10);
    expect(parseDuration("1.5s")).toBe(1.5);
    expect(parseDuration("soon")).toBeNull();
    expect(estimateLiveCost({ inputAudioTokens: 1_000_000 })).toBeGreaterThan(estimateLiveCost({ inputTokens: 1_000_000 }));
  });
});

describe("oral check rubric (spec FR-14.2)", () => {
  const ev = (scores: number[]) => ({ questions: scores.map((score, i) => ({ question: `Q${i}`, answer_summary: "", score, feedback: "" })), overall_summary: "" });
  it("passes at two thirds of the rubric and routes anything lower to review", () => {
    expect(scoreEvaluation(ev([3, 3, 3]))).toEqual({ pct: 100, outcome: "PASS" });
    expect(scoreEvaluation(ev([2, 2, 2]))).toEqual({ pct: 67, outcome: "PASS" });
    expect(scoreEvaluation(ev([1, 2, 2]))).toEqual({ pct: 56, outcome: "NEEDS_REVIEW" });
    expect(scoreEvaluation(ev([]))).toEqual({ pct: 0, outcome: "NEEDS_REVIEW" });
  });
  it("validates the model's submission strictly", () => {
    expect(EvaluationSchema.safeParse({ questions: [{ question: "Q", answer_summary: "A", score: 2, feedback: "F" }], overall_summary: "ok" }).success).toBe(true);
    expect(EvaluationSchema.safeParse({ questions: [{ question: "Q", answer_summary: "A", score: 4, feedback: "F" }], overall_summary: "ok" }).success).toBe(false);
    expect(EvaluationSchema.safeParse({ questions: [], overall_summary: "ok" }).success).toBe(false);
  });
  it("scales the time box with the accommodation and caps it under the connection limit", () => {
    expect(maxMinutesFor(1)).toBe(6);
    expect(maxMinutesFor(1.5)).toBe(9);
    expect(maxMinutesFor(2)).toBe(9);
  });
  it("only interviews on ready video transcripts and text bodies", () => {
    const chunks = [{ text: "Greet every customer within ten seconds of arrival." }];
    expect(interviewContentFor({ type: "VIDEO", title: "V", payload: {} }, { ingestionStatus: "READY" }, chunks)?.source).toBe("video");
    expect(interviewContentFor({ type: "VIDEO", title: "V", payload: {} }, { ingestionStatus: "PENDING" }, chunks)).toBeNull();
    expect(interviewContentFor({ type: "TEXT", title: "T", payload: { body: "x".repeat(100) } })?.source).toBe("text");
    expect(interviewContentFor({ type: "TEXT", title: "T", payload: { body: "short" } })).toBeNull();
    expect(interviewContentFor({ type: "PDF", title: "P", payload: {} })).toBeNull();
    expect(interviewContentFor({ type: "QUIZ", title: "Q", payload: {} })).toBeNull();
    const long = interviewContentFor({ type: "TEXT", title: "T", payload: { body: "y".repeat(40_000) } });
    expect(long?.text.length).toBe(24_000);
  });
  it("locks audio, transcription and exactly one tool into the interview config", () => {
    const cfg = buildInterviewConfig({ learnerFirstName: "Farhan", courseTitle: "C", lessonTitle: "L", content: { title: "L", text: "Wash hands for 20 seconds.", source: "text" }, maxMinutes: 6 });
    expect(cfg.responseModalities).toEqual(["AUDIO"]);
    expect(cfg.inputAudioTranscription).toBeDefined();
    expect(cfg.outputAudioTranscription).toBeDefined();
    const names = (cfg.tools as Array<{ functionDeclarations: Array<{ name: string }> }>).flatMap((t) => t.functionDeclarations.map((f) => f.name));
    expect(names).toEqual(["submit_evaluation"]);
    expect(String(cfg.systemInstruction)).toContain("Wash hands for 20 seconds.");
    expect(String(cfg.systemInstruction)).toContain("Farhan");
  });
  it("grades offline by overlap, monotonically", () => {
    const content = { title: "Hand hygiene", text: "Wash hands with soap for twenty seconds before handling food and after touching waste.", source: "text" as const };
    const good = mockEvaluate(content, [{ question: "q", answer: "Wash hands with soap for twenty seconds before handling food" }]);
    const weak = mockEvaluate(content, [{ question: "q", answer: "I think you should be careful" }]);
    const none = mockEvaluate(content, [{ question: "q", answer: "no" }]);
    expect(good.questions[0].score).toBeGreaterThanOrEqual(weak.questions[0].score);
    expect(weak.questions[0].score).toBeGreaterThanOrEqual(none.questions[0].score);
    expect(none.questions[0].score).toBe(0);
    expect(mockQuestions(content, 3).length).toBeGreaterThan(0);
  });
  it("pairs interviewer questions with the learner's next answer", () => {
    const qa = pairTranscript([
      { role: "assistant", text: "Hi! First question: why wash hands?" },
      { role: "user", text: "To remove germs." },
      { role: "assistant", text: "Thanks." },
      { role: "assistant", text: "How long should you wash?" },
      { role: "user", text: "Twenty seconds." },
    ]);
    expect(qa).toEqual([
      { question: "Hi! First question: why wash hands?", answer: "To remove germs." },
      { question: "How long should you wash?", answer: "Twenty seconds." },
    ]);
  });
});

describe("HR live config (spec FR-14.3)", () => {
  it("declares the search and escalation tools and audio with transcription", () => {
    const cfg = buildHrLiveConfig();
    expect(HR_TOOLS.map((t) => t.name)).toEqual(["search_hr_policy", "escalate_to_hr"]);
    expect(cfg.responseModalities).toEqual(["AUDIO"]);
    expect(cfg.outputAudioTranscription).toBeDefined();
    expect(String(cfg.systemInstruction)).toMatch(/search_hr_policy/);
    expect(buildHrLiveConfig({ resumeHandle: "h1" }).sessionResumption).toEqual({ handle: "h1" });
  });
});

describe("audio helpers", () => {
  it("round-trips PCM16 and base64", () => {
    const f = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const pcm = floatTo16BitPCM(f);
    const back = pcm16ToFloat32(new Uint8Array(pcm.buffer));
    for (let i = 0; i < f.length; i++) expect(Math.abs(back[i] - f[i])).toBeLessThan(0.001);
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
  it("downsamples by the rate ratio", () => {
    const input = new Float32Array(48_000).fill(0.25);
    const out = downsample(input, 48_000, 16_000);
    expect(out.length).toBe(16_000);
    expect(out[10]).toBeCloseTo(0.25, 5);
    expect(downsample(input, 16_000, 16_000)).toBe(input);
  });
});
