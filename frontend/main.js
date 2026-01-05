// Configurazione
const API_URL = "http://127.0.0.1:5000/api";
// Margini aumentati in alto per ospitare etichette e slider
let MARGIN_PARALLEL = { top: 80, right: 30, bottom: 20, left: 60 };
const MARGIN_SCATTER = { top: 20, right: 20, bottom: 30, left: 40 };

const COMPARE_COLORS = [
    "#ff0055", // Rosso Neon (Sel 1)
    "#00ff00", // Lime Elettrico (Sel 2)
    "#ffff00"  // Giallo Puro (Sel 3)
];

// 2. COLORI CATEGORIE (DISTINTI)
// Usiamo colori pastello saturi, ben separati nello spettro.
const MACRO_COLORS = {
    "Plant-based":     "#1B9E77", // teal/green
    "Animal Protein":  "#D95F02", // orange
    "Dairy & Cheese":  "#7570B3", // blue-violet
    "Sweets & Snacks": "#E7298A", // magenta
    "Fats & Oils":     "#E6AB02", // mustard/yellow
    "Prepared/Other":  "#BDBDBD"  // light gray (neutro, “altro”)
  };

// Stato Globale
let state = {
    features: [],
    dataRaw: [],
    weights: {},
    projection: [],
    minDominance: 1.0,
    selectedIds: [],
    brushSelections: {},
    hiddenCategories: new Set()
};

const labelMap = {
    // Macro & Generici
    "Caloric Value": "Kcal",
    "Total Fat": "Fat",
    "Saturated Fats": "Sat Fat",
    "Carbohydrates": "Carbs",
    "Sugars": "Sugar",
    "Dietary Fiber": "Fiber",
    "Cholesterol": "Cholest",
    "Sodium": "Sodium",
    "Water": "Water",

    // Minerali (Simboli Chimici per risparmiare spazio)
    "Magnesium": "Mg",       // Magnesio
    "Potassium": "K",        // Potassio
    "Iron": "Fe",            // Ferro
    "Calcium": "Ca",         // Calcio
    "Vitamin C": "Vit C"           // Rame
};

// Aggiungi all'inizio di main.js
const GOOD_NUTRIENTS = [
    "Protein", 
    "Dietary Fiber", 
    "Vitamin C", 
    "Potassium", 
    "Iron", 
    "Calcium", 
    "Magnesium", 
    "Water"
];

const BAD_NUTRIENTS = [
    "Sugars", 
    "Saturated Fats", 
    "Cholesterol", 
    "Sodium"
];

// --- MAPPA UNITÀ DI MISURA ---
const UNIT_MAP = {
    "Caloric Value": "kcal",
    "Total Fat": "g",
    "Saturated Fats": "g",
    "Carbohydrates": "g",
    "Sugars": "g",
    "Dietary Fiber": "g",
    "Protein": "g",
    "Cholesterol": "mg",
    "Sodium": "mg",
    "Water": "g",
    "Vitamin C": "mg",
    "Potassium": "mg",
    "Iron": "mg",
    "Calcium": "mg",
    "Magnesium": "mg"
};
// Tutto il resto (Zuccheri, Grassi, Sodio, Colesterolo) sarà considerato "Da limitare" (Rosso)

// Variabili D3 Globali
let svgParallel, xParallel, yParallel = {};
let svgScatter, xScatter, yScatter, xAxisScatter, yAxisScatter;
let scatterContainerSize = { width: 0, height: 0 };
let tooltip;
let selectedProductId = null;
let dominanceMap = new Map(); // Lookup veloce ID -> Share
let categoryMap = new Map();
let yBrush;
let scatterBrush;



// Helper per determinare il colore di un punto
function getPointColor(id) {
    // 1. Se Selezionato: Usa la palette di confronto (Rosso/Verde/Giallo)
    const idx = state.selectedIds.indexOf(id);
    if (idx > -1) return COMPARE_COLORS[idx]; 
    
    // 2. Se Contesto: Usa il colore della Categoria
    const cat = categoryMap.get(id) || "Prepared/Other";
    return MACRO_COLORS[cat];
}

// Helper per determinare l'opacità
function getPointOpacity(id) {
    // Se non c'è NESSUNA selezione attiva, tutto è visibile (0.6)
    if (state.selectedIds.length === 0) return 0.6;
    // Se c'è una selezione: i selezionati sono 1, gli altri 0.1 (offuscati)
    return state.selectedIds.includes(id) ? 1 : 0.5;
}

// Helper per il raggio
function getPointRadius(id) {
    return state.selectedIds.includes(id) ? 5 : 4;
}

// Helper per il bordo
function getPointStroke(id) {
    // Bordo bianco solo sui selezionati per farli "pop"
    return state.selectedIds.includes(id) ? "#fff" : "none";
}

function getMacroCategory(originalCategory) {
    if (!originalCategory) return "Prepared/Other";
    const c = originalCategory.toLowerCase();
  
    // 1) Fats & oils (very specific, override)
    if (
      c.includes("oil") || c.includes("butter") || c.includes("lard") ||
      c.includes("margarine") || c.includes("shortening") ||
      c.includes("mayonnaise") || c.includes("dressing")
    ) return "Fats & Oils";
  
    // 2) Dairy
    if (
      c.includes("milk") || c.includes("cheese") || c.includes("yogurt") ||
      c.includes("cream") || c.includes("dairy")
    ) return "Dairy & Cheese";
  
    // 3) Animal protein
    if (
      c.includes("beef") || c.includes("pork") || c.includes("chicken") ||
      c.includes("turkey") || c.includes("meat") || c.includes("sausage") ||
      c.includes("fish") || c.includes("seafood") || c.includes("egg") ||
      c.includes("poultry") || c.includes("lamb") || c.includes("bacon") ||
      c.includes("ham") || c.includes("shrimp") || c.includes("tuna") ||
      c.includes("salmon") || c.includes("frankfurter")
    ) return "Animal Protein";
  
    // 4) Sweets & snacks
    if (
      c.includes("candy") || c.includes("chocolate") || c.includes("cookie") ||
      c.includes("cake") || c.includes("pie") || c.includes("dessert") ||
      c.includes("ice cream") || c.includes("doughnut") || c.includes("pastry") ||
      c.includes("cracker") || c.includes("chips") || c.includes("snack") ||
      c.includes("sugar") || c.includes("honey") || c.includes("jam") ||
      c.includes("sweet")
    ) return "Sweets & Snacks";
  
    // 5) Plant-based staples + produce
    if (
      c.includes("fruit") || c.includes("vegetab") || c.includes("bean") ||
      c.includes("legume") || c.includes("nut") || c.includes("seed") ||
      c.includes("grain") || c.includes("cereal") || c.includes("rice") ||
      c.includes("pasta") || c.includes("bread") || c.includes("potato") ||
      c.includes("tofu") || c.includes("soy")
    ) return "Plant-based";
  
    return "Prepared/Other";
  }

