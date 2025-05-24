# PLOUTOS
This is ploutos


## Installation

- Next.js: Run following command or go on Next.js [installation](https://nextjs.org/docs/app/getting-started/installation).
    ```bash
    npx create-next-app@latest
    ```


##### Commit
Commit message: Please use [Conventionnal Commits](https://www.conventionalcommits.org/en/v1.0.0/)


#### Bank Aggregator

We use GoCradless to get the bank account data. It has a free tier and a lot of Bak Integratiob 
Other options are Plaid, Tink.io, powens.com, saltedge.
GoCardless is the best option for now as it is widely used and got a good free tier. ([Reddit Discussion](https://www.reddit.com/r/vosfinances/comments/1f3zw6j/liste_des_transactions_via_api_open_banking/)) 
PAr ailleurs, il existe d'autres projets open sources de open banking comme : [Firefly III](https://www.firefly-iii.org/). It seems to use GoCardless and SaltEdge. 
The issue with gocardless, it's that i don't have a solution fror Natixis Interépargne and Lydia. Tricount does not have an account in any case. 


##### FAQ

###### How to reauthentificate on my Bank? 
1. Go on the following Website : [GoCardless](https://bankaccountdata.gocardless.com/data/). Connect to your bank. The Bank will be connected for 3 months. 
2. Right click ont the bank iban, open a new tab. 
3. Copy the id at the end of the url as the new account id
Todo: If you want to automatize the process, just go here : [Examples Nordigen](https://github.com/nordigen/nordigen-python/blob/master/example/app.py)

