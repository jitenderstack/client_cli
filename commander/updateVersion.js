const { exec } = require('child_process');
const readline = require('readline');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const fileSystem = require('fs');
const archiver = require('archiver');
const { WebClient } = require('@slack/web-api');
const dotenv = require('dotenv');


const token = '*****************************'; // Replace with your bot token
const slackClient = new WebClient(token);


// Promisify exec and rl.question
const execAsync = promisify(exec);


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to promisify rl.question
function askQuestion(query) {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}

async function sendFileToUser(userId, filePath, fileName) {
    try {
        // Check if the file exists
        if (!fileSystem.existsSync(filePath)) {
            throw new Error('File does not exist');
        }

        // Upload the file to Slack and send it to the user
        const uploadResult = await slackClient.files.upload({
            channels: userId, // Send the file directly to the user
            file: fileSystem.createReadStream(filePath),
            filename: fileName, // Optional: Name of the file being uploaded
            title: fileName, // Optional: Title for the file
        });

        await slackClient.chat.postMessage({
            channel: userId,
            text: 'testing',
            attachments: [
                {
                    text: `Here is the file you requested: <${uploadResult.file.permalink}|${uploadResult.file.name}>`,
                    footer: 'Sent via My Slack Bot',
                },
            ],
        });

        console.log(`File uploaded to user ${userId}: ${result.file.permalink}`);
    } catch (error) {
        console.error('Error sending file to user:', error);
    }
}

async function zipBuildFolder(buildFolderPath, outputZipPath) {
    return new Promise((resolve, reject) => {
        // Create a file to stream archive data to

        const output = fileSystem.createWriteStream(outputZipPath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Set the compression level (0-9)
        });

        output.on('close', () => {
            console.log(`Zipped ${archive.pointer()} total bytes.`);
            resolve();
        });

        archive.on('error', (err) => {
            reject(err);
        });

        // Pipe the archive data to the file
        archive.pipe(output);

        // Append files from the build folder to the archive
        archive.directory(buildFolderPath, false);

        // Finalize the archive (this is required)
        archive.finalize();
    });
}

async function updateEnvFile(envFilePath, version, environment) {
    try {
        // Check if the file exists asynchronously
        console.log('Looking for .env file at:', envFilePath);

        await fs.access(envFilePath);

        // Read the .env file asynchronously
        let envContent = await fs.readFile(envFilePath, 'utf-8', () => {
            console.log('callback')
        });

        const envKey = `REACT_APP_ENV`;
        // Convert the environment string to uppercase and replace hyphens with underscores
        const versionKey = `REACT_APP_VERSION`;
        const versionRegex = new RegExp(`^${versionKey}=.*`, 'm');
        const envRegex = new RegExp(`^${envKey}=.*`, 'm');


        if (versionRegex.test(envContent)) {
            // Replace the existing version value
            envContent = envContent.replace(versionRegex, `${versionKey}=${version}`);
            console.log(`Updated ${versionKey} in .env to: ${version}`);
        } else {
            // Append the new key-value if it doesn't exist
            envContent += `\n${versionKey}=${version}`;
            console.log(`Added ${versionKey} to .env with value: ${version}`);
        }

        if (envRegex.test(envContent)) {
            // Replace the existing REACT_APP_ENV value
            envContent = envContent.replace(envRegex, `${envKey}=${environment}`);
            console.log(`Updated ${envKey} in .env to: ${environment}`);
        } else {
            // Append the new REACT_APP_ENV key-value if it doesn't exist
            envContent += `\n${envKey}=${environment}`;
            console.log(`Added ${envKey} to .env with value: ${environment}`);
        }

        // Write the updated content back to the .env file asynchronously
        await fs.writeFile(envFilePath, envContent);
    } catch (error) {
        console.log('.env file not found or an error occurred:', error.message);
    }
}

