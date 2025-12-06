"use client";

import { useEffect, useState, useCallback } from "react";
import Navigation from "@/components/Navigation";

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
  [key: string]: unknown;
}

interface CategorizationRule {
  ruleId: string;
  description: string;
  match_type: string;
  match_value: string;
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

interface PreviewMatch {
  transaction_id: string;
  description: string;
  amount: number;
  date: string;
}

interface MatchingPreviewResult {
  success: boolean;
  message: string | null;
  rule_id: string;
  rule_description: string;
  total_matches: number;
  matches: PreviewMatch[];
}

const API_URL = "http://localhost:8000";
const MATCH_TYPES = [
  { value: "contains", label: "Contient" },
  { value: "starts_with", label: "Commence par" },
  { value: "exact", label: "Exact" },
  { value: "regex", label: "Regex" },
];

const CATEGORIZATION_TYPES = [{ value: "splitItem", label: "Classique" }];

const TRANSACTION_FILTERS = [
  { value: "all", label: "Toutes les transactions" },
  { value: "debit", label: "Dépenses uniquement" },
  { value: "credit", label: "Recettes uniquement" },
];

export default function Categorization() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
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

  // Form state
  const [formData, setFormData] = useState({
    description: "",
    match_type: "contains",
    match_value: "",
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
    setFormData({
      description: rule.description,
      match_type: rule.match_type,
      match_value: rule.match_value,
      account_ids: rule.account_ids || [],
      priority: rule.priority,
      enabled: rule.enabled,
      categorization_type: "splitItem",
      processor_type: rule.processor_type,
      processor_config: rule.processor_config,
    });
    setShowRuleForm(true);
  };

  const handleProcessMatching = async () => {
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
    setFormData({
      description: "",
      match_type: "contains",
      match_value: "",
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

  const getAccountName = (accountId?: string) => {
    if (!accountId) return "N/A";
    const account = accounts.find((acc) => acc.accountId === accountId);
    return account
      ? `${account.name} (${account.category} - ${account.sub_category})`
      : accountId;
  };

  const formatSplits = (config: ProcessorConfig) => {
    if (config.splits && config.splits.length > 0) {
      return config.splits.map((split, idx) => (
        <div key={idx} className="text-xs">
          {getAccountName(split.account_id)}: {split.percentage}%
        </div>
      ));
    }
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
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
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
                      Type de correspondance
                    </label>
                    <select
                      value={formData.match_type}
                      onChange={(e) =>
                        setFormData({ ...formData, match_type: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {MATCH_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motif à rechercher
                    </label>
                    <input
                      type="text"
                      value={formData.match_value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          match_value: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder={
                        formData.match_type === "regex"
                          ? "^CARREFOUR.*"
                          : "CARREFOUR"
                      }
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.match_type === "contains" &&
                        "Ex: CARREFOUR (matche 'CARREFOUR MARKET')"}
                      {formData.match_type === "starts_with" &&
                        "Ex: VIR (matche 'VIR SALAIRE')"}
                      {formData.match_type === "exact" &&
                        "Ex: CARREFOUR (matche exactement)"}
                      {formData.match_type === "regex" &&
                        "Ex: ^PRLV.*SEPA (expression régulière)"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Catégorisation
                    </label>
                    <select
                      value={formData.categorization_type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          categorization_type: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {CATEGORIZATION_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Filtre de transaction
                    </label>
                    <select
                      value={
                        formData.processor_config.transaction_filter || "all"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {TRANSACTION_FILTERS.map((filter) => (
                        <option key={filter.value} value={filter.value}>
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
                          const splits = formData.processor_config.splits || [];
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
                                    ...(formData.processor_config.splits || []),
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
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                required
                              >
                                <option value="">Sélectionnez un compte</option>
                                {accounts.map((account) => (
                                  <option
                                    key={account.accountId}
                                    value={account.accountId}
                                  >
                                    {account.name} ({account.category} -{" "}
                                    {account.sub_category})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="w-24">
                              <input
                                type="number"
                                value={split.percentage}
                                onChange={(e) => {
                                  const splits = [
                                    ...(formData.processor_config.splits || []),
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
                            {(formData.processor_config.splits || []).length >
                              1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const splits = [
                                    ...(formData.processor_config.splits || []),
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
                      Plus le nombre est élevé, plus la règle est prioritaire
                    </p>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) =>
                        setFormData({ ...formData, enabled: e.target.checked })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 block text-sm text-gray-700">
                      Règle activée
                    </label>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                    >
                      {editingRule ? "Modifier" : "Créer"}
                    </button>
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
                    {previewResult.matches.map((match) => (
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
                          <div className="text-lg font-bold text-gray-900 ml-4">
                            {match.amount.toFixed(2)}€
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
                          <span className="inline-block bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                            {rule.match_type}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 font-mono mt-1">
                          {rule.match_value}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {formatSplits(rule.processor_config)}
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
