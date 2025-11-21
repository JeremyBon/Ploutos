# PLOUTOS
This is ploutos


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

## Code Quality

**Setup:**
```bash
pip install ruff pre-commit
pre-commit install
```

**Checks:**
- Backend: `ruff check back/`
- Frontend: `cd front && npm run lint && npm run format:check`
- Pre-commit: Ruff (Python) + Prettier (JS/TS)
- CI: Checks automatiques sur chaque push

##### Commit
Commit message: Please use [Conventionnal Commits](https://www.conventionalcommits.org/en/v1.0.0/)


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

