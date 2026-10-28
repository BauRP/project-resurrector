import {describe,it,expect} from "vitest";
import {nativeAnonymizedAuditReport} from "./native-audit-report";
describe("anonymous camera/fold diagnostic export",()=>{
 const sample={entries:[{state:"saved_interrupted",cameraId:"private-camera-123",
    savedUri:"content://person/videos/secret.mp4",message:"private filename",
    captureId:1738181111,startedAt:1738181111,lastFoldAt:1738182222,
    width:1920,height:1080,fps:30,savedBytes:250000,
    mp4HasVideoTrack:true,mp4HasAudioTrack:false,
    mp4FoldProbes:3,mp4FoldMatched:2,foldPostureChanges:1}],omittedEarlier:0,maxEntries:24};
 it("strips identities, paths, timestamps and arbitrary messages",()=>{
  const text=nativeAnonymizedAuditReport(sample);
  for(const value of ["private-camera-123","content://","cameraId","savedUri","captureId",
     "startedAt","lastFoldAt","private filename","secret.mp4"])
    expect(text).not.toContain(value);
  expect(text).toContain("saved_interrupted");
  expect(text).toContain("foldChecks");
 });
 it("bounds to 24 entries and refuses invalid counts",()=>{
  const rows=Array.from({length:70},()=>({state:"saved",fps:-24,mp4FoldProbes:1000}));
  const json=JSON.parse(nativeAnonymizedAuditReport({entries:rows,omittedEarlier:46,maxEntries:24}));
  expect(json.entries).toHaveLength(24);
  expect(json.entries[0].mode.fps).toBeNull();
  expect(json.entries[0].fold.foldChecks).toBeNull();
  expect(json.omittedEarlier).toBe(46);
 });
});