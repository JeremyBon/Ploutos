"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import { Bar } from "react-chartjs-2";
import Navigation from "@/components/Navigation";
import SankeyChart from "@/components/SankeyChart";
import { API_URL } from "@/config/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ChartTooltip,
  ChartLegend,
  annotationPlugin
);

// Types
interface BudgetConsumption {
  account_id: string;
  account_name: string;
  category: string;
  annual_budget: number | null;
  monthly_budget: number | null;
  spent_month: number;
  remaining_month: number | null;
  percent_month: number | null;
  spent_ytd: number;
  remaining_ytd: number | null;
  percent_ytd: number | null;
  percent_year_elapsed: number;
  position_indicator: "ahead" | "behind" | "on_track" | null;
}

interface BudgetComparison {
  account_id: string;
  account_name: string;
  category: string;
  spent_current: number;
  spent_previous: number;
  difference: number;
  percent_change: number | null;
}

interface BudgetTableRow {
  account_id: string;
  account_name: string;
  category: string;
  monthly_budget: number | null;
  spent: number;
  remaining: number | null;
  percent: number | null;
  // Annual tracking
  annual_budget: number | null;
  spent_ytd: number;
  ecart_ytd: number | null;
  // Year position indicator
  percent_ytd: number | null;
  percent_year_elapsed: number | null;
  position_indicator: "ahead" | "behind" | "on_track" | null;
  // Year-over-year comparison
  variation_vs_n1: number | null; // Percentage variation vs same month last year
}

// Types for Sankey chart
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
  date: string;
  TransactionsSlaves: TransactionSlave[];
}

interface VirtualAccount {
  accountId: string;
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
}

