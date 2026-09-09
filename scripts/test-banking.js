'use strict';

const books = require('../src/renderer/books');
const banking = require('../src/renderer/banking');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function close(a, b, msg) {
  const ok = Math.abs(Number(a) - Number(b)) < 0.005;
  if (!ok) throw new Error(`${msg}: expected ${b}, got ${a}`);
}

let bks = books.emptyBooks();
banking.ensureBanks(bks);
assert(bks.banks.length === 1, 'default shop checking');
assert(bks.banks[0].glAccount === '1000', 'default linked to 1000');
assert(bks.banks[0].last4 === '', 'no last 4 by default');

const fullNum = banking.upsertBank(bks, {
  name: 'Bad',
  type: 'checking',
  last4: '123456789',
  glAccount: '1000'
});
assert(!fullNum.ok, 'reject full account number');
assert(/last 4/i.test(fullNum.error), 'last 4 error text');

const extra = books.addAccount(bks, { code: '1010', name: 'Savings cash', type: 'asset' });
assert(extra.ok, extra.error);
bks = extra.books;

const sav = banking.upsertBank(bks, {
  name: 'Shop savings',
  type: 'savings',
  bankName: 'Truist',
  last4: '4321',
  openingBalance: 200,
  openingDate: '2026-01-01',
  glAccount: '1010'
});
assert(sav.ok, sav.error);
bks = sav.books;
assert(sav.bank.last4 === '4321', 'store last 4 only');
assert(!JSON.stringify(sav.bank).includes('123456789'), 'never store full account number');

const clash = banking.upsertBank(bks, {
  id: 'bank-other',
  name: 'Other',
  type: 'checking',
  last4: '9999',
  glAccount: '1010'
});
assert(!clash.ok, 'one bank per GL');

const savingsId = sav.bank.id;

const drafted = books.saveBillDraft(bks, {
  date: '2026-09-08',
  vendorName: 'Office Co',
  paidNow: false,
  lines: [{ kind: 'expense', account: '6400', desc: 'Paper', amount: 40 }]
});
assert(drafted.ok, drafted.error);
const posted = books.postBill(drafted.books, drafted.bill.id);
assert(posted.ok, posted.error);
const paid = books.payBill(posted.books, {
  billId: posted.bill.id,
  amount: 40,
  date: '2026-09-08',
  bankId: savingsId,
  checkNumber: '1008'
});
assert(paid.ok, paid.error);
const cashLine = paid.entry.lines.find((l) => l.account === '1010');
assert(cashLine, 'pay bill uses linked GL');
close(cashLine.credit, 40, 'cr savings');
assert(cashLine.bankId === savingsId, 'bank id on cash line');
assert(cashLine.checkNumber === '1008', 'check no on cash line');
assert(cashLine.lineId, 'line id assigned');
bks = paid.books;

const arDraft = books.saveReceiptDraft(bks, {
  ...books.newReceipt(bks),
  date: '2026-09-08',
  customerName: 'Valued Customer',
  paymentMethod: 'on_account',
  lines: [{ type: 'mech', qty: 1, desc: 'Labor', rate: 90, cost: 0 }]
});
const arFin = books.finalizeReceipt(arDraft.books, arDraft.receipt.id);
assert(arFin.ok, arFin.error);
const received = books.receiveArPayment(arFin.books, {
  receiptId: arFin.receipt.id,
  amount: 90,
  date: '2026-09-09',
  bankId: savingsId,
  checkNumber: '55'
});
assert(received.ok, received.error);
const arCash = received.entry.lines.find((l) => l.account === '1010');
assert(arCash && arCash.debit === 90, 'AR payment to savings GL');
bks = received.books;

const pr = books.postPayrollRun(bks, {
  employeeId: 'e1',
  employeeName: 'Test Tech',
  periodEnd: '2026-09-08',
  payday: '2026-09-09',
  gross: 400,
  net: 300,
  federal: 40,
  ss: 24.8,
  medicare: 5.8,
  additionalMedicare: 0,
  state: 20,
  childSupport: 9.4,
  garnishments: 0,
  pretax: 0,
  bankId: savingsId,
  checkNumber: '2001'
});
assert(pr.ok, pr.error);
const netLine = pr.entry.lines.find((l) => l.memo === 'Net pay');
assert(netLine.account === '1010', 'payroll net uses bank GL');
assert(netLine.checkNumber === '2001', 'payroll check no');
bks = pr.books;

