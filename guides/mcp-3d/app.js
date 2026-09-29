// MCP в 3D — движок книги: 3D-сцена (three.js) + страницы-главы.
// Контент глав живёт в index.html (article.page); сцена читает из разметки:
//   data-show  — какие объекты сцены видны в главе (id или @группа)
//   data-cam   — позиция камеры и точка взгляда "px,py,pz,tx,ty,tz"
//   ol.steps > li[data-from|data-to|data-path|data-at|data-kind|data-label|data-do]
//              — анимированные шаги; <pre class="payload"> внутри шага — JSON-сообщение
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const COL = {
  host: 0x3b82f6, client: 0x06b6d4, server: 0x8b5cf6, llm: 0xd946ef, user: 0x94a3b8,
  ext: 0xf59e0b, tools: 0xf97316, resources: 0x10b981, prompts: 0xec4899,
  auth: 0xeab308, threat: 0xef4444, ok: 0x10b981, zone: 0x64748b, transport: 0x64748b,
};
const KIND = {
  req: 0x60a5fa, res: 0x34d399, note: 0xa3a3a3, err: 0xf87171,
  user: 0xe2e8f0, think: 0xe879f9, task: 0xfacc15,
};
const KIND_NAME = {
  req: 'запрос', res: 'ответ', note: 'уведомление', err: 'ошибка',
  user: 'человек', think: 'модель', task: 'задача',
};
const hex = c => '#' + new THREE.Color(c).getHexString();

/* ─────────────────────────── 3D: базовая сцена ─────────────────────────── */

const stage = $('#stage');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) renderer = null;
} catch (e) { renderer = null; }
const HAS3D = !!renderer;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 500);
camera.position.set(0, 14, 26);
let controls = null, labelRenderer = null;

if (HAS3D) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  stage.appendChild(labelRenderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotateSpeed = 0.6;
  controls.addEventListener('start', () => { camTween = null; userOrbit = true; });
} else {
  stage.classList.add('no-webgl');
}

scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(8, 18, 12);
scene.add(sun);

const world = new THREE.Group();
scene.add(world);
let grid = null;
let glowTex = null;

function applyTheme() {
  const cs = getComputedStyle(document.documentElement);
  const bg = new THREE.Color(cs.getPropertyValue('--scene-bg').trim() || '#111');
  const g1 = new THREE.Color(cs.getPropertyValue('--scene-grid').trim() || '#333');
  const g2 = new THREE.Color(cs.getPropertyValue('--scene-grid-2').trim() || '#222');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 38, 95);
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  grid = new THREE.GridHelper(120, 60, g1, g2);
  grid.material.transparent = true;
  grid.material.opacity = 0.7;
  grid.position.y = -0.01;
  scene.add(grid);
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
glowTex = makeGlowTexture();

/* ─────────────────────────── 3D: примитивы ─────────────────────────── */

function M(color, opacity = 0.2, emissive = 0.25, extra = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: emissive, transparent: true, opacity,
    roughness: 0.45, metalness: 0.05, depthWrite: opacity > 0.55, ...extra,
  });
  m.userData.base = opacity;
  return m;
}
function Lm(color, opacity = 0.9) {
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  m.userData.base = opacity;
  return m;
}
function shape(geo, color, { fill = 0.18, edge = 0.9, emissive = 0.25, threshold = 20 } = {}) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, M(color, fill, emissive, { side: THREE.DoubleSide })));
  if (edge > 0) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, threshold), Lm(color, edge)));
  return g;
}
const box = (w, h, d, c, o) => shape(new THREE.BoxGeometry(w, h, d), c, o);
const place = (o, x, y, z) => { o.position.set(x, y, z); return o; };

function tower(color, units = 3, w = 1.5) {
  const g = new THREE.Group();
  g.userData.leds = [];
  for (let i = 0; i < units; i++) {
    const u = box(w, 0.72, w, color, { fill: 0.3 });
    u.position.y = 0.4 + i * 0.8;
    g.add(u);
    for (let k = 0; k < 3; k++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshBasicMaterial({ color: k === 2 ? 0x34d399 : color, transparent: true }),
      );
      led.userData.base = 1;
      led.position.set(-w / 2 + 0.25 + k * 0.18, 0.4 + i * 0.8, w / 2 + 0.01);
      led.userData.phase = Math.random() * 6;
      g.add(led);
      g.userData.leds.push(led);
    }
  }
  return g;
}
function hostShell(w, h, d) {
  const g = box(w, h, d, COL.host, { fill: 0.06, edge: 0.8 });
  const bar = box(w, 0.22, Math.min(0.6, d * 0.12), COL.host, { fill: 0.55, edge: 0 });
  bar.position.set(0, h / 2 + 0.11, -d / 2 + Math.min(0.3, d * 0.06));
  g.add(bar);
  return g;
}
function brain(r = 0.9) {
  const g = shape(new THREE.IcosahedronGeometry(r, 1), COL.llm, { fill: 0.22, edge: 0.85, threshold: 1 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.38, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xf5d0fe, transparent: true, opacity: 0.95 }));
  core.material.userData.base = 0.95;
  g.add(core);
  g.userData.spin = 0.35;
  return g;
}
function person(color = COL.user) {
  const g = new THREE.Group();
  const body = shape(new THREE.CapsuleGeometry(0.36, 0.7, 4, 14), color, { fill: 0.55, edge: 0 });
  body.position.y = 0.72;
  const head = shape(new THREE.SphereGeometry(0.3, 18, 14), color, { fill: 0.7, edge: 0 });
  head.position.y = 1.6;
  g.add(body, head);
  return g;
}
function database(color = COL.ext) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = shape(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 28), color, { fill: 0.3, threshold: 30 });
    c.position.y = 0.3 + i * 0.58;
    g.add(c);
  }
  return g;
}
function globe(color = COL.ext, r = 0.95) {
  const g = shape(new THREE.SphereGeometry(r, 16, 10), color, { fill: 0.16, edge: 0.75, threshold: 1 });
  g.userData.spin = 0.25;
  return g;
}
function papers(color = COL.ext, n = 3) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const p = box(1.0, 1.3, 0.05, color, { fill: 0.35 });
    p.position.set(i * 0.18, 0.7 + i * 0.05, -i * 0.25);
    for (let k = 0; k < 4; k++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.6 - (k === 3 ? 0.25 : 0), 0.05, 0.01), M(color, 0.9, 0.5));
      line.position.set(-0.08, 0.35 - k * 0.2, 0.035);
      p.add(line);
    }
    g.add(p);
  }
  return g;
}
function doc(color, w = 1.1, h = 1.4) {
  const p = box(w, h, 0.05, color, { fill: 0.4 });
  for (let k = 0; k < 5; k++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62 - (k === 4 ? w * 0.25 : 0), 0.05, 0.01), M(color, 0.95, 0.6));
    line.position.set(-w * 0.06, h * 0.32 - k * h * 0.14, 0.035);
    p.add(line);
  }
  p.userData.bob = 1;
  return p;
}
function authServer() {
  const g = new THREE.Group();
  const b = box(1.7, 1.9, 1.7, COL.auth, { fill: 0.25 });
  b.position.y = 0.95;
  const ring = shape(new THREE.TorusGeometry(0.42, 0.1, 10, 28), COL.auth, { fill: 0.8, edge: 0, emissive: 0.5 });
  ring.position.set(0, 2.55, 0);
  const shaft = box(0.14, 0.7, 0.14, COL.auth, { fill: 0.8, edge: 0 });
  shaft.position.set(0, 2.0, 0);
  const key = new THREE.Group();
  key.add(ring, shaft);
  key.userData.spin = 0.6;
  g.add(b, key);
  return g;
}
function threatGem() {
  const g = shape(new THREE.OctahedronGeometry(0.42, 0), COL.threat, { fill: 0.75, edge: 1, emissive: 0.7 });
  g.userData.spin = 1.2;
  g.userData.bob = 1;
  return g;
}
function zone(x0, x1, z0, z1, color = COL.zone) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  geo.rotateX(-Math.PI / 2);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, M(color, 0.07, 0.1, { side: THREE.DoubleSide })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), Lm(color, 0.6)));
  g.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
  return g;
}
function gear(color = COL.tools) {
  const g = new THREE.Group();
  g.add(shape(new THREE.TorusGeometry(0.55, 0.16, 10, 32), color, { fill: 0.7, edge: 0, emissive: 0.4 }));
  for (let i = 0; i < 8; i++) {
    const t = box(0.26, 0.26, 0.26, color, { fill: 0.75, edge: 0 });
    const a = (i / 8) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0);
    t.rotation.z = a;
    g.add(t);
  }
  g.userData.spinZ = 0.8;
  return g;
}
function bubble(color = COL.prompts) {
  const g = new THREE.Group();
  g.add(box(1.5, 0.95, 0.25, color, { fill: 0.45 }));
  const tail = shape(new THREE.ConeGeometry(0.2, 0.45, 4), color, { fill: 0.6, edge: 0 });
  tail.rotation.z = Math.PI;
  tail.position.set(-0.4, -0.65, 0);
  g.add(tail);
  for (let k = 0; k < 3; k++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M(0xffffff, 0.95, 0.6));
    dot.position.set(-0.35 + k * 0.35, 0, 0.14);
    g.add(dot);
  }
  g.userData.bob = 1;
  return g;
}
function uiPanel() {
  // «MCP App»: мини-интерфейс, нарисованный на канвасе (график + кнопка)
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const x = c.getContext('2d');
  x.fillStyle = '#0f172a'; x.fillRect(0, 0, 512, 320);
  x.fillStyle = '#1e293b'; x.fillRect(0, 0, 512, 44);
  x.fillStyle = '#e2e8f0'; x.font = '600 22px system-ui, sans-serif';
  x.fillText('ui://sales/dashboard', 18, 30);
  const bars = [120, 180, 140, 220, 260, 200, 240];
  bars.forEach((h, i) => {
    x.fillStyle = i === 4 ? '#f472b6' : '#60a5fa';
    x.fillRect(34 + i * 62, 290 - h, 40, h);
  });
  x.fillStyle = '#34d399'; x.fillRect(360, 60, 132, 40);
  x.fillStyle = '#052e16'; x.font = '600 18px system-ui, sans-serif';
  x.fillText('Обновить', 386, 86);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  m.userData.base = 0.95;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), m));
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.25, 2.05)), Lm(COL.prompts, 1));
  g.add(frame);
  g.userData.bob = 1;
  return g;
}
function progressRing(color = KIND.task) {
  const g = new THREE.Group();
  const base = shape(new THREE.TorusGeometry(0.62, 0.05, 8, 48), color, { fill: 0.25, edge: 0 });
  const arcMat = M(color, 0.95, 0.8);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.11, 10, 64, 0.01), arcMat);
  g.add(base, arc);
  g.userData.arc = arc;
  g.userData.progress = 0;
  return g;
}
function monolith() {
  const g = box(1.6, 4.6, 0.5, COL.host, { fill: 0.3, emissive: 0.45 });
  g.children[0].position.y = 0; g.children[1].position.y = 0;
  for (let k = 0; k < 9; k++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.0 - (k % 3) * 0.2, 0.06, 0.02), M(0xffffff, 0.8, 0.5));
    l.position.set(-0.1, 1.6 - k * 0.38, 0.27);
    g.add(l);
  }
  g.position.y = 2.3;
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

