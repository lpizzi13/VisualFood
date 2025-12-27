// Configurazione
const API_URL = "http://127.0.0.1:5000/api";
// Margini aumentati in alto per ospitare etichette e slider
let MARGIN_PARALLEL = { top: 80, right: 30, bottom: 20, left: 60 };
const MARGIN_SCATTER = { top: 20, right: 20, bottom: 30, left: 40 };

const COMPARE_COLORS = [
    "#e74c3c", // 1. Rosso (Principale)
    "#3498db", // 2. Blu (Confronto A)
    "#f1c40f"  // 3. Giallo Oro (Confronto B)
];

// Stato Globale
let state = {
    features: [],
    dataRaw: [],
    weights: {},
    projection: [],
    minDominance: 1.0,
    selectedIds: [],
    brushSelections: {}
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

// Variabili D3 Globali
let svgParallel, xParallel, yParallel = {};
let svgScatter, xScatter, yScatter, xAxisScatter, yAxisScatter;
let scatterContainerSize = { width: 0, height: 0 };
let tooltip;
let selectedProductId = null;
let dominanceMap = new Map(); // Lookup veloce ID -> Share
let yBrush;
let scatterBrush;



// Helper per determinare il colore di un punto
function getPointColor(id) {
    const idx = state.selectedIds.indexOf(id);
    if (idx > -1) return COMPARE_COLORS[idx]; // È selezionato: usa il suo colore
    return "#00e676"; // Non è selezionato: Verde base
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
    return state.selectedIds.includes(id) ? 10 : 4;
}

// Helper per il bordo
function getPointStroke(id) {
    return state.selectedIds.includes(id) ? "#333" : "transparent";
}

async function init() {
    console.log("🚀 Avvio applicazione...");
    try {
        const metaRes = await fetch(`${API_URL}/metadata`);
        const metadata = await metaRes.json();
        
        state.features = metadata.features;
        state.dataRaw = metadata.data;
        
        // Inizializza pesi a 1.0
        state.features.forEach(f => state.weights[f] = 1.0);

        // Associa ID -> dominant_share per accesso O(1)
        state.dataRaw.forEach(d => {
            dominanceMap.set(d.id, +d.dominant_share || 0);
        });
        setupDominanceFilter();

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

    const bgLayer = svgParallel.append("g").attr("class", "background-layer");

    // Disegna Linee (Campione 20%)
    const sampleData = state.dataRaw.length > 400 ? state.dataRaw.filter(() => Math.random() < 0.2) : state.dataRaw;
    
    bgLayer.selectAll("path")
        .data(sampleData)
        .enter().append("path")
        .attr("class", "bg-line")
        .attr("d", d => d3.line()(state.features.map(p => [xParallel(p), yParallel[p](d[p])])))
        .style("fill", "none")
        .style("stroke", "#bdc3c7")
        .style("opacity", d => {
            // Usa la stessa logica di updateParallelLines
            return isProductVisible(d, d.id) ? 0.6 : 0.01; 
        })
        .style("stroke-width", 1);

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
    if (state.selectedIds.length > 0) {
        updateParallelLines();
    }
    restoreBrushVisuals();
}

function updateParallelLines() {
    // 1. Gestione Sfondo
    svgParallel.selectAll(".bg-line")
        // FIX COLORE: Usa sempre un grigio chiaro. 
        // Prima usavamo #333 che sul nero spariva creando l'effetto "sfocato".
        .style("stroke", "#bdc3c7") 
        
        // FIX OPACITÀ: Gestione netta della visibilità
        .style("opacity", d => {
            // A. Se il prodotto è nascosto (Purity o Brush), rendilo quasi invisibile
            if (!isProductVisible(d, d.id)) return 0.01; 

            // B. Se è visibile:
            // - Se c'è una selezione attiva (pallini rossi), abbassa lo sfondo (focus context)
            // - Se NON c'è selezione (reset), alza l'opacità a 0.6 così è ben nitido
            return state.selectedIds.length > 0 ? 0.15 : 0.6;
        })
        // Opzionale: porta in primo piano le linee visibili se necessario, 
        // ma di solito l'opacità basta.
        .style("stroke-width", 1);

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
    updateBrushVisuals();
    if (event.type === 'end') {
        updateScatterplotVis();
    }
}

function updateBrushVisuals() {
    // A. AGGIORNA SCATTERPLOT
    // Dobbiamo dire allo scatterplot quali punti sono "attivi" (brushed) e quali no.
    // Invece di filtrare via i punti (rimuoverli), li rendiamo trasparenti, così si vede il contesto.
    
    svgScatter.select(".dots").selectAll("circle")
        .attr("display", d => {
            // 1. Check Purity (Fondamentale mantenere coerenza col filtro esistente)
            const purity = dominanceMap.get(d.id);
            if (purity < state.minDominance) return "none"; // Nascondi completamente se non passa la purity

            // 2. Check Brushes
            const product = state.dataRaw.find(p => p.id === d.id);
            if (!product) return "none";

            const isBrushed = isProductBrushed(product);
            
            // Se è spazzolato lo mostriamo, altrimenti "none" (o opacity bassa se preferisci context)
            // Consiglio: "none" per chiarezza se sono tanti dati, opacity ridotta se sono pochi.
            // Proviamo con Opacity nel prossimo step, qui usiamo display per performance estrema.
            return isBrushed ? "block" : "none";
        });

    // B. AGGIORNA PARALLEL COORDINATES (Linee di Sfondo)
    // Nascondiamo le linee grigie che non rientrano nella selezione
    svgParallel.selectAll(".bg-line")
        .style("stroke", "#bdc3c7")
        .style("opacity", d => {
             // Se c'è una selezione specifica (rosso/blu), lo sfondo è quasi invisibile (0.05)
             // Altrimenti è 0.4.
             const baseOpacity = state.selectedIds.length > 0 ? 0.15 : 0.6;
             
             // Se il prodotto non passa il brush, diventa invisibile
             return isProductVisible(d, d.id) ? baseOpacity : 0.02; // 0.02 = quasi invisibile ma c'è
        })
        // Opzionale: colora di grigio scuro quelle non selezionate per farle sparire nel nero
        .style("display", d => isProductVisible(d, d.id) ? "block" : "none")
        .style("stroke-width", 1);
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
        // 1. Filtro Purity
        const share = dominanceMap.get(d.id);
        if (share < state.minDominance) return false;

        // 2. Filtro Brush (Nuovo!)
        // Nota: dobbiamo recuperare il dato grezzo per controllare i valori nutrizionali
        // È costoso farlo qui per 5000 punti. 
        // TRUCCO: Se non ci sono brush attivi, salta il controllo pesante.
        if (Object.keys(state.brushSelections).length === 0) return true;

        const product = state.dataRaw.find(p => p.id === d.id);
        return isProductBrushed(product);
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
            .attr("stroke-width", 2),
        
        // UPDATE: Punti esistenti (Movimento istantaneo + Aggiornamento Stile)
        update => update
            .attr("cx", d => xScatter(d.x))
            .attr("cy", d => yScatter(d.y))
            // Qui applichiamo lo stile corrente (Multi-Selezione)
            .attr("r", d => getPointRadius(d.id))
            .attr("fill", d => getPointColor(d.id))
            .attr("opacity", d => getPointOpacity(d.id))
            .attr("stroke", d => getPointStroke(d.id))
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
                <h4>${product.food}</h4>
                <div style="font-size:11px; color:#aaa; margin-bottom:5px">Purity: ${Math.round(product.dominant_share*100)}%</div>
                <p>🔥 ${Math.round(product["Caloric Value"])} Kcal</p>
            `);
            tooltip.style("visibility", "visible");
        }

        // B. EVIDENZIAZIONE VISIVA (PREVIEW)
        // Se il punto NON è già selezionato, facciamolo "brillare" per far capire che è cliccabile
        if (!state.selectedIds.includes(d.id)) {
            d3.select(this)
                .attr("r", 8)
                .attr("opacity", 1)
                .attr("fill", "#8e44ad"); // Ciano (Colore di anteprima/hover)
        }
    })
    .on("mousemove", function(event) {
        tooltip.style("top", (event.pageY - 15) + "px").style("left", (event.pageX) + "px");
    })
    .on("mouseout", function(event, d) {
        tooltip.style("visibility", "hidden");
        
        // C. RIPRISTINO STATO CORRETTO
        // Quando il mouse esce, il punto deve tornare esattamente come deve essere
        // secondo la logica della selezione globale.
        d3.select(this)
            .attr("r", getPointRadius(d.id))
            .attr("fill", getPointColor(d.id))
            .attr("opacity", getPointOpacity(d.id))
            .attr("stroke", getPointStroke(d.id));
    })
    .on("click", function(event, d) {
        event.stopPropagation();
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
            .style("text-shadow", "0 1px 0 #fff, 1px 0 0 #fff, 0 -1px 0 #fff, -1px 0 0 #fff")
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
    updateBrushVisuals();   
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
    // TRUCCO: Lo inseriamo PRIMA (.insert) del ".highlight-layer" così le linee rosse stanno sopra.
    // Se ".highlight-layer" non esiste ancora, lo appenderà alla fine.
    let ghostLayer = svgParallel.select(".ghost-layer");
    if (ghostLayer.empty()) {
        // Cerca highlight-layer per inserirsi sotto
        if (!svgParallel.select(".highlight-layer").empty()) {
            ghostLayer = svgParallel.insert("g", ".highlight-layer").attr("class", "ghost-layer");
        } else {
            ghostLayer = svgParallel.append("g").attr("class", "ghost-layer");
        }
    }

    ghostLayer.html(""); // Pulisci le vecchie ghost lines

    // Performance: Se selezioni 1000 punti, disegnarne 1000 è pesante e inutile.
    // Ne disegniamo massimo 200 a caso per dare l'idea del "fascio".
    const maxLines = 200;
    const renderData = points.length > maxLines 
        ? points.filter(() => Math.random() < (maxLines / points.length)) 
        : points;

    console.log(`👻 Disegno ${renderData.length} ghost lines.`);

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
            .style("stroke", "#00e676") // Bianco/Grigio chiaro
            .style("stroke-width", 1.5)
            .style("opacity", 0.4) // Molto trasparente (effetto fumo)
            .style("pointer-events", "none")
            .style("opacity", 0)
            .transition().duration(200)
            .style("opacity", 0.4);
    });
}

// Avvio
init();