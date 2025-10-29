import {
  ModelType,
  ModelTypeName,
  type Content,
  type IAgentRuntime,
  type State,
} from "@elizaos/core";
import {
  rephraseContentPrompt,
  rephraseSchema,
  RephrasedContent,
} from "../prompts/rephrase";
import { zodJsonSchema } from "../prompts/util";

interface RephraseParams {
  runtime: IAgentRuntime;
  content: Content;
  state?: State;
  model?: ModelTypeName;
  prevActions?: string;
  skipRephrase?: boolean;
}

export const rephrase = async ({
  runtime,
  content,
  state,
  model,
  prevActions,
  skipRephrase = false,
}: RephraseParams) => {
  const {
    actions,
    attachments,
    text: initialText,
    thought: initialThought,
    source,
  } = content;

  // Skip LLM rephrasing if flag is set (preserves exact content like position data)
  if (skipRephrase) {
    runtime.logger.debug(
      "[REPHRASE] Skipping rephrase - preserving original content"
    );
    return content;
  }

  try {
    // Use new consistent prompt format
    const agentName = runtime.character?.name || "Agent";
    const providers = state?.providers;

    const prompt = rephraseContentPrompt({
      agentName,
      providers,
      initialThought: initialThought || "",
      initialText: initialText || "",
      prevActions,
    });

    const response = await runtime.useModel(model ?? ModelType.OBJECT_SMALL, {
      prompt,
      schema: zodJsonSchema(rephraseSchema),
      temperature: 0,
    });

    // Response is already typed correctly with structured output
    const parsedResponse = response as RephrasedContent;

    runtime.logger.debug(
      "Rephrase result:",
      JSON.stringify({ initialText, initialThought, parsedResponse }, null, 2)
    );

    const result: Content = {
      actions,
      attachments,
      text: parsedResponse.message || initialText || "",
      thought: parsedResponse.thought || initialThought || "",
      source,
    };

    return result;
  } catch (error) {
    runtime.logger.error("Error in rephrase function:", error);

    // Fallback to original content on error
    return {
      actions,
      attachments,
      text: initialText || "",
      thought: initialThought || "",
      source,
    };
  }
};