/* ─────────────────────────── 3D: сущности сцены ─────────────────────────── */

const ents = new Map();

function makeLabel(text, sub, color, cls = '') {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  el._t = [text, sub || ''];
  el.style.setProperty('--c', hex(color));
  const b = document.createElement('b');
  b.textContent = text;
  el.appendChild(b);
  if (sub) {
    const s = document.createElement('span');
    s.textContent = sub;
    el.appendChild(s);
  }
  return new CSS2DObject(el);
}

function collectMats(obj) {
  const mats = [];
  obj.traverse(o => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) {
      if (m.userData.base === undefined) m.userData.base = m.opacity;
      m.transparent = true;
      mats.push(m);
    }
  });
  return mats;
}

function ent(id, obj, o = {}) {
  world.add(obj);
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const e = { id, obj, alpha: 0, target: 0, labels: [], pulse: 0, baseScale: obj.scale.clone(), baseY: obj.position.y };
  e.mats = collectMats(obj);
  if (o.label) {
    const l = makeLabel(o.label, o.sub, o.color ?? 0xffffff, o.labelCls);
    if (o.labelPos) l.position.set(...o.labelPos);
    else l.position.set(0, (b.isEmpty() ? 0 : b.max.y - obj.position.y) + 0.35, 0);
    l.center.set(...(o.labelCenter || [0.5, 1]));
    l.element.dataset.key = id;
    obj.add(l);
    e.labels.push(l);
  }
  e.anchor = o.anchor
    ? new THREE.Vector3(...o.anchor)
    : (b.isEmpty() ? obj.position.clone() : b.getCenter(new THREE.Vector3()));
  e.name = o.name || o.label || id;
  applyAlpha(e);
  ents.set(id, e);
  return e;
}

function applyAlpha(e) {
  const a = e.alpha;
  const vis = a > 0.01;
  e.obj.visible = vis;
  for (const m of e.mats) m.opacity = m.userData.base * a;
  for (const l of e.labels) l.element.style.opacity = a.toFixed(3);
}

// кривые между якорями сущностей: одна и та же дуга для «трубы» и пакетов
const curveCache = new Map();
const LIFT = {};
function curveFor(a, b) {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const rev = !(a < b);
  if (!curveCache.has(key)) {
    const [p, q] = key.split('|').map(id => ents.get(id).anchor);
    const d = p.distanceTo(q);
    const mid = p.clone().add(q).multiplyScalar(0.5);
    mid.y += LIFT[key] ?? d * 0.1;
    curveCache.set(key, new THREE.QuadraticBezierCurve3(p.clone(), mid, q.clone()));
  }
  return { curve: curveCache.get(key), rev };
}
function pipe(id, a, b, color, o = {}) {
  if (o.lift !== undefined) LIFT[a < b ? `${a}|${b}` : `${b}|${a}`] = o.lift;
  const { curve } = curveFor(a, b);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, o.r ?? 0.045, 8, false), M(color, o.fill ?? 0.5, 0.6));
  const e = ent(id, mesh, { name: o.name });
  if (o.label) {
    const l = makeLabel(o.label, o.sub, color, 'pipe');
    l.element.dataset.key = id;
    l.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 0.25, 0));
    l.center.set(0.5, 1);
    mesh.add(l);
    e.labels.push(l);
  }
  return e;
}
function line(id, points, color, opacity = 0.7) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  return ent(id, new THREE.Line(geo, Lm(color, opacity)));
}

