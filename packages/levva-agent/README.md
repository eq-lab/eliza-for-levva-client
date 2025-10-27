# Levva Agent

This is the Levva Agent for ElizaOS, providing advanced DeFi capabilities and integrations.

## Features

- Comprehensive DeFi action support (swap, deposit, withdraw, send)
- Integration with Levva API for portfolio management
- Advanced position tracking and strategy management
- Browser automation for protocol interactions
- Real-time market data and news providers
- Comprehensive testing setup with unit and integration tests

## Getting Started

From the root of the monorepo:

```bash
# Install dependencies
bun install

# Start the Levva Agent
bun run start:levva
```

## Development

```bash
# Start development server with debug logging
bun run dev

# Build the package
bun run build

# Run tests
bun run test
```

## Testing

The Levva Agent includes extensive test coverage:

### Test Structure

- **Unit Tests** (`__tests__/*.test.ts`):
  - Test individual components in isolation
  - Run with: `bun run test:unit`

- **Integration Tests** (`__tests__/*.integration.test.ts`):
  - Test interactions between components
  - Run with: `bun run test:integration`

- **End-to-End Tests** (`e2e/` directory):
  - Test the complete agent in a live runtime
  - Run with: `bun run test:e2e`

### Running Tests

```bash
# Run all tests
bun run test

# Run specific test suites
bun run test:unit
bun run test:integration
bun run test:chat
bun run test:suggestions

# Run with coverage
bun run test:coverage

# Watch mode for development
bun run test:watch
```

## Configuration

The agent is configured through:

- `src/index.ts` - Main entry point
- `src/plugin.ts` - Plugin configuration
- Environment variables in `.env` file

## Architecture

The Levva Agent is built on ElizaOS's plugin architecture and includes:

- **Actions**: DeFi operations (swap, deposit, withdraw, send, strategy management)
- **Providers**: Real-time data feeds (positions, market data, news)
- **Services**: Long-running services (browser automation, intent management, Levva API)
- **Evaluators**: Post-interaction processing (suggestions, intent acknowledgment)
- **Routes**: HTTP endpoints for external integrations

## Scripts

```bash
# Start the agent
bun run start

# Development mode with hot reload
bun run dev

# Debug with inspector
bun run debug

# Type checking
bun run type-check

# Build for production
bun run build

# Linting
bun run lint
bun run lint:fix
bun run lint:check

# Code formatting
bun run format
bun run format:check

# Fetch token data
bun run fetch-tokens
```

## Docker

The main Dockerfile at the repository root is configured to run the Levva Agent:

```bash
# Build and run with Docker
docker build -t levva-agent .
docker run -p 3000:3000 levva-agent
```

## Contributing

Please ensure all tests pass before submitting changes:

```bash
bun run check  # Runs lint, format check, and unit tests
```
