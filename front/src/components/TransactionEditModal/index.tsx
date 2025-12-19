"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  TransactionEditModalProps,
  TransactionSlave,
  ValidationError,
} from "./types";
import {
  getAccountId,
  deepCloneSlaves,
  validateSlaves,
  findAccountById,
} from "./utils";
import { detectSmoothingGroups } from "./smoothingDetection";
import SlaveTransactionRow from "./SlaveTransactionRow";
import SmoothingModal from "./SmoothingModal";

export default function TransactionEditModal({
  isOpen,
  transaction,
  accounts,
  onClose,
  onSave,
}: TransactionEditModalProps) {
  const [editForm, setEditForm] = useState({
    description: "",
    accountId: "",
    category: "",
    subCategory: "",
  });
  const [editSlaves, setEditSlaves] = useState<TransactionSlave[]>([]);
  const [slaveCategoryFilters, setSlaveCategoryFilters] = useState<
    Record<string, string>
  >({});
  const [slaveAccountTypes, setSlaveAccountTypes] = useState<
    Record<string, "virtual" | "real">
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originalEditForm, setOriginalEditForm] = useState({
    description: "",
  });
  const [originalEditSlaves, setOriginalEditSlaves] = useState<
    TransactionSlave[]
  >([]);
  const [smoothingSlaveIndex, setSmoothingSlaveIndex] = useState<number | null>(
    null
  );

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Derived accounts
  const realAccounts = useMemo(
    () => accounts.filter((acc) => acc.is_real),
    [accounts]
  );
  const virtualAccounts = useMemo(
    () => accounts.filter((acc) => !acc.is_real),
    [accounts]
  );

  // Initialize form when transaction changes
  useEffect(() => {
    if (transaction && isOpen) {
      const masterAccount = findAccountById(
        realAccounts,
        transaction.accountId
      );

      setEditForm({
        description: transaction.description,
        accountId: transaction.accountId,
        category: masterAccount?.category || transaction.category || "",
        subCategory:
          masterAccount?.sub_category || transaction.subCategory || "",
      });

      // Get slaves from transaction
      const slaves = transaction.TransactionsSlaves
        ? deepCloneSlaves(transaction.TransactionsSlaves)
        : [];
      setEditSlaves(slaves);

      // Initialize category filters and account types using slaveId
      const initialFilters: Record<string, string> = {};
      const initialTypes: Record<string, "virtual" | "real"> = {};
      slaves.forEach((slave) => {
        const slaveAccount = findAccountById(accounts, slave.accountId);
        if (slaveAccount) {
          initialTypes[slave.slaveId] = slaveAccount.is_real
            ? "real"
            : "virtual";
          if (!slaveAccount.is_real) {
            initialFilters[slave.slaveId] = slaveAccount.category;
          }
        } else {
          initialTypes[slave.slaveId] = slave.slaveAccountIsReal
            ? "real"
            : "virtual";
        }
      });
      setSlaveCategoryFilters(initialFilters);
      setSlaveAccountTypes(initialTypes);

      // Store original values for dirty checking
      setOriginalEditForm({
        description: transaction.description,
      });
      setOriginalEditSlaves(deepCloneSlaves(slaves));
      setError(null);

      // Focus on close button when modal opens
      setTimeout(() => closeButtonRef.current?.focus(), 100);
    }
  }, [transaction, isOpen, realAccounts, accounts]);

  // Handle modal close and reset
  const handleClose = () => {
    setEditForm({
      description: "",
      accountId: "",
      category: "",
      subCategory: "",
    });
    setEditSlaves([]);
    setSlaveCategoryFilters({});
    setSlaveAccountTypes({});
    setOriginalEditForm({ description: "" });
    setOriginalEditSlaves([]);
    setError(null);
    onClose();
  };

  // Handle slave update
  const handleSlaveUpdate = (
    slaveId: string,
    updates: Partial<TransactionSlave>
  ) => {
    setEditSlaves((prevSlaves) =>
      prevSlaves.map((slave) =>
        slave.slaveId === slaveId ? { ...slave, ...updates } : slave
      )
    );
  };

  // Handle slave removal
  const handleSlaveRemove = (slaveId: string) => {
    setEditSlaves((prevSlaves) =>
      prevSlaves.filter((slave) => slave.slaveId !== slaveId)
    );
    // Clean up filters
    setSlaveCategoryFilters((prev) => {
      const { [slaveId]: _removed1, ...rest } = prev;
      void _removed1;
      return rest;
    });
    setSlaveAccountTypes((prev) => {
      const { [slaveId]: _removed2, ...rest } = prev;
      void _removed2;
      return rest;
    });
  };

  // Handle category filter change
  const handleCategoryFilterChange = (slaveId: string, category: string) => {
    setSlaveCategoryFilters((prev) => ({ ...prev, [slaveId]: category }));
  };

  // Handle account type change
  const handleAccountTypeChange = (
    slaveId: string,
    type: "virtual" | "real"
  ) => {
    setSlaveAccountTypes((prev) => ({ ...prev, [slaveId]: type }));
  };

  // Handle smooth button click - opens smoothing modal
  const handleSmooth = (index: number) => {
    setSmoothingSlaveIndex(index);
  };

  // Handle smoothing modal close
  const handleSmoothingClose = () => {
    setSmoothingSlaveIndex(null);
  };

  // Handle smoothing confirmation - replace original slave with smoothed slaves
  const handleSmoothingConfirm = (smoothedSlaves: TransactionSlave[]) => {
    if (smoothingSlaveIndex === null) return;

    const originalSlave = editSlaves[smoothingSlaveIndex];

    setEditSlaves((prevSlaves) => {
      const newSlaves = [...prevSlaves];
      // Remove the original slave at the index and insert smoothed slaves
      newSlaves.splice(smoothingSlaveIndex, 1, ...smoothedSlaves);
      return newSlaves;
    });

    // Initialize account types and category filters for new slaves
    smoothedSlaves.forEach((slave) => {
      setSlaveAccountTypes((prev) => ({
        ...prev,
        [slave.slaveId]: slave.slaveAccountIsReal ? "real" : "virtual",
      }));
      // Category filter will use the original slave's category if virtual
      if (!slave.slaveAccountIsReal && originalSlave) {
        const originalCategory = slaveCategoryFilters[originalSlave.slaveId];
        if (originalCategory) {
          setSlaveCategoryFilters((prev) => ({
            ...prev,
            [slave.slaveId]: originalCategory,
          }));
        }
      }
    });

    setSmoothingSlaveIndex(null);
  };

  // Check if form has been modified
  const isEditFormDirty = useMemo(() => {
    if (editForm.description !== originalEditForm.description) return true;
    if (editSlaves.length !== originalEditSlaves.length) return true;

    return editSlaves.some((slave) => {
      const original = originalEditSlaves.find(
        (o) => o.slaveId === slave.slaveId
      );
      if (!original) return true;
      return (
        slave.accountId !== original.accountId ||
        slave.amount !== original.amount ||
        slave.type !== original.type
      );
    });
  }, [editForm, originalEditForm, editSlaves, originalEditSlaves]);

  // Validation error
  const validationError: ValidationError | null = useMemo(() => {
    if (!transaction) return null;
    return validateSlaves(editSlaves, originalEditSlaves);
  }, [editSlaves, originalEditSlaves]);

  // Detect smoothing groups among slaves
  const smoothingInfoMap = useMemo(
    () => detectSmoothingGroups(editSlaves),
    [editSlaves]
  );

  // Check if save is possible
  const canSave = useMemo(() => {
    if (!transaction) return false;
    if (!isEditFormDirty) return false;
    return validationError === null;
  }, [transaction, isEditFormDirty, validationError]);

  // Add new slave
  const handleAddSlave = () => {
    const defaultAccount = virtualAccounts[0];
    const newSlaveId = `temp-${Date.now()}`;

    const newSlave: TransactionSlave = {
      slaveId: newSlaveId,
      type: "debit",
      amount: 0,
      date: new Date().toISOString(),
      accountId: defaultAccount ? getAccountId(defaultAccount) : "",
      masterId: transaction?.transactionId || "",
      slaveAccountName: defaultAccount?.name || "",
      slaveAccountIsReal: false,
    };

    setEditSlaves((prev) => [...prev, newSlave]);
    setSlaveAccountTypes((prev) => ({ ...prev, [newSlaveId]: "virtual" }));
    if (defaultAccount) {
      setSlaveCategoryFilters((prev) => ({
        ...prev,
        [newSlaveId]: defaultAccount.category,
      }));
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!transaction || !canSave) return;

    setIsSaving(true);
    setError(null);
    try {
      await onSave(
        transaction.transactionId,
        editForm.description,
        transaction.date,
        editSlaves
      );
      handleClose();
    } catch (err) {
      console.error("Error saving transaction:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue lors de la sauvegarde"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !transaction) return null;

  const accountName =
    transaction.accountName ||
    transaction.masterAccountName ||
    "Compte non trouvé";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 id="modal-title" className="text-xl font-semibold text-gray-800">
            Modifier la transaction
          </h3>
          <button
            ref={closeButtonRef}
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Fermer le modal"
            disabled={isSaving}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-red-600"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column - Master transaction */}
            <div className="space-y-4">
              <div className="border-b border-gray-200 pb-3">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">
                  Transaction maître
                </h4>
                <p className="text-sm text-gray-600">
                  Informations générales de la transaction principale
                </p>
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      description: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium resize-none"
                  placeholder="Description de la transaction"
                  rows={Math.max(
                    2,
                    (editForm.description.match(/\n/g) || []).length +
                      1 +
                      Math.ceil(editForm.description.length / 60)
                  )}
                  disabled={isSaving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Compte principal
                </label>
                <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                  {accountName}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Catégorie
                </label>
                <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                  {editForm.category || "Non définie"}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sous-catégorie
                </label>
                <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                  {editForm.subCategory || "Non définie"}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <h5 className="font-medium text-blue-800 mb-2">
                  Informations de la transaction maître
                </h5>
                <div className="space-y-1">
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">ID:</span>{" "}
                    <code className="bg-blue-100 px-1 rounded text-xs">
                      {transaction.transactionId}
                    </code>
                  </p>
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Date:</span>{" "}
                    {new Date(transaction.date).toLocaleDateString("fr-FR")}
                  </p>
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Montant total:</span>{" "}
                    {originalEditSlaves
                      .reduce((sum, slave) => sum + slave.amount, 0)
                      .toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                  </p>
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Type:</span>{" "}
                    {transaction.type === "credit" ? "↓ Crédit" : "↑ Débit"}
                  </p>
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">
                      Nombre de transactions slaves:
                    </span>{" "}
                    {editSlaves.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Right column - Slave transactions */}
            <div className="space-y-4">
              <div className="border-b border-gray-200 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">
                      Transactions slaves
                    </h4>
                    <p className="text-sm text-gray-600">
                      Détail des transactions associées
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Find first credit slave that is not part of a smoothing group
                        const firstCreditIndex = editSlaves.findIndex(
                          (slave) =>
                            slave.type.toLowerCase() === "credit" &&
                            !smoothingInfoMap.has(slave.slaveId)
                        );
                        if (firstCreditIndex !== -1) {
                          handleSmooth(firstCreditIndex);
                        }
                      }}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      disabled={
                        isSaving ||
                        !editSlaves.some(
                          (slave) =>
                            slave.type.toLowerCase() === "credit" &&
                            !smoothingInfoMap.has(slave.slaveId)
                        )
                      }
                      aria-label="Lisser une transaction slave"
                    >
                      Lisser
                    </button>
                    <button
                      onClick={handleAddSlave}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                      disabled={isSaving}
                      aria-label="Ajouter une nouvelle transaction slave"
                    >
                      + Ajouter
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {editSlaves.map((slave, index) => (
                  <SlaveTransactionRow
                    key={slave.slaveId}
                    slave={slave}
                    slaveId={slave.slaveId}
                    index={index}
                    realAccounts={realAccounts}
                    virtualAccounts={virtualAccounts}
                    categoryFilter={slaveCategoryFilters[slave.slaveId] || ""}
                    accountType={slaveAccountTypes[slave.slaveId] || "virtual"}
                    onUpdate={handleSlaveUpdate}
                    onRemove={handleSlaveRemove}
                    onCategoryFilterChange={handleCategoryFilterChange}
                    onAccountTypeChange={handleAccountTypeChange}
                    smoothingInfo={smoothingInfoMap.get(slave.slaveId)}
                  />
                ))}

                {editSlaves.length === 0 && (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12 mx-auto text-gray-400 mb-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <p className="text-sm font-medium text-gray-600">
                      Aucune transaction slave
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Cliquez sur &quot;Ajouter&quot; pour créer une nouvelle
                      transaction slave
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer with validation feedback */}
        <div className="p-6 border-t border-gray-200">
          {/* Validation message */}
          {validationError && isEditFormDirty && (
            <div
              className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg"
              role="alert"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-amber-600 flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-amber-700">
                  {validationError.message}
                </p>
              </div>
            </div>
          )}

          {/* Not dirty message */}
          {!isEditFormDirty && (
            <p className="mb-4 text-sm text-gray-500 text-center">
              Aucune modification détectée
            </p>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
              disabled={isSaving}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !canSave}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                isSaving || !canSave
                  ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isSaving && (
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        </div>
      </div>

      {/* Smoothing Modal */}
      {smoothingSlaveIndex !== null && editSlaves[smoothingSlaveIndex] && (
        <SmoothingModal
          isOpen={smoothingSlaveIndex !== null}
          slave={editSlaves[smoothingSlaveIndex]}
          onClose={handleSmoothingClose}
          onConfirm={handleSmoothingConfirm}
        />
      )}
    </div>
  );
}