function buildWorld() {
  // ── Основной мир: Host (слева) ⇄ серверы (справа) ⇄ внешние системы
  ent('zoneLocal', zone(-14, 10, -5.6, 4.3), {
    label: 'Ваш компьютер', sub: 'локальные процессы', color: COL.zone, labelCls: 'zone',
    labelPos: [-10.5, 0.05, 4.1], labelCenter: [0, 1],
  });
  ent('zoneRemote', zone(0.4, 13.5, 4.9, 8.8, 0x0ea5e9), {
    label: 'Интернет / облако', sub: 'удалённые сервисы', color: 0x0ea5e9, labelCls: 'zone',
    labelPos: [-6.3, 0.05, 1.9], labelCenter: [0, 0],
  });

  ent('host', place(hostShell(5.6, 3.4, 6.8), -7, 1.7, 0), {
    label: 'Host', sub: 'AI-приложение: чат, IDE, агент', color: COL.host, labelPos: [0, 2.05, -3.4],
  });
  ent('llm', place(brain(), -8.6, 1.9, 0), { label: 'LLM', sub: 'модель', color: COL.llm, labelPos: [0, 1.05, 0] });
  const cz = [-2.3, 0, 2.3];
  cz.forEach((z, i) => ent(`c${i + 1}`, place(box(0.95, 0.95, 0.95, COL.client, { fill: 0.42 }), -5, 1.7, z), {
    label: `Client ${i + 1}`, color: COL.client, labelPos: [0, 0.62, 0], name: `MCP Client ${i + 1}`,
  }));

  const srv = [
    ['s1', 3, 0, -3.1, 'MCP Server · Files', 'stdio, локальный'],
    ['s2', 3, 0, 0.3, 'MCP Server · Postgres', 'stdio, локальный'],
    ['s3', 4.6, 0, 6.4, 'MCP Server · GitHub', 'Streamable HTTP'],
  ];
  for (const [id, x, y, z, l, s] of srv) {
    ent(id, place(tower(COL.server), x, y, z), {
      label: l, sub: s, color: COL.server, anchor: [x, 1.3, z], labelPos: [0, id === 's1' ? 3.35 : 2.75, 0],
    });
  }
  ent('e1', place(papers(COL.ext), 7.8, 0, -3.1), { label: 'Файлы', sub: 'диск', color: COL.ext, anchor: [7.9, 0.9, -3.3], labelPos: [0, 2.4, 0] });
  ent('e2', place(database(COL.ext), 7.8, 0, 0.3), { label: 'PostgreSQL', sub: 'база данных', color: COL.ext, anchor: [7.8, 1, 0.3] });
  ent('e3', place(globe(COL.ext), 10.6, 1.2, 6.4), { label: 'GitHub API', sub: 'REST/GraphQL', color: COL.ext });
  ent('user', place(person(), -12.2, 0, 2.4), { label: 'Пользователь', color: COL.user, anchor: [-12.2, 1.3, 2.4] });

  pipe('p1', 'c1', 's1', COL.client);
  pipe('p2', 'c2', 's2', COL.client);
  pipe('p3', 'c3', 's3', COL.client, { lift: 1.2 });
  pipe('x1', 's1', 'e1', COL.ext, { r: 0.035, fill: 0.35 });
  pipe('x2', 's2', 'e2', COL.ext, { r: 0.035, fill: 0.35 });
  pipe('x3', 's3', 'e3', COL.ext, { r: 0.035, fill: 0.35 });
  // внутренние связи хоста: LLM ⇄ клиенты (без труб, только для пакетов)
  LIFT['c1|llm'] = 0.6; LIFT['c2|llm'] = 0.6; LIFT['c3|llm'] = 0.6;

  // ── Авторизация
  ent('as', place(authServer(), 0.2, 0, 8.2), {
    label: 'Authorization Server', sub: 'OAuth 2.1 (IdP)', color: COL.auth, anchor: [0.2, 1.1, 8.2],
  });
  ent('prm', place(doc(COL.auth), 4.6, 3.9, 6.4), {
    label: 'Protected Resource Metadata', sub: '/.well-known/oauth-protected-resource', color: COL.auth,
  });
  ent('asmeta', place(doc(COL.auth), 0.2, 4.4, 8.2), {
    label: 'AS Metadata', sub: '/.well-known/oauth-authorization-server', color: COL.auth,
  });
  ent('token', place(box(0.9, 0.5, 0.08, COL.auth, { fill: 0.8, emissive: 0.6 }), -5, 3.2, 2.3), {
    label: 'access_token', sub: 'aud = MCP-сервер', color: COL.auth,
  });

  // ── Примитивы сервера
  const prim = [
    ['prim_tools', gear(COL.tools), -0.6, 2.6, -3.6, 'Tools', 'управляет модель', COL.tools],
    ['prim_res', papers(COL.resources, 3), -0.9, 0.9, 0.3, 'Resources', 'управляет приложение', COL.resources],
    ['prim_prompts', bubble(COL.prompts), -0.6, 2.2, 4.2, 'Prompts', 'управляет пользователь', COL.prompts],
  ];
  for (const [id, obj, x, y, z, l, s, c] of prim) ent(id, place(obj, x, y, z), { label: l, sub: s, color: c });
  pipe('pp1', 's2', 'prim_tools', COL.tools, { r: 0.03, fill: 0.4, lift: 0.4 });
  pipe('pp2', 's2', 'prim_res', COL.resources, { r: 0.03, fill: 0.4, lift: 0.4 });
  pipe('pp3', 's2', 'prim_prompts', COL.prompts, { r: 0.03, fill: 0.4, lift: 0.4 });

  // ── Расширения: задачи, приложения, навыки
  ent('task', place(progressRing(), 3, 4.2, 0.3), { label: 'Task', sub: 'working…', color: KIND.task });
  const ui = place(uiPanel(), -7, 6.3, 1.2);
  ui.rotation.x = -0.45;
  ui.scale.setScalar(1.35);
  ent('uiapp', ui, { label: 'MCP App', sub: 'HTML в песочнице iframe', color: COL.prompts, labelPos: [0, 1.25, 0] });
  ent('skill', place(doc(COL.resources, 1.0, 1.3), 0.8, 3.6, -3.1), {
    label: 'Skill', sub: 'SKILL.md + файлы', color: COL.resources,
  });

  // ── Угрозы
  const threats = [
    ['t_poison', 3, 3.6, 0.3, 'Отравленный инструмент', 'скрытые инструкции в описании'],
    ['t_inject', 10.6, 3.0, 6.4, 'Промпт-инъекция', 'в данных из внешнего мира'],
    ['t_pass', 7.6, 2.4, 6.4, 'Проброс токена', 'token passthrough'],
    ['t_deputy', 4.6, 4.0, 6.4, 'Confused deputy', 'прокси с общим client_id'],
    ['t_ssrf', -1.5, 3.8, 5.0, 'SSRF', 'при OAuth discovery'],
    ['t_local', 3, 3.6, -3.1, 'Локальный сервер', 'запуск произвольных команд'],
    ['t_session', -0.5, 3.4, 2.4, 'Угон state-handle', 'handle — не аутентификация'],
  ];
  for (const [id, x, y, z, l, s] of threats) ent(id, place(threatGem(), x, y, z), { label: l, sub: s, color: COL.threat });
  ent('shield', place(shape(new THREE.SphereGeometry(4.2, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), COL.ok, { fill: 0.05, edge: 0.35, threshold: 1 }), -7, 0, 0), {
    label: 'Согласие пользователя', sub: 'host решает, что разрешить', color: COL.ok, labelPos: [0, 4.5, 0],
  });

  buildWhy();
  buildLayers();
  buildLife();
  buildChain();
  buildDesign();
  buildEco();
}

// ── Станция «Без рукопожатия»: клиент → балансировщик → любая реплика
function buildLife() {
  ent('life_c', place(box(1, 1, 1, COL.client, { fill: 0.45 }), -6.5, 0.9, 0), {
    label: 'MCP Client', sub: 'версия и capabilities — в каждом запросе', color: COL.client,
  });
  ent('life_lb', place(shape(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 6), COL.transport, { fill: 0.35 }), -1, 0.6, 0), {
    label: 'Балансировщик', sub: 'без «липких» сессий', color: COL.transport,
  });
  ['A', 'B', 'C'].forEach((n, i) => ent(`life_r${i + 1}`, place(tower(COL.server), 5.5, 0, -3.4 + i * 3.4), {
    label: `Реплика ${n}`, sub: 'MCP Server', color: COL.server, anchor: [5.5, 1.3, -3.4 + i * 3.4],
  }));
  pipe('life_p0', 'life_c', 'life_lb', COL.client, { lift: 0.3, r: 0.06 });
  for (let i = 1; i <= 3; i++) pipe(`life_p${i}`, 'life_lb', `life_r${i}`, COL.transport, { lift: 0.3, r: 0.035 });
}

// ── Станция «Зачем MCP»: N×M интеграций против N+M
function buildWhy() {
  const apps = [[-6.5, -3, 'Чат-ассистент'], [-6.5, 0, 'IDE'], [-6.5, 3, 'Свой агент']];
  const svcs = [[6.5, -4.5, 'GitHub'], [6.5, -1.5, 'Slack'], [6.5, 1.5, 'Postgres'], [6.5, 4.5, 'Google Drive']];
  apps.forEach(([x, z, n], i) => ent(`why_a${i}`, place(hostShell(1.8, 1.3, 1.8), x, 0.65, z), {
    label: n, sub: 'AI-приложение', color: COL.host,
  }));
  svcs.forEach(([x, z, n], i) => ent(`why_s${i}`, place(tower(COL.ext, 2, 1.3), x, 0, z), { label: n, color: COL.ext }));

  const custom = new THREE.Group();
  const mcp = new THREE.Group();
  let k = 0;
  apps.forEach(([ax, az]) => svcs.forEach(([sx, sz]) => {
    const y = 0.6 + (k % 4) * 0.12;
    const a = new THREE.Vector3(ax + 0.9, y, az), b = new THREE.Vector3(sx - 0.65, y, sz);
    const mid = a.clone().lerp(b, 0.5);
    const hue = new THREE.Color().setHSL(0.02 + (k % 6) * 0.018, 0.85, 0.58);
    custom.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), Lm(hue, 0.75)));
    const ad = box(0.3, 0.3, 0.3, hue, { fill: 0.8, edge: 0 });
    ad.position.copy(mid);
    ad.userData.spin = 1 + (k % 3) * 0.3;
    custom.add(ad);
    const a2 = new THREE.Vector3(ax + 1.25, 0.65, az), b2 = new THREE.Vector3(sx - 1.0, 0.65, sz);
    const m2 = a2.clone().lerp(b2, 0.5); m2.y += 0.6;
    const c2 = new THREE.QuadraticBezierCurve3(a2, m2, b2);
    mcp.add(new THREE.Mesh(new THREE.TubeGeometry(c2, 32, 0.025, 6), M(COL.host, 0.55, 0.6)));
    k++;
  }));
  apps.forEach(([x, z]) => mcp.add(place(box(0.5, 0.5, 0.5, COL.client, { fill: 0.7 }), x + 1.2, 0.65, z)));
  svcs.forEach(([x, z]) => mcp.add(place(box(0.5, 0.5, 0.5, COL.server, { fill: 0.7 }), x - 0.95, 0.65, z)));
  ent('why_custom', custom, {
    label: '3 × 4 = 12 самописных интеграций', sub: 'каждая пара — свой адаптер', color: 0xf97316,
    labelPos: [0, 3.2, 0],
  });
  ent('why_mcp', mcp, {
    label: '3 + 4 = 7 реализаций MCP', sub: 'клиент в приложении, сервер у сервиса', color: COL.host,
    labelPos: [0, 3.2, 0],
  });
}

