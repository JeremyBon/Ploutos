def extract_nested_field(data, nested_key, field_key, new_key=None):
    """
    Extrait un champ d'un objet imbriqué et le place au niveau racine

    Args:
        data: Liste des données
        nested_key: Clé de l'objet imbriqué (ex: 'Accounts')
        field_key: Clé du champ à extraire (ex: 'name')
        new_key: Nouveau nom pour le champ (optionnel)
    """
    if new_key is None:
        new_key = field_key

    for item in data:
        if nested_key in item and item[nested_key]:
            item[new_key] = item[nested_key].get(field_key, '')
            del item[nested_key]

    return data
