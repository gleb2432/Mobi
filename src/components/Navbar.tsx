import React from 'react';
import { Database, RefreshCw, Layers, ShieldCheck, Lock, LogOut, FileSpreadsheet } from 'lucide-react';
import { TerminalCell } from '../types/terminal';

interface NavbarProps {
  cells: TerminalCell[];
  isLive: boolean;
  onRefresh: () => void;
  activeTab: string;
  isAdmin: boolean;
  adminEmail?: string | null;
  onOpenAdminAuth: () => void;
  onLogoutAdmin: () => void;
  onOpenReports?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  cells,
  isLive,
  onRefresh,
  activeTab,
  isAdmin,
  adminEmail,
  onOpenAdminAuth,
  onLogoutAdmin,
  onOpenReports
}) => {
  const occupiedCount = cells.filter(c => c.status === 'occupied').length;
  const totalCount = cells.length || 84;
  const occupancyPercent = Math.round((occupiedCount / totalCount) * 100);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white px-3 sm:px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand Zone */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-900/20 shrink-0 font-bold text-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-white leading-tight">
              Терминал Стеклотары
            </h1>
            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <span>Эстакада {totalCount} ячеек</span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1 text-emerald-400 font-mono">
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {isLive ? 'Firebase' : 'Демо'}
              </span>
            </p>
          </div>
        </div>

        {/* Right Stats & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Admin Role Status Pill */}
          {isAdmin ? (
            <div className="flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 px-2.5 py-1 rounded-xl text-xs font-medium shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="hidden md:inline font-medium">Администратор</span>
              <span className="md:hidden">Админ</span>
              <button
                onClick={onLogoutAdmin}
                title="Выйти из режима администратора"
                className="ml-1 text-emerald-400 hover:text-white p-0.5 rounded hover:bg-emerald-900/60 transition-colors"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAdminAuth}
              title="Войти как администратор"
              className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs font-medium transition-all"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Вход админа</span>
              <span className="sm:hidden">Админ</span>
            </button>
          )}

          {/* Reports Button (Admin Protected) */}
          {onOpenReports && (
            <button
              onClick={onOpenReports}
              title={isAdmin ? "Складские отчеты и ведомости (Excel / PDF)" : "Отчеты доступны только для администратора (требуется пароль)"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
                isAdmin
                  ? 'bg-emerald-950/70 hover:bg-emerald-900/80 active:scale-95 text-emerald-300 hover:text-white border-emerald-800/80'
                  : 'bg-slate-800/60 hover:bg-slate-800 active:scale-95 text-slate-400 hover:text-slate-200 border-slate-700/60'
              }`}
            >
              {isAdmin ? (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-amber-400/80" />
              )}
              <span className="hidden sm:inline">Отчеты (Excel/PDF)</span>
              <span className="sm:hidden">Отчеты</span>
            </button>
          )}

          {/* Occupancy Indicator */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
            <Database className="w-4 h-4 text-emerald-400" />
            <div className="text-xs font-mono">
              <span className="text-slate-400">Занято: </span>
              <span className="font-bold text-white">{occupiedCount}</span>
              <span className="text-slate-500">/{totalCount}</span>
              <span className="ml-1 text-emerald-400 font-semibold">({occupancyPercent}%)</span>
            </div>
          </div>

          <button
            onClick={onRefresh}
            title="Обновить данные"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white flex items-center justify-center transition-all border border-slate-700/80 shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
