# Thesis Validator

A multi-agent AI system for private equity commercial and technical due diligence. Thesis Validator helps investment teams validate, pressure-test, and learn from investment theses using specialized AI agents.

**Last Updated:** 2025-12-12

## Overview

Thesis Validator automates and enhances the due diligence process by deploying a team of specialized AI agents that work together to:

- **Build and refine investment hypotheses** from initial thesis documents
- **Gather and validate evidence** from multiple sources (web, documents, market data)
- **Identify contradictions** and risks in the investment thesis
- **Find comparable companies** and market benchmarks
- **Synthesize expert insights** from call transcripts and interviews
- **Stress-test assumptions** with rigorous analysis
- **Track research quality metrics** across the diligence process

The system maintains persistent memory across deals, learning from past analyses to improve future diligence efforts.

## Project Structure

This is a monorepo with three main applications:

```
nextgen-CDD/
├── thesis-validator/     # Backend API & AI agents (Fastify + TypeScript)
├── dashboard-ui/         # Web frontend (React + Vite + TailwindCSS)
├── tui-client/           # Terminal UI client (React Ink)
└── docs/                 # Documentation
    ├── deployment.md     # GCP deployment guide
    └── local-deployment.md  # Local development guide
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  Client Applications                                  │
├─────────────────────────────┬─────────────────────────┬─────────────────────────────┤
│      Dashboard UI           │        TUI Client       │        API Direct           │
│   (React + Vite + Tailwind) │     (React Ink CLI)     │     (curl / Postman)        │
│      localhost:5173         │       Terminal          │                             │
└──────────────┬──────────────┴───────────┬─────────────┴──────────────┬──────────────┘
               │                          │                            │
               │                   REST / WebSocket                    │
               │                          │                            │
┌──────────────▼──────────────────────────▼────────────────────────────▼──────────────┐
│                              Thesis Validator API                                    │
│                            (Fastify + JWT + WebSocket)                               │
│                                localhost:3000                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  API Endpoints:                                                                      │
│  ├── /api/v1/engagements      - Deal/engagement management                          │
│  ├── /api/v1/hypotheses       - Hypothesis CRUD & generation                        │
│  ├── /api/v1/evidence         - Evidence collection & search                        │
│  ├── /api/v1/contradictions   - Contradiction detection & resolution                │
│  ├── /api/v1/stress-tests     - Stress testing workflow                             │
│  ├── /api/v1/metrics          - Research quality metrics                            │
│  ├── /api/v1/skills           - Skill library management                            │
│  └── /api/v1/research         - Research workflow execution                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                   AI Agents                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │  Conductor  │──│  Hypothesis │──│  Evidence   │──│  Contradiction              │ │
│  │    Agent    │  │   Builder   │  │  Gatherer   │  │     Hunter                  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐                                                   │
│  │ Comparables │  │   Expert    │                                                   │
│  │   Finder    │  │ Synthesizer │                                                   │
│  └─────────────┘  └─────────────┘                                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                 Workflows                                            │
│  ┌───────────────┐  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │   Research    │  │  Stress Test   │  │   Expert Call   │  │    Closeout      │   │
│  │   Workflow    │  │   Workflow     │  │    Workflow     │  │    Workflow      │   │
│  └───────────────┘  └────────────────┘  └─────────────────┘  └──────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                Memory Layer                                          │
│  ┌───────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │   Deal    │  │Institutional │  │   Market   │  │ Reflexion │  │    Skills     │  │
│  │  Memory   │  │   Memory     │  │Intelligence│  │   Store   │  │   Library     │  │
│  └───────────┘  └──────────────┘  └────────────┘  └───────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                               Infrastructure                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────────────────────┐ │
│  │    Claude    │  │    Redis     │  │ PostgreSQL │  │      Vector Store          │ │
│  │ (Anthropic   │  │   (BullMQ    │  │     16     │  │      (Ruvector)            │ │
│  │ or Vertex AI)│  │    Queue)    │  │            │  │                            │ │
│  └──────────────┘  └──────────────┘  └────────────┘  └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Features

### AI Agents

| Agent | Purpose |
|-------|---------|
| **Conductor** | Orchestrates the overall diligence workflow and coordinates other agents |
| **Hypothesis Builder** | Breaks down investment theses into testable hypotheses |
| **Evidence Gatherer** | Collects and validates evidence from multiple sources |
| **Contradiction Hunter** | Identifies inconsistencies and risks in the thesis |
| **Comparables Finder** | Discovers comparable companies and market benchmarks |
| **Expert Synthesizer** | Extracts insights from expert calls and interviews |

### Workflows

| Workflow | Description |
|----------|-------------|
| **Research Workflow** | Comprehensive research and evidence gathering with real-time progress streaming |
| **Stress Test Workflow** | Rigorous assumption testing and vulnerability analysis (light/moderate/aggressive) |
| **Expert Call Workflow** | Processing and synthesizing expert interviews and call transcripts |
| **Closeout Workflow** | Final report generation and findings consolidation |

### Memory Systems

| Memory Type | Purpose |
|-------------|---------|
| **Deal Memory** | Per-deal context, hypotheses, evidence, and contradictions |
| **Institutional Memory** | Cross-deal learnings and pattern recognition |
| **Market Intelligence** | Industry data, trends, and benchmarks |
| **Reflexion Store** | Agent self-improvement and error correction |
| **Skill Library** | Reusable analytical patterns (market sizing, competitive analysis, etc.) |

### Tools & Integrations

| Tool | Purpose |
|------|---------|
| **Web Search** | Tavily-powered web research |
| **Document Parser** | PDF, DOCX, XLSX, and text extraction |
| **Transcript Processor** | Expert call transcript analysis |
| **Credibility Scorer** | Source reliability assessment |
| **Embeddings** | OpenAI text-embedding-3-large for semantic search |
| **Market Data** | Alpha Vantage financial data integration |
| **OCR** | Tesseract.js for image text extraction |

## Tech Stack

### Backend (`thesis-validator/`)

| Technology | Purpose |
|------------|---------|
| Node.js 20+ | Runtime |
| TypeScript | Language (strict mode, ESM) |
| Fastify 4 | Web framework |
| Claude (Anthropic SDK or Vertex AI) | AI reasoning |
| PostgreSQL 16 | Primary database |
| Redis 7 + BullMQ | Cache and job queue |
| Ruvector | Vector store for semantic search |
| Zod | Schema validation |

### Web Frontend (`dashboard-ui/`)

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| Vite 7 | Build tool |
| TailwindCSS 4 | Styling |
| React Query (TanStack) | Server state management |
| ReactFlow | Hypothesis tree visualization |
| Recharts | Data visualization |
| Zustand | Client state management |

### Terminal UI (`tui-client/`)

| Technology | Purpose |
|------------|---------|
| React Ink | Terminal UI framework |
| Commander | CLI argument parsing |
| Axios | HTTP client |
| WebSocket | Real-time updates |

## Client Applications

### Dashboard UI (Web)

Full-featured web interface with:

- **Engagement Management** - Create, view, and manage due diligence engagements
- **Hypothesis Visualization** - Interactive tree view of investment hypotheses with ReactFlow
- **Evidence Browser** - Search, filter, and view gathered evidence with quality charts
- **Contradiction Management** - Track and resolve contradictions with severity ratings
- **Stress Test Dashboard** - Run and visualize stress test results
- **Research Metrics** - Quality gauges and historical trend charts
- **Skills Library** - Browse and execute analytical skills
- **Real-time Updates** - WebSocket-powered progress streaming

### TUI Client (Terminal)

Feature-rich terminal interface with 9 interactive tabs:

| Tab | Features |
|-----|----------|
| **Engagements** | List, create, view engagements with keyboard navigation |
| **Hypotheses** | Browse hypotheses, view evidence links, confidence scores |
| **Evidence** | Search and filter evidence, view credibility scores |
| **Contradictions** | View contradictions by severity, resolution status |
| **Documents** | Upload documents, view processing status |
| **Research** | Start research workflows, monitor progress |
| **Stress Tests** | Run stress tests, view vulnerability analysis |
| **Skills** | Browse skill library, execute with parameter collection |
| **Monitor** | Real-time system monitoring and WebSocket events |

**Running the TUI:**
```bash
cd tui-client
npm install
npm run dev -- --server http://localhost:3000
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- API Keys:
  - Anthropic API key (or GCP project with Vertex AI enabled)
  - OpenAI API key (for embeddings)
  - Tavily API key (for web search)

### Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-org/nextgen-CDD.git
   cd nextgen-CDD
   ```

2. **Start infrastructure**

   ```bash
   cd thesis-validator
   docker-compose up -d redis postgres
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Install dependencies and start backend**

   ```bash
   npm install
   npm run db:init      # Initialize database
   npm run seed:skills  # Seed skill library
   npm run dev          # Start development server (port 3000)
   ```

5. **Start web frontend** (new terminal)

   ```bash
   cd dashboard-ui
   npm install
   npm run dev          # Start Vite dev server (port 5173)
   ```

6. **Or start TUI client** (new terminal)

   ```bash
   cd tui-client
   npm install
   npm run dev -- --server http://localhost:3000
   ```

7. **Access the application**
   - Web Dashboard: http://localhost:5173
   - Backend API: http://localhost:3000
   - Health Check: http://localhost:3000/health

## API Reference

### REST Endpoints

#### Engagements
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/engagements` | List all engagements |
| `POST` | `/api/v1/engagements` | Create new engagement |
| `GET` | `/api/v1/engagements/:id` | Get engagement details |
| `PATCH` | `/api/v1/engagements/:id` | Update engagement |
| `DELETE` | `/api/v1/engagements/:id` | Delete engagement |

#### Hypotheses
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/engagements/:id/hypotheses` | List hypotheses |
| `POST` | `/api/v1/engagements/:id/hypotheses` | Create hypothesis |
| `GET` | `/api/v1/engagements/:id/hypotheses/:hid` | Get hypothesis |
| `PATCH` | `/api/v1/engagements/:id/hypotheses/:hid` | Update hypothesis |
| `DELETE` | `/api/v1/engagements/:id/hypotheses/:hid` | Delete hypothesis |
| `POST` | `/api/v1/engagements/:id/hypotheses/generate` | AI-generate hypotheses |

