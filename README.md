# Fieldwork

A high-performance Real User Monitoring (RUM) platform designed to capture, process, and visualize Core Web Vitals, client-side runtime errors, and route transitions from real visitors with minimal performance overhead.

Built as a decoupled, multi-tiered architecture featuring a dependency-free browser SDK (< 1.7 KB gzipped), an asynchronous event ingestion engine with in-memory backpressure buffering, and an interactive Next.js analytics dashboard.

---

## Architecture Overview

```
+-------------------------------------------------------------------------+
|                              Client Browser                             |
|  - W3C PerformanceObserver (LCP, CLS, INP, FCP, TTFB)                  |
|  - Error & Unhandled Rejection deduplication                            |
|  - SPA History API routing (pushState/popstate)                         |
+-------------------------------------------------------------------------+
                                     |
               navigator.sendBeacon() (text/plain, zero CORS preflight)
                                     v
+-------------------------------------------------------------------------+
|                         Ingestion Gateway (API)                         |
|  - Project key validation with local LRU caching (60s TTL)              |
|  - Fixed-window per-key rate limiter                                    |
|  - Domain origin verification & timestamp clock-skew tolerance          |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                       In-Memory Write Buffer                            |
|  - Non-blocking event loop (decoupled from DB write latency)           |
|  - Batched bulk writes (500 events or 2,000ms flush interval)           |
|  - Backpressure threshold (HTTP 503 at 20,000 queued events)           |
+-------------------------------------------------------------------------+
                                     |
                              insertMany()
                                     v
+-------------------------------------------------------------------------+
|                           MongoDB 7.0+ Store                            |
|  - Aggregation engine using $percentile (p50, p75, p95)                 |
|  - Dynamic timeseries bucket aggregation via $dateTrunc                 |
|  - Compound indexes on (project, type, ts)                              |
|  - Automatic TTL expiry index (30-day retention)                        |
+-------------------------------------------------------------------------+
                                     ^
                                     |  REST API
+-------------------------------------------------------------------------+
|                       Next.js Analytics Dashboard                       |
|  - Backend-for-Frontend (BFF) proxy for first-party cookie sessions     |
|  - TanStack Query data fetching with concurrent refresh deduplication   |
|  - Web Vitals distribution breakdown and release comparison views       |
+-------------------------------------------------------------------------+
```

---

## Technical Highlights

### 1. Browser SDK (`sdk/`)
- **Zero Dependencies & Size Constrained**: ~1.7 KB gzipped. Built with `esbuild`, guarded by an automated build budget test failing if the bundle exceeds 3 KB.
- **Accurate Metric Capture**:
  - **LCP**: Tracks candidate elements via `largest-contentful-paint` until first user input.
  - **CLS**: Adheres to the modern session-window algorithm (1-second gap limit, 5-second maximum window duration) ignoring input-flagged shifts.
  - **INP**: Samples discrete interaction durations using high-percentile selection.
  - **TTFB & FCP**: Measured via Navigation Timing and Paint Timing entries.
- **Beaconing Protocol**: Dispatches batches using `navigator.sendBeacon` with a fallback to `fetch({ keepalive: true })`. Payload is delivered as `text/plain` to eliminate browser `OPTIONS` preflight roundtrips.
- **Error Deduplication**: Signatures based on normalized message and top-of-stack frame, preventing infinite loops or repeating exceptions from flooding the ingest pipeline.

### 2. Ingestion & Storage Pipeline (`server/`)
- **Decoupled Event Ingestion**: `POST /api/ingest` validates incoming payloads with `zod`, checks project validity via an in-memory LRU cache, applies per-key rate limiting, and acknowledges clients immediately with `202 Accepted`.
- **Backpressure & Batching**: Events are pushed into a ring buffer flushed via MongoDB `insertMany(batch, { ordered: false })`. If the queue exceeds 20,000 items under peak load, the gateway returns `503 Service Unavailable` rather than degrading system memory.
- **Statistical Aggregation**: Utilizes native MongoDB 7 approximate percentiles (`$percentile` at 50th, 75th, and 95th percentiles) and `$dateTrunc` bucketing across configurable rolling windows (`1h`, `24h`, `7d`, `30d`).
- **Automated Threshold Monitoring**: Background cron evaluation detects error velocity anomalies (> threshold in 5 minutes) and registers alerts with a 15-minute cooldown.

