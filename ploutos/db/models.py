from sqlalchemy import (
    JSON,
    Column,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship

# Déclarer la base
Base = declarative_base()


# Table Type_compte
class AccountType(Base):
    __tablename__ = "account_type"
    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String, nullable=False)
    categorie = Column(String, nullable=False)
    sous_type = Column(String)

    accounts = relationship("Account", back_populates="account_type")


# Table Compte
class Account(Base):
    __tablename__ = "account"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    id_type = Column(Integer, ForeignKey("account_type.id"), nullable=False)

    account_type = relationship("AccountType", back_populates="accounts")
    payments = relationship("Payment", back_populates="account")
    debit_transactions = relationship(
        "Transaction", foreign_keys="[Transaction.account_debit_id]"
    )
    credit_transactions = relationship(
        "Transaction", foreign_keys="[Transaction.account_credit_id]"
    )


# Table Paiement
class Payment(Base):
    __tablename__ = "payment"
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False)
    description = Column(String)
    id_account_touched = Column(Integer, ForeignKey("account.id"), nullable=False)
    amount = Column(Float, nullable=False)
    redistribution = Column(JSON)

    account = relationship("Account", back_populates="payments")
    transactions = relationship("Transaction", back_populates="payment")


# Table Transactions
class Transaction(Base):
    __tablename__ = "transaction"
    id = Column(Integer, primary_key=True, autoincrement=True)
    id_payment = Column(Integer, ForeignKey("payment.id"), nullable=False)
    date = Column(Date, nullable=False)
    account_debit_id = Column(Integer, ForeignKey("account.id"), nullable=False)
    account_credit_id = Column(Integer, ForeignKey("account.id"), nullable=False)
    amount = Column(Float, nullable=False)

    payment = relationship("Payment", back_populates="transactions")
