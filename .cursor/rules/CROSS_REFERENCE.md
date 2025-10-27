# Cursor Rules Cross-Reference Guide

This document outlines the relationship between ElizaOS core rules and Levva-specific rules.

## Rule Organization

### `/rules/elizaos/` - Core ElizaOS Framework Rules
These rules apply to all ElizaOS projects and cover the fundamental framework patterns.

### `/rules/levva/` - Levva Agent Specific Rules
These rules are specific to the Levva Agent implementation in `packages/levva-agent/`.

## Cross-References and Relationships

### Testing
- **ElizaOS Core**:
  - `elizaos-unit-testing.mdc` - Unit testing patterns for ElizaOS
  - `elizaos-e2e-testing.mdc` - End-to-end testing with ElizaOS runtime
  - `elizaos-scenario-testing.mdc` - Scenario-based testing patterns
  - `elizaos-cypress-testing.mdc` - Cypress testing for client UI

- **Levva Specific**:
  - `testing-patterns.mdc` - General testing patterns
  - `test-organization.mdc` - Test file organization and cleanup
  - `structured-output-testing.mdc` - LLM output testing with OpenRouter
  - `intent-testing-patterns.mdc` - Intent-based action testing

**When to Use**: Start with ElizaOS core testing rules for framework patterns, then apply Levva-specific rules for intent testing and LLM output validation.

### Actions & Providers
- **ElizaOS Core**:
  - `elizaos-actions.mdc` - Action implementation patterns
  - `elizaos-providers.mdc` - Provider implementation patterns
  - `elizaos-evaluators.mdc` - Evaluator patterns

- **Levva Specific**:
  - `action-patterns.mdc` - Levva action handler patterns with validation
  - `provider-intent-patterns.mdc` - Provider-intent integration
  - `intent-based-actions.mdc` - Multi-step intent resolution system

**When to Use**: Follow ElizaOS core for basic action/provider structure, then apply Levva patterns for intent-based workflows.

### Services & Architecture
- **ElizaOS Core**:
  - `elizaos-services.mdc` - Service patterns and lifecycle
  - `elizaos-tasks.mdc` - Task patterns for scheduled work
  - `elizaos-rooms.mdc` - Room abstraction patterns
  - `elizaos-worlds.mdc` - World abstraction patterns
  - `elizaos-entities.mdc` - Entity management patterns

- **Levva Specific**:
  - `service-component-architecture.mdc` - ServiceComponent decomposition patterns
  - `service-component-migration.mdc` - Extracting ServiceComponents
  - `service-organization.mdc` - Service module organization
  - `background-queue-pattern.mdc` - Async operation queuing

**When to Use**: Use ElizaOS core for standard services, Levva patterns for complex service decomposition and async workflows.

### Development Workflow
- **ElizaOS Core**:
  - `elizaos-dev-workflow.mdc` - General ElizaOS development workflow
  - `elizaos-kiss.mdc` - Keep It Simple principles
  - `run-commands-autonomously.mdc` - Command execution patterns

- **Levva Specific**:
  - `debugging-patterns.mdc` - Bun debugging with debug.bun.sh
  - `llm-prompt-debugging.mdc` - LLM prompt troubleshooting
  - `cleanup-verification.mdc` - Code refactoring verification
  - `code-style.mdc` - Levva code style standards

**When to Use**: Follow ElizaOS dev workflow for framework operations, Levva patterns for debugging and cleanup verification.

### Database & Blockchain
- **ElizaOS Core**:
  - `elizaos-database.mdc` - Database patterns with Drizzle ORM

- **Levva Specific**:
  - `database-patterns.mdc` - Levva-specific schema patterns
  - `blockchain-integration.mdc` - Multi-chain integration with Viem
  - `ethereum-constants.mdc` - Ethereum address constants
  - `decimal-handling-patterns.mdc` - BigInt and decimal handling

**When to Use**: Use ElizaOS core for basic DB operations, Levva patterns for DeFi-specific blockchain and decimal handling.

### LLM & Prompts
- **ElizaOS Core**:
  - `elizaos-llm-providers.mdc` - LLM provider integration
  - `vendor_models.mdc` - Vendor model configurations

- **Levva Specific**:
  - `structured-output-patterns.mdc` - Structured LLM output with Zod schemas
  - `llm-parameter-extraction.mdc` - Extracting parameters from conversation
  - `conversation-flow-patterns.mdc` - Natural conversation patterns
  - `prompt-helper-patterns.mdc` - Reusable prompt helpers

**When to Use**: Follow ElizaOS core for provider setup, Levva patterns for structured output and conversation design.

### TypeScript & Code Quality
- **ElizaOS Core**:
  - `elizaos-types-reference.mdc` - Core type definitions

- **Levva Specific**:
  - `typescript-conventions.mdc` - TypeScript best practices
  - `error-handling.mdc` - Error handling patterns
  - `caching-patterns.mdc` - ElizaOS cache API usage

**When to Use**: Reference ElizaOS types for framework interfaces, apply Levva conventions for implementation details.

### API & Integration
- **ElizaOS Core**:
  - `elizaos-api-server.mdc` - API server patterns
  - `elizaos_api_plugins_core.mdc` - Plugin API integration
  - `elizaos_cli_project.mdc` - CLI project structure
  - `elizaos_cli_config.mdc` - CLI configuration
  - `elizaos_cli_agents.mdc` - Agent configuration

- **Levva Specific**:
  - `api-integration-patterns.mdc` - Levva API integration
  - `levva-business-logic.mdc` - Levva protocol logic
  - `position-management.mdc` - Position tracking patterns
  - `project-overview.mdc` - Levva Agent architecture

**When to Use**: Use ElizaOS CLI patterns for project setup, Levva patterns for protocol-specific integrations.

### Levva-Only Patterns (No ElizaOS Equivalent)
- `suggestion-system.mdc` - Intent-based suggestion system
- `simple-reply-pattern.mdc` - Provider reply patterns
- `progressive-disclosure-pattern.mdc` - Multi-step suggestions
- `actionable-vs-filler-suggestions.mdc` - Suggestion quality guidelines
- `intent-detection-patterns.mdc` - Intent detection system
- `intent-detection-issues.mdc` - Common intent issues
- `intent-detection-debugging.mdc` - Intent debugging workflow
- `package-management.mdc` - Bun package management
- `cursor-rules-structure.mdc` - Cursor rules format
- `todo-management.mdc` - TODO management patterns

## Usage Guidelines

1. **Always start with ElizaOS core rules** for framework-level patterns
2. **Apply Levva-specific rules** for business logic and DeFi-specific features
3. **When in doubt**, check this cross-reference to understand rule relationships
4. **For overlapping topics**, ElizaOS rules provide the foundation, Levva rules provide the specialization

## Rule Scoping

- **ElizaOS rules** (`rules/elizaos/`): Apply globally or to specific framework packages
- **Levva rules** (`rules/levva/`): Only apply to `packages/levva-agent/**` via glob patterns

