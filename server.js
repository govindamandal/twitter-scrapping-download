require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const csvParser = require("csv-parser");
const amqp = require("amqplib");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5000;
const QUEUE_NAME = "twitter_video_queue";
const DATASET_FOLDER = path.join(__dirname, "dataset");

if (!fs.existsSync(DATASET_FOLDER)) {
  fs.mkdirSync(DATASET_FOLDER);
}
// Configure Multer for file uploads
const upload = multer({ dest: "uploads/" });

// RabbitMQ connection
let channel, connection;
async function connectQueue() {
  try {
    connection = await amqp.connect("amqp://localhost");
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME);
    console.log("Connected to RabbitMQ");
  } catch (error) {
    console.error("RabbitMQ connection error:", error);
  }
}
connectQueue();

async function downloadImage(url, filename) {
  console.log('url: govinda: ', url);
  try {
    const response = await fetch(url);
    const buffer = await response.buffer();
    fs.writeFileSync(filename, buffer);
    console.log(`Downloaded: ${filename}`);
  } catch (error) {
    console.log(error)
  }
}

// API to upload CSV
app.post("/upload", upload.single("file"), (req, res) => {
  const filePath = req.file.path;
  const videoLinks = [];

  fs.createReadStream(filePath)
    .pipe(csvParser())
    .on("data", (row) => {
      const videoUrl = row["VideoLink"]?.replace('x.com', 'twitter.com'); // Extract VideoLink column

      if (videoUrl && videoUrl.startsWith("https://twitter.com")) {
        channel.sendToQueue(QUEUE_NAME, Buffer.from(videoUrl), { persistent: true });
        console.log(`Queued: ${videoUrl}`);
      } else {
        console.warn(`Skipping invalid video URL: ${videoUrl}`);
      }

      // Downloading images
      if (!fs.existsSync(DATASET_FOLDER)) {
        fs.mkdirSync(DATASET_FOLDER);
      }

      const imgFolder = path.join(DATASET_FOLDER, 'images');
      if (!fs.existsSync(imgFolder)) {
        fs.mkdirSync(imgFolder);
      }

      if (Boolean(row["ImageLinks"])) {
        const imageUrls = row["ImageLinks"]?.split('|');
        if (imageUrls) {
          imageUrls.forEach((link, i) => {
            // create folder to store
            const imageFolder = path.join(imgFolder, row['StatusID']);
            if (!fs.existsSync(imageFolder)) {
              fs.mkdirSync(imageFolder);
            }
            const fileName = path.join(imageFolder,`${row['StatusID']}-image${i + 1}.jpg`);
            downloadImage(link, fileName);
          })
        }
      }
    })
    .on("end", () => {
      fs.unlinkSync(filePath); // Delete file after processing
      videoLinks.forEach((link) => {
        channel.sendToQueue(QUEUE_NAME, Buffer.from(link));
      });
      res.json({ message: "CSV uploaded, videos are being processed." });
    });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  exec(`rabbitmqctl delete_queue  twitter_video_queue`)
});