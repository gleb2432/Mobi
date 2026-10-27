import { CatalogBottle, TerminalCell, WarehouseLog, TERMINAL_ROWS, CELLS_PER_ROW, DEFAULT_PALLET_CAPACITY } from '../types/terminal';

export const INITIAL_BOTTLES: CatalogBottle[] = [
  {
    id: 'bad_green_045',
    name: 'Бад Зелёная 0.45L',
    supplier: 'ООО Стеклопром-Юг',
    color: 'green',
    volume: '0.45 л',
    bottlesPerPallet: 2400,
    createdAt: new Date().toISOString()
  },
  {
    id: 'baltika_brown_05',
    name: 'Балтика Коричневая 0.5L',
    supplier: 'АО Веденовский Стеклозавод',
    color: 'brown',
    volume: '0.50 л',
    bottlesPerPallet: 2100,
    createdAt: new Date().toISOString()
  },
  {
    id: 'zhiguli_clear_05',
    name: 'Жигули Бесцветная 0.5L',
    supplier: 'ООО ГлассПак Компани',
    color: 'clear',
    volume: '0.50 л',
    bottlesPerPallet: 2100,
    createdAt: new Date().toISOString()
  },
  {
    id: 'klinskoe_green_045',
    name: 'Клинское Зелёная 0.45L',
    supplier: 'ООО Стеклопром-Юг',
    color: 'green',
    volume: '0.45 л',
    bottlesPerPallet: 2400,
    createdAt: new Date().toISOString()
  },
  {
    id: 'staropramen_brown_05',
    name: 'Старопрамен Коричневая 0.5L',
    supplier: 'АО Веденовский Стеклозавод',
    color: 'brown',
    volume: '0.50 л',
    bottlesPerPallet: 2100,
    createdAt: new Date().toISOString()
  }
];

export function generateEmptyCells(): TerminalCell[] {
  const cells: TerminalCell[] = [];
  TERMINAL_ROWS.forEach(row => {
    for (let pos = 1; pos <= CELLS_PER_ROW; pos++) {
      cells.push({
        cellId: `${row}${pos}`,
        row,
        position: pos,
        location: 'эстакада',
        status: 'empty'
      });
    }
  });
  return cells;
}

export function generateInitialCells(): TerminalCell[] {
  return generateEmptyCells();
}

export const INITIAL_LOGS: WarehouseLog[] = [
  {
    id: 'log_001',
    actionType: 'unloaded_to_terminal',
    bottleName: 'Бад Зелёная 0.45L',
    mfgDate: '2026-10-10',
    cellsInvolved: ['A1', 'A2'],
    quantityPallets: 52,
    operatorName: 'Оператор эстакады',
    timestamp: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    details: 'Машина А777УК 777. Партия 52 паллеты (по 26 на ячейку).'
  },
  {
    id: 'log_002',
    actionType: 'unloaded_to_terminal',
    bottleName: 'Бад Зелёная 0.45L',
    mfgDate: '2026-10-18, 2026-10-20',
    cellsInvolved: ['B1', 'B2'],
    quantityPallets: 52,
    operatorName: 'Оператор эстакады',
    timestamp: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    details: 'Машина В342ВВ 199. Ячейка B1 содержит 2 разные партии (14 + 12 паллет = 26 паллет).'
  }
];
