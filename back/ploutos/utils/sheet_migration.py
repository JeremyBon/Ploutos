import os

import pandas as pd
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import Resource, build

load_dotenv()

CATEG = {
    "Paiement": {
        "name": "DB Paiement",
        "drop_columns": [
            "Montant réel",
            "Début",
            "Fin",
            "Landing",
            "Budget",
            "Mois restant",
            "Echeances restantes",
        ],
    },
    "Bénéfices": {"name": "DB Bénéfices", "drop_columns": []},
    "Transfert": {"name": "DB Transfert", "drop_columns": []},
}


class SheetMigration:
    service: Resource
    spreadsheet_id: str

    def __init__(self):
        scope = ["https://www.googleapis.com/auth/spreadsheets"]
        credentials = Credentials.from_service_account_file(
            filename=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
            scopes=scope,
        )
        self.service = build("sheets", "v4", credentials=credentials)
        self.spreadsheet_id = os.getenv("SPREADSHEET_ID")
        self.account_list = self._get_account_list()

    def _get_account_list(self):
        data = self.get_range("Paramètres", "I1:K25")
        df_account = pd.DataFrame(data[1:], columns=data[0])
        df_account = df_account[
            (df_account["Compte"] != "") & ~df_account["Compte"].isna()
        ]
        df_account["Fin Janvier 2023"] = df_account["Fin Janvier 2023"].apply(
            lambda x: float(x.replace(",", ".") if x != "" else 0)
        )
        return df_account

    def get_range(self, tab, range, valueRenderOption="FORMATTED_VALUE"):
        result = (
            self.service.spreadsheets()
            .values()
            .get(
                spreadsheetId=self.spreadsheet_id,
                range=f"{tab}!{range}",
                valueRenderOption=valueRenderOption,
            )
            .execute()
        )
        return result.get("values", [])

    def analyse_data(self, df: pd.DataFrame):
        print(f"Date min: {df['Date'].min()}")
        print(f"Date max: {df['Date'].max()}")
        print(f"Nombre de lignes: {len(df)}")

    def clean_data(self, df, drop_columns):
        df = df[~(df["Date"] == "") & ~(df["Date"].isna())]
        df["Date"] = pd.to_datetime(df["Date"], format="%d/%m/%Y")
        df = df.drop(columns=drop_columns)
        df["Montant"] = df["Montant"].apply(
            lambda x: float(
                x.replace("€", "")
                .replace(",", ".")
                .replace(" ", "")
                .replace("\u202f", "")
            )
        )
        return df

    def get_data(self, categ):
        data = self.get_range(CATEG[categ]["name"], "A1:R3000")
        df_paiement = pd.DataFrame(data[1:], columns=data[0])
        drop_columns = CATEG[categ]["drop_columns"]
        df_paiement = self.clean_data(df_paiement, drop_columns)
        self.analyse_data(df_paiement)
        return df_paiement
