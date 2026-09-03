'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { app, safeStorage } = require('electron');

const MAGIC = Buffer.from('MBSPAY01');
const FLAG_ENCRYPTED = 0x01;
const FLAG_PLAIN = 0x00;
const MAX_BACKUPS = 20;
const DEFAULT_UPDATE_URL = 'https://github.com/scra976/moores-bodyshop-payroll/releases/latest/download/';

const DEFAULT_ADDRESS = {
  street: '821 Kabrich Street',
  city: 'Blacksburg',
  state: 'VA',
  zip: '24060'
};

function dataRoot() {
  return path.join(app.getPath('appData'), 'MooresBodyShop', 'payroll');
}

function employeesPath() {
  return path.join(dataRoot(), 'employees.json.enc');
}

function settingsPath() {
  return path.join(dataRoot(), 'settings.json');
}

function backupsDir() {
  return path.join(dataRoot(), 'backups');
}

function encryptionAvailable() {
  try {
    return Boolean(safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function defaultSettings() {
  return {
    updateUrl: DEFAULT_UPDATE_URL,
    channel: 'stable',
    lastChecked: null,
    checkOnStartup: false,
    vacationHoursPerYear: 40,
    ptoHoursPerYear: 40
  };
}

function seedData() {
  return {
    version: 1,
    company: {
      name: "Moore's Body Shop",
      address: { ...DEFAULT_ADDRESS }
    },
    employees: [
      {
        id: 'emp-seed-alex-harper',
        firstName: 'Alex',
        middleInitial: 'J',
        lastName: 'Harper',
        email: '',
        phone: '',
        ssn: '',
        hireDate: '2026-09-01',
        address: { ...DEFAULT_ADDRESS },
        workLocationState: 'VA',
        jobTitle: 'Technician',
        department: 'Shop',
        employmentType: 'Full-time',
        manager: '',
        status: 'Active',
        filingStatus: 'single',
        payType: 'hourly',
        rate: 22.5,
        payFrequency: 'weekly',
        vaWithhold: true,
        w4Step3Dependents: 0,
        extraFederal: 0,
        extraState: 0,
        multipleJobs: false,
        preTaxDeduction: 0,
        paymentMethod: 'check',
        accountLast4: '',
        vaE1: 0,
        vaE2: 0,
        payweeks: []
      },
      {
        id: 'emp-seed-wesley-carroll',
        firstName: 'Wesley',
        middleInitial: 'K',
        lastName: 'Carroll',
        email: '',
        phone: '',
        ssn: '',
        hireDate: '2026-01-01',
        address: { ...DEFAULT_ADDRESS },
        workLocationState: 'VA',
        jobTitle: 'Technician',
        department: 'Shop',
        employmentType: 'Full-time',
        manager: '',
        status: 'Active',
        filingStatus: 'single',
        payType: 'hourly',
        rate: 16,
        payFrequency: 'weekly',
        vaWithhold: true,
        w4Step3Dependents: 0,
        extraFederal: 0,
        extraState: 0,
        multipleJobs: false,
        preTaxDeduction: 0,
        paymentMethod: 'check',
        accountLast4: '',
        vaE1: 0,
        vaE2: 0,
        payweeks: [
          {
            periodStart: '2026-07-01',
            periodEnd: '2026-07-07',
            payday: '2026-07-08',
            weekEnding: '2026-07-07',
            hours: 38.11,
            regularHours: 30.11,
            holidayHours: 8,
            vacationHours: 0,
            otHours: 0,
            gross: 609.76,
            federal: 31.25,
            ss: 37.81,
            medicare: 8.84,
            state: 20.43,
            net: 511.43,
            punches: [
              { id: 'punch-seed-wk-0701', date: '2026-07-01', payType: 'regular', hours: 30.11, clockIn: '', clockOut: '' },
              { id: 'punch-seed-wk-hol', date: '2026-07-03', payType: 'holiday', hours: 8, clockIn: '', clockOut: '' }
            ]
          },
          {
            periodStart: '2026-08-05',
            periodEnd: '2026-08-11',
            payday: '2026-08-12',
            weekEnding: '2026-08-11',
            hours: 29.29,
            regularHours: 29.29,
            holidayHours: 0,
            vacationHours: 0,
            otHours: 0,
            gross: 468.64,
            federal: 15.9,
            ss: 29.06,
            medicare: 6.79,
            state: 12.52,
            net: 404.37,
            punches: [{ id: 'punch-seed-wk-0805', date: '2026-08-05', payType: 'regular', hours: 29.29, clockIn: '', clockOut: '' }]
          },
          {
            periodStart: '2026-08-12',
            periodEnd: '2026-08-18',
            payday: '2026-08-19',
            weekEnding: '2026-08-18',
            hours: 19.34,
            regularHours: 19.34,
            holidayHours: 0,
            vacationHours: 0,
            otHours: 0,
            gross: 309.44,
            federal: 0,
            ss: 19.18,
            medicare: 4.49,
            state: 4.56,
            net: 281.21,
            punches: [{ id: 'punch-seed-wk-0812', date: '2026-08-12', payType: 'regular', hours: 19.34, clockIn: '', clockOut: '' }]
          },
          {
            periodStart: '2026-08-19',
            periodEnd: '2026-08-25',
            payday: '2026-08-26',
            weekEnding: '2026-08-25',
            hours: 22,
            regularHours: 22,
            holidayHours: 0,
            vacationHours: 0,
            otHours: 0,
            gross: 352,
            federal: 4.24,
            ss: 21.83,
            medicare: 5.1,
            state: 6.69,
            net: 314.14,
            punches: [{ id: 'punch-seed-wk-0819', date: '2026-08-19', payType: 'regular', hours: 22, clockIn: '', clockOut: '' }]
          },
          {
            periodStart: '2026-08-26',
            periodEnd: '2026-09-01',
            payday: '2026-09-02',
            weekEnding: '2026-09-01',
            hours: 17,
            regularHours: 17,
            holidayHours: 0,
            vacationHours: 0,
            otHours: 0,
            gross: 272,
            federal: 0,
            ss: 16.86,
            medicare: 3.95,
            state: 2.69,
            net: 248.5,
            punches: [{ id: 'punch-seed-wk-0826', date: '2026-08-26', payType: 'regular', hours: 17, clockIn: '', clockOut: '' }]
          }
        ]
      }
    ]
  };
}

async function ensureDirs() {
  await fsp.mkdir(dataRoot(), { recursive: true });
  await fsp.mkdir(backupsDir(), { recursive: true });
}

function wrapPayload(jsonUtf8Buffer) {
  if (encryptionAvailable()) {
    const encrypted = safeStorage.encryptString(jsonUtf8Buffer.toString('utf8'));
    return Buffer.concat([MAGIC, Buffer.from([FLAG_ENCRYPTED]), encrypted]);
  }
  return Buffer.concat([MAGIC, Buffer.from([FLAG_PLAIN]), jsonUtf8Buffer]);
}

function unwrapPayload(buf) {
  if (!Buffer.isBuffer(buf)) {
    buf = Buffer.from(buf);
  }
  if (buf.length >= MAGIC.length + 1 && buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    const flag = buf[MAGIC.length];
    const body = buf.subarray(MAGIC.length + 1);
    if (flag === FLAG_ENCRYPTED) {
      if (!encryptionAvailable()) {
        const err = new Error(
          'This file was encrypted on another Windows user profile and cannot be opened here.'
        );
        err.code = 'ENC_UNAVAILABLE';
        throw err;
      }
      try {
        return safeStorage.decryptString(body);
      } catch {
        const err = new Error(
          'Could not decrypt this backup. Encrypted backups can only be opened by the same Windows user who created them. Use a decrypted JSON backup to move data to another PC.'
        );
        err.code = 'DEC_FAIL';
        throw err;
      }
    }
    return body.toString('utf8');
  }

  const asText = buf.toString('utf8');
  const trimmed = asText.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return asText;
  }

  if (encryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf);
    } catch {
      /* not a raw safeStorage blob */
    }
  }

  const err = new Error('Unrecognized payroll data file.');
  err.code = 'BAD_FORMAT';
  throw err;
}