#### Evidence
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/engagements/:id/evidence` | List evidence |
| `POST` | `/api/v1/engagements/:id/evidence` | Create evidence |
| `GET` | `/api/v1/engagements/:id/evidence/:eid` | Get evidence |
| `PATCH` | `/api/v1/engagements/:id/evidence/:eid` | Update evidence |
| `DELETE` | `/api/v1/engagements/:id/evidence/:eid` | Delete evidence |
| `GET` | `/api/v1/engagements/:id/evidence/search` | Search evidence |

#### Contradictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/engagements/:id/contradictions` | List contradictions |
| `POST` | `/api/v1/engagements/:id/contradictions` | Create contradiction |
| `GET` | `/api/v1/engagements/:id/contradictions/:cid` | Get contradiction |
| `POST` | `/api/v1/engagements/:id/contradictions/:cid/resolve` | Resolve contradiction |
| `POST` | `/api/v1/engagements/:id/contradictions/:cid/critical` | Mark as critical |
| `DELETE` | `/api/v1/engagements/:id/contradictions/:cid` | Delete contradiction |
| `GET` | `/api/v1/engagements/:id/contradictions/stats` | Get contradiction statistics |

#### Stress Tests
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/engagements/:id/stress-tests` | List stress tests |
| `POST` | `/api/v1/engagements/:id/stress-tests` | Run new stress test |
| `GET` | `/api/v1/engagements/:id/stress-tests/:tid` | Get stress test results |
| `DELETE` | `/api/v1/engagements/:id/stress-tests/:tid` | Delete stress test |
| `GET` | `/api/v1/engagements/:id/stress-tests/stats` | Get stress test statistics |

#### Metrics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/engagements/:id/metrics` | Get current metrics |
| `POST` | `/api/v1/engagements/:id/metrics/calculate` | Recalculate metrics |
| `GET` | `/api/v1/engagements/:id/metrics/history` | Get metric history |

#### Skills
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/skills` | List all skills |
| `GET` | `/api/v1/skills/:id` | Get skill details |
| `POST` | `/api/v1/skills/:id/execute` | Execute a skill |

#### Research
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/engagements/:id/research/start` | Start research workflow |
| `GET` | `/api/v1/engagements/:id/research/status` | Get research status |
| `POST` | `/api/v1/engagements/:id/research/stop` | Stop research workflow |

### WebSocket Events

