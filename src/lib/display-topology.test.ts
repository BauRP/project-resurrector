import { describe, expect, it } from "vitest";
import { calculateDisplayRegions, foldEventDetails, startDisplayAdaptation, safeViewportDimension, windowClass, type DisplayTopology } from "./display-topology";

const topology = (features: DisplayTopology["foldingFeatures"]): DisplayTopology => ({
  widthPx: 1200, heightPx: 900, widthDp: 600, heightDp: 450,
  density: 2, revision: 1, posture: "reported", source: "test",
  foldingFeatures: features,
});
const hinge = (left: number, right: number, occlusion = "FULL") => ({
  leftPx: left, rightPx: right, topPx: 0, bottomPx: 900,
  orientation: "VERTICAL", state: "FLAT", occlusion, separating: true,
});

describe("adaptive window classes", () => {
  it("bases classes on usable logical CSS width rather than physical screen pixels", () => {
    expect(windowClass(360)).toBe("compact");
    expect(windowClass(Number.NaN)).toBe("compact");
    expect(windowClass(Number.POSITIVE_INFINITY)).toBe("compact");
    expect(windowClass(0)).toBe("compact");
    expect(windowClass(600)).toBe("medium");
    expect(windowClass(839)).toBe("medium");
    expect(windowClass(840)).toBe("expanded");
    expect(windowClass(1200)).toBe("large");
    expect(windowClass(1600)).toBe("extra-large");
  });
});
describe("multi-hinge topology", () => {
  it("preserves no fold when Android reports no fold", () => {
    expect(calculateDisplayRegions(topology([]), 600, 450).regions).toHaveLength(1);
  });
  it("separates physical screen gaps without placing content inside hinge pixels", () => {
    const result = calculateDisplayRegions(topology([hinge(590,610)]),600,450);
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0]?.width).toBe(295);
    expect(result.regions[1]?.left).toBe(305);
    expect(result.occluded).toBe(true);
  });
  it("supports two actual Android hinge bounds for tri-fold devices", () => {
    const result = calculateDisplayRegions(topology([hinge(390,410), hinge(790,810)]),600,450);
    expect(result.regions).toHaveLength(3);
  });
  it("does not count non-separating short hinge segments as usable pane dividers", () => {
    const short={...hinge(590,610),topPx:100,bottomPx:180};
    const result=calculateDisplayRegions(topology([short]),600,450);
    expect(result.hinges).toHaveLength(0);
    expect(foldEventDetails(topology([short]),600,450).hingeCount).toBe(0);
  });
  it("ignores hinge segments that do not traverse the usable window", () => {
    const short = { ...hinge(590, 610), topPx: 120, bottomPx: 160 };
    expect(calculateDisplayRegions(topology([short]), 600, 450).regions).toHaveLength(1);
  });
  it("normalizes multi-hinge posture order without inventing a new fold", () => {
    const closed = {...hinge(390,410),state:"HALF_OPENED"};
    const open = {...hinge(790,810),state:"FLAT"};
    const before=foldEventDetails(topology([closed,open]),600,450);
    const after=foldEventDetails(topology([open,closed]),600,450);
    expect(before.posture).toBe("HALF_OPENED,FLAT");
    expect(before.posture).toBe(after.posture);
    expect(before.regionGeometry).toBe(after.regionGeometry);
  });
  it("does not invent fold changes when the same two hinges arrive reordered", () => {
    const first=foldEventDetails(topology([hinge(390,410),hinge(790,810)]),600,450);
    const second=foldEventDetails(topology([hinge(790,810),hinge(390,410)]),600,450);
    expect(first.regionGeometry).toBe(second.regionGeometry);
    expect(first.hingeCount).toBe(second.hingeCount);
  });
  it("handles three pane regions even when Android reports hinges in reverse order", () => {
    const state = topology([hinge(790,810), hinge(390,410)]);
    const regions = calculateDisplayRegions(state, 600, 450).regions.sort((a,b)=>a.left-b.left);
    expect(regions).toHaveLength(3);
    expect(regions.map(r=>Math.round(r.width))).toEqual([195,190,195]);
  });
  it("never fabricates extra hinges from a physical three-panel screen resolution", () => {
    const result = calculateDisplayRegions(topology([hinge(390,410)]),600,450);
    expect(result.regions).toHaveLength(2);
  });
  it("does not invent an occlusion gap on a flexible crease", () => {
    const result = calculateDisplayRegions(topology([hinge(600,600, "NONE")]),600,450);
    expect(result.occluded).toBe(false);
    expect(result.regions).toHaveLength(2);
  });
  it("distinguishes the same fold with resized usable panes", () => {
    const fold=topology([hinge(590,610)]);
    const before=foldEventDetails(fold,600,450);
    const after=foldEventDetails(fold,800,450);
    expect(before.hingeCount).toBe(after.hingeCount);
    expect(before.regionGeometry).not.toBe(after.regionGeometry);
  });
  it("reports only real usable hinge regions, not physical panel model names", () => {
    const s = topology([hinge(390,410),hinge(790,810)]);
    expect(foldEventDetails(s,600,450)).toMatchObject({
      revision: 1, hingeCount: 2, usableRegions: 3, layout: "vertical",
    });
    expect(foldEventDetails(topology([]),360,760)).toMatchObject({
      hingeCount: 0, usableRegions: 1, layout: "none",
    });
  });
  it("keeps mixed four-pane fold geometry and layout identical when OEM reverses feature order", () => {
    const vertical=hinge(590,610);
    const horizontal={leftPx:0,rightPx:1200,topPx:440,bottomPx:460,
      orientation:"HORIZONTAL",state:"HALF_OPENED",occlusion:"FULL",separating:true};
    const first=calculateDisplayRegions(topology([vertical,horizontal]),600,450);
    const swapped=calculateDisplayRegions(topology([horizontal,vertical]),600,450);
    expect(first.regions).toEqual(swapped.regions);
    expect(first.split).toBe(swapped.split);
    expect(foldEventDetails(topology([vertical,horizontal]),600,450))
      .toEqual(foldEventDetails(topology([horizontal,vertical]),600,450));
  });
  it("splits multiple real hinge directions without inventing extra full-width panes", () => {
    const vertical = hinge(590, 610);
    const horizontal = {
      leftPx: 0, rightPx: 1200, topPx: 440, bottomPx: 460,
      orientation: "HORIZONTAL", state: "HALF_OPENED", occlusion: "FULL", separating: true,
    };
    const result = calculateDisplayRegions(topology([vertical, horizontal]), 600, 450);
    expect(result.regions).toHaveLength(4);
    expect(result.regions.every(r => r.width > 0 && r.height > 0)).toBe(true);
    expect(result.occluded).toBe(true);
  });
  it("falls back to a real single viewport for invalid extreme native pixel ratios", () => {
    const state=topology([hinge(390,410)]);
    state.widthPx=Number.MIN_VALUE;
    const result=calculateDisplayRegions(state,600,450);
    expect(result.regions).toEqual([{left:0,top:0,width:600,height:450}]);
    expect(result.hinges).toHaveLength(0);
    expect(result.split).toBe("none");
  });
  it("rejects unknown hinge directions instead of silently treating them as horizontal", () => {
    const wrong = { ...hinge(590,610), orientation: "UNKNOWN" };
    expect(calculateDisplayRegions(topology([wrong]),600,450).regions).toHaveLength(1);
  });
  it("does not divide a zero-sized WebView viewport", () => {
    expect(calculateDisplayRegions(topology([hinge(590,610)]),0,450).regions).toHaveLength(0);
  });
  it("rejects out-of-window or nonsensical Android hinge bounds", () => {
    const invalid = [
      { ...hinge(590, 610), leftPx: Number.NaN },
      { ...hinge(590, 610), leftPx: 700, rightPx: 600 },
      { ...hinge(590, 610), leftPx: 1500, rightPx: 1520 },
      { ...hinge(590, 610), topPx: 1200, bottomPx: 1300 },
    ];
    expect(calculateDisplayRegions(topology(invalid), 600, 450).regions).toHaveLength(1);
  });

});

describe("layout owner handoff during rapid tab remount", () => {
  it("rejects invalid fold-time WebView sizes rather than producing invalid CSS", () => {
    expect(safeViewportDimension(Number.NaN)).toBe(null);
    expect(safeViewportDimension(Number.POSITIVE_INFINITY)).toBe(null);
    expect(safeViewportDimension(0)).toBe(null);
    expect(safeViewportDimension(-30)).toBe(null);
    expect(safeViewportDimension(840)).toBe(840);
  });
  it("does not let a former screen remove the active screen's viewport styles", () => {
    const first = startDisplayAdaptation();
    const second = startDisplayAdaptation();
    try {
      expect(document.documentElement.dataset.windowClass).toBeDefined();
      expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).not.toBe("");
      first();
      expect(document.documentElement.dataset.windowClass).toBeDefined();
      expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).not.toBe("");
    } finally {
      second();
    }
    expect(document.documentElement.dataset.windowClass).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("");
  });
});
