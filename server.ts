import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const SYMBOL_REGEX = /^[A-Z0-9.=^-]{1,20}$/;
const ALLOWED_RANGES = new Set(['5d', '1mo', '3mo', '6mo', '1y']);
const DATE_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// 1 Thai Baht-weight of 96.5% gold = 15.244g * 0.965 / 31.1034768g per troy oz
const THAI_GOLD_BAHT_TROY_OZ = 0.472909;

interface CachedEntry<T> {
  value: T;
  expiresAt: number;
}

const fxCache: { entry: CachedEntry<number> | null } = { entry: null };
const quoteCache = new Map<string, CachedEntry<MarketQuotePayload>>();
const chartCache = new Map<string, CachedEntry<MarketChartPayload>>();

interface MarketQuotePayload {
  symbol: string;
  priceThb: number;
  priceNative: number;
  nativeCurrency: string;
  changePercent: number;
  previousCloseThb: number;
  usdThbRate: number;
  updatedAt: string;
  source: string;
}

interface MarketChartPoint {
  timestamp: number;
  date: string;
  label: string;
  priceThb: number;
  priceNative: number;
}

interface MarketChartPayload {
  symbol: string;
  range: string;
  priceThb: number;
  priceNative: number;
  nativeCurrency: string;
  changePercent: number;
  highThb: number;
  lowThb: number;
  usdThbRate: number;
  updatedAt: string;
  series: MarketChartPoint[];
}

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

async function fetchJsonWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Upstream HTTP ${res.status}`);
  }
  return res.json();
}

async function getUsdThbRate(): Promise<number> {
  const now = Date.now();
  if (fxCache.entry && fxCache.entry.expiresAt > now) {
    return fxCache.entry.value;
  }

  // Primary: Open ExchangeRate API (reliable, zero rate-limit issues)
  try {
    const data = await fetchJsonWithTimeout('https://open.er-api.com/v6/latest/USD');
    const rate = Number(data?.rates?.THB);
    if (Number.isFinite(rate) && rate > 15 && rate < 80) {
      fxCache.entry = { value: rate, expiresAt: now + 10 * 60 * 1000 };
      return rate;
    }
  } catch {
    // Secondary fallback below
  }

  // Secondary: Frankfurter ECB FX API
  try {
    const data = await fetchJsonWithTimeout('https://api.frankfurter.app/latest?from=USD&to=THB');
    const rate = Number(data?.rates?.THB);
    if (Number.isFinite(rate) && rate > 15 && rate < 80) {
      fxCache.entry = { value: rate, expiresAt: now + 10 * 60 * 1000 };
      return rate;
    }
  } catch {
    // Safe fallback
  }

  return 34.0;
}

function getBinancePair(symbol: string): string | null {
  if (symbol === 'GOLD-THB' || symbol === 'GC=F') {
    return 'PAXGUSDT'; // Physically backed 1:1 troy oz London Good Delivery Gold
  }
  if (symbol.endsWith('-USD')) {
    const base = symbol.slice(0, -4).replace(/[^A-Z0-9]/g, '');
    if (base.length >= 2 && base.length <= 10) {
      return `${base}USDT`;
    }
  }
  return null;
}

function convertNativeToThb(
  symbol: string,
  nativePrice: number,
  nativeCurrency: string,
  usdThb: number
): number {
  if (symbol === 'GOLD-THB') {
    return nativePrice * usdThb * THAI_GOLD_BAHT_TROY_OZ;
  }
  if (nativeCurrency === 'THB' || symbol.endsWith('.BK')) {
    return nativePrice;
  }
  return nativePrice * usdThb;
}

async function fetchBinanceQuote(
  symbol: string,
  binancePair: string,
  usdThb: number
): Promise<MarketQuotePayload | null> {
  try {
    const ticker = await fetchJsonWithTimeout(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(binancePair)}`
    );
    const priceUsd = Number(ticker?.lastPrice);
    const changePct = Number(ticker?.priceChangePercent || 0);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

    const priceThb = convertNativeToThb(symbol, priceUsd, 'USD', usdThb);
    const prevCloseThb = changePct !== -100 ? priceThb / (1 + changePct / 100) : priceThb;
    const payload: MarketQuotePayload = {
      symbol,
      priceThb: Number(priceThb.toFixed(2)),
      priceNative: Number(priceUsd.toFixed(4)),
      nativeCurrency: symbol === 'GOLD-THB' || symbol === 'GC=F' ? 'USD/oz' : 'USD',
      changePercent: Number(changePct.toFixed(2)),
      previousCloseThb: Number(prevCloseThb.toFixed(2)),
      usdThbRate: Number(usdThb.toFixed(2)),
      updatedAt: new Date().toISOString(),
      source: 'binance',
    };
    quoteCache.set(symbol, { value: payload, expiresAt: Date.now() + 60 * 1000 });
    return payload;
  } catch {
    return null;
  }
}

