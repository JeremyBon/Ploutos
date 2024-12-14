# Schéma Relationnel de la Base de Données

```mermaid
erDiagram
    Type_compte {
        int id PK
        string type
        string categorie
        string sous_type
    }

    Compte {
        int id PK
        string name
        int id_type FK
    }

    Paiement {
        int id PK
        date date
        string description
        int id_account_touche FK
        float montant
        json redistribution
    }

    Transactions {
        int id PK
        int id_paiement FK
        date date
        int account_debit_id FK
        int account_credit_id FK
        float amount
    }

    %% Relations entre les tables
    Type_compte ||--o| Compte : "1-N"
    Compte ||--o| Paiement : "1-N"
    Compte ||--o| Transactions : "1-N"
    Paiement ||--o| Transactions : "1-N"
