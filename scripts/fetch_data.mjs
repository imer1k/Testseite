import { promises as fs } from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const CONFIG_PATH = path.join(ROOT_DIR, 'config', 'symbols.json');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SUMMARY_PATH = path.join(DATA_DIR, 'summary.json');

const csvToRows = (csvText) => {
  const lines = csvText.trim().split('\n');
  if (lines.length <= 1) {
    return [];
  }
  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    return row;
  });
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const calculatePerformance = (series, daysBack) => {
  if (series.length <= daysBack) {
    return null;
  }
  const latest = series[series.length - 1].close;
  const previous = series[series.length - 1 - daysBack].close;
  if (latest === null || previous === null || previous === 0) {
    return null;
  }
  return ((latest - previous) / previous) * 100;
};

const loadSymbols = async () => {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
};

const fetchSymbolData = async (symbol) => {
  const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${symbol}: ${response.status}`);
  }
  const csvText = await response.text();
  const rows = csvToRows(csvText);
  return rows
    .filter((row) => row.date)
    .map((row) => ({
      date: row.date,
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume)
    }))
    .filter((row) => row.close !== null);
};

const ensureDataDir = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
};

const main = async () => {
  await ensureDataDir();
  const symbols = await loadSymbols();
  const summary = {
    lastUpdated: new Date().toISOString(),
    symbols: {}
  };

  for (const entry of symbols) {
    const symbol = entry.symbol.toLowerCase();
    try {
      const series = await fetchSymbolData(symbol);
      if (series.length === 0) {
        console.warn(`No data for ${symbol}`);
        continue;
      }
      const latest = series[series.length - 1];
      const symbolSummary = {
        latestClose: latest.close,
        latestDate: latest.date,
        performance_7d: calculatePerformance(series, 7),
        performance_14d: calculatePerformance(series, 14),
        performance_30d: calculatePerformance(series, 30)
      };

      await fs.writeFile(
        path.join(DATA_DIR, `${symbol}.json`),
        JSON.stringify({
          symbol,
          updatedAt: summary.lastUpdated,
          series
        }, null, 2)
      );

      summary.symbols[symbol] = symbolSummary;
    } catch (error) {
      console.error(`Error fetching ${symbol}:`, error.message);
    }
  }

  await fs.writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
