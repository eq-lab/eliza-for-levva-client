/**
 * Test constants shared across chat tests
 * These values are taken from the example.ts file
 */

export const TEST_SECRET =
  "0x6edf00f6b2e3984835a36d12ef94b11014cd98378fc1c32d7caf5bb3614751ae1362b375d8d46175e8e953a8867142bdd8d804d7439e6a1416cba5e19821fe9b12ca053e02ae94c09cf25668ba58eaefd0cd44d9a72b5c04ee3899e9c598ffc163d3adec539fab900a8001651f212723358697521349010c094405c0300386c2c15c5a9a9976924258d0a8c5f5cf0eb031c2c32a7089b5189d35c64c89056719007069026df3bb58271a56f91df2e6a72f9f8177e96213b6088acf46ae2ef8e0d8e321c94a14717ab2a6dccccb44e199c574497eefdccb0025f08bc735022efa0590f8be4eff6b8794dc655adffe41f1f701461dd44e091bc3d83e58ecc40d9a18260240abb8c2d35400089bb228be653ee5eb85842451f09a9488388d5a55d4e6dbd61b3b67765fe306fad94569f7e338c707c45b80457ed15ec15bc46b37e173c71e0e80144ac9ede6db665063444eaf6f3837ed7421e517a0dc19dcc4b88508cf648ea7ad984930682f0116a02b52c02136cddf71cc971334f228c36b7b665b1722a4e8768b862cc96f26b115e2b613f54efa3456660967ebf138083c8678f13c695b36e18aae9bcc6524a68286a0b591ae5a562cfb97e958ef3fdfadafba74de182d6df5e117a7d8ae33da81ddd56f92866b30cd72fb0df553d9e48c045504d0ec60c9d11dc8356aa879976163943c26b27aaa66c1e3bbcb38cabfb59c27";

export const TEST_ADDRESS =
  "0x40b88b09610487A26b18FB52DBe319D1268fCa22" as `0x${string}`;

export const DEFAULT_TEST_CONFIG = {
  baseUrl: process.env.ELIZA_BASE_URL || "http://localhost:3001",
  secret: TEST_SECRET,
  address: TEST_ADDRESS,
  chainId: parseInt(process.env.ELIZA_CHAIN_ID || "1"),
  timeout: 30000, // 30 seconds timeout for responses
};

/**
 * Common test messages for different scenarios
 */
export const TEST_MESSAGES = {
  greeting: "Hello! How are you today?",
  help: "What can you help me with?",
  defi: "Tell me about DeFi",
  wallet: "Show me my wallet analysis",
  positions: "What are my current positions?",
  swap: "I want to swap 100 USDC for ETH",
  strategy: "What investment strategies do you recommend?",
  blockchain: "Tell me about blockchain",
  clear: "Test message for clearing",
} as const;

/**
 * Expected keywords for different action types
 */
export const EXPECTED_KEYWORDS = {
  swap: ["swap", "exchange", "trade"],
  position: ["position", "portfolio", "balance"],
  strategy: ["strategy", "invest", "recommend"],
  wallet: ["wallet", "analysis", "assets"],
  help: ["help", "assist", "can"],
  defi: ["defi", "finance", "protocol"],
  blockchain: ["blockchain"],
} as const;
