# AI CONTENT STUDIO
# DEVELOPMENT RULES

---

## Document Information

**Name:** Development Rules

**Version:** 1.0

**Status:** Active

**Owner:** AI Content Studio

**Related Documents:**
- docs/00_PRODUCT_BIBLE.md
- docs/01_PRD.md
- docs/07_ROADMAP.md
- docs/08_CHANGELOG.md
- docs/09_SPRINTS.md

---

# PURPOSE

This document defines how AI Content Studio must be developed.

These rules apply to every developer, AI assistant and future contributor.

Following these rules is mandatory.

---

# SOURCE OF TRUTH

The repository is the only source of truth.

Never rely on chat history.

Always rely on project documentation.

Priority order:

1. Product Bible
2. PRD
3. Development Rules
4. Roadmap
5. Sprint Documents
6. Source Code

If documentation and code conflict, report the conflict before changing code.

---

# DEVELOPMENT WORKFLOW

Every task follows the same process.

1. Analyze
2. Plan
3. Explain the plan briefly
4. Implement
5. Runtime Test
6. Report
7. Update Documentation

Never skip analysis.

Never jump directly into coding.

---

# SPRINT RULES

All work belongs to a sprint.

No work is performed outside a sprint unless explicitly approved.

Each sprint contains:

- Goal
- Tasks
- Scope
- Acceptance Criteria
- Runtime Tests
- Completion Report

---

# CHANGE POLICY

Never perform large architectural changes without approval.

Never rewrite working systems without a clear reason.

Prefer incremental improvements.

Small changes are preferred over large refactors.

---

# BACKWARD COMPATIBILITY

Never break existing features.

Before changing behavior:

- Identify affected modules.
- Evaluate impact.
- Preserve compatibility whenever possible.

---

# MODULAR ARCHITECTURE

Every feature must be modular.

Avoid tight coupling.

Prefer reusable components.

Avoid duplicate logic.

Business logic belongs in shared modules.

---

# FILE MODIFICATION RULES

Only modify files related to the current task.

Do not refactor unrelated files.

If another issue is discovered:

- Report it.
- Do not fix it unless requested.

---

# UI RULES

The interface must remain:

- Clean
- Minimal
- Guided
- Responsive
- Accessible
- Consistent

Every new screen must follow the existing design language.

---

# STORYBOARD RULE

Storyboard is the central data model.

No module may bypass the storyboard.

Every production step reads or writes storyboard data.

---

# CLIENT / SERVER RESPONSIBILITY

Client:

- UI
- Editing
- Rendering
- Preview
- Timeline
- Local processing

Server:

- Authentication
- Database
- AI requests
- Billing
- Secure operations

Do not move client responsibilities to the server without justification.

---

# AI PROVIDER RULES

Never hardcode an AI provider.

All providers must be accessed through an abstraction layer.

Current provider:

- Anthropic

Future providers:

- OpenAI
- Google
- DeepSeek
- Mistral
- Local Models

---

# DATABASE RULES

All database changes require:

- Migration
- Runtime verification
- Documentation update

Never edit production data manually.

Respect Supabase RLS policies.

---

# SECURITY RULES

Never expose secrets.

Never commit:

- API keys
- Tokens
- Passwords
- Credentials

Validate all external input.

Verify webhooks.

Use least privilege principles.

---

# PERFORMANCE RULES

Prefer:

- Lazy loading
- Memoization where appropriate
- Minimal API requests
- Reusable state
- Optimized rendering

Avoid unnecessary re-renders.

---

# TESTING RULES

Every completed task requires runtime testing.

Minimum verification:

- Navigation
- Saving
- Loading
- Database operations
- Error handling
- Rendering

Build success alone is not sufficient.

---

# DOCUMENTATION RULES

Every completed feature updates:

- CHANGELOG
- Roadmap (if applicable)
- Sprint status (if applicable)

Documentation is part of development.

A feature is not complete until documentation is updated.

---

# REPORT FORMAT

At the end of every completed task provide:

## Completed

What was implemented.

## Remaining

What still needs to be done.

## Risks

Potential issues or technical debt.

## Runtime Tests

What was tested.

## Files Changed

List of modified files.

## Recommendation

Suggested next task.

---

# GITHUB RULES

Commit only meaningful changes.

One logical change per commit.

Commit messages should clearly describe the change.

---

# CODE QUALITY

Code must be:

- Readable
- Maintainable
- Modular
- Consistent

Prefer clarity over cleverness.

Avoid unnecessary complexity.

---

# COMMUNICATION RULES

Responses should be:

- Concise
- Clear
- Action-oriented

Do not generate unnecessary long explanations.

Explain only what is relevant to the current task.

---

# NEVER DO

Never ignore the Product Bible.

Never ignore the PRD.

Never bypass the storyboard.

Never rewrite the project without approval.

Never modify unrelated modules.

Never trust chat history over repository documentation.

Never mark a task complete without runtime testing.

---

# DEFINITION OF DONE

A task is complete only when:

- Code is implemented.
- Runtime tests pass.
- No existing functionality is broken.
- Documentation is updated.
- Changelog is updated (if required).
- Sprint progress is updated (if required).

Only then is the task considered finished.

---

END OF DOCUMENT
