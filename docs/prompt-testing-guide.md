# Prompt Testing Guide

**Version:** 1.0.0  
**Last Updated:** 2025-01-XX  
**Audience:** Developers testing LLM prompts

---

## 📚 Table of Contents

1. [Introduction](#introduction)
2. [Testing Philosophy](#testing-philosophy)
3. [Test Types](#test-types)
4. [Helper Function Tests](#helper-function-tests)
5. [Prompt Integration Tests](#prompt-integration-tests)
6. [Edge Case Testing](#edge-case-testing)
7. [Example Tests](#example-tests)
8. [Best Practices](#best-practices)

---

## Introduction

This guide provides patterns and best practices for testing LLM prompts in the ElizaOS Levva Agent. Effective testing ensures prompts behave consistently and handle edge cases gracefully.

---

## Testing Philosophy

### Why Test Prompts?

1. **Consistency** - Ensure prompts produce expected output formats
2. **Regression Prevention** - Catch breaking changes early
3. **Edge Cases** - Verify handling of unusual inputs
4. **Documentation** - Tests serve as usage examples

### What to Test

✅ **Do Test:**
- Parameter extraction accuracy
- Output format compliance
- Edge case handling
- Helper function correctness
- Type safety

❌ **Don't Test:**
- Exact LLM responses (non-deterministic)
- Natural language quality (subjective)
- Response creativity (varies)

### Testing Layers

```
┌─────────────────────────────────────┐
│   Integration Tests                 │  <- End-to-end prompt behavior
├─────────────────────────────────────┤
│   Prompt Function Tests             │  <- Prompt generation logic
├─────────────────────────────────────┤
│   Helper Function Tests             │  <- Utility functions
└─────────────────────────────────────┘
```

---

## Test Types

### 1. **Unit Tests** (Helper Functions)

**What:** Test individual helper functions in isolation

**Location:** `__tests__/prompts/helpers/`

**Example:**
```typescript
describe("formatTokenAmount", () => {
  it("should format whole numbers correctly", () => {
    expect(formatTokenAmount(100n, 18)).toBe("100");
  });

  it("should format decimals correctly", () => {
    expect(formatTokenAmount(1500000000000000000n, 18)).toBe("1.5");
  });

  it("should trim trailing zeros", () => {
    expect(formatTokenAmount(1000000000000000000n, 18)).toBe("1");
  });
});
```

### 2. **Prompt Function Tests**

**What:** Test prompt generation logic and structure

**Location:** `__tests__/prompts/`

**Example:**
```typescript
describe("extractDepositDataPrompt", () => {
  it("should include all required sections", () => {
    const prompt = extractDepositDataFromMessagePrompt({
      messages: "I want to deposit 100 USDC",
      strategyIdMap: {},
      availableStrategies: "",
      userPortfolio: "",
      availableTokens: "",
    });

    expect(prompt).toContain("<task>");
    expect(prompt).toContain("<message>");
    expect(prompt).toContain("<instructions>");
    expect(prompt).toContain("<output>");
  });

  it("should include context when provided", () => {
    const prompt = extractDepositDataFromMessagePrompt({
      messages: "deposit",
      strategyIdMap: { 1: "Strategy 1" },
      availableStrategies: "Safe Strategy",
      userPortfolio: "USDC: 1000",
      availableTokens: "USDC, ETH",
    });

    expect(prompt).toContain("Safe Strategy");
    expect(prompt).toContain("USDC: 1000");
  });
});
```

### 3. **Integration Tests**

**What:** Test complete prompt → LLM → parsing flow

**Location:** `__tests__/integration/prompts/`

**Example:**
```typescript
describe("Deposit Extraction Integration", () => {
  it("should extract complete deposit parameters", async () => {
    const runtime = createMockRuntime();
    const message = "I want to deposit 100 USDC into safe strategy";
    
    const result = await extractAndParseDepositData(runtime, message);

    expect(result.tokenSymbol).toBe("USDC");
    expect(result.amount).toBe("100");
    expect(result.strategyRisk).toBe("safe");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

---

## Helper Function Tests

### Template for Helper Tests

```typescript
import { describe, it, expect } from "vitest";
import { helperFunction } from "../../src/prompts/helpers";

describe("helperFunction", () => {
  describe("happy path", () => {
    it("should handle typical input", () => {
      const result = helperFunction(typicalInput);
      expect(result).toEqual(expectedOutput);
    });
  });

  describe("edge cases", () => {
    it("should handle empty input", () => {
      const result = helperFunction("");
      expect(result).toEqual(fallbackOutput);
    });

    it("should handle null/undefined", () => {
      expect(() => helperFunction(null)).not.toThrow();
    });

    it("should handle extreme values", () => {
      const result = helperFunction(BigInt(Number.MAX_SAFE_INTEGER));
      expect(result).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should throw on invalid input", () => {
      expect(() => helperFunction(invalidInput)).toThrow();
    });
  });
});
```

### Example: Testing Amount Helpers

```typescript
import { generateAmountSuggestions, NATIVE_TOKEN_PERCENTAGES } from "../../src/prompts/helpers";

describe("generateAmountSuggestions", () => {
  it("should generate correct native token suggestions", () => {
    const suggestions = generateAmountSuggestions({
      maxAmount: 1000000000000000000n, // 1 ETH
      decimals: 18,
      tokenSymbol: "ETH",
      isNativeToken: true,
    });

    expect(suggestions).toHaveLength(4);
    expect(suggestions[0].percentage).toBe(0.95); // 95% for gas
    expect(suggestions[0].amount).toBe("0.95");
    expect(suggestions[0].label).toBe("0.95 ETH");
  });

  it("should use 100% for non-native tokens", () => {
    const suggestions = generateAmountSuggestions({
      maxAmount: 1000000000n, // 1000 tokens (9 decimals)
      decimals: 9,
      tokenSymbol: "USDC",
      isNativeToken: false,
    });

    expect(suggestions[0].percentage).toBe(1.0);
    expect(suggestions[0].amount).toBe("1000");
  });

  it("should handle zero balance gracefully", () => {
    const suggestions = generateAmountSuggestions({
      maxAmount: 0n,
      decimals: 18,
      tokenSymbol: "DAI",
    });

    expect(suggestions).toHaveLength(4);
    suggestions.forEach(s => {
      expect(s.amount).toBe("0");
    });
  });
});
```

### Example: Testing Token Selection Helpers

```typescript
import { checkEthWethAvailability, generateEthWethConversionNote } from "../../src/prompts/helpers";

describe("checkEthWethAvailability", () => {
  it("should detect ETH availability", () => {
    const assets = [
      { token: "0x0000000000000000000000000000000000000000", symbol: "ETH", amount: 1000n, value: 2000n },
    ];

    const result = checkEthWethAvailability(assets);

    expect(result.hasEth).toBe(true);
    expect(result.hasWeth).toBe(false);
    expect(result.ethBalance).toBe(1000n);
  });

  it("should detect WETH availability", () => {
    const assets = [
      { token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", amount: 500n, value: 1000n },
    ];

    const result = checkEthWethAvailability(assets);

    expect(result.hasEth).toBe(false);
    expect(result.hasWeth).toBe(true);
    expect(result.wethBalance).toBe(500n);
  });
});

describe("generateEthWethConversionNote", () => {
  it("should suggest wrapping when user has ETH", () => {
    const assets = [
      { token: "0x0000000000000000000000000000000000000000", symbol: "ETH", amount: 1000n, value: 2000n },
    ];

    const note = generateEthWethConversionNote(assets);

    expect(note).toContain("ETH");
    expect(note).toContain("wrapped to WETH");
  });

  it("should return empty string when no ETH/WETH", () => {
    const assets = [
      { token: "0xA0b86...", symbol: "USDC", amount: 1000n, value: 1000n },
    ];

    const note = generateEthWethConversionNote(assets);

    expect(note).toBe("");
  });
});
```

---

## Prompt Integration Tests

### Testing Parameter Extraction

```typescript
describe("Swap Parameter Extraction", () => {
  it("should extract basic swap parameters", async () => {
    const runtime = await createTestRuntime();
    const message = createMemory("Swap 100 USDC to ETH");

    const prompt = selectSwapDataFromMessagesPrompt({
      recentMessages: message.content.text,
      tokens: "USDC, ETH, WETH",
    });

    const response = await runtime.useModel(ModelType.OBJECT_SMALL, { prompt });
    const parsed = JSON.parse(response);

    expect(parsed.fromToken).toBe("USDC");
    expect(parsed.toToken).toBe("ETH");
    expect(parsed.amount).toBe("100");
  });

  it("should handle percentage amounts", async () => {
    const runtime = await createTestRuntime();
    const message = createMemory("Swap 50% of my USDC to ETH");

    const prompt = selectSwapDataFromMessagesPrompt({
      recentMessages: message.content.text,
      tokens: "USDC, ETH",
    });

    const response = await runtime.useModel(ModelType.OBJECT_SMALL, { prompt });
    const parsed = JSON.parse(response);

    expect(parsed.amount).toMatch(/50%|0.5/); // Could be either format
  });
});
```

### Testing Suggestion Generation

```typescript
describe("Swap Suggestions", () => {
  it("should generate relevant token pair suggestions", async () => {
    const runtime = await createTestRuntime();
    const service = runtime.getService<LevvaService>("levva");

    const prompt = exchangePairsPrompt({
      conversation: "I want to swap tokens",
      decision: {},
      walletAssetsFormatted: "ETH: 1.0, USDC: 1000",
      availableTokens: [
        { symbol: "ETH", address: "0x..." },
        { symbol: "USDC", address: "0x..." },
        { symbol: "WETH", address: "0x..." },
      ],
    });

    const response = await runtime.useModel(ModelType.OBJECT_SMALL, { prompt });
    const parsed = JSON.parse(response);

    expect(parsed.suggestions).toBeInstanceOf(Array);
    expect(parsed.suggestions.length).toBeGreaterThan(0);
    
    const firstSuggestion = parsed.suggestions[0];
    expect(firstSuggestion).toHaveProperty("label");
    expect(firstSuggestion).toHaveProperty("text");
  });
});
```

---

## Edge Case Testing

### Common Edge Cases

#### 1. Empty or Missing Data

```typescript
it("should handle empty portfolio", () => {
  const prompt = generatePromptWithPortfolio({ assets: [] });
  expect(prompt).toContain("No assets available");
});

it("should handle missing context gracefully", () => {
  const prompt = generatePromptWithContext({
    messages: undefined,
    returnData: undefined,
  });
  expect(prompt).not.toContain("undefined");
});
```

#### 2. Extreme Values

```typescript
it("should handle very large amounts", () => {
  const suggestions = generateAmountSuggestions({
    maxAmount: BigInt("1000000000000000000000000"), // 1M tokens
    decimals: 18,
    tokenSymbol: "HUGE",
  });
  
  expect(suggestions[0].amount).toBeDefined();
  expect(suggestions[0].amount).not.toBe("NaN");
});

it("should handle very small amounts", () => {
  const amount = formatTokenAmount(1n, 18); // 0.000000000000000001
  expect(amount).toBe("0.000000000000000001");
});
```

#### 3. Special Characters and Encoding

```typescript
it("should handle special characters in token symbols", () => {
  const formatted = formatTokenForPrompt({
    symbol: "PT-weETH",
    address: "0x...",
  });
  expect(formatted).toContain("PT-weETH");
});

it("should handle unicode in user messages", () => {
  const prompt = extractFromMessage("I want to deposit 💯 USDC");
  expect(prompt).not.toThrow();
});
```

#### 4. Ambiguous Input

```typescript
it("should handle ambiguous token names", async () => {
  const response = await extractSwapParams("Swap DAI to Dai"); // Same token different case
  expect(response.confidence).toBeLessThan(0.5);
  expect(response.thought).toContain("ambiguous");
});

it("should handle conflicting parameters", async () => {
  const response = await extractDepositParams({
    messages: "Deposit into safe strategy",
    inheritedData: { strategyRisk: "brave" }, // Conflict!
  });
  
  expect(response.thought).toContain("conflict");
});
```

---

## Example Tests

### Complete Test File Example

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  generateAmountSuggestions,
  formatTokenAmount,
  NATIVE_TOKEN_PERCENTAGES,
} from "../../src/prompts/helpers";

describe("Amount Suggestion Helpers", () => {
  describe("formatTokenAmount", () => {
    const testCases = [
      { amount: 0n, decimals: 18, expected: "0" },
      { amount: 1000000000000000000n, decimals: 18, expected: "1" },
      { amount: 1500000000000000000n, decimals: 18, expected: "1.5" },
      { amount: 123456789000000000n, decimals: 18, expected: "0.123456789" },
    ];

    testCases.forEach(({ amount, decimals, expected }) => {
      it(`should format ${amount} with ${decimals} decimals as "${expected}"`, () => {
        expect(formatTokenAmount(amount, decimals)).toBe(expected);
      });
    });

    it("should trim trailing zeros", () => {
      const result = formatTokenAmount(1000000000000000000n, 18);
      expect(result).not.toMatch(/\\.0+$/);
    });
  });

  describe("generateAmountSuggestions", () => {
    let config: AmountSuggestionConfig;

    beforeEach(() => {
      config = {
        maxAmount: 1000000000000000000n,
        decimals: 18,
        tokenSymbol: "TEST",
      };
    });

    it("should generate 4 suggestions by default", () => {
      const suggestions = generateAmountSuggestions(config);
      expect(suggestions).toHaveLength(4);
    });

    it("should use native token percentages when specified", () => {
      const suggestions = generateAmountSuggestions({
        ...config,
        isNativeToken: true,
      });

      const percentages = suggestions.map((s) => s.percentage);
      expect(percentages).toEqual(Object.values(NATIVE_TOKEN_PERCENTAGES));
    });

    it("should include token symbol in labels", () => {
      const suggestions = generateAmountSuggestions(config);
      
      suggestions.forEach((s) => {
        expect(s.label).toContain("TEST");
      });
    });
  });
});
```

---

## Best Practices

### 1. Test Helpers Thoroughly

✅ **Why:** Helpers are reused across many prompts  
✅ **Coverage:** Aim for >90% coverage on helper functions  
✅ **Focus:** Edge cases, type safety, error handling

### 2. Mock LLM Responses

```typescript
// Mock the LLM for consistent testing
const mockRuntime = {
  useModel: vi.fn().mockResolvedValue(JSON.stringify({
    fromToken: "USDC",
    toToken: "ETH",
    amount: "100",
  })),
};
```

### 3. Use Test Fixtures

```typescript
// __tests__/fixtures/wallet-assets.ts
export const mockWalletAssets = [
  { token: ETH_NULL_ADDR, symbol: "ETH", amount: 1000000000000000000n, value: 2000000000n },
  { token: "0xA0b86...", symbol: "USDC", amount: 1000000000n, value: 1000000000n },
];

// In test
import { mockWalletAssets } from "../fixtures/wallet-assets";

it("should format assets", () => {
  const formatted = formatWalletAssetsForPrompt(mockWalletAssets);
  expect(formatted).toContain("ETH");
});
```

### 4. Test Output Format Compliance

```typescript
it("should return valid JSON structure", async () => {
  const response = await extractParameters(message);
  const parsed = JSON.parse(response);

  expect(parsed).toHaveProperty("amount");
  expect(parsed).toHaveProperty("confidence");
  expect(parsed).toHaveProperty("thought");
  
  expect(typeof parsed.amount).toBe("string");
  expect(typeof parsed.confidence).toBe("number");
  expect(parsed.confidence).toBeGreaterThanOrEqual(0);
  expect(parsed.confidence).toBeLessThanOrEqual(1);
});
```

### 5. Document Test Intent

```typescript
describe("Edge Case: User specifies percentage but token balance is zero", () => {
  it("should return zero amount with low confidence", async () => {
    // Arrange: User wants 50% of token they don't have
    const message = "Deposit 50% of my SHIB";
    const portfolio = []; // No SHIB
    
    // Act
    const result = await extractDepositParams({ message, portfolio });
    
    // Assert
    expect(result.amount).toBe("0");
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.thought).toContain("no balance");
  });
});
```

---

## Test Coverage Goals

### Helper Functions
- **Target:** 90%+ coverage
- **Focus:** Edge cases, type safety, error handling

### Prompt Functions
- **Target:** 80%+ coverage
- **Focus:** Section inclusion, context handling

### Integration Tests
- **Target:** Key user flows covered
- **Focus:** End-to-end parameter extraction and suggestion generation

---

## Running Tests

```bash
# Run all tests
bun run test

# Run specific test file
bun run test __tests__/prompts/helpers/amount-suggestions.test.ts

# Run with coverage
bun run test --coverage

# Watch mode
bun run test --watch
```

---

## Related Documents

- [Prompt Design Guidelines](./prompt-design-guidelines.md) - Prompt structure
- [Prompt Standards](./prompt-standards.md) - Technical standards
- [Helper Functions API](../src/prompts/helpers/README.md) - Helper reference

**Questions?** See existing tests in `__tests__/` for more examples.
