const { app, BrowserWindow, Menu, shell, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_ROOT = __dirname;
const START_PAGE = path.join(APP_ROOT, "index.html");
const APP_ICON_ICO = path.join(APP_ROOT, "app-icon.ico");
const APP_ICON_PNG = path.join(APP_ROOT, "icon-512.png");

function getWindowIcon() {
  return process.platform === "win32" ? APP_ICON_ICO : APP_ICON_PNG;
}

function createAppWindow(targetUrl = pathToFileURL(START_PAGE).toString(), overrides = {}) {
  const window = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#f0f4f8",
    autoHideMenuBar: true,
    title: "Nong AIDE SWD",
    icon: getWindowIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    ...overrides
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.loadURL(targetUrl);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }

    createAppWindow(url, {
      width: 1100,
      height: 800
    });

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (/^https?:/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return window;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (requestingOrigin && requestingOrigin.startsWith("file://")) {
      return permission === "media" || permission === "camera" || permission === "microphone";
    }

    return false;
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (details.requestingUrl && details.requestingUrl.startsWith("file://")) {
      callback(permission === "media" || permission === "camera" || permission === "microphone");
      return;
    }

    callback(false);
  });

  Menu.setApplicationMenu(null);
  createAppWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
