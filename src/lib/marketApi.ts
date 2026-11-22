import type { MarketChartData, MarketQuote } from '../types/finance';

const QUOTE_CACHE_KEY = 'friday_market_quotes_cache_v1';

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

export function saveCachedQuotes(quotes: Record<string, MarketQuote>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(quotes));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchLiveMarketQuotes(
  symbols: string[]
): Promise<{ quotes: Record<string, MarketQuote>; usdThbRate: number; updatedAt: string }> {
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (unique.length === 0) {
    return { quotes: {}, usdThbRate: 34.5, updatedAt: new Date().toISOString() };
  }
  const params = new URLSearchParams({ symbols: unique.join(',') });
  const res = await fetch(`/api/market/quotes?${params.toString()}`);
  if (!res.ok) {
    throw new Error('ไม่สามารถดึงราคาตลาดล่าสุดได้');
  }
  const data = await res.json();
  return {
    quotes: data.quotes || {},
    usdThbRate: Number(data.usdThbRate || 34.5),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

export async function fetchMarketChart(
  symbol: string,
  range: '5d' | '1mo' | '3mo' | '6mo' | '1y'
): Promise<MarketChartData> {
  const params = new URLSearchParams({
    symbol: symbol.trim().toUpperCase(),
    range,
  });
  const res = await fetch(`/api/market/chart?${params.toString()}`);
  if (!res.ok) {
    throw new Error('ไม่สามารถโหลดกราฟราคาตลาดได้');
  }
  return res.json();
}

export async function fetchHistoricalPriceOnDate(
  symbol: string,
  date: string
): Promise<{ priceThb: number; matchedDate: string }> {
  const params = new URLSearchParams({
    symbol: symbol.trim().toUpperCase(),
    date,
  });
  const res = await fetch(`/api/market/price-on-date?${params.toString()}`);
  if (!res.ok) {
    throw new Error('ไม่สามารถดึงราคาตลาดย้อนหลังของวันที่เลือกได้');
  }
  const data = await res.json();
  return {
    priceThb: Number(data.priceThb),
    matchedDate: String(data.matchedDate || date),
  };
}
