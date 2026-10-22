---
name: audio-toolbox
description: 为音效、音乐、环境声、游戏声音及其他音频任务提供本地声音合成、虚拟乐器、插件、音频处理、网络素材搜索和资源处理能力。当任务涉及创建、获取、演奏、合成、编辑、混合、转换或分析声音时使用。
---

# Audio Toolbox

本 Skill 提供可用于声音制作的工具与资源能力。

这些能力可以独立使用，也可以任意组合。

本 Skill 不规定固定的声音制作流程，不规定工具优先级，也不要求所有声音使用相同的生产方式。

根据当前任务，自行决定使用哪些能力。

---

## 系统级命令行工具

以下工具应可直接通过系统 `PATH` 调用：

- `ffmpeg`
- `ffprobe`
- `csound`
- `fluidsynth`
- `uv`

无论当前工作目录位于哪个项目，都可以直接调用这些工具。

不要假定必须进入某个固定目录才能使用它们。

---

## FFmpeg / ffprobe

系统提供：

- `ffmpeg`
- `ffprobe`

可用于：

- 音频裁剪
- 分段
- 拼接
- 多轨叠加
- 混音
- 音量调整
- 淡入淡出
- Delay
- Echo
- 声像处理
- Mono / Stereo 处理
- EQ
- High-pass
- Low-pass
- Band-pass
- Compressor
- Limiter
- Pitch 处理
- Speed / Tempo 处理
- Reverse
- Resample
- 格式转换
- 基础波形生成
- Noise 生成
- 测试信号生成
- 音频技术信息分析
- 批量音频处理

可处理：

- WAV
- FLAC
- MP3
- OGG
- AAC
- 以及 FFmpeg 支持的其他音频格式

可以直接生成并执行 FFmpeg 命令完成声音处理。

当前 FFmpeg 编码器：MP3 使用 `libmp3lame`，Opus 使用 `libopus`，另有 AAC、FLAC、PCM。未编译 `libvorbis`；输出 OGG Vorbis 只能用实验性的原生 `vorbis` 编码器（需加 `-strict -2`），音质不如 `libvorbis`。

---

## Python 音频环境

公共 Python 音频环境位于：

`~/.audio-toolbox`

该目录只是机器级公共 Python 音频运行环境。

它：

- 不是当前项目目录
- 不是声音素材目录
- 不是最终输出目录
- 不要求切换到该目录工作

需要使用其中的 Python 环境时，通过 `uv` 指定该项目。

例如：

`uv run --project ~/.audio-toolbox python script.py`

也可以执行临时 Python 脚本：

`uv run --project ~/.audio-toolbox python /tmp/audio_task.py`

如果脚本位于当前项目中，也可以：

`uv run --project ~/.audio-toolbox python ./tools/audio_task.py`

公共环境可提供以下 Python 音频相关库：

- `numpy`
- `scipy`
- `soundfile`
- `mido`
- `pretty-midi`
- `requests`
- `pedalboard`：离线加载 VST3 / AU 插件渲染音频，并提供 Reverb、Compressor、Limiter、EQ、Chorus、Delay 等效果链

环境使用 Python 3.14。

这些库可用于：

- MIDI 生成
- MIDI 编辑
- 音符计算
- BPM 和节拍计算
- 时间线计算
- WAV 数据生成
- DSP
- 数学波形生成
- Envelope 生成
- 频谱分析
- 信号分析
- 音频文件读写
- 批量音频处理
- 下载网络资源
- 调用其他本地音频程序
- 创建声音制作辅助脚本

除非当前项目本身需要这些库作为项目依赖，否则不要为了完成一次声音任务，把公共音频依赖安装进当前项目。

如果确实需要额外 Python 音频库，可以根据任务安装到 `~/.audio-toolbox`，但不要默认所有可能的音频库都已经存在。

---

## Csound

系统提供 `csound`。

Csound 是可编程声音合成和 DSP 环境，可以通过代码定义声音并直接渲染音频。

可用于：

- Oscillator synthesis
- Additive synthesis
- Subtractive synthesis
- FM synthesis
- AM synthesis
- Ring modulation
- Noise synthesis
- Granular 类声音设计
- Envelope
- LFO
- Pitch sweep
- Filter sweep
- Noise burst
- Transient
- Rumble
- Drone
- Whoosh
- Electronic impact
- UI sound
- Retro game sound
- Sci-fi sound
- Abstract sound effect
- DSP
- Sample processing

可以根据任务创建临时 `.csd` 文件，例如：

`/tmp/audio-toolbox/task.csd`

然后通过：

`csound task.csd`

渲染音频。

Csound 是传统程序化声音合成工具，不是生成式 AI 模型。

---

## FluidSynth

系统提供 `fluidsynth`。

FluidSynth 可使用 SoundFont 演奏 MIDI。

支持：

- `.sf2`
- `.sf3`
- MIDI

