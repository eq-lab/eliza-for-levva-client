# Suggestion System Refactoring Plan: Intent-Aware Architecture

## Executive Summary

This document outlines a comprehensive refactoring plan to make the suggestion system fully intent-aware, eliminating duplicate logic and aligning suggestions with the intent-based action flow.

---

## 1. Current Suggestion Types Enumeration

### Action: `wallet.ts` (ANALYZE_WALLET)
- ✅ **portfolio-optimization**: General portfolio optimization suggestions
- ✅ **investment-opportunities**: Specific investment action suggestions

### Action: `swap.ts` (SWAP_TOKENS)
- ⚠️ **exchange-amount**: Amount suggestions for swaps (PARTIALLY intent-aware)
- ✅ **exchange-pairs**: Token pair suggestions for swaps

### Action: `strategy.ts` (CHOOSE_STRATEGY)
- ❌ **strategy-risk-profile**: Risk profile selection (NO intent awareness)
- ❌ **strategy-pool**: Pool/contract display (NO intent awareness)
- ❌ **strategy-asset**: Asset selection for deposit (NO intent awareness)

### Action: `position.ts` (MANAGE_POSITIONS)
- ❌ **position-management**: Position management including deposits (NO intent awareness)
- ❌ **position-diversification**: Diversification via deposits (NO intent awareness)
- ❌ **withdrawal-status-check**: Withdrawal request status (NO intent awareness)
- ❌ **withdrawal-guidance**: Generic withdrawal guidance (NO intent awareness)
- ❌ **withdrawal-position-selection**: Position selection for withdrawal (NO intent awareness)
- ❌ **withdrawal-amount-suggestions**: Amount suggestions for withdrawal (NO intent awareness)

---

## 2. Intent Types and Domains Mapping

### Intent Types (from `INTENT_TYPE` enum):
```typescript
enum INTENT_TYPE {
  WITHDRAW = "WITHDRAW",
  DEPOSIT = "DEPOSIT", 
  SWAP = "SWAP",
  SEND = "SEND",
}
```

### Intent-to-Action Domain Mapping:

| Intent Type | Domain (Action) | Handler File | Status |
|-------------|-----------------|--------------|--------|
| `WITHDRAW` | `MANAGE_POSITIONS` | `intents/withdraw.ts` | ✅ Implemented |
| `DEPOSIT` | `MANAGE_POSITIONS` | `intents/deposit.ts` | ✅ Implemented |
| `SWAP` | `SWAP_TOKENS` | `intents/swap.ts` | ✅ Implemented |
| `SEND` | `ANALYZE_WALLET` | `intents/send.ts` | ✅ Implemented |

---

## 3. Suggestion-to-Intent Mapping

### Table: Which Suggestions Correspond to Intents?

| Suggestion Name | Action | Intent Type | Domain | Intent-Aware? | Notes |
|-----------------|--------|-------------|--------|---------------|-------|
| **exchange-amount** | `swap.ts` | `SWAP` | `SWAP_TOKENS` | ⚠️ **Partial** | Has intent awareness but should be improved |
| **exchange-pairs** | `swap.ts` | `SWAP` | `SWAP_TOKENS` | ❌ **No** | Should be intent-aware |
| **withdrawal-status-check** | `position.ts` | `WITHDRAW` | `MANAGE_POSITIONS` | ❌ **No** | Should check active withdraw intent |
| **withdrawal-guidance** | `position.ts` | `WITHDRAW` | `MANAGE_POSITIONS` | ❌ **No** | Should be replaced with intent-aware logic |
| **withdrawal-position-selection** | `position.ts` | `WITHDRAW` | `MANAGE_POSITIONS` | ❌ **No** | Should use intent context |
| **withdrawal-amount-suggestions** | `position.ts` | `WITHDRAW` | `MANAGE_POSITIONS` | ❌ **No** | Should use intent returnData |
| **position-management** | `position.ts` | `DEPOSIT` | `MANAGE_POSITIONS` | ❌ **No** | Overlaps with deposit intent |
| **position-diversification** | `position.ts` | `DEPOSIT` | `MANAGE_POSITIONS` | ❌ **No** | Overlaps with deposit intent |
| **strategy-risk-profile** | `strategy.ts` | `DEPOSIT` (child) | `CHOOSE_STRATEGY` | ❌ **No** | Should be called from deposit intent |
| **strategy-pool** | `strategy.ts` | `DEPOSIT` (child) | `CHOOSE_STRATEGY` | ❌ **No** | Should be called from deposit intent |
| **strategy-asset** | `strategy.ts` | `DEPOSIT` (child) | `CHOOSE_STRATEGY` | ❌ **No** | Should be called from deposit intent |
| **portfolio-optimization** | `wallet.ts` | `N/A` | `ANALYZE_WALLET` | ✅ **N/A** | General suggestion, no intent |
| **investment-opportunities** | `wallet.ts` | `N/A` | `ANALYZE_WALLET` | ✅ **N/A** | General suggestion, no intent |

