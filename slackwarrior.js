'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (!process.env.token) {
  console.log('Error: Specify token in environment')
  process.exit(1)
}

const Botkit = require('botkit');

const slackwarrior = require('./slackwarriorPlugins');
const controllerFunctions = require('./controllerFunctions')

let controller = Botkit.slackbot({
  debug: false,
  json_file_store: './slackwarrior_jsondb',
});

global.controller = controller;

// connect the bot to a stream of messages
const bot = controller.spawn({
  token: process.env.token,
  retry: Infinity,
}).startRTM()

global.rtmbot = bot;


// this is fired whenever we connect to the RTM API
controller.on('rtm_open', (b) => {
  b.botkit.log('Connection to RTM API sucessfull.');
  // add all channels to global variable channels and update storage.channels
  controller.initChannels(b);
  // add all users to global variable users and update storage.users
  controller.initUsers(b);
});


// this is fired whenever we get disconnected from the RTM API
controller.on('rtm_close', (b) => {
  b.botkit.log('Connection to RTM API closed.');
});

// adds the given reaction to the given message
bot.addReaction = function (message, reaction) {
if (message.ts) {
  rtmbot.api.reactions.add({
    timestamp: message.ts,
    channel: message.channel,
    name: reaction,
  }, function (err) {
    if (err) {
      rtmbot.botkit.log('failed to add reaction `${reaction}`', err);
    }
  });
}}

// removes the given reaction from the given message
bot.removeReaction = function (message, reaction) {
if (message.ts) {
  rtmbot.api.reactions.remove({
    timestamp: message.ts,
    channel: message.channel,
    name: reaction,
  }, function (err) {
    if (err) {
      rtmbot.botkit.log(`failed to remove ${reaction} reaction`, err);
    }
  });
}}

controller.setupWebserver(13000, (err, webserver) => {
  controller.createWebhookEndpoints(webserver);
});

controller = controllerFunctions.decorate(controller, bot)

slackwarrior.init(controller);
