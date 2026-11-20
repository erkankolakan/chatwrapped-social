export const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || "v24.0"}`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// JSON döndüren istek; hata varsa anlaşılır mesajla fırlatır
export async function request(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok || body?.error?.code && body.error.code !== "ok") {
    const msg = body?.error?.message || body?.error_description || JSON.stringify(body?.error || body);
    throw new Error(`${res.status} ${url.split("?")[0]}: ${msg}`);
  }
  return { body, headers: res.headers };
}

export const form = (obj) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
