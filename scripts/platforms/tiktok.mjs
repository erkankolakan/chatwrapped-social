// TikTok Content Posting API (Direct Post, dosya yükleme). Sadece video.
// Not: TikTok uygulaman denetimden (audit) geçene kadar gönderiler sadece "SELF_ONLY" (gizli) olabilir.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { request, form, sleep } from "./http.mjs";

const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN } = process.env;
const API = "https://open.tiktokapis.com/v2";

export const isConfigured = () => Boolean(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET && TIKTOK_REFRESH_TOKEN);
export const supports = (type) => type === "video";

async function accessToken() {
  const { body } = await request(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: TIKTOK_REFRESH_TOKEN }),
  });
  if (!body.access_token) throw new Error(`TikTok token alınamadı: ${JSON.stringify(body)}`);
  // TikTok refresh token'ı yenilerse GitHub Secret'ı güncelle (GH_PAT tanımlıysa)
  if (body.refresh_token && body.refresh_token !== TIKTOK_REFRESH_TOKEN) {
    if (process.env.GH_PAT && process.env.GITHUB_REPOSITORY) {
      execFileSync("gh", ["secret", "set", "TIKTOK_REFRESH_TOKEN", "--repo", process.env.GITHUB_REPOSITORY, "--body", body.refresh_token], {
        env: { ...process.env, GH_TOKEN: process.env.GH_PAT },
      });
      console.log("TikTok refresh token yenilendi ve kaydedildi.");
    } else {
      console.warn("UYARI: TikTok yeni refresh token verdi ama GH_PAT yok; eski token bir süre sonra geçersiz olabilir.");
    }
  }
  return body.access_token;
}

export async function check() {
  const token = await accessToken();
  const { body } = await request(`${API}/user/info/?fields=display_name`, { headers: { Authorization: `Bearer ${token}` } });
  return `hesap "${body.data?.user?.display_name}"`;
}

export async function publish(post) {
  const token = await accessToken();
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" };

  // "inbox": video TikTok uygulamasına taslak olarak düşer, kullanıcı tek dokunuşla yayınlar (denetim gerekmez).
  // "direct": doğrudan yayın (TikTok denetimi onaylandıktan sonra TIKTOK_MODE=direct yap).
  const mode = process.env.TIKTOK_MODE || "inbox";
  let privacy = null;
  if (mode === "direct") {
    const { body: info } = await request(`${API}/post/publish/creator_info/query/`, { method: "POST", headers: auth });
    const options = info.data?.privacy_level_options || [];
    const wanted = process.env.TIKTOK_PRIVACY || "SELF_ONLY";
    privacy = options.includes(wanted) ? wanted : "SELF_ONLY";
  }

  const bytes = fs.readFileSync(post.file);
  const size = bytes.length;
  const MB = 1024 * 1024;
  const chunkSize = size <= 64 * MB ? size : 10 * MB;
  const chunkCount = size <= 64 * MB ? 1 : Math.floor(size / chunkSize);

  const source_info = { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: chunkCount };
  const { body: init } = mode === "direct"
    ? await request(`${API}/post/publish/video/init/`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          post_info: { title: post.captionFor("tiktok").slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
          source_info,
        }),
      })
    : await request(`${API}/post/publish/inbox/video/init/`, { method: "POST", headers: auth, body: JSON.stringify({ source_info }) });
  const { publish_id, upload_url } = init.data;

  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = i === chunkCount - 1 ? size : start + chunkSize; // son parça kalanı da alır
    const res = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${size}` },
      body: bytes.subarray(start, end),
    });
    if (!res.ok) throw new Error(`TikTok parça yükleme hatası: ${res.status} ${await res.text()}`);
  }

  for (let i = 0; i < 60; i++) {
    const { body } = await request(`${API}/post/publish/status/fetch/`, { method: "POST", headers: auth, body: JSON.stringify({ publish_id }) });
    const status = body.data?.status;
    if (status === "PUBLISH_COMPLETE") return { publish_id, mode, privacy };
    if (status === "SEND_TO_USER_INBOX") return { publish_id, mode, note: "TikTok uygulamasında taslak olarak bekliyor" };
    if (status === "FAILED") throw new Error(`TikTok yayın hatası: ${body.data?.fail_reason}`);
    await sleep(10_000);
  }
  return { publish_id, mode, note: "işleniyor" };
}
