import { el, rule, show, List } from './kit.js';

// Dialogue: NPC name at the top, the line as a plain subtitle at the bottom,
// player options as a bare list on the right. Options can require an item and
// carry effects (quest objectives, tracking) applied by the caller.

export class DialogueScreen {
  constructor(root, { onEffect, onClose }) {
    this.root = el('div', 'ui ui-fade ui-off', null, root);
    this.root.id = 'dialogue';
    el('div', 'top ui-shade-top', null, this.root);
    el('div', 'side ui-shade-right', null, this.root);
    el('div', 'bottom ui-shade-bottom', null, this.root);
    const npc = el('div', 'npc', null, this.root);
    this.name = el('div', 'name', '', npc);
    rule({ diamond: true }, npc);
    this.subtitle = el('div', 'subtitle', '', this.root);
    const opts = el('div', 'options interactive', null, this.root);
    this.list = new List(opts, { onChoose: (it) => this.choose(it.option) });
    Object.assign(this, { onEffect, onClose });
    this.open = false;
  }

  start(data, has) {
    this.data = data;
    this.has = has;
    this.name.textContent = data.name.toUpperCase();
    this.open = true;
    this.goto(data.start);
    show(this.root, true);
  }

  goto(nodeId) {
    const node = this.data.nodes[nodeId];
    this.subtitle.textContent = node.line;
    const options = node.options.filter((o) => !o.requires || this.has(o.requires));
    this.list.set(options.map((o) => ({ label: o.text, option: o })));
  }

  choose(o) {
    for (const fx of o.effects || []) this.onEffect(fx);
    if (o.end || !o.next) this.close();
    else this.goto(o.next);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    show(this.root, false);
    this.onClose?.();
  }

  key(e) {
    if (e.code === 'Escape' || e.code === 'Tab') { this.close(); return true; }
    return this.list.key(e);
  }
}
