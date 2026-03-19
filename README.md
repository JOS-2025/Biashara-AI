# Biashara AI

**Biashara AI** is an AI-powered backend platform that automatically parses business transactions from text messages, stores them in a database, and provides a webhook API for integration with frontend apps or chat platforms.

The backend uses **Node.js**, **Express**, **OpenAI API** for AI parsing, and **Supabase** for database storage.

---

## Features

- AI-powered parsing of transaction messages
- Supports sale and expense detection
- Stores transactions in Supabase
- Webhook API to integrate with frontend apps or messaging platforms
- Environment-based configuration for API keys and database

---

## Project Structure

```text
biashara-ai/
├── README.md
├── package.json
├── .env
└── src/
    ├── config/
    │   └── db.js
    ├── controllers/
    │   └── transactionController.js
    ├── routes/
    │   └── webhook.js
    ├── server.js
    ├── services/
    │   ├── aiService.js
    │   └── dbService.js
    └── utils/
        └── parser.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