async function init() {
    console.log("🚀 Avvio applicazione...");
    try {
        const metaRes = await fetch(`${API_URL}/metadata`);
        const metadata = await metaRes.json();
        
        state.dataRaw = metadata.data;
        let rawFeatures = metadata.features;

        state.dataRaw.forEach(d => {
            dominanceMap.set(d.id, +d.dominant_share || 0); // Serve per i filtri slider
            categoryMap.set(d.id, getMacroCategory(d.category)); // Serve per il colore
        });
        
        const logicalOrder = [
            // --- ENERGIA & MACRO PRINCIPALI ---
            "Caloric Value", 
            "Water",
            "Total Fat", 
            "Saturated Fats", 
            "Cholesterol",
            "Carbohydrates", 
            "Sugars", 
            "Dietary Fiber",
            "Protein",
            "Sodium", 
            "Potassium", 
            "Calcium", 
            "Magnesium",
            "Iron", 
            "Vitamin C"
        ];
        
        state.features = logicalOrder.filter(f => rawFeatures.includes(f));
        // Inizializza pesi a 1.0
        state.features.forEach(f => state.weights[f] = 0.5);
        
        // Associa ID -> dominant_share per accesso O(1)
        state.dataRaw.forEach(d => {
            dominanceMap.set(d.id, +d.dominant_share || 0);
        });
        setupDominanceFilter();
        setupSearch();

        console.log(`✅ Metadati: ${state.features.length} features.`);

        // Inizializza i grafici vuoti (per creare i contenitori SVG)
        setupParallelCoordinates();
        setupScatterplot();

        // Prima chiamata dati
        await updateProjection();

        // Event Listener per ridimensionamento finestra (Responsive)
        window.addEventListener("resize", () => {
            setupParallelCoordinates();
            setupScatterplot();
            updateScatterplotVis(); // Ridisegna i punti
        });

        tooltip = d3.select("body").append("div")
        .attr("class", "d3-tooltip");
        updateDetailPanel()
        updateParallelLines();
        drawScatterLegendBar();
    } catch (e) {
        console.error("Errore init:", e);
    }
}

function setupDominanceFilter() {
    const slider = d3.select("#dominance-slider");
    const label = d3.select("#dominance-val");

    slider.on("input", function() {
        const val = +this.value;
        state.minDominance = val;

        // Feedback visuale testo
        if (val <= 0.3) label.text("All");
        else if (val >= 0.95) label.text("Pure Only");
        else label.text(`> ${Math.round(val * 100)}%`);

        // Aggiorna grafico
        updateScatterplotVis();
        updateDetailPanel();
        updateParallelLines();
    });
}

