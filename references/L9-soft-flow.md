# L9 柔性体与流线曲面层（Soft & Flow，7 项）

> 依赖：[L1-foundations.md](L1-foundations.md)（`vn/fbm/pbr/stdMat/Kit/TRS/smoothNormals`）；布料材质用本页 9.5 的函数，其余表面按需现场写 recipe。
> 解决「所有道具都像方块或圆角盒」的问题：**形体由高度场、超椭球与曲线生成，而不是 primitive 拼装**。

## 总览表

| # | 能力 | 一句话 |
|---|------|--------|
| 9.1 | 披盖场 `drapeOver()` | 任意 AABB 堆栈 → 顶面高度场 + 周圈垂坠裙边 + 卷边 + 扎带压痕 |
| 9.2 | 软体形变 `deformGeo()` / `softBagGeo()` / `softBlobGeo()` | 任意网格顶点位移；沙袋胖枕 / 软垫鼓包，摆脱圆角盒 |
| 9.3 | 垂布 `clothSheet()` / `windCloth()` | 帷幕/旗帜/垂布：褶裥 + 不规则波动 + 底边卷边 + 顶点风动 |
| 9.4 | 流线绳索 `sagPath()` / `tubeGeo()` / `ribbonGeo()` | 悬链线、绳圈、扁织带、扎带 |
| 9.5 | 织物材质 `tarpPBR()` / `weavePBR()` / `ropePBR()` | 篷布长垂褶/细皱纹/防雨布网格/积灰；麻布、织带、绳索 |
| 9.6 | 组合模板 `tarpCargo()` | 托盘 + 货块 + 披盖 + 扎带 + 绳圈（参考图复刻） |
| 9.7 | 组合模板 `sandbagWall()` | 错缝沙袋墙 + 散落沙包 + 软垫 |

---

## 9.1 披盖场 `drapeOver()` ★核心

**用途**：给任意「货块/托盘/车辆/桌台」的 AABB 集合盖一块篷布。核心不是建模一块布，而是定义一个**高度场**：每个货块在四周按坡度衰减，取最大值形成帐篷面；周圈再生成向下的垂坠裙边。

**依赖**：L1 的 `vn/fbm/clamp/lerp/sstep`；材质用 L9.5 `tarpPBR()`。

