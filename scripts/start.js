const { spawn } = require("child_process");

console.log("[FlowSync Server] Launching Next.js server...");

const port = process.env.PORT || "8080";
const nextProcess = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

nextProcess.on("exit", (code) => {
  process.exit(code || 0);
});

// Run production database fixes and business logs synchronization in the background
// so the Next.js web server starts immediately and passes the Railway healthcheck instantly
setTimeout(() => {
  const { runProductionFixes } = require("./sync-production-fixes");
  runProductionFixes()
    .then(() => {
      console.log(
        "[FlowSync Server] Production database fixes & activity logs sync completed successfully."
      );
    })
    .catch((err) => {
      console.error("[FlowSync Server] Background sync error:", err);
    });
}, 3000);