Connect to `/ws` for real-time updates:

| Event | Description |
|-------|-------------|
| `agent:status` | Agent status changes (started, completed, failed) |
| `evidence:found` | New evidence discovered during research |
| `hypothesis:updated` | Hypothesis confidence changes |
| `workflow:progress` | Workflow step completion |
| `research:complete` | Research workflow finished |
| `stress-test:progress` | Stress test progress updates |

## Development Commands

### Backend (`thesis-validator/`)

```bash
npm run dev          # Start with hot reload (tsx watch)
npm run build        # Compile TypeScript
npm run start        # Run production build
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode
npm run test:coverage # With coverage
npm run typecheck    # Type-check only
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format with Prettier
npm run db:init      # Initialize database schemas
npm run db:migrate   # Run database migrations
npm run seed:skills  # Seed skill library
npm run benchmark    # Run performance benchmarks
```

### Web Frontend (`dashboard-ui/`)

```bash
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Production build
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### TUI Client (`tui-client/`)

```bash
npm run dev          # Start TUI in development mode
npm run dev:watch    # Start with file watching
npm run build        # Compile TypeScript
npm run start        # Run compiled version
npm run typecheck    # Type-check only
```

## Configuration

### Environment Variables

Create a `.env` file in `thesis-validator/` based on `.env.example`:

```bash
# LLM Provider (choose one)
LLM_PROVIDER=anthropic              # or 'vertex-ai'
ANTHROPIC_API_KEY=sk-ant-...        # Required if using anthropic
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Vertex AI (if LLM_PROVIDER=vertex-ai)
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_CLOUD_REGION=us-central1

# Required APIs
OPENAI_API_KEY=sk-...               # For embeddings
TAVILY_API_KEY=tvly-...             # For web search

# Infrastructure
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://thesis_validator:thesis_validator_secret@localhost:5432/thesis_validator

# API Server
API_PORT=3000
API_HOST=0.0.0.0
JWT_SECRET=your-secret-key-at-least-32-chars
CORS_ORIGINS=http://localhost:5173

# Vector Database
RUVECTOR_PATH=./data/ruvector
RUVECTOR_DIMENSIONS=1536

# Feature Flags
ENABLE_REFLEXION_MEMORY=true
ENABLE_SKILL_LIBRARY=true
ENABLE_PROVENANCE_CERTIFICATES=true
ENABLE_REAL_TIME_EXPERT_SUPPORT=true
```

### LLM Provider Options

**Option 1: Direct Anthropic API (recommended for local development)**
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

**Option 2: Google Cloud Vertex AI (recommended for GCP deployment)**
```bash
LLM_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_REGION=us-central1
# Uses Application Default Credentials (ADC)
```

## Deployment

### Local Development

See [docs/local-deployment.md](docs/local-deployment.md) for detailed local setup instructions.

### GCP Production

See [docs/deployment.md](docs/deployment.md) for comprehensive GCP deployment instructions including:

- Cloud Run deployment
- Cloud SQL (PostgreSQL) and Memorystore (Redis) setup
- Secret Manager configuration
- Vertex AI access for Claude
- CI/CD with Cloud Build
- Frontend hosting with Cloud Storage + CDN
- Custom domain and HTTPS setup
- Monitoring and troubleshooting

### Quick Deploy to GCP

```bash
cd thesis-validator

# Build and deploy via Cloud Build
gcloud builds submit --config=cloudbuild.yaml

# Or manual deployment
docker build -t gcr.io/$PROJECT_ID/thesis-validator .
gcloud run deploy thesis-validator --image=gcr.io/$PROJECT_ID/thesis-validator
```

## Testing

```bash
cd thesis-validator
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Generate coverage report
```

Test structure:
```
thesis-validator/tests/
├── setup.ts               # Test setup and mocks
├── models.test.ts         # Schema validation tests
├── e2e/                   # End-to-end tests
└── ...
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Run linting (`npm run lint`)
6. Run type checking (`npm run typecheck`)
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to the branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request

### Code Style

- TypeScript strict mode with `noUncheckedIndexedAccess`
- ESLint + Prettier for formatting
- Conventional commits
- JSDoc comments for public APIs
- Always use `.js` extension in ESM imports

## License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

## Support

For questions or issues, please open a GitHub issue or contact the development team.
