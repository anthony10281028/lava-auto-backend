const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const YAPPY_CAJA_BASE_URL = process.env.YAPPY_CAJA_BASE_URL;
const YAPPY_CAJA_API_KEY = process.env.YAPPY_CAJA_API_KEY;
const YAPPY_CAJA_SECRET_KEY = process.env.YAPPY_CAJA_SECRET_KEY;

const YAPPY_DEVICE_ID = process.env.YAPPY_DEVICE_ID || "LVAE01-01";
const YAPPY_DEVICE_NAME = process.env.YAPPY_DEVICE_NAME || "Caja 1";
const YAPPY_DEVICE_USER = process.env.YAPPY_DEVICE_USER || "acruz1028";
const YAPPY_GROUP_ID = process.env.YAPPY_GROUP_ID || "LVAE-01";

let yappyToken = null;

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend Lava Auto activo - Yappy en Caja Dinámico",
  });
});

app.get("/rutas", (req, res) => {
  res.json({
    ok: true,
    version: "Yappy Caja Dinamico v2",
    rutas: [
      "GET /",
      "GET /rutas",
      "POST /api/yappy/create-qr",
      "GET /api/yappy/caja/session-test",
      "POST /api/yappy/caja/create-payment",
      "GET /api/yappy/caja/transaction/:transactionId",
      "DELETE /api/yappy/caja/session",
      "POST /api/yappy/ipn",
    ],
  });
});

// ======================================
// ABRIR SESIÓN YAPPY EN CAJA
// ======================================

async function abrirSesionYappy() {
  const response = await axios.post(
    `${YAPPY_CAJA_BASE_URL}/session/device`,
    {
      body: {
        device: {
          id: YAPPY_DEVICE_ID,
          name: YAPPY_DEVICE_NAME,
          user: YAPPY_DEVICE_USER,
        },
        group_id: YAPPY_GROUP_ID,
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

  const token =
    response.data?.body?.token ||
    response.data?.body?.access_token ||
    response.data?.token ||
    response.data?.access_token;

  if (!token) {
    throw new Error(
      "Yappy no devolvió token de sesión: " + JSON.stringify(response.data)
    );
  }

  yappyToken = token;

  return {
    token,
    data: response.data,
  };
}

// ======================================
// QR ESTÁTICO LOCAL - RESPALDO
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

    return res.json({
      ok: true,
      tipo: "yappy_qr_estatico",
      orderId,
      total: totalFormato,
      concepto: concepto || "Lavado Lava Auto",
      qrImage: "local",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      paso: "crear_qr_estatico",
      error: error.message,
    });
  }
});

// ======================================
// TEST SESIÓN YAPPY EN CAJA
// ======================================

app.get("/api/yappy/caja/session-test", async (req, res) => {
  try {
    console.log("==== YAPPY CAJA SESSION TEST ====");
    console.log("BASE URL:", YAPPY_CAJA_BASE_URL);
    console.log("API KEY:", YAPPY_CAJA_API_KEY ? "CARGADA" : "VACÍA");
    console.log("SECRET:", YAPPY_CAJA_SECRET_KEY ? "CARGADA" : "VACÍA");
    console.log("DEVICE:", YAPPY_DEVICE_ID);
    console.log("GROUP:", YAPPY_GROUP_ID);

    const session = await abrirSesionYappy();

    return res.json({
      ok: true,
      message: "Sesión abierta correctamente",
      data: session.data,
    });
  } catch (error) {
    console.log("ERROR YAPPY SESSION:");
    console.log(error.response?.data || error.message);

    return res.status(500).json({
      ok: false,
      paso: "session_device",
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

    const totalFormato = Number(total).toFixed(2);
    const totalNumero = Number(totalFormato);
    const orderId = `LAVA${Date.now()}`;

    if (!yappyToken) {
      await abrirSesionYappy();
    }

    const qrResponse = await axios.post(
      `${YAPPY_CAJA_BASE_URL}/qr/generate/DYN`,
      {
        body: {
          charge_amount: {
            sub_total: totalNumero,
            tax: 0,
            tip: 0,
            discount: 0,
            total: totalNumero,
          },
          order_id: orderId,
          description: concepto || `Lavado Lava Auto ${placa || ""}`,
        },
      },
      {
        headers: {
          "api-key": YAPPY_CAJA_API_KEY,
          "secret-key": YAPPY_CAJA_SECRET_KEY,
          Authorization: `Bearer ${yappyToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const transactionId =
      qrResponse.data?.body?.transactionId ||
      qrResponse.data?.body?.transaction_id ||
      qrResponse.data?.transactionId ||
      qrResponse.data?.transaction_id;

    const hash = qrResponse.data?.body?.hash || qrResponse.data?.hash;

    if (!transactionId || !hash) {
      return res.status(500).json({
        ok: false,
        paso: "generar_qr_dinamico",
        message: "Yappy no devolvió transactionId/hash",
        respuesta: qrResponse.data,
      });
    }

    const qrPayload = JSON.stringify({
      transactionId,
      hash,
    });

    return res.json({
      ok: true,
      tipo: "yappy_qr_dinamico",
      orderId,
      transactionId,
      hash,
      total: totalFormato,
      concepto: concepto || "Lavado Lava Auto",
      qrPayload,
      respuestaYappy: qrResponse.data,
    });
  } catch (error) {
    console.log("ERROR CREAR QR YAPPY:");
    console.log(error.response?.data || error.message);

    yappyToken = null;

    return res.status(500).json({
      ok: false,
      paso: "crear_pago_yappy_caja",
      statusHttp: error.response?.status || null,
      error: error.response?.data || error.message,
    });
  }
});

// ======================================
// CONSULTAR TRANSACCIÓN
// ======================================

app.get("/api/yappy/caja/transaction/:transactionId", async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!yappyToken) {
      await abrirSesionYappy();
    }

    const response = await axios.get(
      `${YAPPY_CAJA_BASE_URL}/transaction/${transactionId}`,
      {
        headers: {
          "api-key": YAPPY_CAJA_API_KEY,
          "secret-key": YAPPY_CAJA_SECRET_KEY,
          Authorization: `Bearer ${yappyToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return res.json({
      ok: true,
      data: response.data,
    });
  } catch (error) {
    console.log("ERROR CONSULTAR TRANSACCIÓN:");
    console.log(error.response?.data || error.message);

    return res.status(500).json({
      ok: false,
      paso: "consultar_transaccion",
      statusHttp: error.response?.status || null,
      error: error.response?.data || error.message,
    });
  }
});

// ======================================
// CERRAR SESIÓN
// ======================================

app.delete("/api/yappy/caja/session", async (req, res) => {
  try {
    if (!yappyToken) {
      return res.json({
        ok: true,
        message: "No hay sesión activa",
      });
    }

    const response = await axios.delete(
      `${YAPPY_CAJA_BASE_URL}/session/device`,
      {
        headers: {
          "api-key": YAPPY_CAJA_API_KEY,
          "secret-key": YAPPY_CAJA_SECRET_KEY,
          Authorization: `Bearer ${yappyToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    yappyToken = null;

    return res.json({
      ok: true,
      message: "Sesión cerrada correctamente",
      data: response.data,
    });
  } catch (error) {
    console.log("ERROR CERRAR SESIÓN:");
    console.log(error.response?.data || error.message);

    return res.status(500).json({
      ok: false,
      paso: "cerrar_sesion",
      statusHttp: error.response?.status || null,
      error: error.response?.data || error.message,
    });
  }
});

// ======================================
// IPN / CALLBACK
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