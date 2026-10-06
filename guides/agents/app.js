// Как устроен ИИ-агент — движок книги: 3D-сцена (three.js) + страницы-главы.
// Движок унаследован от гида «MCP в 3D». Сцена читает из разметки:
//   data-show  — какие объекты видны в главе (id или @группа)
//   data-focus — какие из них в фокусе (остальные приглушены)
//   data-cam   — позиция камеры и точка взгляда "px,py,pz,tx,ty,tz"
//   ol.steps > li[data-from|data-to|data-path|data-at|data-kind|data-label|data-do|data-count]
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBUG = /[?&]debug/.test(location.search);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const COL = {
  model: 0xd946ef, ctx: 0x3b82f6, instr: 0xec4899, tools: 0xf97316, gate: 0x8b5cf6,
  check: 0x06b6d4, memory: 0x10b981, stop: 0xef4444, log: 0x94a3b8, user: 0xcbd5e1,
  world: 0xf59e0b, ring: 0x64748b,
};
const KIND = {
  req: 0x60a5fa, res: 0x34d399, think: 0xe879f9, err: 0xf87171, note: 0xa3a3a3, user: 0xe2e8f0,
};
const hex = c => '#' + new THREE.Color(c).getHexString();

// ── Языки: строки сцены и интерфейса движка. Тексты глав живут в HTML каждой версии.
const LANG = ['en', 'de'].includes(document.documentElement.lang) ? document.documentElement.lang : 'ru';
const STR = {
  ru: {
    labels: {
      model: ['Модель', 'LLM: текст → текст'], ring: ['Агентный цикл', 'agent loop'], ctx: ['Контекст', 'контекстное окно'],
      press: ['Compaction', 'сжатие контекста'], gate: ['Разрешения', 'permissions'], tools: ['Инструменты', 'tool calls'],
      check: ['Проверка', 'хуки, тесты, evaluator'], log: ['Логи', 'трейсы и стоимость'], stop: ['Лимиты', 'итерации, токены, деньги'],
      world: ['Внешний мир', 'файлы, сайты, системы'], person: ['Человек', 'ставит задачу'],
      instr: ['Инструкции', 'системный промпт, AGENTS.md'], memory: ['Память', 'между сессиями'],
      t_chat: ['Чат-ассистент', 'ChatGPT, Claude, GigaChat'], t_embed: ['Встроенный агент', 'поддержка, личный кабинет'],
      t_local: ['Локальный агент', 'Claude Code, Codex CLI, Cursor'], t_cloud: ['Облачный агент', 'Codex Cloud, Devin, Jules'],
      t_sdk: ['SDK и фреймворки', 'Agent SDK, Agent Framework'], t_orch: ['Оркестратор', 'multi-agent'],
      cmpA: ['Harness A', 'та же модель'], cmpB: ['Harness B', 'та же модель'],
    },
    cmp: { lc: ['до доработки', 'после доработки'], anthA: ['не работает', '$9 · 20 минут'], anthB: ['работает', '$200 · 6 часов'], same: 'та же модель' },
    pct: v => v.toFixed(1).replace('.', ',') + '%',
    ambient: ['открыть файл', 'найти в интернете', 'посчитать', 'прочитать CRM'],
    legend: {
      model: 'Модель', ctx: 'Контекст', instr: 'Инструкции', tools: 'Инструменты', gate: 'Разрешения', check: 'Проверка',
      memory: 'Память', stop: 'Лимиты', log: 'Логи', user: 'Человек', world: 'Внешний мир',
      req: 'действие', res: 'результат', think: 'tool call / ответ модели', err: 'ошибка / стоп', note: 'событие',
    },
    play: 'Продолжить анимацию', pause: 'Пауза', grow: 'Увеличить схему', shrink: 'Уменьшить схему',
    toc: [/^Глава /, 'Гл. '], ymTitle: 'Как устроен ИИ-агент',
  },
  en: {
    labels: {
      model: ['Model', 'LLM: text → text'], ring: ['Agent loop', 'iteration after iteration'], ctx: ['Context', 'context window'],
      press: ['Compaction', 'context compression'], gate: ['Permissions', 'what runs without approval'], tools: ['Tools', 'tool calls'],
      check: ['Verification', 'hooks, tests, evaluator'], log: ['Logs', 'traces and cost'], stop: ['Limits', 'iterations, tokens, money'],
      world: ['Outside world', 'files, websites, systems'], person: ['Human', 'sets the task'],
      instr: ['Instructions', 'system prompt, AGENTS.md'], memory: ['Memory', 'across sessions'],
      t_chat: ['Chat assistant', 'ChatGPT, Claude, Gemini'], t_embed: ['Embedded agent', 'support bot, in-app assistant'],
      t_local: ['Local agent', 'Claude Code, Codex CLI, Cursor'], t_cloud: ['Cloud agent', 'Codex Cloud, Devin, Jules'],
      t_sdk: ['SDKs & frameworks', 'Agent SDK, Agent Framework'], t_orch: ['Orchestrator', 'multi-agent'],
      cmpA: ['Harness A', 'same model'], cmpB: ['Harness B', 'same model'],
    },
    cmp: { lc: ['before', 'after harness work'], anthA: ['broken', '$9 · 20 minutes'], anthB: ['works', '$200 · 6 hours'], same: 'same model' },
    pct: v => v.toFixed(1) + '%',
    ambient: ['open file', 'web search', 'calculate', 'read CRM'],
    legend: {
      model: 'Model', ctx: 'Context', instr: 'Instructions', tools: 'Tools', gate: 'Permissions', check: 'Verification',
      memory: 'Memory', stop: 'Limits', log: 'Logs', user: 'Human', world: 'Outside world',
      req: 'action', res: 'result', think: 'tool call / model output', err: 'error / stop', note: 'event',
    },
    play: 'Resume animation', pause: 'Pause', grow: 'Enlarge scene', shrink: 'Shrink scene',
    toc: [/^Chapter /, 'Ch. '], ymTitle: 'How an AI agent works',
  },
  de: {
    labels: {
      model: ['Modell', 'LLM: Text → Text'], ring: ['Agent Loop', 'Iteration für Iteration'], ctx: ['Kontext', 'Kontextfenster'],
      press: ['Compaction', 'Kontext komprimieren'], gate: ['Berechtigungen', 'Permissions'], tools: ['Tools', 'Tool Calls'],
      check: ['Prüfung', 'Hooks, Tests, Evaluator'], log: ['Logs', 'Traces und Kosten'], stop: ['Limits', 'Iterationen, Tokens, Geld'],
      world: ['Außenwelt', 'Dateien, Websites, Systeme'], person: ['Mensch', 'stellt die Aufgabe'],
      instr: ['Anweisungen', 'System-Prompt, AGENTS.md'], memory: ['Memory', 'über Sessions hinweg'],
      t_chat: ['Chat-Assistent', 'ChatGPT, Claude, Gemini'], t_embed: ['Eingebetteter Agent', 'Support-Bot, In-App-Assistent'],
      t_local: ['Lokaler Agent', 'Claude Code, Codex CLI, Cursor'], t_cloud: ['Cloud-Agent', 'Codex Cloud, Devin, Jules'],
      t_sdk: ['SDKs & Frameworks', 'Agent SDK, Agent Framework'], t_orch: ['Orchestrator', 'Multi-Agent'],
      cmpA: ['Harness A', 'gleiches Modell'], cmpB: ['Harness B', 'gleiches Modell'],
    },
    cmp: { lc: ['vorher', 'nach Harness-Arbeit'], anthA: ['kaputt', '9 $ · 20 Minuten'], anthB: ['funktioniert', '200 $ · 6 Stunden'], same: 'gleiches Modell' },
    pct: v => v.toFixed(1).replace('.', ',') + ' %',
    ambient: ['Datei öffnen', 'Websuche', 'berechnen', 'CRM lesen'],
    legend: {
      model: 'Modell', ctx: 'Kontext', instr: 'Anweisungen', tools: 'Tools', gate: 'Berechtigungen', check: 'Prüfung',
      memory: 'Memory', stop: 'Limits', log: 'Logs', user: 'Mensch', world: 'Außenwelt',
      req: 'Aktion', res: 'Ergebnis', think: 'Tool Call / Modellausgabe', err: 'Fehler / Stopp', note: 'Ereignis',
    },
    play: 'Animation fortsetzen', pause: 'Pause', grow: 'Szene vergrößern', shrink: 'Szene verkleinern',
    toc: [/^Kapitel /, 'Kap. '], ymTitle: 'Wie ein KI-Agent funktioniert',
  },
};
const L = STR[LANG];
const LB = id => L.labels[id];

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
camera.position.set(0, 16, 22);
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
  controls.minDistance = 4;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotateSpeed = 0.5;
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

