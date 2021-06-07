require('dotenv').config();
const axios = require('axios')
const ccxt = require('ccxt');

const binanceClient = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  // 'enableRateLimit': true,
});

const config = {
  asset: 'ETH',
  base: 'USDT',
  tickInterval: 1 * 2000,
  fee: 0.076
};

async function fetchPriceHistory(symbol, timeframe) {
  let data = await binanceClient.fetch_ohlcv(symbol, timeframe)
  return data
}

async function all(coinPairs, timeframe) {
  let allHistory = []
  for (let i = 0; i < coinPairs.length; i++) {
    let coinPair = coinPairs[i].replace('/', '')
    try {
      console.log(`${i+1}/${coinPairs.length} Fetching price history for ${coinPair}`)
      let historyRaw = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${coinPair}&interval=1m`)
      allHistory.push({
        symbol: coinPair,
        history: historyRaw
      })
    } catch(error) {
      console.log(error)
    }
  }
  console.log('iterated over pairs')
  return allHistory
}

async function run() {
  console.log("getting exchange info")
  const exchangeInfo = await binanceClient.load_markets()
  console.log("setting coinpairs")
  const coinPairs = Object.keys(exchangeInfo).filter(pair => pair.includes(config.base))
  console.log('getting price history')
  const allPriceHistory = await all(coinPairs, '1m')
  console.log('Got price history')
  console.log(allPriceHistory)
}

run()