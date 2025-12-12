"use client";

import { useEffect, useState, useMemo } from "react";
import Navigation from "@/components/Navigation";

interface Account {
  accountId: string;
  name: string;
  created_at: string;
  updated_at: string;
  category: string;
  sub_category: string;
  is_real: boolean;
  original_amount: number;
  active: boolean;
  current_amount?: number;
}

interface AccountFormData {
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
  original_amount: number;
  active: boolean;
}

type SortOption = "amount-desc" | "name-asc" | "category";

export default function AccountSettings() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormData>({
    name: "",
    category: "",
    sub_category: "",
    is_real: true,
    original_amount: 0,
    active: true,
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"real" | "virtual">("real");
  const [activeFilterKey, setActiveFilterKey] = useState<string>("all");
  const [sortOption, setSortOption] = useState<SortOption>("amount-desc");
  const [showArchived, setShowArchived] = useState(false);

  const fetchAccounts = async (includeArchived: boolean = false) => {
    try {
      const [accountsResponse, currentAmountsResponse] = await Promise.all([
        fetch(
          `http://localhost:8000/accounts?include_archived=${includeArchived}`
        ),
        fetch("http://localhost:8000/accounts/current-amounts"),
      ]);

      if (!accountsResponse.ok) {
        throw new Error(`HTTP error! status: ${accountsResponse.status}`);
      }

      const accountsData = await accountsResponse.json();
      const currentAmountsData = currentAmountsResponse.ok
        ? await currentAmountsResponse.json()
        : [];

      // Merge current amounts into accounts
      const currentAmountsMap = new Map(
        currentAmountsData.map(
          (item: { account_id: string; current_amount: number }) => [
            item.account_id,
            item.current_amount,
          ]
        )
      );

      const mergedAccounts = accountsData.map((account: Account) => ({
        ...account,
        current_amount:
          currentAmountsMap.get(account.accountId) ?? account.original_amount,
      }));

      setAccounts(mergedAccounts);
      setError(null);
    } catch (error) {
      console.error("Erreur lors de la récupération des comptes:", error);
      setError(
        "Impossible de charger les comptes. Veuillez réessayer plus tard."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts(showArchived);
  }, [showArchived]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const url = editingAccountId
        ? `http://localhost:8000/accounts/${editingAccountId}`
        : "http://localhost:8000/create-account";
      const method = editingAccountId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(accountForm),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setToastMessage(
        editingAccountId
          ? "Compte mis à jour avec succès"
          : "Compte créé avec succès"
      );
      setShowAccountModal(false);
      resetForm();
      fetchAccounts(showArchived);
    } catch (error) {
      console.error("Erreur lors de la création/mise à jour du compte:", error);
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce compte ?")) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8000/accounts/${accountId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setToastMessage("Compte supprimé avec succès");
      fetchAccounts(showArchived);
    } catch (error) {
      console.error("Erreur lors de la suppression du compte:", error);
      setError("Une erreur est survenue lors de la suppression.");
    }
  };

  const handleArchive = async (
    accountId: string,
    isCurrentlyActive: boolean
  ) => {
    try {
      const response = await fetch(
        `http://localhost:8000/accounts/${accountId}/archive`,
        {
          method: "PATCH",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setToastMessage(
        isCurrentlyActive
          ? "Compte archivé avec succès"
          : "Compte désarchivé avec succès"
      );
      fetchAccounts(showArchived);
    } catch (error) {
      console.error("Erreur lors de l'archivage du compte:", error);
      setError("Une erreur est survenue lors de l'archivage.");
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccountId(account.accountId);
    setAccountForm({
      name: account.name,
      category: account.category,
      sub_category: account.sub_category,
      is_real: account.is_real,
      original_amount: account.original_amount,
      active: account.active,
    });
    setShowAccountModal(true);
  };

  const resetForm = () => {
    setAccountForm({
      name: "",
      category: "",
      sub_category: "",
      is_real: true,
      original_amount: 0,
      active: true,
    });
    setEditingAccountId(null);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const normalizeKey = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]/g, "-");

  // Build category hierarchy for current tab
  const categoryHierarchy = useMemo(() => {
    const filtered = accounts.filter(
      (acc) => acc.is_real === (activeTab === "real")
    );
    const hierarchy: Record<string, Set<string>> = {};

    filtered.forEach((acc) => {
      if (!hierarchy[acc.category]) {
        hierarchy[acc.category] = new Set();
      }
      hierarchy[acc.category].add(acc.sub_category);
    });

    return hierarchy;
  }, [accounts, activeTab]);

  // Count accounts per category for navigation
  const accountCounts = useMemo(() => {
    const filtered = accounts.filter(
      (acc) => acc.is_real === (activeTab === "real")
    );
    const counts: Record<string, number> = { all: filtered.length };

    filtered.forEach((acc) => {
      const categoryKey = `cat-${normalizeKey(acc.category)}`;
      counts[categoryKey] = (counts[categoryKey] || 0) + 1;
    });

    return counts;
  }, [accounts, activeTab]);

  // Filter and sort accounts
  const filteredAccounts = useMemo(() => {
    let filtered = accounts.filter(
      (acc) => acc.is_real === (activeTab === "real")
    );

    if (activeFilterKey !== "all") {
      if (activeFilterKey.startsWith("cat-")) {
        const categoryKey = activeFilterKey.replace("cat-", "");
        filtered = filtered.filter(
          (acc) => normalizeKey(acc.category) === categoryKey
        );
      } else if (activeFilterKey.startsWith("sub-")) {
        const parts = activeFilterKey.replace("sub-cat-", "").split("-sub-");
        if (parts.length === 2) {
          const [categoryKey, subKey] = parts;
          filtered = filtered.filter(
            (acc) =>
              normalizeKey(acc.category) === categoryKey &&
              normalizeKey(acc.sub_category) === subKey
          );
        }
      }
    }

    // Sort
    switch (sortOption) {
      case "amount-desc":
        filtered.sort(
          (a, b) =>
            (b.current_amount ?? b.original_amount) -
            (a.current_amount ?? a.original_amount)
        );
        break;
      case "name-asc":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "category":
        filtered.sort((a, b) => a.category.localeCompare(b.category));
        break;
    }

    return filtered;
  }, [accounts, activeTab, activeFilterKey, sortOption]);

  const getViewTitle = () => {
    if (activeFilterKey === "all") {
      return "Tous les Comptes";
    }
    if (activeFilterKey.startsWith("cat-")) {
      const category = Object.keys(categoryHierarchy).find(
        (cat) => normalizeKey(cat) === activeFilterKey.replace("cat-", "")
      );
      return category || "Comptes";
    }
    if (activeFilterKey.startsWith("sub-")) {
      const parts = activeFilterKey.replace("sub-cat-", "").split("-sub-");
      if (parts.length === 2) {
        const [categoryKey, subKey] = parts;
        const category = Object.keys(categoryHierarchy).find(
          (cat) => normalizeKey(cat) === categoryKey
        );
        const subcategory = category
          ? Array.from(categoryHierarchy[category]).find(
              (sub) => normalizeKey(sub) === subKey
            )
          : null;
        return subcategory || "Comptes";
      }
    }
    return "Comptes";
  };

  const handleTabChange = (tab: "real" | "virtual") => {
    setActiveTab(tab);
    setActiveFilterKey("all");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4 sm:mb-0">
            Gestion des Comptes
          </h1>

          <button
            onClick={() => {
              resetForm();
              setShowAccountModal(true);
            }}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition duration-200 text-lg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            <span>Nouveau Compte</span>
          </button>
        </header>

        {/* Toast Messages */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {toastMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg mb-4">
            {toastMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-8 border-b border-gray-200">
          <div className="flex space-x-6">
            <button
              onClick={() => handleTabChange("real")}
              className={`pb-3 px-1 text-lg font-semibold transition duration-150 ${
                activeTab === "real"
                  ? "text-blue-600 border-b-4 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Comptes Réels
            </button>
            <button
              onClick={() => handleTabChange("virtual")}
              className={`pb-3 px-1 text-lg font-semibold transition duration-150 ${
                activeTab === "virtual"
                  ? "text-blue-600 border-b-4 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Comptes Virtuels
            </button>
          </div>
        </div>

        {/* Main Content with Sidebar */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full lg:w-64 bg-white p-4 rounded-xl shadow-lg flex-shrink-0 order-2 lg:order-1">
            <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">
              Navigation
            </h2>

            <nav className="space-y-1">
              {/* All accounts link */}
              <button
                onClick={() => setActiveFilterKey("all")}
                className={`w-full text-left flex items-center justify-between p-2 rounded-lg transition duration-150 ${
                  activeFilterKey === "all"
                    ? "bg-blue-100 text-blue-800 font-semibold"
                    : "hover:bg-gray-100"
                }`}
              >
                <span>Tous les Comptes</span>
                <span className="text-xs text-gray-400">
                  {accountCounts.all}
                </span>
              </button>

              {/* Category hierarchy */}
              {Object.keys(categoryHierarchy)
                .sort()
                .map((category) => {
                  const categoryKey = `cat-${normalizeKey(category)}`;
                  return (
                    <button
                      key={category}
                      onClick={() => setActiveFilterKey(categoryKey)}
                      className={`w-full text-left flex items-center justify-between p-2 rounded-lg transition duration-150 ${
                        activeFilterKey === categoryKey
                          ? "bg-blue-100 text-blue-800 font-semibold"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <span>{category}</span>
                      <span className="text-xs text-gray-400">
                        {accountCounts[categoryKey] || 0}
                      </span>
                    </button>
                  );
                })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-grow order-1 lg:order-2">
            {/* Toolbar */}
            <div className="mb-6 flex flex-wrap gap-3 items-center justify-between">
              <h2 className="text-2xl font-semibold text-gray-700">
                {getViewTitle()}
              </h2>

              <div className="flex items-center gap-6">
                {/* Show archived toggle */}
                <label className="flex items-center cursor-pointer text-gray-600">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm font-medium">
                    Afficher les archivés
                  </span>
                </label>

                {/* Sort */}
                <div className="flex items-center space-x-2 text-gray-600">
                  <label
                    htmlFor="sort"
                    className="text-sm font-medium hidden sm:block"
                  >
                    Trier par :
                  </label>
                  <select
                    id="sort"
                    value={sortOption}
                    onChange={(e) =>
                      setSortOption(e.target.value as SortOption)
                    }
                    className="p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="amount-desc">Montant (Décroissant)</option>
                    <option value="name-asc">Nom (A-Z)</option>
                    <option value="category">Catégorie</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Accounts Grid */}
            {loading ? (
              <div className="text-center p-12 bg-white rounded-xl shadow-lg">
                <p className="text-xl font-medium text-gray-600">
                  Chargement...
                </p>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-center p-12 bg-white rounded-xl shadow-lg">
                <p className="text-xl font-medium text-gray-600">
                  Aucun compte trouvé pour cette sélection.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredAccounts.map((account) => {
                  const currentAmount =
                    account.current_amount ?? account.original_amount;
                  const isNegative = currentAmount < 0;
                  return (
                    <div
                      key={account.accountId}
                      className={`bg-white p-6 rounded-2xl shadow-xl hover:shadow-2xl transition duration-300 border-t-4 ${
                        !account.active
                          ? "border-gray-400 opacity-60"
                          : isNegative
                            ? "border-red-400"
                            : "border-green-400"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-gray-800">
                              {account.name}
                            </h3>
                            {!account.active && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-full">
                                Inactif
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            <span className="font-medium text-gray-700">
                              {account.category}
                            </span>{" "}
                            / {account.sub_category}
                          </p>
                        </div>
                        <button className="text-gray-400 hover:text-blue-600 transition">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Current Amount */}
                      <div className="mb-6">
                        <span
                          className={`text-4xl font-extrabold ${
                            isNegative ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {formatAmount(currentAmount)}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">
                          Solde initial :{" "}
                          <span className="text-gray-400">
                            {formatAmount(account.original_amount)}
                          </span>
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end space-x-4 border-t pt-4 mt-2">
                        <button
                          onClick={() => handleEdit(account)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium transition duration-150"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() =>
                            handleArchive(account.accountId, account.active)
                          }
                          className="text-sm text-amber-600 hover:text-amber-800 font-medium transition duration-150"
                        >
                          {account.active ? "Archiver" : "Désarchiver"}
                        </button>
                        <button
                          onClick={() => handleDelete(account.accountId)}
                          className="text-sm text-red-600 hover:text-red-800 font-medium transition duration-150"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              {editingAccountId ? "Modifier le Compte" : "Nouveau Compte"}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom
                </label>
                <input
                  type="text"
                  value={accountForm.name}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, name: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                  required
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Catégorie
                </label>
                <input
                  type="text"
                  value={accountForm.category}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      category: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                  required
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sous-catégorie
                </label>
                <input
                  type="text"
                  value={accountForm.sub_category}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      sub_category: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                  required
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Montant initial
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={accountForm.original_amount}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      original_amount: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                  required
                />
              </div>
              <div className="mb-5">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.is_real}
                    onChange={(e) =>
                      setAccountForm({
                        ...accountForm,
                        is_real: e.target.checked,
                      })
                    }
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-sm text-gray-700">
                    Compte réel
                  </span>
                </label>
              </div>
              <div className="mb-6">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.active}
                    onChange={(e) =>
                      setAccountForm({
                        ...accountForm,
                        active: e.target.checked,
                      })
                    }
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-sm text-gray-700">
                    Compte actif
                  </span>
                </label>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountModal(false);
                    resetForm();
                  }}
                  className="px-6 py-3 text-gray-700 bg-gray-200 rounded-xl hover:bg-gray-300 font-medium transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-3 text-white bg-blue-600 rounded-xl hover:bg-blue-700 font-medium transition disabled:opacity-50"
                >
                  {isCreating ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
