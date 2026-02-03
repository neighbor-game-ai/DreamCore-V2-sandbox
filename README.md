# DreamCore V2

AI-powered browser game creation platform. Create 2D/3D games through natural language chat.

**Domain:** v2.dreamcore.gg (planned)

## Overview

DreamCore V2 is the next-generation game creation platform that allows anyone to create browser games simply by chatting with AI.

> "Programming knowledge zero - just talk about your ideas and your game is complete"

### What's New in V2

| Feature | V1 | V2 |
|---------|----|----|
| AI Engine | Gemini API | Claude CLI (higher quality) |
| Version Control | None | Git (per-project) |
| Sandbox Isolation | None | AI-generated code runs in isolated iframe |
| Authentication | Anonymous | Supabase Auth (Google OAuth) |
| Scalability | Limited | Container-based (future) |

### Phase 1: Creator (Current)

- Game creation (Claude CLI)
- Preview (sandbox iframe)
- Project save/load (GCE persistent disk)
- **No publishing** - "Publishing coming soon" message

### Phase 2: Player Sandbox (Planned)

- Game publishing (play.v2.dreamcore.gg)
- Game gallery
- Player Sandbox (CSP, separate domain)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, WebSocket, HTML5 |
| Backend | Node.js, Express |
| AI | Claude CLI, Gemini Flash 2.0 |
| Authentication | Supabase Auth (Google OAuth) |
| Database | SQLite (local) / Supabase PostgreSQL (production) |
| Storage | GCE Persistent Disk (primary) / GCS (backup) |
| Image Processing | Sharp |
| Version Control | Git (per-project) |

## Quick Start

### Prerequisites

- Node.js >= 18
- Git
- Claude CLI installed and configured
- Supabase project (for production)
- Gemini API Key

### Installation

```bash
# Clone the repository
cd DreamCore-V2

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env and add your API keys

# Start the server
npm start
```

### Access

Open http://localhost:3000 in your browser.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes* | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes* | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes* | Supabase service role key (server only) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GCS_PROJECT_ID` | No | GCP project ID (for backup) |
| `REPLICATE_API_TOKEN` | No | Replicate API token (for background removal) |

## Project Structure

```
DreamCore-V2/
├── server/                    # Backend
│   ├── index.js              # Main server (Express + WebSocket)
│   ├── config.js             # Configuration (NEW)
│   ├── supabaseClient.js     # Supabase client (NEW)
│   ├── authMiddleware.js     # Auth middleware (NEW)
│   ├── claudeRunner.js       # AI processing core
│   ├── geminiClient.js       # Gemini API client
│   ├── database.js           # SQLite management
│   ├── userManager.js        # User/project/Git management
│   ├── jobManager.js         # Async job management
│   └── prompts/              # Prompt templates
├── public/                   # Frontend
│   ├── index.html            # Landing page
│   ├── create.html           # Game creation page
│   ├── editor.html           # Game editor
│   ├── app.js                # Client-side logic
│   └── style.css             # Styles
├── supabase/                 # Supabase config (NEW)
│   └── migrations/           # SQL migrations
│       └── 001_initial_schema.sql
├── users/                    # User data
│   └── {userId}/
│       ├── projects/
│       │   └── {projectId}/
│       │       ├── index.html    # Generated game
│       │       └── specs/        # Game specifications
│       └── assets/               # User assets
├── data/                     # Database (gitignored)
│   └── dreamcore-v2.db       # SQLite database
├── .claude/                  # Claude Code configuration
│   ├── plans/                # Design documents
│   ├── logs/                 # Work logs
│   └── docs/                 # Technical documentation
└── CLAUDE.md                 # Project rules and guidelines
```

## Authentication Flow

### Production (Supabase Auth)

```
1. User visits v2.dreamcore.gg
2. Click "Sign in with Google"
3. Supabase Auth handles OAuth flow
4. JWT stored in browser
5. All API requests include JWT
6. Server validates JWT via Supabase
```

## Storage Architecture

