# Integracao Mercado Pago PIX

Este projeto ja esta preparado no front-end para chamar:

- `POST /api/payments/mercadopago/pix`
- `GET /api/payments/mercadopago/status/:participanteId`
- `POST /api/payments/mercadopago/webhook`

## 1) Configurar backend

1. Copie `.env.example` para `.env`
2. Preencha:
   - `MP_ACCESS_TOKEN`
   - `TURSO_URL`
   - `TURSO_TOKEN`
3. Instale dependencias:
   - `npm install`
4. Rode:
   - `npm start`

## 2) Configurar webhook no Mercado Pago

No painel do Mercado Pago, configure a URL de notificacao para:

- `https://SEU-DOMINIO/api/payments/mercadopago/webhook`

Para ambiente local, use tunel (`ngrok`, `cloudflared`) apontando para `localhost:3000`.

## 3) Fluxo

1. Usuario clica em `Pagar` na aba `Pagamento da Cota`
2. Front chama o endpoint `/pix`
3. Backend cria cobranca PIX no MP, salva `mp_payment_id` e retorna QR/copia e cola
4. Front exibe QR
5. Ao pagar, MP chama webhook
6. Backend marca `pagamento_status = 'pago'`
7. Front consulta `/status/:participanteId` e atualiza tela automaticamente

## 4) Observacoes

- Enquanto backend nao estiver rodando, o front cai em fallback local de QR.
- Em producao, proteja webhook por assinatura e restrinja CORS.
