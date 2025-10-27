# LLM Prompt Debugging and Response Quality Fixes

This guide covers systematic approaches to diagnosing and fixing issues with LLM-generated responses in ElizaOS agents.

## Common LLM Response Issues

### 1. Content Duplication
**Symptoms**: Repetitive information across multiple actions or responses
**Example**: Action A provides position details, Action B repeats the same details
**Root Cause**: LLM lacks context about previous responses

### 2. Inconsistent Formatting
**Symptoms**: Responses vary in structure, tone, or format
**Example**: Sometimes bullet points, sometimes paragraphs, inconsistent markdown
**Root Cause**: Ambiguous formatting instructions in prompts

### 3. Hallucination or Inaccurate Data
**Symptoms**: LLM generates false information or makes up data
**Example**: Inventing token prices or portfolio balances
**Root Cause**: Insufficient context or unclear data boundaries

### 4. Off-Topic Responses
**Symptoms**: LLM provides irrelevant information
**Example**: User asks about positions, gets general crypto advice
**Root Cause**: Unclear task definition or missing context

### 5. Inappropriate Tone or Style
**Symptoms**: Responses don't match character personality
**Example**: Too formal for casual character, or too casual for professional context
**Root Cause**: Missing or weak character instructions

## Systematic Debugging Approach

### Step 1: Identify the Problem Pattern

```typescript
// Create test cases that consistently reproduce the issue
describe("LLM Response Quality", () => {
  it("should not duplicate information", async () => {
    const responses = await getMultipleResponses("Show me my positions");
    expect(calculateSimilarity(responses[0], responses[1])).toBeLessThan(0.3);
  });
  
  it("should maintain consistent formatting", async () => {
    const responses = await getMultipleResponses("List my assets");
    responses.forEach(response => {
      expect(response).toMatch(/^- \*\*.*\*\*:/); // Consistent bullet format
    });
  });
});
```

### Step 2: Analyze the Current Prompt

