import { describe, it, expect } from "vitest";
import {
  calculateSmoothedTransactions,
  validateSmoothingInput,
  formatAmount,
  formatDate,
} from "../smoothingUtils";

describe("smoothingUtils", () => {
  describe("validateSmoothingInput", () => {
    it("should return valid for correct input", () => {
      const result = validateSmoothingInput({
        amount: 600,
        startDate: "2025-01-15",
        months: 12,
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject months less than 2", () => {
      const result = validateSmoothingInput({
        amount: 600,
        startDate: "2025-01-15",
        months: 1,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("minimum 2");
    });

    it("should reject months greater than 24", () => {
      const result = validateSmoothingInput({
        amount: 600,
        startDate: "2025-01-15",
        months: 25,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("24");
    });

    it("should reject non-integer months", () => {
      const result = validateSmoothingInput({
        amount: 600,
        startDate: "2025-01-15",
        months: 3.5,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("entier");
    });

    it("should reject zero or negative amount", () => {
      const result = validateSmoothingInput({
        amount: 0,
        startDate: "2025-01-15",
        months: 12,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("superieur a 0");
    });

    it("should reject negative amount", () => {
      const result = validateSmoothingInput({
        amount: -100,
        startDate: "2025-01-15",
        months: 12,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("superieur a 0");
    });
  });

  describe("calculateSmoothedTransactions", () => {
    it("should calculate correct number of transactions", () => {
      const result = calculateSmoothedTransactions({
        amount: 600,
        startDate: "2025-01-15",
        months: 12,
      });
      expect(result).toHaveLength(12);
    });

    it("should use original date for first transaction", () => {
      const result = calculateSmoothedTransactions({
        amount: 600,
        startDate: "2025-01-15",
        months: 12,
      });
      expect(result[0].date).toBe("2025-01-15");
    });

    it("should use 1st of month for subsequent transactions", () => {
      const result = calculateSmoothedTransactions({
        amount: 600,
        startDate: "2025-01-15",
        months: 3,
      });
      expect(result[0].date).toBe("2025-01-15");
      expect(result[1].date).toBe("2025-02-01");
      expect(result[2].date).toBe("2025-03-01");
    });

    it("should handle year transitions correctly", () => {
      const result = calculateSmoothedTransactions({
        amount: 300,
        startDate: "2025-11-15",
        months: 4,
      });
      expect(result[0].date).toBe("2025-11-15");
      expect(result[1].date).toBe("2025-12-01");
      expect(result[2].date).toBe("2026-01-01");
      expect(result[3].date).toBe("2026-02-01");
    });

    it("should sum to original amount (even division)", () => {
      const result = calculateSmoothedTransactions({
        amount: 600,
        startDate: "2025-01-15",
        months: 12,
      });
      const total = result.reduce((sum, item) => sum + item.amount, 0);
      expect(total).toBeCloseTo(600, 2);
    });

    it("should sum to original amount (uneven division)", () => {
      const result = calculateSmoothedTransactions({
        amount: 100,
        startDate: "2025-01-15",
        months: 3,
      });
      const total = result.reduce((sum, item) => sum + item.amount, 0);
      expect(total).toBeCloseTo(100, 2);
    });

    it("should round individual amounts to cents", () => {
      const result = calculateSmoothedTransactions({
        amount: 100,
        startDate: "2025-01-15",
        months: 3,
      });
      result.forEach((item) => {
        const cents = Math.round(item.amount * 100);
        expect(item.amount).toBe(cents / 100);
      });
    });

    it("should handle 2 months (minimum)", () => {
      const result = calculateSmoothedTransactions({
        amount: 100,
        startDate: "2025-01-15",
        months: 2,
      });
      expect(result).toHaveLength(2);
      expect(result.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(
        100,
        2
      );
    });

    it("should handle 24 months (maximum)", () => {
      const result = calculateSmoothedTransactions({
        amount: 2400,
        startDate: "2025-01-15",
        months: 24,
      });
      expect(result).toHaveLength(24);
      expect(result.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(
        2400,
        2
      );
    });

    it("should throw error for invalid input", () => {
      expect(() =>
        calculateSmoothedTransactions({
          amount: 600,
          startDate: "2025-01-15",
          months: 1,
        })
      ).toThrow();
    });

    it("should handle small amounts correctly", () => {
      const result = calculateSmoothedTransactions({
        amount: 1,
        startDate: "2025-01-15",
        months: 3,
      });
      const total = result.reduce((sum, item) => sum + item.amount, 0);
      expect(total).toBeCloseTo(1, 2);
    });

    it("should distribute amounts fairly for 100/3", () => {
      const result = calculateSmoothedTransactions({
        amount: 100,
        startDate: "2025-01-15",
        months: 3,
      });
      // 100/3 = 33.33... so we expect 33.33, 33.33, 33.34
      expect(result[0].amount).toBe(33.33);
      expect(result[1].amount).toBe(33.33);
      expect(result[2].amount).toBe(33.34);
    });
  });

  describe("formatAmount", () => {
    it("should format amount with euro symbol", () => {
      const result = formatAmount(50);
      expect(result).toMatch(/50/);
      expect(result).toMatch(/€|EUR/);
    });

    it("should handle decimal amounts", () => {
      const result = formatAmount(33.33);
      expect(result).toMatch(/33[,.]33/);
    });

    it("should handle zero", () => {
      const result = formatAmount(0);
      expect(result).toMatch(/0/);
    });
  });

  describe("formatDate", () => {
    it("should format date in French locale (DD/MM/YYYY)", () => {
      const result = formatDate("2025-01-15");
      expect(result).toBe("15/01/2025");
    });

    it("should handle different months", () => {
      const result = formatDate("2025-12-01");
      expect(result).toBe("01/12/2025");
    });
  });
});
