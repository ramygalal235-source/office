#!/usr/bin/env node
/**
 * يفتح المتصفح تلقائيًا بعد جاهزية الخادم المحلي — بلا أي اعتماديات.
 * يُشغَّل في الخلفية من ملف التشغيل بنقرة مزدوجة، وينتهي بهدوء.
 */
import net from "node:net";
import { spawn } from "node:child_process";

const PORT = 3000;
const TIMEOUT_MS = 120_000; // وضع التطوير يحتاج وقتًا للترجمة الأولى

function probe() {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port: PORT, timeout: 500 });
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

const started = Date.now();
while (Date.now() - started < TIMEOUT_MS) {
  if (await probe()) break;
  await new Promise((r) => setTimeout(r, 750));
}

const url = `http://localhost:${PORT}`;
try {
  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  else if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  else spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
} catch {
  // لا نُسقط الناقل لأن المتصفح لم يفتح
}
process.exit(0);
