import {describe,it,expect} from "vitest";
import {nativeAuditExportText,redactNativeAudit} from "./native-audit-export";
describe("anonymous camera and folding report",()=>{
 const sample={entries:[{state:"saved_interrupted",cameraId:"secret physical ID",
   savedUri:"content://private.user/videos/secret.mp4",message:"private filename",
   captureId:1738181111,startedAt:1738181111,lastFoldAt:1738182222,
   width:1920,height:1080,fps:30,savedBytes:250000,
   mp4HasVideoTrack:true,mp4HasAudioTrack:false,
   mp4FoldProbes:3,mp4FoldMatched:2,foldPostureChanges:1}],omittedEarlier:0,maxEntries:24};
 it("strips camera identities, raw file locations, date and freeform messages",()=>{
  const text=nativeAuditExportText(sample);
  for(const value of ["secret","content://","cameraId","savedUri","captureId","startedAt","lastFoldAt","private filename"])
    expect(text).not.toContain(value);
  expect(text).toContain("saved_interrupted");
  expect(text).toContain("foldCheckpointPassed");
 });
 it("limits output to 24 bounded entries and rejects invalid numbers",()=>{
  const rows=Array.from({length:70},()=>({state:"saved",fps:-24,mp4FoldProbes:1000}));
  const result=redactNativeAudit({entries:rows,omittedEarlier:46,maxEntries:24});
  expect(result.entries).toHaveLength(24);
  expect(result.entries[0]?.requestedFps).toBeNull();
  expect(result.entries[0]?.foldCheckpointTests).toBeNull();
  expect(result.omittedEarlier).toBe(46);
 });
});