import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Single Order Notification Endpoint
  app.post("/api/orders/notify", async (req, res) => {
    try {
      const { order } = req.body;
      
      if (!order) {
        return res.status(400).json({ error: "Order data is required" });
      }

      console.log(`New Order Received: ${order.id}`);

      // 1. Log to Google Sheets if configured
      if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID) {
        try {
          const auth = new google.auth.JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
          });

          const sheets = google.sheets({ version: 'v4', auth });
          const spreadsheetId = process.env.GOOGLE_SHEET_ID;

          const orderRow = [
            order.id,
            new Date().toISOString(),
            order.shippingAddress.fullName,
            order.shippingAddress.email,
            order.shippingAddress.phone,
            order.total,
            order.status,
            order.paymentMethod,
            order.items.map((item: any) => `${item.name} (x${item.quantity})`).join(', ')
          ];

          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Orders!A:I',
            valueInputOption: 'RAW',
            requestBody: { values: [orderRow] },
          });
          
          console.log(`Order ${order.id} appended to Google Sheets`);
        } catch (sheetError) {
          console.error("Google Sheets Logging Error:", sheetError);
          // Don't fail the whole request if sheets fail
        }
      }

      // 2. Email Notification (Mock or Real Service)
      // In a real app, you'd use SendGrid, Mailgun, or Nodemailer here.
      // For now, we'll log it to the server console.
      console.log("--- EMAIL NOTIFICATION ---");
      console.log(`To: ${process.env.ADMIN_EMAIL || 'admin@example.com'}`);
      console.log(`Subject: New Order #${order.id}`);
      console.log(`Customer: ${order.shippingAddress.fullName}`);
      console.log(`Total: $${order.total}`);
      console.log("---------------------------");

      res.json({ success: true, message: "Order notification processed" });
    } catch (error: any) {
      console.error("Order Notification Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Google Sheets Sync Endpoint
  app.post("/api/admin/sync-sheets", async (req, res) => {
    try {
      const { orders, products } = req.body;
      
      // Check if Google credentials are provided
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SHEET_ID) {
        return res.status(400).json({ 
          error: "Google Sheets credentials not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID to your environment variables." 
        });
      }

      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = process.env.GOOGLE_SHEET_ID;

      // Sync Orders
      if (orders && orders.length > 0) {
        const orderData = orders.map((order: any) => [
          order.id,
          order.createdAt,
          order.shippingAddress.fullName,
          order.shippingAddress.email,
          order.total,
          order.status,
          order.paymentMethod,
          order.items.map((item: any) => `${item.name} (x${item.quantity})`).join(', ')
        ]);

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Orders!A2',
          valueInputOption: 'RAW',
          requestBody: { values: orderData },
        });
      }

      // Sync Products
      if (products && products.length > 0) {
        const productData = products.map((product: any) => [
          product.id,
          product.name,
          product.category,
          product.price,
          product.stock,
          product.rating
        ]);

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Products!A2',
          valueInputOption: 'RAW',
          requestBody: { values: productData },
        });
      }

      res.json({ success: true, message: "Data synced to Google Sheets successfully" });
    } catch (error: any) {
      console.error("Sheets Sync Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
