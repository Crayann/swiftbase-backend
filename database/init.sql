-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  country VARCHAR(2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment methods table
CREATE TABLE payment_methods (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- 'bank' or 'crypto'
  
  -- Bank details (if type = 'bank')
  bank_name VARCHAR(100),
  account_number_last4 VARCHAR(4),
  routing_number VARCHAR(20),
  
  -- Crypto details (if type = 'crypto')
  wallet_address VARCHAR(100),
  crypto_type VARCHAR(20), -- 'xrpl', 'ethereum', etc.
  
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recipients table
CREATE TABLE recipients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  country VARCHAR(2) NOT NULL,
  phone_number VARCHAR(20),
  
  -- Payout method
  payout_type VARCHAR(20) NOT NULL, -- 'bank' or 'cash_pickup'
  bank_name VARCHAR(100),
  account_number_last4 VARCHAR(4),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transactions table
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER REFERENCES users(id),
  recipient_id INTEGER REFERENCES recipients(id),
  
  -- Payment method used
  payment_method_id INTEGER REFERENCES payment_methods(id),
  
  -- Amount details
  amount_sent DECIMAL(10, 2) NOT NULL,
  currency_sent VARCHAR(3) NOT NULL,
  amount_received DECIMAL(10, 2),
  currency_received VARCHAR(3) NOT NULL,
  
  -- Rate and fees
  exchange_rate DECIMAL(10, 6),
  fee DECIMAL(10, 2),
  
  -- Transaction proof
  xrpl_tx_hash VARCHAR(100),
  
  -- Status
  status VARCHAR(20) NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
  route_type VARCHAR(50), -- 'xrpl_direct', 'bank_transfer'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  -- Metadata
  notes TEXT
);

-- Indexes for performance
CREATE INDEX idx_transactions_sender ON transactions(sender_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX idx_payment_methods_user ON payment_methods(user_id);
CREATE INDEX idx_recipients_user ON recipients(user_id);