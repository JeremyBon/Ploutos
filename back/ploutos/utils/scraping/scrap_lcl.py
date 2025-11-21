import copy
import os
from os import listdir
from os.path import isfile, join

import pandas as pd
import tabula
from tqdm import tqdm


def scrap_folder(folder_path: str):
    """Retrun all the dataframes from the pdfs in the folder

    Args:
        folder_path (str): path of th LCL folder

    Returns:
        _type_: list of list of dataframes
    """
    onlyfiles = [f for f in tqdm(listdir(folder_path)) if isfile(join(folder_path, f))]
    all_dfs = []
    for file in tqdm(onlyfiles):
        path = os.path.join(folder_path, file)
        dfs = tabula.read_pdf(
            path, stream=True, multiple_tables=True, pages="all", silent=True
        )
        all_dfs.append(dfs)
    return all_dfs


def convert_LCLpdf_to_df(pdf_path: str) -> pd.DataFrame:
    """Convert the LCL pdfs of a folder to a transaction dataframe

    Args:
        pdf_path (str): path of the LCL folder

    Returns:
        pd.DataFrame: Transaction dataframe
    """
    raw_dfs = scrap_folder(pdf_path)
    all_df_clean = []
    for index, dfs in enumerate(raw_dfs):
        dfs_final = []
        try:
            for df in dfs:
                df_clean = clean_df(df)
                if df_clean is not None:
                    dfs_final.append(df_clean)
        except Exception:
            print("Error {} : ".format(index))
        if len(dfs_final) > 0:
            dfs_final = pd.concat(dfs_final, ignore_index=True)
            all_df_clean.append(dfs_final)
    try:
        assert len(all_df_clean) == len(raw_dfs)
    except AssertionError:
        print("Error in the number of dataframes")
        print("before cleaning : ", len(raw_dfs))
        print("after cleaning : ", len(all_df_clean))
        raise
    all_transactions = []
    for index, df in tqdm(enumerate(all_df_clean)):
        df["DEBIT"] = df["DEBIT"].astype(float)
        df["CREDIT"] = df["CREDIT"].astype(float)
        transactions = df.iloc[1:-1]
        all_transactions.append(transactions)
    df = pd.concat(all_transactions, ignore_index=True)
    df["Date"] = pd.to_datetime(df["VALEUR"], dayfirst=True)
    return df


def clean_df(df: pd.DataFrame) -> pd.DataFrame:
    """Clean the raw tabula dataframe

    Args:
        df (pd.DataFrame): Raw tabula dataframe

    Returns:
        pd.DataFrame: Cleaned dataframe or nothing if the dataframe is not a transaction dataframe
    """
    df.columns = df.iloc[0].fillna("x")

    df_final = df[1:].copy()
    if ("ECRITURES DE LA PERIODE" in df.columns) or ("K6EXTP29" in df.columns):
        df_final.columns = df_final.iloc[0].fillna("x")
        df_final = copy.deepcopy(df_final[1:])
    df_final.dropna(axis=1, how="all", inplace=True)
    x_index = 1
    columns = []
    for col in df_final.columns:
        if col in ["DATEK6EXTP25 LIBELLE", "DATE"]:
            columns.append("DATE LIBELLE")
        elif col == "x":
            columns.append(f"x_{x_index}")
            x_index += 1
        else:
            columns.append(col)
    df_final.columns = columns

    if "DATE LIBELLE" in df_final.columns:
        df_final[["Date", "Description"]] = df_final["DATE LIBELLE"].str.split(
            " ", n=1, expand=True
        )
        df_final.drop("DATE LIBELLE", axis=1, inplace=True)
        df_final["Date"] = df_final["Date"].fillna("")
        transactions = df_final["Date"].str.match("^\d+\.\d+[A-Z0-9]+$")
        df_final = df_final[transactions]

        if ("CREDIT" not in df_final.columns) and ("DEBIT" not in df_final.columns):
            df_final.rename(columns={"x_2": "DEBIT", "x_3": "CREDIT"}, inplace=True)
        elif "CREDIT" not in df_final.columns:
            if "x_1" in df_final.columns:
                df_final.rename(columns={"x_1": "CREDIT"}, inplace=True)
            else:
                df_final["CREDIT"] = 0
        elif "DEBIT" not in df_final.columns:
            df_final["DEBIT"] = 0
        df_final["DEBIT"] = convert_to_numeric_with_cleanup(df_final["DEBIT"])
        df_final["CREDIT"] = convert_to_numeric_with_cleanup(df_final["CREDIT"])
        df_final.fillna({"VALEUR": 0, "DEBIT": 0, "CREDIT": 0}, inplace=True)

        return df_final[["Date", "Description", "VALEUR", "DEBIT", "CREDIT"]]


def convert_to_numeric_with_cleanup(column):
    # Convertit potentiellement la colonne en chaîne de caractères pour le traitement
    column = column.apply(
        lambda x: (
            str(x).replace(",", ".").replace(" ", "") if isinstance(x, str) else x
        )
    )

    # Remplace les points seuls par zéro (pour les chaînes déjà converties en haut)
    column = column.replace(".", 0)

    # Convertit en numérique, en forçant les non-numériques à NaN puis remplaçant par 0
    column = pd.to_numeric(column, errors="coerce")

    return column