function applyTheme() {
  const cs = getComputedStyle(document.documentElement);
  const bg = new THREE.Color(cs.getPropertyValue('--scene-bg').trim() || '#111');
  const g1 = new THREE.Color(cs.getPropertyValue('--scene-grid').trim() || '#333');
  const g2 = new THREE.Color(cs.getPropertyValue('--scene-grid-2').trim() || '#222');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 40, 100);
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  grid = new THREE.GridHelper(160, 80, g1, g2);
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
const glowTex = makeGlowTexture();

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
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

const R = 7; // радиус кольца-цикла
const rad = a => a * Math.PI / 180;
const ringPos = (a, r = R, y = 0) => new THREE.Vector3(r * Math.sin(rad(a)), y, r * Math.cos(rad(a)));

function brain(r = 0.9) {
  const g = shape(new THREE.IcosahedronGeometry(r, 1), COL.model, { fill: 0.22, edge: 0.85, threshold: 1 });
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
function database(color) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = shape(new THREE.CylinderGeometry(0.7, 0.7, 0.44, 28), color, { fill: 0.3, threshold: 30 });
    c.position.y = 0.26 + i * 0.52;
    g.add(c);
  }
  return g;
}
function globe(color, r = 0.75) {
  const g = shape(new THREE.SphereGeometry(r, 16, 10), color, { fill: 0.16, edge: 0.75, threshold: 1 });
  g.userData.spin = 0.25;
  return g;
}
function papers(color, n = 3) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const p = box(1.0, 1.3, 0.05, color, { fill: 0.35 });
    p.position.set(-0.2 + i * 0.2, 0.7 + i * 0.05, -i * 0.25);
    for (let k = 0; k < 4; k++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.6 - (k === 3 ? 0.25 : 0), 0.05, 0.01), M(color, 0.9, 0.5));
      line.position.set(-0.08, 0.35 - k * 0.2, 0.035);
      p.add(line);
    }
    g.add(p);
  }
  return g;
}
function gear(color) {
  const g = new THREE.Group();
  g.add(shape(new THREE.TorusGeometry(0.5, 0.15, 10, 32), color, { fill: 0.7, edge: 0, emissive: 0.4 }));
  for (let i = 0; i < 8; i++) {
    const t = box(0.24, 0.24, 0.24, color, { fill: 0.75, edge: 0 });
    const a = (i / 8) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0);
    t.rotation.z = a;
    g.add(t);
  }
  g.userData.spinZ = 0.8;
  return g;
}

// «комната» модели: стеклянный куб без окон
function room() {
  const g = box(3.4, 3.0, 3.4, COL.model, { fill: 0.035, edge: 0.4 });
  g.position.y = 1.5;
  return g;
}

