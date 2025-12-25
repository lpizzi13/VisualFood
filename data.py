import os
import pandas as pd
import numpy as np
from flask import Flask, render_template, jsonify
from kagglehub import KaggleDatasetAdapter
import kagglehub
import glob
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

KAGGLE_HANDLE = "utsavdey1410/food-nutrition-dataset"
DATA_FOLDER = "data"
FINAL_FILENAME = "merged_food_data.csv"
FINAL_PATH = os.path.join(DATA_FOLDER, FINAL_FILENAME)

def download_data():
    os.makedirs(DATA_FOLDER, exist_ok=True)

    if os.path.exists(FINAL_PATH):
        print("Dati già presenti in locale. Salto il download.")
        return pd.read_csv(FINAL_PATH)

    print(f"⬇️ Avvio download da Kaggle: {KAGGLE_HANDLE}...")

    path = kagglehub.dataset_download(KAGGLE_HANDLE)

    all_files = glob.glob(os.path.join(path, "**", "*.csv"), recursive=True)
    
    if not all_files:
        raise FileNotFoundError("❌ Nessun file CSV trovato nel dataset scaricato.")

    print(f"item trovati: {len(all_files)} file CSV. Procedo all'unione...")
    df_list = []
    for filename in all_files:
        df_temp = pd.read_csv(filename)
        df_list.append(df_temp)

    if not df_list:
        raise ValueError("❌ I file CSV sono vuoti.")
    
    # Concatenazione
    full_df = pd.concat(df_list, ignore_index=True)

    # 5. Creazione cartella locale e salvataggio
    os.makedirs(DATA_FOLDER, exist_ok=True)
    full_df.to_csv(FINAL_PATH, index=False)
    
    print(f"✅ Unione completata. Dataset salvato in: {FINAL_PATH}")
    print(f"📊 Dimensioni dataset: {full_df.shape}")

    return full_df

INPUT_FILE = "data/merged_food_data.csv"
OUTPUT_FILE = "data/cleaned_food.csv"

NUMERICAL_COLS = [
    'Caloric Value', 'Fat', 'Saturated Fats', 'Monounsaturated Fats', 'Polyunsaturated Fats',
    'Carbohydrates', 'Sugars', 'Protein', 'Dietary Fiber', 'Cholesterol', 'Sodium', 'Water',
    'Vitamin A', 'Vitamin B1', 'Vitamin B11', 'Vitamin B12', 'Vitamin B2', 'Vitamin B3',
    'Vitamin B5', 'Vitamin B6', 'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K',
    'Calcium', 'Copper', 'Iron', 'Magnesium', 'Manganese', 'Phosphorus', 'Potassium',
    'Selenium', 'Zinc', 'Nutrition Density'
]

def preprocess_data():
    print(f"🔄 Caricamento dati da {INPUT_FILE}...")
    df = pd.read_csv(INPUT_FILE)
    
    # 1. Selezione Colonne
    cols_to_keep = ['food'] + NUMERICAL_COLS
    
    # Verifica che le colonne esistano tutte
    missing_cols = [c for c in cols_to_keep if c not in df.columns]
    if missing_cols:
        print(f"⚠️ Attenzione: colonne mancanti nel CSV originale: {missing_cols}")
        cols_to_keep = [c for c in cols_to_keep if c in df.columns]
        
    df_clean = df[cols_to_keep].copy()
    
    # 2. Pulizia Righe
    initial_rows = len(df_clean)
    df_clean = df_clean.dropna(subset=['food'])
    # Rimuove righe dove TUTTI i nutrienti sono mancanti o dove ci sono NaN critici
    df_clean = df_clean.dropna(subset=[c for c in cols_to_keep if c != 'food'])
    df_clean = df_clean.drop_duplicates(subset=['food'])
    
    print(f"🧹 Pulizia completata: {initial_rows} -> {len(df_clean)} righe rimaste.")

    # 3. Normalizzazione (Z-Score)
    scaler = StandardScaler()
    numeric_present = [c for c in NUMERICAL_COLS if c in df_clean.columns]
    
    normalized_data = scaler.fit_transform(df_clean[numeric_present])
    
    # Creiamo colonne normalizzate con suffisso "_norm"
    norm_col_names = [f"{c}_norm" for c in numeric_present]
    df_norm = pd.DataFrame(normalized_data, columns=norm_col_names, index=df_clean.index)
    
    # Uniamo dati originali (per tooltip) e normalizzati (per calcoli)
    df_final = pd.concat([df_clean, df_norm], axis=1)
    
    # 4. Aggiunta ID univoco per D3
    df_final.insert(0, 'id', range(1, len(df_final) + 1))
    
    # Salvataggio
    df_final.to_csv(OUTPUT_FILE, index=False)
    print(f"✅ Dataset processato salvato in: {OUTPUT_FILE}")
    print(f"📊 AS Index finale: {len(df_final)} tuple x {len(numeric_present)} dimensioni = {len(df_final)*len(numeric_present)}")

if __name__ == "__main__":
    preprocess_data()