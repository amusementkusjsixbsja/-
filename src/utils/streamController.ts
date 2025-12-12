// src/utils/streamController.ts
export type StreamOptions = {
  initialSpeed: number; // 初始字符间隔（ms）
  maxSpeed: number; // 最小间隔（ms）
  damping: number; // 阻尼系数（0.9~0.99）
  acceleration: number; // 加速度（0.95~0.99）
};

// 数据块类型，包含内容和尾包标识
interface DataBlock {
  content: string;
  isTail: boolean; // 是否为尾包
}

export class StreamController {
  private options: StreamOptions;
  private currentInterval: number;
  private isEnd: boolean = false;
  private dataBlockQueue: DataBlock[] = []; // 数据块队列，存储较大的数据块
  private currentDataBlock: DataBlock | null = null; // 当前正在渲染的数据块
  private currentCharIndex: number = 0; // 当前数据块的字符索引
  private timer: ReturnType<typeof setTimeout> | null = null;
  private totalLength: number = 0; // 当前渲染内容的总长度
  private renderedLength: number = 0; // 当前已渲染长度
  private inTailBlock: boolean = false; // 是否正在处理尾包数据块

  constructor(options: Partial<StreamOptions> = {}) {
    this.options = {
      initialSpeed: 45, // 默认初始间隔45ms
      maxSpeed: 5, // 默认最小间隔5ms
      damping: 0.80, // 默认阻尼系数0.80
      acceleration: 0.96,
      ...options,
    };
    this.currentInterval = this.options.initialSpeed;
  }

  // 添加数据块，支持分段接收
  add(dataBlock: string) {
    // 创建数据块对象，默认不是尾包
    const block: DataBlock = {
      content: dataBlock,
      isTail: false
    };

    // 将数据块添加到队列
    this.dataBlockQueue.push(block);

    // 更新总长度
    this.totalLength += dataBlock.length;

    // 如果没有定时器，启动处理
    if (!this.timer) {
      this.processDataBlock();
    }
  }

  // 标识最后一个数据块为尾包
  addTailBlock(dataBlock: string) {
    // 创建尾包数据块
    const tailBlock: DataBlock = {
      content: dataBlock,
      isTail: true
    };

    // 将尾包数据块添加到队列
    this.dataBlockQueue.push(tailBlock);

    // 更新总长度
    this.totalLength += dataBlock.length;

    // 如果没有定时器，启动处理
    if (!this.timer) {
      this.processDataBlock();
    }
  }

  // 处理下一个数据块
  private processDataBlock() {
    // 如果当前数据块已渲染完，获取下一个数据块
    if (!this.currentDataBlock || this.currentCharIndex >= this.currentDataBlock.content.length) {
      if (this.dataBlockQueue.length === 0) {
        // 所有数据块都已处理完
        this.timer = null;
        return;
      }

      // 获取下一个数据块
      this.currentDataBlock = this.dataBlockQueue.shift()!;
      this.currentCharIndex = 0;

      // 检查是否为尾包数据块
      this.inTailBlock = this.currentDataBlock.isTail;

      // 如果是尾包，立即使用最大速度
      if (this.inTailBlock) {
        this.currentInterval = this.options.maxSpeed;
      }
    }

    // 开始逐字渲染当前数据块
    this.renderNextChar();
  }

  // 渲染当前数据块的下一个字符
  private renderNextChar() {
    if (!this.currentDataBlock || this.currentCharIndex >= this.currentDataBlock.content.length) {
      // 当前数据块渲染完毕，处理下一个数据块
      this.processDataBlock();
      return;
    }

    // 获取并渲染当前字符
    const char = this.currentDataBlock.content[this.currentCharIndex];
    this.onChar(char);
    this.currentCharIndex++;
    this.renderedLength++;

    if (!this.isEnd && !this.inTailBlock) {
      // 非尾包数据块，逐渐加速，但不超过最大速度
      this.currentInterval = Math.max(
        this.options.maxSpeed,
        this.currentInterval * this.options.damping
      );
    }
    // 尾包数据块已经在processDataBlock中设置了最大速度，不需要再调整

    // 继续渲染下一个字符
    this.timer = setTimeout(() => this.renderNextChar(), this.currentInterval);
  }

  markAsEnd() {
    this.isEnd = true;
    this.currentInterval = 5;
  }

  onChar: (char: string) => void = () => { };

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.dataBlockQueue = [];
    this.currentDataBlock = null;
    this.currentCharIndex = 0;
    this.totalLength = 0;
    this.renderedLength = 0;
    this.inTailBlock = false;
  }
}