# 文档目录

文档按项目公共内容、大厅和小游戏 `gameId` 归档：

- `common/`：跨小游戏的架构与公共约束。
- `lobby/`：大厅专属文档。
- `games/<gameId>/`：对应小游戏的玩法、视觉、音频和素材文档。

## 公共文档

- [架构基线](common/ARCHITECTURE.md)

## 大厅

- [大厅音乐与音效生成提示词](lobby/LOBBY_AUDIO_PROMPTS.md)

## 小游戏

| gameId | 名称 | 文档 |
| --- | --- | --- |
| `catch` | 桌面大清理（原始 2D 兼容版） | [进入文档目录](games/catch/) |
| `chess-endless` | 棋逢对手 | [音频生成提示词](games/chess-endless/CHESS_AUDIO_PROMPTS.md) |
| `doodle-jump` | 涂鸦跃层（规划中） | [玩法规格](games/doodle-jump/DOODLE_JUMP_GAMEPLAY_SPEC.md)、[图片提示词](games/doodle-jump/DOODLE_JUMP_IMAGE_PROMPTS.md)、[音频提示词](games/doodle-jump/DOODLE_JUMP_AUDIO_PROMPTS.md) |
| `game2048` | 霓虹 2048 | [音频生成提示词](games/game2048/T48_AUDIO_PROMPTS.md) |
| `sliding-puzzle` | 木框拼图 | [素材生成提示词](games/sliding-puzzle/SLIDING_PUZZLE_ASSET_PROMPTS.md) |
| `watermelon` | 合成大胖橘 | [音频生成提示词](games/watermelon/WATERMELON_AUDIO_PROMPTS.md) |
