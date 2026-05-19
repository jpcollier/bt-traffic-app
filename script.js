const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    navButtons.forEach(b => b.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
  });
});

const btDataApi = (() => {
  const ENDPOINT = 'https://data.ny.gov/resource/ebfx-2m7v.json';
  const FIELD_MAP = {
    date: 'date',
    hour: 'hour',
    facility: 'facility_name',
    direction: 'direction',
    vehicleClass: 'vehicle_class',
    paymentType: 'payment_type'
  };

  const dateFmt = (date) => date.toISOString().slice(0, 10);

  const latestFullWindow = (windowType) => {
    const now = new Date();
    const utcDay = now.getUTCDay(); // Sun=0
    const latestFullDayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (windowType === 'latest_day') {
      const start = new Date(latestFullDayEnd);
      start.setUTCDate(start.getUTCDate() - 1);
      return { startDate: dateFmt(start), endDate: dateFmt(start) };
    }

    const daysSinceWeekEnd = utcDay === 0 ? 7 : utcDay;
    const weekEnd = new Date(latestFullDayEnd);
    weekEnd.setUTCDate(weekEnd.getUTCDate() - daysSinceWeekEnd);
    const weekStart = new Date(weekEnd);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    return { startDate: dateFmt(weekStart), endDate: dateFmt(weekEnd) };
  };

  const escapeSocrata = (value) => String(value).replace(/'/g, "''");

  const buildWhereClause = (q) => {
    const predicates = [];

    if (q.startDate && q.endDate) {
      predicates.push(`${FIELD_MAP.date} between '${escapeSocrata(q.startDate)}' and '${escapeSocrata(q.endDate)}'`);
    }
    if (q.facility) predicates.push(`${FIELD_MAP.facility} = '${escapeSocrata(q.facility)}'`);
    if (q.direction) predicates.push(`${FIELD_MAP.direction} = '${escapeSocrata(q.direction)}'`);
    if (q.vehicleClass) predicates.push(`${FIELD_MAP.vehicleClass} = '${escapeSocrata(q.vehicleClass)}'`);
    if (q.paymentType) predicates.push(`${FIELD_MAP.paymentType} = '${escapeSocrata(q.paymentType)}'`);

    return predicates.join(' AND ');
  };

  const buildQuery = (query = {}) => {
    const qs = new URLSearchParams();
    const where = buildWhereClause(query);
    if (where) qs.set('$where', where);
    qs.set('$order', query.orderBy || `${FIELD_MAP.date} DESC, ${FIELD_MAP.hour} DESC`);
    qs.set('$limit', String(query.limit ?? 250));
    qs.set('$offset', String(query.offset ?? 0));
    return qs;
  };

  const shouldRetry = (status) => status === 408 || status === 429 || status >= 500;

  const fetchWithRetry = async (url, options = {}, retries = 3, backoffMs = 500) => {
    let attempt = 0;
    let lastError;

    while (attempt <= retries) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          if (attempt < retries && shouldRetry(response.status)) {
            throw new Error(`Transient HTTP ${response.status}`);
          }
          throw new Error(`Request failed (${response.status} ${response.statusText})`);
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt >= retries) break;
        await new Promise(resolve => setTimeout(resolve, backoffMs * (2 ** attempt)));
      }
      attempt += 1;
    }

    throw lastError;
  };

  const fetchDataset = async (query) => {
    const qs = buildQuery(query);
    const url = `${ENDPOINT}?${qs.toString()}`;
    const response = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });
    const records = await response.json();
    return {
      records: Array.isArray(records) ? records : [],
      requestUrl: url,
      fetchedAt: new Date().toISOString()
    };
  };

  return {
    fetchDataset,
    latestFullWindow,
    fieldMap: FIELD_MAP
  };
})();

