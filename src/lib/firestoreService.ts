import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  BLUEPRINT_LIMITS,
  clampNumber,
  getCurrentMonthKey,
  getPurposeMeta,
  getTodayISO,
  sanitizeString,
  type AllocationPurpose,
  type AllocationStatus,
  type AnnualAllocationRecord,
  type AssetType,
  type CurrencyCode,
  type ExpenseCategory,
  type PaymentMethod,
  type RecurringExpenseRecord,
  type RecurringFrequency,
  type TransactionCategory,
  type TransactionType,
} from '../types/finance';

function generateCleanId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  const raw = `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
  return raw.slice(0, BLUEPRINT_LIMITS.ID_MAX_LEN);
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);

  // Ensure the Firebase Auth ID token is ready and attached before Firestore requests
  try {
    await user.getIdToken();
  } catch {
    // Offline or transient token refresh failure; proceed with cached token
  }

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    // When completely offline on first load, getDoc may throw unavailable; handle gracefully if cached
    if (error instanceof Error && error.message.toLowerCase().includes('offline')) {
      return;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }

  const safeName =
    sanitizeString(
      user.displayName || user.email?.split('@')[0] || 'ผู้ใช้งาน',
      BLUEPRINT_LIMITS.DISPLAY_NAME_MAX_LEN
    ) || 'ผู้ใช้งาน';
  const safeEmail = sanitizeString(
    user.email || 'user@example.com',
    BLUEPRINT_LIMITS.EMAIL_MAX_LEN
  );

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        uid: user.uid,
        displayName: safeName,
        email: safeEmail,
        currency: 'THB' as CurrencyCode,
        monthlyBudgetLimit: 25000,
        alertThresholdPercent: 80,
        notificationsEnabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('offline')) {
        return;
      }
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    const data = snap.data();
    // Only sync email if changed on Google account; preserve user's custom displayName
    if (data.email !== safeEmail && safeEmail.length >= 3) {
      try {
        await updateDoc(ref, {
          email: safeEmail,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes('offline')) {
          return;
        }
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }
}

export async function updateUserBudgetSettings(
  uid: string,
  settings: {
    monthlyBudgetLimit: number;
    alertThresholdPercent: number;
    notificationsEnabled: boolean;
    currency: CurrencyCode;
    displayName: string;
  }
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      monthlyBudgetLimit: clampNumber(settings.monthlyBudgetLimit, 0, BLUEPRINT_LIMITS.MAX_AMOUNT),
      alertThresholdPercent: clampNumber(
        Math.round(settings.alertThresholdPercent),
        BLUEPRINT_LIMITS.MIN_THRESHOLD,
        BLUEPRINT_LIMITS.MAX_THRESHOLD
      ),
      notificationsEnabled: Boolean(settings.notificationsEnabled),
      currency: settings.currency,
      displayName: sanitizeString(settings.displayName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX_LEN) || 'ผู้ใช้งาน',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface TransactionInput {
  title: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  date: string;
  paymentMethod: PaymentMethod;
  note: string;
  allocationId?: string;
  recurringId?: string;
}

export async function createTransaction(uid: string, input: TransactionInput): Promise<string> {
  const id = generateCleanId('tx');
  const path = `users/${uid}/transactions/${id}`;
  const cleanDate = BLUEPRINT_LIMITS.DATE_PATTERN.test(input.date) ? input.date : getTodayISO();
  const cleanMonthKey = cleanDate.slice(0, 7);
  const cleanTitle = sanitizeString(input.title, BLUEPRINT_LIMITS.TITLE_MAX_LEN);
  if (!cleanTitle) {
    throw new Error('กรุณาระบุชื่อรายการ');
  }
  const cleanAmount = clampNumber(Number(input.amount), 0.01, BLUEPRINT_LIMITS.MAX_AMOUNT);
  const cleanAllocationId =
    input.allocationId && BLUEPRINT_LIMITS.OPTIONAL_ID_PATTERN.test(input.allocationId)
      ? input.allocationId.slice(0, BLUEPRINT_LIMITS.ID_MAX_LEN)
      : '';
  const cleanRecurringId =
    input.recurringId && BLUEPRINT_LIMITS.OPTIONAL_ID_PATTERN.test(input.recurringId)
      ? input.recurringId.slice(0, BLUEPRINT_LIMITS.ID_MAX_LEN)
      : '';

  try {
    await setDoc(doc(db, 'users', uid, 'transactions', id), {
      ownerId: uid,
      title: cleanTitle,
      amount: cleanAmount,
      type: input.type,
      category: input.category,
      date: cleanDate,
      monthKey: cleanMonthKey,
      paymentMethod: input.paymentMethod,
      note: sanitizeString(input.note || '', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      allocationId: cleanAllocationId,
      recurringId: cleanRecurringId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTransaction(
  uid: string,
  txId: string,
  input: TransactionInput
): Promise<void> {
  const path = `users/${uid}/transactions/${txId}`;
  const cleanDate = BLUEPRINT_LIMITS.DATE_PATTERN.test(input.date) ? input.date : getTodayISO();
  const cleanMonthKey = cleanDate.slice(0, 7);
  const cleanTitle = sanitizeString(input.title, BLUEPRINT_LIMITS.TITLE_MAX_LEN);
  if (!cleanTitle) {
    throw new Error('กรุณาระบุชื่อรายการ');
  }
  const cleanAmount = clampNumber(Number(input.amount), 0.01, BLUEPRINT_LIMITS.MAX_AMOUNT);
  const cleanAllocationId =
    input.allocationId && BLUEPRINT_LIMITS.OPTIONAL_ID_PATTERN.test(input.allocationId)
      ? input.allocationId.slice(0, BLUEPRINT_LIMITS.ID_MAX_LEN)
      : '';
  const cleanRecurringId =
    input.recurringId && BLUEPRINT_LIMITS.OPTIONAL_ID_PATTERN.test(input.recurringId)
      ? input.recurringId.slice(0, BLUEPRINT_LIMITS.ID_MAX_LEN)
      : '';

  try {
    await updateDoc(doc(db, 'users', uid, 'transactions', txId), {
      title: cleanTitle,
      amount: cleanAmount,
      type: input.type,
      category: input.category,
      date: cleanDate,
      monthKey: cleanMonthKey,
      paymentMethod: input.paymentMethod,
      note: sanitizeString(input.note || '', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      allocationId: cleanAllocationId,
      recurringId: cleanRecurringId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTransaction(uid: string, txId: string): Promise<void> {
  const path = `users/${uid}/transactions/${txId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'transactions', txId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertCategoryBudget(
  uid: string,
  category: ExpenseCategory,
  monthlyLimit: number,
  warningThreshold: number,
  existingId?: string
): Promise<void> {
  const budgetId = existingId || `budget_${category}`;
  const path = `users/${uid}/budgets/${budgetId}`;
  const safeLimit = clampNumber(Number(monthlyLimit), 1, BLUEPRINT_LIMITS.MAX_AMOUNT);
  const safeThreshold = clampNumber(
    Math.round(warningThreshold),
    BLUEPRINT_LIMITS.MIN_THRESHOLD,
    BLUEPRINT_LIMITS.MAX_THRESHOLD
  );

  try {
    if (existingId) {
      await updateDoc(doc(db, 'users', uid, 'budgets', budgetId), {
        monthlyLimit: safeLimit,
        warningThreshold: safeThreshold,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'users', uid, 'budgets', budgetId), {
        ownerId: uid,
        category,
        monthlyLimit: safeLimit,
        warningThreshold: safeThreshold,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCategoryBudget(uid: string, budgetId: string): Promise<void> {
  const path = `users/${uid}/budgets/${budgetId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'budgets', budgetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface AllocationInput {
  name: string;
  purpose: AllocationPurpose;
  year: number;
  targetAnnualAmount: number;
  monthlyPlannedAmount: number;
  dueDay: number;
  status: AllocationStatus;
  note: string;
}

export async function createAllocation(uid: string, input: AllocationInput): Promise<string> {
  const id = generateCleanId('alloc');
  const path = `users/${uid}/allocations/${id}`;
  const cleanName = sanitizeString(input.name, BLUEPRINT_LIMITS.ALLOCATION_NAME_MAX_LEN);
  if (!cleanName) throw new Error('กรุณาระบุชื่อแผนการเบิกจ่าย');

  try {
    await setDoc(doc(db, 'users', uid, 'allocations', id), {
      ownerId: uid,
      name: cleanName,
      purpose: input.purpose,
      year: clampNumber(Math.round(input.year), 2020, 2100),
      targetAnnualAmount: clampNumber(Number(input.targetAnnualAmount), 1, BLUEPRINT_LIMITS.MAX_AMOUNT),
      monthlyPlannedAmount: clampNumber(Number(input.monthlyPlannedAmount), 0, BLUEPRINT_LIMITS.MAX_AMOUNT),
      disbursedAmount: 0,
      dueDay: clampNumber(Math.round(input.dueDay), 1, 31),
      status: input.status === 'completed' ? 'active' : input.status,
      note: sanitizeString(input.note || '', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAllocation(
  uid: string,
  allocationId: string,
  input: AllocationInput
): Promise<void> {
  const path = `users/${uid}/allocations/${allocationId}`;
  const cleanName = sanitizeString(input.name, BLUEPRINT_LIMITS.ALLOCATION_NAME_MAX_LEN);
  if (!cleanName) throw new Error('กรุณาระบุชื่อแผนการเบิกจ่าย');

  try {
    await updateDoc(doc(db, 'users', uid, 'allocations', allocationId), {
      name: cleanName,
      purpose: input.purpose,
      year: clampNumber(Math.round(input.year), 2020, 2100),
      targetAnnualAmount: clampNumber(Number(input.targetAnnualAmount), 1, BLUEPRINT_LIMITS.MAX_AMOUNT),
      monthlyPlannedAmount: clampNumber(Number(input.monthlyPlannedAmount), 0, BLUEPRINT_LIMITS.MAX_AMOUNT),
      dueDay: clampNumber(Math.round(input.dueDay), 1, 31),
      status: input.status,
      note: sanitizeString(input.note || '', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordAllocationDisbursement(
  uid: string,
  allocation: AnnualAllocationRecord,
  amount: number,
  date: string,
  paymentMethod: PaymentMethod,
  note: string
): Promise<void> {
  const txId = generateCleanId('tx');
  const path = `users/${uid}/allocations/${allocation.id}`;
  const safeAmount = clampNumber(Number(amount), 0.01, BLUEPRINT_LIMITS.MAX_AMOUNT);
  const cleanDate = BLUEPRINT_LIMITS.DATE_PATTERN.test(date) ? date : getTodayISO();
  const newDisbursed = clampNumber(
    allocation.disbursedAmount + safeAmount,
    0,
    BLUEPRINT_LIMITS.MAX_AMOUNT
  );
  const nextStatus: AllocationStatus =
    newDisbursed >= allocation.targetAnnualAmount ? 'completed' : allocation.status;
  const purposeMeta = getPurposeMeta(allocation.purpose);

  try {
    const batch = writeBatch(db);
    const allocRef = doc(db, 'users', uid, 'allocations', allocation.id);
    const txRef = doc(db, 'users', uid, 'transactions', txId);

    batch.update(allocRef, {
      disbursedAmount: newDisbursed,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });

    batch.set(txRef, {
      ownerId: uid,
      title: sanitizeString(`เบิกจ่าย: ${allocation.name}`, BLUEPRINT_LIMITS.TITLE_MAX_LEN),
      amount: safeAmount,
      type: 'expense' as TransactionType,
      category: purposeMeta.defaultCategory,
      date: cleanDate,
      monthKey: cleanDate.slice(0, 7),
      paymentMethod,
      note: sanitizeString(note || `บันทึกจากแผนเบิกจ่ายประจำปี ${allocation.year}`, BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      allocationId: allocation.id,
      recurringId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAllocation(uid: string, allocationId: string): Promise<void> {
  const path = `users/${uid}/allocations/${allocationId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'allocations', allocationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface RecurringInput {
  title: string;
  amount: number;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  frequency: RecurringFrequency;
  dueDay: number;
  isActive: boolean;
  note: string;
}

export async function createRecurringExpense(uid: string, input: RecurringInput): Promise<string> {
  const id = generateCleanId('rec');
  const path = `users/${uid}/recurring/${id}`;
  const cleanTitle = sanitizeString(input.title, BLUEPRINT_LIMITS.TITLE_MAX_LEN);
  if (!cleanTitle) throw new Error('กรุณาระบุชื่อค่าใช้จ่ายประจำ');

  try {
    await setDoc(doc(db, 'users', uid, 'recurring', id), {
      ownerId: uid,
      title: cleanTitle,
      amount: clampNumber(Number(input.amount), 0.01, BLUEPRINT_LIMITS.MAX_AMOUNT),
      category: input.category,
      paymentMethod: input.paymentMethod,
      frequency: input.frequency,
      dueDay: clampNumber(Math.round(input.dueDay), 1, 31),
      isActive: Boolean(input.isActive),
      lastLoggedMonth: '',
      note: sanitizeString(input.note || '', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateRecurringExpense(
  uid: string,
  recurringId: string,
  input: RecurringInput
): Promise<void> {
  const path = `users/${uid}/recurring/${recurringId}`;
  const cleanTitle = sanitizeString(input.title, BLUEPRINT_LIMITS.TITLE_MAX_LEN);
  if (!cleanTitle) throw new Error('กรุณาระบุชื่อค่าใช้จ่ายประจำ');

  try {
    await updateDoc(doc(db, 'users', uid, 'recurring', recurringId), {
      title: cleanTitle,
      amount: clampNumber(Number(input.amount), 0.01, BLUEPRINT_LIMITS.MAX_AMOUNT),
      category: input.category,
      paymentMethod: input.paymentMethod,
      frequency: input.frequency,
      dueDay: clampNumber(Math.round(input.dueDay), 1, 31),
      isActive: Boolean(input.isActive),
      note: sanitizeString(input.note || '', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleRecurringActive(
  uid: string,
  recurringId: string,
  isActive: boolean
): Promise<void> {
  const path = `users/${uid}/recurring/${recurringId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'recurring', recurringId), {
      isActive,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function logRecurringForMonth(
  uid: string,
  item: RecurringExpenseRecord,
  targetMonthKey?: string
): Promise<void> {
  const monthKey = targetMonthKey && BLUEPRINT_LIMITS.MONTH_PATTERN.test(targetMonthKey)
    ? targetMonthKey
    : getCurrentMonthKey();
  const [yStr, mStr] = monthKey.split('-');
  const maxDayInMonth = new Date(Number(yStr), Number(mStr), 0).getDate();
  const day = String(Math.min(item.dueDay, maxDayInMonth)).padStart(2, '0');
  const dateStr = `${monthKey}-${day}`;
  const txId = generateCleanId('tx');
  const path = `users/${uid}/recurring/${item.id}`;

  try {
    const batch = writeBatch(db);
    const recRef = doc(db, 'users', uid, 'recurring', item.id);
    const txRef = doc(db, 'users', uid, 'transactions', txId);

    batch.update(recRef, {
      lastLoggedMonth: monthKey,
      updatedAt: serverTimestamp(),
    });

    batch.set(txRef, {
      ownerId: uid,
      title: sanitizeString(item.title, BLUEPRINT_LIMITS.TITLE_MAX_LEN),
      amount: item.amount,
      type: 'expense' as TransactionType,
      category: item.category,
      date: dateStr,
      monthKey,
      paymentMethod: item.paymentMethod,
      note: sanitizeString(item.note || 'บันทึกอัตโนมัติจากรายการค่าใช้จ่ายประจำ', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      allocationId: '',
      recurringId: item.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteRecurringExpense(uid: string, recurringId: string): Promise<void> {
  const path = `users/${uid}/recurring/${recurringId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'recurring', recurringId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface InvestmentInput {
  assetType: AssetType;
  symbol: string;
  assetName: string;
  investedAmount: number;
  entryPriceThb: number;
  purchaseDate: string;
  note: string;
}

export async function createInvestmentPosition(
  uid: string,
  input: InvestmentInput
): Promise<string> {
  const id = generateCleanId('inv');
  const path = `users/${uid}/investments/${id}`;
  const cleanSymbol = input.symbol.trim().toUpperCase().slice(0, BLUEPRINT_LIMITS.SYMBOL_MAX_LEN);
  if (!BLUEPRINT_LIMITS.SYMBOL_PATTERN.test(cleanSymbol)) {
    throw new Error('สัญลักษณ์สินทรัพย์ไม่ถูกต้อง');
  }
  const cleanName = sanitizeString(input.assetName, BLUEPRINT_LIMITS.ASSET_NAME_MAX_LEN) || cleanSymbol;
  const safeInvested = clampNumber(Number(input.investedAmount), 0.01, BLUEPRINT_LIMITS.MAX_AMOUNT);
  const safeEntryPrice = clampNumber(Number(input.entryPriceThb), 0.000001, BLUEPRINT_LIMITS.MAX_AMOUNT);
  const safeUnits = clampNumber(
    Number((safeInvested / safeEntryPrice).toFixed(8)),
    0.00000001,
    BLUEPRINT_LIMITS.MAX_AMOUNT
  );
  const cleanDate = BLUEPRINT_LIMITS.DATE_PATTERN.test(input.purchaseDate)
    ? input.purchaseDate
    : getTodayISO();

  try {
    await setDoc(doc(db, 'users', uid, 'investments', id), {
      ownerId: uid,
      assetType: input.assetType,
      symbol: cleanSymbol,
      assetName: cleanName,
      investedAmount: safeInvested,
      entryPriceThb: safeEntryPrice,
      units: safeUnits,
      purchaseDate: cleanDate,
      note: sanitizeString(input.note || '', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateInvestmentPosition(
  uid: string,
  investmentId: string,
  input: Omit<InvestmentInput, 'assetType' | 'symbol'>
): Promise<void> {
  const path = `users/${uid}/investments/${investmentId}`;
  const cleanName = sanitizeString(input.assetName, BLUEPRINT_LIMITS.ASSET_NAME_MAX_LEN);
  if (!cleanName) throw new Error('กรุณาระบุชื่อสินทรัพย์');
  const safeInvested = clampNumber(Number(input.investedAmount), 0.01, BLUEPRINT_LIMITS.MAX_AMOUNT);
  const safeEntryPrice = clampNumber(Number(input.entryPriceThb), 0.000001, BLUEPRINT_LIMITS.MAX_AMOUNT);
  const safeUnits = clampNumber(
    Number((safeInvested / safeEntryPrice).toFixed(8)),
    0.00000001,
    BLUEPRINT_LIMITS.MAX_AMOUNT
  );
  const cleanDate = BLUEPRINT_LIMITS.DATE_PATTERN.test(input.purchaseDate)
    ? input.purchaseDate
    : getTodayISO();

  try {
    await updateDoc(doc(db, 'users', uid, 'investments', investmentId), {
      assetName: cleanName,
      investedAmount: safeInvested,
      entryPriceThb: safeEntryPrice,
      units: safeUnits,
      purchaseDate: cleanDate,
      note: sanitizeString(input.note || '', BLUEPRINT_LIMITS.NOTE_MAX_LEN),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteInvestmentPosition(uid: string, investmentId: string): Promise<void> {
  const path = `users/${uid}/investments/${investmentId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'investments', investmentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Optional starter dataset triggered explicitly by user click in empty state
export async function seedStarterWorkspace(uid: string): Promise<void> {
  const today = new Date();
  const year = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const mk = (m: number) => `${year}-${pad(m)}`;
  const prevM1 = currentMonth > 1 ? currentMonth - 1 : currentMonth;
  const prevM2 = currentMonth > 2 ? currentMonth - 2 : prevM1;

  const path = `users/${uid}/starter_batch`;
  try {
    const batch = writeBatch(db);

    const allocDormId = generateCleanId('alloc');
    const allocDebtId = generateCleanId('alloc');
    const allocEmergencyId = generateCleanId('alloc');

    const allocCol = collection(db, 'users', uid, 'allocations');
    batch.set(doc(allocCol, allocDormId), {
      ownerId: uid,
      name: 'ค่าหอพักและส่วนกลางประจำปี',
      purpose: 'dorm_rent',
      year,
      targetAnnualAmount: 78000,
      monthlyPlannedAmount: 6500,
      disbursedAmount: 6500 * Math.min(currentMonth, 10),
      dueDay: 5,
      status: 'active',
      note: 'โอนทุกวันที่ 5 ของเดือนรวมค่าส่วนกลาง',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(allocCol, allocDebtId), {
      ownerId: uid,
      name: 'แผนปิดหนี้บัตร / ผ่อนชำระประจำปี',
      purpose: 'debt_repayment',
      year,
      targetAnnualAmount: 48000,
      monthlyPlannedAmount: 4000,
      disbursedAmount: 4000 * Math.min(currentMonth, 9),
      dueDay: 25,
      status: 'active',
      note: 'ตั้งเป้าปิดยอดก่อนสิ้นปี',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(allocCol, allocEmergencyId), {
      ownerId: uid,
      name: 'สำรองกองทุนฉุกเฉิน 6 เดือน',
      purpose: 'emergency_fund',
      year,
      targetAnnualAmount: 60000,
      monthlyPlannedAmount: 5000,
      disbursedAmount: 35000,
      dueDay: 1,
      status: 'active',
      note: 'แยกบัญชีออมทรัพย์ดอกเบี้ยสูง',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const recCol = collection(db, 'users', uid, 'recurring');
    const recItems = [
      {
        title: 'ค่าเช่าหอพักรายเดือน',
        amount: 6500,
        category: 'housing' as ExpenseCategory,
        paymentMethod: 'bank_transfer' as PaymentMethod,
        frequency: 'monthly' as RecurringFrequency,
        dueDay: 5,
        note: 'เลขห้อง 408',
      },
      {
        title: 'ค่าอินเทอร์เน็ตและมือถือ',
        amount: 699,
        category: 'utilities' as ExpenseCategory,
        paymentMethod: 'promptpay' as PaymentMethod,
        frequency: 'monthly' as RecurringFrequency,
        dueDay: 12,
        note: 'แพ็กเกจรายเดือน',
      },
      {
        title: 'iCloud+ 200GB & บริการคลาวด์',
        amount: 99,
        category: 'entertainment' as ExpenseCategory,
        paymentMethod: 'credit_card' as PaymentMethod,
        frequency: 'monthly' as RecurringFrequency,
        dueDay: 18,
        note: 'ตัดบัตรอัตโนมัติ',
      },
      {
        title: 'ผ่อนชำระหนี้รายเดือน',
        amount: 4000,
        category: 'debt' as ExpenseCategory,
        paymentMethod: 'bank_transfer' as PaymentMethod,
        frequency: 'monthly' as RecurringFrequency,
        dueDay: 25,
        note: 'ค่างวดประจำเดือน',
      },
    ];

    for (const r of recItems) {
      batch.set(doc(recCol, generateCleanId('rec')), {
        ownerId: uid,
        ...r,
        isActive: true,
        lastLoggedMonth: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const budgetCol = collection(db, 'users', uid, 'budgets');
    const defaultBudgets: { category: ExpenseCategory; limit: number; threshold: number }[] = [
      { category: 'food', limit: 7500, threshold: 80 },
      { category: 'housing', limit: 7000, threshold: 90 },
      { category: 'debt', limit: 4500, threshold: 85 },
      { category: 'transport', limit: 2500, threshold: 80 },
      { category: 'shopping', limit: 3000, threshold: 80 },
    ];
    for (const b of defaultBudgets) {
      batch.set(doc(budgetCol, `budget_${b.category}`), {
        ownerId: uid,
        category: b.category,
        monthlyLimit: b.limit,
        warningThreshold: b.threshold,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const txCol = collection(db, 'users', uid, 'transactions');
    const sampleTxs: {
      title: string;
      amount: number;
      type: TransactionType;
      category: TransactionCategory;
      date: string;
      paymentMethod: PaymentMethod;
      note: string;
    }[] = [
      { title: 'เงินเดือนประจำเดือน', amount: 38000, type: 'income', category: 'salary', date: `${mk(currentMonth)}-01`, paymentMethod: 'bank_transfer', note: 'รายได้หลัก' },
      { title: 'งานออกแบบ UX ฟรีแลนซ์', amount: 8500, type: 'income', category: 'freelance', date: `${mk(currentMonth)}-08`, paymentMethod: 'promptpay', note: 'โปรเจกต์เสริม' },
      { title: 'ค่าหอพักประจำเดือน', amount: 6500, type: 'expense', category: 'housing', date: `${mk(currentMonth)}-05`, paymentMethod: 'bank_transfer', note: 'ชำระตรงเวลา' },
      { title: 'ค่าอาหารและกาแฟสัปดาห์แรก', amount: 2450, type: 'expense', category: 'food', date: `${mk(currentMonth)}-07`, paymentMethod: 'promptpay', note: 'อาหารกลางวัน + กาแฟ' },
      { title: 'ค่าน้ำและค่าไฟฟ้า', amount: 1480, type: 'expense', category: 'utilities', date: `${mk(currentMonth)}-09`, paymentMethod: 'promptpay', note: 'บิลประจำเดือน' },
      { title: 'ค่าเดินทาง BTS / น้ำมัน', amount: 1650, type: 'expense', category: 'transport', date: `${mk(currentMonth)}-11`, paymentMethod: 'e_wallet', note: 'เติมบัตรเดินทาง' },
      { title: 'ชำระงวดหนี้ประจำเดือน', amount: 4000, type: 'expense', category: 'debt', date: `${mk(currentMonth)}-14`, paymentMethod: 'bank_transfer', note: 'ตัดเงินต้นตามแผน' },
      { title: 'อาหารและซูเปอร์มาร์เก็ต', amount: 3920, type: 'expense', category: 'food', date: `${mk(currentMonth)}-16`, paymentMethod: 'credit_card', note: 'ของสดและมื้อเย็น' },
      { title: 'ซื้อของใช้จำเป็นและเสื้อผ้า', amount: 2680, type: 'expense', category: 'shopping', date: `${mk(currentMonth)}-18`, paymentMethod: 'credit_card', note: 'ใกล้เพดานหมวดช้อปปิ้ง' },
      // Previous month data for real trend comparison
      { title: 'เงินเดือนประจำเดือน', amount: 38000, type: 'income', category: 'salary', date: `${mk(prevM1)}-01`, paymentMethod: 'bank_transfer', note: '' },
      { title: 'ค่าหอพัก', amount: 6500, type: 'expense', category: 'housing', date: `${mk(prevM1)}-05`, paymentMethod: 'bank_transfer', note: '' },
      { title: 'ชำระหนี้ประจำเดือน', amount: 4000, type: 'expense', category: 'debt', date: `${mk(prevM1)}-25`, paymentMethod: 'bank_transfer', note: '' },
      { title: 'ค่าอาหารรวมเดือนก่อน', amount: 6800, type: 'expense', category: 'food', date: `${mk(prevM1)}-20`, paymentMethod: 'promptpay', note: '' },
      { title: 'ค่าน้ำ ค่าไฟ เน็ต', amount: 2100, type: 'expense', category: 'utilities', date: `${mk(prevM1)}-15`, paymentMethod: 'promptpay', note: '' },
      // Two months ago
      { title: 'เงินเดือนประจำเดือน', amount: 38000, type: 'income', category: 'salary', date: `${mk(prevM2)}-01`, paymentMethod: 'bank_transfer', note: '' },
      { title: 'ค่าหอพัก', amount: 6500, type: 'expense', category: 'housing', date: `${mk(prevM2)}-05`, paymentMethod: 'bank_transfer', note: '' },
      { title: 'ค่าอาหารและเดินทาง', amount: 7900, type: 'expense', category: 'food', date: `${mk(prevM2)}-19`, paymentMethod: 'promptpay', note: '' },
      { title: 'ชำระหนี้ประจำเดือน', amount: 4000, type: 'expense', category: 'debt', date: `${mk(prevM2)}-25`, paymentMethod: 'bank_transfer', note: '' },
    ];

    for (const tx of sampleTxs) {
      batch.set(doc(txCol, generateCleanId('tx')), {
        ownerId: uid,
        ...tx,
        monthKey: tx.date.slice(0, 7),
        allocationId: '',
        recurringId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
