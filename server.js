require('dotenv').config();
const fs = require('fs');
const ccxt = require('ccxt');
const axios = require('axios')
const { MongoClient } = require('mongodb');
const username = process.env.MONGODB_USERNAME
const password = process.env.MONGODB_PASSWORD
const uri = `mongodb+srv://${username}:${password}@cluster0.ra0fk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const mongo = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let db
let collection
const dbName = "magic-money-tree";
const minimumDollarVolume = 28000000
const fee = 0.001
const stopLossThreshold = 0.78

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,
});

async function run() {
  try {
    await record(`---------- Running at ${timeNow()} ----------`)
    await setupDB();
    const viableMarketNames = await fetchMarkets()
    
    if (viableMarketNames.length) {
      const wallet = simulatedWallet()
      tick(wallet, viableMarketNames)
    }
  } catch (error) {
    console.log(error)
  }
}

function record(report) {
  report = report.concat('\n')
  fs.appendFile(`server-trade-history.txt`, report, function(err) {
    if (err) return console.log(err);
  })
}

function timeNow() {
  const currentTime = Date.now()
  const prettyTime = new Date(currentTime).toLocaleString()
  return prettyTime
}

async function setupDB() {
  console.log('Setting up database ...')
  await mongo.connect()
  db = mongo.db(dbName);
  collection = db.collection("price-data")
  await dbOverwrite({sessionStart: timeNow()})
  console.log("Database setup complete")
}

async function dbOverwrite(data) {
  const query = { key: data.key };
  const options = {
    upsert: true,
  };
  await collection.replaceOne(query, data, options);
}

async function fetchMarkets() {
  try {
    const markets = await binance.load_markets()
    const viableMarketNames = await analyseMarkets(markets)
    return viableMarketNames
  } catch (error) {
    console.log(error)
  }
}

async function analyseMarkets(allMarkets) {
  const goodMarketNames = Object.keys(allMarkets).filter(marketName => isGoodMarketName(marketName, allMarkets))
  const viableMarketNames = await getViableMarketNames(goodMarketNames)  
  return viableMarketNames
}

function isGoodMarketName(marketName, markets) {
  return markets[marketName].active
  && marketName.includes('/USDT') 
  && !marketName.includes('UP') 
  && !marketName.includes('DOWN') 
  && !marketName.includes('BUSD')
  && !marketName.includes('TUSD')
  && !marketName.includes('USDC')
  // && marketName === 'GBP/USDT'
  // && !marketName.includes('BNB')
}

async function getViableMarketNames(marketNames) {
  const viableMarketNames = []
  const n = marketNames.length

  for (let i = 0; i < n; i++) {
    const symbolName = marketNames[i].replace('/', '')
    console.log(`Checking volume of ${i+1}/${n} - ${marketNames[i]}`)
    const response = await checkVolume(symbolName)

    if (!response.includes("Insufficient") && response !== "No response.") {
      viableMarketNames.push(marketNames[i])
      console.log('Market included.')
    } else {
      console.log(response)
    }
  }
  return viableMarketNames
}

async function checkVolume(symbolName) {
  const twentyFourHour = await fetch24Hour(symbolName)
  return twentyFourHour.data ? `${twentyFourHour.data.quoteVolume < minimumDollarVolume ? 'Ins' : 'S'}ufficient volume.` : "No response."
}

async function fetch24Hour(symbolName) {
  try {
    const twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolName}`, { timeout: 10000 })
    return twentyFourHour
  } catch (error) {
    return 'Invalid market.'
  }
}

function simulatedWallet() {
  return {
    coins: {
      USDT: {
        volume: 1000,
      }
    },
  }
}

async function tick(wallet, viableMarketNames) {
  try {
    console.log(`----- Tick at ${timeNow()} -----`)
    await refreshWallet(wallet)
    displayWallet(wallet)
    let viableMarkets = await fetchAllHistory(viableMarketNames)
    viableMarkets = await addEMA(viableMarkets)
    viableMarkets = await sortByArc(viableMarkets)
    await displayMarkets(viableMarkets)
    await trade(viableMarkets, wallet)
  } catch (error) {
    console.log(error)
  }
  tick(wallet, viableMarketNames)
}

async function refreshWallet(wallet) {
  const n = Object.keys(wallet.coins).length

  for (let i = 0; i < n; i ++) {
    const coin = Object.keys(wallet.coins)[i]
    wallet.coins[coin].dollarPrice = coin === 'USDT' ? 1 : await fetchPrice(`${coin}USDT`)
    wallet.coins[coin].dollarValue = wallet.coins[coin].volume * wallet.coins[coin].dollarPrice
  }

  const sorted = Object.keys(wallet.coins).sort((a, b) => wallet.coins[a].dollarValue - wallet.coins[b].dollarValue)
  wallet.data = wallet.data || {}
  wallet.data.baseCoin = sorted.pop()

  if (wallet.data.baseCoin === 'USDT') {
    wallet.data.currentMarket = {}
    wallet.data.prices = {}
  } else {
    wallet.data.currentMarket = { 
      name: `${wallet.data.baseCoin}/USDT`,
      currentPrice: wallet.coins[wallet.data.baseCoin].dollarPrice
    }
    
    if (!Object.keys(wallet.data.prices).length) {
      const data = await collection.find().toArray();
      wallet.data.prices = data[0]      
    }
  }
  return wallet
}


