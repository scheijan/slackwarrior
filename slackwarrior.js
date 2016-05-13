process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

var Botkit = require('botkit');

var defaultPlugins = require('./defaultPlugins');
var mePlugins = require('./mePlugins');
var slackwarrior = require('./slackwarrior');

var controller = Botkit.slackbot({
  debug: false,
  json_file_store: './jsondb'
});

var users = [];
var channels = [];

// connect the bot to a stream of messages
var bot = controller.spawn({
  // familie
  // token: '***REMOVED***',
  // my adaeze
  token: '***REMOVED***',
  // metaebene
  // token: '***REMOVED***',
  // slackwarrior
  // token: '***REMOVED***',
  retry: Infinity
}).startRTM()


// this is fired whenever we connect to the RTM API
controller.on('rtm_open', function (bot, message) {
  bot.botkit.log('Connection to RTM API sucessfull.');
  // add all channels to global variable channels and update storage.channels
  controller.initChannels(bot);
  // add all users to global variable users and update storage.users
  controller.initUsers(bot);
  bot.botkit.log(channels);
});


// this is fired whenever we get disconnected from the RTM API
controller.on('rtm_close', function (bot, message) {
  bot.botkit.log('Connection to RTM API closed.');
});


controller.hears(['initusers'], 'direct_message', function(bot, message) {
  controller.initUsers(bot, message);
});


controller.hears(['initchannels'], 'direct_message', function(bot, message) {
  controller.initChannels(bot, message);
});

// this event is fired whenever a new member joins the team
// this is where we could send a welcome message
//controller.on('team_join', function (bot, message) {
  // call initUsers again to add that user to the list
  //controller.initUsers(bot);
//  var userid = message.user;
//  bot.botkit.log('userid: ' + JSON.stringify(userid));
//  bot.api.users.info({user: userid}, function (err, response) {
//    var username = response.user.name;
//    bot.botkit.log('username: ', username);
//    bot.api.chat.postMessage({channel: '@' + username, text: 'Hey there ' + username + '! Welcome to the team =)', as_user: true});
//  });
// });


controller.getUserByName = function(userName) {
  for (var i = users.length - 1; i >= 0; i--) {
    var u = users[i];
    if (u.name === userName) {
      return u;
    }
  }
}


controller.getUserByID = function(id) {
  for (var i = users.length - 1; i >= 0; i--) {
    var u = users[i];
    if (u.id === id) {
      return u;
    }
  }
}


controller.getChannelByName = function(channelName) {
  if (channelName.indexOf('#') > -1) {
    channelName = channelName.replace('#','');
  }
  for (var i = channels.length - 1; i >= 0; i--) {
    var c = channels[i];
    if (c.name === channelName) {
      return c;
    }
  }
}


controller.getChannelByID = function(id) {
  for (var i = channels.length - 1; i >= 0; i--) {
    var c = channels[i];
    if (c.id === id) {
      return c;
    }
  }
}

controller.getChannelID = function(channelName) {
   if (channelName.indexOf('#') > -1) {
      channelName = channelName.replace('#','');
      channelName = channelName.replace('<','');
      channelName = channelName.replace('>','');
    } 

    if (channelName.indexOf('|') > -1) {
      channelName = channelName.split('|')[0]
    }

    var channel = controller.getChannelByName(channelName);
    if (channel) {
      return channel.id;
    }
    
    return channelName;
}


controller.initUsers = function(bot) {
  users = [];
  bot.api.users.list({}, function (err, res) {
    if (!err) {
      bot.botkit.log('got users', res.members.length);
      for (var i = res.members.length - 1; i >= 0; i--) {
        var u = res.members[i];
        users.push(u);
        // bot.botkit.log('adding user', u);
        controller.storage.users.get(u.id, function(err, user) {
          if (user) {
            // bot.botkit.log('I already have ' + user.id + ' in my dossier.');
          } else {
            controller.storage.users.save(u, function(err, id) {
              if (!err) {
                // bot.botkit.log('added user', id);
              } else {
                bot.botkit.log('error adding user', err);
              }
            });
          }
        });
      }
      bot.botkit.log('I have ' + res.members.length + ' users in my dossier now.');
    } else {
      bot.botkit.log('error getting users', err);
    }
  })
}


controller.initChannels = function(bot) {
  bot.api.channels.list({}, function (err, res) {
    if (!err) {
      bot.botkit.log('got channels', res.channels.length);
      for (var i = res.channels.length - 1; i >= 0; i--) {
        var c = res.channels[i];
        // bot.botkit.log('adding channel', c);
        channels.push(c);
        controller.storage.channels.save(c, function(err, id) {
          if (!err) {
            // bot.botkit.log('added channel', id);
          } else {
            bot.botkit.log('error adding channel', err);
          }
        });
      }
      bot.botkit.log('I have added ' + res.channels.length + ' channels to my dossier.');
    } else {
      bot.botkit.log('error getting users', err);
    }
  })
}



slackwarrior.init(controller);
// mePlugins.init(controller);
defaultPlugins.init(controller);

