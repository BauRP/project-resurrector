import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {awaitEditorExportStep} from "./editor-export-deadline";

describe("Editor stops stale WebView encoder waits during navigation",()=>{
 it("returns media metadata when the decoder replies within its deadline",async()=>{
   const ctrl=new AbortController();
   await expect(awaitEditorExportStep(Promise.resolve(7200),1500,ctrl.signal,"late"))
     .resolves.toBe(7200);
 });
 it("interrupts a stuck 30min/1h/2h video metadata load immediately on navigation",async()=>{
   for(const length of [1800,3600,7200]){
     const ctrl=new AbortController();
     const source=new Promise<number>(()=>{});
     const pending=awaitEditorExportStep(source,length*1000,ctrl.signal,"timeout");
     ctrl.abort();
     await expect(pending).rejects.toThrow("Экспорт отменён");
   }
 });
 it("keeps a real timeout error when a decoder stays stuck",async()=>{
   vi.useFakeTimers();
   try{
     const ctrl=new AbortController();
     const pending=awaitEditorExportStep(new Promise<void>(()=>{}),1000,ctrl.signal,
       "Метаданные не ответили");
     const outcome=expect(pending).rejects.toThrow("Метаданные не ответили");
     await vi.advanceTimersByTimeAsync(1000);
     await outcome;
   }finally{vi.useRealTimers();}
 });
 it("does not start work after abort and rejects invalid deadlines",async()=>{
   const ctrl=new AbortController();ctrl.abort();
   await expect(awaitEditorExportStep(Promise.resolve(1),5000,ctrl.signal,"late"))
     .rejects.toThrow("Экспорт отменён");
   const live=new AbortController();
   await expect(awaitEditorExportStep(Promise.resolve(1),-1,live.signal,"late"))
     .rejects.toThrow("Недопустимое время");
 });
 it("both original-quality export paths stop active waits and keep all tracks",()=>{
   const a=readFileSync("src/lib/editor-webm-render.ts","utf8");
   const b=readFileSync("src/lib/editor-sequential-render.ts","utf8");
   for(const source of [a,b]){
     expect(source).toContain('import { awaitEditorExportStep } from "./editor-export-deadline"');
     expect(source).toContain("const pendingWork=new AbortController()");
     expect(source).toContain("pendingWork.abort()");
     expect(source).toContain("awaitEditorExportStep(");
     expect(source).toContain("canvas.captureStream(30)");
   }
   expect(b).toContain("await bounded(loadSequentialSource(");
   expect(b).toContain("audioSource.connect(audioDest)");
   expect(a).toContain("src.connect(dest)");
 });
});
