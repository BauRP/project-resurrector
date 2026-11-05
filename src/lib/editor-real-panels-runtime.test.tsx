import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {MulticamStoreProvider} from "@/lib/multicam-store";
import {EditorPro} from "@/components/multicam/EditorPro";
import {SettingsTab} from "@/components/multicam/SettingsTab";

beforeEach(()=>vi.stubGlobal("ResizeObserver",class {
 observe(){} unobserve(){} disconnect(){}
}));
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
describe("real transition and audio panels remain responsive without recorded clips",()=>{
 it("mounts actual editor, switches transition/audio panels repeatedly",async()=>{
   localStorage.clear();
   const ui=render(<MulticamStoreProvider><EditorPro audio={<button type="button">Звуковой инструмент работает</button>} /></MulticamStoreProvider>);
   const tr=screen.getByRole("tab",{name:"Переходы"});
   const audio=screen.getByRole("tab",{name:"Звук"});
   for(let i=0;i<6;i++){
     fireEvent.click(tr);
     await waitFor(()=>expect(screen.getByText(/Перетащите переход на стык/)).toBeInTheDocument());
     fireEvent.click(audio);
     await waitFor(()=>expect(screen.getByRole("button",{name:"Звуковой инструмент работает"})).toBeInTheDocument());
   }
   ui.unmount();
 },20000);
});
