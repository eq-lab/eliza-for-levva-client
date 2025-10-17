import { describe, it, beforeAll, afterAll } from "vitest";
import {
  setupChatTest,
  teardownChatTest,
  sendMessageAndWaitForComplete,
  TEST_CONFIG,
  type ChatTestContext,
} from "./chat/setup";

describe("Deposit Intent - Strategy Type Race Condition", () => {
  let context: ChatTestContext;

  beforeAll(async () => {
    context = await setupChatTest();
  });

  afterAll(() => {
    teardownChatTest(context);
  });

  it("should preserve strategy.type across 10 deposit attempts", async () => {
    const results: Array<{ run: number; success: boolean; error?: string }> =
      [];

    for (let i = 1; i <= 10; i++) {
      console.log(`\n=== RUN ${i}/10 ===`);

      try {
        // CORRECT: Use BOTH cleanup endpoints before each attempt
        // 1. Cleanup channel state (intents, memories)
        await context.client.levva.cleanupChannel(
          context.channelId,
          context.userId
        );

        // 2. Clear suggestion cache
        await context.client.levva.clearSuggestions(
          TEST_CONFIG.address,
          TEST_CONFIG.chainId
        );

        // Send deposit message
        const response = await sendMessageAndWaitForComplete(
          context,
          "Please deposit 0.25 USDC into Brave strategy"
        );

        // Check for the error
        const hasTypeError = response.some((msg) =>
          msg.text?.includes("Unsupported strategy type: undefined")
        );

        if (hasTypeError) {
          console.error(`❌ RUN ${i}: Type error detected!`);
          results.push({ run: i, success: false, error: "Type undefined" });
        } else {
          console.log(`✅ RUN ${i}: No type error`);
          results.push({ run: i, success: true });
        }

        // Small delay between runs
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ RUN ${i}: Exception:`, error);
        results.push({
          run: i,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Report results
    const failures = results.filter((r) => !r.success);
    console.log(`\n=== RESULTS ===`);
    console.log(`Total runs: ${results.length}`);
    console.log(`Successes: ${results.filter((r) => r.success).length}`);
    console.log(`Failures: ${failures.length}`);

    if (failures.length > 0) {
      console.log(`Failed runs:`, failures);
      console.log(
        `\n✅ Successfully reproduced the intermittent issue in ${failures.length} run(s)`
      );
    } else {
      console.log(
        `\n⚠️  Could not reproduce issue in 10 runs - may need more attempts`
      );
    }
  }, 120000); // 2 minute timeout for 10 runs
});
