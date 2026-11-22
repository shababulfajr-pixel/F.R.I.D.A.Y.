import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { AllocationsView } from './components/AllocationsView';
import { AuthScreen } from './components/AuthScreen';
import { BudgetsView } from './components/BudgetsView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InvestmentsView } from './components/InvestmentsView';
import { LedgerView } from './components/LedgerView';
import { RecurringView } from './components/RecurringView';
import { ReportsView } from './components/ReportsView';
import { TransactionModal } from './components/TransactionModal';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import {
  formatMonthKeyThai,
  type AppSection,
  type TransactionRecord,
} from './types/finance';

const NAV_ITEMS: {
  id: AppSection;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'ภาพรวม', shortLabel: 'ภาพรวม', icon: LayoutDashboard },
  { id: 'ledger', label: 'รายรับ-รายจ่าย', shortLabel: 'บัญชี', icon: ListOrdered },
  { id: 'investments', label: 'การลงทุน', shortLabel: 'ลงทุน', icon: TrendingUp },
  { id: 'allocations', label: 'แผนเบิกจ่ายรายปี', shortLabel: 'เบิกจ่าย', icon: Target },
  { id: 'recurring', label: 'ค่าใช้จ่ายประจำ', shortLabel: 'บิลประจำ', icon: CalendarClock },
  { id: 'budgets', label: 'งบประมาณและเตือน', shortLabel: 'งบเตือน', icon: BellRing },
  { id: 'reports', label: 'รายงานและแนวโน้ม', shortLabel: 'รายงาน', icon: BarChart3 },
];

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function WorkspaceShell() {
  const {
    user,
    authReady,
    profile,
    selectedMonth,
    setSelectedMonth,
    isOnline,
    hasPendingWrites,
    alerts,
    toasts,
    dismissToast,
    signOutUser,
  } = useFinance();
  const { theme, setTheme, toggleTheme } = useTheme();

  const [section, setSection] = useState<AppSection>('dashboard');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null);

  if (!authReady) {
    return (
      <div className="min-h-dvh flex items-center justify-center glass-backdrop-field">
        <div className="apple-glass-strong rounded-full px-7 py-4 flex items-center gap-3 text-sm text-[#6E6E73] dark:text-[#A1A1A6]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#0071E3] dark:text-[#0A84FF]" />
          <span>กำลังเปิด F.R.I.D.A.Y....</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === section) ?? NAV_ITEMS[0];

  const openNewTransaction = () => {
    setEditingTx(null);
    setTxModalOpen(true);
  };

  const openEditTransaction = (tx: TransactionRecord) => {
    setEditingTx(tx);
    setTxModalOpen(true);
  };

  const syncStatusText = !isOnline
    ? 'ออฟไลน์ · บันทึกในเครื่อง'
    : hasPendingWrites
      ? 'กำลังซิงค์อัตโนมัติ...'
      : 'ซิงค์คลาวด์แล้ว';

  return (
    <div className="min-h-dvh glass-backdrop-field text-[#1D1D1F] dark:text-[#F5F5F7] flex">
      {/* Desktop Floating visionOS Glass Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-[264px] shrink-0 sticky top-0 h-dvh p-4">
        <div className="apple-glass rounded-[30px] flex-1 flex flex-col justify-between p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Minimal Apple Wordmark */}
            <div className="px-3.5 pt-2">
              <button
                type="button"
                onClick={() => setSection('dashboard')}
                className="text-[22px] font-semibold tracking-[-0.03em] text-[#1D1D1F] dark:text-white cursor-pointer whitespace-nowrap"
              >
                F.R.I.D.A.Y.
              </button>
            </div>

            <nav className="space-y-1" aria-label="เมนูหลัก">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                const showAlertCount = item.id === 'budgets' && alerts.length > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-[14px] font-medium transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-white/90 dark:bg-white/[0.14] text-[#1D1D1F] dark:text-white shadow-[0_2px_10px_-3px_rgba(0,0,0,0.08)]'
                        : 'text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[#1D1D1F] dark:hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-[17px] h-[17px] shrink-0 ${
                          active ? 'text-[#0071E3] dark:text-[#0A84FF]' : ''
                        }`}
                      />
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                    </span>
                    {showAlertCount && (
                      <span className="text-xs font-mono-num font-semibold text-[#D70015] dark:text-[#FF453A]">
                        {alerts.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Utility & Account Footer */}
          <div className="space-y-3.5 pt-4 border-t border-black/[0.06] dark:border-white/[0.09]">
            {/* Real Connection / Sync Status */}
            <div className="px-3 flex items-center gap-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              {!isOnline ? (
                <CloudOff className="w-3.5 h-3.5 text-[#B25000] dark:text-[#FF9F0A] shrink-0" />
              ) : hasPendingWrites ? (
                <RefreshCw className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF] animate-spin shrink-0" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-[#248A3D] dark:text-[#30D158] shrink-0" />
              )}
              <span className="truncate">{syncStatusText}</span>
            </div>

            {/* Apple Segmented Light / Dark Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white text-[#1D1D1F] shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>สว่าง</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>มืด</span>
              </button>
            </div>

            <div className="px-2.5 pt-2.5 border-t border-black/[0.06] dark:border-white/[0.09] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#1D1D1F] dark:text-white truncate">
                  {profile?.displayName || user.displayName || 'ผู้ใช้งาน'}
                </div>
                <div className="text-[11px] text-[#86868B] truncate">{user.email}</div>
              </div>
              <button
                type="button"
                onClick={signOutUser}
                aria-label="ออกจากระบบ"
                title="ออกจากระบบ"
                className="p-2 rounded-full text-[#6E6E73] hover:text-[#D70015] dark:text-[#A1A1A6] dark:hover:text-[#FF453A] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col pb-24 lg:pb-10">
        {/* Top Floating Contextual Glass Bar */}
        <header className="sticky top-0 z-30 px-4 lg:px-8 pt-3.5 lg:pt-4 pb-2">
          <div className="apple-glass-strong rounded-full px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0 pl-1">
              <span className="lg:hidden text-[17px] font-semibold tracking-[-0.03em] text-[#1D1D1F] dark:text-white whitespace-nowrap shrink-0">
                F.R.I.D.A.Y.
              </span>
              <span className="lg:hidden text-black/20 dark:text-white/20" aria-hidden="true">/</span>
              <h1 className="text-sm lg:text-[17px] font-semibold text-[#1D1D1F] dark:text-white truncate">
                {activeNav.label}
              </h1>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Frosted Month Stepper */}
              <div className="flex items-center gap-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, -1))}
                  aria-label="เดือนก่อนหน้า"
                  className="p-1.5 rounded-full text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-white dark:hover:bg-white/15 hover:text-[#1D1D1F] dark:hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-[#1D1D1F] dark:text-white px-2 whitespace-nowrap tabular-nums">
                  {formatMonthKeyThai(selectedMonth)}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, 1))}
                  aria-label="เดือนถัดไป"
                  className="p-1.5 rounded-full text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-white dark:hover:bg-white/15 hover:text-[#1D1D1F] dark:hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mobile Theme Toggle & Logout */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="สลับโหมดสว่างและมืด"
                className="lg:hidden p-2 rounded-full text-[#6E6E73] dark:text-[#A1A1A6] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={signOutUser}
                aria-label="ออกจากระบบ"
                className="lg:hidden p-2 rounded-full text-[#6E6E73] dark:text-[#A1A1A6] hover:text-[#D70015] dark:hover:text-[#FF453A] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>

              {/* Single Primary Apple CTA */}
              <button
                type="button"
                onClick={openNewTransaction}
                className="inline-flex items-center gap-1.5 px-4 sm:px-4.5 py-2 rounded-full bg-[#0071E3] hover:bg-[#0077ED] active:scale-[0.97] text-white text-xs sm:text-[13px] font-medium transition-all shadow-[0_6px_18px_-6px_rgba(0,113,227,0.6)] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">บันทึกรายการ</span>
                <span className="sm:hidden">เพิ่ม</span>
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Offline / Pending Sync Notice */}
        {(!isOnline || hasPendingWrites) && (
          <div className="lg:hidden px-4 pt-1">
            <div className="apple-glass rounded-full px-4 py-1.5 inline-flex items-center gap-2 text-xs text-[#6E6E73] dark:text-[#A1A1A6]">
              {!isOnline ? (
                <CloudOff className="w-3.5 h-3.5 text-[#B25000] dark:text-[#FF9F0A]" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF] animate-spin" />
              )}
              <span>{syncStatusText}</span>
            </div>
          </div>
        )}

        {/* Active Section Viewport with Crisp Apple Transition */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 lg:px-8 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {section === 'dashboard' && (
                <DashboardView onOpenNewTx={openNewTransaction} onNavigate={setSection} />
              )}
              {section === 'ledger' && (
                <LedgerView onOpenNewTx={openNewTransaction} onEditTx={openEditTransaction} />
              )}
              {section === 'investments' && <InvestmentsView />}
              {section === 'allocations' && <AllocationsView />}
              {section === 'recurring' && <RecurringView />}
              {section === 'budgets' && <BudgetsView />}
              {section === 'reports' && <ReportsView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Floating Apple Liquid Glass Tab Dock (Compact ≤ 60px) */}
      <nav
        aria-label="แถบนำทางมือถือ"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-3 pt-1 pointer-events-none"
      >
        <div className="apple-glass-strong pointer-events-auto rounded-[26px] px-1 py-1.5 grid grid-cols-7 gap-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-[18px] text-[9.5px] font-medium transition-all cursor-pointer ${
                  active
                    ? 'text-[#0071E3] dark:text-[#0A84FF] bg-white/80 dark:bg-white/[0.14] shadow-xs'
                    : 'text-[#6E6E73] dark:text-[#A1A1A6]'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="truncate max-w-full px-0.5">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Transaction Create / Edit Sheet */}
      <TransactionModal
        open={txModalOpen}
        editingTx={editingTx}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
      />

      {/* Floating Glass Toast Notification Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-50 flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="apple-glass-strong pointer-events-auto rounded-[22px] px-4 py-3.5 flex items-start justify-between gap-3"
            >
              <div className="space-y-0.5 min-w-0">
                <div
                  className={`text-xs font-semibold ${
                    t.tone === 'danger'
                      ? 'text-[#D70015] dark:text-[#FF453A]'
                      : t.tone === 'warning'
                        ? 'text-[#B25000] dark:text-[#FF9F0A]'
                        : t.tone === 'success'
                          ? 'text-[#248A3D] dark:text-[#30D158]'
                          : 'text-[#1D1D1F] dark:text-white'
                  }`}
                >
                  {t.title}
                </div>
                {t.description && (
                  <p className="text-xs text-[#6E6E73] dark:text-[#A1A1A6] leading-relaxed">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="ปิดการแจ้งเตือน"
                className="p-1 rounded-full text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <FinanceProvider>
          <WorkspaceShell />
        </FinanceProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
