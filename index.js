#!/usr/bin/env node

const minimist = require('minimist');
const puppeteer = require('puppeteer');
const axios = require('axios');
const { imageSize } = require('image-size');
const fs = require('fs');
const path = require('path');
const { getCFGFromFile, promptForValue, fixCfg, createUrl, wait, saveToConfig, waitAndLoadMore, getOrCreateQueryFolder } = require('./functions');

var query;
var workingDir;
var imageFileDir;
var n;
var width = 1920;
var height = 1080;

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array
}

async function fetchImageUrls(url, n) {
    console.log(`finding ${n} images with query ${query}...`)
    const results = [];
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        // DuckDuckGo shows a bot check to the default "HeadlessChrome" user agent
        await page.setUserAgent((await browser.userAgent()).replace('HeadlessChrome', 'Chrome'));
        await page.setViewport({ width, height });
        page.on('response', async (response) => {
            if (!response.url().includes('/i.js')) return;
            try {
                const json = await response.json();
                results.push(...json.results);
            } catch {
            }
        });
        await page.goto(url, { waitUntil: 'networkidle2' });
        await waitAndLoadMore(page, () => results.filter(isBigEnough).length, n * 3)
    } finally {
        await browser.close();
    }
    return shuffleArray(results.filter(isBigEnough)).map(result => result.image)
}

function isBigEnough(result) {
    return result.height >= height * 0.9 && result.width >= result.height
}

async function downloadImages(imageUrls, n) {
    let nn = 0
    for (const imageUrl of imageUrls) {
        if (nn >= n) break
        console.log(`\n${(nn + 1)} of ${n}`)
        const outputPath = path.join(imageFileDir, (new Date()).valueOf().toString());
        try {
            await downloadAndVerifyImage(imageUrl, outputPath)
            nn++
        } catch (err) {
            console.log(`skipping image because err: ${err.message}`)
        }
    }
    if (nn < n) {
        console.log(`\nonly found ${nn} of ${n} images`)
    }
}

async function downloadAndVerifyImage(imageUrl, outputPath) {
    console.log(`downloading from ${imageUrl} ... `)
    const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!String(response.headers['content-type']).startsWith('image')) {
        throw new Error(`The provided URL does not point to an image. Content: ${response.headers["content-type"]}`);
    }
    const dimensions = imageSize(new Uint8Array(response.data));
    if (!dimensions.width || dimensions.height < height * 0.9) {
        throw new Error(`Expected the height to be minimum ${(height * 0.9)}, got ${dimensions.height}`)
    }
    const filePath = `${outputPath}.${dimensions.type}`;
    fs.writeFileSync(filePath, response.data);
    console.log('Saved to ', filePath);
}

async function setParams() {
    const configParams = await getCFGFromFile()
    query = configParams["query"] && configParams["query"].replaceAll("_", " ")
    workingDir = configParams["workingDir"];
    n = configParams["n"]
    if (query === undefined) {
        query = await promptForValue(`write search query`, "", "query")
    }
    if (workingDir === undefined) {
        workingDir = await promptForValue(`write path for workingDir`, "", "workingDir")
    }
    if (n === undefined) {
        n = await promptForValue(`How many images do you wish to save`, "1", "n")
    }
    n = parseInt(n)
}

async function main() {
    await setParams()
    if (!query) {
        console.error("The Search query should not be empty");
        process.exit(1);
    }
    if (!workingDir) {
        console.error("The workingDir should not be empty");
        process.exit(1);
    }
    imageFileDir = getOrCreateQueryFolder(workingDir, query)

    const url = createUrl(query);
    console.log(`scraping wallpaper urls from the search results of ${url}...`)
    try {
        const imageUrls = await fetchImageUrls(url, n)
        await downloadImages(imageUrls, n)
    } catch (err) {
        console.error("error: ", err)
        process.exit(1)
    }
    process.exit(0);
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2), {
        string: ["q", "n"],
        boolean: ["h"],
        alias: {
            q: 'query',
            h: 'help',
            n: 'number'
        },
    });

    if (args.help) {
        console.log("Usage: node index.js  '-q'/'--query'");
        console.log('Options:');
        console.log('  -q, --query <string>   Specify the query phrase for which wallpapers to look for.');
        console.log('  -n, --number <number>   Specify the number of images to download');
        console.log('  -h, --help              Display help text');
        process.exit(0);
    }

    (async () => {
        await fixCfg()
        if (args.query === "") {
            await saveToConfig(undefined, "query")
        } else if (args.query) {
            await saveToConfig(args.query, "query")
        }
        if (args.number && parseInt(args.number) > 0) {
            await saveToConfig(parseInt(args.number), "n")
        }
        await main()
    })();
}
