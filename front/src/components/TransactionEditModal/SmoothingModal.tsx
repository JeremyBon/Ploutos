"use client";

import { useState, useMemo } from "react";
import { TransactionSlave } from "./types";
import {
  calculateSmoothedTransactions,
  validateSmoothingInput,
  formatAmount,
  formatDate,
  SmoothedTransaction,
} from "./smoothingUtils";

export interface SmoothingModalProps {
  isOpen: boolean;
  slave: TransactionSlave;
  onClose: () => void;
  onConfirm: (smoothedSlaves: TransactionSlave[]) => void;
}

export default function SmoothingModal({
  isOpen,
  slave,
  onClose,
  onConfirm,
}: SmoothingModalProps) {
  const [months, setMonths] = useState<number>(12);

  // Validation
  const validation = useMemo(() => {
    return validateSmoothingInput({
      amount: slave.amount,
      startDate: slave.date,
      months,
    });
  }, [slave.amount, slave.date, months]);

  // Preview of smoothed transactions
  const preview = useMemo<SmoothedTransaction[]>(() => {
    if (!validation.isValid) return [];
    try {
      return calculateSmoothedTransactions({
        amount: slave.amount,
        startDate: slave.date,
        months,
      });
    } catch {
      return [];
    }
  }, [slave.amount, slave.date, months, validation.isValid]);

  // Handle confirmation
  const handleConfirm = () => {
    if (!validation.isValid || preview.length === 0) return;

    // Convert preview to TransactionSlave array
    const smoothedSlaves: TransactionSlave[] = preview.map((item) => ({
      slaveId: crypto.randomUUID(),
      type: slave.type,
      amount: item.amount,
      date: item.date,
      accountId: slave.accountId,
      masterId: slave.masterId,
      slaveAccountName: slave.slaveAccountName,
      slaveAccountIsReal: slave.slaveAccountIsReal,
    }));

    onConfirm(smoothedSlaves);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="smoothing-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3
            id="smoothing-modal-title"
            className="text-xl font-semibold text-gray-800"
          >
            Lisser la transaction
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Fermer le modal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
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

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Original transaction info */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">
              Transaction originale
            </h4>
            <p className="text-sm text-blue-700">
              <span className="font-medium">Montant:</span>{" "}
              {formatAmount(slave.amount)}
            </p>
            <p className="text-sm text-blue-700">
              <span className="font-medium">Date:</span>{" "}
              {formatDate(slave.date)}
            </p>
            <p className="text-sm text-blue-700">
              <span className="font-medium">Compte:</span>{" "}
              {slave.slaveAccountName}
            </p>
          </div>

          {/* Months input */}
          <div className="mb-6">
            <label
              htmlFor="smoothing-months"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Nombre de mois (2-120)
            </label>
            <input
              id="smoothing-months"
              type="number"
              min={2}
              max={120}
              value={months}
              onChange={(e) => setMonths(parseInt(e.target.value) || 2)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
            />
            {!validation.isValid && (
              <p className="mt-1 text-sm text-red-600" role="alert">
                {validation.error}
              </p>
            )}
          </div>

          {/* Preview */}
          {validation.isValid && preview.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-800 mb-3">
                Apercu du lissage de {formatAmount(slave.amount)} sur {months}{" "}
                mois
              </h4>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="min-w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        #
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Montant
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {preview.map((item, index) => (
                      <tr
                        key={index}
                        className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                      >
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {index + 1}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-800">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-800 text-right font-medium">
                          {formatAmount(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-2 text-sm font-medium text-gray-700"
                      >
                        Total
                      </td>
                      <td className="px-4 py-2 text-sm font-bold text-gray-800 text-right">
                        {formatAmount(
                          preview.reduce((sum, item) => sum + item.amount, 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={!validation.isValid || preview.length === 0}
              className={`px-4 py-2 rounded-lg transition-colors ${
                !validation.isValid || preview.length === 0
                  ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              Valider
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
