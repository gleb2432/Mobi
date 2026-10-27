import React, { useState, useEffect, useMemo } from 'react';
import { CatalogBottle, TerminalCell, TERMINAL_ROWS, GlassColor, UnloadingBatch, DEFAULT_PALLET_CAPACITY, CellBatchDetail, getGlassColorLabel, TerminalLocation, LOCATION_LABELS } from '../types/terminal';
import { Truck, Plus, Calendar, AlertCircle, CheckCircle2, ShieldCheck, Check, MousePointerClick, Trash2, Layers, Hash, Sparkles, Package, MapPin } from 'lucide-react';

interface BatchItem {
  id: number;
  mfgDate: string;
  palletCount: number | '';
  label: string;
  colorBg: string;
  colorBorder: string;
  colorText: string;
  badgeBg: string;
}

const BATCH_COLORS = [
  {
    colorBg: 'bg-emerald-950',
    colorBorder: 'border-emerald-500',
    colorText: 'text-emerald-300',
    badgeBg: 'bg-emerald-500 text-slate-950'
  },
  {
    colorBg: 'bg-sky-950',
    colorBorder: 'border-sky-500',
    colorText: 'text-sky-300',
    badgeBg: 'bg-sky-500 text-slate-950'
  },
  {
    colorBg: 'bg-amber-950',
    colorBorder: 'border-amber-500',
    colorText: 'text-amber-300',
    badgeBg: 'bg-amber-500 text-slate-950'
  },
  {
    colorBg: 'bg-purple-950',
    colorBorder: 'border-purple-500',
    colorText: 'text-purple-300',
    badgeBg: 'bg-purple-500 text-slate-950'
  }
];

interface TruckUnloadingProps {
  catalog: CatalogBottle[];
  cells: TerminalCell[];
  onUnloadTruck: (
    batchData: UnloadingBatch,
    cellAssignments: Array<{ cellId: string; mfgDate: string; palletCount: number; mfgDateDetails?: CellBatchDetail[] }>
  ) => Promise<boolean>;
  onAddBottleToCatalog: (bottle: CatalogBottle) => Promise<boolean>;
  presetRow?: string;
  presetCellId?: string;
}

