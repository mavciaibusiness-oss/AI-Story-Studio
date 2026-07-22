# AI CONTENT STUDIO
## ARCHITECTURE DOCUMENT

---

### Document Information

| Field | Value |
|---|---|
| Name | Architecture Document |
| Version | 1.0 |
| Status | Active |
| Owner | AI Content Studio |
| Last Updated | 2026-07-22 |

References:

- docs/00_PRODUCT_BIBLE.md
- docs/01_PRD.md
- docs/03_DEVELOPMENT_RULES.md
- docs/07_ROADMAP.md

---

## 1. Design Principles

This section explains why the architecture is designed this way. Every principle is a deliberate trade-off. When two approaches conflict, these principles determine the winner.

### 1.1 Storyboard First

The storyboard is the single data object that drives the entire platform. There is no separate database for scripts, prompts, images, subtitles, or voice metadata. Every module reads from and writes to the same storyboard object stored as a JSONB column in the episodes table.

**Why:** A central data model eliminates synchronization problems. When the script changes, prompts, subtitles, and voice text update automatically because they live on the same object. There is no "data got out of sync" failure mode. Adding a new field to the storyboard immediately makes it available to every module without migration or integration work.

**Trade-off:** The storyboard object can grow large for projects with many scenes. This is acceptable because the object is text-only (media blobs are never serialized) and PostgreSQL handles JSONB efficiently up to tens of megabytes.

### 1.2 Client First

Media processing (image manipulation, video rendering, audio analysis, subtitle timing) happens entirely in the browser. The server never receives, stores, or processes user media files.

**Why:** Three reasons. First, privacy: user content never leaves their device. Second, cost: server-side video processing requires expensive GPU instances, CDN bandwidth, and storage. Browser-native APIs (Canvas, MediaRecorder, Web Audio, FFmpeg.wasm) eliminate these costs entirely. Third, latency: local processing avoids upload/download round trips.

**Trade-off:** Processing capability is limited by the user's hardware. Older devices may render slowly. Safari does not support MediaRecorder canvas capture, so video export is unavailable there. These trade-offs are acceptable because the target user (content creator) typically has a capable machine, and non-video modules work everywhere.

### 1.3 AI Agnostic

The platform must never be locked to a single AI provider. AI is used only for text generation (scripts, prompts, SEO metadata, translations). The system must support swapping or adding providers without changing any module code.

**Why:** AI providers change pricing, availability, and capability frequently. Provider lock-in creates business risk. A creator in a region where Anthropic is unavailable should still be able to use the platform with an alternative provider.

**Current state:** The codebase currently calls Anthropic directly. Provider abstraction is designed but not yet implemented. This is the highest-priority architectural debt.

### 1.4 Modular

Every module is a self-contained page that reads from and writes to the storyboard through the global store. Modules do not import from each other. Shared logic lives in lib/ files (engine.js, storyboard.js, wizard.js).

**Why:** Modularity enables independent development, testing, and replacement of any production step. A new module (e.g., AI Avatar, Podcast) can be added by creating a new page and registering it in the wizard, without touching any existing module.

**Rule:** If two modules need the same logic, that logic moves to lib/. Modules never import from each other's page files.

### 1.5 Progressive Enhancement

The platform works with minimum configuration (Supabase only) and gains features as optional services are configured. Stripe not configured? The app works without payments. Anthropic key missing? The error message explains what to add. Future providers not connected? Existing ones continue working.

**Why:** Development, testing, and self-hosted deployments should not require every external service to be configured. Each integration is additive.

### 1.6 Backward Compatible

Database migrations never drop columns, delete data, or break existing storyboard structures. The normalize() function fills missing fields with defaults when reading from the database. Old records gain new fields automatically.

**Why:** Users must never lose work. A storyboard saved six months ago must load correctly today, even if the schema has evolved significantly. The normalize() function is the migration layer that runs at read time, not at deploy time.

**Rule:** New storyboard fields always have defaults in emptyStoryboard(). New scene fields always have defaults in emptyScene(). The serializable() function strips runtime-only fields before writing.

---

## 2. Layer Architecture

The system is organized in five layers. Dependencies flow strictly downward. No lower layer imports from a higher layer.

```
┌─────────────────────────────────────────────────────┐
│  PRESENTATION                                       │
│  app/studio/* pages, app/giris, app/page.jsx        │
│  UI components, user interaction, page routing       │
├─────────────────────────────────────────────────────┤
│  STATE                                              │
│  lib/store.jsx (StudioProvider, useStudio)           │
│  Global storyboard state, auto-save, callAI bridge   │
├─────────────────────────────────────────────────────┤
│  ENGINE                                             │
│  lib/engine.js, lib/storyboard.js, lib/wizard.js    │
│  Media processing, data model, wizard logic          │
├─────────────────────────────────────────────────────┤
│  DATA                                               │
│  lib/supabase-browser.js, lib/supabase-server.js    │
│  Database access, authentication, session management │
├─────────────────────────────────────────────────────┤
│  EXTERNAL                                           │
│  Anthropic API, Stripe API, Supabase, FFmpeg CDN    │
│  Third-party services accessed via API calls         │
└─────────────────────────────────────────────────────┘
```

### Layer Rules

**Presentation → State:** Pages call useStudio() to read/write storyboard. Pages call callAI() for AI requests. Pages import engine functions for media processing.

**State → Engine:** Store uses normalize() and serializable() from storyboard.js for read/write. Store does not use engine.js directly.

**State → Data:** Store calls getSupabaseBrowser() for database operations. Auto-save writes serialized storyboard to episodes table.

**Engine → nothing:** Engine functions are pure. They take inputs and return outputs. They do not access state, database, or external services. Exception: FFmpeg.wasm loads its core from CDN on first use.

**Data → External:** Supabase client connects to Supabase project. API routes connect to Anthropic and Stripe.

---

## 3. Folder Structure

