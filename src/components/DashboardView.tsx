import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import { logRecurringForMonth, seedStarterWorkspace } from '../lib/firestoreService';
import {
  formatCurrency,
  formatDateThai,
  formatMonthKeyThai,
  getCategoryColor,
  getCategoryLabel,
  getPurposeMeta,
  THAI_MONTHS_SHORT,
  type AppSection,
  type RecurringExpenseRecord,
} from '../types/finance';

interface DashboardViewProps {
  onOpenNewTx: () => void;
  onNavigate: (section: AppSection) => void;
}

export function DashboardView({ onOpenNewTx, onNavigate }: DashboardViewProps) {
  const {
    user,
    dataLoading,
    profile,
    currency,
    transactions,
    allocations,
    recurring,
    investments,
    cashNetSavings,
    totalInvestmentValue,
    totalInvestmentProfit,
    totalInvestmentProfitPct,
    netTotalSavings,
    selectedMonth,
    selectedYear,
    alerts,
    monthlyIncome,
    monthlyExpense,
    monthlyNet,
    overallBudgetPercent,
    pushToast,
    checkAndNotifyAfterExpense,
  } = useFinance();
  const { theme } = useTheme();

  const [chartType, setChartType] = useState<'area' | 'bar'>('area');
  const [loggingRecId, setLoggingRecId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const isDark = theme === 'dark';

  const yearlyChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, idx) => {
      const mStr = String(idx + 1).padStart(2, '0');
      return {
        monthKey: `${selectedYear}-${mStr}`,
        name: THAI_MONTHS_SHORT[idx],
        income: 0,
        expense: 0,
        net: 0,
      };
    });

    for (const tx of transactions) {
      if (!tx.monthKey.startsWith(`${selectedYear}-`)) continue;
      const monthIndex = Number(tx.monthKey.slice(5, 7)) - 1;
      if (monthIndex < 0 || monthIndex > 11) continue;
      if (tx.type === 'income') {
        months[monthIndex].income += tx.amount;
      } else {
        months[monthIndex].expense += tx.amount;
      }
    }

    for (const m of months) {
      m.net = m.income - m.expense;
    }

    return months;
  }, [transactions, selectedYear]);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.monthKey === selectedMonth && tx.type === 'expense') {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
      }
    }
    return Object.entries(map)
      .map(([cat, value]) => ({
        category: cat,
        name: getCategoryLabel(cat),
        value,
        color: getCategoryColor(cat),
        percent: monthlyExpense > 0 ? (value / monthlyExpense) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, selectedMonth, monthlyExpense]);

  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.monthKey === selectedMonth).slice(0, 6),
    [transactions, selectedMonth]
  );

  const dueRecurring = useMemo(
    () => recurring.filter((r) => r.isActive && r.lastLoggedMonth !== selectedMonth),
    [recurring, selectedMonth]
  );

  const yearAllocations = useMemo(
    () => allocations.filter((a) => a.year === selectedYear),
    [allocations, selectedYear]
  );

  const handleQuickLogRecurring = async (item: RecurringExpenseRecord) => {
    if (!user) return;
    setLoggingRecId(item.id);
    try {
      await logRecurringForMonth(user.uid, item, selectedMonth);
      checkAndNotifyAfterExpense(item.category, item.amount, selectedMonth);
      pushToast({
        title: 'ลงบัญชีค่าใช้จ่ายประจำแล้ว',
        description: `${item.title} · ${formatCurrency(item.amount, currency)}`,
        tone: 'success',
      });
    } finally {
      setLoggingRecId(null);
    }
  };

  const handleSeedStarter = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      await seedStarterWorkspace(user.uid);
      pushToast({
        title: 'เติมข้อมูลตัวอย่างเรียบร้อย',
        description: 'คุณสามารถแก้ไขหรือลบรายการทั้งหมดได้ทุกเมื่อ',
        tone: 'success',
      });
    } finally {
      setSeeding(false);
    }
  };

  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpense) / monthlyIncome) * 100 : 0;
  const globalLimit = profile?.monthlyBudgetLimit ?? 0;
  const threshold = profile?.alertThresholdPercent ?? 80;

  // Apple Activity-style Radial Budget Ring Math
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringClampedPct = Math.min(100, Math.max(0, overallBudgetPercent));
  const ringOffset = ringCircumference - (ringClampedPct / 100) * ringCircumference;
  const ringColor =
    overallBudgetPercent >= 100
      ? '#FF3B30'
      : overallBudgetPercent >= threshold
        ? '#FF9F0A'
        : isDark
          ? '#0A84FF'
          : '#0071E3';

  if (dataLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="apple-glass-hero rounded-[32px] p-8 h-56" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 apple-glass rounded-[28px] p-6 h-80" />
          <div className="xl:col-span-4 apple-glass rounded-[28px] p-6 h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* First-Run Onboarding Glass Sheet */}
      {transactions.length === 0 && (
        <section className="apple-glass-strong rounded-[28px] p-6 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-[17px] font-semibold text-[#1D1D1F] dark:text-white">
              ยินดีต้อนรับสู่ F.R.I.D.A.Y. — เริ่มต้นสมุดบัญชีของคุณ
            </h2>
            <p className="text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
              ยังไม่มีรายการในบัญชี คุณสามารถเพิ่มรายการแรกได้ทันที หรือเติมชุดข้อมูลตัวอย่าง (เงินเดือน ค่าหอ หนี้สิน บิลประจำ) เพื่อทดลองดูกราฟและการแจ้งเตือน
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenNewTx}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              บันทึกรายการแรก
            </button>
            <button
              type="button"
              onClick={handleSeedStarter}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full apple-glass hover:bg-white/90 dark:hover:bg-white/10 text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
              {seeding ? 'กำลังสร้างข้อมูล...' : 'ลองเติมข้อมูลตัวอย่าง'}
            </button>
          </div>
        </section>
      )}

      {/* Dominant Focal Anchor: Apple Wallet Liquid Glass Balance Stage */}
      <section className="apple-glass-hero rounded-[32px] p-7 md:p-9">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Primary Balance & Monthly Cashflow Telemetry */}
          <div className="lg:col-span-8 space-y-6">
            <div className="space-y-2">
              <div className="text-[13px] font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                เงินออมสุทธิรวม · {formatMonthKeyThai(selectedMonth)}
              </div>
              <div className="text-[40px] sm:text-[52px] font-semibold font-mono-num tracking-[-0.038em] leading-none text-[#1D1D1F] dark:text-white">
                {formatCurrency(netTotalSavings, currency)}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6E6E73] dark:text-[#A1A1A6] font-mono-num pt-1">
                <span>เงินสดสะสม {formatCurrency(cashNetSavings, currency)}</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onNavigate('investments')}
                  className="inline-flex items-center gap-1 hover:underline cursor-pointer text-left"
                >
                  <span>
                    พอร์ตลงทุน {formatCurrency(totalInvestmentValue, currency)}
                  </span>
                  {investments.length > 0 ? (
                    <span
                      className={`font-medium ${
                        totalInvestmentProfit >= 0
                          ? 'text-[#248A3D] dark:text-[#30D158]'
                          : 'text-[#D70015] dark:text-[#FF453A]'
                      }`}
                    >
                      ({totalInvestmentProfit >= 0 ? '+' : ''}
                      {totalInvestmentProfitPct.toFixed(1)}%)
                    </span>
                  ) : (
                    <span className="text-[#0071E3] dark:text-[#0A84FF] font-sans font-medium">
                      เพิ่มทอง · คริปโท · หุ้น
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
                </button>
              </div>
            </div>

            {/* Clean Hairline-Separated Cashflow Row (No nested cards!) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-6 border-t border-black/[0.06] dark:border-white/[0.1]">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#248A3D] dark:text-[#30D158]" />
                  <span>รายรับเดือนนี้</span>
                </div>
                <div className="text-xl font-semibold font-mono-num text-[#248A3D] dark:text-[#30D158]">
                  {formatCurrency(monthlyIncome, currency)}
                </div>
              </div>

              <div className="space-y-1 sm:pl-5 sm:border-l sm:border-black/[0.06] dark:sm:border-white/[0.1]">
                <div className="flex items-center gap-1.5 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  <ArrowDownRight className="w-3.5 h-3.5 text-[#D70015] dark:text-[#FF453A]" />
                  <span>รายจ่ายเดือนนี้</span>
                </div>
                <div className="text-xl font-semibold font-mono-num text-[#1D1D1F] dark:text-white">
                  {formatCurrency(monthlyExpense, currency)}
                </div>
              </div>

              <div className="space-y-1 sm:pl-5 sm:border-l sm:border-black/[0.06] dark:sm:border-white/[0.1]">
                <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  กระแสเงินสดสุทธิ · ออม {monthlyIncome > 0 ? `${savingsRate.toFixed(0)}%` : '0%'}
                </div>
                <div
                  className={`text-xl font-semibold font-mono-num ${
                    monthlyNet >= 0
                      ? 'text-[#0071E3] dark:text-[#0A84FF]'
                      : 'text-[#D70015] dark:text-[#FF453A]'
                  }`}
                >
                  {monthlyNet >= 0 ? '+' : ''}
                  {formatCurrency(monthlyNet, currency)}
                </div>
              </div>
            </div>
          </div>

          {/* Right Apple-Style Radial Budget Ceiling Gauge */}
          <div className="lg:col-span-4 lg:pl-8 lg:border-l lg:border-black/[0.06] dark:lg:border-white/[0.1] flex items-center gap-5">
            <div className="relative w-28 h-28 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112" aria-hidden="true">
                <circle
                  cx="56"
                  cy="56"
                  r={ringRadius}
                  fill="none"
                  stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.07)'}
                  strokeWidth="9"
                />
                <circle
                  cx="56"
                  cy="56"
                  r={ringRadius}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={globalLimit > 0 ? ringOffset : ringCircumference}
                  style={{ transition: 'stroke-dashoffset 450ms cubic-bezier(0.22, 1, 0.36, 1)' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold font-mono-num text-[#1D1D1F] dark:text-white">
                  {globalLimit > 0 ? `${Math.round(overallBudgetPercent)}%` : '—'}
                </span>
                <span className="text-[10px] text-[#86868B]">ของงบเดือน</span>
              </div>
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6]">
                เพดานงบประจำเดือน
              </div>
              <div className="text-lg font-semibold font-mono-num text-[#1D1D1F] dark:text-white">
                {globalLimit > 0 ? formatCurrency(globalLimit, currency) : 'ยังไม่ตั้งงบ'}
              </div>
              <div
                className={`text-xs font-medium ${
                  overallBudgetPercent >= 100
                    ? 'text-[#D70015] dark:text-[#FF453A]'
                    : overallBudgetPercent >= threshold
                      ? 'text-[#B25000] dark:text-[#FF9F0A]'
                      : 'text-[#248A3D] dark:text-[#30D158]'
                }`}
              >
                {globalLimit <= 0
                  ? 'แตะเพื่อตั้งเพดานแจ้งเตือน'
                  : overallBudgetPercent >= 100
                    ? `เกินงบ ${formatCurrency(monthlyExpense - globalLimit, currency)}`
                    : overallBudgetPercent >= threshold
                      ? `ใกล้ถึงเพดาน · เหลือ ${formatCurrency(globalLimit - monthlyExpense, currency)}`
                      : `คงเหลือ ${formatCurrency(globalLimit - monthlyExpense, currency)}`}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('budgets')}
                className="inline-flex items-center gap-0.5 text-xs font-medium text-[#0071E3] dark:text-[#0A84FF] hover:underline cursor-pointer pt-0.5"
              >
                ตั้งค่างบและเตือน
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Active Budget Ceiling Alerts Strip (Rendered cleanly only when alerts exist) */}
      {alerts.length > 0 && (
        <section className="apple-glass rounded-[26px] p-5 md:px-6 space-y-3" aria-label="การแจ้งเตือนงบประมาณ">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={`w-4 h-4 ${
                  alerts.some((a) => a.severity === 'exceeded')
                    ? 'text-[#D70015] dark:text-[#FF453A]'
                    : 'text-[#B25000] dark:text-[#FF9F0A]'
                }`}
              />
              <h2 className="text-sm font-semibold text-[#1D1D1F] dark:text-white">
                การแจ้งเตือนเพดานงบประมาณ · {formatMonthKeyThai(selectedMonth)}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('budgets')}
              className="text-xs font-medium text-[#0071E3] dark:text-[#0A84FF] hover:underline cursor-pointer whitespace-nowrap"
            >
              ปรับเกณฑ์แจ้งเตือน
            </button>
          </div>

          <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="py-2.5 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#1D1D1F] dark:text-white">{alert.label}</span>
                  <span aria-hidden="true" className="text-[#86868B]">·</span>
                  <span
                    className={`text-xs font-medium ${
                      alert.severity === 'exceeded'
                        ? 'text-[#D70015] dark:text-[#FF453A]'
                        : 'text-[#B25000] dark:text-[#FF9F0A]'
                    }`}
                  >
                    {alert.severity === 'exceeded'
                      ? `เกินงบที่ตั้งไว้ (${Math.round(alert.percent)}%)`
                      : `ใกล้ถึงเพดาน (${Math.round(alert.percent)}% / เกณฑ์ ${alert.threshold}%)`}
                  </span>
                </div>
                <div className="font-mono-num text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
                  {formatCurrency(alert.spent, currency)} / {formatCurrency(alert.limit, currency)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Analytics Row: Apple Stocks-Style 12-Month Trend + Category Breakdown */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-8 apple-glass rounded-[28px] p-6 md:p-7 flex flex-col justify-between gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-semibold text-[#1D1D1F] dark:text-white">
                สรุปยอดรายรับ-รายจ่ายรายเดือน ปี {selectedYear + 543}
              </h2>
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                อัปเดตแบบเรียลไทม์ เห็นแนวโน้มรายจ่ายตลอดทั้งปีอย่างแม่นยำ
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
              <button
                type="button"
                onClick={() => setChartType('area')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
                  chartType === 'area'
                    ? 'bg-white dark:bg-white/20 text-[#1D1D1F] dark:text-white shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                เส้นแนวโน้ม
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
                  chartType === 'bar'
                    ? 'bg-white dark:bg-white/20 text-[#1D1D1F] dark:text-white shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                แท่งเปรียบเทียบ
              </button>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={yearlyChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="aureoIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isDark ? '#30D158' : '#248A3D'} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={isDark ? '#30D158' : '#248A3D'} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="aureoExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isDark ? '#0A84FF' : '#0071E3'} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={isDark ? '#0A84FF' : '#0071E3'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 4"
                    stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)'}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: isDark ? '#A1A1A6' : '#6E6E73' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: isDark ? '#A1A1A6' : '#6E6E73' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCurrency(Number(v), currency, true)}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.94)',
                      border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(15,23,42,0.08)',
                      borderRadius: '16px',
                      fontSize: '12px',
                      backdropFilter: 'blur(20px)',
                      color: isDark ? '#F5F5F7' : '#1D1D1F',
                    }}
                    formatter={(value, name) => [
                      formatCurrency(Number(value ?? 0), currency),
                      name === 'income' ? 'รายรับ' : 'รายจ่าย',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke={isDark ? '#30D158' : '#248A3D'}
                    strokeWidth={2.4}
                    fill="url(#aureoIncomeGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke={isDark ? '#0A84FF' : '#0071E3'}
                    strokeWidth={2.4}
                    fill="url(#aureoExpenseGrad)"
                  />
                </AreaChart>
              ) : (
                <BarChart data={yearlyChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 4"
                    stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)'}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: isDark ? '#A1A1A6' : '#6E6E73' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: isDark ? '#A1A1A6' : '#6E6E73' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCurrency(Number(v), currency, true)}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.94)',
                      border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(15,23,42,0.08)',
                      borderRadius: '16px',
                      fontSize: '12px',
                      color: isDark ? '#F5F5F7' : '#1D1D1F',
                    }}
                    formatter={(value, name) => [
                      formatCurrency(Number(value ?? 0), currency),
                      name === 'income' ? 'รายรับ' : 'รายจ่าย',
                    ]}
                  />
                  <Bar
                    dataKey="income"
                    fill={isDark ? '#30D158' : '#248A3D'}
                    radius={[7, 7, 0, 0]}
                    maxBarSize={20}
                  />
                  <Bar
                    dataKey="expense"
                    fill={isDark ? '#0A84FF' : '#0071E3'}
                    radius={[7, 7, 0, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-6 text-xs text-[#6E6E73] dark:text-[#A1A1A6] pt-2 border-t border-black/[0.05] dark:border-white/[0.08]">
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#248A3D] dark:bg-[#30D158]" />
              รายรับรวมรายเดือน
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3] dark:bg-[#0A84FF]" />
              รายจ่ายรวมรายเดือน
            </span>
          </div>
        </div>

        {/* Category Breakdown Donut */}
        <div className="xl:col-span-4 apple-glass rounded-[28px] p-6 md:p-7 flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold text-[#1D1D1F] dark:text-white">
              สัดส่วนรายจ่ายตามหมวดหมู่
            </h2>
            <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
              ประจำเดือน {formatMonthKeyThai(selectedMonth)}
            </p>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
              <p>ยังไม่มีรายจ่ายในเดือนนี้</p>
              <button
                type="button"
                onClick={onOpenNewTx}
                className="mt-3 text-xs font-medium text-[#0071E3] dark:text-[#0A84FF] hover:underline cursor-pointer"
              >
                เพิ่มรายการรายจ่ายแรก
              </button>
            </div>
          ) : (
            <>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={78}
                      paddingAngle={3}
                      cornerRadius={5}
                      stroke="none"
                    >
                      {categoryBreakdown.map((entry) => (
                        <Cell key={entry.category} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.94)',
                        border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(15,23,42,0.08)',
                        borderRadius: '14px',
                        fontSize: '12px',
                        color: isDark ? '#F5F5F7' : '#1D1D1F',
                      }}
                      formatter={(val) => [formatCurrency(Number(val ?? 0), currency), 'ยอดใช้จ่าย']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="divide-y divide-black/[0.05] dark:divide-white/[0.08]">
                {categoryBreakdown.slice(0, 5).map((item) => (
                  <div key={item.category} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate text-[#1D1D1F] dark:text-[#F5F5F7]">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 font-mono-num">
                      <span className="text-[#86868B]">{item.percent.toFixed(0)}%</span>
                      <span className="font-medium text-[#1D1D1F] dark:text-white">
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

      {/* Bottom Operational Row: Recurring Due + Annual Disbursements + Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 apple-glass rounded-[28px] p-6 md:p-7 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold text-[#1D1D1F] dark:text-white">
                ค่าใช้จ่ายประจำที่รอลงบัญชี
              </h2>
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                รอบเดือน {formatMonthKeyThai(selectedMonth)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('recurring')}
              className="text-xs font-medium text-[#0071E3] dark:text-[#0A84FF] hover:underline cursor-pointer whitespace-nowrap"
            >
              จัดการทั้งหมด
            </button>
          </div>

          {dueRecurring.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 mx-auto text-[#248A3D] dark:text-[#30D158]" />
              <p className="text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
                {recurring.length === 0
                  ? 'ยังไม่ได้ตั้งค่ารายการค่าใช้จ่ายประจำ'
                  : 'ลงบัญชีค่าใช้จ่ายประจำครบทุกรายการแล้วในเดือนนี้'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {dueRecurring.slice(0, 5).map((item) => (
                <div key={item.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#1D1D1F] dark:text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                      ทุกวันที่ {item.dueDay} · {getCategoryLabel(item.category)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold font-mono-num text-[#1D1D1F] dark:text-white">
                      {formatCurrency(item.amount, currency)}
                    </span>
                    <button
                      type="button"
                      disabled={loggingRecId === item.id}
                      onClick={() => handleQuickLogRecurring(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <CalendarCheck2 className="w-3.5 h-3.5" />
                      {loggingRecId === item.id ? 'กำลังบันทึก' : 'ลงบัญชี'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 apple-glass rounded-[28px] p-6 md:p-7 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-[#1D1D1F] dark:text-white">
                  แผนเบิกจ่ายรายปี {selectedYear + 543}
                </h2>
                <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                  ค่าหอพัก การชำระหนี้ และเงินสำรองตลอดปี
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('allocations')}
                className="text-xs font-medium text-[#0071E3] dark:text-[#0A84FF] hover:underline cursor-pointer whitespace-nowrap"
              >
                ดูแผนทั้งหมด
              </button>
            </div>

            {yearAllocations.length === 0 ? (
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] py-3">
                ยังไม่มีแผนเบิกจ่ายในปี {selectedYear + 543}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {yearAllocations.slice(0, 4).map((plan) => {
                  const pct =
                    plan.targetAnnualAmount > 0
                      ? Math.min(100, (plan.disbursedAmount / plan.targetAnnualAmount) * 100)
                      : 0;
                  const meta = getPurposeMeta(plan.purpose);
                  return (
                    <div
                      key={plan.id}
                      className="pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[#1D1D1F] dark:text-white truncate">
                          {plan.name}
                        </span>
                        <span className="text-xs font-mono-num text-[#6E6E73] dark:text-[#A1A1A6] shrink-0">
                          {Math.round(pct)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.12] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: meta.color }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#6E6E73] dark:text-[#A1A1A6] font-mono-num">
                        <span>จ่ายแล้ว {formatCurrency(plan.disbursedAmount, currency)}</span>
                        <span>เป้า {formatCurrency(plan.targetAnnualAmount, currency)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-5 border-t border-black/[0.06] dark:border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#1D1D1F] dark:text-white">
                รายการเคลื่อนไหวล่าสุด · {formatMonthKeyThai(selectedMonth)}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('ledger')}
                className="text-xs font-medium text-[#0071E3] dark:text-[#0A84FF] hover:underline cursor-pointer whitespace-nowrap"
              >
                ดูสมุดบัญชีทั้งหมด
              </button>
            </div>

            {monthTransactions.length === 0 ? (
              <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] py-3">
                ยังไม่มีรายการในเดือนนี้
              </p>
            ) : (
              <div className="divide-y divide-black/[0.05] dark:divide-white/[0.08]">
                {monthTransactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-[#1D1D1F] dark:text-white truncate">
                        {tx.title}
                      </div>
                      <div className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] mt-0.5">
                        {formatDateThai(tx.date)} · {getCategoryLabel(tx.category)}
                      </div>
                    </div>
                    <span
                      className={`font-mono-num font-semibold shrink-0 ${
                        tx.type === 'income'
                          ? 'text-[#248A3D] dark:text-[#30D158]'
                          : 'text-[#1D1D1F] dark:text-[#F5F5F7]'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {formatCurrency(tx.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