```js
function drapeOver(cfg = {}) {
  const blocks = cfg.blocks || [];
  const margin = cfg.margin ?? .12;
  let x0 = cfg.x0, x1 = cfg.x1, z0 = cfg.z0, z1 = cfg.z1;
  if (x0 === undefined) {
    x0 = Math.min(...blocks.map(b => b.x0)) - margin; x1 = Math.max(...blocks.map(b => b.x1)) + margin;
    z0 = Math.min(...blocks.map(b => b.z0)) - margin; z1 = Math.max(...blocks.map(b => b.z1)) + margin;
  }
  const base = cfg.base ?? .1, hem = cfg.hem ?? .012, slope = cfg.slope ?? .85, slope2 = cfg.slope2 ?? .22;
  const billow = cfg.billow ?? .014, foldAmp = cfg.foldAmp ?? .01, seed = cfg.seed ?? 0, s = seed * 1.7;
  const NX = cfg.segX ?? 40, NZ = cfg.segZ ?? 26, KS = cfg.skirt ?? 8;
  const flare = cfg.flare ?? .07, skirtFold = cfg.skirtFold ?? .018, tile = cfg.tile ?? 1.5;
  const warp = cfg.warp ?? 0;
  const wx = (x, z) => x + (vn(x * 1.35 + s, z * 1.05, 97, 97, 31) - .5) * warp * 2 + Math.sin(z * 1.7 + s) * warp * .55;
  const wz = (x, z) => z + (vn(x * 1.15, z * 1.45 + s, 97, 97, 37) - .5) * warp * 2 + Math.cos(x * 1.9 + s) * warp * .55;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  const cornerDrop = cfg.cornerDrop ?? 0, tiltX = cfg.tiltX ?? 0, tiltZ = cfg.tiltZ ?? 0;
  const tiesX = cfg.tiesX || [], tiesZ = cfg.tiesZ || [], tieDepth = cfg.tieDepth ?? .022, tieW = cfg.tieW ?? .055;
  const tieAt = (x, z) => {
    let t = 0;
    for (const tx of tiesX) { const d = x - tx; t = Math.max(t, Math.exp(-d * d / (2 * tieW * tieW))); }
    for (const tz of tiesZ) { const d = z - tz; t = Math.max(t, Math.exp(-d * d / (2 * tieW * tieW))); }
    return t;
  };
  const hAt = (x, z) => {
    let y = base;
    for (const b of blocks) {
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1), d = Math.hypot(dx, dz);
      y = Math.max(y, (b.h ?? 1) + .015 - slope * d - slope2 * d * d);
    }
    const ex = clamp(Math.abs((x - cx) / hx), 0, 1), ez = clamp(Math.abs((z - cz) / hz), 0, 1);
    y -= cornerDrop * Math.pow(ex * ez, 1.45);                  // 四角下垂
    y += tiltX * (x - cx) + tiltZ * (z - cz);                   // 整体拉扯倾斜
    y -= tieDepth * tieAt(x, z);                                // 扎带压出的沟
    y += billow * (vn(x * 1.9 + s, z * 1.9, 97, 97, 5) - .5) * 2;
    y += foldAmp * Math.pow(1 - Math.abs(vn(x * 3.1 + s, z * 5.3, 97, 97, 11) * 2 - 1), 1.3);
    y += foldAmp * .8 * Math.pow(1 - Math.abs(vn(x * 6.3 + s, z * 2.6, 97, 97, 23) * 2 - 1), 1.6);
    y += (cfg.fineAmp ?? .008) * Math.pow(1 - Math.abs(vn(x * 13.0 + s, z * 10.5, 97, 97, 41) * 2 - 1), 1.8);
    return Math.max(y, base * .4);
  };
  const nAt = (x, z) => {
    const e = .01, dx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e), dz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
    return new V3(-dx, 1, -dz).normalize();
  };
  const pos = [], uv = [], idx = [], gi = (i, j) => j + i * (NX + 1);
  for (let i = 0; i <= NZ; i++) for (let j = 0; j <= NX; j++) {
    const bx = lerp(x0, x1, j / NX), bz = lerp(z0, z1, i / NZ), x = wx(bx, bz), z = wz(bx, bz);
    pos.push(x, hAt(x, z), z); uv.push(x / tile, z / tile);
  }
  for (let i = 0; i < NZ; i++) for (let j = 0; j < NX; j++) {
    const a = gi(i, j), b = gi(i, j + 1), c = gi(i + 1, j + 1), d = gi(i + 1, j);
    idx.push(a, d, b, b, d, c);
  }
  const edges = [], add = (x, z, nx, nz) => edges.push({ x, z, nx, nz });
  for (let j = 0; j < NX; j++) add(lerp(x0, x1, j / NX), z0, 0, -1);
  for (let i = 0; i < NZ; i++) add(x1, lerp(z0, z1, i / NZ), 1, 0);
  for (let j = NX; j > 0; j--) add(lerp(x0, x1, j / NX), z1, 0, 1);
  for (let i = NZ; i > 0; i--) add(x0, lerp(z0, z1, i / NZ), -1, 0);
  for (const e of edges) {
    if (Math.abs(e.x - x0) < 1e-6 && Math.abs(e.z - z0) < 1e-6) { e.nx = -.7071; e.nz = -.7071; }
    else if (Math.abs(e.x - x1) < 1e-6 && Math.abs(e.z - z0) < 1e-6) { e.nx = .7071; e.nz = -.7071; }
    else if (Math.abs(e.x - x1) < 1e-6 && Math.abs(e.z - z1) < 1e-6) { e.nx = .7071; e.nz = .7071; }
    else if (Math.abs(e.x - x0) < 1e-6 && Math.abs(e.z - z1) < 1e-6) { e.nx = -.7071; e.nz = .7071; }
  }
  let arc = 0;
  for (let e = 0; e < edges.length; e++) {
    const E = edges[e], ox = E.x, oz = E.z; E.x = wx(ox, oz); E.z = wz(ox, oz); E.y = hAt(E.x, E.z);
    if (e > 0) arc += Math.hypot(E.x - edges[e - 1].x, E.z - edges[e - 1].z);
    E.arc = arc;
  }
  const skirtAt = (E, P) => {
    const ph1 = E.arc * 2.2 + P * 2.8 + s, ph2 = E.arc * 6.8 + s * 1.9;
    const sharp = (Math.pow(Math.abs(Math.sin(ph1)), .4) - .5) * .8;    // 尖谷圆峰：垂褶
    const tilt = Math.sin(E.arc * 1.05 + P * 2.2 + s) * .34;
    const fine = Math.sin(ph2) * .2 + Math.sin(E.arc * 13.1 + s * .7) * .1;
    const micro = Math.sin(E.arc * 27.0 + P * 13.0 + s * 1.3) * .045 + Math.sin(E.arc * 47.0 + s) * .025;
    const tie = tieAt(E.x, E.z);
    const fold = (sharp + tilt + fine + micro) * skirtFold * (1 + tie * .85) * P;
    const tang = (Math.sin(E.arc * 2.3 + P * 3.4 + s * 1.3) * .6 + Math.sin(E.arc * 7.7 + s) * .4) * skirtFold * 1.25 * Math.pow(P, 1.1);
    const roll = sstep(.86, 1, P) * .035;                                // 底边卷边
    const rad = flare * Math.pow(P, .8) + fold + roll - tieDepth * .7 * tie * P;
    const y = E.y + (hem - E.y) * (.18 * P + .82 * P * P) + Math.sin(E.arc * 5.2 + s) * .024 * P * P + roll * .35
      - (P > .02 && P < .26 ? .016 * (1 - P / .26) : 0);
    return [E.x + E.nx * rad - E.nz * tang, y, E.z + E.nz * rad + E.nx * tang];
  };
  const ec = edges.length, vBase = pos.length / 3;
  for (let k = 0; k <= KS; k++) {
    const P = k / KS;
    for (const E of edges) { const [x, y, z] = skirtAt(E, P); pos.push(x, y, z); uv.push((E.y - y) / tile, E.arc / tile); }
  }
  for (let k = 0; k < KS; k++) for (let e = 0; e < ec; e++) {
    const e2 = (e + 1) % ec, a = vBase + k * ec + e, b = vBase + k * ec + e2;
    const c = vBase + (k + 1) * ec + e, d = vBase + (k + 1) * ec + e2;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const edgeAt = (x, z) => { let best = edges[0], bd = 1e9; for (const E of edges) { const d = Math.hypot(E.x - x, E.z - z); if (d < bd) { bd = d; best = E; } } return best; };
  return { geo, hAt, nAt, edgeAt, skirtAt, edges, warpX: wx, warpZ: wz, bounds: { x0, x1, z0, z1 } };
}
```

