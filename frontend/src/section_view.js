// Section view of 3D models: a clipping plane along the X, Y or Z axis of the
// model, with closed cut faces.
//
// The cut faces are drawn with the stencil technique of three.js (example
// webgl_clipping_stencil): the back faces of each mesh behind the plane count
// up and the front faces count down in the stencil buffer, so that a plane
// drawn where the count is not zero closes the cut.

import * as THREE from 'three';

export const AXES = ['x', 'y', 'z'];
const CAP_COLOR = 0xadb5bd;

// Plane that keeps the part of the model on the negative side of the
// position along the axis, or on the positive side if flipped. Three.js clips
// what is on the negative side of a clipping plane.
export function sectionPlane(axis, position, flip, plane = new THREE.Plane()) {
  const normal = new THREE.Vector3();
  normal[axis] = flip ? 1 : -1;
  return plane.set(normal, flip ? -position : position);
}

// Position at the fraction of the box along the axis, and back
export function positionAt(box, axis, fraction) {
  return box.min[axis] + (box.max[axis] - box.min[axis]) * fraction;
}

export function fractionOf(box, axis, position) {
  const size = box.max[axis] - box.min[axis];
  return size > 0 ? THREE.MathUtils.clamp((position - box.min[axis]) / size, 0, 1) : 0.5;
}

function stencilMaterial(plane, side, operation) {
  return new THREE.MeshBasicMaterial({
    depthWrite: false, depthTest: false, colorWrite: false,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
    side, clippingPlanes: [plane],
    stencilFail: operation, stencilZFail: operation, stencilZPass: operation
  });
}

export class SectionView {
  constructor(viewer) {
    this.viewer = viewer;
    this.plane = new THREE.Plane();
    this.state = null;
    // No render order for the group: it would be sorted before the cap
    this.group = new THREE.Group();
    this.back = stencilMaterial(this.plane, THREE.BackSide, THREE.IncrementWrapStencilOp);
    this.front = stencilMaterial(this.plane, THREE.FrontSide, THREE.DecrementWrapStencilOp);
    this.cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
      color: CAP_COLOR, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp
    }));
    this.cap.renderOrder = 2;
    this.cap.onAfterRender = (renderer) => renderer.clearStencil();
  }

  get active() {
    return this.state !== null;
  }

  // Box of the parts that are shown, which the position is relative to
  box() {
    return this.viewer.visibleBox();
  }

  // state: {axis, position, flip} with the position in model coordinates,
  // or null to show the whole model
  set(state) {
    if (!state) {
      this.disable();
      return;
    }
    if (!AXES.includes(state.axis)) throw new Error(`Unsupported section axis: ${state.axis}`);
    if (!this.active) this.enable();
    this.state = { axis: state.axis, position: Number(state.position), flip: !!state.flip };
    this.update();
  }

  enable() {
    const viewer = this.viewer;
    viewer.renderer.localClippingEnabled = true;
    this.stencils = [];
    viewer.object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      for (const material of [this.back, this.front]) {
        const stencil = new THREE.Mesh(mesh.geometry, material);
        stencil.matrixAutoUpdate = false;
        stencil.renderOrder = 1;
        stencil.raycast = () => {};
        this.group.add(stencil);
        this.stencils.push([stencil, mesh]);
      }
    });
    this.cap.raycast = () => {};
    viewer.scene.add(this.group, this.cap);
    this.state = this.state || { axis: 'x', position: 0, flip: false };
  }

  disable() {
    if (!this.active) return;
    this.state = null;
    this.viewer.scene.remove(this.group, this.cap);
    this.group.clear();
    this.stencils = [];
    this.applyMaterials();
  }

  // Sets the clipping plane on the materials of the model. Called again when
  // the materials are replaced (matte mode).
  applyMaterials() {
    const planes = this.active ? [this.plane] : [];
    this.viewer.object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      for (const material of [].concat(mesh.material)) {
        if (material.clippingPlanes?.[0] === planes[0] && material.clippingPlanes?.length === planes.length) continue;
        material.clippingPlanes = planes;
        material.needsUpdate = true;
      }
    });
  }

  update() {
    const { axis, position, flip } = this.state;
    sectionPlane(axis, position, flip, this.plane);
    this.applyMaterials();

    // The cap is a plane through the position, larger than the model
    const box = this.box();
    const size = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length() * 2;
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    center[axis] = position;
    this.cap.scale.set(size, size, 1);
    this.cap.position.copy(center);
    this.cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.plane.normal);
    this.cap.updateMatrixWorld();
  }

  // Follows the transforms and the visibility of the meshes before rendering
  beforeRender() {
    if (!this.active) return;
    for (const [stencil, mesh] of this.stencils) {
      stencil.matrix.copy(mesh.matrixWorld);
      stencil.matrixWorldNeedsUpdate = true;
      stencil.visible = this.viewer.isShown(mesh);
    }
  }

  // True if the point is not cut away
  keeps(point) {
    return !this.active || this.plane.distanceToPoint(point) >= -1e-6;
  }
}
