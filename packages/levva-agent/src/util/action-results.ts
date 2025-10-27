import { State, type IAgentRuntime, type Memory } from "@elizaos/core";
import { selectProviderState } from "src/providers/util";

export interface ActionResult {
  text: string;
  values: Record<string, any>;
  data: Record<string, any>;
  success: boolean;
  error?: Error;
  actionName?: string;
}

export interface ActionResultsCache {
  values: { actionResults: ActionResult[] };
  data: {
    actionResults: ActionResult[];
    actionPlan?: { totalSteps: number; steps: { status: string } };
  };
  text: string;
}

type ActionState = ActionResultsCache["data"];

/**
 * Retrieves previous action results from the runtime state cache
 * @param runtime - The agent runtime instance
 * @param message - The current message to get previous results for
 * @param state - The current state
 * @returns Array of previous action results or empty array if none found
 */
export async function getPreviousActionResults(
  runtime: IAgentRuntime,
  message: Memory,
  state?: State
): Promise<ActionResult[]> {
  if (!message.id) {
    return [];
  }

  let result: ActionState | undefined;

  if (state) {
    const actionState = selectProviderState<ActionState>("ACTION_STATE", state);
    result = actionState;
  }

  const cacheKey = `${message.id}_action_results`;

  if (!result) {
    result =
      // @ts-expect-error - stateCache exists on runtime but not in interface
      (runtime.stateCache.get(cacheKey) as ActionResultsCache | undefined)
        ?.data;
  }

  return result?.actionResults ?? [];
}

/**
 * Gets the last action result of a specific type
 * @param runtime - The agent runtime instance
 * @param message - The current message
 * @param state - The current state
 * @param actionName - The action name to filter by (optional)
 * @returns The last matching action result or undefined
 */
export async function getLastActionResult(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  _actionName?: string
): Promise<ActionResult | undefined> {
  const results = await getPreviousActionResults(runtime, message, state);

  /* if (actionName) {
    return results.filter((result) => result.actionName === actionName).pop(); // Get the last one
  } */

  return results.pop(); // Get the last result regardless of action
}

/**
 * Checks if a specific action was executed in the previous results
 * @param runtime - The agent runtime instance
 * @param message - The current message
 * @param actionName - The action name to check for
 * @returns True if the action was executed, false otherwise
 */
export async function hasPreviousAction(
  runtime: IAgentRuntime,
  message: Memory,
  actionName: string
): Promise<boolean> {
  const results = await getPreviousActionResults(runtime, message);
  return results.some((result) => result.actionName === actionName);
}

/**
 * Gets formatted context from previous REPLY actions to avoid repetition
 * @param runtime - The agent runtime instance
 * @param message - The current message
 * @returns Formatted context string or empty string
 */
export async function getPreviousReplyContext(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined
): Promise<string> {
  const lastReply = await getLastActionResult(runtime, message, state, "REPLY");

  if (lastReply?.text && lastReply.success) {
    return `\n\nPrevious context: ${lastReply.text}`;
  }

  return "";
}
