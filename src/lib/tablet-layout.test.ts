import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {tabletLayoutForWindow as decide} from "./tablet-layout";

describe("sixth direction: Android tablets in both rotations",()=>{
 it("classifies usable app CSS windows, including rotation in both directions",()=>{
  expect(decide({width:800,height:1280,reportedFoldCount:0})).toBe("portrait");
  expect(decide({width:1280,height:800,reportedFoldCount:0})).toBe("landscape");
  expect(decide({width:1200,height:1920,reportedFoldCount:0})).toBe("portrait");
  expect(decide({width:1920,height:1200,reportedFoldCount:0})).toBe("landscape");
  expect(decide({width:600,height:900})).toBe("portrait");
  expect(decide({width:1000,height:600})).toBe("landscape");
  expect(decide({width:600,height:800})).toBe("portrait");
  expect(decide({width:800,height:600})).toBe("landscape");
  expect(decide({width:900,height:650})).toBe("landscape");
  expect(decide({width:800,height:800})).toBe("portrait");
  expect(decide({width:831,height:800})).toBe("portrait");
  expect(decide({width:864,height:800})).toBe("landscape");
  expect(decide({width:740,height:740})).toBe("portrait");
  expect(decide({width:600,height:600})).toBe("none");
 });
 it("never manufactures tablet or hinge layout from a phone, mini-window, keyboard or broken sizes",()=>{
  for(const [width,height] of [[360,780],[780,360],[540,900],[900,540],
   [720,420],[900,580],[0,1000],[-1,900],[NaN,1000],[Infinity,900],
   [15000,700]] as const){
    expect(decide({width,height})).toBe("none");
  }
  expect(decide({width:800,height:1280,reportedFoldCount:1})).toBe("none");
  expect(decide({width:1280,height:800,reportedFoldCount:2})).toBe("none");
  expect(decide({width:800,height:800,reportedFoldCount:1})).toBe("none");
  // A fully unfolded, NON-separating crease is still one usable window.
  // Actual WindowManager separating panes retain their own fold layout.
  expect(decide({width:800,height:600,reportedFoldCount:0})).toBe("landscape");
  expect(decide({width:1280,height:800,reportedFoldCount:33})).toBe("none");
  expect(decide({width:1280,height:800,nativeReportValid:false})).toBe("none");
 });
 it("does not let a soft keyboard or zoom leave unusable camera controls",()=>{
  expect(decide({width:800,height:1280,visibleHeight:1280})).toBe("portrait");
  expect(decide({width:800,height:1280,visibleHeight:790})).toBe("none");
  expect(decide({width:1280,height:800,visibleHeight:540})).toBe("none");
  expect(decide({width:1280,height:800,visibleHeight:754})).toBe("landscape");
  expect(decide({width:1280,height:800,visibleWidth:650})).toBe("none");
  expect(decide({width:1280,height:800,visibleWidth:1240})).toBe("landscape");
  // A zero-size VisualViewport mid-rotation is not evidence of a keyboard.
  expect(decide({width:800,height:1280,visibleHeight:0})).toBe("portrait");
  expect(decide({width:800,height:1280,visibleHeight:NaN})).toBe("portrait");
 });
 it("retains a large single-screen layout but falls back on Android multi-window shrink",()=>{
  expect(decide({width:1280,height:800})).toBe("landscape");
  expect(decide({width:640,height:800})).toBe("portrait");
  expect(decide({width:500,height:800})).toBe("none");
  expect(decide({width:1280,height:800})).toBe("landscape");
 });
 it("reuses the existing single display observer without a second sensor/polling loop",()=>{
  const code=readFileSync("src/lib/display-topology.ts","utf8");
  expect(code).toContain('root.dataset["tabletLayout"] = tabletMode');
  expect(code).toContain('tabletLayoutForWindow({');
  expect(code).toContain('visibleHeight: viewport?.height, visibleWidth: viewport?.width');
  expect(code).toContain('lastNative?.foldingFeatures.filter(f => f?.separating === true).length');
  expect(code).toContain('"tabletLayout"');
  expect(code).not.toContain('window.screen.orientation.lock(');
  const manifest=readFileSync("android/app/src/main/AndroidManifest.xml","utf8");
  expect(manifest).toContain('android:resizeableActivity="true"');
  expect(manifest).toContain('android:configChanges="orientation|');
  expect(manifest).not.toContain('android:screenOrientation="portrait"');
  expect(manifest).not.toContain('android:screenOrientation="landscape"');
 });
 it("preserves camera, editor, settings and navigation for actual tablet layout",()=>{
  const styles=readFileSync("src/styles.css","utf8");
  for(const mode of ['data-tablet-layout="portrait"','data-tablet-layout="landscape"'])
    expect(styles).toContain(mode);
  for(const cls of ['.camera-live-view','.camera-record-dock','.camera-settings-sheet',
    '.editor-fold-workspace .studio-monitor','.settings-fold-workspace > main','.bottom-nav'])
    expect(styles).toContain(cls);
  expect(styles).toContain('not([data-separating-fold="true"])');
  expect(styles).not.toContain('screen.orientation.lock');
  expect(styles).toContain('env(safe-area-inset-bottom)');
  expect(styles).toContain('@media (max-width: 759px)');
  expect(styles).toContain('grid-template-columns: minmax(0, 1fr);');
 });
});
