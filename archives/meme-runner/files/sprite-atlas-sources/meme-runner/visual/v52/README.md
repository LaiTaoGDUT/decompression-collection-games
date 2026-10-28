# v52 连续跑步与脚底接触

v50/v51 整身帧之间的体形、关节和落脚点不一致。v52 将主角的跑步、腾跃、落地和翻滚切换为同一身体与连续活动的四肢；滑铲、受伤、骑乘和结算保留专门绘制的姿势。

## 素材

使用内置 `image_gen` 生成独立身体、上臂、前臂、手、大腿、小腿、脚共 7 个部件。原始输出保存在 [sheets/hero-rig.png](sheets/hero-rig.png)，完整提示词保存在 [hero-rig.prompt.txt](hero-rig.prompt.txt)。

`tools/meme-runner/prepare-rig-v52.py` 只执行裁切、等比缩小和注册，不绘制或扭曲部件。实际显示尺寸见 [display-sizes.json](display-sizes.json)。`frames` 中的图片和原始 meta 通过 `sprite-atlas-sources/build.py --game meme-runner` 合入 `assets/game-assets/meme-runner/visual/v52/hero-rig.png`，随后同步 Cocos 图集元数据并刷新。最终图集经过 Tinify 压缩：19,797 → 7,283 字节。

## 运行时约束

- `MemeRunnerGait` 定义脚底轨迹与双骨骼关节。跑动周期始终有支撑脚，支撑期脚底高度为 0、角度为 0，速度与地面反向相等；摆动期连续接入、接出，不切换膝盖弯曲方向。
- `MemeRunnerRig` 保持躯干形状和四肢长度，翻滚围绕身体中心连续旋转。`MemeRunnerMotion` 依据实际位移推进步态，入场和变大状态也使用匹配的局部距离。
- 路面纹理的后沿高于可站立的顶面 16 个设计单位。渲染将顶面与模型接触面重合，物理坐标不随图片透明边距变化。
- 袋鼠站立帧的透明下沿为 11 像素，客户为 2 像素，特殊主角姿势为 2–3 像素；这些绘图偏移由各角色视图消化。
- v50/v51 的旧跑步和空中帧保留为源素材及历史键，不再由游戏加载。

## 验证与预览

`tools/meme-runner/verify-gait-v52.cjs` 检查 2,401 个步态位置的接地、骨长、膝盖连续性和触地速度。`verify-feel-v51.cjs` 覆盖输入宽容、平台边缘、开局节奏、固定救援点及不同帧率/尺寸下的步频。

`capture-playability.cjs --rig` 在实际 Cocos 场景中检查脚底，并输出放大慢放帧；`--verify --record --v52` 检查触控、暂停重开、四种屏幕比例、结算退出及资源释放，并录制实际玩法。预览位于 `local/meme-runner-v52/foot-contact.mp4` 和 `local/meme-runner-v52/gameplay.mp4`。这些是浏览器预览验证，不代表微信真机性能测试。