async function atomicWrite(filePath, buffer) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const dir = path.dirname(filePath);
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.write(buffer, 0, buffer.length, 0);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await replaceFile(tmp, filePath);
}

async function replaceFile(tmp, dest) {
  try {
    await fsp.rename(tmp, dest);
    return;
  } catch {
    /* Windows cannot rename over an existing file */
  }

  const bak = `${dest}.${process.pid}.swap`;
  try {
    await fsp.unlink(bak);
  } catch {
    /* no previous swap */
  }

  try {
    await fsp.rename(dest, bak);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      await fsp.copyFile(tmp, dest);
      await fsp.unlink(tmp).catch(() => {});
      return;
    }
  }

  try {
    await fsp.rename(tmp, dest);
  } catch {
    await fsp.copyFile(tmp, dest);
    await fsp.unlink(tmp).catch(() => {});
  }

  await fsp.unlink(bak).catch(() => {});
}

function backupStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

async function writeBackup(payload) {
  await fsp.mkdir(backupsDir(), { recursive: true });
  const name = `employees-${backupStamp()}.json.enc`;
  const dest = path.join(backupsDir(), name);
  const fh = await fsp.open(dest, 'w');
  try {
    await fh.write(payload, 0, payload.length, 0);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

async function pruneBackups() {
  let entries;
  try {
    entries = await fsp.readdir(backupsDir(), { withFileTypes: true });
  } catch {
    return;
  }
  const files = entries
    .filter((e) => e.isFile() && /^employees-\d{8}-\d{6}\.json\.enc$/i.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();

  const extra = files.slice(MAX_BACKUPS);
  await Promise.all(
    extra.map((name) => fsp.unlink(path.join(backupsDir(), name)).catch(() => {}))
  );
}

function parseEmployeesJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Payroll file is not a valid database object.');
  }
  if (!Array.isArray(parsed.employees)) {
    parsed.employees = [];
  }
  if (!parsed.company || typeof parsed.company !== 'object') {
    parsed.company = { name: "Moore's Body Shop", address: { ...DEFAULT_ADDRESS } };
  }
  if (!parsed.version) parsed.version = 1;
  return parsed;
}

async function readEmployeesFile(filePath) {
  const buf = await fsp.readFile(filePath);
  const text = unwrapPayload(buf);
  return parseEmployeesJson(text);
}

async function tryRecoverFromBackups() {
  let entries;
  try {
    entries = await fsp.readdir(backupsDir());
  } catch {
    return null;
  }
  const files = entries
    .filter((name) => /^employees-\d{8}-\d{6}\.json\.enc$/i.test(name))
    .sort()
    .reverse();
  for (const name of files) {
    try {
      return await readEmployeesFile(path.join(backupsDir(), name));
    } catch {
      /* try older */
    }
  }
  return null;
}

async function loadEmployees() {
  await ensureDirs();
  const live = employeesPath();
  try {
    await fsp.access(live, fs.constants.F_OK);
  } catch {
    const seeded = seedData();
    await saveEmployees(seeded);
    return seeded;
  }

  try {
    return await readEmployeesFile(live);
  } catch {
    const recovered = await tryRecoverFromBackups();
    if (recovered) {
      return recovered;
    }
    throw new Error('Could not read the payroll database. Restore a backup from Settings.');
  }
}

async function saveEmployees(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid payroll payload.');
  }
  if (!Array.isArray(data.employees)) {
    throw new Error('Invalid payroll payload.');
  }
  await ensureDirs();
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const payload = wrapPayload(json);
  await atomicWrite(employeesPath(), payload);
  await writeBackup(payload);
  await pruneBackups();
  return { ok: true, encryptionAvailable: encryptionAvailable() };
}

