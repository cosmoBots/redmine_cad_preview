// Suggests the arguments of the macro {{cad_preview(file, view=name, height=520, png, readonly)}}
// in the text fields of Redmine: the CAD attachments of the issue, wiki page or
// other object of the page and the CAD files uploaded in the form, then the
// options, the saved views of the file and heights. Enter closes the macro,
// Tab adds the next argument.
//
// The Stimulus controller is connected to the element added by the hook of the
// plugin (app/views/cad_previews/_autocomplete.html.erb), with the values:
//   files       CAD attachments of the object of the page: {id, name, views}
//   extensions  extensions of the CAD files that are previewed
// Redmine provides Stimulus from version 6.1. Without it, nothing is suggested.

// The macro and its arguments typed so far, before the caret
const MACRO = /\{\{cad_preview\(([^()\n]*)$/;
const MAX_SUGGESTIONS = 10;
export const OPTIONS = ['view=', 'height=', 'png', 'readonly'];
export const HEIGHTS = ['240', '360', '520', '800'];

// Returns what is typed at the caret in the macro, or null outside of it:
//   type   file, option, view or height
//   query  the text typed so far
//   start  the position of the text, which is replaced by the suggestion
//   file   the file (first argument), for options and values
//   used   the names of the options already given
export function findContext(text, caret) {
  const match = MACRO.exec(text.slice(0, caret));
  if (!match) return null;
  const args = match[1].split(',');
  const token = args.pop().replace(/^\s+/, '');
  if (args.length === 0) return { type: 'file', query: token.trim(), start: caret - token.length };

  const file = args[0].trim();
  const value = /^(view|height)=(.*)$/i.exec(token);
  if (value) return { type: value[1].toLowerCase(), query: value[2].trim(), start: caret - value[2].length, file };

  const used = args.slice(1).map((arg) => arg.trim().split('=')[0].toLowerCase());
  return { type: 'option', query: token.trim(), start: caret - token.length, file, used };
}

// Returns the values that contain the query, those that start with it first
export function matching(values, query, max = MAX_SUGGESTIONS) {
  const text = query.toLowerCase();
  const starts = (value) => (value.toLowerCase().startsWith(text) ? 0 : 1);
  return [...new Set(values)]
    .filter((value) => value.toLowerCase().includes(text))
    .sort((a, b) => starts(a) - starts(b) || a.localeCompare(b))
    .slice(0, max);
}

// Returns the suggestions for the context. files are {id, name, views}.
export function suggestions(context, files) {
  const startsWith = (values) => values.filter((value) => value.toLowerCase().startsWith(context.query.toLowerCase()));
  switch (context.type) {
  case 'file':
    return matching(files.map((file) => file.name), context.query);
  case 'option':
    return startsWith(OPTIONS.filter((option) => !context.used.includes(option.replace('=', ''))));
  case 'view': {
    const name = context.file.toLowerCase();
    const file = files.find((f) => f.name.toLowerCase() === name || String(f.id) === name);
    return ['*', ...matching(file?.views || [], context.query)].filter((view) => view !== '*' || context.query === '');
  }
  case 'height':
    return startsWith(HEIGHTS);
  default:
    return [];
  }
}

// Returns the text inserted for the suggestion. An option with a value is
// inserted alone, so that its values are suggested next. Otherwise Tab adds
// the next argument and the other keys close the macro, unless more
// arguments or the end follow.
export function completion(suggestion, key, textAfter) {
  if (suggestion.endsWith('=')) return suggestion;
  if (key === 'Tab') return /^\s*,/.test(textAfter) ? suggestion : `${suggestion}, `;
  return /^\s*[,)]/.test(textAfter) ? suggestion : `${suggestion})}}`;
}

// Returns the position of the caret in the text field, relative to the page.
// The text before the caret is copied into an element with the same style.
function caretPosition(field, position) {
  const style = getComputedStyle(field);
  const mirror = document.createElement('div');
  for (const property of ['boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
                          'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                          'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'tabSize']) {
    mirror.style[property] = style[property];
  }
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap',
                                overflowWrap: 'break-word', top: '0', left: '-9999px' });
  mirror.textContent = field.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const rect = field.getBoundingClientRect();
  const left = rect.left + window.scrollX + marker.offsetLeft - field.scrollLeft;
  const top = rect.top + window.scrollY + marker.offsetTop - field.scrollTop + lineHeight;
  mirror.remove();
  return { left, top };
}

