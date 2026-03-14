// Message builder — HIPAA-safe. Never mentions OTC, benefits, insurance, Medicare.
// Accepts settings object instead of process.env.

function diffDays(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function buildMessages(customer, settings) {
  const NAME = settings.farmacia.nombre;
  const PHONE = settings.farmacia.telefono;
  const DISCOUNT = settings.farmacia.descuento_cumpleanos;
  const messages = [];
  const today = new Date();

  // --- Receta lista ---
  const receta = (customer.receta_lista || '').trim().toLowerCase();
  if (receta === '1' || receta === 'si' || receta === 'sí') {
    messages.push({
      type: 'receta_lista',
      body: `Hola ${customer.nombre}, su medicamento está listo para recogerse en ${NAME}. Pase por nuestra farmacia o llámenos al ${PHONE} si tiene alguna pregunta.`,
      script: `Hola, le llamamos de ${NAME} para informarle que su medicamento está listo para recogerse. Puede pasar por nuestra farmacia en el horario de atención. Para más información llámenos al ${PHONE}. Gracias.`,
    });
  }

  // --- Saldo por vencer ---
  if (customer.fecha_vencimiento && customer.saldo) {
    const expiry = parseDate(customer.fecha_vencimiento);
    if (expiry) {
      const days = diffDays(today, expiry);
      const saldo = parseFloat(customer.saldo).toFixed(2);
      const fechaFmt = expiry.toLocaleDateString('es-PR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      if (days === 30) {
        messages.push({
          type: 'vencimiento_30d',
          body: `Hola ${customer.nombre}, te recordamos que tienes $${saldo} en crédito disponible en ${NAME} que vence el ${fechaFmt}. ¡Visítanos antes de que expire! 🛒`,
          script: `Hola ${customer.nombre}, le llamamos de ${NAME}. Le recordamos que tiene ${saldo} dólares en crédito disponible que vence el ${fechaFmt}. Visítenos antes de que expire. Gracias.`,
        });
      } else if (days === 7) {
        messages.push({
          type: 'vencimiento_7d',
          body: `Hola ${customer.nombre}, tu crédito de $${saldo} en ${NAME} vence en 7 días (${fechaFmt}). ¡No lo dejes ir! Pasa por la tienda o llámanos al ${PHONE}.`,
          script: `Hola ${customer.nombre}, le llamamos de ${NAME}. Su crédito de ${saldo} dólares vence en 7 días, el ${fechaFmt}. No lo deje ir. Pase por la farmacia o llámenos al ${PHONE}. Gracias.`,
        });
      } else if (days === 1) {
        messages.push({
          type: 'vencimiento_1d',
          body: `⚠️ Hola ${customer.nombre}, mañana vence tu crédito de $${saldo} en ${NAME}. ¡Último día para usarlo! Llámanos al ${PHONE} si necesitas ayuda.`,
          script: `Hola ${customer.nombre}, le llamamos de ${NAME} con un recordatorio urgente. Su crédito de ${saldo} dólares vence mañana. Es su último día para usarlo. Llámenos al ${PHONE} si necesita ayuda. Gracias.`,
        });
      }
    }
  }

  // --- Cumpleaños ---
  if (customer.fecha_nacimiento) {
    const bday = parseDate(customer.fecha_nacimiento);
    if (bday && bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate()) {
      messages.push({
        type: 'cumpleanos',
        body: `🎂 ¡Feliz cumpleaños, ${customer.nombre}! De parte de toda la familia de ${NAME}, te deseamos un día increíble. Como regalo, tienes ${DISCOUNT}% de descuento en tu próxima visita esta semana. ¡Te esperamos!`,
        script: `Hola ${customer.nombre}, toda la familia de ${NAME} le desea un muy feliz cumpleaños. Como regalo especial, tiene ${DISCOUNT} por ciento de descuento en su próxima visita esta semana. Que lo disfrute mucho. Gracias.`,
      });
    }
  }

  return messages;
}

module.exports = { buildMessages };
