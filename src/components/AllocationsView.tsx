import React, { useMemo, useState } from 'react';
import { CheckCircle2, Lock, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/FinanceContext';
import { useTheme } from '../context/ThemeContext';
import {
  createAllocation,
  deleteAllocation,
  recordAllocationDisbursement,
  updateAllocation,
} from '../lib/firestoreService';
import {
  ALLOCATION_PURPOSES,
  BLUEPRINT_LIMITS,
  formatCurrency,
  getPurposeMeta,
  getTodayISO,
  PAYMENT_METHODS,
  type AllocationPurpose,
  type AllocationStatus,
  type AnnualAllocationRecord,
  type PaymentMethod,
} from '../types/finance';

export function AllocationsView() {
  const { user, currency, allocations, selectedYear, pushToast, checkAndNotifyAfterExpense } =
    useFinance();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AnnualAllocationRecord | null>(null);
  const [disburseTarget, setDisburseTarget] = useState<AnnualAllocationRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Plan form state
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<AllocationPurpose>('dorm_rent');
  const [year, setYear] = useState<number>(selectedYear);
  const [targetAnnualAmount, setTargetAnnualAmount] = useState('');
  const [monthlyPlannedAmount, setMonthlyPlannedAmount] = useState('');
  const [dueDay, setDueDay] = useState('5');
  const [status, setStatus] = useState<AllocationStatus>('active');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Disbursement modal state
  const [disburseAmount, setDisburseAmount] = useState('');
  const [disburseDate, setDisburseDate] = useState(getTodayISO());
  const [disburseMethod, setDisburseMethod] = useState<PaymentMethod>('bank_transfer');
  const [disburseNote, setDisburseNote] = useState('');

  const yearPlans = useMemo(
    () => allocations.filter((a) => a.year === selectedYear),
    [allocations, selectedYear]
  );

  const summary = useMemo(() => {
    const totalTarget = yearPlans.reduce((s, p) => s + p.targetAnnualAmount, 0);
    const totalDisbursed = yearPlans.reduce((s, p) => s + p.disbursedAmount, 0);
    const totalMonthly = yearPlans
      .filter((p) => p.status === 'active')
      .reduce((s, p) => s + p.monthlyPlannedAmount, 0);
    const remaining = Math.max(0, totalTarget - totalDisbursed);
    const progress = totalTarget > 0 ? (totalDisbursed / totalTarget) * 100 : 0;
    return { totalTarget, totalDisbursed, totalMonthly, remaining, progress };
  }, [yearPlans]);

  const chartData = useMemo(
    () =>
      yearPlans.map((p) => ({
        name: p.name.length > 16 ? `${p.name.slice(0, 16)}…` : p.name,
        planned: p.targetAnnualAmount,
        disbursed: p.disbursedAmount,
      })),
    [yearPlans]
  );

  const openCreateModal = () => {
    setEditingPlan(null);
    setName('');
    setPurpose('dorm_rent');
    setYear(selectedYear);
    setTargetAnnualAmount('');
    setMonthlyPlannedAmount('');
    setDueDay('5');
    setStatus('active');
    setNote('');
    setErrorMsg(null);
    setShowForm(true);
  };

  const openEditModal = (plan: AnnualAllocationRecord) => {
    if (plan.status === 'completed') return;
    setEditingPlan(plan);
    setName(plan.name);
    setPurpose(plan.purpose);
    setYear(plan.year);
    setTargetAnnualAmount(String(plan.targetAnnualAmount));
    setMonthlyPlannedAmount(String(plan.monthlyPlannedAmount));
    setDueDay(String(plan.dueDay));
    setStatus(plan.status);
    setNote(plan.note);
    setErrorMsg(null);
    setShowForm(true);
  };

  const openDisburseModal = (plan: AnnualAllocationRecord) => {
    if (plan.status === 'completed') return;
    const remaining = Math.max(0, plan.targetAnnualAmount - plan.disbursedAmount);
    const suggested = plan.monthlyPlannedAmount > 0 ? Math.min(plan.monthlyPlannedAmount, remaining || plan.monthlyPlannedAmount) : remaining;
    setDisburseTarget(plan);
    setDisburseAmount(suggested > 0 ? String(suggested) : '');
    setDisburseDate(getTodayISO());
    setDisburseMethod('bank_transfer');
    setDisburseNote('');
    setErrorMsg(null);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    const annual = Number(targetAnnualAmount);
    const monthly = Number(monthlyPlannedAmount || 0);
    if (!name.trim() || !annual || annual <= 0) {
      setErrorMsg('กรุณาระบุชื่อแผนและงบเบิกจ่ายรวมทั้งปีที่มากกว่า 0');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        purpose,
        year,
        targetAnnualAmount: annual,
        monthlyPlannedAmount: monthly >= 0 ? monthly : Math.round(annual / 12),
        dueDay: Number(dueDay) || 1,
        status,
        note: note.trim(),
      };
      if (editingPlan) {
        await updateAllocation(user.uid, editingPlan.id, payload);
        pushToast({ title: 'อัปเดตแผนเบิกจ่ายแล้ว', description: payload.name, tone: 'success' });
      } else {
        await createAllocation(user.uid, payload);
        pushToast({ title: 'สร้างแผนเบิกจ่ายรายปีแล้ว', description: payload.name, tone: 'success' });
      }
      setShowForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกแผนได้');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !disburseTarget) return;
    setErrorMsg(null);
    const amt = Number(disburseAmount);
    if (!amt || amt <= 0) {
      setErrorMsg('กรุณาระบุยอดเบิกจ่ายที่มากกว่า 0');
      return;
    }

    setSaving(true);
    try {
      await recordAllocationDisbursement(
        user.uid,
        disburseTarget,
        amt,
        disburseDate,
        disburseMethod,
        disburseNote
      );
      const meta = getPurposeMeta(disburseTarget.purpose);
      checkAndNotifyAfterExpense(meta.defaultCategory, amt, disburseDate.slice(0, 7));
      pushToast({
        title: 'บันทึกการเบิกจ่ายและลงสมุดบัญชีแล้ว',
        description: `${disburseTarget.name} · ${formatCurrency(amt, currency)}`,
        tone: 'success',
      });
      setDisburseTarget(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกการเบิกจ่ายได้');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: AnnualAllocationRecord) => {
    if (!user) return;
    await deleteAllocation(user.uid, plan.id);
    setConfirmDeleteId(null);
    pushToast({ title: 'ลบแผนเบิกจ่ายแล้ว', description: plan.name, tone: 'info' });
  };

  return (
    <div className="space-y-6">
      {/* Annual Summary KPI Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="apple-glass rounded-3xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            ยอดเบิกจ่ายตามแผนทั้งปี {selectedYear + 543}
          </div>
          <div className="text-2xl font-semibold font-mono-num text-slate-900 dark:text-white mt-2">
            {formatCurrency(summary.totalTarget, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            รวม {yearPlans.length} แผนเบิกจ่าย
          </div>
        </div>

        <div className="apple-glass rounded-3xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">เบิกจ่ายไปแล้วในปีนี้</div>
          <div className="text-2xl font-semibold font-mono-num text-[#0071E3] dark:text-[#2997FF] mt-2">
            {formatCurrency(summary.totalDisbursed, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
            ความคืบหน้ารวม {summary.progress.toFixed(1)}%
          </div>
        </div>

        <div className="apple-glass rounded-3xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">คงเหลือที่ต้องเตรียมจ่าย</div>
          <div className="text-2xl font-semibold font-mono-num text-slate-900 dark:text-white mt-2">
            {formatCurrency(summary.remaining, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            สำหรับช่วงที่เหลือของปี
          </div>
        </div>

        <div className="apple-glass rounded-3xl p-5 flex flex-col justify-between gap-2">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">กันเงินเฉลี่ยต่อเดือน</div>
            <div className="text-2xl font-semibold font-mono-num text-emerald-600 dark:text-emerald-400 mt-2">
              {formatCurrency(summary.totalMonthly, currency)}
            </div>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            ตั้งแผนเบิกจ่ายใหม่
          </button>
        </div>
      </section>

      {/* Annual Visual Comparison Chart */}
      {chartData.length > 0 && (
        <section className="apple-glass rounded-3xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              ภาพรวมแผนเบิกจ่ายเทียบยอดจ่ายจริง ปี {selectedYear + 543}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              เปรียบเทียบเป้าหมายทั้งปีกับยอดที่เบิกจ่ายไปแล้ว เช่น ค่าหอพัก ชำระหนี้ และกองทุนสำรอง
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)'}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: isDark ? '#9AA3B2' : '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? '#9AA3B2' : '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrency(Number(v), currency, true)}
                  width={64}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? 'rgba(20,24,33,0.92)' : 'rgba(255,255,255,0.95)',
                    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.08)',
                    borderRadius: '14px',
                    fontSize: '12px',
                    color: isDark ? '#F5F7FA' : '#0F172A',
                  }}
                  formatter={(v, key) => [
                    formatCurrency(Number(v ?? 0), currency),
                    key === 'planned' ? 'เป้าหมายทั้งปี' : 'เบิกจ่ายไปแล้ว',
                  ]}
                />
                <Bar
                  dataKey="planned"
                  fill={isDark ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.45)'}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="disbursed"
                  fill={isDark ? '#2997FF' : '#0071E3'}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Plans List */}
      <section className="apple-glass rounded-3xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              รายการแผนการเบิกจ่ายประจำปี {selectedYear + 543}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              เมื่อกดบันทึกการเบิกจ่าย ระบบจะลงรายจ่ายในสมุดบัญชีและอัปเดตความคืบหน้าให้พร้อมกัน
            </p>
          </div>
        </div>

        {yearPlans.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ยังไม่มีแผนเบิกจ่ายในปี {selectedYear + 543} เช่น แผนจ่ายค่าหอพัก หรือแผนชำระหนี้
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0062C4] text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              สร้างแผนเบิกจ่ายแรก
            </button>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
            {yearPlans.map((plan) => {
              const meta = getPurposeMeta(plan.purpose);
              const pct =
                plan.targetAnnualAmount > 0
                  ? Math.min(100, (plan.disbursedAmount / plan.targetAnnualAmount) * 100)
                  : 0;
              const remaining = Math.max(0, plan.targetAnnualAmount - plan.disbursedAmount);
              const isCompleted = plan.status === 'completed';

              return (
                <div
                  key={plan.id}
                  className="py-5 first:pt-2 last:pb-1 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {plan.name}
                      </h3>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {meta.label}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span
                        className={`text-xs font-medium inline-flex items-center gap-1 ${
                          isCompleted
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : plan.status === 'paused'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-[#0071E3] dark:text-[#2997FF]'
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ครบตามเป้าปีนี้แล้ว
                          </>
                        ) : plan.status === 'paused' ? (
                          'พักชั่วคราว'
                        ) : (
                          `ครบกำหนดทุกวันที่ ${plan.dueDay}`
                        )}
                      </span>
                    </div>

                    <div className="max-w-xl space-y-1.5">
                      <div className="h-2 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.1] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: isCompleted ? '#16A34A' : meta.color }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono-num text-slate-600 dark:text-slate-300">
                        <span>
                          เบิกจ่ายแล้ว: <strong>{formatCurrency(plan.disbursedAmount, currency)}</strong>
                        </span>
                        <span>
                          เป้าทั้งปี: <strong>{formatCurrency(plan.targetAnnualAmount, currency)}</strong>
                        </span>
                        <span>
                          คงเหลือ: <strong>{formatCurrency(remaining, currency)}</strong> ({Math.round(pct)}%)
                        </span>
                        <span>
                          แผนต่อเดือน: {formatCurrency(plan.monthlyPlannedAmount, currency)}
                        </span>
                      </div>
                    </div>

                    {plan.note && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{plan.note}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!isCompleted ? (
                      <button
                        type="button"
                        onClick={() => openDisburseModal(plan)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" />
                        บันทึกการเบิกจ่าย
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 px-2">
                        <Lock className="w-3.5 h-3.5" />
                        ปิดยอดแล้ว
                      </span>
                    )}

                    {!isCompleted && (
                      <button
                        type="button"
                        onClick={() => openEditModal(plan)}
                        aria-label={`แก้ไข ${plan.name}`}
                        className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}

                    {confirmDeleteId === plan.id ? (
                      <div className="inline-flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleDelete(plan)}
                          className="font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                        >
                          ยืนยันลบ
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-slate-500 cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(plan.id)}
                        aria-label={`ลบ ${plan.name}`}
                        className="p-2 rounded-xl text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Create / Edit Plan Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-md">
          <div className="apple-glass-strong w-full max-w-lg rounded-3xl p-6 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingPlan ? 'แก้ไขแผนเบิกจ่ายรายปี' : 'ตั้งแผนการเบิกจ่ายรายปีใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-2 rounded-xl text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  ชื่อแผนการเบิกจ่าย
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.ALLOCATION_NAME_MAX_LEN}
                  placeholder="เช่น ค่าหอพักตลอดปี, ผ่อนชำระหนี้ กยศ. / บัตรเครดิต"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    วัตถุประสงค์
                  </label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as AllocationPurpose)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  >
                    {ALLOCATION_PURPOSES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    ปีเป้าหมาย (ค.ศ.)
                  </label>
                  <input
                    type="number"
                    min={2020}
                    max={2100}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    งบเบิกจ่ายเป้าหมายทั้งปี ({currency})
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={targetAnnualAmount}
                    onChange={(e) => {
                      setTargetAnnualAmount(e.target.value);
                      if (!editingPlan && e.target.value) {
                        setMonthlyPlannedAmount(String(Math.round(Number(e.target.value) / 12)));
                      }
                    }}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    ยอดจัดสรรต่อเดือน ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={monthlyPlannedAmount}
                    onChange={(e) => setMonthlyPlannedAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    วันที่ครบกำหนดของเดือน (1-31)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                {editingPlan && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                      สถานะแผน
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as AllocationStatus)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                    >
                      <option value="active">กำลังดำเนินการ</option>
                      <option value="paused">พักชั่วคราว</option>
                      <option value="completed">ปิดยอดเสร็จสมบูรณ์ (ล็อกการแก้ไข)</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  หมายเหตุ
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.NOTE_MAX_LEN}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3] resize-none"
                />
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0062C4] disabled:opacity-60 text-white text-sm font-medium cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกแผน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disburse Installment Modal */}
      {disburseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-md">
          <div className="apple-glass-strong w-full max-w-md rounded-3xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  บันทึกการเบิกจ่าย
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {disburseTarget.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDisburseTarget(null)}
                className="p-2 rounded-xl text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordDisbursement} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  ยอดเบิกจ่ายงวดนี้ ({currency})
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={disburseAmount}
                  onChange={(e) => setDisburseAmount(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    วันที่จ่าย
                  </label>
                  <input
                    type="date"
                    value={disburseDate}
                    onChange={(e) => setDisburseDate(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    ช่องทาง
                  </label>
                  <select
                    value={disburseMethod}
                    onChange={(e) => setDisburseMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  หมายเหตุเพิ่มเติม
                </label>
                <input
                  type="text"
                  value={disburseNote}
                  onChange={(e) => setDisburseNote(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.NOTE_MAX_LEN}
                  placeholder="เช่น โอนงวดประจำเดือนเรียบร้อย"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                />
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setDisburseTarget(null)}
                  className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0062C4] disabled:opacity-60 text-white text-sm font-medium cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : 'ยืนยันการเบิกจ่าย'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
