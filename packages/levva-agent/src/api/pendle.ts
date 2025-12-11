import { z } from "zod";

const PendleConvertResponseSchema = z.object({
  requiredApprovals: z.array(
    z.object({
      token: z.string(),
      amount: z.string(),
    })
  ),
  routes: z.array(
    z.object({
      tx: z.object({
        data: z.string(),
        to: z.string(),
        from: z.string(),
        value: z.string().optional(),
      }),
    })
  ),
});

const PendleMarketSupportedTokensResponseSchema = z.object({
  tokensIn: z.array(z.string()),
  tokensOut: z.array(z.string()),
});

interface PendleConvertParams {
  chainId: `${number}`;
  receiver: `0x${string}`;
  slippage: `${number}`;
  enableAggregator: "true" | "false";
  tokensIn: `0x${string}`;
  tokensOut: `0x${string}`;
  amountsIn: `${bigint}`;
}

export async function getPendleConvert({
  chainId,
  enableAggregator = "true",
  slippage = "0.005",
  ...params
}: PendleConvertParams) {
  const path = `/core/v2/sdk/${chainId}/convert`;
  const query = new URLSearchParams({ ...params, enableAggregator, slippage });

  const response = await fetch(
    `https://api-v2.pendle.finance${path}?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.PENDLE_API_KEY}`,
      },
    }
  );

  const data = await response.json();
  const result = PendleConvertResponseSchema.safeParse(data);

  if (!result.success) {
    throw new Error(
      `Failed to get Pendle transaction details. Error: ${data.message}}`
    );
  }

  return result.data;
}

export async function getPendleMarketSupportedTokens(
  chainId: number,
  market: `0x${string}`
) {
  const path = `/core/v1/sdk/${chainId}/markets/${market}/tokens`;

  const response = await fetch(`https://api-v2.pendle.finance${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.PENDLE_API_KEY}`,
    },
  });

  const data = await response.json();
  const result = PendleMarketSupportedTokensResponseSchema.safeParse(data);

  if (!result.success) {
    throw new Error(
      `Failed to get Pendle token details. Error: ${data.message}}`
    );
  }

  return result.data;
}
