"use client";

import { useState, useEffect, useMemo } from "react";
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
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

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
import Navigation from "@/components/Navigation";
import { API_URL } from "@/config/api";

interface Account {
  account_id: string;
  name: string;
  category: string;
  sub_category: string;
  current_amount: number;
  is_real: boolean;
  active: boolean;
}

interface VirtualAccount {
  accountId: string;
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
  active: boolean;
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
  categoryKey: string;
  category: string;
  total_amount: number;
  transaction_count: number;
  latest_date: string;
  accounts: {
    accountId: string;
    account_name: string;
    sub_category: string;
    total_amount: number;
    transaction_count: number;
  }[];
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allAccounts, setAllAccounts] = useState<VirtualAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth() + 1
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [editingTransaction, setEditingTransaction] =
    useState<DetailedTransaction | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    description: "",
    accountId: "",
    category: "",
    subCategory: "",
  });
  const [editSlaves, setEditSlaves] = useState<TransactionSlave[]>([]);
  const [slaveCategoryFilters, setSlaveCategoryFilters] = useState<
    Record<number, string>
  >({});
  const [slaveAccountTypes, setSlaveAccountTypes] = useState<
    Record<number, "virtual" | "real">
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [sortBy, setSortBy] = useState<"amount" | "date">("amount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchAccounts = async () => {
    try {
      const response = await fetch(`${API_URL}/accounts/current-amounts`);
      if (!response.ok) {
        throw new Error("Failed to fetch accounts");
      }
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchAllAccounts = async () => {
    try {
      const response = await fetch(`${API_URL}/accounts`);
      if (!response.ok) {
        throw new Error("Failed to fetch all accounts");
      }
      const data = await response.json();
      setAllAccounts(data);
    } catch (error) {
      console.error("Error fetching all accounts:", error);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoadingTransactions(true);
      // Calculer la plage de dates: du mois sélectionné -3 jusqu'au mois sélectionné +2
      const pad = (n: number) => n.toString().padStart(2, "0");
      const start = new Date(selectedYear, selectedMonth - 1 - 3, 1); // month index 0-based
      const end = new Date(selectedYear, selectedMonth - 1 + 2 + 1, 0); // dernier jour du mois +2
      const startDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
      const endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${end.getDate()}`;

      const response = await fetch(
        `${API_URL}/transactions?date_from=${startDate}&date_to=${endDate}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch transactions");
      }
      const data = await response.json();
      setTransactions(data);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchAllAccounts();
  }, []);

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth]);

  // Fonction pour traiter les transactions et créer le résumé mensuel (groupé par catégorie)
  const monthlySummary = useMemo((): MonthlySummary => {
    const revenuesMap = new Map<string, MonthlySummaryItem>();
    const expensesMap = new Map<string, MonthlySummaryItem>();

    transactions.forEach((transaction) => {
      // Traiter les transactions slaves (détail des comptes)
      transaction.TransactionsSlaves.forEach((slave) => {
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

          // Récupérer les informations du compte depuis la liste de tous les comptes (incluant les virtuels)
          const account = allAccounts.find(
            (acc) => acc.accountId === accountId
          );
          const category = account?.category || "Inconnu";
          const subCategory = account?.sub_category || "Inconnu";

          // Logique de classification basée sur le type :
          // - type "credit" = dépenses (sortie d'argent)
          // - type "debit" = revenus (entrée d'argent)
          const isRevenue = type.toLowerCase() === "debit"; // Débits = revenus
          const isExpense = type.toLowerCase() === "credit"; // Crédits = dépenses

          const targetMap = isRevenue
            ? revenuesMap
            : isExpense
              ? expensesMap
              : null;
          if (!targetMap) return;

          if (targetMap.has(category)) {
            const existing = targetMap.get(category)!;
            existing.total_amount += amount;
            existing.transaction_count += 1;
            if (slave.date > existing.latest_date) {
              existing.latest_date = slave.date;
            }
            // Mettre à jour ou ajouter le compte dans la liste des comptes
            const existingAccount = existing.accounts.find(
              (a) => a.accountId === accountId
            );
            if (existingAccount) {
              existingAccount.total_amount += amount;
              existingAccount.transaction_count += 1;
            } else {
              existing.accounts.push({
                accountId,
                account_name: accountName,
                sub_category: subCategory,
                total_amount: amount,
                transaction_count: 1,
              });
            }
          } else {
            targetMap.set(category, {
              categoryKey: category,
              category,
              total_amount: amount,
              transaction_count: 1,
              latest_date: slave.date,
              accounts: [
                {
                  accountId,
                  account_name: accountName,
                  sub_category: subCategory,
                  total_amount: amount,
                  transaction_count: 1,
                },
              ],
            });
          }
        }
      });
    });

    const sortFn = (a: MonthlySummaryItem, b: MonthlySummaryItem) => {
      let comparison: number;
      if (sortBy === "date") {
        comparison = a.latest_date.localeCompare(b.latest_date);
      } else {
        comparison = a.total_amount - b.total_amount;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    };

    // Trier également les comptes à l'intérieur de chaque catégorie
    const sortAccountsFn = (
      a: MonthlySummaryItem["accounts"][0],
      b: MonthlySummaryItem["accounts"][0]
    ) => {
      const comparison = a.total_amount - b.total_amount;
      return sortOrder === "asc" ? comparison : -comparison;
    };

    const sortedRevenues = Array.from(revenuesMap.values()).sort(sortFn);
    sortedRevenues.forEach((item) => item.accounts.sort(sortAccountsFn));

    const sortedExpenses = Array.from(expensesMap.values()).sort(sortFn);
    sortedExpenses.forEach((item) => item.accounts.sort(sortAccountsFn));

    return {
      revenues: sortedRevenues,
      expenses: sortedExpenses,
      period: {
        year: selectedYear,
        month: selectedMonth,
      },
    };
  }, [
    transactions,
    allAccounts,
    selectedYear,
    selectedMonth,
    sortBy,
    sortOrder,
  ]);

  const totalAssets = accounts.reduce(
    (sum, account) => sum + account.current_amount,
    0
  );

  const getMonthName = (month: number) => {
    const months = [
      "Janvier",
      "Février",
      "Mars",
      "Avril",
      "Mai",
      "Juin",
      "Juillet",
      "Août",
      "Septembre",
      "Octobre",
      "Novembre",
      "Décembre",
    ];
    return months[month - 1];
  };

  // Fonction pour obtenir les transactions détaillées d'une catégorie
  const getDetailedTransactionsForCategory = (
    category: string,
    type: "revenue" | "expense"
  ): DetailedTransaction[] => {
    const detailedTransactions: DetailedTransaction[] = [];

    transactions.forEach((transaction) => {
      transaction.TransactionsSlaves.forEach((slave) => {
        // Filtrer uniquement les transactions du mois sélectionné
        const slaveDate = new Date(slave.date);
        const slaveYear = slaveDate.getUTCFullYear();
        const slaveMonth = slaveDate.getUTCMonth() + 1;
        if (slaveYear !== selectedYear || slaveMonth !== selectedMonth) return;

        // Filtrer seulement les comptes virtuels
        if (slave.slaveAccountIsReal === false) {
          const account = allAccounts.find(
            (acc) => acc.accountId === slave.accountId
          );
          const accountCategory = account?.category || "Inconnu";

          // Filtrer par catégorie
          if (accountCategory !== category) return;

          const isRevenue = slave.type.toLowerCase() === "debit";
          const isExpense = slave.type.toLowerCase() === "credit";

          // Vérifier que le type correspond
          if (
            (type === "revenue" && isRevenue) ||
            (type === "expense" && isExpense)
          ) {
            detailedTransactions.push({
              transactionId: transaction.transactionId,
              description: transaction.description,
              date: slave.date,
              amount: slave.amount,
              accountName: slave.slaveAccountName,
              accountId: slave.accountId,
              category: accountCategory,
              subCategory: account?.sub_category ?? "Inconnu",
              type: transaction.type,
            });
          }
        }
      });
    });

    return detailedTransactions.sort((a, b) => {
      let comparison: number;
      if (sortBy === "date") {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        comparison = a.amount - b.amount;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
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
    const masterTransaction = transactions.find(
      (t) => t.transactionId === transaction.transactionId
    );

    // Récupérer le compte maître pour avoir la catégorie et sous-catégorie actuelles
    const masterAccount = masterTransaction
      ? accounts.find((acc) => acc.account_id === masterTransaction.accountId)
      : null;

    setEditForm({
      description: transaction.description,
      accountId: masterTransaction?.accountId || transaction.accountId,
      category: masterAccount?.category || transaction.category,
      subCategory: masterAccount?.sub_category || transaction.subCategory,
    });

    // Récupérer tous les slaves de cette transaction
    if (masterTransaction) {
      const slaves = [...masterTransaction.TransactionsSlaves];
      setEditSlaves(slaves);

      // Initialiser les filtres de catégorie et types de comptes
      const initialFilters: Record<number, string> = {};
      const initialTypes: Record<number, "virtual" | "real"> = {};
      slaves.forEach((slave, index) => {
        const slaveAccount = allAccounts.find(
          (acc) => acc.accountId === slave.accountId
        );
        if (slaveAccount) {
          initialTypes[index] = slaveAccount.is_real ? "real" : "virtual";
          if (!slaveAccount.is_real) {
            initialFilters[index] = slaveAccount.category;
          }
        } else {
          initialTypes[index] = slave.slaveAccountIsReal ? "real" : "virtual";
        }
      });
      setSlaveCategoryFilters(initialFilters);
      setSlaveAccountTypes(initialTypes);
    } else {
      setEditSlaves([]);
      setSlaveCategoryFilters({});
      setSlaveAccountTypes({});
    }

    setShowEditModal(true);
  };

  // Fonction pour fermer le modal d'édition
  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingTransaction(null);
    setEditForm({
      description: "",
      accountId: "",
      category: "",
      subCategory: "",
    });
    setEditSlaves([]);
    setSlaveCategoryFilters({});
    setSlaveAccountTypes({});
  };

  // Fonction pour modifier un slave
  const handleSlaveChange = (
    index: number,
    field: keyof TransactionSlave,
    value: string | number
  ) => {
    const newSlaves = [...editSlaves];
    newSlaves[index] = { ...newSlaves[index], [field]: value };
    setEditSlaves(newSlaves);
  };

  // Fonction pour supprimer un slave
  const handleRemoveSlave = (index: number) => {
    const newSlaves = editSlaves.filter((_, i) => i !== index);
    setEditSlaves(newSlaves);
  };

  // Fonction pour calculer le solde des slaves (débits - crédits)
  const getSlavesBalance = () => {
    return editSlaves.reduce((balance, slave) => {
      const amount = slave.amount || 0;
      if (slave.type.toLowerCase() === "debit") {
        return balance + amount;
      } else {
        return balance - amount;
      }
    }, 0);
  };

  // Fonction pour vérifier si la sauvegarde est possible
  // Règle : crédit maître - débit maître = -(crédit slaves - débit slaves)
  // Équivalent : masterBalance = slavesBalance (où slavesBalance = débits - crédits)
  const canSave = () => {
    if (!editingTransaction) return false;

    // Vérifier qu'aucun slave n'a un montant <= 0
    const hasInvalidSlaves = editSlaves.some(
      (slave) => Number(slave.amount) <= 0 || !slave.accountId
    );
    if (hasInvalidSlaves) return false;

    // Calculer le solde maître (crédit - débit)
    const masterAmount = editingTransaction.amount || 0;
    const masterBalance =
      editingTransaction.type.toLowerCase() === "credit"
        ? masterAmount
        : -masterAmount;

    // Le solde slaves (débits - crédits) doit être égal au solde maître
    const slavesBalance = getSlavesBalance();
    return Math.abs(masterBalance - slavesBalance) < 0.01; // Tolérance pour les erreurs d'arrondi
  };

  // Fonction pour ajouter un nouveau slave
  const handleAddSlave = () => {
    const virtualAccounts = allAccounts.filter((acc) => !acc.is_real);
    const defaultAccount = virtualAccounts[0];

    const newSlave: TransactionSlave = {
      slaveId: `temp-${Date.now()}`, // ID temporaire
      type: "debit",
      amount: 0,
      date: new Date().toISOString(),
      accountId: defaultAccount?.accountId || "",
      masterId: editingTransaction?.transactionId || "",
      slaveAccountName: defaultAccount?.name || "",
      slaveAccountIsReal: false,
    };
    setEditSlaves([...editSlaves, newSlave]);
  };

  // Fonction pour sauvegarder les modifications
  const handleSaveTransaction = async () => {
    if (!editingTransaction) return;

    setIsSaving(true);
    try {
      // Mettre à jour la transaction principale
      const updateResponse = await fetch(
        `${API_URL}/transactions/${editingTransaction.transactionId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description: editForm.description,
            date: new Date(editingTransaction.date).toISOString(), // Garder la date originale
          }),
        }
      );

      if (!updateResponse.ok) {
        throw new Error("Failed to update transaction");
      }

      // Mettre à jour les slaves transactions
      const slaveUpdateResponse = await fetch(
        `${API_URL}/transactions/${editingTransaction.transactionId}/slaves`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slaves: editSlaves.map((slave) => ({
              slaveId: slave.slaveId,
              type: slave.type,
              amount: slave.amount,
              date: slave.date,
              accountId: slave.accountId,
            })),
          }),
        }
      );

      if (!slaveUpdateResponse.ok) {
        throw new Error("Failed to update transaction slave");
      }

      // Recharger les transactions pour mettre à jour l'affichage
      await fetchTransactions();

      // Fermer le modal
      handleCloseEditModal();
    } catch (error) {
      console.error("Error updating transaction:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const totalRevenues = monthlySummary.revenues.reduce(
    (sum, item) => sum + item.total_amount,
    0
  );
  const totalExpenses = monthlySummary.expenses.reduce(
    (sum, item) => sum + item.total_amount,
    0
  );

  // Série mensuelle pour la plage selectedMonth-3 .. selectedMonth+2
  const monthlyRangeSeries = useMemo(() => {
    // Construire les mois de la plage
    const months: { year: number; month: number; label: string }[] = [];
    for (let offset = -3; offset <= 2; offset++) {
      const d = new Date(selectedYear, selectedMonth - 1 + offset, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${getMonthName(d.getMonth() + 1).substring(0, 3)} ${d.getFullYear()}`,
      });
    }

    // Initialiser les valeurs à 0
    const revenusArr = Array(months.length).fill(0);
    const depensesArr = Array(months.length).fill(0);

    // Parcourir toutes les transactions chargées (qui couvrent déjà la plage) et accumuler par mois
    transactions.forEach((t) => {
      t.TransactionsSlaves.forEach((slave) => {
        // On ne veut que les comptes virtuels
        if (slave.slaveAccountIsReal === false) {
          const sd = new Date(slave.date);
          const sy = sd.getFullYear();
          const sm = sd.getMonth() + 1;
          const idx = months.findIndex((m) => m.year === sy && m.month === sm);
          if (idx === -1) return;
          const isRevenue = slave.type.toLowerCase() === "debit";
          const isExpense = slave.type.toLowerCase() === "credit";
          if (isRevenue) revenusArr[idx] += slave.amount;
          if (isExpense) depensesArr[idx] += slave.amount;
        }
      });
    });

    return {
      labels: months.map((m) => m.label),
      revenusArr,
      depensesArr,
    };
  }, [transactions, selectedMonth, selectedYear]);

  const monthlyChartData = useMemo(
    () => ({
      labels: monthlyRangeSeries.labels,
      datasets: [
        {
          label: "Revenus",
          data: monthlyRangeSeries.revenusArr,
          backgroundColor: "#16a34a",
        },
        {
          label: "Dépenses",
          data: monthlyRangeSeries.depensesArr,
          backgroundColor: "#dc2626",
        },
      ],
    }),
    [monthlyRangeSeries]
  );

  // Calcul du patrimoine total par mois (approx) en utilisant les transactions sur les comptes réels
  const patrimonySeries = useMemo(() => {
    // Reuse months from monthlyRangeSeries
    const labels = monthlyRangeSeries.labels;
    const n = labels.length;
    const realDelta = Array(n).fill(0);

    // Accumuler les deltas pour les comptes réels
    transactions.forEach((t) => {
      // 1. Traiter la transaction master si elle est sur un compte réel
      const masterAccount = accounts.find(
        (acc) => acc.account_id === t.accountId
      );
      if (masterAccount && masterAccount.is_real) {
        const td = new Date(t.date);
        const ty = td.getFullYear();
        const tm = td.getMonth() + 1;
        const idx = monthlyRangeSeries.labels.findIndex((_, i) => {
          const d = new Date(selectedYear, selectedMonth - 1 - 3 + i, 1);
          return d.getFullYear() === ty && d.getMonth() + 1 === tm;
        });
        if (idx !== -1) {
          const isRevenue = t.type.toLowerCase() === "credit";
          const isExpense = t.type.toLowerCase() === "debit";
          const delta = isRevenue ? t.amount : isExpense ? -t.amount : 0;
          realDelta[idx] += delta;
        }
      }

      // 2. Traiter les slaves sur des comptes réels
      t.TransactionsSlaves.forEach((slave) => {
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
          const isRevenue = slave.type.toLowerCase() === "credit";
          const isExpense = slave.type.toLowerCase() === "debit";
          const delta = isRevenue
            ? slave.amount
            : isExpense
              ? -slave.amount
              : 0;
          realDelta[idx] += delta;
        }
      });
    });

    // cumulative
    const cumulative = realDelta.map((_, i) =>
      realDelta.slice(0, i + 1).reduce((a, b) => a + b, 0)
    );
    const lastCum = cumulative[n - 1] || 0;
    const baseline = totalAssets - lastCum; // align last point with current totalAssets
    const patrimony = cumulative.map((c) => baseline + c);
    return { labels, patrimony };
  }, [
    transactions,
    monthlyRangeSeries,
    selectedMonth,
    selectedYear,
    totalAssets,
    accounts,
  ]);

  const patrimonyChartData = useMemo(
    () => ({
      labels: patrimonySeries.labels,
      datasets: [
        {
          label: "Patrimoine total",
          data: patrimonySeries.patrimony,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.1)",
          tension: 0.3,
          fill: true,
        },
      ],
    }),
    [patrimonySeries]
  );

  // Préparer les données pour le graphique : revenues/expenses par catégorie (limitées aux top 8 catégories)
  const chartData = useMemo(() => {
    // Combiner catégories des revenus et dépenses
    const map = new Map<
      string,
      { category: string; revenues: number; expenses: number }
    >();

    monthlySummary.revenues.forEach((item) => {
      const key = item.category;
      if (!map.has(key))
        map.set(key, { category: key, revenues: 0, expenses: 0 });
      map.get(key)!.revenues += item.total_amount;
    });

    monthlySummary.expenses.forEach((item) => {
      const key = item.category;
      if (!map.has(key))
        map.set(key, { category: key, revenues: 0, expenses: 0 });
      map.get(key)!.expenses += item.total_amount;
    });

    // Convertir en tableau trié par somme décroissante
    const arr = Array.from(map.values())
      .map((v) => ({
        ...v,
        total: v.revenues + v.expenses,
      }))
      .sort((a, b) => b.total - a.total);

    // Limiter le nombre de catégories affichées
    return arr.slice(0, 8).map((v) => ({
      name: v.category,
      Revenus: v.revenues,
      Depenses: v.expenses,
    }));
  }, [monthlySummary]);

  // Préparer les données et options pour Chart.js
  const chartJsData = useMemo(() => {
    const labels = chartData.map((d) => d.name);
    return {
      labels,
      datasets: [
        {
          label: "Revenus",
          data: chartData.map((d) => d.Revenus),
          backgroundColor: "#16a34a",
        },
        {
          label: "Dépenses",
          data: chartData.map((d) => d.Depenses),
          backgroundColor: "#dc2626",
        },
      ],
    };
  }, [chartData]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" as const },
        tooltip: {
          callbacks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label: function (context: any) {
              const value = context.raw || 0;
              return value.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              });
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: false } },
        y: { beginAtZero: true },
      },
    }),
    []
  );

  const patrimonyChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label: function (context: any) {
              const value = context.raw || 0;
              return `Patrimoine: ${value.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: false } },
        y: {
          beginAtZero: false,
          ticks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            callback: function (value: any) {
              return value.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              });
            },
          },
        },
      },
    }),
    []
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Navigation />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Left Sidebar - Patrimoine */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Patrimoine Total
              </h3>
              {loadingAccounts ? (
                <div className="text-gray-500">Chargement...</div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-blue-600 mb-6">
                    {totalAssets.toLocaleString("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </div>

                  <div className="space-y-2">
                    {[...accounts]
                      .sort((a, b) => b.current_amount - a.current_amount)
                      .map((account) => (
                        <div
                          key={account.account_id}
                          className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-gray-800">
                              {account.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {account.category} - {account.sub_category}
                            </p>
                          </div>
                          <p
                            className={`font-semibold ${
                              account.current_amount >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {account.current_amount.toLocaleString("fr-FR", {
                              style: "currency",
                              currency: "EUR",
                            })}
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
              <h2 className="text-3xl font-bold text-gray-800">
                Tableau de bord
              </h2>

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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {/* Current Period Display */}
                <div className="px-6 py-2 bg-white border border-gray-300 rounded-lg min-w-[200px] text-center">
                  <div className="font-semibold text-gray-800">
                    {getMonthName(selectedMonth)} {selectedYear}
                  </div>
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
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

            {/* Sort Filter */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm text-gray-600">Trier par :</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSortBy("amount")}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    sortBy === "amount"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Montant
                </button>
                <button
                  onClick={() => setSortBy("date")}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    sortBy === "date"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Date
                </button>
              </div>
              <button
                onClick={() =>
                  setSortOrder(sortOrder === "desc" ? "asc" : "desc")
                }
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                title={sortOrder === "desc" ? "Décroissant" : "Croissant"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 text-gray-600 transition-transform ${sortOrder === "asc" ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Monthly Summary Cards and Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Revenues Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Revenus
                  </h3>
                  <div className="text-2xl font-bold text-green-600">
                    {totalRevenues.toLocaleString("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </div>
                </div>

                {loadingTransactions ? (
                  <div className="text-gray-500">Chargement...</div>
                ) : monthlySummary.revenues.length ? (
                  <div className="space-y-3">
                    {monthlySummary.revenues.slice(0, 5).map((item) => (
                      <div key={item.categoryKey}>
                        <div
                          className="flex justify-between items-center p-3 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                          onClick={() => handleCategoryClick(item.categoryKey)}
                        >
                          <div>
                            <p className="font-medium text-gray-800">
                              {item.category}
                            </p>
                            <p className="text-xs text-gray-400">
                              {item.accounts.length} compte
                              {item.accounts.length > 1 ? "s" : ""} -{" "}
                              {item.transaction_count} transaction
                              {item.transaction_count > 1 ? "s" : ""}
                            </p>
                          </div>
                          <p className="font-semibold text-green-600">
                            {item.total_amount.toLocaleString("fr-FR", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </p>
                        </div>

                        {/* Détails des transactions */}
                        {expandedCategories.has(item.categoryKey) && (
                          <div className="mt-2 ml-4 space-y-2">
                            {(() => {
                              const detailedTransactions =
                                getDetailedTransactionsForCategory(
                                  item.category,
                                  "revenue"
                                );
                              return detailedTransactions.length > 0 ? (
                                detailedTransactions.map(
                                  (transaction, index) => (
                                    <div
                                      key={`${transaction.transactionId}-${index}`}
                                      className="flex justify-between items-center p-3 bg-white border border-green-200 rounded-lg cursor-pointer hover:bg-green-50 transition-colors"
                                      onClick={() =>
                                        handleEditTransaction(transaction)
                                      }
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-800 text-xs line-clamp-2">
                                          {transaction.description}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                          {transaction.accountName} -{" "}
                                          {new Date(
                                            transaction.date
                                          ).toLocaleDateString("fr-FR")}
                                        </p>
                                      </div>
                                      <div className="text-right flex-shrink-0 ml-2">
                                        <p className="font-semibold text-green-600 text-xs">
                                          {transaction.amount.toLocaleString(
                                            "fr-FR",
                                            {
                                              style: "currency",
                                              currency: "EUR",
                                            }
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  )
                                )
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
                  <div className="text-gray-500 text-center py-4">
                    Aucun revenu pour cette période
                  </div>
                )}
              </div>

              {/* Expenses Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Dépenses
                  </h3>
                  <div className="text-2xl font-bold text-red-600">
                    -
                    {totalExpenses.toLocaleString("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </div>
                </div>

                {loadingTransactions ? (
                  <div className="text-gray-500">Chargement...</div>
                ) : monthlySummary.expenses.length ? (
                  <div className="space-y-3">
                    {monthlySummary.expenses.slice(0, 5).map((item) => (
                      <div key={item.categoryKey}>
                        <div
                          className="flex justify-between items-center p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
                          onClick={() => handleCategoryClick(item.categoryKey)}
                        >
                          <div>
                            <p className="font-medium text-gray-800">
                              {item.category}
                            </p>
                            <p className="text-xs text-gray-400">
                              {item.accounts.length} compte
                              {item.accounts.length > 1 ? "s" : ""} -{" "}
                              {item.transaction_count} transaction
                              {item.transaction_count > 1 ? "s" : ""}
                            </p>
                          </div>
                          <p className="font-semibold text-red-600">
                            -
                            {item.total_amount.toLocaleString("fr-FR", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </p>
                        </div>

                        {/* Détails des transactions */}
                        {expandedCategories.has(item.categoryKey) && (
                          <div className="mt-2 ml-4 space-y-2">
                            {(() => {
                              const detailedTransactions =
                                getDetailedTransactionsForCategory(
                                  item.category,
                                  "expense"
                                );
                              return detailedTransactions.length > 0 ? (
                                detailedTransactions.map(
                                  (transaction, index) => (
                                    <div
                                      key={`${transaction.transactionId}-${index}`}
                                      className="flex justify-between items-center p-3 bg-white border border-red-200 rounded-lg cursor-pointer hover:bg-red-50 transition-colors"
                                      onClick={() =>
                                        handleEditTransaction(transaction)
                                      }
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-800 text-xs line-clamp-2">
                                          {transaction.description}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                          {transaction.accountName} -{" "}
                                          {new Date(
                                            transaction.date
                                          ).toLocaleDateString("fr-FR")}
                                        </p>
                                      </div>
                                      <div className="text-right flex-shrink-0 ml-2">
                                        <p className="font-semibold text-red-600 text-xs">
                                          -
                                          {transaction.amount.toLocaleString(
                                            "fr-FR",
                                            {
                                              style: "currency",
                                              currency: "EUR",
                                            }
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  )
                                )
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
                  <div className="text-gray-500 text-center py-4">
                    Aucune dépense pour cette période
                  </div>
                )}
              </div>

              {/* Chart - à droite */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 lg:col-span-1">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Revenus / Dépenses par catégorie
                  </h3>
                </div>
                {chartData.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    Aucune donnée pour le graphique
                  </div>
                ) : (
                  <div style={{ width: "100%", height: 300 }}>
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
                <h3 className="text-lg font-semibold text-gray-800">
                  Résultat Net
                </h3>
                <div
                  className={`text-2xl font-bold ${totalRevenues - totalExpenses >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {(totalRevenues - totalExpenses).toLocaleString("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                  })}
                </div>
              </div>
            </div>

            {/* Monthly Revenues/Expenses chart for selected range */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Revenus / Dépenses (par mois)
                </h3>
                <div className="text-sm text-gray-500">
                  Période: {monthlyRangeSeries.labels[0]} →{" "}
                  {
                    monthlyRangeSeries.labels[
                      monthlyRangeSeries.labels.length - 1
                    ]
                  }
                </div>
              </div>
              <div style={{ width: "100%", height: 300 }}>
                <div className="w-full h-full">
                  <Bar data={monthlyChartData} options={chartOptions} />
                </div>
              </div>
            </div>

            {/* Patrimony line chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Patrimoine total (historique)
                </h3>
                <div className="text-sm text-gray-500">Point par mois</div>
              </div>
              <div style={{ width: "100%", height: 260 }}>
                <div className="w-full h-full">
                  <Line
                    data={patrimonyChartData}
                    options={patrimonyChartOptions}
                  />
                </div>
              </div>
            </div>

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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="p-6 overflow-y-auto max-h-[60vh]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Colonne gauche - Transaction maître */}
                      <div className="space-y-4">
                        <div className="border-b border-gray-200 pb-3">
                          <h4 className="text-lg font-semibold text-gray-800 mb-2">
                            Transaction maître
                          </h4>
                          <p className="text-sm text-gray-600">
                            Informations générales de la transaction principale
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Description
                          </label>
                          <textarea
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium resize-none"
                            placeholder="Description de la transaction"
                            rows={Math.max(
                              2,
                              (editForm.description.match(/\n/g) || []).length +
                                1 +
                                Math.ceil(editForm.description.length / 60)
                            )}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Compte principal
                          </label>
                          <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                            {editingTransaction.accountName ||
                              "Compte non trouvé"}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Catégorie
                          </label>
                          <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                            {editForm.category || "Non définie"}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Sous-catégorie
                          </label>
                          <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                            {editForm.subCategory || "Non définie"}
                          </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                          <h5 className="font-medium text-blue-800 mb-2">
                            Informations de la transaction maître
                          </h5>
                          <div className="space-y-1">
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">ID:</span>{" "}
                              <code className="bg-blue-100 px-1 rounded text-xs">
                                {editingTransaction.transactionId}
                              </code>
                            </p>
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">Date:</span>{" "}
                              {new Date(
                                editingTransaction.date
                              ).toLocaleDateString("fr-FR")}
                            </p>
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">
                                Montant total:
                              </span>{" "}
                              {editSlaves
                                .reduce((sum, slave) => sum + slave.amount, 0)
                                .toLocaleString("fr-FR", {
                                  style: "currency",
                                  currency: "EUR",
                                })}
                            </p>
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">Type:</span>{" "}
                              {editingTransaction.type}
                            </p>
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">
                                Nombre de transactions slaves:
                              </span>{" "}
                              {editSlaves.length}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Colonne droite - Transactions slaves */}
                      <div className="space-y-4">
                        <div className="border-b border-gray-200 pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-lg font-semibold text-gray-800 mb-2">
                                Transactions slaves
                              </h4>
                              <p className="text-sm text-gray-600">
                                Détail des transactions associées
                              </p>
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
                          {editSlaves.map((slave, index) => {
                            const isCredit =
                              slave.type.toLowerCase() === "credit";
                            return (
                              <div
                                key={slave.slaveId}
                                className={`border rounded-lg p-4 ${isCredit ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={`w-6 h-6 text-white text-xs rounded-full flex items-center justify-center font-medium ${isCredit ? "bg-red-600" : "bg-green-600"}`}
                                    >
                                      {index + 1}
                                    </div>
                                    <h5
                                      className={`font-medium ${isCredit ? "text-red-800" : "text-green-800"}`}
                                    >
                                      Transaction slave {index + 1}
                                    </h5>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveSlave(index)}
                                    className="text-red-600 hover:text-red-800 transition-colors p-1 rounded"
                                    title="Supprimer cette transaction"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      Type de compte
                                    </label>
                                    <select
                                      value={
                                        slaveAccountTypes[index] || "virtual"
                                      }
                                      onChange={(e) => {
                                        const newType = e.target.value as
                                          | "virtual"
                                          | "real";
                                        setSlaveAccountTypes({
                                          ...slaveAccountTypes,
                                          [index]: newType,
                                        });
                                        // Sélectionner automatiquement le premier compte du nouveau type
                                        if (newType === "real") {
                                          const firstRealAccount = accounts[0];
                                          if (firstRealAccount) {
                                            setEditSlaves((prevSlaves) => {
                                              const newSlaves = [...prevSlaves];
                                              newSlaves[index] = {
                                                ...newSlaves[index],
                                                accountId:
                                                  firstRealAccount.account_id,
                                                slaveAccountName:
                                                  firstRealAccount.name,
                                                slaveAccountIsReal: true,
                                              };
                                              return newSlaves;
                                            });
                                          }
                                        } else {
                                          const firstVirtualAccount =
                                            allAccounts.find(
                                              (acc) => !acc.is_real
                                            );
                                          if (firstVirtualAccount) {
                                            setEditSlaves((prevSlaves) => {
                                              const newSlaves = [...prevSlaves];
                                              newSlaves[index] = {
                                                ...newSlaves[index],
                                                accountId:
                                                  firstVirtualAccount.accountId,
                                                slaveAccountName:
                                                  firstVirtualAccount.name,
                                                slaveAccountIsReal: false,
                                              };
                                              return newSlaves;
                                            });
                                            setSlaveCategoryFilters({
                                              ...slaveCategoryFilters,
                                              [index]:
                                                firstVirtualAccount.category,
                                            });
                                          }
                                        }
                                      }}
                                      className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                                    >
                                      <option value="virtual">
                                        Virtuel (catégorie)
                                      </option>
                                      <option value="real">
                                        Réel (banque)
                                      </option>
                                    </select>
                                  </div>

                                  {slaveAccountTypes[index] === "real" ? (
                                    // Compte réel - sélection parmi les comptes réels
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Compte réel
                                      </label>
                                      <select
                                        value={slave.accountId}
                                        onChange={(e) => {
                                          const selectedAccount = accounts.find(
                                            (acc) =>
                                              acc.account_id === e.target.value
                                          );
                                          setEditSlaves((prevSlaves) => {
                                            const newSlaves = [...prevSlaves];
                                            newSlaves[index] = {
                                              ...newSlaves[index],
                                              accountId: e.target.value,
                                              slaveAccountName:
                                                selectedAccount?.name ||
                                                newSlaves[index]
                                                  .slaveAccountName,
                                              slaveAccountIsReal: true,
                                            };
                                            return newSlaves;
                                          });
                                        }}
                                        className="w-full px-2 py-1.5 text-sm border-2 border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50 text-gray-800 font-medium"
                                      >
                                        <option value="" disabled>
                                          Sélectionner un compte réel
                                        </option>
                                        {accounts.map((account) => (
                                          <option
                                            key={account.account_id}
                                            value={account.account_id}
                                          >
                                            {account.name} ({account.category})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    // Compte virtuel - filtre catégorie
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Catégorie (filtre)
                                      </label>
                                      <select
                                        value={
                                          slaveCategoryFilters[index] || ""
                                        }
                                        onChange={(e) => {
                                          const newCategory = e.target.value;
                                          setSlaveCategoryFilters({
                                            ...slaveCategoryFilters,
                                            [index]: newCategory,
                                          });
                                          // Sélectionner automatiquement le premier compte de la nouvelle catégorie
                                          const firstAccountInCategory =
                                            allAccounts.find(
                                              (acc) =>
                                                !acc.is_real &&
                                                (!newCategory ||
                                                  acc.category === newCategory)
                                            );
                                          if (firstAccountInCategory) {
                                            setEditSlaves((prevSlaves) => {
                                              const newSlaves = [...prevSlaves];
                                              newSlaves[index] = {
                                                ...newSlaves[index],
                                                accountId:
                                                  firstAccountInCategory.accountId,
                                                slaveAccountName:
                                                  firstAccountInCategory.name,
                                                slaveAccountIsReal: false,
                                              };
                                              return newSlaves;
                                            });
                                          }
                                        }}
                                        className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                                      >
                                        <option value="">
                                          Toutes les catégories
                                        </option>
                                        {[
                                          ...new Set(
                                            allAccounts
                                              .filter((acc) => !acc.is_real)
                                              .map((acc) => acc.category)
                                          ),
                                        ].map((category) => (
                                          <option
                                            key={category}
                                            value={category}
                                          >
                                            {category}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  {slaveAccountTypes[index] !== "real" && (
                                    <div className="col-span-2">
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Compte virtuel
                                      </label>
                                      <select
                                        value={slave.accountId}
                                        onChange={(e) => {
                                          const selectedAccount =
                                            allAccounts.find(
                                              (acc) =>
                                                acc.accountId === e.target.value
                                            );
                                          setEditSlaves((prevSlaves) => {
                                            const newSlaves = [...prevSlaves];
                                            newSlaves[index] = {
                                              ...newSlaves[index],
                                              accountId: e.target.value,
                                              slaveAccountName:
                                                selectedAccount?.name ||
                                                newSlaves[index]
                                                  .slaveAccountName,
                                              slaveAccountIsReal: false,
                                            };
                                            return newSlaves;
                                          });
                                        }}
                                        className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                                      >
                                        <option value="" disabled>
                                          Sélectionner un compte
                                        </option>
                                        {slave.accountId &&
                                          !allAccounts.some(
                                            (acc) =>
                                              !acc.is_real &&
                                              acc.accountId ===
                                                slave.accountId &&
                                              (!slaveCategoryFilters[index] ||
                                                acc.category ===
                                                  slaveCategoryFilters[index])
                                          ) && (
                                            <option value={slave.accountId}>
                                              {slave.slaveAccountName ||
                                                "Compte actuel"}
                                            </option>
                                          )}
                                        {allAccounts
                                          .filter(
                                            (acc) =>
                                              !acc.is_real &&
                                              (!slaveCategoryFilters[index] ||
                                                acc.category ===
                                                  slaveCategoryFilters[index])
                                          )
                                          .map((account) => (
                                            <option
                                              key={account.accountId}
                                              value={account.accountId}
                                            >
                                              {account.name}
                                            </option>
                                          ))}
                                      </select>
                                    </div>
                                  )}

                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      Type
                                    </label>
                                    <select
                                      value={slave.type}
                                      onChange={(e) =>
                                        handleSlaveChange(
                                          index,
                                          "type",
                                          e.target.value
                                        )
                                      }
                                      className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
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
                                      onChange={(e) =>
                                        handleSlaveChange(
                                          index,
                                          "amount",
                                          parseFloat(e.target.value) || 0
                                        )
                                      }
                                      className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      Date
                                    </label>
                                    <div className="w-full px-2 py-1.5 text-sm bg-gray-200 border-2 border-gray-300 rounded-md text-gray-600 font-medium">
                                      {new Date(slave.date).toLocaleDateString(
                                        "fr-FR"
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {editSlaves.length === 0 && (
                            <div className="text-center py-8 text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-12 w-12 mx-auto text-gray-400 mb-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              <p className="text-sm font-medium text-gray-600">
                                Aucune transaction slave
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Cliquez sur &quot;Ajouter&quot; pour créer une
                                nouvelle transaction slave
                              </p>
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
                          ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {isSaving ? "Sauvegarde..." : "Sauvegarder"}
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
