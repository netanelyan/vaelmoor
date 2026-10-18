import { el, rule, show, List } from './kit.js';

// Dialogue: NPC name at the top, the line as a plain subtitle at the bottom,
// player options as a bare list on the right. Options can require an item or
// a flag, carry effects (quest objectives, barter, gold, flags) applied by the
// caller, and test Speech: { check: { kind: persuade|intimidate|bribe|pay, level, gold? },
// next (success), fail (failure) }.

const LABEL = { persuade: 'Persuade', intimidate: 'Intimidate', bribe: 'Bribe', pay: 'Pay' };

export class DialogueScreen {
  constructor(root, { onEffect, onClose, check }) {
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
    Object.assign(this, { onEffect, onClose, check });
    this.open = false;
  }

  /** has(item) -> bool, flag(name) -> bool */
  start(data, has, flag = () => false) {
    this.data = data;
    this.has = has;
    this.flag = flag;
    this.name.textContent = data.name.toUpperCase();
    this.open = true;
    this.used = new Set();
    // the first node whose conditions hold (lets an NPC greet differently later)
    const start = (data.starts || []).find((s) => this.visible(s)) ?? { node: data.start };
    this.goto(start.node ?? data.start);
    show(this.root, true);
  }

  visible(o) {
    if (o.requires && !this.has(o.requires)) return false;
    if (o.flag && !this.flag(o.flag)) return false;
    if (o.noflag && this.flag(o.noflag)) return false;
    if (o.once && this.used.has(o.text)) return false;
    return true;
  }

  goto(nodeId) {
    const node = this.data.nodes[nodeId];
    if (!node) { this.close(); return; }
    this.subtitle.textContent = node.line;
    for (const fx of node.effects || []) this.onEffect(fx);
    const options = node.options.filter((o) => this.visible(o));
    this.list.set(options.map((o) => ({
      label: o.check ? `(${LABEL[o.check.kind] ?? 'Speech'}${o.check.gold ? ` ${o.check.gold} gold` : ''}) ${o.text}` : o.text,
      option: o,
    })));
  }

  choose(o) {
    this.used.add(o.text);
    if (o.check) {
      const ok = this.check(o);
      for (const fx of (ok ? o.effects : o.failEffects) || []) this.onEffect(fx);
      if (!this.open) return;
      this.goto(ok ? o.next : o.fail);
      return;
    }
    for (const fx of o.effects || []) this.onEffect(fx);
    if (!this.open) return; // an effect (barter) may have closed us
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
