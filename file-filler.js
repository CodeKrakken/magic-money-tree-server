// Fetch data for full market and store it in Mongo database

require('dotenv').config();

const fs = require('fs');

const axios = require('axios')
const ccxt = require('ccxt');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  // 'enableRateLimit': true,
});


async function run() {
  console.log('Running');
  await mainProgram();
}
 
async function mainProgram() {
  let markets = await getMarkets()
  markets = await filterMarkets(markets)
  await populateFile(markets)
  console.log('Bish Bosh')
  // console.log('Restarting process')
  // mainProgram()
}

async function getMarkets() {
  console.log('Fetching overview\n')
  let markets = await binance.load_markets()
  return markets
}

async function filterMarkets(markets) {
  markets = Object.keys(markets).filter(market => goodMarket(market, markets))
  return markets
}

function goodMarket(market, markets) {
  console.log(market)
  return markets[market].active 
  && !market.includes('UP') 
  && !market.includes('DOWN') 
  && market.includes('USDT') 
  && !market.replace("USD", "").includes("USD")
}

async function checkVolume(markets, i) {
  let market = markets[i]
  let asset = market.substring(0, market.indexOf('/'))
  let dollarMarket = `${asset}/USDT`
  if (markets.includes(dollarMarket)) {
    let dollarSymbol = dollarMarket.replace('/', '')
    let volumeDollarValue = await fetchDollarVolume(dollarSymbol)
    if (volumeDollarValue < 50000000) { return "Insufficient volume"} 
    if (volumeDollarValue === 'Invalid market') { return 'No dollar comparison available' }
  } else {
    return 'No dollar comparison available'
  }
  return 'Sufficient volume'
}

async function fetchDollarVolume(symbol) {
  try {
    let twentyFourHour = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`)
  let dollarPrice = parseFloat(twentyFourHour.data.weightedAvgPrice)
  let totalVolume = parseFloat(twentyFourHour.data.volume)
  volumeDollarValue = totalVolume * dollarPrice
  return volumeDollarValue
  } catch (error) {
    return 'Invalid market'
  }
}

async function populateFile(markets) {
  console.log('\n')
  let symbols = markets.map(market => market = market.replace('/', ''))
  let n = markets.length
  let tallyObject = { 
    assets: { total: 0, unique: 0 }, 
    bases: { total: 0, unique: 0 } 
  }
  for (let i = 0; i < n; i ++) {
    let symbol = symbols[i]
    let market = markets[i]
    let asset = market.substring(0, market.indexOf('/'))
    let base = market.substring(market.indexOf('/')+1)
    tally(asset, base, tallyObject)
    console.log(`Checking 24 hour volume of market ${i+1}/${n} - ${symbol}`)
    let response = await checkVolume(markets, i)
    if (response === "Insufficient volume" || response === "No dollar comparison available") {
      markets.splice(i, 1)
      symbols.splice(i, 1)
      i--
      n--
      console.log(response + '\n')
    } else {
      console.log(`Recording ${market}\n`)
      fs.appendFile('goodMarkets.txt', JSON.stringify(market), function(err) {
        if (err) return console.log(err);
      })
    }
  }
  fs.appendFile('all market tally.txt', JSON.stringify(tallyObject), function(err) {
    if (err) return console.log(err);
  })
}

async function fetchHistory(symbol) {
  try {
    let history = await axios.get(`https://api.binance.com/api/v1/klines?symbol=${symbol}&interval=1m`)
    return history.data
  } catch (error) {
    return "Fetch failed"
  }
}

async function collateData(data) {
  console.log(`Collating history`)
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
    'symbol': data.symbol
  }
  return outputObject
}

// async function dbInsert(data) {
//   console.log(`Adding to database\n`)
//   const query = { symbol: data.symbol };
//   const options = {
//     upsert: true,
//   };
//   const result = await collection.replaceOne(query, data, options);
// }

async function tally(asset, base, tallyObject) {
  try{
    if (Object.keys(tallyObject.assets).includes(asset)) {
      tallyObject.assets[asset] ++
    } else {
      tallyObject.assets[asset] = 1
      tallyObject.assets.unique ++
    }
    if (Object.keys(tallyObject.bases).includes(base)) {
      tallyObject.bases[base] ++
    } else {
      tallyObject.bases[base] = 1
      tallyObject.bases.unique ++
    }
    tallyObject.assets.total ++
    tallyObject.bases.total ++
  } catch (error) {
    console.log(error.message)
  }
}

run();
