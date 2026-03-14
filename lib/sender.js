// Twilio WhatsApp + voice calls. Uses settings from store (not process.env).

const twilio = require('twilio');

function getClient(settings) {
  const { account_sid, auth_token } = settings.twilio;
  if (!account_sid || !auth_token) throw new Error('Configura las credenciales de Twilio en Configuración.');
  return twilio(account_sid, auth_token);
}

function formatWhatsApp(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `whatsapp:+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `whatsapp:+${digits}`;
  return `whatsapp:+${digits}`;
}

function formatVoice(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return `+${digits}`;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendWhatsApp(phone, body, settings) {
  const from = `whatsapp:${settings.twilio.whatsapp_from}`;
  const to = formatWhatsApp(phone);
  const msg = await getClient(settings).messages.create({ from, to, body });
  return msg.sid;
}

async function makeCall(phone, script, settings, recordingUrl = null) {
  const from = settings.twilio.call_from;
  if (!from) throw new Error('Configura TWILIO_CALL_FROM en Configuración.');
  const to = formatVoice(phone);
  // Use explicit recordingUrl arg first, then fall back to settings-level URL
  const audioUrl = recordingUrl || settings.twilio.recording_receta_url || null;
  // The phone system auto-answers before the human picks up, so Twilio starts
  // playing immediately. An 8-second pause lets the handset ring 1-2 times so
  // the person picks up INTO the silence rather than into the message.
  const twiml = audioUrl
    ? `<Response><Pause length="8"/><Play>${audioUrl}</Play></Response>`
    : `<Response><Pause length="8"/><Say voice="alice" language="es-MX">${escapeXml(script)}</Say></Response>`;
  const call = await getClient(settings).calls.create({ from, to, twiml });
  return call.sid;
}

module.exports = { sendWhatsApp, makeCall };
