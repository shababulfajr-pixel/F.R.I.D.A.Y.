import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const SYMBOL_REGEX = /^[A-Z0-9.=^/-]{1,24}$/;
const ALLOWED_RANGES = new Set(['5d', '1mo', '3mo', '6mo', '1y']);
const DATE_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// 1 Thai Baht-weight of 96.5% gold = 15.244g * 0.965 / 31.1034768g per troy oz
const THAI_GOLD_BAHT_TROY_OZ = 0.472909;

// Known shorthand aliases -> canonical app symbols
const SYMBOL_ALIASES: Record<string, string> = {
  USD: 'USD-THB',
  USDTHB: 'USD-THB',
  'USD/THB': 'USD-THB',
  'USDTHB=X': 'USD-THB',
  'THB=X': 'USD-THB',
  DOLLAR: 'USD-THB',
  DXY: 'DXY',
  'DX-Y.NYB': 'DXY',
  USDX: 'DXY',
  EUR: 'EUR-THB',
  EURTHB: 'EUR-THB',
  'EUR/THB': 'EUR-THB',
  'EURTHB=X': 'EUR-THB',
  JPY: 'JPY-THB',
  JPYTHB: 'JPY-THB',
  'JPY/THB': 'JPY-THB',
  'JPYTHB=X': 'JPY-THB',
  GOLD: 'GOLD-THB',
  'GOLD-THB': 'GOLD-THB',
  'XAU-THB': 'GOLD-THB',
  XAU: 'GC=F',
  XAUUSD: 'GC=F',
  'XAU/USD': 'GC=F',
  'XAU-USD': 'GC=F',
  'GOLD-USD': 'GC=F',
  'GC=F': 'GC=F',
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  SOL: 'SOL-USD',
  BNB: 'BNB-USD',
  XRP: 'XRP-USD',
  DOGE: 'DOGE-USD',
};

const FX_PAIR_META: Record<
  string,
  { base: string; tvEndpoint: 'forex' | 'cfd'; tvTicker: string; nativeCurrency: string }
> = {
  'USD-THB': { base: 'USD', tvEndpoint: 'forex', tvTicker: 'FX_IDC:USDTHB', nativeCurrency: 'THB' },
  'EUR-THB': { base: 'EUR', tvEndpoint: 'forex', tvTicker: 'FX_IDC:EURTHB', nativeCurrency: 'THB' },
  'JPY-THB': { base: 'JPY', tvEndpoint: 'forex', tvTicker: 'FX_IDC:JPYTHB', nativeCurrency: 'THB' },
  DXY: { base: 'DXY', tvEndpoint: 'cfd', tvTicker: 'TVC:DXY', nativeCurrency: 'INDEX' },
};

// Public Binance hosts: data-api.binance.vision is Binance's non-geo-blocked market data mirror
const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

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

function normalizeSymbol(raw: string): string {
  const cleaned = raw.trim().toUpperCase();
  if (SYMBOL_ALIASES[cleaned]) {
    return SYMBOL_ALIASES[cleaned];
  }
  return cleaned;
}

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

  // Primary: Open ExchangeRate API (fast, reliable, zero key)
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

  // Secondary: Frankfurter v1 ECB FX API
  try {
    const data = await fetchJsonWithTimeout('https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB');
    const rate = Number(data?.rates?.THB);
    if (Number.isFinite(rate) && rate > 15 && rate < 80) {
      fxCache.entry = { value: rate, expiresAt: now + 10 * 60 * 1000 };
      return rate;
    }
  } catch {
    // Tertiary fallback below
  }

  // Tertiary: TradingView Forex Scanner
  try {
    const data = await fetchJsonWithTimeout('https://scanner.tradingview.com/forex/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: ['FX_IDC:USDTHB'] },
        columns: ['close'],
      }),
    });
    const rate = Number(data?.data?.[0]?.d?.[0]);
    if (Number.isFinite(rate) && rate > 15 && rate < 80) {
      fxCache.entry = { value: rate, expiresAt: now + 10 * 60 * 1000 };
      return rate;
    }
  } catch {
    // Use last cached value or safe default
  }

  return fxCache.entry?.value ?? 34.0;
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
  if (nativeCurrency === 'THB' || nativeCurrency === 'INDEX' || symbol.endsWith('.BK') || FX_PAIR_META[symbol]) {
    return nativePrice;
  }
  return nativePrice * usdThb;
}

