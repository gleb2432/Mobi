export type GlassColor = 'brown' | 'green' | 'clear' | 'amber' | 'emerald';
export type PrimaryGlassColor = 'brown' | 'green' | 'clear';

export const GLASS_COLORS: { id: PrimaryGlassColor; label: string }[] = [
  { id: 'brown', label: 'Коричневая' },
  { id: 'green', label: 'Зелёная' },
  { id: 'clear', label: 'Бесцветная' }
];

export function getGlassColorLabel(color?: GlassColor): string {
  if (!color) return '—';
  if (color === 'brown' || color === 'amber') return 'Коричневая';
  if (color === 'green' || color === 'emerald') return 'Зелёная';
  if (color === 'clear') return 'Бесцветная';
  return '—';
}

export interface CatalogBottle {
  id: string;
  name: string;
  supplier: string;
  color: GlassColor;
  volume?: string;
  bottlesPerPallet?: number; // Количество бутылок в 1 палете (по умолчанию 2400)
  createdAt?: string;
  updatedAt?: string;
}

export interface CellBatchDetail {
  batchId?: string;
  batchLabel?: string; // e.g. "Партия #1", "Партия #2"
  mfgDate: string;
  palletCount: number;
  bottlesPerPallet?: number;
}

export interface TerminalCell {
  cellId: string;        // e.g. "A1", "B7", "L3"
  row: string;           // e.g. "A", "B", ... "L"
  position: number;      // 1..7
  status: 'empty' | 'occupied';
  bottleId?: string;
  bottleName?: string;
  bottleColor?: GlassColor;
  supplier?: string;
  bottlesPerPallet?: number; // Количество бутылок в 1 палете
  mfgDate?: string;      // YYYY-MM-DD or primary date
  mfgDateDetails?: CellBatchDetail[]; // Support for multiple batches in 1 cell!
  batchId?: string;
  truckPlate?: string;
  palletCount?: number;  // Default 26
  isBlocked?: boolean;   // Lock/block product in cell to prevent intake
  blockReason?: string;  // Reason e.g. "Брак", "Карантин"
  blockedAt?: string;    // ISO timestamp
  blockedBy?: string;    // Operator or user name
  updatedAt?: string;
}

export interface UnloadingBatch {
  batchId: string;
  bottleId: string;
  bottleName: string;
  supplier: string;
  bottleColor: GlassColor;
  bottlesPerPallet?: number; // Количество бутылок в 1 палете
  mfgDates: string[];    // Array of production dates (YYYY-MM-DD)
  row: string;           // Target row e.g. "A"
  occupiedCellIds: string[]; // Cell IDs e.g. ["A1", "A2"]
  quantityPallets: number;
  truckPlate: string;
  notes?: string;
  createdAt: string;
}

export interface WarehouseLog {
  id: string;
  actionType: 'unloaded_to_terminal' | 'transferred_to_warehouse';
  bottleName: string;
  bottleColor?: GlassColor;
  supplier?: string;
  mfgDate: string;
  cellsInvolved: string[];
  quantityPallets?: number;
  operatorName?: string;
  timestamp: string;
  details?: string;
}

export interface FifoGroup {
  bottleId: string;
  bottleName: string;
  mfgDate: string; // YYYY-MM-DD (primary/oldest)
  allMfgDates?: string[];
  supplier: string;
  color: GlassColor;
  cells: TerminalCell[];
  totalPallets: number;
  isOldest: boolean;
  ageDays: number;
  allBatches?: CellBatchDetail[];
}

export const TERMINAL_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
export type TerminalRow = typeof TERMINAL_ROWS[number];
export const CELLS_PER_ROW = 7;
export const DEFAULT_PALLET_CAPACITY = 26;
