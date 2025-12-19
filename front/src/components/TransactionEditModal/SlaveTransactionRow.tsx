"use client";

import { useMemo } from "react";
import { SlaveTransactionRowProps, Account } from "./types";
import {
  getAccountId,
  getUniqueCategories,
  filterAccountsByCategory,
} from "./utils";
import { formatAmount } from "./smoothingUtils";

export default function SlaveTransactionRow({
  slave,
  slaveId,
  index,
  realAccounts,
  virtualAccounts,
  categoryFilter,
  accountType,
  onUpdate,
  onRemove,
  onCategoryFilterChange,
  onAccountTypeChange,
  smoothingInfo,
}: SlaveTransactionRowProps) {
  const isCredit = slave.type.toLowerCase() === "credit";

  const categories = useMemo(
    () => getUniqueCategories(virtualAccounts),
    [virtualAccounts]
  );

  const filteredVirtualAccounts = useMemo(
    () => filterAccountsByCategory(virtualAccounts, categoryFilter),
    [virtualAccounts, categoryFilter]
  );

  const handleAccountTypeChange = (newType: "virtual" | "real") => {
    onAccountTypeChange(slaveId, newType);

    // Auto-select first account of new type
    if (newType === "real") {
      const firstRealAccount = realAccounts[0];
      if (firstRealAccount) {
        onUpdate(slaveId, {
          accountId: getAccountId(firstRealAccount),
          slaveAccountName: firstRealAccount.name,
          slaveAccountIsReal: true,
        });
      }
    } else {
      const firstVirtualAccount = virtualAccounts[0];
      if (firstVirtualAccount) {
        onUpdate(slaveId, {
          accountId: getAccountId(firstVirtualAccount),
          slaveAccountName: firstVirtualAccount.name,
          slaveAccountIsReal: false,
        });
        onCategoryFilterChange(slaveId, firstVirtualAccount.category);
      }
    }
  };

  const handleCategoryChange = (newCategory: string) => {
    onCategoryFilterChange(slaveId, newCategory);

    // Auto-select first account of new category
    const accountsInCategory = filterAccountsByCategory(
      virtualAccounts,
      newCategory
    );
    const firstAccount = accountsInCategory[0];
    if (firstAccount) {
      onUpdate(slaveId, {
        accountId: getAccountId(firstAccount),
        slaveAccountName: firstAccount.name,
        slaveAccountIsReal: false,
      });
    }
  };

  const handleAccountSelect = (
    accountId: string,
    accounts: Account[],
    isReal: boolean
  ) => {
    const selectedAccount = accounts.find(
      (acc) => getAccountId(acc) === accountId
    );
    onUpdate(slaveId, {
      accountId,
      slaveAccountName: selectedAccount?.name || slave.slaveAccountName,
      slaveAccountIsReal: isReal,
    });
  };

  return (
    <div
      className={`border rounded-lg p-4 ${
        isCredit ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 text-white text-xs rounded-full flex items-center justify-center font-medium ${
              isCredit ? "bg-red-600" : "bg-green-600"
            }`}
            aria-hidden="true"
          >
            {index + 1}
          </div>
          <h5
            className={`font-medium ${
              isCredit ? "text-red-800" : "text-green-800"
            }`}
          >
            <span className="mr-1" aria-hidden="true">
              {isCredit ? "↓" : "↑"}
            </span>
            Transaction slave {index + 1}
            <span className="ml-2 text-xs font-normal">
              ({isCredit ? "Crédit" : "Débit"})
            </span>
          </h5>
          {smoothingInfo && (
            <span
              className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium"
              title={`Fait partie d'un lissage de ${formatAmount(smoothingInfo.totalAmount)} sur ${smoothingInfo.totalMonths} mois`}
            >
              📊 {smoothingInfo.position}/{smoothingInfo.totalMonths}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRemove(slaveId)}
            className="text-red-600 hover:text-red-800 transition-colors p-1 rounded"
            title="Supprimer cette transaction"
            aria-label={`Supprimer la transaction slave ${index + 1}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Account type selector */}
        <div>
          <label
            htmlFor={`account-type-${slaveId}`}
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            Type de compte
          </label>
          <select
            id={`account-type-${slaveId}`}
            value={accountType}
            onChange={(e) =>
              handleAccountTypeChange(e.target.value as "virtual" | "real")
            }
            className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
          >
            <option value="virtual">Virtuel (catégorie)</option>
            <option value="real">Réel (banque)</option>
          </select>
        </div>

        {accountType === "real" ? (
          /* Real account selector */
          <div>
            <label
              htmlFor={`real-account-${slaveId}`}
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Compte réel
            </label>
            <select
              id={`real-account-${slaveId}`}
              value={slave.accountId}
              onChange={(e) =>
                handleAccountSelect(e.target.value, realAccounts, true)
              }
              className="w-full px-2 py-1.5 text-sm border-2 border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50 text-gray-800 font-medium"
            >
              <option value="" disabled>
                Sélectionner un compte réel
              </option>
              {realAccounts.map((account) => (
                <option
                  key={getAccountId(account)}
                  value={getAccountId(account)}
                >
                  {account.name} ({account.category})
                </option>
              ))}
            </select>
          </div>
        ) : (
          /* Virtual account - category filter */
          <div>
            <label
              htmlFor={`category-filter-${slaveId}`}
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Catégorie (filtre)
            </label>
            <select
              id={`category-filter-${slaveId}`}
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
            >
              <option value="">Toutes les catégories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Virtual account selector (only for virtual type) */}
        {accountType !== "real" && (
          <div className="col-span-2">
            <label
              htmlFor={`virtual-account-${slaveId}`}
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Compte virtuel
            </label>
            <select
              id={`virtual-account-${slaveId}`}
              value={slave.accountId}
              onChange={(e) =>
                handleAccountSelect(e.target.value, virtualAccounts, false)
              }
              className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
            >
              <option value="" disabled>
                Sélectionner un compte
              </option>
              {/* Show current account if not in filtered list */}
              {slave.accountId &&
                !filteredVirtualAccounts.some(
                  (acc) => getAccountId(acc) === slave.accountId
                ) && (
                  <option value={slave.accountId}>
                    {slave.slaveAccountName || "Compte actuel"}
                  </option>
                )}
              {filteredVirtualAccounts.map((account) => (
                <option
                  key={getAccountId(account)}
                  value={getAccountId(account)}
                >
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Type selector */}
        <div>
          <label
            htmlFor={`type-${slaveId}`}
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            Type
          </label>
          <select
            id={`type-${slaveId}`}
            value={slave.type}
            onChange={(e) => onUpdate(slaveId, { type: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
          >
            <option value="debit">Débit ↑</option>
            <option value="credit">Crédit ↓</option>
          </select>
        </div>

        {/* Amount input */}
        <div>
          <label
            htmlFor={`amount-${slaveId}`}
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            Montant (EUR)
          </label>
          <input
            id={`amount-${slaveId}`}
            type="number"
            step="0.01"
            min="0"
            value={slave.amount}
            onChange={(e) =>
              onUpdate(slaveId, { amount: parseFloat(e.target.value) || 0 })
            }
            className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
            aria-describedby={
              slave.amount <= 0 ? `amount-error-${slaveId}` : undefined
            }
          />
          {slave.amount <= 0 && (
            <p
              id={`amount-error-${slaveId}`}
              className="text-xs text-red-600 mt-1"
              role="alert"
            >
              Le montant doit être supérieur à 0
            </p>
          )}
        </div>

        {/* Date input */}
        <div>
          <label
            htmlFor={`date-${slaveId}`}
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            Date
          </label>
          <input
            id={`date-${slaveId}`}
            type="date"
            value={slave.date.split("T")[0]}
            onChange={(e) => onUpdate(slaveId, { date: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
          />
        </div>
      </div>
    </div>
  );
}