async function fetchPrice(marketName) {
  try {
    const symbolName = marketName.replace('/', '')
    console.log(`Fetching price for ${marketName}`)
    const rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
    const price = parseFloat(rawPrice.data.price)
    return price
  } catch (error) {
    console.log(error)
  }
}

function displayWallet(wallet) {
  console.log('Wallet')

  Object.keys(wallet.coins).filter(coin => wallet.coins[coin].volume).map(name => {
    console.log(`${wallet.coins[name].volume} ${name} @ ${wallet.coins[name].dollarPrice} = $${wallet.coins[name].dollarValue}`)
  })
  console.log(`Total = $${getDollarTotal(wallet)}`)

  if (wallet.data.baseCoin !== 'USDT') {
    console.log(`Target Price    - ${wallet.data.prices.targetPrice}`)
    console.log(`High Price      - ${wallet.data.prices.highPrice}`)
    console.log(`Purchase Price  - ${wallet.data.prices.purchasePrice}`)
    console.log(`Stop Loss Price - ${wallet.data.prices.stopLossPrice}`)
  }
}

function getDollarTotal(wallet) {
  let total = 0

  Object.keys(wallet.coins).map(name => {
    total += wallet.coins[name].dollarValue
  })

  return total
}

async function fetchAllHistory(marketNames) {
  const n = marketNames.length
  const returnArray = []

  for (let i = 0; i < n; i++) {
    try {
      console.log(`Fetching history for ${i+1}/${marketNames.length} - ${marketNames[i]} ...`)
      const response = await fetchSingleHistory(marketNames[i].replace('/', ''))

      if (response !== 'No response.') {

        const symbolObject = await annotateData({
          name      : marketNames[i],
          histories : response
        })

        returnArray.push(symbolObject)
      } else { 
        console.log(response)
      }
    } catch (error) {
      console.log(error)
    }
  }
  return returnArray
}

