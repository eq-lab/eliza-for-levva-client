import { LEVVA_API_V1_BASEURL, LEVVA_API_V2_BASEURL } from "./constants";
import {
  strategiesResponseSchema,
  userPositionsResponseSchema,
  withdrawalRequestsResponseSchema,
} from "./schema";

// todo config
export const getStrategies = async (chainId: number) => {
  const url = `${LEVVA_API_V1_BASEURL}/strategies?PublicChainId=${chainId}`;
  const response = await fetch(url);
  const data = await response.json();
  return strategiesResponseSchema.safeParse(data);
};

export const getUserPositions = async (address: `0x${string}`) => {
  const url = `${LEVVA_API_V1_BASEURL}/strategies/user-positions/${address}`;
  const response = await fetch(url);
  const data = await response.json();
  return userPositionsResponseSchema.safeParse(data);
};

export const getWithdrawalRequests = async (
  address: `0x${string}`,
  chainId: number = 1
) => {
  const url = `${LEVVA_API_V2_BASEURL}/vaults/${chainId}/withdrawal-requests/${address}`;
  const response = await fetch(url);
  const data = await response.json();
  return withdrawalRequestsResponseSchema.safeParse(data);
};
