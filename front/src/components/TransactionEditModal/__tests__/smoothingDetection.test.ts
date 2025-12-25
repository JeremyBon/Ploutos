import { describe, it, expect } from "vitest";
import {
  detectSmoothingGroups,
  getSmoothingGroupsArray,
} from "../smoothingDetection";
import { TransactionSlave } from "../types";

// Helper to create a slave with default values
function createSlave(overrides: Partial<TransactionSlave>): TransactionSlave {
  return {
    slaveId: `slave-${Math.random().toString(36).substr(2, 9)}`,
    type: "credit",
    amount: 50,
    date: "2025-01-01",
    accountId: "account-1",
    masterId: "master-1",
    slaveAccountName: "Test Account",
    slaveAccountIsReal: false,
    ...overrides,
  };
}

describe("smoothingDetection", () => {
  describe("detectSmoothingGroups", () => {
    it("should return empty map for empty array", () => {
      const result = detectSmoothingGroups([]);
      expect(result.size).toBe(0);
    });

    it("should not detect single slave as smoothing group", () => {
      const slaves = [createSlave({ slaveId: "s1", date: "2025-01-15" })];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(0);
    });

    it("should detect 2 slaves with same amount and consecutive months", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 50 }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(2);
      expect(result.get("s1")).toEqual({
        position: 1,
        totalMonths: 2,
        totalAmount: 100,
      });
      expect(result.get("s2")).toEqual({
        position: 2,
        totalMonths: 2,
        totalAmount: 100,
      });
    });

    it("should detect 12 slaves as typical smoothing case", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 50 }),
        createSlave({ slaveId: "s3", date: "2025-03-01", amount: 50 }),
        createSlave({ slaveId: "s4", date: "2025-04-01", amount: 50 }),
        createSlave({ slaveId: "s5", date: "2025-05-01", amount: 50 }),
        createSlave({ slaveId: "s6", date: "2025-06-01", amount: 50 }),
        createSlave({ slaveId: "s7", date: "2025-07-01", amount: 50 }),
        createSlave({ slaveId: "s8", date: "2025-08-01", amount: 50 }),
        createSlave({ slaveId: "s9", date: "2025-09-01", amount: 50 }),
        createSlave({ slaveId: "s10", date: "2025-10-01", amount: 50 }),
        createSlave({ slaveId: "s11", date: "2025-11-01", amount: 50 }),
        createSlave({ slaveId: "s12", date: "2025-12-01", amount: 50 }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(12);
      expect(result.get("s1")?.position).toBe(1);
      expect(result.get("s1")?.totalMonths).toBe(12);
      expect(result.get("s6")?.position).toBe(6);
      expect(result.get("s12")?.position).toBe(12);
      expect(result.get("s12")?.totalAmount).toBe(600);
    });

    it("should not detect slaves with different amounts (> 0.01 diff)", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 60 }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(0);
    });

    it("should detect slaves with slightly different amounts (within 0.01)", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 50.01 }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(2);
    });

    it("should detect slaves with last amount adjusted for rounding", () => {
      // Simulates 100/3 = 33.33, 33.33, 33.34
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 33.33 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 33.33 }),
        createSlave({ slaveId: "s3", date: "2025-03-01", amount: 33.34 }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(3);
      expect(result.get("s3")?.totalAmount).toBeCloseTo(100, 2);
    });

    it("should not detect slaves with non-consecutive months", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-03-01", amount: 50 }), // Skips February
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(0);
    });

    it("should not detect slaves with dates not on 1st (except first)", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-15", amount: 50 }), // Not 1st of month
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(0);
    });

    it("should separate groups by accountId", () => {
      const slaves = [
        // Group 1: account-1
        createSlave({
          slaveId: "s1",
          date: "2025-01-15",
          amount: 50,
          accountId: "account-1",
        }),
        createSlave({
          slaveId: "s2",
          date: "2025-02-01",
          amount: 50,
          accountId: "account-1",
        }),
        // Group 2: account-2
        createSlave({
          slaveId: "s3",
          date: "2025-01-15",
          amount: 30,
          accountId: "account-2",
        }),
        createSlave({
          slaveId: "s4",
          date: "2025-02-01",
          amount: 30,
          accountId: "account-2",
        }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(4);
      expect(result.get("s1")?.totalAmount).toBe(100);
      expect(result.get("s3")?.totalAmount).toBe(60);
    });

    it("should handle year transitions correctly", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-11-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-12-01", amount: 50 }),
        createSlave({ slaveId: "s3", date: "2026-01-01", amount: 50 }),
        createSlave({ slaveId: "s4", date: "2026-02-01", amount: 50 }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(4);
      expect(result.get("s1")?.position).toBe(1);
      expect(result.get("s4")?.position).toBe(4);
    });

    it("should handle slaves in random order (sorts by date)", () => {
      const slaves = [
        createSlave({ slaveId: "s3", date: "2025-03-01", amount: 50 }),
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 50 }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(3);
      expect(result.get("s1")?.position).toBe(1);
      expect(result.get("s2")?.position).toBe(2);
      expect(result.get("s3")?.position).toBe(3);
    });

    it("should not detect group when amount difference is > 1 euro on last", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 50 }),
        createSlave({ slaveId: "s3", date: "2025-03-01", amount: 52 }), // +2 diff
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(0);
    });

    it("should detect group when last amount has small rounding diff", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 50 }),
        createSlave({ slaveId: "s3", date: "2025-03-01", amount: 50.5 }), // +0.5 diff, within 1 euro
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(3);
    });

    it("should handle dates with timestamps", () => {
      const slaves = [
        createSlave({
          slaveId: "s1",
          date: "2025-01-15T12:00:00.000Z",
          amount: 50,
        }),
        createSlave({
          slaveId: "s2",
          date: "2025-02-01T14:30:00.000Z",
          amount: 50,
        }),
      ];
      const result = detectSmoothingGroups(slaves);
      expect(result.size).toBe(2);
    });
  });

  describe("getSmoothingGroupsArray", () => {
    it("should return empty array for empty input", () => {
      const result = getSmoothingGroupsArray([]);
      expect(result).toEqual([]);
    });

    it("should return empty array when no smoothing groups exist", () => {
      const slaves = [createSlave({ slaveId: "s1", date: "2025-01-15" })];
      const result = getSmoothingGroupsArray(slaves);
      expect(result).toEqual([]);
    });

    it("should return array with one group for simple smoothing", () => {
      const slaves = [
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 50 }),
      ];
      const result = getSmoothingGroupsArray(slaves);
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(2);
      // Should be sorted by date
      expect(result[0][0].slaveId).toBe("s1");
      expect(result[0][1].slaveId).toBe("s2");
    });

    it("should return multiple groups for different accounts", () => {
      const slaves = [
        createSlave({
          slaveId: "s1",
          date: "2025-01-15",
          amount: 50,
          accountId: "acc-1",
        }),
        createSlave({
          slaveId: "s2",
          date: "2025-02-01",
          amount: 50,
          accountId: "acc-1",
        }),
        createSlave({
          slaveId: "s3",
          date: "2025-01-15",
          amount: 30,
          accountId: "acc-2",
        }),
        createSlave({
          slaveId: "s4",
          date: "2025-02-01",
          amount: 30,
          accountId: "acc-2",
        }),
      ];
      const result = getSmoothingGroupsArray(slaves);
      expect(result.length).toBe(2);
      expect(result[0].length).toBe(2);
      expect(result[1].length).toBe(2);
    });

    it("should return groups sorted by date", () => {
      const slaves = [
        createSlave({ slaveId: "s3", date: "2025-03-01", amount: 50 }),
        createSlave({ slaveId: "s1", date: "2025-01-15", amount: 50 }),
        createSlave({ slaveId: "s2", date: "2025-02-01", amount: 50 }),
      ];
      const result = getSmoothingGroupsArray(slaves);
      expect(result.length).toBe(1);
      expect(result[0][0].slaveId).toBe("s1");
      expect(result[0][1].slaveId).toBe("s2");
      expect(result[0][2].slaveId).toBe("s3");
    });
  });
});
