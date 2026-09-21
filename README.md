# Lettre au Père Noël — PWA 100% locale

Application web progressive (PWA) pour gérer la liste de jouets d'un enfant et "l'envoyer au Père Noël". Toutes les données restent dans le navigateur (IndexedDB), aucune connexion réseau requise après premier chargement.

## Démarrage

Servir le dossier via un serveur statique local :

```
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000/` dans un navigateur moderne (Chrome, Edge, Safari, Firefox récents).

## Structure

```
liste-au-pere-noel/
├── index.html              # Point d'entrée
├── manifest.json           # Manifeste PWA
├── service-worker.js       # Cache offline
├── README.md
├── /icons/                 # icônes PWA (192, 512, favicon)
├── /css/                   # Variables, base, layout, components, animations, print
└── /js/
    ├── app.js              # Bootstrap router + SW registration
    ├── db.js               # Couche IndexedDB (profils, jouets)
    ├── router.js           # Routeur hash-based
    ├── /modules/           # Modules métier (profil, jouets, image, crop, etc.)
    └── /vendor/            # jsPDF + heic2any (local, pas de CDN)
```

## Fonctionnalités

- Profils enfants multiples (nom, date de naissance, avatar emoji)
- Liste de jouets par profil (photo + nom + magasin)
- Ajout une ou plusieurs photos d'un coup
- Conversion auto en WebP (max 800px, qualité 0.82)
- Support JPG / PNG / WebP / GIF / HEIC / HEIF (HEIC via lib vendorisée)
- Recadrage en forme libre (path fermé dessiné à la souris / tactile)
- Slider de sagesse (5 paliers)
- Animation "Envoi au Père Noël" (~8 s)
- Export PDF A4 (sans crop, letterbox automatique)
- Partage via `navigator.share` (mobile) ou téléchargement JPEG multi-pages (desktop)
- Double confirmation pour actions destructives
- PWA installable + offline complet après premier chargement

## Stockage

- `IndexedDB` (`lettre-pere-noel`)
  - `profils` : `{ id, nom, dateNaissance, avatar, sagesse, dateCreation }`
  - `jouets`  : `{ id, profilId, blobWebp, nomJouet, magasin, ordre, dateAjout, dateEnvoiPereNoel }`

## Limitations connues

- **HEIC** : supporté uniquement si la lib `heic2any` parvient à se charger. Sur certains navigateurs (notamment iOS Safari récents) `createImageBitmap` peut déjà décoder HEIC nativement ; la lib sert alors de fallback.
- **navigator.share avec fichiers** : disponible principalement sur Chrome Android, Edge, Safari iOS récent. Sur desktop, fallback en téléchargement direct de JPEGs.
- **Service Worker** : nécessite HTTPS ou `localhost` pour s'enregistrer.
- Pas de mode sombre, design Noël fixe.

## Licence des libs vendorisées

- jsPDF 2.5.1 — MIT (Parallax)
- heic2any 0.0.4 — Apache-2.0

Aucune dépendance CDN au runtime.