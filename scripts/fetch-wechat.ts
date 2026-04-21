/**
 * 微信公众号文章抓取脚本（预留）
 *
 * 后续可接入 WeRSS 或其他方式获取公众号文章
 * 获取后调用 ingest API 导入到向量数据库
 */

const INGEST_URL = "http://localhost:3000/api/ingest";

async function ingestArticle(title: string, content: string) {
  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: content, source: title }),
  });

  if (!res.ok) {
    throw new Error(`Ingest failed: ${res.status}`);
  }

  const data = await res.json();
  console.log(`导入成功: ${title} (${data.chunks} 个片段)`);
}

// TODO: 实现公众号文章抓取逻辑
async function main() {
  console.log("公众号文章抓取脚本（预留）");
  console.log("请实现具体的抓取逻辑后使用");

  // 示例：手动导入文章
  // await ingestArticle("文章标题", "文章正文内容...");
}

main().catch(console.error);
