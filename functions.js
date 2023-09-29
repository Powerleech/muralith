const cheerio = require("cheerio")
const fs = require('fs');
const path = require('path');
const readline = require('readline')
const os = require("os")
const configFileName = '.muralith.json';
const configFilePath = `${os.homedir()}/${configFileName}`;


async function promptForValue(question, defaultValue, configKey) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(`${question} (${defaultValue}): `, (answer) => {
            answer = answer.trim() || defaultValue;
            saveToConfig(answer, configKey);
            rl.close();
            resolve(answer);
        });
    });
}

function deleteFilesInDirectory(directoryPath) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(`Would you like to delete all files in the temp folder ${directoryPath} (y/N): `, (answer) => {
            answer = answer.trim() || "n";
            rl.close();
            if (answer === "y") {
                fs.readdir(directoryPath, (err, files) => {
                    if (err) throw err;
                    console.log(`deleting files in ${directoryPath}`)
                    for (const file of files) {
                        fs.unlink(path.join(directoryPath, file), (err) => {
                            if (err) throw err;
                        });
                    }
                });
            }
            resolve();
        });
    });
}
function readFile(path, format = "utf8") {
    try {
        // @ts-ignore
        return fs.readFileSync(path, format);

    } catch (err) {
        console.error(`cout not read file ${path}. Error - ${err}`)
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

async function saveToConfig(value, key) {
    try {
        const fileData = readFile(configFilePath);
        const jsonData = JSON.parse(fileData);
        jsonData[key] = value;
        const updatedData = JSON.stringify(jsonData, null, 2); // Use null and 2 for pretty formatting
        writeToFile(configFilePath, updatedData);

        console.log(`Key '${key}' with value '${value}' written to config file`);
    } catch (err) {
        console.error('Error writing to JSON file:', err);
    }
}

async function getCFGFromFile() {
    try {
        await fs.promises.access(configFilePath, fs.constants.F_OK);
        const data = await fs.promises.readFile(configFilePath, 'utf8');
        const cfg = JSON.parse(data);

        return cfg;
    } catch (err) {
        console.error('Error:', err);
        throw err;
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
            }
        }
    });
    if (!imageUrl || imageUrl === undefined) {
        throw new Error("No hd image url found")
    }
    return imageUrl
}

async function waitAndLoadMore(page, n) {
    if(n <= 20) {
        await wait(4000)
    }
    if (n > 20) {
        await wait(2200);
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
    }
    if (n > 30) {
        await wait(2200);
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
    }
    if (n > 50) {
        await wait(2200);
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
    }
}

function wait(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

function createUrl(query) {
    const baseUrl = "https://duckduckgo.com/?t=h_";
    query = query + " hd wallpaper jpg art digital art images paintings"
    const q = new URLSearchParams(query);
    const suffix = "&iax=images&ia=images&iaf=size%3AWallpaper&";
    const url = baseUrl + "&q=" + q + suffix;
    return url;
}

async function fixCfg() {
    return new Promise((resolve, reject) => {
        fs.access(configFilePath, fs.constants.F_OK, (err) => {
            if (err) {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });

                rl.question('Config file not found. Do you want to generate it? (Y/n): ', (answer) => {
                    answer = answer.trim().toLowerCase() || 'y';
                    if (answer === 'y') {
                        fs.writeFile(configFilePath, '{}', (err) => {
                            rl.close();
                            if (err) {
                                console.error('Error generating the file:', err);

                                reject(err);
                            } else {
                                console.log(`File generated successfully at ${configFilePath}`);
                                resolve();
                            }
                        });
                    } else {
                        rl.close();
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    });
}


module.exports = {
    createUrl,
    wait,
    getCFGFromFile,
    getHDUrl,
    saveToConfig,
    writeToFile,
    readFile,
    promptForValue,
    fixCfg,
    deleteFilesInDirectory,
    waitAndLoadMore
}
