import {describe,expect,it} from "vitest";
import {assessTrackMode} from "./capture-mode-transaction";
const target={width:1920,height:1080,fps:30};
describe("WebView mode transaction readback",()=>{
  it("confirms complete sensor settings including rotated frame",()=>{
    expect(assessTrackMode(target,{width:1920,height:1080,frameRate:30})).toBe("confirmed");
    expect(assessTrackMode(target,{width:1080,height:1920,frameRate:29.7})).toBe("confirmed");
  });
  it("does not invent support when frame-rate or dimensions are undisclosed",()=>{
    expect(assessTrackMode(target,{width:1920,height:1080})).toBe("unknown");
    expect(assessTrackMode(target,{width:1920,frameRate:30})).toBe("unknown");
    expect(assessTrackMode(target,{width:1920,height:1080,frameRate:NaN})).toBe("unknown");
  });
  it("rejects real mismatches rather than mislabeling a 4K request",()=>{
    expect(assessTrackMode({width:3840,height:2160,fps:60},{width:1920,height:1080,frameRate:30})).toBe("rejected");
    expect(assessTrackMode(target,{width:1920,height:1080,frameRate:24})).toBe("rejected");
  });
});
