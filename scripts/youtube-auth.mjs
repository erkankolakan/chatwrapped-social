// YouTube yetkilendirmesi (bilgisayarda bir kez çalıştırılır).
// Google Cloud'dan indirilen OAuth istemci JSON'unu okur, tarayıcıda Google izni ister,
// çıkan refresh token ile birlikte YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN'ı
// doğrudan GitHub Secrets'a yazar. Değerler ekrana yazılmaz.
// Kullanım: node scripts/youtube-auth.mjs ~/Downloads/client_secret_XXXX.json
import fs from "node:fs";
import http from "node:http";
import { execFileSync } from "node:child_process";

const file = process.argv[2];
if (!file) { console.error("Kullanım: node scripts/youtube-auth.mjs <client_secret.json>"); process.exit(1); }
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const { client_id, client_secret } = json.installed || json.web || {};
if (!client_id) { console.error("JSON'da client_id bulunamadı"); process.exit(1); }
const REPO = process.env.REPO || "erkankolakan/chatwrapped-social";
const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

const server = http.createServer();
server.listen(0, "127.0.0.1", () => {
  const redirect = `http://127.0.0.1:${server.address().port}`;
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id, redirect_uri: redirect, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent",
  });
  console.log("Tarayıcıda Google izin sayfası açılıyor. @chatwrappedfun kanalının hesabıyla giriş yap ve izin ver.");
  execFileSync("open", [url]);

  server.on("request", async (req, res) => {
    const code = new URL(req.url, redirect).searchParams.get("code");
    if (!code) { res.end("Kod yok"); return; }
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ code, client_id, client_secret, redirect_uri: redirect, grant_type: "authorization_code" }),
    }).then((r) => r.json());
    if (!tok.refresh_token) {
      res.end("Hata: refresh token alinamadi. Terminale bak.");
      console.error("Refresh token alınamadı:", tok.error, tok.error_description);
      process.exit(1);
    }
    const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then((r) => r.json());
    const channel = ch.items?.[0]?.snippet?.title || "(kanal bulunamadı)";
    for (const [name, value] of [["YT_CLIENT_ID", client_id], ["YT_CLIENT_SECRET", client_secret], ["YT_REFRESH_TOKEN", tok.refresh_token]]) {
      execFileSync("gh", ["secret", "set", name, "-R", REPO], { input: value });
      console.log(`✓ ${name} kaydedildi`);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<h2>Tamam! YouTube kanalı: ${channel}</h2><p>Bu sekmeyi kapatabilirsin.</p>`);
    console.log(`Kanal: ${channel}`);
    fs.unlinkSync(file);
    console.log("İstemci JSON dosyası silindi.");
    server.close();
    process.exit(0);
  });
});
