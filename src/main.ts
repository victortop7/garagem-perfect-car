import './style.css';
import { CarScene, type Keyframe, type PaintOption, type ViewPreset } from './scene';

/** Troque pelo número real da loja, só dígitos com DDI e DDD. Ex: 5585999999999 */
const WHATSAPP_NUMBER = '';

const params = new URLSearchParams(location.search);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const snap = reduced || params.has('snap');

const PAINTS: PaintOption[] = [
  { id: 'original', name: 'Vermelho de fábrica', tint: null, gain: 1 },
  { id: 'preto', name: 'Preto fosco', tint: '#16181a', gain: 3.0 },
  { id: 'branco', name: 'Branco gelo', tint: '#f2f2ee', gain: 3.2 },
  { id: 'azul', name: 'Azul oceano', tint: '#1f5fa8', gain: 3.8 },
  { id: 'laranja', name: 'Laranja trilha', tint: '#ee6a12', gain: 3.4 },
  { id: 'verde', name: 'Verde militar', tint: '#5c6b34', gain: 3.8 },
  { id: 'areia', name: 'Areia', tint: '#d8b77a', gain: 3.6 },
];

const VIEWS: Record<string, ViewPreset> = {
  frente: { az: 0, el: 6, dist: 6.6 },
  lateral: { az: 90, el: 5, dist: 7.6 },
  traseira: { az: 180, el: 6, dist: 6.6 },
  topo: { az: 90, el: 80, dist: 8.4 },
};

/**
 * Modelos de UTV que a loja atende. Só os que têm `has3d` mostram o modelo próprio;
 * os outros mostram o Maverick como substituto até o 3D chegar.
 * Lista de exemplo: ajustar com os modelos reais da loja.
 */
interface UtvOption {
  id: string;
  name: string;
  has3d: boolean;
}
const UTVS: UtvOption[] = [
  { id: 'maverick', name: 'Can-Am Maverick', has3d: true },
  { id: 'rzr', name: 'Polaris RZR', has3d: false },
  { id: 'outro', name: 'Outro modelo', has3d: false },
];

/** Exemplo ilustrativo dos kits. A configuração real de cada stage é definida pela loja. */
interface StageOption {
  id: string;
  name: string;
  note: string;
}
const STAGES: StageOption[] = [
  { id: 's1', name: 'Stage 1', note: '2 alto-falantes grandes e o display' },
  { id: 's2', name: 'Stage 2', note: '4 alto-falantes, 2 tweeters, LED lateral' },
  { id: 's3', name: 'Stage 3', note: '6 alto-falantes, 4 tweeters, LED lateral e barra no topo' },
];

/** Um enquadramento por seção da apresentação, na mesma ordem do HTML. */
const KEYFRAMES: Keyframe[] = [
  { az: 38, el: 12, dist: 7.2, target: [0, 0.7, 0], side: -1, fov: 32 },
  { az: -35, el: 10, dist: 8.6, target: [0, 0.8, 0], side: -1, fov: 32 },
  { az: 200, el: 12, dist: 7.2, target: [0, 1.0, 0], side: -1, fov: 32 },
  { az: 150, el: 10, dist: 8.8, target: [0, 0.9, 0], side: -1, fov: 32 },
];

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const sections = Array.from(document.querySelectorAll<HTMLElement>('main > section'));
const loading = document.querySelector<HTMLElement>('#loading')!;
const loadingBar = document.querySelector<HTMLElement>('#loading-bar')!;

const stage = new CarScene(canvas, snap);
stage.setGoal(KEYFRAMES[0]);

