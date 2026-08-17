# Voice Udhar (વોઇસ ઉધાર)

Monorepo for Voice Udhar - Shopkeeper Billing & Udhaar Tracker.

## Features

- **Onboarding**: Fast shopkeeper setup with persistent local storage.
- **Voice Recording & AI Processing**: Record Gujarati voice billing commands, process with Gemini AI, preview extracted customer & amount details, edit if needed ("Sudharo"), and save transactions seamlessly ("Save ho gaya!").
- **Bilingual Interface**: Gujarati primary script with English/Hindi secondary support, optimized for mobile devices.

## Projects

- [`/backend`](./backend): Express.js REST API with Firestore database and Gemini AI integration.
- [`/frontend`](./frontend): React/Vite progressive web app (PWA) with mobile-first voice recording design.

## Local Development Instructions

### 1. Backend Setup
```bash
cd backend
npm install
USE_MOCK_DB=true USE_MOCK_GEMINI=true npm start
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
