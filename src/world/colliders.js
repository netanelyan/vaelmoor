// Circle colliders in the XZ plane, bucketed in a spatial hash.
export class Colliders {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
  }

  add(x, z, r) {
    const c = this.cell;
    const c0x = Math.floor((x - r) / c), c1x = Math.floor((x + r) / c);
    const c0z = Math.floor((z - r) / c), c1z = Math.floor((z + r) / c);
    const item = { x, z, r };
    for (let i = c0x; i <= c1x; i++) {
      for (let j = c0z; j <= c1z; j++) {
        const k = `${i},${j}`;
        let a = this.map.get(k);
        if (!a) this.map.set(k, (a = []));
        a.push(item);
      }
    }
  }

  /** Push a circle of radius `r` at (x, z) out of every collider. Returns [x, z]. */
  resolve(x, z, r) {
    const a = this.map.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`);
    if (!a) return [x, z];
    for (let pass = 0; pass < 2; pass++) {
      for (const c of a) {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min && d > 1e-5) {
          x = c.x + (dx / d) * min;
          z = c.z + (dz / d) * min;
        }
      }
    }
    return [x, z];
  }
}
