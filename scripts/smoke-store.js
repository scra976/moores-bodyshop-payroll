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
  const alex = data.employees.find((e) => e.lastName === 'Harper' && e.firstName === 'Alex');
  if (!alex) throw new Error('seed employee missing');
  if (alex.rate !== 22.5) throw new Error('seed rate mismatch');
  if (alex.ssn) throw new Error('seed must not include an SSN');

  const meta = store.getMeta();
  const expectedTail = path.join('MooresBodyShop', 'payroll');
  if (!meta.dataPath.replace(/\//g, path.sep).endsWith(expectedTail)) {
    throw new Error(`unexpected data path: ${meta.dataPath}`);
  }
  if (meta.dataPath.toLowerCase().includes('program files')) {
    throw new Error('data path must not be Program Files');
  }

  alex.payweeks.push({
    weekEnding: '2026-09-05',
    hours: 40,
    gross: 900,
    federal: 1,
    ss: 1,
    medicare: 1,
    state: 1,
    net: 896
  });
  await store.saveEmployees(data);
  const again = await store.loadEmployees();
  const alex2 = again.employees.find((e) => e.id === alex.id);
  if (!alex2 || alex2.payweeks.length !== 1) throw new Error('payweek did not persist');

  const live = store.employeesPath();
  if (!fs.existsSync(live)) throw new Error('encrypted file missing');
  const backups = fs.readdirSync(store.backupsDir()).filter((f) => f.endsWith('.json.enc'));
  if (!backups.length) throw new Error('backup missing');

  const settings = await store.loadSettings();
  if (settings.checkOnStartup !== false) throw new Error('check on startup must default off');
  if (JSON.stringify(settings).toLowerCase().includes('ssn')) throw new Error('settings leaked ssn key');

  process.stdout.write(`SMOKE_OK ${meta.dataPath}\n`);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  app.exit(0);
}).catch((err) => {
  process.stderr.write(String(err && err.message ? err.message : err) + '\n');
  app.exit(1);
});
