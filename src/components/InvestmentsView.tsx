import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/FinanceContext';
import { useTheme } from '../context/ThemeContext';
import {
  createInvestmentPosition,
  deleteInvestmentPosition,
  updateInvestmentPosition,
} from '../lib/firestoreService';
import { fetchHistoricalPriceOnDate, fetchMarketChart } from '../lib/marketApi';
import {
  ASSET_TYPE_META,
  BLUEPRINT_LIMITS,
  formatCurrency,
  formatDateThai,
  getAssetUnitLabel,
  getCatalogAsset,
  getTodayISO,
  MARKET_CATALOG,
  type AssetType,
  type InvestmentPositionRecord,
  type MarketChartData,
} from '../types/finance';

type ChartRange = '5d' | '1mo' | '3mo' | '6mo' | '1y';

const CHART_RANGES: { id: ChartRange; label: string }[] = [
  { id: '5d', label: '5D' },
  { id: '1mo', label: '1M' },
  { id: '3mo', label: '3M' },
  { id: '6mo', label: '6M' },
  { id: '1y', label: '1Y' },
];

const ASSET_TABS: { id: AssetType; label: string }[] = [
  { id: 'gold', label: 'ทองคำ' },
  { id: 'crypto', label: 'คริปโท' },
  { id: 'stock', label: 'หุ้น' },
];

function formatUnits(units: number): string {
  if (!Number.isFinite(units) || units <= 0) return '0';
  if (units >= 100) return units.toLocaleString('th-TH', { maximumFractionDigits: 2 });
  if (units >= 1) return units.toLocaleString('th-TH', { maximumFractionDigits: 4 });
  return units.toLocaleString('th-TH', { maximumFractionDigits: 6 });
}

