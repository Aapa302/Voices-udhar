# Voice Udhar Backend

Node.js / Express API for shopkeeper billing and credit (`udhaar`) tracker with Firestore.

## Endpoints Summary

### Health Check
- `GET /health`: Health status endpoint.

### Shopkeepers
- `POST /api/shopkeepers`: Create a shopkeeper account.
  - Body: `{ "shopName": "Sharma Store", "phone": "9876543210" }`
  - Returns: `{ shopkeeperId, shopName, phone, apiKey, createdAt }`
- `GET /api/shopkeepers/:id`: Retrieve shopkeeper details.

### Customers (Requires Header `x-api-key: <apiKey>`)
- `POST /api/customers`: Add or update customer.
  - Body: `{ "shopkeeperId": "...", "name": "Ramesh", "phone": "9876543210", "totalUdhaar": 100 }`
- `GET /api/customers/:shopkeeperId`: Retrieve list of all customers for a shopkeeper with `totalUdhaar`.

### Transactions (Requires Header `x-api-key: <apiKey>`)
- `POST /api/transactions`: Log a transaction and update customer's `totalUdhaar`.
  - Body: `{ "shopkeeperId": "...", "customerId": "...", "type": "udhaar_add" | "udhaar_paid" | "sale", "amount": 50, "items": ["Sugar"], "rawVoiceText": "..." }`
- `GET /api/transactions/:customerId`: Retrieve transaction history for a customer.

## Local Setup & Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup environment variables:
   Copy `.env.example` to `.env` and populate your Firebase Admin configuration:
   ```env
   PORT=5000
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-client-email
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

3. Run locally:
   ```bash
   npm run dev
   ```

4. Run unit/integration tests:
   ```bash
   npm test
   ```

## Render Deployment

This service can be deployed on Render free tier:
1. Connect the GitHub repository to Render.
2. Select **Web Service** with Root Directory set to `backend`.
3. Set Build Command: `npm install`
4. Set Start Command: `npm start`
5. Configure Environment Variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
