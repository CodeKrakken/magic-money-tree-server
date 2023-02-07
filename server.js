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
    console.log(error.message)
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
  await wipeDatabase()
  await dbInsert({sessionStart: timeNow()})
  console.log("Database setup complete")
}

async function wipeDatabase() {
  await collection.deleteMany({})
}

function simulatedWallet() {

  return {
    coins: {
      USDT: {
        volume: 1000,
        dollarValue: 1000,
        dollarPrice: 1
      }
    },
    data: {
      baseCoin: 'USDT'
    }
  }
}

async function fetchMarkets() {
  try {
    const markets = await binance.load_markets()
    const viableMarketNames = await analyseMarkets(markets)

    return viableMarketNames
  } catch (error) {
    console.log(error.message)
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

async function tick(wallet, viableMarketNames) {

  try {
    console.log(`----- Tick at ${timeNow()} -----`)
    await refreshWallet(wallet)
    displayWallet(wallet)
    
    let viableMarkets = await fetchAllHistory(viableMarketNames)
    viableMarkets = await addEMA(viableMarkets)
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
  wallet.data.baseCoin = sorted.pop()

  if (wallet.data.baseCoin === 'USDT') {
    wallet.data.currentMarket = null
    wallet.data.targetPrice = null
    wallet.data.highPrice = null
    wallet.data.purchasePrice = null
    wallet.data.stopLossPrice = null

  } else {
    wallet.data.currentMarket ? 
    wallet.data.currentMarket.name = `${wallet.data.baseCoin}/USDT` : 
    wallet.data.currentMarket = { name: `${wallet.data.baseCoin}/USDT` }
    
    if (!wallet.data.targetPrice || !wallet.data.stopLossPrice) {
      const data = await collection.find().toArray();

      if (!wallet.data.targetPrice && data[0]?.targetPrice) {
        wallet.data.targetPrice = data[0].targetPrice
      }

      if (!wallet.data.stopLossPrice && data[0]?.stopLossPrice) {
        wallet.data.stopLossPrice = data[0].stopLossPrice
      }
    }
  }

  return wallet
}


async function fetchPrice(marketName) {

  try {

    const symbolName = marketName.replace('/', '')
    console.log(`Fetching price for ${symbolName}`)

    const rawPrice = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolName}`) 
    const price = parseFloat(rawPrice.data.price)
    return price

  } catch (error) {

    console.log(error.message)
  }
}

function displayWallet(wallet) {
  console.log('Wallet')
  Object.keys(wallet.coins).filter(coin => wallet.coins[coin].volume).map(coinName => {
    console.log(`${wallet.coins[coinName].volume} ${coinName} @ ${wallet.coins[coinName].dollarPrice} = $${wallet.coins[coinName].dollarValue}`)
  })
  console.log(`Total = $${getDollarTotal(wallet)}`)
  if (wallet.data.targetPrice)    console.log(`Target Price    - ${wallet.data.targetPrice}`)
  if (wallet.data.highPrice)      console.log(`High Price      - ${wallet.data.highPrice}`)
  if (wallet.data.purchasePrice)  console.log(`Bought Price    - ${wallet.data.purchasePrice}`)
  if (wallet.data.stopLossPrice)  console.log(`Stop Loss Price - ${wallet.data.stopLossPrice}`)
}

function getDollarTotal(wallet) {
  let total = 0
  Object.keys(wallet.coins).map(coinName => {
    total += wallet.coins[coinName].dollarValue
  })
  return total
}

async function getViableMarketNames(marketNames) {
  const viableMarketNames = []
  const symbolNames = marketNames.map(marketName => marketName = marketName.replace('/', ''))
  const n = symbolNames.length

  for (let i = 0; i < n; i++) {

    const symbolName  = symbolNames[i]
    const marketName  = marketNames[i]

    console.log(`Checking volume of ${i+1}/${marketNames.length} - ${marketName}`)

    const response    = await checkVolume(symbolName)

    if (!response.includes("Insufficient") && response !== "No response.") {
      viableMarketNames.push(marketName)
      console.log('Market included.')
    }

    if (response.includes("Insufficient") || response === "No response.") console.log(response)
  }

  return viableMarketNames

}

async function checkVolume(symbolName) {

  const twentyFourHour = await fetch24Hour(symbolName)
  
  if (twentyFourHour.data !== undefined) {

    return `${twentyFourHour.data.quoteVolume < minimumDollarVolume ? 'Ins' : 'S'}ufficient volume.`
  
  } else {

    return "No response."
  }
}

async function fetch24Hour(symbolName) {
  try {

    const twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolName}`, { timeout: 10000 })
    return twentyFourHour

  } catch (error) {

    return 'Invalid market'
  }
}

async function fetchAllHistory(marketNames) {

  const n = marketNames.length
  const returnArray = []

  for (let i = 0; i < n; i++) {

    try {

      const marketName = marketNames[i]
      const symbolName = marketName.replace('/', '')
      console.log(`Fetching history for ${i+1}/${marketNames.length} - ${marketName} ...`)
      const response = await fetchSingleHistory(symbolName)

      if (response !== 'No response.') {

        const symbolObject = await annotateData({
          name      : marketName,
          histories : response
        })

        returnArray.push(symbolObject)
      } else { 
        console.log(response)
      }
    } catch (error) {
      console.log(error.message)
    }
  }

  return returnArray
}

async function fetchSingleHistory(symbolName, i, j) {

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

    console.log(error.message)

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
          ema13   : ema(market.histories.minutes,   13, 'close'),
          ema34   : ema(market.histories.minutes,   34, 'close'),
          ema89   : ema(market.histories.minutes,   89, 'close'),
          ema233  : ema(market.histories.minutes,  233, 'close')
        }
      }
    })

    return markets

  } catch (error) {

    console.log(error.message)

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

// TRADE FUNCTIONS

async function trade(viableMarkets, wallet) {

  const response = getTargetMarket(viableMarkets)

  if (response === 'No bullish markets') {
    console.log(response)
  } else {
    const targetMarket = response

    if (wallet.data.baseCoin === 'USDT') {      
      if (wallet.coins[wallet.data.baseCoin].volume > 10) {
        const viableMarketNames = Object.keys(viableMarkets).map(market => market.name)
        await simulatedBuyOrder(wallet, targetMarket)
      }
    } else {
      
      try {
        if (wallet.data.currentMarket.name !== targetMarket.name) { 
          await simulatedSellOrder(wallet, 'Switching market')
          await simulatedBuyOrder(wallet, targetMarket)

          // REFACTOR FROM HERE

          // await switchMarket(wallet, targetMarket)
        } else

        if ((!wallet.data.targetPrice || !wallet.data.stopLossPrice) && wallet.data.baseCoin !== 'USDT') {

          console.log('Target Price:  ' + wallet.data.targetPrice)
          console.log('Stop Loss Price:  ' + wallet.data.stopLossPrice)

          await simulatedSellOrder(wallet, 'Price information undefined')
        
        } else

        if (wallet.data.currentMarket.currentPrice < wallet.data.stopLossPrice) {

          console.log('Target Price:  ' + wallet.data.targetPrice)
          console.log('Stop Loss Price:  ' + wallet.data.stopLossPrice)

          await simulatedSellOrder(wallet, 'Below Stop Loss')
        }

      } catch(error) {

        console.log(error)
      }
    }
  }
}

function getTargetMarket(markets) {

  const bulls = markets.filter(market => 
    // market.shape > 0 
    // && 
    // market.trend === 'up'
    // && 
    market.emas.minutes.ema13 > market.emas.minutes.ema233
  ).sort((a, b) => a.emas.minutes.ema13/a.emas.minutes.ema233 - b.emas.minutes.ema13/b.emas.minutes.ema233)

  return bulls.length ? bulls[0] : 'No bullish markets'
}

async function simulatedBuyOrder(wallet, market) {
  try {
    const asset = market.name.split('/')[0]
    const base  = market.name.split('/')[1]
    const response = await fetchPrice(`${asset}${base}`)

    if (response === 'No response.') {

      console.log(`No response - starting new tick.`)

    } else {

      const currentPrice = response
      const baseVolume = wallet.coins[base].volume
      if (!wallet.coins[asset]) wallet.coins[asset] = { volume: 0 }
      wallet.coins[base].volume = 0
      wallet.coins[asset].volume += baseVolume * (1 - fee) / currentPrice
      const targetVolume = baseVolume * (1 + (2 * fee))
      wallet.data.targetPrice = targetVolume / wallet.coins[asset].volume
      wallet.data.purchasePrice = currentPrice
      wallet.data.stopLossPrice = wallet.data.purchasePrice * stopLossThreshold
      wallet.data.highPrice = currentPrice
      await dbInsert({
        targetPrice   : wallet.data.targetPrice,
        purchasePrice : wallet.data.purchasePrice,
        stopLossPrice : wallet.data.stopLossPrice,
        highPrice     : wallet.data.highPrice
      })
      const tradeReport = `${timeNow()} - Transaction - Bought ${wallet.coins[asset].volume} ${asset} @ ${currentPrice} ($${baseVolume * (1 - fee)})`
      console.log(tradeReport)
      await record(tradeReport)
    }
  } catch (error) {
    console.log(error.message)
  }
}

async function dbInsert(data) {

  const query = { key: data.key };
  const options = {
    upsert: true,
  };
  result = await collection.replaceOne(query, data, options);
  return result
}

async function simulatedSellOrder(wallet, sellType) {

  try {
    const asset = wallet.data.currentMarket.name.split('/')[0]
    const base  = wallet.data.currentMarket.name.split('/')[1]
    const assetVolume = wallet.coins[asset].volume
    
    if (!wallet.coins[base]) wallet.coins[base] = { volume: 0 }
    const currentPrice = await fetchPrice(wallet.data.currentMarket.name)
    wallet.coins[base].volume += assetVolume * (1 - fee) * currentPrice
    wallet.coins[asset].volume -= assetVolume
    await dbInsert({})
    wallet.data.targetPrice = undefined

    record(`${timeNow()} - Sold ${assetVolume} ${asset} @ ${currentPrice} ($${wallet.coins[base].volume}) [${sellType}]`)

  } catch (error) {
    
    console.log(error.message)

  }
}

async function switchMarket(wallet, targetMarket) {

  try {

    if (wallet.coins[wallet.data.baseCoin].volume > 10) {

      // await liveBuyOrder(wallet, targetMarket, viableMarketNames)

    } else {

      switchMarket(wallet, targetMarket)
    }  

  } catch (error) {

    console.log(error.message)
  }
}

run()