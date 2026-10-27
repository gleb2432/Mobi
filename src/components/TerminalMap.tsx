import React, { useState, useMemo } from 'react';
import { CatalogBottle, TerminalCell, TERMINAL_ROWS, GlassColor, DEFAULT_PALLET_CAPACITY } from '../types/terminal';
import { PartialCellPickup } from '../lib/firebase';
import { Search, Info, PackageCheck, X, Truck, Calendar, Building2, Filter, Layers, Plus, Trash2, Lock, ShieldAlert, Package } from 'lucide-react';

interface TerminalMapProps {
  catalog: CatalogBottle[];
  cells: TerminalCell[];
  onTransferCells: (cellIds: string[], bottleName: string, mfgDate: string, pallets: number, bottleColor?: GlassColor, supplier?: string) => void;
  onTransferPartialCells?: (pickups: PartialCellPickup[], bottleName: string, bottleColor?: GlassColor, supplier?: string) => void;
  onBlockCell?: (cellId: string, reason: string) => Promise<boolean>;
  onUnblockCell?: (cellId: string) => Promise<boolean>;
  onNavigateToUnloadRow?: (row: string, cellId?: string) => void;
  onAddCell?: (cellId: string, rowLetter: string, position?: number) => Promise<boolean>;
  onDeleteCell?: (cellId: string) => Promise<boolean>;
  isAdmin?: boolean;
  onRequestAdminAuth?: (actionTitle?: string) => void;
}

