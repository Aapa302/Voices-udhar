# Voice Udhar (વોઇસ ઉધાર)

Monorepo for Voice Udhar - Shopkeeper Billing & Udhaar Tracker.

## Projects

- [`/backend`](./backend): Express.js REST API with Firestore database integration.
- [`/frontend`](./frontend): React/Vite progressive web app (PWA) with mobile-first design and bilingual support (Gujarati / English).

## Local Development Instructions

### 1. Backend Setup
```bash
cd backend
npm install
USE_MOCK_DB=true npm start
```
The backend API will run on `http://localhost:5000` (or configured `PORT`).

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The frontend application will run on `http://localhost:3000`. API requests to `/api` are automatically proxied to the backend.

## Deployment (Render)

Both services are configured for automatic deployment on Render via `render.yaml`.

- **Backend**: Node.js Web Service (`rootDir: backend`)
- **Frontend**: Static Web Site (`rootDir: frontend`, build command: `npm install && npm run build`, publish path: `dist`)
