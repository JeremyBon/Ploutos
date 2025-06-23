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

export default function Home() {
  const [apiResponse, setApiResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
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

  useEffect(() => {
    fetchAccounts();
  }, []);

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
