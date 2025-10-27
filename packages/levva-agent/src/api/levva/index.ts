import { LEVVA_API_V1_BASEURL, LEVVA_API_V2_BASEURL } from "./constants";
import {
  strategiesResponseSchema,
  tokenResponseSchema,
  userPositionsResponseSchema,
  withdrawalRequestsResponseSchema,
} from "./schema";

// todo config
export const getStrategies = async (chainId?: number) => {
  const url = `${LEVVA_API_V1_BASEURL}/strategies${chainId ? `?PublicChainId=${chainId}` : ""}`;
  const response = await fetch(url);
  const data = await response.json();
  return strategiesResponseSchema.safeParse(data);
};

export const getUserPositions = async (
  address: `0x${string}`,
  chainId?: number
) => {
  const url = `${LEVVA_API_V1_BASEURL}/strategies/user-positions/${address}${chainId ? `?PublicChainId=${chainId}` : ""}`;
  const response = await fetch(url);
  const data = await response.json();
  return userPositionsResponseSchema.safeParse(data);
};

export const getWithdrawalRequests = async (
  address: `0x${string}`,
  chainId: number
) => {
  const url = `${LEVVA_API_V2_BASEURL}/vaults/${chainId}/withdrawal-requests/${address}`;
  const response = await fetch(url);
  const data = await response.json();
  return withdrawalRequestsResponseSchema.safeParse(data);
};

export const getToken = async (
  tokenAddress: `0x${string}`,
  chainId: number
) => {
  const url = `${LEVVA_API_V1_BASEURL}/token/${chainId}/${tokenAddress}`;
  const response = await fetch(url);
  const data = await response.json();
  return tokenResponseSchema.safeParse(data);
};
