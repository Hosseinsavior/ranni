const express = require('express');
const { bot } = require('./bot');
const { connectMongoDB } = require('./db');
const { botOwner, port } = require('./config');

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  try {
    console.log('Received Webhook request body:', req.body);
    if (!req.body || typeof req.body !== 'object') {
      console.error('Invalid request body: Body is empty or not an object');
      return res.status(400).send('Invalid request body');
    }
    if (!req.body.update_id) {
      console.error('Invalid Telegram update: Missing update_id', req.body);
      return res.status(400).send('Invalid Telegram update');
    }
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

(async () => {
  try {
    await connectMongoDB();
    const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook`;
    console.log('Setting webhook with URL:', webhookUrl);
    await bot.telegram.setWebhook(webhookUrl);
    console.log('Webhook set successfully to:', webhookUrl);
    const webhookInfo = await bot.telegram.getWebhookInfo();
    console.log('Webhook info:', webhookInfo);
    if (botOwner) {
      await bot.telegram.sendMessage(
        botOwner,
        `Bot started successfully on Render!\nWebhook set to: ${webhookUrl}\nWebhook Info: ${JSON.stringify(webhookInfo, null, 2)}`
      ).catch((err) => console.error('Failed to notify owner:', err));
    }
    console.log('Bot started');
  } catch (error) {
    console.error('Startup error:', error);
    if (botOwner) {
      await bot.telegram.sendMessage(
        botOwner,
        `Failed to start bot on Render!\nError: ${error.message}`
      ).catch((err) => console.error('Failed to notify owner:', err));
    }
    process.exit(1);
  }
})();

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});