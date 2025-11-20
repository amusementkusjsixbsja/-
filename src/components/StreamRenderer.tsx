// src/components/StreamRenderer.tsx
import { useState, useEffect, useRef } from 'react'; // 移除未使用的 useCallback
import type { StreamOptions } from '../utils/streamController'; // 仅类型导入（关键修正）
import { StreamController } from '../utils/streamController';
import { markdownToHtml } from '../utils/markdown';

interface StreamRendererProps {
  onStreamData: (callback: (data: { content: string; isEnd: boolean }) => void) => (() => void) | void; // 明确返回类型
  streamOptions?: Partial<StreamOptions>;
}

export const StreamRenderer = ({ onStreamData, streamOptions }: StreamRendererProps) => {
  const [displayedHtml, setDisplayedHtml] = useState('');
  const [rawContent, setRawContent] = useState('');
  const controllerRef = useRef<StreamController | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    controllerRef.current = new StreamController(streamOptions);
    
    controllerRef.current.onChar = (char) => {
      if (!isMounted.current) return;
      
      setRawContent(prev => {
        const newContent = prev + char;
        markdownToHtml(newContent).then(html => {
          if (isMounted.current) {
            setDisplayedHtml(html);
          }
        });
        return newContent;
      });
    };

    // 修正：处理 onStreamData 可能无返回值的情况（解决 "不可调用" 错误）
    const unsubscribe = onStreamData(({ content, isEnd }) => {
      if (isEnd) {
        controllerRef.current?.markAsEnd();
      }
      controllerRef.current?.add(content);
    });

    return () => {
      isMounted.current = false;
      controllerRef.current?.stop();
      if (typeof unsubscribe === 'function') { // 仅在有返回值时调用
        unsubscribe();
      }
    };
  }, [onStreamData, streamOptions]);

  useEffect(() => {
    return () => {
      if (rawContent && controllerRef.current?.['isEnd']) {
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