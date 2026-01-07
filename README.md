# 🥑 VisualFood | Preference Explorer

**VisualFood** is an interactive Visual Analytics system designed to explore nutritional trade-offs. Unlike static food labels or traditional database filters, VisualFood employs a dynamic **Weighted PCA (Principal Component Analysis)** that allows users to define their own metric of "healthy" by assigning subjective weights to various nutrients.

The system projects high-dimensional data (sourced from USDA FoodData Central) into an interactive 2D space, enabling users to discover hidden patterns, debunk marketing myths (e.g., "low-fat" products hidden with sugar), and find food substitutes based on structural nutritional similarity.

---

## 🚀 Key Features

1.  **Preference Tuner (Parallel Coordinates):**
    * Allows users to assign specific weights (0, 0.5, 1) to 15 macro and micro-nutrients.
    * Visualizes the complete nutritional profile of selected products.
    * Supports filtering via axis brushing.

2.  **Similarity Landscape (Dynamic Scatterplot):**
    * Real-time projection updates based on user-defined weights.
    * Semantic clustering (color-coded by category: Plant-based, Animal, Dairy, etc.).
    * "Details-on-demand" interaction via mouse hover and click.

3.  **Detail Panel (Side-by-Side Comparison):**
    * Direct comparison of up to 3 products.
    * Bar chart visualization for each nutrient with "winner" indicators.
    * Highlights critical trade-offs (e.g., Sodium vs. Protein) to facilitate decision-making.

---

## 🛠️ Prerequisites

* **Python 3.8+** installed on your machine.
* A modern web browser (Chrome, Firefox, Edge).

---

## 📦 Installation

1.  **Clone or download the repository:**
    ```bash
    git clone [https://github.com/lpizzi13/VisualFood.git](https://github.com/lpizzi13/VisualFood.git)
    cd VisualFood
    ```

2.  **Create a virtual environment (Optional but recommended):**
    * *Windows:*
        ```bash
        python -m venv venv
        .\venv\Scripts\activate
        ```
    * *Mac/Linux:*
        ```bash
        python3 -m venv venv
        source venv/bin/activate
        ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Verify Data:**
    Ensure the file `cleaned_food.csv` is present in the main project directory.

---

## ▶️ How to Run

The project requires two open terminals: one to run the **Backend** (Python/Flask) and one to serve the **Frontend** (HTML/JS).

### Step 1: Start the Backend Server (API)
Open a terminal in the project folder (ensure your virtual env is active) and run:


```bash
python server.py
```

### Step 2: Start the Frontend
To avoid browser security issues (CORS) when loading local files, use Python's built-in HTTP server.

Open a **second terminal** in the project folder 'frontend' and run:

```bash
python -m http.server 8000
```

### Step 3: Explore
Open your web browser and navigate to: 👉 http://localhost:8000

### 📂 Project Structure
frontend/index.html: Main HTML structure of the interface.

frontend/style.css: CSS styles for the dark mode layout and responsive design.

frontend/main.js: D3.js logic for visualizations (Scatterplot, PCP) and state management.

backend/server.py: Flask Backend that handles the Weighted PCA calculation.
backend/data.py: Code that create the cleanest_food dataset from the USDA zip (ETL operations).

data/cleaned_food.csv: Pre-processed nutritional dataset (Source: USDA).

requirements.txt: List of required Python libraries.