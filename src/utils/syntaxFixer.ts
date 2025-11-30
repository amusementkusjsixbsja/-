// src/utils/syntaxFixer.ts
// Markdown语法自动修复器

// 配置接口
export interface MarkdownSyntaxFixOptions {
  enabled: boolean; // 全局开关
  strategy: 'autoFix' | 'markError' | 'warnOnly'; // 自动修复/标记错误/仅警告
  codeBlocks: {
    enabled: boolean;
    preserveLanguage: boolean; // 补全时保留代码块语言
  };
  inlineCode: {
    enabled: boolean;
    ignoreInlineMultiLine: boolean; // 忽略跨行行内代码
  };
  mathFormulas: {
    enabled: boolean;
    distinguishBlockInline: boolean; // 区分块级/行内公式
  };
  tables: {
    enabled: boolean;
    autoAddSeparator: boolean; // 自动添加表格分隔行
  };
  links: {
    enabled: boolean;
    autoFillEmptyUrl: boolean; // 自动填充空url为#
  };
  images: {
    enabled: boolean;
    inheritLinkRules: boolean; // 继承链接修复规则
  };
}

// 默认配置
export const DEFAULT_SYNTAX_FIX_OPTIONS: MarkdownSyntaxFixOptions = {
  enabled: true,
  strategy: 'autoFix',
  codeBlocks: {
    enabled: true,
    preserveLanguage: true
  },
  inlineCode: {
    enabled: true,
    ignoreInlineMultiLine: true
  },
  mathFormulas: {
    enabled: true,
    distinguishBlockInline: true
  },
  tables: {
    enabled: true,
    autoAddSeparator: true
  },
  links: {
    enabled: true,
    autoFillEmptyUrl: false
  },
  images: {
    enabled: true,
    inheritLinkRules: true
  }
};

// 通用状态机接口
export interface SyntaxStateMachine {
  type: 'codeBlock' | 'inlineCode' | 'math' | 'table' | 'link' | 'image';
  state: 'idle' | 'open' | 'closed'; // 空闲/未闭合/已闭合
  openPositions: number[]; // 开启符位置
  closePositions: number[]; // 闭合符位置
  escapePositions: number[]; // 转义符位置
  context: string; // 上下文（如代码块语言、公式类型）
}

// 修复差异信息接口
export interface FixDiff {
  original: string;
  fixed: string;
  addedChars: { char: string; position: number }[];
}

// 语法修复器类
export class MarkdownSyntaxFixer {
  private options: MarkdownSyntaxFixOptions;

  constructor(options?: Partial<MarkdownSyntaxFixOptions>) {
    this.options = { ...DEFAULT_SYNTAX_FIX_OPTIONS, ...options };
  }

  // 修复Markdown语法，返回修复后的文本
  public fix(markdown: string): string {
    const result = this.fixWithDiff(markdown);
    return result.fixed;
  }

