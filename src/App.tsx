/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CatalogBottle, TerminalCell, WarehouseLog, UnloadingBatch, GlassColor, TerminalLocation, DEFAULT_PALLET_CAPACITY } from './types/terminal';
import { INITIAL_BOTTLES, generateInitialCells, INITIAL_LOGS } from './data/initialData';
import {
  subscribeToTerminalCells,
  subscribeToCatalogBottles,
  subscribeToWarehouseLogs,
  unloadTruckToFirestore,
  transferCellsToWarehouseFirestore,
  transferPalletsPartialFirestore,
  PartialCellPickup,
  addTerminalRowFirestore,
  deleteTerminalRowFirestore,
  addTerminalCellFirestore,
  deleteTerminalCellFirestore,
  updateCellCapacityFirestore,
  updateRowCapacityFirestore,
  addCatalogBottleFirestore,
  updateCatalogBottleFirestore,
  deleteCatalogBottleFirestore,
  resetDatabaseFirestore,
  blockCellFirestore,
  unblockCellFirestore,
  testFirestoreConnection,
  logoutAdmin
} from './lib/firebase';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { TerminalMap } from './components/TerminalMap';
import { TruckUnloading } from './components/TruckUnloading';
import { FifoWarehouseIntake } from './components/FifoWarehouseIntake';
import { AdminPanel } from './components/AdminPanel';
import { AdminAuthModal } from './components/AdminAuthModal';
import { ReportsModal } from './components/ReportsModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<'map' | 'unload' | 'fifo' | 'admin'>('map');

  // Application Data States (Instant localStorage cache prevents flashing dummy data on reload)
  const [cells, setCells] = useState<TerminalCell[]>(() => {
    try {
      const cached = localStorage.getItem('terminal_cells_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.debug('Cells cache read notice:', e);
    }
    return generateInitialCells();
  });

  const [catalog, setCatalog] = useState<CatalogBottle[]>(() => {
    try {
      const cached = localStorage.getItem('terminal_catalog_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.debug('Catalog cache read notice:', e);
    }
    return INITIAL_BOTTLES;
  });

  const [logs, setLogs] = useState<WarehouseLog[]>(() => {
    try {
      const cached = localStorage.getItem('terminal_logs_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.debug('Logs cache read notice:', e);
    }
    return INITIAL_LOGS;
  });
  const [isLive, setIsLive] = useState<boolean>(true);
  const [presetRow, setPresetRow] = useState<string>('A');
  const [presetCellId, setPresetCellId] = useState<string | undefined>(undefined);

  // Admin Access Control States
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('terminal_admin_session') === 'true';
    } catch {
      return false;
    }
  });
  const [adminEmail, setAdminEmail] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('terminal_admin_email');
    } catch {
      return null;
    }
  });
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);
  const [adminModalActionTitle, setAdminModalActionTitle] = useState<string | undefined>(undefined);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState<boolean>(false);

  // Admin Auth Helpers
  const handleAdminLoginSuccess = (identifier?: string) => {
    setIsAdmin(true);
    const adminLabel = identifier || 'Администратор';
    setAdminEmail(adminLabel);
    try {
      sessionStorage.setItem('terminal_admin_session', 'true');
      sessionStorage.setItem('terminal_admin_email', adminLabel);
    } catch (e) {
      console.warn('Storage warning:', e);
    }

    // If admin logged in specifically to view reports, open reports modal
    if (adminModalActionTitle?.toLowerCase().includes('отчет')) {
      setIsReportsModalOpen(true);
    }
  };

  const handleLogoutAdmin = async () => {
    await logoutAdmin();
    setIsAdmin(false);
    setAdminEmail(null);
    try {
      sessionStorage.removeItem('terminal_admin_session');
      sessionStorage.removeItem('terminal_admin_email');
    } catch (e) {
      console.warn('Storage warning:', e);
    }
  };

  const handleRequireAdmin = (actionTitle: string): boolean => {
    if (isAdmin) return true;
    setAdminModalActionTitle(actionTitle);
    setIsAdminModalOpen(true);
    return false;
  };

  // Secure Reports Opener (Admin Only)
  const handleOpenReports = () => {
    if (!isAdmin) {
      setAdminModalActionTitle('Доступ к отчетам (только для администратора)');
      setIsAdminModalOpen(true);
      return;
    }
    setIsReportsModalOpen(true);
  };

  // Real-time Firebase Sync Setup
  useEffect(() => {
    testFirestoreConnection().then((ok) => {
      if (ok) {
        setIsLive(true);
      }
    });

    // Subscribe to Cells
    const unsubscribeCells = subscribeToTerminalCells(
      (updatedCells) => {
        setCells(updatedCells);
        setIsLive(true);
        try {
          localStorage.setItem('terminal_cells_cache', JSON.stringify(updatedCells));
        } catch (e) {
          console.debug('Cells cache write notice:', e);
        }
      },
      (err) => {
        console.warn('Real-time sync cells notice:', err);
      }
    );

    // Subscribe to Catalog Bottles
    const unsubscribeCatalog = subscribeToCatalogBottles(
      (updatedCatalog) => {
        setCatalog(updatedCatalog);
        setIsLive(true);
        try {
          localStorage.setItem('terminal_catalog_cache', JSON.stringify(updatedCatalog));
        } catch (e) {
          console.debug('Catalog cache write notice:', e);
        }
      },
      (err) => {
        console.warn('Real-time sync catalog notice:', err);
      }
    );

    // Subscribe to Logs
    const unsubscribeLogs = subscribeToWarehouseLogs(
      (updatedLogs) => {
        setLogs(updatedLogs);
        setIsLive(true);
        try {
          localStorage.setItem('terminal_logs_cache', JSON.stringify(updatedLogs));
        } catch (e) {
          console.debug('Logs cache write notice:', e);
        }
      },
      (err) => {
        console.warn('Real-time sync logs notice:', err);
      }
    );

    return () => {
      unsubscribeCells();
      unsubscribeCatalog();
      unsubscribeLogs();
    };
  }, []);

  // Handlers for Truck Unloading
  const handleUnloadTruck = async (
    batchData: UnloadingBatch,
    cellAssignments: Array<{ cellId: string; mfgDate: string; palletCount: number; mfgDateDetails?: any[] }>
  ): Promise<boolean> => {
    const success = await unloadTruckToFirestore(batchData, cellAssignments);

    if (!isLive || !success) {
      setCells((prev) => {
        const next = [...prev];
        cellAssignments.forEach((assignment) => {
          const idx = next.findIndex((c) => c.cellId === assignment.cellId);
          if (idx !== -1) {
            next[idx] = {
              ...next[idx],
              status: 'occupied',
              bottleId: batchData.bottleId,
              bottleName: batchData.bottleName,
              bottleColor: batchData.bottleColor,
              supplier: batchData.supplier,
              mfgDate: assignment.mfgDate,
              mfgDateDetails: assignment.mfgDateDetails || [{ mfgDate: assignment.mfgDate, palletCount: assignment.palletCount }],
              batchId: batchData.batchId,
              truckPlate: batchData.truckPlate,
              palletCount: assignment.palletCount,
              updatedAt: new Date().toISOString()
            };
          }
        });
        return next;
      });

      setLogs((prev) => [
        {
          id: `log_${Date.now()}`,
          actionType: 'unloaded_to_terminal',
          bottleName: batchData.bottleName,
          mfgDate: batchData.mfgDates.join(', '),
          cellsInvolved: cellAssignments.map((c) => c.cellId),
          quantityPallets: batchData.quantityPallets,
          operatorName: 'Оператор эстакады',
          timestamp: new Date().toISOString(),
          details: `Выгрузка машины ${batchData.truckPlate}`
        },
        ...prev
      ]);
    }
    return true;
  };

  // Handlers for Full FIFO Warehouse Intake
  const handleTransferCells = async (
    cellIds: string[],
    bottleName: string,
    mfgDate: string,
    pallets: number,
    bottleColor?: GlassColor,
    supplier?: string
  ): Promise<boolean> => {
    const success = await transferCellsToWarehouseFirestore(
      cellIds,
      bottleName,
      mfgDate,
      pallets,
      bottleColor,
      supplier
    );

    if (!isLive || !success) {
      setCells((prev) => {
        const next = [...prev];
        cellIds.forEach((id) => {
          const idx = next.findIndex((c) => c.cellId === id);
          if (idx !== -1) {
            next[idx] = {
              cellId: id,
              row: id.charAt(0),
              position: parseInt(id.slice(1), 10),
              location: next[idx].location || 'эстакада',
              status: 'empty',
              updatedAt: new Date().toISOString()
            };
          }
        });
        return next;
      });

      setLogs((prev) => [
        {
          id: `log_${Date.now()}`,
          actionType: 'transferred_to_warehouse',
          bottleName,
          bottleColor,
          supplier,
          mfgDate,
          cellsInvolved: cellIds,
          quantityPallets: pallets,
          operatorName: 'Водитель погрузчика',
          timestamp: new Date().toISOString(),
          details: `Завоз на склад (FIFO). Освобождены: ${cellIds.join(', ')}`
        },
        ...prev
      ]);
    }
    return true;
  };

  // Handlers for Partial FIFO Warehouse Intake
  const handleTransferPartialCells = async (
    pickups: PartialCellPickup[],
    bottleName: string,
    bottleColor?: GlassColor,
    supplier?: string
  ): Promise<boolean> => {
    const success = await transferPalletsPartialFirestore(pickups, bottleName, bottleColor, supplier);

    if (!isLive || !success) {
      setCells((prev) => {
        const next = [...prev];
        pickups.forEach((p) => {
          const idx = next.findIndex((c) => c.cellId === p.cellId);
          if (idx !== -1 && next[idx].status === 'occupied') {
            const currentCell = next[idx];
            let details = currentCell.mfgDateDetails
              ? [...currentCell.mfgDateDetails]
              : [
                  {
                    batchLabel: 'Партия #1',
                    mfgDate: currentCell.mfgDate || '2026-01-01',
                    palletCount: currentCell.palletCount || 26
                  }
                ];

            let remainingToDeduct = p.palletsToTake;
            const updatedDetails = [];

            for (const bDetail of details) {
              const matches = !p.batchLabel || bDetail.batchLabel === p.batchLabel;
              if (matches && remainingToDeduct > 0) {
                const deduct = Math.min(bDetail.palletCount, remainingToDeduct);
                remainingToDeduct -= deduct;
                const leftInBatch = bDetail.palletCount - deduct;
                if (leftInBatch > 0) {
                  updatedDetails.push({ ...bDetail, palletCount: leftInBatch });
                }
              } else {
                updatedDetails.push(bDetail);
              }
            }

            const totalLeft = updatedDetails.reduce((sum, d) => sum + d.palletCount, 0);

            if (totalLeft <= 0) {
              next[idx] = {
                cellId: p.cellId,
                row: p.cellId.charAt(0),
                position: parseInt(p.cellId.slice(1), 10) || 1,
                location: currentCell.location || 'эстакада',
                status: 'empty',
                updatedAt: new Date().toISOString()
              };
            } else {
              next[idx] = {
                ...currentCell,
                palletCount: totalLeft,
                mfgDateDetails: updatedDetails,
                updatedAt: new Date().toISOString()
              };
            }
          }
        });
        return next;
      });
    }
    return true;
  };

  // Add Bottle to Catalog (Admin Only)
  const handleAddBottle = async (bottle: CatalogBottle): Promise<boolean> => {
    if (!handleRequireAdmin('Добавить бутылку в каталог')) return false;
    const success = await addCatalogBottleFirestore(bottle);
    if (!isLive || !success) {
      setCatalog((prev) => [...prev, bottle]);
    }
    return true;
  };

  // Update Bottle in Catalog (Admin Only)
  const handleUpdateBottle = async (bottleId: string, updates: Partial<CatalogBottle>): Promise<boolean> => {
    if (!handleRequireAdmin('Обновить данные бутылки')) return false;
    const success = await updateCatalogBottleFirestore(bottleId, updates);
    if (!isLive || !success) {
      setCatalog((prev) => prev.map((b) => (b.id === bottleId ? { ...b, ...updates } : b)));
    }
    return true;
  };

  // Delete Bottle from Catalog (Admin Only)
  const handleDeleteBottle = async (bottleId: string): Promise<boolean> => {
    if (!handleRequireAdmin('Удалить бутылку из каталога')) return false;
    const success = await deleteCatalogBottleFirestore(bottleId);
    if (!isLive || !success) {
      setCatalog((prev) => prev.filter((b) => b.id !== bottleId));
    }
    return true;
  };

  // Add Dynamic Row to Terminal (Admin Only)
  const handleAddRow = async (
    rowLetter: string,
    location: TerminalLocation = 'эстакада',
    capacity: number = DEFAULT_PALLET_CAPACITY
  ): Promise<boolean> => {
    if (!handleRequireAdmin(`Добавить Ряд ${rowLetter}`)) return false;
    const cleanRow = rowLetter.trim().toUpperCase();
    const finalCapacity = Math.max(1, capacity || DEFAULT_PALLET_CAPACITY);
    const success = await addTerminalRowFirestore(cleanRow, location, finalCapacity);
    if (!isLive || !success) {
      setCells((prev) => {
        const newCells: TerminalCell[] = [];
        for (let pos = 1; pos <= 7; pos++) {
          newCells.push({
            cellId: `${cleanRow}${pos}`,
            row: cleanRow,
            position: pos,
            location: location,
            palletCapacity: finalCapacity,
            status: 'empty',
            updatedAt: new Date().toISOString()
          });
        }
        return [...prev, ...newCells].sort((a, b) => a.cellId.localeCompare(b.cellId));
      });
      setLogs((prev) => [
        {
          id: `log_${Date.now()}`,
          actionType: 'unloaded_to_terminal',
          bottleName: `Добавлен Ряд ${cleanRow}`,
          mfgDate: new Date().toISOString().split('T')[0],
          cellsInvolved: Array.from({ length: 7 }, (_, i) => `${cleanRow}${i + 1}`),
          operatorName: 'Администратор',
          timestamp: new Date().toISOString(),
          details: `В структуру терминала добавлен новый Ряд ${cleanRow} (7 ячеек, вместимость: ${finalCapacity} палл.)`
        },
        ...prev
      ]);
    }
    return true;
  };

  // Delete Row from Terminal (Admin Only)
  const handleDeleteRow = async (rowLetter: string): Promise<boolean> => {
    if (!handleRequireAdmin(`Удалить Ряд ${rowLetter}`)) return false;
    const cleanRow = rowLetter.trim().toUpperCase();
    const rowCellIds = cells.filter((c) => c.row === cleanRow).map((c) => c.cellId);
    const success = await deleteTerminalRowFirestore(cleanRow, rowCellIds);
    if (!isLive || !success) {
      setCells((prev) => prev.filter((c) => c.row !== cleanRow));
      setLogs((prev) => [
        {
          id: `log_${Date.now()}`,
          actionType: 'transferred_to_warehouse',
          bottleName: `Удален Ряд ${cleanRow}`,
          mfgDate: new Date().toISOString().split('T')[0],
          cellsInvolved: rowCellIds,
          operatorName: 'Администратор',
          timestamp: new Date().toISOString(),
          details: `Из структуры терминала удален Ряд ${cleanRow} (${rowCellIds.length} ячеек)`
        },
        ...prev
      ]);
    }
    return true;
  };

  // Add Individual Cell to Terminal (Admin Only)
  const handleAddCell = async (
    cellId: string,
    rowLetter: string,
    location: TerminalLocation = 'эстакада',
    position?: number,
    capacity: number = DEFAULT_PALLET_CAPACITY
  ): Promise<boolean> => {
    if (!handleRequireAdmin(`Добавить ячейку ${cellId}`)) return false;
    const cleanId = cellId.trim().toUpperCase();
    const cleanRow = rowLetter.trim().toUpperCase();
    const pos = position || parseInt(cleanId.replace(/^[A-ZА-Я]+/i, ''), 10) || 1;
    const finalCapacity = Math.max(1, capacity || DEFAULT_PALLET_CAPACITY);

    const success = await addTerminalCellFirestore(cleanId, cleanRow, location, pos, finalCapacity);
    if (!isLive || !success) {
      setCells((prev) => {
        if (prev.some((c) => c.cellId === cleanId)) return prev;
        const newCell: TerminalCell = {
          cellId: cleanId,
          row: cleanRow,
          position: pos,
          location: location,
          palletCapacity: finalCapacity,
          status: 'empty',
          updatedAt: new Date().toISOString()
        };
        return [...prev, newCell].sort((a, b) => a.cellId.localeCompare(b.cellId));
      });
      setLogs((prev) => [
        {
          id: `log_${Date.now()}`,
          actionType: 'unloaded_to_terminal',
          bottleName: `Создана ячейка ${cleanId}`,
          mfgDate: new Date().toISOString().split('T')[0],
          cellsInvolved: [cleanId],
          operatorName: 'Администратор',
          timestamp: new Date().toISOString(),
          details: `Добавлена новая свободная ячейка ${cleanId} в Ряд ${cleanRow} (вместимость: ${finalCapacity} палл.)`
        },
        ...prev
      ]);
    }
    return true;
  };

  // Delete Individual Cell (Admin Only)
  const handleDeleteCell = async (cellId: string): Promise<boolean> => {
    if (!handleRequireAdmin(`Удалить ячейку ${cellId}`)) return false;
    const cleanId = cellId.trim().toUpperCase();
    const success = await deleteTerminalCellFirestore(cleanId);
    if (!isLive || !success) {
      setCells((prev) => prev.filter((c) => c.cellId !== cleanId));
      setLogs((prev) => [
        {
          id: `log_${Date.now()}`,
          actionType: 'transferred_to_warehouse',
          bottleName: `Удалена ячейка ${cleanId}`,
          mfgDate: new Date().toISOString().split('T')[0],
          cellsInvolved: [cleanId],
          operatorName: 'Администратор',
          timestamp: new Date().toISOString(),
          details: `Удалена пустая ячейка ${cleanId}`
        },
        ...prev
      ]);
    }
    return true;
  };

  // Update Individual Cell Capacity (Admin Only)
  const handleUpdateCellCapacity = async (cellId: string, newCapacity: number): Promise<boolean> => {
    if (!handleRequireAdmin(`Изменить вместимость ячейки ${cellId}`)) return false;
    const cleanId = cellId.trim().toUpperCase();
    const finalCapacity = Math.max(1, Math.round(newCapacity));
    const success = await updateCellCapacityFirestore(cleanId, finalCapacity, adminEmail || 'Администратор');
    if (!isLive || !success) {
      setCells((prev) =>
        prev.map((c) => (c.cellId === cleanId ? { ...c, palletCapacity: finalCapacity, updatedAt: new Date().toISOString() } : c))
      );
    }
    return true;
  };

  // Update Row Capacity (Admin Only)
  const handleUpdateRowCapacity = async (rowLetter: string, newCapacity: number): Promise<boolean> => {
    if (!handleRequireAdmin(`Изменить вместимость Ряда ${rowLetter}`)) return false;
    const cleanRow = rowLetter.trim().toUpperCase();
    const rowCellIds = cells.filter((c) => c.row === cleanRow).map((c) => c.cellId);
    const finalCapacity = Math.max(1, Math.round(newCapacity));
    const success = await updateRowCapacityFirestore(cleanRow, rowCellIds, finalCapacity, adminEmail || 'Администратор');
    if (!isLive || !success) {
      setCells((prev) =>
        prev.map((c) => (c.row === cleanRow ? { ...c, palletCapacity: finalCapacity, updatedAt: new Date().toISOString() } : c))
      );
    }
    return true;
  };

  // Block Cell Product (Open to operators/inspectors)
  const handleBlockCell = async (cellId: string, reason: string): Promise<boolean> => {
    const success = await blockCellFirestore(cellId, reason, adminEmail || 'Оператор');
    if (!isLive || !success) {
      setCells((prev) =>
        prev.map((c) =>
          c.cellId === cellId
            ? {
                ...c,
                isBlocked: true,
                blockReason: reason,
                blockedAt: new Date().toISOString(),
                blockedBy: adminEmail || 'Оператор'
              }
            : c
        )
      );
    }
    return true;
  };

  // Unblock Cell Product (Admin Only!)
  const handleUnblockCell = async (cellId: string): Promise<boolean> => {
    if (!handleRequireAdmin(`Разблокировать ячейку ${cellId}`)) return false;
    const success = await unblockCellFirestore(cellId, adminEmail || 'Администратор');
    if (!isLive || !success) {
      setCells((prev) =>
        prev.map((c) =>
          c.cellId === cellId
            ? {
                ...c,
                isBlocked: false,
                blockReason: '',
                blockedAt: '',
                blockedBy: ''
              }
            : c
        )
      );
    }
    return true;
  };

  // Reset Database (Admin Only)
  const handleResetDatabase = async (): Promise<boolean> => {
    if (!handleRequireAdmin('Сбросить базу данных')) return false;
    const success = await resetDatabaseFirestore();
    if (!isLive || !success) {
      setCells(generateInitialCells());
      setCatalog(INITIAL_BOTTLES);
      setLogs(INITIAL_LOGS);
    }
    return true;
  };

  // Count occupied cells
  const occupiedCount = cells.filter((c) => c.status === 'occupied').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Navbar
        cells={cells}
        isLive={isLive}
        onRefresh={() => {
          testFirestoreConnection().then((ok) => setIsLive(ok));
        }}
        activeTab={activeTab}
        isAdmin={isAdmin}
        adminEmail={adminEmail}
        onOpenAdminAuth={() => {
          setAdminModalActionTitle('Доступ администратора');
          setIsAdminModalOpen(true);
        }}
        onLogoutAdmin={handleLogoutAdmin}
        onOpenReports={handleOpenReports}
      />

      {/* Main Container */}
      <main className="flex-1 p-3 sm:p-5 max-w-7xl w-full mx-auto">
        {activeTab === 'map' && (
          <TerminalMap
            catalog={catalog}
            cells={cells}
            onTransferCells={handleTransferCells}
            onTransferPartialCells={handleTransferPartialCells}
            onBlockCell={handleBlockCell}
            onUnblockCell={handleUnblockCell}
            onAddCell={handleAddCell}
            onDeleteCell={handleDeleteCell}
            isAdmin={isAdmin}
            onRequestAdminAuth={(title) => {
              setAdminModalActionTitle(title || 'Управление ячейками');
              setIsAdminModalOpen(true);
            }}
            onNavigateToUnloadRow={(row, cellId) => {
              setPresetRow(row);
              setPresetCellId(cellId);
              setActiveTab('unload');
            }}
            onOpenReports={handleOpenReports}
          />
        )}

        {activeTab === 'unload' && (
          <TruckUnloading
            catalog={catalog}
            cells={cells}
            onUnloadTruck={handleUnloadTruck}
            onAddBottleToCatalog={handleAddBottle}
            presetRow={presetRow}
            presetCellId={presetCellId}
          />
        )}

        {activeTab === 'fifo' && (
          <FifoWarehouseIntake
            catalog={catalog}
            cells={cells}
            onTransferCells={handleTransferCells}
            onTransferPartialCells={handleTransferPartialCells}
            onUnblockCell={handleUnblockCell}
            isAdmin={isAdmin}
            onRequestAdminAuth={(title) => {
              setAdminModalActionTitle(title || 'Разблокировка ячейки');
              setIsAdminModalOpen(true);
            }}
            onOpenReports={handleOpenReports}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanel
            catalog={catalog}
            cells={cells}
            logs={logs}
            isLive={isLive}
            onAddBottle={handleAddBottle}
            onUpdateBottle={handleUpdateBottle}
            onDeleteBottle={handleDeleteBottle}
            onAddRow={handleAddRow}
            onDeleteRow={handleDeleteRow}
            onAddCell={handleAddCell}
            onDeleteCell={handleDeleteCell}
            onUpdateCellCapacity={handleUpdateCellCapacity}
            onUpdateRowCapacity={handleUpdateRowCapacity}
            onBlockCell={handleBlockCell}
            onUnblockCell={handleUnblockCell}
            onResetDatabase={handleResetDatabase}
            isAdmin={isAdmin}
            adminEmail={adminEmail}
            onAdminLoginSuccess={handleAdminLoginSuccess}
            onLogoutAdmin={handleLogoutAdmin}
            onOpenReports={handleOpenReports}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingFifoCount={occupiedCount}
      />

      {/* Admin Authorization Modal */}
      <AdminAuthModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onSuccess={handleAdminLoginSuccess}
        actionTitle={adminModalActionTitle}
      />

      {/* Warehouse Reports & Export Modal (Excel / PDF) — Admin Only */}
      <ReportsModal
        isOpen={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
        cells={cells}
        catalog={catalog}
        logs={logs}
        isAdmin={isAdmin}
        onRequestAdminAuth={() => {
          setAdminModalActionTitle('Доступ к отчетам (только для администратора)');
          setIsAdminModalOpen(true);
        }}
      />
    </div>
  );
}
