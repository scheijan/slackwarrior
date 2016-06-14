'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (!process.env.token) {
  console.log('Error: Specify token in environment')
  process.exit(1)
}

const Botkit = require('botkit');

const dashbot = require('dashbot')(process.env.DASHBOT_API_KEY).slack;
const slackwarrior = require('./slackwarriorPlugins');

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

// start a webserver to reply to Slack's OAuth
// the port is taken from the environment variable "port"
controller.setupWebserver(process.env.port, (err) => {
  if (!err) {
    // create an endpoint for incoming webhooks (maybe needed later)
    controller.createWebhookEndpoints(controller.webserver);
    // create an endpoint for Slack's Oauth requests
    controller.createOauthEndpoints(controller.webserver, (oauthErr, req, res) => {
      if (oauthErr) {
        res.status(500).send(`ERROR: ${oauthErr}`);
      } else {
        // redirect the user to the success page
        res.redirect('http://slackwarrior.org/success.html');
      }
    });
  } else {
    console.log('error setting up the webserver', err)
  }
});

// make the controller available globally
global.controller = controller;

// just a simple way to make sure we don't
// connect to the RTM twice for the same team
const bots = {};
function trackBot(bot) {
  bots[bot.config.token] = bot;
}

// this event is fired whenever the bot is installed on a new team
controller.on('create_bot', (bot, config) => {
  if (bots[bot.config.token]) {
    // already online, do nothing
  } else {
    // start the bot for the new team
    bot.startRTM((err) => {
      if (!err) {
        // add the bot to our global list of registered bots
        trackBot(bot)
        // add methods to add and remove reactions to the bot
        bot = decorateBot(bot)
        // message the user who installed the bot with further instructions
        bot.startPrivateConversation({ user: config.createdBy }, (convErr, convo) => {
          if (convErr) {
            bot.botkit.log(convErr);
          } else {
            convo.say('I am Slackwarrior and I have just joined your team - thank you for the invitation!');
            convo.say('You can now /invite me to a channel so that I can be of use. If you ask me to introduce myself there, I will announce my presence and some basic usage info.');
          }
        });
      }
    });
  }
});

// loop over all registered teams and spawn a bot instance for each of them
controller.storage.teams.all((err, teams) => {
  if (err) {
    throw new Error(err);
  }
  // connect all teams with bots up to Slack
  for (const t in teams) {
    if (teams[t].bot) {
      controller.spawn(teams[t]).startRTM((rtmErr, bot) => {
        if (rtmErr) {
          console.log('Error connecting bot to Slack:', rtmErr);
        } else {
          // add the bot to our global list of registered bots
          trackBot(bot)
          // add methods to add and remove reactions to the bot
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

// decorate the bot with methods to add and remove reactions
const decorateBot = (bot) => {
  const b = bot;
  // adds the given reaction to the given message
  b.addReaction = (message, reaction) => {
    b.api.reactions.add({
      timestamp: message.ts,
      channel: message.channel,
      name: reaction,
    }, err => {
      if (err) {
        b.botkit.log('failed to add reaction `${reaction}`', err);
      }
    });
  }

  // removes the given reaction from the given message
  b.removeReaction = (message, reaction) => {
    b.api.reactions.remove({
      timestamp: message.ts,
      channel: message.channel,
      name: reaction,
    }, err => {
      if (err) {
        b.botkit.log(`failed to remove ${reaction} reaction`, err);
      }
    });
  }
  return b
}

slackwarrior.init(controller);
