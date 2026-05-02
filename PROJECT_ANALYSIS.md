# ANALYSE COMPLÈTE: Suivi Production - Structure & Intégration

## 1. VISION GÉNÉRALE DU SYSTÈME

**Suivi Production** est un système Kanban industriel pour la gestion des tâches de production avec gestion du stock en temps réel. Le système orchestre deux tables principales:

### 1.1 Tables Principales

#### **Table 1: `stock_import`**
Représente le catalogue de produits en stock:
```
- id (PK)
- article (VARCHAR) - Code article normalisé (CI/CV/DI/DV/PL)
- quantity (NUMERIC) - Quantité disponible
- designation (VARCHAR) - Description du produit
- client_code, client_name - Info client associée
- ready_date (DATE) - Date d'arrivée en stock (calcul basé sur type article)
- is_used (BOOLEAN) - Flag épuisement
- imported_at (TIMESTAMP)
```

**Règles Métier:**
- **Délai de prêt** selon type article: CI/CV → +6j, DI/DV → +9j, PL → +4j
- **Normalized Article Codes**: Validation stricte des 5 préfixes
- **Quantity Deduction**: Décrémentation au passage en production
- **Auto-promotion**: Tâches WAITING_STOCK → TODO quand stock dispo

#### **Table 2: `tasks`**
Représente les fiches de production avec orchestration stock:
```
Core Fields:
- id (PK)
- title, description
- status (WAITING_STOCK|TODO|IN_PROGRESS|BLOCKED|DONE)
- priority (LOW|MEDIUM|HIGH|URGENT)
- task_type (PRODUCTION_ORDER|PREDICTIVE)

Stock Integration:
- stock_import_id (FK) - Lien vers le produit
- item_reference - Code article demandé
- quantity, quantity_unit - Besoin en production

Production Context:
- planned_date, due_date - Calendrier
- production_line, machine, workshop - Localisation
- client_name, order_code - Commande

Conflict Detection:
- stock_available_at_creation - Quantité au moment de création
- stock_deficit - Manquant = max(0, quantity - available)
- has_stock_conflict - Booléen conflit
- competing_clients - Clients en compétition pour le même article

Negotiation (Prévu/Négocié):
- proposed_delivery_date - Livreur propose
- proposed_by_role - Qui propose
- date_negotiation_status (pending|accepted|rejected)
- date_negotiation_comment - Justification
- date_negotiation_updated_at

Meta:
- assigned_to, created_by, blocked_by (FK users)
- board_position - Ordre dans colonne Kanban
- created_at, updated_at
```

## 2. FLUXES DE DONNÉES CRITIQUES

### 2.1 Flux 1: Import Stock → Auto-promotion Tâches

```
[Excel/CSV Upload]
        ↓
[stockImportController.upload]
  - Parse Excel/CSV
  - Extract: article, quantity, designation, dates
  - Normalize & Validate article codes
        ↓
[StockImportModel.createMany]
  - Upsert articles existants (accumulation stock)
  - CREATE/UPDATE stock_import records
        ↓
[autoPromoteWaitingTasksByArticles]
  - SELECT tasks WHERE status=WAITING_STOCK AND item_reference IN (articles)
  - FOR EACH: Check stock >= quantity required
  - UPDATE status → TODO (avec audit trail)
  - Log history event
        ↓
[TaskHistoryModel.log]
  - Enregistrer "stock_confirmed" action
  - Aide débugging + audit
```

**Points Critiques:**
- ✅ Normalization stricte article codes (validation double)
- ✅ Transaction atomique pour multi-articles
- ✅ Auto-promotion notifie basé roles (planner, commercial)
- ⚠️ Manquant: Notification push à utilisateurs sur auto-promotion

### 2.2 Flux 2: Création Tâche → Détection Conflit Stock

```
[TaskModal (Commercial)]
  - Crée: PRODUCTION_ORDER ou PREDICTIVE
  - Renseigne: item_reference, quantity
        ↓
[taskController.create]
  - Valide article reference
  - Récupère stock dispo (StockImportModel.getStockQuantity)
  - Calcule: stock_available_at_creation
  - Calcule: stock_deficit = max(0, quantity - available)
  - SAVE task
        ↓
[taskController.calculateConflicts]
  - SELECT COUNT(distinct tasks) sharing item_reference
  - SELECT SUM(quantity) pour ce même article (non-DONE)
  - IF count >= 2 AND SUM > available_stock:
    - has_stock_conflict = TRUE
    - competing_clients = STRING_AGG (autres clients)
  - RETURN conflicted tasks
        ↓
[Frontend Receives]
  - Affiche STOCK CONFLICT BADGE rouge
  - Affiche competing_clients qui partagent le stock
  - Désactive confirm btn si stock insuffisant
```