function buildCurveFromPerformanceAnchors(
  symbol: string,
  range: string,
  closeNative: number,
  nativeCurrency: string,
  perfs: { d: number; w: number; m1: number; m3: number; m6: number; y1: number },
  usdThb: number
): MarketChartPayload {
  const safeFromPerf = (perf: number) =>
    Number.isFinite(perf) && perf !== -100 ? closeNative / (1 + perf / 100) : closeNative;

  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const anchors: { daysAgo: number; nativePrice: number }[] = [
    { daysAgo: 365, nativePrice: safeFromPerf(perfs.y1) },
    { daysAgo: 180, nativePrice: safeFromPerf(perfs.m6) },
    { daysAgo: 90, nativePrice: safeFromPerf(perfs.m3) },
    { daysAgo: 30, nativePrice: safeFromPerf(perfs.m1) },
    { daysAgo: 7, nativePrice: safeFromPerf(perfs.w) },
    { daysAgo: 1, nativePrice: safeFromPerf(perfs.d) },
    { daysAgo: 0, nativePrice: closeNative },
  ];

  const maxDays =
    range === '5d' ? 7 : range === '1mo' ? 30 : range === '3mo' ? 90 : range === '6mo' ? 180 : 365;
  const filtered = anchors.filter((a) => a.daysAgo <= maxDays);

  const series: MarketChartPoint[] = [];
  for (let i = 0; i < filtered.length - 1; i++) {
    const start = filtered[i];
    const end = filtered[i + 1];
    const span = start.daysAgo - end.daysAgo;
    const steps = Math.max(2, Math.min(10, Math.round(span / (maxDays > 90 ? 12 : 2))));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const daysAgo = Math.round(start.daysAgo - span * t);
      const nativeVal = start.nativePrice + (end.nativePrice - start.nativePrice) * t;
      const thbVal = convertNativeToThb(symbol, nativeVal, nativeCurrency, usdThb);
      const dt = new Date(nowMs - daysAgo * dayMs);
      series.push({
        timestamp: dt.getTime(),
        date: dt.toISOString().slice(0, 10),
        label: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`,
        priceThb: Number(thbVal.toFixed(nativeCurrency === 'THB' && thbVal < 5 ? 4 : 2)),
        priceNative: Number(nativeVal.toFixed(4)),
      });
    }
  }

  const todayDt = new Date(nowMs);
  const latestThb = convertNativeToThb(symbol, closeNative, nativeCurrency, usdThb);
  series.push({
    timestamp: todayDt.getTime(),
    date: todayDt.toISOString().slice(0, 10),
    label: `${todayDt.getUTCDate()}/${todayDt.getUTCMonth() + 1}`,
    priceThb: Number(latestThb.toFixed(nativeCurrency === 'THB' && latestThb < 5 ? 4 : 2)),
    priceNative: Number(closeNative.toFixed(4)),
  });

  const first = series[0];
  const latest = series[series.length - 1];
  const allThb = series.map((p) => p.priceThb);

  return {
    symbol,
    range,
    priceThb: latest.priceThb,
    priceNative: latest.priceNative,
    nativeCurrency,
    changePercent:
      first.priceThb > 0
        ? Number((((latest.priceThb - first.priceThb) / first.priceThb) * 100).toFixed(2))
        : 0,
    highThb: Number(Math.max(...allThb).toFixed(nativeCurrency === 'THB' && latestThb < 5 ? 4 : 2)),
    lowThb: Number(Math.min(...allThb).toFixed(nativeCurrency === 'THB' && latestThb < 5 ? 4 : 2)),
    usdThbRate: Number(usdThb.toFixed(2)),
    updatedAt: new Date().toISOString(),
    series,
  };
}

// --- FX / Dollar Quotes & Charts ---
async function fetchFxQuotes(
  symbols: string[],
  usdThb: number
): Promise<Record<string, MarketQuotePayload>> {
  const out: Record<string, MarketQuotePayload> = {};
  if (symbols.length === 0) return out;

  const forexTickers: { sym: string; ticker: string }[] = [];
  const cfdTickers: { sym: string; ticker: string }[] = [];

  for (const sym of symbols) {
    const meta = FX_PAIR_META[sym];
    if (!meta) continue;
    if (meta.tvEndpoint === 'forex') {
      forexTickers.push({ sym, ticker: meta.tvTicker });
    } else {
      cfdTickers.push({ sym, ticker: meta.tvTicker });
    }
  }

  const fetchTvGroup = async (
    endpoint: 'forex' | 'cfd',
    items: { sym: string; ticker: string }[]
  ) => {
    if (items.length === 0) return;
    try {
      const data = await fetchJsonWithTimeout(`https://scanner.tradingview.com/${endpoint}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: { tickers: items.map((i) => i.ticker) },
          columns: ['close', 'change'],
        }),
      });
      const rows: any[] = data?.data || [];
      for (const row of rows) {
        const matched = items.find((i) => i.ticker === row?.s);
        if (!matched) continue;
        const close = Number(row?.d?.[0]);
        const changePct = Number(row?.d?.[1] ?? 0);
        if (!Number.isFinite(close) || close <= 0) continue;
        const meta = FX_PAIR_META[matched.sym];
        const decimals = close < 5 ? 4 : 2;
        const prevClose = changePct !== -100 ? close / (1 + changePct / 100) : close;
        const payload: MarketQuotePayload = {
          symbol: matched.sym,
          priceThb: Number(close.toFixed(decimals)),
          priceNative: Number(close.toFixed(4)),
          nativeCurrency: meta.nativeCurrency,
          changePercent: Number(changePct.toFixed(2)),
          previousCloseThb: Number(prevClose.toFixed(decimals)),
          usdThbRate: Number((matched.sym === 'USD-THB' ? close : usdThb).toFixed(2)),
          updatedAt: new Date().toISOString(),
          source: 'tradingview',
        };
        quoteCache.set(matched.sym, { value: payload, expiresAt: Date.now() + 60 * 1000 });
        out[matched.sym] = payload;
      }
    } catch {
      // Fallback below
    }
  };

  await Promise.all([
    fetchTvGroup('forex', forexTickers),
    fetchTvGroup('cfd', cfdTickers),
  ]);

  // Fallback via Frankfurter v1 / Open ER-API for any missing FX pair
  for (const sym of symbols) {
    if (out[sym]) continue;
    const meta = FX_PAIR_META[sym];
    if (!meta || meta.base === 'DXY') continue;
    try {
      const data = await fetchJsonWithTimeout(
        `https://api.frankfurter.dev/v1/latest?base=${meta.base}&symbols=THB`
      );
      const rate = Number(data?.rates?.THB);
      if (Number.isFinite(rate) && rate > 0) {
        const decimals = rate < 5 ? 4 : 2;
        const payload: MarketQuotePayload = {
          symbol: sym,
          priceThb: Number(rate.toFixed(decimals)),
          priceNative: Number(rate.toFixed(4)),
          nativeCurrency: 'THB',
          changePercent: 0,
          previousCloseThb: Number(rate.toFixed(decimals)),
          usdThbRate: Number((sym === 'USD-THB' ? rate : usdThb).toFixed(2)),
          updatedAt: new Date().toISOString(),
          source: 'frankfurter',
        };
        quoteCache.set(sym, { value: payload, expiresAt: Date.now() + 60 * 1000 });
        out[sym] = payload;
      }
    } catch {
      if (sym === 'USD-THB' && usdThb > 0) {
        const payload: MarketQuotePayload = {
          symbol: sym,
          priceThb: Number(usdThb.toFixed(2)),
          priceNative: Number(usdThb.toFixed(4)),
          nativeCurrency: 'THB',
          changePercent: 0,
          previousCloseThb: Number(usdThb.toFixed(2)),
          usdThbRate: Number(usdThb.toFixed(2)),
          updatedAt: new Date().toISOString(),
          source: 'open-er-api',
        };
        out[sym] = payload;
      }
    }
  }

  return out;
}

