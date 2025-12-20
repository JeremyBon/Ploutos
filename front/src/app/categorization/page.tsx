"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Navigation from "@/components/Navigation";
import TransactionSlavesPreviewModal from "@/components/TransactionSlavesPreviewModal";
import { API_URL } from "@/config/api";

interface Account {
  accountId: string;
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
}

interface SplitItem {
  account_id: string;
  percentage: number;
}

interface ProcessorConfig {
  splits?: SplitItem[];
  transaction_filter?: string;
  loan_amount?: number;
  annual_rate?: number;
  duration_months?: number;
  start_date?: string;
  capital_account_id?: string;
  interest_account_id?: string;
  [key: string]: unknown;
}

interface MatchCondition {
  match_type: string;
  match_value: string;
}

interface ConditionGroup {
  operator: "and" | "or";
  conditions: MatchCondition[];
}

interface CategorizationRule {
  ruleId: string;
  description: string;
  condition_groups: ConditionGroup[];
  account_ids: string[] | null;
  priority: number;
  enabled: boolean;
  processor_type: string;
  processor_config: ProcessorConfig;
  created_at: string;
  updated_at: string;
  last_applied_at: string | null;
}

interface MatchingStats {
  total_enabled_rules: number;
  total_uncategorized_transactions: number;
  rules: CategorizationRule[];
}

interface MatchingResult {
  success: boolean;
  message: string | null;
  processed: number;
  categorized: number;
  failed: number;
  details: Array<{
    transaction_id: string;
    description: string;
    matched_rule: string | null;
    match_type: string | null;
  }>;
}

interface PreviewSlave {
  account_name: string;
  amount: number;
}

interface PreviewMatch {
  transaction_id: string;
  description: string;
  amount: number;
  date: string;
  slaves: PreviewSlave[];
}

interface MatchingPreviewResult {
  success: boolean;
  message: string | null;
  rule_id: string;
  rule_description: string;
  total_matches: number;
  matches: PreviewMatch[];
}

const MATCH_TYPES = [
  { value: "contains", label: "Contient", isAmount: false },
  { value: "starts_with", label: "Commence par", isAmount: false },
  { value: "exact", label: "Exact", isAmount: false },
  { value: "regex", label: "Regex", isAmount: false },
  { value: "amount_gt", label: "Montant >", isAmount: true },
  { value: "amount_lt", label: "Montant <", isAmount: true },
  { value: "amount_gte", label: "Montant >=", isAmount: true },
  { value: "amount_lte", label: "Montant <=", isAmount: true },
  { value: "amount_eq", label: "Montant =", isAmount: true },
];

const isAmountMatchType = (matchType: string) =>
  MATCH_TYPES.find((t) => t.value === matchType)?.isAmount ?? false;

const CATEGORIZATION_TYPES = [
  { value: "splitItem", label: "Classique" },
  { value: "loan", label: "Remboursement de prêt" },
];

const TRANSACTION_FILTERS = [
  { value: "all", label: "Toutes les transactions" },
  { value: "debit", label: "Dépenses uniquement" },
  { value: "credit", label: "Recettes uniquement" },
];

