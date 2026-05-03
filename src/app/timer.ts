export type RenderCallback = () => void;

export class RenderTimer {
  private callbacks: Set<RenderCallback> = new Set();
  private animationId: number | null = null;
  private isRunning: boolean = false;

  register(callback: RenderCallback): void {
    this.callbacks.add(callback);
  }

  unregister(callback: RenderCallback): void {
    this.callbacks.delete(callback);
  }

  start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.loop();
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private loop = () => {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(this.loop);

    // Execute all registered render callbacks
    this.callbacks.forEach((callback) => callback());
  }

  clear(): void {
    this.callbacks.clear();
  }

  getCallbackCount(): number {
    return this.callbacks.size;
  }
}
