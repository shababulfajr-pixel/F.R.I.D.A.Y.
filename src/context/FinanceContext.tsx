import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { ensureUserProfile } from '../lib/firestoreService';
import {
  fetchLiveMarketQuotes,
  loadCachedMarketMeta,
  loadCachedQuotes,
  saveCachedQuotes,
} from '../lib/marketApi';
import {
  formatCurrency,
  getCategoryLabel,
  getCurrentMonthKey,
  MARKET_CATALOG,
  type AnnualAllocationRecord,
  type BudgetAlertItem,
  type CategoryBudgetRecord,
  type CurrencyCode,
  type InvestmentPositionRecord,
  type MarketQuote,
  type RecurringExpenseRecord,
  type ToastNotice,
  type TransactionRecord,
  type UserProfile,
} from '../types/finance';

const DEFAULT_WATCHLIST_SYMBOLS = MARKET_CATALOG.map((a) => a.symbol);

function toDateOrNull(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate();
  }
  return null;
}

interface FinanceContextValue {
  user: User | null;
  authReady: boolean;
  dataLoading: boolean;
  authError: string | null;
  profile: UserProfile | null;
  currency: CurrencyCode;
  transactions: TransactionRecord[];
  budgets: CategoryBudgetRecord[];
  allocations: AnnualAllocationRecord[];
  recurring: RecurringExpenseRecord[];
  investments: InvestmentPositionRecord[];
  marketQuotes: Record<string, MarketQuote>;
  usdThbRate: number;
  marketLoading: boolean;
  marketUpdatedAt: string | null;
  marketError: string | null;
  refreshMarketQuotes: (extraSymbols?: string[]) => Promise<Record<string, MarketQuote>>;
  selectedMonth: string; // YYYY-MM
  setSelectedMonth: (month: string) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  isOnline: boolean;
  hasPendingWrites: boolean;
  fromCache: boolean;
  alerts: BudgetAlertItem[];
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyNet: number;
  overallBudgetPercent: number;
  cashNetSavings: number;
  totalInvestedCost: number;
  totalInvestmentValue: number;
  totalInvestmentProfit: number;
  totalInvestmentProfitPct: number;
  netTotalSavings: number;
  toasts: ToastNotice[];
  pushToast: (toast: Omit<ToastNotice, 'id'>) => void;
  dismissToast: (id: string) => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  checkAndNotifyAfterExpense: (category: string, addedAmount: number, txMonthKey: string) => void;
}

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudgetRecord[]>([]);
  const [allocations, setAllocations] = useState<AnnualAllocationRecord[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpenseRecord[]>([]);
  const [investments, setInvestments] = useState<InvestmentPositionRecord[]>([]);

  const [marketQuotes, setMarketQuotes] = useState<Record<string, MarketQuote>>(() =>
    loadCachedQuotes()
  );
  const [usdThbRate, setUsdThbRate] = useState<number>(() => loadCachedMarketMeta().usdThbRate);
  const [marketLoading, setMarketLoading] = useState<boolean>(false);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(
    () => loadCachedMarketMeta().updatedAt
  );
  const [marketError, setMarketError] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonthState] = useState<string>(getCurrentMonthKey);
  const [selectedYear, setSelectedYearState] = useState<number>(() => Number(getCurrentMonthKey().slice(0, 4)));

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const [cacheMap, setCacheMap] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const prevOnlineRef = useRef<boolean>(isOnline);
  const investmentsRef = useRef<InvestmentPositionRecord[]>(investments);
  investmentsRef.current = investments;

  const pushToast = useCallback((toast: Omit<ToastNotice, 'id'>) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [{ ...toast, id }, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const setSelectedMonth = useCallback((month: string) => {
    setSelectedMonthState(month);
    const yr = Number(month.slice(0, 4));
    if (yr >= 2020 && yr <= 2100) {
      setSelectedYearState(yr);
    }
  }, []);

  const setSelectedYear = useCallback((year: number) => {
    setSelectedYearState(year);
    setSelectedMonthState((prev) => `${year}-${prev.slice(5, 7)}`);
  }, []);

  // Browser online/offline state tracking
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (!prevOnlineRef.current) {
        pushToast({
          title: 'กลับมาออนไลน์แล้ว',
          description: 'กำลังซิงค์ข้อมูลบัญชีที่บันทึกไว้อัตโนมัติขึ้นคลาวด์',
          tone: 'success',
        });
      }
      prevOnlineRef.current = true;
    };
    const onOffline = () => {
      setIsOnline(false);
      prevOnlineRef.current = false;
      pushToast({
        title: 'โหมดใช้งานแบบออฟไลน์',
        description: 'คุณยังสามารถดูและบันทึกรายการได้ตามปกติ ระบบจะซิงค์ให้อัตโนมัติเมื่อเชื่อมต่อเน็ต',
        tone: 'warning',
      });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [pushToast]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthError(null);
      if (!firebaseUser) {
        setProfile(null);
        setTransactions([]);
        setBudgets([]);
        setAllocations([]);
        setRecurring([]);
        setInvestments([]);
        setProfileReady(false);
        setDataLoading(false);
        setAuthReady(true);
        return;
      }

      setAuthReady(true);
      setDataLoading(true);
      try {
        await ensureUserProfile(firebaseUser);
        setProfileReady(true);
      } catch (err) {
        setFatalError(err instanceof Error ? err : new Error(String(err)));
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listeners (attached strictly after auth + profile ready)
  useEffect(() => {
    if (!authReady || !user || !profileReady) return;
    const uid = user.uid;

    let loadedFlags = {
      profile: false,
      transactions: false,
      budgets: false,
      allocations: false,
      recurring: false,
      investments: false,
    };

    const markLoaded = (key: keyof typeof loadedFlags) => {
      loadedFlags[key] = true;
      if (Object.values(loadedFlags).every(Boolean)) {
        setDataLoading(false);
      }
    };

    const profilePath = `users/${uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      { includeMetadataChanges: true },
      (snap) => {
        setPendingMap((prev) => ({ ...prev, profile: snap.metadata.hasPendingWrites }));
        setCacheMap((prev) => ({ ...prev, profile: snap.metadata.fromCache }));
        if (snap.exists()) {
          const d = snap.data({ serverTimestamps: 'estimate' });
          setProfile({
            uid: d.uid,
            displayName: d.displayName,
            email: d.email,
            currency: d.currency || 'THB',
            monthlyBudgetLimit: Number(d.monthlyBudgetLimit ?? 25000),
            alertThresholdPercent: Number(d.alertThresholdPercent ?? 80),
            notificationsEnabled: Boolean(d.notificationsEnabled),
            createdAt: toDateOrNull(d.createdAt),
            updatedAt: toDateOrNull(d.updatedAt),
          });
        }
        markLoaded('profile');
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, profilePath);
        } catch (err) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    const txPath = `users/${uid}/transactions`;
    const txQuery = query(collection(db, 'users', uid, 'transactions'), where('ownerId', '==', uid));
    const unsubTx = onSnapshot(
      txQuery,
      { includeMetadataChanges: true },
      (snap) => {
        setPendingMap((prev) => ({ ...prev, tx: snap.metadata.hasPendingWrites }));
        setCacheMap((prev) => ({ ...prev, tx: snap.metadata.fromCache }));
        const rows: TransactionRecord[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data({ serverTimestamps: 'estimate' });
            return {
              id: docSnap.id,
              ownerId: d.ownerId,
              title: d.title,
              amount: Number(d.amount || 0),
              type: d.type,
              category: d.category,
              date: d.date,
              monthKey: d.monthKey,
              paymentMethod: d.paymentMethod,
              note: d.note || '',
              allocationId: d.allocationId || '',
              recurringId: d.recurringId || '',
              createdAt: toDateOrNull(d.createdAt),
              updatedAt: toDateOrNull(d.updatedAt),
            };
          })
          .sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
          });
        setTransactions(rows);
        markLoaded('transactions');
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, txPath);
        } catch (err) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    const budgetPath = `users/${uid}/budgets`;
    const budgetQuery = query(collection(db, 'users', uid, 'budgets'), where('ownerId', '==', uid));
    const unsubBudgets = onSnapshot(
      budgetQuery,
      { includeMetadataChanges: true },
      (snap) => {
        setPendingMap((prev) => ({ ...prev, budgets: snap.metadata.hasPendingWrites }));
        setCacheMap((prev) => ({ ...prev, budgets: snap.metadata.fromCache }));
        const rows: CategoryBudgetRecord[] = snap.docs.map((docSnap) => {
          const d = docSnap.data({ serverTimestamps: 'estimate' });
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            category: d.category,
            monthlyLimit: Number(d.monthlyLimit || 0),
            warningThreshold: Number(d.warningThreshold || 80),
            createdAt: toDateOrNull(d.createdAt),
            updatedAt: toDateOrNull(d.updatedAt),
          };
        });
        setBudgets(rows);
        markLoaded('budgets');
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, budgetPath);
        } catch (err) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    const allocPath = `users/${uid}/allocations`;
    const allocQuery = query(collection(db, 'users', uid, 'allocations'), where('ownerId', '==', uid));
    const unsubAlloc = onSnapshot(
      allocQuery,
      { includeMetadataChanges: true },
      (snap) => {
        setPendingMap((prev) => ({ ...prev, alloc: snap.metadata.hasPendingWrites }));
        setCacheMap((prev) => ({ ...prev, alloc: snap.metadata.fromCache }));
        const rows: AnnualAllocationRecord[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data({ serverTimestamps: 'estimate' });
            return {
              id: docSnap.id,
              ownerId: d.ownerId,
              name: d.name,
              purpose: d.purpose,
              year: Number(d.year),
              targetAnnualAmount: Number(d.targetAnnualAmount || 0),
              monthlyPlannedAmount: Number(d.monthlyPlannedAmount || 0),
              disbursedAmount: Number(d.disbursedAmount || 0),
              dueDay: Number(d.dueDay || 1),
              status: d.status,
              note: d.note || '',
              createdAt: toDateOrNull(d.createdAt),
              updatedAt: toDateOrNull(d.updatedAt),
            };
          })
          .sort((a, b) => a.dueDay - b.dueDay);
        setAllocations(rows);
        markLoaded('allocations');
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, allocPath);
        } catch (err) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    const recPath = `users/${uid}/recurring`;
    const recQuery = query(collection(db, 'users', uid, 'recurring'), where('ownerId', '==', uid));
    const unsubRec = onSnapshot(
      recQuery,
      { includeMetadataChanges: true },
      (snap) => {
        setPendingMap((prev) => ({ ...prev, rec: snap.metadata.hasPendingWrites }));
        setCacheMap((prev) => ({ ...prev, rec: snap.metadata.fromCache }));
        const rows: RecurringExpenseRecord[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data({ serverTimestamps: 'estimate' });
            return {
              id: docSnap.id,
              ownerId: d.ownerId,
              title: d.title,
              amount: Number(d.amount || 0),
              category: d.category,
              paymentMethod: d.paymentMethod,
              frequency: d.frequency,
              dueDay: Number(d.dueDay || 1),
              isActive: Boolean(d.isActive),
              lastLoggedMonth: d.lastLoggedMonth || '',
              note: d.note || '',
              createdAt: toDateOrNull(d.createdAt),
              updatedAt: toDateOrNull(d.updatedAt),
            };
          })
          .sort((a, b) => a.dueDay - b.dueDay);
        setRecurring(rows);
        markLoaded('recurring');
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, recPath);
        } catch (err) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    const invPath = `users/${uid}/investments`;
    const invQuery = query(collection(db, 'users', uid, 'investments'), where('ownerId', '==', uid));
    const unsubInv = onSnapshot(
      invQuery,
      { includeMetadataChanges: true },
      (snap) => {
        setPendingMap((prev) => ({ ...prev, inv: snap.metadata.hasPendingWrites }));
        setCacheMap((prev) => ({ ...prev, inv: snap.metadata.fromCache }));
        const rows: InvestmentPositionRecord[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data({ serverTimestamps: 'estimate' });
            return {
              id: docSnap.id,
              ownerId: d.ownerId,
              assetType: d.assetType,
              symbol: d.symbol,
              assetName: d.assetName,
              investedAmount: Number(d.investedAmount || 0),
              entryPriceThb: Number(d.entryPriceThb || 0),
              units: Number(d.units || 0),
              purchaseDate: d.purchaseDate,
              note: d.note || '',
              createdAt: toDateOrNull(d.createdAt),
              updatedAt: toDateOrNull(d.updatedAt),
            };
          })
          .sort((a, b) => {
            if (a.purchaseDate !== b.purchaseDate) return b.purchaseDate.localeCompare(a.purchaseDate);
            return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
          });
        setInvestments(rows);
        markLoaded('investments');
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, invPath);
        } catch (err) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    return () => {
      unsubProfile();
      unsubTx();
      unsubBudgets();
      unsubAlloc();
      unsubRec();
      unsubInv();
    };
  }, [authReady, user, profileReady]);

  const refreshMarketQuotes = useCallback(
    async (extraSymbols: string[] = []): Promise<Record<string, MarketQuote>> => {
      const heldSymbols = investmentsRef.current.map((i) => i.symbol);
      const symbols = Array.from(
        new Set([...DEFAULT_WATCHLIST_SYMBOLS, ...heldSymbols, ...extraSymbols])
      );
      if (!isOnline) {
        setMarketError('โหมดออฟไลน์ · แสดงราคาที่ดึงไว้ล่าสุดจากแคช');
        return {};
      }
      setMarketLoading(true);
      setMarketError(null);
      try {
        const res = await fetchLiveMarketQuotes(symbols);
        setUsdThbRate(res.usdThbRate);
        setMarketUpdatedAt(res.updatedAt);
        setMarketQuotes((prev) => {
          const merged = { ...prev, ...res.quotes };
          saveCachedQuotes(merged, { usdThbRate: res.usdThbRate, updatedAt: res.updatedAt });
          return merged;
        });
        return res.quotes;
      } catch (err) {
        setMarketError(
          err instanceof Error ? err.message : 'ไม่สามารถดึงราคาตลาดได้ ใช้ราคาล่าสุดจากแคช'
        );
        return {};
      } finally {
        setMarketLoading(false);
      }
    },
    [isOnline]
  );

  // On-demand fetching only (no real-time background polling):
  // Fetch once automatically only if no cached quotes exist yet; otherwise user presses "ดึงราคาล่าสุด" anytime.
  const initialSnapshotFetchedRef = useRef(false);
  useEffect(() => {
    if (!authReady || !user || !isOnline || initialSnapshotFetchedRef.current) return;
    if (Object.keys(marketQuotes).length === 0) {
      initialSnapshotFetchedRef.current = true;
      void refreshMarketQuotes();
    }
  }, [authReady, user, isOnline, marketQuotes, refreshMarketQuotes]);

  if (fatalError) {
    throw fatalError;
  }

  const currency: CurrencyCode = profile?.currency || 'THB';

  const { monthlyIncome, monthlyExpense, monthlyNet, overallBudgetPercent, alerts } = useMemo(() => {
    const monthTxs = transactions.filter((t) => t.monthKey === selectedMonth);
    let inc = 0;
    let exp = 0;
    const expByCat: Record<string, number> = {};

    for (const tx of monthTxs) {
      if (tx.type === 'income') {
        inc += tx.amount;
      } else {
        exp += tx.amount;
        expByCat[tx.category] = (expByCat[tx.category] || 0) + tx.amount;
      }
    }

    const computedAlerts: BudgetAlertItem[] = [];
    const globalLimit = profile?.monthlyBudgetLimit ?? 0;
    const globalThreshold = profile?.alertThresholdPercent ?? 80;
    const overallPct = globalLimit > 0 ? (exp / globalLimit) * 100 : 0;

    if (globalLimit > 0 && overallPct >= globalThreshold) {
      computedAlerts.push({
        id: 'overall_budget',
        scope: 'overall',
        label: 'งบประมาณรายจ่ายรวมประจำเดือน',
        spent: exp,
        limit: globalLimit,
        percent: overallPct,
        threshold: globalThreshold,
        severity: overallPct >= 100 ? 'exceeded' : 'warning',
      });
    }

    for (const b of budgets) {
      const catSpent = expByCat[b.category] || 0;
      if (b.monthlyLimit > 0) {
        const pct = (catSpent / b.monthlyLimit) * 100;
        if (pct >= b.warningThreshold) {
          computedAlerts.push({
            id: b.id,
            scope: 'category',
            label: getCategoryLabel(b.category),
            spent: catSpent,
            limit: b.monthlyLimit,
            percent: pct,
            threshold: b.warningThreshold,
            severity: pct >= 100 ? 'exceeded' : 'warning',
          });
        }
      }
    }

    computedAlerts.sort((a, b) => b.percent - a.percent);

    return {
      monthlyIncome: inc,
      monthlyExpense: exp,
      monthlyNet: inc - exp,
      overallBudgetPercent: overallPct,
      alerts: computedAlerts,
    };
  }, [transactions, selectedMonth, profile, budgets]);

  const {
    cashNetSavings,
    totalInvestedCost,
    totalInvestmentValue,
    totalInvestmentProfit,
    totalInvestmentProfitPct,
    netTotalSavings,
  } = useMemo(() => {
    const cashNet = transactions.reduce(
      (sum, tx) => (tx.type === 'income' ? sum + tx.amount : sum - tx.amount),
      0
    );
    let cost = 0;
    let currentVal = 0;
    for (const inv of investments) {
      const livePrice = marketQuotes[inv.symbol]?.priceThb ?? inv.entryPriceThb;
      cost += inv.investedAmount;
      currentVal += inv.units * livePrice;
    }
    const profit = currentVal - cost;
    const profitPct = cost > 0 ? (profit / cost) * 100 : 0;
    return {
      cashNetSavings: cashNet,
      totalInvestedCost: cost,
      totalInvestmentValue: currentVal,
      totalInvestmentProfit: profit,
      totalInvestmentProfitPct: profitPct,
      netTotalSavings: cashNet + currentVal,
    };
  }, [transactions, investments, marketQuotes]);

  const checkAndNotifyAfterExpense = useCallback(
    (category: string, addedAmount: number, txMonthKey: string) => {
      const monthTxs = transactions.filter((t) => t.monthKey === txMonthKey && t.type === 'expense');
      const nextTotalExp = monthTxs.reduce((acc, t) => acc + t.amount, 0) + addedAmount;
      const globalLimit = profile?.monthlyBudgetLimit ?? 0;
      const globalThreshold = profile?.alertThresholdPercent ?? 80;

      const sendBrowserNotification = (title: string, body: string) => {
        if (
          profile?.notificationsEnabled &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(title, { body });
        }
      };

      if (globalLimit > 0) {
        const pct = (nextTotalExp / globalLimit) * 100;
        if (pct >= 100) {
          const title = 'แจ้งเตือน: ยอดใช้จ่ายเกินงบประจำเดือนแล้ว';
          const desc = `ใช้จ่ายสะสม ${formatCurrency(nextTotalExp, currency)} จากเพดาน ${formatCurrency(globalLimit, currency)} (${Math.round(pct)}%)`;
          pushToast({ title, description: desc, tone: 'danger' });
          sendBrowserNotification(title, desc);
          return;
        } else if (pct >= globalThreshold) {
          const title = 'ใกล้ถึงเพดานงบประมาณประจำเดือน';
          const desc = `ใช้จ่ายไปแล้ว ${Math.round(pct)}% (${formatCurrency(nextTotalExp, currency)} / ${formatCurrency(globalLimit, currency)})`;
          pushToast({ title, description: desc, tone: 'warning' });
          sendBrowserNotification(title, desc);
          return;
        }
      }

      const catBudget = budgets.find((b) => b.category === category);
      if (catBudget && catBudget.monthlyLimit > 0) {
        const nextCatExp =
          monthTxs.filter((t) => t.category === category).reduce((acc, t) => acc + t.amount, 0) +
          addedAmount;
        const catPct = (nextCatExp / catBudget.monthlyLimit) * 100;
        if (catPct >= 100) {
          const title = `เกินงบหมวด${getCategoryLabel(category)}`;
          const desc = `ยอดรวม ${formatCurrency(nextCatExp, currency)} เกินเพดาน ${formatCurrency(catBudget.monthlyLimit, currency)}`;
          pushToast({ title, description: desc, tone: 'danger' });
          sendBrowserNotification(title, desc);
        } else if (catPct >= catBudget.warningThreshold) {
          const title = `หมวด${getCategoryLabel(category)} ใกล้ถึงเพดานงบ`;
          const desc = `ใช้จ่ายแล้ว ${Math.round(catPct)}% (${formatCurrency(nextCatExp, currency)} / ${formatCurrency(catBudget.monthlyLimit, currency)})`;
          pushToast({ title, description: desc, tone: 'warning' });
          sendBrowserNotification(title, desc);
        }
      }
    },
    [transactions, profile, budgets, currency, pushToast]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('คุณปิดหน้าต่างเข้าสู่ระบบก่อนเสร็จสิ้น กรุณาลองอีกครั้ง');
      } else {
        setAuthError(msg);
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const hasPendingWrites = Object.values(pendingMap).some(Boolean);
  const fromCache = Object.values(cacheMap).some(Boolean);

  const value: FinanceContextValue = {
    user,
    authReady,
    dataLoading,
    authError,
    profile,
    currency,
    transactions,
    budgets,
    allocations,
    recurring,
    investments,
    marketQuotes,
    usdThbRate,
    marketLoading,
    marketUpdatedAt,
    marketError,
    refreshMarketQuotes,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    isOnline,
    hasPendingWrites,
    fromCache,
    alerts,
    monthlyIncome,
    monthlyExpense,
    monthlyNet,
    overallBudgetPercent,
    cashNetSavings,
    totalInvestedCost,
    totalInvestmentValue,
    totalInvestmentProfit,
    totalInvestmentProfitPct,
    netTotalSavings,
    toasts,
    pushToast,
    dismissToast,
    signInWithGoogle,
    signOutUser,
    checkAndNotifyAfterExpense,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
}
