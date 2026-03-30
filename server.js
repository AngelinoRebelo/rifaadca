import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const TURSO_URL = process.env.TURSO_URL || '';
const TURSO_TOKEN = process.env.TURSO_TOKEN || '';

if (!MP_ACCESS_TOKEN || !TURSO_URL || !TURSO_TOKEN) {
  console.warn('Configure MP_ACCESS_TOKEN, TURSO_URL e TURSO_TOKEN no .env');
}

const mpClient = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const mpPayment = new Payment(mpClient);

async function executeTursoQuery(sql, params = []) {
  const response = await fetch(TURSO_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: params.map((p) => {
              if (p === null || p === undefined) return { type: 'null' };
              if (typeof p === 'number' && Number.isInteger(p)) return { type: 'integer', value: String(p) };
              if (typeof p === 'number') return { type: 'float', value: String(p) };
              return { type: 'text', value: String(p) };
            })
          }
        },
        { type: 'close' }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Turso HTTP ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  if (data.results?.[0]?.type === 'error') {
    throw new Error(data.results[0].error?.message || 'Erro Turso');
  }
  const result = data.results?.[0]?.response?.result;
  const rows = (result?.rows || []).map((row) =>
    row.map((cell) => {
      if (cell.type === 'null') return null;
      if (cell.type === 'integer') return parseInt(cell.value, 10);
      if (cell.type === 'float') return parseFloat(cell.value);
      return cell.value;
    })
  );
  return { rows };
}

async function atualizarStatusParticipante(participanteId, status, mpPaymentId) {
  const mp = mpPaymentId != null && mpPaymentId !== '' ? String(mpPaymentId) : '';
  if (mp) {
    await executeTursoQuery(
      `UPDATE participantes SET pagamento_status = ?, mp_payment_id = ?
       WHERE mp_payment_id = ? OR id = ?`,
      [status, mp, mp, participanteId]
    );
  } else {
    await executeTursoQuery(
      'UPDATE participantes SET pagamento_status = ?, mp_payment_id = ? WHERE id = ?',
      [status, null, participanteId]
    );
  }
}

app.post('/api/payments/mercadopago/pix', async (req, res) => {
  try {
    const { participanteId, amount, description } = req.body;
    if (!participanteId || !amount) {
      return res.status(400).json({ error: 'participanteId e amount sao obrigatorios' });
    }

    const idempotencyKey = crypto.randomUUID();
    const body = {
      transaction_amount: Number(amount),
      description: String(description || 'Pagamento de cota'),
      payment_method_id: 'pix',
      notification_url: `${req.protocol}://${req.get('host')}/api/payments/mercadopago/webhook`,
      external_reference: String(participanteId),
      payer: { email: `pagador_${participanteId}@rifas.local` }
    };

    const payment = await mpPayment.create({
      body,
      requestOptions: { idempotencyKey }
    });

    const copyPaste = payment?.point_of_interaction?.transaction_data?.qr_code || '';
    const qrBase64 = payment?.point_of_interaction?.transaction_data?.qr_code_base64 || '';

    await atualizarStatusParticipante(participanteId, 'pendente', payment?.id);

    return res.json({
      paymentId: payment?.id,
      status: payment?.status,
      copiaECola: copyPaste,
      qrCodeBase64: qrBase64
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Erro ao criar pagamento PIX' });
  }
});

app.get('/api/payments/mercadopago/status/:participanteId', async (req, res) => {
  try {
    const participanteId = Number(req.params.participanteId);
    const { rows } = await executeTursoQuery(
      'SELECT pagamento_status, mp_payment_id FROM participantes WHERE id = ?',
      [participanteId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Participante nao encontrado' });
    const [status, mpPaymentId] = rows[0];
    return res.json({ status, mpPaymentId });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao consultar status' });
  }
});

app.post('/api/payments/mercadopago/webhook', async (req, res) => {
  try {
    const topic = req.query.type || req.query.topic;
    const dataId = req.query['data.id'] || req.body?.data?.id;
    if (!topic || String(topic) !== 'payment' || !dataId) return res.sendStatus(200);

    const payment = await mpPayment.get({ id: Number(dataId) });
    const participanteId = Number(payment?.external_reference || 0);
    if (!participanteId) return res.sendStatus(200);

    const status = String(payment?.status || '').toLowerCase() === 'approved' ? 'pago' : 'pendente';
    await atualizarStatusParticipante(participanteId, status, payment?.id);
    return res.sendStatus(200);
  } catch (error) {
    console.error(error);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Mercado Pago pronto em http://localhost:${PORT}`);
});
