import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Um enquadramento de câmera. Valores de alvo em unidades do carro normalizado (comprimento = 4, frente em +Z). */
export interface Keyframe {
  az: number; // graus ao redor do carro
  el: number; // graus de elevação
  dist: number;
  target: [number, number, number];
  /** Lado onde o texto fica: -1 esquerda, 1 direita, 0 nenhum. O carro vai para o lado oposto. */
  side: -1 | 0 | 1;
  fov: number;
}

/** Vista rápida do visualizador. */
export interface ViewPreset {
  az: number;
  el: number;
  dist: number;
}

export interface PaintOption {
  id: string;
  name: string;
  /** null = pintura original do modelo */
  tint: string | null;
  gain: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const VIEWER_TARGET = new THREE.Vector3(0, 0.9, 0);
const RAD = Math.PI / 180;

interface Tween {
  from: ViewPreset;
  to: ViewPreset;
  t0: number;
  dur: number;
}

export class CarScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private car = new THREE.Group();
  private uniforms = {
    uTint: { value: new THREE.Color('#ffffff') },
    uUse: { value: 0 },
    uGain: { value: 3.4 },
  };
  private current: Keyframe | null = null;
  private goal: Keyframe | null = null;
  private last = 0;
  private dragAz = 0;
  private dragAzGoal = 0;
  private snap: boolean;

  // Visualizador (câmera livre)
  private viewer = false;
  private controls: OrbitControls | null = null;
  private autoRotate = false;
  private tween: Tween | null = null;
  private viewSide = -1;

