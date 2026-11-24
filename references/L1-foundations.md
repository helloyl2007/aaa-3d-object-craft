# L1 基础工具层（每个项目必读）

本层是所有上层能力的装配基座。**任何项目第一步：复制本页全部代码**（改 RNG 种子即可换一套随机外观）。全部代码可直接复制使用。

依赖：`three`。产出 HTML 必须双击可直接运行：three / addons 用 CDN importmap（锁定版本）或内联打包，**禁止相对路径 import 本地模块**；`vendor/three170/` 仅作内联打包来源。`MAXA` 取各向异性上限（无 renderer 时写死 8 即可）。

---

## 1.1 数学插值工具

**用途**：帧率无关的平滑插值。`damp` 是整个 demo 手感的秘密——所有运动（相机、灯光、AI）都走它，不用 `lerp(a,b,t)` 逐帧裸插。

```js
const V3 = THREE.Vector3, PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
```

| 函数 | 说明 | 典型 k 值 |
|---|---|---|
| `damp(a,b,k,dt)` | 指数平滑，dt 为帧秒数 | 相机 8~14，灯光 6，AI 3 |
| `sstep(a,b,x)` | 平滑阶梯，做磨损/斑驳过渡带 | — |

## 1.2 可复现随机数（mulberry32）

**用途**：种子化 RNG，同种子 = 同外观。程序化材质、道具摆放的随机磨损全靠它，保证「刷新后场景一模一样」。

```js
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = mulberry(20261110);        // 换种子 = 换外观
const rr = (a, b) => a + (b - a) * R(); // [a,b) 区间随机
```

| 参数 | 含义 |
|---|---|
| 种子 `20261110` | 任意整数；不同种子产生不同磨损布局 |

## 1.3 值噪声 + 分形布朗（fbm）

**用途**：全部程序化材质的地基。混凝土毛孔、锈迹、拉丝钢、织物纹理都由它合成。**确定性**——同输入永远同输出（与 R 种子无关，`s` 参数做通道隔离）。

```js
const PERM = new Uint8Array(512), VAL = new Float32Array(256);
{ const r = mulberry(7); for (let i = 0; i < 256; i++) { PERM[i] = i; VAL[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = PERM[i]; PERM[i] = PERM[j]; PERM[j] = t; }
  for (let i = 0; i < 256; i++) PERM[i + 256] = PERM[i]; }
function vn(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  let x0 = xi % px; if (x0 < 0) x0 += px;
  let y0 = yi % py; if (y0 < 0) y0 += py;
  const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const p0 = PERM[x0 & 255], p1 = PERM[x1 & 255];
  const a = VAL[PERM[(p0 + y0 + s) & 255]], b = VAL[PERM[(p1 + y0 + s) & 255]];
  const c = VAL[PERM[(p0 + y1 + s) & 255]], d = VAL[PERM[(p1 + y1 + s) & 255]];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(u, v, oct, px, py, s = 0) {
  // 内联 vn：省掉每八度的函数调用；正区间用 |0 取整，负区间回退 floor
  let amp = .5, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const x = u * px, y = v * py;
    const xi = x >= 0 ? x | 0 : Math.floor(x), yi = y >= 0 ? y | 0 : Math.floor(y);
    const fx = x - xi, fy = y - yi;
    let x0 = xi % px; if (x0 < 0) x0 += px;
    let y0 = yi % py; if (y0 < 0) y0 += py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const uu = fx * fx * (3 - 2 * fx), vv = fy * fy * (3 - 2 * fy);
    const ss = s + i * 19, p0 = PERM[x0 & 255], p1 = PERM[x1 & 255];
    const a = VAL[PERM[(p0 + y0 + ss) & 255]], b = VAL[PERM[(p1 + y0 + ss) & 255]];
    const c = VAL[PERM[(p0 + y1 + ss) & 255]], d = VAL[PERM[(p1 + y1 + ss) & 255]];
    sum += amp * (a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv);
    norm += amp; amp *= .5; px *= 2; py *= 2;
    if (px > 256 || py > 256) break;
  }
  return sum / norm;
}
```

| 参数 | 含义 | 经验值 |
|---|---|---|
| `u,v` | 归一化坐标 [0,1) | — |
| `oct` | 八度数，细节层次 | 3 细刮痕 / 5 大斑块 |
| `px,py` | 周期（平铺保证） | 4~128 |
| `s` | 通道种子偏移 | **不同用途必须错开**（1,2,3…），否则相关联 |

