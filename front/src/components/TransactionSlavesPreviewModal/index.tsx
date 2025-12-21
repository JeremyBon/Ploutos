"use client";

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

interface TransactionSlavesPreviewModalProps {
  isOpen: boolean;
  transaction: PreviewMatch | null;
  onClose: () => void;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(dateString: string): string {
  if (!dateString) return "";
  const datePart = dateString.split("T")[0];
  const date = new Date(datePart + "T12:00:00");
  return date.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function TransactionSlavesPreviewModal({
  isOpen,
  transaction,
  onClose,
}: TransactionSlavesPreviewModalProps) {
  if (!isOpen || !transaction) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slaves-preview-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3
            id="slaves-preview-modal-title"
            className="text-xl font-semibold text-gray-800"
          >
            Apercu de la categorisation
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
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Transaction info */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">
              {transaction.description}
            </h4>
            <p className="text-sm text-blue-700">
              <span className="font-medium">Date:</span>{" "}
              {formatDate(transaction.date)}
            </p>
            <p className="text-sm text-blue-700">
              <span className="font-medium">Montant:</span>{" "}
              {formatAmount(Math.abs(transaction.amount))}
            </p>
          </div>

          {/* Projected slaves table */}
          <h4 className="font-medium text-gray-800 mb-3">
            Repartition prevue ({transaction.slaves.length} compte
            {transaction.slaves.length > 1 ? "s" : ""})
          </h4>

          {transaction.slaves.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Aucune repartition configuree pour cette regle
            </p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Compte
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transaction.slaves.map((slave, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-800">
                        {slave.account_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {formatAmount(slave.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
