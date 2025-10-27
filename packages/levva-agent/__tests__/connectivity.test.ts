import { describe, it, expect } from "vitest";

const TEST_CONFIG = {
  baseUrl: process.env.ELIZA_BASE_URL || "http://localhost:3001",
  testAddress: "0x463E3466f6C332959969a99811A7A95D080FE0B2",
};

describe("Server Connectivity", () => {
  it("should connect to status endpoint", async () => {
    const url = `${TEST_CONFIG.baseUrl}/api/levva/status?address=${TEST_CONFIG.testAddress}`;
    console.log(`Testing connectivity to: ${url}`);

    const response = await fetch(url);
    console.log(`Response status: ${response.status}`);
    console.log(`Response ok: ${response.ok}`);

    const data = await response.json();
    console.log(`Response data:`, data);

    expect(response.ok).toBe(true);
    expect(data).toBeDefined();
  });

  it("should handle fetch errors gracefully", async () => {
    const url = `${TEST_CONFIG.baseUrl}/api/levva/nonexistent`;
    console.log(`Testing error handling: ${url}`);

    try {
      const response = await fetch(url);
      console.log(`Response status: ${response.status}`);
      expect(response.status).toBeGreaterThan(0);
    } catch (error) {
      console.error(`Fetch error:`, error);
      throw error;
    }
  });

  it("should verify server is running", async () => {
    try {
      const response = await fetch(TEST_CONFIG.baseUrl);
      console.log(`Base URL response status: ${response.status}`);
      expect(response).toBeDefined();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Server is not running at ${TEST_CONFIG.baseUrl}. ` +
          `Start it with 'bun run dev'. Error: ${errorMsg}`
      );
    }
  });
});
