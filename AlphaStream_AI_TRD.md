# AlphaStream AI — Technical Requirements Document

**Phase:** Hackathon Build (MVP)  
**Primary Architecture:** Serverless + Event-Driven Orchestration  
**Version:** 1.0 | May 2026

---

## 1. System Architecture Overview

AlphaStream AI utilizes a decoupled architecture where heavy data ingestion and processing are handled asynchronously via n8n workflows, while the Next.js 15 frontend consumes structured, low-latency data from Firebase Firestore.

### Architecture Layers

- **Client Layer:** Next.js 15 App Router (React). Handles UI, Authentication, and direct real-time listeners to Firestore.
- **Orchestration Layer:** n8n (self-hosted or cloud) acts as the central nervous system. It triggers scraping, manages rate limits, and routes data to LLMs.
- **Data Acquisition Layer:** Bright Data Proxies and APIs.
- **Intelligence Layer:** OpenRouter handles LLM API routing; Pinecone handles vector embeddings for RAG.
- **Storage Layer:** Firebase Firestore (NoSQL document store).

---

## 2. Technology Stack & Dependencies

### Frontend & Client Services

| Category | Technology | Purpose |
|---|---|---|
| Framework | Next.js 15 (App Router) | UI, Server Actions for mutations |
| Styling & UI | Tailwind CSS, Shadcn UI | Rapid, premium component building |
| Visualization | Recharts | Sentiment gauge / candlestick visuals |
| Authentication | Firebase Auth | Email/Password, Google OAuth |
| State Management | React Server Components + Zustand | Client-side state management |

### Backend & Orchestration

| Category | Technology | Purpose |
|---|---|---|
| Workflow Automation | n8n | Central orchestration engine |
| Database | Firebase Firestore | NoSQL document store |
| Vector Database | Pinecone | Serverless index, cosine similarity |

### External APIs

**Scraping (Mandatory)**
- **Bright Data SERP API:** For structured news aggregation
- **Bright Data Web Unlocker:** Proxy configuration for Reddit/financial forums

**AI Routing**
- **OpenRouter API:** Unified LLM API routing

**Triage Models**
- `meta-llama/llama-3-8b-instruct` — Low cost, fast text extraction
- `anthropic/claude-3-haiku` — Alternative for fast text extraction

**Reasoning Models**
- `openai/gpt-4o` — Deep due diligence generation
- `anthropic/claude-3.5-sonnet` — Alternative for deep reasoning

**Embeddings**
- `text-embedding-3-small` — Via OpenAI for Pinecone vector storage

---

## 3. Data Models (Firestore Schema)

### Collection: `users`

| Field | Type | Description |
|---|---|---|
| uid | String | Primary Key |
| email | String | User email address |
| watchlist | Array of Strings | e.g., ["AAPL", "TSLA", "NVDA"] |

### Collection: `tickers`

| Field | Type | Description |
|---|---|---|
| ticker_symbol | String | Primary Key (e.g., "TSLA") |
| last_updated | Timestamp | Last data refresh time |
| current_sentiment_score | Number | Range: 0–100 |
| recent_news | Array of Objects | News articles with metadata |

**`recent_news` Object Structure**

| Field | Type | Description |
|---|---|---|
| title | String | News article title |
| url | String | Source URL |
| ai_summary | String | Generated summary |
| source | String | News source name |

### Collection: `reports` (Generated Due Diligence)

| Field | Type | Description |
|---|---|---|
| report_id | String | Primary Key |
| ticker_symbol | String | Associated ticker |
| generated_at | Timestamp | Report generation time |
| requested_by | String | User ID (uid) |
| content | Object | Structured report content |

**`content` Object Structure**

| Field | Type | Description |
|---|---|---|
| strengths | Array | List of identified strengths |
| weaknesses | Array | List of identified weaknesses |
| catalysts | Array | List of potential catalysts |
| overall_thesis | String | Executive summary of analysis |

---

## 4. Workflow & Orchestration Specifications (n8n)

### Workflow 1: The "Always-On" Ingestion Cron (Every 15 mins)

0. **Trigger:** n8n Cron node fires every 15 minutes.
1. **Read:** Fetches all unique tickers from the users' watchlist in Firestore.
2. **Check:** Filters out tickers where `last_updated` is less than 15 minutes ago.
3. **Fetch (Parallel):**
   - Node A: HTTP Request to Bright Data SERP API with query `"{ticker} financial news"`.
   - Node B: HTTP Request via Bright Data Web Unlocker Proxy to scrape Reddit r/wallstreetbets for the ticker.
4. **AI Triage:** Pass raw HTML/JSON to OpenRouter (Haiku/Llama 3). Prompt: *"Extract the top 3 news facts and assign a bullish/bearish sentiment score (0-100) based on this text. Return strictly in JSON format."*
5. **Embed:** Pass the extracted summaries to the Embedding API and upsert into Pinecone with metadata `{"ticker": "TSLA", "timestamp": "..."}`.
6. **Store:** Update the `tickers` collection in Firestore with the new JSON payload and update the `last_updated` timestamp.

### Workflow 2: On-Demand Deep Dive (Webhook)

7. **Trigger:** Next.js frontend sends a POST request to an n8n Webhook URL. Payload: `{ ticker: "NVDA", uid: "user123" }`.
8. **Context Gathering:** n8n queries Pinecone for the top 20 most relevant recent vectors for the requested ticker.
9. **AI Reasoning:** Send retrieved context to OpenRouter (GPT-4o or Claude 3.5 Sonnet). System Prompt: *"You are a senior financial analyst. Based on the provided real-time scraped context, generate a structured due diligence report..."*
10. **Delivery:** Write the generated report to the `reports` Firestore collection. Next.js client listens to this collection and updates the UI instantly when the document appears.

---

## 5. API Integrations & Security

### Bright Data Configuration

**Web Unlocker**
- **Host:** `brd.superproxy.io:22225`
- **Auth:** Basic Auth (Bright Data Zone Credentials)
- **Configuration:** Must be configured in n8n HTTP Request nodes using proxy tunneling.

**SERP API**
- **Protocol:** Standard REST POST requests using the Bright Data Bearer token.

### Security Protocols

**Client-Side**  
Firestore Security Rules must ensure users can only read reports they requested and can only write to their own watchlist array.

**API Keys**  
All external API keys (Bright Data, OpenRouter, Pinecone) must be stored as Environment Variables within the n8n instance and Next.js server environment (`.env.local`). Never expose these to the Next.js client.

**Rate Limiting**  
Next.js Server Actions triggering the "Deep Dive" webhook must include basic rate limiting to prevent API credit exhaustion during the hackathon.

---

*AlphaStream AI — Intelligence-Driven Financial Analysis*  
*Serverless Architecture · Event-Driven Orchestration · Real-Time AI*  
*© 2026 AlphaStream AI — Technical Requirements Document v1.0*