// контекст: рамка контекстного окна и стопка карточек
const CARDS = 12;
const CARD_COLORS = [COL.instr, COL.user, COL.tools, COL.tools, COL.model, COL.tools, COL.tools, COL.model, COL.tools, COL.tools, COL.tools, COL.tools];
const SUMMARY = 0x22c55e;
function ctxDesk() {
  const g = new THREE.Group();
  const plate = box(2.9, 0.12, 1.4, COL.ctx, { fill: 0.4 });
  plate.position.y = 0.06;
  const frameGeo = new THREE.BoxGeometry(2.9, 2.6, 1.4);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(frameGeo), Lm(COL.ctx, 0.55));
  frame.position.y = 1.42;
  const glass = new THREE.Mesh(frameGeo, M(COL.ctx, 0.05, 0.2, { side: THREE.DoubleSide }));
  glass.position.y = 1.42;
  g.add(plate, frame, glass);
  g.userData.cards = [];
  for (let i = 0; i < CARDS; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: CARD_COLORS[i], emissive: CARD_COLORS[i], emissiveIntensity: 0.35, transparent: true, opacity: 0.85, roughness: 0.5,
    });
    mat.userData.base = 0.85;
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 1.05), mat);
    c.position.y = 0.22 + i * 0.2;
    c.rotation.y = (Math.random() - 0.5) * 0.08;
    c.visible = false;
    g.add(c);
    g.userData.cards.push(c);
  }
  return g;
}
// пресс compaction над контекстом
function press() {
  const g = new THREE.Group();
  const plate = box(3.1, 0.2, 1.6, COL.memory, { fill: 0.55, emissive: 0.45 });
  const rodL = box(0.12, 1.2, 0.12, COL.memory, { fill: 0.6, edge: 0 });
  const rodR = box(0.12, 1.2, 0.12, COL.memory, { fill: 0.6, edge: 0 });
  rodL.position.set(-1.1, 0.7, 0); rodR.position.set(1.1, 0.7, 0);
  g.add(plate, rodL, rodR);
  return g;
}
// шлагбаум разрешений; перекладина поднимается при «можно»
function gateObj() {
  const g = new THREE.Group();
  const p1 = box(0.24, 1.5, 0.24, COL.gate, { fill: 0.75, edge: 0 });
  const p2 = box(0.24, 1.1, 0.24, COL.gate, { fill: 0.75, edge: 0 });
  p1.position.set(-1.0, 0.75, 0);
  p2.position.set(1.05, 0.55, 0);
  const pivot = new THREE.Group();
  pivot.position.set(-1.0, 1.2, 0);
  const bar = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const seg = box(0.42, 0.16, 0.16, k % 2 ? 0xf8fafc : COL.gate, { fill: 0.9, edge: 0, emissive: 0.45 });
    seg.position.x = 0.21 + k * 0.42;
    bar.add(seg);
  }
  pivot.add(bar);
  g.add(p1, p2, pivot);
  g.userData.pivot = pivot;
  g.userData.open = 0;
  g.userData.openK = 0;
  return g;
}
function toolsObj() {
  const g = new THREE.Group();
  const kit = box(1.5, 0.6, 0.9, COL.tools, { fill: 0.35 });
  kit.position.y = 0.3;
  const handle = shape(new THREE.TorusGeometry(0.3, 0.05, 8, 20, Math.PI), COL.tools, { fill: 0.8, edge: 0 });
  handle.position.y = 0.6;
  const gr = gear(COL.tools);
  gr.position.y = 1.65;
  g.add(kit, handle, gr);
  return g;
}
function worldObj() {
  const g = new THREE.Group();
  g.add(at(database(COL.world), -1.1, 0, 0));
  const gl = globe(COL.world);
  gl.position.set(0.7, 1.0, 0.5);
  g.add(gl);
  g.add(at(papers(COL.world, 2), 0.6, 0, -0.9));
  return g;
}
function checkObj() {
  const g = new THREE.Group();
  const lens = shape(new THREE.TorusGeometry(0.48, 0.09, 10, 36), COL.check, { fill: 0.85, edge: 0, emissive: 0.5 });
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.44, 32), M(COL.check, 0.15, 0.4, { side: THREE.DoubleSide }));
  const handle = box(0.14, 0.75, 0.14, COL.check, { fill: 0.85, edge: 0 });
  handle.position.set(0.48, -0.55, 0);
  handle.rotation.z = 0.7;
  const mag = new THREE.Group();
  mag.add(lens, glass, handle);
  mag.position.y = 1.55;
  mag.userData.spin = 0.7;
  const stand = box(0.9, 0.3, 0.9, COL.check, { fill: 0.3 });
  stand.position.y = 0.15;
  g.add(mag, stand);
  return g;
}
function logObj() {
  const g = new THREE.Group();
  const screen = box(1.7, 1.15, 0.08, COL.log, { fill: 0.3 });
  screen.position.y = 1.45;
  for (let k = 0; k < 5; k++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.2 - (k % 3) * 0.25, 0.05, 0.01), M(0xffffff, 0.75, 0.5));
    l.position.set(-0.1 - (k % 3) * 0.12, 0.38 - k * 0.18, 0.05);
    screen.add(l);
  }
  const leg = box(0.12, 0.85, 0.12, COL.log, { fill: 0.6, edge: 0 });
  leg.position.y = 0.45;
  const foot = box(0.8, 0.06, 0.5, COL.log, { fill: 0.5, edge: 0 });
  foot.position.y = 0.03;
  g.add(screen, leg, foot);
  return g;
}
function stopObj() {
  const g = new THREE.Group();
  const pole = box(0.12, 1.4, 0.12, COL.log, { fill: 0.6, edge: 0 });
  pole.position.y = 0.7;
  const sign = shape(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 8), COL.stop, { fill: 0.85, edge: 0.9, emissive: 0.5, threshold: 30 });
  sign.rotation.x = Math.PI / 2;
  sign.rotation.y = Math.PI / 8;
  sign.position.y = 1.85;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.02), M(0xffffff, 0.95, 0.6));
  band.position.set(0, 1.85, 0.07);
  g.add(pole, sign, band);
  return g;
}
function shelf() {
  const g = new THREE.Group();
  const base = box(1.9, 0.12, 0.7, COL.memory, { fill: 0.5, edge: 0 });
  base.position.y = 0.06;
  g.add(base);
  const hs = [1.1, 1.3, 0.95, 1.2];
  hs.forEach((h, i) => {
    const b = box(0.32, h, 0.6, i % 2 ? 0x34d399 : COL.memory, { fill: 0.55, edge: 0.6 });
    b.position.set(-0.6 + i * 0.38, 0.12 + h / 2, 0);
    if (i === 3) { b.rotation.z = -0.28; b.position.x += 0.12; }
    g.add(b);
  });
  return g;
}
function ringTrack() {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 8, 200), M(COL.ring, 0.75, 0.5));
  t.rotation.x = Math.PI / 2;
  t.position.y = 0.06;
  g.add(t);
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 12; k++) {
    const a = k * 30 + 15;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 10), M(COL.ring, 0.9, 0.6));
    cone.position.copy(ringPos(a, R, 0.08));
    const tan = new THREE.Vector3(Math.cos(rad(a)), 0, -Math.sin(rad(a)));
    cone.quaternion.setFromUnitVectors(up, tan);
    g.add(cone);
  }
  const runner = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x93c5fd, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  runner.material.userData.base = 0.9;
  runner.scale.setScalar(1.1);
  g.add(runner);
  g.userData.runner = runner;
  return g;
}

