# CardioTwin-X — Real-Time Cardiac Digital Twin (Frontend)

A browser-based 3D digital twin of the human heart — built to simulate live cardiac physiology (ECG, pressure-volume loops, strain) and double up as a teaching tool for cardiology concepts.

🔗 Live app: https://cardiotwin-frontend-ten.vercel.app

---

## About this project

CardioTwin-X was built as a group internship project at **MARS Lab (C-IoT), PES University**, under Faculty Guide **Prof. Shruthi**, over a 16-week internship. It's a 3-member team project — the idea was to take a real-time cardiac physics engine running on the backend and give it a face: something a clinician (or a student) could actually look at, poke around in, and learn from.

There are two halves to the system:
- A **physics/simulation backend** (FastAPI + a cardiac engine) that computes volume, pressure, ECG, and strain data in real time.
- This repo — the **frontend** — which renders all of that as an interactive 3D heart you can rotate, slice open, isolate chambers in, and watch beat in sync with live ECG and PV-loop graphs.

This repo is the React app only. The backend (CardioDigitalTwin, Python/FastAPI) lives in a separate repository maintained by my teammate.

## My role

I was the **Systems Lead for the 3D Viewer & Learning Systems** — meaning the entire frontend, plus wiring it up to the backend, was mine. Specifically:

- Built the **3D heart viewer** from scratch using React Three Fiber / Three.js — full heart view, chamber isolation, MRI-style cross-section slicing, and a strain heatmap view, all driven off real STL/GLB mesh files.
- Built the **live ECG and pressure-volume loop graphs** (Chart.js) that update off the same data stream driving the 3D model, so the heartbeat, the ECG trace, and the PV loop all stay in sync.
- Built the **disease preset system** — sliders for preload, afterload, contractility, infarct %, and valve area that feed straight into the backend physics engine, plus a full library of pre-built disease states (see below).
- Built the **education mode** end-to-end: flashcard deck, an ECG-reading quiz, a clinical case simulator with branching questions, a side-by-side disease comparison panel, and a guided walkthrough mode — all synced to the 3D model so the heart actually reacts as you progress through them.
- Handled the **frontend-backend integration**: connecting the React app to the FastAPI server over WebSocket for live data, with an HTTP-polling fallback, automatic reconnection, and tracking down a few CORS issues on the backend side that were silently breaking the connection.
- Took in the 3D mesh files and MRI metrics from a teammate and got them properly loaded and mapped inside the viewer.

## Features

**View Mode (clinical)**
- Full 3D heart model with real anatomical mesh, rotatable and zoomable
- Chamber isolation view
- Cross-section slice view (horizontal/vertical, adjustable)
- Strain heatmap overlay
- Live ECG waveform + pressure-volume loop, streamed at 100ms intervals
- Manual sliders (preload, afterload, contractility, infarct %, valve area) that directly drive the simulation
- Built-in disease preset library:
  - Heart failure — DCM, HCM, ICM, HFpEF, PPCM
  - Valve disease — Aortic Stenosis, Mitral Regurgitation, Mitral Stenosis, Aortic Regurgitation
  - Athlete heart — endurance vs. strength-trained patterns
  - Myocardial infarction — STEMI (anterior/inferior), NSTEMI, chronic MI with scarring
  - Arrhythmias — AFib, complete heart block, ventricular tachycardia
  - Pericardial disease — cardiac tamponade, constrictive pericarditis
- Patient selector pulling MRI-derived baseline metrics (EF, EDV, ESV, wall thickness)
- Live backend connection indicator with auto-reconnect

**Education Mode**
- Flashcard deck for core concepts
- ECG-reading quiz
- Clinical case simulator (history → exam → diagnosis, scored)
- Side-by-side compare panel for two disease states at once
- Guided, step-by-step learning walkthrough
- Progress tracker

## Tech stack

- **React 19** — UI
- **Three.js + @react-three/fiber + @react-three/drei** — 3D heart rendering
- **Chart.js / react-chartjs-2** — ECG and PV loop graphs
- **WebSocket API** — live data streaming from the backend (100ms cadence), with HTTP polling as a fallback if the socket drops
- Plain CSS (no UI framework) for styling
- Deployed on **Vercel**

Backend side (separate repo, built by a teammate): **FastAPI + Uvicorn**, with a WebSocket endpoint (`/ws`) and REST endpoints for starting/stopping the simulation, pushing presets, and pulling patient metrics.

## How the frontend talks to the backend

The data layer (`src/services/apiService.js`) is the one file everything else depends on. It:

- Opens a WebSocket connection to the backend on `/ws` and listens for state pushes every 100ms (volume, pressure, ECG, strain).
- Falls back to polling the `/state` REST endpoint every 200ms if the WebSocket can't connect or drops.
- Auto-reconnects the socket (up to 10 attempts with increasing delay) if the backend restarts or the connection is interrupted.
- Posts slider/preset changes to `/params` so they reach the physics engine on the backend in real time.
- Pulls patient MRI baselines from `/metrics`.

## Running it locally

You'll need both the backend and this frontend running together.

**Backend** (in the `CardioDigitalTwin` folder):
```bash
cd CardioDigitalTwin
python -m venv env
env\Scripts\activate        # Windows
source env/bin/activate     # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --reload
```
Check it's up at `http://127.0.0.1:8000` — you should see `{"status":"ok","message":"CardioTwin running"}`.

**Frontend** (this repo):
```bash
npm install
npm start
```
Open `http://localhost:3000`. If the backend is running, the header will show a green "Backend Live" indicator and the metrics panel will show "● LIVE".

If you're running the backend on a different machine on the same network, update `API_BASE` and `WS_BASE` in `src/services/apiService.js` to point to that machine's IP, and add it to the backend's CORS allow-list in `main.py`.

## Project structure

```
src/
├── App.js                     # main app shell, view/education mode toggle
├── components/
│   ├── HeartModel.jsx          # base 3D heart render
│   ├── ChamberHeart.jsx        # chamber isolation view
│   ├── SlicedHeart.jsx         # cross-section slice view
│   ├── DeformableHeart.jsx     # strain heatmap view
│   ├── ECGGraph.jsx            # live ECG chart
│   ├── PVLoop.jsx              # pressure-volume loop chart
│   ├── DiseasePresets.jsx      # full disease preset library
│   ├── PatientSelector.jsx     # MRI metrics / patient picker
│   ├── APIStatus.jsx           # backend connection indicator
│   └── education/              # flashcards, quiz, clinical cases, etc.
├── services/
│   └── apiService.js           # WebSocket + REST integration layer
├── hooks/
│   ├── useHeartbeat.js
│   └── useHeartData.js
└── data/
    └── metrics.json            # bundled patient baseline data
```

## Note

This was built as a 16-week internship deliverable, not a production medical device — it's a simulation and learning tool, not something used for actual diagnosis. Mesh data and physics are simplified for the purpose of visualization and teaching.
