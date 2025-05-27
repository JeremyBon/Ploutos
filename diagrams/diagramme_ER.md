# Schéma Relationnel de la Base de Données

```mermaid
erDiagram
    Account_types {
        uuid id PK
        timestamp created_at
        timestamp updated_at
        bool is_real
        text category
        text sub_category
    }

    Accounts {
        uuid accountId PK
        timestamp created_at
        timestamp updated_at
        text name
        uuid account_type FK
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
    Account_types ||--o{ Accounts : "1-N"
    Accounts ||--o{ Transactions : "1-N"
    Accounts ||--o{ TransactionsSlaves : "1-N"
    Transactions ||--o{ TransactionsSlaves : "1-N"
