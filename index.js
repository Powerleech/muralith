#!/usr/bin/env node

const minimist = require('minimist');
const puppeteer = require('puppeteer-core');
const axios = require('axios');
const { imageSize } = require('image-size');
const prompts = require('@clack/prompts');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { configFilePath, getCFGFromFile, saveToConfig, migrateConfig, createUrl, waitAndLoadMore, getOrCreateQueryFolder, findBrowser, refreshFlatFolder } = require('./functions');

var queries = [];
const ADD_QUERY = Symbol('add');
var workingDir;
var imageFileDir;
var n;
var chrome;
var width = 1920;
var height = 1080;

const HELP = `Usage: muralith [options]

With no options in a terminal, muralith shows a menu.
With options, it downloads right away and asks only for missing values.

Options:
  -q, --query <string>    A query to download. Repeat for more queries.
                          It is added to the saved queries
  -n, --number <number>   The number of images to download per query
  -d, --dir <path>        The working folder. Images go into a subfolder per query
      --chrome <path>     The path to Chrome or Chromium, if it is not found
  -h, --help              Display help text

With no --query, it downloads the saved queries.
Settings are saved in ${configFilePath}`

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array
}

async function fetchImageUrls(url, n, executablePath, query) {
    console.log(`finding ${n} images with query ${query}...`)
    const results = [];
    const browser = await puppeteer.launch({ executablePath, headless: true });
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

function isInteractive() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

function loadParams() {
    migrateConfig()
    const configParams = getCFGFromFile()
    queries = configParams["queries"] || []
    workingDir = configParams["workingDir"];
    n = parseInt(configParams["n"]) || 1
    chrome = configParams["chrome"]
}

function exitIfCancel(value) {
    if (prompts.isCancel(value)) {
        prompts.cancel('Cancelled')
        process.exit(0)
    }
    return value
}

function hasQuery(query) {
    return queries.some(q => q.toLowerCase() === query.toLowerCase())
}

function addQueries(newQueries) {
    const missing = newQueries.filter(q => !hasQuery(q))
    if (!missing.length) return
    queries.push(...missing)
    saveToConfig(queries, "queries")
}

async function askQuery() {
    const query = exitIfCancel(await prompts.text({
        message: 'Search query',
        validate: value => {
            if (!value.trim()) return 'The search query should not be empty'
            if (hasQuery(value.trim())) return 'This query is already in the list'
        },
    })).trim()
    addQueries([query])
    return query
}

async function removeQueries() {
    if (!queries.length) {
        prompts.log.info('There are no queries to remove')
        return
    }
    const removed = exitIfCancel(await prompts.multiselect({
        message: 'Queries to remove',
        options: queries.map(q => ({ value: q, label: q })),
        required: false,
    }))
    queries = queries.filter(q => !removed.includes(q))
    saveToConfig(queries, "queries")
}

async function chooseQueries() {
    const selected = exitIfCancel(await prompts.multiselect({
        message: 'Queries to download',
        options: [
            ...queries.map(q => ({ value: q, label: q })),
            { value: ADD_QUERY, label: '+ Add new query' },
        ],
        initialValues: [...queries],
        required: true,
    }))
    if (!selected.includes(ADD_QUERY)) return selected
    const query = await askQuery()
    return [...selected.filter(q => q !== ADD_QUERY), query]
}

async function askNumber() {
    const value = exitIfCancel(await prompts.text({
        message: 'How many images do you wish to save',
        initialValue: String(n),
        validate: value => parseInt(value) > 0 ? undefined : 'Write a number above 0',
    }))
    n = parseInt(value)
    saveToConfig(n, "n")
}

function resolveDir(dir) {
    return path.resolve(dir.trim().replace(/^~(?=$|[\/\\])/, os.homedir()))
}

async function askWorkingDir() {
    workingDir = exitIfCancel(await prompts.text({
        message: 'Path for the working folder',
        initialValue: workingDir || '',
        validate: value => value.trim() ? undefined : 'The working folder should not be empty',
    }))
    workingDir = resolveDir(workingDir)
    saveToConfig(workingDir, "workingDir")
}

async function askMissingParams() {
    if (!queries.length) await askQuery()
    if (!workingDir) await askWorkingDir()
}

async function download(selected) {
    const executablePath = findBrowser(chrome)
    if (!executablePath) {
        throw new Error(chrome
            ? `Chrome was not found at ${chrome}. Fix the path with --chrome.`
            : 'Muralith needs Google Chrome or Chromium. Install Chrome from https://www.google.com/chrome/ and run again, or give the path with --chrome.')
    }
    for (const query of selected) {
        console.log(`\n== ${query} ==`)
        imageFileDir = getOrCreateQueryFolder(workingDir, query)
        const url = createUrl(query);
        console.log(`scraping wallpaper urls from the search results of ${url}...`)
        const imageUrls = await fetchImageUrls(url, n, executablePath, query)
        await downloadImages(imageUrls, n)
    }
    if (process.platform === 'darwin' && isInteractive()) await askRefreshFlatFolder()
}

async function askRefreshFlatFolder() {
    const refresh = exitIfCancel(await prompts.confirm({
        message: 'Refresh the flat wallpaper folder for macOS?',
        initialValue: true,
    }))
    if (!refresh) return
    const { flatDir, count } = refreshFlatFolder(workingDir)
    prompts.note(`${count} images linked into ${flatDir}\n\nIn System Settings > Wallpaper, choose "Add Folder..."\nand select this folder to rotate the wallpapers.`, 'Flat folder')
}

async function menu() {
    prompts.intro('muralith')
    while (true) {
        prompts.note(`queries: ${queries.join(', ') || '-'}\nimages:  ${n} per query\nfolder:  ${workingDir || '-'}`, 'Settings')
        const action = exitIfCancel(await prompts.select({
            message: 'What do you want to do?',
            options: [
                { value: 'download', label: 'Download wallpapers' },
                { value: 'remove', label: 'Remove query' },
                { value: 'number', label: 'Change number of images' },
                { value: 'dir', label: 'Change working folder' },
                { value: 'exit', label: 'Exit' },
            ],
        }))
        if (action === 'exit') break
        if (action === 'remove') await removeQueries()
        if (action === 'number') await askNumber()
        if (action === 'dir') await askWorkingDir()
        if (action === 'download') {
            await askMissingParams()
            const selected = await chooseQueries()
            try {
                await download(selected)
            } catch (err) {
                prompts.log.error(err.message)
            }
        }
    }
    prompts.outro('Bye')
}

async function main() {
    const args = minimist(process.argv.slice(2), {
        string: ["q", "n", "d", "chrome"],
        boolean: ["h"],
        alias: {
            q: 'query',
            h: 'help',
            n: 'number',
            d: 'dir'
        },
    });

    if (args.help) {
        console.log(HELP);
        return
    }

    loadParams()
    const flagQueries = [].concat(args.query || []).map(q => q.trim()).filter(Boolean)
    if (args.dir) workingDir = resolveDir(args.dir)
    if (args.chrome) chrome = args.chrome
    if (args.number !== undefined) {
        if (!(parseInt(args.number) > 0)) throw new Error('--number must be a number above 0')
        n = parseInt(args.number)
    }

    const hasFlags = ['query', 'number', 'dir', 'chrome'].some(key => args[key] !== undefined)
    if (!hasFlags && isInteractive()) {
        await menu()
        return
    }

    if (!isInteractive() && ((!queries.length && !flagQueries.length) || !workingDir)) {
        throw new Error('Missing --query or --dir. Give them as flags, or run muralith in a terminal to set them.')
    }
    if (args.chrome && !findBrowser(args.chrome)) throw new Error(`Chrome was not found at ${args.chrome}.`)
    addQueries(flagQueries)
    if (isInteractive()) await askMissingParams()
    if (args.dir) saveToConfig(workingDir, "workingDir")
    if (args.number !== undefined) saveToConfig(n, "n")
    if (args.chrome) saveToConfig(chrome, "chrome")
    const selected = flagQueries.length ? flagQueries
        : isInteractive() ? await chooseQueries()
        : queries
    await download(selected)
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(`error: ${err.message}`)
            process.exit(1)
        })
}
