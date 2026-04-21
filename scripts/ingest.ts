/**
 * 批量导入历史文档到 ChromaDB
 *
 * 用法: npx tsx scripts/ingest.ts
 *
 * 将 txt/md 文件放入 docs/ 目录，运行此脚本即可导入
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import * as fs from "fs";
import * as path from "path";
import { chunkText } from "../src/lib/chunker";
import { getEmbeddings } from "../src/lib/embeddings";
import { addDocuments } from "../src/lib/chroma";

const DOCS_DIR = path.resolve(__dirname, "../docs");
const BATCH_SIZE = 10;

async function main() {
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    console.log(`已创建 docs/ 目录，请将文档放入后重新运行`);
    return;
  }

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".txt") || f.endsWith(".md"));

  if (files.length === 0) {
    console.log("docs/ 目录中没有找到 .txt 或 .md 文件");
    return;
  }

  console.log(`找到 ${files.length} 个文档文件`);

  let totalChunks = 0;

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const chunks = chunkText(content, file);

    console.log(`处理: ${file} (${chunks.length} 个片段)`);

    // 分批处理 embedding
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.text);

      try {
        const embeddings = await getEmbeddings(texts);

        const ids = batch.map(
          (c) => `${c.metadata.source}-${c.metadata.chunkIndex}`
        );
        const metadatas = batch.map((c) => ({
          source: c.metadata.source,
          chunkIndex: String(c.metadata.chunkIndex),
        }));

        await addDocuments(ids, embeddings, texts, metadatas);
        totalChunks += batch.length;
      } catch (err) {
        console.error(`  批次 ${i / BATCH_SIZE + 1} 失败，跳过:`, (err as Error).message);
      }

      if ((i / BATCH_SIZE + 1) % 50 === 0) {
        console.log(`  进度: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`);
      }
    }
  }

  console.log(`\n导入完成！共处理 ${totalChunks} 个文本片段`);
}

main().catch(console.error);
