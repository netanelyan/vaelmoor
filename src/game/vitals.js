// Health / magicka / stamina. Stamina is spent by sprinting and jumping and
// regenerates after a short pause; hard landings cost health. Values are 0..1.
export class Vitals {
  constructor() {
    this.health = 1;
    this.magicka = 1;
    this.stamina = 1;
    this.restTimer = 0;
    this.combat = false;
  }

  update(dt, { sprinting, jumped, landingSpeed }) {
    if (sprinting) { this.stamina = Math.max(0, this.stamina - dt * 0.16); this.restTimer = 1.2; }
    if (jumped) { this.stamina = Math.max(0, this.stamina - 0.08); this.restTimer = 1.2; }
    if (landingSpeed > 13) this.health = Math.max(0.05, this.health - (landingSpeed - 13) * 0.04);
    this.restTimer -= dt;
    if (this.restTimer <= 0) this.stamina = Math.min(1, this.stamina + dt * 0.12);
    this.health = Math.min(1, this.health + dt * 0.01);
    this.magicka = Math.min(1, this.magicka + dt * 0.03);
  }

  canSprint() { return this.stamina > 0.02; }
  canJump() { return this.stamina > 0.05; }

  toJSON() { return { health: this.health, magicka: this.magicka, stamina: this.stamina }; }
  restore(v) { Object.assign(this, v); }
}