async function loadSettings() {
  await ensureDirs();
  const existing = await readSettingsFile();
  try {
    await fsp.access(settingsPath(), fs.constants.F_OK);
    let rawUrl = '';
    try {
      const parsed = JSON.parse(await fsp.readFile(settingsPath(), 'utf8'));
      rawUrl = parsed && parsed.updateUrl;
    } catch {
      rawUrl = '';
    }
    if (isPlaceholderFeed(rawUrl) && existing.updateUrl === DEFAULT_UPDATE_URL) {
      return saveSettings({ updateUrl: DEFAULT_UPDATE_URL });
    }
    return existing;
  } catch {
    await saveSettings(existing);
    return existing;
  }
}

function isPlaceholderFeed(url) {
  const u = String(url || '').trim();
  return !u || u.includes('updates.mooresbodyshop.local');
}

function sanitizeSettings(patch) {
  const next = { ...defaultSettings(), ...(patch && typeof patch === 'object' ? patch : {}) };
  next.channel = 'stable';
  next.checkOnStartup = Boolean(next.checkOnStartup);
  if (typeof next.updateUrl !== 'string' || isPlaceholderFeed(next.updateUrl)) {
    next.updateUrl = DEFAULT_UPDATE_URL;
  }
  next.updateUrl = next.updateUrl.trim();
  if (next.updateUrl && !next.updateUrl.endsWith('/')) next.updateUrl += '/';
  if ('lastChecked' in (patch || {})) next.lastChecked = patch.lastChecked;
  const vac = Number(next.vacationHoursPerYear);
  const pto = Number(next.ptoHoursPerYear);
  const allowed = {
    updateUrl: next.updateUrl,
    channel: next.channel,
    lastChecked: next.lastChecked ?? null,
    checkOnStartup: next.checkOnStartup,
    vacationHoursPerYear: Number.isFinite(vac) && vac >= 0 ? Math.round(vac * 100) / 100 : 40,
    ptoHoursPerYear: Number.isFinite(pto) && pto >= 0 ? Math.round(pto * 100) / 100 : 40
  };
  return allowed;
}

