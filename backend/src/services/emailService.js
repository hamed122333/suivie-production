const nodemailer = require('nodemailer');

let transporter;

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!hasSmtpConfig()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset link for ${to}: ${resetUrl}`);
    } else {
      console.warn('SMTP is not configured; password reset email could not be sent.');
    }
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const info = await getTransporter().sendMail({
    from,
    to,
    subject: 'Réinitialisation de mot de passe - Suivi Production',
    text: `Bonjour ${name || ''},\n\nCliquez sur ce lien pour réinitialiser votre mot de passe :\n${resetUrl}\n\nCe lien expire dans 30 minutes.`,
    html: `
      <p>Bonjour ${name || ''},</p>
      <p>Cliquez sur le lien suivant pour réinitialiser votre mot de passe :</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>Ce lien expire dans 30 minutes.</p>
    `,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Password reset email sent: ${info.messageId}`);
  }
}

module.exports = { sendPasswordResetEmail };
