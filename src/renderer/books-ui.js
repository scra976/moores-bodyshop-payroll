'use strict';

(function (root) {
  const B = () => root.MooresBooks;
  const Bank = () => root.MooresBanking;
  let showCodes = false;

  function isExpert(ctx) {
    return Boolean(ctx && ctx.state && ctx.state.settings && ctx.state.settings.uiMode === 'expert');
  }

  const TITLES = {
    dashboard: ['Dashboard', 'Shop snapshot'],
    ar: ['Accounts Receivable', 'Customers, ROs, receipts, invoices'],
    ap: ['Accounts Payable', 'Vendors, bills, and payments'],
    gl: ['General Ledger', 'Chart of accounts, journal, trial balance, bank recon'],
    inventory: ['Inventory', 'Parts quantity and FIFO cost'],
    reports: ['Reports', 'P&L, balance sheet, tax, aging, payroll filings']
  };

  function money(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '$0.00';
    return x.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function optionList(values, selected, labels) {
    return values
      .map((v) => {
        const label = labels && labels[v] != null ? labels[v] : v;
        return `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ui(state) {
    if (!state.booksUi) {
      state.booksUi = {
        arTab: 'receipts',
        apTab: 'bills',
        glTab: 'accounts',
        receiptId: 'rcpt-seed-demo',
        billId: '',
        ledgerAccount: '1000',
        customerId: '',
        vendorId: '',
        reportFrom: `${new Date().getFullYear()}-01-01`,
        reportTo: B().todayIso(),
        reconBankId: '',
        reconId: '',
        bankEditId: ''
      };
    }
    if (Bank()) Bank().ensureBanks(state.books);
    return state.booksUi;
  }

  function currentBankId(ctx, selected) {
    if (!Bank()) return '';
    Bank().ensureBanks(ctx.state.books);
    return selected || Bank().defaultBankId(ctx.state.books);
  }

  function bankSelectHtml(ctx, selected, id, disabled) {
    if (!Bank()) return `<select id="${esc(id)}"${disabled ? ' disabled' : ''}><option value="">Cash</option></select>`;
    Bank().ensureBanks(ctx.state.books);
    const sel = currentBankId(ctx, selected);
    return `<select id="${esc(id)}"${disabled ? ' disabled' : ''}>${Bank().bankOptionsHtml(ctx.state.books, sel, isExpert(ctx))}</select>`;
  }

  function tabs(items, active, attr) {
    return `<div class="mode-toggle">${items
      .map(
        ([id, label]) =>
          `<button type="button" class="mode-btn${active === id ? ' is-active' : ''}" ${attr}="${esc(id)}">${esc(label)}</button>`
      )
      .join('')}</div>`;
  }

  function accountOptions(books, selected, { types } = {}) {
    const list = B()
      .sortAccounts(books.accounts)
      .filter((a) => !a.inactive && (!types || types.includes(a.type)));
    return list
      .map((a) => {
        const label = showCodes ? `${a.code} ${a.name}` : a.name;
        return `<option value="${esc(a.code)}"${a.code === selected ? ' selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
  }

  function customerOptions(books, selected, includeNew) {
    const rows = (books.customers || [])
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`);
    rows.unshift(`<option value="">${includeNew ? 'Walk-in / type a name' : 'Select customer'}</option>`);
    return rows.join('');
  }

  function vendorOptions(books, selected) {
    const rows = (books.vendors || [])
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`);
    rows.unshift('<option value="">Select vendor</option>');
    return rows.join('');
  }

  function partOptions(books, selected) {
    const rows = (books.inventory || [])
      .slice()
      .sort((a, b) => String(a.partNumber).localeCompare(String(b.partNumber)))
      .map((p) => `<option value="${esc(p.partNumber)}"${p.partNumber === selected ? ' selected' : ''}>${esc(p.partNumber)} · ${esc(p.description)}</option>`);
    rows.unshift('<option value="">Part from inventory…</option>');
    return rows.join('');
  }

  async function commit(ctx, books, msg) {
    ctx.state.books = books;
    try {
      const res = await ctx.persistBooks();
      if (!res) return false;
      if (msg) ctx.toast(msg, 'ok');
      ctx.renderAll();
      return true;
    } catch (err) {
      ctx.toast((err && err.message) || 'Could not save books.', 'err');
      return false;
    }
  }

  function currentReceipt(ctx) {
    const id = ui(ctx.state).receiptId;
    return (ctx.state.books.receipts || []).find((r) => r.id === id) || null;
  }

  function currentBill(ctx) {
    const id = ui(ctx.state).billId;
    return (ctx.state.books.bills || []).find((b) => b.id === id) || null;
  }

  function renderDashboard(ctx) {
    const d = B().dashboard(ctx.state.books);
    const receipts = (ctx.state.books.receipts || []).slice().reverse().slice(0, 8);
    const bills = (ctx.state.books.bills || []).filter((b) => b.status === 'posted' && Number(b.balance) > 0).slice(0, 8);
    return `
      <div class="stats stats-6">
        <div class="stat"><div class="k">Cash</div><div class="v">${money(d.cash)}</div></div>
        <div class="stat"><div class="k">AR</div><div class="v">${money(d.ar)}</div></div>
        <div class="stat"><div class="k">AP</div><div class="v">${money(d.ap)}</div></div>
        <div class="stat"><div class="k">Parts inventory</div><div class="v">${money(d.inventory)}</div></div>
        <div class="stat"><div class="k">Sales tax owed</div><div class="v">${money(d.salesTax)}</div></div>
        <div class="stat"><div class="k">Payroll liabilities</div><div class="v">${money(d.payrollLiab)}</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">Month revenue</div><div class="v">${money(d.monthRevenue)}</div></div>
        <div class="stat"><div class="k">Month COGS</div><div class="v">${money(d.monthCogs)}</div></div>
        <div class="stat"><div class="k">Gross profit</div><div class="v pos">${money(d.monthGross)}</div></div>
        <div class="stat"><div class="k">Net income</div><div class="v ${d.monthNet < 0 ? 'neg' : 'pos'}">${money(d.monthNet)}</div></div>
        <div class="stat"><div class="k">Draft receipts</div><div class="v">${d.drafts}</div></div>
      </div>
      <div class="split-2">
        <div class="card">
          <div class="section-title">Recent receipts</div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Date</th><th>#</th><th>Customer</th><th>Status</th><th class="num">Total</th></tr></thead>
            <tbody>${
              receipts.length
                ? receipts
                    .map((r) => {
                      const t = r.totals || B().receiptTotals(r);
                      return `<tr class="click-row" data-open-receipt="${esc(r.id)}">
                        <td>${esc(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.customerName || '—')}</td>
                        <td><span class="badge ${r.status === 'finalized' ? 'badge-active' : 'badge-req'}">${esc(r.status)}</span></td>
                        <td class="num">${money(t.total)}</td></tr>`;
                    })
                    .join('')
                : '<tr><td colspan="5" class="muted">No receipts yet.</td></tr>'
            }</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="section-title">Open bills</div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Date</th><th>#</th><th>Vendor</th><th class="num">Balance</th></tr></thead>
            <tbody>${
              bills.length
                ? bills
                    .map(
                      (b) => `<tr class="click-row" data-open-bill="${esc(b.id)}">
                        <td>${esc(b.date)}</td><td>${esc(b.number)}</td><td>${esc(b.vendorName || '—')}</td>
                        <td class="num">${money(b.balance)}</td></tr>`
                    )
                    .join('')
                : '<tr><td colspan="4" class="muted">No open bills.</td></tr>'
            }</tbody>
          </table></div>
        </div>
      </div>`;
  }

  function receiptEditor(ctx, receipt) {
    const books = ctx.state.books;
    const locked = receipt.status === 'finalized' || receipt.status === 'void';
    const dis = locked ? ' disabled' : '';
    const t = B().receiptTotals(receipt);
    const lines = (receipt.lines || [])
      .map((ln, i) => {
        const labor = B().isLabor(ln.type);
        return `<div class="line">
          <div class="line-top"><span>Line ${i + 1}</span>
            ${locked ? '' : `<button type="button" class="icon-btn" data-rcpt-del="${i}">×</button>`}
          </div>
          <div class="grid grid-2">
            <div class="field"><label>Type</label>
              <select data-rcpt-line="${i}" data-f="type"${dis}>
                <option value="part"${ln.type === 'part' ? ' selected' : ''}>Part (taxable)</option>
                <option value="mech"${ln.type === 'mech' || ln.type === 'labor' ? ' selected' : ''}>Mechanical labor $90 (no tax)</option>
                <option value="body"${ln.type === 'body' ? ' selected' : ''}>Body labor $55 (no tax)</option>
              </select>
            </div>
            <div class="field"><label>${labor ? 'Hours' : 'Qty'}</label>
              <input data-rcpt-line="${i}" data-f="qty" type="number" step="0.01" value="${esc(ln.qty)}"${dis} /></div>
            <div class="field"><label>Description</label>
              <input data-rcpt-line="${i}" data-f="desc" value="${esc(ln.desc)}"${dis} /></div>
            <div class="field"><label>Part #</label>
              <input data-rcpt-line="${i}" data-f="pn" value="${esc(ln.pn || '')}"${dis}${labor ? ' disabled' : ''} /></div>
            <div class="field"><label>${labor ? 'Rate $/hr' : 'Unit price $'}</label>
              <input data-rcpt-line="${i}" data-f="rate" type="number" step="0.01" value="${esc(ln.rate)}"${dis} /></div>
            ${
              labor
                ? ''
                : `<div class="field"><label>Part cost $ (hidden on print)</label>
              <input data-rcpt-line="${i}" data-f="cost" type="number" step="0.01" value="${esc(ln.cost || 0)}"${dis} /></div>`
            }
            ${
              labor || locked
                ? ''
                : `<div class="field"><label>Fill from inventory</label>
              <select data-rcpt-pick="${i}">${partOptions(books, ln.pn)}</select></div>`
            }
          </div>
        </div>`;
      })
      .join('');

    return `
      <div class="receipt-app">
        <aside class="receipt-editor">
          <h2>Receipt builder</h2>
          <p class="hint">Tax applies to parts only. Labor is never taxed. Drafts do not post to the ledger.</p>
          <div class="grid grid-2">
            <div class="field"><label>Receipt #</label><input id="rcpt-no" value="${esc(receipt.number)}"${dis} /></div>
            <div class="field"><label>Date</label><input id="rcpt-date" type="date" value="${esc(receipt.date)}"${dis} /></div>
            <div class="field"><label>Customer</label>
              <select id="rcpt-cust"${dis}>${customerOptions(books, receipt.customerId, true)}</select></div>
            <div class="field"><label>Customer name</label>
              <input id="rcpt-cust-name" value="${esc(receipt.customerName || '')}"${dis} /></div>
            <div class="field"><label>Payment method</label>
              <select id="rcpt-method"${dis}>
                ${optionList(['cash', 'check', 'card', 'on_account'], receipt.paymentMethod || 'cash', {
                  cash: showCodes ? 'Cash (bank)' : 'Cash',
                  check: showCodes ? 'Check (bank)' : 'Check',
                  card: showCodes ? 'Card (bank)' : 'Card',
                  on_account: showCodes ? 'On account / invoice (AR)' : 'On account / invoice'
                })}
              </select></div>
            <div class="field"><label>Bank account</label>
              ${bankSelectHtml(ctx, receipt.bankId, 'rcpt-bank', Boolean(dis))}</div>
            <div class="field"><label>Check No.</label>
              <input id="rcpt-check" value="${esc(receipt.checkNumber || '')}"${dis} placeholder="—" /></div>
            <div class="field"><label>Payment note</label><input id="rcpt-pay" value="${esc(receipt.paymentNote || '')}"${dis} /></div>
            <div class="field"><label>Vehicle</label><input id="rcpt-vehicle" value="${esc(receipt.vehicle || '')}" placeholder="Year / Make / Model"${dis} /></div>
            <div class="field"><label>RO #</label><input id="rcpt-ro" value="${esc(receipt.ro || '')}"${dis} /></div>
            <div class="field"><label>Mechanical labor ($/hr)</label>
              <input id="rcpt-mech" type="number" step="0.01" value="${esc(receipt.mechRate)}"${dis} /></div>
            <div class="field"><label>Body labor ($/hr)</label>
              <input id="rcpt-body" type="number" step="0.01" value="${esc(receipt.bodyRate)}"${dis} /></div>
            <div class="field"><label>Parts tax rate (%)</label>
              <input id="rcpt-tax" type="number" step="0.01" value="${esc(receipt.taxRate)}"${dis} /></div>
            <div class="field"><label>Status</label>
              <input value="${esc(receipt.status)}" readonly /></div>
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary" id="rcpt-add-part"${dis}>+ Part</button>
            <button type="button" class="btn btn-secondary" id="rcpt-add-mech"${dis}>+ Mech labor $90</button>
            <button type="button" class="btn btn-secondary" id="rcpt-add-body"${dis}>+ Body labor $55</button>
          </div>
          <div id="rcpt-lines">${lines || '<p class="hint">Add parts or labor.</p>'}</div>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary" id="rcpt-save"${dis}>Save draft</button>
            <button type="button" class="btn btn-primary" id="rcpt-finalize"${dis}>${showCodes ? 'Finalize &amp; post' : 'Finalize receipt'}</button>
            <button type="button" class="btn btn-secondary" id="rcpt-pdf">Download PDF</button>
            <button type="button" class="btn btn-danger" id="rcpt-print">Print</button>
          </div>
          <p class="hint">Parts ${money(t.parts)} · Labor ${money(t.labor)} · Tax ${money(t.tax)} · Total ${money(t.total)} · Est. cost ${money(t.cost)}</p>
        </aside>
        <div class="receipt-preview-wrap">
          <div class="receipt-paper" id="receipt">${B().receiptInnerHtml(receipt, books.company)}</div>
        </div>
      </div>`;
  }

  function renderAr(ctx) {
    const u = ui(ctx.state);
    const books = ctx.state.books;
    const bar = tabs(
      [
        ['receipts', 'Receipt builder'],
        ['customers', 'Customers'],
        ['jobs', 'Jobs / RO'],
        ['invoices', 'Open invoices'],
        ['payments', 'Payments received']
      ],
      u.arTab,
      'data-ar-tab'
    );
    if (u.arTab === 'customers') {
      const rows = (books.customers || [])
        .map(
          (c) => `<tr>
            <td>${esc(c.name)}</td><td>${esc(c.phone || '')}</td><td>${esc(c.email || '')}</td><td>${esc(c.terms || '')}</td>
            <td><button class="btn btn-sm btn-secondary" data-edit-cust="${esc(c.id)}">Edit</button></td></tr>`
        )
        .join('');
      return `${bar}
        <div class="card">
          <div class="section-title">Add customer</div>
          <div class="grid grid-3">
            <div class="field"><label>Name</label><input id="cust-name" /></div>
            <div class="field"><label>Phone</label><input id="cust-phone" /></div>
            <div class="field"><label>Email</label><input id="cust-email" /></div>
            <div class="field span-2"><label>Address</label><input id="cust-addr" /></div>
            <div class="field"><label>Terms</label><input id="cust-terms" value="Due on receipt" /></div>
          </div>
          <div class="row-actions"><button class="btn btn-primary" id="cust-save">Save customer</button></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Terms</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="muted">No customers yet.</td></tr>'}</tbody>
        </table></div></div>`;
    }
    if (u.arTab === 'jobs') {
      const rows = (books.jobs || [])
        .slice()
        .reverse()
        .map((j) => {
          const cust = (books.customers || []).find((c) => c.id === j.customerId);
          return `<tr>
            <td>${esc(j.number)}</td><td>${esc(j.date)}</td><td>${esc((cust && cust.name) || '')}</td>
            <td>${esc(j.vehicle || '')}</td><td>${esc(j.status)}</td>
            <td>${(j.receiptIds || []).length}</td></tr>`;
        })
        .join('');
      return `${bar}
        <div class="card">
          <div class="section-title">New repair order</div>
          <div class="grid grid-3">
            <div class="field"><label>RO #</label><input id="job-no" placeholder="Assigned if blank" /></div>
            <div class="field"><label>Date</label><input id="job-date" type="date" value="${esc(B().todayIso())}" /></div>
            <div class="field"><label>Customer</label><select id="job-cust">${customerOptions(books, '', false)}</select></div>
            <div class="field span-2"><label>Vehicle</label><input id="job-vehicle" /></div>
            <div class="field"><label>Status</label>
              <select id="job-status">${optionList(['open', 'closed'], 'open')}</select></div>
          </div>
          <div class="row-actions"><button class="btn btn-primary" id="job-save">Save RO</button></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>RO #</th><th>Date</th><th>Customer</th><th>Vehicle</th><th>Status</th><th>Receipts</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="muted">No jobs yet.</td></tr>'}</tbody>
        </table></div></div>`;
    }
    if (u.arTab === 'invoices') {
      const aging = B().arAging(books);
      const rows = aging.rows
        .map(
          (r) => `<tr>
            <td>${esc(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.customerName || '')}</td>
            <td>${esc(r.bucket)}</td><td class="num">${money(r.balance)}</td>
            <td><button class="btn btn-sm btn-primary" data-pay-invoice="${esc(r.id)}">Receive payment</button></td></tr>`
        )
        .join('');
      return `${bar}
        <div class="stats">
          <div class="stat"><div class="k">Current</div><div class="v">${money(aging.current)}</div></div>
          <div class="stat"><div class="k">31–60</div><div class="v">${money(aging.d31)}</div></div>
          <div class="stat"><div class="k">61–90</div><div class="v">${money(aging.d61)}</div></div>
          <div class="stat"><div class="k">90+</div><div class="v">${money(aging.d91)}</div></div>
          <div class="stat"><div class="k">Total AR</div><div class="v">${money(aging.total)}</div></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Bucket</th><th class="num">Balance</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="muted">No open invoices.</td></tr>'}</tbody>
        </table></div></div>`;
    }
    if (u.arTab === 'payments') {
      const rows = (books.payments || [])
        .slice()
        .reverse()
        .map(
          (p) => `<tr><td>${esc(p.date)}</td><td>${esc(p.receiptNo)}</td><td>${esc(p.method)}</td><td class="num">${money(p.amount)}</td><td>${esc(p.memo || '')}</td></tr>`
        )
        .join('');
      return `${bar}
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th class="num">Amount</th><th>Memo</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="muted">No payments recorded.</td></tr>'}</tbody>
        </table></div></div>`;
    }

    const list = (books.receipts || [])
      .slice()
      .reverse()
      .map(
        (r) => `<button type="button" class="list-pill${r.id === u.receiptId ? ' is-active' : ''}" data-open-receipt="${esc(r.id)}">
          ${esc(r.number)} · ${esc(r.status)}${r.customerName ? ' · ' + esc(r.customerName) : ''}</button>`
      )
      .join('');
    if (!currentReceipt(ctx) && books.receipts && books.receipts[0]) {
      ui(ctx.state).receiptId = books.receipts[0].id;
    }
    const receipt = currentReceipt(ctx);
    return `${bar}
      <div class="toolbar" style="margin:12px 0">
        <button type="button" class="btn btn-primary" id="rcpt-new">New receipt</button>
        <div class="pill-row">${list || '<span class="muted">No saved receipts yet.</span>'}</div>
      </div>
      ${receipt ? receiptEditor(ctx, receipt) : '<div class="card empty"><strong>No receipt selected</strong>Create one to start a draft. Drafts do not post.</div>'}`;
  }

  function renderAp(ctx) {
    const u = ui(ctx.state);
    const books = ctx.state.books;
    const bar = tabs(
      [
        ['bills', 'Enter / pay bills'],
        ['vendors', 'Vendors'],
        ['aging', 'Aging']
      ],
      u.apTab,
      'data-ap-tab'
    );
    if (u.apTab === 'vendors') {
      const rows = (books.vendors || [])
        .map(
          (v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.phone || '')}</td><td>${esc(v.email || '')}</td>
            <td><button class="btn btn-sm btn-secondary" data-edit-vend="${esc(v.id)}">Edit</button></td></tr>`
        )
        .join('');
      return `${bar}
        <div class="card">
          <div class="section-title">Add vendor</div>
          <div class="grid grid-3">
            <div class="field"><label>Name</label><input id="vend-name" /></div>
            <div class="field"><label>Phone</label><input id="vend-phone" /></div>
            <div class="field"><label>Email</label><input id="vend-email" /></div>
            <div class="field span-3"><label>Address</label><input id="vend-addr" /></div>
          </div>
          <div class="row-actions"><button class="btn btn-primary" id="vend-save">Save vendor</button></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="muted">No vendors yet.</td></tr>'}</tbody>
        </table></div></div>`;
    }
    if (u.apTab === 'aging') {
      const aging = B().apAging(books);
      const rows = aging.rows
        .map(
          (b) => `<tr><td>${esc(b.date)}</td><td>${esc(b.number)}</td><td>${esc(b.vendorName || '')}</td>
            <td>${esc(b.dueDate || '')}</td><td>${esc(b.bucket)}</td><td class="num">${money(b.balance)}</td></tr>`
        )
        .join('');
      return `${bar}
        <div class="stats">
          <div class="stat"><div class="k">Current</div><div class="v">${money(aging.current)}</div></div>
          <div class="stat"><div class="k">31–60</div><div class="v">${money(aging.d31)}</div></div>
          <div class="stat"><div class="k">61–90</div><div class="v">${money(aging.d61)}</div></div>
          <div class="stat"><div class="k">90+</div><div class="v">${money(aging.d91)}</div></div>
          <div class="stat"><div class="k">Total AP</div><div class="v">${money(aging.total)}</div></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Date</th><th>Bill</th><th>Vendor</th><th>Due</th><th>Bucket</th><th class="num">Balance</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="muted">No open bills.</td></tr>'}</tbody>
        </table></div></div>`;
    }

    const bill = currentBill(ctx);
    const list = (books.bills || [])
      .slice()
      .reverse()
      .map(
        (b) => `<button type="button" class="list-pill${b.id === u.billId ? ' is-active' : ''}" data-open-bill="${esc(b.id)}">
          ${esc(b.number)} · ${esc(b.status)}${b.vendorName ? ' · ' + esc(b.vendorName) : ''}</button>`
      )
      .join('');
    const locked = bill && bill.status === 'posted';
    const dis = locked ? ' disabled' : '';
    const lines = ((bill && bill.lines) || [])
      .map((ln, i) => {
        const parts = ln.kind === 'parts';
        return `<div class="line">
          <div class="line-top"><span>Line ${i + 1}</span>
            ${locked ? '' : `<button type="button" class="icon-btn" data-bill-del="${i}">×</button>`}</div>
          <div class="grid grid-3">
            <div class="field"><label>Kind</label>
              <select data-bill-line="${i}" data-f="kind"${dis}>
                <option value="expense"${!parts ? ' selected' : ''}>Operating expense</option>
                <option value="parts"${parts ? ' selected' : ''}>Parts purchase</option>
              </select></div>
            <div class="field"><label>Description</label>
              <input data-bill-line="${i}" data-f="desc" value="${esc(ln.desc || '')}"${dis} /></div>
            ${
              parts
                ? `<div class="field"><label>Part #</label><input data-bill-line="${i}" data-f="pn" value="${esc(ln.pn || '')}"${dis} /></div>
                   <div class="field"><label>Qty</label><input data-bill-line="${i}" data-f="qty" type="number" step="0.01" value="${esc(ln.qty || 1)}"${dis} /></div>
                   <div class="field"><label>Unit cost $</label><input data-bill-line="${i}" data-f="amount" type="number" step="0.01" value="${esc(ln.amount || 0)}"${dis} /></div>
                   <div class="field"><label>Sell price $</label><input data-bill-line="${i}" data-f="sellPrice" type="number" step="0.01" value="${esc(ln.sellPrice || 0)}"${dis} /></div>
                   <div class="field"><label>Stock into 1200</label>
                     <select data-bill-line="${i}" data-f="stocked"${dis}>
                       <option value="yes"${ln.stocked !== false ? ' selected' : ''}>Yes — Dr 1200</option>
                       <option value="no"${ln.stocked === false ? ' selected' : ''}>No — expense/COGS</option>
                     </select></div>`
                : `<div class="field"><label>Expense account</label>
                     <select data-bill-line="${i}" data-f="account"${dis}>${accountOptions(books, ln.account || '6400', { types: ['opex'] })}</select></div>
                   <div class="field"><label>Amount $</label>
                     <input data-bill-line="${i}" data-f="amount" type="number" step="0.01" value="${esc(ln.amount || 0)}"${dis} /></div>`
            }
          </div>
        </div>`;
      })
      .join('');

    return `${bar}
      <div class="toolbar" style="margin:12px 0">
        <button type="button" class="btn btn-primary" id="bill-new">New bill</button>
        <div class="pill-row">${list || '<span class="muted">No bills yet.</span>'}</div>
      </div>
      <div class="card">
        <div class="section-title">${bill ? esc(bill.number) : 'New bill'} ${bill ? `· ${esc(bill.status)}` : ''}</div>
        <div class="grid grid-3">
          <div class="field"><label>Bill #</label><input id="bill-no" value="${esc((bill && bill.number) || '')}"${dis} /></div>
          <div class="field"><label>Date</label><input id="bill-date" type="date" value="${esc((bill && bill.date) || B().todayIso())}"${dis} /></div>
          <div class="field"><label>Due date</label><input id="bill-due" type="date" value="${esc((bill && bill.dueDate) || '')}"${dis} /></div>
          <div class="field"><label>Vendor</label><select id="bill-vend"${dis}>${vendorOptions(books, bill && bill.vendorId)}</select></div>
          <div class="field"><label>Vendor name</label><input id="bill-vend-name" value="${esc((bill && bill.vendorName) || '')}"${dis} /></div>
          <div class="field"><label>Ref</label><input id="bill-ref" value="${esc((bill && bill.ref) || '')}"${dis} /></div>
          <div class="field"><label>Pay immediately from bank</label>
            <select id="bill-paidnow"${dis}>${optionList(['no', 'yes'], bill && bill.paidNow ? 'yes' : 'no')}</select></div>
          <div class="field"><label>Bank account</label>
            ${bankSelectHtml(ctx, bill && bill.bankId, 'bill-bank', Boolean(dis))}</div>
          <div class="field"><label>Check No.</label>
            <input id="bill-check" value="${esc((bill && bill.checkNumber) || '')}"${dis} placeholder="—" /></div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary" id="bill-add-exp"${dis}>+ Expense line</button>
          <button type="button" class="btn btn-secondary" id="bill-add-part"${dis}>+ Parts line</button>
        </div>
        ${lines || '<p class="hint">Add expense or parts lines.</p>'}
        <div class="row-actions">
          <button type="button" class="btn btn-secondary" id="bill-save"${dis}>Save draft</button>
          <button type="button" class="btn btn-primary" id="bill-post"${dis}>${showCodes ? 'Post bill' : 'Save and post bill'}</button>
          ${
            bill && bill.status === 'posted' && Number(bill.balance) > 0
              ? `<button type="button" class="btn btn-primary" id="bill-pay">Pay ${money(bill.balance)}</button>`
              : ''
          }
        </div>
        <p class="hint">${showCodes ? 'Parts purchases debit 1200 when stocked. Operating bills debit the expense account you choose. Drafts do not post.' : 'Parts bills add to inventory. Expense bills use the category you pick. Drafts do not post.'}</p>
      </div>`;
  }

  function renderGl(ctx) {
    const u = ui(ctx.state);
    const books = ctx.state.books;
    const bar = tabs(
      [
        ['accounts', 'Chart of accounts'],
        ['journal', 'Journal'],
        ['ledger', 'Account ledger'],
        ['trial', 'Trial balance'],
        ['reconcile', 'Reconcile']
      ],
      u.glTab,
      'data-gl-tab'
    );
    if (u.glTab === 'accounts') {
      const rows = B()
        .sortAccounts(books.accounts)
        .map((a) => {
          const bal = B().signedBalance(books, a.code);
          return `<tr>${showCodes ? `<td>${esc(a.code)}</td>` : ''}<td>${esc(a.name)}</td><td>${esc(a.type)}</td>
            <td>${a.system ? 'System' : 'Custom'}</td><td class="num">${money(bal)}</td></tr>`;
        })
        .join('');
      return `${bar}
        <div class="card">
          <div class="section-title">Add account</div>
          <div class="grid grid-3">
            <div class="field"><label>Number</label><input id="acct-code" placeholder="6950" /></div>
            <div class="field"><label>Name</label><input id="acct-name" /></div>
            <div class="field"><label>Type</label>
              <select id="acct-type">${optionList(['asset', 'contra-asset', 'liability', 'equity', 'revenue', 'cogs', 'opex'], 'opex')}</select></div>
          </div>
          <div class="row-actions"><button class="btn btn-primary" id="acct-add">Add account</button></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr>${showCodes ? '<th>Code</th>' : ''}<th>Name</th><th>Type</th><th></th><th class="num">Balance</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div></div>`;
    }
    if (u.glTab === 'journal') {
      const entries = (books.journal || []).slice().reverse();
      const rows = entries
        .map((j) => {
          const lines = (j.lines || [])
            .map(
              (ln) => `<tr class="jnl-line">
                <td></td><td></td><td>${esc(showCodes ? ln.account + ' ' : '')}${esc((B().accountByCode(books, ln.account) || {}).name || '')}</td>
                <td>${esc(ln.memo || '')}</td>
                <td class="num">${ln.debit ? money(ln.debit) : ''}</td>
                <td class="num">${ln.credit ? money(ln.credit) : ''}</td></tr>`
            )
            .join('');
          return `<tr class="${j.reversedBy ? 'muted' : ''}">
              <td>${esc(j.date)}</td><td>${esc(j.number)}</td><td colspan="2">${esc(j.memo)}${j.reversedBy ? ' (reversed)' : ''}</td>
              <td></td><td></td></tr>${lines}`;
        })
        .join('');
      return `${bar}
        <div class="card expert-only">
          <div class="section-title">Manual journal</div>
          <div class="grid grid-2">
            <div class="field"><label>Date</label><input id="jnl-date" type="date" value="${esc(B().todayIso())}" /></div>
            <div class="field"><label>Memo</label><input id="jnl-memo" /></div>
          </div>
          <div id="jnl-lines">
            ${journalLineEditor(ctx, '1000')}
            ${journalLineEditor(ctx, '6900')}
          </div>
          <div class="row-actions">
            <button class="btn btn-secondary" id="jnl-add-line">+ Line</button>
            <button class="btn btn-primary" id="jnl-post">Post journal</button>
          </div>
          <p class="hint">Debits must equal credits. Draft receipts and clocks never appear here.</p>
        </div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Date</th><th>#</th><th>Account</th><th>Memo</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="muted">No posted entries.</td></tr>'}</tbody>
        </table></div></div>`;
    }
    if (u.glTab === 'ledger') {
      const code = u.ledgerAccount || '1000';
      const act = B().accountActivity(books, code);
      const rows = act.rows
        .map(
          (r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.memo)}</td>
            <td class="num">${r.debit ? money(r.debit) : ''}</td>
            <td class="num">${r.credit ? money(r.credit) : ''}</td></tr>`
        )
        .join('');
      return `${bar}
        <div class="card">
          <div class="toolbar">
            <div class="field"><label>Account</label>
              <select id="led-acct">${accountOptions(books, code)}</select></div>
            <div class="stat"><div class="k">Balance</div><div class="v">${money(act.balance)}</div></div>
          </div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Date</th><th>#</th><th>Memo</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" class="muted">No activity.</td></tr>'}</tbody>
          </table></div>
        </div>`;
    }
    if (u.glTab === 'reconcile') {
      return `${bar}${renderReconcile(ctx)}`;
    }
    const tb = B().trialBalance(books);
    const rows = tb.rows
      .map(
        (r) => `<tr>${showCodes ? `<td>${esc(r.code)}</td>` : ''}<td>${esc(r.name)}</td>
          <td class="num">${r.debit ? money(r.debit) : ''}</td>
          <td class="num">${r.credit ? money(r.credit) : ''}</td></tr>`
      )
      .join('');
    return `${bar}
      <div class="card">
        <p class="hint">${tb.balanced ? 'In balance.' : 'OUT OF BALANCE — no new posts should be possible until this is fixed.'}</p>
        <div class="table-wrap"><table class="data">
          <thead><tr>${showCodes ? '<th>Code</th>' : ''}<th>Account</th><th class="num">Debits</th><th class="num">Credits</th></tr></thead>
          <tbody>${rows}
            <tr>${showCodes ? '<td></td>' : ''}<td><strong>Total</strong></td><td class="num"><strong>${money(tb.debit)}</strong></td>
              <td class="num"><strong>${money(tb.credit)}</strong></td></tr>
          </tbody>
        </table></div>
      </div>`;
  }

  function journalLineEditor(ctx, defaultAcct) {
    const books = ctx.state.books;
    const bankOpts = Bank()
      ? `<option value="">—</option>${Bank().bankOptionsHtml(books, '', isExpert(ctx))}`
      : '<option value="">—</option>';
    return `<div class="grid grid-4 jnl-edit">
      <div class="field"><label>Account</label><select class="jnl-acct">${accountOptions(books, defaultAcct)}</select></div>
      <div class="field"><label>Debit</label><input class="jnl-dr" type="number" step="0.01" /></div>
      <div class="field"><label>Credit</label><input class="jnl-cr" type="number" step="0.01" /></div>
      <div class="field"><label>Line memo</label><input class="jnl-lm" /></div>
      <div class="field"><label>Bank (cash lines)</label><select class="jnl-bank">${bankOpts}</select></div>
      <div class="field"><label>Check No.</label><input class="jnl-check" placeholder="—" /></div>
      <div class="field"><label>Payee</label><input class="jnl-payee" /></div>
    </div>`;
  }

  function renderReconcile(ctx) {
    if (!Bank()) return '<div class="card empty"><strong>Banking module missing.</strong></div>';
    const books = ctx.state.books;
    Bank().ensureBanks(books);
    const u = ui(ctx.state);
    const expert = isExpert(ctx);
    const bankId = currentBankId(ctx, u.reconBankId);
    u.reconBankId = bankId;
    const bank = Bank().bankById(books, bankId);
    const open = (books.reconciliations || []).find((r) => r.bankId === bankId && r.status === 'open');
    const closed = (books.reconciliations || [])
      .filter((r) => r.bankId === bankId && r.status === 'closed')
      .sort((a, b) => String(b.statementDate).localeCompare(String(a.statementDate)));
    let recon = (books.reconciliations || []).find((r) => r.id === u.reconId);
    if (!recon || recon.bankId !== bankId) recon = open || null;
    if (recon) u.reconId = recon.id;
    const beginPrefill = bank ? Bank().beginningBalance(books, bank) : 0;
    const history = closed
      .map((r) => {
        const reopen =
          expert && Bank().canReopen(books, r)
            ? `<button class="btn btn-sm btn-secondary" data-recon-reopen="${esc(r.id)}">Reopen</button>`
            : '';
        return `<tr>
          <td>${esc(r.statementDate)}</td>
          <td class="num">${money(r.statementBalance)}</td>
          <td class="num">${money(r.difference)}</td>
          <td>Closed</td>
          <td>
            <button class="btn btn-sm btn-secondary" data-recon-view="${esc(r.id)}">View</button>
            <button class="btn btn-sm btn-secondary" data-recon-report="${esc(r.id)}">Report</button>
            ${reopen}
          </td>
        </tr>`;
      })
      .join('');

    if (!recon) {
      return `
        <div class="card">
          <div class="section-title">Bank reconciliation</div>
          <div class="grid grid-3">
            <div class="field"><label>Bank account</label>
              ${bankSelectHtml(ctx, bankId, 'recon-bank')}</div>
            <div class="field"><label>Statement date</label>
              <input id="recon-new-date" type="date" value="${esc(B().todayIso())}" /></div>
            <div class="field"><label>Beginning (from last closed)</label>
              <input value="${esc(money(beginPrefill))}" readonly /></div>
          </div>
          <p class="hint">Opening book balance is the first-recon beginning. It is not posted to the ledger. Uncleared items roll forward.</p>
          <div class="row-actions">
            <button class="btn btn-primary" id="recon-start">Start reconciliation</button>
          </div>
        </div>
        <div class="card">
          <div class="section-title">Closed reconciliations</div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Statement date</th><th class="num">Statement</th><th class="num">Difference</th><th>Status</th><th></th></tr></thead>
            <tbody>${history || '<tr><td colspan="5" class="muted">None yet.</td></tr>'}</tbody>
          </table></div>
        </div>`;
    }

    const locked = recon.status === 'closed';
    const tot = Bank().reconTotals(books, bank, recon);
    const dis = locked ? ' disabled' : '';
    const checked = new Set(recon.clearedKeys || []);
    const rows = tot.items
      .map((ln) => {
        const on = checked.has(ln.key);
        return `<tr>
          <td><input type="checkbox" data-recon-clear="${esc(ln.key)}"${on ? ' checked' : ''}${dis} /></td>
          <td>${esc(ln.date)}</td>
          <td>${esc(ln.type)}</td>
          <td>${esc(ln.payee)}</td>
          <td>${esc(ln.checkNo || '')}</td>
          <td class="num">${money(ln.amount)}</td>
          ${expert ? `<td>${esc(bank.glAccount || '')}</td>` : ''}
        </tr>`;
      })
      .join('');
    const atts = (recon.attachments || [])
      .map(
        (a) => `<li class="recon-att">
          <span>${esc(a.name)}</span>
          <span>
            <button class="btn btn-sm btn-secondary" data-recon-open="${esc(a.storedName)}">Open</button>
            ${
              locked
                ? ''
                : `<button class="btn btn-sm btn-secondary" data-recon-delatt="${esc(a.storedName)}">Remove</button>`
            }
          </span>
        </li>`
      )
      .join('');
    const diffClass = Math.abs(tot.difference) < 0.005 ? 'pos' : 'neg';
    const last4 = bank.last4 ? `••••${bank.last4}` : '—';
    return `
      <div class="card">
        <div class="section-title">${esc(bank.name)} · ${esc(Bank().BANK_TYPES[bank.type] || '')} · ${esc(last4)}${
          locked ? ' · Closed (read-only)' : ''
        }</div>
        <div class="grid grid-3">
          <div class="field"><label>Bank account</label>
            ${bankSelectHtml(ctx, bankId, 'recon-bank')}</div>
          <div class="field"><label>Statement date</label>
            <input id="recon-date" type="date" value="${esc(recon.statementDate || '')}"${dis} /></div>
          <div class="field"><label>Statement ending balance</label>
            <input id="recon-end" type="number" step="0.01" value="${esc(recon.statementBalance)}"${dis} /></div>
          <div class="field"><label>Beginning balance</label>
            <input value="${esc(tot.beginning.toFixed(2))}" readonly /></div>
          ${expert ? `<div class="field"><label>Linked GL</label><input value="${esc(bank.glAccount || '')}" readonly /></div>` : ''}
        </div>
        <div class="stats">
          <div class="stat"><div class="k">Book balance</div><div class="v">${money(tot.bookBalance)}</div></div>
          <div class="stat"><div class="k">Statement</div><div class="v">${money(tot.statementBalance)}</div></div>
          <div class="stat"><div class="k">Cleared in</div><div class="v">${money(tot.clearedIn)}</div></div>
          <div class="stat"><div class="k">Cleared out</div><div class="v">${money(tot.clearedOut)}</div></div>
          <div class="stat"><div class="k">Difference</div><div class="v ${diffClass}">${money(tot.difference)}</div></div>
        </div>
        <p class="hint">Check off items that appear on the statement through ${esc(
          recon.statementDate || ''
        )}. Uncleared items roll to the next recon. Finish requires a $0.00 difference${
          expert ? ' unless you post an adjustment' : ''
        }.</p>
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th></th><th>Date</th><th>Type</th><th>Payee</th><th>Check</th><th class="num">Amount</th>
            ${expert ? '<th>GL</th>' : ''}
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">No uncleared book transactions through this statement date.</td></tr>'}</tbody>
        </table></div>
        <div class="section-title" style="margin-top:18px">Attachments</div>
        <p class="hint">PDF, JPG, or PNG. Copied into AppData under this recon. Kept after Finish.</p>
        <ul class="recon-atts">${atts || '<li class="muted">No attachments.</li>'}</ul>
        <div class="row-actions">
          ${locked ? '' : `<button class="btn btn-secondary" id="recon-attach">Attach file</button>`}
          ${
            locked
              ? `<button class="btn btn-secondary" data-recon-report="${esc(recon.id)}">Report</button>
                 <button class="btn btn-primary" id="recon-next">Start next reconciliation</button>`
              : `<button class="btn btn-primary" id="recon-finish">Finish</button>
                 ${
                   expert
                     ? `<button class="btn btn-secondary" id="recon-finish-diff">Finish with difference</button>`
                     : ''
                 }`
          }
        </div>
      </div>
      <div class="card">
        <div class="section-title">Closed reconciliations</div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Statement date</th><th class="num">Statement</th><th class="num">Difference</th><th>Status</th><th></th></tr></thead>
          <tbody>${history || '<tr><td colspan="5" class="muted">None yet.</td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  function cashGlOptions(ctx, selected) {
    if (!Bank()) return accountOptions(ctx.state.books, selected || '1000', { types: ['asset'] });
    const list = Bank().cashGlAccounts(ctx.state.books);
    return list
      .map((a) => {
        const label = showCodes ? `${a.code} ${a.name}` : a.name;
        return `<option value="${esc(a.code)}"${a.code === selected ? ' selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
  }

  function renderBankingSettings(ctx) {
    if (!ctx.state.books || !Bank()) return '';
    showCodes = isExpert(ctx);
    Bank().ensureBanks(ctx.state.books);
    const expert = isExpert(ctx);
    const u = ui(ctx.state);
    const editing = (ctx.state.books.banks || []).find((b) => b.id === u.bankEditId) || Bank().defaultBank();
    const isNew = !u.bankEditId;
    const rows = (ctx.state.books.banks || [])
      .map((b) => {
        const last4 = b.last4 ? `••••${b.last4}` : '—';
        return `<tr>
          <td>${esc(b.name)}</td>
          <td>${esc(Bank().BANK_TYPES[b.type] || b.type)}</td>
          <td>${esc(b.bankName || '—')}</td>
          <td>${esc(last4)}</td>
          ${expert ? `<td>${esc(b.glAccount)}</td>` : ''}
          <td class="num">${money(b.openingBalance)}</td>
          <td><button class="btn btn-sm btn-secondary" data-edit-bank="${esc(b.id)}">Edit</button></td>
        </tr>`;
      })
      .join('');
    return `
    <div class="card">
      <div class="section-title">Banking</div>
      <p class="hint">Last 4 digits only — never a full account number. Linked GL is 1000 Cash or another cash account you add on the chart. Opening book balance is the first-recon beginning; it is not posted again to the ledger.</p>
      <div class="grid grid-3">
        <div class="field"><label>Account name</label>
          <input id="bank-name" value="${esc(isNew ? '' : editing.name)}" placeholder="Shop checking" /></div>
        <div class="field"><label>Type</label>
          <select id="bank-type">${optionList(
            ['checking', 'savings', 'credit'],
            isNew ? 'checking' : editing.type,
            Bank().BANK_TYPES
          )}</select></div>
        <div class="field"><label>Bank name</label>
          <input id="bank-inst" value="${esc(isNew ? '' : editing.bankName)}" placeholder="Truist" /></div>
        <div class="field"><label>Last 4 digits</label>
          <input id="bank-last4" inputmode="numeric" maxlength="4" value="${esc(isNew ? '' : editing.last4)}" placeholder="1234" /></div>
        <div class="field"><label>Opening book balance</label>
          <input id="bank-open" type="number" step="0.01" value="${esc(isNew ? '0' : editing.openingBalance)}" /></div>
        <div class="field"><label>Opening date</label>
          <input id="bank-opendate" type="date" value="${esc(isNew ? '' : editing.openingDate)}" /></div>
        <div class="field"><label>Linked GL</label>
          <select id="bank-gl">${cashGlOptions(ctx, isNew ? '1000' : editing.glAccount)}</select></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-primary" id="bank-save">${isNew ? 'Add bank account' : 'Save bank account'}</button>
        ${isNew ? '' : '<button class="btn btn-secondary" id="bank-new">Add another</button>'}
      </div>
      <div class="table-wrap" style="margin-top:16px"><table class="data">
        <thead><tr>
          <th>Name</th><th>Type</th><th>Bank</th><th>Last 4</th>
          ${expert ? '<th>GL</th>' : ''}
          <th class="num">Opening</th><th></th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">No bank accounts yet.</td></tr>'}</tbody>
      </table></div>
    </div>`;
  }

  function renderInventory(ctx) {
    const books = ctx.state.books;
    const rows = (books.inventory || [])
      .map((p) => {
        const qty = B().qtyOnHand(p);
        const val = B().fifoValue(p);
        return `<tr>
          <td>${esc(p.partNumber)}</td><td>${esc(p.description)}</td>
          <td class="num">${qty}</td>
          ${showCodes ? `<td class="num">${money(B().avgCost(p))}</td>` : ''}
          <td class="num">${money(p.sellPrice)}</td>
          ${showCodes ? `<td class="num">${money(val)}</td>` : ''}
          <td><button class="btn btn-sm btn-secondary" data-inv-hist="${esc(p.partNumber)}">History</button></td></tr>`;
      })
      .join('');
    const histPn = ctx.state.booksUi.histPn;
    const item = histPn ? B().findPart(books, histPn) : null;
    const hist = item
      ? (item.history || [])
          .slice()
          .reverse()
          .map(
            (h) => `<tr><td>${esc(h.date)}</td><td>${esc(h.type)}</td><td class="num">${h.qty}</td>
              <td class="num">${money(h.cost)}</td><td>${esc(h.ref || '')}</td><td>${esc(h.receiptNo || '')}</td></tr>`
          )
          .join('')
      : '';
    return `
      <div class="card">
        <div class="section-title">Receive parts</div>
        <div class="grid grid-4">
          <div class="field"><label>Part #</label><input id="inv-pn" /></div>
          <div class="field"><label>Description</label><input id="inv-desc" /></div>
          <div class="field"><label>Qty</label><input id="inv-qty" type="number" step="0.01" /></div>
          <div class="field"><label>Unit cost $</label><input id="inv-cost" type="number" step="0.01" /></div>
          <div class="field"><label>Sell price $</label><input id="inv-sell" type="number" step="0.01" /></div>
          <div class="field"><label>Date</label><input id="inv-date" type="date" value="${esc(B().todayIso())}" /></div>
        </div>
        <div class="row-actions">
          <button class="btn btn-primary" id="inv-recv">${showCodes ? 'Receive (Dr 1200 / Cr 1000)' : 'Receive parts (pay cash)'}</button>
          <button class="btn btn-secondary" id="inv-adj">Quantity adjust</button>
        </div>
        <p class="hint">${showCodes ? 'Receiving here pays cash (Dr 1200 / Cr 1000). FIFO layers are used when a receipt is finalized.' : 'Receiving here pays cash. To buy on account, enter a bill. Parts come off inventory when you finalize a receipt.'}</p>
      </div>
      <div class="card"><div class="table-wrap"><table class="data">
        <thead><tr><th>Part #</th><th>Description</th><th class="num">Qty</th>${showCodes ? '<th class="num">FIFO cost</th>' : ''}<th class="num">Price</th>${showCodes ? '<th class="num">Value</th>' : ''}<th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">No parts yet.</td></tr>'}</tbody>
      </table></div></div>
      ${
        item && showCodes
          ? `<div class="card expert-only"><div class="section-title">FIFO / history · ${esc(item.partNumber)}</div>
              <div class="table-wrap"><table class="data">
                <thead><tr><th>Date</th><th>Type</th><th class="num">Qty</th><th class="num">Cost</th><th>Ref</th><th>Receipt #</th></tr></thead>
                <tbody>${hist || '<tr><td colspan="6" class="muted">No history.</td></tr>'}</tbody>
              </table></div></div>`
          : ''
      }`;
  }

  function plTable(pl) {
    const block = (title, group, negate) => {
      const rows = (group.rows || [])
        .map((r) => `<tr><td>${esc(showCodes ? r.code + ' ' : '')}${esc(r.name)}</td><td class="num">${money(r.balance)}</td></tr>`)
        .join('');
      return `<tr><td><strong>${esc(title)}</strong></td><td class="num"><strong>${money(group.total)}</strong></td></tr>${rows}`;
    };
    return `<table class="data">
      <tbody>
        ${block('Revenue', pl.revenue)}
        ${block('COGS', pl.cogs)}
        <tr><td><strong>Gross profit</strong></td><td class="num"><strong>${money(pl.grossProfit)}</strong></td></tr>
        ${block('Operating expenses', pl.opex)}
        <tr><td><strong>Net income</strong></td><td class="num"><strong>${money(pl.netIncome)}</strong></td></tr>
      </tbody>
    </table>`;
  }

  function renderBooksReports(ctx) {
    const u = ui(ctx.state);
    const books = ctx.state.books;
    const from = u.reportFrom;
    const to = u.reportTo;
    const pl = B().profitAndLoss(books, from, to);
    const bs = B().balanceSheet(books, to);
    const tax = B().signedBalance(books, '2100', to);
    const liab = B().payrollLiabilities(books, to);
    const ar = B().arAging(books, to);
    const ap = B().apAging(books, to);
    const register = B().receiptRegister(books, from, to);
    const regRows = register
      .map((r) => {
        const t = r.totals || B().receiptTotals(r);
        return `<tr><td>${esc(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.customerName || '')}</td>
          <td class="num">${money(t.parts)}</td><td class="num">${money(t.labor)}</td>
          <td class="num">${money(t.tax)}</td><td class="num">${money(t.total)}</td></tr>`;
      })
      .join('');
    return `
      <div class="card">
        <div class="toolbar">
          <div class="field"><label>From</label><input id="rep-from" type="date" value="${esc(from)}" /></div>
          <div class="field"><label>To / as of</label><input id="rep-to" type="date" value="${esc(to)}" /></div>
          <button class="btn btn-secondary" id="rep-apply">Apply range</button>
          <button class="btn btn-primary" id="rep-pdf">Download shop books PDF</button>
        </div>
        <p class="hint">Revenue − COGS = gross profit, then operating expenses, then net income. Drafts are excluded.</p>
      </div>
      <div class="card"><div class="section-title">Profit &amp; loss</div>${plTable(pl)}</div>
      <div class="card"><div class="section-title">Balance sheet as of ${esc(to)}</div>
        <div class="split-2">
          <table class="data"><thead><tr><th>Assets</th><th class="num">Amount</th></tr></thead>
            <tbody>${bs.assets.rows.map((r) => `<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${money(r.balance)}</td></tr>`).join('')}
              ${bs.contra.rows.map((r) => `<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">(${money(r.balance)})</td></tr>`).join('')}
              <tr><td><strong>Total assets</strong></td><td class="num"><strong>${money(bs.netAssets)}</strong></td></tr></tbody></table>
          <table class="data"><thead><tr><th>Liabilities &amp; equity</th><th class="num">Amount</th></tr></thead>
            <tbody>${bs.liabilities.rows.map((r) => `<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${money(r.balance)}</td></tr>`).join('')}
              ${bs.equity.rows.map((r) => `<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${money(r.balance)}</td></tr>`).join('')}
              <tr><td>Net income (current)</td><td class="num">${money(bs.netIncome)}</td></tr>
              <tr><td><strong>Total liab. &amp; equity</strong></td><td class="num"><strong>${money(bs.liabEq)}</strong></td></tr></tbody></table>
        </div>
        <p class="hint">${bs.balanced ? 'Balance sheet is in balance.' : 'Balance sheet is out of balance.'}</p>
      </div>
      <div class="card"><div class="section-title">Sales tax owed (2100)</div><p class="stat"><span class="v">${money(tax)}</span></p></div>
      <div class="card"><div class="section-title">Payroll liabilities</div>
        <table class="data"><tbody>${liab.rows.map((r) => `<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="num">${money(r.balance)}</td></tr>`).join('')}
          <tr><td><strong>Total</strong></td><td class="num"><strong>${money(liab.total)}</strong></td></tr></tbody></table>
      </div>
      <div class="split-2">
        <div class="card"><div class="section-title">AR aging</div>
          <p>Current ${money(ar.current)} · 31–60 ${money(ar.d31)} · 61–90 ${money(ar.d61)} · 90+ ${money(ar.d91)} · Total ${money(ar.total)}</p></div>
        <div class="card"><div class="section-title">AP aging</div>
          <p>Current ${money(ap.current)} · 31–60 ${money(ap.d31)} · 61–90 ${money(ap.d61)} · 90+ ${money(ap.d91)} · Total ${money(ap.total)}</p></div>
      </div>
      <div class="card"><div class="section-title">Receipt register</div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Date</th><th>#</th><th>Customer</th><th class="num">Parts</th><th class="num">Labor</th><th class="num">Tax</th><th class="num">Total</th></tr></thead>
          <tbody>${regRows || '<tr><td colspan="7" class="muted">No finalized receipts in this range.</td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  function gatherReceipt(ctx, existing) {
    const custSel = document.getElementById('rcpt-cust');
    const custId = custSel ? custSel.value : existing.customerId;
    const cust = (ctx.state.books.customers || []).find((c) => c.id === custId);
    const nameEl = document.getElementById('rcpt-cust-name');
    const lines = [];
    document.querySelectorAll('[data-rcpt-line][data-f="type"]').forEach((sel) => {
      const i = Number(sel.getAttribute('data-rcpt-line'));
      const get = (f) => {
        const el = document.querySelector(`[data-rcpt-line="${i}"][data-f="${f}"]`);
        return el ? el.value : '';
      };
      const type = sel.value;
      lines[i] = {
        type,
        qty: Number(get('qty')) || 0,
        desc: get('desc'),
        pn: B().isLabor(type) ? '' : get('pn'),
        rate: Number(get('rate')) || 0,
        cost: B().isLabor(type) ? 0 : Number(get('cost')) || 0
      };
    });
    return {
      ...existing,
      number: (document.getElementById('rcpt-no') || {}).value || existing.number,
      date: (document.getElementById('rcpt-date') || {}).value || existing.date,
      customerId: custId || '',
      customerName: (nameEl && nameEl.value) || (cust && cust.name) || '',
      paymentMethod: (document.getElementById('rcpt-method') || {}).value || 'cash',
      bankId: (document.getElementById('rcpt-bank') || {}).value || '',
      checkNumber: (document.getElementById('rcpt-check') || {}).value || '',
      paymentNote: (document.getElementById('rcpt-pay') || {}).value || '',
      vehicle: (document.getElementById('rcpt-vehicle') || {}).value || '',
      ro: (document.getElementById('rcpt-ro') || {}).value || '',
      mechRate: Number((document.getElementById('rcpt-mech') || {}).value) || 90,
      bodyRate: Number((document.getElementById('rcpt-body') || {}).value) || 55,
      taxRate: Number((document.getElementById('rcpt-tax') || {}).value) || 0,
      lines: lines.filter(Boolean)
    };
  }

  function gatherBill(ctx, existing) {
    const vendId = (document.getElementById('bill-vend') || {}).value || '';
    const vend = (ctx.state.books.vendors || []).find((v) => v.id === vendId);
    const lines = [];
    document.querySelectorAll('[data-bill-line][data-f="kind"]').forEach((sel) => {
      const i = Number(sel.getAttribute('data-bill-line'));
      const get = (f) => {
        const el = document.querySelector(`[data-bill-line="${i}"][data-f="${f}"]`);
        return el ? el.value : '';
      };
      const kind = sel.value;
      const stockedVal = get('stocked');
      lines[i] = {
        kind,
        desc: get('desc'),
        pn: get('pn'),
        qty: kind === 'parts' ? Number(get('qty')) || 0 : 1,
        amount: Number(get('amount')) || 0,
        sellPrice: Number(get('sellPrice')) || 0,
        account: get('account') || (kind === 'parts' ? '1200' : '6400'),
        stocked: stockedVal !== 'no'
      };
    });
    return {
      ...(existing || B().newBill(ctx.state.books)),
      number: (document.getElementById('bill-no') || {}).value,
      date: (document.getElementById('bill-date') || {}).value,
      dueDate: (document.getElementById('bill-due') || {}).value,
      vendorId: vendId,
      vendorName: (document.getElementById('bill-vend-name') || {}).value || (vend && vend.name) || '',
      ref: (document.getElementById('bill-ref') || {}).value || '',
      paidNow: (document.getElementById('bill-paidnow') || {}).value === 'yes',
      bankId: (document.getElementById('bill-bank') || {}).value || '',
      checkNumber: (document.getElementById('bill-check') || {}).value || '',
      lines: lines.filter(Boolean)
    };
  }

  async function saveCurrentReceipt(ctx, extra) {
    const cur = currentReceipt(ctx) || B().newReceipt(ctx.state.books);
    const row = { ...gatherReceipt(ctx, cur), ...(extra || {}) };
    const res = B().saveReceiptDraft(ctx.state.books, row);
    if (!res.ok) {
      ctx.toast(res.error, 'err');
      return null;
    }
    ui(ctx.state).receiptId = res.receipt.id;
    await commit(ctx, res.books);
    return res.receipt;
  }

  function bindAr(ctx) {
    const root = document.getElementById('view-root');
    root.querySelectorAll('[data-ar-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).arTab = btn.getAttribute('data-ar-tab');
        ctx.renderAll();
      });
    });
    const newBtn = document.getElementById('rcpt-new');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        const rec = B().newReceipt(ctx.state.books);
        const res = B().saveReceiptDraft(ctx.state.books, rec);
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).receiptId = res.receipt.id;
        ui(ctx.state).arTab = 'receipts';
        await commit(ctx, res.books);
      });
    }
    root.querySelectorAll('[data-open-receipt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).receiptId = btn.getAttribute('data-open-receipt');
        ui(ctx.state).arTab = 'receipts';
        ctx.state.view = 'ar';
        ctx.renderAll();
      });
    });
    const add = async (type) => {
      const cur = currentReceipt(ctx) || B().newReceipt(ctx.state.books);
      const row = gatherReceipt(ctx, cur);
      const rate = type === 'body' ? row.bodyRate : type === 'mech' ? row.mechRate : 0;
      row.lines.push({
        type,
        qty: 1,
        desc: type === 'body' ? 'Body labor' : type === 'mech' ? 'Mechanical labor' : 'Part',
        pn: '',
        rate: type === 'part' ? 0 : rate,
        cost: 0
      });
      const res = B().saveReceiptDraft(ctx.state.books, row);
      if (!res.ok) return ctx.toast(res.error, 'err');
      ui(ctx.state).receiptId = res.receipt.id;
      await commit(ctx, res.books);
    };
    const addPart = document.getElementById('rcpt-add-part');
    if (addPart) addPart.addEventListener('click', () => add('part'));
    const addMech = document.getElementById('rcpt-add-mech');
    if (addMech) addMech.addEventListener('click', () => add('mech'));
    const addBody = document.getElementById('rcpt-add-body');
    if (addBody) addBody.addEventListener('click', () => add('body'));
    root.querySelectorAll('[data-rcpt-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cur = gatherReceipt(ctx, currentReceipt(ctx));
        cur.lines.splice(Number(btn.getAttribute('data-rcpt-del')), 1);
        const res = B().saveReceiptDraft(ctx.state.books, cur);
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books);
      });
    });
    root.querySelectorAll('[data-rcpt-pick]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const pn = sel.value;
        if (!pn) return;
        const part = B().findPart(ctx.state.books, pn);
        if (!part) return;
        const i = Number(sel.getAttribute('data-rcpt-pick'));
        const cur = gatherReceipt(ctx, currentReceipt(ctx));
        cur.lines[i] = {
          ...cur.lines[i],
          type: 'part',
          pn: part.partNumber,
          desc: part.description,
          rate: part.sellPrice,
          cost: B().avgCost(part)
        };
        const res = B().saveReceiptDraft(ctx.state.books, cur);
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books);
      });
    });
    const cust = document.getElementById('rcpt-cust');
    if (cust) {
      cust.addEventListener('change', () => {
        const found = (ctx.state.books.customers || []).find((c) => c.id === cust.value);
        const name = document.getElementById('rcpt-cust-name');
        if (found && name) name.value = found.name;
      });
    }
    const mech = document.getElementById('rcpt-mech');
    if (mech) {
      mech.addEventListener('input', () => {
        const r = Number(mech.value) || 0;
        document.querySelectorAll('[data-rcpt-line][data-f="type"]').forEach((sel) => {
          if (sel.value === 'mech' || sel.value === 'labor') {
            const rate = document.querySelector(`[data-rcpt-line="${sel.getAttribute('data-rcpt-line')}"][data-f="rate"]`);
            if (rate) rate.value = r;
          }
        });
      });
    }
    const body = document.getElementById('rcpt-body');
    if (body) {
      body.addEventListener('input', () => {
        const r = Number(body.value) || 0;
        document.querySelectorAll('[data-rcpt-line][data-f="type"]').forEach((sel) => {
          if (sel.value === 'body') {
            const rate = document.querySelector(`[data-rcpt-line="${sel.getAttribute('data-rcpt-line')}"][data-f="rate"]`);
            if (rate) rate.value = r;
          }
        });
      });
    }
    const save = document.getElementById('rcpt-save');
    if (save) save.addEventListener('click', () => saveCurrentReceipt(ctx).then((r) => r && ctx.toast('Draft saved. Not posted.', 'ok')));
    const fin = document.getElementById('rcpt-finalize');
    if (fin) {
      fin.addEventListener('click', async () => {
        const saved = await saveCurrentReceipt(ctx);
        if (!saved) return;
        const res = B().finalizeReceipt(ctx.state.books, saved.id);
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books, `Finalized ${saved.number} and posted to the ledger.`);
      });
    }
    const pdf = document.getElementById('rcpt-pdf');
    if (pdf) {
      pdf.addEventListener('click', async () => {
        const cur = currentReceipt(ctx);
        if (!cur) return;
        const html = B().receiptDocumentHtml(gatherReceipt(ctx, cur), ctx.state.books.company);
        const res = await ctx.api.saveReceiptPdf({ html, fileName: `${cur.number || 'receipt'}.pdf` });
        if (res && res.ok) ctx.toast('Receipt PDF saved in receipts folder.', 'ok');
        else ctx.toast((res && res.message) || 'Could not create PDF.', 'err');
      });
    }
    const printBtn = document.getElementById('rcpt-print');
    if (printBtn) {
      printBtn.addEventListener('click', async () => {
        const cur = currentReceipt(ctx);
        if (!cur) return;
        const html = B().receiptDocumentHtml(gatherReceipt(ctx, cur), ctx.state.books.company);
        await ctx.api.printHtml(html);
      });
    }
    const custSave = document.getElementById('cust-save');
    if (custSave) {
      custSave.addEventListener('click', async () => {
        const res = B().upsertParty(ctx.state.books, 'customer', {
          id: ui(ctx.state).customerId || '',
          name: document.getElementById('cust-name').value,
          phone: document.getElementById('cust-phone').value,
          email: document.getElementById('cust-email').value,
          address: document.getElementById('cust-addr').value,
          terms: document.getElementById('cust-terms').value
        });
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).customerId = '';
        await commit(ctx, res.books, 'Customer saved.');
      });
    }
    root.querySelectorAll('[data-edit-cust]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = (ctx.state.books.customers || []).find((x) => x.id === btn.getAttribute('data-edit-cust'));
        if (!c) return;
        ui(ctx.state).customerId = c.id;
        document.getElementById('cust-name').value = c.name || '';
        document.getElementById('cust-phone').value = c.phone || '';
        document.getElementById('cust-email').value = c.email || '';
        document.getElementById('cust-addr').value = c.address || '';
        document.getElementById('cust-terms').value = c.terms || '';
      });
    });
    const jobSave = document.getElementById('job-save');
    if (jobSave) {
      jobSave.addEventListener('click', async () => {
        const res = B().upsertJob(ctx.state.books, {
          number: document.getElementById('job-no').value,
          date: document.getElementById('job-date').value,
          customerId: document.getElementById('job-cust').value,
          vehicle: document.getElementById('job-vehicle').value,
          status: document.getElementById('job-status').value
        });
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books, 'Repair order saved.');
      });
    }
    root.querySelectorAll('[data-pay-invoice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rec = (ctx.state.books.receipts || []).find((r) => r.id === btn.getAttribute('data-pay-invoice'));
        if (!rec) return;
        const choice = await ctx.modal({
          title: `Receive payment · ${esc(rec.number)}`,
          body: `<p>Open balance ${money(rec.balance)}</p>
            <div class="field"><label>Amount</label><input id="modal-input" type="number" step="0.01" value="${esc(rec.balance)}" /></div>
            <div class="field"><label>Bank account</label>
              ${bankSelectHtml(ctx, rec.bankId, 'modal-bank')}</div>
            <div class="field"><label>Check No.</label><input id="modal-check" placeholder="—" /></div>
            <div class="field"><label>Date</label><input id="modal-date" type="date" value="${esc(B().todayIso())}" /></div>`,
          buttons: [
            { id: 'cancel', label: 'Cancel' },
            { id: 'ok', label: 'Post payment', primary: true }
          ]
        });
        if (!choice || choice === 'cancel' || choice.id === 'cancel') return;
        const res = B().receiveArPayment(ctx.state.books, {
          receiptId: rec.id,
          amount: choice.value,
          date: choice.date || B().todayIso(),
          method: 'cash',
          bankId: choice.bankId || '',
          checkNumber: choice.checkNumber || ''
        });
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books, 'Payment posted.');
      });
    });
  }

  function bindAp(ctx) {
    const root = document.getElementById('view-root');
    root.querySelectorAll('[data-ap-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).apTab = btn.getAttribute('data-ap-tab');
        ctx.renderAll();
      });
    });
    const vendSave = document.getElementById('vend-save');
    if (vendSave) {
      vendSave.addEventListener('click', async () => {
        const res = B().upsertParty(ctx.state.books, 'vendor', {
          id: ui(ctx.state).vendorId || '',
          name: document.getElementById('vend-name').value,
          phone: document.getElementById('vend-phone').value,
          email: document.getElementById('vend-email').value,
          address: document.getElementById('vend-addr').value
        });
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).vendorId = '';
        await commit(ctx, res.books, 'Vendor saved.');
      });
    }
    root.querySelectorAll('[data-edit-vend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = (ctx.state.books.vendors || []).find((x) => x.id === btn.getAttribute('data-edit-vend'));
        if (!v) return;
        ui(ctx.state).vendorId = v.id;
        document.getElementById('vend-name').value = v.name || '';
        document.getElementById('vend-phone').value = v.phone || '';
        document.getElementById('vend-email').value = v.email || '';
        document.getElementById('vend-addr').value = v.address || '';
      });
    });
    const billNew = document.getElementById('bill-new');
    if (billNew) {
      billNew.addEventListener('click', async () => {
        const bill = B().newBill(ctx.state.books);
        const res = B().saveBillDraft(ctx.state.books, bill);
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).billId = res.bill.id;
        await commit(ctx, res.books);
      });
    }
    root.querySelectorAll('[data-open-bill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).billId = btn.getAttribute('data-open-bill');
        ui(ctx.state).apTab = 'bills';
        ctx.state.view = 'ap';
        ctx.renderAll();
      });
    });
    const addExp = document.getElementById('bill-add-exp');
    if (addExp) {
      addExp.addEventListener('click', async () => {
        const row = gatherBill(ctx, currentBill(ctx));
        row.lines.push({ kind: 'expense', account: '6400', desc: '', qty: 1, amount: 0, pn: '', stocked: true });
        const res = B().saveBillDraft(ctx.state.books, row);
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).billId = res.bill.id;
        await commit(ctx, res.books);
      });
    }
    const addPart = document.getElementById('bill-add-part');
    if (addPart) {
      addPart.addEventListener('click', async () => {
        const row = gatherBill(ctx, currentBill(ctx));
        row.lines.push({ kind: 'parts', account: '1200', desc: '', qty: 1, amount: 0, pn: '', stocked: true, sellPrice: 0 });
        const res = B().saveBillDraft(ctx.state.books, row);
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).billId = res.bill.id;
        await commit(ctx, res.books);
      });
    }
    root.querySelectorAll('[data-bill-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = gatherBill(ctx, currentBill(ctx));
        row.lines.splice(Number(btn.getAttribute('data-bill-del')), 1);
        const res = B().saveBillDraft(ctx.state.books, row);
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books);
      });
    });
    const vendSel = document.getElementById('bill-vend');
    if (vendSel) {
      vendSel.addEventListener('change', () => {
        const v = (ctx.state.books.vendors || []).find((x) => x.id === vendSel.value);
        const name = document.getElementById('bill-vend-name');
        if (v && name) name.value = v.name;
      });
    }
    const save = document.getElementById('bill-save');
    if (save) {
      save.addEventListener('click', async () => {
        const row = gatherBill(ctx, currentBill(ctx));
        const res = B().saveBillDraft(ctx.state.books, row);
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).billId = res.bill.id;
        await commit(ctx, res.books, 'Bill draft saved. Not posted.');
      });
    }
    const post = document.getElementById('bill-post');
    if (post) {
      post.addEventListener('click', async () => {
        const row = gatherBill(ctx, currentBill(ctx));
        const saved = B().saveBillDraft(ctx.state.books, row);
        if (!saved.ok) return ctx.toast(saved.error, 'err');
        ui(ctx.state).billId = saved.bill.id;
        ctx.state.books = saved.books;
        const res = B().postBill(ctx.state.books, saved.bill.id);
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books, 'Bill posted to the ledger.');
      });
    }
    const pay = document.getElementById('bill-pay');
    if (pay) {
      pay.addEventListener('click', async () => {
        const bill = currentBill(ctx);
        if (!bill) return;
        const choice = await ctx.modal({
          title: `Pay bill ${esc(bill.number)}`,
          body: `<p>Open balance ${money(bill.balance)}</p>
            <div class="field"><label>Amount</label><input id="modal-input" type="number" step="0.01" value="${esc(bill.balance)}" /></div>
            <div class="field"><label>Bank account</label>
              ${bankSelectHtml(ctx, bill.bankId, 'modal-bank')}</div>
            <div class="field"><label>Check No.</label><input id="modal-check" value="${esc(bill.checkNumber || '')}" placeholder="—" /></div>
            <div class="field"><label>Date</label><input id="modal-date" type="date" value="${esc(B().todayIso())}" /></div>`,
          buttons: [
            { id: 'cancel', label: 'Cancel' },
            { id: 'ok', label: 'Pay from bank', primary: true }
          ]
        });
        if (!choice || choice === 'cancel' || choice.id === 'cancel') return;
        const res = B().payBill(ctx.state.books, {
          billId: bill.id,
          amount: choice.value,
          date: choice.date || B().todayIso(),
          bankId: choice.bankId || '',
          checkNumber: choice.checkNumber || ''
        });
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books, 'Bill payment posted.');
      });
    }
  }

  function bindGl(ctx) {
    const root = document.getElementById('view-root');
    root.querySelectorAll('[data-gl-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).glTab = btn.getAttribute('data-gl-tab');
        ctx.renderAll();
      });
    });
    const add = document.getElementById('acct-add');
    if (add) {
      add.addEventListener('click', async () => {
        const res = B().addAccount(ctx.state.books, {
          code: document.getElementById('acct-code').value,
          name: document.getElementById('acct-name').value,
          type: document.getElementById('acct-type').value
        });
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books, 'Account added.');
      });
    }
    const led = document.getElementById('led-acct');
    if (led) {
      led.addEventListener('change', () => {
        ui(ctx.state).ledgerAccount = led.value;
        ctx.renderAll();
      });
    }
    const addLine = document.getElementById('jnl-add-line');
    if (addLine) {
      addLine.addEventListener('click', () => {
        const wrap = document.getElementById('jnl-lines');
        const holder = document.createElement('div');
        holder.innerHTML = journalLineEditor(ctx, '6900');
        wrap.appendChild(holder.firstElementChild);
      });
    }
    const post = document.getElementById('jnl-post');
    if (post) {
      post.addEventListener('click', async () => {
        const lines = [...document.querySelectorAll('.jnl-edit')].map((el) => {
          const bankId = el.querySelector('.jnl-bank') ? el.querySelector('.jnl-bank').value : '';
          const account = bankId && Bank() ? Bank().glForBank(ctx.state.books, bankId) : el.querySelector('.jnl-acct').value;
          return {
            account,
            debit: Number(el.querySelector('.jnl-dr').value) || 0,
            credit: Number(el.querySelector('.jnl-cr').value) || 0,
            memo: el.querySelector('.jnl-lm').value,
            bankId,
            checkNumber: el.querySelector('.jnl-check') ? el.querySelector('.jnl-check').value : '',
            payee: el.querySelector('.jnl-payee') ? el.querySelector('.jnl-payee').value : ''
          };
        });
        const books = B().clone(ctx.state.books);
        const res = B().postJournal(books, {
          date: document.getElementById('jnl-date').value,
          memo: document.getElementById('jnl-memo').value,
          source: 'manual',
          lines
        });
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, books, 'Journal posted.');
      });
    }
    bindReconcile(ctx);
  }

  function reconById(ctx, id) {
    return (ctx.state.books.reconciliations || []).find((r) => r.id === id) || null;
  }

  function showReconReport(ctx, recon, withItemsStart) {
    const modalRoot = document.getElementById('modal');
    const card = modalRoot.querySelector('.modal-card');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const actions = document.getElementById('modal-actions');
    card.classList.add('modal-wide');
    title.textContent = 'Reconciliation report';
    let withItems = Boolean(withItemsStart);
    const htmlNow = () =>
      Bank().reconReportHtml(ctx.state.books, recon, ctx.state.books.company, {
        withItems,
        expert: isExpert(ctx)
      });
    const paint = () => {
      body.innerHTML = `<label class="check-inline"><input type="checkbox" id="recon-rep-toggle"${
        withItems ? ' checked' : ''
      } /> With reconciled items (full line list). Off shows totals and leftover uncleared only.</label>
        <iframe class="recon-preview" title="Reconciliation report"></iframe>`;
      body.querySelector('iframe').srcdoc = htmlNow();
      body.querySelector('#recon-rep-toggle').addEventListener('change', (e) => {
        withItems = e.target.checked;
        paint();
      });
    };
    const close = () => {
      modalRoot.hidden = true;
      card.classList.remove('modal-wide');
      modalRoot.onclick = null;
    };
    actions.innerHTML = '';
    const addBtn = (label, primary, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'btn btn-primary' : 'btn btn-secondary';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    addBtn('Print', false, async () => {
      await ctx.api.printHtml(htmlNow());
    });
    addBtn('Save PDF', true, async () => {
      const fileName = `recon-${recon.statementDate || 'statement'}.pdf`;
      const res = await ctx.api.saveReportPdf({ html: htmlNow(), fileName, subdir: 'books' });
      if (res && res.ok) ctx.toast('Recon PDF saved in Reports.', 'ok');
      else ctx.toast((res && res.message) || 'Could not save PDF.', 'err');
    });
    addBtn('Close', false, close);
    modalRoot.onclick = (ev) => {
      if (ev.target.hasAttribute('data-modal-cancel')) close();
    };
    modalRoot.hidden = false;
    paint();
  }

  async function persistReconFields(ctx) {
    const reconId = ui(ctx.state).reconId;
    if (!reconId) return;
    const dateEl = document.getElementById('recon-date');
    const endEl = document.getElementById('recon-end');
    if (!dateEl || !endEl) return;
    const res = Bank().updateRecon(ctx.state.books, reconId, {
      statementDate: dateEl.value,
      statementBalance: endEl.value
    });
    if (!res.ok) return;
    ctx.state.books = res.books;
    await ctx.persistBooks();
  }

  function bindReconcile(ctx) {
    if (!Bank()) return;
    const bankSel = document.getElementById('recon-bank');
    if (bankSel) {
      bankSel.addEventListener('change', () => {
        ui(ctx.state).reconBankId = bankSel.value;
        ui(ctx.state).reconId = '';
        ctx.renderAll();
      });
    }
    const nextBtn = document.getElementById('recon-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        ui(ctx.state).reconId = '';
        ctx.renderAll();
      });
    }
    const start = document.getElementById('recon-start');
    if (start) {
      start.addEventListener('click', async () => {
        const bankId = (document.getElementById('recon-bank') || {}).value || currentBankId(ctx);
        const date = (document.getElementById('recon-new-date') || {}).value || B().todayIso();
        const res = Bank().openRecon(ctx.state.books, bankId, date);
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).reconBankId = bankId;
        ui(ctx.state).reconId = res.recon.id;
        await commit(ctx, res.books);
      });
    }
    const dateEl = document.getElementById('recon-date');
    const endEl = document.getElementById('recon-end');
    if (dateEl) dateEl.addEventListener('change', async () => persistReconFields(ctx).then(() => ctx.renderAll()));
    if (endEl) endEl.addEventListener('change', async () => persistReconFields(ctx).then(() => ctx.renderAll()));
    document.querySelectorAll('[data-recon-clear]').forEach((box) => {
      box.addEventListener('change', async () => {
        await persistReconFields(ctx);
        const res = Bank().toggleCleared(ctx.state.books, ui(ctx.state).reconId, box.getAttribute('data-recon-clear'));
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books);
      });
    });
    const finish = async (allowDifference) => {
      await persistReconFields(ctx);
      const res = Bank().finishRecon(ctx.state.books, ui(ctx.state).reconId, {
        expert: isExpert(ctx),
        allowDifference: Boolean(allowDifference),
        company: ctx.state.books.company
      });
      if (!res.ok) return ctx.toast(res.error, 'err');
      await commit(ctx, res.books, 'Reconciliation finished.');
      showReconReport(ctx, res.recon, isExpert(ctx));
    };
    const fin = document.getElementById('recon-finish');
    if (fin) fin.addEventListener('click', () => finish(false));
    const finDiff = document.getElementById('recon-finish-diff');
    if (finDiff) finDiff.addEventListener('click', () => finish(true));
    const attach = document.getElementById('recon-attach');
    if (attach) {
      attach.addEventListener('click', async () => {
        const reconId = ui(ctx.state).reconId;
        if (!reconId || !ctx.api.attachReconDocs) return;
        await persistReconFields(ctx);
        const picked = await ctx.api.attachReconDocs(reconId);
        if (!picked || picked.canceled || !picked.ok) {
          if (picked && picked.message) ctx.toast(picked.message, 'err');
          return;
        }
        let books = ctx.state.books;
        for (const file of picked.files || []) {
          const added = Bank().addAttachmentMeta(books, reconId, file);
          if (!added.ok) return ctx.toast(added.error, 'err');
          books = added.books;
        }
        await commit(ctx, books, 'Attachment saved.');
      });
    }
    document.querySelectorAll('[data-recon-open]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reconId = ui(ctx.state).reconId || btn.closest('[data-recon-id]');
        const id = ui(ctx.state).reconId;
        if (!id || !ctx.api.openReconDoc) return;
        const res = await ctx.api.openReconDoc({ reconId: id, storedName: btn.getAttribute('data-recon-open') });
        if (res && res.ok === false) ctx.toast(res.message || 'Could not open file.', 'err');
      });
    });
    document.querySelectorAll('[data-recon-delatt]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = ui(ctx.state).reconId;
        if (!id) return;
        const storedName = btn.getAttribute('data-recon-delatt');
        if (ctx.api.removeReconDoc) await ctx.api.removeReconDoc({ reconId: id, storedName });
        const res = Bank().removeAttachmentMeta(ctx.state.books, id, storedName);
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books, 'Attachment removed.');
      });
    });
    document.querySelectorAll('[data-recon-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const recon = reconById(ctx, btn.getAttribute('data-recon-view'));
        if (!recon) return;
        ui(ctx.state).reconId = recon.id;
        ui(ctx.state).reconBankId = recon.bankId;
        ctx.renderAll();
      });
    });
    document.querySelectorAll('[data-recon-report]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const recon = reconById(ctx, btn.getAttribute('data-recon-report'));
        if (recon) showReconReport(ctx, recon, isExpert(ctx));
      });
    });
    document.querySelectorAll('[data-recon-reopen]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = Bank().reopenRecon(ctx.state.books, btn.getAttribute('data-recon-reopen'));
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).reconId = res.recon.id;
        ui(ctx.state).reconBankId = res.recon.bankId;
        await commit(ctx, res.books, 'Reconciliation reopened.');
      });
    });
  }

  function bindBankingSettings(ctx) {
    if (!Bank() || !ctx.state.books) return;
    document.querySelectorAll('[data-edit-bank]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).bankEditId = btn.getAttribute('data-edit-bank');
        ctx.renderAll();
      });
    });
    const neu = document.getElementById('bank-new');
    if (neu) {
      neu.addEventListener('click', () => {
        ui(ctx.state).bankEditId = '';
        ctx.renderAll();
      });
    }
    const save = document.getElementById('bank-save');
    if (save) {
      save.addEventListener('click', async () => {
        const last4 = (document.getElementById('bank-last4') || {}).value || '';
        if (String(last4).replace(/\D/g, '').length > 4) {
          return ctx.toast('Last 4 digits only — never a full account number.', 'err');
        }
        const row = {
          id: ui(ctx.state).bankEditId || B().uid('bank'),
          name: (document.getElementById('bank-name') || {}).value,
          type: (document.getElementById('bank-type') || {}).value,
          bankName: (document.getElementById('bank-inst') || {}).value,
          last4,
          openingBalance: (document.getElementById('bank-open') || {}).value,
          openingDate: (document.getElementById('bank-opendate') || {}).value,
          glAccount: (document.getElementById('bank-gl') || {}).value
        };
        const res = Bank().upsertBank(ctx.state.books, row);
        if (!res.ok) return ctx.toast(res.error, 'err');
        ui(ctx.state).bankEditId = '';
        await commit(ctx, res.books, 'Bank account saved.');
      });
    }
  }

  function bindInventory(ctx) {
    const recv = document.getElementById('inv-recv');
    if (recv) {
      recv.addEventListener('click', async () => {
        const books = B().clone(ctx.state.books);
        const rec = B().receivePart(books, {
          partNumber: document.getElementById('inv-pn').value,
          description: document.getElementById('inv-desc').value,
          qty: document.getElementById('inv-qty').value,
          cost: document.getElementById('inv-cost').value,
          sellPrice: document.getElementById('inv-sell').value,
          date: document.getElementById('inv-date').value,
          source: 'manual-receive',
          ref: 'Inventory receive'
        });
        if (!rec.ok) return ctx.toast(rec.error, 'err');
        const posted = B().postJournal(books, {
          date: document.getElementById('inv-date').value,
          memo: `Receive ${rec.item.partNumber}`,
          source: 'inventory',
          sourceId: rec.item.id,
          lines: [
            { account: '1200', debit: rec.amount, credit: 0 },
            { account: '1000', debit: 0, credit: rec.amount }
          ]
        });
        if (!posted.ok) return ctx.toast(posted.error, 'err');
        await commit(ctx, books, 'Parts received.');
      });
    }
    const adj = document.getElementById('inv-adj');
    if (adj) {
      adj.addEventListener('click', async () => {
        const res = B().adjustPart(ctx.state.books, {
          partNumber: document.getElementById('inv-pn').value,
          qty: document.getElementById('inv-qty').value,
          cost: document.getElementById('inv-cost').value,
          date: document.getElementById('inv-date').value,
          memo: 'Quantity adjustment'
        });
        if (!res.ok) return ctx.toast(res.error, 'err');
        await commit(ctx, res.books, 'Inventory adjusted.');
      });
    }
    document.querySelectorAll('[data-inv-hist]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).histPn = btn.getAttribute('data-inv-hist');
        ctx.renderAll();
      });
    });
  }

  function bindDashboard(ctx) {
    const root = document.getElementById('view-root');
    root.querySelectorAll('[data-open-receipt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).receiptId = btn.getAttribute('data-open-receipt');
        ui(ctx.state).arTab = 'receipts';
        ctx.state.view = 'ar';
        ctx.renderAll();
      });
    });
    root.querySelectorAll('[data-open-bill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui(ctx.state).billId = btn.getAttribute('data-open-bill');
        ui(ctx.state).apTab = 'bills';
        ctx.state.view = 'ap';
        ctx.renderAll();
      });
    });
  }

  function bindBooksReports(ctx) {
    const apply = document.getElementById('rep-apply');
    if (apply) {
      apply.addEventListener('click', () => {
        ui(ctx.state).reportFrom = document.getElementById('rep-from').value;
        ui(ctx.state).reportTo = document.getElementById('rep-to').value;
        ctx.renderAll();
      });
    }
    const pdf = document.getElementById('rep-pdf');
    if (pdf) {
      pdf.addEventListener('click', async () => {
        const from = document.getElementById('rep-from').value;
        const to = document.getElementById('rep-to').value;
        ui(ctx.state).reportFrom = from;
        ui(ctx.state).reportTo = to;
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><style>
          body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#111}
          h1{font-size:18px} table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px}
          td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
          td.num,th.num{text-align:right}
        </style></head><body>${renderBooksReports(ctx)}</body></html>`;
        const res = await ctx.api.saveReportPdf({ html, fileName: `shop-books-${from}-to-${to}.pdf`, subdir: 'books' });
        if (res && res.ok) ctx.toast('Shop books PDF saved in Reports.', 'ok');
        else ctx.toast((res && res.message) || 'Could not create PDF.', 'err');
      });
    }
  }

  function render(ctx) {
    ui(ctx.state);
    showCodes = isExpert(ctx);
    const view = ctx.state.view;
    if (view === 'dashboard') return renderDashboard(ctx);
    if (view === 'ar') return renderAr(ctx);
    if (view === 'ap') return renderAp(ctx);
    if (view === 'gl') return renderGl(ctx);
    if (view === 'inventory') return renderInventory(ctx);
    return '';
  }

  function bind(ctx) {
    const view = ctx.state.view;
    if (view === 'dashboard') bindDashboard(ctx);
    if (view === 'ar') bindAr(ctx);
    if (view === 'ap') bindAp(ctx);
    if (view === 'gl') bindGl(ctx);
    if (view === 'inventory') bindInventory(ctx);
  }

  root.MooresBooksUi = {
    TITLES,
    render,
    bind,
    renderBooksReports,
    bindBooksReports,
    renderBankingSettings,
    bindBankingSettings,
    ui
  };
})(window);
