// index.js
import express from "express";
import cors from "cors";
import multer from "multer";
import { supabaseAdmin } from "./supabase_client.js";
import { v4 as uuidv4 } from "uuid";

// --- App & Middleware
const upload = multer({ storage: multer.memoryStorage() });
const app = express();

// --- CORS: add your deployed frontend here
const allowedOrigins = [
  "https://google-drive-clone-frontend.vercel.app", // TODO: replace with your real Vercel URL
  "http://localhost:5173", // local dev
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);

app.use(express.json());

// --- Auth middleware
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing authorization header" });
  const token = auth.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Malformed authorization header" });

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = data.user;
    next();
  } catch (err) {
    console.error("Auth verify error:", err);
    return res.status(401).json({ error: "Auth error" });
  }
}

// --- Health
app.get("/", (req, res) => res.json({ ok: true, message: "Google Drive Clone backend is running 🚀" }));

// --- Signup
app.post("/api/auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const { data, error } = await supabaseAdmin.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user });
});

// --- Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ session: data.session });
});

// --- Forgot password (Supabase email)
app.post("/api/auth/forgot", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  // Where Supabase should send the user AFTER clicking the email link
  const redirectTo = (process.env.FRONTEND_URL || "http://localhost:5173") + "/reset";

  try {
    const { data, error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return res.status(400).json({ error: error.message });

    // Always respond the same (don’t reveal if the email exists)
    return res.json({ message: "If the email exists, a reset link has been sent." });
  } catch (e) {
    console.error("forgot error:", e);
    return res.status(500).json({ error: "Failed to start password reset" });
  }
});


// --- Create folder
app.post("/folders", requireAuth, async (req, res) => {
  const { name, parent_id } = req.body;
  if (!name) return res.status(400).json({ error: "Missing folder name" });

  const owner = req.user.id;
  const payload = { name, parent_id: parent_id || null, owner };

  const { data, error } = await supabaseAdmin.from("folders").insert(payload).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ folder: data });
});

// --- Rename folder
app.patch("/folders/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Missing name" });

  const { data: folder, error: fErr } = await supabaseAdmin.from("folders").select("*").eq("id", id).single();
  if (fErr || !folder) return res.status(404).json({ error: "Folder not found" });
  if (folder.owner !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin.from("folders")
    .update({ name, updated_at: new Date() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ folder: data });
});

// --- Move folder
app.patch("/folders/:id/move", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { parent_id } = req.body;
  const { data, error } = await supabaseAdmin
    .from("folders")
    .update({ parent_id: parent_id || null, updated_at: new Date() })
    .eq("id", id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ folder: data });
});

