// src/utils/parser.ts
import { remark, parse, gfm, directive, math, remark2rehype, rehypeKatex, rehypeHighlight, rehypeRaw, rehypeStringify } from './config';
import { MarkdownStreamBuffer } from './buffer';
import { handleDirectives, handleCodeBlockLineHighlight } from './plugins';
import { handleSpoiler } from './spoiler';

// 全量解析函数
async function parseFullMarkdown(markdown: string): Promise<string> {
  const processed = await remark()
    .use(parse)
    .use(gfm)
    .use(directive)
    .use(handleDirectives)
    .use(handleCodeBlockLineHighlight)
    .use(handleSpoiler)
    .use(math)
    .use(remark2rehype, { allowDangerousHtml: true, raw: true })
    .use(rehypeRaw)
    .use(rehypeHighlight)
    .use(rehypeKatex, { throwOnError: false, displayMode: true, trust: true })
    .use(rehypeStringify)
    .process(markdown);

  return processed.toString();
}

// 流式解析入口
export class MarkdownStreamParser {
  private buffer: MarkdownStreamBuffer;

  constructor() {
    this.buffer = new MarkdownStreamBuffer();
  }

  // 处理单个流式片段
  async processChunk(chunk: string): Promise<string> {
    const completeText = this.buffer.push(chunk);
    if (completeText) {
      return await parseFullMarkdown(completeText);
    }
    return '';
  }

  // 流式结束时处理剩余内容
  async finish(): Promise<string> {
    const remaining = this.buffer.flush();
    if (remaining) {
      return await parseFullMarkdown(remaining);
    }
    return '';
  }
}

// 保留原有全量解析函数（兼容非流式场景）
export async function markdownToHtml(markdown: string): Promise<string> {
  // 对于非流式场景，直接调用解析函数
  return parseFullMarkdown(markdown);
}