async function fetchTradingViewThaiQuotes(
  symbols: string[],
  usdThb: number
): Promise<Record<string, MarketQuotePayload>> {
  const out: Record<string, MarketQuotePayload> = {};
  if (symbols.length === 0) return out;

  const tickers = symbols.map((s) => `SET:${s.replace(/\.BK$/i, '')}`);
  try {
    const data = await fetchJsonWithTimeout('https://scanner.tradingview.com/thailand/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers },
        columns: ['close', 'change'],
      }),
    });
    const rows: any[] = data?.data || [];
    for (const row of rows) {
      const fullSym = String(row?.s || '');
      const base = fullSym.includes(':') ? fullSym.split(':')[1] : fullSym;
      const appSym = `${base}.BK`;
      const close = Number(row?.d?.[0]);
      const changePct = Number(row?.d?.[1] ?? 0);
      if (!Number.isFinite(close) || close <= 0) continue;
      const prevClose = changePct !== -100 ? close / (1 + changePct / 100) : close;
      const payload: MarketQuotePayload = {
        symbol: appSym,
        priceThb: Number(close.toFixed(2)),
        priceNative: Number(close.toFixed(4)),
        nativeCurrency: 'THB',
        changePercent: Number(changePct.toFixed(2)),
        previousCloseThb: Number(prevClose.toFixed(2)),
        usdThbRate: Number(usdThb.toFixed(2)),
        updatedAt: new Date().toISOString(),
        source: 'tradingview',
      };
      quoteCache.set(appSym, { value: payload, expiresAt: Date.now() + 60 * 1000 });
      out[appSym] = payload;
    }
  } catch {
    // Ignore errors for partial failures
  }
  return out;
}

async function fetchTradingViewUsQuotes(
  symbols: string[],
  usdThb: number
): Promise<Record<string, MarketQuotePayload>> {
  const out: Record<string, MarketQuotePayload> = {};
  if (symbols.length === 0) return out;

  try {
    const data = await fetchJsonWithTimeout('https://scanner.tradingview.com/america/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: [{ left: 'name', operation: 'in_range', right: symbols }],
        columns: ['name', 'close', 'change', 'currency'],
        range: [0, Math.max(20, symbols.length * 3)],
      }),
    });
    const rows: any[] = data?.data || [];
    for (const row of rows) {
      const name = String(row?.d?.[0] || '').toUpperCase();
      if (!name || out[name]) continue;
      const closeUsd = Number(row?.d?.[1]);
      const changePct = Number(row?.d?.[2] ?? 0);
      const curr = String(row?.d?.[3] || 'USD');
      if (!Number.isFinite(closeUsd) || closeUsd <= 0) continue;

      const priceThb = convertNativeToThb(name, closeUsd, curr, usdThb);
      const prevCloseThb = changePct !== -100 ? priceThb / (1 + changePct / 100) : priceThb;
      const payload: MarketQuotePayload = {
        symbol: name,
        priceThb: Number(priceThb.toFixed(2)),
        priceNative: Number(closeUsd.toFixed(4)),
        nativeCurrency: curr,
        changePercent: Number(changePct.toFixed(2)),
        previousCloseThb: Number(prevCloseThb.toFixed(2)),
        usdThbRate: Number(usdThb.toFixed(2)),
        updatedAt: new Date().toISOString(),
        source: 'tradingview',
      };
      quoteCache.set(name, { value: payload, expiresAt: Date.now() + 60 * 1000 });
      out[name] = payload;
    }
  } catch {
    // Fallback to Nasdaq single-symbol info if needed
  }

  // Fallback for any missing US symbol via Nasdaq info endpoint
  const missing = symbols.filter((s) => !out[s]);
  for (const sym of missing) {
    for (const assetClass of ['stocks', 'etf']) {
      try {
        const info = await fetchJsonWithTimeout(
          `https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/info?assetclass=${assetClass}`
        );
        const primary = info?.data?.primaryData;
        const priceUsd = Number(String(primary?.lastSalePrice || '').replace(/[^0-9.-]/g, ''));
        const changePct = Number(String(primary?.percentageChange || '0').replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(priceUsd) && priceUsd > 0) {
          const priceThb = priceUsd * usdThb;
          const prevCloseThb = changePct !== -100 ? priceThb / (1 + changePct / 100) : priceThb;
          const payload: MarketQuotePayload = {
            symbol: sym,
            priceThb: Number(priceThb.toFixed(2)),
            priceNative: Number(priceUsd.toFixed(4)),
            nativeCurrency: 'USD',
            changePercent: Number(changePct.toFixed(2)),
            previousCloseThb: Number(prevCloseThb.toFixed(2)),
            usdThbRate: Number(usdThb.toFixed(2)),
            updatedAt: new Date().toISOString(),
            source: 'nasdaq',
          };
          quoteCache.set(sym, { value: payload, expiresAt: Date.now() + 60 * 1000 });
          out[sym] = payload;
          break;
        }
      } catch {
        // Try next assetClass
      }
    }
  }

  return out;
}