### 3. Security & Authentication Architecture
- **Dual JWT Token Rotation**: 15-minute access token and 7-day refresh token stored in `httpOnly`, `sameSite: lax` cookies.
- **Token Family Reuse Detection**: Refresh tokens are stored as cryptographic hashes (`sha256`). When a token is refreshed, it is immediately revoked and replaced. If a previously consumed token is presented (indicating a replay attempt), all sessions for that user family are instantly purged.
- **Timing Attack Mitigation**: Login verification employs constant-time dummy comparisons (`bcrypt.compare` against pre-computed salt) when an unknown email address is supplied, neutralizing user enumeration.
- **Google OAuth 2.0 Integration**: Cryptographically secured CSRF state token with server-to-server token exchange and automatic user provisioning.

### 4. WCAG 2.1 / 2.2 Accessibility Assessment Engine
- **Multi-Level Compliance Auditing**: Evaluates target pages against WCAG Conformance Levels A, AA (legal baseline for ADA & EAA), and AAA.
- **Rule Suites**:
  - **Perceivable**: Image alternative text (`image-alt`), relative luminance and color contrast ratios (`color-contrast` at 4.5:1 for AA and 7:1 for AAA), text resizing / viewport zoom lock (`meta-viewport`).
  - **Operable**: Button accessible names, ambiguous link purpose, positive `tabindex` avoidance, keyboard navigation landmarks (`landmark-one-main`).
  - **Understandable**: Language attribute validation (`html-has-lang`), form control label associations (`label[for]`, `aria-label`).
  - **Robust**: Document title (`<title>`), heading hierarchy sequencing without skips (`h1` -> `h2`), and duplicate DOM ID prevention.
- **Actionable Remediation**: Reports include weighted compliance scores (0-100), severity impact tags (Critical, Serious, Moderate, Minor), exact CSS selectors, failing HTML snippets, and direct links to W3C guidance.

---

## Project Structure

```
├── .github/
│   └── workflows/
│       ├── ci.yml                # Automated CI: Matrix tests, E2E pipeline, Docker build checks
│       └── cd.yml                # Production CD: Multi-stage container publishing to GHCR
├── client/                       # Next.js 14 Dashboard
│   ├── app/                      # App router pages (dashboard, telemetry explorer, auth)
│   ├── components/               # Gauges, trend charts, breakdown tables, error inspector
│   ├── lib/                      # API client, vitals formatting, authentication hooks
│   └── Dockerfile                # Multi-stage standalone runner image
├── sdk/                          # Browser telemetry SDK
│   ├── src/                      # Metric observers, session management, beacon dispatcher
│   ├── scripts/                  # Bundle budget validation and dashboard sync
│   └── test/                     # Unit test harness & end-to-end SDK pipeline specs
├── server/                       # Express & MongoDB backend
│   ├── src/
│   │   ├── controllers/          # Ingest, stats aggregation, auth, project management
│   │   ├── services/             # In-memory buffer, rate limiter, LRU project cache
│   │   ├── models/               # Mongoose schemas with compound and TTL indexes
│   │   └── jobs/                 # Cron-driven alert monitoring
│   └── Dockerfile                # Production-optimized Alpine container
├── docker-compose.yml            # Local development orchestration
└── docker-compose.prod.yml       # Production deployment with resource & health specs
```

---

## Getting Started

### Prerequisites
- **Node.js**: v18.18+ (Node 20 LTS recommended)
- **MongoDB**: v7.0+ (required for `$percentile` aggregation)
- **Docker & Docker Compose** (optional)

