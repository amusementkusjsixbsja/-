import { useState, useEffect } from 'react';
import { markdownToHtml } from './utils/markdown';
import 'katex/dist/katex.min.css';

function App() {
  // 测试样张内容
  const [markdown, setMarkdown] = useState<string>( ``

  );
  const [html, setHtml] = useState<string>('');

  // 实时转换
  useEffect(() => {
    const convert = async () => {
      const result = await markdownToHtml(markdown);
      setHtml(result);
    };
    convert();
  }, [markdown]);

  return (
    <div className="app">
      <h1>Markdown 完整渲染器</h1>
      <div className="container">
        <div className="editor">
          <h2>编辑区</h2>
          <textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
        </div>
        <div className="preview">
          <h2>预览区</h2>
          <div className="preview-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

export default App;