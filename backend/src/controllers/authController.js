const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserModel = require('../models/userModel');
const PasswordResetTokenModel = require('../models/passwordResetTokenModel');
const { sendPasswordResetEmail } = require('../services/emailService');

const PASSWORD_RESET_TOKEN_MINUTES = Number.parseInt(process.env.PASSWORD_RESET_TOKEN_MINUTES, 10) || 30;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildResetPasswordUrl(token) {
  const explicitBase = process.env.PASSWORD_RESET_URL_BASE;
  const frontendBase = process.env.FRONTEND_APP_URL;
  const fallbackBase = 'http://localhost:3000';
  const base = (explicitBase || frontendBase || fallbackBase).replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

const authController = {
  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe obligatoires' });
      }

      const user = await UserModel.findByEmail(email.trim().toLowerCase());
      if (!user) {
        return res.status(401).json({ error: 'Identifiants invalides' });
      }

      const validPassword = await UserModel.validatePassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Identifiants invalides' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async me(req, res) {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async forgotPassword(req, res) {
    const genericResponse = {
      message: 'Si votre email existe, un lien de réinitialisation a été envoyé.',
    };

    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(200).json(genericResponse);
      }

      const user = await UserModel.findByEmail(email);
      if (!user) {
        return res.status(200).json(genericResponse);
      }

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_MINUTES * 60 * 1000);

      await PasswordResetTokenModel.create({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: buildResetPasswordUrl(token),
      });

      return res.status(200).json(genericResponse);
    } catch (err) {
      console.error(err);
      return res.status(200).json(genericResponse);
    }
  },

  async resetPassword(req, res) {
    try {
      const token = String(req.body.token || '').trim();
      const password = String(req.body.password || '');
      if (!token || !password) {
        return res.status(400).json({ error: 'Token et mot de passe sont obligatoires' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
      }

      const tokenHash = hashToken(token);
      const tokenRecord = await PasswordResetTokenModel.findValidByHash(tokenHash);
      if (!tokenRecord) {
        return res.status(400).json({ error: 'Token invalide ou expiré' });
      }

      await UserModel.updatePassword(tokenRecord.user_id, password);
      await PasswordResetTokenModel.markUsed(tokenRecord.id);
      await PasswordResetTokenModel.invalidateAllForUser(tokenRecord.user_id);

      return res.json({ message: 'Mot de passe mis à jour avec succès' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = authController;
