/**
 * Browser audio for Gemini Live (spec FR-14.1): microphone → 16 kHz PCM16
 * frames, and 24 kHz PCM16 playback with interruption support. The pure
 * helpers at the top are unit-tested in node.
 */

export const MIC_RATE = 16_000;
export const PLAYBACK_RATE = 24_000;

export function floatTo16BitPCM(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

export function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength - (bytes.byteLength % 2));
  const out = new Float32Array(view.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** Box-filter decimation — adequate for speech going to an ASR model. */
export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || fromRate < toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Microphone capture (AudioWorklet registered from a Blob URL — no public file)
// ---------------------------------------------------------------------------

const WORKLET_SRC = `
class LlPcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${MIC_RATE};
    this.buf = new Int16Array(2048);
    this.n = 0;
    this.acc = 0;
    this.sum = 0;
    this.cnt = 0;
    this.frames = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let sq = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = ch[i];
      sq += s * s;
      this.sum += s;
      this.cnt += 1;
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.cnt));
        this.sum = 0;
        this.cnt = 0;
        this.buf[this.n++] = v < 0 ? v * 32768 : v * 32767;
        if (this.n === this.buf.length) {
          this.port.postMessage({ type: "chunk", pcm: this.buf.slice(0).buffer });
          this.n = 0;
        }
      }
    }
    if (++this.frames % 4 === 0) this.port.postMessage({ type: "level", rms: Math.sqrt(sq / ch.length) });
    return true;
  }
}
registerProcessor("ll-pcm-downsampler", LlPcmDownsampler);
`;

export type MicCapture = {
  mute(): void;
  unmute(): void;
  readonly muted: boolean;
  stop(): void;
};

export function micSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== "undefined";
}

export async function createMicCapture(opts: { onChunk: (base64Pcm: string) => void; onLevel: (rms: number) => void }): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext(); // device rate; the worklet downsamples to 16 kHz
  const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "ll-pcm-downsampler", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
  const sink = ctx.createGain();
  sink.gain.value = 0; // keeps the worklet pulled by the graph without audible feedback
  source.connect(node);
  node.connect(sink);
  sink.connect(ctx.destination);
  let muted = false;
  node.port.onmessage = (e: MessageEvent<{ type: "chunk"; pcm: ArrayBuffer } | { type: "level"; rms: number }>) => {
    if (e.data.type === "level") {
      opts.onLevel(muted ? 0 : e.data.rms);
    } else if (!muted) {
      opts.onChunk(bytesToBase64(new Uint8Array(e.data.pcm)));
    }
  };
  if (ctx.state === "suspended") void ctx.resume();
  return {
    get muted() {
      return muted;
    },
    mute() {
      muted = true;
    },
    unmute() {
      muted = false;
    },
    stop() {
      node.port.onmessage = null;
      try {
        source.disconnect();
        node.disconnect();
        sink.disconnect();
      } catch {
        /* already torn down */
      }
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

export type Player = {
  /** Call synchronously inside a user gesture before any await (iOS autoplay). */
  unlock(): Promise<void>;
  enqueue(pcm: Uint8Array): void;
  flush(): void;
  testTone(): void;
  close(): void;
  onIdle: (() => void) | null;
  readonly speaking: boolean;
};

export function createPlayer(): Player {
  const ctx = new AudioContext(); // device rate; 24 kHz buffers are resampled on playback
  let nextTime = 0;
  const active = new Set<AudioBufferSourceNode>();
  const player: Player = {
    onIdle: null,
    get speaking() {
      return active.size > 0;
    },
    async unlock() {
      if (ctx.state === "suspended") await ctx.resume();
    },
    enqueue(pcm) {
      const samples = pcm16ToFloat32(pcm);
      if (samples.length === 0) return;
      const buffer = ctx.createBuffer(1, samples.length, PLAYBACK_RATE);
      buffer.getChannelData(0).set(samples);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const at = Math.max(ctx.currentTime + 0.05, nextTime);
      src.start(at);
      nextTime = at + buffer.duration;
      active.add(src);
      src.onended = () => {
        active.delete(src);
        if (active.size === 0) player.onIdle?.();
      };
    },
    flush() {
      for (const src of active) {
        try {
          src.onended = null;
          src.stop();
        } catch {
          /* not started yet */
        }
      }
      active.clear();
      nextTime = 0;
      player.onIdle?.();
    },
    testTone() {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.08;
      osc.frequency.value = 660;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    },
    close() {
      player.flush();
      void ctx.close();
    },
  };
  return player;
}
