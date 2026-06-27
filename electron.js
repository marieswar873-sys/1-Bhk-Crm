const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execFile } = require('child_process');

// Send raw ESC/POS bytes straight to a printer via the Windows spooler (RAW datatype).
// Works with any thermal printer installed in Windows — no driver rendering, no native module.
ipcMain.handle('print-raw', async (e, { data, deviceName }) => {
  const printer = deviceName;
  return new Promise((resolve) => {
    try {
      const tmp = path.join(os.tmpdir(), `escpos_${Date.now()}.bin`);
      fs.writeFileSync(tmp, Buffer.from(data, 'base64'));
      const ps = [
        '$ErrorActionPreference="Stop"',
        'Add-Type -TypeDefinition @"',
        'using System; using System.IO; using System.Runtime.InteropServices;',
        'public class RP {',
        ' [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DI { [MarshalAs(UnmanagedType.LPWStr)] public string n; [MarshalAs(UnmanagedType.LPWStr)] public string o; [MarshalAs(UnmanagedType.LPWStr)] public string t; }',
        ' [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string s, out IntPtr h, IntPtr d);',
        ' [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);',
        ' [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int l, ref DI di);',
        ' [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);',
        ' [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);',
        ' [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);',
        ' [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);',
        ' public static void Send(string printer, string file){ IntPtr h; if(!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed"); DI di=new DI(); di.n="Receipt"; di.t="RAW"; StartDocPrinter(h,1,ref di); StartPagePrinter(h); byte[] b=File.ReadAllBytes(file); int w; WritePrinter(h,b,b.Length,out w); EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h); }',
        '}',
        '"@',
        `[RP]::Send('${String(printer).replace(/'/g, "''")}', '${tmp.replace(/\\/g, '\\\\')}')`,
      ].join('\n');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, (err) => {
        try { fs.unlinkSync(tmp); } catch {}
        resolve({ success: !err, error: err ? err.message : undefined });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// List installed printers for the Settings screen.
ipcMain.handle('get-printers', async () => {
  try { return await mainWindow.webContents.getPrintersAsync(); }
  catch { return []; }
});

// Print a receipt/KOT silently to a chosen printer (no dialog).
ipcMain.handle('print-receipt', async (e, { html, deviceName }) => {
  return new Promise((resolve) => {
    const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
    pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    pw.webContents.once('did-finish-load', () => {
      // small delay so the logo image decodes before printing
      setTimeout(() => {
        pw.webContents.print(
          { silent: true, deviceName: deviceName || undefined, margins: { marginType: 'none' }, printBackground: true },
          (success, reason) => { try { pw.close(); } catch {} resolve({ success, reason }); }
        );
      }, 400);
    });
  });
});

let mainWindow;
let tray;
const PORT = 3001;

function createWindow() {
  const { nativeImage } = require('electron');
  const iconPath = path.join(__dirname, 'client', 'public', 'logo.png');
  const appIcon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: '1BHK CRM',
    icon: appIcon,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  // Wait for server to be ready, then load
  const checkServer = () => {
    const http = require('http');
    http.get(`http://localhost:${PORT}/api/auth/me`, () => {
      mainWindow.loadURL(`http://localhost:${PORT}`);
      mainWindow.show();
      mainWindow.focus();
    }).on('error', () => {
      setTimeout(checkServer, 500);
    });
  };

  setTimeout(checkServer, 1000);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Daily local backup of the database to Documents\1BHK-CRM-Backups (safe even if the
// laptop's disk later fails). Keeps the last 14 days. Runs once per day on startup.
async function dailyBackup() {
  try {
    const dbPath = process.env.DB_PATH;
    if (!dbPath || !fs.existsSync(dbPath)) return;
    const dir = path.join(app.getPath('documents'), '1BHK-CRM-Backups');
    fs.mkdirSync(dir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const dest = path.join(dir, `restaurant-${today}.db`);
    if (fs.existsSync(dest)) return; // already backed up today
    const { backupTo } = require('./server/db/schema');
    await backupTo(dest);
    console.log('[Backup] Saved', dest);
    const files = fs.readdirSync(dir).filter(f => /^restaurant-.*\.db$/.test(f)).sort();
    while (files.length > 14) { try { fs.unlinkSync(path.join(dir, files.shift())); } catch {} }
  } catch (e) { console.error('[Backup]', e.message); }
}

app.whenReady().then(() => {
  // Set DB path to user data folder
  process.env.DB_PATH = path.join(app.getPath('userData'), 'restaurant.db');
  process.env.PORT = String(PORT);

  // Load .env
  try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}

  // Start the Express server
  require('./server/index.js');

  // Daily backup once the DB is initialized
  setTimeout(dailyBackup, 4000);

  // Create window after server starts
  createWindow();
});

// Sync-on-close: flush any pending orders to the cloud before quitting, so the last
// few minutes of sales are never stuck only on the laptop. Capped at 8s so it can't hang.
let didFinalSync = false;
app.on('before-quit', async (e) => {
  if (didFinalSync) return;
  e.preventDefault();
  didFinalSync = true;
  try {
    const { fullSync } = require('./server/services/supabaseSync');
    await Promise.race([fullSync(), new Promise(r => setTimeout(r, 8000))]);
  } catch {}
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
