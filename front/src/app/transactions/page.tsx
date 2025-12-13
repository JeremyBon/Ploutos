"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Navigation from "@/components/Navigation";

// Icons components
const FilterIcon = () => (
  <svg
    className="w-5 h-5 text-blue-600"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
    />
  </svg>
);

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    className={`w-5 h-5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 9l-7 7-7-7"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg
    className="w-4 h-4 text-gray-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const SortIcon = () => (
  <svg
    className="w-4 h-4 text-gray-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
    />
  </svg>
);

const CurrencyIcon = () => (
  <svg
    className="w-4 h-4 text-gray-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0M8 10.5h4m-4 3h4m9-1.5a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const ResetIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

interface Account {
  accountId: string;
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
  original_amount: number;
  created_at: string;
  updated_at: string;
}

interface TransactionSlave {
  slaveId: string;
  accountId: string;
  amount: number;
  date: string;
  type: string;
  masterId: string;
  Accounts: {
    name: string;
  };
  slaveAccountName?: string;
}

interface EditableSlave {
  slaveId: string;
  accountId: string;
  amount: number;
  date: string;
  type: string;
  isNew?: boolean;
}

interface Transaction {
  transactionId: string;
  accountId: string;
  amount: number;
  description: string;
  date: string;
  type: string;
  created_at: string;
  updated_at: string;
  TransactionsSlaves: TransactionSlave[];
  masterAccountName: string;
}

const API_URL = "http://localhost:8000";

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("2023-04");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<"month" | "custom" | "all">(
    "month"
  );
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editedTransaction, setEditedTransaction] =
    useState<Transaction | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [editedSlaves, setEditedSlaves] = useState<EditableSlave[]>([]);
  const [originalSlaves, setOriginalSlaves] = useState<EditableSlave[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  const [filterIsReal, setFilterIsReal] = useState<"all" | "real" | "virtual">(
    "all"
  );
  const [filterCategory, setFilterCategory] = useState<string>("");

  // Get unique categories from accounts (filtered by is_real)
  const categories = useMemo(() => {
    const filteredByType = accounts.filter((account) => {
      if (filterIsReal === "real") return account.is_real;
      if (filterIsReal === "virtual") return !account.is_real;
      return true;
    });
    const uniqueCategories = [
      ...new Set(filteredByType.map((a) => a.category).filter(Boolean)),
    ];
    return uniqueCategories.sort();
  }, [accounts, filterIsReal]);

  // Reset category filter if it's no longer available
  useEffect(() => {
    if (filterCategory && !categories.includes(filterCategory)) {
      setFilterCategory("");
    }
  }, [categories, filterCategory]);

  // Filter accounts based on is_real and category
  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      if (filterIsReal === "real" && !account.is_real) return false;
      if (filterIsReal === "virtual" && account.is_real) return false;
      if (filterCategory && account.category !== filterCategory) return false;
      return true;
    });
  }, [accounts, filterIsReal, filterCategory]);

  // Group filtered accounts by category for display
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = {};
    filteredAccounts.forEach((account) => {
      const cat = account.category || "Sans catégorie";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(account);
    });
    return groups;
  }, [filteredAccounts]);

  // Reset selected account if it's no longer in filtered accounts
  useEffect(() => {
    if (selectedAccount) {
      const isStillValid = filteredAccounts.some(
        (account) => account.accountId === selectedAccount
      );
      if (!isStillValid) {
        setSelectedAccount("");
      }
    }
  }, [filteredAccounts, selectedAccount]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedAccount) count++;
    if (dateFilter !== "all") count++;
    if (amountMin || amountMax) count++;
    if (sortBy !== "date" || sortDirection !== "desc") count++;
    if (filterIsReal !== "all") count++;
    if (filterCategory) count++;
    return count;
  }, [
    selectedAccount,
    dateFilter,
    amountMin,
    amountMax,
    sortBy,
    sortDirection,
    filterIsReal,
    filterCategory,
  ]);

  const resetFilters = () => {
    setSelectedAccount("");
    setDateFilter("month");
    setSelectedMonth("2023-04");
    setCustomDateFrom("");
    setCustomDateTo("");
    setAmountMin("");
    setAmountMax("");
    setSortBy("date");
    setSortDirection("desc");
    setFilterIsReal("all");
    setFilterCategory("");
  };

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/accounts`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams();

      // Gestion du filtre de date
      if (dateFilter === "month" && selectedMonth) {
        const [year, month] = selectedMonth.split("-");
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month}-${lastDay}`;
        params.append("date_from", startDate);
        params.append("date_to", endDate);
      } else if (dateFilter === "custom" && customDateFrom && customDateTo) {
        params.append("date_from", customDateFrom);
        params.append("date_to", customDateTo);
      }
      // Si dateFilter === 'all', on n'ajoute aucun paramètre de date

      if (selectedAccount) {
        params.append("account_id", selectedAccount);
      }

      const response = await fetch(
        `${API_URL}/transactions?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }

      const data = await response.json();
      console.log("Transactions data:", data);
      setTransactions(data);
      setError(null);
    } catch (error) {
      setError(
        `Unable to load transactions: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [
    selectedMonth,
    selectedAccount,
    dateFilter,
    customDateFrom,
    customDateTo,
  ]);

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchAccounts();
        await fetchTransactions();
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };
    loadData();
  }, [fetchAccounts, fetchTransactions]);

  const sortedTransactions = useMemo(() => {
    let filtered = [...transactions];

    // Filtre par montant
    if (amountMin !== "") {
      const min = parseFloat(amountMin);
      if (!isNaN(min)) {
        filtered = filtered.filter((t) => t.amount >= min);
      }
    }
    if (amountMax !== "") {
      const max = parseFloat(amountMax);
      if (!isNaN(max)) {
        filtered = filtered.filter((t) => t.amount <= max);
      }
    }

    // Tri
    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "date") {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortBy === "amount") {
        comparison = a.amount - b.amount;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [transactions, sortBy, sortDirection, amountMin, amountMax]);

  const handleViewDetails = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setEditedTransaction(transaction);
    const slaves = transaction.TransactionsSlaves.map((s) => ({
      slaveId: s.slaveId,
      accountId: s.accountId,
      amount: s.amount,
      date: s.date.split("T")[0],
      type: s.type,
    }));
    setEditedSlaves(slaves);
    setOriginalSlaves(JSON.parse(JSON.stringify(slaves)));
    setIsModalOpen(true);
    setHasChanges(false);
  };

  const handleTransactionChange = (field: keyof Transaction, value: string) => {
    if (!editedTransaction) return;
    setEditedTransaction({ ...editedTransaction, [field]: value });
    setHasChanges(true);
  };

  const handleSlaveChange = (
    index: number,
    field: keyof EditableSlave,
    value: string | number
  ) => {
    const newSlaves = [...editedSlaves];
    newSlaves[index] = { ...newSlaves[index], [field]: value };
    setEditedSlaves(newSlaves);
    setHasChanges(true);
  };

  const handleAddSlave = () => {
    if (!editedTransaction) return;
    const newSlave: EditableSlave = {
      slaveId: crypto.randomUUID(),
      accountId: "",
      amount: 0,
      date: editedTransaction.date.split("T")[0],
      type: editedTransaction.type === "debit" ? "credit" : "debit",
      isNew: true,
    };
    setEditedSlaves([...editedSlaves, newSlave]);
    setHasChanges(true);
  };

  const handleRemoveSlave = (index: number) => {
    setEditedSlaves(editedSlaves.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const slavesHaveChanges = useMemo(() => {
    if (editedSlaves.length !== originalSlaves.length) return true;
    return editedSlaves.some((slave, index) => {
      const original = originalSlaves[index];
      return (
        slave.accountId !== original.accountId ||
        slave.amount !== original.amount ||
        slave.date !== original.date ||
        slave.type !== original.type
      );
    });
  }, [editedSlaves, originalSlaves]);

  const hasInvalidSlaves = useMemo(() => {
    return editedSlaves.some(
      (slave) => Number(slave.amount) <= 0 || !slave.accountId
    );
  }, [editedSlaves]);

  const handleCancel = () => {
    if (!selectedTransaction) return;
    setEditedTransaction(selectedTransaction);
    setEditedSlaves(JSON.parse(JSON.stringify(originalSlaves)));
    setHasChanges(false);
  };

  const handleSave = async () => {
    if (!editedTransaction) return;

    try {
      // 1. Mettre à jour la transaction maître (description, date)
      const response = await fetch(
        `${API_URL}/transactions/${editedTransaction.transactionId}`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description: editedTransaction.description,
            date: editedTransaction.date,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update transaction");
      }

      // 2. Mettre à jour les slaves si elles ont changé
      if (slavesHaveChanges) {
        const slavesResponse = await fetch(
          `${API_URL}/transactions/${editedTransaction.transactionId}/slaves`,
          {
            method: "PUT",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              slaves: editedSlaves.map((slave) => ({
                slaveId: slave.slaveId,
                type: slave.type,
                amount: slave.amount,
                date: slave.date,
                accountId: slave.accountId,
              })),
            }),
          }
        );

        if (!slavesResponse.ok) {
          const errorData = await slavesResponse.json().catch(() => ({}));
          throw new Error(
            errorData.detail || "Failed to update transaction slaves"
          );
        }
      }

      // Recharger les transactions pour avoir les données à jour
      await fetchTransactions();

      setIsModalOpen(false);
    } catch (error) {
      setError(
        `Failed to update transaction: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
    setEditedTransaction(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Navigation />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800">Transactions</h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>
              {sortedTransactions.length} transaction
              {sortedTransactions.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
          {/* Filter Header - Clickable */}
          <button
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FilterIcon />
              </div>
              <span className="font-semibold text-gray-800">Filtres</span>
              {activeFiltersCount > 0 && (
                <span className="px-2.5 py-0.5 bg-blue-600 text-white text-xs font-medium rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </div>
            <ChevronIcon isOpen={isFiltersOpen} />
          </button>

          {/* Filter Content - Collapsible */}
          <div
            className={`transition-all duration-300 ease-in-out ${isFiltersOpen ? "max-h-[700px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}
          >
            <div className="px-5 pb-5 border-t border-gray-100">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-5">
                {/* Account Filters Row */}
                <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-gray-100">
                  {/* Type de compte (is_real) */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Type de compte
                    </label>
                    <div className="flex gap-1">
                      {[
                        { value: "all", label: "Tous" },
                        { value: "real", label: "Réels" },
                        { value: "virtual", label: "Virtuels" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() =>
                            setFilterIsReal(
                              option.value as "all" | "real" | "virtual"
                            )
                          }
                          className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                            filterIsReal === option.value
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Catégorie */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                      Catégorie
                    </label>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Toutes les catégories</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Compte */}
                  <div className="space-y-2">
                    <label
                      htmlFor="account"
                      className="flex items-center gap-2 text-sm font-medium text-gray-700"
                    >
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                        />
                      </svg>
                      Compte
                      {filteredAccounts.length !== accounts.length && (
                        <span className="text-xs text-blue-600">
                          ({filteredAccounts.length}/{accounts.length})
                        </span>
                      )}
                    </label>
                    <select
                      id="account"
                      value={selectedAccount}
                      onChange={(e) => setSelectedAccount(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="" className="text-gray-600 font-medium">
                        Tous les comptes
                      </option>
                      {Object.entries(groupedAccounts).map(
                        ([category, categoryAccounts]) => (
                          <optgroup key={category} label={category}>
                            {categoryAccounts.map((account) => (
                              <option
                                key={account.accountId}
                                value={account.accountId}
                              >
                                {account.name}{" "}
                                {account.is_real ? "" : "(virtuel)"}
                              </option>
                            ))}
                          </optgroup>
                        )
                      )}
                    </select>
                  </div>
                </div>

                {/* Date Filter */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <CalendarIcon />
                    Période
                  </label>
                  <div className="space-y-2">
                    <select
                      value={dateFilter}
                      onChange={(e) =>
                        setDateFilter(
                          e.target.value as "month" | "custom" | "all"
                        )
                      }
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="month">Par mois</option>
                      <option value="custom">Période personnalisée</option>
                      <option value="all">Toutes les dates</option>
                    </select>

                    {dateFilter === "month" && (
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    )}

                    {dateFilter === "custom" && (
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={customDateFrom}
                          onChange={(e) => setCustomDateFrom(e.target.value)}
                          className="flex-1 px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <input
                          type="date"
                          value={customDateTo}
                          onChange={(e) => setCustomDateTo(e.target.value)}
                          className="flex-1 px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount Filter */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <CurrencyIcon />
                    Montant
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={amountMin}
                      onChange={(e) => setAmountMin(e.target.value)}
                      placeholder="Min"
                      className="w-24 px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <span className="text-gray-500 text-sm">à</span>
                    <input
                      type="number"
                      value={amountMax}
                      onChange={(e) => setAmountMax(e.target.value)}
                      placeholder="Max"
                      className="w-24 px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Sort */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <SortIcon />
                    Trier par
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(e.target.value as "date" | "amount")
                      }
                      className="flex-1 px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="date">Date</option>
                      <option value="amount">Montant</option>
                    </select>
                    <button
                      onClick={() =>
                        setSortDirection(
                          sortDirection === "asc" ? "desc" : "asc"
                        )
                      }
                      className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        sortDirection === "desc"
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      }`}
                      title={
                        sortDirection === "asc" ? "Croissant" : "Décroissant"
                      }
                    >
                      {sortDirection === "asc" ? "↑ Asc" : "↓ Desc"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Reset Button */}
              {activeFiltersCount > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
                  >
                    <ResetIcon />
                    Réinitialiser les filtres
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {loading ? (
            <p className="text-gray-600">Chargement...</p>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : sortedTransactions.length === 0 ? (
            <p className="text-gray-600">Aucune transaction disponible</p>
          ) : (
            <ul className="space-y-3">
              {sortedTransactions.map((transaction) => (
                <li
                  key={transaction.transactionId}
                  className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow mb-2 cursor-pointer"
                  onClick={() => handleViewDetails(transaction)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-[180px]">
                      <span className="text-base font-medium text-gray-800">
                        {transaction.description}
                      </span>
                      <p className="text-xs text-gray-500">
                        {new Date(transaction.date).toLocaleDateString(
                          "fr-FR",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          }
                        )}
                      </p>
                    </div>
                    <div className="flex-1 text-center min-w-[120px]">
                      <div className="flex items-center justify-center gap-2">
                        <p className="text-sm text-gray-800">
                          {transaction.masterAccountName || "Compte inconnu"}
                        </p>
                        {transaction.TransactionsSlaves &&
                          transaction.TransactionsSlaves.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {transaction.TransactionsSlaves.map((slave) => (
                                <div
                                  key={slave.slaveId}
                                  className="px-2 py-1 bg-blue-100 rounded text-xs text-blue-800 border border-blue-200 whitespace-nowrap"
                                >
                                  {slave.slaveAccountName ||
                                    "⚠️ Compte non récupéré"}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                    <div className="flex-1 text-right min-w-[100px]">
                      <p
                        className={`text-base font-semibold ${
                          transaction.type === "debit"
                            ? "text-red-600"
                            : transaction.type === "credit"
                              ? "text-green-600"
                              : "text-gray-800"
                        }`}
                      >
                        {transaction.amount}€
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* Modal */}
      {isModalOpen && selectedTransaction && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">
                Détails de la transaction
              </h3>
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
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

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <input
                  type="text"
                  value={editedTransaction?.description}
                  onChange={(e) =>
                    handleTransactionChange("description", e.target.value)
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  type="date"
                  value={editedTransaction?.date.split("T")[0]}
                  onChange={(e) =>
                    handleTransactionChange("date", e.target.value)
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Montant</p>
                <p className="mt-1">{selectedTransaction.amount}€</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Type</p>
                <p className="mt-1 capitalize">{selectedTransaction.type}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Compte</p>
                <p className="mt-1">
                  {selectedTransaction.masterAccountName ||
                    "⚠️ Account not retrieved"}
                </p>
              </div>
              {/* Section des transactions associées (slaves) - Éditable */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-gray-500">
                    Transactions associées
                  </p>
                  <button
                    type="button"
                    onClick={handleAddSlave}
                    className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                  >
                    + Ajouter
                  </button>
                </div>

                {editedSlaves.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    Aucune transaction associée
                  </p>
                ) : (
                  <div className="space-y-3">
                    {editedSlaves.map((slave, index) => (
                      <div
                        key={slave.slaveId}
                        className="bg-gray-50 p-3 rounded-md border border-gray-200"
                      >
                        <div className="flex items-start gap-3">
                          {/* Sélecteur de compte */}
                          <div className="flex-1">
                            <label className="block text-xs text-gray-500 mb-1">
                              Compte
                            </label>
                            <select
                              value={slave.accountId}
                              onChange={(e) =>
                                handleSlaveChange(
                                  index,
                                  "accountId",
                                  e.target.value
                                )
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">Sélectionner un compte</option>
                              {accounts.map((account) => (
                                <option
                                  key={account.accountId}
                                  value={account.accountId}
                                >
                                  {account.name}{" "}
                                  {!account.is_real && "(virtuel)"}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Montant */}
                          <div className="w-24">
                            <label className="block text-xs text-gray-500 mb-1">
                              Montant
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
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>

                          {/* Type */}
                          <div className="w-20">
                            <label className="block text-xs text-gray-500 mb-1">
                              Type
                            </label>
                            <select
                              value={slave.type}
                              onChange={(e) =>
                                handleSlaveChange(index, "type", e.target.value)
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="credit">Crédit</option>
                              <option value="debit">Débit</option>
                            </select>
                          </div>

                          {/* Bouton supprimer */}
                          <button
                            type="button"
                            onClick={() => handleRemoveSlave(index)}
                            className="mt-5 p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            title="Supprimer"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Total des slaves */}
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                      <span className="text-sm text-gray-500">
                        Total des slaves:
                      </span>
                      <span
                        className={`text-sm font-semibold ${
                          editedSlaves.reduce((sum, s) => sum + s.amount, 0) ===
                          selectedTransaction.amount
                            ? "text-green-600"
                            : "text-orange-500"
                        }`}
                      >
                        {editedSlaves
                          .reduce((sum, s) => sum + s.amount, 0)
                          .toFixed(2)}
                        €
                        {editedSlaves.reduce((sum, s) => sum + s.amount, 0) !==
                          selectedTransaction.amount && (
                          <span className="ml-2 text-xs">
                            (attendu: {selectedTransaction.amount}€)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                {hasChanges && (
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                  >
                    Annuler
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={hasInvalidSlaves}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                    hasInvalidSlaves
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  Modifier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
