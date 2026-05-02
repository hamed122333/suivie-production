# Stock Allocation System - Guide Complet

## 📋 Logique d'allocation de stock par PRIORITÉ DATE

### Problème résolu
Quand plusieurs clients commandent le même article avec quantités insuffisantes, le système alloue intelligemment le stock selon la date de livraison prévue.

### Exemple concret

```
📦 Article CI001: 100 pcs disponibles

Commandes (triées par date):
┌─────────────┬──────────┬───────────┬─────────┐
│ Client      │ Quantité │ Date due  │ Statut  │
├─────────────┼──────────┼───────────┼─────────┤
│ Test1       │ 50 pcs   │ 05/05/26  │ TODO ✅ │
│ Test2       │ 51 pcs   │ 07/05/26  │ WAIT ⏳ │
│ Test3       │ 30 pcs   │ 10/05/26  │ WAIT ⏳ │
└─────────────┴──────────┴───────────┴─────────┘

Allocation:
Test1: 50 pcs alloué → Stock restant: 50 pcs
Test2: 50 pcs alloué (manque 1) → Stock restant: 0 pcs
Test3: 0 pcs alloué (manque 30) → Stock restant: 0 pcs
```

---

## 🎨 Affichage dans TaskCard

### Card avec STOCK INSUFFISANT

```
┌──────────────────────────────────────┐
│ SP-124 • HIGH                    WAIT│
├──────────────────────────────────────┤
│ Test2 - Custom Bearing               │
│ Order: ORD-123 • CI001               │
│                                      │
│ Stock insuffisant — 1 pcs manquants  │
│                                      │
│ ┌────────────────────────────────┐  │
│ │ Demandé:    51 pcs             │  │
│ │ Alloué:     50 pcs ✅          │  │
│ │ Manquant:   ⚠️ 1 pcs          │  │
│ │ Priorité:   2ème               │  │
│ └────────────────────────────────┘  │
│                                      │
│ Réf CI001 • Atelier 1 • Échéance... │
└──────────────────────────────────────┘
```

### Informations affichées

| Champ | Description | Couleur |
|-------|-------------|---------|
| **Demandé** | Quantité commandée par le client | Noir |
| **Alloué** | Quantité disponible du stock | 🟢 Vert |
| **Manquant** | Quantité en rupture | 🔴 Rouge |
| **Priorité** | Ordre d'allocation (1ère, 2ème...) | 🔵 Bleu |

---

## ⚙️ Processus technique

### 1️⃣ Quand une tâche est créée

```javascript
// 1. Créer la tâche
await TaskModel.create({...task});

// 2. Recalculer l'allocation pour cet article
await recalculateStockAllocation(task.item_reference, workspaceId);
```

### 2️⃣ Quand une tâche est modifiée (quantité, date)

```javascript
// 1. Mettre à jour
await TaskModel.update(taskId, {...payload});

// 2. Si quantité/date/article changé:
if (quantityChanged || dateChanged || articleChanged) {
  await recalculateStockAllocation(task.item_reference, workspaceId);
}
```

### 3️⃣ Calcul d'allocation

```javascript
// Pour chaque article:
// 1. Récupérer stock disponible
const stock = 100;

// 2. Trier tâches par date (ascending = earliest first)
const tasks = [
  { id: 1, qty: 50, date: '2026-05-05' },
  { id: 2, qty: 51, date: '2026-05-07' },
  { id: 3, qty: 30, date: '2026-05-10' }
];

// 3. Allouer dans l'ordre
let remaining = 100;
for (task of tasks) {
  allocated = Math.min(task.qty, remaining);
  deficit = Math.max(0, task.qty - allocated);
  remaining -= allocated;
  
  // Mettre à jour la tâche
  await update(task.id, {
    stock_allocated: allocated,
    stock_deficit: deficit,
    priority_order: index + 1
  });
}
```

---

## 📊 États et transitions

### Tâche WAITING_STOCK avec allocation complète

```
status: WAITING_STOCK
stock_allocated: 50 pcs
stock_deficit: 0 pcs
priority_order: 1

→ Badge: ✅ Stock Confirmé (vert)
→ Peut passer à TODO
```

### Tâche WAITING_STOCK avec allocation partielle

```
status: WAITING_STOCK
stock_allocated: 50 pcs
stock_deficit: 1 pcs
priority_order: 2

→ Badge: ⚠️ Stock Insuffisant (orange)
→ Reste en WAITING_STOCK jusqu'à réappro
```

### Tâche WAITING_STOCK sans allocation

```
status: WAITING_STOCK
stock_allocated: 0 pcs
stock_deficit: 30 pcs
priority_order: 3

→ Badge: 🔴 Rupture Stock (rouge)
→ Reste en WAITING_STOCK jusqu'à réappro
```

---

## 🔧 Base de données

### Nouvelles colonnes

```sql
ALTER TABLE tasks ADD COLUMN stock_allocated INTEGER;
ALTER TABLE tasks ADD COLUMN priority_order INTEGER;
```

### Migration

```bash
# Appliquer la migration
npm run migrate

# Ou manuellement
psql -U postgres -d suivi_production < migrations/012_add_stock_allocation_columns.sql
```

---

## 🎯 Cas d'usage

### Cas 1: Stock suffisant pour tous

```
Stock: 200 pcs
Demandes: 50 + 60 + 70 = 180 pcs

Résultat:
Test1: 50 pcs ✅ (Priorité 1ère)
Test2: 60 pcs ✅ (Priorité 2ème)
Test3: 70 pcs ✅ (Priorité 3ème)

→ Toutes les tâches passent à TODO
```

### Cas 2: Stock partiellement insuffisant

```
Stock: 100 pcs
Demandes: 50 + 51 + 30 = 131 pcs

Résultat:
Test1: 50 pcs ✅ (Priorité 1ère)    [Restant: 50]
Test2: 50 pcs ⚠️ Manque 1 (Priorité 2ème)  [Restant: 0]
Test3: 0 pcs ❌ Manque 30 (Priorité 3ème)  [Restant: 0]

→ Test1 TODO, Test2 & Test3 WAITING_STOCK
```

### Cas 3: Ajout de stock (réapprovisionnement)

```
Stock: 0 pcs
Avant: Test2 WAITING_STOCK (manque 1), Test3 WAITING_STOCK (manque 30)

Action: Ajouter 40 pcs

Stock: 40 pcs
Après (recalcul automatique):
Test2: 1 pcs ✅ (Priorité 1ère - date antérieure)
Test3: 39 pcs ⚠️ Manque 1 (Priorité 2ème)

→ Test2 peut passer à TODO, Test3 reste WAITING_STOCK
```

---

## 🚀 Avantages

✅ **Équité**: Chaque commande reçoit selon sa priorité date  
✅ **Transparence**: Client voit exactement ce qu'il reçoit  
✅ **Traçabilité**: Priority order enregistré pour audit  
✅ **Automatique**: Recalcul automatique à chaque changement  
✅ **Intelligent**: Utilise les données existantes (date, quantité)

---

## 📝 Notes

- L'allocation est CALCULÉE, pas BLOQUÉE (client peut toujours passer commande)
- Si client refuse la quantité partielle, il reste en WAITING_STOCK
- Si nouveau stock arrive, allocation se met à jour automatiquement
- La priorité d'ordre est basée sur `planned_date` puis `due_date`
- L'allocation n'affecte pas la date de livraison, juste la quantité dispo

