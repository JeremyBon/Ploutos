from settings import get_settings
from supabase import Client, create_client

# Initialisation du client Supabase
settings = get_settings()
get_db: Client = create_client(settings.supabase_url, settings.supabase_key)

# Export du client pour qu'il soit accessible via `from ploutos.db import client`
__all__ = ['get_db']
