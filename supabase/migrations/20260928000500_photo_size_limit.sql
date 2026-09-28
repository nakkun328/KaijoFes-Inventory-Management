-- Keep uploads and image responses below Vercel Function's 4.5 MB payload
-- limit when the app is deployed there. 4 MiB leaves multipart overhead.
update storage.buckets
set file_size_limit = 4194304
where id = 'equipment-photos';
