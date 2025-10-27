# Debugging Guide for ElizaOS Levva Agent

This directory contains debugging guides and solutions for common issues encountered during development and operation of the ElizaOS Levva agent.

## Available Guides

### [LLM Prompt Debugging](./llm-prompt-debugging.md)
**Problem**: General LLM response quality issues (duplication, formatting, hallucination, etc.)  
**Solution**: Systematic prompt engineering approach with context injection and constraint patterns  
**Key Techniques**: Template enhancement, quality testing, response monitoring

### [Action Duplication Fix](./action-duplication-fix.md)
**Problem**: Multiple actions generating duplicate information in responses  
**Solution**: Context sharing between actions and enhanced LLM deduplication instructions  
**Key Techniques**: Previous action context, template enhancement, integration testing  
**Note**: Specific example of the general LLM prompt debugging pattern

## General Debugging Methodology

### 1. Problem Identification
- **Reproduce the Issue**: Create minimal test cases that consistently reproduce the problem
- **Gather Evidence**: Collect logs, error messages, and user reports
- **Define Success Criteria**: Establish clear metrics for when the issue is resolved

### 2. Root Cause Analysis
- **Trace the Flow**: Follow the execution path from user input to agent response
- **Check Dependencies**: Verify all services, APIs, and external dependencies
- **Review Recent Changes**: Identify any recent code changes that might have introduced the issue

### 3. Solution Development
- **Start Small**: Implement minimal changes to test hypotheses
- **Use Test-Driven Development**: Write tests that fail with the bug and pass with the fix
- **Consider Side Effects**: Ensure fixes don't break existing functionality

### 4. Testing Strategy
- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test component interactions and real-world scenarios
- **Manual Testing**: Verify user experience and edge cases
- **Performance Testing**: Ensure fixes don't introduce performance regressions

### 5. Documentation and Prevention
- **Document the Fix**: Create detailed documentation like the guides in this directory
- **Update Rules**: Add new patterns to `.cursor/rules/` for future reference
- **Share Knowledge**: Ensure team members understand the solution and prevention strategies

## Common Issue Categories

### ElizaOS Framework Issues
- Action coordination and state management
- Provider data flow and caching
- Runtime service integration
- Memory and conversation context

### API Integration Issues
- External API failures and timeouts
- Schema validation and data transformation
- Rate limiting and error handling
- Authentication and authorization

### LLM Response Quality
- Prompt engineering and template optimization
- Context management and deduplication
- Response formatting and consistency
- Action selection and triggering

### Performance Issues
- Caching strategy optimization
- Database query performance
- API response times
- Memory usage and leaks

## Debugging Tools and Techniques

### Logging
```typescript
// Use runtime.logger for consistent logging
runtime.logger.info("User action", { userId, action });
runtime.logger.error("API failure", { error, endpoint });
runtime.logger.debug("State composition", { providers, state });
```

### Testing
```typescript
// Integration tests for real-world scenarios
describe("User Flow", () => {
  it("should handle position management without duplication", async () => {
    // Test real agent interactions
  });
});

// Unit tests for isolated components
describe("LevvaService", () => {
  it("should cache position data correctly", async () => {
    // Test service methods in isolation
  });
});
```

### Monitoring
- Set up alerts for API failures and response times
- Monitor agent response quality and user satisfaction
- Track error rates and performance metrics
- Use structured logging for better observability

## Best Practices

### Code Quality
- Follow TypeScript best practices and use strict typing
- Implement proper error handling and graceful degradation
- Use consistent naming conventions and code organization
- Write comprehensive tests for all new functionality

### ElizaOS Patterns
- Use `runtime.composeState()` for provider coordination
- Implement proper caching with `timedCache` and `permanentCache`
- Follow service organization patterns (see `.cursor/rules/service-organization.mdc`)
- Use `runtime.logger` instead of importing logger directly

### API Integration
- Validate all API responses with Zod schemas
- Implement proper retry logic and timeout handling
- Use environment variables for configuration
- Handle rate limiting and authentication properly

### Testing Strategy
- Separate unit tests from integration tests
- Use real API data in integration tests when possible
- Mock external dependencies appropriately
- Test both success and failure scenarios

## Contributing to This Guide

When you encounter and fix a new issue:

1. **Create a detailed guide** in this directory following the pattern of existing guides
2. **Update this README** to reference your new guide
3. **Add relevant rules** to `.cursor/rules/` for future prevention
4. **Share with the team** to ensure knowledge transfer

## Related Documentation

- [ElizaOS Framework Patterns](../.cursor/rules/elizaos-patterns.mdc)
- [Service Organization](../.cursor/rules/service-organization.mdc)
- [Testing Patterns](../.cursor/rules/testing-patterns.mdc)
- [Error Handling](../.cursor/rules/error-handling.mdc)
