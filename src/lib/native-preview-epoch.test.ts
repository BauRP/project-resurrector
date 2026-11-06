import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {nativePreviewAckIsCurrent} from "./native-preview-epoch";

describe("native TextureView acknowledgement during fold",()=>{
  it("accepts a show reply only for the still-mounted exact fold epoch",()=>{
    expect(nativePreviewAckIsCurrent(7,7,true,true,true)).toBe(true);
    expect(nativePreviewAckIsCurrent(7,8,true,true,true)).toBe(false);
    expect(nativePreviewAckIsCurrent(7,7,false,true,true)).toBe(false);
    expect(nativePreviewAckIsCurrent(7,7,true,false,true)).toBe(false);
    expect(nativePreviewAckIsCurrent(7,7,true,true,false)).toBe(false);
    expect(nativePreviewAckIsCurrent(Number.NaN,7,true,true,true)).toBe(false);
  });
  it("rejects a delayed old-pane success even if the Android bridge replied visible=true",()=>{
    let currentEpoch=2;
    const submittedEpoch=currentEpoch;
    currentEpoch=3; // cover screen changed while setDirectPreview was in flight
    const ack={visible:true};
    expect(ack.visible && nativePreviewAckIsCurrent(submittedEpoch,currentEpoch,
      true,true,true)).toBe(false);
    expect(nativePreviewAckIsCurrent(3,3,true,true,true)).toBe(true);
  });
  it("real Camera2 preview must hide the stale surface without stopping native recording",()=>{
    const source=readFileSync("src/components/multicam/NativeRecordingPanel.tsx","utf8");
    const start=source.indexOf("const acknowledged=await bridge.setDirectPreview");
    const recheck=source.indexOf("nativePreviewAckIsCurrent(submittedFoldEpoch",start);
    const hide=source.indexOf("await bridge.setDirectPreview({ownerId,visible:false})",recheck);
    const commit=source.indexOf("lastVisible=acknowledged?.visible===true",start);
    expect(start).toBeGreaterThan(0);
    expect(recheck).toBeGreaterThan(start);
    expect(hide).toBeGreaterThan(recheck);
    expect(commit).toBeGreaterThan(hide);
    expect(source.slice(recheck,commit)).not.toContain("bridge.stop()");
    expect(source.slice(recheck,commit)).toContain("syncDirty=true");
    expect(source.slice(start,commit)).toContain("samePreviewPlacement(placement,refreshed.placement)");
    expect(source.slice(start,commit)).toContain("refreshed.viewport.width===viewport.width");
    expect(source.slice(start,commit)).toContain("refreshed.viewport.height===viewport.height");
  });
});
