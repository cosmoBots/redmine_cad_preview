// Generic, versioned camera state. No persistence or cosmoSys dependency.
export function readView(viewer) {
  const camera = viewer.camera;
  return {
    version: 1, projection: camera.isOrthographicCamera ? 'orthographic' : 'perspective',
    position: camera.position.toArray(), target: viewer.controls.target.toArray(),
    up: camera.up.toArray(), near: camera.near, far: camera.far, zoom: camera.zoom,
    fov: camera.isPerspectiveCamera ? camera.fov : 45,
    frustum_height: camera.isOrthographicCamera ? camera.top - camera.bottom : 1,
    aspect: viewer.canvas.width / viewer.canvas.height,
    material: viewer.element.dataset.materialMode || 'original',
    lighting: viewer.element.dataset.lighting || 'studio',
    background: `#${viewer.scene.background.getHexString()}`, wireframe: viewer.wireframe
  };
}

export function applyView(viewer, state) {
  if (state.version !== 1) throw new Error('Unsupported CAD view version');
  viewer.setProjection(state.projection, state.frustum_height);
  const camera = viewer.camera;
  // Drain OrbitControls damping before replacing the camera pose.
  const damping = viewer.controls.enableDamping;
  viewer.controls.enableDamping = false;
  viewer.controls.update();
  camera.position.fromArray(state.position);
  camera.up.fromArray(state.up);
  camera.near = state.near;
  camera.far = state.far;
  camera.zoom = state.zoom;
  if (camera.isPerspectiveCamera) camera.fov = state.fov;
  viewer.controls.target.fromArray(state.target);
  viewer.scene.background.set(state.background);
  viewer.setMaterialMode(state.material);
  viewer.setLighting(state.lighting);
  if (viewer.wireframe !== state.wireframe) viewer.toggleWireframe();
  viewer.resize();
  viewer.controls.update();
  viewer.controls.enableDamping = damping;
  viewer.render();
}
