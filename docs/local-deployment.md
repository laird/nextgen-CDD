# Local Development & Sandbox Deployment Guide

**Last Updated:** 2025-12-11

This guide provides step-by-step instructions for setting up the Thesis Validator application locally for development and testing before deploying to GCP.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Quick Start (5 Minutes)](#quick-start-5-minutes)
- [Detailed Setup Guide](#detailed-setup-guide)
  - [1. Clone and Configure](#1-clone-and-configure)
  - [2. Obtain API Keys](#2-obtain-api-keys)
  - [3. Infrastructure Setup](#3-infrastructure-setup)
  - [4. Backend Setup](#4-backend-setup)
  - [5. Frontend Setup](#5-frontend-setup)
- [Development Workflows](#development-workflows)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Next Steps: GCP Deployment](#next-steps-gcp-deployment)

---

## Prerequisites

### Required Software

| Tool | Version | Purpose | Installation |
|------|---------|---------|--------------|
| **Node.js** | 20+ | JavaScript runtime | [nodejs.org](https://nodejs.org/) or `nvm install 20` |
| **Docker** | 24+ | Container runtime | [docker.com](https://docs.docker.com/get-docker/) |
| **Docker Compose** | 2.20+ | Multi-container orchestration | Included with Docker Desktop |
| **Git** | 2.40+ | Version control | [git-scm.com](https://git-scm.com/) |

### Optional Tools

| Tool | Purpose |
|------|---------|
| **nvm** | Node.js version management |
| **VS Code** | Recommended IDE with TypeScript support |
| **Postman** / **curl** | API testing |
| **pgAdmin** / **DBeaver** | Database management |
| **RedisInsight** | Redis GUI client |

### Required API Keys

You'll need the following API keys before starting:

| Service | Purpose | Where to Get |
|---------|---------|--------------|
| **Anthropic API Key** | Claude LLM (primary AI) | [console.anthropic.com](https://console.anthropic.com/) |
| **OpenAI API Key** | Text embeddings | [platform.openai.com](https://platform.openai.com/) |
| **Tavily API Key** | Web search | [tavily.com](https://tavily.com/) |
| **Alpha Vantage Key** | Financial data (optional) | [alphavantage.co](https://www.alphavantage.co/support/#api-key) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Local Development Stack                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐          ┌───────────────────────────────┐   │
│  │   Dashboard UI       │  ──────▶ │    Thesis Validator API       │   │
│  │  localhost:5173      │  proxy   │    localhost:3000             │   │
│  │  (Vite + React)      │          │    (Fastify + TypeScript)     │   │
│  └──────────────────────┘          └───────────────┬───────────────┘   │
│                                                     │                    │
│                                    ┌────────────────┼────────────────┐  │
│                                    │                │                │  │
│                             ┌──────▼──────┐ ┌──────▼──────┐ ┌───────▼─┐│
│                             │   Redis     │ │ PostgreSQL  │ │ Ruvector││
│                             │   :6379     │ │   :5432     │ │ (local) ││
│                             │  (Docker)   │ │  (Docker)   │ │         ││
│                             └─────────────┘ └─────────────┘ └─────────┘│
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         External Services                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐   │
│  │ Anthropic API │  │  OpenAI API   │  │      Tavily Search        │   │
│  │   (Claude)    │  │ (Embeddings)  │  │     (Web Research)        │   │
│  └───────────────┘  └───────────────┘  └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Overview

| Component | Port | Description |
|-----------|------|-------------|
| **Dashboard UI** | 5173 | React frontend with Vite hot reload |
| **Thesis Validator API** | 3000 | Fastify REST API + WebSocket |
| **PostgreSQL** | 5432 | Primary database for deals, evidence |
| **Redis** | 6379 | Cache, job queue (BullMQ) |
| **Ruvector** | N/A | Local vector store for semantic search |

---

## Quick Start (5 Minutes)

For experienced developers who want to get running fast:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/nextgen-CDD.git
cd nextgen-CDD

# 2. Start infrastructure (Redis + PostgreSQL)
cd thesis-validator
docker-compose up -d redis postgres

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys:
#   - ANTHROPIC_API_KEY=sk-ant-...
#   - OPENAI_API_KEY=sk-...
#   - TAVILY_API_KEY=tvly-...
#   - DISABLE_AUTH=true  (disables JWT for local dev)

# 4. Install dependencies and initialize
npm install
npm run db:init
npm run db:schema    # First install only - creates PostgreSQL tables
npm run db:migrate
npm run seed:skills

# 5. Start backend
npm run dev

# 6. Start frontend (new terminal)
cd ../dashboard-ui
npm install
npm run dev

# 7. Open browser
# Frontend: http://localhost:5173
# API Health: http://localhost:3000/health
```

---

## Detailed Setup Guide

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/nextgen-CDD.git
cd nextgen-CDD

# Verify the structure
ls -la
# Should show:
#   thesis-validator/    # Backend
#   dashboard-ui/        # Frontend
#   docs/                # Documentation
#   README.md
#   EXECUTIVE_SUMMARY.md
```

### 2. Obtain API Keys

#### Anthropic API Key (Required)

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-`)

#### OpenAI API Key (Required for Embeddings)

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** → **Create new secret key**
4. Copy the key (starts with `sk-`)

#### Tavily API Key (Required for Web Search)

1. Go to [tavily.com](https://tavily.com/)
2. Sign up for a free account
3. Navigate to **Dashboard** → **API Keys**
4. Copy your API key (starts with `tvly-`)

#### Alpha Vantage Key (Optional)

1. Go to [alphavantage.co](https://www.alphavantage.co/support/#api-key)
2. Claim your free API key
3. Copy the key for financial data access

### 3. Infrastructure Setup

#### Option A: Docker Compose (Recommended)

```bash
cd thesis-validator

# Start Redis and PostgreSQL only (run backend locally for hot reload)
docker-compose up -d redis postgres

# Verify services are running
docker-compose ps
# NAME                STATUS
# redis               running (healthy)
# postgres            running (healthy)

# Check logs if needed
docker-compose logs redis
docker-compose logs postgres
```

#### Option B: Full Docker Stack

If you want to run everything in Docker (including the backend):

```bash
cd thesis-validator

# Copy environment file
cp .env.example .env
# Edit .env with your API keys

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f thesis-validator
```

#### Option C: Manual Installation (No Docker)

If you prefer not to use Docker:

**PostgreSQL:**
```bash
# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16
createdb thesis_validator

# Ubuntu/Debian
sudo apt install postgresql-16
sudo -u postgres createdb thesis_validator

# Windows (download installer)
# https://www.postgresql.org/download/windows/
```

**Redis:**
```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis

# Windows (WSL recommended, or download)
# https://redis.io/docs/getting-started/installation/install-redis-on-windows/
```

### 4. Backend Setup

```bash
cd thesis-validator

# Install Node.js dependencies
npm install

# Create environment configuration
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# =============================================================================
# LLM Provider - Choose ONE option
# =============================================================================

# Option 1: Direct Anthropic API (Recommended for local dev)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=8192

# Option 2: Vertex AI (For testing GCP integration locally)
# LLM_PROVIDER=vertex-ai
# GOOGLE_CLOUD_PROJECT=your-gcp-project-id
# GOOGLE_CLOUD_REGION=us-central1
# VERTEX_AI_MODEL=claude-sonnet-4-20250514

# =============================================================================
# Required External APIs
# =============================================================================
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key-here
TAVILY_API_KEY=tvly-your-tavily-key-here

# =============================================================================
# Infrastructure (use Docker defaults)
# =============================================================================
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://thesis_validator:thesis_validator_secret@localhost:5432/thesis_validator

# =============================================================================
# API Server Configuration
# =============================================================================
API_PORT=3000
API_HOST=0.0.0.0
JWT_SECRET=local-development-secret-at-least-32-characters-long
CORS_ORIGINS=http://localhost:5173

# =============================================================================
# Authentication (Development Only)
# =============================================================================
# Set to 'true' to disable JWT authentication in development
# This creates a default admin user for all requests
DISABLE_AUTH=true

# =============================================================================
# Vector Database (Ruvector)
# =============================================================================
RUVECTOR_PATH=./data/ruvector
RUVECTOR_DIMENSIONS=1536
RUVECTOR_METRIC=cosine
RUVECTOR_HNSW_M=16
RUVECTOR_HNSW_EF_CONSTRUCTION=200
RUVECTOR_HNSW_EF_SEARCH=100

# =============================================================================
# Feature Flags
# =============================================================================
ENABLE_REFLEXION_MEMORY=true
ENABLE_SKILL_LIBRARY=true
ENABLE_PROVENANCE_CERTIFICATES=true
ENABLE_REAL_TIME_EXPERT_SUPPORT=true
```

#### Initialize the Database

```bash
# Initialize vector database schema
npm run db:init

# Create PostgreSQL tables (FIRST INSTALL ONLY)
# This creates the initial database schema - only run once on fresh installs
npm run db:schema

# Run any pending migrations (run on first install and after updates)
npm run db:migrate

# Seed the skill library with default skills
npm run seed:skills

# (Optional) Run memory migration if upgrading
npm run migrate:memory
```

#### Start the Backend

```bash
# Development mode with hot reload
npm run dev

# You should see:
# [info] Server listening at http://0.0.0.0:3000
```

#### Verify Backend is Running

```bash
# Health check
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2024-..."}
```

### 5. Frontend Setup

Open a new terminal:

```bash
cd dashboard-ui

# Install dependencies
npm install

# Start development server
npm run dev

# You should see:
#   VITE v7.x.x  ready in xxx ms
#   ➜  Local:   http://localhost:5173/
```

The frontend automatically proxies API requests to the backend:
- `/api/*` → `http://localhost:3000/api/*`
- `/ws/*` → `ws://localhost:3000/ws/*`

---

## Development Workflows

### Starting the Full Stack

**Terminal 1 - Infrastructure:**
```bash
cd thesis-validator
docker-compose up -d redis postgres
```

**Terminal 2 - Backend:**
```bash
cd thesis-validator
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd dashboard-ui
npm run dev
```

### Common Development Tasks

#### Type Checking

```bash
cd thesis-validator
npm run typecheck
```

#### Linting

```bash
# Check for issues
cd thesis-validator && npm run lint
cd dashboard-ui && npm run lint

# Auto-fix issues
cd thesis-validator && npm run lint:fix
```

#### Code Formatting

```bash
cd thesis-validator
npm run format
```

#### Database Operations

```bash
cd thesis-validator

# Reinitialize vector database
npm run db:init

# Reseed skill library
npm run seed:skills

# Run performance benchmarks
npm run benchmark
```

### Switching LLM Providers

**To use Anthropic API (default):**
```bash
# In .env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

**To use Vertex AI (GCP):**
```bash
# 1. Authenticate with GCP
gcloud auth application-default login

# 2. Update .env
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_REGION=us-central1

# 3. Restart the backend
npm run dev
```

### Resetting Development Environment

```bash
cd thesis-validator

# Stop all containers
docker-compose down

# Remove all data (fresh start)
docker-compose down -v

# Remove local vector data
rm -rf data/ruvector

# Start fresh
docker-compose up -d redis postgres
npm run db:init
npm run seed:skills
npm run dev
```

---

## Testing

### Running Tests

```bash
cd thesis-validator

# Run all tests once
npm test

# Run tests in watch mode (re-run on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Coverage Thresholds

The project has minimum coverage requirements:
- Statements: 14%
- Branches: 18%
- Functions: 17%
- Lines: 14%

### Test Structure

```
thesis-validator/tests/
├── setup.ts           # Test setup and mocks
├── models.test.ts     # Schema validation tests
└── ...
```

### Testing API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Create a test engagement (requires JWT)
curl -X POST http://localhost:3000/api/v1/engagements \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "companyName": "Test Company",
    "thesis": "Initial investment thesis..."
  }'
```

---

## Troubleshooting

### Common Issues

#### 1. Docker containers won't start

**Symptom:** `docker-compose up` fails or containers exit immediately

**Solutions:**
```bash
# Check Docker is running
docker info

# Check for port conflicts
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Stop conflicting services
brew services stop postgresql
brew services stop redis

# Or use different ports in docker-compose.yml
```

#### 2. Database connection refused

**Symptom:** `ECONNREFUSED 127.0.0.1:5432`

**Solutions:**
```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Ensure DATABASE_URL matches docker-compose credentials
# Default: postgresql://thesis_validator:thesis_validator_secret@localhost:5432/thesis_validator
```

#### 3. Redis connection failed

**Symptom:** `Redis connection error` or `ECONNREFUSED 127.0.0.1:6379`

**Solutions:**
```bash
# Verify Redis is running
docker-compose ps redis

# Test Redis connection
redis-cli ping
# Should return: PONG

# Check Redis logs
docker-compose logs redis
```

#### 4. API key errors

**Symptom:** `Authentication failed` or `Invalid API key`

**Solutions:**
- Verify API keys don't have extra whitespace
- Check keys start with correct prefix:
  - Anthropic: `sk-ant-`
  - OpenAI: `sk-`
  - Tavily: `tvly-`
- Ensure `.env` file is in `thesis-validator/` directory
- Restart the backend after changing `.env`

#### 5. CORS errors in browser

**Symptom:** `Access-Control-Allow-Origin` errors in browser console

**Solutions:**
```bash
# Ensure CORS_ORIGINS in .env includes frontend URL
CORS_ORIGINS=http://localhost:5173

# For multiple origins
CORS_ORIGINS=http://localhost:5173,http://localhost:3001
```

#### 6. Frontend can't reach backend

**Symptom:** Network errors when frontend makes API calls

**Solutions:**
- Verify backend is running on port 3000
- Check Vite proxy configuration in `dashboard-ui/vite.config.ts`
- Try accessing backend directly: `curl http://localhost:3000/health`

#### 7. Node.js version mismatch

**Symptom:** `engines` error or syntax errors

**Solutions:**
```bash
# Check Node version
node --version
# Should be v20.x.x or higher

# Use nvm to switch versions
nvm install 20
nvm use 20
```

#### 8. TypeScript compilation errors

**Symptom:** `tsc` errors during build

**Solutions:**
```bash
# Check for type errors
npm run typecheck

# Clear build artifacts and rebuild
rm -rf dist/
npm run build
```

### Viewing Logs

```bash
# Backend logs (when running with npm run dev)
# Logs appear in the terminal

# Docker container logs
docker-compose logs -f redis
docker-compose logs -f postgres

# All container logs
docker-compose logs -f
```

### Useful Debug Commands

```bash
# Check all running containers
docker ps

# Check Docker resource usage
docker stats

# Inspect PostgreSQL database
docker exec -it thesis-validator-postgres-1 psql -U thesis_validator

# Inspect Redis
docker exec -it thesis-validator-redis-1 redis-cli

# Check Node.js process
ps aux | grep node

# Check what's using a port
lsof -i :3000
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PROVIDER` | Yes | `anthropic` | LLM backend: `anthropic` or `vertex-ai` |
| `ANTHROPIC_API_KEY` | If anthropic | - | Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Claude model to use |
| `GOOGLE_CLOUD_PROJECT` | If vertex-ai | - | GCP project ID |
| `GOOGLE_CLOUD_REGION` | If vertex-ai | `us-central1` | GCP region |
| `EMBEDDING_PROVIDER` | No | `openai` | Embedding provider: `openai` or `vertex-ai` |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for embeddings |
| `TAVILY_API_KEY` | Yes | - | Tavily API key for web search |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |
| `API_PORT` | No | `3000` | API server port |
| `API_HOST` | No | `0.0.0.0` | API server host |
| `JWT_SECRET` | Yes | - | JWT signing secret (32+ chars) |
| `DISABLE_AUTH` | No | `false` | Set to `true` to disable JWT auth (dev only) |
| `CORS_ORIGINS` | No | `*` | Allowed CORS origins |
| `RUVECTOR_PATH` | No | `./data/ruvector` | Vector store path |
| `ENABLE_REFLEXION_MEMORY` | No | `true` | Enable agent reflection |
| `ENABLE_SKILL_LIBRARY` | No | `true` | Enable skill library |

---

## Next Steps: GCP Deployment

Once your local environment is working correctly, you're ready to deploy to GCP:

1. **Review the GCP deployment guide**: [docs/deployment.md](deployment.md)

2. **Set up GCP project**:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Enable required APIs**:
   ```bash
   gcloud services enable \
     run.googleapis.com \
     cloudbuild.googleapis.com \
     artifactregistry.googleapis.com \
     secretmanager.googleapis.com \
     redis.googleapis.com \
     sqladmin.googleapis.com \
     aiplatform.googleapis.com
   ```

4. **Deploy using Cloud Build**:
   ```bash
   cd thesis-validator
   gcloud builds submit --config=cloudbuild.yaml
   ```

### Comparison: Local vs GCP

| Component | Local | GCP |
|-----------|-------|-----|
| LLM | Anthropic API | Vertex AI |
| Database | Docker PostgreSQL | Cloud SQL |
| Cache | Docker Redis | Memorystore |
| Compute | Node.js (local) | Cloud Run |
| Storage | Local filesystem | Cloud Storage |
| Secrets | `.env` file | Secret Manager |
| CDN | N/A | Cloud CDN |

---

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review existing [GitHub Issues](https://github.com/your-org/nextgen-CDD/issues)
- Open a new issue with:
  - Environment details (OS, Node version, Docker version)
  - Steps to reproduce
  - Error messages and logs
