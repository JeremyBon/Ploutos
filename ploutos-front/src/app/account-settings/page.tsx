'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Account {
  accountId: string;
  name: string;
  created_at: string;
  updated_at: string;
  account_type: string;
}

interface AccountType {
  id: string;
  category: string;
  sub_category: string;
  is_real: boolean;
}

interface AccountFormData {
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
}

export default function AccountSettings() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormData>({
    name: '',
    category: '',
    sub_category: '',
    is_real: true,
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'real' | 'virtual'>('real');
  const [activeCategory, setActiveCategory] = useState<string>('');

  const fetchAccounts = async () => {
    try {
      const response = await fetch('http://localhost:8000/accounts');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Data received:', data);
      setAccounts(data);
      setError(null);
    } catch (error) {
      console.error('Erreur lors de la récupération des comptes:', error);
      setError('Impossible de charger les comptes. Veuillez réessayer plus tard.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountTypes = async () => {
    try {
      const response = await fetch('http://localhost:8000/account-types');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAccountTypes(data);
    } catch (error) {
      console.error('Erreur lors de la récupération des types de comptes:', error);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchAccountTypes();
  }, []);

  // Get unique categories for the current tab
  const getCategoriesForTab = () => {
    const filteredAccounts = accounts.filter(account => {
      const accountType = accountTypes.find(type => type.id === account.account_type);
      return accountType?.is_real === (activeTab === 'real');
    });

    return Array.from(new Set(
      filteredAccounts.map(account => {
        const accountType = accountTypes.find(type => type.id === account.account_type);
        return accountType?.category || '';
      })
    ))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  };

  // Get accounts for current tab and category
  const getFilteredAccounts = () => {
    return accounts
      .filter(account => {
        const accountType = accountTypes.find(type => type.id === account.account_type);
        return accountType?.is_real === (activeTab === 'real') && 
               (!activeCategory || accountType?.category === activeCategory);
      })
      .sort((a, b) => {
        const typeA = accountTypes.find(type => type.id === a.account_type);
        const typeB = accountTypes.find(type => type.id === b.account_type);
        
        // D'abord trier par sous-catégorie
        const subCategoryCompare = (typeA?.sub_category || '').localeCompare(typeB?.sub_category || '');
        if (subCategoryCompare !== 0) return subCategoryCompare;
        
        // Ensuite trier par nom
        return (a.name || '').localeCompare(b.name || '');
      });
  };

  // Set initial category when tab changes
  useEffect(() => {
    const categories = getCategoriesForTab();
    if (categories.length > 0) {
      setActiveCategory(categories[0]);
    } else {
      setActiveCategory('');
    }
  }, [activeTab, accounts]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreating(true);
      const response = await fetch('http://localhost:8000/create-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(accountForm),
      });
      if (!response.ok) {
        throw new Error('Failed to create account');
      }
      const createdAccount = await response.json();
      
      // Mettre à jour la liste des comptes immédiatement
      setAccounts(prevAccounts => [...prevAccounts, createdAccount]);
      
      // Recharger les types de comptes pour avoir les nouvelles catégories
      await fetchAccountTypes();
      
      setToastMessage(`Compte "${createdAccount.name}" créé avec succès!`);
      setShowAccountModal(false);
      setAccountForm({ name: '', category: '', sub_category: '', is_real: true });
      
      // Rafraîchir la liste complète des comptes en arrière-plan
      fetchAccounts();
    } catch (error) {
      setToastMessage('Erreur lors de la création du compte');
      console.error('Error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccountId) return;

    try {
      setIsCreating(true);
      const response = await fetch(`http://localhost:8000/accounts/${editingAccountId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(accountForm),
      });
      if (!response.ok) {
        throw new Error('Failed to update account');
      }
      const updatedAccount = await response.json();
      
      // Mettre à jour la liste des comptes immédiatement
      setAccounts(prevAccounts => 
        prevAccounts.map(account => 
          account.accountId === editingAccountId ? updatedAccount : account
        )
      );
      
      // Recharger les types de comptes pour avoir les nouvelles catégories
      await fetchAccountTypes();
      
      setToastMessage(`Compte "${updatedAccount.name}" mis à jour avec succès!`);
      setShowAccountModal(false);
      setEditingAccountId(null);
      setAccountForm({ name: '', category: '', sub_category: '', is_real: true });
      
      // Rafraîchir la liste complète des comptes en arrière-plan
      fetchAccounts();
    } catch (error) {
      setToastMessage('Erreur lors de la mise à jour du compte');
      console.error('Error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce compte ?')) return;

    try {
      const response = await fetch(`http://localhost:8000/accounts/${accountId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete account');
      }
      
      // Mettre à jour la liste des comptes immédiatement
      setAccounts(prevAccounts => 
        prevAccounts.filter(account => account.accountId !== accountId)
      );
      
      setToastMessage('Compte supprimé avec succès!');
      
      // Rafraîchir la liste complète des comptes en arrière-plan
      fetchAccounts();
    } catch (error) {
      setToastMessage('Erreur lors de la suppression du compte');
      console.error('Error:', error);
    }
  };

  const openEditModal = (account: Account) => {
    // Trouver le type de compte correspondant
    const accountType = accountTypes.find(type => type.id === account.account_type);
    if (accountType) {
      setAccountForm({
        name: account.name,
        category: accountType.category,
        sub_category: accountType.sub_category,
        is_real: accountType.is_real,
      });
      setEditingAccountId(account.accountId);
      setShowAccountModal(true);
    }
  };

  const openCreateModal = () => {
    // Préremplir le formulaire avec les valeurs de l'onglet actif
    const defaultCategory = getCategoriesForTab()[0] || '';
    const defaultSubCategory = accountTypes
      .find(type => type.category === defaultCategory && type.is_real === (activeTab === 'real'))
      ?.sub_category || '';

    setAccountForm({
      name: '',
      category: defaultCategory,
      sub_category: defaultSubCategory,
      is_real: activeTab === 'real',
    });
    setEditingAccountId(null);
    setShowAccountModal(true);
  };

  return (
    <main className="min-h-screen flex flex-col items-center bg-gradient-to-b from-blue-50 to-white pt-8">
      <div className="text-center space-y-6 w-full max-w-4xl px-4 relative">
        <Link 
          href="/"
          className="absolute top-0 right-0 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow flex items-center gap-2 text-gray-600 hover:text-blue-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Retour
        </Link>

        <h1 className="text-4xl font-bold text-blue-600">
          Paramètres du compte
        </h1>
        <p className="text-xl text-gray-600">
          Gérez vos préférences et paramètres de compte ici.
        </p>

        <div className="mt-8 w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800">Comptes disponibles</h2>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Créer un compte
            </button>
          </div>

          {/* Main Tabs */}
          <div className="border-b border-gray-200 mb-4">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('real')}
                className={`${
                  activeTab === 'real'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Comptes réels
              </button>
              <button
                onClick={() => setActiveTab('virtual')}
                className={`${
                  activeTab === 'virtual'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Comptes virtuels
              </button>
            </nav>
          </div>

          {/* Category Tabs */}
          <div className="border-b border-gray-200 mb-4">
            <nav className="-mb-px flex space-x-4 overflow-x-auto">
              {getCategoriesForTab().map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`${
                    activeCategory === category
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                >
                  {category}
                </button>
              ))}
            </nav>
          </div>

          {loading ? (
            <p className="text-gray-600">Chargement...</p>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : getFilteredAccounts().length === 0 ? (
            <p className="text-gray-600">Aucun compte disponible dans cette catégorie</p>
          ) : (
            <ul className="space-y-3">
              {getFilteredAccounts().map((account, index) => (
                <li
                  key={account.accountId || `account-${index}`}
                  className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-medium text-gray-800">{account.name || 'Compte sans nom'}</span>
                      <span className="text-sm text-gray-500 block">
                        {accountTypes.find(type => type.id === account.account_type)?.sub_category || 'Sous-catégorie inconnue'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(account)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(account.accountId)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Account Creation/Edit Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96">
            <h2 className="text-2xl font-bold mb-4">
              {editingAccountId ? 'Modifier le compte' : 'Créer un nouveau compte'}
            </h2>
            <form onSubmit={editingAccountId ? handleEditAccount : handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom du compte</label>
                <input
                  type="text"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({...accountForm, name: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Catégorie</label>
                <input
                  type="text"
                  value={accountForm.category}
                  onChange={(e) => {
                    const newCategory = e.target.value;
                    setAccountForm({
                      ...accountForm,
                      category: newCategory,
                      sub_category: '' // Reset sub-category when category changes
                    });
                  }}
                  list="categories"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
                <datalist id="categories">
                  {getCategoriesForTab().map((category: string, index: number) => (
                    <option key={index} value={category} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Sous-catégorie</label>
                <input
                  type="text"
                  value={accountForm.sub_category}
                  onChange={(e) => setAccountForm({...accountForm, sub_category: e.target.value})}
                  list="sub-categories"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
                <datalist id="sub-categories">
                  {accountTypes
                    .filter(type => type.category === accountForm.category)
                    .map((type, index) => (
                      <option key={index} value={type.sub_category} />
                    ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Compte réel ?</label>
                <select
                  value={accountForm.is_real ? 'true' : 'false'}
                  onChange={(e) => setAccountForm({...accountForm, is_real: e.target.value === 'true'})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                >
                  <option value="true">Oui</option>
                  <option value="false">Non</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountModal(false);
                    setEditingAccountId(null);
                    setAccountForm({ name: '', category: '', sub_category: '', is_real: true });
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-lg ${
                    isCreating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
                  }`}
                >
                  {isCreating ? 'Enregistrement...' : editingAccountId ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Message */}
      {toastMessage && (
        <div className="fixed top-4 right-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200 animate-fade-in">
          <p className="text-gray-800">{toastMessage}</p>
        </div>
      )}
    </main>
  );
}