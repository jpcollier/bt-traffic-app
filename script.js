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
