/**
 * SurfaceSpec：基座固定、配方自由。
 * - 基座（pbr / 噪声 / mask / stdMat / surfaceMaterial）固定；
 * - 词表只是参考，不是白名单；未登记基材/涂层回退到通用规则；
 * - 表层结构用 spec.recipe 或 compileSurfaceMaps(..., { recipe }) 现场写，不建注册表。
 * 纯 JS 编译；页面用 mapsToTextures(maps, THREE) 转成 Three 贴图。
 */

export const SURFACE_QUESTIONS = [
  '基材是什么？金属 / 聚合物 / 陶瓷 / 玻璃 / 木 / 石 / 织物 / 皮革 / 有机 / 复合材料 / 液体（不在词表里就自定名称）',
  '有没有涂层？无 / 漆 / 清漆 / 氧化 / 电镀 / 油 / 蜡 / 污垢 / 雪 / 水（可自定义）',
  '怎么成型？铸造 / 轧制 / 锻造 / 机加工 / 拉丝 / 抛光 / 喷砂 / 模压 / 编织 / 打磨 / 生长（可自定义）',
  '怎么老化？掉漆 / 划痕 / 凹痕 / 锈 / 烟熏 / 积尘 / 边缘磨亮 / 褪色 / 生物附着（可自定义）',
  '光学怎么走？metalness / roughness / transmission / emission / sheen / anisotropy',
  '纹理尺度？macro 米级 / micro 毫米级 / tile 米',
  '表层结构用什么写？现成参考配方，还是现场写 recipe(u,v,o,ctx) —— 不建注册表，用完即弃'
];

export const SUBSTRATES = {
  metal:     { color: [.55, .57, .60], metal: .95, rough: [.25, .48] },
  polymer:   { color: [.16, .17, .19], metal: 0,   rough: [.35, .62] },
  ceramic:   { color: [.78, .76, .72], metal: 0,   rough: [.18, .42] },
  glass:     { color: [.72, .82, .86], metal: 0,   rough: [.03, .12], transmission: .9 },
  wood:      { color: [.34, .23, .14], metal: 0,   rough: [.50, .78] },
  stone:     { color: [.42, .42, .40], metal: 0,   rough: [.70, .95] },
  fabric:    { color: [.20, .19, .18], metal: 0,   rough: [.72, .95], sheen: .4 },
  leather:   { color: [.18, .12, .09], metal: 0,   rough: [.50, .80], sheen: .3 },
  organic:   { color: [.38, .26, .22], metal: 0,   rough: [.50, .85], sheen: .2 },
  composite: { color: [.20, .28, .30], metal: .1,  rough: [.30, .55] },
  liquid:    { color: [.08, .18, .22], metal: 0,   rough: [.02, .10], transmission: .85 }
};

export const COATINGS = {
  none:      {},
  paint:     { color: true, metal: 0, rough: [.35, .55], chip: true },
  clearcoat: { clearcoat: true, rough: [.08, .25] },
  oxide:     { color: [.35, .22, .14], metal: .2, rough: [.55, .85], rust: true },
  plating:   { metal: 1, rough: [.12, .30], color: [.60, .62, .65] },
  oil:       { rough: [.30, .50], darken: .72, sheen: .2 },
  wax:       { rough: [.30, .50], darken: .84, sheen: .1 },
  grime:     { rough: [.60, .85], dirt: .5 },
  snow:      { color: [.85, .90, .95], metal: 0, rough: [.70, .92], dirt: .2 },
  water:     { rough: [.02, .12], metal: 0, transmission: .6, darken: .78 }
};

export const PROCESSES = ['cast', 'rolled', 'forged', 'machined', 'turned', 'brushed', 'polished', 'sandblasted', 'molded', 'woven', 'knapped', 'grown', 'engraved'];
export const WEAR_TYPES = ['chips', 'scratches', 'dents', 'rust', 'soot', 'dust', 'edge_polish', 'uv_fade', 'bio'];

/* ── 基座固定、配方自由 ──
   以下词表只是参考起点，不是白名单：
   - 未登记的 substrate / coating / process / wear 一律按通用规则回退，不再拒绝；
   - 真正的表面结构用 spec.recipe 或 compileSurfaceMaps(spec, size, { recipe }) 现场写；
   - recipe 是纯函数，不进入任何注册表；复用价值出现后再沉淀为库内参考配方。 */