/* ---------- Cor do UTV (a mesma escolha vale nas duas abas) ---------- */
const chipBoxes = Array.from(document.querySelectorAll<HTMLElement>('.paint-chips'));
function applyPaint(p: PaintOption) {
  stage.setPaint(p);
  document.querySelectorAll('.paint-name').forEach((n) => (n.textContent = p.name));
  chipBoxes.forEach((box) =>
    box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.id === p.id));
    }),
  );
  updateWhatsapp(p);
}
for (const box of chipBoxes) {
  for (const p of PAINTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = p.id;
    b.setAttribute('aria-label', `Cor ${p.name}`);
    b.title = p.name;
    b.style.setProperty('--chip', p.tint ?? '#c8281e');
    b.addEventListener('click', () => applyPaint(p));
    box.append(b);
  }
}

/* ---------- Escolha do UTV e do stage ---------- */
let utv: UtvOption = UTVS.find((u) => u.id === params.get('utv')) ?? UTVS[0];
let stageSel: StageOption | null = STAGES.find((s) => s.id === params.get('stage')) ?? null;
let paintSel: PaintOption = PAINTS[1];

function renderOptions(
  box: HTMLElement,
  items: { id: string; name: string }[],
  noteOf: (id: string) => string,
  onPick: (id: string) => void,
) {
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = it.id;
    b.setAttribute('aria-pressed', 'false');
    const name = document.createElement('span');
    name.className = 'opt-name';
    name.textContent = it.name;
    const note = document.createElement('span');
    note.className = 'opt-note';
    note.textContent = noteOf(it.id);
    b.append(name, note);
    b.addEventListener('click', () => onPick(it.id));
    box.append(b);
  }
}
function markPressed(box: HTMLElement, id: string | null) {
  box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.id === id));
  });
}

const utvBox = document.querySelector<HTMLElement>('#utvs')!;
const utvNote = document.querySelector<HTMLElement>('#utv-note')!;
const stageBox = document.querySelector<HTMLElement>('#stages')!;
const sumUtv = document.querySelector<HTMLElement>('#sum-utv')!;
const sumStage = document.querySelector<HTMLElement>('#sum-stage')!;
const wa = document.querySelector<HTMLAnchorElement>('#whatsapp')!;

function refreshSummary() {
  markPressed(utvBox, utv.id);
  markPressed(stageBox, stageSel?.id ?? null);
  utvNote.textContent = utv.has3d ? '' : `O 3D do ${utv.name} chega em breve. Por enquanto mostramos o Maverick.`;
  sumUtv.textContent = utv.name;
  sumStage.textContent = stageSel ? stageSel.name : 'stage a definir';
  const msg =
    `Olá! Quero o som ${stageSel ? stageSel.name : '(ainda não escolhi o stage)'} ` +
    `para o meu ${utv.name}, na cor ${paintSel.name.toLowerCase()}. Vi no site e quero saber mais.`;
  wa.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}
renderOptions(
  utvBox,
  UTVS,
  (id) => (UTVS.find((u) => u.id === id)!.has3d ? '3D disponível' : '3D em breve'),
  (id) => {
    utv = UTVS.find((u) => u.id === id)!;
    refreshSummary();
  },
);
renderOptions(
  stageBox,
  STAGES,
  (id) => STAGES.find((s) => s.id === id)!.note,
  (id) => {
    stageSel = STAGES.find((s) => s.id === id)!;
    refreshSummary();
  },
);
function updateWhatsapp(p: PaintOption) {
  paintSel = p;
  refreshSummary();
}
applyPaint(PAINTS.find((p) => p.id === params.get('paint')) ?? PAINTS[1]);

