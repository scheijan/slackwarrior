'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (!process.env.token) {
  console.log('Error: Specify token in environment')
  process.exit(1)
}

const Botkit = require('botkit');

const shownotesPlugins = require('./shownotesPlugins');
const controllerFunctions = require('./controllerFunctions')

let controller = Botkit.slackbot({
  debug: false,
  json_file_store: './shownotes_jsondb',
});


// connect the bot to a stream of messages
const bot = controller.spawn({
  token: process.env.token,
  retry: Infinity,
}).startRTM()


// this is fired whenever we connect to the RTM API
controller.on('rtm_open', (b) => {
  b.botkit.log('Connection to RTM API sucessfull.');
  // add all channels to global variable channels and update storage.channels
  controller.initChannels(b);
  // add all users to global variable users and update storage.users
  // controller.initUsers(bot);
});

// this is fired whenever we get disconnected from the RTM API
controller.on('rtm_close', (b) => {
  b.botkit.log('Connection to RTM API closed.');
});

controller = controllerFunctions.decorate(controller, bot)

shownotesPlugins.init(controller);
