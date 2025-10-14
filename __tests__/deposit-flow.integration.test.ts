import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupChatTest,
  teardownChatTest,
  sendMessageAndWaitForComplete,
  ChatTestContext,
} from "./chat/setup";

describe("Deposit Flow Integration", () => {
  let context: ChatTestContext;

  beforeAll(async () => {
    context = await setupChatTest();
  });

  afterAll(() => {
    teardownChatTest(context);
  });

  it("should extract amount correctly when user says '1'", async () => {
    // Step 1: Ask to deposit
    const messages1 = await sendMessageAndWaitForComplete(
      context,
      "I want to deposit into the maximized long-term growth strategy"
    );

    const lastResponse1 = messages1[messages1.length - 1];
    console.log("Response 1 (last):", lastResponse1.text);
    console.log("Response 1 (all):", messages1.map((m) => m.text).join(" | "));
    expect(lastResponse1.text).toBeDefined();

    // Step 2: User says "1" as the amount
    const messages2 = await sendMessageAndWaitForComplete(context, "1");

    const lastResponse2 = messages2[messages2.length - 1];
    console.log("Response 2 (last):", lastResponse2.text);
    console.log("Response 2 (all):", messages2.map((m) => m.text).join(" | "));
    expect(lastResponse2.text).toBeDefined();

    // Step 3: Next response - should NOT ask for amount again
    const messages3 = await sendMessageAndWaitForComplete(
      context,
      "yes I'm ready"
    );

    const lastResponse3 = messages3[messages3.length - 1];
    console.log("Response 3 (last):", lastResponse3.text);
    console.log("Response 3 (all):", messages3.map((m) => m.text).join(" | "));

    // The bug: response should NOT ask "How much USDC do you wish to invest" again
    // It should proceed with the transaction or ask for confirmation
    const allText3 = messages3
      .map((m) => m.text)
      .join(" ")
      .toLowerCase();
    expect(allText3).not.toContain("how much usdc do you wish");
    expect(allText3).not.toContain("enter an amount");
  }, 60000);

  it("should log extracted parameters in deposit intent", async () => {
    // Step 1: Initiate deposit with explicit amount
    const messages1 = await sendMessageAndWaitForComplete(
      context,
      "deposit 1 USDC into brave strategy"
    );

    const lastResponse1 = messages1[messages1.length - 1];
    console.log("Direct deposit response 1 (last):", lastResponse1.text);
    console.log(
      "Direct deposit response 1 (all):",
      messages1.map((m) => m.text).join(" | ")
    );

    // Step 2: Confirm
    const messages2 = await sendMessageAndWaitForComplete(
      context,
      "yes proceed"
    );

    const lastResponse2 = messages2[messages2.length - 1];
    console.log("Direct deposit response 2 (last):", lastResponse2.text);
    console.log(
      "Direct deposit response 2 (all):",
      messages2.map((m) => m.text).join(" | ")
    );

    // Should not ask for more info if amount was extracted
    const allText2 = messages2
      .map((m) => m.text)
      .join(" ")
      .toLowerCase();
    expect(allText2).not.toContain("how much");
    expect(allText2).not.toContain("enter an amount");
  }, 60000);

});
