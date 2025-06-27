'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Account {
  account_id: string;
  name: string;
  category: string;
  sub_category: string;
  current_amount: number;
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
  created_at: string;
  updated_at: string;
  description: string;
  date: string;
  type: string;
  amount: number;
  accountId: string;
  masterAccountName: string;
  TransactionsSlaves: TransactionSlave[];
}

interface MonthlySummaryItem {
  accountId: string;
  account_name: string;
  category: string;
  sub_category: string;
  total_amount: number;
  transaction_count: number;
}

interface MonthlySummary {
  revenues: MonthlySummaryItem[];
  expenses: MonthlySummaryItem[];
  period: {
    year?: number;
    month?: number;
  };
}

export default function Home() {
  const [apiResponse, setApiResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const router = useRouter();

  const fetchAccounts = async () => {
    try {
      const response = await fetch('http://localhost:8000/accounts/current-amounts');
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoadingTransactions(true);
      
      // Calculer les dates de début et fin du mois
      const startDate = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const endDate = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-${lastDay}`;
      
      const response = await fetch(`http://localhost:8000/transactions?date_from=${startDate}&date_to=${endDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      const data = await response.json();
      setTransactions(data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [selectedYear, selectedMonth]);

  // Fonction pour traiter les transactions et créer le résumé mensuel
  const processTransactionsToSummary = (): MonthlySummary => {
    const revenuesMap = new Map<string, MonthlySummaryItem>();
    const expensesMap = new Map<string, MonthlySummaryItem>();

    transactions.forEach(transaction => {
      // Traiter les transactions slaves (détail des comptes)
      transaction.TransactionsSlaves.forEach(slave => {
        // Filtrer seulement les comptes virtuels (is_real = false)
        if (slave.slaveAccountIsReal === false) {
          const accountId = slave.accountId;
          const accountName = slave.slaveAccountName;
          const amount = slave.amount;
          const type = slave.type;

          // Logique de classification basée sur le type :
          // - type "credit" = dépenses (sortie d'argent)
          // - type "debit" = revenus (entrée d'argent)
          const isRevenue = type.toLowerCase() === 'debit'; // Débits = revenus
          const isExpense = type.toLowerCase() === 'credit'; // Crédits = dépenses
          
          if (isRevenue) {
            const targetMap = revenuesMap;
            if (targetMap.has(accountId)) {
              const existing = targetMap.get(accountId)!;
              existing.total_amount += amount;
              existing.transaction_count += 1;
            } else {
              // Récupérer les informations du compte depuis la liste des comptes
              const account = accounts.find(acc => acc.account_id === accountId);
              targetMap.set(accountId, {
                accountId,
                account_name: accountName,
                category: account?.category || 'Inconnu',
                sub_category: account?.sub_category || 'Inconnu',
                total_amount: amount,
                transaction_count: 1
              });
            }
          } else if (isExpense) {
            const targetMap = expensesMap;
            if (targetMap.has(accountId)) {
              const existing = targetMap.get(accountId)!;
              existing.total_amount += amount;
              existing.transaction_count += 1;
            } else {
              // Récupérer les informations du compte depuis la liste des comptes
              const account = accounts.find(acc => acc.account_id === accountId);
              targetMap.set(accountId, {
                accountId,
                account_name: accountName,
                category: account?.category || 'Inconnu',
                sub_category: account?.sub_category || 'Inconnu',
                total_amount: amount,
                transaction_count: 1
              });
            }
          }
        }
      });
    });

    return {
      revenues: Array.from(revenuesMap.values()).sort((a, b) => b.total_amount - a.total_amount),
      expenses: Array.from(expensesMap.values()).sort((a, b) => b.total_amount - a.total_amount),
      period: {
        year: selectedYear,
        month: selectedMonth
      }
    };
  };

  const monthlySummary = processTransactionsToSummary();

  const totalAssets = accounts.reduce((sum, account) => sum + account.current_amount, 0);

  const handleTestClick = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:8000/test');
      const data = await response.json();
      setApiResponse(data.message);
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } catch (error) {
      setApiResponse('Error connecting to API');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccountSettingsClick = () => {
    router.push('/account-settings');
  };

  const handleTransactionsClick = () => {
    router.push('/transactions');
  };

  const getMonthName = (month: number) => {
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return months[month - 1];
  };

  const totalRevenues = monthlySummary.revenues.reduce((sum, item) => sum + item.total_amount, 0);
  const totalExpenses = monthlySummary.expenses.reduce((sum, item) => sum + item.total_amount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold bg-blue-600 text-white px-4 py-2 rounded-lg">Ploutos</h1>
              <button
                onClick={handleAccountSettingsClick}
                className="px-4 py-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                Paramètres du compte
              </button>
              <button
                onClick={handleTransactionsClick}
                className="px-4 py-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                  <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                </svg>
                Transactions
              </button>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleTestClick}
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                {isLoading ? 'Chargement...' : 'Tester API'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Left Sidebar - Patrimoine */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Patrimoine Total</h3>
              {loadingAccounts ? (
                <div className="text-gray-500">Chargement...</div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-blue-600 mb-6">
                    {totalAssets.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </div>
                  
                  <div className="space-y-2">
                    {[...accounts]
                      .sort((a, b) => b.current_amount - a.current_amount)
                      .map((account) => (
                        <div key={account.account_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-gray-800">{account.name}</p>
                            <p className="text-sm text-gray-500">
                              {account.category} - {account.sub_category}
                            </p>
                          </div>
                          <p className={`font-semibold ${
                            account.current_amount >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {account.current_amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </p>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800">Tableau de bord</h2>
              
              {/* Date Selector */}
              <div className="flex justify-center items-center gap-4 mt-4">
                {/* Previous Month Button */}
                <button
                  onClick={() => {
                    if (selectedMonth === 1) {
                      setSelectedMonth(12);
                      setSelectedYear(selectedYear - 1);
                    } else {
                      setSelectedMonth(selectedMonth - 1);
                    }
                  }}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                  title="Mois précédent"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                
                {/* Current Period Display */}
                <div className="px-6 py-2 bg-white border border-gray-300 rounded-lg min-w-[200px] text-center">
                  <div className="font-semibold text-gray-800">{getMonthName(selectedMonth)} {selectedYear}</div>
                </div>
                
                {/* Next Month Button */}
                <button
                  onClick={() => {
                    if (selectedMonth === 12) {
                      setSelectedMonth(1);
                      setSelectedYear(selectedYear + 1);
                    } else {
                      setSelectedMonth(selectedMonth + 1);
                    }
                  }}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                  title="Mois suivant"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                
                {/* Today Button */}
                <button
                  onClick={() => {
                    const now = new Date();
                    setSelectedYear(now.getFullYear());
                    setSelectedMonth(now.getMonth() + 1);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  title="Retour à aujourd'hui"
                >
                  Aujourd'hui
                </button>
              </div>
            </div>

            {/* Monthly Summary Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Revenues Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Revenus</h3>
                  <div className="text-2xl font-bold text-green-600">
                    {totalRevenues.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </div>
                </div>
                
                {loadingTransactions ? (
                  <div className="text-gray-500">Chargement...</div>
                ) : monthlySummary.revenues.length ? (
                  <div className="space-y-3">
                    {monthlySummary.revenues.slice(0, 5).map((item) => (
                      <div key={item.accountId} className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{item.account_name}</p>
                          <p className="text-sm text-gray-500">
                            {item.category} - {item.sub_category}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.transaction_count} transaction{item.transaction_count > 1 ? 's' : ''}
                          </p>
                        </div>
                        <p className="font-semibold text-green-600">
                          {item.total_amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-4">Aucun revenu pour cette période</div>
                )}
              </div>

              {/* Expenses Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Dépenses</h3>
                  <div className="text-2xl font-bold text-red-600">
                    {totalExpenses.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </div>
                </div>
                
                {loadingTransactions ? (
                  <div className="text-gray-500">Chargement...</div>
                ) : monthlySummary.expenses.length ? (
                  <div className="space-y-3">
                    {monthlySummary.expenses.slice(0, 5).map((item) => (
                      <div key={item.accountId} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{item.account_name}</p>
                          <p className="text-sm text-gray-500">
                            {item.category} - {item.sub_category}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.transaction_count} transaction{item.transaction_count > 1 ? 's' : ''}
                          </p>
                        </div>
                        <p className="font-semibold text-red-600">
                          {item.total_amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-4">Aucune dépense pour cette période</div>
                )}
              </div>
            </div>

            {/* Net Income Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">Résultat Net</h3>
                <div className={`text-2xl font-bold ${totalRevenues - totalExpenses >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(totalRevenues - totalExpenses).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
            </div>

            {showToast && (
              <div className="fixed top-4 right-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200 animate-fade-in">
                <p className="text-gray-800">{apiResponse}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
