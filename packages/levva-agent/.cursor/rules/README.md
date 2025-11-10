# Levva Agent Cursor Rules

This directory contains Cursor rules specific to the Levva Agent package, following the [nested rules pattern](../../../.cursor/rules/cursor-rules-structure.mdc).

## 📁 Organization

This directory contains 44 Levva-specific rules organized by domain:

### **Action Patterns** (3 rules)

- `action-patterns.mdc` - Action handler patterns and return values
- `actionable-vs-filler-suggestions.mdc` - Distinguishing actionable vs filler suggestions
- `position-management.mdc` - Position management specific patterns

### **Intent Detection** (5 rules)

- `intent-based-actions.mdc` - Intent-based action resolution system
- `intent-detection-patterns.mdc` - Intent detection best practices
- `intent-detection-issues.mdc` - Common issues and solutions
- `intent-detection-debugging.mdc` - Debugging workflows
- `intent-testing-patterns.mdc` - Testing patterns for intents

### **Structured Output** (4 rules)

- `structured-output-core.mdc` - Core patterns for LLM structured output
- `structured-output-validation.mdc` - Validation patterns (addresses, confidence, amounts)
- `structured-output-testing.mdc` - Testing structured output
- `structured-output-patterns.mdc` - Legacy (see core and validation)

### **Service Architecture** (5 rules)

- `service-component-architecture.mdc` - ServiceComponent patterns
- `service-component-migration.mdc` - Migration guide
- `service-organization.mdc` - Service module organization
- `caching-patterns.mdc` - Cache integration patterns
- `background-queue-pattern.mdc` - BackgroundQueue for async operations

### **API & Integration** (3 rules)

- `api-integration-patterns.mdc` - API integration and validation
- `blockchain-integration.mdc` - Blockchain integration patterns
- `ethereum-constants.mdc` - ETH_NULL_ADDR and other constants

### **Prompts & Providers** (4 rules)

- `llm-parameter-extraction.mdc` - LLM-based parameter extraction
- `llm-prompt-debugging.mdc` - LLM limitations and prompt patterns
- `prompt-helper-patterns.mdc` - Prompt helper functions
- `provider-intent-patterns.mdc` - Provider-intent integration

### **Suggestions & UI** (4 rules)

- `suggestion-system.mdc` - Suggestion system architecture
- `progressive-disclosure-pattern.mdc` - Progressive disclosure for intents
- `simple-reply-pattern.mdc` - Simple reply when action state unavailable
- `conversation-flow-patterns.mdc` - Natural conversation patterns

### **Testing** (3 rules)

- `testing-patterns.mdc` - Testing patterns and best practices
- `test-organization.mdc` - Test file organization and cleanup
- `debugging-patterns.mdc` - Debugging and troubleshooting

### **Data & Business Logic** (5 rules)

- `database-patterns.mdc` - Database schema and ORM patterns
- `decimal-handling-patterns.mdc` - BigInt and decimal precision
- `levva-business-logic.mdc` - Levva protocol specific logic
- `error-handling.mdc` - Error handling patterns
- `typescript-conventions.mdc` - TypeScript best practices

### **Configuration** (3 rules)

- `code-style.mdc` - Code style standards
- `turbo-env-caching.mdc` - Turbo environment variable caching
- `elizaos-patterns.mdc` - ElizaOS framework patterns for Levva

---

## 🎯 Glob Patterns

**All globs in these rules are relative to `packages/levva-agent/`**.

Examples:

- `globs: ["src/actions/**/*.ts"]` matches `packages/levva-agent/src/actions/**/*.ts`
- `globs: ["src/providers/**/*.ts"]` matches `packages/levva-agent/src/providers/**/*.ts`

This is the key advantage of nested rules - simpler, more maintainable glob patterns!

---

## 🔗 Global Rules

Rules that apply to all packages are in the project root:

- **`.cursor/rules/`** - Global project rules
  - `cursor-rules-structure.mdc` - Rules system documentation
  - `package-management.mdc` - Bun package management
  - `run-commands.mdc` - Command execution
  - `todo-management.mdc` - TODO tracking

- **`.cursor/rules/elizaos/`** - ElizaOS framework rules (24 files)
  - Core framework patterns that apply across all packages
  - Actions, Providers, Services, Database, Testing, etc.

---

## 📋 Cross-References

Many Levva rules reference ElizaOS foundation rules:

- `action-patterns.mdc` → `@elizaos-actions.mdc`
- `database-patterns.mdc` → `@elizaos-database.mdc`
- `testing-patterns.mdc` → `@elizaos-e2e-testing.mdc`, `@elizaos-unit-testing.mdc`
- `service-component-architecture.mdc` → `@elizaos-services.mdc`
- `caching-patterns.mdc` → `@elizaos-services.mdc`

Use the `@rule-name.mdc` format to reference rules in your code or prompts.

---

## 🚀 Usage

### **Auto-Attach**

Rules automatically attach when you edit files matching their glob patterns.

Example: Opening `src/actions/swap.ts` will automatically load:

- `action-patterns.mdc` (matches `src/actions/**/*.ts`)
- Any global rules from `.cursor/rules/`

### **Manual Reference**

Use `@rule-name` to explicitly reference a rule:

```
@action-patterns.mdc - for action handler patterns
@structured-output-core.mdc - for LLM structured output
```

### **Agent-Requested**

The AI can request rules based on their descriptions when relevant to the task.

---

## 📚 Documentation

For complete documentation on the Cursor rules system, see:

- [Cursor Rules Structure](../../../.cursor/rules/cursor-rules-structure.mdc)
- [Nested Rules Pattern](https://cursor.com/docs/context/rules#nested-rules)

---

## ✨ Benefits of Nested Rules

1. **Simpler Globs**: `src/actions/**/*.ts` instead of `packages/levva-agent/src/actions/**/*.ts`
2. **Colocation**: Rules live near the code they describe
3. **Natural Scoping**: Levva rules don't apply to core or client packages
4. **Easy Discovery**: Developers find rules in the package they're working on
5. **Better Organization**: Clear separation between global and package-specific rules

---

**Last Updated**: October 29, 2025 (Nested Rules Migration Complete)