---

## 4. Suggestions with No Corresponding Intent

These suggestions are **general** and should remain action-based (not intent-aware):

### ✅ Valid Non-Intent Suggestions:
1. **portfolio-optimization** (`wallet.ts`)
   - **Purpose**: General portfolio analysis and optimization
   - **Trigger**: After wallet analysis
   - **Action**: Provide high-level portfolio improvements
   - **Keep As-Is**: ✅ Yes

2. **investment-opportunities** (`wallet.ts`)
   - **Purpose**: Highlight specific investment actions
   - **Trigger**: After wallet analysis
   - **Action**: Suggest concrete investment steps
   - **Keep As-Is**: ✅ Yes

### ❌ Invalid Non-Intent Suggestions (Should Be Refactored):
None identified. All other suggestions map to intent flows.

---

## 5. Refactoring Strategy

### Phase 1: Intent-Aware Suggestion Infrastructure ✅

**Goal**: Update suggestion system to check for active intents first

**Implementation**:
```typescript
// In evaluators/suggestions.ts
if (activeIntent) {
  logger.info("Generating intent-aware suggestions", {
    intentType: activeIntent.type,
    domain: activeIntent.domain,
    returnData: activeIntent.returnData,
  });

  result = await generateIntentAwareSuggestions(
    runtime,
    activeIntent,
    conversation
  );
}
```

**Status**: ✅ **Already implemented** in `src/evaluators/suggestions.ts:176-189`

---

### Phase 2: Withdraw Intent Suggestions (HIGH PRIORITY)

**Current Problems**:
- 4 separate withdrawal suggestions in `position.ts`
- No awareness of active `WITHDRAW` intent
- Duplicate logic with `intents/withdraw.ts`

**Refactoring Plan**:

#### Step 1: Create Intent-Aware Withdrawal Suggestions
**File**: `src/prompts/suggest/withdraw-intent.ts`

```typescript
import { IntentContext } from "../../services/intent-manager";
import { INTENT_TYPE } from "../../constants/enum";

export interface WithdrawIntentSuggestionParams {
  intentContext: IntentContext;
  positions: UserPosition[];
  withdrawalRequests: WithdrawalRequest[];
  conversation: string;
  returnData: Record<string, any>;
}

export const generateWithdrawIntentSuggestions = (
  params: WithdrawIntentSuggestionParams
): string => {
  const { intentContext, positions, withdrawalRequests, returnData } = params;

  // Determine what's missing based on returnData
  const hasStrategyId = returnData.strategyId !== undefined;
  const hasAmount = returnData.amount !== undefined;

  if (!hasStrategyId) {
    // Generate position selection suggestions
    return generatePositionSelectionPrompt({
      positions,
      conversation: params.conversation,
    });
  }

  if (!hasAmount) {
    // Generate amount suggestions based on selected position
    const selectedPosition = positions.find(
      (p) => p.strategyId === returnData.strategyId
    );
    return generateAmountSuggestionsPrompt({
      position: selectedPosition,
      conversation: params.conversation,
    });
  }

  // If all parameters present, suggest confirmation or modification
  return generateWithdrawConfirmationPrompt({
    strategyId: returnData.strategyId,
    amount: returnData.amount,
    conversation: params.conversation,
  });
};
```

