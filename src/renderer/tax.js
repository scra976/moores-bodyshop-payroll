'use strict';

/**
 * Federal FIT: IRS Pub 15-T (For use in 2026) Worksheet 1A.
 * Virginia: Employer Withholding Instructions (wages after July 1, 2025) —
 * T = (G × P) − [8750 + (E1 × 930) + (E2 × 800)], then 2/3/5/5.75% brackets.
 * FICA: SS 6.2% up to $184,500 YTD; Medicare 1.45%; Additional Medicare 0.9% over $200,000 YTD.
 */
(function (root) {
  const SS_RATE = 0.062;
  const SS_WAGE_BASE = 184500;
  const MEDICARE_RATE = 0.0145;
  const ADD_MEDICARE_RATE = 0.009;
  const ADD_MEDICARE_THRESHOLD = 200000;
  const VA_STD_DED = 8750;
  const VA_STD_DED_MFJ = 17500;
  const VA_E1 = 930;
  const VA_E2 = 800;

  const PERIODS = {
    weekly: 52,
    biweekly: 26,
    semimonthly: 24,
    monthly: 12
  };

  const W4_STD_MFJ = 12900;
  const W4_STD_OTHER = 8600;
  const W4_ALLOWANCE = 4300;

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
    return Math.round(x * 100 + 1e-8) / 100;
  }

  /** Nearest cent, rounding up when the leftover mill is 0.4 or more (QuickBooks Medicare 1¢). */
  function roundUp2(n) {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return 0;
    const cents = x * 100;
    const floor = Math.floor(cents + 1e-9);
    const frac = cents - floor;
    if (frac >= 0.4 - 1e-9) return (floor + 1) / 100;
    return floor / 100;
  }

  function vaIsMarried(employee) {
    const v = String((employee && employee.vaFilingStatus) || '').toLowerCase().trim();
    if (v === 'married' || v === 'mfj' || v.includes('joint')) return true;
    if (v === 'single' || v === 'mfs' || v === 'separate' || v === 'hoh') return false;
    return filingKey(employee) === 'mfj';
  }

  function vaStandardDeduction(employee) {
    return vaIsMarried(employee) ? VA_STD_DED_MFJ : VA_STD_DED;
  }

  function roundHours(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round(x * 100 + 1e-8) / 100;
  }

  function periodsPerYear(freq) {
    const key = String(freq || 'weekly').toLowerCase().trim();
    return PERIODS[key] || 52;
  }

  function numericEmployee(employee) {
    const e = employee && typeof employee === 'object' ? employee : {};
    return {
      ...e,
      rate: e.rate === '' || e.rate == null ? 0 : Number(e.rate) || 0,
      extraFederal: Number(e.extraFederal) || 0,
      extraState: Number(e.extraState) || 0,
      preTaxDeduction: Number(e.preTaxDeduction) || 0,
      w4OtherIncome: Number(e.w4OtherIncome) || 0,
      w4Deductions: Number(e.w4Deductions) || 0,
      w4Step3Dependents: Number(e.w4Step3Dependents) || 0,
      w4Allowances: Number(e.w4Allowances) || 0,
      vaE1: Number(e.vaE1) || 0,
      vaE2: Number(e.vaE2) || 0,
      childSupport: Number(e.childSupport) || 0,
      garnishments: Number(e.garnishments) || 0,
      multipleJobs: e.multipleJobs === true || e.multipleJobs === 'yes' || e.multipleJobs === 'true',
      vaWithhold: e.vaWithhold !== false && e.vaWithhold !== 'exempt',
      payFrequency: String(e.payFrequency || 'weekly').toLowerCase(),
      payType: e.payType === 'salary' ? 'salary' : 'hourly'
    };
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

  /**
   * Salary pay for one period. QuickBooks weekly salary is the paycheck
   * amount (e.g. $835). Annual figures are $10,000 or more and are divided
   * by pay periods. Hourly employees are unchanged.
   */
  function salaryPeriodAmount(employee) {
    const rate = Number(employee && employee.rate) || 0;
    if (!(employee && employee.payType === 'salary') || rate <= 0) return 0;
    const ppy = periodsPerYear(employee.payFrequency);
    if (rate < 10000) return round2(rate);
    return ppy > 0 ? round2(rate / ppy) : 0;
  }

  function hourlyRate(employee) {
    if (employee && employee.payType === 'salary') {
      return salaryPeriodAmount(employee) / 40;
    }
    return Number(employee && employee.rate) || 0;
  }

  function isWeekdayIso(iso) {
    const d = parseISODate(iso);
    if (!d) return false;
    const day = d.getDay();
    return day !== 0 && day !== 6;
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

  function lunchHours(lunchOut, lunchIn) {
    if (!lunchOut || !lunchIn) return 0;
    const [oh, om] = String(lunchOut).split(':').map(Number);
    const [ih, im] = String(lunchIn).split(':').map(Number);
    if ([oh, om, ih, im].some((n) => !Number.isFinite(n))) return 0;
    let start = oh * 60 + (om || 0);
    let end = ih * 60 + (im || 0);
    if (end <= start) return 0;
    return roundHours((end - start) / 60);
  }

  function paidPunchHours(punch) {
    const work = punchHours(punch && punch.clockIn, punch && punch.clockOut);
    const lunch = lunchHours(punch && punch.lunchOut, punch && punch.lunchIn);
    return roundHours(Math.max(0, work - lunch));
  }

  function periodDays(startIso, endIso) {
    const start = parseISODate(startIso);
    const end = parseISODate(endIso);
    if (!start || !end) return [];
    const days = [];
    for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
      days.push(toISODate(d));
    }
    return days;
  }

  function rowHours(punch) {
    if (!punch) return 0;
    const kind = punch.payType || 'regular';
    if (kind === 'vacation' || kind === 'holiday' || kind === 'pto') {
      if (punch.hours !== '' && punch.hours != null) return roundHours(punch.hours);
    }
    if (punch.entryMode === 'hours') return roundHours(punch.hours);
    const paid = paidPunchHours(punch);
    if (paid) return paid;
    return roundHours(punch.hours);
  }

  function hoursBreakdown(punchesOrHours) {
    if (typeof punchesOrHours === 'number' || (typeof punchesOrHours === 'string' && punchesOrHours.trim() !== '' && Number.isFinite(Number(punchesOrHours)))) {
      const h = roundHours(Math.max(0, Number(punchesOrHours)));
      return { regularHours: h, vacationHours: 0, holidayHours: 0, ptoHours: 0, totalHours: h };
    }
    if (punchesOrHours && !Array.isArray(punchesOrHours) && typeof punchesOrHours === 'object') {
      const regularHours = roundHours(punchesOrHours.regularHours || 0);
      const vacationHours = roundHours(punchesOrHours.vacationHours || 0);
      const holidayHours = roundHours(punchesOrHours.holidayHours || 0);
      const ptoHours = roundHours(punchesOrHours.ptoHours || 0);
      return {
        regularHours,
        vacationHours,
        holidayHours,
        ptoHours,
        totalHours: roundHours(regularHours + vacationHours + holidayHours + ptoHours)
      };
    }
    const punches = Array.isArray(punchesOrHours) ? punchesOrHours : [];
    let regularHours = 0;
    let vacationHours = 0;
    let holidayHours = 0;
    let ptoHours = 0;
    for (const p of punches) {
      const h = rowHours(p);
      const kind = p.payType || 'regular';
      if (kind === 'vacation') vacationHours += h;
      else if (kind === 'holiday') holidayHours += h;
      else if (kind === 'pto') ptoHours += h;
      else regularHours += h;
    }
    regularHours = roundHours(regularHours);
    vacationHours = roundHours(vacationHours);
    holidayHours = roundHours(holidayHours);
    ptoHours = roundHours(ptoHours);
    return {
      regularHours,
      vacationHours,
      holidayHours,
      ptoHours,
      totalHours: roundHours(regularHours + vacationHours + holidayHours + ptoHours)
    };
  }

  function leaveYear(now) {
    const d = now instanceof Date ? now : new Date();
    return d.getFullYear();
  }

  function companyLeaveDefaults(settings) {
    return {
      vacation: roundHours(Math.max(0, Number(settings && settings.vacationHoursPerYear) || 0)),
      pto: roundHours(Math.max(0, Number(settings && settings.ptoHoursPerYear) || 0))
    };
  }

  function ensureLeaveBalances(employee, settings, now) {
    if (!employee || typeof employee !== 'object') return employee;
    const year = leaveYear(now);
    const defs = companyLeaveDefaults(settings);
    if (employee.vacationYear !== year) {
      employee.vacationHoursBalance = defs.vacation;
      employee.vacationYear = year;
    } else if (employee.vacationHoursBalance == null || employee.vacationHoursBalance === '') {
      employee.vacationHoursBalance = defs.vacation;
    } else {
      employee.vacationHoursBalance = roundHours(employee.vacationHoursBalance);
    }
    if (employee.ptoYear !== year) {
      employee.ptoHoursBalance = defs.pto;
      employee.ptoYear = year;
    } else if (employee.ptoHoursBalance == null || employee.ptoHoursBalance === '') {
      employee.ptoHoursBalance = defs.pto;
    } else {
      employee.ptoHoursBalance = roundHours(employee.ptoHoursBalance);
    }
    return employee;
  }

  function applyLeaveUsed(employee, nextUsed, prevUsed) {
    if (!employee) return employee;
    const prevVac = roundHours(prevUsed && prevUsed.vacationHours);
    const prevPto = roundHours(prevUsed && prevUsed.ptoHours);
    const nextVac = roundHours(nextUsed && nextUsed.vacationHours);
    const nextPto = roundHours(nextUsed && nextUsed.ptoHours);
    employee.vacationHoursBalance = roundHours(
      Math.max(0, roundHours(employee.vacationHoursBalance) + prevVac - nextVac)
    );
    employee.ptoHoursBalance = roundHours(
      Math.max(0, roundHours(employee.ptoHoursBalance) + prevPto - nextPto)
    );
    return employee;
  }

  function totalPunchHours(punches) {
    return hoursBreakdown(punches).totalHours;
  }

  function usesLegacyW4(employee) {
    const y = String((employee && employee.w4Form) || '2020').toLowerCase();
    return y === '2019' || y === 'legacy' || y === 'pre2020';
  }

  function filingKey(employee) {
    const raw = String((employee && employee.filingStatus) || 'single').toLowerCase().trim();
    if (raw === 'mfj' || raw === 'married' || raw.includes('joint')) return 'mfj';
    if (raw === 'hoh' || raw.includes('head')) return 'hoh';
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

  function federalPub15T(employee, taxableWages, ppy) {
    const line1a = Math.max(0, Number(taxableWages) || 0);
    const line1b = ppy || 52;
    const line1c = line1a * line1b;
    const extra = Math.max(0, Number(employee && employee.extraFederal) || 0);
    const legacy = usesLegacyW4(employee);
    let key = filingKey(employee);
    if (legacy && key === 'hoh') key = 'single';

    let line1d = 0;
    let line1f = 0;
    let line1g = 0;
    let step2 = false;
    let line1i = 0;
    let line3a = 0;

    if (legacy) {
      const allowances = Math.max(0, Number(employee && employee.w4Allowances) || 0);
      line1f = allowances * W4_ALLOWANCE;
      line1i = Math.max(0, line1c - line1f);
    } else {
      line1d = Math.max(0, Number(employee && employee.w4OtherIncome) || 0);
      const line1e = line1c + line1d;
      line1f = Math.max(0, Number(employee && employee.w4Deductions) || 0);
      step2 = Boolean(employee && employee.multipleJobs);
      line1g = step2 ? 0 : key === 'mfj' ? W4_STD_MFJ : W4_STD_OTHER;
      line1i = Math.max(0, line1e - line1f - line1g);
      line3a = Math.max(0, Number(employee && employee.w4Step3Dependents) || 0);
    }

    const table = step2
      ? P15T_STEP2_CHECKBOX[key] || P15T_STEP2_CHECKBOX.single
      : P15T_STANDARD[key] || P15T_STANDARD.single;
    const line2g = lookupAnnualTable(line1i, table);
    const line2h = line2g / line1b;
    const line3b = line3a / line1b;
    const tentative = Math.max(0, line2h - line3b);
    return {
      tentative: round2(tentative),
      extra: round2(extra),
      total: round2(tentative + extra),
      line1a: round2(line1a),
      line1b,
      line1c: round2(line1c),
      line1g: round2(line1g),
      line1i: round2(line1i),
      table: `${key}:${legacy ? 'w4-2019' : step2 ? 'step2' : 'standard'}`
    };
  }

  function virginiaWithholding(employee, taxableWages, ppy) {
    const extra = Math.max(0, Number(employee && employee.extraState) || 0);
    const exempt = employee && (employee.vaWithhold === false || employee.vaWithhold === 'exempt');
    if (exempt) {
      return { tentative: 0, extra: round2(extra), total: round2(extra) };
    }
    const g = Math.max(0, Number(taxableWages) || 0);
    const periods = ppy || 52;
    const e1 = Math.max(0, Number(employee && employee.vaE1) || 0);
    const e2 = Math.max(0, Number(employee && employee.vaE2) || 0);
    const std = vaStandardDeduction(employee);
    const T = g * periods - (std + e1 * VA_E1 + e2 * VA_E2);
    let W = 0;
    if (T > 0) {
      if (T <= 3000) W = 0.02 * T;
      else if (T <= 5000) W = 60 + 0.03 * (T - 3000);
      else if (T <= 17000) W = 120 + 0.05 * (T - 5000);
      else W = 720 + 0.0575 * (T - 17000);
      W = W / periods;
    }
    const tentative = Math.max(0, W);
    return {
      tentative: round2(tentative),
      extra: round2(extra),
      total: round2(tentative + extra)
    };
  }

  function cappedPeriodTax(ytdBefore, thisWages, rate, cap) {
    const prev = Math.min(Math.max(0, ytdBefore), cap);
    const next = Math.min(Math.max(0, ytdBefore) + Math.max(0, thisWages), cap);
    return round2(next * rate - prev * rate);
  }

  function additionalMedicare(ytdBefore, thisWages) {
    const prev = Math.max(0, ytdBefore - ADD_MEDICARE_THRESHOLD);
    const next = Math.max(0, ytdBefore + thisWages - ADD_MEDICARE_THRESHOLD);
    return round2(next * ADD_MEDICARE_RATE - prev * ADD_MEDICARE_RATE);
  }

  function computePay(employee, punchesOrHours, opts) {
    employee = numericEmployee(employee);
    const breakdown = hoursBreakdown(punchesOrHours);
    const ppy = periodsPerYear(employee.payFrequency);
    const hourly = hourlyRate(employee);
    const salaried = employee.payType === 'salary';
    let regularHours = breakdown.regularHours;
    const vacationHours = breakdown.vacationHours;
    const holidayHours = breakdown.holidayHours;
    const ptoHours = breakdown.ptoHours || 0;
    if (salaried && regularHours < 40) regularHours = 40;
    const hours = roundHours(regularHours + vacationHours + holidayHours + ptoHours);
    const otHours = roundHours(Math.max(0, regularHours - 40));
    const straightHours = roundHours(Math.min(40, regularHours));
    const leavePay = salaried ? 0 : vacationHours * hourly + holidayHours * hourly + ptoHours * hourly;
    const gross = round2(straightHours * hourly + otHours * hourly * 1.5 + leavePay);
    const pretax = round2(Math.max(0, Number(employee && employee.preTaxDeduction) || 0));
    const taxable = round2(Math.max(0, gross - pretax));
    const ytdGross = round2((opts && opts.ytdGross) || 0);

    const ssWages = Math.min(gross, Math.max(0, SS_WAGE_BASE - ytdGross));
    const ss = round2(ssWages * SS_RATE);
    const medicareYtdBefore = roundUp2(ytdGross * MEDICARE_RATE);
    const medicareYtdAfter = roundUp2((ytdGross + gross) * MEDICARE_RATE);
    const medicareRegular = round2(Math.max(0, medicareYtdAfter - medicareYtdBefore));
    const addMed = additionalMedicare(ytdGross, gross);
    const medicare = round2(medicareRegular + addMed);

    const fit = federalPub15T(employee, taxable, ppy);
    const va = virginiaWithholding(employee, taxable, ppy);
    const federal = fit.total;
    const state = va.total;
    const totalTaxes = round2(federal + ss + medicare + state);
    const afterTax = round2(gross - pretax - federal - ss - medicare - state);
    const childSupportReq = round2(Math.max(0, Number(employee && employee.childSupport) || 0));
    const garnishReq = round2(Math.max(0, Number(employee && employee.garnishments) || 0));
    const childSupport = round2(Math.min(childSupportReq, Math.max(0, afterTax)));
    const garnishments = round2(Math.min(garnishReq, Math.max(0, afterTax - childSupport)));
    const net = round2(afterTax - childSupport - garnishments);

    return {
      hourly: round2(hourly),
      totalHours: hours,
      regularHours,
      vacationHours,
      holidayHours,
      ptoHours,
      straightHours,
      otHours,
      gross,
      pretax,
      taxable,
      federal,
      federalComputed: fit.tentative,
      federalExtra: fit.extra,
      federalWorksheet: fit,
      ss,
      medicare,
      additionalMedicare: addMed,
      state,
      stateComputed: va.tentative,
      stateExtra: va.extra,
      childSupport,
      garnishments,
      totalTaxes,
      net,
      periodsPerYear: ppy,
      ytdGross: round2(ytdGross + gross)
    };
  }

  root.MooresTax = {
    SS_RATE,
    SS_WAGE_BASE,
    MEDICARE_RATE,
    ADD_MEDICARE_RATE,
    ADD_MEDICARE_THRESHOLD,
    VA_STD_DED,
    VA_STD_DED_MFJ,
    VA_E1,
    VA_E2,
    PERIODS,
    W4_STD_MFJ,
    W4_STD_OTHER,
    W4_ALLOWANCE,
    usesLegacyW4,
    round2,
    roundUp2,
    roundHours,
    vaIsMarried,
    vaStandardDeduction,
    periodsPerYear,
    hourlyRate,
    salaryPeriodAmount,
    isWeekdayIso,
    punchHours,
    lunchHours,
    paidPunchHours,
    periodDays,
    rowHours,
    hoursBreakdown,
    totalPunchHours,
    leaveYear,
    companyLeaveDefaults,
    ensureLeaveBalances,
    applyLeaveUsed,
    numericEmployee,
    federalPub15T,
    virginiaWithholding,
    computePay,
    payPeriodFromDate,
    currentPayPeriod,
    formatPeriodLabel,
    toISODate,
    parseISODate,
    addDays
  };
})(window);