async function fetchSingleHistory(symbolName) {
  try {
    let minuteHistory = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1m`, { timeout: 10000 })
    let hourHistory   = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1h`, { timeout: 10000 })
    let dayHistory    = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbolName}&interval=1d`, { timeout: 10000 })
    
    return {
      minutes : minuteHistory.data, 
      hours   : hourHistory.data, 
      days    : dayHistory.data
    }
  } catch (error) {
    return 'No response.'
  }
}

async function annotateData(data) {
  try {
    const histories = {}

    Object.keys(data.histories).map(periods => {
      const history = []

      data.histories[periods].map(period => {
  
        const average = (
          parseFloat(period[1]) +
          parseFloat(period[2]) +
          parseFloat(period[3]) +
          parseFloat(period[4])
        )/4
  
        history.push(
          {
            'startTime': period[0],
            'open'     : parseFloat(period[1]),
            'high'     : parseFloat(period[2]),
            'low'      : parseFloat(period[3]),
            'close'    : parseFloat(period[4]),
            'endTime'  : period[6],
            'average'  : average
          }
        )
      })
      histories[periods] = history
    })

    return {
      name: data.name,
      histories: histories
    }
  
  } catch(error) {
    console.log(error)
  }
}

async function addEMA(markets) {
  try {
    markets.map(market => {
      market.emas = {
        days: {
          ema13   : ema(market.histories.days,  13,  'close'),
          ema34   : ema(market.histories.days,  34,  'close'),
          ema89   : ema(market.histories.days,  89,  'close'),
          ema233  : ema(market.histories.days, 233,  'close')
        }, 
        hours: {
          ema13   : ema(market.histories.hours,  13,  'close'),
          ema34   : ema(market.histories.hours,  34,  'close'),
          ema89   : ema(market.histories.hours,  89,  'close'),
          ema233  : ema(market.histories.hours, 233,  'close')
        }, 
        minutes: {
          ema1    : ema(market.histories.minutes,   1, 'close'),
          ema13   : ema(market.histories.minutes,   13, 'close'),
          ema34   : ema(market.histories.minutes,   34, 'close'),
          ema89   : ema(market.histories.minutes,   89, 'close'),
          ema233  : ema(market.histories.minutes,  233, 'close')
        }
      }
    })
    return markets
  } catch (error) {
    console.log(error)
  }
}

function ema(rawData, time, parameter) {
  const data = extractData(rawData, parameter)
  const k = 2/(time + 1)
  const emaData = []
  emaData[0] = data[0]

  for (let i = 1; i < data.length; i++) {
    const newPoint = (data[i] * k) + (emaData[i-1] * (1-k))
    emaData.push(newPoint)
  }

  const currentEma = [...emaData].pop()
  return +currentEma
}

function extractData(dataArray, key) {
  const outputArray = []

  dataArray.map(obj => {
    outputArray.push(obj[key])
  })

  return outputArray
}

async function sortByArc(markets) {

  markets.map(market => {
    const m = market.histories.minutes.length
    market.totalChange = market.histories.minutes[m - 1].close - market.histories.minutes[0].close
    market.percentageChange = market.totalChange / market.histories.minutes[0].close * 100
    let straightLineIncrement = market.totalChange / m
    market.bigDrop = 1
    market.bigRise = 1
    let straightLine = market.histories.minutes[0].close

    market.histories.minutes.map(thisPeriod => {
      straightLine += straightLineIncrement

      if (thisPeriod.low < straightLine && thisPeriod.low / straightLine < market.bigDrop) {
        market.bigDrop = thisPeriod.low / straightLine
      }

      if (thisPeriod.high > straightLine && thisPeriod.high / straightLine > market.bigRise) {
        market.bigRise = thisPeriod.high / straightLine
      }
    })

    market.shape = market.percentageChange * market.bigDrop / market.bigRise
  })

  return markets.sort((a, b) => ((b.shape) - (a.shape)))
}

function displayMarkets(markets) {
  markets.map(market => {
    console.log(`${market.name} ... %ch: ${market.percentageChange} * drop: ${market.bigDrop} / rise: ${market.bigRise} = ${market.shape}`)
  })
}


// TRADE FUNCTIONS

async function trade(viableMarkets, wallet) {

  const targetMarket = getTargetMarket(viableMarkets)

  if (wallet.data.baseCoin === 'USDT') {   

    if (targetMarket === 'No bullish markets') {
      console.log(targetMarket)
    } else {

      if (wallet.coins[wallet.data.baseCoin].volume > 10) {
        await simulatedBuyOrder(wallet, targetMarket)
      }
    } 
  } else {
    console.log(viableMarkets)
    console.log(wallet)
    const market = viableMarkets.filter(market => market.name === wallet.data.currentMarket.name)[0]
  
    try {
      if (targetMarket === 'No bullish markets') {
        console.log(targetMarket)
        await simulatedSellOrder(wallet, 'Current market bearish', market)
      } else if (targetMarket.name !== wallet.data.currentMarket.name) { 
        await simulatedSellOrder(wallet, 'Better market found', market)
      } else if ((!wallet.data.prices.targetPrice || !wallet.data.prices.stopLossPrice) && wallet.data.baseCoin !== 'USDT') {
        await simulatedSellOrder(wallet, 'Price information undefined', market)
      } else if (wallet.data.currentMarket.currentPrice < wallet.data.prices.stopLossPrice) {
        await simulatedSellOrder(wallet, 'Below Stop Loss', market)
      }
    } catch(error) {
      console.log(error)
    }
  }
}

function getTargetMarket(markets) {
  const bulls = markets.filter(market => 
    market.shape > 0 
    && 
    market.emas.minutes.ema1 > market.emas.minutes.ema13
  )
  return bulls.length ? bulls[0] : 'No bullish markets'
}

async function simulatedBuyOrder(wallet, market) {
  try {
    const asset = market.name.split('/')[0]
    const base  = market.name.split('/')[1]
    const response = await fetchPrice(`${asset}${base}`)

    if (response !== 'No response.') {
      const currentPrice = response

      const baseVolume = wallet.coins[base].volume
      if (!wallet.coins[asset]) wallet.coins[asset] = { volume: 0 }
      wallet.coins[base].volume = 0

      wallet.coins[asset].volume += baseVolume * (1 - fee) / currentPrice
      const targetVolume = baseVolume * (1 + (2 * fee))

      wallet.data.prices = {
        targetPrice   : targetVolume / wallet.coins[asset].volume,
        purchasePrice : currentPrice,
        stopLossPrice : currentPrice * stopLossThreshold,
        highPrice     : currentPrice
      }

      wallet.data.currentMarket = market
      await dbOverwrite(wallet.data.prices)
      const tradeReport = `${timeNow()} - Bought ${wallet.coins[asset].volume} ${asset} @ ${currentPrice} ($${baseVolume * (1 - fee)}) [${market.shape}]`
      console.log(tradeReport)
      await record(tradeReport)
    }
  } catch (error) {
    console.log(error)
  }
}

async function simulatedSellOrder(wallet, sellType, market) {
  try {
    const asset = wallet.data.currentMarket.name.split('/')[0]
    const base  = wallet.data.currentMarket.name.split('/')[1]
    const assetVolume = wallet.coins[asset].volume
    wallet.coins[base].volume += assetVolume * (1 - fee) * wallet.coins[asset].dollarPrice
    wallet.data.prices = {}
    await dbOverwrite(wallet.data.prices)
    const tradeReport = `${timeNow()} - Sold ${assetVolume} ${asset} @ ${wallet.coins[asset].dollarPrice} ($${wallet.coins[base].volume}) [${market.shape}] [${sellType}]`
    console.log(tradeReport)
    record(tradeReport)
    delete wallet.coins[asset]
  } catch (error) {
    console.log(error)
  }
}

run()