/* eslint-env node */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataFile = path.join(__dirname, "..", "data", "signals_history.json");
const outFile = path.join(__dirname, "signal_report.json");
let timer = null;

function runAnalysis() {
  const proc = spawn(
    globalThis.process.execPath,
    [path.join(__dirname, "analyze_signals.js"), dataFile, outFile],
    {
      stdio: "inherit",
    }
  );
  proc.on("close", (code) => {
    if (code === 0)
      console.log("[analyze_watch] análise finalizada com sucesso");
    else console.error("[analyze_watch] análise finalizada com código", code);
  });
}

if (!fs.existsSync(path.dirname(dataFile))) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
}

console.log("[analyze_watch] Observando arquivo:", dataFile);
fs.watch(path.dirname(dataFile), (eventType, filename) => {
  if (!filename) return;
  if (filename !== path.basename(dataFile)) return;
  // Debounce: esperar 500ms após a última modificação
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(
      "[analyze_watch] Mudança detectada em",
      filename,
      "- executando análise..."
    );
    runAnalysis();
  }, 500);
});

// Rodar análise inicial
runAnalysis();
