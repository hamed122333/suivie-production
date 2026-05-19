# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Suivi Production** is a full-stack factory task tracking system for production management. It features:
- Kanban boards, stock management, multi-workspace support, role-based access control
- Bidirectional notifications between planners and commercials
- **OCR industrial scanning** for automatic label extraction from paper/cardboard reels (95%+ accuracy, local processing)

## Commands

### Docker (recommended)
```bash
docker compose -f docker-compose.dev.yml up --build      # Dev (hot reload, seed data)
docker compose -f docker-compose.prod.yml up -d --build   # Production (Nginx reverse proxy)
```

### Backend (`/backend`)
```bash
npm run dev        # Start with nodemon (port 5000)
npm start          # Production server
npm run migrate    # Run database migrations/setup
```

### Frontend (`/frontend`)
```bash
npm start          # Dev server (port 3000)
npm run build      # Production build (verify no warnings)
npm test           # Run tests
```

### OCR Service (`/ocr-service`) — Python FastAPI
```bash
cd ocr-service
python -m venv venv && source venv/bin/activate   # Create virtualenv
pip install -r requirements.txt                    # Install deps (first time ~2min)
cp .env.example .env                               # Configure Supabase credentials
python run.py                                      # Start on port 8000

# Test endpoint directly
curl -X POST http://localhost:8000/api/scan-roll -F "file=@label.jpg"
# Swagger UI: http://localhost:8000/docs
```

## Architecture

### Stack
- **Frontend:** React 18, React Router, Axios, Vanilla CSS (BEM naming)
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL 15+ (pool in `backend/src/config/db.js`, IPv4-optimized for Supabase)
- **Auth:** JWT (24h tokens), bcryptjs
- **OCR:** PaddleOCR v3, Sharp, OpenCV4Node (image preprocessing + label scanning)

### Backend (`backend/src/`)
- `server.js` — Entry point; starts express + schedules daily auto-promotion `WAITING_STOCK → TODO`
- `app.js` — Express setup: CORS, rate limits (200 req/15min general, 20 req/15min auth), route mounting
- `routes/` — Express routers: auth, tasks, users, dashboard, workspaces, stock-import, notifications, **scanRoutes** (OCR)
- `controllers/` — Business logic layer, one file per domain; `scanController.js` orchestrates OCR pipeline
- `models/` — Direct PostgreSQL queries (no ORM), one file per domain
- `middleware/auth.js` — JWT verification + role-based access via `requireRoles()`
- `services/`
  - `stockAllocationService.js` — FIFO stock allocation algorithm
  - `emailService.js` — Nodemailer for password reset
  - **`ocrPipeline.js`** — Orchestrates complete OCR flow (preprocessing → detection → parsing → scoring)
  - **`imagePreprocessor.js`** — Grayscale, sharpen, contrast, denoise, perspective correction, upscaling
  - **`paddleOcrService.js`** — PaddleOCR v3 with bbox + confidence output
  - **`supplierDetector.js`** — Detects supplier from keywords (SCA, DS Smith, Smurfit, etc.)
  - **`fieldExtractor.js`** — Spatial extraction (horizontal/vertical search near labels, proximity-based)
  - **`confidenceScorer.js`** — Validates field formats, scores 0-100 per field
- `parsers/` — **[NEW]** Supplier-specific parsing (rules for SCA, DS Smith, Smurfit, Interpac, etc.)
  - `baseParser.js` — Abstract parser with common logic
  - `scaParser.js`, `dsSmithParser.js`, `smurfitParser.js`, etc. — Supplier-specific field mapping
- `config/`
  - **`supplierMappings.js`** — Fournisseur keywords + field extraction rules per supplier
  - **`ocrConfig.js`** — PaddleOCR initialization + preprocessing defaults
- `constants/task.js` — Single source of truth for statuses, priorities, tracked fields
- `utils/` — Task validation, scope helpers (`taskScope.js`), article codes (`articleCode.js`), HTTP error factories

