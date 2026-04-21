export interface Chunk {
  text: string;
  metadata: { source: string; chunkIndex: number };
}

const CHUNK_SIZE = 500; // 大约 500 字符
const CHUNK_OVERLAP = 100;

export function chunkText(text: string, source: string): Chunk[] {
  // 清理非法 Unicode 字符（lone surrogates 等）
  const clean = text.replace(/[\uD800-\uDFFF]/g, "");
  const chunks: Chunk[] = [];
  // 先按段落分割
  const paragraphs = clean.split(/\n{2,}/);
  let buffer = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (buffer.length + trimmed.length > CHUNK_SIZE && buffer.length > 0) {
      chunks.push({
        text: buffer.trim(),
        metadata: { source, chunkIndex },
      });
      chunkIndex++;
      // 保留重叠部分
      const overlap = buffer.slice(-CHUNK_OVERLAP);
      buffer = overlap + "\n\n" + trimmed;
    } else {
      buffer += (buffer ? "\n\n" : "") + trimmed;
    }
  }

  if (buffer.trim()) {
    chunks.push({
      text: buffer.trim(),
      metadata: { source, chunkIndex },
    });
  }

  return chunks;
}
