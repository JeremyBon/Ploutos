"use client";

import { useState, useEffect, useMemo } from "react";

interface Account {
  account_id?: string;
  accountId?: string;
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
}

interface TransactionSlave {
  slaveId: string;
  type: string;
  amount: number;
  date: string;
  accountId: string;
  masterId: string;
  slaveAccountName: string;
  slaveAccountIsReal: boolean;
}

interface Transaction {
  transactionId: string;
  description: string;
  date: string;
  amount: number;
  type: string;
  accountId: string;
  accountName?: string;
  masterAccountName?: string;
  category?: string;
  subCategory?: string;
  TransactionsSlaves?: TransactionSlave[];
}

interface TransactionEditModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  realAccounts: Account[];
  allAccounts: Account[];
  onClose: () => void;
  onSave: (
    transactionId: string,
    description: string,
    date: string,
    slaves: TransactionSlave[]
  ) => Promise<void>;
}

export default function TransactionEditModal({
  isOpen,
  transaction,
  realAccounts,
  allAccounts,
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
    Record<number, string>
  >({});
  const [slaveAccountTypes, setSlaveAccountTypes] = useState<
    Record<number, "virtual" | "real">
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [originalEditForm, setOriginalEditForm] = useState({
    description: "",
  });
  const [originalEditSlaves, setOriginalEditSlaves] = useState<
    TransactionSlave[]
  >([]);

  // Normalize account ID getter
  const getAccountId = (account: Account) =>
    account.account_id || account.accountId || "";

  // Initialize form when transaction changes
  useEffect(() => {
    if (transaction && isOpen) {
      const masterAccount = realAccounts.find(
        (acc) => getAccountId(acc) === transaction.accountId
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
        ? [...transaction.TransactionsSlaves]
        : [];
      setEditSlaves(slaves);

      // Initialize category filters and account types
      const initialFilters: Record<number, string> = {};
      const initialTypes: Record<number, "virtual" | "real"> = {};
      slaves.forEach((slave, index) => {
        const slaveAccount = allAccounts.find(
          (acc) => getAccountId(acc) === slave.accountId
        );
        if (slaveAccount) {
          initialTypes[index] = slaveAccount.is_real ? "real" : "virtual";
          if (!slaveAccount.is_real) {
            initialFilters[index] = slaveAccount.category;
          }
        } else {
          initialTypes[index] = slave.slaveAccountIsReal ? "real" : "virtual";
        }
      });
      setSlaveCategoryFilters(initialFilters);
      setSlaveAccountTypes(initialTypes);

      // Store original values for dirty checking
      setOriginalEditForm({
        description: transaction.description,
      });
      setOriginalEditSlaves(JSON.parse(JSON.stringify(slaves)));
    }
  }, [transaction, isOpen, realAccounts, allAccounts]);

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
    onClose();
  };

  // Handle slave change
  const handleSlaveChange = (
    index: number,
    field: keyof TransactionSlave,
    value: string | number
  ) => {
    const newSlaves = [...editSlaves];
    newSlaves[index] = { ...newSlaves[index], [field]: value };
    setEditSlaves(newSlaves);
  };

  // Handle slave removal
  const handleRemoveSlave = (index: number) => {
    const newSlaves = editSlaves.filter((_, i) => i !== index);
    setEditSlaves(newSlaves);

    // Update category filters and account types indexes
    const newFilters: Record<number, string> = {};
    const newTypes: Record<number, "virtual" | "real"> = {};
    Object.keys(slaveCategoryFilters).forEach((key) => {
      const keyNum = parseInt(key);
      if (keyNum < index) {
        newFilters[keyNum] = slaveCategoryFilters[keyNum];
      } else if (keyNum > index) {
        newFilters[keyNum - 1] = slaveCategoryFilters[keyNum];
      }
    });
    Object.keys(slaveAccountTypes).forEach((key) => {
      const keyNum = parseInt(key);
      if (keyNum < index) {
        newTypes[keyNum] = slaveAccountTypes[keyNum];
      } else if (keyNum > index) {
        newTypes[keyNum - 1] = slaveAccountTypes[keyNum];
      }
    });
    setSlaveCategoryFilters(newFilters);
    setSlaveAccountTypes(newTypes);
  };

  // Calculate slaves balance (debits - credits)
  const getSlavesBalance = () => {
    return editSlaves.reduce((balance, slave) => {
      const amount = slave.amount || 0;
      if (slave.type.toLowerCase() === "debit") {
        return balance + amount;
      } else {
        return balance - amount;
      }
    }, 0);
  };

  // Check if form has been modified
  const isEditFormDirty = useMemo(() => {
    if (editForm.description !== originalEditForm.description) return true;
    if (editSlaves.length !== originalEditSlaves.length) return true;

    return editSlaves.some((slave, index) => {
      const original = originalEditSlaves[index];
      if (!original) return true;
      return (
        slave.accountId !== original.accountId ||
        slave.amount !== original.amount ||
        slave.type !== original.type
      );
    });
  }, [editForm, originalEditForm, editSlaves, originalEditSlaves]);

  // Check if save is possible
  const canSave = () => {
    if (!transaction) return false;
    if (!isEditFormDirty) return false;

    // Check that no slave has amount <= 0 or missing accountId
    const hasInvalidSlaves = editSlaves.some(
      (slave) => Number(slave.amount) <= 0 || !slave.accountId
    );
    if (hasInvalidSlaves) return false;

    // Calculate master balance (credit - debit)
    const masterAmount = transaction.amount || 0;
    const masterBalance =
      transaction.type.toLowerCase() === "credit"
        ? masterAmount
        : -masterAmount;

    // Slaves balance (debits - credits) must equal master balance
    const slavesBalance = getSlavesBalance();
    return Math.abs(masterBalance - slavesBalance) < 0.01;
  };

  // Add new slave
  const handleAddSlave = () => {
    const virtualAccounts = allAccounts.filter((acc) => !acc.is_real);
    const defaultAccount = virtualAccounts[0];

    const newSlave: TransactionSlave = {
      slaveId: `temp-${Date.now()}`,
      type: "debit",
      amount: 0,
      date: new Date().toISOString(),
      accountId: defaultAccount ? getAccountId(defaultAccount) : "",
      masterId: transaction?.transactionId || "",
      slaveAccountName: defaultAccount?.name || "",
      slaveAccountIsReal: false,
    };

    const newIndex = editSlaves.length;
    setEditSlaves([...editSlaves, newSlave]);
    setSlaveAccountTypes({
      ...slaveAccountTypes,
      [newIndex]: "virtual",
    });
    if (defaultAccount) {
      setSlaveCategoryFilters({
        ...slaveCategoryFilters,
        [newIndex]: defaultAccount.category,
      });
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!transaction) return;

    setIsSaving(true);
    try {
      await onSave(
        transaction.transactionId,
        editForm.description,
        transaction.date,
        editSlaves
      );
      handleClose();
    } catch (error) {
      console.error("Error saving transaction:", error);
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">
            Modifier la transaction
          </h3>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
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
                    {editSlaves
                      .reduce((sum, slave) => sum + slave.amount, 0)
                      .toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                  </p>
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Type:</span>{" "}
                    {transaction.type}
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
                  <button
                    onClick={handleAddSlave}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                  >
                    + Ajouter
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {editSlaves.map((slave, index) => {
                  const isCredit = slave.type.toLowerCase() === "credit";
                  return (
                    <div
                      key={slave.slaveId}
                      className={`border rounded-lg p-4 ${isCredit ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 text-white text-xs rounded-full flex items-center justify-center font-medium ${isCredit ? "bg-red-600" : "bg-green-600"}`}
                          >
                            {index + 1}
                          </div>
                          <h5
                            className={`font-medium ${isCredit ? "text-red-800" : "text-green-800"}`}
                          >
                            Transaction slave {index + 1}
                          </h5>
                        </div>
                        <button
                          onClick={() => handleRemoveSlave(index)}
                          className="text-red-600 hover:text-red-800 transition-colors p-1 rounded"
                          title="Supprimer cette transaction"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Type de compte
                          </label>
                          <select
                            value={slaveAccountTypes[index] || "virtual"}
                            onChange={(e) => {
                              const newType = e.target.value as
                                | "virtual"
                                | "real";
                              setSlaveAccountTypes({
                                ...slaveAccountTypes,
                                [index]: newType,
                              });
                              // Automatically select first account of new type
                              if (newType === "real") {
                                const firstRealAccount = realAccounts[0];
                                if (firstRealAccount) {
                                  setEditSlaves((prevSlaves) => {
                                    const newSlaves = [...prevSlaves];
                                    newSlaves[index] = {
                                      ...newSlaves[index],
                                      accountId: getAccountId(firstRealAccount),
                                      slaveAccountName: firstRealAccount.name,
                                      slaveAccountIsReal: true,
                                    };
                                    return newSlaves;
                                  });
                                }
                              } else {
                                const firstVirtualAccount = allAccounts.find(
                                  (acc) => !acc.is_real
                                );
                                if (firstVirtualAccount) {
                                  setEditSlaves((prevSlaves) => {
                                    const newSlaves = [...prevSlaves];
                                    newSlaves[index] = {
                                      ...newSlaves[index],
                                      accountId:
                                        getAccountId(firstVirtualAccount),
                                      slaveAccountName:
                                        firstVirtualAccount.name,
                                      slaveAccountIsReal: false,
                                    };
                                    return newSlaves;
                                  });
                                  setSlaveCategoryFilters({
                                    ...slaveCategoryFilters,
                                    [index]: firstVirtualAccount.category,
                                  });
                                }
                              }
                            }}
                            className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                          >
                            <option value="virtual">Virtuel (catégorie)</option>
                            <option value="real">Réel (banque)</option>
                          </select>
                        </div>

                        {slaveAccountTypes[index] === "real" ? (
                          // Real account - select from real accounts
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Compte réel
                            </label>
                            <select
                              value={slave.accountId}
                              onChange={(e) => {
                                const selectedAccount = realAccounts.find(
                                  (acc) => getAccountId(acc) === e.target.value
                                );
                                setEditSlaves((prevSlaves) => {
                                  const newSlaves = [...prevSlaves];
                                  newSlaves[index] = {
                                    ...newSlaves[index],
                                    accountId: e.target.value,
                                    slaveAccountName:
                                      selectedAccount?.name ||
                                      newSlaves[index].slaveAccountName,
                                    slaveAccountIsReal: true,
                                  };
                                  return newSlaves;
                                });
                              }}
                              className="w-full px-2 py-1.5 text-sm border-2 border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50 text-gray-800 font-medium"
                            >
                              <option value="" disabled>
                                Sélectionner un compte réel
                              </option>
                              {realAccounts.map((account) => (
                                <option
                                  key={getAccountId(account)}
                                  value={getAccountId(account)}
                                >
                                  {account.name} ({account.category})
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          // Virtual account - category filter
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Catégorie (filtre)
                            </label>
                            <select
                              value={slaveCategoryFilters[index] || ""}
                              onChange={(e) => {
                                const newCategory = e.target.value;
                                setSlaveCategoryFilters({
                                  ...slaveCategoryFilters,
                                  [index]: newCategory,
                                });
                                // Automatically select first account of new category
                                const firstAccountInCategory = allAccounts.find(
                                  (acc) =>
                                    !acc.is_real &&
                                    (!newCategory ||
                                      acc.category === newCategory)
                                );
                                if (firstAccountInCategory) {
                                  setEditSlaves((prevSlaves) => {
                                    const newSlaves = [...prevSlaves];
                                    newSlaves[index] = {
                                      ...newSlaves[index],
                                      accountId: getAccountId(
                                        firstAccountInCategory
                                      ),
                                      slaveAccountName:
                                        firstAccountInCategory.name,
                                      slaveAccountIsReal: false,
                                    };
                                    return newSlaves;
                                  });
                                }
                              }}
                              className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                            >
                              <option value="">Toutes les catégories</option>
                              {[
                                ...new Set(
                                  allAccounts
                                    .filter((acc) => !acc.is_real)
                                    .map((acc) => acc.category)
                                ),
                              ].map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {slaveAccountTypes[index] !== "real" && (
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Compte virtuel
                            </label>
                            <select
                              value={slave.accountId}
                              onChange={(e) => {
                                const selectedAccount = allAccounts.find(
                                  (acc) => getAccountId(acc) === e.target.value
                                );
                                setEditSlaves((prevSlaves) => {
                                  const newSlaves = [...prevSlaves];
                                  newSlaves[index] = {
                                    ...newSlaves[index],
                                    accountId: e.target.value,
                                    slaveAccountName:
                                      selectedAccount?.name ||
                                      newSlaves[index].slaveAccountName,
                                    slaveAccountIsReal: false,
                                  };
                                  return newSlaves;
                                });
                              }}
                              className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                            >
                              <option value="" disabled>
                                Sélectionner un compte
                              </option>
                              {slave.accountId &&
                                !allAccounts.some(
                                  (acc) =>
                                    !acc.is_real &&
                                    getAccountId(acc) === slave.accountId &&
                                    (!slaveCategoryFilters[index] ||
                                      acc.category ===
                                        slaveCategoryFilters[index])
                                ) && (
                                  <option value={slave.accountId}>
                                    {slave.slaveAccountName || "Compte actuel"}
                                  </option>
                                )}
                              {allAccounts
                                .filter(
                                  (acc) =>
                                    !acc.is_real &&
                                    (!slaveCategoryFilters[index] ||
                                      acc.category ===
                                        slaveCategoryFilters[index])
                                )
                                .map((account) => (
                                  <option
                                    key={getAccountId(account)}
                                    value={getAccountId(account)}
                                  >
                                    {account.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Type
                          </label>
                          <select
                            value={slave.type}
                            onChange={(e) =>
                              handleSlaveChange(index, "type", e.target.value)
                            }
                            className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                          >
                            <option value="debit">Débit</option>
                            <option value="credit">Crédit</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Montant (EUR)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={slave.amount}
                            onChange={(e) =>
                              handleSlaveChange(
                                index,
                                "amount",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Date
                          </label>
                          <div className="w-full px-2 py-1.5 text-sm bg-gray-200 border-2 border-gray-300 rounded-md text-gray-600 font-medium">
                            {new Date(slave.date).toLocaleDateString("fr-FR")}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {editSlaves.length === 0 && (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12 mx-auto text-gray-400 mb-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
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

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            disabled={isSaving}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !canSave()}
            className={`px-4 py-2 rounded-lg transition-colors ${
              isSaving || !canSave()
                ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isSaving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}
