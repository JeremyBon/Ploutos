"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Account {
  accountId: string;
  name: string;
  created_at: string;
  updated_at: string;
  category: string;
  sub_category: string;
  is_real: boolean;
  original_amount: number;
}

interface AccountFormData {
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
  original_amount: number;
}

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
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"real" | "virtual">("real");
  const [activeCategory, setActiveCategory] = useState<string>("");

  const fetchAccounts = async () => {
    try {
      const response = await fetch("http://localhost:8000/accounts");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("Data received:", data);
      setAccounts(data);
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
    fetchAccounts();
  }, []);

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
      fetchAccounts();
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
      fetchAccounts();
    } catch (error) {
      console.error("Erreur lors de la suppression du compte:", error);
      setError("Une erreur est survenue lors de la suppression.");
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
    });
    setEditingAccountId(null);
  };

  const categories = Array.from(
    new Set(accounts.map((account) => account.category))
  );

  const filteredAccounts = accounts.filter((account) => {
    const matchesTab = account.is_real === (activeTab === "real");
    const matchesCategory =
      !activeCategory || account.category === activeCategory;
    return matchesTab && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Navigation Bar (copied from Transactions page) */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-blue-600">Ploutos</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="px-4 py-2 rounded-lg text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                Retour
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Paramètres des Comptes</h1>
          <button
            onClick={() => {
              resetForm();
              setShowAccountModal(true);
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Nouveau Compte
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {toastMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {toastMessage}
          </div>
        )}

        <div className="mb-6">
          <div className="flex space-x-4 mb-4">
            <button
              onClick={() => setActiveTab("real")}
              className={`px-4 py-2 rounded ${
                activeTab === "real"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Comptes Réels
            </button>
            <button
              onClick={() => setActiveTab("virtual")}
              className={`px-4 py-2 rounded ${
                activeTab === "virtual"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Comptes Virtuels
            </button>
          </div>

          <div className="flex space-x-2 overflow-x-auto pb-2">
            <button
              onClick={() => setActiveCategory("")}
              className={`px-3 py-1 rounded ${
                !activeCategory
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Tous
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-3 py-1 rounded ${
                  activeCategory === category
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div>Chargement...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAccounts.map((account) => (
              <div
                key={account.accountId}
                className="border rounded-lg p-4 shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-semibold">{account.name}</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(account)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(account.accountId)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Catégorie: {account.category}
                </p>
                <p className="text-sm text-gray-600">
                  Sous-catégorie: {account.sub_category}
                </p>
                <p className="text-sm text-gray-600">
                  Montant initial: {account.original_amount}€
                </p>
              </div>
            ))}
          </div>
        )}

        {showAccountModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">
                {editingAccountId ? "Modifier le Compte" : "Nouveau Compte"}
              </h2>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Nom
                  </label>
                  <input
                    type="text"
                    value={accountForm.name}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, name: e.target.value })
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700">
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700">
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700">
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={accountForm.is_real}
                      onChange={(e) =>
                        setAccountForm({
                          ...accountForm,
                          is_real: e.target.checked,
                        })
                      }
                      className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      Compte réel
                    </span>
                  </label>
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccountModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isCreating ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
