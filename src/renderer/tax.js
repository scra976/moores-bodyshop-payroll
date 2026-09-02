'use strict';

/**
 * Federal FIT: IRS Pub 15-T (For use in 2026) Worksheet 1A,
 * Percentage Method Tables for Automated Payroll Systems,
 * Form W-4 (2020 or later).
 * Virginia remains a separate state estimate.
 */
(function (root) {
  const SS_RATE = 0.062;
  const SS_WAGE_BASE = 176100;
  const MEDICARE_RATE = 0.0145;

  const PERIODS = {
    weekly: 52,
    biweekly: 26,
    semimonthly: 24,
    monthly: 12
  };

  const W4_STD_MFJ = 12900;
  const W4_STD_OTHER = 8600;

  // Pub 15-T 2026 Annual Percentage Method tables.
  // Columns: atLeast, lessThan, baseTax, rate, exceeds
  const P15T_STANDARD = {
    single: [
      { atLeast: 0, lessThan: 7500, base: 0, rate: 0, exceeds: 0 },
      { atLeast: 7500, lessThan: 19900, base: 0, rate: 0.1, exceeds: 7500 },
      { atLeast: 19900, lessThan: 57900, base: 1240, rate: 0.12, exceeds: 19900 },
      { atLeast: 57900, lessThan: 113200, base: 5800, rate: 0.22, exceeds: 57900 },
      { atLeast: 113200, lessThan: 209275, base: 17966, rate: 0.24, exceeds: 113200 },
      { atLeast: 209275, lessThan: 263725, base: 41024, rate: 0.32, exceeds: 209275 },
      { atLeast: 263725, lessThan: 648100, base: 58448, rate: 0.35, exceeds: 263725 },
      { atLeast: 648100, lessThan: Infinity, base: 192979.25, rate: 0.37, exceeds: 648100 }
    ],
    mfj: [
      { atLeast: 0, lessThan: 19300, base: 0, rate: 0, exceeds: 0 },
      { atLeast: 19300, lessThan: 44100, base: 0, rate: 0.1, exceeds: 19300 },
      { atLeast: 44100, lessThan: 120100, base: 2480, rate: 0.12, exceeds: 44100 },
      { atLeast: 120100, lessThan: 230700, base: 11600, rate: 0.22, exceeds: 120100 },
      { atLeast: 230700, lessThan: 422850, base: 35932, rate: 0.24, exceeds: 230700 },
      { atLeast: 422850, lessThan: 531750, base: 82048, rate: 0.32, exceeds: 422850 },
      { atLeast: 531750, lessThan: 788000, base: 116896, rate: 0.35, exceeds: 531750 },
      { atLeast: 788000, lessThan: Infinity, base: 206583.5, rate: 0.37, exceeds: 788000 }
    ],
    hoh: [
      { atLeast: 0, lessThan: 15550, base: 0, rate: 0, exceeds: 0 },
      { atLeast: 15550, lessThan: 33250, base: 0, rate: 0.1, exceeds: 15550 },
      { atLeast: 33250, lessThan: 83000, base: 1770, rate: 0.12, exceeds: 33250 },
      { atLeast: 83000, lessThan: 121250, base: 7740, rate: 0.22, exceeds: 83000 },
      { atLeast: 121250, lessThan: 217300, base: 16155, rate: 0.24, exceeds: 121250 },
      { atLeast: 217300, lessThan: 271750, base: 39207, rate: 0.32, exceeds: 217300 },
      { atLeast: 271750, lessThan: 656150, base: 56631, rate: 0.35, exceeds: 271750 },
      { atLeast: 656150, lessThan: Infinity, base: 191171, rate: 0.37, exceeds: 656150 }
    ]
  };

  const P15T_STEP2_CHECKBOX = {
    single: [
      { atLeast: 0, lessThan: 8050, base: 0, rate: 0, exceeds: 0 },
      { atLeast: 8050, lessThan: 14250, base: 0, rate: 0.1, exceeds: 8050 },
      { atLeast: 14250, lessThan: 33250, base: 620, rate: 0.12, exceeds: 14250 },
      { atLeast: 33250, lessThan: 60900, base: 2900, rate: 0.22, exceeds: 33250 },
      { atLeast: 60900, lessThan: 108938, base: 8983, rate: 0.24, exceeds: 60900 },
      { atLeast: 108938, lessThan: 136163, base: 20512, rate: 0.32, exceeds: 108938 },
      { atLeast: 136163, lessThan: 328350, base: 29224, rate: 0.35, exceeds: 136163 },
      { atLeast: 328350, lessThan: Infinity, base: 96489.63, rate: 0.37, exceeds: 328350 }
    ],
    mfj: [
      { atLeast: 0, lessThan: 16100, base: 0, rate: 0, exceeds: 0 },
      { atLeast: 16100, lessThan: 28500, base: 0, rate: 0.1, exceeds: 16100 },
      { atLeast: 28500, lessThan: 66500, base: 1240, rate: 0.12, exceeds: 28500 },
      { atLeast: 66500, lessThan: 121800, base: 5800, rate: 0.22, exceeds: 66500 },
      { atLeast: 121800, lessThan: 217875, base: 17966, rate: 0.24, exceeds: 121800 },
      { atLeast: 217875, lessThan: 272325, base: 41024, rate: 0.32, exceeds: 217875 },
      { atLeast: 272325, lessThan: 400450, base: 58448, rate: 0.35, exceeds: 272325 },
      { atLeast: 400450, lessThan: Infinity, base: 103291.75, rate: 0.37, exceeds: 400450 }
    ],
    hoh: [
      { atLeast: 0, lessThan: 12075, base: 0, rate: 0, exceeds: 0 },
      { atLeast: 12075, lessThan: 20925, base: 0, rate: 0.1, exceeds: 12075 },
      { atLeast: 20925, lessThan: 45800, base: 885, rate: 0.12, exceeds: 20925 },
      { atLeast: 45800, lessThan: 64925, base: 3870, rate: 0.22, exceeds: 45800 },
      { atLeast: 64925, lessThan: 112950, base: 8077.5, rate: 0.24, exceeds: 64925 },
      { atLeast: 112950, lessThan: 140175, base: 19603.5, rate: 0.32, exceeds: 112950 },
      { atLeast: 140175, lessThan: 332375, base: 28315.5, rate: 0.35, exceeds: 140175 },
      { atLeast: 332375, lessThan: Infinity, base: 95585.5, rate: 0.37, exceeds: 332375 }
    ]
  };

  function round2(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  function roundHours(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  function periodsPerYear(freq) {
    return PERIODS[freq] || 52;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseISODate(iso) {
    const parts = String(iso || '').split('-').map(Number);
    if (parts.length < 3 || !parts[0]) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  /**
   * Weekly pay period: Wednesday through Tuesday.
   * Payday is the Wednesday after that Tuesday.
   * `periodEndIso` is the Tuesday that ends the period (or any date in/near it).
   */
  function payPeriodFromDate(isoOrDate) {
    let d;
    if (isoOrDate instanceof Date) d = new Date(isoOrDate.getFullYear(), isoOrDate.getMonth(), isoOrDate.getDate());
    else d = parseISODate(isoOrDate) || new Date();
    const day = d.getDay();
    const daysAfterTue = (day - 2 + 7) % 7;
    const periodEnd = addDays(d, -daysAfterTue);
    const periodStart = addDays(periodEnd, -6);
    const payday = addDays(periodEnd, 1);
    return {
      periodStart: toISODate(periodStart),
      periodEnd: toISODate(periodEnd),
      payday: toISODate(payday)
    };
  }

  function currentPayPeriod(now) {
    const today = now instanceof Date ? now : new Date();
    const local = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (local.getDay() === 3) {
      const periodEnd = addDays(local, -1);
      return {
        periodStart: toISODate(addDays(periodEnd, -6)),
        periodEnd: toISODate(periodEnd),
        payday: toISODate(local)
      };
    }
    return payPeriodFromDate(local);
  }

  function formatPeriodLabel(startIso, endIso) {
    if (!startIso && !endIso) return '';
    if (startIso && endIso) return `${startIso} – ${endIso}`;
    return endIso || startIso;
  }

  function virginiaAnnualTax(annual) {
    let remaining = Math.max(0, Number(annual) || 0);
    let tax = 0;
    const bands = [
      { size: 3000, rate: 0.02 },
      { size: 2000, rate: 0.03 },
      { size: 12000, rate: 0.05 },
      { size: Infinity, rate: 0.0575 }
    ];
    for (const band of bands) {
      const slice = Math.min(remaining, band.size);
      tax += slice * band.rate;
      remaining -= slice;
      if (remaining <= 0) break;
    }
    return tax;
  }

  function hourlyRate(employee) {
    const rate = Number(employee && employee.rate) || 0;
    if (employee && employee.payType === 'salary') {
      const ppy = periodsPerYear(employee.payFrequency);
      return ppy > 0 ? rate / (ppy * 40) : 0;
    }
    return rate;
  }

  function punchHours(clockIn, clockOut) {
    if (!clockIn || !clockOut) return 0;
    const [ih, im] = String(clockIn).split(':').map(Number);
    const [oh, om] = String(clockOut).split(':').map(Number);
    if ([ih, im, oh, om].some((n) => !Number.isFinite(n))) return 0;
    let start = ih * 60 + (im || 0);
    let end = oh * 60 + (om || 0);
    if (end <= start) end += 24 * 60;
    return roundHours((end - start) / 60);
  }

  function totalPunchHours(punches) {
    if (!Array.isArray(punches)) return 0;
    return roundHours(punches.reduce((sum, p) => sum + punchHours(p.clockIn, p.clockOut), 0));
  }

  function filingKey(employee) {
    const raw = (employee && employee.filingStatus) || 'single';
    if (raw === 'mfj' || raw === 'hoh' || raw === 'single') return raw;
    return 'single';
  }

  function lookupAnnualTable(amount, rows) {
    const wage = Math.max(0, Number(amount) || 0);
    let row = rows[0];
    for (let i = 0; i < rows.length; i++) {
      if (wage >= rows[i].atLeast && wage < rows[i].lessThan) {
        row = rows[i];
        break;
      }
      if (i === rows.length - 1) row = rows[i];
    }
    const excess = Math.max(0, wage - row.exceeds);
    return row.base + excess * row.rate;
  }

  /**
   * Pub 15-T Worksheet 1A (2026) for Form W-4 2020 or later.
   * Returns federal income tax to withhold this pay period.
   */
  function federalPub15T(employee, taxableWages, ppy) {
    const line1a = Math.max(0, Number(taxableWages) || 0);
    const line1b = ppy || 52;
    const line1c = line1a * line1b;
    const line1d = Math.max(0, Number(employee && employee.w4OtherIncome) || 0);
    const line1e = line1c + line1d;
    const line1f = Math.max(0, Number(employee && employee.w4Deductions) || 0);
    const step2 = Boolean(employee && employee.multipleJobs);
    const line1g = step2 ? 0 : filingKey(employee) === 'mfj' ? W4_STD_MFJ : W4_STD_OTHER;
    const line1h = line1f + line1g;
    const line1i = Math.max(0, line1e - line1h);

    const key = filingKey(employee);
    const table = step2
      ? P15T_STEP2_CHECKBOX[key] || P15T_STEP2_CHECKBOX.single
      : P15T_STANDARD[key] || P15T_STANDARD.single;
    const line2g = lookupAnnualTable(line1i, table);
    const line2h = line2g / line1b;

    const line3a = Math.max(0, Number(employee && employee.w4Step3Dependents) || 0);
    const line3b = line3a / line1b;
    const line3c = Math.max(0, line2h - line3b);
    const line4a = Math.max(0, Number(employee && employee.extraFederal) || 0);
    return round2(line3c + line4a);
  }

  function computePay(employee, totalHours) {
    const hours = Math.max(0, Number(totalHours) || 0);
    const ppy = periodsPerYear(employee && employee.payFrequency);
    const hourly = hourlyRate(employee);
    const regularHours = roundHours(Math.min(40, hours));
    const otHours = roundHours(Math.max(0, hours - 40));
    const gross = round2(regularHours * hourly + otHours * hourly * 1.5);
    const pretax = round2(Math.max(0, Number(employee && employee.preTaxDeduction) || 0));
    const taxable = round2(Math.max(0, gross - pretax));

    const ssWages = Math.min(gross, SS_WAGE_BASE / ppy);
    const ss = round2(SS_RATE * Math.max(0, ssWages));
    const medicare = round2(MEDICARE_RATE * gross);

    const federal = federalPub15T(employee, taxable, ppy);

    let state = 0;
    const withholdVa = employee && employee.vaWithhold !== false && employee.vaWithhold !== 'exempt';
    if (withholdVa) {
      const annualTaxable = taxable * ppy;
      state = virginiaAnnualTax(annualTaxable) / ppy;
      state += Number(employee && employee.extraState) || 0;
      state = round2(Math.max(0, state));
    }

    const net = round2(gross - pretax - federal - ss - medicare - state);
    const totalTaxes = round2(federal + ss + medicare + state);

    return {
      hourly: round2(hourly),
      totalHours: roundHours(hours),
      regularHours,
      otHours,
      gross,
      pretax,
      taxable,
      federal,
      ss,
      medicare,
      state,
      totalTaxes,
      net,
      periodsPerYear: ppy
    };
  }

  root.MooresTax = {
    SS_RATE,
    SS_WAGE_BASE,
    MEDICARE_RATE,
    PERIODS,
    W4_STD_MFJ,
    W4_STD_OTHER,
    round2,
    roundHours,
    periodsPerYear,
    hourlyRate,
    punchHours,
    totalPunchHours,
    federalPub15T,
    computePay,
    payPeriodFromDate,
    currentPayPeriod,
    formatPeriodLabel,
    toISODate,
    parseISODate,
    addDays
  };
})(window);