**Points Critiques:**
- ✅ Détection conflit basée 2+ tâches + dépassement stock
- ✅ Audit trail complet (task_history)
- ⚠️ **Problème identifié**: Conflit = lecture seule, jamais résolu via UI
- ⚠️ Manquant: Stratégie résolution (FIFO, priorité, demande client?)

### 2.3 Flux 3: Tâche Prévue (PREDICTIVE) vs Production (STANDARD)

```
PREDICTIVE Tasks:
- Ne consomment PAS de stock
- Servent estimation future besoin
- Excludes de:
  - Détection conflit
  - Déduction stock
  - Auto-promotion
- But: Planification moyen/long terme

STANDARD/PRODUCTION_ORDER:
- Consomment stock si status = IN_PROGRESS/DONE
- Inclus dans conflit detection
- Sujets à auto-promotion WAITING_STOCK
```

**Points Critiques:**
- ✅ Séparation claire PREDICTIVE vs STANDARD
- ⚠️ Frontend manque UI pour basculer task type
- ⚠️ Manquant: Conversion PREDICTIVE → STANDARD + impact stock

## 3. ANALYSE DE L'ARCHITECTURE FRONTEND

### 3.1 État Actuel - Composants Clés

#### **KanbanPage**
- Affiche: 5 colonnes (WAITING_STOCK | TODO | IN_PROGRESS | BLOCKED | DONE)
- Gère: Drag-drop, filters, task selection
- État: task list, selected task, edit modal, block modal

#### **TaskCard** (optimisé dernière session)
- **Clutter reduction**: 12 → 8 visual layers
- Affiche: Urgency chip (J-2/J-1/Overdue), priority, status
- Manquant: Conflit stock badge (rouge)

#### **TaskDetailsPanel** (right sidebar)
- **Améliorations**: Stock & Approvisionnement section dedié
- Affiche: stock_available_at_creation, quantity, stock_deficit, conflicts
- Actions: Modifier, Supprimer, Confirm Predictive

#### **TaskModal** (edit form)
- z-index fix appliqué ✅
- Form fields: title, priority, dates, stock links
- Commercial mode: Stock picker avec quantités

#### **StockPage** (onglet dédié)
- Liste articles importés
- Tri/filtre par date prête, quantité
- Manquant: Affichage tâches associées par article

### 3.2 Problèmes UX Identifiés

| Problème | Impact | Sévérité |
|----------|--------|----------|
| **Conflit stock = lecture seule** | Utilisateurs bloqués sans stratégie résolution | 🔴 HAUTE |
| **Pas d'avertissement résolution conflit** | Planners découvrent tard les problèmes | 🔴 HAUTE |
| **Stock tab isolée** | Contexte tâche/article fragmenté | 🟠 MOYENNE |
| **PREDICTIVE ↔ STANDARD conversion absent** | Planification rigide | 🟠 MOYENNE |
| **Pas filtrage conflits Kanban** | Hard trouver tâches bloquées par stock | 🟠 MOYENNE |
| **History audit peu visible** | Traçabilité opacque | 🟡 BASSE |

## 4. RECOMMANDATIONS STRUCTURE & LOGIQUE

### 4.1 Phase 1: Résolution Conflits Stock (🔴 PRIORITÉ HAUTE)

#### **Problème Actuel:**
```
Task A: Client1 demande 100x CI001 (WAITING_STOCK)
Task B: Client2 demande 150x CI001 (TODO)
Stock: 120x CI001 disponibles
→ CONFLIT DÉTECTÉ mais aucun moyen de résoudre
```

#### **Solution Proposée:**

**Backend - Nouvelle Logique:**
```
POST /api/tasks/:id/resolve-conflict
  Inputs: 
    - conflictStrategy: 'priority'|'date'|'negotiate'|'split'
    - negotiatedDate?: DATE (si negotiate)
    - splitQuantity?: NUMBER (si split)
  
  Actions:
    1. Validate strategy type
    2. IF priority: Order tasks by priority, mark lower as BLOCKED
    3. IF date: Order by due_date ASC, defer later tasks
    4. IF negotiate: Propose new delivery_date, await client response
    5. IF split: Reduce quantity on lower-priority task, create new task for delta
    6. Update has_stock_conflict → FALSE for resolved tasks
    7. Log resolution in task_history with "conflict_resolved" action
    8. Send notifications to affected clients/planners
```

