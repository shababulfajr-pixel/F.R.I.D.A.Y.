import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Plus, Save, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  deleteCategoryBudget,
  updateUserBudgetSettings,
  upsertCategoryBudget,
} from '../lib/firestoreService';
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  formatCurrency,
  formatMonthKeyThai,
  getCategoryLabel,
  type CurrencyCode,
  type ExpenseCategory,
} from '../types/finance';

export function BudgetsView() {
  const {
    user,
    profile,
    currency,
    budgets,
    transactions,
    selectedMonth,
    monthlyExpense,
    pushToast,
  } = useFinance();

  const [globalLimit, setGlobalLimit] = useState(String(profile?.monthlyBudgetLimit ?? 25000));
  const [thresholdPct, setThresholdPct] = useState(profile?.alertThresholdPercent ?? 80);
  const [notifEnabled, setNotifEnabled] = useState(Boolean(profile?.notificationsEnabled));
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(profile?.currency || 'THB');
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Add / update category budget state
  const [catKey, setCatKey] = useState<ExpenseCategory>('food');
  const [catLimit, setCatLimit] = useState('');
  const [catThreshold, setCatThreshold] = useState('80');
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setGlobalLimit(String(profile.monthlyBudgetLimit));
    setThresholdPct(profile.alertThresholdPercent);
    setNotifEnabled(profile.notificationsEnabled);
    setSelectedCurrency(profile.currency);
  }, [profile]);

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.monthKey === selectedMonth && tx.type === 'expense') {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
      }
    }
    return map;
  }, [transactions, selectedMonth]);

  const handleToggleBrowserNotification = async () => {
    const next = !notifEnabled;
    if (next && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          pushToast({
            title: 'เบราว์เซอร์ยังไม่อนุญาตการแจ้งเตือน',
            description: 'คุณยังจะได้รับการแจ้งเตือนภายในแอปแบบเรียลไทม์ตามปกติ',
            tone: 'warning',
          });
          setNotifEnabled(false);
          return;
        }
      } else if (Notification.permission === 'denied') {
        pushToast({
          title: 'การแจ้งเตือนถูกปิดไว้ในเบราว์เซอร์',
          description: 'สามารถเปิดสิทธิ์ได้ในการตั้งค่าเว็บไซต์ของเบราว์เซอร์',
          tone: 'warning',
        });
        setNotifEnabled(false);
        return;
      }
    }
    setNotifEnabled(next);
  };

  const handleSaveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setSavingGlobal(true);
    try {
      await updateUserBudgetSettings(user.uid, {
        monthlyBudgetLimit: Number(globalLimit) || 0,
        alertThresholdPercent: thresholdPct,
        notificationsEnabled: notifEnabled,
        currency: selectedCurrency,
        displayName: profile.displayName,
      });
      pushToast({
        title: 'บันทึกการตั้งค่างบประมาณแล้ว',
        description: `เพดานรายเดือน ${formatCurrency(Number(globalLimit) || 0, selectedCurrency)} · เตือนที่ ${thresholdPct}%`,
        tone: 'success',
      });
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSaveCategoryBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const limitNum = Number(catLimit);
    if (!limitNum || limitNum <= 0) return;
    setSavingCat(true);
    try {
      const existing = budgets.find((b) => b.category === catKey);
      await upsertCategoryBudget(
        user.uid,
        catKey,
        limitNum,
        Number(catThreshold) || 80,
        existing?.id
      );
      setCatLimit('');
      pushToast({
        title: existing ? 'อัปเดตงบหมวดหมู่แล้ว' : 'เพิ่มเพดานงบหมวดหมู่แล้ว',
        description: `${getCategoryLabel(catKey)} · ${formatCurrency(limitNum, currency)}`,
        tone: 'success',
      });
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCatBudget = async (id: string, category: string) => {
    if (!user) return;
    await deleteCategoryBudget(user.uid, id);
    pushToast({
      title: 'ลบเพดานงบหมวดหมู่แล้ว',
      description: getCategoryLabel(category),
      tone: 'info',
    });
  };

  const currentGlobalLimitNum = Number(globalLimit) || 0;
  const globalPct = currentGlobalLimitNum > 0 ? (monthlyExpense / currentGlobalLimitNum) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Global Monthly Budget Ceiling & Notification Settings */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <form
          onSubmit={handleSaveGlobal}
          className="lg:col-span-7 apple-glass rounded-3xl p-6 space-y-5"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              เพดานงบประมาณรายเดือนและการแจ้งเตือน
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ระบบจะแจ้งเตือนทันทีเมื่อยอดใช้จ่ายใกล้ถึงเพดานที่กำหนดและเมื่อใช้จ่ายเกินงบ
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                เพดานรายจ่ายรวมต่อเดือน ({selectedCurrency})
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={globalLimit}
                onChange={(e) => setGlobalLimit(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                สกุลเงินหลัก
              </label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="threshold-slider" className="font-medium text-slate-600 dark:text-slate-300">
                แจ้งเตือนล่วงหน้าเมื่อใช้จ่ายถึงสัดส่วน
              </label>
              <span className="font-mono-num font-semibold text-[#0071E3] dark:text-[#2997FF]">
                {thresholdPct}% ของงบประมาณ
              </span>
            </div>
            <input
              id="threshold-slider"
              type="range"
              min={50}
              max={100}
              step={5}
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value))}
              className="w-full accent-[#0071E3] cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono-num text-slate-400">
              <span>50%</span>
              <span>75%</span>
              <span>80% (แนะนำ)</span>
              <span>100%</span>
            </div>
          </div>

          <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <Bell className="w-4 h-4 text-[#0071E3] dark:text-[#2997FF] mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                  การแจ้งเตือนผ่านเบราว์เซอร์
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ส่งการแจ้งเตือนแบบพุชเพิ่มเติมเมื่อบันทึกรายจ่ายที่ใกล้เต็มหรือเกินเพดาน
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifEnabled}
              onClick={handleToggleBrowserNotification}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                notifEnabled ? 'bg-[#0071E3]' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingGlobal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              {savingGlobal ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่างบประมาณ'}
            </button>
          </div>
        </form>

        {/* Live Overall Ceiling Gauge */}
        <div className="lg:col-span-5 apple-glass rounded-3xl p-6 flex flex-col justify-between gap-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ภาพรวมการใช้งบ · {formatMonthKeyThai(selectedMonth)}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              คำนวณแบบเรียลไทม์จากทุกรายจ่ายที่บันทึกในเดือนที่เลือก
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold font-mono-num text-slate-900 dark:text-white">
                {formatCurrency(monthlyExpense, currency)}
              </span>
              <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                / {formatCurrency(currentGlobalLimitNum, currency)}
              </span>
            </div>

            <div className="h-3 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.1] overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  globalPct >= 100
                    ? 'bg-red-500'
                    : globalPct >= thresholdPct
                      ? 'bg-amber-500'
                      : 'bg-[#0071E3] dark:bg-[#2997FF]'
                }`}
                style={{ width: `${Math.min(100, globalPct)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span
                className={`inline-flex items-center gap-1.5 font-medium ${
                  globalPct >= 100
                    ? 'text-red-600 dark:text-red-400'
                    : globalPct >= thresholdPct
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {globalPct >= 100 ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    เกินงบประมาณที่ตั้งไว้
                  </>
                ) : globalPct >= thresholdPct ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    ใกล้ถึงเพดานงบ ({Math.round(globalPct)}%)
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    อยู่ในเกณฑ์ปกติ ({Math.round(globalPct)}%)
                  </>
                )}
              </span>
              <span className="font-mono-num text-slate-500 dark:text-slate-400">
                เกณฑ์เตือน {thresholdPct}%
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>งบคงเหลือเดือนนี้</span>
            <span className="font-mono-num font-semibold text-slate-900 dark:text-white">
              {formatCurrency(Math.max(0, currentGlobalLimitNum - monthlyExpense), currency)}
            </span>
          </div>
        </div>
      </section>

      {/* Per-Category Budget Ceilings */}
      <section className="apple-glass rounded-3xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              งบประมาณรายหมวดหมู่
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ตั้งเพดานแยกเฉพาะหมวด เช่น ค่าอาหาร ช้อปปิ้ง หรือค่าเดินทาง เพื่อคุมค่าใช้จ่ายได้อย่างละเอียด
            </p>
          </div>

          <form
            onSubmit={handleSaveCategoryBudget}
            className="flex flex-wrap items-center gap-2.5"
          >
            <select
              value={catKey}
              onChange={(e) => setCatKey(e.target.value as ExpenseCategory)}
              aria-label="เลือกหมวดหมู่รายจ่าย"
              className="px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.12] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              step="100"
              value={catLimit}
              onChange={(e) => setCatLimit(e.target.value)}
              placeholder={`งบ/เดือน (${currency})`}
              required
              className="w-36 px-3 py-2 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-xs font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            />

            <input
              type="number"
              min="50"
              max="100"
              value={catThreshold}
              onChange={(e) => setCatThreshold(e.target.value)}
              title="เปอร์เซ็นต์แจ้งเตือนล่วงหน้า"
              className="w-20 px-3 py-2 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-xs font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            />

            <button
              type="submit"
              disabled={savingCat}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-60 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {budgets.some((b) => b.category === catKey) ? 'อัปเดตหมวดนี้' : 'เพิ่มเพดาน'}
            </button>
          </form>
        </div>

        {budgets.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            ยังไม่มีเพดานงบแยกตามหมวดหมู่ เลือกหมวดหมู่ด้านบนเพื่อเริ่มต้นตั้งค่า
          </p>
        ) : (
          <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
            {budgets.map((b) => {
              const spent = expenseByCategory[b.category] || 0;
              const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
              const isOver = pct >= 100;
              const isNear = !isOver && pct >= b.warningThreshold;

              return (
                <div key={b.id} className="py-4 first:pt-1 last:pb-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {getCategoryLabel(b.category)}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span
                        className={`text-xs font-medium ${
                          isOver
                            ? 'text-red-600 dark:text-red-400'
                            : isNear
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isOver
                          ? `เกินงบแล้ว (${Math.round(pct)}%)`
                          : isNear
                            ? `ใกล้ถึงเพดาน (${Math.round(pct)}%)`
                            : `ปกติ (${Math.round(pct)}%)`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono-num text-slate-600 dark:text-slate-300">
                        {formatCurrency(spent, currency)} / {formatCurrency(b.monthlyLimit, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCatBudget(b.id, b.category)}
                        aria-label={`ลบเพดานงบ ${getCategoryLabel(b.category)}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.1] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOver
                          ? 'bg-red-500'
                          : isNear
                            ? 'bg-amber-500'
                            : 'bg-[#0071E3] dark:bg-[#2997FF]'
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
