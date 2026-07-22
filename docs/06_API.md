# docs/06_API.md

# AI Content Studio
## API Specification

Version: 1.0

---

# Purpose

This document defines all backend API endpoints used by AI Content Studio.

It specifies responsibilities, request/response contracts, authentication rules and future extension points.

This document is the single source of truth for API development.

---

# API Principles

- REST-first
- JSON only
- Stateless
- Authentication required unless explicitly public
- Consistent error format
- Backward compatible changes only

---

# Current API Modules

## AI

Base Path

/app/api/ai

Responsibilities

- Story generation
- Prompt generation
- Rewrite
- Continue
- Translation
- AI provider communication

Authentication

Required

Credits

Consumes credits according to AI task.

---

## Stripe

Base Path

/app/api/stripe

Responsibilities

- Checkout Session
- Billing
- Subscription
- Payment confirmation
- Credits

Authentication

Required

---

## Webhooks

Base Path

/stripe/webhook

Responsibilities

- Payment confirmation
- Subscription updates
- Credit synchronization

Must validate Stripe signature.

---

# Authentication

Provider

Supabase Auth

Method

Bearer Token / Session Cookie

Protected APIs

- AI
- Projects
- Storyboards
- Billing
- User

---

# Standard Response

Success

```json
{
  "success": true,
  "data": {}
}
```

Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

---

# HTTP Status Codes

200 OK

201 Created

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

429 Too Many Requests

500 Internal Server Error

---

# AI Provider Layer

Current

Anthropic

Planned

- OpenAI
- Google Gemini
- DeepSeek
- OpenRouter
- Local Models

API layer must never directly depend on a single provider.

Provider Adapter architecture is mandatory.

---

# Credit Consumption

Story Generation

Consumes AI Credits

Prompt Generation

Consumes AI Credits

Rewrite

Consumes AI Credits

Translation

Consumes AI Credits

Billing APIs

No Credits

Authentication APIs

No Credits

---

# Future APIs

Planned

- Render API
- Voice API
- Image API
- Thumbnail API
- Shorts API
- Publishing API
- Team Workspace API
- Public Developer API

---

# Versioning

Current Version

v1

Breaking changes require a new API version.

---

# Development Rules

- Never break existing clients.
- Never expose secrets.
- Validate every request.
- Return consistent JSON.
- Log server errors.
- Use provider abstraction.
- Keep endpoints independent.