```
AI-Story-Studio/
│
├── app/                        PRESENTATION LAYER
│   ├── page.jsx                Landing page (public)
│   ├── layout.jsx              Root layout (I18nProvider, metadata, fonts)
│   ├── globals.css             Global styles (dark theme, components)
│   ├── giris/                  Login and registration page
│   ├── auth/
│   │   ├── callback/           Email confirmation handler (GET)
│   │   └── signout/            Sign out handler (GET)
│   ├── api/
│   │   ├── ai/                 AI text generation endpoint (POST)
│   │   └── stripe/
│   │       ├── checkout/       Stripe checkout session creator (POST)
│   │       └── webhook/        Stripe event handler (POST)
│   ├── studio/
│   │   ├── layout.jsx          Studio shell (auth guard, sidebar, roadmap, store)
│   │   ├── page.jsx            Dashboard (redirect to projeler)
│   │   ├── projeler/           Module 01: Project management
│   │   ├── senaryo/            Module 02: Script generation
│   │   ├── storyboard/         Module 03: Storyboard overview
│   │   ├── karakterler/        Module 04: Character cards
│   │   ├── promptlar/          Module 05: Prompt generation
│   │   ├── gorseller/          Module 06: Image/video import
│   │   ├── seslendirme/        Module 07: Voice import
│   │   ├── atolye/             Module 08: Video editing & render
│   │   ├── altyazi/            Module 09: Subtitle generation
│   │   ├── thumbnail/          Module 10: Thumbnail composition
│   │   ├── shorts/             Module 11: Shorts extraction
│   │   └── youtube/            Module 12: Publishing metadata
│   ├── gizlilik/               Privacy policy (public, legal)
│   ├── kullanim-kosullari/     Terms of service (public, legal)
│   ├── kvkk/                   KVKK notice (public, legal)
│   └── iletisim/               Contact page (public, legal)
│
├── lib/                        STATE + ENGINE LAYERS
│   ├── store.jsx               Global state provider, auto-save, callAI, parseJSONLoose
│   ├── engine.js               Browser production engine (1183 lines)
│   ├── storyboard.js           Data model, constants, normalize/serialize
│   ├── wizard.js               Wizard step definitions, completion logic
│   ├── i18n.jsx                Internationalization provider (TR/EN, 338 keys)
│   ├── supabase-browser.js     Supabase client factory (browser)
│   ├── supabase-server.js      Supabase client factory (server, cookies)
│   ├── Sidebar.jsx             Navigation sidebar component
│   ├── Roadmap.jsx             Progress roadmap bar component
│   ├── EpisodeBar.jsx          Episode selector bar component
│   ├── Waveform.jsx            Audio waveform display component
│   └── WizardFooter.jsx        Step navigation footer component
│
├── supabase/                   DATA LAYER DEFINITIONS
│   ├── schema.sql              Base schema (v1): tables, RLS, triggers
│   ├── migration-v2.sql        Storyboard column, format field
│   ├── migration-v3.sql        Settings, scene engine fields, data migration
│   └── verify-v3.sql           Migration verification queries
│
├── public/                     STATIC ASSETS
│   └── (favicon, images)       Served directly by Next.js
│
├── docs/                       PROJECT DOCUMENTATION
│   ├── 99_AI_CONTEXT.md        AI assistant rules (read first)
│   ├── 00_PRODUCT_BIBLE.md     Vision, mission, philosophy
│   ├── 01_PRD.md               Product requirements
│   ├── 03_DEVELOPMENT_RULES.md Development workflow rules
│   └── 04_ARCHITECTURE.md      This document
│
├── ai/                         AI ASSISTANT CONFIGURATION
│   └── CLAUDE.md               Claude-specific development guide
│
├── middleware.js                Auth middleware (token refresh, route protection)
├── next.config.js              Next.js configuration
├── package.json                Dependencies and scripts
├── flow-toolkit.html           Standalone collage drag-and-drop tool (not integrated)
├── KURULUM.md                  Installation guide
├── README.md                   Project overview
├── YENILIKLER.md               Changelog (Turkish)
└── MIGRASYON.md                Migration guide
```

### Folder Responsibilities

| Folder | Responsibility | Who Modifies |
|---|---|---|
| app/ | UI pages, API routes, layouts | Presentation changes only |
| lib/ | Shared logic, state, engine | Business logic changes |
| supabase/ | Database schema, migrations | Schema changes only |
| docs/ | Project documentation | Every completed feature |
| ai/ | AI assistant configuration | Architecture changes |
| public/ | Static files | Rarely |

### Naming Convention

Pages use Turkish route names (senaryo, gorseller, atolye) because the primary market is Turkey. Internal code (variable names, function names, comments) uses Turkish for user-facing strings and English for technical terms. i18n keys bridge the gap for multi-language support.

---

## 4. Module Dependency Map

Modules communicate exclusively through the storyboard object in the global store. No module imports from another module's page file.

```
                    ┌──────────┐
                    │ Projects │
                    │  (M01)   │
                    └────┬─────┘
                         │ creates episode, loads storyboard
                         ▼
                    ┌──────────┐
                    │  Script  │
                    │  (M02)   │
                    └────┬─────┘
                         │ populates scenes[].paragraph
                         ▼
                    ┌──────────┐
                    │Storyboard│
                    │  (M03)   │
                    └────┬─────┘
                         │ sets metadata (format, style, aspect)
                    ┌────┴─────┐
                    ▼          ▼
              ┌──────────┐ ┌──────────┐
              │Characters│ │ Prompts  │
              │  (M04)   │ │  (M05)   │
              └────┬─────┘ └────┬─────┘
                   │            │ writes scenes[].imagePrompt etc.
                   │ character  ▼
                   │ injection ┌──────────┐
                   └──────────►│  Images  │
                               │  (M06)   │
                               └────┬─────┘
                                    │ sets scenes[].image / .video
                                    ▼
                               ┌──────────┐
                               │  Voice   │
                               │  (M07)   │
                               └────┬─────┘
                                    │ sets scenes[].voice, .voiceDuration
                                    ▼
                               ┌──────────┐
                               │  Video   │
                               │  (M08)   │
                               └────┬─────┘
                                    │ renders final video
                         ┌──────────┼──────────┐
                         ▼          ▼          ▼
                   ┌──────────┐┌──────────┐┌──────────┐
                   │Subtitles ││Thumbnail ││ Shorts   │
                   │  (M09)   ││  (M10)   ││  (M11)   │
                   └────┬─────┘└──────────┘└──────────┘
                        │
                        ▼
                   ┌──────────┐
                   │Publishing│
                   │  (M12)   │
                   └──────────┘
```

