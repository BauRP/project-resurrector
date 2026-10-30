import {describe,it,expect} from "vitest";
import {nativePreviewPlacement,samePreviewPlacement,nativePreviewSnapshot} from "./native-preview-placement";
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
 it("never lays the Android texture across a real hinge or between two panels",()=>{
  const panes="0,0,190,800;210,0,190,800";
  expect(nativePreviewPlacement({left:20,top:100,width:160,height:200},screen,panes)).not.toBeNull();
  expect(nativePreviewPlacement({left:100,top:100,width:200,height:200},screen,panes)).toBeNull();
  expect(nativePreviewPlacement({left:220,top:100,width:170,height:200},screen,panes)).not.toBeNull();
 });
 it("rejects malformed multi-pane region metadata rather than covering controls",()=>{
  expect(nativePreviewPlacement({left:10,top:10,width:160,height:200},screen,
    "invalid;geometry")).toBeNull();
 });
 it("does not restart the native surface for subpixel geometry changes",()=>{
  expect(samePreviewPlacement({left:1,top:2,width:300,height:200},{left:1.2,top:2,width:300,height:200})).toBe(true);
  expect(samePreviewPlacement({left:1,top:2,width:300,height:200},{left:4,top:2,width:300,height:200})).toBe(false);
 });
 it("revalidates the resized WebView instead of reusing a stale geometry snapshot",()=>{
  const rectangle={left:220,top:100,width:170,height:200};
  const old=nativePreviewSnapshot(rectangle,{width:400,height:800},"0,0,190,800;210,0,190,800");
  expect(old?.viewport.width).toBe(400);
  // The Activity becomes a 190 CSS-pixel cover window before the async show.
  expect(nativePreviewSnapshot(rectangle,{width:190,height:800},"0,0,190,800")).toBeNull();
  // Another fold can change the usable pane without changing viewport width.
  expect(nativePreviewSnapshot(rectangle,{width:400,height:800},"0,0,390,90;0,110,390,690")).toBeNull();
 });
 it("returns current viewport scaling together with the actual safe target",()=>{
  const result=nativePreviewSnapshot({left:4,top:8,width:160,height:100},
   {width:220,height:520},"0,0,220,520");
  expect(result).toEqual({placement:{left:4,top:8,width:160,height:100},
   viewport:{width:220,height:520}});
 });
});
