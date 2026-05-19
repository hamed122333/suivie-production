# Service OCR Bobines — Guide

Service d'extraction des données d'étiquettes de bobines papier/carton.

**Architecture :** capture instantanée → extraction IA en arrière-plan → vérification.
L'extraction utilise l'**IA visuelle NVIDIA NIM** (gratuite). Un repli OCR local
(PaddleOCR) est optionnel.

---

## 1. Lancement en local (Windows / PowerShell)

```powershell
cd ocr-service

# Dépendances de base (légères)
pip install -r requirements.txt

# (Optionnel) repli OCR local — volumineux
pip install -r requirements-ocr.txt

# Configuration
copy .env.example .env
# → renseigner DATABASE_URL et NVIDIA_API_KEY dans .env

# Démarrage
python run.py
# → http://localhost:8000   |   Swagger: http://localhost:8000/docs
```

## 2. Variables d'environnement (`.env`)

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | PostgreSQL — **même base que le backend** (local ou Supabase) |
| `NVIDIA_API_KEY` | Clé gratuite — https://build.nvidia.com |
| `VISION_MODEL` | Modèle de vision (défaut : `mistralai/mistral-large-3-675b-instruct-2512`) |
| `FRONTEND_URL` | URL du frontend (CORS) — en prod : l'URL Vercel |
| `PORT` | Port d'écoute (défini automatiquement par Render) |

## 3. Déploiement sur Render

- **Type :** Web Service · **Root Directory :** `ocr-service`
- **Build Command :** `pip install -r requirements.txt`
- **Start Command :** `python run.py`
- **Variables d'environnement :** `DATABASE_URL` (Supabase), `NVIDIA_API_KEY`,
  `FRONTEND_URL` (URL Vercel), `ENVIRONMENT=production`

> La table `roll_scans` est créée/migrée automatiquement au démarrage.
> Le déploiement « léger » (vision-only) ne nécessite pas `requirements-ocr.txt`.

## 4. Garder le service actif (keep-alive — offre gratuite)

L'extraction est « pull » : elle se déclenche aux requêtes (`/health`,
`GET /api/rolls`, capture). Un service Render gratuit s'endort après 15 min
d'inactivité — pour que les bobines en attente s'extraient même app fermée :

1. Créer un moniteur gratuit sur **https://uptimerobot.com** (ou cron-job.org)
2. Type **HTTP(s)**, URL = `https://<ocr-service>.onrender.com/health`
3. Intervalle = **10 minutes**

Chaque ping réveille le service ET vide la file d'attente d'extraction.
Si le service s'endort en pleine extraction, la bobine concernée est
automatiquement reprise au réveil.

## 5. Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/api/rolls` | Capture (photo + emplacement) — réponse immédiate |
| `GET` | `/api/rolls` | Liste + statistiques |
| `GET` | `/api/rolls/{id}` | Détail + photo |
| `PUT` | `/api/rolls/{id}` | Correction + validation |
| `DELETE` | `/api/rolls/{id}` | Suppression |
| `GET` | `/health` | État du service |
