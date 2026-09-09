'use strict';

(function (root) {
  const B = () => root.MooresBooks;

  const BANK_TYPES = {
    checking: 'Checking',
    savings: 'Savings',
    credit: 'Credit card'
  };

  function round2(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  function digitsOnly(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function sanitizeLast4(s) {
    return digitsOnly(s).slice(0, 4);
  }

  const SOURCE_LABELS = {
    'ar-receipt': 'Receipt',
    'ar-payment': 'AR payment',
    'ap-bill': 'Bill',
    'ap-pay': 'Bill payment',
    payroll: 'Payroll',
    manual: 'Journal',
    'bank-recon': 'Recon adjustment',
    inventory: 'Inventory'
  };

  function sourceLabel(source) {
    return SOURCE_LABELS[source] || String(source || 'Journal');
  }

  function defaultBank() {
    return {
      id: 'bank-shop-checking',
      name: 'Shop checking',
      type: 'checking',
      bankName: '',
      last4: '',
      openingBalance: 0,
      openingDate: '',
      glAccount: '1000'
    };
  }

  function ensureBanks(books) {
    if (!books || typeof books !== 'object') return books;
    if (!Array.isArray(books.banks) || !books.banks.length) {
      books.banks = [defaultBank()];
    }
    if (!Array.isArray(books.reconciliations)) books.reconciliations = [];
    books.banks = books.banks.map((b) => normalizeBank(b));
    return books;
  }

  function normalizeBank(raw) {
    const b = raw && typeof raw === 'object' ? raw : {};
    const type = ['checking', 'savings', 'credit'].includes(b.type) ? b.type : 'checking';
    return {
      id: String(b.id || (B() && B().uid ? B().uid('bank') : `bank-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)),
      name: String(b.name || 'Bank account').trim() || 'Bank account',
      type,
      bankName: String(b.bankName || '').trim(),
      last4: sanitizeLast4(b.last4).slice(0, 4),
      openingBalance: round2(b.openingBalance),
      openingDate: String(b.openingDate || ''),
      glAccount: String(b.glAccount || '1000')
    };
  }

  function bankById(books, id) {
    ensureBanks(books);
    return (books.banks || []).find((b) => b.id === id) || null;
  }

  function defaultBankId(books) {
    ensureBanks(books);
    const list = books.banks || [];
    const cash = list.find((b) => b.glAccount === '1000' && b.type !== 'credit');
    return (cash || list[0] || defaultBank()).id;
  }

  function glForBank(books, bankId) {
    const b = bankById(books, bankId);
    return (b && b.glAccount) || '1000';
  }

  function bankLabel(b, expert) {
    if (!b) return 'Cash';
    const bits = [b.name];
    if (BANK_TYPES[b.type]) bits.push(BANK_TYPES[b.type]);
    if (b.last4) bits.push(`••••${b.last4}`);
    if (expert && b.glAccount) bits.push(b.glAccount);
    return bits.join(' · ');
  }

  function lineKey(journal, index, line) {
    if (line && line.lineId) return String(line.lineId);
    return `${journal.id}:${index}`;
  }

  function cashLines(books, glAccount, throughDate) {
    const gl = String(glAccount || '1000');
    const items = [];
    const journals = B() && B().postedJournals ? B().postedJournals(books) : (books.journal || []).filter((j) => j && j.posted && !j.reversedBy);
    for (const j of journals) {
      if (throughDate && String(j.date) > String(throughDate)) continue;
      (j.lines || []).forEach((ln, i) => {
        if (String(ln.account) !== gl) return;
        const debit = round2(ln.debit);
        const credit = round2(ln.credit);
        items.push({
          key: lineKey(j, i, ln),
          journalId: j.id,
          number: j.number,
          date: j.date,
          type: sourceLabel(j.source || 'manual'),
          source: j.source || 'manual',
          payee: ln.payee || ln.memo || j.memo || '',
          checkNo: ln.checkNumber || '',
          debit,
          credit,
          amount: round2(debit - credit),
          bankId: ln.bankId || '',
          clearedReconId: ln.clearedReconId || '',
          lineId: ln.lineId || '',
          lineIndex: i
        });
      });
    }
    items.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.number).localeCompare(String(b.number)));
    return items;
  }

  function lastClosedRecon(books, bankId) {
    const list = (books.reconciliations || [])
      .filter((r) => r.bankId === bankId && r.status === 'closed')
      .sort((a, b) => String(b.statementDate).localeCompare(String(a.statementDate)));
    return list[0] || null;
  }

  function beginningBalance(books, bank) {
    const last = lastClosedRecon(books, bank.id);
    if (last) return round2(last.statementBalance);
    return round2(bank.openingBalance);
  }

  function unclearedLines(books, bank, throughDate, recon) {
    const gl = bank.glAccount || '1000';
    const reconId = recon && recon.id;
    return cashLines(books, gl, throughDate).filter((ln) => {
      if (!ln.clearedReconId) return true;
      if (reconId && ln.clearedReconId === reconId) return true;
      return false;
    });
  }

  function reconTotals(books, bank, recon) {
    const statementDate = recon.statementDate || B().todayIso();
    const statementBalance = round2(recon.statementBalance);
    const beginning = round2(recon.beginningBalance != null ? recon.beginningBalance : beginningBalance(books, bank));
    const items = unclearedLines(books, bank, statementDate, recon);
    const checked = new Set(recon.clearedKeys || []);
    let clearedIn = 0;
    let clearedOut = 0;
    for (const ln of items) {
      if (!checked.has(ln.key)) continue;
      if (ln.amount >= 0) clearedIn = round2(clearedIn + ln.amount);
      else clearedOut = round2(clearedOut + Math.abs(ln.amount));
    }
    const clearedBalance = round2(beginning + clearedIn - clearedOut);
    const difference = round2(statementBalance - clearedBalance);
    const bookBalance = B() && B().signedBalance ? B().signedBalance(books, bank.glAccount || '1000', statementDate) : 0;
    const leftover = items.filter((ln) => !checked.has(ln.key));
    const clearedItems = items.filter((ln) => checked.has(ln.key));
    return {
      beginning,
      statementBalance,
      statementDate,
      bookBalance,
      clearedIn,
      clearedOut,
      clearedBalance,
      difference,
      items,
      leftover,
      clearedItems
    };
  }

  function cashGlAccounts(books) {
    const linked = new Set((books.banks || []).map((b) => String(b.glAccount || '')));
    return (B().sortAccounts ? B().sortAccounts(books.accounts) : books.accounts || []).filter((a) => {
      if (!a || a.inactive) return false;
      const code = String(a.code);
      if (code === '1000') return true;
      if (linked.has(code)) return true;
      if (a.type === 'asset' && !a.system) return true;
      if (a.type === 'asset' && code.startsWith('10')) return true;
      if (a.type === 'liability' && !a.system) return true;
      return false;
    });
  }

  function bankOptionsHtml(books, selected, expert) {
    ensureBanks(books);
    const want = selected === undefined || selected === null ? defaultBankId(books) : selected;
    return (books.banks || [])
      .map((b) => {
        const sel = String(b.id) === String(want) ? ' selected' : '';
        return `<option value="${esc(b.id)}"${sel}>${esc(bankLabel(b, expert))}</option>`;
      })
      .join('');
  }

  function upsertBank(books, row) {
    books = B().clone(books);
    ensureBanks(books);
    const digits = digitsOnly(row && row.last4);
    if (digits.length > 4) {
      return { ok: false, error: 'Last 4 digits only — never a full account number.' };
    }
    const bank = normalizeBank({ ...(row || {}), last4: digits });
    if (!bank.name) return { ok: false, error: 'Account name is required.' };
    if (!bank.glAccount) return { ok: false, error: 'Linked GL account is required.' };
    if (!B().accountByCode(books, bank.glAccount)) {
      return { ok: false, error: `Unknown GL account ${bank.glAccount}. Add it under Chart of accounts first.` };
    }
    const clash = books.banks.find((b) => b.id !== bank.id && b.glAccount === bank.glAccount);
    if (clash) {
      return { ok: false, error: `${clash.name} is already linked to that GL. Add another cash account if you need a second bank.` };
    }
    const idx = books.banks.findIndex((b) => b.id === bank.id);
    if (idx >= 0) books.banks[idx] = { ...books.banks[idx], ...bank };
    else books.banks.push(bank);
    return { ok: true, books, bank };
  }

  function updateRecon(books, reconId, patch) {
    books = B().clone(books);
    const recon = (books.reconciliations || []).find((r) => r.id === reconId);
    if (!recon) return { ok: false, error: 'Reconciliation not found.' };
    if (recon.status === 'closed') return { ok: false, error: 'This reconciliation is closed.' };
    if (patch && patch.statementDate != null) recon.statementDate = String(patch.statementDate || '');
    if (patch && patch.statementBalance != null) recon.statementBalance = round2(patch.statementBalance);
    return { ok: true, books, recon };
  }

  function addAttachmentMeta(books, reconId, file) {
    books = B().clone(books);
    const recon = (books.reconciliations || []).find((r) => r.id === reconId);
    if (!recon) return { ok: false, error: 'Reconciliation not found.' };
    recon.attachments = recon.attachments || [];
    recon.attachments.push({
      id: file.id || B().uid('att'),
      name: String(file.name || file.storedName || 'attachment'),
      storedName: String(file.storedName || ''),
      mime: String(file.mime || ''),
      addedAt: file.addedAt || new Date().toISOString()
    });
    return { ok: true, books, recon };
  }

  function removeAttachmentMeta(books, reconId, storedName) {
    books = B().clone(books);
    const recon = (books.reconciliations || []).find((r) => r.id === reconId);
    if (!recon) return { ok: false, error: 'Reconciliation not found.' };
    recon.attachments = (recon.attachments || []).filter((a) => a.storedName !== storedName && a.id !== storedName);
    return { ok: true, books, recon };
  }

  function openRecon(books, bankId, statementDate) {
    books = B().clone(books);
    ensureBanks(books);
    const bank = bankById(books, bankId);
    if (!bank) return { ok: false, error: 'Choose a bank account.' };
    const existing = (books.reconciliations || []).find(
      (r) => r.bankId === bankId && r.status === 'open'
    );
    if (existing) return { ok: true, books, recon: existing };
    const recon = {
      id: B().uid('recon'),
      bankId,
      statementDate: statementDate || B().todayIso(),
      statementBalance: 0,
      beginningBalance: beginningBalance(books, bank),
      status: 'open',
      clearedKeys: [],
      attachments: [],
      difference: 0,
      adjustmentJournalId: '',
      closedAt: ''
    };
    books.reconciliations.push(recon);
    return { ok: true, books, recon };
  }

  function toggleCleared(books, reconId, key) {
    books = B().clone(books);
    const recon = (books.reconciliations || []).find((r) => r.id === reconId);
    if (!recon) return { ok: false, error: 'Reconciliation not found.' };
    if (recon.status === 'closed') return { ok: false, error: 'This reconciliation is closed.' };
    const set = new Set(recon.clearedKeys || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    recon.clearedKeys = Array.from(set);
    return { ok: true, books, recon };
  }

  function markLinesCleared(books, keys, reconId) {
    const want = new Set(keys || []);
    for (const j of books.journal || []) {
      (j.lines || []).forEach((ln, i) => {
        const key = lineKey(j, i, ln);
        if (!want.has(key)) return;
        ln.clearedReconId = reconId;
      });
    }
  }

  function unmarkLines(books, reconId) {
    for (const j of books.journal || []) {
      (j.lines || []).forEach((ln) => {
        if (ln.clearedReconId === reconId) ln.clearedReconId = '';
      });
    }
  }

  function finishRecon(books, reconId, { expert, allowDifference, company } = {}) {
    books = B().clone(books);
    ensureBanks(books);
    const recon = (books.reconciliations || []).find((r) => r.id === reconId);
    if (!recon) return { ok: false, error: 'Reconciliation not found.' };
    if (recon.status === 'closed') return { ok: false, error: 'Already finished.' };
    const bank = bankById(books, recon.bankId);
    if (!bank) return { ok: false, error: 'Bank account missing.' };
    const tot = reconTotals(books, bank, recon);
    const preDiff = round2(tot.difference);
    if (Math.abs(preDiff) >= 0.005) {
      if (!expert || !allowDifference) {
        return { ok: false, error: 'Difference must be $0.00 to finish. Expert mode can finish with an adjustment.' };
      }
      const amt = round2(Math.abs(preDiff));
      const gl = bank.glAccount || '1000';
      const lines =
        preDiff > 0
          ? [
              { account: gl, debit: amt, credit: 0, memo: 'Recon adjustment', bankId: bank.id, payee: bank.name },
              { account: '6810', debit: 0, credit: amt, memo: 'Recon adjustment' }
            ]
          : [
              { account: '6810', debit: amt, credit: 0, memo: 'Recon adjustment' },
              { account: gl, debit: 0, credit: amt, memo: 'Recon adjustment', bankId: bank.id, payee: bank.name }
            ];
      const posted = B().postJournal(books, {
        date: recon.statementDate,
        memo: `Bank recon adjustment · ${bank.name} · ${recon.statementDate}`,
        source: 'bank-recon',
        sourceId: recon.id,
        lines
      });
      if (!posted.ok) return posted;
      recon.adjustmentJournalId = posted.entry.id;
      posted.entry.lines.forEach((ln) => {
        if (String(ln.account) === String(gl)) {
          const key = ln.lineId || lineKey(posted.entry, posted.entry.lines.indexOf(ln), ln);
          recon.clearedKeys = (recon.clearedKeys || []).concat([key]);
          ln.clearedReconId = recon.id;
        }
      });
    }
    markLinesCleared(books, recon.clearedKeys, recon.id);
    recon.status = 'closed';
    recon.closedAt = new Date().toISOString();
    recon.difference = preDiff;
    recon.statementBalance = tot.statementBalance;
    recon.beginningBalance = tot.beginning;
    recon.clearedIn = tot.clearedIn;
    recon.clearedOut = tot.clearedOut;
    recon.bookBalance = tot.bookBalance;
    return { ok: true, books, recon, totals: reconTotals(books, bank, recon), preDiff };
  }

  function canReopen(books, recon) {
    if (!recon || recon.status !== 'closed') return false;
    const last = lastClosedRecon(books, recon.bankId);
    return Boolean(last && last.id === recon.id);
  }

  function reopenRecon(books, reconId) {
    books = B().clone(books);
    const recon = (books.reconciliations || []).find((r) => r.id === reconId);
    if (!recon) return { ok: false, error: 'Reconciliation not found.' };
    if (recon.status !== 'closed') return { ok: false, error: 'This reconciliation is already open.' };
    if (!canReopen(books, recon)) {
      return { ok: false, error: 'Only the latest closed reconciliation for this account can be reopened.' };
    }
    const open = (books.reconciliations || []).find((r) => r.bankId === recon.bankId && r.status === 'open');
    if (open) return { ok: false, error: 'Finish or continue the open reconciliation first.' };
    recon.status = 'open';
    recon.closedAt = '';
    unmarkLines(books, recon.id);
    return { ok: true, books, recon };
  }

  function reconReportHtml(books, recon, company, { withItems, expert } = {}) {
    const bank = bankById(books, recon.bankId) || {};
    const tot = reconTotals(books, bank, recon);
    const shop = (company && company.name) || "Moore's Body Shop";
    const last4 = bank.last4 ? `••••${bank.last4}` : '—';
    const money = (n) =>
      round2(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const itemRows = (list) =>
      (list || [])
        .map(
          (ln) => `<tr>
            <td>${esc(ln.date)}</td>
            <td>${esc(ln.type)}</td>
            <td>${esc(ln.payee)}</td>
            <td>${esc(ln.checkNo || '')}</td>
            <td class="num">${money(ln.amount)}</td>
            ${expert ? `<td>${esc(bank.glAccount || '')}</td>` : ''}
          </tr>`
        )
        .join('');
    const leftoverSection = tot.leftover.length
      ? `<h2>Uncleared (roll forward)</h2>
        <table><thead><tr><th>Date</th><th>Type</th><th>Payee</th><th>Check</th><th class="num">Amount</th>${expert ? '<th>GL</th>' : ''}</tr></thead>
        <tbody>${itemRows(tot.leftover)}</tbody></table>`
      : '<p>No uncleared items.</p>';
    const clearedSection = withItems
      ? `<h2>Cleared items</h2>
        <table><thead><tr><th>Date</th><th>Type</th><th>Payee</th><th>Check</th><th class="num">Amount</th>${expert ? '<th>GL</th>' : ''}</tr></thead>
        <tbody>${itemRows(tot.clearedItems) || '<tr><td colspan="5">None</td></tr>'}</tbody></table>`
      : '';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Bank recon</title>
      <style>
        body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#151922;font-size:13px}
        h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;margin:16px 0 6px;color:#2e5db8}
        table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid #e2e6ee;padding:6px 8px;text-align:left}
        td.num,th.num{text-align:right} .muted{color:#6b7380}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin:12px 0}
      </style></head><body>
      <h1>${esc(shop)}</h1>
      <div class="muted">Bank reconciliation</div>
      <div class="grid">
        <div><b>Account</b> ${esc(bank.name || '')} · ${esc(BANK_TYPES[bank.type] || '')}</div>
        <div><b>Last 4</b> ${esc(last4)}</div>
        <div><b>Bank</b> ${esc(bank.bankName || '—')}</div>
        <div><b>Statement date</b> ${esc(recon.statementDate || '')}</div>
        ${expert ? `<div><b>GL</b> ${esc(bank.glAccount || '')}</div>` : ''}
      </div>
      <table>
        <tr><td>Beginning balance</td><td class="num">${money(tot.beginning)}</td></tr>
        <tr><td>Cleared in</td><td class="num">${money(tot.clearedIn)}</td></tr>
        <tr><td>Cleared out</td><td class="num">${money(tot.clearedOut)}</td></tr>
        <tr><td>Statement balance</td><td class="num">${money(tot.statementBalance)}</td></tr>
        <tr><td>Book balance</td><td class="num">${money(tot.bookBalance)}</td></tr>
        <tr><td><b>Difference</b></td><td class="num"><b>${money(tot.difference)}</b></td></tr>
      </table>
      ${withItems ? clearedSection : ''}
      ${leftoverSection}
      </body></html>`;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const api = {
    BANK_TYPES,
    SOURCE_LABELS,
    sanitizeLast4,
    digitsOnly,
    defaultBank,
    ensureBanks,
    normalizeBank,
    bankById,
    defaultBankId,
    glForBank,
    bankLabel,
    cashGlAccounts,
    bankOptionsHtml,
    sourceLabel,
    cashLines,
    lastClosedRecon,
    beginningBalance,
    unclearedLines,
    reconTotals,
    upsertBank,
    updateRecon,
    addAttachmentMeta,
    removeAttachmentMeta,
    openRecon,
    toggleCleared,
    finishRecon,
    canReopen,
    reopenRecon,
    reconReportHtml
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MooresBanking = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
