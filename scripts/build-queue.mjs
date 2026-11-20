// ChatWrapped-Ads klasöründeki videolardan posts/ kuyruğunu oluşturur. Bilgisayarda çalıştırılır.
// Kullanım: node scripts/build-queue.mjs [~/Desktop/ChatWrapped-Ads]
// Var olan gönderilere dokunmaz; yalnızca kuyrukta olmayan kampanya+dil videolarını sona ekler.
// Sıra: 1. tur kampanyalar sırayla, dil dönüşümlü (tr, en, tr…); 2. tur her kampanyanın diğer dili.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADS = (process.argv[2] || path.join(os.homedir(), "Desktop/ChatWrapped-Ads")).replace(/^~/, os.homedir());
const POSTS = path.join(ROOT, "posts");
const captions = JSON.parse(fs.readFileSync(path.join(ROOT, "captions.json"), "utf8"));
const LANGS = { tr: "tr-TR", en: "en-US" };

// Mevsimlik videolar: bu tarihte (veya sonra ilk fırsatta) öne alınır
const DATES = {
  "C016-tr": "2026-12-01",
  "C023-tr": "2026-12-02",
  "C023-en": "2026-12-04",
  "C032-en": "2026-12-30",
  "C032-tr": "2026-12-31",
};

// Bir dil klasöründeki en son sürüm (v1-ltx gibi varyantlar hariç)
function latestVideo(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /_v\d+\.mp4$/.test(f));
  files.sort((a, b) => Number(a.match(/_v(\d+)\.mp4$/)[1]) - Number(b.match(/_v(\d+)\.mp4$/)[1]));
  return files.length ? path.join(dir, files.at(-1)) : null;
}

const campaigns = fs.readdirSync(path.join(ADS, "campaigns"))
  .filter((d) => /^C\d{3}_/.test(d))
  .sort()
  .map((d) => {
    const code = d.slice(0, 4);
    const videos = {};
    for (const [lang, folder] of Object.entries(LANGS)) {
      const v = latestVideo(path.join(ADS, "campaigns", d, folder));
      if (v) videos[lang] = v;
    }
    return { code, dir: d, videos };
  })
  .filter((c) => Object.keys(c.videos).length);

// Sırayı oluştur
const firstPass = [];
const secondPass = [];
let next = "tr";
for (const c of campaigns) {
  const langs = Object.keys(c.videos);
  const first = langs.includes(next) ? next : langs[0];
  firstPass.push({ c, lang: first });
  for (const l of langs) if (l !== first) secondPass.push({ c, lang: l });
  next = first === "tr" ? "en" : "tr";
}
const order = [...firstPass, ...secondPass];

// Kuyrukta zaten olanlar (klasör adı: 001-C003-tr)
fs.mkdirSync(POSTS, { recursive: true });
const existing = fs.readdirSync(POSTS).filter((d) => /^\d{3}-C\d{3}-(tr|en)$/.test(d));
const have = new Set(existing.map((d) => d.slice(4)));
let n = existing.reduce((m, d) => Math.max(m, Number(d.slice(0, 3))), 0);

let added = 0;
for (const { c, lang } of order) {
  const key = `${c.code}-${lang}`;
  if (have.has(key)) continue;
  const dir = path.join(POSTS, `${String(++n).padStart(3, "0")}-${key}`);
  fs.mkdirSync(dir);
  fs.copyFileSync(c.videos[lang], path.join(dir, "video.mp4"));
  const hook = captions[c.code]?.[lang] || (lang === "tr" ? "Sohbetlerinin gizli istatistikleri 👀" : "The hidden stats of your chats 👀");
  fs.writeFileSync(path.join(dir, "caption.txt"), `${hook}\n\n${captions._cta[lang]}\n\n${captions._tags[lang]}\n`);
  fs.writeFileSync(path.join(dir, "title.txt"), `${hook.split(/[.!?]/)[0].trim()}\n`);
  if (DATES[key]) fs.writeFileSync(path.join(dir, "post.json"), JSON.stringify({ date: DATES[key] }) + "\n");
  console.log(`+ ${path.basename(dir)}  ←  ${path.relative(ADS, c.videos[lang])}`);
  added++;
}
console.log(`${added} gönderi eklendi.`);