async function fetchFxChart(
  symbol: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const meta = FX_PAIR_META[symbol];
  if (!meta) throw new Error('Unsupported FX symbol');

  // Primary for THB FX pairs (USD-THB, EUR-THB, JPY-THB): Real daily historical series from Frankfurter ECB API
  if (meta.base !== 'DXY') {
    try {
      const daysBack =
        range === '5d' ? 10 : range === '1mo' ? 35 : range === '3mo' ? 95 : range === '6mo' ? 185 : 370;
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
      const fromIso = fromDate.toISOString().slice(0, 10);

      const data = await fetchJsonWithTimeout(
        `https://api.frankfurter.dev/v1/${fromIso}..?base=${meta.base}&symbols=THB`
      );
      const ratesObj = data?.rates;
      if (ratesObj && typeof ratesObj === 'object') {
        const dates = Object.keys(ratesObj).sort();
        const series: MarketChartPoint[] = [];
        for (const dStr of dates) {
          const val = Number(ratesObj[dStr]?.THB);
          if (!Number.isFinite(val) || val <= 0) continue;
          const dt = new Date(`${dStr}T00:00:00Z`);
          const decimals = val < 5 ? 4 : 2;
          series.push({
            timestamp: dt.getTime(),
            date: dStr,
            label: `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`,
            priceThb: Number(val.toFixed(decimals)),
            priceNative: Number(val.toFixed(4)),
          });
        }

        // Append live TradingView spot if today's date is newer than latest ECB publication
        try {
          const liveQuotes = await fetchFxQuotes([symbol], usdThb);
          const live = liveQuotes[symbol];
          const todayIso = new Date().toISOString().slice(0, 10);
          if (live && live.priceThb > 0 && series.length > 0 && series[series.length - 1].date < todayIso) {
            const nowDt = new Date();
            series.push({
              timestamp: nowDt.getTime(),
              date: todayIso,
              label: `${nowDt.getUTCDate()}/${nowDt.getUTCMonth() + 1}`,
              priceThb: live.priceThb,
              priceNative: live.priceNative,
            });
          }
        } catch {
          // Keep ECB historical series cleanly
        }

        const trimmed = range === '5d' ? series.slice(-6) : series;
        if (trimmed.length >= 2) {
          const first = trimmed[0];
          const latest = trimmed[trimmed.length - 1];
          const allThb = trimmed.map((p) => p.priceThb);
          const decimals = latest.priceThb < 5 ? 4 : 2;
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
            highThb: Number(Math.max(...allThb).toFixed(decimals)),
            lowThb: Number(Math.min(...allThb).toFixed(decimals)),
            usdThbRate: Number((symbol === 'USD-THB' ? latest.priceThb : usdThb).toFixed(2)),
            updatedAt: new Date().toISOString(),
            series: trimmed,
          };
        }
      }
    } catch {
      // Fall through to TradingView Forex/CFD Scanner
    }
  }

  // Fallback for FX & Primary for DXY: TradingView Scanner real performance anchors
  const tvData = await fetchJsonWithTimeout(`https://scanner.tradingview.com/${meta.tvEndpoint}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: [meta.tvTicker] },
      columns: ['close', 'change', 'Perf.W', 'Perf.1M', 'Perf.3M', 'Perf.6M', 'Perf.Y'],
    }),
  });
  const row = tvData?.data?.[0]?.d;
  if (!Array.isArray(row) || !Number.isFinite(Number(row[0])) || Number(row[0]) <= 0) {
    throw new Error(`No TradingView data for ${symbol}`);
  }
  const close = Number(row[0]);
  return buildCurveFromPerformanceAnchors(
    symbol,
    range,
    close,
    meta.nativeCurrency,
    {
      d: Number(row[1] ?? 0),
      w: Number(row[2] ?? row[1] ?? 0),
      m1: Number(row[3] ?? row[2] ?? 0),
      m3: Number(row[4] ?? row[3] ?? 0),
      m6: Number(row[5] ?? row[4] ?? 0),
      y1: Number(row[6] ?? row[5] ?? 0),
    },
    symbol === 'USD-THB' ? close : usdThb
  );
}

// --- Binance + TradingView Multi-Source Quotes (Gold & Crypto) ---
async function fetchBinanceQuote(
  symbol: string,
  binancePair: string,
  usdThb: number
): Promise<MarketQuotePayload | null> {
  for (const host of BINANCE_HOSTS) {
    try {
      const ticker = await fetchJsonWithTimeout(
        `${host}/api/v3/ticker/24hr?symbol=${encodeURIComponent(binancePair)}`
      );
      const priceUsd = Number(ticker?.lastPrice);
      const changePct = Number(ticker?.priceChangePercent || 0);
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;

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
        source: host.includes('vision') ? 'binance-vision' : 'binance',
      };
      quoteCache.set(symbol, { value: payload, expiresAt: Date.now() + 60 * 1000 });
      return payload;
    } catch {
      // Try next Binance host
    }
  }

  // Fallback to TradingView CFD (Gold) or Crypto Scanner
  try {
    const isGold = symbol === 'GOLD-THB' || symbol === 'GC=F';
    const tvEndpoint = isGold ? 'cfd' : 'crypto';
    const tvTicker = isGold ? 'OANDA:XAUUSD' : `BINANCE:${binancePair}`;
    const data = await fetchJsonWithTimeout(`https://scanner.tradingview.com/${tvEndpoint}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: [tvTicker] },
        columns: ['close', 'change'],
      }),
    });
    const row = data?.data?.[0]?.d;
    const priceUsd = Number(row?.[0]);
    const changePct = Number(row?.[1] ?? 0);
    if (Number.isFinite(priceUsd) && priceUsd > 0) {
      const priceThb = convertNativeToThb(symbol, priceUsd, 'USD', usdThb);
      const prevCloseThb = changePct !== -100 ? priceThb / (1 + changePct / 100) : priceThb;
      const payload: MarketQuotePayload = {
        symbol,
        priceThb: Number(priceThb.toFixed(2)),
        priceNative: Number(priceUsd.toFixed(4)),
        nativeCurrency: isGold ? 'USD/oz' : 'USD',
        changePercent: Number(changePct.toFixed(2)),
        previousCloseThb: Number(prevCloseThb.toFixed(2)),
        usdThbRate: Number(usdThb.toFixed(2)),
        updatedAt: new Date().toISOString(),
        source: 'tradingview',
      };
      quoteCache.set(symbol, { value: payload, expiresAt: Date.now() + 60 * 1000 });
      return payload;
    }
  } catch {
    // Return stale cached value if available
  }

  return quoteCache.get(symbol)?.value ?? null;
}