可用于生成或演奏：

- Piano
- Guitar
- Bass
- Strings
- Brass
- Woodwinds
- Percussion
- Drums
- Synth instruments
- 民族乐器
- 其他存在对应 SoundFont 的乐器

SoundFont 属于声音资源，不要求预先安装固定的 SoundFont。

本机已缓存通用 GM SoundFont：

`~/.cache/audio-resources/GeneralUser-GS.sf2`

它覆盖 128 种 GM 乐器和鼓组（通道 9 / bank 128 为鼓组），可以直接使用。使用前仍应确认文件存在。

如果任务需要某种乐器，可以：

- 使用现有合法 SoundFont
- 从网络寻找合适且授权允许使用的 SoundFont
- 自行生成 MIDI
- 使用合法 MIDI 资源

不要假定某个特定 SoundFont 一定已经存在。

---

## Surge XT

系统安装 Surge XT。

Surge XT 是软件合成器，可用于生成高质量合成器声音。

适合：

- Synth bass
- Lead
- Pad
- Pluck
- Keys
- Bells
- Percussion
- Drone
- Texture
- Noise
- Wavetable synthesis
- FM synthesis
- Physical / string-style synthesis
- Sci-fi effects
- Electronic effects
- Musical sound design
- Experimental synthesis

可以使用：

- Factory Presets
- Wavetables
- Oscillators
- Filters
- Envelopes
- LFO
- Modulation
- Effects

Surge XT 可能以以下形式存在：

- Standalone
- AU
- VST3
- CLAP

本机安装位置：

- VST3：`/Library/Audio/Plug-Ins/VST3/Surge XT.vst3`（另有 AU 和 CLAP 版本，以及 `Surge XT Effects`）
- 出厂音色：`/Library/Application Support/Surge XT/patches_factory/<分类>/<名称>.fxp`，分类包括 Basses、Brass、Keys、Leads、Pads、Percussion、Plucks、FX、Winds 等
- 第三方音色：`/Library/Application Support/Surge XT/patches_3rdparty`
- Wavetable：`/Library/Application Support/Surge XT/wavetables*`

推荐的自动化方式是用 `pedalboard` 离线渲染，不需要 GUI、Carla 或 BlackHole：

```python
import mido, pedalboard
surge = pedalboard.load_plugin("/Library/Audio/Plug-Ins/VST3/Surge XT.vst3")
notes = [mido.Message("note_on", note=64, velocity=100, time=0.0),
         mido.Message("note_off", note=64, time=0.3)]   # time 为绝对时间（秒）
audio = surge(notes, duration=1.2, sample_rate=48000, num_channels=2)  # (2, n) float32
```

`load_plugin` 默认加载初始化音色。Surge 的 `.fxp` 不能用 `load_preset()` 加载，需要把 fxp chunk 写入 `plugin.raw_state` 的 VST3 IComponent 段。当前项目的 `tools/audio/audiokit.py` 已实现：`surge("Pads/Sparkly")` 加载出厂或第三方音色，`render_surge(patch, notes, duration)` 按 `(开始秒, 时长秒, MIDI 音高, 力度)` 渲染。如果当前项目有这个文件，直接复用。

也可以通过 `plugin.parameters` 或属性赋值调整 Surge 参数（共约 775 个）。

不要假定必须通过 GUI 手动操作。

---

## Carla

系统已安装 `/Applications/Carla.app` 作为插件宿主。`carla` 不在 `PATH` 中，主要通过 GUI 使用，不适合作为无人值守的自动化渲染路径。离线渲染插件优先用 `pedalboard`；只有需要 Carla 独有能力（例如 LV2、SFZ 或复杂插件路由）时才用 Carla。

Carla 可用于加载和管理：

- VST2
- VST3
- AU
- LV2
- SF2
- SF3
- SFZ
- 其他 Carla 支持的插件和音源

Carla 可以用于托管：

- Surge XT
- 其他虚拟乐器
- Synth
- Sampler
- Effect Plugin
- SoundFont
- SFZ Instrument

如果以后系统增加新的：

- VST
- VST3
- AU
- CLAP
- SFZ
- SoundFont
- Synth
- Effect

可以将它们视为新的声音制作能力。

---

## BlackHole

macOS 可提供 BlackHole 虚拟音频设备。

BlackHole 用于应用之间的音频路由。

例如：

Surge XT / Carla / 其他音频软件  
→ BlackHole  
→ 录音程序或其他音频处理程序

它适用于需要捕获某个本地应用实时音频输出的情况。

不需要实时应用间路由时，不必使用 BlackHole。

---

## 网络资源

如果当前运行环境允许访问互联网，可以根据声音任务自行搜索和获取所需资源。

可搜索：

