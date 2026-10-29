# Fieldwork: Real User Monitoring (RUM) & WCAG Accessibility Assessment Platform
## Master Technical Architecture & Engineering Source Document

---

## 1. Executive Summary & Problem Statement

### The Problem
Traditional synthetic testing tools (such as Google Lighthouse or Chrome DevTools) only measure web performance from a single developer machine in a simulated, idealized environment. They cannot reveal how real human visitors—using budget mobile hardware, unstable 4G networks, and various browsers—actually experience a production application, nor do they catch unpredictable client-side JavaScript crashes happening in the wild.

Furthermore, with modern global regulations (including the **European Accessibility Act (EAA)** and **US ADA Title III**), digital accessibility compliance (WCAG 2.1 Level A, AA, and AAA) is no longer optional—it is a legal mandate. Engineering teams historically had to stitch together multiple expensive, heavyweight tools (e.g., Datadog RUM, Sentry, Axe) that inflated client bundle sizes and cost thousands of dollars per month.

### The Solution: Fieldwork
Fieldwork is a unified, high-performance **Real User Monitoring (RUM) and WCAG Compliance Platform**. It combines:
1. A dependency-free, ultra-lightweight browser telemetry SDK (**< 1.7 KB gzipped**, strictly guarded by an automated build budget).
2. An asynchronous, high-throughput event ingestion engine with in-memory backpressure buffering that decouples database writes from client response latency.
3. A real-time statistical aggregation engine utilizing **MongoDB 7.0 native `$percentile` and `$dateTrunc` operators** to compute 75th percentile Core Web Vitals and version-over-version regressions.
4. A full **WCAG 2.1 / 2.2 Accessibility Assessment Engine** evaluating Conformance Levels A, AA, and AAA with mathematical contrast checking, failing DOM selectors, and remediation guidance.
5. Enterprise-grade security and privacy, including dual JWT rotation with token-family reuse detection, Google OAuth 2.0 with HMAC state validation, and a GDPR-compliant cascading account purge.
6. A responsive Next.js 14 analytics dashboard with Backend-for-Frontend (BFF) proxying and live hot-reloading development orchestration.

---

## 2. End-to-End System Architecture

```
+-----------------------------------------------------------------------------------+
|                                Client Browser                                     |
|  - W3C PerformanceObserver API (LCP, CLS windowing, INP percentiles, FCP, TTFB)    |
|  - Global runtime error & unhandled promise rejection deduplication               |
|  - SPA Navigation interception (History API: pushState / replaceState / popstate) |
|  - Session sampling & text/plain beacon transport                                 |
+-----------------------------------------------------------------------------------+
                                        |
                   navigator.sendBeacon() (POST /api/ingest)
                      - text/plain eliminates CORS preflight
                                        v
+-----------------------------------------------------------------------------------+
|                           Ingestion Gateway (API)                                 |
|  - Project key validation via in-memory LRU cache (60s hit / 10s miss TTL)        |
|  - Sliding fixed-window rate limiter per project key                              |
|  - Origin domain whitelisting & clock-skew tolerance window (-24h to +5m)         |
|  - Payload validation with Zod schemas                                            |
|  - Instant response: HTTP 202 Accepted                                            |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                          In-Memory Write Buffer                                   |
|  - Decoupled from MongoDB write latency (protects Node.js event loop)             |
|  - Batch write trigger: 500 queued events OR 2,000ms flush interval               |
|  - Backpressure protection: Returns HTTP 503 at 20,000 queued events               |
+-----------------------------------------------------------------------------------+
                                        |
                             insertMany({ ordered: false })
                                        v
+-----------------------------------------------------------------------------------+
|                            MongoDB 7.0+ Database                                  |
|  - Events collection: Compound indexes (project, type, ts)                        |
|  - Auto-retention TTL index (30-day automatic document expiration)                |
|  - Users & RefreshToken collections (SHA-256 hashed token rotation)              |
|  - Audits collection: WCAG compliance history and violation DOM nodes             |
|  - Cron-driven alert monitoring: evaluates error velocity every minute            |
+-----------------------------------------------------------------------------------+
                                        ^
                                        |  Internal REST API
+-----------------------------------------------------------------------------------+
|                        Next.js 14 Analytics Dashboard                             |
|  - Backend-for-Frontend (BFF) proxy for first-party cookie management             |
|  - TanStack Query with concurrent refresh deduplication                           |
|  - Performance view: Gauges, chronological trends, dimensional breakdown          |
|  - Accessibility view: Scorecards, severity impact filters, code inspectors       |
|  - Danger Zone: GDPR cascading user & telemetry purge                             |
+-----------------------------------------------------------------------------------+
```