**Frontend - UI pour Résolution:**
```
<ConflictResolutionModal>
  - Affiche: Tâches en conflit (sorted par client, date due)
  - Affiche: Stock disponible vs total demand
  - Options:
    1. "Prioritize by Date" - Défer tâches futures
    2. "Negotiate New Date" - Propose client une nouvelle livraison
    3. "Split Order" - Diviser quantité sur plusieurs tâches
    4. "Block Lowest Priority" - Marquer non-crucial comme BLOCKED
  - Preview impact avant confirm
  - Audit trail des changements
```

### 4.2 Phase 2: Intégration Stock-Kanban (Contexte Unifié)

#### **Problème Actuel:**
- Stock tab = liste articles, pas connectée tâches
- Kanban = tâches, références article faible

#### **Solution Proposée:**

**Frontend - Article Context Sidebar:**
```
Nouvelle Sidebar: "Stock & Tasks Context" (replaces pure details panel for articles)
  
  Quand article selected dans Stock tab:
  ┌─────────────────────────────────────────┐
  │ 📦 CI001 - Bearing Assembly             │
  │ Qty: 120 | Ready: 2026-05-15             │
  │ Designation: Industrial Bearing          │
  │ Client: [All] | Code: [All]              │
  ├─────────────────────────────────────────┤
  │ ACTIVE TASKS (5)                        │
  │ ┌─────────────────────────────────────┐ │
  │ │ Task #123 │ Client: Acme            │ │
  │ │ Qty: 50   │ Priority: HIGH           │ │
  │ │ Status: IN_PROGRESS                 │ │
  │ │ Assigned: John (Planner)            │ │
  │ └─────────────────────────────────────┘ │
  │ ┌─────────────────────────────────────┐ │
  │ │ Task #124 │ Client: GlobalCorp       │ │
  │ │ Qty: 70 (CONFLICT: Only 50 left)  │ │
  │ │ Status: WAITING_STOCK              │ │
  │ │ [Resolve Conflict] [Click to Edit]  │ │
  │ └─────────────────────────────────────┘ │
  ├─────────────────────────────────────────┤
  │ CONFLICT SUMMARY                        │
  │ Total demand: 120  |  Stock: 120        │
  │ ⚠️ 2 Tâches en conflit → 50 units short │
  │ [RESOLVE CONFLICT]                       │
  └─────────────────────────────────────────┘
```

**Backend - New Endpoints:**
```
GET /api/stock-import/:id/active-tasks
  Returns: Tâches actives (non-DONE) utilisant cet article
  Include: conflict status, assigned user, priority
  
GET /api/tasks/by-article/:article
  Returns: Toutes tâches (filtrées workspace)
  
GET /api/stock-import/conflicts-summary
  Returns: Résumé conflits par article
```

### 4.3 Phase 3: PREDICTIVE ↔ STANDARD Toggle

#### **Backend Migration:**
```
PATCH /api/tasks/:id/change-type
  Input: { newType: 'PREDICTIVE'|'STANDARD' }
  
  IF STANDARD → PREDICTIVE:
    - Exclude from conflict detection
    - Do NOT consume stock
    - Mark urgent_date_pending = FALSE (non-applicable)
  
  IF PREDICTIVE → STANDARD:
    - Recalculate stock_available_at_creation
    - Detect conflicts NOW
    - IF insufficient stock: Transition to WAITING_STOCK
    - Notify planner
```

#### **Frontend:**
```
<TaskTypeSelector>
  ┌──────────────────────────────┐
  │ Task Type:                    │
  │ ○ STANDARD (Consume stock)   │
  │ ○ PREDICTIVE (Forecast only)  │
  │ [Description]: "Convert to... │
  │               ...if changing"│
  └──────────────────────────────┘
```

### 4.4 Phase 4: Kanban Filters & Visibility

#### **New Filter Options:**
```
<KanbanToolbar>
  Existing: Priority, Search
  
  Add:
  - "Stock Status": 
    • All
    • Has Conflict
    • Critical Deficit (>50% short)
    • On Budget
    • Predictive Only
    
  - "Days Until Ready":
    • All
    • Overdue (<0 days)
    • J-2 to J-0 (urgent)
    • J+1 to J+7 (upcoming)
    • J+8+ (future)
```