// --- Soft delete folder
app.delete("/folders/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { data: folder, error: fErr } = await supabaseAdmin.from("folders").select("*").eq("id", id).single();
  if (fErr || !folder) return res.status(404).json({ error: "Folder not found" });
  if (folder.owner !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin
    .from("folders")
    .update({ is_deleted: true, deleted_at: new Date(), updated_at: new Date() })
    .eq("id", id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from("files").update({ is_deleted: true, deleted_at: new Date() }).eq("folder_id", id);
  res.json({ folder: data });
});

// --- Upload file to "drive-files"
app.post("/files/upload", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });

  const owner = req.user.id;
  const { originalname, mimetype, buffer, size } = req.file;
  const folder_id = req.body.folder_id || null;

  const newId = uuidv4();
  const safeName = originalname.replace(/\s+/g, "_");
  const path = `user-${owner}/${newId}_${safeName}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from("drive-files")
    .upload(path, buffer, { contentType: mimetype, cacheControl: "3600", upsert: false });

  if (upErr) {
    console.error("Storage upload error:", upErr);
    return res.status(500).json({ error: upErr.message });
  }

  const payload = {
    id: newId,
    name: originalname,
    owner,
    folder_id,
    bucket_path: path,
    size,
    mime: mimetype
  };

  const { data, error } = await supabaseAdmin.from("files").insert(payload).select().single();
  if (error) {
    await supabaseAdmin.storage.from("drive-files").remove([path]);
    return res.status(500).json({ error: error.message });
  }

  res.json({ file: data });
});

// --- Rename file
app.patch("/files/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Missing name" });

  const { data: file, error: fErr } = await supabaseAdmin.from("files").select("*").eq("id", id).single();
  if (fErr || !file) return res.status(404).json({ error: "File not found" });
  if (file.owner !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin
    .from("files")
    .update({ name, updated_at: new Date() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ file: data });
});

// --- Move file
app.patch("/files/:id/move", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { folder_id } = req.body;
  const { data, error } = await supabaseAdmin
    .from("files")
    .update({ folder_id: folder_id || null, updated_at: new Date() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ file: data });
});

// --- Soft delete file
app.delete("/files/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { data: file, error: fErr } = await supabaseAdmin.from("files").select("*").eq("id", id).single();
  if (fErr || !file) return res.status(404).json({ error: "File not found" });
  if (file.owner !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin
    .from("files")
    .update({ is_deleted: true, deleted_at: new Date(), updated_at: new Date() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ file: data });
});

// --- List trash
app.get("/trash", requireAuth, async (req, res) => {
  const owner = req.user.id;
  const { data: files, error: fe } = await supabaseAdmin.from("files").select("*").eq("owner", owner).eq("is_deleted", true);
  const { data: folders, error: fo } = await supabaseAdmin.from("folders").select("*").eq("owner", owner).eq("is_deleted", true);
  if (fe || fo) return res.status(500).json({ error: "Error fetching trash" });
  res.json({ files, folders });
});

// --- Restore file
app.post("/restore/file/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { data: file, error: fErr } = await supabaseAdmin.from("files").select("*").eq("id", id).single();
  if (fErr || !file) return res.status(404).json({ error: "File not found" });
  if (file.owner !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin
    .from("files")
    .update({ is_deleted: false, deleted_at: null, updated_at: new Date() })
    .eq("id", id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ file: data });
});

// --- Restore folder
app.post("/restore/folder/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { data: folder, error: fErr } = await supabaseAdmin.from("folders").select("*").eq("id", id).single();
  if (fErr || !folder) return res.status(404).json({ error: "Folder not found" });
  if (folder.owner !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin
    .from("folders")
    .update({ is_deleted: false, deleted_at: null, updated_at: new Date() })
    .eq("id", id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin.from("files").update({ is_deleted: false, deleted_at: null }).eq("folder_id", id);
  res.json({ folder: data });
});

// --- Hard delete file
app.delete("/files/:id/hard", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { data: file, error: fErr } = await supabaseAdmin.from("files").select("*").eq("id", id).single();
  if (fErr || !file) return res.status(404).json({ error: "File not found" });
  if (file.owner !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const bucket = supabaseAdmin.storage.from("drive-files");
  const { error: rmErr } = await bucket.remove([file.bucket_path]);
  if (rmErr) console.warn("Warning: could not remove from storage:", rmErr.message);

  const { error } = await supabaseAdmin.from("files").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// --- Hard delete folder
app.delete("/folders/:id/hard", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { data: folder, error: fErr } = await supabaseAdmin.from("folders").select("*").eq("id", id).single();
  if (fErr || !folder) return res.status(404).json({ error: "Folder not found" });
  if (folder.owner !== req.user.id) return res.status(403).json({ error: "Forbidden" });

  const { data: files, error: fe } = await supabaseAdmin.from("files").select("*").eq("folder_id", id);
  if (fe) return res.status(500).json({ error: fe.message });

  const bucket = supabaseAdmin.storage.from("drive-files");
  for (const f of files) {
    try {
      await bucket.remove([f.bucket_path]);
    } catch (e) {
      console.warn("Failed to remove storage path", f.bucket_path, e.message || e);
    }
  }
  await supabaseAdmin.from("files").delete().eq("folder_id", id);

  const { error } = await supabaseAdmin.from("folders").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// --- Signed URL
app.get("/files/:id/download", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { data: file, error: fErr } = await supabaseAdmin.from("files").select("*").eq("id", id).single();
  if (fErr || !file) return res.status(404).json({ error: "File not found" });

  const bucket = supabaseAdmin.storage.from("drive-files");
  const { data, error } = await bucket.createSignedUrl(file.bucket_path, 60);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ url: data.signedUrl });
});

// --- List files
app.get("/folders/:id/files", requireAuth, async (req, res) => {
  const id = req.params.id === "root" ? null : req.params.id;
  const includeDeleted = req.query.includeDeleted === "true";
  let q = supabaseAdmin.from("files").select("*").eq("owner", req.user.id).order("created_at", { ascending: false });
  if (id) q = q.eq("folder_id", id);
  else q = q.is("folder_id", null);
  if (!includeDeleted) q = q.eq("is_deleted", false);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ files: data });
});

// --- List folders
app.get("/folders", requireAuth, async (req, res) => {
  const parent_id = req.query.parent_id || null;
  const includeDeleted = req.query.includeDeleted === "true";
  let q = supabaseAdmin.from("folders").select("*").eq("owner", req.user.id).order("created_at", { ascending: false });
  if (parent_id) q = q.eq("parent_id", parent_id);
  else q = q.is("parent_id", null);
  if (!includeDeleted) q = q.eq("is_deleted", false);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ folders: data });
});

// --- Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Google Drive Clone backend is running on :${PORT}`);
});
