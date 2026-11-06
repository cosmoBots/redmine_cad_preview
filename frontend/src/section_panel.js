// Controls of the section view in the toolbar (axis, position, flip) and the
// arrow in the view to move the plane with the mouse. The markup is in
// app/views/cad_previews/_viewer.html.erb.

import { Object3D } from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { fractionOf, positionAt } from './section_view.js';

const STEPS = 1000;

export class SectionPanel {
  constructor(element, viewer) {
    this.viewer = viewer;
    this.button = element.querySelector('[data-cad-action="section"]');
    this.controls = element.querySelector('.cad-preview-section-controls');
    this.axis = this.controls.querySelector('[data-cad-section-axis]');
    this.slider = this.controls.querySelector('[data-cad-section-position]');
    this.slider.max = STEPS;

    this.axis.addEventListener('change', () => {
      const fraction = Number(this.slider.value) / STEPS;
      viewer.setSection({ ...viewer.sectionState(), axis: this.axis.value,
                          position: positionAt(viewer.visibleBox(), this.axis.value, fraction) });
    });
    this.slider.addEventListener('input', () => {
      const state = viewer.sectionState();
      viewer.setSection({ ...state, position: positionAt(viewer.visibleBox(), state.axis, Number(this.slider.value) / STEPS) });
    });

    // The plane is moved with the arrow of TransformControls along the axis
    this.handle = new Object3D();
    this.transform = new TransformControls(viewer.camera, viewer.canvas);
    this.transform.setMode('translate');
    this.transform.setSize(0.8);
    this.transform.addEventListener('change', () => viewer.requestRender());
    this.transform.addEventListener('dragging-changed', (event) => { viewer.controls.enabled = !event.value; });
    this.transform.addEventListener('objectChange', () => {
      const state = viewer.sectionState();
      const box = viewer.visibleBox();
      const position = Math.min(Math.max(this.handle.position[state.axis], box.min[state.axis]), box.max[state.axis]);
      viewer.setSection({ ...state, position });
    });
    viewer.sectionChanged = () => this.refresh();
    viewer.sectionTransform = this.transform;
  }

  toggle() {
    const viewer = this.viewer;
    if (viewer.sectionState()) {
      viewer.setSection(null);
    } else {
      const box = viewer.visibleBox();
      viewer.setSection({ axis: 'x', position: positionAt(box, 'x', 0.5), flip: false });
    }
  }

  flip() {
    const state = this.viewer.sectionState();
    if (state) this.viewer.setSection({ ...state, flip: !state.flip });
  }

  // Shows the state of the section in the controls and moves the arrow
  refresh() {
    const viewer = this.viewer;
    const state = viewer.sectionState();
    this.button.classList.toggle('selected', !!state);
    this.controls.hidden = !state;
    if (!state) {
      this.transform.detach();
      viewer.scene.remove(this.transform.getHelper(), this.handle);
      return;
    }
    this.axis.value = state.axis;
    const box = viewer.visibleBox();
    this.slider.value = Math.round(fractionOf(box, state.axis, state.position) * STEPS);
    if (!this.handle.parent) viewer.scene.add(this.handle, this.transform.getHelper());
    this.transform.camera = viewer.camera;
    if (!box.isEmpty()) box.getCenter(this.handle.position);
    this.handle.position[state.axis] = state.position;
    for (const axis of ['x', 'y', 'z']) this.transform[`show${axis.toUpperCase()}`] = axis === state.axis;
    if (this.transform.object !== this.handle) this.transform.attach(this.handle);
  }
}
