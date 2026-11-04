import {describe,it,expect,vi} from "vitest";
import {createSerializedAsyncActions} from "./serialized-preview-operations";
describe("fold preview native operation serialization",()=>{
 it("reports a failed show and still processes the next hide",async()=>{
  const enqueue=createSerializedAsyncActions();
  const calls:string[]=[];
  const show=enqueue(async()=>{calls.push("show");throw new Error("surface rejected");});
  const hide=enqueue(async()=>{calls.push("hide");});
  await expect(show).rejects.toThrow("surface rejected");
  await hide;
  expect(calls).toEqual(["show","hide"]);
 });
 it("preserves ordering when delayed native show finishes after unmount",async()=>{
  const enqueue=createSerializedAsyncActions();
  let finish!:()=>void;
  const pending=new Promise<void>(resolve=>{finish=resolve;});
  const calls:string[]=[];
  const show=enqueue(async()=>{calls.push("show");await pending;});
  const hide=enqueue(async()=>{calls.push("hide");});
  expect(calls).toEqual([]);
  finish();
  await Promise.all([show,hide]);
  expect(calls).toEqual(["show","hide"]);
 });
});
describe("emulator direct-preview lost callback recovery", () => {
 it("allows the queued hide after a show promise never settles", async() => {
  vi.useFakeTimers();
  try {
    const enqueue=createSerializedAsyncActions(1500);
    const calls:string[]=[];
    const show=enqueue(async()=>{calls.push("show");await new Promise<void>(()=>{});});
    const hidden=enqueue(async()=>{calls.push("hide");});
    const rejected=expect(show).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(1500);
    await rejected;
    await hidden;
    expect(calls).toEqual(["show","hide"]);
  } finally { vi.useRealTimers(); }
 });
});
