'use client';

import { useState } from 'react';

export default function Home() {
  const [apiResponse, setApiResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleTestClick = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:8000/api/test');
      const data = await response.json();
      setApiResponse(data.message);
    } catch (error) {
      setApiResponse('Error connecting to API');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
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
          <button
            onClick={handleTestClick}
            disabled={isLoading}
            className={`px-6 py-3 bg-blue-600 text-white rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg ${
              isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Loading...' : 'Test API Connection'}
          </button>
          {apiResponse && (
            <p className="text-2xl font-bold text-blue-600">
              {apiResponse}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