#### Step 2: Update `position.ts` Suggestions
**File**: `src/actions/position.ts`

**Remove**:
- ❌ `withdrawal-status-check` (move to intent-aware)
- ❌ `withdrawal-guidance` (move to intent-aware)
- ❌ `withdrawal-position-selection` (move to intent-aware)
- ❌ `withdrawal-amount-suggestions` (move to intent-aware)

**Keep**:
- ✅ `position-management` (but refactor to remove deposit logic)
- ✅ `position-diversification` (but refactor to remove deposit logic)

#### Step 3: Integrate with Intent Manager
**File**: `src/evaluators/suggestions.ts`

Update `generateIntentAwareSuggestions` to handle `WITHDRAW`:

```typescript
case INTENT_TYPE.WITHDRAW:
  const withdrawParams = await getWithdrawIntentParams(runtime, activeIntent);
  return generateWithdrawIntentSuggestions({
    intentContext: activeIntent,
    ...withdrawParams,
  });
```

---

### Phase 3: Deposit Intent Suggestions (HIGH PRIORITY)

**Current Problems**:
- `position-management` and `position-diversification` include deposit logic
- `strategy-*` suggestions are not tied to deposit intent
- No awareness of active `DEPOSIT` intent

**Refactoring Plan**:

#### Step 1: Create Intent-Aware Deposit Suggestions
**File**: `src/prompts/suggest/deposit-intent.ts`

```typescript
export const generateDepositIntentSuggestions = (
  params: DepositIntentSuggestionParams
): string => {
  const { intentContext, strategies, portfolio, returnData } = params;

  // Determine what's missing
  const hasStrategyId = returnData.strategyId !== undefined;
  const hasToken = returnData.token !== undefined;
  const hasAmount = returnData.amount !== undefined;

  if (!hasStrategyId) {
    // Suggest strategies based on risk profile and portfolio
    return generateStrategySelectionPrompt({
      strategies,
      portfolio,
      conversation: params.conversation,
    });
  }

  if (!hasToken) {
    // Suggest tokens compatible with selected strategy
    const selectedStrategy = strategies.find(
      (s) => s.id === returnData.strategyId
    );
    return generateTokenSelectionPrompt({
      strategy: selectedStrategy,
      portfolio,
      conversation: params.conversation,
    });
  }

  if (!hasAmount) {
    // Suggest percentage-based amounts (100%, 50%, 25%, 10%)
    return generateAmountSuggestionsPrompt({
      token: returnData.token,
      portfolio,
      conversation: params.conversation,
    });
  }

  // All params present - suggest confirmation
  return generateDepositConfirmationPrompt({
    strategyId: returnData.strategyId,
    token: returnData.token,
    amount: returnData.amount,
    conversation: params.conversation,
  });
};
```

#### Step 2: Refactor `strategy.ts` Suggestions
**File**: `src/actions/strategy.ts`

**Update** all three suggestions to be intent-aware:
- ⚠️ `strategy-risk-profile` → Check for active `DEPOSIT` intent
- ⚠️ `strategy-pool` → Check for active `DEPOSIT` intent
- ⚠️ `strategy-asset` → Check for active `DEPOSIT` intent

**OR** consider **removing** these suggestions entirely and relying on deposit intent flow.

#### Step 3: Refactor `position.ts` Deposit Logic
**File**: `src/actions/position.ts`

