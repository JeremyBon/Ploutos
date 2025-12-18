"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Navigation from "@/components/Navigation";
import TransactionEditModal from "@/components/TransactionEditModal";
import { API_URL } from "@/config/api";

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
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
  };

  const handleSaveTransaction = async (
    transactionId: string,
    description: string,
    date: string,
    slaves: {
      slaveId: string;
      type: string;
      amount: number;
      date: string;
      accountId: string;
    }[]
  ) => {
    // Mettre à jour la transaction principale
    const response = await fetch(`${API_URL}/transactions/${transactionId}`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description,
        date: new Date(date).toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to update transaction");
    }

    // Mettre à jour les slaves
    const slavesResponse = await fetch(
      `${API_URL}/transactions/${transactionId}/slaves`,
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slaves: slaves.map((slave) => ({
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

    // Recharger les transactions
    await fetchTransactions();
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
      <TransactionEditModal
        isOpen={isModalOpen}
        transaction={
          selectedTransaction
            ? {
                transactionId: selectedTransaction.transactionId,
                description: selectedTransaction.description,
                date: selectedTransaction.date,
                amount: selectedTransaction.amount,
                type: selectedTransaction.type,
                accountId: selectedTransaction.accountId,
                masterAccountName: selectedTransaction.masterAccountName,
                TransactionsSlaves: selectedTransaction.TransactionsSlaves.map(
                  (s) => ({
                    slaveId: s.slaveId,
                    type: s.type,
                    amount: s.amount,
                    date: s.date,
                    accountId: s.accountId,
                    masterId: s.masterId,
                    slaveAccountName:
                      s.slaveAccountName || s.Accounts?.name || "",
                    slaveAccountIsReal: false,
                  })
                ),
              }
            : null
        }
        accounts={accounts}
        onClose={handleClose}
        onSave={handleSaveTransaction}
      />
    </div>
  );
}
