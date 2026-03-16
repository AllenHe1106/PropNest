import { http, HttpResponse } from 'msw';
import type { MockStore } from '../../store';
import { faker } from '@faker-js/faker';

export function createStorageHandlers(supabaseUrl: string, store: MockStore) {
  return [
    // Upload file
    http.post(`${supabaseUrl}/storage/v1/object/:bucket/*`, async ({ request, params }) => {
      const bucket = params.bucket as string;
      const splatParts = params['*'];
      const path = Array.isArray(splatParts) ? splatParts.join('/') : (splatParts as string);

      const contentType = request.headers.get('content-type') || 'application/octet-stream';
      const data = await request.text();

      const key = `${bucket}:${path}`;
      store.uploads.set(key, {
        bucket,
        path,
        mime_type: contentType,
        data,
        created_at: new Date().toISOString(),
      });

      return HttpResponse.json({ Key: `${bucket}/${path}` });
    }),

    // Download file
    http.get(`${supabaseUrl}/storage/v1/object/:bucket/*`, ({ params }) => {
      const bucket = params.bucket as string;
      const splatParts = params['*'];
      const path = Array.isArray(splatParts) ? splatParts.join('/') : (splatParts as string);
      const key = `${bucket}:${path}`;

      const upload = store.uploads.get(key);
      if (!upload) {
        // Return a 1x1 transparent PNG placeholder
        const placeholder = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
          0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
          0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
          0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
          0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
          0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ]);
        return new HttpResponse(placeholder, {
          headers: { 'content-type': 'image/png' },
        });
      }

      return new HttpResponse(upload.data, {
        headers: { 'content-type': upload.mime_type },
      });
    }),

    // Create signed URL
    http.post(`${supabaseUrl}/storage/v1/object/sign/:bucket/*`, ({ params }) => {
      const bucket = params.bucket as string;
      const splatParts = params['*'];
      const path = Array.isArray(splatParts) ? splatParts.join('/') : (splatParts as string);
      const token = faker.string.alphanumeric(64);

      return HttpResponse.json({
        signedURL: `${supabaseUrl}/storage/v1/object/sign/${bucket}/${path}?token=${token}`,
      });
    }),

    // Delete file
    http.delete(`${supabaseUrl}/storage/v1/object/:bucket/*`, ({ params }) => {
      const bucket = params.bucket as string;
      const splatParts = params['*'];
      const path = Array.isArray(splatParts) ? splatParts.join('/') : (splatParts as string);
      const key = `${bucket}:${path}`;
      store.uploads.delete(key);

      return HttpResponse.json({ message: 'Successfully deleted' });
    }),

    // List files in bucket
    http.post(`${supabaseUrl}/storage/v1/object/list/:bucket`, async ({ params, request }) => {
      const bucket = params.bucket as string;
      const body = (await request.json()) as { prefix?: string; limit?: number; offset?: number };
      const prefix = body.prefix || '';

      const files = Array.from(store.uploads.values())
        .filter((u) => u.bucket === bucket && u.path.startsWith(prefix))
        .map((u) => ({
          name: u.path.replace(prefix, ''),
          id: faker.string.uuid(),
          created_at: u.created_at,
          updated_at: u.created_at,
          metadata: { mimetype: u.mime_type },
        }));

      return HttpResponse.json(files);
    }),
  ];
}