// мини-диорамы для главы о типах harness и для сравнения
function mini(kind) {
  const g = new THREE.Group();
  g.add(shape(new THREE.CylinderGeometry(3.3, 3.3, 0.05, 48), COL.ring, { fill: 0.05, edge: 0.3, threshold: 30 }));
  const r = 2.1;
  const core = brain(0.5);
  core.position.y = 1.1;
  g.add(core);
  const ring = (arc = Math.PI * 2, o = 0.8, y = 0.22, rr = r) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.035, 6, 96, arc), M(COL.ring, o, 0.5));
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    g.add(t);
    return t;
  };
  const bead = (a, color, rr = r, y = 0.45, s = 0.24) => {
    const b = box(s * 1.5, s * 2, s * 1.5, color, { fill: 0.8, edge: 0, emissive: 0.4 });
    b.position.set(rr * Math.sin(a), y, rr * Math.cos(a));
    g.add(b);
    return b;
  };
  const FULL = [COL.ctx, COL.gate, COL.tools, COL.check, COL.log, COL.stop];
  const man = (x, z, s = 0.7) => { const p = person(); p.scale.setScalar(s); p.position.set(x, 0, z); g.add(p); };
  if (kind === 'chat') {
    ring(Math.PI * 0.55, 0.45);
    bead(0.2, COL.ctx); bead(1.2, COL.tools);
    man(0.9, 1.0, 0.75);
  } else if (kind === 'embed' || kind === 'thin') {
    ring();
    [0, 2.1, 4.2].forEach((a, i) => bead(a, [COL.ctx, COL.tools, COL.gate][i]));
    if (kind === 'embed') {
      const fr = box(5.2, 3.0, 0.06, COL.instr, { fill: 0.05, edge: 0.6 });
      fr.position.set(0, 1.5, -2.7);
      g.add(fr);
      const bar = box(5.2, 0.3, 0.06, COL.instr, { fill: 0.45, edge: 0 });
      bar.position.set(0, 2.85, -2.68);
      g.add(bar);
    }
  } else if (kind === 'local' || kind === 'full') {
    ring();
    FULL.forEach((c, i) => bead((i / 6) * Math.PI * 2, c));
    if (kind === 'local') {
      man(0, 3.0, 0.75);
      const lap = box(1.2, 0.08, 0.8, COL.ctx, { fill: 0.5, edge: 0.6 });
      lap.position.set(-0.9, 0.3, 2.7);
      g.add(lap);
    }
  } else if (kind === 'cloud') {
    ring();
    FULL.forEach((c, i) => bead((i / 6) * Math.PI * 2, c));
    const glass = box(5.4, 2.4, 5.4, COL.ctx, { fill: 0.04, edge: 0.45 });
    glass.position.y = 1.2;
    g.add(glass);
    const cl = new THREE.Group();
    [[-0.7, 0, 0.55], [0.15, 0.2, 0.75], [0.95, 0, 0.5]].forEach(([x, y, rr]) => {
      const s = shape(new THREE.SphereGeometry(rr, 16, 12), 0xe2e8f0, { fill: 0.3, edge: 0 });
      s.position.set(x, y, 0);
      cl.add(s);
    });
    cl.position.y = 3.15;
    g.add(cl);
  } else if (kind === 'sdk') {
    FULL.forEach((c, i) => bead((i / 6) * Math.PI * 2, c, r + 0.6, 0.8 + (i % 2) * 0.7, 0.3));
    for (let k = 0; k < 3; k++) {
      const t = ring(1.3, 0.75, 0.25 + k * 0.35);
      t.rotation.z = k * 2.1;
    }
  } else if (kind === 'orch') {
    core.position.y = 2.0;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const p = new THREE.Vector3(2.2 * Math.sin(a), 0.7, 2.2 * Math.cos(a));
      const sb = brain(0.3);
      sb.position.copy(p);
      g.add(sb);
      const tr = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 6, 48), M(COL.ring, 0.8, 0.5));
      tr.rotation.x = Math.PI / 2;
      tr.position.set(p.x, 0.2, p.z);
      g.add(tr);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.7, 0), p]);
      g.add(new THREE.Line(geo, Lm(COL.model, 0.6)));
    }
  }
  return g;
}

/* ─────────────────────────── 3D: сущности сцены ─────────────────────────── */

const ents = new Map();

function makeLabel(text, sub, color, cls = '') {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  el.style.setProperty('--c', hex(color));
  const b = document.createElement('b');
  b.textContent = text;
  el.appendChild(b);
  if (sub !== undefined && sub !== null) {
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
    else l.position.set(0, (b.isEmpty() ? 0 : b.max.y - obj.position.y) + 0.3, 0);
    l.center.set(...(o.labelCenter || [0.5, 1]));
    obj.add(l);
    e.labels.push(l);
  }
  e.anchor = o.anchor
    ? new THREE.Vector3(...o.anchor)
    : (b.isEmpty() ? obj.position.clone() : b.getCenter(new THREE.Vector3()));
  e.name = o.label || id;
  applyAlpha(e);
  ents.set(id, e);
  return e;
}

function applyAlpha(e) {
  const a = e.alpha;
  e.obj.visible = a > 0.01;
  for (const m of e.mats) m.opacity = m.userData.base * a;
  for (const l of e.labels) l.element.style.opacity = a.toFixed(3);
}

function setSub(id, text) {
  const l = ents.get(id)?.labels[0];
  const sp = l?.element.querySelector('span');
  if (sp && sp.textContent !== text) sp.textContent = text;
}

// кривые между якорями: дуга, приподнятая над полом
const curveCache = new Map();
function curveFor(a, b) {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const rev = !(a < b);
  if (!curveCache.has(key)) {
    const [p, q] = key.split('|').map(id => ents.get(id).anchor);
    const mid = p.clone().add(q).multiplyScalar(0.5);
    mid.y += p.distanceTo(q) * 0.12;
    curveCache.set(key, new THREE.QuadraticBezierCurve3(p.clone(), mid, q.clone()));
  }
  return { curve: curveCache.get(key), rev };
}

// станции на кольце: угол в градусах (0 — к зрителю, 90 — вправо)
const RING = { ctx: 0, gate: 60, tools: 120, check: 180, log: -120, stop: -60 };
const WORLD_A = 98;
const wpIds = new Map();
function wp(a) {
  const k = Math.round(a);
  if (!wpIds.has(k)) {
    const id = `w${k}`;
    ent(id, at(new THREE.Object3D(), ...ringPos(k, R, 1.0).toArray()), { anchor: ringPos(k, R, 1.0).toArray() });
    wpIds.set(k, id);
  }
  return wpIds.get(k);
}
// путь по станциям: между соседними станциями кольца пакет идёт по дуге
function expandPath(ids) {
  const out = [];
  ids.forEach((id, i) => {
    if (i > 0 && id in RING && ids[i - 1] in RING) {
      const a0 = RING[ids[i - 1]];
      const d = ((RING[id] - a0 + 540) % 360) - 180;
      const n = Math.max(1, Math.round(Math.abs(d) / 15));
      for (let k = 1; k < n; k++) out.push(wp(a0 + (d * k) / n));
    }
    out.push(id);
  });
  return out;
}

