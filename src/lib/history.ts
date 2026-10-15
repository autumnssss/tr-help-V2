import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderLine } from '../core/hotplate';
import type { PastUpload, UploadHistory } from '../screens/Upload';

/** Saved prep-list uploads for one kitchen (newest first). */
export function uploadHistory(db: SupabaseClient, kitchenId: string): UploadHistory {
  return {
    async recent() {
      const { data, error } = await db.from('order_uploads').select('file_name, uploaded_at, lines')
        .eq('kitchen_id', kitchenId).order('uploaded_at', { ascending: false }).limit(10);
      if (error) throw new Error(error.message);
      return (data ?? []).map(u => ({ fileName: u.file_name, uploadedAt: u.uploaded_at, lines: u.lines as OrderLine[] }) satisfies PastUpload);
    },
    async save(fileName, lines) {
      const { error } = await db.from('order_uploads').insert({ kitchen_id: kitchenId, file_name: fileName, lines });
      if (error) throw new Error(error.message);
    },
  };
}
