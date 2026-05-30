# AlphaStream AI: System Design Document

**Project Name:** AlphaStream AI  
**Track:** Track 2: UNLOCKED - INTELLIGENCE  
**Author:** Hackathon Team Alpha  
**Status:** Design Finalized / Implementation Phase

---

## 1. Executive Summary

AlphaStream AI is an "always-on" data pipeline and dashboard that transforms unstructured public web data into institutional-grade financial intelligence. By combining Bright Data's advanced scraping infrastructure with Hugging Face's open-source AI models and n8n's orchestration, the system provides real-time sentiment analysis and autonomous due diligence reports without the high overhead of proprietary financial terminals.

---

## 2. Problem Statement

- **Data Latency:** Existing AI models rely on stale training data.
- **Anti-Bot Barriers:** Financial news and social platforms employ aggressive bot-detection, making reliable data pipelines difficult to maintain.
- **Infrastructure Costs:** High token costs associated with "heavy" LLMs like GPT-4o for simple data extraction tasks.

---

## 3. High-Level Architecture

The system follows a decoupled, event-driven architecture centered around a serverless backend.

### The Data Flow

1. **Ingestion:** n8n triggers Bright Data APIs to fetch live web data.
2. **Processing:** Hugging Face LLMs summarize and score the data.
3. **Storage:** Structured data is pushed to Firebase (Metadata) and Pinecone (Vectors).
4. **Consumption:** Next.js frontend listens to Firebase for real-time UI updates.

---

## 4. Technology Stack

### 4.1 Data Acquisition (The Backbone)

- **Bright Data SERP API:** Used for structured retrieval of global financial news and Google search results.
- **Bright Data Web Unlocker:** A sophisticated proxy layer used to scrape social sentiment from sites like Reddit, bypassing captchas and IP blocks.

### 4.2 Orchestration (The Central Nervous System)

- **n8n (Workflow Automation):** Manages the "unbreakable" pipeline. Handles logic for retries, error branches, and model fallback. Eliminates the need for a dedicated Express.js or Python backend server.

### 4.3 Intelligence Layer (The Brain)

- **Text Generation:** `meta-llama/Llama-3.1-8B` (hosted on Hugging Face) for fast sentiment extraction.
- **Reasoning:** `meta-llama/Llama-3.3-70B` (hosted on Hugging Face) for complex report generation.
- **Embeddings:** `sentence-transformers/all-MiniLM-L6-v2` — generates a vector space of `d=384` dimensions to represent semantic meaning.

### 4.4 Storage & Frontend (The Face)

- **Firebase Firestore:** Real-time NoSQL database for ticker watchlists, sentiment scores, and user profiles.
- **Pinecone:** A serverless vector database used to store embeddings for Retrieval-Augmented Generation (RAG).
- **Next.js 15:** A React-based framework utilizing Server Components for SEO and Client Components with Firebase listeners for real-time reactivity.

---

## 5. Detailed Component Design

### 5.1 The "Unbreakable" Ingestion Pipeline

The pipeline is designed with a **Three-Tier Resilience Strategy:**

- **Tier 1 (Scraping):** Bright Data provides the initial layer of reliability by rotating residential IPs.
- **Tier 2 (Logic):** n8n implements a "Retry on Fail" loop (3 attempts with exponential backoff).
- **Tier 3 (AI Fallback):** If the primary LLM is unresponsive (503 Cold Start), the system automatically routes the request to a secondary model.

### 5.2 Retrieval-Augmented Generation (RAG)

To provide deep-dive reports, the system utilizes a semantic search pattern:

1. User requests a report for ticker `T`.
2. The system embeds the query `T` into a vector `V_q`.
3. Pinecone performs a top-k similarity search against historical news vectors.
4. The retrieved context is injected into the LLM prompt:
   > *"Using the following context: {Retrieved_Context}, analyze the outlook for ticker {T}."*

---

## 6. Data Model (Firestore)

| Collection | Key Fields | Purpose |
|---|---|---|
| `tickers` | ticker_id, sentiment_score, last_updated, summary | Stores live status of stocks. |
| `users` | uid, watchlist_array, email | Manages user-specific settings. |
| `reports` | report_id, ticker_id, content, timestamp | Stores AI-generated deep dives. |

---

## 7. Security & Scalability

- **Security:** All API keys are stored in n8n's encrypted credential manager and Vercel's environment variables. Firebase Security Rules ensure users can only access their own watchlists.
- **Scalability:** By utilizing serverless providers (Pinecone Serverless, Hugging Face Inference, Firebase, Vercel), the system can scale from 1 to 10,000 users without manual server management.

---

## 8. Conclusion

AlphaStream AI leverages the power of Bright Data's web unlocking capabilities to provide a transparent, real-time alternative to expensive financial tools. By utilizing an "unbreakable" orchestration layer and a $0-budget AI stack, the design proves that institutional-grade intelligence is accessible through strategic engineering.