function formatUpdatedTime(iso: string | null): string {
  if (!iso) return 'ราคาล่าสุดจากแคช';
  try {
    const d = new Date(iso);
    return `อัปเดต ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
  } catch {
    return 'ราคาล่าสุด';
  }
}

export function InvestmentsView() {
  const {
    user,
    currency,
    investments,
    marketQuotes,
    usdThbRate,
    marketLoading,
    marketUpdatedAt,
    marketError,
    refreshMarketQuotes,
    cashNetSavings,
    totalInvestedCost,
    totalInvestmentValue,
    totalInvestmentProfit,
    totalInvestmentProfitPct,
    netTotalSavings,
    pushToast,
  } = useFinance();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [activeAssetTab, setActiveAssetTab] = useState<AssetType>('gold');
  const [activeSymbol, setActiveSymbol] = useState<string>('GOLD-THB');
  const [chartRange, setChartRange] = useState<ChartRange>('1mo');
  const [chartData, setChartData] = useState<MarketChartData | null>(null);
  const [chartLoading, setChartLoading] = useState<boolean>(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const [customTickerInput, setCustomTickerInput] = useState<string>('');

  // Modal state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InvestmentPositionRecord | null>(null);
  const [formAssetType, setFormAssetType] = useState<AssetType>('gold');
  const [formSymbol, setFormSymbol] = useState<string>('GOLD-THB');
  const [formAssetName, setFormAssetName] = useState<string>('ทองคำแท่ง 96.5% (ต่อบาททอง)');
  const [formInvestedAmount, setFormInvestedAmount] = useState<string>('2000');
  const [formPurchaseDate, setFormPurchaseDate] = useState<string>(getTodayISO());
  const [formEntryPriceThb, setFormEntryPriceThb] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [fetchingPrice, setFetchingPrice] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const catalogForActiveTab = useMemo(
    () => MARKET_CATALOG.filter((a) => a.assetType === activeAssetTab),
    [activeAssetTab]
  );

  const catalogForFormTab = useMemo(
    () => MARKET_CATALOG.filter((a) => a.assetType === formAssetType),
    [formAssetType]
  );

  // Load chart whenever activeSymbol or chartRange changes
  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    setChartError(null);

    fetchMarketChart(activeSymbol, chartRange)
      .then((data) => {
        if (!cancelled) {
          setChartData(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setChartError(err instanceof Error ? err.message : 'ไม่สามารถโหลดกราฟราคาตลาดได้');
        }
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSymbol, chartRange]);

  const handleSelectAssetTab = (tab: AssetType) => {
    setActiveAssetTab(tab);
    const first = MARKET_CATALOG.find((a) => a.assetType === tab);
    if (first) {
      setActiveSymbol(first.symbol);
      void refreshMarketQuotes(MARKET_CATALOG.filter((a) => a.assetType === tab).map((a) => a.symbol));
    }
  };

  const handleSearchCustomTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customTickerInput.trim().toUpperCase();
    if (!cleaned || !BLUEPRINT_LIMITS.SYMBOL_PATTERN.test(cleaned)) {
      pushToast({
        title: 'สัญลักษณ์ไม่ถูกต้อง',
        description: 'ตัวอย่างเช่น AAPL, NVDA, PTT.BK, BTC-USD, ETH-USD',
        tone: 'warning',
      });
      return;
    }
    setActiveSymbol(cleaned);
    await refreshMarketQuotes([cleaned]);
    setCustomTickerInput('');
  };

  const openAddModal = (prefillSymbol?: string) => {
    const sym = (prefillSymbol || activeSymbol || 'GOLD-THB').toUpperCase();
    const cat = getCatalogAsset(sym);
    const type: AssetType = cat ? cat.assetType : activeAssetTab;
    const livePrice =
      marketQuotes[sym]?.priceThb ||
      (chartData?.symbol === sym ? chartData.priceThb : 0);

    setEditingItem(null);
    setFormAssetType(type);
    setFormSymbol(sym);
    setFormAssetName(cat ? cat.name : sym);
    setFormInvestedAmount('2000');
    setFormPurchaseDate(getTodayISO());
    setFormEntryPriceThb(livePrice > 0 ? String(Number(livePrice.toFixed(2))) : '');
    setFormNote('');
    setFormError(null);
    setModalOpen(true);

    if (livePrice <= 0) {
      void handleLookupPriceForForm(sym, getTodayISO());
    }
  };

  const openEditModal = (item: InvestmentPositionRecord) => {
    setEditingItem(item);
    setFormAssetType(item.assetType);
    setFormSymbol(item.symbol);
    setFormAssetName(item.assetName);
    setFormInvestedAmount(String(item.investedAmount));
    setFormPurchaseDate(item.purchaseDate);
    setFormEntryPriceThb(String(Number(item.entryPriceThb.toFixed(4))));
    setFormNote(item.note || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleLookupPriceForForm = async (sym: string, dateStr: string) => {
    const cleanSym = sym.trim().toUpperCase();
    if (!cleanSym || !BLUEPRINT_LIMITS.SYMBOL_PATTERN.test(cleanSym)) return;
    setFetchingPrice(true);
    setFormError(null);
    try {
      if (dateStr === getTodayISO()) {
        const res = await refreshMarketQuotes([cleanSym]);
        const quote = res[cleanSym] || marketQuotes[cleanSym];
        if (quote && quote.priceThb > 0) {
          setFormEntryPriceThb(String(Number(quote.priceThb.toFixed(2))));
          return;
        }
      }
      const hist = await fetchHistoricalPriceOnDate(cleanSym, dateStr);
      if (hist.priceThb > 0) {
        setFormEntryPriceThb(String(Number(hist.priceThb.toFixed(2))));
      }
    } catch (err) {
      const fallbackLive = marketQuotes[cleanSym]?.priceThb;
      if (fallbackLive && fallbackLive > 0) {
        setFormEntryPriceThb(String(Number(fallbackLive.toFixed(2))));
      } else {
        setFormError(
          err instanceof Error
            ? err.message
            : 'ไม่สามารถดึงราคาตลาดอัตโนมัติได้ สามารถกรอกราคาต่อหน่วยเองได้'
        );
      }
    } finally {
      setFetchingPrice(false);
    }
  };

  const handleFormAssetTypeChange = (nextType: AssetType) => {
    if (editingItem) return;
    setFormAssetType(nextType);
    const first = MARKET_CATALOG.find((a) => a.assetType === nextType);
    if (first) {
      setFormSymbol(first.symbol);
      setFormAssetName(first.name);
      const livePrice = marketQuotes[first.symbol]?.priceThb;
      if (livePrice && livePrice > 0 && formPurchaseDate === getTodayISO()) {
        setFormEntryPriceThb(String(Number(livePrice.toFixed(2))));
      } else {
        void handleLookupPriceForForm(first.symbol, formPurchaseDate);
      }
    }
  };

  const handleFormSymbolSelect = (sym: string) => {
    if (editingItem) return;
    const clean = sym.toUpperCase();
    setFormSymbol(clean);
    const cat = getCatalogAsset(clean);
    if (cat) {
      setFormAssetName(cat.name);
      setFormAssetType(cat.assetType);
    } else {
      setFormAssetName(clean);
    }
    const livePrice = marketQuotes[clean]?.priceThb;
    if (livePrice && livePrice > 0 && formPurchaseDate === getTodayISO()) {
      setFormEntryPriceThb(String(Number(livePrice.toFixed(2))));
    } else {
      void handleLookupPriceForForm(clean, formPurchaseDate);
    }
  };

  const handleSaveInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const cleanSym = formSymbol.trim().toUpperCase();
    const amountNum = Number(formInvestedAmount);
    const entryNum = Number(formEntryPriceThb);

    if (!cleanSym || !BLUEPRINT_LIMITS.SYMBOL_PATTERN.test(cleanSym)) {
      setFormError('กรุณาระบุสัญลักษณ์สินทรัพย์ที่ถูกต้อง (เช่น GOLD-THB, BTC-USD, AAPL)');
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFormError('กรุณาระบุจำนวนเงินลงทุนที่มากกว่า 0 บาท');
      return;
    }
    if (!Number.isFinite(entryNum) || entryNum <= 0) {
      setFormError('กรุณาระบุราคาต่อหน่วย ณ วันที่ซื้อ หรือกดปุ่มดึงราคาตลาด');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await updateInvestmentPosition(user.uid, editingItem.id, {
          assetName: formAssetName.trim() || cleanSym,
          investedAmount: amountNum,
          entryPriceThb: entryNum,
          purchaseDate: formPurchaseDate,
          note: formNote,
        });
        pushToast({
          title: 'อัปเดตรายการลงทุนแล้ว',
          description: `${formAssetName.trim() || cleanSym} · ทุน ${formatCurrency(amountNum, currency)}`,
          tone: 'success',
        });
      } else {
        await createInvestmentPosition(user.uid, {
          assetType: formAssetType,
          symbol: cleanSym,
          assetName: formAssetName.trim() || cleanSym,
          investedAmount: amountNum,
          entryPriceThb: entryNum,
          purchaseDate: formPurchaseDate,
          note: formNote,
        });
        pushToast({
          title: 'เพิ่มการลงทุนเรียบร้อย',
          description: `ลงทุน ${formatCurrency(amountNum, currency)} ใน ${formAssetName.trim() || cleanSym} และสรุปเข้าเงินออมสุทธิแล้ว`,
          tone: 'success',
        });
      }
      setModalOpen(false);
      setEditingItem(null);
      setActiveSymbol(cleanSym);
      setActiveAssetTab(formAssetType);
      void refreshMarketQuotes([cleanSym]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลการลงทุนได้');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInvestment = async (id: string) => {
    if (!user) return;
    setDeletingId(id);
    try {
      await deleteInvestmentPosition(user.uid, id);
      pushToast({
        title: 'ลบรายการลงทุนแล้ว',
        tone: 'info',
      });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // Enriched holdings with live market valuation
  const valuedHoldings = useMemo(() => {
    return investments.map((inv) => {
      const quote = marketQuotes[inv.symbol];
      const livePriceThb = quote?.priceThb ?? inv.entryPriceThb;
      const currentValue = inv.units * livePriceThb;
      const profitThb = currentValue - inv.investedAmount;
      const profitPct = inv.investedAmount > 0 ? (profitThb / inv.investedAmount) * 100 : 0;
      const dayChangePct = quote?.changePercent ?? 0;
      const hasLivePrice = Boolean(quote);
      return {
        ...inv,
        livePriceThb,
        currentValue,
        profitThb,
        profitPct,
        dayChangePct,
        hasLivePrice,
      };
    });
  }, [investments, marketQuotes]);

  // Portfolio allocation breakdown by assetType
  const allocationByType = useMemo(() => {
    const totals: Record<AssetType, number> = { gold: 0, crypto: 0, stock: 0 };
    for (const h of valuedHoldings) {
      totals[h.assetType] += h.currentValue;
    }
    const grandTotal = totals.gold + totals.crypto + totals.stock;
    return (['gold', 'crypto', 'stock'] as AssetType[])
      .map((type) => ({
        type,
        name: ASSET_TYPE_META[type].label,
        color: ASSET_TYPE_META[type].color,
        value: totals[type],
        percent: grandTotal > 0 ? (totals[type] / grandTotal) * 100 : 0,
      }))
      .filter((x) => x.value > 0);
  }, [valuedHoldings]);

  const activeCatalogMeta = getCatalogAsset(activeSymbol);
  const activeQuote = marketQuotes[activeSymbol];
  const displayPriceThb = chartData?.symbol === activeSymbol ? chartData.priceThb : activeQuote?.priceThb ?? 0;
  const displayChangePct = chartData?.symbol === activeSymbol ? chartData.changePercent : activeQuote?.changePercent ?? 0;
  const isChartPositive = displayChangePct >= 0;
  const chartStrokeColor = isChartPositive
    ? isDark
      ? '#30D158'
      : '#248A3D'
    : isDark
      ? '#FF453A'
      : '#D70015';

  // Form live preview math
  const formInvestedNum = Number(formInvestedAmount) || 0;
  const formEntryNum = Number(formEntryPriceThb) || 0;
  const formPreviewUnits = formInvestedNum > 0 && formEntryNum > 0 ? formInvestedNum / formEntryNum : 0;
  const formLivePrice = marketQuotes[formSymbol.trim().toUpperCase()]?.priceThb ?? formEntryNum;
  const formPreviewCurrentVal = formPreviewUnits * (formLivePrice > 0 ? formLivePrice : formEntryNum);
  const formPreviewDiff = formPreviewCurrentVal - formInvestedNum;

  return (
    <div className="space-y-6">
      {/* Portfolio Hero Liquid Glass Stage */}
      <section className="apple-glass-hero rounded-[32px] p-7 md:p-9">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-6">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                <span>มูลค่าพอร์ตลงทุนปัจจุบัน (ทองคำ · คริปโท · หุ้น)</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{formatUpdatedTime(marketUpdatedAt)}</span>
              </div>
              <div className="text-[40px] sm:text-[52px] font-semibold font-mono-num tracking-[-0.038em] leading-none text-[#1D1D1F] dark:text-white">
                {formatCurrency(totalInvestmentValue, currency)}
              </div>
            </div>

            {/* Clean Hairline-Separated Investment Telemetry */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-6 border-t border-black/[0.06] dark:border-white/[0.1]">
              <div className="space-y-1">
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">เงินลงทุนรวม (ต้นทุน)</div>
                <div className="text-xl font-semibold font-mono-num text-[#1D1D1F] dark:text-white">
                  {formatCurrency(totalInvestedCost, currency)}
                </div>
              </div>

              <div className="space-y-1 sm:pl-5 sm:border-l sm:border-black/[0.06] dark:sm:border-white/[0.1]">
                <div className="flex items-center gap-1 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  {totalInvestmentProfit >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#248A3D] dark:text-[#30D158]" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 text-[#D70015] dark:text-[#FF453A]" />
                  )}
                  <span>
                    {totalInvestmentProfit >= 0 ? 'กำไรสุทธิ' : 'ขาดทุนสุทธิ'} ({totalInvestmentProfitPct >= 0 ? '+' : ''}
                    {totalInvestmentProfitPct.toFixed(2)}%)
                  </span>
                </div>
                <div
                  className={`text-xl font-semibold font-mono-num ${
                    totalInvestmentProfit >= 0
                      ? 'text-[#248A3D] dark:text-[#30D158]'
                      : 'text-[#D70015] dark:text-[#FF453A]'
                  }`}
                >
                  {totalInvestmentProfit >= 0 ? '+' : ''}
                  {formatCurrency(totalInvestmentProfit, currency)}
                </div>
              </div>

              <div className="space-y-1 sm:pl-5 sm:border-l sm:border-black/[0.06] dark:sm:border-white/[0.1]">
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">เงินออมสุทธิรวม (เงินสด + ลงทุน)</div>
                <div className="text-xl font-semibold font-mono-num text-[#0071E3] dark:text-[#0A84FF]">
                  {formatCurrency(netTotalSavings, currency)}
                </div>
              </div>
            </div>
          </div>

          {/* Right Quick Actions & Live FX */}
          <div className="lg:col-span-4 lg:pl-8 lg:border-l lg:border-black/[0.06] dark:lg:border-white/[0.1] flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">อัตราแลกเปลี่ยนอ้างอิง</div>
              <div className="text-lg font-semibold font-mono-num text-[#1D1D1F] dark:text-white">
                1 USD ≈ ฿{usdThbRate.toFixed(2)}
              </div>
              <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                เงินสดสะสมในบัญชี {formatCurrency(cashNetSavings, currency)}
              </div>
              {marketError && (
                <div className="text-xs text-[#B25000] dark:text-[#FF9F0A] pt-1">{marketError}</div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => openAddModal()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] active:scale-[0.98] text-white text-xs font-medium transition-all shadow-[0_6px_18px_-6px_rgba(0,113,227,0.55)] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                เพิ่มการลงทุน
              </button>
              <button
                type="button"
                disabled={marketLoading}
                onClick={() => void refreshMarketQuotes([activeSymbol])}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full apple-glass hover:bg-white/90 dark:hover:bg-white/10 disabled:opacity-60 text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${marketLoading ? 'animate-spin' : ''}`} />
                อัปเดตราคา
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Live Market Chart & Watchlist Explorer */}
      <section className="apple-glass rounded-[28px] p-6 md:p-7 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Asset Type Segmented Switcher */}
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] self-start">
            {ASSET_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectAssetTab(tab.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  activeAssetTab === tab.id
                    ? 'bg-white dark:bg-white/20 text-[#1D1D1F] dark:text-white shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#1D1D1F] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Custom Ticker Search */}
          <form onSubmit={handleSearchCustomTicker} className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search className="w-3.5 h-3.5 text-[#86868B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={customTickerInput}
                onChange={(e) => setCustomTickerInput(e.target.value)}
                placeholder="ค้นหาสัญลักษณ์ เช่น AAPL, PTT.BK, BTC-USD"
                className="w-full pl-9 pr-3 py-2 rounded-full bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.1] text-xs text-[#1D1D1F] dark:text-white placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-full apple-glass hover:bg-white/90 dark:hover:bg-white/10 text-xs font-medium text-[#1D1D1F] dark:text-white cursor-pointer whitespace-nowrap"
            >
              ดูกราฟ
            </button>
          </form>
        </div>

        {/* Watchlist Asset Selector Row */}
        <div className="flex flex-wrap items-center gap-2">
          {catalogForActiveTab.map((asset) => {
            const q = marketQuotes[asset.symbol];
            const isSelected = activeSymbol === asset.symbol;
            const chg = q?.changePercent ?? 0;
            return (
              <button
                key={asset.symbol}
                type="button"
                onClick={() => setActiveSymbol(asset.symbol)}
                className={`px-3.5 py-2 rounded-2xl text-left transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-white/95 dark:bg-white/[0.16] border-[#0071E3]/40 dark:border-[#0A84FF]/50 shadow-xs'
                    : 'bg-black/[0.025] dark:bg-white/[0.04] border-transparent hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#1D1D1F] dark:text-white whitespace-nowrap">
                    {asset.shortLabel}
                  </span>
                  {q && (
                    <span
                      className={`text-[11px] font-mono-num font-medium whitespace-nowrap ${
                        chg >= 0
                          ? 'text-[#248A3D] dark:text-[#30D158]'
                          : 'text-[#D70015] dark:text-[#FF453A]'
                      }`}
                    >
                      {chg >= 0 ? '+' : ''}
                      {chg.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono-num text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                  {q ? formatCurrency(q.priceThb, 'THB') : 'กำลังดึงราคา...'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Asset Chart Header + Range Switcher */}
        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              <span className="font-semibold text-[#1D1D1F] dark:text-white">
                {activeCatalogMeta ? activeCatalogMeta.name : activeSymbol}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{activeSymbol}</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl sm:text-4xl font-semibold font-mono-num tracking-[-0.03em] text-[#1D1D1F] dark:text-white">
                {displayPriceThb > 0 ? formatCurrency(displayPriceThb, 'THB') : '—'}
              </span>
              {displayPriceThb > 0 && (
                <span
                  className={`inline-flex items-center gap-1 text-sm font-mono-num font-medium ${
                    isChartPositive
                      ? 'text-[#248A3D] dark:text-[#30D158]'
                      : 'text-[#D70015] dark:text-[#FF453A]'
                  }`}
                >
                  {isChartPositive ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {displayChangePct >= 0 ? '+' : ''}
                  {displayChangePct.toFixed(2)}% ({chartRange.toUpperCase()})
                </span>
              )}
            </div>

            {chartData && chartData.symbol === activeSymbol && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#6E6E73] dark:text-[#A1A1A6] font-mono-num pt-0.5">
                <span>สูงสุด {formatCurrency(chartData.highThb, 'THB')}</span>
                <span>ต่ำสุด {formatCurrency(chartData.lowThb, 'THB')}</span>
                {chartData.nativeCurrency === 'USD' && (
                  <span>
                    ราคาตลาดโลก ${chartData.priceNative.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
              {CHART_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setChartRange(r.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium font-mono-num transition-all cursor-pointer ${
                    chartRange === r.id
                      ? 'bg-white dark:bg-white/20 text-[#1D1D1F] dark:text-white shadow-sm'
                      : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => openAddModal(activeSymbol)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              ลงทุนในสินทรัพย์นี้
            </button>
          </div>
        </div>

        {/* Interactive Historical Market Price Chart */}
        <div className="h-72 w-full">
          {chartLoading ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-[#6E6E73] dark:text-[#A1A1A6] gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#0071E3] dark:text-[#0A84FF]" />
              <span>กำลังดึงข้อมูลกราฟราคาตลาด...</span>
            </div>
          ) : chartError || !chartData || chartData.series.length === 0 ? (
            <div className="h-full w-full flex flex-col items-center justify-center text-center gap-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              <p>{chartError || 'ยังไม่มีข้อมูลกราฟสำหรับสัญลักษณ์นี้'}</p>
              <button
                type="button"
                onClick={() => setChartRange(chartRange)}
                className="text-[#0071E3] dark:text-[#0A84FF] font-medium hover:underline cursor-pointer"
              >
                ลองโหลดใหม่อีกครั้ง
              </button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fridayMarketGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartStrokeColor} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={chartStrokeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 4"
                  stroke={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)'}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: isDark ? '#A1A1A6' : '#6E6E73' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: isDark ? '#A1A1A6' : '#6E6E73' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrency(Number(v), 'THB', true)}
                  width={68}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.95)',
                    border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(15,23,42,0.08)',
                    borderRadius: '16px',
                    fontSize: '12px',
                    backdropFilter: 'blur(20px)',
                    color: isDark ? '#F5F5F7' : '#1D1D1F',
                  }}
                  formatter={(val) => [formatCurrency(Number(val ?? 0), 'THB'), 'ราคา (บาท)']}
                  labelFormatter={(label) => `ช่วงเวลา: ${String(label ?? '')}`}
                />
                <Area
                  type="monotone"
                  dataKey="priceThb"
                  stroke={chartStrokeColor}
                  strokeWidth={2.4}
                  fill="url(#fridayMarketGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Portfolio Holdings & Asset Allocation Breakdown */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Holdings List */}
        <div className="xl:col-span-8 apple-glass rounded-[28px] overflow-hidden">
          <div className="p-6 pb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold text-[#1D1D1F] dark:text-white">
                รายการลงทุนของฉัน ({valuedHoldings.length})
              </h2>
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                มูลค่าปัจจุบันคำนวณอัตโนมัติตามราคาตลาดวันนี้ และรวมเข้ายอดเงินออมสุทธิทันที
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAddModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              บันทึกการลงทุน
            </button>
          </div>

          {valuedHoldings.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3 border-t border-black/[0.06] dark:border-white/[0.08]">
              <Coins className="w-8 h-8 mx-auto text-[#0071E3] dark:text-[#0A84FF] opacity-80" />
              <div className="space-y-1 max-w-md mx-auto">
                <p className="text-sm font-medium text-[#1D1D1F] dark:text-white">
                  ยังไม่มีรายการลงทุนในพอร์ต
                </p>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                  ลองบันทึกการลงทุน เช่น ทองคำ 96.5%, Bitcoin หรือหุ้น AAPL จำนวน 2,000 บาท ระบบจะคำนวณมูลค่าเพิ่ม-ลดตามราคาตลาดวันนี้และสรุปรวมในเงินออมสุทธิให้โดยอัตโนมัติ
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAddModal()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4" />
                เริ่มลงทุนรายการแรก
              </button>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08] border-t border-black/[0.06] dark:border-white/[0.08]">
              {valuedHoldings.map((item) => {
                const isUp = item.profitThb >= 0;
                const unitLabel = getAssetUnitLabel(item.symbol, item.assetType);
                const typeMeta = ASSET_TYPE_META[item.assetType];

                return (
                  <div
                    key={item.id}
                    className="px-6 py-4 hover:bg-black/[0.015] dark:hover:bg-white/[0.025] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveAssetTab(item.assetType);
                            setActiveSymbol(item.symbol);
                          }}
                          className="text-sm font-semibold text-[#1D1D1F] dark:text-white hover:text-[#0071E3] dark:hover:text-[#0A84FF] transition-colors text-left cursor-pointer"
                        >
                          {item.assetName}
                        </button>
                        <span aria-hidden="true" className="text-[#86868B]">·</span>
                        <span className="text-xs font-medium" style={{ color: typeMeta.color }}>
                          {typeMeta.label}
                        </span>
                        <span className="text-xs font-mono-num text-[#86868B]">{item.symbol}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6E6E73] dark:text-[#A1A1A6] font-mono-num">
                        <span>ลงทุน {formatCurrency(item.investedAmount, currency)}</span>
                        <span>·</span>
                        <span>
                          ถือครอง {formatUnits(item.units)} {unitLabel}
                        </span>
                        <span>·</span>
                        <span>ซื้อเมื่อ {formatDateThai(item.purchaseDate)}</span>
                      </div>

                      <div className="text-[11px] text-[#86868B] font-mono-num">
                        ราคาทุน {formatCurrency(item.entryPriceThb, 'THB')} → ราคาตลาด{' '}
                        {formatCurrency(item.livePriceThb, 'THB')}
                        {!item.hasLivePrice ? ' (อ้างอิงราคาทุน)' : ''}
                      </div>

                      {item.note && (
                        <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] pt-0.5">
                          {item.note}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="text-left sm:text-right space-y-0.5">
                        <div className="text-base font-semibold font-mono-num text-[#1D1D1F] dark:text-white">
                          {formatCurrency(item.currentValue, currency)}
                        </div>
                        <div
                          className={`text-xs font-mono-num font-medium ${
                            isUp
                              ? 'text-[#248A3D] dark:text-[#30D158]'
                              : 'text-[#D70015] dark:text-[#FF453A]'
                          }`}
                        >
                          {isUp ? 'กำไร +' : 'ขาดทุน '}
                          {formatCurrency(item.profitThb, currency)} ({item.profitPct >= 0 ? '+' : ''}
                          {item.profitPct.toFixed(2)}%)
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {confirmDeleteId === item.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={deletingId === item.id}
                              onClick={() => void handleDeleteInvestment(item.id)}
                              className="px-2.5 py-1 rounded-full bg-[#D70015] text-white text-[11px] font-medium cursor-pointer"
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 rounded-full bg-black/[0.06] dark:bg-white/[0.1] text-[11px] text-[#1D1D1F] dark:text-white cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              aria-label="แก้ไขรายการลงทุน"
                              className="p-2 rounded-full text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] hover:text-[#1D1D1F] dark:hover:text-white transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              aria-label="ลบรายการลงทุน"
                              className="p-2 rounded-full text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-red-500/10 hover:text-[#D70015] dark:hover:text-[#FF453A] transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Asset Allocation Donut */}
        <div className="xl:col-span-4 apple-glass rounded-[28px] p-6 md:p-7 space-y-4">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1D1D1F] dark:text-white">
              สัดส่วนสินทรัพย์ในพอร์ต
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
              กระจายความเสี่ยงระหว่างทองคำ คริปโท และหุ้น
            </p>
          </div>

          {allocationByType.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              เพิ่มรายการลงทุนเพื่อดูสัดส่วนการกระจายสินทรัพย์
            </div>
          ) : (
            <>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationByType}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={76}
                      paddingAngle={3}
                      cornerRadius={5}
                      stroke="none"
                    >
                      {allocationByType.map((entry) => (
                        <Cell key={entry.type} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.95)',
                        border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(15,23,42,0.08)',
                        borderRadius: '14px',
                        fontSize: '12px',
                        color: isDark ? '#F5F5F7' : '#1D1D1F',
                      }}
                      formatter={(val) => [formatCurrency(Number(val ?? 0), currency), 'มูลค่าปัจจุบัน']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                {allocationByType.map((item) => (
                  <div key={item.type} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-mono-num">
                      <span className="text-[#86868B]">{item.percent.toFixed(1)}%</span>
                      <span className="font-semibold text-[#1D1D1F] dark:text-white">
                        {formatCurrency(item.value, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Add / Edit Investment Sheet Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={editingItem ? 'แก้ไขรายการลงทุน' : 'เพิ่มรายการลงทุนใหม่'}
        >
          <div className="apple-glass-strong w-full max-w-lg rounded-[30px] p-6 sm:p-7 space-y-5 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-white">
                  {editingItem ? 'แก้ไขข้อมูลการลงทุน' : 'บันทึกการลงทุนใหม่'}
                </h2>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                  กรอกยอดเงินลงทุนเป็นบาท ระบบจะคำนวณมูลค่าเพิ่ม-ลดตามราคาตลาดอัตโนมัติ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
                className="p-2 rounded-full text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvestment} className="space-y-4">
              {/* Asset Class Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                  ประเภทสินทรัพย์
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
                  {ASSET_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      disabled={Boolean(editingItem)}
                      onClick={() => handleFormAssetTypeChange(tab.id)}
                      className={`py-2 rounded-full text-xs font-medium transition-all ${
                        editingItem ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                      } ${
                        formAssetType === tab.id
                          ? 'bg-white dark:bg-white/20 text-[#1D1D1F] dark:text-white shadow-sm'
                          : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Popular Asset Pickers */}
              {!editingItem && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    เลือกสินทรัพย์ยอดนิยม
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {catalogForFormTab.map((asset) => (
                      <button
                        key={asset.symbol}
                        type="button"
                        onClick={() => handleFormSymbolSelect(asset.symbol)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                          formSymbol === asset.symbol
                            ? 'bg-[#0071E3] text-white'
                            : 'bg-black/[0.05] dark:bg-white/[0.08] text-[#1D1D1F] dark:text-[#F5F5F7] hover:bg-black/[0.09] dark:hover:bg-white/[0.14]'
                        }`}
                      >
                        {asset.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Symbol & Display Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    สัญลักษณ์ (Ticker)
                  </label>
                  <input
                    type="text"
                    value={formSymbol}
                    disabled={Boolean(editingItem)}
                    onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                    placeholder="เช่น GOLD-THB, BTC-USD, AAPL"
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-[#1D1D1F] dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    ชื่อสินทรัพย์
                  </label>
                  <input
                    type="text"
                    value={formAssetName}
                    onChange={(e) => setFormAssetName(e.target.value)}
                    placeholder="เช่น ทองคำ 96.5% หรือ Bitcoin"
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-sm text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40"
                  />
                </div>
              </div>

              {/* Amount Invested & Purchase Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    จำนวนเงินที่ลงทุน (บาท)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={formInvestedAmount}
                    onChange={(e) => setFormInvestedAmount(e.target.value)}
                    placeholder="2000"
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    วันที่ลงทุน
                  </label>
                  <input
                    type="date"
                    value={formPurchaseDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setFormPurchaseDate(nextDate);
                      if (!editingItem && BLUEPRINT_LIMITS.DATE_PATTERN.test(nextDate)) {
                        void handleLookupPriceForForm(formSymbol, nextDate);
                      }
                    }}
                    required
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40"
                  />
                </div>
              </div>

              {/* Entry Price per Unit (THB) with Auto-Fetch Button */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                    ราคาต่อ 1 {getAssetUnitLabel(formSymbol, formAssetType)} ณ วันที่ซื้อ (บาท)
                  </label>
                  <button
                    type="button"
                    disabled={fetchingPrice}
                    onClick={() => void handleLookupPriceForForm(formSymbol, formPurchaseDate)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0071E3] dark:text-[#0A84FF] hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${fetchingPrice ? 'animate-spin' : ''}`} />
                    {fetchingPrice ? 'กำลังดึงราคา...' : 'ดึงราคาตลาดวันนั้น'}
                  </button>
                </div>
                <input
                  type="number"
                  step="any"
                  min="0.000001"
                  value={formEntryPriceThb}
                  onChange={(e) => setFormEntryPriceThb(e.target.value)}
                  placeholder="ราคาต่อหน่วยเป็นบาท"
                  required
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40"
                />
              </div>

              {/* Live Calculation Preview */}
              {formPreviewUnits > 0 && (
                <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.1] space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[#6E6E73] dark:text-[#A1A1A6]">
                    <span>จำนวนหน่วยที่ได้รับ</span>
                    <span className="font-mono-num font-semibold text-[#1D1D1F] dark:text-white">
                      {formatUnits(formPreviewUnits)} {getAssetUnitLabel(formSymbol, formAssetType)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#6E6E73] dark:text-[#A1A1A6]">
                    <span>มูลค่าประเมิน ณ ราคาตลาดวันนี้</span>
                    <span className="font-mono-num font-semibold text-[#1D1D1F] dark:text-white">
                      {formatCurrency(formPreviewCurrentVal, currency)}{' '}
                      {Math.abs(formPreviewDiff) >= 0.01 && (
                        <span
                          className={
                            formPreviewDiff >= 0
                              ? 'text-[#248A3D] dark:text-[#30D158]'
                              : 'text-[#D70015] dark:text-[#FF453A]'
                          }
                        >
                          ({formPreviewDiff >= 0 ? '+' : ''}
                          {formatCurrency(formPreviewDiff, currency)})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Optional Note */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                  หมายเหตุ (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.NOTE_MAX_LEN}
                  placeholder="เช่น ซื้อ DCA รายเดือน หรือเก็บออมระยะยาว"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.12] text-sm text-[#1D1D1F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40"
                />
              </div>

              {formError && (
                <div className="text-xs text-[#D70015] dark:text-[#FF453A] font-medium">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-full apple-glass text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : editingItem ? 'บันทึกการแก้ไข' : 'เพิ่มลงพอร์ต'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
