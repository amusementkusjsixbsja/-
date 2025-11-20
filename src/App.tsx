import { useState, useEffect, useRef } from 'react';
import { markdownToHtml } from './utils/markdown';
import { StreamController } from './utils/streamController';
import './App.css';

function App() {
  const [markdown, setMarkdown] = useState<string>(''); // 编辑区内容
  const [previewContent, setPreviewContent] = useState<string>(''); // 预览区内容
  const [isStreamMode, setIsStreamMode] = useState<boolean>(false); // 流式渲染开关

  const streamControllerRef = useRef<StreamController | null>(null);
  const currentStreamContentRef = useRef<string>(''); // 记录当前流式渲染的内容（而非完整编辑区内容）

  // 初始化流式控制器
  useEffect(() => {
    streamControllerRef.current = new StreamController({
      initialSpeed: 60,
      maxSpeed: 15,
      acceleration: 0.96
    });

    // 流式输出回调：逐字更新预览区（基于当前流内容）
    streamControllerRef.current.onChar = async (char) => {
      currentStreamContentRef.current += char;
      const html = await markdownToHtml(currentStreamContentRef.current);
      setPreviewContent(html);
    };

    return () => {
      streamControllerRef.current?.stop();
    };
  }, []);

  // 流式开关切换时：重置状态（关键修复）
  useEffect(() => {
    if (isStreamMode) {
      // 开启流式：清空预览区、重置流式内容记录、停止当前流
      setPreviewContent('');
      currentStreamContentRef.current = '';
      streamControllerRef.current?.stop();

      // 如果编辑区已有内容，直接启动流式渲染（逐字显示已有内容）
      if (markdown) {
        streamControllerRef.current?.add(markdown);
      }
    } else {
      // 关闭流式：立即完整渲染当前编辑区内容
      const renderFull = async () => {
        const html = await markdownToHtml(markdown);
        setPreviewContent(html);
      };
      renderFull();
    }
  }, [isStreamMode, markdown]); // 开关或编辑区内容变化时触发

  // 编辑区内容变化处理（区分流式/非流式）
  useEffect(() => {
    if (!isStreamMode) {
      // 非流式：实时完整渲染
      const renderFull = async () => {
        const html = await markdownToHtml(markdown);
        setPreviewContent(html);
      };
      renderFull();
      return;
    }

    // 流式模式：停止当前流，重置内容，重新逐字渲染全部内容
    streamControllerRef.current?.stop();
    currentStreamContentRef.current = ''; // 重置流式内容记录
    streamControllerRef.current?.add(markdown); // 重新添加全部内容（逐字渲染）
  }, [markdown, isStreamMode]);

  return (
    <div className="app">
      <div className="header">
      <h1>Markdown 渲染器（流式开关）</h1>
      <p>by:前端2组b队</p>
    </div>
      {/* 流式渲染开关 */}
      <div className="stream-toggle">
        <label>
          <input
            type="checkbox"
            checked={isStreamMode}
            onChange={(e) => setIsStreamMode(e.target.checked)}
          />
          启用流式渲染
        </label>
        <span className="mode-info">
          {isStreamMode ? '（编辑区输入将逐字渲染）' : '（编辑区输入将实时完整渲染）'}
        </span>
      </div>

      <div className="container">
        {/* 编辑区 */}
        <div className="editor">
          <h2>编辑区</h2>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="请输入 Markdown 内容..."
          />
        </div>

        {/* 预览区 */}
        <div className="preview">
          <h2>预览区</h2>
          <div
            className="preview-content"
            dangerouslySetInnerHTML={{ __html: previewContent }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;