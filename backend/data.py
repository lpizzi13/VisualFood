import os, zipfile
import pandas as pd
import numpy as np
from flask import Flask, render_template, jsonify
from kagglehub import KaggleDatasetAdapter
import kagglehub
import glob
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

DATA_FOLDER = "data"
FINAL_FILENAME = "food_merged.csv"
FINAL_PATH = os.path.join(DATA_FOLDER, FINAL_FILENAME)
ZIP_PATH = "data/FoodData_Central_survey_food_csv_2024-10-31.zip"

NUTRIENT_NBR_MAP = {
    "Caloric Value": 208,            # Energy (kcal)
    "Protein": 203,                  # Protein
    "Total Fat": 204,                # Total lipid (fat)
    "Saturated Fats": 606,           # Fatty acids, total saturated
    "Carbohydrates": 205,            # Carbohydrate, by difference
    "Sugars": 269,                   # Total Sugars
    "Dietary Fiber": 291,            # Fiber, total dietary
    "Cholesterol": 601,              # Cholesterol
    "Sodium": 307,                   # Sodium, Na
    "Water": 255,                    # Water
    "Magnesium": 304,                # Magnesium, Mg
    "Potassium": 306,                # Potassium, K
    "Iron": 303,                     # Iron, Fe
    "Calcium": 301,                  # Calcium, Ca
    "Vitamin C": 401                 # Vitamin C (Ascorbic acid)
}

# Output columns (ordine finale)
OUTPUT_COLUMNS = [
    "id", "food", "category",
    "num_ingredients", "dominant_share",
    "ingredients",  # ⬅️ nuovo

    "Caloric Value",
    "Protein",
    "Total Fat",
    "Saturated Fats",
    "Carbohydrates",
    "Sugars",
    "Dietary Fiber",
    "Cholesterol",
    "Sodium",
    "Water",
    "Magnesium",
    "Potassium",
    "Iron",
    "Calcium",
    "Vitamin C"
]

def find_member_exact_basename(zf: zipfile.ZipFile, filename: str) -> str:
    """
    Trova nello zip il file con basename ESATTO uguale a filename,
    evitando collisioni tipo input_food.csv.
    """
    matches = [n for n in zf.namelist() if os.path.basename(n).lower() == filename.lower()]
    if not matches:
        raise FileNotFoundError(f"Non trovo '{filename}' dentro lo zip.")
    matches.sort(key=len)
    return matches[0]