## 1.4 canvas 纹理工厂

**用途**：DOM canvas → THREE 纹理。所有贴图（含屏幕内容、贴花）走这一个出口。

```js
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texFrom(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAXA; return t;   // MAXA = Math.min(8, renderer.capabilities.getMaxAnisotropy())
}
```

| 参数 | 含义 |
|---|---|
| `srgb` | 颜色贴图传 `true`，法线/数据贴图传 `false` |
| `repeat` | 平铺贴图 `true`；屏幕/贴花传 `false` |

## 1.5 pbr() 四通道合成器 ★核心

**用途**：一次生成 `map + normalMap + orm`（R=**烘焙 AO**、G=roughness、B=metalness）。高度场自动算法线，并从高度场自动烘出**微空腔 AO**——孔隙、裂缝、掉漆坑、划痕沟槽都会真的压暗环境光。**这是全库最重要的函数**——每种材质配方就是一个传给 `pbr()` 的着色回调。

```js
const PBR_SCRATCH = new Map();                         // H/A/HB/HC 按分辨率复用，避免反复分配
function pbrScratch(N) {
  let s = PBR_SCRATCH.get(N);
  if (!s) { s = { H: new Float32Array(N * N), A: new Float32Array(N * N), HB: new Float32Array(N * N), HC: new Float32Array(N * N) }; PBR_SCRATCH.set(N, s); }
  return s;
}
function pbr(N, fn, ns = 2, opt = {}) {
  const { H, A, HB, HC } = pbrScratch(N);
  const ca = mkCanvas(N, N), co = mkCanvas(N, N), cn = mkCanvas(N, N);
  const xa = ca.getContext('2d'), xo = co.getContext('2d'), xn = cn.getContext('2d');
  const ia = xa.createImageData(N, N), io = xo.createImageData(N, N), im = xn.createImageData(N, N);
  const da = ia.data, dor = io.data, dn = im.data, inv = 1 / N;
  const o = { h: .5, r: .5, g: .5, b: .5, rough: .5, metal: 0, ao: 1 };
  for (let y = 0, i = 0; y < N; y++) { const v = y * inv;
    for (let x = 0; x < N; x++, i++) {
      fn(x * inv, v, o, x, y); H[i] = o.h; A[i] = o.ao; const j = i * 4;
      da[j] = o.r * 255; da[j + 1] = o.g * 255; da[j + 2] = o.b * 255; da[j + 3] = 255;
      dor[j + 1] = o.rough * 255; dor[j + 2] = o.metal * 255; dor[j + 3] = 255;
    }
  }
  const k = ns * N / 256;
  for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
    const xl = (x + N - 1) % N, xr = (x + 1) % N, yu = (y + N - 1) % N, yd = (y + 1) % N;
    const nx = -(H[y * N + xr] - H[y * N + xl]) * k, ny = (H[yd * N + x] - H[yu * N + x]) * k;
    const l = 1 / Math.sqrt(nx * nx + ny * ny + 1), j = i * 4;
    dn[j] = (nx * l * .5 + .5) * 255; dn[j + 1] = (ny * l * .5 + .5) * 255; dn[j + 2] = (l * .5 + .5) * 255; dn[j + 3] = 255;
  }
  // 微空腔 AO：5×5 二项式模糊高度场；局部低于邻域均值 = 凹处，压暗 R 通道
  const w = [1, 4, 6, 4, 1];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0; for (let t = -2; t <= 2; t++) s += H[y * N + (x + t + N) % N] * w[t + 2];
    HB[y * N + x] = s / 16;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0; for (let t = -2; t <= 2; t++) s += HB[(y + t + N) % N * N + x] * w[t + 2];
    HC[y * N + x] = s / 16;
  }
  const gain = opt.cavity ?? 2.2;
  for (let i = 0; i < N * N; i++) {
    const cav = clamp((HC[i] - H[i]) * gain, 0, 1);
    dor[i * 4] = clamp(A[i] * (1 - cav * .65), 0, 1) * 255;
  }
  xa.putImageData(ia, 0, 0); xo.putImageData(io, 0, 0); xn.putImageData(im, 0, 0);
  return { map: texFrom(ca, true), normalMap: texFrom(cn, false), orm: texFrom(co, false) };
}
/* 纹理级缓存：同 key 只烘一次（高度场 / 法线 / AO 全部复用），颜色走 material.color */
const PBR_CACHE = new Map();
function pbrShared(key, N, fn, ns = 2, opt = {}) {
  let t = PBR_CACHE.get(key);
  if (!t) { t = pbr(N, fn, ns, opt); PBR_CACHE.set(key, t); }
  return t;
}
```

