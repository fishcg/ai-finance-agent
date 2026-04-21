function getConfig() {
  return {
    apiKey: process.env.DASHSCOPE_API_KEY!,
    baseUrl:
      process.env.EMBEDDING_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };
}

export async function getEmbedding(text: string): Promise<number[]> {
  const { apiKey, baseUrl } = getConfig();
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-v3",
      input: text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const { apiKey, baseUrl } = getConfig();
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-v3",
      input: texts,
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}