### Frontend (`frontend/src/`)
- `App.js` — Root router with protected routes
- `context/AuthContext.js` — Global user/auth state; `context/WorkspaceContext.js` — active workspace
- `services/api.js` — Axios instance with JWT interceptors; all API calls centralized here; `scanService` for OCR endpoints
- `pages/` — Full-page views (Dashboard, Kanban, Users, Stock, Auth)
  - **`CameraScanPage.jsx`** — Mobile camera live feed + snapshot capture for OCR
  - **`StockScanPage.jsx`** — Drag-drop upload + base64 conversion for OCR
- `components/`
  - Reusable UI: KanbanBoard, TaskCard, TaskDetailsPanel, modals
  - **`ScanForm.jsx`** — Auto-filled form with extracted fields, confidence indicators, manual corrections
- `constants/task.js` — Mirrors backend constants (keep in sync manually)
- `utils/formatters.js` — Date formatting (`DD/MM/YYYY`), relative dates, number formatting, `getInitials()`

### Data Model
- **Task statuses:** `WAITING_STOCK` → `TODO` → `IN_PROGRESS` → `DONE` (+ `BLOCKED`)
- **User roles:** `super_admin` > `planner` > `commercial` > `user`
  - `super_admin`: full access, user CRUD, all task management
  - `planner`: status updates, task modifications, Kanban drag & drop, date negotiation
  - `commercial`: task creation, sees all tasks on Kanban, receives notifications
  - `user`: read-only
- Tables: `users`, `workspaces`, `tasks`, `task_comments`, `task_history`, `notifications`, `password_reset_tokens`, `stock_imports`

### Environment Variables
Copy `backend/.env.example` to `backend/.env`. Key vars:
- `BOOTSTRAP_ADMIN_*` — Seeds the first `super_admin` on migration
- `JWT_SECRET` — Must be set in production (32+ chars)
- `DATABASE_URL` — PostgreSQL connection string
- `SMTP_*` — Email service for password reset
- `REACT_APP_API_URL` — Frontend → Node.js backend (default `http://localhost:5000`)
- `REACT_APP_OCR_SERVICE_URL` — Frontend → Python OCR service (default `http://localhost:8000`)

## Key Systems

### Stock Allocation (FIFO)
Automatic allocation by delivery date priority:
1. `recalculateStockAllocation(itemReference)` runs on task create/update/delete/status-change
2. Tasks sorted by `planned_date`, then `due_date`, then `id` (deterministic FIFO)
3. Stock allocated sequentially; deficit > 0 → auto-transition to `WAITING_STOCK`
4. Bidirectional: `TODO → WAITING_STOCK` if stock becomes insufficient, `WAITING_STOCK → TODO` if stock becomes available
5. Daily midnight job also promotes eligible tasks

Key files: `stockAllocationService.js`, `StockAllocationBadge.js`, `taskController.js`

### Notification System
Bidirectional notifications between planner and commercial:
- **Commercial → Planner**: task creation notifications to all planners/super_admins
- **Planner → All Commercials**: status changes, date modifications, date negotiation (PROPOSE/ACCEPT/REJECT)
- All commercials receive notifications (not just the task creator)
- Polling every 30s in `Header.js`; notification dropdown with mark-as-read

Key files: `notificationModel.js`, `notificationController.js`, `Header.js`

### Date Negotiation
Commercial and planner can negotiate delivery dates on tasks:
- Actions: `PROPOSE`, `ACCEPT`, `REJECT` via `PUT /api/tasks/:id/date-negotiation`
- Status flow: `PENDING_PLANNER_REVIEW` ↔ `PENDING_COMMERCIAL_REVIEW` → `ACCEPTED`
- Full history tracked in `task_history` with actor name and role

### Task Visibility
- `utils/taskScope.js` controls visibility via `applyTaskVisibility()`
- `PRIVILEGED_TASK_ROLES = ['super_admin', 'planner', 'commercial']` — see all tasks
- Regular `user` role only sees tasks they created