export const TruckUnloading: React.FC<TruckUnloadingProps> = ({
  catalog,
  cells,
  onUnloadTruck,
  onAddBottleToCatalog,
  presetRow = 'A',
  presetCellId
}) => {
  // Form State
  const [selectedBottleId, setSelectedBottleId] = useState<string>(catalog[0]?.id || '');
  const [truckPlate, setTruckPlate] = useState<string>('');
  const [supplier, setSupplier] = useState<string>(catalog[0]?.supplier || '');
  const [selectedLocation, setSelectedLocation] = useState<TerminalLocation>('эстакада');
  const [selectedRow, setSelectedRow] = useState<string>(presetRow);

  // Currently selected catalog bottle
  const selectedBottle = useMemo(
    () => catalog.find((b) => b.id === selectedBottleId) || catalog[0],
    [catalog, selectedBottleId]
  );

  // Dynamic rows derived from cells and selected location
  const terminalRowsList = useMemo(() => {
    const set = new Set(cells.filter(c => c.location === selectedLocation).map((c) => c.row));
    return Array.from(set).sort();
  }, [cells, selectedLocation]);

  // Ensure selectedRow is valid if rows change
  useEffect(() => {
    if (terminalRowsList.length > 0 && !terminalRowsList.includes(selectedRow)) {
      setSelectedRow(terminalRowsList[0]);
    }
  }, [terminalRowsList, selectedRow]);

  // Dynamic Batches Array (1 to 4 batches per truck)
  const [batches, setBatches] = useState<BatchItem[]>([
    {
      id: 1,
      mfgDate: new Date().toISOString().split('T')[0],
      palletCount: 26,
      label: 'Партия #1',
      ...BATCH_COLORS[0]
    }
  ]);

  // Active Batch Selector Mode for single-batch tap toggle
  const [activeBatchId, setActiveBatchId] = useState<number>(1);

  // Manual cell assignment map: cellId -> Array of batch IDs assigned to that cell
  const [manualCellMap, setManualCellMap] = useState<Map<string, number[]>>(new Map());

  // Custom pallet count per batch in cell: key `cellId_batchId` -> number or empty
  const [customPalletSplit, setCustomPalletSplit] = useState<Map<string, number | ''>>(new Map());

  // Feedback states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal for adding new bottle inline
  const [showAddBottleModal, setShowAddBottleModal] = useState<boolean>(false);
  const [newBottleName, setNewBottleName] = useState('');
  const [newBottleSupplier, setNewBottleSupplier] = useState('');
  const [newBottleColor, setNewBottleColor] = useState<GlassColor>('brown');
  const [newBottleVolume, setNewBottleVolume] = useState('0.45 л');
  const [newBottleBottlesPerPallet, setNewBottleBottlesPerPallet] = useState<number | ''>(2400);

  // Handle Preset Cell from Terminal Map
  useEffect(() => {
    if (presetCellId) {
      const targetCell = cells.find(c => c.cellId === presetCellId);
      if (targetCell) {
        setSelectedLocation(targetCell.location || 'эстакада');
        setSelectedRow(targetCell.row);
        const next = new Map<string, number[]>();
        next.set(presetCellId, batches.map((b) => b.id));
        setManualCellMap(next);
      }
    }
  }, [presetCellId, cells]);

  // Sync supplier when bottle changes
  const handleBottleChange = (bottleId: string) => {
    setSelectedBottleId(bottleId);
    const found = catalog.find((b) => b.id === bottleId);
    if (found) {
      setSupplier(found.supplier);
    }
  };

  // Add batch line (up to 4)
  const handleAddBatchLine = () => {
    if (batches.length >= 4) return;
    const nextId = batches.length + 1;
    const prevDate = batches[batches.length - 1].mfgDate;
    const colorIndex = (nextId - 1) % BATCH_COLORS.length;

    const newBatchItem: BatchItem = {
      id: nextId,
      mfgDate: prevDate,
      palletCount: 10,
      label: `Партия #${nextId}`,
      ...BATCH_COLORS[colorIndex]
    };

    setBatches((prev) => {
      const updatedBatches = [...prev, newBatchItem];
      // Automatically add new batch ID to currently selected cells if they had all batches
      setManualCellMap((prevMap) => {
        const nextMap = new Map(prevMap);
        nextMap.forEach((assignedIds, cellId) => {
          if (!assignedIds.includes(nextId)) {
            nextMap.set(cellId, [...assignedIds, nextId]);
          }
        });
        return nextMap;
      });
      return updatedBatches;
    });

    setActiveBatchId(nextId);
  };

  // Remove batch line
  const handleRemoveBatchLine = (idToRemove: number) => {
    if (batches.length <= 1) return;
    setBatches((prev) => prev.filter((b) => b.id !== idToRemove));

    // Remove from manual map
    setManualCellMap((prev) => {
      const next = new Map();
      prev.forEach((assignedBatches, cellId) => {
        const filtered = assignedBatches.filter((bId) => bId !== idToRemove);
        if (filtered.length > 0) {
          next.set(cellId, filtered);
        }
      });
      return next;
    });

    if (activeBatchId === idToRemove) {
      setActiveBatchId(1);
    }
  };

  // Update batch property
  const handleUpdateBatch = (id: number, key: keyof BatchItem, value: any) => {
    setBatches((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [key]: value } : b))
    );
  };

  // Row cells
  const rowCells = useMemo(() => {
    return cells
      .filter((c) => c.row === selectedRow)
      .sort((a, b) => a.position - b.position);
  }, [cells, selectedRow]);

  // Cell Click Handler on Row Grid:
  // Tapping an empty cell toggles selection. When newly selected, it assigns ALL current truck batches to that cell by default.
  const handleCellClick = (cell: TerminalCell) => {
    if (cell.status === 'occupied') return;

    setManualCellMap((prev) => {
      const next = new Map(prev);
      const currentList = next.get(cell.cellId) || [];

      if (currentList.length === 0) {
        // First click on cell -> Assign all current batches of this truck to cell
        const allBatchIds = batches.map((b) => b.id);
        next.set(cell.cellId, allBatchIds);
      } else {
        // Unselect cell
        next.delete(cell.cellId);
      }
      return next;
    });
  };

  // Toggle specific batch checkbox for an assigned cell
  const toggleBatchForCell = (cellId: string, batchId: number) => {
    setManualCellMap((prev) => {
      const next = new Map(prev);
      const current = next.get(cellId) || [];

      if (current.includes(batchId)) {
        const updated = current.filter((id) => id !== batchId);
        if (updated.length > 0) {
          next.set(cellId, updated);
        } else {
          next.delete(cellId);
        }
      } else {
        next.set(cellId, [...current, batchId].sort((a, b) => a - b));
      }
      return next;
    });
  };

  // Rule: In one row it is ALLOWED to store different suppliers across different cells.
  // In one CELL, mixing different suppliers, different bottle types or different colors is strictly FORBIDDEN.
  const cellMixingConflict = useMemo(() => {
    if (!selectedBottle || manualCellMap.size === 0) return null;
    const currentSupplier = supplier || selectedBottle.supplier;
    const currentColor = selectedBottle.color;

    for (const cellId of manualCellMap.keys()) {
      const targetCell = cells.find((c) => c.cellId === cellId);
      if (targetCell && targetCell.status === 'occupied') {
        const isDifferentSupplier = targetCell.supplier && targetCell.supplier !== currentSupplier;
        const isDifferentBottle = targetCell.bottleName && targetCell.bottleName !== selectedBottle.name;
        const isDifferentColor = targetCell.bottleColor && targetCell.bottleColor !== currentColor;

        if (isDifferentSupplier || isDifferentBottle || isDifferentColor) {
          return {
            cellId,
            existingSupplier: targetCell.supplier || 'Не указан',
            existingBottle: targetCell.bottleName || '',
            existingColor: targetCell.bottleColor || 'clear',
            currentSupplier,
            currentBottle: selectedBottle.name,
            currentColor
          };
        }
      }
    }
    return null;
  }, [cells, manualCellMap, selectedBottle, supplier]);

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    const selectedBottle = catalog.find((b) => b.id === selectedBottleId);
    if (!selectedBottle) {
      setErrorMessage('Пожалуйста, выберите сорт стеклотары');
      return;
    }

    if (manualCellMap.size === 0) {
      setErrorMessage('Пожалуйста, нажмите на ячейку на схеме ряда ниже для привязки выгрузки');
      return;
    }

    if (cellMixingConflict) {
      setErrorMessage(
        `В одной ячейке (${cellMixingConflict.cellId}) запрещено смешивать разных поставщиков! Текущий поставщик ячейки: «${cellMixingConflict.existingSupplier}», ваш: «${cellMixingConflict.currentSupplier}».`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const cellAssignments: Array<{
        cellId: string;
        mfgDate: string;
        palletCount: number;
        mfgDateDetails?: CellBatchDetail[];
      }> = [];

      manualCellMap.forEach((assignedBatchIds, cellId) => {
        const targetCellObj = cells.find((c) => c.cellId === cellId);
        const cellMaxCapacity = targetCellObj?.palletCapacity || DEFAULT_PALLET_CAPACITY;
        const details: CellBatchDetail[] = [];
        let cellTotalPallets = 0;

        assignedBatchIds.forEach((bId) => {
          const batchObj = batches.find((b) => b.id === bId) || batches[0];
          const customKey = `${cellId}_${bId}`;
          const customVal = customPalletSplit.get(customKey);

          let pallets = 13;
          if (typeof customVal === 'number' && customVal > 0) {
            pallets = customVal;
          } else if (typeof batchObj.palletCount === 'number' && batchObj.palletCount > 0) {
            pallets = assignedBatchIds.length > 1
              ? batchObj.palletCount
              : batchObj.palletCount;
          } else {
            pallets = cellMaxCapacity;
          }

          cellTotalPallets += pallets;
          details.push({
            batchId: `b_${bId}`,
            batchLabel: batchObj.label,
            mfgDate: batchObj.mfgDate,
            palletCount: pallets
          });
        });

        // Primary date is the oldest date among batches in this cell for FIFO
        const sortedDates = [...details].sort(
          (a, b) => new Date(a.mfgDate).getTime() - new Date(b.mfgDate).getTime()
        );
        const primaryMfgDate = sortedDates[0]?.mfgDate || batches[0].mfgDate;

        cellAssignments.push({
          cellId,
          mfgDate: primaryMfgDate,
          palletCount: cellTotalPallets,
          mfgDateDetails: details
        });
      });

      const mfgDates = Array.from(new Set(batches.map((b) => b.mfgDate)));
      const batchId = `batch_${Date.now()}`;
      const totalTruckPallets = cellAssignments.reduce((sum, c) => sum + c.palletCount, 0);

      const batchData: UnloadingBatch = {
        batchId,
        bottleId: selectedBottle.id,
        bottleName: selectedBottle.name,
        supplier: supplier || selectedBottle.supplier,
        bottleColor: selectedBottle.color,
        bottlesPerPallet: selectedBottle.bottlesPerPallet || 2400,
        mfgDates,
        location: selectedLocation,
        row: selectedRow,
        occupiedCellIds: Array.from(manualCellMap.keys()),
        quantityPallets: totalTruckPallets,
        truckPlate: truckPlate.trim().toUpperCase() || 'Б/Н',
        createdAt: new Date().toISOString()
      };

      const success = await onUnloadTruck(batchData, cellAssignments);

      if (success) {
        const bottlesCount = totalTruckPallets * (selectedBottle.bottlesPerPallet || 2400);
        setSuccessMessage(
          `Машина успешно выгружена! Заняты ячейки Ряда ${selectedRow}: ${Array.from(
            manualCellMap.keys()
          ).join(', ')} (Всего ${totalTruckPallets} паллет, ~${bottlesCount.toLocaleString('ru-RU')} бут.)`
        );
        setManualCellMap(new Map());
        setCustomPalletSplit(new Map());
        setTruckPlate('');
      } else {
        setErrorMessage('Ошибка при сохранении данных выгрузки');
      }
    } catch (err) {
      setErrorMessage('Произошел сбой при сохранении приёмки');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add new bottle inline handler
  const handleAddNewBottle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBottleName.trim()) return;

    const count = typeof newBottleBottlesPerPallet === 'number' && newBottleBottlesPerPallet > 0
      ? newBottleBottlesPerPallet
      : 2400;

    const newId = `bottle_${Date.now()}`;
    const newBottle: CatalogBottle = {
      id: newId,
      name: newBottleName.trim(),
      supplier: newBottleSupplier.trim() || 'ООО Стеклотара',
      color: newBottleColor,
      volume: newBottleVolume,
      bottlesPerPallet: count,
      createdAt: new Date().toISOString()
    };

    const ok = await onAddBottleToCatalog(newBottle);
    if (ok) {
      setSelectedBottleId(newId);
      setSupplier(newBottle.supplier);
      setShowAddBottleModal(false);
      setNewBottleName('');
      setNewBottleSupplier('');
      setNewBottleBottlesPerPallet(2400);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Выгрузка Машины на Терминал</h2>
            <p className="text-xs text-slate-400">
              Нажмите на ячейку на схеме. Поддержка до 4 партий в машине и разгрузки нескольких партий в 1 ячейку
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 p-3.5 rounded-2xl flex items-center gap-3 text-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="font-medium">{successMessage}</div>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950/80 border border-rose-500/80 text-rose-200 p-3.5 rounded-2xl flex items-center gap-3 text-xs animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Main Unloading Form */}
      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        {/* Step 1: Select Bottle Variety */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              1. Сорт Стеклотары
            </label>
            <button
              type="button"
              onClick={() => setShowAddBottleModal(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Новый сорт в каталог
            </button>
          </div>

          <select
            value={selectedBottleId}
            onChange={(e) => handleBottleChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-medium text-white focus:outline-none focus:border-emerald-500 transition-colors"
          >
            {catalog.map((bottle) => {
              const colorLabel =
                bottle.color === 'brown' || bottle.color === 'amber'
                  ? 'Коричневая'
                  : bottle.color === 'green' || bottle.color === 'emerald'
                  ? 'Зелёная'
                  : 'Бесцветная';
              return (
                <option key={bottle.id} value={bottle.id}>
                  {bottle.name} • {colorLabel} ({bottle.supplier})
                </option>
              );
            })}
          </select>

          {selectedBottle && (
            <div className="flex items-center gap-2 pt-1 text-xs flex-wrap">
              <span className="text-slate-400">Параметры сорта:</span>
              <span className="font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800 flex items-center gap-1 text-[11px]">
                <Package className="w-3 h-3 text-emerald-400" />
                {(selectedBottle.bottlesPerPallet || 2400).toLocaleString('ru-RU')} бут./паллет
              </span>
              <span className="font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800 text-[11px]">
                {selectedBottle.volume || '0.45 л'}
              </span>
              <span className="text-slate-400 text-[11px]">
                Поставщик: <strong className="text-slate-200">{selectedBottle.supplier}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Step 2: Location, Truck Plate & Supplier */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Локация выгрузки
            </label>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
              <select
                value={selectedLocation}
                onChange={(e) => {
                  setSelectedLocation(e.target.value as TerminalLocation);
                  setManualCellMap(new Map());
                  setCustomPalletSplit(new Map());
                }}
                className="w-full bg-transparent border-none text-sm font-bold text-white focus:outline-none focus:ring-0"
              >
                {(Object.keys(LOCATION_LABELS) as TerminalLocation[]).map((loc) => (
                  <option key={loc} value={loc}>
                    {LOCATION_LABELS[loc]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Номер ТС / Машины
            </label>
            <input
              type="text"
              value={truckPlate}
              onChange={(e) => setTruckPlate(e.target.value)}
              placeholder="А777УК 777"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Поставщик
            </label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="ООО Стеклопром"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Step 3: Dynamic Multi-Batch Manager (1 to 4 Batches) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              Партии в машине ({batches.length} из 4)
            </label>

            {batches.length < 4 && (
              <button
                type="button"
                onClick={handleAddBatchLine}
                className="text-xs bg-emerald-950 border border-emerald-700/80 text-emerald-300 hover:bg-emerald-900 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                + Добавить партию #{batches.length + 1}
              </button>
            )}
          </div>

          {/* Batches Cards */}
          <div className="space-y-2.5">
            {batches.map((batch) => {
              const isActive = activeBatchId === batch.id;

              return (
                <div
                  key={batch.id}
                  onClick={() => setActiveBatchId(batch.id)}
                  className={`p-3 rounded-xl border transition-all ${
                    isActive
                      ? `${batch.colorBg} ${batch.colorBorder} ring-2 ring-emerald-500/20`
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full font-mono ${batch.badgeBg}`}>
                        {batch.label}
                      </span>
                      <span className="text-xs text-slate-300 font-medium">
                        Партия {batch.id} из {batches.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {batches.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveBatchLine(batch.id);
                          }}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          title="Удалить партию"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-medium">Дата производства:</label>
                      <input
                        type="date"
                        value={batch.mfgDate}
                        onChange={(e) => handleUpdateBatch(batch.id, 'mfgDate', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 w-full"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-medium">Паллет в этой партии:</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={batch.palletCount}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            handleUpdateBatch(batch.id, 'palletCount', '');
                          } else {
                            const parsed = parseInt(val, 10);
                            handleUpdateBatch(batch.id, 'palletCount', isNaN(parsed) ? '' : Math.max(1, parsed));
                          }
                        }}
                        onBlur={() => {
                          if (batch.palletCount === '' || Number(batch.palletCount) < 1) {
                            handleUpdateBatch(batch.id, 'palletCount', 13);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500 w-full"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 4: Row Picker & Interactive Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              2. Ручной Выбор Ячеек на Схеме ({terminalRowsList.length} Рядов)
            </label>

            {manualCellMap.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  setManualCellMap(new Map());
                  setCustomPalletSplit(new Map());
                }}
                className="text-[11px] text-rose-400 hover:underline px-1 font-medium"
              >
                Очистить выбранные
              </button>
            )}
          </div>

          {/* Row Buttons */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {terminalRowsList.map((row) => {
              const freeCount = cells.filter((c) => c.row === row && c.status === 'empty').length;
              const isSelected = selectedRow === row;

              return (
                <button
                  key={row}
                  type="button"
                  onClick={() => {
                    setSelectedRow(row);
                    setManualCellMap(new Map());
                    setCustomPalletSplit(new Map());
                  }}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-emerald-950 border-emerald-500 text-white font-bold ring-2 ring-emerald-500/30'
                      : freeCount > 0
                      ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      : 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="font-mono text-sm font-bold">Ряд {row}</span>
                  <span
                    className={`text-[10px] mt-0.5 font-medium ${
                      freeCount > 0 ? 'text-emerald-400' : 'text-rose-500'
                    }`}
                  >
                    {freeCount} своб.
                  </span>
                </button>
              );
            })}
          </div>

          {/* Cell-Level Mixing Prohibition Warning (Forbidden in single cell, allowed in same row) */}
          {cellMixingConflict && (
            <div className="bg-rose-950/50 border border-rose-500/60 p-3 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-rose-200">
                  Запрещено: смешивание разных поставщиков в одной ячейке ({cellMixingConflict.cellId})!
                </p>
                <div className="text-[11px] text-rose-300/90 leading-relaxed">
                  В ячейке <strong className="text-white">{cellMixingConflict.cellId}</strong> уже находится тара со следующими параметрами:
                  <ul className="list-disc list-inside mt-1 space-y-0.5 ml-1">
                    <li>Сорт: <strong className="text-white">«{cellMixingConflict.existingBottle}»</strong></li>
                    <li>Поставщик: <strong className="text-white">«{cellMixingConflict.existingSupplier}»</strong></li>
                    <li>Цвет: <strong className="text-white">«{getGlassColorLabel(cellMixingConflict.existingColor)}»</strong></li>
                  </ul>
                  <div className="mt-1.5 pt-1.5 border-t border-rose-500/20 text-rose-200">
                    Параметры текущей выгрузки: Поставщик <strong className="text-white">«{cellMixingConflict.currentSupplier}»</strong>, Цвет <strong className="text-white">«{getGlassColorLabel(cellMixingConflict.currentColor)}»</strong>.
                  </div>
                  <p className="mt-1 text-slate-300">
                    💡 В одном ряду допускаются разные поставщики, но внутри одной ячейки смешивание запрещено. Выберите свободную пустую ячейку.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Warehouse Placement Rule Note */}
          <div className="bg-slate-950 border border-slate-800/80 px-3 py-2 rounded-xl flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>
                Правило терминала: в одном ряду допускаются <strong className="text-slate-200">разные поставщики</strong>, в одной ячейке смешивание <strong className="text-amber-400">запрещено</strong>.
              </span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400/90 hidden sm:inline">
              1 ячейка = 1 поставщик
            </span>
          </div>

          {/* Interactive Cell Grid */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-1">
              <span className="font-bold text-white flex items-center gap-1.5">
                <MousePointerClick className="w-4 h-4 text-emerald-400" />
                Нажимайте на свободные ячейки Ряда {selectedRow} для выгрузки:
              </span>
              <span className="text-emerald-400 font-mono font-bold">
                Вместимость ячеек ряда: {rowCells[0]?.palletCapacity || DEFAULT_PALLET_CAPACITY} паллет
              </span>
            </div>

            <div
              className="grid gap-1.5 pt-1 overflow-x-auto pb-1"
              style={{
                gridTemplateColumns: `repeat(${Math.max(rowCells.length, 7)}, minmax(42px, 1fr))`
              }}
            >
              {rowCells.map((cell) => {
                const isOccupied = cell.status === 'occupied';
                const assignedBatches = manualCellMap.get(cell.cellId) || [];
                const isAssigned = assignedBatches.length > 0;
                const cellCap = cell.palletCapacity || DEFAULT_PALLET_CAPACITY;

                let cellStyle = 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600';
                if (isOccupied) {
                  cellStyle = 'bg-slate-950/60 border-slate-900 text-slate-700 cursor-not-allowed';
                } else if (isAssigned) {
                  if (assignedBatches.length > 1) {
                    cellStyle = 'bg-purple-950 border-purple-500 text-purple-200 ring-2 ring-purple-500/40 font-bold';
                  } else {
                    const bIndex = (assignedBatches[0] - 1) % BATCH_COLORS.length;
                    const bColor = BATCH_COLORS[bIndex];
                    cellStyle = `${bColor.colorBg} ${bColor.colorBorder} ${bColor.colorText} ring-2 ring-emerald-500/30 font-bold`;
                  }
                }

                return (
                  <button
                    key={cell.cellId}
                    type="button"
                    onClick={() => handleCellClick(cell)}
                    disabled={isOccupied}
                    className={`aspect-square rounded-xl border p-1 flex flex-col items-center justify-center transition-all ${cellStyle}`}
                  >
                    <span className="font-mono text-xs font-bold">{cell.cellId}</span>
                    {isOccupied ? (
                      <span className="text-[8px] text-rose-500 font-mono">занято</span>
                    ) : isAssigned ? (
                      <span className="text-[8px] font-mono mt-0.5 font-bold">
                        {assignedBatches.length > 1
                          ? `${assignedBatches.length} парт.`
                          : `П#${assignedBatches[0]}`}
                      </span>
                    ) : (
                      <span className="text-[8px] text-emerald-400/80 font-mono font-medium">
                        до {cellCap}п
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Explicit Multi-Batch Breakdown Manager for Assigned Cells */}
          {manualCellMap.size > 0 && (
            <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="font-bold text-white text-xs flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>Состав партий и количество паллет по ячейкам:</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  Выбрано ячеек: {manualCellMap.size}
                </span>
              </div>

              <div className="space-y-3">
                {Array.from(manualCellMap.entries()).map(([cellId, assignedIds]) => {
                  const targetCell = cells.find((c) => c.cellId === cellId);
                  const cellCap = targetCell?.palletCapacity || DEFAULT_PALLET_CAPACITY;

                  // Calculate cell total pallets
                  let cellSum = 0;
                  assignedIds.forEach((bId) => {
                    const customKey = `${cellId}_${bId}`;
                    const customVal = customPalletSplit.get(customKey);
                    const batchObj = batches.find((b) => b.id === bId) || batches[0];

                    if (typeof customVal === 'number') {
                      cellSum += customVal;
                    } else if (typeof batchObj.palletCount === 'number') {
                      cellSum += batchObj.palletCount;
                    }
                  });

                  const isOverCapacity = cellSum > cellCap;

                  return (
                    <div
                      key={cellId}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2.5 shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm bg-emerald-950 text-emerald-300 border border-emerald-700/80 px-2.5 py-0.5 rounded-lg">
                            Ячейка {cellId}
                          </span>
                          <span className="text-xs text-slate-400">
                            (Ряд {selectedRow})
                          </span>
                        </div>

                        <div
                          className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                            isOverCapacity
                              ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                              : 'bg-slate-950 border-slate-800 text-emerald-400'
                          }`}
                        >
                          Итого: {cellSum} / {cellCap} паллет
                          {isOverCapacity && ' ⚠️'}
                        </div>
                      </div>

                      {/* Batches Checkboxes & Pallet Input List */}
                      <div className="space-y-2 pt-1">
                        <div className="text-[11px] text-slate-400 font-medium">
                          Отметьте партии, размещаемые в ячейке {cellId}:
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {batches.map((batch) => {
                            const isChecked = assignedIds.includes(batch.id);
                            const customKey = `${cellId}_${batch.id}`;
                            const customVal = customPalletSplit.get(customKey);
                            const currentPallets = customVal !== undefined ? customVal : batch.palletCount;

                            return (
                              <div
                                key={batch.id}
                                className={`p-2.5 rounded-xl border flex flex-col justify-between gap-2 transition-all ${
                                  isChecked
                                    ? `${batch.colorBg} ${batch.colorBorder}`
                                    : 'bg-slate-950/60 border-slate-800/80 opacity-60'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <label
                                    onClick={() => toggleBatchForCell(cellId, batch.id)}
                                    className="flex items-center gap-2 cursor-pointer select-none"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleBatchForCell(cellId, batch.id)}
                                      className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-950 border-slate-700 cursor-pointer"
                                    />
                                    <span className={`text-xs font-bold font-mono ${isChecked ? batch.colorText : 'text-slate-400'}`}>
                                      {batch.label}
                                    </span>
                                  </label>

                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Дата: {batch.mfgDate}
                                  </span>
                                </div>

                                {isChecked && (
                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                                    <span className="text-[11px] text-slate-300 font-medium">Кол-во паллет:</span>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={1}
                                        max={200}
                                        value={currentPallets}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === '') {
                                            setCustomPalletSplit((prev) => {
                                              const next = new Map(prev);
                                              next.set(customKey, '');
                                              return next;
                                            });
                                          } else {
                                            const parsed = parseInt(val, 10);
                                            setCustomPalletSplit((prev) => {
                                              const next = new Map(prev);
                                              next.set(customKey, isNaN(parsed) ? '' : Math.max(1, parsed));
                                              return next;
                                            });
                                          }
                                        }}
                                        onBlur={() => {
                                          if (currentPallets === '' || Number(currentPallets) < 1) {
                                            setCustomPalletSplit((prev) => {
                                              const next = new Map(prev);
                                              next.set(customKey, batch.palletCount || 13);
                                              return next;
                                            });
                                          }
                                        }}
                                        className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono font-bold text-white text-center focus:outline-none focus:border-emerald-500"
                                      />
                                      <span className="text-[10px] text-slate-400">палл.</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected Summary Preview */}
        {manualCellMap.size > 0 && (
          <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-3 text-xs text-emerald-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Итог выгружаемой машины:
            </div>
            <p className="font-mono text-slate-200">
              Заполняются ячейки: {Array.from(manualCellMap.keys()).join(', ')} ({manualCellMap.size} шт.)
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || manualCellMap.size === 0}
          className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all mt-2"
        >
          <Truck className="w-5 h-5" />
          {isSubmitting
            ? 'Сохранение выгрузки...'
            : `Выгрузить машину (${batches.length} партий, ${manualCellMap.size} ячеек)`}
        </button>
      </form>

      {/* Modal for Adding New Bottle Variety */}
      {showAddBottleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Добавить новый сорт бутылки</h3>
              <button
                type="button"
                onClick={() => setShowAddBottleModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewBottle} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">
                  Название сорта (например, Бад Эмеральд 0.45L):
                </label>
                <input
                  type="text"
                  required
                  value={newBottleName}
                  onChange={(e) => setNewBottleName(e.target.value)}
                  placeholder="Бад Эмеральд 0.45L"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Поставщик завода:</label>
                <input
                  type="text"
                  value={newBottleSupplier}
                  onChange={(e) => setNewBottleSupplier(e.target.value)}
                  placeholder="ООО Стеклопром"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Цвет стекла:</label>
                  <select
                    value={newBottleColor}
                    onChange={(e) => setNewBottleColor(e.target.value as GlassColor)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="brown">Коричневая</option>
                    <option value="green">Зелёная</option>
                    <option value="clear">Бесцветная</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Объём:</label>
                  <input
                    type="text"
                    value={newBottleVolume}
                    onChange={(e) => setNewBottleVolume(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Бутылок в палете (шт.):</label>
                <input
                  type="number"
                  min={1}
                  max={20000}
                  value={newBottleBottlesPerPallet}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') setNewBottleBottlesPerPallet('');
                    else {
                      const parsed = parseInt(val, 10);
                      if (!isNaN(parsed)) setNewBottleBottlesPerPallet(parsed);
                    }
                  }}
                  onBlur={() => {
                    if (newBottleBottlesPerPallet === '' || Number(newBottleBottlesPerPallet) < 1) {
                      setNewBottleBottlesPerPallet(2400);
                    }
                  }}
                  placeholder="2400"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {[1800, 2100, 2400, 2520, 2640].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewBottleBottlesPerPallet(preset)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] font-bold rounded-lg transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl"
                >
                  Сохранить и выбрать
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddBottleModal(false)}
                  className="py-2.5 px-4 bg-slate-800 text-slate-300 text-xs rounded-xl"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
