# Plan : Module Scan Cam - Détection Code Bobine Papier

## Objectif
Extraire automatiquement les **codes bobine/lot** depuis des photos de rouleaux de papier (labels) pour inventaire.

---

## Format des Codes Detecter

| Type | Pattern | Exemple |
|------|---------|---------|
| Code numérique | `\d{6,12}` | `426856004`, `911152050267411096` |
| Code alphanumérique | `[A-Z0-9]{6,15}` | `GA25-1462`, `925071950503` |

---

## Architecture Simplifiee

```
[Upload Image] → [Backend OCR] → [Extract Codes] → [Display/Export CSV]
                    ↓
              [Save to DB]
```

---

## Phase 1 : Upload + OCR Simple (Priority)

### Backend
```
POST /api/scan/upload
- Input: multipart/form-data (image)
- Output: { codes: [], image_url, success: bool }
- Traitement:
  1. Sauvegarder image
  2. Tesseract.js OCR
  3. Extraire tous les nombres 6+ chiffres
  4. Retourner liste codes detectes
```

### Fichiers a creer

**Backend:**
- `backend/migrations/015_create_scan_inventory.sql`
- `backend/src/models/scanInventoryModel.js`
- `backend/src/services/ocrService.js`
- `backend/src/controllers/scanInventoryController.js`
- `backend/src/routes/scanInventoryRoutes.js`

**Frontend:**
- `frontend/src/pages/InventoryScanPage.js`
- `frontend/src/pages/InventoryScanPage.css`
- `frontend/src/components/scan/ImageDropZone.js`
- `frontend/src/components/scan/DetectedCodesList.js`
- `frontend/src/services/inventoryScanService.js`

---

## Schema BDD

```sql
CREATE TABLE scan_inventory (
  id SERIAL PRIMARY KEY,
  image_url TEXT,
  codes JSONB, -- ['426856004', 'GA25-1462', ...]
  scanned_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);
```

---

## API Endpoints

```
POST /api/scan/inventory/upload     - Upload + OCR
GET  /api/scan/inventory/history     - Historique scans
GET  /api/scan/inventory/export      - Export CSV
DELETE /api/scan/inventory/:id       - Supprimer scan
```

---

## Strategie OCR

1. **Pre-processing image:**
   - Convertir en niveaux de gris
   - Augmenter contraste
   - Redimensionner max 2000px

2. **Detection codes:**
   - Tesseract.js avec config: `--oem 3 --psm 6`
   - Extraire tous les patterns `\d{6,}` et `[A-Z]{2,}\d+[-]?\d*`
   - Filtrer les codes deja vus

3. **Confidence:**
   - Longueur code (plus long = plus fiable)
   - Repetition dans l'image (si code apparait 2x = confiance haute)

---

## Dependances

```bash
# Backend
cd backend && npm install tesseract.js uuid multer

# Frontend (deja present)
- react, axios
```

---

## Prochaines Etapes

1. [ ] Creer migration 015
2. [ ] Creer model scanInventoryModel.js
3. [ ] Creer service ocrService.js
4. [ ] Creer controller + routes
5. [ ] Integrer dans server.js
6. [ ] Creer frontend InventoryScanPage
7. [ ] Test avec vraies images

---

## Questions

1. **Un seul code par image ou plusieurs ?** (Dans l'exemple, 426856004 apparait 2 fois)
2. **Export automatique ou manuel ?**
3. **Validation necessaire ou automatique ?**