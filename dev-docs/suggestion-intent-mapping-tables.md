# Suggestion-to-Intent Mapping Tables

## Quick Reference Tables for Suggestion System Refactoring

---

## Table 1: All Implemented Suggestion Types

| # | Suggestion Name | Action File | Intent Type | Status | Refactor Priority |
|---|-----------------|-------------|-------------|--------|-------------------|
| 1 | `portfolio-optimization` | `wallet.ts` | N/A | ✅ Keep as-is | - |
| 2 | `investment-opportunities` | `wallet.ts` | N/A | ✅ Keep as-is | - |
| 3 | `exchange-amount` | `swap.ts` | `SWAP` | ⚠️ Partial | 🟡 Medium |
| 4 | `exchange-pairs` | `swap.ts` | `SWAP` | ❌ Not aware | 🟡 Medium |
| 5 | `strategy-risk-profile` | `strategy.ts` | `DEPOSIT` | ❌ Not aware | 🔴 High |
| 6 | `strategy-pool` | `strategy.ts` | `DEPOSIT` | ❌ Not aware | 🔴 High |
| 7 | `strategy-asset` | `strategy.ts` | `DEPOSIT` | ❌ Not aware | 🔴 High |
| 8 | `position-management` | `position.ts` | `DEPOSIT` | ❌ Not aware | 🔴 High |
| 9 | `position-diversification` | `position.ts` | `DEPOSIT` | ❌ Not aware | 🔴 High |
| 10 | `withdrawal-status-check` | `position.ts` | `WITHDRAW` | ❌ Not aware | 🔴 High |
| 11 | `withdrawal-guidance` | `position.ts` | `WITHDRAW` | ❌ Not aware | 🔴 High |
| 12 | `withdrawal-position-selection` | `position.ts` | `WITHDRAW` | ❌ Not aware | 🔴 High |
| 13 | `withdrawal-amount-suggestions` | `position.ts` | `WITHDRAW` | ❌ Not aware | 🔴 High |

**Total**: 13 suggestion types
- **Keep as-is**: 2 (general suggestions)
- **Need refactoring**: 11 (intent-aware)
- **High priority**: 9
- **Medium priority**: 2

---

## Table 2: Intent Types and Their Suggestions

### WITHDRAW Intent (`MANAGE_POSITIONS` domain)

| Suggestion Name | Current File | Prompt File | Intent-Aware? | Action Needed |
|-----------------|--------------|-------------|---------------|---------------|
| `withdrawal-status-check` | `position.ts` | `withdrawal-status-check.ts` | ❌ No | 🔄 Refactor to intent-aware |
| `withdrawal-guidance` | `position.ts` | `withdrawal-guidance.ts` | ❌ No | 🗑️ Remove (too generic) |
| `withdrawal-position-selection` | `position.ts` | `withdrawal-position-selection.ts` | ❌ No | 🔄 Refactor to intent-aware |
| `withdrawal-amount-suggestions` | `position.ts` | `withdrawal-amount-suggestions.ts` | ❌ No | 🔄 Refactor to intent-aware |

**Intent Handler**: `src/actions/intents/withdraw.ts`

**Recommended Consolidation**:
- Create single `withdraw-intent.ts` prompt
- Use `intentContext.returnData` to determine state
- Provide contextual suggestions based on missing parameters

---

### DEPOSIT Intent (`MANAGE_POSITIONS` domain)

| Suggestion Name | Current File | Prompt File | Intent-Aware? | Action Needed |
|-----------------|--------------|-------------|---------------|---------------|
| `strategy-risk-profile` | `strategy.ts` | `strategy-risk-profile.ts` (prompt) | ❌ No | 🔄 Make intent-aware |
| `strategy-pool` | `strategy.ts` | `strategy-contract.ts` (prompt) | ❌ No | 🔄 Make intent-aware |
| `strategy-asset` | `strategy.ts` | `strategy-asset.ts` (prompt) | ❌ No | 🔄 Make intent-aware |
| `position-management` | `position.ts` | `position-management.ts` | ❌ No | ✂️ Remove deposit logic |
| `position-diversification` | `position.ts` | `position-diversification.ts` | ❌ No | ✂️ Remove deposit logic |