const opened = banking.openRecon(bks, savingsId, '2026-09-30');
assert(opened.ok, opened.error);
close(opened.recon.beginningBalance, 200, 'beginning from opening balance');
bks = opened.books;
let recon = opened.recon;
const tot0 = banking.reconTotals(bks, banking.bankById(bks, savingsId), recon);
assert(tot0.items.length >= 3, 'uncleared cash lines listed');
assert(tot0.items.every((ln) => ln.date <= '2026-09-30'), 'through statement date');

for (const ln of tot0.items) {
  const tog = banking.toggleCleared(bks, recon.id, ln.key);
  assert(tog.ok, tog.error);
  bks = tog.books;
  recon = tog.recon;
}

const clearedTot = banking.reconTotals(bks, banking.bankById(bks, savingsId), recon);
const stmtBal = clearedTot.clearedBalance;
bks = banking.updateRecon(bks, recon.id, { statementBalance: stmtBal }).books;
recon = bks.reconciliations.find((r) => r.id === recon.id);

const atZero = banking.reconTotals(bks, banking.bankById(bks, savingsId), recon);
close(atZero.difference, 0, 'difference zero after matching statement');

const noviceOk = banking.finishRecon(bks, recon.id, { expert: false, allowDifference: false });
assert(noviceOk.ok, noviceOk.error);
bks = noviceOk.books;
recon = noviceOk.recon;
assert(recon.status === 'closed', 'closed at $0');

const extraPay = books.saveBillDraft(bks, {
  date: '2026-10-05',
  vendorName: 'Later Co',
  paidNow: true,
  bankId: savingsId,
  lines: [{ kind: 'expense', account: '6400', desc: 'Later', amount: 15 }]
});
const extraPosted = books.postBill(extraPay.books, extraPay.bill.id);
assert(extraPosted.ok, extraPosted.error);
bks = extraPosted.books;

const leftover = banking.unclearedLines(bks, banking.bankById(bks, savingsId), '2026-10-31', null);
assert(
  leftover.every((ln) => ln.clearedReconId !== recon.id),
  'prior cleared items not in next list'
);
assert(
  leftover.some((ln) => Math.abs(ln.amount + 15) < 0.005 || Math.abs(ln.amount - -15) < 0.005),
  'uncleared later item rolls forward'
);

const next = banking.openRecon(bks, savingsId, '2026-10-31');
assert(next.ok, next.error);
close(next.recon.beginningBalance, recon.statementBalance, 'next beginning is last statement');
assert(next.recon.id !== recon.id, 'new recon');
bks = next.books;

const nextTot = banking.reconTotals(bks, banking.bankById(bks, savingsId), next.recon);
bks = banking.updateRecon(bks, next.recon.id, { statementBalance: nextTot.beginning + 12.34 }).books;
const blocked = banking.finishRecon(bks, next.recon.id, { expert: false, allowDifference: false });
assert(!blocked.ok, 'novice cannot finish with a difference');
const expertFin = banking.finishRecon(bks, next.recon.id, { expert: true, allowDifference: true });
assert(expertFin.ok, expertFin.error);
bks = expertFin.books;
assert(expertFin.recon.adjustmentJournalId, 'expert posts an adjustment');
const adj = bks.journal.find((j) => j.id === expertFin.recon.adjustmentJournalId);
assert(adj && adj.lines.some((l) => l.account === '6810'), 'adjustment vs bank fees 6810');
assert(adj.lines.some((l) => l.account === '1010' && l.clearedReconId === expertFin.recon.id), 'adj cash line cleared');

const html = banking.reconReportHtml(bks, recon, { name: "Moore's Body Shop" }, { withItems: true, expert: true });
assert(/Moore's Body Shop/.test(html), 'shop name on report');
assert(/••••4321/.test(html), 'last 4 on report');
assert(/Statement date/.test(html), 'statement date on report');
assert(/Beginning balance/.test(html), 'beginning on report');
assert(/Difference/.test(html), 'difference on report');
assert(/Cleared items/.test(html), 'full list when toggled on');

const htmlSum = banking.reconReportHtml(bks, recon, { name: "Moore's Body Shop" }, { withItems: false, expert: false });
assert(!/Cleared items/.test(htmlSum), 'summary omits full cleared list');
assert(/Uncleared/.test(htmlSum) || /No uncleared/.test(htmlSum), 'summary leftover uncleared');

const json = JSON.stringify(bks);
assert(!/123456789/.test(json), 'books json never has full account number');
assert(!bks.banks.some((x) => String(x.last4).length > 4), 'last4 never longer than 4');

const reopened = banking.reopenRecon(bks, expertFin.recon.id);
assert(reopened.ok, reopened.error);
assert(reopened.recon.status === 'open', 'expert reopen');

console.log('BANKING_OK');
