// Instagram Graph API (Facebook Login ile). Görsel → feed gönderisi, video → Reels.
import { GRAPH, request, form, sleep } from "./http.mjs";

const { IG_USER_ID, META_PAGE_TOKEN } = process.env;

export const isConfigured = () => Boolean(IG_USER_ID && META_PAGE_TOKEN);
export const supports = () => true;

export async function check() {
  const { body } = await request(`${GRAPH}/${IG_USER_ID}?fields=username&access_token=${META_PAGE_TOKEN}`);
  const { body: limit } = await request(`${GRAPH}/${IG_USER_ID}/content_publishing_limit?fields=quota_usage,config&access_token=${META_PAGE_TOKEN}`);
  const l = limit.data?.[0];
  return `@${body.username} (24 saatte ${l?.quota_usage ?? "?"}/${l?.config?.quota_total ?? "?"} paylaşım kullanıldı)`;
}

export async function publish(post) {
  const params = { caption: post.captionFor("instagram"), access_token: META_PAGE_TOKEN };
  if (post.type === "video") Object.assign(params, { media_type: "REELS", video_url: post.url, share_to_feed: "true" });
  else params.image_url = post.url;

  const { body: container } = await request(`${GRAPH}/${IG_USER_ID}/media`, { method: "POST", body: form(params) });

  // Instagram dosyayı işleyene kadar bekle (video için birkaç dakika sürebilir)
  for (let i = 0; i < 60; i++) {
    const { body } = await request(`${GRAPH}/${container.id}?fields=status_code,status&access_token=${META_PAGE_TOKEN}`);
    if (body.status_code === "FINISHED") break;
    if (body.status_code === "ERROR" || body.status_code === "EXPIRED") throw new Error(`Instagram işleme hatası: ${body.status}`);
    await sleep(10_000);
  }

  const { body } = await request(`${GRAPH}/${IG_USER_ID}/media_publish`, {
    method: "POST",
    body: form({ creation_id: container.id, access_token: META_PAGE_TOKEN }),
  });
  return { id: body.id };
}
