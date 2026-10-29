import React, { useState, useEffect, useMemo } from 'react';
import { CatalogBottle, TerminalCell, FifoGroup, GlassColor, CellBatchDetail, getGlassColorLabel, TerminalLocation, LOCATION_LABELS } from '../types/terminal';
import { PartialCellPickup } from '../lib/firebase';
import { PackageCheck, Clock, CheckCircle2, ArrowDownAZ, Layers, Sparkles, Building2, MapPin, X, Hash, ChevronRight, Lock, ShieldAlert, Package, FileSpreadsheet } from 'lucide-react';

interface FifoWarehouseIntakeProps {
  catalog: CatalogBottle[];
  cells: TerminalCell[];
  onTransferCells: (cellIds: string[], bottleName: string, mfgDate: string, pallets: number, bottleColor?: GlassColor, supplier?: string) => Promise<boolean>;
  onTransferPartialCells: (pickups: PartialCellPickup[], bottleName: string, bottleColor?: GlassColor, supplier?: string) => Promise<boolean>;
  onUnblockCell?: (cellId: string) => Promise<boolean>;
  isAdmin?: boolean;
  onRequestAdminAuth?: (actionTitle?: string) => void;
  onOpenReports?: () => void;
}

export const FifoWarehouseIntake: React.FC<FifoWarehouseIntakeProps> = ({
  catalog,
  cells,
  onTransferCells,
  onTransferPartialCells,
  onUnblockCell,
  isAdmin = false,
  onRequestAdminAuth,
  onOpenReports
}) => {
  const [selectedBottleFilter, setSelectedBottleFilter] = useState<string>('all');
  const [selectedColorFilter, setSelectedColorFilter] = useState<GlassColor | 'all'>('all');
  const [confirmGroup, setConfirmGroup] = useState<FifoGroup | null>(null);

  // Partial Pickup Modal Controls
  const [selectedCellId, setSelectedCellId] = useState<string>('');
  const [selectedBatchLabel, setSelectedBatchLabel] = useState<string>('');
  const [palletsToTake, setPalletsToTake] = useState<number | ''>(12);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Synchronize modal state when confirmGroup opens
  useEffect(() => {
    if (confirmGroup && confirmGroup.cells.length > 0) {
      const firstCell = confirmGroup.cells[0];
      setSelectedCellId(firstCell.cellId);

      const cellBatches =
        firstCell.mfgDateDetails && firstCell.mfgDateDetails.length > 0
          ? firstCell.mfgDateDetails
          : [
              {
                batchLabel: 'Партия #1',
                mfgDate: firstCell.mfgDate || '2026-01-01',
                palletCount: firstCell.palletCount || 26
              }
            ];

      const initialBatch = cellBatches[0];
      setSelectedBatchLabel(initialBatch.batchLabel || 'Партия #1');
      setPalletsToTake(Math.min(12, initialBatch.palletCount));
    }
  }, [confirmGroup]);

  // Derived current cell & batch objects
  const selectedCell = confirmGroup?.cells.find((c) => c.cellId === selectedCellId);

  const availableBatchesInCell: CellBatchDetail[] = useMemo(() => {
    if (!selectedCell) return [];
    if (selectedCell.mfgDateDetails && selectedCell.mfgDateDetails.length > 0) {
      return selectedCell.mfgDateDetails;
    }
    return [
      {
        batchLabel: 'Партия #1',
        mfgDate: selectedCell.mfgDate || '2026-01-01',
        palletCount: selectedCell.palletCount || 26
      }
    ];
  }, [selectedCell]);

  const selectedBatchObj = availableBatchesInCell.find(
    (b) => (b.batchLabel || 'Партия #1') === selectedBatchLabel
  ) || availableBatchesInCell[0];

  const maxPalletsAvailableInBatch = selectedBatchObj?.palletCount || selectedCell?.palletCount || 26;

  // Handle cell switch inside modal
  const handleCellSwitch = (cellId: string) => {
    setSelectedCellId(cellId);
    const targetCell = confirmGroup?.cells.find((c) => c.cellId === cellId);
    const batches =
      targetCell?.mfgDateDetails && targetCell.mfgDateDetails.length > 0
        ? targetCell.mfgDateDetails
        : [
            {
              batchLabel: 'Партия #1',
              mfgDate: targetCell?.mfgDate || '2026-01-01',
              palletCount: targetCell?.palletCount || 26
            }
          ];

    const newBatch = batches[0];
    setSelectedBatchLabel(newBatch.batchLabel || 'Партия #1');
    setPalletsToTake(Math.min(12, newBatch.palletCount));
  };

  // Handle batch switch inside modal
  const handleBatchSwitch = (batchLabel: string) => {
    setSelectedBatchLabel(batchLabel);
    const foundBatch = availableBatchesInCell.find(
      (b) => (b.batchLabel || 'Партия #1') === batchLabel
    );
    if (foundBatch) {
      setPalletsToTake(Math.min(12, foundBatch.palletCount));
    }
  };

  // Get occupied cells only
  const occupiedCells = cells.filter((c) => c.status === 'occupied' && c.bottleName && c.mfgDate);

  // Calculate age in days
  const getAgeDays = (dateStr: string) => {
    const mfg = new Date(dateStr).getTime();
    const now = new Date().getTime();
    const diff = Math.floor((now - mfg) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // Group occupied cells by Bottle Name + Row
  const fifoGroupsMap = new Map<string, FifoGroup>();

  occupiedCells.forEach((cell) => {
    const bottleName = cell.bottleName || 'Неизвестная бутылка';
    const cellColor = cell.bottleColor || 'clear';

    // 1. Dedicated Color Filter
    if (selectedColorFilter !== 'all') {
      const matchColor =
        (selectedColorFilter === 'brown' && (cellColor === 'brown' || cellColor === 'amber')) ||
        (selectedColorFilter === 'green' && (cellColor === 'green' || cellColor === 'emerald')) ||
        (selectedColorFilter === 'clear' && cellColor === 'clear') ||
        cellColor === selectedColorFilter;
      if (!matchColor) return;
    }

    // 2. Specific Catalog Bottle Filter (checks both Name and Color)
    if (selectedBottleFilter !== 'all') {
      const selectedCatalogBottle = catalog.find((b) => b.id === selectedBottleFilter);
      if (selectedCatalogBottle) {
        const catColor = selectedCatalogBottle.color || 'clear';
        const colorMatch =
          cellColor === catColor ||
          ((catColor === 'green' || catColor === 'emerald') && (cellColor === 'green' || cellColor === 'emerald')) ||
          ((catColor === 'brown' || catColor === 'amber') && (cellColor === 'brown' || cellColor === 'amber'));
        if (cell.bottleName !== selectedCatalogBottle.name || !colorMatch) {
          return;
        }
      }
    }

    const cellBatches: CellBatchDetail[] =
      cell.mfgDateDetails && cell.mfgDateDetails.length > 0
        ? cell.mfgDateDetails
        : [
            {
              batchLabel: 'Партия #1',
              mfgDate: cell.mfgDate || '2026-01-01',
              palletCount: cell.palletCount || 26
            }
          ];

    const supplier = cell.supplier || 'Не указан';
    const color = cell.bottleColor || 'clear';
    // Group by bottle identity + manufacture date to keep FIFO batches distinct
    const key = `${bottleName}_${supplier}_${color}_${cell.mfgDate}`;

    if (!fifoGroupsMap.has(key)) {
      const cellDates = cellBatches.map((b) => b.mfgDate);
      const sortedCellDates = [...cellDates].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );
      const primaryDate = sortedCellDates[0] || cell.mfgDate || '2026-01-01';

      fifoGroupsMap.set(key, {
        bottleId: cell.bottleId || '',
        bottleName,
        mfgDate: primaryDate,
        allMfgDates: Array.from(new Set(cellDates)),
        supplier: cell.supplier || 'Не указан',
        color: cell.bottleColor || 'emerald',
        cells: [cell],
        totalPallets: cell.palletCount || 26,
        isOldest: false,
        ageDays: getAgeDays(primaryDate),
        allBatches: [...cellBatches]
      });
    } else {
      const group = fifoGroupsMap.get(key)!;
      group.cells.push(cell);
      group.totalPallets += cell.palletCount || 26;

      cellBatches.forEach((cb) => {
        group.allBatches?.push(cb);
        if (group.allMfgDates && !group.allMfgDates.includes(cb.mfgDate)) {
          group.allMfgDates.push(cb.mfgDate);
        }
      });

      if (group.allMfgDates && group.allMfgDates.length > 0) {
        const sorted = [...group.allMfgDates].sort(
          (a, b) => new Date(a).getTime() - new Date(b).getTime()
        );
        group.mfgDate = sorted[0];
        group.ageDays = getAgeDays(sorted[0]);
      }
    }
  });

  const fifoGroups = Array.from(fifoGroupsMap.values()).sort((a, b) => {
    return new Date(a.mfgDate).getTime() - new Date(b.mfgDate).getTime();
  });

  if (fifoGroups.length > 0) {
    fifoGroups[0].isOldest = true;
  }

  // Confirm Partial Pickup
  const handleConfirmPartialPickup = async () => {
    if (!confirmGroup || !selectedCellId) return;

    if (selectedCell?.isBlocked) {
      alert(`Ячейка ${selectedCellId} заблокирована! Завоз на склад запрещен.`);
      return;
    }

    const actualQty = typeof palletsToTake === 'number' ? Math.max(1, palletsToTake) : 1;
    const finalTake = Math.min(actualQty, maxPalletsAvailableInBatch);

    setIsSubmitting(true);

    const pickupSpecs: PartialCellPickup[] = [
      {
        cellId: selectedCellId,
        batchLabel: selectedBatchObj?.batchLabel || 'Партия #1',
        mfgDate: selectedBatchObj?.mfgDate,
        palletsToTake: finalTake
      }
    ];

    const ok = await onTransferPartialCells(pickupSpecs, confirmGroup.bottleName, confirmGroup.color, confirmGroup.supplier);

    if (ok) {
      const remainingInCell = (selectedCell?.palletCount || 26) - finalTake;
      setSuccessToast(
        `Завоз на склад оформлен! Забрано ${finalTake} паллет из ячейки ${selectedCellId} (${selectedBatchObj?.batchLabel || 'Партия'}). ${
          remainingInCell > 0
            ? `В ячейке ${selectedCellId} осталось ${remainingInCell} паллет.`
            : `Ячейка ${selectedCellId} полностью освобождена!`
        }`
      );
      setConfirmGroup(null);
      setTimeout(() => setSuccessToast(null), 5000);
    }
    setIsSubmitting(false);
  };

  // Confirm Full Group Pickup (All unblocked Cells & All Batches)
  const handleConfirmFullPickup = async () => {
    if (!confirmGroup) return;

    const unblockedCells = confirmGroup.cells.filter((c) => !c.isBlocked);
    if (unblockedCells.length === 0) {
      alert('Все ячейки данной группы заблокированы!');
      return;
    }

    setIsSubmitting(true);

    const cellIds = unblockedCells.map((c) => c.cellId);
    const unblockedPallets = unblockedCells.reduce(
      (sum, c) => sum + (c.palletCount || 26),
      0
    );

    const ok = await onTransferCells(
      cellIds,
      confirmGroup.bottleName,
      confirmGroup.mfgDate,
      unblockedPallets,
      confirmGroup.color,
      confirmGroup.supplier
    );

    if (ok) {
      setSuccessToast(
        `Завоз группы оформлен! Освобождены ячейки: ${cellIds.join(', ')} (${unblockedPallets} паллет).`
      );
      setConfirmGroup(null);
      setTimeout(() => setSuccessToast(null), 5000);
    }
    setIsSubmitting(false);
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

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      {/* FIFO Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-800/60 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <PackageCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Завоз Тары на Склад (FIFO)</span>
                <span className="text-[10px] font-extrabold bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-mono">
                  СНАЧАЛА СТАРАЯ
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Выборочный забор по ячейкам, партиям и точному числу паллет
              </p>
            </div>
          </div>

          {onOpenReports && (
            <button
              type="button"
              onClick={onOpenReports}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0 border ${
                isAdmin
                  ? 'bg-slate-900/90 hover:bg-emerald-950 text-emerald-300 hover:text-white border-emerald-700/60'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
              title={isAdmin ? "Открыть ведомость остатков и партий (Excel / PDF)" : "Отчеты доступны только для администратора (требуется пароль)"}
            >
              {isAdmin ? (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Ведомость остатков</span>
            </button>
          )}
        </div>

        {/* Filter Controls: Color & Bottle */}
        <div className="mt-3 pt-3 border-t border-emerald-900/50 flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 shrink-0">
              <ArrowDownAZ className="w-4 h-4 text-emerald-400" />
              Фильтр стеклотары для завоза:
            </label>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Color filter tabs */}
              <div className="flex items-center bg-slate-950 border border-emerald-800/80 rounded-xl p-1 gap-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSelectedColorFilter('all')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
                    selectedColorFilter === 'all'
                      ? 'bg-emerald-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Все цвета
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedColorFilter('green')}
                  className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    selectedColorFilter === 'green'
                      ? 'bg-emerald-950 border border-emerald-500 text-emerald-200 font-bold'
                      : 'text-slate-400 hover:text-emerald-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
                  Зелёная
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedColorFilter('brown')}
                  className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    selectedColorFilter === 'brown'
                      ? 'bg-amber-950 border border-amber-600 text-amber-200 font-bold'
                      : 'text-slate-400 hover:text-amber-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-600 inline-block shrink-0" />
                  Коричневая
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedColorFilter('clear')}
                  className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    selectedColorFilter === 'clear'
                      ? 'bg-slate-800 border border-sky-400 text-sky-200 font-bold'
                      : 'text-slate-400 hover:text-sky-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-300 inline-block shrink-0" />
                  Бесцветная
                </button>
              </div>

              {/* Bottle dropdown */}
              <select
                value={selectedBottleFilter}
                onChange={(e) => setSelectedBottleFilter(e.target.value)}
                className="w-full sm:w-auto bg-slate-950 border border-emerald-800/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-emerald-400"
              >
                <option value="all">Все сорта ({occupiedCells.length} ячеек)</option>
                {catalog.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} • {getGlassColorLabel(b.color)} ({b.supplier})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="bg-emerald-950 border border-emerald-500 text-emerald-200 p-3.5 rounded-2xl flex items-center gap-3 text-xs animate-in fade-in shadow-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="font-semibold">{successToast}</div>
        </div>
      )}

      {/* FIFO Sorted Batches List */}
      <div className="space-y-3">
        {fifoGroups.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <Layers className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-300">На терминале нет выбранной стеклотары</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Все ячейки данной категории свободны или выгрузка ещё не проводилась.
            </p>
          </div>
        ) : (
          fifoGroups.map((group, index) => {
            const isFirstFifo = index === 0;
            const hasMultipleBatches = group.allBatches && group.allBatches.length > 1;
            const blockedCells = group.cells.filter((c) => c.isBlocked);
            const unblockedCells = group.cells.filter((c) => !c.isBlocked);
            const isAllBlocked = group.cells.length > 0 && unblockedCells.length === 0;

            return (
              <div
                key={`${group.bottleName}_${group.cells[0].cellId}_${index}`}
                className={`bg-slate-900 border rounded-2xl p-4 shadow-xl transition-all relative overflow-hidden space-y-3 ${
                  isAllBlocked
                    ? 'border-rose-800/80 bg-rose-950/20'
                    : isFirstFifo
                    ? 'border-emerald-500/80 ring-2 ring-emerald-500/20 bg-gradient-to-br from-slate-900 via-emerald-950/20 to-slate-900'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* FIFO Recommendation Tag for #1 Oldest Batch */}
                {isFirstFifo && !isAllBlocked && (
                  <div className="bg-emerald-500 text-slate-950 font-extrabold text-[11px] px-3 py-1 rounded-br-xl rounded-tl-xl font-mono flex items-center gap-1.5 -mt-4 -ml-4 mb-1 inline-flex shadow-lg shadow-emerald-950/50">
                    <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                    РЕКОМЕНДУЕТСЯ К ЗАВОЗУ (FIFO #1 - САМАЯ СТАРАЯ ДАТА)
                  </div>
                )}

                {/* All Blocked Notice */}
                {isAllBlocked && (
                  <div className="bg-rose-950/60 border border-rose-800 p-2.5 rounded-xl flex items-center justify-between text-xs text-rose-300">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Lock className="w-4 h-4 text-rose-400" />
                      Все ячейки группы заблокированы ({blockedCells.map((c) => c.cellId).join(', ')})
                    </span>
                    <span className="text-[10px] bg-rose-900 font-mono px-2 py-0.5 rounded text-rose-200 font-bold">
                      ЗАПРЕТ ЗАВОЗА
                    </span>
                  </div>
                )}

                {/* Partially Blocked Notice */}
                {!isAllBlocked && blockedCells.length > 0 && (
                  <div className="bg-amber-950/40 border border-amber-800/60 p-2 rounded-xl flex items-center gap-2 text-[11px] text-amber-300">
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>
                      Внимание: {blockedCells.length} яч. ({blockedCells.map((c) => c.cellId).join(', ')})
                      заблокированы и исключены из завоза
                    </span>
                  </div>
                )}

                {(() => {
                  const bMeta = catalog.find((b) => b.id === group.bottleId || b.name === group.bottleName);
                  const bPerPallet = bMeta?.bottlesPerPallet || group.cells[0]?.bottlesPerPallet || 2400;
                  const groupTotalBottles = group.totalPallets * bPerPallet;

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        {/* Bottle Info */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`w-2.5 h-2.5 rounded-full ${getColorDot(group.color)}`} />
                            <h3 className="text-base font-bold text-white leading-tight">
                              {group.bottleName}
                            </h3>
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-medium">
                              {getColorLabel(group.color)}
                            </span>
                            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono px-2 py-0.5 rounded font-bold flex items-center gap-1">
                              <Package className="w-3 h-3 text-emerald-400" />
                              {bPerPallet.toLocaleString('ru-RU')} бут./паллет
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-medium">
                            <span className="flex items-center gap-1 text-slate-300">
                              <Building2 className="w-3.5 h-3.5 text-slate-500" />
                              {group.supplier}
                            </span>
                          </div>
                        </div>

                        {/* Manufacturing Date & Age Highlight */}
                        <div className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-3 shrink-0">
                          <Clock
                            className={`w-5 h-5 ${
                              isAllBlocked ? 'text-rose-400' : isFirstFifo ? 'text-emerald-400' : 'text-slate-400'
                            }`}
                          />
                          <div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {hasMultipleBatches ? 'Старшая дата партии:' : 'Дата производства:'}
                            </div>
                            <div className="font-mono font-bold text-sm text-white">
                              {group.mfgDate}
                            </div>
                            <div className="text-[10px] font-bold text-amber-400 font-mono">
                              {group.ageDays} дн. на складе
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Multi-Batch Detailed Composition List */}
                      <div className="bg-slate-950/90 border border-slate-800/80 p-2.5 rounded-xl space-y-1.5">
                        <div className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-emerald-400" />
                            Состав партий на терминале ({group.allBatches?.length || 1} шт.):
                          </span>
                          <span className="font-mono text-white bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                            Всего: {group.totalPallets} паллет (~{groupTotalBottles.toLocaleString('ru-RU')} бут.)
                          </span>
                        </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {group.allBatches && group.allBatches.length > 0 ? (
                      group.allBatches.map((batchDetail, bIdx) => (
                        <div
                          key={bIdx}
                          className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-mono"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-bold">
                              {batchDetail.batchLabel || `Партия #${bIdx + 1}`}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              ({batchDetail.mfgDate})
                            </span>
                          </div>
                          <span className="font-bold text-white">
                            {batchDetail.palletCount} паллет
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-mono">
                        <span className="text-emerald-400 font-bold">Партия #1 ({group.mfgDate})</span>
                        <span className="font-bold text-white">{group.totalPallets} паллет</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Location Details on Terminal & Pickup Action */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl">
                  <div>
                    <div className="text-xs text-slate-400 font-medium flex items-center gap-1 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      Местоположение на терминале:
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-white text-base bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {LOCATION_LABELS[group.cells[0].location || 'эстакада']}
                      </span>
                      <span className="font-mono font-bold text-white text-sm bg-slate-850 px-2 py-0.5 rounded border border-slate-800">
                        Ряд {group.cells[0].row}
                      </span>
                      <span className="font-mono font-bold text-emerald-300 text-sm">
                        Ячейки: {group.cells.map((c) => c.cellId).join(', ')}
                      </span>
                    </div>
                  </div>

                  {/* Pickup Button */}
                  {isAllBlocked ? (
                    <button
                      onClick={() => setConfirmGroup(group)}
                      className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800"
                    >
                      <Lock className="w-4 h-4" />
                      Заблокировано (Снять блок)
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmGroup(group)}
                      className={`w-full sm:w-auto min-h-[44px] px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${
                        isFirstFifo
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                          : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700'
                      }`}
                    >
                      <PackageCheck className="w-4 h-4" />
                      Забрать на склад (Выбрать кол-во)
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      );
          })
        )}
      </div>

      {/* Interactive Selective Pickup Modal */}
      {confirmGroup && (() => {
        const modalBottleMeta = catalog.find((b) => b.id === confirmGroup.bottleId || b.name === confirmGroup.bottleName);
        const modalBPerPallet = selectedCell?.bottlesPerPallet || modalBottleMeta?.bottlesPerPallet || 2400;

        return (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md mx-auto rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm sm:text-base">
                <PackageCheck className="w-5 h-5 shrink-0" />
                <span>Выборочный забор тары на склад</span>
              </div>
              <button
                onClick={() => setConfirmGroup(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Bottle Info with Color Badge */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-slate-400 text-[11px]">Сорт стеклотары:</div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className={`w-3 h-3 rounded-full ${getColorDot(confirmGroup.color)} shrink-0`} />
                      <span className="font-bold text-white text-sm sm:text-base">{confirmGroup.bottleName}</span>
                      <span className="text-[11px] bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700 font-medium">
                        Цвет: {getColorLabel(confirmGroup.color)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1">
                      <Package className="w-3 h-3 text-emerald-400" />
                      {modalBPerPallet.toLocaleString('ru-RU')} бут./палл.
                    </span>
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px]">Место:</div>
                      <div className="font-mono font-bold text-emerald-400 text-xs">
                        {LOCATION_LABELS[confirmGroup.cells[0].location || 'эстакада']}, Ряд {confirmGroup.cells[0].row}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-900">
                  <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Поставщик: <strong className="text-slate-300">{confirmGroup.supplier}</strong></span>
                </div>
              </div>

              {/* Step 1: Select Cell */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                  1. Выберите ячейку на ряду:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {confirmGroup.cells.map((cell) => {
                    const isSelected = cell.cellId === selectedCellId;
                    const isCellBlocked = cell.isBlocked;
                    return (
                      <button
                        key={cell.cellId}
                        type="button"
                        onClick={() => handleCellSwitch(cell.cellId)}
                        className={`p-2.5 rounded-xl border font-mono text-xs flex flex-col items-center justify-center transition-all relative ${
                          isCellBlocked
                            ? isSelected
                              ? 'bg-rose-950 border-rose-500 text-rose-200 font-bold ring-2 ring-rose-500/50'
                              : 'bg-rose-950/40 border-rose-900/80 text-rose-300 hover:border-rose-700'
                            : isSelected
                            ? 'bg-emerald-950 border-emerald-500 text-white font-bold ring-2 ring-emerald-500/30'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {isCellBlocked && (
                          <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-rose-600 flex items-center justify-center text-white">
                            <Lock className="w-2 h-2" />
                          </div>
                        )}
                        <span className="font-bold text-sm">{cell.cellId}</span>
                        <span
                          className={`text-[10px] mt-0.5 ${
                            isCellBlocked ? 'text-rose-400 font-bold' : 'text-emerald-400'
                          }`}
                        >
                          {isCellBlocked ? '🔒 БЛОК' : `${cell.palletCount || 26} паллет`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Blocked Cell Notice inside Modal */}
              {selectedCell?.isBlocked && (
                <div className="bg-rose-950/80 border border-rose-600 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-rose-400" />
                      Ячейка {selectedCell.cellId} заблокирована
                    </span>
                    <span className="text-[10px] bg-rose-900 text-rose-200 px-2 py-0.5 rounded font-bold font-mono">
                      ЗАПРЕТ ЗАВОЗА
                    </span>
                  </div>
                  <p className="text-xs text-white">
                    Причина: <span className="text-rose-200 font-semibold">{selectedCell.blockReason || 'Блокировка продукции'}</span>
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Завоз продукции из этой ячейки строго запрещен. Разблокировать может только администратор.
                  </p>
                  {onUnblockCell && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isAdmin) {
                          onRequestAdminAuth?.(`Разблокировать ячейку ${selectedCell.cellId}`);
                          return;
                        }
                        await onUnblockCell(selectedCell.cellId);
                        setConfirmGroup((prev) =>
                          prev
                            ? {
                                ...prev,
                                cells: prev.cells.map((c) =>
                                  c.cellId === selectedCell.cellId
                                    ? { ...c, isBlocked: false, blockReason: '' }
                                    : c
                                )
                              }
                            : null
                        );
                      }}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-950/50"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Разблокировать ячейку {selectedCell.cellId} {isAdmin ? '(Вы админ)' : '(Только админ)'}
                    </button>
                  )}
                </div>
              )}

              {/* Step 2: Select Batch in Cell (Anti-overflow wrapping) */}
              {selectedCell && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                    2. Выберите партию в ячейке {selectedCell.cellId}:
                  </label>

                  <div className="space-y-1.5">
                    {availableBatchesInCell.map((batchDetail, idx) => {
                      const bLabel = batchDetail.batchLabel || `Партия #${idx + 1}`;
                      const isSelected = bLabel === selectedBatchLabel;

                      return (
                        <div
                          key={idx}
                          onClick={() => handleBatchSwitch(bLabel)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-emerald-950/80 border-emerald-500 text-white font-bold ring-1 ring-emerald-500/30'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="radio"
                              name="batchChoice"
                              checked={isSelected}
                              onChange={() => handleBatchSwitch(bLabel)}
                              className="w-4 h-4 text-emerald-500 focus:ring-emerald-500 bg-slate-950 border-slate-700 shrink-0"
                            />
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="font-mono text-xs text-white font-bold">
                                {bLabel}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                {batchDetail.mfgDate}
                              </span>
                            </div>
                          </div>

                          <span className="font-mono text-[11px] text-emerald-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0 whitespace-nowrap">
                            {batchDetail.palletCount} палл.
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 3: Input Pallet Count to Take (Responsive Stepper & Preset Grid) */}
              <div className="bg-slate-950 border border-slate-800 p-3 sm:p-3.5 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between gap-1">
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                    3. Паллет на склад:
                  </label>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    В наличии: <strong className="text-white">{maxPalletsAvailableInBatch} палл.</strong>
                  </span>
                </div>

                {/* Input with Quick Steppers */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = typeof palletsToTake === 'number' ? palletsToTake : 1;
                      setPalletsToTake(Math.max(1, cur - 1));
                    }}
                    disabled={Number(palletsToTake) <= 1}
                    className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 active:scale-95 text-slate-200 font-bold text-lg flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
                  >
                    -
                  </button>

                  <div className="relative flex-1 min-w-0">
                    <input
                      type="number"
                      min={1}
                      max={maxPalletsAvailableInBatch}
                      value={palletsToTake}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setPalletsToTake('');
                        } else {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed)) {
                            if (parsed > maxPalletsAvailableInBatch) {
                              setPalletsToTake(maxPalletsAvailableInBatch);
                            } else {
                              setPalletsToTake(parsed);
                            }
                          }
                        }
                      }}
                      onBlur={() => {
                        if (palletsToTake === '' || Number(palletsToTake) < 1) {
                          setPalletsToTake(Math.min(1, maxPalletsAvailableInBatch));
                        } else if (Number(palletsToTake) > maxPalletsAvailableInBatch) {
                          setPalletsToTake(maxPalletsAvailableInBatch);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-center text-lg font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-medium pointer-events-none">
                      палл.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const cur = typeof palletsToTake === 'number' ? palletsToTake : 0;
                      setPalletsToTake(Math.min(maxPalletsAvailableInBatch, cur + 1));
                    }}
                    disabled={Number(palletsToTake) >= maxPalletsAvailableInBatch}
                    className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 active:scale-95 text-slate-200 font-bold text-lg flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Preset Quick Buttons Grid */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPalletsToTake(Math.min(1, maxPalletsAvailableInBatch))}
                    className="py-1.5 bg-slate-900 border border-slate-800 text-slate-300 font-mono font-bold text-xs rounded-lg hover:border-slate-700 hover:text-white transition-colors"
                  >
                    1 палл.
                  </button>
                  <button
                    type="button"
                    onClick={() => setPalletsToTake(Math.min(6, maxPalletsAvailableInBatch))}
                    className="py-1.5 bg-slate-900 border border-slate-800 text-slate-300 font-mono font-bold text-xs rounded-lg hover:border-slate-700 hover:text-white transition-colors"
                  >
                    6 палл.
                  </button>
                  <button
                    type="button"
                    onClick={() => setPalletsToTake(Math.min(12, maxPalletsAvailableInBatch))}
                    className="py-1.5 bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono font-bold text-xs rounded-lg hover:bg-emerald-900 transition-colors"
                  >
                    12 палл.
                  </button>
                  <button
                    type="button"
                    onClick={() => setPalletsToTake(maxPalletsAvailableInBatch)}
                    className="py-1.5 bg-slate-800 border border-slate-700 text-white font-mono font-bold text-xs rounded-lg hover:bg-slate-700 transition-colors truncate px-1"
                  >
                    Всё ({maxPalletsAvailableInBatch})
                  </button>
                </div>

                {/* Remaining Stock Preview */}
                <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 text-[11px] font-mono flex items-center justify-between text-slate-300">
                  <span>Остаток в ячейке {selectedCellId}:</span>
                  {(() => {
                    const takeVal = typeof palletsToTake === 'number' ? palletsToTake : 0;
                    const remPallets = Math.max(0, (selectedCell?.palletCount || 26) - takeVal);
                    const remBottles = remPallets * modalBPerPallet;
                    return (
                      <span className="font-bold text-emerald-400">
                        {remPallets} паллет (~{remBottles.toLocaleString('ru-RU')} бут.)
                        {remPallets === 0 ? ' — Освободится' : ''}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col gap-2">
              {selectedCell?.isBlocked ? (
                <div className="bg-rose-950/40 border border-rose-800/80 p-3 rounded-xl text-center space-y-1">
                  <div className="text-xs font-bold text-rose-300 flex items-center justify-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    Завоз на склад невозможен
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Ячейка {selectedCellId} заблокирована. Завоз продукции на склад запрещен до снятия
                    блокировки администратором.
                  </p>
                </div>
              ) : (
                (() => {
                  const actualTake = typeof palletsToTake === 'number' && palletsToTake >= 1 ? palletsToTake : 1;
                  const actualBottles = actualTake * modalBPerPallet;

                  return (
                    <button
                      type="button"
                      onClick={handleConfirmPartialPickup}
                      disabled={isSubmitting || !selectedCellId || Number(palletsToTake) < 1}
                      className="w-full min-h-[46px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all px-3 py-2 text-center"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {isSubmitting
                          ? 'Обработка завоза...'
                          : `Подтвердить забор (${actualTake} палл., ~${actualBottles.toLocaleString('ru-RU')} бут.)`}
                      </span>
                    </button>
                  );
                })()
              )}

              {(() => {
                const unblockedCells = confirmGroup.cells.filter((c) => !c.isBlocked);
                const unblockedPallets = unblockedCells.reduce(
                  (sum, c) => sum + (c.palletCount || 26),
                  0
                );
                const hasUnblocked = unblockedCells.length > 0;
                const unblockedBottles = unblockedPallets * modalBPerPallet;

                return (
                  <button
                    type="button"
                    onClick={handleConfirmFullPickup}
                    disabled={isSubmitting || !hasUnblocked}
                    className={`w-full py-2.5 font-semibold text-xs rounded-xl transition-colors ${
                      !hasUnblocked
                        ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {!hasUnblocked
                      ? 'Все ячейки группы заблокированы'
                      : `Забрать все доступные ${unblockedPallets} паллет (~${unblockedBottles.toLocaleString('ru-RU')} бут.)`}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

