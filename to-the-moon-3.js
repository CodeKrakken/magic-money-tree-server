require('dotenv').config();

const fee = 0.00075
const axios = require('axios')
const fs = require('fs');

const ccxt = require('ccxt');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,
});

let wallet = {
  'USDT': 2000
}

let dollarMarkets = []

async function run() {
  console.log('Running\n')
  tick()
}

async function tick() {
  let activeCurrency = await getActiveCurrency()
  console.log(activeCurrency)
  await displayWallet(activeCurrency)
}

async function getActiveCurrency() {
  let sorted = Object.entries(wallet).sort((prev, next) => prev[1] - next[1])
  return sorted.pop()[0]
}

async function displayWallet(activeCurrency) {
  let displayWallet = Object.keys(wallet).filter(currency => wallet[currency] > 0)
  console.log('Wallet\n')
  let currentPrice
  console.log(activeCurrency)
  if (!activeCurrency.includes('USD')) {
    currentPrice = await fetchPrice(activeCurrency + '/USDT')
  }
  displayWallet.forEach(currency => {
    console.log(`${wallet[currency]} ${currency} ${currency.includes('USD') ? '' : `@ ${currentPrice} = $${wallet[currency] * currentPrice}`} `)
  })
  console.log('\n')
}

run()