// ── Станция «Два слоя»: стек клиента и сервера
function buildLayers() {
  const layers = [
    ['Транспорт', 'stdio · Streamable HTTP', COL.transport],
    ['Data layer', 'JSON-RPC 2.0 · жизненный цикл', COL.host],
    ['Примитивы', 'tools · resources · prompts…', COL.server],
  ];
  [-3.6, 3.6].forEach((x, side) => layers.forEach(([n, s, c], i) => {
    const id = `lay_${side ? 'R' : 'L'}${i + 1}`;
    ent(id, place(box(3.4, 0.42, 3.4, c, { fill: 0.3 }), x, 0.5 + i * 1.25, 0), {
      label: n, sub: s, color: c,
      labelPos: [side ? 1.9 : -1.9, 0, 0], labelCenter: [side ? 0 : 1, 0.5],
      anchor: [x, 0.5 + i * 1.25, 0],
    });
  }));
  ent('lay_Ln', place(new THREE.Object3D(), -3.6, 3.4, 0), { label: 'MCP Client', color: COL.client, labelCenter: [0.5, 1] });
  ent('lay_Rn', place(new THREE.Object3D(), 3.6, 3.4, 0), { label: 'MCP Server', color: COL.server, labelCenter: [0.5, 1] });
  pipe('lay_wire', 'lay_L1', 'lay_R1', COL.transport, { lift: 0.0, r: 0.07, label: 'байты: строки stdio или HTTP-запросы' });
  LIFT['lay_L1|lay_L2'] = 0; LIFT['lay_L2|lay_L3'] = 0; LIFT['lay_R1|lay_R2'] = 0; LIFT['lay_R2|lay_R3'] = 0;
}

// ── Станция «Цепочка API»: три тонкие обёртки против одного инструмента уровня задачи
function tiles(names, color, w, y) {
  const g = new THREE.Group();
  const lbls = [];
  names.forEach((n, i) => {
    const t = box(w, 0.5, 0.12, color, { fill: 0.7, emissive: 0.45 });
    t.position.set((i - (names.length - 1) / 2) * (w + 0.55), y, 0);
    const l = makeLabel(n, '', color, 'small');
    l.position.set(0, i % 2 ? 0.85 : 0.32, 0);
    l.center.set(0.5, 1);
    t.add(l);
    lbls.push(l);
    g.add(t);
  });
  g.userData.bob = 1;
  return { g, lbls };
}
function buildChain() {
  ent('ch_host', place(hostShell(4, 2.8, 3.6), -8.5, 1.4, 0), { label: 'Host', sub: 'агент / чат', color: COL.host, labelPos: [0, 1.75, -1.8] });
  ent('ch_llm', place(brain(0.7), -9.5, 1.5, 0), { label: 'LLM', color: COL.llm, labelPos: [0, 0.85, 0] });
  ent('ch_cl', place(box(0.8, 0.8, 0.8, COL.client, { fill: 0.45 }), -7.1, 1.4, 0), { label: 'Client', color: COL.client, labelPos: [0, 0.55, 0] });
  ent('ch_srv', place(tower(COL.server, 3, 1.6), -0.8, 0, 0), {
    label: 'MCP Server', sub: 'адаптер поверх API', color: COL.server, anchor: [-0.8, 1.3, 0], labelPos: [0, -0.35, 1.6], labelCenter: [0.5, 0],
  });
  const thin = tiles(['find_customer', 'list_contracts', 'calc_debt'], COL.tools, 1.3, 3.2);
  place(thin.g, -0.8, 0, 0);
  const fat = tiles(['get_customer_debt'], COL.tools, 2.6, 3.2);
  place(fat.g, -0.8, 0, 0);
  thin.lbls.forEach((l, i) => { l.element.dataset.key = `ch_thin#${i}`; });
  fat.lbls.forEach((l, i) => { l.element.dataset.key = `ch_fat#${i}`; });
  const et = ent('ch_thin', thin.g, { name: 'инструменты' });
  et.labels.push(...thin.lbls);
  const ef = ent('ch_fat', fat.g, { name: 'инструмент' });
  ef.labels.push(...fat.lbls);
  const apis = [
    ['API 1 · клиенты', 'GET /customers?inn=…'],
    ['API 2 · договоры', 'GET /contracts?customer_id=…'],
    ['API 3 · расчёты', 'POST /debt/calculate'],
  ];
  apis.forEach(([n, sub], i) => {
    const z = -3.4 + i * 3.4;
    ent(`ch_api${i + 1}`, place(tower(COL.ext, 2, 1.3), 6.2, 0, z), { label: n, sub, color: COL.ext, anchor: [6.2, 0.9, z] });
    pipe(`ch_x${i + 1}`, 'ch_srv', `ch_api${i + 1}`, COL.ext, { r: 0.035, fill: 0.35, lift: 0.4 });
  });
  pipe('ch_p', 'ch_cl', 'ch_srv', COL.client, { lift: 0.5 });
  LIFT['ch_cl|ch_llm'] = 0.4;
}

// ── Станция «Проектирование»: сервер в разобранном виде
const DESIGN = [
  ['Транспорт', 'stdio / Streamable HTTP, TLS, проверка Origin', COL.transport],
  ['Авторизация', 'OAuth 2.1 resource server: токен, aud, scope', COL.auth],
  ['Протокол (SDK)', 'JSON-RPC, версии, capabilities, ошибки', COL.host],
  ['Каталог возможностей', 'tools · resources · prompts + JSON Schema', COL.server],
  ['Доменный слой', 'бизнес-логика, адаптеры к API и БД', COL.tools],
];
function buildDesign() {
  DESIGN.forEach(([n, s, c], i) => {
    ent(`d${i + 1}`, place(box(4.6, 0.5, 3.2, c, { fill: 0.32 }), 0, 0.5 + i * 0.62, 0), {
      label: n, sub: s, color: c, labelPos: [2.5, 0, 0], labelCenter: [0, 0.5], anchor: [0, 0.5 + i * 0.62, 0],
    }).stack = i;
  });
  ent('d_obs', place(box(0.5, 1, 3.2, COL.resources, { fill: 0.2 }), -2.75, 0.5, 0), {
    label: 'Наблюдаемость', sub: 'логи · метрики · аудит — сквозь все слои', color: COL.resources,
    labelPos: [-0.4, 0, 0], labelCenter: [1, 0.5],
  });
  ent('d_client', place(box(1, 1, 1, COL.client, { fill: 0.45 }), -8, 0.6, 0), { label: 'MCP Client', color: COL.client, anchor: [-8, 0.6, 0] });
  ent('d_ext', place(database(COL.ext), 7.5, 0, 0), { label: 'API / БД', sub: 'система-источник', color: COL.ext, anchor: [7.5, 0.9, 0] });
}
function designLayout(k) {
  // k: 0 — собран, 1 — разобран
  const gap = 0.62 + k * 0.9;
  for (let i = 0; i < DESIGN.length; i++) {
    const e = ents.get(`d${i + 1}`);
    const y = 0.5 + i * gap;
    e.obj.position.y = y;
    e.anchor.y = y;
  }
  const top = 0.5 + (DESIGN.length - 1) * gap;
  const obs = ents.get('d_obs');
  obs.obj.scale.y = obs.baseScale.y = top + 0.5;
  obs.obj.position.y = (top + 0.5) / 2 + 0.25;
  for (const l of obs.labels) l.position.y = 0;
  curveCache.forEach((_, key) => { if (/(^|\|)d/.test(key)) curveCache.delete(key); });
}

