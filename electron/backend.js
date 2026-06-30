const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const DEFAULT_PORT = 47891;

function getRuntimePaths() {
  if (app.isPackaged) {
    const resourcesPath = process.resourcesPath;
    const backendDir = path.join(resourcesPath, "backend");
    const backendExecutable =
      process.platform === "win32"
        ? path.join(backendDir, "music-matcher-backend.exe")
        : path.join(backendDir, "music-matcher-backend");

    return {
      projectRoot: resourcesPath,
      frontendDist: path.join(resourcesPath, "frontend", "dist"),
      backendExecutable,
      backendCwd: backendDir,
    };
  }

  const projectRoot = path.resolve(__dirname, "..");
  return {
    projectRoot,
    frontendDist: path.join(projectRoot, "frontend", "dist"),
    backendExecutable: null,
    backendCwd: projectRoot,
  };
}

function findPython() {
  if (process.env.MUSIC_MATCHER_PYTHON) {
    return process.env.MUSIC_MATCHER_PYTHON;
  }

  return process.platform === "win32" ? "python" : "python3";
}

function startBackend({
  projectRoot,
  port = DEFAULT_PORT,
  env = {},
  backendExecutable = null,
  backendCwd = projectRoot,
}) {
  const childEnv = {
    ...process.env,
    MUSIC_MATCHER_PORT: String(port),
    ...env,
  };

  if (backendExecutable && fs.existsSync(backendExecutable)) {
    const child = spawn(backendExecutable, [], {
      cwd: backendCwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[backend] ${chunk}`);
    });

    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[backend] ${chunk}`);
    });

    return child;
  }

  const python = findPython();
  const args = [
    "-m",
    "uvicorn",
    "app.api.app:app",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ];

  const child = spawn(python, args, {
    cwd: projectRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[backend] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[backend] ${chunk}`);
  });

  return child;
}

function startViteDev({ frontendDir, apiPort = DEFAULT_PORT }) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCmd, ["run", "dev"], {
    cwd: frontendDir,
    env: {
      ...process.env,
      MUSIC_MATCHER_API_PORT: String(apiPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[vite] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[vite] ${chunk}`);
  });

  return child;
}

async function waitForUrl(url, timeoutMs = 120000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function stopProcess(child) {
  if (!child || child.killed) {
    return;
  }
  child.kill("SIGTERM");
}

module.exports = {
  DEFAULT_PORT,
  getRuntimePaths,
  findPython,
  startBackend,
  startViteDev,
  waitForUrl,
  stopProcess,
};
