---
name: aaa-3d-object-craft
description: 面向轻量（Flash）LLM 的 Three.js 单体创作技能：帮助模型稳定产出接近 AAA 游戏画质的单件资产（角色、道具、器械、载具、器物），不做场景编排；不适用于 2D 页面、纯 UI 或非 Three.js 项目。
---

# AAA 3D 单体创作能力库（角色 · 道具 · 器械）

**可复用渲染能力库**；目标是通过「自由建模 → 基座固定、配方自由的烘焙 → studio 展示」产出**一个高质量单体**。没有支线：不按对象类路由，不写细节清单，不建材质套件，不做场景编排。

## 核心原则

1. **自由建模** —— 轮廓、部件、几何细节与数量全部由模型按形体需要决定；不查清单、不套模板、不预设对象类型。
2. **基座固定、配方自由** —— `pbr / stdMat / surfaceMaterial / 噪声 / mask / Kit / 灯光` 固定；表面结构按表面语义现场写 `recipe(u,v,o,ctx)`，可放作品文件或临时模块、用完即弃。**不建注册表、不按对象类选套件、不保留固定配方族**；词表只是回退参考，不是白名单。
3. **烘焙只做表面** —— `SurfaceSpec` 是可选的语义起手式，只回答基材 / 涂层 / 成型 / 老化 / 光学 / 尺度；`recipe` 只产出表面通道。两者都不输出几何做法、不规定细节数量。
4. **Studio 展示固定** —— 三点光 + 转台 + 三档距离（近 1.2H / 中 1.9H / 远 3.4H）+ 近景；沿用现有 studio 展示模式。

**配方晋升规则**：作品内一次性配方留在作品里；同一配方出现第二次、或跨项目要复用，才沉淀进库。不要提前把“可能用到”的配方写进公共库。

## 唯一执行链路

1. **Brief** —— 对象 / 用途 / 风格 / 磨损。
2. **自由建模** —— 自由几何做轮廓与细节；本层不干预细节设计与数量。
3. **烘焙** —— 先回答表面语义；词表覆盖不了的结构直接写 `recipe(u,v,o,ctx)`，用 `pbr(N, recipe)` 或 `compileSurfaceMaps(spec, size, { recipe })` 编译。
4. **材质收口** —— `surfaceMaterial(spec, textures, THREE)`（或 `stdMat`）；sheen / clearcoat / transmission / emission 由光学字段统一决定。
5. **Studio** —— 三点光 + 三档 + 近景；逐项验收。

## 速查表

| # | 能力 | 入口 | 要点 | 详表 |
|---|---|---|---|---|
| 1 | 数学 / RNG | `mulberry(seed)` `rr` `clamp/lerp/sstep/damp` | 一切随机走种子；插值用 `damp(a,b,k,dt)` | L1 |
| 2 | 值噪声 | `vn(x,y,px,py,s)` `fbm(u,v,oct,px,py,seed)` | 可平铺；`s` 隔离不同纹理层 | L1 |
| 3 | PBR 合成器 | `pbr(N, fn, ns, opt)` | 高度场 → map / normal / ORM + 微空腔 AO | L1 |
| 4 | 材质工厂 | `stdMat(t,{tile,ns,env,ao,macro})` `emis([rgb],i)` | tile 按世界米数；macro 做世界空间斑驳 | L1 |
| 5 | 表面配方（自由） | `pbr(N, recipe)` · `surfaceMaterial` | 基座固定；配方现场写，无套件无注册表 | L2 |
| 6 | SurfaceSpec | `normalizeSurfaceSpec` · `compileSurfaceMaps(...,{recipe})` | 词表只做回退参考；结构用 recipe 承接 | L2 |
| 7 | Kit 合批 | `new Kit().at().box/cyl/geo().build()` | 同材质自动 merge，一个道具只出一个 Mesh | L1 |
| 8 | 软体 / 流线 / 布料 | `softBlobGeo` `tubeGeo` `deformGeo` `clothMat` | 高分段形变；曲线用 CatmullRom；布靠 sheen | L9 |
| 9 | studio 展示 | 三点光 + 转台 + 三档 | 近看表面 / 中看比例 / 远看剪影 | L12 |

文件映射：L1 `references/L1-foundations.md` · L2 `references/L2-materials.md` · L9 `references/L9-soft-flow.md` · studio `references/L12-subject.md` · 规格 `lib/surface-spec.js`。

## 交付链路

| 步 | 入口 | 输入 | 输出 | 判据 |
|---|---|---|---|---|
| ① 建模 | 自由几何（Kit / loft / box / Tube / Extrude） | brief + 轮廓 | 几何与细节（数量自定） | 轮廓像；形体成立 |
| ② 烘焙 | [SurfaceSpec](lib/surface-spec.js) 或现场 `recipe` | 已建模部件 | albedo / normal / rough / metal / AO | 每个部件有配方；表面有依据 |
| ③ 展示 | [L12 studio](references/L12-subject.md) | 单体 + 三点光 + 转台 | 三档机位 + 近景 | 近看表面 / 中看比例 / 远看剪影 |

