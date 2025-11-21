from typing import Annotated
from fastapi import Depends
from supabase import Client


def get_db_dependency():
    """Fonction de dépendance pour récupérer le client DB.

    Cette fonction importe get_db à chaque appel, ce qui permet
    de mocker get_db dans les tests.
    """
    from ploutos.db import get_db

    return get_db


# Définition du type annoté pour la dépendance
SessionDep = Annotated[Client, Depends(get_db_dependency)]
