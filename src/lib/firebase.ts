import { initializeApp, getApps, getApp } from 'firebase/app';
import firebaseConfig from '@/firebase-applet-config.json';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  getDocFromServer,
  onSnapshot,
  writeBatch,
  deleteDoc,
  Firestore
} from 'firebase/firestore';
import {
  getAuth,
  signOut
} from 'firebase/auth';
import { CatalogBottle, TerminalCell, WarehouseLog, UnloadingBatch, CellBatchDetail, CELLS_PER_ROW, GlassColor, TerminalLocation, LOCATION_LABELS, DEFAULT_PALLET_CAPACITY } from '../types/terminal';
import { INITIAL_BOTTLES, generateInitialCells, INITIAL_LOGS } from '../data/initialData';

// Set Firestore log level to silent to prevent transport reconnect notices from bubbling as console errors
try {
  setLogLevel('silent');
} catch (e) {
  console.debug('setLogLevel info:', e);
}

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with experimentalAutoDetectLongPolling for fastest channel with auto fallback
function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);

// Admin Configuration - Single secure password
export const ADMIN_PASSWORD = 'admin2026.ru';

export function verifyAdminPassword(password: string): boolean {
  return password.trim() === ADMIN_PASSWORD;
}

// Backward-compatibility alias
export function verifyAdminPin(passwordOrPin: string): boolean {
  return verifyAdminPassword(passwordOrPin);
}

export async function logoutAdmin(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Sign out warning:', err);
  }
}

// Error Handling Enum & Interface
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo?: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email
      })) || []
    },
    operationType,
    path
  };

  // When permissions fail, throw formatted JSON string per Firebase skill
  if (errMessage.includes('Missing or insufficient permissions') || (error as any)?.code === 'permission-denied') {
    console.error('Firestore Permission Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  // Otherwise handle smoothly for offline or transient network drops
  return errInfo;
}

// Required Firestore Connection Validation on boot per Firebase skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore client operates in offline mode.');
    }
  }
}
testConnection();

// Check connectivity with realistic timeout (5s)
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), 5000)
    );
    const fetchPromise = getDocFromServer(doc(db, 'test', 'connection'))
      .then(() => true)
      .catch((err) => {
        if (err?.code === 'not-found') return true;
        return false;
      });

    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    console.debug('Connection check notice:', error);
    return false;
  }
}

// Real-time listener for Terminal Cells
export function subscribeToTerminalCells(
  onSuccess: (cells: TerminalCell[]) => void,
  onError?: (err: unknown) => void
) {
  const cellsRef = collection(db, 'terminal_cells');
  return onSnapshot(
    cellsRef,
    (snapshot) => {
      if (snapshot.empty) {
        seedInitialCellsToFirestore()
          .then(onSuccess)
          .catch(() => onSuccess([]));
        return;
      }
      const cellsList: TerminalCell[] = snapshot.docs.map((d) => {
        const data = d.data() as TerminalCell;
        return {
          ...data,
          location: data.location || 'эстакада',
          palletCapacity: typeof data.palletCapacity === 'number' && data.palletCapacity > 0 ? data.palletCapacity : DEFAULT_PALLET_CAPACITY
        };
      });
      const sorted = cellsList.sort((a, b) => a.cellId.localeCompare(b.cellId));
      onSuccess(sorted);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'terminal_cells');
      if (onError) onError(err);
    }
  );
}

// Seed initial cells
export async function seedInitialCellsToFirestore(): Promise<TerminalCell[]> {
  const initialCells = generateInitialCells();
  try {
    const batch = writeBatch(db);
    initialCells.forEach((cell) => {
      const cellDocRef = doc(db, 'terminal_cells', cell.cellId);
      batch.set(cellDocRef, cell);
    });
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'terminal_cells');
  }
  return initialCells;
}

// Real-time listener for Bottles Catalog
export function subscribeToCatalogBottles(
  onSuccess: (bottles: CatalogBottle[]) => void,
  onError?: (err: unknown) => void
) {
  const bottlesRef = collection(db, 'catalog_bottles');
  return onSnapshot(
    bottlesRef,
    (snapshot) => {
      if (snapshot.empty) {
        seedInitialBottlesToFirestore()
          .then(onSuccess)
          .catch(() => onSuccess(INITIAL_BOTTLES));
        return;
      }
      const list: CatalogBottle[] = snapshot.docs.map((d) => d.data() as CatalogBottle);
      onSuccess(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'catalog_bottles');
      if (onError) onError(err);
    }
  );
}

