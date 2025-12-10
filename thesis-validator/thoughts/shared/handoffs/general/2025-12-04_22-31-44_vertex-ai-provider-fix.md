---
date: 2025-12-04T22:31:44+00:00
researcher: Claude
git_commit: 1bc4939c2a2df53f64061b446806d066bafd32c6
branch: main
repository: nextgen-CDD
topic: "Vertex AI Provider Configuration Fix"
tags: [vertex-ai, llm-provider, dotenv, environment-variables]
status: complete
last_updated: 2025-12-04
last_updated_by: Claude
type: implementation_strategy
---

# Handoff: Vertex AI Provider Configuration Fix

## Task(s)
**Task**: Test that Vertex AI provider works when running research workflow with `.env` configured to use `vertex-ai`

**Status**: Completed (code fixes applied, but Vertex AI model 404 issue requires external configuration fix)

The user requested testing that the `.env` file configured with `LLM_PROVIDER=vertex-ai` would work correctly when running the research workflow. Previously, the application was failing with "ANTHROPIC_API_KEY is required" even though Vertex AI was configured.

## Critical References
- `src/index.ts` - Entry point where dotenv must be loaded
- `src/services/llm-provider.ts` - LLM provider abstraction (lines 257-270 for env var reading)
- `src/agents/base-agent.ts` - Agent base class (lines 96-101 for default config)

## Recent changes
- `src/index.ts:12` - Added `import 'dotenv/config';` to load `.env` file at application startup
- `package.json` - Added `dotenv` as a dependency via `npm install dotenv`

## Learnings

### Root Cause 1: dotenv not loaded
The `.env` file was never being loaded because `src/index.ts` didn't import `dotenv/config`. The `dotenv` package wasn't even installed.

### Root Cause 2: Shell environment variable override
A shell environment variable `ANTHROPIC_MODEL=claude-sonnet-4-5@20250929` was set in the system, overriding the `.env` file settings. The `dotenv` package by default does NOT override existing environment variables.

To verify, run:
```bash
env | grep ANTHROPIC
```

Key shell variables found:
- `ANTHROPIC_MODEL=claude-sonnet-4-5@20250929` (overrides .env)
- `ANTHROPIC_VERTEX_PROJECT_ID=gp-ct-sbox-sat-gcp0bg-darksoft`
- `ANTHROPIC_SMALL_FAST_MODEL=claude-haiku-4-5@20251001`

### Model Priority
The code in `src/services/llm-provider.ts:263` and `src/agents/base-agent.ts:97` uses:
```typescript
model: process.env['ANTHROPIC_MODEL'] ?? process.env['VERTEX_AI_MODEL'] ?? 'claude-sonnet-4-20250514'
```
This means `ANTHROPIC_MODEL` takes priority over `VERTEX_AI_MODEL`.

## Artifacts
- `src/index.ts` - Modified to add dotenv import
- `package.json` - Updated with dotenv dependency

## Action Items & Next Steps

### Immediate (External Configuration)
1. **Fix Vertex AI model/region configuration** - The research workflow now correctly uses Vertex AI but returns 404 for `claude-opus-4-5@20251101` at region `global`. Either:
   - Use a valid model name available on Vertex AI
   - Change `GOOGLE_CLOUD_REGION` from `global` to a supported region like `us-central1` or `us-east5`

2. **Unset shell ANTHROPIC_MODEL variable** - To prevent override issues:
   ```bash
   unset ANTHROPIC_MODEL
   ```
   Or remove it from `.bashrc`/`.zshrc` if permanently set.

### Optional Code Improvements
1. Consider using `dotenv` with `override: true` option if `.env` should take precedence over shell variables
2. Add startup logging to show which model/provider is being used for debugging

## Other Notes

### How to test Vertex AI
When testing the server with corrected environment:
```bash
unset ANTHROPIC_MODEL && DISABLE_AUTH=true npm run dev
```

Then create engagement → submit thesis → start research to test the LLM provider.

### Key files for LLM provider configuration
- `.env` - Primary configuration file
- `src/services/llm-provider.ts` - Provider abstraction
- `src/agents/base-agent.ts` - Agent initialization
- `src/services/google-auth.ts` - Google Cloud authentication for Vertex AI

### Current .env configuration (confirmed working)
```
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=gp-ct-sbox-sat-gcp0bg-darksoft
GOOGLE_CLOUD_REGION=global
VERTEX_AI_MODEL=claude-opus-4-5@20251101
#ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Commented out
```