  // 修复Markdown语法，返回修复差异信息
  public fixWithDiff(markdown: string): FixDiff {
    if (!this.options.enabled) {
      return {
        original: markdown,
        fixed: markdown,
        addedChars: []
      };
    }

    let fixedMarkdown = markdown;
    const addedChars: { char: string; position: number }[] = [];

    // 预处理：标记所有转义位置
    const escapePositions = this.findEscapePositions(markdown);

    // 按优先级顺序修复不同语法
    if (this.options.codeBlocks.enabled) {
      const codeBlockResult = this.fixCodeBlocksWithDiff(fixedMarkdown, escapePositions);
      fixedMarkdown = codeBlockResult.fixed;
      addedChars.push(...codeBlockResult.addedChars);
    }

    if (this.options.inlineCode.enabled) {
      const inlineCodeResult = this.fixInlineCodeWithDiff(fixedMarkdown, escapePositions);
      fixedMarkdown = inlineCodeResult.fixed;
      addedChars.push(...inlineCodeResult.addedChars);
    }

    if (this.options.mathFormulas.enabled) {
      const mathResult = this.fixMathFormulasWithDiff(fixedMarkdown, escapePositions);
      fixedMarkdown = mathResult.fixed;
      addedChars.push(...mathResult.addedChars);
    }

    if (this.options.links.enabled) {
      const linksResult = this.fixLinksWithDiff(fixedMarkdown, escapePositions);
      fixedMarkdown = linksResult.fixed;
      addedChars.push(...linksResult.addedChars);
    }

    if (this.options.images.enabled) {
      const imagesResult = this.fixImagesWithDiff(fixedMarkdown, escapePositions);
      fixedMarkdown = imagesResult.fixed;
      addedChars.push(...imagesResult.addedChars);
    }

    if (this.options.tables.enabled) {
      const tablesResult = this.fixTablesWithDiff(fixedMarkdown);
      fixedMarkdown = tablesResult.fixed;
      addedChars.push(...tablesResult.addedChars);
    }

    return {
      original: markdown,
      fixed: fixedMarkdown,
      addedChars
    };
  }