async function readSettingsFile() {
  try {
    const text = await fsp.readFile(settingsPath(), 'utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultSettings();
    return sanitizeSettings({ ...defaultSettings(), ...parsed });
  } catch {
    return defaultSettings();
  }
}

async function saveSettings(patch) {
  await ensureDirs();
  const current = await readSettingsFile();
  const next = sanitizeSettings({ ...current, ...patch });
  const json = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await atomicWrite(settingsPath(), json);
  return next;
}

function getMeta() {
  return {
    version: app.getVersion(),
    appId: 'com.mooresbodyshop.payroll',
    dataPath: dataRoot(),
    employeesFile: employeesPath(),
    encryptionAvailable: encryptionAvailable(),
    companyName: "Moore's Body Shop"
  };
}

async function exportEncryptedTo(destPath) {
  await ensureDirs();
  const live = employeesPath();
  await fsp.access(live, fs.constants.F_OK);
  await fsp.copyFile(live, destPath);
}

async function exportDecryptedTo(destPath) {
  const data = await loadEmployees();
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const buf = Buffer.from(json, 'utf8');
  await atomicWrite(destPath, buf);
}

async function importFrom(filePath, mode) {
  const buf = await fsp.readFile(filePath);
  const incoming = parseEmployeesJson(unwrapPayload(buf));
  if (mode === 'replace') {
    await saveEmployees(incoming);
    return incoming;
  }

  const current = await loadEmployees();
  const byId = new Map(current.employees.map((e) => [e.id, e]));
  for (const emp of incoming.employees) {
    if (!emp || !emp.id) continue;
    byId.set(emp.id, emp);
  }
  const merged = {
    ...current,
    ...incoming,
    company: incoming.company || current.company,
    employees: Array.from(byId.values())
  };
  await saveEmployees(merged);
  return merged;
}

module.exports = {
  DEFAULT_UPDATE_URL,
  DEFAULT_ADDRESS,
  dataRoot,
  employeesPath,
  settingsPath,
  backupsDir,
  encryptionAvailable,
  defaultSettings,
  seedData,
  ensureDirs,
  loadEmployees,
  saveEmployees,
  loadSettings,
  saveSettings,
  getMeta,
  exportEncryptedTo,
  exportDecryptedTo,
  importFrom,
  wrapPayload,
  unwrapPayload
};
