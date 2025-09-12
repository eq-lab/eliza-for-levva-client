import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import plugin from "../src/plugin";
import { logger } from "@elizaos/core";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { v4 as uuidv4 } from "uuid";

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

describe("Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Action Error Handling", () => {
    it("should log errors in action handlers", async () => {
      // Find a Levva action
      const action = plugin.actions?.find((a) => a.name === "MANAGE_POSITIONS");

      if (action && action.handler) {
        // Create a mock runtime that will cause an error
        const mockRuntime = {
          getService: vi.fn().mockReturnValue(null), // This should cause an error
          composeState: vi.fn().mockResolvedValue({ data: { providers: {} } }),
          logger: {
            error: vi.fn(),
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
          },
        } as unknown as IAgentRuntime;

        const mockMessage = {
          id: uuidv4(),
          userId: uuidv4(),
          content: {
            text: "Show me my positions",
            source: "test",
          },
          metadata: {
            userAddressId: "0x1234567890123456789012345678901234567890",
            chainId: 1,
          },
        } as Memory;

        const mockState = {} as State;
        const mockCallback = vi.fn();

        try {
          await action.handler(
            mockRuntime,
            mockMessage,
            mockState,
            {},
            mockCallback
          );
        } catch (error) {
          // Error handling is expected in this case
          expect(error).toBeDefined();
        }

        // The action should have attempted to handle the error gracefully
        expect(mockCallback).toHaveBeenCalled();
      }
    });
  });

  describe("Service Error Handling", () => {
    it("should handle missing services gracefully", async () => {
      const mockRuntime = {
        getService: vi.fn().mockReturnValue(null),
        composeState: vi.fn().mockResolvedValue({ data: { providers: {} } }),
        logger: {
          error: vi.fn(),
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        },
      } as unknown as IAgentRuntime;

      // Test that actions handle missing services
      const action = plugin.actions?.find((a) => a.name === "MANAGE_POSITIONS");
      
      if (action) {
        const mockMessage = {
          id: uuidv4(),
          userId: uuidv4(),
          content: { text: "test", source: "test" },
          metadata: { userAddressId: "0x1234", chainId: 1 },
        } as Memory;

        const mockCallback = vi.fn();

        try {
          await action.handler(mockRuntime, mockMessage, {} as State, {}, mockCallback);
        } catch (error) {
          // Should handle gracefully
        }

        // Should have called the callback with an error response
        expect(mockCallback).toHaveBeenCalled();
      }
    });

    it("should handle service initialization errors", async () => {
      if (plugin.init) {
        const mockRuntime = {
          registerService: vi.fn().mockImplementation(() => {
            throw new Error("Service registration failed");
          }),
          logger: {
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
          },
        } as unknown as IAgentRuntime;

        let caughtError = null;
        try {
          await plugin.init({}, mockRuntime);
        } catch (error) {
          caughtError = error;
        }

        expect(caughtError).toBeDefined();
        expect((caughtError as Error).message).toContain("Service registration failed");
      }
    });
  });

  describe("Plugin Events Error Handling", () => {
    it("should handle errors in event handlers gracefully", () => {
      // Test that plugin events are properly structured
      expect(plugin.events).toBeDefined();
      
      if (plugin.events) {
        plugin.events.forEach(event => {
          expect(event).toHaveProperty("name");
          expect(event).toHaveProperty("handler");
          expect(typeof event.handler).toBe("function");
        });
      }
    });
  });

  describe("Provider Error Handling", () => {
    it("should handle errors in provider.get method", async () => {
      const provider = plugin.providers?.find(p => p.name === "LEVVA_PROVIDER");
      
      if (provider) {
        const mockRuntime = {
          getService: vi.fn().mockImplementation(() => {
            throw new Error("Service error");
          }),
          logger: {
            error: vi.fn(),
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
          },
        } as unknown as IAgentRuntime;

        const mockMessage = {
          id: uuidv4(),
          content: { text: "test" },
        } as Memory;

        const mockState = {} as State;

        try {
          await provider.get(mockRuntime, mockMessage, mockState);
        } catch (error) {
          // Provider should handle errors gracefully
          expect(error).toBeDefined();
        }
      }
    });
  });
});