// ── Станция «Экосистема»
function buildEco() {
  ent('eco_spec', place(monolith(), 0, 0, 0), { label: 'Спецификация MCP', sub: 'schema.ts + текст спецификации', color: COL.host, labelPos: [0, 5.0, 0] });
  const ring = new THREE.Group();
  const sdks = [
    ['TypeScript', 1], ['Python', 1], ['C#', 1], ['Go', 1], ['Rust', 1],
    ['Java', 2], ['Ruby', 2], ['Swift', 3], ['PHP', 3], ['Kotlin', 3],
  ];
  const tierCol = { 1: COL.server, 2: COL.host, 3: COL.user };
  sdks.forEach(([n, tier], i) => {
    const a = (i / sdks.length) * Math.PI * 2;
    const t = box(0.8, 0.5, 0.12, tierCol[tier], { fill: 0.6 });
    t.position.set(Math.cos(a) * 4.2, 1.3 + (i % 2) * 0.5, Math.sin(a) * 4.2);
    t.lookAt(0, t.position.y, 0);
    const l = makeLabel(n, `Tier ${tier}`, tierCol[tier], 'small');
    l.position.set(0, 0.4, 0);
    t.add(l);
    ring.add(t);
  });
  ring.userData.spinY = 0.12;
  const e = ent('eco_sdks', ring, { name: 'SDK' });
  ring.traverse(o => { if (o.isCSS2DObject) e.labels.push(o); });
  ent('eco_registry', place(box(1.8, 1.4, 1.8, COL.resources, { fill: 0.3 }), -7, 0.7, -4.5), { label: 'MCP Registry', sub: 'каталог серверов · server.json', color: COL.resources });
  ent('eco_inspector', place(shape(new THREE.TorusGeometry(0.6, 0.14, 10, 28), COL.tools, { fill: 0.6, edge: 0 }), 7, 1.2, -4), { label: 'MCP Inspector', sub: 'отладка серверов', color: COL.tools });
  ent('eco_hosts', place(hostShell(2.4, 1.4, 1.6), 7, 0.7, 3.5), { label: 'Hosts', sub: 'чаты, IDE, агенты', color: COL.host });
  ent('eco_servers', place(tower(COL.server, 2, 1.3), -8, 0, 3.2), { label: 'Серверы', sub: 'тысячи интеграций', color: COL.server });
}

/* ─────────────────────────── 3D: пакеты, импульсы ─────────────────────────── */

const packets = [];
const pulses = [];
const TRAIL = 7;

function packetMesh(color) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshBasicMaterial({ color, transparent: true }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  glow.scale.setScalar(1.3);
  g.add(core, glow);
  const trail = [];
  for (let i = 0; i < TRAIL; i++) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.11 * (1 - i / TRAIL), 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 * (1 - i / TRAIL) }));
    t.userData.o = 0.5 * (1 - i / TRAIL);
    scene.add(t);
    trail.push(t);
  }
  return { g, core, glow, trail };
}

function sendPacket({ from, to, path, kind = 'req', label = '', dur = 1.5, delay = 0 }) {
  if (!HAS3D) return;
  let getPoint;
  if (path) {
    const pts = path.map(id => ents.get(id)?.anchor).filter(Boolean);
    if (pts.length < 2) return;
    const c = new THREE.CatmullRomCurve3(pts.map(p => p.clone()), false, 'centripetal', 0.2);
    getPoint = t => c.getPoint(t);
  } else {
    if (!ents.has(from) || !ents.has(to)) return;
    const { curve, rev } = curveFor(from, to);
    getPoint = t => curve.getPoint(rev ? 1 - t : t);
  }
  const color = KIND[kind] ?? KIND.req;
  const m = packetMesh(color);
  scene.add(m.g);
  let lbl = null;
  if (label) {
    lbl = makeLabel(label, '', color, 'pkt');
    lbl.position.set(0, 0.32, 0);
    lbl.center.set(0.5, 1);
    m.g.add(lbl);
  }
  const p = { ...m, lbl, getPoint, t: -delay, dur, hist: [] };
  m.g.visible = false;
  packets.push(p);
}

function killPacket(p) {
  scene.remove(p.g);
  if (p.lbl) { p.lbl.element.remove(); p.g.remove(p.lbl); }
  p.g.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
  for (const t of p.trail) { scene.remove(t); t.geometry.dispose(); t.material.dispose(); }
}
function clearPackets() { packets.splice(0).forEach(killPacket); }

function tickPackets(dt) {
  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i];
    p.t += dt;
    if (p.t < 0) continue;
    const k = clamp(p.t / p.dur, 0, 1);
    const pos = p.getPoint(ease(k));
    p.g.visible = true;
    p.g.position.copy(pos);
    p.hist.unshift(pos.clone());
    if (p.hist.length > TRAIL * 2) p.hist.length = TRAIL * 2;
    p.trail.forEach((t, j) => {
      const h = p.hist[Math.min(p.hist.length - 1, j * 2 + 1)];
      if (h) t.position.copy(h);
    });
    const fade = k > 0.92 ? 1 - (k - 0.92) / 0.08 : 1;
    p.core.material.opacity = fade;
    p.glow.material.opacity = 0.9 * fade;
    p.trail.forEach(t => { t.material.opacity = t.userData.o * fade; });
    if (p.lbl) p.lbl.element.style.opacity = fade;
    if (k >= 1) { killPacket(p); packets.splice(i, 1); }
  }
}

function pulseAt(id, { kind = 'note', label = '', dur = 1.6 } = {}) {
  const e = ents.get(id);
  if (!e || !HAS3D) return;
  const color = KIND[kind] ?? KIND.note;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.copy(e.anchor);
  scene.add(ring);
  let lbl = null;
  if (label) {
    lbl = makeLabel(label, '', color, 'bubble');
    lbl.position.copy(e.anchor).add(new THREE.Vector3(0, 1.4, 0));
    lbl.center.set(0.5, 1);
    scene.add(lbl);
  }
  e.pulse = dur;
  pulses.push({ ring, lbl, t: 0, dur, e });
}
function clearPulses() {
  pulses.splice(0).forEach(p => {
    scene.remove(p.ring); p.ring.geometry.dispose(); p.ring.material.dispose();
    if (p.lbl) { scene.remove(p.lbl); p.lbl.element.remove(); }
    p.e.pulse = 0;
  });
}
function tickPulses(dt) {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.t += dt;
    const k = (p.t % 0.9) / 0.9;
    p.ring.scale.setScalar(1 + k * 1.8);
    p.ring.material.opacity = (1 - k) * 0.9;
    p.ring.quaternion.copy(camera.quaternion);
    if (p.lbl) p.lbl.element.style.opacity = clamp(Math.min(p.t * 4, (p.dur - p.t) * 4), 0, 1);
    if (p.t >= p.dur) {
      scene.remove(p.ring); p.ring.geometry.dispose(); p.ring.material.dispose();
      if (p.lbl) { scene.remove(p.lbl); p.lbl.element.remove(); }
      pulses.splice(i, 1);
    }
  }
}

/* ─────────────────────────── Шаги-анимации глав ─────────────────────────── */

const runner = {
  steps: [], i: -1, t: 0, phase: 'idle', paused: false, page: null,
  load(page) {
    this.page = page;
    this.steps = $$('ol.steps > li', page).map(li => ({
      el: li,
      from: li.dataset.from, to: li.dataset.to,
      path: li.dataset.path ? li.dataset.path.split(',').map(s => s.trim()) : null,
      at: li.dataset.at, kind: li.dataset.kind || (li.dataset.at ? 'note' : 'req'),
      label: li.dataset.label || '', act: li.dataset.do,
      count: +(li.dataset.count || 1),
      dur: +(li.dataset.dur || (li.dataset.at || li.dataset.do ? 1.8 : 1.5)),
      payload: $('.payload', li),
      msg: listMsg(li.parentElement) || $('.msg', page),
    }));
    this.reset();
    this.phase = this.steps.length ? 'wait' : 'idle';
    this.t = -0.9;
  },
  reset() {
    this.i = -1;
    this.steps.forEach(s => s.el.classList.remove('active', 'done'));
    if (this.page) $$('.msg', this.page).forEach(m => m.classList.remove('has'));
  },
  begin(i) {
    const s = this.steps[i];
    this.i = i;
    this.t = 0;
    this.phase = 'run';
    this.steps.forEach((x, j) => {
      x.el.classList.toggle('active', j === i);
      x.el.classList.toggle('done', j < i);
    });
    if (s.act) hooks[curCh]?.action?.(s.act, s);
    if (s.at) pulseAt(s.at, { kind: s.kind, label: s.label, dur: s.dur });
    if (s.from || s.path) {
      for (let n = 0; n < s.count; n++) {
        sendPacket({ from: s.from, to: s.to, path: s.path, kind: s.kind, label: n === 0 ? s.label : '', dur: s.dur, delay: n * Math.min(0.45, s.dur / s.count) });
      }
    }
    if (s.payload && s.msg) showMessage(s.msg, s);
    followStep(s.el);
  },
  jump(i) {
    if (stageState() === 'hidden') setStage('normal');
    clearPackets(); clearPulses();
    this.begin(i);
    this.setPaused(true);
  },
  restart() {
    clearPackets(); clearPulses();
    this.reset();
    hooks[curCh]?.reset?.();
    this.phase = this.steps.length ? 'wait' : 'idle';
    this.t = 0;
    this.setPaused(false);
  },
  setPaused(v) {
    this.paused = v;
    $$('.js-play').forEach(b => {
      b.dataset.state = v ? 'paused' : 'playing';
      b.setAttribute('aria-label', v ? 'Продолжить анимацию' : 'Пауза');
    });
  },
  tick(dt) {
    if (this.paused || this.phase === 'idle') return;
    this.t += dt;
    const s = this.steps[this.i];
    if (this.phase === 'run' && this.t >= (s.dur + (s.count - 1) * Math.min(0.45, s.dur / s.count))) {
      s.el.classList.remove('active');
      s.el.classList.add('done');
      this.phase = 'wait';
      this.t = 0;
    } else if (this.phase === 'wait' && this.t >= 0.45) {
      if (this.i + 1 < this.steps.length) this.begin(this.i + 1);
      else { this.phase = 'end'; this.t = 0; }
    } else if (this.phase === 'end' && this.t >= 3.2) {
      this.reset();
      hooks[curCh]?.reset?.();
      this.begin(0);
    }
  },
};

