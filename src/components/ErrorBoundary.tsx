import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FIREBASE_META } from '../lib/firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isQuotaError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      isQuotaError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const message = error?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
    const isQuotaError = message.toLowerCase().includes('quota exceeded');
    return {
      hasError: true,
      errorMessage: message,
      isQuotaError,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const upgradeUrl = `https://console.firebase.google.com/project/${FIREBASE_META.projectId}/firestore/databases/${FIREBASE_META.databaseId}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-dvh flex items-center justify-center p-6 glass-backdrop-field bg-[#F2F4F8] dark:bg-[#090B10]">
        <div className="apple-glass-strong max-w-lg w-full rounded-3xl p-8 space-y-5">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              ไม่สามารถดำเนินการต่อได้ในขณะนี้
            </h1>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {this.state.isQuotaError
              ? 'โควต้าการใช้งานฐานข้อมูล Firestore รายวันเต็มแล้ว ระบบจะรีเซ็ตโควต้าในวันถัดไป หรือคุณสามารถตรวจสอบรายละเอียดแผนการใช้งานได้ใน Firebase Console'
              : 'ระบบตรวจพบข้อผิดพลาดในการเชื่อมต่อหรือสิทธิ์การเข้าถึงข้อมูล กรุณารีเฟรชหน้าเว็บเพื่อลองใหม่อีกครั้ง'}
          </p>

          {this.state.isQuotaError && (
            <a
              href={upgradeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-sm font-medium text-[#0071E3] dark:text-[#2997FF] hover:underline"
            >
              เปิดหน้าตั้งค่าโควต้า Firestore ใน Firebase Console
            </a>
          )}

          <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.05] p-3 text-xs font-mono text-slate-600 dark:text-slate-400 break-all max-h-32 overflow-auto">
            {this.state.errorMessage}
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0062C4] text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            โหลดหน้าใหม่
          </button>
        </div>
      </div>
    );
  }
}
