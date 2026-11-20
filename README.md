# Chat Wrapped: otomatik sosyal medya paylaşımı

Her gün **20:00'de (Türkiye saati)** GitHub Actions `posts/` klasöründeki sıradaki gönderiyi
Instagram, Facebook Sayfası, TikTok ve YouTube Shorts'a paylaşır. Bilgisayarın açık olması gerekmez, ücretsizdir.

## İçerik ekleme

Her gönderi `posts/` altında bir klasördür. Klasörler isim sırasıyla paylaşılır (`001`, `002`, …).

```
posts/
  001/
    video.mp4        ← video (dikey 9:16, 3 dk'dan kısa) → 4 platformun hepsi
    caption.txt      ← açıklama + hashtag'ler
  002/
    gorsel.jpg       ← görsel (sadece JPG) → Instagram + Facebook
    caption.txt
```

İsteğe bağlı dosyalar:

| Dosya | Ne işe yarar |
|---|---|
| `title.txt` | YouTube başlığı (yoksa açıklamanın ilk satırı kullanılır) |
| `caption.instagram.txt`, `caption.tiktok.txt`, `caption.youtube.txt`, `caption.facebook.txt` | O platforma özel açıklama |
| `post.json` | `{"date": "2026-12-01"}` → bu tarihten önce paylaşma · `{"platforms": ["instagram"]}` → sadece bu platformlar |

`_` ile başlayan klasörler (örn. `_ornek`) atlanır.

Gönderi ekledikten sonra commit + push yeterli. GitHub web sitesinden "Add file → Upload files" ile de eklenebilir.

## Kontrol

- **Actions** sekmesi → "Günlük paylaşım": her çalışmanın kaydı. Hata olursa GitHub e-posta gönderir.
- `state.json`: hangi gönderi hangi platformda ne zaman paylaşıldı.
- Elle çalıştırmak için: Actions → Günlük paylaşım → **Run workflow** (belirli gönderi/platform ve deneme modu seçilebilir).

## Gerekli anahtarlar (Settings → Secrets and variables → Actions)

| Secret | Platform |
|---|---|
| `META_PAGE_TOKEN` | Instagram + Facebook (süresiz sayfa token'ı) |
| `IG_USER_ID` | Instagram iş hesabı ID'si |
| `FB_PAGE_ID` | Facebook sayfa ID'si |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN` | TikTok |
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` | YouTube |
| `GH_PAT` (isteğe bağlı) | TikTok refresh token'ı yenilendiğinde secret'ı otomatik günceller |

Anahtarı olmayan platform atlanır, yani platformları tek tek açabilirsin.

Değişkenler (Variables): `TIKTOK_PRIVACY` (`PUBLIC_TO_EVERYONE`, TikTok denetiminden sonra) · `YT_PRIVACY` (`public` varsayılan).

## TikTok modu

- Şu an `inbox` (taslak) modunda: video her gün TikTok uygulamasına bildirimle düşer, uygulamadan tek dokunuşla yayınlanır.
- TikTok uygulama denetimi onaylanınca: production Client Key/Secret ile `node scripts/tiktok-auth.mjs` tekrar çalıştırılır ve
  repo Variables'a `TIKTOK_MODE=direct`, `TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE` eklenir → tam otomatik.
