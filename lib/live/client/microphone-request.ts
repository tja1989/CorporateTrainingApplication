/** A browser permission prompt can remain unanswered. Let typing/end win,
 * and close any microphone stream that arrives after that choice. */
export function microphoneRequest<T extends { stop(): void }>(request: () => Promise<T>) {
  let discard = false;
  let finish!: (value: T | null) => void;
  const result = new Promise<T | null>(resolve => { finish = resolve; });
  void request().then(microphone => {
    if (discard) microphone.stop();
    else finish(microphone);
  }, () => finish(null));
  return {
    result,
    skip() { discard = true; finish(null); },
  };
}
