'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Transaction {
  transactionId: string;
  accountId: string;
  amount: number;
  description: string;
  date: string;
  created_at: string;
  updated_at: string;
}

interface Account {
  accountId: string;
  name: string;
  account_type: string;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [transactionForm, setTransactionForm] = useState({
    accountId: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      const response = await fetch('http://localhost:8000/transactions');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTransactions(data);
      setError(null);
    } catch (error) {
      console.error('Erreur lors de la récupération des transactions:', error);
      setError('Impossible de charger les transactions. Veuillez réessayer plus tard.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch('http://localhost:8000/accounts');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error('Erreur lors de la récupération des comptes:', error);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchAccounts();
  }, []);

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreating(true);
      const response = await fetch('http://localhost:8000/create-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...transactionForm,
          amount: parseFloat(transactionForm.amount),
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to create transaction');
      }
      const createdTransaction = await response.json();
      setToastMessage(`Transaction créée avec succès!`);
      setShowTransactionModal(false);
      setTransactionForm({
        accountId: '',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
      });
      await fetchTransactions();
    } catch (error) {
      setToastMessage('Erreur lors de la création de la transaction');
      console.error('Error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransactionId) return;

    try {
      setIsCreating(true);
      const response = await fetch(`http://localhost:8000/transactions/${editingTransactionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...transactionForm,
          amount: parseFloat(transactionForm.amount),
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to update transaction');
      }
      const updatedTransaction = await response.json();
      setToastMessage(`Transaction mise à jour avec succès!`);
      setShowTransactionModal(false);
      setEditingTransactionId(null);
      setTransactionForm({
        accountId: '',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
      });
      await fetchTransactions();
    } catch (error) {
      setToastMessage('Erreur lors de la mise à jour de la transaction');
      console.error('Error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette transaction ?')) return;

    try {
      const response = await fetch(`http://localhost:8000/transactions/${transactionId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete transaction');
      }
      setToastMessage('Transaction supprimée avec succès!');
      await fetchTransactions();
    } catch (error) {
      setToastMessage('Erreur lors de la suppression de la transaction');
      console.error('Error:', error);
    }
  };

  const openEditModal = (transaction: Transaction) => {
    setTransactionForm({
      accountId: transaction.accountId,
      amount: transaction.amount.toString(),
      description: transaction.description,
      date: new Date(transaction.date).toISOString().split('T')[0],
    });
    setEditingTransactionId(transaction.transactionId);
    setShowTransactionModal(true);
  };

  const openCreateModal = () => {
    setTransactionForm({
      accountId: '',
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
    });
    setEditingTransactionId(null);
    setShowTransactionModal(true);
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
          Transactions
        </h1>
        <p className="text-xl text-gray-600">
          Gérez vos transactions financières ici.
        </p>

        <div className="mt-8 w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800">Transactions disponibles</h2>
          </div>

          {loading ? (
            <p className="text-gray-600">Chargement...</p>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-gray-600">Aucune transaction disponible</p>
          ) : (
            <ul className="space-y-3">
              {transactions.map((transaction) => (
                <li
                  key={transaction.transactionId}
                  className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-medium text-gray-800">
                        {transaction.description}
                      </span>
                      <div className="text-sm text-gray-500">
                        <p>Montant: {transaction.amount}€</p>
                        <p>Date: {new Date(transaction.date).toLocaleDateString()}</p>
                        <p>
                          Compte: {accounts.find(acc => acc.accountId === transaction.accountId)?.name || 'Compte inconnu'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(transaction)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteTransaction(transaction.transactionId)}
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

      {/* Transaction Creation/Edit Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96">
            <h2 className="text-2xl font-bold mb-4">
              {editingTransactionId ? 'Modifier la transaction' : 'Créer une nouvelle transaction'}
            </h2>
            <form onSubmit={editingTransactionId ? handleEditTransaction : handleCreateTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Compte</label>
                <select
                  value={transactionForm.accountId}
                  onChange={(e) => setTransactionForm({...transactionForm, accountId: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                >
                  <option value="">Sélectionner un compte</option>
                  {accounts.map((account) => (
                    <option key={account.accountId} value={account.accountId}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Montant</label>
                <input
                  type="number"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({...transactionForm, amount: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <input
                  type="text"
                  value={transactionForm.description}
                  onChange={(e) => setTransactionForm({...transactionForm, description: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Date</label>
                <input
                  type="date"
                  value={transactionForm.date}
                  onChange={(e) => setTransactionForm({...transactionForm, date: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowTransactionModal(false);
                    setEditingTransactionId(null);
                    setTransactionForm({
                      accountId: '',
                      amount: '',
                      description: '',
                      date: new Date().toISOString().split('T')[0],
                    });
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
                  {isCreating ? 'Enregistrement...' : editingTransactionId ? 'Modifier' : 'Créer'}
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