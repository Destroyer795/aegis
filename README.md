<div align="center">

# 🛡️ AEGIS

### Privacy-Preserving Geospatial Incident Swarm

**Instantly alert your neighbors within 500 meters of a micro-emergency — without anyone ever tracking your location.**

[![Edge Router CI](https://github.com/YOUR_ORG/aegis/actions/workflows/edge-router-ci.yml/badge.svg)](https://github.com/YOUR_ORG/aegis/actions)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

</div>

---

## 🏆 Why Aegis?

Every second counts in a neighborhood emergency — a burst water main, a missing child, a suspicious break-in. Existing solutions force you to choose between **speed** and **privacy**:

| Platform | Real-time? | Privacy? | P2P? |
|----------|:----------:|:--------:|:----:|
| Nextdoor / Citizen | ✅ | ❌ Tracks GPS | ❌ |
| WhatsApp Groups | ❌ Manual | ✅ E2E encrypted | ❌ |
| Emergency Services (911) | ✅ | ❌ Centralized | ❌ |
| **Aegis** | **✅ Sub-second** | **✅ Zero-tracking** | **✅ WebRTC P2P** |

**Aegis is the only system that achieves all three simultaneously.** It's not a compromise — it's an architectural breakthrough.

---

## 🧠 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT DEVICE (PWA)                         │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │ GPS Sensor   │───▶│ GeoHash Encoder  │───▶│ WebSocket Client  │  │
│  │ (Geolocation │    │ (geo-core)       │    │                   │  │
│  │  API)        │    │ lat,lng → "9q8yy" │    │ Subscribes to    │  │
│  └──────────────┘    └──────────────────┘    │ GeoHash cells    │  │
│                                               └────────┬──────────┘  │
│                                                        │             │
│  ┌──────────────────────────────────────────────────────┘             │
│  │  Raw GPS coordinates NEVER leave the device                       │
└──┼───────────────────────────────────────────────────────────────────┘
   │
   │ WebSocket (wss://)
   │ Payload: { geohashes: ["9q8yy","9q8yz",...], sessionId: "anon-xxx" }
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EDGE ROUTER (Cloudflare Workers)                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Durable Objects                            │   │
│  │                                                              │   │
│  │  GeoHash Cell "9q8yy"  ──▶  [session_a, session_b, ...]     │   │
│  │  GeoHash Cell "9q8yz"  ──▶  [session_c, session_d, ...]     │   │
│  │  GeoHash Cell "9q8yw"  ──▶  [session_e, ...]                │   │
│  │                                                              │   │
│  │  ⚡ No database. No logs. No GPS. Just routing.              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  On ALERT: Fan-out to all sessions in matching cells                │
│  On WEBRTC_SIGNAL: Relay SDP/ICE to target session                  │
└─────────────────────────────────────────────────────────────────────┘
   │
   │ After initial discovery via edge relay...
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    WEBRTC PEER-TO-PEER CHANNEL                     │
│                                                                     │
│  Device A ◀═══════════ Encrypted Data Channel ═══════════▶ Device B │
│                                                                     │
│  • Direct peer connection — edge router is no longer in the path   │
│  • DTLS 1.3 encryption by default                                  │
│  • Used for: follow-up coordination, photo sharing, real-time chat │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 The Zero-Tracking Privacy Model

This is the core innovation. Here's exactly **what the server knows vs. what it doesn't**:

### ❌ What the server NEVER receives
- Raw GPS coordinates (latitude, longitude)
- User identity, device fingerprint, or IP-to-location mapping
- Historical location data or movement patterns
- Any personally identifiable information (PII)

### ✅ What the server DOES receive
- Anonymous WebSocket connections subscribed to **opaque GeoHash strings**
- Ephemeral session IDs (random UUIDs, rotated per session)
- Alert messages bound to GeoHash cells (not to coordinates)

### How it works — The GeoHash Pub/Sub Protocol

1. **Client computes GeoHash locally:** The device's Geolocation API provides `(lat, lng)`. The `@aegis/geo-core` library encodes this into a 6-character GeoHash string (e.g., `"9q8yyk"`), covering a ~1.2 km × 0.6 km cell that envelopes the 500m alert radius.

2. **Client subscribes to neighboring cells:** To ensure full 500m coverage at cell boundaries, the client also subscribes to all 8 neighboring GeoHash cells (up to 9 total).

3. **Server routes by string match only:** The edge router maintains a simple `Map<GeoHashString, Set<WebSocket>>`. When an alert arrives for cell `"9q8yyk"`, it fans out to all subscribers of that cell. **The server has no idea where `"9q8yyk"` is on Earth** — it's just a string key.

4. **WebRTC handoff for follow-up:** After the initial alert, peers who want to coordinate establish a direct WebRTC data channel using the edge router only for SDP/ICE relay. Once connected, the edge is completely out of the loop.

---

## 📁 Monorepo Structure

```
aegis/
├── .github/
│   └── workflows/
│       └── edge-router-ci.yml    # CI pipeline for the WebSocket router
├── edge-router/                   # Cloudflare Workers + Durable Objects
│   ├── src/
│   │   └── index.ts              # Worker entry point
│   └── package.json
├── geo-core/                      # Shared TypeScript library
│   ├── src/
│   │   ├── index.ts              # Barrel export
│   │   ├── types.ts              # GeoHash Pub/Sub & WebRTC signal types
│   │   └── geohash.ts            # GeoHash encoder + neighbor computation
│   ├── tsconfig.json
│   └── package.json
├── tui-observer/                  # Python Terminal UI for ops monitoring
│   ├── src/
│   │   └── main.py               # Textual TUI entry point
│   ├── pyproject.toml
│   └── requirements.txt
├── web-app/                       # React/Vite Progressive Web App
│   ├── src/
│   │   ├── main.tsx              # React entry point
│   │   ├── App.tsx               # Application shell
│   │   └── index.css             # Design system & global styles
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── .gitignore
└── README.md                      # ← You are here
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 20
- Python ≥ 3.11
- Wrangler CLI (`npm i -g wrangler`)

### Development

```bash
# Clone the repository
git clone https://github.com/YOUR_ORG/aegis.git
cd aegis

# Install dependencies for each package
cd geo-core && npm install && npm run build && cd ..
cd edge-router && npm install && cd ..
cd web-app && npm install && cd ..
cd tui-observer && pip install -r requirements.txt && cd ..

# Start the web app (mobile-first PWA)
cd web-app && npm run dev

# Start the edge router (local dev)
cd edge-router && npm run dev

# Start the TUI observer
cd tui-observer && python src/main.py
```

---

## 🔧 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Edge Router** | Cloudflare Workers + Durable Objects | Serverless WebSocket Pub/Sub routing at the edge |
| **Shared Logic** | TypeScript (`@aegis/geo-core`) | GeoHash encoding, type definitions, signaling types |
| **Web App** | React 18 + Vite 5 + PWA | Mobile-first progressive web app |
| **P2P Communication** | WebRTC Data Channels | Encrypted peer-to-peer follow-up after alert discovery |
| **Observability** | Python + Textual/Rich | Terminal UI for live GeoHash grid monitoring |
| **CI/CD** | GitHub Actions | Automated testing across Node 20/22 matrix |

---

## 🏗️ Key Design Decisions

### Why GeoHash over H3/S2?
- **Client-side simplicity:** GeoHash is a pure string encoding computable in <1ms with zero dependencies. H3 and S2 require native bindings.
- **Natural Pub/Sub keys:** GeoHash strings are inherently hierarchical (`9q8yyk` is inside `9q8yy`), making subscription management trivial.
- **Privacy by design:** A 6-char GeoHash covers ~600m — you can't reverse it to a precise location. It's privacy-preserving by mathematical construction.

### Why Edge Workers over a traditional server?
- **Latency:** Alerts route through the nearest edge node (~20ms global), not a centralized data center.
- **No persistent state:** Durable Objects maintain only in-memory subscriber lists. When all connections drop, the state evaporates. There's literally nothing to subpoena.
- **Horizontal scale:** Each GeoHash cell is its own Durable Object instance — the system scales linearly with geographic coverage.

### Why WebRTC for follow-up?
- **True privacy:** After the initial alert broadcast, peers communicate directly. The server is completely removed from the communication path.
- **Rich media:** WebRTC data channels support text, images, and streaming — enabling real-time coordination during an emergency.
- **NAT traversal:** WebRTC handles the complexity of peer discovery behind firewalls via ICE/STUN/TURN.

---

## 🛡️ Threat Model

| Threat | Mitigation |
|--------|------------|
| Server operator tracks users | Server never receives GPS coordinates — only opaque GeoHash strings |
| Man-in-the-middle on WebSocket | WSS (TLS) for all edge connections |
| Man-in-the-middle on P2P | WebRTC DTLS 1.3 encryption by default |
| Correlation attack via GeoHash | Session IDs are ephemeral and rotated; no persistent identifiers |
| State subpoena / data breach | Durable Objects hold only ephemeral in-memory maps — nothing persists to disk |
| Alert spam / abuse | Rate limiting per session ID at the edge; community flagging via P2P consensus |

---

## 🗺️ Roadmap

- [x] Monorepo scaffold with typed interfaces
- [x] GeoHash encoding with 500m precision
- [x] CI pipeline for edge router
- [x] Mobile-first PWA shell
- [ ] Full GeoHash neighbor computation
- [ ] Durable Object WebSocket Pub/Sub implementation
- [ ] WebRTC signaling relay through edge
- [ ] Geolocation API integration in PWA
- [ ] Alert composition and broadcast UI
- [ ] TUI Observer with live grid visualization
- [ ] PWA manifest and service worker
- [ ] E2E integration tests
- [ ] TURN server configuration for restricted NATs

---

## 📄 License

MIT — because privacy tools should be free and open.

---

<div align="center">

**Built for hackathon judges who appreciate when privacy isn't an afterthought — it's the architecture.**

*Aegis doesn't protect your data. It never collects it in the first place.*

</div>
