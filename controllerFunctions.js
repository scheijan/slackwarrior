

exports.decorate = function (controller, bot) {

  controller.users = []
  controller.channels = []
    
  controller.getUserByName = function(userName) {
    for (var i = controller.users.length - 1; i >= 0; i--) {
      var u = controller.users[i];
      if (u.name === userName) {
        return u;
      }
    }
  }

  controller.getUserByID = function(id) {
    for (var i = controller.users.length - 1; i >= 0; i--) {
      var u = controller.users[i];
      if (u.id === id) {
        return u;
      }
    }
  }

  controller.getChannelByName = function(channelName) {
    if (channelName.indexOf('#') > -1) {
      channelName = channelName.replace('#','');
    }
    for (var i = controller.channels.length - 1; i >= 0; i--) {
      var c = controller.channels[i];
      if (c.name === channelName) {
        return c;
      }
    }
  }

  controller.getChannelByID = function(id) {
    for (var i = controller.channels.length - 1; i >= 0; i--) {
      var c = controller.channels[i];
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
    bot.api.users.list({}, function (err, res) {
      if (!err) {
        bot.botkit.log('got users', res.members.length);
        for (var i = res.members.length - 1; i >= 0; i--) {
          var u = res.members[i];
          controller.users.push(u);
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

  function initChannel(bot, channel) {
    controller.storage.channels.get(channel.id, function(err, c) {
      if (c) {
        // bot.botkit.log('I already have ' + channel.id + ' in my dossier.');
      } else {
        controller.storage.channels.save(channel, function(err, id) {
          if (!err) {
            // bot.botkit.log('added channel', id);
          } else {
            bot.botkit.log('error adding channel', err);
          }
        });
      }
    })
  }

  controller.initChannels = function(bot) {
    bot.api.channels.list({}, function (err, res) {
      if (!err) {
        bot.botkit.log('got channels', res.channels.length);
        
        for (var i = 0; i < res.channels.length; i++) {
          var c = res.channels[i];
          controller.channels.push(c);
          initChannel(bot, c)
        }
        bot.botkit.log('I have added ' + res.channels.length + ' channels to my dossier.');
      } else {
        bot.botkit.log('error getting channels', err);
      }
    })
  }

  return controller;
}