// --- Thai & US Stock Quotes ---
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
      const requested = symbols.find((s) => s.replace(/\.BK$/i, '') === base) || `${base}.BK`;
      const close = Number(row?.d?.[0]);
      const changePct = Number(row?.d?.[1] ?? 0);
      if (!Number.isFinite(close) || close <= 0) continue;
      const prevClose = changePct !== -100 ? close / (1 + changePct / 100) : close;
      const payload: MarketQuotePayload = {
        symbol: requested,
        priceThb: Number(close.toFixed(2)),
        priceNative: Number(close.toFixed(4)),
        nativeCurrency: 'THB',
        changePercent: Number(changePct.toFixed(2)),
        previousCloseThb: Number(prevClose.toFixed(2)),
        usdThbRate: Number(usdThb.toFixed(2)),
        updatedAt: new Date().toISOString(),
        source: 'tradingview',
      };
      quoteCache.set(requested, { value: payload, expiresAt: Date.now() + 60 * 1000 });
      out[requested] = payload;
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
        range: [0, Math.max(25, symbols.length * 4)],
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
    // Fallback to Nasdaq single-symbol info below
  }

  // Fallback for any missing symbol: try Nasdaq, then Thai SET (in case user typed e.g. PTT or KBANK without .BK)
  const missing = symbols.filter((s) => !out[s]);
  for (const sym of missing) {
    let found = false;
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
          found = true;
          break;
        }
      } catch {
        // Try next assetClass
      }
    }

    if (!found && /^[A-Z0-9]{2,10}$/.test(sym)) {
      const thaiTry = await fetchTradingViewThaiQuotes([sym], usdThb);
      if (thaiTry[sym]) {
        out[sym] = thaiTry[sym];
      }
    }
  }

  return out;
}

