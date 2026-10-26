# v50 奶蛙角色与表情

制作方式：内置 `image_gen`；最终稿为已有图的身份校准编辑。源图在 `sheets`，1:1 显示帧在 `frames`，尺寸在 `display-sizes.json`；原先闭眼版本作为弃稿保留在 `sheets/drafts`。

角色依据：`docs/games/meme-runner/references/v50/README.md`。常态圆眼与失败半睁绿眼优先于旧版仅凭狂笑图建立的形象约束。

最终输入与输出：

| 成图 | 编辑目标与参考 | 输出 |
| --- | --- | --- |
| 跑步 | 8 帧姿态参考稿 + 闭嘴正脸、托腮与侧脸网络参考 | `sheets/run-cycle.png` |
| 16 姿势动作 | 动作稿 + 闭嘴、流泪与最终跑步身份参考 | `sheets/actions.png` |
| 失败结算 | 沮丧双人插画 + 闭嘴正脸、流泪参考 | `sheets/defeat.png` |
| 暂停／成功 | 双场景插画 + 闭嘴正脸、大笑参考 | `sheets/dialogs.png` |

最终提示词见 [prompts.md](prompts.md)。切帧与注册：`python3 tools/meme-runner/prepare-art-v50.py`。合图：`python3 sprite-atlas-sources/build.py --game meme-runner`。随后遵循公共图集元数据同步、资源刷新及 TinyPNG 压缩流程，仅压缩改动的 `visual/v50/hero.png` 与 `visual/v48/story.png`。保持 v48 场景、机关及客户资源。

跑步采用 8 个完整姿势并统一地面基线；空中前滚翻为 4 个真正翻转的整身姿势。低滑姿势按低碰撞体显示比例注册。失败世界角色采用已审核的皱眉抱腹姿势，避免候选垂手图仍残留上扬嘴角。
