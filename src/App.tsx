import { useState, useEffect, useRef } from 'react';
import { markdownToHtml, MarkdownSyntaxFixer } from './utils/index';
import { StreamController } from './utils/streamController';
import './App.css';

function App() {
  const [markdown, setMarkdown] = useState<string>(''); // 编辑区内容
  const [originalMarkdown, setOriginalMarkdown] = useState<string>(''); // 原始文本（修复前）
  const [previewContent, setPreviewContent] = useState<string>(''); // 预览区内容
  const [isStreamMode, setIsStreamMode] = useState<boolean>(false); // 流式渲染开关
  const [isSyntaxFixed, setIsSyntaxFixed] = useState<boolean>(false); // 语法修复状态

  // 流式渲染参数控制
  const [initialSpeed, setInitialSpeed] = useState<number>(40); // 初始间隔：10-100ms/字符，初始值40（原55-15）
  // 最小间隔：初始时为初始间隔的1.5倍快，范围为初始间隔的2倍快
  const [maxSpeed, setMaxSpeed] = useState<number>(Math.round((initialSpeed - 15) / 1.5)); // 初始值：(初始间隔-15)/1.5
  const [damping, setDamping] = useState<number>(0.80); // 阻尼系数：0.70-0.90，初始值0.80

  const streamControllerRef = useRef<StreamController | null>(null);
  const currentStreamContentRef = useRef<string>(''); // 记录当前流式渲染的内容（而非完整编辑区内容）
  const previewRef = useRef<HTMLDivElement>(null); // 预览区容器Ref
  const previewContentRef = useRef<HTMLDivElement>(null); // 预览区内容Ref
  const [autoScroll, setAutoScroll] = useState<boolean>(true); // 是否自动跟随滚动

  // 当初始速度变化时，更新最小速度
  useEffect(() => {
    const calculatedMaxSpeed = Math.round((initialSpeed - 15) / 1.5);
    // 确保最小间隔不小于滑块最小值5
    setMaxSpeed(Math.max(5, calculatedMaxSpeed));
  }, [initialSpeed]);

  // 初始化流式控制器，参数变化时重新创建并重启流式渲染
  useEffect(() => {
    // 停止当前流
    streamControllerRef.current?.stop();

    // 创建新的流式控制器
    streamControllerRef.current = new StreamController({
      initialSpeed: initialSpeed,
      maxSpeed: maxSpeed,
      damping: damping,
      acceleration: 0.96
    });

    // 设置流式输出回调
    streamControllerRef.current.onChar = async (char) => {
      currentStreamContentRef.current += char;
      const html = await markdownToHtml(currentStreamContentRef.current);
      setPreviewContent(html);
    };

    // 如果是流式模式且有内容，重新启动流式渲染
    if (isStreamMode && markdown) {
      // 重置流式内容记录
      currentStreamContentRef.current = '';
      // 使用完整的markdown内容重新启动流式渲染
      streamControllerRef.current.add(markdown);
    }

    return () => {
      streamControllerRef.current?.stop();
    };
  }, [initialSpeed, maxSpeed, damping, isStreamMode, markdown]);

  // 流式开关切换时：重置状态
  useEffect(() => {
    if (isStreamMode) {
      // 开启流式：清空预览区、重置流式内容记录、停止当前流
      setPreviewContent('');
      currentStreamContentRef.current = '';
      streamControllerRef.current?.stop();
      setAutoScroll(true); // 开启流式时自动跟随

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
  }, [isStreamMode]); // 仅开关变化时触发

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
    setAutoScroll(true); // 内容变化时重置自动跟随
  }, [markdown, isStreamMode]); // 编辑区内容变化时触发

  // 语法修复按钮点击事件
  const handleFixSyntax = () => {
    if (!isSyntaxFixed) {
      // 保存原始文本
      setOriginalMarkdown(markdown);

      // 执行语法修复
      const fixer = new MarkdownSyntaxFixer();
      const result = fixer.fixWithDiff(markdown);

      // 更新编辑区内容
      setMarkdown(result.fixed);
      setIsSyntaxFixed(true);
    } else {
      // 恢复原始文本
      setMarkdown(originalMarkdown);
      setIsSyntaxFixed(false);
    }
  };

  // 预览区事件处理：脚注点击和取消自动滚动
  useEffect(() => {
    const previewContent = previewContentRef.current;
    if (!previewContent) return;

    // 监听预览区内容的点击事件
    const handlePreviewContentClick = (e: MouseEvent) => {
      // 取消自动滚动
      setAutoScroll(false);
    };

    previewContent.addEventListener('click', handlePreviewContentClick);
    return () => {
      previewContent.removeEventListener('click', handlePreviewContentClick);
    };
  }, []); // 仅在组件挂载时绑定一次事件

  // 脚注点击处理
  useEffect(() => {
    const previewContainer = previewRef.current;
    if (!previewContainer) return;

    // 监听预览区内的所有链接点击
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLAnchorElement;
      // 仅处理脚注链接（href 以 # 开头，指向脚注锚点）
      if (target.tagName === 'A') {
        const href = target.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault(); // 阻止全局锚点跳转
          const footnoteId = href.slice(1); // 去掉 # 取 id
          const targetElement = previewContainer.querySelector(`#${footnoteId}`);

          if (targetElement) {
            // 预览区内部滚动到目标元素
            targetElement.scrollIntoView({
              behavior: 'smooth', // 平滑滚动
              block: 'end', // 滚动到元素底部（对应脚注位置）
              inline: 'nearest'
            });
          }
        }
      }
    };

    previewContainer.addEventListener('click', handleLinkClick);
    return () => {
      previewContainer.removeEventListener('click', handleLinkClick);
    };
  }, []); // 仅在组件挂载时绑定一次事件

  // 预览区内容更新时自动滚动到底部
  useEffect(() => {
    if (autoScroll && previewContentRef.current) {
      previewContentRef.current.scrollTop = previewContentRef.current.scrollHeight;
    }
  }, [previewContent, autoScroll]);

  return (
    <div className="app">
      <div className="header">
        <h1>Markdown 渲染器（流式开关）</h1>
        <p>by:王昆尧</p>
      </div>
      {/* 功能开关区域 */}
      <div className="feature-toggles">
        {/* 流式渲染开关 */}
        <div className="toggle-item">
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

        {/* 语法修复按钮 */}
        <div className="toggle-item">
          <button
            onClick={handleFixSyntax}
            className={`fix-syntax-button ${isSyntaxFixed ? 'active' : ''}`}
          >
            {isSyntaxFixed ? '恢复原始文本' : '修复语法错误'}
          </button>
        </div>

        {/* 流式渲染参数控制，仅在流式模式开启时显示 */}
        {isStreamMode && (
          <div className="stream-controls-inline">
            <div className="control-item-inline">
              <label>初始间隔 ({initialSpeed}ms/字符)</label>
              <input
                type="range"
                min="10"
                max="100"
                step="1"
                value={initialSpeed}
                onChange={(e) => setInitialSpeed(Number(e.target.value))}
                className="slider inline-slider"
              />
            </div>
            <div className="control-item-inline">
              <label>最小间隔 ({maxSpeed}ms/字符)</label>
              <input
                type="range"
                min="5"
                max={Math.ceil(initialSpeed / 2)}
                step="1"
                value={maxSpeed}
                onChange={(e) => setMaxSpeed(Number(e.target.value))}
                className="slider inline-slider"
              />
            </div>
            <div className="control-item-inline">
              <label>阻尼 ({damping.toFixed(2)})</label>
              <input
                type="range"
                min="0.70"
                max="0.90"
                step="0.01"
                value={damping}
                onChange={(e) => setDamping(Number(e.target.value))}
                className="slider inline-slider"
              />
            </div>
          </div>
        )}
      </div>

      <div className="container">
        {/* 编辑区 */}
        <div className="editor">
          {/* 新增：标题和按钮的容器 */}
          <div className="editor-header">
            <h2>编辑区</h2>
            <button onClick={() => {
              setMarkdown('');
              setPreviewContent('');
              setIsSyntaxFixed(false);
              setOriginalMarkdown('');
            }} className="clear-button">
              删除全部
            </button>
          </div>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="请输入 Markdown 内容..."
          />
        </div>

        {/* 预览区（关键：添加 ref 和独立滚动样式） */}
        <div className="preview" ref={previewRef}>
          {/* 新增：标题容器，与编辑区保持一致 */}
          <div className="editor-header">
            <h2>预览区</h2>
          </div>
          <div
            ref={previewContentRef}
            className="preview-content"
            dangerouslySetInnerHTML={{ __html: previewContent }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;