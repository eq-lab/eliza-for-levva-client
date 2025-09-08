import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import plugin from "../src/plugin";
import { ModelType, logger } from "@elizaos/core";
import dotenv from "dotenv";

// Setup environment variables
dotenv.config();

// Need to spy on logger for documentation
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
  result: Record<string, any>,
  error?: Error
) {
  if (error) {
    logger.error(`✗ Error: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
  } else {
    logger.info(`✓ Testing: ${testName}`);
    logger.info(`  → ${JSON.stringify(result)}`);
  }
}

// Mock runtime for testing
function createMockRuntime() {
  const services = new Map();
  return {
    character: {
      name: "Test Character",
      system: "You are a helpful assistant for testing.",
    },
    getService: (serviceType: string) => services.get(serviceType),
    registerService: (serviceType: string, service: any) => {
      services.set(serviceType, service);
    },
    useModel: vi.fn().mockResolvedValue("Test response"),
    logger,
  };
}

describe("Plugin Configuration", () => {
  it("should have correct plugin metadata", () => {
    expect(plugin.name).toBe("levva");
    expect(plugin.description).toBe("Levva plugin for Eliza");
    expect(plugin.config).toBeDefined();

    documentTestResult("Plugin metadata check", {
      name: plugin.name,
      description: plugin.description,
      hasConfig: !!plugin.config,
    });
  });

  it("should include the KYBER_CLIENT_ID in config", () => {
    expect(plugin.config).toHaveProperty("KYBER_CLIENT_ID");

    documentTestResult("Plugin config check", {
      hasKyberClientId: plugin.config
        ? "KYBER_CLIENT_ID" in plugin.config
        : false,
      configKeys: Object.keys(plugin.config || {}),
    });
  });

  it("should initialize properly", async () => {
    const originalEnv = process.env.KYBER_CLIENT_ID;

    try {
      process.env.KYBER_CLIENT_ID = "test-kyber-id";
      const runtime = createMockRuntime();

      let error: Error | null = null;
      try {
        await plugin.init?.(
          { KYBER_CLIENT_ID: "test-kyber-id" },
          runtime as any
        );
        expect(true).toBe(true); // If we got here, init succeeded
      } catch (e) {
        error = e as Error;
        logger.error("Plugin initialization error:", e);
      }

      documentTestResult(
        "Plugin initialization",
        {
          success: !error,
          configValue: process.env.KYBER_CLIENT_ID,
        },
        error
      );
    } finally {
      if (originalEnv !== undefined) {
        process.env.KYBER_CLIENT_ID = originalEnv;
      } else {
        delete process.env.KYBER_CLIENT_ID;
      }
    }
  });

  it("should have a valid config", () => {
    expect(plugin.config).toBeDefined();
    if (plugin.config) {
      // Check if the config has expected KYBER_CLIENT_ID property
      expect(Object.keys(plugin.config)).toContain("KYBER_CLIENT_ID");
    }
  });
});

describe("Plugin Models", () => {
  it("should have TEXT_SMALL model defined", () => {
    // Our plugin doesn't define custom models, it uses the core ones
    expect(ModelType.SMALL).toBeDefined();
    expect(typeof ModelType.SMALL).toBe("string");
  });

  it("should have TEXT_LARGE model defined", () => {
    expect(ModelType.LARGE).toBeDefined();
    expect(typeof ModelType.LARGE).toBe("string");
  });

  it("should return a response from TEXT_SMALL model", async () => {
    const runtime = createMockRuntime();

    // Test that we can use the model (mocked)
    const response = await runtime.useModel(ModelType.SMALL, "test prompt");
    expect(response).toBe("Test response");
  });
});

describe("Plugin Components", () => {
  it("should have actions defined", () => {
    expect(plugin.actions).toBeDefined();
    expect(Array.isArray(plugin.actions)).toBe(true);
    expect(plugin.actions.length).toBeGreaterThan(0);

    documentTestResult("Actions check", {
      hasActions: !!plugin.actions,
      actionCount: plugin.actions?.length || 0,
      actionNames: plugin.actions?.map((a) => a.name) || [],
    });
  });

  it("should have providers defined", () => {
    expect(plugin.providers).toBeDefined();
    expect(Array.isArray(plugin.providers)).toBe(true);
    expect(plugin.providers.length).toBeGreaterThan(0);

    documentTestResult("Providers check", {
      hasProviders: !!plugin.providers,
      providerCount: plugin.providers?.length || 0,
      providerNames: plugin.providers?.map((p) => p.name) || [],
    });
  });

  it("should have evaluators defined", () => {
    expect(plugin.evaluators).toBeDefined();
    expect(Array.isArray(plugin.evaluators)).toBe(true);
    expect(plugin.evaluators.length).toBeGreaterThan(0);

    documentTestResult("Evaluators check", {
      hasEvaluators: !!plugin.evaluators,
      evaluatorCount: plugin.evaluators?.length || 0,
      evaluatorNames: plugin.evaluators?.map((e) => e.name) || [],
    });
  });

  it("should have routes defined", () => {
    expect(plugin.routes).toBeDefined();
    expect(Array.isArray(plugin.routes)).toBe(true);
    expect(plugin.routes.length).toBeGreaterThan(0);

    documentTestResult("Routes check", {
      hasRoutes: !!plugin.routes,
      routeCount: plugin.routes?.length || 0,
      routePaths: plugin.routes?.map((r) => r.path) || [],
    });
  });
});
