# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server (localhost:3000)
npm run build      # Production build
npm run start      # Start production server
npm run benchmark  # Run performance benchmarks (tsx benchmark/run.ts)
```

No linting or test scripts are configured. There is no test framework in this project.

## Architecture Overview

**Researchly (ScholarAI v4)** is a Next.js 14 App Router full-stack SaaS for academic research, targeting Indian students (JEE, NEET, GATE, UPSC).

### Tech Stack
- **Framework:** Next.js 14 App Router (`src/app/`)
- **Database:** MongoDB + Mongoose (Atlas)
- **Auth:** NextAuth.js v4 — Google & GitHub OAuth, JWT strategy (no DB sessions)
- **AI:** Anthropic Claude (primary via `@anthropic-ai/sdk`), OpenAI (embeddings/fallback)
- **Payments:** Razorpay (INR subscriptions — Student ₹199/mo, Pro ₹499/mo)
- **Caching:** In-memory TTL cache + MongoDB `Cache` model + Upstash Redis (rate limiting)
- **Streaming:** Server-Sent Events (SSE) for search responses
- **Styling:** Tailwind CSS + Framer Motion

### Path Alias
`@/*` resolves to `./src/*`

### Core Data Flow: Search & RAG

The main user flow runs through `POST /api/search/stream`:
1. **Intent detection** (`lib/intent.ts`) — classifies query and sets system prompt addendum
2. **Cache lookup** (`lib/cache.ts`) — normalized query key against MongoDB + in-memory TTL
3. **Paper retrieval** (`lib/papers.ts` → `searchAll()`) — aggregates from multiple academic APIs
4. **RAG pipeline** (`lib/rag.ts`) — section-aware chunking, BM25 + semantic reranking (OpenAI embeddings), evidence block construction
5. **Answer generation** (`lib/ai.ts` → `generateAnswer()`) — Claude Sonnet streaming with inline citations
6. **Citation repair** (`lib/rag.ts`) — verifies citations are supported (0–10 score), assigns credibility badges
7. Response streamed as SSE events to the client

### Key Library Files

| File | Purpose |
|------|---------|
| `src/lib/rag.ts` | RAG pipeline — chunking, BM25, reranking, badges, citation scoring (~210KB) |
| `src/lib/ai.ts` | All Claude calls — `generateAnswer`, `generateReview`, `chatPDF`, `generateRelatedQuestions` |
| `src/lib/papers.ts` | `searchAll()` — multi-source academic paper aggregation |
| `src/lib/auth.ts` | NextAuth config — providers, JWT callback, atomic user upsert |
| `src/lib/intent.ts` | Query intent classification for dynamic prompting |
| `src/lib/citations.ts` | Citation formatting (APA, MLA, IEEE, BibTeX, inline, cards) |
| `src/lib/pdfRag.ts` | PDF section detection and section-aware chunking |
| `src/lib/guestLimit.ts` | Cookie-based fingerprinting for guest rate limits (2 searches) |
| `src/lib/mongodb.ts` | Singleton MongoDB connection with pooling |

### Mongoose Models (`src/models/`)

- **User** — profile, plan (`free`/`student`/`pro`), subscription status, usage counters, saved papers, search history
- **Conversation** — research session metadata, linked to User
- **Message** — role/content, `papers` (cited), `retrievedPapers` (ranked), `evidenceIdToPaperId` map
- **Cache** — normalized query → result for persistent caching
- **Feedback**, **Broadcast**, **PublicResearch** — user feedback, admin broadcasts, public shared reports

### Core TypeScript Types (`src/types/index.ts`)

```typescript
Paper          // id, title, authors, year, abstract, journal, doi, url, citationCount, source, badges
EvidenceBlock  // chunk_id, paper_id, text, section, inlineCite (used in RAG prompt)
CitedPaper     // Paper + evidenceId (cited in final answer)
RetrievedPaper // Paper + rank (full BM25 result set)
```

### Authentication & Authorization

- NextAuth JWT stored in secure HTTP-only cookies
- API routes use `getServerSession()` to verify identity
- Rate limits enforced per plan: Free = 5/day, Student = 500/month, Pro = unlimited, Guest = 2 total
- Admin routes gated by `ADMIN_EMAIL` env var

### Route Structure

**Pages:** `/search` (main), `/chat/[id]` (PDF chat), `/dashboard`, `/pricing`, `/review`, `/research/[slug]` (public), `/admin`

**Key API routes:**
- `POST /api/search/stream` — SSE streaming search + RAG answer
- `POST /api/upload` — PDF upload handler
- `POST /api/review` — Literature review generation
- `POST /api/razorpay/order|verify|cancel|webhook` — Subscription billing

### Environment Variables

Required in `.env.local`: `MONGODB_URI`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, `RAZORPAY_STUDENT_PLAN_ID`, `RAZORPAY_PRO_PLAN_ID`, `UPSTASH_REDIS_REST_URL/TOKEN`, `ADMIN_EMAIL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`

### Notable Config

- `next.config.js` — Mongoose as external server package; `/test` redirects to `/` in production
- State management is local React hooks only — no Redux/Zustand/etc.
- `globals.css` (53KB) and `landing.css` (27KB) contain substantial custom CSS alongside Tailwind
