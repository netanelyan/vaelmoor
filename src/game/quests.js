// Minimal quest log driven by data/quests.json.
// Objective types: discover <area id>, talk <npc id>, take <item id>, or
// completed explicitly by a dialogue effect "objective:<quest>.<objective>".
// Objectives in a quest are sequential; the first unfinished one is "current".
// A quest with "hidden": true stays out of the journal until an effect
// "start:<quest>" (dialogue, a note) begins it. Objective types also include
// open <container prop id> and use <usable id>.

export class QuestLog {
  constructor(data) {
    this.quests = data.quests.map((q) => ({ ...q, objectives: q.objectives.map((o) => ({ ...o, done: false })), status: q.hidden ? 'hidden' : 'active' }));
    this.items = new Set();
    this.discovered = new Set();
    this.tracked = this.quests[0]?.id ?? null;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  emit(evt) { for (const fn of this.listeners) fn(evt); }

  get(id) { return this.quests.find((q) => q.id === id); }
  current(q) { return q.objectives.find((o) => !o.done) || null; }

  /** Ordered for the journal: active first, completed after. */
  ordered() {
    return [...this.quests.filter((q) => q.status === 'active'), ...this.quests.filter((q) => q.status === 'complete')];
  }

  trackedQuest() {
    const q = this.get(this.tracked);
    if (q && q.status === 'active') return q;
    return this.quests.find((x) => x.status === 'active') || null;
  }

  complete(questId, objectiveId) {
    const q = this.get(questId);
    const o = q?.objectives.find((x) => x.id === objectiveId);
    if (!o || o.done) return;
    // objectives are sequential: completing one completes those before it
    for (const x of q.objectives) { x.done = true; if (x === o) break; }
    this.emit({ type: 'objective', quest: q, objective: o });
    if (q.objectives.every((x) => x.done)) {
      q.status = 'complete';
      this.emit({ type: 'quest-complete', quest: q });
    }
  }

  /** React to a world event: discover / talk / take. */
  notify(type, id) {
    if (type === 'discover') this.discovered.add(id);
    if (type === 'take') this.items.add(id);
    for (const q of this.quests) {
      if (q.status !== 'active') continue;
      const o = this.current(q);
      if (o && o.type === type && o.target === id && (!o.requires || this.items.has(o.requires))) this.complete(q.id, o.id);
    }
  }

  /** Dialogue effects like "objective:conclave.archmage" or "item:golden_skull". */
  apply(effect) {
    const [kind, arg] = effect.split(':');
    if (kind === 'objective') {
      const [qid, oid] = arg.split('.');
      this.complete(qid, oid);
    } else if (kind === 'start') this.start(arg);
    else if (kind === 'item') this.items.add(arg);
    else if (kind === 'track') this.tracked = arg;
  }

  has(item) { return this.items.has(item); }

  /** Begin a hidden quest (and track it). */
  start(id) {
    const q = this.get(id);
    if (!q || q.status !== 'hidden') return;
    q.status = 'active';
    this.tracked = id;
    this.emit({ type: 'quest-start', quest: q });
  }

  /** active | complete | hidden (or undefined for an unknown quest) */
  status(id) { return this.get(id)?.status; }

  toJSON() {
    return {
      tracked: this.tracked,
      items: [...this.items],
      discovered: [...this.discovered],
      quests: this.quests.map((q) => ({ id: q.id, status: q.status, done: q.objectives.map((o) => o.done) })),
    };
  }

  restore(s) {
    this.tracked = s.tracked;
    this.items = new Set(s.items);
    this.discovered = new Set(s.discovered);
    for (const qs of s.quests) {
      const q = this.get(qs.id);
      if (!q) continue;
      q.status = qs.status ?? (q.hidden ? 'hidden' : 'active');
      q.objectives.forEach((o, i) => { o.done = !!qs.done[i]; });
    }
    // quests added after the save was made start fresh
    for (const q of this.quests) if (!s.quests.some((x) => x.id === q.id)) { q.status = q.hidden ? 'hidden' : 'active'; for (const o of q.objectives) o.done = false; }
    this.emit({ type: 'restore' });
  }
}
