# AI CONTENT STUDIO
# DATABASE SPECIFICATION

---

# Document Information

Name: Database Specification

Version: 1.0

Status: Active

Owner: AI Content Studio

Related Documents

- docs/01_PRD.md
- docs/04_ARCHITECTURE.md
- docs/03_DEVELOPMENT_RULES.md

---

# PURPOSE

This document defines the complete database architecture of AI Content Studio.

It describes:

- Database structure
- Table responsibilities
- Relationships
- Constraints
- Security policies
- Migration strategy
- Future scalability

This document is the single source of truth for all database-related development.

---

# DATABASE ENGINE

Current Database

Supabase PostgreSQL

Features

- PostgreSQL
- Row Level Security (RLS)
- Auth
- Storage
- Realtime
- JSONB
- SQL Functions
- Triggers

---

# DATABASE DESIGN PRINCIPLES

The database must be:

- Secure
- Simple
- Scalable
- Modular
- Backward Compatible

Never duplicate information.

Prefer references over duplicated fields.

---

# MAIN TABLES

Current production tables

## profiles

Purpose

Stores user profile information.

Primary Key

id (UUID)

Linked To

auth.users

Fields

- id
- email
- full_name
- avatar_url
- credits
- subscription_plan
- created_at
- updated_at

Owner

Authentication System

---

## projects

Purpose

Stores every project created by users.

Primary Key

id

Owner

User

Fields

- id
- user_id
- title
- description
- content_type
- language
- status
- created_at
- updated_at

Relationship

One User

↓

Many Projects

---

## episodes

Purpose

Stores production data.

Each episode owns a complete storyboard.

Primary Key

id

Fields

- id
- project_id
- title
- storyboard (JSONB)
- status
- created_at
- updated_at

Relationship

One Project

↓

Many Episodes

---

## subscriptions

Purpose

Stores billing information.

Fields

- id
- user_id
- stripe_customer_id
- stripe_subscription_id
- plan
- status
- renewal_date
- created_at

---

# RELATIONSHIPS

auth.users

↓

profiles

↓

projects

↓

episodes

subscriptions

↓

profiles

---

# STORYBOARD JSON

Storyboard is stored as JSONB.

Each scene contains

- id
- title
- paragraph
- prompt
- image
- voice
- duration
- subtitle
- transitions
- metadata

Every production module reads or writes this object.

---

# FUTURE TABLES

Planned

## assets

Stores uploaded assets.

Examples

- Images
- Audio
- Video
- Documents

---

## ai_jobs

Tracks AI generation jobs.

Examples

- Prompt generation
- Story generation
- Voice generation

---

## exports

Stores exported video metadata.

---

## teams

Business accounts.

---

## team_members

Workspace users.

---

## api_keys

Public API support.

---

## plugins

Plugin registry.

---

# ROW LEVEL SECURITY

All tables must use RLS.

Every query must respect

auth.uid()

Users may access only their own data.

No public write access.

No anonymous write access.

---

# AUTHENTICATION

Authentication

Supabase Auth

Supported

- Email
- Google (planned)
- GitHub (planned)

Every authenticated user automatically receives

- Profile
- Initial credits

---

# TRIGGERS

Current Trigger

User Created

↓

Create Profile

↓

Assign Credits

Future Triggers

Subscription Updated

↓

Update Credits

Project Deleted

↓

Delete Related Episodes

---

# MIGRATIONS

Every database modification requires

Migration

↓

Verification

↓

Documentation Update

↓

Runtime Test

Never modify production tables manually.

---

# INDEXING

Current

Primary Keys

Foreign Keys

Future

GIN index for JSONB storyboard

Search indexes

Project title indexes

---

# JSONB STRATEGY

Storyboard remains inside JSONB.

Reason

- Flexible schema
- Easy versioning
- Low migration cost
- Fast iteration

Only normalize when absolutely necessary.

---

# CREDIT SYSTEM

Credits belong to profiles.

Every AI operation consumes credits.

Examples

Scenario

Storyboard

Prompt

Image

Voice

Video

Credits must never become negative.

---

# BILLING RELATIONSHIP

Stripe

↓

Webhook

↓

Subscription

↓

Credits

↓

User Access

---

# DATA LIFECYCLE

Create

↓

Edit

↓

Autosave

↓

Persist

↓

Export

↓

Archive

↓

Delete

---

# BACKUP STRATEGY

Daily backups

Migration history

Versioned schema

Rollback support

---

# SECURITY

Never expose internal IDs.

Never expose service role keys.

Always validate ownership.

Always verify RLS.

Never bypass authentication.

---

# PERFORMANCE

Prefer JSONB reads.

Avoid unnecessary joins.

Use indexes.

Batch updates when possible.

Avoid excessive writes.

---

# FUTURE SCALABILITY

Database is designed for

- AI Providers
- Teams
- Enterprise
- Public API
- Marketplace
- Plugin System

without major schema redesign.

---

# DATABASE VERSION

Current

Version 1

Migration Files

schema.sql

migration-v2.sql

migration-v3.sql

Future migrations

migration-v4.sql

migration-v5.sql

...

---

# DEFINITION OF DONE

A database task is complete only if

✓ Migration created

✓ Runtime tested

✓ RLS verified

✓ Documentation updated

✓ Rollback possible

---

END OF DOCUMENT
