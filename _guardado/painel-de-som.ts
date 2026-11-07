import * as THREE from 'three';

/** Posição e raio de um alto-falante no painel (coordenadas locais, painel centrado). */
interface Spk {
  x: number;
  y: number;
  r: number;
}

interface StageDef {
  h: number;
  woofers: Spk[];
  tweeters: Spk[];
  sideLeds: boolean;
  topBar: boolean;
}

const W = 1.7;
const sym = (x: number, y: number, r: number): Spk[] => [
  { x: -x, y, r },
  { x, y, r },
];

/**
 * Exemplos visuais dos três stages. As quantidades reais de cada kit são definidas
 * pela loja; basta ajustar esta tabela.
 */
export const STAGES: StageDef[] = [
  { h: 0.66, woofers: sym(0.52, 0, 0.2), tweeters: [], sideLeds: false, topBar: false },
  {
    h: 0.8,
    woofers: [...sym(0.54, 0.18, 0.155), ...sym(0.54, -0.18, 0.155)],
    tweeters: sym(0.78, 0, 0.05),
    sideLeds: true,
    topBar: false,
  },
  {
    h: 0.98,
    woofers: [...sym(0.54, 0.31, 0.155), ...sym(0.54, 0, 0.155), ...sym(0.54, -0.31, 0.155)],
    tweeters: [...sym(0.78, 0.16, 0.05), ...sym(0.78, -0.16, 0.05)],
    sideLeds: true,
    topBar: true,
  },
];

export type LedChoice = string | 'rgb';

export class SoundPanel {
  readonly group = new THREE.Group();
  private dynamic = new THREE.Group();
  private ledColor = new THREE.Color('#2f4bff');
  private rgb = false;
  private stage = 1;
  private name = '';
  private logo: HTMLImageElement | null = null;