// Seed catalog bottles
export async function seedInitialBottlesToFirestore(): Promise<CatalogBottle[]> {
  try {
    const batch = writeBatch(db);
    INITIAL_BOTTLES.forEach((b) => {
      const docRef = doc(db, 'catalog_bottles', b.id);
      batch.set(docRef, b);
    });
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'catalog_bottles');
  }
  return INITIAL_BOTTLES;
}

// Real-time listener for Logs
export function subscribeToWarehouseLogs(
  onSuccess: (logs: WarehouseLog[]) => void,
  onError?: (err: unknown) => void
) {
  const logsRef = collection(db, 'warehouse_logs');
  return onSnapshot(
    logsRef,
    (snapshot) => {
      if (snapshot.empty) {
        seedInitialLogsToFirestore()
          .then(onSuccess)
          .catch(() => onSuccess(INITIAL_LOGS));
        return;
      }
      const list: WarehouseLog[] = snapshot.docs.map((d) => d.data() as WarehouseLog);
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      onSuccess(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'warehouse_logs');
      if (onError) onError(err);
    }
  );
}

export async function seedInitialLogsToFirestore(): Promise<WarehouseLog[]> {
  try {
    const batch = writeBatch(db);
    INITIAL_LOGS.forEach((l) => {
      const docRef = doc(db, 'warehouse_logs', l.id);
      batch.set(docRef, l);
    });
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'warehouse_logs');
  }
  return INITIAL_LOGS;
}

// Unload truck
export async function unloadTruckToFirestore(
  batchData: UnloadingBatch,
  cellAssignments: Array<{ cellId: string; mfgDate: string; palletCount: number; mfgDateDetails?: CellBatchDetail[] }>
): Promise<boolean> {
  try {
    const batch = writeBatch(db);

    const batchDocRef = doc(db, 'unloading_batches', batchData.batchId);
    batch.set(batchDocRef, batchData);

    cellAssignments.forEach((assignment) => {
      const cellRef = doc(db, 'terminal_cells', assignment.cellId);
      const cellData: Partial<TerminalCell> = {
        cellId: assignment.cellId,
        row: batchData.row,
        location: batchData.location,
        position: parseInt(assignment.cellId.replace(/^[A-ZА-Я]+/i, ''), 10) || 1,
        status: 'occupied',
        bottleId: batchData.bottleId,
        bottleName: batchData.bottleName,
        bottleColor: batchData.bottleColor,
        supplier: batchData.supplier,
        bottlesPerPallet: batchData.bottlesPerPallet || 2400,
        mfgDate: assignment.mfgDate,
        mfgDateDetails: assignment.mfgDateDetails || [{ mfgDate: assignment.mfgDate, palletCount: assignment.palletCount, bottlesPerPallet: batchData.bottlesPerPallet || 2400 }],
        batchId: batchData.batchId,
        truckPlate: batchData.truckPlate,
        palletCount: assignment.palletCount,
        isBlocked: false,
        blockReason: '',
        blockedAt: '',
        blockedBy: '',
        updatedAt: new Date().toISOString()
      };
      batch.set(cellRef, cellData, { merge: true });
    });

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'unloaded_to_terminal',
      bottleName: batchData.bottleName,
      bottleColor: batchData.bottleColor,
      supplier: batchData.supplier,
      mfgDate: batchData.mfgDates.join(', '),
      cellsInvolved: cellAssignments.map((c) => c.cellId),
      quantityPallets: batchData.quantityPallets,
      operatorName: 'Оператор эстакады',
      timestamp: new Date().toISOString(),
      details: `Выгрузка машины ${batchData.truckPlate || ''} в Ряд ${batchData.row} (${batchData.quantityPallets} паллет)`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'unloading_batches');
    return false;
  }
}