export const SURFACE_BASE_NOTE =
  '基座固定：pbr / stdMat / 噪声 / mask / Kit。配方自由：每个作品按表面语义现场写 recipe，不建注册表、不选套件。参考词表不是白名单。';
export const RECIPE_NOTE =
  'recipe(u, v, o, ctx) 直接改写 o.r/g/b/h/rough/metal/ao；ctx 带 seed / scale / color / substrate / coating。既可直接传给 pbr，也可挂在 SurfaceSpec.recipe 上。';

const GENERIC_SUBSTRATE = { color: [.5, .5, .5], metal: 0, rough: [.5, .78] };

const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const asArray = v => Array.isArray(v) ? v : [v];

function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi, s), hash2(xi + 1, yi, s), u), lerp(hash2(xi, yi + 1, s), hash2(xi + 1, yi + 1, s), u), v);
}
function fbm(x, y, oct, s) {
  let a = .5, f = 1, n = 0, w = 0;
  for (let i = 0; i < oct; i++) { n += a * vnoise(x * f, y * f, s + i * 17); w += a; a *= .5; f *= 2; }
  return n / w;
}

function colorOf(c) {
  if (Array.isArray(c) && c.length >= 3) return [c[0], c[1], c[2]];
  return [.5, .5, .5];
}

function normalizeOptical(base, coat, spec) {
  const o = spec.optical || {};
  const rr = o.roughness ?? coat.rough ?? base.rough ?? [.5, .5];
  const [r0, r1] = asArray(rr).length > 1 ? [Math.min(...asArray(rr)), Math.max(...asArray(rr))] : [rr, rr];
  return {
    metalness: clamp01(o.metalness ?? coat.metal ?? base.metal ?? 0),
    roughness: [clamp01(r0), clamp01(r1)],
    transmission: clamp01(o.transmission ?? coat.transmission ?? base.transmission ?? 0),
    sheen: clamp01(o.sheen ?? coat.sheen ?? base.sheen ?? 0),
    clearcoat: clamp01(o.clearcoat ?? (coat.clearcoat ? .6 : 0)),
    anisotropy: clamp01(o.anisotropy ?? 0),
    emission: o.emission || null
  };
}

export function normalizeSurfaceSpec(spec = {}) {
  const substrate = spec.substrate || 'metal';
  const substrateKnown = !!SUBSTRATES[substrate];
  const base = SUBSTRATES[substrate] || GENERIC_SUBSTRATE;
  const coatName = typeof spec.coating === 'string' ? spec.coating : (spec.coating?.type || 'none');
  const coatingKnown = !!COATINGS[coatName];
  const coat = COATINGS[coatName] || {};
  const color = colorOf(spec.color || (coat.color === true ? spec.color : coat.color) || base.color);
  const process = asArray(spec.process || []).filter(Boolean);
  const wear = asArray(spec.wear || []).filter(Boolean).map(w => typeof w === 'string' ? { type: w, amount: .5 } : { amount: .5, ...w });
  return {
    substrate, coating: coatName, process, wear,
    substrateKnown, coatingKnown,
    recipe: typeof spec.recipe === 'function' ? spec.recipe : null,
    color,
    optical: normalizeOptical(base, coat, spec),
    scale: { macro: spec.scale?.macro ?? 1, micro: spec.scale?.micro ?? .004, tile: spec.scale?.tile ?? 1 },
    seed: spec.seed ?? 1,
    clearcoat: !!coat.clearcoat
  };
}

