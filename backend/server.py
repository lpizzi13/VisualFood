import os
from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from flask import Flask, render_template, jsonify
from kagglehub import KaggleDatasetAdapter
import kagglehub
import glob
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler


app = Flask(__name__)
CORS(app)

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

@app.route('/api/metadata', methods=['GET'])
def get_metadata():
    """Restituisce l'elenco delle features disponibili e un campione di dati grezzi."""
    # Inviamo i nomi delle colonne per generare gli slider nel frontend
    return jsonify({
        "features": feature_columns,
        "count": len(df),
        # Inviamo tutto il dataset grezzo (senza _norm) al frontend per i tooltip e i dettagli
        # Nota: rimuoviamo le colonne _norm per risparmiare banda verso il browser
        "data": df.drop(columns=[c for c in df.columns if c.endswith('_norm')]).to_dict(orient='records')
    })
    
@app.route('/api/projection', methods=['POST'])
def get_weighted_projection():
    """
    Riceve un dizionario di pesi { 'Protein': 1.0, 'Sugar': 0.0, ... }
    Calcola la PCA pesata e restituisce coordinate X, Y aggiornate.
    """
    weights_dict = request.json.get('weights', {})
    
    # 1. Costruzione vettore pesi allineato con le colonne
    # Default peso 1.0 se non specificato
    w_vector = np.array([float(weights_dict.get(feat, 1.0)) for feat in feature_columns])
    
    # 2. Applicazione Pesi (Weighted PCA Trick)
    # Moltiplichiamo le features per sqrt(peso). 
    # Teoria: PCA massimizza la varianza. Scalando i dati, alteriamo la varianza 
    # artificialmente in base all'importanza utente.
    # W_matrix = X * diag(sqrt(w))
    weighted_data = df_numeric_norm * np.sqrt(w_vector)
    
    # 3. Esecuzione PCA (riduzione a 2D)
    pca = PCA(n_components=2)
    coords = pca.fit_transform(weighted_data)
    
    # 4. Risposta
    result = []
    for i, _id in enumerate(ids):
        result.append({
            "id": int(_id),
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1])
        })
        
    # Restituiamo anche la "Explained Variance" per mostrare quanto fedele è la proiezione
    variance_ratio = float(np.sum(pca.explained_variance_ratio_))
    
    return jsonify({
        "projection": result,
        "explained_variance": variance_ratio
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)