着色回调 `fn(u, v, o, x, y)` 每像素设置：

| 字段 | 含义 | 基准值 |
|---|---|---|
| `o.h` | 高度（算法线 + 烘微 AO 用） | 0.5 中位 |
| `o.r/g/b` | 反照率 | 金属 0.5~0.6，塑料 0.1 |
| `o.rough` | 粗糙度 | 见各材质配方 |
| `o.metal` | 金属度 | 0 或 1，可磨损过渡 |
| `o.ao` | 结构腔 AO（孔/缝/掉漆边显式给） | 默认 1；`1-孔*.5-缝*.6` |

| 参数 | 含义 |
|---|---|
| `N` | 分辨率：墙/地 1024，漆面 512，织物/聚合物 256 |
| `ns` | 法线强度换算（源默认 2） |
| `opt.cavity` | 微空腔 AO 强度，默认 2.2；0 = 关闭（省一次烘焙） |

**性能纪律**：
- 生成耗时的大头是 `fn` 内的 `fbm`；`fbm` 已内联 `vn`，正区间用 `|0`（负区间自动回退 `Math.floor`），数值结果与原版一致。
- `pbr()` 的 H/A/HB/HC 缓冲按分辨率复用（`PBR_SCRATCH`），连续生成多套材质时不再反复申请 512² 数组。
- 同一套配方要被多个对象/多个颜色复用 → 用 `pbrShared(key, N, fn, ns, opt)`，key 里带上参数与种子；中性贴图直接换 `material.color` 染色，不要为了改色重烘一遍高度场；烘焙色配方换色需重跑配方。

## 1.6 maskOf 掩码采样

**用途**：canvas 矢量绘制 → Float32Array 采样场（如混凝土气孔 PORE、地面坑洼 mask）。

```js
function maskOf(N, draw) {
  const c = mkCanvas(N, N), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, N, N); draw(x, N);
  const d = x.getImageData(0, 0, N, N).data, f = new Float32Array(N * N);
  for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255; return f;
}
/* 可平铺微结构掩码：先抽随机参数，再按九宫格重复绘制——接缝处不断线 */
function scratchMask(N, groups) {                       // groups: [[数量, 基准角, 角度散布, 最细, 最粗, 最短, 最长], ...]
  const c = mkCanvas(N, N), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.lineCap = 'round';
  for (const [cnt, ang, spr, w0, w1, l0, l1] of groups) for (let i = 0; i < cnt; i++) {
    const a = ang + rr(-spr, spr), l = rr(l0, l1), px = rr(0, N), py = rr(0, N), w = rr(w0, w1), al = rr(.25, .7), bend = rr(-.2, .2) * l;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      x.strokeStyle = `rgba(255,255,255,${al})`; x.lineWidth = w; x.beginPath();
      x.moveTo(px + ox * N, py + oy * N);
      x.quadraticCurveTo(px + ox * N + Math.cos(a) * l * .5 - Math.sin(a) * bend, py + oy * N + Math.sin(a) * l * .5 + Math.cos(a) * bend,
                         px + ox * N + Math.cos(a) * l, py + oy * N + Math.sin(a) * l); x.stroke();
    }
  }
  const d = x.getImageData(0, 0, N, N).data, f = new Float32Array(N * N);
  for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255; return f;
}
function pitMask(N, n, r0, r1) {                        // 麻点/砂眼：随机椭圆凹坑；默认不用于喷漆/钢/管，避免坑点
  const it = []; for (let i = 0; i < n; i++) it.push([rr(0, N), rr(0, N), rr(r0, r1), rr(.3, 1), rr(0, 3), rr(.5, 1)]);
  const c = mkCanvas(N, N), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const [px, py, s, al, rt, e] of it) {
    x.fillStyle = `rgba(255,255,255,${al})`; x.beginPath(); x.ellipse(px + ox * N, py + oy * N, s, s * e, rt, 0, TAU); x.fill();
  }
  const d = x.getImageData(0, 0, N, N).data, f = new Float32Array(N * N);
  for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255; return f;
}
```