// Block product in cell (forbidden from warehouse intake)
export async function blockCellFirestore(
  cellId: string,
  reason: string,
  operatorName: string = 'Оператор'
): Promise<boolean> {
  try {
    const cleanId = cellId.trim().toUpperCase();
    const cellRef = doc(db, 'terminal_cells', cleanId);
    const nowIso = new Date().toISOString();

    const updateData: Partial<TerminalCell> = {
      isBlocked: true,
      blockReason: reason.trim() || 'Блокировка продукции',
      blockedAt: nowIso,
      blockedBy: operatorName,
      updatedAt: nowIso
    };

    const batch = writeBatch(db);
    batch.set(cellRef, updateData, { merge: true });

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'unloaded_to_terminal',
      bottleName: `Блокировка ячейки ${cleanId}`,
      mfgDate: nowIso.split('T')[0],
      cellsInvolved: [cleanId],
      operatorName,
      timestamp: nowIso,
      details: `Ячейка ${cleanId} заблокирована: ${reason}. Завоз на склад запрещен.`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `terminal_cells/${cellId}`);
    return false;
  }
}

// Unblock cell (Admin only)
export async function unblockCellFirestore(
  cellId: string,
  adminName: string = 'Администратор'
): Promise<boolean> {
  try {
    const cleanId = cellId.trim().toUpperCase();
    const cellRef = doc(db, 'terminal_cells', cleanId);
    const nowIso = new Date().toISOString();

    const updateData: Partial<TerminalCell> = {
      isBlocked: false,
      blockReason: '',
      blockedAt: '',
      blockedBy: '',
      updatedAt: nowIso
    };

    const batch = writeBatch(db);
    batch.set(cellRef, updateData, { merge: true });

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'transferred_to_warehouse',
      bottleName: `Разблокировка ячейки ${cleanId}`,
      mfgDate: nowIso.split('T')[0],
      cellsInvolved: [cleanId],
      operatorName: adminName,
      timestamp: nowIso,
      details: `Ячейка ${cleanId} разблокирована администратором. Завоз на склад разрешен.`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `terminal_cells/${cellId}`);
    return false;
  }
}

export async function transferCellsToWarehouseFirestore(
  cellIds: string[],
  bottleName: string,
  mfgDate: string,
  totalPallets: number,
  bottleColor?: GlassColor,
  supplier?: string
): Promise<boolean> {
  try {
    const batch = writeBatch(db);
    const validCellIds: string[] = [];

    // Verify none of the transferred cells are blocked
    for (const cellId of cellIds) {
      const cellRef = doc(db, 'terminal_cells', cellId);
      const cellSnap = await getDoc(cellRef);
      if (cellSnap.exists()) {
        const cData = cellSnap.data() as TerminalCell;
        if (cData.isBlocked) {
          console.warn(`Cell ${cellId} is blocked! Cannot transfer to warehouse.`);
          continue; // Skip blocked cells
        }
      }
      validCellIds.push(cellId);
    }

    if (validCellIds.length === 0) {
      console.warn('All selected cells are blocked. Transfer aborted.');
      return false;
    }

    for (const cellId of validCellIds) {
      const cellRef = doc(db, 'terminal_cells', cellId);
      const cellSnap = await getDoc(cellRef);
      const existingData = cellSnap.data() as TerminalCell;
      
      const emptyCellData: TerminalCell = {
        cellId,
        row: cellId.charAt(0),
        position: parseInt(cellId.replace(/^[A-ZА-Я]+/i, ''), 10) || 1,
        location: existingData?.location || 'эстакада',
        palletCapacity: existingData?.palletCapacity || DEFAULT_PALLET_CAPACITY,
        status: 'empty',
        isBlocked: false,
        blockReason: '',
        blockedAt: '',
        blockedBy: '',
        updatedAt: new Date().toISOString()
      };
      batch.set(cellRef, emptyCellData);
    }

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'transferred_to_warehouse',
      bottleName,
      bottleColor,
      supplier,
      mfgDate,
      cellsInvolved: validCellIds,
      quantityPallets: totalPallets,
      operatorName: 'Водитель погрузчика',
      timestamp: new Date().toISOString(),
      details: `Завоз на склад (FIFO). Освобождены ячейки: ${validCellIds.join(', ')} (${totalPallets} паллет)`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'terminal_cells');
    return false;
  }
}

export interface PartialCellPickup {
  cellId: string;
  batchLabel?: string;
  mfgDate?: string;
  palletsToTake: number;
}

