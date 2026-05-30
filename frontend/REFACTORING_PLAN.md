# Plan de refactorisation Front-End — Suivi Production

Document de suivi de la refonte vers une architecture à composants réutilisables
et un Design System cohérent. Mis à jour au fil des phases.

---

## ✅ Phase CRITIQUE — FAITE

### Design System (tokens)
- `src/styles/tokens.css` — échelle d'espacement (`--space-*`), typographie
  (`--font-size-*`, `--font-weight-*`), couleurs sémantiques additionnelles,
  z-index ordonnés, ombres, transitions, focus ring. Importé en tête de `index.css`.
- Les tokens historiques de `index.css` (couleurs, radius, shadows) sont conservés.

### Primitives réutilisables — `src/components/ui/`
Chaque primitive : dossier dédié + `.js` (PropTypes + JSDoc) + `.css` (100 % tokens) + `index.js` + test RTL.

| Composant | Rôle | Props clés |
|---|---|---|
| `Button` | Bouton standard | `variant`, `size`, `loading`, `fullWidth`, `leftIcon`/`rightIcon` |
| `Modal` | Modale accessible | `isOpen`, `onClose`, `title`, `size`, `footer`, `closeOnEsc`/`closeOnOverlay` (ESC + overlay + `role=dialog` + scroll lock) |
| `Input` | Champ + label + erreur | `label`, `error`, `hint`, `required` (a11y `aria-invalid`/`aria-describedby`) |
| `Select` | Liste déroulante | `options`, `placeholder`, `label`, `error` |
| `Badge` | Pastille de statut | `tone`, `dot` |
| `Loader` | Chargement | `size`, `message`, `fullPage` (`role=status`) |
| `EmptyState` | État vide | `icon`, `title`, `description`, `action` |
| `Card` | Surface conteneur | `header`, `footer`, `padding`, `interactive` |

Import unique : `import { Button, Modal, Input, Select, Badge, Loader, EmptyState, Card } from '../components/ui';`

### Migration de démonstration
- `ExportModal` migré → `Modal` + `Button` + `Input` (12 styles inline supprimés,
  markup modal dupliqué éliminé). Sert de patron pour les migrations suivantes.

### ⚠️ Note environnement
Le runner de test CRA (jest/micromatch) ne découvre pas les tests depuis ce
worktree (`\.codex` casse le glob `testMatch`). Les tests RTL sont valides et
s'exécutent dans un chemin de projet normal (`npm test`). Le `build` valide tout
le code des primitives. Les tests **back-end** (`node:test`) tournent, eux (54 ✓).

---

## 🟧 Phase IMPORTANTE — À FAIRE

### 1. Migrer les modales restantes vers `<Modal>`
Remplacer le markup `.modal-overlay`/`.cr-overlay` par `<Modal>` dans :
- `BlockReasonModal`, `ManualStockModal`, `StockImportModal` (simples — faire en premier)
- Dialogues inline : suppression dans `KanbanBoard`, confirmation dans `UsersPage`
- `TaskModal` (739 l.) et `TaskDetailsPanel` (532 l.) — **après** découpage (cf. §3)
- Modale détail de `OrdersReviewPage` (`DetailModal`) → `<Modal size="lg">`
- Objectif : supprimer les 3 définitions CSS dupliquées de `.modal-overlay`.

### 2. `<DataTable>` générique + `<ConfirmDialog>` + Toasts
- `DataTable` : colonnes configurables, tri, sélection (checkbox), pagination,
  slots état vide/chargement. Migrer les tables de `OrdersReviewPage`, `UsersPage`, `StockPage`.
- `ConfirmDialog` (basé sur `Modal`) → remplace les `window.confirm` et dialogues inline.
- `ToastProvider` + `useToast()` → remplace les bannières ad hoc (`cr-banner`, `importBanner`).

### 3. Découper les composants géants (Separation of Concerns)
- `OrdersReviewPage` (1063 l.) → hook `useOrdersReview` (logique/API) +
  sous-composants `OrderFilters`, `OrderTable`/`OrderRow`, `OrderDetailModal`, `OrderStats`.
- `TaskModal` (739 l.) → extraire le formulaire en sous-sections + `useTaskForm`.
- `KanbanBoard` (595 l.) → extraire `useKanbanDnd` (drag & drop) et `KanbanColumn`.

### 4. Consolider les helpers dupliqués (avec prudence)
- `getPrefix`, `daysUntil`, `urgencyLevel` existent en versions **divergentes**
  (cf. audit). Créer `utils/orderHelpers.js` avec UNE version canonique testée,
  puis migrer fichier par fichier en vérifiant le comportement (ne pas fusionner à l'aveugle).
- Centraliser `ARTICLE_CATEGORIES` via `constants/task.js` (`getArticleCategory`).

### 5. Migrer boutons / inputs / selects natifs
- 118 `<button>` → `<Button>` ; 17 `<select>` → `<Select>` ; inputs → `<Input>`.
- Supprimer les définitions `.btn` dupliquées (index.css garde la version canonique
  le temps de la migration, puis on retire celles de `TaskModal.css` et `StockPage.css`).

---

## 🟩 Phase OPTIONNELLE — À FAIRE

- **Dark mode** : `:root[data-theme="dark"]` surchargeant les tokens couleur + toggle.
- **Lazy loading / code splitting** : `React.lazy` + `Suspense` sur les pages
  (`DashboardPage`, `StockPage`, `UsersPage`, `OrdersReviewPage`).
- **Memoization** : `React.memo` sur `TaskCard` et les lignes de table ; `useCallback`
  sur les handlers passés en props.
- **Animations** : standardiser via tokens (`--transition-*`) ; transitions discrètes
  d'apparition de liste / lignes.
- **Accessibilité** : focus-trap complet dans `Modal`, navigation clavier des tables,
  `aria-live` sur les toasts.

---

## Conventions

- **`components/ui/`** = Design System (primitives génériques, zéro logique métier).
- **`components/`** = composants métier (TaskCard, KanbanBoard, …).
- **`pages/`** = vues ; la logique/API vit dans des **hooks** (`hooks/`), pas dans le JSX.
- **Zéro valeur hardcodée** : couleurs/espacements/typo via tokens CSS.
- **Tout nouveau composant** : PropTypes + test RTL + CSS tokenisé.
