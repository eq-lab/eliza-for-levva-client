import { ProviderResult, State, IAgentRuntime } from "@elizaos/core";
import { ActionResultsCache } from "../util";

export const EMPTY_RESULT: ProviderResult = {};

export const selectProviderState = <T>(
  name: string,
  state?: State
): T | undefined => {
  if (!state?.data?.providers) {
    return undefined;
  }

  const provider = state.data.providers[name];
  console.log(`[${name}] Provider state`, provider);

  if (!provider) {
    return undefined;
  }

  return (provider as { data: T })?.data;
};

/**
 * Checks if provider should return simple reply mode based on action state
 * @param runtime - Agent runtime for logging
 * @param state - Provider state
 * @param providerName - Name of the provider for logging (e.g., "SWAP-PARAMS")
 * @param dataDescription - Brief description of provider data (e.g., "Swap analysis data")
 * @returns Simple reply result if shouldSimpleReply is true, undefined otherwise
 */
export const checkSimpleReply = (
  runtime: IAgentRuntime,
  state: State | undefined,
  providerName: string,
  dataDescription: string
): ProviderResult | undefined => {
  const actionState = selectProviderState<ActionResultsCache["data"]>(
    "ACTION_STATE",
    state
  );

  console.log("Simple reply check", state?.data.actionPlan);

  const shouldSimpleReply = !actionState?.actionPlan?.steps;
  runtime.logger.debug(`[${providerName}] Should simple reply`, {
    shouldSimpleReply,
  });

  if (shouldSimpleReply) {
    return {
      ...EMPTY_RESULT,
      text: `# Simple Reply Mode\n${dataDescription} is not needed for the current response. Focus on the user's primary request and provide a natural conversational reply without referencing ${dataDescription.toLowerCase().replace(" data", "")}-specific information.`,
    };
  }

  return undefined;
};