function listMsg(ol) {
  const n = ol.nextElementSibling;
  return n && n.classList.contains('msg') ? n : null;
}

function showMessage(box, s) {
  const code = $('code', box);
  const head = $('.msg-head', box);
  const src = s.payload.textContent.trim();
  code.innerHTML = highlightJSON(src);
  const from = s.from ? ents.get(s.from)?.name : '';
  const to = s.to ? ents.get(s.to)?.name : '';
  head.innerHTML = '';
  const k = document.createElement('span');
  k.className = 'kind';
  k.style.setProperty('--c', hex(KIND[s.kind] ?? KIND.req));
  k.textContent = KIND_NAME[s.kind] || s.kind;
  const d = document.createElement('span');
  d.className = 'dir';
  d.textContent = s.payload.dataset.title || (from && to ? `${from} → ${to}` : '');
  head.append(k, d);
  box.classList.add('has');
}

function highlightJSON(src) {
  const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|(\/\/[^\n]*)/g, (m, str, colon, lit, num, com) => {
    if (str) return colon ? `<span class="j-k">${str}</span>${colon}` : `<span class="j-s">${str}</span>`;
    if (lit) return `<span class="j-l">${lit}</span>`;
    if (num) return `<span class="j-n">${num}</span>`;
    if (com) return `<span class="j-c">${com}</span>`;
    return m;
  });
}

let lastUserScroll = 0;
function followStep(li) {
  const pane = $('#book');
  if (!pane || performance.now() - lastUserScroll < 5000) return;
  const r = li.getBoundingClientRect(), pr = pane.getBoundingClientRect();
  const lr = li.parentElement.getBoundingClientRect();
  // следуем за шагами, только если читатель сам докрутил до списка
  if (lr.top > pr.top + pr.height * 0.5 || lr.bottom < pr.top + 40) return;
  if (r.top < pr.top + 60 || r.bottom > pr.bottom - 20) {
    pane.scrollTo({ top: pane.scrollTop + (r.top - pr.top) - pr.height * 0.35, behavior: REDUCED ? 'auto' : 'smooth' });
  }
}

/* ─────────────────────────── Главы: хуки ─────────────────────────── */

const setT = (id, v) => { const e = ents.get(id); if (e) e.target = v; };
const TRAFFIC = [
  ['c1', 's1', 'resources/read'], ['c2', 's2', 'tools/call'], ['c3', 's3', 'tools/list'],
  ['c3', 's3', 'tools/call'], ['c2', 's2', 'prompts/get'], ['c1', 's1', 'tools/call'],
];
let designK = 0, designTarget = 0;

const hooks = {
  cover: {
    enter() { this.t = 0; },
    update(dt) {
      this.t += dt;
      if (this.t > 1.1) {
        this.t = 0;
        const [a, b, l] = TRAFFIC[Math.floor(Math.random() * TRAFFIC.length)];
        sendPacket({ from: a, to: b, kind: 'req', label: l, dur: 1.4 });
        sendPacket({ from: b, to: a, kind: 'res', dur: 1.4, delay: 1.5 });
      }
    },
  },
  why: {
    enter() { setT('why_custom', 1); setT('why_mcp', 0); },
    reset() { this.enter(); },
    action(a) {
      setT('why_custom', a === 'nxm' ? 1 : 0);
      setT('why_mcp', a === 'mcp' ? 1 : 0);
    },
  },
  chain: {
    enter() { setT('ch_thin', 1); setT('ch_fat', 0); },
    reset() { this.enter(); },
    action(a) {
      setT('ch_thin', a === 'thin' ? 1 : 0);
      setT('ch_fat', a === 'fat' ? 1 : 0);
    },
  },
  design: {
    enter() { designTarget = 0; },
    reset() { designTarget = 0; },
    exit() { designTarget = 0; designK = 0; designLayout(0); },
    action(a) { if (a === 'explode') designTarget = 1; if (a === 'collapse') designTarget = 0; },
  },
  auth: {
    enter() { setT('token', 0); },
    reset() { this.enter(); },
    action(a) { if (a === 'token') setT('token', 1); },
  },
  ext: {
    enter() {
      ['task', 'uiapp', 'skill'].forEach(id => setT(id, 0));
      const u = ents.get('task').obj.userData;
      u.progress = 0;
      u.goal = undefined;
    },
    reset() { this.enter(); },
    action(a) {
      const t = ents.get('task');
      if (a === 'task') { setT('task', 1); t.obj.userData.progress = 0.05; t.obj.userData.goal = 0.55; }
      if (a === 'task-done') { t.obj.userData.goal = 1; }
      if (a === 'app') setT('uiapp', 1);
      if (a === 'skill') setT('skill', 1);
    },
    update(dt) {
      const t = ents.get('task');
      const u = t.obj.userData;
      if (u.goal !== undefined && u.progress < u.goal) u.progress = Math.min(u.goal, u.progress + dt * 0.18);
      setRing(t.obj, u.progress);
      t.labels[0].element.querySelector('span').textContent = u.progress >= 1 ? 'completed ✓' : `working… ${Math.round(u.progress * 100)}%`;
    },
  },
};
let lastArc = -1;
function setRing(obj, p) {
  const q = Math.round(p * 64);
  if (q === lastArc) return;
  lastArc = q;
  const arc = obj.userData.arc;
  arc.geometry.dispose();
  arc.geometry = new THREE.TorusGeometry(0.62, 0.11, 10, 64, Math.max(0.01, p * Math.PI * 2));
}

/* ─────────────────────────── Камера ─────────────────────────── */

let camTween = null, userOrbit = false, camPreset = null;
function camFor(preset) {
  const [px, py, pz, tx, ty, tz] = preset;
  const pos = new THREE.Vector3(px, py, pz), tgt = new THREE.Vector3(tx, ty, tz);
  const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
  const k = aspect < 1.5 ? Math.min(2.4, Math.pow(1.5 / aspect, 0.95)) : 1;
  pos.sub(tgt).multiplyScalar(k).add(tgt);
  return { pos, tgt };
}
function flyTo(preset, instant = false) {
  if (!HAS3D || !preset) return;
  camPreset = preset;
  const { pos, tgt } = camFor(preset);
  userOrbit = false;
  if (instant || REDUCED) {
    camera.position.copy(pos);
    controls.target.copy(tgt);
    camTween = null;
    return;
  }
  camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, k: 0 };
}

/* ─────────────────────────── Цикл отрисовки ─────────────────────────── */

