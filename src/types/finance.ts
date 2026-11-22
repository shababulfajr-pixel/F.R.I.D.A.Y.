export type CurrencyCode = 'THB' | 'USD' | 'EUR' | 'JPY';

export type TransactionType = 'income' | 'expense';

export type IncomeCategory = 'salary' | 'freelance' | 'investment' | 'other_income';

export type ExpenseCategory =
  | 'food'
  | 'housing'
  | 'debt'
  | 'transport'
  | 'utilities'
  | 'health'
  | 'shopping'
  | 'entertainment'
  | 'education'
  | 'savings'
  | 'other_expense';

export type TransactionCategory = IncomeCategory | ExpenseCategory;

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'promptpay'
  | 'credit_card'
  | 'e_wallet';

export type AllocationPurpose =
  | 'dorm_rent'
  | 'debt_repayment'
  | 'education'
  | 'emergency_fund'
  | 'insurance_tax'
  | 'family_support'
  | 'investment_goal'
  | 'other_plan';

export type AllocationStatus = 'active' | 'paused' | 'completed';

export type RecurringFrequency = 'monthly' | 'weekly' | 'yearly';

export type AppSection =
  | 'dashboard'
  | 'ledger'
  | 'investments'
  | 'allocations'
  | 'recurring'
  | 'budgets'
  | 'reports';

export type AssetType = 'gold' | 'crypto' | 'stock';

