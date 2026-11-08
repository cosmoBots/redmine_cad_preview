// Generic, versioned camera state. No persistence or cosmoSys dependency.
export function readView(viewer) {
  const camera = viewer.camera;
  const hidden = viewer.hiddenParts?.() || [];
  const section = viewer.sectionState?.() || null;
  return {
    version: 1, projection: camera.isOrthographicCamera ? 'orthographic' : 'perspective',
    position: camera.position.toArray(), target: viewer.controls.target.toArray(),
    up: camera.up.toArray(), near: camera.near, far: camera.far, zoom: camera.zoom,
    fov: camera.isPerspectiveCamera ? camera.fov : 45,
    frustum_height: camera.isOrthographicCamera ? camera.top - camera.bottom : 1,
    aspect: viewer.canvas.width / viewer.canvas.height,
    material: viewer.element.dataset.materialMode || 'original',
    lighting: viewer.element.dataset.lighting || 'original',
    background: `#${viewer.scene.background.getHexString()}`, wireframe: viewer.wireframe,
    axes: viewer.axesVisible !== false,
    // Only if parts are hidden, so that the views saved before are unchanged
    ...(hidden.length > 0 ? { hidden } : {}),
    // Only if the model is cut: {axis, position, flip}
    ...(section ? { section } : {})
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
  viewer.setAxesVisible?.(state.axes !== false);
  if (viewer.wireframe !== state.wireframe) viewer.toggleWireframe();
  viewer.setHiddenParts?.(state.hidden || []);
  viewer.setSection?.(state.section || null);
  viewer.resize();
  viewer.controls.update();
  viewer.controls.enableDamping = damping;
  // The viewer renders in the next frame, if it can
  if (viewer.requestRender) viewer.requestRender();
  else viewer.render();
}
