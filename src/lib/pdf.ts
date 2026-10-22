// PDF → text items with positions, for the ticket reader. pdf.js loads only when a PDF is dropped.

import type { TextItem } from '../core/tickets';

export async function pdfTextItems(file: File): Promise<TextItem[]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const items: TextItem[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    for (const i of content.items) {
      if ('str' in i && i.str.trim()) items.push({ str: i.str, x: i.transform[4], y: i.transform[5], h: i.height, page });
    }
  }
  return items;
}