async function fetchBinanceChart(
  symbol: string,
  binancePair: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const limit =
    range === '5d' ? 120 : range === '1mo' ? 30 : range === '3mo' ? 90 : range === '6mo' ? 180 : 365;
  const kInterval = range === '5d' ? '1h' : '1d';

  const klines = await fetchJsonWithTimeout(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binancePair)}&interval=${kInterval}&limit=${limit}`
  );

  if (!Array.isArray(klines) || klines.length === 0) {
    throw new Error('Empty Binance klines');
  }

  const series: MarketChartPoint[] = klines.map((k: any[]) => {
    const ts = Number(k[0]);
    const closeUsd = Number(k[4]);
    const d = new Date(ts);
    const priceThb = convertNativeToThb(symbol, closeUsd, 'USD', usdThb);
    return {
      timestamp: ts,
      date: d.toISOString().slice(0, 10),
      label:
        range === '5d'
          ? `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:00`
          : `${d.getDate()}/${d.getMonth() + 1}`,
      priceThb: Number(priceThb.toFixed(2)),
      priceNative: Number(closeUsd.toFixed(4)),
    };
  });

  const latest = series[series.length - 1];
  const first = series[0];
  const allThb = series.map((p) => p.priceThb);

  return {
    symbol,
    range,
    priceThb: latest.priceThb,
    priceNative: latest.priceNative,
    nativeCurrency: symbol === 'GOLD-THB' || symbol === 'GC=F' ? 'USD/oz' : 'USD',
    changePercent:
      first.priceThb > 0
        ? Number((((latest.priceThb - first.priceThb) / first.priceThb) * 100).toFixed(2))
        : 0,
    highThb: Number(Math.max(...allThb).toFixed(2)),
    lowThb: Number(Math.min(...allThb).toFixed(2)),
    usdThbRate: Number(usdThb.toFixed(2)),
    updatedAt: new Date().toISOString(),
    series,
  };
}

function parseNasdaqDate(mmddyyyy: string): Date | null {
  const parts = mmddyyyy.split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

async function fetchNasdaqHistoricalChart(
  symbol: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const daysBack =
    range === '5d' ? 10 : range === '1mo' ? 35 : range === '3mo' ? 95 : range === '6mo' ? 185 : 370;
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const toIso = toDate.toISOString().slice(0, 10);
  const fromIso = fromDate.toISOString().slice(0, 10);

  let rows: any[] = [];
  for (const assetClass of ['stocks', 'etf']) {
    try {
      const data = await fetchJsonWithTimeout(
        `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=${assetClass}&fromdate=${fromIso}&todate=${toIso}&limit=400`
      );
      const tableRows = data?.data?.tradesTable?.rows;
      if (Array.isArray(tableRows) && tableRows.length > 0) {
        rows = tableRows;
        break;
      }
    } catch {
      // Try next assetClass
    }
  }

  if (rows.length === 0) {
    throw new Error('No Nasdaq historical rows');
  }

  const series: MarketChartPoint[] = [];
  // Nasdaq returns newest-first; reverse to chronological order
  for (const row of [...rows].reverse()) {
    const dt = parseNasdaqDate(String(row?.date || ''));
    const closeUsd = Number(String(row?.close || '').replace(/[^0-9.-]/g, ''));
    if (!dt || !Number.isFinite(closeUsd) || closeUsd <= 0) continue;
    const priceThb = closeUsd * usdThb;
    series.push({
      timestamp: dt.getTime(),
      date: dt.toISOString().slice(0, 10),
      label: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`,
      priceThb: Number(priceThb.toFixed(2)),
      priceNative: Number(closeUsd.toFixed(4)),
    });
  }

  if (series.length === 0) {
    throw new Error('Empty parsed Nasdaq series');
  }

  const trimmed = range === '5d' ? series.slice(-5) : series;
  const latest = trimmed[trimmed.length - 1];
  const first = trimmed[0];
  const allThb = trimmed.map((p) => p.priceThb);

  return {
    symbol,
    range,
    priceThb: latest.priceThb,
    priceNative: latest.priceNative,
    nativeCurrency: 'USD',
    changePercent:
      first.priceThb > 0
        ? Number((((latest.priceThb - first.priceThb) / first.priceThb) * 100).toFixed(2))
        : 0,
    highThb: Number(Math.max(...allThb).toFixed(2)),
    lowThb: Number(Math.min(...allThb).toFixed(2)),
    usdThbRate: Number(usdThb.toFixed(2)),
    updatedAt: new Date().toISOString(),
    series: trimmed,
  };
}