### Article Code Validation
- Allowed prefixes: `CI`, `CV`, `DI`, `DV`, `FC`, `FD`, `PL`
- Regex: `/^(CI|CV|DI|DV|FC|FD|PL)[A-Z0-9-]+$/`
- Defined in `backend/src/utils/articleCode.js`

### Excel Import
- **Task import** (`importOrders`): forward-fills Date, Pièce no, Nom, Délai demandé across multi-line order groups
- **Stock import**: two-phase deduplication (exact row dedup → aggregate by article)
- Uses ExcelJS for parsing

### OCR Industrial Label Scanning (Local, 95%+ Accuracy)
**Pipeline:** Image → Preprocessing → PaddleOCR → Supplier Detection → Supplier-Specific Parsing → Confidence Scoring → Auto-Fill Form

**Preprocessing Flow** (`imagePreprocessor.js`):
1. Grayscale conversion + normalize (auto contrast)
2. Bilateral filter (denoise while preserving edges)
3. Perspective correction (detects document corners + warp affine)
4. Upscaling (if image < 800px width)

**OCR Engine** (`paddleOcrService.js`):
- PaddleOCR v3 with `use_angle_cls: true` (detects rotated text)
- Returns: text + confidence (0-100) + bbox (4 corners) + normalized position

**Supplier Detection** (`supplierDetector.js`):
- Keyword scanning: SCA, DS Smith, Smurfit Westrock, Interpac, International Paper, Modern Karton
- Scores fournisseur based on keyword count

**Field Extraction** (`fieldExtractor.js`):
- **Spatial search** (NOT simple regex): finds label keywords, then searches horizontally/vertically for values
- Handles OCR line breaks: "105" on line 1 + "g/m²" on line 2 still extracted as "105 g/m²"
- Proximity-based: selects closest detected value to label

**Supplier-Specific Parsing** (`parsers/*/`):
- Each supplier has custom mapping: SCA "SUBSTANCE" → grammage, DS Smith "BASIS WEIGHT" → grammage, etc.
- Example: `ScaParser._extractGrammage()` searches for label, then finds nearest number with `FieldExtractor.findValueNearLabel()`

**Confidence Scoring** (`confidenceScorer.js`):
- Per-field validation: grammage 50-500, width 500-2500mm, weight 500-5000kg
- Out-of-range values reduce confidence (multiplier 0.5-0.6)
- Global confidence = avg of field scores; if < 80% → flag field for manual correction

**Frontend** (`CameraScanPage.jsx` + `ScanForm.jsx`):
- Live camera feed with snapshot capture OR drag-drop file upload
- Results auto-fill form with confidence indicators
- Users can edit low-confidence fields manually
- "Emplacement" (S1, S2, S3...) always manual

**Key Files:**
- Backend: `ocrPipeline.js` (orchestration) → `scanController.js` (endpoint)
- Frontend: `CameraScanPage.jsx` (capture) + `ScanForm.jsx` (display + edit)
- Config: `supplierMappings.js` (fournisseur keywords/rules), `ocrConfig.js` (PaddleOCR init)

**Testing:**
```bash
# Test with curl (requires JWT token)
curl -X POST http://localhost:5000/api/scans/upload-base64 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imageData":"data:image/jpeg;base64,..."}'

# Response includes: supplier, grammage, width_mm, weight_kg, reel_serial_number, confidence scores
```

**Performance:**
- First init: 5-10s (model download)
- Per-scan: 2-3s (preprocessing + OCR + parsing)
- No cloud API calls — 100% local processing
- CPU: 30-50% during scan, Memory: ~150-200 MB

## CSS Conventions
- BEM naming: `.task-card__title`, `.task-card__priority--high`
- CSS variables defined in `index.css` `:root` (e.g. `--color-primary`, `--radius-md`)
- Date format standard: `DD/MM/YYYY` via `formatters.js` — never use `toLocaleDateString()` inline