#### **Card Badges Enhancement:**
```
Current: Priority, Status, Urgency Chip
Add:
  - Stock Conflict Badge: 🚨 CONFLICT (red)
  - Stock Deficit Indicator: ⚠️ Short 50%
  - Predictive Tag: 📌 FORECAST (blue)
  - Competing Clients: Shows competing_clients as tooltip
```

## 5. DESIGN & STRUCTURE CSS/COMPOSANTS

### 5.1 New Components

#### **ConflictResolutionModal** (Modal)
```
Purpose: Guitare résolution conflit stock
Props:
  - conflictedTasks: Task[]
  - article: string
  - availableStock: number
  - onResolve: (strategy, params) => void
  - onClose: () => void
```

#### **StockContextSidebar** (Sidebar alternative)
```
Purpose: Contexte article + tâches associées
Props:
  - stockId: number
  - onTaskClick: (taskId) => void
  - onConflictResolve: () => void
```

#### **StockArticleTable** (Refactor StockPage)
```
Purpose: Afficher articles avec tâches inline
Features:
  - Expand/collapse tâches per article
  - Inline conflict indicator
  - Quick access to resolve
```

### 5.2 CSS Architecture

```
New CSS modules:
- ConflictResolutionModal.css (modal dialog)
- StockContextSidebar.css (sidebar layout)
- StockArticleTable.css (table + expandable rows)

Existing updates:
- TaskCard.css: Add .task-card__conflict-badge
- KanbanBoard.css: Add filter controls layout
```

## 6. DATA INTEGRITY & TRANSACTION RULES

### 6.1 Critical Operations

| Operation | Transaction Scope | Rollback Condition |
|-----------|------------------|-------------------|
| Stock Import (Multi-article) | BEGIN...COMMIT...ROLLBACK | Invalid article OR quantity |
| Conflict Resolution | BEGIN...COMMIT | Insufficient stock after resolution |
| Task Status Update + Stock Deduction | BEGIN...COMMIT | Quantity exceeds available |
| Auto-Promotion (Batch) | BEGIN per task | Stock check fails |

### 6.2 Audit Requirements

Every operation must log to `task_history`:
```
{
  taskId: number,
  actorId: number (or null for system),
  actionType: string (create|update|conflict_detected|conflict_resolved|stock_confirmed),
  fieldName: string,
  oldValue: string,
  newValue: string,
  message: string (human-readable FR),
  created_at: timestamp
}
```

## 7. IMPLEMENTATION ROADMAP

### **Phase 1: Foundation (1-2 jours)**
- [ ] Fix z-index modal ✅ DONE
- [ ] ConflictResolutionModal backend endpoint
- [ ] Basic conflict resolution UI

### **Phase 2: Integration (2-3 jours)**
- [ ] StockContextSidebar component
- [ ] Refactor StockPage with active tasks list
- [ ] New API endpoints (stock/:id/active-tasks)

### **Phase 3: Polish (1-2 jours)**
- [ ] PREDICTIVE toggle in TaskModal
- [ ] Kanban filter enhancements
- [ ] Card badges for conflicts/predictive
- [ ] Notifications on auto-promotion

### **Phase 4: QA & Optimization (1-2 jours)**
- [ ] E2E testing conflict resolution
- [ ] Performance: Conflict detection query optimization
- [ ] UX polish: Tooltips, loading states

## 8. SUMMARY - KEY STATS

| Métrique | État Actuel | Cible |
|----------|------------|-------|
| Tables de base | 2 (stock_import, tasks) | Idem (+ views) |
| Colonnes conflicts | 2 (flag + clients) | Idem (+ resolution tracking) |
| Flux auto-promotion | ✅ Actif | ✅ + notifications |
| Résolution conflits | ❌ Absent | ✅ Multi-stratégie |
| UX intégration stock | 🟡 Fragmenté | ✅ Unifié |
| Filtrage Kanban | 🟡 Basique | ✅ Stock-aware |

---

**Conclusion**: Le système a des fondations solides pour gestion stock + Kanban. Les deux tables (`stock_import` + `tasks`) orchestrent bien la logique métier. Les améliorations proposées élèvent le UX et résolvent les blocages (conflits non-résolus), sans refonte architecturale.
