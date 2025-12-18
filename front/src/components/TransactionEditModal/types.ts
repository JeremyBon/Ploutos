export interface Account {
  account_id?: string;
  accountId?: string;
  name: string;
  category: string;
  sub_category: string;
  is_real: boolean;
  active?: boolean;
}

export interface TransactionSlave {
  slaveId: string;
  type: string;
  amount: number;
  date: string;
  accountId: string;
  masterId: string;
  slaveAccountName: string;
  slaveAccountIsReal: boolean;
}

export interface Transaction {
  transactionId: string;
  description: string;
  date: string;
  amount: number;
  type: string;
  accountId: string;
  accountName?: string;
  masterAccountName?: string;
  category?: string;
  subCategory?: string;
  TransactionsSlaves?: TransactionSlave[];
}

export interface TransactionEditModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  accounts: Account[];
  onClose: () => void;
  onSave: (
    transactionId: string,
    description: string,
    date: string,
    slaves: TransactionSlave[]
  ) => Promise<void>;
}

export interface SlaveTransactionRowProps {
  slave: TransactionSlave;
  slaveId: string;
  index: number;
  realAccounts: Account[];
  virtualAccounts: Account[];
  categoryFilter: string;
  accountType: "virtual" | "real";
  onUpdate: (slaveId: string, updates: Partial<TransactionSlave>) => void;
  onRemove: (slaveId: string) => void;
  onCategoryFilterChange: (slaveId: string, category: string) => void;
  onAccountTypeChange: (slaveId: string, type: "virtual" | "real") => void;
}

export interface ValidationError {
  type: "balance" | "invalid_slave" | "missing_account";
  message: string;
  slaveId?: string;
}
