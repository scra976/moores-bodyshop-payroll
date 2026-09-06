'use strict';

/**
 * Shop books: chart of accounts, double-entry GL, FIFO inventory, AR receipts, AP bills.
 * Drafts never post. Payroll employee files are not stored here.
 */
(function (root) {
  const DEFAULT_ADDRESS = {
    street: '821 Kabrich Street',
    city: 'Blacksburg',
    state: 'VA',
    zip: '24060'
  };

  const SEED_ACCOUNTS = [
    { code: '1000', name: 'Cash', type: 'asset' },
    { code: '1100', name: 'Accounts Receivable', type: 'asset' },
    { code: '1200', name: 'Parts Inventory', type: 'asset' },
    { code: '1500', name: 'Equipment', type: 'asset' },
    { code: '1600', name: 'Accumulated Depreciation', type: 'contra-asset' },
    { code: '2000', name: 'Accounts Payable', type: 'liability' },
    { code: '2100', name: 'Sales Tax Payable', type: 'liability' },
    { code: '2200', name: 'Accrued Payroll', type: 'liability' },
    { code: '2210', name: 'FIT Withholding', type: 'liability' },
    { code: '2220', name: 'Social Security Payable', type: 'liability' },
    { code: '2230', name: 'Medicare Payable', type: 'liability' },
    { code: '2240', name: 'VA Withholding', type: 'liability' },
    { code: '2300', name: 'Employer Payroll Taxes', type: 'liability' },
    { code: '3000', name: 'Owner Equity', type: 'equity' },
    { code: '3100', name: 'Owner Draws', type: 'equity' },
    { code: '3200', name: 'Retained Earnings', type: 'equity' },
    { code: '4000', name: 'Mechanical Labor', type: 'revenue' },
    { code: '4010', name: 'Body Labor', type: 'revenue' },
    { code: '4100', name: 'Parts', type: 'revenue' },
    { code: '5000', name: 'Parts COGS', type: 'cogs' },
    { code: '5100', name: 'Direct Labor COGS', type: 'cogs' },
    { code: '6000', name: 'Shop Payroll Expense', type: 'opex' },
    { code: '6100', name: 'Payroll Tax Expense', type: 'opex' },
    { code: '6200', name: 'Rent', type: 'opex' },
    { code: '6210', name: 'Utilities — electric', type: 'opex' },
    { code: '6220', name: 'Utilities — water / sewer', type: 'opex' },
    { code: '6230', name: 'Utilities — gas / heat', type: 'opex' },
    { code: '6240', name: 'Phone / internet', type: 'opex' },
    { code: '6300', name: 'Insurance — shop / liability', type: 'opex' },
    { code: '6310', name: 'Insurance — workers comp', type: 'opex' },
    { code: '6400', name: 'Office supplies', type: 'opex' },
    { code: '6410', name: 'Shop supplies (not inventory parts)', type: 'opex' },
    { code: '6420', name: 'Cleaning / janitorial', type: 'opex' },
    { code: '6500', name: 'General building maintenance', type: 'opex' },
    { code: '6510', name: 'Equipment repair & maintenance', type: 'opex' },
    { code: '6520', name: 'Tools (expense)', type: 'opex' },
    { code: '6600', name: 'Vehicle / wrecker expense', type: 'opex' },
    { code: '6610', name: 'Fuel', type: 'opex' },
    { code: '6700', name: 'Advertising / marketing', type: 'opex' },
    { code: '6800', name: 'Professional fees', type: 'opex' },
    { code: '6810', name: 'Bank fees', type: 'opex' },
    { code: '6900', name: 'Other Expense', type: 'opex' }
  ];

  const TYPE_ORDER = {
    asset: 1,
    'contra-asset': 2,
    liability: 3,
    equity: 4,
    revenue: 5,
    cogs: 6,
    opex: 7
  };

  function round2(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  function round4(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round((x + Number.EPSILON) * 10000) / 10000;
  }

  function moneyEq(a, b) {
    return Math.abs(round2(a) - round2(b)) < 0.005;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayIso(d) {
    const x = d instanceof Date ? d : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  }

  function isoInRange(iso, from, to) {
    const d = String(iso || '');
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function isLabor(type) {
    return type === 'mech' || type === 'body' || type === 'labor';
  }

  function normalBalance(account) {
    if (!account) return 'debit';
    const t = account.type;
    if (t === 'asset' || t === 'cogs' || t === 'opex') return 'debit';
    return 'credit';
  }

  function accountByCode(books, code) {
    return (books.accounts || []).find((a) => a.code === String(code)) || null;
  }

  function sortAccounts(list) {
    return [...(list || [])].sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
  }

  function nextJournalNo(books) {
    const n = Number(books.counters && books.counters.journal) || 0;
    const next = n + 1;
    books.counters = books.counters || {};
    books.counters.journal = next;
    return `J-${String(next).padStart(4, '0')}`;
  }

  function nextReceiptNo(books, dateIso) {
    const d = String(dateIso || todayIso()).replace(/-/g, '');
    const y = d.slice(0, 4);
    const md = d.slice(4, 8);
    const n = Number(books.counters && books.counters.receipt) || 0;
    const next = n + 1;
    books.counters = books.counters || {};
    books.counters.receipt = next;
    return `MB-${y}-${md}-${String(next).padStart(3, '0')}`;
  }

  function nextBillNo(books) {
    const n = Number(books.counters && books.counters.bill) || 0;
    const next = n + 1;
    books.counters = books.counters || {};
    books.counters.bill = next;
    return `BILL-${String(next).padStart(4, '0')}`;
  }

  function nextJobNo(books, dateIso) {
    const d = String(dateIso || todayIso()).replace(/-/g, '');
    const n = Number(books.counters && books.counters.job) || 0;
    const next = n + 1;
    books.counters = books.counters || {};
    books.counters.job = next;
    return `${d.slice(2, 8)}-${String(next).padStart(2, '0')}`;
  }

  function makeAccount(src) {
    const type = src.type || 'opex';
    return {
      code: String(src.code || '').trim(),
      name: String(src.name || '').trim(),
      type,
      system: Boolean(src.system),
      inactive: Boolean(src.inactive)
    };
  }

  function defaultCompany() {
    return {
      name: "Moore's Body Shop",
      dba: "Moore's Body & Mechanical Shop",
      tagline: 'Auto Body • Mechanical Repair • Inspection',
      phone: '(540) 552-5373',
      address: { ...DEFAULT_ADDRESS }
    };
  }

  function defaultSettings() {
    return {
      mechRate: 90,
      bodyRate: 55,
      taxRate: 5.3,
      laborCogsEnabled: false
    };
  }

  function emptyBooks() {
    return {
      version: 2,
      company: defaultCompany(),
      settings: defaultSettings(),
      accounts: SEED_ACCOUNTS.map((a) => makeAccount({ ...a, system: true })),
      journal: [],
      customers: [],
      vendors: [],
      inventory: [],
      receipts: [],
      jobs: [],
      bills: [],
      payments: [],
      billPayments: [],
      payrollPosts: [],
      counters: { journal: 0, receipt: 0, bill: 0, job: 0, customer: 0, vendor: 0 }
    };
  }

  function seedBooks() {
    const books = emptyBooks();
    books.customers.push({
      id: 'cust-valued',
      name: 'Valued Customer',
      phone: '',
      email: '',
      address: '',
      terms: 'Due on receipt',
      notes: ''
    });
    books.counters.customer = 1;
    books.inventory.push({
      id: 'part-ad7994',
      partNumber: 'AD-7994',
      description: 'Brake service — pads, hardware, parts',
      sellPrice: 125.43,
      layers: [{ qty: 1, cost: 80, date: '2026-09-04', source: 'Opening stock' }],
      history: [
        {
          date: '2026-09-04',
          type: 'receive',
          qty: 1,
          cost: 80,
          ref: 'Opening stock',
          receiptNo: ''
        }
      ]
    });
    books.receipts.push({
      id: 'rcpt-seed-demo',
      number: 'MB-2026-0904-018',
      date: '2026-09-04',
      status: 'draft',
      customerId: 'cust-valued',
      customerName: 'Valued Customer',
      paymentNote: 'Paid in Full',
      paymentMethod: 'cash',
      vehicle: '',
      ro: '260904-07',
      jobId: '',
      mechRate: 90,
      bodyRate: 55,
      taxRate: 5.3,
      lines: [
        {
          type: 'part',
          qty: 1,
          desc: 'Brake service — pads, hardware, parts',
          pn: 'AD-7994',
          rate: 125.43,
          cost: 80
        },
        { type: 'mech', qty: 1.42, desc: 'Mechanical labor', pn: '', rate: 90, cost: 0 }
      ],
      journalId: '',
      balance: 0,
      paid: 0
    });
    books.counters.receipt = 18;
    books.jobs.push({
      id: 'job-seed-demo',
      number: '260904-07',
      date: '2026-09-04',
      customerId: 'cust-valued',
      vehicle: '',
      status: 'open',
      notes: '',
      receiptIds: ['rcpt-seed-demo']
    });
    books.counters.job = 7;
    return books;
  }

  function ensureSystemAccounts(accounts) {
    const list = Array.isArray(accounts) ? accounts.slice() : [];
    const have = new Set(list.map((a) => String(a.code)));
    for (const sys of SEED_ACCOUNTS) {
      if (!have.has(sys.code)) list.push(makeAccount({ ...sys, system: true }));
    }
    for (const a of list) {
      if (SEED_ACCOUNTS.some((s) => s.code === a.code)) a.system = true;
    }
    return sortAccounts(list);
  }

  function normalize(raw) {
    const base = emptyBooks();
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const books = {
      ...base,
      ...src,
      company: { ...defaultCompany(), ...(src.company || {}) },
      settings: { ...defaultSettings(), ...(src.settings || {}) }
    };
    books.company.address = { ...DEFAULT_ADDRESS, ...((src.company && src.company.address) || {}) };
    books.settings.mechRate = round2(books.settings.mechRate || 90) || 90;
    books.settings.bodyRate = round2(books.settings.bodyRate || 55) || 55;
    books.settings.taxRate = Number.isFinite(Number(books.settings.taxRate)) ? Number(books.settings.taxRate) : 5.3;
    books.settings.laborCogsEnabled = Boolean(books.settings.laborCogsEnabled);
    books.accounts = ensureSystemAccounts(src.accounts);
    books.journal = Array.isArray(src.journal) ? src.journal : [];
    books.customers = Array.isArray(src.customers) ? src.customers : [];
    books.vendors = Array.isArray(src.vendors) ? src.vendors : [];
    books.inventory = Array.isArray(src.inventory) ? src.inventory : [];
    books.receipts = Array.isArray(src.receipts) ? src.receipts : [];
    books.jobs = Array.isArray(src.jobs) ? src.jobs : [];
    books.bills = Array.isArray(src.bills) ? src.bills : [];
    books.payments = Array.isArray(src.payments) ? src.payments : [];
    books.billPayments = Array.isArray(src.billPayments) ? src.billPayments : [];
    books.payrollPosts = Array.isArray(src.payrollPosts) ? src.payrollPosts : [];
    books.counters = { ...base.counters, ...(src.counters || {}) };
    books.version = 2;
    return books;
  }

  function receiptTotals(receipt) {
    const taxRate = Number(receipt && receipt.taxRate) || 0;
    let parts = 0;
    let mech = 0;
    let body = 0;
    let cost = 0;
    for (const ln of (receipt && receipt.lines) || []) {
      const amt = round2((Number(ln.qty) || 0) * (Number(ln.rate) || 0));
      const lnCost = round2((Number(ln.qty) || 0) * (Number(ln.cost) || 0));
      if (isLabor(ln.type)) {
        if (ln.type === 'body') body = round2(body + amt);
        else mech = round2(mech + amt);
      } else {
        parts = round2(parts + amt);
        cost = round2(cost + lnCost);
      }
    }
    const labor = round2(mech + body);
    const tax = round2(parts * (taxRate / 100));
    const total = round2(parts + labor + tax);
    return { parts, mech, body, labor, tax, total, cost };
  }

  function linesBalance(lines) {
    let debit = 0;
    let credit = 0;
    const clean = [];
    for (const ln of lines || []) {
      const d = round2(ln.debit);
      const c = round2(ln.credit);
      if (!ln.account) return { ok: false, error: 'Every journal line needs an account.' };
      if (d && c) return { ok: false, error: 'A journal line cannot have both a debit and a credit.' };
      if (!d && !c) continue;
      debit = round2(debit + d);
      credit = round2(credit + c);
      clean.push({
        account: String(ln.account),
        debit: d,
        credit: c,
        memo: String(ln.memo || '')
      });
    }
    if (!clean.length) return { ok: false, error: 'Journal has no amounts.' };
    if (!moneyEq(debit, credit)) {
      return { ok: false, error: `Debits ${debit.toFixed(2)} must equal credits ${credit.toFixed(2)}.` };
    }
    return { ok: true, lines: clean, debit, credit };
  }

  function postedJournals(books) {
    return (books.journal || []).filter((j) => j && j.posted && !j.reversedBy);
  }

  function postJournal(books, entry) {
    const checked = linesBalance(entry.lines);
    if (!checked.ok) return { ok: false, error: checked.error };
    for (const ln of checked.lines) {
      if (!accountByCode(books, ln.account)) {
        return { ok: false, error: `Unknown account ${ln.account}.` };
      }
    }
    const row = {
      id: entry.id || uid('jnl'),
      number: entry.number || nextJournalNo(books),
      date: entry.date || todayIso(),
      memo: String(entry.memo || ''),
      source: entry.source || 'manual',
      sourceId: entry.sourceId || '',
      posted: true,
      reversedBy: null,
      reverses: entry.reverses || null,
      lines: checked.lines
    };
    books.journal.push(row);
    return { ok: true, entry: row };
  }

  function reverseJournal(books, journalId, date, memo) {
    const orig = (books.journal || []).find((j) => j.id === journalId);
    if (!orig || !orig.posted) return { ok: false, error: 'Journal entry not found.' };
    if (orig.reversedBy) return { ok: false, error: 'Journal entry is already reversed.' };
    const lines = orig.lines.map((ln) => ({
      account: ln.account,
      debit: ln.credit,
      credit: ln.debit,
      memo: ln.memo
    }));
    const posted = postJournal(books, {
      date: date || todayIso(),
      memo: memo || `Reverse ${orig.number}`,
      source: orig.source,
      sourceId: orig.sourceId,
      reverses: orig.id,
      lines
    });
    if (!posted.ok) return posted;
    orig.reversedBy = posted.entry.id;
    return { ok: true, entry: posted.entry, original: orig };
  }

  function findPart(books, partNumber) {
    const pn = String(partNumber || '').trim().toLowerCase();
    if (!pn) return null;
    return (books.inventory || []).find((p) => String(p.partNumber || '').trim().toLowerCase() === pn) || null;
  }

  function qtyOnHand(item) {
    if (!item) return 0;
    return round4((item.layers || []).reduce((s, l) => s + (Number(l.qty) || 0), 0));
  }

  function fifoValue(item) {
    if (!item) return 0;
    return round2((item.layers || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0));
  }

  function avgCost(item) {
    const q = qtyOnHand(item);
    if (q <= 0) return 0;
    return round2(fifoValue(item) / q);
  }

  function receivePart(books, { partNumber, description, qty, cost, sellPrice, date, source, ref, receiptNo }) {
    const q = round4(qty);
    const unit = round2(cost);
    if (q <= 0) return { ok: false, error: 'Quantity must be greater than zero.' };
    if (unit < 0) return { ok: false, error: 'Cost cannot be negative.' };
    let item = findPart(books, partNumber);
    if (!item) {
      item = {
        id: uid('part'),
        partNumber: String(partNumber || '').trim(),
        description: String(description || partNumber || '').trim(),
        sellPrice: round2(sellPrice),
        layers: [],
        history: []
      };
      if (!item.partNumber) return { ok: false, error: 'Part number is required.' };
      books.inventory.push(item);
    }
    if (description) item.description = String(description);
    if (sellPrice != null && sellPrice !== '') item.sellPrice = round2(sellPrice);
    item.layers.push({ qty: q, cost: unit, date: date || todayIso(), source: source || 'receive' });
    item.history.push({
      date: date || todayIso(),
      type: 'receive',
      qty: q,
      cost: round2(q * unit),
      ref: ref || '',
      receiptNo: receiptNo || ''
    });
    return { ok: true, item, amount: round2(q * unit) };
  }

  function issuePart(books, { partNumber, qty, date, ref, receiptNo }) {
    const item = findPart(books, partNumber);
    if (!item) return { ok: false, error: `Part ${partNumber || ''} is not in inventory.` };
    let need = round4(qty);
    if (need <= 0) return { ok: false, error: 'Quantity must be greater than zero.' };
    if (qtyOnHand(item) + 1e-6 < need) {
      return { ok: false, error: `Insufficient quantity for ${item.partNumber} (have ${qtyOnHand(item)}, need ${need}).` };
    }
    let cost = 0;
    const nextLayers = [];
    for (const layer of item.layers || []) {
      if (need <= 0) {
        nextLayers.push(layer);
        continue;
      }
      const take = Math.min(Number(layer.qty) || 0, need);
      cost = round2(cost + take * (Number(layer.cost) || 0));
      need = round4(need - take);
      const left = round4((Number(layer.qty) || 0) - take);
      if (left > 0.00005) nextLayers.push({ ...layer, qty: left });
    }
    item.layers = nextLayers;
    item.history.push({
      date: date || todayIso(),
      type: 'issue',
      qty: round4(qty),
      cost,
      ref: ref || '',
      receiptNo: receiptNo || ''
    });
    return { ok: true, item, cost };
  }

  function adjustPart(books, { partNumber, qty, cost, date, memo }) {
    const item = findPart(books, partNumber);
    if (!item) return { ok: false, error: `Part ${partNumber || ''} is not in inventory.` };
    const q = round4(qty);
    if (!q) return { ok: false, error: 'Adjustment quantity cannot be zero.' };
    const unit = cost == null || cost === '' ? avgCost(item) : round2(cost);
    let amount = 0;
    if (q > 0) {
      item.layers.push({ qty: q, cost: unit, date: date || todayIso(), source: 'adjust' });
      amount = round2(q * unit);
    } else {
      const issued = issuePart(books, { partNumber, qty: Math.abs(q), date, ref: memo || 'Adjustment', receiptNo: '' });
      if (!issued.ok) return issued;
      amount = issued.cost;
    }
    item.history.push({
      date: date || todayIso(),
      type: 'adjust',
      qty: q,
      cost: amount,
      ref: memo || 'Quantity adjustment',
      receiptNo: ''
    });
    const lines =
      q > 0
        ? [
            { account: '1200', debit: amount, credit: 0 },
            { account: '6900', debit: 0, credit: amount }
          ]
        : [
            { account: '5000', debit: amount, credit: 0 },
            { account: '1200', debit: 0, credit: amount }
          ];
    const posted = postJournal(books, {
      date: date || todayIso(),
      memo: memo || `Inventory adjustment ${item.partNumber}`,
      source: 'inventory',
      sourceId: item.id,
      lines
    });
    if (!posted.ok) return posted;
    return { ok: true, item, entry: posted.entry };
  }

  function cashOrAr(method) {
    const m = String(method || 'cash').toLowerCase();
    if (m === 'on_account' || m === 'ar' || m === 'invoice' || m === 'on account') return '1100';
    return '1000';
  }

  function isOnAccount(method) {
    return cashOrAr(method) === '1100';
  }

  function finalizeReceipt(books, receiptId) {
    books = clone(books);
    const receipt = (books.receipts || []).find((r) => r.id === receiptId);
    if (!receipt) return { ok: false, error: 'Receipt not found.' };
    if (receipt.status === 'finalized') return { ok: false, error: 'Receipt is already finalized.' };
    const totals = receiptTotals(receipt);
    const partLines = (receipt.lines || []).filter((ln) => !isLabor(ln.type) && round4(ln.qty) > 0);
    const issues = [];
    for (const ln of partLines) {
      const issued = issuePart(books, {
        partNumber: ln.pn,
        qty: ln.qty,
        date: receipt.date,
        ref: receipt.number,
        receiptNo: receipt.number
      });
      if (!issued.ok) return issued;
      ln.costPosted = issued.cost;
      issues.push(issued);
    }
    const cogs = round2(issues.reduce((s, x) => s + x.cost, 0));
    const arCash = cashOrAr(receipt.paymentMethod);
    const lines = [{ account: arCash, debit: totals.total, credit: 0, memo: receipt.number }];
    if (totals.parts) lines.push({ account: '4100', debit: 0, credit: totals.parts, memo: 'Parts' });
    if (totals.mech) lines.push({ account: '4000', debit: 0, credit: totals.mech, memo: 'Mechanical labor' });
    if (totals.body) lines.push({ account: '4010', debit: 0, credit: totals.body, memo: 'Body labor' });
    if (totals.tax) lines.push({ account: '2100', debit: 0, credit: totals.tax, memo: 'Sales tax on parts' });
    if (cogs) {
      lines.push({ account: '5000', debit: cogs, credit: 0, memo: 'Parts COGS' });
      lines.push({ account: '1200', debit: 0, credit: cogs, memo: 'Inventory issued' });
    }
    const posted = postJournal(books, {
      date: receipt.date,
      memo: `Receipt ${receipt.number}`,
      source: 'ar-receipt',
      sourceId: receipt.id,
      lines
    });
    if (!posted.ok) return posted;
    receipt.status = 'finalized';
    receipt.journalId = posted.entry.id;
    receipt.cogs = cogs;
    receipt.totals = totals;
    if (isOnAccount(receipt.paymentMethod)) {
      receipt.balance = totals.total;
      receipt.paid = 0;
    } else {
      receipt.balance = 0;
      receipt.paid = totals.total;
    }
    return { ok: true, books, receipt, entry: posted.entry, totals, cogs };
  }

  function saveReceiptDraft(books, receipt) {
    books = clone(books);
    const row = { ...receipt };
    row.status = row.status === 'finalized' ? 'finalized' : 'draft';
    if (row.status === 'finalized') return { ok: false, error: 'Finalized receipts cannot be edited. Void and re-enter if needed.' };
    if (!row.id) row.id = uid('rcpt');
    const idx = books.receipts.findIndex((r) => r.id === row.id);
    if (idx < 0) {
      if (!row.number) row.number = nextReceiptNo(books, row.date);
      else books.counters.receipt = Math.max(Number(books.counters.receipt) || 0, Number(String(row.number).split('-').pop()) || 0);
    }
    if (idx >= 0) books.receipts[idx] = { ...books.receipts[idx], ...row, status: 'draft' };
    else books.receipts.push(row);
    if (row.ro) {
      let job = books.jobs.find((j) => j.number === row.ro);
      if (!job) {
        job = {
          id: uid('job'),
          number: row.ro,
          date: row.date,
          customerId: row.customerId || '',
          vehicle: row.vehicle || '',
          status: 'open',
          notes: '',
          receiptIds: []
        };
        books.jobs.push(job);
      }
      if (!job.receiptIds.includes(row.id)) job.receiptIds.push(row.id);
      job.vehicle = row.vehicle || job.vehicle;
      job.customerId = row.customerId || job.customerId;
    }
    return { ok: true, books, receipt: idx >= 0 ? books.receipts[idx] : row };
  }

  function voidReceipt(books, receiptId, date) {
    books = clone(books);
    const receipt = books.receipts.find((r) => r.id === receiptId);
    if (!receipt) return { ok: false, error: 'Receipt not found.' };
    if (receipt.status !== 'finalized') {
      receipt.status = 'void';
      return { ok: true, books, receipt };
    }
    if (receipt.journalId) {
      const rev = reverseJournal(books, receipt.journalId, date || todayIso(), `Void receipt ${receipt.number}`);
      if (!rev.ok) return rev;
    }
    for (const ln of receipt.lines || []) {
      if (isLabor(ln.type) || !ln.pn || !round4(ln.qty)) continue;
      const unit = round4(ln.qty) ? round2((Number(ln.costPosted) || Number(ln.cost) || 0) / Number(ln.qty)) : 0;
      receivePart(books, {
        partNumber: ln.pn,
        description: ln.desc,
        qty: ln.qty,
        cost: unit,
        date: date || todayIso(),
        source: 'void-receipt',
        ref: `Void ${receipt.number}`,
        receiptNo: receipt.number
      });
    }
    receipt.status = 'void';
    receipt.balance = 0;
    return { ok: true, books, receipt };
  }

  function receiveArPayment(books, { receiptId, amount, date, method, memo }) {
    books = clone(books);
    const receipt = books.receipts.find((r) => r.id === receiptId);
    if (!receipt) return { ok: false, error: 'Invoice not found.' };
    if (receipt.status !== 'finalized') return { ok: false, error: 'Only finalized invoices can take payments.' };
    const amt = round2(amount);
    if (amt <= 0) return { ok: false, error: 'Payment must be greater than zero.' };
    if (amt - receipt.balance > 0.005) return { ok: false, error: 'Payment cannot exceed the open balance.' };
    const posted = postJournal(books, {
      date: date || todayIso(),
      memo: memo || `Payment ${receipt.number}`,
      source: 'ar-payment',
      sourceId: receipt.id,
      lines: [
        { account: '1000', debit: amt, credit: 0, memo: method || 'Payment' },
        { account: '1100', debit: 0, credit: amt, memo: receipt.number }
      ]
    });
    if (!posted.ok) return posted;
    receipt.paid = round2((Number(receipt.paid) || 0) + amt);
    receipt.balance = round2((Number(receipt.balance) || 0) - amt);
    books.payments.push({
      id: uid('pay'),
      receiptId: receipt.id,
      receiptNo: receipt.number,
      date: date || todayIso(),
      amount: amt,
      method: method || 'cash',
      memo: memo || '',
      journalId: posted.entry.id
    });
    return { ok: true, books, receipt, entry: posted.entry };
  }

  function postBill(books, billId) {
    books = clone(books);
    const bill = books.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, error: 'Bill not found.' };
    if (bill.status === 'posted') return { ok: false, error: 'Bill is already posted.' };
    const lines = [];
    let total = 0;
    for (const ln of bill.lines || []) {
      const amt = round2((Number(ln.qty) || 1) * (Number(ln.amount) || Number(ln.rate) || 0));
      if (!amt) continue;
      total = round2(total + amt);
      if (ln.kind === 'parts' && ln.stocked !== false) {
        const rec = receivePart(books, {
          partNumber: ln.pn,
          description: ln.desc,
          qty: ln.qty || 1,
          cost: ln.amount != null && ln.qty ? round2(amt / Number(ln.qty)) : round2(ln.amount || ln.rate),
          sellPrice: ln.sellPrice,
          date: bill.date,
          source: 'ap-bill',
          ref: bill.number
        });
        if (!rec.ok) return rec;
        lines.push({ account: '1200', debit: amt, credit: 0, memo: ln.pn || ln.desc || 'Parts' });
      } else if (ln.kind === 'parts') {
        lines.push({ account: ln.account || '5000', debit: amt, credit: 0, memo: ln.desc || 'Parts (not stocked)' });
      } else {
        const acct = ln.account || '6900';
        if (!accountByCode(books, acct)) return { ok: false, error: `Unknown expense account ${acct}.` };
        lines.push({ account: acct, debit: amt, credit: 0, memo: ln.desc || '' });
      }
    }
    if (!total) return { ok: false, error: 'Bill has no amounts.' };
    const creditAcct = bill.paidNow ? '1000' : '2000';
    lines.push({ account: creditAcct, debit: 0, credit: total, memo: bill.vendorName || bill.number });
    const posted = postJournal(books, {
      date: bill.date,
      memo: `Bill ${bill.number}${bill.vendorName ? ' · ' + bill.vendorName : ''}`,
      source: 'ap-bill',
      sourceId: bill.id,
      lines
    });
    if (!posted.ok) return posted;
    bill.status = 'posted';
    bill.journalId = posted.entry.id;
    bill.total = total;
    bill.balance = bill.paidNow ? 0 : total;
    bill.paid = bill.paidNow ? total : 0;
    return { ok: true, books, bill, entry: posted.entry };
  }

  function saveBillDraft(books, bill) {
    books = clone(books);
    const row = { ...bill, status: 'draft' };
    if (!row.id) row.id = uid('bill');
    const idx = books.bills.findIndex((b) => b.id === row.id);
    if (idx < 0) {
      if (!row.number) row.number = nextBillNo(books);
      else books.counters.bill = Math.max(Number(books.counters.bill) || 0, Number(String(row.number).replace(/\D/g, '')) || 0);
    }
    if (idx >= 0) {
      if (books.bills[idx].status === 'posted') return { ok: false, error: 'Posted bills cannot be edited.' };
      books.bills[idx] = { ...books.bills[idx], ...row, status: 'draft' };
    } else books.bills.push(row);
    return { ok: true, books, bill: idx >= 0 ? books.bills[idx] : row };
  }

  function payBill(books, { billId, amount, date, memo }) {
    books = clone(books);
    const bill = books.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, error: 'Bill not found.' };
    if (bill.status !== 'posted') return { ok: false, error: 'Post the bill before paying it.' };
    const amt = round2(amount);
    if (amt <= 0) return { ok: false, error: 'Payment must be greater than zero.' };
    if (amt - bill.balance > 0.005) return { ok: false, error: 'Payment cannot exceed the open balance.' };
    const posted = postJournal(books, {
      date: date || todayIso(),
      memo: memo || `Pay bill ${bill.number}`,
      source: 'ap-pay',
      sourceId: bill.id,
      lines: [
        { account: '2000', debit: amt, credit: 0, memo: bill.number },
        { account: '1000', debit: 0, credit: amt, memo: bill.vendorName || 'Bill payment' }
      ]
    });
    if (!posted.ok) return posted;
    bill.paid = round2((Number(bill.paid) || 0) + amt);
    bill.balance = round2((Number(bill.balance) || 0) - amt);
    books.billPayments.push({
      id: uid('bp'),
      billId: bill.id,
      billNo: bill.number,
      date: date || todayIso(),
      amount: amt,
      memo: memo || '',
      journalId: posted.entry.id
    });
    return { ok: true, books, bill, entry: posted.entry };
  }

  function addAccount(books, { code, name, type }) {
    books = clone(books);
    const acct = makeAccount({ code, name, type, system: false });
    if (!acct.code || !/^\d{3,6}$/.test(acct.code)) return { ok: false, error: 'Account number must be 3–6 digits.' };
    if (!acct.name) return { ok: false, error: 'Account name is required.' };
    if (!TYPE_ORDER[acct.type]) return { ok: false, error: 'Unknown account type.' };
    if (accountByCode(books, acct.code)) return { ok: false, error: `Account ${acct.code} already exists.` };
    books.accounts.push(acct);
    books.accounts = sortAccounts(books.accounts);
    return { ok: true, books, account: acct };
  }

  function upsertParty(books, kind, row) {
    books = clone(books);
    const list = kind === 'vendor' ? books.vendors : books.customers;
    const rec = { ...row };
    if (!rec.name || !String(rec.name).trim()) return { ok: false, error: 'Name is required.' };
    rec.name = String(rec.name).trim();
    if (!rec.id) {
      rec.id = uid(kind === 'vendor' ? 'vend' : 'cust');
      if (kind === 'vendor') books.counters.vendor = (Number(books.counters.vendor) || 0) + 1;
      else books.counters.customer = (Number(books.counters.customer) || 0) + 1;
      list.push(rec);
    } else {
      const idx = list.findIndex((x) => x.id === rec.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...rec };
      else list.push(rec);
    }
    return { ok: true, books, record: rec };
  }

  function upsertJob(books, row) {
    books = clone(books);
    const rec = { ...row };
    if (!rec.id) rec.id = uid('job');
    if (!rec.number) rec.number = nextJobNo(books, rec.date);
    rec.status = rec.status || 'open';
    rec.receiptIds = rec.receiptIds || [];
    const idx = books.jobs.findIndex((j) => j.id === rec.id);
    if (idx >= 0) books.jobs[idx] = { ...books.jobs[idx], ...rec };
    else books.jobs.push(rec);
    return { ok: true, books, job: idx >= 0 ? books.jobs[idx] : rec };
  }

  function payrollPostKey(employeeId, periodEnd) {
    return `${employeeId}::${periodEnd}`;
  }

  function postPayrollRun(books, payload) {
    books = clone(books);
    const employeeId = payload.employeeId;
    const periodEnd = payload.periodEnd;
    const payday = payload.payday || periodEnd;
    const name = payload.employeeName || 'Employee';
    const gross = round2(payload.gross);
    const net = round2(payload.net);
    const federal = round2(payload.federal);
    const ss = round2(payload.ss);
    const medicare = round2(payload.medicare);
    const additionalMedicare = round2(payload.additionalMedicare);
    const state = round2(payload.state);
    const childSupport = round2(payload.childSupport);
    const garnishments = round2(payload.garnishments);
    const pretax = round2(payload.pretax);
    const erSS = ss;
    const erMed = round2(Math.max(0, medicare - additionalMedicare));
    const erFica = round2(erSS + erMed);
    const accrued = round2(childSupport + garnishments);
    const key = payrollPostKey(employeeId, periodEnd);
    const existing = (books.payrollPosts || []).find((p) => p.key === key);
    if (existing && existing.journalId) {
      const rev = reverseJournal(books, existing.journalId, payday, `Replace payroll ${name} ${periodEnd}`);
      if (!rev.ok) return rev;
      existing.reversedBy = rev.entry.id;
    }
    const lines = [
      { account: '6000', debit: gross, credit: 0, memo: name },
      { account: '6100', debit: erFica, credit: 0, memo: 'Employer FICA' }
    ];
    if (net) lines.push({ account: '1000', debit: 0, credit: net, memo: 'Net pay' });
    if (federal) lines.push({ account: '2210', debit: 0, credit: federal, memo: 'FIT' });
    if (ss) lines.push({ account: '2220', debit: 0, credit: ss, memo: 'Employee SS' });
    if (medicare) lines.push({ account: '2230', debit: 0, credit: medicare, memo: 'Employee Medicare' });
    if (state) lines.push({ account: '2240', debit: 0, credit: state, memo: 'VA WH' });
    if (erFica) lines.push({ account: '2300', debit: 0, credit: erFica, memo: 'Employer FICA' });
    if (accrued) lines.push({ account: '2200', debit: 0, credit: accrued, memo: 'Garnishment / child support' });
    if (pretax) lines.push({ account: '2200', debit: 0, credit: pretax, memo: 'Pre-tax deduction' });
    const posted = postJournal(books, {
      date: payday,
      memo: `Payroll ${name} · payday ${payday}`,
      source: 'payroll',
      sourceId: key,
      lines
    });
    if (!posted.ok) return posted;
    books.payrollPosts = (books.payrollPosts || []).filter((p) => p.key !== key);
    books.payrollPosts.push({
      key,
      employeeId,
      periodEnd,
      payday,
      journalId: posted.entry.id,
      gross,
      net,
      postedAt: new Date().toISOString()
    });
    return { ok: true, books, entry: posted.entry };
  }

  function accountActivity(books, code, { from, to, asOf } = {}) {
    const rows = [];
    let debit = 0;
    let credit = 0;
    for (const j of postedJournals(books)) {
      if (asOf && j.date > asOf) continue;
      if (!isoInRange(j.date, from, to)) continue;
      for (const ln of j.lines || []) {
        if (String(ln.account) !== String(code)) continue;
        debit = round2(debit + (ln.debit || 0));
        credit = round2(credit + (ln.credit || 0));
        rows.push({
          date: j.date,
          number: j.number,
          memo: ln.memo || j.memo,
          debit: ln.debit || 0,
          credit: ln.credit || 0,
          journalId: j.id,
          source: j.source
        });
      }
    }
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.number).localeCompare(String(b.number)));
    const acct = accountByCode(books, code);
    const nb = normalBalance(acct);
    const balance = nb === 'debit' ? round2(debit - credit) : round2(credit - debit);
    return { debit, credit, balance, rows, account: acct };
  }

  function trialBalance(books, asOf) {
    const rows = [];
    let debit = 0;
    let credit = 0;
    for (const acct of sortAccounts(books.accounts)) {
      const act = accountActivity(books, acct.code, { asOf: asOf || null, from: null, to: asOf || null });
      if (!act.debit && !act.credit) continue;
      rows.push({
        code: acct.code,
        name: acct.name,
        type: acct.type,
        debit: act.debit,
        credit: act.credit,
        balance: act.balance
      });
      debit = round2(debit + act.debit);
      credit = round2(credit + act.credit);
    }
    return { rows, debit, credit, balanced: moneyEq(debit, credit), asOf: asOf || null };
  }

  function signedBalance(books, code, asOf) {
    return accountActivity(books, code, { asOf, from: null, to: asOf || null }).balance;
  }

  function sumTypes(books, types, { from, to, asOf } = {}) {
    let total = 0;
    const rows = [];
    const set = new Set(types);
    for (const acct of sortAccounts(books.accounts)) {
      if (!set.has(acct.type)) continue;
      const act = accountActivity(books, acct.code, { from, to, asOf });
      if (!act.balance && !act.debit && !act.credit) continue;
      rows.push({ code: acct.code, name: acct.name, type: acct.type, balance: act.balance });
      total = round2(total + act.balance);
    }
    return { total, rows };
  }

  function profitAndLoss(books, from, to) {
    const revenue = sumTypes(books, ['revenue'], { from, to });
    const cogs = sumTypes(books, ['cogs'], { from, to });
    const opex = sumTypes(books, ['opex'], { from, to });
    const grossProfit = round2(revenue.total - cogs.total);
    const netIncome = round2(grossProfit - opex.total);
    return { from, to, revenue, cogs, opex, grossProfit, netIncome };
  }

  function balanceSheet(books, asOf) {
    const assets = sumTypes(books, ['asset'], { asOf, to: asOf });
    const contra = sumTypes(books, ['contra-asset'], { asOf, to: asOf });
    const liabilities = sumTypes(books, ['liability'], { asOf, to: asOf });
    const equity = sumTypes(books, ['equity'], { asOf, to: asOf });
    const year = String(asOf || todayIso()).slice(0, 4);
    const ni = profitAndLoss(books, `${year}-01-01`, asOf).netIncome;
    const netAssets = round2(assets.total - contra.total);
    const equityTotal = round2(equity.total + ni);
    const liabEq = round2(liabilities.total + equityTotal);
    return {
      asOf,
      assets,
      contra,
      netAssets,
      liabilities,
      equity,
      netIncome: ni,
      equityTotal,
      liabEq,
      balanced: moneyEq(netAssets, liabEq)
    };
  }

  function agingBuckets(dateIso, asOf) {
    const a = new Date(`${asOf}T00:00:00`);
    const d = new Date(`${dateIso}T00:00:00`);
    const days = Math.max(0, Math.round((a - d) / 86400000));
    if (days <= 30) return 'current';
    if (days <= 60) return 'd31';
    if (days <= 90) return 'd61';
    return 'd91';
  }

  function arAging(books, asOf) {
    const empty = { current: 0, d31: 0, d61: 0, d91: 0, total: 0, rows: [] };
    const asOfDate = asOf || todayIso();
    for (const r of books.receipts || []) {
      if (r.status !== 'finalized') continue;
      const bal = round2(r.balance);
      if (bal <= 0) continue;
      const bucket = agingBuckets(r.date, asOfDate);
      empty[bucket] = round2(empty[bucket] + bal);
      empty.total = round2(empty.total + bal);
      empty.rows.push({ ...r, bucket, balance: bal });
    }
    return empty;
  }

  function apAging(books, asOf) {
    const empty = { current: 0, d31: 0, d61: 0, d91: 0, total: 0, rows: [] };
    const asOfDate = asOf || todayIso();
    for (const b of books.bills || []) {
      if (b.status !== 'posted') continue;
      const bal = round2(b.balance);
      if (bal <= 0) continue;
      const bucket = agingBuckets(b.dueDate || b.date, asOfDate);
      empty[bucket] = round2(empty[bucket] + bal);
      empty.total = round2(empty.total + bal);
      empty.rows.push({ ...b, bucket, balance: bal });
    }
    return empty;
  }

  function payrollLiabilities(books, asOf) {
    const codes = ['2200', '2210', '2220', '2230', '2240', '2300'];
    const rows = codes.map((code) => {
      const acct = accountByCode(books, code);
      return { code, name: acct ? acct.name : code, balance: signedBalance(books, code, asOf) };
    });
    const total = round2(rows.reduce((s, r) => s + r.balance, 0));
    return { rows, total, asOf };
  }

  function receiptRegister(books, from, to) {
    return (books.receipts || [])
      .filter((r) => r.status === 'finalized' && isoInRange(r.date, from, to))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.number).localeCompare(String(b.number)));
  }

  function dashboard(books, asOf) {
    const asOfDate = asOf || todayIso();
    const monthStart = `${asOfDate.slice(0, 7)}-01`;
    const pl = profitAndLoss(books, monthStart, asOfDate);
    return {
      cash: signedBalance(books, '1000', asOfDate),
      ar: signedBalance(books, '1100', asOfDate),
      ap: signedBalance(books, '2000', asOfDate),
      inventory: signedBalance(books, '1200', asOfDate),
      salesTax: signedBalance(books, '2100', asOfDate),
      payrollLiab: payrollLiabilities(books, asOfDate).total,
      monthRevenue: pl.revenue.total,
      monthCogs: pl.cogs.total,
      monthGross: pl.grossProfit,
      monthNet: pl.netIncome,
      openInvoices: (books.receipts || []).filter((r) => r.status === 'finalized' && round2(r.balance) > 0).length,
      billsDue: (books.bills || []).filter((b) => b.status === 'posted' && round2(b.balance) > 0).length,
      drafts: (books.receipts || []).filter((r) => r.status === 'draft').length
    };
  }

  function peekReceiptNo(books, dateIso) {
    const d = String(dateIso || todayIso()).replace(/-/g, '');
    const y = d.slice(0, 4);
    const md = d.slice(4, 8);
    const n = (Number(books.counters && books.counters.receipt) || 0) + 1;
    return `MB-${y}-${md}-${String(n).padStart(3, '0')}`;
  }

  function newReceipt(books) {
    const date = todayIso();
    return {
      id: uid('rcpt'),
      number: peekReceiptNo(books, date),
      date,
      status: 'draft',
      customerId: '',
      customerName: '',
      paymentNote: 'Paid in Full',
      paymentMethod: 'cash',
      vehicle: '',
      ro: '',
      jobId: '',
      mechRate: round2(books.settings && books.settings.mechRate) || 90,
      bodyRate: round2(books.settings && books.settings.bodyRate) || 55,
      taxRate: Number(books.settings && books.settings.taxRate) || 5.3,
      lines: [],
      journalId: '',
      balance: 0,
      paid: 0
    };
  }

  function newBill(books) {
    const date = todayIso();
    const n = (Number(books.counters && books.counters.bill) || 0) + 1;
    return {
      id: uid('bill'),
      number: `BILL-${String(n).padStart(4, '0')}`,
      date,
      dueDate: date,
      vendorId: '',
      vendorName: '',
      status: 'draft',
      paidNow: false,
      ref: '',
      lines: [{ kind: 'expense', account: '6400', desc: '', qty: 1, amount: 0, pn: '', stocked: true, sellPrice: 0 }],
      total: 0,
      balance: 0,
      paid: 0
    };
  }

  const RECEIPT_CSS = `
    :root { --navy:#1a2744; --accent:#c0392b; --light:#f4f5f7; --line:#d0d4db; --muted:#5c6570; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; background: #fff; color: #111; }
    #receipt { width: 8.5in; min-height: 11in; background: #fff; color: #111; padding: 0.6in 0.7in; }
    .shop { text-align: center; font-family: "Times New Roman", Times, serif; color: var(--navy); }
    .shop h2 { margin: 0; font-size: 22px; letter-spacing: .3px; }
    .shop .sub { font-style: italic; color: var(--muted); font-size: 12px; margin-top: 2px; }
    .shop .addr { font-family: Helvetica, Arial, sans-serif; font-size: 10.5px; margin-top: 4px; }
    .bars { margin: 10px 0 12px; }
    .bars .a { height: 2px; background: var(--navy); }
    .bars .b { height: 1px; background: var(--accent); margin-top: 2px; }
    .rtitle { text-align: center; font-family: "Times New Roman", Times, serif; color: var(--navy); font-size: 22px; font-weight: 700; margin: 6px 0 10px; }
    .meta { background: var(--light); border: 1px solid var(--line); padding: 8px 10px; font-size: 11.5px; display: grid; grid-template-columns: 90px 1fr 80px 1fr; gap: 6px 8px; }
    .meta b { color: #111; }
    .sec { color: var(--navy); font-size: 11.5px; font-weight: 700; margin: 16px 0 6px; letter-spacing: .3px; }
    table.items { width: 100%; border-collapse: collapse; font-size: 11.5px; border: 1px solid var(--navy); }
    table.items th { background: var(--navy); color: #fff; text-align: left; padding: 7px 8px; font-weight: 700; }
    table.items th.r, table.items td.r { text-align: right; }
    table.items th.c, table.items td.c { text-align: center; }
    table.items td { padding: 7px 8px; border-bottom: 1px solid var(--line); }
    table.items tr:nth-child(even) td { background: var(--light); }
    .totals { margin-top: 12px; width: 100%; font-size: 12px; }
    .totals td { padding: 4px 8px; text-align: right; }
    .totals tr.grand td { border-top: 1.5px solid var(--navy); background: #e8edf5; font-weight: 700; padding: 7px 8px; }
    .foot { margin-top: 22px; border-top: 1px solid var(--line); padding-top: 10px; text-align: center; color: var(--muted); }
    .foot .thank { font-family: "Times New Roman", Times, serif; font-style: italic; font-size: 12px; }
    .foot .fine { font-size: 9px; margin-top: 4px; line-height: 1.4; }
    .no-print { display: none !important; }
    @media print { body { background: #fff; } #receipt { box-shadow: none; width: auto; min-height: auto; } }
  `;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    return round2(n).toFixed(2);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function addrLine(company) {
    const a = (company && company.address) || {};
    const city = [a.city, a.state].filter(Boolean).join(', ');
    return [a.street, city, a.zip].filter(Boolean).join(' • ');
  }

  function receiptInnerHtml(receipt, company) {
    const c = company || defaultCompany();
    const t = receiptTotals(receipt);
    const lines = (receipt.lines || []).map((ln) => {
      const amt = round2((Number(ln.qty) || 0) * (Number(ln.rate) || 0));
      const desc = esc(ln.desc) + (ln.pn ? ` (P/N ${esc(ln.pn)})` : '');
      const rate = isLabor(ln.type) ? `$${money(ln.rate)}/hr` : ln.rate ? `$${money(ln.rate)}` : '—';
      return `<tr>
        <td class="c">${ln.qty || ''}</td>
        <td>${desc}</td>
        <td class="r">${rate}</td>
        <td class="r">$${money(amt)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" style="text-align:center;color:#888">No line items</td></tr>`;
    const phone = c.phone || '(540) 552-5373';
    return `
      <div class="shop">
        <h2>${esc((c.dba || c.name || "MOORE'S BODY & MECHANICAL SHOP").toUpperCase())}</h2>
        <div class="sub">${esc(c.tagline || 'Auto Body • Mechanical Repair • Inspection')}</div>
        <div class="addr">${esc(addrLine(c))}<br/>${esc(phone)}</div>
      </div>
      <div class="bars"><div class="a"></div><div class="b"></div></div>
      <div class="rtitle">CUSTOMER RECEIPT</div>
      <div class="meta">
        <b>Receipt #</b><span>${esc(receipt.number)}</span>
        <b>Date</b><span>${esc(fmtDate(receipt.date))}</span>
        <b>Customer</b><span>${esc(receipt.customerName || '—')}</span>
        <b>Payment</b><span>${esc(receipt.paymentNote || '—')}</span>
        <b>Vehicle</b><span>${esc(receipt.vehicle || '—')}</span>
        <b>RO #</b><span>${esc(receipt.ro || '—')}</span>
      </div>
      <div class="sec">SERVICES &amp; PARTS</div>
      <table class="items">
        <thead>
          <tr>
            <th class="c" style="width:14%">Hrs / Qty</th>
            <th>Description</th>
            <th class="r" style="width:18%">Rate</th>
            <th class="r" style="width:16%">Amount</th>
          </tr>
        </thead>
        <tbody>${lines}</tbody>
      </table>
      <table class="totals">
        <tr><td>Parts (taxable)</td><td>$${money(t.parts)}</td></tr>
        <tr><td>Labor (nontaxable)</td><td>$${money(t.labor)}</td></tr>
        <tr><td>Sales tax on parts</td><td>$${money(t.tax)}</td></tr>
        <tr class="grand"><td>TOTAL</td><td>$${money(t.total)}</td></tr>
      </table>
      <div class="foot">
        <div class="thank">Thank you for choosing ${esc(c.dba || "Moore's Body & Mechanical Shop")}.</div>
        <div class="fine">Warranty on parts and labor as posted in shop. Please retain this receipt.<br/>
          Questions: ${esc(phone)} • ${esc(addrLine(c))}</div>
      </div>`;
  }

  function receiptDocumentHtml(receipt, company) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>${esc(receipt.number || 'Receipt')}</title>
      <style>${RECEIPT_CSS}</style></head><body><div id="receipt">${receiptInnerHtml(receipt, company)}</div></body></html>`;
  }

  const api = {
    SEED_ACCOUNTS,
    DEFAULT_ADDRESS,
    round2,
    round4,
    moneyEq,
    clone,
    uid,
    todayIso,
    isLabor,
    normalBalance,
    emptyBooks,
    seedBooks,
    normalize,
    ensureSystemAccounts,
    receiptTotals,
    linesBalance,
    postJournal,
    reverseJournal,
    postedJournals,
    findPart,
    qtyOnHand,
    fifoValue,
    avgCost,
    receivePart,
    issuePart,
    adjustPart,
    finalizeReceipt,
    saveReceiptDraft,
    voidReceipt,
    receiveArPayment,
    postBill,
    saveBillDraft,
    payBill,
    addAccount,
    upsertParty,
    upsertJob,
    postPayrollRun,
    accountActivity,
    trialBalance,
    signedBalance,
    profitAndLoss,
    balanceSheet,
    arAging,
    apAging,
    payrollLiabilities,
    receiptRegister,
    dashboard,
    newReceipt,
    newBill,
    peekReceiptNo,
    nextReceiptNo,
    nextBillNo,
    nextJobNo,
    accountByCode,
    sortAccounts,
    cashOrAr,
    isOnAccount,
    receiptInnerHtml,
    receiptDocumentHtml,
    RECEIPT_CSS,
    defaultCompany,
    defaultSettings
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) root.MooresBooks = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
