'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

const API_URL = 'http://localhost:8000';

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('2023-04');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editedTransaction, setEditedTransaction] = useState<Transaction | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchTransactions = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedMonth) {
        const [year, month] = selectedMonth.split('-');
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month}-${lastDay}`;
        params.append('date_from', startDate);
        params.append('date_to', endDate);
      }

      const response = await fetch(`${API_URL}/transactions?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Transactions data:', data);
      setTransactions(data);
      setError(null);
    } catch (error) {
      setError(`Unable to load transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchTransactions();
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, [selectedMonth]);

  const handleViewDetails = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setEditedTransaction(transaction);
    setIsModalOpen(true);
    setHasChanges(false);
  };

  const handleTransactionChange = (field: keyof Transaction, value: string) => {
    if (!editedTransaction) return;
    setEditedTransaction({...editedTransaction, [field]: value});
    setHasChanges(true);
  };

  const handleCancel = () => {
    if (!selectedTransaction) return;
    setEditedTransaction(selectedTransaction);
    setHasChanges(false);
  };

  const handleSave = async () => {
    if (!editedTransaction) return;

    try {
      const response = await fetch(`${API_URL}/transactions/${editedTransaction.transactionId}`, {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editedTransaction),
      });

      if (!response.ok) {
        throw new Error('Failed to update transaction');
      }

      // Update the transaction in the local state
      setTransactions(transactions.map(t => 
        t.transactionId === editedTransaction.transactionId ? editedTransaction : t
      ));
      
      setSelectedTransaction(editedTransaction);
      setIsModalOpen(false);
    } catch (error) {
      setError(`Failed to update transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
    setEditedTransaction(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Navigation Bar */}
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
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                Retour
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800">Transactions</h2>
          <div className="flex items-center">
            <label htmlFor="month" className="sr-only">Sélectionner le mois</label>
            <input
              type="month"
              id="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
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
          ) : transactions.length === 0 ? (
            <p className="text-gray-600">Aucune transaction disponible</p>
          ) : (
            <ul className="space-y-3">
              {transactions.map((transaction) => (
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
                        {new Date(transaction.date).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="flex-1 text-center min-w-[120px]">
                      <div className="flex items-center justify-center gap-2">
                        <p className="text-sm text-gray-800">
                          {transaction.masterAccountName || 'Compte inconnu'}
                        </p>
                        {transaction.TransactionsSlaves && transaction.TransactionsSlaves.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {transaction.TransactionsSlaves.map((slave) => (
                              <div 
                                key={slave.slaveId} 
                                className="px-2 py-1 bg-blue-100 rounded text-xs text-blue-800 border border-blue-200 whitespace-nowrap"
                              >
                                {slave.slaveAccountName || '⚠️ Compte non récupéré'}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 text-right min-w-[100px]">
                      <p className={`text-base font-semibold ${
                        transaction.type === 'debit' 
                          ? 'text-red-600' 
                          : transaction.type === 'credit' 
                            ? 'text-green-600' 
                            : 'text-gray-800'
                      }`}>
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
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <input
                  type="text"
                  value={editedTransaction?.description}
                  onChange={(e) => handleTransactionChange('description', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Date</label>
                <input
                  type="date"
                  value={editedTransaction?.date.split('T')[0]}
                  onChange={(e) => handleTransactionChange('date', e.target.value)}
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
                  {selectedTransaction.masterAccountName || '⚠️ Account not retrieved'}
                </p>
              </div>
              {selectedTransaction.TransactionsSlaves && selectedTransaction.TransactionsSlaves.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Transactions associées</p>
                  <div className="space-y-2">
                    {selectedTransaction.TransactionsSlaves.map((slave) => (
                      <div key={slave.slaveId} className="bg-gray-50 p-3 rounded-md">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {selectedTransaction.masterAccountName || '⚠️ Account not retrieved'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(slave.date).toLocaleDateString('fr-FR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </p>
                          </div>
                          <p className={`text-sm font-semibold ${
                            slave.type === 'debit' ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {slave.amount}€
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
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