import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {selectedVideoItemId,detachedAudioMediaIds} from "./editor-timeline-lookup";
describe("large timeline lookups preserve selection, audio and playback",()=>{
 const video=(id:string,mediaId=id)=>({id,mediaId,kind:"video" as const});
 const audio=(id:string,mediaId=id)=>({id,mediaId,kind:"audio" as const});
 it("selecting sound or empty space never suppresses visible video",()=>{
   const items=[video("v1"),video("v2"),audio("a1","v1")];
   expect(selectedVideoItemId(items,null)).toBeNull();
   expect(selectedVideoItemId(items,"a1")).toBeNull();
   expect(selectedVideoItemId(items,"v1")).toBe("v1");
   expect(selectedVideoItemId(items,"unknown")).toBeNull();
 });
 it("detached sound mutes only its source video's embedded audio",()=>{
   const items=[video("v1"),video("v2"),audio("a1","v1")];
   const detached=detachedAudioMediaIds(items);
   expect(detached.has("v1")).toBe(true);
   expect(detached.has("v2")).toBe(false);
   expect(detached.size).toBe(1);
 });
 it("keeps lookup cost linear for 2000 timeline clips rather than nested scans",()=>{
   const items=Array.from({length:2000},(_,i)=>i%3===0?
      audio("a"+i,"v"+(i-1)):video("v"+i));
   expect(selectedVideoItemId(items,"v1999")).toBe("v1999");
   const detached=detachedAudioMediaIds(items);
   expect(detached.size).toBeGreaterThan(100);
   const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
   expect(editor).toContain("const selectedVideoId = useMemo(");
   expect(editor).toContain("const detachedAudioIds = useMemo(");
   expect(editor).toContain("!detachedAudioIds.has(i.mediaId)");
   expect(editor).not.toContain("!items.some((a) => a.kind === \"audio\"");
   expect(editor).not.toContain("!items.some(x=>x.id === selected");
 });
});
