// CAD viewer of the redmine_cad_preview plugin
//
// The viewer is configured by the data attributes of the element
// [data-cad-preview]:
//   data-url          URL of the file (or of the DXF converted from a DWG file)
//   data-format       step, iges, brep, stl, obj, 3mf, gltf, glb or dxf
//   data-occt-script  URL of occt-import-js.js (STEP, IGES and BREP only)
//   data-occt-wasm    URL of occt-import-js.wasm (STEP, IGES and BREP only)
//   data-fonts        JSON array of font URLs (DXF only)
//   data-error        Message shown when the file cannot be displayed
//   data-i18n         JSON object with the labels of the measurements

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DxfViewer } from 'dxf-viewer';

const Z_UP_FORMATS = ['step', 'iges', 'brep', 'stl', '3mf'];
const OCCT_FORMATS = { step: 'ReadStepFile', iges: 'ReadIgesFile', brep: 'ReadBrepFile' };
// occt-import-js returns millimeters, glTF uses meters, the other formats have no unit
const MODEL_UNITS = { step: 'mm', iges: 'mm', brep: 'mm', gltf: 'm', glb: 'm' };
// $INSUNITS of DXF files
const DXF_UNITS = { 1: 'in', 2: 'ft', 3: 'mi', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 10: 'yd', 14: 'dm' };
const DEFAULT_COLOR = 0x9aa5b1;
const MAXIMIZED_STORAGE_KEY = 'redmine-cad-preview-maximized';
// A pointer that moves less than this number of pixels is a click, not a drag
const CLICK_TOLERANCE = 4;

let occtPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadOcct(scriptUrl, wasmUrl) {
  if (!occtPromise) {
    occtPromise = loadScript(scriptUrl)
      .then(() => window.occtimportjs({ locateFile: () => wasmUrl }));
  }
  return occtPromise;
}

async function fetchFile(url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}

function defaultMaterial(color = DEFAULT_COLOR) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide
  });
}

// Converts the result of occt-import-js into three.js meshes
function occtResultToObject(result) {
  const group = new THREE.Group();
  for (const mesh of result.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
    if (mesh.attributes.normal) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
    }
    geometry.setIndex(new THREE.Uint32BufferAttribute(Uint32Array.from(mesh.index.array), 1));
    if (!mesh.attributes.normal) geometry.computeVertexNormals();

    const color = mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : DEFAULT_COLOR;
    group.add(new THREE.Mesh(geometry, defaultMaterial(color)));
  }
  return group;
}

function formatNumber(value) {
  return new Intl.NumberFormat(document.documentElement.lang || undefined, { maximumFractionDigits: 3 }).format(value);
}

