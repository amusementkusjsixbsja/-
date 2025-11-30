// src/utils/config.ts
// 导入核心库
import { remark } from 'remark';
import parse from 'remark-parse';
import gfm from 'remark-gfm';
import directive from 'remark-directive';
import math from 'remark-math';
import remark2rehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import type { Transformer } from 'unified';
import type { Root } from 'mdast';

// 导入样式
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

// Markdown 解析器默认配置
export const DEFAULT_MARKDOWN_CONFIG = {
  autoFixSyntax: true, // 默认开启自动语法修复功能
  // 可在此处添加其他默认配置
};

export {
  remark,
  parse,
  gfm,
  directive,
  math,
  remark2rehype,
  rehypeKatex,
  rehypeHighlight,
  rehypeRaw,
  rehypeStringify,
  type Transformer,
  type Root
};
