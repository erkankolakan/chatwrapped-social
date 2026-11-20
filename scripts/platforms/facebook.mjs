// Facebook Sayfası. Görsel → fotoğraf gönderisi, video → sayfa videosu.
import { GRAPH, request, form } from "./http.mjs";

const { FB_PAGE_ID, META_PAGE_TOKEN } = process.env;

export const isConfigured = () => Boolean(FB_PAGE_ID && META_PAGE_TOKEN);
export const supports = () => true;

export async function check() {
  const { body } = await request(`${GRAPH}/${FB_PAGE_ID}?fields=name&access_token=${META_PAGE_TOKEN}`);
  return `sayfa "${body.name}"`;
}

export async function publish(post) {
  const text = post.captionFor("facebook");
  const { body } = post.type === "video"
    ? await request(`${GRAPH}/${FB_PAGE_ID}/videos`, {
        method: "POST",
        body: form({ file_url: post.url, description: text, access_token: META_PAGE_TOKEN }),
      })
    : await request(`${GRAPH}/${FB_PAGE_ID}/photos`, {
        method: "POST",
        body: form({ url: post.url, message: text, access_token: META_PAGE_TOKEN }),
      });
  return { id: body.post_id || body.id };
}
