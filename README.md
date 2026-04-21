# 理财问答助手 (Finance Bot)

基于 RAG（检索增强生成）的中文理财问答 AI 助手。用户提出理财相关问题后，系统从向量数据库中检索相关文档片段，结合大模型生成有据可依的回答。

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript
- **大模型**: 阿里云百炼 DashScope（Qwen-plus）
- **向量数据库**: ChromaDB
- **Embedding**: DashScope text-embedding-v3
- **AI SDK**: Vercel AI SDK（流式输出）
- **样式**: Tailwind CSS 4

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # 聊天接口（RAG 检索 + 流式回答）
│   │   └── ingest/route.ts      # 文档入库接口
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── chat.tsx                  # 聊天界面
│   └── message.tsx               # 消息气泡（支持 Markdown）
└── lib/
    ├── chroma.ts                 # ChromaDB 客户端
    ├── chunker.ts                # 文本分块（500 字 / 100 字重叠）
    ├── embeddings.ts             # Embedding 生成
    └── prompts.ts                # System Prompt 模板
scripts/
├── ingest.ts                     # 批量文档入库脚本
└── fetch-wechat.ts               # 微信文章抓取（预留）
docs/
└── example.md                    # 示例理财文档
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key | — |
| `CHROMA_URL` | ChromaDB 地址 | `http://localhost:8100` |
| `CHROMA_COLLECTION` | 集合名称 | `finance-docs` |

### 3. 启动 ChromaDB

```bash
docker run -d -p 8100:8000 chromadb/chroma
```

### 4. 导入文档

将 `.txt` 或 `.md` 文件放入 `docs/` 目录，然后执行：

```bash
npx tsx scripts/ingest.ts
```

### 5. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000 开始提问。

## 工作流程

```
用户提问 → 生成 Embedding → ChromaDB 检索 Top-5 相关片段 → 构建 Prompt → Qwen-plus 流式回答
```

文档入库流程：

```
文档文件 → 分块（500字/100字重叠） → 生成 Embedding → 存入 ChromaDB
```

## API

- `POST /api/chat` — 聊天接口，接收 `messages` 数组，流式返回回答
- `POST /api/ingest` — 文档入库，接收 `{ content, source }` 并分块存储