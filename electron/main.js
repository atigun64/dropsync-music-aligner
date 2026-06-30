const path = require("path");
const { app, BrowserWindow } = require("electron");
const {
  DEFAULT_PORT,
  getRuntimePaths,
  startBackend,
  startViteDev,
  waitForUrl,
  stopProcess,
} = require("./backend");

const isDev = process.env.ELECTRON_DEV === "1";
const devProjectRoot = path.resolve(__dirname, "..");
const devFrontendDir = path.join(devProjectRoot, "frontend");

let mainWindow = null;
let backendProcess = null;
let viteProcess = null;

async function createWindow() {
  const runtimePaths = getRuntimePaths();
  const backendEnv = {
    MUSIC_MATCHER_SERVE_FRONTEND: isDev ? "0" : "1",
  };

  if (!isDev) {
    backendEnv.MUSIC_MATCHER_STATIC_DIR = runtimePaths.frontendDist;
  }

  backendProcess = startBackend({
    projectRoot: runtimePaths.projectRoot,
    port: DEFAULT_PORT,
    env: backendEnv,
    backendExecutable: runtimePaths.backendExecutable,
    backendCwd: runtimePaths.backendCwd,
  });

  await waitForUrl(`http://127.0.0.1:${DEFAULT_PORT}/health`);

  let appUrl;
  if (isDev) {
    viteProcess = startViteDev({
      frontendDir: devFrontendDir,
      apiPort: DEFAULT_PORT,
    });
    await waitForUrl("http://127.0.0.1:5173");
    appUrl = "http://127.0.0.1:5173";
  } else {
    await waitForUrl(`http://127.0.0.1:${DEFAULT_PORT}/`);
    appUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Music Matcher",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(appUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error(error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error(error);
      app.quit();
    });
  }
});

app.on("before-quit", () => {
  stopProcess(viteProcess);
  stopProcess(backendProcess);
});
