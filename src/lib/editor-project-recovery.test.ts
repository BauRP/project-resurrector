import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {sanitizeEditorProject,saveEditorProject,loadEditorProject,queueEditorProjectSave,flushQueuedEditorProject} from "./editor-project-recovery";
const item={id:"one",mediaId:"stored-video",kind:"video",track:1,start:0,in:0,out:10,
 speed:1,reverse:false,scale:100,posX:0,opacity:100,look:"Без цвета"};
describe("fold-safe editor project persistence",()=>{
 it("preserves clip layout without storing media blobs or recorder state",()=>{
  const state=sanitizeEditorProject({items:[item],overlays:[],transitions:[],
    hidden:{v1:true},muted:{a1:false},recording:true,cameraId:"private"});
  expect(state.items).toHaveLength(1);
  expect(state.hidden["v1"]).toBe(true);
  expect(JSON.stringify(state)).not.toContain("recording");
  expect(JSON.stringify(state)).not.toContain("cameraId");
 });
 it("rejects invalid or malformed imported timeline entries",()=>{
  const p=sanitizeEditorProject({items:[{...item,out:0},item],overlays:[],
    transitions:[],muted:{weird:true,a1:true},hidden:{"__proto__":true}});
  expect(p.items).toHaveLength(1);
  expect(p.muted).toEqual({a1:true});
 });
 it("parses saved editor metadata only once per mount",()=>{
  const code=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
  expect(code).toContain("const [initialEditorProject] = useState(() => loadEditorProject())");
  expect(code.match(/loadEditorProject\(\)/g)).toHaveLength(1);
  for(const field of ["items","overlays","transitions","hidden","muted"]) {
    expect(code).toContain("initialEditorProject."+field);
  }
 });
 it("does not synchronously serialize project state on every editor change",()=>{
  const code=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
  expect(code).toContain("projectWriteTimer.current = window.setTimeout(flushEditorProject, 400)");
  expect(code).toContain("projectDirty.current = true");
  expect(code).toContain("window.addEventListener(\"pagehide\", flushEditorProject)");
  expect(code).toContain("flushEditorProject();");
  expect(code).not.toContain("document.removeEventListener(\"visibilitychange\",onHidden);flush();");
 });
 it("keeps an unmounted editor snapshot available without blocking the tab transition",()=>{
  vi.useFakeTimers();
  const map=new Map<string,string>();
  const setItem=vi.fn((k:string,v:string)=>{map.set(k,v);});
  vi.stubGlobal("localStorage",{getItem:(k:string)=>map.get(k)??null,setItem});
  try{
   queueEditorProjectSave({items:[item],overlays:[],transitions:[],hidden:{v1:true},muted:{}});
   expect(setItem).not.toHaveBeenCalled();
   expect(loadEditorProject().items).toHaveLength(1);
   expect(loadEditorProject().hidden["v1"]).toBe(true);
   vi.runAllTimers();
   expect(setItem).toHaveBeenCalledOnce();
   expect(JSON.parse(map.get("multicam-editor-project-v1")??"{}").items).toHaveLength(1);
  }finally{flushQueuedEditorProject();vi.unstubAllGlobals();vi.useRealTimers();}
 });
 it("retains the newest pending editor snapshot during rapid tab handoffs",()=>{
  vi.useFakeTimers();
  const map=new Map<string,string>();
  const setItem=vi.fn((k:string,v:string)=>{map.set(k,v);});
  vi.stubGlobal("localStorage",{getItem:(k:string)=>map.get(k)??null,setItem});
  try{
   queueEditorProjectSave({items:[item],overlays:[],transitions:[],hidden:{},muted:{}});
   queueEditorProjectSave({items:[{...item,id:"latest"}],overlays:[],transitions:[],hidden:{},muted:{}});
   expect(loadEditorProject().items[0]?.["id"]).toBe("latest");
   expect(setItem).not.toHaveBeenCalled();
   window.dispatchEvent(new Event("pagehide"));
   expect(JSON.parse(map.get("multicam-editor-project-v1")??"{}").items[0].id).toBe("latest");
   expect(setItem).toHaveBeenCalledOnce();
  }finally{flushQueuedEditorProject();vi.unstubAllGlobals();vi.useRealTimers();}
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
