def extract_nested_field(
    data: list, nested_key: str, field_keys: list, new_keys: list = None
):
    """
    Extrait des champs d'un objet imbriqué et les place au niveau racine

    Args:
        data: Liste des données
        nested_key: Clé de l'objet imbriqué (ex: 'Accounts')
        field_keys: Liste des clés des champs à extraire (ex: ['name', 'type'])
        new_key: Liste des nouveaux noms pour les champs (optionnel)
    """
    for item in data:
        if nested_key in item and item[nested_key]:
            for i, field_key in enumerate(field_keys):
                if new_keys:
                    item[new_keys[i]] = item[nested_key].get(field_key, '')
                else:
                    item[field_key] = item[nested_key].get(field_key, '')
            del item[nested_key]

    return data