```typescript
// Examine the current template
const currentTemplate = `
{{#if someCondition}}
  Show user information
{{/if}}
Respond helpfully.
`;

// Issues to look for:
// - Vague instructions ("helpfully")
// - Missing context variables
// - Unclear conditional logic
// - No formatting guidelines
// - Missing constraints or boundaries
```

### Step 3: Apply Prompt Engineering Patterns

#### Pattern 1: Context Injection
**Problem**: LLM lacks awareness of previous actions
**Solution**: Inject relevant context into prompts

```typescript
const enhancedTemplate = `
{{#if prevActions}}
<previousContext>
{{prevActions}}
</previousContext>
<contextRules>
CRITICAL: The above context shows what information was already provided.
- DO NOT repeat specific data (amounts, balances, names) from previousContext
- Reference previous info with phrases like "As mentioned above" if needed
- Focus on NEW value: next steps, questions, or additional context
</contextRules>
{{/if}}

<task>
{{taskDescription}}
</task>
`;
```

#### Pattern 2: Explicit Constraints
**Problem**: LLM generates inappropriate or off-topic content
**Solution**: Add clear boundaries and constraints

```typescript
const constrainedTemplate = `
<constraints>
- ONLY use data from the provided context
- DO NOT generate fictional numbers or prices
- MUST stay within the topic of {{topicScope}}
- Response length: {{minLength}}-{{maxLength}} characters
- Format: {{requiredFormat}}
</constraints>

<data>
{{contextData}}
</data>

<instructions>
{{specificInstructions}}
</instructions>
`;
```

#### Pattern 3: Format Enforcement
**Problem**: Inconsistent response formatting
**Solution**: Provide explicit formatting templates

```typescript
const formattedTemplate = `
<responseFormat>
Use this EXACT format:

**{{title}}**

{{#each items}}
- **{{name}}**: ${{value}} ({{details}})
{{/each}}

Total: ${{total}}

{{actionPrompt}}
</responseFormat>

<example>
**Your DeFi Positions**

- **Strategy 1**: $100.00 (Balance: 0.1 ETH)
- **Safe Yield**: $50.00 (Balance: 50 USDC)

Total: $150.00

Would you like to manage these positions?
</example>
`;
```

#### Pattern 4: Character Consistency
**Problem**: Responses don't match character personality
**Solution**: Reinforce character traits in prompts

```typescript
const characterTemplate = `
<character>
Name: {{agentName}}
Personality: {{personality}}
Tone: {{preferredTone}}
Expertise: {{domainExpertise}}
</character>

<responseGuidelines>
- Speak as {{agentName}} would, using {{preferredTone}} tone
- Demonstrate expertise in {{domainExpertise}}
- Use personality traits: {{personality}}
- Avoid: {{avoidBehaviors}}
</responseGuidelines>
`;
```

#### Pattern 5: Progressive Disclosure
**Problem**: Information overload or insufficient detail
**Solution**: Structure information hierarchically

```typescript
const progressiveTemplate = `
<informationStructure>
1. SUMMARY: Brief overview (1-2 sentences)
2. DETAILS: Specific information if requested
3. ACTIONS: Available next steps
4. QUESTIONS: Clarifying questions if needed
</informationStructure>

{{#if userRequestedDetails}}
  Provide full details in section 2
{{else}}
  Keep details brief, focus on summary
{{/if}}
`;
```

## Implementation Strategy

### 1. Template Enhancement Process

```typescript
// Before: Vague prompt
const oldTemplate = `
Show the user their positions.
Be helpful and friendly.
`;

// After: Specific, constrained prompt
const newTemplate = `
{{#if prevActions}}
<previousContext>{{prevActions}}</previousContext>
<deduplicationRules>
CRITICAL: Previous context shows information already provided.
- DO NOT repeat specific amounts, balances, or strategy names
- Reference with "As shown above" if needed
- Provide NEW value: actions, questions, or additional context
</deduplicationRules>
{{/if}}

<task>
Display user's DeFi positions with clear formatting and actionable next steps.
</task>

<dataConstraints>
- ONLY use data from {{positionData}}
- DO NOT generate fictional amounts
- Include pending withdrawal status if applicable
</dataConstraints>

<responseFormat>
**Your Current Positions**

{{#each positions}}
- **{{strategyName}}**: ${{balanceUsd}} ({{balance}} {{symbol}}){{#if hasPendingWithdrawals}} - Pending withdrawals{{/if}}
{{/each}}

**Total Portfolio Value**: ${{totalValue}}

{{#if hasPositions}}
Would you like to withdraw funds, diversify, or explore other strategies?
{{else}}
Ready to start investing? I can recommend strategies based on your risk preference.
{{/if}}
</responseFormat>

<character>
Speak as {{agentName}}: knowledgeable, helpful, and encouraging about DeFi investments.
</character>
`;
```

### 2. Testing and Validation

```typescript
// A/B testing for prompt improvements
describe("Prompt Enhancement Validation", () => {
  const testCases = [
    { input: "Show my positions", expectedPattern: /\*\*.*\*\*.*\$\d+/ },
    { input: "What should I do?", expectedKeywords: ["withdraw", "diversify", "explore"] },
  ];

  testCases.forEach(({ input, expectedPattern, expectedKeywords }) => {
    it(`should handle "${input}" correctly`, async () => {
      const response = await generateResponse(input);
      
      if (expectedPattern) {
        expect(response.text).toMatch(expectedPattern);
      }
      
      if (expectedKeywords) {
        expectedKeywords.forEach(keyword => {
          expect(response.text.toLowerCase()).toContain(keyword);
        });
      }
    });
  });
});

// Similarity testing for duplication issues
it("should not duplicate information across actions", async () => {
  const responses = await simulateMultipleActions("Show positions");
  const similarity = calculateTextSimilarity(responses[0].text, responses[1].text);
  expect(similarity).toBeLessThan(0.3); // Less than 30% similarity
});

// Response quality metrics
it("should meet quality standards", async () => {
  const response = await generateResponse("Analyze my portfolio");
  
  expect(response.text.length).toBeGreaterThan(100); // Sufficient detail
  expect(response.text.length).toBeLessThan(1000); // Not too verbose
  expect(response.text).toMatch(/\$\d+/); // Contains financial data
  expect(response.text).toContain("?"); // Includes questions/engagement
});
```

### 3. Monitoring and Iteration

```typescript
// Response quality monitoring
class ResponseQualityMonitor {
  async analyzeResponse(response: string, context: any) {
    const metrics = {
      length: response.length,
      sentiment: await analyzeSentiment(response),
      relevance: await calculateRelevance(response, context),
      duplication: await checkForDuplication(response, context.previousResponses),
      formatting: this.validateFormatting(response),
    };
    
    // Log metrics for analysis
    runtime.logger.info("Response quality metrics", metrics);
    
    // Alert on quality issues
    if (metrics.duplication > 0.5) {
      runtime.logger.warn("High duplication detected", { response, context });
    }
    
    return metrics;
  }
}
```

## Specific Fix Examples

### Example 1: Duplication Fix
**Problem**: Actions repeat position information
**Solution**: Context injection + deduplication rules

```typescript
// Enhanced rephrase utility
export const rephrase = async ({
  runtime,
  content,
  state,
  prevActions = "", // NEW: Previous action context
}: RephraseParams) => {
  const template = `
  {{#if prevActions}}
  <prevActions>{{prevActions}}</prevActions>
  <deduplicationRules>
  CRITICAL DEDUPLICATION RULES:
  1. If prevActions contains specific data (amounts, balances, names), DO NOT repeat them
  2. If prevActions provided details, focus on next steps or questions instead
  3. Use "As mentioned above" if you must reference previous data
  4. Provide NEW value: suggest actions, ask questions, offer additional context
  </deduplicationRules>
  {{/if}}
  
  <instructions>
  {{#if prevActions}}
  Analyze prevActions above. If they contain detailed information, your response MUST provide NEW value and NOT repeat specific data.
  {{/if}}
  Rephrase the message for {{agentName}} in your own words.
  </instructions>
  `;
  
  // ... rest of implementation
};
```

### Example 2: Formatting Consistency Fix
**Problem**: Inconsistent position display format
**Solution**: Strict formatting template

```typescript
const positionTemplate = `
<strictFormat>
MUST use this exact format:

**Your DeFi Positions**

{{#each positions}}
- **{{strategy.name}}**: ${{balanceUsd}} (Balance: {{balance}} {{symbol}}){{#if hasPendingWithdrawals}} - Pending withdrawals{{/if}}
{{/each}}

**Total Portfolio Value**: ${{totalValue}}

{{nextStepsPrompt}}
</strictFormat>

<validation>
- Every position MUST start with "- **"
- Every amount MUST include "$" symbol
- Balance MUST be in parentheses
- Pending withdrawals MUST be noted if applicable
</validation>
`;
```

### Example 3: Hallucination Prevention
**Problem**: LLM generates fake portfolio data
**Solution**: Strict data boundaries

```typescript
const dataConstrainedTemplate = `
<dataSource>
{{positionData}}
</dataSource>

<criticalRules>
1. ONLY use data from dataSource above
2. NEVER generate fictional amounts or balances
3. If data is missing, say "Unable to retrieve" instead of guessing
4. All dollar amounts MUST come from balanceUsd field
5. All token amounts MUST come from balance field
</criticalRules>

<validation>
Before responding, verify:
- Every number comes from dataSource
- No fictional data was added
- Missing data is acknowledged, not invented
</validation>
`;
```

## Best Practices Summary

### 1. Prompt Structure
- **Context First**: Provide all necessary context before instructions
- **Clear Constraints**: Define what the LLM should and shouldn't do
- **Explicit Format**: Show exact formatting requirements with examples
- **Validation Rules**: Include self-checking mechanisms

### 2. Testing Strategy
- **Regression Tests**: Ensure fixes don't break existing functionality
- **Quality Metrics**: Measure response quality quantitatively
- **Edge Cases**: Test with unusual inputs and missing data
- **A/B Testing**: Compare old vs new prompts systematically

### 3. Monitoring and Iteration
- **Quality Tracking**: Monitor response quality over time
- **User Feedback**: Collect feedback on response helpfulness
- **Continuous Improvement**: Regularly refine prompts based on data
- **Documentation**: Keep detailed records of what works and what doesn't

## Related Documentation

- [Action Duplication Fix](./action-duplication-fix.md) - Specific example of this pattern
- [ElizaOS Patterns](../../.cursor/rules/elizaos-patterns.mdc) - Framework-specific patterns
- [Testing Patterns](../../.cursor/rules/testing-patterns.mdc) - Testing strategies
- [Character Development](../character/personality-guidelines.md) - Character consistency guidelines

## Tools and Utilities

### Response Quality Testing
```typescript
// Utility for measuring response quality
export const analyzeResponseQuality = (response: string, context: any) => {
  return {
    length: response.length,
    readability: calculateReadability(response),
    relevance: calculateRelevance(response, context),
    sentiment: analyzeSentiment(response),
    duplication: checkDuplication(response, context.previous),
    formatting: validateFormatting(response),
  };
};
```

### Template Testing Framework
```typescript
// Framework for testing prompt templates
export class PromptTester {
  async testTemplate(template: string, testCases: TestCase[]) {
    const results = [];
    
    for (const testCase of testCases) {
      const response = await generateWithTemplate(template, testCase.context);
      const quality = analyzeResponseQuality(response, testCase);
      
      results.push({
        input: testCase.input,
        response,
        quality,
        passed: quality.score > testCase.threshold,
      });
    }
    
    return results;
  }
}
```

This systematic approach to LLM prompt debugging can be applied to any response quality issue, not just duplication. The key is to identify the pattern, understand the root cause, and apply targeted prompt engineering techniques.
