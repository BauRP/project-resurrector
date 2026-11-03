import { describe, expect, it } from "vitest";
import { nextRemoteReceiptStatus } from "./remote-record-receipts";
import { readFileSync } from "node:fs";

describe("remote director capture confirmation versus actual recording",()=>{
  it("does not claim recording during setup or file saving",()=>{
    expect(nextRemoteReceiptStatus("received","idle")).toBeNull();
    expect(nextRemoteReceiptStatus("received","starting")).toBeNull();
    expect(nextRemoteReceiptStatus("stopping","saving")).toBeNull();
  });
  it("promotes only genuine recording, stop and durable finalization stages",()=>{
    expect(nextRemoteReceiptStatus("received","recording")).toBe("recording");
    expect(nextRemoteReceiptStatus("recording","stopping")).toBe("stopping");
    expect(nextRemoteReceiptStatus("stopping","saved")).toBe("saved");
    expect(nextRemoteReceiptStatus("received","error")).toBe("error");
  });
  it("never downgrades a stopped or saved camera with delayed stage events",()=>{
    expect(nextRemoteReceiptStatus("saved","recording")).toBeNull();
    expect(nextRemoteReceiptStatus("stopping","recording")).toBeNull();
    expect(nextRemoteReceiptStatus("error","saved")).toBeNull();
    expect(nextRemoteReceiptStatus("recording","recording")).toBeNull();
  });
  it("wires actual UI phase changes and trusted command receipt to the shared protocol",()=>{
    const bridge=readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
    const modal=readFileSync("src/components/multicam/ConnectModal.tsx","utf8");
    expect(bridge).toContain('nextRemoteReceiptStatus(receipt.status, recordingPhase)');
    expect(bridge).toContain('status:"received"');
    expect(bridge).toContain('phase === "saved" || phase === "error"');
    expect(modal).toContain("p.recordStatus");
  });
});
