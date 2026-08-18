---
name: audio-prompt
description: Analyze this project and output copy-ready prompts for manually generating original music and sound effects on an external audio platform. Use whenever the project needs BGM, music loops, ambience, UI sounds, gameplay feedback, one-shot effects, effect variants, or other new audio assets. Do not generate audio files, call audio-generation tools, or synthesize the assets automatically; stop at the prompts and production notes.
---

# Audio Prompt

## Purpose

Use this skill when the project needs new music or sound effects.

The responsibility is to:

1. Understand how the audio will be used in the game.
2. Inspect the current project direction, implementation, and existing audio assets.
3. Preserve the independent sound identity of the lobby and every game Bundle.
4. Produce a complete prompt that the user can paste into an external audio-generation platform.
5. Provide practical settings and provenance notes for manual generation and later integration.

The responsibility ends after the prompts and notes are delivered. Do not create WAV/MP3 files, run the project's audio synthesis scripts, call an audio-generation service, or modify existing audio assets as part of this skill.

## Project Context

Before writing prompts, inspect only the files needed for the request. Prefer these sources of truth, in this order:

- `docs/ARCHITECTURE.md` for runtime and Bundle boundaries.
- `docs/VISUAL_STYLE_GUIDE.md` and the current per-game visual/audio specification for the active theme.
- `docs/CONTENT_PRODUCTION_PLAN.md` for current production requirements.
- `docs/ASSET_LEDGER.md` for ownership, route, provenance, and status fields.
- Current files under the relevant `assets/**/visual/audio/` directory and the audio service when integration details matter.

Do not copy an older or conflicting direction merely because it appears in a historical document. If the project contains multiple names or revisions, state the assumption and follow the most recent confirmed specification.

## Critical Rules

- Never call image, audio, music, sound-effect, or voice generation tools for this task.
- Never silently replace an existing audio file or claim that a prompt has been rendered.
- Always output prompts for manual external generation, even when the user says “生成音乐”, “做一套音效”, or asks for the actual asset.
- Keep prompts platform-neutral unless the user names a platform. If a platform is named, adapt wording to its supported controls without claiming unsupported parameters.
- Use original, non-infringing descriptions. Do not request a recognizable copyrighted melody, sample, brand sound, or imitation of a living artist or identifiable franchise.
- Keep lobby and game audio separate. Do not reuse another Bundle’s music, instrument palette, sound-effect recording, filename, or finished asset as the new game’s formal audio.
- Do not invent a license, provenance record, output URL, model name, duration, or technical measurement. Mark unknown values as `待确认`.

## Workflow

### 1. Identify the audio asset

Classify every requested asset as one of:

- **Music**: lobby loop, gameplay loop, danger loop, result sting, transition cue, or short musical accent.
- **Sound effect**: button, toggle, panel, drop, collision, merge, combo, warning, failure, continue, milestone, record, or other gameplay event.
- **Set**: multiple cues that must share a sound identity while remaining individually editable.

For each item, determine:

- The event or screen that triggers it.
- The owning visual unit and Bundle.
- Whether it is a loop or a one-shot.
- Target duration and whether a clean tail is required.
- Whether variants are needed for repeated events.
- Whether it must coexist with music, vibration, animation, or other frequent sounds.

Do not use one vague prompt for a whole SFX set. Give each materially different cue its own prompt, or explicitly state which parameters are shared.

### 2. Inspect the project

Read the relevant theme specification before deciding on timbre. Extract concrete details such as:

- Mood, energy, tempo, rhythm density, and harmonic language.
- Material metaphors, such as paper, wood, glass, circuitry, fabric, or soft ambient space.
- Forbidden directions and sounds already reserved by another game.
- Current filenames, cue names, Bundle path, pause/stop behavior, and repetition throttling.
- Existing duration, loop, loudness, and peak conventions when the project already defines them.

For the current confirmed directions, use the documents rather than guessing: the lobby, the fruit/cat merge game, and T48 2048 each have different audio ownership. The T48 electronic pulse/chord direction must not inherit paper, fruit, cat, or gallery cues; a future game must receive a fresh direction before formal prompts are written.

### 3. Choose technical targets

Recommend settings based on actual usage, not arbitrary numbers:

- Music loop: state the target duration, seamless loop requirement, loop start/end, and whether the platform should provide a clean instrumental mix or stems.
- One-shot SFX: state the target duration, attack/transient, decay/tail, and whether a dry, centered sound is preferred.
- Repeated collision sounds: request 2–3 perceptually related variants with different micro-timing or texture, not louder copies.
- UI sounds: keep them short, readable at low volume, and free of a long reverb tail that muddies rapid interaction.
- Master preference: request a clean export suitable for a later 48 kHz WAV master; do not treat an external platform’s compressed preview as the final runtime file.
- Runtime loudness: provide a target only when the project or usage defines one; otherwise recommend manual normalization and listening checks instead of inventing LUFS values.

