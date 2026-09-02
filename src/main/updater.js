'use strict';

const { app, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const store = require('./store');

const DEFAULT_URL = 'https://github.com/scra976/moores-bodyshop-payroll/releases/latest/download/';
const USER_AGENT = 'MooresBodyShopPayroll/1.0.3';

let mainWindow = null;
let configured = false;

function send(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:event', payload);
  }
}

function sanitizeInfo(info) {
  if (!info) return null;
  const files = Array.isArray(info.files)
    ? info.files.map((f) => ({
        url: typeof f.url === 'string' ? f.url : '',
        size: typeof f.size === 'number' ? f.size : null
      }))
    : [];
  let releaseNotes = '';
  if (typeof info.releaseNotes === 'string') {
    releaseNotes = info.releaseNotes;
  } else if (Array.isArray(info.releaseNotes)) {
    releaseNotes = info.releaseNotes
      .map((n) => (typeof n === 'string' ? n : n && n.note ? n.note : ''))
      .filter(Boolean)
      .join('\n');
  }
  return {
    version: info.version || '',
    releaseDate: info.releaseDate || null,
    releaseNotes,
    files,
    path: info.path || (files[0] && files[0].url) || '',
    sha512: undefined
  };
}

function friendlyError(err) {
  const raw = err && err.message ? String(err.message) : '';
  if (/404|not found|cannot find/i.test(raw)) {
    return 'Update files not found on GitHub. Attach latest.yml and the Setup .exe to the latest release.';
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::|ERR_INTERNET|offline|unreachable/i.test(raw)) {
    return 'No update server reachable';
  }
  return 'No update server reachable';
}

function normalizeFeedUrl(url) {
  let u = (url || DEFAULT_URL).trim();
  if (!u) u = DEFAULT_URL;
  if (!u.endsWith('/')) u += '/';
  return u;
}

function parseGithub(url) {
  const m = String(url || '').match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, '') };
}

function cmpSemver(a, b) {
  const pa = String(a || '0').split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function netGet(url, accept) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    };
    const request = net.request({
      method: 'GET',
      url,
      redirect: 'follow'
    });
    request.setHeader('User-Agent', USER_AGENT);
    request.setHeader('Accept', accept || 'application/octet-stream, text/plain, application/yaml, application/json, */*');
    const chunks = [];
    request.on('response', (response) => {
      const status = response.statusCode || 0;
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        if (status >= 400) {
          finish(new Error(`HTTP ${status}`));
          return;
        }
        finish(null, { status, body });
      });
    });
    request.on('error', (err) => finish(err));
    request.end();
    setTimeout(() => finish(new Error('ETIMEDOUT')), 20000);
  });
}