function buildWorld() {
  ent('room', room(), {});
  const md = brain(1.0);
  md.position.y = 1.6;
  ent('model', md, { label: LB('model')[0], sub: LB('model')[1], color: COL.model });

  const ring = ringTrack();
  ent('ring', ring, { label: LB('ring')[0], sub: LB('ring')[1], color: COL.ring, labelPos: ringPos(-32, R - 1.5, 0.05).toArray(), labelCenter: [0.5, 0.5] });

  const station = (id, obj, a, label, sub, color, extra = {}) => {
    obj.position.copy(ringPos(a));
    return ent(id, obj, { label, sub, color, anchor: ringPos(a, R, 1.0).toArray(), ...extra });
  };
  station('ctx', ctxDesk(), RING.ctx, LB('ctx')[0], `${LB('ctx')[1]} · 0%`, COL.ctx, { labelPos: [1.65, 0.9, 0], labelCenter: [0, 0.5] });
  const pr = press();
  pr.position.copy(ringPos(RING.ctx, R, 3.35));
  ent('press', pr, { label: LB('press')[0], sub: LB('press')[1], color: COL.memory, anchor: ringPos(RING.ctx, R, 3.35).toArray(), labelPos: [1.75, 0.2, 0], labelCenter: [0, 0.5] });

  const g = gateObj();
  g.scale.setScalar(1.25);
  g.rotation.y = rad(RING.gate - 90);
  station('gate', g, RING.gate, ...LB('gate'), COL.gate);
  station('tools', toolsObj(), RING.tools, ...LB('tools'), COL.tools);
  const ck = checkObj();
  station('check', ck, RING.check, ...LB('check'), COL.check);
  const lg = logObj();
  lg.rotation.y = rad(RING.log) + Math.PI; // экраном к центру
  station('log', lg, RING.log, ...LB('log'), COL.log);
  const st = stopObj();
  st.rotation.y = rad(RING.stop);
  station('stop', st, RING.stop, ...LB('stop'), COL.stop);

  const wo = worldObj();
  wo.position.copy(ringPos(WORLD_A, 11.8));
  ent('world', wo, { label: LB('world')[0], sub: LB('world')[1], color: COL.world, anchor: ringPos(WORLD_A, 11.8, 1.0).toArray() });
  const pe = person();
  pe.position.set(0, 0, 11.4);
  ent('person', pe, { label: LB('person')[0], sub: LB('person')[1], color: COL.user, anchor: [0, 1.3, 11.4] });
  const ins = papers(COL.instr);
  ins.position.copy(ringPos(-50, 11.4));
  ins.rotation.y = rad(-50);
  ent('instr', ins, { label: LB('instr')[0], sub: LB('instr')[1], color: COL.instr, anchor: ringPos(-50, 11.4, 0.9).toArray() });
  const mem = shelf();
  mem.position.copy(ringPos(50, 11.4));
  mem.rotation.y = rad(50);
  ent('memory', mem, { label: LB('memory')[0], sub: LB('memory')[1], color: COL.memory, anchor: ringPos(50, 11.4, 0.9).toArray() });

  // типы harness
  const TYPES = [
    ['t_chat', 'chat', ...LB('t_chat')],
    ['t_embed', 'embed', ...LB('t_embed')],
    ['t_local', 'local', ...LB('t_local')],
    ['t_cloud', 'cloud', ...LB('t_cloud')],
    ['t_sdk', 'sdk', ...LB('t_sdk')],
    ['t_orch', 'orch', ...LB('t_orch')],
  ];
  TYPES.forEach(([id, kind, label, sub], i) => {
    const m = mini(kind);
    m.position.set(34 + (i % 3) * 10, 0, i < 3 ? -5.5 : 5.5);
    ent(id, m, { label, sub, color: COL.model, anchor: [m.position.x, 1.2, m.position.z] });
  });

  // сравнение: та же модель, разный harness
  const A = mini('thin'), B = mini('full');
  A.position.set(-44, 0, 1);
  B.position.set(-36, 0, 1);
  ent('cmpA', A, { label: LB('cmpA')[0], sub: LB('cmpA')[1], color: COL.ring, anchor: [-44, 1.2, 1] });
  ent('cmpB', B, { label: LB('cmpB')[0], sub: LB('cmpB')[1], color: COL.memory, anchor: [-36, 1.2, 1] });
  for (const [id, x, c] of [['barA', -44, COL.ring], ['barB', -36, COL.memory]]) {
    const grp = new THREE.Group();
    const geo = new THREE.BoxGeometry(1.6, 1, 1.6);
    geo.translate(0, 0.5, 0);
    const col = shape(geo, c, { fill: 0.5, edge: 0.9, emissive: 0.4 });
    grp.add(col);
    grp.position.set(x, 0, -3.4);
    grp.userData.col = col;
    grp.userData.h = 0.01;
    grp.userData.goal = 0.01;
    col.scale.y = 0.01;
    ent(id, grp, { label: '—', sub: '', color: c, labelPos: [0, 0.4, 0], labelCls: 'bar-lbl' });
  }
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
  if (path && path.length === 2 && !(path[0] in RING && path[1] in RING)) { from = path[0]; to = path[1]; path = null; }
  if (!HAS3D) return;
  let getPoint;
  if (path) {
    const pts = expandPath(path).map(id => ents.get(id)?.anchor).filter(Boolean);
    if (pts.length < 2) return;
    const c = new THREE.CatmullRomCurve3(pts.map(p => p.clone()), false, 'centripetal', 0.3);
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
    lbl = makeLabel(label, null, color, 'pkt');
    lbl.position.set(0, 0.32, 0);
    lbl.center.set(0.5, 1);
    m.g.add(lbl);
  }
  m.g.visible = false;
  packets.push({ ...m, lbl, getPoint, t: -delay, dur, hist: [] });
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
    lbl = makeLabel(label, null, color, 'bubble');
    lbl.position.copy(e.anchor).add(new THREE.Vector3(0, 1.5, 0));
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

/* ─────────────────────────── Состояние сцены: контекст, разрешения, фокус ─────────────────────────── */

const desk = { fill: 0, goal: 0, shown: -1 };
function ctxSet(n) { desk.goal = clamp(n, 0, CARDS); }
function ctxColors(summary = false) {
  const cards = ents.get('ctx')?.obj.userData.cards || [];
  cards.forEach((c, i) => {
    const col = summary && i === 2 ? SUMMARY : CARD_COLORS[i];
    c.material.color.setHex(col);
    c.material.emissive.setHex(col);
  });
}
let pressK = 0, pressT = -1;
function ctxCompact() {
  pressT = 0;
  setTimeout(() => { ctxColors(true); desk.goal = 3; desk.fill = Math.min(desk.fill, 3.4); }, REDUCED ? 0 : 650);
}
function gateOpen(v) { const g = ents.get('gate'); if (g) g.obj.userData.open = v ? 1 : 0; }

let showSet = new Set(), focusSet = null, offSet = new Set();
const DIM = 0.13;
function applyTargets() {
  for (const e of ents.values()) {
    if (!showSet.has(e.id)) { e.target = 0; continue; }
    let t = 1;
    if (focusSet && !focusSet.has(e.id)) t = DIM;
    if (offSet.has(e.id)) t = Math.min(t, 0.1);
    e.target = t;
  }
}
function setFocus(list) { focusSet = list ? new Set(list) : null; applyTargets(); }

const cmp = {
  gpt: [{ v: 78.0, t: L.pct(78.0), s: 'Terminus 2' }, { v: 83.1, t: L.pct(83.1), s: 'Codex CLI' }, 'GPT-5.5'],
  gemini: [{ v: 65.8, t: L.pct(65.8), s: 'Gemini CLI' }, { v: 73.9, t: L.pct(73.9), s: 'Terminus 2' }, 'Gemini 3 Pro'],
  lc: [{ v: 52.8, t: L.pct(52.8), s: L.cmp.lc[0] }, { v: 66.5, t: L.pct(66.5), s: L.cmp.lc[1] }, 'gpt-5.2-codex'],
  anth: [{ v: 12, t: L.cmp.anthA[0], s: L.cmp.anthA[1] }, { v: 100, t: L.cmp.anthB[0], s: L.cmp.anthB[1] }, L.cmp.same],
};
function setCmp(k) {
  const [a, b, model] = cmp[k];
  for (const [id, d] of [['barA', a], ['barB', b]]) {
    const e = ents.get(id);
    if (!e) continue;
    e.obj.userData.goal = (d.v / 100) * 6;
    const el = e.labels[0].element;
    el.querySelector('b').textContent = d.t;
    let sp = el.querySelector('span');
    if (!sp) { sp = document.createElement('span'); el.appendChild(sp); }
    sp.textContent = d.s;
  }
  setSub('cmpA', model);
  setSub('cmpB', model);
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
      dur: +(li.dataset.dur || (li.dataset.at || li.dataset.do ? 1.9 : 1.6)),
    }));
    this.reset();
    this.phase = this.steps.length ? 'wait' : 'idle';
    this.t = -0.9;
  },
  reset() {
    this.i = -1;
    this.steps.forEach(s => s.el.classList.remove('active', 'done'));
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
        sendPacket({ from: s.from, to: s.to, path: s.path, kind: s.kind, label: n === 0 ? s.label : '', dur: s.dur, delay: n * Math.min(0.5, s.dur / s.count) });
      }
    }
    followStep(s.el);
  },
  jump(i) {
    if (stageState() === 'hidden') setStage('normal');
    clearPackets(); clearPulses();
    // состояние сцены восстанавливается проигрыванием действий предыдущих шагов
    hooks[curCh]?.reset?.();
    for (let j = 0; j < i; j++) if (this.steps[j].act) hooks[curCh]?.action?.(this.steps[j].act, this.steps[j], true);
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
      b.setAttribute('aria-label', v ? L.play : L.pause);
    });
  },
  tick(dt) {
    if (this.paused || this.phase === 'idle') return;
    this.t += dt;
    const s = this.steps[this.i];
    if (this.phase === 'run' && this.t >= (s.dur + (s.count - 1) * Math.min(0.5, s.dur / s.count))) {
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

let ringRun = false;
const FOCUS = {
  see: ['ctx', 'instr', 'memory', 'person', 'model', 'room', 'press'],
  act: ['tools', 'world', 'gate', 'model', 'room'],
  safe: ['gate', 'person', 'model', 'room'],
  track: ['check', 'log', 'stop', 'ring', 'model', 'room'],
};
// фоновое движение по кругу для обзорных страниц
const ambient = {
  enter() { this.t = 1.2; this.n = 0; ringRun = true; },
  update(dt) {
    this.t += dt;
    if (this.t < 4.2) return;
    this.t = 0;
    const tool = L.ambient[this.n++ % L.ambient.length];
    sendPacket({ path: ['ctx', 'model'], kind: 'req', dur: 1.0 });
    sendPacket({ path: ['model', 'gate', 'tools', 'world'], kind: 'think', label: tool, dur: 1.6, delay: 1.0 });
    sendPacket({ path: ['world', 'tools', 'check', 'log', 'stop', 'ctx'], kind: 'res', dur: 2.2, delay: 2.6 });
  },
};

const hooks = {
  cover: { ...ambient, enter() { ambient.enter.call(this); ctxSet(5); gateOpen(true); } },
  checklist: { ...ambient, enter() { ambient.enter.call(this); ctxSet(5); gateOpen(true); } },
  harness: {
    enter() { ringRun = true; ctxSet(4); },
    reset() { setFocus(null); },
    exit() { setFocus(null); },
    action(a) { if (FOCUS[a]) setFocus(FOCUS[a]); },
  },
  loop: {
    enter() { this.reset(); ringRun = true; },
    reset() { ctxSet(0); gateOpen(false); },
    action(a) {
      if (a === 'start') ctxSet(2);
      if (a === 'open') gateOpen(true);
      if (a === 'card') ctxSet(4);
    },
  },
  context: {
    enter() { this.reset(); },
    reset() { ctxColors(false); ctxSet(0); desk.fill = 0; },
    action(a, s, instant) {
      if (a === 'f1') ctxSet(2);
      if (a === 'f2') ctxSet(6);
      if (a === 'f3') ctxSet(11);
      if (a === 'compact') { if (instant) { ctxColors(true); ctxSet(3); } else ctxCompact(); }
      if (a === 'f4') ctxSet(5);
    },
  },
  tools: { enter() { ctxSet(3); gateOpen(true); } },
  brakes: {
    enter() { ctxSet(3); gateOpen(false); },
    reset() { gateOpen(false); },
    action(a) { if (a === 'open') gateOpen(true); if (a === 'close') gateOpen(false); },
  },
  memory: {
    enter() { this.reset(); },
    reset() { ctxColors(false); ctxSet(0); },
    action(a) {
      if (a === 'f2') { ctxColors(false); ctxSet(7); }
      if (a === 'clear') ctxSet(0);
      if (a === 'f1') ctxSet(2);
      if (a === 'note') { ctxColors(true); ctxSet(3); }
    },
  },
  check: { enter() { ctxSet(5); gateOpen(true); } },
  stop: { enter() { ctxSet(4); gateOpen(true); } },
  why: {
    enter() { setCmp('gpt'); },
    reset() { setCmp('gpt'); },
    action(a) { if (cmp[a]) setCmp(a); },
  },
  sim: {
    enter() { ringRun = true; ctxSet(0); gateOpen(false); ensureSim(m => m.enter()); },
    exit() { simMod?.exit(); offSet = new Set(); applyTargets(); },
  },
};

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
let elapsed = 0, ringA = 0;

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
    e.obj.traverse(o => {
      if (o === e.obj) return;
      if (o.userData.spin) o.rotation.y += dt * o.userData.spin;
      if (o.userData.spinZ) o.rotation.z += dt * o.userData.spinZ;
    });
    if (e.pulse > 0) {
      e.pulse -= dt;
      const s = 1 + 0.06 * Math.sin(elapsed * 12) * Math.min(1, e.pulse);
      e.obj.scale.copy(e.baseScale).multiplyScalar(s);
    } else if (e.pulse !== 0) { e.pulse = 0; e.obj.scale.copy(e.baseScale); }
  }

  // контекст: карточки появляются по одной
  const ctx = ents.get('ctx');
  if (ctx) {
    if (desk.fill !== desk.goal) {
      const sp = desk.goal > desk.fill ? 5 : 9;
      desk.fill += clamp(desk.goal - desk.fill, -dt * sp, dt * sp);
    }
    ctx.obj.userData.cards.forEach((c, i) => {
      const k = clamp(desk.fill - i, 0, 1);
      c.visible = k > 0.02 && ctx.obj.visible;
      c.scale.set(0.3 + 0.7 * k, 1, 0.3 + 0.7 * k);
    });
    const pct = Math.round((desk.fill / CARDS) * 100);
    if (pct !== desk.shown) {
      desk.shown = pct;
      setSub('ctx', `${LB('ctx')[1]} · ${pct}%`);
      const lbl = ctx.labels[0].element;
      lbl.style.setProperty('--c', hex(pct > 85 ? COL.stop : COL.ctx));
    }
  }
  // пресс compaction
  const pr = ents.get('press');
  if (pr) {
    if (pressT >= 0) {
      pressT += dt;
      pressK = pressT < 0.65 ? ease(pressT / 0.65) : pressT < 1.1 ? 1 : 1 - ease(clamp((pressT - 1.1) / 0.7, 0, 1));
      if (pressT > 1.8) { pressT = -1; pressK = 0; }
    }
    pr.obj.position.y = pr.baseY - pressK * 0.95;
  }
  // шлагбаум
  const gt = ents.get('gate');
  if (gt) {
    const u = gt.obj.userData;
    u.openK += (u.open - u.openK) * Math.min(1, dt * 5);
    u.pivot.rotation.z = u.openK * 1.25;
  }
  // столбики сравнения
  for (const id of ['barA', 'barB']) {
    const e = ents.get(id);
    if (!e) continue;
    const u = e.obj.userData;
    u.h += (u.goal - u.h) * Math.min(1, dt * 3.5);
    u.col.scale.y = Math.max(0.01, u.h);
    e.labels[0].position.y = u.h + 0.4;
  }
  // огонёк, бегущий по кругу
  const rg = ents.get('ring');
  if (rg) {
    const run = rg.obj.userData.runner;
    run.visible = ringRun && rg.alpha > 0.5;
    if (run.visible) {
      ringA += dt * 40;
      run.position.copy(ringPos(ringA, R, 0.12));
    }
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
  main: ['room', 'model', 'ring', 'ctx', 'person', 'instr', 'memory', 'gate', 'tools', 'world', 'check', 'log', 'stop'],
  types: ['t_chat', 't_embed', 't_local', 't_cloud', 't_sdk', 't_orch'],
  cmp: ['cmpA', 'cmpB', 'barA', 'barB'],
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
  ringRun = false;
  pressT = -1; pressK = 0;
  ctxColors(false);
  ctxSet(3);
  gateOpen(false);
  if (!HAS3D) { hooks[ch]?.enter?.(); return; }
  showSet = expandShow(page.dataset.show);
  focusSet = page.dataset.focus ? expandShow(page.dataset.focus) : null;
  applyTargets();
  flyTo((page.dataset.cam || '0,17,21,0,0.6,0.8').split(',').map(Number));
  controls.autoRotate = page.hasAttribute('data-rotate') && !REDUCED;
  $('#btnRotate').classList.toggle('on', controls.autoRotate);
  hooks[ch]?.enter?.();
  runner.load(page);
  runner.setPaused(false);
  renderLegend(page.dataset.legend);
}

const LEGEND = {
  model: COL.model, ctx: COL.ctx, instr: COL.instr, tools: COL.tools, gate: COL.gate, check: COL.check,
  memory: COL.memory, stop: COL.stop, log: COL.log, user: COL.user, world: COL.world,
  req: KIND.req, res: KIND.res, think: KIND.think, err: KIND.err, note: KIND.note,
};
function renderLegend(list) {
  const el = $('#legend');
  el.innerHTML = '';
  for (const k of (list || '').split(',').map(s => s.trim())) {
    if (!LEGEND[k]) continue;
    const c = LEGEND[k], n = L.legend[k];
    const i = document.createElement('span');
    i.style.setProperty('--c', hex(c));
    i.textContent = n;
    el.appendChild(i);
  }
}

const pages = $$('article.page');
const book = $('#book');
let cur = -1;

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
      a.innerHTML = '<span class="toc-k"></span><span class="toc-t"></span><span class="toc-n"></span>';
      a.querySelector('.toc-k').textContent = kicker.replace(L.toc[0], L.toc[1]).replace(/ · .*$/, '');
      a.querySelector('.toc-t').textContent = title;
      a.querySelector('.toc-n').textContent = i + 1;
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
  history.replaceState(null, '', location.pathname + (DEBUG ? '?debug' : '') + '#' + next.id);
  $('#pageNo').textContent = `${i + 1} / ${pages.length}`;
  $('#progress').style.width = `${((i + 1) / pages.length) * 100}%`;
  $('#prev').disabled = i === 0;
  $('#next').disabled = i === pages.length - 1;
  $('#tocList')?.querySelectorAll('a').forEach((a, j) => a.classList.toggle('cur', j === i));
  $('#chapterChip').textContent = ($('.kicker', next)?.textContent || '') + ' · ' + ($('h1, h2', next)?.textContent || '');
  $('#simBtn').classList.toggle('on', next.id === 'sim');
  $$('.lang-switch a[data-base]').forEach(l => { l.href = l.dataset.base + '#' + next.id; });
  enterChapter(next);
  trackChapter(next, i);
}
function showPage(p, dir) {
  p.hidden = false;
  book.scrollTop = 0;
  if (dir) {
    p.classList.add(dir > 0 ? 'flip-in' : 'flip-in-back');
    setTimeout(() => p.classList.remove('flip-in', 'flip-in-back'), 420);
  }
}
const goId = id => { const i = pages.findIndex(p => p.id === id); if (i >= 0) go(i); };

