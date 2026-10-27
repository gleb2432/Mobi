import React from 'react';
import { Grid, Truck, PackageCheck, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'map' | 'unload' | 'fifo' | 'admin';
  setActiveTab: (tab: 'map' | 'unload' | 'fifo' | 'admin') => void;
  pendingFifoCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  pendingFifoCount
}) => {
  const navItems = [
    {
      id: 'map' as const,
      label: 'Схема Рядов',
      icon: Grid,
      badge: null
    },
    {
      id: 'unload' as const,
      label: 'Выгрузка',
      icon: Truck,
      badge: null
    },
    {
      id: 'fifo' as const,
      label: 'Завоз FIFO',
      icon: PackageCheck,
      badge: pendingFifoCount > 0 ? pendingFifoCount : null
    },
    {
      id: 'admin' as const,
      label: 'Админка',
      icon: Settings,
      badge: null
    }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 pb-safe">
      <div className="max-w-md mx-auto grid grid-cols-4 h-16 items-center px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl transition-all relative ${
                isActive
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 active:scale-95'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {item.badge !== null && (
                  <span className="absolute -top-1.5 -right-2.5 bg-emerald-500 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full font-mono shadow-sm">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight truncate max-w-full">
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-6 h-1 bg-emerald-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
