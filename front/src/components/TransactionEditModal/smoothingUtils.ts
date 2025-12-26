export interface SmoothedTransaction {
  date: string;
  amount: number;
}

export interface SmoothingInput {
  amount: number;
  startDate: string;
  months: number;
}

export interface SmoothingValidation {
  isValid: boolean;
  error?: string;
}

/**
 * Validates smoothing input parameters
 */
export function validateSmoothingInput(
  input: SmoothingInput
): SmoothingValidation {
  const { amount, months } = input;

  if (months < 2) {
    return {
      isValid: false,
      error: "Le nombre de mois doit etre au minimum 2",
    };
  }

  if (months > 120) {
    return {
      isValid: false,
      error: "Le nombre de mois ne peut pas depasser 120",
    };
  }

  if (!Number.isInteger(months)) {
    return { isValid: false, error: "Le nombre de mois doit etre un entier" };
  }

  if (amount <= 0) {
    return { isValid: false, error: "Le montant doit etre superieur a 0" };
  }

  return { isValid: true };
}

/**
 * Formats a date to YYYY-MM-DD string (local timezone)
 */
function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculates smoothed transactions over multiple months
 * - First transaction: uses the original date with amount/months (rounded)
 * - Subsequent transactions: 1st of each following month
 * - Last transaction: adjusted to ensure total equals original amount
 */
export function calculateSmoothedTransactions(
  input: SmoothingInput
): SmoothedTransaction[] {
  const { amount, startDate, months } = input;

  const validation = validateSmoothingInput(input);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const baseAmount = Math.floor((amount / months) * 100) / 100;
  const results: SmoothedTransaction[] = [];

  // Normalize startDate: extract just the date part (YYYY-MM-DD)
  const datePart = startDate.split("T")[0];
  const originalDate = new Date(datePart + "T12:00:00");

  for (let i = 0; i < months; i++) {
    let transactionDate: Date;

    if (i === 0) {
      transactionDate = new Date(originalDate);
    } else {
      transactionDate = new Date(
        originalDate.getFullYear(),
        originalDate.getMonth() + i,
        1,
        12,
        0,
        0
      );
    }

    results.push({
      date: formatDateToISO(transactionDate),
      amount: baseAmount,
    });
  }

  // Adjust last transaction to ensure sum equals original amount
  const totalSoFar = baseAmount * months;
  const remainder = Math.round((amount - totalSoFar) * 100) / 100;
  if (remainder !== 0 && results.length > 0) {
    results[results.length - 1].amount =
      Math.round((baseAmount + remainder) * 100) / 100;
  }

  return results;
}

/**
 * Formats amount for display in French locale
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * Formats date for display in French locale (DD/MM/YYYY)
 */
export function formatDate(dateString: string): string {
  if (!dateString) return "";

  // Extract just the date part if it contains time
  const datePart = dateString.split("T")[0];
  const date = new Date(datePart + "T12:00:00");

  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR");
}
