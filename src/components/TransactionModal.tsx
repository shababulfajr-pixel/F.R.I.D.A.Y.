import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { createTransaction, updateTransaction } from '../lib/firestoreService';
import {
  BLUEPRINT_LIMITS,
  EXPENSE_CATEGORIES,
  formatCurrency,
  getTodayISO,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  type PaymentMethod,
  type TransactionCategory,
  type TransactionRecord,
  type TransactionType,
} from '../types/finance';

interface TransactionModalProps {
  open: boolean;
  editingTx?: TransactionRecord | null;
  defaultType?: TransactionType;
  onClose: () => void;
}

export function TransactionModal({
  open,
  editingTx,
  defaultType = 'expense',
  onClose,
}: TransactionModalProps) {
  const {
    user,
    currency,
    profile,
    transactions,
    allocations,
    isOnline,
    pushToast,
    checkAndNotifyAfterExpense,
  } = useFinance();

  const [type, setType] = useState<TransactionType>(defaultType);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<TransactionCategory>('food');
  const [date, setDate] = useState(getTodayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('promptpay');
  const [allocationId, setAllocationId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (editingTx) {
      setType(editingTx.type);
      setTitle(editingTx.title);
      setAmount(String(editingTx.amount));
      setCategory(editingTx.category);
      setDate(editingTx.date);
      setPaymentMethod(editingTx.paymentMethod);
      setAllocationId(editingTx.allocationId || '');
      setNote(editingTx.note || '');
    } else {
      setType(defaultType);
      setTitle('');
      setAmount('');
      setCategory(defaultType === 'income' ? 'salary' : 'food');
      setDate(getTodayISO());
      setPaymentMethod('promptpay');
      setAllocationId('');
      setNote('');
    }
  }, [open, editingTx, defaultType]);

  const categoryOptions = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeSwitch = (nextType: TransactionType) => {
    setType(nextType);
    const validList = nextType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!validList.some((c) => c.value === category)) {
      setCategory(validList[0].value);
    }
    if (nextType === 'income') {
      setAllocationId('');
    }
  };

  const budgetImpact = useMemo(() => {
    if (type !== 'expense') return null;
    const numericAmt = Number(amount);
    if (!numericAmt || numericAmt <= 0 || !profile?.monthlyBudgetLimit) return null;
    const txMonth = date.slice(0, 7);
    const currentMonthExpense = transactions
      .filter((t) => t.monthKey === txMonth && t.type === 'expense' && t.id !== editingTx?.id)
      .reduce((acc, t) => acc + t.amount, 0);
    const projected = currentMonthExpense + numericAmt;
    const pct = (projected / profile.monthlyBudgetLimit) * 100;
    if (pct >= 100) {
      return {
        severity: 'exceeded' as const,
        message: `รายการนี้จะทำให้ยอดใช้จ่ายเดือน ${txMonth} อยู่ที่ ${formatCurrency(projected, currency)} (${Math.round(pct)}% — เกินงบที่ตั้งไว้)`,
      };
    }
    if (pct >= profile.alertThresholdPercent) {
      return {
        severity: 'warning' as const,
        message: `รายการนี้จะทำให้ยอดใช้จ่ายแตะ ${Math.round(pct)}% ของเพดานงบเดือน ${txMonth} (${formatCurrency(projected, currency)} / ${formatCurrency(profile.monthlyBudgetLimit, currency)})`,
      };
    }
    return null;
  }, [type, amount, date, transactions, editingTx, profile, currency]);

  if (!open) return null;

  const activeAllocations = allocations.filter((a) => a.status !== 'completed');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const parsedAmount = Number(amount);
    if (!title.trim()) {
      setFormError('กรุณาระบุชื่อรายการ');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('กรุณาระบุจำนวนเงินที่มากกว่า 0');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        amount: parsedAmount,
        type,
        category,
        date,
        paymentMethod,
        allocationId: type === 'expense' ? allocationId : '',
        recurringId: editingTx?.recurringId || '',
        note: note.trim(),
      };

      if (editingTx) {
        await updateTransaction(user.uid, editingTx.id, payload);
        pushToast({
          title: 'อัปเดตรายการเรียบร้อย',
          description: isOnline
            ? `${payload.title} · ${formatCurrency(parsedAmount, currency)}`
            : 'บันทึกไว้ในเครื่องแล้ว จะซิงค์อัตโนมัติเมื่อออนไลน์',
          tone: 'success',
        });
      } else {
        await createTransaction(user.uid, payload);
        if (type === 'expense') {
          checkAndNotifyAfterExpense(category, parsedAmount, date.slice(0, 7));
        }
        pushToast({
          title: type === 'income' ? 'บันทึกรายรับแล้ว' : 'บันทึกรายจ่ายแล้ว',
          description: isOnline
            ? `${payload.title} · ${formatCurrency(parsedAmount, currency)}`
            : 'บันทึกในโหมดออฟไลน์แล้ว จะซิงค์อัตโนมัติเมื่อเชื่อมต่อเน็ต',
          tone: 'success',
        });
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกรายการได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="apple-glass-strong w-full max-w-lg rounded-[32px] p-6 md:p-8 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-black/[0.06] dark:border-white/[0.09]">
          <h2 id="tx-modal-title" className="text-[19px] font-semibold text-[#1D1D1F] dark:text-white">
            {editingTx ? 'แก้ไขรายการทางการเงิน' : 'บันทึกรายรับ-รายจ่าย'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="p-2 rounded-full text-[#6E6E73] hover:text-[#1D1D1F] dark:text-[#A1A1A6] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.1] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Apple Pill Segmented Type Selector */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
            <button
              type="button"
              onClick={() => handleTypeSwitch('expense')}
              className={`py-2 text-sm font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
                type === 'expense'
                  ? 'bg-white dark:bg-white/20 text-[#D70015] dark:text-[#FF453A] shadow-sm'
                  : 'text-[#6E6E73] dark:text-[#A1A1A6]'
              }`}
            >
              รายจ่าย
            </button>
            <button
              type="button"
              onClick={() => handleTypeSwitch('income')}
              className={`py-2 text-sm font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
                type === 'income'
                  ? 'bg-white dark:bg-white/20 text-[#248A3D] dark:text-[#30D158] shadow-sm'
                  : 'text-[#6E6E73] dark:text-[#A1A1A6]'
              }`}
            >
              รายรับ
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] mb-1.5">
                ชื่อรายการ
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.TITLE_MAX_LEN}
                placeholder={type === 'income' ? 'เช่น เงินเดือน, งานฟรีแลนซ์' : 'เช่น ค่าหอพัก, อาหารกลางวัน, ผ่อนชำระหนี้'}
                required
                className="apple-input w-full px-4 py-2.5 rounded-2xl text-sm text-[#1D1D1F] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] mb-1.5">
                จำนวนเงิน ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={BLUEPRINT_LIMITS.MAX_AMOUNT}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="apple-input w-full px-4 py-2.5 rounded-2xl text-sm font-mono-num text-[#1D1D1F] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] mb-1.5">
                วันที่
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="apple-input w-full px-4 py-2.5 rounded-2xl text-sm font-mono-num text-[#1D1D1F] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] mb-1.5">
                หมวดหมู่
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                className="apple-input w-full px-4 py-2.5 rounded-2xl text-sm text-[#1D1D1F] dark:text-white dark:bg-[#1C1C1E]"
              >
                {categoryOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] mb-1.5">
                ช่องทางชำระเงิน
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="apple-input w-full px-4 py-2.5 rounded-2xl text-sm text-[#1D1D1F] dark:text-white dark:bg-[#1C1C1E]"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {type === 'expense' && activeAllocations.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] mb-1.5">
                  เชื่อมโยงแผนเบิกจ่ายรายปี (ไม่บังคับ)
                </label>
                <select
                  value={allocationId}
                  onChange={(e) => setAllocationId(e.target.value)}
                  className="apple-input w-full px-4 py-2.5 rounded-2xl text-sm text-[#1D1D1F] dark:text-white dark:bg-[#1C1C1E]"
                >
                  <option value="">ไม่เชื่อมโยงแผนเบิกจ่าย</option>
                  {activeAllocations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (ปี {a.year + 543})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#6E6E73] dark:text-[#A1A1A6] mb-1.5">
                บันทึกเพิ่มเติม (สูงสุด {BLUEPRINT_LIMITS.NOTE_MAX_LEN} ตัวอักษร)
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.NOTE_MAX_LEN}
                placeholder="รายละเอียดหรือหมายเหตุ..."
                className="apple-input w-full px-4 py-2.5 rounded-2xl text-sm text-[#1D1D1F] dark:text-white resize-none"
              />
            </div>
          </div>

          {budgetImpact && (
            <div
              className={`rounded-2xl border px-4 py-3 flex items-start gap-2.5 text-xs ${
                budgetImpact.severity === 'exceeded'
                  ? 'border-[#FF3B30]/30 bg-[#FF3B30]/10 text-[#D70015] dark:text-[#FF6961]'
                  : 'border-[#FF9F0A]/35 bg-[#FF9F0A]/12 text-[#9A4A00] dark:text-[#FFD60A]'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{budgetImpact.message}</span>
            </div>
          )}

          {formError && (
            <div className="rounded-2xl border border-[#FF3B30]/30 bg-[#FF3B30]/10 px-4 py-2.5 text-xs text-[#D70015] dark:text-[#FF6961]">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/[0.06] dark:border-white/[0.09]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full text-sm font-medium text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-full bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              {saving ? 'กำลังบันทึก...' : editingTx ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
