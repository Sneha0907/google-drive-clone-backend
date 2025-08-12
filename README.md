# Google Drive Clone - Backend (Supabase)

## Setup

1. Copy this repo to `server/`.
2. `npm install`
3. Create a Supabase project:
   - Create a Storage bucket named `uploads` (public or private as you prefer).
   - Run the SQL in the README to create `files` and `folders` tables.
4. Provide keys:
   - Create `config.json` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` OR set env vars:
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
5. Start server: `npm run dev` (requires nodemon) or `npm start`.

## Important Endpoints
- `POST /folders` create folder
- `PATCH /folders/:id` rename
- `PATCH /folders/:id/move` move
- `DELETE /folders/:id` soft delete
- `DELETE /folders/:id/hard` hard delete folder + its files
- `POST /files/upload` multipart form-data (file, folder_id)
- `PATCH /files/:id` rename file
- `PATCH /files/:id/move` move file
- `DELETE /files/:id` soft delete file
- `DELETE /files/:id/hard` permanently delete file
- `GET /trash` list deleted
- `POST /restore/file/:id` restore file
- `POST /restore/folder/:id` restore folder
- `GET /files/:id/download` get signed URL

All protected routes require header: `Authorization: Bearer <access_token>` (token from Supabase client after login).

