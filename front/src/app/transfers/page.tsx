"use client";

import { useState, useEffect, useMemo } from "react";
import Navigation from "@/components/Navigation";

interface Transaction {
  transactionId: string;
  description: string;
  date: string;
  type: string;
  amount: number;
  accountId: string;
  accountName?: string;
}

interface TransferCandidate {
  credit_transaction: Transaction;
  debit_transaction: Transaction;
  amount: number;
  date: string;
  match_confidence: number;
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

interface Transfer {
  transactionId: string;
  description: string;
  date: string;
  type: string;
  amount: number;
  accountId: string;
  masterAccountName: string;
  masterAccountIsReal: boolean;
  TransactionsSlaves: TransactionSlave[];
}

const API_URL = "http://localhost:8000";

export default function Transfers() {
  const [candidates, setCandidates] = useState<TransferCandidate[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mergingPair, setMergingPair] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] =
    useState<TransferCandidate | null>(null);
  const [rejectingPair, setRejectingPair] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRejectCandidate, setSelectedRejectCandidate] =
    useState<TransferCandidate | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");

  // État pour le filtrage par mois (transferts confirmés uniquement)
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const fetchCandidates = async () => {
    try {
      setLoadingCandidates(true);
      const response = await fetch(`${API_URL}/transfers/candidates`);
      if (!response.ok) {
        throw new Error("Failed to fetch transfer candidates");
      }
      const data = await response.json();
      setCandidates(data);
      setError(null);
    } catch (error) {
      setError(
        `Erreur lors du chargement des candidats: ${error instanceof Error ? error.message : "Erreur inconnue"}`
      );
    } finally {
      setLoadingCandidates(false);
    }
  };

  const fetchTransfers = async () => {
    try {
      setLoadingTransfers(true);
      const response = await fetch(`${API_URL}/transfers`);
      if (!response.ok) {
        throw new Error("Failed to fetch transfers");
      }
      const data = await response.json();
      setTransfers(data);
    } catch (error) {
      console.error("Error fetching transfers:", error);
    } finally {
      setLoadingTransfers(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
    fetchTransfers();
  }, []);

  // Tri des candidats du plus récent au plus ancien
  const sortedCandidates = useMemo(() => {
    return [...candidates].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [candidates]);

  // Filtrage et tri des transferts confirmés
  const filteredAndSortedTransfers = useMemo(() => {
    let result = [...transfers];

    // Filtrage par mois si activé
    if (selectedMonth !== "all") {
      const [year, month] = selectedMonth.split("-");
      result = result.filter((t) => {
        const date = new Date(t.date);
        return (
          date.getFullYear() === parseInt(year) &&
          date.getMonth() + 1 === parseInt(month)
        );
      });
    }

    // Tri du plus récent au plus ancien
    return result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [transfers, selectedMonth]);

  // Grouper les transferts par mois pour l'affichage
  const transfersByMonth = useMemo(() => {
    const groups: { [key: string]: Transfer[] } = {};
    filteredAndSortedTransfers.forEach((t) => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(t);
    });
    return groups;
  }, [filteredAndSortedTransfers]);

  const handleMergeClick = (candidate: TransferCandidate) => {
    setSelectedCandidate(candidate);
    setShowConfirmModal(true);
  };

  const handleConfirmMerge = async () => {
    if (!selectedCandidate) return;

    const pairId = `${selectedCandidate.credit_transaction.transactionId}-${selectedCandidate.debit_transaction.transactionId}`;
    setMergingPair(pairId);
    setShowConfirmModal(false);

    try {
      const response = await fetch(`${API_URL}/transfers/merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credit_transaction_id:
            selectedCandidate.credit_transaction.transactionId,
          debit_transaction_id:
            selectedCandidate.debit_transaction.transactionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to merge transfer");
      }

      setSuccessMessage("Transfert mergé avec succès !");
      setTimeout(() => setSuccessMessage(null), 3000);

      // Rafraîchir les listes
      await fetchCandidates();
      await fetchTransfers();
    } catch (error) {
      setError(
        `Erreur lors du merge: ${error instanceof Error ? error.message : "Erreur inconnue"}`
      );
      setTimeout(() => setError(null), 5000);
    } finally {
      setMergingPair(null);
      setSelectedCandidate(null);
    }
  };

  const handleCancelMerge = () => {
    setShowConfirmModal(false);
    setSelectedCandidate(null);
  };

  const handleRejectClick = (candidate: TransferCandidate) => {
    setSelectedRejectCandidate(candidate);
    setShowRejectModal(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedRejectCandidate) return;

    const pairId = `${selectedRejectCandidate.credit_transaction.transactionId}-${selectedRejectCandidate.debit_transaction.transactionId}`;
    setRejectingPair(pairId);
    setShowRejectModal(false);

    try {
      const response = await fetch(`${API_URL}/transfers/candidates/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credit_transaction_id:
            selectedRejectCandidate.credit_transaction.transactionId,
          debit_transaction_id:
            selectedRejectCandidate.debit_transaction.transactionId,
          rejected_reason: rejectReason || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 409) {
          throw new Error("Cette paire a déjà été rejetée");
        }
        throw new Error(
          errorData.detail || "Failed to reject transfer candidate"
        );
      }

      setSuccessMessage("Paire rejetée avec succès !");
      setTimeout(() => setSuccessMessage(null), 3000);

      // Rafraîchir la liste des candidats
      await fetchCandidates();
    } catch (error) {
      setError(
        `Erreur lors du rejet: ${error instanceof Error ? error.message : "Erreur inconnue"}`
      );
      setTimeout(() => setError(null), 5000);
    } finally {
      setRejectingPair(null);
      setSelectedRejectCandidate(null);
      setRejectReason("");
    }
  };

  const handleCancelReject = () => {
    setShowRejectModal(false);
    setSelectedRejectCandidate(null);
    setRejectReason("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <Navigation />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800">
            Gestion des Transferts
          </h2>
          <p className="text-gray-600 mt-2">
            Détectez et confirmez les transferts entre comptes
          </p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {successMessage}
          </div>
        )}

        {/* Candidats de transfert */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-semibold text-gray-800">
              Candidats de transfert
            </h3>
            <button
              onClick={fetchCandidates}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                  clipRule="evenodd"
                />
              </svg>
              Actualiser
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {loadingCandidates ? (
              <div className="text-center py-8 text-gray-600">
                Chargement des candidats...
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 mx-auto text-gray-400 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-lg font-medium">
                  Aucun candidat de transfert détecté
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Tous vos transferts sont à jour !
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedCandidates.map((candidate, index) => {
                  const pairId = `${candidate.credit_transaction.transactionId}-${candidate.debit_transaction.transactionId}`;
                  const isMerging = mergingPair === pairId;
                  const isRejecting = rejectingPair === pairId;

                  return (
                    <div
                      key={pairId}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                            Candidat #{index + 1}
                          </span>
                          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                            Confiance:{" "}
                            {Math.round(candidate.match_confidence * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRejectClick(candidate)}
                            disabled={isRejecting || isMerging}
                            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                              isRejecting || isMerging
                                ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                                : "bg-orange-600 text-white hover:bg-orange-700"
                            }`}
                          >
                            {isRejecting ? (
                              <>
                                <svg
                                  className="animate-spin h-5 w-5"
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
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                Rejet en cours...
                              </>
                            ) : (
                              <>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                Refuser
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleMergeClick(candidate)}
                            disabled={isMerging || isRejecting}
                            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                              isMerging || isRejecting
                                ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                                : "bg-green-600 text-white hover:bg-green-700"
                            }`}
                          >
                            {isMerging ? (
                              <>
                                <svg
                                  className="animate-spin h-5 w-5"
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
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                Fusion en cours...
                              </>
                            ) : (
                              <>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                Merger
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Transaction Crédit (Entrée) */}
                        <div className="bg-white border-2 border-green-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold">
                              CRÉDIT (Entrée)
                            </div>
                          </div>
                          <h4 className="font-semibold text-gray-800 mb-2">
                            {candidate.credit_transaction.description}
                          </h4>
                          <div className="space-y-1 text-sm">
                            <p className="text-gray-600">
                              <span className="font-medium">Compte:</span>{" "}
                              {candidate.credit_transaction.accountName ||
                                "Inconnu"}
                            </p>
                            <p className="text-gray-600">
                              <span className="font-medium">Date:</span>{" "}
                              {new Date(
                                candidate.credit_transaction.date
                              ).toLocaleDateString("fr-FR")}
                            </p>
                            <p className="text-gray-600">
                              <span className="font-medium">Montant:</span>{" "}
                              <span className="font-bold text-green-600">
                                +
                                {candidate.credit_transaction.amount.toFixed(2)}
                                €
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Flèche de transfert */}
                        <div className="hidden md:flex items-center justify-center absolute left-1/2 transform -translate-x-1/2 z-10">
                          <div className="bg-blue-600 text-white rounded-full p-2">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-6 w-6"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 7l5 5m0 0l-5 5m5-5H6"
                              />
                            </svg>
                          </div>
                        </div>

                        {/* Transaction Débit (Sortie) */}
                        <div className="bg-white border-2 border-red-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-semibold">
                              DÉBIT (Sortie)
                            </div>
                          </div>
                          <h4 className="font-semibold text-gray-800 mb-2">
                            {candidate.debit_transaction.description}
                          </h4>
                          <div className="space-y-1 text-sm">
                            <p className="text-gray-600">
                              <span className="font-medium">Compte:</span>{" "}
                              {candidate.debit_transaction.accountName ||
                                "Inconnu"}
                            </p>
                            <p className="text-gray-600">
                              <span className="font-medium">Date:</span>{" "}
                              {new Date(
                                candidate.debit_transaction.date
                              ).toLocaleDateString("fr-FR")}
                            </p>
                            <p className="text-gray-600">
                              <span className="font-medium">Montant:</span>{" "}
                              <span className="font-bold text-red-600">
                                -{candidate.debit_transaction.amount.toFixed(2)}
                                €
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Transferts existants */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-semibold text-gray-800">
              Transferts confirmés
            </h3>
            <div className="relative flex items-center gap-2">
              <button
                onClick={() => setShowMonthPicker(!showMonthPicker)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-gray-700">
                  {selectedMonth === "all"
                    ? "Tous les mois"
                    : new Date(
                        parseInt(selectedMonth.split("-")[0]),
                        parseInt(selectedMonth.split("-")[1]) - 1
                      ).toLocaleDateString("fr-FR", {
                        month: "long",
                        year: "numeric",
                      })}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 text-gray-400 transition-transform ${showMonthPicker ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showMonthPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setPickerYear(pickerYear - 1)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-gray-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                    </button>
                    <span className="font-semibold text-gray-800">
                      {pickerYear}
                    </span>
                    <button
                      onClick={() => setPickerYear(pickerYear + 1)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-gray-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      "Jan",
                      "Fév",
                      "Mar",
                      "Avr",
                      "Mai",
                      "Juin",
                      "Juil",
                      "Août",
                      "Sep",
                      "Oct",
                      "Nov",
                      "Déc",
                    ].map((month, index) => {
                      const monthValue = `${pickerYear}-${String(index + 1).padStart(2, "0")}`;
                      const isSelected = selectedMonth === monthValue;
                      return (
                        <button
                          key={month}
                          onClick={() => {
                            setSelectedMonth(monthValue);
                            setShowMonthPicker(false);
                          }}
                          className={`px-3 py-2 text-sm rounded transition-colors ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "hover:bg-gray-100 text-gray-700"
                          }`}
                        >
                          {month}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setSelectedMonth("all");
                        setShowMonthPicker(false);
                      }}
                      className={`w-full px-3 py-2 text-sm rounded transition-colors ${
                        selectedMonth === "all"
                          ? "bg-gray-200 text-gray-800"
                          : "hover:bg-gray-100 text-gray-600"
                      }`}
                    >
                      Tous les mois
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {loadingTransfers ? (
              <div className="text-center py-8 text-gray-600">
                Chargement des transferts...
              </div>
            ) : filteredAndSortedTransfers.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                <p className="text-lg font-medium">
                  {transfers.length === 0
                    ? "Aucun transfert confirmé"
                    : "Aucun transfert pour ce mois"}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(transfersByMonth)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([monthKey, monthTransfers]) => {
                    const [year, m] = monthKey.split("-");
                    const monthDate = new Date(parseInt(year), parseInt(m) - 1);
                    const monthLabel = monthDate.toLocaleDateString("fr-FR", {
                      month: "long",
                      year: "numeric",
                    });

                    return (
                      <div key={monthKey}>
                        {/* Séparateur de mois */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-px flex-1 bg-gray-200"></div>
                          <span className="text-sm font-semibold text-gray-500 uppercase">
                            {monthLabel}
                          </span>
                          <div className="h-px flex-1 bg-gray-200"></div>
                        </div>

                        {/* Transferts du mois */}
                        <div className="space-y-3">
                          {monthTransfers.map((transfer) => {
                            const destinationSlave =
                              transfer.TransactionsSlaves.find(
                                (s) => s.slaveAccountIsReal
                              );

                            return (
                              <div
                                key={transfer.transactionId}
                                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-gray-800 mb-1">
                                      {transfer.description}
                                    </h4>
                                    <div className="flex items-center gap-4 text-sm text-gray-600">
                                      <span>
                                        {new Date(
                                          transfer.date
                                        ).toLocaleDateString("fr-FR")}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                          {transfer.masterAccountName}
                                        </span>
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          className="h-4 w-4 text-blue-600"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M13 7l5 5m0 0l-5 5m5-5H6"
                                          />
                                        </svg>
                                        <span className="font-medium">
                                          {destinationSlave?.slaveAccountName ||
                                            "Compte inconnu"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-lg font-bold text-blue-600">
                                      {transfer.amount.toFixed(2)}€
                                    </p>
                                    <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium mt-1">
                                      Transfert
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal de confirmation merge */}
      {showConfirmModal && selectedCandidate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Confirmer le merge
            </h3>
            <p className="text-gray-600 mb-4">
              Êtes-vous sûr de vouloir merger ces deux transactions en un
              transfert ?
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-gray-800">
              <p className="text-sm">
                <span className="font-medium">De:</span>{" "}
                {selectedCandidate.debit_transaction.description}
                {selectedCandidate.debit_transaction.accountName && (
                  <span className="text-gray-500">
                    {" "}
                    ({selectedCandidate.debit_transaction.accountName})
                  </span>
                )}
              </p>
              <p className="text-sm">
                <span className="font-medium">Vers:</span>{" "}
                {selectedCandidate.credit_transaction.description}
                {selectedCandidate.credit_transaction.accountName && (
                  <span className="text-gray-500">
                    {" "}
                    ({selectedCandidate.credit_transaction.accountName})
                  </span>
                )}
              </p>
              <p className="text-sm">
                <span className="font-medium">Montant:</span>{" "}
                {selectedCandidate.amount.toFixed(2)}€
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelMerge}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmMerge}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmation rejet */}
      {showRejectModal && selectedRejectCandidate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Refuser ce candidat
            </h3>
            <p className="text-gray-600 mb-4">
              Êtes-vous sûr de vouloir refuser cette paire de transactions ?
              Elle ne sera plus proposée comme candidat de transfert.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-gray-800">
              <p className="text-sm">
                <span className="font-medium">De:</span>{" "}
                {selectedRejectCandidate.debit_transaction.description}
                {selectedRejectCandidate.debit_transaction.accountName && (
                  <span className="text-gray-500">
                    {" "}
                    ({selectedRejectCandidate.debit_transaction.accountName})
                  </span>
                )}
              </p>
              <p className="text-sm">
                <span className="font-medium">Vers:</span>{" "}
                {selectedRejectCandidate.credit_transaction.description}
                {selectedRejectCandidate.credit_transaction.accountName && (
                  <span className="text-gray-500">
                    {" "}
                    ({selectedRejectCandidate.credit_transaction.accountName})
                  </span>
                )}
              </p>
              <p className="text-sm">
                <span className="font-medium">Montant:</span>{" "}
                {selectedRejectCandidate.amount.toFixed(2)}€
              </p>
            </div>
            <div className="mb-6">
              <label
                htmlFor="reject-reason"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Raison du rejet (optionnel)
              </label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: Ce n'est pas un transfert mais deux transactions différentes..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelReject}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
