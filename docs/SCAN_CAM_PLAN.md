# Plan : Module Scan Cam - Lecture Automatique de Numéro de Série

## Contexte & Objectif

Développer un module OCR/IA pour extraire automatiquement le **numéro de série** à partir d'images (upload ou caméra) afin de :
- Accélérer la saisie de données en atelier
- Réduire les erreurs de frappe manuelles
- Traçabilité complète des scans

---

## Architecture Générale

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ ScanUpload   │  │ ScanCamera   │  │ ScanHistory      │   │
│  │ (Phase 1)    │  │ (Phase 3)    │  │ (Phase 4)        │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                    │             │
│         ▼                 ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ScanService (client)                    │    │
│  │  - image preprocessing (contrast, crop)             │    │
│  │  - request to backend                               │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼────────────────────────────────────┘
                          │ HTTP/REST
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ OCR Engine   │  │ Validation   │  │ History API      │   │
│  │ (Tesseract)  │  │ Service      │  │ (CRUD)           │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                    │             │
│         ▼                 ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Database (PostgreSQL)                   │    │
│  │  - scans_logs                                       │    │
│  │  - serial_numbers                                  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack Technologique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| OCR Engine | **Tesseract.js** (côté serveur) | Open source, français supporté, pas de dépendances externes |
| Fallback OCR | **Google Cloud Vision API** | Si besoin précision maximale (optionnel) |
| Image Processing | **sharp** (backend) + **canvas** (frontend) | Redimensionnement, contraste, optimisation |
| Stockage Images | **Supabase Storage** | Images brutes stockées pour audit |
| Base de données | **PostgreSQL (existant)** | Table scans_logs + serial_numbers |
| WebSocket | **SSE (existant)** | Notifications temps réel |

---

## Phases de Développement

### PHASE 1 : Upload Image Simple (2-3 jours)

**Objectif** : Valider la précision OCR sur cas simples

#### Backend
```
POST /api/scan/upload
- Body: multipart/form-data (image file)
- Traitement:
  1. Sauvegarder image dans Supabase Storage
  2. OCR avec Tesseract.js (pré-processing: grayscale, contrast)
  3. Extraire numéro de série (regex pattern)
  4. Retourner { serial_number, confidence, image_url }
```

**Fichiers à créer** :
- `backend/src/services/ocrService.js` - Moteur OCR
- `backend/src/services/preProcessingService.js` - Image optimization
- `backend/src/controllers/scanController.js` - Endpoints REST
- `backend/src/routes/scanRoutes.js` - Router
- `backend/src/models/scanModel.js` - PostgreSQL operations
- `backend/migrations/015_create_scans_logs.sql` - Table logs

#### Frontend
```
Page: /scan
Composants:
- ScanUploadPage.js (upload drag & drop)
- ScanResultCard.js (affichage résultat)
```

**Fichiers à créer** :
- `frontend/src/pages/ScanUploadPage.js`
- `frontend/src/pages/ScanUploadPage.css`
- `frontend/src/components/scan/ScanDropZone.js`
- `frontend/src/components/scan/ScanResultCard.js`
- `frontend/src/components/scan/ScanPreview.js`
- `frontend/src/services/scanService.js`

#### Critères de validation
- [ ] Upload d'image fonctionnel
- [ ] OCR retourne un texte
- [ ] Numéro de série détecté > 80% des cas (images nettes)
- [ ] Sauvegarde en base de données

---

### PHASE 2 : Amélioration Détection (2-3 jours)

**Objectif** : Gérer les cas difficiles

#### Améliorations Backend
- **Multi-pass OCR** : Lancer plusieurs configurations (orientation, language)
- **Confidence scoring** : Ne garder que les résultats haute confiance
- **Pattern matching** : Regex adaptées aux formats de série du projet
- **Pre-processing avancé** :
  - Rotation auto (EXIF)
  - Deblur (convolution)
  - Threshold adaptatif
  - Crop intelligent (détection zone texte via contours)

