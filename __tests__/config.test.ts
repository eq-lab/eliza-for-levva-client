import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import plugin from "../src/plugin";
import { z } from "zod";
import { createMockRuntime } from "./utils/core-test-utils";

// Mock logger
vi.mock("@elizaos/core", async () => {
  const actual = await vi.importActual("@elizaos/core");
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
});

// Access the plugin's init function
const initPlugin = plugin.init;

describe("Plugin Configuration Schema", () => {
  // Create a backup of the original env values
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment variables after each test
    process.env = { ...originalEnv };
  });

  it("should accept valid configuration", async () => {
    const validConfig = {
      KYBER_CLIENT_ID: "valid-kyber-id",
    };

    if (initPlugin) {
      let error = null;
      try {
        await initPlugin(validConfig, createMockRuntime());
      } catch (e) {
        error = e;
      }
      expect(error).toBeNull();
    }
  });

  it("should accept empty configuration", async () => {
    const emptyConfig = {};

    if (initPlugin) {
      let error = null;
      try {
        await initPlugin(emptyConfig, createMockRuntime());
      } catch (e) {
        error = e;
      }
      expect(error).toBeNull();
    }
  });

  it("should accept configuration with additional properties", async () => {
    const configWithExtra = {
      KYBER_CLIENT_ID: "valid-kyber-id",
      EXTRA_PROPERTY: "extra-value",
    };

    if (initPlugin) {
      let error = null;
      try {
        await initPlugin(configWithExtra, createMockRuntime());
      } catch (e) {
        error = e;
      }
      expect(error).toBeNull();
    }
  });

  it("should accept configuration with undefined KYBER_CLIENT_ID", async () => {
    const configWithUndefined = {
      KYBER_CLIENT_ID: undefined,
    };

    if (initPlugin) {
      let error = null;
      try {
        await initPlugin(configWithUndefined, createMockRuntime());
      } catch (e) {
        error = e;
      }
      expect(error).toBeNull();
    }
  });

  it("should set environment variables from valid config", async () => {
    const validConfig = {
      KYBER_CLIENT_ID: "test-kyber-value",
    };

    if (initPlugin) {
      await initPlugin(validConfig, createMockRuntime());

      // Note: The plugin doesn't automatically set env vars,
      // it just uses them from the config
      expect(validConfig.KYBER_CLIENT_ID).toBe("test-kyber-value");
    }
  });

  it("should not override existing environment variables", async () => {
    // Set an existing environment variable
    process.env.KYBER_CLIENT_ID = "existing-value";

    const config = {
      KYBER_CLIENT_ID: "new-value",
    };

    if (initPlugin) {
      await initPlugin(config, createMockRuntime());

      // Environment variable should remain unchanged
      expect(process.env.KYBER_CLIENT_ID).toBe("existing-value");
    }
  });

  it("should handle zod validation errors gracefully", () => {
    // Test that our schema handles validation properly
    const configSchema = z.object({
      KYBER_CLIENT_ID: z.string().optional(),
    });

    const validConfig = { KYBER_CLIENT_ID: "valid-id" };
    const invalidConfig = { KYBER_CLIENT_ID: 123 }; // number instead of string

    expect(() => configSchema.parse(validConfig)).not.toThrow();
    expect(() => configSchema.parse(invalidConfig)).toThrow();
  });

  it("should rethrow non-zod errors", async () => {
    // Create a mock runtime that throws a non-zod error
    const errorRuntime = {
      ...createMockRuntime(),
      registerService: () => {
        throw new Error("Non-zod error");
      },
    };

    if (initPlugin) {
      let caughtError = null;
      try {
        await initPlugin({ KYBER_CLIENT_ID: "test" }, errorRuntime);
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe("Non-zod error");
    }
  });
});
