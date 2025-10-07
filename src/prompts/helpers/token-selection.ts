/**
 * Token selection helper for consistent token suggestion logic
 * 
 * @version 1.0.0
 * @lastModified 2025-01-XX
 * @changes Initial creation - extracted from 5+ prompts with token selection logic
 */

export interface WalletAsset {
  token: string;
  symbol?: string;
  amount: bigint;
  value: bigint;
}

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals?: number;
}

export interface TokenSelectionConfig {
  walletAssets: WalletAsset[];
  availableTokens: TokenInfo[];
  includeEthWethConversion?: boolean;
  prioritizeBalance?: boolean;
  excludeTokens?: string[];
}

/**
 * ETH/WETH conversion guidance constant
 */
export const ETH_WETH_GUIDANCE = `
**ETH/WETH CONVERSION:**
- User has ETH available. ETH can be wrapped to WETH (1:1 ratio) for DeFi strategies.
- User has WETH available. WETH can be unwrapped to ETH (1:1 ratio).
- Consider suggesting both ETH and WETH options when relevant.
- Wrapping/unwrapping is gas-efficient and instant.`;

/**
 * Format wallet assets for prompt context
 */
export function formatWalletAssetsForPrompt(
  assets: WalletAsset[],
  options?: {
    includeZeroBalance?: boolean;
    sortByValue?: boolean;
    limit?: number;
  }
): string {
  let filteredAssets = options?.includeZeroBalance 
    ? assets 
    : assets.filter((a) => a.amount > 0n);

  if (options?.sortByValue) {
    filteredAssets = filteredAssets.sort((a, b) => 
      Number(b.value - a.value)
    );
  }

  if (options?.limit) {
    filteredAssets = filteredAssets.slice(0, options.limit);
  }

  return filteredAssets
    .map((asset) => {
      const symbol = asset.symbol || "Unknown";
      const balance = formatTokenBalance(asset.amount, asset.value);
      return `- ${symbol}: ${balance}`;
    })
    .join("\n");
}

/**
 * Format token balance with value
 */
function formatTokenBalance(amount: bigint, value: bigint): string {
  // Simple formatting - actual implementation may vary
  const usdValue = Number(value) / 1e18;
  return `${amount.toString()} tokens ($${usdValue.toFixed(2)})`;
}

/**
 * Check if user has ETH or WETH
 */
export function checkEthWethAvailability(assets: WalletAsset[]): {
  hasEth: boolean;
  hasWeth: boolean;
  ethBalance?: bigint;
  wethBalance?: bigint;
} {
  const ETH_NULL_ADDR = "0x0000000000000000000000000000000000000000";
  
  const ethAsset = assets.find(
    (a) => a.token === ETH_NULL_ADDR || a.symbol?.toUpperCase() === "ETH"
  );
  
  const wethAsset = assets.find(
    (a) => a.symbol?.toUpperCase() === "WETH"
  );

  return {
    hasEth: ethAsset ? ethAsset.amount > 0n : false,
    hasWeth: wethAsset ? wethAsset.amount > 0n : false,
    ethBalance: ethAsset?.amount,
    wethBalance: wethAsset?.amount,
  };
}

/**
 * Generate ETH/WETH conversion note for prompts
 */
export function generateEthWethConversionNote(
  assets: WalletAsset[]
): string {
  const { hasEth, hasWeth } = checkEthWethAvailability(assets);

  if (!hasEth && !hasWeth) return "";

  if (hasEth && !hasWeth) {
    return "\nNOTE: User has ETH available. ETH can be wrapped to WETH for DeFi strategies that require WETH.";
  }

  if (hasWeth && !hasEth) {
    return "\nNOTE: User has WETH available. WETH can be unwrapped to ETH if needed.";
  }

  return "\nNOTE: User has both ETH and WETH available. These can be converted 1:1 as needed.";
}

/**
 * Generate available tokens section for prompts
 */
export function generateAvailableTokensSection(
  tokens: TokenInfo[],
  options?: {
    includeAddresses?: boolean;
    markNativeToken?: boolean;
  }
): string {
  const ETH_NULL_ADDR = "0x0000000000000000000000000000000000000000";
  
  return tokens
    .map((token) => {
      const isNative = token.address === ETH_NULL_ADDR;
      const addressPart = options?.includeAddresses
        ? ` - ${isNative && options.markNativeToken ? "Native token" : token.address}`
        : "";
      return `${token.symbol}${addressPart}`;
    })
    .join(", ");
}

/**
 * Filter tokens by balance availability
 */
export function getTokensWithBalance(
  walletAssets: WalletAsset[],
  availableTokens: TokenInfo[]
): TokenInfo[] {
  const assetsWithBalance = new Set(
    walletAssets
      .filter((a) => a.amount > 0n)
      .map((a) => a.symbol?.toUpperCase())
  );

  return availableTokens.filter((token) =>
    assetsWithBalance.has(token.symbol.toUpperCase())
  );
}

/**
 * Sort tokens by priority (balance, then alphabetical)
 */
export function sortTokensByPriority(
  tokens: TokenInfo[],
  walletAssets: WalletAsset[]
): TokenInfo[] {
  const assetMap = new Map(
    walletAssets.map((a) => [a.symbol?.toUpperCase(), a])
  );

  return [...tokens].sort((a, b) => {
    const aAsset = assetMap.get(a.symbol.toUpperCase());
    const bAsset = assetMap.get(b.symbol.toUpperCase());

    // Prioritize tokens with balance
    const aHasBalance = aAsset && aAsset.amount > 0n;
    const bHasBalance = bAsset && bAsset.amount > 0n;

    if (aHasBalance && !bHasBalance) return -1;
    if (!aHasBalance && bHasBalance) return 1;

    // If both have balance, sort by value
    if (aHasBalance && bHasBalance) {
      return Number(bAsset!.value - aAsset!.value);
    }

    // Otherwise, alphabetical
    return a.symbol.localeCompare(b.symbol);
  });
}
