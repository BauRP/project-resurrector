import {afterEach,describe,expect,it,vi} from "vitest";
import {fireEvent,cleanup,render,screen,act} from "@testing-library/react";
import {MulticamStoreProvider} from "@/lib/multicam-store";
import {EditorTab} from "@/components/multicam/EditorTab";

const counts=vi.hoisted(()=>({renders:0}));
vi.mock("@/components/multicam/EditorPro",()=>({
 EditorPro:({audio}:{audio:React.ReactNode})=>{
   counts.renders++;
   return <div data-testid="real-editor-shell">{audio}</div>;
 }
}));
afterEach(()=>{cleanup();counts.renders=0;});
describe("audio sliders should not rerender the entire video editor",()=>{
 it("keeps transition/timeline shell stable while real EQ is adjusted",()=>{
   render(<MulticamStoreProvider><EditorTab/></MulticamStoreProvider>);
   expect(screen.getByTestId("real-editor-shell")).toBeInTheDocument();
   const before=counts.renders;
   const eq=screen.getByLabelText("31 Hz EQ");
   fireEvent.change(eq,{target:{value:"8"}});
   expect(eq).toHaveValue("8");
   expect(counts.renders).toBe(before);
 });
});
