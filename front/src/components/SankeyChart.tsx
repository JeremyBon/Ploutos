"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with Google Charts
const Chart = dynamic(
  () => import("react-google-charts").then((mod) => mod.Chart),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    ),
  }
);

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

interface SankeyChartProps {
  transactions: Transaction[];
  accounts: VirtualAccount[];
  year: number;
}

// Color palette for categories
const INCOME_COLORS: Record<string, string> = {
  Salaire: "#22c55e",
  Revenus: "#16a34a",
  Investissements: "#15803d",
  Freelance: "#14532d",
  default: "#4ade80",
};

const EXPENSE_COLORS: Record<string, string> = {
  Logement: "#ef4444",
  Alimentation: "#f97316",
  Transport: "#eab308",
  Loisirs: "#a855f7",
  Santé: "#ec4899",
  "Charges fixes": "#dc2626",
  Shopping: "#f43f5e",
  Services: "#6366f1",
  default: "#fb7185",
};

function extractYear(dateStr: string): number {
  const datePart = dateStr.split(/[T ]/)[0];
  return parseInt(datePart.split("-")[0], 10);
}

export default function SankeyChart({
  transactions,
  accounts,
  year,
}: SankeyChartProps) {
  const sankeyData = useMemo(() => {
    const incomeByCategory = new Map<string, number>();
    const expenseByCategory = new Map<string, number>();

    transactions.forEach((transaction) => {
      transaction.TransactionsSlaves.forEach((slave) => {
        // Filter by year
        const slaveYear = extractYear(slave.date);
        if (slaveYear !== year) return;

        // Only virtual accounts (is_real = false)
        if (slave.slaveAccountIsReal !== false) return;

        const account = accounts.find(
          (acc) => acc.accountId === slave.accountId
        );
        if (!account) return;

        const category = account.category || "Autre";
        const amount = slave.amount;

        // debit = income (money IN), credit = expense (money OUT)
        if (slave.type.toLowerCase() === "debit") {
          incomeByCategory.set(
            category,
            (incomeByCategory.get(category) || 0) + amount
          );
        } else if (slave.type.toLowerCase() === "credit") {
          expenseByCategory.set(
            category,
            (expenseByCategory.get(category) || 0) + amount
          );
        }
      });
    });

    // Calculate totals
    const totalIncome = Array.from(incomeByCategory.values()).reduce(
      (sum, val) => sum + val,
      0
    );
    const totalExpenses = Array.from(expenseByCategory.values()).reduce(
      (sum, val) => sum + val,
      0
    );

    if (totalIncome === 0 && totalExpenses === 0) {
      return null;
    }

    // Build Sankey data
    // Format: [From, To, Weight, Tooltip]
    const rows: [string, string, number, string][] = [];

    // Income categories -> "Total" (add suffix to avoid cycles when same category is in both)
    incomeByCategory.forEach((amount, category) => {
      const formattedAmount = amount.toLocaleString("fr-FR", {
        style: "currency",
        currency: "EUR",
      });
      const displayName = `${category} ↗`; // Add arrow to distinguish income sources
      rows.push([
        displayName,
        "Total",
        amount,
        `${category}: ${formattedAmount}`,
      ]);
    });

    // "Total" -> Expense categories (add suffix to avoid cycles)
    expenseByCategory.forEach((amount, category) => {
      const formattedAmount = amount.toLocaleString("fr-FR", {
        style: "currency",
        currency: "EUR",
      });
      const displayName = `↘ ${category}`; // Add arrow to distinguish expenses
      rows.push([
        "Total",
        displayName,
        amount,
        `${category}: ${formattedAmount}`,
      ]);
    });

    // Add savings if income > expenses
    const savings = totalIncome - totalExpenses;
    if (savings > 0) {
      const formattedSavings = savings.toLocaleString("fr-FR", {
        style: "currency",
        currency: "EUR",
      });
      rows.push([
        "Total",
        "↘ Épargne",
        savings,
        `Épargne: ${formattedSavings}`,
      ]);
    }

    return {
      rows,
      totalIncome,
      totalExpenses,
      savings,
      incomeCategories: Array.from(incomeByCategory.keys()),
      expenseCategories: Array.from(expenseByCategory.keys()),
    };
  }, [transactions, accounts, year]);

  if (!sankeyData || sankeyData.rows.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <p>Aucune donnée disponible pour {year}</p>
        <p className="text-xs mt-2">
          ({transactions.length} transactions, {accounts.length} comptes)
        </p>
      </div>
    );
  }

  // Build color array for nodes
  const nodeColors: Record<string, string> = {
    Total: "#3b82f6", // Blue for central node
    "↘ Épargne": "#22c55e", // Green for savings
  };

  sankeyData.incomeCategories.forEach((cat) => {
    nodeColors[`${cat} ↗`] = INCOME_COLORS[cat] || INCOME_COLORS.default;
  });

  sankeyData.expenseCategories.forEach((cat) => {
    nodeColors[`↘ ${cat}`] = EXPENSE_COLORS[cat] || EXPENSE_COLORS.default;
  });

  const data = [
    ["From", "To", "Weight", { role: "tooltip", type: "string" }],
    ...sankeyData.rows,
  ];

  const options = {
    sankey: {
      node: {
        colors: Object.values(nodeColors),
        label: {
          fontName: "Inter, sans-serif",
          fontSize: 12,
          color: "#374151",
          bold: true,
        },
        nodePadding: 30,
        width: 20,
      },
      link: {
        colorMode: "gradient",
        colors: Object.values(nodeColors),
      },
    },
    tooltip: {
      textStyle: {
        fontName: "Inter, sans-serif",
        fontSize: 12,
      },
    },
  };

  return (
    <div className="w-full">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-600">Total Revenus</p>
          <p className="text-xl font-bold text-green-600">
            {sankeyData.totalIncome.toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}
          </p>
        </div>
        <div className="bg-red-50 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-600">Total Dépenses</p>
          <p className="text-xl font-bold text-red-600">
            {sankeyData.totalExpenses.toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}
          </p>
        </div>
        <div
          className={`rounded-lg p-4 text-center ${sankeyData.savings >= 0 ? "bg-blue-50" : "bg-orange-50"}`}
        >
          <p className="text-sm text-gray-600">
            {sankeyData.savings >= 0 ? "Epargne" : "Déficit"}
          </p>
          <p
            className={`text-xl font-bold ${sankeyData.savings >= 0 ? "text-blue-600" : "text-orange-600"}`}
          >
            {Math.abs(sankeyData.savings).toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}
          </p>
        </div>
      </div>

      {/* Sankey Chart */}
      <Chart
        chartType="Sankey"
        width="100%"
        height="500px"
        data={data}
        options={options}
      />

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-gray-600">Revenus</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-gray-600">Total</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-gray-600">Dépenses</span>
        </div>
      </div>
    </div>
  );
}
