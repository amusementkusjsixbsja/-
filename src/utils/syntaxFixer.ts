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


  // 代码块修复
  private fixCodeBlocksWithDiff(markdown: string, escapePositions: number[]): { fixed: string; addedChars: { char: string; position: number }[] } {
  if (!this.options.codeBlocks.enabled) {
    return { fixed: markdown, addedChars: [] };
  }

  const lines = markdown.split('\n');
  const addedChars: { char: string; position: number }[] = [];
  let inCodeBlock = false; // 状态机：是否在未闭合的代码块内
  let codeBlockStartLine = -1; // 记录未闭合代码块的起始行
  let charOffset = 0; // 字符偏移量（计算插入位置）

  // 步骤1：逐行扫描，追踪代码块状态
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 匹配独立行的 ``` （代码块起始/结束行）
    const codeBlockMatch = line.match(/^```\s*([\w-]*)\s*$/);
    
    if (codeBlockMatch && !this.isEscaped(charOffset + lines[i].indexOf('```'), escapePositions)) {
      if (inCodeBlock) {
        // 遇到闭合标记，退出代码块
        inCodeBlock = false;
        codeBlockStartLine = -1;
      } else {
        // 遇到起始标记，进入代码块
        inCodeBlock = true;
        codeBlockStartLine = i;
      }
    }
    // 更新字符偏移量（当前行长度 + 换行符）
    charOffset += lines[i].length + 1;
  }

  // 步骤2：补全所有未闭合的代码块
  let fixedMarkdown = markdown;
  if (inCodeBlock) {
    // 计算插入位置：文本末尾
    const insertPosition = fixedMarkdown.length;
    const closingTag = '\n```'; // 补全闭合标记（简化，仅加```）
    
    // 插入闭合标记
    fixedMarkdown += closingTag;
    // 记录添加的字符
    addedChars.push(...closingTag.split('').map((char, index) => ({
      char,
      position: insertPosition + index
    })));
  }

  return { fixed: fixedMarkdown, addedChars };
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
// src/utils/syntaxFixer.ts 中完整的 fixMathFormulasWithDiff 方法
private fixMathFormulasWithDiff(markdown: string, escapePositions: number[]): { fixed: string; addedChars: { char: string; position: number }[] } {
  if (!this.options.mathFormulas.enabled) {
    return { fixed: markdown, addedChars: [] };
  }

  let fixedMarkdown = markdown;
  const allAddedChars: { char: string; position: number }[] = [];

  // ===================== 重构块级公式修复逻辑（核心扩展）=====================
  // 1. 拆分文本为行，便于逐行处理
  let lines = fixedMarkdown.split('\n');
  // 存储所有未闭合的块级公式起始行信息
  const unclosedBlockMaths: { startLine: number; contentStart: number; contentEnd: number }[] = [];
  let inUnclosedBlock = false; // 标记是否进入未闭合的块级公式
  let currentBlockStart = -1; // 当前未闭合块的起始行（$$行）

  // 辅助函数：计算指定行之前的总字符数（含换行符），用于定位插入位置
  const calculateCharPosition = (endLineIdx: number, linesArr: string[]): number => {
    let pos = 0;
    for (let j = 0; j <= endLineIdx; j++) {
      pos += linesArr[j].length + 1; // +1 代表换行符 \n
    }
    return pos;
  };

  // 辅助函数：检查行是否为未转义的 $$ 独占行
  const isUnescapedDollarLine = (lineIdx: number, linesArr: string[]): boolean => {
    const line = linesArr[lineIdx];
    const trimmedLine = line.trim();
    if (trimmedLine !== '$$') return false;
    // 检查 $$ 是否被转义
    const dollarPos = line.indexOf('$$');
    return dollarPos !== -1 && !this.isEscaped(calculateCharPosition(lineIdx - 1, linesArr) + dollarPos, escapePositions);
  };

  // 第一步：遍历所有行，识别所有未闭合的块级公式（支持多行内容 + 批量处理）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 场景1：遇到未转义的 $$ 独占行 → 判定为块级公式起始/结束
    if (isUnescapedDollarLine(i, lines)) {
      if (!inUnclosedBlock) {
        // 标记为块级公式开始
        inUnclosedBlock = true;
        currentBlockStart = i;
      } else {
        // 遇到闭合的 $$ → 标记为已闭合
        inUnclosedBlock = false;
        currentBlockStart = -1;
      }
    } 
    // 场景2：处于未闭合块中，且是最后一行 → 记录未闭合块信息
    else if (inUnclosedBlock && i === lines.length - 1) {
      unclosedBlockMaths.push({
        startLine: currentBlockStart,
        contentStart: currentBlockStart + 1,
        contentEnd: i // 多行内容的结束行
      });
    }
    // 场景3：处于未闭合块中，遇到空行 → 判定块内容结束，记录未闭合块
    else if (inUnclosedBlock && line === '') {
      unclosedBlockMaths.push({
        startLine: currentBlockStart,
        contentStart: currentBlockStart + 1,
        contentEnd: i - 1 // 空行前的最后一行是内容行
      });
      inUnclosedBlock = false;
      currentBlockStart = -1;
    }
  }

  // 第二步：按规则修复所有未闭合的块级公式
  if (unclosedBlockMaths.length > 0) {
    let lineOffset = 0; // 记录行偏移（插入行导致的行索引变化）
    unclosedBlockMaths.forEach(block => {
      // 修正行索引（处理之前插入行导致的偏移）
      const actualContentEnd = block.contentEnd + lineOffset;
      const targetLine = actualContentEnd + 1; // 要插入$$的目标行（第三行/空行）
      let insertCharPos: number;
      let addedChars: { char: string; position: number }[] = [];

      // 规则1：目标行存在且为空行 → 直接替换为空行为$$
      if (targetLine < lines.length && lines[targetLine].trim() === '') {
        insertCharPos = calculateCharPosition(targetLine - 1, lines);
        // 替换空行为$$
        lines[targetLine] = '$$';
        addedChars = [{ char: '$$', position: insertCharPos }];
      } 
      // 规则2：目标行不存在（内容行是最后一行）→ 新增行并补$$
      else {
        insertCharPos = calculateCharPosition(actualContentEnd, lines);
        // 插入新行（$$）
        lines.splice(targetLine, 0, '$$');
        // 记录添加的字符（换行符 + $$）
        addedChars = [
          { char: '\n', position: insertCharPos - 1 }, // 换行符（补在内容行末尾）
          { char: '$$', position: insertCharPos }      // $$（新行）
        ];
        lineOffset += 1; // 插入了一行，后续行索引偏移+1
      }

      // 合并到总修复记录
      allAddedChars.push(...addedChars);
    });

    // 更新修复后的文本
    fixedMarkdown = lines.join('\n');
    // 重新拆分行（用于后续行内公式处理）
    lines = fixedMarkdown.split('\n');
  }

  // ===================== 保留原行内公式修复逻辑 =====================
  let charOffset = 0; // 记录字符偏移量（处理行添加后的位置变化）
  const newLines = [...lines];

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

// 保留原有的 isEscaped 方法（确保依赖可用）
private isEscaped(position: number, escapePositions: number[]): boolean {
  return escapePositions.includes(position);
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
