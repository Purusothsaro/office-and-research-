// Starts the API server (MongoDB) and the Research web app together; Ctrl+C stops both.
import { spawn } from "node:child_process";

const run = (name, args) => {
  const child = spawn("npm", args, { stdio: ["ignore", "pipe", "pipe"], shell: true });
  const prefix = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).map((l) => `[${name}] ${l}`).join("\n") + "\n";
  child.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  child.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown();
  });
  return child;
};

const children = [run("api", ["run", "dev", "-w", "@octo/research-server"]), run("web", ["run", "dev", "-w", "@octo/research-web"])];
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
