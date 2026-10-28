import {describe,it,expect} from "vitest";
import {nativePreviewPlacement,samePreviewPlacement} from "./native-preview-placement";
const screen={width:400,height:800};
describe("foldable native preview overlay boundaries",()=>{
 it("accepts a fully visible preview",()=>expect(nativePreviewPlacement({left:10,top:70,width:380,height:240},screen)).toEqual({left:10,top:70,width:380,height:240}));
 it("rejects preview beyond a cover/split window, never cover unrelated buttons",()=>{
  expect(nativePreviewPlacement({left:10,top:-20,width:380,height:240},screen)).toBeNull();
  expect(nativePreviewPlacement({left:10,top:700,width:380,height:240},screen)).toBeNull();
  expect(nativePreviewPlacement({left:20,top:0,width:410,height:220},screen)).toBeNull();
 });
 it("rejects zero, NaN and undersized transitional folds",()=>{
  expect(nativePreviewPlacement({left:0,top:0,width:0,height:200},screen)).toBeNull();
  expect(nativePreviewPlacement({left:0,top:0,width:200,height:200},{width:0,height:800})).toBeNull();
  expect(nativePreviewPlacement({left:NaN,top:0,width:200,height:200},screen)).toBeNull();
 });
 it("does not restart the native surface for subpixel geometry changes",()=>{
  expect(samePreviewPlacement({left:1,top:2,width:300,height:200},{left:1.2,top:2,width:300,height:200})).toBe(true);
  expect(samePreviewPlacement({left:1,top:2,width:300,height:200},{left:4,top:2,width:300,height:200})).toBe(false);
 });
});