// --- Gold & Crypto Historical Chart (Binance Vision -> Binance -> TradingView) ---
async function fetchBinanceChart(
  symbol: string,
  binancePair: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const limit =
    range === '5d' ? 120 : range === '1mo' ? 30 : range === '3mo' ? 90 : range === '6mo' ? 180 : 365;
  const kInterval = range === '5d' ? '1h' : '1d';

  for (const host of BINANCE_HOSTS) {
    try {
      const klines = await fetchJsonWithTimeout(
        `${host}/api/v3/klines?symbol=${encodeURIComponent(binancePair)}&interval=${kInterval}&limit=${limit}`
      );
      if (!Array.isArray(klines) || klines.length === 0) continue;

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
    } catch {
      // Try next host
    }
  }

  // Bulletproof Fallback: TradingView CFD (Gold) or Crypto Scanner performance curve
  const isGold = symbol === 'GOLD-THB' || symbol === 'GC=F';
  const tvEndpoint = isGold ? 'cfd' : 'crypto';
  const tvTicker = isGold ? 'OANDA:XAUUSD' : `BINANCE:${binancePair}`;
  const tvData = await fetchJsonWithTimeout(`https://scanner.tradingview.com/${tvEndpoint}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: [tvTicker] },
      columns: ['close', 'change', 'Perf.W', 'Perf.1M', 'Perf.3M', 'Perf.6M', 'Perf.Y'],
    }),
  });
  const row = tvData?.data?.[0]?.d;
  if (!Array.isArray(row) || !Number.isFinite(Number(row[0])) || Number(row[0]) <= 0) {
    throw new Error(`Unable to fetch chart for ${symbol}`);
  }
  return buildCurveFromPerformanceAnchors(
    symbol,
    range,
    Number(row[0]),
    isGold ? 'USD/oz' : 'USD',
    {
      d: Number(row[1] ?? 0),
      w: Number(row[2] ?? row[1] ?? 0),
      m1: Number(row[3] ?? row[2] ?? 0),
      m3: Number(row[4] ?? row[3] ?? 0),
      m6: Number(row[5] ?? row[4] ?? 0),
      y1: Number(row[6] ?? row[5] ?? 0),
    },
    usdThb
  );
}

// --- US Stocks & ETFs Historical Chart (Nasdaq -> TradingView America -> TradingView Thailand) ---
function parseNasdaqDate(mmddyyyy: string): Date | null {
  const parts = mmddyyyy.split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

async function fetchTradingViewUsStockChart(
  symbol: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const data = await fetchJsonWithTimeout('https://scanner.tradingview.com/america/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: [{ left: 'name', operation: 'equal', right: symbol }],
      columns: ['name', 'close', 'change', 'currency', 'Perf.W', 'Perf.1M', 'Perf.3M', 'Perf.6M', 'Perf.Y'],
      range: [0, 5],
    }),
  });
  const row = data?.data?.[0]?.d;
  if (!Array.isArray(row) || !Number.isFinite(Number(row[1])) || Number(row[1]) <= 0) {
    throw new Error(`US stock ${symbol} not found on TradingView`);
  }
  const closeUsd = Number(row[1]);
  const curr = String(row[3] || 'USD');
  return buildCurveFromPerformanceAnchors(
    symbol,
    range,
    closeUsd,
    curr,
    {
      d: Number(row[2] ?? 0),
      w: Number(row[4] ?? row[2] ?? 0),
      m1: Number(row[5] ?? row[4] ?? 0),
      m3: Number(row[6] ?? row[5] ?? 0),
      m6: Number(row[7] ?? row[6] ?? 0),
      y1: Number(row[8] ?? row[7] ?? 0),
    },
    usdThb
  );
}

async function fetchNasdaqHistoricalChart(
  symbol: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const daysBack =
    range === '5d' ? 12 : range === '1mo' ? 35 : range === '3mo' ? 95 : range === '6mo' ? 185 : 370;
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const toIso = toDate.toISOString().slice(0, 10);
  const fromIso = fromDate.toISOString().slice(0, 10);

  let rows: any[] = [];
  for (const assetClass of ['stocks', 'etf']) {
    try {
      const data = await fetchJsonWithTimeout(
        `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=${assetClass}&fromdate=${fromIso}&todate=${toIso}&limit=400`,
        {},
        7000
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

  if (rows.length > 0) {
    const series: MarketChartPoint[] = [];
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

    if (series.length > 0) {
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
  }

  // Fallback 1: TradingView America Scanner (works even when Nasdaq blocks or omits NYSE/ETF symbols)
  try {
    return await fetchTradingViewUsStockChart(symbol, range, usdThb);
  } catch {
    // Fallback 2: Check if user entered a Thai SET stock without .BK suffix (e.g., PTT, KBANK, ADVANC)
    return await fetchThaiStockChart(symbol, range, usdThb);
  }
}

// --- Thai Stocks Historical Chart (TradingView Thailand Scanner) ---
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

  return buildCurveFromPerformanceAnchors(
    symbol,
    range,
    Number(row[0]),
    'THB',
    {
      d: Number(row[1] ?? 0),
      w: Number(row[2] ?? row[1] ?? 0),
      m1: Number(row[3] ?? row[2] ?? 0),
      m3: Number(row[4] ?? row[3] ?? 0),
      m6: Number(row[5] ?? row[4] ?? 0),
      y1: Number(row[6] ?? row[5] ?? 0),
    },
    usdThb
  );
}

async function fetchChartSeries(
  rawSymbol: string,
  range: string,
  usdThb: number
): Promise<MarketChartPayload> {
  const symbol = normalizeSymbol(rawSymbol);
  const cacheKey = `${symbol}:${range}`;
  const now = Date.now();
  const cached = chartCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    let payload: MarketChartPayload;
    const binancePair = getBinancePair(symbol);

    if (FX_PAIR_META[symbol]) {
      payload = await fetchFxChart(symbol, range, usdThb);
    } else if (binancePair) {
      payload = await fetchBinanceChart(symbol, binancePair, range, usdThb);
    } else if (symbol.endsWith('.BK')) {
      payload = await fetchThaiStockChart(symbol, range, usdThb);
    } else {
      payload = await fetchNasdaqHistoricalChart(symbol, range, usdThb);
    }

    chartCache.set(cacheKey, { value: payload, expiresAt: now + 90 * 1000 });
    return payload;
  } catch (err) {
    // Graceful stale-cache fallback if upstream transiently fails
    if (cached) {
      return cached.value;
    }
    throw err;
  }
}

// --- API Routes ---
app.get('/api/market/quotes', async (req, res) => {
  try {
    const raw = typeof req.query.symbols === 'string' ? req.query.symbols : '';
    const requestedSymbols = Array.from(
      new Set(
        raw
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => SYMBOL_REGEX.test(s))
      )
    ).slice(0, 50);

    if (requestedSymbols.length === 0) {
      res.status(400).json({ error: 'Valid symbols query parameter is required.' });
      return;
    }

    const usdThb = await getUsdThbRate();
    const now = Date.now();
    const quotes: Record<string, MarketQuotePayload> = {};

    const fxSymbols: string[] = [];
    const binanceSymbols: { symbol: string; pair: string }[] = [];
    const thaiSymbols: string[] = [];
    const usSymbols: string[] = [];
    const aliasBackMap = new Map<string, string[]>();

    for (const origSym of requestedSymbols) {
      const norm = normalizeSymbol(origSym);
      const list = aliasBackMap.get(norm) || [];
      list.push(origSym);
      aliasBackMap.set(norm, list);
    }

    for (const normSym of aliasBackMap.keys()) {
      const cached = quoteCache.get(normSym);
      if (cached && cached.expiresAt > now) {
        quotes[normSym] = cached.value;
        continue;
      }
      if (FX_PAIR_META[normSym]) {
        fxSymbols.push(normSym);
      } else {
        const pair = getBinancePair(normSym);
        if (pair) {
          binanceSymbols.push({ symbol: normSym, pair });
        } else if (normSym.endsWith('.BK')) {
          thaiSymbols.push(normSym);
        } else {
          usSymbols.push(normSym);
        }
      }
    }

    const [fxResults, binanceResults, thaiResults, usResults] = await Promise.all([
      fetchFxQuotes(fxSymbols, usdThb),
      Promise.all(binanceSymbols.map((b) => fetchBinanceQuote(b.symbol, b.pair, usdThb))),
      fetchTradingViewThaiQuotes(thaiSymbols, usdThb),
      fetchTradingViewUsQuotes(usSymbols, usdThb),
    ]);

    Object.assign(quotes, fxResults, thaiResults, usResults);
    for (const q of binanceResults) {
      if (q) quotes[q.symbol] = q;
    }

    // Also mirror normalized results back to original alias keys if caller requested e.g. USDTHB=X
    for (const [norm, originals] of aliasBackMap.entries()) {
      const resolved = quotes[norm];
      if (!resolved) continue;
      for (const orig of originals) {
        if (orig !== norm) {
          quotes[orig] = { ...resolved, symbol: orig };
        }
      }
    }

    res.json({
      usdThbRate: Number((quotes['USD-THB']?.priceThb || usdThb).toFixed(2)),
      updatedAt: new Date().toISOString(),
      quotes,
    });
  } catch {
    res.status(502).json({ error: 'Failed to fetch live market quotes.' });
  }
});

app.get('/api/market/chart', async (req, res) => {
  try {
    const rawSym = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
    const range = typeof req.query.range === 'string' ? req.query.range.trim() : '1mo';

    if (!SYMBOL_REGEX.test(rawSym)) {
      res.status(400).json({ error: 'Invalid ticker symbol.' });
      return;
    }
    const safeRange = ALLOWED_RANGES.has(range) ? range : '1mo';
    const usdThb = await getUsdThbRate();
    const chart = await fetchChartSeries(rawSym, safeRange, usdThb);
    res.json(chart);
  } catch {
    res.status(502).json({ error: 'Failed to fetch market chart data.' });
  }
});

app.get('/api/market/price-on-date', async (req, res) => {
  try {
    const rawSym = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
    const dateStr = typeof req.query.date === 'string' ? req.query.date.trim() : '';

    if (!SYMBOL_REGEX.test(rawSym) || !DATE_REGEX.test(dateStr)) {
      res.status(400).json({ error: 'Valid symbol and YYYY-MM-DD date are required.' });
      return;
    }

    const usdThb = await getUsdThbRate();
    const chart = await fetchChartSeries(rawSym, '1y', usdThb);
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
      symbol: chart.symbol,
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