#### Améliorations Frontend
- Indicateur qualité image (floue, sombre, oblique)
- Suggestion de re-capture
- Zoom sur zone détectée
- Mode comparison (avant/après traitement)

#### Critères de validation
- [ ] Images floues traitées correctement
- [ ] Angles jusqu'à 15° corrigés
- [ ] Texte non-série ignoré
- [ ] Confidence score affiché

---

### PHASE 3 : Caméra Temps Réel (2-3 jours)

**Objectif** : Capture instantanée multi-devices

#### Backend (inchangé ou micro-ajustements)
- Endpoint websocket optionnel pour streaming (Phase 4)

#### Frontend
```
Composants:
- CameraCapture.js (react-camera-pro ou getUserMedia)
- CameraOverlay.js (guide scan, détecteur mouvement)
- LivePreview.js (preview continue)
- BurstMode.js (multi-photos pour garantir 1 bonne)
```

**Fichiers à créer** :
- `frontend/src/components/scan/CameraCapture.js`
- `frontend/src/components/scan/CameraOverlay.js`
- `frontend/src/components/scan/LivePreview.js`

#### Stratégie Mobile
- Responsive camera view
- Bouton capture large (touch friendly)
- Vibration feedback (si supporté)
- Auto-focus sur zone détectée

#### Critères de validation
- [ ] Caméra fonctionnelle sur mobile/PC
- [ ] Capture instantanée < 500ms
- [ ] Preview temps réel
- [ ] Rotation automatique

---

### PHASE 4 : Historique & Validation (2-3 jours)

**Objectif** : Interface industrielle complète

#### Backend
- CRUD complet scans_logs
- Export CSV/Excel
- Statistiques (scans/jour, taux succès, pannes récurrentes)
- Batch processing (plusieurs images)

#### Frontend
```
Page: /scan/history
Composants:
- ScanHistoryTable.js (filtres, pagination)
- ScanDetailModal.js (image + résultat + correction)
- ScanStatsDashboard.js (graphs)
- ScanValidationPanel.js (correction manuelle)
```

**Fichiers à créer** :
- `frontend/src/pages/ScanHistoryPage.js`
- `frontend/src/pages/ScanHistoryPage.css`
- `frontend/src/components/scan/ScanHistoryTable.js`
- `frontend/src/components/scan/ScanStatsDashboard.js`
- `frontend/src/components/scan/ScanValidationPanel.js`

#### Table PostgreSQL (migration 015)
```sql
CREATE TABLE scans_logs (
  id SERIAL PRIMARY KEY,
  serial_number VARCHAR(255),
  confidence FLOAT,
  image_url TEXT,
  source VARCHAR(50), -- 'upload' | 'camera'
  status VARCHAR(50), -- 'pending' | 'validated' | 'corrected' | 'failed'
  validated_by INTEGER,
  corrected_serial VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  processing_time_ms INTEGER,
  metadata JSONB -- device info, GPS, etc.
);
```

#### Critères de validation
- [ ] Historique consultable
- [ ] Correction manuelle fonctionnelle
- [ ] Export CSV
- [ ] Dashboard stats

---

## Modèle de Données

### Table: scans_logs
| Colonne | Type | Description |
|---------|------|-------------|
| id | SERIAL | PK |
| serial_number | VARCHAR(255) | Numéro détecté |
| confidence | FLOAT | Score OCR (0-1) |
| image_url | TEXT | Chemin stockage |
| source | VARCHAR(50) | 'upload' ou 'camera' |
| status | VARCHAR(50) | pending/validated/corrected/failed |
| validated_by | INTEGER | FK users |
| corrected_serial | VARCHAR(255) | Correction si différente |
| created_at | TIMESTAMP | Date scan |
| processing_time_ms | INTEGER | Temps traitement |
| metadata | JSONB | Extra (device, GPS, etc.) |

