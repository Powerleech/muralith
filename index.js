#!/usr/bin/env node

const minimist = require('minimist');
const puppeteer = require('puppeteer');
const axios = require('axios');
const sizeOf = require('image-size');
const fs = require('fs');
const path = require('path');
const { getCFGFromFile, promptForValue, fixCfg, createUrl, wait, getHDUrl, saveToConfig, waitAndLoadMore, getOrCreateQueryFolder } = require('./functions');

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

async function HasImageClass(page, randomImage) {
    try {
        const hasClass = page.evaluate(element => {
            return element.classList.contains("tile--img__img");
        }, randomImage);

        return await hasClass;
    } catch {
        return false
    }
}

async function fetchImageUrl(url, n) {
    console.log(`finding ${n} images with query ${query}...`)
    let imgUrl = null;

    let nn = 0
    try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.goto(url);
        await waitAndLoadMore(page, n)
        const imgTags = await page.$$('img');
        const shuffledImages = shuffleArray(imgTags)

        while (n > nn) {
            try {
                console.log(`\n${(nn + 1)} of ${n}`)
                const randomImage = imgTags.pop()
                const validImage = await HasImageClass(page, randomImage)
                if (validImage !== true) {
                    throw new Error("not valid image")
                }
                await wait(1000)
                await randomImage.click();
                await wait(1000)

                await page.waitForSelector('.detail__inner');
                const pageContent = await page.content();
                try {
                    imgUrl = getHDUrl(pageContent, width, height);
                    const outputPath = path.join(workingDir, `${query.replaceAll(" ", "_")}`,`${(new Date()).valueOf().toString()}.jpg`);
                    await downloadAndVerifyImage(imgUrl, outputPath)
                } catch (err) {
                    console.log(`retry image ${(nn + 1)} because err: ${err}`)
                    continue
                }
                nn++
            } catch (err) {
                console.log("and error happened, retrying...", err)
                await wait(2000)
                continue
            }
        }
        await browser.close();
    } catch (err) {
        console.error("error: ", err)
        process.exit(1)
    }
}
async function downloadAndVerifyImage(imageUrl, outputPath) {
    console.log(`downloading from ${imageUrl} ... `)
    // @ts-ignore
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    if (response.headers['content-type'].startsWith('image')) {
        // @ts-ignore
        const dimensions = sizeOf(response.data);
        if (dimensions.width && dimensions.height) {
            fs.writeFileSync(outputPath, response.data);
            console.log('Saved to ', outputPath);
            return
        } else {
            console.log('Invalid image.');
        }
    } else {
        throw new Error(`The provided URL does not point to an image. Content: ${response.headers["content-type"]}`);
    }
}
async function setParams() {
    const configParams = await getCFGFromFile()
    query = configParams["query"].replaceAll("_", " ")
    workingDir = configParams["workingDir"];
    n = configParams["n"]
    if (query === undefined) {
        query = await promptForValue(`write search query (${query}): `, query, "query")
    }
    if (workingDir === undefined) {
        workingDir = await promptForValue(`write path for workingDir (${workingDir}): `, workingDir, "workingDir")
    }
    if (n === undefined) {
        n = await promptForValue(`How many images do you wish to save (${n}): `, 1, "n")
    }
    return
}
async function main() {
    await fixCfg()
    await setParams()
    imageFileDir = getOrCreateQueryFolder(workingDir, query)

    const url = createUrl(query, width, height);

    if (query === undefined || query === "") {
        console.error("The Search query should not be empty");
        process.exit(1);
    }
    console.log(`scraping wallpaper urls from the search results of ${url}...`)
    await fetchImageUrl(url, n)
    process.exit(0);
}

if (require.main === module) {
    let cleanWorkingDir = false
    const args = minimist(process.argv.slice(2), {
        string: ["q", "n"],

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

    if (args.query === "") {
        saveToConfig(undefined, "query")
    } else if (args.query) {
        saveToConfig(args.query, "query")
    }
    if (args.number && parseInt(args.number) > 0) {
        saveToConfig(args.number, "n")
    }
    (async () =>  main())();
}
