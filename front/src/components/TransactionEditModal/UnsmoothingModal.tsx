"use client";

import { TransactionSlave } from "./types";
import { formatAmount, formatDate } from "./smoothingUtils";

export interface UnsmoothingModalProps {
  isOpen: boolean;
  slaves: TransactionSlave[];
  totalAmount: number;
  onClose: () => void;
  onConfirm: () => void;
}

export default function UnsmoothingModal({
  isOpen,
  slaves,
  totalAmount,
  onClose,
  onConfirm,
}: UnsmoothingModalProps) {
  if (!isOpen || slaves.length === 0) return null;

  // Sort slaves by date to show the first one
  const sortedSlaves = [...slaves].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const firstSlave = sortedSlaves[0];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsmoothing-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3
            id="unsmoothing-modal-title"
            className="text-xl font-semibold text-gray-800"
          >
            Annuler le lissage
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
        <div className="p-6">
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h4 className="font-medium text-amber-800 mb-2">
                  Confirmation requise
                </h4>
                <p className="text-sm text-amber-700">
                  Vous allez fusionner{" "}
                  <span className="font-bold">
                    {slaves.length} transactions
                  </span>{" "}
                  en une seule de{" "}
                  <span className="font-bold">{formatAmount(totalAmount)}</span>
                  .
                </p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Compte:</span>{" "}
                {firstSlave.slaveAccountName}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">
                  Date de la transaction fusionnee:
                </span>{" "}
                {formatDate(firstSlave.date)}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Montant total:</span>{" "}
                {formatAmount(totalAmount)}
              </p>
            </div>

            <p className="text-xs text-gray-500">
              Les {slaves.length - 1} transactions suivantes seront supprimees
              et leur montant sera regroupe sur la premiere transaction.
            </p>
          </div>
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
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              Fusionner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