// Partial transfer of specific pallets/batches from cells to warehouse
export async function transferPalletsPartialFirestore(
  pickups: PartialCellPickup[],
  bottleName: string,
  bottleColor?: GlassColor,
  supplier?: string,
  operatorName: string = 'Водитель погрузчика'
): Promise<boolean> {
  try {
    const batch = writeBatch(db);
    let totalPalletsTaken = 0;
    const logDetails: string[] = [];

    for (const p of pickups) {
      if (p.palletsToTake <= 0) continue;
      const cellRef = doc(db, 'terminal_cells', p.cellId);
      const cellSnap = await getDoc(cellRef);
      if (!cellSnap.exists()) continue;

      const cellData = cellSnap.data() as TerminalCell;
      if (cellData.status !== 'occupied') continue;
      if (cellData.isBlocked) {
        console.warn(`Cell ${p.cellId} is blocked! Cannot take pallets.`);
        continue; // Blocked cells cannot be taken to warehouse
      }

      const details: CellBatchDetail[] = cellData.mfgDateDetails
        ? [...cellData.mfgDateDetails]
        : [
            {
              batchLabel: 'Партия #1',
              mfgDate: cellData.mfgDate || '2026-01-01',
              palletCount: cellData.palletCount || 26
            }
          ];

      let remainingToDeduct = p.palletsToTake;
      const targetBatchLabel = p.batchLabel || '';

      const updatedDetails: CellBatchDetail[] = [];
      for (const bDetail of details) {
        const matches = !targetBatchLabel || bDetail.batchLabel === targetBatchLabel;
        if (matches && remainingToDeduct > 0) {
          const deduct = Math.min(bDetail.palletCount, remainingToDeduct);
          remainingToDeduct -= deduct;
          totalPalletsTaken += deduct;
          const leftInBatch = bDetail.palletCount - deduct;
          if (leftInBatch > 0) {
            updatedDetails.push({
              ...bDetail,
              palletCount: leftInBatch
            });
          }
        } else {
          updatedDetails.push(bDetail);
        }
      }

      const totalCellLeft = updatedDetails.reduce((sum, d) => sum + d.palletCount, 0);

      if (totalCellLeft <= 0 || updatedDetails.length === 0) {
        const emptyCellData: TerminalCell = {
          cellId: p.cellId,
          row: p.cellId.charAt(0),
          position: parseInt(p.cellId.replace(/^[A-ZА-Я]+/i, ''), 10) || 1,
          location: cellData.location || 'эстакада',
          palletCapacity: cellData.palletCapacity || DEFAULT_PALLET_CAPACITY,
          status: 'empty',
          updatedAt: new Date().toISOString()
        };
        batch.set(cellRef, emptyCellData);
        logDetails.push(`Освобождена ячейка ${p.cellId} (${p.palletsToTake} палл.)`);
      } else {
        const sorted = [...updatedDetails].sort(
          (a, b) => new Date(a.mfgDate).getTime() - new Date(b.mfgDate).getTime()
        );
        const updatedCellData: Partial<TerminalCell> = {
          status: 'occupied',
          palletCount: totalCellLeft,
          mfgDate: sorted[0]?.mfgDate || cellData.mfgDate,
          mfgDateDetails: updatedDetails,
          updatedAt: new Date().toISOString()
        };
        batch.set(cellRef, updatedCellData, { merge: true });
        logDetails.push(`Забрано ${p.palletsToTake} палл. из ${p.cellId} (Осталось ${totalCellLeft} палл.)`);
      }
    }

    if (totalPalletsTaken > 0) {
      const logId = `log_${Date.now()}`;
      const logRef = doc(db, 'warehouse_logs', logId);
      const logData: WarehouseLog = {
        id: logId,
        actionType: 'transferred_to_warehouse',
        bottleName,
        bottleColor,
        supplier,
        mfgDate: new Date().toISOString().split('T')[0],
        cellsInvolved: Array.from(new Set(pickups.map((p) => p.cellId))),
        quantityPallets: totalPalletsTaken,
        operatorName,
        timestamp: new Date().toISOString(),
        details: `Завоз на склад (${totalPalletsTaken} паллет): ${logDetails.join('; ')}`
      };
      batch.set(logRef, logData);
      await batch.commit();
      return true;
    }
    return false;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'terminal_cells');
    return false;
  }
}

