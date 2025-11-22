# QA Ticket Embeddings Migration Guide

## 📋 Overview

This migration script generates AI embeddings for all existing QA tickets in your database. This enables semantic search functionality in the QA Manager.

---

## 🚀 Quick Start

### 1. Prerequisites

Make sure you have:
- ✅ MongoDB running and accessible
- ✅ `.env` file configured with:
  - `MONGO_URI` - MongoDB connection string
  - `OPENAI_API_KEY` - OpenAI API key for embeddings
- ✅ All dependencies installed (`npm install`)

### 2. Run the Migration

From the project root directory:

```bash
node backend/scripts/generateQAEmbeddings.js
```

---

## 📊 What the Script Does

The migration script will:

1. **Connect to MongoDB** using your `MONGO_URI`
2. **Find all tickets** that need embeddings:
   - Tickets without embeddings
   - Tickets with `embeddingOutdated: true`
3. **Generate embeddings** for each ticket by combining:
   - Ticket ID
   - Short Description
   - Notes
   - Feedback
   - Category
   - Priority
   - Tags
   - Status
   - Agent Name & Team
4. **Save embeddings** to the database
5. **Process in batches** of 20 tickets with 1-second delays to respect OpenAI rate limits

---

## 🎯 Example Output

```
🚀 Starting QA Ticket Embedding Migration...

📊 Found 150 ticket(s) needing embeddings

📦 Processing Batch 1/8 (20 tickets)...
  ✓ Generated embedding for ticket: TICKET-001
  ✓ Generated embedding for ticket: TICKET-002
  ✓ Generated embedding for ticket: TICKET-003
  ...
  ⏳ Waiting 1 second before next batch...

📦 Processing Batch 2/8 (20 tickets)...
  ✓ Generated embedding for ticket: TICKET-021
  ⊘ Skipped ticket (no content): TICKET-022
  ...

============================================================
📈 Migration Summary:
============================================================
Total Tickets:     150
✅ Processed:      148
⊘ Skipped:         2
✗ Errors:          0
============================================================

✨ Migration completed successfully!
🔍 You can now use AI-powered semantic search for QA tickets.

👋 Closing database connection...
✅ Done!
```

---

## 🔍 What Gets Embedded

Each ticket's embedding is generated from the following fields:

| Field | Example | Description |
|-------|---------|-------------|
| **Ticket ID** | `TICKET-12345` | Unique ticket identifier |
| **Short Description** | `User cannot reset password` | Brief ticket summary |
| **Notes** | `Check with dev team about this` | QA agent's internal notes |
| **Feedback** | `Agent handled this excellently` | Feedback given to agent |
| **Category** | `Technical` | Ticket category |
| **Priority** | `High` | Priority level |
| **Tags** | `password, escalated` | Custom tags |
| **Status** | `Graded` | Current status |
| **Agent Name** | `John Doe` | Agent who handled the ticket |
| **Team** | `Support Team A` | Agent's team |

**Combined Embedding Text Example:**
```
Ticket ID: TICKET-12345 | Description: User cannot reset password |
Notes: Check with dev team | Feedback: Agent handled this excellently |
Category: Technical | Priority: High | Tags: password, escalated |
Status: Graded | Agent: John Doe | Team: Support Team A
```

---

## ⚙️ Configuration

### Batch Size

Default: **20 tickets per batch**

To change this, edit `generateQAEmbeddings.js`:

```javascript
const batchSize = 20; // Change this number
```

### Rate Limiting

Default: **1 second delay** between batches

To change this, edit the delay:

```javascript
await new Promise(resolve => setTimeout(resolve, 1000)); // milliseconds
```

---

## 🛠️ Troubleshooting

### Error: "MongoDB Connection Error"

**Solution:** Check your `MONGO_URI` in `.env` file

```env
MONGO_URI=mongodb://localhost:27017/your-database
# or for MongoDB Atlas:
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database
```

### Error: "OpenAI API Error"

**Solution:**
1. Check your `OPENAI_API_KEY` in `.env`
2. Verify you have credits in your OpenAI account
3. Check for rate limit errors (reduce batch size if needed)

### Tickets are Skipped (no content)

**This is normal!** Tickets without any text fields will be skipped:
- Empty ticket (only ID, no description/notes/feedback)
- These tickets can't be semantically searched anyway

### Want to Re-generate All Embeddings?

The script automatically only processes tickets that:
- Don't have embeddings yet, OR
- Have `embeddingOutdated: true`

To force regeneration of ALL embeddings, you can manually set all tickets to outdated first:

```javascript
// Run this in MongoDB shell or create a quick script:
db.tickets.updateMany({}, { $set: { embeddingOutdated: true } })
```

Then run the migration script again.

---

## 📈 Performance Notes

### OpenAI API Costs

- **Model Used:** `text-embedding-ada-002`
- **Cost:** ~$0.0001 per 1,000 tokens
- **Average Ticket:** ~150 tokens
- **150 tickets:** ~$0.002 (very cheap!)

### Execution Time

- **20 tickets/batch** with **1 second delay**
- **150 tickets** = ~8 batches = **~10 seconds total**

Very fast! ⚡

---

## 🔄 Re-running the Migration

It's safe to run this script multiple times:

- ✅ Only processes tickets that need it
- ✅ Skips tickets with valid embeddings
- ✅ Idempotent (same result every time)

---

## 🎉 After Migration

Once the migration is complete, you can:

1. ✅ Use **AI-powered semantic search** in QA Manager
2. ✅ Search tickets by meaning, not just keywords
3. ✅ Find similar tickets across all QA agents
4. ✅ Reference old feedback with natural language queries

**Example Searches:**
- "billing issues with high priority"
- "tickets where agent escalated to tech team"
- "excellent customer service examples"
- "password reset problems"

---

## 📞 Support

If you encounter any issues:

1. Check the error message in the console
2. Verify your `.env` configuration
3. Check MongoDB connection
4. Verify OpenAI API key and credits
5. Review the troubleshooting section above

---

**Happy Migrating! 🚀**
