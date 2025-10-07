# Prompt Standardization Guidelines

**Version:** 1.0.0  
**Last Updated:** 2025-01-XX  
**Status:** Active

---

## 1. Amount Field Standard

### Rule: All amount fields must be `string` type

**✅ Correct:**
```typescript
amount?: string;  // "100", "0.5", "all"
```

**❌ Incorrect:**
```typescript
amount?: number | "all";  // Mixed types
amount?: `${number}`;      // Template literal
```

### Format Specifications

#### For Numeric Amounts
- **Type:** `string`
- **Format:** Decimal number as string (e.g., "100", "0.5", "1.23456")
- **Regex:** `^[0-9]+(\.[0-9]+)?$`
- **Examples:** "100", "0.5", "1000.123"

#### For Percentage-Based Amounts
- **Conversion Required:** Yes, prompt must compute absolute value
- **Input:** "50%", "all", "max"
- **Output:** Numeric string (e.g., "50.5" not "50%")

#### Special Keywords
- **"all"**: Full balance withdrawal/transfer
- Must match regex: `^([0-9]+(\.[0-9]+)?|all)$`

### Rationale
- **Consistency:** Single type across all actions
- **Precision:** Avoids floating-point errors
- **Validation:** Easier regex validation
- **JSON Compatibility:** Direct serialization

### Implementation Checklist
- [x] deposit.ts - Uses `string` ✅
- [x] withdraw.ts - Changed from `number | "all"` to `string` ✅
- [x] swap.ts - Uses `string | null` (acceptable)
- [x] send.ts - Uses `string` ✅
- [x] strategy.ts - Changed from `` `${number}` `` to `string` ✅

---

## 2. Token Identification Standard

### Rule: Use `tokenSymbol` + optional `tokenAddress` for validation

**✅ Correct Pattern:**
```typescript
interface TokenIdentification {
  tokenSymbol: string;        // Required: "USDC", "ETH", "WETH"
  tokenAddress?: `0x${string}`; // Optional: For validation
}
```

**❌ Incorrect Patterns:**
```typescript
token?: string;  // Ambiguous - symbol or address?
tokenIn: string; // Symbol OR address mixed (inconsistent)
```

### Token Field Standards by Action

#### Deposit Action
```typescript
tokenSymbol?: string;        // Required for POOL, optional for VAULT
tokenAddress?: string;       // Optional validation
```
- **VAULT strategies**: Token auto-determined by vault's underlyingToken
- **POOL strategies**: User selects token from available options

#### Withdraw Action
- No token fields needed (determined by strategy)

#### Swap Action  
```typescript
fromTokenSymbol?: string;
fromTokenAddress?: string;
toTokenSymbol?: string;
toTokenAddress?: string;
```

#### Send/Transfer Action
```typescript
tokenSymbol?: string;
tokenAddress?: `0x${string}`;
```

### ETH/WETH Handling

**Standard Aliases:**
- "ETH" → Native token (0x0000...0000)
- "WETH" → Wrapped ETH (chain-specific address)
- Both interchangeable through wrapping (1:1 ratio)

**In Prompts:**
```
NOTE: User has ETH available. ETH can be wrapped to WETH (1:1 ratio) for DeFi strategies that require WETH.
```

### Address Format Validation
- **Type:** `` `0x${string}` ``
- **Format:** Lowercase hex address (EIP-55 optional)
- **Length:** 42 characters (0x + 40 hex digits)
- **Validation:** Use `isHex()` and `getAddress()` from viem

### Rationale
- **Clarity:** Clear separation between display name and validation
- **Flexibility:** Works with both user-friendly symbols and precise addresses
- **Safety:** Address validation catches errors early
- **Consistency:** Same pattern across all actions

---

## 3. Strategy Identification Standard

### Rule: Prioritize `strategyId`, support alternatives for fuzzy matching

**✅ Primary Method:**
```typescript
strategyId?: number;  // 1, 2, 3, etc.
```

**✅ Alternative Methods (for fuzzy matching):**
```typescript
strategyName?: string;  // "Ultra-Safe Strategy"
strategyRisk?: "ultra-safe" | "safe" | "brave" | "custom";
```

### Matching Priority
1. **strategyId** - Exact match (highest priority)
2. **strategyName** - Case-insensitive fuzzy match
3. **strategyRisk** - Risk profile filter
4. **contract** - Vault/pool address (lowest priority)

### Rationale
- **Primary Key:** strategyId is database primary key
- **User Friendly:** Names and risk levels are easier to remember
- **Robust:** Multiple identification methods increase success rate

---

## 4. Conversation Context Standard

### Rule: Use `Memory[]` array, convert to string when needed

