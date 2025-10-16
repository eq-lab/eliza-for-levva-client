# Agent Client Library

A flexible, adapter-based HTTP client for ElizaOS agents with Levva protocol support.

## Features

- **Adapter Pattern**: Use fetch (default), axios, or custom HTTP clients
- **Standard ElizaOS APIs**: Agents, messaging, channels
- **Levva-Specific APIs**: Suggestions, calldata, cleanup
- **TypeScript**: Full type safety and IntelliSense support
- **No Hard Dependencies**: Bring your own HTTP client (fetch, axios, etc.)
- **Extensible**: Easy to add custom adapters

## Installation

This client is designed to be copied into your project:

```bash
cp -r __tests__/utils/client /path/to/your/project/
```

**Dependencies** (install in your project):
```bash
npm install @elizaos/core
# or
bun add @elizaos/core

# Optional: for axios adapter
npm install axios
# or
bun add axios
```

## Quick Start

### Basic Usage (Fetch - Default)

```typescript
import { AgentClient } from './client';

const client = AgentClient.create({
  baseUrl: 'http://localhost:3001',
  timeout: 30000,
});

// Standard ElizaOS APIs
const agents = await client.agents.listAgents();
const messages = await client.messaging.getChannelMessages(channelId);

// Levva-specific APIs
const suggestions = await client.levva.getSuggestions(address, channelId, chainId);
const status = await client.levva.getStatus(address);
```

### Using Axios Adapter

```typescript
import axios from 'axios';
import { AgentClient, AxiosAdapter } from './client';

const client = AgentClient.create({
  baseUrl: 'http://localhost:3001',
  adapter: new AxiosAdapter(axios),
});
```

### Using Custom Axios Instance

```typescript
import axios from 'axios';
import { AgentClient, AxiosAdapter } from './client';

const customAxios = axios.create({
  baseURL: 'http://localhost:3001',
  timeout: 30000,
  headers: {
    'X-Custom-Header': 'value',
  },
});

const client = AgentClient.create({
  baseUrl: 'http://localhost:3001',
  adapter: new AxiosAdapter(customAxios),
});
```

## Architecture

```
client/
├── adapters/           # HTTP adapters
│   ├── types.ts       # Adapter interfaces
│   ├── fetch.ts       # Fetch adapter (default)
│   ├── axios.ts       # Axios adapter
│   └── index.ts
├── eliza/             # Standard ElizaOS APIs
│   ├── types.ts       # ElizaOS type definitions
│   ├── agents.ts      # Agents service
│   ├── messaging.ts   # Messaging service
│   └── index.ts
├── levva.ts           # Levva-specific APIs
├── base-client.ts     # Base API client with adapter support
├── client.ts          # Main client aggregator
├── index.ts           # Public exports
└── README.md          # This file
```

## API Reference

### Standard ElizaOS APIs

#### Agents Service

```typescript
// List all agents
const { agents } = await client.agents.listAgents();

// Get specific agent
const agent = await client.agents.getAgent(agentId);
```

#### Messaging Service

```typescript
// Get or create DM channel
const channel = await client.messaging.getOrCreateDmChannel({
  participantIds: [userId1, userId2],
});

// Get channel messages
const { messages } = await client.messaging.getChannelMessages(channelId, {
  limit: 50,
  before: new Date(),
});

// Clear channel history
const { deleted } = await client.messaging.clearChannelHistory(channelId);
```

### Levva-Specific APIs

```typescript
// Get user ID by address
const { id } = await client.levva.getUserId({ 
  address: '0x...', 
  secret: 'api-secret' 
});

// Get channel by name
const channel = await client.levva.getChannelByName('channel-name');

// Get context-aware suggestions
const { suggestions } = await client.levva.getSuggestions(
  address,
  channelId,
  chainId
);

// Get calldata from attachment
const calldata = await client.levva.getCalldata({ 
  url: '/api/levva/calldata?hash=...' 
});

// Check agent status
const { ready } = await client.levva.getStatus(address);

// Cleanup channel state
const result = await client.levva.cleanupChannel(channelId, userId);
```

## Custom Adapters

You can create custom adapters for other HTTP clients:

```typescript
import { HttpAdapter, HttpRequestConfig, HttpResponse } from './adapters';

class MyCustomAdapter implements HttpAdapter {
  async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    // Implement using your preferred HTTP client
    const response = await myHttpClient.request({
      method: config.method,
      url: config.url,
      headers: config.headers,
      body: config.body,
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      ok: response.status >= 200 && response.status < 300,
    };
  }
}

// Use it
const client = AgentClient.create({
  baseUrl: 'http://localhost:3001',
  adapter: new MyCustomAdapter(),
});
```

## Error Handling

The client throws `ApiError` instances with structured information:

```typescript
import { ApiError } from './client';

try {
  await client.levva.getStatus(address);
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API Error:', {
      code: error.code,        // e.g., 'NETWORK_ERROR', 'TIMEOUT'
      message: error.message,  // Human-readable message
      status: error.status,    // HTTP status code (if applicable)
      details: error.details,  // Additional error details
    });
  }
}
```

## Testing

See `example.ts` for complete usage examples including:
- Basic fetch usage
- Axios adapter usage
- Complete Levva workflow
- Error handling patterns

## TypeScript Support

All APIs are fully typed with TypeScript:

```typescript
import type { 
  Agent, 
  Message, 
  Suggestion,
  CalldataWithDescription 
} from './client';

// Full IntelliSense and type checking
const agents: Agent[] = (await client.agents.listAgents()).agents;
const messages: Message[] = (await client.messaging.getChannelMessages(channelId)).messages;
```

## Configuration Options

```typescript
interface ApiClientConfig {
  baseUrl: string;              // Base URL of the ElizaOS server
  apiKey?: string;              // Optional API key (added as X-API-KEY header)
  timeout?: number;             // Request timeout in ms (default: 30000)
  headers?: Record<string, string>; // Additional default headers
  adapter?: HttpAdapter;        // HTTP adapter (default: FetchAdapter)
}
```

## License

MIT - Part of eliza-for-levva-client project



