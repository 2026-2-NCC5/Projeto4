/** Formato documentado da Cloud API (developers.facebook.com, consultado em 02/11/2026). Valores fictícios. */
export const PHONE_NUMBER_ID = '100000000000001';

export const inboundText = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '5511888880000', phone_number_id: PHONE_NUMBER_ID },
            contacts: [{ profile: { name: 'Aluno Teste' }, wa_id: '5511999990000' }],
            messages: [{ from: '5511999990000', id: 'wamid.X1', timestamp: '1793600000', type: 'text', text: { body: 'Oi' } }],
          },
        },
      ],
    },
  ],
};

export const inboundDocument = {
  ...inboundText,
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: PHONE_NUMBER_ID },
            contacts: [{ profile: { name: 'Aluno Teste' }, wa_id: '5511999990000' }],
            messages: [{ from: '5511999990000', id: 'wamid.D1', timestamp: '1793600000', type: 'document', document: { id: 'MEDIA123', mime_type: 'application/pdf', filename: 'historico.pdf', caption: 'Segue' } }],
          },
        },
      ],
    },
  ],
};

export const failedStatus = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: PHONE_NUMBER_ID },
            statuses: [{ id: 'wamid.X2', status: 'failed', timestamp: '1793600000', recipient_id: '5511999990000', errors: [{ code: 131047, title: 'Re-engagement message', message: 'More than 24 hours', error_data: { details: '...' } }] }],
          },
        },
      ],
    },
  ],
};

export const readStatus = {
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA_ID', changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE_NUMBER_ID }, statuses: [{ id: 'wamid.X2', status: 'read', timestamp: '1793600000', recipient_id: '5511999990000' }] } }] }],
};

export const otherNumber = {
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA_ID', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '999' }, messages: [{ from: '5511999990000', id: 'wamid.Z', timestamp: '1793600000', type: 'text', text: { body: 'x' } }] } }] }],
};
