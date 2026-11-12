import { describe, expect, it, vi } from "vitest";
import { createLatestProjectWriter, readAsyncProjectSnapshot } from "./async-project-persistence";

describe("Astra async project saves do not block Android navigation", () => {
  it("keeps only the latest snapshot while a previous IndexedDB operation is pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writes: number[] = [];
    const writer = createLatestProjectWriter(async (n: number) => {
      writes.push(n);
      if (n === 1) await gate;
    });
    writer.enqueue(1);
    writer.enqueue(2);
    writer.enqueue(3);
    expect(writes).toEqual([1]);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writes).toEqual([1,3]);
    writer.close();
  });
  it("never submits another IndexedDB write when the current operation hangs", async () => {
    const write = vi.fn((_value:number) => new Promise<void>(() => undefined));
    const writer=createLatestProjectWriter(write);
    writer.enqueue(1);
    for(let n=2;n<200;n++) writer.enqueue(n);
    expect(write).toHaveBeenCalledTimes(1);
    writer.close();
  });
  it("handles an environment with no IndexedDB without inventing restored data", async () => {
    if (typeof indexedDB === "undefined")
      expect(await readAsyncProjectSnapshot()).toBeNull();
  });
});
