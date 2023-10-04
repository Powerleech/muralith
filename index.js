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
var width = 1920;
var height = 1080;

async function fetchImageUrl(url, n) {
    console.log(`downloading ${n} images with query ${query}...`)
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
                console.log(`\n${(nn+1)} of ${n}`)
                const imgTags = await page.$$('img');
                randomIndex = Math.floor(Math.random() * imgTags.length);
                await imgTags[randomIndex].click();
                await wait(3000)

                await page.waitForSelector('.detail__inner');
                const pageContent = await page.content();
                try {
                    imgUrl = getHDUrl(pageContent, width, height);
                    const outputPath = path.join(workingDir, `${query.replaceAll(" ", "_")}-${(new Date()).valueOf().toString()}.jpg`);
                    await downloadAndVerifyImage(imgUrl, outputPath)
                } catch(err) {
                    console.log(`retry image ${nn} because err: ${err}`)
                    continue
                }
                nn++
            }
            await browser.close();
        } catch (error) {
            console.error(`images not ready yet, retrying ${retryCount + 1}/${maxRetries}:`);
            await browser.close();
            retryCount++;
        }
    }
}
async function downloadAndVerifyImage(imageUrl, outputPath) {
    let retries = 0;
    const maxRetries = 5

    console.log(`downloading from ${imageUrl} ... `)
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
                console.log('The provided URL does not point to an image. Content: ', response.headers["content-type"]);
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
        const formattedQuery = args.query;
        saveToConfig(formattedQuery, "query")
        cleanWorkingDir = true
    }
    if (args.number && parseInt(args.number) > 0) {
        saveToConfig(args.number, "n")
    }
    (async () => await main({ cleanWorkingDir }))();
} 
