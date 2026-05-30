# AlphaStream AI — Backend System Design & Pipeline Architecture

**Project:** AlphaStream AI  
**Platform:** n8n (Orchestration), Hugging Face (AI Inference), Pinecone (Vector DB), Firebase (Document DB)

---

## 1. Architectural Overview

The AlphaStream AI backend is a decoupled, event-driven architecture designed entirely within n8n. It is split into three distinct microservices (workflows):

1. **The Ingestion Engine:** A cron-triggered pipeline that continuously scrapes, structures, and stores financial data.
2. **The RAG Engine:** A webhook-triggered pipeline that retrieves vector data and synthesizes real-time reports.
3. **The Global Error Manager:** A centralized recovery sequence that intercepts any node failures across the system to prevent silent crashes.

---

## 2. Pipeline 1: The Ingestion Engine (Workflow A)

**Purpose:** Autonomously keep the databases updated with live market sentiment without human intervention.

### Node-by-Node Execution Flow

1. **Schedule Trigger Node:** Fires every 15 minutes. It initiates the pipeline, acting as the system's heartbeat.

2. **Google Cloud Firestore Node (Read):** Queries the `tickers` collection to pull the active watchlist of stocks.

3. **Filter Node (State Check):** Compares the current time against the ticker's `last_updated` field. If the data is less than 15 minutes old, the execution for that ticker halts. This prevents redundant API calls and saves AI tokens.

4. **HTTP Request Node (Bright Data Web Unlocker):** Sends a search query (e.g., `"$NVDA financial news"`) through Bright Data's proxy network. Bright Data handles IP rotation and CAPTCHA solving, returning the raw HTML/JSON of the live search results.

5. **Code Node (Data Sanitization):** Executes a JavaScript snippet to strip HTML tags, remove boilerplate navigation text, and ensure the payload is under the context limit of the AI model.

6. **Hugging Face Node (AI Triage):** Passes the sanitized text to `meta-llama/Meta-Llama-3-8B-Instruct`. The prompt forces a strict JSON output containing a `sentiment_score` (0–100) and a `summary`.

7. **Hugging Face Node (Embedding):** Passes the AI-generated summary to `sentence-transformers/all-MiniLM-L6-v2` to convert the text into a 384-dimensional vector.

8. **Parallel Storage Nodes (Atomic Update):**
   - **Branch A (Firestore Node):** Updates the metadata (Sentiment, Summary, Timestamp) in the NoSQL database.
   - **Branch B (Pinecone Node):** Upserts the vector and appends metadata (e.g., `{"ticker": "NVDA"}`) for future semantic search.

---

## 3. Pipeline 2: The RAG Engine (Workflow B)

**Purpose:** Generate on-demand, highly accurate due diligence reports using the context gathered by Pipeline 1.

### Node-by-Node Execution Flow

1. **Webhook Node:** Listens for a POST request from the Next.js frontend containing the target ticker (e.g., `{"ticker": "AAPL"}`).

2. **Hugging Face Node (Query Embedding):** Transforms the requested ticker symbol into a 384-dimensional vector to match the database schema.

3. **Pinecone Node (Vector Search):** Executes a cosine similarity search against the index, applying a metadata filter to isolate only vectors related to the requested ticker. Retrieves the top 5 most relevant news summaries.

4. **Hugging Face Node (Analyst Synthesis):** Injects the retrieved context into the prompt of a heavy reasoning model (e.g., `meta-llama/Meta-Llama-3-70B-Instruct`). The AI evaluates the fresh context and streams a professional investment thesis.

5. **Google Cloud Firestore Node (Write):** Saves the generated markdown report into the `reports` collection. The frontend listens to this collection and renders the UI instantly.

---

## 4. The "Unbreakable" Infrastructure (Error Handling Patterns)

n8n will halt a workflow immediately if a single node fails. To survive rate limits, network blips, and AI cold starts, the backend implements the following resilience patterns.

### Pattern 1: Node-Level Exponential Backoff

APIs (like Bright Data or Hugging Face) often throw `429 Too Many Requests` or `503 Service Unavailable`. Instead of failing, the pipeline waits and retries politely.

- **Implementation:** On high-risk nodes (Bright Data HTTP Request, Hugging Face LLM), the **On Error** setting is changed from "Stop Workflow" to "Retry Node".
- **Configuration:** Max Tries is set to `3`. The wait time uses an exponential expression:
  ```
  {{ Math.pow(2, $runIndex) * 1000 }}
  ```
  This forces n8n to wait 1s → 2s → 4s before trying again, giving the external server time to recover.

### Pattern 2: Graceful Degradation (AI Fallback)

The free tier of Hugging Face is susceptible to "Cold Starts" where a model is temporarily unloaded from memory.

- **Implementation:** The primary AI Triage node has "Continue on Fail" enabled. If the node fails all 3 retry attempts, it outputs an error object instead of crashing the pipeline.
- **The Switch:** An IF node evaluates `{{ $json.error !== undefined }}`. If `true`, the workflow routes to a secondary Hugging Face node using a highly available, smaller model (like Mistral-7B). The system degrades slightly in reasoning quality to guarantee uptime.

### Pattern 3: Data Validation (Dead Letter Queue)

Bad input data crashes AI models downstream. If Bright Data returns a CAPTCHA wall or a blank page, it must be caught before it hits the LLM.

- **Implementation:** The Code Node (Step 5 of Ingestion) acts as a **Circuit Breaker**. If the scraped text is less than 200 characters, it throws a custom exception:
  ```javascript
  throw new Error("Payload too small, possible scraping block");
  ```
  This halts the execution for that specific ticker without affecting the rest of the batch.

### Pattern 4: The Global Error Manager (Try-Catch Microservice)

If an unforeseen error occurs (e.g., API keys expire, Pinecone is down), the failure must not be silent.

- **Implementation:** A completely separate workflow is created starting with the **Error Trigger** node.
- **Routing:** Inside the Settings of Workflow A and B, the "Error Workflow" dropdown is pointed to the Global Error Manager.
- **Action:** When any node fatally crashes, the Error Manager captures `$json.execution.id` and `$json.error.message`. It writes a `status: "failed"` flag to Firestore (so the frontend can display a graceful "Service Unavailable" message) and fires a Slack/Discord webhook to alert the developer.
