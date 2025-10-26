const axios = require('axios');

class ExchangeRateService {
  constructor() {
    this.apiKey = process.env.EXCHANGE_RATE_API_KEY;
    this.baseUrl = 'https://v6.exchangerate-api.com/v6';
    this.cache = new Map();
    this.cacheExpiry = 60000;
  }

  async getRate(from, to) {
    const cacheKey = `${from}_${to}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      console.log(`Cache hit for ${from}→${to}`);
      return cached.data;
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.apiKey}/pair/${from}/${to}`
      );
      
      if (response.data.result !== 'success') {
        throw new Error('Failed to fetch exchange rate');
      }

      const result = {
        rate: response.data.conversion_rate,
        timestamp: Date.now(),
        from,
        to,
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      return result;
    } catch (error) {
      console.error(`Failed to fetch rate for ${from}→${to}:`, error.message);
      return this.getMockRate(from, to);
    }
  }

  getMockRate(from, to) {
    const mockRates = {
      'USD_MXN': 17.5,
      'USD_PHP': 56.0,
      'USD_INR': 83.0,
      'USD_NGN': 1550.0,
    };

    return {
      rate: mockRates[`${from}_${to}`] || 1.0,
      timestamp: Date.now(),
      from,
      to,
      mock: true,
    };
  }

  async getBatchRates(pairs) {
    return Promise.all(
      pairs.map(({ from, to }) => this.getRate(from, to))
    );
  }
}

module.exports = new ExchangeRateService();