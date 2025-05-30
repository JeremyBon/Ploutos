import os
from enum import Enum
from typing import Optional
from uuid import uuid4

import pandas as pd
from dotenv import load_dotenv
from nordigen import NordigenClient
from nordigen.api import AccountApi

load_dotenv()


class Bank(Enum):
    REVOLUT = "REVOLUT"
    LCL = "LCL"


TRANSACTION_COL = {Bank.LCL: {"Date": "Date"}}


client = NordigenClient(
    secret_id=os.getenv("NORDIGEN_SECRET_ID"),
    secret_key=os.getenv("NORDIGEN_SECRET_KEY"),
)


def connect_to_bank(account_name: Bank):
    requisition_id = client.initialize_session(
        # institution id
        institution_id=os.getenv(f"{account_name.value}_BANK_ID"),
        # redirect url after successful authentication
        redirect_uri="https://gocardless.com",
        # additional layer of unique ID defined by you
        reference_id=str(uuid4()),
    ).requisition_id
    accounts = client.requisition.get_requisition_by_id(requisition_id=requisition_id)
    return accounts['link']


class BankApi:
    api: AccountApi
    """
    Class to interact with the Nordigen API for a specific account.
    """

    def __init__(self, account_name: Bank):
        print(account_name, type(account_name), isinstance(account_name, Bank))
        if not isinstance(account_name, Bank):
            raise ValueError(
                f"account_name must be a BANK enum value, got {type(account_name)}"
            )
        self.account_name = account_name.value
        token_data = client.generate_token()
        self.api = client.account_api(id=os.getenv(f"{account_name.value}_ACCOUNT_ID"))
        try:
            metadata = self.api.get_metadata()
            if metadata['status'] != 'READY':
                print(f"Account {account_name} is not enabled")
                print(connect_to_bank(account_name))
                raise ValueError(f"Account {account_name} is not enabled")

            print(f"Successfully connected to {account_name}")
        except Exception as e:
            print(f"Error getting metadata for {account_name}: {e}")
            raise e

    def __getattr__(self, name):
        """
        Delegate any unknown attribute/method calls directly to the underlying api object.
        This allows direct access to the Nordigen API methods through this class.
        """
        return getattr(self.api, name)

    def get_balance(self):
        balances = self.api.get_balances()['balances']
        if len(balances) < 1:
            raise ValueError(f"No balance found for {self.account_name}")
        if len(balances) > 1:
            print(balances)
            for balance in balances:
                if "closingBooked" in balance["balanceType"]:
                    return balance["balanceAmount"]["amount"]
            raise ValueError(f"Multiple balances found for {self.account_name}")
        return balances[0]['balanceAmount']['amount']

    def get_transactions(
        self,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        raw: bool = False,
    ):
        transactions = self.api.get_transactions(date_from=date_from, date_to=date_to)
        if not raw:
            transactions = transactions_to_df(transactions['transactions'])
        return transactions


def transactions_to_df(transactions):
    """Processthe result of get_transactions"""
    if len(transactions["booked"]) > 0:
        df_transactions_booked = process(transactions["booked"])
        df_transactions_booked["Type"] = "Booked"
    if len(transactions["pending"]) > 0:
        df_transactions_pending = process(transactions["pending"])
        df_transactions_pending["Type"] = "Pending"
    if len(transactions["booked"]) > 0 and len(transactions["pending"]) > 0:
        df_transactions = pd.concat([df_transactions_booked, df_transactions_pending])
    elif len(transactions["booked"]) > 0:
        df_transactions = df_transactions_booked
    elif len(transactions["pending"]) > 0:
        df_transactions = df_transactions_pending
    else:
        df_transactions = pd.DataFrame()
    return df_transactions


def process(transactions: dict):
    df_transactions = pd.DataFrame(transactions)
    df_transactions.rename(
        columns={
            "bookingDate": "Date",
            "valueDate": "Date valeur",
            "transactionAmount": "Montant_dict",
            "amount": "Montant",
            "remittanceInformationUnstructuredArray": "Description",
        },
        inplace=True,
    )
    df_transactions["Montant"] = df_transactions["Montant_dict"].apply(check_currency)
    df_transactions["Date"] = pd.to_datetime(df_transactions["Date"], format="%Y-%m-%d")
    if "Date valeur" in df_transactions.columns:
        df_transactions["Date valeur"] = pd.to_datetime(
            df_transactions["Date valeur"], format="%Y-%m-%d"
        )
        if not df_transactions["Date"].equals(df_transactions["Date valeur"]):
            print("Date and Date valeur are not the same")
    if int(df_transactions['Description'].apply(len).max()) > 1:
        print("Error with length of description (Max length is greater than 1)")
    if int(df_transactions['Description'].apply(len).min()) == 0:
        print("Error with length of description (Min length is 0)")
    df_transactions["Description"] = df_transactions["Description"].apply(
        lambda x: ", ".join(x)
    )
    return df_transactions


def check_currency(Montant_dict: dict):
    if Montant_dict["currency"] != "EUR":
        print(f"Currency {Montant_dict['currency']} is not EUR")
        raise ValueError(f"Currency {Montant_dict['currency']} is not EUR")
    else:
        return float(Montant_dict["amount"])
