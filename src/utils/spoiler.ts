// src/utils/spoiler.ts
// 实现 !!! ... !!! 语法的spoiler功能

import { visit } from 'unist-util-visit';
import { type Transformer, type Root } from './config';

// remark 插件
export function handleSpoiler(): Transformer<Root, Root> {
  return (tree) => {
    // 首先，我们需要处理文本节点，将 !!! 内容转换为 spoiler 节点
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;

      const text = node.value;
      const regex = /!!!(.*?)!!!/g;
      const matches = [...text.matchAll(regex)];

      if (matches.length === 0) return;

      const newNodes: any[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        const [fullMatch, content] = match;
        const matchIndex = match.index!;

        // 添加匹配前的文本
        if (matchIndex > lastIndex) {
          newNodes.push({
            type: 'text',
            value: text.slice(lastIndex, matchIndex)
          });
        }

        // 添加 spoiler 节点
        newNodes.push({
          type: 'span',
          children: [{ type: 'text', value: content }],
          data: {
            hName: 'span',
            hProperties: {
              className: 'spoiler'
            }
          }
        });

        lastIndex = matchIndex + fullMatch.length;
      }

      // 添加剩余文本
      if (lastIndex < text.length) {
        newNodes.push({
          type: 'text',
          value: text.slice(lastIndex)
        });
      }

      // 替换原节点
      parent.children.splice(index, 1, ...newNodes);
    });
  };
}