/* ---------- Apresentação: rolagem controla a câmera ---------- */
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function frameAtScroll(): Keyframe {
  const vh = window.innerHeight;
  const pos = window.scrollY + vh / 2;
  const centers = sections.map((s) => s.offsetTop + s.offsetHeight / 2);
  if (pos <= centers[0]) return KEYFRAMES[0];
  const last = centers.length - 1;
  if (pos >= centers[last]) return KEYFRAMES[last];
  let i = 0;
  while (pos > centers[i + 1]) i++;
  const t = smooth((pos - centers[i]) / (centers[i + 1] - centers[i]));
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];
  return {
    az: lerp(a.az, b.az, t),
    el: lerp(a.el, b.el, t),
    dist: lerp(a.dist, b.dist, t),
    fov: lerp(a.fov, b.fov, t),
    side: lerp(a.side, b.side, t) as Keyframe['side'],
    target: [
      lerp(a.target[0], b.target[0], t),
      lerp(a.target[1], b.target[1], t),
      lerp(a.target[2], b.target[2], t),
    ],
  };
}
let ticking = false;
function onScroll() {
  if (params.has('only') || stage.isViewer || ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    stage.setGoal(frameAtScroll());
    ticking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);

/* Arrastar para girar nas seções de escolha */
let dragging = false;
let startX = 0;
let baseDrag = 0;
let drag = 0;
const endDrag = () => {
  dragging = false;
};
document.querySelectorAll<HTMLElement>('.drag-area').forEach((hit) => {
  hit.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    baseDrag = drag;
    hit.setPointerCapture(e.pointerId);
  });
  hit.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    drag = baseDrag - (e.clientX - startX) * 0.4;
    stage.setDrag(drag);
  });
  hit.addEventListener('pointerup', endDrag);
  hit.addEventListener('pointercancel', endDrag);
});

/* ---------- Visualizador: vistas e ferramentas ---------- */
document.querySelectorAll<HTMLButtonElement>('#views button').forEach((b) => {
  b.addEventListener('click', () => stage.goView(VIEWS[b.dataset.view!]));
});
const autoBtn = document.querySelector<HTMLButtonElement>('#autorotate')!;
autoBtn.addEventListener('click', () => {
  const on = autoBtn.getAttribute('aria-pressed') !== 'true';
  autoBtn.setAttribute('aria-pressed', String(on));
  stage.setAutoRotate(on);
});
document.querySelector<HTMLButtonElement>('#recenter')!.addEventListener('click', () => {
  stage.goView({ az: 35, el: 12, dist: 7.2 });
});

/* ---------- Abas (hash na URL) ---------- */
const tabApresentacao = document.querySelector<HTMLElement>('#tab-apresentacao')!;
const tabVisualizador = document.querySelector<HTMLElement>('#tab-visualizador')!;
let ready = false;
function route() {
  const viewer = location.hash === '#visualizador';
  document.body.classList.toggle('viewer', viewer);
  const setCurrent = (el: HTMLElement, on: boolean) =>
    on ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current');
  setCurrent(tabVisualizador, viewer);
  setCurrent(tabApresentacao, !viewer);

  if (!ready) return; // o modelo ainda está carregando; o estado é aplicado ao terminar
  if (viewer) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    stage.setViewer(true);
    const v = params.get('vista'); // atalho para revisão visual das vistas
    if (v && VIEWS[v]) stage.goView(VIEWS[v]);
  } else {
    stage.setViewer(false);
    const target = location.hash ? document.querySelector<HTMLElement>(location.hash) : null;
    if (target) target.scrollIntoView({ behavior: 'instant' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => stage.setGoal(frameAtScroll()));
  }
}
window.addEventListener('hashchange', route);
route();

/* ---------- Carregamento ---------- */
stage.start();
stage
  .load(`${import.meta.env.BASE_URL}models/maverick.glb`, (p) => {
    loadingBar.style.transform = `scaleX(${p})`;
  })
  .then(() => {
    if (snap) loading.style.transition = 'none';
    loading.classList.add('done');
    ready = true;
    // Modo de revisão visual: ?only=N mostra só a seção N com o enquadramento dela.
    const only = params.get('only');
    if (only !== null && sections[+only]) {
      sections.forEach((s, i) => {
        if (i !== +only) s.style.display = 'none';
      });
      stage.setGoal(KEYFRAMES[+only]);
    } else {
      route();
      if (!stage.isViewer) stage.setGoal(frameAtScroll());
    }
    document.body.dataset.ready = 'true';
  })
  .catch(() => {
    loading.querySelector('p')!.textContent =
      'Não foi possível carregar o modelo 3D. Recarregue a página.';
  });
