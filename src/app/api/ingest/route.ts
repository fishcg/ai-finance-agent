import { NextResponse } from "next/server";
import { getEmbeddings } from "@/lib/embeddings";
import { addDocuments } from "@/lib/chroma";
import { chunkText } from "@/lib/chunker";

export async function POST(req: Request) {
  const { text, source } = await req.json();

  if (!text || !source) {
    return NextResponse.json(
      { error: "text and source are required" },
      { status: 400 }
    );
  }

  const chunks = chunkText(text, source);
  const texts = chunks.map((c) => c.text);
  const embeddings = await getEmbeddings(texts);

  const ids = chunks.map(
    (c) => `${c.metadata.source}-${c.metadata.chunkIndex}`
  );
  const metadatas = chunks.map((c) => ({
    source: c.metadata.source,
    chunkIndex: String(c.metadata.chunkIndex),
  }));

  await addDocuments(ids, embeddings, texts, metadatas);

  return NextResponse.json({ success: true, chunks: chunks.length });
}
