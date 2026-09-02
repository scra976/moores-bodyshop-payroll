'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../src/renderer/tax.js'), 'utf8');
const ctx = { window: {}, console };
vm.runInNewContext(src, ctx);
const tax = ctx.window.MooresTax;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const alex = {
  payType: 'hourly',
  rate: 22.5,
  payFrequency: 'weekly',
  filingStatus: 'single',
  vaWithhold: true,
  multipleJobs: false,
  w4Step3Dependents: 0,
  extraFederal: 0,
  extraState: 0,
  preTaxDeduction: 0
};

const p40 = tax.computePay(alex, 40);
assert(p40.gross === 900, 'gross 40h');
assert(p40.ss === 55.8, 'ss 6.2% of 900');
assert(p40.medicare === 13.05, 'medicare 1.45% of 900');

// Worksheet 1A: 900*52=46800; minus $8,600 (not MFJ, Step 2 unchecked) = 38200
// STANDARD Single: 19900–57900 → 1240 + 12%*(38200-19900) = 1240+2196=3436; /52 = 66.0769 → 66.08
assert(p40.federal === 66.08, `federal expected 66.08 got ${p40.federal}`);

const p45 = tax.computePay(alex, 45);
assert(p45.regularHours === 40, 'OT split regular');
assert(p45.otHours === 5, 'OT split ot');
assert(p45.gross === 1068.75, `OT gross ${p45.gross}`);

const multi = tax.computePay({ ...alex, multipleJobs: true }, 40);
assert(multi.federal > p40.federal, 'Step 2 checkbox withholds more');

const period = tax.payPeriodFromDate('2026-09-08');
assert(period.periodStart === '2026-09-02', `start ${period.periodStart}`);
assert(period.periodEnd === '2026-09-08', `end ${period.periodEnd}`);
assert(period.payday === '2026-09-09', `payday ${period.payday}`);

const wed = tax.currentPayPeriod(new Date(2026, 8, 2));
assert(wed.periodEnd === '2026-09-01', `payday Wednesday uses prior Tue, got ${wed.periodEnd}`);
assert(wed.payday === '2026-09-02', `payday ${wed.payday}`);

assert(tax.punchHours('22:00', '06:00') === 8, 'overnight');

console.log('TAX_OK', { federal: p40.federal, ss: p40.ss, medicare: p40.medicare, net: p40.net, step2: multi.federal });
