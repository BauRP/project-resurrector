import {afterEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {probeEditorImportDuration} from "./editor-import-duration";

afterEach(()=>vi.restoreAllMocks());
describe("cached metadata for imported long original video",()=>{
 it("records actual 30-minute, 1-hour and 2-hour durations without altering the file",async()=>{
   for(const duration of [1800,3600,7200]){
     const file=new Blob(["original media bytes"],{type:"video/mp4"});
     const create=vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:import-duration");
     const revoke=vi.spyOn(URL,"revokeObjectURL").mockImplementation(()=>{});
     const load=vi.spyOn(HTMLMediaElement.prototype,"load").mockImplementation(function(this:HTMLMediaElement){
       Object.defineProperty(this,"duration",{configurable:true,value:duration});
       queueMicrotask(()=>this.dispatchEvent(new Event("loadedmetadata")));
     });
     vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
     await expect(probeEditorImportDuration(file,"video")).resolves.toBe(duration);
     expect(file.size).toBe("original media bytes".length);
     expect(create).toHaveBeenCalled();
     expect(revoke).toHaveBeenCalledWith("blob:import-duration");
     load.mockRestore();
     create.mockRestore();
     revoke.mockRestore();
     vi.restoreAllMocks();
   }
 });
 it("returns null for unknown codecs without deleting or modifying the imported file",async()=>{
   const file=new Blob(["original unknown codec"],{type:"video/mp4"});
   vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:unknown");
   const revoke=vi.spyOn(URL,"revokeObjectURL").mockImplementation(()=>{});
   vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
   vi.spyOn(HTMLMediaElement.prototype,"load").mockImplementation(function(this:HTMLMediaElement){
     queueMicrotask(()=>this.dispatchEvent(new Event("error")));
   });
   await expect(probeEditorImportDuration(file,"video")).resolves.toBeNull();
   expect(revoke).toHaveBeenCalledWith("blob:unknown");
   const source=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
   expect(source).toContain("const duration = await probeEditorImportDuration(file, kind)");
   expect(source).toContain("duration === null ? {} : {duration}");
   expect(source).toContain("blob: file, kind");
   expect(source).toContain("const recorded = selectEditorClipDuration(Number.NaN, clip.duration)");
 });
});
