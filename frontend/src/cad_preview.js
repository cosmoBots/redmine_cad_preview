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

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DxfViewer } from 'dxf-viewer';

const Z_UP_FORMATS = ['step', 'iges', 'brep', 'stl', '3mf'];
const OCCT_FORMATS = { step: 'ReadStepFile', iges: 'ReadIgesFile', brep: 'ReadBrepFile' };
const DEFAULT_COLOR = 0x9aa5b1;

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

class ModelViewer {
  constructor(element) {
    this.element = element;
    this.canvasContainer = element.querySelector('.cad-preview-canvas');
    this.format = element.dataset.format;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f6f7);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    if (Z_UP_FORMATS.includes(this.format)) this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.5));
    this.light = new THREE.DirectionalLight(0xffffff, 1.5);
    this.camera.add(this.light);
    this.scene.add(this.camera);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.wireframe = false;

    new ResizeObserver(() => this.resize()).observe(this.canvasContainer);
    this.resize();
    this.animate();
  }

  async load() {
    const buffer = await fetchFile(this.element.dataset.url);
    this.object = await this.parse(buffer);
    this.scene.add(this.object);
    this.fit();
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

  animate() {
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}

class DrawingViewer {
  constructor(element) {
    this.element = element;
    this.viewer = new DxfViewer(element.querySelector('.cad-preview-canvas'), {
      clearColor: new THREE.Color(0xffffff),
      autoResize: true,
      colorCorrection: true
    });
  }

  async load() {
    await this.viewer.Load({
      url: this.element.dataset.url,
      fonts: JSON.parse(this.element.dataset.fonts || '[]')
    });
    this.fit();
  }

  fit() {
    const bounds = this.viewer.GetBounds();
    if (bounds) this.viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
  }

  toggleWireframe() {}
}

async function initialize(element) {
  const status = element.querySelector('.cad-preview-status');
  const viewer = element.dataset.format === 'dxf' ? new DrawingViewer(element) : new ModelViewer(element);

  element.querySelectorAll('[data-cad-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (button.dataset.cadAction === 'fit') viewer.fit();
      if (button.dataset.cadAction === 'wireframe') viewer.toggleWireframe();
    });
  });

  try {
    await viewer.load();
    status.hidden = true;
  } catch (error) {
    console.error('CAD preview:', error);
    status.textContent = element.dataset.error;
    status.classList.add('cad-preview-error');
  }
}

document.querySelectorAll('[data-cad-preview]').forEach(initialize);