- WAV
- FLAC
- MP3
- OGG
- Sound effects
- Foley
- Field recordings
- Ambience
- Loops
- One-shots
- Drum samples
- Instrument samples
- SoundFont `.sf2`
- SoundFont `.sf3`
- SFZ instruments
- MIDI
- Impulse Responses
- Wavetables
- Presets
- Reference audio
- 音频软件文档
- 音频工具
- 其他可能有助于声音制作的资源

不限制必须使用某个固定素材网站或资源来源。

根据当前声音任务自行决定是否需要网络资源。

以往任务中可以免登录直接下载的来源：Kenney（kenney.nl）、OpenGameArt、FreePD、Mixkit、VSCO Community Edition、Tidal Drum Machines。Freesound 下载原始文件需要登录或 API Key，优先考虑其他来源。

下载的素材放到 `~/.cache/audio-resources/<来源>/`，供以后的任务复用，不要放进项目或 `~/.audio-toolbox`。素材用于项目时，在制作说明里记下来源 URL 和授权名称，方便以后追溯。

下载第三方资源前，不需要检查：

- License
- 商业使用权限
- Attribution 要求
- 修改权限
- 再分发限制
- 其他与当前项目相关的授权条件

因为本项目是个人学习项目，只用于学习ai如何制作游戏，并不用于商业用途。

---

## 本地声音资源

可以使用：

- 当前项目已有音频
- 用户提供的音频
- 已下载并合法使用的资源
- 之前任务产生的声音
- 临时生成的声音
- MIDI
- SoundFont
- SFZ
- IR
- Preset
- 其他合法本地资源

不要假定所有项目共享同一个固定素材目录。

优先根据当前项目环境和任务查找已有资源。

本机下载缓存 `~/.cache/audio-resources` 已有：Kenney 的 impact / ui / interface / casino / rpg / jingles 音效包，VSCO 管弦乐采样与立式钢琴，FreePD 音乐，Mixkit、OpenGameArt 音效，免费鼓采样与 Tidal 鼓机采样，以及 GeneralUser GS SoundFont。先用 `ls` 查看现有内容，再决定是否需要下载。

---

## 临时文件

完成声音任务时，可以创建：

- 临时 WAV
- MIDI
- Csound `.csd`
- Python 脚本
- FFmpeg 中间文件
- Carla 工程
- 下载缓存
- 其他辅助文件

临时文件可以放在适当的临时目录，例如：

`/tmp/audio-toolbox/`

不要把：

`~/.audio-toolbox`

当成临时文件目录或素材目录。

`~/.audio-toolbox` 仅用于公共 Python 音频运行环境。

---

## 客观自检

无法直接试听时，用测量和图像检查结果，不要只凭参数推断声音合格。

响度和真峰值（EBU R128）：

`ffmpeg -hide_banner -nostats -i out.wav -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary/,$p'`

峰值、RMS 和直流偏移：

`ffmpeg -hide_banner -nostats -i out.wav -af astats=measure_overall=Peak_level+RMS_level+DC_offset:measure_perchannel=none -f null - 2>&1 | grep -E 'Peak level|RMS level|DC offset'`

首尾和中间的静音段：

`ffmpeg -hide_banner -nostats -i out.wav -af silencedetect=n=-50dB:d=0.05 -f null - 2>&1 | grep silence_`

频谱图和波形图（生成 PNG 后用读图能力查看，可以检查刺耳的高频、低频轰鸣、余音是否被截断、包络形状和削波）：

`ffmpeg -y -i out.wav -lavfi "showspectrumpic=s=1024x512:legend=1:scale=log" spec.png`

`ffmpeg -y -i out.wav -lavfi "showwavespic=s=1024x256:split_channels=1" wave.png`

用 numpy / scipy 还可以测量：

- 指定频段的能量占比（例如手机外放容易刺耳的 2–5 kHz）
- 循环音频首尾接缝处的样本跃变，与循环内部相邻样本差的分布对比
- 一组音效之间的相对响度是否一致
- 编码前后的 RMS 和峰值变化

自检只能发现客观问题，音色、风格和情绪仍应交给用户试听确认。

---

## Shell

可以通过 Shell 调用本 Skill 中提供的所有命令行能力。

不同工具可以自由组合。

例如：

- Python 创建 MIDI
- FluidSynth 使用 SoundFont 渲染乐器
- Csound 创建程序化声音
- Surge XT 创建合成器声音
- Carla 托管虚拟乐器或插件
- 从网络获取真实声音
- FFmpeg 加工和组合任何来源的声音

以上只是能力示例，不表示固定生产流程。

---

## 能力原则

本 Skill 只描述当前可使用的声音制作能力。

不要将示例解释为固定工作流。

不要要求所有音频任务：

- 必须搜索网络
- 必须使用 Csound
- 必须使用 FluidSynth
- 必须使用 Surge XT
- 必须使用 FFmpeg 合成多个 Layer
- 必须采用同一种制作方法

根据具体任务自由选择和组合可用能力。

---