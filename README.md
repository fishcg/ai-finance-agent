# 理财王中王

AI 驱动的理财分析 Agent。将散落在公众号文章、B 站视频、互联网资讯中的投资信息蒸馏为结构化知识，通过多工具协同的 Agent 架构实时回答理财问题。

## 核心能力

### 资料蒸馏

把非结构化的理财内容转化为可检索的知识：

- **公众号 / 长文** — 导入 `docs/` 目录，自动分块（500 字 / 100 字重叠）、生成 Embedding、存入 ChromaDB 向量库
- **B 站投资视频** — 自动获取指定 UP 主近期视频的 AI 总结 + 字幕全文，提取投资观点和操作记录
- **实时资讯** — 联网搜索 A 股、美股、大宗商品最新行情，与蒸馏内容交叉验证

### Agent 分析

多工具协同的智能分析流程，所有数据必须来自工具调用，禁止使用模型历史数据：

```
用户提问
  ├─ searchKnowledgeBase  → 向量检索知识库
  ├─ webSearch            → 联网获取实时行情 / 新闻
  └─ bilibiliInvestmentDigest → 获取 UP 主视频内容
      │
      ▼
  Agent 综合分析 → 结构化回答 + 免责声明
```

- **知识库检索** — 语义搜索已入库的理财文档，返回 Top-5 相关片段
- **联网搜索** — 实时获取市场数据、新闻、政策动态
- **B 站视频分析** — 获取 UP 主（默认 CLS同学）近 N 天视频，提取 AI 摘要、分段提纲、字幕原文，配合联网数据输出投资分析报告

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 + React 19 + TypeScript |
| 大模型 | 阿里云百炼 DashScope（可配置模型） |
| 向量库 | ChromaDB |
| Embedding | DashScope text-embedding-v3 |
| AI SDK | Vercel AI SDK（流式输出 + 多步 Tool Calling） |
| 样式 | Tailwind CSS 4 |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.local.example .env.local
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key | — |
| `CHAT_MODEL` | 聊天模型 | `qwen-plus` |
| `CHROMA_URL` | ChromaDB 地址 | `http://localhost:8000` |
| `CHROMA_COLLECTION` | 集合名称 | `finance-docs` |

### 3. 启动 ChromaDB

```bash
docker run -d -p 8000:8000 chromadb/chroma
```

### 4. 导入文档

将 `.txt` 或 `.md` 文件放入 `docs/` 目录：

```bash
npx tsx scripts/ingest.ts
```

### 5. 启动

```bash
make dev
# 或
npm run dev
```

访问 http://localhost:3000

### Docker 部署

```bash
make docker-build
make docker-run    # 从 .env.local 读取环境变量
```

## 项目结构

```
src/
├── app/
│   └── api/
│       ├── chat/route.ts          # Agent 聊天（多步 Tool Calling + 流式输出）
│       └── ingest/route.ts        # 文档入库
├── components/
│   ├── chat.tsx                   # 聊天界面
│   ├── message.tsx                # 消息气泡（Markdown 渲染）
│   └── tool-status.tsx            # 工具调用状态（可展开查看结果）
└── lib/
    ├── bilibili.ts                # B 站 API 封装（Wbi 签名 / curl 防风控）
    ├── chroma.ts                  # ChromaDB 客户端
    ├── chunker.ts                 # 文本分块
    ├── embeddings.ts              # Embedding 生成
    ├── prompts.ts                 # Agent 系统提示
    └── tools.ts                   # Tool 定义（知识库 / 联网 / B站）
scripts/
├── ingest.ts                      # 批量文档入库
└── fetch-wechat.ts                # 微信文章抓取（预留）
skills/                            # Skill 文档（B 站 API 调用参考）
```

## B 站视频分析配置

在 `~/.config/bilibili-cookie` 中配置：

```
BILIBILI_SESSDATA='你的SESSDATA值'
```

buvid3/buvid4 会通过 B 站 API 自动获取，无需手动配置。
