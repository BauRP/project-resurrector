import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {MulticamApp} from "@/components/multicam/MulticamApp";

vi.mock("@/components/multicam/CameraWorkspace",()=>({
  CameraWorkspace:()=> <div data-testid="camera-workspace">Камера работает</div>,
}));
vi.mock("@/components/multicam/EditorTab",()=>({
  EditorTab:()=> <div data-testid="editor-workspace">Редактор работает</div>,
}));
vi.mock("@/components/multicam/SettingsTab",()=>({
  SettingsTab:()=> <div data-testid="settings-workspace"><button>Тема настроек</button></div>,
}));
vi.mock("@/lib/display-topology",()=>({startDisplayAdaptation:()=>()=>{}}));
vi.mock("@/components/multicam/AndroidFreezeNotice",()=>({AndroidFreezeNotice:()=>null}));
vi.mock("@/lib/freeze-action-trace",()=>({traceUiAction:vi.fn()}));
beforeEach(()=>localStorage.clear());
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe("actual navigation across the three app workspaces",()=>{
  it("opens Settings straight from Camera and supports repeated return without a recorder",async()=>{
    render(<MulticamApp/>);
    await waitFor(()=>expect(screen.getByTestId("camera-workspace")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:"Настройки"}));
    await waitFor(()=>expect(screen.getByTestId("settings-workspace")).toBeInTheDocument());
    expect(screen.getByRole("button",{name:"Тема настроек"})).toBeEnabled();
    fireEvent.click(screen.getByRole("button",{name:"Камера"}));
    await waitFor(()=>expect(screen.getByTestId("camera-workspace")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:"Настройки"}));
    await waitFor(()=>expect(screen.getByTestId("settings-workspace")).toBeInTheDocument());
  },12000);
  it("opens Settings after a Camera / Editor / Camera transition",async()=>{
    render(<MulticamApp/>);
    await waitFor(()=>expect(screen.getByTestId("camera-workspace")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:"Редактор"}));
    await waitFor(()=>expect(screen.getByTestId("editor-workspace")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:"Камера"}));
    await waitFor(()=>expect(screen.getByTestId("camera-workspace")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:"Настройки"}));
    await waitFor(()=>expect(screen.getByTestId("settings-workspace")).toBeInTheDocument());
  },12000);
  it("does not synchronously write Android localStorage before opening Settings",async()=>{
    const setItem=vi.spyOn(Storage.prototype,"setItem");
    render(<MulticamApp/>);
    await waitFor(()=>expect(screen.getByTestId("camera-workspace")).toBeInTheDocument());
    setItem.mockClear();
    fireEvent.click(screen.getByRole("button",{name:"Настройки"}));
    expect(setItem.mock.calls.some(([key])=>key==="multicam-view-state-v1")).toBe(false);
    await waitFor(()=>expect(screen.getByTestId("settings-workspace")).toBeInTheDocument());
    // The restored view is deliberately persisted AFTER two paint frames.
    // Even if WebView cannot provide frames, pagehide must preserve it.
    window.dispatchEvent(new Event("pagehide"));
    expect(setItem.mock.calls.some(([key])=>key==="multicam-view-state-v1")).toBe(true);
    setItem.mockRestore();
  },12000);

});
