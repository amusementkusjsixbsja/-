// src/utils/plugins.ts
import { visit } from 'unist-util-visit';
import { type Transformer, type Root } from './config';

// 处理GFM代码块的行高亮（如 ```python {3,5}）
export function handleCodeBlockLineHighlight(): Transformer<Root, Root> {
  return (tree) => {
    visit(tree, 'code', (node) => {
      const data = node.data || (node.data = {});
      const lang = node.lang || 'text';
      
      // 提取行高亮标记（如 {3,5}）
      const langMatch = lang.match(/^(\w+)\s*\{(\d+(?:,\s*\d+)*)\}$/);
      let highlightLines: number[] = [];
      let realLang = lang;
      
      if (langMatch) {
        realLang = langMatch[1];
        highlightLines = langMatch[2].split(',').map(Number);
      }

      // 为代码块添加自定义属性（供前端样式高亮行）
      data.hProperties = {
        class: `language-${realLang}`,
        'data-highlight-lines': highlightLines.join(','),
      };
    });
  };
}

// 处理自定义指令（callout、badge等）
export function handleDirectives(): Transformer<Root, Root> {
  return (tree) => {
    visit(tree, 'containerDirective', (node) => {
      const data = node.data || (node.data = {});
      const attrs = node.attributes || {};

      // 安全地提取标题
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
