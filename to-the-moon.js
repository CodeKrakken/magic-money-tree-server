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
  console.log('Running\n')
  mainProgram()
}

async function mainProgram() {
  let marketNames = await fetchNames()
  let exchangeHistory = await fetchAllHistory(marketNames)
  console.log(`Movement chart at ${timeNow()}\n`)
  let rankedByMovement = await rank(exchangeHistory)
  await display(rankedByMovement)
  await displayWallet()
  let currentMarket = rankedByMovement[0]
  await trade(currentMarket)
  mainProgram()
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

function timeNow() {
  let currentTime = Date.now()
  let prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}

function display(rankedByMovement) {
  for (let i = 0; i < 10; i++) {
    let market = rankedByMovement[i]
    console.log(`${market.market} ... Movement: ${market.movement} ... (${market.fetched})`)
  }
  console.log('\n')
}

async function rank(markets) {
  outputArray = []
  markets.forEach(market => {
    let marketName = `${market.asset}/${market.base}`
    let ema1 = ema(market.history, 1, 'close')
    let ema2 = ema(market.history, 2, 'close')
    let ema3 = ema(market.history, 3, 'close')
    outputArray.push({
      'market': marketName,
      'movement': ema1/ema3 - 1,
      'ema1': ema1,
      'ema2': ema2,
      'ema3': ema3,
      'fetched': new Date(market.history[market.history.length-1].endTime - 59000).toLocaleString()
    })
  })
  return outputArray.sort((a, b) => a.movement - b.movement)
}

function ema(rawData, time, parameter) {
  let data = extractData(rawData, parameter)
  const k = 2/(time + 1)
  let emaData = []
  emaData[0] = data[0]
  for (let i = 1; i < data.length; i++) {
    let newPoint = (data[i] * k) + (emaData[i-1] * (1-k))
    emaData.push(newPoint)
  }
  let currentEma = [...emaData].pop()
  return +currentEma
}

function extractData(dataArray, key) {
  let outputArray = []
  dataArray.forEach(obj => {
    outputArray.push(obj[key])
  })
  return outputArray
}

function displayWallet() {
  let displayWallet = Object.keys(wallet).filter(currency => wallet[currency] > 0)
  console.log('Wallet\n')
  displayWallet.forEach(currency => {
    console.log(`${wallet[currency]} ${currency}`)
  })
  console.log('\n')
}

async function trade(market) {
  let currentAsset = market.market.substring(0, market.market.indexOf('/'))
  let currentBase = market.market.substring(market.market.indexOf('/')+1)
  let currentPrice = await fetchCurrentPrice(market)
  if (timeToBuy(currentAsset, currentBase)) {
    await newBuyOrder(currentPrice, currentAsset, currentBase)
  }
}

async function fetchCurrentPrice(currentMarket) {
  let currentSymbol = currentMarket.market.replace('/', '')
  let currentPriceRaw = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${currentSymbol}`) 
  let currentPrice = parseFloat(currentPriceRaw.data.price)
  return currentPrice
}

function timeToBuy(currentAsset, currentBase) {
  return wallet[currentAsset] < wallet[currentBase]
}

async function newBuyOrder(currentPrice, currentAsset, currentBase) {
  let tradeReport
  try {
    let oldBaseVolume = wallet[currentBase]
    // await binanceClient.createMarketBuyOrder(market, oldBaseVolume / currentPrice)
    wallet[currentAsset] += oldBaseVolume * (1 - fee) / currentPrice
    wallet[currentBase] -= oldBaseVolume
    tradeReport = `${timeNow()} - Bought ${n(wallet[currentAsset], 8)} ${currentAsset} @ ${n(currentPrice, 8)} ($${oldBaseVolume})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })
  } catch(error) {
    console.log(error)
  }
  console.log(tradeReport)
  tradeReport = ''
  displayWallet()
  console.log('--------\n')
}

function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
}

run();