let curCh = null;
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  for (const e of ents.values()) {
    if (e.alpha !== e.target) {
      e.alpha += (e.target - e.alpha) * Math.min(1, dt * 4.5);
      if (Math.abs(e.alpha - e.target) < 0.004) e.alpha = e.target;
      applyAlpha(e);
    }
    if (!e.obj.visible) continue;
    const u = e.obj.userData;
    if (u.spin) e.obj.rotation.y += dt * u.spin;
    if (u.spinY) e.obj.rotation.y += dt * u.spinY;
    if (u.spinZ) e.obj.rotation.z += dt * u.spinZ;
    if (u.bob) e.obj.position.y = e.baseY + Math.sin(elapsed * 1.6 + e.baseY) * 0.08;
    if (u.leds) for (const led of u.leds) led.scale.setScalar(0.7 + 0.5 * (0.5 + 0.5 * Math.sin(elapsed * 3 + led.userData.phase)));
    e.obj.traverse(o => {
      if (o !== e.obj && o.userData.spin) o.rotation.y += dt * o.userData.spin;
    });
    if (e.pulse > 0) {
      e.pulse -= dt;
      const s = 1 + 0.06 * Math.sin(elapsed * 12) * Math.min(1, e.pulse);
      e.obj.scale.copy(e.baseScale).multiplyScalar(s);
    } else if (e.pulse !== 0) { e.pulse = 0; e.obj.scale.copy(e.baseScale); }
  }

  if (designK !== designTarget) {
    designK += (designTarget - designK) * Math.min(1, dt * 3);
    if (Math.abs(designK - designTarget) < 0.002) designK = designTarget;
    designLayout(designK);
  }

  if (camTween) {
    camTween.k = Math.min(1, camTween.k + dt / 1.5);
    const k = ease(camTween.k);
    camera.position.lerpVectors(camTween.p0, camTween.p1, k);
    controls.target.lerpVectors(camTween.t0, camTween.t1, k);
    if (camTween.k >= 1) camTween = null;
  }

  runner.tick(dt);
  hooks[curCh]?.update?.(dt);
  tickPackets(dt);
  tickPulses(dt);

  controls.update();
  if (!stageVisible) return;
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

let stageVisible = true;
function resize() {
  if (!HAS3D) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  stageVisible = w > 2 && h > 2;
  if (!stageVisible) return;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  stage.classList.toggle('compact', w < 640);
  if (camPreset && !userOrbit && !camTween) flyTo(camPreset, true);
}

/* ─────────────────────────── Книга: навигация ─────────────────────────── */

const GROUPS = {
  core: ['host', 'llm', 'c1', 'c2', 'c3', 's1', 's2', 's3', 'p1', 'p2', 'p3', 'e1', 'e2', 'e3', 'x1', 'x2', 'x3'],
  why: ['why_a0', 'why_a1', 'why_a2', 'why_s0', 'why_s1', 'why_s2', 'why_s3'],
  layers: ['lay_L1', 'lay_L2', 'lay_L3', 'lay_R1', 'lay_R2', 'lay_R3', 'lay_Ln', 'lay_Rn', 'lay_wire'],
  chain: ['ch_host', 'ch_llm', 'ch_cl', 'ch_srv', 'ch_p', 'ch_api1', 'ch_api2', 'ch_api3', 'ch_x1', 'ch_x2', 'ch_x3'],
  life: ['life_c', 'life_lb', 'life_r1', 'life_r2', 'life_r3', 'life_p0', 'life_p1', 'life_p2', 'life_p3'],
  design: ['d1', 'd2', 'd3', 'd4', 'd5', 'd_obs', 'd_client', 'd_ext'],
  eco: ['eco_spec', 'eco_sdks', 'eco_registry', 'eco_inspector', 'eco_hosts', 'eco_servers'],
  threats: ['t_poison', 't_inject', 't_pass', 't_deputy', 't_ssrf', 't_local', 't_session'],
};
function expandShow(str) {
  const out = new Set();
  for (const raw of (str || '').split(',').map(s => s.trim()).filter(Boolean)) {
    if (raw.startsWith('@')) (GROUPS[raw.slice(1)] || []).forEach(x => out.add(x));
    else if (raw.startsWith('-')) out.delete(raw.slice(1));
    else out.add(raw);
  }
  return out;
}

function enterChapter(page) {
  const ch = page.dataset.ch;
  if (curCh && hooks[curCh]?.exit) hooks[curCh].exit();
  clearPackets();
  clearPulses();
  curCh = ch;
  if (!HAS3D) return;
  const show = expandShow(page.dataset.show);
  for (const e of ents.values()) e.target = show.has(e.id) ? 1 : 0;
  const cam = (page.dataset.cam || '0,13,24,-1,1,1').split(',').map(Number);
  flyTo(cam);
  controls.autoRotate = page.hasAttribute('data-rotate') && !REDUCED;
  hooks[ch]?.enter?.();
  runner.load(page);
  runner.setPaused(false);
  renderLegend(page.dataset.legend);
}

const LEGEND = {
  host: ['Host', COL.host], client: ['Client', COL.client], server: ['Server', COL.server], llm: ['LLM', COL.llm],
  ext: ['Внешняя система', COL.ext], user: ['Пользователь', COL.user], auth: ['OAuth', COL.auth], threat: ['Угроза', COL.threat],
  req: ['запрос', KIND.req], res: ['ответ', KIND.res], note: ['уведомление', KIND.note], err: ['ошибка', KIND.err], task: ['задача', KIND.task],
};
const LEGEND_BIZ = {
  host: 'ИИ-приложение', client: 'Подключение', server: 'Коннектор', llm: 'Модель ИИ', ext: 'Ваша система',
  user: 'Сотрудник', auth: 'Доступ', threat: 'Риск', req: 'запрос', res: 'ответ', note: 'сигнал', err: 'отказ', task: 'операция',
};
function renderLegend(list) {
  const el = $('#legend');
  el.innerHTML = '';
  for (const k of (list || 'req,res,note').split(',').map(s => s.trim())) {
    if (!LEGEND[k]) continue;
    const [tn, c] = LEGEND[k];
    const n = mode === 'biz' ? (LEGEND_BIZ[k] || tn) : tn;
    const i = document.createElement('span');
    i.style.setProperty('--c', hex(c));
    i.textContent = n;
    el.appendChild(i);
  }
}

// Подписи сцены для версии «для бизнеса»: [заголовок, подзаголовок]
const BIZ = {
  host: ['ИИ-приложение', 'чат, ассистент, агент'], llm: ['Модель ИИ', 'рассуждает и выбирает действие'],
  c1: ['Подключение 1'], c2: ['Подключение 2'], c3: ['Подключение 3'],
  s1: ['Коннектор · документы', 'на компьютере сотрудника'], s2: ['Коннектор · учётная система', 'внутри периметра'],
  s3: ['Коннектор · облачный сервис', 'у поставщика SaaS'],
  e1: ['Документы', 'файлы'], e2: ['Учётная система', 'БД, ERP'], e3: ['Облачный сервис', 'API поставщика'],
  user: ['Сотрудник'], zoneLocal: ['Периметр компании', 'внутренние системы'], zoneRemote: ['Облако', 'внешние сервисы'],
  as: ['Корпоративный вход', 'SSO: выдаёт доступ'], prm: ['Паспорт коннектора', 'где получать доступ'],
  asmeta: ['Правила входа', 'адреса и требования'], token: ['Пропуск', 'только к этому коннектору'],
  prim_tools: ['Действия', 'решает модель'], prim_res: ['Данные', 'подбирает приложение'], prim_prompts: ['Сценарии', 'выбирает сотрудник'],
  t_poison: ['Непроверенный коннектор', 'скрытые инструкции'], t_inject: ['Вредные данные', 'текст выдаёт себя за команду'],
  t_pass: ['Пропуск уходит дальше', 'нарушены границы доступа'], t_deputy: ['Посредник без согласия', 'действует от чужого имени'],
  t_ssrf: ['Подмена адресов', 'путь во внутреннюю сеть'], t_local: ['Установка без проверки', 'запуск чужой программы'],
  t_session: ['Чужой номер операции', 'нет проверки владельца'], shield: ['Политика согласий', 'что разрешено ассистенту'],
  task: ['Долгая операция', 'в работе'], uiapp: ['Интерактивный отчёт', 'прямо в чате'], skill: ['Методичка', 'инструкция для агента'],
  life_c: ['Подключение', 'каждый запрос самодостаточен'], life_lb: ['Балансировщик', 'распределяет нагрузку'],
  life_r1: ['Копия коннектора A'], life_r2: ['Копия коннектора B'], life_r3: ['Копия коннектора C'],
  ch_host: ['ИИ-приложение'], ch_llm: ['Модель ИИ'], ch_cl: ['Подключение'], ch_srv: ['Коннектор', 'надстройка над системами'],
  ch_api1: ['Система 1 · клиенты', 'поиск по ИНН'], ch_api2: ['Система 2 · договоры', 'договоры клиента'],
  ch_api3: ['Система 3 · расчёты', 'расчёт задолженности'],
  'ch_thin#0': ['найти клиента'], 'ch_thin#1': ['договоры'], 'ch_thin#2': ['расчёт долга'], 'ch_fat#0': ['задолженность клиента'],
  d1: ['Приём запросов', 'канал связи и шифрование'], d2: ['Проверка доступа', 'кто спрашивает и что ему можно'],
  d3: ['Стандарт MCP', 'общий язык с ИИ-приложениями'], d4: ['Каталог операций', 'действия, данные, сценарии'],
  d5: ['Бизнес-логика', 'правила и связь с системами'], d_obs: ['Контроль и аудит', 'журнал: кто, что, когда'],
  d_client: ['ИИ-приложение'], d_ext: ['Учётные системы', 'существующие'],
  eco_spec: ['Открытый стандарт MCP', 'Linux Foundation'], eco_registry: ['Каталог коннекторов', 'официальный реестр'],
  eco_inspector: ['Инструменты проверки', 'тестирование коннекторов'], eco_hosts: ['ИИ-приложения', 'разных поставщиков'],
  eco_servers: ['Коннекторы', 'тысячи готовых'],
  why_custom: ['3 × 4 = 12 отдельных интеграций', 'каждая — свой проект'],
  why_mcp: ['3 + 4 = 7 компонентов', 'один стандарт для всех'],
};
function applyLabels() {
  for (const e of ents.values()) {
    for (const l of e.labels) {
      const el = l.element;
      const t = (mode === 'biz' && BIZ[el.dataset.key]) || el._t;
      if (!t) continue;
      el.querySelector('b').textContent = t[0];
      let sp = el.querySelector('span');
      if (t[1]) {
        if (!sp) { sp = document.createElement('span'); el.appendChild(sp); }
        sp.textContent = t[1];
        sp.hidden = false;
      } else if (sp) sp.hidden = true;
    }
  }
}

