import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { deleteTransaction } from '../lib/firestoreService';
import {
  ALL_CATEGORIES,
  formatCurrency,
  formatDateThai,
  formatMonthKeyThai,
  getCategoryLabel,
  getPaymentMethodLabel,
  type TransactionRecord,
} from '../types/finance';

interface LedgerViewProps {
  onOpenNewTx: () => void;
  onEditTx: (tx: TransactionRecord) => void;
}

export function LedgerView({ onOpenNewTx, onEditTx }: LedgerViewProps) {
  const { user, currency, transactions, selectedMonth, pushToast } = useFinance();

  const [scope, setScope] = useState<'month' | 'all'>('month');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (scope === 'month' && tx.monthKey !== selectedMonth) return false;
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      if (q) {
        const hay = `${tx.title} ${tx.note} ${getCategoryLabel(tx.category)} ${getPaymentMethodLabel(tx.paymentMethod)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, scope, selectedMonth, typeFilter, categoryFilter, searchQuery]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filtered) {
      if (tx.type === 'income') income += tx.amount;
      else expense += tx.amount;
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  const handleDelete = async (tx: TransactionRecord) => {
    if (!user) return;
    setDeletingId(tx.id);
    try {
      await deleteTransaction(user.uid, tx.id);
      setConfirmDeleteId(null);
      pushToast({
        title: 'ลบรายการเรียบร้อย',
        description: tx.title,
        tone: 'info',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter & Summary Header */}
      <section className="apple-glass rounded-3xl p-5 md:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Scope Segmented Control */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
              <button
                type="button"
                onClick={() => setScope('month')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
                  scope === 'month'
                    ? 'bg-white dark:bg-white/20 text-[#1D1D1F] dark:text-white shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                {formatMonthKeyThai(selectedMonth)}
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
                  scope === 'all'
                    ? 'bg-white dark:bg-white/20 text-[#1D1D1F] dark:text-white shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                ทั้งหมดทุกเดือน
              </button>
            </div>

            {/* Type Segmented Control */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
              {(
                [
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'income', label: 'รายรับ' },
                  { id: 'expense', label: 'รายจ่าย' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTypeFilter(item.id)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    typeFilter === item.id
                      ? 'bg-white dark:bg-white/20 text-[#1D1D1F] dark:text-white shadow-sm'
                      : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 text-[#86868B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อรายการ, โน้ต..."
                className="apple-input w-full pl-9 pr-3.5 py-2 rounded-full text-xs text-[#1D1D1F] dark:text-white"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="กรองตามหมวดหมู่"
              className="apple-input px-3.5 py-2 rounded-full text-xs text-[#1D1D1F] dark:text-white dark:bg-[#1C1C1E]"
            >
              <option value="all">ทุกหมวดหมู่</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clean Filtered Totals Strip */}
        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center justify-between sm:block">
            <span className="text-xs text-slate-500 dark:text-slate-400">รายรับตามตัวกรอง</span>
            <div className="font-mono-num font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
              +{formatCurrency(totals.income, currency)}
            </div>
          </div>
          <div className="flex items-center justify-between sm:block">
            <span className="text-xs text-slate-500 dark:text-slate-400">รายจ่ายตามตัวกรอง</span>
            <div className="font-mono-num font-semibold text-slate-900 dark:text-white mt-0.5">
              -{formatCurrency(totals.expense, currency)}
            </div>
          </div>
          <div className="flex items-center justify-between sm:block">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ยอดสุทธิ ({filtered.length} รายการ)
            </span>
            <div
              className={`font-mono-num font-semibold mt-0.5 ${
                totals.net >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {totals.net >= 0 ? '+' : ''}
              {formatCurrency(totals.net, currency)}
            </div>
          </div>
        </div>
      </section>

      {/* High-Density Responsive Ledger Table */}
      <section className="apple-glass rounded-3xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ไม่พบรายการที่ตรงกับเงื่อนไขที่เลือก
            </p>
            <button
              type="button"
              onClick={onOpenNewTx}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0062C4] text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่มรายการใหม่
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06] dark:border-white/[0.08] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-5 whitespace-nowrap">วันที่</th>
                  <th className="py-3.5 px-4">รายการ</th>
                  <th className="py-3.5 px-4 hidden md:table-cell whitespace-nowrap">หมวดหมู่</th>
                  <th className="py-3.5 px-4 hidden lg:table-cell whitespace-nowrap">ช่องทาง</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">จำนวนเงิน</th>
                  <th className="py-3.5 px-5 text-right whitespace-nowrap">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.07] text-sm">
                {filtered.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="py-3.5 px-5 text-xs font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateThai(tx.date)}
                    </td>
                    <td className="py-3.5 px-4 min-w-[180px]">
                      <div className="font-medium text-slate-900 dark:text-white">{tx.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="md:hidden">{getCategoryLabel(tx.category)}</span>
                        {tx.note && (
                          <>
                            <span className="md:hidden" aria-hidden="true">·</span>
                            <span className="truncate max-w-xs">{tx.note}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 hidden md:table-cell whitespace-nowrap">
                      {getCategoryLabel(tx.category)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 hidden lg:table-cell whitespace-nowrap">
                      {getPaymentMethodLabel(tx.paymentMethod)}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-mono-num font-semibold whitespace-nowrap ${
                        tx.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {formatCurrency(tx.amount, currency)}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      {confirmDeleteId === tx.id ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={deletingId === tx.id}
                            onClick={() => handleDelete(tx)}
                            className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                          >
                            {deletingId === tx.id ? 'กำลังลบ' : 'ยืนยันลบ'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditTx(tx)}
                            aria-label={`แก้ไข ${tx.title}`}
                            className="p-2 rounded-lg text-slate-500 hover:text-[#0071E3] dark:text-slate-400 dark:hover:text-[#2997FF] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(tx.id)}
                            aria-label={`ลบ ${tx.title}`}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