const metrics = (() => {
  const toIsoDate = (dateLike) => {
    const dt = new Date(`${dateLike}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };

  const isoWeekParts = (dateLike) => {
    const dt = toIsoDate(dateLike);
    if (!dt) return null;
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const isoYear = dt.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
    return { isoYear, isoWeek };
  };

  const isoWeekStart = (isoYear, isoWeek) => {
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
    const start = new Date(week1Monday);
    start.setUTCDate(start.getUTCDate() + ((isoWeek - 1) * 7));
    return start;
  };

  const addDays = (date, days) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };

  const dateFmt = (date) => date.toISOString().slice(0, 10);
  const sum = (rows) => rows.reduce((acc, row) => acc + Number(row.crossings || 0), 0);
  const divideOrZero = (num, denom) => (denom ? num / denom : 0);

  const pctChange = (current, prior) => divideOrZero(current - prior, prior) * 100;
  const sharePct = (part, whole) => divideOrZero(part, whole) * 100;
  const sharePointDelta = (currentShare, priorShare) => currentShare - priorShare;

  const periodWindows = (records) => {
    if (!records.length) return null;
    const dated = records.map(r => r.date).filter(Boolean).sort();
    const latest = dated[dated.length - 1];
    const latestIso = isoWeekParts(latest);
    if (!latestIso) return null;

    const currentStart = isoWeekStart(latestIso.isoYear, latestIso.isoWeek);
    const currentEnd = addDays(currentStart, 6);
    const wowStart = addDays(currentStart, -7);
    const wowEnd = addDays(currentEnd, -7);
    const yoyStart = isoWeekStart(latestIso.isoYear - 1, latestIso.isoWeek);
    const yoyEnd = addDays(yoyStart, 6);

    return {
      current: { startDate: dateFmt(currentStart), endDate: dateFmt(currentEnd) },
      wow: { startDate: dateFmt(wowStart), endDate: dateFmt(wowEnd) },
      yoy: { startDate: dateFmt(yoyStart), endDate: dateFmt(yoyEnd) }
    };
  };

  const betweenInclusive = (dateValue, startDate, endDate) => dateValue >= startDate && dateValue <= endDate;

  const filterPeriod = (records, window) => records.filter(r => betweenInclusive(r.date, window.startDate, window.endDate));

  const keyedTotals = (records, keyFn) => {
    const map = new Map();
    records.forEach(row => {
      const key = keyFn(row);
      map.set(key, (map.get(key) || 0) + Number(row.crossings || 0));
    });
    return map;
  };

  const comparisonMetric = (current, prior) => ({
    current,
    prior,
    deltaAbs: current - prior,
    deltaPct: pctChange(current, prior)
  });

  const computeExecutiveKpis = (currentRows, wowRows, yoyRows) => {
    const totalCurrent = sum(currentRows);
    const totalWow = sum(wowRows);
    const totalYoy = sum(yoyRows);

    const ezCurrent = sum(currentRows.filter(r => r.payment_type === 'E-ZPass'));
    const ezYoy = sum(yoyRows.filter(r => r.payment_type === 'E-ZPass'));
    const tbmCurrent = sum(currentRows.filter(r => r.payment_type === 'Tolls by Mail'));
    const tbmYoy = sum(yoyRows.filter(r => r.payment_type === 'Tolls by Mail'));

    const ezShareCurrent = sharePct(ezCurrent, totalCurrent);
    const ezShareYoy = sharePct(ezYoy, totalYoy);
    const tbmShareCurrent = sharePct(tbmCurrent, totalCurrent);
    const tbmShareYoy = sharePct(tbmYoy, totalYoy);

    return {
      totalCrossings: totalCurrent,
      wow: comparisonMetric(totalCurrent, totalWow),
      yoy: comparisonMetric(totalCurrent, totalYoy),
      ezpassShare: { current: ezShareCurrent, prior: ezShareYoy, ppDelta: sharePointDelta(ezShareCurrent, ezShareYoy) },
      tbmShare: { current: tbmShareCurrent, prior: tbmShareYoy, ppDelta: sharePointDelta(tbmShareCurrent, tbmShareYoy) }
    };
  };

  const aggregateFacilityComparison = (currentRows, wowRows, yoyRows) => {
    const curr = keyedTotals(currentRows, r => r.facility_name || 'Unknown');
    const wow = keyedTotals(wowRows, r => r.facility_name || 'Unknown');
    const yoy = keyedTotals(yoyRows, r => r.facility_name || 'Unknown');

    return Array.from(new Set([...curr.keys(), ...wow.keys(), ...yoy.keys()]))
      .map(facility => {
        const latestVolume = curr.get(facility) || 0;
        const wowVolume = wow.get(facility) || 0;
        const yoyVolume = yoy.get(facility) || 0;
        return {
          facility,
          volume: latestVolume,
          wow: comparisonMetric(latestVolume, wowVolume),
          yoy: comparisonMetric(latestVolume, yoyVolume)
        };
      });
  };

  const topMoverAndDrop = (facilityComparison) => {
    if (!facilityComparison.length) return { topMover: null, biggestDrop: null };
    const sorted = [...facilityComparison].sort((a, b) => b.yoy.deltaAbs - a.yoy.deltaAbs);
    return {
      topMover: sorted[0],
      biggestDrop: sorted[sorted.length - 1]
    };
  };

  const decompositionByDimension = (currentRows, priorRows, keyName, keyFn) => {
    const curr = keyedTotals(currentRows, keyFn);
    const prior = keyedTotals(priorRows, keyFn);
    const totalDelta = sum(currentRows) - sum(priorRows);
    return Array.from(new Set([...curr.keys(), ...prior.keys()])).map(key => {
      const current = curr.get(key) || 0;
      const previous = prior.get(key) || 0;
      return {
        [keyName]: key,
        current,
        prior: previous,
        deltaAbs: current - previous,
        deltaPct: pctChange(current, previous),
        contributionPct: sharePct(current - previous, totalDelta || 1)
      };
    });
  };

  const aggregateFacilityDetail = (currentRows, wowRows, yoyRows) => ({
    vehicleClass: decompositionByDimension(currentRows, yoyRows, 'vehicleClass', r => r.vehicle_class || 'Unknown'),
    timeBucket: decompositionByDimension(currentRows, yoyRows, 'timeBucket', (r) => {
      const hour = Number(r.hour ?? -1);
      if (hour >= 6 && hour < 10) return 'AM Peak';
      if (hour >= 15 && hour < 20) return 'PM Peak';
      return 'Off Peak';
    }),
    direction: decompositionByDimension(currentRows, wowRows, 'direction', r => r.direction || 'Unknown'),
    payment: decompositionByDimension(currentRows, yoyRows, 'paymentType', r => r.payment_type || 'Unknown')
  });

  const aggregatePaymentMonitor = (currentRows, wowRows, yoyRows) => {
    const facilities = aggregateFacilityComparison(currentRows, wowRows, yoyRows).map(entry => entry.facility);
    return facilities.map(facility => {
      const currRows = currentRows.filter(r => (r.facility_name || 'Unknown') === facility);
      const wowFacilityRows = wowRows.filter(r => (r.facility_name || 'Unknown') === facility);
      const yoyFacilityRows = yoyRows.filter(r => (r.facility_name || 'Unknown') === facility);
      const totalCurr = sum(currRows);
      const totalWow = sum(wowFacilityRows);
      const totalYoy = sum(yoyFacilityRows);
      const currEz = sum(currRows.filter(r => r.payment_type === 'E-ZPass'));
      const wowEz = sum(wowFacilityRows.filter(r => r.payment_type === 'E-ZPass'));
      const yoyEz = sum(yoyFacilityRows.filter(r => r.payment_type === 'E-ZPass'));
      const ezCurrShare = sharePct(currEz, totalCurr);
      return {
        facility,
        ezpassShare: ezCurrShare,
        tbmShare: 100 - ezCurrShare,
        ezpassYoYPp: sharePointDelta(ezCurrShare, sharePct(yoyEz, totalYoy)),
        ezpassWoWPp: sharePointDelta(ezCurrShare, sharePct(wowEz, totalWow)),
        volumeImpacted: totalCurr
      };
    });
  };

  const buildDashboardAggregates = (records) => {
    const windows = periodWindows(records);
    if (!windows) return null;
    const currentRows = filterPeriod(records, windows.current);
    const wowRows = filterPeriod(records, windows.wow);
    const yoyRows = filterPeriod(records, windows.yoy);
    const facilityComparison = aggregateFacilityComparison(currentRows, wowRows, yoyRows);

    return {
      windows,
      executive: {
        ...computeExecutiveKpis(currentRows, wowRows, yoyRows),
        ...topMoverAndDrop(facilityComparison)
      },
      facilityComparison,
      facilityDetail: aggregateFacilityDetail(currentRows, wowRows, yoyRows),
      paymentMonitor: aggregatePaymentMonitor(currentRows, wowRows, yoyRows)
    };
  };

  return {
    periodWindows,
    computeExecutiveKpis,
    aggregateFacilityComparison,
    aggregateFacilityDetail,
    aggregatePaymentMonitor,
    topMoverAndDrop,
    buildDashboardAggregates
  };
})();

const controls = {
  dateWindow: document.getElementById('date-window'),
  facility: document.getElementById('facility-filter'),
  direction: document.getElementById('direction-filter'),
  vehicleClass: document.getElementById('vehicle-filter'),
  paymentType: document.getElementById('payment-filter')
};

const ui = {
  status: document.getElementById('api-status'),
  lastRefresh: document.getElementById('last-refresh'),
  dataThrough: document.getElementById('data-through')
};

const updateStatus = (message, isError = false) => {
  ui.status.hidden = false;
  ui.status.textContent = message;
  ui.status.classList.toggle('error', isError);
};

const hideStatus = () => {
  ui.status.hidden = true;
  ui.status.classList.remove('error');
};

const toDisplayDateTime = (iso) => new Date(iso).toISOString().replace('T', ' ').replace('.000Z', ' UTC');

const buildRequestState = () => {
  const windowType = controls.dateWindow.value;
  const defaults = btDataApi.latestFullWindow(windowType);

  return {
    ...defaults,
    facility: controls.facility.value || undefined,
    direction: controls.direction.value || undefined,
    vehicleClass: controls.vehicleClass.value || undefined,
    paymentType: controls.paymentType.value || undefined,
    orderBy: 'date DESC, hour DESC',
    limit: 250,
    offset: 0
  };
};

const refreshData = async () => {
  if (window.location.protocol === 'file:') {
    updateStatus('This app cannot call the NY Open Data API from a file:// URL. Start a local web server (example: "python -m http.server 8000") and open http://localhost:8000 instead.', true);
    return;
  }

  updateStatus('Loading dataset…');
  try {
    const query = buildRequestState();
    const { records, fetchedAt } = await btDataApi.fetchDataset(query);

    ui.lastRefresh.textContent = toDisplayDateTime(fetchedAt);
    ui.dataThrough.textContent = records[0]?.date ?? 'No rows returned';

    if (!records.length) {
      updateStatus('No rows matched this filter set. Try broadening date window or clearing filters.');
      return;
    }

    const aggregates = metrics.buildDashboardAggregates(records);
    console.info('Aggregates', aggregates);
    hideStatus();
    console.info(`Fetched ${records.length} records`, { query, preview: records[0] });
  } catch (error) {
    updateStatus(`Could not load dataset right now: ${error.message}`, true);
    console.error(error);
  }
};

Object.values(controls).forEach(control => {
  control?.addEventListener('change', refreshData);
});

refreshData();
