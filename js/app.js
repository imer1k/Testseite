const state = {
  symbols: [],
  summary: null,
  dataMap: new Map(),
  charts: new Map(),
  detailChart: null,
  selectedRange: 30,
  sortBy: 'performance',
  searchQuery: ''
};

const formatNumber = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return Number(value).toFixed(digits);
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(2)}%`;
};

const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
};

const getPerformanceKey = (days) => `performance_${days}d`;

const getPerformanceValue = (symbol) => {
  if (!state.summary) {
    return null;
  }
  const summaryEntry = state.summary.symbols?.[symbol];
  if (!summaryEntry) {
    return null;
  }
  return summaryEntry[getPerformanceKey(state.selectedRange)];
};

const createLogoNode = (entry) => {
  const img = document.createElement('img');
  img.className = 'logo';
  img.alt = `${entry.name} Logo`;
  img.src = `https://logo.clearbit.com/${entry.domain}`;
  img.onerror = () => {
    const fallback = document.createElement('div');
    fallback.className = 'logo-fallback';
    fallback.textContent = entry.name
      .split(' ')
      .map((chunk) => chunk[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    img.replaceWith(fallback);
  };
  return img;
};

const updateLastUpdated = () => {
  const lastUpdated = document.getElementById('lastUpdated');
  if (!state.summary?.lastUpdated) {
    lastUpdated.textContent = 'Keine aktualisierten Daten verfügbar.';
    return;
  }
  const date = new Date(state.summary.lastUpdated);
  lastUpdated.textContent = `Letztes Update: ${date.toLocaleString('de-DE')}`;
};

const destroyCharts = () => {
  state.charts.forEach((chart) => chart.destroy());
  state.charts.clear();
};

const renderCards = () => {
  const grid = document.getElementById('cardsGrid');
  const emptyState = document.getElementById('emptyState');
  grid.innerHTML = '';
  destroyCharts();

  const query = state.searchQuery.toLowerCase();

  const entries = state.symbols
    .filter((entry) => {
      const matchText = `${entry.name} ${entry.symbol}`.toLowerCase();
      return matchText.includes(query);
    })
    .sort((a, b) => {
      if (state.sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      const perfA = getPerformanceValue(a.symbol) ?? -Infinity;
      const perfB = getPerformanceValue(b.symbol) ?? -Infinity;
      return perfB - perfA;
    });

  if (entries.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  entries.forEach((entry) => {
    const symbol = entry.symbol.toLowerCase();
    const series = state.dataMap.get(symbol)?.series ?? [];
    const summaryEntry = state.summary?.symbols?.[symbol];
    const latestClose = summaryEntry?.latestClose ?? series[series.length - 1]?.close;
    const latestDate = summaryEntry?.latestDate ?? series[series.length - 1]?.date;
    const performance = getPerformanceValue(symbol);

    const card = document.createElement('article');
    card.className = 'card';

    const header = document.createElement('div');
    header.className = 'card__header';
    header.appendChild(createLogoNode(entry));

    const title = document.createElement('div');
    title.className = 'card__title';
    const name = document.createElement('h3');
    name.textContent = entry.name;
    const symbolText = document.createElement('span');
    symbolText.textContent = entry.symbol.toUpperCase();
    title.appendChild(name);
    title.appendChild(symbolText);
    header.appendChild(title);

    const price = document.createElement('div');
    price.innerHTML = `<div class="price">${formatNumber(latestClose)}</div><div class="muted">${latestDate ?? '—'}</div>`;

    const badge = document.createElement('div');
    if (performance === null || performance === undefined || Number.isNaN(performance)) {
      badge.className = 'badge neutral';
      badge.textContent = 'Keine Daten';
    } else {
      badge.className = `badge ${performance >= 0 ? 'positive' : 'negative'}`;
      badge.innerHTML = `${performance >= 0 ? '▲' : '▼'} ${formatPercent(performance)}`;
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'sparkline';

    const footer = document.createElement('div');
    footer.className = 'card__footer';

    const button = document.createElement('button');
    button.textContent = 'Details';
    button.addEventListener('click', () => openModal(entry, series));

    footer.appendChild(badge);
    footer.appendChild(button);

    card.appendChild(header);
    card.appendChild(price);
    card.appendChild(canvas);
    card.appendChild(footer);
    grid.appendChild(card);

    if (series.length > 0) {
      const chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: series.slice(-20).map((item) => item.date),
          datasets: [
            {
              data: series.slice(-20).map((item) => item.close),
              borderColor: '#2f6bff',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4
            }
          ]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { x: { display: false }, y: { display: false } }
        }
      });
      state.charts.set(symbol, chart);
    }
  });
};

const calculateRegression = (values) => {
  const n = values.length;
  if (n === 0) {
    return { slope: 0, intercept: 0 };
  }
  const xValues = values.map((_, index) => index);
  const sumX = xValues.reduce((acc, val) => acc + val, 0);
  const sumY = values.reduce((acc, val) => acc + val, 0);
  const sumXY = values.reduce((acc, val, idx) => acc + val * xValues[idx], 0);
  const sumX2 = xValues.reduce((acc, val) => acc + val * val, 0);
  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
};

const calculateVolatility = (values) => {
  if (values.length < 2) {
    return 0;
  }
  const returns = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev === 0) {
      continue;
    }
    returns.push((curr - prev) / prev);
  }
  const mean = returns.reduce((acc, val) => acc + val, 0) / returns.length;
  const variance =
    returns.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
};

