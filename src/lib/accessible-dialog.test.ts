import {afterEach,describe,expect,it,vi} from "vitest";
import {activateAccessibleDialog} from "./accessible-dialog";
let teardown:(()=>void)|undefined;
afterEach(()=>{teardown?.();teardown=undefined;document.body.replaceChildren();});
function example(){
 const trigger=document.createElement("button");trigger.textContent="open";
 const dialog=document.createElement("div");dialog.tabIndex=-1;
 for(const name of ["close","option","save"]){const b=document.createElement("button");b.textContent=name;dialog.append(b);}
 document.body.append(trigger,dialog);
 trigger.focus();
 // jsdom has no layout: expose measured rectangles for keyboard focusables.
 for(const child of Array.from(dialog.children))
   Object.defineProperty(child,"getClientRects",{value:()=>[{width:20,height:20}]});
 return {trigger,dialog,items:Array.from(dialog.querySelectorAll("button"))};
}
function key(k:string,shiftKey=false){
 const e=new KeyboardEvent("keydown",{key:k,shiftKey,bubbles:true,cancelable:true});
 document.dispatchEvent(e);return e;
}
describe("fold/keyboard/dialog accessibility",()=>{
 it("opens into a dialog and returns to the opener when it closes",()=>{
  const {trigger,dialog,items}=example();
  teardown=activateAccessibleDialog(dialog,()=>{});
  expect(document.activeElement).toBe(items[0]);
  teardown();teardown=undefined;
  expect(document.activeElement).toBe(trigger);
 });
 it("contains Tab and Shift+Tab without leaving the measured pane dialog",()=>{
  const {dialog,items}=example();
  teardown=activateAccessibleDialog(dialog,()=>{});
  items[2]!.focus();expect(key("Tab").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(items[0]);
  items[0]!.focus();expect(key("Tab",true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(items[2]);
 });
 it("Escape calls close and detaches the keyboard handler on teardown",()=>{
  const {dialog}=example(),close=vi.fn();
  teardown=activateAccessibleDialog(dialog,close);
  expect(key("Escape").defaultPrevented).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  teardown();teardown=undefined;
  key("Escape");expect(close).toHaveBeenCalledOnce();
 });
 it("ignores disabled controls and still keeps focus within available actions",()=>{
  const {dialog,items}=example();
  items[0]!.disabled=true;
  teardown=activateAccessibleDialog(dialog,()=>{});
  expect(document.activeElement).toBe(items[1]);
 });
});
