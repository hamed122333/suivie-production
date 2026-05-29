# Commercial Code Import System

## Overview

The system now supports bulk importing commercial users (vendeurs) from an Excel file. This prevents manual creation of every commercial and ensures commercial codes are consistent across the import table.

## Workflow

### Step 1: Prepare Commercial List Excel
Create a file with two columns:
- **Column A (Commercial)**: Code in format `VL000001`, `VL000002`, etc.
- **Column B (Nom)**: Full name of the commercial

Example:
```
Commercial | Nom
VL000001   | Newbox Tunisia
VL000002   | Khadija Habli
VL000006   | Fathel Awechi
```

### Step 2: Import into System
1. Open **Users Management** page (super_admin only)
2. Click **"📥 Importer commerciaux"** button
3. Select your Excel file
4. Click "Importer"

### Step 3: Use in Order Import
When importing orders, the table should contain a **"Commercial 1"** column with codes like:
```
Date      | Pièce no | Référence | Quantité | Délai demandé | Commercial 1
2026-05-02| 26040030 | CVD0956   | 22000    | 2026-05-07    | VL000011
2026-05-22| 26040033 | CI2939    | 4000     | 2026-05-30    | VL000009
```

## Validation & Error Handling

### Valid Commercial Codes
- Format: `VL` followed by exactly 6 digits
- Examples: VL000001, VL000011, VL999999 ✓
- Invalid: VL00001 (only 5 digits), VD000001 (wrong prefix) ✗

### Import Results
After import, the system reports:
- **✓ Imported**: Number of new commercial users created
- **⚙ Updated**: Number of existing codes (already in system)
- **⊘ Skipped**: Empty rows or invalid entries
- **⚠ Errors**: Rows with invalid format (detailed list shown)
- **⚠ Duplicates**: Codes that appear multiple times in the same import

### Order Import Validation
When importing orders:
- If a commercial code is **not found**, a warning is shown
- If a commercial code is **invalid format**, an error is reported
- Import proceeds anyway (orders are created without assigned commercial)
- Fix: Re-import the commercial list first, then re-import orders

## API Endpoints

### POST `/api/users/import-commercials`
**Requires**: Super Admin role

**Request**:
```
multipart/form-data
- file: Excel file (.xlsx or .xls)
```

**Response** (201 Created):
```json
{
  "imported": 5,
  "updated": 2,
  "skipped": 0,
  "errors": [],
  "duplicates": [],
  "message": "5 commerciaux importés, 2 mis à jour, 0 sautés"
}
```

### POST `/api/tasks/import-orders`
Enhanced validation for commercial codes:
- Validates format (`VL000001`)
- Distinguishes between invalid format and not-found codes
- Reports both types in warnings

## Database

Commercial users are created with:
- **Name**: From Excel column B
- **Email**: `{code}@commercials.internal` (auto-generated)
- **Password**: Temporary (user resets on first login)
- **Role**: `commercial`
- **commercial_id**: Stored code (e.g., VL000011)

## File Structure

### Backend
- `backend/src/routes/userRoutes.js` — Added import route
- `backend/src/controllers/userController.js` — Import handler + validation
- `backend/src/controllers/taskController.js` — Enhanced commercial code validation

### Frontend
- `frontend/src/pages/UsersPage.js` — Import UI + modal
- `frontend/src/services/api.js` — Import API call

## Security

- ✅ Super admin only (like all user management)
- ✅ Commercial codes validated (VL000001 format required)
- ✅ Existing codes rejected (no duplicates in system)
- ✅ Auto-generated passwords prevent hardcoding
- ✅ Full audit trail in task_history

## Next Steps

1. Export your commercial list to Excel:
   - Column A: Code (VL000001, VL000002, ...)
   - Column B: Name

2. Import via Users Management page

3. Import your order table with "Commercial 1" column

4. Monitor warnings for unresolved codes

---

**Version**: 1.0  
**Created**: 2026-05-28  
**Status**: Production Ready
