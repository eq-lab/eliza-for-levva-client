interface RawMetadata {
  raw?: {
    channelId?: string;
    metadata?: {
      userAddressId?: string;
      chainId?: number;
    };
  };
}

export const hasRawMetadata = (metadata: any): metadata is RawMetadata => {
  return metadata && typeof metadata === "object" && "raw" in metadata;
};
