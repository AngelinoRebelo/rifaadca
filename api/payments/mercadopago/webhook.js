import { atualizarStatusParticipante, buscarPagamento, ensureEnv } from '../../_lib/payments.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    ensureEnv();
    const topic = req.query.type || req.query.topic;
    const dataId = req.query['data.id'] || req.body?.data?.id;
    if (!topic || String(topic) !== 'payment' || !dataId) return res.status(200).json({ ok: true });

    const payment = await buscarPagamento(dataId);
    const participanteId = Number(payment?.external_reference || 0);
    if (!participanteId) return res.status(200).json({ ok: true });

    const status = String(payment?.status || '').toLowerCase() === 'approved' ? 'pago' : 'pendente';
    await atualizarStatusParticipante(participanteId, status, payment?.id);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(200).json({ ok: true });
  }
}
