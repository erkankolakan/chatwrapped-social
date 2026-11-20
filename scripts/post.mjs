// Günlük paylaşım betiği: posts/ içindeki sıradaki gönderiyi yapılandırılmış platformlara gönderir.
// Kullanım: node scripts/post.mjs [--post 003] [--platforms instagram,facebook] [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as instagram from "./platforms/instagram.mjs";
import * as facebook from "./platforms/facebook.mjs";
import * as tiktok from "./platforms/tiktok.mjs";
import * as youtube from "./platforms/youtube.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = path.join(ROOT, "posts");
const STATE_FILE = path.join(ROOT, "state.json");
const PLATFORMS = { instagram, facebook, tiktok, youtube };

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run") || process.env.DRY_RUN === "true";
const forcedPost = arg("post") || process.env.FORCE_POST || "";
const forcedPlatforms = (arg("platforms") || process.env.FORCE_PLATFORMS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Türkiye tarihine göre bugün (YYYY-MM-DD)
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

function readText(dir, name) {
  const p = path.join(dir, name);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : null;
}

function loadPost(id) {
  const dir = path.join(POSTS_DIR, id);
  const files = fs.readdirSync(dir);
  const video = files.find((f) => /\.(mp4|mov)$/i.test(f));
  const image = files.find((f) => /\.(jpe?g)$/i.test(f));
  const media = video || image;
  if (!media) throw new Error(`posts/${id}: görsel (.jpg) veya video (.mp4) bulunamadı`);
  const config = JSON.parse(readText(dir, "post.json") || "{}");
  const caption = readText(dir, "caption.txt") || "";
  return {
    id,
    dir,
    type: video ? "video" : "image",
    file: path.join(dir, media),
    // GitHub Pages üzerinden herkese açık adres (Instagram/Facebook dosyayı buradan çeker)
    url: `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "")}/posts/${id}/${encodeURIComponent(media)}`,
    date: config.date || null,
    platforms: config.platforms || null,
    title: readText(dir, "title.txt"),
    caption,
    captionFor: (platform) => readText(dir, `caption.${platform}.txt`) ?? caption,
  };
}

// Bağlantı kontrolü: hiçbir şey paylaşmadan anahtarların çalıştığını doğrular
if (args.includes("--check") || process.env.CHECK === "true") {
  let bad = 0;
  for (const [name, mod] of Object.entries(PLATFORMS)) {
    if (!mod.isConfigured()) { console.log(`- ${name}: anahtar yok`); continue; }
    if (!mod.check) { console.log(`- ${name}: kontrol yok`); continue; }
    try { console.log(`✓ ${name}: ${await mod.check()}`); }
    catch (err) { bad++; console.error(`✗ ${name}: ${err.message}`); }
  }
  process.exit(bad ? 1 : 0);
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");

const postIds = fs.readdirSync(POSTS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .sort();

let post;
if (forcedPost) {
  if (!postIds.includes(forcedPost)) throw new Error(`posts/${forcedPost} yok`);
  post = loadPost(forcedPost);
} else {
  const pending = postIds.filter((id) => !state.published[id]).map(loadPost);
  // Önce tarihi gelmiş mevsimlik gönderiler (en eski tarih önce), sonra sıradaki tarihsiz gönderi
  post = pending.filter((p) => p.date && p.date <= today).sort((a, b) => a.date.localeCompare(b.date))[0]
    || pending.find((p) => !p.date);
}

if (!post) {
  console.log(`Paylaşılacak yeni gönderi yok (${today}). posts/ klasörüne içerik ekle.`);
  process.exit(0);
}

const targets = Object.entries(PLATFORMS).filter(([name, mod]) => {
  if (forcedPlatforms.length && !forcedPlatforms.includes(name)) return false;
  if (post.platforms && !post.platforms.includes(name)) return false;
  if (!mod.isConfigured()) {
    console.log(`- ${name}: anahtarlar tanımlı değil, atlandı`);
    return false;
  }
  if (!mod.supports(post.type)) {
    console.log(`- ${name}: ${post.type} desteklemiyor, atlandı`);
    return false;
  }
  return true;
});

console.log(`Gönderi posts/${post.id} (${post.type}) → ${targets.map(([n]) => n).join(", ") || "hiçbiri"}`);
if (!targets.length) {
  console.log("Paylaşılabilecek platform yok; gönderi sırada bekliyor.");
  process.exit(0);
}
if (dryRun) {
  console.log("Deneme modu: hiçbir şey paylaşılmadı.");
  process.exit(0);
}

const record = (state.published[post.id] ||= {});
let failed = 0;
for (const [name, mod] of targets) {
  if (record[name]?.ok && !forcedPost) continue;
  try {
    const result = await mod.publish(post);
    record[name] = { ok: true, at: new Date().toISOString(), ...result };
    console.log(`✓ ${name}: ${JSON.stringify(result)}`);
  } catch (err) {
    failed++;
    record[name] = { ok: false, at: new Date().toISOString(), error: String(err.message || err).slice(0, 500) };
    console.error(`✗ ${name}: ${err.message || err}`);
  }
  saveState();
}
saveState();

if (failed) {
  console.error(`${failed} platformda hata oldu. Actions sekmesinden "Run workflow" ile tekrar deneyebilirsin.`);
  process.exit(1);
}
