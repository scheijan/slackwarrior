// this function decorates a given controller with additional functions and returns the controller obj
exports.decorate = function (controller, bot) {

  // init global arrays for users/channels
  controller.users = []
  controller.channels = []
    
  // get the user obj for the given username
  controller.getUserByName = function(userName) {
    for (var i = controller.users.length - 1; i >= 0; i--) {
      var u = controller.users[i];
      if (u.name === userName) {
        return u;
      }
    }
  }

  // get the user obj from the given user ID
  controller.getUserByID = function(id) {
    for (var i = controller.users.length - 1; i >= 0; i--) {
      var u = controller.users[i];
      if (u.id === id) {
        return u;
      }
    }
  }

  // get the channel obj from the given channel name
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

  // get the channel obj from the given channel ID
  controller.getChannelByID = function(id) {
    for (var i = controller.channels.length - 1; i >= 0; i--) {
      var c = controller.channels[i];
      if (c.id === id) {
        return c;
      }
    }
  }

  // get the channel ID from a given channel name
  controller.getChannelID = function(channelName) {
    // first we need to exctract the name (it might have been a link)
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
  }

  // initialize the local user storage and user array on the controller
  controller.initUsers = function(bot) {
    bot.api.users.list({}, function (err, res) {
      if (!err) {
        bot.botkit.log('got users', res.members.length);
        for (var i = res.members.length - 1; i >= 0; i--) {
          var u = res.members[i];
          // add the user to the list on the controller
          controller.users.push(u);
          // if we already have the user this is a noop
          controller.storage.users.get(u.id, function(err, user) {
            if (user) {
              // bot.botkit.log('I already have ' + user.id + ' in my dossier.');
            } else {
              // if we don't have the user already, add it to the local storage
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

  // save a single channel to the local storage if it's not in there yet
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

  // save all channels to local storage and to the array on the controller
  controller.initChannels = function(bot) {
    bot.api.channels.list({}, function (err, res) {
      if (!err) {
        bot.botkit.log('got channels', res.channels.length);
        
        for (var i = 0; i < res.channels.length; i++) {
          var c = res.channels[i];
          // add the channel to the array on the controller
          controller.channels.push(c);
          // save the channel in local storage
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