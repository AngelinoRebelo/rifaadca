import { atualizarStatusParticipante, buscarPagamento, ensureEnv, executeTursoQuery } from '../../../_lib/payments.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    ensureEnv();
    const participanteId = Number(req.query.participanteId);
    const { rows } = await executeTursoQuery(
      'SELECT pagamento_status, mp_payment_id FROM participantes WHERE id = ?',
      [participanteId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Participante nao encontrado' });

    let [status, mpPaymentId] = rows[0];

    // Fallback: garante sincronizacao mesmo sem webhook.
    if (String(status || '').toLowerCase() !== 'pago' && mpPaymentId) {
      try {
        const payment = await buscarPagamento(mpPaymentId);
        const syncedStatus = String(payment?.status || '').toLowerCase() === 'approved' ? 'pago' : 'pendente';
        await atualizarStatusParticipante(participanteId, syncedStatus, payment?.id || mpPaymentId);
        status = syncedStatus;
        mpPaymentId = payment?.id || mpPaymentId;
      } catch (syncErr) {
        // Mantem status atual em erro temporario de consulta ao MP.
      }
    }

    return res.status(200).json({ status, mpPaymentId });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao consultar status' });
  }
}