function parseLatestYml(text) {
  const version = (String(text).match(/^version:\s*['"]?([0-9]+\.[0-9]+\.[0-9]+)/m) || [])[1] || '';
  const filePath = (String(text).match(/^path:\s*['"]?(\S+)/m) || [])[1] || '';
  const size = Number((String(text).match(/^\s*size:\s*(\d+)/m) || [])[1] || 0);
  return { version, path: filePath, size };
}

async function readGithubLatest(owner, repo) {
  const api = await netGet(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    'application/vnd.github+json'
  );
  let release;
  try {
    release = JSON.parse(api.body.toString('utf8'));
  } catch {
    throw new Error('No update server reachable');
  }
  if (!release || release.message === 'Not Found') {
    throw new Error('cannot find latest.yml');
  }
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const setup =
    assets.find((a) => /Setup-.*\.exe$/i.test(a.name) && !/portable/i.test(a.name)) ||
    assets.find((a) => /\.exe$/i.test(a.name) && !/portable/i.test(a.name));
  const yml = assets.find((a) => /^latest\.yml$/i.test(a.name));
  let parsed = { version: '', path: '', size: 0 };
  if (yml && yml.browser_download_url) {
    try {
      const ymlRes = await netGet(yml.browser_download_url);
      parsed = parseLatestYml(ymlRes.body.toString('utf8'));
    } catch {
      parsed = { version: '', path: '', size: 0 };
    }
  }
  const tagVersion = String(release.tag_name || '').replace(/^v/i, '');
  const version = parsed.version || tagVersion;
  if (!version) throw new Error('cannot find latest.yml');
  const notes = typeof release.body === 'string' ? release.body : '';
  return {
    version,
    path: parsed.path || (setup && setup.name) || '',
    size: parsed.size || (setup && setup.size) || 0,
    releaseNotes: notes,
    releaseDate: release.published_at || null
  };
}

async function readGenericLatest(feedUrl) {
  const url = `${normalizeFeedUrl(feedUrl)}latest.yml`;
  const res = await netGet(url);
  const parsed = parseLatestYml(res.body.toString('utf8'));
  if (!parsed.version) throw new Error('cannot find latest.yml');
  return parsed;
}

function ensureConfigured() {
  if (configured) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.channel = 'latest';
  autoUpdater.verifyUpdateCodeSignature = false;
  autoUpdater.forceDevUpdateConfig = !app.isPackaged;
  autoUpdater.requestHeaders = { 'User-Agent': USER_AGENT };
  autoUpdater.logger = {
    info() {},
    warn() {},
    error() {},
    debug() {}
  };

  autoUpdater.on('checking-for-update', () => {
    send({ phase: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    send({ phase: 'available', info: sanitizeInfo(info) });
  });
  autoUpdater.on('update-not-available', (info) => {
    send({ phase: 'none', info: sanitizeInfo(info) });
  });
  autoUpdater.on('error', (err) => {
    send({ phase: 'error', message: friendlyError(err) });
  });
  autoUpdater.on('download-progress', (progress) => {
    send({
      phase: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    send({ phase: 'downloaded', info: sanitizeInfo(info) });
  });

  configured = true;
}

async function applyFeedFromSettings() {
  ensureConfigured();
  const settings = await store.loadSettings();
  const url = normalizeFeedUrl(settings.updateUrl);
  const gh = parseGithub(url);
  if (gh) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: gh.owner,
      repo: gh.repo,
      releaseType: 'release'
    });
  } else {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url
    });
  }
  return url;
}

function waitForCheckResult(timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      autoUpdater.removeListener('update-available', onAvail);
      autoUpdater.removeListener('update-not-available', onNone);
      autoUpdater.removeListener('error', onErr);
      resolve(payload);
    };
    const onAvail = (info) => finish({ ok: true, status: 'available', info: sanitizeInfo(info) });
    const onNone = (info) => finish({ ok: true, status: 'none', info: sanitizeInfo(info) });
    const onErr = (err) => finish({ ok: false, status: 'error', message: friendlyError(err) });
    autoUpdater.once('update-available', onAvail);
    autoUpdater.once('update-not-available', onNone);
    autoUpdater.once('error', onErr);
    setTimeout(() => finish({ ok: false, status: 'error', message: friendlyError() }), timeoutMs);
  });
}

async function check() {
  ensureConfigured();
  const url = await applyFeedFromSettings().catch(() => DEFAULT_URL);
  await store.saveSettings({ lastChecked: new Date().toISOString() });

  try {
    const gh = parseGithub(url);
    const remote = gh ? await readGithubLatest(gh.owner, gh.repo) : await readGenericLatest(url);
    const current = app.getVersion();
    const newer = cmpSemver(remote.version, current) > 0;
    const info = {
      version: remote.version,
      releaseDate: remote.releaseDate || null,
      releaseNotes: remote.releaseNotes || '',
      files: remote.size ? [{ url: remote.path || '', size: remote.size }] : [],
      path: remote.path || ''
    };
    if (newer) {
      send({ phase: 'available', info });
      return { ok: true, status: 'available', info };
    }
    send({ phase: 'none', info });
    return { ok: true, status: 'none', info };
  } catch (err) {
    send({ phase: 'error', message: friendlyError(err) });
    return { ok: false, status: 'error', message: friendlyError(err) };
  }
}

async function download() {
  ensureConfigured();
  await applyFeedFromSettings();
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo && cmpSemver(result.updateInfo.version, app.getVersion()) <= 0) {
      return { ok: false, message: 'No newer version to download' };
    }
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

function install() {
  ensureConfigured();
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 200);
  return { ok: true };
}

function attachWindow(win) {
  mainWindow = win;
  ensureConfigured();
}

module.exports = {
  attachWindow,
  check,
  download,
  install,
  applyFeedFromSettings,
  friendlyError
};
