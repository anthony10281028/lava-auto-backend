const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// ======================================
// VARIABLES
// ======================================

const BASE_URL = process.env.YAPPY_PAYMENT_BASE_URL;
const MERCHANT_ID = process.env.YAPPY_MERCHANT_ID;
const DOMAIN = process.env.YAPPY_DOMAIN;
const ALIAS_YAPPY = process.env.YAPPY_ALIAS;
const IPN_URL = process.env.YAPPY_IPN_URL;
const SECRET_KEY = process.env.YAPPY_SECRET_KEY;

const YAPPY_CAJA_BASE_URL = process.env.YAPPY_CAJA_BASE_URL;
const YAPPY_CAJA_API_KEY = process.env.YAPPY_CAJA_API_KEY;
const YAPPY_CAJA_SECRET_KEY = process.env.YAPPY_CAJA_SECRET_KEY;
const YAPPY_CAJA_SEED = process.env.YAPPY_CAJA_SEED;

// ======================================
// ENCRIPTAR SEMILLA
// ======================================

function encryptSeed(seed, secretKey) {
  try {
    const key = Buffer.from(secretKey, "base64");

    const iv = Buffer.alloc(16, 0);

    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      key,
      iv
    );

    let encrypted = cipher.update(
      seed,
      "utf8",
      "base64"
    );

    encrypted += cipher.final("base64");

    return encrypted;
  } catch (error) {
    console.log("ERROR ENCRYPT:", error.message);
    return seed;
  }
}

// ======================================
// ROOT
// ======================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend Lava Auto activo - Yappy Caja",
  });
});

// ======================================
// RUTAS
// ======================================

app.get("/rutas", (req, res) => {
  res.json({
    ok: true,
    version: "Yappy Caja v2",
    rutas: [
      "GET /",
      "GET /rutas",
      "POST /api/yappy/create-order-web",
      "GET /api/yappy/caja/session-test",
      "POST /api/yappy/caja/create-payment",
      "POST /api/yappy/ipn",
    ],
  });
});

// ======================================
// BOTÓN DE PAGO
// ======================================

app.post("/api/yappy/create-order-web", async (req, res) => {
  try {
    const { total } = req.body;

    if (!total || isNaN(total)) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar un total válido",
      });
    }

    const validar = await axios.post(
      `${BASE_URL}/payments/validate/merchant`,
      {
        merchantId: MERCHANT_ID,
        urlDomain: DOMAIN,
      },
      {
        headers: {
          "Content-Type": "application/json",
          secretKey: SECRET_KEY,
        },
        timeout: 15000,
      }
    );

    const token = validar.data?.body?.token;

    if (!token) {
      return res.status(500).json({
        ok: false,
        message: "Yappy no devolvió token",
      });
    }

    const orderId = `L${Date.now()}`;
    const totalFormato = Number(total).toFixed(2);

    const orden = await axios.post(
      `${BASE_URL}/payments/payment-wc`,
      {
        merchantId: MERCHANT_ID,
        orderId,
        domain: DOMAIN,
        paymentDate: new Date().toISOString(),
        aliasYappy: ALIAS_YAPPY,
        ipnUrl: IPN_URL,
        discount: "0.00",
        taxes: "0.00",
        subtotal: totalFormato,
        total: totalFormato,
      },
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return res.json({
      ok: true,
      orderId,
      data: orden.data,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.response?.data || error.message,
    });
  }
});

// ======================================
// TEST LOGIN YAPPY CAJA
// ======================================

app.get("/api/yappy/caja/session-test", async (req, res) => {
  try {
    console.log("==== LOGIN YAPPY ====");
    console.log("BASE URL:", YAPPY_CAJA_BASE_URL);
    console.log(
      "API KEY:",
      YAPPY_CAJA_API_KEY ? "CARGADA" : "VACÍA"
    );
    console.log(
      "SECRET:",
      YAPPY_CAJA_SECRET_KEY ? "CARGADA" : "VACÍA"
    );
    console.log(
      "SEED:",
      YAPPY_CAJA_SEED ? "CARGADA" : "VACÍA"
    );
    console.log("=====================");

    const encryptedSeed = encryptSeed(
      YAPPY_CAJA_SEED,
      YAPPY_CAJA_SECRET_KEY
    );

    console.log("SEED ENCRYPTED:", encryptedSeed);

    const loginResponse = await axios.post(
      `${YAPPY_CAJA_BASE_URL}/v1/session/login`,
      {
        code: encryptedSeed,
      },
      {
        headers: {
          "api-key": YAPPY_CAJA_API_KEY,
          "secret-key": YAPPY_CAJA_SECRET_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return res.json({
      ok: true,
      data: loginResponse.data,
    });
  } catch (error) {
    console.log("ERROR YAPPY LOGIN:");
    console.log(error.response?.data || error.message);

    return res.status(500).json({
      ok: false,
      paso: "login_yappy_caja",
      statusHttp: error.response?.status || null,
      error: error.response?.data || error.message,
    });
  }
});

// ======================================
// CREAR QR DINÁMICO
// ======================================

app.post("/api/yappy/caja/create-payment", async (req, res) => {
  try {
    const { total, concepto, placa } = req.body;

    if (!total || isNaN(total)) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar un total válido",
      });
    }

    const orderId = `LAVA${Date.now()}`;
    const totalFormato = Number(total).toFixed(2);

    const encryptedSeed = encryptSeed(
      YAPPY_CAJA_SEED,
      YAPPY_CAJA_SECRET_KEY
    );

    // LOGIN
    const loginResponse = await axios.post(
      `${YAPPY_CAJA_BASE_URL}/v1/session/login`,
      {
        code: encryptedSeed,
      },
      {
        headers: {
          "api-key": YAPPY_CAJA_API_KEY,
          "secret-key": YAPPY_CAJA_SECRET_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const sessionToken =
      loginResponse.data?.body?.token ||
      loginResponse.data?.token ||
      loginResponse.data?.access_token ||
      loginResponse.data?.body?.access_token;

    if (!sessionToken) {
      return res.status(500).json({
        ok: false,
        message: "Yappy no devolvió token",
        respuesta: loginResponse.data,
      });
    }

    // CREAR QR
    const paymentResponse = await axios.post(
      `${YAPPY_CAJA_BASE_URL}/v1/payments/qr`,
      {
        orderId,
        amount: totalFormato,
        description:
          concepto ||
          `Lavado Lava Auto ${placa || ""}`,
        currency: "USD",
      },
      {
        headers: {
          "api-key": YAPPY_CAJA_API_KEY,
          "secret-key": YAPPY_CAJA_SECRET_KEY,
          Authorization: sessionToken,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const qrImage =
      paymentResponse.data?.body?.qr ||
      paymentResponse.data?.body?.qrImage ||
      paymentResponse.data?.qr ||
      paymentResponse.data?.qrImage;

    return res.json({
      ok: true,
      orderId,
      total: totalFormato,
      qrImage,
      respuestaYappy: paymentResponse.data,
    });
  } catch (error) {
    console.log("ERROR CREAR PAGO:");
    console.log(error.response?.data || error.message);

    return res.status(500).json({
      ok: false,
      statusHttp: error.response?.status || null,
      error: error.response?.data || error.message,
    });
  }
});

// ======================================
// IPN
// ======================================

app.post("/api/yappy/ipn", (req, res) => {
  console.log("IPN YAPPY:", req.body);

  return res.json({
    ok: true,
  });
});

// ======================================
// START
// ======================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});