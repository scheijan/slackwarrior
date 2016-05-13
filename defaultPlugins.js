var os = require('os');
var request = require('request-promise');

var init = function (controller) {

  controller.hears(['hello', 'hi'], 'direct_message, direct_mention, mention', function(bot, message) {

      bot.api.reactions.add({
          timestamp: message.ts,
          channel: message.channel,
          name: 'robot_face',
      }, function(err, res) {
          if (err) {
              bot.botkit.log('Failed to add emoji reaction :(', err);
          }
      });

      controller.storage.users.get(message.user, function(err, user) {
          if (user && user.name) {
              bot.reply(message, 'Hello ' + user.name + '!!');
          } else {
              bot.reply(message, 'Hello.');
          }
      });
  });


  controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
      var name = message.match[1];
      controller.storage.users.get(message.user, function(err, user) {
          if (!user) {
              user = {
                  id: message.user,
              };
          }
          user.name = name;
          controller.storage.users.save(user, function(err, id) {
              bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
          });
      });
  });


  controller.hears(['say (.*) to (.*)'], 'direct_mention,mention', function(bot, message) {
      var what = message.match[1];
      var toWhom = message.match[2];
      
      var username = cleanUsername(toWhom);
      // var username = toWhom;

      bot.reply(message, ':robot_face: ' + what + ' ' + username);  
  });


  controller.hears(['tell (.*) that (.*)', 'tell @?(\\w+) (.*)'],  'direct_message,direct_mention,mention', function(bot, message) {
      var who = message.user;
      var toWhom = message.match[1];
      var what = message.match[2];
      // var username = cleanUsername(toWhom);
      var username = toWhom;
      if (username.indexOf('<') > -1) {
        // username = '@' + username;
        username = username.replace('@','');
        username = username.replace('<','');
        username = username.replace('>','');
      } else {
        if (username.indexOf('@') < 0) {
            username = '@' + username;
        }
      }

      bot.botkit.log('toWhom', toWhom);
      bot.botkit.log('username', username);

      bot.api.chat.postMessage({channel: username, text: 'Hey there ' + username + '!\n<@' + who + '> wanted me to tell you this:\n>>>' + what, as_user: true}, function (response, err) {
        bot.botkit.log('response', response, err);     // body...
      });
  });


  controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.users.get(message.user, function(err, user) {
      if (user && user.name) {
        bot.reply(message, 'Your name is ' + user.name);
      } else {
        bot.startConversation(message, function(err, convo) {
          if (!err) {
            convo.say('I do not know your name yet!');
            convo.ask('What should I call you?', function(response, convo) {
              convo.ask('You want me to call you `' + response.text + '`?', [
                {
                  pattern: 'yes',
                  callback: function(response, convo) {
                    // since no further messages are queued after this,
                    // the conversation will end naturally with status == 'completed'
                    convo.next();
                  }
                },
                {
                  pattern: 'no',
                  callback: function(response, convo) {
                    // stop the conversation. this will cause it to end with status == 'stopped'
                    convo.stop();
                  }
                },
                {
                  default: true,
                  callback: function(response, convo) {
                    convo.repeat();
                    convo.next();
                  }
                }
              ]);

              convo.next();

            }, {'key': 'nickname'}); // store the results in a field called nickname

            convo.on('end', function(convo) {
              if (convo.status == 'completed') {
                bot.reply(message, 'OK! I will update my dossier...');

                controller.storage.users.get(message.user, function(err, user) {
                  if (!user) {
                    user = {
                      id: message.user,
                    };
                  }
                  user.name = convo.extractResponse('nickname');
                  controller.storage.users.save(user, function(err, id) {
                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                  });
                });



              } else {
                // this happens if the conversation ended prematurely for some reason
                bot.reply(message, 'OK, nevermind!');
              }
            });
          }
        });
      }
    });
  });


  controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {
      bot.startConversation(message, function(err, convo) {

          convo.ask('Are you sure you want me to shutdown?', [
              {
                  pattern: bot.utterances.yes,
                  callback: function(response, convo) {
                      convo.say('Bye!');
                      convo.next();
                      setTimeout(function() {
                          process.exit();
                      }, 3000);
                  }
              },
          {
              pattern: bot.utterances.no,
              default: true,
              callback: function(response, convo) {
                  convo.say('*Phew!*');
                  convo.next();
              }
          }

          ]);
      });
  });


  controller.hears(['clear pins in (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
      var channelName = message.match[1];
      var channelID = controller.getChannelID(channelName);
      bot.botkit.log('found ID ' + channelID + ' for  ' + channelName);

      bot.reply(message, 'Please be very careful with this command, removing pinned items cannot be undone :bangbang:')
      bot.startConversation(message, function(err, convo) {

          convo.ask('Are you sure you want me to remove all pinned items in ' + channelName + '?', [
              {
                  pattern: bot.utterances.yes,
                  callback: function(response, convo) {
                    convo.say('As you wish...');

                    bot.api.pins.list({channel: channelID}, function (err, res) {
                      if (!err) {
                        // controler.storage.shownotes = [];
                        bot.botkit.log('found ' + res.items.length + ' pins to remove in ' + channelName);
                        convo.say('Deleting ' + res.items.length + ' pinned items in ' + channelName);
                        for (var i = res.items.length - 1; i >= 0; i--) {
                          var pin = res.items[i];
                          bot.botkit.log('going to remove', pin);
                          var ts;
                          if (pin.file && pin.file.id) {
                            bot.api.pins.remove({channel: channelID, file: pin.file.id}, function (err, res) {
                            if (err) {
                              bot.botkit.log('removing pin failed', err);
                            }
                          })
                          } else {
                            bot.api.pins.remove({channel: channelID, timestamp: pin.message.ts}, function (err, res) {
                            if (err) {
                              bot.botkit.log('removing pin failed', err);
                            }
                          })
                          }
                          
                        }
                        convo.say(':heavy_check_mark:');
                        convo.next(); 
                      } else {
                        bot.botkit.log('getting pins failed', err);
                      }
                      
                    })
                    
                  }
              },
          {
              pattern: bot.utterances.no,
              callback: function(response, convo) {
                  convo.say('Too late, I\'m deleting them anyway...');
                  convo.say('Deleting...');
                  convo.say('Nah, I was just kidding, your pinned items are safe :black_joker:');
                  convo.next();
              }
          },
           {
              
              default: true,
              callback: function(response, convo) {
                  convo.say('Hm? What did you say? I\'m sorry, I didn\'t understand you... I guess I will take that as a "yes" and delete all your pinned items...');
                  convo.say('Deleting...');
                  convo.say('Nah, I was just kidding, your pinned items are safe :black_joker:');
                  convo.next();
              }
          }
          ]);
      });
  });


  controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'], 'direct_message,direct_mention,mention', function(bot, message) {
    var os = require('os');

    var hostname = os.hostname();
    var uptime = formatUptime(process.uptime());

    bot.reply(message,
        ':robot_face: I am a bot named <@' + bot.identity.name +
         '>. I have been running for ' + uptime + ' on ' + hostname + '.');
  });


  controller.hears(['urban dictionary (?:know|say|think|tell) (?:about|on) (.*[^\\?])\\?', 'urban dictionary (.*)'], 'direct_message,mention,direct_mention', function(bot, message) {
    var searchTerm = message.match[1];
    var url = 'http://api.urbandictionary.com/v0/define?term=' + searchTerm;
    bot.botkit.log('sending url', url);
    var options = {
      uri: url,
      json: true // Automatically parses the JSON string in the response
    };

    request(options).then(function (res) {
      bot.botkit.log('urban dictionary said this', res);
      bot.reply(message, res.list[0].permalink)         
    }).catch(function (err) {
      bot.botkit.log('urban dictionary returned an error', err)          
      bot.reply(message, 'Looks like the Urban Dictionary has no idea what you\'re talking about... and I can\'t say I\'ve seen that happen very often...')
    });
  });


  controller.hears(['my id'], 'direct_message', function(bot, message) {
    controller.storage.users.get(message.user, function (err, user) {
      if (!err) {
        bot.reply(message, 'Your ID is ' + user.id);
      } else {
        bot.reply(message, 'I did not find you');
      }
    })
  });


  controller.hears(['channel info (.*)', 'channel id (.*)'], 'direct_message', function(bot, message) {
    var searchChannel = message.match[1]
    var c = controller.getChannelByName(searchChannel);
    if (c && c.id) {
      bot.reply(message, 'The ID of the channel "' + searchChannel + '" is ' + c.id);
    } else {
      bot.reply(message, 'I am so sorry, I was not able to find any information on a channel named "' + searchChannel + '"');
    }
  });


  controller.hears(['spook (.*) as (.*) icon (.*) text (.*)'], 'direct_message', function(bot, message) {
    var username = message.match[1];
    var alias = message.match[2];
    var emoji = message.match[3];
    var text = message.match[4];


    if (username.indexOf('<') > -1) {
        // username = '@' + username;
        username = username.replace('@','');
        username = username.replace('<','');
        username = username.replace('>','');
      } else {
        if (username.indexOf('@') < 0) {
            username = '@' + username;
        }
      }
    bot.botkit.log('username', username)
    var answer = {text: text, as_user: false, channel: username, username: alias, icon_emoji: emoji}
    bot.api.chat.postMessage(answer, function (err, response) {
      bot.botkit.log(err, response)
    })
  })


  function formatUptime(uptime) {
      var unit = 'second';
      if (uptime > 60) {
          uptime = uptime / 60;
          unit = 'minute';
      }
      if (uptime > 60) {
          uptime = uptime / 60;
          unit = 'hour';
      }
      if (uptime != 1) {
          unit = unit + 's';
      }

      uptime = uptime + ' ' + unit;
      return uptime;
  }

  function cleanUsername(username) {
    var result = username;
    if (result.indexOf('<') > -1) {
      result = result.replace('>','');
      result = result.replace('<','');
    } else {
      if (result.indexOf('@') > -1) {
        result = result.substring(1);
      }
    }
    return result;
  }
}

exports.init = init;