**Update**:
- ⚠️ `position-management` → Remove deposit suggestions, focus on management
- ⚠️ `position-diversification` → Remove deposit suggestions, focus on diversification analysis

---

### Phase 4: Swap Intent Suggestions (MEDIUM PRIORITY)

**Current State**:
- `exchange-amount` is **partially** intent-aware
- `exchange-pairs` is **not** intent-aware

**Refactoring Plan**:

#### Step 1: Enhance Existing Intent Awareness
**File**: `src/actions/swap.ts`

Update `exchange-amount`:
```typescript
{
  name: "exchange-amount",
  description: "Suggest swap amounts based on active SWAP intent context",
  getPrompt: async (runtime, { address, chainId, conversation }, message?) => {
    // ✅ Already has intent awareness - enhance it
    const intentContext = await getActiveSwapIntent(runtime, message);
    
    if (!intentContext) {
      // No active intent - provide general swap amount suggestions
      return generateGeneralSwapAmountPrompt({...});
    }

    // Active SWAP intent - provide context-aware suggestions
    const { tokenFrom, tokenTo } = intentContext.returnData;
    
    if (!tokenFrom) {
      return generateTokenFromSuggestionsPrompt({...});
    }
    
    if (!tokenTo) {
      return generateTokenToSuggestionsPrompt({...});
    }
    
    // Both tokens known - suggest amounts
    return generateSwapAmountSuggestionsPrompt({
      tokenFrom,
      tokenTo,
      portfolio,
      conversation,
    });
  },
}
```

Update `exchange-pairs`:
```typescript
{
  name: "exchange-pairs",
  description: "Suggest token pairs for swap based on portfolio and active intent",
  getPrompt: async (runtime, params, message?) => {
    // ✅ Add intent awareness
    const intentContext = await getActiveSwapIntent(runtime, message);
    
    if (intentContext?.returnData?.tokenFrom) {
      // TokenFrom known - suggest compatible tokenTo options
      return generateTokenToOptionsPrompt({
        tokenFrom: intentContext.returnData.tokenFrom,
        portfolio,
        availableTokens,
      });
    }
    
    // No active intent or no tokenFrom - suggest popular pairs
    return generatePopularPairsPrompt({portfolio, availableTokens});
  },
}
```

---

### Phase 5: Send Intent Suggestions (LOW PRIORITY)

**Current State**:
- No suggestions currently exist for `SEND` intent
- `SEND` intent is registered in `wallet.ts`

**Refactoring Plan**:

#### Consider Adding Send-Specific Suggestions:
1. **send-recipient-suggestions**: Suggest recent recipients or saved addresses
2. **send-amount-suggestions**: Percentage-based amount suggestions
3. **send-token-selection**: Token selection based on portfolio

**File**: `src/actions/wallet.ts`

```typescript
export const suggest: Suggestion[] = [
  // Existing suggestions
  { name: "portfolio-optimization", ... },
  { name: "investment-opportunities", ... },
  
  // New: Send intent suggestions
  {
    name: "send-amount",
    description: "Suggest amounts for active SEND intent",
    getPrompt: async (runtime, params, message?) => {
      const intentContext = await getActiveSendIntent(runtime, message);
      
      if (!intentContext) return ""; // No active intent
      
      const { token, recipient } = intentContext.returnData;
      
      if (!token) {
        return generateTokenSelectionPrompt({...});
      }
      
      if (!recipient) {
        return generateRecipientSuggestionsPrompt({...});
      }
      
      // Suggest amounts
      return generateSendAmountSuggestionsPrompt({
        token,
        portfolio,
        conversation: params.conversation,
      });
    },
  },
];
```

---

## 6. Implementation Checklist

### Phase 1: Infrastructure ✅
- [x] Intent-aware suggestion check in evaluator
- [x] `generateIntentAwareSuggestions` function
- [x] `getActiveIntentByDomain` in IntentManager

