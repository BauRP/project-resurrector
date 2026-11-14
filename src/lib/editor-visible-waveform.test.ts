import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {visibleWaveformColumns} from "./editor-visible-waveform";
describe("long-form Editor waveform viewport",()=>{
  const longPeaks=Array.from({length:7200*20},(_,i)=>i===7200*20-1?1:0.2);
  it("keeps 30-minute, 1-hour, 2-hour waveforms bounded to screen columns",()=>{
    for(const seconds of [1800,3600,7200]){
      const clipWidth=seconds*8;
      const peaks=longPeaks.slice(0,seconds*20);
      for(const left of [0,clipWidth/2,clipWidth-320]){
        const columns=visibleWaveformColumns(peaks,seconds,0,seconds,false,0,clipWidth,8,left,320,104);
        expect(columns.length).toBeGreaterThan(0);
        expect(columns.length).toBeLessThanOrEqual(512);
      }
    }
    const source=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
    expect(source).toContain("visibleWaveformColumns(m.peaks, m.duration");
    expect(source).not.toContain("const seg = m.peaks.slice(a, b)");
  });
  it("retains a peak at the end and in reverse",()=>{
    const right=7200*8+104-320;
    const forward=visibleWaveformColumns(longPeaks,7200,0,7200,false,0,7200*8,8,right,320,104);
    const backward=visibleWaveformColumns(longPeaks,7200,0,7200,true,0,7200*8,8,0,320,104);
    expect(Math.max(...forward.map(p=>p.height))).toBe(96);
    expect(Math.max(...backward.map(p=>p.height))).toBe(96);
  });
  it("merges peaks at tiny zoom using maxima without deleting any samples",()=>{
    const peaks=Array(144000).fill(0.1);peaks[71000]=1;
    const columns=visibleWaveformColumns(peaks,7200,0,7200,false,0,360,0.05,0,360,0);
    expect(columns.length).toBeLessThanOrEqual(512);
    expect(Math.max(...columns.map(p=>p.height))).toBe(96);
    expect(peaks.length).toBe(144000);
  });
  it("handles offscreen ranges and corrupted input",()=>{
    expect(visibleWaveformColumns([1],10,0,10,false,0,100,10,1000,320,104)).toEqual([]);
    expect(visibleWaveformColumns([1],10,0,10,false,0,Infinity,10,0,320,104)).toEqual([]);
  });
});
