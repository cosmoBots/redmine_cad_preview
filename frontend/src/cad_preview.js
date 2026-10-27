// CAD viewer of the redmine_cad_preview plugin
//
// The viewer is configured by the data attributes of the element
// [data-cad-preview]:
//   data-url          URL of the file (or of the DXF converted from a DWG file)
//   data-format       step, iges, brep, freecad, stl, obj, 3mf, gltf, glb, ply,
//                     dae, fbx, vrml, amf, 3ds or dxf
//   data-occt-script  URL of occt-import-js.js (STEP, IGES, BREP and FreeCAD only)
//   data-occt-wasm    URL of occt-import-js.wasm (STEP, IGES, BREP and FreeCAD only)
//   data-fonts        JSON array of font URLs (DXF only)
//   data-error        Message shown when the file cannot be displayed
//   data-i18n         JSON object with the labels of the measurements
//   data-filename     Name of the file, used for the downloaded images
//   data-snapshot-url URL to send the snapshot for the thumbnail to (only for
//                     attachments without thumbnail and users who can edit them)
//   data-image-url    URL of the image saved in the file (DXF, DWG), shown for
//                     drawings of 3D solids

import * as THREE from 'three';
import { ModelAppearance, StudioLighting } from './model_appearance.js';
import { readView, applyView } from './view_state.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js';
import { AMFLoader } from 'three/addons/loaders/AMFLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { strFromU8, unzipSync } from 'three/addons/libs/fflate.module.js';
import { DxfViewer } from 'dxf-viewer';
import DxfParser from 'dxf-viewer/src/parser/DxfParser.js';

const Z_UP_FORMATS = ['step', 'iges', 'brep', 'freecad', 'stl', '3mf', 'amf', '3ds'];
const OCCT_FORMATS = { step: 'ReadStepFile', iges: 'ReadIgesFile', brep: 'ReadBrepFile' };
// occt-import-js returns millimeters, glTF uses meters, the other formats have no unit
const MODEL_UNITS = { step: 'mm', iges: 'mm', brep: 'mm', freecad: 'mm', gltf: 'm', glb: 'm' };
// $INSUNITS of DXF files
const DXF_UNITS = { 1: 'in', 2: 'ft', 3: 'mi', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 10: 'yd', 14: 'dm' };
const DEFAULT_COLOR = 0x9aa5b1;
const MAXIMIZED_STORAGE_KEY = 'redmine-cad-preview-maximized';
// A pointer that moves less than this number of pixels is a click, not a drag
const CLICK_TOLERANCE = 4;
const MEASUREMENT_COLOR = '#e8590c';
// A4 in PDF points, and the margin around the image
const PDF_PAGE = { long: 842, short: 595, margin: 28 };
// Maximum size of the snapshot for the thumbnail (the largest Redmine thumbnail)
const SNAPSHOT_SIZE = 800;

// 3D solids (ACIS data) cannot be displayed by dxf-viewer, which skips them.
// They are parsed as empty entities, so that the preview can tell that they
// are missing.
const SOLID_TYPES = ['3DSOLID', 'BODY', 'REGION', 'SURFACE'];
const SOLID_HANDLERS = SOLID_TYPES.map((type) => {
  function SolidParser() {}
  SolidParser.ForEntityName = type;
  SolidParser.prototype.parseEntity = (scanner) => {
    let group = scanner.next();
    while (group !== 'EOF' && group.code !== 0) group = scanner.next();
    return { type };
  };
  return SolidParser;
});
const registerEntityHandler = DxfParser.prototype.registerEntityHandler;
DxfParser.prototype.registerEntityHandler = function register(handlerType) {
  registerEntityHandler.call(this, handlerType);
  for (const handler of SOLID_HANDLERS) {
    if (!this._entityHandlers[handler.ForEntityName]) registerEntityHandler.call(this, handler);
  }
};

// Textures and other files referenced by a model (e.g. by FBX, Collada or
// 3DS files) are not loaded, as only the attachment itself is available. A
// white pixel is loaded instead, so that the colors of the materials are shown.
const WHITE_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC';
const loadingManager = new THREE.LoadingManager();
loadingManager.setURLModifier((url) => (/^(data|blob):/.test(url) ? url : WHITE_PIXEL));

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

