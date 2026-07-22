# AI CONTENT STUDIO
## PRODUCT REQUIREMENTS DOCUMENT

---

### Document Information

| Field | Value |
|---|---|
| Name | Product Requirements Document |
| Version | 1.0 |
| Status | Active |
| Owner | AI Content Studio |
| Last Updated | 2026-07-21 |

References:

- docs/00_PRODUCT_BIBLE.md
- docs/03_DEVELOPMENT_RULES.md
- docs/07_ROADMAP.md

---

## 1. Overview

This document defines the technical product requirements for AI Content Studio.

It serves as the single source of truth for what each module does, how data flows, and what constitutes a complete implementation.

For vision, mission, and product philosophy, refer to 00_PRODUCT_BIBLE.md. This document does not repeat those statements. It translates them into actionable specifications.

### 1.1 Scope

AI Content Studio is a guided AI content production platform. Users produce complete content (video, podcast, course material) from idea to publishing inside a single workspace. The platform supports every content type listed in 00_PRODUCT_BIBLE.md.

### 1.2 Guiding Constraint

Every feature must reduce complexity for the end user. If a feature requires explanation, the design is wrong. The interface must guide the user through each step so they never wonder what to do next.

---

## 2. User Personas and Journeys

### 2.1 Personas

**Creator (Primary)**

A YouTube creator, AI creator, or story creator who produces content regularly. Has a story idea but lacks time or tools to handle every production step. Wants to go from idea to published video in one session. May not have video editing skills.

**Agency User (Primary)**

A marketing agency or small business producing content for clients. Needs consistent output quality, fast turnaround, and multiple projects in parallel. Values templates, character consistency, and brand control.

**Educator (Secondary)**

A teacher, course creator, or publisher producing educational content. Needs structured scripts, clear visuals, and multilingual subtitle support. Values simplicity and correctness over speed.

### 2.2 Core User Journey

```
Idea → Project → Script → Storyboard → Characters → Prompts → Images → Voice → Video → Subtitles → Thumbnail → Shorts → Publish
```

Two entry points exist:

**AI Path:** User writes a one-line idea. AI generates the script, which flows through the entire pipeline.

**Own Content Path:** User has their own script and assets. The platform assembles them into the final output.

Both paths converge at the Storyboard step. From that point forward, the workflow is identical.

---

## 3. System Architecture

### 3.1 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.21 |
| Runtime | React | 18.3.x |
| Database | Supabase (PostgreSQL) | Latest |
| Authentication | Supabase Auth | Via @supabase/ssr 0.5.x |
| AI Provider | Anthropic API (default) | 2023-06-01 |
| Payments | Stripe | API direct (no SDK) |
| Video Processing | MediaRecorder + Canvas API | Browser native |
| Collage Processing | Canvas API | Browser native |
| Audio Processing | Web Audio API + AudioContext | Browser native |
| Archive | JSZip | 3.10.x |
| Deployment | Vercel | Serverless |

### 3.2 Client-Server Responsibility Split

The platform follows a client-heavy architecture. Media processing happens entirely in the browser. The server handles only authentication, AI text generation, and payment processing.

**Client (Browser)**

- Collage detection and splitting (3x3, 4x4, 5x5)
- Image cropping and Ken Burns animation
- Voice file analysis and duration extraction
- Voice-synced video rendering (MediaRecorder + Canvas)
- Subtitle generation from script text
- Thumbnail generation
- Shorts extraction
- MP4/WebM export
- SRT/VTT/TXT subtitle export
- ZIP packaging

**Server (Next.js API Routes)**

- User authentication and session management (Supabase Auth)
- AI text generation (Anthropic API)
- Credit deduction and plan management
- Stripe checkout session creation
- Stripe webhook handling

**Never on Server**

- Image files
- Audio files
- Video files
- Any user media

User media never leaves the browser. This is a product requirement, not an implementation detail.

### 3.3 Application Structure

```
app/
├── page.jsx                    Landing page
├── layout.jsx                  Root layout (I18nProvider)
├── globals.css                 Global styles
├── giris/                      Login / Register
├── auth/
│   ├── callback/               Email confirmation handler
│   └── signout/                Sign out handler
├── api/
│   ├── ai/                     AI text generation endpoint
│   └── stripe/
│       ├── checkout/           Stripe checkout session
│       └── webhook/            Stripe event handler
├── studio/
│   ├── layout.jsx              Studio shell (auth guard, sidebar, roadmap)
│   ├── page.jsx                Dashboard
│   ├── projeler/               Module 01: Projects
│   ├── senaryo/                Module 02: Script
│   ├── storyboard/             Module 03: Storyboard
│   ├── karakterler/            Module 04: Characters
│   ├── promptlar/              Module 05: Prompts
│   ├── gorseller/              Module 06: Images
│   ├── seslendirme/            Module 07: Voice
│   ├── atolye/                 Module 08: Video Editing
│   ├── altyazi/                Module 09: Subtitles
│   ├── thumbnail/              Module 10: Thumbnail
│   ├── shorts/                 Module 11: Shorts
│   └── youtube/                Module 12: Publishing
├── gizlilik/                   Privacy Policy
├── kullanim-kosullari/         Terms of Service
├── kvkk/                       KVKK Notice
└── iletisim/                   Contact

lib/
├── engine.js                   Browser production engine
├── storyboard.js               Data model definitions
├── wizard.js                   Wizard step definitions and logic
├── store.jsx                   Global state (StudioProvider + useStudio)
├── i18n.jsx                    Internationalization (TR/EN)
├── supabase-browser.js         Supabase client (browser)
├── supabase-server.js          Supabase client (server)
├── Sidebar.jsx                 Navigation sidebar
├── Roadmap.jsx                 Progress roadmap bar
├── EpisodeBar.jsx              Episode selector
├── Waveform.jsx                Audio waveform display
└── WizardFooter.jsx            Step navigation footer

supabase/
├── schema.sql                  Base schema (v1)
├── migration-v2.sql            Storyboard column
├── migration-v3.sql            Scene engine fields + data migration
└── verify-v3.sql               Migration verification queries

middleware.js                   Auth middleware (token refresh, route protection)
```