async function updateProjection() {
    try {
        const res = await fetch(`${API_URL}/projection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weights: state.weights })
        });
        
        const result = await res.json();
        state.projection = result.projection;
        
        d3.select("#variance-info span").text((result.explained_variance * 100).toFixed(1) + "%");
        
        // Aggiorna solo i punti dello scatterplot
        updateScatterplotVis();
        
    } catch (e) {
        console.error("Errore updateProjection:", e);
    }
}

// --- UTILS: Accorcia nomi lunghi ---
function getShortLabel(label) {
    // 1. Se il nome è nel nostro dizionario, usiamo l'abbreviazione
    if (labelMap[label]) {
        return labelMap[label];
    }

    // 2. Regola speciale per tutte le vitamine: Sostituisce "Vitamin " con "Vit "
    // Esempio: "Vitamin B12" -> "Vit B12"
    if (label.startsWith("Vitamin")) {
        return label.replace("Vitamin", "Vit").trim();
    }

    // 3. Fallback: Se è ancora troppo lungo (e non è mappato), tronca e metti i puntini
    if (label.length > 9) {
        return label.substring(0, 7) + "..";
    }

    return label;
}

// ********* 1. COORDINATE PARALLELE **********

function setupParallelCoordinates() {
    const container = d3.select("#parallel-chart");
    container.html(""); // Reset completo per responsive

    // Leggi dimensioni reali
    const bbox = container.node().getBoundingClientRect();

    const width = bbox.width - MARGIN_PARALLEL.left - MARGIN_PARALLEL.right;
    const height = bbox.height - MARGIN_PARALLEL.top - MARGIN_PARALLEL.bottom;

    if (width <= 0 || height <= 0) return;

    svgParallel = container.append("svg")
        .attr("width", width + MARGIN_PARALLEL.left + MARGIN_PARALLEL.right)
        .attr("height", height + MARGIN_PARALLEL.top + MARGIN_PARALLEL.bottom)
        .on("click", function(event) {
            resetBrushing();
        })
        .append("g")
        .attr("transform", `translate(${MARGIN_PARALLEL.left},${MARGIN_PARALLEL.top})`);

    // Scale
    xParallel = d3.scalePoint().range([0, width]).padding(1).domain(state.features);

    state.features.forEach(d => {
        let extent = d3.extent(state.dataRaw, row => +row[d]); 
        yParallel[d] = d3.scaleLinear().domain(extent).range([height, 0]);
    });

    const bgLayer = svgParallel.insert("g", ":first-child").attr("class", "layer-background");

    // Disegna Linee (Campione 20%)
    const sampleData = state.dataRaw.filter(d => isProductVisible(d, d.id));

    svgParallel.append("g").attr("class", "highlight-layer");

    // Assis
    const axes = svgParallel.selectAll(".axis")
        .data(state.features).enter().append("g")
        .attr("class", "axis")
        .attr("transform", d => `translate(${xParallel(d)})`)
        .style("opacity", d => 0.2 + (state.weights[d] * 0.8));

    axes.each(function(d) { d3.select(this).call(d3.axisLeft(yParallel[d]).ticks(0)); });

    yBrush = d3.brushY()     
        .extent([[-10, 0], [10, height]])
        .on("start brush end", brushed);

    axes.append("g")
        .attr("class", "brush")
        .call(yBrush);

    // --- SLIDER E ETICHETTE ---
    const sliderTop = -50;   
    const sliderBottom = -10; 
    const sliderScale = d3.scaleLinear().domain([0, 1]).range([sliderBottom, sliderTop]).clamp(true);

    // Etichetta Feature (Accorciata e spostata in alto)
    axes.append("text")
        .style("text-anchor", "middle")
        .attr("y", -60) // Sopra lo slider
        .text(d => getShortLabel(d)) 
        .style("fill", "#bdc3c7")
        .style("font-size", "10px")
        .style("font-weight", "bold")
        .style("cursor", "help")
        .append("title").text(d => d); // Tooltip col nome intero

    // Linea guida slider
    axes.append("line")
        .attr("x1", 0).attr("x2", 0)
        .attr("y1", sliderBottom).attr("y2", sliderTop)
        .style("stroke", "#ccc").style("stroke-width", 3);

    // Maniglia interattiva
    axes.append("rect")
        .attr("class", "handle")
        .attr("x", -6).attr("width", 12).attr("height", 12).attr("rx", 3)
        .attr("y", d => sliderScale(state.weights[d]) - 6)
        .style("fill", "#8e44ad")
        .style("cursor", "ns-resize")
        .call(d3.drag()
            .on("drag", function(event, d) {
                const newY = Math.max(sliderTop, Math.min(sliderBottom, event.y));
                d3.select(this).attr("y", newY - 6);
                
                // Aggiorna state locale
                const newWeight = sliderScale.invert(newY);
                state.weights[d] = newWeight;
                
                // Feedback opacità asse
                d3.select(this.parentNode).style("opacity", 0.2 + (newWeight * 0.8));
            })
            .on("end", () => {
                // Trigger aggiornamento Scatterplot
                updateProjection(); 
            })
        );
    updateParallelLines();
    restoreBrushVisuals();
}

function updateParallelLines() {
    // 1. FILTRA I DATI
    const activeData = state.dataRaw.filter(d => isProductVisible(d, d.id));

    // --- HELPER: Generatore di linee locale ---
    const getPath = (d) => {
        const line = d3.line()
            .defined(p => !isNaN(p[1])) 
            .x(p => p[0])
            .y(p => p[1]);

        const points = state.features.map(feature => {
            if (d[feature] === undefined || !yParallel[feature]) return [xParallel(feature), NaN];
            return [xParallel(feature), yParallel[feature](d[feature])];
        });
        return line(points);
    };

    // 2. SELEZIONA (O CREA) IL LAYER SFONDO
    // Questo è il fix per l'errore "insertBefore".
    // Creiamo un contenitore specifico solo per le linee grigie.
    let bgLayer = svgParallel.select("g.layer-background");
    if (bgLayer.empty()) {
        // Se non esiste, lo creiamo e lo mettiamo PRIMA di tutto (:first-child)
        // così le linee stanno sotto agli assi.
        bgLayer = svgParallel.insert("g", ":first-child").attr("class", "layer-background");
    }

    // 3. DISEGNA LE LINEE (Dentro il bgLayer, non svgParallel!)
    bgLayer.selectAll("path.bg-line")
        .data(activeData, d => d.id) 
        .join(
            enter => enter.append("path")
                .attr("class", "bg-line")
                .attr("d", d => getPath(d))
                .style("fill", "none")
                .style("stroke", "#bdc3c7")
                .style("stroke-width", 1)
                .style("opacity", 0)
                .style("mix-blend-mode", "normal")
                .transition().duration(500)
                .style("opacity", 0.3),

            update => update
                .attr("d", d => getPath(d))
                .style("display", "block")
                .style("stroke", "#bdc3c7")
                .style("opacity", d => state.selectedIds.length > 0 ? 0.05 : 0.3),

            exit => exit.remove()
        );

    const highlightLayer = svgParallel.select(".highlight-layer");
    highlightLayer.html(""); // Reset

    let labelsToDraw = [];

    // 2. CICLO: Disegna Linee e Raccogli Dati Etichette
    state.selectedIds.forEach((id, index) => {
        const product = state.dataRaw.find(p => p.id == id);
        if (!product) return;

        // A. DISEGNO LINEA
        const lineGenerator = d3.line()
            .defined(d => !isNaN(d[1]) && d[1] !== undefined)
            .x(d => d[0]).y(d => d[1]);

        const points = state.features.map(feature => {
            if (product[feature] === undefined || !yParallel[feature]) return [xParallel(feature), NaN];
            return [xParallel(feature), yParallel[feature](product[feature])];
        });

        highlightLayer.append("path")
            .attr("d", lineGenerator(points))
            .style("fill", "none")
            .style("stroke", COMPARE_COLORS[index])
            .style("stroke-width", 3)
            .style("opacity", 1)
            .style("pointer-events", "none");

        // B. RACCOLTA DATI ETICHETTA
        const firstFeature = state.features[0]; 
        const firstVal = product[firstFeature];
        
        if (firstVal !== undefined && yParallel[firstFeature]) {
            const yPos = yParallel[firstFeature](firstVal);
            
            labelsToDraw.push({
                text: product.food,
                y: yPos,          // Posizione corrente (verrà modificata dal sort)
                originalY: yPos,  // Posizione originale (per la linetta)
                color: COMPARE_COLORS[index]
            });
        }
    });

    // 3. COLLISION DETECTION (Sposta giù se si sovrappongono)
    labelsToDraw.sort((a, b) => a.y - b.y);
    const labelHeight = 14; 
    
    labelsToDraw.forEach((d, i) => {
        if (i > 0) {
            const prev = labelsToDraw[i - 1];
            if (d.y < prev.y + labelHeight) {
                d.y = prev.y + labelHeight; 
            }
        }
    });

    // 4. DISEGNO EFFETTIVO ETICHETTE
    // Calcoliamo la X dell'asse zero una volta sola
    const axisZeroX = xParallel(state.features[0]); 

    labelsToDraw.forEach(d => {
        const displayText = d.text.length > 20 ? d.text.substring(0, 18) + "..." : d.text;
        const g = highlightLayer.append("g");

        // Stanghetta di raccordo (se spostato > 5px)
        if (Math.abs(d.y - d.originalY) > 5) {
            g.append("line")
                .attr("x1", axisZeroX - 5).attr("y1", d.originalY) // Punto sull'asse
                .attr("x2", axisZeroX - 10).attr("y2", d.y)        // Punto vicino al testo
                .style("stroke", d.color)
                .style("stroke-width", 1)
                .style("opacity", 0.7);
        }

        g.append("text")
            .attr("x", axisZeroX - 10) // <--- FIX: Usiamo la variabile calcolata, non xPos
            .attr("y", d.y)            // <--- FIX: Usiamo d.y (aggiustato), non yPos
            .text(displayText)
            .attr("text-anchor", "end") 
            .attr("alignment-baseline", "middle")
            .style("font-size", "11px")
            .style("font-weight", "bold")
            .style("fill", d.color)
            .style("text-shadow", "0 1px 0 #1a1a1a, 1px 0 0 #1a1a1a, 0 -1px 0 #1a1a1a, -1px 0 0 #1a1a1a")
            .style("opacity", 0)
            .transition().duration(200)
            .style("opacity", 1);
    });
}

function brushed(event) {
    // 1. Identifica quale asse stiamo spazzolando
    // D3 non ci dà direttamente il nome dell'asse nell'evento, dobbiamo recuperarlo dal DOM
    // 'this' è il gruppo G del brush. Il genitore è il gruppo dell'asse, che ha il dato associato.
    if (!event.sourceEvent) return;

    const scatterBrushGroup = d3.select(".brush-scatter");
    
    // Controlliamo se esiste un brush attivo
    if (scatterBrushGroup.node() && d3.brushSelection(scatterBrushGroup.node())) {
        // Questo comando fa due cose:
        // 1. Rimuove visivamente il rettangolo grigio.
        // 2. Scatena l'evento "end" su brushedScatter con selezione null, 
        //    che a sua volta pulirà le linee verdi (ghost lines).
        scatterBrushGroup.call(scatterBrush.move, null);
    }

    const feature = d3.select(this.parentNode).datum();
    
    // 2. Leggi la selezione (in pixel)
    const selection = event.selection; // [y0, y1] o null

    if (selection) {
        // Converti pixel -> valori reali (es. grammi)
        // Nota: asse Y è invertito (0 in alto = max valore), quindi invertiamo min/max
        const [y0, y1] = selection;
        const val1 = yParallel[feature].invert(y0);
        const val2 = yParallel[feature].invert(y1);
        
        // Salva nello stato: [min, max]
        state.brushSelections[feature] = [Math.min(val1, val2), Math.max(val1, val2)];
    } else {
        // Se la selezione è vuota (doppio click per cancellare), rimuovi la chiave
        delete state.brushSelections[feature];
    }

    // 3. Aggiorna le viste
    updateParallelLines();
    updateScatterplotVis()
    if (event.type === 'end') {
        updateScatterplotVis();
        updateDetailPanel();
    }
}
// Ripristina i rettangoli grigi sugli assi basandosi sui dati salvati
function restoreBrushVisuals() {
    // Se non ci sono selezioni salvate, non fare nulla
    if (Object.keys(state.brushSelections).length === 0) return;

    // Cicla su ogni feature che ha un filtro attivo
    Object.entries(state.brushSelections).forEach(([feature, range]) => {
        const [min, max] = range;
        
        // 1. Converti i valori (es. grammi) in pixel
        // Nota: l'asse Y è invertito, quindi invertiamo min/max per ottenere y0/y1
        const y0 = yParallel[feature](max); 
        const y1 = yParallel[feature](min);

        // 2. Trova il gruppo .brush specifico per questo asse
        // (Gli assi hanno il dato 'feature' associato al gruppo genitore)
        const brushGroup = svgParallel.selectAll(".axis")
            .filter(d => d === feature)
            .select(".brush");

        // 3. Muovi il brush (senza scatenare eventi infiniti, d3 gestisce questo)
        if (!brushGroup.empty()) {
            brushGroup.call(yBrush.move, [y0, y1]);
        }
    });
}

// Helper: Controlla se un prodotto soddisfa TUTTI i filtri attivi
function isProductBrushed(product) {
    // Scorre tutte le feature che hanno un filtro attivo
    const features = Object.keys(state.brushSelections);
    
    // Se non ci sono filtri, è "brushed" di default (true)
    if (features.length === 0) return true;

    // Controlla se soddisfa TUTTI i criteri
    return features.every(f => {
        const [min, max] = state.brushSelections[f];
        const val = product[f];
        return val >= min && val <= max;
    });
}

function isProductVisible(product, id) {
    if (!product) return false;

    // 1. Controllo Purity (Slider)
    const share = dominanceMap.get(id);
    if (share < state.minDominance) return false;

    const cat = categoryMap.get(id);
    if (state.hiddenCategories.has(cat)) return false;

    // 2. Controllo Brushing Parallel Coordinates
    // (Usa la tua funzione helper esistente isProductBrushed)
    if (!isProductBrushed(product)) return false;

    return true; // Se passa entrambi, è visibile
}

// ********** 2. SCATTERPLOT***************

function setupScatterplot() {
    const container = d3.select("#scatter-chart");
    container.html(""); // Reset

    const bbox = container.node().getBoundingClientRect();
    const width = bbox.width - MARGIN_SCATTER.left - MARGIN_SCATTER.right;
    const height = bbox.height - MARGIN_SCATTER.top - MARGIN_SCATTER.bottom;
    
    // Salviamo dimensioni per l'update
    scatterContainerSize = { width, height };

    if (width <= 0 || height <= 0) return;

    svgScatter = container.append("svg")
        .attr("width", width + MARGIN_SCATTER.left + MARGIN_SCATTER.right)
        .attr("height", height + MARGIN_SCATTER.top + MARGIN_SCATTER.bottom)
        .append("g")
        .attr("transform", `translate(${MARGIN_SCATTER.left},${MARGIN_SCATTER.top})`);

    // Scale Iniziali (vuote)
    xScatter = d3.scaleLinear().range([0, width]);
    yScatter = d3.scaleLinear().range([height, 0]);

    // Assi
    xAxisScatter = svgScatter.append("g").attr("transform", `translate(0, ${height})`);
    yAxisScatter = svgScatter.append("g");

    scatterBrush = d3.brush()
        .extent([[0, 0], [width, height]]) // Copre tutto il grafico
        .on("start brush end", brushedScatter); // Chiama la funzione

    // 2. Aggiungi il gruppo Brush (PRIMA dei dots così i dots rimangono cliccabili se necessario, 
    // ma solitamente il brush deve stare sopra per catturare il drag. 
    // Mettiamolo SOPRA i dots per permettere la selezione a trascinamento facile).
    const brushGroup = svgScatter.append("g")
        .attr("class", "brush-scatter")
        .call(scatterBrush);
    
    // Gruppo punti
    svgScatter.append("g").attr("class", "dots");
    svgScatter.append("g").attr("class", "labels");
}

function updateScatterplotVis() {
    if (!svgScatter || state.projection.length === 0) return;

    // --- 1. FILTRAGGIO DATI (Slider Purity) ---
    const filteredData = state.projection.filter(d => {
        // 1. Filtro Purity (Veloce: usa Map)
        const share = dominanceMap.get(d.id);
        if (share < state.minDominance) return false;

        // 2. Filtro Categoria (Veloce: usa Map) - QUELLO CHE MANCAVA
        // Se la categoria è nel set "hiddenCategories", nascondi il punto
        const cat = categoryMap.get(d.id);
        if (state.hiddenCategories.has(cat)) return false;

        // 3. Filtro Brush (Lento: richiede ricerca dati grezzi)
        // Ottimizzazione: Se non ci sono brush attivi, passa subito
        const activeBrushes = Object.keys(state.brushSelections || {});
        if (activeBrushes.length === 0) return true;

        // Recuperiamo il dato grezzo solo se strettamente necessario
        const product = state.dataRaw.find(p => p.id === d.id);
        
        // Verifica se il prodotto rispetta i range del brush
        // (Puoi usare la tua funzione isProductBrushed o controllare qui)
        return isProductVisible(product, d.id); 
    });

    console.log(`📉 Scatterplot: visualizzo ${filteredData.length} punti.`);

    // --- 2. AGGIORNAMENTO SCALE ---
    const xExt = d3.extent(filteredData, d => d.x);
    const yExt = d3.extent(filteredData, d => d.y);
    
    // Evitiamo crash se il filtro svuota tutto
    if (!xExt[0]) {
        svgScatter.select(".dots").selectAll("circle").remove();
        return; 
    }

    const padX = (xExt[1] - xExt[0]) * 0.1; 
    const padY = (yExt[1] - yExt[0]) * 0.1;

    xScatter.domain([xExt[0] - padX, xExt[1] + padX]);
    yScatter.domain([yExt[0] - padY, yExt[1] + padY]);

    xAxisScatter.transition().duration(500).call(d3.axisBottom(xScatter).ticks(5));
    yAxisScatter.transition().duration(500).call(d3.axisLeft(yScatter).ticks(5));

    // --- 3. RENDERING PUNTI (JOIN) ---
    const dots = svgScatter.select(".dots").selectAll("circle")
        .data(filteredData, d => d.id);

    dots.join(
        // ENTER: Nuovi punti
        enter => enter.append("circle")
            .attr("cx", d => xScatter(d.x))
            .attr("cy", d => yScatter(d.y))
            .attr("r", d => getPointRadius(d.id))
            .attr("fill", d => getPointColor(d.id))
            .attr("opacity", d => getPointOpacity(d.id))
            .attr("stroke", d => getPointStroke(d.id))
            .attr("stroke-width", 2)
            .style("cursor", "pointer"),
        
        // UPDATE: Punti esistenti (Movimento istantaneo + Aggiornamento Stile)
        update => update
            .attr("cx", d => xScatter(d.x))
            .attr("cy", d => yScatter(d.y))
            // Qui applichiamo lo stile corrente (Multi-Selezione)
            .attr("r", d => getPointRadius(d.id))
            .attr("fill", d => getPointColor(d.id))
            .attr("opacity", d => getPointOpacity(d.id))
            .attr("stroke", d => getPointStroke(d.id))
            .style("cursor", "pointer")
    )
    .sort((a, b) => {
        const aSel = state.selectedIds.includes(a.id);
        const bSel = state.selectedIds.includes(b.id);
        // Se a è selezionato e b no, a va dopo (1). Se uguali, non cambiare (0).
        return (aSel === bSel) ? 0 : aSel ? 1 : -1;
    })
    // --- 4. GESTIONE EVENTI (MOUSE) ---
    .on("mouseover", function(event, d) {
        // A. TOOLTIP
        const product = state.dataRaw.find(p => p.id === d.id);
        if (product) {
            tooltip.html(`
            <div style="font-weight:bold; font-size:13px; margin-bottom:2px;">${product.food}</div>
            <div style="font-size:11px; color:#ddd;">
                <span>💧 ${Math.round(product.dominant_share*100)}% Pure</span>
                <span style="margin-left:8px; opacity:0.7;">|</span>
                <span style="margin-left:8px;">🔥 ${Math.round(product["Caloric Value"])} kcal</span>
            </div>
        `)
        .style("padding", "8px 12px") // Meno padding
        .style("visibility", "visible");
        }

        // B. EVIDENZIAZIONE VISIVA (PREVIEW)
        // Se il punto NON è già selezionato, facciamolo "brillare" per far capire che è cliccabile
        if (!state.selectedIds.includes(d.id)) {
            d3.select(this)
            .attr("r", 6) // Ingrandiamo bene
            .attr("opacity", 1)
            .attr("stroke", "#fff") 
            .attr("stroke-width", 2)
            .raise();

            showPreviewLine(product);
        }
    })
    .on("mousemove", function(event) {
        tooltip.style("top", (event.pageY - 15) + "px").style("left", (event.pageX) + "px");
    })
    .on("mouseout", function(event, d) {
        tooltip.style("visibility", "hidden");
        hidePreviewLine();
        // C. RIPRISTINO STATO CORRETTO
        // Quando il mouse esce, il punto deve tornare esattamente come deve essere
        // secondo la logica della selezione globale.
        d3.select(this)
            .attr("r", getPointRadius(d.id))
            .attr("fill", getPointColor(d.id))
            .attr("opacity", getPointOpacity(d.id))
            .attr("stroke", getPointStroke(d.id))
            .attr("stroke-width", state.selectedIds.includes(d.id) ? 2 : 0);
    })
    .on("click", function(event, d) {
        event.stopPropagation();
        hidePreviewLine();
        toggleProduct(d.id);
    });

    const selectedPoints = filteredData.filter(d => state.selectedIds.includes(d.id));

    const labels = svgScatter.select(".labels").selectAll("text")
        .data(selectedPoints, d => d.id);

    labels.join(
        // ENTER: Appari con dissolvenza
        enter => enter.append("text")
            .attr("x", d => xScatter(d.x))
            .attr("y", d => yScatter(d.y) - 15) // 15px sopra il pallino
            .text(d => {
                const p = state.dataRaw.find(item => item.id === d.id);
                // Tronca se troppo lungo (> 20 caratteri)
                const name = p ? p.food : "";
                return name.length > 25 ? name.substring(0, 23) + ".." : name;
            })
            .attr("text-anchor", "middle") // Centrato orizzontalmente
            .style("font-family", "sans-serif")
            .style("font-size", "11px")
            .style("font-weight", "bold")
            .style("fill", d => getPointColor(d.id)) // Stesso colore del pallino (Rosso/Blu/Giallo)
            .style("pointer-events", "none") // Non deve interferire col mouse
            // "Halo" bianco (bordo) per leggere il testo sopra altri punti scuri
            .style("text-shadow", "0px 2px 4px rgba(0,0,0,0.9)")
            .attr("opacity", 0)
            .call(enter => enter.transition().duration(300).attr("opacity", 1)),
        
        // UPDATE: Muoviti se lo scatterplot cambia (zoom/filtri)
        update => update
            .attr("x", d => xScatter(d.x))
            .attr("y", d => yScatter(d.y) - 15)
            .style("fill", d => getPointColor(d.id)), // Aggiorna colore se cambia ordine selezione
            
        // EXIT: Rimuovi
        exit => exit.remove()
    );
}

function drawScatterLegendBar() {
    const container = d3.select("#scatter-legend-bar");
    container.html(""); 

    // --- 1. CONFIGURAZIONE LAYOUT ESTESO ---
    container
        .style("display", "flex")
        .style("width", "100%")           // <--- FONDAMENTALE: Occupa tutta la larghezza
        .style("justify-content", "space-between") // <--- FONDAMENTALE: Distribuisce gli spazi
        .style("align-items", "center")
        .style("padding", "2px 2px");     // Margine minimo ai bordi estremi

    // --- 2. LABEL "FILTER" (Opzionale: lasciamola all'inizio) ---
    // La raggruppiamo col primo elemento visivamente o la lasciamo come item a sé stante
    container.append("span")
        .text("FILTER:")
        .style("color", "#95a5a6")
        .style("font-size", "11px")
        .style("font-weight", "bold")
        .style("margin-right", "0px"); // Lo spazio lo gestisce il flex container

    // --- 3. ELEMENTI DELLA LEGENDA (Categorie) ---
    Object.entries(MACRO_COLORS).forEach(([label, color]) => {
        const isHidden = state.hiddenCategories.has(label);
        const opacity = isHidden ? 0.4 : 1;
        const textDecoration = isHidden ? "line-through" : "none";
        const filter = isHidden ? "grayscale(100%)" : "none";

        const item = container.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "6px") 
            .style("cursor", "pointer")
            .style("opacity", opacity)
            .style("filter", filter)
            .style("transition", "transform 0.1s")
            
            // Eventi
            .on("mouseover", function() { if(!isHidden) d3.select(this).style("transform", "scale(1.1)"); })
            .on("mouseout", function() { d3.select(this).style("transform", "scale(1)"); })
            .on("click", () => {
                if (state.hiddenCategories.has(label)) state.hiddenCategories.delete(label);
                else state.hiddenCategories.add(label);
                
                drawScatterLegendBar();
                updateScatterplotVis();
                updateParallelLines();
            });

        // Pallino
        item.append("div")
            .style("width", "12px")
            .style("height", "12px")
            .style("border-radius", "50%")
            .style("background-color", color)
            .style("border", "1px solid rgba(255,255,255,0.2)");

        // Testo (Uso label originale per estetica, o rimetti SHORT_LABELS se preferisci)
        item.append("span")
            .text(label) 
            .style("font-size", "11px") 
            .style("color", "#ecf0f1")
            .style("text-decoration", textDecoration)
            .style("white-space", "nowrap");
    });

    // --- SEPARATORE ---
    container.append("div")
        .style("width","1px")
        .style("height","15px")
        .style("background-color","#444");

    // --- GRUPPO SELEZIONI (Le teniamo raggruppate in un div unico per non spargerle) ---
    // TRUCCO: Creiamo un sotto-contenitore per le selezioni, così i 3 pallini restano vicini
    // e non vengono sparati via dallo space-between
    const selectionGroup = container.append("div")
        .style("display", "flex")
        .style("align-items", "center")
        .style("gap", "5px");

    selectionGroup.append("span")
        .text("SEL:")
        .style("color","#7f8c8d")
        .style("font-size","10px")
        .style("font-weight","bold")
        .style("margin-right", "4px");

    COMPARE_COLORS.forEach(color => {
        selectionGroup.append("div")
            .style("width","10px")
            .style("height","10px")
            .style("border-radius","50%")
            .style("background-color",color)
            .style("border","1px solid #fff")
            .style("box-shadow",`0 0 3px ${color}`);
    });
}

// --- FUNZIONI DI COORDINAMENTO (LINKING) ---

function toggleProduct(clickedId) {
    const index = state.selectedIds.indexOf(clickedId);

    if (index > -1) {
        // Rimuovi
        state.selectedIds.splice(index, 1);
    } else {
        // Aggiungi (Gestione Coda FIFO di 3 elementi)
        if (state.selectedIds.length >= 3) {
            state.selectedIds.shift(); // Via il primo
        }
        state.selectedIds.push(clickedId);
    }

    updateParallelLines();
    updateScatterplotVis();
    updateDetailPanel();
}


// --- FUNZIONE 1: Resetta SOLO la selezione dei prodotti (Scatter Click) ---
function resetProductSelection() {
    console.log("🧹 Reset Selezione Prodotti");
    
    // 1. Pulisci array ID
    state.selectedIds = [];

    if (scatterBrush) {
        d3.select(".brush-scatter").call(scatterBrush.move, null); // Toglie il rettangolo
    }
    svgParallel.select(".ghost-layer").remove(); // Toglie le linee fantasma
    
    // 2. Rimuovi classi CSS (es. per animazioni se c'erano)
    d3.select("#parallel-container").classed("has-selection", false);

    // 3. Aggiorna viste
    updateScatterplotVis(); // Ridisegna i pallini (tornano verdi/normali)
    updateParallelLines();  // Cancella le linee colorate
    updateDetailPanel(); // pulisci il pannello dei dettagli
}

// --- FUNZIONE 2: Resetta SOLO il brushing (Parallel Click) ---
function resetBrushing() {
    console.log("🧹 Reset Brushing (Filtri)");

    // 1. Pulisci stato logico
    state.brushSelections = {};

    // 2. Pulisci visivamente i rettangoli grigi (D3 Brush Reset)
    // Seleziona tutti i nodi con classe .brush e azzera la selezione
    if (yBrush) {
        d3.selectAll(".brush").call(yBrush.move, null);
    }

    // 3. Aggiorna viste (mostra di nuovo tutte le linee di sfondo e i puntini)
    updateParallelLines();   
    updateScatterplotVis(); 
}

function brushedScatter(event) {
    const selection = event.selection; // [[x0, y0], [x1, y1]]

    // Se non c'è selezione (click a vuoto), pulisci le linee fantasma
    if (!selection) {
        svgParallel.select(".ghost-layer").remove();

        if (event.sourceEvent) {
            console.log("🖱️ Click vuoto su Scatter (Brush): Resetto tutto.");
            resetProductSelection();
            return; 
       }

        svgParallel.selectAll(".bg-line")
            .style("opacity", d => {
                if (!isProductVisible(d, d.id)) return 0.02; // Nascosto
                return state.selectedIds.length > 0 ? 0.15 : 0.6;
            });
        return;
    }

    const [[x0, y0], [x1, y1]] = selection;

    // 1. Trova gli ID dei punti dentro il rettangolo
    // Usiamo state.projection perché contiene le coordinate x,y attuali
    const brushedPoints = state.projection.filter(d => {
        // Scala le coordinate logiche (d.x, d.y) in pixel
        const product = state.dataRaw.find(p => p.id === d.id);
        if (!isProductVisible(product, d.id)) return false;

        const px = xScatter(d.x);
        const py = yScatter(d.y);
        
        // Check geometrico
        return px >= x0 && px <= x1 && py >= y0 && py <= y1;
    });

    svgParallel.selectAll(".bg-line")
        .style("opacity", d => isProductVisible(d, d.id) ? 0.15 : 0.02);
    // 2. Disegna queste linee nelle Parallel Coordinates
    updateGhostLines(brushedPoints);
}

function updateGhostLines(points) {
    // Se non ci sono punti, pulisci ed esci
    if (points.length === 0) {
        svgParallel.select(".ghost-layer").remove();
        return;
    }

    // Crea il layer se non esiste. 
    let ghostLayer = svgParallel.select(".ghost-layer");
    if (ghostLayer.empty()) {
        // Cerca highlight-layer per inserirsi sotto le linee di selezione (rosso/blu)
        // ma sopra lo sfondo grigio.
        if (!svgParallel.select(".highlight-layer").empty()) {
            ghostLayer = svgParallel.insert("g", ".highlight-layer").attr("class", "ghost-layer");
        } else {
            ghostLayer = svgParallel.append("g").attr("class", "ghost-layer");
        }
    }

    ghostLayer.html(""); // Pulisci le vecchie ghost lines

    // Performance: Limitiamo a 150 linee per evitare che il "glow" blocchi il browser
    const maxLines = 150;
    const renderData = points.length > maxLines 
        ? points.filter(() => Math.random() < (maxLines / points.length)) 
        : points;

    console.log(`👻 Disegno ${renderData.length} ghost lines (Stile Neon).`);

    renderData.forEach(d => {
        const product = state.dataRaw.find(p => p.id === d.id);
        if (!product) return;

        const lineGenerator = d3.line()
            .defined(d => !isNaN(d[1]) && d[1] !== undefined)
            .x(d => d[0]).y(d => d[1]);

        const linePoints = state.features.map(feature => {
            if (product[feature] === undefined || !yParallel[feature]) return [xParallel(feature), NaN];
            return [xParallel(feature), yParallel[feature](product[feature])];
        });

        ghostLayer.append("path")
            .attr("d", lineGenerator(linePoints))
            .style("fill", "none")
            
            // --- STILE NEON (Modificato per essere identico all'Hover) ---
            .style("stroke", "#00e676") // Verde Fluo
            .style("stroke-width", 2)    // Spessore aumentato (era 1.5)
            .style("filter", "drop-shadow(0 0 5px #00e676)") // EFFETTO GLOW
            .style("pointer-events", "none")
            
            // Animazione entrata
            .style("opacity", 0)
            .transition().duration(200)
            .style("opacity", 0.8); // Molto più visibile (era 0.4)
    });
}

function setupSearch() {
    console.log("🔍 Attivazione Ricerca...");
    
    // 1. Seleziona input e il suo contenitore genitore
    const searchInput = d3.select("#product-search");
    const parent = d3.select(".search-group"); // Assicurati che nel HTML il div genitore abbia questa classe

    // 2. IMPORTANTE: Rimuovi l'attributo list per evitare conflitti con il browser
    searchInput.attr("list", null);
    
    // 3. Assicurati che il contenitore genitore sia relative (per posizionare la tendina)
    parent.style("position", "relative");

    // 4. Crea (o seleziona) il contenitore dei risultati
    let resultsContainer = parent.select("#search-results-wrapper");
    if (resultsContainer.empty()) {
        resultsContainer = parent.append("div")
            .attr("id", "search-results-wrapper");
    }

    searchInput.on("input", function() {
        const val = this.value.toLowerCase().trim();
        resultsContainer.html(""); // Reset

        if (val.length < 2) { // Almeno 2 lettere
            resultsContainer.style("display", "none");
            return;
        }

        // Filtra prodotti VISIBILI che matchano il nome
        const matches = state.dataRaw.filter(d => {
            if (!d.food.toLowerCase().includes(val)) return false;
            return isProductVisible(d, d.id);
        });

        // Ordina
        matches.sort((a, b) => a.food.localeCompare(b.food));

        if (matches.length === 0) {
            resultsContainer.style("display", "none");
            return;
        }

        // Mostra tendina
        resultsContainer.style("display", "block");

        // Crea le righe
        matches.forEach(product => {
            resultsContainer.append("div")
                .attr("class", "search-result-item")
                .text(product.food)
                .on("click", () => {
                    // Azione click
                    console.log("Selezionato:", product.food);
                    if (!state.selectedIds.includes(product.id)) {
                        toggleProduct(product.id);
                    }
                    // Reset UI
                    searchInput.property("value", "");
                    resultsContainer.style("display", "none");
                });
        });
    });

    // Chiudi cliccando fuori
    d3.select("body").on("click", (event) => {
        const isInput = event.target.id === "product-search";
        const isResult = event.target.closest("#search-results-wrapper");
        if (!isInput && !isResult) {
            resultsContainer.style("display", "none");
        }
    });
}

function updateDetailPanel() {
    const container = d3.select("#details-container");
    container.html(""); // Pulisci tutto

    // --- 0. IMPOSTA IL LAYOUT FLEXBOX ---
    container
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("height", "100%")
        .style("overflow", "hidden"); 
    
    // --- 1. STATO VUOTO ---
    if (state.selectedIds.length === 0) {
        // ... (codice stato vuoto invariato) ...
        const visibleCount = state.dataRaw.filter(d => isProductVisible(d,d.id)).length;
        container.html(`
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#777; text-align:center; opacity:0.8;">
                <div style="font-size:3rem; margin-bottom:10px; filter:grayscale(1);">🔍</div>
                <h3 style="color:#bdc3c7; margin:0 0 5px 0;">Select products to compare</h3>
                <p style="font-size:0.9rem; color:#7f8c8d;">
                    Currently showing <b style="color:#00e676">${visibleCount}</b> items.<br>
                    Click on scatterplot dots to visualize details.
                </p>
            </div>
        `);
        return;
    }

    const products = state.selectedIds.map(id => state.dataRaw.find(p => p.id == id));

    // --- FIX RESPONSIVE: DEFINIZIONE GRIGLIA UNICA ---
    // 1. Label: fissa a 90px (o clamp se preferisci, ma deve essere uguale ovunque)
    // 2. Prodotti: minmax(0, 1fr) permette di scendere sotto la larghezza del testo
    const gridTemplate = `90px repeat(${products.length}, minmax(0, 1fr))`;

    // --- 2. HEADER FISSO ---
    const header = container.append("div")
        .style("flex", "0 0 auto") 
        .style("display", "grid")
        .style("grid-template-columns", gridTemplate) // <--- USA LA GRIGLIA UNIFICATA
        .style("gap", "6px")
        .style("padding-bottom", "clamp(4px, 1vh, 10px)")
        .style("margin-bottom", "4px")
        .style("border-bottom", "1px solid #444")
        .style("background", "var(--panel-bg)") 
        .style("z-index", "10");

    header.append("div"); // Cella vuota

    products.forEach((p, i) => {
        const displayName = p.food; // Lascia il troncamento al CSS
        const displayCategory = p.category;

        header.append("div")
            .style("text-align", "center")
            .style("overflow", "hidden") // Necessario per contenere il testo
            .html(`
                <div style="
                    color:${COMPARE_COLORS[i]}; 
                    font-weight:bold; 
                    font-size:clamp(10px, 1.8vh, 13px); 
                    line-height:1.2;
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis;">
                    ${displayName}
                </div>
                <div style="
                    color:#f4f4f4; 
                    font-size:clamp(9px, 1.4vh, 11px); 
                    font-style:italic; 
                    margin-top:2px; 
                    line-height:1.1;
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis;">
                    ${displayCategory}
                </div>
            `)
    });

    // --- 3. CONTAINER SCROLLABILE ---
    const scrollableBody = container.append("div")
        .attr("id", "details-body")
        .style("flex", "1 1 auto")
        .style("min-height", "0")          
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("gap", "4px")
        .style("padding-right", "4px")
        .style("overflow-y", "hidden")
        .style("overflow-x", "hidden"); // Evita scroll orizzontale nel body

    function computeRowHeight() {
        // ... (la tua logica computeRowHeight è ottima, lasciala così) ...
        const N = featuresToShow.length;          
        const gapPx = 4;                          
        const minRowPx = 16;                      
        
        const bodyNode = scrollableBody.node();
        // Controllo sicurezza se il nodo non è ancora renderizzato
        if (!bodyNode) return minRowPx; 

        const bodyH = bodyNode.getBoundingClientRect().height;
        const totalGaps = (N - 1) * gapPx;
        const h = (bodyH - totalGaps) / N;
      
        if (h < minRowPx) {
            scrollableBody.style("overflow-y", "auto");
            return minRowPx;
        } else {
            scrollableBody.style("overflow-y", "hidden");
            return h;
        }
    }

    // --- 4. LISTA NUTRIENTI ---
    const customOrder = [
        "Caloric Value", "Carbohydrates", "Total Fat", "Protein",
        "Dietary Fiber", "Vitamin C", "Potassium", "Iron", "Calcium", "Magnesium", "Water",
        "Sugars", "Saturated Fats", "Cholesterol", "Sodium"
    ];

    const featuresToShow = customOrder.filter(f => state.features.includes(f) || f === "Caloric Value");
    
    // Attenzione: computeRowHeight deve essere chiamata DOPO che il container è appeso al DOM
    // Ma qui siamo sincroni, quindi ok. 
    // Per sicurezza calcoliamo l'altezza dopo aver definito featuresToShow
    let rowH = 20; // Default safe
    try { rowH = computeRowHeight(); } catch(e) {}

    featuresToShow.forEach(feature => {
        let type = "neutral";
        if (GOOD_NUTRIENTS.includes(feature)) type = "good";
        else if (BAD_NUTRIENTS.includes(feature)) type = "bad";

        let barColor, winnerColor, icon;
        if (type === "good") {
            barColor = "rgba(0, 230, 118, 0.3)"; winnerColor = "#00e676"; icon = "▲";
        } else if (type === "bad") {
            barColor = "rgba(255, 82, 82, 0.3)"; winnerColor = "#00e676"; icon = "▼"; 
        } else {
            barColor = "rgba(52, 152, 219, 0.3)"; winnerColor = "#3498db"; icon = ""; 
        }

        const unit = UNIT_MAP[feature] || "";

        const row = scrollableBody.append("div")
            .style("height", `${rowH}px`)   
            .style("display", "grid")
            .style("grid-template-columns", gridTemplate) // <--- USA LA GRIGLIA UNIFICATA ANCHE QUI
            .style("gap", "6px") 
            .style("align-items", "center");

        // Etichetta
        row.append("div")
            .text(feature)
            .style("font-size", "0.75rem")
            .style("color", "#f4f4f4")
            .style("text-align", "right")
            .style("padding-right", "10px")
            .style("white-space", "nowrap")
            .style("overflow", "hidden")
            .style("text-overflow", "ellipsis");

        const localValues = products.map(p => p[feature] || 0);
        const maxLocal = Math.max(...localValues);

        products.forEach((p) => {
            const val = p[feature] || 0;
            const barWidthPercent = maxLocal > 0 ? (val / maxLocal) * 100 : 0;
            
            const cell = row.append("div")
                .style("position", "relative")
                .style("height", "100%")                      
                .style("background", "#1a1a1a")
                .style("border-radius", "3px")
                .style("overflow", "hidden");

            cell.append("div")
                .style("position", "absolute")
                .style("top", "0").style("left", "0").style("bottom", "0")
                .style("width", `${barWidthPercent}%`)
                .style("background", barColor)
                .style("transition", "width 0.5s ease-out");

            let isHighlight = false;
            if (type === "good") isHighlight = (val === maxLocal && val > 0);
            else if (type === "bad") isHighlight = (val === Math.min(...localValues) && val < maxLocal);
            else isHighlight = (val === maxLocal && val > 0); 
            
            const unitStyle = isHighlight ? "opacity:1; font-weight:normal;" : "opacity:0.9;";

            // Testo con responsive clamp anche qui
            cell.append("div")
                .style("position", "absolute")
                .style("width", "100%").style("height", "100%")
                .style("display", "flex").style("align-items", "center").style("padding-left", "6px")
                .style("font-size", "clamp(9px, 1.4vh, 11px)")
                .style("color", isHighlight ? "#fff" : "#bbb")
                .style("font-weight", isHighlight ? "bold" : "normal")
                .style("text-shadow", "0 1px 2px #000")
                .style("white-space", "nowrap") // Evita che il numero vada a capo su schermi piccoli
                .html(`
                    ${Math.round(val*10)/10}<span style="font-size:0.85em; margin-left:1px; ${unitStyle}">${unit}</span>
                    ${(isHighlight && type !== "neutral") ? '<span style="color:'+winnerColor+'">'+icon+'</span>' : ''}
                `);
        });
    });

    // --- 5. RESIZE OBSERVER (INVARIATO) ---
    if (!window.__detailsResizeObserver) {
        window.__detailsResizeObserver = new ResizeObserver(() => {
          const body = d3.select("#details-body");
          if (body.empty()) return;
      
          const bodyNode = body.node();
          const gapPx = 4;
          const rows = bodyNode.children;
          const N = rows.length;
          if (!N) return;
      
          const minRowPx = 16;
          const bodyH = bodyNode.getBoundingClientRect().height;
          const h = (bodyH - (N - 1) * gapPx) / N;
      
          if (h < minRowPx + 1) body.style("overflow-y", "auto");
          else body.style("overflow-y", "hidden");
      
          const finalH = Math.max(minRowPx, h);
          for (const r of rows) r.style.height = `${finalH}px`;
        });
      }
      window.__detailsResizeObserver.observe(scrollableBody.node());
}

  
// --- HOVER EFFECT HELPERS ---

// Disegna una linea temporanea "Ghost" nelle coordinate parallele
function showPreviewLine(product) {
    if (!product || !xParallel || !yParallel) return;

    // Crea un layer temporaneo se non esiste
    let previewLayer = svgParallel.select(".preview-layer");
    if (previewLayer.empty()) {
        // .raise() assicura che sia SOPRA a tutto
        previewLayer = svgParallel.append("g").attr("class", "preview-layer").raise(); 
    }

    const lineGenerator = d3.line()
        .defined(d => !isNaN(d[1]) && d[1] !== undefined)
        .x(d => d[0]).y(d => d[1]);

    // Costruisci i punti
    const points = state.features.map(feature => {
        if (product[feature] === undefined || !yParallel[feature]) return [xParallel(feature), NaN];
        return [xParallel(feature), yParallel[feature](product[feature])];
    });

    // Disegna la linea
    previewLayer.append("path")
        .attr("class", "preview-line")
        .attr("d", lineGenerator(points))
        .style("fill", "none")
        .style("stroke", "#00e676") // VERDE FLUO
        .style("stroke-width", 3)
        .style("stroke-opacity", 1)
        .style("filter", "drop-shadow(0 0 5px #00e676)") // Effetto Glow
        .style("pointer-events", "none"); 
}

// Rimuove la linea temporanea
function hidePreviewLine() {
    svgParallel.selectAll(".preview-layer").remove();
}
  
// Avvio
init();