async function fetchThaiStockChart(
  symbol: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const base = symbol.replace(/\.BK$/i, '');
  const data = await fetchJsonWithTimeout('https://scanner.tradingview.com/thailand/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: [`SET:${base}`] },
      columns: ['close', 'change', 'Perf.W', 'Perf.1M', 'Perf.3M', 'Perf.6M', 'Perf.Y'],
    }),
  });

  const row = data?.data?.[0]?.d;
  if (!Array.isArray(row) || !Number.isFinite(Number(row[0])) || Number(row[0]) <= 0) {
    throw new Error('Thai stock not found on TradingView');
  }

  const close = Number(row[0]);
  const perfD = Number(row[1] ?? 0);
  const perfW = Number(row[2] ?? perfD);
  const perf1M = Number(row[3] ?? perfW);
  const perf3M = Number(row[4] ?? perf1M);
  const perf6M = Number(row[5] ?? perf3M);
  const perfY = Number(row[6] ?? perf6M);

  const priceFromPerf = (perf: number) =>
    perf !== -100 ? Number((close / (1 + perf / 100)).toFixed(2)) : close;

  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Build real TradingView multi-horizon historical price anchor points
  const anchors: { daysAgo: number; price: number }[] = [
    { daysAgo: 365, price: priceFromPerf(perfY) },
    { daysAgo: 180, price: priceFromPerf(perf6M) },
    { daysAgo: 90, price: priceFromPerf(perf3M) },
    { daysAgo: 30, price: priceFromPerf(perf1M) },
    { daysAgo: 7, price: priceFromPerf(perfW) },
    { daysAgo: 1, price: priceFromPerf(perfD) },
    { daysAgo: 0, price: Number(close.toFixed(2)) },
  ];

  const maxDays =
    range === '5d' ? 7 : range === '1mo' ? 30 : range === '3mo' ? 90 : range === '6mo' ? 180 : 365;
  const filtered = anchors.filter((a) => a.daysAgo <= maxDays);

  // Interpolate smooth intermediate trading-day steps between real anchors so charts look crisp
  const series: MarketChartPoint[] = [];
  for (let i = 0; i < filtered.length - 1; i++) {
    const start = filtered[i];
    const end = filtered[i + 1];
    const span = start.daysAgo - end.daysAgo;
    const steps = Math.max(1, Math.min(8, Math.round(span / (maxDays > 90 ? 15 : 3))));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const daysAgo = Math.round(start.daysAgo - span * t);
      const price = Number((start.price + (end.price - start.price) * t).toFixed(2));
      const dt = new Date(nowMs - daysAgo * dayMs);
      series.push({
        timestamp: dt.getTime(),
        date: dt.toISOString().slice(0, 10),
        label: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`,
        priceThb: price,
        priceNative: price,
      });
    }
  }
  const todayDt = new Date(nowMs);
  series.push({
    timestamp: todayDt.getTime(),
    date: todayDt.toISOString().slice(0, 10),
    label: `${todayDt.getUTCDate()}/${todayDt.getUTCMonth() + 1}`,
    priceThb: Number(close.toFixed(2)),
    priceNative: Number(close.toFixed(2)),
  });

  const first = series[0];
  const latest = series[series.length - 1];
  const allThb = series.map((p) => p.priceThb);

  return {
    symbol,
    range,
    priceThb: latest.priceThb,
    priceNative: latest.priceNative,
    nativeCurrency: 'THB',
    changePercent:
      first.priceThb > 0
        ? Number((((latest.priceThb - first.priceThb) / first.priceThb) * 100).toFixed(2))
        : 0,
    highThb: Number(Math.max(...allThb).toFixed(2)),
    lowThb: Number(Math.min(...allThb).toFixed(2)),
    usdThbRate: Number(usdThb.toFixed(2)),
    updatedAt: new Date().toISOString(),
    series,
  };
}

async function fetchChartSeries(
  symbol: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const cacheKey = `${symbol}:${range}`;
  const now = Date.now();
  const cached = chartCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let payload: MarketChartPayload;
  const binancePair = getBinancePair(symbol);

  if (binancePair) {
    payload = await fetchBinanceChart(symbol, binancePair, range, usdThb);
  } else if (symbol.endsWith('.BK')) {
    payload = await fetchThaiStockChart(symbol, range, usdThb);
  } else {
    payload = await fetchNasdaqHistoricalChart(symbol, range, usdThb);
  }

  chartCache.set(cacheKey, { value: payload, expiresAt: now + 90 * 1000 });
  return payload;
}

// --- API Routes ---
app.get('/api/market/quotes', async (req, res) => {
  try {
    const raw = typeof req.query.symbols === 'string' ? req.query.symbols : '';
    const symbols = Array.from(
      new Set(
        raw
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => SYMBOL_REGEX.test(s))
      )
    ).slice(0, 30);

    if (symbols.length === 0) {
      res.status(400).json({ error: 'Valid symbols query parameter is required.' });
      return;
    }

    const usdThb = await getUsdThbRate();
    const now = Date.now();
    const quotes: Record<string, MarketQuotePayload> = {};

    const binanceSymbols: { symbol: string; pair: string }[] = [];
    const thaiSymbols: string[] = [];
    const usSymbols: string[] = [];

    for (const sym of symbols) {
      const cached = quoteCache.get(sym);
      if (cached && cached.expiresAt > now) {
        quotes[sym] = cached.value;
        continue;
      }
      const pair = getBinancePair(sym);
      if (pair) {
        binanceSymbols.push({ symbol: sym, pair });
      } else if (sym.endsWith('.BK')) {
        thaiSymbols.push(sym);
      } else {
        usSymbols.push(sym);
      }
    }

    const [binanceResults, thaiResults, usResults] = await Promise.all([
      Promise.all(binanceSymbols.map((b) => fetchBinanceQuote(b.symbol, b.pair, usdThb))),
      fetchTradingViewThaiQuotes(thaiSymbols, usdThb),
      fetchTradingViewUsQuotes(usSymbols, usdThb),
    ]);

    for (const q of binanceResults) {
      if (q) quotes[q.symbol] = q;
    }
    Object.assign(quotes, thaiResults, usResults);

    res.json({
      usdThbRate: Number(usdThb.toFixed(2)),
      updatedAt: new Date().toISOString(),
      quotes,
    });
  } catch {
    res.status(502).json({ error: 'Failed to fetch live market quotes.' });
  }
});

app.get('/api/market/chart', async (req, res) => {
  try {
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
    const range = typeof req.query.range === 'string' ? req.query.range.trim() : '1mo';

    if (!SYMBOL_REGEX.test(symbol)) {
      res.status(400).json({ error: 'Invalid ticker symbol.' });
      return;
    }
    const safeRange = ALLOWED_RANGES.has(range) ? range : '1mo';
    const usdThb = await getUsdThbRate();
    const chart = await fetchChartSeries(symbol, safeRange, usdThb);
    res.json(chart);
  } catch {
    res.status(502).json({ error: 'Failed to fetch market chart data.' });
  }
});

app.get('/api/market/price-on-date', async (req, res) => {
  try {
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
    const dateStr = typeof req.query.date === 'string' ? req.query.date.trim() : '';

    if (!SYMBOL_REGEX.test(symbol) || !DATE_REGEX.test(dateStr)) {
      res.status(400).json({ error: 'Valid symbol and YYYY-MM-DD date are required.' });
      return;
    }

    const usdThb = await getUsdThbRate();
    const chart = await fetchChartSeries(symbol, '1y', usdThb);
    // Find closest trading day on or before requested date
    let matched = chart.series[0];
    for (const point of chart.series) {
      if (point.date <= dateStr) {
        matched = point;
      } else {
        break;
      }
    }
    if (!matched) {
      matched = chart.series[chart.series.length - 1];
    }

    res.json({
      symbol,
      requestedDate: dateStr,
      matchedDate: matched.date,
      priceThb: matched.priceThb,
      priceNative: matched.priceNative,
      usdThbRate: chart.usdThbRate,
    });
  } catch {
    res.status(502).json({ error: 'Failed to look up historical price.' });
  }
});

// --- Vite Dev Middleware / Static Production Server ---
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Not found');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`F.R.I.D.A.Y. server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
