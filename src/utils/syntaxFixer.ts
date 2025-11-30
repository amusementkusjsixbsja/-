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

/**
 * 代码块修复：逐行追踪（带空值防护+中文行判断），按行内规则补全未闭合代码块
 * @param markdown 原始 Markdown 文本
 * @param escapePositions 转义符（\）位置数组
 * @returns 修复后的文本 + 添加的字符信息
 */
private fixCodeBlocksWithDiff(
  markdown: string,
  escapePositions: number[]
): { fixed: string; addedChars: { char: string; position: number }[] } {
  // 基础防护：空文本直接返回
  if (!this.options.codeBlocks.enabled || !markdown) {
    return { fixed: markdown || '', addedChars: [] };
  }

  const lines = markdown.split('\n');
  // 过滤空值：确保行数组中无 undefined/null
  const fixedLines = lines.map(line => line || '').filter(line => line !== undefined);
  const addedChars: { char: string; position: number }[] = [];
  let inCodeBlock = false; // 是否处于未闭合代码块中
  let emptyLineCount = 0; // 连续空白行计数（仅在代码块内生效）
  let blockStartLine = -1; // 当前代码块起始行号
  let lineOffset = 0; // 因插入行导致的行号偏移量

  // 辅助方法：判断行是否为空白行（仅含空格/制表符）- 增加空值防护
  const isEmptyLine = (line: string | undefined): boolean => {
    if (!line) return true; // undefined/null 视为空白行
    return line.trim() === '';
  };

  // 辅助方法：判断行是否为```+语言标记行 - 增加空值防护
  const isCodeBlockWithLang = (line: string | undefined): boolean => {
    if (!line) return false; // 空行直接返回false
    const trimmed = line.trim();
    // 匹配```开头且后面跟语言（非空），排除纯```
    return trimmed.startsWith('```') && trimmed.length > 3 && !/^```\s*$/.test(trimmed);
  };

  // 新增辅助方法：判断行是否以中文开头（含全角标点/中文文字）
  const isStartWithChinese = (line: string | undefined): boolean => {
    if (!line) return false;
    const trimmedLine = line.trim(); // 先去除首尾空白
    if (trimmedLine === '') return false; // 空白行不判断
    // 匹配中文开头：[\u4e00-\u9fa5] 匹配中文，[\uff00-\uffef] 匹配全角标点
    const chineseStartRegex = /^[\u4e00-\u9fa5\uff00-\uffef]/;
    return chineseStartRegex.test(trimmedLine);
  };

  // 辅助方法：计算指定行的全局字符偏移量 - 增加边界防护
  const calculateCharOffset = (targetLine: number): number => {
    if (targetLine < 0 || targetLine >= fixedLines.length) return 0;
    let offset = 0;
    for (let i = 0; i < targetLine; i++) {
      // 空值防护：确保行存在且为字符串
      const line = fixedLines[i] || '';
      offset += line.length + 1; // 行长度 + 换行符
    }
    return offset;
  };

  // 步骤1：逐行扫描（从```开始追踪）- 增加边界检查
  for (let i = 0; i < fixedLines.length; i++) {
    const currentLineIdx = i + lineOffset;
    // 边界防护：超出数组长度则终止循环
    if (currentLineIdx >= fixedLines.length) break;
    
    // 空值防护：确保行是字符串类型
    const line = fixedLines[currentLineIdx] || '';
    const trimmedLine = line.trim();

    // 跳过转义的```标记（不参与代码块状态判断）
    const backtickPos = line.indexOf('```');
    const charPos = calculateCharOffset(currentLineIdx) + (backtickPos >= 0 ? backtickPos : 0);
    const isEscapedBacktick = backtickPos !== -1 && this.isEscaped(charPos, escapePositions);

    // 1. 检测代码块起始标记（非转义的```）
    if (!inCodeBlock && trimmedLine.startsWith('```') && !isEscapedBacktick) {
      inCodeBlock = true;
      blockStartLine = currentLineIdx;
      emptyLineCount = 0; // 重置空白行计数
      continue;
    }

    // 2. 仅在代码块内执行逐行判断逻辑
    if (inCodeBlock) {
      // 新增规则：遇到以中文开头的行 → 在上一行插入```闭合代码块
      if (isStartWithChinese(line)) {
        const insertLineIdx = currentLineIdx;
        // 边界防护：插入位置不越界
        if (insertLineIdx >= 0 && insertLineIdx <= fixedLines.length) {
          fixedLines.splice(insertLineIdx, 0, '```');
          // 记录添加的字符位置
          const charOffset = calculateCharOffset(insertLineIdx);
          addedChars.push(
            { char: '`', position: charOffset },
            { char: '`', position: charOffset + 1 },
            { char: '`', position: charOffset + 2 }
          );
          // 更新状态：退出代码块
          lineOffset += 1;
          inCodeBlock = false;
          emptyLineCount = 0;
          blockStartLine = -1;
        }
        continue; // 处理完中文行后跳过后续判断
      }

      // 原有规则2：遇到```+语言 → 在上一行插入```闭合当前块
      if (isCodeBlockWithLang(line) && !isEscapedBacktick) {
        const insertLineIdx = currentLineIdx;
        // 边界防护：插入位置不越界
        if (insertLineIdx >= 0 && insertLineIdx <= fixedLines.length) {
          fixedLines.splice(insertLineIdx, 0, '```');
          // 记录添加的字符位置
          const charOffset = calculateCharOffset(insertLineIdx);
          addedChars.push(
            { char: '`', position: charOffset },
            { char: '`', position: charOffset + 1 },
            { char: '`', position: charOffset + 2 }
          );
          // 更新状态：当前行变为新代码块起始
          lineOffset += 1; // 插入行导致后续行偏移+1
          inCodeBlock = true;
          blockStartLine = currentLineIdx + 1; // 新代码块起始行（插入行的下一行）
          emptyLineCount = 0;
        }
        continue;
      }

      // 原有规则1：连续两行空白 → 插入```闭合
      if (isEmptyLine(line)) {
        emptyLineCount += 1;
        // 连续两行空白，在第二行空白行上方插入```
        if (emptyLineCount === 2) {
          const insertLineIdx = currentLineIdx;
          // 边界防护：插入位置不越界
          if (insertLineIdx >= 0 && insertLineIdx <= fixedLines.length) {
            fixedLines.splice(insertLineIdx, 0, '```');
            // 记录字符位置
            const charOffset = calculateCharOffset(insertLineIdx);
            addedChars.push(
              { char: '`', position: charOffset },
              { char: '`', position: charOffset + 1 },
              { char: '`', position: charOffset + 2 }
            );
            // 更新状态
            lineOffset += 1;
            inCodeBlock = false;
            emptyLineCount = 0;
            blockStartLine = -1;
          }
        }
      } else {
        // 非空白行，重置连续空白行计数
        emptyLineCount = 0;
      }

      // 原有规则：检测正常的```闭合标记（无语言）→ 退出代码块
      if (trimmedLine === '```' && !isEscapedBacktick) {
        inCodeBlock = false;
        emptyLineCount = 0;
        blockStartLine = -1;
      }
    }
  }

  // 原有规则3：到结尾仍未闭合 → 在最后补```
  if (inCodeBlock) {
    const insertLineIdx = fixedLines.length;
    fixedLines.push('```');
    // 计算插入位置的字符偏移
    const charOffset = calculateCharOffset(insertLineIdx);
    addedChars.push(
      { char: '`', position: charOffset },
      { char: '`', position: charOffset + 1 },
      { char: '`', position: charOffset + 2 }
    );
  }

  const fixedMarkdown = fixedLines.join('\n');
  return { fixed: fixedMarkdown, addedChars };
}


/**
 * 行内代码修复（`）：精准补全“单独的`”，而非简单补全奇偶差
 * @param markdown 原始文本
 * @param escapePositions 转义符位置数组
 * @returns 修复后的文本和添加的字符信息
 */
private fixInlineCodeWithDiff(markdown: string, escapePositions: number[]): { fixed: string; addedChars: { char: string; position: number }[] } {
  if (!this.options.inlineCode.enabled) {
    return { fixed: markdown, addedChars: [] };
  }

  const lines = markdown.split('\n');
  const addedChars: { char: string; position: number }[] = [];
  let globalCharOffset = 0;
  // 标记是否处于代码块中（```包裹的区域）
  let isInCodeBlock = false;

  lines.forEach((line, lineIdx) => {
    const lineStartPos = globalCharOffset;
    const lineEndPos = lineStartPos + line.length;
    let isInCode = false; // 状态机：是否处于未闭合的行内代码中

    // 检查当前行是否包含代码块标记 ```，更新代码块状态
    const trimmedLine = line.trim();
    if (trimmedLine === '```' || trimmedLine.startsWith('```') && !trimmedLine.slice(3).includes('`')) {
      isInCodeBlock = !isInCodeBlock;
      // 代码块行直接跳过处理，更新偏移量
      globalCharOffset += line.length + 1;
      return;
    }

    // 如果处于代码块中，跳过当前行的行内代码处理
    if (isInCodeBlock) {
      globalCharOffset += line.length + 1;
      return;
    }

    // 1. 逐字符扫描，追踪`的开启/闭合状态（精准定位单独`）
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const char = line[charIdx];
      if (char !== '`') continue;

      const globalCharPos = lineStartPos + charIdx;
      // 跳过转义的`
      if (this.isEscaped(globalCharPos, escapePositions)) continue;

      // 切换闭合状态：遇到未转义`，开启/关闭行内代码
      isInCode = !isInCode;
    }

    // 2. 仅当本行存在未闭合的`（即有单独`）时，在本行末尾补`
    if (isInCode) {
      // 新增：统计本行未转义`的数量
      const unescapedCount = [...line.matchAll(/`/g)].filter(m =>
        !this.isEscaped(lineStartPos + m.index!, escapePositions)
      ).length;

      // 仅当“未闭合 + 数量=1”时补全
      if (unescapedCount === 1) {
        lines[lineIdx] = line + '`';
        addedChars.push({
          char: '`',
          position: lineEndPos
        });
        // 更新偏移量（本行长度 + 1换行符 + 1新增`）
        globalCharOffset += line.length + 2;
      } else {
        // 未闭合但数量不是1，不补全，正常更新偏移量
        globalCharOffset += line.length + 1;
      }
    } else {
      globalCharOffset += line.length + 1;
    }
  });

  const fixedMarkdown = lines.join('\n');
  return { fixed: fixedMarkdown, addedChars };
}


  // 数学公式修复
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

  /**
   * 查找未闭合的括号匹配（支持跨行未闭合场景）
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

    // ========== 1. 匹配未闭合的 [text](url / ![alt](url（支持跨行） ==========
    // 正则说明：
    // ${prefixRegex} - 前缀（链接：(?<!\\\\|!)，图片：!）
    // \[(.*?)(?<!\\\\)\] - 匹配[]包裹的文本（排除转义]）
    // \s*\( - 匹配括号前的空白+左括号
    // ([\s\S]*?) - 匹配括号内任意内容（包括换行，支持跨行）
    // (?=\n|$| |\t) - 匹配到URL结束位置（换行/文本末尾/空格/制表符前）
    // (?!\)) - 确保后面没有闭合)
    const unclosedRegex = new RegExp(
      `${prefixRegex}\\[(.+?)(?<!\\\\)\\]\\s*\\(([\\s\\S]*?)(?=\\n|$| |\\t)(?!\\))`,
      'g'
    );

    let match: RegExpExecArray | null;
    while ((match = unclosedRegex.exec(markdown)) !== null) {
      // 检查 [ 是否被转义
      const bracketStartPos = match.index + prefixRegex.length;
      if (this.isEscaped(bracketStartPos, escapePositions)) continue;

      // 确定未闭合链接/图片的实际结束位置（URL最后一个字符的位置）
      const actualEnd = match.index + match[0].length;

      // 验证：向后查找直到文本结束/下一个语法开始，确认无)
      const afterMatch = markdown.slice(actualEnd);
      const nextCloseParen = afterMatch.indexOf(')');
      const nextSyntax = afterMatch.search(/\[|!|\$|`|```/); // 下一个Markdown语法开始
      // 如果)在其他语法之后，视为无有效闭合
      const hasValidClose = nextCloseParen !== -1 && (nextSyntax === -1 || nextCloseParen < nextSyntax);

      if (!hasValidClose) {
        matches.push({
          start: match.index,
          end: actualEnd, // 实际结束位置（URL最后一个字符）
          type: 'unclosed'
        });
      }
    }

    // ========== 2. 匹配仅含[]无()的场景（支持跨行） ==========
    const onlyBracketRegex = new RegExp(
      `${prefixRegex}\\[(.+?)(?<!\\\\)\\](?!\\s*\\()`,
      'g'
    );

    while ((match = onlyBracketRegex.exec(markdown)) !== null) {
      if (!match) continue;

      // 检查 [ 是否被转义
      const bracketStartPos = match.index + prefixRegex.length;
      if (this.isEscaped(bracketStartPos, escapePositions)) continue;

      // 排除与unclosed重复的匹配
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
   * 修复版链接修复：支持跨行未闭合链接补全)
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

    // 按结束位置降序排序（从后往前修复，避免位置偏移）
    matches.sort((a, b) => b.end - a.end);

    // 核心修复逻辑：无论是否跨行，都在URL末尾添加)
    matches.forEach(matchItem => {
      const actualEnd = matchItem.end + offset;
      if (actualEnd > fixedMarkdown.length) return;

      if (matchItem.type === 'unclosed') {
        // 仅在URL末尾添加)（核心需求，支持跨行）
        fixedMarkdown = fixedMarkdown.slice(0, actualEnd) + ')' + fixedMarkdown.slice(actualEnd);
        addedChars.push({ char: ')', position: actualEnd });
        offset += 1;
      } else if (matchItem.type === 'onlyBracket') {
        // 补充()，支持自动填充空URL
        const fillChar = this.options.links.autoFillEmptyUrl ? '#' : '';
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
   * 修复版图片修复：支持跨行未闭合图片补全)
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

    // 按结束位置降序排序
    matches.sort((a, b) => b.end - a.end);

    // 核心修复逻辑：支持跨行补全)
    matches.forEach(matchItem => {
      const actualEnd = matchItem.end + offset;
      if (actualEnd > fixedMarkdown.length) return;

      if (matchItem.type === 'unclosed') {
        // 仅在URL末尾添加)
        fixedMarkdown = fixedMarkdown.slice(0, actualEnd) + ')' + fixedMarkdown.slice(actualEnd);
        addedChars.push({ char: ')', position: actualEnd });
        offset += 1;
      } else if (matchItem.type === 'onlyBracket') {
        // 继承链接规则填充空URL
        const fillChar = this.options.images.inheritLinkRules && this.options.links.autoFillEmptyUrl ? '#' : '';
        const addStr = `(${fillChar})`;
        fixedMarkdown = fixedMarkdown.slice(0, actualEnd) + addStr + fixedMarkdown.slice(actualEnd);
        addedChars.push({ char: '(', position: actualEnd });
        addedChars.push({ char: ')', position: actualEnd + 1 });
        offset += 2;
      }
    });

    return { fixed: fixedMarkdown, addedChars: addedChars.reverse() };
  }

  // 保留原有的 isEscaped 方法
  private isEscaped(position: number, escapePositions: number[]): boolean {
    return escapePositions.includes(position);
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