### Unified Path Structure

```
/data/users/{userId}/projects/{projectId}/  - Project files
/data/users/{userId}/assets/                - User assets
/data/assets/global/                        - Global assets
```

### Backup Strategy

```
GCE Persistent Disk (Primary)
         │
         ▼ (async backup)
    GCS Bucket (Backup)
```

- Normal reads: GCE Persistent Disk only
- GCS is backup-only, not read during normal operation
- Disaster recovery: Manual restore from GCS

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Authentication > Providers > Google
3. Enable Google OAuth and configure credentials
4. Run the migration SQL in SQL Editor:
   - `supabase/migrations/001_initial_schema.sql`
5. Copy credentials to `.env`

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with auto-reload (--watch) |

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/callback` | OAuth callback |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create new project |
| GET | `/api/projects/:id` | Get project details |
| DELETE | `/api/projects/:id` | Delete project |

### Game Files

| Method | Path | Description |
|--------|------|-------------|
| GET | `/game/:userId/:projectId/*` | Serve game files |
| GET | `/api/projects/:id/code` | Get project HTML |

## Architecture

```
Browser ←→ WebSocket ←→ Express Server
    │                        │
    │                   ┌────┴────┐
    │                   ▼         ▼
    │              authMiddleware supabaseClient
    │                   │
    ▼                   ▼
 localStorage      Supabase Auth
 (JWT)                 │
                       ▼
            ┌──────────┼──────────┐
            ▼          ▼          ▼
       claudeRunner  userManager  database
       (Claude CLI)  (Git ops)    (SQLite)
            │          │          │
            ▼          ▼          ▼
      Anthropic   /data/users     data/*.db
        API
```

## Security

### API Key Protection (Modal Sandbox)

API keys are **never** placed inside Modal Sandbox to prevent prompt injection attacks from leaking credentials.

```
Modal Sandbox (NO API keys)
├── ANTHROPIC_BASE_URL → GCE api-proxy → api.anthropic.com
└── GEMINI_BASE_URL    → GCE api-proxy → googleapis.com
```

The GCE api-proxy injects API keys server-side, so the Sandbox only knows proxy URLs with path secrets (not API keys).

See `.claude/plans/api-key-proxy.md` for implementation details.

### Preview Sandbox

```html
<iframe
  srcdoc="..."
  sandbox="allow-scripts"
></iframe>
```

- `allow-same-origin` NOT set → No access to parent's cookies/localStorage
- Only user's own code runs in their preview

### Path Traversal Protection

All file paths are validated:
1. UUID format check
2. `path.resolve` normalization
3. `startsWith` base directory check

## Migration from V1

V2 is completely independent from V1:
- Separate Supabase instance
- Separate storage
- Same Google account can access both
- No data migration needed

## Development

### Local Development

```bash
# Without Supabase (legacy mode)
npm run dev

# With Supabase (full auth)
# Set SUPABASE_* variables in .env
npm run dev
```

### Database

SQLite database is created automatically at `data/dreamcore-v2.db` on first run.

### Git Versioning

Each project has its own Git repository for version history.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Design](./.claude/plans/sandbox-architecture.md) | V2 Architecture (detailed) |
| [Database Schema](./.claude/docs/database-schema.md) | Database design |
| [Auth Migration](./.claude/plans/auth-migration.md) | Authentication documentation |
| [CLI Deploy Architecture](./docs/CLI-ARCHITECTURE.md) | CLI deploy/update architecture |

## Troubleshooting

### Common Issues

**Supabase connection failed**
- Verify `SUPABASE_URL` and keys in `.env`
- Check Supabase project status

**Port 3000 already in use**
```bash
lsof -i :3000
kill -9 <PID>
```

**Database locked**
- Ensure only one server instance is running
- Check for zombie processes

**Claude CLI not working**
- Ensure Claude CLI is installed: `claude --version`
- Check API key configuration

## License

Private / Proprietary

---

*DreamCore V2 - Making game creation accessible to everyone*
