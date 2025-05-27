'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Transaction {
  transactionId: string;
  accountId: string;
  amount: number;
  description: string;
  date: string;
  type: string;
  created_at: string;
  updated_at: string;
}

interface Account {
  accountId: string;
  name: string;
  account_type: string;
}

const API_URL = 'http://localhost:8000';

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`${API_URL}/transactions`, {
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
      setTransactions(data);
      setError(null);
    } catch (error) {
      setError(`Unable to load transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch(`${API_URL}/accounts/`, {
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
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([fetchTransactions(), fetchAccounts()]);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
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
          Back
        </Link>

        <h1 className="text-4xl font-bold text-blue-600">
          Transactions
        </h1>
        <p className="text-xl text-gray-600">
          Manage your financial transactions here.
        </p>

        <div className="mt-8 w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800">Available Transactions</h2>
          </div>

          {loading ? (
            <p className="text-gray-600">Loading...</p>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-gray-600">No transactions available</p>
          ) : (
            <ul className="space-y-3">
              {transactions.map((transaction) => (
                <li
                  key={transaction.transactionId}
                  className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <span className="text-lg font-medium text-gray-800">
                        {transaction.description}
                      </span>
                      <p className="text-sm text-gray-500">
                        {new Date(transaction.date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="text-gray-800">
                        {accounts.find(acc => acc.accountId === transaction.accountId)?.name || 'Unknown account'}
                      </p>
                    </div>
                    <div className="flex-1 text-right">
                      <p className={`text-lg font-semibold ${
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
      </div>
    </main>
  );
} 