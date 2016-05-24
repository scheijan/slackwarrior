process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

var Botkit = require('botkit');

var defaultPlugins = require('./defaultPlugins');
var slackwarrior = require('./slackwarriorPlugins');
var controllerFunctions = require('./controllerFunctions')

var controller = Botkit.slackbot({
  debug: false,
  json_file_store: './slackwarrior_jsondb'
});

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


controller = controllerFunctions.decorate(controller, bot)

slackwarrior.init(controller);
defaultPlugins.init(controller);