def create_dataset(zip_path: str, out_csv: str):
    with zipfile.ZipFile(zip_path) as zf:
        food_path = find_member_exact_basename(zf, "food.csv")
        food_nutr_path = find_member_exact_basename(zf, "food_nutrient.csv")

        # WWEIA classification files
        survey_path = find_member_exact_basename(zf, "survey_fndds_food.csv")
        wweia_path = find_member_exact_basename(zf, "wweia_food_category.csv")

        # composizione/ingredienti
        input_food_path = find_member_exact_basename(zf, "input_food.csv")

        # 1) Food name: food.csv.description
        with zf.open(food_path) as f:
            food_df = pd.read_csv(
                f,
                usecols=["fdc_id", "description"],
                dtype={"fdc_id": "int64"},
            )
        food_df = food_df.rename(columns={"fdc_id": "id", "description": "food"})

        # 2) Category mapping: fdc_id -> wweia_category_number
        with zf.open(survey_path) as f:
            survey = pd.read_csv(
                f,
                usecols=["fdc_id", "wweia_category_number"],
                dtype={"fdc_id": "int64", "wweia_category_number": "int64"},
            ).rename(columns={"fdc_id": "id"})

        # 3) Category dictionary: wweia_category_number -> description
        with zf.open(wweia_path) as f:
            wweia = pd.read_csv(f)

        wweia = wweia.rename(columns={
            "wweia_food_category": "wweia_category_number",
            "wweia_food_category_description": "category",
        })[["wweia_category_number", "category"]]

        category_df = survey.merge(wweia, on="wweia_category_number", how="left")[["id", "category"]]

        # 3b) Composizione: num_ingredients, dominant_share, ingredients (top3)
        with zf.open(input_food_path) as f:
            inp = pd.read_csv(
                f,
                usecols=["fdc_id", "gram_weight", "sr_description"],  # ⬅️ aggiunto sr_description
                dtype={"fdc_id": "int64"},
            )

        inp["gram_weight"] = pd.to_numeric(inp["gram_weight"], errors="coerce")
        inp["sr_description"] = inp["sr_description"].astype(str).fillna("").str.strip()

        # num_ingredients: conteggio righe ingredienti per food (anche se gram_weight manca)
        num_ingredients = inp.groupby("fdc_id").size().rename("num_ingredients")

        # per share usiamo solo righe con peso valido
        inp_valid = inp.dropna(subset=["gram_weight"]).copy()

        totals = inp_valid.groupby("fdc_id")["gram_weight"].sum().rename("total_weight")
        dominant = inp_valid.groupby("fdc_id")["gram_weight"].max().rename("dominant_weight")
        dominant_share = (dominant / totals).rename("dominant_share")

        # top3 ingredienti (ordinati per peso desc)
        inp_valid = inp_valid.sort_values(["fdc_id", "gram_weight"], ascending=[True, False])
        top3 = inp_valid.groupby("fdc_id").head(3).copy()
        top3 = top3.merge(totals.reset_index(), on="fdc_id", how="left")
        top3["share"] = np.where(top3["total_weight"] > 0, top3["gram_weight"] / top3["total_weight"], 0.0)

        # format: "Name (91%)"
        top3["ingredient_fmt"] = (
            top3["sr_description"] +
            " (" + (top3["share"] * 100).round(0).astype(int).astype(str) + "%)"
        )
        ingredients_str = top3.groupby("fdc_id")["ingredient_fmt"].apply(lambda s: "; ".join(s)).rename("ingredients")

        composition_df = (
            pd.concat([num_ingredients, dominant_share, ingredients_str], axis=1)
              .reset_index()
              .rename(columns={"fdc_id": "id"})
        )

        # fallback: se manca, metti 0/"" così slider=0 mostra tutto
        composition_df["num_ingredients"] = composition_df["num_ingredients"].fillna(0).astype(int)
        composition_df["dominant_share"] = composition_df["dominant_share"].fillna(0.0).astype(float)
        composition_df["ingredients"] = composition_df["ingredients"].fillna("").astype(str)

        # 4) Nutrienti selezionati (amount è già per 100g)
        with zf.open(food_nutr_path) as f:
            fn = pd.read_csv(
                f,
                usecols=["fdc_id", "nutrient_id", "amount"],
                dtype={"fdc_id": "int64", "nutrient_id": "int64"},
            )

        wanted = set(NUTRIENT_NBR_MAP.values())
        fn = fn[fn["nutrient_id"].isin(wanted)].copy()

        wide = (
            fn.pivot_table(
                index="fdc_id",
                columns="nutrient_id",
                values="amount",
                aggfunc="first",
            )
            .reset_index()
            .rename(columns={"fdc_id": "id"})
        )

        rename_map = {nbr: colname for colname, nbr in NUTRIENT_NBR_MAP.items()}
        wide = wide.rename(columns=rename_map)

        # 5) Join finale: food + category + composition + nutrienti
        out = food_df.merge(category_df, on="id", how="left")
        out = out.merge(composition_df, on="id", how="left")
        out = out.merge(wide, on="id", how="left")

        # Garantisco tutte le colonne e ordine
        for c in OUTPUT_COLUMNS:
            if c not in out.columns:
                out[c] = np.nan
        out = out[OUTPUT_COLUMNS]

        out.to_csv(out_csv, index=False, encoding="utf-8")

    print(f"Creato: {out_csv}")
    print(f"Righe: {len(out)} | Colonne: {len(out.columns)}")
    print("Esempi categorie (non-null):", out["category"].dropna().unique()[:10])
    print("dominant_share stats:", out["dominant_share"].describe().to_string())
    print("num_ingredients stats:", out["num_ingredients"].describe().to_string())
    print("Esempi ingredients:", out["ingredients"].replace("", np.nan).dropna().head(5).tolist())


