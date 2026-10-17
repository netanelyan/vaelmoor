import { el, rule, keyBadge, show, List } from './kit.js';

// Journal: a parchment page with the quest list on the left and the selected
// quest on the right. Completed quests and objectives are struck through.

export class JournalScreen {
  constructor(root, { quests, onClose, onTrack }) {
    this.root = el('div', 'ui ui-vignette ui-fade ui-off', null, root);
    this.root.id = 'journal';
    const page = el('div', 'page interactive', null, this.root);
    const left = el('div', 'col left', null, page);
    el('div', 'head', 'QUESTS', left);
    rule({ diamond: true, ink: true }, left);
    this.list = new List(left, {
      onSelect: (it) => this.detail(it.quest),
      onChoose: (it) => { if (it.quest.status === 'active') { onTrack(it.quest.id); this.refresh(); } },
    });
    this.right = el('div', 'col right', null, page);
    const hint = el('div', 'hint', null, page);
    keyBadge('E', hint); el('span', '', 'Track quest', hint);
    keyBadge('ESC', hint); el('span', '', 'Close', hint);
    Object.assign(this, { quests, onClose });
    this.open = false;
  }

  items() {
    return this.quests.ordered().map((q) => ({
      quest: q,
      render: (row) => {
        row.classList.add('quest');
        if (q.status === 'complete') row.classList.add('done');
        row.textContent = q.title;
      },
    }));
  }

  detail(q) {
    const r = this.right;
    r.textContent = '';
    el('div', 'title', q.title, r);
    rule({ diamond: true, ink: true }, r);
    for (const p of q.description) el('p', '', p, r);
    const objs = el('div', 'objectives', null, r);
    // show finished objectives and the current one, never the ones ahead
    for (const o of q.objectives) {
      el('div', `obj${o.done ? ' done' : ''}`, o.text, objs);
      if (!o.done) break;
    }
    const tracked = this.quests.trackedQuest()?.id === q.id;
    el('div', 'status', q.status === 'complete' ? 'COMPLETED' : tracked ? 'ACTIVE · TRACKED' : 'ACTIVE', r);
  }

  refresh() {
    this.list.set(this.items(), this.list.index);
    const it = this.list.items[this.list.index];
    if (it) this.detail(it.quest);
  }

  show() {
    this.open = true;
    this.list.set(this.items(), 0);
    const it = this.list.items[0];
    if (it) this.detail(it.quest);
    show(this.root, true);
  }

  hide() { this.open = false; show(this.root, false); }

  key(e) {
    if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyJ') { this.onClose(); return true; }
    return this.list.key(e);
  }
}
