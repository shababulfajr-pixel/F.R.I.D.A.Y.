import type { MarketChartData, MarketChartPoint, MarketQuote } from '../types/finance';

const QUOTE_CACHE_KEY = 'friday_market_quotes_cache_v2';
const QUOTE_META_KEY = 'friday_market_meta_v2';
const CHART_CACHE_PREFIX = 'friday_market_chart_v2_';

const THAI_GOLD_BAHT_TROY_OZ = 0.472909;

export function loadCachedQuotes(): Record<string, MarketQuote> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(QUOTE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadCachedMarketMeta(): { usdThbRate: number; updatedAt: string | null } {
  if (typeof window === 'undefined') return { usdThbRate: 34.0, updatedAt: null };
  try {
    const raw = window.localStorage.getItem(QUOTE_META_KEY);
    if (!raw) return { usdThbRate: 34.0, updatedAt: null };
    const parsed = JSON.parse(raw);
    return {
      usdThbRate: Number(parsed?.usdThbRate) > 15 ? Number(parsed.usdThbRate) : 34.0,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return { usdThbRate: 34.0, updatedAt: null };
  }
}

export function saveCachedQuotes(
  quotes: Record<string, MarketQuote>,
  meta?: { usdThbRate: number; updatedAt: string }
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(quotes));
    if (meta) {
      window.localStorage.setItem(QUOTE_META_KEY, JSON.stringify(meta));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCachedChart(symbol: string, range: string): MarketChartData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${CHART_CACHE_PREFIX}${symbol}_${range}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.series) && parsed.series.length > 0) {
      return parsed as MarketChartData;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCachedChart(symbol: string, range: string, chart: MarketChartData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${CHART_CACHE_PREFIX}${symbol}_${range}`, JSON.stringify(chart));
  } catch {
    // Ignore storage quota errors
  }
}

async function fetchJsonSafe(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Direct browser CORS fallback when Express /api/market/* proxy is unavailable
async function fetchClientDirectUsdThb(): Promise<number> {
  const er = await fetchJsonSafe('https://open.er-api.com/v6/latest/USD');
  const rate = Number(er?.rates?.THB);
  if (Number.isFinite(rate) && rate > 15 && rate < 80) return rate;
  return 34.0;
}

async function fetchClientFallbackQuotes(
  symbols: string[]
): Promise<{ quotes: Record<string, MarketQuote>; usdThbRate: number; updatedAt: string }> {
  const usdThb = await fetchClientDirectUsdThb();
  const quotes: Record<string, MarketQuote> = {};
  const nowIso = new Date().toISOString();

  await Promise.all(
    symbols.map(async (sym) => {
      if (sym === 'USD-THB') {
        quotes[sym] = {
          symbol: sym,
          priceThb: Number(usdThb.toFixed(2)),
          priceNative: Number(usdThb.toFixed(4)),
          nativeCurrency: 'THB',
          changePercent: 0,
          previousCloseThb: Number(usdThb.toFixed(2)),
          usdThbRate: Number(usdThb.toFixed(2)),
          updatedAt: nowIso,
          source: 'open-er-api',
        };
        return;
      }

      let binancePair: string | null = null;
      if (sym === 'GOLD-THB' || sym === 'GC=F') {
        binancePair = 'PAXGUSDT';
      } else if (sym.endsWith('-USD')) {
        binancePair = `${sym.slice(0, -4)}USDT`;
      }
      if (!binancePair) return;

      const ticker = await fetchJsonSafe(
        `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${encodeURIComponent(binancePair)}`
      );
      const priceUsd = Number(ticker?.lastPrice);
      const changePct = Number(ticker?.priceChangePercent || 0);
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) return;

      const priceThb =
        sym === 'GOLD-THB' ? priceUsd * usdThb * THAI_GOLD_BAHT_TROY_OZ : priceUsd * usdThb;
      const prevCloseThb = changePct !== -100 ? priceThb / (1 + changePct / 100) : priceThb;
      quotes[sym] = {
        symbol: sym,
        priceThb: Number(priceThb.toFixed(2)),
        priceNative: Number(priceUsd.toFixed(4)),
        nativeCurrency: sym === 'GOLD-THB' || sym === 'GC=F' ? 'USD/oz' : 'USD',
        changePercent: Number(changePct.toFixed(2)),
        previousCloseThb: Number(prevCloseThb.toFixed(2)),
        usdThbRate: Number(usdThb.toFixed(2)),
        updatedAt: nowIso,
        source: 'binance-vision',
      };
    })
  );

  return {
    quotes,
    usdThbRate: Number(usdThb.toFixed(2)),
    updatedAt: nowIso,
  };
}

async function fetchClientFallbackChart(
  symbol: string,
  range: '5d' | '1mo' | '3mo' | '6mo' | '1y'
): Promise<MarketChartData | null> {
  const usdThb = await fetchClientDirectUsdThb();
  let binancePair: string | null = null;
  if (symbol === 'GOLD-THB' || symbol === 'GC=F') {
    binancePair = 'PAXGUSDT';
  } else if (symbol.endsWith('-USD')) {
    binancePair = `${symbol.slice(0, -4)}USDT`;
  }

  if (binancePair) {
    const limit =
      range === '5d' ? 120 : range === '1mo' ? 30 : range === '3mo' ? 90 : range === '6mo' ? 180 : 365;
    const kInterval = range === '5d' ? '1h' : '1d';
    const klines = await fetchJsonSafe(
      `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(binancePair)}&interval=${kInterval}&limit=${limit}`
    );
    if (Array.isArray(klines) && klines.length > 0) {
      const series: MarketChartPoint[] = klines.map((k: any[]) => {
        const ts = Number(k[0]);
        const closeUsd = Number(k[4]);
        const d = new Date(ts);
        const priceThb =
          symbol === 'GOLD-THB' ? closeUsd * usdThb * THAI_GOLD_BAHT_TROY_OZ : closeUsd * usdThb;
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
      const first = series[0];
      const latest = series[series.length - 1];
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
  }

  return loadCachedChart(symbol, range);
}

export async function fetchLiveMarketQuotes(
  symbols: string[]
): Promise<{ quotes: Record<string, MarketQuote>; usdThbRate: number; updatedAt: string }> {
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (unique.length === 0) {
    return { quotes: {}, usdThbRate: 34.0, updatedAt: new Date().toISOString() };
  }

  const params = new URLSearchParams({ symbols: unique.join(',') });
  const data = await fetchJsonSafe(`/api/market/quotes?${params.toString()}`);
  if (data && data.quotes && Object.keys(data.quotes).length > 0) {
    return {
      quotes: data.quotes,
      usdThbRate: Number(data.usdThbRate || 34.0),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  }

  // Fallback directly via browser CORS APIs if backend proxy is unreachable
  const fallback = await fetchClientFallbackQuotes(unique);
  if (Object.keys(fallback.quotes).length > 0) {
    return fallback;
  }

  throw new Error('ไม่สามารถดึงราคาตลาดได้ในขณะนี้ กรุณากดลองใหม่อีกครั้ง');
}

export async function fetchMarketChart(
  symbol: string,
  range: '5d' | '1mo' | '3mo' | '6mo' | '1y'
): Promise<MarketChartData> {
  const cleanSym = symbol.trim().toUpperCase();
  const params = new URLSearchParams({
    symbol: cleanSym,
    range,
  });
  const data = await fetchJsonSafe(`/api/market/chart?${params.toString()}`);
  if (data && Array.isArray(data.series) && data.series.length > 0) {
    saveCachedChart(cleanSym, range, data as MarketChartData);
    return data as MarketChartData;
  }

  const fallback = await fetchClientFallbackChart(cleanSym, range);
  if (fallback && fallback.series.length > 0) {
    saveCachedChart(cleanSym, range, fallback);
    return fallback;
  }

  throw new Error(`ไม่พบข้อมูลกราฟสำหรับสัญลักษณ์ ${cleanSym}`);
}

export async function fetchHistoricalPriceOnDate(
  symbol: string,
  date: string
): Promise<{ priceThb: number; matchedDate: string }> {
  const cleanSym = symbol.trim().toUpperCase();
  const params = new URLSearchParams({
    symbol: cleanSym,
    date,
  });
  const data = await fetchJsonSafe(`/api/market/price-on-date?${params.toString()}`);
  if (data && Number(data.priceThb) > 0) {
    return {
      priceThb: Number(data.priceThb),
      matchedDate: String(data.matchedDate || date),
    };
  }

  // Fallback to current snapshot quote if historical lookup for that date is unavailable
  const snapshot = await fetchLiveMarketQuotes([cleanSym]);
  const liveQuote = snapshot.quotes[cleanSym];
  if (liveQuote && liveQuote.priceThb > 0) {
    return {
      priceThb: liveQuote.priceThb,
      matchedDate: new Date().toISOString().slice(0, 10),
    };
  }

  throw new Error('ไม่สามารถดึงราคาตลาดได้ สามารถกรอกราคาต่อหน่วยเองได้');
}
