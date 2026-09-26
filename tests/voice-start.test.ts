import { describe, expect, it, vi } from "vitest";
import { microphoneRequest } from "@/lib/live/client/microphone-request";

describe("microphone permission fallback", () => {
  it("lets typing continue without a decision and stops a late stream", async () => {
    const stop = vi.fn();
    let allow!: (value: { stop: typeof stop }) => void;
    const permission = new Promise<{ stop: typeof stop }>(resolve => { allow = resolve; });
    const pending = microphoneRequest(() => permission);
    pending.skip();
    expect(await pending.result).toBeNull();
    allow({ stop });
    await permission;
    expect(stop).toHaveBeenCalledOnce();
  });
  it("permits normal microphone capture and handles denial as typing", async () => {
    const mic = { stop: vi.fn() };
    expect(await microphoneRequest(() => Promise.resolve(mic)).result).toBe(mic);
    expect(await microphoneRequest(() => Promise.reject(new Error("Denied"))).result).toBeNull();
    expect(mic.stop).not.toHaveBeenCalled();
  });
});
