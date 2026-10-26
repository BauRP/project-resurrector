import {describe,expect,it,vi} from "vitest";
import {sanitizeEditorProject,saveEditorProject,loadEditorProject} from "./editor-project-recovery";
const item={id:"one",mediaId:"stored-video",kind:"video",track:1,start:0,in:0,out:10,
 speed:1,reverse:false,scale:100,posX:0,opacity:100,look:"Без цвета"};
describe("fold-safe editor project persistence",()=>{
 it("preserves clip layout without storing media blobs or recorder state",()=>{
  const state=sanitizeEditorProject({items:[item],overlays:[],transitions:[],
    hidden:{v1:true},muted:{a1:false},recording:true,cameraId:"private"});
  expect(state.items).toHaveLength(1);
  expect(state.hidden.v1).toBe(true);
  expect(JSON.stringify(state)).not.toContain("recording");
  expect(JSON.stringify(state)).not.toContain("cameraId");
 });
 it("rejects invalid or malformed imported timeline entries",()=>{
  const p=sanitizeEditorProject({items:[{...item,out:0},item],overlays:[],
    transitions:[],muted:{weird:true,a1:true},hidden:{"__proto__":true}});
  expect(p.items).toHaveLength(1);
  expect(p.muted).toEqual({a1:true});
 });
 it("survives local-only save/load with a simulated WebView",()=>{
  const map=new Map<string,string>();
  vi.stubGlobal("localStorage",{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}});
  try{
   expect(saveEditorProject({items:[item],overlays:[],transitions:[],hidden:{},muted:{}})).toBe(true);
   expect(loadEditorProject().items).toHaveLength(1);
  }finally{vi.unstubAllGlobals();}
 });
});
