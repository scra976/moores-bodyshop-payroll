'use strict';

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = path.join(os.tmpdir(), `MooresPayrollSmoke-${process.pid}`);
app.setPath('appData', path.join(tmpRoot, 'AppData'));

app.whenReady().then(async () => {
  const store = require('../src/main/store');
  const data = await store.loadEmployees();
  if (!Array.isArray(data.employees)) throw new Error('employees array missing');
  const before = JSON.stringify(data.employees);
  const books = await store.loadBooks();
  if (!books.accounts.some((a) => a.code === '1000')) throw new Error('chart of accounts missing');
  if (!books.receipts.some((r) => r.status === 'draft')) throw new Error('seed draft receipt missing');
  const againPay = await store.loadEmployees();
  if (JSON.stringify(againPay.employees) !== before) throw new Error('loading books must not change employees');

  const meta = store.getMeta();
  const expectedTail = path.join('MooresBodyShop', 'payroll');
  if (!meta.dataPath.replace(/\//g, path.sep).endsWith(expectedTail)) {
    throw new Error(`unexpected data path: ${meta.dataPath}`);
  }
  if (meta.dataPath.toLowerCase().includes('program files')) {
    throw new Error('data path must not be Program Files');
  }
  const shopTail = path.join('MooresBodyShop');
  if (!meta.shopRoot.replace(/\//g, path.sep).endsWith(shopTail)) {
    throw new Error(`unexpected shop root: ${meta.shopRoot}`);
  }

  await store.saveEmployees(data);
  const again = await store.loadEmployees();
  if (JSON.stringify(again.employees) !== before) throw new Error('employee save round-trip changed data');

  await store.saveBooks(books);
  const banksFile = store.banksPath();
  if (!fs.existsSync(banksFile)) throw new Error('banks.json missing under books');
  const banksJson = JSON.parse(fs.readFileSync(banksFile, 'utf8'));
  if (!Array.isArray(banksJson.banks) || !banksJson.banks.length) throw new Error('banks.json has no accounts');
  if (JSON.stringify(banksJson).includes('ssn')) throw new Error('banks.json leaked payroll');
  const afterPay = await store.loadEmployees();
  if (JSON.stringify(afterPay.employees) !== before) throw new Error('saving books must not change employees');

  const live = store.employeesPath();
  if (!fs.existsSync(live)) throw new Error('encrypted file missing');
  const backups = fs.readdirSync(store.backupsDir()).filter((f) => f.endsWith('.json.enc'));
  if (!backups.length) throw new Error('backup missing');

  const settings = await store.loadSettings();
  if (settings.checkOnStartup !== false) throw new Error('check on startup must default off');
  if (settings.devMode !== false) throw new Error('devMode must default off');
  if (JSON.stringify(settings).toLowerCase().includes('ssn')) throw new Error('settings leaked ssn key');

  process.stdout.write(`SMOKE_OK ${meta.dataPath}\n`);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  app.exit(0);
}).catch((err) => {
  process.stderr.write(String(err && err.message ? err.message : err) + '\n');
  app.exit(1);
});