### Dependency Rules

Every arrow represents data flowing through the storyboard, not a code import. M06 does not import from M05. M06 reads scenes[].imagePrompt that M05 wrote. If M05 is skipped (user writes prompts externally), M06 still works.

The only cross-module data dependency that requires ordering is: Characters (M04) must be created before Prompts (M05) if character consistency is desired. The wizard enforces this order but does not block skipping.

---

## 5. Request Lifecycle

### 5.1 Page Navigation Request

```
User clicks sidebar link
  │
  ▼
Browser (client-side routing)
  │
  ▼
middleware.js
  ├── Route is /studio/* → auth check
  │   ├── getUser() → token valid → continue
  │   └── getUser() → token expired → refresh → cookie updated → continue
  │   └── getUser() → no session → redirect /giris
  └── Route is public → pass through
  │
  ▼
Page component renders
  │
  ▼
useStudio() reads storyboard from store
  │
  ▼
Page displays data
```

### 5.2 AI Generation Request

```
User clicks "Generate" in a module page
  │
  ▼
Page builds prompt from storyboard data
  │
  ▼
callAI(task, prompt) → POST /api/ai
  │
  ▼
API Route (server)
  ├── getSupabaseServer() → create client from cookies
  ├── auth.getUser() → verify user identity
  ├── profiles.select() → get credits and plan
  ├── credit check → cost <= credits?
  │   └── No → 402 "Kredi yetersiz"
  │   └── Yes → continue
  ├── Anthropic API call (model fallback chain)
  │   ├── Model 1 → 404 → try Model 2
  │   ├── Model 2 → 200 OK → extract text
  │   └── All models fail → 502 error
  ├── profiles.update() → deduct credits
  └── Response { text, creditsLeft, model }
  │
  ▼
Client receives response
  │
  ▼
parseJSONLoose(text) → structured data
  │
  ▼
setStoryboard(updater) → update store
  │
  ▼
Auto-save (800ms debounce) → Supabase update
  │
  ▼
UI re-renders with new data
```

### 5.3 Media Processing Request (Client-Only)

```
User uploads file or clicks "Render"
  │
  ▼
Browser File API reads file into Blob
  │
  ▼
Engine function processes Blob
  ├── Collage: Canvas splits grid → individual Blob per cell
  ├── Audio: AudioContext decodes → duration extracted
  ├── Image: createImageBitmap → Ken Burns offscreen canvas
  ├── Video: <video> element → readyState >= 2
  │
  ▼
Results stored in React state (in-memory)
  ├── scene.image = { blob, url }
  ├── scene.voice = { blob }
  ├── scene.voiceDuration = number
  │
  ▼
storyboard text fields updated via setStoryboard
  │
  ▼
Auto-save writes ONLY text fields (serializable strips blobs)
  │
  ▼
UI re-renders with media previews
```

### 5.4 Payment Request

```
User clicks "Pro'ya Geç"
  │
  ▼
POST /api/stripe/checkout
  ├── getUser() → verify auth
  ├── Stripe API → create checkout session
  │   ├── mode: subscription
  │   ├── client_reference_id: user.id
  │   └── success/cancel URLs
  └── Response { url }
  │
  ▼
Browser redirects to Stripe Checkout page
  │
  ▼
User completes payment on Stripe
  │
  ▼
Stripe sends webhook → POST /api/stripe/webhook
  ├── Event: checkout.session.completed
  │   ├── Extract client_reference_id (user ID)
  │   ├── Supabase admin: profiles.update { plan: 'pro', credits: 5000 }
  │   └── Response 200
  ├── Event: customer.subscription.deleted
  │   ├── Supabase admin: profiles.update { plan: 'free', credits: 100 }
  │   └── Response 200
  └── Unknown event → Response 200 (ignore)
  │
  ▼
User returns to app → profile refreshed → Pro features active
```

---

## 6. Storyboard Pipeline

The storyboard lifecycle has five stages. Understanding this pipeline is essential for any data-related change.

```
CREATE          NORMALIZE         MUTATE           SERIALIZE         PERSIST
emptyStoryboard → normalize()   → setStoryboard() → serializable() → Supabase
                  (read from DB)  (user actions)    (strip blobs)     (auto-save)
```

### 6.1 CREATE — emptyStoryboard(patch)

Called when a new episode is created. Returns a storyboard with all fields set to defaults. Optional patch parameter allows pre-setting fields (e.g., format, language).

### 6.2 NORMALIZE — normalize(sb)

Called when loading a storyboard from the database. Merges the stored object with current defaults. This is the backward compatibility layer:

- Missing top-level fields get current defaults
- Missing scene fields get emptyScene() defaults
- scratch and wizard sub-objects are merged, not replaced
- Scenes are re-numbered (scene: i + 1)
- voiceText falls back to paragraph if empty
- subtitle falls back to voiceText, then paragraph
- media defaults to 'image' unless explicitly 'video'

**Critical rule:** Any new field added to the storyboard must have a default in emptyStoryboard() or emptyScene(). This ensures old records normalize correctly without migration.

### 6.3 MUTATE — setStoryboard(updater) / patchScene(index, patch)

All storyboard changes go through the store. Two entry points:

- setStoryboard(fn): receives previous state, returns new state. Used for structural changes (adding/removing scenes, changing metadata).
- patchScene(i, patch): shorthand for updating a single scene's fields. Used for field-level edits (changing a prompt, assigning an image).

Both set the dirty flag, which triggers auto-save.

### 6.4 SERIALIZE — serializable(sb)

Called before writing to the database. Strips runtime-only fields from each scene:

Stripped fields: image, video, voice, voiceDuration, videoDuration, dirty

Everything else is preserved. The resulting object is pure JSON, safe for JSONB storage.

### 6.5 PERSIST — Auto-Save

When the dirty flag is set, a 800ms debounced timer fires saveNow(). This writes:

- storyboard: serializable(storyboard)
- story: paragraphs joined by double newline (legacy field, kept for compatibility)
- title: storyboard.title or episode title
- format: storyboard.format
- updated_at: current timestamp

The save is silent. If it fails, the error is swallowed and the user continues working. Data is preserved in React state and will be retried on the next change.

---

## 7. Rendering Pipeline

The rendering pipeline converts storyboard data into a downloadable video file. Every step happens in the browser.

```
STORYBOARD
  │
  │  scenes[].paragraph, .imagePrompt, .image, .video, .voice
  │
  ▼
PREPARE SCENES
  │  prepareScenes(scenes, canvas, aspect, maxEdge)
  │  ├── Image scenes → offscreen canvas with Ken Burns margin
  │  ├── Video scenes → <video> element (muted, playsInline)
  │  └── Empty scenes → placeholder canvas
  │  Returns: { sources[], W, H }
  │
  ▼
BUILD VOICE TRACK
  │  buildVoiceTrack(actx, scenes, fallbackDur)
  │  ├── Decode each scene's audio via AudioContext
  │  ├── Stitch into single AudioBuffer
  │  ├── Insert SCENE_GAP (0.25s) between scenes
  │  └── Add VOICE_TAIL (0.4s) after last scene
  │  Returns: { buffer, durations[], bounds[], total }
  │
  ▼
BUILD SUBTITLE CUES (optional)
  │  cuesFromScenes(scenes, bounds)
  │  ├── Text from scene.subtitle or .voiceText or .paragraph
  │  ├── Chunk text by MAX_CHARS (84) and LINE_CHARS (42)
  │  └── Distribute chunks proportionally within scene duration
  │  Returns: cues[] with { start, end, text }
  │
  ▼
RENDER LOOP (per scene)
  │  renderSingleScene(scene, opts)
  │  ├── Create canvas capture stream (fps: 30)
  │  ├── Create audio destination from scene voice
  │  ├── Start MediaRecorder
  │  ├── Animation loop:
  │  │   ├── Image: drawScene() with Ken Burns (zoom + pan)
  │  │   │   ├── Even scenes: zoom in (ZOOM_MIN → ZOOM_MAX)
  │  │   │   └── Odd scenes: zoom out (ZOOM_MAX → ZOOM_MIN)
  │  │   │   └── Smart motion: pan direction alternates every 2 scenes
  │  │   ├── Video: syncVideoEl() with freeze/loop handling
  │  │   │   ├── Video longer than voice → cut at voice end
  │  │   │   ├── Video shorter, fit=freeze → hold last frame
  │  │   │   └── Video shorter, fit=loop → restart from beginning
  │  │   ├── Subtitle: drawCue() with styled text
  │  │   └── Watermark: drawWatermark() for free plan
  │  ├── Stop at scene voice duration
  │  └── Return { blob, duration, mime, ext }
  │
  ▼
CONCAT SCENES
  │  concatScenes(clips, opts)
  │  ├── Load FFmpeg.wasm (singleton, first-use CDN fetch)
  │  ├── Binary merge: pair clips iteratively
  │  │   Round 1: [A,B,C,D] → [AB,CD]
  │  │   Round 2: [AB,CD] → [ABCD]
  │  ├── Merge strategy per pair:
  │  │   ├── MP4 + no crossfade → concat demuxer (copy, fast)
  │  │   ├── Crossfade enabled → xfade + acrossfade filter
  │  │   └── Fallback → concat filter (re-encode)
  │  └── Return final MP4 Blob
  │
  ▼
MIX MUSIC (optional)
  │  mixMusic(videoBlob, musicFile, opts)
  │  ├── FFmpeg: loop music to video length
  │  ├── Apply gain (MUSIC_GAIN: 0.15)
  │  ├── Fade in/out (1.5s)
  │  └── amix: original audio + music
  │  Returns: final MP4 Blob with background music
  │
  ▼
EXPORT
  │  triggerDownload(blob, filename)
  │  └── Create <a> element, set href to object URL, click, revoke after 8s
```

### Rendering Architecture Decisions

**Per-scene rendering:** Each scene is rendered independently by renderSingleScene(), then scenes are concatenated by FFmpeg.wasm. This isolates failures (one bad scene does not crash the entire render) and enables per-scene preview without rendering the full video.

**Binary merge strategy:** Concatenation uses a binary tree approach (pairs of pairs) instead of sequential append. This keeps FFmpeg memory usage bounded: at most 2 input files + 1 output in memory at any time.

**Codec selection:** pickMimeType() probes browser support in priority order: MP4 (avc1) → MP4 (generic) → WebM (vp9) → WebM (vp8) → WebM (generic). Chrome/Edge get MP4. Firefox gets WebM. Safari gets nothing (no MediaRecorder canvas support).

**Bitrate scaling:** Bitrate auto-scales with resolution: 8Mbps at 720p, 16Mbps at 1080p, 24Mbps at 1440p, 40Mbps at 2160p+. This ensures visual quality matches the source material.

---

## 8. AI Provider Architecture

### 8.1 Current Implementation

AI text generation flows through a single endpoint:

```
Client (callAI)
  │
  ▼
POST /api/ai
  │
  ▼
Auth + Credit Check
  │
  ▼
Anthropic Messages API (direct HTTP)
  │  Model fallback: env → sonnet-4-6 → sonnet-4-5 → haiku-4-5
  │
  ▼
Credit Deduction
  │
  ▼
Response { text, creditsLeft, model }
```

The AI route is 98 lines. It handles auth, credits, provider call, and error mapping in a single function. This works for a single provider but does not scale to multiple providers.

### 8.2 Target Architecture

The target architecture introduces a provider adapter layer between the API route and external services.

```
Client (callAI)
  │
  ▼
POST /api/ai
  │
  ▼
Auth + Credit Check
  │
  ▼
Provider Resolver
  ├── Read user preference from profile.settings.aiProvider
  ├── Fall back to system default (env.DEFAULT_AI_PROVIDER)
  └── Resolve adapter instance
  │
  ▼
Provider Adapter (interface)
  ├── AnthropicAdapter → api.anthropic.com
  ├── OpenAIAdapter → api.openai.com
  ├── GoogleAdapter → generativelanguage.googleapis.com
  ├── MistralAdapter → api.mistral.ai
  ├── DeepSeekAdapter → api.deepseek.com
  └── LocalAdapter → user-configured endpoint (Ollama compatible)
  │
  ▼
Normalized Response { text, usage }
  │
  ▼
Credit Deduction (based on usage or flat cost)
  │
  ▼
Response { text, creditsLeft, provider, model }
```

### 8.3 Adapter Interface

```javascript
// lib/ai/provider.js (planned)

class AIProvider {
  constructor(config) {}

  // Send a message and return text response
  async sendMessage({ system, prompt, maxTokens }) {
    // Returns: { text: string, usage: { inputTokens, outputTokens } }
  }

  // List available models for this provider
  async listModels() {
    // Returns: string[]
  }

  // Check if provider is configured and reachable
  async isAvailable() {
    // Returns: boolean
  }
}
```

### 8.4 Migration Path

1. Extract current Anthropic logic into AnthropicAdapter
2. Create provider.js with the adapter interface
3. Create provider resolver that reads from env/settings
4. Update /api/ai to use resolver instead of direct HTTP
5. Add OpenAI adapter as first alternative
6. Add provider selection to user settings UI

Each step is backward compatible. Step 1 alone does not change behavior.

**Status:** Planned. Priority: High.

---

## 9. Authentication Architecture

### 9.1 Session Flow

```
                    ┌─────────────────────┐
                    │    REGISTRATION      │
                    │  email + password    │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  Supabase creates    │
                    │  auth.users row      │
                    │  + sends confirm     │
                    │  email               │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  Trigger fires:      │
                    │  on_auth_user_created│
                    │  creates profiles    │
                    │  row (free, 100 cr)  │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  User clicks email   │
                    │  confirmation link   │
                    └─────────┬───────────┘
                              │
            ┌─────────────────┴──────────────────┐
            │                                    │
  ┌─────────▼───────────┐            ┌───────────▼─────────┐
  │  SAME BROWSER       │            │  DIFFERENT BROWSER  │
  │  PKCE flow          │            │  OTP flow           │
  │  exchangeCodeFor    │            │  verifyOtp          │
  │  Session            │            │  (token_hash)       │
  └─────────┬───────────┘            └───────────┬─────────┘
            │                                    │
            └─────────────────┬──────────────────┘
                              │
                    ┌─────────▼───────────┐
                    │  Session cookie set  │
                    │  Redirect to /studio │
                    └──────────────────────┘
```

### 9.2 Middleware Architecture

middleware.js runs on every request matching /studio, /giris, and /auth/callback.

```
Incoming Request
  │
  ▼
Match route? (/studio/*, /giris, /auth/callback)
  ├── No → pass through (public pages)
  └── Yes ↓
  │
  ▼
Create Supabase server client with cookie access
  │
  ▼
auth.getUser()
  ├── Token valid → continue with response
  ├── Token expired → refresh via setAll cookie write
  └── No session → (handled by page-level guard, not middleware redirect)
  │
  ▼
Response with updated cookies
```

**Key design decision:** Middleware does not redirect unauthenticated users. It only refreshes tokens. The studio layout checks for auth and renders the login redirect if needed. This avoids redirect loops and keeps middleware simple.

**Auth callback exclusion:** /auth/callback is included in middleware matchers to ensure cookie handling works, but the callback itself runs before middleware can interfere with the code exchange.

### 9.3 Cookie Strategy

Supabase SSR uses cookies (not localStorage) for session storage. This is mandatory because:

- Server components and API routes need access to the session
- middleware.js needs to read/refresh tokens
- localStorage is not available on the server

The getSupabaseBrowser() client uses createBrowserClient which reads/writes cookies. The getSupabaseServer() client uses createServerClient with cookies() from next/headers.

---

## 10. State Management Architecture

### 10.1 Store Design

The application uses a single React Context (StudioCtx) provided by StudioProvider. There is no Redux, Zustand, or other state library.

```
StudioProvider
  │
  ├── profile          { credits, plan, email, ... }
  ├── episodeId        current episode UUID
  ├── episodeTitle     current episode title
  ├── storyboard       the central data object
  ├── dirty            boolean (unsaved changes exist)
  ├── saving           boolean (save in progress)
  ├── finalVideo       Blob (rendered video, in-memory)
  │
  ├── setStoryboard(fn)    update storyboard with updater function
  ├── patchScene(i, patch) update single scene fields
  ├── markWizardStep(key)  mark optional step as completed
  ├── openEpisode(ep)      load episode from DB into store
  ├── closeEpisode()       clear current episode
  ├── saveNow()            force immediate save
  ├── spendCredits(left)   update local credit count after AI call
  └── setFinalVideo(blob)  store rendered video blob
```

### 10.2 Data Flow Pattern

Every module follows the same pattern:

```
Page mounts
  │
  ▼
const { storyboard, setStoryboard, patchScene } = useStudio()
  │
  ▼
Read: storyboard.scenes, storyboard.style, etc.
  │
  ▼
User action (edit, generate, import)
  │
  ▼
Write: setStoryboard(sb => ({ ...sb, field: newValue }))
   or:  patchScene(index, { imagePrompt: newPrompt })
  │
  ▼
dirty = true → auto-save timer starts (800ms)
  │
  ▼
UI re-renders from updated storyboard
```

### 10.3 Why Single Context

Multiple contexts or a state library would fragment the storyboard across stores, creating synchronization complexity. A single context with a single storyboard object means:

- One auto-save mechanism
- One dirty flag
- No cross-store dependencies
- No subscribe/dispatch overhead
- DevTools can inspect the full state in one place

The trade-off is that any storyboard change re-renders all subscribed components. This is acceptable because module pages are leaf components (only one is mounted at a time) and the storyboard object is relatively small (text only, no media).

---

## 11. Error Handling Architecture

### 11.1 Philosophy

Errors are categorized by recoverability. The system always attempts recovery before showing an error to the user.

### 11.2 Error Categories

**Recoverable — Automatic**

| Error | Recovery | Example |
|---|---|---|
| AI model 404 | Fallback to next model in chain | Claude Sonnet unavailable → try Haiku |
| Truncated JSON from AI | parseJSONLoose() recovers partial data | Token limit cuts response mid-array |
| Missing profile row | Auto-create profile on AI call | Pre-trigger users get profile on first AI use |
| Auto-save failure | Swallow error, retry on next change | Network blip during save |
| Missing storyboard fields | normalize() fills defaults | Old record loaded with new schema |
| Font not loaded | Canvas falls back to sans-serif | Custom subtitle font unavailable |

**Recoverable — User Action**

| Error | User Action | Feedback |
|---|---|---|
| Credits insufficient | Upgrade to Pro | 402 error message with upgrade hint |
| Auth session expired | Re-login | Redirect to /giris |
| Collage detection fails | Manual grid override (3x3/4x4/5x5) | Grid selector in UI |
| AI returns unusable response | Retry button | Error message with "Tekrar dene" |
| Email confirmation expired | Resend confirmation email | Turkish error message with resend link |

**Non-Recoverable**

| Error | Response | Example |
|---|---|---|
| ANTHROPIC_API_KEY not set | 500 with setup instructions | Missing environment variable |
| Browser lacks MediaRecorder | Feature disabled with warning | Safari video export |
| Stripe webhook receives unknown event | 200 OK (ignore silently) | Unsubscribed event type |
| FFmpeg merge fails | Error with last 12 log lines | Corrupted clip input |

### 11.3 Error Handling Patterns

**API Routes:** Every API route wraps its body in try/catch. Known errors return structured JSON with Turkish user-facing messages. Unknown errors return the exception message. HTTP status codes are semantically correct (401, 402, 500, 502).

**AI Response Parsing:** parseJSONLoose() implements progressive recovery:
1. Try standard JSON.parse on clean input
2. Try extracting last complete object from truncated array
3. Try recovering beats array from truncated outline
4. Try recovering partial scene array from truncated generation
5. Throw with first 200 characters of response for debugging

**Auto-Save:** Save failures are silent. The dirty flag remains true, ensuring retry on the next edit. This prevents save errors from disrupting the user's creative flow.

**Media Processing:** Individual scene operations are isolated. A corrupt image in scene 5 does not prevent scenes 1-4 and 6+ from processing.

### 11.4 Logging

Currently minimal. Console errors in development, silent in production. No structured logging, no error tracking service.

**Planned:** Error tracking integration (Sentry or similar). Structured server-side logging for AI calls and payment events.

---

## 12. File and Media Architecture

### 12.1 Blob Lifecycle

Media files exist only as browser Blobs. They are never serialized, never sent to the server, and never persisted across page reloads.

```
File Input / Drag & Drop
  │
  ▼
File → Blob (browser memory)
  │
  ▼
Processing (Canvas, AudioContext, Video element)
  │
  ▼
Stored in React state: scene.image = { blob, url }
  │                     scene.voice = { blob }
  │                     scene.video = { blob, url }
  │
  ├── url = URL.createObjectURL(blob) → used for <img>, <video>, <audio> preview
  │
  ▼
Rendering (Canvas draw, MediaRecorder capture)
  │
  ▼
Output Blob (final video, subtitle file, thumbnail)
  │
  ▼
triggerDownload(blob, filename) → user saves to disk
  │
  ▼
URL.revokeObjectURL() after 8 seconds
```

### 12.2 Memory Model

All media is held in React state. When the user navigates away from the studio (or closes the tab), all blobs are garbage collected. There is no IndexedDB cache or Service Worker persistence.

**Implication:** If the user refreshes the page, imported images, voices, and videos are lost. Only text data (paragraphs, prompts, subtitles, metadata) survives because it is saved to Supabase. The user must re-import media files after a page refresh.

This is a known trade-off. Alternatives (IndexedDB blob storage, server-side upload) add significant complexity and cost. For now, the workflow assumes a single session for media work.

### 12.3 Collage Processing

AI image generators (Midjourney, DALL-E, etc.) typically output grid collages (3x3, 4x4, 5x5). The engine splits these into individual scene images automatically.

```
Collage Image File
  │
  ▼
Canvas: draw full image
  │
  ▼
getImageData(): pixel-level access
  │
  ▼
trimBlack(): detect and remove outer black borders
  │  Scans rows/columns for BLACK_T threshold (34)
  │  Requires BLACK_ROW_RATIO (92%) of pixels to be dark
  │  Trims up to MAX_TRIM (18%) from each edge
  │
  ▼
detectGrid(): determine grid size (3x3, 4x4, 5x5)
  │  Tests each grid hypothesis
  │  Measures darkness along expected divider lines
  │  Picks grid with highest line darkness score
  │  Falls back to 3x3 if no strong signal (score < 0.5)
  │
  ▼
Split: for each cell in grid
  │  ├── Calculate cell bounds from grid geometry
  │  ├── trimBlack() per cell (remove inner divider remnants)
  │  ├── NUMBER_CROP (7%) per edge (remove number watermarks)
  │  ├── Scale to target dimensions (cover fit)
  │  └── Canvas → toBlob('image/png') → scene.image
  │
  ▼
Scenes assigned in reading order (left-to-right, top-to-bottom)
```