export function validateSurfaceSpec(spec = {}) {
  const s = normalizeSurfaceSpec(spec), errors = [], warnings = [];
  if (!s.substrateKnown) warnings.push(`基材 "${s.substrate}" 不在参考词表中：按通用基材回退；可用 color / optical 覆盖，或用 recipe 自定义表面`);
  if (!s.coatingKnown) warnings.push(`涂层 "${s.coating}" 不在参考词表中：按无涂层回退；可用 coating:"none" 或改用 recipe`);
  if (spec.recipe !== undefined && typeof spec.recipe !== 'function') errors.push('recipe 必须是函数 (u, v, o, ctx)');
  for (const p of s.process) if (!PROCESSES.includes(p)) warnings.push(`未知成型 "${p}"，将按默认处理（可用 recipe 自定义）`);
  for (const w of s.wear) if (!WEAR_TYPES.includes(w.type)) warnings.push(`未知老化 "${w.type}"，将按默认处理（可用 recipe 自定义）`);
  if (s.optical.metalness > .8 && s.optical.transmission > .4) warnings.push('高金属度 + 高透射不常见（金属通常不透光）');
  if (s.optical.clearcoat > 0 && s.substrate === 'metal' && s.coating === 'none') warnings.push('裸金属加 clearcoat 容易像塑料');
  if (s.scale.micro <= 0) errors.push('scale.micro 必须大于 0');
  if (s.scale.macro <= 0) errors.push('scale.macro 必须大于 0');
  return { ok: errors.length === 0, errors, warnings, normalized: s };
}

function pattern(name, u, v, f, mf, seed) {
  switch (name) {
    case 'cast': return { h: fbm(u * f * 2, v * f * 2, 4, seed) * .5 + vnoise(u * mf * .4, v * mf * .4, seed) * .12, rough: .08 };
    case 'rolled': return { h: vnoise(u * 2, v * mf, seed) * .16, rough: .05 };
    case 'forged': return { h: fbm(u * f * 3, v * f * 3, 4, seed) * .5 + vnoise(u * mf * .7, v * mf * .7, seed) * .2, rough: .12 };
    case 'machined': return { h: Math.sin((u + v) * f * 120 + fbm(u * f, v * f, 2, seed) * 3) * .035, rough: .06 };
    case 'turned': return { h: Math.sin(Math.hypot(u - .5, v - .5) * f * 220 + fbm(u * f, v * f, 2, seed) * 3) * .025, rough: .05 };
    case 'brushed': return { h: vnoise(u * 2, v * mf * 1.5, seed) * .12, rough: .1 };
    case 'polished': return { h: 0, rough: -.12 };
    case 'sandblasted': return { h: vnoise(u * mf, v * mf, seed) * .09, rough: .12 };
    case 'molded': return { h: fbm(u * f * 2, v * f * 2, 3, seed) * .12, rough: .03 };
    case 'woven': return { h: (Math.sin(u * mf * 2) + Math.sin(v * mf * 2)) * .025, rough: .07 };
    case 'knapped': return { h: Math.floor(fbm(u * f * 4, v * f * 4, 2, seed) * 6) / 6 * .16, rough: .1 };
    case 'grown': return { h: fbm(u * f * 3, v * f * 3, 5, seed) * .3, rough: .08 };
    case 'engraved': return { h: -sstep(.72, .92, vnoise(u * mf * 1.2, v * mf * 1.2, seed)) * .03, rough: .04 };
    default: return { h: 0, rough: 0 };
  }
}

function wearEffect(type, u, v, f, mf, seed, amount) {
  const a = amount ?? .5;
  switch (type) {
    case 'chips': return { mask: sstep(.72, .9, vnoise(u * mf * .5, v * mf * .5, seed)) * a, color: [.12, .12, .12], rough: .16, metal: -.2, h: -.02 };
    case 'scratches': return { mask: sstep(.8, .96, vnoise(u * mf * .08, v * mf * 2.5, seed)) * a, color: [.62, .62, .62], rough: .14, h: -.012 };
    case 'dents': return { mask: sstep(.55, .85, fbm(u * f * 2, v * f * 2, 3, seed)) * a, color: null, rough: .06, h: -.06 };
    case 'rust': return { mask: sstep(.58, .86, fbm(u * f * 3, v * f * 3, 4, seed)) * a, color: [.42, .18, .08], rough: .22, metal: -.65, h: -.015 };
    case 'soot': return { mask: sstep(.55, .85, fbm(u * f * 2.5, v * f * 2.5, 3, seed + 9)) * a, color: [.05, .05, .05], rough: .14, h: 0 };
    case 'dust': return { mask: sstep(.5, .8, fbm(u * f * 2, v * f * 2, 3, seed + 11)) * a, color: [.55, .52, .46], rough: .12, h: .01 };
    case 'edge_polish': return { mask: sstep(.75, .95, vnoise(u * mf * .3, v * mf * .3, seed + 13)) * a, color: [.75, .75, .72], rough: -.18, h: 0 };
    case 'uv_fade': return { mask: sstep(.4, .8, fbm(u * f, v * f, 2, seed + 15)) * a, color: [.62, .60, .55], rough: .04, h: 0 };
    case 'bio': return { mask: sstep(.5, .85, fbm(u * f * 3, v * f * 3, 4, seed + 17)) * a, color: [.16, .25, .12], rough: .12, h: .01 };
    default: return { mask: 0, color: null, rough: 0, h: 0 };
  }
}

