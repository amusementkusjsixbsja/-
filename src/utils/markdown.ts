// src/utils/markdown.ts
import { remark } from 'remark';
import parse from 'remark-parse';
import gfm from 'remark-gfm';
import directive from 'remark-directive';
import math from 'remark-math';
import remark2rehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
// 错误：import stringify from 'remark-stringify';
// 正确：导入 rehype-stringify
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Transformer } from 'unified';
import type { Root } from 'mdast';
import 'katex/dist/katex.min.css';

function handleDirectives(): Transformer<Root, Root> {
  return (tree) => {
    visit(tree, 'containerDirective', (node) => {
      const data = node.data || (node.data = {});
      const attrs = node.attributes || {};

      // 修复 2: 安全地提取标题
      let title = '';
      if (node.children && node.children.length > 0) {
        const firstChild = node.children[0];
        if (firstChild.type === 'paragraph' && firstChild.children && firstChild.children.length > 0) {
          const textNode = firstChild.children[0];
          if (textNode.type === 'text') {
            title = textNode.value;
          }
        }
      }

      data.hName = 'div';
      data.hProperties = {
        class: `callout callout-${attrs.type || 'default'}`,
        title: title,
      };
    });

    visit(tree, 'textDirective', (node) => {
      const data = node.data || (node.data = {});
      const attrs = node.attributes || {};
      data.hName = 'span';
      data.hProperties = {
        class: `badge badge-${attrs.type || 'default'}`,
      };
    });
  };
}

export async function markdownToHtml(markdown: string): Promise<string> {
  const processed = await remark()
    .use(parse)                // Markdown → Markdown AST
    .use(gfm)                  // 支持 GFM
    .use(directive)            // 支持指令
    .use(handleDirectives)     // 处理自定义指令
    .use(math)                 // 识别公式
    .use(remark2rehype)        // Markdown AST → HTML AST（关键转换）
    .use(rehypeKatex, {        // 渲染公式
      throwOnError: false,
      displayMode: true,
      trust: true
    })
    .use(rehypeStringify)      // HTML AST → HTML 字符串（正确插件）
    .process(markdown);

  const html = processed.toString();
  console.log('转换后的 HTML：', html);
  return html;
}