export default function Budget() {
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth() + 1
  );
  const [consumptionData, setConsumptionData] = useState<BudgetConsumption[]>(
    []
  );
  const [comparisonData, setComparisonData] = useState<BudgetComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "chart" | "sankey">(
    "table"
  );

  // State for Sankey chart
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allAccounts, setAllAccounts] = useState<VirtualAccount[]>([]);
  const [loadingSankey, setLoadingSankey] = useState(false);

  // Expanded categories state (empty by default = all collapsed)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  // Inline editing state
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Fetch consumption and comparison data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [consumptionRes, comparisonRes] = await Promise.all([
        fetch(`${API_URL}/budget/${selectedYear}/consumption`),
        fetch(`${API_URL}/budget-comparison/${selectedYear}/${selectedMonth}`),
      ]);

      if (!consumptionRes.ok) {
        throw new Error("Erreur lors du chargement des données");
      }

      const consumption = await consumptionRes.json();

      // Comparison data is optional - don't fail if not available
      const comparison = comparisonRes.ok ? await comparisonRes.json() : [];

      setConsumptionData(consumption);
      setComparisonData(comparison);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch data for Sankey chart (transactions for the full year + all accounts)
  const fetchSankeyData = useCallback(async () => {
    setLoadingSankey(true);
    try {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      const [transactionsRes, accountsRes] = await Promise.all([
        fetch(
          `${API_URL}/transactions?date_from=${startDate}&date_to=${endDate}`
        ),
        fetch(`${API_URL}/accounts`),
      ]);

      if (transactionsRes.ok) {
        const transactionsData = await transactionsRes.json();
        setTransactions(transactionsData);
      }

      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAllAccounts(accountsData);
      }
    } catch (err) {
      console.error("Error fetching Sankey data:", err);
    } finally {
      setLoadingSankey(false);
    }
  }, [selectedYear]);

  // Fetch Sankey data when switching to sankey view or year changes
  useEffect(() => {
    if (viewMode === "sankey") {
      fetchSankeyData();
    }
  }, [viewMode, fetchSankeyData]);

  // Update budget via PUT API
  const updateBudget = async (accountId: string, monthlyBudget: number) => {
    setSavingAccountId(accountId);
    setSaveSuccess(null);

    try {
      const annualBudget = monthlyBudget * 12;
      const response = await fetch(`${API_URL}/budget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          year: selectedYear,
          annual_budget: annualBudget,
        }),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la sauvegarde");
      }

      setSaveSuccess(accountId);
      setTimeout(() => setSaveSuccess(null), 2000);

      // Refresh data to get updated values
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de sauvegarde");
    } finally {
      setSavingAccountId(null);
      setEditingAccountId(null);
    }
  };

  // Handle cell click to start editing
  const handleCellClick = (
    accountId: string,
    currentMonthlyBudget: number | null
  ) => {
    setEditingAccountId(accountId);
    setEditValue(currentMonthlyBudget?.toString() ?? "");
  };

  // Handle blur or Enter to save
  const handleEditComplete = (accountId: string) => {
    const value = parseFloat(editValue);
    if (!isNaN(value) && value >= 0) {
      updateBudget(accountId, value);
    } else {
      setEditingAccountId(null);
    }
  };

  // Handle key press in edit field
  const handleKeyDown = (e: React.KeyboardEvent, accountId: string) => {
    if (e.key === "Enter") {
      handleEditComplete(accountId);
    } else if (e.key === "Escape") {
      setEditingAccountId(null);
    }
  };

  // Toggle category expand/collapse
  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Get comparison data for an account
  const getComparison = (accountId: string): BudgetComparison | undefined => {
    return comparisonData.find((c) => c.account_id === accountId);
  };

  // Build table rows combining consumption and comparison data
  // consumptionData now includes ALL accounts (with or without budget)
  // Sort by spent descending for accounts without budget, by % consumed for accounts with budget
  const tableRows: BudgetTableRow[] = consumptionData
    .map((consumption) => {
      const comparison = getComparison(consumption.account_id);

      return {
        account_id: consumption.account_id,
        account_name: consumption.account_name,
        category: consumption.category,
        monthly_budget: consumption.monthly_budget,
        spent: consumption.spent_month,
        remaining: consumption.remaining_month,
        percent: consumption.percent_month,
        annual_budget: consumption.annual_budget,
        spent_ytd: consumption.spent_ytd,
        ecart_ytd: consumption.remaining_ytd,
        percent_ytd: consumption.percent_ytd,
        percent_year_elapsed: consumption.percent_year_elapsed,
        position_indicator: consumption.position_indicator,
        variation_vs_n1: comparison?.percent_change ?? null,
      };
    })
    .sort((a, b) => {
      // First: accounts with budget and percent, sorted by % descending
      if (a.percent !== null && b.percent !== null) {
        return b.percent - a.percent;
      }
      if (a.percent !== null) return -1;
      if (b.percent !== null) return 1;

      // Then: accounts without budget but with spending, sorted by spent descending
      if (a.spent > 0 && b.spent > 0) {
        return b.spent - a.spent;
      }
      if (a.spent > 0) return -1;
      if (b.spent > 0) return 1;

      // Finally: accounts with no spending, sorted alphabetically
      return a.account_name.localeCompare(b.account_name);
    });

  // Group rows by category with totals
  const groupedRows = useMemo(() => {
    const groups = tableRows.reduce(
      (acc, row) => {
        const cat = row.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(row);
        return acc;
      },
      {} as Record<string, BudgetTableRow[]>
    );

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, rows]) => ({
        category,
        rows: rows.sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0)),
        totals: (() => {
          const monthly_budget = rows.reduce(
            (s, r) => s + (r.monthly_budget ?? 0),
            0
          );
          const spent = rows.reduce((s, r) => s + r.spent, 0);
          const remaining = rows.reduce((s, r) => s + (r.remaining ?? 0), 0);
          const annual_budget = rows.reduce(
            (s, r) => s + (r.annual_budget ?? 0),
            0
          );
          const spent_ytd = rows.reduce((s, r) => s + r.spent_ytd, 0);
          const ecart_ytd = rows.reduce((s, r) => s + (r.ecart_ytd ?? 0), 0);
          const percent =
            monthly_budget > 0 ? (spent / monthly_budget) * 100 : null;
          const percent_ytd =
            annual_budget > 0 ? (spent_ytd / annual_budget) * 100 : null;
          return {
            monthly_budget,
            spent,
            remaining,
            annual_budget,
            spent_ytd,
            ecart_ytd,
            percent,
            percent_ytd,
          };
        })(),
      }));
  }, [tableRows]);

  // Chart data: only accounts with budget, sorted by % consumed descending
  const chartRows = useMemo(() => {
    return tableRows
      .filter((row) => row.monthly_budget !== null && row.percent !== null)
      .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  }, [tableRows]);

  const chartData = useMemo(() => {
    return {
      labels: chartRows.map((row) => row.account_name),
      datasets: [
        {
          label: "Budget",
          data: chartRows.map((row) => row.monthly_budget ?? 0),
          backgroundColor: "rgba(156, 163, 175, 0.7)", // gray-400
          borderColor: "rgba(156, 163, 175, 1)",
          borderWidth: 1,
        },
        {
          label: "Dépensé",
          data: chartRows.map((row) => row.spent),
          // 🟢 Vert : < 80% | 🟡 Jaune : 80-100% | 🔴 Rouge : > 100%
          backgroundColor: chartRows.map((row) => {
            const percent = row.percent ?? 0;
            if (percent > 100) return "rgba(220, 38, 38, 0.7)"; // red-600
            if (percent >= 80) return "rgba(202, 138, 4, 0.7)"; // yellow-600
            return "rgba(22, 163, 74, 0.7)"; // green-600
          }),
          borderColor: chartRows.map((row) => {
            const percent = row.percent ?? 0;
            if (percent > 100) return "rgba(220, 38, 38, 1)";
            if (percent >= 80) return "rgba(202, 138, 4, 1)";
            return "rgba(22, 163, 74, 1)";
          }),
          borderWidth: 1,
        },
      ],
    };
  }, [chartRows]);

  const chartOptions = useMemo(
    () => ({
      indexAxis: "y" as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top" as const,
        },
        tooltip: {
          callbacks: {
            label: (context: { dataset: { label?: string }; raw: unknown }) => {
              const value = context.raw as number;
              const formatted = new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
              }).format(value);
              return `${context.dataset.label}: ${formatted}`;
            },
            afterBody: (
              tooltipItems: Array<{
                dataIndex: number;
                dataset: { label?: string };
              }>
            ) => {
              const index = tooltipItems[0]?.dataIndex;
              if (index === undefined) return "";
              const row = chartRows[index];
              if (!row) return "";
              return `Consommé: ${row.percent?.toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: (value: string | number) => {
              const numValue =
                typeof value === "string" ? parseFloat(value) : value;
              return new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(numValue);
            },
          },
        },
        y: {
          ticks: {
            font: {
              size: 11,
            },
          },
        },
      },
    }),
    [chartRows]
  );

  // YTD Chart data: percentage of annual budget consumed with year position line
  const chartRowsYtd = useMemo(() => {
    return tableRows
      .filter((row) => row.annual_budget !== null && row.percent_ytd !== null)
      .sort((a, b) => (b.percent_ytd ?? 0) - (a.percent_ytd ?? 0));
  }, [tableRows]);

  // Get year elapsed percentage (same for all rows with budget)
  const percentYearElapsed = useMemo(() => {
    const rowWithData = chartRowsYtd.find(
      (r) => r.percent_year_elapsed !== null
    );
    return rowWithData?.percent_year_elapsed ?? 0;
  }, [chartRowsYtd]);

  const chartDataYtd = useMemo(() => {
    return {
      labels: chartRowsYtd.map((row) => row.account_name),
      datasets: [
        {
          label: "% Budget consommé (YTD)",
          data: chartRowsYtd.map((row) => row.percent_ytd ?? 0),
          // 🟢 Vert : < 80% | 🟡 Jaune : 80-100% | 🔴 Rouge : > 100%
          backgroundColor: chartRowsYtd.map((row) => {
            const percent = row.percent_ytd ?? 0;
            if (percent > 100) return "rgba(220, 38, 38, 0.7)"; // red-600
            if (percent >= 80) return "rgba(202, 138, 4, 0.7)"; // yellow-600
            return "rgba(22, 163, 74, 0.7)"; // green-600
          }),
          borderColor: chartRowsYtd.map((row) => {
            const percent = row.percent_ytd ?? 0;
            if (percent > 100) return "rgba(220, 38, 38, 1)";
            if (percent >= 80) return "rgba(202, 138, 4, 1)";
            return "rgba(22, 163, 74, 1)";
          }),
          borderWidth: 1,
        },
      ],
    };
  }, [chartRowsYtd]);

  const chartOptionsYtd = useMemo(
    () => ({
      indexAxis: "y" as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top" as const,
        },
        tooltip: {
          callbacks: {
            label: (context: { dataset: { label?: string }; raw: unknown }) => {
              const value = context.raw as number;
              return `${context.dataset.label}: ${value.toFixed(1)}%`;
            },
            afterBody: (
              tooltipItems: Array<{
                dataIndex: number;
                dataset: { label?: string };
              }>
            ) => {
              const index = tooltipItems[0]?.dataIndex;
              if (index === undefined) return "";
              const row = chartRowsYtd[index];
              if (!row) return "";
              return `Dépensé: ${formatAmount(row.spent_ytd)} / ${formatAmount(row.annual_budget)}`;
            },
          },
        },
        annotation: {
          annotations: {
            yearPositionLine: {
              type: "line" as const,
              xMin: percentYearElapsed,
              xMax: percentYearElapsed,
              borderColor: "rgba(59, 130, 246, 0.8)", // blue-500
              borderWidth: 3,
              borderDash: [6, 4],
              label: {
                display: true,
                content: `Position année: ${percentYearElapsed.toFixed(0)}%`,
                position: "start" as const,
                backgroundColor: "rgba(59, 130, 246, 0.9)",
                color: "white",
                font: {
                  size: 11,
                  weight: "bold" as const,
                },
                padding: 4,
              },
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: Math.max(120, ...chartRowsYtd.map((r) => r.percent_ytd ?? 0)),
          ticks: {
            callback: (value: string | number) => {
              const numValue =
                typeof value === "string" ? parseFloat(value) : value;
              return `${numValue}%`;
            },
          },
        },
        y: {
          ticks: {
            font: {
              size: 11,
            },
          },
        },
      },
    }),
    [chartRowsYtd, percentYearElapsed]
  );

  // Format amount for display
  const formatAmount = (amount: number | null): string => {
    if (amount === null) return "—";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  // Format percent for display
  const formatPercent = (percent: number | null): string => {
    if (percent === null) return "—";
    return `${percent.toFixed(1)}%`;
  };

  // Get color class based on percent
  // 🟢 Vert : < 80% | 🟡 Jaune : 80-100% | 🔴 Rouge : > 100%
  const getPercentColor = (percent: number | null): string => {
    if (percent === null) return "text-gray-400";
    if (percent > 100) return "text-red-600 font-semibold";
    if (percent >= 80) return "text-yellow-600";
    return "text-green-600";
  };

  // Get remaining color
  const getRemainingColor = (remaining: number | null): string => {
    if (remaining === null) return "text-gray-400";
    if (remaining < 0) return "text-red-600 font-semibold";
    return "text-gray-700";
  };

  // Get écart YTD color (positive = under budget = green, negative = over budget = red)
  const getEcartColor = (ecart: number | null): string => {
    if (ecart === null) return "text-gray-400";
    if (ecart < 0) return "text-red-600 font-semibold";
    if (ecart > 0) return "text-green-600";
    return "text-gray-700";
  };

  // Format variation vs N-1 for display
  const formatVariation = (variation: number | null): string => {
    if (variation === null) return "—";
    const sign = variation >= 0 ? "+" : "";
    const prevMonthName = getMonthNameShort(selectedMonth);
    return `${sign}${variation.toFixed(0)}% vs ${prevMonthName} ${selectedYear - 1}`;
  };

  // Get variation color (green if decrease = spending less, red if increase = spending more)
  const getVariationColor = (variation: number | null): string => {
    if (variation === null) return "text-gray-400";
    if (variation < 0) return "text-green-600"; // Decrease = good
    if (variation > 0) return "text-red-600"; // Increase = bad
    return "text-gray-700";
  };

  // Format year position indicator: "79% consommé | 97% de l'année → 🟢 +18%"
  const formatYearPosition = (
    percentYtd: number | null,
    percentYearElapsed: number | null,
    indicator: "ahead" | "behind" | "on_track" | null
  ): string => {
    if (
      percentYtd === null ||
      percentYearElapsed === null ||
      indicator === null
    ) {
      return "—";
    }

    const diff = percentYearElapsed - percentYtd;
    const emoji =
      indicator === "ahead" ? "🟢" : indicator === "on_track" ? "🟡" : "🔴";
    const sign = diff >= 0 ? "+" : "";

    return `${percentYtd.toFixed(0)}% | ${percentYearElapsed.toFixed(0)}% année → ${emoji} ${sign}${diff.toFixed(0)}%`;
  };

  const getMonthNameShort = (month: number): string => {
    const months = [
      "jan",
      "fév",
      "mars",
      "avr",
      "mai",
      "juin",
      "juil",
      "août",
      "sept",
      "oct",
      "nov",
      "déc",
    ];
    return months[month - 1];
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Title and Month Selector */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Budget</h1>

          {/* Year Selector */}
          <div className="flex justify-center items-center gap-4 mt-4">
            {/* Previous Year Button */}
            <button
              onClick={() => setSelectedYear(selectedYear - 1)}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              title="Année précédente"
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

            {/* Next Year Button */}
            <button
              onClick={() => setSelectedYear(selectedYear + 1)}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              title="Année suivante"
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

            {/* View Toggle */}
            <div className="flex rounded-lg border border-gray-300 overflow-hidden ml-4">
              <button
                onClick={() => setViewMode("table")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === "table"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                title="Vue tableau"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("chart")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  viewMode === "chart"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                title="Vue graphique"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("sankey")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  viewMode === "sankey"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                title="Vue Sankey - Flux financiers"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M3 3a1 1 0 000 2h1.586l1.707 1.707a1 1 0 001.414-1.414L6.414 4H13a1 1 0 100-2H3z" />
                  <path d="M3 9a1 1 0 000 2h6a1 1 0 100-2H3z" />
                  <path d="M3 15a1 1 0 000 2h1.586l1.707 1.707a1 1 0 001.414-1.414L6.414 16H17a1 1 0 100-2H3z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Loading / Error states */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2">Chargement...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-red-500">
            <p>{error}</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Réessayer
            </button>
          </div>
        ) : tableRows.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            Aucune catégorie trouvée
          </div>
        ) : viewMode === "chart" ? (
          <div className="space-y-6">
            {/* Budget vs Spent Chart - Monthly */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Budget vs Dépensé - {getMonthName(selectedMonth)} {selectedYear}
              </h2>
              {chartRows.length > 0 ? (
                <div style={{ height: Math.max(300, chartRows.length * 40) }}>
                  <Bar data={chartData} options={chartOptions} />
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  Aucune catégorie avec budget défini
                </div>
              )}
            </div>

            {/* YTD Budget Position Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Position annuelle - {selectedYear}
              </h2>
              {chartRowsYtd.length > 0 ? (
                <div
                  style={{ height: Math.max(300, chartRowsYtd.length * 40) }}
                >
                  <Bar data={chartDataYtd} options={chartOptionsYtd} />
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  Aucune catégorie avec budget défini
                </div>
              )}
            </div>
          </div>
        ) : viewMode === "sankey" ? (
          /* Sankey Diagram */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Flux financiers - {selectedYear}
            </h2>
            {loadingSankey ? (
              <div className="text-center text-gray-500 py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2">Chargement des données...</p>
              </div>
            ) : (
              <SankeyChart
                transactions={transactions}
                accounts={allAccounts}
                year={selectedYear}
              />
            )}
          </div>
        ) : (
          /* Budget Table */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Catégorie
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Budget mensuel
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dépensé
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    vs N-1
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reste
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    %
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-300">
                    Budget annuel
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dépensé YTD
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Écart YTD
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position année
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {groupedRows.map((group) => {
                  const isExpanded = expandedCategories.has(group.category);
                  return (
                    <Fragment key={group.category}>
                      {/* Category header row with totals */}
                      <tr
                        className="bg-blue-100 cursor-pointer hover:bg-blue-200 transition-colors"
                        onClick={() => toggleCategory(group.category)}
                      >
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                          <span className="inline-flex items-center gap-2">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {group.category}
                          </span>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-700">
                          {formatAmount(group.totals.monthly_budget)}
                        </td>
                        <td
                          className={`px-6 py-3 whitespace-nowrap text-sm text-right font-semibold ${getPercentColor(group.totals.percent)}`}
                        >
                          {formatAmount(group.totals.spent)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-xs text-right text-gray-500">
                          —
                        </td>
                        <td
                          className={`px-6 py-3 whitespace-nowrap text-sm text-right font-semibold ${getRemainingColor(group.totals.remaining)}`}
                        >
                          {formatAmount(group.totals.remaining)}
                        </td>
                        <td
                          className={`px-6 py-3 whitespace-nowrap text-sm text-right font-semibold ${getPercentColor(group.totals.percent)}`}
                        >
                          {formatPercent(group.totals.percent)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-700 border-l border-gray-200">
                          {formatAmount(group.totals.annual_budget)}
                        </td>
                        <td
                          className={`px-6 py-3 whitespace-nowrap text-sm text-right font-semibold ${getPercentColor(group.totals.percent_ytd)}`}
                        >
                          {formatAmount(group.totals.spent_ytd)}
                        </td>
                        <td
                          className={`px-6 py-3 whitespace-nowrap text-sm text-right font-semibold ${getEcartColor(group.totals.ecart_ytd)}`}
                        >
                          {formatAmount(group.totals.ecart_ytd)}
                        </td>
                        <td
                          className={`px-6 py-3 whitespace-nowrap text-sm text-right font-semibold ${getPercentColor(group.totals.percent_ytd)}`}
                        >
                          {formatPercent(group.totals.percent_ytd)}
                        </td>
                      </tr>
                      {/* Individual rows */}
                      {isExpanded &&
                        group.rows.map((row) => {
                          const hasBudget = row.monthly_budget !== null;
                          const noBudgetStyle = !hasBudget
                            ? "text-orange-500 italic"
                            : "text-gray-700";

                          return (
                            <tr
                              key={row.account_id}
                              className={`hover:bg-gray-50 transition-colors ${!hasBudget ? "bg-orange-50/30" : ""}`}
                            >
                              <td className="px-6 py-4 pl-10 whitespace-nowrap text-sm font-medium text-gray-900">
                                {row.account_name}
                              </td>
                              <td
                                className={`px-6 py-4 whitespace-nowrap text-sm text-right ${noBudgetStyle}`}
                              >
                                {editingAccountId === row.account_id ? (
                                  <input
                                    type="number"
                                    className="w-24 px-2 py-1 text-right border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={editValue}
                                    onChange={(e) =>
                                      setEditValue(e.target.value)
                                    }
                                    onBlur={() =>
                                      handleEditComplete(row.account_id)
                                    }
                                    onKeyDown={(e) =>
                                      handleKeyDown(e, row.account_id)
                                    }
                                    autoFocus
                                    min="0"
                                    step="any"
                                  />
                                ) : savingAccountId === row.account_id ? (
                                  <span className="inline-flex items-center gap-1">
                                    <svg
                                      className="animate-spin h-4 w-4 text-blue-600"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      />
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                      />
                                    </svg>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() =>
                                      handleCellClick(
                                        row.account_id,
                                        row.monthly_budget
                                      )
                                    }
                                    className="cursor-pointer hover:bg-blue-50 hover:text-blue-700 px-2 py-1 rounded transition-colors inline-flex items-center gap-1"
                                    title="Cliquer pour modifier"
                                  >
                                    {hasBudget
                                      ? formatAmount(row.monthly_budget)
                                      : "—"}
                                    {saveSuccess === row.account_id && (
                                      <svg
                                        className="h-4 w-4 text-green-500"
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                      >
                                        <path
                                          fillRule="evenodd"
                                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                    )}
                                  </button>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                                {formatAmount(row.spent)}
                              </td>
                              <td
                                className={`px-6 py-4 whitespace-nowrap text-xs text-right ${getVariationColor(row.variation_vs_n1)}`}
                              >
                                {formatVariation(row.variation_vs_n1)}
                              </td>
                              <td
                                className={`px-6 py-4 whitespace-nowrap text-sm text-right ${!hasBudget ? noBudgetStyle : getRemainingColor(row.remaining)}`}
                              >
                                {hasBudget ? formatAmount(row.remaining) : "—"}
                              </td>
                              <td
                                className={`px-6 py-4 whitespace-nowrap text-sm text-right ${!hasBudget ? noBudgetStyle : getPercentColor(row.percent)}`}
                              >
                                {hasBudget ? formatPercent(row.percent) : "—"}
                              </td>
                              <td
                                className={`px-6 py-4 whitespace-nowrap text-sm text-right border-l border-gray-200 ${noBudgetStyle}`}
                              >
                                {hasBudget
                                  ? formatAmount(row.annual_budget)
                                  : "—"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                                {formatAmount(row.spent_ytd)}
                              </td>
                              <td
                                className={`px-6 py-4 whitespace-nowrap text-sm text-right ${!hasBudget ? noBudgetStyle : getEcartColor(row.ecart_ytd)}`}
                              >
                                {hasBudget ? formatAmount(row.ecart_ytd) : "—"}
                              </td>
                              <td
                                className={`px-6 py-4 whitespace-nowrap text-sm text-right ${!hasBudget ? noBudgetStyle : ""}`}
                              >
                                {formatYearPosition(
                                  row.percent_ytd,
                                  row.percent_year_elapsed,
                                  row.position_indicator
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
