export interface CalldataWithDescription {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
  title: string;
  description: string;
  optional?: boolean;
}
