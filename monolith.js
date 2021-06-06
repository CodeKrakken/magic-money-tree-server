require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 8000;
const axios = require('axios')
const config = {
  asset: 'DOGE',
  base: 'USDT',
  tickInterval: 1 * 2000,
  fee: 0.002
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
let orders = []
let oldOrders = []
let soldPrice = 0
let market = `${config.asset}/${config.base}`
let buying
let ema1 = 0
let ema3 = 0
let ema5 = 0
let tradeReport = ''
const timeObject = new Date
const symbol = `${config.asset}${config.base}`
const ccxt = require('ccxt');
const binanceClient = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  // 'enableRateLimit': true,
});

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
    console.log(`Tick @ ${new Date(currentTime).toLocaleString()}\n`)
    console.log('Current price: ' + currentPrice)
    console.log('Bought price: ' + process.env.BOUGHT_PRICE + '\n')
    console.log(`EMA (1) - ${ema1}\nEMA (3) - ${ema3}\nEMA (5) - ${ema5}\n\n`)
    console.log(tradeReport + '\n')
    console.log(`Wallet\n\n${wallet[config.base]} ${config.base} \n+ ${wallet[config.asset]} ${config.asset}\n= ${wallet[config.base] + (wallet[config.asset] * currentPrice)} ${config.base}\n\n`)
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
  currentPriceRaw = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
  priceHistoryRaw = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbol}&interval=1m`)
  balancesRaw = await binanceClient.fetchBalance()
  orders = await binanceClient.fetchOpenOrders(market)
  // exchange = await axios.get(`https://api.binance.com`)
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
  ema3 = ema(priceHistory, 3, 'close')
  ema5 = ema(priceHistory, 5, 'close')

  // Comment out next 2 lines for emulation mode
  // wallet[config.asset] = balancesRaw.free[config.asset]
  // wallet[config.base] = balancesRaw.free[config.base]
  
  dataObject.wallet = wallet
  dataObject.orders = orders
  dataObject.currentTime = currentTime
  dataObject.reports = reports.slice(reports.length-5, 5)
  buying = wallet[config.asset] * currentPrice < wallet[config.base]
}

function rising() {
  return ema1 > ema5
}

function falling() {
  return ema1 < ema3
}

async function trade() {
  if (timeToBuy()) {
    await newBuyOrder()
    buying = false
    process.env.BOUGHT_PRICE = currentPrice
  } else if (timeToSell()) {
    await newSellOrder()
    buying = true
    soldPrice = currentPrice
  } else {
    tradeReport = `Holding - price is ${rising() ? '' : 'not '}rising.`
    console.log('Time to sell? ' + timeToSell())
    console.log('Falling? ' + !rising())
    console.log('Selling? ' + !buying)
    console.log('Price has increased? ' + (currentPrice > process.env.BOUGHT_PRICE))
  }
}

function timeToBuy() {
  return (
    rising() && buying
  )
}

function timeToSell() {
  return (
    falling() && !buying && currentPrice > process.env.BOUGHT_PRICE
  )
}

async function newBuyOrder() {
  try { 
    currentPrice = parseFloat(currentPrice)
    const oldBaseVolume = wallet[config.base]
    // await binanceClient.createMarketBuyOrder(market, oldBaseVolume / currentPrice)
    wallet[config.asset] += oldBaseVolume / currentPrice
    wallet[config.base] -= oldBaseVolume
    // buyCountdown = 10
    tradeReport = `\nBought ${n(wallet[config.assetVolume], 8)} ${config.asset} @ ${n(currentPrice, 8)} ($${oldBaseVolume})`
  } catch(error) {
    console.log(error.message)
  }
}

async function newSellOrder() {
  try {
    const oldAssetVolume = wallet[config.asset]
    const assetVolume = config.allocation / currentPrice
    // await binanceClient.createMarketSellOrder(market, oldAssetVolume)
    wallet[config.baseVolume] += oldAssetVolume * currentPrice
    wallet[config.assetVolume] -= oldAssetVolume
    tradeReport = `Sold ${n(oldAssetVolume, 8)} ${config.asset} @ ${n(currentPrice, 8)} ($${config.asset * currentPrice})`
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