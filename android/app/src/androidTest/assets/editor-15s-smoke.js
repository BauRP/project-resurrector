/*
 * Instrumentation-only reproduction: generate fifteen seconds of real encoded
 * video inside the same WebView, save it as a normal original clip, then mount
 * the real Editor with that clip on its timeline. No production test media,
 * feature flag, camera access or network dependency is required.
 */
(function () {
  if (window.__multicam15sSmoke) return true;
  var run = window.__multicam15sSmoke = { status: "starting" };
  var stream = null, interval = null, recorder = null, timeout = null;
  function stopTracks() {
    if (interval !== null) clearInterval(interval);
    if (timeout !== null) clearTimeout(timeout);
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
  }
  function fail(error) {
    stopTracks();
    run.status = "error:" + String(error && error.message || error);
  }
  try {
    var canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360;
    var ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx || !canvas.captureStream || typeof MediaRecorder === "undefined") {
      run.status = "unsupported:canvas-or-mediarecorder"; return true;
    }
    var mime = ["video/webm;codecs=vp8", "video/webm"].filter(function (m) {
      return MediaRecorder.isTypeSupported(m);
    })[0];
    if (!mime) { run.status = "unsupported:video-encoder"; return true; }
    var drawCount = 0;
    function draw() {
      var frame = drawCount++;
      var x = (frame * 7) % 640;
      ctx.fillStyle = "#0d1f3b"; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = "#c3daf6"; ctx.fillRect(x, 80, 90, 120);
      ctx.fillStyle = "#ffd060"; ctx.fillRect((640 - x) % 640, 230, 60, 60);
      ctx.fillStyle = "#ffffff"; ctx.font = "22px sans-serif";
      ctx.fillText("Editor 15s smoke frame " + frame, 20, 40);
    }
    draw();
    stream = canvas.captureStream(15);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 650000 });
    var parts = [];
    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size) parts.push(event.data);
    };
    recorder.onerror = function () { fail("MediaRecorder encoder error"); };
    recorder.onstop = function () {
      stopTracks();
      var blob = new Blob(parts, { type: mime });
      if (blob.size < 1024) { fail("synthetic video is empty"); return; }
      var id = "editor-smoke-15-seconds";
      try {
        var open = indexedDB.open("multicam-pov-media", 1);
        open.onupgradeneeded = function () {
          if (!open.result.objectStoreNames.contains("clips")) {
            open.result.createObjectStore("clips", { keyPath: "id" });
          }
        };
        open.onerror = function () { fail(open.error || "IndexedDB failed"); };
        open.onblocked = function () { fail("IndexedDB blocked"); };
        open.onsuccess = function () {
          var db = open.result;
          try {
            var tx = db.transaction("clips", "readwrite");
            tx.objectStore("clips").put({
              id: id, createdAt: Date.now(), camera: 1, kind: "video",
              name: "Editor smoke 15 seconds.webm", duration: 15, blob: blob
            });
            tx.onerror = function () { db.close(); fail(tx.error || "Saving fixture failed"); };
            tx.oncomplete = function () {
              db.close();
              try {
                // A prior instrumentation test may leave the playhead beyond
                // the 14.5-second fixture. Start every playback test at zero.
                localStorage.setItem("multicam-view-state-v1", JSON.stringify({
                  tab: "camera", playhead: 0
                }));
                localStorage.setItem("multicam-editor-project-v1", JSON.stringify({
                  items: [{
                    id: "editor-smoke-timeline-item", mediaId: id, kind: "video",
                    track: 1, start: 0, in: 0, out: 14.5, speed: 1,
                    reverse: false, scale: 100, posX: 0, opacity: 100,
                    look: "Без цвета"
                  }],
                  overlays: [], transitions: [], hidden: {}, muted: {},
                  vTracks: 1, aTracks: 1
                }));
                run.bytes = blob.size;
                run.status = "ready";
              } catch (error) { fail(error); }
            };
          } catch (error) { db.close(); fail(error); }
        };
      } catch (error) { fail(error); }
    };
    recorder.start(500);
    run.status = "encoding";
    interval = setInterval(draw, 1000 / 15);
    timeout = setTimeout(function () {
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch (error) { fail(error); }
      }
    }, 15000);
    return true;
  } catch (error) { fail(error); return true; }
})()
