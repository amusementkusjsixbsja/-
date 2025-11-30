// src/utils/buffer.ts
// 流式缓冲器：存储未完成的 Markdown 片段
export class MarkdownStreamBuffer {
  private buffer: string = '';

  constructor() {
    // 移除了语法修复相关初始化
  }

  // 重置缓冲器（可选，用于流式结束后清理）
  reset(): void {
    this.buffer = '';
  }

  // 接收流式片段并缓冲
  push(chunk: string): string {
    // 追加新片段到缓冲
    this.buffer += chunk;
    // 直接返回当前缓冲内容，不进行语法修复
    return this.buffer;
  }

  // 流式结束时，返回剩余内容
  flush(): string {
    return this.buffer;
  }
}