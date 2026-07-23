# TASK-01 — Video Health Analyzer

---

# Vision

Video Health Analyzer is the intelligence engine of AI Story Studio.

Instead of simply generating videos, the platform evaluates the quality of completed productions and explains why a video succeeds or fails.

The goal is to make AI behave like an experienced film editor and creative director.

Video Health is not a scoring system.

It is an improvement system.

---

# Purpose

Creators often don't know why a video performs poorly.

Traditional editing software only provides editing tools.

AI Story Studio explains:

• where attention drops

• where pacing becomes slow

• where visuals repeat

• where emotion disappears

• where viewers may stop watching

Instead of guessing, creators receive measurable recommendations.

---

# User Experience

User uploads a completed video.

↓

AI analyzes the complete production.

↓

Video Health Report is generated.

↓

The creator receives scores, warnings and recommendations.

↓

The creator can improve the project before publishing.

---

# Health Categories

Every uploaded video receives independent scores.

## Story

Measures narrative quality.

Evaluation examples

• story progression

• clarity

• structure

• conflict

• resolution

Score

0–100

---

## Visual

Measures visual quality.

Evaluation examples

• repeated images

• consistency

• transitions

• cinematic composition

• visual rhythm

---

## Voice

Measures voiceover quality.

Evaluation examples

• synchronization

• pronunciation

• pacing

• pauses

• emotional delivery

---

## Pacing

Measures production rhythm.

Evaluation examples

• scene duration

• unnecessary pauses

• static scenes

• visual changes

---

## Hook

Measures first impressions.

Evaluation examples

• first 5 seconds

• opening strength

• curiosity

• viewer retention potential

---

## Emotion

Measures emotional progression.

Evaluation examples

• tension

• surprise

• happiness

• sadness

• emotional variation

---

## Retention

Predicts viewer engagement.

Evaluation examples

• estimated watch time

• possible drop-off points

• boring segments

• repeated pacing

---

# Overall Score

Every category contributes to a global score.

Example

Story

94

Visual

90

Voice

96

Emotion

88

Hook

84

Pacing

82

Retention

87

----------------

Overall Health

89 / 100

★★★★★

---

# AI Responsibilities

The AI must identify

• weak scenes

• repeated visuals

• slow pacing

• unnecessary silence

• excessive narration

• visual overload

• missing transitions

• poor endings

• weak hooks

AI must explain every issue.

Never only assign scores.

---

# Timeline Analysis

Video Health stores scene-based analysis.

Example

00:00

Excellent Hook

★★★★★

----------------

00:42

Visual repetition detected

★★☆☆☆

Recommendation

Replace image

----------------

01:17

Voice pacing too slow

Recommendation

Increase speed by 10%

----------------

02:06

Scene too long

Recommendation

Split into two scenes

---

# AI Recommendations

Every detected problem must include a recommendation.

Example

Problem

Scene duration exceeds recommended length.

Recommendation

Split into two visuals.

Estimated improvement

+6 Story Score

--------------------------------

Problem

Repeated image.

Recommendation

Generate a new prompt.

Estimated improvement

+4 Visual Score

--------------------------------

Problem

Weak opening.

Recommendation

Replace first scene.

Estimated improvement

+9 Hook Score

---

# Warning System

Warnings have four severity levels.

Information

Blue

Minor suggestion.

----------------

Recommendation

Green

Improvement available.

----------------

Warning

Orange

Performance may decrease.

----------------

Critical

Red

High probability of viewer drop.

---

# Health History

Every project stores historical analysis.

Example

Version

1

Overall

81

------------

Version

2

Overall

88

------------

Version

3

Overall

93

The creator can compare improvements.

---

# Future Integration

Video Health will provide data to

• Timeline Analyzer

• AI Director

• Smart Prompt Generator

• Creator Intelligence

• Video Rebuilder

No duplicated analysis should exist.

Every module consumes Video Health results.

---

# Database

Future tables

video_health_reports

scene_health_reports

video_health_history

health_recommendations

---

# Acceptance Criteria

The feature is complete when

✓ AI analyzes complete videos

✓ Individual health categories are calculated

✓ Overall score is generated

✓ Timeline issues are detected

✓ Every issue includes recommendations

✓ Historical reports are stored

✓ Future modules can consume the generated data

---

# Future Expansion

Future versions may include

• YouTube retention comparison

• Viral probability estimation

• Thumbnail quality analysis

• Audio quality analysis

• Copyright detection

• Brand consistency evaluation

• Multi-language comparison

---

# Priority

★★★★★

---

# Difficulty

★★★★★

---

# Estimated Development

5–7 Days

---

# Dependencies

None

This module is the foundation of Sprint 4.

Every following task depends on Video Health.