**职责边界**：`SurfaceSpec` 只决定基材 / 涂层 / 成型 / 老化 / 光学 / 尺度（词表只是参考）；`recipe` 只产出表面通道。两者都不输出分缝、螺栓、铰链、通风口、管线、碎件等几何做法，也不规定数量。

## 单体装配流程

1. **语义 brief** —— 4 轴落值（对象 / 轮廓特征 / 材质基因 / 磨损叙事），产出摘要给用户确认。
2. **自由建模** —— 先用 Kit / loft / box / Tube 把轮廓做对；细节与数量按形体需要自行决定。
3. **烘焙** —— 为每个已建模部件写 SurfaceSpec（或直接回答表面语义），词表覆盖不了的结构直接写 `recipe`；编译 PBR 并用 `surfaceMaterial` 收口。
4. **展示** —— 进 studio 三档 + 近景；看表面是否有依据、比例是否成立，不检查细节数量。

## 模块卡格式

每个能力 = 一个模块卡：**用途 / 依赖 / 代码 / 参数 / 示例**。

## Studio 展示模式

固定展示配置，不随对象改变；完整参数见 [L12 studio](references/L12-subject.md)。

```js
// 背景：CSS 径向渐变 + alpha 画布（无 HDRI、无雾）
// 光：key(45°上，2.4) + fill(反侧，.7，冷) + rim(后方，1.5) + hemi(.32)
// 台面：圆柱平台（半径 1.35，深灰 rough .82），接收阴影；可勾选隐藏（纯剪影验收）
// 转台：group.rotation.y += dt * .25（可勾选关闭）
// 相机：fov 40；三档距离 = 1.2H / 1.9H / 3.4H（H = 归一化最大尺寸）；lookAt (0, .5H, 0)
// 交互：左键拖动环绕（yaw/pitch 阻尼，pitch 限 -.28~1.15）、滚轮缩放（dist .9~6.5）
```

## 交付格式（直接运行）

产出 HTML 必须双击即可打开，不依赖本地服务器：

- three / addons 走 **CDN importmap**（锁定版本，如 `three@0.170.0`），或把 three 与 addons **内联打包**进 HTML。
- **禁止**用相对路径 import 本地模块；`file://` 下会被 CORS 拦截，页面直接空白。
- 贴图与模型全部程序化生成或内联，不引用本地素材文件。

## 验证方式

- `lib/surface-spec.js` 可用 Node 直接跑语义与回退测试（未登记词表 → warning、自定义 recipe → 可编译）。
- 作品内用 `pbr + recipe + surfaceMaterial` 回归烘焙链路，再用 studio 三档 + 近景验收；不依赖固定验证页。
- 交付前用 `file://` 双击打开一次，确认没有本地模块请求、没有 CORS 报错。

## 关键调优心法

- **单体读感**：轮廓（自由建模）+ 表面层次（现场配方）+ 磨损叙事；细节由自由建模按形体需要决定。交付前在 studio 三档 + 近景各看一次。
- **形体不方**：主形自由建模；软体 / 布料 / 绳索按需用 L9，不要用 box 硬拼。
- **平滑曲面**：变形 / 非索引几何用 `smoothNormals(geo)` 按位置平滑；直接 `computeVertexNormals()` 会变成逐面法线，出现拼接硬边。
- **材质不脏不油**：clearcoat 只给釉面 / 搪瓷；金属靠 `envMapIntensity`（2~2.8）+ roughness 区间；皮肤 / 皮革靠 `sheen`（.4~.5）而不是低粗糙。
- **选材**：从表面语义推导，不枚举对象类——先定基材（可自定名称），再定涂层、成型、老化，最后落 `color` 与 `optical`；金属 `metalness ≥ .8`、非金属 `≤ .2`；≤1 发光。参考配方不够用就现场写 recipe。
- **小件省烘焙**：已建模的 <2cm 小件用常量材质，不烘 512 贴图。
- **性能**：像素比封顶 1.5；点光 distance 封住范围；同步生成 1024² 贴图会卡主线程，先给加载遮罩，首帧后移除。
- **质感**：金属 `metalness .9~1 + envMapIntensity`；“太干净”的根因是缺 AO、粗糙度近乎常量、细节频段太窄——配方显式给 `o.ao`，微结构铺到 2~8mm，微细节只动 normal / roughness。
- **远景观感**：UV 平铺贴图进 mip 会退化成纯色，靠世界空间 `macro` 噪声与法线 → 粗糙度耦合撑住。
- **柔性体**：布是「场 + 裙边」，袋是「高分段形变」，绳是「曲线」；篷布哑光（roughness ≥ .45）靠 `sheen` 出织物边缘光。
- **手感**：所有插值用帧率无关的 `damp(a,b,k,dt)`；相机摇摆 / 后坐用正弦相位合成。
