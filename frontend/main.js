// Configurazione
const API_URL = "http://127.0.0.1:5000/api";
// Margini aumentati in alto per ospitare etichette e slider
const MARGIN_PARALLEL = { top: 80, right: 30, bottom: 20, left: 40 }; 
const MARGIN_SCATTER = { top: 20, right: 20, bottom: 30, left: 40 };


// Stato Globale
let state = {
    features: [],
    dataRaw: [],
    weights: {},
    projection: [],
    minDominance: 0.0
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

// --- 1. COORDINATE PARALLELE ---

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
        .style("opacity", 0.4)
        .style("stroke-width", 1);

    svgParallel.append("g").attr("class", "highlight-layer");

    // Assis
    const axes = svgParallel.selectAll(".axis")
        .data(state.features).enter().append("g")
        .attr("class", "axis")
        .attr("transform", d => `translate(${xParallel(d)})`);

    axes.each(function(d) { d3.select(this).call(d3.axisLeft(yParallel[d]).ticks(0)); });

    // --- SLIDER E ETICHETTE ---
    const sliderTop = -50;   
    const sliderBottom = -10; 
    const sliderScale = d3.scaleLinear().domain([0, 1]).range([sliderBottom, sliderTop]).clamp(true);

    // Etichetta Feature (Accorciata e spostata in alto)
    axes.append("text")
        .style("text-anchor", "middle")
        .attr("y", -60) // Sopra lo slider
        .text(d => getShortLabel(d)) 
        .style("fill", "#2c3e50")
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
}

// --- 2. SCATTERPLOT ---

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
        .on("click", function(event) {
            // Se clicco sullo sfondo (non su un cerchio), resetto tutto
            if(event.target.tagName !== "circle") {
                resetHighlight();
            }
        })
        .append("g")
        .attr("transform", `translate(${MARGIN_SCATTER.left},${MARGIN_SCATTER.top})`);

    // Scale Iniziali (vuote)
    xScatter = d3.scaleLinear().range([0, width]);
    yScatter = d3.scaleLinear().range([height, 0]);

    // Assi
    xAxisScatter = svgScatter.append("g").attr("transform", `translate(0, ${height})`);
    yAxisScatter = svgScatter.append("g");
    
    // Gruppo punti
    svgScatter.append("g").attr("class", "dots");
}

function updateScatterplotVis() {
    if (!svgScatter || state.projection.length === 0) return;

    // --- FILTRAGGIO DATI (IL CUORE DELLA NUOVA FUNZIONE) ---
    // Usiamo la mappa dominanceMap per filtrare velocemente
    const filteredData = state.projection.filter(d => {
        const share = dominanceMap.get(d.id);
        return share >= state.minDominance;
    });

    console.log(`📉 Mostrando ${filteredData.length} su ${state.projection.length} prodotti (Filtro: >${state.minDominance})`);

    // 1. Aggiorna Scale
    const xExt = d3.extent(filteredData, d => d.x);
    const yExt = d3.extent(filteredData, d => d.y);
    const padX = (xExt[1] - xExt[0]) * 0.1;
    const padY = (yExt[1] - yExt[0]) * 0.1;

    xScatter.domain([xExt[0] - padX, xExt[1] + padX]);
    yScatter.domain([yExt[0] - padY, yExt[1] + padY]);

    // 2. Transizione Assi
    xAxisScatter.transition().duration(800).call(d3.axisBottom(xScatter).ticks(5));
    yAxisScatter.transition().duration(800).call(d3.axisLeft(yScatter).ticks(5));

    // 3. JOIN DEI PUNTI (Logica Core)
    const dots = svgScatter.select(".dots")
        .selectAll("circle")
        .data(filteredData, d => d.id); // IMPORTANTE: key by ID

    dots.join(
        enter => enter.append("circle")
            .attr("r", 4) // Nasce piccolo
            .attr("cx", d => xScatter(d.x))
            .attr("cy", d => yScatter(d.y))
            .attr("fill", "#27ae60")
            .attr("opacity", 0.6)
            .attr("stroke", "transparent")
            .attr("stroke-width", 10), // Trucco: aumenta l'area cliccabile invisibile
        
        update => update
            .attr("cx", d => xScatter(d.x))
            .attr("cy", d => yScatter(d.y)),
        
        exit => exit.remove()
    )
    .on("mouseover", function(event, d) {

        // 2. Recupera i dati reali
        const product = state.dataRaw.find(p => p.id === d.id);
        if (!product) return;

        if (selectedProductId === null) {
            d3.select(this).attr("r", 8).attr("opacity", 1);
        }

        // 3. Popola il Tooltip con HTML
        tooltip.html(`
            <h4>${product.food}</h4>
            <p>🔥 <b>Kcal:</b> ${Math.round(product["Caloric Value"])}</p>
            <p>🥩 <b>Protein:</b> ${product["Protein"]} g</p>
            <p>🥑 <b>Fat:</b> ${product["Total Fat"]} g</p>
            <p>🍞 <b>Carbs:</b> ${product["Carbohydrates"]} g</p>
            <p>🍬 <b>Sugar:</b> ${product["Sugars"]} g</p>
        `);

        // 4. Mostra il tooltip
        tooltip.style("visibility", "visible");
    })
    .on("mousemove", function(event) {
        // Il tooltip segue il mouse
        tooltip
            .style("top", (event.pageY - 15) + "px")
            .style("left", (event.pageX) + "px");
    })
    .on("mouseout", function() {
        tooltip.style("visibility", "hidden");
        
        // Logica conservazione colore (quella che abbiamo fatto poco fa)
        if (selectedProductId !== null) {
            if (d.id === selectedProductId) {
                // Resta evidenziato
                d3.select(this).attr("fill", "#e74c3c").attr("r", 10).attr("opacity", 1).attr("stroke", "#333");
            } else {
                // Resta verde normale
                d3.select(this).attr("fill", "#27ae60").attr("r", 4).attr("opacity", 0.6).attr("stroke", "transparent");
            }
        } else {
            // Reset completo se non c'è selezione
            d3.select(this).attr("fill", "#27ae60").attr("r", 4).attr("opacity", 0.6).attr("stroke", "transparent");
        }
    })
    .on("click", function(event, d) {
        // Ferma la propagazione per non attivare il reset dello sfondo
        event.stopPropagation();
        
        // ATTIVA IL LINKING
        highlightProduct(d.id);
    });
}

