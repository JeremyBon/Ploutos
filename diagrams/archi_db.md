# Architecture de la Base de Données

```mermaid
erDiagram
    Accounts {
        uuid accountId PK
        timestamptz created_at
        timestamp updated_at
        text name
        numeric original_amount
        text category
        text sub_category
        bool is_real
    }

    Transactions {
        uuid transactionId PK
        timestamptz created_at
        timestamp updated_at
        text description
        timestamp date
        text type
        numeric amount
        uuid accountId FK
    }

    TransactionsSlaves {
        uuid slaveId PK
        timestamptz created_at
        timestamp updated_at
        text type
        float8 amount
        timestamp date
        uuid accountId FK
        uuid masterId FK
    }

    AccountSecrets {
        int8 id PK
        timestamptz updated_at
        uuid accountId FK
        text secretId
        text bankId
    }

    RejectedTransferPairs {
        uuid pair_id PK
        uuid transaction_id_1 FK
        uuid transaction_id_2 FK
        timestamp rejected_at
        text rejected_reason
    }

    %% Relations entre les tables
    Accounts ||--o{ Transactions : "has"
    Accounts ||--o{ TransactionsSlaves : "has"
    Accounts ||--o{ AccountSecrets : "has"
    Transactions ||--o{ TransactionsSlaves : "master_of"
    Transactions ||--o{ RejectedTransferPairs : "rejected_transfer_1"
    Transactions ||--o{ RejectedTransferPairs : "rejected_transfer_2"
```

## Description des Tables

### Accounts
Table principale contenant les comptes bancaires et budgets.
- **accountId**: Identifiant unique du compte
- **name**: Nom du compte
- **original_amount**: Montant initial
- **category**: Catégorie du compte
- **sub_category**: Sous-catégorie
- **is_real**: Indique si c'est un vrai compte bancaire ou un budget virtuel

### Transactions
Table des transactions principales.
- **transactionId**: Identifiant unique de la transaction
- **description**: Description de la transaction
- **date**: Date de la transaction
- **type**: Type de transaction
- **amount**: Montant (numeric pour précision)
- **accountId**: Référence vers le compte

### TransactionsSlaves
Table des transactions esclaves (transactions liées/dépendantes).
- **slaveId**: Identifiant unique de la transaction esclave
- **type**: Type de transaction
- **amount**: Montant (float8)
- **date**: Date de la transaction
- **accountId**: Référence vers le compte
- **masterId**: Référence vers la transaction maître

### AccountSecrets
Table contenant les secrets/credentials pour les comptes bancaires.
- **id**: Identifiant unique
- **accountId**: Référence vers le compte
- **secretId**: Identifiant du secret
- **bankId**: Identifiant de la banque

### RejectedTransferPairs
Table des paires de transactions de transfert rejetées.
- **pair_id**: Identifiant unique de la paire
- **transaction_id_1**: Première transaction du transfert
- **transaction_id_2**: Seconde transaction du transfert
- **rejected_at**: Date du rejet
- **rejected_reason**: Raison du rejet