function formatLength(value, unit, i18n) {
  return `${formatNumber(value)} ${unit || i18n.units}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

// Measures distances (2 points) and angles (3 points). The points are picked
// by the viewer in model coordinates and drawn on an SVG layer above the canvas.
class Measurement {
  constructor(viewer, element, i18n) {
    this.viewer = viewer;
    this.element = element;
    this.i18n = i18n;
    this.mode = null;
    this.points = [];
    this.result = element.querySelector('.cad-preview-measurement');
    this.svg = svgElement('svg', { class: 'cad-preview-overlay' });
    element.querySelector('.cad-preview-canvas').appendChild(this.svg);
  }

  get requiredPoints() {
    return this.mode === 'angle' ? 3 : 2;
  }

  toggle(mode) {
    this.mode = this.mode === mode ? null : mode;
    this.clear();
    this.element.classList.toggle('cad-preview-measuring', this.mode !== null);
    this.element.querySelectorAll('[data-cad-action^="measure-"]').forEach((button) => {
      button.classList.toggle('selected', button.dataset.cadAction === `measure-${this.mode}`);
    });
  }

  // Returns true if the click was used for the measurement
  click(clientX, clientY) {
    if (!this.mode) return false;
    const point = this.viewer.pick(clientX, clientY);
    if (!point) return true;
    if (this.points.length >= this.requiredPoints) this.points = [];
    this.points.push(point);
    this.update();
    return true;
  }

  clear() {
    const hadPoints = this.points.length > 0;
    this.points = [];
    this.update();
    return hadPoints;
  }

  update() {
    this.svg.replaceChildren();
    const screen = this.points.map((point) => this.viewer.project(point));
    if (screen.length > 1) {
      this.svg.appendChild(svgElement('polyline', {
        points: screen.map((p) => `${p.x},${p.y}`).join(' '), class: 'cad-preview-overlay-line'
      }));
    }
    for (const p of screen) this.svg.appendChild(svgElement('circle', { cx: p.x, cy: p.y, r: 4 }));

    const text = this.resultText();
    this.result.textContent = text || '';
    if (text) {
      const anchor = this.mode === 'angle' ? screen[1] : {
        x: (screen[0].x + screen[1].x) / 2, y: (screen[0].y + screen[1].y) / 2
      };
      const label = svgElement('text', { x: anchor.x + 8, y: anchor.y - 8 });
      label.textContent = text.replace(/^[^:]*:\s*/, '');
      this.svg.appendChild(label);
    }
  }

  resultText() {
    if (this.points.length < this.requiredPoints) return null;
    if (this.mode === 'angle') {
      const [a, b, c] = this.points;
      const angle = THREE.MathUtils.radToDeg(a.clone().sub(b).angleTo(c.clone().sub(b)));
      return `${this.i18n.angle}: ${formatNumber(angle)}°`;
    }
    const [a, b] = this.points;
    return `${this.i18n.distance}: ${formatLength(a.distanceTo(b), this.viewer.unit, this.i18n)}`;
  }
}

class ModelViewer {
  constructor(element) {
    this.element = element;
    this.canvasContainer = element.querySelector('.cad-preview-canvas');
    this.format = element.dataset.format;
    this.unit = MODEL_UNITS[this.format];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f6f7);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    if (Z_UP_FORMATS.includes(this.format)) this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.5));
    this.camera.add(new THREE.DirectionalLight(0xffffff, 1.5));
    this.scene.add(this.camera);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.raycaster = new THREE.Raycaster();
    this.wireframe = false;

    new ResizeObserver(() => this.resize()).observe(this.canvasContainer);
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  async load() {
    const buffer = await fetchFile(this.element.dataset.url);
    this.object = await this.parse(buffer);
    this.scene.add(this.object);
    this.fit();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.measurement?.update();
    });
  }

  async parse(buffer) {
    switch (this.format) {
      case 'stl': {
        const geometry = new STLLoader().parse(buffer);
        return new THREE.Mesh(geometry, defaultMaterial(geometry.hasColors ? 0xffffff : DEFAULT_COLOR));
      }
      case 'obj': {
        const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
        object.traverse((child) => { if (child.isMesh) child.material = defaultMaterial(); });
        return object;
      }
      case '3mf':
        return new ThreeMFLoader().parse(buffer);
      case 'gltf':
      case 'glb': {
        const gltf = await new GLTFLoader().parseAsync(buffer, '');
        return gltf.scene;
      }
      default: {
        const method = OCCT_FORMATS[this.format];
        if (!method) throw new Error(`Unsupported format: ${this.format}`);
        const occt = await loadOcct(this.element.dataset.occtScript, this.element.dataset.occtWasm);
        const result = occt[method](new Uint8Array(buffer), null);
        if (!result.success || result.meshes.length === 0) throw new Error('The file could not be read');
        return occtResultToObject(result);
      }
    }
  }

  // Size of the model along the x, y and z axes
  dimensions() {
    const size = new THREE.Box3().setFromObject(this.object).getSize(new THREE.Vector3());
    return [size.x, size.y, size.z];
  }

  // Returns the point of the model under the pointer, or null
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1,
                                      -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.object, true)[0];
    return hit ? hit.point.clone() : null;
  }

  // Returns the position of a point of the model on the canvas
  project(point) {
    const projected = point.clone().project(this.camera);
    return {
      x: (projected.x + 1) / 2 * this.canvas.clientWidth,
      y: (1 - projected.y) / 2 * this.canvas.clientHeight
    };
  }

  // Moves the camera so that the whole model is visible
  fit() {
    if (!this.object) return;
    const box = new THREE.Box3().setFromObject(this.object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const direction = this.camera.up.z === 1 ? new THREE.Vector3(1, -1, 0.8) : new THREE.Vector3(1, 0.8, 1);

    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  toggleWireframe() {
    this.wireframe = !this.wireframe;
    this.object?.traverse((child) => {
      if (!child.isMesh) return;
      for (const material of [].concat(child.material)) material.wireframe = this.wireframe;
    });
  }

  resize() {
    const width = this.canvasContainer.clientWidth;
    const height = this.canvasContainer.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

class DrawingViewer {
  constructor(element) {
    this.element = element;
    this.viewer = new DxfViewer(element.querySelector('.cad-preview-canvas'), {
      clearColor: new THREE.Color(0xffffff),
      autoResize: true,
      colorCorrection: true,
      retainParsedDxf: true
    });
    this.viewer.Subscribe('viewChanged', () => this.measurement?.update());
  }

  get canvas() {
    return this.viewer.GetCanvas();
  }

  async load() {
    await this.viewer.Load({
      url: this.element.dataset.url,
      fonts: JSON.parse(this.element.dataset.fonts || '[]')
    });
    this.unit = DXF_UNITS[this.viewer.GetDxf()?.header?.$INSUNITS];
    this.fit();
  }

  dimensions() {
    const bounds = this.viewer.GetBounds();
    return bounds ? [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY] : null;
  }

  // Points are kept in scene coordinates. Distances and angles do not depend
  // on the origin of the scene.
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const point = this.viewer.CanvasToSceneCoord(clientX - rect.left, clientY - rect.top);
    return new THREE.Vector3(point.x, point.y, 0);
  }

  project(point) {
    return this.viewer.SceneToCanvasCoord(point.x, point.y);
  }

  fit() {
    const bounds = this.viewer.GetBounds();
    if (bounds) this.viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
  }

  toggleWireframe() {}
}

function readMaximized() {
  try {
    return window.localStorage.getItem(MAXIMIZED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeMaximized(maximized) {
  try {
    window.localStorage.setItem(MAXIMIZED_STORAGE_KEY, maximized ? 'true' : 'false');
  } catch {
    // localStorage is not available, e.g. in private browsing
  }
}

function setMaximized(element, maximized) {
  element.classList.toggle('cad-preview-maximized', maximized);
  document.body.classList.toggle('cad-preview-maximized-body', maximized);
  storeMaximized(maximized);
}

function toggleFullscreen(element) {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    element.requestFullscreen?.();
  }
}

function showDimensions(element, viewer, i18n) {
  const dimensions = viewer.dimensions();
  if (!dimensions) return;
  element.querySelector('.cad-preview-dimensions').textContent =
    `${i18n.dimensions}: ${dimensions.map(formatNumber).join(' × ')} ${viewer.unit || i18n.units}`;
}

// Calls the callback for clicks on the canvas that are not drags
function onClick(canvas, callback) {
  let start = null;
  canvas.addEventListener('pointerdown', (event) => {
    start = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_TOLERANCE) {
      callback(event);
    }
    start = null;
  });
}

async function initialize(element) {
  const status = element.querySelector('.cad-preview-status');
  const i18n = JSON.parse(element.dataset.i18n || '{}');
  const viewer = element.dataset.format === 'dxf' ? new DrawingViewer(element) : new ModelViewer(element);
  const measurement = new Measurement(viewer, element, i18n);

  if (readMaximized()) setMaximized(element, true);

  const actions = {
    fit: () => viewer.fit(),
    wireframe: () => viewer.toggleWireframe(),
    'measure-distance': () => measurement.toggle('distance'),
    'measure-angle': () => measurement.toggle('angle'),
    maximize: () => setMaximized(element, !element.classList.contains('cad-preview-maximized')),
    fullscreen: () => toggleFullscreen(element)
  };
  element.querySelectorAll('[data-cad-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      actions[button.dataset.cadAction]?.();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || document.fullscreenElement) return;
    if (!measurement.clear() && element.classList.contains('cad-preview-maximized')) {
      setMaximized(element, false);
    }
  });

  try {
    await viewer.load();
    viewer.measurement = measurement;
    onClick(viewer.canvas, (event) => measurement.click(event.clientX, event.clientY));
    showDimensions(element, viewer, i18n);
    status.hidden = true;
  } catch (error) {
    console.error('CAD preview:', error);
    status.textContent = element.dataset.error;
    status.classList.add('cad-preview-error');
  }
}

document.querySelectorAll('[data-cad-preview]').forEach(initialize);
