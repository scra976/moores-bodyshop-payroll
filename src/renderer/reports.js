'use strict';

(function (root) {
  const tax = root.MooresTax;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '$0.00';
    return x.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function hoursFmt(n) {
    return (tax ? tax.roundHours(n) : Number(n) || 0).toFixed(2);
  }

  function round2(n) {
    return tax ? tax.round2(n) : Math.round((Number(n) || 0) * 100) / 100;
  }

  function fullName(emp) {
    if (!emp) return '';
    return [emp.firstName, emp.middleInitial, emp.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function addr(obj) {
    if (!obj) return '';
    return [obj.street, [obj.city, obj.state].filter(Boolean).join(', '), obj.zip].filter(Boolean).join(' ');
  }

  function companyBlock(company, settings) {
    const c = company || {};
    const a = c.address || {};
    const ein = settings && settings.ein ? formatEin(settings.ein) : '—';
    return {
      name: c.name || "Moore's Body Shop",
      address: addr(a) || '821 Kabrich Street, Blacksburg, VA 24060',
      ein,
      vaAccount: (settings && settings.vaAccount) || '—',
      vaUiAccount: (settings && settings.vaUiAccount) || '—'
    };
  }

  function formatEin(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length < 2) return d || '—';
    return `${d.slice(0, 2)}-${d.slice(2, 9)}`;
  }

  function formatSsn(raw, { last4 } = {}) {
    const d = String(raw || '').replace(/\D/g, '').slice(0, 9);
    if (!d) return '—';
    if (last4) return d.length >= 4 ? `XXX-XX-${d.slice(-4)}` : 'XXX-XX-••••';
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }

  function paydayOf(w) {
    return (w && (w.payday || w.periodEnd || w.weekEnding)) || '';
  }

  function weeksInYear(emp, year) {
    const y = String(year);
    return (emp.payweeks || [])
      .filter((w) => String(paydayOf(w)).slice(0, 4) === y)
      .sort((a, b) => paydayOf(a).localeCompare(paydayOf(b)));
  }

  function inRange(iso, start, end) {
    const s = String(iso || '');
    return s >= start && s <= end;
  }

  function quarterWindow(year, q) {
    const y = Number(year);
    const n = Number(q);
    const map = {
      1: [`${y}-01-01`, `${y}-03-31`],
      2: [`${y}-04-01`, `${y}-06-30`],
      3: [`${y}-07-01`, `${y}-09-30`],
      4: [`${y}-10-01`, `${y}-12-31`]
    };
    const pair = map[n] || map[1];
    return { start: pair[0], end: pair[1], label: `Q${n} ${y}` };
  }

  function emptyTotals() {
    return {
      hours: 0,
      regularHours: 0,
      otHours: 0,
      vacationHours: 0,
      ptoHours: 0,
      holidayHours: 0,
      gross: 0,
      pretax: 0,
      federal: 0,
      ss: 0,
      medicare: 0,
      state: 0,
      childSupport: 0,
      garnishments: 0,
      net: 0,
      weeks: 0
    };
  }

  function addWeek(t, w) {
    t.hours = round2(t.hours + (Number(w.hours) || 0));
    t.regularHours = round2(t.regularHours + (Number(w.regularHours) || 0));
    t.otHours = round2(t.otHours + (Number(w.otHours) || 0));
    t.vacationHours = round2(t.vacationHours + (Number(w.vacationHours) || 0));
    t.ptoHours = round2(t.ptoHours + (Number(w.ptoHours) || 0));
    t.holidayHours = round2(t.holidayHours + (Number(w.holidayHours) || 0));
    t.gross = round2(t.gross + (Number(w.gross) || 0));
    t.pretax = round2(t.pretax + (Number(w.pretax) || 0));
    t.federal = round2(t.federal + (Number(w.federal) || 0));
    t.ss = round2(t.ss + (Number(w.ss) || 0));
    t.medicare = round2(t.medicare + (Number(w.medicare) || 0));
    t.state = round2(t.state + (Number(w.state) || 0));
    t.childSupport = round2(t.childSupport + (Number(w.childSupport) || 0));
    t.garnishments = round2(t.garnishments + (Number(w.garnishments) || 0));
    t.net = round2(t.net + (Number(w.net) || 0));
    t.weeks += 1;
    return t;
  }

  function totalsForWeeks(weeks) {
    return (weeks || []).reduce((acc, w) => addWeek(acc, w), emptyTotals());
  }

  function ytdThrough(emp, year, throughPayday) {
    const weeks = weeksInYear(emp, year).filter((w) => {
      const pd = paydayOf(w);
      return !throughPayday || pd <= throughPayday;
    });
    return totalsForWeeks(weeks);
  }

  function yearTotals(emp, year) {
    return totalsForWeeks(weeksInYear(emp, year));
  }

  function companyPeriodTotals(employees, start, end) {
    const t = emptyTotals();
    t.employeeCount = 0;
    for (const emp of employees || []) {
      const weeks = (emp.payweeks || []).filter((w) => inRange(paydayOf(w), start, end));
      if (!weeks.length) continue;
      t.employeeCount += 1;
      weeks.forEach((w) => addWeek(t, w));
    }
    return t;
  }

  const CSS = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #151922; font-size: 12px; }
    .page { width: 7.7in; min-height: 10in; padding: 0.15in 0.1in 0.3in; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 18px; margin: 0 0 4px; letter-spacing: -0.02em; }
    h2 { font-size: 13px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.06em; color: #2e5db8; border-bottom: 2px solid #2e5db8; padding-bottom: 3px; }
    .muted { color: #5b6472; }
    .row { display: flex; justify-content: space-between; gap: 16px; }
    .brand { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .tag { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: #2e5db8; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 5px 6px; border-bottom: 1px solid #e2e6ee; text-align: left; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #5b6472; background: #f4f6fa; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .box { border: 1px solid #c5ccd8; border-radius: 6px; padding: 8px 10px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .kv { margin: 2px 0; }
    .kv b { display: inline-block; min-width: 118px; color: #3d4a63; font-weight: 600; }
    .total { font-weight: 700; }
    .net { font-size: 16px; color: #1b7a4c; }
    .disclaimer { margin-top: 12px; font-size: 9.5px; color: #5b6472; line-height: 1.4; }
    .w2grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 0; border: 1px solid #222; }
    .w2cell { border: 1px solid #222; padding: 6px 8px; min-height: 42px; }
    .w2cell .l { font-size: 8px; text-transform: uppercase; color: #444; }
    .w2cell .v { font-size: 12px; margin-top: 4px; font-weight: 600; }
  `;

  function wrap(title, inner) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>${esc(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`;
  }

  function header(co, subtitle) {
    return `<div class="brand">
      <div>
        <div class="tag">MOORE'S BODY SHOP PAYROLL</div>
        <h1>${esc(co.name)}</h1>
        <div class="muted">${esc(co.address)}</div>
        <div class="muted">EIN ${esc(co.ein)} · VA withholding ${esc(co.vaAccount)}</div>
      </div>
      <div style="text-align:right">
        <div class="muted">${esc(subtitle || '')}</div>
        <div class="muted">Printed ${esc(new Date().toLocaleString())}</div>
      </div>
    </div>`;
  }

  function paystubHtml(emp, week, ytd, company, settings) {
    const co = companyBlock(company, settings);
    const name = fullName(emp);
    const period = `${week.periodStart || '—'} – ${week.periodEnd || week.weekEnding || '—'}`;
    const inner = `<div class="page">
      ${header(co, 'Employee pay stub')}
      <div class="grid2">
        <div class="box">
          <div class="kv"><b>Employee</b> ${esc(name)}</div>
          <div class="kv"><b>Address</b> ${esc(addr(emp.address))}</div>
          <div class="kv"><b>SSN</b> ${esc(formatSsn(emp.ssn, { last4: true }))}</div>
          <div class="kv"><b>Job</b> ${esc(emp.jobTitle || '—')}</div>
        </div>
        <div class="box">
          <div class="kv"><b>Pay period</b> ${esc(period)}</div>
          <div class="kv"><b>Payday</b> ${esc(week.payday || '—')}</div>
          <div class="kv"><b>Pay type</b> ${esc(emp.payType === 'salary' ? 'Salary' : 'Hourly')} · ${esc(emp.payFrequency || 'weekly')}</div>
          <div class="kv"><b>Rate</b> ${esc(emp.payType === 'salary' ? money(emp.rate) : money(emp.rate) + '/hr')}</div>
        </div>
      </div>
      <h2>Hours</h2>
      <table>
        <thead><tr><th></th><th class="num">This check</th><th class="num">Year to date</th></tr></thead>
        <tbody>
          <tr><td>Regular</td><td class="num">${hoursFmt(week.regularHours)}</td><td class="num">${hoursFmt(ytd.regularHours)}</td></tr>
          <tr><td>Overtime</td><td class="num">${hoursFmt(week.otHours)}</td><td class="num">${hoursFmt(ytd.otHours)}</td></tr>
          <tr><td>Vacation</td><td class="num">${hoursFmt(week.vacationHours)}</td><td class="num">${hoursFmt(ytd.vacationHours)}</td></tr>
          <tr><td>PTO</td><td class="num">${hoursFmt(week.ptoHours)}</td><td class="num">${hoursFmt(ytd.ptoHours)}</td></tr>
          <tr><td>Holiday</td><td class="num">${hoursFmt(week.holidayHours)}</td><td class="num">${hoursFmt(ytd.holidayHours)}</td></tr>
          <tr class="total"><td>Total hours</td><td class="num">${hoursFmt(week.hours)}</td><td class="num">${hoursFmt(ytd.hours)}</td></tr>
        </tbody>
      </table>
      <div class="grid2" style="margin-top:12px">
        <div>
          <h2>Earnings</h2>
          <table>
            <thead><tr><th></th><th class="num">This check</th><th class="num">YTD</th></tr></thead>
            <tbody>
              <tr><td>Gross pay</td><td class="num">${money(week.gross)}</td><td class="num">${money(ytd.gross)}</td></tr>
              <tr><td>Pre-tax deductions</td><td class="num">${money(week.pretax)}</td><td class="num">${money(ytd.pretax)}</td></tr>
              <tr class="total"><td>Net pay</td><td class="num net">${money(week.net)}</td><td class="num">${money(ytd.net)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2>Deductions</h2>
          <table>
            <thead><tr><th></th><th class="num">This check</th><th class="num">YTD</th></tr></thead>
            <tbody>
              <tr><td>Federal income tax</td><td class="num">${money(week.federal)}</td><td class="num">${money(ytd.federal)}</td></tr>
              <tr><td>Social Security</td><td class="num">${money(week.ss)}</td><td class="num">${money(ytd.ss)}</td></tr>
              <tr><td>Medicare</td><td class="num">${money(week.medicare)}</td><td class="num">${money(ytd.medicare)}</td></tr>
              <tr><td>Virginia income tax</td><td class="num">${money(week.state)}</td><td class="num">${money(ytd.state)}</td></tr>
              <tr><td>Child support</td><td class="num">${money(week.childSupport)}</td><td class="num">${money(ytd.childSupport)}</td></tr>
              <tr><td>Other garnishments</td><td class="num">${money(week.garnishments)}</td><td class="num">${money(ytd.garnishments)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <p class="disclaimer">Vacation remaining: ${hoursFmt(emp.vacationHoursBalance)} h · PTO remaining: ${hoursFmt(emp.ptoHoursBalance)} h. This stub is produced from Moore's Body Shop payroll records. Keep with your records.</p>
    </div>`;
    return wrap(`Pay stub · ${name} · ${week.payday || ''}`, inner);
  }

  function w2Html(emp, year, totals, company, settings) {
    const co = companyBlock(company, settings);
    const wages = round2(totals.gross - totals.pretax);
    const inner = `<div class="page">
      ${header(co, `Form W-2 worksheet · tax year ${esc(year)}`)}
      <p class="muted">Use these amounts when you e-file or type Form W-2. This is a payroll worksheet, not the SSA scannable form.</p>
      <div class="grid2" style="margin:10px 0">
        <div class="box"><div class="kv"><b>Employee</b> ${esc(fullName(emp))}</div>
          <div class="kv"><b>Address</b> ${esc(addr(emp.address))}</div>
          <div class="kv"><b>SSN</b> ${esc(formatSsn(emp.ssn))}</div></div>
        <div class="box"><div class="kv"><b>Employer</b> ${esc(co.name)}</div>
          <div class="kv"><b>Address</b> ${esc(co.address)}</div>
          <div class="kv"><b>EIN</b> ${esc(co.ein)}</div></div>
      </div>
      <div class="w2grid">
        <div class="w2cell"><div class="l">1 Wages, tips, other compensation</div><div class="v">${money(wages)}</div></div>
        <div class="w2cell"><div class="l">2 Federal income tax withheld</div><div class="v">${money(totals.federal)}</div></div>
        <div class="w2cell"><div class="l">3 Social Security wages</div><div class="v">${money(totals.gross)}</div></div>
        <div class="w2cell"><div class="l">4 Social Security tax withheld</div><div class="v">${money(totals.ss)}</div></div>
        <div class="w2cell"><div class="l">5 Medicare wages and tips</div><div class="v">${money(totals.gross)}</div></div>
        <div class="w2cell"><div class="l">6 Medicare tax withheld</div><div class="v">${money(totals.medicare)}</div></div>
        <div class="w2cell"><div class="l">15 State</div><div class="v">VA</div></div>
        <div class="w2cell"><div class="l">16 State wages, tips, etc.</div><div class="v">${money(wages)}</div></div>
        <div class="w2cell"><div class="l">17 State income tax</div><div class="v">${money(totals.state)}</div></div>
      </div>
      <p class="disclaimer">Furnish Copy B/C to the employee by January 31. File with SSA (W-2/W-3) per current SSA instructions. Child support and garnishments are not W-2 boxes; they reduced net pay only.</p>
    </div>`;
    return wrap(`W-2 worksheet · ${fullName(emp)} · ${year}`, inner);
  }

  function w3Html(employees, year, company, settings) {
    const co = companyBlock(company, settings);
    let t = emptyTotals();
    const rows = [];
    for (const emp of employees || []) {
      const yt = yearTotals(emp, year);
      if (!yt.weeks) continue;
      addWeek(t, yt);
      rows.push(`<tr><td>${esc(fullName(emp))}</td><td class="num">${money(yt.gross - yt.pretax)}</td><td class="num">${money(yt.federal)}</td><td class="num">${money(yt.ss)}</td><td class="num">${money(yt.medicare)}</td><td class="num">${money(yt.state)}</td></tr>`);
    }
    const inner = `<div class="page">
      ${header(co, `Form W-3 transmittal worksheet · ${esc(year)}`)}
      <table>
        <thead><tr><th>Employee</th><th class="num">Box 1 wages</th><th class="num">FIT</th><th class="num">SS tax</th><th class="num">Med tax</th><th class="num">VA tax</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="6">No pay in this year.</td></tr>'}
        <tr class="total"><td>Totals (W-3)</td><td class="num">${money(t.gross - t.pretax)}</td><td class="num">${money(t.federal)}</td><td class="num">${money(t.ss)}</td><td class="num">${money(t.medicare)}</td><td class="num">${money(t.state)}</td></tr>
        </tbody>
      </table>
      <p class="disclaimer">File W-3 with Copy A of Forms W-2 with the SSA. This worksheet totals Moore's Body Shop payroll for ${esc(year)}.</p>
    </div>`;
    return wrap(`W-3 worksheet · ${year}`, inner);
  }

  function form941Html(employees, year, quarter, company, settings) {
    const co = companyBlock(company, settings);
    const win = quarterWindow(year, quarter);
    const t = companyPeriodTotals(employees, win.start, win.end);
    const ssBoth = round2(t.ss * 2);
    const medBoth = round2(t.medicare * 2);
    const totalTax = round2(t.federal + ssBoth + medBoth);
    const inner = `<div class="page">
      ${header(co, `Form 941 quarterly worksheet · ${esc(win.label)}`)}
      <p class="muted">Due the last day of the month after the quarter (April 30, July 31, October 31, January 31). File electronically or on the IRS form.</p>
      <table>
        <tbody>
          <tr><td>1 Number of employees who received wages this quarter</td><td class="num">${t.employeeCount}</td></tr>
          <tr><td>2 Wages, tips, and other compensation</td><td class="num">${money(t.gross)}</td></tr>
          <tr><td>3 Federal income tax withheld</td><td class="num">${money(t.federal)}</td></tr>
          <tr><td>5a Taxable Social Security wages × 12.4% (employee 6.2% + employer 6.2%)</td><td class="num">${money(ssBoth)}</td></tr>
          <tr><td>5c Taxable Medicare wages × 2.9% (employee 1.45% + employer 1.45%)</td><td class="num">${money(medBoth)}</td></tr>
          <tr class="total"><td>6 Total taxes (lines 3 + 5a + 5c)</td><td class="num">${money(totalTax)}</td></tr>
        </tbody>
      </table>
      <p class="disclaimer">Employer share of FICA is calculated as matching the amounts already withheld from employees in this payroll. Confirm deposit schedule (monthly or semiweekly) before you file.</p>
    </div>`;
    return wrap(`Form 941 worksheet · ${win.label}`, inner);
  }

  function form940Html(employees, year, company, settings) {
    const co = companyBlock(company, settings);
    let futa = 0;
    const rows = [];
    for (const emp of employees || []) {
      const yt = yearTotals(emp, year);
      if (!yt.weeks) continue;
      const wageBase = Math.min(yt.gross, 7000);
      const taxAmt = round2(wageBase * 0.006);
      futa = round2(futa + taxAmt);
      rows.push(`<tr><td>${esc(fullName(emp))}</td><td class="num">${money(yt.gross)}</td><td class="num">${money(wageBase)}</td><td class="num">${money(taxAmt)}</td></tr>`);
    }
    const inner = `<div class="page">
      ${header(co, `Form 940 FUTA worksheet · ${esc(year)}`)}
      <p class="muted">Annual federal unemployment. FUTA wage base $7,000. Credit-reduction rate shown at 0.6% (0.006) assuming full 5.4% state credit. Confirm current IRS rate before paying.</p>
      <table>
        <thead><tr><th>Employee</th><th class="num">Gross</th><th class="num">FUTA wages</th><th class="num">0.6% tax</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="4">No pay in this year.</td></tr>'}
        <tr class="total"><td>Total estimated FUTA</td><td></td><td></td><td class="num">${money(futa)}</td></tr>
        </tbody>
      </table>
    </div>`;
    return wrap(`Form 940 worksheet · ${year}`, inner);
  }

  function va16Html(employees, year, quarter, company, settings) {
    const co = companyBlock(company, settings);
    const win = quarterWindow(year, quarter);
    const t = companyPeriodTotals(employees, win.start, win.end);
    const inner = `<div class="page">
      ${header(co, `Virginia employer withholding worksheet (VA-16 / VA-5) · ${esc(win.label)}`)}
      <p class="muted">VA withholding account ${esc(co.vaAccount)}. File VA-16 (or VA-5 if required) with the Virginia Department of Taxation. Monthly filers generally deposit by the 25th of the following month.</p>
      <table>
        <tbody>
          <tr><td>Period</td><td class="num">${esc(win.start)} – ${esc(win.end)}</td></tr>
          <tr><td>Employees paid</td><td class="num">${t.employeeCount}</td></tr>
          <tr><td>Total Virginia wages</td><td class="num">${money(t.gross)}</td></tr>
          <tr class="total"><td>Virginia income tax withheld (amount to report)</td><td class="num">${money(t.state)}</td></tr>
        </tbody>
      </table>
    </div>`;
    return wrap(`VA withholding worksheet · ${win.label}`, inner);
  }

  function va6Html(employees, year, company, settings) {
    const co = companyBlock(company, settings);
    const t = companyPeriodTotals(employees, `${year}-01-01`, `${year}-12-31`);
    const inner = `<div class="page">
      ${header(co, `Virginia annual reconciliation (VA-6) worksheet · ${esc(year)}`)}
      <p class="muted">Reconcile annual Virginia withholding to W-2 box 17 totals. Due with the Department of Taxation per current VA-6 instructions (typically January 31).</p>
      <table>
        <tbody>
          <tr><td>Virginia withholding account</td><td class="num">${esc(co.vaAccount)}</td></tr>
          <tr><td>W-2s / employees paid</td><td class="num">${t.employeeCount}</td></tr>
          <tr><td>Total Virginia wages</td><td class="num">${money(t.gross)}</td></tr>
          <tr class="total"><td>Total Virginia tax withheld</td><td class="num">${money(t.state)}</td></tr>
        </tbody>
      </table>
    </div>`;
    return wrap(`VA-6 worksheet · ${year}`, inner);
  }

  function vecHtml(employees, year, quarter, company, settings) {
    const co = companyBlock(company, settings);
    const win = quarterWindow(year, quarter);
    const rows = [];
    let gross = 0;
    for (const emp of employees || []) {
      const weeks = (emp.payweeks || []).filter((w) => inRange(paydayOf(w), win.start, win.end));
      if (!weeks.length) continue;
      const t = totalsForWeeks(weeks);
      gross = round2(gross + t.gross);
      rows.push(`<tr><td>${esc(fullName(emp))}</td><td>${esc(formatSsn(emp.ssn, { last4: true }))}</td><td class="num">${hoursFmt(t.hours)}</td><td class="num">${money(t.gross)}</td></tr>`);
    }
    const inner = `<div class="page">
      ${header(co, `VEC quarterly wage listing · ${esc(win.label)}`)}
      <p class="muted">Virginia Employment Commission quarterly contribution and wage report. UI account ${esc(co.vaUiAccount)}. Enter these wages on the VEC filing; the employer UI rate is set by VEC and is not computed in this app.</p>
      <table>
        <thead><tr><th>Employee</th><th>SSN</th><th class="num">Hours</th><th class="num">Gross wages</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="4">No wages this quarter.</td></tr>'}
        <tr class="total"><td>Total</td><td></td><td></td><td class="num">${money(gross)}</td></tr>
        </tbody>
      </table>
    </div>`;
    return wrap(`VEC wage listing · ${win.label}`, inner);
  }

  function registerHtml(employees, year, quarter, company, settings) {
    const co = companyBlock(company, settings);
    const win = quarter ? quarterWindow(year, quarter) : { start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) };
    const rows = [];
    const t = emptyTotals();
    for (const emp of employees || []) {
      const weeks = (emp.payweeks || []).filter((w) => inRange(paydayOf(w), win.start, win.end));
      for (const w of weeks) {
        addWeek(t, w);
        rows.push(`<tr><td>${esc(fullName(emp))}</td><td>${esc(paydayOf(w))}</td><td class="num">${hoursFmt(w.hours)}</td><td class="num">${money(w.gross)}</td><td class="num">${money(w.federal)}</td><td class="num">${money(w.ss)}</td><td class="num">${money(w.medicare)}</td><td class="num">${money(w.state)}</td><td class="num">${money(w.net)}</td></tr>`);
      }
    }
    const inner = `<div class="page">
      ${header(co, `Payroll register · ${esc(win.label)}`)}
      <table>
        <thead><tr><th>Employee</th><th>Payday</th><th class="num">Hours</th><th class="num">Gross</th><th class="num">FIT</th><th class="num">SS</th><th class="num">Med</th><th class="num">VA</th><th class="num">Net</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="9">No payweeks in this period.</td></tr>'}
        <tr class="total"><td>Totals</td><td></td><td class="num">${hoursFmt(t.hours)}</td><td class="num">${money(t.gross)}</td><td class="num">${money(t.federal)}</td><td class="num">${money(t.ss)}</td><td class="num">${money(t.medicare)}</td><td class="num">${money(t.state)}</td><td class="num">${money(t.net)}</td></tr>
        </tbody>
      </table>
    </div>`;
    return wrap(`Payroll register · ${win.label}`, inner);
  }

  function newHireHtml(employees, year, company, settings) {
    const co = companyBlock(company, settings);
    const rows = (employees || [])
      .filter((e) => String(e.hireDate || '').startsWith(String(year)))
      .map((e) => `<tr><td>${esc(fullName(e))}</td><td>${esc(e.hireDate || '—')}</td><td>${esc(addr(e.address))}</td><td>${esc(formatSsn(e.ssn, { last4: true }))}</td></tr>`);
    const inner = `<div class="page">
      ${header(co, `Virginia new-hire listing · ${esc(year)}`)}
      <p class="muted">Report new hires to Virginia New Hire Reporting Center within 20 days of the hire date.</p>
      <table>
        <thead><tr><th>Name</th><th>Hire date</th><th>Address</th><th>SSN</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="4">No hires recorded in this year.</td></tr>'}</tbody>
      </table>
    </div>`;
    return wrap(`New hire listing · ${year}`, inner);
  }

  function combinedPaystubsHtml(items, company, settings) {
    const pages = items
      .map((it) => {
        const html = paystubHtml(it.emp, it.week, it.ytd, company, settings);
        const m = html.match(/<body>([\s\S]*)<\/body>/i);
        return m ? m[1] : '';
      })
      .join('');
    return wrap('Pay stubs', pages || '<div class="page"><p>No pay stubs.</p></div>');
  }

  function combinedW2Html(employees, year, company, settings) {
    const pages = [];
    for (const emp of employees || []) {
      const t = yearTotals(emp, year);
      if (!t.weeks) continue;
      const html = w2Html(emp, year, t, company, settings);
      const m = html.match(/<body>([\s\S]*)<\/body>/i);
      if (m) pages.push(m[1]);
    }
    return wrap(`W-2 worksheets · ${year}`, pages.join('') || '<div class="page"><p>No W-2 wages this year.</p></div>');
  }

  root.MooresReports = {
    companyBlock,
    weeksInYear,
    yearTotals,
    ytdThrough,
    quarterWindow,
    companyPeriodTotals,
    paydayOf,
    paystubHtml,
    w2Html,
    w3Html,
    form941Html,
    form940Html,
    va16Html,
    va6Html,
    vecHtml,
    registerHtml,
    newHireHtml,
    combinedPaystubsHtml,
    combinedW2Html
  };
})(window);