### 3.4 Request Flow

```
Browser → middleware.js (token refresh) → Page/API Route → Supabase/Anthropic → Response
```

Middleware runs on every request to /studio/* and /giris. It calls getUser() to refresh expired tokens via setAll cookie writes. Auth callback (/auth/callback) is excluded from middleware to prevent cookie race conditions.

---

## 4. Storyboard Data Model

The storyboard is the single data object that drives the entire platform. Every module reads from and writes to this object. There is no separate data store for scripts, prompts, images, or subtitles.

### 4.1 Schema

```
Storyboard {
  version:      number          // Schema version (current: 2)
  title:        string          // Project title
  description:  string          // Project description
  language:     string          // Production language (not UI language)
  genre:        string          // One of 38 genres
  format:       string          // youtube | shorts | tiktok | reels | documentary | podcast | custom
  aspect:       string          // 16:9 | 9:16 | 1:1 | 4:5
  style:        string          // One of 18 visual styles
  duration:     number          // Target duration in seconds
  videoFit:     string          // freeze | loop (when video is shorter than voice)
  scratch: {
    idea:       string          // Draft idea text (persisted for continuity)
    tone:       string          // Draft tone notes
    paste:      string          // Pasted raw text
  }
  wizard: {
    [key]:      boolean         // Completion flags for optional/output steps
  }
  scenes: [
    {
      scene:          number    // 1-indexed scene number
      media:          string    // image | video (per-scene, can be mixed)
      paragraph:      string    // Script paragraph for this scene
      imagePrompt:    string    // Main image generation prompt
      videoPrompt:    string    // Video generation prompt
      negativePrompt: string    // Negative prompt
      stylePrompt:    string    // Style layer
      cameraPrompt:   string    // Camera angle/movement layer
      motionPrompt:   string    // Motion description layer
      lightingPrompt: string    // Lighting description layer
      voiceText:      string    // Text to be spoken (may differ from paragraph)
      subtitle:       string    // Subtitle text (may differ from voiceText)
    }
  ]
}
```

### 4.2 In-Memory Fields (Not Persisted)

These fields exist on scene objects at runtime but are stripped before saving to the database:

```
scene.image          Blob     // Image file loaded in browser
scene.video          Blob     // Video file loaded in browser
scene.voice          Blob     // Audio file loaded in browser
scene.voiceDuration  number   // Detected audio duration in seconds
scene.videoDuration  number   // Detected video duration in seconds
scene.dirty          boolean  // Local change flag
```

### 4.3 Serialization

The serializable() function strips in-memory fields before writing to Supabase. The normalize() function fills missing fields with defaults when reading from Supabase. This ensures backward compatibility: old records gain new fields automatically, new records never have missing properties.

### 4.4 Auto-Save

The store watches for changes via a dirty flag. When storyboard state changes, a 800ms debounced save writes the serialized storyboard to the episodes table. The user never presses a save button.

### 4.5 Supported Values

**Formats (7):** YouTube Video (16:9), YouTube Shorts (9:16), TikTok (9:16), Instagram Reels (9:16), Documentary (16:9), Podcast Clip (1:1), Custom (16:9 default)

**Genres (38):** Adventure, Horror, Sci-Fi, Fantasy, Thriller, Documentary, Motivation, History, Mythology, Comedy, Anime, Romance, Drama, Children, Fairy Tale, Detective, Crime, Cyberpunk, Space, YouTube Video, TikTok, Instagram Reel, Podcast, Education, AI, Technology, Finance, Business, Animals, Travel, Health, Music, Film Summary, Book Summary, News, Mystery, Sports, Food

**Visual Styles (18):** Cinematic Realistic, 3D Animation, Pixar Style, Disney Style, Anime, Cyberpunk, Watercolor, Oil Painting, Flat Illustration, Paper Cutout, Pixel Art, Noir, Documentary Photography, Retro 80s, Fantasy Concept, Pencil Sketch, Vector, Claymation

**Character Types (15):** Human, Robot, Animal, Anime, Monster, Alien, Child, Elder, Superhero, Fantasy Creature, Cyberpunk, Ghost, Historical Figure, Narrator, Other

**Character Looks (10):** Realistic, 3D, Pixar, Disney, Anime, Cyberpunk, Cinematic, Illustration, Pixel, Pencil Sketch

**Languages (12):** Turkish, English, Spanish, German, French, Arabic, Japanese, Korean, Chinese, Russian, Italian, Portuguese

**Prompt Layers (7):** Image Prompt, Video Prompt, Negative Prompt, Style Prompt, Camera Prompt, Motion Prompt, Lighting Prompt

**Aspect Ratios (4):** 16:9 (1920x1080), 9:16 (1080x1920), 1:1 (1080x1080), 4:5 (1080x1350)

**Durations (12):** 30s, 45s, 1m, 2m, 3m, 5m, 10m, 15m, 20m, 30m, 45m, 60m

---

## 5. Module Specifications

### 5.1 Module 01: Projects

**Purpose**

Manage projects and episodes. A project is a container for related episodes (e.g., a YouTube series). An episode is a single production unit with its own storyboard.

**Inputs**

- Project name
- Episode title
- Optional: favorite flag, archive flag

**Outputs**

- Created project record in projects table
- Created episode record in episodes table with empty storyboard
- Episode loaded into global store (StudioProvider)

**Data Flow**

```
User creates project → DB insert (projects) → User creates episode → DB insert (episodes) → openEpisode() loads storyboard into store → All modules read from store
```

**AI Usage**

None.

**Client / Server Responsibility**

- Client: UI for project list, create/rename/delete/archive, episode management
- Server: Supabase DB operations via RLS (user can only access own records)

**Acceptance Criteria**

- User can create, rename, delete, and archive projects
- User can create and open episodes within a project
- Opening an episode loads its storyboard into the global store
- Free plan limited to 2 projects
- Pro plan allows unlimited projects
- Deleting a project cascades to its episodes (DB foreign key)

**Status:** Implemented

---

### 5.2 Module 02: Script

**Purpose**

Generate or write the story script. The script is the textual foundation of every production. This module converts raw text into scene-separated paragraphs stored in the storyboard.

**Inputs**

- AI Path: idea text, genre, tone, target duration, language
- Own Content Path: pasted or typed full script text
- Scene count suggestion (calculated from target duration)

**Outputs**

- storyboard.scenes[] populated with paragraph text
- storyboard.title, description, genre, language, duration set
- Each scene gets voiceText and subtitle copied from paragraph

**Data Flow**

```
AI Path:
  User writes idea → callAI('outline', prompt) → AI returns structured outline → User approves → callAI('scene', prompt) → AI returns scene paragraphs → scenes[] populated

Own Content Path:
  User pastes text → Split by double newline → Each paragraph becomes a scene → scenes[] populated
```

**AI Usage**

- Task: outline (6 credits) — generates story outline with title, description, and beats
- Task: scene (4 credits) — expands outline beats into full paragraphs
- Task: rewrite (6 credits) — rewrites selected scene text
- System prompt instructs AI to return JSON with paragraph field per scene
- maxTokens: varies by scene count, capped at 8192

**Client / Server Responsibility**

- Client: UI for idea input, text paste, scene preview, manual editing, scene reordering
- Server: AI text generation via /api/ai route

**Acceptance Criteria**

- AI-generated scripts are split into individual scenes
- Pasted text is split by double newline into scenes
- Each scene has paragraph, voiceText, and subtitle populated
- Scene count matches target duration guideline (suggestSceneCount formula)
- User can manually edit any scene paragraph after generation
- Draft fields (scratch.idea, scratch.tone, scratch.paste) persist across page navigations
- Scenes are renumbered correctly after add/delete/reorder

**Status:** Implemented

---

### 5.3 Module 03: Storyboard

**Purpose**

Visual overview and management of all scenes. The storyboard is the central planning view where users see the entire production at a glance and configure per-scene settings.

**Inputs**

- scenes[] from script module
- Per-scene metadata: format, aspect ratio, style, duration settings

**Outputs**

- Updated storyboard metadata (format, aspect, style, duration, videoFit)
- Scene-level edits (paragraph text, scene order, add/delete scenes)

**Data Flow**

```
Script populates scenes[] → Storyboard displays grid → User edits metadata and scenes → Store auto-saves to DB
```

**AI Usage**

None directly. Metadata set here flows into AI prompts in later modules.

**Client / Server Responsibility**

- Client: Scene grid display, drag-and-drop reorder, metadata editors, scene add/delete
- Server: Auto-save via Supabase

**Acceptance Criteria**

- All scenes displayed in a visual grid with scene numbers
- User can reorder scenes by drag-and-drop or manual controls
- User can add empty scenes or delete existing ones
- Scene renumbering is automatic after any structural change
- Format, aspect ratio, style, and duration selectors functional
- Changes auto-save within 800ms

**Status:** Implemented

---

### 5.4 Module 04: Characters

**Purpose**

Define reusable character cards with consistent visual descriptions. Once a character is defined and locked, their description is injected into every prompt that references them, ensuring visual consistency across all generated images.

**Inputs**

- Character name
- Character type (from 15 types)
- Character look (from 10 looks)
- Free-form description fields (stored as fields JSONB)
- Locked flag

**Outputs**

- Character record in characters table
- Character description available for prompt injection in Module 05

**Data Flow**

```
User creates character → DB insert (characters) → Locked characters available in prompt generation → Prompt module injects character description into imagePrompt/videoPrompt
```

**AI Usage**

- Task: character (4 credits) — AI generates a detailed visual description from name and type
- Used for initial character card creation, not required for manual entry

**Client / Server Responsibility**

- Client: Character card UI, field editing, lock/unlock toggle
- Server: Supabase CRUD with RLS, AI generation via /api/ai

**Acceptance Criteria**

- User can create, edit, and delete character cards
- Each card stores type, look, and free-form description fields
- Locked characters cannot be accidentally modified
- Character descriptions are available for injection in prompt generation
- Characters are user-scoped (RLS: own characters only)
- This is an optional wizard step

**Status:** Implemented

---

### 5.5 Module 05: Prompts

**Purpose**

Generate and manage seven-layer prompts for each scene. Prompts drive external image and video generation tools. The module produces copy-ready prompt text that the user pastes into their preferred AI image/video generator.

**Inputs**

- scenes[].paragraph (script text per scene)
- storyboard.style, storyboard.genre, storyboard.language
- Character descriptions (from Module 04)
- User overrides per prompt layer

**Outputs**

- Per scene: imagePrompt, videoPrompt, negativePrompt, stylePrompt, cameraPrompt, motionPrompt, lightingPrompt
- Flattened prompt text for clipboard copy

**Data Flow**

```
User triggers AI prompt generation → callAI('prompts', prompt) → AI returns 7-layer prompts per scene → scenes[] updated → User copies prompts to external AI tool → Generated images/videos imported in Module 06
```

**AI Usage**

- Task: prompts (6 credits) — generates all 7 prompt layers for selected scenes
- System prompt includes scene paragraph, global style, genre, and locked character descriptions
- Output format: JSON array with all prompt fields per scene

**Client / Server Responsibility**

- Client: Prompt display/edit UI, copy-to-clipboard per scene or bulk, prompt layer toggles
- Server: AI generation via /api/ai

**Acceptance Criteria**

- All 7 prompt layers generated for each scene
- Character descriptions injected when characters exist
- User can edit any prompt layer manually after generation
- Copy button produces a single concatenated prompt string (flattenPrompt function)
- Negative prompts are appended with "Negative:" prefix
- Prompts respect the production language setting
- Bulk generation and bulk copy available

**Status:** Implemented

---

### 5.6 Module 06: Images

**Purpose**

Import and assign visual assets (images or videos) to each scene. Supports two import modes: collage splitting (AI image generators often output grid images) and sequential single-file import.

**Inputs**

- Image files (PNG, JPG, WebP) — single or collage grid
- Video files (MP4, WebM) — for video scenes
- scenes[] from storyboard

**Outputs**

- scene.image (Blob, in-memory) for image scenes
- scene.video (Blob, in-memory) for video scenes
- scene.media field set to 'image' or 'video' per scene

**Data Flow**

```
Collage Mode:
  User uploads collage image → Engine detects grid (3x3/4x4/5x5) → Canvas splits into individual cells → Each cell assigned to corresponding scene → scene.image set

Sequential Mode:
  User uploads files one by one → Each file assigned to next empty scene → scene.image or scene.video set

Per-Scene Override:
  User selects file for specific scene → Replaces existing asset
```

**AI Usage**

None. All image processing is client-side via Canvas API.

**Client / Server Responsibility**

- Client: File upload, collage detection (black line analysis), grid splitting (Canvas), scene assignment, image/video preview, media type toggle per scene, swap between scenes, remove asset
- Server: None. No files are uploaded to the server.

**Acceptance Criteria**

- Collage detection works for 3x3, 4x4, and 5x5 grids
- Black line detection uses configurable thresholds (ENGINE.BLACK_T, BLACK_ROW_RATIO)
- Number watermarks in collage cells are auto-cropped (ENGINE.NUMBER_CROP)
- Sequential mode assigns files in alphabetical order (naturalSortBy)
- User can toggle any scene between image and video mode
- User can swap assets between scenes
- User can remove an asset from a scene
- Grid view and sequential view available
- Video scenes show duration badge and hover preview
- No server upload occurs

**Status:** Implemented

---

### 5.7 Module 07: Voice

**Purpose**

Import voice audio files and analyze their duration for voice-synced video rendering. Each scene gets its own audio file. The audio duration determines how long each scene appears in the final video.

**Inputs**

- Audio files (MP3, WAV, OGG, M4A, WebM) — one per scene
- scenes[] from storyboard

**Outputs**

- scene.voice (Blob, in-memory)
- scene.voiceDuration (number, seconds)

**Data Flow**

```
User uploads audio files → Browser decodes audio → Duration extracted via AudioContext → Files assigned to scenes in order or per-scene → scene.voice and scene.voiceDuration set
```

**AI Usage**

None. Audio analysis is client-side via Web Audio API.

**Client / Server Responsibility**

- Client: File upload, audio decode, duration extraction (AudioContext.decodeAudioData), waveform display, per-scene assignment, playback preview
- Server: None. No audio files are uploaded to the server.

**Acceptance Criteria**

- Audio files decoded and duration extracted accurately
- Sequential upload assigns files to scenes in order
- Per-scene upload allows individual file assignment
- Waveform visualization displays audio shape
- User can play/preview each scene's audio
- User can replace or remove a scene's audio
- Voice duration drives video scene timing in Module 08
- Usage instructions displayed at top of page

**Status:** Implemented

---

### 5.8 Module 08: Video Editing (Kurgu / Atolye)

**Purpose**

Render the final video by compositing images/videos with voice audio, applying Ken Burns animation, crossfades, watermarks, and assembling into a downloadable MP4/WebM file.

**Inputs**

- scenes[].image or scenes[].video (media assets)
- scenes[].voice (audio files)
- scenes[].voiceDuration (timing)
- storyboard.aspect (canvas dimensions)
- storyboard.videoFit (freeze or loop for short videos)
- storyboard.subtitle texts (for burned-in subtitles if enabled)

**Outputs**

- Final video file (MP4 in Chrome/Edge, WebM in Firefox)
- Per-scene preview clips
- finalVideo state in store

**Data Flow**

```
User clicks render → prepareScenes() builds timeline → For each scene:
  Image scene: Ken Burns zoom/pan animation drawn on canvas
  Video scene: <video> element frames drawn on canvas
→ Voice audio mixed via AudioContext → MediaRecorder captures canvas+audio → Blob assembled → Download available
```

**AI Usage**

None. All rendering is client-side.

**Client / Server Responsibility**

- Client: Canvas rendering, Ken Burns animation (ENGINE.ZOOM_MIN to ZOOM_MAX), MediaRecorder capture, audio mixing, crossfade transitions (ENGINE.CROSSFADE), scene gap insertion (ENGINE.SCENE_GAP), watermark overlay, subtitle burn-in, per-scene preview render, progress display
- Server: None.

**Acceptance Criteria**

- Full video renders with all scenes in correct order
- Each scene duration equals its voice audio duration
- Image scenes animate with Ken Burns effect (zoom + pan)
- Video scenes play synchronized with voice timing
- Video shorter than voice: freezes on last frame (freeze mode) or loops (loop mode)
- Video longer than voice: cuts when voice ends
- Crossfade transitions between scenes (configurable duration)
- Scene gap (breath pause) inserted between scenes
- Watermark rendered for free plan users
- No watermark for pro plan users
- Per-scene preview renders only the selected scene
- Per-scene preview is playable and downloadable
- Correct aspect ratio maintained (16:9, 9:16, 1:1, 4:5)
- MP4 output in Chrome/Edge, WebM fallback in Firefox
- Safari: video rendering not supported (other modules work)

**Status:** Implemented

---

### 5.9 Module 09: Subtitles

**Purpose**

Generate subtitle files from script text, timed to voice audio boundaries. Subtitles are derived from the storyboard text, not from speech recognition.

**Inputs**

- scenes[].subtitle (text)
- scenes[].voiceDuration (timing)
- Subtitle formatting options (font, size, position, style)

**Outputs**

- SRT file
- VTT file
- TXT file (plain transcript)
- Optionally: burned-in subtitles on video (handled in Module 08)

**Data Flow**

```
scenes[].subtitle + voiceDuration → Engine calculates cue timing (word distribution) → Subtitle cues generated with start/end times → Export as SRT/VTT/TXT
```

**AI Usage**

- Task: translate (6 credits) — translates subtitles to another language (12 languages supported)

**Client / Server Responsibility**

- Client: Cue generation (ENGINE.MAX_CHARS, LINE_CHARS, CUE_GAP, LEAD_IN, PAUSE_WEIGHT), timing calculation, font selection (9 fonts preloaded in layout), SRT/VTT/TXT formatting, file download, subtitle preview on canvas
- Server: AI translation via /api/ai (optional)

**Acceptance Criteria**

- Subtitle cues generated from scene text with accurate timing
- Word distribution respects character limits per line (42 chars) and per cue (84 chars)
- Sentence-ending punctuation receives weighted pause (PAUSE_WEIGHT)
- Lead-in delay applied (LEAD_IN: 0.15s)
- Gap between cues maintained (CUE_GAP: 0.08s)
- Export formats: SRT, VTT, TXT
- Font selection from 9 preloaded Google Fonts
- Translation to 12 languages via AI
- This is an optional wizard step

**Status:** Implemented

---

### 5.10 Module 10: Thumbnail

**Purpose**

Generate thumbnail images for the video. Thumbnails are composed from scene images with text overlays, rendered on canvas.

**Inputs**

- Scene images from storyboard
- Title text and custom text overlays
- Font, color, and layout options

**Outputs**

- Thumbnail image file (PNG/JPG)

**Data Flow**

```
User selects scene image as base → Adds text overlays → Canvas renders composite → Download as image file
```

**AI Usage**

None.

**Client / Server Responsibility**

- Client: Canvas composition, text rendering, font styling, image export
- Server: None.

**Acceptance Criteria**

- User can select any scene image as thumbnail base
- Text overlays with customizable font, size, color, position
- Output resolution appropriate for YouTube (1280x720 minimum)
- Correct aspect ratio for target platform
- Download as PNG or JPG
- This is an optional wizard step

**Status:** Implemented

---

### 5.11 Module 11: Shorts

**Purpose**

Extract short-form vertical clips from the main video for YouTube Shorts, TikTok, and Instagram Reels.

**Inputs**

- Final video or individual scene renders
- Scene selection for extraction
- Target aspect ratio (9:16)

**Outputs**

- Short-form video clip (vertical format)

**Data Flow**

```
User selects scenes for short → Canvas re-renders selected scenes in 9:16 → MediaRecorder captures → Download short clip
```

**AI Usage**

None.

**Client / Server Responsibility**

- Client: Scene selection, vertical re-render, canvas composition, MediaRecorder capture
- Server: None.

**Acceptance Criteria**

- User can select specific scenes to include in the short
- Output is vertical 9:16 format
- Audio included from selected scenes
- Subtitles optionally burned in
- Download as MP4/WebM
- This is an optional wizard step

**Status:** Implemented

---

### 5.12 Module 12: Publishing (YouTube)

**Purpose**

Generate publishing metadata: titles, descriptions, tags, and hashtags optimized for the target platform. Also provides SRT export for platform subtitle upload.

**Inputs**

- storyboard.title, description, genre, language
- scenes[].paragraph (full script for context)

**Outputs**

- Generated title options
- SEO-optimized description
- Tag list
- Hashtag suggestions
- SRT file for platform upload

**Data Flow**

```
User triggers metadata generation → callAI('titles', prompt) → AI returns title options → callAI('seo', prompt) → AI returns description, tags, hashtags → User copies to clipboard or downloads
```

**AI Usage**

- Task: titles (3 credits) — generates multiple title options
- Task: seo (5 credits) — generates description, tags, hashtags

**Client / Server Responsibility**

- Client: Display generated metadata, copy-to-clipboard, SRT download, edit before copy
- Server: AI generation via /api/ai

**Acceptance Criteria**

- Multiple title options generated (user picks one)
- Description is SEO-optimized for the target platform
- Tags are relevant to genre and content
- Hashtags formatted correctly for each platform
- Copy-to-clipboard for each field
- SRT file downloadable for platform upload
- All metadata respects production language setting
- This is the final wizard step

**Status:** Implemented

---

## 6. AI Provider Architecture

### 6.1 Current Implementation

AI text generation is handled through a single API route (/api/ai) that calls the Anthropic Messages API directly. The route implements a model fallback chain: if the primary model returns 404, the next model in the list is tried.

```
Model Priority:
1. process.env.ANTHROPIC_MODEL (custom override)
2. claude-sonnet-4-6
3. claude-sonnet-4-5-20241022
4. claude-haiku-4-5-20251001
```

### 6.2 Task Types and Credit Costs

| Task | Credits | Description |
|---|---|---|
| outline | 6 | Story outline generation |
| scene | 4 | Scene paragraph expansion |
| script | 10 | Full script generation |
| prompts | 6 | 7-layer prompt generation |
| character | 4 | Character description generation |
| translate | 6 | Subtitle translation |
| seo | 5 | SEO metadata generation |
| titles | 3 | Title option generation |
| assistant | 4 | General AI assistance |
| rewrite | 6 | Scene text rewriting |
| default | 5 | Any unlisted task |

### 6.3 Request Flow

```
Client callAI(task, prompt) → POST /api/ai
→ Auth check (getUser)
→ Profile lookup (credits, plan)
→ Credit check (cost <= credits)
→ Anthropic API call (model fallback)
→ Credit deduction
→ Response { text, creditsLeft, model }
```

### 6.4 Target Architecture: Provider Abstraction

Per 00_PRODUCT_BIBLE.md, provider abstraction is mandatory. The target architecture introduces a provider adapter interface that normalizes requests and responses across multiple AI providers.

**Planned Providers:**

- Anthropic (current, default)
- OpenAI
- Google (Gemini)
- Mistral
- DeepSeek
- Local Models (Ollama compatible)

**Adapter Interface (Planned):**

```
AIProvider {
  name:       string
  sendMessage(system, prompt, maxTokens) → { text, usage }
  listModels() → string[]
  isAvailable() → boolean
}
```

Provider selection will be configurable per user (in settings) or per request. The /api/ai route will resolve the active provider and delegate to its adapter.

**Status:** Planned. Current implementation is Anthropic-only. Provider abstraction has not been built.

### 6.5 JSON Response Handling

AI responses are parsed with a robust parseJSONLoose function that handles:

- Markdown code fence removal
- Truncated JSON recovery (token limit cutoffs)
- Partial array recovery (finds last complete object)
- Beats array extraction from truncated outlines
- Graceful error messages with response previews

This parser is provider-agnostic and will work with any provider that returns JSON-structured text.

---

## 7. Authentication and Authorization

### 7.1 Authentication Flow

Authentication uses Supabase Auth with email/password. No social OAuth providers are configured currently.

```
Registration:
  User enters email + password → Supabase creates user → Confirmation email sent → User clicks link → /auth/callback exchanges code for session → Redirect to /studio

Login:
  User enters email + password → Supabase signInWithPassword → Session cookie set → Redirect to /studio

Session Refresh:
  Every request → middleware.js → getUser() → Token refreshed if expired → Cookie updated
```

### 7.2 Route Protection

| Route | Access |
|---|---|
| / | Public |
| /giris | Public (redirects to /studio if logged in) |
| /gizlilik, /kvkk, /kullanim-kosullari, /iletisim | Public |
| /auth/callback, /auth/signout | Public (functional) |
| /studio/* | Authenticated only (middleware + layout guard) |
| /api/ai | Authenticated only (getUser check) |
| /api/stripe/checkout | Authenticated only (getUser check) |
| /api/stripe/webhook | Public (Stripe calls it) |

### 7.3 Authorization (Row Level Security)

All database tables have RLS enabled. Policies use auth.uid() to scope data to the current user.

| Table | Policy |
|---|---|
| profiles | User can read/write only their own profile (id = auth.uid()) |
| projects | User can read/write only their own projects (user_id = auth.uid()) |
| episodes | User can read/write only their own episodes (user_id = auth.uid()) |
| characters | User can read/write only their own characters (user_id = auth.uid()) |

### 7.4 Session Security

- Supabase SSR cookie-based sessions (not localStorage)
- middleware.js calls getUser() on every protected request to validate and refresh tokens
- getSession() is never used (reads from cookie without server validation)
- Auth callback handles both PKCE flow (code exchange) and OTP flow (token_hash)
- Expired/invalid confirmation links return user-friendly Turkish error messages

---

## 8. Billing and Credits

### 8.1 Plans

| Plan | Credits | Projects | Output | Price |
|---|---|---|---|---|
| Free (Starter) | 100/month | 2 | Watermarked | Free |
| Pro | 5,000/month | Unlimited | 1440p, no watermark | ₺499/month |
| Business | Planned | Planned | Planned | Planned |
| Enterprise | Planned | Planned | Planned | Planned |

### 8.2 Credit System

Every AI call deducts credits from the user's profile. Credit cost is determined by task type (see Section 6.2). Credits are stored as an integer in profiles.credits.

Credits are deducted after a successful AI response, not before. If the API call fails, no credits are spent.

Free plan credits reset monthly (handled by Stripe webhook or manual reset — not yet automated).

### 8.3 Payment Flow

```
User clicks "Pro'ya Geç" → POST /api/stripe/checkout
→ Stripe Checkout Session created (subscription mode)
→ User redirected to Stripe payment page
→ Payment completed → Stripe sends webhook
→ POST /api/stripe/webhook receives checkout.session.completed
→ profiles.plan = 'pro', profiles.credits = 5000
```

```
Subscription cancelled:
→ Stripe sends customer.subscription.deleted
→ profiles.plan = 'free', profiles.credits = 100
```

### 8.4 Stripe Integration Details

- No Stripe SDK — direct API calls with URLSearchParams
- Webhook receives raw JSON (no signature verification currently)
- Webhook uses SUPABASE_SERVICE_ROLE_KEY for admin-level profile updates (bypasses RLS)
- client_reference_id carries the Supabase user ID for webhook-to-user mapping

### 8.5 Known Gap

Stripe webhook signature verification (STRIPE_WEBHOOK_SECRET) is not implemented. In production, any HTTP client can send fake events to the webhook endpoint. This must be resolved before production launch.

---

## 9. Internationalization

### 9.1 Architecture

Two independent language settings exist:

**UI Language** — Controls interface text (buttons, labels, navigation, messages). Stored in localStorage. Detected from browser language on first visit. Changed via sidebar buttons or settings page.

**Production Language** — Controls AI-generated content language (script, prompts, subtitles, SEO). Stored in storyboard.language. Set per project. Changed in storyboard metadata.

These are fully independent. A user can have a Turkish UI while producing English-language content.

### 9.2 Translation System

- Dictionary-based: lib/i18n.jsx contains all translations
- 338 keys per language
- Currently supported: Turkish (tr), English (en)
- Fallback chain: requested locale → English → key itself
- I18nProvider wraps the entire app at root layout level
- useI18n() hook provides t(key) function and locale/setLocale

### 9.3 Adding New Languages

1. Add language code and label to LOCALES array
2. Add translation dictionary to DICT object
3. Missing keys fall back to English automatically

No code changes required beyond i18n.jsx.

---

## 10. Database Schema

### 10.1 Tables

**profiles**

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid (PK) | FK → auth.users | User ID |
| email | text | — | User email |
| plan | text | 'free' | Subscription plan |
| credits | integer | 100 | Available AI credits |
| settings | jsonb | {} | User preferences |
| created_at | timestamptz | now() | Registration timestamp |

**projects**

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid (PK) | gen_random_uuid() | Project ID |
| user_id | uuid | FK → auth.users | Owner |
| name | text | — | Project name |
| favorite | boolean | false | Pinned flag |
| archived | boolean | false | Archive flag |
| created_at | timestamptz | now() | Creation timestamp |

**episodes**

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid (PK) | gen_random_uuid() | Episode ID |
| project_id | uuid | FK → projects | Parent project |
| user_id | uuid | FK → auth.users | Owner |
| title | text | 'Yeni Bölüm' | Episode title |
| story | text | '' | Legacy plain text story |
| prompts | text | '' | Legacy prompts text |
| voice_notes | text | '' | Legacy voice notes |
| status | jsonb | {} | Legacy status object |
| storyboard | jsonb | {} | Main storyboard object (v2+) |
| format | text | 'youtube' | Content format |
| created_at | timestamptz | now() | Creation timestamp |
| updated_at | timestamptz | now() | Last modification |

**characters**

| Column | Type | Default | Description |
|---|---|---|---|
| id | uuid (PK) | gen_random_uuid() | Character ID |
| user_id | uuid | FK → auth.users | Owner |
| name | text | — | Character name |
| fields | jsonb | {} | Character attributes |
| locked | boolean | true | Edit protection |
| created_at | timestamptz | now() | Creation timestamp |

### 10.2 Triggers

**on_auth_user_created:** Fires after insert on auth.users. Creates a profiles row with id, email, plan='free', credits=100. Uses ON CONFLICT DO NOTHING for idempotency.

### 10.3 Migration History

| Version | File | Changes |
|---|---|---|
| v1 | schema.sql | Base tables: profiles, projects, episodes, characters. RLS policies. User trigger. |
| v2 | migration-v2.sql | Added episodes.storyboard (jsonb), episodes.format. Backfilled missing profiles. |
| v3 | migration-v3.sql | Added profiles.settings. Migrated legacy story text to storyboard scenes. Added scene.media field. Added videoFit field. Idempotent, safe to re-run. |

### 10.4 Migration Rules

- All migrations must be idempotent (safe to re-run)
- Use ADD COLUMN IF NOT EXISTS
- Never drop columns or tables
- Never delete user data
- Legacy columns (story, prompts, voice_notes, status) remain for safety
- Wrap multi-statement migrations in BEGIN/COMMIT

---

## 11. Security

### 11.1 API Key Protection

- ANTHROPIC_API_KEY: server-only environment variable, never exposed to client
- STRIPE_SECRET_KEY: server-only environment variable
- SUPABASE_SERVICE_ROLE_KEY: server-only, used only in webhook handler
- NEXT_PUBLIC_SUPABASE_URL: public (by design, RLS protects data)
- NEXT_PUBLIC_SUPABASE_ANON_KEY: public (by design, RLS protects data)

### 11.2 Data Protection

- All database tables have RLS enabled
- All policies scope to auth.uid()
- Media files never leave the browser
- No server-side file storage
- User profiles contain only email, plan, and credits

### 11.3 Authentication Security

- Cookie-based sessions (not localStorage tokens)
- Token refresh on every request via middleware
- getUser() used instead of getSession() for server-side validation
- PKCE flow for email confirmation in same browser
- OTP flow for email confirmation in different browser

### 11.4 Payment Security

- Stripe handles all payment card data (PCI compliance via Stripe)
- No card data touches the application server
- Webhook should verify Stripe signature (NOT YET IMPLEMENTED)

### 11.5 Content Security

- AI prompts are validated server-side (non-empty check)
- AI task cost is enforced server-side (credit check before API call)
- Credit deduction happens after successful AI response

### 11.6 Required Security Improvements

| Priority | Improvement | Status |
|---|---|---|
| Critical | Stripe webhook signature verification | Not Implemented |
| High | Rate limiting on /api/ai endpoint | Not Implemented |
| High | CSRF protection on API routes | Not Implemented |
| Medium | Content Security Policy headers | Not Implemented |
| Medium | Input sanitization on AI prompts | Not Implemented |
| Low | Audit logging for credit operations | Not Implemented |

---

## 12. Performance

### 12.1 Targets

- Page navigation: instant (client-side routing)
- AI response: under 10 seconds for typical tasks
- Collage splitting: under 2 seconds for 5x5 grid
- Video render: proportional to video duration (real-time or faster)
- Auto-save: 800ms debounce, no user-perceivable delay
- Initial page load: under 3 seconds on broadband

### 12.2 Architecture Decisions for Performance

- Client-side media processing eliminates upload/download latency
- No external CDN dependencies for media (all local blobs)
- Single storyboard object minimizes database reads
- Auto-save debouncing prevents excessive writes
- Google Fonts preloaded in layout head (9 subtitle fonts)
- Lazy rendering: only active module processes data

### 12.3 Browser Constraints

| Browser | Video Export | Audio | Other Modules |
|---|---|---|---|
| Chrome | MP4 (avc1) | Full | Full |
| Edge | MP4 (avc1) | Full | Full |
| Firefox | WebM (vp9/vp8) | Full | Full |
| Safari | Not Supported | Full | Full |

MediaRecorder codec support determines output format. Safari lacks MediaRecorder canvas capture support. All non-video modules work in all browsers.

### 12.4 Memory Management

- Image/video/audio blobs held in React state (in-memory)
- URL.createObjectURL used for preview; revokeObjectURL called after use
- Large projects (100+ scenes) may require significant browser memory
- No explicit memory limit enforcement currently

---

## 13. Testing Requirements

### 13.1 Test Strategy (Planned)

| Layer | Tool | Coverage Target |
|---|---|---|
| Unit | Jest or Vitest | Data model functions (storyboard.js, wizard.js, engine.js utilities) |
| Integration | Playwright or Cypress | Wizard flow (12-step completion), auth flow, AI call chain |
| Visual | Storybook or manual | Component rendering across breakpoints |
| E2E | Playwright | Full production: idea → script → storyboard → prompts → images → voice → video → export |

### 13.2 Critical Test Scenarios

- Storyboard normalize() handles all legacy formats without data loss
- parseJSONLoose() recovers truncated AI responses
- Collage detection correctly identifies 3x3, 4x4, 5x5 grids
- Ken Burns animation renders correct aspect ratios
- Voice sync timing matches audio duration per scene
- Video scene freeze/loop behavior under all timing combinations
- Credit deduction is atomic (no double-spend, no free calls)
- Auth callback handles expired links, invalid tokens, cross-browser opens
- Auto-save does not lose data on rapid edits
- Scene renumbering after add/delete/reorder

### 13.3 Current Test Status

No automated tests exist. All testing is currently manual.

**Status:** Planned

---

## 14. Deployment Requirements

### 14.1 Platform

Vercel (serverless). No custom server required. No Docker.

### 14.2 Environment Variables

**Required:**

| Variable | Purpose | Scope |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL | Public |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anonymous key | Public |
| ANTHROPIC_API_KEY | Anthropic API authentication | Server only |
| NEXT_PUBLIC_SITE_URL | Application base URL | Public |

**Optional (Payment):**

| Variable | Purpose | Scope |
|---|---|---|
| STRIPE_SECRET_KEY | Stripe API authentication | Server only |
| STRIPE_PRICE_PRO | Stripe Price ID for Pro plan | Server only |
| SUPABASE_SERVICE_ROLE_KEY | Admin DB access for webhooks | Server only |
| STRIPE_WEBHOOK_SECRET | Webhook signature verification | Server only |

**Optional (AI):**

| Variable | Purpose | Scope |
|---|---|---|
| ANTHROPIC_MODEL | Override default model | Server only |

If Stripe variables are not set, the application runs normally. The Pro upgrade button shows a configuration warning instead of initiating payment.

### 14.3 Supabase Configuration

- Authentication → Providers → Email enabled
- Authentication → URL Configuration → Site URL = production URL
- Authentication → URL Configuration → Redirect URLs = production URL/**
- SQL Editor → Run schema.sql (initial setup)
- SQL Editor → Run migration-v3.sql (latest migration, idempotent)

### 14.4 Stripe Configuration (When Enabled)

- Create Product and Price in Stripe Dashboard
- Set price ID as STRIPE_PRICE_PRO
- Add webhook endpoint: https://DOMAIN/api/stripe/webhook
- Subscribe to events: checkout.session.completed, customer.subscription.deleted
- Set webhook signing secret as STRIPE_WEBHOOK_SECRET

### 14.5 Next.js Configuration

- reactStrictMode: true
- No output: 'export' (incompatible with dynamic routes)
- No custom image loader configuration currently
- Next.js version pinned at 14.2.21 (do not upgrade without testing)

### 14.6 Pre-Launch Checklist

- [ ] Fill contact page placeholders (app/iletisim/page.jsx) with real business information
- [ ] Configure Stripe webhook with signature verification
- [ ] Set NEXT_PUBLIC_SITE_URL to production domain
- [ ] Update Supabase URL Configuration for production
- [ ] Run migration-v3.sql on production database
- [ ] Verify RLS policies on all tables
- [ ] Test email confirmation flow end-to-end
- [ ] Test payment flow end-to-end
- [ ] Update README.md to reflect current product identity

---

## 15. Compliance

### 15.1 Legal Pages (Implemented)

| Page | Route | Purpose |
|---|---|---|
| Privacy Policy | /gizlilik | Data processing disclosure |
| Terms of Service | /kullanim-kosullari | Usage terms |
| KVKK Notice | /kvkk | Turkish data protection law compliance |
| Contact | /iletisim | Required contact information |

All four pages are required for Google Ads policy compliance (per project rules).

### 15.2 Data Processing

- User media is processed client-side only, never transmitted to servers
- AI text requests contain only user-written text (no media)
- User profiles contain minimal PII (email, plan, credits)
- Supabase stores data in the configured region
- No third-party analytics or tracking currently implemented

### 15.3 Google Ads Compliance

All SaaS products must comply with Google Ads policies (per project rules). Requirements:

- Privacy policy page accessible from landing page
- Terms of service page accessible from landing page
- KVKK notice for Turkish market
- Contact page with real business information (currently has placeholders)
- No misleading claims in marketing copy
- Clear pricing disclosure on landing page

---

## 16. Implementation Status Summary

| Module | Status | Notes |
|---|---|---|
| 01 Projects | Implemented | Full CRUD, free plan limits |
| 02 Script | Implemented | AI + manual, two entry paths |
| 03 Storyboard | Implemented | Grid view, metadata editors |
| 04 Characters | Implemented | Card system, lock mechanism |
| 05 Prompts | Implemented | 7-layer, character injection |
| 06 Images | Implemented | Collage + sequential, mixed media |
| 07 Voice | Implemented | Audio analysis, duration extraction |
| 08 Video Editing | Implemented | Ken Burns, voice sync, scene engine |
| 09 Subtitles | Implemented | SRT/VTT/TXT, 12 languages |
| 10 Thumbnail | Implemented | Canvas composition |
| 11 Shorts | Implemented | Vertical extraction |
| 12 Publishing | Implemented | AI titles, SEO, tags |
| Auth System | Implemented | Email/password, middleware refresh |
| Billing | Partial | Stripe checkout works, webhook signature missing |
| i18n | Implemented | TR/EN complete |
| Provider Abstraction | Planned | Anthropic-only currently |
| Testing | Planned | No automated tests |
| Security Hardening | Partial | RLS complete, webhook/rate limiting missing |

---

END OF DOCUMENT
