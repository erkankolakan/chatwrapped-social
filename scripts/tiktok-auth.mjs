// TikTok yetkilendirmesi (bilgisayarda, terminalde bir kez çalıştırılır).
// Client Key ve Client Secret'ı terminalden sorar (ekranda görünmez), tarayıcıda TikTok izni ister,
// çıkan refresh token ile birlikte üç değeri doğrudan GitHub Secrets'a yazar.
// Kullanım: node scripts/tiktok-auth.mjs
import http from "node:http";
import crypto from "node:crypto";
import readline from "node:readline";
import { execFileSync } from "node:child_process";

const REPO = process.env.REPO || "erkankolakan/chatwrapped-social";
const REDIRECT = "https://erkankolakan.github.io/chatwrapped-social/tiktok-callback.html";
const SCOPES = "user.info.basic,video.publish,video.upload";
const PORT = 53682;

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); }; // yazılanı gizle
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer.trim()); });
  });
}

const clientKey = await ask("TikTok Client Key: ");
const clientSecret = await ask("TikTok Client Secret: ");
if (!clientKey || !clientSecret) { console.error("İkisi de gerekli."); process.exit(1); }

const state = crypto.randomBytes(16).toString("hex");
const url = "https://www.tiktok.com/v2/auth/authorize/?" + new URLSearchParams({
  client_key: clientKey, scope: SCOPES, response_type: "code", redirect_uri: REDIRECT, state,
});

const server = http.createServer(async (req, res) => {
  const params = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (params.get("error")) {
    res.end(`<h2>TikTok hata verdi: ${params.get("error")}</h2>`);
    console.error("TikTok hatası:", params.get("error"), params.get("error_description"));
    process.exit(1);
  }
  const code = params.get("code");
  if (!code || params.get("state") !== state) { res.end("Geçersiz istek"); return; }

  const tok = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: REDIRECT }),
  }).then((r) => r.json());
  if (!tok.refresh_token) {
    res.end("<h2>Token alınamadı, terminale bak.</h2>");
    console.error("Token alınamadı:", tok.error, tok.error_description);
    process.exit(1);
  }
  const me = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json());
  const user = me.data?.user || {};
  const missing = ["video.publish", "video.upload"].filter((s) => !String(tok.scope || "").includes(s));

  for (const [name, value] of [["TIKTOK_CLIENT_KEY", clientKey], ["TIKTOK_CLIENT_SECRET", clientSecret], ["TIKTOK_REFRESH_TOKEN", tok.refresh_token]]) {
    execFileSync("gh", ["secret", "set", name, "-R", REPO], { input: value });
    console.log(`✓ ${name} kaydedildi`);
  }
  console.log(`Hesap: ${user.display_name || "?"} (@${user.username || "?"})`);
  if (missing.length) console.warn(`UYARI: şu izinler verilmedi: ${missing.join(", ")}`);
  res.end(`<h2>Tamam! TikTok hesabı: @${user.username || user.display_name || "?"}</h2><p>Bu sekmeyi kapatabilirsin.</p>`);
  server.close();
  process.exit(0);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Tarayıcıda TikTok izin sayfası açılıyor. @chatwrapped.fun hesabıyla giriş yap ve izin ver.");
  execFileSync("open", [url]);
});
