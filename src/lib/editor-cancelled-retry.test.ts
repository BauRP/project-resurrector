import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { retry } from "./async";

describe("Android editor stops obsolete media decoder retries", () => {
  it("does not open a second decoder after navigation cancels a failed first attempt", async () => {
    const controller = new AbortController();
    let started = 0;
    const load = vi.fn(async () => {
      started++;
      controller.abort();
      throw new Error("Metadata decoder stopped");
    });
    await expect(retry(load, 2, controller.signal)).rejects.toThrow("Metadata decoder stopped");
    expect(started).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never starts a decoder when opening the editor has already been cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const load = vi.fn(async () => 1);
    await expect(retry(load, 2, controller.signal)).rejects.toThrow("Operation cancelled");
    expect(load).not.toHaveBeenCalled();
  });

  it("still retries transient metadata failures while the editor remains open", async () => {
    const controller = new AbortController();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("Transient failure"))
      .mockResolvedValueOnce({ duration: 15 });
    await expect(retry(load, 2, controller.signal)).resolves.toEqual({ duration: 15 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("leaves a successful late result to its caller for safe Blob URL cleanup", async () => {
    const controller = new AbortController();
    const result = await retry(async () => {
      controller.abort();
      return { url: "blob:late-result" };
    }, 2, controller.signal);
    expect(result.url).toBe("blob:late-result");
  });

  it("passes the actual library AbortSignal to the retry path", () => {
    const source = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(source).toContain("retry(() => analyse(clip, controller.signal), 2, controller.signal)");
    expect(source).toContain("if (!isCurrentEditorLibraryLoad(generation, loadGeneration.current, controller.signal.aborted))");
  });
});