  private mLed = new THREE.MeshBasicMaterial({ color: this.ledColor, toneMapped: false });
  private mBoard = new THREE.MeshStandardMaterial({ color: '#0f1013', roughness: 0.55, metalness: 0.25 });
  private mBlack = new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.9, metalness: 0 });
  private mMetal = new THREE.MeshStandardMaterial({ color: '#7d828c', roughness: 0.35, metalness: 0.9 });
  private mCone = new THREE.MeshStandardMaterial({
    color: '#26282d',
    roughness: 0.45,
    metalness: 0.5,
    side: THREE.DoubleSide,
  });
  private mCap = new THREE.MeshStandardMaterial({ color: '#555962', roughness: 0.3, metalness: 0.85 });
  private mRubber = new THREE.MeshStandardMaterial({ color: '#0a0a0b', roughness: 0.8, metalness: 0 });

  private glowTex: THREE.CanvasTexture;
  private glows: THREE.SpriteMaterial[] = [];

  private screenCanvas = document.createElement('canvas');
  private screenTex: THREE.CanvasTexture;

  constructor() {
    this.group.add(this.dynamic);

    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    this.glowTex = new THREE.CanvasTexture(c);

    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 640;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = 4;

    const img = new Image();
    img.onload = () => {
      this.logo = img;
      this.drawScreen();
    };
    img.src = `${import.meta.env.BASE_URL}logo.png`;

    this.build();
  }

  setStage(i: number) {
    if (i === this.stage) return;
    this.stage = i;
    this.build();
    // pequeno "encaixe" ao trocar de kit
    this.group.scale.setScalar(0.94);
    this.popStart = performance.now();
  }
  private popStart = 0;

  setLed(choice: LedChoice) {
    if (choice === 'rgb') {
      this.rgb = true;
    } else {
      this.rgb = false;
      this.applyLed(new THREE.Color(choice));
    }
    this.drawScreen();
  }

  setName(text: string) {
    this.name = text.trim();
    this.drawScreen();
  }

  /** Chamado a cada frame. Devolve a cor atual do LED (usada no brilho do chão). */
  update(timeSec: number): THREE.Color {
    if (this.rgb) this.applyLed(new THREE.Color().setHSL((timeSec * 0.12) % 1, 1, 0.55));
    if (this.popStart) {
      const k = Math.min((performance.now() - this.popStart) / 260, 1);
      const e = 1 - Math.pow(1 - k, 3);
      this.group.scale.setScalar(0.94 + 0.06 * e);
      if (k >= 1) this.popStart = 0;
    }
    return this.ledColor;
  }

  private applyLed(c: THREE.Color) {
    this.ledColor.copy(c);
    this.mLed.color.copy(c);
    for (const m of this.glows) m.color.copy(c);
  }

  private build() {
    this.dynamic.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.dynamic.clear();
    this.glows = [];
    const def = STAGES[this.stage];

    // A base do painel fica fixa; stages maiores crescem para cima.
    this.dynamic.position.y = def.h / 2;

    // Placa
    const half = def.h / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, -half);
    shape.lineTo(W / 2, -half);
    shape.lineTo(W / 2 - 0.07, half);
    shape.lineTo(-W / 2 + 0.07, half);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -0.1);
    this.dynamic.add(new THREE.Mesh(geo, this.mBoard));

    // Tela central
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.38, 0.02), this.mBlack);
    frame.position.z = 0.008;
    this.dynamic.add(frame);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.32),
      new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }),
    );
    screen.position.z = 0.0185;
    this.dynamic.add(screen);
    this.addRect(0.58, 0.4, 0.008, 0.012);

    for (const s of def.woofers) this.dynamic.add(this.speaker(s, false));
    for (const s of def.tweeters) this.dynamic.add(this.speaker(s, true));

    if (def.sideLeds) {
      for (const sx of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, def.h * 0.86, 0.016), this.mLed);
        bar.position.set(sx * (W / 2 - 0.045), 0, 0.012);
        this.dynamic.add(bar);
      }
    }
    if (def.topBar) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.035, 0.03), this.mLed);
      bar.position.set(0, half + 0.055, -0.02);
      this.dynamic.add(bar);
      this.addGlow(0, half + 0.055, 0.05, W * 1.1, 0.32);
    }
    this.drawScreen();
  }

  private addRect(w: number, h: number, z: number, t: number) {
    const mk = (bw: number, bh: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.012), this.mLed);
      m.position.set(x, y, z + 0.012);
      this.dynamic.add(m);
    };
    mk(w, t, 0, h / 2);
    mk(w, t, 0, -h / 2);
    mk(t, h, -w / 2, 0);
    mk(t, h, w / 2, 0);
  }

  private addGlow(x: number, y: number, z: number, size: number, opacity: number, sy = size) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: this.ledColor,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glows.push(mat);
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.set(size, sy, 1);
    this.dynamic.add(sp);
  }

  private speaker(s: Spk, tweeter: boolean): THREE.Group {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, 0.002);
    const r = s.r;

    const recess = new THREE.Mesh(new THREE.CircleGeometry(r * 1.14, 48), this.mBlack);
    g.add(recess);

    const bezel = new THREE.Mesh(new THREE.TorusGeometry(r * 1.06, r * 0.1, 10, 56), this.mMetal);
    bezel.position.z = 0.012;
    g.add(bezel);

    if (!tweeter) {
      const profile = [
        new THREE.Vector2(r * 0.98, 0.016),
        new THREE.Vector2(r * 0.84, 0.014),
        new THREE.Vector2(r * 0.8, 0.0),
        new THREE.Vector2(r * 0.32, -r * 0.24),
        new THREE.Vector2(0.001, -r * 0.24),
      ];
      const cone = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), this.mCone);
      cone.rotation.x = Math.PI / 2;
      g.add(cone);
      const surround = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, r * 0.055, 8, 48), this.mRubber);
      surround.position.z = 0.012;
      g.add(surround);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mCap);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = -r * 0.24;
      cap.scale.set(1, 0.55, 1);
      g.add(cap);
    } else {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        this.mCap,
      );
      dome.rotation.x = Math.PI / 2;
      dome.scale.set(1, 0.6, 1);
      g.add(dome);
    }

    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.3, r * (tweeter ? 0.09 : 0.05), 8, 72), this.mLed);
    ring.position.z = 0.016;
    g.add(ring);

    const glowSize = r * (tweeter ? 6 : 4.8);
    this.addGlowTo(g, 0, 0, 0.03, glowSize, tweeter ? 0.35 : 0.5);
    return g;
  }

  private addGlowTo(parent: THREE.Object3D, x: number, y: number, z: number, size: number, opacity: number) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: this.ledColor,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glows.push(mat);
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.set(size, size, 1);
    parent.add(sp);
  }

  /** Desenha a tela: logo da loja por padrão, ou o nome digitado. */
  private drawScreen() {
    const c = this.screenCanvas;
    const g = c.getContext('2d')!;
    const w = c.width;
    const h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#04050a';
    g.fillRect(0, 0, w, h);
    const css = `#${this.ledColor.getHexString()}`;

    if (this.name) {
      let size = 190;
      const font = (s: number) => `italic 800 ${s}px Archivo, Arial Black, sans-serif`;
      g.font = font(size);
      while (g.measureText(this.name).width > w - 110 && size > 40) {
        size -= 6;
        g.font = font(size);
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = css;
      g.shadowBlur = 38;
      g.fillStyle = '#ffffff';
      g.fillText(this.name, w / 2, h / 2 + 6);
      g.shadowBlur = 0;
    } else if (this.logo) {
      const ratio = this.logo.width / this.logo.height;
      const lh = h - 40;
      g.drawImage(this.logo, (w - lh * ratio) / 2, 20, lh * ratio, lh);
    }
    this.screenTex.needsUpdate = true;
  }
}
