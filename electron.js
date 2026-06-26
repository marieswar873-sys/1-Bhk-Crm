const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');

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

app.whenReady().then(() => {
  // Set DB path to user data folder
  process.env.DB_PATH = path.join(app.getPath('userData'), 'restaurant.db');
  process.env.PORT = String(PORT);

  // Load .env
  try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}

  // Start the Express server
  require('./server/index.js');

  // Create window after server starts
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
