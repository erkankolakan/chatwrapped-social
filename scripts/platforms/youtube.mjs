// YouTube Shorts (YouTube Data API v3, OAuth refresh token ile). Sadece video.
import fs from "node:fs";
import { request, form } from "./http.mjs";

const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
const PRIVACY = process.env.YT_PRIVACY || "public";

export const isConfigured = () => Boolean(YT_CLIENT_ID && YT_CLIENT_SECRET && YT_REFRESH_TOKEN);
export const supports = (type) => type === "video";

export async function publish(post) {
  const { body: tok } = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: form({ client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET, refresh_token: YT_REFRESH_TOKEN, grant_type: "refresh_token" }),
  });

  const caption = post.captionFor("youtube");
  let title = post.title || caption.split("\n")[0] || "Chat Wrapped";
  if (!/#shorts/i.test(title)) title = `${title.slice(0, 90)} #Shorts`;
  const bytes = fs.readFileSync(post.file);

  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/*",
        "X-Upload-Content-Length": String(bytes.length),
      },
      body: JSON.stringify({
        snippet: { title: title.slice(0, 100), description: caption.slice(0, 5000), categoryId: "22" },
        status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false },
      }),
    },
  );
  if (!init.ok) throw new Error(`YouTube yükleme başlatılamadı: ${init.status} ${await init.text()}`);
  const uploadUrl = init.headers.get("location");

  const { body } = await request(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/*", "Content-Length": String(bytes.length) },
    body: bytes,
  });
  return { id: body.id, url: `https://youtube.com/shorts/${body.id}`, privacy: body.status?.privacyStatus };
}
