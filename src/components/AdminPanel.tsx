import React, { useState, useMemo } from 'react';
import { CatalogBottle, TerminalCell, WarehouseLog, GlassColor, getGlassColorLabel, TerminalLocation, LOCATION_LABELS, DEFAULT_PALLET_CAPACITY } from '../types/terminal';
import { Settings, Plus, Minus, Trash2, RefreshCw, History, ShieldAlert, CheckCircle2, Download, Database, Layers, AlertCircle, AlertTriangle, Lock, KeyRound, Eye, EyeOff, ShieldCheck, LogOut, Pencil, Package, BarChart3, PieChart, Building2, MapPin, Sliders, Check, FileSpreadsheet } from 'lucide-react';
import { verifyAdminPassword } from '../lib/firebase';

interface AdminPanelProps {
  catalog: CatalogBottle[];
  cells: TerminalCell[];
  logs: WarehouseLog[];
  isLive: boolean;
  onAddBottle: (bottle: CatalogBottle) => Promise<boolean>;
  onUpdateBottle?: (bottleId: string, updates: Partial<CatalogBottle>) => Promise<boolean>;
  onDeleteBottle: (bottleId: string) => Promise<boolean>;
  onAddRow: (rowLetter: string, location: TerminalLocation, capacity?: number) => Promise<boolean>;
  onDeleteRow: (rowLetter: string) => Promise<boolean>;
  onAddCell: (cellId: string, rowLetter: string, location: TerminalLocation, position?: number, capacity?: number) => Promise<boolean>;
  onDeleteCell?: (cellId: string) => Promise<boolean>;
  onUpdateCellCapacity?: (cellId: string, newCapacity: number) => Promise<boolean>;
  onUpdateRowCapacity?: (rowLetter: string, newCapacity: number) => Promise<boolean>;
  onBlockCell?: (cellId: string, reason: string) => Promise<boolean>;
  onUnblockCell?: (cellId: string) => Promise<boolean>;
  onResetDatabase: () => Promise<boolean>;
  isAdmin?: boolean;
  adminEmail?: string | null;
  onAdminLoginSuccess?: (email?: string) => void;
  onLogoutAdmin?: () => void;
  onOpenReports?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  catalog,
  cells,
  logs,
  isLive,
  onAddBottle,
  onUpdateBottle,
  onDeleteBottle,
  onAddRow,
  onDeleteRow,
  onAddCell,
  onDeleteCell,
  onUpdateCellCapacity,
  onUpdateRowCapacity,
  onBlockCell,
  onUnblockCell,
  onResetDatabase,
  isAdmin = false,
  adminEmail,
  onAdminLoginSuccess,
  onLogoutAdmin,
  onOpenReports
}) => {
  const [activeTab, setActiveTab] = useState<'rows' | 'blocks' | 'catalog' | 'logs' | 'stats' | 'system'>('rows');

  // Admin Login Form State for unauthenticated users
  const [loginPassword, setLoginPassword] = useState('');
  const [loginPasswordError, setLoginPasswordError] = useState<string | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // New bottle form
  const [name, setName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [color, setColor] = useState<GlassColor>('brown');
  const [volume, setVolume] = useState('0.45 л');
  const [bottlesPerPallet, setBottlesPerPallet] = useState<number | ''>(2400);
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cellToDelete, setCellToDelete] = useState<string | null>(null);

  // Editing existing bottle in catalog
  const [editingBottle, setEditingBottle] = useState<CatalogBottle | null>(null);
  const [editBottlesCount, setEditBottlesCount] = useState<number | ''>(2400);
  const [isUpdatingBottle, setIsUpdatingBottle] = useState<boolean>(false);

  // Row management state
  const currentRows = useMemo(() => {
    const rowSet = new Set(cells.map((c) => c.row));
    return Array.from(rowSet).sort();
  }, [cells]);

  // Individual cell management state
  const [cellTargetRow, setCellTargetRow] = useState<string>('A');
  const [cellLocation, setCellLocation] = useState<TerminalLocation>('эстакада');
  const [customCellId, setCustomCellId] = useState<string>('');
  const [newCellCapacity, setNewCellCapacity] = useState<number>(26);
  const [newRowCapacity, setNewRowCapacity] = useState<number>(26);
  const [isCellOperating, setIsCellOperating] = useState(false);

  // Capacity Adjustment Modal State
  const [editingCapacityCell, setEditingCapacityCell] = useState<TerminalCell | null>(null);
  const [editingCapacityRow, setEditingCapacityRow] = useState<string | null>(null);
  const [targetCapacityValue, setTargetCapacityValue] = useState<number>(26);
  const [applyCapacityToWholeRow, setApplyCapacityToWholeRow] = useState<boolean>(false);
  const [isCapacityUpdating, setIsCapacityUpdating] = useState<boolean>(false);

  // Sync cellTargetRow
  React.useEffect(() => {
    if (currentRows.length > 0 && !currentRows.includes(cellTargetRow)) {
      setCellTargetRow(currentRows[0]);
    }
  }, [currentRows, cellTargetRow]);

  // Suggested next cell ID for target row
  const suggestedNextCellId = useMemo(() => {
    const rowCells = cells.filter((c) => c.row === cellTargetRow);
    const maxPos = rowCells.reduce((max, c) => Math.max(max, c.position), 0);
    return `${cellTargetRow}${maxPos + 1}`;
  }, [cells, cellTargetRow]);

  React.useEffect(() => {
    setCustomCellId(suggestedNextCellId);
  }, [suggestedNextCellId]);

  // Blocked cells across terminal
  const blockedCells = useMemo(() => cells.filter((c) => c.isBlocked), [cells]);

  // Statistics Calculations
  const stats = useMemo(() => {
    const occupiedCells = cells.filter((c) => c.status === 'occupied');
    const totalCells = cells.length;
    const occupancyRate = totalCells > 0 ? (occupiedCells.length / totalCells) * 100 : 0;

    // Location breakdown
    const locationStats = {
      'эстакада': { occupied: 0, total: 0 },
      'плиты': { occupied: 0, total: 0 },
      'абк': { occupied: 0, total: 0 }
    };

    cells.forEach(c => {
      const loc = c.location || 'эстакада';
      if (locationStats[loc]) {
        locationStats[loc].total++;
        if (c.status === 'occupied') locationStats[loc].occupied++;
      }
    });

    const bottleBreakdown = new Map<string, { 
      name: string; 
      supplier: string; 
      pallets: number; 
      bottles: number;
      cellsCount: number;
      color: GlassColor;
    }>();

    occupiedCells.forEach(cell => {
      const bottleKey = cell.bottleId || cell.bottleName || 'Unknown';
      const supplierKey = cell.supplier || 'UnknownSupplier';
      const colorKey = cell.bottleColor || 'clear';
      const key = `${bottleKey}_${supplierKey}_${colorKey}`;
      const existing = bottleBreakdown.get(key) || {
        name: cell.bottleName || 'Неизвестно',
        supplier: cell.supplier || 'Не указан',
        pallets: 0,
        bottles: 0,
        cellsCount: 0,
        color: cell.bottleColor || 'clear'
      };

      const pallets = cell.palletCount || 0;
      // Find bottle meta for multiplier
      const bottleMeta = catalog.find(b => b.id === cell.bottleId || b.name === cell.bottleName);
      const multiplier = cell.bottlesPerPallet || bottleMeta?.bottlesPerPallet || 2400;

      existing.pallets += pallets;
      existing.bottles += pallets * multiplier;
      existing.cellsCount += 1;
      bottleBreakdown.set(key, existing);
    });

    return {
      totalCells,
      occupiedCount: occupiedCells.length,
      occupancyRate,
      locationStats,
      totalPallets: occupiedCells.reduce((sum, c) => sum + (c.palletCount || 0), 0),
      totalBottles: Array.from(bottleBreakdown.values()).reduce((sum, item) => sum + item.bottles, 0),
      breakdown: Array.from(bottleBreakdown.values()).sort((a, b) => b.pallets - a.pallets)
    };
  }, [cells, catalog]);

  // Suggested next row letter (e.g., after L -> M, after M -> N)
  const suggestedNextLetter = useMemo(() => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < alphabet.length; i++) {
      if (!currentRows.includes(alphabet[i])) {
        return alphabet[i];
      }
    }
    return `R${currentRows.length + 1}`;
  }, [currentRows]);

  const [newRowName, setNewRowName] = useState(suggestedNextLetter);
  const [newRowLocation, setNewRowLocation] = useState<TerminalLocation>('эстакада');
  const [isRowOperating, setIsRowOperating] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<string | null>(null);

  // Keep suggested letter in sync
  React.useEffect(() => {
    setNewRowName(suggestedNextLetter);
  }, [suggestedNextLetter]);

  const handleAddBottle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsAdding(true);
    setMessage(null);
    setErrorMessage(null);

    const finalBottlesCount = typeof bottlesPerPallet === 'number' && bottlesPerPallet > 0 ? bottlesPerPallet : 2400;

    const newBottle: CatalogBottle = {
      id: `bottle_${Date.now()}`,
      name: name.trim(),
      supplier: supplier.trim() || 'ООО Стеклопром',
      color,
      volume,
      bottlesPerPallet: finalBottlesCount,
      createdAt: new Date().toISOString()
    };

    const ok = await onAddBottle(newBottle);
    if (ok) {
      setMessage(`Бутылка «${name}» (${finalBottlesCount} шт./паллет) успешно добавлена в справочник!`);
      setName('');
      setSupplier('');
      setBottlesPerPallet(2400);
    } else {
      setErrorMessage('Не удалось сохранить бутылку');
    }
    setIsAdding(false);
  };

  const handleSaveEditBottle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBottle || !onUpdateBottle) return;

    setIsUpdatingBottle(true);
    const count = typeof editBottlesCount === 'number' && editBottlesCount > 0 ? editBottlesCount : 2400;

    const ok = await onUpdateBottle(editingBottle.id, {
      bottlesPerPallet: count
    });

    if (ok) {
      setMessage(`Для сорта «${editingBottle.name}» обновлено количество бутылок: ${count.toLocaleString('ru-RU')} шт./паллет!`);
      setEditingBottle(null);
    } else {
      setErrorMessage('Не удалось обновить данные сорта');
    }
    setIsUpdatingBottle(false);
  };

  const handleCreateRow = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRowName.trim().toUpperCase();
    if (!clean) return;

    if (currentRows.includes(clean)) {
      setErrorMessage(`Ряд «${clean}» уже существует на терминале!`);
      return;
    }

    setIsRowOperating(true);
    setMessage(null);
    setErrorMessage(null);

    const ok = await onAddRow(clean, newRowLocation, newRowCapacity);
    if (ok) {
      setMessage(`Ряд «${clean}» успешно добавлен в локацию «${LOCATION_LABELS[newRowLocation]}»! Создано 7 новых свободных ячеек (${clean}1–${clean}7) вместимостью ${newRowCapacity} палл. каждая.`);
    } else {
      setErrorMessage(`Ошибка при создании Ряда «${clean}».`);
    }
    setIsRowOperating(false);
  };

  const handleConfirmDeleteRow = async () => {
    if (!rowToDelete) return;
    setIsRowOperating(true);
    setMessage(null);
    setErrorMessage(null);

    const ok = await onDeleteRow(rowToDelete);
    if (ok) {
      setMessage(`Ряд «${rowToDelete}» и его ячейки успешно удалены с терминала!`);
      setRowToDelete(null);
    } else {
      setErrorMessage(`Ошибка при удалении Ряда «${rowToDelete}».`);
    }
    setIsRowOperating(false);
  };

  const handleCreateCell = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = (customCellId || suggestedNextCellId).trim().toUpperCase();
    if (!cleanId) return;

    if (cells.some((c) => c.cellId === cleanId)) {
      setErrorMessage(`Ячейка «${cleanId}» уже существует на терминале!`);
      return;
    }

    setIsCellOperating(true);
    setMessage(null);
    setErrorMessage(null);

    const pos = parseInt(cleanId.replace(/^[A-ZА-Я]+/i, ''), 10) || 1;
    const ok = await onAddCell(cleanId, cellTargetRow, cellLocation, pos, newCellCapacity);
    if (ok) {
      setMessage(`Ячейка «${cleanId}» успешно добавлена в Ряд ${cellTargetRow} (${LOCATION_LABELS[cellLocation]})! Вместимость: ${newCellCapacity} паллет.`);
    } else {
      setErrorMessage(`Ошибка при создании ячейки «${cleanId}».`);
    }
    setIsCellOperating(false);
  };

  const handleQuickAddCell = async (row: string) => {
    const rowCells = cells.filter((c) => c.row === row);
    const location = rowCells[0]?.location || 'эстакада';
    const capacity = rowCells[0]?.palletCapacity || 26;
    const maxPos = rowCells.reduce((max, c) => Math.max(max, c.position), 0);
    const nextPos = maxPos + 1;
    const nextId = `${row}${nextPos}`;

    setIsCellOperating(true);
    setMessage(null);
    setErrorMessage(null);

    const ok = await onAddCell(nextId, row, location, nextPos, capacity);
    if (ok) {
      setMessage(`Ячейка «${nextId}» успешно добавлена в Ряд ${row} (${LOCATION_LABELS[location]}, вместимость ${capacity} палл.)!`);
    } else {
      setErrorMessage(`Ошибка при создании ячейки «${nextId}».`);
    }
    setIsCellOperating(false);
  };

  // Open capacity modal for individual cell
  const handleOpenCellCapacity = (cell: TerminalCell) => {
    setEditingCapacityCell(cell);
    setEditingCapacityRow(null);
    setTargetCapacityValue(cell.palletCapacity || 26);
    setApplyCapacityToWholeRow(false);
  };

  // Open capacity modal for whole row
  const handleOpenRowCapacity = (row: string) => {
    const rowCells = cells.filter((c) => c.row === row);
    setEditingCapacityRow(row);
    setEditingCapacityCell(null);
    setTargetCapacityValue(rowCells[0]?.palletCapacity || 26);
    setApplyCapacityToWholeRow(true);
  };

  // Save new capacity
  const handleSaveCapacity = async () => {
    if (targetCapacityValue <= 0) return;
    setIsCapacityUpdating(true);
    setMessage(null);
    setErrorMessage(null);

    let ok = false;
    if (editingCapacityRow || (editingCapacityCell && applyCapacityToWholeRow)) {
      const row = editingCapacityRow || editingCapacityCell?.row;
      if (row && onUpdateRowCapacity) {
        ok = await onUpdateRowCapacity(row, targetCapacityValue);
        if (ok) {
          setMessage(`Вместимость всех ячеек Ряда ${row} успешно изменена на ${targetCapacityValue} паллет!`);
        }
      }
    } else if (editingCapacityCell) {
      if (onUpdateCellCapacity) {
        ok = await onUpdateCellCapacity(editingCapacityCell.cellId, targetCapacityValue);
        if (ok) {
          setMessage(`Вместимость ячейки ${editingCapacityCell.cellId} успешно изменена на ${targetCapacityValue} паллет!`);
        }
      }
    }

    if (!ok) {
      setErrorMessage('Не удалось сохранить новую вместимость');
    }

    setIsCapacityUpdating(false);
    setEditingCapacityCell(null);
    setEditingCapacityRow(null);
  };

  const handleRequestDeleteCell = (cellId: string) => {
    const targetCell = cells.find((c) => c.cellId === cellId);
    if (targetCell?.status === 'occupied') {
      setErrorMessage(`Нельзя удалить ячейку «${cellId}», так как в ней находится стеклотара! Сначала переместите паллеты на склад.`);
      return;
    }
    setCellToDelete(cellId);
  };

  const handleConfirmDeleteCell = async () => {
    if (!cellToDelete || !onDeleteCell) return;
    setIsCellOperating(true);
    setMessage(null);
    setErrorMessage(null);
    const ok = await onDeleteCell(cellToDelete);
    if (ok) {
      setMessage(`Ячейка «${cellToDelete}» успешно удалена с терминала.`);
      setCellToDelete(null);
    } else {
      setErrorMessage(`Ошибка при удалении ячейки «${cellToDelete}».`);
    }
    setIsCellOperating(false);
  };

  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginPasswordError(null);
    if (verifyAdminPassword(loginPassword)) {
      onAdminLoginSuccess?.('Администратор');
      setLoginPassword('');
    } else {
      setLoginPasswordError('Неверный пароль администратора. Доступ запрещен.');
    }
  };

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ catalog, cells, logs }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `terminal_glass_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // If NOT Admin, render the Admin Authorization Lock Gate
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 pb-24">
        {/* Access Locked Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-lg shadow-amber-950/40">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Панель Администратора
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              Управление структурой терминала (добавление и удаление ячеек и рядов), изменение каталога стеклотары и сброс базы данных защищены паролем администратора.
            </p>
          </div>

          {/* Login Password Form */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5 max-w-md mx-auto text-left space-y-4">
            <form onSubmit={handlePasswordLogin} className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                Введите пароль администратора:
              </label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    if (loginPasswordError) setLoginPasswordError(null);
                  }}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 pr-11 text-base text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono tracking-wide"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                  tabIndex={-1}
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={!loginPassword.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 active:scale-95 text-white font-semibold text-sm py-2.5 px-4 rounded-xl transition-all shadow-md shadow-emerald-950"
              >
                Войти в режим администратора
              </button>
              {loginPasswordError && (
                <p className="text-xs text-rose-400 flex items-center gap-1.5 mt-2 bg-rose-950/40 border border-rose-900/50 p-2 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {loginPasswordError}
                </p>
              )}
            </form>
          </div>

          {/* Read-Only Stats Preview */}
          <div className="pt-2 border-t border-slate-800/80">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Текущее состояние терминала (Просмотр)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl text-center">
                <p className="text-[11px] text-slate-400">Всего ячеек</p>
                <p className="text-lg font-bold text-white font-mono">{cells.length}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl text-center">
                <p className="text-[11px] text-slate-400">Рядов</p>
                <p className="text-lg font-bold text-white font-mono">{currentRows.length}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl text-center">
                <p className="text-[11px] text-slate-400">Занято ячеек</p>
                <p className="text-lg font-bold text-amber-400 font-mono">
                  {cells.filter((c) => c.status === 'occupied').length}
                </p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl text-center">
                <p className="text-[11px] text-slate-400">Сортов тары</p>
                <p className="text-lg font-bold text-emerald-400 font-mono">{catalog.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      {/* Admin Status Banner */}
      <div className="bg-emerald-950/60 border border-emerald-700/60 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              <span>Режим Администратора активен</span>
              <span className="text-emerald-400 text-[11px] font-mono font-normal">
                ({adminEmail || 'Администратор'})
              </span>
            </p>
            <p className="text-[11px] text-emerald-300/80">
              Полный доступ к добавлению/удалению ячеек, рядов и каталога
            </p>
          </div>
        </div>
        {onLogoutAdmin && (
          <button
            onClick={onLogoutAdmin}
            className="text-xs bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Выйти</span>
          </button>
        )}
      </div>

      {/* Admin Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Админ панель и Справочники</h2>
              <p className="text-xs text-slate-400">Управление номенклатурой стеклотары и история операций</p>
            </div>
          </div>

          {/* Sub Navigation */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'stats'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Статистика</span>
            </button>
            <button
              onClick={() => setActiveTab('rows')}
              className={`px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'rows' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Ячейки и Ряды ({cells.length} яч.)
            </button>
            <button
              onClick={() => setActiveTab('blocks')}
              className={`px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'blocks' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className={`w-3.5 h-3.5 ${blockedCells.length > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
              Блокировки ({blockedCells.length})
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap ${
                activeTab === 'catalog' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Справочник
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap ${
                activeTab === 'logs' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              История Логов
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`px-3 py-1.5 rounded-lg transition-all font-medium whitespace-nowrap ${
                activeTab === 'system' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Система
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="bg-emerald-950 border border-emerald-500 text-emerald-200 p-3 rounded-2xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950 border border-rose-500 text-rose-200 p-3 rounded-2xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Tab: Statistics */}
      {activeTab === 'stats' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Main stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Загруженность</span>
                <PieChart className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-mono font-black text-white">{stats.occupancyRate.toFixed(1)}%</span>
                <span className="text-xs text-slate-500 mb-1.5">{stats.occupiedCount} / {stats.totalCells} яч.</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full mt-3 overflow-hidden border border-slate-800">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500" 
                  style={{ width: `${stats.occupancyRate}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Всего паллет</span>
                <Layers className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-mono font-black text-white">{stats.totalPallets}</span>
                <span className="text-xs text-slate-500 mb-1.5 font-bold uppercase">палл.</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Общий объем тары на терминале в паллетах
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Всего бутылок</span>
                <Package className="w-4 h-4 text-sky-400" />
              </div>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-mono font-black text-white">{stats.totalBottles.toLocaleString('ru-RU')}</span>
                <span className="text-[10px] text-slate-500 mb-1.5 font-bold uppercase">шт.</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Суммарное количество по всем сортам
              </p>
            </div>
          </div>

          {/* Location Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.keys(stats.locationStats) as TerminalLocation[]).map(loc => {
              const s = stats.locationStats[loc];
              const rate = s.total > 0 ? (s.occupied / s.total) * 100 : 0;
              return (
                <div key={loc} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{LOCATION_LABELS[loc]}</span>
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-mono font-bold text-white">{rate.toFixed(0)}%</span>
                    <span className="text-[10px] text-slate-400 font-mono">{s.occupied} / {s.total} яч.</span>
                  </div>
                  <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${rate > 80 ? 'bg-rose-500' : rate > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Breakdown List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  Детализация по сортам тары
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">({stats.breakdown.length} сортов)</span>
              </div>

              {onOpenReports && (
                <button
                  type="button"
                  onClick={onOpenReports}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-all"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Экспорт отчета (Excel / PDF)</span>
                </button>
              )}
            </div>

            {stats.breakdown.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Package className="w-10 h-10 text-slate-800 mx-auto" />
                <p className="text-slate-500 text-xs">Терминал пуст. Нет данных для отображения.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {stats.breakdown.map((item, idx) => {
                  const isBrown = item.color === 'brown' || item.color === 'amber';
                  const isGreen = item.color === 'green' || item.color === 'emerald';
                  const colorBadgeClass = isBrown
                    ? 'bg-amber-950/40 border-amber-900/60 text-amber-200'
                    : isGreen
                    ? 'bg-emerald-950/40 border-emerald-900/60 text-emerald-200'
                    : 'bg-slate-800/40 border-slate-700 text-slate-300';
                  const colorDotClass = isBrown ? 'bg-amber-600' : isGreen ? 'bg-emerald-400' : 'bg-slate-400';

                  return (
                    <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-950/40 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${colorDotClass}`} />
                          <span className="font-bold text-slate-100">{item.name} • {getGlassColorLabel(item.color)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-600" />
                            {item.supplier}
                          </span>
                          <span>•</span>
                          <span>Занято ячеек: {item.cellsCount}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-mono font-bold text-white">{item.pallets} палл.</div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Объем паллет</div>
                        </div>
                        <div className="w-px h-8 bg-slate-800" />
                        <div className="text-right">
                          <div className="text-sm font-mono font-bold text-emerald-400">{(item.bottles).toLocaleString('ru-RU')} бут.</div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Итого бутылок</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Rows and Cells Management */}
      {activeTab === 'rows' && (
        <div className="space-y-4">
          {/* Capacity summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-slate-400 block text-[11px]">Всего ячеек:</span>
              <span className="text-lg font-bold font-mono text-emerald-400">{cells.length}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-slate-400 block text-[11px]">Всего рядов:</span>
              <span className="text-lg font-bold font-mono text-white">{currentRows.length}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-slate-400 block text-[11px]">Занятых ячеек:</span>
              <span className="text-lg font-bold font-mono text-amber-400">
                {cells.filter((c) => c.status === 'occupied').length}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-slate-400 block text-[11px]">Свободных ячеек:</span>
              <span className="text-lg font-bold font-mono text-emerald-300">
                {cells.filter((c) => c.status === 'empty').length}
              </span>
            </div>
          </div>

          {/* Form: Add Single Cell */}
          <form onSubmit={handleCreateCell} className="bg-slate-900 border border-emerald-900/60 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Добавить ячейку на эстакаду
              </h3>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                Вместимость: {newCellCapacity} паллет
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Локация:
                </label>
                <select
                  value={cellLocation}
                  onChange={(e) => setCellLocation(e.target.value as TerminalLocation)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {(Object.keys(LOCATION_LABELS) as TerminalLocation[]).map((loc) => (
                    <option key={loc} value={loc}>
                      {LOCATION_LABELS[loc]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Выберите ряд:
                </label>
                <select
                  value={cellTargetRow}
                  onChange={(e) => setCellTargetRow(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                >
                  {currentRows.map((r) => (
                    <option key={r} value={r}>
                      Ряд {r} (сейчас {cells.filter((c) => c.row === r).length} яч.)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Обозначение ячейки:
                </label>
                <input
                  type="text"
                  required
                  value={customCellId}
                  onChange={(e) => setCustomCellId(e.target.value.toUpperCase())}
                  placeholder={`например: ${suggestedNextCellId}`}
                  maxLength={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold uppercase focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Вместимость (паллет):
                </label>
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setNewCellCapacity((c) => Math.max(1, c - 1))}
                    className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={newCellCapacity}
                    onChange={(e) => setNewCellCapacity(Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 1)))}
                    className="w-full bg-transparent text-center font-mono font-bold text-sm text-emerald-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setNewCellCapacity((c) => Math.min(120, c + 1))}
                    className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isCellOperating || !customCellId.trim()}
                  className="w-full min-h-[42px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950/40"
                >
                  <Plus className="w-4 h-4" />
                  {isCellOperating ? 'Добавление...' : `Добавить ${customCellId || 'ячейку'}`}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              💡 Новая свободная ячейка сразу появится на Схеме Терминала с указанной вместимостью паллет ({newCellCapacity} п.).
            </p>
          </form>

          {/* Form: Add New Row */}
          <form onSubmit={handleCreateRow} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Добавить целый новый ряд
              </h3>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                +7 ячеек ({newRowName || 'M'}1–{newRowName || 'M'}7 по {newRowCapacity} паллет)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div className="sm:col-span-1">
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Локация:
                </label>
                <select
                  value={newRowLocation}
                  onChange={(e) => setNewRowLocation(e.target.value as TerminalLocation)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {(Object.keys(LOCATION_LABELS) as TerminalLocation[]).map((loc) => (
                    <option key={loc} value={loc}>
                      {LOCATION_LABELS[loc]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Обозначение ряда:
                </label>
                <input
                  type="text"
                  required
                  value={newRowName}
                  onChange={(e) => setNewRowName(e.target.value.toUpperCase())}
                  placeholder="например: M, N, O..."
                  maxLength={5}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold uppercase focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Вместимость ячеек:
                </label>
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setNewRowCapacity((c) => Math.max(1, c - 1))}
                    className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={newRowCapacity}
                    onChange={(e) => setNewRowCapacity(Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 1)))}
                    className="w-full bg-transparent text-center font-mono font-bold text-sm text-emerald-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setNewRowCapacity((c) => Math.min(120, c + 1))}
                    className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isRowOperating || !newRowName.trim()}
                  className="w-full min-h-[42px] bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700"
                >
                  <Plus className="w-4 h-4" />
                  {isRowOperating ? 'Добавление...' : `Создать Ряд ${newRowName || '...'}`}
                </button>
              </div>
            </div>
          </form>

          {/* List of existing rows and cells */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 flex items-center justify-between">
              <span>Ряды и ячейки терминала ({currentRows.length} рядов, {cells.length} ячеек)</span>
              <span className="text-xs text-slate-400 font-normal">Нажмите «+ Ячейка» для расширения</span>
            </h3>

            <div className="space-y-3">
              {currentRows.map((row) => {
                const rowCells = cells.filter((c) => c.row === row).sort((a, b) => a.position - b.position);
                const occupiedCount = rowCells.filter((c) => c.status === 'occupied').length;
                const emptyCount = rowCells.length - occupiedCount;
                const maxPos = rowCells.reduce((max, c) => Math.max(max, c.position), 0);
                const nextCellId = `${row}${maxPos + 1}`;

                return (
                  <div
                    key={row}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-sm hover:border-slate-700 transition-colors"
                  >
                    {/* Row Header Bar */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center font-mono font-bold text-base text-emerald-400">
                          {row}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            Ряд {row} 
                            <span className="text-emerald-400/80 text-[10px] font-mono border border-emerald-900/40 px-1.5 rounded">
                              {LOCATION_LABELS[rowCells[0]?.location || 'эстакада']}
                            </span>
                            <span className="text-slate-400 text-xs font-mono font-normal">
                              ({rowCells.length} ячеек)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className={occupiedCount > 0 ? 'text-amber-400 font-medium' : 'text-slate-500'}>
                              {occupiedCount} занято
                            </span>
                            <span>•</span>
                            <span className="text-emerald-400 font-medium">
                              {emptyCount} свободно
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenRowCapacity(row)}
                          title={`Настроить вместимость ячеек в Ряду ${row}`}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 font-medium text-xs border border-slate-700 flex items-center gap-1.5 transition-colors"
                        >
                          <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="hidden sm:inline">Вместимость ряда</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickAddCell(row)}
                          disabled={isCellOperating}
                          title={`Добавить ячейку ${nextCellId} в Ряд ${row}`}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-medium text-xs border border-emerald-800/80 flex items-center gap-1.5 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          + Ячейка ({nextCellId})
                        </button>

                        <button
                          type="button"
                          onClick={() => setRowToDelete(row)}
                          title={`Удалить Ряд ${row}`}
                          className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 flex items-center justify-center transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Cells Chips Grid for this Row */}
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-900">
                      {rowCells.map((cell) => {
                        const isOccupied = cell.status === 'occupied';
                        const cellCap = cell.palletCapacity || DEFAULT_PALLET_CAPACITY;
                        return (
                          <div
                            key={cell.cellId}
                            className={`group relative px-2 py-1 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                              isOccupied
                                ? 'bg-amber-950/60 border-amber-600/70 text-amber-200'
                                : 'bg-slate-900/90 border-slate-800 text-emerald-300 hover:border-emerald-600/60'
                            }`}
                          >
                            <span>{cell.cellId}</span>

                            {/* Capacity badge button */}
                            <button
                              type="button"
                              onClick={() => handleOpenCellCapacity(cell)}
                              title={`Нажмите, чтобы изменить вместимость ячейки ${cell.cellId} (сейчас ${cellCap} паллет)`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors flex items-center gap-1 ${
                                isOccupied
                                  ? 'bg-amber-900/60 text-amber-300 hover:bg-amber-800 border border-amber-700/60'
                                  : 'bg-emerald-950/90 text-emerald-300 hover:bg-emerald-900 border border-emerald-800/70'
                              }`}
                            >
                              <span>{isOccupied ? `${cell.palletCount || cellCap}/${cellCap}п` : `${cellCap}п`}</span>
                              <Sliders className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                            </button>

                            {!isOccupied && onDeleteCell && (
                              <button
                                type="button"
                                onClick={() => handleRequestDeleteCell(cell.cellId)}
                                title={`Удалить пустую ячейку ${cell.cellId}`}
                                className="text-slate-500 hover:text-rose-400 ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delete Row Confirmation Modal */}
          {rowToDelete && (
            <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-base">
                    <AlertTriangle className="w-5 h-5" />
                    Подтверждение удаления ряда
                  </div>
                  <button
                    onClick={() => setRowToDelete(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <p className="text-slate-200">
                    Вы собираетесь удалить <strong className="text-white font-mono text-sm">Ряд {rowToDelete}</strong> и все его 7 ячеек ({rowToDelete}1–{rowToDelete}7).
                  </p>

                  {cells.filter((c) => c.row === rowToDelete && c.status === 'occupied').length > 0 && (
                    <div className="bg-rose-950/80 border border-rose-800 p-3 rounded-xl text-rose-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-rose-300">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        Внимание: В этом ряду есть занятые ячейки!
                      </div>
                      <p className="text-[11px] text-rose-300">
                        В ряду {rowToDelete} сейчас находятся паллеты с тарой. При удалении ряда эти ячейки будут удалены из базы данных безвозвратно.
                      </p>
                    </div>
                  )}

                  <p className="text-slate-400 text-[11px]">
                    Действие необратимо. Подтвердите удаление Ряда {rowToDelete}.
                  </p>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmDeleteRow}
                    disabled={isRowOperating}
                    className="w-full min-h-[44px] bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-900/40"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isRowOperating ? 'Удаление...' : `Да, удалить Ряд ${rowToDelete}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowToDelete(null)}
                    className="px-4 bg-slate-800 text-slate-300 font-medium text-xs rounded-xl hover:bg-slate-700"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Cell Confirmation Modal */}
          {cellToDelete && (
            <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Удаление ячейки
                  </div>
                  <button
                    onClick={() => setCellToDelete(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2 text-xs text-slate-200">
                  <p>
                    Вы уверены, что хотите удалить пустую ячейку{' '}
                    <span className="font-mono font-bold text-white text-sm bg-slate-800 px-2 py-0.5 rounded">
                      {cellToDelete}
                    </span>
                    ?
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Ячейка будет удалена из структуры эстакады. При необходимости её можно добавить снова кнопкой «+ Ячейка».
                  </p>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmDeleteCell}
                    disabled={isCellOperating}
                    className="w-full min-h-[42px] bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-900/40"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isCellOperating ? 'Удаление...' : `Да, удалить ${cellToDelete}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCellToDelete(null)}
                    className="px-4 bg-slate-800 text-slate-300 font-medium text-xs rounded-xl hover:bg-slate-700"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pallet Capacity Adjustment Modal (Single Cell or Entire Row) */}
          {(editingCapacityCell || editingCapacityRow) && (
            <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-slate-900 border border-emerald-800/80 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                    <Sliders className="w-5 h-5 text-emerald-400" />
                    <span>
                      {editingCapacityCell
                        ? `Вместимость ячейки ${editingCapacityCell.cellId}`
                        : `Вместимость Ряда ${editingCapacityRow}`}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingCapacityCell(null);
                      setEditingCapacityRow(null);
                    }}
                    className="text-slate-400 hover:text-white p-1 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  {editingCapacityCell && (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Статус ячейки:</span>
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                            editingCapacityCell.status === 'occupied'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {editingCapacityCell.status === 'occupied'
                            ? `Занята (${editingCapacityCell.palletCount || 0} паллет)`
                            : 'Свободна'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Текущая вместимость:</span>
                        <span className="font-mono font-bold text-white">
                          {editingCapacityCell.palletCapacity || DEFAULT_PALLET_CAPACITY} паллет
                        </span>
                      </div>
                      {editingCapacityCell.status === 'occupied' && targetCapacityValue < (editingCapacityCell.palletCount || 0) && (
                        <div className="text-[11px] text-amber-400 pt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Внимание: новая вместимость меньше фактически размещенных паллет ({editingCapacityCell.palletCount || 0} п.)!
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {editingCapacityRow && (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-300 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Ячеек в ряду {editingCapacityRow}:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {cells.filter((c) => c.row === editingCapacityRow).length} шт.
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Новая вместимость будет установлена для всех ячеек ряда {editingCapacityRow}.
                      </p>
                    </div>
                  )}

                  {/* Stepper & Direct Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-200 block">
                      Укажите максимальное количество паллет:
                    </label>

                    <div className="flex items-center justify-center gap-3 bg-slate-950 border border-slate-800 p-3 rounded-2xl">
                      <button
                        type="button"
                        onClick={() => setTargetCapacityValue((prev) => Math.max(1, prev - 1))}
                        className="w-12 h-12 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xl flex items-center justify-center border border-slate-700 transition-all"
                        title="Уменьшить на 1"
                      >
                        <Minus className="w-5 h-5" />
                      </button>

                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={targetCapacityValue}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setTargetCapacityValue(Math.max(1, Math.min(120, val)));
                            }
                          }}
                          className="w-24 text-center font-mono font-extrabold text-3xl bg-transparent text-emerald-400 focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                          паллет
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setTargetCapacityValue((prev) => Math.min(120, prev + 1))}
                        className="w-12 h-12 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xl flex items-center justify-center border border-slate-700 transition-all"
                        title="Увеличить на 1"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Quick Preset Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium">Быстрый выбор вместимости:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[13, 20, 24, 26, 28, 30, 52].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTargetCapacityValue(preset)}
                          className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold border transition-all ${
                            targetCapacityValue === preset
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/60'
                              : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                          }`}
                        >
                          {preset} {preset === 26 ? '(стандарт)' : 'п.'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Checkbox: Apply to whole row (if single cell selected) */}
                  {editingCapacityCell && (
                    <label className="flex items-center gap-2.5 bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                      <input
                        type="checkbox"
                        checked={applyCapacityToWholeRow}
                        onChange={(e) => setApplyCapacityToWholeRow(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                      />
                      <span className="text-slate-300 text-xs">
                        Применить также ко всем ячейкам <strong className="text-white">Ряда {editingCapacityCell.row}</strong>
                      </span>
                    </label>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveCapacity}
                    disabled={isCapacityUpdating}
                    className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all"
                  >
                    <Check className="w-4 h-4" />
                    {isCapacityUpdating ? 'Сохранение...' : `Сохранить вместимость (${targetCapacityValue} п.)`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCapacityCell(null);
                      setEditingCapacityRow(null);
                    }}
                    className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Blocked Cells Management */}
      {activeTab === 'blocks' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400" />
                <span>Заблокированная продукция на терминале</span>
              </h3>
              <p className="text-xs text-slate-400">
                Заблокированные ячейки защищены от вывоза на склад. Разблокировать их может только администратор.
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800 px-3 py-1 rounded-xl">
              Заблокировано: {blockedCells.length} яч.
            </span>
          </div>

          {blockedCells.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-950/40">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-200">
                На терминале нет заблокированной продукции
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Все занятые ячейки открыты и доступны для завоза на склад по стандартному FIFO-принципу.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {blockedCells.map((cell) => (
                <div
                  key={cell.cellId}
                  className="bg-slate-950 border border-rose-900/60 hover:border-rose-700/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm bg-slate-900 text-rose-300 border border-rose-700 px-2 py-0.5 rounded-lg">
                        {cell.cellId}
                      </span>
                      <span className="font-bold text-white text-sm">
                        {cell.bottleName || 'Стеклотара'}
                      </span>
                      <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md">
                        {cell.palletCount || 26} паллет
                      </span>
                    </div>

                    <div className="text-xs text-rose-200">
                      <span className="text-slate-400 font-medium">Причина: </span>
                      <span className="font-semibold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800/60">
                        {cell.blockReason || 'Блокировка продукции'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                      <span>Заблокировал: {cell.blockedBy || 'Оператор'}</span>
                      {cell.blockedAt && (
                        <>
                          <span>•</span>
                          <span>{new Date(cell.blockedAt).toLocaleString('ru-RU')}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {onUnblockCell && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await onUnblockCell(cell.cellId);
                        if (ok) {
                          setMessage(
                            `Ячейка «${cell.cellId}» успешно разблокирована. Завоз на склад разрешен!`
                          );
                        }
                      }}
                      className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-950/50 shrink-0"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Разблокировать
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Catalog Management */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          {/* Add Form */}
          <form onSubmit={handleAddBottle} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              Добавить новый сорт стеклотары
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Название марки:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="например: Бад Эмеральд 0.45L"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Поставщик завода:</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="ООО Стеклопром"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">Цвет стекла:</label>
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value as GlassColor)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="brown">Коричневая</option>
                  <option value="green">Зелёная</option>
                  <option value="clear">Бесцветная</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">Объём / Тара:</label>
                  <input
                    type="text"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    placeholder="0.45 л"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1 font-medium">Бутылок в палете:</label>
                  <input
                    type="number"
                    min={1}
                    max={20000}
                    value={bottlesPerPallet}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') setBottlesPerPallet('');
                      else {
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed)) setBottlesPerPallet(parsed);
                      }
                    }}
                    onBlur={() => {
                      if (bottlesPerPallet === '' || Number(bottlesPerPallet) < 1) {
                        setBottlesPerPallet(2400);
                      }
                    }}
                    placeholder="2400"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAdding}
              className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md mt-2"
            >
              <Plus className="w-4 h-4" />
              {isAdding ? 'Сохранение...' : 'Сохранить сорт в справочник'}
            </button>
          </form>

          {/* Catalog Items List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
              Активный Справочник Стеклотары ({catalog.length})
            </h3>

            <div className="divide-y divide-slate-800/80">
              {catalog.map((bottle) => {
                const isBrown = bottle.color === 'brown' || bottle.color === 'amber';
                const isGreen = bottle.color === 'green' || bottle.color === 'emerald';
                const colorBadgeClass = isBrown
                  ? 'bg-amber-950/80 border-amber-600/70 text-amber-200'
                  : isGreen
                  ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-200'
                  : 'bg-slate-800/90 border-sky-400/70 text-sky-200';
                const colorDotClass = isBrown ? 'bg-amber-600' : isGreen ? 'bg-emerald-400' : 'bg-sky-300';
                const colorLabel = isBrown ? 'Коричневая' : isGreen ? 'Зелёная' : 'Бесцветная';
                const bCount = bottle.bottlesPerPallet || 2400;

                return (
                  <div key={bottle.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-white flex items-center gap-2 flex-wrap">
                        <span>{bottle.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 font-medium ${colorBadgeClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${colorDotClass}`} />
                          {colorLabel}
                        </span>
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-normal">
                          {bottle.volume || '0.45 л'}
                        </span>
                        <span className="text-[10px] bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1">
                          <Package className="w-3 h-3 text-emerald-400" />
                          {bCount.toLocaleString('ru-RU')} шт./паллет
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Поставщик: <span className="text-slate-300">{bottle.supplier}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onUpdateBottle && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBottle(bottle);
                            setEditBottlesCount(bottle.bottlesPerPallet || 2400);
                          }}
                          title="Изменить количество бутылок в палете"
                          className="w-8 h-8 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-800 flex items-center justify-center transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => onDeleteBottle(bottle.id)}
                        title="Удалить из справочника"
                        className="w-8 h-8 rounded-lg bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Edit Bottle Modal */}
          {editingBottle && (
            <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <Package className="w-4 h-4" />
                    Бутылок в палете: {editingBottle.name}
                  </div>
                  <button
                    onClick={() => setEditingBottle(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveEditBottle} className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1 font-medium">
                      Количество бутылок в 1 палете (шт.):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20000}
                      required
                      value={editBottlesCount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') setEditBottlesCount('');
                        else {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed)) setEditBottlesCount(parsed);
                        }
                      }}
                      onBlur={() => {
                        if (editBottlesCount === '' || Number(editBottlesCount) < 1) {
                          setEditBottlesCount(2400);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-base font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {[1800, 2100, 2400, 2520, 2640].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setEditBottlesCount(preset)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-bold rounded-lg transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      type="submit"
                      disabled={isUpdatingBottle}
                      className="w-full min-h-[42px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isUpdatingBottle ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBottle(null)}
                      className="px-4 bg-slate-800 text-slate-300 font-medium text-xs rounded-xl hover:bg-slate-700"
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Logs */}
      {activeTab === 'logs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
            <History className="w-4 h-4 text-emerald-400" />
            История Выгрузок и Завозов на Склад ({logs.length})
          </h3>

          <div className="space-y-2.5">
            {logs.map((log) => {
              const isUnload = log.actionType === 'unloaded_to_terminal';
              return (
                <div
                  key={log.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[10px] font-mono ${
                        isUnload
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-sky-950 text-sky-300 border border-sky-800'
                      }`}
                    >
                      {isUnload ? '🚛 ВЫГРУЗКА НА ТЕРМИНАЛ' : '📦 ЗАВОЗ НА СКЛАД (FIFO)'}
                    </span>

                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(log.timestamp).toLocaleString('ru-RU')}
                    </span>
                  </div>

                  <div className="font-bold text-white text-sm">
                    {log.bottleName}
                    {log.bottleColor && <span className="text-slate-400 font-normal"> • {getGlassColorLabel(log.bottleColor)}</span>}
                    {log.supplier && <span className="text-slate-500 font-normal ml-2">({log.supplier})</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-slate-400">
                    <span>Дата произв.: <strong className="text-slate-200">{log.mfgDate}</strong></span>
                    <span>Ячейки: <strong className="text-emerald-400 font-mono">{log.cellsInvolved.join(', ')}</strong></span>
                    {log.quantityPallets && (
                      <span>Паллет: <strong className="text-slate-200">{log.quantityPallets}</strong></span>
                    )}
                  </div>

                  {log.details && (
                    <div className="text-[11px] text-slate-500 italic pt-0.5">
                      {log.details}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: System & Reset */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <Database className="w-4 h-4 text-emerald-400" />
              Статус Синхронизации Firebase Firestore
            </h3>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Режим работы:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {isLive ? 'Облачный (Firebase Active)' : 'Локальный демо-режим'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">База данных:</span>
                <span className="font-mono text-slate-200">titanium-embassy-df6jr</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleExportData}
                className="flex-1 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-700"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                Экспорт резервной копии (JSON)
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-rose-950/80 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Сброс и запуск с демо-данными
            </h3>
            <p className="text-xs text-slate-400">
              Сбрасывает текущую сетку терминала (84 ячейки) и восстанавливает начальные примеры выгрузок машин с разными датами для тестирования FIFO.
            </p>

            <button
              onClick={async () => {
                if (window.confirm('Вы уверены, что хотите сбросить терминал к демо-данным?')) {
                  await onResetDatabase();
                }
              }}
              className="w-full min-h-[44px] bg-rose-950/80 hover:bg-rose-900 text-rose-200 font-bold text-xs rounded-xl border border-rose-800 flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Сбросить схему и заполнить тестовыми машинами
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
