'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const store = require('./store');
const updater = require('./updater');

let mainWindow = null;

function isPackaged() {
  return app.isPackaged;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    title: "Moore's Body Shop — Payroll",
    backgroundColor: '#f4f5f8',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  updater.attachWindow(mainWindow);
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit' }]
    },
    { role: 'editMenu' }
  ];
  if (!isPackaged()) {
    template.push({ role: 'viewMenu' });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle('app:meta', () => store.getMeta());

  ipcMain.handle('data:load', async () => {
    return store.loadEmployees();
  });

  ipcMain.handle('data:save', async (_event, data) => {
    try {
      return await store.saveEmployees(data);
    } catch {
      return { ok: false, message: 'Could not save payroll data.' };
    }
  });

  ipcMain.handle('settings:get', async () => store.loadSettings());

  ipcMain.handle('settings:save', async (_event, patch) => {
    return store.saveSettings(patch);
  });

  ipcMain.handle('data:openFolder', async () => {
    await store.ensureDirs();
    const result = await shell.openPath(store.dataRoot());
    return { ok: !result, message: result || null };
  });

  ipcMain.handle('app:openPub15t', async () => {
    const pdf = isPackaged()
      ? path.join(process.resourcesPath, 'p15t.pdf')
      : path.join(__dirname, '../../docs/p15t.pdf');
    const result = await shell.openPath(pdf);
    return { ok: !result, message: result || null };
  });

  ipcMain.handle('data:exportEncrypted', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const stamp = new Date().toISOString().slice(0, 10);
    const choice = await dialog.showSaveDialog(win, {
      title: 'Export encrypted backup',
      defaultPath: `MooresBodyShop-payroll-backup-${stamp}.json.enc`,
      filters: [
        { name: 'Encrypted payroll', extensions: ['enc'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (choice.canceled || !choice.filePath) return { ok: false, canceled: true };
    await store.exportEncryptedTo(choice.filePath);
    return { ok: true, path: choice.filePath };
  });

  ipcMain.handle('data:exportDecrypted', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const stamp = new Date().toISOString().slice(0, 10);
    const choice = await dialog.showSaveDialog(win, {
      title: 'Export decrypted JSON backup',
      defaultPath: `MooresBodyShop-payroll-DECrypted-${stamp}.json`,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (choice.canceled || !choice.filePath) return { ok: false, canceled: true };
    await store.exportDecryptedTo(choice.filePath);
    return { ok: true, path: choice.filePath };
  });

  ipcMain.handle('data:import', async (_event, mode) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const choice = await dialog.showOpenDialog(win, {
      title: 'Import payroll backup',
      properties: ['openFile'],
      filters: [
        { name: 'Payroll backups', extensions: ['enc', 'json'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (choice.canceled || !choice.filePaths || !choice.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const useMode = mode === 'replace' ? 'replace' : 'merge';
    try {
      const data = await store.importFrom(choice.filePaths[0], useMode);
      return { ok: true, data };
    } catch (err) {
      const message = err && err.message ? String(err.message) : 'Import failed.';
      return { ok: false, message };
    }
  });

  ipcMain.handle('update:check', async () => updater.check());
  ipcMain.handle('update:download', async () => updater.download());
  ipcMain.handle('update:install', async () => updater.install());

  ipcMain.handle('reports:list', async () => {
    try {
      return { ok: true, files: await store.listReports(), folder: store.reportsDir() };
    } catch (err) {
      return { ok: false, message: err && err.message ? String(err.message) : 'Could not list reports.' };
    }
  });

  ipcMain.handle('reports:openFolder', async () => {
    await store.ensureDirs();
    const result = await shell.openPath(store.reportsDir());
    return { ok: !result, message: result || null };
  });

  ipcMain.handle('reports:open', async (_event, rel) => {
    try {
      const dest = store.resolveReportPath(rel);
      const result = await shell.openPath(dest);
      return { ok: !result, message: result || null };
    } catch (err) {
      return { ok: false, message: err && err.message ? String(err.message) : 'Could not open report.' };
    }
  });

  ipcMain.handle('reports:savePdf', async (_event, payload) => {
    const html = payload && payload.html;
    const fileName = payload && payload.fileName;
    const subdir = (payload && payload.subdir) || '';
    if (!html || !fileName) return { ok: false, message: 'Missing report content.' };
    const tmp = path.join(os.tmpdir(), `mbsp-report-${Date.now()}-${process.pid}.html`);
    let win = null;
    try {
      await fsp.writeFile(tmp, String(html), 'utf8');
      win = new BrowserWindow({
        show: false,
        width: 900,
        height: 1100,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      await win.loadFile(tmp);
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'Letter',
        preferCSSPageSize: true,
        margins: { marginType: 'default' }
      });
      const dest = await store.saveReportPdf(subdir, fileName, pdf);
      return { ok: true, path: dest, rel: path.relative(store.reportsDir(), dest) };
    } catch (err) {
      return { ok: false, message: err && err.message ? String(err.message) : 'Could not create PDF.' };
    } finally {
      if (win && !win.isDestroyed()) win.destroy();
      await fsp.unlink(tmp).catch(() => {});
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.mooresbodyshop.payroll');
    registerIpc();
    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

process.on('uncaughtException', () => {
  /* never dump payroll payloads */
});
