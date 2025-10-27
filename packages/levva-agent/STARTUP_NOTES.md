# Levva Agent Startup Notes

## Build Issue Resolution

### Initial Error
When first attempting to start the agent, there was a tsup build error:
```
Error: Cannot find module './chunk-GZSSIGNC.js'
```

### Solution
This was caused by corrupted node_modules during the initial file copy. Fixed by:
```bash
cd packages/levva-agent
rm -rf node_modules
bun install
```

### Current Status
✅ Build now works correctly
✅ Agent starts successfully despite initial build warning
✅ All intents properly registered (SWAP, SEND, WITHDRAW, DEPOSIT)

## Startup Observations

From your terminal output, the agent IS working correctly:

1. **Intents Registered**: ✅
   - SWAP for domain SWAP_TOKENS
   - SEND for domain ANALYZE_WALLET
   - WITHDRAW for domain MANAGE_POSITIONS
   - DEPOSIT for domain MANAGE_POSITIONS

2. **Project Loading**: ✅
   - Loaded from /Users/alex/eliza/packages/levva-agent/src/index.ts
   - Character "Levvski" loaded successfully
   - 1 agent found in configuration

3. **Database Initialization**: ✅
   - Consolidated database initialized
   - Migrations running for @elizaos/plugin-sql
   - Using Postgres from .env file

4. **Configuration**: ✅
   - .env file detected at correct location
   - POSTGRES_URL configured
   - Monorepo root detected properly

## Build Warning Explanation

The warning "Build failed, but continuing with start" appears because:
- The CLI tries to build before starting
- It uses the pre-built dist/ files if build fails
- Since we now have a successful build, future starts should not show this warning

## Verification Commands

```bash
# Build the package
cd packages/levva-agent
bun run build

# Start from package directory
bun run start

# Start from repository root
cd /Users/alex/eliza
bun run start:levva
```

## Docker

The Dockerfile has been configured to use `start:levva`:
```bash
docker build -t levva-agent .
docker run -p 3001:3001 levva-agent
```