---

## 3. Core Subsystems Deep Dive

### Subsystem A: The Lightweight Browser SDK (`sdk/`)
* **Bundle Footprint**: ~1.7 KB gzipped. A continuous integration script (`scripts/size.js`) validates that the build fails if the bundle grows past 3 KB.
* **Core Web Vitals Implementation**:
  - **Largest Contentful Paint (LCP)**: Observes `largest-contentful-paint` candidates until user interaction. The last candidate before input is retained.
  - **Cumulative Layout Shift (CLS)**: Implements the W3C session-window algorithm. Shifts occurring less than 1,000ms apart are aggregated into windows with a maximum duration of 5,000ms. Shifts flagged with `hadRecentInput` (user clicks) are excluded.
  - **Interaction to Next Paint (INP)**: Observes `event` entries with duration thresholds, maintaining a high-percentile selection of user discrete interactions (keyboard, tap, click).
  - **Time to First Byte (TTFB) & First Contentful Paint (FCP)**: Extracted from Navigation Timing and Paint Timing entries.
* **Zero Preflight Beacon Transport**:
  Telemetry batches are formatted as `text/plain` strings sent via `navigator.sendBeacon(endpoint, blob)`. Because `text/plain` is a simple content-type under CORS specifications, browsers transmit beacons **without sending an initial `OPTIONS` preflight request**, eliminating unnecessary network roundtrips. When beacon is unsupported, it falls back to `fetch({ keepalive: true })`.
* **Exception Deduplication**:
  Listens to window `error` and `unhandledrejection`. Signatures are generated combining the error message and the top stack frame, capped at 20 unique errors per page to prevent infinite loops from flooding the network.

---

### Subsystem B: Ingestion Pipeline & Backpressure Buffering (`server/`)
* **Non-Blocking Architecture**: `POST /api/ingest` validates payload structure, verifies API key validity in memory, applies per-key rate limits, pushes events to an in-memory queue, and returns `HTTP 202 Accepted` immediately.
* **Batch Flushing**: Events are written using MongoDB `insertMany(batch, { ordered: false })` in chunks of 500 documents or every 2,000ms.
* **High-Watermark Backpressure**: If database latency causes the internal queue to exceed 20,000 pending events, the endpoint returns `HTTP 503 Service Unavailable`, preventing the Node.js process from exhausting heap memory.
* **Fast-Path LRU Project Cache**: Avoids querying the database on every beacon. Project keys are cached in memory with a 60-second positive TTL and a 10-second negative cache TTL.

---

### Subsystem C: Statistical Telemetry Engine (MongoDB 7.0+)
* **Direct Database Computing**: Rather than pulling raw events into Node.js application memory, Fieldwork delegates percentiles directly to the database engine using MongoDB 7's `$percentile` operator:
  - Computes P50 (median), P75 (industry standard for Core Web Vitals), and P95.
* **Time-Series Bucket Aggregation**: Uses `$dateTrunc` to partition rolling telemetry into chronological buckets across 1-hour, 24-hour, 7-day, and 30-day windows.
* **Automated Data Retention**: MongoDB TTL index (`ts: 1`, `expireAfterSeconds: RETENTION_DAYS * 86400`) automatically purges raw documents past 30 days, preventing runaway storage costs.

