// Parse the ACTUAL production JavaScript shipped in the APK, not the TS source.
// Older Android 9 emulators ship WebView 69, which cannot parse optional
// chaining / nullish coalescing. A single incompatible lazy chunk can crash
// navigation later, so examine every generated JS file, not just the entry.
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const outputRoot = resolve(".output/public");
// Vite transforms inline scripts into modules. The fallback MUST remain a
// parser-blocking classic asset, ahead of all production module execution.
const html = await readFile(join(outputRoot, "index.html"), "utf8");
const legacyScript = html.search(/<script\b[^>]*\bsrc=["'][^"']*legacy-globalthis\.js["'][^>]*>/i);
const firstModule = html.search(/<script\b[^>]*\btype=["']module["'][^>]*>/i);
// Vite may hoist deferred module tags into <head> before the classic script
// in <body>. HTML guarantees execution of parser-blocking classic scripts
// before deferred modules regardless of their textual order.
if (legacyScript === -1 || firstModule === -1) {
  console.error("Android generated HTML:", html);
  throw new Error("Android 9 startup polyfill missing or executed after the app module");
}
const legacyContent = await readFile(join(outputRoot, "legacy-globalthis.js"), "utf8");
if (!legacyContent.includes('Object.defineProperty(window, "globalThis"') ||
    !legacyContent.includes('window.queueMicrotask = function')) {
  throw new Error("Android 9 legacy globalThis/queueMicrotask asset missing from APK");
}
const violations = [];
let scanned = 0;

async function scanDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(filename);
    } else if (entry.isFile() && filename.endsWith(".js")) {
      scanned++;
      const source = ts.createSourceFile(filename, await readFile(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const file = relative(outputRoot, filename);
      for (const diagnostic of source.parseDiagnostics) {
        violations.push(`${file}: invalid JavaScript near offset ${diagnostic.start}`);
      }
      function visit(node) {
        if (node.questionDotToken) {
          violations.push(`${file}: optional chaining (?.) near offset ${node.pos}`);
        }
        if (ts.isBinaryExpression(node) && [
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.QuestionQuestionEqualsToken,
          ts.SyntaxKind.BarBarEqualsToken,
          ts.SyntaxKind.AmpersandAmpersandEqualsToken,
        ].includes(node.operatorToken.kind)) {
          violations.push(`${file}: JavaScript operator unsupported by Chrome 69 near offset ${node.pos}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
await scanDirectory(outputRoot);
if (scanned === 0) throw new Error("No compiled Android JavaScript was found");
if (violations.length > 0) {
  console.error(`Android 9 WebView 69 incompatible JS (${violations.length} issues):`);
  console.error(violations.slice(0, 30).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Android 9 syntax check: ${scanned} generated JS files have no optional chaining or nullish operators.`);
}
