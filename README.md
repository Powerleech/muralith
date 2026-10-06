# Muralith

It scrapes DuckDuckGo for wallpapers, and saves them to a folder of your choice.
There is a few hardcoded settings, that you can change.

## Setup

Needs Node.js 18 or newer.

```sh
yarn install
```

## Usage

```sh
node index.js -q "scifi art" -n 5
```

The first run asks for a working folder. Settings are saved in `~/.muralith.json`.
Images go into a subfolder per query, e.g. `<workingDir>/scifi_art/`.

query examples:

- scifi art
- dark minimalistic art
