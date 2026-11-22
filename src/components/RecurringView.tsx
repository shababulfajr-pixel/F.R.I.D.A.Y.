import React, { useMemo, useState } from 'react';
import {
  CalendarCheck2,
  CheckCircle2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  createRecurringExpense,
  deleteRecurringExpense,
  logRecurringForMonth,
  toggleRecurringActive,
  updateRecurringExpense,
} from '../lib/firestoreService';
import {
  BLUEPRINT_LIMITS,
  EXPENSE_CATEGORIES,
  formatCurrency,
  formatMonthKeyThai,
  FREQUENCIES,
  getCategoryLabel,
  getFrequencyLabel,
  getPaymentMethodLabel,
  PAYMENT_METHODS,
  type ExpenseCategory,
  type PaymentMethod,
  type RecurringExpenseRecord,
  type RecurringFrequency,
} from '../types/finance';

export function RecurringView() {
  const { user, currency, recurring, selectedMonth, pushToast, checkAndNotifyAfterExpense } =
    useFinance();

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringExpenseRecord | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [bulkLogging, setBulkLogging] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('housing');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dueDay, setDueDay] = useState('5');
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stats = useMemo(() => {
    const activeItems = recurring.filter((r) => r.isActive);
    const monthlyEquivalent = activeItems.reduce((sum, r) => {
      if (r.frequency === 'weekly') return sum + r.amount * 4.33;
      if (r.frequency === 'yearly') return sum + r.amount / 12;
      return sum + r.amount;
    }, 0);
    const pendingItems = activeItems.filter((r) => r.lastLoggedMonth !== selectedMonth);
    const loggedCount = activeItems.length - pendingItems.length;
    return { activeItems, monthlyEquivalent, pendingItems, loggedCount };
  }, [recurring, selectedMonth]);

  const openCreate = () => {
    setEditingItem(null);
    setTitle('');
    setAmount('');
    setCategory('housing');
    setPaymentMethod('bank_transfer');
    setFrequency('monthly');
    setDueDay('5');
    setIsActive(true);
    setNote('');
    setErrorMsg(null);
    setShowForm(true);
  };

  const openEdit = (item: RecurringExpenseRecord) => {
    setEditingItem(item);
    setTitle(item.title);
    setAmount(String(item.amount));
    setCategory(item.category);
    setPaymentMethod(item.paymentMethod);
    setFrequency(item.frequency);
    setDueDay(String(item.dueDay));
    setIsActive(item.isActive);
    setNote(item.note);
    setErrorMsg(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    const amt = Number(amount);
    if (!title.trim() || !amt || amt <= 0) {
      setErrorMsg('กรุณาระบุชื่อรายการและจำนวนเงินที่มากกว่า 0');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        amount: amt,
        category,
        paymentMethod,
        frequency,
        dueDay: Number(dueDay) || 1,
        isActive,
        note: note.trim(),
      };
      if (editingItem) {
        await updateRecurringExpense(user.uid, editingItem.id, payload);
        pushToast({ title: 'อัปเดตค่าใช้จ่ายประจำแล้ว', description: payload.title, tone: 'success' });
      } else {
        await createRecurringExpense(user.uid, payload);
        pushToast({ title: 'บันทึกค่าใช้จ่ายประจำใหม่แล้ว', description: payload.title, tone: 'success' });
      }
      setShowForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setSaving(false);
    }
  };

  const handleLogSingle = async (item: RecurringExpenseRecord) => {
    if (!user) return;
    setLoggingId(item.id);
    try {
      await logRecurringForMonth(user.uid, item, selectedMonth);
      checkAndNotifyAfterExpense(item.category, item.amount, selectedMonth);
      pushToast({
        title: 'ลงบัญชีประจำเดือนเรียบร้อย',
        description: `${item.title} · ${formatCurrency(item.amount, currency)}`,
        tone: 'success',
      });
    } finally {
      setLoggingId(null);
    }
  };

  const handleBulkLog = async () => {
    if (!user || stats.pendingItems.length === 0) return;
    setBulkLogging(true);
    try {
      let totalAdded = 0;
      for (const item of stats.pendingItems) {
        await logRecurringForMonth(user.uid, item, selectedMonth);
        totalAdded += item.amount;
      }
      checkAndNotifyAfterExpense('other_expense', totalAdded, selectedMonth);
      pushToast({
        title: `ลงบัญชีครบ ${stats.pendingItems.length} รายการแล้ว`,
        description: `รวม ${formatCurrency(totalAdded, currency)} สำหรับ ${formatMonthKeyThai(selectedMonth)}`,
        tone: 'success',
      });
    } finally {
      setBulkLogging(false);
    }
  };

  const handleToggle = async (item: RecurringExpenseRecord) => {
    if (!user) return;
    await toggleRecurringActive(user.uid, item.id, !item.isActive);
  };

  const handleDelete = async (item: RecurringExpenseRecord) => {
    if (!user) return;
    await deleteRecurringExpense(user.uid, item.id);
    setConfirmDeleteId(null);
    pushToast({ title: 'ลบรายการประจำแล้ว', description: item.title, tone: 'info' });
  };

  return (
    <div className="space-y-6">
      {/* Top Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="apple-glass rounded-3xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            ภาระค่าใช้จ่ายประจำเฉลี่ยต่อเดือน
          </div>
          <div className="text-2xl font-semibold font-mono-num text-slate-900 dark:text-white mt-2">
            {formatCurrency(stats.monthlyEquivalent, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            จาก {stats.activeItems.length} รายการที่เปิดใช้งาน
          </div>
        </div>

        <div className="apple-glass rounded-3xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            สถานะรอบเดือน {formatMonthKeyThai(selectedMonth)}
          </div>
          <div className="text-2xl font-semibold font-mono-num text-slate-900 dark:text-white mt-2">
            {stats.loggedCount} / {stats.activeItems.length} รายการ
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {stats.pendingItems.length > 0
              ? `รอลงบัญชีอีก ${stats.pendingItems.length} รายการ`
              : 'ลงบัญชีครบทุกรายการแล้ว'}
          </div>
        </div>

        <div className="apple-glass rounded-3xl p-5 flex flex-col justify-center gap-2.5">
          <button
            type="button"
            onClick={openCreate}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            เพิ่มค่าใช้จ่ายประจำ
          </button>
          {stats.pendingItems.length > 0 && (
            <button
              type="button"
              disabled={bulkLogging}
              onClick={handleBulkLog}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full apple-glass hover:bg-white/90 dark:hover:bg-white/10 text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] transition-colors cursor-pointer whitespace-nowrap"
            >
              <CalendarCheck2 className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
              {bulkLogging
                ? 'กำลังลงบัญชีทั้งหมด...'
                : `ลงบัญชีค้างทั้งหมด (${stats.pendingItems.length})`}
            </button>
          )}
        </div>
      </section>

      {/* Recurring Items List */}
      <section className="apple-glass rounded-3xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            รายการค่าใช้จ่ายประจำที่จดจำไว้
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ระบบจะจดจำยอดและวันครบกำหนดทุกเดือน ให้คุณกดลงสมุดบัญชีได้ในคลิกเดียวโดยไม่ซ้ำซ้อน
          </p>
        </div>

        {recurring.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ยังไม่มีรายการค่าใช้จ่ายประจำ เช่น ค่าหอ ค่าอินเทอร์เน็ต iCloud+ หรือผ่อนชำระรายเดือน
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0062C4] text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่มรายการประจำแรก
            </button>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
            {recurring.map((item) => {
              const isLoggedThisMonth = item.lastLoggedMonth === selectedMonth;
              return (
                <div
                  key={item.id}
                  className={`py-4 first:pt-1 last:pb-1 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    !item.isActive ? 'opacity-60' : ''
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {getCategoryLabel(item.category)}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {getFrequencyLabel(item.frequency)} (ทุกวันที่ {item.dueDay})
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                      <span>{getPaymentMethodLabel(item.paymentMethod)}</span>
                      {item.note && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{item.note}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          isLoggedThisMonth
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : item.isActive
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : 'text-slate-400'
                        }
                      >
                        {!item.isActive
                          ? 'ปิดใช้งานชั่วคราว'
                          : isLoggedThisMonth
                            ? 'ลงบัญชีเดือนนี้แล้ว'
                            : 'รอลงบัญชีเดือนนี้'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <span className="text-base font-semibold font-mono-num text-slate-900 dark:text-white">
                      {formatCurrency(item.amount, currency)}
                    </span>

                    {item.isActive && !isLoggedThisMonth && (
                      <button
                        type="button"
                        disabled={loggingId === item.id}
                        onClick={() => handleLogSingle(item)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
                      >
                        <CalendarCheck2 className="w-3.5 h-3.5" />
                        {loggingId === item.id ? 'กำลังบันทึก' : 'ลงบัญชีเดือนนี้'}
                      </button>
                    )}

                    {item.isActive && isLoggedThisMonth && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        เรียบร้อย
                      </span>
                    )}

                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggle(item)}
                        title={item.isActive ? 'พักการแจ้งเตือน' : 'เปิดใช้งานอีกครั้ง'}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        {item.isActive ? (
                          <PauseCircle className="w-4 h-4" />
                        ) : (
                          <PlayCircle className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        aria-label={`แก้ไข ${item.title}`}
                        className="p-2 rounded-lg text-slate-500 hover:text-[#0071E3] dark:text-slate-400 dark:hover:text-[#2997FF] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {confirmDeleteId === item.id ? (
                        <div className="inline-flex items-center gap-2 text-xs pl-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                          >
                            ลบ
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
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label={`ลบ ${item.title}`}
                          className="p-2 rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add / Edit Recurring Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-md">
          <div className="apple-glass-strong w-full max-w-lg rounded-3xl p-6 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingItem ? 'แก้ไขค่าใช้จ่ายประจำ' : 'จดจำค่าใช้จ่ายประจำใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-2 rounded-xl text-slate-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  ชื่อรายการประจำ
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.TITLE_MAX_LEN}
                  placeholder="เช่น ค่าหอพัก, ค่าเน็ตบ้าน, ผ่อนรถ, iCloud+"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    จำนวนเงิน ({currency})
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    หมวดหมู่รายจ่าย
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    ความถี่
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    วันที่ครบกำหนด (1-31)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-sm font-mono-num text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    ช่องทางชำระเงินเริ่มต้น
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.12] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
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
                  หมายเหตุ
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.NOTE_MAX_LEN}
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
                  {saving ? 'กำลังบันทึก...' : 'บันทึกค่าใช้จ่ายประจำ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
