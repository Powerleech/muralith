#!/usr/bin/env node

const puppeteer = require('puppeteer');
const cheerio = require("cheerio")
const query = "salvador dali painting"
const axios = require('axios');
const sizeOf = require('image-size');
const fs = require('fs');
const path = require('path');


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

async function fetchImageUrl(url) {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto(url);
    await wait(2200);

    let retryCount = 0;
    const maxRetries = 5;
    let imgUrl = null;

    while (retryCount < maxRetries) {
        try {
            // Get all the image elements on the page
            const imgTags = await page.$$('img');

            // Pick a random index within the range of imgTags
            const randomIndex = Math.floor(Math.random() * imgTags.length);

            // Attempt to click the selected image directly
            await imgTags[randomIndex].click();
            await page.waitForTimeout(3000); // Use waitForTimeout instead of wait for a pause

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
            retryCount++;
        }
    }








//
//
//     // Get all the image elements on the page
//     const imgTags = await page.$$('img');
//
//     // Pick a random index within the range of imgTags
//     const randomIndex = Math.floor(Math.random() * imgTags.length);
//
//     await imgTags[randomIndex].click();
//     await wait(3000);
//     await page.waitForSelector('.detail__inner');
//     const pageContent = await page.content();
//     const imgUrl = getHDUrl(pageContent)
//     await browser.close();
//     return imgUrl
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

(async () => {
    const url = createUrl(query);
    const imageUrl = await fetchImageUrl(url)
    if(!imageUrl){
        console.error("error getting image url")
        process.exit(1)
    }
    const outputPath = path.join(__dirname, 'downloaded_image.jpg');
    await downloadAndVerifyImage(imageUrl, outputPath);
    process.exit(0);
})();

