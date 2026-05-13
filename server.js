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

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend Lava Auto activo",
  });
});

app.post("/api/yappy/create-order", async (req, res) => {
  try {
    const { total } = req.body;

    if (!total || isNaN(total)) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar un total válido",
      });
    }

    console.log("========== CONFIG YAPPY ==========");
    console.log("BASE_URL:", BASE_URL);
    console.log("MERCHANT_ID:", MERCHANT_ID ? "CARGADO" : "VACÍO");
    console.log("DOMAIN:", DOMAIN);
    console.log("ALIAS_YAPPY:", ALIAS_YAPPY);
    console.log("IPN_URL:", IPN_URL);
    console.log("TOTAL:", total);
    console.log("==================================");

    // =========================
    // PASO 1: VALIDAR COMERCIO
    // =========================

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
          },
          timeout: 15000,
        }
      );

      console.log("VALIDAR COMERCIO OK:", JSON.stringify(validar.data, null, 2));
    } catch (error) {
      console.log("ERROR EN VALIDAR COMERCIO");
      console.log("STATUS:", error.response?.status);
      console.log("DATA:", JSON.stringify(error.response?.data, null, 2));
      console.log("MESSAGE:", error.message);

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

    // =========================
    // PASO 2: CREAR ORDEN
    // =========================

    const orderId = `L${Date.now().toString().slice(-14)}`;
    const totalFormato = Number(total).toFixed(2);

    try {
      const orden = await axios.post(
        `${BASE_URL}/payments/payment-wc`,
        {
          merchantId: MERCHANT_ID,
          orderId: orderId,
          domain: DOMAIN,
          paymentDate: Date.now(),
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

      console.log("CREAR ORDEN OK:", JSON.stringify(orden.data, null, 2));

      return res.json({
        ok: true,
        orderId: orderId,
        data: orden.data,
      });
    } catch (error) {
      console.log("ERROR EN CREAR ORDEN");
      console.log("STATUS:", error.response?.status);
      console.log("DATA:", JSON.stringify(error.response?.data, null, 2));
      console.log("MESSAGE:", error.message);

      return res.status(500).json({
        ok: false,
        paso: "crear_orden",
        statusHttp: error.response?.status,
        error: error.response?.data || error.message,
      });
    }
  } catch (error) {
    console.log("ERROR GENERAL:", error.message);

    return res.status(500).json({
      ok: false,
      paso: "general",
      error: error.message,
    });
  }
});

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