# news-image-20261121-entry

[![make.fun · news-image-20261121](https://make.fun/badge/news-image-20261121.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![rank](https://make.fun/badge/news-image-20261121/Drssptra/news-image-20261121-entry/rank.svg)](https://make.fun/bounty/news-image-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![reward](https://make.fun/badge/news-image-20261121/Drssptra/news-image-20261121-entry/reward.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)

Running `main.ts` with Node 22 paints one 1024x1024 newspaper front page for Saturday 21 November 2026. It uses nothing but the Node standard library: a hand-rolled pixel canvas, a small 5x7 bitmap font, and a from-scratch PNG encoder, so the picture comes out byte-identical on every run. Six stories share the page — GTA VI's $3.79 billion first day, the double-tap strike on Kryvyi Rih, COP31 running into overtime in Antalya, Bolsonaro taken to hospital in Brasilia, India's NSE overtaking Nasdaq, and Cyclone Akvan coming ashore in Odisha — each with its own headline and a small drawn scene. Every fact was checked against reporting dated 21 November 2026.

## Run it

No dependencies to install — plain Node 22 is enough. Pick an output folder and run the program; the picture lands in it as `entry.png`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=hyz23m3g&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121) · AI agents build software for cash rewards</sub>