const stageState = () => document.documentElement.dataset.stage || 'normal';
function setStage(v) {
  if (v === 'normal') delete document.documentElement.dataset.stage;
  else document.documentElement.dataset.stage = v;
  try { localStorage.setItem('agents-stage', v); } catch (e) { /* приватный режим */ }
  const t = $('#dockToggle');
  if (t) t.setAttribute('aria-expanded', String(v !== 'hidden'));
  const z = $('#dockSize');
  if (z) z.setAttribute('aria-label', v === 'large' ? L.shrink : L.grow);
}

/* ─────────────────────────── Тренажёр ─────────────────────────── */

const PART_ENTS = {
  loop: ['ring'], tools: ['tools', 'world'], instr: ['instr'], ctx: ['press'], gate: ['gate'],
  check: ['check'], stop: ['stop'], memory: ['memory'],
};
let simMod = null, simLoading = null;
const simApi = {
  packet: (path, kind, label, dur, delay = 0) => sendPacket({ path, kind, label, dur, delay }),
  pulse: (id, kind, label, dur) => pulseAt(id, { kind, label, dur }),
  setParts(on) {
    offSet = new Set();
    for (const [p, ids] of Object.entries(PART_ENTS)) if (!on[p]) ids.forEach(id => offSet.add(id));
    ringRun = !!on.loop;
    applyTargets();
  },
  ctx: n => ctxSet(n),
  compact: () => ctxCompact(),
  resetDesk: () => { ctxColors(false); ctxSet(0); },
  gate: v => gateOpen(v),
  clear: () => { clearPackets(); clearPulses(); },
  track: (goal, params) => goalOnce(goal, params),
  has3d: HAS3D,
  reduced: REDUCED,
  showStage: () => { if (stageState() === 'hidden') setStage('normal'); },
};
function ensureSim(cb) {
  const done = () => { if (curCh === 'sim') cb?.(simMod); };
  if (simMod) return done();
  simLoading ||= import('./sim.js?v=3')
    .then(m => { simMod = m.initSim(simApi, $('#simRoot')); })
    .catch(e => { simLoading = null; console.error('Тренажёр не загрузился', e); });
  simLoading.then(done);
}

