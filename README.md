# PLOUTOS

Application web de gestion financière personnelle permettant de suivre et d'analyser vos finances en temps réel.

## Fonctionnalités

- **Agrégation bancaire automatique** via GoCardless (Open Banking)
- **Gestion des comptes** réels (banque, épargne) et virtuels (catégories de dépenses/revenus)
- **Système de comptabilité en partie double** :
  - Chaque transaction principale (master) peut être décomposée en plusieurs sous-transactions (slaves)
  - Les slaves de type "crédit" représentent les sorties d'argent (dépenses)
  - Les slaves de type "débit" représentent les entrées d'argent (revenus)
  - Permet de splitter une transaction sur plusieurs catégories (ex: un achat de 100€ réparti entre Alimentation 70€ et Loisirs 30€)
- **Dashboard interactif** avec graphiques d'analyse (revenus, dépenses, patrimoine)
- **Détection automatique des transferts** entre comptes
- **Édition et catégorisation** des transactions avec gestion des slaves


## Installation

**Backend (Python):**
```bash
pip install poetry
cd back && poetry install
```

**Frontend (Next.js):**
```bash
cd front && npm install
```

## Run the project

In one terminal, run the following command to start the Next.js server:
```bash
cd front && npm run dev 
```

In another terminal, run the following command to start the Nest.js server:
```bash
cd back && poetry run uvicorn ploutos.api.main:app --reload --log-level debug
```
Go on the following url to access the website:
```
http://localhost:3000
```
and on the following url to access the API:
```
http://localhost:8000/docs
```

## Tests

```bash
cd back && poetry run pytest
```

## Database Backup & Restore

### Obtenir le mot de passe Supabase

1. Allez sur votre dashboard Supabase
2. Cliquez sur **Connect** (menu en haut)
3. Cliquez sur **Reset your database password** pour obtenir/réinitialiser le mot de passe
4. Copiez le mot de passe affiché

### Faire un dump de la base de données

Dans back:
```bash
pg_dump \
  "postgresql://postgres.cdaunrvoljkqoimtrtpc:fzwYlFIMn0LMK0Oy@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require" \
  -Fc \
  -f backup_$(date +%Y%m%d).dump
```

### Restaurer depuis un dump

Dans back:
```bash
pg_restore \
  -d "postgresql://postgres.cdaunrvoljkqoimtrtpc:[VOTRE_PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require" \
  --clean \
  --if-exists \
  backup.dump
```

Options :
- `-Fc` : Format custom compressé
- `--clean` : Supprime les objets existants avant de les recréer
- `--if-exists` : Ne génère pas d'erreur si l'objet n'existe pas

### Vérifier la connexion

```bash
psql \
  "postgresql://postgres.cdaunrvoljkqoimtrtpc:[VOTRE_PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require" \
  -c "\dt"
```

## Code Quality

**Setup:**
```bash
pip install ruff pre-commit
pre-commit install --hook-type pre-commit --hook-type commit-msg
```

**Checks:**
- Backend: `ruff check back/`
- Frontend: `cd front && npm run lint && npm run format:check`
- Pre-commit: Ruff (Python) + Prettier (JS/TS)
- CI: Checks automatiques sur chaque push

## Commits

Format [Conventional Commits](https://www.conventionalcommits.org/) requis : `[emoji] <type>(<scope>): <description>`

L'emoji est optionnel et purement décoratif. Exemples :
- `feat: add user authentication`
- `feat: ✨ add user authentication`
- `fix(api): resolve timeout issue`

| Type       | Description             | Version |
|------------|-------------------------|---------|
| `feat`     | Nouvelle fonctionnalité | minor   |
| `fix`      | Correction de bug       | patch   |
| `docs`     | Documentation           | -       |
| `refactor` | Refactoring             | -       |
| `test`     | Tests                   | -       |
| `chore`    | Maintenance             | -       |
| `ci`       | CI/CD                   | -       |
| `perf`     | Performance             | patch   |

Breaking change : `feat!: message` ou `BREAKING CHANGE:` dans le footer → major


#### Bank Aggregator

We use GoCradless to get the bank account data. It has a free tier and a lot of Bak Integratiob 
Other options are Plaid, Tink.io, powens.com, saltedge.
GoCardless is the best option for now as it is widely used and got a good free tier. ([Reddit Discussion](https://www.reddit.com/r/vosfinances/comments/1f3zw6j/liste_des_transactions_via_api_open_banking/)) 
Par ailleurs, il existe d'autres projets open sources de open banking comme : [Firefly III](https://www.firefly-iii.org/). It seems to use GoCardless and SaltEdge. 
The issue with gocardless, it's that i don't have a solution fror Natixis Interépargne and Lydia. Tricount does not have an account in any case. 
Here is the list of all banks available with GoCardless: [List GoCardless](https://docs.google.com/spreadsheets/d/1EZ5n7QDGaRIot5M86dwqd5UFSGEDTeTRzEq3D9uEDkM/edit?pli=1&gid=976380583#gid=976380583)


##### FAQ

###### How to reauthentificate on my Bank? 
1. Go on the following Website : [GoCardless](https://bankaccountdata.gocardless.com/data/). Connect to your bank. The Bank will be connected for 3 months. 
2. Right click ont the bank iban, open a new tab. 
3. Copy the id at the end of the url as the new account id
Todo: If you want to automatize the process, just go here : [Examples Nordigen](https://github.com/nordigen/nordigen-python/blob/master/example/app.py)


##### API Documentation

Pour accéder à la documentation Swagger de l'API, visitez :
```
http://localhost:8000/docs
```