// Add catalog bottle
export async function addCatalogBottleFirestore(bottle: CatalogBottle): Promise<boolean> {
  try {
    const docRef = doc(db, 'catalog_bottles', bottle.id);
    await setDoc(docRef, bottle);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `catalog_bottles/${bottle.id}`);
    return false;
  }
}

// Update catalog bottle (e.g. bottlesPerPallet or name)
export async function updateCatalogBottleFirestore(
  bottleId: string,
  updates: Partial<CatalogBottle>
): Promise<boolean> {
  try {
    const docRef = doc(db, 'catalog_bottles', bottleId);
    await setDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `catalog_bottles/${bottleId}`);
    return false;
  }
}

// Delete catalog bottle
export async function deleteCatalogBottleFirestore(bottleId: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'catalog_bottles', bottleId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `catalog_bottles/${bottleId}`);
    return false;
  }
}

// Add dynamic terminal row
export async function addTerminalRowFirestore(
  rowLetter: string,
  location: TerminalLocation = 'эстакада',
  capacity: number = DEFAULT_PALLET_CAPACITY
): Promise<boolean> {
  try {
    const batch = writeBatch(db);
    const cleanRow = rowLetter.trim().toUpperCase();
    const finalCapacity = Math.max(1, capacity || DEFAULT_PALLET_CAPACITY);

    for (let pos = 1; pos <= CELLS_PER_ROW; pos++) {
      const cellId = `${cleanRow}${pos}`;
      const cellRef = doc(db, 'terminal_cells', cellId);
      const newCell: TerminalCell = {
        cellId,
        row: cleanRow,
        position: pos,
        location,
        palletCapacity: finalCapacity,
        status: 'empty',
        updatedAt: new Date().toISOString()
      };
      batch.set(cellRef, newCell);
    }

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'unloaded_to_terminal',
      bottleName: `Добавлен Ряд ${cleanRow} (${LOCATION_LABELS[location]})`,
      mfgDate: new Date().toISOString().split('T')[0],
      cellsInvolved: Array.from({ length: CELLS_PER_ROW }, (_, i) => `${cleanRow}${i + 1}`),
      operatorName: 'Администратор',
      timestamp: new Date().toISOString(),
      details: `В структуру терминала (${LOCATION_LABELS[location]}) добавлен новый Ряд ${cleanRow} (7 ячеек)`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'terminal_cells');
    return false;
  }
}

// Delete terminal row
export async function deleteTerminalRowFirestore(rowLetter: string, cellIdsInRow: string[]): Promise<boolean> {
  try {
    const batch = writeBatch(db);
    const cleanRow = rowLetter.trim().toUpperCase();

    cellIdsInRow.forEach((cellId) => {
      const cellRef = doc(db, 'terminal_cells', cellId);
      batch.delete(cellRef);
    });

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'transferred_to_warehouse',
      bottleName: `Удален Ряд ${cleanRow}`,
      mfgDate: new Date().toISOString().split('T')[0],
      cellsInvolved: cellIdsInRow,
      operatorName: 'Администратор',
      timestamp: new Date().toISOString(),
      details: `Из структуры терминала удален Ряд ${cleanRow} (${cellIdsInRow.length} ячеек)`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'terminal_cells');
    return false;
  }
}

// Add individual terminal cell
export async function addTerminalCellFirestore(
  cellId: string,
  rowLetter: string,
  location: TerminalLocation = 'эстакада',
  position?: number,
  capacity: number = DEFAULT_PALLET_CAPACITY
): Promise<boolean> {
  try {
    const cleanCellId = cellId.trim().toUpperCase();
    const cleanRow = rowLetter.trim().toUpperCase();
    const pos = position || parseInt(cleanCellId.replace(/^[A-ZА-Я]+/i, ''), 10) || 1;
    const finalCapacity = Math.max(1, capacity || DEFAULT_PALLET_CAPACITY);

    const cellRef = doc(db, 'terminal_cells', cleanCellId);
    const newCell: TerminalCell = {
      cellId: cleanCellId,
      row: cleanRow,
      position: pos,
      location,
      palletCapacity: finalCapacity,
      status: 'empty',
      updatedAt: new Date().toISOString()
    };

    const batch = writeBatch(db);
    batch.set(cellRef, newCell);

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'unloaded_to_terminal',
      bottleName: `Создана ячейка ${cleanCellId}`,
      mfgDate: new Date().toISOString().split('T')[0],
      cellsInvolved: [cleanCellId],
      operatorName: 'Администратор',
      timestamp: new Date().toISOString(),
      details: `Добавлена новая свободная ячейка ${cleanCellId} в Ряд ${cleanRow} (${LOCATION_LABELS[location]})`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `terminal_cells/${cellId}`);
    return false;
  }
}