### Phase 2: Withdraw Intent 🚧
- [ ] Create `src/prompts/suggest/withdraw-intent.ts`
- [ ] Implement `generateWithdrawIntentSuggestions()`
- [ ] Update `evaluators/suggestions.ts` with WITHDRAW case
- [ ] Remove old withdrawal suggestions from `position.ts`
- [ ] Test withdrawal flow with intent-aware suggestions

### Phase 3: Deposit Intent 🚧
- [ ] Create `src/prompts/suggest/deposit-intent.ts`
- [ ] Implement `generateDepositIntentSuggestions()`
- [ ] Update `evaluators/suggestions.ts` with DEPOSIT case
- [ ] Refactor `strategy.ts` suggestions (make intent-aware or remove)
- [ ] Refactor `position.ts` to remove deposit logic
- [ ] Test deposit flow with intent-aware suggestions

### Phase 4: Swap Intent 🚧
- [ ] Enhance `exchange-amount` intent awareness
- [ ] Add intent awareness to `exchange-pairs`
- [ ] Create helper `getActiveSwapIntent()`
- [ ] Test swap flow with enhanced suggestions

### Phase 5: Send Intent 🚧
- [ ] Create send-specific suggestions in `wallet.ts`
- [ ] Implement `generateSendAmountSuggestions()`
- [ ] Test send flow with new suggestions

### Phase 6: Cleanup 🚧
- [ ] Remove deprecated suggestion files
- [ ] Update `.cursor/rules/suggestion-system.mdc`
- [ ] Document intent-aware suggestion patterns
- [ ] Add integration tests for each intent type

---

## 7. Benefits of Intent-Aware Suggestions

### ✅ Eliminates Duplication
- Single source of truth for each intent flow
- No duplicate logic between suggestions and intent handlers

### ✅ Context-Aware
- Suggestions based on actual intent state (`returnData`)
- Progressive disclosure: only ask for missing parameters

### ✅ Better UX
- User sees relevant suggestions at each step
- Reduces confusion from generic suggestions

### ✅ Maintainable
- Intent logic in one place (`intents/*.ts`)
- Suggestions derived from intent state
- Easier to debug and extend

### ✅ Scalable
- New intents automatically get suggestion support
- Pattern is reusable across all intent types

---

## 8. Example: Before vs After

### Before (Current State):
```
User: "I want to withdraw"
Agent: "Which position?"
Suggestions: [Generic portfolio options, unrelated deposit suggestions]
```

### After (Intent-Aware):
```
User: "I want to withdraw"
Agent: "Which position?"
Suggestions: [
  "Withdraw from Strategy #1 (Balance: $500)",
  "Withdraw from Strategy #3 (Balance: $1200)",
  "Check withdrawal status"
]
```

---

## 9. Migration Path

### Week 1: Withdraw Intent
- Implement Phase 2
- Test thoroughly
- Deploy to staging

### Week 2: Deposit Intent
- Implement Phase 3
- Test thoroughly
- Deploy to staging

### Week 3: Swap & Send
- Implement Phases 4 & 5
- Integration testing
- Deploy to production

### Week 4: Cleanup & Documentation
- Remove old code
- Update documentation
- Performance review

---

## 10. Success Metrics

### Quantitative:
- ✅ Reduce suggestion code duplication by 60%+
- ✅ Decrease "I don't understand" responses by 40%+
- ✅ Increase suggestion acceptance rate by 50%+

### Qualitative:
- ✅ Users receive contextually relevant suggestions
- ✅ Suggestions align with conversation state
- ✅ Intent flows feel natural and guided

---

## Conclusion

Making the suggestion system fully intent-aware will:
1. **Eliminate duplication** between suggestions and intent handlers
2. **Improve UX** with contextual, relevant suggestions
3. **Simplify maintenance** with a single source of truth
4. **Enable scalability** for future intent types

The refactoring is structured in phases to minimize risk and allow incremental validation of each improvement.


