import os
from enum import Enum

from dotenv import load_dotenv
from nordigen import NordigenClient
from nordigen.api import AccountApi
from pydantic import BaseModel

load_dotenv()


class BANK(Enum):
    REVOLUT = "REVOLUT"
    LCL = "LCL"


client = NordigenClient(
    secret_id=os.getenv("NORDIGEN_SECRET_ID"),
    secret_key=os.getenv("NORDIGEN_SECRET_KEY"),
)
token_data = client.generate_token()