const buildForecast = (series, forecastDays = 7) => {
  const closes = series.map((item) => item.close);
  const { slope, intercept } = calculateRegression(closes);
  const forecast = [];
  for (let i = 0; i < forecastDays; i += 1) {
    const index = closes.length + i;
    forecast.push(intercept + slope * index);
  }
  return forecast;
};

const openModal = (entry, series) => {
  const modal = document.getElementById('detailModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  document.getElementById('modalTitle').textContent = entry.name;
  document.getElementById('modalSubTitle').textContent = entry.symbol.toUpperCase();

  const last30 = series.slice(-30);
  const closes = last30.map((item) => item.close);
  const forecast = buildForecast(closes, 7);
  const volatility = calculateVolatility(closes);
  const lastActual = closes[closes.length - 1] ?? 0;
  const lastForecast = forecast[forecast.length - 1] ?? lastActual;
  const forecastChange = lastActual === 0 ? 0 : ((lastForecast - lastActual) / lastActual) * 100;

  const performance = getPerformanceValue(entry.symbol.toLowerCase());
  const modalPerformance = document.getElementById('modalPerformance');
  modalPerformance.textContent = formatPercent(performance);
  modalPerformance.style.color =
    performance === null || performance === undefined || Number.isNaN(performance)
      ? 'var(--muted)'
      : performance >= 0
        ? 'var(--positive)'
        : 'var(--negative)';

  document.getElementById(
    'forecastSummary'
  ).textContent = `Erwartete Veränderung (7 Tage): ${formatPercent(
    forecastChange
  )} | Volatilität: ${(volatility * 100).toFixed(2)}%`;

  const recentTable = document.getElementById('recentTable');
  recentTable.innerHTML = '';
  series.slice(-10).reverse().forEach((item, index) => {
    const prev = series[series.length - 2 - index]?.close ?? item.close;
    const change = prev === 0 ? 0 : ((item.close - prev) / prev) * 100;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.date}</td>
      <td>${formatNumber(item.close)}</td>
      <td>${formatPercent(change)}</td>
    `;
    recentTable.appendChild(row);
  });

  const labels = [...last30.map((item) => item.date), ...forecast.map((_, i) => `+${i + 1}`)];
  const forecastStartIndex = last30.length;
  const forecastBand = forecast.map((value) => ({
    upper: value * (1 + volatility),
    lower: value * (1 - volatility)
  }));

  if (state.detailChart) {
    state.detailChart.destroy();
  }

  const detailCtx = document.getElementById('detailChart').getContext('2d');
  state.detailChart = new Chart(detailCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Historie',
          data: closes,
          borderColor: '#2f6bff',
          pointRadius: 0,
          tension: 0.3
        },
        {
          label: 'Forecast',
          data: Array(forecastStartIndex).fill(null).concat(forecast),
          borderColor: '#f97316',
          borderDash: [6, 6],
          pointRadius: 0,
          tension: 0.3
        },
        {
          label: 'Band oben',
          data: Array(forecastStartIndex).fill(null).concat(forecastBand.map((b) => b.upper)),
          borderColor: 'rgba(249, 115, 22, 0.2)',
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Band unten',
          data: Array(forecastStartIndex).fill(null).concat(forecastBand.map((b) => b.lower)),
          borderColor: 'rgba(249, 115, 22, 0.2)',
          pointRadius: 0,
          fill: '-1'
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8 }
        }
      }
    }
  });

  const focusable = modal.querySelector('button');
  focusable?.focus();
};

const closeModal = () => {
  const modal = document.getElementById('detailModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
};

const initControls = () => {
  document.getElementById('searchInput').addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderCards();
  });

  document.getElementById('rangeSelect').addEventListener('change', (event) => {
    state.selectedRange = Number(event.target.value);
    renderCards();
  });

  document.getElementById('sortSelect').addEventListener('change', (event) => {
    state.sortBy = event.target.value;
    renderCards();
  });

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('detailModal').addEventListener('click', (event) => {
    if (event.target.id === 'detailModal') {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });
};

const loadData = async () => {
  try {
    const [symbols, summary] = await Promise.all([
      loadJson('config/symbols.json'),
      loadJson('data/summary.json')
    ]);
    state.symbols = symbols;
    state.summary = summary;

    const dataFiles = await Promise.all(
      symbols.map(async (entry) => {
        try {
          const data = await loadJson(`data/${entry.symbol.toLowerCase()}.json`);
          return [entry.symbol.toLowerCase(), data];
        } catch (error) {
          console.warn(`Missing data for ${entry.symbol}:`, error.message);
          return [entry.symbol.toLowerCase(), { series: [] }];
        }
      })
    );

    dataFiles.forEach(([symbol, data]) => state.dataMap.set(symbol, data));

    updateLastUpdated();
    renderCards();
  } catch (error) {
    console.error(error);
    document.getElementById('cardsGrid').innerHTML =
      '<p class="empty">Daten konnten nicht geladen werden.</p>';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initControls();
  loadData();
});