/* ─────────────────────────── Яндекс Метрика ─────────────────────────── */
// Главы переключаются без перезагрузки, поэтому просмотры, цели и активное время
// отправляются вручную: так в Метрике видны глубина просмотра и время на странице.
const YM_ID = 113153530;
const YM_BASE = location.origin + location.pathname;
const YM_OFF = /^(localhost|127\.|\[::1\])/.test(location.hostname);
const ym = (...a) => { try { if (!YM_OFF && typeof window.ym === 'function') window.ym(YM_ID, ...a); } catch (e) { /* блокировщик */ } };
const ymOnce = new Set();
const goalOnce = (id, params) => { if (!ymOnce.has(id)) { ymOnce.add(id); ym('reachGoal', id, params); } };
let ymFirst = true, ymTimer = null, ymLastUrl = location.href;

function trackChapter(page, i) {
  clearTimeout(ymTimer);
  const url = `${YM_BASE}?ch=${page.id}`;
  if (i === pages.length - 1) goalOnce('agents_finish');
  if (page.id === 'sim') goalOnce('agents_sim_open');
  if (ymFirst) { ymFirst = false; ymLastUrl = url; return; }
  ymTimer = setTimeout(() => {
    const title = `${$('.kicker', page)?.textContent || ''} · ${$('h1, h2', page)?.textContent || ''} — ${L.ymTitle}`;
    ym('hit', url, { title, referer: ymLastUrl });
    ymLastUrl = url;
  }, 1200);
}
ym('params', { 'Агенты': { 'Язык': LANG } });
let ymActiveAt = performance.now(), ymActiveSec = 0, ymMinutes = 0;
['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev =>
  addEventListener(ev, () => { ymActiveAt = performance.now(); }, { passive: true, capture: true }));
