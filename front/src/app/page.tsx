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
import TransactionEditModal from "@/components/TransactionEditModal";
import { API_URL } from "@/config/api";

/**
 * Extrait l'année et le mois d'une chaîne de date (YYYY-MM-DD ou ISO)
 * sans passer par Date pour éviter les problèmes de timezone
 */
function extractYearMonth(dateStr: string): { year: number; month: number } {
  // Extraire la partie date (avant le T ou l'espace)
  const datePart = dateStr.split(/[T ]/)[0];
  const [year, month] = datePart.split("-").map(Number);
  return { year, month };
}

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

interface DeferredDetail {
  slave_id: string;
  master_id: string;
  amount: number;
  master_date: string;
  slave_date: string;
  description: string;
  account_name: string;
}

interface DeferredBalance {
  total: number;
  details: DeferredDetail[];
}

interface DeferredAccounts {
  prepaid_expenses: DeferredBalance;
  deferred_revenue: DeferredBalance;
}

interface GroupedDeferredTransaction {
  master_id: string;
  total_amount: number;
  master_date: string;
  latest_slave_date: string;
  description: string;
  account_names: string[];
}

interface GroupedDeferredCategory {
  category: string;
  total_amount: number;
  transactions: GroupedDeferredTransaction[];
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

interface PatrimonyTimelineEntry {
  month_date: string;
  bank_patrimony: number;
  accounting_patrimony: number;
  cca_amount: number;
  pca_amount: number;
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
  // Pour le tooltip en mode comptable (réconciliation avec bancaire)
  bancaireExpenses: number; // Dépenses basées sur date master
  bancaireRevenues: number; // Revenus basés sur date master
  ccaSortants: number; // Payés ce mois, comptabilisés plus tard
  pcaSortants: number; // Reçus ce mois, comptabilisés plus tard
  ccaEntrants: number; // Payés avant, comptabilisés ce mois
  pcaEntrants: number; // Reçus avant, comptabilisés ce mois
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allAccounts, setAllAccounts] = useState<VirtualAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [deferredAccounts, setDeferredAccounts] =
    useState<DeferredAccounts | null>(null);
  const [expandedTransit, setExpandedTransit] = useState<"cca" | "pca" | null>(
    null
  );
  const [expandedDeferredCategories, setExpandedDeferredCategories] = useState<
    Set<string>
  >(new Set());
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
  const [sortBy, setSortBy] = useState<"amount" | "date">("amount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [categoryDisplayCount, setCategoryDisplayCount] = useState<3 | 8>(3);
  const [balanceView, setBalanceView] = useState<"bancaire" | "comptable">(
    "comptable"
  );
  const [patrimonyTimeline, setPatrimonyTimeline] = useState<
    PatrimonyTimelineEntry[]
  >([]);

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

  const fetchDeferredAccounts = async () => {
    try {
      const response = await fetch(`${API_URL}/accounts/deferred`);
      if (!response.ok) {
        throw new Error("Failed to fetch deferred accounts");
      }
      const data = await response.json();
      setDeferredAccounts(data);
    } catch (error) {
      console.error("Error fetching deferred accounts:", error);
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
      setTransactions(data.data || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const fetchPatrimonyTimeline = async () => {
    try {
      const pad = (n: number) => n.toString().padStart(2, "0");
      const start = new Date(selectedYear, selectedMonth - 1 - 3, 1);
      const end = new Date(selectedYear, selectedMonth - 1 + 2, 1);
      const startDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
      const endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-01`;

      const response = await fetch(
        `${API_URL}/accounts/patrimony-timeline?start_date=${startDate}&end_date=${endDate}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch patrimony timeline");
      }
      const data = await response.json();
      setPatrimonyTimeline(data || []);
    } catch (error) {
      console.error("Error fetching patrimony timeline:", error);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchAllAccounts();
    fetchDeferredAccounts();
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchPatrimonyTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth]);

  // Fonction pour traiter les transactions et créer le résumé mensuel (groupé par catégorie)
  const monthlySummary = useMemo((): MonthlySummary => {
    const revenuesMap = new Map<string, MonthlySummaryItem>();
    const expensesMap = new Map<string, MonthlySummaryItem>();

    // Totaux bancaires (basés sur date master) - pour le tooltip en mode comptable
    let bancaireExpenses = 0;
    let bancaireRevenues = 0;
    // CCA/PCA sortants (payés ce mois, comptabilisés plus tard)
    let ccaSortants = 0;
    let pcaSortants = 0;
    // CCA/PCA entrants (payés avant, comptabilisés ce mois)
    let ccaEntrants = 0;
    let pcaEntrants = 0;

    // Calculer la fin du mois pour détecter les CCA/PCA sortants
    const endOfSelectedMonth = new Date(selectedYear, selectedMonth, 0);
    const endOfMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(endOfSelectedMonth.getDate()).padStart(2, "0")}`;

    // Helper pour ajouter un slave au résumé
    const addSlaveToSummary = (
      slave: TransactionSlave,
      displayDate: string
    ) => {
      if (slave.slaveAccountIsReal !== false) return;

      const accountId = slave.accountId;
      const accountName = slave.slaveAccountName;
      const amount = slave.amount;
      const type = slave.type;

      const account = allAccounts.find((acc) => acc.accountId === accountId);
      const category = account?.category || "Inconnu";
      const subCategory = account?.sub_category || "Inconnu";

      const isRevenue = type.toLowerCase() === "debit";
      const isExpense = type.toLowerCase() === "credit";

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
        if (displayDate > existing.latest_date) {
          existing.latest_date = displayDate;
        }
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
          latest_date: displayDate,
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
    };

    // Calculer les totaux bancaires et CCA/PCA sortants (toujours, pour le tooltip)
    transactions.forEach((transaction) => {
      const { year: masterYear, month: masterMonth } = extractYearMonth(
        transaction.date
      );
      if (masterYear === selectedYear && masterMonth === selectedMonth) {
        transaction.TransactionsSlaves.forEach((slave) => {
          if (slave.slaveAccountIsReal !== false) return;
          const isCredit = slave.type.toLowerCase() === "credit";
          const isDebit = slave.type.toLowerCase() === "debit";
          if (isCredit) bancaireExpenses += slave.amount;
          if (isDebit) bancaireRevenues += slave.amount;

          // CCA/PCA sortants: slaves avec date future (comptabilisés plus tard)
          const slaveDate = slave.date.split(/[T ]/)[0];
          if (slaveDate > endOfMonthStr) {
            if (isCredit) ccaSortants += slave.amount;
            if (isDebit) pcaSortants += slave.amount;
          }
        });
      }
    });

    // Calculer le résumé affiché selon le mode
    transactions.forEach((transaction) => {
      const { year: masterYear, month: masterMonth } = extractYearMonth(
        transaction.date
      );
      const isMasterInSelectedMonth =
        masterYear === selectedYear && masterMonth === selectedMonth;
      const isMasterFromPreviousMonth =
        masterYear < selectedYear ||
        (masterYear === selectedYear && masterMonth < selectedMonth);

      if (balanceView === "comptable") {
        // Mode comptable: filtrer par date du slave
        transaction.TransactionsSlaves.forEach((slave) => {
          const { year: slaveYear, month: slaveMonth } = extractYearMonth(
            slave.date
          );
          if (slaveYear !== selectedYear || slaveMonth !== selectedMonth)
            return;

          // Calculer CCA/PCA entrants (payés avant, comptabilisés ce mois)
          if (isMasterFromPreviousMonth && slave.slaveAccountIsReal === false) {
            const isCredit = slave.type.toLowerCase() === "credit";
            const isDebit = slave.type.toLowerCase() === "debit";
            if (isCredit) ccaEntrants += slave.amount;
            if (isDebit) pcaEntrants += slave.amount;
          }

          addSlaveToSummary(slave, slave.date);
        });
      } else {
        // Mode bancaire: filtrer par date du master, inclure tous les slaves
        if (!isMasterInSelectedMonth) return;

        transaction.TransactionsSlaves.forEach((slave) => {
          addSlaveToSummary(slave, transaction.date);
        });
      }
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
      bancaireExpenses,
      bancaireRevenues,
      ccaSortants,
      pcaSortants,
      ccaEntrants,
      pcaEntrants,
    };
  }, [
    transactions,
    allAccounts,
    selectedYear,
    selectedMonth,
    sortBy,
    sortOrder,
    balanceView,
  ]);

  const totalAssets = accounts.reduce(
    (sum, account) => sum + account.current_amount,
    0
  );

  // Grouper les CCA/PCA par catégorie, puis par transaction
  const groupedDeferredAccounts = useMemo(() => {
    const groupDetailsByCategory = (
      details: DeferredDetail[]
    ): GroupedDeferredCategory[] => {
      // D'abord grouper par catégorie
      const categoryMap = new Map<
        string,
        {
          category: string;
          total_amount: number;
          transactionMap: Map<
            string,
            {
              master_id: string;
              total_amount: number;
              master_date: string;
              latest_slave_date: string;
              description: string;
              account_names: Set<string>;
            }
          >;
        }
      >();

      details.forEach((detail) => {
        // Trouver la catégorie du compte
        const account = allAccounts.find(
          (acc) => acc.name === detail.account_name
        );
        const category = account?.category || "Inconnu";

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            category,
            total_amount: 0,
            transactionMap: new Map(),
          });
        }

        const categoryData = categoryMap.get(category)!;
        categoryData.total_amount += detail.amount;

        // Grouper par transaction dans cette catégorie
        if (categoryData.transactionMap.has(detail.master_id)) {
          const existing = categoryData.transactionMap.get(detail.master_id)!;
          existing.total_amount += detail.amount;
          existing.account_names.add(detail.account_name);
          if (detail.slave_date > existing.latest_slave_date) {
            existing.latest_slave_date = detail.slave_date;
          }
        } else {
          categoryData.transactionMap.set(detail.master_id, {
            master_id: detail.master_id,
            total_amount: detail.amount,
            master_date: detail.master_date,
            latest_slave_date: detail.slave_date,
            description: detail.description,
            account_names: new Set([detail.account_name]),
          });
        }
      });

      // Convertir en tableau et trier
      return Array.from(categoryMap.values())
        .map((cat) => ({
          category: cat.category,
          total_amount: cat.total_amount,
          transactions: Array.from(cat.transactionMap.values())
            .map((t) => ({
              ...t,
              account_names: Array.from(t.account_names),
            }))
            .sort(
              (a, b) =>
                new Date(a.latest_slave_date).getTime() -
                new Date(b.latest_slave_date).getTime()
            ),
        }))
        .sort((a, b) => b.total_amount - a.total_amount);
    };

    if (!deferredAccounts) return null;

    return {
      prepaid_expenses: groupDetailsByCategory(
        deferredAccounts.prepaid_expenses.details
      ),
      deferred_revenue: groupDetailsByCategory(
        deferredAccounts.deferred_revenue.details
      ),
      prepaid_total: deferredAccounts.prepaid_expenses.total,
      deferred_total: deferredAccounts.deferred_revenue.total,
    };
  }, [deferredAccounts, allAccounts]);

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
  // Groupe par transaction et somme les montants des slaves de cette catégorie
  const getDetailedTransactionsForCategory = (
    category: string,
    type: "revenue" | "expense"
  ): DetailedTransaction[] => {
    // Map pour grouper par transactionId
    const transactionMap = new Map<
      string,
      {
        transaction: Transaction;
        totalAmount: number;
        latestDate: string;
        accountNames: Set<string>;
      }
    >();

    transactions.forEach((transaction) => {
      // En mode bancaire, filtrer par date master
      if (balanceView === "bancaire") {
        const { year: masterYear, month: masterMonth } = extractYearMonth(
          transaction.date
        );
        if (masterYear !== selectedYear || masterMonth !== selectedMonth)
          return;
      }

      transaction.TransactionsSlaves.forEach((slave) => {
        // En mode comptable, filtrer par date slave
        if (balanceView === "comptable") {
          const { year: slaveYear, month: slaveMonth } = extractYearMonth(
            slave.date
          );
          if (slaveYear !== selectedYear || slaveMonth !== selectedMonth)
            return;
        }

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
            const slaveDate =
              balanceView === "bancaire" ? transaction.date : slave.date;

            if (transactionMap.has(transaction.transactionId)) {
              const existing = transactionMap.get(transaction.transactionId)!;
              existing.totalAmount += slave.amount;
              existing.accountNames.add(slave.slaveAccountName);
              if (slaveDate > existing.latestDate) {
                existing.latestDate = slaveDate;
              }
            } else {
              transactionMap.set(transaction.transactionId, {
                transaction,
                totalAmount: slave.amount,
                latestDate: slaveDate,
                accountNames: new Set([slave.slaveAccountName]),
              });
            }
          }
        }
      });
    });

    // Convertir en tableau de DetailedTransaction
    const detailedTransactions: DetailedTransaction[] = Array.from(
      transactionMap.values()
    ).map(({ transaction, totalAmount, latestDate, accountNames }) => ({
      transactionId: transaction.transactionId,
      description: transaction.description,
      date: latestDate,
      amount: totalAmount,
      accountName: Array.from(accountNames).join(", "),
      accountId: transaction.accountId,
      category,
      subCategory: "",
      type: transaction.type,
    }));

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
    // Récupérer la transaction maître pour avoir les slaves
    const masterTransaction = transactions.find(
      (t) => t.transactionId === transaction.transactionId
    );

    // Récupérer le compte maître
    const masterAccount = masterTransaction
      ? accounts.find((acc) => acc.account_id === masterTransaction.accountId)
      : null;

    // Préparer la transaction pour le modal
    const transactionForModal = {
      transactionId: transaction.transactionId,
      description: transaction.description,
      date: transaction.date,
      amount: transaction.amount,
      type: transaction.type,
      accountId: masterTransaction?.accountId || transaction.accountId,
      accountName: transaction.accountName,
      category: masterAccount?.category || transaction.category,
      subCategory: masterAccount?.sub_category || transaction.subCategory,
      TransactionsSlaves: masterTransaction?.TransactionsSlaves || [],
    };

    setEditingTransaction(
      transactionForModal as unknown as DetailedTransaction
    );
    setShowEditModal(true);
  };

  // Fonction pour fermer le modal d'édition
  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingTransaction(null);
  };

  // Fonction pour sauvegarder les modifications via le modal
  const handleSaveTransaction = async (
    transactionId: string,
    description: string,
    date: string,
    slaves: TransactionSlave[]
  ): Promise<{ success: boolean; error?: string }> => {
    // Mettre à jour la transaction principale
    const updateResponse = await fetch(
      `${API_URL}/transactions/${transactionId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description,
          date: new Date(date).toISOString(),
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || "Échec de la mise à jour de la transaction",
      };
    }

    // Mettre à jour les slaves transactions
    const slaveUpdateResponse = await fetch(
      `${API_URL}/transactions/${transactionId}/slaves`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slaves: slaves.map((slave) => ({
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
      const errorData = await slaveUpdateResponse.json().catch(() => ({}));
      return {
        success: false,
        error:
          errorData.detail || "Échec de la mise à jour des transactions slaves",
      };
    }

    // Recharger les transactions pour mettre à jour l'affichage
    await fetchTransactions();
    return { success: true };
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
          const { year: sy, month: sm } = extractYearMonth(slave.date);
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

  // Patrimoine timeline depuis la RPC Supabase
  // Deux séries: bancaire (soldes réels) et comptable (bancaire + CCA - PCA)
  const patrimonySeries = useMemo(() => {
    const monthNames = [
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

    if (patrimonyTimeline.length === 0) {
      // Fallback avec les labels de monthlyRangeSeries si pas encore chargé
      return {
        labels: monthlyRangeSeries.labels,
        bankPatrimony: monthlyRangeSeries.labels.map(() => 0),
        accountingPatrimony: monthlyRangeSeries.labels.map(() => 0),
      };
    }

    return {
      labels: patrimonyTimeline.map((p) => {
        const d = new Date(p.month_date);
        const monthName = monthNames[d.getMonth()];
        return `${monthName.substring(0, 3)} ${d.getFullYear()}`;
      }),
      bankPatrimony: patrimonyTimeline.map((p) => p.bank_patrimony),
      accountingPatrimony: patrimonyTimeline.map((p) => p.accounting_patrimony),
    };
  }, [patrimonyTimeline, monthlyRangeSeries.labels]);

  const patrimonyChartData = useMemo(
    () => ({
      labels: patrimonySeries.labels,
      datasets: [
        {
          label: "Patrimoine total",
          data: patrimonySeries.bankPatrimony,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.1)",
          tension: 0.3,
          fill: true,
          order: 1,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: "#2563eb",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
        },
        {
          label: "Patrimoine estimé",
          data: patrimonySeries.accountingPatrimony,
          borderColor: "#f97316",
          backgroundColor: "rgba(249,115,22,0.1)",
          tension: 0.3,
          fill: false,
          borderDash: [5, 5],
          order: 0,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: "#f97316",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
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
    return arr.slice(0, categoryDisplayCount).map((v) => ({
      name: v.category,
      Revenus: v.revenues,
      Depenses: v.expenses,
    }));
  }, [monthlySummary, categoryDisplayCount]);

  // Préparer les données et options pour Chart.js
  const chartJsData = useMemo(() => {
    const labels = chartData.map((d) =>
      d.name.length > 12 ? d.name.substring(0, 10) + "..." : d.name
    );
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
            title: function (context: any) {
              const index = context[0]?.dataIndex;
              return chartData[index]?.name || "";
            },
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
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            autoSkip: false,
          },
        },
        y: { beginAtZero: true },
      },
    }),
    [chartData]
  );

  const patrimonyChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top" as const,
          labels: {
            usePointStyle: true,
            pointStyle: "circle" as const,
          },
        },
        tooltip: {
          mode: "index" as const,
          intersect: false,
          callbacks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label: function (context: any) {
              const value = context.raw || 0;
              const label = context.dataset.label || "";
              return `${label}: ${value.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`;
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

            {/* En Transit Widget - CCA/PCA */}
            {deferredAccounts &&
              (deferredAccounts.prepaid_expenses.total > 0 ||
                deferredAccounts.deferred_revenue.total > 0) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    En transit
                  </h3>

                  {/* CCA - Charges Constatées d'Avance */}
                  {deferredAccounts.prepaid_expenses.total > 0 && (
                    <div className="mb-3">
                      <div
                        className="flex justify-between items-center p-3 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
                        onClick={() =>
                          setExpandedTransit(
                            expandedTransit === "cca" ? null : "cca"
                          )
                        }
                      >
                        <div>
                          <p className="font-medium text-orange-800">CCA</p>
                          <p className="text-xs text-orange-600">
                            Charges constatées d&apos;avance
                          </p>
                        </div>
                        <p className="font-semibold text-orange-600">
                          {deferredAccounts.prepaid_expenses.total.toLocaleString(
                            "fr-FR",
                            {
                              style: "currency",
                              currency: "EUR",
                            }
                          )}
                        </p>
                      </div>

                      {expandedTransit === "cca" && groupedDeferredAccounts && (
                        <div className="mt-2 ml-2 space-y-1">
                          {groupedDeferredAccounts.prepaid_expenses.map(
                            (cat) => {
                              const catKey = `cca-${cat.category}`;
                              const isExpanded =
                                expandedDeferredCategories.has(catKey);
                              return (
                                <div key={cat.category}>
                                  <div
                                    className="flex justify-between items-center p-2 bg-orange-100 rounded text-xs font-medium cursor-pointer hover:bg-orange-200 transition-colors"
                                    onClick={() => {
                                      const newSet = new Set(
                                        expandedDeferredCategories
                                      );
                                      if (isExpanded) {
                                        newSet.delete(catKey);
                                      } else {
                                        newSet.add(catKey);
                                      }
                                      setExpandedDeferredCategories(newSet);
                                    }}
                                  >
                                    <span className="text-orange-800">
                                      {cat.category} ({cat.transactions.length})
                                    </span>
                                    <span className="text-orange-600">
                                      {cat.total_amount.toLocaleString(
                                        "fr-FR",
                                        {
                                          style: "currency",
                                          currency: "EUR",
                                        }
                                      )}
                                    </span>
                                  </div>
                                  {isExpanded && (
                                    <div className="ml-2 mt-1 space-y-1">
                                      {cat.transactions.map((tx) => (
                                        <div
                                          key={tx.master_id}
                                          className="flex justify-between items-center p-2 bg-orange-25 border border-orange-200 rounded text-xs"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-700 truncate">
                                              {tx.description}
                                            </p>
                                            <p className="text-gray-500">
                                              {tx.account_names.join(", ")} -{" "}
                                              {new Date(
                                                tx.latest_slave_date
                                              ).toLocaleDateString("fr-FR")}
                                            </p>
                                          </div>
                                          <p className="font-semibold text-orange-600 ml-2">
                                            {tx.total_amount.toLocaleString(
                                              "fr-FR",
                                              {
                                                style: "currency",
                                                currency: "EUR",
                                              }
                                            )}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PCA - Produits Constatés d'Avance */}
                  {deferredAccounts.deferred_revenue.total > 0 && (
                    <div>
                      <div
                        className="flex justify-between items-center p-3 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                        onClick={() =>
                          setExpandedTransit(
                            expandedTransit === "pca" ? null : "pca"
                          )
                        }
                      >
                        <div>
                          <p className="font-medium text-blue-800">PCA</p>
                          <p className="text-xs text-blue-600">
                            Produits constatés d&apos;avance
                          </p>
                        </div>
                        <p className="font-semibold text-blue-600">
                          {deferredAccounts.deferred_revenue.total.toLocaleString(
                            "fr-FR",
                            {
                              style: "currency",
                              currency: "EUR",
                            }
                          )}
                        </p>
                      </div>

                      {expandedTransit === "pca" && groupedDeferredAccounts && (
                        <div className="mt-2 ml-2 space-y-1">
                          {groupedDeferredAccounts.deferred_revenue.map(
                            (cat) => {
                              const catKey = `pca-${cat.category}`;
                              const isExpanded =
                                expandedDeferredCategories.has(catKey);
                              return (
                                <div key={cat.category}>
                                  <div
                                    className="flex justify-between items-center p-2 bg-blue-100 rounded text-xs font-medium cursor-pointer hover:bg-blue-200 transition-colors"
                                    onClick={() => {
                                      const newSet = new Set(
                                        expandedDeferredCategories
                                      );
                                      if (isExpanded) {
                                        newSet.delete(catKey);
                                      } else {
                                        newSet.add(catKey);
                                      }
                                      setExpandedDeferredCategories(newSet);
                                    }}
                                  >
                                    <span className="text-blue-800">
                                      {cat.category} ({cat.transactions.length})
                                    </span>
                                    <span className="text-blue-600">
                                      {cat.total_amount.toLocaleString(
                                        "fr-FR",
                                        {
                                          style: "currency",
                                          currency: "EUR",
                                        }
                                      )}
                                    </span>
                                  </div>
                                  {isExpanded && (
                                    <div className="ml-2 mt-1 space-y-1">
                                      {cat.transactions.map((tx) => (
                                        <div
                                          key={tx.master_id}
                                          className="flex justify-between items-center p-2 bg-blue-25 border border-blue-200 rounded text-xs"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-700 truncate">
                                              {tx.description}
                                            </p>
                                            <p className="text-gray-500">
                                              {tx.account_names.join(", ")} -{" "}
                                              {new Date(
                                                tx.latest_slave_date
                                              ).toLocaleDateString("fr-FR")}
                                            </p>
                                          </div>
                                          <p className="font-semibold text-blue-600 ml-2">
                                            {tx.total_amount.toLocaleString(
                                              "fr-FR",
                                              {
                                                style: "currency",
                                                currency: "EUR",
                                              }
                                            )}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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

                {/* Balance View Toggle */}
                <div className="flex gap-1 ml-4 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setBalanceView("comptable")}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      balanceView === "comptable"
                        ? "bg-white text-gray-800 shadow-sm font-medium"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Comptable
                  </button>
                  <button
                    onClick={() => setBalanceView("bancaire")}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      balanceView === "bancaire"
                        ? "bg-white text-gray-800 shadow-sm font-medium"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Bancaire
                  </button>
                </div>
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
                  <div className="text-right">
                    {balanceView === "comptable" ? (
                      <div className="group relative inline-block">
                        <div className="text-2xl font-bold text-green-600 cursor-help">
                          {totalRevenues.toLocaleString("fr-FR", {
                            style: "currency",
                            currency: "EUR",
                          })}
                          {(monthlySummary.pcaSortants > 0 ||
                            monthlySummary.pcaEntrants > 0) && (
                            <span className="ml-1 text-sm text-gray-400">
                              ⓘ
                            </span>
                          )}
                        </div>
                        {(monthlySummary.pcaSortants > 0 ||
                          monthlySummary.pcaEntrants > 0) && (
                          <div className="hidden group-hover:block absolute right-0 top-full mt-1 z-10 bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg whitespace-nowrap">
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span>Bancaire ce mois:</span>
                                <span>
                                  {monthlySummary.bancaireRevenues.toLocaleString(
                                    "fr-FR",
                                    { style: "currency", currency: "EUR" }
                                  )}
                                </span>
                              </div>
                              {monthlySummary.pcaSortants > 0 && (
                                <div className="flex justify-between gap-4 text-red-300">
                                  <span>- Comptabilisés plus tard:</span>
                                  <span>
                                    -
                                    {monthlySummary.pcaSortants.toLocaleString(
                                      "fr-FR",
                                      { style: "currency", currency: "EUR" }
                                    )}
                                  </span>
                                </div>
                              )}
                              {monthlySummary.pcaEntrants > 0 && (
                                <div className="flex justify-between gap-4 text-blue-300">
                                  <span>+ Mois précédents:</span>
                                  <span>
                                    +
                                    {monthlySummary.pcaEntrants.toLocaleString(
                                      "fr-FR",
                                      { style: "currency", currency: "EUR" }
                                    )}
                                  </span>
                                </div>
                              )}
                              <div className="border-t border-gray-600 pt-1 flex justify-between gap-4 font-medium">
                                <span>= Total comptable:</span>
                                <span>
                                  {totalRevenues.toLocaleString("fr-FR", {
                                    style: "currency",
                                    currency: "EUR",
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-2xl font-bold text-green-600">
                        {totalRevenues.toLocaleString("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {loadingTransactions ? (
                  <div className="text-gray-500">Chargement...</div>
                ) : monthlySummary.revenues.length ? (
                  <div className="space-y-3">
                    {monthlySummary.revenues.map((item) => (
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
                  <div className="text-right">
                    {balanceView === "comptable" ? (
                      <div className="group relative inline-block">
                        <div className="text-2xl font-bold text-red-600 cursor-help">
                          -
                          {totalExpenses.toLocaleString("fr-FR", {
                            style: "currency",
                            currency: "EUR",
                          })}
                          {(monthlySummary.ccaSortants > 0 ||
                            monthlySummary.ccaEntrants > 0) && (
                            <span className="ml-1 text-sm text-gray-400">
                              ⓘ
                            </span>
                          )}
                        </div>
                        {(monthlySummary.ccaSortants > 0 ||
                          monthlySummary.ccaEntrants > 0) && (
                          <div className="hidden group-hover:block absolute right-0 top-full mt-1 z-10 bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg whitespace-nowrap">
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span>Bancaire ce mois:</span>
                                <span>
                                  {monthlySummary.bancaireExpenses.toLocaleString(
                                    "fr-FR",
                                    { style: "currency", currency: "EUR" }
                                  )}
                                </span>
                              </div>
                              {monthlySummary.ccaSortants > 0 && (
                                <div className="flex justify-between gap-4 text-red-300">
                                  <span>- Comptabilisés plus tard:</span>
                                  <span>
                                    -
                                    {monthlySummary.ccaSortants.toLocaleString(
                                      "fr-FR",
                                      { style: "currency", currency: "EUR" }
                                    )}
                                  </span>
                                </div>
                              )}
                              {monthlySummary.ccaEntrants > 0 && (
                                <div className="flex justify-between gap-4 text-orange-300">
                                  <span>+ Mois précédents:</span>
                                  <span>
                                    +
                                    {monthlySummary.ccaEntrants.toLocaleString(
                                      "fr-FR",
                                      { style: "currency", currency: "EUR" }
                                    )}
                                  </span>
                                </div>
                              )}
                              <div className="border-t border-gray-600 pt-1 flex justify-between gap-4 font-medium">
                                <span>= Total comptable:</span>
                                <span>
                                  {totalExpenses.toLocaleString("fr-FR", {
                                    style: "currency",
                                    currency: "EUR",
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-2xl font-bold text-red-600">
                        -
                        {totalExpenses.toLocaleString("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {loadingTransactions ? (
                  <div className="text-gray-500">Chargement...</div>
                ) : monthlySummary.expenses.length ? (
                  <div className="space-y-3">
                    {monthlySummary.expenses.map((item) => (
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
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCategoryDisplayCount(3)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        categoryDisplayCount === 3
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Top 3
                    </button>
                    <button
                      onClick={() => setCategoryDisplayCount(8)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        categoryDisplayCount === 8
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Top 8
                    </button>
                  </div>
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
                  Historique du patrimoine
                </h3>
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
            <TransactionEditModal
              isOpen={showEditModal}
              transaction={
                editingTransaction
                  ? {
                      transactionId: editingTransaction.transactionId,
                      description: editingTransaction.description,
                      date: editingTransaction.date,
                      amount: editingTransaction.amount,
                      type: editingTransaction.type,
                      accountId: editingTransaction.accountId,
                      accountName: editingTransaction.accountName,
                      category: editingTransaction.category,
                      subCategory: editingTransaction.subCategory,
                      TransactionsSlaves: (
                        editingTransaction as unknown as {
                          TransactionsSlaves: TransactionSlave[];
                        }
                      ).TransactionsSlaves,
                    }
                  : null
              }
              accounts={allAccounts}
              onClose={handleCloseEditModal}
              onSave={handleSaveTransaction}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