export const TerminalMap: React.FC<TerminalMapProps> = ({
  catalog,
  cells,
  onTransferCells,
  onTransferPartialCells,
  onBlockCell,
  onUnblockCell,
  onNavigateToUnloadRow,
  onAddCell,
  onDeleteCell,
  isAdmin = false,
  onRequestAdminAuth
}) => {
  const [selectedCell, setSelectedCell] = useState<TerminalCell | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatalogBottleId, setSelectedCatalogBottleId] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<GlassColor | 'all'>('all');
  const [isAddingCell, setIsAddingCell] = useState<boolean>(false);
  const [confirmDeleteCellId, setConfirmDeleteCellId] = useState<string | null>(null);

  // Cell pickup state for modal
  const [cellPalletsToTake, setCellPalletsToTake] = useState<number | ''>(12);
  const [cellBatchLabel, setCellBatchLabel] = useState<string>('Партия #1');

  // Blocking modal state
  const [isBlockingDialogOpen, setIsBlockingDialogOpen] = useState<boolean>(false);
  const [selectedBlockReason, setSelectedBlockReason] = useState<string>('Брак стеклотары');
  const [customBlockReason, setCustomBlockReason] = useState<string>('');
  const [isBlockSubmitting, setIsBlockSubmitting] = useState<boolean>(false);

  // Dynamically derive existing rows from terminal cells
  const terminalRowsList = useMemo(() => {
    const set = new Set(cells.map((c) => c.row));
    return Array.from(set).sort();
  }, [cells]);

  // Helper for color badges & borders
  const getColorStyle = (color?: GlassColor) => {
    switch (color) {
      case 'brown':
      case 'amber':
        return 'bg-amber-950/80 border-amber-600/80 text-amber-200 shadow-amber-950/50';
      case 'green':
      case 'emerald':
        return 'bg-emerald-950/80 border-emerald-500/80 text-emerald-200 shadow-emerald-950/50';
      case 'clear':
        return 'bg-slate-800/90 border-sky-400/80 text-sky-200 shadow-sky-950/50';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  const getColorDot = (color?: GlassColor) => {
    switch (color) {
      case 'brown':
      case 'amber':
        return 'bg-amber-600';
      case 'green':
      case 'emerald':
        return 'bg-emerald-400';
      case 'clear':
        return 'bg-sky-300';
      default:
        return 'bg-slate-500';
    }
  };

  const getColorLabel = (color?: GlassColor) => {
    switch (color) {
      case 'brown':
      case 'amber':
        return 'Коричневая';
      case 'green':
      case 'emerald':
        return 'Зелёная';
      case 'clear':
        return 'Бесцветная';
      default:
        return '—';
    }
  };

  // Calculate age in days from YYYY-MM-DD
  const getAgeDays = (dateStr?: string) => {
    if (!dateStr) return 0;
    const mfg = new Date(dateStr).getTime();
    const now = new Date().getTime();
    const diff = Math.floor((now - mfg) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // Selected catalog bottle object if filtered
  const selectedBottleObj = catalog.find((b) => b.id === selectedCatalogBottleId);

  const handleQuickAddCellToRow = async (rowLetter: string) => {
    if (!onAddCell || isAddingCell) return;
    if (!isAdmin) {
      onRequestAdminAuth?.(`Добавить ячейку в Ряд ${rowLetter}`);
      return;
    }
    setIsAddingCell(true);
    const rowCells = cells.filter((c) => c.row === rowLetter);
    const maxPos = rowCells.reduce((max, c) => Math.max(max, c.position), 0);
    const nextPos = maxPos + 1;
    const nextCellId = `${rowLetter}${nextPos}`;
    await onAddCell(nextCellId, rowLetter, nextPos);
    setIsAddingCell(false);
  };

  // Group cells by dynamic rows
  const rowsData = terminalRowsList.map((row) => {
    const rowCells = cells.filter((c) => c.row === row).sort((a, b) => a.position - b.position);
    const occupiedCount = rowCells.filter((c) => c.status === 'occupied').length;

    const matchingCells = rowCells.filter((cell) => {
      if (cell.status === 'empty') return searchQuery === '' && selectedCatalogBottleId === 'all';

      if (selectedCatalogBottleId !== 'all' && selectedBottleObj) {
        if (cell.bottleName !== selectedBottleObj.name) {
          return false;
        }
      }

      const matchesSearch =
        !searchQuery ||
        cell.bottleName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cell.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cell.mfgDate?.includes(searchQuery);

      const matchesColor =
        colorFilter === 'all' ||
        (colorFilter === 'brown' && (cell.bottleColor === 'brown' || cell.bottleColor === 'amber')) ||
        (colorFilter === 'green' && (cell.bottleColor === 'green' || cell.bottleColor === 'emerald')) ||
        (colorFilter === 'clear' && cell.bottleColor === 'clear') ||
        cell.bottleColor === colorFilter;

      return matchesSearch && matchesColor;
    });

    return {
      row,
      cells: rowCells,
      occupiedCount,
      emptyCount: rowCells.length - occupiedCount,
      hasMatches: matchingCells.length > 0
    };
  });

  const totalOccupied = cells.filter((c) => c.status === 'occupied').length;

  return (
    <div className="space-y-4 pb-24">
      {/* Header & Catalog Dropdown Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Схема Терминала ({terminalRowsList.length} Рядов)</span>
              <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded-full border border-slate-700">
                {totalOccupied}/{cells.length}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Нажмите на любую ячейку для просмотра подробностей и партий
            </p>
          </div>

          {/* Color Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto max-w-full">
            <button
              onClick={() => setColorFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium whitespace-nowrap ${
                colorFilter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Все цвета
            </button>
            <button
              onClick={() => setColorFilter('brown')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 font-medium whitespace-nowrap ${
                colorFilter === 'brown' ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50' : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-600" />
              Коричневая
            </button>
            <button
              onClick={() => setColorFilter('green')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 font-medium whitespace-nowrap ${
                colorFilter === 'green' ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50' : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Зелёная
            </button>
            <button
              onClick={() => setColorFilter('clear')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 font-medium whitespace-nowrap ${
                colorFilter === 'clear' ? 'bg-sky-900/60 text-sky-300 border border-sky-700/50' : 'text-slate-400 hover:text-sky-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-300" />
              Бесцветная
            </button>
          </div>
        </div>

        {/* Catalog Dropdown Search & Text Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800">
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" />
            <select
              value={selectedCatalogBottleId}
              onChange={(e) => setSelectedCatalogBottleId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500 appearance-none"
            >
              <option value="all">🔍 Все сорта стеклотары ({catalog.length} шт.)</option>
              {catalog.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.supplier})
                </option>
              ))}
            </select>

            {selectedCatalogBottleId !== 'all' && (
              <button
                onClick={() => setSelectedCatalogBottleId('all')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white bg-slate-800 p-1 rounded-md text-[10px]"
              >
                ✕ Сброс
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по поставщику или дате..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rows Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rowsData.map(({ row, cells: rowCells, occupiedCount, emptyCount }) => (
          <div
            key={row}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-3 hover:border-slate-700 transition-colors shadow-md"
          >
            {/* Row Title Bar */}
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800/80 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold font-mono text-emerald-400 text-sm">
                  Ряд {row}
                </div>
                <div className="text-xs text-slate-400">
                  <span className="text-white font-semibold">{occupiedCount}</span> занято
                  <span className="mx-1">•</span>
                  <span className="text-emerald-400 font-semibold">{emptyCount}</span> свободно
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {onAddCell && (
                  <button
                    onClick={() => handleQuickAddCellToRow(row)}
                    disabled={isAddingCell}
                    title={isAdmin ? `Добавить следующую ячейку в Ряд ${row}` : 'Добавление ячеек доступно только администратору (нажмите для входа)'}
                    className={`text-xs ${
                      isAdmin
                        ? 'bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border-slate-700'
                        : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                    } active:scale-95 border px-2 py-1 rounded-lg transition-all flex items-center gap-1 font-medium disabled:opacity-50`}
                  >
                    {isAdmin ? (
                      <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Lock className="w-3 h-3 text-amber-400" />
                    )}
                    + Ячейка
                  </button>
                )}

                {emptyCount > 0 && onNavigateToUnloadRow && (
                  <button
                    onClick={() => onNavigateToUnloadRow(row)}
                    className="text-xs bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 font-medium"
                  >
                    <Truck className="w-3 h-3" />
                    Выгрузить в Ряд {row}
                  </button>
                )}
              </div>
            </div>

            {/* Spots Grid */}
            <div
              className="grid gap-1.5 overflow-x-auto pb-1"
              style={{
                gridTemplateColumns: `repeat(${Math.max(rowCells.length, 7)}, minmax(42px, 1fr))`
              }}
            >
              {rowCells.map((cell) => {
                const isOccupied = cell.status === 'occupied';
                const ageDays = isOccupied ? getAgeDays(cell.mfgDate) : 0;
                const hasMultipleBatches = isOccupied && cell.mfgDateDetails && cell.mfgDateDetails.length > 1;

                let isMatchingCatalog = true;
                if (selectedCatalogBottleId !== 'all' && selectedBottleObj) {
                  isMatchingCatalog = isOccupied && cell.bottleName === selectedBottleObj.name;
                }

                const isMatchingText =
                  !searchQuery ||
                  (isOccupied &&
                    (cell.bottleName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      cell.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      cell.mfgDate?.includes(searchQuery)));

                const isMatching = isMatchingCatalog && isMatchingText;

                return (
                  <button
                    key={cell.cellId}
                    onClick={() => {
                      setSelectedCell(cell);
                      setCellPalletsToTake(Math.min(12, cell.palletCount || 26));
                      if (cell.mfgDateDetails && cell.mfgDateDetails.length > 0) {
                        setCellBatchLabel(cell.mfgDateDetails[0].batchLabel || 'Партия #1');
                      } else {
                        setCellBatchLabel('Партия #1');
                      }
                      setIsBlockingDialogOpen(false);
                    }}
                    className={`relative aspect-square rounded-xl flex flex-col items-center justify-between p-1 text-center transition-all border ${
                      isOccupied
                        ? cell.isBlocked
                          ? 'bg-rose-950/80 border-rose-500 text-rose-200 ring-2 ring-rose-500/60 shadow-lg shadow-rose-950/60'
                          : `${getColorStyle(cell.bottleColor)} border-2`
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-600 hover:border-slate-600 hover:text-slate-300'
                    } ${!isMatching && isOccupied ? 'opacity-25 blur-[0.3px]' : 'opacity-100'}`}
                  >
                    {/* Blocked Cell Lock Indicator Badge */}
                    {cell.isBlocked && (
                      <div
                        title={`Заблокировано: ${cell.blockReason || 'Блокировка'}`}
                        className="absolute -top-1.5 -right-1.5 z-10 w-4 h-4 rounded-full bg-rose-600 border border-slate-900 text-white flex items-center justify-center shadow-md animate-pulse"
                      >
                        <Lock className="w-2.5 h-2.5" />
                      </div>
                    )}

                    {/* Cell Spot ID e.g. A1 */}
                    <span className="text-[10px] font-mono font-bold leading-none mt-0.5">
                      {cell.cellId}
                    </span>

                    {isOccupied ? (
                      <>
                        <span className="text-[9px] font-medium leading-tight truncate max-w-full px-0.5 text-slate-200">
                          {cell.bottleName?.split(' ')[0] || 'Бутылка'}
                        </span>
                        {/* Age, Multi-batch or Blocked Badge */}
                        {cell.isBlocked ? (
                          <span className="text-[8px] font-mono bg-rose-900 text-rose-200 px-1 py-0.2 rounded-md font-bold mb-0.5 flex items-center gap-0.5 border border-rose-700/60">
                            <Lock className="w-2 h-2 text-rose-300" />
                            БЛОК
                          </span>
                        ) : (
                          <span className="text-[8px] font-mono bg-slate-900/90 text-emerald-300 px-1 py-0.2 rounded-md font-bold mb-0.5 flex items-center gap-0.5">
                            {hasMultipleBatches && <Layers className="w-2 h-2 text-purple-400" />}
                            {ageDays}д.
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[9px] text-slate-600 font-mono mb-1">свободно</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modal / Drawer for Selected Cell Inspection */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 font-mono font-bold text-base">
                  {selectedCell.cellId}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Информация о ячейке {selectedCell.cellId}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Ряд {selectedCell.row}, Позиция {selectedCell.position} из 7
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCell(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedCell.status === 'occupied' ? (() => {
              const bottleMeta = catalog.find((b) => b.id === selectedCell.bottleId || b.name === selectedCell.bottleName);
              const bPerPallet = selectedCell.bottlesPerPallet || bottleMeta?.bottlesPerPallet || 2400;
              const totalBottlesInCell = (selectedCell.palletCount || DEFAULT_PALLET_CAPACITY) * bPerPallet;

              return (
              <div className="space-y-4">
                {/* Bottle Header Badge */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Сорт стеклотары:</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-md flex items-center gap-1 bg-slate-800 text-slate-200 border border-slate-700">
                      <span className={`w-2 h-2 rounded-full ${getColorDot(selectedCell.bottleColor)}`} />
                      {getColorLabel(selectedCell.bottleColor)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-lg font-bold text-white leading-tight">
                      {selectedCell.bottleName}
                    </p>
                    <span className="text-xs font-mono font-bold bg-emerald-950 border border-emerald-800 text-emerald-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
                      <Package className="w-3.5 h-3.5 text-emerald-400" />
                      {bPerPallet.toLocaleString('ru-RU')} бут./паллет
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="text-slate-400 flex items-center gap-1 mb-1">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      Основная дата:
                    </span>
                    <span className="font-mono font-bold text-sm text-white">
                      {selectedCell.mfgDate || 'Не указана'}
                    </span>
                    <p className="text-[10px] text-amber-400 font-medium mt-0.5">
                      На терминале: {getAgeDays(selectedCell.mfgDate)} дней
                    </p>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="text-slate-400 flex items-center gap-1 mb-1">
                      <Truck className="w-3.5 h-3.5 text-sky-400" />
                      Номер ТС / Всего:
                    </span>
                    <span className="font-mono font-bold text-sm text-white">
                      {selectedCell.truckPlate || 'Не указан'}
                    </span>
                    <p className="text-[10px] text-emerald-400 font-bold mt-0.5 font-mono">
                      {selectedCell.palletCount || DEFAULT_PALLET_CAPACITY} палл. (~{totalBottlesInCell.toLocaleString('ru-RU')} бут.)
                    </p>
                  </div>

                  <div className="col-span-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 flex items-center gap-1 mb-0.5 text-xs">
                        <Building2 className="w-3.5 h-3.5 text-amber-400" />
                        Поставщик:
                      </span>
                      <span className="font-medium text-slate-200 text-xs">
                        {selectedCell.supplier || 'Не указан'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 text-[10px] block">Упаковка:</span>
                      <span className="text-[11px] font-mono text-emerald-400 font-bold">
                        {bPerPallet.toLocaleString('ru-RU')} шт. в палете
                      </span>
                    </div>
                  </div>
                </div>

                {/* Comprehensive Batch Breakdown Card */}
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      Состав партий в ячейке {selectedCell.cellId}:
                    </span>
                    <span className="font-mono text-white bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                      Всего: {selectedCell.palletCount || DEFAULT_PALLET_CAPACITY} паллет (~{totalBottlesInCell.toLocaleString('ru-RU')} бут.)
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {selectedCell.mfgDateDetails && selectedCell.mfgDateDetails.length > 0 ? (
                      selectedCell.mfgDateDetails.map((detail, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg text-xs font-mono border border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-bold">{detail.batchLabel || `Партия #${idx + 1}`}</span>
                            <span className="text-slate-400">(Дата: {detail.mfgDate})</span>
                          </div>
                          <span className="font-bold text-white">{detail.palletCount} паллет</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg text-xs font-mono border border-slate-800">
                        <span className="text-emerald-400 font-bold">Партия #1 (Дата: {selectedCell.mfgDate})</span>
                        <span className="font-bold text-white">{selectedCell.palletCount || DEFAULT_PALLET_CAPACITY} паллет</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Blocked Product Warning Banner */}
                {selectedCell.isBlocked && (
                  <div className="bg-rose-950/80 border border-rose-600 rounded-xl p-3.5 space-y-2 shadow-lg shadow-rose-950/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-rose-400" />
                        Продукция заблокирована
                      </span>
                      <span className="text-[10px] bg-rose-900/90 text-rose-200 border border-rose-700 font-mono px-2 py-0.5 rounded-full font-bold">
                        ЗАПРЕТ ЗАВОЗА
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      Причина: <span className="text-rose-200">{selectedCell.blockReason || 'Блокировка продукции'}</span>
                    </p>
                    <div className="text-[11px] text-rose-300/80 font-mono flex items-center gap-2">
                      <span>Заблокировал: {selectedCell.blockedBy || 'Оператор'}</span>
                      {selectedCell.blockedAt && (
                        <>
                          <span>•</span>
                          <span>{new Date(selectedCell.blockedAt).toLocaleString('ru-RU')}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Unblock Control (Admin Only) */}
                {selectedCell.isBlocked && (
                  <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                    <div className="text-xs text-slate-300">
                      Разблокировать ячейку и разрешить завоз на склад может{' '}
                      <span className="text-amber-400 font-bold">только администратор</span>:
                    </div>
                    <button
                      onClick={async () => {
                        if (!isAdmin) {
                          onRequestAdminAuth?.(`Разблокировка ячейки ${selectedCell.cellId}`);
                          return;
                        }
                        if (onUnblockCell) {
                          setIsBlockSubmitting(true);
                          await onUnblockCell(selectedCell.cellId);
                          setSelectedCell((prev) =>
                            prev ? { ...prev, isBlocked: false, blockReason: '' } : null
                          );
                          setIsBlockSubmitting(false);
                        }
                      }}
                      disabled={isBlockSubmitting}
                      className="w-full min-h-[44px] bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 transition-all"
                    >
                      <Lock className="w-4 h-4" />
                      {isBlockSubmitting
                        ? 'Разблокировка...'
                        : isAdmin
                        ? `Разблокировать ячейку ${selectedCell.cellId}`
                        : `Разблокировать ячейку ${selectedCell.cellId} (Требуется пароль админа)`}
                    </button>
                  </div>
                )}

                {/* Partial Pickup Options (Disabled if blocked) */}
                {!selectedCell.isBlocked && (
                  <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2 text-xs">
                    <div className="font-bold text-slate-200">
                      Укажите количество паллет для забора:
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={selectedCell.palletCount || DEFAULT_PALLET_CAPACITY}
                        value={cellPalletsToTake}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setCellPalletsToTake('');
                            return;
                          }
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed)) {
                            const maxAllowed = selectedCell.palletCount || DEFAULT_PALLET_CAPACITY;
                            if (parsed > maxAllowed) {
                              setCellPalletsToTake(maxAllowed);
                            } else {
                              setCellPalletsToTake(parsed);
                            }
                          }
                        }}
                        onBlur={() => {
                          const maxAllowed = selectedCell.palletCount || DEFAULT_PALLET_CAPACITY;
                          if (cellPalletsToTake === '' || Number(cellPalletsToTake) < 1) {
                            setCellPalletsToTake(1);
                          } else if (Number(cellPalletsToTake) > maxAllowed) {
                            setCellPalletsToTake(maxAllowed);
                          }
                        }}
                        className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-slate-400 text-xs shrink-0">
                        из {selectedCell.palletCount || DEFAULT_PALLET_CAPACITY}
                      </span>

                      <div className="flex gap-1 ml-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => setCellPalletsToTake(1)}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono text-[10px] font-bold rounded-lg transition-colors"
                        >
                          1
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCellPalletsToTake(Math.min(6, selectedCell.palletCount || 26))
                          }
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono text-[10px] font-bold rounded-lg transition-colors"
                        >
                          6
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCellPalletsToTake(Math.min(12, selectedCell.palletCount || 26))
                          }
                          className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-mono text-[10px] font-bold rounded-lg transition-colors"
                        >
                          12
                        </button>
                        <button
                          type="button"
                          onClick={() => setCellPalletsToTake(selectedCell.palletCount || 26)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-mono text-[10px] font-bold rounded-lg transition-colors"
                        >
                          Всё
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cell Blocking Form (When not blocked) */}
                {!selectedCell.isBlocked && (
                  <div>
                    {!isBlockingDialogOpen ? (
                      <button
                        type="button"
                        onClick={() => setIsBlockingDialogOpen(true)}
                        className="w-full py-2.5 bg-slate-950 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                      >
                        <Lock className="w-3.5 h-3.5 text-rose-400" />
                        Заблокировать продукцию в ячейке {selectedCell.cellId}
                      </button>
                    ) : (
                      <div className="bg-rose-950/30 border border-rose-800/80 rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                            <Lock className="w-4 h-4 text-rose-400" />
                            Блокировка продукции в ячейке {selectedCell.cellId}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsBlockingDialogOpen(false)}
                            className="text-slate-400 hover:text-white text-xs"
                          >
                            ✕ Отмена
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] text-slate-300 font-medium block">
                            Причина блокировки:
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              'Брак стеклотары',
                              'Карантин партии',
                              'Бой / повреждение',
                              'Проверка лаборатории (ОТК)',
                              'Ожидание документов',
                              'Другая причина'
                            ].map((reason) => (
                              <button
                                key={reason}
                                type="button"
                                onClick={() => setSelectedBlockReason(reason)}
                                className={`px-2.5 py-1.5 rounded-lg text-left text-xs font-medium border transition-all ${
                                  selectedBlockReason === reason
                                    ? 'bg-rose-950 border-rose-500 text-rose-200 font-bold'
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                }`}
                              >
                                {reason}
                              </button>
                            ))}
                          </div>

                          {selectedBlockReason === 'Другая причина' && (
                            <input
                              type="text"
                              value={customBlockReason}
                              onChange={(e) => setCustomBlockReason(e.target.value)}
                              placeholder="Укажите причину блокировки..."
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 mt-1"
                            />
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={isBlockSubmitting}
                          onClick={async () => {
                            const finalReason =
                              selectedBlockReason === 'Другая причина'
                                ? customBlockReason.trim() || 'Блокировка продукции'
                                : selectedBlockReason;
                            if (onBlockCell) {
                              setIsBlockSubmitting(true);
                              await onBlockCell(selectedCell.cellId, finalReason);
                              setSelectedCell((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      isBlocked: true,
                                      blockReason: finalReason,
                                      blockedAt: new Date().toISOString()
                                    }
                                  : null
                              );
                              setIsBlockingDialogOpen(false);
                              setIsBlockSubmitting(false);
                            }
                          }}
                          className="w-full min-h-[42px] bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 transition-all"
                        >
                          <Lock className="w-4 h-4" />
                          {isBlockSubmitting
                            ? 'Блокировка...'
                            : `Заблокировать ячейку ${selectedCell.cellId}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 flex flex-col gap-2">
                  {selectedCell.isBlocked ? (
                    <div className="bg-rose-950/40 border border-rose-800/80 p-3 rounded-xl text-center space-y-1">
                      <div className="text-xs font-bold text-rose-300 flex items-center justify-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        Завоз на склад невозможен
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Ячейка заблокирована. Завоз продукции на склад запрещен до снятия блокировки
                        администратором.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (selectedCell.bottleName && selectedCell.mfgDate) {
                          const actualQty =
                            typeof cellPalletsToTake === 'number' && cellPalletsToTake >= 1
                              ? Math.min(cellPalletsToTake, selectedCell.palletCount || DEFAULT_PALLET_CAPACITY)
                              : 1;

                          if (onTransferPartialCells) {
                            onTransferPartialCells(
                              [
                                {
                                  cellId: selectedCell.cellId,
                                  batchLabel: cellBatchLabel,
                                  palletsToTake: actualQty
                                }
                              ],
                              selectedCell.bottleName,
                              selectedCell.bottleColor,
                              selectedCell.supplier
                            );
                          } else {
                            onTransferCells(
                              [selectedCell.cellId],
                              selectedCell.bottleName,
                              selectedCell.mfgDate,
                              actualQty,
                              selectedCell.bottleColor,
                              selectedCell.supplier
                            );
                          }
                          setSelectedCell(null);
                        }
                      }}
                      className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all"
                    >
                      <PackageCheck className="w-5 h-5" />
                      Забрать {typeof cellPalletsToTake === 'number' && cellPalletsToTake >= 1 ? Math.min(cellPalletsToTake, selectedCell.palletCount || DEFAULT_PALLET_CAPACITY) : 1} паллет (~{((typeof cellPalletsToTake === 'number' && cellPalletsToTake >= 1 ? Math.min(cellPalletsToTake, selectedCell.palletCount || DEFAULT_PALLET_CAPACITY) : 1) * bPerPallet).toLocaleString('ru-RU')} бут.) на склад
                    </button>
                  )}

                  <button
                    onClick={() => setSelectedCell(null)}
                    className="w-full h-10 text-slate-400 hover:text-white text-xs font-medium"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
              );
            })() : (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-emerald-400 font-mono font-bold text-lg">
                  {selectedCell.cellId}
                </div>
                <p className="text-sm font-medium text-slate-300">
                  Ячейка <span className="text-emerald-400 font-mono font-bold">{selectedCell.cellId}</span> свободна
                </p>

                {onNavigateToUnloadRow && (
                  <button
                    onClick={() => {
                      onNavigateToUnloadRow(selectedCell.row, selectedCell.cellId);
                      setSelectedCell(null);
                    }}
                    className="mt-2 min-h-[48px] w-full px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
                  >
                    <Truck className="w-4 h-4" />
                    Выгрузить машину в ячейку {selectedCell.cellId}
                  </button>
                )}

                {onDeleteCell && (
                  <div className="mt-1">
                    {!isAdmin ? (
                      <button
                        onClick={() => {
                          onRequestAdminAuth?.(`Удаление ячейки ${selectedCell.cellId}`);
                        }}
                        className="min-h-[40px] w-full px-4 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-amber-300 font-medium text-xs rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-800 hover:border-amber-800/60"
                      >
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        Удалить пустую ячейку {selectedCell.cellId} (Только админ)
                      </button>
                    ) : confirmDeleteCellId === selectedCell.cellId ? (
                      <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-3 text-center space-y-2">
                        <p className="text-xs text-rose-300 font-medium">
                          Точно удалить пустую ячейку <span className="font-mono font-bold text-white">{selectedCell.cellId}</span>?
                        </p>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={async () => {
                              await onDeleteCell(selectedCell.cellId);
                              setConfirmDeleteCellId(null);
                              setSelectedCell(null);
                            }}
                            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-md shadow-rose-950"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Да, удалить
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCellId(null)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteCellId(selectedCell.cellId)}
                        className="min-h-[40px] w-full px-4 bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 font-medium text-xs rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-800 hover:border-rose-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Удалить пустую ячейку {selectedCell.cellId}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
