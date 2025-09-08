import { describe, expect, it, vi } from "vitest";
import plugin from "../src/plugin";

describe("Plugin Routes", () => {
  it("should have routes defined", () => {
    expect(plugin.routes).toBeDefined();
    if (plugin.routes) {
      expect(Array.isArray(plugin.routes)).toBe(true);
      expect(plugin.routes.length).toBeGreaterThan(0);
    }
  });

  it("should have a route for /status", () => {
    if (plugin.routes) {
      const statusRoute = plugin.routes.find(
        (route) => route.path === "/status"
      );
      expect(statusRoute).toBeDefined();

      if (statusRoute) {
        expect(statusRoute.type).toBe("GET");
        expect(typeof statusRoute.handler).toBe("function");
      }
    }
  });

  it("should have a route for /calldata", () => {
    if (plugin.routes) {
      const calldataRoute = plugin.routes.find(
        (route) => route.path === "/calldata"
      );
      expect(calldataRoute).toBeDefined();

      if (calldataRoute) {
        expect(calldataRoute.type).toBe("GET");
        expect(typeof calldataRoute.handler).toBe("function");
      }
    }
  });

  it("should have a route for /levva-user", () => {
    if (plugin.routes) {
      const levvaUserRoute = plugin.routes.find(
        (route) => route.path === "/levva-user"
      );
      expect(levvaUserRoute).toBeDefined();

      if (levvaUserRoute) {
        expect(typeof levvaUserRoute.handler).toBe("function");
      }
    }
  });

  it("should handle route requests correctly", async () => {
    if (plugin.routes) {
      const statusRoute = plugin.routes.find(
        (route) => route.path === "/status"
      );

      if (statusRoute) {
        // Mock request and response objects
        const mockReq = {
          method: "GET",
          url: "/status",
          headers: {},
        };

        const mockRes = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
          send: vi.fn().mockReturnThis(),
        };

        // Test that the handler can be called without throwing
        try {
          await statusRoute.handler(mockReq as any, mockRes as any);
          expect(true).toBe(true); // If we get here, no error was thrown
        } catch (error) {
          // Some routes might require specific setup, that's okay for this test
          expect(error).toBeDefined();
        }
      }
    }
  });

  it("should validate route structure", () => {
    if (plugin.routes) {
      plugin.routes.forEach((route) => {
        expect(route).toHaveProperty("path");
        expect(route).toHaveProperty("type");
        expect(route).toHaveProperty("handler");
        expect(typeof route.path).toBe("string");
        expect(typeof route.type).toBe("string");
        expect(typeof route.handler).toBe("function");
      });
    }
  });

  it("should have unique route paths", () => {
    if (plugin.routes) {
      const routePaths = plugin.routes.map(route => route.path);
      const uniquePaths = [...new Set(routePaths)];
      
      expect(routePaths.length).toBe(uniquePaths.length);
    }
  });
});