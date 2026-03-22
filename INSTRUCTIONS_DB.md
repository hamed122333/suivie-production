# Guide : Créer la Base de Données avec pgAdmin 4

Si vous n'avez pas encore créé la base de données, l'application ne peut pas démarrer. Suivez ces étapes simples :

## Étape 1 : Ouvrir pgAdmin 4
Lancez l'application **pgAdmin 4** depuis votre menu Windows.

## Étape 2 : Se connecter au Serveur
1. Dans la colonne de gauche (Browser), double-cliquez sur **Servers**.
2. Double-cliquez sur votre serveur (souvent nommé `PostgreSQL 16` ou similaire).
3. **Important** : Si un mot de passe est demandé ici, c'est le mot de passe "Superuser".
   *   Notez ce mot de passe ! Vous devrez peut-être le mettre dans le fichier `backend/.env` à la ligne `DB_PASSWORD=...`.

## Étape 3 : Créer la Base de Données
1. Faites un **clic-droit** sur **Databases**.
2. Choisissez **Create** > **Database...**.
3. Une fenêtre s'ouvre. Dans le champ **Database**, écrivez exactement : 
   `suivi_production`
4. Cliquez sur **Save**.

## Étape 4 : Vérifier la configuration
1. Retournez dans VS Code.
2. Ouvrez le fichier `backend/.env`.
3. Vérifiez la ligne `DB_PASSWORD`. Elle doit correspondre au mot de passe que vous utilisez pour PostgreSQL (souvent `postgres`, `admin`, ou `password`).
   *   Exemple : `DB_PASSWORD=monSuperMotDePasse`

## Étape 5 : Initialiser les Tables
Une fois la base créée, lancez cette commande dans le terminal VS Code (dossier `backend`) :

```powershell
cd backend
npm run migrate
```

Si tout fonctionne, vous verrez : `Schema applied.` ou `Database initialized successfully.`

Ensuite, vous pouvez relancer le serveur : `npm start`.

