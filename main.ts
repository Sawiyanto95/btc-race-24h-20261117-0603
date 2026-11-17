import { runBars, type OrderInput } from './vendor/makefun-bars.ts';

// Two separately accounted sleeves share the harness's single BTC position.
// Indicators consume fresh closes only; quantities and cash stay in integer units.
const P = {
  highBars: 90, dip: 0.010, addDip: 0.016,
  trendWeight: 2500, dipWeight: 4000, addWeight: 1500,
  fast: 12, slow: 36, momentum: 0.0018,
  trendStop: 0.0085, dipStop: 0.011,
  trendTake: 0.012, dipTake: 0.010,
  arm: 0.006, trail: 0.0045, cooldown: 24,
};
interface Sleeve {
  name: string; qty: bigint; cost: bigint; peak: number;
  entered: number; next: number; legs: number; exiting: boolean;
}
const sleeves: Sleeve[] = ['trend', 'dip'].map(name => ({
  name, qty: 0n, cost: 0n, peak: 0, entered: 0, next: 0, legs: 0, exiting: false,
}));
const pending = new Map<string, Sleeve>();
const closes: number[] = [];
let fast = 0, slow = 0, priorSlow = 0, serial = 0;
let equityPeak = 0n, halted = false;

await runBars({
  onBatch(state, batch) {
    // Advance state only when fills arrive: a rejected order never creates a leg.
    for (const fill of batch.fills) {
      const s = pending.get(fill.client_id);
      if (!s) continue;
      pending.delete(fill.client_id);
      if (fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        const wasFlat = s.qty === 0n;
        s.qty += BigInt(fill.qty);
        s.cost += BigInt(fill.notional_quote_units);
        s.legs++;
        // A new average cost starts a new trailing-profit reference.
        s.peak = 0;
        if (wasFlat) s.entered = batch.seq;
      } else {
        s.qty = 0n; s.cost = 0n; s.legs = 0; s.peak = 0;
        s.exiting = false; s.next = batch.seq + P.cooldown;
      }
    }
    const bar = batch.bars.find(b => b.symbol === 'CBBTC');
    if (!bar) return [];
    const c = Number(bar.c);
    priorSlow = slow;
    fast = fast === 0 ? c : fast + 2 / (P.fast + 1) * (c - fast);
    slow = slow === 0 ? c : slow + 2 / (P.slow + 1) * (c - slow);
    closes.push(c);
    if (closes.length > 180) closes.shift();
    if (state.warmingUp) return [];
    if (state.equity > equityPeak) equityPeak = state.equity;
    // Latch a portfolio circuit breaker; do not immediately re-enter after a shock.
    if (state.equity * 100n < equityPeak * 88n) halted = true;
    const orders: OrderInput[] = [];
    let cash = state.cash, room = state.weightRoom('CBBTC');
    const high = Math.max(...closes.slice(-P.highBars));
    const low = Math.min(...closes.slice(-8));
    const ret15 = closes.length > 15 ? c / closes[closes.length - 16] - 1 : 0;
    const recent = closes.slice(-31);
    let path = 0;
    for (let i = 1; i < recent.length; i++) path += Math.abs(recent[i] - recent[i - 1]);
    const change30 = c - recent[0];
    // A slow, orderly rise can be tradable without a sharp 15-minute burst.
    const steady = recent.length === 31 && change30 / recent[0] > 0.0008 &&
      path > 0 && change30 / path > 0.65 && ret15 > 0.0003;
    for (const s of sleeves) {
      const trend = s.name === 'trend';
      if (s.qty > 0n) {
        const value = Number(state.value('CBBTC', s.qty));
        const ratio = value / Number(s.cost);
        s.peak = Math.max(s.peak, ratio);
        const stop = trend ? P.trendStop : P.dipStop;
        const take = trend ? P.trendTake : P.dipTake;
        const reversal = trend && batch.seq - s.entered >= 18 && fast < slow * 0.999 && ret15 < -0.003;
        if (halted || ratio <= 1 - stop || ratio >= 1 + take ||
            (s.peak >= 1 + P.arm && ratio <= s.peak - P.trail) || reversal) s.exiting = true;
        if (s.exiting) {
          const id = `${s.name}-sell-${++serial}`;
          orders.push({ side: 'sell', client_id: id, symbol: 'CBBTC', qty: s.qty, max_slippage_bps: 10000 });
          pending.set(id, s);
          continue;
        }
      }
      if (halted || closes.length < P.slow || batch.seq < s.next) continue;
      let weight = 0;
      if (s.qty === 0n) {
        if (trend && fast > slow * 1.0005 && slow > priorSlow && (ret15 > P.momentum || steady)) weight = P.trendWeight;
        if (!trend && closes.length >= P.highBars && c <= high * (1 - P.dip) && c >= low * 1.001) weight = P.dipWeight;
      } else if (!trend && s.legs === 1 && c <= high * (1 - P.addDip) && c >= low * 1.001) weight = P.addWeight;
      if (!weight) continue;
      let spend = state.equity * BigInt(weight) / 10000n;
      // At most 5 bps expected impact per buy at the latest known depth.
      const depths = state.depthAt('CBBTC');
      if (!depths || depths.some(d => d <= 0n)) continue;
      const depthCap = depths.reduce((a, b) => a < b ? a : b) * 5n / 10000n;
      for (const cap of [cash, room, depthCap]) if (spend > cap) spend = cap;
      if (spend < BigInt(state.hello.fees.min_notional_quote_units)) continue;
      const id = `${s.name}-buy-${++serial}`;
      orders.push({ side: 'buy', client_id: id, symbol: 'CBBTC', notional_quote_units: spend, max_slippage_bps: 70 });
      pending.set(id, s);
      cash -= spend; room -= spend;
    }
    return orders;
  },
});