**Intent Handler**: `src/actions/intents/deposit.ts`

**Recommended Consolidation**:
- Create single `deposit-intent.ts` prompt
- Use `intentContext.returnData` to check for:
  - `strategyId` (strategy selection)
  - `token` (token selection)
  - `amount` (amount specification)
- Progressive suggestions based on what's missing

---

### SWAP Intent (`SWAP_TOKENS` domain)

| Suggestion Name | Current File | Prompt File | Intent-Aware? | Action Needed |
|-----------------|--------------|-------------|---------------|---------------|
| `exchange-amount` | `swap.ts` | `exchange-amount.ts` | ⚠️ Partial | ✨ Enhance intent awareness |
| `exchange-pairs` | `swap.ts` | `exchange-pairs.ts` | ❌ No | 🔄 Make intent-aware |

**Intent Handler**: `src/actions/intents/swap.ts`

**Current State**:
- `exchange-amount` already checks for intent context
- Needs enhancement to fully leverage `returnData`

**Recommended Enhancement**:
- Check `returnData.tokenFrom` and `returnData.tokenTo`
- Suggest missing token if not specified
- Suggest amounts only when both tokens known

---

### SEND Intent (`ANALYZE_WALLET` domain)

| Suggestion Name | Current File | Prompt File | Intent-Aware? | Action Needed |
|-----------------|--------------|-------------|---------------|---------------|
| _(none currently)_ | - | - | - | 💡 Consider adding |

**Intent Handler**: `src/actions/intents/send.ts`

**Recommended Addition** (Low Priority):
- `send-recipient`: Suggest recent/saved addresses
- `send-amount`: Percentage-based amount suggestions
- `send-token`: Token selection from portfolio

---

## Table 3: Actions and Their Intent Domains

| Action | Intent Domain | Intents Handled | Suggestion Count | Intent-Aware Count |
|--------|---------------|-----------------|------------------|--------------------|
| `ANALYZE_WALLET` | General | `SEND` | 2 | 0 (N/A - general) |
| `SWAP_TOKENS` | Swap | `SWAP` | 2 | 1 (partial) |
| `CHOOSE_STRATEGY` | Strategy Selection | _(child of DEPOSIT)_ | 3 | 0 |
| `MANAGE_POSITIONS` | Position Mgmt | `WITHDRAW`, `DEPOSIT` | 6 | 0 |

---

## Table 4: Suggestion Prompt Files Status

| Prompt File | Used By | Intent Type | Status | Refactor Action |
|-------------|---------|-------------|--------|-----------------|
| `deposit-opportunities.ts` | - | - | ⚠️ Unused? | 🔍 Investigate |
| `exchange-amount.ts` | `exchange-amount` | `SWAP` | ⚠️ Partial | ✨ Enhance |
| `exchange-pairs.ts` | `exchange-pairs` | `SWAP` | ❌ Not aware | 🔄 Refactor |
| `position-diversification.ts` | `position-diversification` | _(DEPOSIT overlap)_ | ❌ Not aware | ✂️ Split logic |
| `position-management.ts` | `position-management` | _(DEPOSIT overlap)_ | ❌ Not aware | ✂️ Split logic |
| `withdrawal-amount-suggestions.ts` | `withdrawal-amount-suggestions` | `WITHDRAW` | ❌ Not aware | 🔄 Refactor |
| `withdrawal-guidance.ts` | `withdrawal-guidance` | `WITHDRAW` | ❌ Not aware | 🗑️ Remove |
| `withdrawal-position-selection.ts` | `withdrawal-position-selection` | `WITHDRAW` | ❌ Not aware | 🔄 Refactor |
| `withdrawal-status-check.ts` | `withdrawal-status-check` | `WITHDRAW` | ❌ Not aware | 🔄 Refactor |

---

## Table 5: Refactoring Priority Matrix

### 🔴 High Priority (Must-Do)

| Intent | Current Suggestions | Issues | Impact |
|--------|---------------------|--------|--------|
| `WITHDRAW` | 4 separate suggestions | No intent awareness, duplicate logic | High - core user flow |
| `DEPOSIT` | 5 suggestions across 2 actions | Overlapping logic, no intent awareness | High - core user flow |