  // 查找所有转义符位置
  private findEscapePositions(markdown: string): number[] {
    const positions: number[] = [];
    const escapeRegex = /\\(?=[`$[\]()!|])/g;
    let match;

    while ((match = escapeRegex.exec(markdown)) !== null) {
      // 检查转义符本身是否被转义
      let isEscaped = false;
      let escapeCount = 0;
      let i = match.index - 1;

      while (i >= 0 && markdown[i] === '\\') {
        escapeCount++;
        i--;
      }

      // 如果转义符数量为奇数，则当前转义符被转义
      if (escapeCount % 2 === 1) {
        isEscaped = true;
      }

      if (!isEscaped) {
        positions.push(match.index);
      }
    }

    return positions;
  }

  // 检查位置是否被转义
  private isEscaped(position: number, escapePositions: number[]): boolean {
    return escapePositions.includes(position);
  }

  // 代码块修复（```）
  private fixCodeBlocksWithDiff(markdown: string, escapePositions: number[]): { fixed: string; addedChars: { char: string; position: number }[] } {
    if (!this.options.codeBlocks.enabled) {
      return { fixed: markdown, addedChars: [] };
    }

    // 查找所有独立行的 ```
    const codeBlockRegex = /(^|\n)```(.*?)(\n|$)/g;
    const matches: { start: number; end: number; language: string }[] = [];
    let match;

    while ((match = codeBlockRegex.exec(markdown)) !== null) {
      // 检查是否被转义
      const isEscaped = this.isEscaped(match.index + (match[1] ? 1 : 0), escapePositions);
      if (!isEscaped) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          language: match[2].trim()
        });
      }
    }

    // 检查代码块是否成对
    if (matches.length % 2 !== 0) {
      const lastMatch = matches[matches.length - 1];
      // 闭合标记不添加代码类型
      const closingTag = '\n```\n';

      // 优化：找到代码块应该结束的位置
      // 1. 首先查找下一个独立行的开始位置
      // 2. 如果没有找到，检查是否为文档末尾
      // 3. 确保闭合标记插入在合适的位置

      // 查找下一个可能的代码块结束位置
      let insertPosition = markdown.length;

      // 查找下一个独立行的 ``` 或文档末尾
      const nextCodeBlockStart = markdown.indexOf('\n```', lastMatch.end);
      const nextEmptyLine = markdown.indexOf('\n\n', lastMatch.end);
      const nextLineStart = markdown.indexOf('\n', lastMatch.end);

      // 优先级：
      // 1. 下一个代码块开始前
      // 2. 下一个空行前
      // 3. 下一个换行前
      // 4. 文档末尾
      if (nextCodeBlockStart !== -1) {
        insertPosition = nextCodeBlockStart;
      } else if (nextEmptyLine !== -1) {
        insertPosition = nextEmptyLine;
      } else if (nextLineStart !== -1) {
        insertPosition = nextLineStart;
      }

      // 确保插入位置在代码块内容之后
      insertPosition = Math.max(insertPosition, lastMatch.end);

      // 插入闭合代码块标记
      const fixedMarkdown = (
        markdown.slice(0, insertPosition) +
        closingTag +
        markdown.slice(insertPosition)
      );

      // 记录添加的字符
      const addedChars = closingTag.split('').map((char, index) => ({
        char,
        position: insertPosition + index
      }));

      return { fixed: fixedMarkdown, addedChars };
    }

    return { fixed: markdown, addedChars: [] };
  }

  // 行内代码修复（`）
  private fixInlineCodeWithDiff(markdown: string, escapePositions: number[]): { fixed: string; addedChars: { char: string; position: number }[] } {
    if (!this.options.inlineCode.enabled) {
      return { fixed: markdown, addedChars: [] };
    }

    // 查找所有未转义的 `
    const inlineCodeRegex = /`/g;
    const matches: number[] = [];
    let match;

    while ((match = inlineCodeRegex.exec(markdown)) !== null) {
      const isEscaped = this.isEscaped(match.index, escapePositions);
      if (!isEscaped) {
        matches.push(match.index);
      }
    }

    // 检查是否有奇数个行内代码标记
    if (matches.length % 2 !== 0) {
      const lastBacktick = matches[matches.length - 1];

      // 优化：查找行内代码应该结束的位置
      // 考虑更多边界情况和上下文

      // 查找各种可能的闭合位置
      const nextSpace = markdown.indexOf(' ', lastBacktick + 1);
      const nextTab = markdown.indexOf('\t', lastBacktick + 1);
      const nextNewline = markdown.indexOf('\n', lastBacktick + 1);
      const nextCodeBlock = markdown.indexOf('```', lastBacktick + 1);
      const nextMathFormula = markdown.indexOf('$', lastBacktick + 1);
      const nextLink = markdown.indexOf('[', lastBacktick + 1);

      // 使用正则表达式查找各种标点符号
      const punctuationRegex = /[.,!?;:()[\]{}"']/g;
      punctuationRegex.lastIndex = lastBacktick + 1;
      const punctuationMatch = punctuationRegex.exec(markdown);
      const nextPunctuation = punctuationMatch ? punctuationMatch.index : -1;

      // 优化：位置选择优先级
      // 1. 分号后（优先）
      // 2. 其他标点符号前
      // 3. 空格/制表符前
      // 4. 换行前
      // 5. 特殊语法前（代码块、数学公式、链接）
      // 6. 文档末尾

      let endPos = markdown.length;

      // 按优先级检查各种位置
      if (nextPunctuation !== -1) {
        // 如果是分号，在分号后添加反引号
        if (markdown[nextPunctuation] === ';') {
          endPos = nextPunctuation + 1;
        } else {
          // 其他标点符号，在标点符号前添加反引号
          endPos = nextPunctuation;
        }
      } else if (nextSpace !== -1) {
        endPos = nextSpace;
      } else if (nextTab !== -1) {
        endPos = nextTab;
      } else if (nextNewline !== -1) {
        endPos = nextNewline;
      } else if (nextCodeBlock !== -1) {
        endPos = nextCodeBlock;
      } else if (nextMathFormula !== -1) {
        endPos = nextMathFormula;
      } else if (nextLink !== -1) {
        endPos = nextLink;
      }

      // 确保闭合位置在合理范围内
      // 1. 不能在开始标记之前
      // 2. 不能距离开始标记太远（防止误修复）
      const maxDistance = 100; // 最大修复距离
      endPos = Math.max(endPos, lastBacktick + 1);
      endPos = Math.min(endPos, lastBacktick + maxDistance);

      // 确保闭合位置在当前行内（如果配置了忽略跨行行内代码）
      if (this.options.inlineCode.ignoreInlineMultiLine && nextNewline !== -1) {
        endPos = Math.min(endPos, nextNewline);
      }

      // 在合适的位置插入闭合标记
      const fixedMarkdown = markdown.slice(0, endPos) + '`' + markdown.slice(endPos);
      const addedChars = [{ char: '`', position: endPos }];

      return { fixed: fixedMarkdown, addedChars };
    }

    return { fixed: markdown, addedChars: [] };
  }

  // 数学公式修复
  private fixMathFormulasWithDiff(markdown: string, escapePositions: number[]): { fixed: string; addedChars: { char: string; position: number }[] } {
    if (!this.options.mathFormulas.enabled) {
      return { fixed: markdown, addedChars: [] };
    }

    let fixedMarkdown = markdown;
    const allAddedChars: { char: string; position: number }[] = [];

    // 先处理块级公式 $$
    const blockMathRegex = /(^|\n)\$\$(.*?)(\n|$)/g;
    const blockMatches: { start: number; end: number }[] = [];
    let match;

    while ((match = blockMathRegex.exec(fixedMarkdown)) !== null) {
      const isEscaped = this.isEscaped(match.index + (match[1] ? 1 : 0), escapePositions);
      if (!isEscaped) {
        blockMatches.push({
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }

    if (blockMatches.length % 2 !== 0) {
      const lastMatch = blockMatches[blockMatches.length - 1];
      const closingTag = '\n$$\n';

      // 优化：找到块级公式应该结束的位置
      // 1. 查找下一个可能的结束位置
      // 2. 优先级：下一个公式前 > 空行前 > 换行前 > 文档末尾

      const nextBlockMath = fixedMarkdown.indexOf('\n$$', lastMatch.end);
      const nextEmptyLine = fixedMarkdown.indexOf('\n\n', lastMatch.end);
      const nextLineStart = fixedMarkdown.indexOf('\n', lastMatch.end);

      let insertPosition = fixedMarkdown.length;

      // 优先级：
      // 1. 下一个块级公式前
      // 2. 下一个空行前
      // 3. 下一个换行前
      // 4. 文档末尾
      if (nextBlockMath !== -1) {
        insertPosition = nextBlockMath;
      } else if (nextEmptyLine !== -1) {
        insertPosition = nextEmptyLine;
      } else if (nextLineStart !== -1) {
        insertPosition = nextLineStart;
      }

      // 确保插入位置在当前公式内容之后
      insertPosition = Math.max(insertPosition, lastMatch.end);

      let addedChars: { char: string; position: number }[];

      if (insertPosition === fixedMarkdown.length) {
        // 如果是文档末尾，直接在末尾添加
        fixedMarkdown = fixedMarkdown + closingTag;
        addedChars = closingTag.split('').map((char, index) => ({
          char,
          position: fixedMarkdown.length - closingTag.length + index
        }));
      } else {
        // 在指定位置插入闭合标记
        fixedMarkdown = (
          fixedMarkdown.slice(0, insertPosition) +
          closingTag +
          fixedMarkdown.slice(insertPosition)
        );
        addedChars = closingTag.split('').map((char, index) => ({
          char,
          position: insertPosition + index
        }));
      }

      allAddedChars.push(...addedChars);
    }


    // 处理行内公式 $（核心修改：本行末尾补全$）
    const lines = fixedMarkdown.split('\n');
    const newLines = [...lines];
    let charOffset = 0; // 记录字符偏移量（处理行添加后的位置变化）

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const currentLineOffset = charOffset;

      // 跳过块级公式行
      if (line.trim().startsWith('$$') || line.trim().endsWith('$$')) {
        charOffset += line.length + 1; // +1 换行符
        continue;
      }

      // 匹配当前行未转义的$（排除$$中的$）
      const inlineMathRegex = /(?<!\\)\$(?!\$)/g;
      const inlineMatches: number[] = [];
      let lineMatch: RegExpExecArray | null;

      while ((lineMatch = inlineMathRegex.exec(line)) !== null) {
        const matchPosInLine = lineMatch.index;
        const matchPosInFull = currentLineOffset + matchPosInLine;
        const isEscaped = this.isEscaped(matchPosInFull, escapePositions);

        if (!isEscaped) {
          inlineMatches.push(matchPosInFull);
        }
      }

      // 奇数个$ → 未闭合，在本行末尾添加$
      if (inlineMatches.length % 2 !== 0) {
        // 计算本行末尾的位置（行尾，换行符前）
        const lineEndPos = currentLineOffset + line.length;

        // 插入$到本行末尾
        newLines[lineIdx] = line + '$';
        fixedMarkdown = newLines.join('\n');

        // 记录添加的字符
        const addedChar = {
          char: '$',
          position: lineEndPos
        };
        allAddedChars.push(addedChar);

        // 更新字符偏移量（当前行长度+1）
        charOffset += (line.length + 1) + 1; // +1 新增的$，+1 换行符
      } else {
        charOffset += line.length + 1; // +1 换行符
      }
    }

    return { fixed: fixedMarkdown, addedChars: allAddedChars };
  }

  /**
   * 查找未闭合的括号匹配（核心重构：支持全量匹配未闭合链接/图片）
   * @param markdown 原始文本
   * @param prefixRegex 前缀正则表达式（用于区分链接和图片）
   * @param escapePositions 转义符位置数组
   * @returns 匹配结果数组
   */
  private findUnclosedBrackets(
    markdown: string, 
    prefixRegex: string, 
    escapePositions: number[]
  ): Array<{ start: number; end: number; type: 'unclosed' | 'onlyBracket' }> {
    const matches: Array<{ start: number; end: number; type: 'unclosed' | 'onlyBracket' }> = [];
    let match: RegExpExecArray | null;

    // 核心修改1：扩大未闭合链接匹配范围，支持任意位置的未闭合(
    // 正则说明：
    // ${prefixRegex} - 前缀（链接：(?<!\\\\|!)，图片：!）
    // \[(.*?)(?<!\\\\)\] - 匹配[]包裹的文本（排除转义]）
    // \s*\( - 匹配括号前的空白+左括号
    // ([^)]*) - 匹配括号内任意内容（无闭合)）
    // (?!\)) - 确保后面没有闭合)
    const unclosedRegexPattern = `${prefixRegex}\\[(.+?)(?<!\\\\)\\]\\s*\\(([^)]*)(?!\\))`;
    const unclosedRegex = new RegExp(unclosedRegexPattern, 'g');
    
    while ((match = unclosedRegex.exec(markdown)) !== null) {
      // 检查是否被转义
      const bracketStartPos = match.index + prefixRegex.length; // [ 的位置
      const isEscaped = this.isEscaped(bracketStartPos, escapePositions);
      if (isEscaped) continue;

      // 验证是否真的未闭合（向后查找直到换行/文本结束，确认无)）
      const afterMatch = markdown.slice(match.index + match[0].length);
      const nextCloseParen = afterMatch.indexOf(')');
      const nextNewline = afterMatch.indexOf('\n');
      // 如果)在换行后，视为未闭合
      const hasValidClose = nextCloseParen !== -1 && (nextNewline === -1 || nextCloseParen < nextNewline);
      
      if (!hasValidClose) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'unclosed'
        });
      }
    }

    // 核心修改2：修复仅含括号正则的转义和匹配逻辑
    const onlyBracketRegexPattern = `${prefixRegex}\\[(.+?)(?<!\\\\)\\](?!\\s*\\()`;
    const onlyBracketRegex = new RegExp(onlyBracketRegexPattern, 'g');
    
    while ((match = onlyBracketRegex.exec(markdown)) !== null) {
      if (!match) continue;
      
      // 检查是否被转义
      const bracketStartPos = match.index + prefixRegex.length;
      const isEscaped = this.isEscaped(bracketStartPos, escapePositions);
      if (isEscaped) continue;

      // 排除重复匹配
      const isDuplicate = matches.some(m =>
        m.start <= match.index && m.end >= match.index + match[0].length
      );
      if (!isDuplicate) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'onlyBracket'
        });
      }
    }

    return matches;
  }

  /**
   * 修复版链接修复：确保所有未闭合的[text](url)都补充)（支持全量修复）
   * @param markdown 原始文本
   * @param escapePositions 转义符位置数组
   * @returns 修复后的文本和添加的字符信息
   */
  private fixLinksWithDiff(
    markdown: string, 
    escapePositions: number[]
  ): { fixed: string; addedChars: { char: string; position: number }[] } {
    if (!this.options?.links?.enabled) {
      return { fixed: markdown, addedChars: [] };
    }

    let fixedMarkdown = markdown;
    const addedChars: { char: string; position: number }[] = [];
    let offset = 0;

    // 链接前缀：排除转义的[和图片前缀!
    const linkPrefix = '(?<!\\\\|!)';
    const matches = this.findUnclosedBrackets(fixedMarkdown, linkPrefix, escapePositions);

    // 核心修改3：去重并按结束位置降序排序（避免重复修复）
    const uniqueMatches = Array.from(new Map(
      matches.map(m => [m.end, m])
    )).map(([_, m]) => m);
    uniqueMatches.sort((a, b) => b.end - a.end);

    // 从后往前修复
    uniqueMatches.forEach(matchItem => {
      const actualEnd = matchItem.end + offset;
      if (actualEnd > fixedMarkdown.length) return;

      if (matchItem.type === 'unclosed') {
        // 补充闭合的)
        fixedMarkdown = fixedMarkdown.slice(0, actualEnd) + ')' + fixedMarkdown.slice(actualEnd);
        addedChars.push({ char: ')', position: actualEnd });
        offset += 1;
      } else if (matchItem.type === 'onlyBracket') {
        // 补充()，支持自动填充空URL
        const fillChar = this.options.links.autoFillEmptyUrl ? '\#' : '';
        const addStr = `(${fillChar})`;
        fixedMarkdown = fixedMarkdown.slice(0, actualEnd) + addStr + fixedMarkdown.slice(actualEnd);
        addedChars.push({ char: '(', position: actualEnd });
        addedChars.push({ char: ')', position: actualEnd + 1 });
        offset += 2;
      }
    });

    return { fixed: fixedMarkdown, addedChars: addedChars.reverse() };
  }

  /**
   * 修复版图片修复：确保所有未闭合的![alt](url)都补充)（支持全量修复）
   * @param markdown 原始文本
   * @param escapePositions 转义符位置数组
   * @returns 修复后的文本和添加的字符信息
   */
  private fixImagesWithDiff(
    markdown: string, 
    escapePositions: number[]
  ): { fixed: string; addedChars: { char: string; position: number }[] } {
    if (!this.options?.images?.enabled) {
      return { fixed: markdown, addedChars: [] };
    }

    let fixedMarkdown = markdown;
    const addedChars: { char: string; position: number }[] = [];
    let offset = 0;

    // 图片前缀为!
    const imagePrefix = '!';
    const matches = this.findUnclosedBrackets(fixedMarkdown, imagePrefix, escapePositions);

    // 去重并排序
    const uniqueMatches = Array.from(new Map(
      matches.map(m => [m.end, m])
    )).map(([_, m]) => m);
    uniqueMatches.sort((a, b) => b.end - a.end);

    // 从后往前修复
    uniqueMatches.forEach(matchItem => {
      const actualEnd = matchItem.end + offset;
      if (actualEnd > fixedMarkdown.length) return;

      if (matchItem.type === 'unclosed') {
        fixedMarkdown = fixedMarkdown.slice(0, actualEnd) + ')' + fixedMarkdown.slice(actualEnd);
        addedChars.push({ char: ')', position: actualEnd });
        offset += 1;
      } else if (matchItem.type === 'onlyBracket') {
        // 继承链接规则填充空URL
        const fillChar = this.options.images.inheritLinkRules && this.options.links.autoFillEmptyUrl ? '\#' : '';
        const addStr = `(${fillChar})`;
        fixedMarkdown = fixedMarkdown.slice(0, actualEnd) + addStr + fixedMarkdown.slice(actualEnd);
        addedChars.push({ char: '(', position: actualEnd });
        addedChars.push({ char: ')', position: actualEnd + 1 });
        offset += 2;
      }
    });

    return { fixed: fixedMarkdown, addedChars: addedChars.reverse() };
  }

  // 表格修复
  private fixTablesWithDiff(markdown: string): { fixed: string; addedChars: { char: string; position: number }[] } {
    if (!this.options.tables.enabled) {
      return { fixed: markdown, addedChars: [] };
    }

    // 简单的表格修复：确保有分隔行
    const lines = markdown.split('\n');
    const addedChars: { char: string; position: number }[] = [];

    // 存储当前表格的信息
    interface TableInfo {
      startIndex: number;
      hasSeparatorLine: boolean;
    }

    let currentTable: TableInfo | null = null;

    // 辅助函数：生成表格分隔行
    const generateSeparatorLine = (headerLine: string): string => {
      const headerColumns = headerLine.split('|').length;
      // 生成与表头列数匹配的分隔行，例如：| --- | --- |
      return '|' + ' --- |'.repeat(Math.max(1, headerColumns - 2));
    };

    // 辅助函数：添加表格分隔行
    const addSeparatorLine = (table: TableInfo) => {
      const headerLine = lines[table.startIndex];
      const separatorLine = generateSeparatorLine(headerLine);

      // 计算插入位置的字符偏移量
      // 优化：预计算每行长度，避免重复join操作
      let lineStartPos = 0;
      for (let j = 0; j <= table.startIndex; j++) {
        lineStartPos += lines[j].length + 1; // +1 表示换行符
      }

      // 插入分隔行
      lines.splice(table.startIndex + 1, 0, separatorLine);

      // 记录添加的字符
      const separatorLineWithNewline = '\n' + separatorLine;
      addedChars.push(...separatorLineWithNewline.split('').map((char, index) => ({
        char,
        position: lineStartPos + index
      })));
    };

    // 辅助函数：检查是否为表格分隔行
    const isSeparatorLine = (line: string): boolean => {
      // 优化：更高效的分隔行检查
      const trimmedLine = line.trim();
      return trimmedLine.startsWith('|') &&
        trimmedLine.endsWith('|') &&
        /^\s*\|(\s*-+\s*\|)+\s*$/.test(trimmedLine);
    };

    // 辅助函数：检查是否为表格行
    const isTableRow = (line: string): boolean => {
      // 优化：更准确的表格行判断
      const trimmedLine = line.trim();
      return trimmedLine.includes('|') &&
        !isSeparatorLine(trimmedLine) &&
        trimmedLine.length > 2;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isTableRow(line)) {
        // 进入或继续表格
        if (!currentTable) {
          // 开始新表格
          currentTable = {
            startIndex: i,
            hasSeparatorLine: false
          };
        }
      } else if (isSeparatorLine(line) && currentTable) {
        // 表格分隔行
        currentTable.hasSeparatorLine = true;
      } else if (currentTable) {
        // 表格结束
        if (!currentTable.hasSeparatorLine && i - currentTable.startIndex > 1) {
          // 缺少分隔行，添加一个
          addSeparatorLine(currentTable);
          // 由于插入了一行，需要调整索引
          i++;
        }
        // 重置表格状态
        currentTable = null;
      }
    }

    // 处理文档末尾的表格
    if (currentTable && !currentTable.hasSeparatorLine) {
      addSeparatorLine(currentTable);
    }

    const fixedMarkdown = lines.join('\n');
    return { fixed: fixedMarkdown, addedChars };
  }
}
