import JSZip from "jszip";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadText(name: string, text: string, type = "text/plain") { download(new Blob([text], { type }), name); }
export async function downloadProjectZip(project: unknown) {
  const zip = new JSZip();
  zip.file("project.json", JSON.stringify(project, null, 2));
  zip.file("README.txt", "MULTI-CAM POV offline project backup\nContains project metadata, cuts, markers, subtitles and color settings.");
  const data = await zip.generateAsync({ type: "blob" });
  download(data, `multicam-pov-${new Date().toISOString().slice(0, 10)}.zip`);
}
