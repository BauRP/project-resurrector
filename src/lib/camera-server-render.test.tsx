import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { CameraWorkspace } from "@/components/multicam/CameraWorkspace";
import { CameraTab } from "@/components/multicam/CameraTab";
import { MulticamStoreProvider } from "./multicam-store";

describe("camera preview server rendering", () => {
  it("renders both ownership subscribers without abandoning the server boundary", () => {
    expect(() => renderToString(<MulticamStoreProvider><CameraWorkspace /></MulticamStoreProvider>)).not.toThrow();
    expect(() => renderToString(<MulticamStoreProvider><CameraTab /></MulticamStoreProvider>)).not.toThrow();
  });
});