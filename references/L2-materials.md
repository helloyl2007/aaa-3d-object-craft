# L2 表面配方（基座固定 · 配方自由）

默认零外部素材：PBR 贴图全部由 canvas + fbm 噪声程序化生成。依赖 L1 基座：`pbr / stdMat / mkCanvas / maskOf / scratchMask / fbm / vn / sstep / lerp / clamp / rr / R / mulberry / Kit`。

> **本层不提供固定配方族。** 没有 `painted / hide / glaze / forge / weave …` 这一层可选清单，也没有注册表。表面结构按对象现场写 `recipe(u, v, o, ctx)`；写完即用，作品不需要它时直接删掉。

---

## 2.0 执行链路

1. **自由建模** —— 轮廓、部件、细节、数量全部由模型决定（L1 Kit / 自由几何）。
2. **表面语义（可选）** —— 用 `SurfaceSpec` 回答基材 → 涂层 → 成型 → 老化 → 光学 → 尺度；词表只是回退参考。
3. **现场配方** —— 写 `recipe(u, v, o, ctx)`；用 `pbr(N, recipe)` 直接编译，或 `compileSurfaceMaps(spec, size, { recipe })` 叠加在语义层之上。
4. **材质收口** —— `surfaceMaterial(spec, textures, THREE)` 或 `stdMat`；sheen / clearcoat / transmission / emission 统一由光学字段决定。
5. **studio 验收** —— 三点光 + 三档距离 + 近景。

**固定的基座**（跨对象、跨项目稳定，不为单个作品改）：

| 基座 | 作用 |
|---|---|
| `pbr(N, fn, ns, opt)` | 高度场 → albedo / normal / ORM + 微空腔 AO |
| `stdMat` / `surfaceMaterial` | 贴图 → 标准 / 物理材质，统一 PBR 收口 |
| `vn / fbm / maskOf / scratchMask` | 可平铺噪声与结构掩码 |
| `Kit / tubeGeo / softBlobGeo` | 合批与形体 |

**自由的配方**：纯函数，每像素改 `o.r/g/b/h/rough/metal/ao`。

```js
// 写在作品文件、临时模块都行；不登记也能跑
const scalePlate = (u, v, o, ctx) => {
  const rows = 8, cols = 7;
  const cu = u * cols, cv = v * rows;
  const iu = Math.floor(cu), iv = Math.floor(cv);
  const fu = cu - iu, fv = cv - iv;
  const d = Math.hypot((fu - .5) * 1.1, (fv - .5) * .9);
  const plate = 1 - sstep(.34, .52, d);
  o.h = .42 + plate * .10 + (vn(u * 96, v * 96, 96, 96, ctx.seed) - .5) * .02;
  o.rough = .52 + plate * .10;
  o.ao = 1 - (1 - plate) * .35;
  o.r *= .9 + plate * .12; o.g *= .9 + plate * .12; o.b *= .9 + plate * .12;
};
```

**配方必须显式回答三件事**：

1. **结构来源** —— 瓦叠片（鳞 / 羽 / 甲）、方向纤维（绒 / 毛 / 发）、场（锈 / 尘 / 湿 / 焦），还是单一涂层。
2. **颜色策略** —— `baked`（颜色烘进贴图，换色重烘）或 `neutral`（贴图只出明度与磨损，颜色走 `material.color`）；不得混用。
3. **磨损去向** —— 改颜色、粗糙度、法线还是 AO；不要把所有变化都塞给 albedo。

**两级尺度**：中观结构（片 / 簇 / 裂纹，约 5~40mm）+ 微观结构（丝 / 麻点 / 划痕，约 2~8mm）。只有一级会像贴图。

**通用参数约定**（写法约定，不是强制）：`seed`（噪声偏移）、`tile`（1 UV = 多少米）、`ns`（法线强度）、`env`（金属 2.2~2.8）、`color`（中性配方 tint）。

---

## 2.1 SurfaceSpec：语义起手式（不是白名单）

`lib/surface-spec.js`。未登记的基材 / 涂层 / 成型 / 老化按通用规则回退并给出 warning，不报错；结构交给 `recipe`。

| 字段 | 参考取值（可自定义） | 决定 |
|---|---|---|
| `substrate` | metal / polymer / ceramic / glass / wood / stone / fabric / leather / organic / composite / liquid / 自定 | 基础色、metalness、粗糙度区间 |
| `coating` | none / paint / clearcoat / oxide / plating / oil / wax / grime / snow / water / 自定 | 表层颜色、反光、掉漆、锈、湿 / 雪 |
| `process` | cast / rolled / forged / machined / turned / brushed / polished / sandblasted / molded / woven / knapped / grown / engraved / 自定 | 法线频段与方向性 |
| `wear` | chips / scratches / dents / rust / soot / dust / edge_polish / uv_fade / bio / 自定 | 颜色迁移、粗糙度、局部凹痕 |
| `optical` | metalness / roughness / transmission / sheen / clearcoat / anisotropy / emission | 最终 PBR 参数 |
| `scale` | macro（米级）/ micro（毫米级）/ tile | 噪声频率与重复密度 |
| `recipe` | `(u,v,o,ctx) => void`（可选） | 词表之外的表面结构 |

```js
import { compileSurfaceMaps, mapsToTextures, surfaceMaterial, validateSurfaceSpec } from '../lib/surface-spec.js';

const check = validateSurfaceSpec(spec);          // 未登记词表 → warnings，不报错
const maps  = compileSurfaceMaps(spec, 256);      // 语义层 + spec.recipe
const tex   = mapsToTextures(maps, THREE);
const mat   = surfaceMaterial(spec, tex, THREE);  // sheen / clearcoat / transmission 统一收口

// 词表之外：直接带 recipe，不需要改库
compileSurfaceMaps({ substrate: 'keratin', color: [.9, .8, .6], recipe: featherRecipe }, 512);
```

`recipe` 的执行位置在参考层之后，`o` 带着已叠加的当前值，可整体改写。`ctx` 提供 `seed / scale / color / substrate / coating / process / wear`。

---

## 2.2 现场写配方检查表

1. **结构**：瓦叠片 / 方向纤维 / 场 / 涂层，先定高度场。
2. **两级尺度**：中观 + 微观都要有；微观只动 normal / roughness。
3. **通道分工**：高度 → 法线 + 微 AO；粗糙度给区间；albedo 只做颜色迁移。
4. **颜色策略**：多配色 → 中性贴图 + `material.color`；一次性 → 烘色。
5. **验收**：近看表面、退远看剪影；关掉宏观噪声后结构仍可辨。
6. **晋升**：同一配方第二次出现或跨项目复用，才沉淀进库并补回归验证；否则留在作品文件里。

---

## 2.3 验证

在作品内用 `pbr + recipe + surfaceMaterial` 回归烘焙链路即可；不依赖固定验证页，也不把作品内的一次性配方写进库。`lib/surface-spec.js` 可用 Node 跑语义与回退测试（未登记词表 → warning、自定义 recipe → 可编译）。