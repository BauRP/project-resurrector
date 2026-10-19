import fs from "fs";
import path from "path";

const htmlContent = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>MULTI-CAM POV</title>
  </head>
  <body class="bg-[#EFF3F8] dark:bg-[#12161F] text-slate-900 dark:text-slate-100 select-none overflow-hidden">
    <div id="root"></div>
    <script type="module" src="/src/capacitor-main.tsx"></script>
  </body>
</html>`;

const indexPath = path.join(process.cwd(), "index.html");
fs.writeFileSync(indexPath, htmlContent, "utf8");
console.log("✅ Временный index.html успешно сгенерирован для Capacitor!");
