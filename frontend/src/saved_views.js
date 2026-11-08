// Saved views of the viewer: the user restores a view from the list, and saves
// or deletes views if allowed. Each view is saved with an image of the view,
// without background and cropped to the model.
//
// The element [data-cad-preview] has the data attributes:
//   data-views-url       URL of the views (with the session of the user)
//   data-view            name of the view restored after loading, instead of
//                        the default view

// Maximum width and height of the image of a view
export const MAX_IMAGE_SIZE = 1600;
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

// Returns the bounds of the pixels that are not transparent, or null if all
// pixels are transparent
export function opaqueBounds({ data, width, height }) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// True if the states show the same view. The aspect of the viewport is
// ignored, and small differences of numbers are ignored, as restoring a view
// can change its numbers slightly.
export function sameState(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => sameState(value, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.delete('aspect');
    return [...keys].every((key) => key === 'axes'
      ? (a[key] !== false) === (b[key] !== false) : sameState(a[key], b[key]));
  }
  return a === b;
}

// Returns the size scaled down to fit into max x max
export function fitSize(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Returns a canvas with the current view without background, cropped to the
// model and scaled down to MAX_IMAGE_SIZE
export function captureImage(viewer) {
  const source = viewer.canvas;
  const full = document.createElement('canvas');
  full.width = source.width;
  full.height = source.height;
  const context = full.getContext('2d', { willReadFrequently: true });
  viewer.drawTransparent(context);
  const bounds = opaqueBounds(context.getImageData(0, 0, full.width, full.height));
  if (!bounds) throw new Error('The view is empty');

  const size = fitSize(bounds.width, bounds.height, MAX_IMAGE_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d').drawImage(full, bounds.x, bounds.y, bounds.width, bounds.height,
                                    0, 0, size.width, size.height);
  viewer.drawAxes?.(canvas.getContext('2d'), size.width, size.height);
  return canvas;
}

export class SavedViews {
  constructor(element, viewer, i18n) {
    this.element = element;
    this.viewer = viewer;
    this.i18n = i18n;
    this.url = element.dataset.viewsUrl;
    this.views = [];
    // The view that was restored or saved last, with its state
    this.active = null;
    // True if the view has been changed since then. The list then shows
    // "Changed view", so that the view can be restored by choosing it again.
    this.changed = false;
    this.select = element.querySelector('[data-cad-view]');
    this.form = element.querySelector('.cad-preview-view-form');
    this.status = element.querySelector('.cad-preview-view-status');
  }

  // The view that was chosen or saved last, which is saved or deleted
  get selected() {
    return this.views.find((view) => view.name === this.active?.name);
  }

  // Loads the views and restores the default view
  async load() {
    this.select.addEventListener('change', () => {
      const view = this.views.find((v) => v.name === this.select.value);
      if (view) this.restore(view);
      this.updateButtons();
    });
    // Rotating, zooming and the buttons of the toolbar change the view. It is
    // checked after the movement has stopped.
    let timer = null;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.checkChanged(), 600);
    };
    for (const type of ['pointerup', 'wheel', 'keyup', 'change', 'click']) {
      this.element.addEventListener(type, check, { capture: true, passive: true });
    }
    this.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.save();
    });
    this.form?.querySelector('[data-cad-view-cancel]')?.addEventListener('click', () => this.closeForm());

    this.views = (await this.request('GET', this.url)).views;
    this.updateList();
    const name = this.element.dataset.view;
    const view = name ? this.views.find((v) => v.name === name.toLowerCase()) : this.views.find((v) => v.is_default);
    if (view) {
      this.restore(view);
    } else if (name) {
      // A view that was asked for is not replaced by another view
      this.showStatus(this.i18n.view_not_found.replace('%{name}', name), 'error');
    }
    this.updateButtons();
  }

  // Returns the name of the view that was restored or saved last, if the
  // current view has not been changed since then
  unchangedName() {
    return this.active && sameState(this.viewer.exportView(), this.active.state) ? this.active.name : null;
  }

  // Shows "Changed view" in the list if the view has been changed since it
  // was restored or saved
  checkChanged() {
    if (!this.active) return;
    const changed = !sameState(this.viewer.exportView(), this.active.state);
    if (changed === this.changed) return;
    this.changed = changed;
    this.updateList();
  }

  restore(view) {
    this.viewer.restoreView(view.state);
    this.active = { name: view.name, state: view.state };
    this.changed = false;
    this.updateList();
    // The toolbar shows the material and the lighting of the view
    const material = this.element.querySelector('[data-cad-material-mode]');
    if (material) material.value = this.element.dataset.materialMode;
    const lighting = this.element.querySelector('[data-cad-lighting]');
    if (lighting) lighting.value = this.element.dataset.lighting;
    this.showStatus(view.stale ? this.i18n.view_stale : '', view.stale ? 'warning' : '');
  }

  // Opens the form to save the current view under the name of the selected view
  openForm() {
    const view = this.selected;
    this.form.elements.name.value = view?.name || '';
    this.form.elements.is_default.checked = view ? view.is_default : this.views.length === 0;
    this.form.hidden = false;
    this.form.elements.name.focus();
  }

  closeForm() {
    this.form.hidden = true;
  }

  async save() {
    const name = this.form.elements.name.value.trim().toLowerCase();
    if (!NAME_PATTERN.test(name)) {
      this.showStatus(this.i18n.view_name_format, 'error');
      return;
    }
    const existing = this.views.find((view) => view.name === name);
    const button = this.form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const image = captureImage(this.viewer).toDataURL('image/png').split(',')[1];
      const body = { view: { state: this.viewer.exportView(), image,
                             is_default: this.form.elements.is_default.checked, revision: existing?.revision } };
      const { view } = await this.request('PUT', `${this.url}/${encodeURIComponent(name)}`, body);
      this.active = { name: view.name, state: body.view.state };
      this.changed = false;
      this.views = this.views.filter((v) => v.name !== view.name)
        .map((v) => (view.is_default ? { ...v, is_default: false } : v))
        .concat(view).sort((a, b) => a.name.localeCompare(b.name));
      this.updateList();
      this.closeForm();
      this.showStatus(this.i18n.view_saved, 'notice');
    } catch (error) {
      this.showError(error);
    } finally {
      button.disabled = false;
      this.updateButtons();
    }
  }

  async delete() {
    const view = this.selected;
    if (!view || !window.confirm(this.i18n.view_confirm_delete.replace('%{name}', view.name))) return;
    try {
      await this.request('DELETE', `${this.url}/${encodeURIComponent(view.name)}?revision=${view.revision}`);
      this.views = this.views.filter((v) => v.name !== view.name);
      this.active = null;
      this.changed = false;
      this.updateList();
      this.showStatus(this.i18n.view_deleted, 'notice');
    } catch (error) {
      this.showError(error);
    }
    this.updateButtons();
  }

  // The list shows the active view, or "Changed view" if it has been changed
  updateList() {
    this.select.replaceChildren(new Option(this.changed ? this.i18n.view_changed : '', ''), ...this.views.map((view) =>
      new Option(view.is_default ? `${view.name} (${this.i18n.view_default})` : view.name, view.name)));
    this.select.value = !this.changed && this.selected ? this.selected.name : '';
  }

  updateButtons() {
    const remove = this.element.querySelector('[data-cad-action="delete-view"]');
    if (remove) remove.hidden = !this.selected;
  }

  showStatus(message, type) {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.className = `cad-preview-view-status ${type ? `cad-preview-view-${type}` : ''}`;
  }

  // Shows the error, and reloads the views after a conflict
  async showError(error) {
    console.error('CAD preview views:', error);
    this.showStatus(error.messages?.join(' ') || this.i18n.view_error, 'error');
    if (error.status === 409) {
      this.views = (await this.request('GET', this.url)).views;
      this.updateList();
    }
  }

  async request(method, url, body) {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': token || '' },
      body: body && JSON.stringify(body)
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`${method} ${url}: ${response.status}`);
      error.status = response.status;
      error.messages = data.errors;
      throw error;
    }
    return data;
  }
}
