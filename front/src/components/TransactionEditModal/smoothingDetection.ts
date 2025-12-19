import { TransactionSlave, SmoothingInfo } from "./types";

export type { SmoothingInfo };

/**
 * Checks if two amounts are approximately equal (within 0.01 tolerance)
 */
function amountsEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Parses a date string and returns year and month
 */
function getYearMonth(dateString: string): {
  year: number;
  month: number;
  day: number;
} {
  const datePart = dateString.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  return { year, month, day };
}

/**
 * Checks if a date is the 1st of the month
 */
function isFirstOfMonth(dateString: string): boolean {
  const { day } = getYearMonth(dateString);
  return day === 1;
}

/**
 * Checks if dates are consecutive months (date2 is exactly one month after date1)
 */
function areConsecutiveMonths(date1: string, date2: string): boolean {
  const d1 = getYearMonth(date1);
  const d2 = getYearMonth(date2);

  // Calculate expected next month
  let expectedYear = d1.year;
  let expectedMonth = d1.month + 1;
  if (expectedMonth > 12) {
    expectedMonth = 1;
    expectedYear += 1;
  }

  return d2.year === expectedYear && d2.month === expectedMonth;
}

/**
 * Checks if a group of slaves appears to be part of a smoothing pattern.
 *
 * Criteria:
 * - All slaves have similar amounts (within 0.01, except last one for rounding adjustment)
 * - Slaves after the first are dated on the 1st of consecutive months
 */
function isSmoothingGroup(slaves: TransactionSlave[]): boolean {
  if (slaves.length < 2) {
    return false;
  }

  // Sort by date
  const sorted = [...slaves].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Check amounts: all except possibly the last one should be similar
  const baseAmount = sorted[0].amount;
  for (let i = 1; i < sorted.length - 1; i++) {
    if (!amountsEqual(sorted[i].amount, baseAmount)) {
      return false;
    }
  }

  // Last one can be slightly different (rounding adjustment)
  // But should be within a reasonable range (less than 1 euro difference)
  const lastAmount = sorted[sorted.length - 1].amount;
  if (Math.abs(lastAmount - baseAmount) > 1) {
    return false;
  }

  // Check dates: all after the first should be on the 1st of consecutive months
  for (let i = 1; i < sorted.length; i++) {
    // After first, should be on 1st of month
    if (!isFirstOfMonth(sorted[i].date)) {
      return false;
    }

    // Should be consecutive month from previous
    if (!areConsecutiveMonths(sorted[i - 1].date, sorted[i].date)) {
      return false;
    }
  }

  return true;
}

/**
 * Detects smoothing groups among transaction slaves.
 *
 * Groups slaves by accountId and checks if each group matches the smoothing pattern.
 * Returns a Map of slaveId -> SmoothingInfo for all slaves that are part of a smoothing group.
 */
export function detectSmoothingGroups(
  slaves: TransactionSlave[]
): Map<string, SmoothingInfo> {
  const result = new Map<string, SmoothingInfo>();

  // Group by accountId
  const groups = new Map<string, TransactionSlave[]>();
  for (const slave of slaves) {
    const existing = groups.get(slave.accountId) || [];
    existing.push(slave);
    groups.set(slave.accountId, existing);
  }

  // Check each group
  for (const [, groupSlaves] of groups) {
    if (isSmoothingGroup(groupSlaves)) {
      // Sort by date to determine position
      const sorted = [...groupSlaves].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Calculate total amount
      const totalAmount = sorted.reduce((sum, s) => sum + s.amount, 0);
      const totalMonths = sorted.length;

      // Assign position to each slave
      sorted.forEach((slave, index) => {
        result.set(slave.slaveId, {
          position: index + 1,
          totalMonths,
          totalAmount: Math.round(totalAmount * 100) / 100,
        });
      });
    }
  }

  return result;
}