**✅ Correct:**
```typescript
messages?: Memory[];  // ElizaOS Memory type
```

**Helper for String Conversion:**
```typescript
const conversationStr = messages
  .map(m => m.content?.text || "")
  .join("\n");
```

### Rationale
- **Type Safety:** Strong typing with ElizaOS types
- **Consistency:** Same format across all prompts
- **Flexibility:** Easy to filter, slice, or process
- **Metadata:** Preserves full message metadata

---

## 5. Confidence Scoring Standard

### Rule: Consistent confidence ranges across all extraction prompts

**Standard Ranges:**
```
High (0.8-1.0):     All required parameters clearly specified
Medium (0.5-0.7):   Some parameters clear, others inferrable from context
Low (0.2-0.4):      Limited information, requires user clarification
Very Low (0.0-0.1): Insufficient information to proceed
```

### Usage in Prompts
```typescript
confidence: {
  type: "number",
  description: "Confidence score from 0 to 1 based on parameter clarity (0.8-1.0: high, 0.5-0.7: medium, 0.2-0.4: low, 0.0-0.1: very low)",
}
```

### Rationale
- **Consistency:** Same interpretation across all actions
- **Decision Making:** Helps determine when to ask for clarification
- **Metrics:** Trackable for prompt performance monitoring

---

## 6. Prompt Structure Standard

### Required Sections (in order)

1. **`<task>`** - Clear, single-sentence purpose
2. **`<message>`** - Current user message
3. **Context Sections** - Domain-specific data (strategies, portfolio, etc.)
4. **`<instructions>`** - Detailed extraction/generation rules
5. **`<keys>`** - Parameter descriptions with types
6. **`<output>`** - JSON format specification

### Example Structure
```xml
<task>
Extract deposit parameters from user message.
</task>
<message>
${currentMessage}
</message>
<userPortfolio>
${portfolioData}
</userPortfolio>
<instructions>
Detailed rules for parameter extraction...
</instructions>
<keys>
- strategyId: number - The strategy ID
- amount: string - Numeric amount as string
</keys>
<output>
{
  "strategyId": number | null,
  "amount": string | null
}
</output>
```

### Rationale
- **Consistency:** LLM can learn the pattern once
- **Clarity:** Each section has clear purpose
- **Maintainability:** Easy to update specific sections
- **Debugging:** Clear separation aids troubleshooting

---

## 7. Version Tracking Standard

### Rule: Add version header to all prompts

**Format:**
```typescript
/**
 * [Prompt Purpose]
 * 
 * @version 1.0.0
 * @lastModified 2025-01-XX
 * @changes Initial standardization - amount fields to string type
 */
```

### Version Numbering
- **Major (X.0.0):** Breaking changes to prompt structure or output format
- **Minor (x.X.0):** New features, additional context sections
- **Patch (x.x.X):** Bug fixes, clarifications, typo corrections

---

## 8. Testing Standards

### Unit Test Requirements
- **Input Variations:** Test with different phrasings
- **Edge Cases:** Empty strings, special characters, boundary values
- **Context Combinations:** With/without conversation history
- **Confidence Validation:** Verify confidence scores are appropriate

### Integration Test Requirements
- **End-to-End Flow:** Full action execution
- **Error Handling:** Invalid inputs, missing context
- **Type Safety:** Verify output matches interface
- **Performance:** Response time benchmarks

---

## Changelog

### Version 1.0.0 (2025-01-XX)
- **Phase 1 Completed:** Amount field standardization
- **Phase 1 Completed:** Token identification consolidation
- Initial documentation of standards
- Established testing requirements

---

## Migration Notes

### From Old Standards

#### Amount Fields
```typescript
// OLD (deprecated)
amount?: number | "all";
amount?: `${number}`;

// NEW (standard)
amount?: string;  // "100", "0.5", "all"
```

#### Token Fields
```typescript
// OLD (deprecated)
token?: string;  // Ambiguous

// NEW (standard)
tokenSymbol?: string;
tokenAddress?: string;
```

### Breaking Changes
None yet - this is the initial standard version.

---

## Future Considerations

### Planned Improvements
- [ ] Helper functions for common patterns (token selection, amount suggestions)
- [ ] Base templates for intent-aware suggestions
- [ ] Automated prompt testing framework
- [ ] Performance monitoring and A/B testing support

### Open Questions
- Should we support ENS names for token/address resolution?
- How to handle multi-chain token identification?
- Strategy for internationalization/localization?

---

**Last Review:** 2025-01-XX  
**Next Review:** Q2 2025  
**Owner:** Development Team  
**Status:** ✅ Active
