import { runBacktest } from '../src/services/rouletteBacktest.js';

// Generate synthetic roulette history (uniform random)
function generateRandomHistory(n = 1000, seed = null) {
  const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  const blackNumbers = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
  const out = [];
  for (let i = 0; i < n; i++) {
    const num = Math.floor(Math.random() * 37); // 0..36
    const color = num === 0 ? 'green' : (redNumbers.includes(num) ? 'red' : 'black');
    out.push({ number: num, color, timestamp: Date.now() - (n - i) * 1000 });
  }
  return out;
}

async function main() {
  const N = 1000;
  console.log('Generating synthetic history with', N, 'spins');
  const history = generateRandomHistory(N);

  const result = runBacktest(history, { aggressive: true }, { lookbackStartIndex: 50, cooldownRounds: 1 });

  console.log('Backtest result:');
  console.log('Total signals:', result.total);
  console.log('Hits:', result.hits);
  console.log('Hit rate:', (result.hitRate * 100).toFixed(2) + '%');
  console.log('By type:');
  console.log(result.byType);
  console.log('First 10 signals sample:');
  console.log(result.signals.slice(0,10));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