| 参数 | 含义 | 调法 |
|---|---|---|
| `blocks:[{x0,x1,z0,z1,h}]` | 被盖住的 AABB 堆栈 | 高度 `h` 是顶面高度；不同高度产生山脊与谷 |
| `margin` | 布边超出货块的余量 | **0.1~0.15**；越小布边越高、裙边越长 |
| `slope / slope2` | 货块向外的衰减坡度 | 0.8~1.2；越大越贴箱，越小越像厚被 |
| `base / hem` | 布面基准高 / 裙边底缘高 | 货垛 0.16 / 0.012 |
| `flare` | 裙边外扩 | 0.08~0.14；越大下摆越蓬 |
| `skirtFold` | 裙边褶量 | 0.08~0.12；**必须配 9.5 的法线贴图** |
| `warp` | 顶面/边缘平面扰动 | 0.03~0.05，破掉矩形感 |
| `cornerDrop` | 四角下垂 | 0.06~0.1 |
| `tiltX/tiltZ` | 整体拉扯倾斜 | ±0.05；让布不是“对称罩子” |
| `tiesX/tiesZ` | 扎带位置（沿 x 或 z 的线） | 与扎带坐标一致；线下方自动压出沟 |
| `segX/segZ/skirt` | 顶面与裙边细分 | 40/26/8 起；大布 48/30/16 |
| `fineAmp` | 顶面细皱纹幅度 | 0.006~0.01；再大像搓衣板 |
| `tile` | 1 UV = 多少米 | 1.5（篷布） |

**示例**：

```js
const D = drapeOver({
  blocks: [
    { x0: -1.04, x1: -.14, z0: -.56, z1: .56, h: 1.34 },
    { x0: .08,  x1: 1.04, z0: -.56, z1: .28, h: 1.16 },
    { x0: .60,  x1: 1.04, z0: .32,  z1: .60, h: .82 },
  ],
  margin: .12, base: .16, flare: .12, skirtFold: .1,
  warp: .035, cornerDrop: .09, tiltX: .05, tiltZ: -.025,
  tiesX: [-.62, .53], tieDepth: .026,
  segX: 44, segZ: 28, skirt: 18, seed: 24
});
const tarp = new THREE.Mesh(D.geo, M.tarpOlive);
tarp.castShadow = tarp.receiveShadow = true;
```

**要点**：
- **布边不要收到地面**：`margin` 保持 0.1 左右，布边仍在货块顶面高度，裙边才会像参考图那样整幅垂下来。
- **先场后网格**：所有褶皱先写进 `hAt(x,z)` 与 `skirtAt(E,P)`，再由网格采样；不要在生成后随机推顶点，容易破面。
- **尖谷圆峰**：`abs(sin)^.4` 让褶谷尖、褶峰圆，这是布感的关键；纯 sin 会像瓦楞板。
- **裙边 UV 要竖着走**：`uv.push((E.y-y)/tile, E.arc/tile)`，贴图的长垂褶才会沿竖直方向。
- 顶面与裙边是两套顶点（法线在布边自然转折），不要强行焊死。

---

## 9.2 软体形变 `deformGeo()` / `softBagGeo()` / `softBlobGeo()`

**用途**：把任意高分段网格变成不规则软体。`softBagGeo` 做沙袋/粮袋（胖枕+收口），`softBlobGeo` 做软垫/不规则软包。

**依赖**：L1 `vn`；`RoundedBoxGeometry`（addons）。

```js
function deformGeo(geo, fn) {
  const p = geo.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); }
  p.needsUpdate = true; return smoothNormals(geo);          // 非索引几何必须按位置平滑，避免逐面硬边
}

function softBagGeo(w, h, d, seed = 0, o = {}) {
  const r = Math.min(w, h, d) * (o.round ?? .42);
  const geo = new RoundedBoxGeometry(w, h, d, o.seg ?? 6, r);   // 高分段是软体的前提
  const s = seed * 1.7 + 3, pinch = o.pinch ?? .2, lump = o.lump ?? 1;
  deformGeo(geo, p => {
    const nx = p.x / (w / 2), ny = p.y / (h / 2), nz = p.z / (d / 2);
    const ax = Math.abs(nx), az = Math.abs(nz);
    p.z *= 1 - pinch * Math.pow(ax, 2.2);                        // 两端收口
    p.y *= 1 - .1 * Math.pow(ax, 3);
    const bulge = Math.max(0, 1 - ax * ax) * Math.max(0, 1 - az * az);
    p.y += h * .075 * bulge * (ny > 0 ? 1 : -.45);               // 中段鼓起：胖枕
    if (p.y < 0) p.y *= o.bottom ?? .82;                         // 底面略压扁
    const n = vn(p.x * 7 + s, p.z * 7, 63, 63, 3) - .5;
    p.x += n * .02 * w * lump; p.z += n * .024 * d * lump;
    p.y += n * .018 * h * lump + (vn(p.x * 11 + s, p.z * 13, 63, 63, 9) - .5) * .012 * h * lump;
  });
  geo.computeBoundingBox();
  geo.translate(0, -h / 2 - geo.boundingBox.min.y, 0);           // 底面对齐 -h/2
  return geo;                                                    // 法线已在 deformGeo 内平滑
}

function softBlobGeo(w, h, d, seed = 0, o = {}) {
  const geo = new THREE.IcosahedronGeometry(1, o.detail ?? 3), s = seed * 2.3 + 5;
  deformGeo(geo, p => {
    const nx = p.x, nz = p.z;
    p.set(p.x * w / 2, p.y * h / 2, p.z * d / 2);
    if (p.y < 0) p.y *= (o.bottom ?? .55);
    const m = (vn(nx * 4 + s, nz * 4, 63, 63, 13) + vn(p.y * 6, nz * 5 + s, 63, 63, 17)) / 2 - .5;
    p.x += m * .055 * w * (o.lump ?? 1);
    p.z += (vn(p.z * 6 + s, p.y * 6, 63, 63, 19) - .5) * .055 * d * (o.lump ?? 1);
    p.y += m * .05 * h * (o.lump ?? 1);
  });
  geo.computeBoundingBox(); geo.translate(0, -h / 2 - geo.boundingBox.min.y, 0);
  return geo;                                                    // 法线已在 deformGeo 内平滑
}
```

