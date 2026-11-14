import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {MAX_AUTO_PROXY_SECONDS,shouldAutoEncodeFullProxy} from "./editor-longform-policy";
describe("long-form Editor media policy",()=>{
 it("keeps whole-clip preview proxies for short clips",()=>{
   expect(shouldAutoEncodeFullProxy(15)).toBe(true);
   expect(shouldAutoEncodeFullProxy(60)).toBe(true);
   expect(shouldAutoEncodeFullProxy(MAX_AUTO_PROXY_SECONDS)).toBe(true);
 });
 it("does not start runaway full-film background encoding of 30min, 1h, 2h",()=>{
   for(const duration of [1800,3600,7200,Infinity,NaN,-1])
     expect(shouldAutoEncodeFullProxy(duration)).toBe(false);
   const code=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
   expect(code).toContain("if (!shouldAutoEncodeFullProxy(m.duration)) continue;");
   expect(code).toContain('source={proxies[i.mediaId] ?? mediaById.get(i.mediaId)?.url ?? ""}');
 });
 it("protects direct proxy calls while preserving the full original",()=>{
   const code=readFileSync("src/lib/video-proxy.ts","utf8");
   expect(code).toContain("!shouldAutoEncodeFullProxy(video.duration)");
   expect(code).toContain("const cached = await readProxy(id)");
   expect(readFileSync("src/lib/editor-original-export.ts","utf8")).toContain("return {allowed:true}");
 });
});
