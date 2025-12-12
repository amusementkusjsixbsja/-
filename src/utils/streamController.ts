// src/utils/streamController.ts
export type StreamOptions = {
  initialSpeed: number; // 初始字符间隔（ms）
  maxSpeed: number; // 最小间隔（ms）
  damping: number; // 阻尼系数（0.9~0.99）
  acceleration: number; // 加速度（0.95~0.99）
};

export class StreamController {
  private options: StreamOptions;
  private currentInterval: number;
  private isEnd: boolean = false;
  private queue: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private totalLength: number = 0; // 当前渲染内容的总长度
  private currentPosition: number = 0; // 当前渲染位置
  private isTail: boolean = false; // 是否进入尾包

  constructor(options: Partial<StreamOptions> = {}) {
    this.options = {
      initialSpeed: 45, // 默认初始间隔45ms（原60-15）
      maxSpeed: 5, // 默认最小间隔5ms（原20-15）
      damping: 0.80, // 默认阻尼系数0.80
      acceleration: 0.96,
      ...options,
    };
    this.currentInterval = this.options.initialSpeed;
  }

  add(chars: string) {
    // 清空当前队列，确保只渲染最新内容
    this.queue = [];
    const charArray = chars.split('');
    this.queue.push(...charArray);

    // 重置状态
    this.totalLength = charArray.length; // 记录总长度
    this.currentPosition = 0; // 重置当前位置
    this.currentInterval = this.options.initialSpeed; // 重置当前间隔
    this.isEnd = false; // 重置结束标记
    this.isTail = false; // 重置尾包标记

    // 如果没有定时器，启动处理
    if (!this.timer) {
      this.processQueue();
    } else {
      // 如果有定时器，先清除，再启动
      clearTimeout(this.timer);
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
    this.currentPosition++;

    // 检查是否进入尾包（后1/2内容）
    if (!this.isTail && this.totalLength > 0 && this.currentPosition >= Math.floor(this.totalLength * 1 / 2)) {
      this.isTail = true;
      // 进入尾包，立即使用固定尾包速度10ms/字符
      this.currentInterval = 10;
    }

    if (!this.isEnd && !this.isTail) {
      // 尾包前，遵循初始速度和最大速度
      // 逐渐加速，但不超过最大速度
      this.currentInterval = Math.max(
        this.options.maxSpeed,
        this.currentInterval * this.options.damping
      );
    }

    this.timer = setTimeout(() => this.processQueue(), this.currentInterval);
  }

  onChar: (char: string) => void = () => { };

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}