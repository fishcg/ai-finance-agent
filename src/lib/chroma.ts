const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "finance-docs";
const BASE = `${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections`;

let cachedCollectionId: string | null = null;

async function getCollectionId(): Promise<string> {
  if (cachedCollectionId) return cachedCollectionId;
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`ChromaDB list collections failed: ${res.status}`);
  const cols: { id: string; name: string }[] = await res.json();
  let col = cols.find((c) => c.name === COLLECTION_NAME);
  if (!col) {
    // 自动创建 collection
    const createRes = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: COLLECTION_NAME }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`ChromaDB create collection failed: ${createRes.status} ${err}`);
    }
    col = await createRes.json();
    console.log(`[chroma] collection "${COLLECTION_NAME}" created`);
  }
  cachedCollectionId = col!.id;
  return cachedCollectionId;
}

export async function queryDocuments(embedding: number[], topK = 5) {
  const colId = await getCollectionId();
  const url = `${BASE}/${colId}/query`;
  const body = {
    query_embeddings: [embedding],
    n_results: topK,
    include: ["documents", "metadatas", "distances"],
  };
  console.log("[chroma] query url:", url);
  console.log("[chroma] embedding first 5:", embedding.slice(0, 5));
  console.log("[chroma] embedding length:", embedding.length);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log("[chroma] response status:", res.status);
  console.log("[chroma] response body (first 500):", text.substring(0, 500));
  if (!res.ok) {
    console.error("[chroma] query error:", text);
    throw new Error(`ChromaDB query failed: ${res.status}`);
  }
  const data = JSON.parse(text);
  console.log("[chroma] ids:", data.ids);
  console.log("[chroma] documents count:", data.documents?.[0]?.length);
  return data;
}

export async function addDocuments(
  ids: string[],
  embeddings: number[][],
  documents: string[],
  metadatas: Record<string, string>[]
) {
  const colId = await getCollectionId();
  const res = await fetch(
    `${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections/${colId}/add`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, embeddings, documents, metadatas }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ChromaDB add failed: ${res.status} ${err}`);
  }
}
