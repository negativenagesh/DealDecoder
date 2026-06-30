# DealDecoder

[![GitHub stars](https://img.shields.io/github/stars/negativenagesh/DealDecoder?style=social)](https://github.com/negativenagesh/DealDecoder/stargazers)
[![Frontend (Vercel)](https://img.shields.io/badge/Vercel-Live-black?style=social&logo=vercel)](https://deal-decoder-two.vercel.app)
[![Backend (Render)](https://img.shields.io/badge/Render-Live-black?style=social&logo=render)](https://dealdecoder-backend.onrender.com)

![DealDecoder Demo](demo/dealdecoder.gif)

DealDecoder is a customer-facing cart pricing engine that automatically applies and stacks discount rules. The architecture consists of a React frontend and a FastAPI backend designed for complex NLP and Vision tasks using Gemini and NVIDIA NIM.

## Live Deployment

- **Frontend (Vercel)**: [https://deal-decoder-two.vercel.app](https://deal-decoder-two.vercel.app)
- **Backend (Render)**: [https://dealdecoder-backend.onrender.com](https://dealdecoder-backend.onrender.com)

> **Note:** The backend is currently deployed on Render's free tier. If the server receives no traffic for 15 minutes, it spins down. If you visit the frontend and requests are hanging or taking 50+ seconds, the backend is experiencing a "cold start" and is waking up. Please be patient!

## Architecture

1. **Frontend**: Vite + React. Client-side handling of CSV parsing and dynamic UI state. Deployed securely on Vercel edge networks.
2. **Backend**: FastAPI + Python. Houses the core logic (`engine.py`) and AI orchestration (`llm.py`). Deployed as a scalable Docker container on Render.
3. **AI Models**:
   - `gemini-2.5-flash`: Fast, high-accuracy model used for PDF cart extraction (Vision) and NL rule parsing.
   - `stepfun-ai/step-3.7-flash`: Advanced reasoning model streamed via SSE for rule parsing validation.

## Local Execution (Under 3 Steps)

The fastest and most reliable way to execute the system locally is via Docker Compose.

1. **Environment Setup**
   Ensure `.env` exists in the root directory with the required credentials:

   ```env
   NVIDIA_NIM_API_KEY=your_nvidia_key
   GEMINI_API_KEY=your_gemini_key
   ```

2. **Execute via Docker**

   ```bash
   docker compose up --build
   ```

3. **Access the Application**
   - Frontend is available at `http://localhost:5173`
   - Backend API is available at `http://localhost:8000`

## Manual Execution (uv)

If you prefer to run the environment manually on bare metal, utilize `uv`, the fast Python package manager.

### Backend Setup

```bash
cd backend
uv venv
source .venv/bin/activate
uv pip install -e .
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup

```bash
cd src
npm install
npm run dev
```

## Deployment Strategy

### Frontend (Vercel)

1. Link your GitHub repository to Vercel.
2. Set the Build Command to `npm run build` and Output Directory to `dist`.
3. Add the Environment Variable `VITE_API_URL` pointing to your Render backend URL (e.g., `https://dealdecoder-backend.onrender.com`).

### Backend (Render)

1. Create a new Web Service on Render linked to this repository.
2. Select **Docker** as the runtime environment.
3. Set the Root Directory to `backend` or configure Render to use `backend/Dockerfile`.
4. Add the `NVIDIA_NIM_API_KEY` and `GEMINI_API_KEY` environment variables in the Render dashboard. Render will automatically inject the `PORT` environment variable which the Docker container binds to.
