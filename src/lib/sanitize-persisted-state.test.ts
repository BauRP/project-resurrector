import { describe, it, expect } from "vitest";
import { sanitizePersistedState } from "./sanitize-persisted-state";

describe("Astra corrupt Android state recovery", () => {
 it("never restores null collections, malformed config or numeric language",()=>{
   const value=sanitizePersistedState({ cuts:null, markers:null, subtitles:null,
     exportConfig:null,language:42,theme:"dark",hardwareAcceleration:false });
   expect(value).toEqual({ theme:"dark", hardwareAcceleration:false });
 });
 it("keeps each well-formed saved clip marker/subtitle and filters damaged entries",()=>{
   const value=sanitizePersistedState({
     cuts:[{id:"c1",time:12,camera:1},null,{id:"broken",time:"not number",camera:1}],
     markers:[{id:"m1",time:8,label:"OK"},{id:"m2",time:Infinity,label:"bad"}],
     subtitles:[{id:"s1",start:1,end:2,text:"hello"},{id:"s2",start:9,end:2,text:"bad"}],
     teleprompterText:"Saved",teleprompterSpeed:35,teleprompterSize:24
   });
   expect(value.cuts).toEqual([{id:"c1",time:12,camera:1}]);
   expect(value.markers).toEqual([{id:"m1",time:8,label:"OK"}]);
   expect(value.subtitles).toEqual([{id:"s1",start:1,end:2,text:"hello"}]);
   expect(value.teleprompterText).toBe("Saved");
 });
 it("preserves complete valid export options and ignores invalid nested arrays",()=>{
   const cfg={ aspect:"16:9",resolution:"4K",fps:"24",videoCodec:"H.264",
     audioCodec:"AAC",sampleRate:"48kHz",bitrate:48,audioBitrate:256 };
   expect(sanitizePersistedState({exportConfig:cfg}).exportConfig).toEqual(cfg);
   expect(sanitizePersistedState({exportConfig:{...cfg,bitrate:null}}).exportConfig).toBeUndefined();
   expect(sanitizePersistedState({cuts:new Array(3001).fill(null)}).cuts).toBeUndefined();
 });
 it("never restores forged unknown keys or incomplete primitive types",()=>{
   const saved={theme:"dark",hardwareAcceleration:"yes",language:{toString:()=> "ru"},
      selectedLut:12,markers:"not-an-array",additionalKey:true};
   expect(sanitizePersistedState(saved)).toEqual({theme:"dark"});
   expect(sanitizePersistedState(null)).toEqual({});
 });
});
