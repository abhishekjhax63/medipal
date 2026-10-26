/**
 * Development launcher.
 *
 * Starts the API server and the Vite dev server together so `npm run dev` gives
 * a single command that runs the whole app. `server/index.mjs` receives `/api/*`
 * requests because Vite proxies that prefix to it (see `vite.config.ts`).
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

function run(label, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", env: process.env });
  child.on("error", (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("api", process.execPath, [resolve(root, "server/index.mjs")]);
run("web", process.execPath, [resolve(root, "node_modules/vite/bin/vite.js")]);