const pagesAll = $$('article.page');
const pageMode = p => p.dataset.mode || 'tech';
let pages = [];
let mode = 'tech';
const book = $('#book');
let cur = -1;

function setMode(m, target = null) {
  mode = m;
  document.documentElement.dataset.mode = m;
  try { localStorage.setItem('mcp3d-mode', m); } catch (e) { /* приватный режим */ }
  pagesAll.forEach(p => { p.hidden = true; p.classList.remove('flip-out', 'flip-out-back', 'flip-in', 'flip-in-back'); });
  pages = pagesAll.filter(p => pageMode(p) === m);
  $$('.mode-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  buildTOC();
  applyLabels();
  cur = -1;
  go(Math.max(0, pages.indexOf(target)), true);
}
// при переключении стараемся открыть соответствующую главу другой версии
function switchMode(m) {
  if (m === mode) return;
  const here = pages[cur];
  let target = null;
  if (here && m === 'biz') {
    target = pagesAll.find(p => pageMode(p) === 'biz' && (p.dataset.pair || '').split(',').includes(here.id)) || null;
  } else if (here) {
    const id = (here.dataset.pair || '').split(',')[0];
    target = id ? document.getElementById(id) : null;
  }
  setMode(m, target);
}

function buildTOC() {
  const list = $('#tocList');
  const coverList = $('.cover-toc', pages[0]);
  list.innerHTML = '';
  if (coverList) coverList.innerHTML = '';
  pages.forEach((p, i) => {
    const kicker = $('.kicker', p)?.textContent || '';
    const title = $('h1, h2', p)?.textContent || '';
    for (const target of [list, coverList]) {
      if (!target || (target === coverList && i === 0)) continue;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + p.id;
      a.innerHTML = `<span class="toc-k"></span><span class="toc-t"></span><span class="toc-n">${i + 1}</span>`;
      a.querySelector('.toc-k').textContent = kicker;
      a.querySelector('.toc-t').textContent = title;
      a.addEventListener('click', ev => { ev.preventDefault(); go(i); closeTOC(); });
      li.appendChild(a);
      target.appendChild(li);
    }
  });
}

function go(i, instant = false) {
  i = clamp(i, 0, pages.length - 1);
  if (i === cur) return;
  const dir = i > cur ? 1 : -1;
  const prev = pages[cur];
  const next = pages[i];
  cur = i;
  if (prev && !instant && !REDUCED) {
    prev.classList.add(dir > 0 ? 'flip-out' : 'flip-out-back');
    setTimeout(() => {
      prev.hidden = true;
      prev.classList.remove('flip-out', 'flip-out-back');
      showPage(next, dir);
    }, 260);
  } else {
    if (prev) prev.hidden = true;
    showPage(next, 0);
  }
  history.replaceState(null, '', '#' + next.id);
  $('#pageNo').textContent = `${i + 1} / ${pages.length}`;
  $('#progress').style.width = `${((i + 1) / pages.length) * 100}%`;
  $('#prev').disabled = i === 0;
  $('#next').disabled = i === pages.length - 1;
  $('#tocList')?.querySelectorAll('a').forEach((a, j) => a.classList.toggle('cur', j === i));
  $('#chapterChip').textContent = ($('.kicker', next)?.textContent || '') + ' · ' + ($('h1, h2', next)?.textContent || '');
  enterChapter(next);
}
function showPage(p, dir) {
  p.hidden = false;
  book.scrollTop = 0;
  if (dir) {
    p.classList.add(dir > 0 ? 'flip-in' : 'flip-in-back');
    setTimeout(() => p.classList.remove('flip-in', 'flip-in-back'), 420);
  }
}

const stageState = () => document.documentElement.dataset.stage || 'normal';
function setStage(v) {
  if (v === 'normal') delete document.documentElement.dataset.stage;
  else document.documentElement.dataset.stage = v;
  try { localStorage.setItem('mcp3d-stage', v); } catch (e) { /* приватный режим */ }
  const t = $('#dockToggle');
  if (t) t.setAttribute('aria-expanded', String(v !== 'hidden'));
  const z = $('#dockSize');
  if (z) z.setAttribute('aria-label', v === 'large' ? 'Уменьшить схему' : 'Увеличить схему');
}

function openTOC() { $('#toc').classList.add('open'); $('#toc').setAttribute('aria-hidden', 'false'); }
function closeTOC() { $('#toc').classList.remove('open'); $('#toc').setAttribute('aria-hidden', 'true'); }

function setupUI() {
  $('#prev').addEventListener('click', () => go(cur - 1));
  $('#next').addEventListener('click', () => go(cur + 1));
  $$('[data-go-next]').forEach(b => b.addEventListener('click', () => go(cur + 1)));
  $$('[data-set-mode]').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.setMode)));
  $$('.mode-switch button').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode)));
  $('#tocBtn').addEventListener('click', openTOC);
  $('#tocClose').addEventListener('click', closeTOC);
  $('#toc').addEventListener('click', e => { if (e.target.id === 'toc') closeTOC(); });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
    if (e.key === 'Escape') closeTOC();
  });
  book.addEventListener('wheel', () => { lastUserScroll = performance.now(); }, { passive: true });
  book.addEventListener('touchmove', () => { lastUserScroll = performance.now(); }, { passive: true });
  book.addEventListener('click', e => {
    const li = e.target.closest('ol.steps > li');
    if (!li || !HAS3D) return;
    const idx = runner.steps.findIndex(s => s.el === li);
    if (idx >= 0) runner.jump(idx);
  });
  $('#btnPlay').addEventListener('click', () => runner.setPaused(!runner.paused));
  $$('[data-proxy]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.proxy).click()));
  $('#dockToggle').addEventListener('click', () => setStage(stageState() === 'hidden' ? 'normal' : 'hidden'));
  $('#dockSize').addEventListener('click', () => setStage(stageState() === 'large' ? 'normal' : 'large'));
  $('#btnReplay').addEventListener('click', () => runner.restart());
  $('#btnView').addEventListener('click', () => flyTo(camPreset));
  $('#btnRotate').addEventListener('click', e => {
    controls.autoRotate = !controls.autoRotate;
    e.currentTarget.classList.toggle('on', controls.autoRotate);
  });
  $('#themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const t = html.dataset.theme === 'dark' ? 'light' : 'dark';
    html.dataset.theme = t;
    try { localStorage.setItem('mcp3d-theme', t); } catch (e) { /* приватный режим */ }
    if (HAS3D) applyTheme();
  });
  window.addEventListener('hashchange', () => {
    const p = pagesAll.find(x => '#' + x.id === location.hash);
    if (!p) return;
    if (pageMode(p) !== mode) setMode(pageMode(p), p);
    else go(pages.indexOf(p));
  });
}

// ── старт
pagesAll.forEach(p => { p.hidden = true; });
setupUI();
if (HAS3D) {
  applyTheme();
  buildWorld();
  new ResizeObserver(resize).observe(stage);
  resize();
  frame();
}
const hashPage = pagesAll.find(p => '#' + p.id === location.hash) || null;
let savedMode = null;
try { savedMode = localStorage.getItem('mcp3d-mode'); } catch (e) { /* приватный режим */ }
setMode(hashPage ? pageMode(hashPage) : (savedMode === 'biz' ? 'biz' : 'tech'), hashPage);
if (HAS3D && camPreset) flyTo(camPreset, true);
document.documentElement.classList.add('ready');