/**
 * 编译 SurfaceSpec → PBR 通道。size 默认 256；返回 RGBA 数组。
 * opts.recipe 优先于 spec.recipe：recipe(u, v, o, ctx) 可整体改写表面结构。
 */
export function compileSurfaceMaps(spec = {}, size = 256, opts = {}) {
  const s = normalizeSurfaceSpec(spec);
  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const normal = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const metal = new Uint8ClampedArray(n * 4);
  const ao = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  const f = 1 / Math.max(.05, s.scale.macro);
  const mf = Math.min(64, 1 / Math.max(.002, s.scale.micro));
  const seed = s.seed | 0;
  const [rr0, rr1] = s.optical.roughness;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = x / size, v = y / size;
      let h = 0, r = rr0, m = s.optical.metalness, a = 1;
      let col = [...s.color];
      const shade = .9 + .2 * fbm(u * f * 4, v * f * 4, 3, seed + 3);
      col = col.map(c => c * shade);

      for (const p of s.process) {
        const e = pattern(p, u, v, f, mf, seed + p.length * 11);
        h += e.h; r += e.rough;
      }
      for (const w of s.wear) {
        const e = wearEffect(w.type, u, v, f, mf, seed + 31, w.amount);
        if (e.color) col = col.map((c, k) => lerp(c, e.color[k], e.mask));
        r += e.rough * (e.mask || 0);
        m += (e.metal || 0) * (e.mask || 0);
        h += e.h * (e.mask || 0);
        a -= Math.abs(e.h || 0) * .3;
      }

      if (s.coating === 'paint') {
        const chip = sstep(.74, .90, vnoise(u * mf * .5, v * mf * .5, seed + 41));
        if (chip > 0) { col = col.map((c, k) => lerp(c, [.10, .10, .10][k], chip * .7)); r += chip * .18; h -= chip * .012; m = lerp(m, SUBSTRATES[s.substrate]?.metal ?? 0, chip * .5); }
      } else if (s.coating === 'oxide') {
        const rust = sstep(.5, .85, fbm(u * f * 3, v * f * 3, 3, seed + 43));
        if (rust > 0) { col = col.map((c, k) => lerp(c, [.40, .18, .08][k], rust * .75)); r += rust * .2; m *= (1 - rust * .7); }
      } else if (s.coating === 'grime') {
        const g = sstep(.45, .8, fbm(u * f * 2, v * f * 2, 3, seed + 45));
        col = col.map(c => lerp(c, c * .55, g * .6)); r += g * .12;
      } else if (s.coating === 'snow') {
        const sn = sstep(.4, .75, fbm(u * f * 2, v * f * 2, 3, seed + 47));
        col = col.map((c, k) => lerp(c, [.86, .90, .95][k], sn * .8)); r += sn * .15; m *= (1 - sn);
      } else if (s.coating === 'water') {
        const wa = sstep(.5, .8, fbm(u * f * 2, v * f * 2, 3, seed + 49));
        col = col.map(c => lerp(c, c * .8, wa)); r -= wa * .12; m *= (1 - wa * .5);
      } else if (s.coating === 'oil' || s.coating === 'wax') {
        const dk = COATINGS[s.coating].darken ?? .8;
        col = col.map(c => c * dk); r -= .06;
      }

      // 自定义配方：在参考层之上整体改写，可绕过任何预置词表
      const recipe = opts.recipe || s.recipe;
      if (recipe) {
        const o = { r: col[0], g: col[1], b: col[2], h, rough: r, metal: m, ao: a };
        recipe(u, v, o, { seed, scale: s.scale, color: s.color, substrate: s.substrate, coating: s.coating, process: s.process, wear: s.wear });
        col = [o.r, o.g, o.b]; h = o.h; r = o.rough; m = o.metal; a = o.ao;
      }

      r = clamp01(r) * 255;
      m = clamp01(m) * 255;
      a = clamp01(a);
      height[i] = h;
      const k = i * 4;
      albedo[k] = col[0] * 255; albedo[k + 1] = col[1] * 255; albedo[k + 2] = col[2] * 255; albedo[k + 3] = 255;
      rough[k] = rough[k + 1] = rough[k + 2] = r; rough[k + 3] = 255;
      metal[k] = metal[k + 1] = metal[k + 2] = m; metal[k + 3] = 255;
      ao[k] = ao[k + 1] = ao[k + 2] = a * 255; ao[k + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = height[y * size + (x - 1 + size) % size], rr = height[y * size + (x + 1) % size];
      const d = height[((y - 1 + size) % size) * size + x], uu = height[((y + 1) % size) * size + x];
      let nx = (l - rr) * 3.2, ny = (d - uu) * 3.2, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
      const k = i * 4;
      normal[k] = (nx * .5 + .5) * 255; normal[k + 1] = (ny * .5 + .5) * 255; normal[k + 2] = (nz * .5 + .5) * 255; normal[k + 3] = 255;
    }
  }

  return { width: size, height: size, albedo, normal, rough, metal, ao };
}

