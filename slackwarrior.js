process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

var Botkit = require('botkit');

var defaultPlugins = require('./defaultPlugins');
var slackwarrior = require('./slackwarriorPlugins');
var controllerFunctions = require('./controllerFunctions')

var controller = Botkit.slackbot({
  debug: false,
  json_file_store: './slackwarrior_jsondb'
});

GLOBAL.controller = controller;

// connect the bot to a stream of messages
var bot = controller.spawn({
  // familie
  // token: '***REMOVED***',
  // my adaeze
  // token: '***REMOVED***',
  // metaebene
  // token: '***REMOVED***',
  // slackwarrior
  token: '***REMOVED***',
  retry: Infinity
}).startRTM()


// this is fired whenever we connect to the RTM API
controller.on('rtm_open', function (bot, message) {
  bot.botkit.log('Connection to RTM API sucessfull.');
  // add all channels to global variable channels and update storage.channels
  controller.initChannels(bot);
  // add all users to global variable users and update storage.users
  controller.initUsers(bot);
});


// this is fired whenever we get disconnected from the RTM API
controller.on('rtm_close', function (bot, message) {
  bot.botkit.log('Connection to RTM API closed.');
});

// adds the given reaction to the given message
bot.addReaction = function(message, reaction) {
  this.api.reactions.add({
    timestamp: message.ts,
    channel: message.channel,
    name: reaction,
    }, function(err, res) {
    if (err) {
      this.botkit.log('failed to add ' + reaction + ' reaction', err);
    }
  });
}

// removes the given reaction from the given message
bot.removeReaction = function(message, reaction) {
  this.api.reactions.remove({
    timestamp: message.ts,
    channel: message.channel,
    name: reaction,
    }, function(err, res) {
    if (err) {
      this.botkit.log('failed to remove ' + reaction + ' reaction', err);
    }
  });
}


controller = controllerFunctions.decorate(controller, bot)

slackwarrior.init(controller);
defaultPlugins.init(controller);

