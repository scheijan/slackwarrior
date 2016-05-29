'use strict'
// define a method "trim" on the String prototype
if (typeof(String.prototype.trim) === 'undefined') {
  String.prototype.trim = function () {
    return String(this).replace(/^\s+|\s+$/g, '');
  };
}

// define a methog "padRight" on the String prototype
String.prototype.padRight = function (l, c) {
  return this + Array(l - this.length + 1).join(c || ' ')
}

// define a methog "padLeft" on the String prototype
String.prototype.padLeft = function (l, c) {
  let str = this;
  while (str.length < l) {
    str = c + str;
  }
  return str;
}

// this function decorates a given controller with additional functions and returns the controller obj
exports.decorate = function (contr) {
  const controller = contr;
  // init global arrays for users/channels
  controller.users = []
  controller.channels = []

  // get the user obj for the given username
  controller.getUserByName = (userName) => {
    for (let i = controller.users.length - 1; i >= 0; i--) {
      const u = controller.users[i];
      if (u.name === userName) {
        return u;
      }
    }
    return undefined;
  }

  // get the user obj from the given user ID
  controller.getUserByID = (id) => {
    for (let i = controller.users.length - 1; i >= 0; i--) {
      const u = controller.users[i];
      if (u.id === id) {
        return u;
      }
    }
    return undefined;
  }

  // get the channel obj from the given channel name
  controller.getChannelByName = (chan) => {
    let channelName = chan;
    if (channelName.indexOf('#') > -1) {
      channelName = channelName.replace('#', '');
    }
    for (let i = controller.channels.length - 1; i >= 0; i--) {
      const c = controller.channels[i];
      if (c.name === channelName) {
        return c;
      }
    }
    return undefined;
  }

  // get the channel obj from the given channel ID
  controller.getChannelByID = (id) => {
    for (let i = controller.channels.length - 1; i >= 0; i--) {
      const c = controller.channels[i];
      if (c.id === id) {
        return c;
      }
    }
    return undefined;
  }

  // get the channel ID from a given channel name
  controller.getChannelID = (chan) => {
    let channelName = chan;
    // first we need to exctract the name (it might have been a link)
    if (channelName.indexOf('#') > -1) {
      channelName = channelName.replace('#', '');
      channelName = channelName.replace('<', '');
      channelName = channelName.replace('>', '');
    }

    if (channelName.indexOf('|') > -1) {
      channelName = channelName.split('|')[0]
    }

    const channel = controller.getChannelByName(channelName);
    if (channel) {
      return channel.id;
    }
    return undefined;
  }

  // initialize the local user storage and user array on the controller
  controller.initUsers = function (bot) {
    bot.api.users.list({}, (err, res) => {
      if (!err) {
        bot.botkit.log('got users', res.members.length);
        for (let i = res.members.length - 1; i >= 0; i--) {
          const u = res.members[i];
          // add the user to the list on the controller
          controller.users.push(u);
          // if we already have the user this is a noop
          controller.storage.users.get(u.id, (getErr, user) => {
            if (user) {
              // bot.botkit.log('I already have ' + user.id + ' in my dossier.');
            } else {
              // if we don't have the user already, add it to the local storage
              controller.storage.users.save(u, (saveErr) => {
                if (!saveErr) {
                  // bot.botkit.log('added user', id);
                } else {
                  bot.botkit.log('error adding user', saveErr);
                }
              });
            }
          });
        }
        bot.botkit.log(`I have ${res.members.length} users in my dossier now.`);
      } else {
        bot.botkit.log('error getting users', err);
      }
    })
  }

  // save a single channel to the local storage if it's not in there yet
  function initChannel(bot, channel) {
    controller.storage.channels.get(channel.id, (err, c) => {
      if (c) {
        // bot.botkit.log('I already have ' + channel.id + ' in my dossier.');
      } else {
        controller.storage.channels.save(channel, (saveErr) => {
          if (!saveErr) {
            // bot.botkit.log('added channel', id);
          } else {
            bot.botkit.log('error adding channel', saveErr);
          }
        });
      }
    })
  }

  // save all channels to local storage and to the array on the controller
  controller.initChannels = function (bot) {
    bot.api.channels.list({}, (err, res) => {
      if (!err) {
        bot.botkit.log('got channels', res.channels.length);

        for (let i = 0; i < res.channels.length; i++) {
          const c = res.channels[i];
          // add the channel to the array on the controller
          controller.channels.push(c);
          // save the channel in local storage
          initChannel(bot, c)
        }
        bot.botkit.log(`I have added ${res.channels.length} channels to my dossier.`);
      } else {
        bot.botkit.log('error getting channels', err);
      }
    })
  }

  return controller;
}