// Delete individual terminal cell
export async function deleteTerminalCellFirestore(cellId: string): Promise<boolean> {
  try {
    const cleanCellId = cellId.trim().toUpperCase();
    const cellRef = doc(db, 'terminal_cells', cleanCellId);

    const batch = writeBatch(db);
    batch.delete(cellRef);

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'transferred_to_warehouse',
      bottleName: `Удалена ячейка ${cleanCellId}`,
      mfgDate: new Date().toISOString().split('T')[0],
      cellsInvolved: [cleanCellId],
      operatorName: 'Администратор',
      timestamp: new Date().toISOString(),
      details: `Удалена пустая ячейка ${cleanCellId}`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `terminal_cells/${cellId}`);
    return false;
  }
}

// Update capacity of an individual cell (Admin only)
export async function updateCellCapacityFirestore(
  cellId: string,
  newCapacity: number,
  adminName: string = 'Администратор'
): Promise<boolean> {
  try {
    const cleanId = cellId.trim().toUpperCase();
    const finalCapacity = Math.max(1, Math.round(newCapacity));
    const cellRef = doc(db, 'terminal_cells', cleanId);
    const nowIso = new Date().toISOString();

    const cellSnap = await getDoc(cellRef);
    if (!cellSnap.exists()) return false;
    const existing = cellSnap.data() as TerminalCell;

    const batch = writeBatch(db);
    batch.set(cellRef, { palletCapacity: finalCapacity, updatedAt: nowIso }, { merge: true });

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'transferred_to_warehouse',
      bottleName: `Изменение вместимости ${cleanId}: ${existing.palletCapacity || DEFAULT_PALLET_CAPACITY} → ${finalCapacity} палл.`,
      mfgDate: nowIso.split('T')[0],
      cellsInvolved: [cleanId],
      operatorName: adminName,
      timestamp: nowIso,
      details: `Администратор изменил максимальную вместимость ячейки ${cleanId} на ${finalCapacity} паллет.`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `terminal_cells/${cellId}`);
    return false;
  }
}

// Update capacity of all cells in a row (Admin only)
export async function updateRowCapacityFirestore(
  rowLetter: string,
  cellIds: string[],
  newCapacity: number,
  adminName: string = 'Администратор'
): Promise<boolean> {
  try {
    const cleanRow = rowLetter.trim().toUpperCase();
    const finalCapacity = Math.max(1, Math.round(newCapacity));
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);

    cellIds.forEach((cId) => {
      const cellRef = doc(db, 'terminal_cells', cId);
      batch.set(cellRef, { palletCapacity: finalCapacity, updatedAt: nowIso }, { merge: true });
    });

    const logId = `log_${Date.now()}`;
    const logRef = doc(db, 'warehouse_logs', logId);
    const logData: WarehouseLog = {
      id: logId,
      actionType: 'transferred_to_warehouse',
      bottleName: `Вместимость Ряда ${cleanRow}: ${finalCapacity} палл./ячейка`,
      mfgDate: nowIso.split('T')[0],
      cellsInvolved: cellIds,
      operatorName: adminName,
      timestamp: nowIso,
      details: `Администратор изменил вместимость всех ${cellIds.length} ячеек Ряда ${cleanRow} на ${finalCapacity} паллет.`
    };
    batch.set(logRef, logData);

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `terminal_cells/row_${rowLetter}`);
    return false;
  }
}

// Reset database
export async function resetDatabaseFirestore(): Promise<boolean> {
  try {
    await seedInitialCellsToFirestore();
    await seedInitialBottlesToFirestore();
    await seedInitialLogsToFirestore();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'reset_database');
    return false;
  }
}
