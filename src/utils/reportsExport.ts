import * as XLSX from 'xlsx';
import {
  TerminalCell,
  CatalogBottle,
  WarehouseLog,
  TerminalLocation,
  LOCATION_LABELS,
  getGlassColorLabel,
  DEFAULT_PALLET_CAPACITY
} from '../types/terminal';

export interface ReportFilterOptions {
  location?: 'all' | TerminalLocation;
  bottleId?: 'all' | string;
  onlyOccupied?: boolean;
}

export interface SummaryBottleItem {
  key: string;
  bottleId: string;
  bottleName: string;
  supplier: string;
  colorLabel: string;
  bottlesPerPallet: number;
  cellCount: number;
  palletCount: number;
  totalBottles: number;
  oldestDate: string;
  oldestDaysAge: number;
  cellIds: string[];
}

// Calculate days age from YYYY-MM-DD
export function calculateAgeDays(dateStr?: string): number {
  if (!dateStr) return 0;
  const mfg = new Date(dateStr).getTime();
  const now = new Date().getTime();
  const diff = Math.floor((now - mfg) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// Filter cells based on user criteria
export function filterCellsForReport(
  cells: TerminalCell[],
  options: ReportFilterOptions
): TerminalCell[] {
  return cells.filter((c) => {
    if (options.location && options.location !== 'all' && c.location !== options.location) {
      return false;
    }
    if (options.bottleId && options.bottleId !== 'all' && c.bottleId !== options.bottleId) {
      return false;
    }
    if (options.onlyOccupied && c.status !== 'occupied') {
      return false;
    }
    return true;
  });
}

// Aggregate summary by bottle, supplier, and color
export function aggregateSummaryData(
  cells: TerminalCell[],
  catalog: CatalogBottle[]
): SummaryBottleItem[] {
  const map = new Map<string, SummaryBottleItem>();

  const occupiedCells = cells.filter((c) => c.status === 'occupied' && c.bottleName);

  occupiedCells.forEach((c) => {
    const bId = c.bottleId || c.bottleName || 'unknown';
    const supp = c.supplier || 'Не указан';
    const color = c.bottleColor || 'green';
    const key = `${bId}___${supp}___${color}`;

    const catObj = catalog.find((b) => b.id === c.bottleId || b.name === c.bottleName);
    const bPerPallet = c.bottlesPerPallet || catObj?.bottlesPerPallet || 2400;
    const pallets = c.palletCount || 26;
    const bottles = pallets * bPerPallet;

    let cellOldestDate = c.mfgDate || '';
    if (c.mfgDateDetails && c.mfgDateDetails.length > 0) {
      const dates = c.mfgDateDetails.map((d) => d.mfgDate).filter(Boolean);
      dates.sort();
      if (dates[0]) cellOldestDate = dates[0];
    }

    if (!map.has(key)) {
      map.set(key, {
        key,
        bottleId: bId,
        bottleName: c.bottleName || 'Стеклотара',
        supplier: supp,
        colorLabel: getGlassColorLabel(color),
        bottlesPerPallet: bPerPallet,
        cellCount: 1,
        palletCount: pallets,
        totalBottles: bottles,
        oldestDate: cellOldestDate,
        oldestDaysAge: calculateAgeDays(cellOldestDate),
        cellIds: [c.cellId]
      });
    } else {
      const curr = map.get(key)!;
      curr.cellCount += 1;
      curr.palletCount += pallets;
      curr.totalBottles += bottles;
      curr.cellIds.push(c.cellId);

      if (cellOldestDate && (!curr.oldestDate || cellOldestDate < curr.oldestDate)) {
        curr.oldestDate = cellOldestDate;
        curr.oldestDaysAge = calculateAgeDays(cellOldestDate);
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => b.totalBottles - a.totalBottles);
}

// Export formatted Excel file with multiple sheets
export function exportWarehouseToExcel({
  cells,
  catalog,
  logs,
  options
}: {
  cells: TerminalCell[];
  catalog: CatalogBottle[];
  logs: WarehouseLog[];
  options: ReportFilterOptions;
}) {
  const filteredCells = filterCellsForReport(cells, options);
  const summary = aggregateSummaryData(filteredCells, catalog);

  const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const dateFormatted = new Date().toLocaleString('ru-RU');

  // Sheet 1: Сводная ведомость
  const sheet1Data = [
    ['ТЕРМИНАЛ СТЕКЛОТАРЫ — СВОДНАЯ ВЕДОМОСТЬ ОСТАТКОВ'],
    [`Дата и время формирования: ${dateFormatted}`],
    [
      `Фильтр по локации: ${
        options.location && options.location !== 'all'
          ? LOCATION_LABELS[options.location]
          : 'Все локации (Эстакада, Плиты, АБК)'
      }`
    ],
    [],
    [
      '№',
      'Наименование стеклотары',
      'Цвет стекла',
      'Поставщик / Завод',
      'В палете (бут.)',
      'Занято ячеек',
      'Всего паллет',
      'Всего бутылок (шт.)',
      'Старшая дата (FIFO)',
      'Возраст партии (дней)',
      'Ячейки размещения'
    ]
  ];

  let totalCellCount = 0;
  let totalPalletSum = 0;
  let totalBottlesSum = 0;

  summary.forEach((item, idx) => {
    totalCellCount += item.cellCount;
    totalPalletSum += item.palletCount;
    totalBottlesSum += item.totalBottles;

    sheet1Data.push([
      (idx + 1).toString(),
      item.bottleName,
      item.colorLabel,
      item.supplier,
      item.bottlesPerPallet.toString(),
      item.cellCount.toString(),
      item.palletCount.toString(),
      item.totalBottles.toString(),
      item.oldestDate || '—',
      item.oldestDaysAge > 0 ? `${item.oldestDaysAge} дн.` : 'Сегодня',
      item.cellIds.join(', ')
    ]);
  });

  sheet1Data.push([]);
  sheet1Data.push([
    'ИТОГО ПО ТЕРМИНАЛУ:',
    '',
    '',
    '',
    '',
    totalCellCount.toString(),
    totalPalletSum.toString(),
    totalBottlesSum.toString(),
    '',
    '',
    ''
  ]);

  // Sheet 2: Поячеечный срез
  const sheet2Data = [
    ['ПОЯЧЕЕЧНЫЙ СРЕЗ ОСТАТКОВ И РАЗМЕЩЕНИЯ НА ТЕРМИНАЛЕ'],
    [`Дата формирования: ${dateFormatted}`],
    [],
    [
      'Локация',
      'Ряд',
      'Ячейка',
      'Статус',
      'Сорт стеклотары',
      'Цвет стекла',
      'Поставщик',
      'В палете (бут.)',
      'Факт паллет',
      'Вместимость',
      'Всего бутылок',
      'Старшая дата',
      'Возраст (дней)',
      'Госномер ТС',
      'Блокировка / Причина',
      'Состав партий'
    ]
  ];

  filteredCells
    .sort((a, b) => {
      if (a.location !== b.location) return a.location.localeCompare(b.location);
      if (a.row !== b.row) return a.row.localeCompare(b.row);
      return a.position - b.position;
    })
    .forEach((cell) => {
      const isOccupied = cell.status === 'occupied';
      const cap = cell.palletCapacity || DEFAULT_PALLET_CAPACITY;
      const bPerPallet = cell.bottlesPerPallet || 2400;
      const pallets = cell.palletCount || (isOccupied ? 26 : 0);
      const totalBottles = pallets * bPerPallet;
      const age = calculateAgeDays(cell.mfgDate);

      let batchesSummary = '';
      if (cell.mfgDateDetails && cell.mfgDateDetails.length > 0) {
        batchesSummary = cell.mfgDateDetails
          .map((d) => `${d.batchLabel || 'Партия'}: ${d.palletCount}п (от ${d.mfgDate})`)
          .join('; ');
      }

      sheet2Data.push([
        LOCATION_LABELS[cell.location || 'эстакада'],
        cell.row,
        cell.cellId,
        isOccupied ? 'Занята' : 'Свободна',
        isOccupied ? cell.bottleName || '—' : '—',
        isOccupied ? getGlassColorLabel(cell.bottleColor) : '—',
        isOccupied ? cell.supplier || '—' : '—',
        isOccupied ? bPerPallet.toString() : '—',
        isOccupied ? pallets.toString() : '0',
        cap.toString(),
        isOccupied ? totalBottles.toString() : '0',
        isOccupied ? cell.mfgDate || '—' : '—',
        isOccupied && age > 0 ? `${age} дн.` : isOccupied ? 'Сегодня' : '—',
        isOccupied ? cell.truckPlate || '—' : '—',
        cell.isBlocked ? `ЗАБЛОКИРОВАНО: ${cell.blockReason || ''}` : 'В норме',
        batchesSummary
      ]);
    });

  // Sheet 3: Журнал операций (последние 100)
  const sheet3Data = [
    ['ЖУРНАЛ СКЛАДСКИХ ОПЕРАЦИЙ (ВЫГРУЗКА И ЗАВОЗ НА СКЛАД)'],
    [`Дата формирования: ${dateFormatted}`],
    [],
    [
      'Дата и время',
      'Тип операции',
      'Стеклотара',
      'Цвет',
      'Поставщик',
      'Дата выработки',
      'Ячейки',
      'Паллет',
      'Детали / ТС'
    ]
  ];

  logs.slice(0, 200).forEach((log) => {
    sheet3Data.push([
      new Date(log.timestamp).toLocaleString('ru-RU'),
      log.actionType === 'unloaded_to_terminal' ? 'Выгрузка машины на терминал' : 'Завоз с терминала на склад (FIFO)',
      log.bottleName,
      getGlassColorLabel(log.bottleColor),
      log.supplier || '—',
      log.mfgDate,
      log.cellsInvolved.join(', '),
      (log.quantityPallets || '').toString(),
      log.details || ''
    ]);
  });

  // Create Workbook
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);

  // Set column widths for better readability
  ws1['!cols'] = [
    { wch: 4 },
    { wch: 26 },
    { wch: 14 },
    { wch: 22 },
    { wch: 15 },
    { wch: 13 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 30 }
  ];

  ws2['!cols'] = [
    { wch: 12 },
    { wch: 6 },
    { wch: 8 },
    { wch: 10 },
    { wch: 24 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 15 },
    { wch: 14 },
    { wch: 25 },
    { wch: 45 }
  ];

  ws3['!cols'] = [
    { wch: 20 },
    { wch: 32 },
    { wch: 24 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 20 },
    { wch: 10 },
    { wch: 35 }
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'Сводка остатков');
  XLSX.utils.book_append_sheet(wb, ws2, 'Поячеечный срез');
  XLSX.utils.book_append_sheet(wb, ws3, 'Журнал операций');

  // Generate binary and trigger download
  const fileName = `Остатки_Стеклотары_${options.location || 'все'}_${timestamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
