const amqp = require("amqplib");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const QUEUE_NAME = "twitter_video_queue";
const DATASET_FOLDER = path.join(__dirname, "dataset");

if (!fs.existsSync(DATASET_FOLDER)) {
  fs.mkdirSync(DATASET_FOLDER);
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
      if (tweetUrl) {
        console.log(`Processing: ${tweetUrl}`);

        const statusId = tweetUrl.split('/').pop();
        console.log(`Status ID: ${statusId}`);
        const vidFolder = path.join(DATASET_FOLDER, 'videos');
        if (!fs.existsSync(vidFolder)) {
          fs.mkdirSync(vidFolder);
        }

        const videoFolder = path.join(vidFolder, statusId);
        if (!fs.existsSync(videoFolder)) {
          fs.mkdirSync(videoFolder);
        }

        exec(`yt-dlp -o ${videoFolder}/${statusId}.mp4 ${tweetUrl}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error downloading video: ${error.message}`);
            channel.nack(msg);
            return;
          }
          if (stderr) {
            console.error(`stderr: ${stderr}`);
            channel.nack(msg);
            return;
          }
          console.log(`stdout: ${stdout}`);
          channel.ack(msg);
        }
        );
      }
    }
  }, { noAck: false });
}

startConsumer().catch(console.error);