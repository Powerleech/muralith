#!/usr/bin/env node

const puppeteer = require('puppeteer');
const cheerio = require("cheerio")
const axios = require('axios');
const sizeOf = require('image-size');
const fs = require('fs');
const path = require('path');
const readline = require('readline')
const os = require("os")
const configFileName = '.muralith.json'; // Replace with your desired file name
const configFilePath = `${os.homedir()}/${configFileName}`;

let query;
let workingDir;
let favouritesDir;
let n;

let temp = [];
function createUrl(query) {
    const baseUrl = "https://duckduckgo.com/?t=h_";
    const q = new URLSearchParams(query);
    const suffix = "&iax=images&ia=images&iaf=size%3AWallpaper&pn=2";
    const url = baseUrl + "&q=" + q + suffix;
    return url;
}

function wait(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

async function fixCfg() {
    fs.access(configFilePath, fs.constants.F_OK, (err) => {
        if (err) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            rl.question('Config file not found. Do you want to generate it? (Y/n): ', (answer) => {
                answer = answer.trim().toLowerCase() || 'y';
                if (answer === 'y') {
                    fs.writeFile(filePath, "{}", (err) => {
                        if (err) {
                            console.error('Error generating the file:', err);
                            process.exit(1)
                        } else {
                            console.log(`File generated successfully at ${configFilePath}`);
                        }
                    });
                }
                rl.close();
            });
        } else {
            console.log('Config file found');
        }
    });
    return
}

async function fetchImageUrl(url) {
    let retryCount = 0;
    const maxRetries = 5;
    let imgUrl = null;
    const browser = await puppeteer.launch({ headless: "new" });

    while (retryCount < maxRetries) {
        try {
            const browser = await puppeteer.launch({ headless: "new" });
            const page = await browser.newPage();
            await page.goto(url);
            await wait(2200);

            // Get all the image elements on the page
            const imgTags = await page.$$('img');

            // Pick a random index within the range of imgTags
            const randomIndex = Math.floor(Math.random() * imgTags.length);

            // Attempt to click the selected image directly
            await imgTags[randomIndex].click();
            wait(3000)

            // Wait for the .detail__inner element
            await page.waitForSelector('.detail__inner');

            // Get the page content after the click
            const pageContent = await page.content();

            // Extract the HD image URL using your getHDUrl function
            imgUrl = getHDUrl(pageContent);

            await browser.close();
            return imgUrl;
        } catch (error) {
            console.error(`Error during image fetching (retry ${retryCount + 1}):`, error);
            await browser.close();
            retryCount++;
        }
    }
}

function getHDUrl(pageContent) {
    const $ = cheerio.load(pageContent);
    const detailInnerHtml = $('.detail__inner img');
    let imageUrl;
    detailInnerHtml.each((index, element) => {
        const src = $(element).attr('src');
        const className = $(element).attr('class');
        if (src) {
            const parts = src.split('?u=');
            if (parts.length > 1 && !className.includes("thumb")) {
                const lastPart = parts[1];
                imageUrl = decodeURIComponent(src);
            } else if (parts.length > 1) {
                temp.push(imageUrl)
            }
        }
    });
    if (!imageUrl || imageUrl === undefined) {
        throw new Error("No hd image url found")
    }
    return imageUrl
}

async function downloadAndVerifyImage(imageUrl, outputPath) {
    let retries = 0;
    const maxRetries = 5

    while (retries < maxRetries) {
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            // Check if the response contains image data
            if (response.headers['content-type'].startsWith('image')) {
                const dimensions = sizeOf(response.data);
                if (dimensions.width && dimensions.height) {
                    fs.writeFileSync(outputPath, response.data);
                    console.log('Image downloaded and verified successfully.');
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
    console.error(`Failed to download and verify image after ${maxRetries} retries.`);
}

async function getCFGFromFile() {
    try {
        // Check if the file exists
        await fs.promises.access(configFilePath, fs.constants.F_OK);

        // Read the file
        const data = await fs.promises.readFile(configFilePath, 'utf8');

        // Parse the JSON data
        const cfg = JSON.parse(data);

        return cfg;
    } catch (err) {
        console.error('Error:', err);
        throw err; // Rethrow the error if you want to handle it further up the call stack.
    }
}
async function saveToConfig(value, key) {
    console.log(`TODO save ${value} to cfg.${key}`)
}

async function promptForQuery() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question(`write search query (${query}): `, (answer) => {
        answer = answer.trim().toLowerCase() || query;
        saveToConfig(answer, "query")
        rl.close();
    });
}

async function promptForWorkingDir() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question(`write path for workingDir (${workingDir}): `, (answer) => {
        answer = answer.trim().toLowerCase() || workingDir;
        saveToConfig(answer, "workingDir")
        rl.close();
    });
}
async function promptForfavouritesDir() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question(`write path for favouritesDir (${favouritesDir}): `, (answer) => {
        answer = answer.trim().toLowerCase() || favouritesDir;
        saveToConfig(answer, "favouritesDir")
        rl.close();
    });
}
async function promptForN() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question(`How many images do you wish to save (${n}): `, (answer) => {
        answer = answer.trim().toLowerCase() || n;
        saveToConfig(answer, "n")
        rl.close();
    });
}



async function setParams() {
    const configParams = await getCFGFromFile()
    query = configParams["query"]
    workingDir = configParams["workingDir"];
    favouritesDir = configParams["favouritesDir"];
    n = configParams["n"]
    if (!query) {
        await promptForQuery()
    }
    if (!workingDir) {
        await promptForWorkingDir()
    }
    if (!favouritesDir) {
        await promptForfavouritesDir()
    }
    if (!n) {
        await promptForN()
    }
    return
}

(async () => {
    await fixCfg()
    await setParams()
    const url = createUrl(query);

    let nn = 0
    console.log(`downloading ${n} images with query ${query}...`)
    while (n >= nn) {
        const imageUrl = await fetchImageUrl(url)
        if (!imageUrl) {
            console.error("error getting image url")
            process.exit(1)
        }
        const outputPath = path.join(workingDir, `downloaded_image-${(new Date()).valueOf().toString()}.jpg`);
        await downloadAndVerifyImage(imageUrl, outputPath);
        nn++
    }
    process.exit(0);
})();

