var request = require('request');
var cheerio = require('cheerio');
var Promise = require('bluebird');
Promise.promisifyAll(require("request"));

var init = function (controller) {

  function shownotes(bot, message, channelName) {
    bot.botkit.log('creating shownotes for channel ' + channelName);
    var channelID = controller.getChannelID(channelName);
    var errorMessage = 'Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you want me get the shownotes for? I read "' + channelName + '", but my eyes aren\'t what they used to be... :eyeglasses:';
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!channel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, errorMessage);
      } else {
        if (channel.links && channel.links.length > 0) {
          urls2osf(channel, message, bot)
        } else {
          bot.reply(message, 'I\'m sorry, but I can\'t find any links for ' + channelName);
        }
      }
    });
  }
  
  controller.hears(['shownotes (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    shownotes(bot, message, channelName);
  });

  controller.hears(['start listening to (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    bot.botkit.log('listening to channel ' + channelName);
    var channelID = controller.getChannelID(channelName);
    var errorMessage = 'Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you want me to listen to? I read "' + channelName + '", but my eyes aren\'t what they used to be... :eyeglasses:';
    // bot.botkit.log('channelID', channelID);
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!channel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, errorMessage);
      } else {
        if (channel.listening) {
          bot.reply(message, 'I\'m already listening to ' + channelName + '. :microphone:');
        } else {
          channel.listening = true;
          controller.storage.channels.save(channel, function(err, id) {
            if (err) {
              bot.reply(message, errorMessage);
            } else {
              bot.reply(message, 'Got it. I will listen to ' + channelName + ' from now on, until someone asks me to stop again. :microphone:');
            }
          });
        }
      }
    });
  });

  controller.hears(['stop listening to (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var channelName = message.match[1];
    bot.botkit.log('listening to channel ' + channelName);
    var channelID = controller.getChannelID(channelName);
    var errorMessage = 'Ummm... Sorry, but that did not work as expected... Did I maybe read that wrong? Which channel did you want me to stop listening to? I read "' + channelName + '", but my eyes aren\'t what they used to be... :eyeglasses:';
    // bot.botkit.log('channelID', channelID);
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!channel) {
        bot.botkit.log('getting channel failed', err, channel);
        bot.reply(message, errorMessage);
      } else {
        if (channel.listening) {
          channel.listening = false;
          controller.storage.channels.save(channel, function(err, id) {
            if (err) {
              bot.reply(message, errorMessage);
            } else {
              bot.reply(message, 'Ok, ok, I will stop listening to ' + channelName + '. And yes, no worries, I know the rules: What happens in ' + channelName + ' stays in ' + channelName + ' :hear_no_evil:');
              
              bot.startConversation(message, function(err, convo) {
                if (!err) {
                  convo.ask('Do you want me to create the shownotes for ' + channelName + '?', [
                    {
                      pattern: 'yes',
                      callback: function(response, convo) {
                        // since no further messages are queued after this,
                        // the conversation will end naturally with status == 'completed'
                        shownotes(bot, message, channelName);
                        convo.next();
                      }
                    },
                    {
                      pattern: 'no',
                      callback: function(response, convo) {
                        convo.say('Alright, as you wish. If you change your mind later just ask me for "shownotes ' + channelName + '" and I will get them for you.');
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

                }
              })


            }
          });
        } else {
          bot.reply(message, 'Well, I was not listening to ' + channelName + ' so far. But if you want me to, you just have to ask me to start... :robot_face:');
        }
      }
    });
  });

  controller.hears(['(.*)'], 'ambient', function(bot, message) {
    var channelID = message.channel;
    controller.storage.channels.get(channelID, function(err, channel) {
      if (!err) {
        if (channel.listening) {
          if (!channel.links) {
            channel.links = [];
          }

          var text = message.text;
          if (text.indexOf('<') > -1 && text.indexOf('>') > -1 && text.indexOf('.') > -1) {
            //  extract the url from the message
            var re = new RegExp("\\<([^\\<\\>]+\\.+[^\\<\\>]+)\\>", 'gi');
            var urls = text.match(re);
            // bot.botkit.log('urls', urls);
            if (urls && urls.length > 0) {
              for (var i = 0; i <= urls.length -1; i++) {
                var url = urls[i];
                bot.botkit.log('working on link', url);
                if (url.indexOf('|') > -1) {
                  url = url.split('|')[0]
                }
                if (url.indexOf('>') > -1) {
                    url = url.split('>')[0]
                }
                if (url.indexOf('<') > -1) {
                    url = url.split('<')[1]
                }


                bot.botkit.log('working on link', url);
                if (channel.links.indexOf(url) < 0) {
                  channel.links.push(url);
                  bot.botkit.log('saved a link', url);
                }
              }

              controller.storage.channels.save(channel, function(err, id) {
                if (err) {
                  bot.botkit.log('error saving link', err, id);
                } else {
                  bot.botkit.log('saved ' + channel.links.length + ' links');
                  // start conversation
                }
              });
            }
          }
        }
      } else {
        bot.botkit.log('getting channel failed', err, channel);
      }
    });
  });

  function urls2osf(channel, message, bot) {
    var urls = channel.links;
    var promises = [];
    // loop over all pins and fill an array with promises of get requests to the urls
    for (var i = 0; i <= urls.length -1; i++) {

      promises.push(request.getAsync({uri: urls[i], simple: false, timeout: 10000}));
    }

    bot.botkit.log('got ' + urls.length + ' URLs to check');
    bot.reply(message, 'Please hold on just a second while I get some titles for those ' + urls.length + ' URLs you got there...')

    Promise.all(promises.map(function(promise) {
      return promise.reflect();
        })).then(function (results) {
      bot.botkit.log('got ' + results.length + ' promises to check');
      var result = '';
      for (var i = 0; i <= results.length -1; i++) {
        var inspection = results[i];
        var title;
        // try to extract the title from the body of the response
        try {
          // bot.botkit.log('inspection', inspection);
          var res = inspection.value();
          // bot.botkit.log('res', res);
          $ = cheerio.load(res.body, {normalizeWhitespace: true});
          var title = $('title').first().text();
          // bot.botkit.log('title', title);
          
        // if we get an error from cheerio set a default title
        } catch(err) {
          bot.botkit.log('cheerio error', err);
          title = '__MISSING_TITLE__';
        }

        // if we still have no title here set a default
        if (!title) {
          title = '__MISSING_TITLE__';
        }
        // concat the title and the corresponding URL and add that to the result
        var line = title + ' <' + urls[i] + '>\n';
        bot.botkit.log('adding line', line);
        result = result + line;
        
      }

      // upload the result as a snipped to the channel the bot was asked in
      var d = new Date();
      var date = d.toLocaleString();
      bot.api.files.upload({
                      content: result,
                      channels: message.channel,
                      title: 'Shownotes for #' + channel.name + ' on ' + date
                  }, function (err, res) {
                        // bot.botkit.log('res', res);
                        if (err) {
                          bot.botkit.log('err', err);
                          bot.reply(message, 'There was some problem uploading the shownotes file, please contact @scheijan and kick his ass...')
                        } else {
                          bot.reply(message, 'There you are, I hope this helps :robot_face:')
                        }
                        
                  })

     }).catch(function (err) {
      bot.botkit.log('promise error', err);
      bot.reply(message, 'There was some problem getting the titles for the shownotes, please contact @scheijan and kick his ass...')
    })
  }
}

exports.init = init;

