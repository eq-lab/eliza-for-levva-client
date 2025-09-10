# Suggestion System Analysis

## How the Suggestion System Works

### 1. Suggestion Flow
1. **Action Execution**: User triggers an action (e.g., WITHDRAW)
2. **Evaluator Activation**: `suggestionsEvaluator` runs after action completion
3. **Suggestion Selection**: LLM selects most appropriate suggestion type using `suggestTypeTemplate`
4. **Prompt Generation**: Selected suggestion's `getPrompt` function generates context-aware prompt
5. **LLM Response**: LLM generates structured suggestions based on user's current state
6. **Cache Storage**: Suggestions are cached for the frontend to display

### 2. Suggestion Structure
Each suggestion in the `suggest` array has:
- `name`: Unique identifier for the suggestion type
- `description`: Explains when this suggestion should be used (for LLM selection)
- `getPrompt`: Async function that generates the prompt for the LLM
- `model`: Optional model type (defaults to OBJECT_SMALL)

### 3. Prompt Pattern
Suggestion prompts follow a consistent structure:
```xml
<task>Generate suggestions for [specific scenario]</task>
<decision>${JSON.stringify(decision)}</decision>
<currentState>[relevant user data]</currentState>
<conversation>${conversation}</conversation>
<instructions>[specific rules for this suggestion type]</instructions>
<output>
{
  "suggestions": [
    {
      "label": "Short action description",
      "text": "Specific instruction for what to do"
    }
  ]
}
</output>
```

### 4. Key Insights

#### Current Withdraw Suggestions Analysis:
- **withdrawal-status-check**: Good - checks withdrawal state and provides contextual suggestions
- **withdrawal-guidance**: Basic - provides generic withdrawal guidance

#### Missing Functionality:
1. **Position Selection**: When user says "withdraw" but doesn't specify which strategy
2. **Amount Suggestions**: When user specifies strategy but not amount (25%, 66%, 100%)

#### Best Practices from Other Actions:
- **Swap Action**: `exchange-amount` provides percentage-based suggestions (100%, 50%, 25%, 10%)
- **Position Action**: Uses real-time data to filter available strategies
- **All Actions**: Use structured prompts with clear instructions and JSON output

### 5. Implementation Requirements

For withdrawal suggestions, we need:

1. **withdrawal-position-selection**:
   - Triggered when: User wants to withdraw but hasn't specified strategy
   - Shows: Available positions with balances and status
   - Decision context: `unknown` includes 'strategyId'

2. **withdrawal-amount-suggestions**:
   - Triggered when: User specified strategy but not amount
   - Shows: 25%, 66%, 100% withdrawal options with precise amounts
   - Decision context: `known` includes 'strategyId', `unknown` includes 'amount'

3. **Enhanced withdrawal-guidance**:
   - Current version is too generic
   - Should provide more specific guidance based on user's actual positions

### 6. Prompt File Structure
Each suggestion should have its own prompt file in `src/prompts/suggest/`:
- `withdrawal-position-selection.ts` ✅ **COMPLETED**
- `withdrawal-amount-suggestions.ts` ✅ **COMPLETED**
- Update existing `withdrawal-guidance.ts` ✅ **COMPLETED**
- Update existing `withdrawal-status-check.ts` ✅ **COMPLETED**

### 7. Implementation Results

✅ **Successfully Implemented:**
- **Synchronous Prompt Helpers**: All prompt functions are now synchronous and pure
- **Async Logic in Handlers**: Data fetching moved to suggestion handlers in the action
- **Clean Separation**: Prompt helpers only handle string formatting, handlers manage data
- **Type Safety**: Proper interfaces for all prompt parameters
- **Four Withdrawal Suggestions**:
  1. `withdrawal-status-check` - For users with pending/ready withdrawals
  2. `withdrawal-guidance` - General withdrawal guidance for position holders
  3. `withdrawal-position-selection` - When strategy is unknown
  4. `withdrawal-amount-suggestions` - When strategy known but amount missing

### 8. Architecture Benefits
- **Performance**: Prompt helpers are fast and cacheable
- **Testability**: Pure functions are easier to test
- **Maintainability**: Clear separation of concerns
- **Reusability**: Prompt helpers can be used in different contexts
