const express = require('express');
const exchangeRateService = require('../services/exchangeRate');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ============================================
// ROUTE 1: Get Single Exchange Rate
// ============================================
router.get('/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;

    // Validate currency codes (should be 3 letters)
    if (from.length !== 3 || to.length !== 3) {
      return res.status(400).json({ 
        error: 'Invalid currency code. Must be 3 letters (e.g., USD, MXN)' 
      });
    }

    // Convert to uppercase
    const fromCurrency = from.toUpperCase();
    const toCurrency = to.toUpperCase();

    // Get exchange rate
    const rate = await exchangeRateService.getRate(fromCurrency, toCurrency);

    res.json({
      from: fromCurrency,
      to: toCurrency,
      rate: rate.rate,
      timestamp: rate.timestamp,
      source: rate.source,
      mock: rate.mock || false
    });

  } catch (error) {
    console.error('Exchange rate error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch exchange rate',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE 2: Get Multiple Exchange Rates (Batch)
// ============================================
router.post('/batch', async (req, res) => {
  try {
    const { pairs } = req.body;

    // Validate input
    if (!pairs || !Array.isArray(pairs)) {
      return res.status(400).json({ 
        error: 'Request body must include "pairs" array' 
      });
    }

    if (pairs.length === 0) {
      return res.status(400).json({ 
        error: 'Pairs array cannot be empty' 
      });
    }

    if (pairs.length > 20) {
      return res.status(400).json({ 
        error: 'Maximum 20 currency pairs per request' 
      });
    }

    // Validate each pair
    for (const pair of pairs) {
      if (!pair.from || !pair.to) {
        return res.status(400).json({ 
          error: 'Each pair must have "from" and "to" properties' 
        });
      }
    }

    // Get all rates
    const rates = await exchangeRateService.getBatchRates(pairs);

    res.json({ 
      rates,
      count: rates.length,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Batch exchange rate error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch exchange rates',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE 3: Get Supported Currencies
// ============================================
router.get('/currencies/supported', (req, res) => {
  try {
    const supportedCurrencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
      { code: 'MXN', name: 'Mexican Peso', symbol: '$', flag: '🇲🇽' },
      { code: 'PHP', name: 'Philippine Peso', symbol: '₱', flag: '🇵🇭' },
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
      { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
      { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
      { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
      { code: 'CAD', name: 'Canadian Dollar', symbol: '$', flag: '🇨🇦' },
      { code: 'AUD', name: 'Australian Dollar', symbol: '$', flag: '🇦🇺' },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' }
    ];

    res.json({ 
      currencies: supportedCurrencies,
      count: supportedCurrencies.length
    });

  } catch (error) {
    console.error('Supported currencies error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch supported currencies' 
    });
  }
});

// ============================================
// ROUTE 4: Calculate Transfer Amount
// ============================================
router.post('/calculate', async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency, includesFee = true } = req.body;

    // Validate input
    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, fromCurrency, toCurrency' 
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ 
        error: 'Amount must be greater than 0' 
      });
    }

    // Get exchange rate
    const rateData = await exchangeRateService.getRate(
      fromCurrency.toUpperCase(), 
      toCurrency.toUpperCase()
    );

    // Calculate with SwiftBase fees
    const feePercent = 0.01; // 1%
    const spread = 0.003; // 0.3%
    
    const fee = amount * feePercent;
    const amountAfterFee = amount - fee;
    const exchangeRate = rateData.rate * (1 - spread);
    const amountReceived = amountAfterFee * exchangeRate;

    // Calculate traditional service comparison
    const traditionalFee = amount * 0.05 + 5; // 5% + $5
    const traditionalRate = rateData.rate * 0.97; // 3% markup
    const traditionalReceived = (amount - traditionalFee) * traditionalRate;

    const savings = amountReceived - traditionalReceived;

    res.json({
      input: {
        amount,
        currency: fromCurrency.toUpperCase()
      },
      swiftBase: {
        amountReceived: parseFloat(amountReceived.toFixed(2)),
        currency: toCurrency.toUpperCase(),
        fee: parseFloat(fee.toFixed(2)),
        exchangeRate: parseFloat(exchangeRate.toFixed(6)),
        estimatedTime: '5-10 minutes'
      },
      traditional: {
        amountReceived: parseFloat(traditionalReceived.toFixed(2)),
        currency: toCurrency.toUpperCase(),
        fee: parseFloat(traditionalFee.toFixed(2)),
        exchangeRate: parseFloat(traditionalRate.toFixed(6)),
        estimatedTime: '1-3 days'
      },
      savings: {
        amount: parseFloat(savings.toFixed(2)),
        percent: parseFloat(((savings / traditionalReceived) * 100).toFixed(2))
      },
      midMarketRate: rateData.rate,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Calculate error:', error);
    res.status(500).json({ 
      error: 'Failed to calculate transfer amount',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE 5: Get Historical Rates (Mock for Hackathon)
// ============================================
router.get('/:from/:to/history', async (req, res) => {
  try {
    const { from, to } = req.params;
    const { days = 7 } = req.query;

    // Validate
    if (from.length !== 3 || to.length !== 3) {
      return res.status(400).json({ 
        error: 'Invalid currency code' 
      });
    }

    if (days < 1 || days > 365) {
      return res.status(400).json({ 
        error: 'Days must be between 1 and 365' 
      });
    }

    const fromCurrency = from.toUpperCase();
    const toCurrency = to.toUpperCase();

    // Get current rate
    const currentRate = await exchangeRateService.getRate(fromCurrency, toCurrency);

    // Generate mock historical data
    const history = [];
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date(now - (i * oneDayMs));
      // Add some random variance to make it look realistic
      const variance = (Math.random() - 0.5) * 0.1; // ±5% variance
      const rate = currentRate.rate * (1 + variance);
      
      history.push({
        date: date.toISOString().split('T')[0],
        rate: parseFloat(rate.toFixed(6)),
        timestamp: date.getTime()
      });
    }

    res.json({
      from: fromCurrency,
      to: toCurrency,
      currentRate: currentRate.rate,
      history,
      period: `${days} days`
    });

  } catch (error) {
    console.error('Historical rates error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch historical rates',
      message: error.message 
    });
  }
});

// ============================================
// ROUTE 6: Get Popular Corridors
// ============================================
router.get('/corridors/popular', (req, res) => {
  try {
    const popularCorridors = [
      { from: 'USD', to: 'MXN', name: 'USA → Mexico', volume: 'high', flag: '🇺🇸→🇲🇽' },
      { from: 'USD', to: 'PHP', name: 'USA → Philippines', volume: 'high', flag: '🇺🇸→🇵🇭' },
      { from: 'USD', to: 'INR', name: 'USA → India', volume: 'high', flag: '🇺🇸→🇮🇳' },
      { from: 'USD', to: 'NGN', name: 'USA → Nigeria', volume: 'medium', flag: '🇺🇸→🇳🇬' },
      { from: 'GBP', to: 'INR', name: 'UK → India', volume: 'medium', flag: '🇬🇧→🇮🇳' },
      { from: 'EUR', to: 'USD', name: 'Europe → USA', volume: 'high', flag: '🇪🇺→🇺🇸' },
      { from: 'CAD', to: 'PHP', name: 'Canada → Philippines', volume: 'medium', flag: '🇨🇦→🇵🇭' },
      { from: 'AUD', to: 'PHP', name: 'Australia → Philippines', volume: 'medium', flag: '🇦🇺→🇵🇭' }
    ];

    res.json({ 
      corridors: popularCorridors,
      count: popularCorridors.length
    });

  } catch (error) {
    console.error('Popular corridors error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch popular corridors' 
    });
  }
});

// ============================================
// ROUTE 7: Compare Multiple Routes
// ============================================
router.post('/compare', async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;

    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    const rateData = await exchangeRateService.getRate(fromCurrency, toCurrency);

    const comparison = [
      {
        provider: 'SwiftBase XRPL',
        fee: amount * 0.01,
        rate: rateData.rate * 0.997,
        received: ((amount - amount * 0.01) * rateData.rate * 0.997).toFixed(2),
        time: '5-10 min'
      },
      {
        provider: 'Western Union',
        fee: amount * 0.05 + 5,
        rate: rateData.rate * 0.96,
        received: ((amount - (amount * 0.05 + 5)) * rateData.rate * 0.96).toFixed(2),
        time: '1-3 days'
      },
      {
        provider: 'Wise',
        fee: amount * 0.015 + 3,
        rate: rateData.rate * 0.99,
        received: ((amount - (amount * 0.015 + 3)) * rateData.rate * 0.99).toFixed(2),
        time: '1 day'
      }
    ];

    res.json({
      amount,
      fromCurrency,
      toCurrency,
      midMarketRate: rateData.rate,
      providers: comparison.sort((a, b) => parseFloat(b.received) - parseFloat(a.received))
    });

  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ 
      error: 'Failed to compare rates',
      message: error.message 
    });
  }
});

module.exports = router;