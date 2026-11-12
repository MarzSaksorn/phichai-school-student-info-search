# Private raw XLSX storage runbook

The raw import bucket is `directory-raw`. It must remain private and accept only XLSX uploads. The bucket-level limit is 10 MiB, while the schoolwide admin importer applies the stricter request limits of 3 MiB per workbook and 4 MiB total across exactly six workbooks (M.1–M.6). The application never calls `getPublicUrl` and never returns a signed URL from the admin upload workflow.

## One-time provisioning

Create or verify the bucket in the Supabase Dashboard under **Storage**:

- Bucket name: `directory-raw`
- Public bucket: disabled
- File size limit: `10485760` bytes
- Allowed MIME type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

Alternatively, run the server-only provisioning helper with a service-role key. Do not use `SUPABASE_ANON_KEY`, a publishable key, or a browser-exposed environment variable for bucket administration. The service-role key must remain in Vercel server-side environment variables or the worker secret store.

The code factory is [createSupabasePrivateObjectStore](../../apps/directory-worker/src/storage/createSupabasePrivateObjectStore.ts). It creates a client with session persistence disabled and wires the bucket into [SupabasePrivateObjectStore](../../apps/directory-worker/src/storage/supabasePrivateObjectStore.ts), which refuses to operate if the bucket is public.

## Upload behavior

The admin workflow performs role, six-grade manifest, academic-year, file-size, and source checks before any storage call. It parses and validates each XLSX container, writes every workbook to `raw-xlsx/<academic-year>/<job-id>/<file-id>.xlsx` with `upsert: false`, persists the complete `directory.source_files` manifest and checksums, and writes an upload audit event. If metadata persistence fails after upload, it attempts a compensating object deletion.

Raw files, object paths, checksums, and row-level source locations are administrator-only. Never expose them through a public API or client-side environment variable.
