import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { IKVStore } from "@elizaos/core";

interface Session {
  id: string;
  agentId: string;
  channelId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  renewalCount: number;
  timeoutConfig: {
    timeoutMinutes?: number;
    autoRenew?: boolean;
    maxDurationMinutes?: number;
    warningThresholdMinutes?: number;
  };
}

class MockSessionStore implements IKVStore<Session> {
  private store = new Map<string, { value: Session; ttl?: number; setAt: number }>();
  public setCallHistory: Array<{ key: string; value: Session; ttl?: number }> = [];

  async get(key: string): Promise<Session | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // Simulate TTL expiration
    if (entry.ttl) {
      const elapsed = Date.now() - entry.setAt;
      if (elapsed > entry.ttl) {
        this.store.delete(key);
        return undefined;
      }
    }

    return entry.value;
  }

  async set(key: string, value: Session, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      ttl: ttlMs,
      setAt: Date.now(),
    });
    this.setCallHistory.push({ key, value, ttl: ttlMs });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async *entries(): AsyncGenerator<[string, Session]> {
    for (const [key, { value }] of this.store.entries()) {
      yield [key, value];
    }
  }

  clearHistory() {
    this.setCallHistory = [];
  }

  getStoreSize() {
    return this.store.size;
  }
}

describe("Session Storage with TTL", () => {
  let sessionStore: MockSessionStore;

  beforeEach(() => {
    sessionStore = new MockSessionStore();
  });

  describe("Session TTL Calculation", () => {
    it("should calculate TTL based on expiration time", () => {
      const now = Date.now();
      const expiresAt = new Date(now + 3600000); // 1 hour from now
      const ttl = expiresAt.getTime() - now;

      expect(ttl).toBeGreaterThan(3599000);
      expect(ttl).toBeLessThanOrEqual(3600000);
    });

    it("should use minimum TTL of 1 second for immediate expiration", () => {
      const now = Date.now();
      const expiresAt = new Date(now - 1000); // Already expired
      const ttl = Math.max(expiresAt.getTime() - now, 1000);

      expect(ttl).toBe(1000);
    });

    it("should handle session with custom timeout", () => {
      const now = Date.now();
      const timeoutMinutes = 30;
      const expiresAt = new Date(now + timeoutMinutes * 60 * 1000);
      const ttl = expiresAt.getTime() - now;

      expect(ttl).toBeGreaterThan(1799000);
      expect(ttl).toBeLessThanOrEqual(1800000);
    });
  });

  describe("Session Storage with TTL", () => {
    it("should store session with calculated TTL", async () => {
      const sessionId = "session-123";
      const expiresAt = new Date(Date.now() + 3600000);

      const session: Session = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt,
        renewalCount: 0,
        timeoutConfig: {
          timeoutMinutes: 60,
          autoRenew: true,
        },
      };

      const ttl = Math.max(expiresAt.getTime() - Date.now(), 1000);
      await sessionStore.set(sessionId, session, ttl);

      expect(sessionStore.setCallHistory.length).toBe(1);
      expect(sessionStore.setCallHistory[0].ttl).toBeGreaterThan(0);
      expect(sessionStore.setCallHistory[0].ttl).toBeLessThanOrEqual(3600000);
    });

    it("should store multiple sessions with different TTLs", async () => {
      const sessions = [
        { id: "session-1", timeout: 30 * 60 * 1000 },
        { id: "session-2", timeout: 60 * 60 * 1000 },
        { id: "session-3", timeout: 120 * 60 * 1000 },
      ];

      for (const { id, timeout } of sessions) {
        const expiresAt = new Date(Date.now() + timeout);
        const session: Session = {
          id,
          agentId: "agent-123",
          channelId: `channel-${id}`,
          userId: "user-123",
          createdAt: new Date(),
          lastActivity: new Date(),
          expiresAt,
          renewalCount: 0,
          timeoutConfig: {},
        };

        const ttl = Math.max(expiresAt.getTime() - Date.now(), 1000);
        await sessionStore.set(id, session, ttl);
      }

      expect(sessionStore.setCallHistory.length).toBe(3);
      expect(sessionStore.setCallHistory[0].ttl).toBeLessThan(
        sessionStore.setCallHistory[1].ttl!
      );
      expect(sessionStore.setCallHistory[1].ttl).toBeLessThan(
        sessionStore.setCallHistory[2].ttl!
      );
    });

    it("should handle session retrieval before expiration", async () => {
      const sessionId = "session-123";
      const expiresAt = new Date(Date.now() + 5000); // 5 seconds

      const session: Session = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt,
        renewalCount: 0,
        timeoutConfig: {},
      };

      const ttl = Math.max(expiresAt.getTime() - Date.now(), 1000);
      await sessionStore.set(sessionId, session, ttl);

      const retrieved = await sessionStore.get(sessionId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(sessionId);
    });

    it("should simulate session expiration after TTL", async () => {
      const sessionId = "session-expired";
      const expiresAt = new Date(Date.now() + 100); // 100ms

      const session: Session = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt,
        renewalCount: 0,
        timeoutConfig: {},
      };

      await sessionStore.set(sessionId, session, 100);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const retrieved = await sessionStore.get(sessionId);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("Session Renewal with TTL Update", () => {
    it("should update TTL when session is renewed", async () => {
      const sessionId = "session-123";
      const initialExpiry = new Date(Date.now() + 1800000); // 30 minutes

      const initialSession: Session = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: initialExpiry,
        renewalCount: 0,
        timeoutConfig: { autoRenew: true },
      };

      await sessionStore.set(
        sessionId,
        initialSession,
        Math.max(initialExpiry.getTime() - Date.now(), 1000)
      );

      // Renew session
      const newExpiry = new Date(Date.now() + 3600000); // 60 minutes
      const renewedSession: Session = {
        ...initialSession,
        lastActivity: new Date(),
        expiresAt: newExpiry,
        renewalCount: 1,
      };

      await sessionStore.set(
        sessionId,
        renewedSession,
        Math.max(newExpiry.getTime() - Date.now(), 1000)
      );

      expect(sessionStore.setCallHistory.length).toBe(2);
      expect(sessionStore.setCallHistory[1].ttl).toBeGreaterThan(
        sessionStore.setCallHistory[0].ttl!
      );
    });

    it("should handle multiple session renewals", async () => {
      const sessionId = "session-multi-renew";
      let currentExpiry = new Date(Date.now() + 1800000);

      const baseSession: Omit<Session, "lastActivity" | "expiresAt" | "renewalCount"> = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date(),
        timeoutConfig: { autoRenew: true },
      };

      // Initial creation
      await sessionStore.set(
        sessionId,
        {
          ...baseSession,
          lastActivity: new Date(),
          expiresAt: currentExpiry,
          renewalCount: 0,
        },
        Math.max(currentExpiry.getTime() - Date.now(), 1000)
      );

      // Renew 3 times
      for (let i = 1; i <= 3; i++) {
        currentExpiry = new Date(Date.now() + 1800000 * (i + 1));
        await sessionStore.set(
          sessionId,
          {
            ...baseSession,
            lastActivity: new Date(),
            expiresAt: currentExpiry,
            renewalCount: i,
          },
          Math.max(currentExpiry.getTime() - Date.now(), 1000)
        );
      }

      expect(sessionStore.setCallHistory.length).toBe(4);
      expect(sessionStore.setCallHistory[3].value.renewalCount).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle session with past expiration date", async () => {
      const sessionId = "session-past";
      const pastExpiry = new Date(Date.now() - 10000); // 10 seconds ago

      const session: Session = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: pastExpiry,
        renewalCount: 0,
        timeoutConfig: {},
      };

      // TTL should be minimum 1 second
      const ttl = Math.max(pastExpiry.getTime() - Date.now(), 1000);
      await sessionStore.set(sessionId, session, ttl);

      expect(sessionStore.setCallHistory[0].ttl).toBe(1000);
    });

    it("should handle very long session timeout", async () => {
      const sessionId = "session-long";
      const longExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const session: Session = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: longExpiry,
        renewalCount: 0,
        timeoutConfig: { maxDurationMinutes: 10080 },
      };

      const ttl = Math.max(longExpiry.getTime() - Date.now(), 1000);
      await sessionStore.set(sessionId, session, ttl);

      expect(sessionStore.setCallHistory[0].ttl).toBeGreaterThan(604800000); // 7 days in ms
    });

    it("should handle concurrent session updates with TTL", async () => {
      const sessionIds = Array.from({ length: 10 }, (_, i) => `session-${i}`);

      const promises = sessionIds.map((id, index) => {
        const expiresAt = new Date(Date.now() + (index + 1) * 600000); // Varying expiries
        const session: Session = {
          id,
          agentId: "agent-123",
          channelId: `channel-${id}`,
          userId: "user-123",
          createdAt: new Date(),
          lastActivity: new Date(),
          expiresAt,
          renewalCount: 0,
          timeoutConfig: {},
        };

        const ttl = Math.max(expiresAt.getTime() - Date.now(), 1000);
        return sessionStore.set(id, session, ttl);
      });

      await Promise.all(promises);

      expect(sessionStore.setCallHistory.length).toBe(10);
    });

    it("should preserve session data structure with TTL", async () => {
      const sessionId = "session-complex";
      const expiresAt = new Date(Date.now() + 3600000);

      const complexSession: Session = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        lastActivity: new Date("2024-01-01T01:00:00Z"),
        expiresAt,
        renewalCount: 5,
        timeoutConfig: {
          timeoutMinutes: 60,
          autoRenew: true,
          maxDurationMinutes: 1440,
          warningThresholdMinutes: 15,
        },
      };

      const ttl = Math.max(expiresAt.getTime() - Date.now(), 1000);
      await sessionStore.set(sessionId, complexSession, ttl);

      const retrieved = await sessionStore.get(sessionId);
      expect(retrieved?.timeoutConfig.timeoutMinutes).toBe(60);
      expect(retrieved?.renewalCount).toBe(5);
    });
  });

  describe("Session Cleanup Behavior", () => {
    it("should allow cleanup of expired sessions", async () => {
      const sessionId = "session-cleanup";
      const shortExpiry = new Date(Date.now() + 50);

      const session: Session = {
        id: sessionId,
        agentId: "agent-123",
        channelId: "channel-123",
        userId: "user-123",
        createdAt: new Date(),
        lastActivity: new Date(),
        expiresAt: shortExpiry,
        renewalCount: 0,
        timeoutConfig: {},
      };

      await sessionStore.set(sessionId, session, 50);

      expect(sessionStore.getStoreSize()).toBe(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try to get expired session (should be cleaned up)
      const retrieved = await sessionStore.get(sessionId);
      expect(retrieved).toBeUndefined();
    });
  });
});