import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BellRing, CalendarClock, Cloud, Moon, Sun } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { useTheme } from '../context/ThemeContext';

const HERO_ART = '/src/assets/images/aureo_liquid_glass_hero_1795328601337.jpg';

export function AuthScreen() {
  const { signInWithGoogle, authError } = useFinance();
  const { theme, toggleTheme } = useTheme();
  const [signingIn, setSigningIn] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const handleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col glass-backdrop-field text-[#1D1D1F] dark:text-[#F5F5F7]">
      {/* Minimal 3-Zone Apple Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-8">
        <span className="text-[22px] font-semibold tracking-[-0.03em] text-[#1D1D1F] dark:text-white whitespace-nowrap shrink-0">
          F.R.I.D.A.Y.
        </span>

        <div className="hidden md:flex items-center gap-6 text-[13px] text-[#6E6E73] dark:text-[#A1A1A6]">
          <span className="whitespace-nowrap shrink-0">การเงินส่วนบุคคล</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">ซิงค์เรียลไทม์ทุกอุปกรณ์</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">ทำงานได้แม้ออฟไลน์</span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full apple-glass text-xs font-medium text-[#1D1D1F] dark:text-[#F5F5F7] hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer whitespace-nowrap shrink-0"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span>{theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}</span>
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
        >
          {/* Left Floating Liquid Glass Auth Sheet */}
          <section className="lg:col-span-6 apple-glass-hero rounded-[32px] p-8 md:p-11 flex flex-col justify-between gap-9">
            <div className="space-y-4">
              <p className="text-[13px] font-medium text-[#0071E3] dark:text-[#0A84FF]">
                F.R.I.D.A.Y. Personal Finance
              </p>
              <h1 className="text-3xl sm:text-[40px] font-semibold tracking-[-0.032em] text-[#1D1D1F] dark:text-white leading-[1.15]">
                ความชัดเจนทางการเงิน ในทุกจังหวะของชีวิต
              </h1>
              <p className="text-[15px] text-[#515154] dark:text-[#A1A1A6] leading-relaxed">
                ติดตามรายรับ-รายจ่ายแบบเรียลไทม์ วางแผนเบิกจ่ายทั้งปีสำหรับค่าหอและหนี้สิน จดจำบิลประจำทุกเดือน พร้อมระบบแจ้งเตือนเพดานงบประมาณที่ออกแบบมาให้เรียบง่ายและสบายตาที่สุด
              </p>
            </div>

            <div className="space-y-4">
              {authError && (
                <div className="rounded-2xl border border-[#FF3B30]/30 bg-[#FF3B30]/10 px-4 py-3 text-xs text-[#D70015] dark:text-[#FF6961]">
                  {authError}
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-[#1D1D1F] hover:bg-black dark:bg-white dark:hover:bg-[#E5E5EA] text-white dark:text-[#1D1D1F] active:scale-[0.985] disabled:opacity-60 text-[15px] font-medium transition-all shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.48-1.69 4.35-5.27 4.35-3.17 0-5.76-2.63-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.44l2.53-2.44C16.79 4.18 14.69 3.3 12.17 3.3 7.21 3.3 3.2 7.31 3.2 12.26s4.01 8.96 8.97 8.96c5.18 0 8.61-3.64 8.61-8.77 0-.59-.06-1.04-.14-1.35z"
                  />
                </svg>
                <span>{signingIn ? 'กำลังเชื่อมต่อบัญชี Google...' : 'ดำเนินการต่อด้วย Google'}</span>
              </button>

              <p className="text-xs text-[#86868B] text-center">
                ข้อมูลบัญชีถูกแยกเก็บส่วนตัวบน Firebase Cloud และแคชออฟไลน์ในเครื่องของคุณ
              </p>
            </div>

            <div className="pt-6 border-t border-black/[0.06] dark:border-white/[0.1] grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#1D1D1F] dark:text-white">
                  <Cloud className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
                  <span>ซิงค์ไร้รอยต่อ</span>
                </div>
                <p className="text-[#6E6E73] dark:text-[#8E8E93] leading-relaxed">
                  ใช้ออฟไลน์ได้และซิงค์อัตโนมัติทุกอุปกรณ์
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#1D1D1F] dark:text-white">
                  <BellRing className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
                  <span>คุมเพดานงบ</span>
                </div>
                <p className="text-[#6E6E73] dark:text-[#8E8E93] leading-relaxed">
                  เตือนก่อนงบเต็มและทันทีเมื่อเกินกำหนด
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#1D1D1F] dark:text-white">
                  <CalendarClock className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
                  <span>วางแผนทั้งปี</span>
                </div>
                <p className="text-[#6E6E73] dark:text-[#8E8E93] leading-relaxed">
                  ค่าหอ หนี้สิน บิลประจำ และแนวโน้มออม
                </p>
              </div>
            </div>
          </section>

          {/* Right Sculptural Apple Liquid Glass Artwork Showcase */}
          <aside className="lg:col-span-6 relative rounded-[32px] overflow-hidden border border-white/60 dark:border-white/[0.12] min-h-[360px] lg:h-full flex flex-col justify-end shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]">
            {!imgFailed ? (
              <img
                src={HERO_ART}
                alt="งานออกแบบกระจกออปติคอล Liquid Glass ของ F.R.I.D.A.Y."
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

            <div className="relative z-10 p-8 md:p-10 text-white space-y-5">
              <p className="text-xs font-medium text-white/75 tracking-wide">
                Liquid Glass · ออกแบบมาเพื่อความสงบและแม่นยำ
              </p>
              <h2 className="text-2xl sm:text-[28px] font-semibold tracking-[-0.025em] text-white leading-snug">
                ทุกตัวเลขเรียงตัวอย่างประณีต พร้อมพยากรณ์อนาคตการเงินของคุณ
              </h2>
              <div className="grid grid-cols-3 gap-4 pt-5 border-t border-white/15">
                <div>
                  <div className="text-[11px] text-white/65">กราฟเรียลไทม์</div>
                  <div className="text-sm font-medium mt-0.5">12 เดือนเต็มปี</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/65">แผนเบิกจ่าย</div>
                  <div className="text-sm font-medium mt-0.5">ค่าหอ · หนี้สิน</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/65">สำรองข้อมูล</div>
                  <div className="text-sm font-medium mt-0.5">Cloud · iCloud Drive</div>
                </div>
              </div>
            </div>
          </aside>
        </motion.div>
      </main>
    </div>
  );
}
