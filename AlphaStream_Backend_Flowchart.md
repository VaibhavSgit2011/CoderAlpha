# AlphaStream AI — Backend Flowchart

Visual representation of the Always-On Ingestion Pipeline flow.

---

## Pipeline Flow

```
Cron Trigger: Every 15 Mins
        │
        ▼
Fetch Watchlist: Firestore
        │
        ▼
   Ticker Stale?
    │         │
   No         Yes
    │          │
    ▼          ▼
Terminated   Bright Data SERP / Web Unlocker
                    │
                    ▼
               Success?
             │         │
            Yes        No
             │          │
             ▼          ▼
   JS Node: Data    Retry Loop: 3 Attempts
   Validation &          │
   Cleaning         Fail All?
             │          │
             │         Yes
             │          │
             ▼          ▼
     AI Triage:   Global Error Handler:
   Hugging Face   Update Firestore Status
       LLM
        │
        ▼
   Model Active?
    │         │
   Yes       No/503
    │          │
    ▼          ▼
Generate    Wait 20s / Trigger
Sentiment & Fallback Model
 Summary
    │
    ▼
Hugging Face: Generate
 Vector Embeddings
    │
    ▼
Parallel Atomic Update
 ┌──────────┴──────────────┐
 ▼                         ▼
Firestore: Store JSON   Pinecone: Upsert
 & Metadata              Vectors
 └──────────┬──────────────┘
            ▼
  End: Notify Frontend
      via Listener
```

---

## Decision Points Summary

| Node | Condition | Yes Path | No Path |
|---|---|---|---|
| Ticker Stale? | Is data older than 15 mins? | Proceed to scrape | Terminate |
| Success? (Bright Data) | Did scrape succeed? | Data Validation | Retry Loop |
| Fail All? | Did all 3 retries fail? | Global Error Handler | Continue |
| Model Active? | Is Hugging Face model available? | Generate Sentiment | Wait 20s / Fallback |
