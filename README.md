# BTC Drift and Dip

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Sawiyanto95/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Sawiyanto95/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A deterministic, long-only cbBTC/USDC bot for `agent-fun/bars-replay/v1`.
Two sleeves share one position: a small trend sleeve follows short-term momentum,
while a dip sleeve buys a shallow pullback after initial recovery and can add once
at a modestly deeper dip. Each sleeve tracks its confirmed fills separately.
Take-profits, armed trailing stops, hard stops, entry cooldowns, depth-based sizing,
and a portfolio drawdown circuit breaker control exposure and trading costs.
Signals use closes and depths only; no network, wall clock, environment inputs,
or randomness are used.

The trend sleeve targets 25% of equity using EMA(12/36), positive momentum,
or an orderly 30-bar rise. The dip sleeve targets 40% on a 1% pullback from
the highest of 90 closes, with a 0.1% recovery from the last eight closes' low.
It can add 15% once at a 1.6% pullback. Actual buys are capped by cash,
position room, and five basis points of estimated pool impact.
Trend and dip hard stops are 0.85% and 1.1% below their respective costs;
take-profits are 1.2% and 1%. A 0.45 percentage-point trailing stop arms at
0.6% profit. Exits retry until filled, followed by a 24-batch cooldown.
A 12% portfolio drawdown halts new entries and requests liquidation.
Stops are close-based orders filled at the next available open, so gaps can
exceed their thresholds.

## Local validation

The process-driver dev grade finished with **+8.565710 USDC net PnL**,
**25 filled orders** (12 completed sleeve round trips and one scale-in),
**0.6348184% maximum drawdown**, and no rejected orders. Fees were
2.968416 USDC; the harness's doubled-fee result was +5.590385 USDC.
Both action logs matched, and the L1 regrade reproduced byte for byte.

Nearby faster and slower parameter sets also made money: +6.885667 USDC
over 26 orders and +4.566546 USDC over 17 orders, respectively. Synthetic
checks covered smooth rising drift without dips, falling drift with rebounds,
missing bars, rejected buys and sells, a sudden shock, and a flat market.
The falling-drift check lost money; these checks do not establish future returns.

Validation used local Node 24.22.1. The bot uses Node 22-compatible erasable
TypeScript and standard library APIs. Local strategy grading supplied no
transcript bundle; submission eligibility requires the recorded build sessions.

## Run it

Requires Node 22 with TypeScript stripping enabled (or a newer Node version).
The replay harness provides newline-delimited JSON on stdin; replies go to stdout.

```sh
node main.ts
```

The vendored protocol SDK is an unchanged copy from the competition kit.

<sub>Entered on [make.fun](https://make.fun/?ref=bc76ffwb&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
