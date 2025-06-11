# Schéma Relationnel de la Base de Données

```mermaid
erDiagram
    Accounts {
        uuid accountId PK
        timestamp created_at
        timestamp updated_at
        text name
        numeric original_amount
        text category
        text sub_category
        bool is_real
    }

    Transactions {
        uuid transactionId PK
        timestamp created_at
        timestamp updated_at
        text description
        timestamp date
        text type
        float amount
        uuid accountId FK
        
    }
    TransactionsSlaves {
        uuid slaveId PK
        timestamp created_at
        timestamp updated_at
        text type
        float amount
        timestamp date
        uuid accountId FK
        uuid masterId FK
    }

    %% Relations entre les tables
    Accounts ||--o{ Transactions : "1-N"
    Accounts ||--o{ TransactionsSlaves : "1-N"
    Transactions ||--o{ TransactionsSlaves : "1-N"
