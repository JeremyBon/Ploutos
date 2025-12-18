import { Account, TransactionSlave, ValidationError } from "./types";

export const getAccountId = (account: Account): string =>
  account.account_id || account.accountId || "";

export const deepCloneSlaves = (
  slaves: TransactionSlave[]
): TransactionSlave[] => slaves.map((slave) => ({ ...slave }));

export const getSlavesBalance = (slaves: TransactionSlave[]): number => {
  return slaves.reduce((balance, slave) => {
    const amount = slave.amount || 0;
    if (slave.type.toLowerCase() === "debit") {
      return balance + amount;
    } else {
      return balance - amount;
    }
  }, 0);
};

export const calculateMasterBalance = (
  amount: number,
  type: string
): number => {
  return type.toLowerCase() === "credit" ? amount : -amount;
};

export const getUniqueCategories = (accounts: Account[]): string[] => {
  const categories = new Set(
    accounts.filter((acc) => !acc.is_real).map((acc) => acc.category)
  );
  return Array.from(categories).sort();
};

export const validateSlaves = (
  slaves: TransactionSlave[],
  masterAmount: number,
  masterType: string
): ValidationError | null => {
  // Check for slaves with invalid amounts
  const invalidAmountSlave = slaves.find((slave) => Number(slave.amount) <= 0);
  if (invalidAmountSlave) {
    return {
      type: "invalid_slave",
      message: `Le montant doit être supérieur à 0`,
      slaveId: invalidAmountSlave.slaveId,
    };
  }

  // Check for slaves without account
  const missingAccountSlave = slaves.find((slave) => !slave.accountId);
  if (missingAccountSlave) {
    return {
      type: "missing_account",
      message: `Veuillez sélectionner un compte`,
      slaveId: missingAccountSlave.slaveId,
    };
  }

  // Check balance
  const masterBalance = calculateMasterBalance(masterAmount, masterType);
  const slavesBalance = getSlavesBalance(slaves);
  const delta = Math.abs(masterBalance - slavesBalance);

  if (delta >= 0.01) {
    const expectedBalance = masterBalance >= 0 ? masterBalance : -masterBalance;
    const currentBalance = slavesBalance >= 0 ? slavesBalance : -slavesBalance;
    return {
      type: "balance",
      message: `Balance incorrecte: ${currentBalance.toFixed(2)}€ / ${expectedBalance.toFixed(2)}€ attendu (écart: ${delta.toFixed(2)}€)`,
    };
  }

  return null;
};

export const findAccountById = (
  accounts: Account[],
  accountId: string
): Account | undefined => {
  return accounts.find((acc) => getAccountId(acc) === accountId);
};

export const filterAccountsByCategory = (
  accounts: Account[],
  category: string
): Account[] => {
  if (!category) return accounts;
  return accounts.filter((acc) => acc.category === category);
};
