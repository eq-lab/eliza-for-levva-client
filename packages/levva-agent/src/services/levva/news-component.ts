import { IAgentRuntime, ServiceType } from "@elizaos/core";
import { BackgroundQueue } from "./background-queue";
import { BrowserService, PageContent } from "../browser";
import { getFeed, getFeedItemId, getLatestNews, onFeedItem } from "./news";
import { Mutex } from "../../util/async";

export class NewsServiceComponent extends BackgroundQueue<PageContent> {
  // RSS feed URLs
  private RSS_FEEDS = ["https://cryptopanic.com/news/rss/"];

  // Mutex for browser operations
  private mutex = new Mutex();

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  cleanup() {
    // Cleanup base queue functionality
    this.cleanupQueue();

    this.runtime.logger.info("NewsServiceComponent cleanup completed");
  }

  // Implementation of abstract method from BackgroundQueue
  protected onBackgroundResolved = async (event: {
    id: string;
    value: PageContent;
  }) => {
    // All events in this queue are news items
    await onFeedItem(this.runtime, event.id, event.value);
  };

  /**
   * Fetch a single RSS feed and process its items
   */
  async fetchFeed(url: string): Promise<void> {
    const browser = await this.runtime.getService<BrowserService>(
      ServiceType.BROWSER
    );

    if (!browser) {
      throw new Error("Browser service not found");
    }

    try {
      this.runtime.logger.info(`Fetching feed: ${url}`);
      const items = await getFeed(this.runtime, url);

      await Promise.all(
        items.map((item) => {
          const id = getFeedItemId(item.link);

          return this.inBackground(
            id,
            async () =>
              // Use mutex to prevent concurrent browser operations
              this.mutex.runExclusive(() =>
                browser.getPageContent(item.link, this.runtime, 1000)
              ),
            5000
          );
        })
      );
    } catch (error) {
      this.runtime.logger.error("Failed to fetch feed", error);
    }
  }

  /**
   * Fetch all configured RSS feeds and return latest news
   */
  async getCryptoNews(limit?: number) {
    await Promise.allSettled(this.RSS_FEEDS.map((url) => this.fetchFeed(url)));
    return getLatestNews(this.runtime, limit);
  }

  /**
   * Add a new RSS feed URL
   */
  addFeed(url: string): void {
    if (!this.RSS_FEEDS.includes(url)) {
      this.RSS_FEEDS.push(url);
      this.runtime.logger.info(`Added RSS feed: ${url}`);
    }
  }

  /**
   * Remove an RSS feed URL
   */
  removeFeed(url: string): void {
    const index = this.RSS_FEEDS.indexOf(url);
    if (index > -1) {
      this.RSS_FEEDS.splice(index, 1);
      this.runtime.logger.info(`Removed RSS feed: ${url}`);
    }
  }

  /**
   * Get all configured RSS feed URLs
   */
  getFeeds(): string[] {
    return [...this.RSS_FEEDS];
  }

  /**
   * Cancel fetching a specific news item by URL
   */
  cancelNewsItem(url: string): boolean {
    const id = getFeedItemId(url);
    return this.cancelTask(id, `News item fetch cancelled: ${url}`);
  }
}
