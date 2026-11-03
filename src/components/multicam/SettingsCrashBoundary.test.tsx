import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsCrashBoundary } from "./SettingsCrashBoundary";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("settings failure isolation", () => {
  it("keeps navigation available after a render crash and can retry", () => {
    const onExit = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    function Content() {
      if (broken) throw new Error("simulated settings failure");
      return <div>Настройки открыты</div>;
    }
    render(<div>
      <nav>Главная навигация</nav>
      <SettingsCrashBoundary onExit={onExit}><Content /></SettingsCrashBoundary>
    </div>);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось открыть настройки");
    expect(screen.getByText("Главная навигация")).toBeInTheDocument();
    broken = false;
    fireEvent.click(screen.getByText("Повторить"));
    expect(screen.getByText("Настройки открыты")).toBeInTheDocument();
    expect(log).toHaveBeenCalled();
  });

  it("allows escaping a failing settings screen without changing other tabs", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onExit = vi.fn();
    function Broken(): never { throw new Error("broken"); }
    render(<SettingsCrashBoundary onExit={onExit}><Broken /></SettingsCrashBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "Камера" }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
