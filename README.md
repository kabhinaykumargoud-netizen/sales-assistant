# AI WhatsApp Sales Assistant — Backend

Complete production-ready Node.js backend for the AI WhatsApp Sales Assistant hackathon project.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | SQLite (dev) / PostgreSQL (prod) via Prisma ORM |
| Auth | JWT (7-day tokens) |
| AI | Anthropic Claude API |
| WhatsApp | Meta WhatsApp Business API |
| Jobs | node-cron |
| Security | helmet, express-rate-limit, bcryptjs |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and WHATSAPP_* values

# 3. Set up database
npx prisma generate
npx prisma db push
node prisma/seed.js

# 4. Start server
npm run dev

# Demo login
# Email: demo@salesbot.com
# Password: password123
```

---

## Environment Variables

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your_secret_here"
PORT=3000
ANTHROPIC_API_KEY="sk-ant-..."
WHATSAPP_TOKEN="your_wa_business_token"
WHATSAPP_PHONE_ID="your_phone_number_id"
WHATSAPP_VERIFY_TOKEN="your_verify_token"
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Register a business |
| POST | /api/v1/auth/login | Login |
| GET | /api/v1/auth/me | Get profile |
| PATCH | /api/v1/auth/profile | Update profile |
| POST | /api/v1/auth/change-password | Change password |

### Leads
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/leads | List leads (filter by stage, status, search) |
| POST | /api/v1/leads | Create lead |
| GET | /api/v1/leads/:id | Get lead with full history |
| PATCH | /api/v1/leads/:id | Update lead |
| DELETE | /api/v1/leads/:id | Delete lead |
| POST | /api/v1/leads/:id/stage | Move lead to new pipeline stage |
| POST | /api/v1/leads/:id/tag-lost | Tag as lost with reason |
| GET | /api/v1/leads/pipeline/summary | Pipeline counts + revenue forecast |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/messages/inbox | Grouped inbox by lead |
| GET | /api/v1/messages?leadId= | Message thread for a lead |
| POST | /api/v1/messages/send | Send WhatsApp message |
| POST | /api/v1/messages/ai-suggestions | Get 3 AI reply suggestions |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/products | List products |
| POST | /api/v1/products | Add product |
| PATCH | /api/v1/products/:id | Update product |
| DELETE | /api/v1/products/:id | Delete product |
| POST | /api/v1/products/:id/restock | Restock + notify waitlist |
| POST | /api/v1/products/:id/waitlist | Join waitlist |
| GET | /api/v1/products/:id/bundle-recommendations | AI bundle suggestions |

### Catalogue
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/catalogue | Full catalogue grouped by category |
| POST | /api/v1/catalogue/share | Share catalogue to WhatsApp lead |
| POST | /api/v1/catalogue/invoice | Generate + send GST invoice |

### Campaigns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/campaigns | List campaigns |
| POST | /api/v1/campaigns | Create campaign |
| POST | /api/v1/campaigns/flash-sale | Create flash sale |
| POST | /api/v1/campaigns/:id/send | Send campaign immediately |
| DELETE | /api/v1/campaigns/:id | Delete campaign |

### Templates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/templates | List templates (filter by category) |
| POST | /api/v1/templates | Create template |
| POST | /api/v1/templates/:id/use | Use template (returns personalised text) |
| DELETE | /api/v1/templates/:id | Delete template |

### Reminders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/reminders | Get reminders (overdue, today, upcoming, done) |
| POST | /api/v1/reminders | Create reminder |
| PATCH | /api/v1/reminders/:id/complete | Mark complete |
| PATCH | /api/v1/reminders/:id/snooze | Snooze by N minutes |
| POST | /api/v1/reminders/:id/follow-up | Generate AI follow-up message |
| DELETE | /api/v1/reminders/:id | Delete reminder |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/analytics/dashboard | Key metrics (leads, messages, response time) |
| GET | /api/v1/analytics/funnel | Stage-by-stage conversion funnel |
| GET | /api/v1/analytics/heatmap | Message volume by hour/day |
| GET | /api/v1/analytics/revenue | Revenue forecast by pipeline stage |
| GET | /api/v1/analytics/sentiment | Sentiment trends over 7 days |
| GET | /api/v1/analytics/agents | Agent performance metrics |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/agents | List agents |
| POST | /api/v1/agents | Add agent |
| DELETE | /api/v1/agents/:id | Remove agent |
| PATCH | /api/v1/agents/leads/:leadId/assign | Assign lead to agent |

### Webhook
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/webhook | WhatsApp webhook verification |
| POST | /api/v1/webhook | Incoming WhatsApp messages |

---

## Background Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Drip sequences | Every hour | Re-engage cold leads at day 3, 7, 14 |
| Scheduled campaigns | Every 5 min | Fire campaigns at scheduled time |
| Reminder alerts | Every 30 min | Log upcoming reminders |
| DND flush | 8:01 AM daily | Send queued do-not-disturb messages |
| Analytics snapshot | Midnight daily | Log daily business metrics |

---

## AI Features (Claude-powered)

- **Reply suggestions** — 3 context-aware replies per conversation
- **Intent scoring** — 0–100 buyer readiness score updated live
- **Language detection** — auto-detect Telugu, Hindi, Tamil, English
- **Sentiment analysis** — positive / hesitant / neutral / frustrated
- **Auto-reply** — AI handles low-intent messages, flags high-intent for humans
- **Follow-up generation** — personalised re-engagement messages
- **Negotiation assistant** — counter-offer suggestions with floor price
- **Reply quality scoring** — AI scores its own outputs 0–100
- **Bundle recommendations** — cross-sell suggestions per product
- **GST invoice generation** — formatted invoice text for WhatsApp

---

## Project Structure

```
src/
├── app.js                    # Entry point
├── routes/                   # Express routers
│   ├── auth.js
│   ├── leads.js
│   ├── products.js
│   ├── messages.js
│   ├── campaigns.js
│   ├── templates.js
│   ├── reminders.js
│   ├── webhook.js
│   ├── analytics.js
│   ├── catalogue.js
│   └── agents.js
├── controllers/              # Business logic
│   ├── authController.js
│   ├── leadController.js
│   ├── messageController.js
│   ├── webhookController.js
│   ├── productController.js
│   ├── campaignController.js
│   ├── reminderController.js
│   ├── analyticsController.js
│   ├── catalogueController.js
│   ├── templateController.js
│   └── agentController.js
├── services/
│   ├── aiService.js          # All Claude API calls
│   └── whatsappService.js    # WhatsApp Business API
├── middleware/
│   ├── auth.js               # JWT verification
│   └── errorHandler.js       # Global error handler
├── jobs/
│   └── index.js              # Cron background jobs
└── utils/
    └── prisma.js             # Prisma client singleton

prisma/
├── schema.prisma             # Database schema (13 models)
└── seed.js                   # Demo data seed
```

---

## Database Models

Business · Agent · Product · Bundle · BundleItem · Lead · StageHistory · Message · MessageItem · Campaign · Template · Reminder · Enquiry · Waitlist · ApiKey

---

## Deployment

### Railway / Render
```bash
# Set DATABASE_URL to PostgreSQL
# Change schema.prisma provider from sqlite to postgresql
# Push to git — auto-deploy
```

### Environment for production
```env
DATABASE_URL="postgresql://user:pass@host:5432/db"
NODE_ENV=production
JWT_SECRET="long_random_secret"
```
