import {afterEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {CameraBusyError,cameraController} from "./camera-controller";

afterEach(()=>{cameraController.release();vi.unstubAllGlobals();});

describe("QR pairing scanner must not evict the recording camera",()=>{
  it("preserves another owner's live video and never issues a second getUserMedia",async()=>{
    const stop=vi.fn();
    const track={readyState:"live",stop};
    const stream={getTracks:()=>[track],getVideoTracks:()=>[track]} as unknown as MediaStream;
    const gum=vi.fn(async()=>stream);
    vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:gum}});
    const recording=Symbol("recording"),qr=Symbol("qr-scanner");
    await cameraController.acquire(recording,{video:true});
    await expect(cameraController.acquire(qr,{video:true},{preempt:false}))
      .rejects.toBeInstanceOf(CameraBusyError);
    expect(gum).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    cameraController.release(qr);
    expect(stop).not.toHaveBeenCalled();
    cameraController.release(recording);
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("releases a QR-owned stream and permits the next real camera session",async()=>{
    const stop=vi.fn();
    const track={readyState:"live",stop};
    const stream={getTracks:()=>[track],getVideoTracks:()=>[track]} as unknown as MediaStream;
    const gum=vi.fn(async()=>stream);
    vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:gum}});
    const qr=Symbol("qr-scanner");
    await cameraController.acquire(qr,{video:true},{preempt:false});
    cameraController.release(qr);
    expect(stop).toHaveBeenCalledTimes(1);
    await expect(cameraController.acquire(Symbol("user"),{video:true}))
      .resolves.toBe(stream);
  });
  it("the mounted QR component uses non-preemptive ownership and releases it",()=>{
    const source=readFileSync("src/components/multicam/ConnectModal.tsx","utf8");
    const scanner=source.slice(source.indexOf("function Scanner("));
    expect(scanner).toContain('const owner=Symbol("qr-scanner")');
    expect(scanner).toContain("acquireWebViewPreviewWithNativeGuard(owner,");
    expect(scanner).toContain("{preempt:false,isCurrent:()=>alive}");
    expect(scanner).toContain("cameraController.release(owner)");
    expect(scanner).not.toContain("navigator.mediaDevices?.getUserMedia(");
    expect(scanner).toContain("return ()=>{alive=false;release();};");
  });
  it("does not take WebView camera while Android Camera2 owns a native preview or recording",()=>{
    const source=readFileSync("src/components/multicam/ConnectModal.tsx","utf8");
    const scanner=source.slice(source.indexOf("function Scanner("));
    expect(scanner).toContain("if(isNative())");
    expect(scanner).toContain("acquireWebViewPreviewWithNativeGuard(owner,");
    expect(scanner).toContain("isNative()?()=>nativeCapture.status():null");
    expect(scanner).toContain("{preempt:false,isCurrent:()=>alive}");
    // The shared acquisition helper rechecks native ownership after GUM.
    const helper=readFileSync("src/lib/camera-preview-acquisition.ts","utf8");
    expect(helper).toContain("await check();");
    expect(helper).toContain("cameraController.release(owner);");
  });
  it("bounds native ownership checks and QR decode CPU frequency",()=>{
    const source=readFileSync("src/components/multicam/ConnectModal.tsx","utf8");
    const scanner=source.slice(source.indexOf("function Scanner("));
    const helper=readFileSync("src/lib/camera-preview-acquisition.ts","utf8");
    expect(helper).toContain('bounded(nativeStatus(),2000,"Native Camera2 owner")');
    expect(scanner).toContain('if(now-lastScanAt<150 || document.visibilityState==="hidden"){');
    expect(scanner).toContain("lastScanAt=now;");
    expect(scanner).toContain("qrScanDimensions(v.videoWidth,v.videoHeight)");
    expect(scanner).toContain("ctx.drawImage(v,0,0,c.width,c.height)");
    expect(scanner).toContain('document.visibilityState==="hidden"');
  });
  it("keeps pairing dialog height valid CSS on short folded windows",()=>{
    const source=readFileSync("src/styles.css","utf8");
    expect(source).toContain("min(calc(100dvh - 2rem), var(--fold-work-height, 100dvh))");
    expect(source).not.toContain("min(100dvh - 2rem,");
  });
});