INPUT_FILE = "data/food_merged.csv"
OUTPUT_FILE = "data/cleaned_food.csv"

NUMERICAL_COLS = [
    "Caloric Value",
    "Protein",
    "Total Fat",
    "Saturated Fats",
    "Carbohydrates",
    "Sugars",
    "Dietary Fiber",
    "Cholesterol",
    "Sodium",
    "Water",
    "Magnesium",
    "Potassium",
    "Iron",
    "Calcium",
    "Vitamin C"
]

def preprocess_data():
    print(f"🔄 Caricamento dati da {INPUT_FILE}...")
    df = pd.read_csv(INPUT_FILE)

    # 1. Selezione Colonne (aggiungo anche ingredients)
    cols_to_keep = ['food', 'category', 'num_ingredients', 'dominant_share', 'ingredients'] + NUMERICAL_COLS
    cols_to_keep = [c for c in cols_to_keep if c in df.columns]
    df_clean = df[cols_to_keep].copy()

    initial_rows = len(df_clean)

    # 2. RIMUZIONE BASE (NaN e Duplicati)
    df_clean = df_clean.dropna(subset=['food'])
    df_clean = df_clean.drop_duplicates(subset=['food'])

    key_nutrients = ['Caloric Value', 'Protein', 'Total Fat', 'Carbohydrates']
    df_clean = df_clean.dropna(subset=[c for c in key_nutrients if c in df_clean.columns])

    print(f"📉 Righe dopo pulizia base: {len(df_clean)}")

    # 3. FILTRI DI COERENZA

    if 'Caloric Value' in df_clean.columns:
        df_clean = df_clean[df_clean['Caloric Value'] < 1000]

    for nutrient in ['Total Fat', 'Carbohydrates', 'Protein', 'Sugars']:
        if nutrient in df_clean.columns:
            df_clean = df_clean[df_clean[nutrient] <= 100]

    if all(x in df_clean.columns for x in ['Total Fat', 'Carbohydrates', 'Protein']):
        df_clean['total_macro'] = df_clean['Total Fat'] + df_clean['Carbohydrates'] + df_clean['Protein']
        df_clean = df_clean[df_clean['total_macro'] <= 105]
        df_clean = df_clean.drop(columns=['total_macro'])

    print(f"🧹 Righe dopo rimozione OUTLIERS: {len(df_clean)} (Rimossi {initial_rows - len(df_clean)} prodotti spazzatura)")

    # 4. Normalizzazione (Z-Score)
    scaler = StandardScaler()
    numeric_present = [c for c in NUMERICAL_COLS if c in df_clean.columns]

    normalized_data = scaler.fit_transform(df_clean[numeric_present])

    norm_col_names = [f"{c}_norm" for c in numeric_present]
    df_norm = pd.DataFrame(normalized_data, columns=norm_col_names, index=df_clean.index)

    df_final = pd.concat([df_clean, df_norm], axis=1)

    # ID Univoco (NOTA: questo id non è più l'fdc_id, è solo un progressivo del cleaned)
    df_final.insert(0, 'id', range(1, len(df_final) + 1))

    df_final.to_csv(OUTPUT_FILE, index=False)
    print(f"✅ Dataset pulito salvato in: {OUTPUT_FILE}")


if __name__ == "__main__":
    # 1) genera food_merged.csv dallo zip
    create_dataset(ZIP_PATH, FINAL_PATH)

    # 2) pulizia + normalizzazione
    preprocess_data()