If an external platform cannot guarantee exact sample rate, loop points, stems, or dry output, mention that as a manual post-processing step.

### 4. Write the prompt

Build each prompt from these parts, in this order when relevant:

1. Asset identity and in-game use.
2. Emotional intent and energy curve.
3. Timbre, instruments, synthesis or acoustic material, and spatial character.
4. Rhythm, tempo, harmony, melody behavior, or event timing.
5. Duration, loop/one-shot behavior, variants, and clean-start/clean-end requirements.
6. Mix constraints for mobile game playback.
7. Explicit exclusions.

Use concrete sonic language. For example, prefer “short warm paper-fiber brush with a soft rounded transient and a tiny folded-paper tick” over “cute satisfying sound”.

For music, explicitly request “original instrumental game music” and state whether vocals, lyrics, and a prominent lead melody are unwanted. For SFX, explicitly request “one isolated event, no music, no voice, no dialogue, no multiple takes in one file” unless the user asks otherwise.

### 5. Record manual follow-up

After the prompt, identify what the user must verify after external generation:

- Platform, model/tool, generation date, full prompt, output ID or URL, and applicable license/terms.
- Selected take and discarded takes, if relevant.
- Editing, trimming, denoising, normalization, loop alignment, format conversion, and compression settings.
- Final repository path and owning Bundle.
- Listening checks for loop seams, transient harshness, repetition fatigue, masking, peak level, and behavior when music/effects are toggled or paused.

The prompt itself is not a provenance record. Do not mark an asset `可导入` or `候选可用` without the project’s required manual evidence.

## Output Format

Always output the following structure. If there are multiple assets, repeat the prompt block for each asset and keep the cue names explicit.

## 音频资产

Briefly describe the asset, trigger, owner, and intended Bundle path.

## 建议参数

- 类型：音乐 / 音效 / 音效变体
- 用途与触发事件：
- 时长：
- 循环：是 / 否；循环点或尾音要求：
- 声音身份：
- 建议输出：
- 变体数量：
- 外部平台：用户指定的平台，或“平台无关”

## 外部平台生成提示词

Provide one self-contained prompt in Chinese that can be copied directly. Include English technical terms only when they improve platform compatibility. Do not make the user rewrite the prompt.

## 手动制作与验收备注

Only include notes that apply to this asset. Mention licensing/provenance, post-processing, loop checks, Bundle routing, and integration constraints when relevant.

## Prompt Templates

Use these as scaffolding, then replace every bracketed field with project-specific information.

### Music

```text
为【项目/游戏】生成一段原创的【大厅/游戏内/危险状态】器乐游戏音乐，作为【用途】使用。整体气质是【情绪、能量和空间感】，必须与【当前主题】的【材质/色彩隐喻/声音方向】一致，但不要借鉴任何现有游戏、品牌或可识别艺术家的旋律与音色。

使用【乐器/合成音色/材质】构成【节奏、速度、和声与旋律行为】；能量曲线为【描述】。时长约【时长】，做成可无缝循环的完整段落，开头和结尾的节拍、和声、低频与混响尾巴自然衔接，不要突然淡出。输出干净的原创 instrumental game music，默认无歌词、无人声、无对白、无明显主旋律抢占操作反馈；如需循环，请避免过密的高频持续音。

请提供适合移动游戏后续母带处理的干净版本【以及独立 stems，如平台支持】。不要包含水印、平台提示音、环境录音、对白、现成采样、版权旋律、品牌声音或对特定艺术家的模仿。
```

### Sound effect

```text
为【项目/游戏】生成一条原创的【事件】游戏音效，用于【触发场景】。它要让玩家感到【反馈意义】，声音身份与【当前主题】的【材质/声音方向】一致，使用【具体声源或合成质感】；先出现【瞬态】，随后以【衰减/尾音】结束。

这是一个独立 one-shot，目标时长约【时长】，开头不要留空，结尾不要拖出不必要的长混响；输出【干声/轻空间感】、清晰、适合手机扬声器的版本，不要与背景音乐争抢频段。若用于高频重复事件，请生成【数量】个听感相关但不相同的短变体。

不要包含音乐、旋律段落、人声、对白、多个事件叠在同一个文件、现成采样、版权声音、品牌提示音、水印或对特定艺术家的模仿。
```

## Final Rule

Whenever the user requests new music or sound effects:

**Inspect the project → define the audio usage → output copy-ready external-platform prompts → stop.**

Do not generate or install the audio automatically.
