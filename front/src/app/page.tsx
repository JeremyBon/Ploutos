'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Title,
  ChartTooltip,
  ChartLegend
);
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

interface DetailedTransaction {
  transactionId: string;
  description: string;
  date: string;
  amount: number;
  accountName: string;
  accountId: string;
  category: string;
  subCategory: string;
  type: string;
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingTransaction, setEditingTransaction] = useState<DetailedTransaction | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    description: '',
    accountId: '',
    category: '',
    subCategory: ''
  });
  const [editSlaves, setEditSlaves] = useState<TransactionSlave[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [subCategoryError, setSubCategoryError] = useState(false);
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
      // Calculer la plage de dates: du mois sélectionné -3 jusqu'au mois sélectionné +2
      const pad = (n: number) => n.toString().padStart(2, '0');
      const start = new Date(selectedYear, selectedMonth - 1 - 3, 1); // month index 0-based
      const end = new Date(selectedYear, selectedMonth - 1 + 2 + 1, 0); // dernier jour du mois +2
      const startDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
      const endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${end.getDate()}`;

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
        // Filtrer uniquement les transactions du mois sélectionné
        const slaveDate = new Date(slave.date);
        const slaveYear = slaveDate.getFullYear();
        const slaveMonth = slaveDate.getMonth() + 1;
        if (slaveYear !== selectedYear || slaveMonth !== selectedMonth) return;
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

  // Fonction pour obtenir les transactions détaillées d'une catégorie
  const getDetailedTransactionsForCategory = (categoryId: string, type: 'revenue' | 'expense'): DetailedTransaction[] => {
    const detailedTransactions: DetailedTransaction[] = [];

    transactions.forEach(transaction => {
      transaction.TransactionsSlaves.forEach(slave => {
        // Filtrer uniquement les transactions du mois sélectionné
        const slaveDate = new Date(slave.date);
        const slaveYear = slaveDate.getUTCFullYear();
        const slaveMonth = slaveDate.getUTCMonth() + 1;
        if (slaveYear !== selectedYear || slaveMonth !== selectedMonth) return;

        // Filtrer seulement les comptes virtuels et la catégorie sélectionnée
        if (slave.slaveAccountIsReal === false && slave.accountId === categoryId) {
          const account = accounts.find(acc => acc.account_id === categoryId);
          const isRevenue = slave.type.toLowerCase() === 'debit';
          const isExpense = slave.type.toLowerCase() === 'credit';

          // Vérifier que le type correspond
          if ((type === 'revenue' && isRevenue) || (type === 'expense' && isExpense)) {
            detailedTransactions.push({
              transactionId: transaction.transactionId,
              description: transaction.description,
              date: slave.date,
              amount: slave.amount,
              accountName: slave.slaveAccountName,
              accountId: slave.accountId,
              category: account?.category || 'Inconnu',
              subCategory: account?.sub_category || 'Inconnu',
              type: slave.type
            });
          }
        }
      });
    });

    return detailedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Fonction pour gérer le clic sur une catégorie
  const handleCategoryClick = (categoryId: string) => {
    const newExpandedCategories = new Set(expandedCategories);
    if (newExpandedCategories.has(categoryId)) {
      newExpandedCategories.delete(categoryId);
    } else {
      newExpandedCategories.add(categoryId);
    }
    setExpandedCategories(newExpandedCategories);
  };

  // Fonction pour ouvrir le modal d'édition
  const handleEditTransaction = (transaction: DetailedTransaction) => {
    setEditingTransaction(transaction);
    
    // Récupérer la transaction maître pour avoir les bonnes informations
    const masterTransaction = transactions.find(t => t.transactionId === transaction.transactionId);
    
    // Récupérer le compte maître pour avoir la catégorie et sous-catégorie actuelles
    const masterAccount = masterTransaction ? accounts.find(acc => acc.account_id === masterTransaction.accountId) : null;
    
    setEditForm({
      description: transaction.description,
      accountId: masterTransaction?.accountId || transaction.accountId, // Utiliser l'ID du compte maître
      category: masterAccount?.category || transaction.category, // Utiliser la catégorie du compte maître
      subCategory: masterAccount?.sub_category || transaction.subCategory // Utiliser la sous-catégorie du compte maître
    });
    
    // Récupérer tous les slaves de cette transaction
    if (masterTransaction) {
      setEditSlaves([...masterTransaction.TransactionsSlaves]);
    } else {
      setEditSlaves([]);
    }
    
    setShowEditModal(true);
  };

  // Fonction pour fermer le modal d'édition
  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingTransaction(null);
    setEditForm({ description: '', accountId: '', category: '', subCategory: '' });
    setEditSlaves([]);
    setCategoryError(false);
    setSubCategoryError(false);
  };

  // Fonction pour modifier un slave
  const handleSlaveChange = (index: number, field: keyof TransactionSlave, value: string | number) => {
    const newSlaves = [...editSlaves];
    newSlaves[index] = { ...newSlaves[index], [field]: value };
    setEditSlaves(newSlaves);
  };

  // Fonction pour supprimer un slave
  const handleRemoveSlave = (index: number) => {
    const newSlaves = editSlaves.filter((_, i) => i !== index);
    setEditSlaves(newSlaves);
  };

  // Fonction pour gérer le changement de catégorie
  const handleCategoryChange = (newCategory: string) => {
    const currentSubCategory = editForm.subCategory;
    const availableSubCategories = Array.from(new Set(
      accounts
        .filter(acc => acc.category === newCategory)
        .map(acc => acc.sub_category)
    ));
    
    // Vérifier si la sous-catégorie actuelle est valide pour la nouvelle catégorie
    const isSubCategoryValid = availableSubCategories.includes(currentSubCategory);
    
    setEditForm({
      ...editForm,
      category: newCategory,
      subCategory: isSubCategoryValid ? currentSubCategory : ''
    });
    
    setCategoryError(false);
    setSubCategoryError(!isSubCategoryValid && currentSubCategory !== '');
  };

  // Fonction pour gérer le changement de sous-catégorie
  const handleSubCategoryChange = (newSubCategory: string) => {
    setEditForm({
      ...editForm,
      subCategory: newSubCategory
    });
    setSubCategoryError(false);
  };

  // Fonction pour vérifier si la sauvegarde est possible
  const canSave = () => {
    if (!editForm.category || !editForm.subCategory) return false;
    
    const availableSubCategories = Array.from(new Set(
      accounts
        .filter(acc => acc.category === editForm.category)
        .map(acc => acc.sub_category)
    ));
    
    return availableSubCategories.includes(editForm.subCategory);
  };

  // Fonction pour ajouter un nouveau slave
  const handleAddSlave = () => {
    const newSlave: TransactionSlave = {
      slaveId: `temp-${Date.now()}`, // ID temporaire
      type: 'debit',
      amount: 0,
      date: new Date().toISOString(),
      accountId: accounts[0]?.account_id || '',
      masterId: editingTransaction?.transactionId || '',
      slaveAccountName: accounts[0]?.name || '',
      slaveAccountIsReal: false
    };
    setEditSlaves([...editSlaves, newSlave]);
  };

  // Fonction pour sauvegarder les modifications
  const handleSaveTransaction = async () => {
    if (!editingTransaction) return;

    setIsSaving(true);
    try {
      // Mettre à jour la transaction principale
      const updateResponse = await fetch(`http://localhost:8000/transactions/${editingTransaction.transactionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: editForm.description,
          date: new Date(editingTransaction.date).toISOString() // Garder la date originale
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update transaction');
      }

      // Mettre à jour les slaves transactions
      const slaveUpdateResponse = await fetch(`http://localhost:8000/transactions/${editingTransaction.transactionId}/slaves`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slaves: editSlaves.map(slave => ({
            slaveId: slave.slaveId,
            type: slave.type,
            amount: slave.amount,
            date: slave.date,
            accountId: slave.accountId
          }))
        }),
      });

      if (!slaveUpdateResponse.ok) {
        throw new Error('Failed to update transaction slave');
      }

      // Recharger les transactions pour mettre à jour l'affichage
      await fetchTransactions();
      
      // Fermer le modal
      handleCloseEditModal();
      
      // Afficher un message de succès
      setApiResponse('Transaction mise à jour avec succès');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);

    } catch (error) {
      console.error('Error updating transaction:', error);
      setApiResponse('Erreur lors de la mise à jour de la transaction');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const totalRevenues = monthlySummary.revenues.reduce((sum, item) => sum + item.total_amount, 0);
  const totalExpenses = monthlySummary.expenses.reduce((sum, item) => sum + item.total_amount, 0);

  // Série mensuelle pour la plage selectedMonth-3 .. selectedMonth+2
  const monthlyRangeSeries = useMemo(() => {
    // Construire les mois de la plage
    const months: { year: number; month: number; label: string }[] = [];
    for (let offset = -3; offset <= 2; offset++) {
      const d = new Date(selectedYear, selectedMonth - 1 + offset, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: `${getMonthName(d.getMonth() + 1).substr(0,3)} ${d.getFullYear()}` });
    }

    // Initialiser les valeurs à 0
    const revenusArr = Array(months.length).fill(0);
    const depensesArr = Array(months.length).fill(0);

    // Parcourir toutes les transactions chargées (qui couvrent déjà la plage) et accumuler par mois
    transactions.forEach(t => {
      t.TransactionsSlaves.forEach(slave => {
        // On ne veut que les comptes virtuels
        if (slave.slaveAccountIsReal === false) {
          const sd = new Date(slave.date);
          const sy = sd.getFullYear();
          const sm = sd.getMonth() + 1;
          const idx = months.findIndex(m => m.year === sy && m.month === sm);
          if (idx === -1) return;
          const isRevenue = slave.type.toLowerCase() === 'debit';
          const isExpense = slave.type.toLowerCase() === 'credit';
          if (isRevenue) revenusArr[idx] += slave.amount;
          if (isExpense) depensesArr[idx] += slave.amount;
        }
      });
    });

    return {
      labels: months.map(m => m.label),
      revenusArr,
      depensesArr
    };
  }, [transactions, selectedMonth, selectedYear]);

  const monthlyChartData = useMemo(() => ({
    labels: monthlyRangeSeries.labels,
    datasets: [
      { label: 'Revenus', data: monthlyRangeSeries.revenusArr, backgroundColor: '#16a34a' },
      { label: 'Dépenses', data: monthlyRangeSeries.depensesArr, backgroundColor: '#dc2626' }
    ]
  }), [monthlyRangeSeries]);

  // Calcul du patrimoine total par mois (approx) en utilisant les transactions sur les comptes réels
  const patrimonySeries = useMemo(() => {
    // Reuse months from monthlyRangeSeries
    const labels = monthlyRangeSeries.labels;
    const n = labels.length;
    const realDelta = Array(n).fill(0);

    // Accumuler les deltas pour les comptes réels
    transactions.forEach(t => {
      t.TransactionsSlaves.forEach(slave => {
        if (slave.slaveAccountIsReal === true) {
          const sd = new Date(slave.date);
          const sy = sd.getFullYear();
          const sm = sd.getMonth() + 1;
          const idx = monthlyRangeSeries.labels.findIndex((_, i) => {
            // match by comparing year/month from labels: rebuild month objects
            const d = new Date(selectedYear, selectedMonth - 1 - 3 + i, 1);
            return d.getFullYear() === sy && d.getMonth() + 1 === sm;
          });
          if (idx === -1) return;
          const isRevenue = slave.type.toLowerCase() === 'debit';
          const isExpense = slave.type.toLowerCase() === 'credit';
          const delta = isRevenue ? slave.amount : (isExpense ? -slave.amount : 0);
          realDelta[idx] += delta;
        }
      });
    });

    // cumulative
    const cumulative = realDelta.map((_, i) => realDelta.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const lastCum = cumulative[n - 1] || 0;
    const baseline = totalAssets - lastCum; // align last point with current totalAssets
    const patrimony = cumulative.map(c => baseline + c);
    return { labels, patrimony };
  }, [transactions, monthlyRangeSeries, selectedMonth, selectedYear, totalAssets]);

  const patrimonyChartData = useMemo(() => ({
    labels: patrimonySeries.labels,
    datasets: [
      {
        label: 'Patrimoine total',
        data: patrimonySeries.patrimony,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.1)',
        tension: 0.3,
        fill: true
      }
    ]
  }), [patrimonySeries]);

  // Préparer les données pour le graphique : revenues/expenses par catégorie (limitées aux top 8 catégories)
  const chartData = useMemo(() => {
    // Combiner catégories des revenus et dépenses
    const map = new Map<string, { category: string; revenues: number; expenses: number }>();

    monthlySummary.revenues.forEach(item => {
      const key = item.category || item.account_name || item.accountId;
      if (!map.has(key)) map.set(key, { category: key, revenues: 0, expenses: 0 });
      map.get(key)!.revenues += item.total_amount;
    });

    monthlySummary.expenses.forEach(item => {
      const key = item.category || item.account_name || item.accountId;
      if (!map.has(key)) map.set(key, { category: key, revenues: 0, expenses: 0 });
      map.get(key)!.expenses += item.total_amount;
    });

    // Convertir en tableau trié par somme décroissante
    const arr = Array.from(map.values()).map(v => ({
      ...v,
      total: v.revenues + v.expenses
    })).sort((a, b) => b.total - a.total);

    // Limiter le nombre de catégories affichées
    return arr.slice(0, 8).map(v => ({ name: v.category, Revenus: v.revenues, Depenses: v.expenses }));
  }, [monthlySummary]);

  // Préparer les données et options pour Chart.js
  const chartJsData = useMemo(() => {
    const labels = chartData.map(d => d.name);
    return {
      labels,
      datasets: [
        {
          label: 'Revenus',
          data: chartData.map(d => d.Revenus),
          backgroundColor: '#16a34a'
        },
        {
          label: 'Dépenses',
          data: chartData.map(d => d.Depenses),
          backgroundColor: '#dc2626'
        }
      ]
    };
  }, [chartData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const value = context.raw || 0;
            return value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
          }
        }
      }
    },
    scales: {
      x: { ticks: { maxRotation: 0, autoSkip: false } },
      y: { beginAtZero: true }
    }
  }), []);

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
                  Aujourd&apos;hui
                </button>
              </div>
            </div>

            {/* Monthly Summary Cards and Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
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
                      <div key={item.accountId}>
                        <div 
                          className="flex justify-between items-center p-3 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                          onClick={() => handleCategoryClick(item.accountId)}
                        >
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
                        
                        {/* Détails des transactions */}
                        {expandedCategories.has(item.accountId) && (
                          <div className="mt-2 ml-4 space-y-2">
                            {(() => {
                              const detailedTransactions = getDetailedTransactionsForCategory(item.accountId, 'revenue');
                              return detailedTransactions.length > 0 ? (
                                detailedTransactions.map((transaction, index) => (
                                  <div 
                                    key={`${transaction.transactionId}-${index}`} 
                                    className="flex justify-between items-center p-3 bg-white border border-green-200 rounded-lg cursor-pointer hover:bg-green-50 transition-colors"
                                    onClick={() => handleEditTransaction(transaction)}
                                  >
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-800 text-sm">{transaction.description}</p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {new Date(transaction.date).toLocaleDateString('fr-FR')}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-semibold text-green-600 text-sm">
                                        {transaction.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                      </p>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-2 text-gray-500 text-sm">
                                  Aucune transaction trouvée
                                </div>
                              );
                            })()}
                          </div>
                        )}
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
                      <div key={item.accountId}>
                        <div 
                          className="flex justify-between items-center p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
                          onClick={() => handleCategoryClick(item.accountId)}
                        >
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
                        
                        {/* Détails des transactions */}
                        {expandedCategories.has(item.accountId) && (
                          <div className="mt-2 ml-4 space-y-2">
                            {(() => {
                              const detailedTransactions = getDetailedTransactionsForCategory(item.accountId, 'expense');
                              return detailedTransactions.length > 0 ? (
                                detailedTransactions.map((transaction, index) => (
                                  <div 
                                    key={`${transaction.transactionId}-${index}`} 
                                    className="flex justify-between items-center p-3 bg-white border border-red-200 rounded-lg cursor-pointer hover:bg-red-50 transition-colors"
                                    onClick={() => handleEditTransaction(transaction)}
                                  >
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-800 text-sm">{transaction.description}</p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {new Date(transaction.date).toLocaleDateString('fr-FR')}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-semibold text-red-600 text-sm">
                                        {transaction.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                      </p>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-2 text-gray-500 text-sm">
                                  Aucune transaction trouvée
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-4">Aucune dépense pour cette période</div>
                )}
              </div>

              {/* Chart - à droite */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 lg:col-span-1">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Revenus / Dépenses par catégorie</h3>
                </div>
                {chartData.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">Aucune donnée pour le graphique</div>
                ) : (
                  <div style={{ width: '100%', height: 300 }}>
                    <div className="w-full h-full">
                      <Bar data={chartJsData} options={chartOptions} />
                    </div>
                  </div>
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

            {/* Monthly Revenues/Expenses chart for selected range */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Revenus / Dépenses (par mois)</h3>
                <div className="text-sm text-gray-500">Période: {monthlyRangeSeries.labels[0]} → {monthlyRangeSeries.labels[monthlyRangeSeries.labels.length - 1]}</div>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <div className="w-full h-full">
                  <Bar data={monthlyChartData} options={chartOptions} />
                </div>
              </div>
            </div>

            {/* Patrimony line chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Patrimoine total (historique)</h3>
                <div className="text-sm text-gray-500">Point par mois</div>
              </div>
              <div style={{ width: '100%', height: 260 }}>
                <div className="w-full h-full">
                  <Line data={patrimonyChartData} options={{...chartOptions, plugins: {...chartOptions.plugins, legend: { display: false }}}} />
                </div>
              </div>
            </div>

            {showToast && (
              <div className="fixed top-4 right-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200 animate-fade-in">
                <p className="text-gray-800">{apiResponse}</p>
              </div>
            )}

            {/* Modal d'édition des transactions */}
            {showEditModal && editingTransaction && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
                  <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800">
                      Modifier la transaction
                    </h3>
                    <button
                      onClick={handleCloseEditModal}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto max-h-[60vh]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Colonne gauche - Transaction maître */}
                      <div className="space-y-4">
                        <div className="border-b border-gray-200 pb-3">
                          <h4 className="text-lg font-semibold text-gray-800 mb-2">Transaction maître</h4>
                          <p className="text-sm text-gray-600">Informations générales de la transaction principale</p>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Description
                          </label>
                          <input
                            type="text"
                            value={editForm.description}
                            onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Description de la transaction"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Compte principal
                          </label>
                          <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                            {(() => {
                              const selectedAccount = accounts.find(acc => acc.account_id === editForm.accountId);
                              return selectedAccount ? 
                                `${selectedAccount.name} (${selectedAccount.category} - ${selectedAccount.sub_category})` : 
                                'Compte non trouvé';
                            })()}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Catégorie
                          </label>
                          <select
                            value={editForm.category}
                            onChange={(e) => handleCategoryChange(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              categoryError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                            }`}
                          >
                            <option value="">Sélectionner une catégorie</option>
                            {Array.from(new Set(accounts.map(acc => acc.category))).sort().map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                          {categoryError && (
                            <p className="text-red-600 text-xs mt-1">⚠️ Cette catégorie n&apos;est pas valide</p>
                          )}
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Sous-catégorie
                          </label>
                          <select
                            value={editForm.subCategory}
                            onChange={(e) => handleSubCategoryChange(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              subCategoryError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                            }`}
                            disabled={!editForm.category}
                          >
                            <option value="">Sélectionner une sous-catégorie</option>
                            {editForm.category && Array.from(new Set(
                              accounts
                                .filter(acc => acc.category === editForm.category)
                                .map(acc => acc.sub_category)
                            )).sort().map((subCategory) => (
                              <option key={subCategory} value={subCategory}>
                                {subCategory}
                              </option>
                            ))}
                          </select>
                          {subCategoryError && (
                            <p className="text-red-600 text-xs mt-1">⚠️ Cette sous-catégorie n&apos;est pas valide pour la catégorie sélectionnée</p>
                          )}
                        </div>
                        
                        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                          <h5 className="font-medium text-blue-800 mb-2">Informations de la transaction maître</h5>
                          <div className="space-y-1">
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">ID:</span> <code className="bg-blue-100 px-1 rounded text-xs">{editingTransaction.transactionId}</code>
                            </p>
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">Date:</span> {new Date(editingTransaction.date).toLocaleDateString('fr-FR')}
                            </p>
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">Montant total:</span> {editSlaves.reduce((sum, slave) => sum + slave.amount, 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </p>
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">Type:</span> {editingTransaction.type}
                            </p>
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">Nombre de transactions slaves:</span> {editSlaves.length}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Colonne droite - Transactions slaves */}
                      <div className="space-y-4">
                        <div className="border-b border-gray-200 pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-lg font-semibold text-gray-800 mb-2">Transactions slaves</h4>
                              <p className="text-sm text-gray-600">Détail des transactions associées</p>
                            </div>
                            <button
                              onClick={handleAddSlave}
                              className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                            >
                              + Ajouter
                            </button>
                          </div>
                        </div>
                        
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                          {editSlaves.map((slave, index) => (
                            <div key={slave.slaveId} className="border border-green-200 rounded-lg p-4 bg-green-50">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 bg-green-600 text-white text-xs rounded-full flex items-center justify-center font-medium">
                                    {index + 1}
                                  </div>
                                  <h5 className="font-medium text-green-800">Transaction slave {index + 1}</h5>
                                </div>
                                <button
                                  onClick={() => handleRemoveSlave(index)}
                                  className="text-red-600 hover:text-red-800 transition-colors p-1 rounded"
                                  title="Supprimer cette transaction"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Compte
                                  </label>
                                  <select
                                    value={slave.accountId}
                                    onChange={(e) => handleSlaveChange(index, 'accountId', e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    {accounts.map((account) => (
                                      <option key={account.account_id} value={account.account_id}>
                                        {account.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Type
                                  </label>
                                  <select
                                    value={slave.type}
                                    onChange={(e) => handleSlaveChange(index, 'type', e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="debit">Débit</option>
                                    <option value="credit">Crédit</option>
                                  </select>
                                </div>
                                
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Montant (€)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={slave.amount}
                                    onChange={(e) => handleSlaveChange(index, 'amount', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                                
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Date
                                  </label>
                                  <input
                                    type="date"
                                    value={slave.date.split('T')[0]}
                                    onChange={(e) => handleSlaveChange(index, 'date', new Date(e.target.value).toISOString())}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {editSlaves.length === 0 && (
                            <div className="text-center py-8 text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <p className="text-sm font-medium text-gray-600">Aucune transaction slave</p>
                              <p className="text-xs text-gray-500 mt-1">Cliquez sur &quot;Ajouter&quot; pour créer une nouvelle transaction slave</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
                    <button
                      onClick={handleCloseEditModal}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                      disabled={isSaving}
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSaveTransaction}
                      disabled={isSaving || !canSave()}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        isSaving || !canSave() 
                          ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
