// Panel with the tree of the parts of an assembly: shows and hides parts, and
// shows only one part. The markup is in app/views/cad_previews/_viewer.html.erb.

import { isShown, partNodes } from './part_tree.js';

export class PartsPanel {
  constructor(element, viewer) {
    this.viewer = viewer;
    this.panel = element.querySelector('.cad-preview-parts');
    this.template = element.querySelector('template.cad-preview-part-template');
    this.button = element.querySelector('[data-cad-action="parts"]');
    this.items = [];

    this.panel.querySelector('.cad-preview-parts-tree').replaceChildren(...this.build(partNodes(viewer.parts)));
    this.panel.querySelector('[data-cad-parts-show-all]').addEventListener('click', () => {
      viewer.setHiddenParts([]);
      viewer.fit();
    });
    viewer.partsChanged = () => this.refresh();
    viewer.leftInset = () => this.coveredWidth();
    this.button.hidden = false;
    this.refresh();
  }

  build(nodes) {
    return nodes.map((node) => {
      const item = this.template.content.firstElementChild.cloneNode(true);
      const toggle = item.querySelector('[data-cad-part-toggle]');
      const name = item.querySelector('[data-cad-part-name]');
      name.textContent = node.name;
      toggle.addEventListener('click', () => this.viewer.togglePart(node.object));
      name.addEventListener('click', () => this.viewer.showOnlyPart(node.object));
      if (node.children.length > 0) {
        const list = document.createElement('ul');
        list.append(...this.build(node.children));
        item.append(list);
      }
      this.items.push({ item, toggle, node });
      return item;
    });
  }

  // Width of the view covered by the panel. On narrow screens, the panel is
  // over the top of the view and covers no width.
  coveredWidth() {
    if (this.panel.hidden) return 0;
    const canvas = this.panel.parentElement.getBoundingClientRect();
    const panel = this.panel.getBoundingClientRect();
    return panel.width < canvas.width * 0.8 ? panel.right - canvas.left : 0;
  }

  toggle() {
    this.panel.hidden = !this.panel.hidden;
    this.button.classList.toggle('selected', !this.panel.hidden);
  }

  // Parts below a hidden part are shown as inactive
  refresh() {
    for (const { item, toggle, node } of this.items) {
      item.classList.toggle('cad-preview-part-hidden', !node.object.visible);
      item.classList.toggle('cad-preview-part-inactive', !isShown(node.object, this.viewer.parts));
      toggle.setAttribute('aria-pressed', String(node.object.visible));
    }
  }
}
