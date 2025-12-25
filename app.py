import os
import pandas as pd
import numpy as np
from flask import Flask, render_template, jsonify
from kagglehub import KaggleDatasetAdapter
import kagglehub
import glob
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from data import download_data


app = Flask(__name__)

DATA_PATH = "data/cleaned_food.csv"

df = None
df_numeric_norm = None
feature_columns = []
ids = []

def load_data():
    global df, df_numeric_norm, feature_columns, ids
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"❌ File non trovato: {DATA_PATH}. Esegui prima preprocessing.py!")
    
    print("🔄 Caricamento dataset in memoria...")
    df = pd.read_csv(DATA_PATH)
    
    # Identifichiamo le colonne normalizzate (quelle che finiscono con _norm)
    norm_cols = [c for c in df.columns if c.endswith('_norm')]
    
    # Salviamo la matrice numpy per i calcoli veloci
    df_numeric_norm = df[norm_cols].values
    ids = df['id'].values
    
    # Nomi delle features "puliti" (senza _norm) per mapparli ai pesi del frontend
    feature_columns = [c.replace('_norm', '') for c in norm_cols]
    
    print(f"✅ Dati caricati. {len(df)} prodotti, {len(feature_columns)} features usabili per PCA.")

# Carichiamo i dati all'avvio del server
load_data()

    

data_cache = load_data()

@app.route('/')
def index(): return render_template('index.html')

@app.route('/api/data')
def get_data(): return jsonify(data_cache)

if __name__ == '__main__': #app.run(debug=True, port=5000)
    load_data()