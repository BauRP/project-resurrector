import { beforeEach, describe, expect, it } from "vitest";
import { cameraPassportContext, isModeEvidence, loadModeEvidence, recordModeEvidence, type ModeEvidence } from "./camera-passport";
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

  it("ignores late diagnostic writes older than already stored evidence",()=>{
    recordModeEvidence({...evidence,checkedAt:200,state:"verified"});
    recordModeEvidence({...evidence,checkedAt:100,state:"rejected"});
    expect(loadModeEvidence()[0]?.state).toBe("verified");
    expect(loadModeEvidence()[0]?.checkedAt).toBe(200);
  });
  it("preserves a confirmed native recording when a later fold interrupts another attempt",()=>{
    const recorded={...evidence,api:"camera2" as const,checkedAt:100,state:"recorded" as const};
    recordModeEvidence(recorded);
    recordModeEvidence({...recorded,checkedAt:200,state:"unknown"});
    expect(loadModeEvidence()[0]?.state).toBe("recorded");
    expect(loadModeEvidence()[0]?.checkedAt).toBe(100);
  });
  it("accepts a successful native retry after an unknown earlier result",()=>{
    const unknown={...evidence,api:"camera2" as const,checkedAt:100,state:"unknown" as const};
    recordModeEvidence(unknown);
    recordModeEvidence({...unknown,checkedAt:200,state:"recorded"});
    expect(loadModeEvidence()[0]?.state).toBe("recorded");
  });
  it("separates each camera and FPS result",()=>{
    recordModeEvidence(evidence);
    recordModeEvidence({...evidence,cameraId:"front",state:"rejected"});
    recordModeEvidence({...evidence,requested:{...evidence.requested,fps:60},state:"rejected"});
    expect(loadModeEvidence()).toHaveLength(3);
  });
});

describe("separate actual encoded media metadata", () => {
  it("retains valid first-frame evidence without claiming actual coded FPS", () => {
    const proof = {...evidence, file:{width:1920,height:1080,bytes:2048,mimeType:"video/webm"}};
    recordModeEvidence(proof);
    expect(loadModeEvidence()[0]?.file).toEqual(proof.file);
  });
  it("drops impossible decoded file dimensions", () => {
    expect(isModeEvidence({...evidence,file:{width:0,height:1080,bytes:2048,mimeType:"video/webm"}})).toBe(false);
  });
});

describe("WebView diagnostic engine freshness", () => {
  it("requires re-verification of legacy results without an engine marker", () => {
    localStorage.setItem("multicam-mode-evidence-v1", JSON.stringify([evidence]));
    expect(loadModeEvidence()[0]?.state).toBe("unknown");
    expect(loadModeEvidence()[0]?.requested).toEqual(evidence.requested);
  });
  it("does not reuse verified tests from a changed browser or diagnostic mechanism", () => {
    recordModeEvidence(evidence);
    expect(loadModeEvidence()[0]?.state).toBe("verified");
    localStorage.setItem("multicam-mode-evidence-context-v1", "different-browser-or-version");
    const stale = loadModeEvidence();
    expect(stale[0]?.state).toBe("unknown");
    expect(stale[0]?.requested).toEqual(evidence.requested);
    expect(stale[0]?.message).toContain("повторная проверка");
  });
  it("stores a current runtime marker when fresh results are recorded", () => {
    recordModeEvidence(evidence);
    expect(localStorage.getItem("multicam-mode-evidence-context-v1")).toBe(cameraPassportContext());
  });
  it("preserves an old camera's historical result while saving new camera evidence", () => {
    recordModeEvidence(evidence);
    localStorage.setItem("multicam-mode-evidence-context-v1", "previous-version");
    recordModeEvidence({...evidence, cameraId:"front", checkedAt:999});
    const history = loadModeEvidence();
    expect(history.find(x=>x.cameraId==="rear")?.state).toBe("unknown");
    expect(history.find(x=>x.cameraId==="front")?.state).toBe("verified");
  });
});

describe("per-camera WebView evidence context isolation", () => {
  it("never re-verifies historic lenses just because another lens was freshly tested", () => {
    recordModeEvidence({ ...evidence, cameraId: "rear", checkedAt: 500 });
    const key = "multicam-mode-evidence-context-v1";
    localStorage.setItem(key, "older-browser");
    recordModeEvidence({ ...evidence, cameraId: "front", checkedAt: 600 });
    const records = loadModeEvidence();
    expect(records.find(x => x.cameraId === "rear")?.state).toBe("unknown");
    expect(records.find(x => x.cameraId === "front")?.state).toBe("verified");
  });
  it("re-verifies a single old lens without promoting other old lenses", () => {
    recordModeEvidence({ ...evidence, cameraId: "rear" });
    recordModeEvidence({ ...evidence, cameraId: "telephoto" });
    localStorage.setItem("multicam-mode-evidence-context-v1", "previous-engine");
    recordModeEvidence({ ...evidence, cameraId: "rear", checkedAt: 999 });
    expect(loadModeEvidence().find(x => x.cameraId === "rear")?.state).toBe("verified");
    expect(loadModeEvidence().find(x => x.cameraId === "telephoto")?.state).toBe("unknown");
  });
  it("does not mistake legacy rows without individual context for verified checks", () => {
    localStorage.setItem(KEY, JSON.stringify([evidence]));
    localStorage.setItem("multicam-mode-evidence-context-v1", cameraPassportContext());
    expect(loadModeEvidence()[0]?.state).toBe("unknown");
    recordModeEvidence({ ...evidence, cameraId: "front" });
    expect(loadModeEvidence().find(x => x.cameraId === "rear")?.state).toBe("unknown");
  });
});
