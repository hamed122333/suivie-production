# Logique d'import des commandes — état actuel & plan d'évolution

But : structure d'import qui **corrige la table par héritage** (forward-fill des
cellules vides d'une même commande) → **plus besoin du concept d'« anomalie »**.

---

## 1. Chaîne d'import actuelle (à connaître avant toute modif)

### Backend
| Élément | Fichier | Rôle |
|---|---|---|
| `importOrders` | `backend/src/controllers/taskController.js` | Parse Excel → tâches `PENDING_APPROVAL` |
| `approveOrders` | idem | Valide → FIFO → `TODO`/`WAITING_STOCK` + `broadcast` |
| `rejectOrders` | idem | Supprime les commandes en attente + `broadcast` |
| `getPendingApproval` | idem | Liste les `PENDING_APPROVAL` (enrichies stock) |
| `createMany` / `listExistingOrderLines` | `models/taskModel.js` | Insertion en lot + dédup vs DB |
| `normalizeTaskMetadata` (clientCode) | `utils/taskValidation.js` | Validation create/update |
| `applyTaskVisibility` | `utils/taskScope.js` | Visibilité par rôle |
| routes `/import-orders` `/approve` `/reject` `/pending-approval` | `routes/taskRoutes.js` | Accès par rôle |
| migration `017_add_task_client_code.sql` | `backend/migrations/` | `tasks.client_code` |

### Frontend
| Élément | Fichier | Rôle |
|---|---|---|
| `OrdersReviewPage` | `frontend/src/pages/OrdersReviewPage.js` | Revue/validation, **détection d'anomalies**, correction inline |
| `taskAPI.importOrders/approveOrders/rejectOrders/getPendingApproval` | `services/api.js` | Appels API |
| badge « Commandes » | `components/Header.js` | Compteur en attente |

### Étapes d'`importOrders`
1. Garde-fous fichier (vide / corrompu) → 400.
2. **Scan en-tête** sur 10 lignes (tolère préambule « Filtres appliqués »).
3. Détection colonnes : Date, Pièce no, **Tiers→client_code**, Nom→client_name,
   Référence (obl.), Quantité (obl.), Délai demandé→planned_date, Commercial 1→VL.
4. **Forward-fill (héritage)** : une cellule vide hérite de la 1ʳᵉ ligne de la
   commande (même Pièce no) ; reset des champs au changement de Pièce no.
5. Résolution des codes VL → comptes commerciaux.
6. Dédup vs lignes déjà en base (clé multi-colonnes).
7. `createMany` en `PENDING_APPROVAL`.

---

## 2. Règle cible : héritage = correction (zéro anomalie)

Le forward-fill **corrige déjà** les lignes de continuation. La table est donc
« auto-corrigée » à l'import → la notion d'anomalie devient inutile.

### 🟩 À DÉVELOPPER / RENFORCER
- Héritage robuste, déjà en place ; à conserver et tester comme **seul** mécanisme
  de correction.
- (Selon la nouvelle table) ajuster les alias de colonnes et la clé de dédup.

### 🟧 À MODIFIER
- `importOrders` : retirer la collecte `anomalies[]` / `rowAnomalies` (métadonnée
  inutile une fois l'héritage seul retenu) → réponse simplifiée
  (`imported`, `skipped`, `warnings`, `workspaces`).
- `OrdersReviewPage` : retirer la **section anomalies** + `taskAnomalies` ;
  conserver uniquement liste + sélection + approve/reject + modale détail.

### 🟥 À SUPPRIMER (inutile avec l'héritage)
- `taskAnomalies()` (frontend) et le bandeau/section d'anomalies.
- Édition inline « ✎ Corriger » si la correction est entièrement assurée par
  l'héritage (à confirmer selon la nouvelle table).
- Champ `anomalies` dans la réponse d'import et son affichage.

> ⚠️ À NE PAS supprimer : le forward-fill, la dédup, la résolution commerciale,
> le flux approve/reject, la modale détail (stock).

---

## 3. En attente
La **nouvelle structure de table** sera fournie ensuite. À sa réception :
1. Adapter alias de colonnes + clé de dédup à la nouvelle structure.
2. Appliquer le plan §2 (modif/suppression anomalies).
3. Build + tests + validation sur fichier réel + commit.
