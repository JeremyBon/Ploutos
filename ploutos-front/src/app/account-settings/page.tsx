'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Account {
  accountId: string;
  name: string;
  created_at: string;
  updated_at: string;
  account_type: string;

  // Add other fields as needed
}

export default function AccountSettings() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

    fetchAccounts();
  }, []);

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

        <div className="mt-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Comptes disponibles</h2>
          {loading ? (
            <p className="text-gray-600">Chargement...</p>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-gray-600">Aucun compte disponible</p>
          ) : (
            <ul className="space-y-3">
              {accounts.map((account, index) => (
                <li
                  key={account.accountId || `account-${index}`}
                  className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-medium text-gray-800">{account.name || 'Compte sans nom'}</span>
                    <span className="text-sm text-gray-500">Type: {account.account_type}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}