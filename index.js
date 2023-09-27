#!/usr/bin/env node

const minimist = require('minimist');
const puppeteer = require('puppeteer');
const axios = require('axios');
const sizeOf = require('image-size');
const fs = require('fs');
const path = require('path');
const { getCFGFromFile, promptForValue, fixCfg, createUrl, wait, getHDUrl, saveToConfig, deleteFilesInDirectory, waitAndLoadMore } = require('./functions');

var query;
var workingDir;
var favouritesDir;
var n;

async function fetchImageUrl(url, n) {
    const imgUrls = [];
    let retryCount = 0;
    const maxRetries = 5;
    let imgUrl = null;
    let nn = 0

    while (retryCount < maxRetries) {
        let randomIndex;

        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.goto(url);
        await waitAndLoadMore(page, n)
        console.log("page content should be loaded now")
        try {
            while (n > nn) {
                console.log(`getting ${nn} og ${n} images`)
                const imgTags = await page.$$('img');
                randomIndex = Math.floor(Math.random() * imgTags.length);
                await imgTags[randomIndex].click();
                await wait(3000)

                await page.waitForSelector('.detail__inner');
                const pageContent = await page.content();
                imgUrl = getHDUrl(pageContent);

                if(imgUrls.find(i => i === imgUrl)){
                    continue
                }
                imgUrls.push(imgUrl);
                nn++
            }
            await browser.close();
            return imgUrls
        } catch (error) {
            console.error(`Error during scraping image url (retry ${retryCount + 1}):`, error);
            await browser.close();
            retryCount++;
        }
    }
}
async function downloadAndVerifyImage(imageUrl, outputPath) {
    let retries = 0;
    const maxRetries = 5

    console.log("downloading ", imageUrl)
    while (retries < maxRetries) {
        try {
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
                console.log('The provided URL does not point to an image.');
            }
        } catch (error) {
            retries++;
            console.error('Error downloading or verifying the image:', error.code);
        }
    }
    console.error(`Failed to download and verify image ${imageUrl} after ${maxRetries} retries.`);
}
async function setParams() {
    const configParams = await getCFGFromFile()
    query = configParams["query"].replaceAll("_", " ")
    workingDir = configParams["workingDir"];
    favouritesDir = configParams["favouritesDir"];
    n = configParams["n"]
    if (query === undefined) {
        query = await promptForValue(`write search query (${query}): `, query, "query")
    }
    if (workingDir === undefined) {
        workingDir = await promptForValue(`write path for workingDir (${workingDir}): `, workingDir, "workingDir")
    }
    if (favouritesDir === undefined) {
        favouritesDir = await promptForValue(`write path for favouritesDir (${favouritesDir}): `, favouritesDir, "favouritesDir")
    }
    if (n === undefined) {
        n = await promptForValue(`How many images do you wish to save (${n}): `, 1, "n")
    }
    return
}
async function main(options) {
    await fixCfg()
    await setParams()
    if (options.cleanWorkingDir) {
        await deleteFilesInDirectory(workingDir)
    }
    const url = createUrl(query);

    if (query === undefined || query === "") {
        console.error("The Search query should not be empty");
        process.exit(1);
    }
    console.log(`scraping wallpaper urls from the search results of ${query}...`)
    const imageUrls = await fetchImageUrl(url, n)
    if (imageUrls.length === 0) {
        console.error("error getting image url")
        process.exit(1)
    }
    console.log(`downloading ${n} images with query ${query}...`)
    for (const imgUrl of imageUrls) {
        // @ts-ignore
        const outputPath = path.join(workingDir, `${query.replaceAll(" ", "_")}-${(new Date()).valueOf().toString()}.jpg`);
        console.log("Downloading images....")
        await downloadAndVerifyImage(imgUrl, outputPath);
    }
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
        const formattedQuery = args.query;
        saveToConfig(formattedQuery, "query")
        cleanWorkingDir = true
    }
    if (args.number && parseInt(args.number) > 0) {
        saveToConfig(args.number, "n")
    }
    (async () => await main({ cleanWorkingDir }))();
} 
