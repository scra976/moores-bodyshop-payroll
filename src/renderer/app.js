'use strict';

const api = window.mooresPayroll;
const tax = window.MooresTax;

const DEFAULT_ADDRESS = {
  street: '821 Kabrich Street',
  city: 'Blacksburg',
  state: 'VA',
  zip: '24060'
};

const TITLES = {
  employees: ['Employees', 'People you pay'],
  add: ['Add employee', 'New hire profile'],
  timeclocks: ['Time clocks', 'Wed–Tue punches · paid Wednesday'],
  payroll: ['Run payroll', 'Grouped by payday Wednesday'],
  settings: ['Settings', 'Data folder, backups, and updates']
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
  'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const state = {
  view: 'employees',
  data: null,
  settings: null,
  meta: null,
  selectedId: null,
  showArchived: false,
  profileDirty: false,
  addDraft: null,
  time: {
    employeeId: '',
    periodEnd: '',
    mode: 'punches',
    punches: [],
    vacationHours: '',
    holidayHours: ''
  },
  update: {
    phase: 'idle',
    info: null,
    message: '',
    percent: 0
  },
  ssnFocus: {}
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function formatSsn(value) {
  const d = digits(value).slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

function maskSsn(value) {
  const d = digits(value);
  if (!d) return '';
  if (d.length <= 4) return '•••-••-' + d;
  return '•••-••-' + d.slice(-4);
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '$0.00';
  return x.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function hoursFmt(n) {
  return tax.roundHours(n).toFixed(2);
}

function fullName(emp) {
  if (!emp) return '';
  return [emp.firstName, emp.middleInitial, emp.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function sortEmployees(list) {
  return [...(list || [])].sort((a, b) => {
    const ln = String(a.lastName || '').localeCompare(String(b.lastName || ''));
    if (ln) return ln;
    return String(a.firstName || '').localeCompare(String(b.firstName || ''));
  });
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isArchived(emp) {
  return Boolean(emp && emp.status === 'Archived');
}

function isActiveForPay(emp) {
  return Boolean(emp && emp.status !== 'Archived');
}

function activeEmployees() {
  return sortEmployees(state.data.employees).filter((e) => !isArchived(e));
}

function visibleEmployees() {
  const list = sortEmployees(state.data.employees);
  if (state.showArchived) return list;
  return list.filter((e) => !isArchived(e));
}

function currentPeriod() {
  return tax.currentPayPeriod(new Date());
}

function periodFromEnd(iso) {
  return tax.payPeriodFromDate(iso || currentPeriod().periodEnd);
}

function payweekPeriodEnd(w) {
  return (w && (w.periodEnd || w.weekEnding)) || '';
}

function payweekPayday(w) {
  if (w && w.payday) return w.payday;
  if (w && w.periodEnd) return tax.payPeriodFromDate(w.periodEnd).payday;
  return '';
}

function payweekPeriodLabel(w) {
  if (w && w.periodStart && w.periodEnd) return tax.formatPeriodLabel(w.periodStart, w.periodEnd);
  if (w && w.periodEnd) {
    const p = tax.payPeriodFromDate(w.periodEnd);
    return tax.formatPeriodLabel(p.periodStart, p.periodEnd);
  }
  return w && w.weekEnding ? w.weekEnding : '';
}

function hoursCell(w) {
  const parts = [];
  const reg = Number(w.regularHours);
  const vac = Number(w.vacationHours);
  const hol = Number(w.holidayHours);
  const ot = Number(w.otHours);
  if (reg) parts.push(hoursFmt(reg));
  if (vac) parts.push(`${hoursFmt(vac)} vac`);
  if (hol) parts.push(`${hoursFmt(hol)} holiday`);
  if (ot) parts.push(`${hoursFmt(ot)} OT`);
  if (parts.length) return parts.join(' + ');
  return hoursFmt(w.hours);
}

function ytdGrossBefore(emp, paydayIso, excludePeriodEnd) {
  const year = String(paydayIso || '').slice(0, 4);
  let sum = 0;
  for (const w of emp.payweeks || []) {
    if (excludePeriodEnd && payweekPeriodEnd(w) === excludePeriodEnd) continue;
    const pd = payweekPayday(w);
    if (!pd || pd.slice(0, 4) !== year) continue;
    if (paydayIso && pd >= paydayIso) continue;
    sum += Number(w.gross) || 0;
  }
  return tax.round2(sum);
}

function uid(prefix) {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function optionList(values, selected, labels) {
  return values
    .map((v) => {
      const label = labels && labels[v] != null ? labels[v] : v;
      return `<option value="${esc(v)}"${String(selected) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
    })
    .join('');
}

function emptyEmployee() {
  return {
    id: uid('emp'),
    firstName: '',
    middleInitial: '',
    lastName: '',
    email: '',
    phone: '',
    ssn: '',
    hireDate: todayISO(),
    address: { ...DEFAULT_ADDRESS },
    workLocationState: 'VA',
    jobTitle: '',
    department: '',
    employmentType: 'Full-time',
    manager: '',
    status: 'Active',
    filingStatus: 'single',
    payType: 'hourly',
    rate: '',
    payFrequency: 'weekly',
    vaWithhold: true,
    w4Step3Dependents: 0,
    extraFederal: 0,
    extraState: 0,
    multipleJobs: false,
    preTaxDeduction: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    vaE1: 0,
    vaE2: 0,
    paymentMethod: 'check',
    accountLast4: '',
    payweeks: []
  };
}

function selectedEmployee() {
  return (state.data.employees || []).find((e) => e.id === state.selectedId) || null;
}

function findEmployee(id) {
  return (state.data.employees || []).find((e) => e.id === id) || null;
}

function toast(message, kind) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast${kind ? ' ' + kind : ''}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3800);
}

function modal({ title, body, buttons }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title || 'Confirm';
    document.getElementById('modal-body').innerHTML = body || '';
    const actions = document.getElementById('modal-actions');
    actions.innerHTML = '';
    let settled = false;
    const finish = (id, value) => {
      if (settled) return;
      settled = true;
      root.hidden = true;
      root.removeEventListener('click', onBackdrop);
      resolve(value !== undefined ? { id, value } : id);
    };
    (buttons || [{ id: 'ok', label: 'OK', primary: true }]).forEach((btn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = btn.danger ? 'btn btn-danger' : btn.primary ? 'btn btn-primary' : 'btn btn-secondary';
      b.textContent = btn.label;
      b.addEventListener('click', () => {
        const inp = document.getElementById('modal-input');
        if (inp) finish(btn.id, inp.value);
        else finish(btn.id);
      });
      actions.appendChild(b);
    });
    const onBackdrop = (ev) => {
      if (ev.target.hasAttribute('data-modal-cancel')) finish('cancel');
    };
    root.addEventListener('click', onBackdrop);
    root.hidden = false;
    const inp = document.getElementById('modal-input');
    if (inp) {
      setTimeout(() => inp.focus(), 30);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish('ok', inp.value);
        }
      });
    }
  });
}

function lastNameMatches(typed, lastName) {
  return String(typed || '').trim().toLowerCase() === String(lastName || '').trim().toLowerCase();
}

async function confirmArchive(emp) {
  const name = fullName(emp) || 'this employee';
  const first = await modal({
    title: 'Archive employee',
    body: `Archive <strong>${esc(name)}</strong>? They will be hidden from payroll dropdowns.`,
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'continue', label: 'Continue', danger: true }
    ]
  });
  if (first !== 'continue') return false;
  const second = await modal({
    title: 'Type last name to confirm',
    body: `<p>Type <strong>${esc(emp.lastName || '')}</strong> to archive this employee.</p>
      <div class="field"><label>Last name</label><input id="modal-input" autocomplete="off" spellcheck="false" /></div>`,
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: 'Archive', danger: true }
    ]
  });
  if (!second || second.id === 'cancel') return false;
  if (!lastNameMatches(second.value, emp.lastName)) {
    toast('Last name did not match. Archive cancelled.', 'err');
    return false;
  }
  return true;
}

async function confirmPermanentDelete(emp) {
  const name = fullName(emp) || 'this employee';
  const first = await modal({
    title: 'Delete permanently',
    body: `Permanently delete <strong>${esc(name)}</strong>? Pay history is removed from the live file (automatic backups in the data folder remain).`,
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'continue', label: 'Continue', danger: true }
    ]
  });
  if (first !== 'continue') return false;
  const second = await modal({
    title: 'Type last name to delete',
    body: `<p>Type <strong>${esc(emp.lastName || '')}</strong> to permanently delete this employee.</p>
      <div class="field"><label>Last name</label><input id="modal-input" autocomplete="off" spellcheck="false" /></div>`,
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'ok', label: 'Delete permanently', danger: true }
    ]
  });
  if (!second || second.id === 'cancel') return false;
  if (!lastNameMatches(second.value, emp.lastName)) {
    toast('Last name did not match. Delete cancelled.', 'err');
    return false;
  }
  return true;
}

async function persist() {
  const res = await api.saveData(state.data);
  if (res && res.ok === false) {
    throw new Error('save failed');
  }
}

function setNav(view) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-nav') === view);
  });
  const pair = TITLES[view] || ['Payroll', ''];
  document.getElementById('page-title').textContent = pair[0];
  document.getElementById('page-sub').textContent = pair[1];
}

async function navigate(view, { skipDirty } = {}) {
  if (!skipDirty && state.view === 'employees' && state.profileDirty) {
    const choice = await modal({
      title: 'Unsaved changes',
      body: 'This employee profile has unsaved edits. Leave without saving?',
      buttons: [
        { id: 'cancel', label: 'Stay' },
        { id: 'leave', label: 'Discard', danger: true }
      ]
    });
    if (choice !== 'leave') return;
    state.profileDirty = false;
  }
  state.view = view;
  setNav(view);
  render();
}

function ssnField(id, stored, extraClass) {
  const focused = Boolean(state.ssnFocus[id]);
  const shown = focused ? formatSsn(stored) : maskSsn(stored);
  return `<input id="${esc(id)}" class="${esc(extraClass || '')}" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="11" value="${esc(shown)}" data-ssn-field="${esc(id)}" />`;
}

function bindSsn(id, getter, setter) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('focus', () => {
    state.ssnFocus[id] = true;
    input.value = formatSsn(getter());
  });
  input.addEventListener('blur', () => {
    state.ssnFocus[id] = false;
    setter(digits(input.value).slice(0, 9));
    input.value = maskSsn(getter());
  });
  input.addEventListener('input', () => {
    if (!state.ssnFocus[id]) return;
    const next = digits(input.value).slice(0, 9);
    setter(next);
    const caret = input.selectionStart;
    input.value = formatSsn(next);
    try {
      input.setSelectionRange(caret, caret);
    } catch {
      /* ignore */
    }
  });
}

function employeeOptions(selectedId, includeBlank, { forPay } = {}) {
  const source = forPay ? activeEmployees() : visibleEmployees();
  const rows = source.map((e) => {
    const label = `${e.lastName || ''}, ${e.firstName || ''}${e.middleInitial ? ' ' + e.middleInitial : ''}`.trim();
    const status = e.status && e.status !== 'Active' ? ` (${e.status})` : '';
    return `<option value="${esc(e.id)}"${e.id === selectedId ? ' selected' : ''}>${esc(label + status)}</option>`;
  });
  if (includeBlank) rows.unshift('<option value="">Select employee</option>');
  return rows.join('');
}

function renderEmployees() {
  const list = visibleEmployees();
  if (state.selectedId && !list.some((e) => e.id === state.selectedId)) {
    state.selectedId = list[0] ? list[0].id : null;
  }
  if (!state.selectedId && list[0]) state.selectedId = list[0].id;
  const emp = selectedEmployee();
  const archivedCount = (state.data.employees || []).filter(isArchived).length;

  if (!emp) {
    return `
      <div class="card empty">
        <strong>${state.showArchived ? 'No employees yet' : 'No active employees'}</strong>
        ${state.showArchived ? 'Add someone to start tracking time and pay.' : 'Turn on Show archived, or add a new employee.'}
        <div class="row-actions" style="justify-content:center">
          <label class="chip"><input type="checkbox" id="emp-show-archived"${state.showArchived ? ' checked' : ''} /> Show archived${archivedCount ? ` (${archivedCount})` : ''}</label>
          <button class="btn btn-primary" data-nav="add">Add employee</button>
        </div>
      </div>`;
  }

  const payweeks = [...(emp.payweeks || [])].sort((a, b) =>
    String(payweekPayday(a) || payweekPeriodEnd(a)).localeCompare(String(payweekPayday(b) || payweekPeriodEnd(b)))
  );
  let ytdGross = 0;
  let ytdNet = 0;
  const payweekRows = payweeks.length
    ? payweeks
        .map((w) => {
          ytdGross = tax.round2(ytdGross + (Number(w.gross) || 0));
          ytdNet = tax.round2(ytdNet + (Number(w.net) || 0));
          return `<tr>
            <td>${esc(payweekPeriodLabel(w))}</td>
            <td>${esc(payweekPayday(w) || '—')}</td>
            <td class="num">${esc(hoursCell(w))}</td>
            <td class="num">${money(w.gross)}</td>
            <td class="num">${money(w.federal)}</td>
            <td class="num">${money(w.ss)}</td>
            <td class="num">${money(w.medicare)}</td>
            <td class="num">${money(w.state)}</td>
            <td class="num">${money(w.net)}</td>
            <td class="num">${money(ytdGross)}</td>
            <td class="num">${money(ytdNet)}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="11" class="muted">No payweeks transferred yet.</td></tr>`;

  const statusBadge =
    emp.status === 'Archived'
      ? 'badge-archived'
      : emp.status === 'Terminated'
        ? 'badge-term'
        : emp.status === 'On leave'
          ? 'badge-leave'
          : 'badge-active';
  const archived = isArchived(emp);

  return `
    <div class="card">
      <div class="toolbar">
        <div class="field">
          <label for="emp-select">Employee</label>
          <select id="emp-select">${employeeOptions(emp.id, false)}</select>
        </div>
        <label class="chip"><input type="checkbox" id="emp-show-archived"${state.showArchived ? ' checked' : ''} /> Show archived${archivedCount ? ` (${archivedCount})` : ''}</label>
        <span class="badge ${statusBadge}">${esc(emp.status || 'Active')}</span>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Job details</div>
      <div class="grid grid-3">
        <div class="field"><label>Job title</label><input id="f-jobTitle" value="${esc(emp.jobTitle || '')}" /></div>
        <div class="field"><label>Department</label><input id="f-department" value="${esc(emp.department || '')}" /></div>
        <div class="field"><label>Employment type</label>
          <select id="f-employmentType">${optionList(['Full-time','Part-time','Seasonal','Contractor'], emp.employmentType || 'Full-time')}</select>
        </div>
        <div class="field"><label>Manager</label><input id="f-manager" value="${esc(emp.manager || '')}" /></div>
        <div class="field"><label>Status</label>
          ${
            archived
              ? `<input value="Archived" readonly />`
              : `<select id="f-status">${optionList(['Active','On leave','Terminated'], emp.status || 'Active')}</select>`
          }
        </div>
        <div class="field"><label>Hire date</label><input id="f-hireDate" type="date" value="${esc(emp.hireDate || '')}" /></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Personal &amp; W-2 / W-4</div>
      <div class="grid grid-name">
        <div class="field"><label>First name</label><input id="f-firstName" value="${esc(emp.firstName || '')}" /></div>
        <div class="field"><label>MI</label><input id="f-middleInitial" maxlength="1" value="${esc(emp.middleInitial || '')}" /></div>
        <div class="field"><label>Last name</label><input id="f-lastName" value="${esc(emp.lastName || '')}" /></div>
      </div>
      <div class="grid grid-3" style="margin-top:14px">
        <div class="field"><label>Email</label><input id="f-email" type="email" value="${esc(emp.email || '')}" /></div>
        <div class="field"><label>Mobile</label><input id="f-phone" value="${esc(emp.phone || '')}" /></div>
        <div class="field"><label>SSN</label>${ssnField('f-ssn', emp.ssn)}</div>
        <div class="field span-3"><label>Street</label><input id="f-street" value="${esc((emp.address && emp.address.street) || '')}" /></div>
        <div class="field"><label>City</label><input id="f-city" value="${esc((emp.address && emp.address.city) || '')}" /></div>
        <div class="field"><label>State</label><select id="f-state">${optionList(US_STATES, (emp.address && emp.address.state) || 'VA')}</select></div>
        <div class="field"><label>ZIP</label><input id="f-zip" value="${esc((emp.address && emp.address.zip) || '')}" /></div>
        <div class="field"><label>Work location state</label><select id="f-workState">${optionList(US_STATES, emp.workLocationState || 'VA')}</select></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Base pay <span class="badge badge-req">Required to pay</span></div>
      <div class="grid grid-3">
        <div class="field"><label>Pay type</label>
          <select id="f-payType">${optionList(['hourly','salary'], emp.payType || 'hourly', { hourly: 'Hourly', salary: 'Salary' })}</select>
        </div>
        <div class="field"><label id="f-rate-label">${emp.payType === 'salary' ? 'Annual salary' : 'Hourly rate'}</label>
          <input id="f-rate" type="number" min="0" step="0.01" value="${esc(emp.rate)}" />
        </div>
        <div class="field"><label>Pay frequency</label>
          <select id="f-payFrequency">${optionList(
            ['weekly','biweekly','semimonthly','monthly'],
            emp.payFrequency || 'weekly',
            { weekly: 'Weekly', biweekly: 'Biweekly', semimonthly: 'Semimonthly', monthly: 'Monthly' }
          )}</select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Tax withholdings</div>
      <div class="grid grid-3">
        <div class="field"><label>Federal filing status</label>
          <select id="f-filingStatus">${optionList(
            ['single','mfj','hoh'],
            emp.filingStatus || 'single',
            { single: 'Single or Married Filing Separately', mfj: 'Married Filing Jointly', hoh: 'Head of Household' }
          )}</select>
        </div>
        <div class="field"><label>Virginia / state withhold</label>
          <select id="f-vaWithhold">${optionList(['yes','exempt'], emp.vaWithhold === false ? 'exempt' : 'yes', { yes: 'Withhold VA', exempt: 'Exempt' })}</select>
        </div>
        <div class="field"><label>W-4 Step 3 dependents ($)</label>
          <input id="f-dependents" type="number" min="0" step="1" value="${esc(emp.w4Step3Dependents || 0)}" />
        </div>
        <div class="field"><label>Extra federal per period (added to calculated FIT)</label>
          <input id="f-extraFederal" type="number" min="0" step="0.01" value="${esc(emp.extraFederal || 0)}" />
        </div>
        <div class="field"><label>Extra state per period (added to calculated VA)</label>
          <input id="f-extraState" type="number" min="0" step="0.01" value="${esc(emp.extraState || 0)}" />
        </div>
        <div class="field"><label>Multiple jobs</label>
          <select id="f-multipleJobs">${optionList(['no','yes'], emp.multipleJobs ? 'yes' : 'no', { no: 'No', yes: 'Yes' })}</select>
        </div>
        <div class="field"><label>Pre-tax deduction per period</label>
          <input id="f-pretax" type="number" min="0" step="0.01" value="${esc(emp.preTaxDeduction || 0)}" />
        </div>
        <div class="field"><label>W-4 Step 4(a) other income (annual)</label>
          <input id="f-w4other" type="number" min="0" step="0.01" value="${esc(emp.w4OtherIncome || 0)}" />
        </div>
        <div class="field"><label>W-4 Step 4(b) deductions (annual)</label>
          <input id="f-w4deductions" type="number" min="0" step="0.01" value="${esc(emp.w4Deductions || 0)}" />
        </div>
        <div class="field"><label>VA-4 personal exemptions (E1)</label>
          <input id="f-vaE1" type="number" min="0" step="1" value="${esc(emp.vaE1 || 0)}" />
        </div>
        <div class="field"><label>VA-4 age/blind exemptions (E2)</label>
          <input id="f-vaE2" type="number" min="0" step="1" value="${esc(emp.vaE2 || 0)}" />
        </div>
      </div>
      <p class="disclaimer">Federal withholding per IRS Pub 15-T (2026) percentage method, Worksheet 1A. Multiple jobs uses the Step 2 checkbox table. Virginia uses the employer formula after the $8,750 standard deduction. No local VA tax. No employee VA UI.</p>
    </div>

    <div class="card">
      <div class="section-title">Payment method <span class="badge badge-req">Required to pay</span></div>
      <div class="grid grid-3">
        <div class="field"><label>Method</label>
          <select id="f-paymentMethod">${optionList(['check','direct_deposit'], emp.paymentMethod || 'check', { check: 'Paper check', direct_deposit: 'Direct deposit' })}</select>
        </div>
        <div class="field"><label>Account last 4</label>
          <input id="f-accountLast4" maxlength="4" inputmode="numeric" value="${esc(emp.accountLast4 || '')}" />
        </div>
      </div>
      <div class="row-actions">
        <button class="btn btn-primary" id="btn-save-emp">Save changes</button>
        ${
          archived
            ? `<button class="btn btn-secondary" id="btn-restore-emp">Restore</button>
               <button class="btn btn-danger" id="btn-delete-emp">Delete permanently</button>`
            : `<button class="btn btn-secondary" id="btn-archive-emp">Archive employee</button>`
        }
      </div>
    </div>

    <div class="card">
      <div class="section-title">Payweeks</div>
      <p class="hint">Weekly · Wed–Tue · Paid Wednesday. Overtime is hours over 40 in that window.</p>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Period (Wed–Tue)</th>
              <th>Payday</th>
              <th class="num">Hours</th>
              <th class="num">Gross</th>
              <th class="num">FIT</th>
              <th class="num">SS</th>
              <th class="num">Med</th>
              <th class="num">VA</th>
              <th class="num">Net</th>
              <th class="num">YTD gross</th>
              <th class="num">YTD net</th>
            </tr>
          </thead>
          <tbody>${payweekRows}</tbody>
        </table>
      </div>
      <p class="disclaimer">Federal withholding per IRS Pub 15-T (2026) Worksheet 1A. Virginia formula after the $8,750 standard deduction. Historical rows are not recalculated unless you transfer that period again.</p>
    </div>`;
}

function bindShowArchivedToggle() {
  const box = document.getElementById('emp-show-archived');
  if (!box) return;
  box.addEventListener('change', () => {
    state.showArchived = box.checked;
    if (!state.showArchived && selectedEmployee() && isArchived(selectedEmployee())) {
      const next = activeEmployees()[0];
      state.selectedId = next ? next.id : null;
    }
    render();
  });
}

function bindEmployees() {
  bindShowArchivedToggle();
  const emp = selectedEmployee();
  if (!emp) return;

  const markDirty = () => {
    state.profileDirty = true;
  };

  const sel = document.getElementById('emp-select');
  sel.addEventListener('change', async () => {
    if (state.profileDirty) {
      const choice = await modal({
        title: 'Unsaved changes',
        body: 'Switch employees without saving?',
        buttons: [
          { id: 'cancel', label: 'Stay' },
          { id: 'leave', label: 'Discard', danger: true }
        ]
      });
      if (choice !== 'leave') {
        sel.value = state.selectedId;
        return;
      }
    }
    state.profileDirty = false;
    state.selectedId = sel.value;
    render();
  });

  const map = [
    ['f-jobTitle', (v) => (emp.jobTitle = v)],
    ['f-department', (v) => (emp.department = v)],
    ['f-employmentType', (v) => (emp.employmentType = v)],
    ['f-manager', (v) => (emp.manager = v)],
    ['f-hireDate', (v) => (emp.hireDate = v)],
    ['f-firstName', (v) => (emp.firstName = v)],
    ['f-middleInitial', (v) => (emp.middleInitial = v.slice(0, 1))],
    ['f-lastName', (v) => (emp.lastName = v)],
    ['f-email', (v) => (emp.email = v)],
    ['f-phone', (v) => (emp.phone = v)],
    ['f-street', (v) => { emp.address = emp.address || {}; emp.address.street = v; }],
    ['f-city', (v) => { emp.address = emp.address || {}; emp.address.city = v; }],
    ['f-state', (v) => { emp.address = emp.address || {}; emp.address.state = v; }],
    ['f-zip', (v) => { emp.address = emp.address || {}; emp.address.zip = v; }],
    ['f-workState', (v) => (emp.workLocationState = v)],
    ['f-payType', (v) => (emp.payType = v)],
    ['f-rate', (v) => (emp.rate = v === '' ? '' : Number(v))],
    ['f-payFrequency', (v) => (emp.payFrequency = v)],
    ['f-filingStatus', (v) => (emp.filingStatus = v)],
    ['f-dependents', (v) => (emp.w4Step3Dependents = Number(v) || 0)],
    ['f-extraFederal', (v) => (emp.extraFederal = Number(v) || 0)],
    ['f-extraState', (v) => (emp.extraState = Number(v) || 0)],
    ['f-pretax', (v) => (emp.preTaxDeduction = Number(v) || 0)],
    ['f-w4other', (v) => (emp.w4OtherIncome = Number(v) || 0)],
    ['f-w4deductions', (v) => (emp.w4Deductions = Number(v) || 0)],
    ['f-vaE1', (v) => (emp.vaE1 = Number(v) || 0)],
    ['f-vaE2', (v) => (emp.vaE2 = Number(v) || 0)],
    ['f-accountLast4', (v) => (emp.accountLast4 = digits(v).slice(0, 4))]
  ];

  map.forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      fn(el.value);
      markDirty();
    });
    el.addEventListener('change', () => {
      fn(el.value);
      markDirty();
      if (id === 'f-payType') {
        const lab = document.getElementById('f-rate-label');
        if (lab) lab.textContent = emp.payType === 'salary' ? 'Annual salary' : 'Hourly rate';
      }
    });
  });

  const statusEl = document.getElementById('f-status');
  if (statusEl) {
    statusEl.addEventListener('change', (e) => {
      emp.status = e.target.value;
      markDirty();
    });
  }

  document.getElementById('f-vaWithhold').addEventListener('change', (e) => {
    emp.vaWithhold = e.target.value !== 'exempt';
    markDirty();
  });
  document.getElementById('f-multipleJobs').addEventListener('change', (e) => {
    emp.multipleJobs = e.target.value === 'yes';
    markDirty();
  });
  document.getElementById('f-paymentMethod').addEventListener('change', (e) => {
    emp.paymentMethod = e.target.value;
    markDirty();
  });

  bindSsn('f-ssn', () => emp.ssn, (v) => {
    emp.ssn = v;
    markDirty();
  });

  document.getElementById('btn-save-emp').addEventListener('click', async () => {
    if (!emp.firstName || !emp.lastName) {
      toast('First and last name are required.', 'err');
      return;
    }
    if (emp.rate === '' || emp.rate == null || Number(emp.rate) < 0) {
      toast('Enter a pay rate or salary.', 'err');
      return;
    }
    try {
      await persist();
      state.profileDirty = false;
      toast('Employee saved.', 'ok');
      render();
    } catch {
      toast('Could not save employee.', 'err');
    }
  });

  const archiveBtn = document.getElementById('btn-archive-emp');
  if (archiveBtn) {
    archiveBtn.addEventListener('click', async () => {
      if (!(await confirmArchive(emp))) return;
      emp.status = 'Archived';
      state.profileDirty = false;
      try {
        await persist();
        toast('Employee archived.', 'ok');
        state.showArchived = true;
        render();
      } catch {
        toast('Could not archive employee.', 'err');
      }
    });
  }

  const restoreBtn = document.getElementById('btn-restore-emp');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', async () => {
      const name = fullName(emp) || 'this employee';
      const choice = await modal({
        title: 'Restore employee',
        body: `Restore <strong>${esc(name)}</strong> to Active? They will appear in payroll dropdowns again.`,
        buttons: [
          { id: 'cancel', label: 'Cancel' },
          { id: 'restore', label: 'Restore', primary: true }
        ]
      });
      if (choice !== 'restore') return;
      emp.status = 'Active';
      state.profileDirty = false;
      try {
        await persist();
        toast('Employee restored.', 'ok');
        render();
      } catch {
        toast('Could not restore employee.', 'err');
      }
    });
  }

  const deleteBtn = document.getElementById('btn-delete-emp');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!(await confirmPermanentDelete(emp))) return;
      state.data.employees = state.data.employees.filter((e) => e.id !== emp.id);
      state.selectedId = (visibleEmployees()[0] && visibleEmployees()[0].id) || null;
      state.profileDirty = false;
      try {
        await persist();
        toast('Employee deleted.', 'ok');
        render();
      } catch {
        toast('Could not delete employee.', 'err');
      }
    });
  }
}

function renderAdd() {
  const d = state.addDraft || (state.addDraft = emptyEmployee());
  return `
    <div class="card">
      <p class="hint">New people are stored in your Windows user folder, not next to the app. Default work address is 821 Kabrich Street, Blacksburg, VA 24060.</p>
      <div class="grid grid-name">
        <div class="field"><label>First name</label><input id="a-firstName" value="${esc(d.firstName)}" /></div>
        <div class="field"><label>MI</label><input id="a-middleInitial" maxlength="1" value="${esc(d.middleInitial)}" /></div>
        <div class="field"><label>Last name</label><input id="a-lastName" value="${esc(d.lastName)}" /></div>
      </div>
      <div class="grid grid-3" style="margin-top:14px">
        <div class="field"><label>Mobile</label><input id="a-phone" value="${esc(d.phone)}" /></div>
        <div class="field"><label>Email</label><input id="a-email" type="email" value="${esc(d.email)}" /></div>
        <div class="field"><label>Hire date</label><input id="a-hireDate" type="date" value="${esc(d.hireDate)}" /></div>
        <div class="field"><label>SSN</label>${ssnField('a-ssn', d.ssn)}</div>
        <div class="field span-2"><label>Street</label><input id="a-street" value="${esc(d.address.street)}" /></div>
        <div class="field"><label>City</label><input id="a-city" value="${esc(d.address.city)}" /></div>
        <div class="field"><label>State</label><select id="a-state">${optionList(US_STATES, d.address.state)}</select></div>
        <div class="field"><label>ZIP</label><input id="a-zip" value="${esc(d.address.zip)}" /></div>
        <div class="field"><label>Filing status</label>
          <select id="a-filingStatus">${optionList(
            ['single','mfj','hoh'],
            d.filingStatus,
            { single: 'Single or Married Filing Separately', mfj: 'Married Filing Jointly', hoh: 'Head of Household' }
          )}</select>
        </div>
        <div class="field"><label>Pay type</label>
          <select id="a-payType">${optionList(['hourly','salary'], d.payType, { hourly: 'Hourly', salary: 'Salary' })}</select>
        </div>
        <div class="field"><label id="a-rate-label">${d.payType === 'salary' ? 'Annual salary' : 'Hourly rate'}</label>
          <input id="a-rate" type="number" min="0" step="0.01" value="${esc(d.rate)}" />
        </div>
        <div class="field"><label>Pay frequency</label>
          <select id="a-payFrequency">${optionList(
            ['weekly','biweekly','semimonthly','monthly'],
            d.payFrequency,
            { weekly: 'Weekly', biweekly: 'Biweekly', semimonthly: 'Semimonthly', monthly: 'Monthly' }
          )}</select>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn btn-primary" id="btn-add-emp">Add employee</button>
      </div>
    </div>`;
}

function bindAdd() {
  const d = state.addDraft;
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => fn(el.value));
    el.addEventListener('change', () => fn(el.value));
  };
  bind('a-firstName', (v) => (d.firstName = v));
  bind('a-middleInitial', (v) => (d.middleInitial = v.slice(0, 1)));
  bind('a-lastName', (v) => (d.lastName = v));
  bind('a-phone', (v) => (d.phone = v));
  bind('a-email', (v) => (d.email = v));
  bind('a-hireDate', (v) => (d.hireDate = v));
  bind('a-street', (v) => (d.address.street = v));
  bind('a-city', (v) => (d.address.city = v));
  bind('a-state', (v) => (d.address.state = v));
  bind('a-zip', (v) => (d.address.zip = v));
  bind('a-filingStatus', (v) => (d.filingStatus = v));
  bind('a-payType', (v) => {
    d.payType = v;
    const lab = document.getElementById('a-rate-label');
    if (lab) lab.textContent = v === 'salary' ? 'Annual salary' : 'Hourly rate';
  });
  bind('a-rate', (v) => (d.rate = v === '' ? '' : Number(v)));
  bind('a-payFrequency', (v) => (d.payFrequency = v));
  bindSsn('a-ssn', () => d.ssn, (v) => (d.ssn = v));

  document.getElementById('btn-add-emp').addEventListener('click', async () => {
    if (!d.firstName.trim() || !d.lastName.trim()) {
      toast('First and last name are required.', 'err');
      return;
    }
    if (d.rate === '' || d.rate == null || Number.isNaN(Number(d.rate))) {
      toast('Enter an hourly rate or annual salary.', 'err');
      return;
    }
    const emp = JSON.parse(JSON.stringify(d));
    emp.rate = Number(emp.rate);
    emp.payweeks = [];
    state.data.employees.push(emp);
    try {
      await persist();
      state.addDraft = emptyEmployee();
      state.selectedId = emp.id;
      state.profileDirty = false;
      toast('Employee added.', 'ok');
      await navigate('employees', { skipDirty: true });
    } catch {
      state.data.employees = state.data.employees.filter((e) => e.id !== emp.id);
      toast('Could not save the new employee.', 'err');
    }
  });
}

function emptyDayRow(iso) {
  return {
    id: uid('punch'),
    date: iso,
    clockIn: '',
    lunchOut: '',
    lunchIn: '',
    clockOut: '',
    hours: '',
    payType: 'regular'
  };
}

function weekdayName(iso) {
  const d = tax.parseISODate(iso);
  return d ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] : '';
}

function ensureWeekRows(period, punches) {
  const days = tax.periodDays(period.periodStart, period.periodEnd);
  const byDate = {};
  let vacationHours = 0;
  let holidayHours = 0;
  for (const p of punches || []) {
    const kind = p.payType || 'regular';
    if (kind === 'vacation') vacationHours += tax.rowHours(p);
    else if (kind === 'holiday') holidayHours += tax.rowHours(p);
    else if (p.date) byDate[p.date] = p;
  }
  const rows = days.map((iso) => {
    const prev = byDate[iso];
    if (!prev) return emptyDayRow(iso);
    return {
      id: prev.id || uid('punch'),
      date: iso,
      clockIn: prev.clockIn || '',
      lunchOut: prev.lunchOut || '',
      lunchIn: prev.lunchIn || '',
      clockOut: prev.clockOut || '',
      hours: prev.hours != null && prev.hours !== '' ? prev.hours : '',
      payType: 'regular',
      entryMode: prev.entryMode
    };
  });
  return {
    rows,
    vacationHours: tax.roundHours(vacationHours),
    holidayHours: tax.roundHours(holidayHours)
  };
}

function payStatsHtml(calc) {
  if (!calc) return '<p class="muted">Select an employee to estimate pay.</p>';
  const bits = [];
  if (calc.pay.vacationHours) bits.push(`${hoursFmt(calc.pay.vacationHours)} vac`);
  if (calc.pay.holidayHours) bits.push(`${hoursFmt(calc.pay.holidayHours)} holiday`);
  const fitNote =
    calc.pay.federalExtra > 0
      ? `${money(calc.pay.federalComputed)} calculated + ${money(calc.pay.federalExtra)} extra`
      : '';
  const vaNote =
    calc.pay.stateExtra > 0
      ? `${money(calc.pay.stateComputed)} calculated + ${money(calc.pay.stateExtra)} extra`
      : '';
  return `
      <div class="stats">
        <div class="stat"><div class="k">Straight</div><div class="v">${hoursFmt(calc.pay.straightHours)} h</div></div>
        <div class="stat"><div class="k">Overtime</div><div class="v">${hoursFmt(calc.pay.otHours)} h</div></div>
        <div class="stat"><div class="k">Gross</div><div class="v">${money(calc.pay.gross)}</div></div>
        <div class="stat"><div class="k">Taxes</div><div class="v neg">${money(calc.pay.totalTaxes)}</div></div>
        <div class="stat"><div class="k">Net</div><div class="v pos">${money(calc.pay.net)}</div></div>
      </div>
      ${bits.length ? `<p class="hint">${esc(bits.join(' · '))}</p>` : ''}
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>FIT</th><th>SS</th><th>Med</th><th>VA</th><th>Pre-tax</th><th>Hourly</th></tr></thead>
          <tbody><tr>
            <td>${money(calc.pay.federal)}${fitNote ? `<div class="hint">${esc(fitNote)}</div>` : ''}</td>
            <td>${money(calc.pay.ss)}</td>
            <td>${money(calc.pay.medicare)}</td>
            <td>${money(calc.pay.state)}${vaNote ? `<div class="hint">${esc(vaNote)}</div>` : ''}</td>
            <td>${money(calc.pay.pretax)}</td>
            <td>${money(calc.pay.hourly)}</td>
          </tr></tbody>
        </table>
      </div>`;
}

function findPayweek(emp, periodEnd) {
  if (!emp) return null;
  return (emp.payweeks || []).find((w) => payweekPeriodEnd(w) === periodEnd) || null;
}

function loadPunchesForWeek() {
  const period = periodFromEnd(state.time.periodEnd);
  state.time.periodEnd = period.periodEnd;
  const emp = findEmployee(state.time.employeeId);
  const existing = findPayweek(emp, period.periodEnd);
  if (existing) {
    state.time.mode = existing.timeEntryMode === 'hours' ? 'hours' : 'punches';
    const packed = ensureWeekRows(period, existing.punches || []);
    state.time.punches = packed.rows;
    state.time.vacationHours =
      existing.vacationHours != null && existing.vacationHours !== ''
        ? existing.vacationHours
        : packed.vacationHours || '';
    state.time.holidayHours =
      existing.holidayHours != null && existing.holidayHours !== ''
        ? existing.holidayHours
        : packed.holidayHours || '';
    if (existing.dayHours && typeof existing.dayHours === 'object') {
      state.time.punches.forEach((row) => {
        if (existing.dayHours[row.date] != null && existing.dayHours[row.date] !== '') {
          row.hours = existing.dayHours[row.date];
        }
      });
    }
  } else {
    const packed = ensureWeekRows(period, []);
    state.time.punches = packed.rows;
    state.time.vacationHours = '';
    state.time.holidayHours = '';
  }
}

function ensureTimeDefaults() {
  if (!state.time.periodEnd) state.time.periodEnd = currentPeriod().periodEnd;
  else {
    const snapped = periodFromEnd(state.time.periodEnd);
    state.time.periodEnd = snapped.periodEnd;
  }
  if (!state.time.mode) state.time.mode = 'punches';
  if (!state.time.employeeId && state.selectedId && isActiveForPay(findEmployee(state.selectedId))) {
    state.time.employeeId = state.selectedId;
  }
  if (state.time.employeeId && isArchived(findEmployee(state.time.employeeId))) {
    state.time.employeeId = '';
  }
  const period = periodFromEnd(state.time.periodEnd);
  const days = tax.periodDays(period.periodStart, period.periodEnd);
  if (!state.time.punches.length || state.time.punches.length !== days.length) {
    loadPunchesForWeek();
  }
}

function currentTimeInput() {
  const period = periodFromEnd(state.time.periodEnd);
  const packed = ensureWeekRows(period, state.time.punches);
  const vac = tax.roundHours(state.time.vacationHours);
  const hol = tax.roundHours(state.time.holidayHours);
  if (state.time.mode === 'hours') {
    let regularHours = 0;
    for (const row of packed.rows) {
      regularHours += tax.roundHours(row.hours);
    }
    return {
      regularHours: tax.roundHours(regularHours),
      vacationHours: vac,
      holidayHours: hol
    };
  }
  const rows = packed.rows.map((row) => ({ ...row, entryMode: 'punches', payType: 'regular' }));
  if (vac) rows.push({ payType: 'vacation', hours: vac, date: period.periodStart });
  if (hol) rows.push({ payType: 'holiday', hours: hol, date: period.periodStart });
  return rows;
}

function currentTimePay() {
  const emp = findEmployee(state.time.employeeId);
  if (!emp || isArchived(emp)) return null;
  const period = periodFromEnd(state.time.periodEnd);
  const ytd = ytdGrossBefore(emp, period.payday, period.periodEnd);
  const pay = tax.computePay(emp, currentTimeInput(), { ytdGross: ytd });
  return { emp, hours: pay.totalHours, pay };
}

function renderTimeclocks() {
  ensureTimeDefaults();
  const period = periodFromEnd(state.time.periodEnd);
  const emp = findEmployee(state.time.employeeId);
  const archivedSelected = isArchived(emp);
  const calc = !archivedSelected ? currentTimePay() : null;
  const hoursMode = state.time.mode === 'hours';
  const dayRows = (state.time.punches || [])
    .filter((p) => (p.payType || 'regular') === 'regular')
    .map((p) => {
      const paid = hoursMode
        ? tax.roundHours(p.hours)
        : tax.paidPunchHours(p);
      if (hoursMode) {
        return `<tr data-punch="${esc(p.id)}">
          <td>${esc(weekdayName(p.date))}</td>
          <td><input type="date" data-punch-field="date" value="${esc(p.date || '')}" readonly /></td>
          <td class="num"><input type="number" min="0" step="0.01" data-punch-field="hours" value="${esc(p.hours === 0 ? 0 : p.hours || '')}" /></td>
        </tr>`;
      }
      return `<tr data-punch="${esc(p.id)}">
        <td>${esc(weekdayName(p.date))}</td>
        <td><input type="date" data-punch-field="date" value="${esc(p.date || '')}" readonly /></td>
        <td><input type="time" data-punch-field="clockIn" value="${esc(p.clockIn || '')}" /></td>
        <td><input type="time" data-punch-field="lunchOut" value="${esc(p.lunchOut || '')}" /></td>
        <td><input type="time" data-punch-field="lunchIn" value="${esc(p.lunchIn || '')}" /></td>
        <td><input type="time" data-punch-field="clockOut" value="${esc(p.clockOut || '')}" /></td>
        <td class="num mono hours-cell">${hoursFmt(paid)}</td>
      </tr>`;
    })
    .join('');

  const dayTable = hoursMode
    ? `<table class="data">
          <thead><tr><th>Day</th><th>Date</th><th class="num">Hours</th></tr></thead>
          <tbody>${dayRows}</tbody>
        </table>`
    : `<table class="data">
          <thead><tr><th>Day</th><th>Date</th><th>Clock in</th><th>Lunch out</th><th>Lunch in</th><th>Clock out</th><th class="num">Paid hours</th></tr></thead>
          <tbody>${dayRows}</tbody>
        </table>`;

  const stats = `<div id="tc-stats">${payStatsHtml(calc)}</div>`;

  return `
    <div class="card">
      <div class="toolbar">
        <div class="field">
          <label>Employee</label>
          <select id="tc-emp">${employeeOptions(state.time.employeeId, true, { forPay: true })}</select>
        </div>
        <div class="field" style="min-width:180px">
          <label>Period ending (Tuesday)</label>
          <input id="tc-week" type="date" value="${esc(period.periodEnd)}" />
        </div>
        <div class="field" style="min-width:180px">
          <label>Payday (Wednesday)</label>
          <input value="${esc(period.payday)}" readonly />
        </div>
      </div>
      <p class="hint">Period ${esc(period.periodStart)} (Wed) through ${esc(period.periodEnd)} (Tue). Paid ${esc(period.payday)}.</p>
      <div class="mode-toggle" role="tablist">
        <button type="button" class="mode-btn${hoursMode ? '' : ' is-active'}" data-time-mode="punches">Clock punches</button>
        <button type="button" class="mode-btn${hoursMode ? ' is-active' : ''}" data-time-mode="hours">Regular pay — enter hours</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>${hoursMode ? 'Hours by day' : 'Clock punches'}</h2>
      </div>
      <p class="hint">${
        hoursMode
          ? 'Enter hours for each day Wed–Tue. Overtime is hours over 40 in that window at 1.5×. Empty lunch is not used in this mode.'
          : 'Paid hours = (clock out − clock in) − (lunch in − lunch out). Leave lunch blank for no lunch subtraction. Overnight shifts wrap past midnight.'
      }</p>
      <div class="table-wrap">${dayTable}</div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="field"><label>Vacation hours (taxable)</label>
          <input id="tc-vac" type="number" min="0" step="0.01" value="${esc(state.time.vacationHours)}" />
        </div>
        <div class="field"><label>Holiday hours (taxable)</label>
          <input id="tc-hol" type="number" min="0" step="0.01" value="${esc(state.time.holidayHours)}" />
        </div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Estimated pay</div>
      ${stats}
      <p class="disclaimer">Federal withholding per IRS Pub 15-T (2026) Worksheet 1A. Extra federal/state is added on top of calculated tax, never a replacement. Social Security 6.2% up to $${esc(String(tax.SS_WAGE_BASE))} YTD. Medicare 1.45%. Virginia after $8,750 standard deduction. No local VA tax. No employee VA UI.</p>
      <div class="row-actions">
        <button class="btn btn-primary" id="tc-transfer"${calc && !archivedSelected ? '' : ' disabled'}>Transfer to profile</button>
      </div>
    </div>`;
}

function bindTimeclocks() {
  document.getElementById('tc-emp').addEventListener('change', (e) => {
    state.time.employeeId = e.target.value;
    loadPunchesForWeek();
    render();
  });
  document.getElementById('tc-week').addEventListener('change', (e) => {
    state.time.periodEnd = periodFromEnd(e.target.value).periodEnd;
    loadPunchesForWeek();
    render();
  });
  document.querySelectorAll('[data-time-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-time-mode') === 'hours' ? 'hours' : 'punches';
      if (next === state.time.mode) return;
      if (next === 'hours') {
        state.time.punches.forEach((row) => {
          if ((row.payType || 'regular') !== 'regular') return;
          const paid = tax.paidPunchHours(row);
          if (paid && (row.hours === '' || row.hours == null)) row.hours = paid;
          row.entryMode = 'hours';
        });
      } else {
        state.time.punches.forEach((row) => {
          row.entryMode = 'punches';
        });
      }
      state.time.mode = next;
      render();
    });
  });
  const vac = document.getElementById('tc-vac');
  const hol = document.getElementById('tc-hol');
  const syncExtras = () => {
    if (vac) state.time.vacationHours = vac.value;
    if (hol) state.time.holidayHours = hol.value;
    const stats = document.getElementById('tc-stats');
    if (stats) stats.innerHTML = payStatsHtml(currentTimePay());
  };
  if (vac) {
    vac.addEventListener('input', syncExtras);
    vac.addEventListener('change', syncExtras);
  }
  if (hol) {
    hol.addEventListener('input', syncExtras);
    hol.addEventListener('change', syncExtras);
  }
  document.querySelectorAll('[data-punch]').forEach((row) => {
    const id = row.getAttribute('data-punch');
    const punch = state.time.punches.find((p) => p.id === id);
    row.querySelectorAll('[data-punch-field]').forEach((input) => {
      const apply = () => {
        const field = input.getAttribute('data-punch-field');
        punch[field] = input.value;
        const hoursCell = row.querySelector('.hours-cell');
        if (hoursCell) hoursCell.textContent = hoursFmt(tax.paidPunchHours(punch));
        const stats = document.getElementById('tc-stats');
        if (stats) stats.innerHTML = payStatsHtml(currentTimePay());
      };
      input.addEventListener('change', apply);
      input.addEventListener('input', apply);
    });
  });
  const transfer = document.getElementById('tc-transfer');
  if (transfer) {
    transfer.addEventListener('click', async () => {
      const calc = currentTimePay();
      if (!calc) return;
      if (isArchived(calc.emp)) {
        toast('Restore this employee before transferring a payweek.', 'err');
        return;
      }
      const period = periodFromEnd(state.time.periodEnd);
      if (!period.periodEnd) {
        toast('Choose a period ending date (Tuesday).', 'err');
        return;
      }
      const emp = calc.emp;
      emp.payweeks = emp.payweeks || [];
      const existingIdx = emp.payweeks.findIndex((w) => payweekPeriodEnd(w) === period.periodEnd);
      if (existingIdx >= 0) {
        const choice = await modal({
          title: 'Replace payweek?',
          body: `A payweek for period ending <strong>${esc(period.periodEnd)}</strong> already exists for <strong>${esc(fullName(emp))}</strong>. Replace it?`,
          buttons: [
            { id: 'cancel', label: 'Cancel' },
            { id: 'replace', label: 'Replace', primary: true }
          ]
        });
        if (choice !== 'replace') return;
      }
      const dayHours = {};
      state.time.punches.forEach((row) => {
        if (row.date) dayHours[row.date] = row.hours;
      });
      const extraPunches = [];
      const vacHrs = tax.roundHours(state.time.vacationHours);
      const holHrs = tax.roundHours(state.time.holidayHours);
      if (vacHrs) extraPunches.push({ id: uid('punch'), date: period.periodStart, payType: 'vacation', hours: vacHrs });
      if (holHrs) extraPunches.push({ id: uid('punch'), date: period.periodStart, payType: 'holiday', hours: holHrs });
      const record = {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        payday: period.payday,
        weekEnding: period.periodEnd,
        timeEntryMode: state.time.mode,
        dayHours,
        hours: calc.pay.totalHours,
        regularHours: calc.pay.regularHours,
        vacationHours: calc.pay.vacationHours,
        holidayHours: calc.pay.holidayHours,
        otHours: calc.pay.otHours,
        gross: calc.pay.gross,
        federal: calc.pay.federal,
        federalComputed: calc.pay.federalComputed,
        federalExtra: calc.pay.federalExtra,
        ss: calc.pay.ss,
        medicare: calc.pay.medicare,
        state: calc.pay.state,
        stateComputed: calc.pay.stateComputed,
        stateExtra: calc.pay.stateExtra,
        pretax: calc.pay.pretax,
        net: calc.pay.net,
        punches: JSON.parse(JSON.stringify(state.time.punches.concat(extraPunches)))
      };
      if (existingIdx >= 0) emp.payweeks[existingIdx] = record;
      else emp.payweeks.push(record);
      try {
        await persist();
        state.selectedId = emp.id;
        toast('Payweek transferred to the employee profile.', 'ok');
      } catch {
        toast('Could not save the payweek.', 'err');
      }
    });
  }
}

function allPayweeks() {
  const rows = [];
  for (const emp of state.data.employees || []) {
    if (!state.showArchived && isArchived(emp)) continue;
    for (const w of emp.payweeks || []) {
      rows.push({
        employeeId: emp.id,
        name: fullName(emp),
        archived: isArchived(emp),
        periodLabel: payweekPeriodLabel(w),
        payday: payweekPayday(w),
        periodEnd: payweekPeriodEnd(w),
        hours: w.hours,
        gross: w.gross,
        taxes: tax.round2((Number(w.federal) || 0) + (Number(w.ss) || 0) + (Number(w.medicare) || 0) + (Number(w.state) || 0)),
        net: w.net
      });
    }
  }
  rows.sort((a, b) => {
    const pd = String(b.payday || b.periodEnd).localeCompare(String(a.payday || a.periodEnd));
    if (pd) return pd;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function renderPayroll() {
  const rows = allPayweeks();
  const groups = [];
  for (const r of rows) {
    const key = r.payday || 'unknown';
    const last = groups[groups.length - 1];
    if (!last || last.payday !== key) groups.push({ payday: key, rows: [r] });
    else last.rows.push(r);
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.hours += Number(r.hours) || 0;
      acc.gross += Number(r.gross) || 0;
      acc.taxes += Number(r.taxes) || 0;
      acc.net += Number(r.net) || 0;
      return acc;
    },
    { hours: 0, gross: 0, taxes: 0, net: 0 }
  );

  const archivedCount = (state.data.employees || []).filter(isArchived).length;
  let body = '';
  if (!rows.length) {
    body = `<tr><td colspan="7" class="muted">No payweeks yet. Transfer a timesheet from Time clocks.</td></tr>`;
  } else {
    for (const g of groups) {
      body += `<tr><td colspan="7"><strong>Payday ${esc(g.payday === 'unknown' ? '—' : g.payday)}</strong> (Wednesday)</td></tr>`;
      body += g.rows
        .map(
          (r) => `<tr>
            <td>${esc(r.name)}${r.archived ? ' <span class="badge badge-archived">Archived</span>' : ''}</td>
            <td>${esc(r.periodLabel)}</td>
            <td>${esc(r.payday || '—')}</td>
            <td class="num">${hoursFmt(r.hours)}</td>
            <td class="num">${money(r.gross)}</td>
            <td class="num">${money(r.taxes)}</td>
            <td class="num">${money(r.net)}</td>
          </tr>`
        )
        .join('');
    }
    body += `<tr>
        <td><strong>Totals</strong></td>
        <td></td>
        <td></td>
        <td class="num"><strong>${hoursFmt(totals.hours)}</strong></td>
        <td class="num"><strong>${money(totals.gross)}</strong></td>
        <td class="num"><strong>${money(totals.taxes)}</strong></td>
        <td class="num"><strong>${money(totals.net)}</strong></td>
      </tr>`;
  }

  return `
    <div class="card">
      <div class="toolbar">
        <p class="hint" style="margin:0">Weekly · Wed–Tue · Paid Wednesday. Groups are payday Wednesdays.</p>
        <label class="chip"><input type="checkbox" id="pr-show-archived"${state.showArchived ? ' checked' : ''} /> Show archived${archivedCount ? ` (${archivedCount})` : ''}</label>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Period (Wed–Tue)</th>
              <th>Payday</th>
              <th class="num">Hours</th>
              <th class="num">Gross</th>
              <th class="num">Total taxes</th>
              <th class="num">Net</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="disclaimer">Federal withholding per IRS Pub 15-T (2026) Worksheet 1A. Virginia formula after the $8,750 standard deduction. Stored historical payweeks are not recalculated here.</p>
    </div>`;
}

function formatStamp(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function formatBytes(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return '';
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / (1024 * 1024)).toFixed(2)} MB`;
}

function renderSettings() {
  const encOn = Boolean(state.meta && state.meta.encryptionAvailable);
  const u = state.update;
  let updateDetail = 'No check yet.';
  if (u.phase === 'checking') updateDetail = 'Checking the update server…';
  if (u.phase === 'none') updateDetail = 'You are on the latest version.';
  if (u.phase === 'error') updateDetail = u.message || 'No update server reachable';
  if (u.phase === 'available' && u.info) {
    const size = u.info.files && u.info.files[0] ? formatBytes(u.info.files[0].size) : '';
    updateDetail = `Version ${esc(u.info.version)} is available${size ? ' (' + esc(size) + ')' : ''}.`;
  }
  if (u.phase === 'downloading') updateDetail = `Downloading… ${Math.round(u.percent || 0)}%`;
  if (u.phase === 'downloaded') updateDetail = 'Update downloaded. Restart to apply. Payroll data in AppData is not touched.';

  const notes =
    u.info && u.info.releaseNotes
      ? `<p class="hint" style="white-space:pre-wrap">${esc(u.info.releaseNotes)}</p>`
      : '';

  return `
    <div class="card">
      <div class="section-title">Company</div>
      <div class="grid grid-2">
        <div class="field"><label>Company name</label><input value="Moore's Body Shop" readonly /></div>
        <div class="field"><label>App version</label><input value="${esc((state.meta && state.meta.version) || '')}" readonly /></div>
        <div class="field"><label>App ID</label><input value="${esc((state.meta && state.meta.appId) || '')}" readonly /></div>
        <div class="field"><label>Channel</label><input value="stable" readonly /></div>
        <div class="field span-2"><label>Pay schedule</label><input value="Weekly · Wed–Tue · Paid Wednesday" readonly /></div>
      </div>
      <p class="hint">Period is Wednesday through Tuesday. Payday is the Wednesday after that Tuesday (example: 08/12/2026–08/18/2026 paid 08/19/2026). Regular, vacation, and holiday hours are all taxable at the hourly rate. Overtime is hours over 40 in that window at 1.5×. No local VA tax. No employee VA UI.</p>
      <div class="row-actions">
        <button class="btn btn-secondary" id="btn-open-p15t">Open IRS Pub 15-T (2026)</button>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Payroll data folder</div>
      ${
        encOn
          ? ''
          : `<div class="warn-banner">OS encryption unavailable — data is in your user folder only</div>`
      }
      <p class="hint">Employee files never live next to the .exe or in Program Files. Updates replace app binaries only and do not wipe this folder.</p>
      <div class="path-box" id="data-path">${esc((state.meta && state.meta.dataPath) || '')}</div>
      <div class="row-actions">
        <button class="btn btn-secondary" id="btn-open-folder">Open data folder</button>
        <button class="btn btn-secondary" id="btn-export-enc">Export encrypted backup</button>
        <button class="btn btn-secondary" id="btn-export-json">Export decrypted JSON backup</button>
        <button class="btn btn-secondary" id="btn-import">Import backup</button>
      </div>
      <p class="hint" style="margin-top:12px">Encrypted backups can only be opened by the same Windows user. Use decrypted JSON to move the shop to another PC — that file contains SSNs.</p>
      <p class="hint">Archived employees stay in this encrypted file with their payweeks. Use Employees → Show archived to restore or delete permanently.</p>
    </div>

    <div class="card">
      <div class="section-title">Encryption</div>
      <p>${
        encOn
          ? 'Windows DPAPI encryption is on. <code>employees.json.enc</code> is encrypted at rest for this Windows user.'
          : 'OS encryption unavailable — data is in your user folder only.'
      }</p>
    </div>

    <div class="card">
      <div class="section-title">Updates</div>
      <p class="hint">The app works fully offline. Updates are optional and download into Electron’s updater cache, never into the payroll data folder.</p>
      <div class="grid grid-2">
        <div class="field span-2"><label>Update server URL</label>
          <input id="s-updateUrl" value="${esc((state.settings && state.settings.updateUrl) || '')}" />
        </div>
        <div class="field"><label>Current version</label><input value="${esc((state.meta && state.meta.version) || '')}" readonly /></div>
        <div class="field"><label>Last checked</label><input value="${esc(formatStamp(state.settings && state.settings.lastChecked))}" readonly /></div>
        <div class="field"><label>Check for updates on startup</label>
          <select id="s-startup">${optionList(['off','on'], state.settings && state.settings.checkOnStartup ? 'on' : 'off', { off: 'Off (default)', on: 'On' })}</select>
        </div>
      </div>
      <div class="update-box" style="margin-top:14px">
        <strong>${updateDetail}</strong>
        ${notes}
        ${
          u.phase === 'downloading'
            ? `<div class="progress"><span style="width:${Math.max(0, Math.min(100, u.percent || 0))}%"></span></div>`
            : ''
        }
      </div>
      <div class="row-actions">
        <button class="btn btn-secondary" id="btn-save-settings">Save update settings</button>
        <button class="btn btn-secondary" id="btn-check-upd">Check for updates</button>
        <button class="btn btn-primary" id="btn-dl-upd"${u.phase === 'available' || u.phase === 'downloaded' ? '' : ' disabled'}>Download and install</button>
        <button class="btn btn-primary" id="btn-restart-upd"${u.phase === 'downloaded' ? '' : ' disabled'}>Restart and apply</button>
      </div>
    </div>`;
}

function bindSettings() {
  const pubBtn = document.getElementById('btn-open-p15t');
  if (pubBtn) {
    pubBtn.addEventListener('click', async () => {
      try {
        const res = await api.openPub15t();
        if (res && res.ok === false) toast('Could not open Pub 15-T.', 'err');
      } catch {
        toast('Could not open Pub 15-T.', 'err');
      }
    });
  }

  document.getElementById('btn-open-folder').addEventListener('click', async () => {
    try {
      await api.openDataFolder();
    } catch {
      toast('Could not open the data folder.', 'err');
    }
  });

  document.getElementById('btn-export-enc').addEventListener('click', async () => {
    try {
      const res = await api.exportEncrypted();
      if (res && res.ok) toast('Encrypted backup saved.', 'ok');
    } catch {
      toast('Export failed.', 'err');
    }
  });

  document.getElementById('btn-export-json').addEventListener('click', async () => {
    const choice = await modal({
      title: 'Export decrypted JSON?',
      body: 'This file contains Social Security numbers and pay amounts. Anyone with the file can read it. Store it only on a private drive.',
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'export', label: 'Export decrypted file', danger: true }
      ]
    });
    if (choice !== 'export') return;
    try {
      const res = await api.exportDecrypted();
      if (res && res.ok) toast('Decrypted backup saved. Keep it private.', 'ok');
    } catch {
      toast('Export failed.', 'err');
    }
  });

  document.getElementById('btn-import').addEventListener('click', async () => {
    const choice = await modal({
      title: 'Import backup',
      body: '<p><strong>Merge</strong> adds or updates employees from the backup.<br><strong>Replace</strong> wipes the current database and loads the backup.</p>',
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'merge', label: 'Merge' },
        { id: 'replace', label: 'Replace all', danger: true }
      ]
    });
    if (choice !== 'merge' && choice !== 'replace') return;
    if (choice === 'replace') {
      const again = await modal({
        title: 'Replace all payroll data?',
        body: 'This overwrites every employee and payweek currently in the app (automatic backups in the data folder remain).',
        buttons: [
          { id: 'cancel', label: 'Cancel' },
          { id: 'replace', label: 'Replace', danger: true }
        ]
      });
      if (again !== 'replace') return;
    }
    try {
      const res = await api.importBackup(choice);
      if (res && res.canceled) return;
      if (res && res.ok && res.data) {
        state.data = res.data;
        state.selectedId = (state.data.employees[0] && state.data.employees[0].id) || null;
        state.profileDirty = false;
        toast(choice === 'replace' ? 'Database replaced from backup.' : 'Backup merged.', 'ok');
        render();
        return;
      }
      toast((res && res.message) || 'Import failed.', 'err');
    } catch {
      toast('Import failed.', 'err');
    }
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    try {
      const updateUrl = document.getElementById('s-updateUrl').value.trim();
      const checkOnStartup = document.getElementById('s-startup').value === 'on';
      state.settings = await api.saveSettings({ updateUrl, checkOnStartup });
      toast('Update settings saved.', 'ok');
      render();
    } catch {
      toast('Could not save settings.', 'err');
    }
  });

  document.getElementById('btn-check-upd').addEventListener('click', async () => {
    const updateUrl = document.getElementById('s-updateUrl').value.trim();
    try {
      state.settings = await api.saveSettings({
        updateUrl,
        checkOnStartup: document.getElementById('s-startup').value === 'on'
      });
    } catch {
      /* still try the check */
    }
    state.update.phase = 'checking';
    render();
    try {
      const res = await api.checkForUpdates();
      state.settings = await api.getSettings();
      if (!res || !res.ok) {
        state.update = {
          phase: 'error',
          info: null,
          message: (res && res.message) || 'No update server reachable',
          percent: 0
        };
      } else if (res.status === 'available') {
        state.update = { phase: 'available', info: res.info, message: '', percent: 0 };
      } else if (res.status === 'none') {
        state.update = { phase: 'none', info: res.info, message: '', percent: 0 };
      } else {
        state.update = { phase: 'error', info: null, message: 'No update server reachable', percent: 0 };
      }
    } catch {
      state.update = { phase: 'error', info: null, message: 'No update server reachable', percent: 0 };
    }
    render();
  });

  document.getElementById('btn-dl-upd').addEventListener('click', async () => {
    state.update.phase = 'downloading';
    render();
    const res = await api.downloadUpdate();
    if (!res || !res.ok) {
      state.update = { phase: 'error', info: state.update.info, message: 'No update server reachable', percent: 0 };
      render();
    }
  });

  document.getElementById('btn-restart-upd').addEventListener('click', async () => {
    await api.installUpdate();
  });
}

function render() {
  const root = document.getElementById('view-root');
  const chip = document.getElementById('enc-chip');
  if (state.meta && state.meta.encryptionAvailable) {
    chip.textContent = 'Encrypted';
    chip.className = 'chip chip-ok';
  } else {
    chip.textContent = 'OS encryption unavailable';
    chip.className = 'chip chip-warn';
  }

  if (state.view === 'employees') {
    root.innerHTML = renderEmployees();
    bindEmployees();
  } else if (state.view === 'add') {
    root.innerHTML = renderAdd();
    bindAdd();
  } else if (state.view === 'timeclocks') {
    root.innerHTML = renderTimeclocks();
    bindTimeclocks();
  } else if (state.view === 'payroll') {
    root.innerHTML = renderPayroll();
    const box = document.getElementById('pr-show-archived');
    if (box) {
      box.addEventListener('change', () => {
        state.showArchived = box.checked;
        render();
      });
    }
  } else if (state.view === 'settings') {
    root.innerHTML = renderSettings();
    bindSettings();
  }
}

function dismissBoot() {
  const boot = document.getElementById('boot');
  if (!boot || boot.classList.contains('is-done')) return;
  boot.classList.add('is-done');
  boot.setAttribute('aria-hidden', 'true');
  boot.style.pointerEvents = 'none';
  setTimeout(() => {
    if (boot.parentNode) boot.remove();
  }, 250);
}

async function boot() {
  const bootTimer = setTimeout(dismissBoot, 2000);
  try {
    state.meta = await api.getMeta();
    state.settings = await api.getSettings();
    state.data = await api.loadData();
    const firstActive = activeEmployees()[0];
    if (!state.selectedId) state.selectedId = firstActive ? firstActive.id : null;
  } catch {
    if (!state.data) state.data = { version: 1, company: { name: "Moore's Body Shop" }, employees: [] };
    toast('Could not open payroll data. Check %APPDATA%\\MooresBodyShop\\payroll\\', 'err');
  } finally {
    clearTimeout(bootTimer);
    dismissBoot();
  }

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    navigate(nav.getAttribute('data-nav'));
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const save = document.getElementById('btn-save-emp');
      if (save) save.click();
    }
  });

  api.onUpdateEvent((payload) => {
    if (!payload || !payload.phase) return;
    if (payload.phase === 'checking') state.update.phase = 'checking';
    if (payload.phase === 'available') {
      state.update.phase = 'available';
      state.update.info = payload.info;
    }
    if (payload.phase === 'none') state.update.phase = 'none';
    if (payload.phase === 'error') {
      state.update.phase = 'error';
      state.update.message = 'No update server reachable';
    }
    if (payload.phase === 'downloading') {
      state.update.phase = 'downloading';
      state.update.percent = payload.percent || 0;
    }
    if (payload.phase === 'downloaded') {
      state.update.phase = 'downloaded';
      state.update.info = payload.info || state.update.info;
    }
    if (state.view === 'settings') render();
  });

  setNav(state.view);
  render();

  if (state.settings && state.settings.checkOnStartup) {
    try {
      const res = await api.checkForUpdates();
      state.settings = await api.getSettings();
      if (res && res.ok && res.status === 'available') {
        state.update = { phase: 'available', info: res.info, message: '', percent: 0 };
        toast('An update is available. Open Settings to download.', 'ok');
      }
    } catch {
      /* offline is fine */
    }
  }
}

boot();