| 掩码 | 经验参数 |
|---|---|
| `scratchMask(512, [[240,.35,.35,.35,.9,8,46],[200,1.9,.5,.35,.8,6,30],[160,2.9,.8,.4,1,10,60]])` | 3 组不同朝向 = 交叉细网纹；线宽 0.35~1px ≈ 1~3mm（tile 1.6m） |
| `pitMask(512, 1600, .6, 2.6)` | 可选；**喷漆/钢/管默认不用**，否则表面会显坑点；只在粗铸件/混凝土上考虑 |

## 1.7 stdMat 标准材质工厂

**用途**：pbr 贴图组 → MeshStandardMaterial，并把平铺尺寸挂到 `userData.tile` 供 Kit UV 用。这里同时做三件「去塑料感」的事：

1. **挂 `aoMap`**（复用 ORM 同一张纹理的 R 通道；three r152+ 由 `texture.channel` 选 UV 集，channel 0 = 主 `uv`，无需 uv1）；
2. **法线长度→粗糙度耦合**：法线细节被 mip 抹平后自动加粗糙度，远处高光不会变成一块平板反光；
3. **世界空间宏观噪声**（可选 `macro`）：`[反照率幅度, 粗糙度幅度, 世界尺度, 积灰]`，打破 UV 平铺、给中远景留斑驳。