export default function Categorization() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [realAccounts, setRealAccounts] = useState<Account[]>([]);
  const [stats, setStats] = useState<MatchingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(
    null
  );
  const [matchingResult, setMatchingResult] = useState<MatchingResult | null>(
    null
  );
  const [previewResult, setPreviewResult] =
    useState<MatchingPreviewResult | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedPreviewMatch, setSelectedPreviewMatch] =
    useState<PreviewMatch | null>(null);

  // Form state
  const [advancedMode, setAdvancedMode] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    condition_groups: [
      {
        operator: "and" as const,
        conditions: [{ match_type: "contains", match_value: "" }],
      },
    ] as ConditionGroup[],
    account_ids: [] as string[],
    priority: 0,
    enabled: true,
    categorization_type: "splitItem",
    processor_type: "simple_split",
    processor_config: {
      splits: [{ account_id: "", percentage: 100 }],
      transaction_filter: "all",
    } as ProcessorConfig,
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/accounts`);
      if (!response.ok) throw new Error("Failed to fetch accounts");
      const data = await response.json();
      setAccounts(data.filter((acc: Account) => !acc.is_real));
      setRealAccounts(data.filter((acc: Account) => acc.is_real));
    } catch (error) {
      console.error("Error fetching accounts:", error);
      setError("Erreur lors du chargement des comptes");
    }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/categorization-rules`);
      if (!response.ok) throw new Error("Failed to fetch rules");
      const data = await response.json();
      setRules(data);
    } catch (error) {
      console.error("Error fetching rules:", error);
      setError("Erreur lors du chargement des règles");
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/matching/stats`);
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchAccounts(), fetchRules(), fetchStats()]);
      setLoading(false);
    };
    fetchData();
  }, [fetchAccounts, fetchRules, fetchStats]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const url = editingRule
        ? `${API_URL}/categorization-rules/${editingRule.ruleId}`
        : `${API_URL}/categorization-rules`;

      const method = editingRule ? "PUT" : "POST";

      const body = {
        ...formData,
        account_ids:
          formData.account_ids.length > 0 ? formData.account_ids : null,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.detail || "Failed to save rule";
        throw new Error(errorMessage);
      }

      await fetchRules();
      await fetchStats();
      setShowRuleForm(false);
      setEditingRule(null);
      resetForm();
    } catch (error) {
      console.error("Error saving rule:", error);
      setError(
        (error as Error).message || "Erreur lors de la sauvegarde de la règle"
      );
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette règle ?")) return;

    try {
      const response = await fetch(
        `${API_URL}/categorization-rules/${ruleId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to delete rule");

      await fetchRules();
      await fetchStats();
    } catch (error) {
      console.error("Error deleting rule:", error);
      setError("Erreur lors de la suppression de la règle");
    }
  };

  const handleToggle = async (ruleId: string) => {
    try {
      const response = await fetch(
        `${API_URL}/categorization-rules/${ruleId}/toggle`,
        {
          method: "PATCH",
        }
      );

      if (!response.ok) throw new Error("Failed to toggle rule");

      await fetchRules();
      await fetchStats();
    } catch (error) {
      console.error("Error toggling rule:", error);
      setError("Erreur lors de l'activation/désactivation de la règle");
    }
  };

  const handleEdit = (rule: CategorizationRule) => {
    setEditingRule(rule);
    const categorizationType =
      rule.processor_type === "loan" ? "loan" : "splitItem";

    // Determine if advanced mode based on rule complexity
    const isAdvanced =
      rule.condition_groups.length > 1 ||
      rule.condition_groups.some((g) => g.conditions.length > 1);
    setAdvancedMode(isAdvanced);

    setFormData({
      description: rule.description,
      condition_groups: JSON.parse(JSON.stringify(rule.condition_groups)),
      account_ids: rule.account_ids ? [...rule.account_ids] : [],
      priority: rule.priority,
      enabled: rule.enabled,
      categorization_type: categorizationType,
      processor_type: rule.processor_type,
      processor_config: JSON.parse(JSON.stringify(rule.processor_config)),
    });
    setShowRuleForm(true);
  };

  const handleProcessMatching = async () => {
    // Prevent double-click
    if (processing) return;

    if (
      !confirm(
        "Lancer le matching automatique sur toutes les transactions non catégorisées ?"
      )
    )
      return;

    setProcessing(true);
    setError(null);
    setMatchingResult(null);

    try {
      const response = await fetch(`${API_URL}/matching/process`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to process matching");

      const result = await response.json();
      setMatchingResult(result);
      await fetchStats();
    } catch (error) {
      console.error("Error processing matching:", error);
      setError("Erreur lors du matching");
    } finally {
      setProcessing(false);
    }
  };

  const handlePreviewRule = async (ruleId: string) => {
    setError(null);

    try {
      const response = await fetch(`${API_URL}/matching/preview/${ruleId}`);

      if (!response.ok) throw new Error("Failed to preview rule");

      const result = await response.json();
      setPreviewResult(result);
      setShowPreviewModal(true);
    } catch (error) {
      console.error("Error previewing rule:", error);
      setError("Erreur lors de la prévisualisation");
    }
  };

  const resetForm = () => {
    setAdvancedMode(false);
    setFormData({
      description: "",
      condition_groups: [
        {
          operator: "and" as const,
          conditions: [{ match_type: "contains", match_value: "" }],
        },
      ],
      account_ids: [],
      priority: 0,
      enabled: true,
      categorization_type: "splitItem",
      processor_type: "simple_split",
      processor_config: {
        splits: [{ account_id: "", percentage: 100 }],
        transaction_filter: "all",
      },
    });
  };

  const isRuleFormDirty = useMemo(() => {
    if (!editingRule) return true; // Always allow submit for new rules

    // Compare description
    if (formData.description !== editingRule.description) return true;

    // Compare priority
    if (formData.priority !== editingRule.priority) return true;

    // Compare enabled
    if (formData.enabled !== editingRule.enabled) return true;

    // Compare processor_type
    if (formData.processor_type !== editingRule.processor_type) return true;

    // Compare condition_groups (deep comparison)
    if (
      JSON.stringify(formData.condition_groups) !==
      JSON.stringify(editingRule.condition_groups)
    )
      return true;

    // Compare account_ids
    const originalAccountIds = editingRule.account_ids || [];
    if (
      JSON.stringify(formData.account_ids) !==
      JSON.stringify(originalAccountIds)
    )
      return true;

    // Compare processor_config (deep comparison)
    if (
      JSON.stringify(formData.processor_config) !==
      JSON.stringify(editingRule.processor_config)
    )
      return true;

    return false;
  }, [editingRule, formData]);

  const getAccountName = (accountId?: string) => {
    if (!accountId) return "N/A";
    const account = accounts.find((acc) => acc.accountId === accountId);
    return account
      ? `${account.name} (${account.category} - ${account.sub_category})`
      : accountId;
  };

  const groupAccountsByCategory = (accountList: Account[]) => {
    return accountList.reduce(
      (acc, account) => {
        const key = account.category;
        if (!acc[key]) acc[key] = [];
        acc[key].push(account);
        return acc;
      },
      {} as Record<string, Account[]>
    );
  };

  const formatSplits = (config: ProcessorConfig, processorType: string) => {
    if (processorType === "loan") {
      return (
        <div className="text-xs space-y-1">
          <div>
            <span className="font-semibold">Capital:</span>{" "}
            {getAccountName(config.capital_account_id)}
          </div>
          <div>
            <span className="font-semibold">Intérêts:</span>{" "}
            {getAccountName(config.interest_account_id)}
          </div>
          <div className="text-gray-500 mt-1">
            {config.loan_amount}€ sur {config.duration_months} mois à{" "}
            {config.annual_rate}%
          </div>
        </div>
      );
    }
    if (config.splits && config.splits.length > 0) {
      return config.splits.map((split, idx) => (
        <div key={idx} className="text-xs">
          {getAccountName(split.account_id)}: {split.percentage}%
        </div>
      ));
    }
  };

  const getMatchTypeLabel = (matchType: string) => {
    const type = MATCH_TYPES.find((t) => t.value === matchType);
    return type?.label || matchType;
  };

  const formatConditions = (conditionGroups: ConditionGroup[]) => {
    if (!conditionGroups || conditionGroups.length === 0) {
      return <span className="text-gray-400">Aucune condition</span>;
    }

    return (
      <div className="text-xs space-y-1">
        {conditionGroups.map((group, gIndex) => (
          <div key={gIndex}>
            {gIndex > 0 && (
              <span className="text-blue-600 font-semibold">OU </span>
            )}
            {group.conditions.map((cond, cIndex) => (
              <span key={cIndex}>
                {cIndex > 0 && (
                  <span className="text-gray-400">
                    {group.operator === "and" ? " ET " : " OU "}
                  </span>
                )}
                <span className="bg-gray-100 px-1 rounded">
                  {getMatchTypeLabel(cond.match_type)}
                </span>{" "}
                <span className="font-mono">{cond.match_value}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Navigation />

      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Catégorisation Automatique
          </h1>
          <p className="text-gray-600">
            Gérez les règles de catégorisation automatique des transactions
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Stats Dashboard */}
        {stats && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-600 mb-2">
                Règles actives
              </div>
              <div className="text-3xl font-bold text-blue-600">
                {stats.total_enabled_rules}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-600 mb-2">
                Transactions non catégorisées
              </div>
              <div className="text-3xl font-bold text-orange-600">
                {stats.total_uncategorized_transactions}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <button
                onClick={handleProcessMatching}
                disabled={
                  processing || stats.total_uncategorized_transactions === 0
                }
                className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
                  processing || stats.total_uncategorized_transactions === 0
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {processing ? "Traitement..." : "🚀 Lancer le matching"}
              </button>
              <div className="text-xs text-gray-500 mt-2 text-center">
                Applique toutes les règles actives
              </div>
            </div>
          </div>
        )}

        {/* Matching Result */}
        {matchingResult && (
          <div className="mb-8 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 text-green-700">
              ✅ Résultat du matching
            </h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-sm text-gray-600">Traitées</div>
                <div className="text-2xl font-bold">
                  {matchingResult.processed}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Catégorisées</div>
                <div className="text-2xl font-bold text-green-600">
                  {matchingResult.categorized}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Échecs</div>
                <div className="text-2xl font-bold text-red-600">
                  {matchingResult.failed}
                </div>
              </div>
            </div>
            {matchingResult.details.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Détails ({matchingResult.details.slice(0, 5).length}{" "}
                  premières)
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {matchingResult.details.slice(0, 5).map((detail, idx) => (
                    <div
                      key={idx}
                      className="text-sm bg-gray-50 p-2 rounded border border-gray-200"
                    >
                      <div className="font-medium truncate">
                        {detail.description}
                      </div>
                      <div className="text-gray-600 text-xs">
                        Règle: {detail.matched_rule} ({detail.match_type})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            Règles de catégorisation
          </h2>
          <button
            onClick={() => {
              setEditingRule(null);
              resetForm();
              setShowRuleForm(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            + Nouvelle règle
          </button>
        </div>

        {/* Rule Form Modal */}
        {showRuleForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-xl font-bold mb-4">
                  {editingRule ? "Modifier la règle" : "Nouvelle règle"}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Section: Identification */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">
                      Identification
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description de la règle
                        </label>
                        <input
                          type="text"
                          value={formData.description}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              description: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Priorité
                        </label>
                        <input
                          type="number"
                          value={formData.priority}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              priority: parseInt(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          min="0"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Plus élevé = plus prioritaire
                        </p>
                      </div>
                      <div className="flex items-center pt-6">
                        <input
                          type="checkbox"
                          checked={formData.enabled}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              enabled: e.target.checked,
                            })
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label className="ml-2 block text-sm text-gray-700">
                          Règle activée
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Section: Conditions de matching */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h4 className="text-sm font-semibold text-gray-900">
                        Conditions de matching
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          Mode avancé
                        </span>
                        <button
                          type="button"
                          onClick={() => setAdvancedMode(!advancedMode)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            advancedMode ? "bg-blue-600" : "bg-gray-200"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              advancedMode ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {!advancedMode ? (
                      /* Mode simple - une seule condition */
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Type de correspondance
                          </label>
                          <select
                            value={
                              formData.condition_groups[0]?.conditions[0]
                                ?.match_type || "contains"
                            }
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                condition_groups: [
                                  {
                                    operator: "and",
                                    conditions: [
                                      {
                                        match_type: e.target.value,
                                        match_value:
                                          formData.condition_groups[0]
                                            ?.conditions[0]?.match_value || "",
                                      },
                                    ],
                                  },
                                ],
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          >
                            {MATCH_TYPES.map((type) => (
                              <option
                                key={type.value}
                                value={type.value}
                                className="text-gray-900"
                              >
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {isAmountMatchType(
                              formData.condition_groups[0]?.conditions[0]
                                ?.match_type || "contains"
                            )
                              ? "Montant"
                              : "Motif à rechercher"}
                          </label>
                          <input
                            type={
                              isAmountMatchType(
                                formData.condition_groups[0]?.conditions[0]
                                  ?.match_type || "contains"
                              )
                                ? "number"
                                : "text"
                            }
                            step={
                              isAmountMatchType(
                                formData.condition_groups[0]?.conditions[0]
                                  ?.match_type || "contains"
                              )
                                ? "0.01"
                                : undefined
                            }
                            value={
                              formData.condition_groups[0]?.conditions[0]
                                ?.match_value || ""
                            }
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                condition_groups: [
                                  {
                                    operator: "and",
                                    conditions: [
                                      {
                                        match_type:
                                          formData.condition_groups[0]
                                            ?.conditions[0]?.match_type ||
                                          "contains",
                                        match_value: e.target.value,
                                      },
                                    ],
                                  },
                                ],
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder={
                              isAmountMatchType(
                                formData.condition_groups[0]?.conditions[0]
                                  ?.match_type || "contains"
                              )
                                ? "100.00"
                                : "CARREFOUR"
                            }
                            required
                          />
                        </div>
                      </div>
                    ) : (
                      /* Mode avancé - groupes de conditions */
                      <div className="space-y-4">
                        {formData.condition_groups.map((group, groupIndex) => (
                          <div key={groupIndex}>
                            {groupIndex > 0 && (
                              <div className="text-center py-2">
                                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                                  OU
                                </span>
                              </div>
                            )}
                            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                              <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    Si
                                  </span>
                                  <select
                                    value={group.operator}
                                    onChange={(e) => {
                                      const newGroups = [
                                        ...formData.condition_groups,
                                      ];
                                      newGroups[groupIndex] = {
                                        ...group,
                                        operator: e.target.value as
                                          | "and"
                                          | "or",
                                      };
                                      setFormData({
                                        ...formData,
                                        condition_groups: newGroups,
                                      });
                                    }}
                                    className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                                  >
                                    <option
                                      value="and"
                                      className="text-gray-900"
                                    >
                                      TOUTES les conditions
                                    </option>
                                    <option
                                      value="or"
                                      className="text-gray-900"
                                    >
                                      AU MOINS UNE condition
                                    </option>
                                  </select>
                                </div>
                                {formData.condition_groups.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormData({
                                        ...formData,
                                        condition_groups:
                                          formData.condition_groups.filter(
                                            (_, i) => i !== groupIndex
                                          ),
                                      });
                                    }}
                                    className="text-red-500 hover:text-red-700 text-sm"
                                  >
                                    Supprimer le groupe
                                  </button>
                                )}
                              </div>

                              <div className="space-y-2">
                                {group.conditions.map(
                                  (condition, condIndex) => (
                                    <div key={condIndex}>
                                      {condIndex > 0 && (
                                        <div className="text-center text-sm text-gray-500 py-1">
                                          {group.operator === "and"
                                            ? "ET"
                                            : "OU"}
                                        </div>
                                      )}
                                      <div className="flex gap-2 items-center bg-white p-2 rounded border border-gray-200">
                                        <select
                                          value={condition.match_type}
                                          onChange={(e) => {
                                            const newGroups = [
                                              ...formData.condition_groups,
                                            ];
                                            newGroups[groupIndex].conditions[
                                              condIndex
                                            ] = {
                                              ...condition,
                                              match_type: e.target.value,
                                            };
                                            setFormData({
                                              ...formData,
                                              condition_groups: newGroups,
                                            });
                                          }}
                                          className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                                        >
                                          {MATCH_TYPES.map((type) => (
                                            <option
                                              key={type.value}
                                              value={type.value}
                                              className="text-gray-900"
                                            >
                                              {type.label}
                                            </option>
                                          ))}
                                        </select>
                                        <input
                                          type={
                                            isAmountMatchType(
                                              condition.match_type
                                            )
                                              ? "number"
                                              : "text"
                                          }
                                          step={
                                            isAmountMatchType(
                                              condition.match_type
                                            )
                                              ? "0.01"
                                              : undefined
                                          }
                                          value={condition.match_value}
                                          onChange={(e) => {
                                            const newGroups = [
                                              ...formData.condition_groups,
                                            ];
                                            newGroups[groupIndex].conditions[
                                              condIndex
                                            ] = {
                                              ...condition,
                                              match_value: e.target.value,
                                            };
                                            setFormData({
                                              ...formData,
                                              condition_groups: newGroups,
                                            });
                                          }}
                                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                          placeholder={
                                            isAmountMatchType(
                                              condition.match_type
                                            )
                                              ? "100.00"
                                              : "Motif"
                                          }
                                          required
                                        />
                                        {group.conditions.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newGroups = [
                                                ...formData.condition_groups,
                                              ];
                                              newGroups[groupIndex].conditions =
                                                group.conditions.filter(
                                                  (_, i) => i !== condIndex
                                                );
                                              setFormData({
                                                ...formData,
                                                condition_groups: newGroups,
                                              });
                                            }}
                                            className="text-red-500 hover:text-red-700 px-2"
                                          >
                                            ×
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const newGroups = [
                                    ...formData.condition_groups,
                                  ];
                                  newGroups[groupIndex].conditions.push({
                                    match_type: "contains",
                                    match_value: "",
                                  });
                                  setFormData({
                                    ...formData,
                                    condition_groups: newGroups,
                                  });
                                }}
                                className="mt-3 text-sm text-blue-600 hover:text-blue-800"
                              >
                                + Ajouter une condition
                              </button>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              condition_groups: [
                                ...formData.condition_groups,
                                {
                                  operator: "and",
                                  conditions: [
                                    { match_type: "contains", match_value: "" },
                                  ],
                                },
                              ],
                            });
                          }}
                          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
                        >
                          + Ajouter un groupe de conditions (OU)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Section: Catégorisation */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900 border-b pb-2">
                      Catégorisation
                    </h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Type de catégorisation
                      </label>
                      <select
                        value={formData.categorization_type}
                        onChange={(e) => {
                          const newType = e.target.value;
                          if (newType === "loan") {
                            setFormData({
                              ...formData,
                              categorization_type: newType,
                              processor_type: "loan",
                              processor_config: {
                                loan_amount: 0,
                                annual_rate: 0,
                                duration_months: 0,
                                start_date: "",
                                capital_account_id: "",
                                interest_account_id: "",
                              },
                            });
                          } else {
                            setFormData({
                              ...formData,
                              categorization_type: newType,
                              processor_type: "simple_split",
                              processor_config: {
                                splits: [{ account_id: "", percentage: 100 }],
                                transaction_filter: "all",
                              },
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      >
                        {CATEGORIZATION_TYPES.map((type) => (
                          <option
                            key={type.value}
                            value={type.value}
                            className="text-gray-900"
                          >
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {formData.categorization_type === "splitItem" ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Filtre de transaction
                        </label>
                        <select
                          value={
                            formData.processor_config.transaction_filter ||
                            "all"
                          }
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              processor_config: {
                                ...formData.processor_config,
                                transaction_filter: e.target.value,
                              },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        >
                          {TRANSACTION_FILTERS.map((filter) => (
                            <option
                              key={filter.value}
                              value={filter.value}
                              className="text-gray-900"
                            >
                              {filter.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Choisissez si cette règle s&apos;applique aux débits,
                          crédits ou toutes les transactions
                        </p>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Répartition des comptes
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const splits =
                                formData.processor_config.splits || [];
                              setFormData({
                                ...formData,
                                processor_config: {
                                  ...formData.processor_config,
                                  splits: [
                                    ...splits,
                                    { account_id: "", percentage: 0 },
                                  ],
                                },
                              });
                            }}
                            className="text-sm bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded"
                          >
                            + Ajouter un split
                          </button>
                        </div>
                        <div className="space-y-3">
                          {(formData.processor_config.splits || []).map(
                            (split, index) => (
                              <div
                                key={index}
                                className="flex gap-2 items-center bg-gray-50 p-3 rounded-lg"
                              >
                                <div className="flex-1">
                                  <select
                                    value={split.account_id}
                                    onChange={(e) => {
                                      const splits = [
                                        ...(formData.processor_config.splits ||
                                          []),
                                      ];
                                      splits[index] = {
                                        ...splits[index],
                                        account_id: e.target.value,
                                      };
                                      setFormData({
                                        ...formData,
                                        processor_config: {
                                          ...formData.processor_config,
                                          splits,
                                        },
                                      });
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                    required
                                  >
                                    <option value="" className="text-gray-900">
                                      Sélectionnez un compte
                                    </option>
                                    {realAccounts.length > 0 && (
                                      <optgroup
                                        label="Comptes réels"
                                        className="text-gray-900"
                                      >
                                        {realAccounts.map((account) => (
                                          <option
                                            key={account.accountId}
                                            value={account.accountId}
                                            className="text-gray-900"
                                          >
                                            {account.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                                    {Object.entries(
                                      groupAccountsByCategory(accounts)
                                    )
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([category, categoryAccounts]) => (
                                        <optgroup
                                          key={category}
                                          label={category}
                                          className="text-gray-900"
                                        >
                                          {categoryAccounts
                                            .sort((a, b) =>
                                              a.name.localeCompare(b.name)
                                            )
                                            .map((account) => (
                                              <option
                                                key={account.accountId}
                                                value={account.accountId}
                                                className="text-gray-900"
                                              >
                                                {account.name} (
                                                {account.sub_category})
                                              </option>
                                            ))}
                                        </optgroup>
                                      ))}
                                  </select>
                                </div>
                                <div className="w-24">
                                  <input
                                    type="number"
                                    value={split.percentage}
                                    onChange={(e) => {
                                      const splits = [
                                        ...(formData.processor_config.splits ||
                                          []),
                                      ];
                                      splits[index] = {
                                        ...splits[index],
                                        percentage: parseFloat(e.target.value),
                                      };
                                      setFormData({
                                        ...formData,
                                        processor_config: {
                                          ...formData.processor_config,
                                          splits,
                                        },
                                      });
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    required
                                  />
                                </div>
                                <span className="text-sm text-gray-600">%</span>
                                {(formData.processor_config.splits || [])
                                  .length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const splits = [
                                        ...(formData.processor_config.splits ||
                                          []),
                                      ];
                                      splits.splice(index, 1);
                                      setFormData({
                                        ...formData,
                                        processor_config: {
                                          ...formData.processor_config,
                                          splits,
                                        },
                                      });
                                    }}
                                    className="text-red-600 hover:text-red-800 px-2"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            )
                          )}
                          <div className="text-xs text-gray-600 mt-2">
                            Total:{" "}
                            {(formData.processor_config.splits || [])
                              .reduce((sum, s) => sum + (s.percentage || 0), 0)
                              .toFixed(2)}
                            %
                            {Math.abs(
                              (formData.processor_config.splits || []).reduce(
                                (sum, s) => sum + (s.percentage || 0),
                                0
                              ) - 100
                            ) > 0.01 && (
                              <span className="text-red-600 ml-2">
                                ⚠️ Le total doit être égal à 100%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Montant du prêt (€)
                          </label>
                          <input
                            type="number"
                            value={formData.processor_config.loan_amount || 0}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                processor_config: {
                                  ...formData.processor_config,
                                  loan_amount: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            min="0"
                            step="0.01"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Taux annuel (%)
                          </label>
                          <input
                            type="number"
                            value={formData.processor_config.annual_rate || 0}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                processor_config: {
                                  ...formData.processor_config,
                                  annual_rate: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            min="0"
                            max="100"
                            step="0.001"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Durée (mois)
                          </label>
                          <input
                            type="number"
                            value={
                              formData.processor_config.duration_months || 0
                            }
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                processor_config: {
                                  ...formData.processor_config,
                                  duration_months: parseInt(e.target.value),
                                },
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            min="1"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Date de début
                          </label>
                          <input
                            type="date"
                            value={formData.processor_config.start_date || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                processor_config: {
                                  ...formData.processor_config,
                                  start_date: e.target.value,
                                },
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Compte Capital
                        </label>
                        <select
                          value={
                            formData.processor_config.capital_account_id || ""
                          }
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              processor_config: {
                                ...formData.processor_config,
                                capital_account_id: e.target.value,
                              },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          required
                        >
                          <option value="" className="text-gray-900">
                            Sélectionnez un compte
                          </option>
                          {realAccounts.length > 0 && (
                            <optgroup
                              label="Comptes réels"
                              className="text-gray-900"
                            >
                              {realAccounts.map((account) => (
                                <option
                                  key={account.accountId}
                                  value={account.accountId}
                                  className="text-gray-900"
                                >
                                  {account.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {Object.entries(groupAccountsByCategory(accounts))
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([category, categoryAccounts]) => (
                              <optgroup
                                key={category}
                                label={category}
                                className="text-gray-900"
                              >
                                {categoryAccounts
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map((account) => (
                                    <option
                                      key={account.accountId}
                                      value={account.accountId}
                                      className="text-gray-900"
                                    >
                                      {account.name} ({account.sub_category})
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Compte pour la partie capital du remboursement
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Compte Intérêts
                        </label>
                        <select
                          value={
                            formData.processor_config.interest_account_id || ""
                          }
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              processor_config: {
                                ...formData.processor_config,
                                interest_account_id: e.target.value,
                              },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          required
                        >
                          <option value="" className="text-gray-900">
                            Sélectionnez un compte
                          </option>
                          {realAccounts.length > 0 && (
                            <optgroup
                              label="Comptes réels"
                              className="text-gray-900"
                            >
                              {realAccounts.map((account) => (
                                <option
                                  key={account.accountId}
                                  value={account.accountId}
                                  className="text-gray-900"
                                >
                                  {account.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {Object.entries(groupAccountsByCategory(accounts))
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([category, categoryAccounts]) => (
                              <optgroup
                                key={category}
                                label={category}
                                className="text-gray-900"
                              >
                                {categoryAccounts
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map((account) => (
                                    <option
                                      key={account.accountId}
                                      value={account.accountId}
                                      className="text-gray-900"
                                    >
                                      {account.name} ({account.sub_category})
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Compte pour la partie intérêts du remboursement
                        </p>
                      </div>
                    </>
                  )}

                  <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRuleForm(false);
                        setEditingRule(null);
                        resetForm();
                      }}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={!isRuleFormDirty}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                        isRuleFormDirty
                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      {editingRule ? "Modifier" : "Créer"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {showPreviewModal && previewResult && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">
                      Prévisualisation: {previewResult.rule_description}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {previewResult.total_matches} transaction(s) correspondent
                      à cette règle
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPreviewModal(false)}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Matches List - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6">
                {previewResult.matches.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    Aucune transaction ne correspond à cette règle
                  </div>
                ) : (
                  <div className="space-y-3">
                    {previewResult.matches
                      .sort(
                        (a, b) =>
                          new Date(b.date).getTime() -
                          new Date(a.date).getTime()
                      )
                      .map((match) => (
                        <div
                          key={match.transaction_id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {match.description}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {new Date(match.date).toLocaleDateString(
                                  "fr-FR",
                                  {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  }
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-lg font-bold text-gray-900">
                                {match.amount.toFixed(2)}€
                              </div>
                              <button
                                onClick={() => setSelectedPreviewMatch(match)}
                                className="text-blue-600 hover:text-blue-800 p-1 rounded transition-colors"
                                title="Voir les transactions associees"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                  <path
                                    fillRule="evenodd"
                                    d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="w-full px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Slaves Preview Modal */}
        <TransactionSlavesPreviewModal
          isOpen={!!selectedPreviewMatch}
          transaction={selectedPreviewMatch}
          onClose={() => setSelectedPreviewMatch(null)}
        />

        {/* Rules List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {rules.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Aucune règle de catégorisation. Créez-en une pour commencer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Règle
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type / Motif
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Destination
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priorité
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rules.map((rule) => (
                    <tr
                      key={rule.ruleId}
                      className={!rule.enabled ? "opacity-50" : ""}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {rule.description}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {formatConditions(rule.condition_groups)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {formatSplits(
                            rule.processor_config,
                            rule.processor_type
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">
                          {rule.priority}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            rule.enabled
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {rule.enabled ? "Activée" : "Désactivée"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handlePreviewRule(rule.ruleId)}
                          className="text-purple-600 hover:text-purple-900 mr-3"
                          title="Prévisualiser les matches"
                        >
                          🔍
                        </button>
                        <button
                          onClick={() => handleToggle(rule.ruleId)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                          title={rule.enabled ? "Désactiver" : "Activer"}
                        >
                          {rule.enabled ? "⏸️" : "▶️"}
                        </button>
                        <button
                          onClick={() => handleEdit(rule)}
                          className="text-indigo-600 hover:text-indigo-900 mr-3"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(rule.ruleId)}
                          className="text-red-600 hover:text-red-900"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            ℹ️ Comment ça marche ?
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>
              • Les règles sont appliquées par ordre de{" "}
              <strong>priorité décroissante</strong>
            </li>
            <li>
              • La <strong>première règle qui matche</strong> est appliquée
              (first match wins)
            </li>
            <li>
              • Les transactions sont catégorisées automatiquement lors du
              matching
            </li>
            <li>• Les règles désactivées ne sont pas appliquées</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
