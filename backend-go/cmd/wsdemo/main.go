package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/domain/service"
	ws "github.com/Juan-Valdebenito/Taller-de-Integracion-3/backend-go/internal/websocket"
	"github.com/golang-jwt/jwt/v5"
)

const (
	demoPort      = "4000"
	demoJWTSecret = "demo-secret-key"
)

// Bus simulado
type simBus struct {
	ID         string
	RouteID    string
	Lat        float64
	Lng        float64
	Heading    float64
	Speed      float64
	Passengers int
	Capacity   int
}

var demoBuses = []simBus{
	{"BUS-101", "route-1", -38.7359, -72.5904, 180, 35, 20, 80},
	{"BUS-102", "route-1", -38.7479, -72.5971, 0, 28, 65, 80},
	{"BUS-103", "route-3", -38.7280, -72.6100, 135, 40, 42, 80},
	{"BUS-104", "route-3", -38.7440, -72.5800, 315, 22, 78, 80},
	{"BUS-105", "route-1", -38.7420, -72.5935, 200, 15, 55, 80},
}

func main() {
	// Servicio de ocupación
	occupancySvc := service.NewOccupancyService()

	// Hub WebSocket
	hub := ws.NewHub(occupancySvc)
	go hub.Run()

	wsHandler := ws.NewWSHandler(hub, demoJWTSecret, []string{
		"http://localhost:" + demoPort,
		"http://127.0.0.1:" + demoPort,
		"null", // Para archivos locales
	})

	// Generar token de demo
	token := generateDemoToken()

	// Iniciar simulador de buses
	go simulateBuses(hub, token)

	// Servir archivos estáticos y WebSocket
	mux := http.NewServeMux()
	mux.Handle("/ws", wsHandler)
	mux.HandleFunc("/", serveDemoPage)

	fmt.Println("╔══════════════════════════════════════════════════════╗")
	fmt.Println("║  🚌  WebSocket Pub/Sub Demo Server                  ║")
	fmt.Println("║                                                      ║")
	fmt.Printf("║  📡  WebSocket: ws://localhost:%s/ws                ║\n", demoPort)
	fmt.Printf("║  🌐  Demo Page: http://localhost:%s                 ║\n", demoPort)
	fmt.Println("║                                                      ║")
	fmt.Println("║  5 buses simulados emitiendo ubicación cada 2s       ║")
	fmt.Println("║  Presiona Ctrl+C para detener                        ║")
	fmt.Println("╚══════════════════════════════════════════════════════╝")

	if err := http.ListenAndServe(":"+demoPort, mux); err != nil {
		log.Fatal(err)
	}
}

func generateDemoToken() string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":    "demo-publisher",
		"email": "demo@transithub.cl",
		"role":  "COMPANY",
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	})
	tokenStr, _ := token.SignedString([]byte(demoJWTSecret))
	return tokenStr
}

func simulateBuses(hub *ws.Hub, token string) {
	// Esperar a que el hub esté listo
	time.Sleep(1 * time.Second)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		for i := range demoBuses {
			b := &demoBuses[i]

			// Mover bus aleatoriamente (~100m)
			b.Lat += (rand.Float64() - 0.5) * 0.0015
			b.Lng += (rand.Float64() - 0.5) * 0.0015

			// Mantener dentro de Temuco
			b.Lat = math.Max(-38.80, math.Min(-38.70, b.Lat))
			b.Lng = math.Max(-72.65, math.Min(-72.55, b.Lng))

			// Variar pasajeros
			delta := rand.Intn(7) - 3
			b.Passengers = int(math.Max(0, math.Min(float64(b.Capacity), float64(b.Passengers+delta))))

			// Variar velocidad
			b.Speed = 15 + rand.Float64()*35
			b.Heading = rand.Float64() * 360

			// Publicar directamente al Hub (bypass JWT ya que es interno)
			msg := &ws.PublishMessage{
				Type:  "publish",
				Token: token,
				Data: ws.BusLocationData{
					BusID:             b.ID,
					RouteID:           b.RouteID,
					Latitude:          math.Round(b.Lat*10000) / 10000,
					Longitude:         math.Round(b.Lng*10000) / 10000,
					Heading:           math.Round(b.Heading*10) / 10,
					Speed:             math.Round(b.Speed*10) / 10,
					CurrentPassengers: b.Passengers,
					Capacity:          b.Capacity,
				},
			}

			// Serializar y publicar vía el Hub's publish channel
			data, _ := json.Marshal(msg)
			_ = data // El Hub recibe directamente
			hub.Publish(msg)
		}
	}
}

func serveDemoPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, demoHTML)
}

const demoHTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🚌 TransitHub — WebSocket Pub/Sub Demo</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #0a0e1a;
    color: #e2e8f0;
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ── Header ─────────────────────────────────── */
  .header {
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    border-bottom: 1px solid rgba(99, 102, 241, 0.2);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(20px);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header h1 {
    font-size: 18px;
    font-weight: 700;
    background: linear-gradient(135deg, #818cf8, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
  }

  .header-badge {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 9999px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .connected .status-dot { background: #22c55e; }
  .connected .header-badge {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .disconnected .status-dot { background: #ef4444; animation: none; }
  .disconnected .header-badge {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .header-stats {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #64748b;
  }

  .header-stats span { font-variant-numeric: tabular-nums; }
  .stat-value { color: #c084fc; font-weight: 600; }

  /* ── Layout ─────────────────────────────────── */
  .container {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 0;
    height: calc(100vh - 57px);
  }

  /* ── Bus Grid ───────────────────────────────── */
  .bus-grid {
    padding: 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    align-content: start;
    overflow-y: auto;
  }

  .bus-card {
    background: linear-gradient(145deg, #1e1b4b 0%, #0f172a 100%);
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 16px;
    padding: 20px;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .bus-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 16px 16px 0 0;
  }

  .bus-card[data-level="LOW"]::before { background: linear-gradient(90deg, #22c55e, #4ade80); }
  .bus-card[data-level="MEDIUM"]::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
  .bus-card[data-level="HIGH"]::before { background: linear-gradient(90deg, #ef4444, #f87171); }
  .bus-card[data-level="FULL"]::before { background: linear-gradient(90deg, #7f1d1d, #dc2626); }

  .bus-card:hover {
    border-color: rgba(99, 102, 241, 0.4);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(99, 102, 241, 0.15);
  }

  .bus-card.flash {
    animation: cardFlash 0.6s ease;
  }

  @keyframes cardFlash {
    0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
    50% { box-shadow: 0 0 20px 4px rgba(99, 102, 241, 0.2); }
    100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.0); }
  }

  .bus-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .bus-id {
    font-size: 16px;
    font-weight: 700;
    color: #e2e8f0;
    letter-spacing: -0.3px;
  }

  .bus-route {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.25);
    font-weight: 500;
  }

  .bus-occupancy {
    margin-bottom: 16px;
  }

  .occupancy-bar-bg {
    width: 100%;
    height: 8px;
    background: rgba(255,255,255,0.06);
    border-radius: 9999px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .occupancy-bar-fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease;
  }

  .occupancy-label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .occupancy-text { color: #94a3b8; }
  .occupancy-ratio { font-weight: 600; font-variant-numeric: tabular-nums; }

  .bus-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-size: 11px;
    color: #64748b;
  }

  .bus-detail {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .bus-detail-icon { font-size: 13px; }
  .bus-detail-value { color: #94a3b8; font-weight: 500; font-variant-numeric: tabular-nums; }

  .prediction-badge {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 11px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .prediction-badge.low { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2); }
  .prediction-badge.medium { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2); }
  .prediction-badge.high { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); }
  .prediction-badge.full { background: rgba(127,29,29,0.1); border: 1px solid rgba(127,29,29,0.2); }

  .confidence-text { color: #64748b; font-size: 10px; }

  /* ── Event Log ──────────────────────────────── */
  .event-log {
    background: #0f0f23;
    border-left: 1px solid rgba(99, 102, 241, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .log-header {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(99, 102, 241, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .log-header h2 {
    font-size: 14px;
    font-weight: 600;
    color: #818cf8;
  }

  .log-count {
    font-size: 11px;
    color: #64748b;
    font-variant-numeric: tabular-nums;
  }

  .log-entries {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 11px;
    line-height: 1.6;
  }

  .log-entry {
    padding: 6px 10px;
    border-radius: 6px;
    margin-bottom: 3px;
    animation: slideIn 0.3s ease;
    word-break: break-all;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(10px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .log-entry.connect { background: rgba(34,197,94,0.08); color: #4ade80; }
  .log-entry.subscribe { background: rgba(99,102,241,0.08); color: #a5b4fc; }
  .log-entry.update { background: rgba(245,158,11,0.06); color: #94a3b8; }
  .log-entry.error { background: rgba(239,68,68,0.08); color: #fca5a5; }

  .log-time {
    color: #475569;
    margin-right: 6px;
    font-variant-numeric: tabular-nums;
  }

  /* ── Subscription Controls ──────────────────── */
  .sub-controls {
    padding: 12px 20px;
    border-bottom: 1px solid rgba(99, 102, 241, 0.1);
  }

  .sub-controls h3 {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 8px;
  }

  .sub-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sub-btn {
    font-size: 11px;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid rgba(99,102,241,0.3);
    background: rgba(99,102,241,0.1);
    color: #a5b4fc;
    cursor: pointer;
    font-family: inherit;
    font-weight: 500;
    transition: all 0.2s;
  }

  .sub-btn:hover {
    background: rgba(99,102,241,0.25);
    border-color: rgba(99,102,241,0.5);
  }

  .sub-btn.active {
    background: rgba(99,102,241,0.3);
    border-color: #818cf8;
    color: #e0e7ff;
    box-shadow: 0 0 12px rgba(99,102,241,0.2);
  }

  /* ── Scrollbar ──────────────────────────────── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.2); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.4); }

  /* ── Empty state ────────────────────────────── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #475569;
    gap: 12px;
    text-align: center;
    padding: 40px;
  }

  .empty-state-icon { font-size: 48px; }
  .empty-state-text { font-size: 14px; line-height: 1.6; }
</style>
</head>
<body>

<!-- Header -->
<header class="header">
  <div class="header-left">
    <h1>🚌 TransitHub — WebSocket Demo</h1>
    <div id="status-container" class="disconnected">
      <span class="header-badge">
        <span class="status-dot"></span>
        <span id="status-text">Desconectado</span>
      </span>
    </div>
  </div>
  <div class="header-stats">
    <span>Buses: <span class="stat-value" id="bus-count">0</span></span>
    <span>Mensajes: <span class="stat-value" id="msg-count">0</span></span>
    <span>Uptime: <span class="stat-value" id="uptime">0s</span></span>
  </div>
</header>

<!-- Main -->
<div class="container">
  <!-- Bus Cards -->
  <div class="bus-grid" id="bus-grid">
    <div class="empty-state">
      <div class="empty-state-icon">📡</div>
      <div class="empty-state-text">
        Conectando al WebSocket...<br>
        Los buses aparecerán aquí en tiempo real
      </div>
    </div>
  </div>

  <!-- Event Log -->
  <aside class="event-log">
    <div class="sub-controls">
      <h3>Suscripciones</h3>
      <div class="sub-buttons">
        <button class="sub-btn active" data-topic="route" data-id="route-1" onclick="toggleSub(this)">🛣️ Ruta 1</button>
        <button class="sub-btn active" data-topic="route" data-id="route-3" onclick="toggleSub(this)">🛣️ Ruta 3</button>
        <button class="sub-btn" data-topic="bus" data-id="BUS-101" onclick="toggleSub(this)">🚌 BUS-101</button>
        <button class="sub-btn" data-topic="bus" data-id="BUS-103" onclick="toggleSub(this)">🚌 BUS-103</button>
      </div>
    </div>
    <div class="log-header">
      <h2>📋 Event Log</h2>
      <span class="log-count" id="log-count">0 eventos</span>
    </div>
    <div class="log-entries" id="log-entries"></div>
  </aside>
</div>

<script>
// ── State ────────────────────────────────────────────
let ws = null;
let buses = {};
let msgCount = 0;
let logCount = 0;
let startTime = Date.now();
let activeSubs = new Set(['route:route-1', 'route:route-3']);

// ── Connect ──────────────────────────────────────────
function connect() {
  const wsUrl = 'ws://' + window.location.host + '/ws';
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    setStatus(true);
    addLog('connect', '✅ Conectado a ' + wsUrl);

    // Suscribirse a topics activos
    for (const key of activeSubs) {
      const [topic, id] = key.split(':');
      ws.send(JSON.stringify({ type: 'subscribe', topic, id }));
      addLog('subscribe', '📌 Suscrito a ' + key);
    }
  };

  ws.onmessage = (event) => {
    const messages = event.data.split('\\n');
    for (const raw of messages) {
      if (!raw.trim()) continue;
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'bus:update') {
          msgCount++;
          handleBusUpdate(msg.data);
        } else if (msg.type === 'error') {
          addLog('error', '❌ ' + msg.message);
        }
      } catch(e) {
        console.warn('Parse error:', e);
      }
    }
    document.getElementById('msg-count').textContent = msgCount;
  };

  ws.onclose = () => {
    setStatus(false);
    addLog('error', '🔌 Desconectado — reconectando en 2s...');
    setTimeout(connect, 2000);
  };

  ws.onerror = () => ws.close();
}

// ── Handle bus update ────────────────────────────────
function handleBusUpdate(data) {
  buses[data.busId] = data;
  renderBuses();
  addLog('update',
    '📍 ' + data.busId +
    ' → (' + data.latitude.toFixed(4) + ', ' + data.longitude.toFixed(4) + ')' +
    ' | 👥 ' + data.currentPassengers + '/' + data.capacity +
    (data.occupancy ? ' | ' + data.occupancy.occupancyText : '')
  );

  // Flash animation
  const card = document.getElementById('card-' + data.busId);
  if (card) {
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }
}

// ── Render buses ─────────────────────────────────────
function renderBuses() {
  const grid = document.getElementById('bus-grid');
  const ids = Object.keys(buses).sort();

  document.getElementById('bus-count').textContent = ids.length;

  if (ids.length === 0) return;

  grid.innerHTML = ids.map(id => {
    const b = buses[id];
    const ratio = b.capacity > 0 ? b.currentPassengers / b.capacity : 0;
    const pct = (ratio * 100).toFixed(0);
    const occ = b.occupancy || {};
    const level = (occ.occupancyLevel || 'LOW');
    const color = occ.occupancyColor || '#22c55e';
    const predPct = occ.predictedRatio ? (occ.predictedRatio * 100).toFixed(0) : '—';
    const conf = occ.confidence ? (occ.confidence * 100).toFixed(0) : '—';
    const levelClass = level.toLowerCase();

    return '<div class="bus-card" id="card-' + id + '" data-level="' + level + '">' +
      '<div class="bus-header">' +
        '<span class="bus-id">🚌 ' + id + '</span>' +
        '<span class="bus-route">' + b.routeId + '</span>' +
      '</div>' +
      '<div class="bus-occupancy">' +
        '<div class="occupancy-bar-bg">' +
          '<div class="occupancy-bar-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
        '</div>' +
        '<div class="occupancy-label">' +
          '<span class="occupancy-text">' + (occ.occupancyText || '—') + '</span>' +
          '<span class="occupancy-ratio" style="color:' + color + '">' + pct + '% (' + b.currentPassengers + '/' + b.capacity + ')</span>' +
        '</div>' +
      '</div>' +
      '<div class="bus-details">' +
        '<div class="bus-detail"><span class="bus-detail-icon">📍</span> <span class="bus-detail-value">' + b.latitude.toFixed(4) + ', ' + b.longitude.toFixed(4) + '</span></div>' +
        '<div class="bus-detail"><span class="bus-detail-icon">🧭</span> <span class="bus-detail-value">' + (b.heading || 0).toFixed(0) + '° / ' + (b.speed || 0).toFixed(0) + ' km/h</span></div>' +
      '</div>' +
      '<div class="prediction-badge ' + levelClass + '">' +
        '<span>📊 Predicción: <strong>' + predPct + '%</strong> ocupación</span>' +
        '<span class="confidence-text">Conf: ' + conf + '% · ' + (occ.predictorName || '—') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Subscription toggle ──────────────────────────────
function toggleSub(btn) {
  const topic = btn.dataset.topic;
  const id = btn.dataset.id;
  const key = topic + ':' + id;

  if (activeSubs.has(key)) {
    activeSubs.delete(key);
    btn.classList.remove('active');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', topic, id }));
      addLog('subscribe', '🚫 Desuscrito de ' + key);
    }
    // Remove buses from this topic
    for (const busId of Object.keys(buses)) {
      if (topic === 'route' && buses[busId].routeId === id) delete buses[busId];
      if (topic === 'bus' && busId === id) delete buses[busId];
    }
    renderBuses();
  } else {
    activeSubs.add(key);
    btn.classList.add('active');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', topic, id }));
      addLog('subscribe', '📌 Suscrito a ' + key);
    }
  }
}

// ── Status ───────────────────────────────────────────
function setStatus(connected) {
  const el = document.getElementById('status-container');
  const text = document.getElementById('status-text');
  el.className = connected ? 'connected' : 'disconnected';
  text.textContent = connected ? 'Conectado' : 'Desconectado';
}

// ── Log ──────────────────────────────────────────────
function addLog(type, message) {
  logCount++;
  const entries = document.getElementById('log-entries');
  const time = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.innerHTML = '<span class="log-time">' + time + '</span>' + message;

  entries.insertBefore(entry, entries.firstChild);

  // Limitar a 200 entradas
  while (entries.children.length > 200) entries.removeChild(entries.lastChild);

  document.getElementById('log-count').textContent = logCount + ' eventos';
}

// ── Uptime ticker ────────────────────────────────────
setInterval(() => {
  const secs = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  document.getElementById('uptime').textContent = m > 0 ? m + 'm ' + s + 's' : s + 's';
}, 1000);

// ── Start ────────────────────────────────────────────
connect();
</script>
</body>
</html>`