---

### Subsystem D: WCAG 2.1 / 2.2 Accessibility Assessment Engine
* **Evaluation Standards**: Conformance Levels **A**, **AA** (legal baseline for EAA and ADA), and **AAA** across all 4 WCAG principles (**POUR**: Perceivable, Operable, Understandable, Robust).
* **Mathematical Contrast Evaluation**:
  - Implements the official W3C relative luminance formula:
    $$L = 0.2126 \cdot R + 0.7152 \cdot G + 0.0722 \cdot B$$
    (with non-linear sRGB gamma expansion).
  - Calculates contrast ratios $(L_1 + 0.05) / (L_2 + 0.05)$ and verifies adherence to the 4.5:1 minimum (Level AA) and 7.0:1 enhanced (Level AAA) thresholds.
* **Rule Suites Evaluated**:
  - **Perceivable**: Missing image `alt` attributes, uninformative alt strings, zoom-locking viewport meta tags (`user-scalable=no`).
  - **Operable**: Accessible button text, ambiguous link names ("click here", "read more"), positive `tabindex` disruption, `<main>` landmark presence.
  - **Understandable**: Page language identification (`html[lang]`), form control label associations (`label[for]`, `aria-label`).
  - **Robust**: `<title>` presence and descriptive length, heading hierarchy sequence jumps (`h1` -> `h3`), duplicate element IDs.
* **Weighted Scoring**:
  $$\text{Score} = \max\left(0, \min\left(100, 100 - (\text{Critical} \times 12 + \text{Serious} \times 6 + \text{Moderate} \times 2 + \text{Minor} \times 1)\right)\right)$$

---

### Subsystem E: Security, Authentication & Session Architecture
* **Dual JWT Token Rotation**:
  - 15-minute access token and 7-day refresh token stored in `httpOnly`, `sameSite: lax` cookies.
  - Refresh tokens are stored as cryptographic SHA-256 hashes in MongoDB.
  - **Token Family Reuse Detection**: On every refresh, the presented token is consumed and revoked. If an attacker attempts to replay a previously consumed token, all active sessions for that user family are instantly terminated.
* **Google OAuth 2.0 Flow with Cryptographic HMAC State**:
  - Generates state tokens containing a random nonce, timestamp, and server-side HMAC-SHA256 signature (`env.accessSecret`).
  - Immune to cookie drops across third-party redirects or private browsing while providing complete CSRF protection.
  - Automatically provisions new developer accounts upon first sign-in.
  - Passwordless guard: Users authenticated via Google cannot be exploited via null-password credential stuffing; the system cleanly guides them to "Continue with Google".
* **Timing-Attack Mitigation**:
  - User verification uses constant-time dummy password hashing (`bcrypt.compare` against pre-computed salt) when an unknown email address is supplied, neutralizing user enumeration.
* **GDPR Cascading Account Purge**:
  - Dedicated `DELETE /api/auth/me` endpoint.
  - Requires user to explicitly type `DELETE` in the UI to prevent accidental clicks.
  - Cascades and permanently wipes all owned projects, telemetry events, alert logs, accessibility audits, session records, and clears client cookies.

---

## 4. Architectural Trade-offs & Engineering Justifications

### Why MERN (Node.js + Express + Next.js + MongoDB) instead of Java (Spring) or C# (.NET)?
1. **I/O-Bound Concurrency vs. Thread-Per-Request Memory**:
   RUM ingestion receives thousands of small, rapid beacon requests that need quick validation and immediate acknowledgement (`202 Accepted`). Node.js's event-driven, non-blocking I/O model (`libuv`) allows a lightweight server to hold thousands of concurrent connections with negligible memory overhead, unlike traditional thread-per-request pools that allocate 1 MB+ per thread.
2. **Polymorphic Telemetry Schema**:
   Events have dynamic shapes (Web Vitals vs. JavaScript stack traces vs. route pageviews). Relational databases require complex join tables or wide nullable schemas. MongoDB documents store polymorphic events naturally and provide high write throughput.
