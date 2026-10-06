# Muralith

It scrapes DuckDuckGo for wallpapers, and saves them to a folder of your choice.
There is a few hardcoded settings, that you can change.

## Requirements

Google Chrome or Chromium must be installed. Muralith uses it to load the DuckDuckGo search page.
If it is not in the default location, give the path with `--chrome`.

## Usage

Run with no options in a terminal to get a menu:

```sh
muralith
```

Muralith keeps a list of queries. "Download wallpapers" lets you pick which queries to download.
All queries are selected by default. Check "+ Add new query" to add a query and download it too.
"Remove query" removes queries from the list.

Or give the values as options. Muralith asks only for the values that are missing:

```sh
muralith -q "scifi art" -n 5 -d ~/Pictures/wallpapers
muralith -q "scifi art" -q "dark minimalistic art"
```

A query from `-q` is added to the saved list, and only the `-q` queries are downloaded.
With no `-q`, a terminal run asks which saved queries to download. A run without a terminal downloads all of them.

| Option | Description |
| --- | --- |
| `-q`, `--query <string>` | A query to download. Repeat for more queries |
| `-n`, `--number <number>` | The number of images to download per query |
| `-d`, `--dir <path>` | The working folder |
| `--chrome <path>` | The path to Chrome or Chromium |
| `-h`, `--help` | Display help text |

Settings are saved in `~/.muralith.json`, so the next run uses them again.
Images go into a subfolder per query, e.g. `<workingDir>/scifi_art/`.
When it does not run in a terminal (cron, scripts), it does not ask. It fails if there are no queries or no `--dir`.

query examples:

- scifi art
- dark minimalistic art

## Development

Needs Node.js 18 or newer, and [Bun](https://bun.sh) to build.

```sh
yarn install
node index.js
```

## Build

```sh
yarn build       # this machine, to dist/muralith
yarn build:all   # macOS arm64/x64, Linux x64 and Windows x64, to dist/
```

The binary includes Node and all packages. Only Chrome must be installed.
