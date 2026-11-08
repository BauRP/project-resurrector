/** Captures a stuck JavaScript call stack from a debuggable Android WebView.
 * Runs ONLY on GitHub Actions, never in a production application.
 */
import { execFileSync } from "node:child_process";
const port = 19223;
const run = (args, timeout = 2500) => execFileSync("adb", args, {
  encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"],
}).trim();
let socket;
try {
  const pid = run(["shell", "pidof", "app.lovable.multicampov"]).split(/\s+/)[0];
  if (!/^\d+$/.test(pid)) throw new Error("Android app PID missing");
  run(["forward", "tcp:" + port, "localabstract:webview_devtools_remote_" + pid]);
  const response = await fetch("http://127.0.0.1:" + port + "/json", {
    signal: AbortSignal.timeout(2300),
  });
  if (!response.ok) throw new Error("DevTools HTTP " + response.status);
  const targets = await response.json();
  const page = targets.find(x => x.type === "page" && x.webSocketDebuggerUrl)
    ?? targets.find(x => x.webSocketDebuggerUrl);
  if (!page) throw new Error("No debuggable WebView target");
  console.log("Chromium target", page.type, page.url);
  const url = page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/,
    "ws://127.0.0.1:" + port);
  socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => reject(new Error("V8 pause deadline")), 6200);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ id: 1, method: "Debugger.enable" }));
    });
    socket.addEventListener("error", () => reject(new Error("CDP WebSocket failed")));
    socket.addEventListener("close", () => {
      if (!settled) reject(new Error("CDP closed before stack capture"));
    });
    socket.addEventListener("message", event => {
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (packet.id === 1) {
        if (packet.error) return reject(new Error(JSON.stringify(packet.error)));
        socket.send(JSON.stringify({ id: 2, method: "Debugger.pause" }));
      }
      if (packet.id === 2 && packet.error)
        reject(new Error(JSON.stringify(packet.error)));
      if (packet.method === "Debugger.paused") {
        settled = true;
        clearTimeout(timer);
        console.log("V8 PAUSE", packet.params?.reason);
        for (const frame of (packet.params?.callFrames ?? []).slice(0, 36))
          console.log("V8 FRAME", frame.functionName || "<anonymous>",
            frame.url || "", frame.location?.lineNumber,
            frame.location?.columnNumber);
        socket.send(JSON.stringify({ id: 3, method: "Debugger.resume" }));
        resolve();
      }
    });
  });
} catch (error) {
  console.error("V8 capture unavailable", error instanceof Error ? error.message : error);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  try { run(["forward", "--remove", "tcp:" + port]); } catch { /* cleanup */ }
}