### Running with Docker

```bash
# Clone the repository
git clone https://github.com/your-username/fieldwork-rum.git
cd fieldwork-rum

# Spin up MongoDB, API Server, and Dashboard
docker compose up --build -d

# Seed development dataset (creates demo project and seed accounts)
docker compose exec server npm run seed
```

Access the dashboard at `http://localhost:3000`.

### Manual Local Setup

1. **MongoDB**:
   ```bash
   docker run -d -p 27017:27017 --name fieldwork-mongo mongo:7
   ```

2. **API Server**:
   ```bash
   cd server
   cp .env.example .env
   npm install
   npm run seed
   npm run dev
   ```

3. **Dashboard Client** (in a separate terminal):
   ```bash
   cd client
   npm install
   npm run dev
   ```

4. **SDK Build** (optional, builds distribution bundles into client public directory):
   ```bash
   cd sdk
   npm install
   npm run build
   ```

---

## Environment Variables

### Server Configuration (`server/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | API HTTP port | `4000` |
| `MONGO_URI` | MongoDB connection connection string (v7.0+) | `mongodb://127.0.0.1:27017/fieldwork` |
| `JWT_ACCESS_SECRET` | Secret key for signing 15-minute access JWTs | Required in production |
| `JWT_REFRESH_SECRET` | Secret key for signing 7-day refresh JWTs | Required in production |
| `CLIENT_ORIGIN` | Dashboard origin for CORS authorization | `http://localhost:3000` |
| `ADMIN_EMAIL` | Email automatically assigned admin privileges on signup | Optional |
| `RETENTION_DAYS` | TTL duration for raw telemetry events | `30` |
| `INGEST_RATE_PER_MIN` | Per-project-key ingestion rate limit threshold | `1200` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | Optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | Optional |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI (e.g. `http://localhost:3000/api/auth/google/callback`) | `${CLIENT_ORIGIN}/api/auth/google/callback` |

---

## Testing & Verification

The test harness exercises the unit, integration, and browser layers independently:

```bash
# Root monorepo test runner
npm test

# Server unit tests (no DB required)
cd server && npm test

# Server integration tests (against real MongoDB 7 instance)
cd server && npm run test:e2e

# SDK unit tests (browser mocks)
cd sdk && npm test

# End-to-end pipeline: Browser SDK -> API -> Ingest Buffer -> DB -> Dashboard Queries
cd sdk && npm run test:pipeline

# Playwright dashboard visual & interaction tests
cd client && npm run test:e2e
```

### High-Throughput Load Testing

Fieldwork includes a `k6` benchmark script to evaluate ingest buffer saturation:

```bash
# Run API with high test rate limit threshold
INGEST_RATE_PER_MIN=10000000 npm run dev

# Run k6 load test script
k6 run loadtest/ingest.js
```

---

## CI/CD Pipeline

The project features automated pipelines configured in `.github/workflows/`:

- **CI (`ci.yml`)**:
  - Concurrency cancellation on active pull requests.
  - Matrix execution: SDK unit & bundle budget check (< 3 KB), Server unit & Mongo 7 integration tests, Client Next.js production build check.
  - End-to-end Playwright browser execution across the integrated stack.
  - Docker build verification ensuring container specifications pass validation.
- **CD (`cd.yml`)**:
  - Triggers on version tags (`v*.*.*`) or pushes to `main`.
  - Multi-stage Docker container builds for both backend and frontend services.
  - Automated tagging (`sha`, `semver`, `latest`) and publishing to GitHub Container Registry (`ghcr.io`).

---

## Production Deployment

Production orchestration is defined in `docker-compose.prod.yml`:
- Least-privilege execution (`USER node` in server, `USER nextjs` in client).
- Next.js standalone output mode minimizing Docker image footprint.
- Built-in container healthchecks (`/api/health` and MongoDB admin ping).
- Log rotation limits preventing disk exhaustion.
