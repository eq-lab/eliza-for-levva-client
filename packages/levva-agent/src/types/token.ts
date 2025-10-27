import { SwapInfo } from "./swap";

export type TokenData = {
  address?: `0x${string}`;
  decimals: number;
  symbol: string;
  name: string;
};

export interface TokenInfo {
  swap?: SwapInfo;
  allowanceSlot?: `0x${string}`;
}

export interface TokenDataWithInfo extends TokenData {
  info?: TokenInfo;
}
