import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Printer,
  X,
  Filter,
  Package,
  Boxes,
  Building2,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ShieldCheck
} from 'lucide-react';
import {
  TerminalCell,
  CatalogBottle,
  WarehouseLog,
  TerminalLocation,
  LOCATION_LABELS,
  getGlassColorLabel,
  DEFAULT_PALLET_CAPACITY
} from '../types/terminal';
import {
  exportWarehouseToExcel,
  aggregateSummaryData,
  filterCellsForReport,
  calculateAgeDays,
  ReportFilterOptions
} from '../utils/reportsExport';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cells: TerminalCell[];
  catalog: CatalogBottle[];
  logs: WarehouseLog[];
  isAdmin?: boolean;
  onRequestAdminAuth?: () => void;
}

export const ReportsModal: React.FC<ReportsModalProps> = ({
  isOpen,
  onClose,
  cells,
  catalog,
  logs,
  isAdmin = false,
  onRequestAdminAuth
}) => {
  const [selectedLocation, setSelectedLocation] = useState<'all' | TerminalLocation>('all');
  const [selectedBottleId, setSelectedBottleId] = useState<'all' | string>('all');
  const [activeReportTab, setActiveReportTab] = useState<'summary' | 'detailed'>('summary');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const filterOptions: ReportFilterOptions = useMemo(
    () => ({
      location: selectedLocation,
      bottleId: selectedBottleId
    }),
    [selectedLocation, selectedBottleId]
  );

  const filteredCells = useMemo(
    () => filterCellsForReport(cells, filterOptions),
    [cells, filterOptions]
  );

  const summary = useMemo(
    () => aggregateSummaryData(filteredCells, catalog),
    [filteredCells, catalog]
  );

  // Overall totals
  const totalOccupiedCells = filteredCells.filter((c) => c.status === 'occupied').length;
  const totalEmptyCells = filteredCells.length - totalOccupiedCells;
  const totalPallets = summary.reduce((sum, item) => sum + item.palletCount, 0);
  const totalBottles = summary.reduce((sum, item) => sum + item.totalBottles, 0);

  const oldestBatchItem = useMemo(() => {
    if (summary.length === 0) return null;
    return [...summary].sort((a, b) => b.oldestDaysAge - a.oldestDaysAge)[0];
  }, [summary]);

  const handleExcelExport = () => {
    setIsExporting(true);
    try {
      exportWarehouseToExcel({
        cells,
        catalog,
        logs,
        options: filterOptions
      });
    } finally {
      setTimeout(() => setIsExporting(false), 600);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
        <div className="bg-slate-900 border border-amber-800/80 w-full max-w-md rounded-2xl p-6 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Доступ только для администратора</h3>
            <p className="text-xs text-slate-300 mt-1">
              Формирование и экспорт складских отчетов (Excel и PDF) разрешены только администраторам терминала.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onRequestAdminAuth?.();
              }}
              className="flex-1 min-h-[42px] bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40"
            >
              Ввести пароль администратора
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 min-h-[42px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentDateStr = new Date().toLocaleString('ru-RU');

  return (
    <>
      {/* Screen Modal (Hidden during printing) */}
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in print:hidden overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-center text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>Отчеты и складские ведомости</span>
                  <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    Только для администратора
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Выгрузка остатков стеклотары, партий FIFO и аналитики в Excel и PDF
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Controls Bar & Filters */}
          <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {/* Location Filter */}
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">
                  Локация терминала:
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Все локации (Эстакада, Плиты, АБК)</option>
                  <option value="эстакада">Эстакада</option>
                  <option value="плиты">Плиты</option>
                  <option value="абк">АБК</option>
                </select>
              </div>

              {/* Bottle Filter */}
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 font-medium block mb-1">
                  Фильтр по сорту стеклотары:
                </label>
                <select
                  value={selectedBottleId}
                  onChange={(e) => setSelectedBottleId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Все сорта стеклотары</option>
                  {catalog.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({getGlassColorLabel(b.color)}, {b.supplier})
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleExcelExport}
                  disabled={isExporting}
                  className="flex-1 min-h-[38px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/50 transition-all"
                  title="Скачать структурированную таблицу Excel с 3 листами"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isExporting ? 'Экспорт...' : 'Excel (.xlsx)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="min-h-[38px] px-3.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 border border-slate-700 transition-all"
                  title="Печать или сохранение официального бланка в PDF"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Печать / PDF</span>
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 block text-[10px]">Всего ячеек</span>
                <span className="text-base font-bold font-mono text-white">
                  {filteredCells.length}{' '}
                  <span className="text-[10px] text-slate-500 font-normal">
                    ({totalOccupiedCells} зан. / {totalEmptyCells} своб.)
                  </span>
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 block text-[10px]">Всего паллет</span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  {totalPallets.toLocaleString('ru-RU')} <span className="text-[10px]">палл.</span>
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 block text-[10px]">Всего бутылок</span>
                <span className="text-base font-bold font-mono text-emerald-300">
                  {totalBottles.toLocaleString('ru-RU')} <span className="text-[10px]">шт.</span>
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 block text-[10px]">Сортов на терминале</span>
                <span className="text-base font-bold font-mono text-sky-400">
                  {summary.length} <span className="text-[10px]">поз.</span>
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 block text-[10px]">Старшая партия (FIFO)</span>
                <span className="text-xs font-bold font-mono text-amber-400 truncate block">
                  {oldestBatchItem
                    ? `${oldestBatchItem.oldestDate || 'Сегодня'} (${oldestBatchItem.oldestDaysAge} дн.)`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Table Tab Selector */}
          <div className="px-5 pt-3 border-b border-slate-800 flex items-center gap-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveReportTab('summary')}
              className={`pb-2.5 border-b-2 transition-colors ${
                activeReportTab === 'summary'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Сводная ведомость по сортам ({summary.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveReportTab('detailed')}
              className={`pb-2.5 border-b-2 transition-colors ${
                activeReportTab === 'detailed'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Поячеечная расстановка ({filteredCells.length})
            </button>
          </div>

          {/* Table Content */}
          <div className="p-4 overflow-y-auto flex-1 space-y-3">
            {activeReportTab === 'summary' ? (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Сорт стеклотары</th>
                      <th className="py-2.5 px-3">Цвет</th>
                      <th className="py-2.5 px-3">Поставщик</th>
                      <th className="py-2.5 px-3 text-right">Ячеек</th>
                      <th className="py-2.5 px-3 text-right">Паллет</th>
                      <th className="py-2.5 px-3 text-right">Всего бутылок</th>
                      <th className="py-2.5 px-3">Старшая партия</th>
                      <th className="py-2.5 px-3">Ячейки</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                    {summary.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          Нет данных по выбранным фильтрам
                        </td>
                      </tr>
                    ) : (
                      summary.map((item, idx) => (
                        <tr key={item.key} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-white">{item.bottleName}</td>
                          <td className="py-2.5 px-3 text-slate-300">{item.colorLabel}</td>
                          <td className="py-2.5 px-3 text-slate-300">{item.supplier}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 text-right">
                            {item.cellCount}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-white text-right">
                            {item.palletCount}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-300 text-right">
                            {item.totalBottles.toLocaleString('ru-RU')}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-amber-400">
                            {item.oldestDate || '—'}
                            {item.oldestDaysAge > 0 && (
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({item.oldestDaysAge} дн.)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300 max-w-[200px] truncate">
                            {item.cellIds.join(', ')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {summary.length > 0 && (
                    <tfoot className="bg-slate-950 font-bold border-t border-slate-800 text-xs text-white">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 uppercase text-slate-400">
                          Итого:
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-400 text-right">
                          {totalOccupiedCells}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-white text-right">
                          {totalPallets.toLocaleString('ru-RU')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-300 text-right">
                          {totalBottles.toLocaleString('ru-RU')}
                        </td>
                        <td colSpan={2} className="py-2.5 px-3"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Локация</th>
                      <th className="py-2.5 px-3">Ячейка</th>
                      <th className="py-2.5 px-3">Статус</th>
                      <th className="py-2.5 px-3">Сорт стеклотары</th>
                      <th className="py-2.5 px-3">Цвет / Поставщик</th>
                      <th className="py-2.5 px-3 text-right">Паллет / Вм.</th>
                      <th className="py-2.5 px-3 text-right">Бутылок</th>
                      <th className="py-2.5 px-3">Дата выработки</th>
                      <th className="py-2.5 px-3">Госномер ТС</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                    {filteredCells.map((cell) => {
                      const isOccupied = cell.status === 'occupied';
                      const cap = cell.palletCapacity || DEFAULT_PALLET_CAPACITY;
                      const bPerPallet = cell.bottlesPerPallet || 2400;
                      const pallets = cell.palletCount || (isOccupied ? 26 : 0);
                      const totalBottlesInCell = pallets * bPerPallet;

                      return (
                        <tr key={cell.cellId} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-300">
                            {LOCATION_LABELS[cell.location || 'эстакада']}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                            {cell.cellId}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                isOccupied
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {isOccupied ? 'Занята' : 'Свободна'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-white">
                            {isOccupied ? cell.bottleName : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {isOccupied ? (
                              <span>
                                {getGlassColorLabel(cell.bottleColor)} • {cell.supplier}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-right text-white">
                            {isOccupied ? `${pallets} / ${cap}п` : `0 / ${cap}п`}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-300 text-right">
                            {isOccupied ? totalBottlesInCell.toLocaleString('ru-RU') : '0'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-amber-400">
                            {isOccupied ? cell.mfgDate || '—' : '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-300">
                            {isOccupied ? cell.truckPlate || '—' : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>
              💡 Таблица Excel выгружается со всеми формулами, 3 вкладками и автоматическим подсчетом итогов.
            </span>
            <span className="font-mono text-slate-500">Срез от {currentDateStr}</span>
          </div>
        </div>
      </div>

      {/* Printable Sheet View (VISIBLE ONLY WHEN PRINTING) */}
      <div className="hidden print:block bg-white text-black p-8 font-sans">
        <div className="border-b-2 border-black pb-4 mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wide">
              Складская ведомость остатков стеклотары
            </h1>
            <p className="text-xs text-neutral-600 mt-1">
              Терминал Стеклотары • Локация:{' '}
              {selectedLocation === 'all'
                ? 'Все локации (Эстакада, Плиты, АБК)'
                : LOCATION_LABELS[selectedLocation]}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">Дата и время среза:</p>
            <p className="font-mono">{currentDateStr}</p>
          </div>
        </div>

        {/* Summary metrics box */}
        <div className="grid grid-cols-4 gap-4 p-3 border border-neutral-300 mb-6 text-xs bg-neutral-50">
          <div>
            <span className="text-neutral-500 block">Всего ячеек в срезе:</span>
            <span className="font-bold text-sm">
              {filteredCells.length} (Занято: {totalOccupiedCells}, Свободно: {totalEmptyCells})
            </span>
          </div>
          <div>
            <span className="text-neutral-500 block">Общее число паллет:</span>
            <span className="font-bold text-sm">{totalPallets.toLocaleString('ru-RU')} шт.</span>
          </div>
          <div>
            <span className="text-neutral-500 block">Общее число бутылок:</span>
            <span className="font-bold text-sm">~{totalBottles.toLocaleString('ru-RU')} шт.</span>
          </div>
          <div>
            <span className="text-neutral-500 block">Сортов на хранении:</span>
            <span className="font-bold text-sm">{summary.length} позиций</span>
          </div>
        </div>

        {/* Summary Table */}
        <h2 className="text-sm font-bold uppercase mb-2">1. Сводка по сортам тары и поставщикам</h2>
        <table className="w-full text-left text-xs border-collapse border border-neutral-300 mb-6">
          <thead>
            <tr className="bg-neutral-100 border-b border-neutral-300 font-bold">
              <th className="p-2 border-r border-neutral-300">№</th>
              <th className="p-2 border-r border-neutral-300">Сорт стеклотары</th>
              <th className="p-2 border-r border-neutral-300">Цвет</th>
              <th className="p-2 border-r border-neutral-300">Поставщик</th>
              <th className="p-2 border-r border-neutral-300 text-right">В палете</th>
              <th className="p-2 border-r border-neutral-300 text-right">Ячеек</th>
              <th className="p-2 border-r border-neutral-300 text-right">Паллет</th>
              <th className="p-2 border-r border-neutral-300 text-right">Бутылок</th>
              <th className="p-2 border-r border-neutral-300">Старшая дата</th>
              <th className="p-2">Ячейки</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((item, idx) => (
              <tr key={item.key} className="border-b border-neutral-200">
                <td className="p-2 border-r border-neutral-200 font-mono">{idx + 1}</td>
                <td className="p-2 border-r border-neutral-200 font-bold">{item.bottleName}</td>
                <td className="p-2 border-r border-neutral-200">{item.colorLabel}</td>
                <td className="p-2 border-r border-neutral-200">{item.supplier}</td>
                <td className="p-2 border-r border-neutral-200 text-right font-mono">
                  {item.bottlesPerPallet}
                </td>
                <td className="p-2 border-r border-neutral-200 text-right font-mono font-bold">
                  {item.cellCount}
                </td>
                <td className="p-2 border-r border-neutral-200 text-right font-mono font-bold">
                  {item.palletCount}
                </td>
                <td className="p-2 border-r border-neutral-200 text-right font-mono font-bold">
                  {item.totalBottles.toLocaleString('ru-RU')}
                </td>
                <td className="p-2 border-r border-neutral-200 font-mono">
                  {item.oldestDate || '—'} {item.oldestDaysAge > 0 ? `(${item.oldestDaysAge} дн.)` : ''}
                </td>
                <td className="p-2 font-mono text-[10px]">{item.cellIds.join(', ')}</td>
              </tr>
            ))}
            <tr className="bg-neutral-100 font-bold">
              <td colSpan={5} className="p-2 border-r border-neutral-300 uppercase">
                Итого по терминалу:
              </td>
              <td className="p-2 border-r border-neutral-300 text-right font-mono">
                {totalOccupiedCells}
              </td>
              <td className="p-2 border-r border-neutral-300 text-right font-mono">
                {totalPallets.toLocaleString('ru-RU')}
              </td>
              <td className="p-2 border-r border-neutral-300 text-right font-mono">
                {totalBottles.toLocaleString('ru-RU')}
              </td>
              <td colSpan={2} className="p-2"></td>
            </tr>
          </tbody>
        </table>

        {/* Signatures block */}
        <div className="pt-8 mt-8 border-t border-neutral-400 grid grid-cols-2 gap-8 text-xs">
          <div>
            <p className="font-bold mb-4">Ответственный оператор / Кладовщик смены:</p>
            <p className="border-b border-black w-4/5 pb-1">ФИО / Подпись: ___________________________</p>
          </div>
          <div>
            <p className="font-bold mb-4">Смену принял / Начальник производства:</p>
            <p className="border-b border-black w-4/5 pb-1">ФИО / Подпись: ___________________________</p>
          </div>
        </div>
      </div>
    </>
  );
};