function hasZeroNormals(geometry) {
  const normals = geometry.getAttribute('normal')?.array;
  if (!normals) return true;
  for (let i = 0; i < normals.length; i += 3) {
    if (normals[i] === 0 && normals[i + 1] === 0 && normals[i + 2] === 0) return true;
  }
  return false;
}

// Shows animated models in their rest pose and removes the backgrounds of
// VRML scenes, which would be fitted to the view instead of the model
function prepareObject(object) {
  const replacements = [];
  object.traverse((child) => {
    if (child.isSkinnedMesh) {
      replacements.push([child, new THREE.Mesh(child.geometry, child.material)]);
    } else if (child.isMesh && [].concat(child.material).every((m) => m.side === THREE.BackSide && !m.depthTest)) {
      replacements.push([child, null]);
    }
  });
  for (const [child, mesh] of replacements) {
    if (mesh) {
      mesh.name = child.name;
      mesh.position.copy(child.position);
      mesh.quaternion.copy(child.quaternion);
      mesh.scale.copy(child.scale);
      child.parent.add(mesh);
    }
    child.parent.remove(child);
  }
  return object;
}

// FreeCAD documents (.FCStd) are ZIP archives. Document.xml lists the objects
// with the BREP files of their shapes. Only the visible objects are shown, not
// the features they are made of. The visibility is in Document.xml (FreeCAD
// 0.20 and later) or in GuiDocument.xml, the color in GuiDocument.xml.
function freecadToObject(buffer, occt) {
  const files = unzipSync(new Uint8Array(buffer));
  const parse = (name) => files[name] && new DOMParser().parseFromString(strFromU8(files[name]), 'application/xml');
  const documentXml = parse('Document.xml');
  if (!documentXml) throw new Error('Document.xml is missing');

  const property = (element, name) => [...(element?.querySelectorAll(':scope > Properties > Property') || [])]
    .find((p) => p.getAttribute('name') === name);
  const viewProviders = new Map([...(parse('GuiDocument.xml')?.querySelectorAll('ViewProviderData > ViewProvider') || [])]
    .map((provider) => [provider.getAttribute('name'), provider]));
  const objects = [...documentXml.querySelectorAll('ObjectData > Object')].map((object) => {
    const provider = viewProviders.get(object.getAttribute('name'));
    const visibility = property(object, 'Visibility') || property(provider, 'Visibility');
    return {
      file: property(object, 'Shape')?.querySelector('Part')?.getAttribute('file'),
      visible: visibility?.querySelector('Bool')?.getAttribute('value') === 'true',
      color: property(provider, 'ShapeColor')?.querySelector('PropertyColor')?.getAttribute('value')
    };
  }).filter((object) => object.file && files[object.file]);
  const visible = objects.filter((object) => object.visible);

  const group = new THREE.Group();
  for (const object of visible.length > 0 ? visible : objects) {
    const result = occt.ReadBrepFile(files[object.file], null);
    if (!result.success || result.meshes.length === 0) continue;

    const part = occtResultToObject(result);
    if (object.color) {
      // RGBA packed into an unsigned integer
      const value = Number(object.color) >>> 0;
      const color = new THREE.Color().setRGB(((value >>> 24) & 255) / 255, ((value >>> 16) & 255) / 255,
                                             ((value >>> 8) & 255) / 255, THREE.SRGBColorSpace);
      part.traverse((child) => { if (child.isMesh) child.material.color.copy(color); });
    }
    group.add(part);
  }
  if (group.children.length === 0) throw new Error('The file contains no shapes');
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

  // Positions of the points on the canvas and of the label
  geometry() {
    const screen = this.points.map((point) => this.viewer.project(point));
    const text = this.resultText();
    if (!text) return { screen, text, label: null };
    const anchor = this.mode === 'angle' ? screen[1] : {
      x: (screen[0].x + screen[1].x) / 2, y: (screen[0].y + screen[1].y) / 2
    };
    return { screen, text, label: { x: anchor.x + 8, y: anchor.y - 8, text: text.replace(/^[^:]*:\s*/, '') } };
  }

  update() {
    this.svg.replaceChildren();
    const { screen, text, label } = this.geometry();
    if (screen.length > 1) {
      this.svg.appendChild(svgElement('polyline', {
        points: screen.map((p) => `${p.x},${p.y}`).join(' '), class: 'cad-preview-overlay-line'
      }));
    }
    for (const p of screen) this.svg.appendChild(svgElement('circle', { cx: p.x, cy: p.y, r: 4 }));

    this.result.textContent = text || '';
    if (label) {
      const element = svgElement('text', { x: label.x, y: label.y });
      element.textContent = label.text;
      this.svg.appendChild(element);
    }
  }

  // Draws the measurement like the SVG layer, for the downloaded images
  draw(context) {
    const { screen, label } = this.geometry();
    context.save();
    context.strokeStyle = MEASUREMENT_COLOR;
    context.lineWidth = 2;
    if (screen.length > 1) {
      context.beginPath();
      screen.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
      context.stroke();
    }
    context.fillStyle = MEASUREMENT_COLOR;
    context.strokeStyle = '#fff';
    context.lineWidth = 1.5;
    for (const p of screen) {
      context.beginPath();
      context.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      context.fill();
      context.stroke();
    }
    if (label) {
      context.font = 'bold 13px sans-serif';
      context.lineWidth = 3;
      context.lineJoin = 'round';
      context.strokeText(label.text, label.x, label.y);
      context.fillStyle = '#212529';
      context.fillText(label.text, label.x, label.y);
    }
    context.restore();
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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.5));
    this.camera.add(new THREE.DirectionalLight(0xffffff, 1.5));
    this.scene.add(this.camera);
    this.studioLighting = new StudioLighting(this.renderer, this.scene);
    this.studioLighting.apply(element.dataset.lighting || 'studio');

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
    this.object = prepareObject(await this.parse(buffer));
    this.appearance = new ModelAppearance(this.object);
    this.setMaterialMode(this.element.dataset.materialMode || 'original');
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
        // Some programs write zero normals, which are displayed black
        if (hasZeroNormals(geometry)) geometry.computeVertexNormals();
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
        const gltf = await new GLTFLoader(loadingManager).parseAsync(buffer, '');
        return gltf.scene;
      }
      case 'ply': {
        const geometry = new PLYLoader().parse(buffer);
        if (!geometry.index && geometry.getAttribute('position').count % 3 !== 0) {
          // Point cloud without faces
          return new THREE.Points(geometry, new THREE.PointsMaterial({
            size: 2, sizeAttenuation: false, vertexColors: geometry.hasAttribute('color'), color: geometry.hasAttribute('color') ? 0xffffff : DEFAULT_COLOR
          }));
        }
        if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
        const material = defaultMaterial(geometry.hasAttribute('color') ? 0xffffff : DEFAULT_COLOR);
        material.vertexColors = geometry.hasAttribute('color');
        return new THREE.Mesh(geometry, material);
      }
      case 'dae':
        return new ColladaLoader(loadingManager).parse(new TextDecoder().decode(buffer), '').scene;
      case 'fbx':
        return new FBXLoader(loadingManager).parse(buffer, '');
      case 'vrml':
        return new VRMLLoader(loadingManager).parse(new TextDecoder().decode(buffer), '');
      case 'amf':
        return new AMFLoader(loadingManager).parse(buffer);
      case '3ds':
        return new TDSLoader(loadingManager).parse(buffer, '');
      case 'freecad':
        return freecadToObject(buffer, await loadOcct(this.element.dataset.occtScript, this.element.dataset.occtWasm));
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

  setMaterialMode(mode) {
    this.element.dataset.materialMode = mode;
    this.appearance?.apply(mode);
    this.object?.traverse((mesh) => {
      if (mesh.isMesh) for (const material of [].concat(mesh.material)) material.wireframe = this.wireframe;
    });
  }

  setLighting(mode) {
    this.element.dataset.lighting = mode;
    this.studioLighting.apply(mode);
  }

  setProjection(mode, frustumHeight) {
    const old = this.camera;
    const aspect = this.canvas.width / this.canvas.height;
    const height = frustumHeight || 2 * old.position.distanceTo(this.controls.target) * Math.tan(Math.PI / 8);
    const camera = mode === 'orthographic'
      ? new THREE.OrthographicCamera(-height * aspect / 2, height * aspect / 2, height / 2, -height / 2, old.near, old.far)
      : new THREE.PerspectiveCamera(45, aspect, old.near, old.far);
    camera.position.copy(old.position);
    camera.up.copy(old.up);
    while (old.children.length) camera.add(old.children[0]);
    this.scene.remove(old);
    this.scene.add(camera);
    this.camera = camera;
    this.controls.object = camera;
    this.controls.update();
    this.resize();
  }

  exportView() { return readView(this); }
  restoreView(state) { applyView(this, state); }

  getRenderContext() {
    return { canvas: this.canvas, renderer: this.renderer, scene: this.scene,
             render: () => this.render() };
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

  // Renders the current view. The canvas can be copied until the next task.
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // Moves the camera so that the whole model is visible
  fit() {
    if (!this.object) return;
    const box = new THREE.Box3().setFromObject(this.object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad((this.camera.fov || 45) / 2));
    const direction = this.camera.up.z === 1 ? new THREE.Vector3(1, -1, 0.8) : new THREE.Vector3(1, 0.8, 1);

    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.zoom = 1;
    if (this.camera.isOrthographicCamera) {
      const halfHeight = radius / Math.min(1, this.canvas.width / this.canvas.height);
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
      this.resize();
    }
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
    if (this.camera.isOrthographicCamera) {
      const halfHeight = (this.camera.top - this.camera.bottom) / 2;
      this.camera.left = -halfHeight * width / height;
      this.camera.right = halfHeight * width / height;
    } else {
      this.camera.aspect = width / height;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

class DrawingViewer {
  constructor(element) {
    this.element = element;
    this.viewer = new DxfViewer(element.querySelector('.cad-preview-canvas'), {
      clearColor: new THREE.Color(0xffffff),
      canvasAlpha: true,
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
    const dxf = this.viewer.GetDxf();
    this.unit = DXF_UNITS[dxf?.header?.$INSUNITS];
    const entities = dxf?.entities || [];
    this.solids = entities.filter((entity) => SOLID_TYPES.includes(entity.type)).length;
    // A drawing made mostly of 3D solids looks empty in the viewer
    this.mostlySolids = this.solids > 0 && this.solids >= entities.length - this.solids;
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

  render() {
    this.viewer.Render();
  }

  // The bounds are in drawing coordinates, the view in scene coordinates
  fit() {
    const bounds = this.viewer.GetBounds();
    const origin = this.viewer.GetOrigin();
    if (bounds) {
      this.viewer.FitView(bounds.minX - origin.x, bounds.maxX - origin.x, bounds.minY - origin.y, bounds.maxY - origin.y);
    }
  }

  toggleWireframe() {}

  exportView() {
    const camera = this.viewer.GetCamera();
    return { version: 1, projection: 'drawing', center: [camera.position.x, camera.position.y],
             view_width: (camera.right - camera.left) / camera.zoom,
             aspect: this.canvas.width / this.canvas.height };
  }

  restoreView(state) {
    if (state.version !== 1 || state.projection !== 'drawing') throw new Error('Unsupported drawing view');
    const container = this.element.querySelector('.cad-preview-canvas');
    this.viewer.SetSize(container.clientWidth, container.clientHeight);
    this.viewer.SetView({ x: state.center[0], y: state.center[1] }, state.view_width);
    this.render();
  }

  getRenderContext() {
    return { canvas: this.canvas, renderer: this.viewer.GetRenderer(), scene: null,
             render: () => this.render() };
  }
}

// Draws the current view with the measurement and a caption (file name,
// dimensions, measurement) on a new canvas
function captureView(element, viewer, measurement) {
  const source = viewer.canvas;
  const width = source.clientWidth;
  const height = source.clientHeight;
  const scale = source.width / width;
  const lines = [element.dataset.filename,
                 element.querySelector('.cad-preview-dimensions').textContent,
                 element.querySelector('.cad-preview-measurement').textContent].filter(Boolean);
  const lineHeight = 18;
  const captionHeight = lines.length * lineHeight + 12;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round((height + captionHeight) * scale);
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height + captionHeight);
  viewer.render();
  context.drawImage(source, 0, 0, width, height);
  measurement.draw(context);

  context.fillStyle = '#212529';
  context.font = '13px sans-serif';
  context.textBaseline = 'top';
  lines.forEach((line, i) => context.fillText(line, 8, height + 6 + i * lineHeight, width - 16));
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be created'))), type, quality);
  });
}

// Creates a PDF with one A4 page that shows the canvas as a JPEG image.
// PDF supports JPEG images directly (DCTDecode), so no library is needed.
async function canvasToPdf(canvas) {
  const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
  const landscape = canvas.width >= canvas.height;
  const pageWidth = landscape ? PDF_PAGE.long : PDF_PAGE.short;
  const pageHeight = landscape ? PDF_PAGE.short : PDF_PAGE.long;
  const fit = Math.min((pageWidth - 2 * PDF_PAGE.margin) / canvas.width,
                       (pageHeight - 2 * PDF_PAGE.margin) / canvas.height);
  const imageWidth = (canvas.width * fit).toFixed(2);
  const imageHeight = (canvas.height * fit).toFixed(2);
  const x = ((pageWidth - imageWidth) / 2).toFixed(2);
  const y = ((pageHeight - imageHeight) / 2).toFixed(2);
  const content = `q ${imageWidth} 0 0 ${imageHeight} ${x} ${y} cm /Im0 Do Q`;

  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const write = (part) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (number, ...body) => {
    offsets[number] = length;
    write(`${number} 0 obj\n`);
    body.forEach(write);
    write('\nendobj\n');
  };

  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
            '/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>');
  object(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  object(5, `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
         jpeg, '\nendstream');
  const xref = length;
  write(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`);
  write(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadView(element, viewer, measurement, type) {
  const canvas = captureView(element, viewer, measurement);
  const basename = (element.dataset.filename || 'cad-preview').replace(/\.[^.]+$/, '');
  if (type === 'pdf') {
    saveBlob(await canvasToPdf(canvas), `${basename}.pdf`);
  } else {
    saveBlob(await canvasToBlob(canvas, 'image/png'), `${basename}.png`);
  }
}

// Sends a snapshot of the view after loading to Redmine, which uses it for
// the thumbnail of the attachment
async function sendSnapshot(element, viewer) {
  const source = viewer.canvas;
  const scale = Math.min(1, SNAPSHOT_SIZE / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  viewer.render();
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);

  const token = document.querySelector('meta[name="csrf-token"]')?.content;
  await fetch(element.dataset.snapshotUrl, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'image/png', 'X-CSRF-Token': token || '' },
    body: await canvasToBlob(canvas, 'image/png')
  });
}

// Shows a notice for drawings with 3D solids, and the image saved in the file
// instead of a drawing that looks empty
function showSolidsNotice(element, viewer, i18n) {
  if (!viewer.solids) return;
  const notice = document.createElement('p');
  notice.className = 'warning cad-preview-notice';
  notice.textContent = i18n.solids;
  element.querySelector('.cad-preview-canvas').before(notice);

  if (viewer.mostlySolids && element.dataset.imageUrl) {
    const image = document.createElement('img');
    image.className = 'cad-preview-fallback-image';
    image.src = element.dataset.imageUrl;
    image.alt = element.dataset.filename || '';
    element.querySelector('.cad-preview-canvas').appendChild(image);
  }
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
    fullscreen: () => toggleFullscreen(element),
    'download-png': () => downloadView(element, viewer, measurement, 'png'),
    'download-pdf': () => downloadView(element, viewer, measurement, 'pdf')
  };
  element.querySelectorAll('[data-cad-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      actions[button.dataset.cadAction]?.();
    });
  });
  element.querySelector('[data-cad-material-mode]')?.addEventListener('change', (event) => {
    viewer.setMaterialMode(event.target.value);
  });
  element.querySelector('[data-cad-lighting]')?.addEventListener('change', (event) => {
    viewer.setLighting(event.target.value);
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
    showSolidsNotice(element, viewer, i18n);
    status.hidden = true;
    element.cadViewer = viewer;
    element.dispatchEvent(new CustomEvent('cad-preview:ready', { bubbles: true, detail: { viewer } }));
    if (element.dataset.snapshotUrl && !viewer.mostlySolids) {
      sendSnapshot(element, viewer).catch((error) => console.error('CAD preview snapshot:', error));
    }
  } catch (error) {
    console.error('CAD preview:', error);
    element.cadError = error;
    element.dispatchEvent(new CustomEvent('cad-preview:error', { bubbles: true }));
    status.textContent = element.dataset.error;
    status.classList.add('cad-preview-error');
  }
}

document.querySelectorAll('[data-cad-preview]').forEach(initialize);
