import { describe, it, expect } from "vitest";
import { cameraTaskKey, prepareCameraTestQueue, selectQuickCameraTasks, updateCameraTestTask, queueSummary } from "./camera-test-queue";
import type { ModeEvidence } from "./camera-passport";

const base = { width:1920, height:1080, fps:30 };
const proof: ModeEvidence = { api:"webview",cameraId:"rear",requested:base,checkedAt:12,state:"verified" };
describe("per-lens resumable diagnostic queue", () => {
  it("only marks the exact tested camera, size and frame rate verified", () => {
    const tasks = prepareCameraTestQueue(["rear","front"],[base,{ ...base, fps:60 }],[],[proof]);
    expect(tasks).toHaveLength(4);
    expect(tasks.filter(t=>t.status==="verified").map(t=>t.key)).toEqual([cameraTaskKey("rear",base)]);
    expect(queueSummary(tasks,["rear","front"])).toEqual({total:4,verified:1,recorded:0,pending:3,failed:0,deferred:0});
  });
  it("rejects corrupted legacy evidence instead of inventing a successful test", () => {
    const corrupted = [{api:"webview", cameraId:"rear",state:"verified",checkedAt:12}] as unknown as ModeEvidence[];
    expect(prepareCameraTestQueue(["rear"],[base],[],corrupted)[0]?.status).toBe("pending");
  });
  it("does not let unplugged old cameras displace active test tasks", () => {
    const oldIds = Array.from({length:90},(_,i)=>"disconnected-"+i);
    const old = prepareCameraTestQueue(oldIds,[base,{...base,fps:60}],[],[]);
    const active = prepareCameraTestQueue(["front"],[base],old,[]);
    expect(active).toHaveLength(1);
    expect(active[0]?.cameraId).toBe("front");
  });
  it("resumes an interrupted in-progress task without inventing a success", () => {
    const prior = prepareCameraTestQueue(["rear"],[base],[],[]);
    const inProgress = updateCameraTestTask(prior,prior[0]!.key,"running","Открывается камера",1);
    const resumed = prepareCameraTestQueue(["rear"],[base],inProgress,[]);
    expect(resumed[0]?.status).toBe("retry");
    expect(resumed[0]?.attempts).toBe(1);
  });
  it("keeps separately stored but unverified files out of the confirmed camera count", () => {
    const unverified: ModeEvidence={...proof,state:"recorded"};
    const planned=prepareCameraTestQueue(["rear"],[base],[],[unverified]);
    expect(planned[0]?.status).toBe("recorded");
    expect(queueSummary(planned,["rear"]).verified).toBe(0);
    expect(queueSummary(planned,["rear"]).recorded).toBe(1);
  });
  it("keeps a recorded-only result across restarts without repeating in quick tests", () => {
    const proofFile: ModeEvidence = {...proof, state:"recorded"};
    const started = prepareCameraTestQueue(["rear"],[base],[],[proofFile]);
    expect(started[0]?.status).toBe("recorded");
    const reopened=prepareCameraTestQueue(["rear"],[base],started,[proofFile]);
    expect(reopened[0]?.status).toBe("recorded");
    expect(reopened[0]?.attempts).toBe(0);
    expect(queueSummary(reopened,["rear"])).toMatchObject({recorded:1,verified:0,pending:0});
  });
  it("retries recorded-only video when current WebView passport no longer has its proof", () => {
    const recorded: ModeEvidence = {...proof,state:"recorded"};
    const before=prepareCameraTestQueue(["rear"],[base],[],[recorded]);
    expect(before[0]?.status).toBe("recorded");
    const after=prepareCameraTestQueue(["rear"],[base],before,[
      {...recorded,state:"unknown",message:"Версия WebView изменена"},
    ]);
    expect(after[0]?.status).toBe("retry");
    expect(queueSummary(after,["rear"])).toMatchObject({recorded:0,verified:0,pending:1});
  });
  it("does not trust an old verified queue entry after current evidence expires", () => {
    const before=prepareCameraTestQueue(["rear"],[base],[],[proof]);
    const after=prepareCameraTestQueue(["rear"],[base],before,[]);
    expect(after[0]?.status).toBe("retry");
    expect(after[0]?.message).toContain("повторная проверка");
  });
  it("spreads short initial video tests over distinct lenses instead of exhausting one lens", () => {
    const hd={width:1280,height:720,fps:30};
    const tasks=prepareCameraTestQueue(["rear","front","tele"],[base,hd],[],[]);
    const selected=selectQuickCameraTasks(tasks);
    expect(selected.map(t=>t.cameraId)).toEqual(["rear","front"]);
    expect(selected.every(t=>t.mode.width===1920)).toBe(true);
    const after=updateCameraTestTask(tasks,selected[0]!.key,"recorded","файл есть");
    const remaining=selectQuickCameraTasks(after.filter(t=>["pending","retry"].includes(t.status)),2,after);
    expect(remaining.map(t=>t.cameraId)).toEqual(["front","tele"]);
    expect(remaining.every(t=>t.mode.width===1920)).toBe(true);
  });
  it("eventually reaches the least tested cameras after two previous quick passes", () => {
    const tasks=prepareCameraTestQueue(["main","ultrawide","tele","front"],[base],[],[]);
    const first=selectQuickCameraTasks(tasks,2,tasks);
    expect(first.map(t=>t.cameraId)).toEqual(["main","ultrawide"]);
    let after=tasks;
    for(const task of first) {
      after=updateCameraTestTask(after,task.key,"running","probe");
      after=updateCameraTestTask(after,task.key,"recorded","file");
    }
    const remaining=after.filter(t=>t.status==="pending");
    const second=selectQuickCameraTasks(remaining,2,after);
    expect(second.map(t=>t.cameraId)).toEqual(["tele","front"]);
  });
  it("never invents a camera task when no untested modes remain", () => {
    expect(selectQuickCameraTasks([])).toEqual([]);
  });
  it("keeps a verified result even if another mode fails", () => {
    const start = prepareCameraTestQueue(["rear"],[base,{...base,fps:60}],[],[proof]);
    const next = updateCameraTestTask(start,cameraTaskKey("rear",{...base,fps:60}),"error","кодировщик отказал");
    expect(next.find(t=>t.mode.fps===30)?.status).toBe("verified");
    expect(next.find(t=>t.mode.fps===60)?.status).toBe("error");
  });
});
