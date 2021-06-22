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
  'GBP': 2000
}

let dollarMarkets = []

async function run() {
  console.log('Running\n')
  tick()
}

async function tick() {
  let activeCurrency = await getActiveCurrency()
  let currentPrice = await displayWallet(activeCurrency)
  let allMarkets = await fetchMarkets()
  let activeCurrencyMarkets = await getActiveCurrencyMarkets(allMarkets, activeCurrency)
  let voluminousMarkets = await getVoluminousMarkets(activeCurrencyMarkets)





}

async function getActiveCurrency() {
  let sorted = Object.entries(wallet).sort((prev, next) => prev[1] - next[1])
  return sorted.pop()[0]
}

async function displayWallet(activeCurrency) {
  let displayWallet = Object.keys(wallet).filter(currency => wallet[currency] > 0)
  console.log('Wallet\n')
  let currentPrice
  if (!activeCurrency.includes('USD')) {
    currentPrice = await fetchPrice(activeCurrency + '/USDT')
  }
  displayWallet.forEach(currency => {
    console.log(`${wallet[currency]} ${currency} ${currency.includes('USD') ? '' : `@ ${currentPrice} = $${wallet[currency] * currentPrice}`} `)
  })
  console.log('\n')
  return currentPrice
}

async function fetchPrice(marketName) {
  let symbolName = marketName.replace('/', '')
  let rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
  let price = parseFloat(rawPrice.data.price)
  return price
}

async function fetchMarkets() {
  console.log(`Fetching overview at ${timeNow()}`)
  let markets = await binance.load_markets()
  return markets
}

function timeNow() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}

async function getActiveCurrencyMarkets(markets, currency) {
  let activeCurrencyMarkets = Object.keys(markets).filter(market => goodMarket(market, markets, currency))
  return activeCurrencyMarkets
}

function goodMarket(marketName, markets, currency) {
  console.log(marketName)
  return markets[marketName].active 
  && !marketName.includes('UP') 
  && !marketName.includes('DOWN') 
  && marketName.includes(currency) 
  && !marketName.replace("USD", "").includes("USD")
}

async function getVoluminousMarkets(marketNames) {
  console.log(marketNames)
  let voluminousMarkets = []
  let symbolNames
  return voluminousMarkets
}


run()