/** 把 maps 转成 Three 贴图；需要传入 THREE 以保持模块无依赖。 */
export function mapsToTextures(maps, THREE) {
  const make = (arr, colorSpace) => {
    const t = new THREE.DataTexture(new Uint8Array(arr), maps.width, maps.height, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    if (colorSpace) t.colorSpace = colorSpace;
    t.needsUpdate = true;
    return t;
  };
  return {
    map: make(maps.albedo, THREE.SRGBColorSpace),
    normalMap: make(maps.normal),
    roughnessMap: make(maps.rough),
    metalnessMap: make(maps.metal),
    aoMap: make(maps.ao)
  };
}

/**
 * mapsToTextures 结果 → MeshPhysicalMaterial。
 * 配方只负责通道；sheen / clearcoat / transmission / emission 由 SurfaceSpec.optical 统一收口，
 * 避免每个页面重复写材质包装，也避免把材质语义写死在某个“族”里。
 */
export function surfaceMaterial(spec, textures, THREE, opts = {}) {
  const s = normalizeSurfaceSpec(spec);
  const orm = textures.orm;
  const m = new THREE.MeshPhysicalMaterial({
    map: textures.map,
    normalMap: textures.normalMap,
    roughnessMap: textures.roughnessMap || orm,
    metalnessMap: textures.metalnessMap || orm,
    aoMap: textures.aoMap || orm,
    roughness: 1, metalness: 1,
    envMapIntensity: opts.env ?? (s.optical.metalness > .6 ? 2.2 : 1.2),
    sheen: s.optical.sheen,
    sheenRoughness: opts.sheenRoughness ?? .7,
    sheenColor: new THREE.Color().setRGB(...s.color),
    clearcoat: s.optical.clearcoat,
    clearcoatRoughness: opts.clearcoatRoughness ?? .12
  });
  m.aoMapIntensity = opts.ao ?? .9;
  m.normalScale.set(opts.ns ?? 1, opts.ns ?? 1);
  if (opts.side !== undefined) m.side = opts.side;
  if (s.optical.anisotropy > 0) m.anisotropy = s.optical.anisotropy;
  if (s.optical.transmission > 0) {
    m.transmission = s.optical.transmission;
    m.thickness = opts.thickness ?? .5;
    m.ior = opts.ior ?? 1.45;
    m.transparent = true;
  }
  if (s.optical.emission) {
    m.emissive = new THREE.Color().setRGB(...s.optical.emission);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  m.userData = { substrate: s.substrate, coating: s.coating, seed: s.seed, tile: opts.tile ?? s.scale.tile, recipe: !!s.recipe };
  return m;
}

export function surfaceSummary(spec = {}) {
  const s = normalizeSurfaceSpec(spec);
  return `${s.substrate} + ${s.coating} + [${s.process.join(', ') || '无成型'}] · rough ${s.optical.roughness[0].toFixed(2)}–${s.optical.roughness[1].toFixed(2)} · metal ${s.optical.metalness.toFixed(2)}`;
}
