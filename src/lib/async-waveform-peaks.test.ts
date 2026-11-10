import {describe,expect,it,vi} from "vitest";
import {extractWaveformPeaks} from "./async-waveform-peaks";
describe("asynchronous waveform extraction keeps original peak density",()=>{
 it("preserves exact peak maxima rather than dropping channels or periods",async()=>{
  const samples=new Float32Array(44100);
  samples[0]=0.5;samples[2205]=0.8;samples[44099]=-1;
  const peaks=await extractWaveformPeaks(samples,1);
  expect(peaks).toHaveLength(20);
  expect(peaks[0]).toBeCloseTo(0.5);
  expect(peaks[1]).toBeCloseTo(0.8);
  expect(peaks[19]).toBeCloseTo(1);
 });
 it("can stop an old waveform generation on editor unmount",async()=>{
  const cancelled=vi.fn(()=>true);
  await expect(extractWaveformPeaks(new Float32Array(100),1,cancelled)).rejects.toThrow("прерван");
 });

 it("yields inside a huge waveform column before the next column",async()=>{
  // 20 columns only: the old 512-column yield was never reached.
  const samples=new Float32Array(400_000);
  samples[399_999]=-0.95;
  const timer=vi.spyOn(globalThis,"setTimeout");
  try {
   const peaks=await extractWaveformPeaks(samples,1);
   expect(timer).toHaveBeenCalled();
   expect(peaks).toHaveLength(20);
   expect(peaks[19]).toBeCloseTo(0.95);
  } finally { timer.mockRestore(); }
 });
 it("cancels while scanning one long waveform column",async()=>{
  const samples=new Float32Array(400_000);
  const timer=vi.spyOn(globalThis,"setTimeout");
  try {
   await expect(extractWaveformPeaks(samples,1,()=>timer.mock.calls.length>0)).rejects.toThrow("прерван");
  } finally { timer.mockRestore(); }
 });
});