```js
const SL_NOISE = `
float sl_mh(vec3 p){ p = fract(p * .3183099 + vec3(.71, .113, .419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sl_mn(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sl_mh(i), sl_mh(i + vec3(1,0,0)), f.x), mix(sl_mh(i + vec3(0,1,0)), sl_mh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sl_mh(i + vec3(0,0,1)), sl_mh(i + vec3(1,0,1)), f.x), mix(sl_mh(i + vec3(0,1,1)), sl_mh(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

function stdMat(t, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1 });
  m.aoMap = t.orm; m.aoMapIntensity = o.ao ?? .9;                 // ORM.r = 烘焙 AO
  m.userData.tile = o.tile || 1; if (o.family) m.userData.family = o.family; if (o.seed !== undefined) m.userData.seed = o.seed;
  if (o.ns) m.normalScale.set(o.ns, o.ns);
  if (o.env !== undefined) m.envMapIntensity = o.env; if (o.side) m.side = o.side;
  const mac = o.macro;                                            // [albedo, rough, worldScale, grime]
  m.onBeforeCompile = sh => {
    sh.uniforms.uMacro = { value: new THREE.Vector4(...(mac || [0, 0, 1, 0])) };
    if (mac) sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wq = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wq = instanceMatrix * wq;
    #endif
    vWPos = (modelMatrix * wq).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec4 uMacro;${mac ? '\nvarying vec3 vWPos;' : ''}${SL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>${mac ? `
  { vec3 mp = vWPos * uMacro.z;
    float m1 = sl_mn(mp), m2 = sl_mn(mp * 3.7 + 11.3);
    diffuseColor.rgb *= 1.0 + uMacro.x * (m1 * .65 + m2 * .35 - .5) * 2.0;        // 宏观斑驳
    float gr = smoothstep(.5, .85, m1 * .6 + m2 * .4) * uMacro.w;                  // 高处积灰
    float lo = smoothstep(.6, 0.0, vWPos.y) * uMacro.w;                            // 贴地积灰
    diffuseColor.rgb *= 1.0 - (gr * .35 + lo * .25); }` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef USE_NORMALMAP
  { float slNl = length( texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0 );
    roughnessFactor = sqrt( roughnessFactor * roughnessFactor + clamp(1.0 - slNl, 0.0, 1.0) * .6 ); }
#endif${mac ? `
  { vec3 mp = vWPos * uMacro.z;
    float m1 = sl_mn(mp), m2 = sl_mn(mp * 3.7 + 11.3);
    roughnessFactor += uMacro.y * ((m2 - .5) * 1.4 + (m1 - .5) * .8); }` : ''}
roughnessFactor = clamp( roughnessFactor, .045, 1.0 );`);
  };
  m.customProgramCacheKey = () => (mac ? 'slM' : 'sl') + 'r';
  return m;
}
```

| 参数 | 含义 | 经验值 |
|---|---|---|
| `tile` | 1 UV 单位对应世界米数 | 墙 4，小件 0.1~1.4 |
| `family` | 材质族标记 | 写入 `userData.family`，供调试回查 |
| `seed` | 配方种子 | 写入 `userData.seed`，同族个体区分 |
| `ns` | 法线缩放 | 枪械 0.5（抑制） |
| `env` | 环境贴图强度 | 金属件 2~2.2 |
| `ao` | AO 强度（只压环境光） | 0.8~1；与烘焙 AO 叠加别超 1 |
| `macro` | 世界空间噪声 | 漆面 `[.18,.14,.45,.35]`；混凝土 `[.22,.12,.35,.35]`；金属 `[.08,.06,3,.1]`；省略 = 关闭 |
| `macro[2]` | 噪声世界尺度（1/m） | 0.35~0.5 大斑块；1~3 中件；6~20 小件 |

**为什么 macro 必须按世界坐标算**：贴图是 UV 平铺的，中远景一进 mip 就退化成纯色；世界空间噪声不随 UV 重复，mip 也抹不掉，是「远看仍斑驳」的关键。

**自定义 onBeforeCompile 的叠加规则**：先存 `const stdFx = m.onBeforeCompile`，在新回调第一行 `stdFx(sh)`，并重设 `customProgramCacheKey`（如 `() => 'slr-floor'`）。直接赋值会覆盖 AO/粗糙度补丁；不改 key 则会与其它 stdMat 材质串用同一份已编译程序。

## 1.8 TRS + boxUV

**用途**：TRS 一步造变换矩阵；boxUV 按世界尺度重投盒体 UV（保证贴图密度一致——大墙小箱纹路同粗细）。

```js
function TRS(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
}
function boxUV(g, tile) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, s = 1 / tile;
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax > ay && ax > az) uv.setXY(i, p.getY(i) * s, p.getZ(i) * s); else if (ay > az) uv.setXY(i, p.getX(i) * s, p.getZ(i) * s); else uv.setXY(i, p.getX(i) * s, p.getY(i) * s); }
}
```

### 1.8.1 法线平滑 `smoothNormals()`

**用途**：按位置焊接法线。软体 / 变形网格 / 非索引几何（`RoundedBoxGeometry`、`IcosahedronGeometry`）在形变后如果直接 `computeVertexNormals()`，会得到逐面法线，光滑曲面出现拼接硬边。本函数按位置累加面法线，再写回每个顶点。

```js
function smoothNormals(geo, tol = 1e-4) {
  const pos = geo.attributes.position, idx = geo.index ? geo.index.array : null;
  const tri = idx ? idx.length / 3 : pos.count / 3;
  const key = i => `${Math.round(pos.getX(i) / tol)},${Math.round(pos.getY(i) / tol)},${Math.round(pos.getZ(i) / tol)}`;
  const acc = new Map(), a = new V3(), b = new V3(), c = new V3(), n = new V3();
  for (let t = 0; t < tri; t++) {
    const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    n.crossVectors(b.sub(a), c.sub(a));                 // 长度 = 2×面积，天然面积加权
    if (n.lengthSq() < 1e-20) continue;                 // 跳过退化三角形
    for (const i of [ia, ib, ic]) {
      const k = key(i), v = acc.get(k);
      if (v) { v.x += n.x; v.y += n.y; v.z += n.z; } else acc.set(k, n.clone());
    }
  }
  let nor = geo.attributes.normal;
  if (!nor) { nor = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3); geo.setAttribute('normal', nor); }
  for (let i = 0; i < pos.count; i++) {
    const v = acc.get(key(i));
    if (v) { n.copy(v).normalize(); nor.setXYZ(i, n.x, n.y, n.z); }
  }
  nor.needsUpdate = true; return geo;
}
```

| 场景 | 用法 |
|---|---|
| 软体 / 布料 / 变形网格 | 变形后 `smoothNormals(geo)`；不要再直接 `computeVertexNormals()` |
| 大曲面高光带 | 先提高分段（曲面 64×32 起），再用 `smoothNormals()`；分段不足时平滑也挡不住条带 |
| 机械件 / 需要硬边 | 保留原法线或用 `flatShading`，不要调用本函数 |
| UV 接缝 | 按位置平滑即可；UV 仍保持分离，不影响贴图 |

## 1.9 Kit 几何装配器 ★核心

**用途**：**声明式拼装道具**。链式调用把几十个盒/圆柱按局部坐标堆进材质桶，最后 `build()` 按材质合并成极少量 Mesh（一个道具通常只产生十几个 draw call）。共享材质自动 UV。

```js
class Kit {
  constructor(tileMul = 1) { this.b = new Map(); this.tm = tileMul; this.base = null; }
  at(x, y, z, ry = 0, rx = 0, rz = 0) { this.base = TRS(x, y, z, rx, ry, rz); return this; }
  put(geo, mat, m, uv = 'box') {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (m) g.applyMatrix4(m); if (this.base) g.applyMatrix4(this.base);
    if (uv === 'box') boxUV(g, (mat.userData.tile || 1) * this.tm);
    if (!this.b.has(mat)) this.b.set(mat, []); this.b.get(mat).push(g); return this;
  }
  box(w, h, d, x, y, z, mat, o = {}) {
    const r = o.r ?? Math.min(.012, Math.min(w, h, d) * .3);
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, o.seg ?? 2, r) : new THREE.BoxGeometry(w, h, d);
    return this.put(g, mat, TRS(x, y, z, o.rx, o.ry, o.rz), o.uv);
  }
  cyl(rt, rb, h, x, y, z, mat, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 20, 1, o.open ?? false, 0, o.arc ?? TAU);
    const tile = (mat.userData.tile || 1) * this.tm, su = Math.max(1, Math.round(TAU * Math.max(rt, rb) / tile)), sv = h / tile, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return this.put(g, mat, TRS(x, y, z, o.rx, o.ry, o.rz), 'keep');
  }
  geo(g, x, y, z, mat, o = {}) { return this.put(g, mat, TRS(x, y, z, o.rx, o.ry, o.rz, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1), o.uv ?? 'keep'); }
  build(o = {}) {
    const grp = new THREE.Group();
    for (const [mat, list] of this.b) { const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = o.cast ?? true; mesh.receiveShadow = o.receive ?? true; if (o.layer) mesh.layers.set(o.layer); grp.add(mesh); }
    return grp;
  }
}
```

| API | 说明 |
|---|---|
| `at(x,y,z,ry,rx,rz)` | 设定基座变换，后续 put 都相对它（做「整组道具」） |
| `box(w,h,d, x,y,z, mat, o)` | 圆角盒；`o.r` 圆角（默认自动），`o.rx/ry/rz` 旋转 |
| `cyl(rt,rb,h, …, o)` | 圆柱；`o.seg` 分段、`o.arc` 扇形、`o.open` 开口 |
| `geo(g, …, o)` | 任意几何（Lathe/Extrude/Shape），`o.sx/sy/sz` 缩放 |
| `build(o)` | 合并输出 Group；`o.cast/receive` 阴影、`o.layer` |

依赖：`RoundedBoxGeometry`、`mergeGeometries`（importmap addons 路径）。

## 1.10 碰撞登记与全局挂钩

**用途**：`solid()` 登记 AABB 碰撞体（供自定义射线 / 滑动查询用）；`updaters` 数组挂每帧回调；`noAO` 声明透明对象排除出 AO 层。

```js
const colliders = [];
const solid = (x0, y0, z0, x1, y1, z1) => colliders.push([x0, y0, z0, x1, y1, z1]);
const noAO = [];          // objects hidden from the AO g-buffer (additive / transparent fx)
const updaters = [];
let TIME = 0;
```

---

## 最小装配示例

```js
const MAXA = 8;
// （L1 全量代码）...
const T = {};
T.demo = pbr(256, (u, v, o) => { const n = fbm(u, v, 5, 4, 4, 1);
  o.r = o.g = o.b = .3 + (n - .5) * .2; o.rough = .8; o.metal = 0; });
const M = { demo: stdMat(T.demo, { tile: 1 }) };
const K = new Kit();
K.box(1, 1, 1, 0, .5, 0, M.demo);
K.cyl(.4, .4, 1.2, 1.5, .6, 0, M.demo);
scene.add(K.build());
```

本页只提供固定基座代码；具体验证在作品内按需回归，不依赖固定验证页。
