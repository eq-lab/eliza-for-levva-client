import { IAgentRuntime, Service, Content } from "@elizaos/core";
import { LEVVA_SERVICE } from "../constants/enum";

const DAILY_MESSAGE_LIMIT = 30;

export class MessageRateLimiter extends Service {
  static serviceType = LEVVA_SERVICE.MESSAGE_RATE_LIMITER;
  capabilityDescription = "In-memory message rate limiting service";

  private userCounts = new Map<string, { count: number; date: string }>();

  static async start(runtime: IAgentRuntime): Promise<MessageRateLimiter> {
    return new MessageRateLimiter(runtime);
  }

  async stop(): Promise<void> {
    this.userCounts.clear();
  }

  async checkMessageLimit(userId: string): Promise<{
    result: boolean;
    reason?: Content;
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const userCount = this.userCounts.get(userId);

    if (userCount?.date !== today) {
      this.userCounts.set(userId, { count: 1, date: today });
      return { result: true };
    }

    const newCount = userCount.count + 1;
    this.userCounts.set(userId, { count: newCount, date: today });

    if (newCount > DAILY_MESSAGE_LIMIT) {
      return {
        result: false,
        reason: {
          type: "text",
          text: `Daily message limit of ${DAILY_MESSAGE_LIMIT} reached. Limit resets tomorrow.`,
        },
      };
    }

    return { result: true };
  }
}
