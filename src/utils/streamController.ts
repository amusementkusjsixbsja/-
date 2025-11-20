// src/utils/streamController.ts
export type StreamOptions = {
  initialSpeed: number; // 初始字符间隔（ms）
  maxSpeed: number; // 最大速度（最小间隔 ms）
  damping: number; // 阻尼系数（0.9~0.99）
  acceleration: number; // 加速度（0.95~0.99）
};

export class StreamController {
  private options: StreamOptions;
  private currentInterval: number;
  private isEnd: boolean = false;
  private queue: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: Partial<StreamOptions> = {}) {
    this.options = {
      initialSpeed: 80,
      maxSpeed: 20,
      damping: 0.97,
      acceleration: 0.96,
      ...options,
    };
    this.currentInterval = this.options.initialSpeed;
  }

  add(chars: string) {
    this.queue.push(...chars.split(''));
    if (!this.timer && this.queue.length > 0) {
      this.processQueue();
    }
  }

  markAsEnd() {
    this.isEnd = true;
    this.currentInterval = 5;
  }

  private processQueue() {
    if (this.queue.length === 0) {
      this.timer = null;
      return;
    }

    const char = this.queue.shift()!;
    this.onChar(char);

    if (!this.isEnd) {
      this.currentInterval = Math.max(
        this.options.maxSpeed,
        this.currentInterval * this.options.acceleration
      );
    }

    this.timer = setTimeout(() => this.processQueue(), this.currentInterval);
  }

  onChar: (char: string) => void = () => {};

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}