### Table: serial_numbers (optionnel, Phase 4)
```sql
CREATE TABLE serial_numbers (
  id SERIAL PRIMARY KEY,
  serial VARCHAR(255) UNIQUE,
  first_seen_at TIMESTAMP,
  total_scans INTEGER,
  last_scan_at TIMESTAMP,
  is_valid BOOLEAN DEFAULT TRUE
);
```

---

## Schéma API REST

### Phase 1
```
POST   /api/scan/upload           # Upload image, retourne serial
GET    /api/scan/result/:id       # Récupérer résultat par ID
```

### Phase 4
```
GET    /api/scan/history          # Liste scans (pagination, filtres)
GET    /api/scan/stats            # Statistiques
PUT    /api/scan/:id/validate     # Valider scan
PUT    /api/scan/:id/correct      # Corriger numéro
DELETE /api/scan/:id              # Supprimer scan
GET    /api/scan/export           # Export CSV
POST   /api/scan/batch            # Batch upload
```

---

## Stratégie de Précision OCR

### Pattern Serial Number
```javascript
// Patterns typiques à détecter
const SERIAL_PATTERNS = [
  /^[A-Z]{2}\d{6,12}$/i,       // XX123456789
  /^\d{4}[A-Z]\d{4,8}$/i,      // 1234X567890
  /^[A-Z0-9]{8,20}$/i,         // Alphanumérique 8-20
  /^\d{3}[-\s]\d{3}[-\s]\d{3}/  // XXX-XXX-XXX
];
```

### Validation Croisée
1. OCR extrait tous les texte > 5 caractères
2. Match avec patterns + lookup base existante
3. Confidence score = (pattern_match * 0.6) + (db_lookup * 0.4)
4. Si confidence > 0.8 → automatique, sinon → validation humaine

---

## Sécurité & Performance

### Sécurité
- Validation type fichier (image only)
- Taille max 10MB
- Scan antivirus (optionnel)
- Rate limiting: 100 req/min

### Performance
- Tesseract worker pool (max 2 concurrent)
- Image compression avant OCR (max 2000px)
- Cache résultats (serial déjà scanné)
- CDN pour images statiques

---

## Dépendances npm (Backend)
```json
{
  "tesseract.js": "^5.0.0",
  "sharp": "^0.33.0",
  "@supabase/supabase-js": "^2.39.0",
  "multer": "^1.4.5",
  "uuid": "^9.0.0"
}
```

## Dépendances npm (Frontend)
```json
{
  "react-camera-pro": "^2.0.0",
  "exif-js": "^2.3.0"
}
```

---

## Planning Temporel Estimé

| Phase | Durée | Jalon |
|-------|-------|-------|
| Phase 1 | 2-3 jours | Upload + OCR fonctionnel |
| Phase 2 | 2-3 jours | Détection robuste |
| Phase 3 | 2-3 jours | Caméra temps réel |
| Phase 4 | 2-3 jours | Historique + validation |
| **TOTAL** | **8-12 jours** | Module industriel complet |

---

## Prochaines Étapes Immédiates

1. **Créer migration** : `015_create_scans_logs.sql`
2. **Créer modèle** : `backend/src/models/scanModel.js`
3. **Créer service OCR** : `backend/src/services/ocrService.js`
4. **Créer contrôleur** : `backend/src/controllers/scanController.js`
5. **Créer route** : `backend/src/routes/scanRoutes.js`
6. **Intégrer route** dans `server.js`
7. **Créer frontend** : `ScanUploadPage.js` + composants

---

## Questions en Suspens

1. **Format des numéros de série** : Avez-vous des exemples réels pour affiner les patterns regex ?
2. **Camera obligatoire ou upload suffisant** : Phase 3 prioritaire ou phase 1 only ?
3. **Base existante** : Des numéros de série sont-ils déjà en base pour validation croisée ?
4. **Thème visuel** : Intégration style existant ou nouveau design distinct ?