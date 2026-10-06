const fs = require('fs');
const path = require('path');
const os = require("os")
const configFileName = '.muralith.json';
const configFilePath = `${os.homedir()}/${configFileName}`;

function readFile(path, format = "utf8") {
    try {
        // @ts-ignore
        return fs.readFileSync(path, format);

    } catch (err) {
        console.error(`could not read file ${path}. Error - ${err}`)
    }
}

function writeToFile(filePath, content, format = "utf8") {
    try {
        // @ts-ignore
        const destinationDir = path.dirname(filePath);
        if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
        }
        // @ts-ignore
        fs.writeFileSync(filePath, content, format);
    } catch (error) {
        console.error(`Error writing to file: ${error}`);
    }
}

function getCFGFromFile() {
    if (!fs.existsSync(configFilePath)) return {}
    try {
        return JSON.parse(readFile(configFilePath));
    } catch (err) {
        console.error(`could not parse ${configFilePath}. Error - ${err}`)
        return {}
    }
}

function saveToConfig(value, key) {
    const cfg = getCFGFromFile();
    cfg[key] = value;
    writeToFile(configFilePath, JSON.stringify(cfg, null, 2));
}

/**
 * Moves the old single `query` key into the `queries` list.
 */
function migrateConfig() {
    const cfg = getCFGFromFile();
    if (cfg.queries || !cfg.query) return
    cfg.queries = [cfg.query.replaceAll("_", " ")];
    delete cfg.query;
    writeToFile(configFilePath, JSON.stringify(cfg, null, 2));
}

function getOrCreateQueryFolder(workingDir, query) {
    const folderName = query.replaceAll(" ", "_").toLowerCase()
    const subFolderPath = path.join(workingDir, folderName);

    if (!fs.existsSync(subFolderPath)) {
        fs.mkdirSync(subFolderPath, { recursive: true });
        console.log(`Subfolder '${subFolderPath}' created successfully.`);
    }
    return subFolderPath
}

/**
 * Returns the path of an installed Chrome or Chromium, or undefined.
 * A custom path from --chrome or the config wins over the known paths.
 */
function findBrowser(customPath) {
    const candidates = customPath ? [customPath] : browserPaths()
    return candidates.find(p => p && fs.existsSync(p))
}

function browserPaths() {
    if (process.platform === 'darwin') {
        const apps = [
            'Google Chrome.app/Contents/MacOS/Google Chrome',
            'Chromium.app/Contents/MacOS/Chromium',
        ]
        return ['/Applications', path.join(os.homedir(), 'Applications')]
            .flatMap(dir => apps.map(app => path.join(dir, app)))
    }
    if (process.platform === 'win32') {
        const exes = [
            'Google\\Chrome\\Application\\chrome.exe',
            'Chromium\\Application\\chrome.exe',
        ]
        return [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']]
            .filter(Boolean)
            .flatMap(dir => exes.map(exe => path.join(dir, exe)))
    }
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
    return (process.env.PATH || '').split(path.delimiter)
        .flatMap(dir => names.map(name => path.join(dir, name)))
}

async function waitAndLoadMore(page, getCount, target) {
    console.log("making sure images are fully loaded...")
    for (let i = 0; i < 10 && getCount() < target; i++) {
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        console.log("...")
        await wait(2000);
    }
    console.log(`found ${getCount()} images`)
}

function wait(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

function createUrl(query) {
    const q = encodeURIComponent(`hd ${query}`);
    return `https://duckduckgo.com/?q=${q}&iax=images&ia=images&iaf=size%3AWallpaper`;
}

module.exports = {
    configFilePath,
    createUrl,
    wait,
    getCFGFromFile,
    saveToConfig,
    migrateConfig,
    writeToFile,
    readFile,
    waitAndLoadMore,
    getOrCreateQueryFolder,
    findBrowser
}
