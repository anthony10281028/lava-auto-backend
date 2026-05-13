const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

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

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend Lava Auto activo - QR v2",
  });
});

app.get("/rutas", (req, res) => {
  res.json({
    ok: true,
    version: "QR v2",
    rutas: [
      "GET /",
      "GET /rutas",
      "POST /api/yappy/create-order-web",
      "POST /api/yappy/create-qr",
      "GET /api/yappy/caja/config-test",
      "GET /api/yappy/caja/session-test",
      "POST /api/yappy/ipn",
    ],
  });
});

// ======================================
// YAPPY BOTÓN DE PAGO / WEB CHECKOUT
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

    let validar;

    try {
      validar = await axios.post(
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
    } catch (error) {
      return res.status(500).json({
        ok: false,
        paso: "validar_comercio",
        statusHttp: error.response?.status,
        error: error.response?.data || error.message,
      });
    }

    const token = validar.data?.body?.token;

    if (!token) {
      return res.status(500).json({
        ok: false,
        paso: "validar_comercio",
        message: "Yappy no devolvió token",
        respuesta: validar.data,
      });
    }

    const orderId = `L${Date.now().toString().slice(-14)}`;
    const totalFormato = Number(total).toFixed(2);

    try {
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
        tipo: "web_checkout",
        orderId,
        data: orden.data,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        paso: "crear_orden_web",
        statusHttp: error.response?.status,
        error: error.response?.data || error.message,
      });
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      paso: "general_web",
      error: error.message,
    });
  }
});

// ======================================
// YAPPY QR EN APP / ORDEN LOCAL
// ======================================

app.post("/api/yappy/create-qr", async (req, res) => {
  try {
    const { total, concepto } = req.body;

    if (!total || isNaN(total)) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar un total válido",
      });
    }

    const orderId = `LAVA${Date.now()}`;
    const totalFormato = Number(total).toFixed(2);

    console.log("========== YAPPY QR CAJA ==========");
    console.log("ORDER_ID:", orderId);
    console.log("TOTAL:", totalFormato);
    console.log("CONCEPTO:", concepto || "Lavado Lava Auto");
    console.log("===================================");

    return res.json({
      ok: true,
      tipo: "yappy_qr_estatico",
      orderId,
      total: totalFormato,
      concepto: concepto || "Lavado Lava Auto",
      message: "Orden generada para cobro con QR Yappy en app.",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      paso: "crear_qr",
      error: error.message,
    });
  }
});

app.post("/api/yappy/create-order", async (req, res) => {
  return res.status(410).json({
    ok: false,
    message:
      "Este endpoint fue reemplazado. Usa /api/yappy/create-order-web o /api/yappy/create-qr.",
  });
});

// ======================================
// TEST CONFIG YAPPY EN CAJA
// ======================================

app.get("/api/yappy/caja/session-test", async (req, res) => {
  const unidades = ["LVAE-01", "LVAE-02"];

  const resultados = [];

  for (const unidad of unidades) {
    try {
      const response = await axios.post(
        `${YAPPY_CAJA_BASE_URL}/v1/session/login`,
        {
          body: {
            code: YAPPY_CAJA_SEED,
            groupId: "Lavaauto",
            unitId: unidad,
            deviceId: unidad,
            collectionAlias: unidad,
          },
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
        unidadCorrecta: unidad,
        data: response.data,
      });
    } catch (error) {
      resultados.push({
        unidad,
        statusHttp: error.response?.status || null,
        error: error.response?.data || error.message,
      });
    }
  }

  return res.status(500).json({
    ok: false,
    message: "No se pudo iniciar sesión con las unidades de cobro.",
    resultados,
  });
});

// ======================================
// IPN / CALLBACK YAPPY
// ======================================

app.post("/api/yappy/ipn", (req, res) => {
  console.log("IPN YAPPY:", req.body);

  return res.json({
    ok: true,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});