| 参数 | 含义 | 调法 |
|---|---|---|
| `w/h/d` | 袋体尺寸 | 沙袋 0.64 × 0.24 × 0.42 |
| `seg` | 圆角盒细分 | **≥5**；低于 4 形变会成块 |
| `round` | 圆角半径比 | 0.35~0.45；太大变胶囊 |
| `pinch` | 两端收口 | 0.15~0.3 |
| `lump` | 噪声鼓包强度 | 1~1.3 |
| `bottom` | 底面压扁比 | 0.8~0.85；让袋坐稳 |

**示例**：

```js
const bag = new THREE.Mesh(softBagGeo(.64, .24, .42, 12, { lump: 1.2 }), M.burlap);
bag.position.y = .12; bag.rotation.y = .4;
```

**要点**：
- **不要用 4 段圆角盒**：形变需要顶点密度；`seg≥5` 才能做出鼓包与褶皱。
- **变形后走 `smoothNormals()`**：`RoundedBoxGeometry` / `IcosahedronGeometry` 是非索引几何，直接 `computeVertexNormals()` 会得到逐面法线，曲面出现拼接硬边。
- 形变顺序：**收口 → 鼓包 → 压底 → 噪声**；先压底再鼓包会把底部重新顶起来。
- 生成后 `computeBoundingBox()` 把底面对齐到 `-h/2`，堆叠时直接用 `y = 层高 + h/2`，不会悬空。
- 沙袋的“袋感”一半来自形体，一半来自 9.5 的麻布法线；两者缺一都会像石头。

---

## 9.3 垂布 `clothSheet()` / `windCloth()`

**用途**：帷幕、窗帘、旗帜、垂布。顶边固定在杆/索上，褶皱随下垂加深；可选顶点着色器风动。

**依赖**：L1 `fbm`；`MeshPhysicalMaterial`（9.5 `clothMat`）。

```js
function clothSheet(w, h, o = {}) {
  const sx = o.segX ?? 40, sy = o.segY ?? 28, folds = o.folds ?? 8, amp = o.amp ?? .055;
  const sag = o.sag ?? .06, billowAmp = o.billow ?? .022, flare = o.flare ?? .06;
  const phase = o.phase ?? 0, seed = o.seed ?? 0, hemWave = o.hemWave ?? .018;
  const pos = [], uv = [], idx = [];
  const at = (u, t) => {                       // u -1..1 横向，t 0..1 下垂
    const wob = fbm(u * .62 + .5, t * .34, 3, 2, 2, seed + 3) - .5;
    const wob2 = fbm(u * .95 + .2, t * .52, 3, 3, 3, seed + 7) - .5;
    const pl = Math.sin(u * PI * folds + phase + wob2 * 5.0 + wob * 1.8);
    const pl2 = Math.sin(u * PI * folds * .57 + 1.3 + wob * 3.4);
    const x0 = u * w / 2 * (1 + flare * t) + (wob2 * .5 + wob * .3) * .07 * t
      + amp * .3 * Math.sin(t * 3.1 + u * 2.2 + phase) * t;
    const y0 = -h * t - sag * (1 - u * u) * (1 - .35 * t) + hemWave * pl * Math.pow(t, 3);
    let z0 = amp * (.7 + .62 * wob) * Math.sign(pl) * Math.pow(Math.abs(pl), .7) * Math.pow(t, .5);
    z0 += amp * .55 * pl2 * t;
    z0 += amp * .28 * Math.sin(u * PI * folds * 2.3 + 1.7 + t * 5) * t * t;
    z0 += amp * .16 * Math.sin(t * 7.2 + u * 2.6 + phase) * t;
    z0 += (fbm(u * .5 + .5, t * .6, 3, 3, 3, seed) - .5) * billowAmp * t;
    return [x0, y0, z0];
  };
  for (let i = 0; i <= sy; i++) for (let j = 0; j <= sx; j++) {
    const u = -1 + 2 * j / sx, t = i / sy, p = at(u, t);
    pos.push(p[0], p[1], p[2]); uv.push((u + 1) / 2, 1 - t);
  }
  for (let i = 0; i < sy; i++) for (let j = 0; j < sx; j++) {
    const a = j + i * (sx + 1), b = j + 1 + i * (sx + 1), c = j + 1 + (i + 1) * (sx + 1), d = j + (i + 1) * (sx + 1);
    idx.push(a, b, d, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const hemPts = [];
  for (let j = 0; j <= sx; j++) { const p = at(-1 + 2 * j / sx, 1); hemPts.push(new V3(p[0], p[1] - .004, p[2])); }
  const hemGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hemPts), sx, .007, 5, false);
  return { geo, hemGeo, at };
}

function windCloth(mesh, amp = .025, speed = 1.6, bottomOnly = false) {
  const uni = { uTime: { value: 0 }, uWind: { value: amp } };
  mesh.material.onBeforeCompile = shader => {
    shader.uniforms.uTime = uni.uTime; shader.uniforms.uWind = uni.uWind;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float wgt = ${bottomOnly ? '1.0' : 'pow(1.0 - uv.y, 1.35)'};
      float ph = position.x * 1.7 + position.y * 0.9;
      transformed.z += uWind * wgt * (sin(uTime * ${speed.toFixed(2)} + ph) + 0.45 * sin(uTime * ${(speed * 1.7).toFixed(2)} + ph * 2.1));`);
  };
  mesh.material.needsUpdate = true;
  mesh.userData.wind = uni;
}