  constructor(private canvas: HTMLCanvasElement, snap: boolean) {
    this.snap = snap;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;

    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(-3, 6, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#6f86ff', 0.8);
    rim.position.set(4, 3, -5);
    this.scene.add(rim);

    this.scene.add(this.car);
    this.scene.add(this.makeFloorGlow());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Brilho azul da marca no chão, sob o carro. */
  private makeFloorGlow(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 4.8),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        color: '#2f4bff',
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    return mesh;
  }

  async load(url: string, onProgress: (p: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url, (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    const model = gltf.scene;

    // Normaliza: comprimento 4, centrado em X/Z, apoiado no chão.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = 4 / Math.max(size.x, size.z);
    model.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(model);
    const center = box2.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box2.min.y, -center.z);
    this.car.add(model);

    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m.name === 'paint_red') this.preparePaint(m as THREE.MeshStandardMaterial);
      }
    });
  }

  /** Recolore a pintura mantendo o relevo/sujeira da textura original (usa só a luminância). */
  private preparePaint(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform float uUse;\nuniform float uGain;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
           diffuseColor.rgb = mix(diffuseColor.rgb, uTint * lum * uGain, uUse);`,
        );
    };
    mat.customProgramCacheKey = () => 'perfectcar-paint';
    mat.needsUpdate = true;
  }

  setPaint(p: PaintOption) {
    if (p.tint === null) {
      this.uniforms.uUse.value = 0;
    } else {
      this.uniforms.uUse.value = 1;
      this.uniforms.uTint.value.set(p.tint);
      this.uniforms.uGain.value = p.gain;
    }
  }

  /* ---------- Modo apresentação (câmera guiada pela rolagem) ---------- */

  setDrag(deltaDeg: number) {
    this.dragAzGoal = deltaDeg;
  }

  setGoal(k: Keyframe) {
    this.goal = k;
    if (!this.current || this.snap) this.current = { ...k, target: [...k.target] };
  }

  /* ---------- Modo visualizador (câmera livre) ---------- */

  get isViewer() {
    return this.viewer;
  }

  setViewer(on: boolean) {
    if (on === this.viewer) return;
    this.viewer = on;
    if (on) {
      this.camera.fov = 34;
      this.camera.updateProjectionMatrix();
      const ctl = new OrbitControls(this.camera, this.canvas);
      ctl.target.copy(VIEWER_TARGET);
      ctl.enableDamping = true;
      ctl.dampingFactor = 0.08;
      ctl.minDistance = 2.6;
      ctl.maxDistance = 18;
      ctl.maxPolarAngle = Math.PI / 2 - 0.03;
      ctl.screenSpacePanning = true;
      ctl.rotateSpeed = 0.85;
      ctl.zoomSpeed = 0.8;
      ctl.autoRotate = this.autoRotate;
      ctl.autoRotateSpeed = 1.4;
      this.controls = ctl;
      this.goView({ az: 35, el: 12, dist: 7.2 });
    } else if (this.controls) {
      // Devolve a câmera atual ao modo apresentação sem "pulo".
      const s = this.cameraSpherical(this.controls.target);
      const portrait = window.innerWidth / window.innerHeight < 0.9;
      this.current = {
        az: s.az,
        el: s.el,
        dist: s.dist / (portrait ? 1.7 : 1),
        target: this.controls.target.toArray() as [number, number, number],
        side: this.viewSide as Keyframe['side'],
        fov: this.camera.fov,
      };
      this.controls.dispose();
      this.controls = null;
      this.tween = null;
    }
  }

  setAutoRotate(on: boolean) {
    this.autoRotate = on;
    if (this.controls) this.controls.autoRotate = on;
  }

  /** Move a câmera do visualizador para uma vista rápida. */
  goView(p: ViewPreset) {
    if (!this.controls) return;
    const from = this.cameraSpherical(this.controls.target);
    // Menor caminho de rotação
    let to = p.az;
    while (to - from.az > 180) to -= 360;
    while (to - from.az < -180) to += 360;
    this.controls.target.copy(VIEWER_TARGET);
    // No celular (tela estreita) a câmera fica mais longe para o UTV caber inteiro.
    const portrait = window.innerWidth / window.innerHeight < 0.9;
    this.tween = {
      from,
      to: { az: to, el: p.el, dist: p.dist * (portrait ? 1.7 : 1) },
      t0: performance.now(),
      dur: this.snap ? 0 : 750,
    };
  }

  private cameraSpherical(target: THREE.Vector3) {
    const v = this.camera.position.clone().sub(target);
    const dist = v.length();
    return { az: Math.atan2(v.x, v.z) / RAD, el: Math.asin(v.y / dist) / RAD, dist };
  }

  private applyViewOffset(side: number) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const portrait = w / h < 0.9;
    const x = portrait ? 0 : side * 0.25 * w;
    const y = portrait ? Math.abs(side) * 0.25 * h : 0;
    this.camera.setViewOffset(w, h, x, y, w, h);
    this.camera.updateProjectionMatrix();
  }

  /* ---------- Loop ---------- */

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    const tick = (t: number) => {
      const dt = Math.min((t - this.last) / 1000, 0.1);
      this.last = t;
      if (this.viewer && this.controls) this.updateViewer(dt);
      else this.updateStory(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private updateViewer(dt: number) {
    const ctl = this.controls!;
    if (this.tween) {
      const tw = this.tween;
      const k = tw.dur === 0 ? 1 : Math.min((performance.now() - tw.t0) / tw.dur, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const az = lerp(tw.from.az, tw.to.az, e) * RAD;
      const el = lerp(tw.from.el, tw.to.el, e) * RAD;
      const d = lerp(tw.from.dist, tw.to.dist, e);
      this.camera.position.set(
        ctl.target.x + d * Math.cos(el) * Math.sin(az),
        ctl.target.y + d * Math.sin(el),
        ctl.target.z + d * Math.cos(el) * Math.cos(az),
      );
      if (k >= 1) this.tween = null;
    }
    ctl.update();
    const portrait = window.innerWidth / window.innerHeight < 0.9;
    const goalSide = portrait ? -1 : -0.5;
    this.viewSide = lerp(this.viewSide, goalSide, this.snap ? 1 : 1 - Math.exp(-dt * 6));
    this.applyViewOffset(this.viewSide);
  }

  private updateStory(dt: number) {
    const g = this.goal;
    const c = this.current;
    if (!g || !c) return;
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 5);
    c.az = lerp(c.az, g.az, k);
    c.el = lerp(c.el, g.el, k);
    c.dist = lerp(c.dist, g.dist, k);
    c.fov = lerp(c.fov, g.fov, k);
    c.side = lerp(c.side, g.side, k) as Keyframe['side'];
    for (let i = 0; i < 3; i++) c.target[i] = lerp(c.target[i], g.target[i], k);
    this.dragAz = lerp(this.dragAz, this.dragAzGoal, this.snap ? 1 : 1 - Math.exp(-dt * 8));

    const portrait = window.innerWidth / window.innerHeight < 0.9;
    const az = (c.az + this.dragAz) * RAD;
    const el = c.el * RAD;
    const dist = c.dist * (portrait ? 1.7 : 1);
    this.camera.fov = c.fov;
    this.camera.position.set(
      c.target[0] + dist * Math.cos(el) * Math.sin(az),
      c.target[1] + dist * Math.sin(el),
      c.target[2] + dist * Math.cos(el) * Math.cos(az),
    );
    this.camera.lookAt(c.target[0], c.target[1], c.target[2]);
    this.viewSide = c.side;
    this.applyViewOffset(c.side);
  }
}
