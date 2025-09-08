import {
  ModelType,
  ModelTypeName,
  type Content,
  type IAgentRuntime,
  type State,
} from "@elizaos/core";
import {
  rephraseContentPrompt,
  ExtractedDataForRephrase,
} from "../prompts/rephrase";

interface RephraseParams {
  runtime: IAgentRuntime;
  content: Content;
  state: State;
  model?: ModelTypeName;
  prevActions?: string;
}

export const rephrase = async ({
  runtime,
  content,
  state,
  model,
  prevActions,
}: RephraseParams) => {
  const {
    actions,
    attachments,
    text: initialText,
    thought: initialThought,
    source,
  } = content;

  try {
    // Use new consistent prompt format
    const agentName = runtime.character?.name || "Agent";
    const providers = state.providers || "";

    const prompt = rephraseContentPrompt({
      agentName,
      providers,
      initialThought: initialThought || "",
      initialText: initialText || "",
      prevActions,
    });

    const response = await runtime.useModel(
      model ?? ModelType.OBJECT_SMALL,
      prompt
    );

    // Parse LLM response - OBJECT_SMALL should return structured JSON
    let parsedResponse: ExtractedDataForRephrase;
    if (typeof response === "object" && response !== null) {
      parsedResponse = response as ExtractedDataForRephrase;
    } else {
      // Fallback parsing if response is still a string
      const cleanResponse = response.toString().trim();
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]) as ExtractedDataForRephrase;
      } else {
        runtime.logger.warn(
          "Failed to parse rephrase response, using fallback"
        );
        parsedResponse = {
          thought: initialThought || "Rephrasing content",
          message: initialText || "I understand.",
        };
      }
    }

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
