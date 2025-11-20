import { useState, useEffect } from 'react';
import { markdownToHtml } from './utils/markdown';
import 'katex/dist/katex.min.css';

function App() {
  // 测试样张内容
  const [markdown, setMarkdown] = useState<string>( `
    # 前端 Markdown 渲染器测试样张

这是一个用于测试渲染器功能的综合示例。

## GFM 语法

### 任务列表
- [x] 支持流式渲染
- [x] 支持 GFM 语法
- [x] 支持公式

### 表格
| 功能点 | 优先级 | 负责人 |
| --- | :---: | ---: |
| GFM 支持 | P0 | @sunzhongda |
| 公式渲染 | P1 | @sunzhongda |
| 指令扩展 | P1 | @sunzhongda |

### 脚注
这是一个包含脚注的句子[^1]。
[^1]: 这是脚注的具体内容。

## 公式渲染

当质量 $m$ 的物体以速度 $v$ 运动时，其动能 $E_k$ 由以下公式定义：

$$
E_k = \\frac{1}{2}mv^2
$$

这个公式是经典力学的基础。

## 扩展指令（加分项）

你可以使用指令来创建一些特殊的 UI 元素。

这是一个成功状态的徽章 :badge[Success]{type=success}，和一个警告状态的徽章 :badge[Warning]{type=warning}。

:::callout[这是一个提示]
你可以在这里写下需要引起用户注意的详细信息。
- 列表项 1
- 列表项 2
:::

:::callout[危险操作]{type=danger}
这是一个表示危险操作的警告框，请谨慎操作！
:::

  `

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