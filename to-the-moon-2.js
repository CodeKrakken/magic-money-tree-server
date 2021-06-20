require('dotenv').config();

const fee = 0.00075
const axios = require('axios')
const fs = require('fs');

const ccxt = require('ccxt');
const { nextTick } = require('process');

const binance = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  'enableRateLimit': true,
});

let wallet = {
  'USDT': 2000
}

let currentMarket = 'None'
let currentPrice = 0
let currentAsset = 'None'
let currentBase = 'USDT'
let boughtPrice = 0
let targetPrice = 0

async function run() {
  console.log('Running\n')
  tick()
}

async function tick() {
  let activeCurrency = Object.keys(wallet).sort((a, b) => a - b)[0]
  console.log(activeCurrency)
  let markets = await getMarkets()
}

async function getMarkets() {

}

run();
