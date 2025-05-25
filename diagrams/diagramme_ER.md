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

    Credit {
        uuid transactionId PK
        timestamp created_at
        timestamp updated_at
        text description
        date date
        float amount
        uuid accountId FK
        
    }
    Debit {
        uuid id PK
        timestamp created_at
        timestamp updated_at
        uuid creditId FK
        float amount
        uuid accountId FK
    }

    %% Relations entre les tables
    Account_types ||--o{ Accounts : "1-N"
    Accounts ||--o{ Credit : "1-N"
    Accounts ||--o{ Debit : "1-N"
    Credit ||--o{ Debit : "1-N"
