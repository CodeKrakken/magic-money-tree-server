require('dotenv').config();

const fee = 0.00075
const axios = require('axios')
const fs = require('fs');

// const WebSocket = require('ws');

// const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

// ws.on('message', function incoming(data) {
//     console.log(data);
// });
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

let currentMarket = 'None'
let currentPrice
let boughtPrice = 0
let targetPrice = 0
let currentBase

async function run() {
  console.log('Running\n')
  mainProgram()
}

async function mainProgram() {
  let marketNames = await fetchNames()
  let exchangeHistory = await fetchAllHistory(marketNames)
  console.log(`Movement chart at ${timeNow()}\n`)
  let filteredByEMA = await filter(exchangeHistory)
  if (filteredByEMA.length > 0) {
    filteredByEMA = await rank(filteredByEMA)
    await display(filteredByEMA)
    if (currentMarket === 'None') {
      currentMarket = filteredByEMA[0]
    }
  }
  await displayWallet()
  await trade(filteredByEMA)
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
  console.log(rankedByMovement)
  let n = rankedByMovement.length
  for (let i = 0; i < n; i++) {
    let market = rankedByMovement[i]
    console.log(`${market.market} ... Movement: ${market.movement} ... (${market.fetched})`)
  }
  console.log('\n')
}

async function rank(markets) {
  outputArray = []
  markets.forEach(market => {
    let marketName = `${market.asset}/${market.base}`
    let ema20 = ema(market.history, 20, 'close')
    let ema50 = ema(market.history, 50, 'close')
    let ema200 = ema(market.history, 200, 'close')
    outputArray.push({
      'market': marketName,
      'movement': ema20/ema50 -1,
      'ema20': ema20,
      'ema50': ema50,
      'ema200': ema200,
      'fetched': new Date(market.history[market.history.length-1].endTime - 59000).toLocaleString()
    })
  })
  return outputArray.sort((a, b) => b.movement - a.movement)
}

async function filter(markets) {
  let outputArray = []
  for (let i = 0; i < markets.length; i++) {
    let market = markets[i]

    let currentPrice = await fetchPrice(market)

  if (ema(market.history, 20, 'close') > ema(market.history, 50, 'close') 
  && ema(market.history, 50, 'close') > ema(market.history, 200, 'close')
  && currentPrice > ema(market.history, 20, 'close')) {
    outputArray.push(market)
  }}
  return outputArray
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
    console.log(`${wallet[currency]} ${currency} ${currency === 'USDT' ? '' : `@ ${currentPrice} = $${wallet[currency] * currentPrice}`}`)
  })
  console.log('\n')
}

async function trade(exchangeHistory) {
  console.log('Done')

  if (currentMarket !== 'None') {
    let currentAsset = currentMarket.market.substring(0, currentMarket.market.indexOf('/'))
    let currentBase = currentMarket.market.substring(currentMarket.market.indexOf('/')+1)
    currentPrice = await fetchPrice(currentMarket)
    if (timeToBuy(currentAsset, currentBase)) {
      await newBuyOrder(currentAsset, currentBase)
      boughtPrice = currentPrice
      targetPrice = boughtPrice * (1 + (3 * fee))
    } else {
      console.log(wallet[currentAsset])
      console.log(wallet[currentBase])
      console.log(currentPrice) 
      console.log(currentMarket.ema20)
    }
  }
  if (currentBase) {
    if (timeToSell(currentBase, targetPrice, exchangeHistory)) {
      await newSellOrder(currentAsset, currentBase)
      currentMarket = 'None'
    } else {
      console.log(currentAsset)
      console.log(currentMarket)
      console.log(currentPrice)
    }
  }
}
  

async function fetchPrice(market) {
  let currentSymbol = `${market.asset}${market.base}`
  let priceRaw = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${currentSymbol}`) 
  let price = parseFloat(priceRaw.data.price)
  return price
}

function timeToBuy(currentAsset, currentBase) {
  return wallet[currentAsset] < wallet[currentBase] * currentPrice
}

async function newBuyOrder(currentAsset, currentBase) {
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
    console.log(error.message)
  }
  console.log(tradeReport)
  tradeReport = ''
  displayWallet()
  console.log('--------\n')
}

function timeToSell(currentBase, targetPrice, exchangeHistory) {
  // return wallet[currentAsset] * currentPrice > wallet[currentBase]
  let ema20 = ema(exchangeHistory, 20, 'high')
  return wallet[currentBase] === 0 
      && currentPrice > targetPrice
      && currentPrice < ema20
}

async function newSellOrder(currentAsset, currentBase) {
  let tradeReport
  try {
    const oldAssetVolume = wallet[currentAsset]
    // await binanceClient.createMarketSellOrder(market, oldAssetVolume)
    wallet[currentBase] += oldAssetVolume * currentPrice * (1 - fee)
    wallet[currentAsset] -= oldAssetVolume
    tradeReport = `${timeNow()} - Sold   ${n(oldAssetVolume, 8)} ${currentAsset} @ ${n(currentPrice, 8)} ($${oldAssetVolume * currentPrice * (1 - fee)})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })  
  } catch (error) {
    console.log(error.message)
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