function clothMesh(w, h, mat, o = {}) {
  const C = clothSheet(w, h, o);
  const m = mat.clone(), mHem = mat.clone();
  const mesh = new THREE.Mesh(C.geo, m); mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  const hem = new THREE.Mesh(C.hemGeo, mHem); hem.castShadow = hem.receiveShadow = true; g.add(hem);
  if (o.wind !== false) { windCloth(mesh, o.windAmp ?? .024, o.windSpeed ?? 1.5); windCloth(hem, o.windAmp ?? .024, o.windSpeed ?? 1.5, true); }
  return { g, mesh, hem };
}
```

| 参数 | 含义 | 调法 |
|---|---|---|
| `folds` | 褶裥数 | 帷幕 10~14，旗帜 3~5 |
| `amp` | 褶皱深度 | 0.06~0.1（米）；太大会穿插 |
| `sag` | 上缘/幅面垂度 | 0.03~0.08 |
| `flare` | 下摆外扩 | 0.06~0.18（旗更大） |
| `billow` | 大尺度鼓包 | 0.025~0.035 |
| `windAmp/Speed` | 风动幅度/频率 | 帷幕 0.028/1.15，旗帜 0.045/2.0 |

**要点**：
- `uv.y=1` 在顶边，风动权重 `pow(1-uv.y,1.35)` 让顶部钉死、下摆摆动。
- 底边卷边用同一条 `TubeGeometry` 跟随 `at(u,1)`；风动时对卷边用 `bottomOnly=true`（权重恒 1），否则布与卷边会分离。
- **必须 clone 材质**：不同布幅共享一个材质时，`onBeforeCompile` 会互相覆盖。
- 风动只改顶点，不改法线；振幅控制在 0.05 内，否则高光会“不跟着动”。
- 幕布不要用纯 sin 等距褶：`wob/wob2` 相位扰动是不像卷帘门的关键。

---

## 9.4 流线绳索 `sagPath()` / `tubeGeo()` / `ribbonGeo()`

**用途**：悬链绳索、绳圈、扁织带、扎带。所有“线状柔性物”共用这三件套。

```js
function sagPath(a, b, o = {}) {
  const sag = o.sag ?? .35, seg = o.seg ?? 18, jit = o.jitter ?? 0, s = o.seed ?? 0;
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new V3(
      lerp(a.x, b.x, t) + Math.sin(t * 7 + s) * jit,
      lerp(a.y, b.y, t) - sag * 4 * t * (1 - t) + Math.sin(t * 21 + s) * jit * .5,
      lerp(a.z, b.z, t) + Math.cos(t * 5 + s) * jit));
  }
  return pts;
}
function tubeGeo(points, radius, tubular = 96, radial = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', .25);
  const g = new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 8);
  return g;
}
function ribbonGeo(points, normals, width, thick, tile = .2) {
  const pos = [], uv = [], idx = [], N = points.length;
  let dist = 0;
  for (let i = 0; i < N; i++) {
    const p = points[i], t = points[Math.min(N - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    const n = normals[i].clone().normalize(), b = new V3().crossVectors(n, t).normalize();
    const wb = b.clone().multiplyScalar(width / 2), th = n.clone().multiplyScalar(thick / 2);
    if (i > 0) dist += points[i].distanceTo(points[i - 1]);
    pos.push(p.x + wb.x + th.x, p.y + wb.y + th.y, p.z + wb.z + th.z);
    pos.push(p.x - wb.x + th.x, p.y - wb.y + th.y, p.z - wb.z + th.z);
    pos.push(p.x - wb.x - th.x, p.y - wb.y - th.y, p.z - wb.z - th.z);
    pos.push(p.x + wb.x - th.x, p.y + wb.y - th.y, p.z + wb.z - th.z);
    uv.push(0, dist / tile, 1, dist / tile, 1, dist / tile, 0, dist / tile);
  }
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  for (let i = 0; i < N - 1; i++) {
    const o = i * 4, q = o + 4;
    quad(o, o + 1, q + 1, q); quad(o + 2, o + 3, q + 3, q + 2);
    quad(o, q, q + 2, o + 2); quad(o + 1, q + 1, q + 3, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}
```

**示例（两根立柱之间的三条绳 + 一条扁织带）**：

```js
const a = new V3(-2.2, 2.38, 0), b = new V3(2.2, 2.38, 0);
for (let i = 0; i < 3; i++) {
  const pts = sagPath(a, b, { sag: .38 + i * .1, seg: 26, jitter: .005, seed: 71 + i });
  scene.add(new THREE.Mesh(tubeGeo(pts, .0125, 110, 6), M.rope));
}
const strapPts = sagPath(a, b, { sag: .58, seg: 26 });
scene.add(new THREE.Mesh(ribbonGeo(strapPts, strapPts.map(() => new V3(0, 0, 1)), .078, .008), M.webbing));
```

**要点**：悬链线 `y -= sag*4t(1-t)`，中点下垂 = `sag`；扁织带的 `normals` 是带的**法向**，宽度方向由 `n×t` 自动算出。

---

## 9.5 织物材质 `tarpPBR()` / `weavePBR()` / `ropePBR()`

**用途**：篷布、麻布、织带、绳索的程序化 PBR。全部零素材，走 L1 `pbr()` 一次生成 map+normal+ORM。

```js
function tarpPBR() {                       // 长垂褶 + 细皱纹 + 200 目防雨布 + 谷底积灰 + 折脊浮尘
  return pbr(512, (u, v, o) => {
    const wx = u + (fbm(u, v, 3, 2, 2, 1) - .5) * .12, wy = v + (fbm(u, v, 3, 2, 2, 2) - .5) * .12;
    const ridge = (x, y, px, py, s) => clamp(1 - Math.abs(vn(x * px, y * py, px, py, s) * 2 - 1) * 2.4, 0, 1);
    const f1 = sstep(0, 1, ridge(wx, wy, 2, 7, 3)), f2 = sstep(.2, 1, ridge(wx + 2, wy + 2, 5, 13, 4));
    const bill = fbm(wx, wy, 3, 2, 3, 5);
    const scrim = Math.max(sstep(.42, .5, Math.abs((u * 200) % 1 - .5)), sstep(.42, .5, Math.abs((v * 200) % 1 - .5)));
    const fine = fbm(u, v, 2, 240, 240, 6), mid = fbm(u, v, 4, 14, 14, 7);
    const broad = Math.pow(1 - Math.abs(vn(wx * 1.4, wy * 2.2, 97, 97, 30) * 2 - 1), 1.2);
    const patch = sstep(.52, .72, fbm(u, v, 4, 3, 3, 12));
    const h = .25 + bill * .35 + f1 * .22 + f2 * .07 + broad * .055 + scrim * .02 + (fine - .5) * .014;
    const dirt = sstep(.5, .85, fbm(u, v, 5, 4, 4, 8) + (.5 - f1) * .1);
    const ta = .9 * (.88 + (mid - .5) * .14) * (1 - scrim * .06) * (1 - patch * .09);
    let r = ta, g = ta * .985, b = ta * .955;
    const dm = dirt * .38; r = lerp(r, .32, dm); g = lerp(g, .28, dm); b = lerp(b, .22, dm);
    const dust = sstep(.68, .92, h) * .2;
    r = lerp(r, .62, dust); g = lerp(g, .60, dust); b = lerp(b, .54, dust);
    o.r = r; o.g = g; o.b = b; o.h = h;
    o.rough = clamp(.55 + (mid - .5) * .12 + dirt * .2, .22, 1); o.metal = 0;
  }, 2.0);
}
function weavePBR(N, cells, col, rough, slub) {   // 平纹：麻布 / 织带
  return pbr(N, (u, v, o) => {
    const p = u * cells, q = v * cells, ix = Math.floor(p), iy = Math.floor(q), fx = p - ix, fy = q - iy;
    const top = ((ix + iy) & 1) ? 1 : 0;
    const pw = Math.sin(fx * PI), pf = Math.sin(fy * PI);
    const h = top ? pw * (.6 + .4 * pf) : pf * (.6 + .4 * pw) * .85;
    const fz = fbm(u, v, 3, 150, 150, 1), big = fbm(u, v, 4, 2, 2, 2);
    const sl = fbm(u, v, 3, 90, 6, 3), thr = vn(ix * .37, iy * .37, 97, 97, 5);
    const sh = (.55 + .45 * h) * (.85 + .2 * (thr - .5) + .2 * (fz - .5) + .2 * (big - .5)) * (1 + (sl - .5) * slub);
    o.r = col[0] * sh; o.g = col[1] * sh; o.b = col[2] * sh;
    o.h = .2 + h * .42 + (fz - .5) * .13 + (sl - .5) * .12;
    o.rough = clamp(rough + (fz - .5) * .08, 0, 1); o.metal = 0;
  }, 1.2);
}
function ropePBR() {                        // 斜向麻花 + 纤维毛刺
  return pbr(256, (u, v, o) => {
    const a = (u + v * 3.5) * 4, prof = Math.sin((a % 1) * PI);
    const fib = fbm(u, v, 3, 60, 60, 1);
    const yarn = .5 + .5 * Math.sin((u - v * 3.5) * TAU * 4.5 + 2 * Math.sin(a * TAU));
    const h = Math.pow(clamp(prof, 0, 1), .7) * .8 + yarn * .1 + (fib - .5) * .15;
    const col = [.66, .60, .46], sh = (.6 + .4 * prof) * (.85 + .3 * (fib - .5)) * (.92 + .16 * yarn);
    const dirt = sstep(.4, .8, fbm(u, v, 4, 3, 3, 2)), dm = dirt * .5 * (1 - prof * .5);
    o.r = lerp(col[0] * sh, .25, dm); o.g = lerp(col[1] * sh, .22, dm); o.b = lerp(col[2] * sh, .18, dm);
    o.h = h; o.rough = clamp(.45 + .55 * prof + dirt * .2, 0, 1); o.metal = 0;
  }, 1.2);
}
function clothMat(t, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.orm, metalnessMap: t.orm, aoMap: t.orm,
    roughness: 1, metalness: 0, sheen: o.sheen ?? .8, sheenRoughness: o.sheenRough ?? .8,
    sheenColor: new THREE.Color(o.sheenColor ?? 0x8899aa), side: THREE.DoubleSide
  });
  m.aoMapIntensity = o.ao ?? .85;                 // 折叠谷 / 织纹凹处的烘焙 AO
  m.userData.tile = o.tile || 1.5;
  if (o.ns) m.normalScale.set(o.ns, o.ns);
  if (o.color !== undefined) m.color.set(o.color);
  return m;
}
const T = { tarp: tarpPBR(), burlap: weavePBR(256, 34, [.86, .85, .82], .94, .35), webbing: weavePBR(256, 48, [.92, .92, .92], .88, .18), rope: ropePBR() };
const M = {
  tarpOlive: clothMat(T.tarp, { tile: 1.5, ns: 2.2, color: 0x6a7358, sheen: .6, sheenColor: 0xa8b69a }),
  tarpSand:  clothMat(T.tarp, { tile: 1.5, ns: 2.2, color: 0xa8987c, sheen: .6, sheenColor: 0xcec0a2 }),
  tarpBlue:  clothMat(T.tarp, { tile: 1.5, ns: 2.4, color: 0x7b93a2, sheen: .7, sheenColor: 0xb8ceda }),
  burlap:    clothMat(T.burlap, { tile: .45, ns: .8, color: 0xb5a483, sheen: .25, sheenRough: .95 }),
  burlapB:   clothMat(T.burlap, { tile: .45, ns: .8, color: 0x8f7c5b, sheen: .25, sheenRough: .95 }),
  webbing:   stdMat(T.webbing, { tile: .22, ns: 1.6, side: THREE.DoubleSide }),
  rope:      stdMat(T.rope, { tile: .12, ns: 1.3 }),
};
M.webbing.color.set(0xbd5a26);
```

| 材质 | 关键参数 | 经验值 |
|---|---|---|
| 篷布 | `ns` 法线强度 / `sheen` | ns 2.2~2.6，sheen .6~.7（别开 1.2，会像塑料） |
| 篷布色 | `color` | 军橄榄 `0x6a7358` / 沙 `0xa8987c` / 蓝灰 `0x7b93a2` |
| 麻布 | `tile .45`，`ns .8` | 织格别太深，否则像竹编 |
| 织带 | `tile .22`，颜色 `0xbd5a26` | 橙色扎带；法线 1.6 |
| 绳索 | `tile .12` | 配合 TubeGeometry 的 UV 放大 8 倍 |

**要点**：
- **粗糙度别低于 0.45**：篷布是哑光；高光过强会像油布/黏土。靠 `sheen` 出织物边缘光，而不是降低粗糙度。
- 同一张 `T.tarp` 通过 `material.color` 换色，**不要为每个颜色重生成 512² 贴图**。
- `pbr()` 的 `ns=2.0` 是贴图层法线强度；`material.normalScale` 是世界层二次放大，两者不要同时拉满。

---

## 9.6 组合模板 `tarpCargo()`

**用途**：参考图里的篷布货垛：两层木托盘 + 三个不等高货块 + 披盖 + 两条橙扎带（带扣）+ 一圈绳。**依赖** 9.1/9.4/9.5。

```js
function pallet(K, w, d, y = 0) {
  K.at(0, y, 0);
  for (const z of [-d / 2 + .07, 0, d / 2 - .07]) K.box(w, .022, .11, 0, .132, z, M.wood);
  for (const x of [-w / 2 + .1, 0, w / 2 - .1]) for (const z of [-d / 2 + .06, 0, d / 2 - .06]) K.box(.14, .09, .14, x, .06, z, M.woodDark);
  for (let i = 0; i < 5; i++) K.box(.15, .022, d, -w / 2 + .16 + i * (w - .32) / 4, .11, 0, M.wood);
  K.base = null;
}
function tarpCargo(x, z, ry = 0, seed = 24) {
  const g = new THREE.Group(), K = new Kit();
  const PW = 2.2, PD = 1.3;
  pallet(K, PW, PD, 0); pallet(K, PW, PD, .145);
  const blocks = [
    { x0: -1.04, x1: -.14, z0: -.56, z1: .56, h: 1.34 },
    { x0: .08,  x1: 1.04, z0: -.56, z1: .28, h: 1.16 },
    { x0: .60,  x1: 1.04, z0: .32,  z1: .60, h: .82 },
  ];
  for (const b of blocks) K.box(b.x1 - b.x0 - .02, b.h - .16, b.z1 - b.z0 - .02,
    (b.x0 + b.x1) / 2, .16 + (b.h - .16) / 2, (b.z0 + b.z1) / 2, M.woodDark, { r: .02 });
  const D = drapeOver({
    blocks, margin: .12, base: .16, flare: .12, skirtFold: .1, billow: .03, foldAmp: .034,
    warp: .035, cornerDrop: .09, tiltX: .05, tiltZ: -.025,
    tiesX: [-.62, .53], tieDepth: .026, tieW: .06,
    segX: 44, segZ: 28, skirt: 18, seed
  });
  g.add(new THREE.Mesh(D.geo, M.tarpOlive));
  for (const xs of [-.62, .53]) {
    const e0 = D.edgeAt(xs, D.bounds.z0), e1 = D.edgeAt(xs, D.bounds.z1);
    const pts = [], nrm = [];
    for (let k = 9; k >= 0; k--) { const [px, py, pz] = D.skirtAt(e0, k / 9); const n = new V3(e0.nx, .22, e0.nz).normalize(); pts.push(new V3(px, py, pz).addScaledVector(n, .008)); nrm.push(n); }
    for (let i = 1; i <= 26; i++) {
      const bz = lerp(D.bounds.z0, D.bounds.z1, i / 26), xw = D.warpX(xs, bz), zw = D.warpZ(xs, bz);
      const y2 = D.hAt(xw, zw), n = D.nAt(xw, zw); pts.push(new V3(xw, y2, zw).addScaledVector(n, .016)); nrm.push(n);
    }
    for (let k = 1; k <= 9; k++) { const [px, py, pz] = D.skirtAt(e1, k / 9); const n = new V3(e1.nx, .22, e1.nz).normalize(); pts.push(new V3(px, py, pz).addScaledVector(n, .008)); nrm.push(n); }
    K.put(ribbonGeo(pts, nrm, .055, .008, .22), M.webbing, null, 'keep');
    for (const zz of [.16, .46]) {
      const qz = D.bounds.z0 + (D.bounds.z1 - D.bounds.z0) * zz, qy = D.hAt(xs, qz) + .013;
      K.box(.082, .014, .1, xs, qy, qz, M.steel, { r: .005 });
    }
  }
  const ring = D.edges.map(E => { const [px, py, pz] = D.skirtAt(E, .8); return new V3(px + E.nx * .012, py, pz + E.nz * .012); });
  g.add(new THREE.Mesh(tubeGeo(ring, .012, 280, 6, true), M.rope));
  g.add(K.build());
  g.position.set(x, 0, z); g.rotation.y = ry;
  solid(x - 1.35, 0, z - .95, x + 1.35, 1.45, z + .95);
  return g;
}
```

**配套木托盘材质**：现场写木材 recipe（不依赖固定配方族）：

```js
T.wood = pbr(256, (u, v, o) => {              // 年轮 + 细纤维
  const grain = fbm(u * .25, v * 6, 3, 6, 24, 901);
  const ring = .5 + .5 * Math.sin((u * 18 + grain * 2.2) * PI);
  const sh = .68 + ring * .18 + (grain - .5) * .12;
  o.r = .34 * sh; o.g = .26 * sh; o.b = .17 * sh;
  o.h = .5 + (grain - .5) * .12 + ring * .04;
  o.rough = .78 + (grain - .5) * .1; o.metal = 0;
}, 1);
M.wood = stdMat(T.wood, { tile: 1.2 });       // 换色改用中性配方 + material.color
```

**要点**：
- 货块高度差 ≥ 0.15m，披盖才会出现山脊/谷；三块不要排成一条直线。
- 扎带路径从裙边底 → 顶面 → 另一侧裙边底，每点用法线抬 0.014~0.016，才不穿布。
- 绳圈取 `skirtAt(E, .8)` 的整圈，沿法线再抬 0.012；`TubeGeometry(closed=true)`。
- 参考图的两大包是**两块独立货垛**；表演两个 `tarpCargo` 并排即可，别用一块布硬盖两垛。

---

## 9.7 组合模板 `sandbagWall()`

**用途**：错缝沙袋墙 + 散落沙包 + 软垫。**依赖** 9.2/9.5。

```js
function sandbagWall(x, z, ry = 0, seed = 88) {
  const g = new THREE.Group(), K = new Kit(), r = mulberry(4000 + seed);
  const sw = .64, sh = .24, sd = .42, rows = 5;
  for (let c = 0; c < rows; c++) {
    const n = c % 2 ? 5 : 4, off = c % 2 ? -.33 : 0;
    for (let i = 0; i < n; i++) {
      const w = sw * (.9 + r() * .2), h = sh * (.86 + r() * .3), d = sd * (.92 + r() * .14);
      const px = off + (i - (n - 1) / 2) * sw + (r() - .5) * .07, py = c * sh + h / 2, pz = (r() - .5) * .1;
      K.put(softBagGeo(w, h, d, seed + c * 17 + i, { lump: 1.2, pinch: .18 + r() * .12 }),
        (c + i) % 3 === 0 ? M.burlapB : M.burlap,
        TRS(px, py, pz, (r() - .5) * .16, (r() - .5) * .5, (r() - .5) * .16));
    }
  }
  for (let i = 0; i < 5; i++) {
    const px = -1.7 + i * .82 + (r() - .5) * .24, pz = .55 + (r() - .5) * .5;
    K.put(softBagGeo(sw * .95, sh, sd, seed + 90 + i, { lump: 1.2 }), i % 2 ? M.burlap : M.burlapB,
      TRS(px, sh / 2 + .005, pz, (r() - .5) * .12, r() * 6, (r() - .5) * .12));
  }
  g.add(K.build());
  g.position.set(x, 0, z); g.rotation.y = ry;
  solid(x - 1.8, 0, z - .8, x + 1.8, 1.3, z + .8);
  return g;
}
```

**要点**：错缝 = 奇数层 5 袋/偶数层 4 袋；每袋尺寸 ±10%、三轴旋转 ±0.16/±0.5 rad；**不要加黑色端部方块**，那会变成货架。

---

## 装配心法（L9）

1. **先问“这是场还是实体”**：布 → 高度场/参数曲面；袋 → 高分段网格形变；绳 → 曲线。不要用 box 拼。
2. **褶皱分两级**：几何层做大褶（0.05~0.15m），材质法线做细褶（毫米~厘米）；只有一层会像塑料。
3. **布边要有厚度**：裙边卷边 / 底边 Tube / 双面材质；单层零厚度平面在侧光下立刻穿帮。
4. **软体要有“坐重”**：压扁底、减轻上部、加鼓包；完全对称的椭球会像气球。
5. **光照决定布料读感**：一盏低角度轮廓光 + 非金属 sheen，比提高粗糙度更能出“布”。
6. **性能**：布 3k~5k 顶点、袋 1k 顶点以内；同材质合批；风动用 onBeforeCompile，不逐帧 computeVertexNormals。

验证：并入单体 studio 验收（12.4）；本页只保留技法代码，不做独立验证页。