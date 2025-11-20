import { formatZodKeys, formatZodOutput } from "./util";
import { defaultSuggestionSchema } from "./suggest/schema";

export type { DefaultSuggestionResult } from "./suggest/schema";
export { defaultSuggestionSchema };

export const defaultSuggestionPrompt = (ctx: {
  conversation: string;
}) => `<task>
Generate intelligent suggestions for interacting with the Levva DeFi agent based on its comprehensive capabilities.
</task>
<conversation>
${ctx.conversation}
</conversation>
<capabilities>
## 🏦 **Portfolio & Position Management**
- Analyze wallet assets and portfolio composition
- Review active positions and performance
- Manage existing investments (deposits, withdrawals)
- Portfolio diversification and risk analysis
- Position optimization recommendations

## 💰 **Investment Strategies**
- Discover and recommend DeFi strategies (ultra-safe, safe, brave, custom)
- Deposit into yield farming pools and vaults
- Strategy selection based on risk tolerance and portfolio
- ETH/WETH conversion and wrapping guidance
- Leverage and liquidity management

## 🔄 **Token Operations**
- Swap tokens across multiple DEXs (Kyber, Pendle)
- ETH ↔ WETH wrapping/unwrapping
- Multi-step swap operations with intent persistence
- Token price analysis and optimal timing
- Cross-chain token operations

## 📊 **Market Intelligence**
- Real-time crypto news and market updates
- DeFi protocol analysis and insights
- Yield farming opportunities discovery
- Risk assessment and market trends
- Strategy performance tracking

## 🎯 **Intent-Based Actions**
- Context-aware multi-step operations
- Persistent transaction flows (deposit, swap, withdraw)
- Intelligent parameter extraction from conversations
- Transaction status tracking and completion
- Smart suggestions based on active intents
</capabilities>
<instructions>
"LABEL" GENERATION INSTRUCTIONS:
1. **Direct Response Priority**: If the agent asks a question, prioritize direct answers
   - "Agent: Are you sure to continue?" → ["Yes", "No", "Tell me more"]
   - "Agent: Which strategy interests you?" → ["Ultra-safe", "Safe", "Brave", "Show all options"]

2. **Capability-Based Suggestions**: Generate 4-6 contextually relevant suggestions from capabilities
   - Consider conversation history and user's apparent interests
   - Prioritize actionable suggestions that lead to meaningful interactions
   - Include both immediate actions and exploratory options

3. **Smart Contextual Awareness**:
   - If user mentioned tokens → suggest swaps, deposits, or analysis
   - If user discussed risk → suggest strategy recommendations or portfolio review
   - If user showed interest in yields → suggest strategy exploration or deposits
   - If user has active positions → suggest management or optimization

"TEXT" GENERATION INSTRUCTIONS:
Generate natural, conversational messages that clearly express user intent:

**Portfolio & Analysis Examples:**
- "label": "Check My Portfolio" → "text": "Show me my current portfolio and asset breakdown"
- "label": "Review Positions" → "text": "I'd like to review my active DeFi positions and their performance"
- "label": "Portfolio Optimization" → "text": "Help me optimize my portfolio for better diversification"

**Investment & Strategy Examples:**
- "label": "Find Safe Strategies" → "text": "I want to explore safe investment strategies for steady yields"
- "label": "Deposit ETH" → "text": "I'd like to deposit some of my ETH into a yield strategy"
- "label": "Strategy Recommendations" → "text": "Recommend investment strategies based on my portfolio and risk tolerance"
- "label": "Explore fixed term, fixed yield till maturity options" → "text": "I want to explore Pendle fixed term, fixed yield till maturity options"

**Token Operations Examples:**
- "label": "Swap Tokens" → "text": "I want to swap some tokens for better opportunities"
- "label": "Wrap ETH to WETH" → "text": "Help me wrap my ETH to WETH for DeFi strategies"
- "label": "Optimal Swap Timing" → "text": "When would be the best time to swap my tokens?"

**Market & News Examples:**
- "label": "Crypto News" → "text": "What's the latest news affecting DeFi and crypto markets?"
- "label": "Market Opportunities" → "text": "Show me current market opportunities and trending strategies"
- "label": "Yield Farming Updates" → "text": "What are the best yield farming opportunities right now?"

**Management & Advanced Examples:**
- "label": "Withdraw Funds" → "text": "I want to withdraw some funds from my positions"
- "label": "Risk Assessment" → "text": "Analyze the risk profile of my current investments"
- "label": "Rebalance Portfolio" → "text": "Help me rebalance my portfolio for optimal performance"
</instructions>
<keys>
${formatZodKeys(defaultSuggestionSchema)}
</keys>
<output>
${formatZodOutput(defaultSuggestionSchema)}
</output>`;
