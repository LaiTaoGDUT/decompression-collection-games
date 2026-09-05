# 《纸片跳跃》阶段 4 代表性手测配置

> 状态：待人工执行。以下配置用于稳定复现，不代表已经通过测试。

## 使用方法

编辑 `assets/games/doodle-jump/configs/gameplay.json` 的 `generation` 字段，刷新资源并重新进入游戏。HUD 依次显示根 seed、生成游标、降级次数、活动平台数和 platform 随机流游标。需要逐块检查时开启 `singleStep` 与 `showRouteDebug`。

| 用例 | seedOverride | platformTypeOverride | 额外开关 | 重点 |
| --- | ---: | --- | --- | --- |
| S4-A | 1 | auto | 默认 | 低高度 Normal/Moving、基础确定性 |
| S4-B | 17 | moving | singleStep、route debug | Moving 运动范围与预测可达性 |
| S4-C | 42 | breakable | singleStep、route debug | Breakable 插入平台与可直达主路线、ID 唯一性 |
| S4-D | 20260830 | disappearing | singleStep | 一次性消失与预警 |
| S4-E | 31415926 | shifting | singleStep、route debug | 三位置移动和路线预测 |
| S4-F | 4294967295 | exploding | singleStep | 1.5 秒爆炸倒计时、无伤害失效和无符号 seed |
| S4-G | 73 | normal | force degraded、singleStep、route debug | 24 次耗尽后的同路径安全降级 |

“force degraded”表示 `forceDegradedFallback=true`；“route debug”表示 `showRouteDebug=true`。每个用例重新进入两次，记录前 20 个生成平台的 `ID/type/x/y/width/predecessorId/generationAttempts/degraded`，两次记录必须一致。

## 交付默认值

手测结束后恢复：

```json
{
  "enabled": true,
  "singleStep": false,
  "showRouteDebug": false,
  "exportFailureDebug": true,
  "forceDegradedFallback": false,
  "seedOverride": 0,
  "platformTypeOverride": "auto"
}
```

失败时复制以 `[DoodleJumpGame] failure-debug` 开头的整行 JSON，并附上设备、屏幕尺寸、操作步骤和最后可见平台截图。日志只用于开发复现，不作为玩法通过证明。
