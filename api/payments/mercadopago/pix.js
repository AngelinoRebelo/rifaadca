import { atualizarStatusParticipante, criarPagamentoPix, ensureEnv } from '../../_lib/payments.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    ensureEnv();
    const { participanteId, amount, description } = req.body || {};
    if (!participanteId || !amount) {
      return res.status(400).json({ error: 'participanteId e amount sao obrigatorios' });
    }

    const notificationUrl = `https://${req.headers.host}/api/payments/mercadopago/webhook`;
    const payment = await criarPagamentoPix({
      participanteId,
      amount,
      description,
      notificationUrl
    });

    const copyPaste = payment?.point_of_interaction?.transaction_data?.qr_code || '';
    const qrBase64 = payment?.point_of_interaction?.transaction_data?.qr_code_base64 || '';
    await atualizarStatusParticipante(participanteId, 'pendente', payment?.id);

    return res.status(200).json({
      paymentId: payment?.id,
      status: payment?.status,
      copiaECola: copyPaste,
      qrCodeBase64: qrBase64
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao criar pagamento PIX' });
  }
}
