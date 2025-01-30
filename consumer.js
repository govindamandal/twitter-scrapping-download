const amqp = require("amqplib");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const cheerio = require("cheerio");

const QUEUE_NAME = "twitter_video_queue";
const DOWNLOAD_FOLDER = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER);
}

// Function to sanitize filename (max length: 100 characters)
const sanitizeFileName = (text) => {
    return text.replace(/[^a-zA-Z0-9 ]+/g, " ").trim().substring(0, 100) + ".mp4";
};

// Function to fetch video URL
async function getTwitterVideoUrl(tweetUrl) {
    try {
        // Ensure URL is correct
        tweetUrl = tweetUrl.replace("x.com", "twitter.com");

        const response = await axios.get(`https://twitsave.com/info?url=${tweetUrl}`);
        const $ = cheerio.load(response.data);

        const qualityButtons = $(".origin-top-right a");
        if (!qualityButtons.length) return null;

        const highestQualityUrl = qualityButtons.first().attr("href");
        const rawTitle = $(".leading-tight p.m-2").first().text();
        const fileName = sanitizeFileName(rawTitle);

        return { videoUrl: highestQualityUrl, fileName };
    } catch (error) {
        console.error(`Failed to extract video from: ${tweetUrl}`, error.message);
        return null;
    }
}

// Function to download video
function downloadVideo(videoUrl, fileName, statusId) {
    return new Promise((resolve, reject) => {
        const videoFolder = path.join(DOWNLOAD_FOLDER, statusId);
        if (!fs.existsSync(videoFolder)) {
          fs.mkdirSync(videoFolder);
        }

        if (fileName === '.mp4') {
          fileName = statusId + fileName;
        }
        
        const filePath = path.join(videoFolder, fileName);
        if (!fs.existsSync(filePath)) {
          const command = `curl -L "${videoUrl}" -o "${filePath}"`;
          exec(command, (error) => {
              if (error) {
                  console.error(`Error downloading ${fileName}:`, error.message);
                  reject(error);
              } else {
                  console.log(`Downloaded: ${fileName}`);
                  resolve();
              }
          });
        }

    });
}

// Consumer Function
async function startConsumer() {
    const connection = await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    console.log("Waiting for messages...");

    channel.consume(QUEUE_NAME, async (msg) => {
        if (msg !== null) {
            const tweetUrl = msg.content.toString();
            console.log(`Processing: ${tweetUrl}`);

            const statusId = tweetUrl.split('/')[tweetUrl.split('/').length - 1];

            const result = await getTwitterVideoUrl(tweetUrl);
            if (!result || !result.videoUrl) {
                console.warn(`No video found for ${tweetUrl}`);
                channel.ack(msg);
                return;
            }

            try {
                await downloadVideo(result.videoUrl, result.fileName, statusId);
                channel.ack(msg); // Acknowledge message after successful download
            } catch (error) {
                console.error(`Failed to download: ${tweetUrl}`);
            }
        }
    }, { noAck: false });
}

startConsumer().catch(console.error);