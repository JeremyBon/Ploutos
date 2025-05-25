'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [apiResponse, setApiResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const router = useRouter();

  const handleTestClick = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:8000/test');
      const data = await response.json();
      setApiResponse(data.message);
      setShowToast(true);
      // Hide toast after 3 seconds
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

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-blue-600">
          Welcome to Ploutos
        </h1>
        <p className="text-xl text-gray-600">
          Hello World! Your financial journey starts here.
        </p>
        <div className="space-y-4">
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleTestClick}
              disabled={isLoading}
              className={`px-6 py-3 bg-blue-600 text-white rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg ${
                isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Loading...' : 'Test API Connection'}
            </button>
            <button
              onClick={handleAccountSettingsClick}
              className="px-6 py-3 bg-green-600 text-white rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg hover:bg-green-700"
            >
              Paramètres du compte
            </button>
          </div>
          {showToast && (
            <div className="fixed top-4 right-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200 animate-fade-in">
              <p className="text-gray-800">{apiResponse}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