function isCadFile(name, extensions) {
  const dot = name.lastIndexOf('.');
  return dot > 0 && extensions.includes(name.slice(dot).toLowerCase());
}

async function register() {
  // Redmine 6.0 has no import map and no Stimulus
  if (!document.querySelector('script[type="importmap"]')) return;
  const { Controller } = await import('@hotwired/stimulus');

  class AutocompleteController extends Controller {
    static values = { files: Array, extensions: Array };

    connect() {
      this.menu = null;
      this.onInput = (event) => this.update(event.target);
      this.onKeydown = (event) => this.keydown(event);
      document.addEventListener('input', this.onInput, true);
      document.addEventListener('click', this.onInput, true);
      // Before Redmine's own suggestions (Tribute), which also handle the keys
      document.addEventListener('keydown', this.onKeydown, true);
    }

    disconnect() {
      document.removeEventListener('input', this.onInput, true);
      document.removeEventListener('click', this.onInput, true);
      document.removeEventListener('keydown', this.onKeydown, true);
      this.close();
    }

    // The CAD attachments of the page and the CAD files uploaded in the form
    // of the text field, which have no views yet
    files(field) {
      const form = field.closest('form') || document;
      const uploaded = [...form.querySelectorAll('.attachments_fields input.filename')]
        .map((input) => ({ name: input.value, views: [] }));
      return [...this.filesValue, ...uploaded].filter((file) => isCadFile(file.name, this.extensionsValue));
    }

    update(field) {
      if (!(field instanceof HTMLTextAreaElement) || field.selectionStart !== field.selectionEnd) {
        if (!this.menu?.contains(field)) this.close();
        return;
      }
      const context = findContext(field.value, field.selectionStart);
      const values = context ? suggestions(context, this.files(field)) : [];
      if (values.length === 0) {
        this.close();
        return;
      }
      this.open(field, context.start, values);
    }

    // The list uses the style of Redmine's own suggestions
    open(field, start, values) {
      this.close();
      this.field = field;
      this.start = start;
      this.suggestions = values;
      this.index = 0;
      this.menu = document.createElement('div');
      this.menu.className = 'tribute-container cad-preview-autocomplete';
      const position = caretPosition(field, field.selectionStart);
      Object.assign(this.menu.style, { position: 'absolute', left: `${position.left}px`, top: `${position.top}px`,
                                       display: 'block', zIndex: 10000 });
      const list = document.createElement('ul');
      values.forEach((value, i) => {
        const item = document.createElement('li');
        item.textContent = value;
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          this.select(i, 'Enter');
        });
        list.appendChild(item);
      });
      this.menu.appendChild(list);
      document.body.appendChild(this.menu);
      this.highlight();
    }

    close() {
      this.menu?.remove();
      this.menu = null;
    }

    highlight() {
      [...this.menu.querySelectorAll('li')].forEach((item, i) => item.classList.toggle('highlight', i === this.index));
    }

    keydown(event) {
      if (!this.menu || event.target !== this.field) return;
      const moves = { ArrowDown: 1, ArrowUp: -1 };
      if (event.key in moves) {
        this.index = (this.index + moves[event.key] + this.suggestions.length) % this.suggestions.length;
        this.highlight();
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        this.select(this.index, event.key);
      } else if (event.key === 'Escape') {
        this.close();
      } else {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    // The input event shows the next suggestions, e.g. the options after Tab
    select(index, key) {
      const field = this.field;
      const caret = field.selectionStart;
      const text = completion(this.suggestions[index], key, field.value.slice(caret));
      field.setRangeText(text, this.start, caret, 'end');
      this.close();
      field.focus();
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Stimulus is started by the application script of Redmine
  const application = window.Stimulus || await new Promise((resolve) => {
    const wait = () => (window.Stimulus ? resolve(window.Stimulus) : setTimeout(wait, 50));
    wait();
  });
  application.register('cad-preview-autocomplete', AutocompleteController);
}

if (typeof document !== 'undefined') register();
