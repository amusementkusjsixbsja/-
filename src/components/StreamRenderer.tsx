import { useState, useEffect, useRef } from 'react';
import type { StreamOptions } from '../utils/streamController';
import { StreamController } from '../utils/streamController';
// 替换原有 markdownToHtml，导入流式解析器
import { MarkdownStreamParser, markdownToHtml } from '../utils/index';

interface StreamRendererProps {
  onStreamData: (callback: (data: { content: string; isEnd: boolean }) => void) => (() => void) | void;
  streamOptions?: Partial<StreamOptions>;
}

export const StreamRenderer = ({ onStreamData, streamOptions }: StreamRendererProps) => {
  const [displayedHtml, setDisplayedHtml] = useState('');
  const [rawContent, setRawContent] = useState('');
  const controllerRef = useRef<StreamController | null>(null);
  const isMounted = useRef(true);
  // 新增：流式 Markdown 解析器实例（缓冲代码块）
  const markdownParserRef = useRef<MarkdownStreamParser | null>(null);
  // 新增：累积 HTML，避免分段替换导致闪烁
  const accumulatedHtmlRef = useRef('');

  useEffect(() => {
    controllerRef.current = new StreamController(streamOptions);
    // 初始化流式 Markdown 解析器
    markdownParserRef.current = new MarkdownStreamParser();

    controllerRef.current.onChar = (char) => {
      if (!isMounted.current) return;

      // 1. 累积原始内容（用于兜底）
      setRawContent(prev => prev + char);

      // 2. 用流式解析器处理字符（缓冲完整代码块）
      if (markdownParserRef.current) {
        markdownParserRef.current.processChunk(char).then(htmlChunk => {
          if (isMounted.current && htmlChunk) {
            // 累积 HTML 而非直接替换，避免覆盖已渲染内容
            accumulatedHtmlRef.current += htmlChunk;
            setDisplayedHtml(accumulatedHtmlRef.current);
          }
        });
      }
    };

    const unsubscribe = onStreamData(({ content, isEnd }) => {
      if (isEnd) {
        controllerRef.current?.markAsEnd();
        // 流式结束：处理缓冲中剩余的未闭合代码块
        if (markdownParserRef.current) {
          markdownParserRef.current.finish().then(finalHtml => {
            if (isMounted.current && finalHtml) {
              accumulatedHtmlRef.current += finalHtml;
              setDisplayedHtml(accumulatedHtmlRef.current);
            }
          });
        }
      }
      controllerRef.current?.add(content);
    });

    return () => {
      isMounted.current = false;
      controllerRef.current?.stop();
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [onStreamData, streamOptions]);

  // 兜底：组件卸载前确保完整解析所有内容
  useEffect(() => {
    return () => {
      if (isMounted.current && rawContent) {
        markdownToHtml(rawContent).then(html => {
          if (isMounted.current) {
            setDisplayedHtml(html);
          }
        });
      }
    };
  }, [rawContent]);

  return (
    <div
      className="stream-renderer"
      dangerouslySetInnerHTML={{ __html: displayedHtml }}
      style={{
        minHeight: '200px',
        padding: '16px',
        border: '1px solid #eee'
      }}
    />
  );
};