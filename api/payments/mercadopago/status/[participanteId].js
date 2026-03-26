import { ensureEnv, executeTursoQuery } from '../../../_lib/payments.js';

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

    const [status, mpPaymentId] = rows[0];
    return res.status(200).json({ status, mpPaymentId });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro ao consultar status' });
  }
}
