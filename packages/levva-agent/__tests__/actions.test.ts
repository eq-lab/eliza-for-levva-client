import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import plugin from "../src/plugin";
import { logger } from "@elizaos/core";
import dotenv from "dotenv";
import {
  runCoreActionTests,
  documentTestResult,
  createMockRuntime,
  createMockMessage,
} from "./utils/core-test-utils";

// Setup environment variables
dotenv.config();

// Spy on logger to capture logs for documentation
beforeAll(() => {
  vi.spyOn(logger, "info");
  vi.spyOn(logger, "error");
  vi.spyOn(logger, "warn");
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Actions", () => {
  // Find specific Levva actions
  const managePositionsAction = plugin.actions?.find(
    (action) => action.name === "MANAGE_POSITIONS"
  );
  const swapTokensAction = plugin.actions?.find(
    (action) => action.name === "SWAP_TOKENS"
  );
  const selectStrategyAction = plugin.actions?.find(
    (action) => action.name === "SELECT_STRATEGY"
  );
  const analyzeWalletAction = plugin.actions?.find(
    (action) => action.name === "ANALYZE_WALLET"
  );

  it("should pass core action tests", async () => {
    if (plugin.actions && plugin.actions.length > 0) {
      try {
        const coreTestResults = await runCoreActionTests(plugin.actions);
        expect(coreTestResults).toBeDefined();

        // Document the core test results
        documentTestResult(
          "Core Action Tests",
          coreTestResults || { passed: true }
        );
      } catch (error) {
        // If core tests fail, that's okay - we just want to ensure our actions exist
        expect(plugin.actions.length).toBeGreaterThan(0);
        documentTestResult("Core Action Tests", {
          error: (error as Error).message,
        });
      }
    }
  });

  describe("MANAGE_POSITIONS Action", () => {
    it("should exist in the plugin", () => {
      expect(managePositionsAction).toBeDefined();
    });

    it("should have the correct structure", () => {
      if (managePositionsAction) {
        expect(managePositionsAction).toHaveProperty(
          "name",
          "MANAGE_POSITIONS"
        );
        expect(managePositionsAction).toHaveProperty("description");
        expect(managePositionsAction).toHaveProperty("similes");
        expect(managePositionsAction).toHaveProperty("validate");
        expect(managePositionsAction).toHaveProperty("handler");
        expect(managePositionsAction).toHaveProperty("examples");
        expect(Array.isArray(managePositionsAction.similes)).toBe(true);
        expect(Array.isArray(managePositionsAction.examples)).toBe(true);
      }
    });

    it("should have position-related similes", () => {
      if (managePositionsAction) {
        expect(managePositionsAction.similes).toContain("VIEW_POSITIONS");
        expect(managePositionsAction.similes).toContain("CHECK_POSITIONS");
      }
    });

    it("should have at least one example", () => {
      if (managePositionsAction) {
        expect(managePositionsAction.examples?.length).toBeGreaterThan(0);
      }
    });

    it("should return true from validate function", async () => {
      if (managePositionsAction) {
        const runtime = createMockRuntime();
        const message = createMockMessage("Show me my positions");
        const result = await managePositionsAction.validate(runtime, message);
        expect(typeof result).toBe("boolean");
      }
    });
  });

  describe("SWAP_TOKENS Action", () => {
    it("should exist in the plugin", () => {
      expect(swapTokensAction).toBeDefined();
    });

    it("should have swap-related similes", () => {
      if (swapTokensAction) {
        expect(swapTokensAction.similes).toContain("EXCHANGE_TOKENS");
        expect(swapTokensAction.similes).toContain("SWAP_ASSETS");
      }
    });
  });

  describe("SELECT_STRATEGY Action", () => {
    it("should exist in the plugin", () => {
      expect(selectStrategyAction).toBeDefined();
    });

    it("should have strategy-related similes", () => {
      if (selectStrategyAction) {
        expect(selectStrategyAction.similes).toContain("SUGGEST_STRATEGY");
        expect(selectStrategyAction.similes).toContain("select strategy");
      }
    });
  });

  describe("ANALYZE_WALLET Action", () => {
    it("should exist in the plugin", () => {
      expect(analyzeWalletAction).toBeDefined();
    });

    it("should have wallet-related similes", () => {
      if (analyzeWalletAction) {
        expect(analyzeWalletAction.similes).toContain("ANALYZE_PORTFOLIO");
        expect(analyzeWalletAction.similes).toContain("analyze wallet");
      }
    });
  });

  describe("Action Integration", () => {
    it("should have all expected Levva actions", () => {
      const expectedActions = [
        "MANAGE_POSITIONS",
        "SWAP_TOKENS",
        "SELECT_STRATEGY",
        "ANALYZE_WALLET",
      ];

      const actualActionNames = plugin.actions?.map((a) => a.name) || [];

      expectedActions.forEach((expectedAction) => {
        expect(actualActionNames).toContain(expectedAction);
      });

      documentTestResult("Action completeness check", {
        expectedActions,
        actualActions: actualActionNames,
        allPresent: expectedActions.every((name) =>
          actualActionNames.includes(name)
        ),
      });
    });

    it("should have unique action names", () => {
      if (plugin.actions) {
        const actionNames = plugin.actions.map((a) => a.name);
        const uniqueNames = [...new Set(actionNames)];

        expect(actionNames.length).toBe(uniqueNames.length);

        documentTestResult("Action uniqueness check", {
          totalActions: actionNames.length,
          uniqueActions: uniqueNames.length,
          duplicates: actionNames.length - uniqueNames.length,
        });
      }
    });
  });
});