**Why High Priority**:
- These are the most frequently used intents
- Currently provide confusing, non-contextual suggestions
- Have the most code duplication

---

### 🟡 Medium Priority (Should-Do)

| Intent | Current Suggestions | Issues | Impact |
|--------|---------------------|--------|--------|
| `SWAP` | 2 suggestions | Partial awareness, inconsistent | Medium - frequently used |

**Why Medium Priority**:
- Already has some intent awareness
- Less code duplication than WITHDRAW/DEPOSIT
- Enhancement rather than full refactor

---

### 🟢 Low Priority (Nice-to-Have)

| Intent | Current Suggestions | Issues | Impact |
|--------|---------------------|--------|--------|
| `SEND` | None | Missing suggestions | Low - less frequent use |

**Why Low Priority**:
- Intent is less frequently used
- No existing broken suggestions
- Would be net-new feature

---

## Table 6: Implementation Phases

| Phase | Intent Focus | Suggestions Affected | Estimated Effort | Risk |
|-------|--------------|----------------------|------------------|------|
| **Phase 1** | Infrastructure | All | 1 day | Low (already done ✅) |
| **Phase 2** | `WITHDRAW` | 4 withdrawal suggestions | 3 days | Medium |
| **Phase 3** | `DEPOSIT` | 5 deposit/strategy suggestions | 4 days | High (most complex) |
| **Phase 4** | `SWAP` | 2 swap suggestions | 2 days | Low (enhance existing) |
| **Phase 5** | `SEND` | 0 (add new) | 2 days | Low (optional) |
| **Phase 6** | Cleanup | All | 1 day | Low |

**Total Estimated Effort**: 11-13 days

---

## Table 7: Code Reduction Metrics (Projected)

| Component | Before LOC | After LOC | Reduction | Notes |
|-----------|------------|-----------|-----------|-------|
| Withdrawal suggestions | ~400 | ~150 | 62% | Consolidate 4 → 1 |
| Deposit suggestions | ~500 | ~200 | 60% | Consolidate 5 → 1 |
| Swap suggestions | ~200 | ~180 | 10% | Enhance existing |
| Total suggestion code | ~1100 | ~530 | 52% | ~570 LOC removed |

**Additional Benefits**:
- Eliminate duplicate prompt logic
- Single source of truth per intent
- Easier to maintain and extend

---

## Table 8: Migration Checklist

### Per-Intent Checklist Template

| Task | WITHDRAW | DEPOSIT | SWAP | SEND |
|------|----------|---------|------|------|
| 1. Create intent-aware prompt file | ⬜ | ⬜ | ⬜ | ⬜ |
| 2. Implement suggestion generator | ⬜ | ⬜ | ⬜ | ⬜ |
| 3. Update evaluator with case handler | ⬜ | ⬜ | ⬜ | ⬜ |
| 4. Remove/refactor old suggestions | ⬜ | ⬜ | ⬜ | ⬜ |
| 5. Write integration tests | ⬜ | ⬜ | ⬜ | ⬜ |
| 6. Manual QA testing | ⬜ | ⬜ | ⬜ | ⬜ |
| 7. Deploy to staging | ⬜ | ⬜ | ⬜ | ⬜ |
| 8. Production deployment | ⬜ | ⬜ | ⬜ | ⬜ |

---

## Legend

### Status Icons
- ✅ Complete / Keep as-is
- ⚠️ Partial / Needs work
- ❌ Not implemented / Broken
- 🔄 Needs refactoring
- 🗑️ Should be removed
- ✂️ Needs splitting
- 💡 New feature idea
- ✨ Enhancement
- 🔍 Needs investigation

### Priority Icons
- 🔴 High Priority
- 🟡 Medium Priority
- 🟢 Low Priority

---

## Summary Statistics

- **Total Suggestions**: 13
- **Intent-Aware**: 1 (partial)
- **Need Refactoring**: 11
- **High Priority**: 9
- **Estimated LOC Reduction**: 52% (~570 lines)
- **Estimated Implementation**: 11-13 days


