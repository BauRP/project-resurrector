import { beforeEach, describe, expect, it } from "vitest";
import { isModeEvidence, loadModeEvidence, recordModeEvidence, type ModeEvidence } from "./camera-passport";
const KEY = "multicam-mode-evidence-v1";
const evidence: ModeEvidence = {api:"webview",cameraId:"rear",requested:{width:1920,height:1080,fps:30},state:"verified",checkedAt:12};
beforeEach(()=>localStorage.clear());
describe("persisted camera passport validation",()=>{
  it("rejects malformed or invented evidence",()=>{
    expect(isModeEvidence(evidence)).toBe(true);
    expect(isModeEvidence({...evidence,requested:null})).toBe(false);
    expect(isModeEvidence({...evidence,requested:{width:1920,height:1080,fps:-1}})).toBe(false);
    expect(isModeEvidence({...evidence,state:"invented"})).toBe(false);
    expect(isModeEvidence({...evidence,checkedAt:NaN})).toBe(false);
  });
  it("does not discard good lens results when old entries are corrupt",()=>{
    localStorage.setItem(KEY,JSON.stringify([{...evidence,requested:null},evidence,{...evidence,cameraId:"front"}]));
    expect(loadModeEvidence().map(e=>e.cameraId)).toEqual(["rear","front"]);
  });
  it("separates each camera and FPS result",()=>{
    recordModeEvidence(evidence);
    recordModeEvidence({...evidence,cameraId:"front",state:"rejected"});
    recordModeEvidence({...evidence,requested:{...evidence.requested,fps:60},state:"rejected"});
    expect(loadModeEvidence()).toHaveLength(3);
  });
});
