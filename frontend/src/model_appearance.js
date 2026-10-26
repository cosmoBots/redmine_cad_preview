import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Clone, never alter the source material: several meshes can share it and the
// user must be able to return to its original PBR appearance without reloading.
export function matteMaterial(original) {
  const material = original.isMeshStandardMaterial ? original.clone() : new THREE.MeshStandardMaterial({
    color: original.color?.clone() || 0xcccccc,
    map: original.map || null,
    side: original.side,
    transparent: original.transparent,
    opacity: original.opacity,
    alphaTest: original.alphaTest,
    vertexColors: original.vertexColors,
    wireframe: original.wireframe,
    depthWrite: original.depthWrite
  });
  material.metalness = 0;
  material.roughness = 1;
  material.roughnessMap = null;
  material.metalnessMap = null;
  if ('clearcoat' in material) material.clearcoat = 0;
  material.needsUpdate = true;
  return material;
}

export class ModelAppearance {
  constructor(root) {
    this.root = root;
    this.originals = new WeakMap();
    this.matte = new WeakMap();
  }

  apply(mode) {
    this.root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (!this.originals.has(mesh)) this.originals.set(mesh, mesh.material);
      const original = this.originals.get(mesh);
      if (mode !== 'matte') {
        mesh.material = original;
        return;
      }
      const convert = (material) => {
        if (!this.matte.has(material)) this.matte.set(material, matteMaterial(material));
        return this.matte.get(material);
      };
      mesh.material = Array.isArray(original) ? original.map(convert) : convert(original);
    });
  }
}

export class StudioLighting {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.target = null;
  }

  apply(mode) {
    if (mode === 'studio' && !this.target) {
      const generator = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      try {
        this.target = generator.fromScene(room, 0.04);
      } finally {
        room.dispose();
        generator.dispose();
      }
    }
    // IBL is essential for fully metallic materials: increasing diffuse lights
    // alone does not give their specular response an environment to reflect.
    this.scene.environment = mode === 'studio' ? this.target.texture : null;
    this.scene.environmentIntensity = 1;
  }
}
