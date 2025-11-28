# Thesis Validator

Agentic Commercial and Technical Diligence Research System for Private Equity Investment Analysis.

## Overview

Thesis Validator is a multi-agent AI system designed to validate, pressure-test, and continuously learn from private equity investment theses. It combines:

- **Multi-Agent Architecture**: Specialized agents for hypothesis building, evidence gathering, contradiction hunting, expert synthesis, and comparables analysis
- **Vector Memory System**: Three-tier memory with deal-specific, institutional, and market intelligence layers
- **Reflexion Pattern**: Continuous learning from past engagements for improved methodologies
- **Real-Time Support**: WebSocket-based expert call assistance with live transcript processing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│  (REST + WebSocket)                                         │
├─────────────────────────────────────────────────────────────┤
│                    Workflow Layer                            │
│  Research │ Stress Test │ Expert Call │ Closeout            │
├─────────────────────────────────────────────────────────────┤
│                     Agent Layer                              │
│  Conductor │ Hypothesis │ Evidence │ Contradiction │ Expert │
├─────────────────────────────────────────────────────────────┤
│                    Memory Layer                              │
│  Deal Memory │ Institutional Memory │ Market Intelligence   │
├─────────────────────────────────────────────────────────────┤
│                     Tools Layer                              │
│  Embedding │ Web Search │ Doc Parser │ Credibility │ Trans  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Anthropic API Key
- OpenAI API Key
- Tavily API Key (for web search)

### Installation

```bash
# Clone the repository
cd thesis-validator

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your API keys

# Start infrastructure (Ruvector, Redis)
docker-compose up -d

# Initialize database
npm run db:init

# Seed skill library
npm run seed:skills

# Start the server
npm run dev
```

### Running Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
npm start
```

## API Endpoints

### Engagements

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/engagements` | Create new engagement |
| GET | `/api/v1/engagements` | List engagements |
| GET | `/api/v1/engagements/:id` | Get engagement details |
| PATCH | `/api/v1/engagements/:id` | Update engagement |
| POST | `/api/v1/engagements/:id/thesis` | Submit investment thesis |

### Research

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/research/:id/research` | Start research workflow |
| GET | `/api/v1/research/:id/hypothesis-tree` | Get hypothesis tree |
| POST | `/api/v1/research/:id/stress-test` | Run stress test |
| GET | `/api/v1/research/:id/report` | Generate report |

### Evidence

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/:id/evidence` | List evidence |
| POST | `/api/v1/:id/evidence` | Add evidence |
| GET | `/api/v1/:id/contradictions` | List contradictions |
| POST | `/api/v1/:id/documents` | Upload document |

### Skills

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/skills` | List skills |
| POST | `/api/v1/skills` | Create skill |
| POST | `/api/v1/skills/:id/execute` | Execute skill |
| GET | `/api/v1/skills/comparables` | Search comparables |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host/engagements/:id/events` | Real-time events |
| `ws://host/engagements/:id/expert-call` | Expert call assistance |

## Agent Architecture

### Conductor Agent
Orchestrates workflow execution, task decomposition, and agent coordination.

### Hypothesis Builder Agent
Decomposes investment theses into testable, atomic hypotheses with causal relationships.

### Evidence Gatherer Agent
Systematically collects evidence from web sources, documents, and databases.

### Contradiction Hunter Agent
Actively seeks disconfirming evidence and alternative interpretations.

### Expert Synthesizer Agent
Processes expert call transcripts to extract insights and validate hypotheses.

### Comparables Finder Agent
Identifies analogous deals and applicable frameworks from institutional memory.

## Memory System

### Deal Memory
Per-engagement isolated storage for:
- Hypothesis trees
- Evidence nodes
- Transcripts
- Documents

### Institutional Memory
Cross-deal knowledge including:
- Thesis patterns (success/failure)
- Sector knowledge
- Methodology templates
- Reflexion episodes

### Market Intelligence
Real-time market signals with temporal decay:
- News and trends
- Regulatory changes
- Competitive dynamics
- Macro indicators

## Configuration

### Environment Variables

```bash
# API Keys
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=...

# Server
API_HOST=0.0.0.0
API_PORT=3000

# Database
RUVECTOR_HOST=localhost
RUVECTOR_PORT=6333

# Security
JWT_SECRET=your-secret-key
```

## Development

### Project Structure

```
thesis-validator/
├── src/
│   ├── models/          # Data models and schemas
│   ├── memory/          # Vector memory layer
│   ├── tools/           # External integrations
│   ├── agents/          # AI agents
│   ├── workflows/       # Business workflows
│   ├── api/             # REST & WebSocket API
│   └── config/          # Configuration
├── scripts/             # Utility scripts
├── tests/               # Test suites
└── docker-compose.yml   # Infrastructure
```

### Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run db:init      # Initialize database
npm run seed:skills  # Seed skill library
npm run benchmark    # Run benchmarks
```

## License

Proprietary - All rights reserved.
