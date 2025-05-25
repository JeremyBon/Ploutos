from typing import Annotated

from db import get_db
from fastapi import Depends
from supabase import Client

# Définition du type annoté pour la dépendance
SupabaseClient = Annotated[Client, Depends(lambda: get_db)]
