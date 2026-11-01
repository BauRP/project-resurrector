import {describe,expect,it} from "vitest";
import {qrScanDimensions} from "./qr-scan-frame";
describe("bounded QR scanner processing on camera and fold screens",()=>{
  it("downsamples 4K without inventing portrait/landscape rotation",()=>{
    expect(qrScanDimensions(3840,2160)).toEqual({width:640,height:360});
    expect(qrScanDimensions(1080,1920)).toEqual({width:360,height:640});
    expect(qrScanDimensions(640,480)).toEqual({width:640,height:480});
  });
  it("keeps a tiny valid camera frame and never fabricates a larger one",()=>{
    expect(qrScanDimensions(120,80)).toEqual({width:120,height:80});
    expect(qrScanDimensions(320,240,160)).toEqual({width:160,height:120});
  });
  it("refuses nonsensical dimensions instead of allocating a huge canvas",()=>{
    for(const [w,h] of [[0,1080],[1920,0],[NaN,1080],
      [1920,Infinity],[-5,400],[400.5,300],[999999,240]]){
      expect(qrScanDimensions(w!,h!)).toBeNull();
    }
    expect(qrScanDimensions(1920,1080,NaN)).toBeNull();
    expect(qrScanDimensions(1920,1080,10000)).toBeNull();
  });
});