export interface InvestmentPositionRecord {
  id: string;
  ownerId: string;
  assetType: AssetType;
  symbol: string;
  assetName: string;
  investedAmount: number;
  entryPriceThb: number;
  units: number;
  purchaseDate: string; // YYYY-MM-DD
  note: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface MarketQuote {
  symbol: string;
  priceThb: number;
  priceNative: number;
  nativeCurrency: string;
  changePercent: number;
  previousCloseThb: number;
  usdThbRate: number;
  updatedAt: string;
  source: string;
}

export interface MarketChartPoint {
  timestamp: number;
  date: string;
  label: string;
  priceThb: number;
  priceNative: number;
}

export interface MarketChartData {
  symbol: string;
  range: string;
  priceThb: number;
  priceNative: number;
  nativeCurrency: string;
  changePercent: number;
  highThb: number;
  lowThb: number;
  usdThbRate: number;
  updatedAt: string;
  series: MarketChartPoint[];
}

export interface CatalogAsset {
  symbol: string;
  shortLabel: string;
  name: string;
  assetType: AssetType;
  unitLabel: string;
  color: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  currency: CurrencyCode;
  monthlyBudgetLimit: number;
  alertThresholdPercent: number;
  notificationsEnabled: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface TransactionRecord {
  id: string;
  ownerId: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  date: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  paymentMethod: PaymentMethod;
  note: string;
  allocationId: string;
  recurringId: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface CategoryBudgetRecord {
  id: string;
  ownerId: string;
  category: ExpenseCategory;
  monthlyLimit: number;
  warningThreshold: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface AnnualAllocationRecord {
  id: string;
  ownerId: string;
  name: string;
  purpose: AllocationPurpose;
  year: number;
  targetAnnualAmount: number;
  monthlyPlannedAmount: number;
  disbursedAmount: number;
  dueDay: number;
  status: AllocationStatus;
  note: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface RecurringExpenseRecord {
  id: string;
  ownerId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  frequency: RecurringFrequency;
  dueDay: number;
  isActive: boolean;
  lastLoggedMonth: string; // "" or YYYY-MM
  note: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface BudgetAlertItem {
  id: string;
  scope: 'overall' | 'category';
  label: string;
  spent: number;
  limit: number;
  percent: number;
  threshold: number;
  severity: 'warning' | 'exceeded';
}

export interface ToastNotice {
  id: string;
  title: string;
  description?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

// Blueprint-synchronized validation constants (matching firebase-blueprint.json verbatim)
export const BLUEPRINT_LIMITS = {
  ID_MAX_LEN: 128,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  OPTIONAL_ID_PATTERN: /^[a-zA-Z0-9_-]*$/,
  DISPLAY_NAME_MAX_LEN: 120,
  EMAIL_MAX_LEN: 254,
  TITLE_MAX_LEN: 140,
  ALLOCATION_NAME_MAX_LEN: 120,
  ASSET_NAME_MAX_LEN: 120,
  SYMBOL_MAX_LEN: 20,
  SYMBOL_PATTERN: /^[A-Z0-9.=^-]+$/,
  NOTE_MAX_LEN: 400,
  DATE_PATTERN: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  MONTH_PATTERN: /^[0-9]{4}-[0-9]{2}$/,
  OPTIONAL_MONTH_PATTERN: /^$|^([0-9]{4}-[0-9]{2})$/,
  MAX_AMOUNT: 1_000_000_000,
  MIN_THRESHOLD: 50,
  MAX_THRESHOLD: 100,
} as const;

export const INCOME_CATEGORIES: { value: IncomeCategory; label: string; color: string }[] = [
  { value: 'salary', label: 'เงินเดือน / รายได้ประจำ', color: '#16A34A' },
  { value: 'freelance', label: 'รายได้เสริม / ฟรีแลนซ์', color: '#059669' },
  { value: 'investment', label: 'ปันผล / ดอกเบี้ย / ลงทุน', color: '#0D9488' },
  { value: 'other_income', label: 'รายรับอื่นๆ', color: '#0284C7' },
];

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; color: string }[] = [
  { value: 'housing', label: 'ค่าหอพัก / ที่อยู่อาศัย', color: '#0071E3' },
  { value: 'debt', label: 'ชำระหนี้ / ผ่อนชำระ', color: '#DC2626' },
  { value: 'food', label: 'อาหารและเครื่องดื่ม', color: '#D97706' },
  { value: 'utilities', label: 'ค่าน้ำ / ค่าไฟ / อินเทอร์เน็ต', color: '#0284C7' },
  { value: 'transport', label: 'การเดินทาง / น้ำมัน', color: '#4F46E5' },
  { value: 'education', label: 'การศึกษา / คอร์สเรียน', color: '#2563EB' },
  { value: 'health', label: 'สุขภาพ / ประกัน', color: '#0D9488' },
  { value: 'shopping', label: 'ของใช้ส่วนตัว / ช้อปปิ้ง', color: '#7C3AED' },
  { value: 'entertainment', label: 'บันเทิง / สมาชิกรายเดือน', color: '#DB2777' },
  { value: 'savings', label: 'ออมเงิน / กองทุน', color: '#16A34A' },
  { value: 'other_expense', label: 'รายจ่ายอื่นๆ', color: '#64748B' },
];

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'promptpay', label: 'พร้อมเพย์ (PromptPay)' },
  { value: 'bank_transfer', label: 'โอนผ่านธนาคาร' },
  { value: 'cash', label: 'เงินสด' },
  { value: 'credit_card', label: 'บัตรเครดิต / เดบิต' },
  { value: 'e_wallet', label: 'E-Wallet / Apple Pay' },
];

export const ALLOCATION_PURPOSES: {
  value: AllocationPurpose;
  label: string;
  defaultCategory: ExpenseCategory;
  color: string;
}[] = [
  { value: 'dorm_rent', label: 'จ่ายค่าหอพัก / ค่าเช่า', defaultCategory: 'housing', color: '#0071E3' },
  { value: 'debt_repayment', label: 'ชำระหนี้ / ผ่อนชำระ', defaultCategory: 'debt', color: '#DC2626' },
  { value: 'education', label: 'ค่าเทอม / การศึกษา', defaultCategory: 'education', color: '#2563EB' },
  { value: 'emergency_fund', label: 'กองทุนฉุกเฉิน', defaultCategory: 'savings', color: '#16A34A' },
  { value: 'insurance_tax', label: 'ประกันชีวิต / ภาษีรายปี', defaultCategory: 'health', color: '#0D9488' },
  { value: 'family_support', label: 'ดูแลครอบครัว', defaultCategory: 'other_expense', color: '#D97706' },
  { value: 'investment_goal', label: 'เป้าหมายลงทุน', defaultCategory: 'savings', color: '#059669' },
  { value: 'other_plan', label: 'แผนเบิกจ่ายอื่นๆ', defaultCategory: 'other_expense', color: '#64748B' },
];

export const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: 'monthly', label: 'รายเดือน' },
  { value: 'weekly', label: 'รายสัปดาห์' },
  { value: 'yearly', label: 'รายปี' },
];

export const CURRENCIES: { value: CurrencyCode; symbol: string; label: string }[] = [
  { value: 'THB', symbol: '฿', label: 'บาทไทย (THB)' },
  { value: 'USD', symbol: '$', label: 'ดอลลาร์สหรัฐ (USD)' },
  { value: 'EUR', symbol: '€', label: 'ยูโร (EUR)' },
  { value: 'JPY', symbol: '¥', label: 'เยนญี่ปุ่น (JPY)' },
];

export const ASSET_TYPE_META: Record<AssetType, { label: string; color: string }> = {
  gold: { label: 'ทองคำ', color: '#D97706' },
  crypto: { label: 'คริปโท', color: '#7C3AED' },
  stock: { label: 'หุ้น', color: '#0071E3' },
};

export const MARKET_CATALOG: CatalogAsset[] = [
  // Gold
  { symbol: 'GOLD-THB', shortLabel: 'ทองคำ 96.5%', name: 'ทองคำแท่ง 96.5% (ต่อบาททอง)', assetType: 'gold', unitLabel: 'บาททอง', color: '#D97706' },
  { symbol: 'GC=F', shortLabel: 'Gold Spot', name: 'Gold Futures Spot (XAU / oz)', assetType: 'gold', unitLabel: 'ออนซ์', color: '#CA8A04' },
  // Crypto
  { symbol: 'BTC-USD', shortLabel: 'BTC', name: 'Bitcoin (BTC)', assetType: 'crypto', unitLabel: 'BTC', color: '#F59E0B' },
  { symbol: 'ETH-USD', shortLabel: 'ETH', name: 'Ethereum (ETH)', assetType: 'crypto', unitLabel: 'ETH', color: '#6366F1' },
  { symbol: 'SOL-USD', shortLabel: 'SOL', name: 'Solana (SOL)', assetType: 'crypto', unitLabel: 'SOL', color: '#14B8A6' },
  { symbol: 'BNB-USD', shortLabel: 'BNB', name: 'BNB (BNB)', assetType: 'crypto', unitLabel: 'BNB', color: '#EAB308' },
  { symbol: 'XRP-USD', shortLabel: 'XRP', name: 'XRP (XRP)', assetType: 'crypto', unitLabel: 'XRP', color: '#0284C7' },
  { symbol: 'DOGE-USD', shortLabel: 'DOGE', name: 'Dogecoin (DOGE)', assetType: 'crypto', unitLabel: 'DOGE', color: '#D97706' },
  // US & Global Stocks / ETFs
  { symbol: 'AAPL', shortLabel: 'AAPL', name: 'Apple Inc. (AAPL)', assetType: 'stock', unitLabel: 'หุ้น', color: '#0071E3' },
  { symbol: 'NVDA', shortLabel: 'NVDA', name: 'NVIDIA Corp. (NVDA)', assetType: 'stock', unitLabel: 'หุ้น', color: '#16A34A' },
  { symbol: 'TSLA', shortLabel: 'TSLA', name: 'Tesla Inc. (TSLA)', assetType: 'stock', unitLabel: 'หุ้น', color: '#DC2626' },
  { symbol: 'MSFT', shortLabel: 'MSFT', name: 'Microsoft Corp. (MSFT)', assetType: 'stock', unitLabel: 'หุ้น', color: '#2563EB' },
  { symbol: 'GOOGL', shortLabel: 'GOOGL', name: 'Alphabet Inc. (GOOGL)', assetType: 'stock', unitLabel: 'หุ้น', color: '#0284C7' },
  { symbol: 'SPY', shortLabel: 'S&P 500', name: 'SPDR S&P 500 ETF (SPY)', assetType: 'stock', unitLabel: 'หน่วย', color: '#0D9488' },
  { symbol: 'QQQ', shortLabel: 'Nasdaq 100', name: 'Invesco QQQ Trust (QQQ)', assetType: 'stock', unitLabel: 'หน่วย', color: '#4F46E5' },
  // Thai Stocks (SET)
  { symbol: 'PTT.BK', shortLabel: 'PTT', name: 'ปตท. (PTT.BK)', assetType: 'stock', unitLabel: 'หุ้น', color: '#0284C7' },
  { symbol: 'AOT.BK', shortLabel: 'AOT', name: 'ท่าอากาศยานไทย (AOT.BK)', assetType: 'stock', unitLabel: 'หุ้น', color: '#0071E3' },
  { symbol: 'DELTA.BK', shortLabel: 'DELTA', name: 'เดลต้า อีเลคโทรนิคส์ (DELTA.BK)', assetType: 'stock', unitLabel: 'หุ้น', color: '#0891B2' },
  { symbol: 'SCB.BK', shortLabel: 'SCB', name: 'เอสซีบี เอกซ์ (SCB.BK)', assetType: 'stock', unitLabel: 'หุ้น', color: '#7C3AED' },
  { symbol: 'CPALL.BK', shortLabel: 'CPALL', name: 'ซีพี ออลล์ (CPALL.BK)', assetType: 'stock', unitLabel: 'หุ้น', color: '#16A34A' },
];

export function getCatalogAsset(symbol: string): CatalogAsset | undefined {
  return MARKET_CATALOG.find((a) => a.symbol === symbol);
}

export function getAssetUnitLabel(symbol: string, assetType: AssetType): string {
  const found = getCatalogAsset(symbol);
  if (found) return found.unitLabel;
  if (assetType === 'gold') return 'บาททอง';
  if (assetType === 'crypto') return symbol.replace('-USD', '');
  return 'หุ้น';
}

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export function getCategoryLabel(cat: string): string {
  return ALL_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

export function getCategoryColor(cat: string): string {
  return ALL_CATEGORIES.find((c) => c.value === cat)?.color ?? '#64748B';
}

export function getPaymentMethodLabel(pm: PaymentMethod): string {
  return PAYMENT_METHODS.find((m) => m.value === pm)?.label ?? pm;
}

export function getPurposeMeta(purpose: AllocationPurpose) {
  return ALLOCATION_PURPOSES.find((p) => p.value === purpose) ?? ALLOCATION_PURPOSES[ALLOCATION_PURPOSES.length - 1];
}

export function getFrequencyLabel(freq: RecurringFrequency): string {
  return FREQUENCIES.find((f) => f.value === freq)?.label ?? freq;
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'THB', compact = false): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const symbol = CURRENCIES.find((c) => c.value === currency)?.symbol ?? '฿';
  if (compact && Math.abs(safe) >= 1_000_000) {
    return `${symbol}${(safe / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(safe) >= 100_000) {
    return `${symbol}${(safe / 1_000).toFixed(1)}k`;
  }
  const formatted = new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: currency === 'JPY' ? 0 : 0,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(Math.abs(safe));
  return safe < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function formatMonthKeyThai(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

export function formatDateThai(dateStr: string): string {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return dateStr;
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey(): string {
  return getTodayISO().slice(0, 7);
}

export function sanitizeString(val: string, maxLen: number): string {
  return val.trim().slice(0, maxLen);
}

export function clampNumber(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}
