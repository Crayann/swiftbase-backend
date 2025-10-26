const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const exchangeRateService = require('../services/exchangeRate');
const paymentService = require('../services/payment');
const xrplService = require('../services/xrpl');

const router = express.Router();

// ============================================
// ROUTE 1: Compare Routes
// ============================================
router.post('/compare-routes', authenticateToken, async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;

    // Validate input
    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, fromCurrency, toCurrency' 
      });
    }

    if (amount < 10) {
      return res.status(400).json({ 
        error: 'Minimum transfer amount is $10' 
      });
    }

    // Get real exchange rate
    const rateData = await exchangeRateService.getRate(fromCurrency, toCurrency);
    const rate = rateData.rate;

    // Calculate different routes
    const routes = [
      {
        provider: 'SwiftBridge XRPL',
        type: 'xrpl_direct',
        amountSent: amount,
        fee: amount * 0.01, // 1% fee
        exchangeRate: rate * 0.997, // 0.3% spread
        estimatedTime: '5-10 minutes',
        amountReceived: ((amount - amount * 0.01) * rate * 0.997).toFixed(2),
        savings: 0,
        recommended: true,
        description: 'Fast blockchain transfer via XRPL network'
      },
      {
        provider: 'Traditional Bank Transfer',
        type: 'bank_transfer',
        amountSent: amount,
        fee: amount * 0.05 + 5, // 5% + $5 flat fee
        exchangeRate: rate * 0.97, // 3% markup
        estimatedTime: '1-3 business days',
        amountReceived: ((amount - (amount * 0.05 + 5)) * rate * 0.97).toFixed(2),
        savings: 0,
        recommended: false,
        description: 'Standard international wire transfer'
      },
      {
        provider: 'Competitor Service',
        type: 'competitor',
        amountSent: amount,
        fee: amount * 0.015 + 3, // 1.5% + $3
        exchangeRate: rate * 0.99, // 1% markup
        estimatedTime: '1 business day',
        amountReceived: ((amount - (amount * 0.015 + 3)) * rate * 0.99).toFixed(2),
        savings: 0,
        recommended: false,
        description: 'Third-party remittance service'
      }
    ];

    // Calculate savings compared to traditional
    const traditionalAmount = parseFloat(routes[1].amountReceived);
    routes.forEach(route => {
      const saved = parseFloat(route.amountReceived) - traditionalAmount;
      route.savings = saved.toFixed(2);
      route.savingsPercent = ((saved / traditionalAmount) * 100).toFixed(2);
    });

    // Sort by amount received (best first)
    routes.sort((a, b) => parseFloat(b.amountReceived) - parseFloat(a.amountReceived));

    res.json({ 
      routes,
      midMarketRate: rate,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Compare routes error:', error);
    res.status(500).json({ 
      error: 'Failed to compare routes',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE 2: Create Transaction
// ============================================
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { 
      recipientId, 
      paymentMethodId, 
      amount, 
      fromCurrency, 
      toCurrency, 
      routeType,
      notes 
    } = req.body;

    // Validate required fields
    if (!recipientId || !paymentMethodId || !amount || !fromCurrency || !toCurrency || !routeType) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    // Validate amount
    if (amount < 10 || amount > 10000) {
      return res.status(400).json({ 
        error: 'Amount must be between $10 and $10,000' 
      });
    }

    // Verify recipient belongs to user
    const recipientCheck = await db.query(
      'SELECT id FROM recipients WHERE id = $1 AND user_id = $2',
      [recipientId, req.user.userId]
    );

    if (recipientCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Recipient not found or does not belong to you' 
      });
    }

    // Verify payment method belongs to user
    const paymentCheck = await db.query(
      'SELECT id FROM payment_methods WHERE id = $1 AND user_id = $2',
      [paymentMethodId, req.user.userId]
    );

    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Payment method not found or does not belong to you' 
      });
    }

    // Get exchange rate
    const rateData = await exchangeRateService.getRate(fromCurrency, toCurrency);
    const exchangeRate = rateData.rate * 0.997; // Apply spread

    // Calculate fee and received amount
    const fee = amount * 0.01; // 1% fee
    const amountReceived = (amount - fee) * exchangeRate;

    // Create transaction in database
    const result = await db.query(
      `INSERT INTO transactions 
       (sender_id, recipient_id, payment_method_id, amount_sent, currency_sent, 
        currency_received, exchange_rate, fee, status, route_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        req.user.userId,
        recipientId,
        paymentMethodId,
        amount,
        fromCurrency,
        toCurrency,
        exchangeRate,
        fee,
        'processing',
        routeType,
        notes || null
      ]
    );

    const transactionId = result.rows[0].id;

    // Respond immediately
    res.json({
      transactionId,
      status: 'processing',
      message: 'Transaction initiated successfully',
      estimatedCompletion: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    });

    // Process transaction in background (don't await)
    processTransaction(
      transactionId, 
      req.user.userId, 
      recipientId, 
      paymentMethodId, 
      amount, 
      fromCurrency, 
      toCurrency, 
      exchangeRate, 
      amountReceived
    );

  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ 
      error: 'Failed to create transaction',
      message: error.message 
    });
  }
});

// ============================================
// Background Transaction Processing
// ============================================
async function processTransaction(
  transactionId, 
  senderId, 
  recipientId, 
  paymentMethodId, 
  amount, 
  fromCurrency, 
  toCurrency, 
  exchangeRate, 
  amountReceived
) {
  try {
    console.log(`⏳ Processing transaction ${transactionId}...`);

    // Step 1: Process payment from sender (mock for hackathon)
    console.log(`💳 Processing payment of ${amount} ${fromCurrency}...`);
    const paymentResult = await paymentService.processPayment(
      paymentMethodId,
      amount,
      fromCurrency
    );

    if (!paymentResult.success) {
      throw new Error('Payment processing failed');
    }
    console.log(`✅ Payment captured: ${paymentResult.transactionId}`);

    // Step 2: Process XRPL transaction (mock for hackathon)
    console.log(`🔗 Processing XRPL transaction...`);
    const xrplResult = await xrplService.processRemittance(
      'sender_wallet_' + senderId,
      'recipient_wallet_' + recipientId,
      amount,
      fromCurrency,
      toCurrency,
      exchangeRate
    );
    console.log(`✅ XRPL transaction: ${xrplResult.xrplTxHash}`);

    // Step 3: Get recipient details
    const recipientResult = await db.query(
      'SELECT * FROM recipients WHERE id = $1',
      [recipientId]
    );
    const recipient = recipientResult.rows[0];

    // Step 4: Process payout to recipient (mock for hackathon)
    console.log(`💰 Processing payout of ${amountReceived} ${toCurrency}...`);
    const payoutResult = await paymentService.processPayout(
      recipient,
      amountReceived,
      toCurrency
    );
    console.log(`✅ Payout processed: ${payoutResult.payoutId}`);

    // Step 5: Update transaction as completed
    await db.query(
      `UPDATE transactions 
       SET status = $1, 
           amount_received = $2,
           xrpl_tx_hash = $3,
           completed_at = NOW()
       WHERE id = $4`,
      ['completed', amountReceived, xrplResult.xrplTxHash, transactionId]
    );

    console.log(`✅ Transaction ${transactionId} completed successfully!`);

  } catch (error) {
    console.error(`❌ Transaction ${transactionId} failed:`, error);

    // Update transaction as failed
    await db.query(
      `UPDATE transactions 
       SET status = $1, 
           notes = $2
       WHERE id = $3`,
      ['failed', `Error: ${error.message}`, transactionId]
    );
  }
}

// ============================================
// ROUTE 3: Get Transaction Status
// ============================================
router.get('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get transaction with recipient details
    const result = await db.query(
      `SELECT 
        t.*,
        r.name as recipient_name,
        r.email as recipient_email,
        r.country as recipient_country,
        r.payout_type,
        pm.type as payment_method_type,
        pm.bank_name as payment_bank_name,
        pm.account_number_last4 as payment_last4
       FROM transactions t
       LEFT JOIN recipients r ON t.recipient_id = r.id
       LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
       WHERE t.id = $1 AND t.sender_id = $2`,
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Transaction not found or does not belong to you' 
      });
    }

    const transaction = result.rows[0];

    // Format response
    const response = {
      id: transaction.id,
      status: transaction.status,
      
      // Amount details
      amountSent: parseFloat(transaction.amount_sent),
      currencySent: transaction.currency_sent,
      amountReceived: transaction.amount_received ? parseFloat(transaction.amount_received) : null,
      currencyReceived: transaction.currency_received,
      
      // Fees and rate
      fee: parseFloat(transaction.fee),
      exchangeRate: transaction.exchange_rate ? parseFloat(transaction.exchange_rate) : null,
      
      // Recipient info
      recipient: {
        name: transaction.recipient_name,
        email: transaction.recipient_email,
        country: transaction.recipient_country,
        payoutType: transaction.payout_type
      },
      
      // Payment method
      paymentMethod: {
        type: transaction.payment_method_type,
        bankName: transaction.payment_bank_name,
        last4: transaction.payment_last4
      },
      
      // Blockchain proof
      xrplTxHash: transaction.xrpl_tx_hash,
      explorerUrl: transaction.xrpl_tx_hash 
        ? `https://testnet.xrpl.org/transactions/${transaction.xrpl_tx_hash}` 
        : null,
      
      // Route and timing
      routeType: transaction.route_type,
      createdAt: transaction.created_at,
      completedAt: transaction.completed_at,
      
      // Additional info
      notes: transaction.notes
    };

    res.json(response);

  } catch (error) {
    console.error('Transaction status error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch transaction status',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE 4: Get Transaction History
// ============================================
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;

    // Build query with optional status filter
    let query = `
      SELECT 
        t.id,
        t.status,
        t.amount_sent,
        t.currency_sent,
        t.amount_received,
        t.currency_received,
        t.fee,
        t.exchange_rate,
        t.route_type,
        t.created_at,
        t.completed_at,
        r.name as recipient_name,
        r.country as recipient_country,
        r.payout_type
      FROM transactions t
      LEFT JOIN recipients r ON t.recipient_id = r.id
      WHERE t.sender_id = $1
    `;

    const params = [req.user.userId];

    // Add status filter if provided
    if (status) {
      query += ` AND t.status = $${params.length + 1}`;
      params.push(status);
    }

    query += `
      ORDER BY t.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM transactions WHERE sender_id = $1';
    const countParams = [req.user.userId];

    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }

    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Format transactions
    const transactions = result.rows.map(tx => ({
      id: tx.id,
      status: tx.status,
      amountSent: parseFloat(tx.amount_sent),
      currencySent: tx.currency_sent,
      amountReceived: tx.amount_received ? parseFloat(tx.amount_received) : null,
      currencyReceived: tx.currency_received,
      fee: parseFloat(tx.fee),
      exchangeRate: tx.exchange_rate ? parseFloat(tx.exchange_rate) : null,
      routeType: tx.route_type,
      recipient: {
        name: tx.recipient_name,
        country: tx.recipient_country,
        payoutType: tx.payout_type
      },
      createdAt: tx.created_at,
      completedAt: tx.completed_at
    }));

    res.json({
      transactions,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalCount
      }
    });

  } catch (error) {
    console.error('Transaction history error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch transaction history',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE 5: Get Transaction Statistics
// ============================================
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Get user's transaction statistics
    const result = await db.query(
      `SELECT 
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        COALESCE(SUM(amount_sent) FILTER (WHERE status = 'completed'), 0) as total_sent,
        COALESCE(SUM(fee) FILTER (WHERE status = 'completed'), 0) as total_fees_paid,
        COALESCE(AVG(amount_sent) FILTER (WHERE status = 'completed'), 0) as avg_transaction_amount
       FROM transactions
       WHERE sender_id = $1`,
      [req.user.userId]
    );

    const stats = result.rows[0];

    res.json({
      totalTransactions: parseInt(stats.total_transactions),
      completedTransactions: parseInt(stats.completed_count),
      processingTransactions: parseInt(stats.processing_count),
      failedTransactions: parseInt(stats.failed_count),
      totalAmountSent: parseFloat(stats.total_sent),
      totalFeesPaid: parseFloat(stats.total_fees_paid),
      averageTransactionAmount: parseFloat(stats.avg_transaction_amount),
      estimatedSavings: (parseFloat(stats.total_sent) * 0.04).toFixed(2) // Saved ~4% vs traditional
    });

  } catch (error) {
    console.error('Transaction stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch transaction statistics',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE 6: Cancel Transaction (if still pending)
// ============================================
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check transaction exists and belongs to user
    const result = await db.query(
      'SELECT id, status FROM transactions WHERE id = $1 AND sender_id = $2',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Transaction not found' 
      });
    }

    const transaction = result.rows[0];

    // Only pending transactions can be cancelled
    if (transaction.status !== 'pending') {
      return res.status(400).json({ 
        error: `Cannot cancel transaction with status: ${transaction.status}` 
      });
    }

    // Update to cancelled status
    await db.query(
      `UPDATE transactions 
       SET status = $1, notes = $2 
       WHERE id = $3`,
      ['failed', 'Cancelled by user', id]
    );

    res.json({ 
      message: 'Transaction cancelled successfully',
      transactionId: id
    });

  } catch (error) {
    console.error('Cancel transaction error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel transaction',
      message: error.message 
    });
  }
});

module.exports = router;