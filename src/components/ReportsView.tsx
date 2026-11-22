import React, { useMemo } from 'react';
import { Cloud, FileSpreadsheet, HardDriveDownload, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/FinanceContext';
import { useTheme } from '../context/ThemeContext';
import {
  formatCurrency,
  getCategoryLabel,
  getPaymentMethodLabel,
  THAI_MONTHS_FULL,
  THAI_MONTHS_SHORT,
} from '../types/finance';

export function ReportsView() {
  const {
    profile,
    currency,
    transactions,
    budgets,
    allocations,
    recurring,
    investments,
    cashNetSavings,
    totalInvestmentValue,
    totalInvestmentProfit,
    netTotalSavings,
    selectedYear,
    isOnline,
    hasPendingWrites,
    pushToast,
  } = useFinance();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const monthlyTable = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, idx) => {
      const mStr = String(idx + 1).padStart(2, '0');
      const monthKey = `${selectedYear}-${mStr}`;
      return {
        monthIndex: idx,
        monthKey,
        shortLabel: THAI_MONTHS_SHORT[idx],
        fullLabel: THAI_MONTHS_FULL[idx],
        income: 0,
        expense: 0,
        net: 0,
        cumulativeNet: 0,
        savingsRate: 0,
      };
    });

    for (const tx of transactions) {
      if (!tx.monthKey.startsWith(`${selectedYear}-`)) continue;
      const idx = Number(tx.monthKey.slice(5, 7)) - 1;
      if (idx < 0 || idx > 11) continue;
      if (tx.type === 'income') rows[idx].income += tx.amount;
      else rows[idx].expense += tx.amount;
    }

    let running = 0;
    for (const row of rows) {
      row.net = row.income - row.expense;
      running += row.net;
      row.cumulativeNet = running;
      row.savingsRate = row.income > 0 ? (row.net / row.income) * 100 : 0;
    }
    return rows;
  }, [transactions, selectedYear]);

  const annualTotals = useMemo(() => {
    const income = monthlyTable.reduce((s, r) => s + r.income, 0);
    const expense = monthlyTable.reduce((s, r) => s + r.expense, 0);
    const net = income - expense;
    const activeMonths = monthlyTable.filter((r) => r.income > 0 || r.expense > 0).length || 1;
    const avgIncome = income / activeMonths;
    const avgExpense = expense / activeMonths;
    const avgNet = net / activeMonths;
    const recurringFixedMonthly = recurring
      .filter((r) => r.isActive)
      .reduce((s, r) => {
        if (r.frequency === 'weekly') return s + r.amount * 4.33;
        if (r.frequency === 'yearly') return s + r.amount / 12;
        return s + r.amount;
      }, 0);

    return {
      income,
      expense,
      net,
      activeMonths,
      avgIncome,
      avgExpense,
      avgNet,
      projected6MonthSavings: avgNet * 6,
      recurringFixedMonthly,
    };
  }, [monthlyTable, recurring]);

  const handleExportCSV = () => {
    const headers = ['วันที่', 'ประเภท', 'รายการ', 'หมวดหมู่', 'จำนวนเงิน', 'ช่องทาง', 'หมายเหตุ'];
    const lines = [headers.join(',')];
    for (const tx of transactions) {
      const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
      lines.push(
        [
          tx.date,
          tx.type === 'income' ? 'รายรับ' : 'รายจ่าย',
          escape(tx.title),
          escape(getCategoryLabel(tx.category)),
          String(tx.amount),
          escape(getPaymentMethodLabel(tx.paymentMethod)),
          escape(tx.note || ''),
        ].join(',')
      );
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `F.R.I.D.A.Y.-Ledger-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast({
      title: 'ส่งออกไฟล์ CSV เรียบร้อย',
      description: 'พร้อมเปิดใน Apple Numbers, Excel หรือบันทึกลง iCloud Drive',
      tone: 'success',
    });
  };

  const handleExportJSONBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      app: 'F.R.I.D.A.Y.',
      currency,
      profile: profile
        ? {
            displayName: profile.displayName,
            monthlyBudgetLimit: profile.monthlyBudgetLimit,
            alertThresholdPercent: profile.alertThresholdPercent,
          }
        : null,
      transactions,
      budgets,
      allocations,
      recurring,
      investments,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `F.R.I.D.A.Y.-iCloud-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast({
      title: 'สร้างไฟล์สำรอง JSON แล้ว',
      description: 'สามารถจัดเก็บไฟล์สำรองนี้ลง iCloud Drive หรือแอป Files ได้ทันที',
      tone: 'success',
    });
  };

  const globalLimit = profile?.monthlyBudgetLimit ?? 0;

  return (
    <div className="space-y-6">
      {/* Future Financial Planning & Forecast Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="apple-glass rounded-3xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">รายรับเฉลี่ยต่อเดือน</div>
          <div className="text-2xl font-semibold font-mono-num text-emerald-600 dark:text-emerald-400 mt-2">
            {formatCurrency(annualTotals.avgIncome, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            คำนวณจาก {annualTotals.activeMonths} เดือนที่มีข้อมูล
          </div>
        </div>

        <div className="apple-glass rounded-3xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">รายจ่ายเฉลี่ยต่อเดือน</div>
          <div className="text-2xl font-semibold font-mono-num text-slate-900 dark:text-white mt-2">
            {formatCurrency(annualTotals.avgExpense, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            เป็นค่าใช้จ่ายประจำราว {formatCurrency(annualTotals.recurringFixedMonthly, currency)}
          </div>
        </div>

        <div className="apple-glass rounded-3xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>คาดการณ์เงินออม 6 เดือนข้างหน้า</span>
            <TrendingUp className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF]" />
          </div>
          <div
            className={`text-2xl font-semibold font-mono-num mt-2 ${
              annualTotals.projected6MonthSavings >= 0
                ? 'text-[#0071E3] dark:text-[#2997FF]'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {annualTotals.projected6MonthSavings >= 0 ? '+' : ''}
            {formatCurrency(annualTotals.projected6MonthSavings, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            อิงจากกระแสเงินสดสุทธิเฉลี่ยปัจจุบัน
          </div>
        </div>

        <div className="apple-glass rounded-3xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">เงินออมสุทธิ</div>
          <div
            className={`text-2xl font-semibold font-mono-num mt-2 ${
              netTotalSavings >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatCurrency(netTotalSavings, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
            เงินสด {formatCurrency(cashNetSavings, currency)} · ลงทุน {formatCurrency(totalInvestmentValue, currency)}
            {investments.length > 0 && (
              <span
                className={
                  totalInvestmentProfit >= 0
                    ? ' text-[#248A3D] dark:text-[#30D158]'
                    : ' text-[#D70015] dark:text-[#FF453A]'
                }
              >
                {' '}
                ({totalInvestmentProfit >= 0 ? '+' : ''}
                {formatCurrency(totalInvestmentProfit, currency)})
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Long-Term Trend & Cumulative Cashflow Chart */}
      <section className="apple-glass rounded-3xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            แนวโน้มค่าใช้จ่ายรายเดือนและเงินออมสะสม ปี {selectedYear + 543}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ติดตามความผันผวนของรายจ่ายแต่ละเดือนควบคู่กับเส้นเงินคงเหลือสะสมทั้งปี
          </p>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyTable} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)'}
                vertical={false}
              />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 12, fill: isDark ? '#9AA3B2' : '#64748B' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: isDark ? '#9AA3B2' : '#64748B' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(Number(v), currency, true)}
                width={66}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? 'rgba(20,24,33,0.92)' : 'rgba(255,255,255,0.95)',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.08)',
                  borderRadius: '14px',
                  fontSize: '12px',
                  color: isDark ? '#F5F7FA' : '#0F172A',
                }}
                formatter={(val, name) => [
                  formatCurrency(Number(val ?? 0), currency),
                  name === 'expense'
                    ? 'รายจ่ายประจำเดือน'
                    : name === 'cumulativeNet'
                      ? 'ยอดสุทธิสะสมทั้งปี'
                      : 'รายรับประจำเดือน',
                ]}
              />
              <Bar
                dataKey="expense"
                fill={isDark ? 'rgba(41,151,255,0.65)' : 'rgba(0,113,227,0.75)'}
                radius={[6, 6, 0, 0]}
                maxBarSize={24}
              />
              <Line
                type="monotone"
                dataKey="cumulativeNet"
                stroke="#16A34A"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 12-Month Detailed Financial Report Table */}
      <section className="apple-glass rounded-3xl overflow-hidden">
        <div className="p-6 pb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ตารางสรุปรายงานการเงินรายเดือน ปี {selectedYear + 543}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              สรุปรายรับ รายจ่าย เงินคงเหลือ และสถานะเทียบเพดานงบประมาณทั้ง 12 เดือน
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-y border-black/[0.06] dark:border-white/[0.08] text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-6">เดือน</th>
                <th className="py-3 px-4 text-right">รายรับ</th>
                <th className="py-3 px-4 text-right">รายจ่าย</th>
                <th className="py-3 px-4 text-right">คงเหลือสุทธิ</th>
                <th className="py-3 px-4 text-right hidden sm:table-cell">อัตราการออม</th>
                <th className="py-3 px-6 text-right">สถานะงบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.07] text-sm">
              {monthlyTable.map((row) => {
                const hasData = row.income > 0 || row.expense > 0;
                const budgetStatus =
                  !hasData || globalLimit <= 0
                    ? '—'
                    : row.expense > globalLimit
                      ? 'เกินงบที่ตั้งไว้'
                      : row.expense >= globalLimit * ((profile?.alertThresholdPercent ?? 80) / 100)
                        ? 'ใกล้ถึงเพดาน'
                        : 'อยู่ในงบ';

                return (
                  <tr
                    key={row.monthKey}
                    className={`hover:bg-black/[0.02] dark:hover:bg-white/[0.03] ${
                      !hasData ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="py-3 px-6 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                      {row.fullLabel}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {formatCurrency(row.income, currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatCurrency(row.expense, currency)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-num font-semibold whitespace-nowrap ${
                        row.net >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {row.net >= 0 ? '+' : ''}
                      {formatCurrency(row.net, currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-xs text-slate-600 dark:text-slate-300 hidden sm:table-cell whitespace-nowrap">
                      {row.income > 0 ? `${row.savingsRate.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-3 px-6 text-right text-xs font-medium whitespace-nowrap">
                      <span
                        className={
                          budgetStatus === 'เกินงบที่ตั้งไว้'
                            ? 'text-red-600 dark:text-red-400'
                            : budgetStatus === 'ใกล้ถึงเพดาน'
                              ? 'text-amber-600 dark:text-amber-400'
                              : budgetStatus === 'อยู่ในงบ'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400'
                        }
                      >
                        {budgetStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/[0.1] dark:border-white/[0.14] font-semibold text-sm bg-black/[0.02] dark:bg-white/[0.03]">
                <td className="py-3.5 px-6 text-slate-900 dark:text-white">รวมทั้งปี {selectedYear + 543}</td>
                <td className="py-3.5 px-4 text-right font-mono-num text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(annualTotals.income, currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono-num text-slate-900 dark:text-white">
                  {formatCurrency(annualTotals.expense, currency)}
                </td>
                <td
                  className={`py-3.5 px-4 text-right font-mono-num ${
                    annualTotals.net >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {annualTotals.net >= 0 ? '+' : ''}
                  {formatCurrency(annualTotals.net, currency)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono-num text-xs hidden sm:table-cell">
                  {annualTotals.income > 0
                    ? `${((annualTotals.net / annualTotals.income) * 100).toFixed(1)}%`
                    : '—'}
                </td>
                <td className="py-3.5 px-6 text-right text-xs text-slate-500 dark:text-slate-400">
                  {transactions.filter((t) => t.monthKey.startsWith(`${selectedYear}-`)).length} รายการ
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Cross-Device Cloud Sync & iCloud Drive Backup Panel */}
      <section className="apple-glass rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Cloud className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF]" />
            <span>การซิงค์ข้อมูลข้ามอุปกรณ์และการสำรองลง iCloud Drive</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            บัญชีของคุณซิงค์แบบเรียลไทม์ผ่าน Firebase Cloud Firestore (เข้าถึงได้จาก iPhone, iPad, Mac และคอมพิวเตอร์ทุกเครื่องที่ล็อกอินบัญชี Google เดียวกัน พร้อมแคชออฟไลน์ในเครื่อง) และคุณสามารถส่งออกไฟล์ CSV / JSON เพื่อจัดเก็บสำรองลง iCloud Drive หรือเปิดใน Apple Numbers ได้ทุกเมื่อ
          </p>
          <div className="text-xs text-slate-500 dark:text-slate-400 pt-1">
            สถานะการเชื่อมต่อ:{' '}
            <strong className="text-slate-800 dark:text-slate-100">
              {!isOnline
                ? 'โหมดออฟไลน์ (จัดเก็บในแคชเครื่อง รอซิงค์เมื่อออนไลน์)'
                : hasPendingWrites
                  ? 'กำลังซิงค์ข้อมูลขึ้นคลาวด์...'
                  : 'ซิงค์เรียลไทม์ครบถ้วนแล้ว'}
            </strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full apple-glass hover:bg-white/90 dark:hover:bg-white/10 text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#248A3D] dark:text-[#30D158]" />
            ส่งออก CSV (Numbers / Excel)
          </button>
          <button
            type="button"
            onClick={handleExportJSONBackup}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            <HardDriveDownload className="w-4 h-4" />
            สำรองข้อมูลลง iCloud Drive (.json)
          </button>
        </div>
      </section>
    </div>
  );
}
