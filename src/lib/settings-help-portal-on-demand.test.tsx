import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HelpDot } from "@/components/multicam/Help";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Settings help portals do not compete with the first Android WebView frame", () => {
  it("mounts an accessible help dialog only after explicitly opening it", async () => {
    const view = render(<HelpDot id="language" />);
    expect(screen.getByRole("button", { name: /Справка:/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Справка:/ }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Язык интерфейса; арабский включает письмо справа налево.")).toBeTruthy();
    view.unmount();
  });
});