---

## 13. Deployment Architecture

### 13.1 Production Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERCEL                                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Static CDN  │  │  Serverless  │  │  Serverless          │  │
│  │  Landing,    │  │  /api/ai     │  │  /api/stripe/*       │  │
│  │  Legal pages │  │              │  │                      │  │
│  └──────────────┘  └──────┬───────┘  └──────────┬───────────┘  │
│                           │                      │              │
└───────────────────────────┼──────────────────────┼──────────────┘
                            │                      │
              ┌─────────────▼──────┐    ┌──────────▼───────────┐
              │  Anthropic API     │    │  Stripe API          │
              │  (AI generation)   │    │  (Payment processing)│
              └────────────────────┘    └──────────────────────┘

              ┌────────────────────────────────────────────────┐
              │  Supabase                                      │
              │  ├── PostgreSQL (data)                         │
              │  ├── Auth (user management)                    │
              │  └── Realtime (not currently used)             │
              └────────────────────────────────────────────────┘

              ┌────────────────────────────────────────────────┐
              │  User's Browser                                │
              │  ├── Canvas API (image processing)             │
              │  ├── MediaRecorder (video capture)             │
              │  ├── Web Audio API (audio processing)          │
              │  ├── FFmpeg.wasm (video concatenation)         │
              │  └── All media processing (zero server load)   │
              └────────────────────────────────────────────────┘
```

### 13.2 Serverless Constraints

Vercel serverless functions have a 10-second timeout on the Hobby plan, 60 seconds on Pro. AI generation must complete within this window. The model fallback chain adds latency (each failed model costs one round trip). If all models are slow, the request may time out.

**Mitigation:** The primary model is chosen for speed (Sonnet). Fallback to Haiku (faster but less capable) is the last resort. If timeouts become frequent, streaming responses should be considered.

### 13.3 FFmpeg.wasm CDN Dependency

FFmpeg.wasm core files are loaded from unpkg CDN on first use. This creates a ~3MB initial download for video concatenation. The core is cached in browser memory (singleton pattern) for the session lifetime.

**Risk:** If unpkg is down, video concatenation fails. Mitigation: host core files on own CDN or bundle them.

---

## 14. Future Scalability

This section documents how the current architecture supports planned future features without breaking existing functionality.

### 14.1 New Module Addition Pattern

To add a new production module (e.g., AI Avatar, Podcast Studio):

1. Create page: app/studio/[module-name]/page.jsx
2. Read storyboard via useStudio()
3. Add any new storyboard fields to emptyStoryboard() and emptyScene() with defaults
4. Register step in WIZARD_STEPS (wizard.js) with key, href, and step number
5. Add sidebar entry in Sidebar.jsx
6. Add i18n keys for new module
7. No changes to existing modules, store, engine, or database schema

The storyboard's JSONB column absorbs new fields without migration. normalize() fills defaults for old records. serializable() strips any new runtime-only fields.

### 14.2 New AI Provider Addition

With the planned provider abstraction:

1. Create adapter: lib/ai/adapters/[provider].js implementing AIProvider interface
2. Register adapter in provider resolver
3. Add provider env variables to deployment config
4. Add provider option to user settings UI
5. No changes to any module, API route logic, or credit system

### 14.3 Plugin System (Planned)

A plugin system would allow third-party modules to:

- Register new wizard steps
- Add new storyboard fields (via plugin namespace in storyboard)
- Register new export formats
- Add new AI task types

**Architecture requirement:** Plugins must only interact through the storyboard and store APIs. Plugins must not directly modify other modules' data. A plugin namespace (storyboard.plugins.[name]) isolates plugin data from core fields.

### 14.4 Team Workspace (Planned)

Multi-user collaboration requires:

- Project sharing (RLS policy: team members can access shared projects)
- Concurrent edit conflict resolution (last-write-wins is acceptable for text; media is local anyway)
- Role-based access (owner, editor, viewer)
- Team billing (shared credit pool)

**Architecture impact:** The storyboard-first design helps here. There is one object to synchronize, not many tables. Supabase Realtime can push storyboard changes to other team members. The existing auto-save mechanism becomes the collaboration transport.

### 14.5 Marketplace (Planned)

A marketplace for templates, styles, prompts, and character packs:

- Templates: pre-built storyboard objects with scenes, prompts, and style settings
- Style packs: curated style/prompt/negative prompt combinations
- Character packs: pre-defined character cards with locked descriptions

**Architecture impact:** Templates are just storyboard JSON files. Importing a template calls normalize() on the template data and loads it into the store. No new data model required.

### 14.6 API Access (Planned)

Exposing the platform as an API for programmatic content creation:

- POST /api/v1/projects → create project
- POST /api/v1/episodes → create episode with storyboard
- POST /api/v1/generate → AI generation tasks
- GET /api/v1/episodes/:id → read storyboard

**Architecture impact:** The existing /api/ai route pattern extends naturally. API keys stored in profiles. Rate limiting required (not yet implemented).

---

## 15. Architecture Decision Records

### ADR-001: Storyboard First

**Context:** The platform has 12 production steps that all need to share data. Options: (a) separate tables per step, (b) event-driven pipeline, (c) single shared object.

**Decision:** Single JSONB storyboard object stored in episodes table.

**Rationale:** Eliminates cross-table joins, synchronization bugs, and migration complexity. A paragraph change in the script module instantly appears in prompts, subtitles, and publishing modules without any pub/sub mechanism. normalize() at read time provides free schema evolution.

**Trade-off:** Large objects for big projects. No per-field audit trail.

**Status:** Implemented and proven across all 12 modules.

---

### ADR-002: Client-Side Media Processing

**Context:** Video rendering, image manipulation, and audio analysis could run on the server (GPU instances, cloud functions) or in the browser.

**Decision:** All media processing runs in the browser using Canvas API, MediaRecorder, Web Audio API, and FFmpeg.wasm.

**Rationale:** Zero server cost for media. Zero upload/download latency. Complete user privacy (media never leaves the device). No infrastructure scaling needed for video workloads.

**Trade-off:** Limited to user's hardware. Safari cannot export video. Page refresh loses imported media. FFmpeg.wasm is slower than native FFmpeg.

**Status:** Implemented. The platform processes video entirely client-side.

---

### ADR-003: Provider Abstraction

**Context:** The platform uses AI for text generation. Locking to one provider creates business risk and limits user choice.

**Decision:** All AI providers must be accessed through an adapter interface. The API route resolves the active provider and delegates to its adapter.

**Rationale:** Provider pricing, availability, and quality change frequently. Users in different regions may prefer different providers. A local model option enables self-hosted deployments.

**Trade-off:** Abstraction adds a layer of indirection. Different providers have different capabilities (not all support system prompts identically).

**Status:** Designed but not implemented. Current code calls Anthropic directly. This is the highest-priority architectural debt.

---

### ADR-004: Supabase

**Context:** The platform needs a database, authentication, and real-time capabilities. Options: (a) self-hosted PostgreSQL + custom auth, (b) Firebase, (c) Supabase, (d) PlanetScale.

**Decision:** Supabase (hosted PostgreSQL + Auth + RLS).

**Rationale:** PostgreSQL provides JSONB for the storyboard (critical for the single-object model). Supabase Auth handles email/password with cookie-based sessions. RLS enforces row-level security at the database level (not the application level). The SSR package (@supabase/ssr) integrates cleanly with Next.js App Router.

**Trade-off:** Vendor dependency. Supabase free tier limits. RLS policies must be maintained per table.

**Status:** Implemented. All four tables have RLS enabled.

---

### ADR-005: Next.js App Router

**Context:** The platform needs server-side rendering for SEO on public pages, client-side rendering for the studio, and API routes for server-side logic.

**Decision:** Next.js 14 with App Router.

**Rationale:** App Router provides: file-based routing for 12+ studio pages, API routes for AI and Stripe without a separate backend, server components for landing and legal pages (SEO), client components for the interactive studio, middleware for auth token refresh, and strong Vercel deployment integration.

**Trade-off:** App Router has a learning curve. Some patterns (cookies in server components) require specific knowledge. Version pinned at 14.2.21 to avoid breaking changes.

**Status:** Implemented. All pages use App Router conventions.

---

### ADR-006: No External State Library

**Context:** The studio needs global state for the storyboard, profile, and episode context. Options: (a) Redux, (b) Zustand, (c) Jotai, (d) plain React Context.

**Decision:** Single React Context (StudioProvider) with useState hooks.

**Rationale:** The storyboard is one object. There is no complex derived state, no middleware, no time-travel debugging need. Context with useState is sufficient and adds zero dependencies. The store is 117 lines including the AI bridge function.

**Trade-off:** No devtools (Redux DevTools). All subscribers re-render on any change. Acceptable because only one module page is mounted at a time.

**Status:** Implemented. 117 lines, zero dependencies beyond React.

---

### ADR-007: FFmpeg.wasm for Video Concatenation

**Context:** Individual scenes are rendered by MediaRecorder. They need to be concatenated into a final video. Options: (a) server-side FFmpeg, (b) MediaRecorder recording all scenes in one pass, (c) FFmpeg.wasm in the browser.

**Decision:** FFmpeg.wasm (single-threaded UMD build) loaded from CDN on first use.

**Rationale:** Single-pass recording breaks on scene transitions (gap between MediaRecorder stop and start). Server-side FFmpeg requires uploading all clips (violates Client First principle). FFmpeg.wasm runs entirely in the browser. The single-threaded build avoids COOP/COEP header requirements that would complicate deployment.

**Trade-off:** ~3MB initial download from CDN. Slower than native FFmpeg. CDN dependency (unpkg). Single-threaded means no parallel processing.

**Status:** Implemented. Binary merge strategy keeps memory bounded.

---

### ADR-008: Cookie-Based Auth Sessions

**Context:** Supabase supports both localStorage and cookie-based session storage. Options: (a) localStorage via @supabase/supabase-js, (b) cookies via @supabase/ssr.

**Decision:** Cookie-based sessions using @supabase/ssr.

**Rationale:** Server components, API routes, and middleware all need access to the user session. localStorage is not available on the server. Cookies are sent with every request automatically, enabling middleware token refresh and server-side auth checks.

**Trade-off:** Cookie management is more complex (getAll/setAll in middleware). Third-party cookie blocking in some browsers may cause issues.

**Status:** Implemented. All auth flows use cookie-based sessions.

---

### ADR-009: Turkish-First Route Naming

**Context:** Studio pages need URL paths. Options: (a) English paths (/studio/script), (b) Turkish paths (/studio/senaryo), (c) localized paths with redirects.

**Decision:** Turkish paths for the primary market. English paths can be added as aliases later.

**Rationale:** The primary market is Turkey. Turkish URLs improve SEO for Turkish search queries. Content creators searching for "AI video yapma aracı" see familiar URL structures. The i18n layer handles UI text independently of URL paths.

**Trade-off:** Non-Turkish speakers see Turkish URLs. This is acceptable for initial market focus and can be addressed with URL aliases when the global market is targeted.

**Status:** Implemented. All studio routes use Turkish names.

---

END OF DOCUMENT
