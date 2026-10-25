# Lipeno – Ma liste au Père Noël

Application PWA (HTML / CSS / JS), 100 % hors ligne une fois installée, pour Android et iPhone.

## Icônes

Les icônes sont dans le dossier `icons/`, avec exactement ces noms :

| Fichier | Taille | Usage |
|---|---|---|
| `icons/icon-192.png` | 192 × 192 | Android, favicon |
| `icons/icon-512.png` | 512 × 512 | Android (écran de démarrage, icône adaptative) |
| `icons/apple-touch-icon.png` | 180 × 180 | iPhone / iPad (fond opaque, sans transparence) |

Pour l'icône adaptative Android (`maskable`), gardez le motif principal dans le cercle central (environ 80 % de la largeur).

## Mise en ligne

Une PWA doit être servie en **HTTPS** (GitHub Pages, Netlify, Cloudflare Pages, OVH…). Copiez simplement tout le dossier tel quel, il peut être placé dans un sous-dossier.

Après une mise à jour des fichiers, changez `VERSION` en haut de `sw.js` pour que les téléphones récupèrent la nouvelle version.

## Contenu

- `index.html`, `css/app.css`, `js/app.js` : l'application
- `js/sync.js` : synchronisation entre appareils (chargée seulement quand on l'ouvre)
- `sw.js` : service worker (cache hors ligne)
- `manifest.webmanifest` : installation sur l'écran d'accueil
- `fonts/` : polices embarquées (Nunito, Fredoka, Mountains of Christmas, Cinzel Decorative – licence SIL OFL)
- `lib/heic2any.min.js` : lecture des photos HEIC/HEIF sur Android (MIT), chargé seulement si besoin
- `lib/webp/` : encodeur WebP pour iPhone, car Safari ne sait pas créer de WebP nativement (Apache 2.0), chargé seulement si besoin
- `lib/qr/qrcode.mjs` : création des QR codes de synchronisation (MIT, Kazuhiko Arase)
- `lib/qr/jsQR.js` : lecture des QR codes avec la caméra (Apache 2.0)

Les données (profils, photos) sont stockées dans IndexedDB, uniquement sur l'appareil.

## Synchronisation

Paramètres → Synchroniser mes appareils. Aucun serveur : les deux appareils s'échangent leurs coordonnées par un double scan de QR code, puis communiquent directement par le Wi-Fi (WebRTC, chiffré). Les listes sont fusionnées dans les deux sens (ajouts, modifications, suppressions). En secours, un fichier de synchronisation peut être envoyé par WhatsApp, mail, etc.
