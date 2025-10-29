/**
 * Prompt for generating summaries of scraped web page content
 *
 * @version 2.0.0
 * @lastModified 2025-01-29
 * @changes v2.0.0: Migrated to Zod schema for structured output
 * @changes v1.0.0: Initial implementation with plain JSON template
 */

import { z } from "zod";
import { formatZodKeys, formatZodOutput } from "./util";

/** Zod schema for web page summary */
export const webPageSummarySchema = z
  .object({
    title: z
      .string()
      .describe(
        "Generated title for the web page content. " +
          "Should be concise and descriptive."
      ),
    summary: z
      .string()
      .describe(
        "Generated summary and/or description of the text. " +
          "Should capture the main points and key information."
      ),
  })
  .describe("Web page summary with title and description");

/** Web page summary type inferred from Zod schema */
export type WebPageSummary = z.infer<typeof webPageSummarySchema>;

export const generateWebPageSummaryPrompt = (text: string): string => {
  return `<task>
Generate a concise summary for the following web page content.
</task>
<text>
${text}
</text>
<instructions>
Analyze the provided text and generate:
1. **Title**: A concise, descriptive title that captures the main topic
2. **Summary**: A clear summary of the key information and main points

Keep the summary focused and informative, highlighting the most important details.
</instructions>
<keys>
${formatZodKeys(webPageSummarySchema)}
</keys>
<output>
${formatZodOutput(webPageSummarySchema)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
