export interface ThreeCompatParticle {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly life: number;
}

export class ParticleSystemThreeCompat {
  readonly particles: ThreeCompatParticle[] = [];

  emit(count: number): void {
    for (let index = 0; index < count; index++) {
      this.particles.push({ x: index % 32, y: Math.floor(index / 32), z: 0, life: 1 });
    }
  }

  update(delta: number): void {
    for (let index = 0; index < this.particles.length; index++) {
      const particle = this.particles[index];
      this.particles[index] = { ...particle, y: particle.y + delta, life: Math.max(0, particle.life - delta * 0.1) };
    }
  }
}
