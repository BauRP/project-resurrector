import { describe, expect, it } from "vitest";
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

  it("releases the queue after an encoder error", async () => {
    const queue = new EditorMediaWorkQueue();
    await expect(queue.run(async () => { throw Error("decoder failed"); })).rejects.toThrow("decoder failed");
    expect(await queue.run(async () => "recovered")).toBe("recovered");
    expect(queue.queuedCount).toBe(0);
  });

  it("routes all timeline background media work through the shared decoder lane", () => {
    const code = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(code).toContain("editorMediaWorkQueue.run(");
    expect(code).toContain("() => analyseWaveformForTimeline(original, m.duration, abort.signal)");
    expect(code).toContain("() => makeThumbs(m.url, m.duration, 10, abort.signal)");
    expect(code).toContain("() => generateProxy(m.id, m.url, abort.signal)");
    expect(code).toContain("abort.abort()");
  });
});
