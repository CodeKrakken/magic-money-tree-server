require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 8000;
const axios = require('axios')
const config = {
  asset: 'ETH',
  base: 'USDT',
  tickInterval: 1 * 2000,
  fee: 0.076
};
let reports = []
let buyCountdown = 0
let currentTime = 0
let dataObject = {}
let wallet = {}

// Uncomment next 2 lines for emulation mode
wallet[config.asset] = 0
wallet[config.base] = 200

let currentPriceRaw
let currentPrice
let priceHistory = []
let balancesRaw
let boughtPrice = 0
let soldPrice = 0
let orders = []
let oldOrders = []
let market = `${config.asset}/${config.base}`
let buying
let ema1 = 0
let ema3 = 0
let ema5 = 0
let tradeReport = ''
let oldBaseVolume = 0
let exchange
let coinPairs
const timeObject = new Date
const symbol = `${config.asset}${config.base}`
const ccxt = require('ccxt');
const binanceClient = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  // 'enableRateLimit': true,
});

var fs = require('fs')


app.use(bodyParser.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));


// For headless use
let timer = setInterval(getTick, config.tickInterval)

// app.get('/tick', async(req, res) => {
async function getTick() {
  try {
    await saveValues()
    await fetchInfo()
    await updateInfo()
    await parseOrders()
    await trade()
    await readout()
    tradeReport = ''
    // res.send(dataObject)
  } catch (error) {
    console.log(error.message)
  }
}
// })

function saveValues() {
  oldOrders = orders
}

function parseOrders(key, value, array) {
  let count = 0
  orders.forEach(order => {
    if (order[key] === value) {
      count ++
    }
  })
  return count
}

// Trading functions

async function fetchInfo() {
  exchange = await binanceClient.load_markets()
  coinPairs = Object.keys(exchange)
  currentPriceRaw = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
  priceHistoryRaw = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbol}&interval=1m`)
  balancesRaw = await binanceClient.fetchBalance()
  orders = await binanceClient.fetchOpenOrders(market)
}

function updateInfo() {
  if (parseOrders('side', 'sell', oldOrders) > parseOrders('side', 'sell', orders)) {
    buyCountdown = 0
  }
  if (orders.length === 0) { buyCountdown = 0 }
  if (buyCountdown > 0) { buyCountdown -= 1 }
  currentTime = Date.now()
  currentPrice = currentPriceRaw.data.price
  priceHistoryRaw.data.forEach(period => {
    priceHistory.push({
      'startTime': period[0],
      'open': period[1],
      'high': period[2],
      'low': period[3],
      'close': period[4],
      'endTime': period[6]
    })
  })
  dataObject.currentPriceObject = currentPriceRaw.data
  dataObject.priceHistory = priceHistory
  ema1 = ema(priceHistory, 1, 'close')
  ema8 = ema(priceHistory, 8, 'close')
  ema3 = ema(priceHistory, 3, 'close')
  ema5 = ema(priceHistory, 5, 'close')
  ema2 = ema(priceHistory, 2, 'close')


  // Comment out next 2 lines for emulation mode
  // wallet[config.asset] = balancesRaw.free[config.asset]
  // wallet[config.base] = balancesRaw.free[config.base]
  
  dataObject.wallet = wallet
  dataObject.orders = orders
  dataObject.currentTime = currentTime
  dataObject.reports = reports.slice(reports.length-5, 5)
  buying = wallet[config.asset] * currentPrice < wallet[config.base]
}

function readout() {
  // console.log(exchange)
  console.log(coinPairs)
  console.log(`${market} - Tick @ ${new Date(currentTime).toLocaleString()}\n`)
  const emaArray = emaReadout()
  emaArray.forEach(ema => {
    console.log(`${ema[0]} - ${n(ema[1], 5)}`)
  })
  console.log('\n')
  console.log(tradeReport + '\n')
  console.log(`Wallet\n\n  ${n(wallet[config.base], 2)} ${config.base} \n+   ${n(wallet[config.asset], 2)} ${config.asset}\n= ${n(wallet[config.base] + (wallet[config.asset] * currentPrice), 2)} ${config.base}\n\n`)
}

function emaReadout() {
  let emaArray = Object.entries(
    {
      '   ema1': ema1, 
      '   ema3': ema3, 
      '   ema5': ema5,
      '   ema2': ema2,
      '   paid': boughtPrice,
      'current': currentPrice
    }
  )
  emaArray = emaArray.sort((a, b) => b[1] - a[1])
  return emaArray 
}

function rising() {
  return ema1 > ema3
      && ema3 > ema5
      // && ema3 > ema8 
      // && ema8 > ema21
}

function falling() {
  return ema1 < ema2
}

async function trade() {
  if (timeToBuy()) {
    await newBuyOrder()
    buying = false
    boughtPrice = currentPrice
  } else if (timeToSell()) {
    await newSellOrder()
    buying = true
    soldPrice = currentPrice
  } else {
    tradeReport = `Holding - price is ${rising() ? '' : 'not '}rising.`
  }
}

function timeToBuy() {
  return (
    rising() && buying
  )
}

function timeToSell() {
  return (
    falling() && !buying && wallet[config.asset] * currentPrice > oldBaseVolume * (1 + config.fee) 
  )
}

async function newBuyOrder() {
  try { 
    currentPrice = parseFloat(currentPrice)
    oldBaseVolume = wallet[config.base]
    // await binanceClient.createMarketBuyOrder(market, oldBaseVolume / currentPrice)
    wallet[config.asset] += oldBaseVolume * (1 - config.fee) / currentPrice
    wallet[config.base] -= oldBaseVolume
    // buyCountdown = 10
    tradeReport = `${new Date(currentTime).toLocaleString()} - Bought ${n(wallet[config.asset], 8)} ${config.asset} @ ${n(currentPrice, 8)} ($${oldBaseVolume})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })  } catch(error) {
    console.log(error.message)
  }
}

async function newSellOrder() {
  try {
    const oldAssetVolume = wallet[config.asset]
    const assetVolume = config.allocation / currentPrice
    // await binanceClient.createMarketSellOrder(market, oldAssetVolume)
    wallet[config.base] += oldAssetVolume * currentPrice * (1 - config.fee)
    wallet[config.asset] -= oldAssetVolume
    tradeReport = `${new Date(currentTime).toLocaleString()} - Sold   ${n(oldAssetVolume, 8)} ${config.asset} @ ${n(currentPrice, 8)} ($${oldAssetVolume * currentPrice})\n`
    fs.appendFile('trade-history.txt', tradeReport, function(err) {
      if (err) return console.log(err);
    })  
  } catch (error) {
    console.log(error.message)
  }
}

function n(n, d) {
  return Number.parseFloat(n).toFixed(d);
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

function extractData(dataObject, key) {
  let array = []
  dataObject.forEach(obj => {
    array.push(obj[key])
  })
  return array
}

app.listen(port);