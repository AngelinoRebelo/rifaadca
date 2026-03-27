import crypto from 'node:crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const MP_ACCESS_TOKEN =
  process.env.MP_ACCESS_TOKEN ||
  process.env.MERCADOPAGO_ACCESS_TOKEN ||
  process.env.MP_TOKEN ||
  '';

function normalizeTursoPipelineUrl(rawUrl) {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('https://')) {
    return rawUrl.includes('/v2/pipeline') ? rawUrl : `${rawUrl.replace(/\/$/, '')}/v2/pipeline`;
  }
  if (rawUrl.startsWith('libsql://')) {
    return `${rawUrl.replace('libsql://', 'https://').replace(/\/$/, '')}/v2/pipeline`;
  }
  return rawUrl;
}

const TURSO_URL = normalizeTursoPipelineUrl(
  process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || ''
);
const TURSO_TOKEN = process.env.TURSO_TOKEN || process.env.TURSO_AUTH_TOKEN || '';

const mpClient = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const mpPayment = new Payment(mpClient);

export function ensureEnv() {
  if (!MP_ACCESS_TOKEN || !TURSO_URL || !TURSO_TOKEN) {
    throw new Error(
      'Variaveis ausentes. Configure: MP_ACCESS_TOKEN (ou MERCADOPAGO_ACCESS_TOKEN) e TURSO_URL+TURSO_TOKEN (ou TURSO_DATABASE_URL+TURSO_AUTH_TOKEN).'
    );
  }
}

export async function executeTursoQuery(sql, params = []) {
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

export async function atualizarStatusParticipante(participanteId, status, mpPaymentId) {
  await executeTursoQuery(
    'UPDATE participantes SET pagamento_status = ?, mp_payment_id = ? WHERE id = ?',
    [status, mpPaymentId || null, participanteId]
  );
}

export async function criarPagamentoPix({ participanteId, amount, description, notificationUrl }) {
  const idempotencyKey = crypto.randomUUID();
  const body = {
    transaction_amount: Number(amount),
    description: String(description || 'Pagamento de cota'),
    payment_method_id: 'pix',
    notification_url: notificationUrl,
    external_reference: String(participanteId),
    // Mercado Pago (producao) exige email com dominio valido.
    payer: { email: `pagador+${participanteId}@rifaadca.com` }
  };
  return mpPayment.create({
    body,
    requestOptions: { idempotencyKey }
  });
}

export async function buscarPagamento(paymentId) {
  return mpPayment.get({ id: Number(paymentId) });
}
