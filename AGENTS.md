# AGENTS.md

High-signal guidance for OpenCode sessions in this repo.

## Dev Commands

```bash
# Backend (port 5000)
cd backend && npm run dev    # nodemon hot reload
cd backend && npm run migrate # run migrations

# Frontend (port 3000)
cd frontend && npm start
cd frontend && npm run build  # verify no warnings
```

## Key Constraints

- **Branch**: Currently on `dev-with-copilot` — most work happens here
- **Date format**: Always use `DD/MM/YYYY` via `formatters.js`, never `toLocaleDateString()`
- **CSS**: BEM naming only (`.task-card__title`, `.task-card__priority--high`)
- **Article codes**: Only `CI`, `CV`, `DI`, `DV`, `FC`, `FD`, `PL` prefixes valid (regex in `articleCode.js`)

## Important Code Locations

| Purpose | File |
|---------|------|
| FIFO stock allocation | `backend/src/services/stockAllocationService.js` |
| Task CRUD + import | `backend/src/controllers/taskController.js` |
| Role-based access | `backend/src/utils/taskScope.js` |
| JWT auth (hardened) | `backend/src/middleware/auth.js` |
| Real-time updates | SSE at `/api/events`, consumed in `useServerEvents` hook |
| Article validation | `backend/src/utils/articleCode.js` |
| OCR service (multi-pass Tesseract) | `backend/src/services/ocrService.js` |
| Smart parser (spatial + keyword + bbox) | `backend/src/services/smartParser.js` |
| Scan controller | `backend/src/controllers/scanController.js` |
| Scan page (React) | `frontend/src/pages/ScanPage.jsx` |

## Fixes Already Applied

These are already committed — don't revert:
- JWT secret now throws in production if missing (`auth.js`)
- File upload validation added (`taskRoutes.js`)
- Database indexes added (`migrations/013_add_performance_indexes.sql`)
- React error boundary added (`frontend/src/components/ErrorBoundary.js`)
- Stock history tracking implemented (`migrations/014_create_stock_history.sql`)
- Kanban category filtering added for article types (`KanbanBoard.js`)

## Quirks

- **Stock is global**: All clients compete for same article pool, not per-client
- **Workspaces auto-create**: Named `CMD DD-MM-YYYY` from order date
- **Notifications poll**: 30s interval in `Header.js` (SSE exists but not used for notifications)
- **Task history**: All changes logged via `TaskHistoryModel.log()`
- **Stock Deduplication**: Two-phase (exact row → aggregated by article)
- **Responsive Layouts**: Dashboard and Stock pages use flexible 2-column grids

## OCR / Scan System Architecture

### Pipeline Flow
1. `scanController.js` receives multipart image via `POST /api/scans/label`
2. `ocrService.js` runs multi-pass OCR:
   - Preprocesses image (grayscale, normalize, sharpen)
   - Runs 3 Tesseract passes in parallel: processed+PSM6, processed+PSM11, original+PSM6
   - Merges results, normalizes text, picks best pass
3. `smartParser.js` extracts fields using:
   - Keyword proximity scoring
   - Bbox-based spatial analysis
   - Serial number reconstruction (handles split digits like "25 16091328" → "2516091328")
   - Label-style fallback patterns for fragmented OCR
   - Numeric range validation (grammage 70-400, width 500-3000, weight 500-5000)

### Supported Suppliers
SAICA, SCA, DS Smith, Smurfit Westrock, Interpac, International Paper, Modern Karton, Norske Skog, Mondi, Hamburger, Prinzhorn, Eurokraft, Sotipapier, Arlanduo

### Extracted Fields
| Field | Validation | Notes |
|-------|-----------|-------|
| supplier | keyword match | Fuzzy match for SAICA (handles OCR noise: HIDROSAICA, S5ICA) |
| reel_serial_number | 8-14 digits | Longest plausible number wins; strips leading '1' if 11+ digits |
| grammage | 70-400 g/m² | Patterns: `g/m²`, `gsm`, `substance`, `basis weight` |
| width_mm | 500-3000 mm | Patterns: `mm`, `cm` (auto-converts), `laize`, `largeur` |
| weight_kg | 500-5000 kg | Patterns: `kg`, `poids`, `peso`, `weight` |
| bobine_place | manual only | User input required |

### Confidence System
- Fields with confidence < 0.7 show "Saisie manuelle nécessaire" placeholder
- Confidence scores 0-1 (frontend displays as percentage)
- Serial numbers get length boost (9-12 digits = highest confidence)

### Known OCR Challenges
- Barcodes can be read as serial numbers (long digit strings) — parser excludes by length/position
- Plastic reflections cause OCR noise on some labels
- Different suppliers need different preprocessing — multi-pass approach handles this
- Serial numbers sometimes split across OCR tokens — parser rejoins adjacent digit words

## Required Order

When modifying stock allocation logic:
1. Update `stockAllocationService.js`
2. Test with real data via frontend
3. Verify `recalculateStockAllocation()` recalculates correctly

When modifying OCR/parsing:
1. Test with multiple supplier images (SAICA, SCA, Modern Karton, etc.)
2. Verify serial number extraction handles 10-14 digit formats
3. Check confidence scores are reasonable (0.7+ threshold for auto-fill)

## Environment Setup

```bash
# Required: Create backend/.env from .env.example
# Key vars: DATABASE_URL, JWT_SECRET, SMTP_*
# BOOTSTRAP_ADMIN_* seeds first super_admin
```