async function updateJsonVersion(filePath, newVersion) {
    try {
        // Read the file as a string
        let fileContent = await fs.readFile(filePath, 'utf-8');

        // Create a regex to match the version field, assuming it's formatted like: "version": "1.0.0"
        const versionRegex = /"version":\s*"(\d+\.\d+(\.\d+)?)"/

        // Replace the version in the string with the new version
        if (versionRegex.test(fileContent)) {
            fileContent = fileContent.replace(versionRegex, `"version": "${newVersion}"`);
            console.log(`Version updated to: ${newVersion} in ${filePath}`);
        } else {
            console.log('Version key not found in the JSON file.');
        }

        // Write the updated string back to the file
        await fs.writeFile(filePath, fileContent);
    } catch (error) {
        console.error('An error occurred:', error.message);
    }
}

module.exports = function (program) {
    program
        .command('build <name>')
        .description('start build with environment (default stage)')
        .option('-v, --version <version>', 'specify the version')
        .option('-m, --message <message>', 'git commit message') // Add option for git commit message
        .action(async (name, options) => {
            const cwd = process.cwd();
            const versionKey = `REACT_APP_VERSION`;
            const envVersions = {
                'stage': 'development',
                'pre-prod': 'preproduction',
                'prod': 'production'
            }
            const envFilePath = path.join(cwd, '.env.' + envVersions[name]);
            const envResult = dotenv.config({ path: envFilePath });
            if (envResult.error) {
                console.error(`Error loading environment file: ${envFile}`);
                return;
            }


            const envVersion = process.env[versionKey];



            // Define the path to the manifest file in /public directory

            const manifestPath = path.join(cwd, 'public', 'manifest.json');
            const packageJsonPath = path.join(cwd, 'package.json');

            const buildPath = path.join(cwd, 'build')


            if (envVersion) {
                // Read and parse the manifest file

                const version = [...envVersion.split('.')]
                for (let i = version?.length; i > 0; i--) {
                    const updateVersion = +version[i - 1];
                    if (updateVersion === 9) {
                        version[i - 1] = 0
                    } else {
                        version[i - 1] = updateVersion + 1;
                        break;
                    }
                }
                // const { stdout: branchName, stderr } = await execAsync('git rev-parse --abbrev-ref HEAD');
                const newVersion = await askQuestion(`current version is ${envVersion} do you want to upgrade to ${version.join('.')} ? (Y/N)`);

                const updatedVersion = newVersion?.toLowerCase() === 'y' ? version.join('.') : envVersion;

                await updateJsonVersion(manifestPath, updatedVersion)
                await updateJsonVersion(packageJsonPath, updatedVersion)
                await updateEnvFile(envFilePath, updatedVersion, name)

                // Git commit if a message is provided
                if (options.message) {
                    try {
                        console.log('Committing changes...');
                        await execAsync(`git add .`);
                        await execAsync(`git commit -m "v${updatedVersion} - ${options.message}"`);
                        console.log('Changes committed successfully.');
                    } catch (err) {
                        console.error('Error committing changes:', err.message);
                        return;
                    }
                }


                console.log('start building application...');

                const { stdout: buildRes, stderr: buildErr } = await execAsync(`REACT_APP_VERSION="${updatedVersion}" REACT_APP_ENV="${name}"  npm run build:${name === 'pre-prod' ? 'preprod' : name}`); // here you canx add your build command
                console.error(buildErr);
                x
                const { stdout: commitId, stderr: commitErr } = await execAsync('git rev-parse --short HEAD');

                const newFileName = `build_${name}_${updatedVersion}_${commitId.trim()}.zip`

                const outputZipPath = path.join(cwd, newFileName)

                console.log('build successfully done')
                try {
                    await zipBuildFolder(buildPath, outputZipPath);
                    const sendToslack = await askQuestion('do you want to send this to slack ? (y/n)')

                    if (sendToslack === 'y') {
                        sendFileToUser('**********', outputZipPath, newFileName) // here 8 digit user id 
                    }

                    console.log('Build folder zipped successfully.');
                } catch (error) {
                    console.error('Error zipping the build folder:', error.message);
                }

                rl.close()

            } else {
                console.log('---configuration file not found---')
            }

        })
}