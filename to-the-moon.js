require('dotenv').config();

const fee = 0.0075
const axios = require('axios')
const fs = require('fs');
const { runInContext } = require('vm');

let wallet = {
  "USDT": 2000, "BTC":     0, "ETH":   0, "BNB":   0, "LTC":   0, "ADA":  0,
  "XRP":  0,    "EOS":     0, "TRX":   0, "ETC":   0, "VET":   0, "BCH":  0,
  "USDC": 0,    "LINK":    0, "THETA": 0, "MATIC": 0, "TFUEL": 0, "GTO":  0,
  "DOGE": 0,    "CHZ":     0, "BUSD":  0, "KAVA":  0, "EUR":   0, "DATA": 0,
  "SOL":  0,    "BTCDOWN": 0, "SXP":   0, "DOT":   0, "KSM":   0, "RUNE": 0,
  "UNI":  0,    "AAVE":    0, "FIL":   0, "1INCH": 0, "CAKE":  0, "SHIB": 0,
  "ICP":  0,    "ATA":     0
}

async function run() {
  console.log('Running')
  let marketNames = await fetchNames()
  let exchangeHistory = await fetchAllHistory(marketNames)
  console.log(exchangeHistory)
  run()
}

async function fetchNames() {
  let marketNames = fs.readFileSync('goodMarkets.txt', 'utf8').split('""')
  marketNames = marketNames.filter(marketName => marketName.includes('USDT'))
  return marketNames
}

async function fetchAllHistory(marketNames) {
  let n = marketNames.length
  let returnArray = []
  for (let i = 0; i < n; i ++) {
    try {
      let marketName = marketNames[i]
      let symbolName = marketName.replace('/', '')
      let assetName = marketName.substring(0, marketName.indexOf('/'))
      let baseName = marketName.substring(marketName.indexOf('/')+1)
      let symbolHistory = await fetchOneHistory(symbolName)  
      let symbolObject = {
        'history': symbolHistory,
        'asset': assetName,
        'base': baseName
      }
      symbolObject = await collateData(symbolObject)
      await returnArray.push(symbolObject)
    } catch (error) {
      marketNames.splice(i, 1)
      i --
      n --
    }
  }
  return returnArray
}

async function fetchOneHistory(symbolName) {
  let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`)
  return history.data
}

async function collateData(data) {
  let history = []
  data.history.forEach(period => {
    history.push({
      'startTime': period[0],
      'open': period[1],
      'high': period[2],
      'low': period[3],
      'close': period[4],
      'endTime': period[6]
    })
  })
  let outputObject = {
    'history': history,
    'asset': data.asset,
    'base': data.base,
  }
  return outputObject
}

run();