// --- FUNZIONI DI COORDINAMENTO (LINKING) ---

function highlightProduct(selectedId) {
    selectedProductId = selectedId;
    console.log("🔍 Tentativo di evidenziare ID:", selectedId);

    // 1. Reset visuale (spegni tutto)
    // 1. SCATTERPLOT: Reset di TUTTI i cerchi allo stato base
    svgScatter.select(".dots").selectAll("circle")
        .attr("fill", "#27ae60")  // Tutti VERDI
        .attr("opacity", 0.6)     // Opacità standard
        .attr("r", 5)
        .attr("stroke", "transparent");

    // 2. Modifica SOLO il cerchio selezionato
    const circle = svgScatter.select(".dots").selectAll("circle")
        .filter(d => d.id == selectedId);
        
    if (!circle.empty()) {
        circle.attr("fill", "#e74c3c") // <--- DIVENTA ROSSO
              .attr("opacity", 1)      // Pienamente visibile
              .attr("r", 10)           // Più grande
              .attr("stroke", "#333")  // Bordo nero per contrasto
              .attr("stroke-width", 2)
              .raise();                // Porta in primo piano
    }

    // 3. DISEGNO LINEA ROSSA (PARALLEL COORDINATES)
    
    // A) Trova il prodotto nei dati grezzi
    const product = state.dataRaw.find(p => p.id == selectedId);
    
    if (!product) {
        console.error("❌ ERRORE CRITICO: Prodotto non trovato in state.dataRaw!");
        return;
    }
    console.log("✅ Prodotto trovato:", product.food);

    // B) Generatore di linea "sicuro" (salta i valori mancanti invece di rompersi)
    const lineGenerator = d3.line()
        .defined(d => !isNaN(d[1]) && d[1] !== undefined && d[1] !== null) // Regola d'oro
        .x(d => d[0])
        .y(d => d[1]);

    // C) Calcola le coordinate una per una (con log per trovare il colpevole)
    const points = state.features.map(feature => {
        const xVal = xParallel(feature);
        const rawVal = product[feature];
        const yScale = yParallel[feature];
        
        // Controllo paranoico
        if (typeof rawVal === 'undefined' || !yScale) {
            console.warn(`⚠️ Attributo mancante o scala assente: ${feature}`, rawVal);
            return [xVal, NaN]; // Questo verrà saltato da .defined()
        }
        
        return [xVal, yScale(rawVal)];
    });

    const pathData = lineGenerator(points);
    
    // Debug del percorso SVG
    // console.log("Path Data:", pathData); 

    if (!pathData) {
        console.error("❌ Errore: Path Data è null. Impossibile disegnare la linea.");
        return;
    }

    // D) Disegna finalmente la linea
    const highlightLayer = svgParallel.select(".highlight-layer");
    highlightLayer.html(""); // Pulisci vecchia linea

    highlightLayer.append("path")
        .attr("d", pathData)
        .style("fill", "none")
        .style("stroke", "#e74c3c") // ROSSO ACCESO
        .style("stroke-width", 2)   // Spessore visibile ma non esagerato
        .style("opacity", 1)
        .style("pointer-events", "none"); // Click-through
        
    console.log("🖊️ Linea rossa disegnata.");
}

function resetHighlight() {
    selectedProductId = null; // Dimentica selezione

    // Reset Scatterplot: Tutti Verdi
    svgScatter.select(".dots").selectAll("circle")
        .attr("fill", "#27ae60") // Ritorna VERDE
        .attr("opacity", 0.6)
        .attr("r", 5)
        .attr("stroke", "transparent");

    svgParallel.selectAll(".bg-line")
        .style("stroke", "#bdc3c7")
        .style("opacity", 0.4);

    // Rimuovi linea evidenziata
    svgParallel.select(".highlight-layer").html("");
}

// Avvio
init();