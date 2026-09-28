/**
 * دفاتر المحاسب — غلاف سطح المكتب (Electron)
 * ------------------------------------------------------------------
 * المستخدم النهائي يفتح التطبيق بنقرة مزدوجة فقط. هذا الملف:
 *   1) يختار منفذًا محليًا حرًا (3000 فأعلى)
 *   2) يشغّل خادم Next.js محليًا على 127.0.0.1 فقط (لا شبكة محلية)
 *      - في التطوير:  next dev
 *      - في الحزمة:   node.exe server.js (نسخة standalone مرفقة)
 *   3) يجهز مجلد البيانات في %APPDATA%\DafatirOffice
 *      (قاعدة البيانات + الوثائق + السر) وينسخ قاعدة البيانات
 *      المهيأة أول مرة عند أول تشغيل
 *   4) يفتح النافذة ويبقي الخادم حيًا ما دامت مفتوحة
 *
 * كل البيانات تبقى على الجهاز — local-first.
 */
const { app, BrowserWindow, Menu } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const APP_FOLDER = "DafatirOffice"; // مجلد بيانات المستخدم (ASCII لأمان المسار)
const BASE_PORT = 3000;

app.setName(APP_FOLDER);

const IS_PACKAGED = app.isPackaged;
const ROOT = IS_PACKAGED ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..", "..");

let serverProc = null;
let mainWin = null;
let chosenPort = null;
let logStream = null;

// ------------------------------------------------------------------ أدوات المنفذ
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  for (let p = BASE_PORT; p < BASE_PORT + 11; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error("لم يُعثر على منفذ محلي حر");
}

function portReady(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port, timeout: 500 });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await portReady(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("الخادم المحلي لم يكن جاهزًا خلال المدة المتوقعة");
}

// ------------------------------------------------------------------ مجلد البيانات
function bootstrapData() {
  const dataDir = app.getPath("userData"); // %APPDATA%\DafatirOffice
  const dbDir = path.join(dataDir, "db");
  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "db", "uploads"), { recursive: true });

  // قاعدة البيانات المهيأة (من البناء) تُنسخ لأول مرة فقط — النسخ لاحقًا ملك المستخدم
  const targetDb = path.join(dbDir, "app.db");
  if (!fs.existsSync(targetDb)) {
    const bundledDb = path.join(ROOT, "db", "app.db");
    if (fs.existsSync(bundledDb)) fs.copyFileSync(bundledDb, targetDb);
  }

  // سر الجلسة: يُولد مرة واحدة ويُحفظ مع البيانات (النسخ الاحتياطي ينقله معها)
  const secretFile = path.join(dataDir, "secret.key");
  let secret;
  if (fs.existsSync(secretFile)) secret = fs.readFileSync(secretFile, "utf8").trim();
  else {
    secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  }
  return { dataDir, dbPath: targetDb, secret };
}

// ------------------------------------------------------------------ الخادم
function startServer(port) {
  const dataDir = app.getPath("userData");
  const dbPath = path.join(dataDir, "db", "app.db");
  const secretFile = path.join(dataDir, "secret.key");
  const secret = fs.readFileSync(secretFile, "utf8").trim();
  const logFile = path.join(dataDir, "server.log");
  logStream = fs.createWriteStream(logFile, { flags: "a" });

  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    DAFATIR_DATA_DIR: dataDir,
    DATABASE_URL: `file:${dbPath}`,
    SESSION_SECRET: secret,
  };

  let proc;
  if (IS_PACKAGED) {
    const nodeBin = path.join(ROOT, process.platform === "win32" ? "node.exe" : "node");
    proc = spawn(nodeBin, ["server.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  } else {
    // التطوير: وضع next dev على نفس المنفذ
    proc = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  }

  const pipe = (stream) =>
    stream.on("data", (d) => {
      if (logStream) logStream.write(d);
    });
  pipe(proc.stdout);
  pipe(proc.stderr);
  proc.on("error", (err) => {
    if (logStream) logStream.write(`[electron] server error: ${err.message}\n`);
  });
  serverProc = proc;
  return proc;
}

function stopServer() {
  if (serverProc && !serverProc.killed) {
    try {
      // على ويندوز: شجرة العمليات كاملة (الخادم + أبنائه)
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(serverProc.pid), "/t", "/f"], { stdio: "ignore" });
      else serverProc.kill("SIGTERM");
    } catch {
      // أُوقف بالفعل
    }
    serverProc = null;
  }
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

// ------------------------------------------------------------------ النافذة
function createWindow(port) {
  mainWin = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "دفاتر المحاسب",
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // لا مغادرة 127.0.0.1 — البرنامج شبكة محلية مغلقة
  mainWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWin.webContents.on("will-navigate", (e, url) => {
    if (!/^https?:\/\/(127\.0\.0\.1|localhost):\d+/.test(url)) e.preventDefault();
  });

  mainWin.loadURL(`http://127.0.0.1:${port}`);
  mainWin.on("closed", () => (mainWin = null));
}

// ------------------------------------------------------------------ الدورة الحياتية
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
});

app.whenReady().then(async () => {
  try {
    bootstrapData();
    Menu.setApplicationMenu(null);
    chosenPort = await pickPort();
    startServer(chosenPort);
    await waitForServer(chosenPort);
    createWindow(chosenPort);
  } catch (err) {
    const { dialog } = require("electron");
    const dataDir = app.getPath("userData");
    dialog.showErrorBox(
      "دفاتر المحاسب — خطأ في الإقلاع",
      `تعذّر تشغيل الخادم المحلي:\n${err.message}\n\nتفاصيل الخادم: ${path.join(dataDir, "server.log")}`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopServer();
  app.quit();
});

app.on("before-quit", () => stopServer());
