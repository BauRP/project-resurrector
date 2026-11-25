import { describe, expect, it, vi } from "vitest";
import { EditorMediaWorkQueue } from "./editor-media-work-queue";
import { readFileSync } from "node:fs";

describe("editor media workload prevents concurrent Android WebView decoders", () => {
  it("serializes unrelated waveform/thumbnail/proxy operations", async () => {
    const queue = new EditorMediaWorkQueue();
    const order: string[] = [];
    let finish!: () => void;
    const first = queue.run(async () => {
      order.push("waveform-start");
      await new Promise<void>(resolve => { finish = resolve; });
      order.push("waveform-end");
      return 42;
    });
    const second = queue.run(async () => {
      order.push("proxy-start");
      return 7;
    });
    await Promise.resolve();
    expect(order).toEqual(["waveform-start"]);
    expect(queue.queuedCount).toBe(2);
    finish();
    expect(await Promise.all([first, second])).toEqual([42, 7]);
    expect(order).toEqual(["waveform-start", "waveform-end", "proxy-start"]);
    expect(queue.queuedCount).toBe(0);
  });

  it("skips cancelled queued work without starving later media operations", async () => {
    const queue = new EditorMediaWorkQueue();
    let release!: () => void;
    const inFlight = queue.run(async () => new Promise<void>(resolve => { release = resolve; }));
    const abort = new AbortController();
    const skipped = queue.run(async () => { throw Error("cancelled decoder was started"); }, abort.signal);
    const subsequent = queue.run(async () => "ready");
    await Promise.resolve();
    abort.abort();
    release();
    await inFlight;
    expect(await skipped).toBeUndefined();
    expect(await subsequent).toBe("ready");
    expect(queue.queuedCount).toBe(0);
  });

  it("lets the browser process input between consecutive expensive media jobs", async () => {
    vi.useFakeTimers();
    try {
      const queue = new EditorMediaWorkQueue();
      let finishFirst!: () => void;
      const first = queue.run(() => new Promise<number>(resolve => { finishFirst = () => resolve(1); }));
      let secondStarted = false;
      const second = queue.run(async () => { secondStarted = true; return 2; });
      await Promise.resolve();
      finishFirst();
      expect(await first).toBe(1);
      expect(secondStarted).toBe(false); // no microtask-chain decoder monopolizing WebView
      expect(queue.queuedCount).toBe(1);
      await vi.runOnlyPendingTimersAsync();
      expect(await second).toBe(2);
      expect(queue.queuedCount).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("releases the queue after an encoder error", async () => {
    const queue = new EditorMediaWorkQueue();
    await expect(queue.run(async () => { throw Error("decoder failed"); })).rejects.toThrow("decoder failed");
    expect(await queue.run(async () => "recovered")).toBe("recovered");
    expect(queue.queuedCount).toBe(0);
  });

  it("routes all timeline background media work through the shared decoder lane", () => {
    const code = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(code).toContain("editorMediaWorkQueue.run(");
    expect(code).toContain("() => analyseWaveformForTimeline(original, m.duration, attemptSignal)");
    expect(code).toContain("runEditorQuietMediaWork(abort.signal, () => playbackActive.current");
    expect(code).toContain("() => makeThumbs(m.url, m.duration, 10, attemptSignal)");
    expect(code).toContain("() => generateProxy(\`\${m.id}:\${m.sourceKey}\`, m.url, attemptSignal)");
    expect(code).toContain("abort.abort()");
  });
});


describe("cancelled editor decoder work is removed immediately", () => {
  it("releases hundreds of canceled waits without waiting for an active codec", async () => {
    const queue = new EditorMediaWorkQueue();
    let release!: () => void;
    const active = queue.run(() => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    const controllers = Array.from({ length: 200 }, () => new AbortController());
    const cancelled = controllers.map(controller =>
      queue.run(async () => { throw new Error("cancelled media must not start"); }, controller.signal)
    );
    expect(queue.queuedCount).toBe(201);
    controllers.forEach(controller => controller.abort());
    expect(await Promise.all(cancelled)).toEqual(Array(200).fill(undefined));
    expect(queue.queuedCount).toBe(1);
    release();
    await active;
    expect(queue.queuedCount).toBe(0);
  });

  it("does not start another codec before a canceled active one finishes releasing MediaCodec", async () => {
    const queue = new EditorMediaWorkQueue();
    const cancelActive = new AbortController();
    let release!: () => void;
    let secondStarted = false;
    const first = queue.run(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      return "finished cleanup";
    }, cancelActive.signal);
    await Promise.resolve();
    const second = queue.run(async () => {
      secondStarted = true;
      return "next";
    });
    cancelActive.abort();
    await Promise.resolve();
    expect(secondStarted).toBe(false);
    expect(queue.queuedCount).toBe(2);
    release();
    expect(await first).toBe("finished cleanup");
    expect(await second).toBe("next");
    expect(queue.queuedCount).toBe(0);
  });

  it("skips an already-aborted request without touching the shared queue", async () => {
    const queue = new EditorMediaWorkQueue();
    const controller = new AbortController();
    controller.abort();
    expect(await queue.run(async () => { throw Error("should not start"); }, controller.signal)).toBeUndefined();
    expect(queue.queuedCount).toBe(0);
  });
});

describe("editor media jobs scheduled by completion callbacks", () => {
  it("yields an event-loop turn even when the next job arrives after the queue empties", async () => {
    vi.useFakeTimers();
    try {
      const queue = new EditorMediaWorkQueue();
      expect(await queue.run(async () => 1)).toBe(1);
      let started = false;
      const next = queue.run(async () => { started = true; return 2; });
      await Promise.resolve();
      expect(started).toBe(false);
      await vi.runOnlyPendingTimersAsync();
      expect(await next).toBe(2);
      expect(queue.queuedCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
