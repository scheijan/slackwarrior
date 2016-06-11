'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (!process.env.token) {
  console.log('Error: Specify token in environment')
  process.exit(1)
}

const Botkit = require('botkit');

const dashbot = require('dashbot')(process.env.DASHBOT_API_KEY).slack;
const slackwarrior = require('./slackwarriorPlugins');
const controllerFunctions = require('./controllerFunctions')

let controller = Botkit.slackbot({
  debug: false,
  json_file_store: './slackwarrior_jsondb',
}).configureSlackApp(
  {
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    scopes: ['bot'],
  }
);

// Add the dashbot middleware
controller.middleware.receive.use(dashbot.receive);
controller.middleware.send.use(dashbot.send);

global.controller = controller;

controller.setupWebserver(process.env.port, (err, webserver) => {
  controller.createWebhookEndpoints(controller.webserver);

  controller.createOauthEndpoints(controller.webserver, (oauthErr, req, res) => {
    if (oauthErr) {
      res.status(500).send(`ERROR: ${oauthErr}`);
    } else {
      //res.send('Success!');
      res.redirect('http://slackwarrior.scheijan.net');
    }
  });
})
;
// just a simple way to make sure we don't
// connect to the RTM twice for the same team
const bots = {};
function trackBot(bot) {
  bots[bot.config.token] = bot;
}

controller.on('create_bot', (bot, config) => {
  if (bots[bot.config.token]) {
    // already online! do nothing.
  } else {
    bot.startRTM((err) => {
      if (!err) {
        bot.botkit.log('new tem')
        bot.botkit.log('config', config)

        trackBot(bot);
        bot = decorateBot(bot)
      

        bot.startPrivateConversation({ user: config.createdBy }, (convErr, convo) => {
          if (convErr) {
            bot.botkit.log(convErr);
          } else {
            convo.say('I am Slackwarrior and I have just joined your team');
            convo.say('You can now /invite me to a channel so that I can be of use. If you ask me to introduce myself there, I will announce my presence and some basic usage info.');
          }
        });
      }
    });
  }
});

controller.storage.teams.all((err, teams) => {
  if (err) {
    throw new Error(err);
  }

  // connect all teams with bots up to slack!
  for (var t in teams) {
    if (teams[t].bot) {
      controller.spawn(teams[t]).startRTM((rtmErr, bot) => {
        if (rtmErr) {
          console.log('Error connecting bot to Slack:', rtmErr);
        } else {
          trackBot(bot);
          bot = decorateBot(bot)
        }
      });
    }
  }
});


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

const decorateBot = (bot) => {
  const b = bot;
  // adds the given reaction to the given message
  b.addReaction = function (message, reaction) {
    this.api.reactions.add({
      timestamp: message.ts,
      channel: message.channel,
      name: reaction,
    }, function (err) {
      if (err) {
        this.botkit.log('failed to add reaction `${reaction}`', err);
      }
    });
  }

  // removes the given reaction from the given message
  b.removeReaction = function (message, reaction) {
    this.api.reactions.remove({
      timestamp: message.ts,
      channel: message.channel,
      name: reaction,
    }, function (err) {
      if (err) {
        this.botkit.log(`failed to remove ${reaction} reaction`, err);
      }
    });
  }
  return b
}

controller = controllerFunctions.decorate(controller)

slackwarrior.init(controller);
