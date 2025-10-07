# Prompt Design Guidelines

**Version:** 1.0.0  
**Last Updated:** 2025-01-XX  
**Audience:** Developers creating or modifying LLM prompts

---

## 📚 Table of Contents

1. [Introduction](#introduction)
2. [When to Create a New Prompt](#when-to-create-a-new-prompt)
3. [Prompt Types](#prompt-types)
4. [Structure Guidelines](#structure-guidelines)
5. [Using Helper Functions](#using-helper-functions)
6. [Best Practices](#best-practices)
7. [Common Patterns](#common-patterns)
8. [Examples](#examples)
9. [Anti-Patterns](#anti-patterns)

---

## Introduction

This guide provides standards and best practices for designing LLM prompts in the ElizaOS Levva Agent project. Following these guidelines ensures consistency, maintainability, and optimal LLM performance.

---

## When to Create a New Prompt

### ✅ Create a New Prompt When:

1. **New Action/Intent** - Adding a new user action or intent type
2. **Different Context** - Existing prompts don't have the right context
3. **Distinct Purpose** - The goal is fundamentally different from existing prompts
4. **Parameter Extraction** - Need to extract specific data from user messages

### ❌ Don't Create a New Prompt When:

1. **Minor Variations** - Can use parameters or conditions in existing prompt
2. **Duplicate Logic** - Same pattern as existing prompt with different wording
3. **Simple Formatting** - Can use helper functions instead
4. **Temporary Testing** - Use prompt variations in tests instead

---

## Prompt Types

### 1. **Parameter Extraction Prompts**

**Purpose:** Extract structured data from user messages

**Location:** `src/prompts/[action-name].ts`

**Pattern:**
```typescript
export interface ExtractedDataFor[Action] {
  param1?: string;
  param2?: number;
  confidence: number;
  thought: string;
}

export const extract[Action]DataFromMessagePrompt = (ctx: Context) => {
  return `<task>Extract parameters...</task>
<message>${ctx.message}</message>
<context>...</context>
<instructions>...</instructions>
<keys>...</keys>
<output>JSON format...</output>`;
};
```

**When to Use:**
- User message needs parsing
- Multiple parameters to extract
- Confidence scoring required
- Context-aware extraction needed

---

### 2. **Intent-Aware Suggestions**

**Purpose:** Progressive disclosure suggestions for active intents

**Location:** `src/prompts/suggest/[intent-name]-intent.ts`

**Pattern:** Use helper functions from `src/prompts/helpers/`

**When to Use:**
- Active intent exists
- Multi-step process (deposit, withdraw, swap)
- Need to guide user through parameters
- State-dependent suggestions

---

### 3. **Action-Based Suggestions**

**Purpose:** Help initiate new intents or actions

**Location:** `src/prompts/suggest/[suggestion-type].ts`

**Pattern:**
```typescript
export const [suggestionType]Prompt = (ctx: Context) => {
  return `<task>Generate suggestions...</task>
<decision>${ctx.decision}</decision>
<conversation>${ctx.conversation}</conversation>
<portfolio>...</portfolio>
<instructions>...</instructions>
<output>JSON suggestions...</output>`;
};
```

**When to Use:**
- No active intent
- Helping user discover actions
- Portfolio-based suggestions
- Market opportunity suggestions

---

### 4. **Utility Prompts**

**Purpose:** General-purpose prompt utilities

**Location:** `src/prompts/[util-name].ts`

**Examples:**
- `default.ts` - Fallback suggestions
- `rephrase.ts` - Response transformation
- `browser-summary.ts` - Content summarization

**When to Use:**
- Cross-cutting concerns
- Generic transformations
- Fallback behaviors

---

## Structure Guidelines

### Required Sections (in order)

#### 1. `<task>`
- **Purpose:** Single, clear sentence describing the goal
- **Length:** 1-2 sentences max
- **Example:** `<task>Extract deposit parameters from user message for investment transaction processing.</task>`

#### 2. `<message>` or Current Input
- **Purpose:** The user's current message or input
- **Format:** Plain text, no extra formatting
- **Example:** `<message>${currentMessage}</message>`

#### 3. Context Sections
- **Purpose:** Provide domain-specific data for LLM
- **Names:** Descriptive (`<portfolio>`, `<strategies>`, `<availableTokens>`)
- **Order:** Most important first
- **Example:**
  ```xml
  <userPortfolio>
  ${portfolioData}
  </userPortfolio>
  <availableStrategies>
  ${strategiesData}
  </availableStrategies>
  ```

#### 4. `<instructions>`
- **Purpose:** Detailed rules and logic for LLM
- **Format:** Markdown with clear headers and bullet points
- **Include:**
  - Critical business logic
  - Edge case handling
  - Format specifications
  - Priority/ordering rules

#### 5. `<keys>` (For Extraction Prompts)
- **Purpose:** Describe output parameters with types
- **Format:** Markdown list with types and descriptions
- **Example:**
  ```
  - amount: string - Numeric amount as string (e.g., "100", "0.5")
  - confidence: number - Score from 0 to 1
  ```

#### 6. `<output>`
- **Purpose:** Specify exact JSON format expected
- **Format:** JSON example with placeholder values
- **Include:** Type hints and "nothing else" instruction
- **Example:**
  ```xml
  <output>
  {
    "amount": string | null,
    "confidence": number
  }
  
  Your response should include the valid JSON block and nothing else.
  </output>
  ```

---

## Using Helper Functions

### Intent Suggestion Helpers

```typescript
import { 
  generateIntentContextSection,
  buildProgressiveDisclosurePrompt 
} from "../prompts/helpers";

// Build intent context
const intentContext = generateIntentContextSection({
  intentType: "DEPOSIT",
  status: "awaiting_amount",
  userAddress: params.userAddress,
  chainId: params.chainId,
  parameters: { strategyId: 1, tokenSymbol: "USDC" }
});

// Build complete prompt
return buildProgressiveDisclosurePrompt({
  task: "Generate amount suggestions for deposit",
  intentContext,
  conversation: params.conversation,
  dataContext: portfolioSection,
  instructions: amountInstructions,
});
```

### Token Selection Helpers

```typescript
import { 
  formatWalletAssetsForPrompt,
  generateEthWethConversionNote 
} from "../prompts/helpers";

// Format assets for prompt
const portfolioSection = `<portfolio>
${formatWalletAssetsForPrompt(assets, {
  sortByValue: true,
  limit: 10
})}${generateEthWethConversionNote(assets)}
</portfolio>`;
```

### Amount Suggestion Helpers

```typescript
import { 
  generateAmountSuggestionsInstructions,
  NATIVE_TOKEN_PERCENTAGES 
} from "../prompts/helpers";

const instructions = `
Generate amount suggestions for ${tokenSymbol}.

${generateAmountSuggestionsInstructions({
  tokenSymbol,
  isNativeToken: tokenSymbol === "ETH"
})}

Use percentages: ${Object.values(NATIVE_TOKEN_PERCENTAGES).map(p => `${p*100}%`).join(", ")}
`;
```

---

## Best Practices

### 1. Be Specific and Clear

✅ **Good:**
```
Extract the amount to withdraw. Return as string (e.g., "100", "0.5").
If user says "all", return "all". Strip currency symbols.
```

❌ **Bad:**
```
Get the amount.
```

### 2. Provide Examples

✅ **Good:**
```
Amount Format Examples:
- User: "withdraw 50 USDC" → amount: "50"
- User: "take out everything" → amount: "all"
- User: "half my balance" → compute 50% → amount: "25.5"
```

❌ **Bad:**
```
Parse the amount from the message.
```

### 3. Use Progressive Instructions

✅ **Good:**
```
**STEP 1:** Check if strategy is specified
**STEP 2:** If yes, check if token is specified
**STEP 3:** If yes, check if amount is specified
```

❌ **Bad:**
```
Extract strategy, token, and amount if they exist.
```

### 4. Include Edge Cases

✅ **Good:**
```
**EDGE CASES:**
- If amount > balance: set confidence to 0.3
- If token not in portfolio: suggest alternatives
- If strategy doesn't support token: return error in thought
```

❌ **Bad:**
```
Extract the parameters.
```

### 5. Use Consistent Terminology

✅ **Good:**
```
- Use "strategyId" everywhere
- Use "tokenSymbol" not "token symbol" or "token_symbol"
- Use "amount" not "value" or "quantity"
```

❌ **Bad:**
```
Mixed terminology across sections
```

---

## Common Patterns

### Pattern 1: Progressive Disclosure

**Use When:** Multi-step process with dependencies

**Example:**
```
1. No parameters → Suggest options
2. Partial parameters → Suggest next required
3. Complete parameters → Suggest confirmation
4. Always include cancellation option
```

### Pattern 2: Context-Aware Extraction

**Use When:** Parameters depend on conversation history

**Structure:**
```xml
<message>${current}</message>
<conversationHistory>${history}</conversationHistory>
<inheritedData>${inherited}</inheritedData>
<returnData>${previous}</returnData>
<instructions>
1. Check returnData for existing values
2. Use conversationHistory for context
3. Fill gaps from current message
4. Return updated parameters
</instructions>
```

### Pattern 3: Portfolio-Based Suggestions

**Use When:** Suggestions depend on user's holdings

**Structure:**
```xml
<portfolio>${formatWalletAssets()}</portfolio>
<availableTokens>${tokenList}</availableTokens>
<instructions>
**PRIORITIZATION:**
1. Tokens with highest balance first
2. Include ETH/WETH conversion if relevant
3. Popular pairs (ETH/USDC, ETH/USDT)
4. Other available tokens
</instructions>
```

---

## Examples

### Example 1: Simple Extraction Prompt

```typescript
export const extractSimpleDataPrompt = (ctx: {
  message: string;
  availableOptions: string[];
}) => {
  return `<task>
Extract user's selection from the available options.
</task>
<message>
${ctx.message}
</message>
<availableOptions>
${ctx.availableOptions.join(", ")}
</availableOptions>
<instructions>
Match the user's message against available options.
Use fuzzy matching (case-insensitive, partial matches OK).
Return the matched option or null if no match.
</instructions>
<output>
{
  "selectedOption": string | null,
  "confidence": number
}
</output>`;
};
```

### Example 2: Intent-Aware Suggestion Prompt

```typescript
export const generateStepSuggestionsPrompt = (params: {
  intentContext: IntentContext;
  conversation: string;
  currentStep: string;
}) => {
  const context = generateIntentContextSection({
    intentType: params.intentContext.type,
    status: params.currentStep,
    userAddress: params.intentContext.metadata.userAddress,
    chainId: params.intentContext.metadata.chainId,
    parameters: params.intentContext.returnData,
  });

  return buildProgressiveDisclosurePrompt({
    task: `Generate suggestions for ${params.currentStep}`,
    intentContext: context,
    conversation: params.conversation,
    instructions: `Generate 3-5 suggestions to help user complete this step.
Include clear, actionable options.
Always include a way to cancel or go back.`,
  });
};
```

---

## Anti-Patterns

### ❌ Don't: Use Vague Instructions

```
Extract what the user wants.
```

**Why:** LLM doesn't know what parameters to look for

### ❌ Don't: Overload Single Prompt

```
Extract all parameters, generate suggestions, validate data, and format output.
```

**Why:** Split into multiple prompts for clarity

### ❌ Don't: Hardcode Values

```
If amount > 1000, flag as high value.
```

**Why:** Use parameters or constants instead

### ❌ Don't: Ignore Context

```
<message>${message}</message>
<instructions>Extract amount</instructions>
```

**Why:** Missing portfolio, history, available options

### ❌ Don't: Inconsistent Format

```
Some sections use <xml>
Other sections use **markdown**
Output expects {json}
```

**Why:** LLM performs better with consistent structure

---

## Checklist for New Prompts

Before submitting a new prompt, verify:

- [ ] Clear `<task>` section (1-2 sentences)
- [ ] Current input included (`<message>` or equivalent)
- [ ] All necessary context sections present
- [ ] Instructions are specific with examples
- [ ] Edge cases documented
- [ ] Output format clearly specified
- [ ] TypeScript interface matches output
- [ ] Follows naming conventions
- [ ] Uses helper functions where applicable
- [ ] Includes version header comment
- [ ] No hardcoded values (use constants)
- [ ] Tested with sample inputs

---

## Version History

### 1.0.0 (2025-01-XX)
- Initial guidelines established
- Helper function integration documented
- Examples and anti-patterns added

---

**Related Documents:**
- [Prompt Standards](./prompt-standards.md) - Technical standards
- [Prompt Testing Guide](./prompt-testing-guide.md) - Testing patterns
- [Helper Functions](../src/prompts/helpers/README.md) - API reference

**Questions?** Refer to existing prompts in `src/prompts/` for real examples.