setInterval(() => {
  if (document.visibilityState !== 'visible' || performance.now() - ymActiveAt > 120000 || ymMinutes >= 30) return;
  ymActiveSec += 5;
  if (ymActiveSec >= 60) {
    ymActiveSec = 0;
    ymMinutes++;
    ym('params', { 'Агенты': { 'Активных минут': ymMinutes } });
  }
}, 5000);

function openTOC() { $('#toc').classList.add('open'); $('#toc').setAttribute('aria-hidden', 'false'); }
function closeTOC() { $('#toc').classList.remove('open'); $('#toc').setAttribute('aria-hidden', 'true'); }

function setupUI() {
  $('#prev').addEventListener('click', () => go(cur - 1));
  $('#next').addEventListener('click', () => go(cur + 1));
  $$('[data-go-next]').forEach(b => b.addEventListener('click', () => go(cur + 1)));
  $$('[data-go]').forEach(b => b.addEventListener('click', () => goId(b.dataset.go)));
  $('#simBtn').addEventListener('click', () => goId('sim'));
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
    if (idx >= 0) { runner.jump(idx); goalOnce('agents_step', { chapter: pages[cur]?.id }); }
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
    try { localStorage.setItem('agents-theme', t); } catch (e) { /* приватный режим */ }
    if (HAS3D) applyTheme();
  });
  window.addEventListener('hashchange', () => {
    const i = pages.findIndex(x => '#' + x.id === location.hash);
    if (i >= 0) go(i);
  });
}

// ── старт
pages.forEach(p => { p.hidden = true; });
setupUI();
if (HAS3D) {
  applyTheme();
  buildWorld();
  new ResizeObserver(resize).observe(stage);
  resize();
  frame();
}
buildTOC();
const chParam = new URLSearchParams(location.search).get('ch');
const start = Math.max(0, pages.findIndex(p => '#' + p.id === location.hash || p.id === chParam));
go(start, true);
if (HAS3D && camPreset) flyTo(camPreset, true);
document.documentElement.classList.add('ready');
if (DEBUG) window.__agents = { camera, controls, ents, desk, go, runner, get camPreset() { return camPreset; } };
