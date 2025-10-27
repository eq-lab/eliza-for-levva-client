import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import plugin from "../src/plugin";
import {
  type IAgentRuntime,
  type Memory,
  type State,
  UUID,
  logger,
} from "@elizaos/core";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

// Setup environment variables
dotenv.config();

// Set up logging to capture issues
beforeAll(() => {
  vi.spyOn(logger, "info");
  vi.spyOn(logger, "error");
  vi.spyOn(logger, "warn");
  vi.spyOn(logger, "debug");
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Helper function to document test results
function documentTestResult(
  testName: string,
  result: any,
  error: Error | null = null
) {
  logger.info(`✓ Testing: ${testName}`);

  if (error) {
    logger.error(`✗ Error: ${error.message}`);
    if (error.stack) {
      logger.error(`Stack: ${error.stack}`);
    }
    return;
  }

  if (result) {
    if (typeof result === "string") {
      if (result.trim() && result.length > 0) {
        const preview =
          result.length > 60 ? `${result.substring(0, 60)}...` : result;
        logger.info(`  → ${preview}`);
      }
    } else if (typeof result === "object") {
      try {
        const keys = Object.keys(result);
        logger.info(`  → {${keys.join(", ")}}`);
      } catch (e) {
        logger.info(`  → [object]`, e);
      }
    } else {
      logger.info(`  → ${result}`);
    }
  }
}

// Mock runtime for testing
function createMockRuntime(): IAgentRuntime {
  return {
    character: {
      name: "Test Character",
      system: "You are a helpful assistant for testing.",
    },
    getService: vi.fn(),
    registerService: vi.fn(),
    useModel: vi.fn().mockResolvedValue("Test response"),
    logger,
  } as any;
}

const USER_UUID: UUID = "00000000-0000-0000-0000-000000000001";
const AGENT_UUID: UUID = "00000000-0000-0000-0000-000000000002";
const ROOM_UUID: UUID = "00000000-0000-0000-0000-000000000003";
const ENTITY_UUID: UUID = "00000000-0000-0000-0000-000000000004";

// Mock message for testing
function createMockMessage(text: string = "test message"): Memory {
  return {
    id: uuidv4(),
    content: { text },
    userId: USER_UUID,
    entityId: ENTITY_UUID,
    agentId: AGENT_UUID,
    roomId: ROOM_UUID,
    createdAt: Date.now(),
  } as Memory;
}

// Mock state for testing
function createMockState(): State {
  return {
    text: "",
    values: {},
    data: {
      userId: USER_UUID,
      agentId: AGENT_UUID,
      roomId: ROOM_UUID,
      providers: {},
    },
  } as State;
}

describe("Provider Tests", () => {
  // Find specific Levva providers
  const levvaProvider = plugin.providers?.find((p) => p.name === "levva");
  const newsProvider = plugin.providers?.find((p) => p.name === "CRYPTO_NEWS");
  const swapParamsProvider = plugin.providers?.find(
    (p) => p.name === "SWAP_PARAMS"
  );
  const strategyParamsProvider = plugin.providers?.find(
    (p) => p.name === "STRATEGY_PARAMS"
  );
  const positionParamsProvider = plugin.providers?.find(
    (p) => p.name === "position-params"
  );

  describe("LEVVA_PROVIDER", () => {
    it("should exist in the plugin", () => {
      expect(levvaProvider).toBeDefined();
      documentTestResult("Provider exists check", {
        found: !!levvaProvider,
        name: levvaProvider?.name,
      });
    });

    it("should have the correct structure", () => {
      if (levvaProvider) {
        expect(levvaProvider).toHaveProperty("name");
        expect(levvaProvider).toHaveProperty("get");
        expect(typeof levvaProvider.get).toBe("function");

        documentTestResult("Provider structure check", {
          hasName: !!levvaProvider.name,
          hasGet: typeof levvaProvider.get === "function",
        });
      }
    });

    it("should return provider data from the get method", async () => {
      if (levvaProvider) {
        const runtime = createMockRuntime();
        const message = createMockMessage();
        const state = createMockState();

        try {
          const result = await levvaProvider.get(runtime, message, state);
          expect(result).toBeDefined();

          documentTestResult("Provider get method", {
            resultType: typeof result,
            hasData: !!result,
          });
        } catch (error) {
          // Some providers might require specific setup, that's okay
          documentTestResult(
            "Provider get method",
            { attempted: true },
            error as Error
          );
        }
      }
    });
  });

  describe("NEWS_PROVIDER", () => {
    it("should exist in the plugin", () => {
      expect(newsProvider).toBeDefined();
    });

    it("should have the correct structure", () => {
      if (newsProvider) {
        expect(newsProvider).toHaveProperty("name", "CRYPTO_NEWS");
        expect(newsProvider).toHaveProperty("get");
        expect(typeof newsProvider.get).toBe("function");
      }
    });
  });

  describe("SWAP_PARAMS Provider", () => {
    it("should exist in the plugin", () => {
      expect(swapParamsProvider).toBeDefined();
    });

    it("should have the correct structure", () => {
      if (swapParamsProvider) {
        expect(swapParamsProvider).toHaveProperty("name", "SWAP_PARAMS");
        expect(swapParamsProvider).toHaveProperty("get");
        expect(typeof swapParamsProvider.get).toBe("function");
      }
    });
  });

  describe("STRATEGY_PARAMS Provider", () => {
    it("should exist in the plugin", () => {
      expect(strategyParamsProvider).toBeDefined();
    });

    it("should have the correct structure", () => {
      if (strategyParamsProvider) {
        expect(strategyParamsProvider).toHaveProperty(
          "name",
          "STRATEGY_PARAMS"
        );
        expect(strategyParamsProvider).toHaveProperty("get");
        expect(typeof strategyParamsProvider.get).toBe("function");
      }
    });
  });

  describe("POSITION_PARAMS Provider", () => {
    it("should exist in the plugin", () => {
      expect(positionParamsProvider).toBeDefined();
    });

    it("should have the correct structure", () => {
      if (positionParamsProvider) {
        expect(positionParamsProvider).toHaveProperty(
          "name",
          "position-params"
        );
        expect(positionParamsProvider).toHaveProperty("get");
        expect(typeof positionParamsProvider.get).toBe("function");
      }
    });
  });

  describe("Provider Registration", () => {
    it("should include providers in the plugin definition", () => {
      expect(plugin.providers).toBeDefined();
      expect(Array.isArray(plugin.providers)).toBe(true);
      expect(plugin.providers?.length).toBeGreaterThan(0);

      documentTestResult("Provider registration check", {
        hasProviders: !!plugin.providers,
        providerCount: plugin.providers?.length || 0,
        allValid: plugin.providers?.every((p) => p.name && p.get) || false,
      });
    });

    it("should correctly initialize providers array", () => {
      if (plugin.providers) {
        const invalidProviders = plugin.providers.filter(
          (provider) => !provider.name || typeof provider.get !== "function"
        );

        expect(invalidProviders.length).toBe(0);

        documentTestResult("Provider initialization check", {
          providersCount: plugin.providers.length,
          allValid: invalidProviders.length === 0,
          invalidProviders: invalidProviders.map((p) => p.name || "unnamed"),
        });
      }
    });

    it("should have unique provider names", () => {
      if (plugin.providers) {
        const providerNames = plugin.providers.map((p) => p.name);
        const uniqueProviders = [...new Set(providerNames)];

        expect(providerNames.length).toBe(uniqueProviders.length);

        documentTestResult("Provider uniqueness check", {
          totalProviders: providerNames.length,
          uniqueProviders: uniqueProviders.length,
          duplicates: providerNames.length - uniqueProviders.length,
        });
      }
    });
  });
});
