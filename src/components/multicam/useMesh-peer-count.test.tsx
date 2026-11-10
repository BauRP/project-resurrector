import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  peers: [] as Array<{ id: string; battery?: number }>,
  listeners: new Set<() => void>(),
}));
vi.mock("@/lib/mesh", () => ({
  mesh: {
    subscribe: (fn: () => void) => {
      state.listeners.add(fn);
      return () => { state.listeners.delete(fn); };
    },
    getSnapshot: () => state.peers,
  },
}));
import { useMeshPeerCount, useMeshPeers } from "./useMesh";

afterEach(() => {
  cleanup(); state.listeners.clear(); state.peers = [];
});
const publish = (peers: typeof state.peers) => {
  act(() => { state.peers = peers; state.listeners.forEach(fn => fn()); });
};

describe("Connected camera count does not repaint app on telemetry heartbeat", () => {
  it("keeps the root UI stable when peer details change but count does not", () => {
    let renders = 0;
    function ShellCount() { renders++; return <span data-testid="count">{useMeshPeerCount()}</span>; }
    render(<ShellCount />);
    expect(screen.getByTestId("count").textContent).toBe("0");
    publish([{ id: "camera-A" }]);
    expect(screen.getByTestId("count").textContent).toBe("1");
    const rendered = renders;
    publish([{ id: "camera-A", battery: 90 }]);
    expect(renders).toBe(rendered);
    publish([]);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
  it("preserves detailed subscriptions for connected-camera controls", () => {
    let renders = 0;
    function Details() { const peers = useMeshPeers(); renders++; return <span>{peers[0]?.battery ?? "unknown"}</span>; }
    render(<Details />);
    publish([{ id: "camera-B" }]);
    const before = renders;
    publish([{ id: "camera-B", battery: 42 }]);
    expect(renders).toBeGreaterThan(before);
    expect(screen.getByText("42")).toBeTruthy();
  });
});
