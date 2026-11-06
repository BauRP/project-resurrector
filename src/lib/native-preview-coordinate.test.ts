import { describe,it,expect } from "vitest";
import { previewTapPoint } from "./native-preview-coordinate";
describe("Native Camera2 touch mapping in fold panels",()=>{
 it("maps middle of a wide Camera2 image to the active frame center",()=>{
  expect(previewTapPoint(450,250,{left:100,top:50,width:700,height:400},640,360))
   .toEqual({x:.5,y:.5});
 });
 it("rejects taps on object-contain letterboxing of a tall fold pane",()=>{
  const rect={left:40,top:80,width:260,height:580};
  expect(previewTapPoint(170,90,rect,640,360)).toBeNull();
  const center=previewTapPoint(170,370,rect,640,360);
  expect(center?.x).toBeCloseTo(.5,3);
  expect(center?.y).toBeCloseTo(.5,3);
 });
 it("uses pane position rather than whole-window coordinates",()=>{
  const point=previewTapPoint(500,300,{left:400,top:200,width:200,height:200},200,200);
  expect(point).toEqual({x:.5,y:.5});
 });
 it("rejects invalid source dimensions and margins",()=>{
  expect(previewTapPoint(2,4,{left:0,top:0,width:0,height:80},640,480)).toBeNull();
  expect(previewTapPoint(0,0,{left:0,top:0,width:200,height:200},400,200)).toBeNull();
 });
});