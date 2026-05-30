# AlphaStream AI — Product Requirements Document

**Track:** UNLOCKED - INTELLIGENCE  
**Date:** May 12, 2026  
**Status:** Hackathon Build Phase

---

## Executive Summary

AlphaStream AI is an "always-on" intelligence pipeline and dashboard designed to give retail investors and financial analysts institutional-grade market insights. It continuously scrapes unstructured data (breaking news, Reddit forums, financial blogs) using Bright Data, structures it using a cost-effective LLM routing system, and displays real-time sentiment and automated due diligence (DD) reports on a live dashboard.

---

## Problem Statement

- **Data Gatekeeping:** High-quality, real-time financial sentiment analysis is usually locked behind expensive institutional tools (e.g., Bloomberg Terminals).
- **Scraping Blockers:** Financial news sites and forums (like Reddit/X) have aggressive anti-bot protections, making it impossible to maintain reliable data pipelines using standard web scrapers.
- **AI Cost/Latency:** Feeding continuous streams of web data into heavy reasoning models (like GPT-4o) is too expensive and slow. Conversely, using small models results in poor financial analysis.

---

## Value Proposition

AlphaStream AI solves this by using Bright Data to reliably bypass geo-blocks and bot-detection, creating a self-healing pipeline. It optimizes AI costs by using **Multi-Model Routing** — sending massive streams of raw text to fast, cheap models for initial structuring, and only triggering expensive reasoning models when deep financial analysis is requested.

---

## Target Audience

- **Retail Traders:** Looking for an edge by understanding social sentiment and breaking news before it's priced into the market.
- **Financial Analysts:** Needing automated, up-to-the-minute due diligence reports on specific tickers.

---

## Core Features (MVP for Hackathon)

### Epic 1: Resilient Data Ingestion (The Backbone)

- **Feature 1.1 — Live News Fetcher:** Use Bright Data SERP API to query real-time news articles for user-defined stock tickers (e.g., $AAPL, $TSLA).
- **Feature 1.2 — Social Sentiment Scraper:** Use Bright Data Web Unlocker to scrape relevant subreddits (e.g., r/investing, r/wallstreetbets) and financial forums without getting IP banned.
- **Feature 1.3 — Pipeline Automation:** Set up n8n (or Make.com) workflows that trigger these scrapers automatically every 15 minutes to ensure data is always fresh.

### Epic 2: Multi-Model AI Processing (The Brains)

- **Feature 2.1 — Smart Model Routing:**
  - *Triage Layer:* Raw scraped text is sent to a fast, cheap model (e.g., Claude 3 Haiku or Llama 3) to extract entities, filter out noise, and assign a basic "Bullish/Bearish" sentiment score.
  - *Reasoning Layer:* If a user requests a "Deep Dive," the structured data is routed to a heavy model (e.g., GPT-4o or Claude 3.5 Sonnet) via an ensemble prompt to generate a comprehensive investment report.
- **Feature 2.2 — Vectorization (RAG):** Processed summaries are embedded and stored in a vector database to allow users to "Chat with the Market" regarding specific stocks.

### Epic 3: User Dashboard (The Face)

- **Feature 3.1 — Live Ticker Feed:** A sleek UI displaying the selected tickers, their current real-time sentiment score (0–100), and a feed of AI-summarized breaking news.
- **Feature 3.2 — 1-Click Due Diligence:** A button that compiles the last 24 hours of scraped data into a structured report (Strengths, Weaknesses, Market Catalysts, Social Sentiment).
- **Feature 3.3 — Chat Interface:** A chatbot window where users can ask questions like "Why is TSLA dropping today?" and the AI answers based on the live-scraped RAG pipeline.

---

## System Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Data Acquisition (Mandatory) | Bright Data Web Unlocker, Bright Data SERP API |
| Workflow Orchestration | n8n (or Make.com) for cron jobs and API connectivity |
| Backend & Database | Firebase (Firestore for structured data, Firebase Auth for login) |
| AI / LLM Layer | OpenRouter (model switching) or LangChain; Pinecone (Vector DB / RAG) |
| Frontend | Next.js 15 (React), Tailwind CSS, Shadcn UI components |

---

## User Flow

1. **Onboarding:** User logs into the AlphaStream web app via Firebase Auth.
2. **Dashboard View:** User lands on the dashboard and adds a ticker to their watchlist (e.g., "NVDA").
3. **Background Process:** The frontend pings the Firebase DB. If the data is older than 15 mins, an n8n webhook triggers Bright Data to fetch new SERP/Social data, processes it via the AI Triage Layer, and updates Firebase.
4. **Data Consumption:** User sees a sentiment gauge (e.g., "85% Bullish") and a bulleted list of why (AI summaries of the news).
5. **Deep Analysis:** User clicks "Generate Report." The heavy reasoning model reads the structured data and streams a detailed financial report directly to the UI.

---

*AlphaStream AI — Intelligence. Automated. Always On.*
