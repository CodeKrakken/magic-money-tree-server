require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 8000;
const axios = require('axios')
const config = {
  asset: 'BNB',
  base: 'BUSD',
  allocation: 15,
  tickInterval: 1 * 2000,
  buyInterval: 1 * 10 * 1000,
  fee: 0.002,
  margin: 1.00001
};
let reports = []
let buyCountdown = 0
let currentTime = 0
let dataObject = {}
let wallet = {}
let currentPriceRaw
let currentPrice
let priceHistory = []
let balancesRaw
let orders = []
let oldOrders = []
let market = `${config.asset}/${config.base}`
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
    // await refreshOrders()
    await trade()
    console.log(`Tick @ ${new Date(currentTime).toLocaleString()}`)
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
  wallet[config.asset] = balancesRaw.free[config.asset]
  wallet[config.base] = balancesRaw.free[config.base]
  dataObject.wallet = wallet
  dataObject.orders = orders
  dataObject.currentTime = currentTime
  dataObject.reports = reports.slice(reports.length-5, 5)
}

function rising() {
  // let diff1 = ema(priceHistory, 1, 'close') - ema(priceHistory, 1, 'open')
  // console.log(`${ema(priceHistory, 1, 'close')} - ${ema(priceHistory, 1, 'open')} = ${diff1}`)
  // let diff2 = ema(priceHistory, 2, 'close') - ema(priceHistory, 2, 'open')
  // let diff3 = ema(priceHistory, 3, 'close') - ema(priceHistory, 3, 'open')
  // return diff1 > 0 && diff1 > diff2 && diff2 < diff3
  return ema(priceHistory, 1, 'close') > ema(priceHistory, 1, 'open')
      && ema(priceHistory, 1, 'close') > ema(priceHistory, 2, 'close')
}

async function trade() {
  if (timeToBuy()) {
    await newBuyOrder()
    newSellOrder()
  } else if (buyCountdown > 0) { 
    console.log(`Ticks til buy: ${buyCountdown}`) 
  } else if (rising() === false) { console.log('Not rising') }
  else {
    if (wallet[config.base] < config.allocation) { console.log(`Insufficient base balance: ${wallet[config.base]}`) }
    if (wallet[config.asset] < config.allocation / currentPrice) { console.log('Insufficient asset balance') }
  }
}

function timeToBuy() {
  return (rising()
    && wallet[config.base] >= config.allocation 
    && wallet[config.asset] >= config.allocation / currentPrice 
    && buyCountdown <= 0)
}

async function newBuyOrder() {
  try { 
    currentPrice = parseFloat(currentPrice)
    const assetVolume = config.allocation / currentPrice
    console.log(`Creating limit buy order for ${n(assetVolume, 8)} ${config.asset} @ $${n(currentPrice, 8)}`)
    await binanceClient.createLimitBuyOrder(market, n(assetVolume, 8), n(currentPrice, 8))
    buyCountdown = 10
    reports.push(`\nCreated limit buy order for  ${n(assetVolume, 8)} ${config.asset} @ $${n(currentPrice, 8)}`)
  } catch(error) {
    console.log(error.message)
  }
}

async function newSellOrder() {
  const assetVolume = config.allocation / currentPrice
  const profitPrice = currentPrice * (1 + config.fee*config.margin)
  console.log(`Creating limit sell order for ${n(assetVolume, 8)} ${config.asset} @ $${n(profitPrice, 8)}`)
  await binanceClient.createLimitSellOrder(market, n(assetVolume, 8), n(profitPrice, 8))
  reports.push(`Created limit sell order for ${n(assetVolume, 8)} ${config.asset} @ $${n(profitPrice, 8)}`)
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