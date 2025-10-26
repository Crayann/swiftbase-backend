const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const paymentService = require('../services/payment');

const router = express.Router();

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, first_name, last_name, country, created_at
       FROM users WHERE id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.post('/payment-methods', authenticateToken, async (req, res) => {
  try {
    const { type, bankDetails, cryptoDetails } = req.body;

    if (type === 'bank') {
      const result = await paymentService.linkBankAccount(req.user.userId, bankDetails);
      
      await db.query(
        `INSERT INTO payment_methods (user_id, type, bank_name, account_number_last4, routing_number)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.userId, 'bank', bankDetails.bankName, bankDetails.accountNumber.slice(-4), bankDetails.routingNumber]
      );

      res.json(result);
    } else if (type === 'crypto') {
      const result = await paymentService.linkCryptoWallet(req.user.userId, cryptoDetails);
      
      await db.query(
        `INSERT INTO payment_methods (user_id, type, wallet_address, crypto_type)
         VALUES ($1, $2, $3, $4)`,
        [req.user.userId, 'crypto', cryptoDetails.address, cryptoDetails.cryptoType]
      );

      res.json(result);
    } else {
      res.status(400).json({ error: 'Invalid payment method type' });
    }
  } catch (error) {
    console.error('Payment method error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/payment-methods', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, type, bank_name, account_number_last4, wallet_address, crypto_type, is_default, created_at
       FROM payment_methods WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch payment methods error:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

router.post('/recipients', authenticateToken, async (req, res) => {
  try {
    const { name, email, country, phoneNumber, payoutType, bankName, accountNumberLast4 } = req.body;

    const result = await db.query(
      `INSERT INTO recipients (user_id, name, email, country, phone_number, payout_type, bank_name, account_number_last4)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.userId, name, email, country, phoneNumber, payoutType, bankName, accountNumberLast4]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Add recipient error:', error);
    res.status(500).json({ error: 'Failed to add recipient' });
  }
});

router.get('/recipients', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM recipients WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch recipients error:', error);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

module.exports = router;