3. **Database Engine Mathematical Percentiles**:
   MongoDB 7's `$percentile` operator computes P50/P75/P95 directly on the database engine, avoiding the memory overhead of fetching millions of rows into application memory.
4. **End-to-End Language Symmetry**:
   Shared data validation (Zod schemas), domain parsing, and threshold definitions across SDK, API, and Next.js frontend without serialization barriers.

---

## 5. DevOps, CI/CD & Production Containerization

* **GitHub Actions CI (`.github/workflows/ci.yml`)**:
  - Matrix runner executing:
    1. SDK unit tests & bundle size budget check (< 3 KB).
    2. Server unit & integration tests against live MongoDB 7 service containers with healthcheck pings.
    3. Client Next.js production build verification with telemetry disabled.
    4. Full end-to-end integration pipeline with Playwright browser tests.
    5. Docker multi-stage build validation.
* **GitHub Actions CD (`.github/workflows/cd.yml`)**:
  - Automated release pipeline triggered on tags (`v*.*.*`) or pushes to `main`.
  - Multi-stage Docker builds with GitHub Actions layer caching (`type=gha`).
  - Automated publishing of signed containers to GitHub Container Registry (`ghcr.io`).
* **Containerization Best Practices**:
  - Least-privilege execution: Server runs as `USER node`, Client runs as `USER nextjs:nodejs`.
  - Next.js standalone runner (`output: 'standalone'`) stripping hundreds of megabytes of unnecessary dev dependencies.
  - Native container `HEALTHCHECK` probing `/api/health`.
  - Log rotation limits (`max-size: 20m`, `max-file: 5`) to prevent disk exhaustion.
* **Developer Experience (Hot Reloading)**:
  - Volume mounting (`volumes:`) and `WATCHPACK_POLLING="true"` for instant Windows HMR.
  - Background execution via `docker compose up -d`.

---

## 6. Interview Talking Points & Cheat Sheet

### The 30-Second Elevator Pitch
> *"I built Fieldwork, a full-stack Real User Monitoring (RUM) and WCAG Accessibility assessment platform. It captures Core Web Vitals, runtime errors, and route telemetry from real users via a sub-1.7 KB dependency-free browser SDK that bypasses CORS preflights. The backend uses an in-memory backpressure ring buffer to ingest thousands of events without blocking, aggregates P75 percentiles directly in MongoDB 7, and includes an automated WCAG 2.1 A/AA/AAA scanner with mathematical contrast checking and ADA/EAA compliance reporting."*

### Key Technical Questions You Can Confidently Answer
1. **"Why send beacons as text/plain instead of application/json?"**
   - Sending JSON triggers a CORS `OPTIONS` preflight request, doubling network traffic and adding latency. Sending stringified JSON as `text/plain` is considered a simple request under CORS rules, delivering the beacon immediately in a single network roundtrip.
2. **"How do you handle sudden traffic spikes without running out of memory?"**
   - Ingestion is decoupled from MongoDB write latency via an in-memory queue that writes batches of 500 documents every 2 seconds. If database write latency rises and the queue reaches 20,000 items, the server returns HTTP 503 instead of crashing the Node.js heap.
3. **"How do you protect against session hijacking and token theft?"**
   - Session tokens are stored in `httpOnly, sameSite: lax` cookies that cannot be read by JavaScript (immune to XSS theft). Refresh tokens are stored as SHA-256 hashes and rotated on every single use. If an old consumed token is replayed, the server terminates all sessions for that entire user family.
4. **"How does your WCAG engine calculate color contrast?"**
   - It implements the W3C WCAG 2.1 relative luminance formula by applying sRGB gamma expansion to RGB values, calculating $(L_1 + 0.05) / (L_2 + 0.05)$, and validating whether normal text meets the 4.5:1 ratio for Level AA or 7.0:1 for Level AAA.
