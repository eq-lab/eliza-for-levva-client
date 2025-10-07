/**
 * Prompt for generating summaries of scraped web page content
 */

export const generateWebPageSummaryPrompt = (text: string): string => {
  return `Please generate a concise summary for the following text:
  
    Text: """
    ${text}
    """
  
    Respond with a JSON object in the following format:
    \`\`\`json
    {
      "title": "Generated Title",
      "summary": "Generated summary and/or description of the text"
    }
    \`\`\``;
};
